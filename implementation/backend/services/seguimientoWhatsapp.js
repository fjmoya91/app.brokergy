// ============================================================================
// seguimientoWhatsapp.js — que NO SE QUEDE NADA PENDIENTE (agente autónomo,
// fase 4, 15/11/2026).
//
// Fran: «Simulaciones: si se le envía al cliente, cada x tiempo se le pregunta si
// la han visto, si tienen dudas o si van a seguir adelante, con el objetivo de
// dejarla abierta o cerrada. Igual si solo se le envió al instalador. Aceptadas:
// todos los días revisará si falta algo para el CEE inicial […] Igual para los
// instaladores. Habrá que poner un watchdog a esas conversaciones para que
// cuando contesten se pueda extraer la info que nos pasen.»
//
// Medido ese día: 172 oportunidades en ENVIADA y solo 3 RECHAZADA en toda la
// historia (nadie cierra nada); de las ENVIADA, 31 le llegaron al cliente, 86
// solo al instalador (35 instaladores distintos) y 55 sin envío registrado; y 19
// expedientes con el CEE inicial sin encargar, 11 sin el material.
//
//   · SEMBRAR (cada 30 min): una fila en `wa_seguimientos` por cada propuesta viva
//     (ENVIADA o PRE-ACEPTADO) y por cada expediente con el CEE inicial sin
//     encargar. A quién: si la propuesta le llegó al cliente, al cliente (o a su
//     persona de contacto: lo dice la ficha); si no, al contacto COMERCIAL del
//     instalador. Lo que ya no está vivo se CIERRA con lo que pasó (aceptada…).
//   · LA VUELTA (cada 5 min, de 7 a 21 h de lunes a viernes, regla 205): lo que
//     vence se manda con PLANTILLA (utils/seguimientoTextos.js), UN mensaje por
//     persona (al instalador, todas sus obras juntas) y con los topes en el código.
//     La cadencia, en utils/seguimientoPasos.js.
//   · EL WATCHDOG: el mensaje que entra de alguien con un seguimiento abierto lo
//     pasa a CONTESTADO al momento (listener de la sesión); el CONTESTADOR, que ya
//     lee esa conversación para contestarle, dice además QUÉ ha contestado
//     (`seguimiento: [{numero, resultado, cuando, nota}]`), y aquí se aplica:
//     SIGUE → PRE-ACEPTADO y el enlace de aceptación; NO_SIGUE → RECHAZADA con la
//     razón en el historial; MAS_ADELANTE → se retoma en su fecha; PENSANDO → un
//     «¿cómo lo ves?» más tarde. Lo que manda (fotos, facturas) lo guardan el
//     contestador y el agente de la aceptación, que ya saben hacerlo.
//   · EL CEE INICIAL con el material COMPLETO es nuestro: se le vuelve a encargar
//     al agente de la aceptación (que hace el CEE con generar-cee-inicial), con tope.
//   · RESUMEN, dentro del repaso de las 9:00 del asistente (nunca un aviso aparte).
//
// Nace APAGADO (`SEGUIMIENTO_ENABLED`): local escribe en la BD de producción y la
// sesión de WhatsApp es la del VPS. Y en MODO COPIA (`SEGUIMIENTO_MODO=real` para
// escribir de verdad): no le llega nada a nadie ni se cambia ninguna oportunidad;
// Fran ve en el repaso lo que se habría mandado. `SEGUIMIENTO_PRUEBA=tel,tel`
// limita lo real a esos teléfonos. Nada aquí lanza hacia fuera.
// ============================================================================

const supabase = require('./supabaseClient');
const Pasos = require('../utils/seguimientoPasos');
const Textos = require('../utils/seguimientoTextos');
const horario = require('../utils/horarioWhatsapp');
const { entregaPropuesta } = require('../utils/entregaPropuesta');
const { materialCee, SLOT } = require('../utils/materialCee');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && v !== '' && v != null ? n : d; };
const CFG = {
    topeDia: num(process.env.SEGUIMIENTO_TOPE_DIA, 25),
    topeHora: num(process.env.SEGUIMIENTO_TOPE_HORA, 8),
    porVuelta: num(process.env.SEGUIMIENTO_POR_VUELTA, 3),
    // Lo ATRASADO (repasos) se reparte: como mucho tantas PERSONAS al día.
    repasoDia: num(process.env.SEGUIMIENTO_REPASO_DIA, 6),
    // Al agente de la aceptación, CEE con el material completo: como mucho al día, y no
    // más de una vez cada 5 días hábiles por expediente.
    agenteDia: num(process.env.SEGUIMIENTO_AGENTE_DIA, 3),
    sembrarMin: num(process.env.SEGUIMIENTO_SEMBRAR_MIN, 30),
};

const activo = () => process.env.SEGUIMIENTO_ENABLED === 'true';
const modo = () => (process.env.SEGUIMIENTO_MODO === 'real' ? 'real' : 'copia');
// Separados por comas («600 111 222, 611222333»): los espacios dentro de un número no lo parten.
const prueba = () => new Set(String(process.env.SEGUIMIENTO_PRUEBA || '').split(/[,;]+/).map(t => t.replace(/\D/g, '').slice(-9)).filter(t => t.length === 9));
/** El modo para ESTE teléfono: con `SEGUIMIENTO_PRUEBA`, lo real solo para esos. */
function modoPara(tel9) {
    if (modo() !== 'real') return 'copia';
    const p = prueba();
    return p.size && !p.has(tel9) ? 'copia' : 'real';
}

const ult9 = (t) => String(t || '').replace(/\D/g, '').slice(-9) || null;
const recorta = (s, n) => { const v = String(s || '').replace(/\s+/g, ' ').trim(); return v.length > n ? `${v.slice(0, n - 1)}…` : v; };
const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';
const enlaceAceptar = (oportunidadUuid) => `${FRONTEND()}/firma/${oportunidadUuid}`;
const log = (...a) => console.log('[seguimiento]', ...a);
const accion = (row, a) => [...(Array.isArray(row.acciones) ? row.acciones : []), { at: new Date().toISOString(), ...a }].slice(-12);
const ESTADOS_PROPUESTA = ['ENVIADA', 'PRE-ACEPTADO'];

// ─── Quién ───────────────────────────────────────────────────────────────────
// Los de la CASA no son destinatarios nunca (Fran, administración): medido el 15/11/2026,
// BROKERGY figuraba como «instalador» de 9 propuestas suyas y el repaso le iba a Fran.
const TELS_CASA = () => new Set([process.env.ASISTENTE_WHATSAPP_TEL, process.env.WHATSAPP_ADMIN_CHAT, process.env.ADMIN_WHATSAPP, '623926179']
    .map(ult9).filter(Boolean));
/** Un MÓVIL español (6xx, 7xx) que no es de la casa: a un fijo no le llega un WhatsApp. */
const valeTel = (t) => { const t9 = ult9(t); return !!t9 && /^[67]\d{8}$/.test(t9) && !TELS_CASA().has(t9) ? t9 : null; };
const esLaCasa = (empresa) => /^BROKERGY$/i.test(String(empresa || '').trim());

/**
 * La FICHA de los clientes (una consulta): el nombre del titular para el texto («Ana García»,
 * nombre y primer apellido) y, si es una EMPRESA, a quién se saluda (su representante, o nadie:
 * «Hola Autoservicio» no). @returns {Promise<Map<id, {nombre, empresa, saludo}>>}
 */
