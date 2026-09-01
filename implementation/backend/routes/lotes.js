const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { adminOnly, staffOnly, isAdmin } = require('../middleware/auth');
const { stripDatosCalculoMargin } = require('../utils/financialScrub');
const { CEE_ECO_SELECT, rebuildCee } = require('../utils/ceeEcoFields');
const geoCcaa = require('../services/geoCcaa');
const loteService = require('../services/loteService');
const marwenService = require('../services/marwenService');
const driveService = require('../services/driveService');
const { carpetaObjetivoLote } = require('../services/driveFolders');
const {
    syncLoteFolder, absorberExpedientesEnLote, devolverExpedienteDeLote,
} = require('../services/expedienteFolderSync');
const { htmlToPdf } = require('../services/pdfService');

const {
    MAX_RECOMENDADO, ESTADOS_COMPLETO, LOTE_ESTADOS,
    loadExpedienteContext, evaluarElegibilidadBase, casaConLote,
    nextLoteCodigo, sugerirMismoInstalador,
} = loteService;
const {
    LOTE_DOC_SLOTS, SLOTS_SUBIBLES, nextDocKey, slotDeKey, sincronizarEstadoLote,
    CARPETA_DOCS, nombreDocLote, guardarDocFirmado,
} = require('../services/loteDocs');
const { leerFacturaVerificador, leerInformeVerificacion, leerDictamenVerificacion } = require('../services/loteOcrService');
const {
    casarActuaciones, casarDictamen, contrastarTotal, verificarFacturaDelLote,
    aplicarAhorrosVerificados, aplicarDatosDictamen, puedePagarseAlCliente,
} = require('../services/loteVerificados');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usuarioDe(req) {
    return req.user?.perfilCompleto?.nombre || req.user?.email || 'ADMIN';
}

function nowIso() { return new Date().toISOString(); }

// Remitente del email al Sujeto Obligado (decisión usuario 2026-07-13): sale desde la
// cuenta personal en lugar de la genérica brokergy@brokergy.es. Debe ser una dirección
// del MISMO dominio SMTP. Editable por env. El nombre visible lo pone el remitente
// configurado en la app (getSender) salvo que se especifique aquí.
const SO_EMAIL_FROM = { address: process.env.LOTE_SO_EMAIL_FROM || 'franciscojavier.moya@brokergy.es' };

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

