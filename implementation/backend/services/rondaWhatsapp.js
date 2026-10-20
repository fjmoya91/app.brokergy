// =============================================================================
// rondaWhatsapp — la RONDA NOCTURNA de WhatsApp, FASE 1: en seco (2026-10-19)
// -----------------------------------------------------------------------------
// El 90 % del trabajo entra por WhatsApp y lo que se manda por ahí no siempre
// acaba en la app: el radar cree entonces que la pelota es del instalador cuando
// ya mandó la factura, y nadie lo mueve. Cada noche se leen los chats con
// mensajes NUEVOS de quien tiene algo vivo (cliente, instalador o certificador
// con expediente, oportunidad o CEE directo) y se dice:
//   · a qué obra va cada adjunto y en qué apartado iría (el repartidor de siempre),
//   · qué preguntaron sin respuesta y qué se prometió,
//   · qué borrador se le contestaría (con el dossier del bot, enlaces por el código).
//
// FASE 1 = EN SECO: no coloca, no anota en el historial y no escribe a nadie.
// Solo manda a FRAN el informe por EMAIL y un resumen CORTO al chat del
// asistente. Lo único que escribe es su propio estado (`app_settings`, para no
// avisar dos veces el mismo día) y sus ficheros en `scratch/ronda/`. El checklist
// y el dossier se piden en modo `soloLectura` (sin backfill ni token nuevo).
//
// REGLAS (medidas en dos pasadas sobre 120 chats reales; ver docs/conocimiento):
//  - NACE APAGADA (`WA_RONDA_ENABLED=true` solo en el VPS): en local la sesión de
//    WhatsApp es la misma cuenta y la BD es la de producción.
//  - Lee de madrugada y AVISA a las 9:00 (un aviso de madrugada despierta a nadie
//    y no lo puede recoger nadie). Un solo aviso al día, aunque se reinicie.
//  - Las lecturas van por `whatsappConversacion` (en fila y con plazo, sin
//    `getChatById`): es el mismo Chrome del que depende todo lo automático.
//  - Los ENLACES y los PÁRRAFOS del borrador los pone el código (rondaWhatsappIA).
// =============================================================================

const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const waConversacion = require('./whatsappConversacion');
const reformaUploadService = require('./reformaUploadService');
const botContexto = require('./botContexto');
const clasificarFotos = require('./clasificarFotosService');
const IA = require('./rondaWhatsappIA');
const Informe = require('./rondaWhatsappInforme');
const { esCortesia } = require('../utils/bandejaWhatsapp');
const { nueve, telefonosDeCliente } = require('../utils/agendaWhatsapp');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && v !== '' && v != null ? n : d; };

const CONFIG = {
    activo: () => process.env.WA_RONDA_ENABLED === 'true',
    horaLectura: num(process.env.WA_RONDA_HORA, 5),            // desde aquí se lee…
    horaAviso: num(process.env.WA_RONDA_HORA_AVISO, 9),         // …y desde aquí se avisa
    horaLimite: 13,                                             // pasado esto, el de hoy ya no sale
    diasContexto: 7,                                            // lo que el modelo ve de cada chat
    maxDiasVentana: 7,                                          // lo NUEVO, como mucho una semana
    maxChats: num(process.env.WA_RONDA_MAX_CHATS, 300),
    maxAdjuntosChat: num(process.env.WA_RONDA_MAX_ADJUNTOS, 30),
    tickMs: 10 * 60 * 1000,
    purgaDias: 30,
    dirSalida: path.join(__dirname, '..', 'scratch', 'ronda'),
    clave: 'ronda_whatsapp_estado',
    // El modelo de la ronda (análisis) y el de los borradores. Precios y medidas en
    // rondaWhatsappIA (PRECIOS) y en la documentación de la ronda.
    modelo: () => process.env.WA_RONDA_MODELO || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    modeloBorrador: () => process.env.WA_RONDA_MODELO_BORRADOR || process.env.WA_RONDA_MODELO || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    // El chat del asistente (el grupo de Fran); si no, el del admin del parte.
    destinoWa: () => process.env.WA_RONDA_DESTINO || process.env.ASISTENTE_WHATSAPP_GRUPO || process.env.WHATSAPP_ADMIN_CHAT || null,
    email: () => process.env.ADMIN_EMAIL || null,
};

const CERRADO = /FINALIZAD|RECHAZAD|ANULAD|ENTREGAD|PERDID|DESCARTAD|CANCELAD/i;
const corta = IA.corta;
const fecha = IA.fecha;
const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const horaMadrid = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const log = (...a) => console.log('[ronda]', ...a);

function error(mensaje, status = 500) { const e = new Error(mensaje); e.status = status; return e; }

