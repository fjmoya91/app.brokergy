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
 * El USO como va en la clave `codigo#USO`: mayúsculas, sin tildes ni espacios
 * de más. La MISMA receta que `_uso_clave` del motor (`pipeline.py`).
 */
export const usoClave = (uso) => String(uso || '').normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '').toUpperCase().split(/\s+/).filter(Boolean).join(' ');

/**
 * Con qué se guarda una fila en `construcciones_elegidas`.
 *
 * REGLA — el código, salvo que OTRA fila de la misma parcela lo comparta: en
 * 26RES080_OP85 la vivienda de 28 m² y la piscina DEPORTIVO de 22 m² son las
 * dos `1/00/01`, y marcar la vivienda arrastraba la piscina (176 m² en vez de
 * 154). Entonces se guarda `codigo#USO`. Un código suelto guardado antes sigue
 * valiendo para todas las que lo llevan, como siempre.
 */
export function claveConstruccion(fila, lista) {
    if (fila?.clave) return fila.clave;
    const codigo = fila?.codigo;
    if (!codigo) return null;
    const repetido = (lista || []).filter(x => x?.codigo === codigo).length > 1;
    return repetido ? `${codigo}#${usoClave(fila.uso)}` : codigo;
}

/**
 * La selección guardada, con cada código AMBIGUO resuelto por el desglose que
 * se guardó con ella (`cuenta` por fila). Es lo que arregla, sin migrar nada,
 * las selecciones guardadas antes de la clave con uso: el desglose ya decía
 * que la piscina no contaba, solo que la lista de códigos no podía decirlo.
 */
export function resolverElegidas(elegidas, desglose) {
    if (!Array.isArray(elegidas)) return elegidas;
    const lista = Array.isArray(desglose) ? desglose.filter(c => c?.codigo) : [];
    const out = [];
    for (const e of elegidas) {
        const t = String(e ?? '').trim();
        if (!t) continue;
        const filas = t.includes('#') ? [] : lista.filter(c => c.codigo === t);
        const marcadas = filas.filter(c => c.cuenta);
        if (filas.length > 1 && marcadas.length && marcadas.length < filas.length) {
            for (const c of marcadas) out.push(claveConstruccion(c, lista));
        } else out.push(t);
    }
    return [...new Set(out)];
}

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
        construcciones_elegidas: lista.filter(c => c.cuenta).map(c => claveConstruccion(c, lista)),
    };
}

export default { codigoConstruccion, desgloseConstrucciones, claveConstruccion,
                 resolverElegidas, usoClave };
