/**
 * whatsappBandeja — los chats que esperan RESPUESTA nuestra.
 *
 * El 90 % del trabajo pasa por WhatsApp, y lo que se escapa es el cliente que
 * escribió y al que nadie contestó: el mensaje se leyó en el móvil, se dejó
 * «para luego» y se hundió bajo otros veinte. Aquí se listan los chats
 * individuales cuyo ÚLTIMO mensaje es suyo y lleva más de X horas sin respuesta,
 * con quién es en la app (cliente y su obra, partner, o nadie todavía).
 *
 * REGLAS
 *  - Solo LECTURA y en memoria: UNA evaluación sobre `WAWebCollections.Chat`
 *    (como «buscar chats» de la skill de alta). Nada de `getChats`/
 *    `getChatById`/`sendSeen` (regla 39); no se marca nada como leído.
 *  - «Ya está» es del EQUIPO (tabla `whatsapp_chats_atendidos`) y vale hasta
 *    el siguiente mensaje: guarda la hora del último mensaje visto, y en cuanto
 *    llega otro posterior el chat vuelve a salir.
 *  - Lo que WhatsApp no tiene cargado no se inventa: un chat sin su último
 *    mensaje en memoria se cuenta aparte (`sinCargar`), no se da por contestado.
 *  - Con la BD caída, 503 (regla 38): una bandeja vacía se lee como «todo al día».
 */

const supabase = require('./supabaseClient');
const whatsappMedia = require('./whatsappMedia');
const { _conPlazo: conPlazo } = require('./whatsappLabels');
const { cargarRelaciones } = require('./clientesRelaciones');
const { nueve, telefonosDeCliente } = require('../utils/agendaWhatsapp');
const { esCortesia } = require('../utils/bandejaWhatsapp');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const CONFIG = {
    plazoMs: num(process.env.WA_BANDEJA_PLAZO_MS, 30_000),
    vigenciaMs: num(process.env.WA_BANDEJA_CACHE_MS, 60_000),
    diasMax: 21,          // más atrás ya no es «sin contestar», es un chat muerto
};
const TABLA = 'whatsapp_chats_atendidos';

function error(mensaje, status = 400) {
    const e = new Error(mensaje);
    e.status = status;
    return e;
}

/* eslint-disable no-undef -- se ejecuta en el navegador */
/** Chats individuales cuyo último mensaje NO es nuestro, de los últimos `dias`. */
function LEER_PENDIENTES(dias) {
    const C = window.require('WAWebCollections');
    if (!C || !C.Chat) return { error: 'WhatsApp Web todavía no ha cargado sus conversaciones.' };
    let api = null;
    try { api = window.require('WAWebApiContact'); } catch (e) { /* sin el módulo */ }
    const corte = Math.floor(Date.now() / 1000) - dias * 86400;
    const SISTEMA = new Set(['e2e_notification', 'notification_template', 'gp2', 'notification', 'protocol',
        'ciphertext', 'call_log', 'revoked']);
    const out = [];
    let sinCargar = 0;
    for (const ch of C.Chat.getModelsArray()) {
        if (!ch || ch.isGroup || !ch.id) continue;
        const server = ch.id.server;
        if (server !== 'c.us' && server !== 'lid') continue;
        if ((Number(ch.t) || 0) < corte) continue;
        const ms = ch.msgs && ch.msgs.getModelsArray ? ch.msgs.getModelsArray() : [];
        let ultimo = null;
        for (let i = ms.length - 1; i >= 0; i--) {
            const m = ms[i];
            if (m && !SISTEMA.has(m.type) && !m.isNotification) { ultimo = m; break; }
        }
        if (!ultimo) { sinCargar++; continue; }
        if (ultimo.id && ultimo.id.fromMe) continue;
        let numero = server === 'c.us' ? ch.id.user : null;
        if (!numero && api && api.getPhoneNumber) {
            try { const pn = api.getPhoneNumber(ch.id); numero = pn && pn.user ? pn.user : null; } catch (e) { /* sin número */ }
        }
        const k = ch.contact || null;
        out.push({
            chatId: ch.id._serialized || String(ch.id),
            numero,
            t: Number(ultimo.t) || Number(ch.t) || 0,
            tipo: ultimo.type,
            texto: String(ultimo.body && ultimo.type === 'chat' ? ultimo.body : (ultimo.caption || '')).slice(0, 160),
            noLeidos: Number(ch.unreadCount) || 0,
            archivado: !!ch.archive,
            nombre: (k && k.name) || null,
            pushname: (k && k.pushname) || null,
        });
    }
    return { chats: out, sinCargar };
}
/* eslint-enable no-undef */

