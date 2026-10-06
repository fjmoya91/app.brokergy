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
const { CEE_ECO_SELECT, rebuildCee } = require('../utils/ceeEcoFields');

// ─── Import ESM diferido de la fuente única de los bloques ───────────────────
// La economía del expediente: la MISMA función que el panel económico y el
// resumen del lote (pura, sin navegador). Así el importe que se le anuncia al
// cliente es el mismo que ve el ADMIN al preparar la transferencia.
let _finPromise = null;
function loadFinancials() {
    if (!_finPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/expedienteFinancials.js')).href;
        _finPromise = import(url);
    }
    return _finPromise;
}

let _formPromise = null;
function loadCobroForm() {
    if (!_formPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/cobro/logic/cobroForm.js')).href;
        _formPromise = import(url);
    }
    return _formPromise;
}

// `cee`: solo los campos del cálculo económico (nunca el XML crudo, regla 22).
const SELECT_EXP = `id, numero_expediente, cliente_id, oportunidad_id, lote_id, documentacion, instalacion,
    ${CEE_ECO_SELECT},
    clientes!cliente_id(id_cliente, nombre_razon_social, apellidos, dni, email, tlf,
        persona_contacto_nombre, persona_contacto_email, persona_contacto_tlf,
        notificaciones_contacto_activas, contacto_es_partner, numero_cuenta, es_empresa, copropietarios),
    oportunidades!oportunidad_id(ficha, datos_calculo)`;

/** Carga el expediente con lo justo para este formulario. */
async function cargarExpediente(expId) {
    const { data, error } = await supabase
        .from('expedientes').select(SELECT_EXP).eq('id', expId).maybeSingle();
    if (error) console.warn('[cobro] cargarExpediente:', error.message);
    return data ? rebuildCee(data) : null;
}

/**
 * La ayuda que se le va a INGRESAR: el bono sobre el ahorro VERIFICADO.
 *
 * REGLA — solo el verificado. Es el que se transfiere (y el lote no puede pasar a
 * pagar al cliente sin él: 409 en `PATCH /lotes/:id/estado`). Con el estimado se
 * le anunciaría una cifra que luego no cuadra con la transferencia, así que sin
 * verificado devuelve null y el mensaje no dice importe.
 */
async function bonoVerificado(exp) {
    try {
        const { computeExpedienteFinancials } = await loadFinancials();
        const f = computeExpedienteFinancials(exp);
        return Number(f?.caeVerificado) > 0 ? Math.round(f.caeVerificado * 100) / 100 : null;
    } catch (e) {
        console.warn('[cobro] bono verificado:', exp?.numero_expediente, e.message);
        return null;
    }
}

/**
 * Cuántos requerimientos ha habido que contestar para sacar adelante el
 * expediente. Es lo que cuenta el mensaje ("hemos tenido que contestar N"), así
 * que se cuenta lo que CONSTA, nunca se supone:
 *   · del LOTE, los informes de inexactitudes del verificador y los
 *     requerimientos de la Gestora (cada uno es una ronda que hubo que contestar);
 *     si no se subieron como documento, las veces que el lote pasó por un estado
 *     de REQUERIMIENTO;
 *   · del EXPEDIENTE, un requerimiento que obligó a volver a firmar los anexos.
 */
