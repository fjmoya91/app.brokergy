/**
 * altaOportunidad — lo que decide la skill `alta-oportunidad` y que se puede
 * comprobar sin WhatsApp, sin Drive y casi sin base de datos.
 *
 * El script (`scripts/alta_oportunidad.js`) orquesta; aquí vive el criterio:
 * qué mensajes son la PETICIÓN, qué plantas cuentan, cómo se traduce el plan a
 * las respuestas del funnel interno y qué queda escrito en el historial.
 * Probado en `scripts/test_alta_oportunidad.js`.
 */

const path = require('path');

// ─── La conversación ────────────────────────────────────────────────────────

const HORA = 3600;

/**
 * Los mensajes de la PETICIÓN: el último tramo seguido de la conversación que
 * acaba en lo último que mandaron ELLOS. Un instalador pide una simulación en
 * una ráfaga («te paso otro presupuesto…», el PDF, tres fotos, el nombre y el
 * DNI) y antes de eso el chat lleva horas o días parado: el corte es el primer
 * hueco de más de `gapHoras` hacia atrás.
 *
 * Con `desdeSeg` manda quien llama (la petición puede venir en dos días: la
 * referencia catastral el lunes y las fotos el martes).
 */
function bloquePeticion(mensajes, { desdeSeg = null, hastaSeg = null, gapHoras = 4 } = {}) {
    const ms = [...(mensajes || [])].sort((a, b) => a.t - b.t);
    if (!ms.length) return { mensajes: [], desde: null, hasta: null, motivo: 'la conversación está vacía' };
    if (desdeSeg) {
        const sel = ms.filter(m => m.t >= desdeSeg && (!hastaSeg || m.t <= hastaSeg));
        return {
            mensajes: sel, desde: sel[0]?.t ?? null, hasta: sel[sel.length - 1]?.t ?? null,
            motivo: 'desde la fecha indicada',
        };
    }
    let fin = -1;
    for (let i = ms.length - 1; i >= 0; i--) if (!ms[i].de_mi) { fin = i; break; }
    if (fin < 0) return { mensajes: [], desde: null, hasta: null, motivo: 'no hay ningún mensaje suyo en el periodo' };
    let ini = fin;
    while (ini > 0 && ms[ini].t - ms[ini - 1].t < gapHoras * HORA) ini -= 1;
    // Lo nuestro DESPUÉS de lo último suyo (una respuesta, una pregunta) también
    // es de la misma conversación: se enseña, aunque no se baje.
    let ult = fin;
    while (ult + 1 < ms.length && ms[ult + 1].t - ms[ult].t < gapHoras * HORA) ult += 1;
    const sel = ms.slice(ini, ult + 1);
    return {
        mensajes: sel, desde: sel[0].t, hasta: sel[sel.length - 1].t,
        motivo: ini === 0 ? 'desde el principio del periodo leído (amplía --dias si empezó antes)'
            : `tras un silencio de ${Math.round((ms[ini].t - ms[ini - 1].t) / HORA)} h`,
    };
}

/**
 * «2026-10-01 16:20» (hora de MADRID) → segundos epoch. El servidor y el PC
 * pueden estar en husos distintos; la hora que se lee en el móvil es la de aquí.
 */
function segundosMadrid(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(String(texto || '').trim());
    if (!m) throw new Error(`Fecha «${texto}»: usa AAAA-MM-DD o "AAAA-MM-DD HH:MM".`);
    const [, y, mo, d, h = '0', mi = '0'] = m;
    const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi);
    const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(guess)).map(p => [p.type, p.value]));
    const pared = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute);
    return Math.floor((guess - (pared - guess)) / 1000);
}

/** Una línea legible de un mensaje para el listado del chat. */
function resumenMensaje(m) {
    const t = String(m.texto || '').replace(/\s+/g, ' ').trim();
    const corto = t.length > 150 ? `${t.slice(0, 150)}…` : t;
    switch (m.tipo) {
        case 'chat': return corto || '(vacío)';
        case 'image': return `[FOTO]${corto ? ` «${corto}»` : ''}`;
        case 'video': return `[VÍDEO]${corto ? ` «${corto}»` : ''}`;
        case 'document': return `[DOC] ${m.filename || m.nombre_archivo || ''}${corto && corto !== m.filename ? ` «${corto}»` : ''}`;
        case 'ptt': case 'audio': return '[NOTA DE VOZ] (escúchala con `escuchar`)';
        case 'vcard': case 'multi_vcard':
            return `[CONTACTO] ${(m.contactos || []).map(c => `${c.nombre || '—'} ${c.telefonos.join('/')}`).join(' · ')}`;
        case 'location': return `[UBICACIÓN] ${m.lat}, ${m.lng}`;
        case 'revoked': return '(mensaje eliminado)';
        case 'album': return '(álbum: las fotos vienen detrás)';
        case 'sticker': return '[sticker]';
        default: return `[${m.tipo}] ${corto}`;
    }
}

