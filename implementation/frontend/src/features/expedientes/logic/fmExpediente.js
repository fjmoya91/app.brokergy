// ============================================================================
// fmExpediente.js — La cifra de la vía del FACTOR MULTIPLICADOR de un expediente
// RES060 / RES093 (RES060_FM o la RES09x_FM de su zona), con las variables REALES
// del expediente. Es la MISMA cuenta que hace la pestaña Económico
// (ExpedienteDetailView → calcResults, rama RES060/RES093), sacada a una función
// pura para que el backend (cifoService, al generar el CIFO) dé la misma cifra
// que el Económico y el Convenio FM. Una sola fórmula: `calculateRes060FM`.
//
// ⚠️ Si se cambia la rama FM de calcResults hay que cambiar esto igual (o, mejor,
// que la vista llame aquí). `check_cifo_paginas.mjs` lo ejercita con los casos FM.
//
// Detalle: docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md
// ============================================================================

import { BOILER_EFFICIENCIES, calculateHybridization, resolveHybridInputs } from '../../calculator/logic/calculation.js';
import { entradasFmClima } from '../../calculator/logic/climaFm.js';
import { calculateRes060FM, contextoCalderaFc, tramiteFc, esEmisorAireAire } from '../../calculator/logic/res060fc.js';
import { calcCifo } from './calcCifo.js';
import { acsComputaAhorro } from './aerotermiaUnits.js';
import { ceeBaseDocumento } from './ceeFases.js';

// Temperatura de impulsión del emisor: la misma tabla que `getEmitterTemp` de
// cifoDoc.js. Copiada (cuatro líneas) para no crear un ciclo cifoDoc ↔ este módulo.
const tempEmisor = (val) => (val === 'suelo_radiante' ? 35 : val === 'radiadores_baja_temp' ? 45 : val === 'radiadores_convencionales' ? 55 : 35);

/**
 * Ficha del expediente por su número, como calcResults: RES093 si hibrida, RES060
 * si no; null para el resto (RES080 tiene su propio cálculo FM, `calculateRes080FM`).
 */
function fichaDeNumero(expediente) {
    const n = String(expediente?.numero_expediente || '');
    if (n.includes('RES080') || n.includes('TER173') || n.includes('TER100')) return null;
    if (n.includes('RES093')) return 'RES093';
    const f = expediente?.oportunidades?.ficha || 'RES060';
    return f === 'RES060' || f === 'RES093' ? f : null;
}

/**
 * El resultado de `calculateRes060FM` para el expediente, o null si no se puede
 * calcular (no es RES060/RES093, o no hay superficie ni demanda).
 *
 * @param {object} p
 * @param {object} p.expediente  el expediente con `oportunidades` (datos_calculo)
 * @param {object} [p.cee]       el CEE vivo (por defecto, `expediente.cee`)
 * @param {object} [p.inst]      la instalación viva (por defecto, `expediente.instalacion`)
 * @param {object} [p.doc]       la documentación viva (por defecto, `expediente.documentacion`)
 * @param {object|null} [p.modeloFm]  modelo del CATÁLOGO de la bomba (para el SCOP cálido)
 * @param {string} [p.hoy]       fecha de referencia de los plazos (pruebas)
 */
export function calcularFmExpediente({ expediente, cee: ceeIn, inst: instIn, doc: docIn, modeloFm = null, hoy } = {}) {
    if (!expediente || !expediente.oportunidades) return null;
    const ficha = fichaDeNumero(expediente);
    if (!ficha) return null;
    const op = expediente.oportunidades;
    const cee = ceeIn || expediente.cee || {};
    const inst = instIn || expediente.instalacion || {};
    const doc = docIn || expediente.documentacion || {};
    const opInputs = op.datos_calculo?.inputs || {};

    const { base: ceeBase } = ceeBaseDocumento(cee);
    const superficie = parseFloat(ceeBase.superficieHabitable) || parseFloat(op.datos_calculo?.surface) || 0;
    const q_net_heating = (parseFloat(ceeBase.demandaCalefaccion) || 0) * superficie || parseFloat(op.datos_calculo?.Q_net) || 0;
    if (!(superficie > 0 && q_net_heating > 0)) return null;

    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
    const boilerEffValue = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId)?.value || 0.65;
    const scopHeating = parseFloat(inst.aerotermia_cal?.scop) || 3.2;
    const scopAcs = inst.misma_aerotermia_acs ? scopHeating : (parseFloat(inst.aerotermia_acs?.scop) || 2.5);

    let hybridRes = null;
    const calcInputs = op.datos_calculo?.inputs || {};
    const hibridActive = (inst.hibridacion ?? calcInputs.hibridacion) ?? (ficha === 'RES093');
    if (hibridActive) {
        hybridRes = calculateHybridization({
            demandAnnual: q_net_heating,
            zone: op.datos_calculo?.zona || 'D3',
            ...resolveHybridInputs(inst, calcInputs, op.datos_calculo?.zona),
        });
    }
    const changeAcsFlag = acsComputaAhorro(inst);

    const tipoFC = opInputs.tipo || (opInputs.housing_type === 'flat' ? 'piso' : 'unifamiliar');
    const fechasObra = calcCifo(doc || {});
    // Consumidor VULNERABLE (fichas -S, × 1,5): `documentacion.via_fm.vulnerable`.
    const datosFmVia = doc?.via_fm || {};
    const zonaFm = op.datos_calculo?.zona || opInputs.zona || cee.cee_inicial?.zonaClimatica;
    const fmClima = entradasFmClima({
        src: { ...inst, hibridacion: hibridActive },
        zona: zonaFm,
        scopHeating,
        hibridacion: hybridRes ? { coverage: hybridRes.coverage, refPower: hybridRes.refPower, cb: hybridRes.cb } : null,
        hybridInputs: resolveHybridInputs(inst, calcInputs, op.datos_calculo?.zona),
        demandAnnual: q_net_heating,
        modelo: modeloFm && String(modeloFm.id) === String(inst.aerotermia_cal?.aerotermia_db_id) ? modeloFm : null,
        temp: tempEmisor(inst.tipo_emisor),
        metodoCal: inst.aerotermia_cal?.metodo_scop || 'ficha',
    });
    return calculateRes060FM({
        provinciaCode: opInputs.provincia || opInputs.provinceCode,
        anio: opInputs.anio || op.datos_calculo?.anio,
        tipo: tipoFC,
        bloque: String(opInputs.tipoInmueble || '').toLowerCase() === 'bloque',
        zona: zonaFm,
        superficie,
        boilerEff: boilerEffValue,
        boilerId: boilerEffId,
        scopHeating: fmClima.scopHeating,
        scopAcs,
        changeAcs: changeAcsFlag,
        changeHeating: inst.cambio_calefaccion !== false,
        qCalefaccion: q_net_heating,
        ceeFinal: cee.cee_final,
        ceeInicial: cee.cee_inicial,
        hibridacion: fmClima.hibridacion,
        vulnerable: datosFmVia.vulnerable === true,
        contexto: {
            ...contextoCalderaFc(opInputs, boilerEffId),
            climaFm: fmClima.clima,
            ceeFinal: cee.cee_final,
            inicioObra: fechasObra.inicio,
            finObra: fechasObra.fin,
            tramite: tramiteFc(expediente.estado, expediente.lote_id),
            aireAire: esEmisorAireAire(inst.tipo_emisor),
            ...(hoy ? { hoy } : {}),
        },
    });
}
