/**
 * bienvenidaWhatsapp — la PRIMERA respuesta, sola, a quien escribe por primera vez
 * (2026-11-09, Fran: «que al cliente, de manera automática, se le envíe ya un mensaje
 * para que a través del formulario rellene sus datos y se queden registrados»).
 *
 * Quien escribe por primera vez a BROKERGY recibe UNA vez el enlace del formulario
 * «Calcula tu ayuda» (`?ref=wa`) y el vídeo de las ayudas. La oportunidad nace del
 * formulario, por el mismo camino que cualquier lead web: ya no hace falta que Fran
 * pida «da de alta esta oportunidad».
 *
 * Cómo:
 *  1. Cada mensaje que ENTRA abre o alarga una RÁFAGA por chat (en memoria). Al
 *     callarse `ventanaMs`, se EVALÚA una vez: ¿es nuevo de verdad? (`decidir` en
 *     utils/bienvenidaWhatsapp.js: ni en la app, ni en la agenda, ni empresa, ni chat
 *     con historia, ni le hemos escrito). Lo de la sesión se lee con UNA evaluación
 *     en la fila de lecturas (`enSerie`) y con plazo; nada de
 *     `getChatById`/`getChats`/`msg.getChat`/`sendSeen` (regla 39).
 *  2. Si lo es, se APUNTA en `wa_bienvenidas` (una por teléfono, para siempre) como
 *     PENDIENTE, con su hora: ahora si es horario; si no, la apertura siguiente.
 *  3. La VUELTA (cada minuto) la manda: antes vuelve a leer el chat y, si alguien le
 *     ha contestado mientras (Fran a mano, otra cosa de la app), no se manda.
 *
 * Frenos (la cuenta es la de TODOS los envíos automáticos de la app):
 *  - Nace APAGADA (`WA_BIENVENIDA_ENABLED`) y, encendida, en MODO COPIA: apunta lo que
 *    habría mandado y no sale nada. `WA_BIENVENIDA_MODO=real` para escribir.
 *  - `WA_BIENVENIDA_PRUEBA=tel,tel`: con esto puesto SOLO se atiende a esos teléfonos
 *    (y se les escribe aunque ya nos conozcan, para poder probar).
 *  - Topes en el CÓDIGO: 30 al día, 10 a la hora, 2 por vuelta. Horario: la franja de la
 *    casa (regla 205, `horarioWhatsapp.puedeContestar`: quien nos ha escrito, de 7 a 21 h).
 *  - Sin reintentos: un envío que falla queda en ERROR (el mensaje puede estar ya en
 *    el chat; reenviarlo lo duplicaría).
 */

const U = require('../utils/bienvenidaWhatsapp');
const H = require('../utils/horarioWhatsapp');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const CFG = {
    ventanaMs: num(process.env.WA_BIENVENIDA_VENTANA_MS, 90_000),
    historialMin: 360,          // un chat cuyo primer mensaje cargado es de hace más de 6 h no es nuevo
    topeDia: 30,
    topeHora: 10,
    porVuelta: 2,
    plazoMs: 20_000,
    olvidoMs: 24 * 3_600_000,   // un «no» se recuerda un día: un contacto de la agenda no se relee con cada mensaje
    conocidosMs: 10 * 60_000,   // los teléfonos de la BD se releen cada 10 min
    colaMaxMs: 120_000,         // lo que se espera a que el texto salga de la cola antes de mandar el vídeo
    videoMaxBytes: 15 * 1024 * 1024,
};
const VIDEO_URL_DEFECTO = 'https://brokergy.es/video/2026-10_clientes-ayudas-aerotermia.mp4';
const TABLA = 'wa_bienvenidas';

const activo = () => String(process.env.WA_BIENVENIDA_ENABLED || '').toLowerCase() === 'true';
const modo = () => (String(process.env.WA_BIENVENIDA_MODO || '').toLowerCase() === 'real' ? 'real' : 'copia');
const telefonosPrueba = () => new Set(String(process.env.WA_BIENVENIDA_PRUEBA || '')
    .split(',').map(U.nueve).filter(Boolean));