// Carpeta del lote en Drive. El padre es la carpeta de estado que le toca al lote
// (BORRADOR → "06. REVISADO LISTO PARA VERIFICAR", enviado → "07. ENVIADOS A
// VERIFICAR", FINALIZADO → "11. FINALIZADOS"…, ver services/driveFolders.js).
// Se crea bajo demanda y se cachea en lotes.drive_folder_id.
// Dentro de esta carpeta se mueven las carpetas de los expedientes del lote y se
// depositan los documentos del lote (Anexo I, fichas, solicitud y sus firmados).
// A partir de ahí manda el ESTADO DEL LOTE: la carpeta viaja con todo dentro.
async function ensureLoteFolder(lote) {
    if (lote.drive_folder_id) return lote.drive_folder_id;
    let parent = carpetaObjetivoLote(lote.estado);
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

// Subcarpeta de la carpeta del lote donde va TODO el papeleo de nivel lote
// (solicitud, Anexo I, oferta, informes del verificador, facturas). Así la raíz del
// lote solo contiene las carpetas de sus expedientes. Se crea de forma perezosa, al
// escribir el primer documento: un lote en BORRADOR puede borrarse y no queremos
// dejar árboles vacíos en Drive. Si Drive falla, cae a la raíz del lote y no bloquea.
async function ensureLoteDocsFolder(lote) {
    const loteFolder = await ensureLoteFolder(lote);
    try {
        const nombre = CARPETA_DOCS(lote.codigo || `LOTE-${String(lote.id).slice(0, 8)}`);
        const sub = await driveService.getOrCreateSubfolder(loteFolder, nombre);
        return sub || loteFolder;
    } catch (_) {
        return loteFolder;
    }
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

// Guarda un documento del lote como una REVISIÓN. Si ya existía una versión previa
// (borrador y/o firmado) generada por la app, se ARCHIVA en la subcarpeta "OLD"
// (renombrada _OLD) en vez de mandarla a la papelera, y el nuevo borrador se nombra
// con sufijo _rev{N}. Si no había versión previa (primer envío / lote legacy), se
// guarda con el nombre base sin sufijo. Devuelve { rev, fileName, saved }.
//   · existing     entrada previa de documentos_so (o null)
//   · baseFileName nombre base sin extensión ni sufijo (p.ej. "26RES060_89 - Ficha RES060")
//   · key          clave del documento (para derivar el nombre del firmado antiguo)
//   · expFolder    carpeta del expediente (para archivar el firmado en "10. EXPEDIENTE CAE"); null si es doc de lote
//   · draftFolder  carpeta donde vive el borrador
//   · folderId     carpeta del lote (fallback para el firmado de docs de lote)
async function saveDocRevision({ existing, baseFileName, key, expFolder, draftFolder, folderId, pdf }) {
    const hadPrev = !!(existing && (existing.draft_file_id || existing.signed_file_id));
    const rev = hadPrev ? ((existing.rev || 0) + 1) : (existing?.rev || 0);

    // Archivar el FIRMADO anterior (si el S.O. ya lo había firmado) a OLD.
    if (existing?.signed_file_id) {
        const signedFolder = expFolder
            ? (await driveService.getOrCreateSubfolder(expFolder, '10. EXPEDIENTE CAE') || folderId)
            : folderId;
        const oldSignedName = `${String(existing.file_name || existing.label || key).replace(/\.pdf$/i, '')}_fdo.pdf`;
        await driveService.archiveExistingToOld(signedFolder, existing.signed_file_id, oldSignedName);
    }
    // Archivar el BORRADOR anterior a OLD.
    if (existing?.draft_file_id) {
        await driveService.archiveExistingToOld(draftFolder, existing.draft_file_id, existing.file_name || pdfFileName(baseFileName));
    }

    const fileName = pdfFileName(rev > 0 ? `${baseFileName}_rev${rev}` : baseFileName);
    const saved = await saveOrReplacePdf(draftFolder, fileName, pdf);
    return { rev, fileName, saved };
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
            ? supabase.from('prescriptores').select('id_empresa, razon_social, acronimo, precio_referencia, codigo_identificacion, email, cif, direccion, codigo_postal, municipio, provincia, nombre_responsable, apellidos_responsable, nif_responsable, landing_telefono_contacto, contactos_notificacion, contacto_notificaciones_activas, logo_empresa').in('id_empresa', presIds)
            : Promise.resolve({ data: [] }),
        // `cee` se pide por campos (sin el XML crudo) y de `documentacion` solo la
        // fecha del CIFO, que es lo único que mira geoCcaa.resolveAnioActuacion.
        // Traer ambas columnas enteras costaba 1,5 s y descomprimía toda la tabla.
        supabase.from('expedientes')
            .select(`id, lote_id, numero_expediente, instalacion, oportunidad_id, doc_fecha_fin_cifo:documentacion->fecha_fin_cifo, ${CEE_ECO_SELECT}`)
            .in('lote_id', loteIds),
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
        // Rehacemos `cee` y `documentacion` con la forma de siempre a partir de los
        // campos aplanados del select ligero: los consumidores no se enteran del cambio.
        const { doc_fecha_fin_cifo, ...resto } = e;
        const fila = rebuildCee(resto);
        fila.documentacion = { fecha_fin_cifo: doc_fecha_fin_cifo ?? null };
        (expByLote[e.lote_id] = expByLote[e.lote_id] || []).push({ ...fila, oportunidades: ecoOpMap[e.oportunidad_id] || null });
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
        // Igual que enrichLotes: `cee` por campos (sin el XML crudo) y de `documentacion`
        // solo la fecha del CIFO. Antes este select traía las dos columnas completas de
        // ~220 expedientes — 3,5 s de media y el peor consumo de memoria de la app.
        const { data: rawRows, error } = await supabase
            .from('expedientes')
            .select(`id, numero_expediente, estado, instalador_asociado_id, instalacion, cliente_id, oportunidad_id, doc_fecha_fin_cifo:documentacion->fecha_fin_cifo, ${CEE_ECO_SELECT}`)
            .is('lote_id', null);
        if (error) throw error;

        const rows = (rawRows || []).map(({ doc_fecha_fin_cifo, ...r }) => {
            const fila = rebuildCee(r);
            fila.documentacion = { fecha_fin_cifo: doc_fecha_fin_cifo ?? null };
            return fila;
        });

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

        const { sujeto_obligado_id, verificador_id, notas, coste_verificacion, oferta_lote, expediente_verificador } = req.body || {};
        const update = { updated_at: nowIso() };

        // Nº de expediente que el verificador da al lote en SU sistema. Dato manual e
        // informativo, no económico: lo edita todo el staff.
        if (expediente_verificador !== undefined) {
            const v = String(expediente_verificador || '').trim();
            update.expediente_verificador = v || null;
        }

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

        const docsFolder = await ensureLoteDocsFolder(lote);
        const pdfBuffer = await htmlToPdf(html);
        // Nombre del fichero: "5. {nº factura} - {nombre lote} - {acrónimo S.O.}.pdf".
        // El acrónimo del S.O. no viene en el lote crudo (solo el id) → se busca.
        let acronimoSO = 'SO';
        if (lote.sujeto_obligado_id) {
            const { data: soRow } = await supabase.from('prescriptores').select('acronimo, razon_social').eq('id_empresa', lote.sujeto_obligado_id).maybeSingle();
            if (soRow) acronimoSO = soRow.acronimo || soRow.razon_social || 'SO';
        }
        const fileName = pdfFileName(nombreDocLote('factura_so', {
            label: `${factura.numero} - ${lote.codigo || 'LOTE'} - ${acronimoSO}`,
        }));
        const saved = await saveOrReplacePdf(docsFolder, fileName, pdfBuffer);
        if (!saved) throw new Error('No se pudo guardar la factura en Drive');

        await upsertFacturaSo(lote, factura, {
            emit: true,
            drive_link: saved.link,
            drive_file_id: saved.id || null,
            generada_por: usuarioDe(req),
        });
        await supabase.from('lotes').update({ updated_at: nowIso() }).eq('id', lote.id);

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
// ─── GET /api/lotes/:id/local-path — ruta de la carpeta en el disco ─────────────
// Espejo de `GET /api/expedientes/:id/local-path` (ver memoria del protocolo
// brokergylocal:). El navegador no puede abrir `file://`, así que devolvemos la
// ruta de Windows y el frontend la lanza por el protocolo propio.
//
// La ruta se reconstruye SUBIENDO por las carpetas padre en Drive, no se compone a
// mano: así sigue siendo correcta aunque el lote cambie de carpeta de estado
// (06. LISTO PARA VERIFICAR → 07. ENVIADOS A VERIFICAR → …).
router.get('/:id/local-path', staffOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase
            .from('lotes').select('id, codigo, drive_folder_id').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
        if (!lote.drive_folder_id) {
            return res.status(404).json({ error: 'El lote todavía no tiene carpeta de Drive. Se crea al enviar el primer documento.' });
        }

        const { getFolderPathSegments, sanitizeWindowsSegment } = require('../services/driveService');
        const rawSegments = await getFolderPathSegments(lote.drive_folder_id);
        if (!rawSegments.length) {
            return res.status(502).json({ error: 'No se pudo resolver la ruta de la carpeta en Drive' });
        }
        // Google sustituye los caracteres ilegales de Windows (\ / : * ? " < > |)
        // al espejar la carpeta, así que la ruta local no lleva el nombre crudo.
        const segments = rawSegments.map(sanitizeWindowsSegment);
        const base = (process.env.LOCAL_DRIVE_BASE || 'C:\\Users\\Usuario\\Mi unidad').replace(/[\\/]+$/, '');

        res.json({
            path: [base, ...segments].join('\\'),
            folderName: segments[segments.length - 1],
            segments,
        });
    } catch (err) {
        console.error('[GET /lotes/:id/local-path]', err.message);
        res.status(500).json({ error: 'Error al resolver la ruta local', details: err.message });
    }
});

// ─── POST /api/lotes/:id/documentos/:slot ─────────────────────────────────────
// Sube UN documento del lote al slot indicado (ver services/loteDocs.js): la
// solicitud de verificación, la oferta que devuelve el verificador, un informe de
// inexactitudes (admite varios), el informe de verificación, el dictamen favorable
// o la factura del verificador. Va a la carpeta Drive del lote y se registra en
// `documentos_so`, que es lo que pinta el módulo de fases del proceso.
//
// Con `firmado: true` se sube el documento YA FIRMADA por el S.O. (caso "nos la
// devuelven firmada por email"): no toca el borrador, solo rellena signed_*, igual
// que si la hubiera firmado él mismo desde /firmar-lote/:id.
//
// ─── Ahorros verificados: leer el informe y proponer ──────────────────────────
// El informe de verificación es el documento que fija, actuación por actuación, el
// ahorro que el verificador da por bueno. Es el número con el que se factura al
// Sujeto Obligado y con el que se le paga al cliente, así que aquí solo se PROPONE:
// se lee, se casa contra los expedientes del lote y se devuelve con sus avisos.
// Quien aplica es una persona (POST /:id/ahorros-verificados).
//
// Nunca lanza: si el lector falla, la subida del documento no se cae con él.
// Los expedientes del lote, con lo que hace falta para casar contra ellos.
//
// Se piden SIN join: `expedientes` tiene más de una relación con `clientes` y
// PostgREST rechaza el embed por ambiguo. Fallaba en silencio (data null → ninguna
// actuación casaba) y la pantalla acusaba al informe de citar expedientes que no
// eran del lote — por eso ahora un error de lectura LANZA.
//
// De `documentacion` solo se pide `facturas` (regla 22): la columna entera puede
// llegar a megas y aquí solo se necesita la inversión ya registrada.
async function expedientesDelLote(loteId) {
    const { data: exps, error } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, cliente_id, instalacion, doc_facturas:documentacion->facturas')
        .eq('lote_id', loteId);
    if (error) throw new Error(`No se pudieron leer los expedientes del lote: ${error.message}`);

    const cliIds = [...new Set((exps || []).map(e => e.cliente_id).filter(Boolean))];
    let cliMap = new Map();
    if (cliIds.length) {
        const { data: clis } = await supabase.from('clientes')
            .select('id, nombre_razon_social').in('id', cliIds);
        cliMap = new Map((clis || []).map(c => [c.id, c.nombre_razon_social]));
    }
    return (exps || []).map(e => {
        // La inversión que consta hoy: la ya verificada si la hay, y si no la suma
        // de las facturas registradas, que es la que viaja al Anexo.
        const facturas = Array.isArray(e.doc_facturas) ? e.doc_facturas : [];
        const sumaFacturas = facturas.reduce((a, f) => a + (Number(f?.importe_sin_iva) || 0), 0);
        return {
            id: e.id,
            numero_expediente: e.numero_expediente,
            instalacion: e.instalacion,
            cliente_nombre: cliMap.get(e.cliente_id) || null,
            inversion_actual_eur: Number(e.instalacion?.verificacion?.inversion_verificada_eur) || sumaFacturas || null,
        };
    });
}

async function proponerAhorrosVerificados(lote, pdfBuffer) {
    try {
        const informe = await leerInformeVerificacion(pdfBuffer);
        const expedientes = await expedientesDelLote(lote.id);
        const { filas, faltan, avisos } = casarActuaciones(informe.actuaciones, expedientes);
        const total = contrastarTotal(informe, filas);
        return {
            leido: true,
            informe: {
                expediente_cae: informe.expediente_cae,
                id_verificacion: informe.id_verificacion,
                fecha_informe: informe.fecha_informe,
                dictamen: informe.dictamen,
                entidad_verificadora: informe.entidad_verificadora,
                total_kwh: informe.total_kwh,
            },
            filas,
            faltan,
            avisos: [...avisos, ...(total.aviso ? [total.aviso] : [])],
            total,
        };
    } catch (err) {
        console.warn('[lotes] OCR informe de verificación:', err.message);
        return { leido: false, error: err.message, filas: [], faltan: [], avisos: [] };
    }
}

// ─── El DICTAMEN trae los datos DEFINITIVOS ───────────────────────────────────
// Cierra la verificación: su nº, su fecha y —fila a fila— la inversión y el ahorro
// que el organismo da por buenos. Mandan sobre lo declarado al principio, que ha
// podido corregirse en un requerimiento.
//
// Igual que el informe: se lee y se PROPONE. Nunca lanza.
async function proponerDatosDictamen(lote, pdfBuffer) {
    try {
        const dictamen = await leerDictamenVerificacion(pdfBuffer);
        const expedientes = await expedientesDelLote(lote.id);
        const { filas, faltan, avisos, sinCambios, nCambian } = casarDictamen(dictamen.actuaciones, expedientes);
        const total = contrastarTotal(dictamen, filas);
        return {
            leido: true,
            dictamen: {
                numero_dictamen: dictamen.numero_dictamen,
                expediente_cae: dictamen.expediente_cae,
                referencia_informe: dictamen.referencia_informe,
                decision: dictamen.decision,
                fecha_emision: dictamen.fecha_emision,
                anio_finalizacion: dictamen.anio_finalizacion,
                ccaa: dictamen.ccaa,
                organismo: dictamen.organismo,
                acreditacion_enac: dictamen.acreditacion_enac,
                total_kwh: dictamen.total_kwh,
            },
            filas,
            faltan,
            avisos: [...avisos, ...(total.aviso ? [total.aviso] : [])],
            total,
            sinCambios,
            nCambian,
        };
    } catch (err) {
        console.warn('[lotes] OCR dictamen:', err.message);
        return { leido: false, error: err.message, filas: [], faltan: [], avisos: [] };
    }
}

// Cada subida puede AVANZAR el estado del lote (sincronizarEstadoLote).
router.post('/:id/documentos/:slot', staffOnly, async (req, res) => {
    try {
        const slot = req.params.slot;
        const cfg = LOTE_DOC_SLOTS[slot];
        if (!cfg || !SLOTS_SUBIBLES.includes(slot)) {
            return res.status(400).json({ error: `Documento de lote no válido: ${slot}` });
        }
        const { base64, fileName, firmado, importe } = req.body || {};
        if (!base64) return res.status(400).json({ error: 'Falta el fichero' });

        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const docsFolder = await ensureLoteDocsFolder(lote);
        const buffer = Buffer.from(String(base64).split(',').pop(), 'base64');
        const esFirmado = !!firmado && !!cfg.firmable;

        // Releemos `documentos_so` justo antes de escribir para no pisar cambios de
        // otro envío en curso.
        const { data: fresh } = await supabase.from('lotes').select('documentos_so, historial').eq('id', lote.id).maybeSingle();
        const docs = Array.isArray(fresh?.documentos_so) ? [...fresh.documentos_so] : [];

        // Un slot `multiple` abre entrada nueva en cada subida; el resto se reemplaza.
        const key = esFirmado ? slot : nextDocKey(docs, slot);
        const idx = docs.findIndex(d => d?.key === key);
        const previa = idx >= 0 ? docs[idx] : null;
        if (esFirmado && !previa) {
            return res.status(409).json({ error: `Sube antes el borrador de "${cfg.label}" para poder registrar el firmado.` });
        }

        // El nombre en Drive es SIEMPRE el canónico (prefijo numérico + slot), no el
        // del fichero que sube el usuario: es lo que ordena la carpeta. El original se
        // guarda en la entrada por trazabilidad (trae la referencia del verificador).
        const nDoc = cfg.multiple ? String(key).split('_').pop() : null;
        const baseName = nombreDocLote(slot, { n: nDoc, codigo: lote.codigo });
        const name = pdfFileName(esFirmado ? `${baseName}_fdo` : baseName);
        const saved = await saveOrReplacePdf(docsFolder, name, buffer);
        if (!saved) throw new Error(`No se pudo guardar "${cfg.label}" en Drive`);

        const entrada = esFirmado
            ? { ...previa, signed_link: saved.link, signed_file_id: saved.id, signed_at: nowIso() }
            : {
                key,
                tipo: slot,
                // `nDoc` solo existe en los slots MÚLTIPLES (inexactitudes 1, 2…).
                // Interpolarlo a secas dejaba "Informe de Verificaciónnull" en
                // pantalla para todos los demás.
                label: `${cfg.label}${nDoc ? ` ${nDoc}` : ''}`,
                expediente_id: null,
                file_name: name,
                // Documentos redactados por terceros (verificador): no hay plantilla
                // propia ni recuadro de firma fijo. Se buscan estos textos para
                // pre-situarlo; si no aparecen, el firmante lo dibuja a mano.
                anchor: cfg.firmable ? ['conforme', 'aceptaci', 'fdo', 'firma', 'el cliente'] : null,
                fixedBox: null,
                draft_link: saved.link,
                draft_file_id: saved.id,
                // Nombre con el que llegó el fichero: en la oferta y los informes del
                // verificador lleva su número de referencia y no queremos perderlo.
                original_file_name: fileName || null,
                signed_link: null,
                signed_file_id: null,
                sent_at: null,
                signed_at: null,
                uploaded_at: nowIso(),
            };
        if (idx >= 0) docs[idx] = entrada; else docs.push(entrada);

        const historial = Array.isArray(fresh?.historial) ? [...fresh.historial] : [];
        historial.push({
            id: `${Date.now()}_doc_${slot}`, tipo: 'sistema',
            texto: esFirmado
                ? `Registrado "${entrada.label}" FIRMADO por el S.O. (${name}).`
                : `Subido "${entrada.label}" (${name}).`,
            fecha: nowIso(), usuario: usuarioDe(req),
        });

        // `drive_folder_id` ya lo persiste ensureLoteFolder.
        const update = { documentos_so: docs, historial, updated_at: nowIso() };

        // ── El importe de la factura del verificador ──────────────────────────
        // Se guarda en la ENTRADA del documento (de quién es la factura y por
        // cuánto) y ADEMÁS en `lotes.coste_verificacion`, que es de donde lo lee
        // el cálculo del €/MWh que le sale al Sujeto Obligado. Vivían separados y
        // había que teclear el mismo número dos veces: subías la factura con su
        // importe y el resumen seguía diciendo que no había coste de verificación.
        //
        // La verificación la paga el S.O., no Brokergy: este importe NO entra en
        // nuestro margen, solo en lo que a él le cuesta la operación.
        let ocr = null;
        if (cfg.importe && !esFirmado) {
            let importeNum = Number(importe);
            // Si no viene tecleado, se LEE de la propia factura. Un fallo del
            // lector no puede tumbar la subida: el PDF ya está en Drive y el
            // importe se puede escribir a mano.
            if (!(Number.isFinite(importeNum) && importeNum > 0)) {
                try {
                    const leida = await leerFacturaVerificador(buffer);
                    const verificador = lote.verificador_id
                        ? (await supabase.from('prescriptores')
                            .select('id_empresa, razon_social, cif').eq('id_empresa', lote.verificador_id).maybeSingle()).data
                        : null;
                    const chequeo = verificarFacturaDelLote(leida, lote, verificador
                        ? { ...verificador, nombre_empresa: verificador.razon_social } : null);
                    ocr = { ...leida, avisos: chequeo.avisos, leido: true };
                    // Se usa la BASE IMPONIBLE: es lo que se compara con el resto
                    // de importes de la app, todos sin IVA. Sin base declarada no
                    // se cae al total con IVA — inflaría el coste del S.O. un 21 %.
                    if (leida.base_imponible > 0) importeNum = leida.base_imponible;
                } catch (err) {
                    console.warn('[lotes] OCR factura verificador:', err.message);
                    ocr = { leido: false, error: err.message };
                }
            }
            if (Number.isFinite(importeNum) && importeNum > 0) {
                entrada.importe = importeNum;
                if (ocr?.leido) {
                    entrada.importe_ocr = true;         // "compruébalo" en la UI
                    entrada.numero_factura = ocr.numero_factura || null;
                    entrada.fecha_factura = ocr.fecha_factura || null;
                }
                update.documentos_so = docs;
                const antes = Number(lote.coste_verificacion);
                if (!(antes === importeNum)) {
                    update.coste_verificacion = importeNum;
                    historial.push({
                        id: `${Date.now()}_coste_verif`, tipo: 'sistema',
                        texto: `Coste de verificación ${Number.isFinite(antes) && antes > 0 ? `${antes} € → ` : ''}${importeNum} €`
                            + `${ocr?.leido ? ` (leído de la factura${ocr.numero_factura ? ` ${ocr.numero_factura}` : ''})` : ''}.`,
                        fecha: nowIso(), usuario: usuarioDe(req),
                    });
                    update.historial = historial;
                }
            }
        }

        // ── El informe de verificación trae el ahorro VERIFICADO de cada uno ───
        // Se lee y se PROPONE, casado contra los expedientes del lote; escribirlo
        // lo decide una persona desde `POST /:id/ahorros-verificados`. Sobre este
        // número se factura al S.O. y se le paga al cliente: no se toca solo.
        let ahorros = null;
        if (slot === 'informe_verificacion' && !esFirmado) {
            ahorros = await proponerAhorrosVerificados(lote, buffer);
        }

        // El DICTAMEN: su cabecera (nº, fecha, decisión) se sella en la entrada del
        // documento sin preguntar —es identificación del papel, no una cifra que
        // toque ningún expediente— y sus filas se proponen para revisar.
        let dictamen = null;
        if (slot === 'dictamen_favorable' && !esFirmado) {
            dictamen = await proponerDatosDictamen(lote, buffer);
            if (dictamen.leido) {
                entrada.dictamen = dictamen.dictamen;
                update.documentos_so = docs;
            }
        }

        await supabase.from('lotes').update(update).eq('id', lote.id);

        // Un informe de inexactitudes REABRE el lote aunque ya estuviera VERIFICADO:
        // es el único paso atrás legítimo del proceso.
        await sincronizarEstadoLote(lote.id, {
            docs,
            usuario: usuarioDe(req),
            motivo: `subida de ${entrada.label}`,
            ...(slot === 'informe_inexactitudes'
                ? { destino: 'REQUERIMIENTO VERIFICADOR', retroceso: true }
                : slot === 'requerimiento_ga'
                    ? { destino: 'REQUERIMIENTO G.A.', retroceso: true }
                    : {}),
        });

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, documento: entrada, ocr, ahorros, dictamen, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[POST /lotes/:id/documentos/:slot]', err.message);
        res.status(500).json({ error: err.message || 'Error al subir el documento del lote' });
    }
});

// ─── POST /api/lotes/:id/ahorros-verificados/leer ────────────────────────────────
// Relee el informe de verificación que YA está subido al lote y devuelve la
// propuesta. Sirve para los lotes cuyo informe se subió antes de que la app
// supiera leerlo, y para volver a mirarlo sin tener que subirlo otra vez.
router.post('/:id/ahorros-verificados/leer', adminOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const doc = (lote.documentos_so || []).find(d => d?.key === 'informe_verificacion');
        const fileId = doc?.draft_file_id;
        if (!fileId) return res.status(409).json({ error: 'Este lote no tiene subido el informe de verificación.' });

        const buffer = await driveService.getFileContent(fileId);
        if (!buffer) return res.status(502).json({ error: 'No se pudo descargar el informe desde Drive.' });

        const propuesta = await proponerAhorrosVerificados(lote, buffer);
        if (!propuesta.leido) return res.status(502).json({ error: propuesta.error || 'No se pudo leer el informe.' });
        res.json(propuesta);
    } catch (err) {
        console.error('[POST /lotes/:id/ahorros-verificados/leer]', err.message);
        res.status(500).json({ error: err.message || 'Error al leer el informe de verificación' });
    }
});

