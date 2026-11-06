// ─── /api/public/informe — el enlace del CLIENTE de un informe ──────────────
// Sin sesión POR DISEÑO: cada ruta valida el `portal_token` del informe (32 hex,
// aleatorio, único). Lo que se ve: en qué punto está, la documentación que nos
// tiene que pasar, la factura (número y total) y, SOLO cobrado, el PDF firmado.
// Nunca enlaces de Drive, ni el presupuesto, ni otros ficheros.
//   · GET  /:token                       la vista (límite por IP)
//   · POST /:token/documentacion/:docId  sube un documento de su lista (mientras se redacta)
//   · POST /:token/justificante          sube el justificante de pago → aviso al equipo
//                                        (NO cobra: lo confirma una persona con un clic)
//   · GET  /:token/firmado               el PDF firmado, solo cobrado
// La IP de los límites es `X-Real-IP` (certapp/comun.ipDe), nunca X-Forwarded-For.
// Montado en server.js ANTES de /api/public. Ver docs/conocimiento/informes/.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const multer = require('multer');
const svc = require('../services/informeService');
const E = require('../utils/informeEstados');
const driveService = require('../services/driveService');
const { ipDe, limitador } = require('../services/certapp/comun');

const router = express.Router();
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } }).single('file');
const verPorIp = limitador(120, 10 * 60 * 1000);
const subirPorIp = limitador(30, 60 * 60 * 1000);

async function porToken(req, res, next) {
    try {
        if (!verPorIp(ipDe(req))) return res.status(429).json({ error: 'Demasiadas peticiones. Prueba dentro de un rato.' });
        const row = await svc.cargarPorToken(req.params.token);
        // 404 igual para un token mal formado que para uno que no existe.
        if (!row) return res.status(404).json({ error: 'Este enlace no existe o ya no es válido' });
        req.informe = row;
        next();
    } catch (err) {
        console.error('[informe público]', err.message);
        res.status(err.status === 503 ? 503 : 500).json({ error: 'Ahora mismo no podemos abrirlo. Prueba dentro de un rato.' });
    }
}

const limiteSubida = (req, res, next) => (subirPorIp(ipDe(req)) ? next() : res.status(429).json({ error: 'Has subido muchos ficheros seguidos. Prueba dentro de un rato.' }));

const fallo = (res, err) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status >= 500) console.error('[informe público]', err.message);
    res.status(status).json({ error: status >= 500 ? 'No se ha podido guardar. Prueba otra vez.' : err.message });
};

router.get('/:token', porToken, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        res.json(await svc.vistaCliente(req.informe));
    } catch (err) { fallo(res, err); }
});

router.post('/:token/documentacion/:docId', limiteSubida, subida, porToken, async (req, res) => {
    try {
        const row = req.informe;
        const doc = E.docsCliente(row.tipo, E.lineaDe(row)).find(d => d.id === String(req.params.docId || '').toUpperCase());
        if (!doc) return res.status(404).json({ error: 'Ese documento no está en la lista' });
        if (row.firmado_at || row.anulado_at) return res.status(409).json({ error: 'El informe ya está terminado: ya no hace falta subir documentación' });
        if (!req.file) return res.status(400).json({ error: 'No ha llegado el fichero' });
        const nombre = `${doc.id.toLowerCase()}${req.file.originalname?.match(/\.[a-z0-9]{2,5}$/i)?.[0] || ''}`;
        await svc.subir(row, 'DOCUMENTACION', { buffer: req.file.buffer, nombre: `${doc.etiqueta} - ${nombre}`, usuario: 'Cliente (enlace)', origen: 'cliente', docId: doc.id });
        res.json(await svc.vistaCliente(await svc.cargar(row.id)));
    } catch (err) { fallo(res, err); }
});

router.post('/:token/justificante', limiteSubida, subida, porToken, async (req, res) => {
    try {
        const row = req.informe;
        const vista = await svc.vistaCliente(row);
        if (!vista.puedeSubirJustificante) return res.status(409).json({ error: row.cobrado ? 'El pago ya está confirmado' : 'Todavía no hay factura que pagar' });
        if (!req.file) return res.status(400).json({ error: 'No ha llegado el fichero' });
        await svc.subir(row, 'JUSTIFICANTE', { buffer: req.file.buffer, nombre: req.file.originalname, usuario: 'Cliente (enlace)', origen: 'cliente' });
        res.json(await svc.vistaCliente(await svc.cargar(row.id)));
    } catch (err) { fallo(res, err); }
});

/**
 * Lo que se entrega (INF: el PDF firmado vigente; CIT: el certificado oficial):
 * SOLO cobrado (el candado de cobro).
 */
router.get('/:token/firmado', porToken, async (req, res) => {
    try {
        const row = req.informe;
        if (!row.cobrado) return res.status(403).json({ error: 'Se descarga cuando el pago está confirmado' });
        const d = await svc.documentos(row);
        const f = svc.entregable(row, d);
        if (!f) return res.status(404).json({ error: 'Todavía no está listo para descargar' });
        const buffer = await driveService.getFileContent(f.id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Disposition', `${req.query.ver ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.nombre)}`);
        res.send(buffer);
    } catch (err) { fallo(res, err); }
});

module.exports = router;
