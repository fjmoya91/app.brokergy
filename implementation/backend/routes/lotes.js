const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { adminOnly, staffOnly, isAdmin } = require('../middleware/auth');
const { stripDatosCalculoMargin } = require('../utils/financialScrub');
const geoCcaa = require('../services/geoCcaa');
const loteService = require('../services/loteService');
const marwenService = require('../services/marwenService');
const driveService = require('../services/driveService');
const { htmlToPdf } = require('../services/pdfService');

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

// Carpeta del lote en Drive. El padre es la carpeta de estado "07. ENVIADOS A
// VERIFICAR" (env DRIVE_FOLDER_ENVIADOS_VERIFICAR); si no está configurada, cae a
// {DRIVE_ROOT}/LOTES. Se crea bajo demanda y se cachea en lotes.drive_folder_id.
// Dentro de esta carpeta se mueven las carpetas de los expedientes del lote y se
// depositan los documentos del lote (Anexo I, fichas, solicitud y sus firmados).
async function ensureLoteFolder(lote) {
    if (lote.drive_folder_id) return lote.drive_folder_id;
    let parent = process.env.DRIVE_FOLDER_ENVIADOS_VERIFICAR;
    if (!parent) {
        const root = process.env.DRIVE_ROOT_FOLDER_ID;
        if (!root) throw new Error('DRIVE_ROOT_FOLDER_ID no está configurado');
        parent = await driveService.getOrCreateSubfolder(root, 'LOTES');
    }
    const name = lote.codigo || `LOTE-${String(lote.id).slice(0, 8)}`;
    const folderId = await driveService.getOrCreateSubfolder(parent, name);
    if (!folderId) throw new Error('No se pudo crear la carpeta del lote en Drive');
    await supabase.from('lotes').update({ drive_folder_id: folderId, updated_at: nowIso() }).eq('id', lote.id);
    return folderId;
}