// ─── POST /api/lotes/:id/dictamen/leer ───────────────────────────────────────────
// Relee el dictamen que YA está subido y devuelve la propuesta (nº, fecha e
// inversión definitiva de cada actuación). Sirve para los lotes cuyo dictamen se
// subió antes de que la app supiera leerlo.
router.post('/:id/dictamen/leer', adminOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const doc = (lote.documentos_so || []).find(d => d?.key === 'dictamen_favorable');
        const fileId = doc?.draft_file_id;
        if (!fileId) return res.status(409).json({ error: 'Este lote no tiene subido el dictamen favorable.' });

        const buffer = await driveService.getFileContent(fileId);
        if (!buffer) return res.status(502).json({ error: 'No se pudo descargar el dictamen desde Drive.' });

        const propuesta = await proponerDatosDictamen(lote, buffer);
        if (!propuesta.leido) return res.status(502).json({ error: propuesta.error || 'No se pudo leer el dictamen.' });

        // La cabecera del dictamen se sella al leerlo: identifica al documento y no
        // toca ninguna cifra de ningún expediente.
        const docs = (lote.documentos_so || []).map(d =>
            d?.key === 'dictamen_favorable' ? { ...d, dictamen: propuesta.dictamen } : d);
        await supabase.from('lotes').update({ documentos_so: docs, updated_at: nowIso() }).eq('id', lote.id);

        res.json(propuesta);
    } catch (err) {
        console.error('[POST /lotes/:id/dictamen/leer]', err.message);
        res.status(500).json({ error: err.message || 'Error al leer el dictamen' });
    }
});

