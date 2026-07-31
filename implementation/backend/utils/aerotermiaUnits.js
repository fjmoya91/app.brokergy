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

/**
 * Tipo del EQUIPO NUEVO del bloque (solo relevante en ACS):
 *   'bdc' | 'acumulador' | 'termo_electrico'
 * Retrocompatible con el booleano antiguo `es_acumulador`.
 */
// Se compara en MINÚSCULAS: normalizeData sube los strings a MAYÚSCULAS antes de
// persistir, así que en BD el valor es 'TERMO_ELECTRICO'.
function tipoEquipoNuevo(aero) {
    const t = String((aero && aero.tipo_equipo_nuevo) || '').trim().toLowerCase();
    if (t === 'termo_electrico' || t === 'termo') return 'termo_electrico';
    if (t === 'acumulador' || (aero && aero.es_acumulador)) return 'acumulador';
    return 'bdc';
}

/** Termo eléctrico: efecto Joule, rendimiento 1, sin ficha técnica que justificar. */
function esTermoElectrico(aero) {
    return tipoEquipoNuevo(aero) === 'termo_electrico';
}

/** Acumulador de ACS: depósito calentado por la BdC de calefacción. */
function esAcumuladorAcs(aero) {
    return tipoEquipoNuevo(aero) === 'acumulador';
}

/** ¿El equipo necesita ficha técnica/EPREL para justificar un SCOP? Solo la BdC. */
function justificaScop(aero) {
    return tipoEquipoNuevo(aero) === 'bdc';
}

/**
 * ¿El ACS computa en la fórmula del ahorro? Espejo de `acsComputaAhorro` en la
 * fuente ESM: BdC (propia o la misma que calefacción) sí; ACUMULADOR sí si tiene
 * SCOP_dhw (lo calienta la BdC, Anexo VI — no apunta a ningún modelo del
 * catálogo porque sus datos son manuales); termo eléctrico no.
 */
function acsComputaAhorro(inst) {
    if (!inst || inst.cambio_acs === false) return false;
    if (esTermoElectrico(inst.aerotermia_acs)) return false;
    if (inst.misma_aerotermia_acs) return true;
    if (esAcumuladorAcs(inst.aerotermia_acs)) return parseFloat(inst.aerotermia_acs && inst.aerotermia_acs.scop) > 0;
    return !!(inst.aerotermia_acs && inst.aerotermia_acs.aerotermia_db_id);
}

module.exports = { getUnidades, countUnidades, unidadesSinSerie, seriesPlanas, tipoEquipoNuevo, esTermoElectrico, esAcumuladorAcs, justificaScop, acsComputaAhorro };