// Sanea un nombre de fichero para Drive y garantiza la extensión .pdf.
function pdfFileName(base) {
    const clean = String(base || 'Documento').replace(/[\\/<>:"|?*]/g, '_').trim();
    return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

// Guarda un PDF en una carpeta reemplazando el previo con el mismo nombre (para que
// un reenvío no deje duplicados). Devuelve { id, link } o null.
async function saveOrReplacePdf(folderId, fileName, buffer) {
    try {
        const prev = await driveService.findFileByName(folderId, fileName);
        if (prev) await driveService.deleteFile(prev);
    } catch (_) { /* no bloqueante */ }
    return driveService.saveFileToFolder(folderId, fileName, 'application/pdf', buffer);
}

// Siguiente número de factura de CAE para un año concreto: F-{año}CAE_{N}.
// (La primera factura de CAE de un año es F-{año}CAE_1.) Lee del registro `facturas_so`.
async function nextFacturaNumero(year) {
    const { data } = await supabase.from('facturas_so').select('numero').like('numero', `F-${year}CAE_%`);
    const re = new RegExp(`^F-${year}CAE_(\\d+)$`);
    let max = 0;
    for (const r of (data || [])) {
        const m = String(r.numero || '').match(re);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const n = max + 1;
    return { n, numero: `F-${year}CAE_${n}` };
}

// Upsert de la factura del lote (UNA por lote → onConflict lote_id). En borrador
// NO se incluye `estado` (para no degradar una EMITIDA); al emitir se marca EMITIDA.
async function upsertFacturaSo(lote, fields, opts = {}) {
    const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
    const row = {
        lote_id: lote.id,
        numero: fields.numero ? String(fields.numero).trim() : null,
        fecha: fields.fecha || null,
        vencimiento: fields.vencimiento || null,
        cae_inicial: fields.cae_inicial || null,
        cae_final: fields.cae_final || null,
        unidades_kwh: num(fields.unidades_kwh),
        precio_kwh: num(fields.precio_kwh),
        base: num(fields.base),
        iva: num(fields.iva),
        total: num(fields.total),
        sujeto_obligado_id: lote.sujeto_obligado_id || null,
        updated_at: nowIso(),
    };
    if (opts.emit) {
        row.estado = 'EMITIDA';
        row.drive_link = opts.drive_link || null;
        row.drive_file_id = opts.drive_file_id || null;
        row.generada_por = opts.generada_por || null;
    }
    const { data, error } = await supabase.from('facturas_so').upsert(row, { onConflict: 'lote_id' }).select().single();
    if (error) throw error;
    return data;
}

// Enriquece lotes con nombres de SO/Verificador y nº de expedientes.
async function enrichLotes(lotes) {
    if (!lotes.length) return [];
    const presIds = [...new Set(lotes.flatMap(l => [l.sujeto_obligado_id, l.verificador_id]).filter(Boolean))];
    const loteIds = lotes.map(l => l.id);

    const [presRes, expRes, facRes] = await Promise.all([
        presIds.length
            ? supabase.from('prescriptores').select('id_empresa, razon_social, acronimo, precio_referencia, codigo_identificacion, email, cif, direccion, codigo_postal, municipio, provincia, nombre_responsable, apellidos_responsable, nif_responsable, landing_telefono_contacto, contactos_notificacion, contacto_notificaciones_activas').in('id_empresa', presIds)
            : Promise.resolve({ data: [] }),
        supabase.from('expedientes').select('id, lote_id, numero_expediente, cee, instalacion, documentacion, oportunidad_id').in('lote_id', loteIds),
        supabase.from('facturas_so').select('*').in('lote_id', loteIds),
    ]);
    const presMap = new Map((presRes.data || []).map(p => [p.id_empresa, p]));
    const facturaMap = new Map((facRes.data || []).map(f => [f.lote_id, f]));
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
            // Factura al S.O. desde el registro `facturas_so` (una por lote). Sustituye al
            // antiguo JSONB lotes.factura_so (que queda vestigial).
            factura_so: facturaMap.get(l.id) || null,
        };
    });
}

// ─── Capado de PRECIOS/MARGEN del lote para el TRABAJADOR ────────────────────────
// El TRABAJADOR opera lotes (agrupar expedientes, asignar SO/verificador, enviar a
// verificar) pero NO ve lo que gana Brokergy: oferta del lote (€/MWh de venta al
// S.O.), coste de verificación, factura al S.O., precio de referencia del S.O. y el
// margen embebido en el datos_calculo de cada expediente. El ADMIN lo ve todo.
function scrubExpedienteEco(e) {
    if (!e || typeof e !== 'object') return e;
    const out = { ...e };
    if (out.instalacion && typeof out.instalacion === 'object') {
        const inst = { ...out.instalacion };
        delete inst.economico_override;
        delete inst.verificacion;
        out.instalacion = inst;
    }
    if (out.oportunidades?.datos_calculo) {
        out.oportunidades = { ...out.oportunidades, datos_calculo: stripDatosCalculoMargin(out.oportunidades.datos_calculo) };
    }
    return out;
}

function scrubLoteForUser(lote, req) {
    if (!lote || isAdmin(req)) return lote;
    const out = { ...lote };
    delete out.oferta_lote;
    delete out.coste_verificacion;
    out.factura_so = null;
    if (out.sujeto_obligado && typeof out.sujeto_obligado === 'object') {
        const so = { ...out.sujeto_obligado };
        delete so.precio_referencia;
        out.sujeto_obligado = so;
    }
    if (Array.isArray(out.expedientes_eco)) out.expedientes_eco = out.expedientes_eco.map(scrubExpedienteEco);
    if (Array.isArray(out.expedientes)) out.expedientes = out.expedientes.map(scrubExpedienteEco);
    return out;
}

// ─── GET /api/lotes — lista de lotes ────────────────────────────────────────────
router.get('/', staffOnly, async (req, res) => {
    try {
        const { data: lotes, error } = await supabase
            .from('lotes').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        const enriched = await enrichLotes(lotes || []);
        res.json(enriched.map(l => scrubLoteForUser(l, req)));
    } catch (err) {
        console.error('[GET /lotes]', err.message);
        res.status(500).json({ error: 'Error al listar lotes' });
    }
});

// ─── GET /api/lotes/elegibles — expedientes listos para lotear ───────────────────
// Sin lote, con CIFO (año) y CCAA de instalación resoluble. Filtro opcional por
// ?anio= y ?ccaa= para el panel de "añadir al lote".
router.get('/elegibles', staffOnly, async (req, res) => {
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
                // Datos para el cálculo económico por fila (misma fórmula que la lista/lote).
                // Para el TRABAJADOR se capa el margen embebido en instalacion/datos_calculo.
                cee: r.cee || null,
                instalacion: r.instalacion || null,
                oportunidades: opMap.get(r.oportunidad_id) || null,
            });
        }
        out.sort((a, b) => (a.anio_actuacion - b.anio_actuacion) || a.numero_expediente.localeCompare(b.numero_expediente, 'es'));
        res.json(isAdmin(req) ? out : out.map(scrubExpedienteEco));
    } catch (err) {
        console.error('[GET /lotes/elegibles]', err.message);
        res.status(500).json({ error: 'Error al listar expedientes elegibles' });
    }
});

