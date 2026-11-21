// ============================================================================
// calderaDesdePlaca.js — de la PLACA leída a la caldera de la simulación.
//
// En «Nueva simulación» el partner sube la foto de la placa y la app la lee
// (`POST /api/oportunidades/leer-placa-caldera`). Con lo leído se contestan
// solas las preguntas de la caldera del funnel (combustible, antigüedad,
// condensación) y se fija la FILA de rendimiento de la tabla.
//
// REGLA — la fila la decide el AÑO DE LA PLACA, nunca el de la vivienda (regla 99,
// decisión del usuario 2026-10-14): con año, la fila de ese año aunque sea antigua;
// sin año, la MÁS RECIENTE de su tipo. Las respuestas del funnel («más de 20
// años») no bastan: en gasóleo «>20» cae en «anterior a 1985» aunque la caldera
// sea de 2003.
//
// REGLA — la CONDENSACIÓN la dice quien está delante de la caldera; si no lo sabe,
// desde el 26/09/2015 (Reglamento (UE) 813/2013, ecodiseño) solo se ponen en el
// mercado calderas de gas y gasóleo de condensación para calefacción: una placa
// de 2016 en adelante se toma como de condensación, y una anterior, como no.
// ============================================================================

// Con `.js`: este módulo lo prueba también Node (test_caldera_desde_placa.mjs).
import { BOILER_EFFICIENCIES } from '../../calculator/logic/calculation.js';

/** Lo que el lector devuelve como combustible → la respuesta del funnel. */
export const COMBUSTIBLE_PLACA_A_FUNNEL = {
    gas_natural: 'gas',
    glp: 'gas',
    gasoleo: 'gasoleo',
    pellets: 'biomasa',
    carbon: 'carbon',
    electricidad: 'electrica',
};

/** Las opciones que se le enseñan al partner para confirmar (en neutro). */
export const COMBUSTIBLES_CALDERA = [
    { id: 'gas_natural', label: 'Gas natural' },
    { id: 'glp', label: 'Propano / butano' },
    { id: 'gasoleo', label: 'Gasóleo' },
    { id: 'pellets', label: 'Biomasa (pellets, leña)' },
    { id: 'carbon', label: 'Carbón' },
    { id: 'electricidad', label: 'Eléctrica' },
];

export const AÑO_SOLO_CONDENSACION = 2016;

const RE_CONDENSACION = /\bCOND(?:ENS|\b|\.)|CONDENSACI[OÓ]N|\bCONDENS/i;

/** ¿Lo dice el propio modelo? («THEMA CONDENS F25», «… COND 24»). */
export function modeloDiceCondensacion(modelo) {
    return RE_CONDENSACION.test(String(modelo || ''));
}

const fila = (id) => {
    const f = BOILER_EFFICIENCIES.find((b) => b.id === id);
    return { boilerId: id, boilerEff: f ? f.value : 0.92, etiqueta: f ? f.label : id };
};

/** 'si' | 'no' — lo que se toma por condensación con lo que hay. */
export function condensacionSupuesta({ condensacion, anio, modelo }) {
    if (condensacion === 'si' || condensacion === 'no') return condensacion;
    if (modeloDiceCondensacion(modelo)) return 'si';
    return Number(anio) >= AÑO_SOLO_CONDENSACION ? 'si' : 'no';
}

/** La edad del funnel (`<10` · `10-20` · `>20` · `no_se`) a partir del año. */
export function edadDesdeAnio(anio, hoy = new Date()) {
    const a = Number(anio);
    if (!(a > 1900)) return 'no_se';
    const edad = hoy.getFullYear() - a;
    if (edad < 10) return '<10';
    if (edad <= 20) return '10-20';
    return '>20';
}

/**
 * La caldera de la simulación a partir de la placa.
 *
 * @param {object} p
 * @param {string} p.combustible  el de la placa o el que confirma el partner (gas_natural, glp, gasoleo, pellets, carbon, electricidad)
 * @param {number|null} p.anio    año de fabricación de la placa
 * @param {'si'|'no'|'no_se'|null} p.condensacion  lo que diga el partner
 * @param {string|null} p.modelo  el modelo leído (puede decir «CONDENS»)
 * @returns {{ funnel:{combustible_actual,edad_caldera,condensacion}, boilerId, boilerEff, etiqueta, glp:boolean, porque:string } | null}
 */
export function calderaDesdePlaca({ combustible, anio = null, condensacion = null, modelo = null } = {}) {
    const comb = String(combustible || '').toLowerCase();
    const combFunnel = COMBUSTIBLE_PLACA_A_FUNNEL[comb];
    if (!combFunnel) return null;
    const a = Number(anio) > 1900 ? Number(anio) : null;
    const edad = edadDesdeAnio(a);
    const conAnio = a ? `de ${a}` : 'sin año en la placa';

    if (combFunnel === 'electrica') {
        return { funnel: { combustible_actual: 'electrica', edad_caldera: edad, condensacion: null }, ...fila('electric'), combustible: comb, anio: a, glp: false, porque: 'Caldera eléctrica.' };
    }

    if (combFunnel === 'carbon' || combFunnel === 'biomasa') {
        // La tabla de sólidos no va por años sino por carga (manual/automática):
        // se usa la MISMA decisión del funnel por antigüedad.
        const id = edad === '<10' ? 'solid_auto_cal' : edad === '>20' ? 'solid_man_cal' : 'solid_auto';
        return {
            funnel: { combustible_actual: combFunnel, edad_caldera: edad, condensacion: null },
            ...fila(id), combustible: comb, anio: a, glp: false,
            porque: `Caldera de ${combFunnel === 'carbon' ? 'carbón' : 'biomasa'} ${conAnio}.`,
        };
    }

    const cond = condensacionSupuesta({ condensacion, anio: a, modelo });
    const condTxt = cond === 'si' ? 'de condensación' : 'sin condensación';
    let id;
    if (combFunnel === 'gas') {
        if (cond === 'si') id = a && a < 1998 ? 'gas_pre98_cond' : 'gas_post98_cond_auto';
        else if (!a || a >= 1998) id = 'gas_post98_auto';
        else if (a < 1979) id = 'gas_pre79';
        else id = 'gas_pre98_mural';
    } else {
        if (cond === 'si') id = 'oil_cond';
        else if (!a || a >= 1998) id = 'oil_post98';
        else if (a < 1985) id = 'oil_pre85';
        else id = 'oil_85_97';
    }
    return {
        funnel: { combustible_actual: combFunnel, edad_caldera: edad, condensacion: cond },
        ...fila(id),
        combustible: comb, anio: a,
        glp: comb === 'glp',
        porque: `Caldera ${comb === 'glp' ? 'de propano/butano' : combFunnel === 'gas' ? 'de gas' : 'de gasóleo'} ${condTxt}, ${conAnio}`
            + (a ? '.' : ': se toma la fila más reciente de su tipo.'),
    };
}

