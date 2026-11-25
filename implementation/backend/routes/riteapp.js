// ─── /api/riteapp — la API del instalador en la app RITE (rite.brokergy.es) ────
// Regla 245. Guardián `riteappOnly` en cada ruta (salvo /alta, `riteappSesion`):
// una empresa instaladora con cuenta, y cada memoria SOLO de su cuenta (404 si no).
// Generar gasta 1 crédito la PRIMERA vez (volver a generar la misma, no).
// La lógica vive en services/riteapp/memorias.js (la misma que usa BROKERGY).
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const supabase = require('../services/supabaseClient');
const { riteappOnly, riteappSesion, olvidarToken } = require('../middleware/riteappAuth');
const M = require('../services/riteapp/memorias');
const { limitador } = require('../services/certapp/comun');

const router = express.Router();
const limiteAlta = limitador(5, 60 * 60 * 1000);
const limiteCatastro = limitador(30, 60 * 60 * 1000);   // por cuenta: el Catastro no admite ráfagas (regla 17)
const limiteGenerar = limitador(30, 60 * 60 * 1000);
const creditosAlta = () => Math.max(0, parseInt(process.env.RITEAPP_CREDITOS_ALTA ?? '1', 10) || 0);

// ── Alta: con la SESIÓN (Google o enlace al email). El email es el de la sesión. ──
// Si BROKERGY ya le había preparado una cuenta (PENDIENTE, sin usuario), se la queda.
router.post('/alta', riteappSesion, async (req, res) => {
    try {
        const s = req.riteappSesion;
        if (s.cuenta) return res.json({ ok: true, cuenta: M.cuentaPublica(s.cuenta), nueva: false });
        if (!limiteAlta(s.authId)) return res.status(429).json({ error: 'Demasiados intentos seguidos. Prueba dentro de un rato.', code: 'DEMASIADOS_ENVIOS' });
        if (req.body?.acepta_condiciones !== true) return res.status(400).json({ error: 'Para darte de alta tienes que aceptar las condiciones.', code: 'SIN_CONDICIONES' });
        const perfil = M.limpiarPerfil(req.body || {});
        const { data: previa, error: e1 } = await supabase.from('riteapp_cuentas').select('*')
            .ilike('email', s.email).is('auth_user_id', null).maybeSingle();
        if (e1) throw M.errorBd(e1, 'alta');
        let cuenta;
        if (previa) {
            const { data, error } = await supabase.from('riteapp_cuentas').update({ ...perfil, auth_user_id: s.authId, estado: 'ACTIVA' })
                .eq('id', previa.id).select('*').single();
            if (error) throw M.errorBd(error, 'alta (adoptar)');
            cuenta = data;
        } else {
            const creditos = creditosAlta();
            const { data, error } = await supabase.from('riteapp_cuentas')
                .insert({ ...perfil, auth_user_id: s.authId, email: String(s.email).toLowerCase(), estado: 'ACTIVA', creditos })
                .select('*').single();
            if (error) throw M.errorBd(error, 'alta');
            cuenta = data;
            if (creditos) await supabase.from('riteapp_movimientos').insert({ cuenta_id: cuenta.id, tipo: 'ALTA', creditos, saldo_despues: creditos, concepto: 'Bienvenida', por: 'sistema' });
        }
        olvidarToken(s.token);
        return res.status(previa ? 200 : 201).json({ ok: true, cuenta: M.cuentaPublica(cuenta), nueva: !previa });
    } catch (e) { return M.responderError(res, e, 'POST /alta'); }
});

// ── Perfil ───────────────────────────────────────────────────────────────────
router.get('/me', riteappOnly, (req, res) => res.json({ cuenta: M.cuentaPublica(req.riteapp.cuenta) }));

router.put('/me', riteappOnly, async (req, res) => {
    try {
        const cambios = M.limpiarPerfil(req.body || {});
        const { data, error } = await supabase.from('riteapp_cuentas').update({ ...cambios, updated_at: new Date().toISOString() })
            .eq('id', req.riteapp.cuenta.id).select('*').single();
        if (error) throw M.errorBd(error, 'perfil');
        olvidarToken(req.riteapp.token);
        res.json({ cuenta: M.cuentaPublica(data) });
    } catch (e) { return M.responderError(res, e, 'PUT /me'); }
});

