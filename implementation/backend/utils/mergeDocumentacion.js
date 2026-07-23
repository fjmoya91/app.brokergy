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
 *   · anexo_comentarios/_excluidas/_orden → PUT /:id/anexo-fotografico/config
 *
 * Vive aparte para poder probarse sin levantar la ruta entera.
 */
const CLAVES_PROTEGIDAS = [
    'cifo_extra_annexes',
    'anexo_comentarios',
    'anexo_excluidas',
    'anexo_orden',
];

function mergeDocumentacion(existingDoc, payloadDoc) {
    const existing = existingDoc || {};
    if (payloadDoc === undefined) return existing;

    const merged = { ...existing, ...payloadDoc };
    for (const k of CLAVES_PROTEGIDAS) {
        if (k in existing) merged[k] = existing[k];
    }
    return merged;
}

module.exports = { mergeDocumentacion, CLAVES_PROTEGIDAS };