/** La familia que entiende `potencias_por_combustible` de la ruta (placa policombustible). */
const FAMILIA_POTENCIA = { gas_natural: 'gas_natural', glp: 'gas_natural', gasoleo: 'gasoleo', pellets: 'carbon', carbon: 'carbon' };

/**
 * La potencia útil de la caldera con lo que hay: lo tecleado manda; si no, la de la
 * placa y, en una POLICOMBUSTIBLE, la del combustible confirmado (regla 27.d: sin
 * combustible no se elige ninguna).
 */
export function potenciaDeLaPlaca(lectura, combustible, tecleada = null) {
    const t = Number(String(tecleada ?? '').replace(',', '.'));
    if (t > 0) return t;
    if (Number(lectura?.potencia_kw) > 0) return Number(lectura.potencia_kw);
    const fam = FAMILIA_POTENCIA[combustible];
    const porComb = lectura?.potencias_por_combustible || {};
    return fam && Number(porComb[fam]) > 0 ? Number(porComb[fam]) : null;
}

/**
 * Lo que se guarda en `inputs.placa_caldera` (marca, modelo, serie, potencia,
 * combustible), con la MISMA forma que pone la skill `alta-oportunidad` y que
 * `expedienteService` hereda al aceptar — solo huecos, y un nº de serie dudoso no
 * (`serie_dudosa`, que es lo que mira `expedienteService`).
 *
 * Además de lo leído, lo que hace falta para que quien la reciba sepa de dónde sale
 * cada cosa: el VEREDICTO de la foto, qué combustible CONFIRMÓ quien estaba delante
 * (el leído no se escribe nunca, regla 27.d: va aparte, en `combustible_leido`) y qué
 * contestó de la condensación.
 */
export function placaCalderaParaInputs(lectura, {
    combustible, potenciaKw, anio = null, condensacion = null, origen = 'nueva_simulacion',
} = {}) {
    const l = lectura?.leido || {};
    // La placa habla de FAMILIA: los pellets y la leña son biomasa (como la skill).
    const c = combustible || l.combustible || null;
    const famComb = c === 'pellets' ? 'biomasa' : c;
    return {
        at: new Date().toISOString(),
        marca: l.marca || null,
        modelo: l.modelo || null,
        numero_serie: l.numero_serie || null,
        serie_dudosa: !!l.serie_dudosa,
        potencia_kw: Number(potenciaKw) > 0 ? Number(potenciaKw) : null,
        potencia_texto: l.potencia_texto || null,
        // El año TECLEADO cuenta igual que el leído (lo pone quien mira la placa),
        // pero se marca: el expediente debe poder distinguirlo.
        anio: l.anio || (Number(anio) > 1900 ? Number(anio) : null),
        anio_tecleado: !l.anio && Number(anio) > 1900,
        combustible: famComb,
        combustible_leido: l.combustible || null,
        condensacion: condensacion || null,
        veredicto: lectura?.veredicto?.estado || (lectura ? null : 'sin_lectura'),
        origen,
    };
}

/**
 * Lo que la placa cambia en los inputs que ya salieron de `funnelToCalculatorInputs`:
 * la FILA de rendimiento (por el año de la placa, regla 99), la potencia, la placa
 * misma y —como `ajustesCombustible` del alta por WhatsApp— el propano y los sólidos,
 * que el funnel no distingue (lo lleva todo como «gas» o «biomasa»).
 *
 * @param {{caldera: ReturnType<typeof calderaDesdePlaca>, placa: object}} desdePlaca
 * @param {object} funnel  para saber si el ACS lo da la misma caldera
 */
export function inputsDesdeCalderaPlaca({ caldera, placa } = {}, funnel = {}) {
    if (!caldera) return {};
    const out = { boilerId: caldera.boilerId, boilerEff: caldera.boilerEff };
    if (Number(placa?.potencia_kw) > 0) out.potenciaCaldera = Number(placa.potencia_kw);
    if (placa) out.placa_caldera = placa;
    if (caldera.combustible === 'glp') {
        Object.assign(out, { fuelType: 'glp', boilerHeatingType: 'Propano' });
        if (funnel.boiler_acs_type === 'misma_caldera') out.boilerAcsType = 'Propano';
    } else if (caldera.combustible === 'carbon') {
        Object.assign(out, { combustibleSolido: 'carbon', fuelType: 'carbon', boilerHeatingType: 'Carbon' });
    } else if (caldera.combustible === 'pellets') {
        Object.assign(out, { combustibleSolido: 'pellets', fuelType: 'pellets', boilerHeatingType: 'BIOMASA' });
    }
    return out;
}
