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
const { rankEstado } = require('../utils/expedienteEstados');
const { detectPrograma } = require('../utils/fichas');
const path = require('path');
const { pathToFileURL } = require('url');

// En un RES080 la oportunidad guarda DOS economías y la aceptada es la de la
// reforma: la elige propuestaGuardada.js, el MISMO módulo que el panel del
// expediente y el listado (import ESM en runtime, como cifoService con cifoDoc).
// Si el portal leyera la otra rama le anunciaría al cliente un bono muy inferior
// al de la propuesta que firmó (26RES080_73: 2.662 € frente a 3.894 €).
let _propuestaPromise = null;
function loadPropuesta() {
    if (!_propuestaPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/propuestaGuardada.js')).href;
        _propuestaPromise = import(url);
    }
    return _propuestaPromise;
}

// El bono CONFIRMADO (26/10/2026, Fran): con el ahorro VERIFICADO (CAE emitido) el
// bono ya no es una estimación. Se da aparte del de la propuesta, que se sigue
// devolviendo como `bonoCae`: el portal enseña los dos cuando el real es MAYOR
// («en la propuesta te estimamos… y has cobrado…»); cuando es menor, solo el real.
// El verificado lo da `computeExpedienteFinancials` (el MISMO que la remesa, vía
// cobroService.bonoVerificado); el espejo Node no lo calcula.
let _finPromise = null;
function loadFinancials() {
    if (!_finPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/expedienteFinancials.js')).href;
        _finPromise = import(url);
    }
    return _finPromise;
}

async function buildClientMoney(op, exp) {
    const dinero = await bonoDeLaPropuesta(op, exp);
    let bonoConfirmado = null;
    if (exp) {
        try {
            const { computeExpedienteFinancials } = await loadFinancials();
            const ef = computeExpedienteFinancials({ ...exp, oportunidades: exp.oportunidades || op });
            if (Number(ef?.caeVerificado) > 0) bonoConfirmado = Math.round(ef.caeVerificado * 100) / 100;
        } catch (e) {
            console.warn('[portal] bono verificado:', e.message);
        }
    }
    return { ...dinero, bonoConfirmado };
}

async function bonoDeLaPropuesta(op, exp) {
    let fin = {};
    try {
        const { propuestaGuardada } = await loadPropuesta();
        fin = propuestaGuardada(op, detectPrograma(exp || {}, op || {}) === 'RES080').financials || {};
    } catch (e) {
        console.warn('[portal] propuestaGuardada:', e.message);
        fin = op?.datos_calculo?.result?.financials || {};
    }
    if (fin.caeBonus != null) {
        return { bonoCae: round0(fin.caeBonus), deduccionIrpf: round0(fin.irpfDeduction), estado: 'estimado', deLaPropuesta: true };
    }
    // Sin snapshot → calcular el bono como el admin (deducción no disponible sin snapshot).
    if (exp) {
        try {
            const ef = await computeExpedienteFinancialsNode(exp, op);
            // Calculado al vuelo: NO es lo que se le dijo en la propuesta (no se compara).
            if (ef?.cae != null) return { bonoCae: round0(ef.cae), deduccionIrpf: null, estado: 'estimado', deLaPropuesta: false };
        } catch (e) {
            console.warn('[portal] computeExpedienteFinancialsNode:', e.message);
        }
    }
    return { bonoCae: null, deduccionIrpf: null, estado: 'estimado', deLaPropuesta: false };
}

// ---------------------------------------------------------------------------
// COBRO — ¿se le ha TRANSFERIDO ya el bono? (24/10/2026)
// El portal decía «Bono CAE que cobrarás · Estimado» también a quien ya lo tenía
// en la cuenta. Se lee de los sellos del pago (`documentacion.cobro`), los MISMOS
// de la carta de pago (cartaPagoService.datosDe): pagado = hay justificante
// (`transferencia.at`), importe = lo transferido (con céntimos) y fecha = la de
// ejecución de la remesa. LISTA BLANCA: `cobro` lleva el token del formulario,
// cuentas e IBAN enmascarados — nada de eso sale al navegador.
// ---------------------------------------------------------------------------
function buildCobro(documentacion) {
    const c = documentacion?.cobro || {};
    const t = c.transferencia || {};
    const r = c.remesa || {};
    const pagado = !!t.at;
    if (!pagado) return { pagado: false, importe: null, fecha: null, bono: null, descuento: 0 };
    const imp = Number(t.importe ?? r.importe);
    const fecha = String(r.fecha_ejecucion || t.at || '').slice(0, 10);
    const importe = Number.isFinite(imp) ? Math.round(imp * 100) / 100 : null;
    // Lo transferido va NETO de los honorarios si eligió descontarlos (la remesa los
    // apunta en `descuento`): el BONO cobrado es la suma, y es lo que se compara con
    // el de la propuesta, que también es bruto.
    const descuento = Number(r.descuento) > 0 ? Math.round(Number(r.descuento) * 100) / 100 : 0;
    return {
        pagado: true,
        importe,
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
        bono: importe != null ? Math.round((importe + descuento) * 100) / 100 : null,
        descuento,
    };
}

