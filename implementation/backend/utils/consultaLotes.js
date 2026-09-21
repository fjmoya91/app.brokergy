// ─── Consultas `.in(...)` con MUCHOS ids ─────────────────────────────────────
//
// supabase-js manda el filtro en la URL, así que un `.in('cliente_id', ids)`
// con la lista entera crece con la base hasta reventar: PostgREST corta por
// cabeceras a 16 KB y a partir de ahí la consulta falla con
// `HeadersOverflowError` — no con una lista recortada, sino con un error.
//
// Medido el 2026-09-21 en producción: 410 clientes → **16.131 caracteres** de
// URL. El listado de clientes llevaba días diciendo "SIN ASIGNAR" en TODAS las
// fichas y sin accesos directos al expediente, porque la ruta se tragaba ese
// error y devolvía las listas vacías.
//
// REGLA — una consulta por ids se trocea SIEMPRE, no "cuando la lista sea
// larga": nadie va a acordarse de volver aquí el día que se pase de 400, y el
// síntoma no es un fallo ruidoso — es un dato que falta.
//
// El lote son 100 ids ≈ 3,8 KB de URL con UUID, muy por debajo del tope, y con
// sitio de sobra para el resto de la query (`select`, `order`, otros filtros).
const LOTE_IDS = 100;

/**
 * Ejecuta una consulta por lotes de ids y concatena los resultados.
 *
 * REGLA — un lote que falla LANZA. Devolver lo que sí se pudo leer es peor que
 * fallar: quien lo consume no distingue "este cliente no tiene oportunidad" de
 * "no he podido preguntarlo", y lo pinta como un hecho.
 *
 * @param {Array} ids       los ids por los que filtrar
 * @param {Function} query  (trozo) => PromiseLike<{data, error}>
 * @param {number} [tam]    tamaño del lote
 * @returns {Promise<Array>} todas las filas
 */
async function enLotes(ids, query, tam = LOTE_IDS) {
    const lista = Array.from(new Set((ids || []).filter(Boolean)));
    if (!lista.length) return [];

    const trozos = [];
    for (let i = 0; i < lista.length; i += tam) trozos.push(lista.slice(i, i + tam));

    const resultados = await Promise.all(trozos.map(t => query(t)));
    const filas = [];
    for (const r of resultados) {
        if (r?.error) throw r.error;
        if (Array.isArray(r?.data)) filas.push(...r.data);
    }
    return filas;
}

module.exports = { enLotes, LOTE_IDS };
