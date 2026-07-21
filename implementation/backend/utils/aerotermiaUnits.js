// ============================================================================
// aerotermiaUnits.js (CommonJS) — instalaciones EN CASCADA, lado backend.
//
// ⚠️ Espejo MÍNIMO de la fuente ESM:
//     frontend/src/features/expedientes/logic/aerotermiaUnits.js
// Ahí vive la lógica completa (formateo para los certificados, SCOP aplicado…)
// y es la que usan cifoDoc.js / res080Doc.js — también cuando los carga el
// backend por import() dinámico. Aquí solo están las 2 funciones estructurales
// que necesitan las VALIDACIONES síncronas de rutas y servicios CJS, donde no
// se puede hacer `require()` de un módulo ESM.
//
// Si cambia la forma del dato (`equipos_extra`), cambia en los dos sitios.
// ============================================================================

/** [unidad1, ...extras], descartando las unidades sin ningún dato real. */
function getUnidades(aero) {
    if (!aero || typeof aero !== 'object') return [];
    const { equipos_extra, ...unidad1 } = aero;
    const extras = Array.isArray(equipos_extra) ? equipos_extra : [];
    return [unidad1, ...extras].filter(u =>
        u && (u.marca || u.modelo || u.modelo_conjunto || u.numero_serie || u.aerotermia_db_id));
}

/** Nº de equipos declarados en el bloque. */
function countUnidades(aero) {
    return getUnidades(aero).length;
}

/**
 * Índices (1-based) de las unidades SIN número de serie. El nº de serie es
 * obligatorio en el CIFO, el Anexo I y la memoria RITE para CADA equipo.
 */
function unidadesSinSerie(aero) {
    return getUnidades(aero)
        .map((u, i) => ({ n: i + 1, serie: String(u.numero_serie || u.n_serie_ext || '').trim() }))
        .filter(x => !x.serie)
        .map(x => x.n);
}

/** Todos los nº de serie en texto plano ("A / B / C"), '' si no hay ninguno. */
function seriesPlanas(aero) {
    return getUnidades(aero)
        .map(u => String(u.numero_serie || u.n_serie_ext || '').trim())
        .filter(Boolean)
        .join(' / ');
}

module.exports = { getUnidades, countUnidades, unidadesSinSerie, seriesPlanas };
