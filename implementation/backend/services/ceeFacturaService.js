// ─── ceeFacturaService.js ────────────────────────────────────────────────────
// FACTURA de un CEE directo: se prepara con vista previa, se EMITE contra el
// libro de facturas de la hoja de AppSheet (facturaSheetService: número de la
// serie compartida {YY}ING_{n}), se archiva en PDF y se envía.
//
// Lo que se guarda en el expediente —`documentacion.facturas_emitidas`, un
// objeto por nº de factura— son METADATOS (regla 21): nº, id de la fila de la
// hoja, importes, a quién se facturó, las líneas y el driveId del PDF. Con eso
// el PDF se puede volver a bajar, reenviar o —si falló al generarse— rehacer
// con el MISMO número, sin tocar la hoja.
//
// REGLA — un número emitido no se tira. Si el PDF falla después de reservar el
// número, la factura queda registrada sin PDF y se rehace desde el popup; borrar
// la fila dejaría un hueco en la serie, y la serie de facturas no admite huecos.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const { htmlToPdf } = require('./pdfService');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const driveService = require('./driveService');
const hoja = require('./facturaSheetService');
const svc = require('./ceeDirectoService');

const CAMPO = 'facturas_emitidas';

let _mod = null;
function modulo() {
    if (!_mod) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/cee-directo/logic/facturaCee.js')).href;
        _mod = import(url);
    }
    return _mod;
}

const error = (status, msg) => Object.assign(new Error(msg), { status });
const txt = (v) => (v == null ? '' : String(v).trim());
const nombreDe = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '');

/** Los dos a los que se puede facturar: el titular y el partner que trae el encargo. */
function destinatarios(row) {
    const out = {};
    const c = row.cliente;
    if (c) {
        out.cliente = {
            razon_social: nombreDe(c).toUpperCase(), cif: txt(c.dni).toUpperCase(),
            direccion: txt(c.direccion), cp: txt(c.codigo_postal), municipio: txt(c.municipio),
            provincia: txt(c.provincia), ccaa: txt(c.ccaa), tlf: txt(c.tlf || c.telefono), email: txt(c.email),
            esEmpresa: !!c.es_empresa,
        };
    }
    const p = row.prescriptor;
    if (p) {
        out.partner = {
            razon_social: txt(p.razon_social).toUpperCase(), cif: txt(p.cif).toUpperCase(),
            direccion: txt(p.direccion), cp: txt(p.codigo_postal), municipio: txt(p.municipio),
            provincia: txt(p.provincia), ccaa: txt(p.ccaa), tlf: txt(p.tlf), email: txt(p.email),
            esEmpresa: true,
        };
    }
    return out;
}

/** A quién se le MANDA (el contacto del cliente respeta su desvío de notificaciones). */
function contactoEnvio(row, destino) {
    if (destino === 'partner' && row.prescriptor) {
        return { nombre: txt(row.prescriptor.razon_social), tlf: txt(row.prescriptor.tlf), email: txt(row.prescriptor.email), esEmpresa: true };
    }
    const k = svc.contactoCliente(row.cliente);
    return { nombre: k.nombre, tlf: k.tlf, email: k.email, esEmpresa: !!row.cliente?.es_empresa };
}

function emitidas(row) {
    const e = row.documentacion?.[CAMPO];
    return e && typeof e === 'object' ? Object.values(e).sort((a, b) => String(a.emitida_at).localeCompare(String(b.emitida_at))) : [];
}

// ── Lo que necesita el popup ───────────────────────────────────────────────

async function borrador(id) {
    const row = await svc.cargar(id);
    if (!row) throw error(404, 'Expediente no encontrado');
    const m = await modulo();

    // La hoja se lee aquí para enseñar el número que tocaría y el catálogo; si
    // no responde, el popup sigue sirviendo para ver la factura, pero avisa.
    let articulos = [], proximo = null, errorHoja = null;
    try {
        [articulos, proximo] = await Promise.all([hoja.articulos(), hoja.proximoNumero()]);
    } catch (e) { errorHoja = e.message; }

    return {
        expediente: { id: row.id, numero: row.numero_expediente, alcance: row.alcance, cobrado: row.cobrado },
        destinatarios: destinatarios(row),
        destinoDefecto: row.cliente || !row.prescriptor ? 'cliente' : 'partner',
        contactos: { cliente: contactoEnvio(row, 'cliente'), partner: row.prescriptor ? contactoEnvio(row, 'partner') : null },
        articulos,
        lineas: m.lineasPorDefecto(row, articulos),
        observaciones: m.OBSERVACIONES_FACTURA_CEE,
        vencimientoDias: m.VENCIMIENTO_DIAS,
        proximoNumero: proximo,
        errorHoja,
        emitidas: emitidas(row),
    };
}

// ── Emisión ────────────────────────────────────────────────────────────────

const enCurso = new Set();   // un doble clic no emite dos facturas del mismo expediente

