// ─── /api/riteapp-admin — BROKERGY en la app RITE («hazme esta memoria») ───────
// Regla 245. Guardián `staffOClaveInterna`: el equipo desde el CRM, y el MCP
// (`memoria_rite`) y el asistente con la clave interna. Lo de BROKERGY NO gasta
// créditos del instalador y aparece en los Documentos de SU cuenta.
// Las cuentas y los créditos (dar, bloquear), solo ADMIN.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const supabase = require('../services/supabaseClient');
const { staffOClaveInterna, adminOnly } = require('../middleware/auth');
const { olvidarCuenta } = require('../middleware/riteappAuth');
const M = require('../services/riteapp/memorias');
const E = require('../services/riteapp/encargo');

const router = express.Router();
const quien = (req) => req.user?.email || req.user?.nombre || 'BROKERGY';

// «Hazme esta memoria»: crea y, si no falta nada, genera. Ver services/riteapp/encargo.js.
router.post('/memorias', staffOClaveInterna, async (req, res) => {
    try {
        const r = await E.hazMemoria(req.body || {}, { por: quien(req) });
        res.status(201).json({ ok: true, ...r });
    } catch (e) { return M.responderError(res, e, 'admin POST /memorias'); }
});

// Completar lo que faltaba (y volver a generar).
router.put('/memorias/:id', staffOClaveInterna, async (req, res) => {
    try {
        const r = await E.completar(req.params.id, req.body || {}, { por: quien(req), generar: req.body?.generar !== false });
        res.json({ ok: true, ...r });
    } catch (e) { return M.responderError(res, e, 'admin PUT /memorias/:id'); }
});

router.post('/memorias/:id/generar', staffOClaveInterna, async (req, res) => {
    try {
        const m = await M.obtener(req.params.id);
        const cuenta = await M.cuentaPorId(m.cuenta_id);
        const r = await M.generar(m, cuenta, { origen: 'BROKERGY', por: quien(req) });
        res.json({ ok: true, memoria: { id: r.memoria.id, numero: r.memoria.numero, estado: r.memoria.estado }, avisos: r.avisos, documentos: (await M.documentos(r.memoria)).actuales });
    } catch (e) { return M.responderError(res, e, 'admin POST /generar'); }
});

router.get('/memorias', staffOClaveInterna, async (req, res) => {
    try {
        let q = supabase.from('riteapp_memorias').select('id, numero, nombre, estado, cuenta_id, provincia, municipio, generada_at, created_at, riteapp_cuentas(empresa, email)')
            .order('created_at', { ascending: false }).limit(200);
        if (req.query.q) q = q.or(`numero.ilike.%${String(req.query.q).replace(/[%,()]/g, '')}%,nombre.ilike.%${String(req.query.q).replace(/[%,()]/g, '')}%`);
        const { data, error } = await q;
        if (error) throw M.errorBd(error, 'admin listar');
        res.json({ memorias: data || [] });
    } catch (e) { return M.responderError(res, e, 'admin GET /memorias'); }
});

router.get('/memorias/:id', staffOClaveInterna, async (req, res) => {
    try {
        const m = await M.obtener(req.params.id);
        const cuenta = await M.cuentaPorId(m.cuenta_id);
        const [comprobacion, docs] = await Promise.all([M.comprobar(m, cuenta), M.documentos(m)]);
        res.json({ memoria: m, cuenta: M.cuentaPublica(cuenta), ...comprobacion, documentos: docs });
    } catch (e) { return M.responderError(res, e, 'admin GET /memorias/:id'); }
});

router.get('/memorias/:id/documentos/:fileId', staffOClaveInterna, async (req, res) => {
    try {
        const f = await M.fichero(await M.obtener(req.params.id), String(req.params.fileId));
        res.setHeader('Content-Type', f.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `inline; filename="${f.nombre.replace(/"/g, '')}"`);
        res.send(f.buffer);
    } catch (e) { return M.responderError(res, e, 'admin GET /documentos/:fileId'); }
});

// ── Cuentas (solo ADMIN) ─────────────────────────────────────────────────────
router.get('/cuentas', adminOnly, async (req, res) => {
    try {
        const { data, error } = await supabase.from('riteapp_cuentas').select('*').order('created_at', { ascending: false }).limit(500);
        if (error) throw M.errorBd(error, 'cuentas');
        res.json({ cuentas: (data || []).map(M.cuentaPublica) });
    } catch (e) { return M.responderError(res, e, 'admin GET /cuentas'); }
});

router.post('/cuentas/:id/creditos', adminOnly, async (req, res) => {
    try {
        const n = parseInt(req.body?.creditos, 10);
        if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 500) return res.status(400).json({ error: 'Número de memorias no válido.', code: 'CREDITOS_NO_VALIDOS' });
        const c = await M.cuentaPorId(req.params.id);
        const saldo = Math.max(0, (c.creditos || 0) + n);
        const { error } = await supabase.from('riteapp_cuentas').update({ creditos: saldo }).eq('id', c.id);
        if (error) throw M.errorBd(error, 'créditos');
        await supabase.from('riteapp_movimientos').insert({ cuenta_id: c.id, tipo: n > 0 ? 'COMPRA' : 'AJUSTE', creditos: n, saldo_despues: saldo,
            importe_eur: req.body?.importe_eur ?? null, concepto: String(req.body?.concepto || (n > 0 ? 'Memorias añadidas' : 'Ajuste')).slice(0, 200), por: quien(req) });
        olvidarCuenta(c.id);
        res.json({ ok: true, creditos: saldo });
    } catch (e) { return M.responderError(res, e, 'admin POST /creditos'); }
});

router.post('/cuentas/:id/estado', adminOnly, async (req, res) => {
    try {
        const estado = String(req.body?.estado || '').toUpperCase();
        if (!['ACTIVA', 'BLOQUEADA'].includes(estado)) return res.status(400).json({ error: 'Estado no válido.', code: 'ESTADO_NO_VALIDO' });
        const { error } = await supabase.from('riteapp_cuentas').update({ estado }).eq('id', req.params.id);
        if (error) throw M.errorBd(error, 'estado');
        olvidarCuenta(req.params.id);
        res.json({ ok: true, estado });
    } catch (e) { return M.responderError(res, e, 'admin POST /estado'); }
});

module.exports = router;