/**
 * El «nombre» de la ficha no es de una persona: una calle («CL GOYA 15»), «PROPIETARIO …», lo que
 * hay en la casa («CALDERA CARBÓN») o lleva números. Medido el 15/11/2026: 6 propuestas vivas así,
 * todas dadas de alta por el instalador.
 */
function nombreProvisional(n) {
    const t = String(n || '').trim();
    if (!t) return false;
    return /\d/.test(t)
        || /^(PROPIETARI[OA]|CLIENTE|TITULAR|SIN NOMBRE)\b/i.test(t)
        || /^(CL|C\/|CALLE|AVDA?|AVENIDA|PLAZA|PZA|CTRA|CARRETERA|CAMINO|PASEO|URB|TRAV|RONDA)(\b|\.)/i.test(t)
        || /^(CALDERA|VIVIENDA|CASA|OBRA|AEROTERMIA|NAVE|LOCAL|CHALET|PISO)\b/i.test(t);
}

async function fichasClientes(ids) {
    const out = new Map();
    const unicos = [...new Set((ids || []).filter(Boolean))];
    for (let i = 0; i < unicos.length; i += 100) {
        const { data } = await supabase.from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos, es_empresa, representante_nombre')
            .in('id_cliente', unicos.slice(i, i + 100));
        const { capitalizar } = require('./recordatorios');
        for (const c of data || []) {
            const empresa = c.es_empresa === true || /(S\.?L\.?U?|S\.?A\.?U?|C\.?B\.?|S\.?COOP)\.?$/i.test(String(c.nombre_razon_social || '').trim());
            const completo = `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim();
            // Ficha con un nombre PROVISIONAL (la dio de alta el instalador con la calle o «PROPIETARIO»):
            // se nombra ENTERA, como la escribió él, y a esa persona no se la saluda por ese «nombre».
            if (!empresa && nombreProvisional(completo)) {
                out.set(c.id_cliente, { nombre: capitalizar(completo) || null, empresa: false, saludo: null, provisional: true });
                continue;
            }
            const ap1 = String(c.apellidos || '').trim().split(/\s+/)[0] || '';
            out.set(c.id_cliente, {
                nombre: capitalizar(empresa ? c.nombre_razon_social : `${c.nombre_razon_social || ''} ${ap1}`.trim()) || null,
                empresa,
                saludo: empresa ? (c.representante_nombre || null) : (c.nombre_razon_social || null),
            });
        }
    }
    return out;
}

/** El cliente como destinatario (o su persona de contacto, si la ficha desvía los avisos). */
async function destinoCliente(clienteId, ficha) {
    if (!clienteId) return null;
    const d = await require('./aceptacionAgente').destinatarioCliente(clienteId);
    const tel9 = valeTel(d.tlf);
    if (!tel9) return null;
    if (d.titular) return { quien: 'CONTACTO', tel9, nombre: d.saludo || null, titular: d.titular };
    return { quien: 'CLIENTE', tel9, nombre: ficha ? ficha.saludo : (d.saludo || null), titular: null };
}

/** El instalador (su contacto COMERCIAL) como destinatario; nunca la propia casa. */
async function destinoInstalador(op) {
    const i = await require('./aceptacionAgente').destinatarioInstalador(op);
    if (!i || esLaCasa(i.empresa)) return null;
    const tel9 = valeTel(i.tlf);
    // Un saludo que es un teléfono o el nombre de la empresa no es un nombre de pila.
    const nombre = i.saludo && !/\d/.test(i.saludo) ? i.saludo : null;
    return tel9 ? { quien: 'INSTALADOR', tel9, nombre, empresa: i.empresa || null } : null;
}

/**
 * A quién se le pregunta por una PROPUESTA. Si le llegó al cliente, a él (o a su persona de
 * contacto); si solo la tiene el instalador, al contacto COMERCIAL del instalador; sin
 * instalador de verdad (o es la propia casa) o sin envío registrado, al cliente. null si no
 * hay a quién (o solo un fijo).
 */
async function destinoPropuesta(op, entrega, ficha) {
    if (entrega?.cliente) {
        const c = await destinoCliente(op.cliente_id, ficha);
        if (c) return c;
    }
    const i = await destinoInstalador(op);
    if (i) return i;
    return destinoCliente(op.cliente_id, ficha);
}

/** ¿Solo lleva toques de MODO COPIA? (al pasar a real, su escalera empieza de cero). */
const soloCopia = (f) => {
    const t = (Array.isArray(f?.acciones) ? f.acciones : []).filter(a => a.accion === 'toque');
    return t.length > 0 && !t.some(a => a.modo === 'real');
};

/** ¿La tabla aún no existe? (en seco, antes de aplicar wa_seguimientos_schema.sql, se trata como vacía). */
const tablaFalta = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message || ''));

/** El cliente (o su contacto) y el instalador de un expediente: el principal y «el otro lado». */
async function destinosCee(op, exp, aa, ficha) {
    const cli = await destinoCliente(exp.cliente_id, ficha);
    const inst = await destinoInstalador(op);
    // Al cliente por defecto; al instalador si el agente se lo pidió a él o si el cliente no tiene móvil.
    const alInstalador = (aa?.pedido_quien === 'instalador' && inst) || !cli;
    const principal = alInstalador ? inst : cli;
    const otro = alInstalador ? cli : inst;
    if (!principal) return null;
    return { principal, otro: otro && otro.tel9 !== principal.tel9 ? otro : null };
}

// ─── Sembrar ─────────────────────────────────────────────────────────────────
/** La fecha del ÚLTIMO envío que salió bien (de `propuesta_versiones`), o null. */
function ultimoEnvio(versiones) {
    let max = null;
    for (const v of Array.isArray(versiones) ? versiones : []) {
        const ok = (Array.isArray(v?.envios) ? v.envios : []).some(e => e?.status === 'ok' || e?.ok === true);
        const f = Date.parse(v?.fecha || '');
        if (ok && Number.isFinite(f) && (max === null || f > max)) max = f;
    }
    return max === null ? null : new Date(max).toISOString();
}

const sinEncargar = (exp) => { const s = exp?.seguimiento?.cee_inicial; return !s || s === 'PTE_ENVIO_CERT'; };

let ultimaSiembra = 0;
/**
 * Pone al día `wa_seguimientos` con lo vivo de la app. `seco`: no escribe y devuelve lo que haría.
 * @returns {Promise<{nuevos: object[], cerrados: object[], reiniciados: object[], sinDestino: string[]}>}
 */
async function sembrar({ seco = false, ahora = new Date() } = {}) {
    const out = { nuevos: [], cerrados: [], reiniciados: [], sinDestino: [] };
    const { data: filas, error: e0 } = await supabase.from('wa_seguimientos')
        .select('id, tipo, oportunidad_id, numero, estado, fase, toques, tel9, base_at, ultimo_toque_at, resultado, acciones, detalle').limit(5000);
    if (e0 && !(seco && tablaFalta(e0))) throw new Error(`wa_seguimientos: ${e0.message}`);
    if (e0) out.sinTabla = true;
    const vivas = new Map();      // `${tipo}:${op}` → fila viva
    const todas = new Map();      // `${tipo}:${op}` → [filas]
    for (const f of filas || []) {
        const k = `${f.tipo}:${f.oportunidad_id}`;
        if (f.estado !== 'CERRADO') vivas.set(k, f);
        todas.set(k, [...(todas.get(k) || []), f]);
    }
    const insertar = async (fila) => {
        out.nuevos.push(fila);
        if (seco) return;
        const { error } = await supabase.from('wa_seguimientos').insert(fila);
        if (error && !/duplicate key/i.test(error.message)) log(`alta ${fila.numero}: ${error.message}`);
    };
    const cerrarFila = async (f, resultado, motivo) => {
        out.cerrados.push({ id: f.id, numero: f.numero, tipo: f.tipo, resultado });
        if (seco) return;
        await supabase.from('wa_seguimientos').update({
            estado: 'CERRADO', resultado: f.resultado && ['NO_SIGUE', 'SIN_RESPUESTA'].includes(f.resultado) ? f.resultado : resultado,
            cerrado_at: ahora.toISOString(), updated_at: ahora.toISOString(), acciones: accion(f, { accion: 'cerrado', motivo }),
        }).eq('id', f.id);
    };

    // ── PROPUESTAS ──
    const { data: ops, error: e1 } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, estado, cliente_id, prescriptor_id, instalador_asociado_id, referencia_cliente, pv:datos_calculo->propuesta_versiones, mun:datos_calculo->inputs->>municipio')
        .in('estado', ESTADOS_PROPUESTA);
    if (e1) throw new Error(`oportunidades: ${e1.message}`);
    // El nombre del titular sale de su FICHA: `referencia_cliente` es la referencia que puso
    // quien la dio de alta («RUFINO SH - GRECO, 8 EL BONILLO»), no un nombre.
    const fichas = await fichasClientes((ops || []).map(o => o.cliente_id));
    const enUniverso = new Set();
    for (const op of ops || []) {
        enUniverso.add(`PROPUESTA:${op.id}`);
        const baseAt = ultimoEnvio(op.pv);
        const k = `PROPUESTA:${op.id}`;
        const viva = vivas.get(k);
        if (viva) {
            // Pasa a REAL con la escalera gastada en copia: empieza de cero, como si naciera hoy.
            if (modoPara(viva.tel9) === 'real' && soloCopia(viva)) {
                const p = Pasos.primerPaso('PROPUESTA', { baseAt, preAceptado: op.estado === 'PRE-ACEPTADO' }, ahora);
                out.reiniciados.push({ numero: viva.numero, fase: p.fase, motivo: 'pasa a real' });
                if (!seco) await supabase.from('wa_seguimientos').update({
                    estado: 'ABIERTO', fase: p.fase, proximo_at: p.proximo.toISOString(), toques: 0,
                    updated_at: ahora.toISOString(), acciones: accion(viva, { accion: 'reinicio', motivo: 'pasa a modo real' }),
                }).eq('id', viva.id);
            } else if (baseAt && viva.base_at && Date.parse(baseAt) > Date.parse(viva.base_at) + 3_600_000 && viva.resultado !== 'SIGUE') {
                // Una versión NUEVA enviada después: la escalera vuelve a empezar.
                const p = Pasos.primerPaso('PROPUESTA', { baseAt, preAceptado: op.estado === 'PRE-ACEPTADO' }, ahora);
                out.reiniciados.push({ numero: viva.numero, fase: p.fase });
                if (!seco) await supabase.from('wa_seguimientos').update({
                    estado: 'ABIERTO', fase: p.fase, proximo_at: p.proximo.toISOString(), toques: 0, base_at: baseAt,
                    updated_at: ahora.toISOString(), acciones: accion(viva, { accion: 'reinicio', motivo: 'propuesta enviada otra vez' }),
                }).eq('id', viva.id);
            } else if (op.estado === 'PRE-ACEPTADO' && !['ACEPTAR', 'CIERRE'].includes(viva.fase) && viva.resultado !== 'SIGUE') {
                // Se pre-aceptó a mano (una llamada): lo que toca es el enlace de aceptación.
                const p = Pasos.primerPaso('PROPUESTA', { preAceptado: true }, ahora);
                out.reiniciados.push({ numero: viva.numero, fase: 'ACEPTAR' });
                if (!seco) await supabase.from('wa_seguimientos').update({
                    estado: 'ABIERTO', fase: 'ACEPTAR', proximo_at: p.proximo.toISOString(), toques: 0, resultado: 'SIGUE',
                    updated_at: ahora.toISOString(), acciones: accion(viva, { accion: 'reinicio', motivo: 'pre-aceptada' }),
                }).eq('id', viva.id);
            }
            continue;
        }
        // Una cerrada con el MISMO envío no renace (en copia, una «aparcada» seguiría en ENVIADA)…
        // salvo que se aparcara solo en copia y ahora toque de verdad.
        const previas = (todas.get(k) || []).filter(f => !(f.resultado === 'SIN_RESPUESTA' && soloCopia(f) && modoPara(f.tel9) === 'real'));
        if (previas.some(f => (!baseAt && !f.base_at) || (baseAt && f.base_at && Date.parse(f.base_at) >= Date.parse(baseAt) - 60_000))) continue;
        const entrega = entregaPropuesta(op.pv);
        const ficha = fichas.get(op.cliente_id) || null;
        const dest = await destinoPropuesta(op, entrega, ficha);
        if (!dest) { out.sinDestino.push(op.id_oportunidad); continue; }
        const p = Pasos.primerPaso('PROPUESTA', { baseAt, preAceptado: op.estado === 'PRE-ACEPTADO' }, ahora);
        await insertar({
            tipo: 'PROPUESTA', oportunidad_id: op.id, numero: op.id_oportunidad,
            cliente: ficha?.nombre || op.referencia_cliente || null, municipio: op.mun || null,
            destino: dest.quien, tel9: dest.tel9, nombre: dest.nombre, partner_id: op.instalador_asociado_id || op.prescriptor_id || null,
            estado: 'ABIERTO', fase: p.fase, proximo_at: p.proximo.toISOString(), base_at: baseAt,
            resultado: op.estado === 'PRE-ACEPTADO' ? 'SIGUE' : null,
            detalle: { titular: dest.titular || null, empresa: dest.empresa || null, ref: !ficha || !!ficha.provisional, entrega: entrega ? (entrega.cliente ? 'cliente' : 'instalador') : 'sin_envio' },
            acciones: [{ at: ahora.toISOString(), accion: 'alta', fase: p.fase }],
        });
    }

    // ── CEE INICIAL ──
    const { data: exps, error: e2 } = await supabase.from('expedientes')
        .select('id, numero_expediente, estado, oportunidad_id, cliente_id, created_at, seguimiento, cal:instalacion->caldera_antigua_cal->>rendimiento_id, aa:documentacion->aceptacion_agente')
        .eq('estado', 'PTE. CEE INICIAL');
    if (e2) throw new Error(`expedientes: ${e2.message}`);
    const candidatos = (exps || []).filter(sinEncargar);
    const idsOp = candidatos.map(e => e.oportunidad_id).filter(Boolean);
    const { data: opsCee } = idsOp.length ? await supabase.from('oportunidades')
        .select('id, id_oportunidad, referencia_cliente, prescriptor_id, instalador_asociado_id, up:datos_calculo->reforma_uploads, dec:datos_calculo->>cee_decision, mun:datos_calculo->inputs->>municipio')
        .in('id', idsOp) : { data: [] };
    const opPorId = new Map((opsCee || []).map(o => [o.id, o]));
    const fichasCee = await fichasClientes(candidatos.map(e => e.cliente_id));
    for (const exp of candidatos) {
        const op = opPorId.get(exp.oportunidad_id);
        if (!op || op.dec === 'usar_cee_aportado') continue;      // el CEE lo aporta el cliente
        const k = `CEE_INICIAL:${op.id}`;
        enUniverso.add(k);
        const viva = vivas.get(k);
        if (viva) {
            const pedidoAt = exp.aa?.pedido_at ? Date.parse(exp.aa.pedido_at) : 0;
            const ultimo = Date.parse(viva.ultimo_toque_at || viva.base_at || 0) || 0;
            if (modoPara(viva.tel9) === 'real' && soloCopia(viva)) {
                // Pasa a REAL con la escalera gastada en copia: empieza de cero.
                const p = Pasos.primerPaso('CEE_INICIAL', { pedidoAt: exp.aa?.pedido_at || null, creadoAt: exp.created_at }, ahora);
                out.reiniciados.push({ numero: viva.numero, fase: p.fase, motivo: 'pasa a real' });
                if (!seco) await supabase.from('wa_seguimientos').update({
                    estado: 'ABIERTO', fase: p.fase, proximo_at: p.proximo.toISOString(), toques: 0, updated_at: ahora.toISOString(),
                    acciones: accion(viva, { accion: 'reinicio', motivo: 'pasa a modo real' }),
                }).eq('id', viva.id);
            } else if (pedidoAt && pedidoAt > ultimo + 60_000) {
                // Lo ha pedido el agente de la aceptación (o una persona) después de nuestro último
                // toque: el siguiente recordatorio cuenta desde ESE pedido, y el PEDIDO ya está hecho.
                const fase = viva.fase === 'PEDIDO' ? 'R1' : viva.fase;
                const proximo = Pasos.habilesDespues(new Date(pedidoAt), Pasos.PLAN.CEE_INICIAL.R1.tras);
                out.reiniciados.push({ numero: viva.numero, fase, motivo: 'pedido por el agente' });
                if (!seco) await supabase.from('wa_seguimientos').update({
                    fase, proximo_at: proximo.toISOString(), base_at: exp.aa.pedido_at, ultimo_toque_at: exp.aa.pedido_at, updated_at: ahora.toISOString(),
                    acciones: accion(viva, { accion: 'aplazado', motivo: 'lo ha pedido el agente de la aceptación' }),
                }).eq('id', viva.id);
            }
            continue;
        }
        const fichaCee = fichasCee.get(exp.cliente_id) || null;
        const d = await destinosCee(op, exp, exp.aa, fichaCee);
        if (!d) { out.sinDestino.push(exp.numero_expediente); continue; }
        const mat = materialCee(op.up, { caldera_antigua_cal: { rendimiento_id: exp.cal } });
        const p = Pasos.primerPaso('CEE_INICIAL', { pedidoAt: exp.aa?.pedido_at || null, creadoAt: exp.created_at }, ahora);
        await insertar({
            tipo: 'CEE_INICIAL', oportunidad_id: op.id, expediente_id: exp.id, numero: exp.numero_expediente,
            cliente: fichaCee?.nombre || op.referencia_cliente || null, municipio: op.mun || null,
            destino: d.principal.quien, tel9: d.principal.tel9, nombre: d.principal.nombre, partner_id: op.instalador_asociado_id || op.prescriptor_id || null,
            estado: 'ABIERTO', fase: p.fase, proximo_at: p.proximo.toISOString(), base_at: exp.aa?.pedido_at || exp.created_at,
            detalle: { titular: d.principal.titular || null, otro: d.otro, faltan: mat.faltan, empresa: d.principal.empresa || d.otro?.empresa || null, ref: !fichaCee || !!fichaCee.provisional },
            acciones: [{ at: ahora.toISOString(), accion: 'alta', fase: p.fase }],
        });
    }

    // ── Lo que ya no está vivo: se cierra con lo que ha pasado ──
    const fuera = [...vivas.entries()].filter(([k]) => !enUniverso.has(k)).map(([, f]) => f);
    if (fuera.length) {
        const ids = [...new Set(fuera.map(f => f.oportunidad_id))];
        const { data: est } = await supabase.from('oportunidades').select('id, estado').in('id', ids);
        const estado = new Map((est || []).map(o => [o.id, o.estado]));
        for (const f of fuera) {
            const e = estado.get(f.oportunidad_id) || 'DESAPARECIDA';
            const res = f.tipo === 'CEE_INICIAL' ? 'ENCARGADO' : e === 'ACEPTADA' ? 'ACEPTADA' : e === 'RECHAZADA' ? 'RECHAZADA' : e;
            await cerrarFila(f, res, `la oportunidad está en ${e}`);
        }
    }
    ultimaSiembra = Date.now();
    return out;
}

// ─── Lo que falta para el CEE inicial, mirando Drive ────────────────────────
/**
 * Las líneas y el enlace de lo que falta (criterio de materialCee, reconciliado con Drive
 * por buildDocsView). `lineas: []` = está todo. En una obra de FESSA SOLAR la vivienda no
 * se le pide al cliente: el CEE inicial lo aporta FESSA (regla de «lo que no se le pregunta»).
 */
async function faltaCee(row, { seco = false } = {}) {
    const docs = require('./reformaUploadService');
    const { data: opp } = await supabase.from('oportunidades').select('id, id_oportunidad, datos_calculo').eq('id', row.oportunidad_id).maybeSingle();
    if (!opp) return { lineas: [], enlace: null };
    const view = await docs.buildDocsView(opp);
    const slots = new Map((view.slots || []).map(s => [s.key, s]));
    const n = (k) => { const s = slots.get(k); return s && (s.existing || s.items?.length || s.waived) ? 1 : 0; };
    const { data: exp } = await supabase.from('expedientes').select('cal:instalacion->caldera_antigua_cal->>rendimiento_id').eq('id', row.expediente_id).maybeSingle();
    const m = materialCee({
        [SLOT.VIDEO]: Array(n(SLOT.VIDEO)).fill(1), [SLOT.FACHADA]: Array(n(SLOT.FACHADA)).fill(1), [SLOT.PATIOS]: Array(n(SLOT.PATIOS)).fill(1),
        [SLOT.CALDERA]: Array(n(SLOT.CALDERA)).fill(1), [SLOT.PLACA]: Array(n(SLOT.PLACA)).fill(1),
    }, { caldera_antigua_cal: { rendimiento_id: exp?.cal } });
    const fessa = /FESSA/i.test(String(row.detalle?.empresa || ''));
    const lineas = [];
    const claves = [];
    // Solo lo que ESTA obra tiene como apartado: lo que su checklist no pide no se reclama.
    const tiene = (...k) => k.some(x => slots.has(x));
    if (m.vivienda.estado === 'falta' && !fessa && tiene(SLOT.VIDEO, SLOT.FACHADA)) { lineas.push(Textos.LINEA.vivienda); claves.push(SLOT.VIDEO, SLOT.FACHADA, SLOT.PATIOS); }
    if (m.caldera.aplica && !m.caldera.fotos && tiene(SLOT.CALDERA)) {
        // Con calefacción eléctrica el apartado no es una caldera (calderaPendiente): no se le pide «la caldera».
        const esCaldera = /caldera/i.test(slots.get(SLOT.CALDERA)?.label || 'caldera');
        lineas.push(esCaldera ? Textos.LINEA.caldera : Textos.LINEA.generador);
        claves.push(SLOT.CALDERA);
    }
    if (m.placa.aplica && !m.placa.fotos && tiene(SLOT.PLACA)) { lineas.push(Textos.LINEA.placa); claves.push(SLOT.PLACA); }
    if (!lineas.length) return { lineas, enlace: null };
    const need = claves.filter(k => slots.has(k));
    // En seco no se crea el token (escribiría en la oportunidad): el que haya, o un hueco visible.
    const base = seco ? (await docs.uploadLinkSiExiste(opp.id)) || '[enlace de subida]' : await docs.ensureUploadLink(opp.id);
    const enlace = need.length && base.includes('/subir-docs/') ? `${base}${base.includes('?') ? '&' : '?'}need=${need.join(',')}` : base;
    return { lineas, enlace };
}

// ─── La vuelta ───────────────────────────────────────────────────────────────
/** El destinatario efectivo de una fila en su fase (el R3 va al «otro lado» si lo hay). */
function destinoDeFila(row) {
    if (row.tipo === 'CEE_INICIAL' && row.fase === 'R3' && row.detalle?.otro?.tel9) {
        return { ...row.detalle.otro, otroLado: true };
    }
    return { quien: row.destino, tel9: row.tel9, nombre: row.nombre, titular: row.detalle?.titular || null, otroLado: false };
}

const inicioDiaMadrid = (ahora) => Pasos.aLasMadrid(Pasos.ymdMadrid(ahora), 0);

/** Cuántos toques REALES se han dado hoy y en la última hora, y a qué teléfonos. */
async function contadores(ahora) {
    const desde = inicioDiaMadrid(ahora).toISOString();
    const { data } = await supabase.from('wa_seguimientos').select('tel9, ultimo_toque_at, fase, acciones, detalle')
        .gte('ultimo_toque_at', desde).limit(1000);
    let dia = 0; let hora = 0; let repasos = 0;
    const tels = new Set();
    for (const r of data || []) {
        for (const a of r.acciones || []) {
            if (a.accion !== 'toque' || a.at < desde) continue;
            if (a.tel9) tels.add(a.tel9);
            if (a.fase === 'REPASO') repasos += 1;
            if (a.modo !== 'real') continue;
            dia += 1;
            if (Date.parse(a.at) > ahora.getTime() - 3_600_000) hora += 1;
        }
    }
    return { dia, hora, repasos, tels };
}

async function cambiarOportunidad(numero, nuevoEstado, comentario, usuario = 'Sistema (seguimiento WhatsApp)') {
    const API = `http://127.0.0.1:${process.env.PORT_EFECTIVO || process.env.PORT || 3000}/api`;
    const h = { 'x-internal-key': process.env.INTERNAL_API_KEY || '', 'Content-Type': 'application/json' };
    const r = await fetch(`${API}/oportunidades/${encodeURIComponent(numero)}/estado`, {
        method: 'PATCH', headers: h, body: JSON.stringify({ nuevo_estado: nuevoEstado, usuario }), signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`estado ${nuevoEstado}: ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
    if (comentario) {
        await fetch(`${API}/oportunidades/${encodeURIComponent(numero)}/comentarios`, {
            method: 'POST', headers: h, body: JSON.stringify({ comentario, usuario }), signal: AbortSignal.timeout(30_000),
        }).catch(e => log(`comentario ${numero}: ${e.message}`));
    }
}

/**
 * CEE inicial con el material completo y sin encargar: es NUESTRO. Se le vuelve a encargar
 * al agente de la aceptación (que hace el CEE), como mucho una vez cada 5 días hábiles.
 */
async function empujarAgente(row, { m, seco, ahora, cuenta }) {
    const ultimo = row.detalle?.agente_at ? Date.parse(row.detalle.agente_at) : 0;
    if (ultimo && Pasos.habilesDespues(new Date(ultimo), 5) > ahora) return { accion: 'espera_agente' };
    if (cuenta.agente >= CFG.agenteDia) return { accion: 'tope_agente' };
    cuenta.agente += 1;
    let r = { ok: false, motivo: 'modo copia' };
    if (!seco && m === 'real') r = await require('./aceptacionAgente').revisarPorSeguimiento(row.expediente_id);
    if (!seco) await supabase.from('wa_seguimientos').update({
        detalle: { ...(row.detalle || {}), agente_at: ahora.toISOString(), completo_at: row.detalle?.completo_at || ahora.toISOString() },
        proximo_at: Pasos.habilesDespues(ahora, 5).toISOString(), updated_at: ahora.toISOString(),
        acciones: accion(row, { accion: 'agente', modo: m, ok: !!r.ok, motivo: r.motivo || null }),
    }).eq('id', row.id);
    return { accion: m === 'real' ? 'agente' : 'agente_copia', ok: r.ok };
}

let enVuelta = false;
/**
 * Una vuelta: siembra si toca, y manda lo que vence. `seco`: no escribe ni manda nada y
 * devuelve, con los textos enteros, lo que haría AHORA (sin mirar el horario si `sinHorario`).
 */
async function vuelta({ seco = false, ahora = new Date(), sinHorario = false, sembrarYa = false, hasta = null } = {}) {
    // `hasta` (solo en seco): lo que vence hasta ese momento, para simular el día entero.
    const corte = seco && hasta ? hasta : ahora;
    const hecho = [];
    if (!seco && !activo()) return { hecho, motivo: 'apagado' };
    if (enVuelta && !seco) return { hecho, motivo: 'ya hay una vuelta' };
    if (!seco) enVuelta = true;
    try {
        let siembra = null;
        if (seco || sembrarYa || Date.now() - ultimaSiembra > CFG.sembrarMin * 60_000) siembra = await sembrar({ seco, ahora });
        if (!sinHorario && !horario.puedeInsistir(ahora)) return { hecho, siembra, motivo: 'fuera de horario' };

        let { data: filas, error } = await supabase.from('wa_seguimientos').select('*')
            .in('estado', ['ABIERTO', 'CONTESTADO']).lte('proximo_at', corte.toISOString())
            .order('proximo_at').limit(80);
        if (error && !(seco && tablaFalta(error))) throw new Error(error.message);
        filas = (filas || []).filter(f => f.fase && f.fase !== 'AGOTADO');
        // En seco, lo que la siembra acaba de dar de alta y ya vence (no está en la BD).
        if (seco && siembra) {
            filas.push(...siembra.nuevos.filter(n => Date.parse(n.proximo_at) <= corte.getTime())
                .map((n, i) => ({ ...n, id: `nuevo${i + 1}`, toques: 0, acciones: [] })));
        }
        if (!filas.length) return { hecho, siembra };

        const c = await contadores(ahora);
        const cuenta = { vuelta: 0, agente: 0 };
        // Teléfonos con una respuesta suya en las últimas 24 h: la conversación la lleva el contestador.
        const { data: recientes } = await supabase.from('wa_seguimientos').select('tel9')
            .gte('contestado_at', new Date(ahora.getTime() - 24 * 3_600_000).toISOString()).limit(500);
        const hablando = new Set((recientes || []).map(r => r.tel9));

        // Agrupar: UN mensaje por persona, tipo y fase.
        const grupos = new Map();
        for (const f of filas) {
            const d = destinoDeFila(f);
            const k = `${d.tel9}|${f.tipo}|${f.fase}|${d.otroLado ? 'otro' : ''}`;
            if (!grupos.has(k)) grupos.set(k, { dest: d, tipo: f.tipo, fase: f.fase, filas: [] });
            grupos.get(k).filas.push(f);
        }

        const posponer = async (g, hasta, motivo) => {
            hecho.push({ numeros: g.filas.map(f => f.numero), accion: 'pospuesto', motivo, hasta: hasta.toISOString() });
            if (seco) return;
            for (const f of g.filas) {
                await supabase.from('wa_seguimientos').update({ proximo_at: hasta.toISOString(), updated_at: ahora.toISOString() }).eq('id', f.id);
            }
        };

        // El CEE inicial primero (antes de la obra y de su factura: no puede esperar); de las
        // propuestas, quien ya dijo que sí, luego lo reciente, y los REPASOS de lo atrasado al final.
        const ORDEN = { ACEPTAR: 1, RETOMAR: 2, PRIMERO: 3, SEGUNDO: 4, PREGUNTA: 5, CIERRE: 6, REPASO: 9 };
        const enOrden = [...grupos.values()].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'CEE_INICIAL' ? -1 : 1)
            || ((ORDEN[a.fase] || 7) - (ORDEN[b.fase] || 7)));
        for (const g of enOrden) {
            const tel9 = g.dest.tel9;
            const m = modoPara(tel9);
            if (!tel9) { await posponer(g, Pasos.habilesDespues(ahora, 5), 'sin teléfono'); continue; }

            // CEE: lo que falta se mira en Drive al mandar. Lo completo no se pide: es nuestro.
            let items = [];
            if (g.tipo === 'CEE_INICIAL') {
                for (const f of g.filas) {
                    let falta;
                    try { falta = await faltaCee(f, { seco }); } catch (e) { log(`${f.numero}: no se ha podido mirar lo que falta: ${e.message}`); continue; }
                    if (!falta.lineas.length) {
                        const r = await empujarAgente(f, { m, seco, ahora, cuenta });
                        hecho.push({ numeros: [f.numero], accion: r.accion, motivo: 'el material está completo: el CEE inicial es nuestro' });
                        continue;
                    }
                    items.push({ fila: f, numero: f.numero, cliente: f.cliente, municipio: f.municipio, ref: !!f.detalle?.ref, lineas: falta.lineas, enlace: falta.enlace });
                }
                if (!items.length) continue;
            } else {
                items = g.filas.map(f => ({ fila: f, numero: f.numero, cliente: f.cliente, municipio: f.municipio, ref: !!f.detalle?.ref, enviadaAt: f.base_at, enlace: enlaceAceptar(f.oportunidad_id) }));
            }

            // Topes y cortesías.
            if (c.tels.has(tel9)) { await posponer(g, Pasos.habilesDespues(ahora, 1), 'ya se le ha escrito hoy'); continue; }
            if (hablando.has(tel9)) { await posponer(g, Pasos.habilesDespues(ahora, 1), 'está hablando con nosotros'); continue; }
            const pausa = await require('./esperasWhatsapp').pausaDe(tel9).catch(() => null);
            if (pausa) { await posponer(g, Pasos.habilesDespues(pausa, 0), 'lo lleva una persona de la casa'); continue; }
            if (g.fase === 'REPASO' && c.repasos >= CFG.repasoDia) { await posponer(g, Pasos.habilesDespues(ahora, 1), 'repasos del día agotados'); continue; }
            if (cuenta.vuelta >= CFG.porVuelta) break;
            if (m === 'real' && (c.dia >= CFG.topeDia || c.hora >= CFG.topeHora)) break;

            const dest = { quien: g.dest.quien, nombre: g.dest.nombre, titular: g.dest.titular };
            const texto = g.tipo === 'PROPUESTA'
                ? Textos.textoPropuesta(g.fase, dest, items, { contestado: g.filas.some(f => f.contestado_at) })
                : Textos.textoCee(g.fase, dest, items, { otroLado: g.dest.otroLado });
            if (!texto) continue;
            cuenta.vuelta += 1;
            c.tels.add(tel9);
            if (g.fase === 'REPASO') c.repasos += 1;
            hecho.push({ numeros: items.map(i => i.numero), tipo: g.tipo, fase: g.fase, accion: m === 'real' ? 'enviado' : 'copia', a: `${g.dest.nombre || tel9} (${g.dest.quien.toLowerCase()})`, tel9, texto });
            // En seco se cuenta igual (los topes del día se ven en la simulación), pero no sale nada.
            if (seco) { if (m === 'real') { c.dia += 1; c.hora += 1; } continue; }

            if (m === 'real') {
                const out = await require('./whatsappService').sendText(`34${tel9}`, texto);
                if (out && out.ok === false) { log(`no ha salido a ${tel9}: ${out.error || '?'}`); continue; }
                c.dia += 1; c.hora += 1;
            }
            for (const it of items) {
                const f = it.fila;
                const sig = Pasos.trasToque(f.tipo, f.fase, { toques: f.toques, ahora });
                const upd = {
                    estado: sig.cierra ? 'CERRADO' : 'ABIERTO', fase: sig.fase, proximo_at: sig.proximo ? sig.proximo.toISOString() : null,
                    toques: f.toques + 1, ultimo_toque_at: ahora.toISOString(), updated_at: ahora.toISOString(),
                    acciones: accion(f, { accion: 'toque', fase: f.fase, modo: m, tel9, texto: String(texto).slice(0, 900) }),
                };
                // A QUIÉN se le ha escrito y cuándo: solo lo que conteste ESE teléfono después es respuesta.
                upd.detalle = { ...(f.detalle || {}), escritos: { ...(f.detalle?.escritos || {}), [tel9]: ahora.toISOString() } };
                if (f.tipo === 'CEE_INICIAL') upd.detalle.faltan = it.lineas;
                if (sig.cierra) Object.assign(upd, { resultado: 'SIN_RESPUESTA', cerrado_at: ahora.toISOString() });
                await supabase.from('wa_seguimientos').update(upd).eq('id', f.id);
                // CEE: lo pedido queda apuntado como pedido del agente (historial, e índice con el
                // teléfono: las fotos que vuelvan por WhatsApp abren su revisión).
                if (f.tipo === 'CEE_INICIAL' && m === 'real') {
                    await require('./aceptacionAgente').registrarPedido({
                        expedienteId: f.expediente_id, oportunidadId: f.oportunidad_id, numero: f.numero, lineas: it.lineas,
                        tel: tel9, saludo: g.dest.nombre, a: g.dest.quien === 'INSTALADOR' ? 'instalador' : 'cliente',
                        espera: false, texto: `Recordatorio por WhatsApp (seguimiento, ${f.fase})`,
                    }).catch(e => log(`${f.numero}: no se ha apuntado el pedido: ${e.message}`));
                }
                // PROPUESTA aparcada sin respuesta: la oportunidad se CIERRA (solo en real).
                if (sig.cierra && f.tipo === 'PROPUESTA' && m === 'real') {
                    await cambiarOportunidad(f.numero, 'RECHAZADA', 'Cerrada por el seguimiento de WhatsApp: sin respuesta tras preguntar varias veces por la propuesta. Si vuelve a escribir, se reactiva.')
                        .catch(e => log(`${f.numero}: no se ha podido cerrar: ${e.message}`));
                }
            }
        }
        return { hecho, siembra };
    } catch (e) {
        log('vuelta:', e.message);
        return { hecho, motivo: e.message };
    } finally {
        if (!seco) enVuelta = false;
    }
}

// ─── El watchdog: cuando contestan ───────────────────────────────────────────
const abiertos = { at: 0, tels: new Set() };
async function telsAbiertos() {
    if (Date.now() - abiertos.at < 120_000) return abiertos.tels;
    const { data, error } = await supabase.from('wa_seguimientos').select('tel9, detalle').neq('estado', 'CERRADO').limit(3000);
    if (error) throw new Error(error.message);
    const s = new Set();
    for (const r of data || []) { if (r.tel9) s.add(r.tel9); if (r.detalle?.otro?.tel9) s.add(r.detalle.otro.tel9); }
    abiertos.tels = s;
    abiertos.at = Date.now();
    return s;
}

/** Un mensaje que ENTRA (listener de la sesión): si es de alguien a quien seguimos, CONTESTADO. Nunca lanza. */
/**
 * ¿Este mensaje de `tel9` es RESPUESTA a ESTE seguimiento, y mueve su escalera? Puro.
 * Solo si ya le habíamos escrito a ESE teléfono en este seguimiento, y solo el PRIMER mensaje
 * tras el último toque a él la mueve; los demás de la ráfaga se apuntan y nada más.
 * 16/11/2026: Vicente mandó seis mensajes sobre OTRA obra (sin que le hubiéramos escrito nada
 * del seguimiento) y cuatro propuestas suyas saltaron dos pasos, a «¿sigues o la aparcamos?».
 * Las filas de antes del cambio no tienen `detalle.escritos`: se mira el toque en `acciones`.
 */
function comoRespuesta(fila, tel9) {
    const escritos = fila?.detalle?.escritos || {};
    let ultimo = escritos[tel9] ? Date.parse(escritos[tel9]) || 0 : 0;
    if (!ultimo) {
        for (const a of Array.isArray(fila?.acciones) ? fila.acciones : []) {
            if (a?.accion === 'toque' && a.tel9 === tel9) ultimo = Math.max(ultimo, Date.parse(a.at) || 0);
        }
    }
    if (!ultimo) return { cuenta: false, avanza: false };
    const contestado = fila.contestado_at ? Date.parse(fila.contestado_at) || 0 : 0;
    return { cuenta: true, avanza: !contestado || contestado < ultimo };
}

async function alMensajeEntrante(msg) {
    try {
        if (!activo() || !msg || msg.fromMe || msg.isStatus) return;
        const chatId = String(msg.from || '');
        if (!chatId.endsWith('@c.us') && !chatId.endsWith('@lid')) return;
        const tels = await telsAbiertos();
        if (!tels.size) return;
        const esperas = require('./esperasWhatsapp');
        const tel9 = await esperas.telDeChat(chatId, [...tels]);
        if (!tel9) return;
        if (msg.type === 'chat' && esperas.pareceAutomatica(msg.body)) return;      // su WhatsApp Business, no él
        // De ESE teléfono, o de quien es «el otro lado» de un CEE (el R3 se le mandó a él).
        const { data: filas } = await supabase.from('wa_seguimientos').select('*').neq('estado', 'CERRADO')
            .or(`tel9.eq.${tel9},detalle->otro->>tel9.eq.${tel9}`).limit(30);
        const ahora = new Date();
        const que = esperas.describirMensaje(msg);
        const tocadas = [];
        for (const f of filas || []) {
            const r = comoRespuesta(f, tel9);
            if (!r.cuenta) continue;              // aún no le hemos escrito nada en ESTE seguimiento
            tocadas.push(f.numero);
            if (!r.avanza) {
                // Otro mensaje de la misma ráfaga (o tras una respuesta ya apuntada): se apunta, no mueve nada.
                await supabase.from('wa_seguimientos').update({
                    contestado_at: ahora.toISOString(), respuesta: recorta(que, 200), updated_at: ahora.toISOString(),
                }).eq('id', f.id);
                continue;
            }
            // CEE: un «vale, mañana te lo mando» no es lo pedido; se le da un respiro y sigue.
            if (f.tipo === 'CEE_INICIAL' && esperas.esAcuse(msg)) {
                const respiro = Pasos.habilesDespues(ahora, 2);
                await supabase.from('wa_seguimientos').update({
                    respuesta: recorta(que, 200), proximo_at: (Date.parse(f.proximo_at || 0) > respiro.getTime() ? new Date(f.proximo_at) : respiro).toISOString(),
                    updated_at: ahora.toISOString(), acciones: accion(f, { accion: 'acuse', texto: recorta(msg.body, 60) }),
                }).eq('id', f.id);
                continue;
            }
            const sig = Pasos.trasRespuestaSinResultado(f.tipo, f.fase, { ahora });
            await supabase.from('wa_seguimientos').update({
                estado: 'CONTESTADO', contestado_at: ahora.toISOString(), respuesta: recorta(que, 200),
                fase: sig.fase, proximo_at: sig.proximo.toISOString(), updated_at: ahora.toISOString(),
                acciones: accion(f, { accion: 'contestado', texto: recorta(msg.body, 120) }),
            }).eq('id', f.id);
        }
        if (tocadas.length) log(`ha contestado ${tel9}: ${tocadas.join(', ')}`);
    } catch (e) {
        log('mensaje entrante:', e.message);
    }
}

/**
 * Lo que el contestador necesita saber para entender la respuesta: lo que le hemos
 * preguntado a este teléfono y aún no está cerrado. Nunca lanza.
 */
async function paraContestador(tel9) {
    try {
        if (!activo() || !tel9) return [];
        const { data } = await supabase.from('wa_seguimientos')
            .select('tipo, numero, cliente, municipio, fase, toques, ultimo_toque_at, destino, resultado, detalle')
            .neq('estado', 'CERRADO').or(`tel9.eq.${tel9},detalle->otro->>tel9.eq.${tel9}`).limit(20);
        return (data || []).filter(f => f.toques > 0 || f.resultado === 'SIGUE').map(f => ({
            tipo: f.tipo, numero: f.numero, cliente: f.cliente, municipio: f.municipio, fase: f.fase, toques: f.toques,
            ultimo_toque_at: f.ultimo_toque_at, faltan: f.tipo === 'CEE_INICIAL' ? (f.detalle?.faltan || []) : undefined,
        }));
    } catch { return []; }
}

const DICE = {
    SIGUE: 'quiere seguir adelante', NO_SIGUE: 'no sigue', PENSANDO: 'lo está pensando', MAS_ADELANTE: 'más adelante',
};

/**
 * Lo que el CONTESTADOR ha sacado de la respuesta a un seguimiento de propuesta, aplicado.
 * En modo copia se apunta lo que se haría, sin tocar la oportunidad. Nunca lanza.
 * @param {string} tel9
 * @param {Array<{numero, resultado, cuando?, nota?}>} resultados
 * @returns {Promise<string[]>} líneas para el mensaje a Fran
 */
async function alContestar(tel9, resultados, { ahora = new Date() } = {}) {
    const lineas = [];
    try {
        if (!activo() || !tel9 || !Array.isArray(resultados) || !resultados.length) return lineas;
        const { data: filas } = await supabase.from('wa_seguimientos').select('*').neq('estado', 'CERRADO').eq('tel9', tel9).eq('tipo', 'PROPUESTA').limit(20);
        const m = modoPara(tel9);
        for (const r of resultados) {
            if (!Pasos.RESULTADOS.has(String(r?.resultado || '').toUpperCase())) continue;
            const f = (filas || []).find(x => x.numero === r.numero) || ((filas || []).length === 1 && !r.numero ? filas[0] : null);
            if (!f) continue;
            const t = Pasos.trasRespuestaPropuesta(r, { ahora });
            const nota = recorta(r.nota || '', 300);
            await supabase.from('wa_seguimientos').update({
                estado: t.estado, fase: t.fase, proximo_at: t.proximo ? t.proximo.toISOString() : null, resultado: t.resultado,
                ...(t.toques === 0 ? { toques: 0 } : {}), ...(t.estado === 'CERRADO' ? { cerrado_at: ahora.toISOString() } : {}),
                respuesta: nota || f.respuesta, updated_at: ahora.toISOString(),
                acciones: accion(f, { accion: 'resultado', resultado: t.resultado, cuando: r.cuando || null, modo: m }),
            }).eq('id', f.id);
            let hecho = '';
            if (t.oportunidad) {
                if (m === 'real') {
                    try {
                        await cambiarOportunidad(f.numero, t.oportunidad, `Seguimiento de WhatsApp: ${DICE[t.resultado]}${nota ? ` — ${nota}` : ''}.`);
                        hecho = ` → la he pasado a ${t.oportunidad}`;
                    } catch (e) { hecho = ` → NO he podido pasarla a ${t.oportunidad} (${recorta(e.message, 80)})`; }
                } else hecho = ` → la pasaría a ${t.oportunidad} (modo copia)`;
            }
            const cuando = t.resultado === 'MAS_ADELANTE' && t.proximo ? `, se retoma el ${Textos.fechaCorta(t.proximo.toISOString())}` : '';
            lineas.push(`- ${f.numero} (${recorta(Textos.deQuien(f), 50)}): ${DICE[t.resultado]}${cuando}${hecho}${nota ? ` · ${nota}` : ''}`);
        }
        abiertos.at = 0;
    } catch (e) {
        log('al contestar:', e.message);
    }
    return lineas;
}

// ─── El resumen de las 9:00 ──────────────────────────────────────────────────
/** Lo de las últimas 24 h, para el repaso de la mañana. Vacío si no hay nada. Nunca lanza. */
async function resumen({ desde = new Date(Date.now() - 24 * 3_600_000) } = {}) {
    try {
        if (!activo()) return '';
        const d = desde.toISOString();
        const [{ data: movidas }, { data: atascadas }] = await Promise.all([
            supabase.from('wa_seguimientos').select('tipo, numero, cliente, municipio, destino, nombre, estado, resultado, acciones, detalle, toques').gte('updated_at', d).limit(400),
            supabase.from('wa_seguimientos').select('numero, cliente, municipio, nombre, destino, toques, fase').eq('tipo', 'CEE_INICIAL').neq('estado', 'CERRADO').in('fase', ['FRAN', 'AGOTADO']).limit(30),
        ]);
        const toques = { real: [], copia: [] };
        const resultados = [];
        const cerradas = [];
        const agente = [];
        for (const f of movidas || []) {
            for (const a of f.acciones || []) {
                if (a.at < d) continue;
                if (a.accion === 'toque') toques[a.modo === 'real' ? 'real' : 'copia'].push({ ...f, fase: a.fase, texto: a.texto });
                if (a.accion === 'resultado') resultados.push(`• ${f.numero} · ${Textos.deQuien(f)}: ${DICE[a.resultado] || a.resultado}${a.modo === 'real' ? '' : ' (copia)'}`);
                if (a.accion === 'agente') agente.push(`• ${f.numero}${a.modo === 'real' ? '' : ' (copia)'}`);
            }
            if (f.estado === 'CERRADO' && f.resultado === 'SIN_RESPUESTA' && (f.acciones || []).some(a => a.accion === 'toque' && a.at >= d)) cerradas.push(`• ${f.numero} · ${Textos.deQuien(f)}`);
        }
        const lin = [];
        const porTipo = (lista) => {
            const p = lista.filter(x => x.tipo === 'PROPUESTA').length;
            const c = lista.filter(x => x.tipo === 'CEE_INICIAL').length;
            return [p ? `${p} de propuestas` : null, c ? `${c} del CEE inicial` : null].filter(Boolean).join(' y ');
        };
        if (toques.real.length) lin.push(`*Seguimiento: he escrito ${toques.real.length} (${porTipo(toques.real)})*`);
        if (toques.copia.length) {
            lin.push(`*Seguimiento: habría escrito ${toques.copia.length} (${porTipo(toques.copia)}; modo copia, no ha salido nada)*`);
            const ej = toques.copia[0];
            lin.push(`Ejemplo (${ej.numero}, ${String(ej.fase || '').toLowerCase()}):\n${String(ej.texto || '').split('\n').filter(Boolean).slice(0, 12).map(l => `> ${l}`).join('\n')}`);
        }
        if (resultados.length) lin.push(`*Han contestado al seguimiento*\n${resultados.slice(0, 10).join('\n')}`);
        if (cerradas.length) lin.push(`*Aparcadas sin respuesta (${cerradas.length})*\n${cerradas.slice(0, 8).join('\n')}${cerradas.length > 8 ? `\n…y ${cerradas.length - 8} más` : ''}`);
        if (agente.length) lin.push(`*CEE inicial con el material completo: se lo he pasado a Claude*\n${agente.join('\n')}`);
        if ((atascadas || []).length) lin.push(`*CEE inicial atascado (no manda lo que falta tras ${Math.min(...atascadas.map(a => a.toques))}+ recordatorios): mejor una llamada*\n${atascadas.slice(0, 8).map(a => `• ${a.numero} · ${Textos.deQuien(a)}`).join('\n')}`);
        return lin.join('\n');
    } catch (e) {
        log('resumen:', e.message);
        return '';
    }
}

/** Lo vivo, para la pantalla o un script. */
async function listar({ estado = null, tipo = null, limite = 300 } = {}) {
    let q = supabase.from('wa_seguimientos')
        .select('id, tipo, numero, cliente, municipio, destino, nombre, tel9, estado, fase, toques, base_at, ultimo_toque_at, proximo_at, contestado_at, respuesta, resultado, cerrado_at')
        .order('proximo_at', { ascending: true, nullsFirst: false }).limit(limite);
    q = estado ? q.eq('estado', estado) : q.neq('estado', 'CERRADO');
    if (tipo) q = q.eq('tipo', tipo);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
}

/** La cierra una persona (ya está hablado). */
async function cerrar(id, quien = 'ADMIN') {
    const { data, error } = await supabase.from('wa_seguimientos').update({
        estado: 'CERRADO', resultado: 'A_MANO', cerrado_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id).neq('estado', 'CERRADO').select('id');
    if (error) throw new Error(error.message);
    abiertos.at = 0;
    return (data || []).length > 0;
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[seguimiento] APAGADO (SEGUIMIENTO_ENABLED != true): nadie pregunta por las propuestas ni por el material del CEE inicial.');
        return;
    }
    try { require('./whatsappService').onMessage(alMensajeEntrante); } catch (e) { log('sin sesión de WhatsApp:', e.message); }
    setTimeout(() => vuelta(), 3 * 60 * 1000);
    handle = setInterval(() => vuelta(), 5 * 60 * 1000);
    console.log(`[seguimiento] activo en modo ${modo().toUpperCase()}${prueba().size ? ` (real solo para ${prueba().size} teléfono(s) de prueba)` : ''}: propuestas y CEE inicial, de lunes a viernes a partir de las ${Pasos.HORA_TOQUE()}:00.`);
}

module.exports = {
    start, sembrar, vuelta, alMensajeEntrante, alContestar, paraContestador, resumen, listar, cerrar,
    activo, modo, modoPara, CFG,
    // para las pruebas
    ultimoEnvio, destinoDeFila, enlaceAceptar, nombreProvisional, comoRespuesta,
};