// ---------------------------------------------------------------------------
// ESTADO — mapea los 18 estados internos del expediente a 6 hitos cliente.
// Usa coincidencia por palabra clave (robusto ante el guión largo de
// "CAE EMITIDO – PTE PAGO BROKERGY").
// ---------------------------------------------------------------------------
function mapEstadoToHito(estadoActual) {
    const e = String(estadoActual || '').toUpperCase();
    const h = (hitoIndex, hitoLabel, microcopy, subestado) => ({ hitoIndex, hitoLabel, microcopy, subestado });

    // RECHAZADO no es un paso de los 6 hitos: el expediente se ha cerrado sin
    // llegar al final. Al cliente se le dice "Expediente cerrado", sin el motivo
    // interno ni una barra de progreso que diga que va por el paso 1. Sin
    // `hitoIndex`, el portal no pinta los pasos (MiExpedienteView).
    if (e === 'RECHAZADO')
        return h(null, 'Expediente cerrado', 'Tu expediente está cerrado. Si tienes cualquier duda, escríbenos y te lo explicamos.', 'cerrado');

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
    // (REQUERIMIENTO BROKERGY = lo hemos revisado por dentro y falta algo; para el
    // cliente sigue siendo "estamos preparando tu expediente".)
    if (e.includes('CIFO') || e.includes('FIN EXPTE') || e.includes('DOC. COMPLETA')
        || e.includes('REVISAR EXPTE') || e.includes('REQUERIMIENTO BROKERGY'))
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
//
// "Sin generar" es NUESTRO trabajo, no el suyo: el Anexo I y el Convenio de
// Cesión los emite Brokergy y el cliente solo los firma cuando se los mandamos.
// Listárselos como algo que le falta le pide un documento que no puede producir
// —y, peor, entierra entre cuatro líneas las dos que sí dependen de él.
const CLIENT_INCLUDE = /foto|fotograf|factura|anexo\s*i\b|cesi[oó]n|firma[^.]*(anexo|cesi)/i;
const CLIENT_EXCLUDE = /certificador|\bcee\b|registro|revis|miteco|verificad|dictamen|\blote\b|industria|\.cex|sin\s+generar|sin\s+emitir|pendiente\s+de\s+generar/i;
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
// `certificado: true` = documento que NO se entrega hasta que el expediente esté
// documentalmente COMPLETO. Ver `certificadosLiberados()`.
// Cada CEE en sus TRES papeles (24/10/2026): en campaña de Renta piden el
// certificado, la etiqueta y el justificante de registro, y antes solo salía el
// primero que hubiera (`ceeFileLink` cogía pdf || registro || etiqueta).
const DOC_MAP = {
    cee_inicial:            { label: 'Certificado energético inicial',             cee: 'inicial', archivo: 'pdf',      certificado: true },
    cee_inicial_etiqueta:   { label: 'Etiqueta energética inicial',                cee: 'inicial', archivo: 'etiqueta', certificado: true },
    cee_inicial_registro:   { label: 'Justificante de registro del CEE inicial',   cee: 'inicial', archivo: 'registro', certificado: true },
    cee_final:              { label: 'Certificado energético final',               cee: 'final',   archivo: 'pdf',      certificado: true },
    cee_final_etiqueta:     { label: 'Etiqueta energética final',                  cee: 'final',   archivo: 'etiqueta', certificado: true },
    cee_final_registro:     { label: 'Justificante de registro del CEE final',     cee: 'final',   archivo: 'registro', certificado: true },
    anexo_i:           { label: 'Anexo I firmado',                fields: ['anexo_i_signed_link'] },
    cesion:            { label: 'Anexo de Cesión de Ahorros',     fields: ['anexo_cesion_signed_link'] },
    cifo:              { label: 'Certificado CIFO',               fields: ['cert_cifo_signed_link'], certificado: true },
    rite:              { label: 'Certificado RITE',               fields: ['cert_rite_signed_link', 'cert_rite_drive_link'], certificado: true },
    anexo_fotografico: { label: 'Anexo Fotográfico',              fields: ['anexo_fotografico_signed_link'] },
    // La guía para aplicarse la deducción del IRPF, tal y como se le envió
    // (`guiaIrpfService` la guarda en Drive y la sella aquí). No es un certificado:
    // solo existe cuando ya se le ha entregado, así que no se bloquea.
    guia_irpf:         { label: 'Guía para la deducción en la Renta', fields: ['guia_irpf.drive_id', 'guia_irpf.link'] },
};

/**
 * ¿Puede el cliente DESCARGARSE ya los certificados?
 *
 * Solo desde 'DOC. COMPLETA' en adelante. Los certificados (CEE inicial y final,
 * CIFO y RITE) son el entregable del expediente: mientras la documentación no
 * esté completa, siguen siendo material de trabajo —un CEE puede rechazarse y
 * volver a emitirse, y el CIFO se anula y se regenera cada vez que se corrige un
 * dato (regla 24)—. Entregarlos antes reparte por ahí versiones que luego no son
 * las buenas, y el cliente se queda con un papel que ya no vale.
 *
 * Lo que el cliente FIRMA (Anexo I, Cesión, Anexo Fotográfico) y sus propias
 * facturas NO se bloquean: son suyos y ya los tiene.
 *
 * Manda `expedientes.estado` —la columna del desplegable de la app—, comparada
 * por el orden canónico de `expedienteEstados`. Un estado desconocido o nulo
 * BLOQUEA: ante la duda, no se entrega.
 */
function certificadosLiberados(estado) {
    const r = rankEstado(estado);
    return r >= 0 && r >= rankEstado('DOC. COMPLETA');
}

/** Extrae un ID de fichero de Drive de un enlace/valor. Null si no parece Drive. */
function extractDriveId(v) {
    if (!v || typeof v !== 'string') return null;
    // /d/<id>/  ·  id=<id>  ·  lh3/d/<id>  ·  ids sueltos (25+ chars)
    const m = v.match(/[-\w]{25,}/);
    return m ? m[0] : null;
}

/**
 * Enlace de UN papel del CEE (pdf/registro/etiqueta). NUNCA cex/xml (ficheros de
 * trabajo). El `pdf`, si falta, cae al registro o a la etiqueta como antes: el
 * «Certificado energético» sigue saliendo en los expedientes que solo tienen uno.
 */
function ceeFileLink(exp, fase, archivo = 'pdf') {
    const slot = exp?.cee?.cee_files?.[fase] || {};
    const de = (k) => {
        const v = slot[k];
        if (typeof v === 'string' && v) return v;
        if (v && typeof v === 'object' && (v.link || v.url || v.driveId || v.drive_id)) {
            return v.link || v.url || v.driveId || v.drive_id;
        }
        return null;
    };
    if (archivo !== 'pdf') return de(archivo);
    return de('pdf') || de('registro') || de('etiqueta');
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
        const link = ceeFileLink(exp, def.cee, def.archivo);
        const driveId = extractDriveId(link);
        return driveId ? { driveId, name: `${docKey}.pdf`, label: def.label } : null;
    }
    // Documentacion.*_link (o una ruta con punto dentro de un objeto: `guia_irpf.link`)
    for (const field of def.fields || []) {
        const valor = field.includes('.') ? field.split('.').reduce((o, k) => (o ? o[k] : undefined), doc) : doc[field];
        const driveId = extractDriveId(valor);
        if (driveId) return { driveId, name: `${docKey}.pdf`, label: def.label };
    }
    return null;
}

