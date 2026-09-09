// ============================================================================
// terciario.js — FUENTE ÚNICA de las variables de las fichas del SECTOR TERCIARIO.
// ----------------------------------------------------------------------------
// Dos fichas, el mismo edificio y el mismo desglose: hoteles, restaurantes,
// residencias, gimnasios, centros educativos, oficinas… con el ahorro partido en
// TRES servicios, cada uno con su propio SCOP:
//
//   AE_C   calefacción              (1/η_i − 1/SCOP)     · D_C · S · F_P
//   AE_ACS agua caliente sanitaria  (1/η_i − 1/SCOP_dhw) · D_ACS    · F_P
//   AE_CAP calentamiento de piscina (1/η_i − 1/SCOP_pwh) · D_CAP    · F_P
//
//   · TER100 — SUSTITUCIÓN de la caldera. AE_TOTAL = AE_C + AE_ACS + AE_CAP.
//   · TER173 — HIBRIDACIÓN en modo paralelo, zona climática D1/D2/D3. La caldera
//     NO se retira: sigue aportando, así que el ahorro se pondera con el
//     coeficiente de cobertura por bivalencia C_b (Anexo IV de la ficha):
//         AE_TOTAL = (AE_C + AE_ACS + AE_CAP) · C_b
//
// La actuación puede alcanzar SOLO calefacción, SOLO ACS o AMBAS, y opcionalmente
// la piscina (caso raro: nace desactivada). El alcance vive en `instalacion`:
//   · cambio_calefaccion  → AE_C
//   · cambio_acs          → AE_ACS
//   · piscina.activa      → AE_CAP  (+ piscina.demanda_kwh y piscina.scop)
//
// Este módulo NO renderiza nada: solo mapea (expediente) → variables, para que
// el panel económico, el CIFO, las fichas oficiales y los dos servicios del
// backend partan de los MISMOS números. Módulo ESM PURO (sin React ni Node): el
// backend lo importa por import() dinámico igual que cifoDoc.js.
//
// Antes se llamaba `ter100.js`. Se renombró al entrar la TER173: un fichero que
// resuelve dos fichas no puede llamarse como una de ellas, o la siguiente acaba
// escribiéndose fuera con su propia copia de la derivación.
// ============================================================================
import {
    BOILER_EFFICIENCIES,
    calculateTerciario,
    calculateHybridization,
    resolveHybridInputs,
    CAE_PRECIO_CLIENTE_NUEVAS,
} from '../../calculator/logic/calculation.js';
import { resolveDacs } from './demandaAcs.js';
import { esTermoElectrico } from './aerotermiaUnits.js';
import { ceeBaseDocumento } from './ceeFases.js';

/** Vida útil (D_i) de las actuaciones del terciario, en años. Igual que RES060. */
export const TER100_VIDA_UTIL = 15;
export const TER173_VIDA_UTIL = 15;

/** Factor de ponderación F_P: las dos fichas lo fijan en 1. */
export const TER100_FP = 1;
export const TER173_FP = 1;

/**
 * Precios CAE por defecto (€/MWh). El del cliente arranca ya en el precio de las
 * propuestas NUEVAS —y no en el respaldo histórico— porque el terciario no tiene
 * ni un expediente anterior cuya economía haya que preservar: TER100 y TER173
 * nacen después del cambio de tarifa. El del Sujeto Obligado sí es propio.
 */
export const TERCIARIO_PRECIOS = { cliente: CAE_PRECIO_CLIENTE_NUEVAS, sujetoObligado: 160 };

export const TER100_CODIGO = 'TER100';
export const TER173_CODIGO = 'TER173';

export const TER100_NOMBRE_ACTUACION = 'Sustitución de caldera de combustión por una bomba de calor de accionamiento eléctrico (sector terciario)';
export const TER100_FICHA_COMPLETA = 'TER100: Sustitución de caldera de combustión existente por bomba de calor de accionamiento eléctrico';

export const TER173_NOMBRE_ACTUACION = 'Hibridación en modo paralelo de caldera de combustión con bomba de calor de accionamiento eléctrico (sector terciario)';
export const TER173_FICHA_COMPLETA = 'TER173: Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios no residenciales ubicados en la zona climática D1, D2 o D3';

/**
 * Ficha del terciario que le corresponde a un expediente, o null si no es del
 * terciario. Manda el número de expediente (es lo que ya está emitido y en
 * Drive); si aún no lo hay, la ficha declarada en la oportunidad.
 */
export function fichaTerciaria(expediente) {
    const exp = expediente || {};
    const num = String(exp.numero_expediente || '').toUpperCase();
    if (num) {
        if (num.includes(TER173_CODIGO)) return TER173_CODIGO;
        if (num.includes(TER100_CODIGO)) return TER100_CODIGO;
        return null;
    }
    const ficha = exp.oportunidades?.ficha || exp.ficha;
    return ficha === TER173_CODIGO || ficha === TER100_CODIGO ? ficha : null;
}

/** ¿Es un expediente del sector terciario (TER100 o TER173)? */
export function esTerciario(expediente) {
    return fichaTerciaria(expediente) !== null;
}

/** ¿Es un expediente TER100 (sustitución de caldera, terciario)? */
export function esTer100(expediente) {
    return fichaTerciaria(expediente) === TER100_CODIGO;
}

