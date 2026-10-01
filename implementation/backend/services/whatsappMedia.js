/**
 * whatsappMedia — traer al expediente las fotos que el cliente mandó por WhatsApp.
 *
 * El enlace de subida dice qué falta, pero muchos clientes no lo usan: mandan
 * las fotos al WhatsApp de la empresa. Colocarlas era bajarlas del móvil una a
 * una y soltarlas en su casilla. Aquí se leen del propio chat, se bajan y se
 * entregan al REPARTIDOR (BuzonFotos), que propone el apartado de cada una y
 * espera a que una persona lo confirme — el mismo camino que soltarlas a mano.
 *
 * Es la opción MANUAL (un botón en el gestor de documentación). No hay nada que
 * escuche ni que se dispare solo: se lee cuando alguien lo pide.
 *
 * REGLA — se habla con WhatsApp Web DIRECTAMENTE (`WAWebCollections`), nunca con
 * `getChatById().fetchMessages()` ni con `Message.downloadMedia()` de la
 * librería: las dos pasan por el `serialize()` que WhatsApp rompió (ver "Lo que
 * WhatsApp rompió" en CLAUDE.md). Y ninguna de las llamadas de aquí está en el
 * camino de ENVÍO — las que dejaban la sesión mandando sin ACK eran
 * `getChatById`/`sendSeen`, y aquí no se usa ninguna.
 *
 * REGLA — de UNA en UNA y con plazo. Es el mismo Chrome del que depende todo lo
 * automático de la app: las lecturas van en serie (`enSerie`) y ninguna espera
 * va sin plazo (`conPlazo`).
 *
 * REGLA — solo se baja lo que salió de un chat de ESTE expediente. La descarga
 * recibe un id de mensaje, y ese id lleva dentro el chat: se comprueba contra
 * los chats que se acaban de leer para esta oportunidad (`permitir`), o el
 * botón serviría para bajar cualquier foto de cualquier conversación.
 *
 * REGLA — no se CREAN chats. Un número con el que nunca se ha hablado no tiene
 * nada que traer, y abrir la conversación por mirar llenaría la lista del móvil
 * (mismo criterio que `chatAbierto` en whatsappLabels).
 */

const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const whatsappService = require('./whatsappService');
const botVinculos = require('./botVinculos');
const { _conPlazo: conPlazo } = require('./whatsappLabels');
const {
    CLIENTE_CONTACT_FIELDS, PARTNER_CONTACT_FIELDS, contactosDeCliente, contactosDePartner,
} = require('./notifyContacts');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

const CONFIG = {
    // Leer un chat puede obligar a WhatsApp Web a traer mensajes antiguos del
    // teléfono, que es lento. Un chat que no responde en este plazo se da por
    // no leído; los demás siguen.
    plazoListarMs: num(process.env.WA_MEDIA_PLAZO_LISTAR_MS, 45_000),
    plazoBajarMs: num(process.env.WA_MEDIA_PLAZO_BAJAR_MS, 90_000),
    // Topes de lo que se carga de un chat. Un chat de instalador puede tener
    // miles de mensajes: sin tope, "los últimos 90 días" serían todos.
    maxMensajes: num(process.env.WA_MEDIA_MAX_MENSAJES, 1500),
    maxLotes: num(process.env.WA_MEDIA_MAX_LOTES, 40),
    // El adjunto viaja en base64 desde Chrome: un vídeo de 50 MB son 67 MB de
    // texto por el protocolo de depuración. Por encima, se dice y no se baja.
    maxMb: num(process.env.WA_MEDIA_MAX_MB, 50),
    maxDias: 180,
    maxContactos: 12,
    pausaMs: num(process.env.WA_MEDIA_PAUSA_MS, 400),
    // Solo en DESARROLLO y con WhatsApp apagado: fotos de ejemplo en vez de un
    // chat, para poder probar la pantalla sin tocar la sesión real.
    simulado: ['1', 'true'].includes(String(process.env.WA_MEDIA_SIMULADO || '').toLowerCase())
        && process.env.NODE_ENV !== 'production',
};

const espera = (ms) => new Promise(r => setTimeout(r, ms));

function error(mensaje, status = 400) {
    const e = new Error(mensaje);
    e.status = status;
    return e;
}

