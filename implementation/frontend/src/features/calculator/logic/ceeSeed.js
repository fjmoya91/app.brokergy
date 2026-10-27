// ceeSeed — Traduce los datos de un CEE anterior (OCR/XML, objeto `cee_previo`) a los
// campos del modo "CEE aportado" (por emisiones) de la calculadora, para que su tabla
// aparezca rellena con la columna INICIAL real del CEE + un FINAL estimado (demanda/SCOP).
//
// Se usa en dos sitios:
//   - ReformaSubFlow.doSubmitInternal → siembra al crear la oportunidad (nuevas).
//   - CalculatorView → siembra al cargar una oportunidad que tenga cee_previo pero sin
//     los campos manualEmisiones* (oportunidades creadas antes de esta funcionalidad).
//
// `seedInputsFromCees()` (al final) es la FUENTE ÚNICA de "cómo entran uno o dos CEE
// en los inputs de la calculadora". Los dos consumidores de arriba la llaman; no
// volver a escribir a mano el reparto inicial/final en ninguna vista.

import { ceeToXmlShape, ceeFromXml } from '../../cee/ceeExtract';
import { demandaDeCalculo, demandaCal, superficie as ceeSuperficie, rendimientoCalefaccion } from '../../cee/ceeAvisos';

const F_ELEC = 0.331; // factor de paso Electricidad peninsular

// Mapea el combustible del CEE a las opciones EXACTAS del selector (FACTORES_PASO).
export function mapCeeCombustible(c) {
  if (!c) return '';
  const s = String(c).toLowerCase();
  if (s.includes('electr')) return 'Electricidad peninsular';
  if (s.includes('gas natural') || s.includes('gasnatural')) return 'Gas Natural';
  if (s.includes('glp') || s.includes('propano') || s.includes('butano')) return 'GLP';
  if (s.includes('gasóle') || s.includes('gasole') || s.includes('gasoleo') || s.includes('gasoil')) return 'Gasoleo Calefacción';
  if (s.includes('carbó') || s.includes('carbon')) return 'Carbón';
  if (s.includes('pelet') || s.includes('densificada')) return 'Biomasa densificada (pelets)';
  if (s.includes('biomasa') || s.includes('leña') || s.includes('lena')) return 'Biomasa no densificada';
  return c;
}

// Combustible del CEE → opción del funnel (`funnel.combustible_actual`). Es el mapeo
// INVERSO al de la calculadora: allí interesa el factor de paso; aquí, la tarjeta que
// el funnel debe dar por contestada. Devuelve null si no se reconoce (mejor preguntar
// que dar por buena una suposición sobre el combustible: de él sale el rendimiento η).
export function ceeCombustibleToFunnel(c) {
  if (!c) return null;
  const s = String(c).toLowerCase();
  if (s.includes('electr')) return 'electrica';
  if (s.includes('gas natural') || s.includes('gasnatural') || s.includes('glp') || s.includes('propano') || s.includes('butano')) return 'gas';
  if (s.includes('gasóle') || s.includes('gasole') || s.includes('gasoleo') || s.includes('gasoil')) return 'gasoleo';
  if (s.includes('carbó') || s.includes('carbon')) return 'carbon';
  if (s.includes('biomasa') || s.includes('pelet') || s.includes('leña') || s.includes('lena') || s.includes('densificada')) return 'biomasa';
  return null;
}

/**
 * Traduce UN CEE cargado (objeto normalizado de ceeExtract) a los valores de UNA columna
 * de la tabla de emisiones (inicial o final). No decide inicial/final: el consumidor lo
 * aplica a la columna que corresponda. Refrigeración vacía → electricidad (siempre eléctrica).
 * Trae también las dos celdas del método SIMPLIFICADO (emiElec/emiOtros/combOtros), que
 * llegan tanto del .xml (<EmisionesCO2><ConsumoElectrico>/<ConsumoOtros>) como del OCR.
 * `combOtros` sale del combustible único detectado y, si no lo trae, del primer
 * combustible no eléctrico de los servicios — es la mejor conjetura, y el usuario la ve
 * en el desplegable antes de confirmar.
 * @param {object} cee objeto CEE normalizado { emisiones, servicios, demandas, superficie_habitable_m2 }
 * @returns {object} { emiCal, emiAcs, emiRef, combCal, combAcs, combRef, sup, demCal, emiElec, emiOtros, combOtros }
 */