/** ¿Es un expediente TER173 (hibridación en paralelo, terciario, zona D)? */
export function esTer173(expediente) {
    return fichaTerciaria(expediente) === TER173_CODIGO;
}

/**
 * Alcance de la actuación. `cambio_calefaccion` es propio del terciario, así que
 * los expedientes anteriores no lo traen: ausente = SÍ (es el caso normal y el
 * único posible en RES060/RES093), nunca se interpreta como "no se toca la
 * calefacción".
 */
export function terciarioAlcance(instalacion = {}) {
    const acsAero = instalacion.misma_aerotermia_acs ? instalacion.aerotermia_cal : instalacion.aerotermia_acs;
    return {
        // Un termo eléctrico (efecto Joule, rendimiento 1) no es bomba de calor: el
        // ACS queda fuera de la fórmula igual que en RES060 (ver cifoDoc.js).
        calefaccion: instalacion.cambio_calefaccion !== false,
        acs: instalacion.cambio_acs !== false && !esTermoElectrico(acsAero) && !esTermoElectrico(instalacion.aerotermia_acs),
        piscina: instalacion.piscina?.activa === true,
    };
}

/**
 * Variables de la fórmula del terciario a partir del expediente. Vale para las
 * dos fichas: en TER100 el C_b es 1 y en TER173 sale de la tabla del Anexo IV.
 *
 * @param {Object} expediente - expediente con joins (`oportunidades`, `cee`, `instalacion`)
 * @returns objeto con las variables crudas y el resultado del cálculo (`savings`)
 */
export function deriveTerciarioVars(expediente) {
    const exp = expediente || {};
    const op = exp.oportunidades || {};
    const opDatos = op.datos_calculo || {};
    const opInputs = opDatos.inputs || {};
    const cee = exp.cee || {};
    const inst = exp.instalacion || {};

    const ficha = fichaTerciaria(exp) || TER100_CODIGO;
    const esHibrida = ficha === TER173_CODIGO;

    // CEE que manda: el final si ya trae demanda válida (es el definitivo y el que
    // usan los documentos), y si no el inicial. Fuente única en ceeFases.js.
    const { base: ceeBase } = ceeBaseDocumento(cee);

    const sRaw = parseFloat(ceeBase.superficieHabitable) || parseFloat(opDatos.surface) || 0;
    const dcalRaw = parseFloat(ceeBase.demandaCalefaccion) || 0;
    // D_C · S — la ficha da D_C en kWh/año·m², así que la demanda anual es el producto.
    const qNetHeating = (dcalRaw * sRaw) || parseFloat(opDatos.Q_net) || 0;

    const acs = resolveDacs(cee, ceeBase, { demandAcsFallback: opDatos.demand_acs });

    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
    const boilerEff = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId)?.value || 0.92;

    const scopCal = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopAcs = inst.misma_aerotermia_acs
        ? scopCal
        : (parseFloat(inst.aerotermia_acs?.scop) || 0);

    const piscina = inst.piscina || {};
    const dcap = parseFloat(piscina.demanda_kwh) || 0;
    const scopPool = parseFloat(piscina.scop) || 0;

    const alcance = terciarioAlcance(inst);

    // ── C_b · coeficiente de cobertura por bivalencia (solo TER173) ───────────
    // Misma tabla y mismos dos métodos que la RES093 (potencia de la bomba sobre
    // la carga de diseño, o sobre la potencia nominal de la caldera existente):
    // la fuente única es calculation.js, aquí solo se decide si aplica.
    let hybrid = null;
    let cb = 1;
    let cbIncompleto = false;
    if (esHibrida) {
        const hybridIn = resolveHybridInputs(inst, opInputs);
        hybrid = calculateHybridization({ demandAnnual: qNetHeating, ...hybridIn });
        cb = hybrid.cb;
        // Sin potencia de bomba o sin denominador, `calculateHybridization` devuelve
        // C_b = 1 para no penalizar. En TER173 eso NO es un caso neutro: significa
        // calcular una hibridación como si fuera una sustitución total, o sea
        // declarar como ahorro lo que sigue aportando la caldera. Se marca para que
        // el CIFO lo bloquee y el panel lo avise, en vez de salir por una cifra alta.
        cbIncompleto = !(hybrid.refPower > 0) || !(hybridIn.heatPumpPower > 0);
    }

    const savings = calculateTerciario({
        q_net_heating: qNetHeating,
        dacs: acs.value,
        dcap,
        boilerEff,
        scopHeating: scopCal,
        scopAcs,
        scopPool,
        changeHeating: alcance.calefaccion,
        changeAcs: alcance.acs,
        changePool: alcance.piscina,
        fp: TER100_FP,
        cb,
    });

    return {
        ficha, esHibrida, ceeBase,
        // Variables de la fórmula
        dcalRaw, sRaw, qNetHeating,
        dacsRaw: acs.value, acsMode: acs.mode, acsPorM2: acs.dacsPorM2, acsPersonas: acs.personas,
        dcap, scopPool,
        boilerEff, boilerEffId, scopCal, scopAcs,
        alcance,
        piscina,
        // Hibridación (TER173)
        cb, hybrid, cbIncompleto,
        // Resultado
        savings,
        savingsKwh: savings.savingsKwh,
        savingsSinCb: savings.savingsSinCb,
        vidaUtil: esHibrida ? TER173_VIDA_UTIL : TER100_VIDA_UTIL,
    };
}