// ─────────────────────────────────────────────────────────────────────────────
// Puro — sin WhatsApp ni base de datos (probado en scripts/test_whatsapp_media.js)
// ─────────────────────────────────────────────────────────────────────────────

/** Los 9 últimos dígitos: así casa el mismo número con y sin prefijo. */
const nueve = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : null; };

/**
 * El chat al que pertenece un mensaje, sacado de su id.
 * `false_34612345678@c.us_3EB0C0…` → `34612345678@c.us` (también `@lid`).
 */
function chatDeMsgId(msgId) {
    const m = /^(?:true|false)_([^_@]+@[a-z.]+)_([A-Za-z0-9]+)/.exec(String(msgId || ''));
    return m ? m[1] : null;
}

const EXT_MIME = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    // Notas de voz y audios: los lee la skill `alta-oportunidad` (el instalador
    // dice a menudo de viva voz lo que no escribe: «son radiadores»).
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
};
const extDeMime = (mime) => EXT_MIME[String(mime || '').split(';')[0].trim().toLowerCase()] || 'bin';

/** Fecha y hora de Madrid como `20260928-114512`. */
function sello(tSeg) {
    const f = new Date((Number(tSeg) || 0) * 1000);
    const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(f).map(x => [x.type, x.value]));
    return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
}

/**
 * Nombre del fichero que se entrega al repartidor. Un documento conserva el
 * suyo (el cliente lo llamó así por algo); una foto o un vídeo no tienen, y se
 * le pone la fecha en la que llegó — `WA-20260928-114512-3EB0C0.jpg` se sigue
 * reconociendo cuando se mira la carpeta.
 */
function nombreArchivo({ id, t, mimetype, filename, tipo }) {
    const ext = extDeMime(mimetype);
    if (tipo === 'document' && filename) {
        const limpio = String(filename).replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 120);
        if (limpio) return /\.[a-z0-9]{2,5}$/i.test(limpio) ? limpio : `${limpio}.${ext}`;
    }
    const corto = String(id || '').replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'wa';
    return `WA-${sello(t)}-${corto}.${ext}`;
}

/**
 * De todo lo que el chat trae, lo que tiene sentido llevar a un expediente:
 * fotos, vídeos y documentos que sean PDF, imagen o vídeo. Fuera lo nuestro
 * (`fromMe`: la propuesta que le mandamos no es documentación suya), lo de
 * "ver una vez" (WhatsApp no deja bajarlo) y lo anterior al corte.
 */
function filtrarMedia(crudos, { corteSeg, tel = null, chatId = null, maxBytes = CONFIG.maxMb * 1024 * 1024 } = {}) {
    const out = [];
    for (const m of crudos || []) {
        if (!m || !m.id) continue;
        if (!['image', 'video', 'document'].includes(m.tipo)) continue;
        if (m.fromMe || m.viewOnce) continue;
        if ((Number(m.t) || 0) < corteSeg) continue;
        const mime = String(m.mimetype || '').toLowerCase();
        if (m.tipo === 'document' && !/^(image\/|video\/|application\/pdf)/.test(mime)) continue;
        out.push({
            id: m.id,
            tipo: m.tipo === 'document' ? (mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'pdf') : m.tipo,
            // Un documento con imagen dentro es una foto que viene SIN comprimir
            // (el cliente la mandó "como documento"): se dice, porque es la buena
            // para leer una placa.
            original: m.tipo === 'document',
            t: Number(m.t) || 0,
            mimetype: mime,
            size: Number(m.size) || null,
            caption: String(m.caption || ''),
            thumb: m.thumb || null,
            grande: !!(m.size && m.size > maxBytes),
            nombre: nombreArchivo(m),
            tel, chatId,
        });
    }
    return out.sort((a, b) => b.t - a.t);
}

/**
 * Une los contactos de un expediente en una lista por NÚMERO.
 *
 * `listas` = [{ tel, nombre, rol, detalle }]. `rol` ∈ titular | propietario |
 * contacto | instalador | vinculo.
 *
 * REGLA — lo recomendado es lo del CLIENTE. El chat de un instalador tiene fotos
 * de todas sus obras (puede llevar treinta a la vez): se ofrece, pero no viene
 * marcado, y si el mismo número está en las dos fichas se AVISA — hay fichas de
 * cliente con el móvil del instalador, y ahí "del cliente" no es verdad.
 */
