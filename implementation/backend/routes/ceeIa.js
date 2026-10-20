// ─── routes/ceeIa.js ─────────────────────────────────────────────────────────
// Generar el CEE inicial con IA desde el botón CE3X (ver services/ceeIa.js).
//
//   GET  /api/cee-ia/:negocio/:id                 en qué está: lo hecho por la IA,
//                                                 el último trabajo y el PC
//   POST /api/cee-ia/:negocio/:id   { rehacer }   lo apunta en la cola del PC
//   POST /api/cee-ia/trabajo/:trabajoId/cancelar
//
// :negocio = cae | cee | op · :id = uuid o clave legible.
//
// staffOnly: cuesta dinero (la API de Claude) y escribe el CEE en Drive y en la
// app. El certificador no lo pide: es Brokergy quien decide generarlo así.

const express = require('express');
const router = express.Router();
const { staffOnly } = require('../middleware/auth');
const ceeIa = require('../services/ceeIa');

const quien = (req) => {
    if (req.user?.esRobot) return 'CLAUDE';
    const p = req.user?.perfilCompleto || {};
    return [p.nombre, p.apellidos].filter(Boolean).join(' ')
        || req.user?.acronimo || req.user?.razon_social || req.user?.email || 'equipo';
};

const responder = (res, err) => {
    if (!err.status || err.status >= 500) console.warn('[cee-ia]', err.message);
    res.status(err.status || 500).json({
        error: err.status ? err.message : 'No se ha podido atender la petición.',
        ...(err.extra || {}),
    });
};

// Declarada ANTES que `/:negocio/:id`, o Express tomaría «trabajo» por un negocio.
router.post('/trabajo/:trabajoId/cancelar', staffOnly, async (req, res) => {
    try { res.json({ trabajo: await ceeIa.cancelar(req.params.trabajoId, quien(req)) }); }
    catch (e) { responder(res, e); }
});

router.get('/:negocio/:id', staffOnly, async (req, res) => {
    try { res.json(await ceeIa.estado(req.params.negocio, req.params.id)); }
    catch (e) { responder(res, e); }
});

router.post('/:negocio/:id', staffOnly, async (req, res) => {
    try {
        const trabajo = await ceeIa.pedir({
            negocio: req.params.negocio, id: req.params.id, usuario: quien(req),
            rehacer: req.body?.rehacer === true,
        });
        res.status(201).json({ trabajo, estado: await ceeIa.estado(req.params.negocio, req.params.id) });
    } catch (e) { responder(res, e); }
});

module.exports = router;
