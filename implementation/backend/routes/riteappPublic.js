// ─── /api/public/riteapp/:token — el instalador COMPLETA la memoria sin cuenta ──
// Regla 245. BROKERGY crea la memoria (desde un CIT del CRM, el MCP o la
// administración) y le manda al instalador `rite.brokergy.es/completar/:token`.
// Ahí rellena lo que sabe él (equipo y nº de serie, estancias, elementos de cada
// radiador, fechas) y la ENVÍA: si no falta nada se genera sola (origen BROKERGY:
// no gasta créditos) y, si es de un CIT, sube al CIT como versión final.
//
// Público POR DISEÑO (está en ROUTERS_PUBLICOS de auditar_rutas_sin_guardian.js):
// el token (32 hex aleatorios, caduca a los 30 días, uno nuevo anula el anterior)
// vale para UNA memoria, y solo se sirven ficheros de ESA memoria (regla 232).
// Límites por IP. Con la BD caída, 503 (regla 38).
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const M = require('../services/riteapp/memorias');
const { limitador, ipDe } = require('../services/certapp/comun');

const router = express.Router();
const limiteLeer = limitador(240, 60 * 60 * 1000);
const limiteEscribir = limitador(400, 60 * 60 * 1000);
const limiteCatastro = limitador(20, 60 * 60 * 1000);
const limiteEnviar = limitador(15, 60 * 60 * 1000);

const corta = (lim, res, req) => {
    if (lim(ipDe(req))) return false;
    res.status(429).json({ error: 'Demasiados intentos seguidos. Espera un rato y vuelve a probar.', code: 'DEMASIADOS_INTENTOS' });
    return true;
};

/** Lo que ve el instalador: la memoria y la empresa que firma. Sin historial ni ids de Drive. */
async function vista(m) {
    const cuenta = await M.cuentaPorId(m.cuenta_id);
    return {
        memoria: {
            id: m.numero, numero: m.numero, nombre: m.nombre, estado: m.estado, datos: m.datos,
            generada_at: m.generada_at, generaciones: m.generaciones, completada_at: m.completada_at,
            enlace_caduca_at: m.enlace_caduca_at, origen: 'BROKERGY', credito_consumido: true,
        },
        empresa: cuenta?.empresa || null,
    };
}

router.get('/:token', async (req, res) => {
    try {
        if (corta(limiteLeer, res, req)) return;
        res.json(await vista(await M.porToken(req.params.token)));
    } catch (e) { return M.responderError(res, e, 'public GET /riteapp/:token'); }
});

router.put('/:token', async (req, res) => {
    try {
        if (corta(limiteEscribir, res, req)) return;
        const m = await M.porToken(req.params.token);
        const g = await M.guardarDatos(m, req.body?.datos || {});
        res.json(await vista(g));
    } catch (e) { return M.responderError(res, e, 'public PUT /riteapp/:token'); }
});

router.get('/:token/comprobar', async (req, res) => {
    try {
        if (corta(limiteLeer, res, req)) return;
        const m = await M.porToken(req.params.token);
        res.json(await M.comprobar(m, await M.cuentaPorId(m.cuenta_id)));
    } catch (e) { return M.responderError(res, e, 'public GET /comprobar'); }
});

router.get('/:token/catastro/:rc', async (req, res) => {
    try {
        if (corta(limiteCatastro, res, req)) return;
        await M.porToken(req.params.token);
        res.json({ vivienda: await M.viviendaDelCatastro(req.params.rc) });
    } catch (e) { return M.responderError(res, e, 'public GET /catastro'); }
});

router.get('/:token/equipos', async (req, res) => {
    try {
        if (corta(limiteLeer, res, req)) return;
        await M.porToken(req.params.token);
        res.json({ equipos: await M.buscarEquipos(req.query.q) });
    } catch (e) { return M.responderError(res, e, 'public GET /equipos'); }
});

// «Enviar a BROKERGY»: queda completada y, si no falta nada, se genera.
router.post('/:token/enviar', async (req, res) => {
    try {
        if (corta(limiteEnviar, res, req)) return;
        const m = await M.porToken(req.params.token);
        const cuenta = await M.cuentaPorId(m.cuenta_id);
        const supabase = require('../services/supabaseClient');
        const ahora = new Date().toISOString();
        const { error } = await supabase.from('riteapp_memorias').update({ completada_at: ahora }).eq('id', m.id);
        if (error) throw M.errorBd(error, 'completar');
        await M.anotar(m, 'COMPLETADA POR EL INSTALADOR (ENLACE)', 'instalador');
        const { faltan } = await M.comprobar(m, cuenta);
        if (faltan.length) return res.json({ ...(await vista({ ...m, completada_at: ahora })), generada: false, faltan });
        const r = await M.generar({ ...m, completada_at: ahora }, cuenta, { origen: 'BROKERGY', por: 'instalador (enlace)' });
        res.json({ ...(await vista(r.memoria)), generada: true, faltan: [] });
    } catch (e) { return M.responderError(res, e, 'public POST /enviar'); }
});

router.get('/:token/documentos', async (req, res) => {
    try {
        if (corta(limiteLeer, res, req)) return;
        res.json(await M.documentos(await M.porToken(req.params.token)));
    } catch (e) { return M.responderError(res, e, 'public GET /documentos'); }
});

router.get('/:token/documentos/:fileId', async (req, res) => {
    try {
        if (corta(limiteLeer, res, req)) return;
        const f = await M.fichero(await M.porToken(req.params.token), String(req.params.fileId));
        res.setHeader('Content-Type', f.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename="${f.nombre.replace(/"/g, '')}"`);
        res.send(f.buffer);
    } catch (e) { return M.responderError(res, e, 'public GET /documentos/:fileId'); }
});

module.exports = router;
