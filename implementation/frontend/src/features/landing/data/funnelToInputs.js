/**
 * Convierte el `funnelData` (respuestas del cliente sin experiencia) en
 * `calculatorInputs` (el formato exacto que entiende CalculatorView).
 *
 * IMPORTANTE: replicamos los defaults completos de INITIAL_INPUTS de
 * CalculatorView + los ajustes por año/tipo. Si nos saltamos esto, los
 * inputs llegan incompletos a calculateDemand y la demanda sale NaN/0.
 */

import { mapBoiler, mapAcsType, shouldWarnBiomasa } from './boilerMapping';
import { mapEmisor } from './emisoresMapping';
import { getUByYear, getVentanaYACHByYear } from '../../calculator/logic/calculation';

/**
 * Inferencia automática del estado de aislamiento por año
 *   < 1980 → sin aislamiento (pre NBE-CT-79)
 *   1980-2006 → antigua mal aislada
 *   2007-2013 → antigua aislamiento medio (CTE 2006)
 *   2014+ → bien aislada (CTE-DB-HE 2013+)
 */
function inferInsulationStateByYear(anio) {
    const y = Number(anio) || 0;
    if (y === 0 || y < 1980) return 'sin_aislamiento';
    if (y < 2007) return 'antigua_mal_aislamiento';
    if (y < 2014) return 'antigua_aislamiento_medio';
    return 'bien_aislada';
}

// Defaults base — equivalentes a INITIAL_INPUTS de CalculatorView, para que
// calculateDemand no reciba undefined en ningún campo crítico.
const BASE_DEFAULTS = {
    zona: 'D3',
    anio: 2000,
    superficie: 120,
    superficieCalefactable: 120,
    plantas: 2,
    altura: 2.7,
    ventanaU: 3.0,
    ach: 0.83,
    tipo: 'unifamiliar',
    subtipo: 'intermedio',
    gla: 22,
    fachadas: 4,
    patios: 0,
    orientacion: 'media',
    sueloTipo: 'terreno',
    uMuro: 1.70,
    uCubierta: 2.50,
    boilerEff: 0.92,
    scopHeating: 3.2,
    changeAcs: false,
    scopAcs: 3.0,
    dacs: 2731.4,
    caePriceClient: 95,
    caePriceSO: 160,
    caePricePrescriptor: 0,
    presupuesto: 12000,
    fuelType: 'gas_natural',
    savingsMode: 'theoretical',
    gastoAnualReal: 0,
    participation: 100,
    prescriptorMode: 'brokergy',
    emitterType: 'radiadores_convencionales',
    includeAnnualSavings: true,
    hibridacion: false,
    potenciaBomba: 12,
    discountCertificates: false,
    includeLegalization: false,
    installerNoCard: false,
    legalizationPrice: 200,
    numOwners: 1,
    titularType: 'particular',
    includeIrpf: true,
    aplicarIrpfCae: true,
    demandMode: 'estimated',
    xmlDemandData: null,
    isReforma: false,
    reformaType: 'none',
    presupuestoEnvolvente: 0,
    reformaVentanas: false,
    reformaCubierta: false,
    reformaSuelo: false,
    reformaParedes: false,
    insulationState: 'sin_aislamiento',
    boilerHeatingType: 'No tiene Calefacción',
    boilerAcsType: 'Butano'
};