// ─── POST /api/lotes/:id/dictamen/aplicar ────────────────────────────────────────
// Escribe la INVERSIÓN DEFINITIVA (y la vida útil) en los expedientes. ADMIN: es la
// cifra que el verificador ha dado por buena y la que manda sobre lo declarado.
router.post('/:id/dictamen/aplicar', adminOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const filas = Array.isArray(req.body?.filas) ? req.body.filas : [];
        if (!filas.length) return res.status(400).json({ error: 'No hay nada que aplicar.' });

        // Solo expedientes DE ESTE LOTE: el id llega del navegador.
        const { data: miembros } = await supabase.from('expedientes').select('id').eq('lote_id', lote.id);
        const permitidos = new Set((miembros || []).map(m => m.id));
        if (filas.some(f => !permitidos.has(f?.expediente_id))) {
            return res.status(400).json({ error: 'Alguna fila no pertenece a este lote.' });
        }

        const { aplicados, errores } = await aplicarDatosDictamen(filas, {
            usuario: usuarioDe(req),
            numero: req.body?.numero_dictamen || null,
            fecha: req.body?.fecha_emision || null,
        });

        if (aplicados.length) {
            const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
            historial.push({
                id: `${Date.now()}_dictamen`, tipo: 'sistema',
                texto: `Inversión definitiva del dictamen${req.body?.numero_dictamen ? ` ${req.body.numero_dictamen}` : ''} registrada en `
                    + `${aplicados.length} expediente${aplicados.length === 1 ? '' : 's'}: `
                    + aplicados.map(a => `${a.numero_expediente} ${a.inversion_eur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`).join(' · ') + '.',
                fecha: nowIso(), usuario: usuarioDe(req),
            });
            await supabase.from('lotes').update({ historial, updated_at: nowIso() }).eq('id', lote.id);
        }

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, aplicados, errores, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[POST /lotes/:id/dictamen/aplicar]', err.message);
        res.status(500).json({ error: err.message || 'Error al registrar los datos del dictamen' });
    }
});