// ─── Ficheros ───────────────────────────────────────────────────────────────

const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.heic': 'image/heic', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
    '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
};
const mimeDeFichero = f => MIME[path.extname(String(f)).toLowerCase()] || 'application/octet-stream';
function tipoMedia(f) {
    const m = mimeDeFichero(f);
    return m.startsWith('image/') ? 'image' : m.startsWith('video/') ? 'video' : m === 'application/pdf' ? 'pdf' : null;
}

// ─── El inmueble ────────────────────────────────────────────────────────────

/**
 * Qué construcciones del Catastro CUENTAN para el cálculo.
 *
 * REGLA (decisión del usuario, 2026-10-01): TODO lo que el Catastro declara
 * como VIVIENDA cuenta, siempre — aunque el croquis solo dibuje radiadores en
 * una planta. Es lo mismo que marca por defecto la ficha técnica del formulario.
 * Medido en 26RES060_OP250: dejar fuera la planta 1 (34 m² de vivienda) porque
 * el croquis no la dibujaba bajaba la superficie de 175 a 141 m² y el bono de
 * ~2.028 € a ~1.594 €.
 *
 * `codigos` (los `escalera/planta/puerta` del plan) solo puede AÑADIR lo que
 * NO es vivienda en el Catastro (un «almacén» que en realidad se vive): nunca
 * quitar una vivienda. Un código de vivienda en la lista sobra y no cambia
 * nada; uno que no existe se AVISA, nunca se traga.
 */
function seleccionConstrucciones(constructions, codigos = null) {
    const lista = constructions || [];
    const avisos = [];
    const esViv = c => String(c.type || '').toUpperCase().includes('VIVIENDA');
    const viv = lista.map((c, i) => (esViv(c) ? i : null)).filter(i => i !== null);
    let indices = viv.length ? [...viv] : lista.map((_, i) => i);
    if (Array.isArray(codigos) && codigos.length) {
        const pedidos = codigos.map(c => String(c).trim());
        const faltan = pedidos.filter(p => !lista.some(c => String(c.code || '').trim() === p));
        if (faltan.length) avisos.push(`El Catastro no tiene las construcciones ${faltan.join(', ')}: no se cuentan.`);
        for (const [i, c] of lista.entries()) {
            if (!pedidos.includes(String(c.code || '').trim()) || indices.includes(i)) continue;
            indices.push(i);
            avisos.push(`Se cuenta además ${c.code} (${c.originalType || c.type}, ${c.surface} m²), que el Catastro no da como vivienda.`);
        }
        indices.sort((a, b) => a - b);
    }
    const superficie = lista.filter((_, i) => indices.includes(i)).reduce((a, c) => a + (Number(c.surface) || 0), 0);
    return { indices, superficie, avisos };
}

// ─── El plan → las respuestas del funnel ────────────────────────────────────

const COMBUSTIBLES = ['gas', 'gasoleo', 'electrica', 'carbon', 'biomasa'];
const EMISORES = ['radiadores_convencionales', 'radiadores_baja_temp', 'suelo_radiante', 'fancoils'];
const ACS_ACTUAL = ['misma_caldera', 'termo', 'butano', 'gas', 'gasoleo', 'solar', 'no_tengo'];
const EDADES = ['<10', '10-20', '>20', 'no_se'];

/**
 * Las respuestas que habría dado quien rellena «Nueva simulación», sacadas del
 * plan. Es el mismo objeto que guarda el formulario en `landing_funnel`, y
 * `funnelToCalculatorInputs` lo convierte en los inputs de la calculadora.
 *
 * Lo que el instalador casi nunca dice tiene su valor por defecto de la casa:
 * sin emisor declarado, RADIADORES (los convencionales: 55 °C, el SCOP más
 * prudente); obra sin empezar; sustitución de caldera (RES060).
 */
