// ─── facturaVentaAhorro.js ───────────────────────────────────────────────────
// La FACTURA de VENTA DEL AHORRO de un cliente EMPRESA (fase 7 del lote). El
// porqué, los dos caminos (autofactura o factura del cliente) y sus reglas, en
// frontend/src/features/lotes/logic/facturaVentaAhorro.js — la fuente única de
// líneas, número, acuerdo y textos, que aquí se carga por import().
//
// Registro: `documentacion.cobro.factura_venta` (metadatos, objeto ENTERO: la RPC
// de merge solo funde el primer nivel de `cobro`). Los PDF van a Drive, a «5.
// FACTURAS» del expediente con nombre propio («… - VENTA AHORRO CAE - …»: el
// paquete del S.O. coge las que se llaman «… - facturas» y estas no son de la obra).
//
// REGLA — el ORDEN legal de la autofactura se respeta en el código: primero el
// ACUERDO (sellado con nombre, DNI, IP y hora), DESPUÉS se expide la factura (con
// número) y por último el cliente la ACEPTA. No se expide ninguna antes del acuerdo.
// REGLA — un número expedido no se tira: si el cliente señala un error, se REHACE
// con el mismo número (aún no estaba aceptada, no ha surtido efecto) y vuelve a
// pedirle que la acepte.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const cobroService = require('./cobroService');
const { htmlToPdf } = require('./pdfService');

const error = (status, msg) => Object.assign(new Error(msg), { status });
const txt = (v) => (v == null ? '' : String(v).trim());
const r2 = (n) => Math.round(Number(n) * 100) / 100;

let _mods = null;
function modulos() {
    if (!_mods) {
        const url = (p) => pathToFileURL(path.join(__dirname, '../../frontend/src/features', p)).href;
        _mods = Promise.all([
            import(url('lotes/logic/facturaVentaAhorro.js')),
            import(url('cee-directo/logic/facturaCee.js')),
            import(url('cobro/logic/cobroForm.js')),
            import(url('expedientes/logic/expedienteFinancials.js')),
            import(url('cee-directo/logic/ofertaCee.js')),
        ]).then(([venta, cee, cobro, fin, oferta]) => ({ venta, cee, cobro, fin, oferta }));
    }
    return _mods;
}

const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());

/** ¿Es un cliente que tiene que facturar la venta? La ficha lo dice (`es_empresa`). */
function esEmpresa(exp) {
    return !!exp?.clientes?.es_empresa;
}

/** La ficha entera del cliente (el SELECT del cobro no trae la dirección ni el representante). */
async function fichaCliente(exp) {
    if (!exp?.cliente_id) return null;
    const { data } = await supabase.from('clientes')
        .select('id_cliente, nombre_razon_social, apellidos, dni, direccion, codigo_postal, municipio, provincia, tlf, email, numero_cuenta, es_empresa, representante_nombre, representante_apellidos, representante_dni')
        .eq('id_cliente', exp.cliente_id).maybeSingle();
    return data || null;
}