// ─── POST /api/lotes/:id/ahorros-verificados ─────────────────────────────────────
// Escribe lo verificado en los expedientes: el ahorro y, en la misma pasada, la
// inversión (el informe trae las dos cifras). ADMIN: son las que se facturan y se
// pagan, y una vez pagado no se deshace.
//
// Recibe las filas YA revisadas por una persona:
// [{ expediente_id, ahorro_kwh, inversion_eur? }]. No se acepta el informe entero
// para aplicarlo a ciegas — el paso de revisión es justamente lo que evita
// pagarle a un cliente el ahorro de otro.
router.post('/:id/ahorros-verificados', adminOnly, async (req, res) => {
    try {
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const filas = Array.isArray(req.body?.filas) ? req.body.filas : [];
        if (!filas.length) return res.status(400).json({ error: 'No hay nada que aplicar.' });

        // Solo expedientes DE ESTE LOTE: el id llega del navegador y un id de otro
        // lote escribiría un ahorro verificado donde no toca.
        const { data: miembros } = await supabase.from('expedientes').select('id').eq('lote_id', lote.id);
        const permitidos = new Set((miembros || []).map(m => m.id));
        const ajenos = filas.filter(f => !permitidos.has(f?.expediente_id));
        if (ajenos.length) return res.status(400).json({ error: 'Alguna fila no pertenece a este lote.' });

        const { aplicados, errores } = await aplicarAhorrosVerificados(filas, {
            usuario: usuarioDe(req),
            informe: req.body?.informe_expediente_cae || lote.expediente_verificador || null,
            fechaInforme: req.body?.informe_fecha || null,
            origen: req.body?.origen || 'INFORME_VERIFICACION',
        });

        if (aplicados.length) {
            const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
            historial.push({
                id: `${Date.now()}_ahorros_verif`, tipo: 'sistema',
                texto: `Ahorro verificado registrado en ${aplicados.length} expediente${aplicados.length === 1 ? '' : 's'}: `
                    + aplicados.map(a => `${a.numero_expediente} ${a.ahorro_kwh.toLocaleString('es-ES')} kWh`).join(' · ') + '.',
                fecha: nowIso(), usuario: usuarioDe(req),
            });
            await supabase.from('lotes').update({ historial, updated_at: nowIso() }).eq('id', lote.id);
        }

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, aplicados, errores, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[POST /lotes/:id/ahorros-verificados]', err.message);
        res.status(500).json({ error: err.message || 'Error al registrar los ahorros verificados' });
    }
});

// ─── POST /api/lotes/:id/documentos/:key/firmado — registrar el PDF firmado ─────
// Sirve para CUALQUIER documento del lote (Anexo I, fichas, solicitud, oferta), no
// solo la oferta: el S.O. puede devolver cualquiera firmado por email o traerlo ya
// firmado de fuera de la app, y hay que poder registrarlo sin pasar por el enlace
// público. Misma operación que la firma en /firmar-lote (guardarDocFirmado).
router.post('/:id/documentos/:key/firmado', staffOnly, async (req, res) => {
    try {
        const { base64 } = req.body || {};
        if (!base64) return res.status(400).json({ error: 'Falta el fichero firmado' });

        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });
        if (!lote.drive_folder_id) await ensureLoteFolder(lote);

        const { data: fresh } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const buffer = Buffer.from(String(base64).split(',').pop(), 'base64');
        const { docsSo, entry } = await guardarDocFirmado(fresh, req.params.key, buffer);

        const historial = Array.isArray(fresh.historial) ? [...fresh.historial] : [];
        historial.push({
            id: `${Date.now()}_fdo`, tipo: 'sistema',
            texto: `Registrado el PDF firmado de "${entry.label || req.params.key}".`,
            fecha: nowIso(), usuario: usuarioDe(req),
        });
        await supabase.from('lotes').update({ documentos_so: docsSo, historial, updated_at: nowIso() }).eq('id', lote.id);
        await sincronizarEstadoLote(lote.id, { docs: docsSo, usuario: usuarioDe(req), motivo: `firmado de ${entry.label || req.params.key}` });

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, documento: entry, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[POST /lotes/:id/documentos/:key/firmado]', err.message);
        res.status(500).json({ error: err.message || 'Error al registrar el documento firmado' });
    }
});

// ─── POST /api/lotes/:id/documentos/:key/validar — visto bueno del ADMIN ─────────
// Que un documento vuelva firmado no quiere decir que esté BIEN. El ADMIN lo revisa
// y lo marca OK; hasta entonces se ve como "pendiente de revisar". Con `ok: false`
// se retira el visto bueno. Un firmado nuevo lo retira solo (ver guardarDocFirmado).
router.post('/:id/documentos/:key/validar', adminOnly, async (req, res) => {
    try {
        const ok = req.body?.ok !== false;
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const docs = Array.isArray(lote.documentos_so) ? [...lote.documentos_so] : [];
        const idx = docs.findIndex(d => d && d.key === req.params.key);
        if (idx < 0) return res.status(404).json({ error: 'Documento no encontrado en el lote' });

        docs[idx] = ok
            ? { ...docs[idx], validado_at: nowIso(), validado_por: usuarioDe(req) }
            : { ...docs[idx], validado_at: null, validado_por: null };

        const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
        historial.push({
            id: `${Date.now()}_val`, tipo: 'sistema',
            texto: `${ok ? 'Marcado OK' : 'Retirado el OK de'} "${docs[idx].label || req.params.key}".`,
            fecha: nowIso(), usuario: usuarioDe(req),
        });
        await supabase.from('lotes').update({ documentos_so: docs, historial, updated_at: nowIso() }).eq('id', lote.id);

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[POST /lotes/:id/documentos/:key/validar]', err.message);
        res.status(500).json({ error: err.message || 'Error al marcar el documento' });
    }
});

// ─── DELETE /api/lotes/:id/documentos/:key — quitar un documento subido ─────────
// Solo para los que se suben a mano (un informe de inexactitudes duplicado, un PDF
// equivocado). Los generados por la app (Anexo I, fichas) se regeneran, no se borran.
router.delete('/:id/documentos/:key', staffOnly, async (req, res) => {
    try {
        const key = req.params.key;
        const slot = slotDeKey(key);
        if (!slot || !SLOTS_SUBIBLES.includes(slot)) {
            return res.status(400).json({ error: 'Ese documento no se puede borrar desde aquí.' });
        }
        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const docs = Array.isArray(lote.documentos_so) ? [...lote.documentos_so] : [];
        const idx = docs.findIndex(d => d?.key === key);
        if (idx < 0) return res.status(404).json({ error: 'Documento no encontrado en el lote' });
        const [quitado] = docs.splice(idx, 1);

        // El fichero de Drive se borra sin bloquear: si falla, la entrada ya no está.
        for (const fileId of [quitado.draft_file_id, quitado.signed_file_id].filter(Boolean)) {
            try { await driveService.deleteFile(fileId); } catch (_) { /* no bloqueante */ }
        }

        const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
        historial.push({
            id: `${Date.now()}_doc_del`, tipo: 'sistema',
            texto: `Eliminado "${quitado.label || key}" del lote.`,
            fecha: nowIso(), usuario: usuarioDe(req),
        });
        await supabase.from('lotes').update({ documentos_so: docs, historial, updated_at: nowIso() }).eq('id', lote.id);

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[DELETE /lotes/:id/documentos/:key]', err.message);
        res.status(500).json({ error: err.message || 'Error al borrar el documento del lote' });
    }
});

