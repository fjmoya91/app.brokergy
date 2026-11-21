/**
 * Lo que una SUBIDA PÚBLICA (CIFO firmado, Memoria RITE firmada, Certificado RITE)
 * escribe en `expedientes.documentacion`, clave a clave y con las RPC atómicas de
 * siempre (regla 19), en vez de leer el objeto entero y reescribirlo.
 *
 * Por qué: entre la lectura y la escritura de esas rutas pasan SEGUNDOS (se sube el
 * PDF a Drive en medio). Lo que escribiera en ese hueco otra ruta —una validación,
 * una incidencia, el autoguardado del módulo de Documentación, la otra mitad del RITE—
 * lo borraba el `update({ documentacion })` con la copia leída antes. Es el mismo
 * fallo que ya costó `incidencias`, `_drive_at` y `refirma_at` (ver mergeDocumentacion).
 *
 * Qué hace, en este orden (lo que da el documento por recibido, el ENLACE, va el
 * último: si algo falla antes, la subida no cuenta y el firmante lo vuelve a intentar,
 * en vez de quedar un documento nuevo en verde con la validación del anterior):
 *   1. Invalida el visto bueno y el rechazo de cada documento subido
 *      (`docs_validados` / `docs_rechazados` → `{ campo: null }`, RPC
 *      `merge_expediente_doc_json`). Se hace SIEMPRE, no solo si la copia leída lo
 *      traía: una validación que entrara mientras se subía el fichero tampoco puede
 *      quedarse en verde sobre un PDF que nadie ha revisado. `null` se lee como «sin
 *      validar» en todas partes (nadie cuenta claves de esos mapas).
 *   2. Añade al `historial` la nota de «nueva versión» de lo que estaba validado
 *      (la MISMA que `invalidarValidacionDocs`).
 *   3. Escribe cada campo escalar con `set_expediente_doc_field` (texto o null).
 *
 * Lanza si una RPC falla: la ruta responde 500 y el fichero, ya en Drive, se vuelve a
 * subir. Ver docs/conocimiento/transversal-backend/rutas-publicas-solo-lo-de-esa-obra.md.
 */
const { invalidarValidacionDocs, slotValidableDe } = require('./docValidacion');

async function rpc(supabase, fn, args) {
    const { error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
}

/**
 * @param {object} supabase
 * @param {object} o
 * @param {string} o.expedienteId
 * @param {string} o.oportunidadId   `set_expediente_doc_field` va por la oportunidad
 * @param {object} o.docLeida        `documentacion` tal como se leyó (para el historial)
 * @param {object} o.campos          { clave: valor } escalares a escribir; el orden de
 *                                   las claves es el de escritura (el enlace, al final)
 * @param {string[]} o.subidos       campos de documento que llegan en versión nueva
 * @param {{usuario?: string, origen?: string}} [o.quien]
 */
async function escribirSubidaEnDocumentacion(supabase, { expedienteId, oportunidadId, docLeida, campos, subidos, quien = {} }) {
    if (!expedienteId || !oportunidadId) throw new Error('Faltan el expediente o su oportunidad');
    const slots = [...new Set((subidos || []).map(slotValidableDe))];

    if (slots.length) {
        const nulos = Object.fromEntries(slots.map(s => [s, null]));
        await rpc(supabase, 'merge_expediente_doc_json', { p_expediente_id: expedienteId, p_field: 'docs_validados', p_value: nulos });
        await rpc(supabase, 'merge_expediente_doc_json', { p_expediente_id: expedienteId, p_field: 'docs_rechazados', p_value: nulos });

        const hayHistorial = Array.isArray(docLeida?.historial);
        const antes = hayHistorial ? docLeida.historial.length : 0;
        const despues = invalidarValidacionDocs(docLeida || {}, subidos, quien).historial;
        const nuevas = Array.isArray(despues) ? despues.slice(antes) : [];
        // La RPC AÑADE a una lista que ya existe; sobre una clave que no existe dejaría un
        // `{}` delante (`'{}' || '[…]'`). Sin historial previo, la nota se omite y se dice.
        if (nuevas.length && hayHistorial) {
            await rpc(supabase, 'merge_expediente_doc_json', { p_expediente_id: expedienteId, p_field: 'historial', p_value: nuevas });
        } else if (nuevas.length) {
            console.warn(`[documentacion] ${expedienteId}: sin historial previo, no se anota la nueva versión de ${slots.join(', ')}`);
        }
    }

    for (const [campo, valor] of Object.entries(campos || {})) {
        await rpc(supabase, 'set_expediente_doc_field', {
            p_oportunidad_id: oportunidadId,
            p_field: campo,
            p_value: valor === null || valor === undefined ? null : String(valor),
        });
    }
}

module.exports = { escribirSubidaEnDocumentacion };
