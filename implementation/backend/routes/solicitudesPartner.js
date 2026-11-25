// ─── /api/solicitudes-partner — varios INSTALADORES piden la misma obra ──────
//
// La oportunidad es UNA (misma vivienda, mismo CEE, mismo ahorro) y sigue
// colgando de su `prescriptor_id`. Aquí se lleva, aparte, quién más la ha
// pedido, en qué orden y con qué presupuesto, y qué versión de la propuesta se
// ha mandado para cada uno. Caso de origen: 26RES060_OP360 (25/11/2026).
//
// Todo `staffOnly`: a un partner no se le dice que otro instalador ha pedido la
// misma obra. Lógica pura en utils/solicitudesPartner.js.

const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { staffOnly } = require('../middleware/auth');
const { norm, listaConImplicito, versionesPorPartner } = require('../utils/solicitudesPartner');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = 'id, oportunidad_id, prescriptor_id, orden, recibida_at, presupuesto, presupuesto_estimado, presupuesto_ref, nota, creado_por, created_at';

// El mismo criterio que routes/oportunidades.js para firmar el historial.
const nombreUsuario = (req) => req.user
    ? (req.user.esRobot ? 'CLAUDE' : req.user.rol_nombre === 'ADMIN' ? 'ADMINISTRADOR' : (req.user.acronimo || req.user.razon_social || 'EQUIPO'))
    : 'Sistema';

// Escalares de la oportunidad + lo justo de `datos_calculo` (nunca el JSONB entero).
async function cargarOportunidad(id) {
    const col = UUID_RE.test(id) ? 'id' : 'id_oportunidad';
    const { data, error } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, prescriptor_id, created_at, presupuesto:datos_calculo->presupuesto, estimado:datos_calculo->presupuestoEstimado, versiones:datos_calculo->propuesta_versiones')
        .eq(col, id)
        .maybeSingle();
    if (error) throw error;
    return data || null;
}

async function nombresDe(ids) {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (!unicos.length) return {};
    const { data, error } = await supabase
        .from('prescriptores')
        .select('id_empresa, acronimo, razon_social, tipo_empresa')
        .in('id_empresa', unicos);
    if (error) throw error;
    const out = {};
    for (const p of data || []) out[norm(p.id_empresa)] = p;
    return out;
}

async function filasDe(oportunidadId) {
    const { data, error } = await supabase
        .from('oportunidad_solicitudes').select(SELECT)
        .eq('oportunidad_id', oportunidadId).order('orden', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function anotar(oportunidadUuid, texto, usuario) {
    const { data } = await supabase
        .from('oportunidades').select('datos_calculo').eq('id', oportunidadUuid).maybeSingle();
    const dc = data?.datos_calculo || {};
    const hist = Array.isArray(dc.historial) ? dc.historial : [];
    hist.push({ id: `${Date.now()}_solicitud_partner`, tipo: 'comentario', texto, fecha: new Date().toISOString(), usuario: usuario || 'Sistema' });
    await supabase.from('oportunidades').update({ datos_calculo: { ...dc, historial: hist } }).eq('id', oportunidadUuid);
}

async function respuesta(op) {
    const filas = await filasDe(op.id);
    const lista = listaConImplicito(filas, {
        prescriptorIdOp: op.prescriptor_id,
        creadaAt: op.created_at,
        presupuestoOp: op.presupuesto,
        estimadoOp: op.estimado === true,
    });
    const nombres = await nombresDe(lista.map(s => s.prescriptor_id));
    const porPartner = versionesPorPartner(Array.isArray(op.versiones) ? op.versiones : [], op.prescriptor_id);
    return {
        oportunidad: op.id_oportunidad,
        prescriptor_id: norm(op.prescriptor_id),
        solicitudes: lista.map(s => {
            const p = nombres[norm(s.prescriptor_id)] || {};
            return {
                ...s,
                prescriptor_id: norm(s.prescriptor_id),
                presupuesto: s.presupuesto == null ? null : Number(s.presupuesto),
                nombre: p.acronimo || p.razon_social || 'Instalador',
                razon_social: p.razon_social || null,
                tipo_empresa: p.tipo_empresa || null,
                versiones: porPartner[norm(s.prescriptor_id)] || [],
            };
        }),
    };
}

// GET /api/solicitudes-partner/instaladores — para elegir quién más la pide.
// Ligero a propósito: `/api/prescriptores` trae los logos (8 MB, regla 73).
router.get('/instaladores', staffOnly, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('prescriptores')
            .select('id_empresa, acronimo, razon_social, tipo_empresa')
            .order('razon_social', { ascending: true });
        if (error) throw error;
        const fuera = ['SUJETO_OBLIGADO', 'VERIFICADOR', 'CERTIFICADOR'];
        res.json((data || []).filter(p => !fuera.includes(String(p.tipo_empresa || '').toUpperCase())).map(p => ({ id: norm(p.id_empresa), nombre: p.acronimo || p.razon_social, razon_social: p.razon_social, tipo_empresa: p.tipo_empresa })));
    } catch (e) {
        console.error('[GET /solicitudes-partner/instaladores]', e.message);
        res.status(503).json({ error: 'No se pudo leer la lista de instaladores.' });
    }
});

// GET /api/solicitudes-partner/oportunidad/:id — la lista en orden, con las versiones de cada uno.
router.get('/oportunidad/:id', staffOnly, async (req, res) => {
    try {
        const op = await cargarOportunidad(req.params.id);
        if (!op) return res.status(404).json({ error: 'Oportunidad no encontrada.' });
        res.json(await respuesta(op));
    } catch (e) {
        console.error('[GET /solicitudes-partner/oportunidad/:id]', e.message);
        res.status(503).json({ error: 'No se pudo leer quién ha pedido esta obra.' });
    }
});