export function ceeToColumn(cee) {
  const numOr = (v) => { const n = Number(v); return isFinite(n) ? n : ''; };
  const em = cee?.emisiones || {};
  const sv = cee?.servicios || {};
  const dm = cee?.demandas || {};
  const noElectrico = (c) => c && !/electric/i.test(String(c));
  const combOtros = mapCeeCombustible(cee?.combustible_otros_detectado)
    || mapCeeCombustible([sv.calefaccion?.combustible, sv.acs?.combustible, sv.refrigeracion?.combustible].find(noElectrico))
    || '';
  return {
    emiCal: numOr(em.calefaccion),
    emiAcs: numOr(em.acs),
    emiRef: numOr(em.refrigeracion),
    combCal: mapCeeCombustible(sv.calefaccion?.combustible) || 'Gas Natural',
    combAcs: mapCeeCombustible(sv.acs?.combustible) || 'Gas Natural',
    combRef: mapCeeCombustible(sv.refrigeracion?.combustible) || 'Electricidad peninsular',
    sup: numOr(cee?.superficie_habitable_m2),
    demCal: numOr(dm.calefaccion_kwh_m2_ano),
    // Método simplificado (por vector energético)
    emiElec: numOr(em.consumo_electrico_m2),
    emiOtros: numOr(em.consumo_otros_m2),
    combOtros,
  };
}

/**
 * @param {object} cee   objeto cee_previo { emisiones, servicios, demandas, superficie_habitable_m2 }
 * @param {object} ctx   { scopHeating, scopAcs, changeAcs, manualDemandAcs } de los inputs de la calculadora
 * @returns {object} campos manualEmisiones / combustible / manualSup / manualDemand listos para inputs
 */
export function ceeToEmisionesInputs(cee, ctx = {}) {
  if (!cee) return {};
  const numOr = (v) => { const n = Number(v); return isFinite(n) ? n : ''; };
  const r2 = (n) => Math.round(n * 100) / 100;

  const em = cee.emisiones || {};
  const sv = cee.servicios || {};
  const dm = cee.demandas || {};

  const demCal = Number(dm.calefaccion_kwh_m2_ano);
  const scopCal = Number(ctx.scopHeating) || 3.0;
  const scopAcs = Number(ctx.scopAcs) || scopCal;
  const changeAcs = !!ctx.changeAcs;
  const demAcs = Number(ctx.manualDemandAcs) || 8.8;

  const emiCalFin = isFinite(demCal) && demCal > 0 ? r2((demCal / scopCal) * F_ELEC) : '';
  const emiAcsFin = changeAcs ? r2((demAcs / scopAcs) * F_ELEC) : numOr(em.acs);

  const combCalIni = mapCeeCombustible(sv.calefaccion?.combustible);
  const combAcsIni = mapCeeCombustible(sv.acs?.combustible);
  // Refrigeración: en España es SIEMPRE eléctrica. Si el CEE no declara combustible de
  // frío, caemos a electricidad para no dejar el factor de paso en 1 (consumo erróneo).
  const combRefIni = mapCeeCombustible(sv.refrigeracion?.combustible) || 'Electricidad peninsular';
  const sup = numOr(cee.superficie_habitable_m2);

  return {
    // INICIAL = datos reales del CEE
    manualEmisionesCalefaccionInicial: numOr(em.calefaccion),
    manualEmisionesAcsInicial: numOr(em.acs),
    manualEmisionesRefrigeracionInicial: numOr(em.refrigeracion),
    combustibleCalefaccionInicial: combCalIni,
    combustibleAcsInicial: combAcsIni,
    combustibleRefrigeracionInicial: combRefIni,
    manualSupInicial: sup,
    manualDemand: numOr(dm.calefaccion_kwh_m2_ano),
    // FINAL estimado tras la reforma (aerotermia eléctrica)
    manualEmisionesCalefaccionFinal: emiCalFin,
    manualEmisionesAcsFinal: emiAcsFin,
    manualEmisionesRefrigeracionFinal: numOr(em.refrigeracion),
    combustibleCalefaccionFinal: 'Electricidad peninsular',
    combustibleAcsFinal: changeAcs ? 'Electricidad peninsular' : combAcsIni,
    combustibleRefrigeracionFinal: combRefIni,
    manualSupFinal: sup,
  };
}