async function emitir(id, body = {}, { usuario = null } = {}) {
    if (enCurso.has(id)) throw error(409, 'Ya se está emitiendo una factura de este expediente');
    enCurso.add(id);
    try {
        const row = await svc.cargar(id);
        if (!row) throw error(404, 'Expediente no encontrado');
        const ya = emitidas(row);
        if (ya.length && body.otraMas !== true) {
            throw error(409, `Este expediente ya tiene la factura ${ya.map(f => f.numero).join(', ')}. Confirma que quieres emitir otra.`);
        }

        const m = await modulo();
        const destino = body.destino === 'partner' ? 'partner' : 'cliente';
        const cli = { ...(destinatarios(row)[destino] || {}), ...(body.cliente || {}) };
        if (!txt(cli.razon_social)) throw error(400, 'Falta el nombre o la razón social a quien se factura');
        if (!txt(cli.cif)) throw error(400, 'Falta el NIF/CIF a quien se factura: una factura no puede salir sin él');

        const { lineas, neto, iva, descuento, total } = m.totalesFactura(Array.isArray(body.lineas) ? body.lineas : []);
        if (!lineas.length || !(total > 0)) throw error(400, 'La factura no tiene importe');
        if (lineas.some(l => !txt(l.descripcion))) throw error(400, 'Hay una línea sin concepto');

        const fechaIso = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : null;
        if (!fechaIso) throw error(400, 'Falta la fecha de la factura');
        const vencimientoIso = /^\d{4}-\d{2}-\d{2}$/.test(body.vencimiento) ? body.vencimiento : m.sumarDias(fechaIso, m.VENCIMIENTO_DIAS);
        const observaciones = body.observaciones != null ? txt(body.observaciones) : m.OBSERVACIONES_FACTURA_CEE;

        // 1 · El número: la fila en la hoja ES la reserva.
        const emit = await hoja.emitir({
            expediente: row.numero_expediente, cliente: cli, fechaIso, vencimientoIso,
            lineas, totales: { neto, iva, descuento, total }, observaciones, estado: row.cobrado ? 'PAGADA' : 'ENVIADA',
        });
        if (row.cobrado) {
            hoja.actualizar(emit.id, { 'FECHA DE PAGO': hoja.fechaHoja(row.cobrado_at || new Date()) })
                .catch(e => console.warn('[factura cee] fecha de pago:', e.message));
        }

        const registro = {
            numero: emit.numero, sheet_id: emit.id, destino, cliente: cli,
            fecha: fechaIso, vencimiento: vencimientoIso, observaciones,
            lineas: lineas.map(l => ({ articulo_id: l.articulo_id, descripcion: l.descripcion, uds: l.uds, precio: l.precio, dtoPct: l.dtoPct, ivaPct: l.ivaPct })),
            neto, iva, descuento, total,
            estado: row.cobrado ? 'PAGADA' : 'ENVIADA',
            emitida_at: new Date().toISOString(), emitida_por: usuario,
            pdf: null, envios: [],
        };
        // Se registra ANTES del PDF: si el PDF falla, el número ya está en la hoja
        // y el expediente tiene que saber que existe (para rehacerlo, no para
        // emitir otro).
        await svc.mergeDoc(row.id, CAMPO, { [emit.numero]: registro });
        await svc.anotarHistorial(row.id, {
            tipo: 'FACTURA', texto: `FACTURA ${emit.numero} EMITIDA (${m.fmtEur(total)}) A ${cli.razon_social}`, usuario
        });

        // 2 · El PDF.
        let pdf = null, errorPdf = null;
        try { pdf = await generarPdf(row, registro); }
        catch (e) { errorPdf = e.message; console.error('[factura cee] PDF:', e.message); }

        return { numero: emit.numero, total, pdf, errorPdf, clienteCreadoEnHoja: emit.clienteCreado };
    } finally {
        enCurso.delete(id);
    }
}

/** Genera el PDF del registro, lo archiva (carpeta FACTURAS de la hoja + la del expediente) y lo anota. */
async function generarPdf(row, reg) {
    const m = await modulo();
    const html = m.buildFacturaCeeHtml({
        numero: reg.numero, fecha: m.isoAEs(reg.fecha), vencimiento: m.isoAEs(reg.vencimiento),
        cliente: reg.cliente, lineas: reg.lineas, expediente: row.numero_expediente, observaciones: reg.observaciones,
    });
    const buffer = await htmlToPdf(html);
    const guardado = await hoja.guardarPdf({ id: reg.sheet_id, numero: reg.numero, razonSocial: reg.cliente.razon_social, buffer });

    // Copia en la carpeta del expediente: no se hace pública (regla de "3.
    // PRESUPUESTO Y FACTURAS": ahí se ven importes).
    let copia = null;
    if (row.drive_folder_id) {
        try {
            const sub = await driveService.findSubfolderByName(row.drive_folder_id, '3. PRESUPUESTO Y FACTURAS');
            if (sub) {
                for (const fid of await driveService.findFilesByName(sub, guardado.nombre)) await driveService.deleteFile(fid);
                const r = await driveService.saveFileToFolder(sub, guardado.nombre, 'application/pdf', buffer);
                copia = r?.id || null;
            }
        } catch (e) { console.warn('[factura cee] copia en el expediente:', e.message); }
    }

    const pdf = { driveId: guardado.driveId, link: guardado.link, nombre: guardado.nombre, copiaId: copia, at: new Date().toISOString() };
    await svc.mergeDoc(row.id, CAMPO, { [reg.numero]: { ...reg, pdf } });
    return pdf;
}

