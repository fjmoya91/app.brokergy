// ============================================================================
// ter100.js — FUENTE ÚNICA de las variables de la ficha TER100 (terciario).
// ----------------------------------------------------------------------------
// TER100 es la hermana terciaria de RES060: la misma actuación (sustituir una
// caldera de combustión por una bomba de calor eléctrica) pero en un edificio
// del sector terciario — hoteles, restaurantes, residencias, gimnasios, centros
// educativos, oficinas… — y con el ahorro DESGLOSADO en tres servicios:
//
//   AE_C   calefacción              (1/η_i − 1/SCOP)     · D_C · S · F_P
//   AE_ACS agua caliente sanitaria  (1/η_i − 1/SCOP_dhw) · D_ACS    · F_P
//   AE_CAP calentamiento de piscina (1/η_i − 1/SCOP_pwh) · D_CAP    · F_P
//
// La actuación puede alcanzar SOLO calefacción, SOLO ACS o AMBAS, y opcionalmente
// la piscina (caso raro: nace desactivada). El alcance vive en `instalacion`:
//   · cambio_calefaccion  → AE_C
//   · cambio_acs          → AE_ACS
//   · piscina.activa      → AE_CAP  (+ piscina.demanda_kwh y piscina.scop)
//
// Este módulo NO renderiza nada: solo mapea (expediente) → variables, para que
// el panel económico, el CIFO, la Ficha TER100 y los dos servicios del backend
// partan de los MISMOS números. Módulo ESM PURO (sin React ni Node): el backend
// lo importa por import() dinámico igual que cifoDoc.js.
// ============================================================================
import { BOILER_EFFICIENCIES, calculateTer100 } from '../../calculator/logic/calculation.js';
import { resolveDacs } from './demandaAcs.js';
import { esTermoElectrico } from './aerotermiaUnits.js';
import { ceeBaseDocumento } from './ceeFases.js';

/** Vida útil (D_i) de la actuación TER100, en años. Igual que RES060. */
export const TER100_VIDA_UTIL = 15;

/** Factor de ponderación F_P: la ficha lo fija en 1. */
export const TER100_FP = 1;

/** Precios CAE por defecto (€/MWh). Los mismos que RES060. */
export const TER100_PRECIOS = { cliente: 95, sujetoObligado: 160 };

export const TER100_CODIGO = 'TER100';
export const TER100_NOMBRE_ACTUACION = 'Sustitución de caldera de combustión por una bomba de calor de accionamiento eléctrico (sector terciario)';
export const TER100_FICHA_COMPLETA = 'TER100: Sustitución de caldera de combustión existente por bomba de calor de accionamiento eléctrico';

/** ¿Es un expediente TER100? Manda el número de expediente; si no, la ficha de la oportunidad. */
export function esTer100(expediente) {
    const exp = expediente || {};
    if (exp.numero_expediente) return String(exp.numero_expediente).toUpperCase().includes(TER100_CODIGO);
    return (exp.oportunidades?.ficha || exp.ficha) === TER100_CODIGO;
}

/**
 * Alcance de la actuación. `cambio_calefaccion` es nuevo, así que los expedientes
 * anteriores no lo traen: ausente = SÍ (es el caso normal y el único posible en
 * RES060/RES093), nunca se interpreta como "no se toca la calefacción".
 */
export function ter100Alcance(instalacion = {}) {
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
 * Variables de la fórmula TER100 a partir del expediente.
 *
 * @param {Object} expediente - expediente con joins (`oportunidades`, `cee`, `instalacion`)
 * @returns objeto con las variables crudas y el resultado del cálculo (`savings`)
 */
export function deriveTer100Vars(expediente) {
    const exp = expediente || {};
    const op = exp.oportunidades || {};
    const opDatos = op.datos_calculo || {};
    const cee = exp.cee || {};
    const inst = exp.instalacion || {};

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

    const alcance = ter100Alcance(inst);

    const savings = calculateTer100({
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
    });

    return {
        ceeBase,
        // Variables de la fórmula
        dcalRaw, sRaw, qNetHeating,
        dacsRaw: acs.value, acsMode: acs.mode, acsPorM2: acs.dacsPorM2, acsPersonas: acs.personas,
        dcap, scopPool,
        boilerEff, boilerEffId, scopCal, scopAcs,
        alcance,
        piscina,
        // Resultado
        savings,
        savingsKwh: savings.savingsKwh,
        vidaUtil: TER100_VIDA_UTIL,
    };
}
