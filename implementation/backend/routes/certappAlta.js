// ─── /api/certapp/alta — darse de alta con la sesión de Google ──────────────
// Quien entra con «Continuar con Google» y aún no tiene cuenta contesta el
// formulario de la beta y lo manda aquí, CON su sesión. El email es el de la
// sesión (lo ha comprobado Google), nunca el que venga en el formulario.
// La cuenta nace ACTIVA con CERTAPP_CREDITOS_BETA certificados (1).
//
// Guardián `certappSesion` (una sesión válida, tenga o no cuenta). Montado en
// server.js ANTES de /api/certapp, que exige cuenta en cada ruta.
// Ver docs/conocimiento/certificadores-app/alta-directa-google-y-email.md
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const { certappSesion, olvidarToken } = require('../middleware/certappAuth');
const beta = require('../services/certapp/beta');
const { responderError, cuentaPublica, ipDe, limitador } = require('../services/certapp/comun');

const router = express.Router();
const limiteAlta = limitador(5, 60 * 60 * 1000);   // por usuario de Auth

router.post('/', certappSesion, async (req, res) => {
    try {
        const s = req.certappSesion;
        if (s.cuenta) return res.json({ ok: true, cuenta: cuentaPublica(s.cuenta), nueva: false });
        if (!limiteAlta(s.authId)) return res.status(429).json({ error: 'Demasiados intentos seguidos. Prueba dentro de un rato.', code: 'DEMASIADOS_ENVIOS' });
        const r = await beta.apuntar(req.body || {}, {
            ip: ipDe(req), userAgent: req.headers['user-agent'], sesion: { authId: s.authId, email: s.email },
        });
        // La identidad de este token estaba cacheada «sin cuenta»: que /me la vea ya.
        olvidarToken(s.token);
        return res.status(r.nueva ? 201 : 200).json({ ok: true, cuenta: cuentaPublica(r.cuenta), nueva: !!r.nueva });
    } catch (e) { return responderError(res, e, 'POST /alta'); }
});

module.exports = router;
