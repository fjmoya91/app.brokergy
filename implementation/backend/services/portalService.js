// ============================================================================
// portalService.js — Helpers del PORTAL DEL CLIENTE ("Mi expediente")
// ----------------------------------------------------------------------------
// El portal es una FACHADA de solo lectura sobre datos que ya existen. Estos
// helpers construyen un DTO CURADO cliente-safe: nunca exponen margen/precio SO.
// Reutiliza el mismo token que /subir-docs (datos_calculo.upload_token).
// ============================================================================

/** Normaliza un DNI/NIE/CIF para comparar (sin espacios, guiones, mayúsculas). */
function normalizeDni(v) {
    return String(v || '').toUpperCase().replace(/[\s\-.]/g, '').trim();
}

function round0(n) {
    const x = Number(n);
    return Number.isFinite(x) ? Math.round(x) : null;
}

// ---------------------------------------------------------------------------
// DINERO — SOLO exponemos bono CAE + deducción IRPF. NUNCA profit/precio SO.
// 1) Snapshot que vio el cliente en la propuesta (datos_calculo.result.financials).
// 2) Si no hay snapshot (p.ej. expedientes migrados), se calcula al vuelo con la
//    MISMA lógica que el admin (computeExpedienteFinancialsNode → calculation.js).
// ---------------------------------------------------------------------------
const { computeExpedienteFinancialsNode } = require('./expedienteFinancialsNode');

async function buildClientMoney(op, exp) {
    const r = op?.datos_calculo?.result || {};
    const fin = r.financials || r.financialsRes080 || {};
    if (fin.caeBonus != null) {
        return { bonoCae: round0(fin.caeBonus), deduccionIrpf: round0(fin.irpfDeduction), estado: 'estimado' };
    }
    // Sin snapshot → calcular el bono como el admin (deducción no disponible sin snapshot).
    if (exp) {
        try {
            const ef = await computeExpedienteFinancialsNode(exp, op);
            if (ef?.cae != null) return { bonoCae: round0(ef.cae), deduccionIrpf: null, estado: 'estimado' };
        } catch (e) {
            console.warn('[portal] computeExpedienteFinancialsNode:', e.message);
        }
    }
    return { bonoCae: null, deduccionIrpf: null, estado: 'estimado' };
}

// ---------------------------------------------------------------------------
// ESTADO — mapea los 18 estados internos del expediente a 6 hitos cliente.
// Usa coincidencia por palabra clave (robusto ante el guión largo de
// "CAE EMITIDO – PTE PAGO BROKERGY").
// ---------------------------------------------------------------------------
function mapEstadoToHito(estadoActual) {
    const e = String(estadoActual || '').toUpperCase();
    const h = (hitoIndex, hitoLabel, microcopy, subestado) => ({ hitoIndex, hitoLabel, microcopy, subestado });

    // Hito 6 — Cobro
    if (e.includes('FINALIZADO'))
        return h(6, 'Finalizado', 'Tu expediente está cerrado. ¡Gracias por confiar en nosotros!', 'finalizado');
    if (e.includes('PAGO BROKERGY A CLIENTE'))
        return h(6, 'Cobro', 'El CAE está emitido. Estamos tramitando tu pago.', 'pago');
    if (e.includes('CAE EMITIDO'))
        return h(6, 'CAE emitido', '¡El CAE se ha emitido! Ahora empieza el proceso de cobro.', 'cae_emitido');

    // Hito 5 — Tramitación del CAE
    if (e.includes('REQUERIMIENTO G'))
        return h(5, 'Tramitación del CAE', 'La administración ha pedido una aclaración; la estamos resolviendo.', 'requerimiento_ga');
    if (e.includes('MITECO'))
        return h(5, 'Tramitación del CAE', 'Dictamen favorable. En revisión por la administración (gestor autonómico).', 'en_administracion');
    if (e.includes('REQUERIMIENTO VERIFICADOR'))
        return h(5, 'Tramitación del CAE', 'El verificador ha pedido subsanar un detalle; estamos en ello.', 'requerimiento_verificador');
    if (e.includes('VERIFICADOR'))
        return h(5, 'Tramitación del CAE', 'En verificación por una entidad externa acreditada por ENAC.', 'en_verificacion');

    // Hito 4 — Preparación del expediente
    if (e.includes('CIFO') || e.includes('FIN EXPTE') || e.includes('DOC. COMPLETA') || e.includes('REVISAR EXPTE'))
        return h(4, 'Preparación del expediente', 'Preparamos y revisamos toda tu documentación.', 'preparacion');

    // Hito 3 — Certificado energético final
    if (e.includes('CEE FINAL'))
        return h(3, 'Certificado energético final', 'Se certifica la mejora conseguida tras la reforma.', 'cee_final');

    // Hito 2 — Obra y firmas
    if (e.includes('FIN OBRA') || e.includes('FIRMA ANEXOS'))
        return h(2, 'Obra y firmas', 'Sube la factura final y las fotos, y firma los anexos.', 'obra');

    // Hito 1 — Certificado energético inicial (por defecto)
    return h(1, 'Certificado energético inicial', 'Un técnico certifica el estado de partida de tu vivienda.', 'cee_inicial');
}

