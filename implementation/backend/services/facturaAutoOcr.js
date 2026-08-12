// ============================================================================
// facturaAutoOcr — lee la factura que sube el CLIENTE, en segundo plano.
// ----------------------------------------------------------------------------
// Cuando la factura entra por el enlace público (`DOC_FACTURAS`),
// `addFacturaToExpediente` registra la fila con Nº, fecha e importe EN BLANCO:
// el fichero está en Drive, pero el expediente no sabe qué pone dentro. Alguien
// tenía que abrirla y teclear esos tres campos a mano.
//
// Este servicio los rellena solo, con el MISMO OCR que ya usa el admin
// (`facturaOcrService`, Gemini 2.5 Flash · ~0,002 € y ~11 s por factura). Se
// dispara en `setImmediate` tras responder: el cliente no espera, no ve nada y
// no se entera. El admin se lo encuentra ya relleno en el slot de Facturas.
//
// REGLA — el OCR PROPONE, no decide. La fila queda marcada `ocr_pendiente_revision`
// y `origen: 'popup+ocr'` para que en el panel se distinga de lo que ha tecleado
// una persona: lo ha leído una máquina de un fichero que subió el cliente, y ese
// fichero puede ser cualquier cosa (un albarán, un presupuesto, una foto movida).
//
// REGLA — NO se levantan incidencias aquí. El filtro de incidencias
// (`facturaIncidencias`) se ejecuta contra el expediente y sus propuestas las
// confirma una persona en el modal de Facturas (ver CLAUDE.md, "Facturas de la
// obra"). Registrarlas sin que nadie las mire llenaría el expediente de
// incidencias automáticas por facturas que aún no se han validado.
//
// REGLA — solo rellena HUECOS. El patch se construye descartando lo que venga
// vacío, y la RPC hace MERGE: si un humano ya corrigió el importe, el OCR no lo
// pisa.
// ============================================================================

const supabase = require('./supabaseClient');

/** Campos que el OCR puede rellenar, solo si vienen con valor. */
function buildPatch(ocr) {
    const patch = {};
    const num = String(ocr?.numero_factura || '').trim();
    if (num) patch.numero_factura = num;
    if (ocr?.fecha_factura) patch.fecha_factura = ocr.fecha_factura;

    const base = ocr?.totales?.base_imponible;
    if (Number.isFinite(base) && base > 0) patch.importe_sin_iva = base;

    // Partidas (AEROTERMIA, VENTANAS…): de ellas sale CUÁL es la factura de la
    // instalación térmica, que fija la fecha de pruebas de la Memoria RITE.
    const partidas = [...new Set((ocr?.lineas || [])
        .map(l => String(l?.partida || '').trim().toUpperCase())
        .filter(Boolean))];
    if (partidas.length) patch.partidas = partidas;

    if (!Object.keys(patch).length) return null;

    patch.origen = 'popup+ocr';
    patch.ocr_pendiente_revision = true;
    return patch;
}

/**
 * Lee una factura recién subida y completa su fila en
 * `expedientes.documentacion.facturas[]`. Background-safe: NUNCA lanza.
 *
 * @param {string} oportunidadId  uuid de la oportunidad
 * @param {string} driveId        id del fichero ya subido a "5. FACTURAS"
 * @param {Buffer} buffer         contenido del fichero tal cual se subió
 * @param {string} originalname   nombre original (para deducir el tipo)
 * @param {string} mimetype
 */
async function leerYCompletar({ oportunidadId, driveId, buffer, originalname, mimetype }) {
    try {
        if (!oportunidadId || !driveId || !buffer?.length) return;

        // Sin expediente no hay dónde escribir: la factura vive en la carpeta de
        // la oportunidad y ya está. No es un error.
        const { data: exp } = await supabase
            .from('expedientes')
            .select('id')
            .eq('oportunidad_id', oportunidadId)
            .maybeSingle();
        if (!exp) return;

        // Normalización a PDF: una foto suelta (o varias páginas) se unen antes de
        // leer. Es el mismo paso que hace el OCR del admin y el de los CEE.
        const ceeOcrService = require('./ceeOcrService');
        const facturaOcrService = require('./facturaOcrService');
        const { pdf } = await ceeOcrService.normalizeToPdf([
            { buffer, originalname: originalname || 'factura', mimetype: mimetype || 'application/pdf' },
        ]);

        const ocr = await facturaOcrService.extractFacturaFromPdf(pdf);
        const patch = buildPatch(ocr);
        if (!patch) {
            console.log(`[facturaAutoOcr] ${driveId}: el OCR no devolvió nada aprovechable.`);
            return;
        }

        const { error } = await supabase.rpc('update_expediente_factura_by_driveid', {
            p_oportunidad_id: oportunidadId,
            p_drive_id: driveId,
            p_patch: patch,
        });
        if (error) { console.warn('[facturaAutoOcr] rpc update:', error.message); return; }

        console.log(`[facturaAutoOcr] ${driveId}: factura ${patch.numero_factura || '(sin nº)'} · ${patch.importe_sin_iva ?? '—'} € leída y registrada.`);
    } catch (e) {
        // Un OCR que falla no puede romper una subida que YA fue bien: el fichero
        // está en Drive y la fila existe, solo se queda sin rellenar.
        console.warn('[facturaAutoOcr]', e.message);
    }
}

module.exports = { leerYCompletar, buildPatch };
