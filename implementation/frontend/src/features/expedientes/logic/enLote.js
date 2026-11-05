// ─────────────────────────────────────────────────────────────────────────────
// «EN LOTE»: el estado que ENSEÑA el listado de un expediente completo que ya
// está en un lote (Fran, 05/11/2026: «tengo 5 con documentación completa, pero
// al lotear no me salen» — estaban ya en el LOTE-2026-015 y en el que armaba).
//
// Un expediente sigue en DOC. COMPLETA hasta que su lote sale al verificador
// (ENVIADO A VERIFICADOR), así que el filtro DOC. COMPLETA mezclaba lo libre con
// lo ya loteado. NO es un estado de la BD: de `estado` cuelgan las carpetas de
// Drive, el parte diario y lo que arrastra el lote; aquí solo se enseña.
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADO_EN_LOTE = 'EN LOTE';
const COMPLETOS = ['DOC. COMPLETA', 'DOC. COMPLETA APPSHEET'];

export const estaEnLote = (exp) => COMPLETOS.includes(exp?.estado || '') && !!exp?.lote_id;

/** El estado con el que se pinta, se cuenta y se filtra en el listado. */
export const estadoVisible = (exp) => (estaEnLote(exp) ? ESTADO_EN_LOTE : (exp?.estado || 'PTE. CEE INICIAL'));

/** Los estados del listado con «EN LOTE» justo detrás de DOC. COMPLETA. */
export function conEnLote(estados) {
    const i = estados.indexOf('DOC. COMPLETA');
    if (i < 0 || estados.includes(ESTADO_EN_LOTE)) return estados;
    return [...estados.slice(0, i + 1), ESTADO_EN_LOTE, ...estados.slice(i + 1)];
}
