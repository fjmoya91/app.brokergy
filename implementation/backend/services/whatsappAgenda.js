/**
 * whatsappAgenda — buscar en la AGENDA de WhatsApp a quien todavía no es cliente.
 *
 * Quien pide un CEE o una aerotermia suele llegar por WhatsApp: su nombre y su
 * número ya están en el móvil. Al dar de alta la ficha (o al mandarle una
 * oferta) se ELIGE de la agenda en vez de teclearlo, que es donde se cuela la
 * errata del teléfono. Y se dice si ese número ya está en la app: en la ficha
 * de un cliente o en la de un partner.
 *
 * REGLAS
 *  - Solo LECTURA y solo en memoria: se leen las colecciones de WhatsApp Web
 *    (`WAWebCollections.Contact` y `.Chat`) con UNA evaluación, igual que el
 *    renombrado de la agenda. Nada de `getChats`/`getChatById`/`sendSeen`
 *    (regla 39), no se crea ningún chat y no se escribe en la agenda.
 *  - En la MISMA fila que las demás lecturas (`enSerie` de `whatsappMedia`) y con
 *    plazo: es el Chrome del que depende todo lo automático de la app. Y como se
 *    busca mientras se escribe, la agenda leída se guarda unos minutos.
 *  - El cruce con la BD NO elige por nadie: un mismo móvil figura en fichas de
 *    personas distintas (regla 47), así que se devuelven TODAS las fichas que lo
 *    tienen y decide quien lo está dando de alta.
 *  - Con la BD caída se responde 503, nunca "no es cliente" (regla 38): eso
 *    invitaría a duplicar la ficha.
 */

const supabase = require('./supabaseClient');
const whatsappMedia = require('./whatsappMedia');
const { _conPlazo: conPlazo } = require('./whatsappLabels');
const {
    unirAgenda, filtrarAgenda, nombreDeContacto, obraDelPrefijo, codigoObra,
    telefonosDeCliente, textoWhatsapp, pareceInstalador, _norm: norm,
} = require('../utils/agendaWhatsapp');
const { leerPrefijo } = require('../utils/nombreContactoCliente');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const CONFIG = {
    vigenciaMs: num(process.env.WA_AGENDA_CACHE_MS, 120_000),
    plazoMs: num(process.env.WA_AGENDA_PLAZO_MS, 30_000),
    max: 10,
};
const nueve = whatsappMedia.nueve;
// Los pendientes que el equipo ha descartado (scripts/whatsapp_contactos_descartados.sql).
const TABLA_DESCARTES = 'whatsapp_contactos_descartados';

function error(mensaje, status = 400) {
    const e = new Error(mensaje);
    e.status = status;
    return e;
}

/* eslint-disable no-undef -- se ejecuta en el navegador */
/**
 * La agenda y los chats individuales, tal cual: { contactos: [{ id, numero,
 * nombre, pushname, enAgenda, chat, t }] }. Un contacto que no está guardado
 * solo entra si hay conversación con él (si no, la colección trae a todos los
 * participantes de todos los grupos).
 */
function LEER_AGENDA() {
    const C = window.require('WAWebCollections');
    if (!C || !C.Contact) return { error: 'WhatsApp Web todavía no ha cargado la agenda.' };
    let api = null;
    try { api = window.require('WAWebApiContact'); } catch (e) { /* versión sin el módulo */ }
    const ultimo = new Map();
    const etiquetasChat = new Map();   // chat → nombres de sus etiquetas
    let nombreEtiqueta = new Map();
    try {
        nombreEtiqueta = new Map((C.Label ? C.Label.getModelsArray() : []).map(l => [String(l.id), String(l.name || '')]));
    } catch (e) { /* cuenta sin etiquetas */ }
    try {
        for (const ch of C.Chat.getModelsArray()) {
            if (!ch || ch.isGroup || !ch.id) continue;
            const sid = ch.id._serialized || String(ch.id);
            ultimo.set(sid, Number(ch.t) || 0);
            const ls = (ch.labels || []).map(x => nombreEtiqueta.get(String(x))).filter(Boolean);
            if (ls.length) etiquetasChat.set(sid, ls);
        }
    } catch (e) { /* sin chats cargados: solo la agenda */ }
    const out = [];
    for (const c of C.Contact.getModelsArray()) {
        const id = c && c.id;
        if (!id || (id.server !== 'c.us' && id.server !== 'lid')) continue;
        if (c.isMe || c.isGroup) continue;
        const sid = id._serialized || String(id);
        const enAgenda = !!(c.isAddressBookContact || c.isMyContact);
        const chat = ultimo.has(sid);
        if (!enAgenda && !chat) continue;
        let numero = id.server === 'c.us' ? id.user : null;
        if (!numero && api && api.getPhoneNumber) {
            // Un @lid lleva el número escondido; si WhatsApp ya lo conoce, lo da sin preguntar a nadie.
            try { const pn = api.getPhoneNumber(id); numero = pn && pn.user ? pn.user : null; } catch (e) { /* sin número */ }
        }
        out.push({
            id: sid, numero, nombre: c.name || null, pushname: c.pushname || null, enAgenda, chat,
            t: ultimo.get(sid) || 0, etiquetas: etiquetasChat.get(sid) || [],
        });
    }
    return { contactos: out };
}
/* eslint-enable no-undef */

