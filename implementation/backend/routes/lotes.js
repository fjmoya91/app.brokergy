const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { adminOnly } = require('../middleware/auth');
const geoCcaa = require('../services/geoCcaa');
const loteService = require('../services/loteService');

const {
    MAX_RECOMENDADO, ESTADOS_COMPLETO, LOTE_ESTADOS,
    loadExpedienteContext, evaluarElegibilidadBase, casaConLote,
    nextLoteCodigo, sugerirMismoInstalador,
} = loteService;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usuarioDe(req) {
    return req.user?.perfilCompleto?.nombre || req.user?.email || 'ADMIN';
}

function nowIso() { return new Date().toISOString(); }

// Email al que dirigir las notificaciones de un prescriptor: el contacto de
// notificaciones activo (si lo hay) o, en su defecto, el email principal.
function resolveNotifyEmail(p) {
    if (!p) return null;
    if (p.contacto_notificaciones_activas && Array.isArray(p.contactos_notificacion)) {
        const c = p.contactos_notificacion.find(x => x && x.email);
        if (c && c.email) return c.email;
    }
    return p.email || null;
}

// Valida que un id de prescriptor existe y es del tipo esperado.
async function validarPrescriptorTipo(id, tipo) {
    if (!id) return { ok: true, value: null };
    const { data, error } = await supabase
        .from('prescriptores')
        .select('id_empresa, tipo_empresa, razon_social, acronimo, precio_referencia')
        .eq('id_empresa', id).maybeSingle();
    if (error) return { ok: false, motivo: error.message };
    if (!data) return { ok: false, motivo: `El prescriptor seleccionado no existe` };
    if (data.tipo_empresa !== tipo) return { ok: false, motivo: `El prescriptor seleccionado no es de tipo ${tipo}` };
    return { ok: true, value: data };
}

// Enriquece lotes con nombres de SO/Verificador y nº de expedientes.
async function enrichLotes(lotes) {
    if (!lotes.length) return [];
    const presIds = [...new Set(lotes.flatMap(l => [l.sujeto_obligado_id, l.verificador_id]).filter(Boolean))];
    const loteIds = lotes.map(l => l.id);

    const [presRes, expRes] = await Promise.all([
        presIds.length
            ? supabase.from('prescriptores').select('id_empresa, razon_social, acronimo, precio_referencia, codigo_identificacion, email, cif, direccion, codigo_postal, municipio, provincia, nombre_responsable, apellidos_responsable, nif_responsable, contactos_notificacion, contacto_notificaciones_activas').in('id_empresa', presIds)
            : Promise.resolve({ data: [] }),
        supabase.from('expedientes').select('id, lote_id, numero_expediente, cee, instalacion, documentacion, oportunidad_id').in('lote_id', loteIds),
    ]);
    const presMap = new Map((presRes.data || []).map(p => [p.id_empresa, p]));
    const countByLote = {};
    for (const e of (expRes.data || [])) countByLote[e.lote_id] = (countByLote[e.lote_id] || 0) + 1;

    // Expedientes con datos para el cálculo económico, agrupados por lote (resumen de la lista).
    const allExps = expRes.data || [];
    const ecoOpIds = [...new Set(allExps.map(e => e.oportunidad_id).filter(Boolean))];
    let ecoOpMap = {};
    if (ecoOpIds.length) {
        const { data: ecoOps } = await supabase.from('oportunidades').select('id, ficha, datos_calculo').in('id', ecoOpIds);
        ecoOpMap = Object.fromEntries((ecoOps || []).map(o => [o.id, o]));
    }
    const expByLote = {};
    for (const e of allExps) {
        (expByLote[e.lote_id] = expByLote[e.lote_id] || []).push({ ...e, oportunidades: ecoOpMap[e.oportunidad_id] || null });
    }

    return lotes.map(l => {
        const soObj = presMap.get(l.sujeto_obligado_id) || null;
        const verObj = presMap.get(l.verificador_id) || null;
        return {
            ...l,
            sujeto_obligado: soObj ? { ...soObj, notify_email: resolveNotifyEmail(soObj) } : null,
            verificador: verObj ? { ...verObj, notify_email: resolveNotifyEmail(verObj) } : null,
            num_expedientes: countByLote[l.id] || 0,
            expedientes_eco: expByLote[l.id] || [],
        };
    });
}

