// ============================================================================
// demandaAcs.js — FUENTE ÚNICA de la demanda anual de ACS (D_ACS) del expediente.
// ----------------------------------------------------------------------------
// D_ACS entra en la fórmula del ahorro en kWh/año ABSOLUTOS, pero el dato de
// partida cambia según de dónde salga. La misma derivación estaba copiada en el
// panel económico, en el CIFO, en la Ficha RES060 y en dos servicios del backend:
// cualquier modo nuevo obligaba a tocar los cinco sitios (y si uno se olvidaba,
// el documento oficial y el panel mostraban ahorros distintos). Aquí vive una vez.
//
// Modos (`expedientes.cee.acs_method`):
//   · 'xml'    → del .xml del CEE: demandaACS (kWh/m²·año) · superficie útil (m²).
//   · 'cte'    → estimación del Anejo F del CTE DB-HE para residencial privado:
//                28 l/persona·día · N_P · C_e (0,001162 kWh/kg·°C) · 365 · ΔT(46°C),
//                con N_P = nº de habitaciones + 1.
//   · 'litros' → los LITROS/DÍA que declara el propio certificado ("Demanda diaria
//                de ACS a 60°", en su apartado de instalaciones de ACS), tecleados
//                por el técnico. Misma fórmula del Anejo F, pero SIN el tramo de
//                ocupación: la demanda diaria ya viene medida para el edificio, así
//                que multiplicarla otra vez por el nº de personas la multiplicaría
//                por cinco. Es el modo bueno cuando el certificado la trae, porque
//                entonces la cifra no es una estimación por dormitorios: es un dato
//                del CEE, y el ΔT de 46 °C (60 − 14) casa con esos mismos 60 °C.
//   · 'manual' → valor introducido a mano en kWh/año (`cee.dacs_manual`).
//                Es el modo del sector TERCIARIO (ficha TER100): en un hotel, una
//                residencia o un gimnasio la demanda de ACS va por plaza/servicio
//                (Anexo V de la ficha) o la da el proyecto, no la fórmula del CTE
//                por habitaciones de vivienda.
//
// Módulo ESM PURO (sin React ni Node): lo importan los módulos del frontend y,
// por import() dinámico, los servicios del backend.
// ============================================================================

export const ACS_METHOD = { XML: 'xml', CTE: 'cte', LITROS: 'litros', MANUAL: 'manual' };

/** Constantes de la fórmula del Anejo F del CTE DB-HE (residencial privado). */
export const CTE_ACS = {
    LITROS_PERSONA_DIA: 28,
    CALOR_ESPECIFICO: 0.001162, // kWh/kg·°C
    DIAS: 365,
    SALTO_TERMICO: 46,          // 60 °C de acumulación − 14 °C de red
};

/** Nº de personas consideradas por la estimación del CTE (habitaciones + 1). */
export function personasCte(cee = {}) {
    return (parseInt(cee.num_rooms, 10) || 4) + 1;
}

/** D_ACS (kWh/año) por la fórmula del Anejo F del CTE. */
export function dacsCte(cee = {}) {
    const { LITROS_PERSONA_DIA, CALOR_ESPECIFICO, DIAS, SALTO_TERMICO } = CTE_ACS;
    return LITROS_PERSONA_DIA * personasCte(cee) * CALOR_ESPECIFICO * DIAS * SALTO_TERMICO;
}

/** Litros/día a 60 °C declarados por el certificado (modo 'litros'). */
export function litrosDia(cee = {}) {
    return parseFloat(cee.dacs_litros_dia) || 0;
}

/**
 * D_ACS (kWh/año) a partir de los litros/día del certificado.
 * Misma fórmula que `dacsCte` salvo el tramo de ocupación (L/persona·día · N_P),
 * que aquí sobra: el dato del CEE ya es el consumo diario del edificio entero.
 */
export function dacsLitros(cee = {}) {
    const { CALOR_ESPECIFICO, DIAS, SALTO_TERMICO } = CTE_ACS;
    return litrosDia(cee) * CALOR_ESPECIFICO * DIAS * SALTO_TERMICO;
}

/**
 * Resuelve la demanda anual de ACS del expediente.
 *
 * @param {Object} cee      - `expedientes.cee`
 * @param {Object} ceeBase  - el CEE que manda (final si es válido, si no el inicial)
 * @param {Object} [extra]  - fallbacks de la oportunidad: { demandAcsFallback }
 * @returns {{ value:number, mode:string, dacsPorM2:number, superficie:number, personas:number, litrosDia:number }}
 */
export function resolveDacs(cee = {}, ceeBase = {}, extra = {}) {
    const mode = cee.acs_method || ACS_METHOD.XML;
    const superficie = parseFloat(ceeBase.superficieHabitable) || 0;
    const dacsPorM2 = parseFloat(ceeBase.demandaACS) || 0;

    let value;
    if (mode === ACS_METHOD.MANUAL) {
        value = parseFloat(cee.dacs_manual) || 0;
    } else if (mode === ACS_METHOD.LITROS) {
        value = dacsLitros(cee);
    } else if (mode === ACS_METHOD.CTE) {
        value = dacsCte(cee);
    } else {
        value = dacsPorM2 * superficie || parseFloat(extra.demandAcsFallback) || 0;
    }

    return { value, mode, dacsPorM2, superficie, personas: personasCte(cee), litrosDia: litrosDia(cee) };
}