let cache = null;      // { hasta, agenda }
let leyendo = null;    // la lectura en curso: dos búsquedas a la vez leen UNA vez

async function agenda() {
    if (cache && cache.hasta > Date.now()) return cache.agenda;
    if (leyendo) return leyendo;
    const client = whatsappMedia._clienteWa();
    if (!client) throw error('WhatsApp no está conectado: no se puede buscar en la agenda.', 503);
    leyendo = whatsappMedia._enSerie(() => conPlazo(client.pupPage.evaluate(LEER_AGENDA), CONFIG.plazoMs, 'leer la agenda'))
        .then((r) => {
            if (r?.error) throw error(r.error, 503);
            const a = unirAgenda(r?.contactos || []);
            cache = { hasta: Date.now() + CONFIG.vigenciaMs, agenda: a };
            return a;
        })
        .catch((e) => {
            if (e.plazoAgotado) throw error('WhatsApp tarda demasiado en dar la agenda. Prueba otra vez en un momento.', 503);
            throw e;
        })
        .finally(() => { leyendo = null; });
    return leyendo;
}

/** Quién tiene cada teléfono en la BD: clientes (titular, contacto, copropietarios) y partners. */
async function fichasPorTelefono() {
    const [cli, par] = await Promise.all([
        supabase.from('clientes').select('id_cliente, nombre_razon_social, apellidos, tlf, persona_contacto_tlf, copropietarios'),
        supabase.from('prescriptores').select('id_empresa, razon_social, acronimo, tlf, tlf_responsable, contactos_notificacion'),
    ]);
    if (cli.error || par.error) {
        throw error('No se ha podido comprobar si ya es cliente (la base de datos no responde). Prueba otra vez en un momento.', 503);
    }
    const clientes = new Map();
    for (const c of cli.data || []) {
        const vias = [['titular', c.tlf], ['persona de contacto', c.persona_contacto_tlf],
            ...(Array.isArray(c.copropietarios) ? c.copropietarios.map(x => ['copropietario', x?.tlf]) : [])];
        const vistos = new Set();
        for (const [via, t] of vias) {
            const n = nueve(t);
            if (!n || vistos.has(n)) continue;
            vistos.add(n);
            if (!clientes.has(n)) clientes.set(n, []);
            clientes.get(n).push({
                id_cliente: c.id_cliente,
                nombre: `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim(),
                via,
            });
        }
    }
    const partnersPorTlf = new Map();
    const partners = (par.data || []).map(p => ({ id_empresa: p.id_empresa, nombre: p.acronimo || p.razon_social, razon: p.razon_social }));
    for (const p of par.data || []) {
        const tels = [p.tlf, p.tlf_responsable,
            ...(Array.isArray(p.contactos_notificacion) ? p.contactos_notificacion.map(x => x?.tlf) : [])];
        for (const t of tels) {
            const n = nueve(t);
            if (n && !partnersPorTlf.has(n)) partnersPorTlf.set(n, { id_empresa: p.id_empresa, nombre: p.acronimo || p.razon_social });
        }
    }
    return { clientes, partnersPorTlf, partners };
}

/**
 * El partner que dice el paréntesis del contacto ("Irene Lopez (Gonzagarri)").
 * Solo si casa con UNO: con dos posibles no se adivina.
 */
function partnerDePista(pista, partners) {
    const h = norm(pista);
    if (h.length < 3) return null;
    const casan = partners.filter(p => [p.nombre, p.razon].some(x => {
        const v = norm(x);
        return v && (v === h || v.startsWith(`${h} `) || h === v.split(/\s+/)[0]);
    }));
    return casan.length === 1 ? { id_empresa: casan[0].id_empresa, nombre: casan[0].nombre } : null;
}

/** Los contactos que casan con `q`, con lo que la app ya sabe de cada número. */
async function buscar(q) {
    const texto = String(q || '').trim().slice(0, 80);
    if (texto.replace(/\s/g, '').length < 3) return { contactos: [] };
    const halla = filtrarAgenda(await agenda(), texto, CONFIG.max);
    if (!halla.length) return { contactos: [] };
    const { clientes, partnersPorTlf, partners } = await fichasPorTelefono();
    return {
        contactos: halla.map((c) => {
            const n = nueve(c.numero);
            const propuesta = nombreDeContacto(c.nombre, c.pushname);
            return {
                telefono: c.numero || null,
                nombre_agenda: c.nombre || null,
                pushname: c.pushname || null,
                en_agenda: !!c.enAgenda,
                con_chat: !!c.chat,
                propuesta,
                clientes: (n && clientes.get(n)) || [],
                partner: (n && partnersPorTlf.get(n)) || null,
                partner_sugerido: propuesta.partner ? partnerDePista(propuesta.partner, partners) : null,
            };
        }),
    };
}

/**
 * PENDIENTES DE ALTA: contactos de la agenda que llevan el prefijo de la casa
 * ("RES080 Jesús Quero (Foncaman)", "RES060_OP212 María") y cuyo número no
 * está en NINGUNA ficha, ni de cliente ni de partner. El prefijo lo pone una
 * persona cuando el contacto ya es un asunto de trabajo: si no tiene ficha, es
 * que el alta se quedó por hacer.
 *
 * Según lo que diga el prefijo:
 *  - sin número ("RES080 …")                → pendiente, sin obra.
 *  - una OPORTUNIDAD sin cliente ("_OP212")  → pendiente, y el alta la VINCULA.
 *  - una oportunidad con cliente, un EXPEDIENTE o un CEE que existen → NO se
 *    propone: la obra ya tiene su cliente y ese número es otro (el hijo, la
 *    pareja). Se cuenta aparte, para que no parezca que se ha perdido.
 *  - un número que no existe en la app (la numeración vieja, "RES060-08") →
 *    pendiente, con la nota.
 */
async function pendientesDeAlta() {
    const ag = await agenda();
    const conPrefijo = ag.filter(c => c.enAgenda && c.nombre && c.numero && leerPrefijo(c.nombre));
    const [{ clientes, partnersPorTlf, partners }, desc] = await Promise.all([
        fichasPorTelefono(),
        supabase.from(TABLA_DESCARTES).select('telefono, nombre_agenda, descartado_por, created_at')
            .order('created_at', { ascending: false }),
    ]);
    if (desc.error) {
        throw error('No se han podido leer los descartados (la base de datos no responde). Prueba otra vez en un momento.', 503);
    }
    const descartados = new Set((desc.data || []).map(d => d.telefono));
    const sinFicha = conPrefijo.filter((c) => {
        const n = nueve(c.numero);
        return n && !clientes.has(n) && !partnersPorTlf.has(n) && !descartados.has(n);
    });

    const obras = sinFicha.map(c => obraDelPrefijo(leerPrefijo(c.nombre).prefijo));
    const hace = (tipo) => obras.some(o => o && o.tipo === tipo);
    const [ops, exps, cees] = await Promise.all([
        hace('oportunidad') ? supabase.from('oportunidades').select('id_oportunidad, cliente_id, prescriptor_id, instalador_asociado_id') : { data: [] },
        hace('expediente') ? supabase.from('expedientes').select('numero_expediente') : { data: [] },
        hace('cee') ? supabase.from('cee_directos').select('numero_expediente') : { data: [] },
    ]);
    if (ops.error || exps.error || cees.error) {
        throw error('No se han podido comprobar las obras (la base de datos no responde). Prueba otra vez en un momento.', 503);
    }
    // "26RES060_OP212" → "RES060_OP212": el año no va en el prefijo de la agenda.
    const opPorCodigo = new Map((ops.data || []).map(o => [codigoObra(o.id_oportunidad), o]));
    const expedientes = new Set([...(exps.data || []), ...(cees.data || [])].map(e => codigoObra(e.numero_expediente)));

    const pendientes = [];
    let conObra = 0;
    sinFicha.forEach((c, i) => {
        const obra = obras[i];
        let oportunidad = null;
        let nota = null;
        if (obra?.tipo === 'oportunidad') {
            const o = opPorCodigo.get(obra.codigo);
            if (o?.cliente_id) { conObra++; return; }
            if (o) oportunidad = { id_oportunidad: o.id_oportunidad, prescriptor_id: o.prescriptor_id || null, instalador_asociado_id: o.instalador_asociado_id || null };
            else nota = `${obra.codigo} no existe en la app`;
        } else if (obra) {
            if (expedientes.has(obra.codigo)) { conObra++; return; }
            nota = `${obra.codigo} no existe en la app`;
        }
        const propuesta = nombreDeContacto(c.nombre, c.pushname);
        pendientes.push({
            telefono: c.numero,
            nombre_agenda: c.nombre,
            propuesta,
            ficha: leerPrefijo(c.nombre).ficha,
            oportunidad,
            nota,
            partner_sugerido: propuesta.partner ? partnerDePista(propuesta.partner, partners) : null,
            t: c.t || 0,
        });
    });
    // Lo que se ha hablado hace poco, primero: es lo que está vivo.
    pendientes.sort((a, b) => (b.t - a.t) || a.propuesta.completo.localeCompare(b.propuesta.completo, 'es'));
    return { pendientes, conObra, conPrefijo: conPrefijo.length, descartados: desc.data || [] };
}

/**
 * DESCARTAR un pendiente: deja de proponerse a todo el equipo. Es reversible
 * (`recuperar`) y no toca la agenda ni ninguna ficha. Se guarda por los 9
 * dígitos, como se casa con las fichas.
 */
async function descartar({ telefono, nombreAgenda = null, usuario = null }) {
    const n = nueve(telefono);
    if (!n) throw error('Falta el teléfono del contacto que se descarta.');
    const { error: e } = await supabase.from(TABLA_DESCARTES).upsert({
        telefono: n,
        nombre_agenda: nombreAgenda ? String(nombreAgenda).slice(0, 120) : null,
        descartado_por: usuario ? String(usuario).slice(0, 120) : null,
    }, { onConflict: 'telefono' });
    if (e) throw error(`No se ha podido descartar: ${e.message}`, 503);
    return { ok: true, telefono: n };
}

async function recuperar(telefono) {
    const n = nueve(telefono);
    if (!n) throw error('Falta el teléfono del contacto que se recupera.');
    const { error: e } = await supabase.from(TABLA_DESCARTES).delete().eq('telefono', n);
    if (e) throw error(`No se ha podido recuperar: ${e.message}`, 503);
    return { ok: true, telefono: n };
}

/**
 * INSTALADORES PENDIENTES DE ALTA: contactos que parecen del ramo (etiqueta
 * INSTALADORES o «Inst. …», «Fontanería …») y cuyo número no está en ningún
 * partner ni en ningún cliente. Los descartes son los mismos que los de los
 * clientes (por teléfono, para todo el equipo).
 */
async function instaladoresPendientes() {
    const ag = await agenda();
    const candidatos = ag.filter(c => c.numero && (c.enAgenda || (c.etiquetas || []).length) && pareceInstalador(c));
    const [{ clientes, partnersPorTlf }, desc] = await Promise.all([
        fichasPorTelefono(),
        supabase.from(TABLA_DESCARTES).select('telefono'),
    ]);
    if (desc.error) throw error('No se han podido leer los descartados (la base de datos no responde).', 503);
    const descartados = new Set((desc.data || []).map(d => d.telefono));
    const pendientes = candidatos
        .filter((c) => { const n = nueve(c.numero); return n && !partnersPorTlf.has(n) && !clientes.has(n) && !descartados.has(n); })
        .map(c => ({
            telefono: c.numero,
            nombre_agenda: c.nombre || null,
            pushname: c.pushname || null,
            etiquetas: c.etiquetas || [],
            propuesta: (c.nombre || c.pushname || '').replace(/\s+/g, ' ').trim(),
            t: c.t || 0,
        }))
        .sort((a, b) => (b.t - a.t) || a.propuesta.localeCompare(b.propuesta, 'es'));
    return { pendientes };
}

/* eslint-disable no-undef -- se ejecuta en el navegador */
/** Tarjetas de contacto (vCard) recibidas en chats individuales desde `corte`. Solo lo cargado. */
function LEER_VCARDS(corte) {
    const C = window.require('WAWebCollections');
    if (!C || !C.Chat) return { error: 'WhatsApp Web todavía no ha cargado sus conversaciones.' };
    let api = null;
    try { api = window.require('WAWebApiContact'); } catch (e) { /* sin el módulo */ }
    const out = [];
    for (const ch of C.Chat.getModelsArray()) {
        if (!ch || ch.isGroup || !ch.id || (Number(ch.t) || 0) < corte) continue;
        const ms = ch.msgs && ch.msgs.getModelsArray ? ch.msgs.getModelsArray() : [];
        for (const m of ms) {
            if (!m || (m.type !== 'vcard' && m.type !== 'multi_vcard') || (Number(m.t) || 0) < corte) continue;
            if (m.id && m.id.fromMe) continue;
            let numero = ch.id.server === 'c.us' ? ch.id.user : null;
            if (!numero && api && api.getPhoneNumber) {
                try { const pn = api.getPhoneNumber(ch.id); numero = pn && pn.user ? pn.user : null; } catch (e) { /* sin número */ }
            }
            const vcards = m.type === 'vcard' ? [String(m.body || '')]
                : (Array.isArray(m.vcardList) ? m.vcardList.map(v => String((v && v.vcard) || '')) : []);
            out.push({ numero, t: Number(m.t) || 0, vcards: vcards.map(v => v.slice(0, 4000)) });
        }
    }
    return { mensajes: out };
}
/* eslint-enable no-undef */

/**
 * CONTACTOS COMPARTIDOS: las tarjetas de contacto que nos han mandado (un
 * instalador que pasa el contacto de un cliente) en los últimos `dias`, cuyo
 * número todavía no está en ninguna ficha. Quien la compartió, si es partner,
 * va como sugerencia de «quién nos lo trae». Solo lo que WhatsApp tiene cargado
 * en memoria: no se abren conversaciones para buscar.
 */
async function contactosCompartidos({ dias = 30 } = {}) {
    const { leerVcard } = require('./whatsappConversacion');
    const client = whatsappMedia._clienteWa();
    if (!client) throw error('WhatsApp no está conectado: no se pueden leer los contactos compartidos.', 503);
    const corte = Math.floor(Date.now() / 1000) - Math.min(Math.max(Number(dias) || 30, 1), 90) * 86400;
    const r = await whatsappMedia._enSerie(() => conPlazo(client.pupPage.evaluate(LEER_VCARDS, corte), CONFIG.plazoMs, 'leer los contactos compartidos'))
        .catch((e) => { throw e.plazoAgotado ? error('WhatsApp tarda demasiado. Prueba otra vez en un momento.', 503) : e; });
    if (r?.error) throw error(r.error, 503);
    const [{ clientes, partnersPorTlf }, desc] = await Promise.all([
        fichasPorTelefono(),
        supabase.from(TABLA_DESCARTES).select('telefono'),
    ]);
    if (desc.error) throw error('No se han podido leer los descartados (la base de datos no responde).', 503);
    const descartados = new Set((desc.data || []).map(d => d.telefono));
    // Quién la pasó, como está en la agenda («Manuel Instalador Quintanar»), no solo su número.
    const idx = indiceAgenda(await agenda());
    const vistos = new Set();
    const out = [];
    for (const m of (r?.mensajes || []).sort((a, b) => b.t - a.t)) {
        const deNueve = nueve(m.numero);
        const deAgenda = deNueve ? idx.get(deNueve) : null;
        for (const raw of m.vcards) {
            const v = leerVcard(raw);
            for (const tel of v?.telefonos || []) {
                const n = nueve(tel);
                if (!n || vistos.has(n)) continue;
                vistos.add(n);
                if (clientes.has(n) || partnersPorTlf.has(n) || descartados.has(n)) continue;
                const propuesta = nombreDeContacto(v.nombre || '');
                out.push({
                    telefono: tel,
                    nombre_tarjeta: v.nombre || null,
                    propuesta,
                    t: m.t,
                    compartido_por: {
                        telefono: m.numero || null,
                        nombre: deAgenda ? (deAgenda.nombre || deAgenda.pushname || null) : null,
                        partner: (deNueve && partnersPorTlf.get(deNueve)) || null,
                        clientes: (deNueve && clientes.get(deNueve)) || [],
                    },
                });
            }
        }
    }
    return { contactos: out, dias };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL NOMBRE DE WHATSAPP EN LA FICHA (2026-10-13)
//
// Cómo está guardado cada teléfono del cliente en la agenda («RES060_225
// Ceferino (ISM)») y cómo se ha puesto él («Cefe»). Se enseña en la ficha y se
// guarda en `clientes.whatsapp_nombres` (texto) para que el BUSCADOR de Clientes
// lo encuentre sin preguntar a WhatsApp. Se escribe solo si cambia.
// ─────────────────────────────────────────────────────────────────────────────

/** Índice 9 dígitos → entrada de la agenda. */
function indiceAgenda(ag) {
    const idx = new Map();
    for (const c of ag) {
        const n = nueve(c.numero);
        if (n && !idx.has(n)) idx.set(n, c);
    }
    return idx;
}

function datoDe(entrada, via, telefono) {
    if (!entrada) return { via, telefono, en_whatsapp: false };
    return {
        via, telefono,
        en_whatsapp: true,
        nombre_agenda: entrada.nombre || null,
        pushname: entrada.pushname || null,
        en_agenda: !!entrada.enAgenda,
        con_chat: !!entrada.chat,
        t: entrada.t || 0,
        numero: entrada.numero,
    };
}

/** Los teléfonos de UN cliente con su nombre en WhatsApp; guarda el texto de búsqueda si ha cambiado. */
async function whatsappDeCliente(idCliente) {
    const { data: c, error: e } = await supabase.from('clientes')
        .select('id_cliente, tlf, persona_contacto_tlf, copropietarios, whatsapp_nombres')
        .eq('id_cliente', idCliente).maybeSingle();
    if (e) throw error('No se ha podido leer el cliente (la base de datos no responde).', 503);
    if (!c) throw error('Cliente no encontrado.', 404);
    const idx = indiceAgenda(await agenda());
    const telefonos = telefonosDeCliente(c).map(({ via, telefono }) => datoDe(idx.get(telefono), via, telefono));
    const texto = textoWhatsapp(telefonos.filter(t => t.en_whatsapp).map(t => ({ nombre: t.nombre_agenda, pushname: t.pushname })));
    if ((texto || null) !== (c.whatsapp_nombres || null)) {
        await supabase.from('clientes').update({ whatsapp_nombres: texto }).eq('id_cliente', c.id_cliente);
    }
    return { telefonos, whatsapp_nombres: texto };
}

/**
 * Repasa TODOS los clientes contra la agenda y deja al día su texto de
 * búsqueda. Solo lee de WhatsApp (una evaluación); escribe en la BD solo lo que
 * cambia. `dryRun` por defecto.
 */
async function sincronizarNombres({ dryRun = true } = {}) {
    const idx = indiceAgenda(await agenda());
    const { data, error: e } = await supabase.from('clientes')
        .select('id_cliente, tlf, persona_contacto_tlf, copropietarios, whatsapp_nombres');
    if (e) throw error('No se han podido leer los clientes (la base de datos no responde).', 503);
    const cambios = [];
    let conWhatsapp = 0;
    for (const c of data || []) {
        const ents = telefonosDeCliente(c).map(t => idx.get(t.telefono)).filter(Boolean);
        if (ents.length) conWhatsapp++;
        const texto = textoWhatsapp(ents);
        if ((texto || null) !== (c.whatsapp_nombres || null)) cambios.push({ id_cliente: c.id_cliente, texto });
    }
    const informe = { clientes: (data || []).length, conWhatsapp, cambios: cambios.length, dryRun, errores: 0 };
    if (dryRun) return informe;
    // De diez en diez: son UPDATE sueltos (un upsert parcial no vale: el INSERT pide el nombre).
    for (let i = 0; i < cambios.length; i += 10) {
        const r = await Promise.all(cambios.slice(i, i + 10).map(x =>
            supabase.from('clientes').update({ whatsapp_nombres: x.texto }).eq('id_cliente', x.id_cliente)));
        informe.errores += r.filter(x => x.error).length;
    }
    return informe;
}

/** Tira la agenda leída: tras renombrar contactos, la siguiente lectura trae lo nuevo. */
function olvidarAgenda() { cache = null; }

module.exports = {
    olvidarAgenda,
    buscar, pendientesDeAlta, instaladoresPendientes, contactosCompartidos, descartar, recuperar, whatsappDeCliente, sincronizarNombres, CONFIG,
    _LEER_AGENDA: LEER_AGENDA, _partnerDePista: partnerDePista,
};
