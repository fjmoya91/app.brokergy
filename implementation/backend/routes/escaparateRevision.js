// ─── La REVISIÓN de lo que propone el instalador para su página (fase 3) ─────
//
// Montado en /api/escaparate-revision. Lo que el instalador propone desde su app
// («Tu página web») entra PENDIENTE y aquí se APRUEBA o se RECHAZA con su motivo.
//   · Ver la cola: el equipo interno (`staffOnly`).
//   · Aprobar y rechazar: solo ADMIN (`adminOnly`), como hoy «Publicar en el
//     escaparate» del gestor de documentación.
// Aprobar una foto de OBRA es el MISMO camino que ese botón (`publicarFotoDeObra`:
// municipio, fase y par antes/después). Aprobar unos textos los copia a los
// VIGENTES de `prescriptores` (`descripcion_publica`, `especialidades`,
// `zona_trabajo_publica`). Rechazar exige un motivo: el instalador lo lee.
// Avisos al instalador: detrás de ESCAPARATE_AVISOS_ENABLED (apagado; en la fase 3
// no sale ninguno). Ver docs/conocimiento/instalador-app/app-del-instalador-fase-3.md.
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { staffOnly, adminOnly } = require('../middleware/auth');
const esc = require('../services/escaparateService');
const { miniaturaEsc, llaveDeEscaparate } = require('./instaladorApp')._internos;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_DISPONIBLE = { error: 'No hemos podido cargar la cola de revisión. Vuelve a intentarlo.', code: 'REVISION_UNAVAILABLE' };
const MIN_MOTIVO = 5;
const nombreDe = (p) => (p?.acronimo || p?.razon_social || '').trim();
const motivoDe = (body) => String(body?.motivo || '').replace(/\s+/g, ' ').trim().slice(0, 500);
const err = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };

// GET /contador → cuánto hay por revisar y de quién (para el aviso de Partners y el menú).
router.get('/contador', staffOnly, async (req, res) => {
    try {
        const [fotos, textos] = await Promise.all([
            supabase.from('instalador_fotos_escaparate').select('instalador_id').eq('estado', 'PENDIENTE'),
            supabase.from('instalador_textos_escaparate').select('instalador_id').eq('estado', 'PENDIENTE'),
        ]);
        const por = new Map();
        for (const f of err(fotos) || []) { const x = por.get(f.instalador_id) || { fotos: 0, textos: 0 }; x.fotos++; por.set(f.instalador_id, x); }
        for (const t of err(textos) || []) { const x = por.get(t.instalador_id) || { fotos: 0, textos: 0 }; x.textos++; por.set(t.instalador_id, x); }
        const ids = [...por.keys()];
        const presc = ids.length ? err(await supabase.from('prescriptores').select('id_empresa, acronimo, razon_social').in('id_empresa', ids)) : [];
        const nom = new Map(presc.map((p) => [p.id_empresa, nombreDe(p)]));
        const lista = ids.map((id) => ({ id, nombre: nom.get(id) || 'Instalador', ...por.get(id) }))
            .sort((a, b) => (b.fotos + b.textos) - (a.fotos + a.textos));
        res.json({ total: lista.reduce((n, x) => n + x.fotos + x.textos, 0), por_instalador: lista });
    } catch (e) {
        console.error('[escaparate-revision] contador:', e.message);
        res.status(503).json(NO_DISPONIBLE);
    }
});

