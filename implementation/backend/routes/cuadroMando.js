// ─── /api/cuadro-mando — el cuadro de mando de dirección (solo ADMIN) ─────────
//
// GET /negocio            expedientes, captación, lotes con su dinero, CEE directos
// GET /finanzas?anio=     cuenta de resultados (EBITDA), caja, salud y previsión
//
// Las dos aceptan ?forzar=1 para saltarse la caché (5 y 10 min). Con la BD caída
// responden 503, nunca un cuadro a cero (regla 38). La lógica y el porqué de cada
// cifra: services/cuadroDireccion.js y docs/conocimiento/cuadro-mando/.
const express = require('express');
const { adminOClaveInterna } = require('../middleware/auth');
const svc = require('../services/cuadroDireccion');

const router = express.Router();

function enviarError(res, e, que) {
    console.error(`[cuadro-mando ${que}]`, e.message);
    if (e.status === 503) return res.status(503).json({ error: 'La base de datos no responde: el cuadro de mando no se puede calcular ahora.' });
    return res.status(500).json({ error: 'No se pudo calcular el cuadro de mando.' });
}

router.get('/negocio', adminOClaveInterna, async (req, res) => {
    try {
        res.json(await svc.negocio({ forzar: req.query.forzar === '1' }));
    } catch (e) { enviarError(res, e, 'negocio'); }
});

router.get('/finanzas', adminOClaveInterna, async (req, res) => {
    const anio = req.query.anio ? Number(req.query.anio) : undefined;
    if (anio !== undefined && (!Number.isInteger(anio) || anio < 2020 || anio > 2100)) return res.status(400).json({ error: 'Año no válido' });
    try {
        res.json(await svc.finanzas(anio, { forzar: req.query.forzar === '1' }));
    } catch (e) { enviarError(res, e, 'finanzas'); }
});

module.exports = router;
