// ─── routes/informes.js — /api/informes ─────────────────────────────────────
// Los INFORMES técnicos ({AAAA}INF_{n}) para el EQUIPO. Todo con guardián (regla
// 102): el día a día con `staffOnly`; el dinero (facturar, confirmar el cobro,
// anular, el apartado de facturas) con `adminOnly`; lo que sale a un tercero
// (la entrega) con `staffOClaveInterna`.
// Lo que ve el cliente va aparte, en routes/informesPublic.js (con su token).
// Ver docs/conocimiento/informes/.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { staffOnly, adminOnly, staffOClaveInterna, isAdmin } = require('../middleware/auth');
const svc = require('../services/informeService');
const E = require('../utils/informeEstados');

const quien = (req) => (req.internalCall ? 'AGENTE IA' : (req.user?.nombre || req.user?.email || null));
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } }).single('file');

const responder = (res, err, ctx) => {
    const status = err.status || 500;
    if (status >= 500) console.error(`[informes ${ctx}]`, err.message);
    res.status(status).json({ error: err.message, code: err.code || undefined, ...(err.faltan ? { faltan: err.faltan } : {}), ...(err.problemas ? { problemas: err.problemas } : {}) });
};

/** El informe de la URL, o 404. Lo deja en `req.informe`. */
async function cargarInforme(req, res, next) {
    try {
        const row = await svc.cargar(req.params.id);
        if (!row) return res.status(404).json({ error: 'Informe no encontrado' });
        req.informe = row;
        next();
    } catch (err) { responder(res, err, 'cargar'); }
}

/** Sin importes para quien no es ADMIN (regla 6: importes y margen, solo ADMIN). */
function paraEquipo(row, req) {
    const admin = isAdmin(req);
    const { portal_token, facturas = [], ...resto } = row;
    return {
        ...resto,
        facturas: facturas.map(f => (admin ? f : { id: f.id, numero: f.numero, estado: f.estado, tipo: f.tipo, enviada_at: f.enviada_at })),
        enlace_cliente: svc.enlaceCliente(row),
        linea: E.lineaDe(row),
        tipo_etiqueta: E.tipoDe(row).etiqueta,
        docs_cliente: E.docsCliente(row.tipo, E.lineaDe(row)).map(d => ({ ...d, subido: row.documentacion?.docs_cliente?.[d.id] || null })),
        drive_folder_link: admin ? row.drive_folder_link : null,
    };
}

/** Los tipos, cada uno con su LÍNEA (INF / CIT): elegir el tipo elige la línea y el número. */
router.get('/tipos', staffOnly, (req, res) => {
    res.json(Object.entries(E.TIPOS).map(([id, t]) => ({ id, ...t, linea_etiqueta: E.LINEAS[t.linea].etiqueta, docs: E.docsCliente(id, t.linea) })));
});

router.get('/', staffOnly, async (req, res) => {
    try {
        const filas = await svc.listar();
        res.json(isAdmin(req) ? filas : filas.map(({ drive_folder_link, ...r }) => r));
    } catch (err) { responder(res, err, 'listado'); }
});

router.post('/', staffOnly, async (req, res) => {
    try {
        const creado = await svc.crear(req.body || {}, { usuario: quien(req), usuarioId: req.user?.id_usuario || null });
        res.status(201).json(paraEquipo(await svc.cargar(creado.id), req));
    } catch (err) { responder(res, err, 'crear'); }
});

router.get('/:id', staffOnly, cargarInforme, async (req, res) => {
    try {
        res.json({ ...paraEquipo(req.informe, req), proceso: await svc.proceso(req.informe) });
    } catch (err) { responder(res, err, 'ficha'); }
});

router.put('/:id', staffOnly, cargarInforme, async (req, res) => {
    try {
        await svc.actualizar(req.informe.id, req.body || {}, { usuario: quien(req) });
        const row = await svc.cargar(req.informe.id);
        res.json({ ...paraEquipo(row, req), proceso: await svc.proceso(row) });
    } catch (err) { responder(res, err, 'editar'); }
});

router.post('/:id/anular', adminOnly, cargarInforme, async (req, res) => {
    try { res.json(await svc.anular(req.informe.id, { motivo: req.body?.motivo, usuario: quien(req) })); }
    catch (err) { responder(res, err, 'anular'); }
});

// ── Documentos ──────────────────────────────────────────────────────────────

router.get('/:id/documentos', staffOnly, cargarInforme, async (req, res) => {
    try { res.json(await svc.documentos(req.informe, { conPago: isAdmin(req) })); }
    catch (err) { responder(res, err, 'documentos'); }
});