function unirContactos(listas) {
    const porTel = new Map();
    for (const c of listas || []) {
        const t = nueve(c?.tel);
        if (!t) continue;
        if (!porTel.has(t)) porTel.set(t, { tel: t, nombres: [], roles: new Set(), detalles: [], fijado: false });
        const x = porTel.get(t);
        if (c.nombre && !x.nombres.includes(c.nombre)) x.nombres.push(c.nombre);
        if (c.detalle && !x.detalles.includes(c.detalle)) x.detalles.push(c.detalle);
        x.roles.add(c.rol);
        if (c.fijado) x.fijado = true;
    }
    const DEL_CLIENTE = ['titular', 'propietario', 'contacto'];
    const ORDEN = ['titular', 'propietario', 'contacto', 'vinculo', 'instalador'];
    return [...porTel.values()].map(x => {
        const roles = ORDEN.filter(r => x.roles.has(r));
        const delCliente = roles.some(r => DEL_CLIENTE.includes(r));
        const instalador = roles.includes('instalador');
        return {
            tel: x.tel,
            nombre: x.nombres[0] || 'Chat vinculado',
            detalle: x.detalles.join(' · '),
            roles,
            recomendado: !instalador && (delCliente || x.fijado),
            aviso: instalador && delCliente
                ? 'Este número también es del instalador: sus fotos pueden ser de otra obra.'
                : instalador ? 'Chat de un instalador: puede traer fotos de otras obras suyas.' : null,
        };
    }).sort((a, b) => ORDEN.indexOf(a.roles[0]) - ORDEN.indexOf(b.roles[0]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Contactos del expediente (solo base de datos: no toca WhatsApp)
// ─────────────────────────────────────────────────────────────────────────────

async function contactosDeOportunidad(opp) {
    const listas = [];

    if (opp.cliente_id) {
        const { data: cli } = await supabase.from('clientes')
            .select(`${CLIENTE_CONTACT_FIELDS}, contacto_es_partner`)
            .eq('id_cliente', opp.cliente_id).maybeSingle();
        for (const c of contactosDeCliente(cli)) {
            // La persona de contacto puede ser el comercial del partner
            // (`contacto_es_partner`): entonces no es del cliente.
            const rol = c.id === 'cli' ? 'titular'
                : c.id === 'cli_contacto' ? (cli?.contacto_es_partner ? 'instalador' : 'contacto')
                    : 'propietario';
            listas.push({ tel: c.tlf, nombre: c.nombre, rol, detalle: c.tipo });
        }
    }

    const partnerIds = [...new Set([opp.instalador_asociado_id, opp.prescriptor_id].filter(Boolean))];
    if (partnerIds.length) {
        const { data: ps } = await supabase.from('prescriptores')
            .select(`id_empresa, ${PARTNER_CONTACT_FIELDS}`).in('id_empresa', partnerIds);
        for (const p of ps || []) {
            const empresa = p.acronimo || p.razon_social || 'Instalador';
            for (const c of contactosDePartner(p)) {
                listas.push({
                    tel: c.tlf, rol: 'instalador',
                    nombre: c.general ? empresa : (c.nombre || c.etiqueta || empresa),
                    detalle: c.general ? 'Teléfono de la empresa' : `${empresa}${c.cargo ? ` · ${c.cargo}` : ''}`,
                });
            }
        }
    }

    // Los chats que alguien ya ató a esta obra (fijado a mano, o aprendido por el
    // bot): pueden ser de un número que no está en ninguna ficha — la hija del
    // titular que manda las fotos desde su móvil.
    for (const v of await botVinculos.chatsDe(opp.id)) {
        listas.push({
            tel: v.telefono, rol: 'vinculo', fijado: !!v.fijado,
            nombre: 'Chat vinculado',
            detalle: v.fijado ? 'Vinculado a esta obra a mano' : 'Vinculado a esta obra por el asistente',
        });
    }

    return unirContactos(listas);
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Web — lo que corre DENTRO de la página
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable no-undef -- estas dos funciones se ejecutan en el navegador */

/**
 * Lee un chat: lo busca por su número (o por su `@lid`, sin crearlo), carga
 * mensajes antiguos hasta el corte y devuelve los adjuntos, sin serializar
 * nada de la librería.
 */
async function LEER_CHAT(clasico, corteSeg, maxMensajes, maxLotes) {
    const C = window.require('WAWebCollections');
    if (!C || !C.Chat) return { error: 'WhatsApp Web todavía no ha cargado sus conversaciones.' };
    let chat = C.Chat.get(clasico);
    if (!chat) {
        try {
            const wid = window.require('WAWebWidFactory').createWid(clasico);
            const lid = window.require('WAWebApiContact').getCurrentLid(wid);
            if (lid) chat = C.Chat.get(lid._serialized || String(lid));
        } catch (e) { /* sin lid conocido: no hay conversación con ese número */ }
    }
    if (!chat || !chat.msgs) return { chatId: null };

    const lista = () => (chat.msgs.getModelsArray ? chat.msgs.getModelsArray() : []);
    const masViejo = () => { const a = lista(); return a.length ? (Number(a[0].t) || 0) : 0; };
    const Cargar = window.require('WAWebChatLoadMessages');
    let lotes = 0;
    let sinMas = false;
    while (lista().length < maxMensajes && lotes < maxLotes && (!lista().length || masViejo() > corteSeg)) {
        let nuevos;
        try { nuevos = await Cargar.loadEarlierMsgs({ chat }); } catch (e) { break; }
        lotes++;
        if (!nuevos || !nuevos.length) { sinMas = true; break; }
    }

    const media = [];
    for (const m of lista()) {
        if (m.type !== 'image' && m.type !== 'video' && m.type !== 'document') continue;
        // En los mensajes con foto o vídeo, `body` es la miniatura en base64.
        const body = typeof m.body === 'string' ? m.body : '';
        const thumb = m.type !== 'document' && body.length > 200 && body.length < 200000
            && /^[A-Za-z0-9+/=]+$/.test(body.slice(0, 300)) ? body : null;
        media.push({
            id: m.id ? (m.id._serialized || String(m.id)) : null, tipo: m.type, t: Number(m.t) || 0,
            fromMe: !!(m.id && m.id.fromMe), mimetype: m.mimetype || '',
            filename: m.filename || null, size: Number(m.size) || null,
            caption: String(m.caption || '').slice(0, 300), viewOnce: !!m.isViewOnce, thumb,
        });
    }
    return { chatId: chat.id._serialized || String(chat.id), total: lista().length, lotes, sinMas, masViejo: masViejo(), media };
}

/**
 * Baja UN adjunto. Es lo que hace `Message.downloadMedia()` de whatsapp-web.js
 * 1.34.7, sin pasar por el modelo serializado de la librería.
 */
async function BAJAR(msgId, maxBytes) {
    const C = window.require('WAWebCollections');
    // En los chats `@lid` la clave del mensaje no trae `_serialized` y `Msg.get`
    // con la cadena no la encuentra: se busca también por su forma de texto.
    let msg = C.Msg.get(msgId)
        || C.Msg.getModelsArray().find(x => x.id && String(x.id) === msgId);
    if (!msg) {
        try { const r = await C.Msg.getMessagesById([msgId]); msg = r && r.messages && r.messages[0]; } catch (e) { /* no está */ }
    }
    if (!msg || !msg.mediaData) return { error: 'no_encontrado' };
    if (msg.size && msg.size > maxBytes) return { error: 'grande', size: msg.size };
    // REUPLOADING: WhatsApp ya no la tiene y está pidiéndosela al teléfono.
    if (msg.mediaData.mediaStage === 'REUPLOADING') return { error: 'caducado' };
    if (msg.mediaData.mediaStage !== 'RESOLVED') {
        try { await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 }); } catch (e) { /* se intenta igual */ }
    }
    const stage = String(msg.mediaData.mediaStage || '');
    if (stage.includes('ERROR') || stage === 'FETCHING') return { error: 'caducado' };
    try {
        const qpl = { addAnnotations() { return this; }, addPoint() { return this; } };
        const buf = await window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
            directPath: msg.directPath, encFilehash: msg.encFilehash, filehash: msg.filehash,
            mediaKey: msg.mediaKey, mediaKeyTimestamp: msg.mediaKeyTimestamp, type: msg.type,
            // Sin el tipo, WhatsApp rechaza la descarga ("Unexpected mimetype
            // application/octet-stream for media type image"): medido 30/09/2026.
            mimetype: msg.mimetype,
            signal: new AbortController().signal, downloadQpl: qpl,
        });
        const data = await window.WWebJS.arrayBufferToBase64Async(buf);
        return { data, mimetype: msg.mimetype || '', filename: msg.filename || null, t: Number(msg.t) || 0, tipo: msg.type };
    } catch (e) {
        if (e && e.status === 404) return { error: 'caducado' };
        return { error: 'fallo', detalle: String((e && e.message) || e).slice(0, 200) };
    }
}