const videoUrl = () => (process.env.WA_BIENVENIDA_VIDEO_URL ?? VIDEO_URL_DEFECTO).trim();
const recorta = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// Lo de fuera, inyectable para las pruebas (scripts/test_bienvenida_whatsapp.js).
const deps = {
    supabase: null,
    ws: null,
    leerChat: null,
    resolverLid: null,
    bajarVideo: null,
    esperarCola: null,
    ahora: () => Date.now(),
};
const db = () => deps.supabase || require('./supabaseClient');
const wa = () => deps.ws || require('./whatsappService');

// ─── Lo que se lee de la sesión ──────────────────────────────────────────────
/* eslint-disable no-undef -- se ejecuta en el navegador */
/** UN chat, de la memoria de WhatsApp Web: su número, si está en la agenda y lo que hay en él. */
function LEER_CHAT(chatId) {
    const C = window.require('WAWebCollections');
    if (!C || !C.Chat || !C.Contact) return { error: 'WhatsApp Web todavía no ha cargado sus conversaciones.' };
    let api = null;
    try { api = window.require('WAWebApiContact'); } catch (e) { /* versión sin el módulo */ }
    const ch = C.Chat.get(chatId) || null;
    const ct = C.Contact.get(chatId) || null;
    let numero = /@c\.us$/.test(chatId) ? chatId.split('@')[0] : null;
    if (!numero && api && api.getPhoneNumber) {
        try {
            const id = (ct && ct.id) || (ch && ch.id);
            const pn = id ? api.getPhoneNumber(id) : null;
            numero = pn && pn.user ? pn.user : null;
        } catch (e) { /* sin número */ }
    }
    // Solo cuentan los mensajes de PERSONAS: los avisos del sistema (cifrado, cuenta
    // de empresa…) llegan con fechas y remitentes que no dicen nada.
    const DE_PERSONA = { chat: 1, image: 1, video: 1, ptt: 1, audio: 1, document: 1, sticker: 1, vcard: 1, multi_vcard: 1, location: 1 };
    const ms = ch && ch.msgs && ch.msgs.getModelsArray ? ch.msgs.getModelsArray() : [];
    let propios = 0;
    let mensajes = 0;
    let primero = 0;
    for (const m of ms) {
        if (!m || !DE_PERSONA[m.type]) continue;
        mensajes++;
        if (m.id && m.id.fromMe) propios++;
        const t = Number(m.t) || 0;
        if (t && (!primero || t < primero)) primero = t;
    }
    return {
        hayChat: !!ch,
        numero,
        enAgenda: !!(ct && (ct.isAddressBookContact || ct.isMyContact)),
        esEmpresa: !!(ct && (ct.isBusiness || ct.isEnterprise)),
        pushname: ct && ct.pushname ? String(ct.pushname).slice(0, 60) : null,
        mensajes,
        propios,
        primeroSeg: primero,
        etiquetas: ch && Array.isArray(ch.labels) ? ch.labels.length : 0,
    };
}
/* eslint-enable no-undef */

async function leerChat(chatId) {
    if (deps.leerChat) return deps.leerChat(chatId);
    const media = require('./whatsappMedia');
    const { _conPlazo: conPlazo } = require('./whatsappLabels');
    const client = media._clienteWa();
    if (!client) throw new Error('WhatsApp no está conectado');
    const r = await media._enSerie(() => conPlazo(client.pupPage.evaluate(LEER_CHAT, chatId), CFG.plazoMs, 'leer el chat'));
    if (r?.error) throw new Error(r.error);
    return r;
}

/** El número de un @lid que WhatsApp Web no tenía a mano (como `esperasWhatsapp`). */
async function resolverLid(chatId) {
    if (deps.resolverLid) return deps.resolverLid(chatId);
    const client = wa().getClient?.();
    if (!client?.getContactLidAndPhone) return null;
    const { _conPlazo: conPlazo } = require('./whatsappLabels');
    const r = await conPlazo(client.getContactLidAndPhone([chatId]), CFG.plazoMs, 'getContactLidAndPhone');
    const x = (r || [])[0];
    return U.nueve(x?.pn?._serialized || x?.pn || '') || null;
}

