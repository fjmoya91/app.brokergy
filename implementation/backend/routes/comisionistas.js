// ─── /api/comisionistas — la PERSONA que trae una obra ───────────────────────
//
// Un comisionista es quien trajo una oportunidad directamente, distinto del
// partner (empresa) del que cuelga. Caso de origen: Juanma, ingeniero de LOS
// SIETE HERMANOS DEL BONILLO, frente a Rufino, comercial de la misma empresa
// (16/11/2026). Es una marca de ATRIBUCIÓN: no cambia el partner, ni a quién
// se avisa, ni el bono. Ver docs/conocimiento/oportunidades/el-comisionista-de-una-oportunidad.md
//
// Quién ve qué (reglas 6 y 102):
//   · todo es del EQUIPO INTERNO (staffOnly): un partner no sabe que existe;
//   · lo pactado (comision_tipo / comision_valor de la persona y el
//     comisionista_importe de cada obra) solo lo ve y lo toca ADMIN.
//
// Tabla y columnas: scripts/comisionistas_schema.sql. Fuente única de la poda
// por rol: utils/comisionista.js.

const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { staffOnly } = require('../middleware/auth');
const {
    esAdmin, capaComisionista, normalizarComisionista, normalizarImporte, CAMPOS_COMISION,
} = require('../utils/comisionista');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_PERSONA = 'id, nombre, tlf, email, cargo, prescriptor_id, comision_tipo, comision_valor, notas, activo, created_at, updated_at';

// Lo de la comisión, fuera para quien no es ADMIN.
const paraRol = (row, req) => {
    if (!row || esAdmin(req)) return row;
    const out = { ...row };
    for (const k of CAMPOS_COMISION) delete out[k];
    return out;
};

