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
 *   · incidencias                       → POST/PATCH/DELETE /:id/incidencias (y el MCP)
 *
 * ⚠️ `incidencias` no estaba protegida y era una PÉRDIDA DE DATOS silenciosa, no
 * un descuadre: se registraban tres incidencias de una factura, el siguiente
 * autoguardado del módulo de Documentación (subir otra factura, tocar un campo,
 * "Guardar Facturas") reenviaba `documentacion` entera desde la copia hidratada
 * al abrir la vista —donde esas tres no existen— y las BORRABA. El aviso decía
 * "3 incidencia(s) registrada(s)" y en el panel no había ninguna.
 */
const CLAVES_PROTEGIDAS = [
    'cifo_extra_annexes',
    'cifo_annex_prefs',
    'anexo_comentarios',
    'anexo_excluidas',
    'anexo_orden',
    'ce3x_capturas',
    'incidencias',
    // El VISTO BUENO de un documento (y su rechazo) lo escriben SOLO sus rutas
    // dedicadas —/documentos/validar, /documentos/rechazar y firmar-subir—, que
    // además copian el fichero a "10. EXPEDIENTE CAE". La copia hidratada del
    // navegador se quedó sin él, así que el siguiente autoguardado de CUALQUIER
    // módulo lo borraba: el slot volvía a ámbar y había que validar otra vez.
    // Medido en 26RES060_101 (18/09/2026): el CIFO (13:59) y las facturas (14:00)
    // sobrevivieron, el Anexo I no — porque después de él sí hubo un autoguardado.
    // Mismo fallo que ya costó `incidencias`, `_drive_at` y `refirma_at`.
    'docs_validados',
    'docs_rechazados',
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

        // El sello de "te lo hemos vuelto a pedir" TAMPOCO retrocede, y por el
        // mismo motivo. Lo escriben endpoints dedicados (la RPC de
        // /instalador/enviar y la ruta de rechazo/requerimiento), así que la copia
        // hidratada del navegador no lo trae — y no bastaba con no traerlo: en
        // cuanto la clave EXISTE en BD (se pone a `null` al llegar una firma), la
        // copia la lleva con ese null y el autoguardado siguiente BORRA el sello
        // que se acaba de escribir. Medido en 26RES060_179 (18/09/2026): se reenvió
        // el CIFO por requerimiento a las 07:34:37, la RPC selló la re-firma, y el
        // PUT de "marcar como enviado" (07:34:38) la dejó otra vez en null — el
        // enlace de ese mismo email le decía al instalador "¡TODO RECIBIDO!". Es el
        // mismo fallo que ya costó el `_drive_at` y las `incidencias`.
        //
        // La excepción es el caso legítimo: si en ESTE guardado llega una firma
        // POSTERIOR al sello, la petición está atendida y se limpia (la subida del
        // firmado desde la app manda `signedAt` porque Drive puede devolver el
        // mismo enlace y el bloque de abajo no lo vería).
        if (spec.refirma) {
            const selloVivo = _ts(existing[spec.refirma]);
            if (selloVivo > _ts(merged[spec.refirma]) && _ts(merged[spec.signedAt]) < selloVivo) {
                merged[spec.refirma] = existing[spec.refirma];
            }
        }

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
    //
    // Y lo mismo si el enlace DESAPARECE (se borra el documento firmado): su visto
    // bueno ya no ampara nada. Ahora hace falta decirlo aquí, porque `docs_validados`
    // está protegido y viene de la BD — antes se limpiaba de rebote si el navegador
    // mandaba una copia sin esa clave, que es justo el accidente que se acaba de
    // cerrar. Un slot en verde que apunta a un fichero que ya no existe es peor que
    // uno en ámbar: dice que alguien revisó algo que no está.
    const cambiados = Object.keys(DOCUMENTO_VALIDABLE_LABELS)
        .filter(campo => existing[campo] && merged[campo] !== existing[campo]);
    return cambiados.length
        ? invalidarValidacionDocs(merged, cambiados, { origen: 'versión nueva del documento' })
        : merged;
}

module.exports = { mergeDocumentacion, CLAVES_PROTEGIDAS };