// ─── GET /api/lotes — lista de lotes ────────────────────────────────────────────
router.get('/', adminOnly, async (req, res) => {
    try {
        const { data: lotes, error } = await supabase
            .from('lotes').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(await enrichLotes(lotes || []));
    } catch (err) {
        console.error('[GET /lotes]', err.message);
        res.status(500).json({ error: 'Error al listar lotes' });
    }
});

// ─── GET /api/lotes/elegibles — expedientes listos para lotear ───────────────────
// Sin lote, con CIFO (año) y CCAA de instalación resoluble. Filtro opcional por
// ?anio= y ?ccaa= para el panel de "añadir al lote".
router.get('/elegibles', adminOnly, async (req, res) => {
    try {
        const { anio, ccaa } = req.query;
        const { data: rows, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, estado, instalador_asociado_id, instalacion, cee, documentacion, cliente_id, oportunidad_id')
            .is('lote_id', null);
        if (error) throw error;

        const opIds = [...new Set((rows || []).map(r => r.oportunidad_id).filter(Boolean))];
        const cliIds = [...new Set((rows || []).map(r => r.cliente_id).filter(Boolean))];
        const [opsRes, clisRes] = await Promise.all([
            opIds.length ? supabase.from('oportunidades').select('id, ficha, datos_calculo').in('id', opIds) : Promise.resolve({ data: [] }),
            cliIds.length ? supabase.from('clientes').select('id_cliente, provincia, ccaa, nombre_razon_social, apellidos, direccion, codigo_postal, municipio').in('id_cliente', cliIds) : Promise.resolve({ data: [] }),
        ]);
        const opMap = new Map((opsRes.data || []).map(o => [o.id, o]));
        const cliMap = new Map((clisRes.data || []).map(c => [c.id_cliente, c]));

        const targetCcaa = ccaa ? geoCcaa.norm(ccaa) : null;
        const targetAnio = anio ? parseInt(anio, 10) : null;

        const out = [];
        for (const r of (rows || [])) {
            if (!ESTADOS_COMPLETO.includes(r.estado)) continue; // solo expedientes completos (DOC. COMPLETA)
            const rAnio = geoCcaa.resolveAnioActuacion(r);
            if (rAnio == null) continue; // sin CIFO → no elegible
            const cli = cliMap.get(r.cliente_id);
            const rCcaa = geoCcaa.resolveCcaaInstalacion(r, cli, opMap.get(r.oportunidad_id));
            if (!rCcaa) continue;
            if (targetAnio != null && rAnio !== targetAnio) continue;
            if (targetCcaa && geoCcaa.norm(rCcaa) !== targetCcaa) continue;
            out.push({
                id: r.id,
                numero_expediente: r.numero_expediente,
                estado: r.estado,
                anio_actuacion: rAnio,
                ccaa: rCcaa,
                instalador_id: r.instalador_asociado_id || (r.instalacion && r.instalacion.instalador_id) || null,
                cliente_nombre: cli ? [cli.nombre_razon_social, cli.apellidos].filter(Boolean).join(' ') : null,
                cliente_direccion: cli ? ([cli.direccion, [cli.codigo_postal, cli.municipio].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || null) : null,
                // Datos para el cálculo económico por fila (misma fórmula que la lista/lote)
                cee: r.cee || null,
                instalacion: r.instalacion || null,
                oportunidades: opMap.get(r.oportunidad_id) || null,
            });
        }
        out.sort((a, b) => (a.anio_actuacion - b.anio_actuacion) || a.numero_expediente.localeCompare(b.numero_expediente, 'es'));
        res.json(out);
    } catch (err) {
        console.error('[GET /lotes/elegibles]', err.message);
        res.status(500).json({ error: 'Error al listar expedientes elegibles' });
    }
});

// ─── GET /api/lotes/:id — detalle + expedientes del lote ─────────────────────────
router.get('/:id', adminOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase
            .from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const [enriched] = await enrichLotes([lote]);
        const { data: expedientes } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, estado, cliente_id, instalador_asociado_id, oportunidad_id, cee, instalacion, documentacion')
            .eq('lote_id', lote.id)
            .order('numero_expediente');

        // Adjuntar la oportunidad (ficha + datos_calculo) de cada expediente → el frontend
        // calcula el resumen económico del lote con la misma fórmula que la lista.
        const opIds = [...new Set((expedientes || []).map(e => e.oportunidad_id).filter(Boolean))];
        let opMap = {};
        if (opIds.length) {
            const { data: ops } = await supabase.from('oportunidades').select('id, ficha, datos_calculo').in('id', opIds);
            opMap = Object.fromEntries((ops || []).map(o => [o.id, o]));
        }
        const cliIds = [...new Set((expedientes || []).map(e => e.cliente_id).filter(Boolean))];
        let cliMap = {};
        if (cliIds.length) {
            const { data: clis } = await supabase.from('clientes')
                .select('id_cliente, nombre_razon_social, apellidos, direccion, codigo_postal, municipio, provincia')
                .in('id_cliente', cliIds);
            cliMap = Object.fromEntries((clis || []).map(c => [c.id_cliente, c]));
        }
        const fmtCli = (c) => c ? [c.nombre_razon_social, c.apellidos].filter(Boolean).join(' ') : null;
        const fmtDir = (c) => c ? ([c.direccion, [c.codigo_postal, c.municipio].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || null) : null;
        const expedientesFull = (expedientes || []).map(e => ({
            ...e,
            oportunidades: opMap[e.oportunidad_id] || null,
            cliente_nombre: fmtCli(cliMap[e.cliente_id]),
            cliente_direccion: fmtDir(cliMap[e.cliente_id]),
        }));

        res.json({ ...enriched, expedientes: expedientesFull });
    } catch (err) {
        console.error('[GET /lotes/:id]', err.message);
        res.status(500).json({ error: 'Error al obtener el lote' });
    }
});

// ─── POST /api/lotes — crear lote (BORRADOR, solo SO obligatorio) ────────────────
router.post('/', adminOnly, async (req, res) => {
    try {
        const { sujeto_obligado_id, verificador_id, expediente_ids = [], notas } = req.body || {};

        const soChk = await validarPrescriptorTipo(sujeto_obligado_id, 'SUJETO_OBLIGADO');
        if (!sujeto_obligado_id) return res.status(400).json({ error: 'Falta el Sujeto Obligado (obligatorio para crear el lote)' });
        if (!soChk.ok) return res.status(400).json({ error: soChk.motivo });

        const verChk = await validarPrescriptorTipo(verificador_id, 'VERIFICADOR');
        if (!verChk.ok) return res.status(400).json({ error: verChk.motivo });

        // Resolver expedientes iniciales (opcional). Deben compartir año + CCAA.
        let anio = null, ccaa = null, codigo = null;
        const ctxs = [];
        for (const expId of expediente_ids) {
            const ctx = await loadExpedienteContext(expId);
            const base = evaluarElegibilidadBase(ctx);
            if (!base.ok) return res.status(422).json({ error: `Expediente ${expId}: ${base.motivo}` });
            const casa = casaConLote(ctx, anio, ccaa);
            if (!casa.ok) return res.status(422).json({ error: `Expediente ${ctx.exp.numero_expediente}: ${casa.motivo}` });
            if (anio == null) { anio = ctx.anio; ccaa = ctx.ccaa; }
            ctxs.push(ctx);
        }
        if (anio != null) codigo = await nextLoteCodigo(anio);

        const { data: lote, error } = await supabase.from('lotes').insert({
            codigo,
            sujeto_obligado_id,
            verificador_id: verificador_id || null,
            anio_actuacion: anio,
            ccaa,
            estado: 'BORRADOR',
            // La oferta del lote arranca del precio de referencia del Sujeto Obligado.
            oferta_lote: (soChk.value && soChk.value.precio_referencia != null) ? Number(soChk.value.precio_referencia) : null,
            notas: notas || null,
            historial: [{ id: `${Date.now()}_crear`, tipo: 'sistema', texto: 'Lote creado', fecha: nowIso(), usuario: usuarioDe(req) }],
        }).select().single();
        if (error) throw error;

        if (ctxs.length) {
            const ids = ctxs.map(c => c.exp.id);
            const { error: upErr } = await supabase.from('expedientes')
                .update({ lote_id: lote.id, updated_at: nowIso() }).in('id', ids);
            if (upErr) throw upErr;
        }

        const [enriched] = await enrichLotes([lote]);
        res.status(201).json(enriched);
    } catch (err) {
        console.error('[POST /lotes]', err.message);
        res.status(500).json({ error: 'Error al crear el lote' });
    }
});

// ─── PATCH /api/lotes/:id — actualizar SO / Verificador / notas ──────────────────
router.patch('/:id', adminOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const { sujeto_obligado_id, verificador_id, notas, coste_verificacion, oferta_lote } = req.body || {};
        const update = { updated_at: nowIso() };

        if (coste_verificacion !== undefined) {
            update.coste_verificacion = (coste_verificacion === '' || coste_verificacion === null) ? null : Number(coste_verificacion);
        }
        if (oferta_lote !== undefined) {
            update.oferta_lote = (oferta_lote === '' || oferta_lote === null) ? null : Number(oferta_lote);
        }

        if (sujeto_obligado_id !== undefined) {
            if (lote.estado !== 'BORRADOR') return res.status(409).json({ error: 'Solo se puede cambiar el Sujeto Obligado en BORRADOR' });
            const chk = await validarPrescriptorTipo(sujeto_obligado_id, 'SUJETO_OBLIGADO');
            if (!chk.ok) return res.status(400).json({ error: chk.motivo });
            update.sujeto_obligado_id = sujeto_obligado_id || null;
            // Si no se fija oferta_lote explícitamente y el lote no tenía, hereda el precio de referencia del nuevo SO.
            if (oferta_lote === undefined && lote.oferta_lote == null && chk.value && chk.value.precio_referencia != null) {
                update.oferta_lote = Number(chk.value.precio_referencia);
            }
        }
        if (verificador_id !== undefined) {
            if (lote.estado !== 'BORRADOR') return res.status(409).json({ error: 'Solo se puede cambiar el Verificador en BORRADOR' });
            const chk = await validarPrescriptorTipo(verificador_id, 'VERIFICADOR');
            if (!chk.ok) return res.status(400).json({ error: chk.motivo });
            update.verificador_id = verificador_id || null;
        }
        if (notas !== undefined) update.notas = notas;

        const { data: updated, error: upErr } = await supabase.from('lotes').update(update).eq('id', lote.id).select().single();
        if (upErr) throw upErr;
        const [enriched] = await enrichLotes([updated]);
        res.json(enriched);
    } catch (err) {
        console.error('[PATCH /lotes/:id]', err.message);
        res.status(500).json({ error: 'Error al actualizar el lote' });
    }
});