/** El fichero para el visor. Solo de la carpeta del informe; lo de pago, solo ADMIN. */
router.get('/:id/fichero/:fileId', staffOnly, cargarInforme, async (req, res) => {
    try {
        const f = await svc.fichero(req.informe, req.params.fileId, { conPago: isAdmin(req) });
        res.setHeader('Content-Type', f.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.nombre)}`);
        res.send(f.buffer);
    } catch (err) { responder(res, err, 'fichero'); }
});

/** Sube a su sitio. La CLASE decide carpeta y nombre (`BORRADOR_PDF`, `FINAL_PDF`, `JUSTIFICANTE`…). */
router.post('/:id/subir/:clase', staffOnly, subida, cargarInforme, async (req, res) => {
    try {
        const clase = String(req.params.clase || '').toUpperCase();
        if (!req.file) return res.status(400).json({ error: 'No ha llegado el fichero' });
        // Un PDF firmado FUERA (la memoria RITE se firma con el certificado de
        // representante de la empresa instaladora): pasa por la MISMA
        // comprobación de firma que el de AutoFirma.
        if (clase === 'FIRMADO') {
            const r = await svc.guardarFirmado(req.informe, req.file.buffer, { usuario: quien(req), via: 'subido' });
            return res.json({ estado: r.informe?.estado, firmante: r.firmante, avisos: r.avisos });
        }
        const r = await svc.subir(req.informe, clase, {
            buffer: req.file.buffer, nombre: req.file.originalname, usuario: quien(req), origen: 'equipo', docId: req.body?.docId || null,
        });
        res.json({ fichero: r.fichero, firmaAnulada: r.firmaAnulada, estado: r.informe?.estado });
    } catch (err) { responder(res, err, 'subir'); }
});

// ── Firma ───────────────────────────────────────────────────────────────────

router.get('/:id/para-firmar', staffOnly, cargarInforme, async (req, res) => {
    try { res.json(await svc.paraFirmar(req.informe)); }
    catch (err) { responder(res, err, 'para-firmar'); }
});

/** El PDF que devuelve AutoFirma (base64). Firma rota o ausente → 422 y no se guarda. */
router.post('/:id/firmado', staffOnly, cargarInforme, async (req, res) => {
    try {
        const b64 = String(req.body?.base64 || '').replace(/^data:[^,]+,/, '');
        if (!b64) return res.status(400).json({ error: 'No ha llegado el PDF firmado' });
        const r = await svc.guardarFirmado(req.informe, Buffer.from(b64, 'base64'), { usuario: quien(req) });
        res.json({ estado: r.informe?.estado, firmante: r.firmante, avisos: r.avisos });
    } catch (err) { responder(res, err, 'firmado'); }
});

// ── Factura y cobro (ADMIN) ─────────────────────────────────────────────────

/** Prepara la factura en BORRADOR; se emite y se envía desde su editor, con el texto a la vista. */
router.post('/:id/facturar', adminOnly, cargarInforme, async (req, res) => {
    try {
        res.json(await svc.facturar(req.informe, { usuarioId: req.user?.id_usuario || null, usuarioNombre: quien(req), otraMas: !!req.body?.otraMas }));
    } catch (err) { responder(res, err, 'facturar'); }
});

/** «Confirmar cobro»: un clic. Cobra la factura y lanza la entrega del firmado. */
router.post('/:id/cobro', adminOnly, cargarInforme, async (req, res) => {
    try {
        const pagada = req.body?.pagada !== false;
        const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.fecha || '')) ? req.body.fecha : null;
        res.json(await svc.confirmarCobro(req.informe.id, { pagada, fecha, usuario: quien(req) }));
    } catch (err) { responder(res, err, 'cobro'); }
});

// ── Entrega ─────────────────────────────────────────────────────────────────

/** Lo que saldría: a quién, por dónde, con qué fichero y el texto. No envía nada. */
router.get('/:id/entrega', staffOnly, cargarInforme, async (req, res) => {
    try {
        const st = await svc.estadoEntrega(req.informe, { sinCobro: !!req.query.sinCobro && isAdmin(req) });
        res.json({ ...st, mensaje: svc.mensajeEntrega(req.informe, st.destinatario) });
    } catch (err) { responder(res, err, 'entrega'); }
});

/** La entrega a mano, desde su popup: sale a un tercero (regla 102). Sin cobrar, solo ADMIN. */
router.post('/:id/entrega', staffOClaveInterna, cargarInforme, async (req, res) => {
    try {
        const b = req.body || {};
        if (b.sinCobro && !isAdmin(req) && !req.internalCall) return res.status(403).json({ error: 'Entregar sin cobrar lo decide un ADMIN' });
        const r = await svc.entregar(req.informe.id, {
            manual: true, reenviar: !!b.reenviar, sinCobro: !!b.sinCobro,
            channels: Array.isArray(b.channels) ? b.channels.filter(c => ['email', 'whatsapp'].includes(c)) : null,
            mensaje: typeof b.mensaje === 'string' ? b.mensaje.slice(0, 4000) : null,
            usuario: quien(req) || 'sistema',
        });
        if (!r.enviado) return res.status(r.motivo === 'YA_ENTREGADO' ? 409 : 422).json({ error: textoMotivo(r), ...r });
        res.json(r);
    } catch (err) { responder(res, err, 'entregar'); }
});

function textoMotivo(r) {
    if (r.motivo === 'YA_ENTREGADO') return 'Ya se entregó. Para mandarlo otra vez, «Reenviar».';
    if (r.motivo === 'FALTAN_REQUISITOS') return `Falta: ${(r.faltan || []).join(' · ')}`;
    if (r.motivo === 'ADJUNTO_NO_DESCARGABLE') return 'No se ha podido descargar el PDF firmado de Drive: no se ha enviado nada.';
    if (r.motivo === 'ENVIO_FALLIDO') return `No ha salido por ningún canal: ${(r.errores || []).join(' · ')}`;
    return r.motivo || 'No se ha enviado';
}

module.exports = router;