async function requerimientosDe(exp) {
    let n = 0;
    if (exp?.lote_id) {
        const { data: lote } = await supabase
            .from('lotes').select('documentos_so, historial').eq('id', exp.lote_id).maybeSingle();
        const docs = Array.isArray(lote?.documentos_so) ? lote.documentos_so : [];
        const deTipo = (t) => docs.filter(d => d && (d.tipo === t || String(d.key || '').startsWith(t))).length;
        const enDocs = deTipo('informe_inexactitudes') + deTipo('requerimiento_ga');
        const enEstados = (Array.isArray(lote?.historial) ? lote.historial : [])
            .filter(h => h?.tipo === 'cambio_estado' && /REQUERIMIENTO/i.test(String(h.estado || ''))).length;
        n = Math.max(enDocs, enEstados);
    }
    if (n === 0 && exp?.documentacion?.requerimiento_firma) n = 1;
    return n;
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
async function contextoDe(exp) {
    // Fuente única de la decisión (pura, probada en test_cobro_form.js): lee lo
    // corregido en el Económico del expediente antes que la simulación. Se le
    // añade el bono verificado, que personaliza la pregunta de la forma de pago.
    const { contextoCobro } = await loadCobroForm();
    return { ...contextoCobro(exp), bono: await bonoVerificado(exp) };
}

/** ¿Hay ya un justificante de titularidad en el expediente? */
function tieneJustificante(exp) {
    return !!(exp?.documentacion?.cobro?.justificante_link || exp?.documentacion?.justificante_titularidad_link);
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
    const bruto = esTercero(c) ? c.persona_contacto_nombre : c.nombre_razon_social;
    // El nombre ENTERO: en su campo ya va solo el nombre, y los compuestos ("José
    // Luis") son mayoría — cortarlo por el primer espacio es llamarle "Jose".
    const n = require('./recordatorios').capitalizar(String(bruto || '').trim());
    return n || null;
}

/** ¿Lo lee su persona de contacto (o el partner) y no el titular? */
function esTercero(c = {}) {
    const notif = c.notificaciones_contacto_activas === true || c.notificaciones_contacto_activas === 'true';
    return !!(notif && c.persona_contacto_nombre && (c.persona_contacto_tlf || c.persona_contacto_email));
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
    const ctx = await contextoDe(exp);
    const cobro = exp?.documentacion?.cobro || {};
    const cliente = datosCliente(exp);
    const justificante = tieneJustificante(exp);
    return {
        numero_expediente: exp.numero_expediente,
        saludo: primerNombre(exp),
        bloques: bloquesPara(ctx),
        cliente,
        justificante_subido: justificante,
        // REGLA — sin cuenta en la ficha y sin justificante en el expediente, la
        // cuenta que escriba hay que acreditarla: es exactamente el caso del
        // convenio firmado sin IBAN ("la titularidad se acredita con justificante").
        requiere_justificante_sin_iban: !cliente.iban && !justificante,
        completado_at: cobro.completado_at || null,
        // La portada cuenta lo mismo que el mensaje: el esfuerzo y lo que va a cobrar.
        importe: await importeVista(ctx),
        esfuerzo: (await loadCobroForm()).textoEsfuerzo(await requerimientosDe(exp)),
    };
}

/** Lo que se le enseña del dinero: la ayuda y lo que le llega en cada forma de pago. */
async function importeVista(ctx) {
    if (!(Number(ctx.bono) > 0)) return null;
    const { bloquePago } = await loadCobroForm();
    const pago = ctx.clienteAsumeCoste ? bloquePago(ctx.costeGestion, ctx.bono) : null;
    return {
        bono: ctx.bono,
        honorarios_sin_iva: pago ? pago.importe_sin_iva : null,
        honorarios_total: pago ? pago.importe_total : null,
        recibe_descuento: pago ? pago.recibe_descuento : ctx.bono,
        recibe_factura: pago ? pago.recibe_factura : ctx.bono,
    };
}

/**
 * El mensaje que se le manda: la noticia, el motivo de pedirle la cuenta (la
 * seguridad), la cuenta que tenemos ENMASCARADA para que la reconozca, y el enlace.
 * El texto vive en `cobroForm.componerMensajeCobro` (puro y probado); aquí solo se
 * reúnen sus datos.
 */
async function mensajeCobro(exp, link) {
    const { componerMensajeCobro, mascaraIban, bloquePago } = await loadCobroForm();
    const c = exp?.clientes || {};
    const ctx = await contextoDe(exp);
    const tercero = esTercero(c);
    const titular = require('./recordatorios').capitalizar(`${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim()) || null;
    return componerMensajeCobro({
        nombre: primerNombre(exp),
        numExp: exp?.numero_expediente || null,
        link,
        ibanMascara: mascaraIban(c.numero_cuenta),
        tercero,
        titular,
        partner: !!c.contacto_es_partner,
        pago: ctx.clienteAsumeCoste ? bloquePago(ctx.costeGestion, ctx.bono) : null,
        bono: ctx.bono,
        requerimientos: await requerimientosDe(exp),
    });
}

/** Asunto del email del mensaje de cobro. */
function asuntoCobro(exp) {
    return `Enhorabuena: vamos a ingresarte tu ayuda — confirma tu cuenta${exp?.numero_expediente ? ` (${exp.numero_expediente})` : ''}`;
}

/** Resumen legible de lo que ha contestado, para el aviso al staff y la ficha. */
async function resumenRespuestas(exp) {
    const { etiquetaRespuesta, leadsDe, tareaFormaPago } = await loadCobroForm();
    const cobro = exp?.documentacion?.cobro || {};
    const r = cobro.respuestas || {};
    const ctx = await contextoDe(exp);
    const lineas = Object.keys(r)
        .map(k => etiquetaRespuesta(k, r[k], ctx.costeGestion))
        .filter(Boolean);
    return {
        lineas,
        leads: leadsDe(r),
        // Lo que hay que HACER con la forma de pago al preparar la transferencia.
        forma_pago: ctx.clienteAsumeCoste ? tareaFormaPago(r.forma_pago, ctx.costeGestion) : null,
    };
}

/**
 * La FILA de un expediente en la fase "Pago a los clientes" del lote: a quién se
 * le escribe, qué cuenta consta, en qué punto está y —si se pide— el borrador del
 * mensaje con su enlace.
 *
 * REGLA — el IBAN entero solo viaja con `ibanCompleto` (ADMIN): es quien hace la
 * transferencia. Al resto del equipo le basta reconocerlo, enmascarado.
 *
 * `conBorrador` crea el token si no existía (escribe en el expediente): solo se
 * pide cuando el lote ya está en fase de pago, que es cuando ese enlace va a salir.
 */
// VARIOS CEDENTES (logic/cedentes.js): con cuentas propias el bono se reparte.
let _cedentesMod = null;
async function loadCedentes() {
    if (!_cedentesMod) {
        const { pathToFileURL } = require('url');
        const path = require('path');
        _cedentesMod = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/cedentes.js')).href);
    }
    return _cedentesMod;
}

async function filaCobro(exp, { conBorrador = false, ibanCompleto = false } = {}) {
    const { mascaraIban, ibanEnBloques, bloquePago } = await loadCobroForm();
    const c = exp?.clientes || {};
    const cobro = exp?.documentacion?.cobro || {};
    const ctx = await contextoDe(exp);
    const { lineas, leads, forma_pago } = await resumenRespuestas(exp);
    const pago = ctx.clienteAsumeCoste ? bloquePago(ctx.costeGestion, ctx.bono) : null;
    const fila = {
        id: exp.id,
        numero_expediente: exp.numero_expediente,
        cliente: `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() || null,
        contacto: contactoCliente(exp),
        tercero: esTercero(c),
        iban_mascara: mascaraIban(c.numero_cuenta),
        iban: ibanCompleto && c.numero_cuenta ? ibanEnBloques(c.numero_cuenta) : null,
        justificante: tieneJustificante(exp),
        justificante_link: ibanCompleto
            ? (cobro.justificante_link || exp?.documentacion?.justificante_titularidad_link || null) : null,
        coste: pago ? { sin_iva: pago.importe_sin_iva, iva: pago.importe_iva, total: pago.importe_total } : null,
        cobro: {
            enviado_at: cobro.enviado_at || null,
            enviado_por: cobro.enviado_por || null,
            canales: cobro.canales || [],
            veces: Number(cobro.veces || 0),
            completado_at: cobro.completado_at || null,
            origen: cobro.origen || null,
            iban_cambiado: !!cobro.iban_cambiado,
            iban_anterior_mascara: mascaraIban(cobro.iban_anterior),
            forma_pago: cobro.respuestas?.forma_pago || null,
        },
        forma_pago,
        resumen: lineas,
        leads,
        // Sin ahorro verificado el mensaje sale SIN importe: se dice en el panel
        // para que no se mande creyendo que lo lleva.
        con_importe: Number(ctx.bono) > 0,
    };
    // VARIOS CEDENTES con cuenta propia: a qué cuentas va el ingreso y en qué
    // proporción. Con una sola cuenta (lo normal, también con varios cedentes que
    // cobran en la designada) no se añade nada y la fila es la de siempre.
    try {
        const { repartoPago, cedentesDe } = await loadCedentes();
        const ced = cedentesDe(c);
        if (ced.length > 1) fila.cedentes = ced.map(x => ({ nombre: x.nombre, cuota_pct: x.cuota_pct }));
        const rp = repartoPago(c);
        if (rp.length > 1) {
            fila.reparto = rp.map(g => ({
                cedentes: g.cedentes,
                cuota_pct: g.cuota_pct,
                iban_mascara: mascaraIban(g.iban),
                iban: ibanCompleto && g.iban ? ibanEnBloques(g.iban) : null,
            }));
        }
    } catch (e) { console.warn('[cobro] reparto:', e.message); }
    if (conBorrador) {
        const link = enlaceCobro(exp.id, await ensureToken(exp));
        fila.link = link;
        fila.mensaje = await mensajeCobro(exp, link);
        fila.asunto = asuntoCobro(exp);
    }
    return fila;
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
    asuntoCobro,
    resumenRespuestas,
    filaCobro,
    tieneJustificante,
    bonoVerificado,
    requerimientosDe,
    loadCobroForm,
    SELECT_EXP,
};