function funnelDesdePlan(plan = {}) {
    const cal = plan.caldera === null ? null : (plan.caldera || {});
    const sinCalefaccion = !cal || cal.sin_calefaccion === true;
    const comb = sinCalefaccion ? null : String(cal.combustible || '').toLowerCase();
    if (!sinCalefaccion && !COMBUSTIBLES.includes(comb)) {
        throw new Error(`caldera.combustible «${cal.combustible}»: usa ${COMBUSTIBLES.join(' | ')} (o caldera: null si no hay calefacción).`);
    }
    const edad = cal?.edad || 'no_se';
    if (!EDADES.includes(edad)) throw new Error(`caldera.edad «${edad}»: usa ${EDADES.join(' | ')}.`);
    const emisor = plan.emisor || 'radiadores_convencionales';
    if (!EMISORES.includes(emisor)) throw new Error(`emisor «${emisor}»: usa ${EMISORES.join(' | ')}.`);
    const acsActual = plan.acs?.actual || (sinCalefaccion ? 'no_tengo' : 'misma_caldera');
    if (!ACS_ACTUAL.includes(acsActual)) throw new Error(`acs.actual «${acsActual}»: usa ${ACS_ACTUAL.join(' | ')}.`);

    const placas = plan.placas && typeof plan.placas === 'object' ? plan.placas : { estado: plan.placas ?? null };
    if (placas.estado != null && !['si', 'futuro', 'no'].includes(placas.estado)) {
        throw new Error(`placas «${placas.estado}»: usa si | futuro | no (o null si no se sabe).`);
    }
    return {
        isReforma: false,
        reforma_elementos: { caldera: true, ventanas: false, cubierta: false, suelo: false, paredes: false, placas: false, aires: false },
        reforma_aires_count: null,
        obra_estado: plan.obra_estado || 'no_empezada',
        reforma_sin_caldera: sinCalefaccion,
        combustible_actual: comb,
        edad_caldera: sinCalefaccion ? null : edad,
        condensacion: sinCalefaccion ? null : (cal.condensacion || (edad === '>20' ? 'no' : 'no_se')),
        emisor_tipo: emisor,
        boiler_acs_type: acsActual,
        incluir_acs: plan.acs?.incluir === true,
        placas_estado: placas.estado ?? null,
        placas_kwp: placas.estado === 'si' && Number(placas.kwp) > 0 ? Number(placas.kwp) : null,
        placas_kwp_nose: placas.estado === 'si' && !(Number(placas.kwp) > 0),
        gasto_anual_eur: null,
        presupuesto_modo: null,
        presupuesto_eur: null,
        titular_type: plan.cliente?.titular_type || 'particular',
        num_propietarios: Number(plan.cliente?.num_propietarios) || 1,
        timeline: 'explorando',
        motivacion: null,
        origen_alta: 'whatsapp',
    };
}