/**
 * Lista [{ key, label }] de documentos DISPONIBLES. El CEE solo aparece cuando
 * está REGISTRADO (flags.ceeIniOk/ceeFinOk de la vista de lifecycle), no cuando
 * solo existe el .cex de trabajo.
 *
 * Los CERTIFICADOS, además, solo se entregan a partir de 'DOC. COMPLETA'
 * (`certificadosLiberados`). Existiendo pero bloqueados salen aparte, en
 * `bloqueados`: al cliente se le DICE que su certificado ya está y cuándo lo
 * tendrá. Callarlo haría que lo pidiera por WhatsApp, que es justo el trabajo
 * que el portal ahorra.
 */
function buildDocumentos(exp, flags = {}) {
    const lista = [];
    const bloqueados = [];
    const liberados = certificadosLiberados(flags.estado);
    const vistos = new Set();   // el mismo fichero no sale dos veces (pdf que cae al registro)
    for (const key of Object.keys(DOC_MAP)) {
        if (DOC_MAP[key].cee === 'inicial' && !flags.ceeIniOk) continue;
        if (DOC_MAP[key].cee === 'final' && !flags.ceeFinOk) continue;
        const r = resolveDocLink(exp, key);
        if (!r) continue;
        if (vistos.has(r.driveId)) continue;
        vistos.add(r.driveId);
        if (DOC_MAP[key].certificado && !liberados) {
            bloqueados.push({ key, label: DOC_MAP[key].label });
            continue;
        }
        lista.push({ key, label: DOC_MAP[key].label });
    }
    // Las facturas son del propio cliente: nunca se bloquean.
    const facturas = Array.isArray(exp?.documentacion?.facturas) ? exp.documentacion.facturas : [];
    facturas.forEach((f, i) => {
        if (f && (f.drive_id || f.drive_link)) {
            lista.push({ key: `factura_${i}`, label: facturas.length > 1 ? `Factura ${i + 1}` : 'Factura' });
        }
    });
    return { lista, bloqueados };
}

