/**
 * whatsappConversacion — leer una CONVERSACIÓN entera (texto + adjuntos).
 *
 * Es para la skill `alta-oportunidad`: el instalador pide una simulación por
 * WhatsApp y lo que manda viene repartido en mensajes sueltos — la referencia
 * catastral escrita o en una captura, la foto de la caldera y la de su placa, a
 * veces un croquis o el presupuesto, el nombre y el DNI del cliente en texto,
 * su teléfono en una tarjeta de contacto. Para dar de alta la oportunidad hay
 * que leerlo TODO, no solo los adjuntos.
 *
 * Es el hermano de `whatsappMedia`, que trae solo adjuntos y para una
 * oportunidad que YA existe (la descarga se ata a ella). Aquí la oportunidad
 * todavía no existe, así que el permiso de descarga se ata a la conversación
 * que se acaba de leer.
 *
 * REGLAS (las mismas que `whatsappMedia`, y por los mismos motivos):
 *  - Solo LECTURA. No se envía nada, no se marca nada como leído y no se crea
 *    ningún chat: un número con el que nunca se ha hablado no tiene nada que
 *    leer, y abrir la conversación por mirar llenaría la lista del móvil.
 *  - Se habla con WhatsApp Web DIRECTAMENTE (`WAWebCollections`), nunca con
 *    `getChatById().fetchMessages()`: pasa por el `serialize()` que WhatsApp
 *    rompió, y `getChatById` es justo la llamada que dejaba la sesión enviando
 *    sin ACK (regla 39).
 *  - En la MISMA fila que las demás lecturas (`enSerie` de `whatsappMedia`) y
 *    con plazo: es el Chrome del que depende todo lo automático de la app.
 *  - Solo se baja un adjunto de un chat leído AQUÍ en las últimas horas: el id
 *    del mensaje lleva el chat dentro y se comprueba, o la ruta serviría para
 *    bajar cualquier foto de cualquier conversación.
 */

const whatsappMedia = require('./whatsappMedia');
const { _conPlazo: conPlazo } = require('./whatsappLabels');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

const CONFIG = {
    plazoListarMs: num(process.env.WA_CONV_PLAZO_LISTAR_MS, 45_000),
    plazoBajarMs: num(process.env.WA_CONV_PLAZO_BAJAR_MS, 90_000),
    maxDias: 60,
    maxMensajes: num(process.env.WA_CONV_MAX_MENSAJES, 1500),
    maxLotes: num(process.env.WA_CONV_MAX_LOTES, 40),
    maxMb: num(process.env.WA_MEDIA_MAX_MB, 50),
    maxChats: 10,
};

function error(mensaje, status = 400) {
    const e = new Error(mensaje);
    e.status = status;
    return e;
}

// ─────────────────────────────────────────────────────────────────────────────
// Puro — sin WhatsApp (probado en scripts/test_alta_oportunidad.js)
// ─────────────────────────────────────────────────────────────────────────────

const nueve = whatsappMedia.nueve;