// GET /instalador/:id → lo pendiente de ese instalador (y lo último resuelto), con miniatura.
router.get('/instalador/:id', staffOnly, async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Instalador no encontrado' });
    try {
        const id = req.params.id;
        const [fotos, textos, presc, pub] = await Promise.all([
            supabase.from('instalador_fotos_escaparate')
                .select('id, origen, estado, motivo_rechazo, fase, actuacion, municipio, titulo_publico, permiso_cliente, permiso_cliente_at, propuesta_at, revisada_at, expediente_id, created_at')
                .eq('instalador_id', id).in('estado', ['PENDIENTE', 'NO_VALE']).order('propuesta_at', { ascending: true }),
            supabase.from('instalador_textos_escaparate').select('id, presentacion, especialidades, pueblos, estado, motivo_rechazo, propuesto_at, revisado_at')
                .eq('instalador_id', id).order('propuesto_at', { ascending: false }).limit(3),
            supabase.from('prescriptores').select('descripcion_publica, especialidades, zona_trabajo_publica').eq('id_empresa', id).maybeSingle(),
            // Las publicadas, para elegir la PORTADA (fase 8), en el orden de la API pública.
            supabase.from('instalador_fotos_escaparate').select('id, estado, consentimiento_cliente, fase, actuacion, municipio, orden, created_at')
                .eq('instalador_id', id).eq('estado', 'PUBLICADA').eq('consentimiento_cliente', true)
                .order('orden', { ascending: true }).order('created_at', { ascending: false }).limit(60),
        ]);
        const fs = err(fotos) || [];
        const publicadas = err(pub) || [];
        const portada = esc.portadaDe(publicadas);
        // El nº de obra solo lo ve el equipo interno, aquí, para saber de dónde sale la foto.
        const expIds = [...new Set(fs.map((f) => f.expediente_id).filter(Boolean))];
        const exps = expIds.length ? err(await supabase.from('expedientes').select('id, numero_expediente').in('id', expIds)) : [];
        const numDe = new Map(exps.map((e) => [e.id, e.numero_expediente]));
        const l = llaveDeEscaparate(id);
        const ts = err(textos) || [];
        const p = err(presc) || {};
        res.json({
            fotos: fs.map((f) => ({
                id: f.id, origen: f.origen, estado: f.estado, motivo: f.motivo_rechazo, fase: f.fase, actuacion: f.actuacion,
                municipio: f.municipio, titulo_publico: f.titulo_publico, permiso_cliente: !!f.permiso_cliente, permiso_cliente_at: f.permiso_cliente_at,
                propuesta_at: f.propuesta_at || f.created_at, revisada_at: f.revisada_at,
                obra: f.expediente_id ? numDe.get(f.expediente_id) || null : null, miniatura: miniaturaEsc(f.id, l),
            })),
            publicadas: publicadas.map((f) => ({
                id: f.id, fase: f.fase, actuacion: f.actuacion, municipio: f.municipio, miniatura: miniaturaEsc(f.id, l),
                portada: portada && portada.id === f.id ? (portada.elegida ? 'elegida' : 'automatica') : null,
            })),
            textos_pendientes: ts.filter((t) => t.estado === 'PENDIENTE'),
            textos_ultimo: ts.find((t) => t.estado !== 'PENDIENTE') || null,
            textos_vigentes: { presentacion: p.descripcion_publica || '', especialidades: p.especialidades || [], pueblos: p.zona_trabajo_publica || [] },
        });
    } catch (e) {
        console.error('[escaparate-revision] instalador:', e.message);
        res.status(503).json(NO_DISPONIBLE);
    }
});

// PUT /instalador/:id/portada { fotoId } → cambia la PORTADA de su página (fase 8).
// La elige el instalador desde su app; el equipo la puede cambiar aquí. `null` = la
// automática. Solo ADMIN, como aprobar.
router.put('/instalador/:id/portada', adminOnly, async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Instalador no encontrado' });
    try {
        const fotoId = req.body?.fotoId == null || req.body.fotoId === '' ? null : String(req.body.fotoId);
        const r = await esc.ponerPortada(req.params.id, fotoId);
        if (r.error) return res.status(r.status || 400).json({ error: r.error, code: r.code });
        res.json(r);
    } catch (e) {
        console.error('[escaparate-revision] portada:', e.message);
        res.status(503).json({ error: 'No se ha podido cambiar la portada. Vuelve a intentarlo.' });
    }
});

async function fotoPendiente(id) {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await supabase.from('instalador_fotos_escaparate')
        .select('id, instalador_id, expediente_id, drive_id, slot, origen, estado, municipio, actuacion').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
}

