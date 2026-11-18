// ============================================================================
// /api/public/factura-instalador — la FACTURA DE LA OBRA hecha en la app, en la
// plantilla del instalador, «como su ERP» (Fran, 16/11/2026). Ver
// services/facturaInstaladorService.js y
// docs/conocimiento/instalador-rite/el-consejo-de-factura-al-instalador.md.
//
// PÚBLICA POR DISEÑO (regla 102): la abre el instalador sin sesión, con el
// `upload_token` de la oportunidad, el MISMO del enlace de subida (/subir-docs) y
// de la página del consejo de factura. Sin token o con otro: 403. Lleva el NIF del
// titular, así que el UUID del expediente no basta.
//
//   GET  /:expedienteId?token=            → lo que lleva impreso y lo ya tecleado
//   GET  /:expedienteId/word?token=       → su factura en Word, pre-rellena (sin importes)
//   POST /:expedienteId/vista-previa?token= { numero, fecha, modo, partidas | total, conceptos? } → PDF
//        (cabecera X-Factura-Desborda: 1 si el texto no cabe en la hoja; X-Factura-Numero-Largo: 1
//        si el nº no cabe en su casilla ni encogido)
//   POST /:expedienteId/generar?token=    { …lo mismo, sustituir? } → la guarda
//        en «Facturas» como si la hubiera subido él, y devuelve el PDF (base64).
//        Sustituye a la que ya hizo aquí (aunque estuviera revisada) y, con
//        `sustituir` (la `ref` de `facturas`), a una que subió; `sustituir: 'ninguna'`
//        = es otra factura distinta. Con facturas subidas, decirlo es obligatorio.
//
// Los enlaces de Drive NO se devuelven (solo ADMIN, regla 1).
// ============================================================================

const express = require('express');
const crypto = require('crypto');
const svc = require('../services/facturaInstaladorService');

const router = express.Router();
router.use(express.json({ limit: '64kb' }));