// GET /api/comisionistas — todos, con cuántas obras tiene cada uno.
// El conteo sale de una consulta de ESCALARES sobre oportunidades (regla 22).
router.get('/', staffOnly, async (req, res) => {
    try {
        const [{ data, error }, { data: ops, error: opsErr }] = await Promise.all([
            supabase.from('comisionistas').select(SELECT_PERSONA).order('nombre'),
            supabase.from('oportunidades').select('comisionista_id, comisionista_importe').not('comisionista_id', 'is', null),
        ]);
        if (error) return res.status(503).json({ error: 'No hemos podido cargar los comisionistas.', details: error.message });
        if (opsErr) console.warn('[GET /comisionistas] sin conteo de obras:', opsErr.message);

        const cuenta = new Map();
        for (const o of ops || []) {
            const c = cuenta.get(o.comisionista_id) || { obras: 0, importe: 0, sin_importe: 0 };
            c.obras += 1;
            if (o.comisionista_importe == null) c.sin_importe += 1;
            else c.importe += Number(o.comisionista_importe) || 0;
            cuenta.set(o.comisionista_id, c);
        }
        const admin = esAdmin(req);
        res.json((data || []).map(p => {
            const c = cuenta.get(p.id) || { obras: 0, importe: 0, sin_importe: 0 };
            return paraRol({
                ...p,
                obras: c.obras,
                // La suma, solo ADMIN (paraRol la quita al resto, pero no se manda).
                ...(admin ? { importe_total: Math.round(c.importe * 100) / 100, obras_sin_importe: c.sin_importe } : {}),
            }, req);
        }));
    } catch (e) {
        console.error('[GET /comisionistas]', e.message);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// POST /api/comisionistas — alta de una persona.
router.post('/', staffOnly, async (req, res) => {
    try {
        const { fila, error: errValid } = normalizarComisionista(req.body, { admin: esAdmin(req), alta: true });
        if (errValid) return res.status(400).json({ error: errValid });
        const { data, error } = await supabase.from('comisionistas').insert([fila]).select(SELECT_PERSONA).single();
        if (error) return res.status(500).json({ error: 'No se ha podido dar de alta.', details: error.message });
        res.status(201).json(paraRol({ ...data, obras: 0 }, req));
    } catch (e) {
        console.error('[POST /comisionistas]', e.message);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// PATCH /api/comisionistas/:id — editar sus datos (lo pactado, solo ADMIN).
router.patch('/:id', staffOnly, async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'No encontrado.' });
    try {
        const { fila, error: errValid } = normalizarComisionista(req.body, { admin: esAdmin(req), alta: false });
        if (errValid) return res.status(400).json({ error: errValid });
        if (!Object.keys(fila).length) return res.status(400).json({ error: 'Nada que cambiar.' });
        fila.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from('comisionistas').update(fila).eq('id', id).select(SELECT_PERSONA).maybeSingle();
        if (error) return res.status(500).json({ error: 'No se ha podido guardar.', details: error.message });
        if (!data) return res.status(404).json({ error: 'No encontrado.' });
        res.json(paraRol(data, req));
    } catch (e) {
        console.error('[PATCH /comisionistas/:id]', e.message);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// ─── El comisionista de UNA oportunidad ──────────────────────────────────────
// Por nº de oportunidad (26RES060_OP308) o su UUID, como el resto de rutas.
const filtroOportunidad = (q, id) => (UUID_RE.test(id) ? q.eq('id', id) : q.eq('id_oportunidad', id));

// GET /api/comisionistas/oportunidad/:id
router.get('/oportunidad/:id', staffOnly, async (req, res) => {
    try {
        const { data, error } = await filtroOportunidad(
            supabase.from('oportunidades').select('id, id_oportunidad, prescriptor_id, comisionista_id, comisionista_importe'),
            String(req.params.id)
        ).maybeSingle();
        if (error) return res.status(503).json({ error: 'No hemos podido leer la oportunidad.', details: error.message });
        if (!data) return res.status(404).json({ error: 'No encontrada.' });
        res.json(capaComisionista(data, req));
    } catch (e) {
        console.error('[GET /comisionistas/oportunidad/:id]', e.message);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// PUT /api/comisionistas/oportunidad/:id — { comisionista_id, comisionista_importe? }
// `comisionista_id: null` lo quita. El importe solo lo escribe ADMIN; si un
// TRABAJADOR lo manda, se ignora (no tumba el resto). Cambiar de persona NO
// arrastra el importe: si no se manda, se deja vacío para que se vuelva a fijar.
router.put('/oportunidad/:id', staffOnly, async (req, res) => {
    const id = String(req.params.id);
    const body = req.body || {};
    try {
        const { data: op, error: getErr } = await filtroOportunidad(
            supabase.from('oportunidades').select('id, comisionista_id, comisionista_importe'), id
        ).maybeSingle();
        if (getErr) return res.status(503).json({ error: 'No hemos podido leer la oportunidad.', details: getErr.message });
        if (!op) return res.status(404).json({ error: 'No encontrada.' });

        const upd = {};
        if (Object.prototype.hasOwnProperty.call(body, 'comisionista_id')) {
            const cid = body.comisionista_id || null;
            if (cid) {
                if (!UUID_RE.test(String(cid))) return res.status(400).json({ error: 'Comisionista no válido.' });
                const { data: persona } = await supabase.from('comisionistas').select('id').eq('id', cid).maybeSingle();
                if (!persona) return res.status(400).json({ error: 'Ese comisionista no existe.' });
            }
            upd.comisionista_id = cid;
            if (cid !== op.comisionista_id) upd.comisionista_importe = null;
            if (!cid) upd.comisionista_importe = null;
        }
        if (esAdmin(req) && Object.prototype.hasOwnProperty.call(body, 'comisionista_importe')) {
            const { valor, error: errImp } = normalizarImporte(body.comisionista_importe);
            if (errImp) return res.status(400).json({ error: errImp });
            const cidFinal = upd.comisionista_id !== undefined ? upd.comisionista_id : op.comisionista_id;
            upd.comisionista_importe = cidFinal ? valor : null;
        }
        if (!Object.keys(upd).length) return res.status(400).json({ error: 'Nada que cambiar.' });

        const { data, error } = await supabase.from('oportunidades')
            .update(upd).eq('id', op.id)
            .select('id, id_oportunidad, prescriptor_id, comisionista_id, comisionista_importe')
            .single();
        if (error) return res.status(500).json({ error: 'No se ha podido guardar.', details: error.message });
        res.json(capaComisionista(data, req));
    } catch (e) {
        console.error('[PUT /comisionistas/oportunidad/:id]', e.message);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

module.exports = router;