/**
 * Traduce el CEE FINAL **real** a la columna FINAL de la tabla de emisiones.
 * Es el equivalente de `ceeToEmisionesInputs` para la otra columna, y sustituye a
 * la estimación `demanda/SCOP`: cuando el cliente aporta el certificado posterior,
 * el ahorro deja de ser estimado y pasa a ser MEDIDO.
 */
export function ceeFinalToEmisionesInputs(ceeFinal) {
  if (!ceeFinal) return {};
  const c = ceeToColumn(ceeFinal);
  return {
    manualEmisionesCalefaccionFinal: c.emiCal,
    manualEmisionesAcsFinal: c.emiAcs,
    manualEmisionesRefrigeracionFinal: c.emiRef,
    combustibleCalefaccionFinal: c.combCal,
    combustibleAcsFinal: c.combAcs,
    combustibleRefrigeracionFinal: c.combRef,
    manualSupFinal: c.sup,
  };
}

/**
 * FUENTE ÚNICA de la siembra de la calculadora a partir de los CEE aportados.
 *
 * @param {object}      params
 * @param {object|null} params.inicial  CEE normalizado anterior a la obra
 * @param {object|null} params.final    CEE normalizado posterior a la obra
 * @param {object}      params.inputs   inputs de la calculadora ya mapeados del funnel
 * @returns {object} PARCHE de inputs (mezclar con Object.assign sobre los inputs)
 *
 * Reglas que aplica (y que no deben duplicarse fuera):
 *   1. `demandMode = 'manual'` — la calculadora abre ya en "Cálculo Real", sin que
 *      el admin tenga que activarlo a mano.
 *   2. La demanda y la superficie del cálculo salen de `demandaDeCalculo()`: con CEE
 *      FINAL manda el FINAL (ver ceeAvisos.js).
 *   3. RES080 (reforma): columna INICIAL con el CEE inicial y columna FINAL con el
 *      CEE final REAL si lo hay; si no, FINAL estimado (demanda/SCOP).
 *   4. `xmlDemandData` / `xmlDemandDataFinal` se rellenan con la forma de parseCeeXml
 *      para que (a) la ficha de "Cálculo Real" muestre los dos certificados cargados
 *      y (b) al aceptar, el expediente nazca con `cee.cee_inicial` y `cee.cee_final`.
 *   5. `cee_ahorro_origen` = 'medido' | 'estimado' — lo lee la UI para no presentar
 *      como medido un ahorro que en realidad se estimó.
 */
