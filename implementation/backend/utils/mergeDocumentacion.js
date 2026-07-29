/**
 * Fusión de `expedientes.documentacion` en el PUT /api/expedientes/:id.
 *
 * El detalle del expediente mantiene su propia copia de `documentacion` y la
 * reenvía ENTERA al autoguardar. Esa copia se hidrató al abrir la vista, así que
 * es más vieja que cualquier escritura hecha entretanto por un endpoint dedicado
 * — y un spread a secas la borraría.
 *
 * Estas claves las escribe SOLO su endpoint/RPC, nunca el PUT general, así que
 * para ellas manda siempre lo que ya hay en BD:
 *   · cifo_extra_annexes                → RPC cifo_annex_append/remove (/anexos-cifo)
 *   · cifo_annex_prefs                  → RPC cifo_annex_prefs_set (/anexos-cifo/prefs)
 *   · anexo_comentarios/_excluidas/_orden → PUT /:id/anexo-fotografico/config
 *
 * Vive aparte para poder probarse sin levantar la ruta entera.
 */
const CLAVES_PROTEGIDAS = [
    'cifo_extra_annexes',
    'cifo_annex_prefs',
    'anexo_comentarios',
    'anexo_excluidas',
    'anexo_orden',
];

const { DOCUMENTO_VALIDABLE_LABELS, invalidarValidacionDocs } = require('./docValidacion');

function mergeDocumentacion(existingDoc, payloadDoc) {
    const existing = existingDoc || {};
    if (payloadDoc === undefined) return existing;

    const merged = { ...existing, ...payloadDoc };
    for (const k of CLAVES_PROTEGIDAS) {
        if (k in existing) merged[k] = existing[k];
    }

    // Red de seguridad: si el enlace de un documento validable CAMBIA en este
    // guardado (fichero nuevo) pero el payload sigue trayendo su validación previa,
    // el slot volvería a verde con un PDF que nadie ha revisado. Se invalida aquí,
    // pase por donde pase la escritura (app, MCP, skills).
    const cambiados = Object.keys(DOCUMENTO_VALIDABLE_LABELS)
        .filter(campo => merged[campo] && existing[campo] && merged[campo] !== existing[campo]);
    return cambiados.length
        ? invalidarValidacionDocs(merged, cambiados, { origen: 'versión nueva del documento' })
        : merged;
}

module.exports = { mergeDocumentacion, CLAVES_PROTEGIDAS };