// ─── POST /api/lotes/:id/expedientes — añadir expediente ─────────────────────────
// Validación dura: mismo año + CCAA y con CIFO. Aviso blando: 6º expediente
// (requiere force=true para confirmar). Devuelve sugerencias del mismo instalador.
router.post('/:id/expedientes', adminOnly, async (req, res) => {
    try {
        const { expediente_id, force } = req.body || {};
        if (!expediente_id) return res.status(400).json({ error: 'Falta expediente_id' });

        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
        if (lote.estado !== 'BORRADOR') return res.status(409).json({ error: 'Solo se pueden añadir expedientes a un lote en BORRADOR' });

        const ctx = await loadExpedienteContext(expediente_id);
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (ctx.exp.lote_id === lote.id) return res.status(409).json({ error: 'El expediente ya está en este lote' });
        const base = evaluarElegibilidadBase(ctx);
        if (!base.ok) return res.status(422).json({ error: base.motivo });
        const casa = casaConLote(ctx, lote.anio_actuacion, lote.ccaa);
        if (!casa.ok) return res.status(422).json({ error: casa.motivo });

        // Aviso blando: máximo recomendado.
        const { data: miembros } = await supabase.from('expedientes').select('id').eq('lote_id', lote.id);
        const count = (miembros || []).length;
        if (count >= MAX_RECOMENDADO && !force) {
            return res.status(200).json({
                added: false,
                requiresConfirmation: true,
                warning: `El lote ya tiene ${count} expedientes (máximo recomendado ${MAX_RECOMENDADO}). ¿Añadir igualmente?`,
            });
        }

        // Asignar. Si el lote no tenía claves, se fijan con este expediente.
        const loteUpdate = { updated_at: nowIso() };
        if (lote.anio_actuacion == null) {
            loteUpdate.anio_actuacion = ctx.anio;
            loteUpdate.ccaa = ctx.ccaa;
            loteUpdate.codigo = lote.codigo || await nextLoteCodigo(ctx.anio);
        }
        const { error: upExp } = await supabase.from('expedientes')
            .update({ lote_id: lote.id, updated_at: nowIso() }).eq('id', ctx.exp.id);
        if (upExp) throw upExp;
        const { data: updatedLote, error: upLote } = await supabase.from('lotes')
            .update(loteUpdate).eq('id', lote.id).select().single();
        if (upLote) throw upLote;

        const sugerencias = await sugerirMismoInstalador({
            instaladorId: ctx.instaladorId,
            anio: updatedLote.anio_actuacion,
            ccaa: updatedLote.ccaa,
            excludeIds: [ctx.exp.id, ...(miembros || []).map(m => m.id)],
        });

        const [enriched] = await enrichLotes([updatedLote]);
        res.json({ added: true, lote: enriched, sugerencias });
    } catch (err) {
        console.error('[POST /lotes/:id/expedientes]', err.message);
        res.status(500).json({ error: 'Error al añadir el expediente al lote' });
    }
});