// ─── GET /api/lotes/factura-so/next-number?year=YYYY — nº de factura CAE sugerido ─
// DEBE ir antes de '/:id' para que no lo capture la ruta paramétrica.
router.get('/factura-so/next-number', adminOnly, async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const result = await nextFacturaNumero(year);
        res.json({ year, ...result });
    } catch (err) {
        console.error('[GET /lotes/factura-so/next-number]', err.message);
        res.status(500).json({ error: 'Error al calcular el número de factura' });
    }
});

// ─── GET /api/lotes/:id — detalle + expedientes del lote ─────────────────────────
router.get('/:id', staffOnly, async (req, res) => {
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

        res.json(scrubLoteForUser({ ...enriched, expedientes: expedientesFull }, req));
    } catch (err) {
        console.error('[GET /lotes/:id]', err.message);
        res.status(500).json({ error: 'Error al obtener el lote' });
    }
});

// ─── POST /api/lotes — crear lote (BORRADOR, solo SO obligatorio) ────────────────
router.post('/', staffOnly, async (req, res) => {
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
        res.status(201).json(scrubLoteForUser(enriched, req));
    } catch (err) {
        console.error('[POST /lotes]', err.message);
        res.status(500).json({ error: 'Error al crear el lote' });
    }
});

// ─── PATCH /api/lotes/:id — actualizar SO / Verificador / notas ──────────────────
router.patch('/:id', staffOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const { sujeto_obligado_id, verificador_id, notas, coste_verificacion, oferta_lote } = req.body || {};
        const update = { updated_at: nowIso() };

        // La oferta del lote y el coste de verificación son MARGEN Brokergy: solo el
        // ADMIN puede fijarlos. El TRABAJADOR ni los ve ni los edita (se ignoran).
        if (isAdmin(req)) {
            if (coste_verificacion !== undefined) {
                update.coste_verificacion = (coste_verificacion === '' || coste_verificacion === null) ? null : Number(coste_verificacion);
            }
            if (oferta_lote !== undefined) {
                update.oferta_lote = (oferta_lote === '' || oferta_lote === null) ? null : Number(oferta_lote);
            }
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
        res.json(scrubLoteForUser(enriched, req));
    } catch (err) {
        console.error('[PATCH /lotes/:id]', err.message);
        res.status(500).json({ error: 'Error al actualizar el lote' });
    }
});

// ─── PUT /api/lotes/:id/factura-so/draft — auto-guardado del borrador de factura ──
// Persiste los campos según se editan (estado BORRADOR). Nunca se pierde el dato
// aunque no se llegue a generar el PDF. Devuelve la fila de `facturas_so`.
router.put('/:id/factura-so/draft', adminOnly, async (req, res) => {
    try {
        const { factura } = req.body || {};
        if (!factura) return res.status(400).json({ error: 'Faltan los datos de la factura' });
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
        const saved = await upsertFacturaSo(lote, factura);
        res.json(saved);
    } catch (err) {
        console.error('[PUT /lotes/:id/factura-so/draft]', err.message);
        res.status(500).json({ error: err.message || 'Error al guardar el borrador de factura' });
    }
});