async function registroDe(id, numero) {
    const row = await svc.cargar(id);
    if (!row) throw error(404, 'Expediente no encontrado');
    const reg = row.documentacion?.[CAMPO]?.[numero];
    if (!reg) throw error(404, `La factura ${numero} no es de este expediente`);
    return { row, reg };
}

/** Rehace el PDF de una factura YA emitida (mismo número, sin tocar la hoja). */
async function rehacerPdf(id, numero) {
    const { row, reg } = await registroDe(id, numero);
    return generarPdf(row, reg);
}

/** El PDF archivado; si no está (o no baja), se rehace con el mismo número. */
async function pdfDe(id, numero) {
    const { row, reg } = await registroDe(id, numero);
    let buffer = reg.pdf?.driveId ? await driveService.getFileContent(reg.pdf.driveId) : null;
    if (!buffer?.length) {
        await generarPdf(row, reg);
        const again = await registroDe(id, numero);
        buffer = await driveService.getFileContent(again.reg.pdf.driveId);
    }
    if (!buffer?.length) throw error(502, 'No se ha podido obtener el PDF de la factura');
    return { buffer, filename: reg.pdf?.nombre || hoja.nombrePdf(reg.numero, reg.cliente.razon_social), reg, row };
}

// ── Envío ──────────────────────────────────────────────────────────────────

async function enviar(id, numero, { canales = [], email, tlf, mensaje, usuario = null } = {}) {
    const quiereEmail = canales.includes('email') && txt(email);
    const quiereWa = canales.includes('whatsapp') && txt(tlf);
    if (!quiereEmail && !quiereWa) throw error(400, 'No hay ningún canal con destinatario');

    const m = await modulo();
    const { buffer, filename, reg, row } = await pdfDe(id, numero);
    const contacto = contactoEnvio(row, reg.destino);
    const texto = txt(mensaje) || m.mensajeFactura({
        nombre: contacto.nombre, numero: reg.numero, total: reg.total, expediente: row.numero_expediente, esEmpresa: contacto.esEmpresa
    });

    const resultados = {};
    if (quiereEmail) {
        try {
            await emailService.sendDocumentEmail({
                to: txt(email),
                subject: `Factura ${reg.numero} · ${row.numero_expediente}`,
                title: `Factura ${reg.numero}`,
                message: texto,
                attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
                pill: { tone: 'info', text: `Factura ${reg.numero}`, emoji: '🧾' }
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
        const envio = { at: new Date().toISOString(), canales: canalesOk, email: quiereEmail ? txt(email) : null, tlf: quiereWa ? txt(tlf) : null, usuario };
        await svc.mergeDoc(row.id, CAMPO, { [reg.numero]: { ...reg, envios: [...(reg.envios || []), envio] } });
        await svc.anotarHistorial(row.id, { tipo: 'FACTURA', texto: `FACTURA ${reg.numero} ENVIADA POR ${canalesOk.join(' Y ').toUpperCase()}`, usuario });
    }
    return { resultados, canalesOk };
}

// ── Cobro ──────────────────────────────────────────────────────────────────

/**
 * Marcar el expediente como cobrado marca PAGADAS sus facturas en la hoja (y al
 * revés). Es el mismo hecho: si solo se marcara aquí, el libro de facturas
 * seguiría diciendo que se debe. Best-effort: no puede tumbar el cobro.
 */
async function sincronizarCobro(id, cobrado, cobradoAt) {
    const row = await svc.cargar(id, { conRelaciones: false });
    if (!row) return;
    for (const reg of emitidas(row)) {
        const estado = cobrado ? 'PAGADA' : 'ENVIADA';
        if (reg.estado === estado) continue;
        try {
            await hoja.actualizar(reg.sheet_id, {
                'ESTADO': estado,
                'FECHA DE PAGO': cobrado ? hoja.fechaHoja(cobradoAt || new Date()) : '',
            });
            await svc.mergeDoc(row.id, CAMPO, { [reg.numero]: { ...reg, estado } });
        } catch (e) {
            console.warn(`[factura cee] ${reg.numero} → ${estado}:`, e.message);
        }
    }
}

module.exports = { borrador, emitir, rehacerPdf, pdfDe, enviar, sincronizarCobro, CAMPO };