// ─── ¿Ya le conocemos? ───────────────────────────────────────────────────────
let conocidos = { at: 0, mapa: null };
/** 9 dígitos → de dónde lo conocemos. Lanza si la BD no responde: eso NO es «es nuevo». */
async function telefonosConocidos() {
    if (conocidos.mapa && deps.ahora() - conocidos.at < CFG.conocidosMs) return conocidos.mapa;
    const s = db();
    const [cli, par, usu, cert, sol, desc] = await Promise.all([
        s.from('clientes').select('tlf, persona_contacto_tlf, representante_tlf, copropietarios'),
        s.from('prescriptores').select('tlf, tlf_contacto, tlf_responsable, landing_telefono_contacto, contactos_notificacion'),
        s.from('usuarios').select('tlf'),
        s.from('certapp_cuentas').select('telefono'),
        s.from('instalador_solicitudes').select('telefono'),
        s.from('whatsapp_contactos_descartados').select('telefono'),
    ]);
    const fallo = [cli, par, usu, cert, sol, desc].find(r => r.error);
    if (fallo) throw new Error(`la base de datos no responde (${fallo.error.message})`);
    const mapa = new Map();
    const apunta = (t, de) => { const n = U.nueve(t); if (n && !mapa.has(n)) mapa.set(n, de); };
    for (const c of cli.data || []) {
        [c.tlf, c.persona_contacto_tlf, c.representante_tlf].forEach(t => apunta(t, 'cliente'));
        (Array.isArray(c.copropietarios) ? c.copropietarios : []).forEach(x => apunta(x?.tlf, 'copropietario de un cliente'));
    }
    for (const p of par.data || []) {
        [p.tlf, p.tlf_contacto, p.tlf_responsable, p.landing_telefono_contacto].forEach(t => apunta(t, 'partner'));
        (Array.isArray(p.contactos_notificacion) ? p.contactos_notificacion : []).forEach(x => apunta(x?.tlf, 'partner'));
    }
    (usu.data || []).forEach(u => apunta(u.tlf, 'usuario de la app'));
    (cert.data || []).forEach(u => apunta(u.telefono, 'certificador de la app'));
    (sol.data || []).forEach(u => apunta(u.telefono, 'solicitud de instalador'));
    (desc.data || []).forEach(u => apunta(u.telefono, 'descartado en «Pendientes de WhatsApp»'));
    conocidos = { at: deps.ahora(), mapa };
    return mapa;
}

/** Dónde lo conocemos, o null. Además de las fichas: si la app ya le ha escrito alguna vez. */
async function conocidoEnApp(tel9) {
    // Los de la casa: el móvil personal de Fran (su chat con el asistente) y el de administración.
    const deCasa = [process.env.ASISTENTE_WHATSAPP_TEL, process.env.WHATSAPP_ADMIN_CHAT || '34623926179'].map(U.nueve);
    if (deCasa.includes(tel9)) return 'teléfono de la casa';
    const mapa = await telefonosConocidos();
    if (mapa.has(tel9)) return mapa.get(tel9);
    const { data, error } = await db().from('whatsapp_queue').select('id').like('phone', `%${tel9}`).limit(1);
    if (error) throw new Error(`la base de datos no responde (${error.message})`);
    return (data || []).length ? 'la app ya le ha escrito' : null;
}

// ─── Ráfagas y decisión ──────────────────────────────────────────────────────
const rafagas = new Map();     // chatId → { timer, primero, n, texto }
const decididos = new Map();   // chatId → hasta (ms): ya se decidió que no
const humanos = new Map();     // chatId → ms: le ha escrito una persona de la casa

function describir(msg) {
    const tipo = String(msg?.type || 'chat');
    const txt = recorta(msg?.body, 80);
    return tipo === 'chat' ? txt : `[${tipo}]${txt && tipo !== 'ptt' ? ` ${txt}` : ''}`;
}