/** El cliente como EMISOR de la factura (la plantilla lo pinta arriba, sin la marca BROKERGY). */
function emisorDe(c, mascaraIban) {
    return {
        razonSocial: `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim().toUpperCase(),
        direccion: txt(c.direccion), cp: txt(c.codigo_postal), municipio: txt(c.municipio), provincia: txt(c.provincia),
        cif: txt(c.dni).toUpperCase(), tlf: txt(c.tlf), email: txt(c.email),
        // La cuenta va ENMASCARADA también en el PDF: viaja por WhatsApp y email.
        banco: 'Cuenta del proveedor (confirmada en el formulario de cobro)',
        iban: mascaraIban(c.numero_cuenta) || 'La que conste en el Convenio de Cesión',
        marca: false,
    };
}

/** BROKERGY como DESTINATARIO («Facturar a»). */
function receptorBrokergy(E) {
    return {
        razon_social: E.razonSocial, cif: E.cif, direccion: E.direccion, cp: E.cp,
        municipio: E.municipio, provincia: E.provincia, tlf: E.tlf, email: E.email,
    };
}

/**
 * La base: lo que la remesa le transferiría (bono VERIFICADO menos los honorarios
 * si eligió descontarlos). La MISMA cuenta que `pagoDeExpediente`.
 */
async function cifras(exp) {
    const { cobro: cf, fin } = await modulos();
    const ctx = await cobroService.contextoDe(exp);
    const forma = exp.documentacion?.cobro?.respuestas?.forma_pago || null;
    const descuento = ctx.clienteAsumeCoste && forma === 'descuento' ? cf.bloquePago(ctx.costeGestion).importe_sin_iva : 0;
    let kwh = null;
    try { kwh = fin.computeExpedienteFinancials(exp)?.savingsKwhVerificado ?? null; } catch { /* sin kWh, el detalle no los dice */ }
    return { ctx, bono: Number(ctx.bono) > 0 ? ctx.bono : null, descuento, kwh, forma };
}

async function codigoLote(exp) {
    if (!exp?.lote_id) return null;
    const { data } = await supabase.from('lotes').select('codigo').eq('id', exp.lote_id).maybeSingle();
    return data?.codigo || null;
}

/** Líneas, totales y observaciones de la factura de ESTE expediente, hoy. */
async function calcular(exp, { modo, ivaPct } = {}) {
    const { venta, cee } = await modulos();
    const c = await fichaCliente(exp);
    const k = await cifras(exp);
    const pct = ivaPct != null && ivaPct !== '' && Number.isFinite(Number(ivaPct)) ? Number(ivaPct) : venta.IVA_VENTA_DEFECTO;
    const lineas = k.bono ? venta.lineasVentaAhorro({ bono: k.bono, kwh: k.kwh, expediente: exp.numero_expediente, descuento: k.descuento, ivaPct: pct }) : [];
    const t = cee.totalesFactura(lineas);
    const razon = `${c?.nombre_razon_social || ''} ${c?.apellidos || ''}`.trim().toUpperCase();
    const observaciones = venta.observacionesVenta({ modo, expediente: exp.numero_expediente, lote: await codigoLote(exp), razonSocialCliente: razon });
    return { c, k, ivaPct: pct, lineas: t.lineas.map(l => ({ descripcion: l.descripcion, detalle: l.detalle, uds: l.uds, precio: l.precio, dtoPct: 0, ivaPct: l.ivaPct })), neto: t.neto, iva: t.iva, total: t.total, observaciones, razon };
}

function registroDe(exp) {
    return exp?.documentacion?.cobro?.factura_venta || null;
}

/** Por qué no se puede pedir / expedir (o null). */
function bloqueo(exp, k) {
    const cobro = exp.documentacion?.cobro || {};
    if (!esEmpresa(exp)) return 'El cliente no está marcado como EMPRESA en su ficha: a un particular se le paga sin factura.';
    if (cobro.remesa) return 'Ya está en una remesa SEPA: el importe ya no se puede cambiar.';
    if (!k.bono) return 'Sin ahorro verificado todavía: no hay importe que facturar.';
    if (k.ctx.clienteAsumeCoste && !k.forma && !k.ctx.gestionBonificada) return 'Antes tiene que confirmar su cuenta y elegir cómo liquida la gestión (descuento o factura), o regalársela: de eso depende la base de la factura.';
    return null;
}

function enlaceVenta(expId, token) {
    const base = process.env.APP_URL || process.env.FRONTEND_URL || 'https://app.brokergy.es';
    return `${base.replace(/\/$/, '')}/factura-ahorro/${expId}?token=${token}`;
}

/** Lo que va en la fila de la fase 7 (sin importes salvo `conImportes`, que es ADMIN). */
function resumenFila(exp, { conImportes = false } = {}) {
    if (!esEmpresa(exp)) return null;
    const reg = registroDe(exp);
    if (!reg) return { estado: null };
    return {
        estado: reg.estado, modo: reg.modo, numero: reg.numero || null,
        pedida_at: reg.pedida_at || null, acuerdo_at: reg.acuerdo?.at || null,
        emitida_at: reg.emitida_at || null, aceptada_at: reg.aceptada_at || null,
        rechazo: reg.rechazo ? { at: reg.rechazo.at, motivo: reg.rechazo.motivo } : null,
        recibida_at: reg.recibida?.at || null, no_procede: reg.no_procede || null,
        // Lo eligió el CLIENTE (formulario de cobro o su página), no el equipo.
        elegido: reg.elegido?.por === 'cliente' ? { at: reg.elegido.at, origen: reg.elegido.origen } : null,
        subida_por_cliente: reg.recibida?.por === 'cliente',
        lista: ['ACEPTADA', 'RECIBIDA', 'NO_PROCEDE'].includes(reg.estado),
        total: conImportes ? (reg.total ?? null) : null,
        neto: conImportes ? (reg.neto ?? null) : null,
        link: conImportes ? (reg.pdf?.link || reg.recibida?.link || null) : null,
    };
}

// ── El popup de la fase 7 ───────────────────────────────────────────────────

async function borrador(exp, { modo = null, ivaPct = null } = {}) {
    const { venta, cobro: cf } = await modulos();
    const reg = registroDe(exp);
    const m = venta.MODOS_VENTA.includes(modo) ? modo : (reg?.modo || 'autofactura');
    const pct = ivaPct != null ? ivaPct : (reg?.iva_pct ?? null);
    const d = await calcular(exp, { modo: m, ivaPct: pct });
    const contacto = cobroService.contactoCliente(exp);
    const tercero = cobroService.esTercero(exp.clientes || {});
    const enlace = enlaceVenta(exp.id, await cobroService.ensureToken(exp));
    const mensajes = {};
    for (const mm of ['autofactura', 'cliente']) {
        mensajes[mm] = venta.mensajeVentaAhorro({
            modo: mm, nombre: contacto.nombre, esTercero: tercero, razonSocial: d.razon,
            total: d.total, base: d.neto, ivaPct: d.ivaPct, iva: d.iva, kwh: d.k.kwh, expediente: exp.numero_expediente, enlace,
        });
    }
    return {
        expediente: { id: exp.id, numero: exp.numero_expediente },
        cliente: { razon_social: d.razon, cif: txt(d.c?.dni).toUpperCase(), es_empresa: esEmpresa(exp),
            representante: [d.c?.representante_nombre, d.c?.representante_apellidos].filter(Boolean).join(' ') || null,
            iban_mascara: cf.mascaraIban(d.c?.numero_cuenta) },
        modo: m, ivaPct: d.ivaPct,
        bono: d.k.bono, descuento: d.k.descuento, kwh: d.k.kwh,
        lineas: d.lineas, neto: d.neto, iva: d.iva, total: d.total, observaciones: d.observaciones,
        contacto, enlace, mensajes,
        bloqueo: bloqueo(exp, d.k),
        registro: reg,
    };
}

/** Busca qué números AF ya tiene ese CIF (en todas sus fichas), para la serie. */
async function numerosDelCif(cif) {
    const limpio = txt(cif).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!limpio) return [];
    const { data: cls } = await supabase.from('clientes').select('id_cliente, dni').ilike('dni', `%${limpio.slice(-7)}%`);
    const ids = (cls || []).filter(x => txt(x.dni).toUpperCase().replace(/[^A-Z0-9]/g, '') === limpio).map(x => x.id_cliente);
    if (!ids.length) return [];
    // Pocas filas (las obras de UN cliente) y solo el subcampo: regla 22.
    const { data } = await supabase.from('expedientes')
        .select('id, numero:documentacion->cobro->factura_venta->>numero').in('cliente_id', ids);
    return (data || []).map(x => x.numero).filter(Boolean);
}

/**
 * PEDIRLA: fija el modo y el IVA y la manda al cliente. Con «autofactura» el
 * mensaje lleva el ENLACE (allí acepta el acuerdo y la factura); con «cliente»,
 * el MODELO en PDF adjunto. No numera nada.
 */
async function pedir(exp, { modo, ivaPct, canales = [], tlf, email, mensaje, usuario = null } = {}) {
    const { venta } = await modulos();
    if (!['autofactura', 'cliente'].includes(modo)) throw error(400, 'Modo no válido: autofactura o cliente');
    const reg = registroDe(exp);
    if (reg && ['ACEPTADA', 'RECIBIDA'].includes(reg.estado)) throw error(409, `Ya está ${reg.estado === 'ACEPTADA' ? 'aceptada' : 'recibida'}: no hay nada que pedir.`);
    if (reg?.numero && modo !== 'autofactura') throw error(409, `Ya se expidió la autofactura ${reg.numero}: no se puede cambiar a que la emita él.`);
    const d = await calcular(exp, { modo, ivaPct });
    const motivo = bloqueo(exp, d.k);
    if (motivo) throw error(409, motivo);

    const quiereEmail = canales.includes('email') && txt(email);
    const quiereWa = canales.includes('whatsapp') && txt(tlf);
    if (!quiereEmail && !quiereWa) throw error(400, 'No hay ningún canal con destinatario');

    const enlace = enlaceVenta(exp.id, await cobroService.ensureToken(exp));
    const contacto = cobroService.contactoCliente(exp);
    let texto = txt(mensaje) || venta.mensajeVentaAhorro({
        modo, nombre: contacto.nombre, esTercero: cobroService.esTercero(exp.clientes || {}), razonSocial: d.razon,
        total: d.total, base: d.neto, ivaPct: d.ivaPct, iva: d.iva, kwh: d.k.kwh, expediente: exp.numero_expediente, enlace,
    });
    // El enlace se manda SIEMPRE en la autofactura, aunque se borrase al retocar.
    if (modo === 'autofactura' && !texto.includes(enlace)) texto = `${texto}\n\n👉 Revisa y acepta la factura aquí: ${enlace}`;

    let adjunto = null;
    if (modo === 'cliente') {
        const buffer = await htmlToPdf(await htmlFactura(exp, { ...d, modo, modelo: true }));
        adjunto = { filename: `MODELO factura venta ahorro - ${exp.numero_expediente}.pdf`, content: buffer };
    }

    const emailService = require('./emailService');
    const whatsappService = require('./whatsappService');
    const resultados = {};
    if (quiereEmail) {
        try {
            await emailService.sendDocumentEmail({
                to: txt(email), subject: `Factura de venta del ahorro · ${exp.numero_expediente}`, title: 'Factura de venta del ahorro',
                message: texto.replace(/\*/g, ''),
                attachments: adjunto ? [{ filename: adjunto.filename, content: adjunto.content, contentType: 'application/pdf' }] : [],
                pill: { tone: 'info', text: exp.numero_expediente, emoji: '🧾' },
            });
            resultados.email = { ok: true, to: txt(email) };
        } catch (e) { resultados.email = { ok: false, error: e.message }; }
    }
    if (quiereWa) {
        try {
            if (adjunto) {
                await whatsappService.sendMedia(txt(tlf),
                    { base64: adjunto.content.toString('base64'), filename: adjunto.filename, mimetype: 'application/pdf' },
                    { caption: texto, asDocument: true });
            } else {
                // Como el cobro: el texto y, aparte, la línea del enlace (con su vista previa).
                const { separarEnlaceCobro } = (await modulos()).cobro;
                const partes = separarEnlaceCobro(texto, enlace);
                if (partes?.enlace) {
                    await whatsappService.sendText(txt(tlf), partes.texto);
                    await whatsappService.sendText(txt(tlf), partes.enlace);
                } else {
                    await whatsappService.sendText(txt(tlf), texto);
                }
            }
            resultados.whatsapp = { ok: true, to: txt(tlf) };
        } catch (e) { resultados.whatsapp = { ok: false, error: e.message }; }
    }
    const canalesOk = Object.entries(resultados).filter(([, r]) => r.ok).map(([k]) => k);
    if (canalesOk.length) {
        const fresco = registroDe(await cobroService.cargarExpediente(exp.id)) || {};
        const envio = { at: new Date().toISOString(), canales: canalesOk, modo, usuario };
        await cobroService.sellar(exp.id, {
            factura_venta: {
                ...fresco, modo, iva_pct: d.ivaPct,
                // Lo que se le pidió (si es autofactura, se recalcula al expedirla).
                neto: fresco.numero ? fresco.neto : d.neto, iva: fresco.numero ? fresco.iva : d.iva, total: fresco.numero ? fresco.total : d.total,
                estado: fresco.numero ? fresco.estado : 'PEDIDA',
                pedida_at: fresco.pedida_at || envio.at, pedida_por: fresco.pedida_por || usuario,
                envios: [...(fresco.envios || []), envio],
            },
        });
    }
    return { resultados, canalesOk, enlace };
}

// ── El PDF ──────────────────────────────────────────────────────────────────

async function htmlFactura(exp, { c, lineas, observaciones, modo, modelo = false, numero = '', fecha = null }) {
    const { cee, cobro: cf, oferta } = await modulos();
    const fechaIso = fecha || hoyMadrid();
    return cee.buildFacturaCeeHtml({
        emisor: emisorDe(c || {}, cf.mascaraIban),
        numero: modelo ? '(vuestro nº)' : numero,
        fecha: cee.isoAEs(fechaIso),
        cliente: receptorBrokergy(oferta.BROKERGY_EMISOR),
        lineas,
        expediente: exp.numero_expediente,
        observaciones: modelo
            ? `MODELO — a emitir por ${txt(c?.nombre_razon_social).toUpperCase()} con su numeración, su fecha y su cuenta.\n${observaciones}`
            : observaciones,
    });
}

/** Guarda el PDF en «5. FACTURAS» del expediente; el mismo nombre sustituye al anterior. */
async function guardarEnExpediente(exp, nombre, buffer) {
    const driveService = require('./driveService');
    const { SUBCARPETA_FACTURAS } = require('./reformaUploadService');
    const dc = exp.oportunidades?.datos_calculo || {};
    const raiz = dc.drive_folder_id || dc.inputs?.drive_folder_id;
    if (!raiz) throw new Error('El expediente no tiene carpeta de Drive');
    const carpeta = await driveService.getOrCreateSubfolderNormalized(raiz, SUBCARPETA_FACTURAS);
    if (!carpeta || carpeta === raiz) throw new Error(`No se pudo abrir «${SUBCARPETA_FACTURAS}» del expediente`);
    const previos = await driveService.findFilesByName(carpeta, nombre).catch(() => []);
    const saved = await driveService.saveFileToFolder(carpeta, nombre, 'application/pdf', buffer);
    if (!saved?.id) throw new Error('Drive no devolvió el fichero guardado');
    for (const id of previos || []) if (id !== saved.id) await driveService.deleteFile(id).catch(() => {});
    return { driveId: saved.id, link: saved.link, nombre, at: new Date().toISOString() };
}

const limpio = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '-').trim();

// ── Lo que hace el CLIENTE en su enlace (autofactura) ──────────────────────

const enCurso = new Set();

/** La vista pública: el acuerdo, la factura (si ya está expedida) y en qué punto va. */
/** ¿Puede todavía ELEGIR (o cambiar) cómo se hace la factura? */
function puedeElegir(reg) {
    if (!reg) return true;
    if (reg.numero) return false;                                  // autofactura ya expedida: tiene número
    return !['ACEPTADA', 'RECIBIDA', 'NO_PROCEDE'].includes(reg.estado);
}

async function vistaPublica(exp) {
    const { venta } = await modulos();
    if (!esEmpresa(exp)) return null;
    const reg = registroDe(exp) || null;
    if (reg?.estado === 'NO_PROCEDE') return null;
    const modo = ['autofactura', 'cliente'].includes(reg?.modo) ? reg.modo : null;
    const c = await fichaCliente(exp);
    const razon = `${c?.nombre_razon_social || ''} ${c?.apellidos || ''}`.trim();
    const cif = txt(c?.dni).toUpperCase();
    const representante = [c?.representante_nombre, c?.representante_apellidos].filter(Boolean).join(' ');
    const d = reg?.numero ? reg : await calcular(exp, { modo: modo || 'autofactura', ivaPct: reg?.iva_pct });
    const k = reg?.numero ? null : d.k;
    // Sin bono verificado, o sin saber aún cómo liquida la gestión, no hay cifra
    // que enseñar: se le dice, en vez de una factura a cero.
    const sinImporte = !reg?.numero && !!(k && bloqueo(exp, k));
    return {
        numero_expediente: exp.numero_expediente,
        razon_social: razon,
        cif,
        modo,
        puede_elegir: puedeElegir(reg),
        sin_importe: sinImporte,
        firmante: { nombre: representante, dni: txt(c?.representante_dni).toUpperCase() },
        acuerdo: venta.textoAcuerdo({ razonSocial: razon, cif, representante, dniRepresentante: txt(c?.representante_dni).toUpperCase() }),
        acuerdo_aceptado: reg?.acuerdo ? { at: reg.acuerdo.at, nombre: reg.acuerdo.nombre } : null,
        factura: {
            numero: reg?.numero || null, fecha: reg?.fecha || null,
            lineas: (d.lineas || []).map(l => ({ descripcion: l.descripcion, detalle: l.detalle, importe: l.precio })),
            neto: d.neto, iva: d.iva, iva_pct: reg?.iva_pct ?? d.ivaPct, total: d.total,
            pdf: !!reg?.numero,
        },
        // Si la emite él: lo que tiene que poner, campo a campo.
        datos: sinImporte ? null : venta.datosFacturaCliente({ base: d.neto, ivaPct: reg?.iva_pct ?? d.ivaPct, iva: d.iva, total: d.total, kwh: k?.kwh ?? null, expediente: exp.numero_expediente }),
        recibida: reg?.estado === 'RECIBIDA' ? { at: reg.recibida?.at || null, numero: reg.numero_cliente || null, total: reg.total ?? null } : null,
        estado: reg?.estado || null,
        aceptada: reg?.aceptada_at ? { at: reg.aceptada_at, nombre: reg.aceptada_por?.nombre || null } : null,
        rechazo: reg?.estado === 'RECHAZADA' && reg.rechazo ? { at: reg.rechazo.at, motivo: reg.rechazo.motivo } : null,
        pagada: !!exp.documentacion?.cobro?.transferencia?.at,
    };
}

/**
 * El CLIENTE elige cómo se hace su factura (en el formulario de cobro o en su
 * página). Solo mientras no haya nada expedido ni recibido: una AF con número
 * ya no se cambia a «la emito yo».
 */
async function elegir(exp, { modo, origen = 'pagina' } = {}) {
    if (!esEmpresa(exp)) throw error(409, 'Este cobro no lleva factura de venta.');
    if (!['autofactura', 'cliente'].includes(modo)) throw error(400, 'Elige una de las dos opciones.');
    const reg = registroDe(exp) || {};
    if (!puedeElegir(reg)) {
        if (reg.modo === modo) return reg;
        throw error(409, reg.numero ? `La factura ${reg.numero} ya está expedida: ya no se puede cambiar de opción.` : 'La factura ya está resuelta: ya no se puede cambiar de opción.');
    }
    const ahora = new Date().toISOString();
    const nuevo = {
        ...reg, modo, estado: reg.estado === 'RECHAZADA' ? reg.estado : 'PEDIDA',
        elegido: { at: ahora, por: 'cliente', origen, modo },
        pedida_at: reg.pedida_at || ahora,
    };
    await cobroService.sellar(exp.id, { factura_venta: nuevo });
    return nuevo;
}

/**
 * Al CONFIRMAR EL COBRO una empresa: guarda la opción que eligió, avisa al
 * equipo y —con FACTURA_VENTA_ENVIO_AUTO=true— le manda por WhatsApp y email lo
 * suyo (el enlace de la autofactura, o los datos y el modelo). Apagado, el
 * equipo lo manda desde el popup de la fase 7; el formulario ya le enseña todo
 * en pantalla al terminar.
 */
async function alConfirmarCobro(exp, { avisar = true } = {}) {
    if (!esEmpresa(exp)) return null;
    const modo = exp.documentacion?.cobro?.respuestas?.factura_venta;
    if (!['autofactura', 'cliente'].includes(modo)) return null;
    const { venta } = await modulos();
    let reg;
    try { reg = await elegir(exp, { modo, origen: 'formulario' }); }
    catch (e) { console.warn('[factura venta] elegir:', e.message); return null; }
    const fresco = await cobroService.cargarExpediente(exp.id);
    const d = await calcular(fresco, { modo, ivaPct: reg.iva_pct });
    const motivo = bloqueo(fresco, d.k);
    if (avisar) await avisarEquipo(venta.avisoEquipoVenta({ accion: 'elegida', motivo: modo, expediente: exp.numero_expediente, razonSocial: d.razon, total: motivo ? null : d.total }),
        `${exp.numero_expediente}: factura de venta, ha elegido ${modo === 'cliente' ? 'emitirla él' : 'la autofactura'}`);
    if (process.env.FACTURA_VENTA_ENVIO_AUTO !== 'true' || motivo) return { reg, enviado: false };
    const contacto = cobroService.contactoCliente(fresco);
    try {
        const r = await pedir(fresco, { modo, ivaPct: reg.iva_pct, canales: ['whatsapp', 'email'], tlf: contacto.tlf, email: contacto.email, usuario: 'automatico' });
        return { reg, enviado: r.canalesOk };
    } catch (e) {
        console.warn('[factura venta] envío automático:', e.message);
        return { reg, enviado: false };
    }
}

/**
 * La pregunta del FORMULARIO DE COBRO para una empresa (o null): ¿quién hace la
 * factura? No sale si ya hay una factura expedida, recibida o «no procede».
 */
async function bloqueFormulario(exp) {
    if (!esEmpresa(exp)) return null;
    const reg = registroDe(exp);
    if (!puedeElegir(reg)) return null;
    const { venta } = await modulos();
    const b = venta.bloqueFacturaVenta({ ivaPct: reg?.iva_pct ?? venta.IVA_VENTA_DEFECTO });
    return { ...b, valor: exp.documentacion?.cobro?.respuestas?.factura_venta ?? reg?.modo ?? null, heredado: false };
}

/** Él SUBE su factura desde su página (camino «la emito yo»). */
async function subirFacturaCliente(exp, { buffer, mimetype, nombreFichero, numero, total, ip = null } = {}) {
    const { venta } = await modulos();
    const reg = registroDe(exp) || {};
    if (reg.modo !== 'cliente') throw error(409, 'Primero elige «La emito yo».');
    if (['ACEPTADA', 'RECIBIDA'].includes(reg.estado)) throw error(409, 'Ya tenemos vuestra factura.');
    if (txt(numero).length < 1) throw error(400, 'Escribe el número de vuestra factura.');
    const nuevo = await registrarRecibida(exp, { buffer, mimetype, nombreFichero, numero, total, usuario: 'cliente' });
    nuevo.recibida = { ...nuevo.recibida, por: 'cliente', ip };
    await cobroService.sellar(exp.id, { factura_venta: nuevo });
    const c = await fichaCliente(exp);
    await avisarEquipo(venta.avisoEquipoVenta({ accion: 'subida', expediente: exp.numero_expediente, razonSocial: `${c?.nombre_razon_social || ''} ${c?.apellidos || ''}`.trim(), numero: txt(numero), total: nuevo.total })
        + (nuevo.descuadre ? `\n⚠ No cuadra con lo calculado: esperábamos ${nuevo.descuadre.esperado} € y su factura dice ${nuevo.descuadre.recibido} €.` : ''),
        `${exp.numero_expediente}: ha subido su factura de venta del ahorro`);
    return nuevo;
}

const firmanteValido = ({ nombre, dni } = {}) => txt(nombre).length >= 5 && /^[A-Z0-9]{8,10}$/i.test(txt(dni).replace(/[\s.-]/g, ''));

/**
 * Paso 1: ACEPTA EL ACUERDO y, en ese momento, se EXPIDE la factura (número,
 * fecha, PDF). Idempotente: si ya estaba aceptado, no expide otra.
 */
async function aceptarAcuerdo(exp, { nombre, dni, ip = null, ua = null } = {}) {
    const { venta } = await modulos();
    const reg = registroDe(exp);
    if (!esEmpresa(exp) || reg?.modo !== 'autofactura') throw error(409, 'Esta factura no se tramita como autofactura.');
    if (reg.acuerdo?.at && reg.numero) return reg;
    if (!firmanteValido({ nombre, dni })) throw error(400, 'Escribe el nombre completo y el DNI de quien acepta en nombre de la empresa.');
    const c0 = await fichaCliente(exp);
    const cif = txt(c0?.dni).toUpperCase();
    if (enCurso.has(cif || exp.id)) throw error(409, 'Se está expidiendo la factura, un momento.');
    enCurso.add(cif || exp.id);
    try {
        const d = await calcular(exp, { modo: 'autofactura', ivaPct: reg.iva_pct });
        const motivo = bloqueo(exp, d.k);
        if (motivo) throw error(409, 'Ahora mismo no se puede expedir la factura. Te escribiremos en cuanto esté lista.');
        const ahora = new Date().toISOString();
        const acuerdo = {
            at: ahora, nombre: txt(nombre), dni: txt(dni).toUpperCase().replace(/[\s.-]/g, ''), ip, ua: txt(ua).slice(0, 200),
            texto: venta.textoAcuerdo({ razonSocial: d.razon, cif, representante: txt(nombre), dniRepresentante: txt(dni).toUpperCase() }),
        };
        // El acuerdo, sellado ANTES de numerar: es lo que permite expedirla.
        await cobroService.sellar(exp.id, { factura_venta: { ...reg, acuerdo } });
        const anio = Number(hoyMadrid().slice(0, 4));
        const numero = venta.siguienteNumero(await numerosDelCif(cif), anio);
        const fecha = hoyMadrid();
        const nuevo = {
            ...reg, acuerdo, numero, serie: 'AF', fecha, emisor_cif: cif, emisor: d.razon,
            lineas: d.lineas, neto: d.neto, iva: d.iva, total: d.total, iva_pct: d.ivaPct, observaciones: d.observaciones,
            estado: 'PENDIENTE_ACEPTACION', emitida_at: new Date().toISOString(), rechazo: null,
        };
        await cobroService.sellar(exp.id, { factura_venta: nuevo });
        try {
            const buffer = await htmlToPdf(await htmlFactura(exp, { c: c0, ...nuevo, modo: 'autofactura' }));
            const pdf = await guardarEnExpediente(exp, `${limpio(numero)} - VENTA AHORRO CAE (AUTOFACTURA) - ${limpio(d.razon)}.pdf`, buffer);
            await cobroService.sellar(exp.id, { factura_venta: { ...nuevo, pdf } });
            nuevo.pdf = pdf;
        } catch (e) { console.error('[factura venta] PDF:', e.message); }
        await avisarEquipo(venta.avisoEquipoVenta({ accion: 'expedida', expediente: exp.numero_expediente, razonSocial: d.razon, numero, total: d.total }),
            `${exp.numero_expediente}: autofactura ${numero} expedida`);
        return nuevo;
    } finally {
        enCurso.delete(cif || exp.id);
    }
}

/** Paso 2: ACEPTA la factura expedida (o dice qué está mal). */
async function responderFactura(exp, { accion, nombre, dni, motivo, ip = null } = {}) {
    const { venta } = await modulos();
    const reg = registroDe(exp);
    if (!reg?.numero || reg.modo !== 'autofactura') throw error(409, 'Todavía no hay factura que aceptar.');
    if (reg.estado === 'ACEPTADA') return reg;
    if (accion === 'aceptar') {
        if (!firmanteValido({ nombre, dni })) throw error(400, 'Escribe el nombre completo y el DNI de quien acepta en nombre de la empresa.');
        const nuevo = { ...reg, estado: 'ACEPTADA', aceptada_at: new Date().toISOString(), aceptada_por: { nombre: txt(nombre), dni: txt(dni).toUpperCase().replace(/[\s.-]/g, ''), ip }, rechazo: null };
        await cobroService.sellar(exp.id, { factura_venta: nuevo });
        await avisarEquipo(venta.avisoEquipoVenta({ accion: 'aceptada', expediente: exp.numero_expediente, razonSocial: reg.emisor, numero: reg.numero, total: reg.total, firmante: txt(nombre) }),
            `${exp.numero_expediente}: autofactura ${reg.numero} ACEPTADA`);
        return nuevo;
    }
    if (accion === 'rechazar') {
        if (txt(motivo).length < 5) throw error(400, 'Cuéntanos qué está mal para poder corregirlo.');
        const nuevo = { ...reg, estado: 'RECHAZADA', rechazo: { at: new Date().toISOString(), motivo: txt(motivo).slice(0, 1000), nombre: txt(nombre) || null, ip } };
        await cobroService.sellar(exp.id, { factura_venta: nuevo });
        await avisarEquipo(venta.avisoEquipoVenta({ accion: 'rechazada', expediente: exp.numero_expediente, razonSocial: reg.emisor, numero: reg.numero, motivo }),
            `${exp.numero_expediente}: error en la autofactura ${reg.numero}`);
        return nuevo;
    }
    throw error(400, 'Acción no válida');
}

async function avisarEquipo(texto, asunto) {
    const chat = process.env.WHATSAPP_ADMIN_CHAT;
    if (chat) { try { await require('./whatsappService').sendText(chat, texto); } catch (e) { console.warn('[factura venta] aviso WA:', e.message); } }
    if (process.env.ADMIN_EMAIL) {
        try {
            await require('./emailService').sendMail({
                to: process.env.ADMIN_EMAIL, subject: asunto, text: texto,
                html: `<pre style="font-family:Arial,sans-serif;font-size:14px">${texto.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))}</pre>`,
            });
        }
        catch (e) { console.warn('[factura venta] aviso email:', e.message); }
    }
}

// ── Lo que hace el ADMIN en la fase 7 ───────────────────────────────────────

/**
 * REHACER la autofactura con el MISMO número (tras un error señalado o un dato
 * corregido en la ficha): se recalcula, se rehace el PDF y vuelve a pedir la
 * aceptación. Una ACEPTADA no se rehace: eso sería una rectificativa.
 */
async function rehacer(exp, { ivaPct = null, usuario = null } = {}) {
    const reg = registroDe(exp);
    if (!reg?.numero) throw error(409, 'No hay autofactura expedida que rehacer.');
    if (reg.estado === 'ACEPTADA') throw error(409, `La ${reg.numero} ya está aceptada: corregirla sería una factura rectificativa.`);
    if (exp.documentacion?.cobro?.remesa) throw error(409, 'Ya está en una remesa SEPA.');
    const d = await calcular(exp, { modo: 'autofactura', ivaPct: ivaPct ?? reg.iva_pct });
    const nuevo = {
        ...reg, lineas: d.lineas, neto: d.neto, iva: d.iva, total: d.total, iva_pct: d.ivaPct, observaciones: d.observaciones,
        emisor: d.razon, estado: 'PENDIENTE_ACEPTACION', rehecha: [...(reg.rehecha || []), { at: new Date().toISOString(), por: usuario, rechazo: reg.rechazo || null }], rechazo: null,
    };
    const buffer = await htmlToPdf(await htmlFactura(exp, { c: d.c, ...nuevo, modo: 'autofactura' }));
    nuevo.pdf = await guardarEnExpediente(exp, `${limpio(reg.numero)} - VENTA AHORRO CAE (AUTOFACTURA) - ${limpio(d.razon)}.pdf`, buffer);
    await cobroService.sellar(exp.id, { factura_venta: nuevo });
    return nuevo;
}

/** Su FACTURA RECIBIDA (camino «cliente»): el PDF a Drive y lista para pagar. */
async function registrarRecibida(exp, { buffer, mimetype, nombreFichero, numero, total, usuario = null } = {}) {
    if (!esEmpresa(exp)) throw error(409, 'El cliente no es empresa.');
    if (!buffer?.length) throw error(400, 'Falta el PDF de su factura.');
    if (!/pdf/i.test(mimetype || '') && !/\.pdf$/i.test(nombreFichero || '')) throw error(400, 'La factura tiene que ser un PDF.');
    if (exp.documentacion?.cobro?.remesa) throw error(409, 'Ya está en una remesa SEPA.');
    const imp = (await modulos()).venta.leerImporte(total);
    if (!(imp > 0)) throw error(400, 'Indica el TOTAL de su factura (IVA incluido): es lo que se le transfiere.');
    const reg = registroDe(exp) || {};
    const d = await calcular(exp, { modo: 'cliente', ivaPct: reg.iva_pct });
    const pdf = await guardarEnExpediente(exp, `${limpio(numero || 'SIN NUMERO')} - VENTA AHORRO CAE (SU FACTURA) - ${limpio(d.razon)}.pdf`, buffer);
    const nuevo = {
        ...reg, modo: 'cliente', estado: 'RECIBIDA', numero_cliente: txt(numero) || null,
        neto: reg.neto ?? d.neto, iva: reg.iva ?? d.iva, total: r2(imp), iva_pct: reg.iva_pct ?? d.ivaPct,
        // Si no cuadra con lo calculado, se DICE (no se bloquea: manda su factura).
        descuadre: Math.abs(r2(imp) - d.total) >= 0.01 ? { esperado: d.total, recibido: r2(imp) } : null,
        recibida: { ...pdf, numero: txt(numero) || null, por: usuario },
    };
    await cobroService.sellar(exp.id, { factura_venta: nuevo });
    return nuevo;
}

/** «No procede» (entidad sin actividad empresarial): se le paga como a un particular. */
async function marcarNoProcede(exp, { noProcede = true, motivo, usuario = null } = {}) {
    if (exp.documentacion?.cobro?.remesa) throw error(409, 'Ya está en una remesa SEPA.');
    const reg = registroDe(exp) || {};
    if (noProcede) {
        if (txt(motivo).length < 5) throw error(400, 'Di por qué no procede (p. ej. «comunidad de propietarios, sin actividad»).');
        if (reg.numero && reg.estado === 'ACEPTADA') throw error(409, `Ya tiene la autofactura ${reg.numero} aceptada.`);
        await cobroService.sellar(exp.id, { factura_venta: { ...reg, estado_previo: reg.estado || null, estado: 'NO_PROCEDE', no_procede: { at: new Date().toISOString(), por: usuario, motivo: txt(motivo) } } });
    } else {
        await cobroService.sellar(exp.id, { factura_venta: { ...reg, estado: reg.estado_previo || null, no_procede: null } });
    }
    return registroDe(await cobroService.cargarExpediente(exp.id));
}

/** El PDF de la autofactura (o el modelo, si aún no hay número). */
async function pdfDe(exp, { modelo = false } = {}) {
    const reg = registroDe(exp) || {};
    if (reg.modo === 'cliente' && !reg.numero) modelo = true;
    if (!modelo && reg.pdf?.driveId) {
        const buf = await require('./driveService').getFileContent(reg.pdf.driveId).catch(() => null);
        if (buf?.length) return { buffer: buf, filename: reg.pdf.nombre };
    }
    if (!modelo && reg.numero) {
        const c = await fichaCliente(exp);
        return { buffer: await htmlToPdf(await htmlFactura(exp, { c, ...reg, modo: 'autofactura' })), filename: `${reg.numero}.pdf` };
    }
    const d = await calcular(exp, { modo: modelo ? 'cliente' : (reg.modo || 'autofactura'), ivaPct: reg.iva_pct });
    return { buffer: await htmlToPdf(await htmlFactura(exp, { ...d, modo: modelo ? 'cliente' : 'autofactura', modelo: true })), filename: `MODELO - ${exp.numero_expediente}.pdf` };
}

/**
 * Para la REMESA: si el cliente es empresa, qué factura justifica el pago y por
 * cuánto. `{ aplica:false }` para un particular.
 */
function paraRemesa(exp) {
    if (!esEmpresa(exp)) return { aplica: false };
    const reg = registroDe(exp);
    if (!reg) return { aplica: true, lista: false, motivo: 'Empresa: falta su factura de venta del ahorro (pídela en la fase 7)' };
    if (reg.estado === 'NO_PROCEDE') return { aplica: true, lista: true, sinFactura: true };
    if (reg.estado === 'ACEPTADA' || reg.estado === 'RECIBIDA') return { aplica: true, lista: true, total: r2(reg.total), neto: r2(reg.neto), numero: reg.numero || reg.numero_cliente || null };
    const motivos = {
        PEDIDA: reg.modo === 'autofactura' ? 'Empresa: aún no ha aceptado el acuerdo de autofacturación' : 'Empresa: aún no nos ha mandado su factura',
        PENDIENTE_ACEPTACION: `Empresa: la autofactura ${reg.numero} está sin aceptar`,
        RECHAZADA: `Empresa: ha señalado un error en la autofactura ${reg.numero}`,
    };
    return { aplica: true, lista: false, motivo: motivos[reg.estado] || 'Empresa: falta su factura de venta del ahorro' };
}

module.exports = {
    esEmpresa, borrador, pedir, vistaPublica, elegir, alConfirmarCobro, bloqueFormulario, subirFacturaCliente, aceptarAcuerdo, responderFactura, rehacer,
    registrarRecibida, marcarNoProcede, pdfDe, paraRemesa, resumenFila, enlaceVenta,
    _internos: { calcular, bloqueo, numerosDelCif },
};
