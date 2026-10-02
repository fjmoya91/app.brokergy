// ─── routes/pvgis.js ─────────────────────────────────────────────────────────
// La producción fotovoltaica de un sitio, de PVGIS (ver services/pvgisService).
//
//   GET /api/pvgis/produccion
//       ?lat=&lon=            o  ?utm_x=&utm_y=[&huso=]   o  ?rc=
//       [&inclinacion=&orientacion=]   sin ellos, los ángulos ÓPTIMOS del sitio
//       [&perdidas=14] [&montaje=free|building]
//   → { anual, mensual[12] (kWh por kWp), inclinacion, orientacion, optimos,
//       lat, lon, elevacion, base_radiacion, anios, fuente, ubicacion:{lat,lon,origen} }
//
// internalOnly: la barra ⚡ del módulo CEE la ve también el CERTIFICADOR, que es
// quien teclea esos kWh y esos kWp en CE3X. No lleva ningún dato de nadie (una
// latitud y una longitud) y PVGIS es gratuito, así que no hace falta atarla a un
// expediente concreto.

const express = require('express');
const router = express.Router();
const { internalOnly } = require('../middleware/auth');
const pvgis = require('../services/pvgisService');

router.get('/produccion', internalOnly, async (req, res) => {
    try {
        const q = req.query || {};
        const ubicacion = await pvgis.resolverUbicacion(q);
        const datos = await pvgis.produccionEspecifica({
            lat: ubicacion.lat, lon: ubicacion.lon,
            inclinacion: q.inclinacion, orientacion: q.orientacion,
            perdidas: q.perdidas, montaje: q.montaje,
        });
        res.json({ ...datos, ubicacion });
    } catch (err) {
        if (!err.status || err.status >= 500) console.warn('[pvgis]', err.message);
        res.status(err.status || 500).json({
            error: err.status ? err.message : 'No se ha podido calcular la producción con PVGIS.',
        });
    }
});

module.exports = router;