const ORIENTACIONES = ['media', 'N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/**
 * Lo que el formulario no pregunta del EDIFICIO y la calculadora sí: hacia dónde
 * mira la fachada principal (la de la calle) y cuántos patios interiores tiene.
 * Sale del croquis («C/ … (NORTE)», «PATIO») o de las fotos. Medido en
 * 26RES060_OP250: con orientación N y 1 patio la demanda pasa de 85,5 a 96,8
 * kWh/m²·año. Sin dato, lo de siempre (orientación «media», sin patios).
 * Mismos valores que los desplegables de la calculadora.
 */
function ajustesEdificio(plan = {}) {
    const out = {};
    if (plan.orientacion != null) {
        const o = String(plan.orientacion).toUpperCase() === 'MEDIA' ? 'media' : String(plan.orientacion).toUpperCase();
        if (!ORIENTACIONES.includes(o)) throw new Error(`orientacion «${plan.orientacion}»: usa ${ORIENTACIONES.join(' | ')}.`);
        out.orientacion = o;
    }
    if (plan.patios != null) {
        const n = Number(plan.patios);
        if (!Number.isInteger(n) || n < 0 || n > 4) throw new Error(`patios «${plan.patios}»: un entero de 0 a 4.`);
        out.patios = n;
    }
    if (plan.fachadas != null) {
        const n = Number(plan.fachadas);
        if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error(`fachadas «${plan.fachadas}»: un entero de 1 a 4 (las que dan al exterior).`);
        out.fachadas = n;
    }
    return out;
}

/** El contacto con la forma que espera `createLead` (modo interno). */
function contactoDesdePlan(plan = {}) {
    const c = plan.cliente || {};
    const nombre = String(c.nombre || '').trim();
    if (!nombre && !c.referencia) throw new Error('El plan necesita cliente.nombre (o cliente.referencia).');
    const tlfDigitos = String(c.tlf || '').replace(/\D/g, '');
    const tlf = tlfDigitos.length >= 9 ? tlfDigitos.slice(-9) : null;
    const dni = String(c.dni || '').toUpperCase().replace(/[^0-9A-Z]/g, '') || null;
    return {
        nombre: nombre || String(c.referencia).trim(),
        apellidos: String(c.apellidos || '').trim() || null,
        dni,
        tlf,
        email: String(c.email || '').trim().toLowerCase() || null,
        referenciaCliente: c.referencia ? String(c.referencia).trim() : null,
        titular_type: c.titular_type || 'particular',
        num_propietarios: Number(c.num_propietarios) || 1,
    };
}

const SLOTS_CONOCIDOS = new Set([
    'FOTO_CALDERA_ANTES', 'FOTO_PLACA_CALDERA_ANTES', 'FOTO_EMISORES_ANTES', 'FOTO_ACS_ANTES',
    'FOTO_FACHADA_PRINCIPAL', 'FOTO_PATIOS_INTERIORES', 'VIDEO_VIVIENDA', 'DOC_PLANOS',
    'DOC_CEE_EXISTENTE', 'DOC_PRESUPUESTO', 'OTROS_ANTES',
]);

/** El presupuesto del plan, si lo hay como fichero. */
function documentoPresupuesto(plan = {}) {
    const p = plan.presupuesto;
    return p && p.fichero ? { fichero: p.fichero, wa_msg_id: p.wa_msg_id || null, t: p.t || null } : null;
}

/**
 * Los ficheros que se suben, cada uno a su apartado. El presupuesto entra solo
 * (a DOC_PRESUPUESTO) aunque el plan no lo repita en `documentos`.
 */
function documentosDelPlan(plan = {}, base = '.') {
    const out = [];
    for (const d of plan.documentos || []) {
        if (!d?.fichero || !d?.slot) throw new Error('Cada documento del plan necesita «fichero» y «slot».');
        const slot = String(d.slot).toUpperCase();
        if (!SLOTS_CONOCIDOS.has(slot)) {
            throw new Error(`Apartado «${d.slot}» desconocido para una oportunidad. Usa: ${[...SLOTS_CONOCIDOS].join(', ')}.`);
        }
        out.push({ ruta: path.resolve(base, d.fichero), slot, wa_msg_id: d.wa_msg_id || null, t: d.t || null, label: d.label || null });
    }
    const pre = documentoPresupuesto(plan);
    if (pre && !out.some(d => d.slot === 'DOC_PRESUPUESTO')) {
        out.push({ ruta: path.resolve(base, pre.fichero), slot: 'DOC_PRESUPUESTO', wa_msg_id: pre.wa_msg_id, t: pre.t, label: null });
    }
    return out;
}

/** Lo que queda escrito en el historial: de dónde salió y qué se decidió. */
function textoHistorial(plan = {}, { avisos = [] } = {}) {
    const partes = [];
    const chat = plan.chat?.nombre ? `chat «${plan.chat.nombre}»` : 'WhatsApp';
    partes.push(`📲 Alta automática con lo recibido por ${chat}${plan.chat?.cuando ? ` (${plan.chat.cuando})` : ''} — skill alta-oportunidad.`);
    if (Array.isArray(plan.decisiones) && plan.decisiones.length) {
        partes.push(`Decisiones: ${plan.decisiones.join(' · ')}`);
    }
    if (avisos.length) partes.push(`Por revisar: ${avisos.join(' · ')}`);
    partes.push('Revisa la simulación en la calculadora antes de enviar la propuesta.');
    return partes.join('\n');
}

const capitaliza = s => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

// ─── Base de datos (lectura, salvo anotarAlta) ──────────────────────────────

async function oportunidadesDeLaRc(supabase, rc) {
    const { data } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, referencia_cliente, created_at, estado:datos_calculo->>estado')
        .eq('ref_catastral', rc).order('created_at', { ascending: false }).limit(10);
    return data || [];
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El partner que trae la obra: por id, acrónimo o razón social. Tiene que ser UNO. */
async function resolverPartner(supabase, ref) {
    if (!ref) return null;
    const campos = 'id_empresa, acronimo, razon_social, tipo_empresa';
    if (ES_UUID.test(String(ref))) {
        const { data } = await supabase.from('prescriptores').select(campos).eq('id_empresa', ref).maybeSingle();
        if (!data) throw new Error(`No hay ningún partner con id ${ref}.`);
        return data;
    }
    const q = String(ref).trim();
    let { data } = await supabase.from('prescriptores').select(campos).ilike('acronimo', q);
    if (!data?.length) ({ data } = await supabase.from('prescriptores').select(campos).ilike('razon_social', `%${q}%`));
    if (!data?.length) throw new Error(`No encuentro el partner «${q}».`);
    if (data.length > 1) {
        throw new Error(`«${q}» casa con ${data.length} partners: ${data.map(p => `${p.acronimo || '—'} / ${p.razon_social} (${p.id_empresa})`).join(' · ')}. Pon su id.`);
    }
    return data[0];
}

/**
 * La aerotermia del plan: `{ aerotermia_id }` (del catálogo) o `{ marca, modelo }`,
 * que se intenta casar con el catálogo por su código (la MISMA casación que la
 * placa). Con varios candidatos NO se elige: se pide el id.
 */
async function modeloAerotermia(supabase, spec) {
    if (!spec) return { modelo: null, custom: null };
    if (spec.aerotermia_id) {
        const { data } = await supabase.from('aerotermia').select('*').eq('id', spec.aerotermia_id).maybeSingle();
        if (!data) throw new Error(`No existe la aerotermia ${spec.aerotermia_id} en el catálogo.`);
        return { modelo: data, custom: null };
    }
    if (!spec.modelo) return { modelo: null, custom: null };
    const { casarConCatalogo } = require('../services/placaEquipoOcrService');
    const c = await casarConCatalogo({ marca: spec.marca || null, modelo: spec.modelo }, null);
    if (c.modelo) {
        const { data } = await supabase.from('aerotermia').select('*').eq('id', c.modelo.id).maybeSingle();
        return { modelo: data, custom: null, por: c.por };
    }
    if (c.candidatos?.length > 1) {
        throw new Error(`«${spec.modelo}» casa con varios equipos del catálogo (${c.candidatos.map(x => `${x.id} ${x.modelo_comercial}`).join(' · ')}): pon aerotermia_id.`);
    }
    return { modelo: null, custom: { marca: String(spec.marca || '').toUpperCase(), modelo: String(spec.modelo).toUpperCase() } };
}

/**
 * Quién figura como creador: `ALTA_CREADOR_ID` si está, y si no el mismo
 * usuario que crea las altas de «Nueva simulación» del equipo (el más frecuente
 * entre las últimas de origen admin). Sin nombres ni correos en el repo.
 */
async function idAdmin(supabase) {
    if (process.env.ALTA_CREADOR_ID) return process.env.ALTA_CREADOR_ID;
    const { data } = await supabase.from('oportunidades').select('creador_id')
        .eq('datos_calculo->>origen', 'admin').not('creador_id', 'is', null)
        .order('created_at', { ascending: false }).limit(50);
    const cuenta = {};
    for (const r of data || []) cuenta[r.creador_id] = (cuenta[r.creador_id] || 0) + 1;
    const [id] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0] || [];
    return id || null;
}

/**
 * Una línea en el historial + de qué chat salió. Se RELEE `datos_calculo`
 * justo antes de escribir y se hace ANTES de subir nada (las subidas escriben
 * por RPC en `reforma_uploads`): sin nadie más escribiendo a la vez.
 */
async function anotarAlta(supabase, oportunidadId, { texto, meta }) {
    const { data } = await supabase.from('oportunidades').select('datos_calculo').eq('id', oportunidadId).maybeSingle();
    const dc = data?.datos_calculo || {};
    const hist = Array.isArray(dc.historial) ? dc.historial : [];
    hist.push({ id: `${Date.now()}_alta_whatsapp`, tipo: 'comentario', texto, fecha: new Date().toISOString(), usuario: 'Sistema' });
    const nuevo = { ...dc, historial: hist };
    if (meta) nuevo.alta_whatsapp = meta;
    const { error } = await supabase.from('oportunidades').update({ datos_calculo: nuevo }).eq('id', oportunidadId);
    if (error) console.warn(`  (no se ha podido anotar en el historial: ${error.message})`);
}

module.exports = {
    bloquePeticion, segundosMadrid, resumenMensaje,
    mimeDeFichero, tipoMedia,
    seleccionConstrucciones, funnelDesdePlan, contactoDesdePlan, ajustesEdificio, ORIENTACIONES,
    documentoPresupuesto, documentosDelPlan, textoHistorial, capitaliza,
    oportunidadesDeLaRc, resolverPartner, modeloAerotermia, idAdmin, anotarAlta,
    SLOTS_CONOCIDOS, COMBUSTIBLES, EMISORES, ACS_ACTUAL,
};
