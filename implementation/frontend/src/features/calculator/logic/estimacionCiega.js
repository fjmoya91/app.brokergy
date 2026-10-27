// ─────────────────────────────────────────────────────────────────────────────
// El CEE «a ciegas» de una oportunidad: la cifra de un CEE hecho por programa
// (motor + CE3X 3.2, sin IA, sin fotos, sin persona), APARTE de la estimación
// de la calculadora. Solo la ve el equipo interno y NO cambia lo que se ofrece
// (decisión de Fran, 26/10/2026: «una funcionalidad más hasta que podamos
// validarlo»). Lo medido y el porqué: docs/conocimiento/calculo/
// cee-a-ciegas-prueba-con-18-expedientes.md y cee-a-ciegas-diseno-para-la-oportunidad.md.
//
// Fuente única de QUIÉN entra, de la HUELLA (cuándo hay que rehacerla) y de la
// SEÑAL «la propuesta probablemente se queda corta». La usan la calculadora
// (navegador) y el servicio que la calcula en el PC (`services/cee/ceeCiego.js`).
// ─────────────────────────────────────────────────────────────────────────────

/** v2 de la Fase 0: las propuestas del motor aceptadas solas + 12 % de huecos. */
export const VERSION_CIEGA = 'v2-2026-10';
/** Por debajo, en la Fase 0 el P5 de real ÷ ciega fue 0,81: su ~80 % no se pasa. */
export const COEF_PRUDENTE = 0.80;
/** Ciega > 1,3 × calculadora → en 36 de 37 el CEE real dio también más (Fase 0). */
export const UMBRAL_SE_QUEDA_CORTA = 1.3;
/** La superficie que mide el motor casa con la confirmada si no se separa más de esto. */
export const TOLERANCIA_SUPERFICIE = 0.05;

const ESTADOS_CAPTACION_VIVA = ['LEAD', 'PTE ENVIAR', 'EN CURSO'];
const FICHAS_CIEGA = ['RES060', 'RES093'];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const verdad = (v) => v === true || v === 'true';

/** Las construcciones que cuentan, como texto estable (orden de la lista ignorado). */
export function construccionesClave(inputs = {}) {
    const l = Array.isArray(inputs.construcciones_elegidas) ? inputs.construcciones_elegidas : [];
    return l.map(String).sort().join(',');
}

/** Superficie de la simulación (la que se le presupuesta al cliente). */
export function superficieSimulada(inputs = {}) {
    return num(inputs.superficieCalefactable) ?? num(inputs.superficie);
}

/**
 * Por qué esta oportunidad NO lleva cifra a ciegas, o `null` si la lleva.
 * @param {object} o  { ficha, inputs, estado, rc }
 */
export function motivoNoElegible({ ficha, inputs = {}, estado, rc } = {}) {
    const f = String(ficha || '').toUpperCase();
    if (!FICHAS_CIEGA.includes(f)) return `ficha ${f || 'sin ficha'}: solo RES060 y RES093`;
    if (verdad(inputs.isReforma)) return 'reforma (RES080): su ahorro sale de dos certificados';
    if (String(inputs.sector || '').toLowerCase() === 'terciario') return 'terciario';
    if (String(inputs.tipo || '').toLowerCase() !== 'unifamiliar') return `vivienda «${inputs.tipo || 'sin tipo'}»: solo unifamiliar, de momento`;
    if (!(rc || inputs.rc)) return 'sin referencia catastral';
    // Con un CEE en la simulación —el del cliente o el nuestro— manda el certificado.
    if (inputs.cee_previo || inputs.xmlDemandData) return 'la simulación ya tiene un CEE';
    if (estado && !ESTADOS_CAPTACION_VIVA.includes(String(estado).toUpperCase())) return `estado ${estado}: solo en captación viva`;
    return null;
}

/**
 * La HUELLA de lo que mueve la cifra a ciegas: si cambia, hay que rehacerla. No
 * entran el presupuesto ni el precio: el bono a ciegas se recalcula con ellos al
 * enseñarlo, la demanda no depende de ellos.
 */