async function todas(tabla, select, filtro) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {
        let q = supabase.from(tabla).select(select).range(desde, desde + 999);
        if (filtro) q = filtro(q);
        const { data, error: e } = await q;
        // Con la BD caída no se inventa una ronda vacía (regla 38): se corta.
        if (e) throw error(`La base de datos no responde (${tabla}): ${e.message}`, 503);
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EL UNIVERSO — quién tiene algo vivo y con qué teléfonos
// ─────────────────────────────────────────────────────────────────────────────
async function cargarUniverso() {
    // Campos CONCRETOS: nunca `datos_calculo` ni `documentacion` enteros (regla 22).
    const [clientes, ops, exps, cees, partners] = await Promise.all([
        todas('clientes', 'id_cliente, nombre_razon_social, apellidos, tlf, persona_contacto_tlf, copropietarios, municipio, direccion'),
        todas('oportunidades', 'id, id_oportunidad, referencia_cliente, ref_catastral, cliente_id, prescriptor_id, instalador_asociado_id, certificador_asociado_id, ficha, created_at, estado, estado_dc:datos_calculo->>estado'),
        todas('expedientes', 'id, numero_expediente, estado, cliente_id, oportunidad_id, instalador_asociado_id, certificador_id:cee->>certificador_id'),
        todas('cee_directos', 'id, numero_expediente, nombre, estado, cliente_id, prescriptor_id, municipio, direccion, ref_catastral'),
        todas('prescriptores', 'id_empresa, razon_social, acronimo, tipo_empresa, tlf, tlf_responsable, tlf_contacto, nombre_responsable, contactos_notificacion'),
    ]);
    const cliPorId = new Map(clientes.map(c => [c.id_cliente, c]));
    const opPorId = new Map(ops.map(o => [o.id, o]));
    const nombreCli = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim() : null);
    const haceDias = (iso) => (Date.now() - new Date(iso).getTime()) / 86400_000;

    const obras = [];
    const conExp = new Set();
    for (const e of exps) {
        if (e.oportunidad_id) conExp.add(e.oportunidad_id);
        if (CERRADO.test(String(e.estado || ''))) continue;
        const op = opPorId.get(e.oportunidad_id) || {};
        const c = cliPorId.get(e.cliente_id || op.cliente_id);
        obras.push({
            tipo: 'expediente', codigo: e.numero_expediente, estado: e.estado, expediente_id: e.id,
            oportunidad_id: e.oportunidad_id || null, id_oportunidad: op.id_oportunidad || null,
            ficha: op.ficha || null, referencia: op.referencia_cliente || null, rc: op.ref_catastral || null,
            cliente_id: c?.id_cliente || null, cliente: nombreCli(c), municipio: c?.municipio || null, direccion: c?.direccion || null,
            instalador_ids: [e.instalador_asociado_id, op.instalador_asociado_id, op.prescriptor_id].filter(Boolean),
            certificador_ids: [e.certificador_id, op.certificador_asociado_id].filter(Boolean),
        });
    }
    for (const o of ops) {
        if (conExp.has(o.id)) continue;
        const est = String(o.estado_dc || o.estado || '');
        if (/RECHAZAD|PERDID|DESCARTAD|ANULAD/i.test(est)) continue;
        if (haceDias(o.created_at) > 180) continue;
        const c = cliPorId.get(o.cliente_id);
        obras.push({
            tipo: 'oportunidad', codigo: o.id_oportunidad, estado: est || null, expediente_id: null,
            oportunidad_id: o.id, id_oportunidad: o.id_oportunidad, ficha: o.ficha || null,
            referencia: o.referencia_cliente || null, rc: o.ref_catastral || null,
            cliente_id: c?.id_cliente || null, cliente: nombreCli(c), municipio: c?.municipio || null, direccion: c?.direccion || null,
            instalador_ids: [o.instalador_asociado_id, o.prescriptor_id].filter(Boolean),
            certificador_ids: [o.certificador_asociado_id].filter(Boolean),
        });
    }
    for (const x of cees) {
        if (CERRADO.test(String(x.estado || ''))) continue;
        const c = cliPorId.get(x.cliente_id);
        obras.push({
            tipo: 'cee', codigo: x.numero_expediente, estado: x.estado, expediente_id: null, oportunidad_id: null,
            id_oportunidad: null, ficha: 'CEE DIRECTO', referencia: x.nombre || null, rc: x.ref_catastral || null,
            cliente_id: c?.id_cliente || null, cliente: nombreCli(c) || x.nombre, municipio: x.municipio || c?.municipio || null,
            direccion: x.direccion || c?.direccion || null, instalador_ids: [x.prescriptor_id].filter(Boolean), certificador_ids: [],
        });
    }

    const porTel = new Map();
    const anota = (tel, persona) => {
        const n = nueve(tel);
        if (!n) return;
        if (!porTel.has(n)) porTel.set(n, []);
        const l = porTel.get(n);
        if (!l.some(p => p.tipo === persona.tipo && p.id === persona.id)) l.push(persona);
    };
    const obrasDeCliente = new Map();
    for (const o of obras) {
        if (!o.cliente_id) continue;
        if (!obrasDeCliente.has(o.cliente_id)) obrasDeCliente.set(o.cliente_id, []);
        obrasDeCliente.get(o.cliente_id).push(o);
    }
    for (const c of clientes) {
        if (!obrasDeCliente.has(c.id_cliente)) continue;
        for (const { via, telefono } of telefonosDeCliente(c)) anota(telefono, { tipo: 'cliente', id: c.id_cliente, nombre: nombreCli(c), via });
    }
    const obrasDePartner = new Map();
    for (const p of partners) {
        const tipo = String(p.tipo_empresa || '').toUpperCase();
        let suyas = [];
        if (tipo === 'CERTIFICADOR') suyas = obras.filter(o => o.certificador_ids.includes(p.id_empresa));
        else if (['INSTALADOR', 'DISTRIBUIDOR', 'OTRO'].includes(tipo)) suyas = obras.filter(o => o.instalador_ids.includes(p.id_empresa));
        if (!suyas.length) continue;
        obrasDePartner.set(p.id_empresa, suyas);
        const tels = [p.tlf, p.tlf_responsable, p.tlf_contacto,
            ...(Array.isArray(p.contactos_notificacion) ? p.contactos_notificacion.map(x => x?.tlf) : [])];
        for (const t of tels) anota(t, { tipo: 'partner', id: p.id_empresa, nombre: p.acronimo || p.razon_social, rol: tipo, persona: p.nombre_responsable || null });
    }
    return { obras, porTel, obrasDeCliente, obrasDePartner };
}