// ─── POST /api/lotes/:id/factura-so — generar y guardar la factura al S.O. ───────
// Recibe el HTML (construido en el frontend, previsualizado) + los metadatos de la
// factura. Asegura la carpeta del lote en Drive, genera el PDF, lo guarda y marca
// la factura como EMITIDA en `facturas_so`. Devuelve el lote enriquecido.
router.post('/:id/factura-so', adminOnly, async (req, res) => {
    try {
        const { html, factura } = req.body || {};
        if (!html || !factura || !factura.numero) {
            return res.status(400).json({ error: 'Faltan el HTML o el número de factura' });
        }
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const folderId = await ensureLoteFolder(lote);
        const pdfBuffer = await htmlToPdf(html);
        // Nombre del fichero: "{nº factura} - {nombre lote} - {acrónimo S.O.}.pdf".
        // El acrónimo del S.O. no viene en el lote crudo (solo el id) → se busca.
        let acronimoSO = 'SO';
        if (lote.sujeto_obligado_id) {
            const { data: soRow } = await supabase.from('prescriptores').select('acronimo, razon_social').eq('id_empresa', lote.sujeto_obligado_id).maybeSingle();
            if (soRow) acronimoSO = soRow.acronimo || soRow.razon_social || 'SO';
        }
        const fileName = `${factura.numero} - ${lote.codigo || 'LOTE'} - ${acronimoSO}`
            .trim().replace(/[\\/<>:"|?*]/g, '_') + '.pdf';
        const saved = await driveService.saveFileToFolder(folderId, fileName, 'application/pdf', pdfBuffer);
        if (!saved) throw new Error('No se pudo guardar la factura en Drive');

        await upsertFacturaSo(lote, factura, {
            emit: true,
            drive_link: saved.link,
            drive_file_id: saved.id || null,
            generada_por: usuarioDe(req),
        });
        await supabase.from('lotes').update({ drive_folder_id: folderId, updated_at: nowIso() }).eq('id', lote.id);

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json(enriched);
    } catch (err) {
        console.error('[POST /lotes/:id/factura-so]', err.message);
        res.status(500).json({ error: err.message || 'Error al generar la factura' });
    }
});

// ─── POST /api/lotes/:id/enviar-so — enviar al Sujeto Obligado para firma ────────
// Asegura la carpeta del lote en "07. ENVIADOS A VERIFICAR", MUEVE dentro las
// carpetas de Drive de los expedientes del lote, genera/guarda como BORRADOR los
// documentos (Anexo I listado + una ficha RES por expediente + la Solicitud de
// Verificación subida), los envía por email/WhatsApp al S.O. con el enlace de
// firma, y registra todo en lotes.documentos_so para la firma en cadena del S.O.
// (/firmar-lote/:id). Los HTML de Anexo I y fichas los construye el frontend.
// ─── POST /api/lotes/:id/documentos/oferta ────────────────────────────────
// Sube la OFERTA DE VERIFICACIÓN que devuelve el verificador. Va a la carpeta
// Drive del lote y se registra en `documentos_so` como una entrada más, para que
// aparezca en el visor de documentos junto al Anexo I y la solicitud.
router.post('/:id/documentos/oferta', staffOnly, async (req, res) => {
    try {
        const { base64, fileName } = req.body || {};
        if (!base64) return res.status(400).json({ error: 'Falta el fichero' });

        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const folderId = await ensureLoteFolder(lote);
        const buffer = Buffer.from(String(base64).split(',').pop(), 'base64');
        const name = pdfFileName(fileName || `${lote.codigo || 'LOTE'} - Oferta de verificacion`);
        const saved = await saveOrReplacePdf(folderId, name, buffer);
        if (!saved) throw new Error('No se pudo guardar la oferta en Drive');

        // Releemos `documentos_so` justo antes de escribir para no pisar cambios de
        // otro envío en curso, y sustituimos la entrada de la oferta si ya existía.
        const { data: fresh } = await supabase.from('lotes').select('documentos_so, historial').eq('id', lote.id).maybeSingle();
        const docs = Array.isArray(fresh?.documentos_so) ? [...fresh.documentos_so] : [];
        const entrada = {
            key: 'oferta_verificacion',
            tipo: 'oferta_verificacion',
            label: 'Oferta de verificación',
            expediente_id: null,
            file_name: name,
            draft_link: saved.link,
            draft_file_id: saved.id,
            signed_link: null,
            signed_file_id: null,
            sent_at: null,
            signed_at: null,
            uploaded_at: nowIso(),
        };
        const idx = docs.findIndex(d => d?.key === 'oferta_verificacion');
        if (idx >= 0) docs[idx] = entrada; else docs.push(entrada);

        const historial = Array.isArray(fresh?.historial) ? [...fresh.historial] : [];
        historial.push({
            id: `${Date.now()}_oferta`, tipo: 'sistema',
            texto: `Subida la oferta de verificación (${name}).`,
            fecha: nowIso(), usuario: usuarioDe(req),
        });

        await supabase.from('lotes').update({
            documentos_so: docs, historial, drive_folder_id: folderId, updated_at: nowIso(),
        }).eq('id', lote.id);

        res.json({ ok: true, documento: entrada });
    } catch (err) {
        console.error('[POST /lotes/:id/documentos/oferta]', err.message);
        res.status(500).json({ error: err.message || 'Error al subir la oferta de verificación' });
    }
});

router.post('/:id/enviar-so', staffOnly, async (req, res) => {
    try {
        const {
            to, cc, phone, channels = { email: true, whatsapp: false },
            customMessage, summaryData, docs = [], solicitud, frontendOrigin,
            // Aviso corto por WhatsApp al contacto del S.O. ("os hemos enviado otro
            // lote para firmar"). Independiente del canal WhatsApp, que manda además
            // todos los adjuntos.
            avisoWhatsApp,
        } = req.body || {};

        if (!Array.isArray(docs) || docs.length === 0) {
            return res.status(400).json({ error: 'No hay documentos para enviar' });
        }
        if (channels.email && !to) return res.status(400).json({ error: 'Falta el email del destinatario' });
        if (channels.whatsapp && !phone) return res.status(400).json({ error: 'Falta el teléfono para WhatsApp' });

        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        // 1) Carpeta del lote (padre = "07. ENVIADOS A VERIFICAR").
        const folderId = await ensureLoteFolder(lote);

        // 2) Mover la carpeta de Drive de cada expediente del lote dentro de la del lote.
        const { data: exps } = await supabase
            .from('expedientes').select('id, numero_expediente, oportunidad_id').eq('lote_id', lote.id);
        const opIds = [...new Set((exps || []).map(e => e.oportunidad_id).filter(Boolean))];
        let opMap = {};
        if (opIds.length) {
            const { data: ops } = await supabase.from('oportunidades').select('id, datos_calculo').in('id', opIds);
            opMap = Object.fromEntries((ops || []).map(o => [o.id, o]));
        }
        // expFolderMap: expediente.id → carpeta de Drive del expediente (para guardar
        // el borrador de su ficha en "6. ANEXOS CAE" y el firmado en "10. EXPEDIENTE CAE").
        const expFolderMap = {};
        const movimientos = [];
        for (const e of (exps || [])) {
            const dc = opMap[e.oportunidad_id]?.datos_calculo || {};
            const expFolder = dc.drive_folder_id || dc.inputs?.drive_folder_id;
            if (!expFolder) { movimientos.push({ exp: e.numero_expediente, moved: false, motivo: 'sin carpeta en Drive' }); continue; }
            expFolderMap[e.id] = expFolder;
            const ok = await driveService.moveFolder(expFolder, folderId);
            movimientos.push({ exp: e.numero_expediente, moved: !!ok });
        }

        // 3) Generar/guardar borradores + preparar adjuntos. Las FICHAS de un expediente
        //    van a la carpeta del expediente "6. ANEXOS CAE"; el Anexo I Listado y la
        //    Solicitud (nivel lote) van a la carpeta del lote.
        const attachments = [];
        const documentosSo = [];
        const sentAt = nowIso();

        for (const d of docs) {
            if (!d.html && !d.pdfBase64) continue;
            // `pdfBase64` = PDF ya firmado (p.ej. el Anexo I firmado por el PROVEEDOR/Brokergy);
            // tiene prioridad sobre el HTML para no regenerarlo y perder la firma.
            const pdf = d.pdfBase64 ? Buffer.from(d.pdfBase64, 'base64') : await htmlToPdf(d.html);
            const fileName = pdfFileName(d.fileName);
            // Carpeta destino del borrador: expediente/"6. ANEXOS CAE" si es ficha con
            // carpeta resoluble; si no, la carpeta del lote.
            const expFolder = d.expediente_id ? expFolderMap[d.expediente_id] : null;
            let draftFolder = folderId;
            if (expFolder) {
                draftFolder = await driveService.getOrCreateSubfolder(expFolder, '6. ANEXOS CAE') || folderId;
            }
            const saved = await saveOrReplacePdf(draftFolder, fileName, pdf);
            attachments.push({ filename: fileName, content: pdf });
            documentosSo.push({
                key: d.expediente_id ? `ficha_${d.expediente_id}` : (d.key || `anexo_i`),
                tipo: d.tipo || (d.expediente_id ? 'ficha_res' : 'anexo_i_listado'),
                expediente_id: d.expediente_id || null,
                exp_folder_id: expFolder || null,
                label: d.label || fileName.replace(/\.pdf$/i, ''),
                file_name: fileName,
                anchor: d.anchor || null,
                fixedBox: d.fixedBox || null,
                draft_link: saved?.link || null, draft_file_id: saved?.id || null,
                signed_link: null, signed_file_id: null,
                sent_at: sentAt, signed_at: null,
            });
        }

        // Solicitud de Verificación (PDF subido en base64).
        if (solicitud && solicitud.base64) {
            const buf = Buffer.from(solicitud.base64, 'base64');
            const fileName = pdfFileName(solicitud.fileName || `Solicitud Verificacion - ${lote.codigo || 'lote'}`);
            const saved = await saveOrReplacePdf(folderId, fileName, buf);
            attachments.push({ filename: fileName, content: buf });
            documentosSo.push({
                key: 'solicitud_verificacion', tipo: 'solicitud_verificacion',
                expediente_id: null, exp_folder_id: null, label: 'Solicitud de Verificación',
                file_name: fileName,
                anchor: ['solicitante', 'fdo', 'firma'],
                fixedBox: solicitud.fixedBox || null,
                draft_link: saved?.link || null, draft_file_id: saved?.id || null,
                signed_link: null, signed_file_id: null,
                sent_at: sentAt, signed_at: null,
            });
        }

        if (!documentosSo.length) return res.status(400).json({ error: 'No se generó ningún documento (falta HTML o la solicitud).' });

        // 4) Enlace de firma para el S.O.
        const origin = (frontendOrigin || process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/$/, '');
        const firmaUrl = `${origin}/firmar-lote/${lote.id}`;

        // 5) Envío (email y/o WhatsApp). No bloqueante: los fallos van a `warnings`.
        const warnings = [];
        const summ = {
            id: (summaryData && summaryData.id) || lote.codigo || 'LOTE',
            docType: (summaryData && summaryData.docType) || 'Documentación del lote (firma S.O.)',
        };
        const msgConEnlace = `${customMessage || ''}\n\n${firmaUrl}`.trim();

        if (channels.email && to) {
            try {
                const emailService = require('../services/emailService');
                await emailService.sendAnnexEmail({ to, cc, userName: summ.id, attachments, customMessage: msgConEnlace, summaryData: summ });
            } catch (e) { warnings.push(`Email: ${e.message}`); }
        }
        if (channels.whatsapp && phone) {
            try {
                const whatsappService = require('../services/whatsappService');
                await whatsappService.sendText(phone, msgConEnlace);
                for (const a of attachments) {
                    await whatsappService.sendMedia(
                        phone,
                        { base64: a.content.toString('base64'), filename: a.filename, mimetype: 'application/pdf' },
                        { caption: a.filename.replace(/\.pdf$/i, ''), splitCaption: false }
                    );
                }
            } catch (e) { warnings.push(`WhatsApp: ${e.message}`); }
        }

        // Aviso corto por WhatsApp al contacto del S.O., avisando de que el lote ya
        // está en su email. Solo si no se ha enviado ya todo por WhatsApp a ese mismo
        // número (evita duplicar el mensaje).
        const avisoPhone = (avisoWhatsApp?.phone || '').trim();
        const avisoMsg = (avisoWhatsApp?.message || '').trim();
        const yaEnviadoPorWa = channels.whatsapp && phone && String(phone).trim() === avisoPhone;
        if (avisoPhone && avisoMsg && !yaEnviadoPorWa) {
            try {
                const whatsappService = require('../services/whatsappService');
                await whatsappService.sendText(avisoPhone, avisoMsg);
            } catch (e) { warnings.push(`Aviso WhatsApp: ${e.message}`); }
        }

        // 6) Persistir documentos + historial.
        const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
        const canales = [channels.email && to ? 'email' : null, channels.whatsapp && phone ? 'whatsapp' : null].filter(Boolean).join('+');
        historial.push({
            id: `${Date.now()}_enviar_so`, tipo: 'sistema',
            texto: `Enviado al S.O. para firma (${documentosSo.length} doc.${canales ? `, ${canales}` : ''}). Expedientes movidos a la carpeta del lote.`,
            fecha: sentAt, usuario: usuarioDe(req),
        });
        await supabase.from('lotes').update({
            documentos_so: documentosSo, historial, drive_folder_id: folderId, updated_at: sentAt,
        }).eq('id', lote.id);

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, firma_url: firmaUrl, movimientos, warnings, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[POST /lotes/:id/enviar-so]', err.message);
        res.status(500).json({ error: err.message || 'Error al enviar al Sujeto Obligado' });
    }
});

// ─── POST /api/lotes/:id/expedientes — añadir expediente ─────────────────────────
// Validación dura: mismo año + CCAA y con CIFO. Aviso blando: 6º expediente
// (requiere force=true para confirmar). Devuelve sugerencias del mismo instalador.
router.post('/:id/expedientes', staffOnly, async (req, res) => {
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
        res.json({ added: true, lote: scrubLoteForUser(enriched, req), sugerencias });
    } catch (err) {
        console.error('[POST /lotes/:id/expedientes]', err.message);
        res.status(500).json({ error: 'Error al añadir el expediente al lote' });
    }
});

// ─── DELETE /api/lotes/:id/expedientes/:expId — quitar expediente ────────────────
router.delete('/:id/expedientes/:expId', staffOnly, async (req, res) => {
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
        res.json(scrubLoteForUser(enriched, req));
    } catch (err) {
        console.error('[DELETE /lotes/:id/expedientes/:expId]', err.message);
        res.status(500).json({ error: 'Error al quitar el expediente del lote' });
    }
});