// ─── DELETE /api/lotes/:id/expedientes/:expId — quitar expediente ────────────────
router.delete('/:id/expedientes/:expId', adminOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
        if (lote.estado !== 'BORRADOR') return res.status(409).json({ error: 'Solo se pueden quitar expedientes de un lote en BORRADOR' });

        const { error: upErr } = await supabase.from('expedientes')
            .update({ lote_id: null, updated_at: nowIso() })
            .eq('id', req.params.expId).eq('lote_id', lote.id);
        if (upErr) throw upErr;

        // Si el lote se queda vacío, liberar las claves año/CCAA y el código.
        const { data: restantes } = await supabase.from('expedientes').select('id').eq('lote_id', lote.id);
        const loteUpdate = { updated_at: nowIso() };
        if (!(restantes || []).length) {
            loteUpdate.anio_actuacion = null;
            loteUpdate.ccaa = null;
            loteUpdate.codigo = null;
        }
        const { data: updatedLote, error: upLote } = await supabase.from('lotes')
            .update(loteUpdate).eq('id', lote.id).select().single();
        if (upLote) throw upLote;

        const [enriched] = await enrichLotes([updatedLote]);
        res.json(enriched);
    } catch (err) {
        console.error('[DELETE /lotes/:id/expedientes/:expId]', err.message);
        res.status(500).json({ error: 'Error al quitar el expediente del lote' });
    }
});