function obrasDeChat(personas, u) {
    const vistas = new Map();
    for (const p of personas) {
        const l = p.tipo === 'cliente' ? (u.obrasDeCliente.get(p.id) || []) : (u.obrasDePartner.get(p.id) || []);
        for (const o of l) if (o.codigo && !vistas.has(o.codigo)) vistas.set(o.codigo, o);
    }
    return [...vistas.values()].sort((a, b) => String(b.codigo).localeCompare(String(a.codigo), 'es', { numeric: true })).slice(0, 60);
}

// Un teléfono de PARTNER que además sale en fichas de cliente casi siempre es la
// oficina del instalador puesta como contacto (medido: uno en 10 fichas). Habla
// el instalador; solo es «ambos» si en alguna ficha es el TITULAR.
function rolDe(personas) {
    const partner = personas.find(p => p.tipo === 'partner');
    if (!partner) return 'cliente';
    const rolP = partner.rol === 'CERTIFICADOR' ? 'certificador' : 'instalador';
    return personas.some(p => p.tipo === 'cliente' && p.via === 'titular') ? (rolP === 'instalador' ? 'ambos' : rolP) : rolP;
}

function tituloDe(personas, nombreMovil) {
    const partners = [...new Set(personas.filter(p => p.tipo === 'partner').map(p => p.nombre).filter(Boolean))];
    const clientes = [...new Set(personas.filter(p => p.tipo === 'cliente').map(p => p.nombre).filter(Boolean))];
    let t;
    if (partners.length) {
        t = partners.join(' / ');
        if (clientes.length === 1) t += ` (y en la ficha de ${clientes[0]})`;
        else if (clientes.length > 1) t += ` (contacto en ${clientes.length} fichas de cliente)`;
    } else t = clientes.slice(0, 2).join(' / ') + (clientes.length > 2 ? ` y ${clientes.length - 2} más` : '');
    return `${t || 'sin nombre'}${nombreMovil ? ` — «${nombreMovil}» en el móvil` : ''}`;
}

/**
 * ¿Lo NUEVO de ellos es solo cortesía («gracias», «perfecto», un emoji) y sin
 * adjuntos? Entonces no hay nada que colocar ni que contestar y el chat no se
 * analiza: no se gasta una llamada en un «ok». Mismo criterio que la bandeja.
 */
function soloCortesia(ms, desdeSeg) {
    const nuevos = ms.filter(m => !m.de_mi && m.t >= desdeSeg);
    return nuevos.length > 0 && nuevos.every(m => (m.tipo === 'chat' || m.tipo === 'sticker') && esCortesia({ tipo: m.tipo, texto: m.texto }));
}