/** Un mensaje que ENTRA (listener de la sesión). Nunca lanza: cuelga del bucle de toda la app. */
function alMensajeEntrante(msg) {
    try {
        if (!activo() || !msg || msg.fromMe || msg.isStatus || msg.broadcast) return;
        const chatId = String(msg.from || '');
        if (!/@(c\.us|lid)$/.test(chatId)) return;
        if (!U.TIPOS_ADMITIDOS.has(String(msg.type || 'chat'))) return;
        if ((decididos.get(chatId) || 0) > deps.ahora()) return;
        if (chatId.endsWith('@c.us') && !U.esMovilEspanol(chatId.split('@')[0])) return;
        const r = rafagas.get(chatId) || { primero: describir(msg), n: 0 };
        r.n += 1;
        clearTimeout(r.timer);
        r.timer = setTimeout(() => { evaluar(chatId).catch(e => console.warn('[bienvenida] evaluar:', e.message)); }, CFG.ventanaMs);
        r.timer.unref?.();
        rafagas.set(chatId, r);
    } catch (e) {
        console.warn('[bienvenida] mensaje entrante:', e.message);
    }
}

/** Un mensaje NUESTRO: si no lo ha mandado la app, ese chat lo lleva una persona. */
function alMensajePropio({ msg, delSistema }) {
    try {
        if (!activo() || delSistema || !msg) return;
        const chatId = String(msg.to || '');
        if (!/@(c\.us|lid)$/.test(chatId)) return;
        humanos.set(chatId, deps.ahora());
        if (humanos.size > 5000) humanos.delete(humanos.keys().next().value);
    } catch (e) {
        console.warn('[bienvenida] mensaje propio:', e.message);
    }
}

const noPorHoy = (chatId, motivo) => {
    decididos.set(chatId, deps.ahora() + CFG.olvidoMs);
    if (decididos.size > 5000) {
        for (const [k, hasta] of decididos) if (hasta < deps.ahora()) decididos.delete(k);
    }
    return { ok: false, motivo };
};

/** Termina la ráfaga: ¿es nuevo? Si lo es, lo apunta PENDIENTE. Devuelve { ok, motivo }. */
async function evaluar(chatId) {
    const rafaga = rafagas.get(chatId) || { primero: '', n: 0 };
    rafagas.delete(chatId);
    if (!activo()) return { ok: false, motivo: 'apagado' };
    if (humanos.has(chatId)) return noPorHoy(chatId, 'le ha contestado una persona de la casa');
    const prueba = telefonosPrueba();

    let res;
    try {
        // Lo barato primero: un @c.us ya trae el número.
        if (chatId.endsWith('@c.us') && !prueba.size) {
            const t9 = U.nueve(chatId);
            const de = await conocidoEnApp(t9);
            if (de) return noPorHoy(chatId, `ya está en la app (${de})`);
        }
        const chat = await leerChat(chatId);
        if (!chat.numero && chatId.endsWith('@lid')) chat.numero = await resolverLid(chatId).catch(() => null);
        const tel9 = U.nueve(chat.numero);
        const esPrueba = !!tel9 && prueba.has(tel9);
        if (prueba.size && !esPrueba) return noPorHoy(chatId, 'en prueba: solo se atiende a los teléfonos de prueba');
        if (tel9) {
            const { data: previa, error } = await db().from(TABLA).select('id, estado, created_at').eq('tel9', tel9).limit(1);
            if (error) throw new Error(`la base de datos no responde (${error.message})`);
            if (previa?.length) {
                const vieja = deps.ahora() - Date.parse(previa[0].created_at) > 10 * 60_000;
                if (!esPrueba || !vieja) return noPorHoy(chatId, 'ya se le dio la bienvenida');
                await db().from(TABLA).delete().eq('id', previa[0].id);   // un teléfono de prueba se puede repetir
            }
        }
        const conocido = tel9 && !esPrueba ? await conocidoEnApp(tel9) : null;
        res = U.decidir({ chat, conocido, prueba: esPrueba, ahoraMs: deps.ahora(), historialMin: CFG.historialMin });
        if (!res.ok) {
            console.log(`[bienvenida] no a ${chatId}: ${res.motivo}`);
            return noPorHoy(chatId, res.motivo);
        }
        const ahora = new Date(deps.ahora());
        const fila = {
            tel9, chat_id: chatId, pushname: chat.pushname || null,
            primer_mensaje: recorta(`${rafaga.primero}${rafaga.n > 1 ? ` (+${rafaga.n - 1})` : ''}`, 120),
            estado: 'PENDIENTE', modo: modo(), motivo: res.motivo,
            enviar_at: H.siguienteApertura(ahora).toISOString(),
            texto: U.textoBienvenida({ enlace: U.enlaceFormulario(process.env.FRONTEND_URL) }),
        };
        const { error } = await db().from(TABLA).insert(fila);
        // Dos ráfagas a la vez del mismo teléfono (@c.us y @lid): el índice único deja una.
        if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
        decididos.set(chatId, deps.ahora() + CFG.olvidoMs);
        console.log(`[bienvenida] apuntada ${tel9} (${modo()}), sale ${fila.enviar_at}`);
        return { ok: true, motivo: res.motivo, enviar_at: fila.enviar_at };
    } catch (e) {
        // No se ha podido comprobar: NO se escribe. Y no se recuerda: el siguiente mensaje lo reintenta.
        console.warn(`[bienvenida] no se ha podido comprobar ${chatId}: ${e.message}`);
        return { ok: false, motivo: `no se ha podido comprobar: ${e.message}` };
    }
}

