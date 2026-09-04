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
 *   · ce3x_capturas                     → RPC res080_ce3x_set (/res080/ce3x/:slot)
 *
 * Vive aparte para poder probarse sin levantar la ruta entera.
 */
const CLAVES_PROTEGIDAS = [
    'cifo_extra_annexes',
    'cifo_annex_prefs',
    'anexo_comentarios',
    'anexo_excluidas',
    'anexo_orden',
    'ce3x_capturas',
];

const { DOCUMENTO_VALIDABLE_LABELS, BORRADORES_CLIENTE, invalidarValidacionDocs } = require('./docValidacion');

function mergeDocumentacion(existingDoc, payloadDoc) {
    const existing = existingDoc || {};
    if (payloadDoc === undefined) return existing;

    const merged = { ...existing, ...payloadDoc };
    for (const k of CLAVES_PROTEGIDAS) {
        if (k in existing) merged[k] = existing[k];
    }

    // Sello de "este borrador es de ahora". Es lo que levanta el bloqueo del enlace
    // público tras rechazar un anexo (ver `rechazoBorrador` en docValidacion): sin
    // él no habría forma de distinguir el borrador corregido del que se rechazó.
    // Se sella aquí y no en el frontend para que valga venga de donde venga la
    // escritura (app, MCP, skills).
    const ahora = new Date().toISOString();
    const _ts = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t; };

    for (const spec of Object.values(BORRADORES_CLIENTE)) {
        if (merged[spec.draft] && merged[spec.draft] !== existing[spec.draft]) {
            merged[spec.at] = ahora;
        }
        // El sello de "borrador de ahora" NUNCA retrocede. La vista del expediente
        // reenvía `documentacion` entera desde una copia hidratada al abrirla, así
        // que un guardado posterior traía el `_drive_at` ANTERIOR y lo pisaba —
        // medido en 26RES060_127: el borrador era el de las 15:36 y el sello seguía
        // diciendo 25/08. Con el sello atrasado, un rechazo viejo vuelve a bloquear
        // un borrador ya corregido (regla 24).
        if (_ts(existing[spec.at]) > _ts(merged[spec.at])) merged[spec.at] = existing[spec.at];

        // Cuándo nos llegó el firmado. Es lo que permite saber si corresponde al
        // borrador actual o a una versión anterior, y lo que cierra la petición de
        // volver a firmar (ver `estadoInstalador`).
        if (merged[spec.signed] && merged[spec.signed] !== existing[spec.signed]) {
            merged[spec.signedAt] = ahora;
            // Ha llegado la firma nueva: se cierra la petición de volver a firmar,
            // venga de un requerimiento del verificador o de una corrección nuestra.
            if (spec.refirma) merged[spec.refirma] = null;
        }
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
