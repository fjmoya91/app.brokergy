// ─── Tarifas de aerotermia por Excel — solo ADMIN (app del instalador, fase 4) ─
//
//   GET  /api/aerotermia/tarifas/plantilla   → la plantilla .xlsx de ejemplo
//   POST /api/aerotermia/tarifas/leer        → lectura EN SECO: no escribe NADA
//   POST /api/aerotermia/tarifas/confirmar   → guarda lo que se enseñó en seco
//   GET  /api/aerotermia/tarifas/cargas      → las últimas cargas (quién, cuándo, cuántas)
//
// SIEMPRE en dos pasos. El Excel NO se guarda en ningún sitio: «leer» devuelve lo
// que casa, lo que no y lo que cambia, más la huella del fichero y la FIRMA del plan;
// «confirmar» recibe el MISMO fichero, lo vuelve a leer y a casar y solo escribe si
// la firma coincide (si el catálogo o las tarifas han cambiado entretanto, 409).
// Una tarifa nueva es una fila nueva: la anterior se queda (histórico).
// Montado ANTES que routes/aerotermia.js en server.js (si no, `GET /:id` se lo traga).
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-4.md.
const express = require('express');
const multer = require('multer');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { adminOnly } = require('../middleware/auth');
const T = require('../services/catalogoTarifas');

const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: T.MAX_BYTES, files: 1, fields: 10 } });
const unFichero = (req, res, next) => subida.single('fichero')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El Excel pesa más de 5 MB.', code: 'EXCEL_GRANDE' });
    return res.status(400).json({ error: 'No se ha podido leer el envío.', code: 'ENVIO_NO_VALIDO' });
});

class BdCaida extends Error {}
const NO_DISPONIBLE = { error: 'No hemos podido leer el catálogo. Vuelve a intentarlo en unos segundos.', code: 'CATALOGO_UNAVAILABLE' };

async function todo(construir) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {
        const { data, error } = await construir().range(desde, desde + 999);
        if (error) throw new BdCaida(error.message);
        out.push(...(data || []));
        if (!data || data.length < 1000) return out;
    }
}

const leerCatalogo = () => todo(() => supabase.from('aerotermia').select('id, marca, modelo_comercial, modelo_conjunto, modelo_ud_exterior').order('id'));
const leerTarifas = () => todo(() => supabase.from('aerotermia_tarifas').select('aerotermia_id, precio_sin_iva, vigente_desde, cargada_at').order('id'));

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
function datosDelForm(body) {
    const distribuidor = String(body?.distribuidor || '').trim().replace(/\s+/g, ' ');
    const vigente_desde = String(body?.vigente_desde || '').trim();
    if (distribuidor.length < 2 || distribuidor.length > 120) return { error: 'Escribe de qué distribuidor es la tarifa.', code: 'FALTA_DISTRIBUIDOR' };
    if (!FECHA_RE.test(vigente_desde) || Number.isNaN(Date.parse(vigente_desde))) return { error: 'Pon desde qué fecha vale la tarifa.', code: 'FALTA_FECHA' };
    let elecciones = {};
    try { elecciones = body?.elecciones ? JSON.parse(body.elecciones) : {}; } catch { return { error: 'Las elecciones no son válidas.', code: 'ENVIO_NO_VALIDO' }; }
    if (!elecciones || typeof elecciones !== 'object' || Array.isArray(elecciones)) elecciones = {};
    return { distribuidor, vigente_desde, elecciones };
}

/** Lee y casa: lo comparten «leer» y «confirmar», para que confirmen EXACTAMENTE lo mismo. */
async function analizar(req) {
    const f = datosDelForm(req.body);
    if (f.error) return { status: 400, body: { error: f.error, code: f.code } };
    if (!req.file) return { status: 400, body: { error: 'Elige el Excel de la tarifa.', code: 'SIN_FICHERO' } };
    let filas;
    try { filas = await T.leerExcel(req.file.buffer); } catch (e) {
        if (e instanceof T.ErrorExcel) return { status: e.code === 'EXCEL_GRANDE' ? 413 : 400, body: { error: e.message, code: e.code } };
        throw e;
    }
    const [catalogo, tarifas] = await Promise.all([leerCatalogo(), leerTarifas()]);
    const r = T.casar(filas, catalogo, T.vigentes(tarifas), f.elecciones);
    const sha256 = T.sha256(req.file.buffer);
    const fichero = String(req.file.originalname || 'tarifa.xlsx').replace(/[\\/\0]/g, '_').slice(0, 255);
    return { ok: true, f, r, sha256, fichero, firma: T.firmaDelPlan(r.plan, { distribuidor: f.distribuidor, vigente_desde: f.vigente_desde, sha256 }) };
}

