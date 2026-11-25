// ─── /api/riteapp-admin — BROKERGY en la app RITE («hazme esta memoria») ───────
// Regla 245. Guardián `staffOClaveInterna`: el equipo desde el CRM, y el MCP
// (`memoria_rite`) y el asistente con la clave interna. Lo de BROKERGY NO gasta
// créditos del instalador y aparece en los Documentos de SU cuenta.
// Las cuentas y los créditos (dar, bloquear), solo ADMIN.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const supabase = require('../services/supabaseClient');
const { staffOClaveInterna, staffOnly, adminOnly } = require('../middleware/auth');
const { olvidarCuenta } = require('../middleware/riteappAuth');
const M = require('../services/riteapp/memorias');
const E = require('../services/riteapp/encargo');

const router = express.Router();
const quien = (req) => req.user?.email || req.user?.nombre || 'BROKERGY';
const resumenAdmin = (m) => ({
    id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, origen: m.origen, informe_id: m.informe_id,
    generada_at: m.generada_at, generaciones: m.generaciones, credito_consumido: m.credito_consumido,
    completada_at: m.completada_at, enlace_caduca_at: m.enlace_caduca_at, modo: m.datos?.estancias?.modo || 'rapido',
    municipio: m.municipio, created_at: m.created_at, updated_at: m.updated_at,
});

// «Hazme esta memoria»: crea y, si no falta nada, genera. Ver services/riteapp/encargo.js.
router.post('/memorias', staffOClaveInterna, async (req, res) => {
    try {
        const r = await E.hazMemoria(req.body || {}, { por: quien(req) });
        res.status(201).json({ ok: true, ...r });
    } catch (e) { return M.responderError(res, e, 'admin POST /memorias'); }
});

// ¿Quién es? La app RITE lo pregunta para abrir la administración a una sesión del equipo.
router.get('/yo', staffOnly, (req, res) => res.json({ ok: true, rol: req.user?.rol_nombre || null, nombre: req.user?.nombre || req.user?.email || null, esAdmin: req.user?.rol_nombre === 'ADMIN' }));

// El Catastro y el catálogo, para la pantalla de la memoria en la administración.
router.get('/catastro/:rc', staffOClaveInterna, async (req, res) => {
    try { res.json({ vivienda: await M.viviendaDelCatastro(req.params.rc) }); } catch (e) { return M.responderError(res, e, 'admin GET /catastro'); }
});
router.get('/equipos', staffOClaveInterna, async (req, res) => {
    try { res.json({ equipos: await M.buscarEquipos(req.query.q) }); } catch (e) { return M.responderError(res, e, 'admin GET /equipos'); }
});

// La memoria de un CIT del CRM: la crea con lo que el CIT sabe, o devuelve la que ya tiene.
router.post('/desde-informe/:informeId', staffOClaveInterna, async (req, res) => {
    try {
        const r = await E.desdeInforme(req.params.informeId, { por: quien(req), extra: req.body?.extra || {}, generar: req.body?.generar === true });
        res.status(r.existia ? 200 : 201).json({ ok: true, ...r });
    } catch (e) { return M.responderError(res, e, 'admin POST /desde-informe'); }
});

router.get('/por-informe/:informeId', staffOClaveInterna, async (req, res) => {
    try {
        const row = await require('../services/informeService').cargar(req.params.informeId, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'No encontramos ese CIT.', code: 'CIT_NO_ENCONTRADO' });
        const m = await M.porInforme(row.id);
        if (!m) return res.json({ memoria: null, cit: row.numero });
        const cuenta = await M.cuentaPorId(m.cuenta_id);
        const { faltan } = await M.comprobar(m, cuenta);
        res.json({ memoria: resumenAdmin(m), cit: row.numero, faltan, empresa: cuenta?.empresa || null, enlace: m.enlace_token ? { url: `${M.urlApp()}/completar/${m.enlace_token}`, caduca_at: m.enlace_caduca_at } : null, app: `${M.urlApp()}/admin/memoria/${m.id}` });
    } catch (e) { return M.responderError(res, e, 'admin GET /por-informe'); }
});

