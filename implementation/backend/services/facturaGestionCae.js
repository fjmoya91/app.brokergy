// ─── facturaGestionCae.js ────────────────────────────────────────────────────
// FACTURA de los HONORARIOS DE GESTIÓN de la ayuda CAE, desde la fase 7 del lote
// («Pago a los clientes»): al cliente que eligió pagarlos con factura o —cuando él
// lo pide— a su INSTALADOR.
//
// Se emite contra el LIBRO DE FACTURAS de la hoja de AppSheet
// (facturaSheetService): la MISMA serie {YY}ING_{n} que los CEE directos, así que
// esta app tampoco numera aquí — lee la hoja, reserva escribiendo la fila y
// relee. El PDF es el MISMO de la factura de un CEE (buildFacturaCeeHtml, réplica
// de AppSheet) y se guarda en TRES sitios: la carpeta FACTURAS de la hoja,
// contabilidad (ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS / año / mes) y
// «5. FACTURAS» del expediente, con nombre propio para no confundirse con las de
// la OBRA, de las que tira el paquete del S.O.
//
// El registro vive en `documentacion.cobro.factura_gestion` (metadatos, RPC de
// merge, objeto ENTERO: la RPC solo funde el primer nivel de `cobro`).
//
// REGLA — UNA factura por expediente, y emitirla FIJA la forma de pago en
// «factura»: si no, la remesa descontaría además los honorarios del ingreso y se
// le cobrarían dos veces. Con la remesa generada o la gestión regalada, no se
// emite (409).
// REGLA — un número emitido no se tira: si el PDF falla, se rehace con el mismo.
// REGLA — marcarla PAGADA la marca también en la hoja (ESTADO + FECHA DE PAGO) y
// es lo que deja entrar al cliente en la remesa con la ayuda íntegra.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const cobroService = require('./cobroService');
const hoja = require('./facturaSheetService');
const { htmlToPdf } = require('./pdfService');

const error = (status, msg) => Object.assign(new Error(msg), { status });
const txt = (v) => (v == null ? '' : String(v).trim());

let _mods = null;
function modulos() {
    if (!_mods) {
        const url = (p) => pathToFileURL(path.join(__dirname, '../../frontend/src/features', p)).href;
        _mods = Promise.all([
            import(url('lotes/logic/facturaGestion.js')),
            import(url('cee-directo/logic/facturaCee.js')),
            import(url('cobro/logic/cobroForm.js')),
        ]).then(([gestion, cee, cobro]) => ({ gestion, cee, cobro }));
    }
    return _mods;
}

const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());

/** El instalador del expediente: la misma cascada que el aviso a los instaladores. */
async function instaladorDe(exp) {
    let id = exp?.instalacion?.instalador_id || null;
    if (!id) {
        const { data } = await supabase.from('expedientes')
            .select('instalador_asociado_id, oportunidades!oportunidad_id(instalador_asociado_id)')
            .eq('id', exp.id).maybeSingle();
        id = data?.instalador_asociado_id || data?.oportunidades?.instalador_asociado_id || null;
    }
    if (!id) return null;
    const { data: p } = await supabase.from('prescriptores')
        .select('id_empresa, razon_social, acronimo, cif, direccion, codigo_postal, municipio, provincia, ccaa, tlf, email')
        .eq('id_empresa', id).maybeSingle();
    return p || null;
}

