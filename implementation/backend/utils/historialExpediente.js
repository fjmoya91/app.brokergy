/**
 * Añade UNA entrada al historial de un expediente (`documentacion.historial[]`), sin
 * leer ni reescribir la documentación entera y dejando SIEMPRE una lista (regla 242).
 *
 * Va por la RPC `expediente_historial_append` (scripts/expediente_historial_append.sql),
 * que añade a la lista que haya, convierte la que quedó guardada como TEXTO y crea la
 * lista si no existe. Antes tres servicios hacían «si hay lista, `merge_expediente_doc_json`;
 * si no, `set_expediente_doc_field`», y esa segunda RPC guarda su valor como texto: la lista
 * quedaba como '[{…}]' y la pestaña del CEE caía (26RES060_303, 23/11/2026; ocho
 * expedientes). No usar `set_expediente_doc_field` para el historial.
 *
 * No lanza: devuelve `{ error }` como `supabase.rpc`, y cada llamador decide si avisa.
 *
 * @param {object} supabase
 * @param {string} expedienteId  uuid de `expedientes.id`
 * @param {object} entrada       { id, tipo, fecha, usuario, texto, … }
 */
async function anadirAlHistorial(supabase, expedienteId, entrada) {
    if (!expedienteId || !entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
        return { error: new Error('anadirAlHistorial: faltan el expediente o la entrada') };
    }
    const { error } = await supabase.rpc('expediente_historial_append', {
        p_expediente_id: expedienteId,
        p_entrada: entrada,
    });
    return { error: error || null };
}

module.exports = { anadirAlHistorial };