let cache = null;
let leyendo = null;

async function leerChats() {
    if (cache && cache.hasta > Date.now()) return cache.datos;
    if (leyendo) return leyendo;
    const client = whatsappMedia._clienteWa();
    if (!client) throw error('WhatsApp no está conectado: no se pueden mirar los chats.', 503);
    leyendo = whatsappMedia._enSerie(() => conPlazo(client.pupPage.evaluate(LEER_PENDIENTES, CONFIG.diasMax), CONFIG.plazoMs, 'leer los chats'))
        .then((r) => {
            if (r?.error) throw error(r.error, 503);
            cache = { hasta: Date.now() + CONFIG.vigenciaMs, datos: r };
            return r;
        })
        .catch((e) => {
            if (e.plazoAgotado) throw error('WhatsApp tarda demasiado en dar los chats. Prueba otra vez en un momento.', 503);
            throw e;
        })
        .finally(() => { leyendo = null; });
    return leyendo;
}

const claveDe = (c) => nueve(c.numero) || c.chatId;

/** Quién es cada número en la app: clientes (con sus obras) y partners. */
async function quienes() {
    const [cli, par] = await Promise.all([
        supabase.from('clientes').select('id_cliente, nombre_razon_social, apellidos, tlf, persona_contacto_tlf, copropietarios'),
        supabase.from('prescriptores').select('id_empresa, razon_social, acronimo, tipo_empresa, tlf, tlf_responsable, contactos_notificacion'),
    ]);
    if (cli.error || par.error) throw error('No se ha podido cruzar con las fichas (la base de datos no responde).', 503);
    const clientes = new Map();
    for (const c of cli.data || []) {
        for (const { via, telefono } of telefonosDeCliente(c)) {
            if (!clientes.has(telefono)) clientes.set(telefono, []);
            clientes.get(telefono).push({
                id_cliente: c.id_cliente, via,
                nombre: `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim(),
            });
        }
    }
    const partners = new Map();
    for (const p of par.data || []) {
        const tels = [p.tlf, p.tlf_responsable,
            ...(Array.isArray(p.contactos_notificacion) ? p.contactos_notificacion.map(x => x?.tlf) : [])];
        for (const t of tels) {
            const n = nueve(t);
            if (n && !partners.has(n)) partners.set(n, { id_empresa: p.id_empresa, nombre: p.acronimo || p.razon_social, tipo: p.tipo_empresa || null });
        }
    }
    return { clientes, partners };
}

/** Las obras de un cliente, en corto: [{ codigo, estado, tipo }]; lo vivo primero. */
function obrasDe(rel) {
    if (!rel) return [];
    const exps = (rel.expedientes || []).map(e => ({ codigo: e.numero_expediente, estado: e.estado, tipo: 'expediente', id: e.id }));
    const conExp = new Set((rel.expedientes || []).map(e => e.oportunidad_id).filter(Boolean));
    const ops = (rel.oportunidades || []).filter(o => !conExp.has(o.id))
        .map(o => ({ codigo: o.id_oportunidad, estado: o.estado, tipo: 'oportunidad', id: o.id }));
    const cees = (rel.cee_directos || []).map(c => ({ codigo: c.numero_expediente, estado: c.estado, tipo: 'cee', id: c.id }));
    const cerrado = (x) => /FINALIZAD|RECHAZAD|ANULAD|ENTREGAD/i.test(String(x.estado || ''));
    return [...exps, ...ops, ...cees].filter(x => x.codigo).sort((a, b) => Number(cerrado(a)) - Number(cerrado(b))).slice(0, 4);
}

/**
 * La bandeja: chats que esperan respuesta desde hace más de `horas`.
 * { chats: [...], sinCargar, total, atendidos }.
 */
async function sinContestar({ horas = 2 } = {}) {
    const h = Math.min(Math.max(Number(horas) || 0, 0), 24 * 14);
    const [{ chats, sinCargar }, atend] = await Promise.all([
        leerChats(),
        supabase.from(TABLA).select('clave, hasta_t'),
    ]);
    if (atend.error) throw error('No se han podido leer los chats atendidos (la base de datos no responde).', 503);
    const vistoHasta = new Map((atend.data || []).map(a => [a.clave, Number(a.hasta_t) || 0]));
    const ahora = Date.now() / 1000;
    const esperando = chats.filter(c => (ahora - c.t) >= h * 3600);
    const visibles = esperando.filter(c => !(vistoHasta.get(claveDe(c)) >= c.t));
    const { clientes, partners } = await quienes();
    const idsCli = [...new Set(visibles.flatMap(c => (clientes.get(nueve(c.numero)) || []).map(x => x.id_cliente)))];
    const rel = await cargarRelaciones(idsCli, { internos: true });

    const out = visibles.map((c) => {
        const n = nueve(c.numero);
        const fichas = (n && clientes.get(n)) || [];
        const partner = (n && partners.get(n)) || null;
        return {
            clave: claveDe(c),
            chat_id: c.chatId,
            telefono: c.numero || null,
            nombre_whatsapp: c.nombre || c.pushname || null,
            pushname: c.pushname || null,
            desde: c.t,
            horas: Math.round((ahora - c.t) / 360) / 10,
            tipo: c.tipo,
            texto: c.texto,
            no_leidos: c.noLeidos,
            archivado: c.archivado,
            // «Perfecto», «muchas gracias»: cierre de conversación, no espera nada.
            cortesia: esCortesia({ tipo: c.tipo, texto: c.texto }),
            quien: fichas.length ? 'cliente' : partner ? 'partner' : 'nadie',
            clientes: fichas.map(f => ({ ...f, obras: obrasDe(rel.get(f.id_cliente)) })),
            partner,
        };
    });
    // Lo RECIENTE primero: es lo que está vivo. Por antigüedad, la cabeza eran
    // chats de hace tres semanas que ya nadie va a retomar.
    out.sort((a, b) => b.desde - a.desde);
    const cortesia = out.filter(c => c.cortesia).length;
    return {
        chats: out, sinCargar, total: out.length - cortesia, cortesia,
        atendidos: esperando.length - visibles.length, horas: h,
    };
}

/** «Ya está»: deja de salir hasta que escriba otra vez. */
async function marcarAtendido({ clave, hastaT, usuario = null }) {
    const k = String(clave || '').trim();
    const t = Math.floor(Number(hastaT) || 0);
    if (!k || !t) throw error('Falta el chat o la hora del mensaje.');
    const { error: e } = await supabase.from(TABLA).upsert({
        clave: k.slice(0, 80), hasta_t: t, atendido_por: usuario ? String(usuario).slice(0, 120) : null, updated_at: new Date().toISOString(),
    }, { onConflict: 'clave' });
    if (e) throw error(`No se ha podido marcar: ${e.message}`, 503);
    if (cache) cache.hasta = 0;
    return { ok: true };
}

module.exports = { sinContestar, marcarAtendido, CONFIG, _LEER_PENDIENTES: LEER_PENDIENTES, _obrasDe: obrasDe };