// ─── PATCH /api/lotes/:id/estado — cambiar estado del lote ───────────────────────
router.patch('/:id/estado', adminOnly, async (req, res) => {
    try {
        const { nuevo_estado, comentario } = req.body || {};
        if (!LOTE_ESTADOS.includes(nuevo_estado)) {
            return res.status(400).json({ error: `Estado de lote no válido: ${nuevo_estado}` });
        }
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        // Guardas mínimas al salir de BORRADOR (enviar al verificador).
        if (lote.estado === 'BORRADOR' && nuevo_estado === 'ENVIADO A VERIFICADOR') {
            if (!lote.verificador_id) return res.status(409).json({ error: 'Asigna un Verificador antes de enviar el lote' });
            const { data: miembros } = await supabase.from('expedientes').select('id').eq('lote_id', lote.id);
            if (!(miembros || []).length) return res.status(409).json({ error: 'El lote no tiene expedientes' });
        }

        const historial = Array.isArray(lote.historial) ? lote.historial.slice() : [];
        historial.push({
            id: `${Date.now()}_estado`, tipo: 'cambio_estado',
            estado: nuevo_estado, texto: comentario || `Estado → ${nuevo_estado}`,
            fecha: nowIso(), usuario: usuarioDe(req),
        });

        const update = { estado: nuevo_estado, historial, updated_at: nowIso() };
        if (nuevo_estado === 'ENVIADO A VERIFICADOR' && !lote.fecha_envio_verificador) update.fecha_envio_verificador = nowIso();
        if (nuevo_estado === 'CAE EMITIDO – PTE PAGO BROKERGY' && !lote.fecha_cae) update.fecha_cae = nowIso();

        const { data: updated, error: upErr } = await supabase.from('lotes').update(update).eq('id', lote.id).select().single();
        if (upErr) throw upErr;
        const [enriched] = await enrichLotes([updated]);
        res.json(enriched);
    } catch (err) {
        console.error('[PATCH /lotes/:id/estado]', err.message);
        res.status(500).json({ error: 'Error al cambiar el estado del lote' });
    }
});

// ─── DELETE /api/lotes/:id — borrar lote (solo BORRADOR) ─────────────────────────
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
        if (lote.estado !== 'BORRADOR') return res.status(409).json({ error: 'Solo se pueden borrar lotes en BORRADOR' });

        // Desasignar expedientes (la FK es ON DELETE SET NULL, pero lo hacemos explícito).
        await supabase.from('expedientes').update({ lote_id: null, updated_at: nowIso() }).eq('lote_id', lote.id);
        const { error: delErr } = await supabase.from('lotes').delete().eq('id', lote.id);
        if (delErr) throw delErr;
        res.json({ deleted: true });
    } catch (err) {
        console.error('[DELETE /lotes/:id]', err.message);
        res.status(500).json({ error: 'Error al borrar el lote' });
    }
});

module.exports = router;
