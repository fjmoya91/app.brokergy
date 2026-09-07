// ============================================================================
// cobroService.js — CONFIRMACIÓN DE COBRO del cliente.
// ----------------------------------------------------------------------------
// Cuando el CAE está concedido y vamos a ingresarle el bono, al cliente se le
// manda UN enlace que hace dos cosas: confirmar sus datos de cobro (el IBAN, que
// es donde de verdad se cuelan los errores de transferencia) y contestar tres
// preguntas de venta cruzada (tarifa eléctrica · fotovoltaica · deducción IRPF).
//
// Sustituye al formulario externo de Tally. Traerlo dentro no es solo dejar de
// pagar una herramienta: aquí los datos ya están, así que el formulario llega
// RELLENO y lo único que se le pide es confirmar; y su respuesta cae en el
// expediente, no en una hoja de cálculo aparte.
//
// Qué vive dónde:
//   · QUÉ se pregunta y con qué palabras → frontend/features/cobro/logic/cobroForm.js
//     (fuente única, la comparten esta capa y la vista pública).
//   · A QUIÉN y CUÁNDO se le manda → aquí + el radar del parte diario.
//   · Los datos del cliente → tabla `clientes`, la misma que rellena la firma de
//     la propuesta. No hay tabla de datos bancarios paralela.
//
// El sello vive en `expedientes.documentacion.cobro` y se escribe SIEMPRE con la
// RPC de MERGE: el envío, las respuestas y el justificante se sellan en momentos
// distintos y un reemplazo se llevaría por delante lo anterior.
// ============================================================================

const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');

// ─── Import ESM diferido de la fuente única de los bloques ───────────────────
let _formPromise = null;
function loadCobroForm() {
    if (!_formPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/cobro/logic/cobroForm.js')).href;
        _formPromise = import(url);
    }
    return _formPromise;
}

const SELECT_EXP = `id, numero_expediente, cliente_id, oportunidad_id, documentacion, instalacion,
    clientes!cliente_id(id_cliente, nombre_razon_social, apellidos, dni, email, tlf,
        persona_contacto_nombre, persona_contacto_email, persona_contacto_tlf,
        notificaciones_contacto_activas, numero_cuenta),
    oportunidades!oportunidad_id(datos_calculo)`;

/** Carga el expediente con lo justo para este formulario (nunca `cee`: regla 22). */
async function cargarExpediente(expId) {
    const { data, error } = await supabase
        .from('expedientes').select(SELECT_EXP).eq('id', expId).maybeSingle();
    if (error) console.warn('[cobro] cargarExpediente:', error.message);
    return data || null;
}

/**
 * Token del enlace. Se persiste (no es HMAC con caducidad como `accionToken`)
 * porque entre que se le manda y cobra pueden pasar semanas y el enlace tiene que
 * seguir abriendo: caducarlo a los 14 días obligaría a reenviarlo justo cuando el
 * cliente por fin lo mira. Se puede invalidar reescribiéndolo.
 */
async function ensureToken(exp) {
    const actual = exp?.documentacion?.cobro?.token;
    if (actual && /^[0-9a-f]{32}$/i.test(actual)) return actual;
    const token = crypto.randomBytes(16).toString('hex');
    await sellar(exp.id, { token });
    return token;
}

/**
 * REGLA — la comparación del token es de tiempo CONSTANTE. Un `===` sobre un
 * secreto de 32 hex filtra por dónde deja de coincidir; aquí detrás está el IBAN
 * de un cliente, así que no se compara con el operador de siempre.
 */