router.get('/plantilla', adminOnly, async (req, res) => {
    try {
        const buf = await T.plantilla();
        res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="plantilla-tarifa-aerotermia.xlsx"', 'Cache-Control': 'no-store' });
        res.send(buf);
    } catch (e) { console.error('[tarifas] plantilla:', e.message); res.status(500).json({ error: 'No se ha podido generar la plantilla.' }); }
});

router.post('/leer', adminOnly, unFichero, async (req, res) => {
    try {
        const a = await analizar(req);
        if (!a.ok) return res.status(a.status).json(a.body);
        res.json({ en_seco: true, fichero: a.fichero, sha256: a.sha256, firma: a.firma, distribuidor: a.f.distribuidor, vigente_desde: a.f.vigente_desde, resumen: a.r.resumen, filas: a.r.filas });
    } catch (e) {
        console.error('[tarifas] leer:', e.message);
        res.status(e instanceof BdCaida ? 503 : 500).json(e instanceof BdCaida ? NO_DISPONIBLE : { error: 'No se ha podido leer el Excel.' });
    }
});

router.post('/confirmar', adminOnly, unFichero, async (req, res) => {
    try {
        const a = await analizar(req);
        if (!a.ok) return res.status(a.status).json(a.body);
        if (String(req.body?.firma || '') !== a.firma || String(req.body?.sha256 || '') !== a.sha256) {
            return res.status(409).json({ error: 'El Excel, el catálogo o las tarifas han cambiado desde que lo leíste. Vuelve a leerlo antes de guardar.', code: 'PLAN_CAMBIADO' });
        }
        const { resumen, plan } = a.r;
        if (!plan.length) return res.status(400).json({ error: 'No hay ningún precio nuevo que guardar.', code: 'NADA_QUE_GUARDAR' });
        const quien = req.user?.id_usuario || null;
        const { data: carga, error: eC } = await supabase.from('aerotermia_tarifas_cargas').insert({
            distribuidor: a.f.distribuidor, vigente_desde: a.f.vigente_desde, fichero_nombre: a.fichero, fichero_sha256: a.sha256,
            filas_leidas: resumen.leidas, filas_cargadas: plan.length,
            filas_fuera: resumen.ambiguas + resumen.sin_pareja + resumen.errores + resumen.duplicadas,
            cargada_por: quien,
        }).select('id').single();
        if (eC || !carga?.id) throw new BdCaida(eC?.message || 'sin id de carga');
        // Todas las tarifas en UN insert (una sola sentencia: o entran todas o ninguna).
        const { error: eT } = await supabase.from('aerotermia_tarifas').insert(plan.map((p) => ({
            aerotermia_id: p.aerotermia_id, precio_sin_iva: p.precio, vigente_desde: a.f.vigente_desde, distribuidor: a.f.distribuidor,
            carga_id: carga.id, fila_excel: p.fila, ref_excel: String(p.ref).slice(0, 120), cargada_por: quien,
        })));
        if (eT) {
            await supabase.from('aerotermia_tarifas_cargas').delete().eq('id', carga.id); // la carga sin tarifas no se queda
            throw new BdCaida(eT.message);
        }
        res.json({ ok: true, carga_id: carga.id, guardadas: plan.length, resumen });
    } catch (e) {
        console.error('[tarifas] confirmar:', e.message);
        res.status(e instanceof BdCaida ? 503 : 500).json(e instanceof BdCaida ? { error: 'No se han podido guardar las tarifas. No se ha guardado nada: vuelve a intentarlo.', code: 'TARIFAS_UNAVAILABLE' } : { error: 'No se han podido guardar las tarifas.' });
    }
});

router.get('/cargas', adminOnly, async (req, res) => {
    try {
        const { data, error } = await supabase.from('aerotermia_tarifas_cargas')
            .select('id, distribuidor, vigente_desde, fichero_nombre, filas_leidas, filas_cargadas, filas_fuera, cargada_at')
            .order('cargada_at', { ascending: false }).limit(10);
        if (error) throw new BdCaida(error.message);
        res.json({ cargas: data || [] });
    } catch (e) { res.status(503).json(NO_DISPONIBLE); }
});

module.exports = router;