/** Para buscar sin mayúsculas ni tildes («Administración» = «administracion»). */
function normaliza(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Una tarjeta de contacto (vCard) → `{ nombre, telefonos }`. Es como llega el
 * teléfono del cliente cuando el instalador lo "comparte" en vez de escribirlo.
 * `waid=34612345678` es el número que WhatsApp ya ha resuelto; si no está, se
 * usa lo escrito en la línea TEL.
 */
function leerVcard(texto) {
    const t = String(texto || '');
    if (!/BEGIN:VCARD/i.test(t)) return null;
    const fn = /^FN[^:]*:(.*)$/im.exec(t);
    const telefonos = [];
    for (const linea of t.split(/\r?\n/)) {
        if (!/^(item\d+\.)?TEL/i.test(linea)) continue;
        const waid = /waid=(\d+)/i.exec(linea);
        const valor = linea.split(':').slice(1).join(':');
        const digitos = (waid ? waid[1] : valor).replace(/\D/g, '');
        if (digitos.length >= 9 && !telefonos.includes(digitos)) telefonos.push(digitos);
    }
    return { nombre: fn ? fn[1].trim() : null, telefonos };
}

/**
 * Lo que devuelve la página → la lista de mensajes que se entrega. Fuera las
 * notificaciones del sistema (`e2e_notification`, `notification_template`…):
 * no las ha escrito nadie.
 */
const TIPOS = new Set(['chat', 'image', 'video', 'document', 'ptt', 'audio', 'vcard', 'multi_vcard',
    'location', 'sticker', 'revoked', 'album']);

function normalizarMensajes(crudos, { corteSeg, maxBytes = CONFIG.maxMb * 1024 * 1024 } = {}) {
    const out = [];
    for (const m of crudos || []) {
        if (!m || !m.id || !TIPOS.has(m.tipo)) continue;
        if ((Number(m.t) || 0) < corteSeg) continue;
        const media = ['image', 'video', 'document', 'ptt', 'audio', 'sticker'].includes(m.tipo);
        const x = {
            id: m.id,
            tipo: m.tipo,
            t: Number(m.t) || 0,
            de_mi: !!m.fromMe,
            texto: String(m.texto || ''),
        };
        if (m.autor) x.autor = m.autor;
        if (m.citado) x.citado = String(m.citado).slice(0, 300);
        if (media) {
            x.mimetype = String(m.mimetype || '').split(';')[0].trim().toLowerCase();
            if (m.filename) x.filename = m.filename;
            if (m.size) x.size = Number(m.size) || null;
            // Las notas de voz también: lo que el instalador no escribe lo dice.
            x.descargable = !m.viewOnce && ['image', 'video', 'document', 'ptt', 'audio'].includes(m.tipo)
                && !(m.size && m.size > maxBytes);
            if (m.viewOnce) x.ver_una_vez = true;
            if (m.tipo === 'document') {
                x.nombre_archivo = whatsappMedia.nombreArchivo({
                    id: m.id, t: m.t, mimetype: x.mimetype, filename: m.filename, tipo: m.tipo,
                });
            }
        }
        if (m.tipo === 'vcard') x.contactos = [leerVcard(m.vcard)].filter(Boolean);
        if (m.tipo === 'multi_vcard') x.contactos = (m.vcards || []).map(leerVcard).filter(Boolean);
        if (m.tipo === 'location') {
            x.lat = Number(m.lat) || null;
            x.lng = Number(m.lng) || null;
        }
        out.push(x);
    }
    return out.sort((a, b) => a.t - b.t);
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Web — lo que corre DENTRO de la página
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable no-undef -- estas funciones se ejecutan en el navegador */

/** Busca chats por su NOMBRE (el que se ve en la lista del móvil). No crea ninguno. */
function BUSCAR_CHATS(q, max) {
    const C = window.require('WAWebCollections');
    if (!C || !C.Chat) return { error: 'WhatsApp Web todavía no ha cargado sus conversaciones.' };
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const palabras = norm(q).split(/\s+/).filter(Boolean);
    const out = [];
    for (const ch of C.Chat.getModelsArray()) {
        const id = ch.id ? (ch.id._serialized || String(ch.id)) : null;
        if (!id) continue;
        const nombre = ch.formattedTitle || ch.name || (ch.contact && (ch.contact.name || ch.contact.pushname)) || '';
        const pajar = norm(`${nombre} ${id}`);
        if (!palabras.every(p => pajar.includes(p))) continue;
        out.push({ chatId: id, nombre: nombre || null, t: Number(ch.t) || 0, grupo: !!ch.isGroup });
    }
    return { chats: out.sort((a, b) => b.t - a.t).slice(0, max) };
}

/**
 * Lee UNA conversación: la busca por su id (`34…@c.us`, o el `@lid` si ya se
 * conoce), y si con el número clásico no está, por su `@lid` — sin crearla.
 * Carga mensajes antiguos hasta el corte y devuelve TODOS (texto y adjuntos),
 * sin serializar nada de la librería.
 */
async function LEER_CONVERSACION(id, corteSeg, maxMensajes, maxLotes) {
    const C = window.require('WAWebCollections');
    if (!C || !C.Chat) return { error: 'WhatsApp Web todavía no ha cargado sus conversaciones.' };
    let chat = C.Chat.get(id);
    if (!chat && /@c\.us$/.test(id)) {
        try {
            const wid = window.require('WAWebWidFactory').createWid(id);
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

    const mensajes = [];
    for (const m of lista()) {
        const tipo = m.type;
        const media = ['image', 'video', 'document', 'ptt', 'audio', 'sticker'].includes(tipo);
        let citado = null;
        try {
            const q = m.quotedMsg;
            if (q) citado = String(q.body && q.type === 'chat' ? q.body : (q.caption || q.filename || `[${q.type}]`)).slice(0, 300);
        } catch (e) { /* sin cita */ }
        mensajes.push({
            id: m.id ? (m.id._serialized || String(m.id)) : null,
            tipo, t: Number(m.t) || 0,
            fromMe: !!(m.id && m.id.fromMe),
            autor: m.author ? (m.author._serialized || String(m.author)) : null,
            // En un mensaje con foto o vídeo, `body` es la MINIATURA en base64: no es texto.
            texto: tipo === 'chat' ? String(m.body || '').slice(0, 4000) : String(m.caption || '').slice(0, 1000),
            mimetype: media ? (m.mimetype || '') : null,
            filename: m.filename || null,
            size: media ? (Number(m.size) || null) : null,
            viewOnce: !!m.isViewOnce,
            vcard: tipo === 'vcard' ? String(m.body || '').slice(0, 4000) : null,
            vcards: tipo === 'multi_vcard' && Array.isArray(m.vcardList)
                ? m.vcardList.map(v => String((v && v.vcard) || '').slice(0, 4000)) : null,
            lat: tipo === 'location' ? m.lat : null,
            lng: tipo === 'location' ? m.lng : null,
            citado,
        });
    }
    return {
        chatId: chat.id._serialized || String(chat.id),
        nombre: chat.formattedTitle || chat.name || null,
        grupo: !!chat.isGroup,
        total: lista().length, lotes, sinMas, masViejo: masViejo(),
        mensajes,
    };
}

/* eslint-enable no-undef */

// ─────────────────────────────────────────────────────────────────────────────
// Orquestación
// ─────────────────────────────────────────────────────────────────────────────

// Conversaciones leídas aquí: la descarga solo acepta mensajes de ellas.
const leidas = new Map();   // chatId → caduca (ms)
const VIGENCIA_MS = 3 * 3600_000;

function noConectado() {
    return error('WhatsApp no está conectado en el servidor. Revísalo en Ajustes → WhatsApp.', 503);
}

/** El teléfono de un chat `@lid` (para casarlo con la base de datos). Nunca lanza. */
async function telefonoDe(client, chatId) {
    if (/@c\.us$/.test(chatId)) return chatId.replace('@c.us', '');
    if (!/@lid$/.test(chatId) || !client.getContactLidAndPhone) return null;
    try {
        const r = await conPlazo(client.getContactLidAndPhone([chatId]), 15_000, 'getContactLidAndPhone');
        return r?.[0]?.pn ? String(r[0].pn).replace(/@.*$/, '') : null;
    } catch (e) {
        return null;
    }
}

/** Chats cuyo NOMBRE contiene esas palabras («ism alejandro»). */
async function buscarChats(q) {
    const texto = String(q || '').trim().slice(0, 80);
    if (normaliza(texto).length < 3) throw error('Escribe al menos tres letras del nombre del chat.');
    const client = whatsappMedia._clienteWa();
    if (!client) throw noConectado();
    const r = await whatsappMedia._enSerie(() => conPlazo(
        client.pupPage.evaluate(BUSCAR_CHATS, texto, CONFIG.maxChats), CONFIG.plazoListarMs, 'buscar chats'));
    if (r?.error) throw error(r.error, 503);
    const chats = r?.chats || [];
    for (const c of chats) {
        // eslint-disable-next-line no-await-in-loop
        c.telefono = c.grupo ? null : await telefonoDe(client, c.chatId);
    }
    return { chats };
}

/**
 * La conversación con ese número (o ese chat) en los últimos `dias`.
 * `{ chatId, nombre, telefono, incompleto, mensajes: [...] }`. No baja nada.
 */
async function leerConversacion({ telefono, chatId, dias }) {
    const d = Math.min(Math.max(Math.round(Number(dias) || 14), 1), CONFIG.maxDias);
    const corteSeg = Math.floor(Date.now() / 1000) - d * 86400;
    let id = null;
    if (chatId && /^[0-9a-z.\-]+@(c\.us|lid|g\.us)$/i.test(String(chatId))) id = String(chatId);
    else {
        const n = nueve(telefono);
        if (!n) throw error('Indica un teléfono (9 dígitos) o el chatId.');
        id = `34${n}@c.us`;
    }

    const client = whatsappMedia._clienteWa();
    if (!client) throw noConectado();
    const r = await whatsappMedia._enSerie(() => conPlazo(
        client.pupPage.evaluate(LEER_CONVERSACION, id, corteSeg, CONFIG.maxMensajes, CONFIG.maxLotes),
        CONFIG.plazoListarMs, 'leer la conversación'));
    if (r?.error) throw error(r.error, 503);
    if (!r?.chatId) throw error('No hay ninguna conversación con ese número en el WhatsApp de la empresa.', 404);

    leidas.set(r.chatId, Date.now() + VIGENCIA_MS);
    return {
        chatId: r.chatId,
        nombre: r.nombre || null,
        grupo: !!r.grupo,
        telefono: r.grupo ? null : await telefonoDe(client, r.chatId),
        dias: d,
        // Si no se llegó al corte, lo más antiguo del periodo no se ha podido
        // cargar: se dice, o "no hay nada más" sería mentira.
        incompleto: !r.sinMas && r.masViejo > corteSeg,
        mensajes: normalizarMensajes(r.mensajes, { corteSeg }),
    };
}

/** Baja UN adjunto de una conversación leída aquí en las últimas horas. */
async function descargarAdjunto(msgId) {
    const id = String(msgId || '');
    const chatId = whatsappMedia.chatDeMsgId(id);
    const caduca = chatId ? leidas.get(chatId) : null;
    if (!caduca || caduca < Date.now()) {
        throw error('Ese adjunto no es de ninguna conversación leída en las últimas horas. Vuelve a leerla.', 403);
    }
    const client = whatsappMedia._clienteWa();
    if (!client) throw noConectado();
    const r = await whatsappMedia._enSerie(() => conPlazo(
        client.pupPage.evaluate(whatsappMedia._BAJAR, id, CONFIG.maxMb * 1024 * 1024),
        CONFIG.plazoBajarMs, 'bajar el adjunto'));
    if (!r || r.error) {
        const [msg, status] = whatsappMedia.MOTIVO_BAJADA[r?.error] || whatsappMedia.MOTIVO_BAJADA.fallo;
        if (r?.detalle) console.warn(`[wa-conversacion] ${id}: ${r.detalle}`);
        throw error(msg, status);
    }
    const mimetype = String(r.mimetype || 'application/octet-stream').split(';')[0].trim();
    return {
        buffer: Buffer.from(r.data, 'base64'),
        mimetype,
        nombre: whatsappMedia.nombreArchivo({ id, t: r.t, mimetype, filename: r.filename, tipo: r.tipo }),
    };
}

module.exports = {
    buscarChats, leerConversacion, descargarAdjunto,
    // Puros, para las pruebas:
    normaliza, leerVcard, normalizarMensajes, CONFIG,
};