// El enlace para que el instalador la complete (uno nuevo anula el anterior). NO se envía nada desde aquí.
router.post('/memorias/:id/enlace', staffOClaveInterna, async (req, res) => {
    try {
        let m = await M.obtener(req.params.id);
        const cuenta = await M.cuentaPorId(m.cuenta_id);
        // El modo que se le pide (rápido o con radiadores): se cambia sin tocar las estancias que ya haya.
        const modo = ['rapido', 'extendido'].includes(req.body?.modo) ? req.body.modo : null;
        if (modo && modo !== (m.datos?.estancias?.modo || 'rapido')) m = await M.guardarDatos(m, { estancias: { ...(m.datos?.estancias || {}), modo } });
        const r = await M.crearEnlace(m, { por: quien(req) });
        const extendido = (m.datos?.estancias?.modo || 'rapido') === 'extendido';
        const mensaje = `Hola${cuenta.representante_nombre ? ` ${String(cuenta.representante_nombre).split(' ')[0]}` : ''}, soy de BROKERGY. `
            + `Para preparar la memoria técnica RITE de ${m.nombre || 'la instalación'}${m.municipio ? ` (${m.municipio})` : ''}, `
            + `complétala aquí: el equipo y su nº de serie, las estancias${extendido ? ' y los elementos de radiador de cada una' : ''} y la fecha de las pruebas.\n\n${r.url}\n\n`
            + 'Cuando le des a «Enviar a BROKERGY» la generamos al momento y te quedan aquí los documentos para firmar.';
        res.json({ ok: true, url: r.url, caduca_at: r.caduca_at, mensaje, telefono_instalador: cuenta.telefono ? `···${String(cuenta.telefono).slice(-3)}` : null });
    } catch (e) { return M.responderError(res, e, 'admin POST /enlace'); }
});

// Guardar los datos tal cual (la pantalla de la memoria en la administración). No genera.
router.put('/memorias/:id/datos', staffOClaveInterna, async (req, res) => {
    try {
        const m = await M.guardarDatos(await M.obtener(req.params.id), req.body?.datos || {});
        res.json({ memoria: resumenAdmin(m) });
    } catch (e) { return M.responderError(res, e, 'admin PUT /datos'); }
});

router.get('/memorias/:id/comprobar', staffOClaveInterna, async (req, res) => {
    try {
        const m = await M.obtener(req.params.id);
        res.json(await M.comprobar(m, await M.cuentaPorId(m.cuenta_id)));
    } catch (e) { return M.responderError(res, e, 'admin GET /comprobar'); }
});

router.get('/memorias/:id/documentos', staffOClaveInterna, async (req, res) => {
    try { res.json(await M.documentos(await M.obtener(req.params.id))); } catch (e) { return M.responderError(res, e, 'admin GET /documentos'); }
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
        res.json({ ok: true, memoria: resumenAdmin(r.memoria), avisos: r.avisos, cit: r.cit, documentos: (await M.documentos(r.memoria)).actuales });
    } catch (e) { return M.responderError(res, e, 'admin POST /generar'); }
});

router.get('/memorias', staffOClaveInterna, async (req, res) => {
    try {
        let q = supabase.from('riteapp_memorias').select('id, numero, nombre, estado, origen, informe_id, completada_at, cuenta_id, provincia, municipio, generada_at, created_at, updated_at, riteapp_cuentas(empresa, email)')
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
        const { enlace_token: tk, ...resto } = m;
        res.json({ memoria: { ...resto, origen_txt: m.origen }, cuenta: M.cuentaPublica(cuenta), ...comprobacion, documentos: docs,
            enlace: tk ? { url: `${M.urlApp()}/completar/${tk}`, caduca_at: m.enlace_caduca_at } : null });
    } catch (e) { return M.responderError(res, e, 'admin GET /memorias/:id'); }
});

router.get('/memorias/:id/documentos/:fileId', staffOClaveInterna, async (req, res) => {
    try {
        const f = await M.fichero(await M.obtener(req.params.id), String(req.params.fileId));
        res.setHeader('Content-Type', f.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename="${f.nombre.replace(/"/g, '')}"`);
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