/* eslint-enable no-undef */

// ─────────────────────────────────────────────────────────────────────────────
// Orquestación
// ─────────────────────────────────────────────────────────────────────────────

// Todo lo que toca el Chrome, en fila: dos personas pulsando a la vez no pueden
// convertirse en dos lecturas simultáneas contra la sesión de la que depende
// todo lo automático de la app.
let cola = Promise.resolve();
function enSerie(fn) {
    const r = cola.then(fn, fn);
    cola = r.catch(() => {});
    return r;
}

// Chats leídos para cada oportunidad: la descarga solo acepta mensajes de ellos.
const permisos = new Map();   // oportunidadId → { chats: Set, hasta }
const VIGENCIA_PERMISO_MS = 3 * 3600_000;
function permitir(oppId, chatIds) {
    const prev = permisos.get(oppId);
    const chats = new Set(prev && prev.hasta > Date.now() ? prev.chats : []);
    chatIds.forEach(c => chats.add(c));
    permisos.set(oppId, { chats, hasta: Date.now() + VIGENCIA_PERMISO_MS });
}
function permitido(oppId, chatId) {
    const p = permisos.get(oppId);
    return !!(p && p.hasta > Date.now() && p.chats.has(chatId));
}

function clienteWa() {
    const c = whatsappService.getClient?.();
    return c && c.pupPage ? c : null;
}