// ── Catastro y catálogo ──────────────────────────────────────────────────────
router.get('/catastro/:rc', riteappOnly, async (req, res) => {
    try {
        if (!limiteCatastro(req.riteapp.cuenta.id)) return res.status(429).json({ error: 'Has hecho muchas consultas seguidas. Prueba dentro de un rato.', code: 'DEMASIADAS_CONSULTAS' });
        res.json({ vivienda: await M.viviendaDelCatastro(req.params.rc) });
    } catch (e) { return M.responderError(res, e, 'GET /catastro'); }
});

router.get('/equipos', riteappOnly, async (req, res) => {
    try { res.json({ equipos: await M.buscarEquipos(req.query.q) }); } catch (e) { return M.responderError(res, e, 'GET /equipos'); }
});

router.post('/estancias/propuesta', riteappOnly, async (req, res) => {
    try {
        const b = req.body || {};
        res.json({ estancias: await M.proponerEstancias({ superficie: b.superficie, plantas: b.plantas, modo: b.modo, w_elemento: b.w_elemento, porTipo: b.porTipo || null }) });
    } catch (e) { return M.responderError(res, e, 'POST /estancias/propuesta'); }
});

// ── Memorias ─────────────────────────────────────────────────────────────────
const suya = (req) => M.obtener(req.params.id, req.riteapp.cuenta.id);
const paraInstalador = (m) => ({
    id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, datos: m.datos,
    generada_at: m.generada_at, generaciones: m.generaciones, credito_consumido: m.credito_consumido,
    origen: (m.historial || [])[0]?.por === 'BROKERGY' ? 'BROKERGY' : 'instalador',
    created_at: m.created_at, updated_at: m.updated_at,
});

router.get('/memorias', riteappOnly, async (req, res) => {
    try { res.json({ memorias: await M.listar(req.riteapp.cuenta.id) }); } catch (e) { return M.responderError(res, e, 'GET /memorias'); }
});

router.post('/memorias', riteappOnly, async (req, res) => {
    try { res.status(201).json({ memoria: paraInstalador(await M.crear(req.riteapp.cuenta, req.body?.datos || {})) }); } catch (e) { return M.responderError(res, e, 'POST /memorias'); }
});

router.get('/memorias/:id', riteappOnly, async (req, res) => {
    try { res.json({ memoria: paraInstalador(await suya(req)) }); } catch (e) { return M.responderError(res, e, 'GET /memorias/:id'); }
});

router.put('/memorias/:id', riteappOnly, async (req, res) => {
    try { res.json({ memoria: paraInstalador(await M.guardarDatos(await suya(req), req.body?.datos || {})) }); } catch (e) { return M.responderError(res, e, 'PUT /memorias/:id'); }
});

router.get('/memorias/:id/comprobar', riteappOnly, async (req, res) => {
    try { res.json(await M.comprobar(await suya(req), req.riteapp.cuenta)); } catch (e) { return M.responderError(res, e, 'GET /comprobar'); }
});

router.post('/memorias/:id/generar', riteappOnly, async (req, res) => {
    try {
        if (!limiteGenerar(req.riteapp.cuenta.id)) return res.status(429).json({ error: 'Has generado muchas veces seguidas. Prueba dentro de un rato.', code: 'DEMASIADAS_GENERACIONES' });
        const r = await M.generar(await suya(req), req.riteapp.cuenta, { origen: 'instalador', por: req.riteapp.email });
        const { olvidarCuenta } = require('../middleware/riteappAuth');
        olvidarCuenta(req.riteapp.cuenta.id);   // el saldo ha cambiado
        res.json({ memoria: paraInstalador(r.memoria), avisos: r.avisos, documentos: (await M.documentos(r.memoria)).actuales });
    } catch (e) { return M.responderError(res, e, 'POST /generar'); }
});

router.get('/memorias/:id/documentos', riteappOnly, async (req, res) => {
    try { res.json(await M.documentos(await suya(req))); } catch (e) { return M.responderError(res, e, 'GET /documentos'); }
});

router.get('/memorias/:id/documentos/:fileId', riteappOnly, async (req, res) => {
    try {
        const f = await M.fichero(await suya(req), String(req.params.fileId));
        res.setHeader('Content-Type', f.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename="${f.nombre.replace(/"/g, '')}"`);
        res.send(f.buffer);
    } catch (e) { return M.responderError(res, e, 'GET /documentos/:fileId'); }
});

module.exports = router;
