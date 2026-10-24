// ============================================================================
// pagoClientesService.js — el PAGO a los clientes del lote, después de que
// confirmen su cuenta (cobroService): remesa SEPA → justificante → aviso → reseña.
// ----------------------------------------------------------------------------
//   1. REMESA. Con los clientes que ya han confirmado, un fichero SEPA
//      (pain.001.001.03) con una transferencia por cuenta, que se sube a BBVA net
//      cash. Lo genera `utils/sepaTransferencia.js`; aquí se decide QUÉ entra y por
//      CUÁNTO.
//   2. JUSTIFICANTE. Hecha la transferencia en el banco, se sube su justificante
//      a la carpeta de documentación del lote y queda marcada en cada expediente.
//   3. AVISO. A cada cliente, que ya se le ha transferido (importe, cuenta
//      enmascarada y concepto). Sale desde el popup, con visto bueno. Desde el
//      22/10/2026 lleva la CARTA DE PAGO en PDF (cartaPagoService), que se genera
//      sola al subir el justificante; con ella el texto es el de la carta.
//   4. RESEÑA. En el mismo popup se PROGRAMA el mensaje que pide la reseña en
//      Google, para cuando la transferencia ya debería haber llegado. Lo despacha
//      el barrido de este fichero.
//
// Todo se sella en `expedientes.documentacion.cobro` con la RPC de MERGE
// (`cobroService.sellar`): `remesa`, `transferencia` y `resena` son objetos y se
// escriben ENTEROS (la RPC funde el primer nivel de `cobro`, no el segundo).
//
// REGLA — el importe es el del ahorro VERIFICADO, menos los honorarios si el
// cliente eligió descontarlos (sobre la base, sin IVA). Es la MISMA cuenta que
// pinta la fase 7 (`b.bono - descuento`). Sin verificado no hay pago.
//
// REGLA — un cliente que pidió FACTURA no entra en la remesa salvo que se diga que
// la factura ya está cobrada: el ingreso no sale hasta que esté abonada.
//
// REGLA — la remesa se hace con los que SE ELIJAN, y uno con el justificante subido
// (`cobro.transferencia`) ya no entra en ninguna otra: se pagaría dos veces. Los
// que van en una remesa SIN justificante sí siguen saliendo (generarla otra vez la
// sustituye: el banco pudo no ejecutarla).
//
// REGLA — la reseña nace APAGADA (`RESENA_PROGRAMADA_ENABLED`), como el envío
// programado de las propuestas: el backend del portátil y el del VPS barren la
// misma base, y desde LOCAL saldría con su WhatsApp a clientes reales.
// ============================================================================

const supabase = require('./supabaseClient');
const cobroService = require('./cobroService');
const { componerRemesa, repartirCentimos, fechaMadrid, siguienteDiaHabil, msgIdBrokergy } = require('../utils/sepaTransferencia');
const { ibanValido, normalizarIban } = require('../utils/justificanteBancario');

const ESTADOS_PAGO = ['PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'];

/** La cuenta de CARGO (la nuestra). Por variables de entorno, con la de las facturas por defecto. */
function ordenante() {
    return {
        // El nombre con el que BBVA aceptó la remesa del 02/10/2026 (sin «BROKERGY»).
        nombre: process.env.SEPA_ORDENANTE_NOMBRE || 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGETICA SL',
        iban: process.env.SEPA_ORDENANTE_IBAN || 'ES1001820394300201753286',
        bic: process.env.SEPA_ORDENANTE_BIC || 'BBVAESMMXXX',
        nif: process.env.SEPA_ORDENANTE_NIF || 'B19350222',
        // Sufijo del NIF del ordenante: '000', el del fichero que BBVA aceptó.
        sufijo: process.env.SEPA_ORDENANTE_SUFIJO || '000',
    };
}

/**
 * El enlace para escribir la reseña en Google (ficha de Google Business). Fuente
 * única en cartaPagoService: `GOOGLE_RESENA_URL` o, sin ella, el de la ficha de
 * BROKERGY que lleva la carta de pago (22/10/2026).
 */