// POST /fotos/:id/aprobar { titulo_publico?, municipio? } → PUBLICADA.
router.post('/fotos/:id/aprobar', adminOnly, async (req, res) => {
    try {
        const f = await fotoPendiente(req.params.id);
        if (!f) return res.status(404).json({ error: 'Foto no encontrada' });
        const titulo_publico = String(req.body?.titulo_publico || '').trim().slice(0, 120) || null;
        if (titulo_publico && esc.textoProhibido(titulo_publico)) return res.status(400).json({ error: esc.textoProhibido(titulo_publico).msg, code: esc.textoProhibido(titulo_publico).code });
        let municipio = String(req.body?.municipio || '').replace(/\s+/g, ' ').trim().slice(0, 100) || f.municipio || null;
        if (municipio && !/^[\p{L}][\p{L}\s'’().\-]*$/u.test(municipio)) return res.status(400).json({ error: 'El municipio solo lleva su nombre.', code: 'PUEBLO_NO_VALIDO' });
        if (f.origen === 'OBRA') {
            // El camino del botón «Publicar en el escaparate»: fase, actuación y par
            // antes/después. El instalador de la foto es el de la fila (su empresa la instala).
            const { data: exp, error } = await supabase.from('expedientes').select('id, oportunidad_id').eq('id', f.expediente_id).maybeSingle();
            if (error) throw new Error(error.message);
            if (!exp) return res.status(404).json({ error: 'La obra de esta foto ya no existe.' });
            const r = await esc.publicarFotoDeObra({
                opp: { id: exp.oportunidad_id }, slot: f.slot, driveId: f.drive_id, titulo_publico, actuacion: f.actuacion,
                consentimiento_cliente: true, revisor: req.user.id_usuario || null,
                ctx: { instalador_id: f.instalador_id, expediente_id: f.expediente_id, municipio },
            });
            if (r.error) return res.status(r.status || 400).json({ error: r.error, code: r.code });
        } else {
            const { error } = await supabase.from('instalador_fotos_escaparate').update({
                estado: 'PUBLICADA', motivo_rechazo: null, consentimiento_cliente: true, titulo_publico, municipio,
                revisada_por: req.user.id_usuario || null, revisada_at: new Date().toISOString(),
            }).eq('id', f.id);
            if (error) throw new Error(error.message);
        }
        esc.avisoEscaparate('resuelta', { instalador_id: f.instalador_id, que: 'foto', estado: 'PUBLICADA' });
        res.json({ ok: true, estado: 'PUBLICADA' });
    } catch (e) {
        console.error('[escaparate-revision] aprobar foto:', e.message);
        res.status(503).json({ error: 'No se ha podido aprobar. Vuelve a intentarlo.' });
    }
});

// POST /fotos/:id/rechazar { motivo } → NO_VALE (el instalador ve el motivo).
router.post('/fotos/:id/rechazar', adminOnly, async (req, res) => {
    const motivo = motivoDe(req.body);
    if (motivo.length < MIN_MOTIVO) return res.status(400).json({ error: 'Escribe el motivo: el instalador lo va a leer.', code: 'FALTA_MOTIVO' });
    try {
        const f = await fotoPendiente(req.params.id);
        if (!f) return res.status(404).json({ error: 'Foto no encontrada' });
        const { error } = await supabase.from('instalador_fotos_escaparate').update({
            estado: 'NO_VALE', motivo_rechazo: motivo, consentimiento_cliente: false,
            revisada_por: req.user.id_usuario || null, revisada_at: new Date().toISOString(),
        }).eq('id', f.id);
        if (error) throw new Error(error.message);
        esc.avisoEscaparate('resuelta', { instalador_id: f.instalador_id, que: 'foto', estado: 'NO_VALE' });
        res.json({ ok: true, estado: 'NO_VALE' });
    } catch (e) {
        console.error('[escaparate-revision] rechazar foto:', e.message);
        res.status(503).json({ error: 'No se ha podido rechazar. Vuelve a intentarlo.' });
    }
});

async function textoPendiente(id) {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await supabase.from('instalador_textos_escaparate')
        .select('id, instalador_id, presentacion, especialidades, pueblos, estado').eq('id', id).eq('estado', 'PENDIENTE').maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
}

// POST /textos/:id/aprobar { presentacion?, especialidades?, pueblos? } → pasan a VIGENTES.
// El ADMIN puede corregir antes de aprobar; lo corregido se valida igual.
router.post('/textos/:id/aprobar', adminOnly, async (req, res) => {
    try {
        const t = await textoPendiente(req.params.id);
        if (!t) return res.status(404).json({ error: 'No hay textos pendientes con ese id' });
        const b = req.body || {};
        const v = esc.validarTextos({
            presentacion: b.presentacion !== undefined ? b.presentacion : t.presentacion,
            especialidades: b.especialidades !== undefined ? b.especialidades : t.especialidades,
            pueblos: b.pueblos !== undefined ? b.pueblos : t.pueblos,
        });
        if (!v.ok) return res.status(400).json({ error: v.error, code: v.code, campo: v.campo });
        const { error: e1 } = await supabase.from('prescriptores').update({
            descripcion_publica: v.valores.presentacion, especialidades: v.valores.especialidades, zona_trabajo_publica: v.valores.pueblos,
        }).eq('id_empresa', t.instalador_id);
        if (e1) throw new Error(e1.message);
        const { error: e2 } = await supabase.from('instalador_textos_escaparate').update({
            ...v.valores, estado: 'APROBADO', motivo_rechazo: null, revisado_por: req.user.id_usuario || null, revisado_at: new Date().toISOString(),
        }).eq('id', t.id);
        if (e2) throw new Error(e2.message);
        esc.avisoEscaparate('resuelta', { instalador_id: t.instalador_id, que: 'textos', estado: 'APROBADO' });
        res.json({ ok: true, estado: 'APROBADO', vigentes: v.valores });
    } catch (e) {
        console.error('[escaparate-revision] aprobar textos:', e.message);
        res.status(503).json({ error: 'No se han podido aprobar. Vuelve a intentarlo.' });
    }
});

// POST /textos/:id/rechazar { motivo } → NO_VALE; los vigentes no cambian.
router.post('/textos/:id/rechazar', adminOnly, async (req, res) => {
    const motivo = motivoDe(req.body);
    if (motivo.length < MIN_MOTIVO) return res.status(400).json({ error: 'Escribe el motivo: el instalador lo va a leer.', code: 'FALTA_MOTIVO' });
    try {
        const t = await textoPendiente(req.params.id);
        if (!t) return res.status(404).json({ error: 'No hay textos pendientes con ese id' });
        const { error } = await supabase.from('instalador_textos_escaparate').update({
            estado: 'NO_VALE', motivo_rechazo: motivo, revisado_por: req.user.id_usuario || null, revisado_at: new Date().toISOString(),
        }).eq('id', t.id);
        if (error) throw new Error(error.message);
        esc.avisoEscaparate('resuelta', { instalador_id: t.instalador_id, que: 'textos', estado: 'NO_VALE' });
        res.json({ ok: true, estado: 'NO_VALE' });
    } catch (e) {
        console.error('[escaparate-revision] rechazar textos:', e.message);
        res.status(503).json({ error: 'No se ha podido rechazar. Vuelve a intentarlo.' });
    }
});

module.exports = router;