async function cargarEnviosApp(desdeSeg) {
    const filas = await todas('whatsapp_queue', 'message', q => q.gte('created_at', new Date(desdeSeg * 1000).toISOString()));
    return new Set(filas.map(f => IA.huella(f.message)).filter(Boolean));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. UN CHAT — adjuntos, análisis, apartados y borrador
// ─────────────────────────────────────────────────────────────────────────────
async function bajarAdjuntos(ms, desdeSeg, cont) {
    // Solo lo NUEVO de ELLOS: lo de días anteriores ya salió en su ronda.
    const suyos = ms.filter(m => !m.de_mi && IA.MEDIA.has(m.tipo) && m.t >= desdeSeg);
    const ids = suyos.map(m => m.id);
    const colocadas = new Map();
    for (let i = 0; i < ids.length; i += 50) {   // por lotes: un .in() largo revienta la cabecera
        const { data } = await supabase.from('whatsapp_media_importada')
            .select('wa_msg_id, oportunidad_id, slot').in('wa_msg_id', ids.slice(i, i + 50));
        for (const r of data || []) colocadas.set(r.wa_msg_id, r);
    }
    let n = 0;
    for (const m of suyos) {
        if (colocadas.has(m.id)) { m._colocada = colocadas.get(m.id); cont.yaColocadas++; continue; }
        if (n >= CONFIG.maxAdjuntosChat) { m._error = 'fuera del tope de adjuntos por chat'; continue; }
        n++;
        if (m.tipo === 'video') { m._video = true; cont.videos++; continue; }
        if (m.tipo === 'ptt' || m.tipo === 'audio') {
            try { m._transcripcion = (await waConversacion.transcribir(m.id)).texto; cont.audios++; }
            catch (e) { m._error = `audio: ${e.message}`; }
            continue;
        }
        if (!m.descargable) { m._error = 'no descargable (ver una vez o demasiado grande)'; continue; }
        try {
            m._fichero = await waConversacion.descargarAdjunto(m.id);
            if (m.tipo === 'image') cont.fotos++; else cont.documentos++;
        } catch (e) { m._error = `bajar: ${e.message}`; }
    }
    return suyos;
}

async function proponerApartados(obra, fotos, cuenta) {
    if (!obra?.oportunidad_id || !fotos.length) return [];
    const { data: op } = await supabase.from('oportunidades').select('id, datos_calculo').eq('id', obra.oportunidad_id).maybeSingle();
    if (!op) return [];
    const slots = await reformaUploadService.checklistForOportunidad({ id: op.id, datos_calculo: op.datos_calculo });
    const onUso = (u) => {
        cuenta.llamadas++; cuenta.in += u.in; cuenta.out += u.out + u.think; cuenta.think = (cuenta.think || 0) + u.think;
        cuenta.usd = (cuenta.usd || 0) + IA.costeLlamada(u);
    };
    const res = await clasificarFotos.clasificar(
        fotos.map(m => ({ buffer: m._fichero.buffer, mimeType: m._fichero.mimetype, nombre: m._fichero.nombre })), slots, { onUso });
    return res.map((x, i) => ({ msg: fotos[i].id, ...x, labelCliente: slots.find(s => s.key === x.slot)?.labelCliente || null }));
}

function dossierDe(obra) {
    if (!obra || obra.tipo === 'cee' || !obra.oportunidad_id) return Promise.resolve(null);
    return botContexto._dossierDeAsunto({
        oportunidad_id: obra.oportunidad_id, id_oportunidad: obra.id_oportunidad, ficha: obra.ficha,
        referencia: obra.referencia || obra.cliente, estado_oportunidad: obra.estado,
        expediente: obra.expediente_id ? { id: obra.expediente_id, numero_expediente: obra.codigo } : null,
    }, { soloLectura: true });
}

async function procesarChat(c, a, ctx) {
    const { ms } = a;
    const { cont, cuenta, envios, desdeSeg, modelo, modeloBorrador } = ctx;
    const adjuntos = await bajarAdjuntos(ms, desdeSeg, cont);
    // Primero se decide qué adjuntos ve el modelo y con qué número, y con ESOS
    // números se escribe la conversación que lee.
    const { partes, numeros } = IA.prepararPartes(adjuntos);
    const ch = { obras: c.obras, rol: c.rol, personas: a.personas, texto: IA.transcripcion(ms, numeros, envios), dias: CONFIG.diasContexto };
    const an = await IA.analizar(ch, partes, cuenta, { modelo });
    c.analisis = an;

    const porN = new Map((an.adjuntos || []).map(x => [x.n, x]));
    const fotosPorObra = new Map();
    for (const m of adjuntos) {
        const x = m._n ? porN.get(m._n) : null;
        m._an = x;
        if (x && x.obra && x.obra !== 'NUEVA' && /^image\//.test(m._fichero?.mimetype || '') && ['FOTO_OBRA', 'FOTO_PLACA'].includes(x.tipo)) {
            if (!fotosPorObra.has(x.obra)) fotosPorObra.set(x.obra, []);
            fotosPorObra.get(x.obra).push(m);
        }
    }
    const slotDe = new Map();
    const pendientesDe = new Map();
    for (const [codigo, fotos] of fotosPorObra) {
        const obra = c.obras.find(o => o.codigo === codigo);
        try { for (const p of await proponerApartados(obra, fotos, cuenta)) slotDe.set(p.msg, p); }
        catch (e) { log(`repartidor ${codigo}: ${e.message}`); }
        try {
            const d = await dossierDe(obra);
            if (d) pendientesDe.set(codigo, new Set((d.pendientes || []).map(p => p.clave)));
        } catch (e) { /* sin dossier: no se marca el hueco */ }
    }

    const tocadas = new Set();
    for (const m of adjuntos) {
        if (m._colocada) continue;
        const x = m._an;
        if (!x) {
            c.sinLeer.push(`${fecha(m.t)} ${m.tipo === 'ptt' ? 'audio' : m.tipo}${m._transcripcion ? ' (transcrito)' : ''}${m._error ? `: ${m._error}` : ''}`);
            continue;
        }
        const sl = slotDe.get(m.id);
        let donde = Informe.DESTINO_DOC[x.tipo] || '—';
        if (sl) {
            if (sl.slot) {
                const hueco = pendientesDe.get(x.obra)?.has(sl.slot);
                donde = `${sl.labelCliente || sl.label}${hueco ? ' · **rellena un hueco**' : ''}`;
                sl._hueco = !!hueco;
            } else donde = sl.concepto_label ? `sin apartado (sería «${sl.concepto_label}»)` : 'sin clasificar';
        } else if (['FOTO_OBRA', 'FOTO_PLACA'].includes(x.tipo)) donde = x.obra ? 'sin clasificar' : '—';
        if (x.tipo === 'NO_RELACIONADO') donde = 'nada (no es de una obra)';
        c.filas.push({
            msg: m.id, n: x.n, cuando: fecha(m.t), que: corta(x.que_es, 70), obra: x.tipo === 'NO_RELACIONADO' ? '—' : x.obra,
            donde, confianza: x.confianza, tipo: x.tipo, slot: sl?.slot || null, hueco: !!sl?._hueco,
        });
        if (x.obra === 'NUEVA') c.nuevas = (c.nuevas || 0) + 1;
        else if (x.obra && x.tipo !== 'NO_RELACIONADO') { c.adjuntosObra++; tocadas.add(x.obra); }
    }
    c.obrasTocadas = [...tocadas];

    // ── Borrador ──
    const ultimo = ms[ms.length - 1];
    const ultimoSuyo = !ultimo.de_mi;
    const cortesia = ultimoSuyo && esCortesia({ tipo: ultimo.tipo, texto: ultimo.texto });
    if (an.espera_respuesta || (ultimoSuyo && !cortesia)) {
        if (c.rol === 'certificador') {
            c.borrador = { accion: 'MANO', motivo: `certificador: ${an.por_que_espera || 'espera respuesta'} (a un técnico se le escribe como a un compañero; lo redactaría Claude)` };
        } else {
            // La obra de la ÚLTIMA pregunta sin contestar manda: es a lo que hay que responder.
            const deLaPregunta = [...(an.preguntas_sin_contestar || [])].reverse().find(p => p.obra && p.obra !== 'NUEVA')?.obra;
            const deLaConv = an.obra_de_la_conversacion !== 'NUEVA' ? an.obra_de_la_conversacion : '';
            const codigo = deLaPregunta || deLaConv || (c.obrasTocadas.length === 1 ? c.obrasTocadas[0] : (c.obras.length === 1 ? c.obras[0].codigo : ''));
            const obra = c.obras.find(o => o.codigo === codigo) || null;
            const llegado = { slots: new Set(), lineas: [] };
            for (const f of c.filas) {
                if (f.obra && f.obra !== 'NUEVA' && f.obra !== '—' && (!codigo || f.obra === codigo)) {
                    llegado.lineas.push(`${f.que} (${f.cuando})`);
                    if (f.slot && f.confianza !== 'baja') llegado.slots.add(f.slot);
                }
            }
            const propuesta = IA.estadoPropuesta(obra);
            try {
                const dossier = obra && (!propuesta || propuesta === 'ENVIADA') ? await dossierDe(obra) : null;
                c.borrador = await IA.borrador({ ...ch, obras: c.obras }, obra, dossier, llegado, cuenta, { modelo: modeloBorrador });
                c.obraBorrador = codigo || null;
            } catch (e) { c.borrador = { accion: 'MANO', motivo: `no se pudo redactar: ${e.message}` }; }
        }
    } else if (cortesia) {
        c.borrador = { accion: 'CALLAR', motivo: 'lo último es cortesía' };
    }
    // Los ficheros pueden sumar cientos de MB entre todos los chats.
    for (const m of ms) delete m._fichero;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LA RONDA
// ─────────────────────────────────────────────────────────────────────────────
let progreso = { corriendo: false, fase: null, hechos: 0, total: 0, inicio: null, error: null };
let ultima = null;

/**
 * Hace la ronda. No envía nada: devuelve el resultado y deja sus ficheros.
 * @param {{ desdeSeg?: number, dias?: number, telefono?: string, origen?: string }} opts
 *   `dias` (manual) manda sobre `desdeSeg`; sin ninguno, las últimas 24 h.
 */
async function ejecutar({ desdeSeg = null, dias = null, telefono = null, origen = 'manual', modelo = null } = {}) {
    // `modelo` (solo a mano) cambia el de análisis Y el de borradores: para comparar.
    const modeloAnalisis = modelo || CONFIG.modelo();
    const modeloBorrador = modelo || CONFIG.modeloBorrador();
    if (progreso.corriendo) throw error('Ya hay una ronda en marcha.', 409);
    const ahora = Math.floor(Date.now() / 1000);
    const minimo = ahora - CONFIG.maxDiasVentana * 86400;
    let desde = dias ? ahora - Math.min(Number(dias), CONFIG.maxDiasVentana) * 86400 : (desdeSeg || ahora - 86400);
    if (desde < minimo) desde = minimo;
    progreso = { corriendo: true, fase: 'preparando', hechos: 0, total: 0, inicio: new Date().toISOString(), error: null, origen };
    const t0 = Date.now();
    try {
        const u = await cargarUniverso();
        const envios = await cargarEnviosApp(ahora - (CONFIG.diasContexto + 1) * 86400);
        let telefonos = [...u.porTel.keys()];
        if (telefono) telefonos = telefonos.filter(t => t === nueve(telefono));

        // ── Lectura: solo cuentan los chats con mensajes NUEVOS ──
        progreso = { ...progreso, fase: 'leyendo', total: telefonos.length };
        const activos = [];
        const fallos = [];
        const vistos = new Set();
        let conChat = 0;
        let seguidos = 0;
        for (const tel of telefonos) {
            progreso.hechos++;
            if (activos.length >= CONFIG.maxChats) break;
            let conv;
            try {
                conv = await waConversacion.leerConversacion({ telefono: tel, dias: CONFIG.diasContexto });
                seguidos = 0;
            } catch (e) {
                if (e.status === 404) continue;
                fallos.push({ tel, error: e.message });
                // Tres plazos seguidos: la sesión no está para leer. Mejor cortar que
                // dejarla atascada (es la misma de la que salen todos los avisos).
                if ((e.status === 503 || e.status === 504) && ++seguidos >= 3) throw error('WhatsApp no responde: ronda cortada.', 503);
                continue;
            }
            conChat++;
            const ms = conv.mensajes || [];
            if (!ms.some(m => m.t >= desde) || vistos.has(conv.chatId)) continue;
            vistos.add(conv.chatId);
            activos.push({ telefono: tel, conv, ms, personas: u.porTel.get(tel) });
        }
        const tLectura = (Date.now() - t0) / 60000;
        log(`${conChat} chats leídos, ${activos.length} con mensajes nuevos (${tLectura.toFixed(1)} min)`);

        // ── Análisis, chat a chat ──
        progreso = { ...progreso, fase: 'analizando', hechos: 0, total: activos.length };
        const cont = { fotos: 0, documentos: 0, audios: 0, videos: 0, yaColocadas: 0 };
        const cuenta = { llamadas: 0, in: 0, out: 0, think: 0, reintentos: 0, usd: 0 };
        const chats = [];
        // Gemini SIN CRÉDITO (402) no se arregla reintentando: se deja de llamar y el
        // resumen lo dice arriba. Medido el 19/10/2026: se agotó a mitad de una ronda
        // y los 24 chats siguientes fallaron uno a uno, mientras el resumen contaba
        // como si estuviera completo.
        let sinCredito = null;
        for (const a of activos) {
            progreso.hechos++;
            const rol = rolDe(a.personas);
            const ultimoMsg = a.ms[a.ms.length - 1];
            const c = {
                ref: '', telefono: a.telefono, titulo: tituloDe(a.personas, a.conv.nombre), rol,
                rolTexto: { cliente: 'Cliente', instalador: 'Instalador', certificador: 'Certificador', ambos: 'Cliente e instalador' }[rol] || rol,
                obras: obrasDeChat(a.personas, u), mensajes: a.ms.length, suyos: a.ms.filter(m => !m.de_mi).length,
                ultimo: `${fecha(ultimoMsg.t)} (${ultimoMsg.de_mi ? 'nuestro' : 'suyo'})`,
                filas: [], sinLeer: [], adjuntosObra: 0, obrasTocadas: [],
            };
            chats.push(c);
            // Un chat donde solo hemos escrito nosotros no trae nada que colocar ni contestar.
            if (!a.ms.some(m => !m.de_mi && m.t >= desde)) { c.soloNuestros = true; continue; }
            if (soloCortesia(a.ms, desde)) { c.soloCortesia = true; continue; }
            if (sinCredito) { c.error = `Sin analizar: ${sinCredito}`; continue; }
            try { await procesarChat(c, a, { cont, cuenta, envios, desdeSeg: desde, modelo: modeloAnalisis, modeloBorrador }); }
            catch (e) {
                c.error = `No se pudo analizar: ${e.message}`;
                log(`✗ ${corta(c.titulo, 40)}: ${e.message}`);
                if (e.status === 402 || /credits are depleted|billing/i.test(e.message)) sinCredito = 'Gemini se ha quedado sin crédito';
            }
        }

        const res = componer({ chats, telefonos, conChat, cont, cuenta, fallos, desde, hasta: ahora, t0 });
        res.modelo = modeloAnalisis === modeloBorrador ? modeloAnalisis : `${modeloAnalisis} (borradores: ${modeloBorrador})`;
        res.aviso = sinCredito ? `${sinCredito} y ${res.resumen.sinAnalizar} chats se han quedado sin analizar. Hay que recargarlo en AI Studio: afecta también a los lectores con IA de la app.` : null;
        guardarFicheros(res);
        ultima = res;
        progreso = { ...progreso, corriendo: false, fase: 'hecha', fin: new Date().toISOString() };
        log(`hecha: ${res.resumen.activos} chats, ${res.resumen.adjuntos} adjuntos, ≈ ${res.coste.eur.toFixed(2)} €`);
        return res;
    } catch (e) {
        progreso = { ...progreso, corriendo: false, fase: 'error', error: e.message };
        throw e;
    }
}

function componer({ chats, telefonos, conChat, cont, cuenta, fallos, desde, hasta, t0 }) {
    // Lo que más trabajo quita, primero.
    const peso = (c) => (c.adjuntosObra * 3) + ((c.analisis?.preguntas_sin_contestar?.length || 0) * 2)
        + (c.borrador && c.borrador.accion !== 'CALLAR' ? 2 : 0);
    const visibles = chats.filter(c => !c.soloNuestros && !c.soloCortesia).sort((a, b) => peso(b) - peso(a));
    visibles.forEach((c, i) => { c.ref = `C${i + 1}`; });

    const filas = visibles.flatMap(c => c.filas);
    const enObra = (f) => f.obra && f.obra !== '—' && f.obra !== 'NUEVA';
    const fotosObra = filas.filter(f => ['FOTO_OBRA', 'FOTO_PLACA'].includes(f.tipo) && enObra(f));
    const borr = { RESPONDER: 0, ESCALAR: 0, CALLAR: 0, MANO: 0 };
    for (const c of visibles) if (c.borrador) borr[c.borrador.accion] = (borr[c.borrador.accion] || 0) + 1;
    const prom = visibles.flatMap(c => c.analisis?.promesas || []);
    const porRol = {};
    for (const c of visibles) porRol[c.rolTexto] = (porRol[c.rolTexto] || 0) + 1;

    // Cada llamada se cobra con el precio de SU modelo (rondaWhatsappIA.PRECIOS).
    // Las transcripciones de audio van aparte (las hace whatsappConversacion).
    const eur = (cuenta.usd || 0) * 0.92;
    const generada = new Date();
    return {
        fecha: hoyMadrid(),
        generada_at: generada.toISOString(),
        desde,
        // Hasta cuándo se LEYÓ (el arranque de la ronda, no su final): es el cursor
        // de la siguiente, o lo que llegue mientras se analiza no saldría nunca.
        hasta,
        ventana: `Desde el ${fecha(desde)}`,
        chats: visibles,
        fallos,
        coste: { ...cuenta, eur },
        tiempos: { min: ((Date.now() - t0) / 60000).toFixed(1) },
        resumen: {
            telefonos: telefonos.length, conChat, activos: visibles.length, porRol, cont,
            adjuntos: cont.fotos + cont.documentos + cont.audios + cont.videos,
            asignados: filas.filter(enObra).length,
            asignadosAlta: filas.filter(f => enObra(f) && f.confianza === 'alta').length,
            nuevas: filas.filter(f => f.obra === 'NUEVA').length,
            dudosos: filas.filter(f => !f.obra).length,
            noRelacionados: filas.filter(f => f.tipo === 'NO_RELACIONADO').length,
            fotosEnObra: fotosObra.length, conSlot: fotosObra.filter(f => f.slot).length, slotHueco: fotosObra.filter(f => f.hueco).length,
            preguntas: visibles.reduce((s, c) => s + (c.analisis?.preguntas_sin_contestar?.length || 0), 0),
            promesasEllos: prom.filter(p => p.quien === 'ELLOS').length,
            promesasEllosPend: prom.filter(p => p.quien === 'ELLOS' && !p.cumplida).length,
            promesasNos: prom.filter(p => p.quien === 'NOSOTROS').length,
            promesasNosPend: prom.filter(p => p.quien === 'NOSOTROS' && !p.cumplida).length,
            promesasDescartadas: visibles.reduce((s, c) => s + (c.analisis?.promesas_descartadas || 0), 0),
            enlaces: visibles.reduce((s, c) => s + (c.borrador?.enlaces?.length || 0), 0),
            problemasEnlaces: visibles.reduce((s, c) => s + (c.borrador?.problemas_enlaces?.length || 0), 0),
            sinEnviar: [...new Set(visibles.filter(c => c.borrador?.propuesta === 'SIN_ENVIAR').map(c => c.obraBorrador))],
            soloNuestros: chats.filter(c => c.soloNuestros).length,
            soloCortesia: chats.filter(c => c.soloCortesia).length,
            sinAnalizar: visibles.filter(c => c.error).length,
            borr,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. FICHEROS y ENVÍO (solo a Fran)
// ─────────────────────────────────────────────────────────────────────────────
function guardarFicheros(res) {
    try {
        fs.mkdirSync(CONFIG.dirSalida, { recursive: true });
        const sello = res.generada_at.slice(0, 16).replace(/[:T]/g, '-');
        const base = path.join(CONFIG.dirSalida, `ronda_${sello}`);
        fs.writeFileSync(`${base}.md`, Informe.informeMarkdown(res));
        fs.writeFileSync(`${base}.html`, `<!doctype html><meta charset="utf-8"><title>Ronda de WhatsApp</title>${Informe.informeHtml(res)}`);
        fs.writeFileSync(`${base}.whatsapp.txt`, Informe.resumenWhatsapp(res) || '(sin nada nuevo: no se mandaría WhatsApp)');
        fs.writeFileSync(`${base}.json`, JSON.stringify(res, null, 2));
        res.archivos = { md: `${base}.md`, html: `${base}.html`, whatsapp: `${base}.whatsapp.txt`, json: `${base}.json` };
        // Purga: llevan datos de clientes y no hacen falta más de un mes.
        const limite = Date.now() - CONFIG.purgaDias * 86400_000;
        for (const f of fs.readdirSync(CONFIG.dirSalida)) {
            if (!/^ronda_\d/.test(f)) continue;
            const p = path.join(CONFIG.dirSalida, f);
            if (fs.statSync(p).mtimeMs < limite) fs.unlinkSync(p);
        }
    } catch (e) { log(`no se pudieron guardar los ficheros: ${e.message}`); }
}

/** Manda el informe a Fran: email entero + resumen corto por WhatsApp. Sin nada nuevo, nada. */
async function enviar(res) {
    const wa = Informe.resumenWhatsapp(res);
    if (!wa) return { ok: true, nada: true };
    const out = { ok: true, whatsapp: false, email: false, errores: [] };
    // Perezosos: este módulo se carga en las pruebas sin sesión de WhatsApp ni SMTP.
    const whatsappService = require('./whatsappService');
    const emailService = require('./emailService');
    const destino = CONFIG.destinoWa();
    if (destino) {
        try { await whatsappService.sendText(destino, wa); out.whatsapp = true; }
        catch (e) { out.errores.push(`WhatsApp: ${e.message}`); }
    } else out.errores.push('WhatsApp: sin destino (ASISTENTE_WHATSAPP_GRUPO / WHATSAPP_ADMIN_CHAT)');
    const to = CONFIG.email();
    if (to) {
        try {
            await emailService.sendMail({
                to,
                // Buzón SECUNDARIO, como el parte: no gasta la cuota del de clientes.
                from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
                subject: Informe.asuntoEmail(res),
                html: Informe.informeHtml(res),
                text: wa,
            });
            out.email = true;
        } catch (e) { out.errores.push(`Email: ${e.message}`); }
    } else out.errores.push('Email: sin ADMIN_EMAIL');
    out.ok = out.whatsapp || out.email;
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. EL PROGRAMADOR — lee de madrugada, avisa a las 9:00, una vez al día
// ─────────────────────────────────────────────────────────────────────────────
async function leerEstado() {
    const { data, error: e } = await supabase.from('app_settings').select('value').eq('key', CONFIG.clave).maybeSingle();
    if (e) return null;   // BD caída: no se decide nada
    try { return data?.value ? JSON.parse(data.value) : {}; } catch { return {}; }
}
async function guardarEstado(st) {
    await supabase.from('app_settings').upsert(
        { key: CONFIG.clave, value: JSON.stringify(st), updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

let handle = null;
async function tick() {
    if (!CONFIG.activo() || progreso.corriendo) return;
    const h = horaMadrid();
    if (h < CONFIG.horaLectura || h >= CONFIG.horaLimite) return;
    const hoy = hoyMadrid();
    const st = await leerEstado();
    if (!st || st.enviada === hoy) return;
    // El resultado de hoy, si ya se hizo (en memoria; tras un reinicio, otra vez).
    let res = ultima && ultima.fecha === hoy && ultima.desde === (st.cursor || ultima.desde) ? ultima : null;
    if (!res) res = await ejecutar({ desdeSeg: st.cursor || null, origen: 'programada' });
    if (horaMadrid() < CONFIG.horaAviso) return;
    const envio = await enviar(res);
    if (!envio.ok) { log(`no se pudo avisar: ${(envio.errores || []).join(' · ')}`); return; }
    // El cursor avanza SOLO cuando se ha avisado: si se reinicia antes, se rehace
    // la misma ventana y no se pierde nada.
    await guardarEstado({ ...st, enviada: hoy, cursor: res.hasta, ultimo: res.resumen.activos });
    log(envio.nada ? 'nada nuevo: no se avisa.' : `avisada (${[envio.whatsapp && 'WhatsApp', envio.email && 'email'].filter(Boolean).join(' + ')}).`);
}

function start() {
    if (handle) return;
    if (!CONFIG.activo()) { log('apagada (WA_RONDA_ENABLED=true para encenderla).'); return; }
    setTimeout(() => { tick().catch(e => log(e.message)); }, 2 * 60 * 1000);
    handle = setInterval(() => { tick().catch(e => log(e.message)); }, CONFIG.tickMs);
    log(`activa: lee desde las ${CONFIG.horaLectura}:00 y avisa a las ${CONFIG.horaAviso}:00 (en seco).`);
}

/** Lanza una ronda a mano, sin esperarla. Con `enviar`, avisa a Fran al acabar. */
function lanzar(opts = {}) {
    if (progreso.corriendo) throw error('Ya hay una ronda en marcha.', 409);
    ejecutar(opts)
        .then(res => (opts.enviar ? enviar(res).then(r => { res.envio = r; }) : null))
        .catch(e => log(`ronda manual: ${e.message}`));
    return { ok: true, iniciada: true };
}

function estado() {
    return {
        activa: CONFIG.activo(),
        modelo: { analisis: CONFIG.modelo(), borradores: CONFIG.modeloBorrador() },
        horario: { lectura: CONFIG.horaLectura, aviso: CONFIG.horaAviso },
        destino: { whatsapp: CONFIG.destinoWa() ? 'configurado' : null, email: CONFIG.email() ? 'configurado' : null },
        progreso,
        ultima: ultima ? {
            fecha: ultima.fecha, generada_at: ultima.generada_at, ventana: ultima.ventana,
            modelo: ultima.modelo || null,
            resumen: ultima.resumen, coste: ultima.coste, archivos: ultima.archivos || null, envio: ultima.envio || null,
        } : null,
    };
}

function informe(formato = 'md') {
    if (!ultima) return null;
    if (formato === 'html') return Informe.informeHtml(ultima);
    if (formato === 'whatsapp') return Informe.resumenWhatsapp(ultima) || '';
    return Informe.informeMarkdown(ultima);
}

module.exports = {
    start, tick, ejecutar, lanzar, enviar, estado, informe, CONFIG,
    // Piezas que comparte la ronda hecha por Claude Code (scripts/ronda_cc.js):
    cargarUniverso, obrasDeChat, rolDe, tituloDe, cargarEnviosApp, soloCortesia, componer, dossierDe,
    // Para las pruebas:
    _rolDe: rolDe, _tituloDe: tituloDe, _componer: componer, _soloCortesia: soloCortesia,
};