const importe = (v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = typeof v === 'string' ? parseFloat(v.replace(/\./g, '').replace(',', '.')) : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
};
const texto = (v, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null);
const fecha = (v) => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

// POST /api/solicitudes-partner/oportunidad/:id — otro instalador ha pedido esta obra.
// La primera vez se guarda también el 1º (el partner de la oportunidad, con su
// presupuesto de hoy), para que el orden quede escrito y no deducido.
router.post('/oportunidad/:id', staffOnly, async (req, res) => {
    try {
        const op = await cargarOportunidad(req.params.id);
        if (!op) return res.status(404).json({ error: 'Oportunidad no encontrada.' });
        const pid = norm(req.body?.prescriptor_id);
        if (!pid || !UUID_RE.test(pid)) return res.status(400).json({ error: 'Falta el instalador.' });

        const filas = await filasDe(op.id);
        const usuario = nombreUsuario(req);
        if (!filas.length && op.prescriptor_id) {
            if (norm(op.prescriptor_id) === pid) return res.status(409).json({ error: 'Ese instalador ya es el que trajo la obra.' });
            const { error } = await supabase.from('oportunidad_solicitudes').insert({
                oportunidad_id: op.id,
                prescriptor_id: norm(op.prescriptor_id),
                orden: 1,
                recibida_at: op.created_at,
                presupuesto: importe(op.presupuesto) ?? null,
                presupuesto_estimado: op.estimado === true,
                creado_por: usuario,
            });
            if (error) throw error;
            filas.push({ prescriptor_id: norm(op.prescriptor_id), orden: 1 });
        }
        if (filas.some(f => norm(f.prescriptor_id) === pid)) {
            return res.status(409).json({ error: 'Ese instalador ya está en la lista.' });
        }
        const orden = Math.max(0, ...filas.map(f => f.orden || 0)) + 1;
        const { error } = await supabase.from('oportunidad_solicitudes').insert({
            oportunidad_id: op.id,
            prescriptor_id: pid,
            orden,
            recibida_at: fecha(req.body?.recibida_at) || new Date().toISOString(),
            presupuesto: importe(req.body?.presupuesto) ?? null,
            presupuesto_estimado: req.body?.presupuesto_estimado === true,
            presupuesto_ref: texto(req.body?.presupuesto_ref, 120),
            nota: texto(req.body?.nota),
            creado_por: usuario,
        });
        if (error) throw error;

        const out = await respuesta(op);
        const nueva = out.solicitudes.find(s => s.prescriptor_id === pid);
        const pres = nueva?.presupuesto != null ? ` · presupuesto ${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(nueva.presupuesto)} €` : '';
        await anotar(op.id, `🤝 La obra la pide también ${nueva?.nombre || 'otro instalador'} (${orden}º)${pres}. El bono CAE es el mismo para todos: solo cambia el presupuesto.`, usuario);
        res.json(out);
    } catch (e) {
        console.error('[POST /solicitudes-partner/oportunidad/:id]', e.message);
        res.status(500).json({ error: 'No se pudo guardar.', message: e.message });
    }
});

// PATCH /api/solicitudes-partner/:solicitudId — su presupuesto, su referencia, la nota o la fecha.
router.patch('/:solicitudId', staffOnly, async (req, res) => {
    try {
        if (!UUID_RE.test(req.params.solicitudId)) return res.status(400).json({ error: 'Id no válido.' });
        const patch = { updated_at: new Date().toISOString() };
        const b = req.body || {};
        const imp = importe(b.presupuesto);
        if (imp !== undefined) patch.presupuesto = imp;
        if (typeof b.presupuesto_estimado === 'boolean') patch.presupuesto_estimado = b.presupuesto_estimado;
        if ('presupuesto_ref' in b) patch.presupuesto_ref = texto(b.presupuesto_ref, 120);
        if ('nota' in b) patch.nota = texto(b.nota);
        const f = fecha(b.recibida_at);
        if (f) patch.recibida_at = f;
        const { data, error } = await supabase.from('oportunidad_solicitudes')
            .update(patch).eq('id', req.params.solicitudId).select('oportunidad_id').maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'No encontrada.' });
        const op = await cargarOportunidad(data.oportunidad_id);
        res.json(await respuesta(op));
    } catch (e) {
        console.error('[PATCH /solicitudes-partner/:id]', e.message);
        res.status(500).json({ error: 'No se pudo guardar.', message: e.message });
    }
});

// DELETE /api/solicitudes-partner/:solicitudId — quitar a uno que no es el 1º.
router.delete('/:solicitudId', staffOnly, async (req, res) => {
    try {
        if (!UUID_RE.test(req.params.solicitudId)) return res.status(400).json({ error: 'Id no válido.' });
        const { data: fila, error: e1 } = await supabase.from('oportunidad_solicitudes')
            .select('oportunidad_id, orden').eq('id', req.params.solicitudId).maybeSingle();
        if (e1) throw e1;
        if (!fila) return res.status(404).json({ error: 'No encontrada.' });
        if (fila.orden === 1) return res.status(409).json({ error: 'El 1º es quien trajo la obra: no se quita.' });
        const { error } = await supabase.from('oportunidad_solicitudes').delete().eq('id', req.params.solicitudId);
        if (error) throw error;
        const op = await cargarOportunidad(fila.oportunidad_id);
        res.json(await respuesta(op));
    } catch (e) {
        console.error('[DELETE /solicitudes-partner/:id]', e.message);
        res.status(500).json({ error: 'No se pudo quitar.', message: e.message });
    }
});

module.exports = router;
