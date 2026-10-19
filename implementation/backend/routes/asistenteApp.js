// El asistente de la app (botón flotante). El porqué está en services/asistenteApp.js.
//
// SOLO ADMIN: contesta con datos de toda la cartera (sin el filtro de «lo suyo» que
// necesitaría un partner) y el botón «Encargar» gasta de la suscripción de Fran.
// Abrirlo a TRABAJADOR o a los partners es otro paso, herramienta a herramienta.
const express = require('express');
const { adminOnly } = require('../middleware/auth');
const asistente = require('../services/asistenteApp');

const router = express.Router();

// ─── GET /api/asistente-app/estado — ¿hay clave? qué modelo, qué se puede encargar ──
router.get('/estado', adminOnly, (req, res) => {
    res.json(asistente.configuracion());
});

// ─── POST /api/asistente-app/preguntar — { mensajes: [{ role, content }] } ─────────
// La respuesta va saliendo según se escribe: una línea JSON por evento (NDJSON).
// `no-transform` para que `compression` no la retenga y `X-Accel-Buffering` para nginx.
router.post('/preguntar', adminOnly, async (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    // Si cierra el popup a mitad, se corta la llamada a la API: no se sigue gastando.
    const corte = new AbortController();
    res.on('close', () => { if (!res.writableEnded) corte.abort(); });
    const emitir = (ev) => { if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(ev)}\n`); };
    try {
        await asistente.conversar({ mensajes: req.body?.mensajes, usuario: req.user, emitir, signal: corte.signal });
    } catch (e) {
        console.error('[asistente-app/preguntar]', e);
        emitir({ t: 'error', mensaje: e.message });
    }
    if (!res.writableEnded) res.end();
});

// ─── POST /api/asistente-app/encargo — el botón «Encargar» ─────────────────────────
// { referencia, tarea, detalle }. Se valida otra vez aquí: lo que propuso el modelo
// no se da por bueno solo porque venga del popup.
router.post('/encargo', adminOnly, async (req, res) => {
    try {
        const { referencia, tarea, detalle } = req.body || {};
        const r = await asistente.encargar({ referencia, tarea, detalle, usuario: req.user });
        if (!r.ok) return res.status(r.codigo || 400).json({ ok: false, motivo: r.motivo });
        res.json(r);
    } catch (e) {
        console.error('[asistente-app/encargo]', e);
        res.status(503).json({ ok: false, motivo: `No se ha podido comprobar la referencia (${e.message}).` });
    }
});

module.exports = router;