function noConectado() {
    return error('WhatsApp no está conectado. Revísalo en Ajustes → WhatsApp y vuelve a intentarlo.', 503);
}

/** Estado para la pantalla: ¿se puede leer ahora mismo? */
function disponible() {
    if (clienteWa()) return { ok: true, simulado: false };
    if (CONFIG.simulado) return { ok: true, simulado: true };
    return { ok: false, simulado: false, motivo: 'WhatsApp no está conectado ahora mismo.' };
}

/**
 * Lista lo que ha llegado por WhatsApp de esos números en los últimos `dias`.
 * No baja nada: solo metadatos y miniatura.
 */
async function buscar(opp, { telefonos, dias }) {
    const d = Math.min(Math.max(Math.round(Number(dias) || 30), 1), CONFIG.maxDias);
    const corteSeg = Math.floor(Date.now() / 1000) - d * 86400;
    const tels = [...new Set((telefonos || []).map(nueve).filter(Boolean))].slice(0, CONFIG.maxContactos);
    if (!tels.length) throw error('Elige al menos un contacto.');

    let chats = [];
    let media = [];
    const client = clienteWa();
    if (!client && CONFIG.simulado) {
        ({ chats, media } = simulacion(tels, corteSeg));
    } else {
        if (!client) throw noConectado();
        await enSerie(async () => {
            let plazosSeguidos = 0;
            for (const tel of tels) {
                try {
                    const r = await conPlazo(
                        client.pupPage.evaluate(LEER_CHAT, `34${tel}@c.us`, corteSeg, CONFIG.maxMensajes, CONFIG.maxLotes),
                        CONFIG.plazoListarMs, 'leer el chat');
                    plazosSeguidos = 0;
                    if (r && r.error) { chats.push({ tel, estado: 'error', error: r.error }); continue; }
                    if (!r || !r.chatId) { chats.push({ tel, estado: 'sin_chat' }); continue; }
                    const items = filtrarMedia(r.media, { corteSeg, tel, chatId: r.chatId });
                    chats.push({
                        tel, chatId: r.chatId, estado: 'ok', n: items.length,
                        // Si no se llegó al corte, lo más antiguo del periodo no se ha
                        // podido cargar: se dice, o un "no hay nada" sería mentira.
                        incompleto: !r.sinMas && r.masViejo > corteSeg,
                    });
                    media.push(...items);
                } catch (e) {
                    chats.push({ tel, estado: 'error', error: e.plazoAgotado ? 'WhatsApp no ha respondido a tiempo.' : e.message });
                    if (e.plazoAgotado && ++plazosSeguidos >= 2) break;   // Chrome atascado: no seguir insistiendo
                }
                await espera(CONFIG.pausaMs);
            }
        });
    }

    permitir(opp.id, chats.filter(c => c.chatId).map(c => c.chatId));
    const colocadas = await marcas(media.map(m => m.id), opp.id);
    return { dias: d, chats, media: media.sort((a, b) => b.t - a.t), colocadas };
}