// ─── El envío ────────────────────────────────────────────────────────────────
let video = null;   // { base64, bytes } bajado una vez
async function bajarVideo() {
    if (deps.bajarVideo) return deps.bajarVideo();
    const url = videoUrl();
    if (!url) return null;
    if (video?.url === url) return video;
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`el vídeo no se ha podido bajar (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    video = { url, bytes: buf.length, base64: buf.toString('base64') };
    return video;
}

/** Espera a que el texto salga de la cola (con su ACK): si no, el vídeo llegaría antes que el mensaje. */
async function esperarCola(id) {
    if (deps.esperarCola) return deps.esperarCola(id);
    const fin = Date.now() + CFG.colaMaxMs;
    while (Date.now() < fin) {
        const { data } = await db().from('whatsapp_queue').select('status, error').eq('id', id).maybeSingle();
        if (data?.status === 'SENT') return 'SENT';
        if (data?.status === 'FAILED') throw new Error(`el mensaje no ha salido: ${data.error || 'fallo de WhatsApp'}`);
        await new Promise(r => setTimeout(r, 3000));
    }
    return 'PENDING';
}

/** Manda el texto y, detrás, el vídeo (si no sale como vídeo, su enlace). Devuelve lo que pasó con el vídeo. */
async function enviar(fila) {
    const ws = wa();
    const destino = `34${fila.tel9}`;
    const out = await ws.sendText(destino, fila.texto);
    if (out && out.ok === false) throw new Error(out.error || 'WhatsApp no lo ha aceptado');
    const url = videoUrl();
    if (!url) return 'sin vídeo';
    const cola = out?.id ? await esperarCola(out.id) : 'SENT';
    if (cola !== 'SENT') return 'no enviado: el texto seguía en la cola';
    try {
        const v = await bajarVideo();
        if (!v || v.bytes > CFG.videoMaxBytes) throw new Error('el vídeo pasa de 15 MB');
        await ws.sendMedia(destino, { base64: v.base64, mimetype: 'video/mp4', filename: 'ayudas-brokergy.mp4' },
            { caption: U.PIE_VIDEO, asDocument: false, splitCaption: false });
        return 'enviado';
    } catch (e) {
        // El texto ya ha llegado: el vídeo, como enlace (se ve en el navegador del móvil).
        console.warn(`[bienvenida] el vídeo no ha salido a ${fila.tel9}: ${e.message}`);
        try {
            await ws.sendText(destino, `${U.PIE_VIDEO.replace(/\.$/, '')}: ${url}`);
            return `enlace (el vídeo falló: ${recorta(e.message, 80)})`;
        } catch (e2) {
            return `error: ${recorta(e2.message, 80)}`;
        }
    }
}

let enCurso = false;
/** Manda lo apuntado que ya toca. `seco`: dice lo que haría sin tocar nada. */
async function vuelta({ seco = false } = {}) {
    if (enCurso) return { hecho: [], motivo: 'ya hay una vuelta en marcha' };
    enCurso = true;
    const hecho = [];
    try {
        if (!activo() && !seco) return { hecho, motivo: 'apagado' };
        const ahora = new Date(deps.ahora());
        const s = db();
        const { data: filas, error } = await s.from(TABLA).select('*')
            .eq('estado', 'PENDIENTE').lte('enviar_at', ahora.toISOString()).order('enviar_at').limit(10);
        if (error) throw new Error(error.message);
        if (!filas?.length) return { hecho };
        if (!H.puedeContestar(ahora)) {
            const luego = H.siguienteApertura(ahora).toISOString();
            for (const f of filas) {
                hecho.push({ id: f.id, tel9: f.tel9, accion: 'fuera de horario', enviar_at: luego });
                if (!seco) await s.from(TABLA).update({ enviar_at: luego, updated_at: ahora.toISOString() }).eq('id', f.id);
            }
            return { hecho };
        }
        const real = modo() === 'real';
        let [dia, hora] = [0, 0];
        if (real) {
            const [d, h] = await Promise.all([
                s.from(TABLA).select('id', { count: 'exact', head: true }).eq('estado', 'ENVIADA').gte('enviado_at', U.inicioDiaMadrid(ahora).toISOString()),
                s.from(TABLA).select('id', { count: 'exact', head: true }).eq('estado', 'ENVIADA').gte('enviado_at', new Date(ahora - 3_600_000).toISOString()),
            ]);
            if (d.error || h.error) throw new Error((d.error || h.error).message);
            [dia, hora] = [d.count || 0, h.count || 0];
        }
        let enEsta = 0;
        for (const f of filas) {
            if (enEsta >= CFG.porVuelta) break;
            if (real && (dia >= CFG.topeDia || hora >= CFG.topeHora)) {
                hecho.push({ id: f.id, tel9: f.tel9, accion: 'tope', motivo: `tope alcanzado (${dia} hoy, ${hora} en la última hora)` });
                break;
            }
            // Justo antes de mandar se vuelve a mirar: si alguien le ha contestado mientras, no.
            let motivoNo = humanos.has(f.chat_id) ? 'le ha contestado una persona de la casa' : null;
            if (!motivoNo) {
                try {
                    const chat = await leerChat(f.chat_id);
                    if ((chat.propios || 0) > 0) motivoNo = 'ya le han contestado en el chat';
                } catch (e) {
                    hecho.push({ id: f.id, tel9: f.tel9, accion: 'espera', motivo: `no se ha podido releer el chat: ${e.message}` });
                    continue;   // se reintenta en la vuelta siguiente
                }
            }
            if (motivoNo) {
                hecho.push({ id: f.id, tel9: f.tel9, accion: 'descartada', motivo: motivoNo });
                if (!seco) await s.from(TABLA).update({ estado: 'DESCARTADA', motivo: motivoNo, updated_at: ahora.toISOString() }).eq('id', f.id);
                continue;
            }
            enEsta += 1;
            if (seco) { hecho.push({ id: f.id, tel9: f.tel9, accion: real ? 'enviaría' : 'copia' }); continue; }
            // La fila se TOMA antes de mandar: dos servidores con esto encendido no la mandan dos veces.
            const { data: tomada } = await s.from(TABLA).update({ estado: 'ENVIANDO', updated_at: ahora.toISOString() })
                .eq('id', f.id).eq('estado', 'PENDIENTE').select('id');
            if (!tomada?.length) continue;
            if (!real) {
                await s.from(TABLA).update({ estado: 'COPIA', modo: 'copia', enviado_at: ahora.toISOString(), updated_at: ahora.toISOString() }).eq('id', f.id);
                hecho.push({ id: f.id, tel9: f.tel9, accion: 'copia' });
                console.log(`[bienvenida] MODO COPIA: a ${f.tel9} se le habría mandado el formulario y el vídeo.`);
                continue;
            }
            try {
                const v = await enviar(f);
                dia += 1; hora += 1;
                await s.from(TABLA).update({ estado: 'ENVIADA', modo: 'real', video: v, enviado_at: new Date(deps.ahora()).toISOString(), updated_at: new Date(deps.ahora()).toISOString() }).eq('id', f.id);
                hecho.push({ id: f.id, tel9: f.tel9, accion: 'enviada', video: v });
                console.log(`[bienvenida] enviada a ${f.tel9} (vídeo: ${v}).`);
            } catch (e) {
                await s.from(TABLA).update({ estado: 'ERROR', modo: 'real', motivo: recorta(e.message, 200), updated_at: new Date(deps.ahora()).toISOString() }).eq('id', f.id);
                hecho.push({ id: f.id, tel9: f.tel9, accion: 'error', motivo: e.message });
                console.warn(`[bienvenida] no ha salido a ${f.tel9}: ${e.message}`);
            }
        }
        return { hecho };
    } catch (e) {
        console.warn('[bienvenida] vuelta:', e.message);
        return { hecho, motivo: e.message };
    } finally {
        enCurso = false;
    }
}

/** Lo apuntado, para la pantalla o un script. */
async function listar({ limite = 100 } = {}) {
    const { data, error } = await db().from(TABLA)
        .select('id, tel9, pushname, primer_mensaje, estado, modo, motivo, enviar_at, enviado_at, video, created_at')
        .order('created_at', { ascending: false }).limit(Math.min(Number(limite) || 100, 500));
    if (error) throw new Error(error.message);
    return data || [];
}

function estado() {
    return {
        activo: activo(), modo: modo(), prueba: telefonosPrueba().size,
        horario: `${H.desde()}-${H.hasta()} h`, video: videoUrl() || null, formulario: U.enlaceFormulario(process.env.FRONTEND_URL),
        topes: { dia: CFG.topeDia, hora: CFG.topeHora, vuelta: CFG.porVuelta }, rafagasAbiertas: rafagas.size,
    };
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[bienvenida] APAGADA (WA_BIENVENIDA_ENABLED != true): a quien escribe por primera vez no se le contesta solo.');
        return;
    }
    try {
        const ws = wa();
        ws.onMessage(alMensajeEntrante);
        if (typeof ws.onMensajePropio === 'function') ws.onMensajePropio(alMensajePropio);
    } catch (e) {
        console.warn('[bienvenida] sin sesión de WhatsApp:', e.message);
        return;
    }
    handle = setInterval(() => { vuelta().catch(() => {}); }, 60_000);
    handle.unref?.();
    const p = telefonosPrueba().size;
    console.log(`[bienvenida] activa en modo ${modo().toUpperCase()}${p ? `, solo ${p} teléfono(s) de prueba` : ''}: a quien escribe por primera vez, el formulario y el vídeo (${H.desde()}-${H.hasta()} h).`);
}

module.exports = {
    start, vuelta, listar, estado, activo, modo, CFG,
    _alMensajeEntrante: alMensajeEntrante, _alMensajePropio: alMensajePropio, _evaluar: evaluar, _LEER_CHAT: LEER_CHAT,
    _telefonosConocidos: telefonosConocidos, _conocidoEnApp: conocidoEnApp,
    _deps: deps,
    _reiniciar: () => { rafagas.forEach(r => clearTimeout(r.timer)); rafagas.clear(); decididos.clear(); humanos.clear(); conocidos = { at: 0, mapa: null }; video = null; enCurso = false; },
};