export function huellaCiega(inputs = {}, rc = null) {
    const partes = [
        VERSION_CIEGA,
        String(rc || inputs.rc || '').toUpperCase(),
        construccionesClave(inputs),
        superficieSimulada(inputs) ?? '',
        String(inputs.boilerId || ''),
        String(inputs.fuelType || ''),
        String(inputs.zona || '').toUpperCase(),
        String(inputs.anio || ''),
    ];
    return partes.join('|');
}

/** La superficie confirmada por una persona sigue valiendo para ESTOS inputs. */
export function superficieConfirmadaVigente(inputs = {}) {
    const c = inputs.superficie_confirmada;
    if (!c || typeof c !== 'object') return null;
    const sup = superficieSimulada(inputs);
    if (num(c.m2) == null || sup == null || Math.abs(num(c.m2) - sup) > 0.5) return null;
    if (String(c.construcciones ?? '') !== construccionesClave(inputs)) return null;
    return c;
}

/**
 * ¿Vale la cifra a ciegas? Solo con la superficie CONFIRMADA por una persona y si
 * los m² que midió el motor casan con ella (± 5 %): donde la superficie descuadra,
 * la cifra a ciegas falla igual que la calculadora (Fase 0: 29 de 120). Se evalúa
 * con la confirmación de AHORA, no con la del día en que se calificó.
 * @returns {string|null} el motivo por el que NO vale, o null si vale
 */
export function motivoNoValida(est, confirmada) {
    if (!confirmada) return 'superficie sin confirmar';
    const m2 = num(confirmada.m2), sup = num(est?.superficie);
    if (!(m2 > 0) || !(sup > 0)) return 'superficie sin confirmar';
    if (Math.abs(sup - m2) / m2 > TOLERANCIA_SUPERFICIE) return `el motor mide ${sup} m² y se confirmaron ${m2}`;
    return null;
}

/**
 * Los inputs con los que la calculadora da el bono A CIEGAS: una COPIA con la
 * demanda y la superficie del CEE a ciegas en «Cálculo real». Sin CEE cargado ni
 * comparativa: nada de esto se guarda en la simulación.
 */
export function inputsConDemandaCiega(inputs = {}, { demanda, superficie }) {
    const copia = { ...inputs, demandMode: 'manual', manualDemand: demanda, manualSuperficie: superficie };
    delete copia.cee_previo; delete copia.cee_final; delete copia.xmlDemandData; delete copia.xmlDemandDataFinal;
    return copia;
}

/**
 * Lo que se enseña en Resultados.
 * @param {object|null} est      `datos_calculo.estimacion_ciega`
 * @param {object} o             { inputs (los de la pantalla), rc, ahorroCalculadora, bonoCalculadora }
 * @returns {{ estado: 'sin'|'desactualizada'|'ok', ratio, seQuedaCorta, superficieConfirmada, noValida }}
 *   `ratio` = ahorro a ciegas ÷ ahorro de la calculadora (sin el coeficiente prudente).
 */
export function lecturaCiega(est, { inputs = {}, rc = null, ahorroCalculadora } = {}) {
    const superficieConfirmada = superficieConfirmadaVigente(inputs);
    if (!est || !(num(est.ahorro_kwh) > 0)) {
        return { estado: 'sin', ratio: null, seQuedaCorta: false, superficieConfirmada, noValida: null };
    }
    const estado = est.huella && est.huella === huellaCiega(inputs, rc) ? 'ok' : 'desactualizada';
    const calc = num(ahorroCalculadora);
    const ratio = calc > 0 ? num(est.ahorro_kwh) / calc : null;
    return { estado, ratio, seQuedaCorta: ratio != null && ratio > UMBRAL_SE_QUEDA_CORTA, superficieConfirmada,
        noValida: motivoNoValida(est, superficieConfirmada) };
}