// ---------------------------------------------------------------------------
// QUÉ FALTA — filtra campos_pendientes[] de la vista a lo que depende del
// CLIENTE (factura fin de obra, fotos, firma de anexos). El resto es interno.
// ---------------------------------------------------------------------------
// Incluimos SOLO tareas que hace el cliente; excluimos las internas aunque
// contengan "firma" (p.ej. "Fecha firma CEE inicial (certificador)").
const CLIENT_INCLUDE = /foto|fotograf|factura|anexo\s*i\b|cesi[oó]n|firma[^.]*(anexo|cesi)/i;
const CLIENT_EXCLUDE = /certificador|\bcee\b|registro|revis|miteco|verificad|dictamen|\blote\b|industria|\.cex/i;
function clientPendings(camposPendientes) {
    if (!Array.isArray(camposPendientes)) return [];
    return camposPendientes.filter(s => {
        const t = String(s || '');
        return CLIENT_INCLUDE.test(t) && !CLIENT_EXCLUDE.test(t);
    });
}

// ---------------------------------------------------------------------------
// REQUERIMIENTO — incidencia ABIERTA de verificador/gestor. Mensaje genérico:
// NUNCA exponemos el texto técnico interno ni la severidad al cliente.
// ---------------------------------------------------------------------------
function buildRequerimiento(documentacion) {
    const inc = Array.isArray(documentacion?.incidencias) ? documentacion.incidencias : [];
    const abiertas = inc.filter(i => String(i?.estado || '').toUpperCase() !== 'SUBSANADA'
        && ['VERIFICACION', 'GESTOR_AUTONOMICO'].includes(String(i?.procedencia || '').toUpperCase()));
    if (!abiertas.length) return { activo: false };
    // La más "avanzada" en el flujo (gestor > verificador)
    const ga = abiertas.find(i => String(i.procedencia).toUpperCase() === 'GESTOR_AUTONOMICO');
    const target = ga || abiertas[0];
    const esGa = String(target.procedencia).toUpperCase() === 'GESTOR_AUTONOMICO';
    return {
        activo: true,
        origen: esGa ? 'administracion' : 'verificador',
        mensaje: esGa
            ? 'La administración ha solicitado una aclaración sobre tu expediente. La estamos resolviendo por ti.'
            : 'El verificador ha solicitado subsanar un detalle. Lo estamos resolviendo por ti.',
    };
}

