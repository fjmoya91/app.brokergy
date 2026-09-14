// ─────────────────────────────────────────────────────────────────────────────
// Qué construcciones del Catastro CUENTAN en este expediente.
//
// La ficha técnica enseña el «Detalle de Construcciones» tal cual lo devuelve
// Catastro y una persona marca cuáles entran: de ahí salen la superficie y el
// número de plantas con los que se calcula el ahorro y se le presupuesta al
// cliente. Esa misma marca tiene que llegar al `.cex`, o el certificado mide
// otro edificio que la propuesta que se firmó.
//
// REGLA — la selección se guarda por CÓDIGO, nunca por el índice de la fila.
// Se guardaba como `selectedConstructions: [0, 4, 5, 7]`, índices de una lista
// que NO se guardaba en ninguna parte: fuera de esa pantalla no había forma de
// saber a qué apuntaban, y bastaba con que Catastro devolviera las filas en
// otro orden para que señalaran a otra cosa. El código `escalera/planta/puerta`
// es lo que Catastro usa para distinguir dos filas de la misma parcela, y es el
// MISMO que compone el motor (`UnidadConstructiva.codigo`).
//
// Los índices se siguen guardando: son los que reabren la ficha técnica con lo
// marcado puesto, y hay 85 oportunidades que solo tienen eso.
// ─────────────────────────────────────────────────────────────────────────────

/** El código de una fila del detalle: `escalera/planta/puerta`. */
export const codigoConstruccion = (c) => String(c?.code || '').trim() || null;

/**
 * El desglose entero y lo marcado, listos para guardar con la oportunidad.
 *
 * Son ~10 filas de cinco campos: metadatos, no ficheros (regla 21). Se guarda
 * la lista COMPLETA y no solo lo elegido porque lo que no cuenta también se
 * enseña —tachado— en la envolvente: un almacén que se dejó fuera a propósito
 * y un almacén que nadie miró se ven igual si solo se guarda lo marcado.
 */
export function desgloseConstrucciones(constructions, indices) {
    const lista = (constructions || []).map((c, i) => ({
        codigo: codigoConstruccion(c),
        uso: c.originalType || c.type || null,
        planta: c.floor ?? null,
        superficie: Number(c.surface) || 0,
        cuenta: (indices || []).includes(i),
    })).filter(c => c.codigo);

    return {
        construcciones: lista,
        construcciones_elegidas: lista.filter(c => c.cuenta).map(c => c.codigo),
    };
}

export default { codigoConstruccion, desgloseConstrucciones };
