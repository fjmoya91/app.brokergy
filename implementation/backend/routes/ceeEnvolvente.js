const express = require('express');
const router = express.Router();
const multer = require('multer');
const { internalOnly } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// Envolvente térmica — proxy al microservicio `cee-engine`.
//
// Aquí NO se hace geometría. El motor vive en su propio contenedor Python
// porque lo que hace —GEOS, PROJ y escribir pickles de CE3X— no tiene
// equivalente en Node, igual que el `rite-generator`. Este fichero pone lo que
// el motor no sabe: quién pregunta, de qué expediente y dónde se guarda.
//
// El motor no tiene sesión ni estado: entra un JSON, sale geometría o un .cex.
//
// Acceso: `internalOnly`, no `staffOnly`. El CERTIFICADOR es quien usa esto —es
// su herramienta de trabajo— y con `staffOnly` se quedaba fuera. Los partners
// (PRESCRIPTOR / INSTALADOR / DISTRIBUIDOR) no entran: no es su ámbito.
// ─────────────────────────────────────────────────────────────────────────────

const MOTOR = process.env.CEE_ENGINE_URL || 'http://cee-engine:8080';

// La envolvente de una parcela tarda: son varias peticiones a Catastro EN
// SERIE —nunca en ráfaga, porque al otro lado está el mismo WAF del que
// depende el buscador— más el análisis geométrico.
const ESPERA_ENVOLVENTE_MS = 180_000;
const ESPERA_CEX_MS = 120_000;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

/** Llama al motor y traduce sus fallos a algo que el front pueda enseñar. */
async function alMotor(ruta, cuerpo, ms) {
    const corte = AbortSignal.timeout(ms);
    let r;
    try {
        r = await fetch(`${MOTOR}${ruta}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
            signal: corte,
        });
    } catch (e) {
        // El motor caído no es un 500 nuestro: es que falta un servicio. Se
        // distingue para que en el VPS se sepa qué mirar.
        const err = new Error(
            e.name === 'TimeoutError'
                ? 'El motor de envolvente ha tardado demasiado.'
                : 'El motor de envolvente no responde. ¿Está levantado el contenedor cee-engine?');
        err.status = 503;
        throw err;
    }
    return r;
}

/**
 * POST /api/cee-envolvente/:expedienteId/geometria
 * Body: { referencia_catastral, altura_planta? }
 *
 * De la RC a la envolvente medida y clasificada, más el plan de fotos.
 * La RC sale del expediente si no viene en el cuerpo: cada consulta a Catastro
 * cuesta, y no se pregunta dos veces lo mismo.
 */
router.post('/:expedienteId/geometria', internalOnly, async (req, res) => {
    try {
        const rc = (req.body?.referencia_catastral || '').trim();
        if (!rc) return res.status(400).json({ error: 'Falta la referencia catastral.' });

        const r = await alMotor('/envolvente', {
            referencia_catastral: rc,
            altura_planta: req.body?.altura_planta ?? null,
            offline: req.body?.offline === true,
        }, ESPERA_ENVOLVENTE_MS);

        const datos = await r.json();
        if (!r.ok) {
            // 502 del motor = ha fallado Catastro, no nosotros. Se deja pasar
            // tal cual para que el front no invite a reintentar contra el WAF.
            return res.status(r.status === 502 ? 502 : 400)
                .json({ error: datos?.detail || 'No se pudo construir la envolvente.' });
        }
        res.json(datos);
    } catch (e) {
        console.error('[ceeEnvolvente] geometria:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * POST /api/cee-envolvente/:expedienteId/cex
 * Body: { geometria, datos, nombre? }
 *
 * Devuelve el .cex como descarga. Los avisos —lo que NO es una medida— viajan
 * en cabeceras porque el cuerpo es binario, y son justo lo que el certificador
 * tiene que leer antes de firmar: se reexponen para que el front los enseñe.
 */
router.post('/:expedienteId/cex', internalOnly, async (req, res) => {
    try {
        const { geometria, datos } = req.body || {};
        if (!geometria || !datos) {
            return res.status(400).json({ error: 'Hacen falta `geometria` y `datos`.' });
        }

        const r = await alMotor('/cex', { geometria, datos }, ESPERA_CEX_MS);

        if (!r.ok) {
            const fallo = await r.json().catch(() => ({}));
            // 422 del motor: NO ha escrito el fichero a propósito porque los
            // datos no daban para escribirlo bien. Es una respuesta, no un error.
            return res.status(r.status === 422 ? 422 : 500)
                .json({ error: fallo?.detail || 'No se pudo generar el .cex.' });
        }

        const nombre = limpiarNombre(req.body?.nombre) || 'expediente';
        const crudo = Buffer.from(await r.arrayBuffer());

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition',
            `attachment; filename="${nombre}.cex"`);
        for (const cab of ['X-Cee-Avisos', 'X-Cee-Contraste']) {
            const v = r.headers.get(cab);
            if (v) res.setHeader(cab, v);
        }
        // Sin esto el navegador no ve las cabeceras de aviso y el certificador
        // firma sin enterarse de qué era una medida y qué una hipótesis.
        res.setHeader('Access-Control-Expose-Headers', 'X-Cee-Avisos, X-Cee-Contraste');
        res.send(crudo);
    } catch (e) {
        console.error('[ceeEnvolvente] cex:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * POST /api/cee-envolvente/leer
 * Body multipart: file = un .cex
 *
 * Qué hay dentro de un .cex que sube alguien. El motor lo lee SIN
 * deserializarlo: un .cex es un pickle de Python y `pickle.load()` ejecuta el
 * código que traiga dentro.
 */
router.post('/leer', internalOnly, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún fichero.' });

        const form = new FormData();
        form.append('fichero',
            new Blob([req.file.buffer]), req.file.originalname || 'subido.cex');

        const r = await fetch(`${MOTOR}/leer-cex`, {
            method: 'POST', body: form, signal: AbortSignal.timeout(30_000),
        });
        const datos = await r.json();
        if (!r.ok) return res.status(400).json({ error: datos?.detail || 'No se pudo leer el .cex.' });
        res.json(datos);
    } catch (e) {
        console.error('[ceeEnvolvente] leer:', e.message);
        res.status(503).json({ error: 'El motor de envolvente no responde.' });
    }
});

/** GET /api/cee-envolvente/health — para el deploy y para el panel de admin. */
router.get('/health', internalOnly, async (_req, res) => {
    try {
        const r = await fetch(`${MOTOR}/health`, { signal: AbortSignal.timeout(5_000) });
        res.status(r.ok ? 200 : 503).json(await r.json());
    } catch {
        res.status(503).json({ ok: false, error: 'cee-engine no responde', motor: MOTOR });
    }
});

/** El nombre viaja a una cabecera HTTP: fuera todo lo que la pueda romper. */
function limpiarNombre(n) {
    if (typeof n !== 'string') return null;
    return n.replace(/[^\w\s.\-—·]/g, '').trim().slice(0, 120) || null;
}

module.exports = router;