// ─── PATCH /api/lotes/:id/estado — cambiar estado del lote ───────────────────────
router.patch('/:id/estado', staffOnly, async (req, res) => {
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

        // Propagar el nuevo estado a todos los expedientes del lote si el estado
        // también existe en la tabla de expedientes.
        const EXPEDIENTE_ESTADOS = [
            'PTE. CEE INICIAL', 'EN CERTIFICADOR CEE INICIAL', 'PTE. FIN OBRA',
            'PTE. CEE FINAL', 'EN CERTIFICADOR CEE FINAL', 'PTE FIRMA ANEXOS',
            'PTE. CIFO BROKERGY', 'PTE FIRMA CIFO', 'PTE FIN EXPTE', 'DOC. COMPLETA',
            'PENDIENTE REVISAR EXPTE', 'ENVIADO A VERIFICADOR', 'REQUERIMIENTO VERIFICADOR',
            'PTE. SUBIDA MITECO', 'REQUERIMIENTO G.A.', 'CAE EMITIDO – PTE PAGO BROKERGY',
            'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO',
        ];
        if (EXPEDIENTE_ESTADOS.includes(nuevo_estado)) {
            await supabase.from('expedientes')
                .update({ estado: nuevo_estado, updated_at: nowIso() })
                .eq('lote_id', lote.id);
        }

        const [enriched] = await enrichLotes([updated]);
        res.json(scrubLoteForUser(enriched, req));
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

// ─── POST /api/lotes/:id/enviar-verificador-api ──────────────────────────────────
// Envía el lote como "Solicitud de Verificación Estandarizada" a Marwen por API.
// El frontend manda los bloques que él construye (step2 = actuaciones, step3 =
// emplazamientos) + los datos editables de contacto; el backend arma el step1
// AUTORITATIVO desde el Sujeto Obligado del lote (identidad + IDs de provincia/
// localidad resueltos contra el catálogo de Marwen) y envía.
// Con { dryRun:true } no envía: devuelve la previsualización de la resolución
// geográfica y el payload, para que el usuario confirme antes.
function toIsoDate(d) {
    if (!d) return null;
    const s = String(d).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                  // ISO
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);            // dd/mm/yyyy
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s;
}

router.post('/:id/enviar-verificador-api', staffOnly, async (req, res) => {
    try {
        if (!marwenService.isConfigured()) {
            return res.status(503).json({ error: 'La integración con Marwen no está configurada (falta MARWEN_API_KEY en el backend).' });
        }

        const { contacto = {}, figura = 'obligado', step2 = [], step3 = [], dryRun = false } = req.body || {};

        // 1. Lote + Sujeto Obligado (solicitante autoritativo).
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
        if (!lote.sujeto_obligado_id) return res.status(409).json({ error: 'El lote no tiene Sujeto Obligado asignado (necesario como solicitante).' });

        const { data: so } = await supabase.from('prescriptores')
            .select('razon_social, cif, codigo_identificacion, direccion, codigo_postal, municipio, provincia')
            .eq('id_empresa', lote.sujeto_obligado_id).maybeSingle();
        if (!so) return res.status(409).json({ error: 'No se pudo cargar el Sujeto Obligado del lote.' });

        // 2. Validaciones de los bloques del frontend.
        if (!Array.isArray(step2) || !Array.isArray(step3)) return res.status(400).json({ error: 'step2/step3 no válidos.' });
        if (!step2.length) return res.status(400).json({ error: 'No hay actuaciones que enviar.' });
        if (step2.length !== step3.length) {
            return res.status(400).json({ error: `El nº de actuaciones (${step2.length}) y de emplazamientos (${step3.length}) debe coincidir.` });
        }

        // 3. Resolver provincia + localidad del SO contra el catálogo de Marwen.
        const geo = await marwenService.resolveGeoSolicitante({ provincia: so.provincia, municipio: so.municipio });

        // 4. step1 autoritativo.
        const cif = so.cif || '';
        const step1 = {
            SE_cif: cif,
            SE_figura: figura === 'delegado' ? 'delegado' : 'obligado',
            SE_cod_id_sol: so.codigo_identificacion || (cif ? `SO-${cif}` : ''),
            SE_razon_social: so.razon_social || '',
            SE_provincia: geo.provincia ? Number(geo.provincia.id) : null,
            SE_localidad: geo.localidad ? Number(geo.localidad.id) : null,
            SE_cp: so.codigo_postal || '',
            SE_direccion: so.direccion || '',
            SE_telefono: contacto.telefono || '',
            SE_contacto: contacto.persona || '',
            SE_email: contacto.email || '',
            SE_dispone_internet: 'si',
            SE_n_actuaciones: step2.length,
            SE_solicitud_replicable: 'no',
        };

        // Fechas de actuación → ISO (red de seguridad, el front ya debería mandarlas así).
        const step2norm = step2.map(a => ({
            ...a,
            SE_fecha_inicio: toIsoDate(a.SE_fecha_inicio),
            SE_fecha_fin: toIsoDate(a.SE_fecha_fin),
        }));

        const payload = { step1, step2: step2norm, step3 };
        if (process.env.MARWEN_CODIGO_CLIENTE) payload.codigo_cliente = process.env.MARWEN_CODIGO_CLIENTE;

        // Bloqueos duros: sin IDs de geo no se puede enviar.
        const blocking = [];
        if (step1.SE_provincia == null) blocking.push('No se pudo resolver el ID de PROVINCIA del Sujeto Obligado en Marwen.');
        if (step1.SE_localidad == null) blocking.push('No se pudo resolver el ID de LOCALIDAD del Sujeto Obligado en Marwen.');

        // 5. dryRun → previsualización sin enviar.
        if (dryRun) {
            return res.json({
                dryRun: true,
                destino: marwenService.BASE_URL,
                solicitante: { razon_social: so.razon_social, cif, provincia: so.provincia, municipio: so.municipio, cp: so.codigo_postal, direccion: so.direccion },
                resolved: { provincia: geo.provincia, localidad: geo.localidad },
                warnings: geo.warnings,
                blocking,
                payload,
            });
        }

        // 6. Envío real.
        if (blocking.length) return res.status(422).json({ error: blocking.join(' '), warnings: geo.warnings });
        if (!step1.SE_email || !step1.SE_contacto) return res.status(400).json({ error: 'Falta la persona de contacto o el email del solicitante.' });

        const result = await marwenService.enviarSolicitudEstandarizada(payload);

        // 7. Persistir resultado en el lote + historial.
        const verificacionApi = {
            num_solicitud: result.num_solicitud || null,
            tipo_solicitud: result.tipo_solicitud || 'estandarizada',
            enviado_at: nowIso(),
            enviado_por: usuarioDe(req),
            destino: marwenService.BASE_URL,
            n_actuaciones: step2.length,
            provincia_id: step1.SE_provincia,
            localidad_id: step1.SE_localidad,
        };
        const historial = Array.isArray(lote.historial) ? lote.historial.slice() : [];
        historial.push({
            id: `${Date.now()}_api_verif`, tipo: 'sistema',
            texto: `Enviado al verificador por API (Marwen) · solicitud ${result.num_solicitud || '—'} · ${step2.length} actuaciones`,
            fecha: nowIso(), usuario: usuarioDe(req),
        });
        const update = { verificacion_api: verificacionApi, historial, updated_at: nowIso() };
        // Al enviar la solicitud por API el lote pasa a "solicitado presupuesto al verificador".
        if (lote.estado === 'BORRADOR') {
            update.estado = 'SOLICITADO PRESUPUESTO A VERIFICADOR';
        }
        const { data: updated, error: upErr } = await supabase.from('lotes').update(update).eq('id', lote.id).select().single();
        if (upErr) throw upErr;
        const [enriched] = await enrichLotes([updated]);

        res.json({
            ok: true,
            num_solicitud: result.num_solicitud,
            tipo_solicitud: result.tipo_solicitud,
            message: result.message,
            lote: scrubLoteForUser(enriched, req),
        });
    } catch (err) {
        console.error('[POST /lotes/:id/enviar-verificador-api]', err.message);
        const code = (err.status && err.status >= 400 && err.status < 500) ? 422 : 500;
        res.status(code).json({ error: err.message || 'Error al enviar la solicitud por API', marwen: err.marwen || null });
    }
});

module.exports = router;