export function seedInputsFromCees({ inicial = null, final = null, inputs = {}, propio = false }) {
  if (!inicial && !final) return {};
  const patch = { demandMode: 'manual' };

  // El objeto normalizado se guarda SIN el PDF (pesado): el fichero va a Drive.
  // `propio`: el CEE lo hemos hecho NOSOTROS (ver `ceeEsPropio`).
  const limpio = (c) => {
    if (!c) return null;
    const { pdfBase64, ...resto } = c;
    return propio ? { ...resto, origen: CEE_ORIGEN_BROKERGY } : resto;
  };
  patch.cee_previo = limpio(inicial) || limpio(final);   // el "de partida" que ya conocía la app
  patch.cee_final = limpio(final);
  patch.cee_ahorro_origen = final ? 'medido' : 'estimado';

  // Los dos certificados en forma de parseCeeXml (para la ficha y para el expediente).
  if (inicial) patch.xmlDemandData = ceeToXmlShape(limpio(inicial));
  if (final) patch.xmlDemandDataFinal = ceeToXmlShape(limpio(final));
  // Solo el final: es a la vez el "inicial" que conoce la app (no hay otro) y el final.
  if (!inicial && final) patch.xmlDemandData = ceeToXmlShape(limpio(final));

  // Demanda y superficie del cálculo — con CEE final, manda el final.
  const { demanda, superficie } = demandaDeCalculo(inicial, final);
  if (demanda > 0) patch.manualDemand = demanda;
  if (superficie > 0) patch.manualSuperficie = superficie;

  // El rendimiento (η) de la caldera antigua NO se pisa con el del CEE, aunque el
  // certificado lo traiga medido. El expediente no guarda η: guarda `rendimiento_id`
  // (el boilerId de la tabla de boilerMapping) y vuelve a leer de ella, así que un η
  // "mejor" en la simulación daría un ahorro que el CIFO no puede reproducir — y esa
  // discrepancia es lo primero que mira un verificador. El certificado se usa para
  // ELEGIR la casilla de la tabla (`sugerirEdadDesdeRendimiento`, en la pantalla de
  // resumen), no para saltársela. Solo se deja anotado de dónde salió.
  const eff = rendimientoCalefaccion(inicial);
  if (eff) patch.cee_rendimiento_caldera = eff;

  if (inputs.isReforma) {
    // RES080: tabla de emisiones. INICIAL real + FINAL (real si lo hay, si no estimado).
    Object.assign(patch, ceeToEmisionesInputs(limpio(inicial) || limpio(final), {
      scopHeating: inputs.scopHeating,
      scopAcs: inputs.scopAcs,
      changeAcs: inputs.changeAcs || inputs.incluir_acs,
      manualDemandAcs: inputs.manualDemandAcs,
    }));
    if (final) Object.assign(patch, ceeFinalToEmisionesInputs(limpio(final)));
  }

  return patch;
}

const tieneEnergiaFinal = (c) => !!(c?.energia_final_vectores && Object.keys(c.energia_final_vectores).length);

/**
 * El «Cálculo real» de un RES080: lo que confirma el popup `CeeRealModal` (CEE inicial,
 * final opcional y de quién es el inicial) convertido en PARCHE de inputs.
 *
 * REGLA (2026-10-27, Fran, 26RES080_OP86): una sola pestaña «Cálculo real» en reforma.
 *   - Con los DOS certificados declarando <EnergiaFinalVectores> (.xml) → `demandMode:
 *     'real'`: el ahorro es la energía final que declara cada uno (calculateRes080 lo
 *     fuerza, `metodoForzado: 'energia_final'`). Sin tabla, sin combustibles que elegir.
 *   - Si alguno viene por OCR (PDF/foto, que no imprime la energía final) o no hay final →
 *     `demandMode: 'manual'`: la tabla de emisiones de siempre, con el FINAL real si lo
 *     hay y, si no, estimado con la aerotermia (seedInputsFromCees).
 *   - Con CEE FINAL el ahorro está MEDIDO entre dos certificados y no hay comparativa «con
 *     tu CEE» (26RES080_OP70, como `cargarRes080EnOportunidad`): `cee_previo` se quita y
 *     de quién era el inicial queda en `cee_inicial_origen`.
 *   - Lo que no se ha vuelto a subir conserva su forma de parseCeeXml (generadores, fechas):
 *     pasarla por ceeFromXml → ceeToXmlShape la recortaría.
 */
export function seedCalculoRealReforma({ inicial, final = null, propio = false, cambiadoInicial = true, cambiadoFinal = true, inputs = {} }) {
  if (!inicial) return {};
  const patch = seedInputsFromCees({ inicial, final, inputs: { ...inputs, isReforma: true } });
  if (!cambiadoInicial && inputs.xmlDemandData) patch.xmlDemandData = inputs.xmlDemandData;
  if (final && !cambiadoFinal && inputs.xmlDemandDataFinal) patch.xmlDemandDataFinal = inputs.xmlDemandDataFinal;
  if (!final) { patch.xmlDemandDataFinal = null; patch.cee_final = null; }

  // La superficie del cálculo es la del CEE INICIAL (la vivienda real), como al confirmar
  // la tabla de emisiones y en `cargarRes080EnOportunidad`: la del Catastro no vale aquí.
  const supIni = Number(inicial.superficie_habitable_m2);
  if (supIni > 0) patch.superficieCalefactable = supIni;

  patch.cee_inicial_origen = propio ? CEE_ORIGEN_BROKERGY : 'cliente';
  if (final) {
    patch.cee_previo = null;
  } else if (patch.cee_previo) {
    const { origen: _origen, ...resto } = patch.cee_previo;
    patch.cee_previo = propio ? { ...resto, origen: CEE_ORIGEN_BROKERGY } : resto;
  }

  if (final && tieneEnergiaFinal(inicial) && tieneEnergiaFinal(final)) {
    patch.demandMode = 'real';
    patch.metodoAhorroRes080 = 'simplificado';
  }
  return patch;
}