const UUID = /^[0-9a-f-]{36}$/i;
const igual = (a, b) => {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Carga el expediente y comprueba el token. Responde y devuelve null si no vale. */
async function cargar(req, res) {
    const { expedienteId } = req.params;
    const token = String(req.query.token || '');
    if (!token) { res.status(403).json({ error: 'Enlace no válido' }); return null; }
    if (!UUID.test(expedienteId)) { res.status(404).json({ error: 'Expediente no encontrado' }); return null; }
    const ctx = await svc.datosFactura(expedienteId);
    if (!ctx) { res.status(404).json({ error: 'Expediente no encontrado' }); return null; }
    if (!igual(ctx.token, token)) { res.status(403).json({ error: 'Enlace no válido' }); return null; }
    if (!ctx.consejo || !ctx.datos) { res.status(404).json({ error: 'Esta obra no lleva factura recomendada.' }); return null; }
    if (!ctx.plantilla) {
        res.status(404).json({ error: 'Tu plantilla de factura aún no está en la app. Escríbenos y la preparamos.', sinPlantilla: true });
        return null;
    }
    return ctx;
}

const fallo = (res, e, donde) => {
    console.error(`[factura-instalador] ${donde}:`, e);
    // BD caída: 503, nunca una página con pinta de buena (regla 38).
    res.status(e.status === 503 ? 503 : 500).json({ error: 'No hemos podido completar la operación. Inténtalo en un momento.' });
};

router.get('/:expedienteId', async (req, res) => {
    try {
        const ctx = await cargar(req, res);
        if (!ctx) return;
        const g = ctx.generada;
        res.json({
            numero_expediente: ctx.exp.numero_expediente,
            instalador: ctx.instalador?.acronimo || ctx.instalador?.razon_social || null,
            cliente: { nombre: ctx.datos.clienteNombre, domicilio: ctx.datos.clienteDomicilio },
            inmueble: ctx.datos.inmueble,
            refCatastral: ctx.datos.refCatastral,
            observaciones: ctx.datos.observaciones,
            lineas: ctx.lineas.map(l => ({ texto: l.texto })),
            maxLineas: 12,
            ivaPct: Number(ctx.plantilla.cfg.iva_pct ?? 21),
            ejemploNumero: ctx.plantilla.cfg.numero?.ejemplo || null,
            fechaMinima: ctx.fechaMinima,
            otrasFacturas: ctx.otrasFacturas,
            // La que ya hizo aquí: para corregirla, sale con lo que tecleó (y sus conceptos, si los cambió).
            anterior: g ? {
                numero: g.numero_factura || '', fecha: g.fecha_factura || '',
                modo: g.generada?.modo || 'partidas',
                partidas: g.generada?.partidas || [], conceptos: g.generada?.conceptos || null,
                base: g.importe_sin_iva ?? null, total: g.importe_con_iva ?? null,
                validada: g.validada === true, at: g.generada?.at || null,
            } : null,
            // Las que SUBIÓ (no hechas aquí), por si la nueva sustituye a una. Sin enlaces de Drive:
            // una referencia opaca. Las que no tienen fichero no se pueden sustituir.
            facturas: (ctx.subidas || []).filter(f => f.drive_id).map(f => ({
                ref: svc.refFactura(f), numero: f.numero_factura || null, fecha: f.fecha_factura || null,
                base: f.importe_sin_iva ?? null, total: f.importe_con_iva ?? null, validada: f.validada === true,
            })),
        });
    } catch (e) { fallo(res, e, 'GET'); }
});

// Su factura en WORD, pre-rellena (cliente, concepto, inmueble, RC y observaciones;
// número, fecha e importes en blanco para escribirlos). La misma que va adjunta al
// email del concepto (Fran, 18/11/2026): desde la página del consejo, para quien lo
// recibe por WhatsApp. Solo si el instalador tiene su Word en la plantilla.
router.get('/:expedienteId/word', async (req, res) => {
    try {
        const ctx = await cargar(req, res);
        if (!ctx) return;
        if (!ctx.plantilla.word) return res.status(404).json({ error: 'Tu factura en Word aún no está en la app.' });
        const { generarFacturaWord, DOCX_MIME } = require('../services/facturaWordService');
        const r = await generarFacturaWord(ctx.exp.id, ctx.plantilla.word);
        res.set({
            'Content-Type': DOCX_MIME, 'Cache-Control': 'no-store',
            'Content-Disposition': `attachment; filename="factura.docx"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
        });
        res.send(r.buffer);
    } catch (e) { fallo(res, e, 'word'); }
});

router.post('/:expedienteId/vista-previa', async (req, res) => {
    try {
        const ctx = await cargar(req, res);
        if (!ctx) return;
        // La vista previa se pinta aunque falten datos: es para ver cómo va quedando.
        const { calculo } = svc.calcular(req.body || {}, { lineas: ctx.lineas, cfg: ctx.plantilla.cfg, fechaMinima: ctx.fechaMinima });
        const { buffer, desborda, numeroLargo } = await svc.componerPdf(ctx.plantilla, ctx.datos, calculo);
        res.set({
            'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="factura.pdf"',
            'X-Factura-Desborda': desborda ? '1' : '0', 'X-Factura-Numero-Largo': numeroLargo ? '1' : '0',
            'Access-Control-Expose-Headers': 'X-Factura-Desborda, X-Factura-Numero-Largo',
        });
        res.send(buffer);
    } catch (e) { fallo(res, e, 'vista-previa'); }
});

router.post('/:expedienteId/generar', async (req, res) => {
    try {
        const ctx = await cargar(req, res);
        if (!ctx) return;
        // Una revisada también se puede rehacer (Fran, 18/11/2026: «puede darse el caso de
        // errores»): la nueva la sustituye y vuelve a revisión.
        const { errores, calculo } = svc.calcular(req.body || {}, { lineas: ctx.lineas, cfg: ctx.plantilla.cfg, fechaMinima: ctx.fechaMinima });
        const elegibles = (ctx.subidas || []).filter(f => f.drive_id);
        const sust = String(req.body?.sustituir || '');
        if (elegibles.length && !sust) errores.push('Dinos si esta factura sustituye a la que ya subiste o es otra distinta.');
        if (sust && sust !== 'ninguna' && !elegibles.some(f => svc.refFactura(f) === sust)) errores.push('La factura que quieres sustituir ya no está en el expediente. Recarga la página.');
        if (errores.length) return res.status(400).json({ error: errores[0], errores });
        const { buffer, desborda, numeroLargo } = await svc.componerPdf(ctx.plantilla, ctx.datos, calculo);
        if (numeroLargo) return res.status(400).json({ error: 'El número de factura no cabe en su casilla: acórtalo.' });
        if (desborda) return res.status(400).json({ error: 'El texto no cabe en una hoja de la factura: acorta algún concepto o escríbenos y lo ajustamos.' });
        // FACTURA_INSTALADOR_EN_SECO=true (pruebas en local, que escribe en PRODUCCIÓN):
        // se compone y se devuelve igual, pero no se guarda nada.
        const enSeco = process.env.FACTURA_INSTALADOR_EN_SECO === 'true';
        const r = await svc.guardarFactura({ ctx, calculo, buffer, escribir: !enSeco, sustituir: sust && sust !== 'ninguna' ? sust : null });
        res.json({
            ok: true, numero: calculo.numero, fecha: calculo.fecha, base: calculo.base, iva: calculo.iva, total: calculo.total,
            sustituida: r.sustituye.length > 0, sustituidas: r.sustituye.map(f => f.numero).filter(Boolean),
            fileName: r.fileName, pdf: buffer.toString('base64'), ...(enSeco ? { enSeco: true } : {}),
        });
    } catch (e) { fallo(res, e, 'generar'); }
});

module.exports = router;