/** Los dos a los que se puede facturar, con los datos fiscales de su ficha. */
async function destinatarios(exp) {
    const out = {};
    if (exp.cliente_id) {
        const { data: c } = await supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle();
        if (c) {
            out.cliente = {
                razon_social: `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim().toUpperCase(),
                cif: txt(c.dni).toUpperCase(),
                direccion: txt(c.direccion), cp: txt(c.codigo_postal), municipio: txt(c.municipio),
                provincia: txt(c.provincia), ccaa: txt(c.ccaa), tlf: txt(c.tlf), email: txt(c.email),
                esEmpresa: !!c.es_empresa,
            };
        }
    }
    const p = await instaladorDe(exp);
    if (p) {
        out.instalador = {
            razon_social: txt(p.razon_social).toUpperCase(), cif: txt(p.cif).toUpperCase(),
            direccion: txt(p.direccion), cp: txt(p.codigo_postal), municipio: txt(p.municipio),
            provincia: txt(p.provincia), ccaa: txt(p.ccaa), tlf: txt(p.tlf), email: txt(p.email),
            esEmpresa: true, nombre_corto: txt(p.acronimo) || txt(p.razon_social), id: p.id_empresa,
        };
    }
    return out;
}

/** A quién se le MANDA: al cliente, por su contacto; al instalador, a su COMERCIAL (regla 44). */
async function contactoEnvio(exp, destino, dest) {
    if (destino === 'instalador' && dest.instalador) {
        const { resolverContacto } = require('./seguimientoLote');
        const k = await resolverContacto('INSTALADOR', dest.instalador.id, 'comercial');
        return {
            nombre: k.general ? null : (k.nombre || null), tlf: k.tlf || dest.instalador.tlf || null,
            email: k.email || dest.instalador.email || null, esEmpresa: !!k.general, general: !!k.general,
        };
    }
    const k = cobroService.contactoCliente(exp);
    return { nombre: k.nombre, tlf: k.tlf, email: k.email, esEmpresa: !!exp.clientes?.es_empresa };
}

/** Lo que la factura cuenta del expediente: titular, obra, honorarios y ayuda. */
async function datosExpediente(exp) {
    const { cobro: cf } = await modulos();
    const ctx = await cobroService.contextoDe(exp);
    const honorarios = ctx.clienteAsumeCoste ? cf.bloquePago(ctx.costeGestion).importe_sin_iva : null;
    const c = exp.clientes || {};
    return {
        ctx,
        honorarios,
        titular: cf.nombrePropio(`${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim()) || null,
        obra: cf.direccionObra(exp) || null,
    };
}

/** Por qué NO se puede emitir (o null). */
function bloqueo(exp, d) {
    const cobro = exp.documentacion?.cobro || {};
    if (cobro.factura_gestion?.numero) return `Ya tiene la factura ${cobro.factura_gestion.numero}.`;
    if (cobro.remesa) return 'Ya está en una remesa SEPA: el importe del ingreso ya no se puede cambiar.';
    if (d.ctx.gestionBonificada) return 'La gestión se le ha regalado: no hay nada que facturar.';
    if (!(d.honorarios > 0)) return 'Brokergy asume la gestión de este expediente: no hay honorarios que facturar.';
    return null;
}

// ── Lo que necesita el popup ───────────────────────────────────────────────

async function borrador(exp) {
    const { gestion, cee } = await modulos();
    const d = await datosExpediente(exp);
    const dest = await destinatarios(exp);
    let articulos = [], proximo = null, errorHoja = null;
    try { [articulos, proximo] = await Promise.all([hoja.articulos(), hoja.proximoNumero()]); }
    catch (e) { errorHoja = e.message; }

    const registro = exp.documentacion?.cobro?.factura_gestion?.numero ? exp.documentacion.cobro.factura_gestion : null;
    const lineas = registro ? registro.lineas : (d.honorarios > 0 ? [gestion.lineaGestion(d.honorarios, articulos)] : []);
    const { neto, iva, total } = cee.totalesFactura(lineas);
    // Ya emitida, el mensaje (reenviar) lleva SU número; si no, el que tocaría.
    const numeroMsg = registro?.numero || proximo;
    const porDestino = {};
    for (const k of Object.keys(dest)) {
        const contacto = await contactoEnvio(exp, k, dest);
        porDestino[k] = {
            contacto,
            observaciones: gestion.observacionesGestion({ destino: k, expediente: exp.numero_expediente, titular: d.titular, obra: d.obra }),
            mensaje: gestion.mensajeFacturaGestion({
                destino: k, nombre: contacto.nombre, esEmpresa: contacto.esEmpresa, numero: numeroMsg, total, base: neto,
                expediente: exp.numero_expediente, titular: d.titular, obra: d.obra, bono: d.ctx.bono,
            }),
        };
    }
    return {
        expediente: { id: exp.id, numero: exp.numero_expediente, titular: d.titular, obra: d.obra },
        bloqueo: registro ? null : bloqueo(exp, d),
        destinatarios: dest,
        // Lo normal es facturar a quien la pidió, el cliente; el instalador, cuando lo dice él.
        destinoDefecto: dest.cliente ? 'cliente' : 'instalador',
        porDestino,
        lineas, neto, iva, total,
        fecha: hoyMadrid(),
        vencimientoDias: gestion.VENCIMIENTO_DIAS_GESTION,
        proximoNumero: proximo,
        errorHoja,
        registro,
    };
}

// ── Emisión ────────────────────────────────────────────────────────────────

const enCurso = new Set();

async function emitir(exp, body = {}, { usuario = null } = {}) {
    if (enCurso.has(exp.id)) throw error(409, 'Ya se está emitiendo la factura de este expediente');
    enCurso.add(exp.id);
    try {
        const { gestion, cee } = await modulos();
        const d = await datosExpediente(exp);
        const motivo = bloqueo(exp, d);
        if (motivo) throw error(409, motivo);

        const dest = await destinatarios(exp);
        const destino = body.destino === 'instalador' ? 'instalador' : 'cliente';
        if (!dest[destino]) throw error(400, destino === 'instalador' ? 'El expediente no tiene instalador asignado.' : 'El expediente no tiene cliente.');
        const receptor = { ...dest[destino], ...(body.receptor || {}) };
        if (!txt(receptor.razon_social)) throw error(400, 'Falta el nombre o la razón social a quien se factura.');
        if (!txt(receptor.cif)) throw error(400, 'Falta el NIF/CIF a quien se factura: una factura no puede salir sin él.');

        let articulos = [];
        try { articulos = await hoja.articulos(); } catch { /* respaldo del módulo */ }
        const { lineas, neto, iva, descuento, total } = cee.totalesFactura([gestion.lineaGestion(d.honorarios, articulos)]);
        const fechaIso = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha || '') ? body.fecha : hoyMadrid();
        const vencimientoIso = cee.sumarDias(fechaIso, gestion.VENCIMIENTO_DIAS_GESTION);
        const observaciones = body.observaciones != null ? txt(body.observaciones)
            : gestion.observacionesGestion({ destino, expediente: exp.numero_expediente, titular: d.titular, obra: d.obra });

        // 1 · El número: la fila en la hoja ES la reserva.
        const emit = await hoja.emitir({
            expediente: exp.numero_expediente, cliente: receptor, fechaIso, vencimientoIso,
            lineas, totales: { neto, iva, descuento, total }, observaciones, estado: 'ENVIADA',
        });

        const registro = {
            numero: emit.numero, sheet_id: emit.id, destino, receptor,
            fecha: fechaIso, vencimiento: vencimientoIso, observaciones,
            lineas: lineas.map(l => ({ articulo_id: l.articulo_id, descripcion: l.descripcion, uds: l.uds, precio: l.precio, dtoPct: l.dtoPct, ivaPct: l.ivaPct })),
            neto, iva, total, estado: 'ENVIADA', pagada_at: null,
            emitida_at: new Date().toISOString(), emitida_por: usuario, pdf: null, envios: [],
        };
        // Se registra ANTES del PDF (un número emitido no se tira) y fija la forma
        // de pago: con factura, la remesa no descuenta nada.
        const cobro = exp.documentacion?.cobro || {};
        await cobroService.sellar(exp.id, {
            factura_gestion: registro,
            respuestas: { ...(cobro.respuestas || {}), forma_pago: 'factura' },
        });

        let pdf = null, errorPdf = null;
        try { pdf = await generarPdf(exp, registro); }
        catch (e) { errorPdf = e.message; console.error('[factura gestión] PDF:', e.message); }
        return { numero: emit.numero, total, destino, receptor: receptor.razon_social, pdf, errorPdf, clienteCreadoEnHoja: emit.clienteCreado };
    } finally {
        enCurso.delete(exp.id);
    }
}

async function generarPdf(exp, reg) {
    const { cee } = await modulos();
    const html = cee.buildFacturaCeeHtml({
        numero: reg.numero, fecha: cee.isoAEs(reg.fecha), vencimiento: cee.isoAEs(reg.vencimiento),
        cliente: reg.receptor, lineas: reg.lineas, expediente: exp.numero_expediente, observaciones: reg.observaciones,
    });
    const buffer = await htmlToPdf(html);
    // 1 · Carpeta FACTURAS del libro de AppSheet (de ahí la abre su app). Si esto
    // falla, falla el PDF: es la copia que manda.
    const g = await hoja.guardarPdf({ id: reg.sheet_id, numero: reg.numero, razonSocial: reg.receptor.razon_social, buffer });
    // 2 y 3 · Contabilidad y el expediente: best-effort, cada una dice si falló.
    const contabilidad = await copiaContabilidad(reg, buffer, g.nombre);
    const expediente = await copiaExpediente(exp, reg, buffer);
    const pdf = { driveId: g.driveId, link: g.link, nombre: g.nombre, at: new Date().toISOString(), contabilidad, expediente };
    await cobroService.sellar(exp.id, { factura_gestion: { ...reg, pdf } });
    return { ...pdf, buffer };
}

/**
 * Copia en CONTABILIDAD: «ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS / {año} /
 * {n. MES}», con el MISMO nombre que en AppSheet. No la de «CAE - SERVICIOS CAE»:
 * esa es SOLO para las facturas a los Sujetos Obligados (decisión del usuario,
 * 2026-10-19). El mes es el de la FECHA DE LA FACTURA.
 */
async function copiaContabilidad(reg, buffer, nombre) {
    try {
        const { archivarFacturaIngenieria } = require('./facturaContabilidad');
        const r = await archivarFacturaIngenieria({ pdf: buffer, fecha: reg.fecha, fileName: nombre });
        return { id: r.id, link: r.link, ruta: r.ruta, nombre: r.fileName };
    } catch (e) {
        console.warn('[factura gestión] contabilidad:', e.message);
        return { error: e.message };
    }
}

/**
 * Copia en «5. FACTURAS» del expediente (tolerante a «5.FACTURAS»). Con nombre
 * PROPIO, que dice que son los honorarios de Brokergy: esa carpeta es la de las
 * facturas de la OBRA y el paquete del S.O. tira de las que se llaman «… - facturas».
 * La misma factura rehecha sustituye a la anterior (mismo nombre).
 */
async function copiaExpediente(exp, reg, buffer) {
    try {
        const driveService = require('./driveService');
        const { SUBCARPETA_FACTURAS } = require('./reformaUploadService');
        const dc = exp.oportunidades?.datos_calculo || {};
        const raiz = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        if (!raiz) return { error: 'El expediente no tiene carpeta de Drive' };
        const carpeta = await driveService.getOrCreateSubfolderNormalized(raiz, SUBCARPETA_FACTURAS);
        if (!carpeta || carpeta === raiz) return { error: `No se pudo abrir «${SUBCARPETA_FACTURAS}» del expediente` };
        const limpio = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '-').trim();
        const nombre = `${limpio(reg.numero)} - HONORARIOS GESTION CAE BROKERGY - ${limpio(reg.receptor.razon_social)}.pdf`;
        const previos = await driveService.findFilesByName(carpeta, nombre).catch(() => []);
        const saved = await driveService.saveFileToFolder(carpeta, nombre, 'application/pdf', buffer);
        if (!saved?.id) return { error: 'Drive no devolvió el fichero guardado' };
        for (const id of previos || []) if (id !== saved.id) await driveService.deleteFile(id).catch(() => {});
        return { id: saved.id, link: saved.link, nombre };
    } catch (e) {
        console.warn('[factura gestión] copia en el expediente:', e.message);
        return { error: e.message };
    }
}