function tokenValido(guardado, recibido) {
    const a = Buffer.from(String(guardado || ''), 'utf8');
    const b = Buffer.from(String(recibido || ''), 'utf8');
    if (!a.length || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/** Escribe en `documentacion.cobro` fundiendo, nunca reemplazando. */
async function sellar(expId, patch) {
    const { error } = await supabase.rpc('merge_expediente_doc_json', {
        p_expediente_id: expId,
        p_field: 'cobro',
        p_value: patch,
    });
    if (error) throw new Error(`No se pudo sellar el cobro: ${error.message}`);
}

/**
 * El contexto que decide qué se le enseña a ESTE cliente.
 *
 * REGLA — el bloque de la forma de pago solo sale si el cliente ASUME el coste de
 * gestión. Con "Descuento Certificados" activo, Brokergy ya lo absorbió y su
 * Convenio de Cesión firmado no menciona ninguna deducción: preguntarle aquí cómo
 * prefiere pagar 298 € le cobraría algo que su contrato no dice. Ver la regla del
 * convenio en CLAUDE.md ("con Descuento Certificados activo, el convenio NO dice
 * NADA del coste de gestión").
 */
function contextoDe(exp) {
    const datos = exp?.oportunidades?.datos_calculo || {};
    const inputs = datos.inputs || {};
    const result = datos.result || {};
    const brokergyAsume = inputs.discountCertificates === true;
    // Lo que de verdad se le va a descontar, tal y como lo calculó la simulación
    // que el cliente aceptó. Solo si no cuadra nada se cae al valor por defecto.
    const coste = Number(result.caeMaintenanceCost) > 0
        ? Number(result.caeMaintenanceCost)
        : Number(inputs.certificatesCost) || 0;
    return {
        clienteAsumeCoste: !brokergyAsume,
        costeGestion: coste,
        solarPrevio: exp?.instalacion?.fotovoltaica?.estado || null,
        respuestas: exp?.documentacion?.cobro?.respuestas || {},
    };
}

/** Los datos del cliente con los que llega relleno el último paso. */
function datosCliente(exp) {
    const c = exp?.clientes || {};
    const notif = c.notificaciones_contacto_activas === true || c.notificaciones_contacto_activas === 'true';
    return {
        nombre_razon_social: c.nombre_razon_social || '',
        apellidos: c.apellidos || '',
        dni: c.dni || '',
        email: (notif ? c.persona_contacto_email : c.email) || c.email || c.persona_contacto_email || '',
        telefono: (notif ? c.persona_contacto_tlf : c.tlf) || c.tlf || c.persona_contacto_tlf || '',
        // El IBAN que consta HOY. Es el que va impreso en el Convenio de Cesión ya
        // firmado, así que si el cliente escribe otro no se pisa en silencio: se
        // marca `iban_cambiado` y se exige justificante (ver la ruta pública).
        iban: c.numero_cuenta || '',
    };
}

/** Nombre de pila para saludar, sin la razón social entera ni las mayúsculas de la ficha. */
function primerNombre(exp) {
    const c = exp?.clientes || {};
    const notif = c.notificaciones_contacto_activas === true;
    const bruto = (notif && c.persona_contacto_nombre) ? c.persona_contacto_nombre : c.nombre_razon_social;
    const uno = String(bruto || '').trim().split(/\s+/)[0] || '';
    if (!uno) return null;
    return uno.charAt(0).toUpperCase() + uno.slice(1).toLowerCase();
}

/** A quién se le escribe (mismo criterio que `resolveSolicitudContacto` para CLIENTE). */
function contactoCliente(exp) {
    const c = exp?.clientes || {};
    const notif = c.notificaciones_contacto_activas === true || c.notificaciones_contacto_activas === 'true';
    const nombreCli = `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim();
    return {
        nombre: (notif ? (c.persona_contacto_nombre || nombreCli) : nombreCli) || null,
        tlf: (notif ? (c.persona_contacto_tlf || c.tlf) : (c.tlf || c.persona_contacto_tlf)) || null,
        email: (notif ? (c.persona_contacto_email || c.email) : (c.email || c.persona_contacto_email)) || null,
    };
}

/** El enlace que se le manda. */
function enlaceCobro(expId, token) {
    const base = process.env.APP_URL || process.env.FRONTEND_URL || 'https://app.brokergy.es';
    return `${base.replace(/\/$/, '')}/cobro/${expId}?token=${token}`;
}

/**
 * La vista completa del formulario: bloques (con lo ya contestado y lo heredado
 * de la captación) + los datos del cliente.
 */
async function buildVista(exp) {
    const { bloquesPara } = await loadCobroForm();
    const ctx = contextoDe(exp);
    const cobro = exp?.documentacion?.cobro || {};
    return {
        numero_expediente: exp.numero_expediente,
        saludo: primerNombre(exp),
        bloques: bloquesPara(ctx),
        cliente: datosCliente(exp),
        justificante_subido: !!(cobro.justificante_link || exp?.documentacion?.justificante_titularidad_link),
        completado_at: cobro.completado_at || null,
    };
}

/**
 * El mensaje que se le manda. Dice lo que va a pasar —que le vamos a ingresar—
 * antes de pedirle nada: es la razón por la que va a abrir el enlace.
 *
 * REGLA — no se promete una fecha de ingreso. Depende del pago del Sujeto
 * Obligado y de que la documentación esté cerrada; una fecha inventada aquí es
 * una reclamación garantizada dentro de dos semanas.
 */
function mensajeCobro(exp, link) {
    const nombre = primerNombre(exp);
    const n = exp?.numero_expediente ? ` (${exp.numero_expediente})` : '';
    return [
        nombre ? `Hola ${nombre},` : 'Hola,',
        '',
        `¡Buenas noticias! Ya tenemos concedida la ayuda de tu instalación${n} y estamos preparando el ingreso.`,
        '',
        'Antes de hacer la transferencia necesitamos que *confirmes tus datos de cobro* — sobre todo el número de cuenta, para que el dinero no acabe donde no debe. Te llevará menos de un minuto y los verás ya rellenos:',
        '',
        link,
        '',
        'De paso te hacemos un par de preguntas rápidas para ver si podemos ahorrarte algo más (la tarifa de la luz suele quedarse desajustada después de poner aerotermia). Son opcionales.',
        '',
        'Cualquier duda, contesta a este mensaje.',
    ].join('\n');
}

/** Resumen legible de lo que ha contestado, para el aviso al staff y la ficha. */
async function resumenRespuestas(exp) {
    const { etiquetaRespuesta, leadsDe } = await loadCobroForm();
    const cobro = exp?.documentacion?.cobro || {};
    const r = cobro.respuestas || {};
    const ctx = contextoDe(exp);
    const lineas = Object.keys(r)
        .map(k => etiquetaRespuesta(k, r[k], ctx.costeGestion))
        .filter(Boolean);
    return { lineas, leads: leadsDe(r) };
}

module.exports = {
    cargarExpediente,
    ensureToken,
    tokenValido,
    sellar,
    contextoDe,
    datosCliente,
    contactoCliente,
    primerNombre,
    enlaceCobro,
    buildVista,
    mensajeCobro,
    resumenRespuestas,
    loadCobroForm,
    SELECT_EXP,
};