// ─── POST /api/lotes/:id/enviar-documento/:key — mandar un documento al S.O. ─────
// Sirve para CUALQUIER documento del lote que haya que remitir: la oferta de
// verificación (que además hay que firmar) o la factura del verificador, que le
// llega a él porque es quien contrata la verificación. Adjunta el PDF bajándolo de
// Drive y marca `sent_at` en la entrada.
//
// Si el documento es FIRMABLE, el email lleva además el enlace `/firmar-lote/:id`
// acotado a ese documento (`?doc=`), donde el S.O. puede firmarlo con certificado,
// subirlo firmado a mano o devolvérnoslo por email. Si no lo es (una factura), va
// tal cual, sin enlace de firma.
router.post('/:id/enviar-documento/:key', staffOnly, async (req, res) => {
    try {
        const {
            to, cc, phone, channels = { email: true, whatsapp: false },
            customMessage, frontendOrigin, asunto, etiqueta,
        } = req.body || {};

        if (channels.email && !to) return res.status(400).json({ error: 'Falta el email del destinatario' });
        if (channels.whatsapp && !phone) return res.status(400).json({ error: 'Falta el teléfono para WhatsApp' });

        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const docKey = req.params.key;
        const docs = Array.isArray(lote.documentos_so) ? [...lote.documentos_so] : [];
        const idx = docs.findIndex(d => d?.key === docKey);
        if (idx < 0) return res.status(409).json({ error: 'Ese documento no está en el lote.' });

        const cfg = LOTE_DOC_SLOTS[slotDeKey(docKey)] || {};
        const nombreDoc = docs[idx].label || cfg.label || 'Documento del lote';

        // El PDF vive en Drive: se descarga para adjuntarlo (no guardamos binarios en BD).
        const fileId = docs[idx].draft_file_id || (String(docs[idx].draft_link || '').match(/[-\w]{25,}/) || [])[0];
        if (!fileId) return res.status(409).json({ error: `"${nombreDoc}" no tiene fichero en Drive.` });
        const buf = await driveService.getFileContent(fileId);
        if (!buf || !buf.length) return res.status(409).json({ error: `No se pudo descargar "${nombreDoc}" de Drive.` });

        // Enlace de firma SOLO si el documento se firma. Va ACOTADO a él (`?doc=`): la
        // firma del Anexo I y las fichas es otro proceso y ya pasó, y enseñarle los 8
        // documentos al S.O. cuando solo tiene que firmar uno le despista.
        const origin = (frontendOrigin || process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/$/, '');
        const firmaUrl = cfg.firmable ? `${origin}/firmar-lote/${lote.id}?doc=${encodeURIComponent(docKey)}` : null;
        const msgConEnlace = firmaUrl ? `${customMessage || ''}\n\n${firmaUrl}`.trim() : (customMessage || '');
        const fileName = docs[idx].file_name || `${lote.codigo || 'LOTE'} - ${nombreDoc}.pdf`;

        const warnings = [];
        if (channels.email && to) {
            try {
                const emailService = require('../services/emailService');
                await emailService.sendAnnexEmail({
                    to, cc,
                    userName: lote.codigo || 'LOTE',
                    attachments: [{ filename: fileName, content: buf }],
                    customMessage: msgConEnlace,
                    // `docType` manda en el ASUNTO ("… — Brokergy (LOTE-…)") y en el
                    // titular de la cabecera: que diga la acción, no solo el documento.
                    summaryData: { id: lote.codigo || 'LOTE', docType: asunto || (cfg.firmable ? `Firmar ${nombreDoc}` : nombreDoc) },
                    from: SO_EMAIL_FROM,
                    buttonLabel: firmaUrl ? `🖊️ Firmar ${nombreDoc}` : undefined,
                    pillLabel: etiqueta || (cfg.firmable ? `Firmar ${nombreDoc}` : nombreDoc),
                    preheader: `${nombreDoc} del lote ${lote.codigo || ''}${cfg.firmable ? ' — pendiente de vuestra firma.' : '.'}`,
                });
            } catch (e) { warnings.push(`Email: ${e.message}`); }
        }
        if (channels.whatsapp && phone) {
            try {
                const whatsappService = require('../services/whatsappService');
                await whatsappService.sendText(phone, msgConEnlace);
                await whatsappService.sendMedia(
                    phone,
                    { base64: buf.toString('base64'), filename: fileName, mimetype: 'application/pdf' },
                    { caption: fileName.replace(/\.pdf$/i, ''), splitCaption: false }
                );
            } catch (e) { warnings.push(`WhatsApp: ${e.message}`); }
        }

        const sentAt = nowIso();
        docs[idx] = { ...docs[idx], sent_at: sentAt };
        const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
        const canales = [channels.email && to ? 'email' : null, channels.whatsapp && phone ? 'whatsapp' : null].filter(Boolean).join('+');
        historial.push({
            id: `${Date.now()}_enviar_doc`, tipo: 'sistema',
            texto: `Enviado al S.O. "${nombreDoc}"${cfg.firmable ? ' para firma' : ''}${canales ? ` (${canales})` : ''}.`,
            fecha: sentAt, usuario: usuarioDe(req),
        });
        await supabase.from('lotes').update({ documentos_so: docs, historial, updated_at: sentAt }).eq('id', lote.id);

        // Mandar la oferta deja el lote esperando que la devuelvan firmada.
        await sincronizarEstadoLote(lote.id, { docs, usuario: usuarioDe(req), motivo: `envío de ${nombreDoc}` });

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, firma_url: firmaUrl, warnings, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[POST /lotes/:id/enviar-documento/:key]', err.message);
        res.status(500).json({ error: err.message || 'Error al enviar el documento del lote' });
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

        // 1) Carpeta del lote (padre = "07. ENVIADOS A VERIFICAR") + su subcarpeta de
        //    documentación, donde van los papeles de nivel lote.
        const folderId = await ensureLoteFolder(lote);
        const docsFolder = await ensureLoteDocsFolder(lote);

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
        // Entradas previas por clave: si el lote ya se había enviado, la versión anterior
        // de cada documento se archiva a "OLD" y el nuevo se nombra _rev{N} (saveDocRevision).
        const existingByKey = {};
        for (const x of (Array.isArray(lote.documentos_so) ? lote.documentos_so : [])) {
            if (x && x.key) existingByKey[x.key] = x;
        }

        for (const d of docs) {
            if (!d.html && !d.pdfBase64) continue;
            // `pdfBase64` = PDF ya firmado (p.ej. el Anexo I firmado por el PROVEEDOR/Brokergy);
            // tiene prioridad sobre el HTML para no regenerarlo y perder la firma.
            const pdf = d.pdfBase64 ? Buffer.from(d.pdfBase64, 'base64') : await htmlToPdf(d.html);
            const key = d.expediente_id ? `ficha_${d.expediente_id}` : (d.key || `anexo_i`);
            // Carpeta destino del borrador: expediente/"6. ANEXOS CAE" si es ficha con
            // carpeta resoluble; si no, la carpeta del lote.
            const expFolder = d.expediente_id ? expFolderMap[d.expediente_id] : null;
            // Las FICHAS van a "6. ANEXOS CAE" de su expediente; los documentos de
            // nivel lote (Anexo I) a la subcarpeta de documentación del lote.
            let draftFolder = docsFolder;
            if (expFolder) {
                draftFolder = await driveService.getOrCreateSubfolder(expFolder, '6. ANEXOS CAE') || docsFolder;
            }
            const baseFileName = d.expediente_id ? d.fileName : nombreDocLote(key, { codigo: lote.codigo });
            const { rev, fileName, saved } = await saveDocRevision({ existing: existingByKey[key], baseFileName, key, expFolder, draftFolder, folderId: docsFolder, pdf });
            attachments.push({ filename: fileName, content: pdf });
            documentosSo.push({
                key,
                tipo: d.tipo || (d.expediente_id ? 'ficha_res' : 'anexo_i_listado'),
                expediente_id: d.expediente_id || null,
                exp_folder_id: expFolder || null,
                label: d.label || fileName.replace(/\.pdf$/i, ''),
                file_name: fileName,
                rev,
                anchor: d.anchor || null,
                fixedBox: d.fixedBox || null,
                draft_link: saved?.link || null, draft_file_id: saved?.id || null,
                signed_link: null, signed_file_id: null,
                sent_at: sentAt, signed_at: null,
            });
        }

        // Solicitud de Verificación YA SUBIDA en la fase 1: se conserva su entrada tal
        // cual y se adjunta al email bajándola de Drive. Solo se vuelve a subir si el
        // llamante manda una nueva (`solicitud.base64`), que la reemplaza.
        const solicitudPrevia = existingByKey['solicitud_verificacion'];
        if (!(solicitud && solicitud.base64) && solicitudPrevia) {
            const fileId = solicitudPrevia.draft_file_id || (String(solicitudPrevia.draft_link || '').match(/[-\w]{25,}/) || [])[0];
            let buf = null;
            try { buf = fileId ? await driveService.getFileContent(fileId) : null; } catch (_) { buf = null; }
            if (buf && buf.length) {
                attachments.push({ filename: solicitudPrevia.file_name || 'Solicitud Verificacion.pdf', content: buf });
            }
            documentosSo.push({ ...solicitudPrevia, sent_at: sentAt });
        }

        // Solicitud de Verificación (PDF subido en base64).
        if (solicitud && solicitud.base64) {
            const buf = Buffer.from(solicitud.base64, 'base64');
            const baseName = nombreDocLote('solicitud_verificacion', { codigo: lote.codigo });
            const { rev, fileName, saved } = await saveDocRevision({ existing: existingByKey['solicitud_verificacion'], baseFileName: baseName, key: 'solicitud_verificacion', expFolder: null, draftFolder: docsFolder, folderId: docsFolder, pdf: buf });
            attachments.push({ filename: fileName, content: buf });
            documentosSo.push({
                key: 'solicitud_verificacion', tipo: 'solicitud_verificacion',
                expediente_id: null, exp_folder_id: null, label: 'Solicitud de Verificación',
                file_name: fileName,
                rev,
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
                await emailService.sendAnnexEmail({ to, cc, userName: summ.id, attachments, customMessage: msgConEnlace, summaryData: summ, from: SO_EMAIL_FROM });
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

        // 6) Persistir documentos + historial. Se FUSIONA: las entradas que no se han
        //    regenerado aquí (oferta, informes de inexactitudes, dictamen, factura del
        //    verificador…) siguen en el lote. Antes se sobrescribía la lista entera y
        //    un reenvío al S.O. se llevaba por delante todo el papeleo posterior.
        const regeneradas = new Set(documentosSo.map(d => d.key));
        const documentosFinales = [
            ...(Array.isArray(lote.documentos_so) ? lote.documentos_so : []).filter(d => d && !regeneradas.has(d.key)),
            ...documentosSo,
        ];
        const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
        const canales = [channels.email && to ? 'email' : null, channels.whatsapp && phone ? 'whatsapp' : null].filter(Boolean).join('+');
        historial.push({
            id: `${Date.now()}_enviar_so`, tipo: 'sistema',
            texto: `Enviado al S.O. para firma (${documentosSo.length} doc.${canales ? `, ${canales}` : ''}). Expedientes movidos a la carpeta del lote.`,
            fecha: sentAt, usuario: usuarioDe(req),
        });
        await supabase.from('lotes').update({
            documentos_so: documentosFinales, historial, drive_folder_id: folderId, updated_at: sentAt,
        }).eq('id', lote.id);

        // El lote queda esperando la firma del Sujeto Obligado.
        await sincronizarEstadoLote(lote.id, { docs: documentosFinales, usuario: usuarioDe(req), motivo: 'documentación enviada al S.O.' });

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, firma_url: firmaUrl, movimientos, warnings, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[POST /lotes/:id/enviar-so]', err.message);
        res.status(500).json({ error: err.message || 'Error al enviar al Sujeto Obligado' });
    }
});

// ─── POST /api/lotes/:id/requerimiento — reenviar docs concretos para NUEVA firma ─
// Un requerimiento del S.O./verificador pide corregir y volver a firmar documentos
// concretos (típicamente fichas RES) SIN tocar el resto del lote. A diferencia de
// `enviar-so`, este endpoint:
//   · NO mueve carpetas de expediente (ya se movieron en el envío inicial).
//   · NO sobrescribe `documentos_so`: regenera SOLO las entradas de los `docs`
//     recibidos (match por `key`), reseteando su firma (signed_link=null) para que
//     el S.O. las vuelva a firmar por el mismo enlace `/firmar-lote/:id`, y deja el
//     resto de documentos (ya firmados) intactos.
router.post('/:id/requerimiento', staffOnly, async (req, res) => {
    try {
        const {
            to, cc, phone, channels = { email: true, whatsapp: false },
            customMessage, summaryData, docs = [], frontendOrigin, avisoWhatsApp,
            // WhatsApp con mensaje propio: cuando también va el email, por WhatsApp
            // se manda solo un AVISO ("revisa el correo"), sin enlace de firma ni
            // PDFs adjuntos. Si no vienen, se mantiene el envío completo de antes.
            whatsappMessage, whatsappAttachments,
        } = req.body || {};

        if (!Array.isArray(docs) || docs.length === 0) {
            return res.status(400).json({ error: 'No hay documentos que reenviar' });
        }
        if (channels.email && !to) return res.status(400).json({ error: 'Falta el email del destinatario' });
        if (channels.whatsapp && !phone) return res.status(400).json({ error: 'Falta el teléfono para WhatsApp' });

        const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const folderId = await ensureLoteFolder(lote);
        const docsFolder = await ensureLoteDocsFolder(lote);

        // Estado actual de documentos_so (se conserva; solo se tocan las entradas reenviadas).
        const documentosSo = Array.isArray(lote.documentos_so) ? [...lote.documentos_so] : [];
        const keyOf = (d) => (d.expediente_id ? `ficha_${d.expediente_id}` : (d.key || 'anexo_i'));

        // Resolver la carpeta "6. ANEXOS CAE" del expediente solo para las fichas que
        // no tengan ya `exp_folder_id` en su entrada (p.ej. una ficha nueva).
        const needExpFolder = docs
            .filter(d => d.expediente_id && !documentosSo.find(x => x.key === keyOf(d))?.exp_folder_id)
            .map(d => d.expediente_id);
        let expFolderMap = {};
        if (needExpFolder.length) {
            const { data: exps } = await supabase
                .from('expedientes').select('id, oportunidad_id').in('id', needExpFolder);
            const opIds = [...new Set((exps || []).map(e => e.oportunidad_id).filter(Boolean))];
            let opMap = {};
            if (opIds.length) {
                const { data: ops } = await supabase.from('oportunidades').select('id, datos_calculo').in('id', opIds);
                opMap = Object.fromEntries((ops || []).map(o => [o.id, o]));
            }
            for (const e of (exps || [])) {
                const dc = opMap[e.oportunidad_id]?.datos_calculo || {};
                expFolderMap[e.id] = dc.drive_folder_id || dc.inputs?.drive_folder_id || null;
            }
        }

        const attachments = [];
        const reenviados = [];
        const sentAt = nowIso();
        // RONDA del requerimiento: se sella en cada documento reenviado y viaja en el
        // enlace (`?r=`). Es lo que permite que la página de firma enseñe SOLO lo que
        // se ha pedido en este envío, y no todo el papeleo del lote.
        const ronda = String(Date.parse(sentAt) || Date.now());

        for (const d of docs) {
            if (!d.html && !d.pdfBase64) continue;
            const key = keyOf(d);
            const idx = documentosSo.findIndex(x => x.key === key);
            const existing = idx >= 0 ? documentosSo[idx] : null;

            // Carpeta del borrador: "6. ANEXOS CAE" del expediente si es ficha; si no, la del lote.
            const expFolder = existing?.exp_folder_id || (d.expediente_id ? expFolderMap[d.expediente_id] : null) || null;
            let draftFolder = docsFolder;
            if (expFolder) {
                draftFolder = await driveService.getOrCreateSubfolder(expFolder, '6. ANEXOS CAE') || docsFolder;
            }

            // Guardar como nueva revisión: archiva a OLD la versión anterior (borrador +
            // firmado, si existían) y nombra el nuevo con sufijo _rev{N}. Ver saveDocRevision().
            const pdf = d.pdfBase64 ? Buffer.from(d.pdfBase64, 'base64') : await htmlToPdf(d.html);
            const baseFileName = d.expediente_id ? d.fileName : nombreDocLote(key, { codigo: lote.codigo });
            const { rev, fileName, saved } = await saveDocRevision({ existing, baseFileName, key, expFolder, draftFolder, folderId: docsFolder, pdf });
            attachments.push({ filename: fileName, content: pdf });

            const entry = {
                ...(existing || {}),
                key,
                tipo: d.tipo || existing?.tipo || (d.expediente_id ? 'ficha_res' : 'anexo_i_listado'),
                expediente_id: d.expediente_id || null,
                exp_folder_id: expFolder,
                label: d.label || existing?.label || fileName.replace(/\.pdf$/i, ''),
                file_name: fileName,
                rev,
                anchor: d.anchor || existing?.anchor || null,
                fixedBox: d.fixedBox || existing?.fixedBox || null,
                draft_link: saved?.link || null, draft_file_id: saved?.id || null,
                // Reseteo de la firma: el S.O. debe volver a firmar este documento.
                signed_link: null, signed_file_id: null, signed_at: null,
                sent_at: sentAt,
                requerimiento_at: sentAt,
                requerimiento_ronda: ronda,
            };
            if (idx >= 0) documentosSo[idx] = entry; else documentosSo.push(entry);
            reenviados.push(entry.label);
        }

        if (!attachments.length) return res.status(400).json({ error: 'No se regeneró ningún documento (falta HTML).' });

        // Enlace de firma ACOTADO A LA RONDA (`?r=`): al S.O. se le pide volver a
        // firmar estos documentos concretos, así que la página solo le enseña estos.
        // El enlace sin `?r=` sigue mostrando todo lo que el lote tenga pendiente.
        const origin = (frontendOrigin || process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/$/, '');
        const firmaUrl = `${origin}/firmar-lote/${lote.id}?r=${ronda}`;
        const msgConEnlace = `${customMessage || ''}\n\n${firmaUrl}`.trim();

        const warnings = [];
        const summ = {
            id: (summaryData && summaryData.id) || lote.codigo || 'LOTE',
            docType: (summaryData && summaryData.docType) || 'Requerimiento · documentos para nueva firma',
        };

        if (channels.email && to) {
            try {
                const emailService = require('../services/emailService');
                await emailService.sendAnnexEmail({ to, cc, userName: summ.id, attachments, customMessage: msgConEnlace, summaryData: summ, from: SO_EMAIL_FROM });
            } catch (e) { warnings.push(`Email: ${e.message}`); }
        }
        if (channels.whatsapp && phone) {
            try {
                const whatsappService = require('../services/whatsappService');
                // Con `whatsappMessage` (aviso de "revisa el email") se manda TAL CUAL:
                // sin el enlace de firma y, salvo petición explícita, sin adjuntos.
                const waTexto = (whatsappMessage || '').trim() || msgConEnlace;
                const waConAdjuntos = whatsappMessage ? whatsappAttachments === true : whatsappAttachments !== false;
                await whatsappService.sendText(phone, waTexto);
                if (waConAdjuntos) {
                    for (const a of attachments) {
                        await whatsappService.sendMedia(
                            phone,
                            { base64: a.content.toString('base64'), filename: a.filename, mimetype: 'application/pdf' },
                            { caption: a.filename.replace(/\.pdf$/i, ''), splitCaption: false }
                        );
                    }
                }
            } catch (e) { warnings.push(`WhatsApp: ${e.message}`); }
        }
        const avisoPhone = (avisoWhatsApp?.phone || '').trim();
        const avisoMsg = (avisoWhatsApp?.message || '').trim();
        const yaEnviadoPorWa = channels.whatsapp && phone && String(phone).trim() === avisoPhone;
        if (avisoPhone && avisoMsg && !yaEnviadoPorWa) {
            try {
                const whatsappService = require('../services/whatsappService');
                await whatsappService.sendText(avisoPhone, avisoMsg);
            } catch (e) { warnings.push(`Aviso WhatsApp: ${e.message}`); }
        }

        // Persistir: releemos documentos_so justo antes de escribir para no pisar
        // firmas que hayan podido entrar mientras generábamos los PDFs.
        const { data: fresh } = await supabase.from('lotes').select('documentos_so, historial').eq('id', lote.id).maybeSingle();
        const freshDocs = Array.isArray(fresh?.documentos_so) ? [...fresh.documentos_so] : [];
        // Aplicamos nuestras entradas reenviadas sobre la copia fresca (por key).
        for (const d of docs) {
            const key = keyOf(d);
            const mine = documentosSo.find(x => x.key === key);
            if (!mine) continue;
            const fi = freshDocs.findIndex(x => x.key === key);
            if (fi >= 0) freshDocs[fi] = mine; else freshDocs.push(mine);
        }
        const historial = Array.isArray(fresh?.historial) ? [...fresh.historial] : [];
        const canales = [channels.email && to ? 'email' : null, channels.whatsapp && phone ? 'whatsapp' : null].filter(Boolean).join('+');
        historial.push({
            id: `${Date.now()}_requerimiento`, tipo: 'sistema',
            texto: `Requerimiento: reenviados ${reenviados.length} documento(s) para nueva firma${canales ? ` (${canales})` : ''} — ${reenviados.join(', ')}.`,
            fecha: sentAt, usuario: usuarioDe(req),
        });
        await supabase.from('lotes').update({
            documentos_so: freshDocs, historial, drive_folder_id: folderId, updated_at: sentAt,
        }).eq('id', lote.id);

        const { data: updated } = await supabase.from('lotes').select('*').eq('id', lote.id).maybeSingle();
        const [enriched] = await enrichLotes([updated]);
        res.json({ ok: true, firma_url: firmaUrl, reenviados, warnings, lote: scrubLoteForUser(enriched, req) });
    } catch (err) {
        console.error('[POST /lotes/:id/requerimiento]', err.message);
        res.status(500).json({ error: err.message || 'Error al reenviar el requerimiento' });
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

        // La carpeta del expediente entra YA en la del lote: a partir de aquí no se
        // mueve por su cuenta, viaja con el lote. Fire-and-forget (Drive no bloquea).
        setImmediate(async () => {
            try {
                const folderId = await ensureLoteFolder(updatedLote);
                await absorberExpedientesEnLote(folderId, [{ ...ctx.exp, lote_id: lote.id }]);
            } catch (e) {
                console.warn('[POST /lotes/:id/expedientes] Drive:', e.message);
            }
        });

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

        // Fuera del lote, su carpeta vuelve a la que le toca por estado (05 / 13).
        setImmediate(() => {
            devolverExpedienteDeLote(req.params.expId).catch(() => {});
        });

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

        // ── No se le paga a un cliente sin su ahorro VERIFICADO ────────────────
        // El bono se calcula sobre el ahorro que el verificador ha dado por bueno.
        // Con el estimado se paga de más o de menos, y un pago hecho no se
        // deshace. El verificado se rellena con el informe de verificación final
        // (se lee solo al subirlo: "Leer el informe" en la pestaña Documentación).
        if (['PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'].includes(nuevo_estado)) {
            const { data: miembros } = await supabase.from('expedientes')
                .select('numero_expediente, instalacion').eq('lote_id', lote.id);
            const { ok, faltan } = puedePagarseAlCliente(miembros);
            if (!ok) {
                return res.status(409).json({
                    error: `No se puede pasar a "${nuevo_estado}" sin el ahorro verificado de ${faltan.length === 1 ? 'un expediente' : `${faltan.length} expedientes`}: ${faltan.join(', ')}. `
                        + 'El bono al cliente se calcula sobre el ahorro verificado; rellénalo desde el informe de verificación.',
                    faltan,
                });
            }
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

        // La carpeta del LOTE se mueve a la carpeta de su nuevo estado y arrastra
        // dentro las de todos sus expedientes (que no se mueven por su cuenta).
        setImmediate(() => {
            syncLoteFolder(updated, { motivo: 'cambio de estado del lote' }).catch(() => {});
        });

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
        const { data: miembrosLote } = await supabase.from('expedientes').select('id').eq('lote_id', lote.id);
        await supabase.from('expedientes').update({ lote_id: null, updated_at: nowIso() }).eq('lote_id', lote.id);

        // Sus carpetas salen de la del lote y vuelven a la que les toca por estado.
        setImmediate(async () => {
            for (const m of (miembrosLote || [])) {
                await devolverExpedienteDeLote(m.id, { motivo: 'lote borrado' }).catch(() => {});
            }
        });
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
