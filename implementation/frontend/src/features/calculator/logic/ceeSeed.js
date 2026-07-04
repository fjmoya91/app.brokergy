// ceeSeed — Traduce los datos de un CEE anterior (OCR/XML, objeto `cee_previo`) a los
// campos del modo "CEE aportado" (por emisiones) de la calculadora, para que su tabla
// aparezca rellena con la columna INICIAL real del CEE + un FINAL estimado (demanda/SCOP).
//
// Se usa en dos sitios:
//   - ReformaSubFlow.doSubmitInternal → siembra al crear la oportunidad (nuevas).
//   - CalculatorView → siembra al cargar una oportunidad que tenga cee_previo pero sin
//     los campos manualEmisiones* (oportunidades creadas antes de esta funcionalidad).

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
  const combRefIni = mapCeeCombustible(sv.refrigeracion?.combustible);
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