function funnelToCalculatorInputs(funnel, catastro, options = {}) {
    const { mode = 'public' } = options;
    const isInternal = mode === 'internal';
    const boilerMap = mapBoiler(funnel);
    const emisor = mapEmisor(funnel.emisor_tipo);

    // 1. Punto de partida: defaults base
    const inputs = { ...BASE_DEFAULTS };

    // 2. Datos del catastro
    inputs.rc = catastro?.ref_catastral || catastro?.rc;
    inputs.anio = Number(catastro?.yearBuilt || catastro?.anio || BASE_DEFAULTS.anio);
    // Superficie: priorizar la superficie VIVIENDA (uso residencial) y NO la
    // suma total de catastro, que incluye aparcamiento, trastero y otros usos.
    // Mismo criterio que PropertySheet.jsx — coherencia entre flujo público
    // y flujo admin.
    const superficieVivienda = catastro?.summaryByType?.['VIVIENDA']
        || catastro?.summaryByType?.VIVIENDA
        || 0;
    inputs.superficie = Number(
        catastro?.superficie
        || superficieVivienda
        || catastro?.totalSurface
        || BASE_DEFAULTS.superficie
    );
    inputs.superficieCalefactable = Number(catastro?.superficieCalefactable || catastro?.superficie || inputs.superficie);
    inputs.plantas = Number(catastro?.plantas || catastro?.floors?.total || BASE_DEFAULTS.plantas);
    inputs.zona = catastro?.zona || catastro?.climateInfo?.climateZone || BASE_DEFAULTS.zona;
    // Código INE de provincia — el panel admin lee CCAA desde aquí
    inputs.provincia = String(catastro?.provinceCode || '').padStart(2, '0').slice(0, 2);
    inputs.direccion = catastro?.address || '';
    inputs.municipio = catastro?.municipality || catastro?.municipio || '';
    const part = catastro?.participation
        ? parseFloat(String(catastro.participation).replace('%', '').replace(',', '.'))
        : 100;
    inputs.participation = isNaN(part) ? 100 : part;
    inputs.tipo = catastro?.tipo || (inputs.participation < 100 ? 'piso' : 'unifamiliar');

    // 3. Ajustes por tipo de vivienda (igual que CalculatorView)
    if (inputs.tipo === 'unifamiliar') {
        inputs.fachadas = 4;
        inputs.sueloTipo = 'terreno';
        inputs.gla = 12;
    } else if (inputs.tipo === 'hilera') {
        inputs.fachadas = 2;
        inputs.sueloTipo = 'terreno';
        inputs.gla = 15;
    } else if (inputs.tipo === 'piso') {
        inputs.fachadas = 1;
        inputs.sueloTipo = 'vivienda';
        inputs.gla = 15;
    }

    // 4. Ajustes por año (transmitancias y ventilación)
    if (inputs.anio) {
        const yearU = getUByYear(inputs.anio);
        if (yearU) {
            inputs.uMuro = yearU.wall;
            inputs.uCubierta = yearU.roof;
        }
        const yearVA = getVentanaYACHByYear(inputs.anio);
        if (yearVA) {
            inputs.ventanaU = yearVA.ventanaU;
            inputs.ach = yearVA.ach;
        }
    }

    // 5. Aislamiento inferido por año (solo aplica en cálculo RES080)
    inputs.insulationState = inferInsulationStateByYear(inputs.anio);

    // 6. Caldera — DOS esquemas a la vez
    //    RES060 (aerotermia)
    inputs.boilerId = boilerMap.boilerId;
    inputs.boilerEff = boilerMap.boilerEff;
    inputs.fuelType = boilerMap.fuelType;
    //    RES080 (reforma estimada)
    const heatingLabel = funnel.combustible_actual
        ? boilerMap.boilerHeatingTypeLabel
        : 'No tiene Calefacción';
    inputs.boilerHeatingType = heatingLabel;
    inputs.boilerAcsType = mapAcsType(funnel.boiler_acs_type, heatingLabel);

    // 7. Emisores → SCOP
    inputs.emitterType = emisor.emitterType;
    inputs.scopHeating = emisor.scopHeating;

    // 8. ACS
    inputs.changeAcs = !!funnel.incluir_acs;

    // 9. Reforma
    inputs.isReforma = !!funnel.isReforma;
    inputs.reformaType = funnel.isReforma ? 'estimated' : 'none';
    inputs.reformaVentanas = !!funnel.reforma_elementos?.ventanas;
    inputs.reformaCubierta = !!funnel.reforma_elementos?.cubierta;
    inputs.reformaSuelo = !!funnel.reforma_elementos?.suelo;
    inputs.reformaParedes = !!funnel.reforma_elementos?.paredes;

    // 10. Gasto y modo de ahorro
    const gasto = Number(funnel.gasto_anual_eur) || 0;
    inputs.savingsMode = gasto > 0 ? 'real' : 'theoretical';
    inputs.gastoAnualReal = gasto;

    // 11. Presupuesto
    inputs.presupuesto = funnel.presupuesto_modo === 'tengo' && funnel.presupuesto_eur > 0
        ? Number(funnel.presupuesto_eur)
        : 15000;

    // 12. Titular y número de propietarios (afecta cap IRPF)
    inputs.titularType = funnel.titular_type || 'particular';
    inputs.includeIrpf = funnel.titular_type !== 'empresa';
    inputs.numOwners = Math.max(1, Number(funnel.num_propietarios) || 1);

    // 13. Defaults de toggles que difieren entre flujos:
    //   - public: ambos activos (el cliente quiere ver impacto fiscal y ahorro €/año)
    //   - internal: ambos DESACTIVADOS (el partner/admin los activa manualmente en
    //     la calculadora si los necesita; por defecto la propuesta es más limpia)
    if (isInternal) {
        inputs.aplicarIrpfCae = false;
        inputs.includeAnnualSavings = false;
    } else {
        inputs.aplicarIrpfCae = true;
        inputs.includeAnnualSavings = true;
    }

    return inputs;
}

export { funnelToCalculatorInputs, shouldWarnBiomasa, inferInsulationStateByYear };
