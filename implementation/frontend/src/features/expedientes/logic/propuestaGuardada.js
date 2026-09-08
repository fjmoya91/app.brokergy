// ============================================================================
// propuestaGuardada.js — QUÉ propuesta se le presentó al cliente en la oportunidad.
//
// FUENTE ÚNICA. En un RES080 la oportunidad guarda DOS economías dentro del mismo
// `datos_calculo.result`, porque la calculadora presenta las dos opciones:
//
//   · `financials` + `savings`      → solo aerotermia   (la ficha RES060)
//   · `financialsRes080` + `res080` → aerotermia + envolvente (la ficha RES080)
//
// La que se aceptó —y la que da nombre al expediente— es la SEGUNDA. Leer la
// primera en un expediente RES080 rebaja el bono del cliente y el margen casi a la
// mitad: medido en 26RES080_73, la propuesta salía como 2.662 € y 28,02 MWh cuando
// al cliente se le presentaron 3.894 € y 40,99 MWh. Ocurre en los 35 expedientes
// RES080 que guardan las dos ramas (diferencias de hasta 2,3×: 26RES080_43 pasa de
// 2.886 € a 11.264 €).
//
// REGLA — las dos cifras salen de la MISMA rama. Cruzarlas (el bono de la reforma
// con el ahorro de la aerotermia) da un €/MWh que no existe, y de ese precio
// implícito cuelga el panel económico del expediente cuando aún no hay CEE.
//
// REGLA — un RES080 MIGRADO no tiene rama de reforma: su única economía guardada
// es `financials` (a veces solo `financials.ahorroKwh`), y ésa es la buena. Solo se
// cambia de rama cuando la de reforma está ENTERA —importes y ahorro—; media rama
// sería peor que la de siempre.
// ============================================================================

/**
 * @param {object} op   Oportunidad (con `datos_calculo`).
 * @param {boolean} esReforma  El expediente/oportunidad es de ficha RES080.
 * @returns {{usaReforma:boolean, financials:object, savings:object, savingsKwh:number|null}}
 */
export function propuestaGuardada(op, esReforma) {
    const result = op?.datos_calculo?.result || {};
    const fin080 = result.financialsRes080 || null;
    const kwh080 = Number(result.res080?.ahorroEnergiaFinalTotal);

    const usaReforma = !!esReforma && fin080?.caeBonus != null && kwh080 > 0;

    if (usaReforma) {
        // El ahorro de la reforma NO vive en `financialsRes080` sino en `res080`;
        // `savings` se deja reducido a él para no arrastrar los porcentajes y las
        // emisiones de la rama de aerotermia, que son de la otra opción.
        return { usaReforma: true, financials: fin080, savings: { savingsKwh: kwh080 }, savingsKwh: kwh080 };
    }

    const financials = result.financials || {};
    const savings = result.savings || {};
    // El ahorro puede estar en `result.savings.savingsKwh` (oportunidades de la app),
    // en `result.financials.ahorroKwh` (migradas de AppSheet) o suelto en la raíz;
    // una oportunidad puede traer uno y no los otros. Cuando trae los DOS manda
    // `savings.savingsKwh`, que es del que salió el `caeBonus` guardado: en el único
    // caso con ambos (25RES060_83) el par 35.299 kWh / 3.353 € da los 95 €/MWh
    // pactados, mientras que con `ahorroKwh` (32.404) saldría un precio de 103,49
    // que nunca existió. El listado lo leía al revés y contradecía al panel.
    const savingsKwh = savings.savingsKwh ?? financials.ahorroKwh ?? result.savingsKwh ?? null;
    return { usaReforma: false, financials, savings, savingsKwh };
}
