// ceeComparison — Calcula los DOS escenarios de ayuda cuando el cliente aporta un CEE
// inicial, para la comparativa cara al cliente:
//   - conCee   → ayuda usando el CEE aportado (emisiones reales del certificado)
//   - ceeNuevo → ayuda si BROKERGY emite un CEE inicial nuevo (nuestro método estimado)
//
// "CEE nuevo" usa el motor completo (computeFullCalculatorResult, que internamente estima
// con calculateRes080Estimated). "Con tu CEE" usa calculateRes080FromEmissions con las
// emisiones reales (ya sembradas en los inputs) + los MISMOS parámetros financieros, para
// que el CAE sea comparable 1:1. La deducción IRPF es la misma en ambos (misma inversión).
//
// v1: solo REFORMA (RES080). Para no-reforma (RES060) devuelve null (pendiente).

import { calculateRes080FromEmissions, calculateFinancials, calculateSavings } from './calculation';
import { computeFullCalculatorResult } from '../../landing/data/landingCalculation';

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

// Parámetros financieros compartidos (replican los de computeFullCalculatorResult).
function financialParams(inputs, savingsKwh, presupuesto) {
  return {
    presupuesto,
    savingsKwh,
    caePriceClient: inputs.caePriceClient || 95,
    caePriceSO: inputs.caePriceSO || 160,
    caePricePrescriptor: inputs.includeCommission ? (inputs.caePricePrescriptor || 0) : 0,
    prescriptorMode: inputs.prescriptorMode || 'brokergy',
    tipo: inputs.tipo,
    participation: inputs.participation,
    numOwners: inputs.numOwners || 1,
    titularType: inputs.titularType || 'particular',
    includeIrpf: inputs.includeIrpf !== false,
    aplicarIrpfCae: inputs.aplicarIrpfCae !== false,
  };
}

/**
 * @param {object} inputs  inputs de la calculadora (con inputs.cee_previo + campos manualEmisiones* sembrados)
 * @returns {null | { isReforma, irpf, conCee:{cae,ahorroKwh,total}, ceeNuevo:{cae,ahorroKwh,total} }}
 */
export function computeCeeComparison(inputs) {
  if (!inputs || !inputs.cee_previo) return null;
  const cee = inputs.cee_previo;
  const isReforma = !!inputs.isReforma;

  let estRes;
  try { estRes = computeFullCalculatorResult(inputs); } catch { return null; }

  // ── Caso NO reforma (RES060): ayuda por ahorro de demanda ───────────────────
  if (!isReforma) {
    const estFin = estRes?.financials;
    if (!estFin) return null;
    const estCae = num(estFin.caeBonus);
    const irpf = num(estFin.irpfDeduction);
    const estAhorro = num(estRes?.savings?.savingsKwh);

    // "Con tu CEE": SOLO cambia la demanda de calefacción (la REAL del CEE); el resto de
    // parámetros (rendimiento del generador, SCOP, presupuesto…) son los MISMOS que usa la
    // pantalla, para que el importe coincida exactamente con el "Bono CAE" mostrado y con el
    // mensaje al cliente. (Usar el rendimiento del CEE en vez del de la calculadora daba una
    // cifra distinta y confundía.)
    const sup = num(inputs.superficie || inputs.superficieCalefactable || cee.superficie_habitable_m2);
    const qNetCee = num(cee.demandas?.calefaccion_kwh_m2_ano) * sup;
    const boilerEffCee = num(inputs.boilerEff) || 0.85;
    let ceeCae = estCae; let ceeAhorro = null;
    if (qNetCee > 0) {
      const savCee = calculateSavings({
        q_net_heating: qNetCee,
        dacs: 2731.4,
        boilerEff: boilerEffCee,
        scopHeating: inputs.scopHeating,
        scopAcs: inputs.scopAcs,
        changeAcs: inputs.changeAcs,
        cb: 1.0,
      });
      ceeAhorro = num(savCee?.savingsKwh);
      try {
        const finCee = calculateFinancials(financialParams(inputs, ceeAhorro, num(inputs.presupuesto)));
        ceeCae = num(finCee.caeBonus);
      } catch { /* fallback */ }
    }
    return {
      isReforma: false,
      irpf,
      conCee: { cae: ceeCae, ahorroKwh: ceeAhorro, total: ceeCae + irpf },
      ceeNuevo: { cae: estCae, ahorroKwh: estAhorro, total: estCae + irpf },
    };
  }

  // ── Caso REFORMA (RES080): ayuda por ahorro de la reforma ───────────────────
  const estFin = estRes?.financialsRes080;
  if (!estFin) return null;
  const estCae = num(estFin.caeBonus);
  const irpf = num(estFin.irpfDeduction);
  const estAhorro = num(estRes?.res080?.ahorroEnergiaFinalTotal);

  // "Con tu CEE": ahorro por emisiones reales
  const ceeRes = calculateRes080FromEmissions({
    emiCalIni: num(inputs.manualEmisionesCalefaccionInicial || cee.emisiones?.calefaccion),
    emiCalFin: num(inputs.manualEmisionesCalefaccionFinal),
    emiAcsIni: num(inputs.manualEmisionesAcsInicial || cee.emisiones?.acs),
    emiAcsFin: num(inputs.manualEmisionesAcsFinal),
    emiRefIni: num(inputs.manualEmisionesRefrigeracionInicial || cee.emisiones?.refrigeracion),
    emiRefFin: num(inputs.manualEmisionesRefrigeracionFinal),
    combCalefaccionInicial: inputs.combustibleCalefaccionInicial,
    combCalefaccionFinal: inputs.combustibleCalefaccionFinal,
    combAcsInicial: inputs.combustibleAcsInicial,
    combAcsFinal: inputs.combustibleAcsFinal,
    combRefrigeracionInicial: inputs.combustibleRefrigeracionInicial,
    combRefrigeracionFinal: inputs.combustibleRefrigeracionFinal,
    superficie: num(inputs.manualSupInicial || cee.superficie_habitable_m2),
    superficieInicial: num(inputs.manualSupInicial || cee.superficie_habitable_m2),
    superficieFinal: num(inputs.manualSupFinal || cee.superficie_habitable_m2),
  });
  const ceeAhorro = num(ceeRes?.ahorroEnergiaFinalTotal);
  const presupuestoReforma = num(inputs.presupuesto) + num(inputs.presupuestoEnvolvente);
  let ceeCae = estCae;
  try {
    const ceeFin = calculateFinancials(financialParams(inputs, ceeAhorro, presupuestoReforma));
    ceeCae = num(ceeFin.caeBonus);
  } catch { /* mantiene fallback */ }

  return {
    isReforma,
    irpf,
    conCee: { cae: ceeCae, ahorroKwh: ceeAhorro, total: ceeCae + irpf },
    ceeNuevo: { cae: estCae, ahorroKwh: estAhorro, total: estCae + irpf },
  };
}