// ---------------------------------------------------------------------------
// ZIP «Descargar todo» (24/10/2026) — los nombres con los que el cliente se
// encuentra cada papel al abrir el ZIP. Numerados en el orden en que se los pide
// el asesor (certificados de antes y después, facturas, guía, anexos), en vez
// de la clave interna (`cee_inicial_registro.pdf`). La extensión la pone quien descarga, por los
// primeros bytes (una etiqueta puede ser una imagen).
// ---------------------------------------------------------------------------
const NOMBRES_ZIP = {
    cee_inicial:           '01 CEE inicial (antes de la obra) - Certificado',
    cee_inicial_etiqueta:  '02 CEE inicial (antes de la obra) - Etiqueta',
    cee_inicial_registro:  '03 CEE inicial (antes de la obra) - Justificante de registro',
    cee_final:             '04 CEE final (después de la obra) - Certificado',
    cee_final_etiqueta:    '05 CEE final (después de la obra) - Etiqueta',
    cee_final_registro:    '06 CEE final (después de la obra) - Justificante de registro',
    guia_irpf:             '08 Guía para la deducción en la Renta',
    cifo:                  '09 Certificado CIFO',
    rite:                  '10 Certificado RITE',
    anexo_i:               '11 Anexo I firmado',
    cesion:                '12 Anexo de Cesión de Ahorros',
    anexo_fotografico:     '13 Anexo Fotográfico',
};

/** Nombre legible (sin extensión) de un docKey dentro del ZIP. */
function nombreZip(docKey, total = 1) {
    if (docKey.startsWith('factura_')) {
        const i = parseInt(docKey.slice('factura_'.length), 10) + 1;
        return total > 1 ? `07 Factura ${i}` : '07 Factura';
    }
    return NOMBRES_ZIP[docKey] || docKey;
}

/** Extensión por los primeros bytes; `.pdf` por defecto. */
function extensionDe(buf) {
    if (!buf || buf.length < 4) return '.pdf';
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return '.pdf';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return '.png';
    if (buf[0] === 0xFF && buf[1] === 0xD8) return '.jpg';
    return '.pdf';
}

/** «FRANCISCO JAVIER» → «Francisco Javier»; null si no hay apellidos (empresa). */
function saludoDe(cli) {
    const nombre = String(cli?.nombre_razon_social || '').trim();
    if (!nombre || !String(cli?.apellidos || '').trim()) return null;
    return nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, l) => sep + l.toUpperCase());
}

module.exports = {
    buildCobro,
    saludoDe,
    nombreZip,
    extensionDe,
    certificadosLiberados,
    esCertificado: (docKey) => !!DOC_MAP[docKey]?.certificado,
    normalizeDni,
    buildClientMoney,
    mapEstadoToHito,
    clientPendings,
    buildRequerimiento,
    buildDocumentos,
    resolveDocLink,
    extractDriveId,
};
