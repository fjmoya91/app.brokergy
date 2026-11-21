// ============================================================================
// superficieCalefaccion.js — la SUPERFICIE CALEFACTADA frente a la ÚTIL.
//
// La demanda de calefacción (y con ella el ahorro y la ayuda) se calcula sobre la
// superficie CALEFACTADA (`calculation.js`: `S = superficieCalefactable`). Por eso:
//
// REGLA — la calefactada NO baja de la útil sin confirmarlo (Fran, 16/11/2026: «que
// no deje poner menos metros que la útil y si se pone que salte un aviso diciendo que
// bajará la ayuda y que confirme»). Lo normal es lo contrario: el Catastro llama
// «almacén» o «garaje» a una planta que en la casa es vivienda y tiene radiadores, y
// esos metros SE SUMAN. Menos metros que la útil solo si hay zonas de la vivienda sin
// calefacción, y eso lo confirma quien lo teclea.
//
// REGLA — lo confirmado se GUARDA con quién y cuándo (`inputs.supCalefMenor`), y el
// equipo interno lo ve junto al campo: una ayuda más baja de lo normal tiene que
// llegar explicada, no descubrirse.
// ============================================================================

/** Medio m² de margen: el Catastro y los CEE redondean distinto. */
export const TOLERANCIA_M2 = 0.5;

/** Un valor del formulario (número, «120», «1.250,5», «120,») a m². */
export function m2(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v ?? '').trim();
    if (!s) return null;
    const n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? n : null;
}

/** ¿La calefactada queda por debajo de la útil? (con los dos datos puestos) */
export function supCalefPorDebajo(util, calef) {
    const u = m2(util);
    const c = m2(calef);
    return u > 0 && c > 0 && c < u - TOLERANCIA_M2;
}

/** Lo que se guarda al confirmarlo: los dos valores, quién y cuándo. */
export function confirmacionSupCalef({ util, calef, usuario, ahora = new Date() }) {
    return {
        util: m2(util),
        calef: m2(calef),
        por: usuario?.nombre || usuario?.email || null,
        empresa: usuario?.razon_social || usuario?.acronimo || null,
        rol: (usuario?.rol || '').toUpperCase() || null,
        at: ahora.toISOString(),
    };
}

/** ¿Lo confirmado sigue valiendo para lo que hay ahora en el formulario? */
export function confirmacionVigente(confirmado, util, calef) {
    if (!confirmado || !supCalefPorDebajo(util, calef)) return false;
    return Math.abs((m2(confirmado.calef) ?? -1) - m2(calef)) <= TOLERANCIA_M2
        && Math.abs((m2(confirmado.util) ?? -1) - m2(util)) <= TOLERANCIA_M2;
}