// ---------------------------------------------------------------------------
// DOCUMENTOS — mapa de documentos descargables. Cada uno se sirve por proxy
// (/portal/doc/:uuid/:docKey) porque el cliente anónimo no puede abrir Drive.
// ---------------------------------------------------------------------------
// Al cliente solo se le ofrecen documentos TERMINADOS: certificados registrados,
// anexos FIRMADOS (no borradores), y certificados finales. Nunca ficheros de
// trabajo (xml/cex) ni borradores sin firma.
const DOC_MAP = {
    cee_inicial:       { label: 'Certificado energético inicial', cee: 'inicial' },
    cee_final:         { label: 'Certificado energético final',   cee: 'final' },
    anexo_i:           { label: 'Anexo I firmado',                fields: ['anexo_i_signed_link'] },
    cesion:            { label: 'Anexo de Cesión de Ahorros',     fields: ['anexo_cesion_signed_link'] },
    cifo:              { label: 'Certificado CIFO',               fields: ['cert_cifo_signed_link'] },
    rite:              { label: 'Certificado RITE',               fields: ['cert_rite_signed_link', 'cert_rite_drive_link'] },
    anexo_fotografico: { label: 'Anexo Fotográfico',              fields: ['anexo_fotografico_signed_link'] },
};

/** Extrae un ID de fichero de Drive de un enlace/valor. Null si no parece Drive. */
function extractDriveId(v) {
    if (!v || typeof v !== 'string') return null;
    // /d/<id>/  ·  id=<id>  ·  lh3/d/<id>  ·  ids sueltos (25+ chars)
    const m = v.match(/[-\w]{25,}/);
    return m ? m[0] : null;
}

/** Enlace del CERTIFICADO CEE real (pdf/registro/etiqueta). NUNCA cex/xml (ficheros de trabajo). */
function ceeFileLink(exp, fase) {
    const slot = exp?.cee?.cee_files?.[fase] || {};
    for (const k of ['pdf', 'registro', 'etiqueta']) {
        const v = slot[k];
        if (typeof v === 'string' && v) return v;
        if (v && typeof v === 'object' && (v.link || v.url || v.driveId || v.drive_id)) {
            return v.link || v.url || v.driveId || v.drive_id;
        }
    }
    return null;
}

/** Resuelve { driveId, name } de un docKey para el proxy de descarga. */
function resolveDocLink(exp, docKey) {
    const doc = exp?.documentacion || {};
    // Facturas: factura_<idx>
    if (docKey && docKey.startsWith('factura_')) {
        const idx = parseInt(docKey.slice('factura_'.length), 10);
        const facturas = Array.isArray(doc.facturas) ? doc.facturas : [];
        const f = facturas[idx];
        if (!f) return null;
        const driveId = f.drive_id || extractDriveId(f.drive_link);
        return driveId ? { driveId, name: f.name || `factura_${idx + 1}.pdf` } : null;
    }
    const def = DOC_MAP[docKey];
    if (!def) return null;
    // CEE
    if (def.cee) {
        const link = ceeFileLink(exp, def.cee);
        const driveId = extractDriveId(link);
        return driveId ? { driveId, name: `${docKey}.pdf`, label: def.label } : null;
    }
    // Documentacion.*_link
    for (const field of def.fields || []) {
        const driveId = extractDriveId(doc[field]);
        if (driveId) return { driveId, name: `${docKey}.pdf`, label: def.label };
    }
    return null;
}

/**
 * Lista [{ key, label }] de documentos DISPONIBLES. El CEE solo aparece cuando
 * está REGISTRADO (flags.ceeIniOk/ceeFinOk de la vista de lifecycle), no cuando
 * solo existe el .cex de trabajo.
 */
function buildDocumentos(exp, flags = {}) {
    const out = [];
    for (const key of Object.keys(DOC_MAP)) {
        if (key === 'cee_inicial' && !flags.ceeIniOk) continue;
        if (key === 'cee_final' && !flags.ceeFinOk) continue;
        if (resolveDocLink(exp, key)) out.push({ key, label: DOC_MAP[key].label });
    }
    const facturas = Array.isArray(exp?.documentacion?.facturas) ? exp.documentacion.facturas : [];
    facturas.forEach((f, i) => {
        if (f && (f.drive_id || f.drive_link)) {
            out.push({ key: `factura_${i}`, label: facturas.length > 1 ? `Factura ${i + 1}` : 'Factura' });
        }
    });
    return out;
}

module.exports = {
    normalizeDni,
    buildClientMoney,
    mapEstadoToHito,
    clientPendings,
    buildRequerimiento,
    buildDocumentos,
    resolveDocLink,
    extractDriveId,
};