const MOTIVO_BAJADA = {
    no_encontrado: ['Esa foto ya no está en el chat. Vuelve a buscar.', 404],
    caducado: ['WhatsApp ya no tiene esa foto en sus servidores. Pídesela otra vez al cliente.', 410],
    grande: ['Ese archivo es demasiado grande para traerlo desde aquí.', 413],
    fallo: ['WhatsApp no ha dejado bajar esa foto.', 502],
};

/** Baja UN adjunto de un chat que se haya leído para esta oportunidad. */
async function descargar(opp, msgId) {
    const id = String(msgId || '');
    if (id.startsWith('sim_')) {
        if (!CONFIG.simulado) throw error('Esa foto no existe.', 404);
        return bajarSimulada(id);
    }
    const chatId = chatDeMsgId(id);
    if (!chatId || !permitido(opp.id, chatId)) {
        throw error('Esa foto no es de ningún chat leído para este expediente. Vuelve a buscar.', 403);
    }
    const client = clienteWa();
    if (!client) throw noConectado();
    const r = await enSerie(() => conPlazo(
        client.pupPage.evaluate(BAJAR, id, CONFIG.maxMb * 1024 * 1024),
        CONFIG.plazoBajarMs, 'bajar el adjunto'));
    if (!r || r.error) {
        const [msg, status] = MOTIVO_BAJADA[r?.error] || MOTIVO_BAJADA.fallo;
        if (r?.detalle) console.warn(`[wa-media] ${id}: ${r.detalle}`);
        throw error(msg, status);
    }
    const mimetype = String(r.mimetype || 'application/octet-stream').split(';')[0].trim();
    return {
        buffer: Buffer.from(r.data, 'base64'),
        mimetype,
        nombre: nombreArchivo({ id, t: r.t, mimetype, filename: r.filename, tipo: r.tipo }),
    };
}

// ─── Qué fotos están ya colocadas ────────────────────────────────────────────

/**
 * `{ [waMsgId]: { aqui, slot, at, oportunidad } }` de las que ya se colocaron,
 * en ESTA oportunidad o en otra (una foto del chat del instalador puede ser de
 * otra obra suya, y eso es lo primero que hay que saber antes de traerla).
 */
async function marcas(ids, oppId) {
    const reales = (ids || []).filter(i => i && !String(i).startsWith('sim_'));
    if (!reales.length) return {};
    const filas = [];
    try {
        // Por lotes: un .in() con la lista entera revienta la cabecera al crecer.
        for (let i = 0; i < reales.length; i += 100) {
            const { data, error: e } = await supabase.from('whatsapp_media_importada')
                .select('wa_msg_id, oportunidad_id, slot, created_at')
                .in('wa_msg_id', reales.slice(i, i + 100));
            if (e) throw new Error(e.message);
            filas.push(...(data || []));
        }
    } catch (e) {
        // Sin la tabla (migración pendiente) la lista sale igual, sin marcas.
        console.warn('[wa-media] marcas:', e.message);
        return {};
    }
    const otras = [...new Set(filas.map(f => f.oportunidad_id).filter(o => o !== oppId))];
    const nombres = {};
    if (otras.length) {
        const { data } = await supabase.from('oportunidades').select('id, id_oportunidad').in('id', otras);
        for (const o of data || []) nombres[o.id] = o.id_oportunidad;
    }
    const out = {};
    for (const f of filas) {
        const aqui = f.oportunidad_id === oppId;
        // Si está aquí, eso manda sobre "está en otra".
        if (out[f.wa_msg_id]?.aqui && !aqui) continue;
        out[f.wa_msg_id] = { aqui, slot: f.slot, at: f.created_at, oportunidad: aqui ? null : (nombres[f.oportunidad_id] || 'otra obra') };
    }
    return out;
}