/**
 * Lo que el popup del «Cálculo real» enseña como YA cargado: el CEE normalizado de cada
 * fase, sacado de `cee_previo`/`cee_final` o, si la simulación solo tiene el .xml
 * (`cargarRes080EnOportunidad`, la subida antigua), de `xmlDemandData`/`xmlDemandDataFinal`.
 * Si los dos existen manda el que trae la energía final.
 */
export function ceesCargadosReforma(inputs = {}) {
  const elegir = (normalizado, xml) => {
    const deXml = xml ? ceeFromXml(xml) : null;
    if (normalizado && (tieneEnergiaFinal(normalizado) || !tieneEnergiaFinal(deXml))) return normalizado;
    return deXml ? { ...deXml, ...(normalizado?.origen ? { origen: normalizado.origen } : {}) } : normalizado;
  };
  const inicial = elegir(inputs.cee_previo, inputs.xmlDemandData);
  const final = elegir(inputs.cee_final, inputs.xmlDemandDataFinal);
  const propio = inputs.cee_inicial_origen
    ? inputs.cee_inicial_origen === CEE_ORIGEN_BROKERGY
    : (inputs.cee_previo ? ceeEsPropio(inputs.cee_previo) : !!inputs.xmlDemandData);
  return { inicial, final, propio };
}

/**
 * Un CEE que ha hecho BROKERGY (la skill `generar-cee-inicial`) y se carga en la
 * simulación lleva `origen: 'brokergy'`. REGLA — con él NO hay comparativa «con tu
 * CEE / CEE nuevo BROKERGY» (Fran, 22/10/2026, 26RES060_OP321): esa comparativa es
 * para el CEE que APORTA el cliente; con el nuestro las dos cifras serían la misma
 * cosa contada dos veces y la propuesta le diría al cliente «con tu CEE…».
 */
export const CEE_ORIGEN_BROKERGY = 'brokergy';
export function ceeEsPropio(cee) {
  return cee?.origen === CEE_ORIGEN_BROKERGY;
}

/**
 * La COMPARATIVA «con tu CEE / CEE nuevo BROKERGY» (RES060): el CEE que aporta el
 * cliente se guarda como `cee_previo` con su demanda y su superficie, y la simulación
 * SIGUE EN MODO ESTIMADO. `computeCeeComparison` saca el «con tu CEE» de este objeto y
 * el «CEE nuevo» del cálculo estimado: si la simulación pasara a usar la demanda del
 * certificado (`seedInputsFromCees`, `demandMode: 'manual'`), las dos cifras saldrían
 * iguales y la propuesta no enseñaría la comparativa.
 *
 * No pone `xmlDemandData`, a propósito: con él el expediente nacería con este CEE
 * como inicial, y en la comparativa qué certificado vale lo decide el cliente al
 * aceptar. Ni el PDF (regla 21: el fichero va a Drive).
 *
 * @param {object} cee  CEE normalizado (ceeExtract)
 * @returns {object} PARCHE de inputs — no toca `demandMode`
 */
export function ceeParaComparativa(cee) {
  if (!cee) return {};
  const { pdfBase64, _files, ...limpio } = cee;
  const dem = Number(cee.demandas?.calefaccion_kwh_m2_ano);
  const sup = Number(cee.superficie_habitable_m2);
  return {
    cee_previo: limpio,
    ...(isFinite(dem) && dem > 0 ? { manualDemand: dem } : {}),
    ...(isFinite(sup) && sup > 0 ? { manualSuperficie: sup } : {}),
  };
}

/** Demanda y superficie que aplicará el cálculo, para poder enseñarlas antes de seguir. */
export { demandaDeCalculo, demandaCal, ceeSuperficie };