function registroDe(exp) {
    const reg = exp.documentacion?.cobro?.factura_gestion;
    if (!reg?.numero) throw error(404, 'Este expediente no tiene factura de gestión');
    return reg;
}

/** El PDF; si no está archivado (o no baja), se rehace con el MISMO número. */
async function pdfDe(exp) {
    const driveService = require('./driveService');
    const reg = registroDe(exp);
    let buffer = reg.pdf?.driveId ? await driveService.getFileContent(reg.pdf.driveId).catch(() => null) : null;
    if (!buffer?.length) buffer = (await generarPdf(exp, reg)).buffer;
    if (!buffer?.length) throw error(502, 'No se ha podido obtener el PDF de la factura');
    return { buffer, filename: reg.pdf?.nombre || hoja.nombrePdf(reg.numero, reg.receptor.razon_social), reg };
}

// ── Envío ──────────────────────────────────────────────────────────────────

async function enviar(exp, { canales = [], email, tlf, mensaje, usuario = null } = {}) {
    const quiereEmail = canales.includes('email') && txt(email);
    const quiereWa = canales.includes('whatsapp') && txt(tlf);
    if (!quiereEmail && !quiereWa) throw error(400, 'No hay ningún canal con destinatario');
    const { gestion } = await modulos();
    const { buffer, filename, reg } = await pdfDe(exp);
    let texto = txt(mensaje);
    if (!texto) {
        const d = await datosExpediente(exp);
        const contacto = await contactoEnvio(exp, reg.destino, await destinatarios(exp));
        texto = gestion.mensajeFacturaGestion({
            destino: reg.destino, nombre: contacto.nombre, esEmpresa: contacto.esEmpresa, numero: reg.numero, total: reg.total,
            base: reg.neto, expediente: exp.numero_expediente, titular: d.titular, obra: d.obra, bono: d.ctx.bono,
        });
    }
    const emailService = require('./emailService');
    const whatsappService = require('./whatsappService');
    const resultados = {};
    if (quiereEmail) {
        try {
            await emailService.sendDocumentEmail({
                to: txt(email), subject: `Factura ${reg.numero} · Gestión ayuda CAE`, title: `Factura ${reg.numero}`,
                message: texto, attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
                pill: { tone: 'info', text: `Factura ${reg.numero}`, emoji: '🧾' },
            });
            resultados.email = { ok: true, to: txt(email) };
        } catch (e) { resultados.email = { ok: false, error: e.message }; }
    }
    if (quiereWa) {
        try {
            await whatsappService.sendMedia(txt(tlf),
                { base64: buffer.toString('base64'), filename, mimetype: 'application/pdf' },
                { caption: texto, asDocument: true });
            resultados.whatsapp = { ok: true, to: txt(tlf) };
        } catch (e) { resultados.whatsapp = { ok: false, error: e.message }; }
    }
    const canalesOk = Object.entries(resultados).filter(([, r]) => r.ok).map(([k]) => k);
    if (canalesOk.length) {
        const fresco = (await cobroService.cargarExpediente(exp.id))?.documentacion?.cobro?.factura_gestion || reg;
        const envio = { at: new Date().toISOString(), canales: canalesOk, email: quiereEmail ? txt(email) : null, tlf: quiereWa ? txt(tlf) : null, usuario };
        await cobroService.sellar(exp.id, { factura_gestion: { ...fresco, envios: [...(fresco.envios || []), envio] } });
    }
    return { numero: reg.numero, resultados, canalesOk };
}

// ── Cobro de la factura ────────────────────────────────────────────────────

/** Marca la factura PAGADA (o la devuelve a ENVIADA), aquí y en la hoja. */
async function marcarPagada(exp, pagada, { usuario = null } = {}) {
    const reg = registroDe(exp);
    if (!pagada && exp.documentacion?.cobro?.remesa) throw error(409, 'Ya está en una remesa SEPA: no se puede desmarcar.');
    const at = new Date().toISOString();
    await hoja.actualizar(reg.sheet_id, {
        'ESTADO': pagada ? 'PAGADA' : 'ENVIADA',
        'FECHA DE PAGO': pagada ? hoja.fechaHoja(at) : '',
    });
    await cobroService.sellar(exp.id, {
        factura_gestion: { ...reg, estado: pagada ? 'PAGADA' : 'ENVIADA', pagada_at: pagada ? at : null, pagada_por: pagada ? usuario : null },
    });
    return { numero: reg.numero, estado: pagada ? 'PAGADA' : 'ENVIADA' };
}

module.exports = { borrador, emitir, enviar, pdfDe, marcarPagada, destinatarios, _internos: { bloqueo, datosExpediente } };