const enlaceResena = () => require('./cartaPagoService').enlaceResena();

const resenaActiva = () => String(process.env.RESENA_PROGRAMADA_ENABLED || '').toLowerCase() === 'true';

/** Cuándo pedir la reseña: dos días hábiles después de transferir, a las 11:00 (Madrid). */
function cuandoResena(desde = new Date()) {
    const dia = siguienteDiaHabil(desde, Number(process.env.RESENA_DIAS_HABILES || 2));
    return horaMadridAIso(dia, '11:00');
}

/** «2026-10-15» + «11:00» en Madrid → ISO UTC (con el horario de verano que toque). */
function horaMadridAIso(dia, hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    // Se prueba +1 y +2 h y se queda el que, visto en Madrid, da la hora pedida.
    for (const off of [1, 2]) {
        const d = new Date(`${dia}T${String(h - off).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
        const enMadrid = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
        if (enMadrid === `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`) return d.toISOString();
    }
    return new Date(`${dia}T09:00:00Z`).toISOString();
}

const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : '—');

const nombreTitular = (c = {}) => `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim();

/**
 * Lo que hay que pagarle a UN expediente: las cuentas, los importes y, si no se
 * puede, POR QUÉ. No escribe nada.
 *
 * @returns {{ id, numero_expediente, cliente, incluible, motivo, aviso, forma_pago,
 *             bono, descuento, importe, pagos: [{ nombre, iban, importe, cuota_pct }],
 *             remesa, transferencia, resena }}
 */
async function pagoDeExpediente(exp, { facturaCobrada = false } = {}) {
    const c = exp?.clientes || {};
    const cobro = exp?.documentacion?.cobro || {};
    const ctx = await cobroService.contextoDe(exp);
    const forma = cobro.respuestas?.forma_pago || null;
    // Los honorarios, por `bloquePago`: la MISMA fuente que el formulario y la fila
    // de la fase 7 (sin coste en el expediente, los 250 € por defecto).
    const { bloquePago } = await cobroService.loadCobroForm();
    const descuento = ctx.clienteAsumeCoste && forma === 'descuento' ? bloquePago(ctx.costeGestion).importe_sin_iva : 0;
    const bono = Number(ctx.bono) > 0 ? ctx.bono : null;
    const out = {
        id: exp.id,
        numero_expediente: exp.numero_expediente,
        cliente: nombreTitular(c) || null,
        forma_pago: ctx.clienteAsumeCoste ? forma : 'asumida',
        bono,
        descuento,
        importe: bono != null ? Math.round((bono - descuento) * 100) / 100 : null,
        incluible: false,
        motivo: null,
        aviso: null,
        pagos: [],
        remesa: cobro.remesa || null,
        transferencia: cobro.transferencia || null,
        resena: cobro.resena || null,
    };

    if (!cobro.completado_at) { out.motivo = 'No ha confirmado su cuenta'; return out; }
    if (bono == null) { out.motivo = 'Sin ahorro verificado: no hay importe que transferir'; return out; }
    if (ctx.clienteAsumeCoste && !forma) { out.motivo = 'No ha elegido cómo liquidar la gestión'; return out; }
    // La factura de gestión emitida desde la fase 7 y marcada PAGADA cuenta como
    // cobrada (facturaGestionCae.marcarPagada); el check del popup sigue valiendo
    // para las que se cobraron por fuera.
    const facturaPagada = facturaCobrada || cobro.factura_gestion?.estado === 'PAGADA';
    if (forma === 'factura' && ctx.clienteAsumeCoste && !facturaPagada) {
        out.motivo = 'Pidió factura: el ingreso sale cuando esté cobrada';
        out.factura_pendiente = true;
        return out;
    }
    if (!(out.importe > 0)) { out.motivo = 'El importe a transferir no es positivo'; return out; }

    // VARIOS CEDENTES con cuenta propia: el ingreso se parte por cuotas, en
    // céntimos, y el resto del redondeo va a la última cuenta.
    let grupos = [];
    try {
        const { repartoPago } = await loadCedentes();
        grupos = repartoPago(c);
    } catch (e) { console.warn('[pago clientes] reparto:', e.message); }
    if (grupos.length > 1) {
        const importes = repartirCentimos(out.importe, grupos.map(g => g.cuota_pct));
        out.pagos = grupos.map((g, i) => ({
            nombre: (g.cedentes || []).join(' y ') || out.cliente,
            iban: normalizarIban(g.iban),
            importe: importes[i],
            cuota_pct: g.cuota_pct,
        }));
    } else {
        out.pagos = [{ nombre: out.cliente, iban: normalizarIban(c.numero_cuenta), importe: out.importe, cuota_pct: 100 }];
    }
    const malas = out.pagos.filter(p => !ibanValido(p.iban));
    if (malas.length) {
        out.motivo = `Cuenta no válida: ${malas.map(p => p.iban || '(vacía)').join(', ')}`;
        return out;
    }
    if (cobro.iban_cambiado) out.aviso = 'Ha cambiado de cuenta: revisa su justificante antes de ordenar';
    // Con el justificante del banco subido ya está PAGADO: no vuelve a ninguna
    // remesa (se le pagaría dos veces). Va al final para que `pagos` siga lleno
    // (la carta de pago de prueba lo lee).
    if (cobro.transferencia) {
        out.motivo = `Ya transferido el ${fechaCorta(cobro.transferencia.at)}`;
        out.transferida = true;
        return out;
    }
    out.incluible = true;
    return out;
}

// ─── En qué punto está el pago, para la TARJETA del lote ─────────────────────
// La tarjeta del listado decía «PTE. PAGO BROKERGY A CLIENTE» con los cinco ya
// transferidos (LOTE-2025-001, 24/10/2026): el estado del lote no se mueve al
// pagar, así que el punto de verdad se lee de los sellos de `cobro` de cada
// expediente. Solo PASOS y números de expediente: ni importes ni cuentas (la lista
// la ve todo el staff) — y `cobro` entero no sale de aquí (lleva el token).
const PASOS_PAGO = ['sin_pedir', 'pedida', 'confirmada', 'remesa', 'pagado'];

/** El paso más avanzado de UN expediente según sus sellos de `documentacion.cobro`. */
function pasoPago(cobro) {
    const c = cobro || {};
    if (c.transferencia?.at) return 'pagado';
    if (c.remesa?.at) return 'remesa';
    if (c.completado_at) return 'confirmada';
    if (c.enviado_at) return 'pedida';
    return 'sin_pedir';
}

/**
 * El resumen del lote: cuántos hay en cada paso, cuántos pagados ya avisados y
 * los que faltan por pagar con su paso. `exps`: [{ numero_expediente, cobro }].
 */
function resumenPagoLote(exps = []) {
    const n = Object.fromEntries(PASOS_PAGO.map(p => [p, 0]));
    let avisados = 0;
    const pendientes = [];
    for (const e of exps) {
        const paso = pasoPago(e.cobro);
        n[paso]++;
        if (paso === 'pagado') { if (e.cobro?.transferencia?.aviso_at) avisados++; }
        else pendientes.push({ numero_expediente: e.numero_expediente, paso });
    }
    pendientes.sort((a, b) => String(a.numero_expediente).localeCompare(String(b.numero_expediente), 'es', { numeric: true }));
    return { total: exps.length, ...n, avisados, pendientes };
}

let _cedentesMod = null;
async function loadCedentes() {
    if (!_cedentesMod) {
        const { pathToFileURL } = require('url');
        const path = require('path');
        _cedentesMod = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/cedentes.js')).href);
    }
    return _cedentesMod;
}

async function expedientesDelLote(loteId) {
    const { data, error } = await supabase
        .from('expedientes').select('id').eq('lote_id', loteId).order('numero_expediente');
    if (error) throw error;
    const out = [];
    for (const m of (data || [])) {
        const exp = await cobroService.cargarExpediente(m.id);
        if (exp) out.push(exp);
    }
    return out;
}

/**
 * La vista previa de la remesa: qué entra, por cuánto, y qué se queda fuera.
 * `facturaCobrada`: ids de los que pidieron factura y ya la han pagado.
 */
async function previsualizarRemesa(lote, { facturaCobrada = [] } = {}) {
    const exps = await expedientesDelLote(lote.id);
    const filas = [];
    for (const exp of exps) {
        filas.push(await pagoDeExpediente(exp, { facturaCobrada: facturaCobrada.includes(exp.id) }));
    }
    const ord = ordenante();
    return {
        lote: { id: lote.id, codigo: lote.codigo, estado: lote.estado },
        ordenante: { nombre: ord.nombre, iban: ord.iban, bic: ord.bic, nif: ord.nif, sufijo: ord.sufijo },
        // Hoy, como la remesa que BBVA ya ejecutó; se puede cambiar en el popup.
        fecha_ejecucion: fechaMadrid(),
        filas,
    };
}

/** El concepto: lo que el cliente lee en su banco. */
async function concepto(numExp) {
    const { conceptoTransferencia } = await cobroService.loadCobroForm();
    return conceptoTransferencia(numExp);
}

/**
 * Genera la remesa de los expedientes elegidos. Devuelve el XML y lo que se ha
 * sellado; quien llama lo guarda en Drive y lo descarga.
 */
async function generarRemesa(lote, { ids = [], facturaCobrada = [], fechaEjecucion, usuario }) {
    if (!ESTADOS_PAGO.includes(lote.estado)) {
        const e = new Error('El lote todavía no está en "PTE. PAGO BROKERGY A CLIENTE": el Sujeto Obligado no ha pagado.');
        e.status = 409; throw e;
    }
    const prev = await previsualizarRemesa(lote, { facturaCobrada });
    const elegidas = prev.filas.filter(f => ids.includes(f.id));
    if (!elegidas.length) { const e = new Error('Elige al menos un cliente'); e.status = 400; throw e; }
    const fuera = elegidas.filter(f => !f.incluible);
    if (fuera.length) {
        const e = new Error(`No se pueden incluir: ${fuera.map(f => `${f.numero_expediente} (${f.motivo})`).join(' · ')}`);
        e.status = 400; throw e;
    }

    const fecha = fechaEjecucion && /^\d{4}-\d{2}-\d{2}$/.test(fechaEjecucion) ? fechaEjecucion : prev.fecha_ejecucion;
    if (fecha < fechaMadrid()) { const e = new Error('La fecha de ejecución ya ha pasado'); e.status = 400; throw e; }
    const ahora = new Date();
    const msgId = msgIdBrokergy(ahora);

    const pagos = [];
    for (const f of elegidas) {
        const conc = await concepto(f.numero_expediente);
        f.pagos.forEach((p, i) => pagos.push({
            nombre: p.nombre,
            iban: p.iban,
            importe: p.importe,
            concepto: conc,
            referencia: f.numero_expediente,
            end_to_end: f.pagos.length > 1 ? `${f.numero_expediente}-${i + 1}` : f.numero_expediente,
        }));
    }
    const { xml, total, n } = componerRemesa({ ordenante: ordenante(), msgId, fechaEjecucion: fecha, pagos, ahora });

    const { mascaraIban } = await cobroService.loadCobroForm();
    for (const f of elegidas) {
        await cobroService.sellar(f.id, {
            remesa: {
                msg_id: msgId,
                at: ahora.toISOString(),
                por: usuario || null,
                fecha_ejecucion: fecha,
                importe: f.importe,
                descuento: f.descuento || 0,
                factura_cobrada: facturaCobrada.includes(f.id),
                cuentas: f.pagos.map(p => ({ mascara: mascaraIban(p.iban), importe: p.importe })),
            },
        });
    }
    return { xml, msg_id: msgId, total, n, fecha_ejecucion: fecha, expedientes: elegidas.map(f => f.numero_expediente) };
}

/**
 * Registra el justificante de la transferencia en los expedientes elegidos (el
 * PDF ya está en Drive: lo guarda la ruta, que conoce la carpeta del lote).
 */
async function registrarTransferencia(lote, { ids = [], link, usuario }) {
    const exps = await expedientesDelLote(lote.id);
    const hechos = [];
    for (const exp of exps.filter(e => ids.includes(e.id))) {
        const cobro = exp.documentacion?.cobro || {};
        if (!cobro.remesa) continue;     // no se transfiere lo que no se ordenó
        await cobroService.sellar(exp.id, {
            transferencia: {
                at: new Date().toISOString(),
                por: usuario || null,
                justificante_link: link || null,
                importe: cobro.remesa.importe,
                msg_id: cobro.remesa.msg_id,
            },
        });
        await apuntarHistorial(exp, 'transferencia_cliente',
            `Transferencia de la ayuda al cliente realizada (${eur(cobro.remesa.importe)}, remesa ${cobro.remesa.msg_id}). Justificante subido.`, usuario);
        hechos.push({ id: exp.id, numero_expediente: exp.numero_expediente });
    }
    return hechos;
}

/**
 * Con la transferencia registrada, la CARTA DE PAGO de cada uno (cartaPagoService).
 * Una que falla no para a las demás: queda su incidencia en el expediente y el
 * motivo vuelve en `error`. Con `CARTA_PAGO_ENVIO_AUTO`, además se manda sola por
 * los canales que tenga el cliente; si no, espera al popup.
 */
async function cartasDeTransferencia(hechos, { usuario } = {}) {
    const cartaPago = require('./cartaPagoService');
    const out = [];
    for (const h of hechos) {
        try {
            const g = await cartaPago.generar(h.id, { usuario });
            const fila = { ...h, numero: g.numero, link: g.link };
            if (cartaPago.envioAuto()) {
                const exp = await cobroService.cargarExpediente(h.id);
                const contacto = cobroService.contactoCliente(exp);
                const channels = [...(contacto.tlf ? ['whatsapp'] : []), ...(contacto.email ? ['email'] : [])];
                try {
                    fila.enviada = (await avisarTransferencia(exp, { channels, usuario: usuario || 'SISTEMA' })).channels;
                } catch (e) { fila.error_envio = e.message; }
            }
            out.push(fila);
        } catch (e) {
            console.warn('[carta de pago]', h.numero_expediente, e.message);
            out.push({ ...h, error: e.message });
        }
    }
    return out;
}

const eur = (n) => (n == null ? '—' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

async function apuntarHistorial(exp, tipo, texto, usuario) {
    try {
        const { data } = await supabase.from('expedientes').select('documentacion').eq('id', exp.id).maybeSingle();
        const doc = data?.documentacion || {};
        const historial = Array.isArray(doc.historial) ? doc.historial : [];
        historial.push({ id: `${Date.now()}_${tipo}`, tipo, texto, fecha: new Date().toISOString(), usuario: usuario || 'SISTEMA' });
        // Se relee justo antes y se escribe solo el historial dentro del objeto
        // recién leído: la misma pauta que `/cobro/enviar`.
        await supabase.from('expedientes')
            .update({ documentacion: { ...doc, historial }, updated_at: new Date().toISOString() })
            .eq('id', exp.id);
    } catch (e) { console.warn('[pago clientes] historial:', e.message); }
}

/**
 * Los BORRADORES del popup de aviso: el de la transferencia y el de la reseña,
 * con la hora a la que saldría esta última.
 */
async function borradoresAviso(exp) {
    const { componerMensajeTransferencia, componerMensajeResena, conceptoTransferencia } = await cobroService.loadCobroForm();
    const c = exp?.clientes || {};
    const cobro = exp?.documentacion?.cobro || {};
    const tercero = cobroService.esTercero(c);
    const partner = !!c.contacto_es_partner;
    const nombre = cobroService.primerNombre(exp);
    const titular = require('./recordatorios').capitalizar(nombreTitular(c)) || null;
    const cuentas = cobro.remesa?.cuentas || [];
    const enlace = enlaceResena();
    const { gestionBonificada } = await cobroService.contextoDe(exp);
    // Con CARTA DE PAGO, el aviso es el suyo (PDF adjunto) y ya pide la reseña: la
    // programada sale propuesta pero DESMARCADA (`resena_con_carta`).
    const cp = cobro.carta_pago;
    let carta = null;
    if (cp?.numero) {
        // WhatsApp, asunto, texto plano y —al titular— el email de diseño (`html`).
        const textos = await require('./cartaPagoService').mensajesDe(exp, { numero: cp.numero, fechaEmision: cp.fecha_emision });
        carta = { numero: cp.numero, nombre: cp.nombre, link: cp.link, at: cp.at, enviada_at: cp.enviada_at || null, ...textos };
    }
    // Con carta, lo programado es el RECORDATORIO «¿te ha llegado?» (24/10/2026,
    // recepcionCobroService): lleva a la página que confirma, pide la reseña y da su
    // documentación. Sale MARCADO: ya no repite la petición de la carta.
    const recordatorio = carta && !partner ? await require('./recepcionCobroService').recordatorioDe(exp) : null;
    return {
        carta,
        resena_con_carta: !!carta,
        recordatorio_asunto: recordatorio?.asunto || null,
        contacto: cobroService.contactoCliente(exp),
        transferencia: componerMensajeTransferencia({
            nombre, tercero, titular, partner, cuentas, concepto: conceptoTransferencia(exp.numero_expediente),
            bonificada: gestionBonificada,
        }),
        // Al PARTNER no se le pide una reseña de BROKERGY en nombre de su cliente.
        resena: partner ? null : recordatorio ? recordatorio.whatsapp : (enlace ? componerMensajeResena({
            nombre, tercero, enlace, requerimientos: await cobroService.requerimientosDe(exp),
        }) : null),
        resena_motivo: partner ? 'El contacto es el partner: no se le pide la reseña'
            : (!enlace ? 'Falta el enlace de reseñas de Google (GOOGLE_RESENA_URL)' : null),
        resena_at: cuandoResena(cobro.transferencia?.at ? new Date(cobro.transferencia.at) : new Date()),
        resena_activa: resenaActiva(),
    };
}

/** Manda un texto por los canales pedidos. Devuelve los que han salido. */
async function mandar({ tlf, email, asunto, texto, channels }) {
    const whatsappService = require('./whatsappService');
    const emailService = require('./emailService');
    const sent = [];
    if (channels.includes('whatsapp') && tlf) {
        try { await whatsappService.sendText(tlf, texto); sent.push('WhatsApp'); }
        catch (e) { console.warn('[pago clientes] WA:', e.message); sent.push('WhatsApp (encolado)'); }
    }
    if (channels.includes('email') && email) {
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;font-size:15px;line-height:24px">${
            texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|\r|\n/g, '<br>')
        }</div>`;
        await emailService.sendMail({ to: email, subject: asunto, text: texto, html });
        sent.push('Email');
    }
    return sent;
}

/**
 * Envía el aviso de transferencia y, si se pide, PROGRAMA la reseña con el texto
 * revisado en el popup (el despachador no recompone nada: manda lo que se vio).
 */
async function avisarTransferencia(exp, { channels = [], mensaje, mensajeEmail, asunto, resena = null, usuario }) {
    const cobro = exp?.documentacion?.cobro || {};
    if (!cobro.transferencia?.at) { const e = new Error('Primero sube el justificante de la transferencia'); e.status = 409; throw e; }
    const contacto = cobroService.contactoCliente(exp);
    const borr = await borradoresAviso(exp);
    let sent;
    const patch = {};
    if (borr.carta) {
        // Con carta de pago: el PDF adjunto, por WhatsApp como documento con el
        // mensaje de pie y por email como adjunto. Lo revisado en el popup MANDA.
        const cartaPago = require('./cartaPagoService');
        const pdf = await cartaPago.pdfDe(exp, { usuario });
        const r = await cartaPago.enviar({
            buffer: pdf.buffer, nombre: pdf.nombre, tlf: contacto.tlf, email: contacto.email, channels,
            textos: {
                whatsapp: String(mensaje || '').trim() || borr.carta.whatsapp,
                // Con el email de diseño, el cuerpo es el suyo (y su texto plano): en
                // el popup solo se toca el asunto.
                email: (!borr.carta.html && String(mensajeEmail || '').trim()) || borr.carta.email,
                html: borr.carta.html,
                asunto: String(asunto || '').trim() || borr.carta.asunto,
            },
        });
        sent = r.sent;
        if (!sent.length) {
            const e = new Error(r.errores.join(' · ') || 'No se pudo enviar por los canales elegidos (sin teléfono o sin email)');
            e.status = r.errores.length ? 502 : 400; throw e;
        }
        patch.carta_pago = { ...cobro.carta_pago, enviada_at: new Date().toISOString(), enviada_canales: sent, envio_errores: r.errores.length ? r.errores : null };
    } else {
        const texto = String(mensaje || '').trim() || borr.transferencia;
        sent = await mandar({
            tlf: contacto.tlf, email: contacto.email, channels, texto,
            asunto: `Ya te hemos transferido tu ayuda (${exp.numero_expediente})`,
        });
        if (!sent.length) { const e = new Error('No se pudo enviar por los canales elegidos (sin teléfono o sin email)'); e.status = 400; throw e; }
    }

    patch.transferencia = { ...cobro.transferencia, aviso_at: new Date().toISOString(), aviso_por: usuario || null, aviso_canales: sent };
    let resenaProg = null;
    if (resena?.programar && String(resena.mensaje || '').trim()) {
        const at = new Date(resena.at);
        if (Number.isNaN(at.getTime()) || at.getTime() < Date.now()) {
            const e = new Error('La hora de la reseña no es válida o ya ha pasado'); e.status = 400; throw e;
        }
        resenaProg = {
            programada_para: at.toISOString(),
            mensaje: String(resena.mensaje).trim(),
            // El destinatario y el canal se FIJAN al programar: es a quien se le
            // acaba de avisar, y el despachador no vuelve a decidir.
            tlf: channels.includes('whatsapp') ? contacto.tlf : null,
            email: channels.includes('email') ? contacto.email : null,
            canales: channels,
            // El recordatorio «¿te ha llegado?» lleva su propio asunto.
            asunto: borr.recordatorio_asunto || null,
            recordatorio: !!borr.recordatorio_asunto,
            programada_por: usuario || null,
            programada_at: new Date().toISOString(),
            enviada_at: null,
            cancelada_at: null,
            error: null,
        };
        patch.resena = resenaProg;
    }
    await cobroService.sellar(exp.id, patch);
    await apuntarHistorial(exp, 'aviso_transferencia',
        `Aviso de transferencia enviado al cliente${contacto.nombre ? ` (${contacto.nombre})` : ''} vía ${sent.join(' + ')}`
        + (borr.carta ? `, con la carta de pago ${borr.carta.numero} adjunta` : '')
        + (patch.carta_pago?.envio_errores ? ` (no salió por: ${patch.carta_pago.envio_errores.join(' · ')})` : '')
        + (resenaProg ? `. Petición de reseña programada para el ${fechaEs(resenaProg.programada_para)}` : ''), usuario);
    return { channels: sent, resena: resenaProg };
}

async function cancelarResena(exp, usuario) {
    const r = exp?.documentacion?.cobro?.resena;
    if (!r || r.enviada_at) return false;
    await cobroService.sellar(exp.id, { resena: { ...r, cancelada_at: new Date().toISOString(), cancelada_por: usuario || null } });
    return true;
}

const fechaEs = (iso) => {
    try {
        return new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return iso; }
};

// ─── El despachador de las reseñas ───────────────────────────────────────────
// Cada 5 minutos: los expedientes de lotes en pago con una reseña vencida y sin
// enviar. Se mira solo `documentacion->cobro` de los expedientes de ESOS lotes
// (unas decenas), nunca la tabla entera (regla 22).
//
// Solo entre las 9:00 y las 21:00 de Madrid: si el servidor estuvo parado, una
// reseña vencida a las 11:00 no sale a las tres de la madrugada al arrancar.
let _timer = null;
let _barriendo = false;

function horaMadrid(d = new Date()) {
    return Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(d));
}

async function barrer() {
    if (_barriendo) return { saltado: true };
    _barriendo = true;
    const hechos = [];
    try {
        const h = horaMadrid();
        if (h < 9 || h >= 21) return { fuera_de_hora: true };
        const { data: lotes, error } = await supabase.from('lotes').select('id').in('estado', ESTADOS_PAGO);
        if (error) throw error;
        const ids = (lotes || []).map(l => l.id);
        if (!ids.length) return { hechos };
        const { data: exps, error: eErr } = await supabase
            .from('expedientes').select('id, numero_expediente, cobro:documentacion->cobro').in('lote_id', ids);
        if (eErr) throw eErr;
        const ahora = Date.now();
        for (const e of (exps || [])) {
            const r = e.cobro?.resena;
            if (!r || r.enviada_at || r.cancelada_at || r.enviando_at || !r.programada_para) continue;
            if (new Date(r.programada_para).getTime() > ahora) continue;
            // Quien ya ha confirmado el ingreso Y dice que dejó la reseña no necesita
            // el recordatorio (recepcionCobroService): se anula diciendo por qué.
            if (e.cobro?.recepcion?.estado === 'recibido' && e.cobro?.resena_cliente?.declarada_at) {
                await cobroService.sellar(e.id, { resena: { ...r, cancelada_at: new Date().toISOString(), cancelada_por: 'SISTEMA', motivo: 'Ya confirmó el ingreso y dejó la reseña' } });
                continue;
            }
            // Se marca ANTES de mandar: si el envío tarda y el barrido siguiente
            // llega, no lo repite.
            await cobroService.sellar(e.id, { resena: { ...r, enviando_at: new Date().toISOString() } });
            try {
                const sent = await mandar({
                    tlf: r.tlf, email: r.email, channels: r.canales || [], texto: r.mensaje,
                    asunto: r.asunto || '¿Nos ayudas con una reseña? — BROKERGY',
                });
                await cobroService.sellar(e.id, { resena: { ...r, enviando_at: null, enviada_at: new Date().toISOString(), enviada_canales: sent } });
                await apuntarHistorial(e, 'resena_enviada', `${r.recordatorio ? 'Recordatorio «¿te ha llegado el ingreso?» (reseña + documentación)' : 'Petición de reseña en Google'} enviado vía ${sent.join(' + ') || '—'}`, 'SISTEMA');
                hechos.push(e.numero_expediente);
            } catch (err) {
                console.error('[reseña] envío', e.numero_expediente, err.message);
                await cobroService.sellar(e.id, { resena: { ...r, enviando_at: null, error: err.message, fallida_at: new Date().toISOString() } });
            }
        }
    } catch (err) {
        console.error('[reseña] barrido:', err.message);
    } finally {
        _barriendo = false;
    }
    return { hechos };
}

function start() {
    if (_timer) return;
    if (!resenaActiva()) {
        console.log('[reseña] Despachador APAGADO (RESENA_PROGRAMADA_ENABLED != true)');
        return;
    }
    const cada = Number(process.env.RESENA_INTERVALO_MS || 5 * 60 * 1000);
    _timer = setInterval(() => { barrer().catch(() => {}); }, cada);
    setTimeout(() => { barrer().catch(() => {}); }, 30 * 1000);
    console.log(`[reseña] Despachador activo (cada ${Math.round(cada / 1000)} s)`);
}

module.exports = {
    ESTADOS_PAGO,
    ordenante,
    enlaceResena,
    cuandoResena,
    horaMadridAIso,
    pagoDeExpediente,
    pasoPago,
    resumenPagoLote,
    previsualizarRemesa,
    generarRemesa,
    registrarTransferencia,
    cartasDeTransferencia,
    borradoresAviso,
    avisarTransferencia,
    cancelarResena,
    apuntarHistorial,
    mandar,
    barrer,
    start,
};