/** Apunta las que se acaban de colocar. Una pista: nunca tumba la subida. */
async function registrarColocadas(opp, items, usuario) {
    const filas = (items || [])
        .filter(it => it && typeof it.waMsgId === 'string' && it.waMsgId.length <= 200 && !it.waMsgId.startsWith('sim_'))
        .map(it => ({
            wa_msg_id: it.waMsgId,
            chat_id: chatDeMsgId(it.waMsgId),
            oportunidad_id: opp.id,
            slot: String(it.slot || '').slice(0, 80) || null,
            tipo: ['image', 'video', 'pdf'].includes(it.tipo) ? it.tipo : null,
            wa_at: Number(it.t) > 0 ? new Date(Number(it.t) * 1000).toISOString() : null,
            importado_por: usuario ? String(usuario).slice(0, 80) : null,
        }))
        .filter(f => f.chat_id);
    if (!filas.length) return { registradas: 0 };
    const { error: e } = await supabase.from('whatsapp_media_importada')
        .upsert(filas, { onConflict: 'oportunidad_id,wa_msg_id' });
    if (e) {
        console.warn('[wa-media] registrar colocadas:', e.message);
        return { registradas: 0, error: e.message };
    }
    return { registradas: filas.length };
}

// ─── Simulación (desarrollo, con WhatsApp apagado) ───────────────────────────

const DIR_SIM = path.join(__dirname, '../../frontend/public/tutorial');
const FOTOS_SIM = ['caldera.jpg', 'placa_caldera.jpg', 'fachada.jpg', 'unidad_exterior.jpg', 'ventana.jpg', 'patios.jpg'];

function simulacion(tels, corteSeg) {
    const ahora = Math.floor(Date.now() / 1000);
    const media = [];
    FOTOS_SIM.forEach((f, i) => {
        const ruta = path.join(DIR_SIM, f);
        if (!fs.existsSync(ruta)) return;
        const buf = fs.readFileSync(ruta);
        const t = ahora - (i + 1) * 5400;
        if (t < corteSeg) return;
        const id = `sim_${f.replace(/\.jpg$/, '')}`;
        media.push({
            id, tipo: 'image', original: false, t, mimetype: 'image/jpeg', size: buf.length,
            caption: i === 0 ? 'Esta es la caldera' : '', thumb: buf.toString('base64'), grande: false,
            nombre: nombreArchivo({ id, t, mimetype: 'image/jpeg', tipo: 'image' }),
            tel: tels[0], chatId: `34${tels[0]}@c.us`,
        });
    });
    return {
        chats: tels.map((tel, i) => (i === 0
            ? { tel, chatId: `34${tel}@c.us`, estado: 'ok', n: media.length, simulado: true }
            : { tel, estado: 'sin_chat', simulado: true })),
        media,
    };
}

function bajarSimulada(id) {
    const f = `${id.replace(/^sim_/, '')}.jpg`;
    if (!FOTOS_SIM.includes(f)) throw error('Esa foto no existe.', 404);
    const ruta = path.join(DIR_SIM, f);
    return {
        buffer: fs.readFileSync(ruta),
        mimetype: 'image/jpeg',
        nombre: nombreArchivo({ id, t: Math.floor(fs.statSync(ruta).mtimeMs / 1000), mimetype: 'image/jpeg', tipo: 'image' }),
    };
}

module.exports = {
    disponible, contactosDeOportunidad, buscar, descargar, registrarColocadas,
    // Para `whatsappConversacion` (la conversación entera de la skill
    // alta-oportunidad): la MISMA fila de lecturas y la MISMA descarga.
    _enSerie: enSerie, _clienteWa: clienteWa, _BAJAR: BAJAR, MOTIVO_BAJADA,
    // Puros, para las pruebas:
    nueve, chatDeMsgId, extDeMime, nombreArchivo, filtrarMedia, unirContactos,
    CONFIG,
};
