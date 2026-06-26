// ============================================================
// expedienteFinancials.js — Cálculo económico por expediente
//
// FUENTE ÚNICA DE VERDAD del dinero de un expediente. Extraído de
// ExpedientesView para poder reusarlo también en el resumen de un LOTE.
// Devuelve { ficha, savingsKwh, cae, profit, savingsKwhVerificado, caeVerificado, profitVerificado }:
//   · savingsKwh = ahorro de energía ESTIMADO (kWh, del CEE)
//   · cae        = CAE del cliente estimado (lo que se le paga)  → caeBonus
//   · profit     = beneficio de Brokergy estimado               → profitBrokergy
//   · *Verificado = los mismos importes pero sobre el ahorro VERIFICADO (manual, kWh).
//                   null si el expediente aún no tiene verificado.
// ============================================================
import {
    calculateSavings,
    calculateFinancials,
    calculateRes080,
    calculateHybridization,
    BOILER_EFFICIENCIES,
} from '../../calculator/logic/calculation';

export function computeExpedienteFinancials(exp) {
    const op = exp.oportunidades;
    if (!op) return { ficha: '—', savingsKwh: null, cae: null, profit: null };

    let ficha = op.ficha || 'RES060';
    if (exp.numero_expediente?.includes('RES080')) ficha = 'RES080';
    else if (exp.numero_expediente?.includes('RES093')) ficha = 'RES093';

    const cee = exp.cee || {};
    const inst = exp.instalacion || {};
    const opInputs = op.datos_calculo?.inputs || {};

    let cae = null;
    let profit = null;
    let savingsKwh = null;
    // Economía VERIFICADA (ahorro manual del verificador, en kWh) — en paralelo al estimado.
    let savingsKwhVerificado = null;
    let caeVerificado = null;
    let profitVerificado = null;

    if (ficha === 'RES060' || ficha === 'RES093') {
        // Priorizar CEE inicial (la demanda debe ser la misma en inicial y final para RES060/RES093)
        const ceeBase = cee.cee_inicial || cee.cee_final || {};
        // Determinar si tenemos datos REALES del expediente (no solo de la oportunidad)
        const hasExpData = !!ceeBase.superficieHabitable || !!ceeBase.demandaCalefaccion;

        if (hasExpData) {
            const superficie = parseFloat(ceeBase.superficieHabitable) || 0;
            const q_net_heating = (parseFloat(ceeBase.demandaCalefaccion) || 0) * superficie;

            let dacs = 0;
            if (cee.acs_method === 'cte') {
                const numPeople = (parseInt(cee.num_rooms) || 4) + 1;
                dacs = 28 * numPeople * 0.001162 * 365 * 46;
            } else {
                dacs = (parseFloat(ceeBase.demandaACS) || 0) * superficie;
            }

            if (superficie > 0 && q_net_heating > 0) {
                const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
                const boilerEffValue = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId)?.value || 0.65;
                const scopHeating = parseFloat(inst.aerotermia_cal?.scop) || 3.2;
                const scopAcs = inst.misma_aerotermia_acs ? scopHeating : (parseFloat(inst.aerotermia_acs?.scop) || 2.5);

                let cb = 1;
                if (ficha === 'RES093' || inst.hibridacion || opInputs.hibridacion) {
                    const hybridRes = calculateHybridization({
                        demandAnnual: q_net_heating,
                        zone: op.datos_calculo?.zona || 'D3',
                        heatPumpPower: parseFloat(inst.potencia_bomba || opInputs.potenciaBomba) || 0
                    });
                    cb = hybridRes.cb;
                }

                const sv = calculateSavings({
                    q_net_heating,
                    dacs: inst.cambio_acs !== false ? dacs : 0,
                    boilerEff: boilerEffValue,
                    scopHeating,
                    scopAcs,
                    cb,
                    changeAcs: inst.cambio_acs !== false && (!!inst.misma_aerotermia_acs || !!inst.aerotermia_acs?.aerotermia_db_id)
                });

                // Sincronizar parámetros financieros con ExpedienteDetailView
                const overrides = inst.economico_override || {};
                const includeCommission = overrides.include_commission ?? !!opInputs.include_commission;

                const finArgs = {
                    presupuesto: overrides.presupuesto ?? (parseFloat(inst.presupuesto_final) || parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0),
                    caePriceClient: overrides.cae_client_rate ?? (parseFloat(opInputs.cae_client_rate) || 95),
                    caePriceSO: overrides.cae_so_rate ?? (parseFloat(opInputs.cae_so_rate) || 160),
                    caePricePrescriptor: includeCommission ? (parseFloat(overrides.cae_prescriptor_rate ?? opInputs.cae_prescriptor_rate) || 0) : 0,
                    prescriptorMode: overrides.cae_prescriptor_mode ?? opInputs.cae_prescriptor_mode ?? 'brokergy',
                    discountCertificates: overrides.discount_certificates ?? !!opInputs.discount_certificates,
                    certificatesCost: overrides.certificates_cost ?? opInputs.certificates_cost ?? 250,
                    includeLegalization: overrides.include_legalization ?? !!opInputs.include_legalization,
                    legalizationMode: overrides.legalization_mode ?? opInputs.legalization_mode ?? 'client',
                    includeIrpf: true
                };

                const fin = calculateFinancials({ ...finArgs, savingsKwh: sv.savingsKwh });
                cae = fin.caeBonus;
                profit = fin.profitBrokergy;
                savingsKwh = sv.savingsKwh;

                // Ahorro VERIFICADO (manual, kWh) → economía verificada con los mismos parámetros.
                const vRaw = inst.verificacion?.ahorro_verificado_kwh;
                if (vRaw !== null && vRaw !== undefined && vRaw !== '') {
                    savingsKwhVerificado = parseFloat(vRaw) || 0;
                    const finV = calculateFinancials({ ...finArgs, savingsKwh: savingsKwhVerificado });
                    caeVerificado = finV.caeBonus;
                    profitVerificado = finV.profitBrokergy;
                }
            }
        }
    } else if (ficha === 'RES080') {
        if (cee.cee_inicial && cee.cee_final) {
            const res080 = calculateRes080({
                xmlInicial: cee.cee_inicial,
                xmlFinal: cee.cee_final,
                combAcsInicial: cee.comb_acs_inicial,
                combAcsFinal: cee.comb_acs_final,
                combCalefaccionInicial: cee.comb_cal_inicial,
                combCalefaccionFinal: cee.comb_cal_final,
                combRefrigeracionInicial: cee.comb_ref_inicial,
                combRefrigeracionFinal: cee.comb_ref_final,
                superficieCustom: cee.superficie_custom
            });

            if (res080) {
                const overrides = inst.economico_override || {};
                const finArgs = {
                    presupuesto: overrides.presupuesto ?? (parseFloat(inst.presupuesto_final) || parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0),
                    caePriceClient: overrides.cae_client_rate ?? 60,
                    caePriceSO: overrides.cae_so_rate ?? 140,
                    includeIrpf: true
                };
                const fin = calculateFinancials({ ...finArgs, savingsKwh: res080.ahorroEnergiaFinalTotal });
                cae = fin.caeBonus;
                profit = fin.profitBrokergy;
                savingsKwh = res080.ahorroEnergiaFinalTotal;

                const vRaw = inst.verificacion?.ahorro_verificado_kwh;
                if (vRaw !== null && vRaw !== undefined && vRaw !== '') {
                    savingsKwhVerificado = parseFloat(vRaw) || 0;
                    const finV = calculateFinancials({ ...finArgs, savingsKwh: savingsKwhVerificado });
                    caeVerificado = finV.caeBonus;
                    profitVerificado = finV.profitBrokergy;
                }
            }
        }
    }

    return { ficha, savingsKwh, cae, profit, savingsKwhVerificado, caeVerificado, profitVerificado };
}
