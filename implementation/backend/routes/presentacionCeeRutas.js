// ─── presentacionCeeRutas.js ─────────────────────────────────────────────────
// Encargar la PRESENTACIÓN de un CEE en el Registro a una persona de fuera
// (services/presentacionCeeService.js), montado en LOS DOS negocios:
// `/api/expedientes/:id/presentacion-cee…` y `/api/cee-directos/:id/presentacion-cee…`.
// El módulo CEE es el mismo componente en los dos y llama a `${apiBase}/…` sin
// saber en cuál está: declarado en uno solo, el botón quedaría muerto en el otro.
//
//   GET  /:id/presentacion-cee?fase=          qué se mandaría y a quién
//   POST /:id/presentacion-cee                { fase, email, nombre, nota } → envía
//   POST /:id/presentacion-cee/retirar        { fase } → el enlace deja de valer
//   POST /:id/presentacion-cee/devuelto?fase=&tipo=registro|tasa   (multipart `file`, `quien`)
//        lo que devuelve la sede cuando presenta la CASA (skill presentar-cee): equipo o
//        clave interna. Corre en el servidor que tiene el WhatsApp, así que avisa igual
//        que cuando sube el justificante el certificador o Eva.

const presentacion = require('../services/presentacionCeeService');
const { staffOClaveInterna } = require('../middleware/auth');
const unFichero = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } }).single('file');

const usuarioDe = (req) => req.user?.nombre || req.user?.email || null;

function responderError(res, e, etiqueta, porDefecto) {
    if (!e.status || e.status >= 500) console.error(`[presentacion-cee ${etiqueta}]`, e.message);
    res.status(e.status || 500).json({ error: e.status ? e.message : (e.message || porDefecto) });
}

function montarPresentacionCee(router, origen, { staffOnly }) {
    router.get('/:id/presentacion-cee', staffOnly, async (req, res) => {
        try { res.json(await presentacion.estado(origen, req.params.id, req.query.fase)); }
        catch (e) { responderError(res, e, 'estado', 'No se pudo preparar el encargo'); }
    });

    router.post('/:id/presentacion-cee', staffOnly, async (req, res) => {
        try {
            const { fase, email, nombre, nota } = req.body || {};
            res.json(await presentacion.encargar(origen, req.params.id, fase, { email, nombre, nota, usuario: usuarioDe(req) }));
        } catch (e) { responderError(res, e, 'encargar', 'No se pudo enviar el encargo'); }
    });

    router.post('/:id/presentacion-cee/retirar', staffOnly, async (req, res) => {
        try { res.json(await presentacion.retirar(origen, req.params.id, req.body?.fase, { usuario: usuarioDe(req) })); }
        catch (e) { responderError(res, e, 'retirar', 'No se pudo retirar el encargo'); }
    });

    router.post('/:id/presentacion-cee/devuelto', staffOClaveInterna, unFichero, async (req, res) => {
        try {
            const nombreOriginal = req.file?.originalname ? Buffer.from(req.file.originalname, 'latin1').toString('utf8') : '';
            const quien = req.body?.quien || (req.internalCall ? 'BROKERGY (presentación)' : `${usuarioDe(req) || 'BROKERGY'} (presentación)`);
            res.json(await presentacion.subirDevueltoInterno(origen, req.params.id, req.query.fase || req.body?.fase, {
                tipo: req.query.tipo || req.body?.tipo,
                buffer: req.file?.buffer, mimetype: req.file?.mimetype, nombreOriginal, quien,
                // Lo que presenta la CASA (la skill, con clave interna) avisa solo al
                // cliente y al instalador del CEE inicial (ceeRegistradoAviso).
                avisar: !!req.internalCall,
            }));
        } catch (e) { responderError(res, e, 'devuelto', 'No se pudo subir lo devuelto por la sede'); }
    });
}

module.exports = { montarPresentacionCee };
