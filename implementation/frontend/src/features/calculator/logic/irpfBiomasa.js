/**
 * BIOMASA → la deducción del IRPF exige PLACAS SOLARES (decisión del usuario, 2026-10-10).
 *
 * Fuente ÚNICA de cuándo se avisa y de lo que se dice. La consumen:
 *   · la calculadora  (ResultsPanel: aviso al staff, encima de la viabilidad)
 *   · la PROPUESTA    (ProposalModal: recuadro bajo la tabla y mensaje de envío)
 *
 * REGLA — con una caldera de COMBUSTIBLE SÓLIDO que NO sea carbón (pellets, leña,
 * hueso…) cambiarla por aerotermia NO reduce el consumo de energía primaria NO
 * RENOVABLE: la biomasa ya es renovable y su factor de paso es casi cero. Y esa
 * reducción es el requisito de las deducciones del IRPF por eficiencia energética.
 * Sin placas fotovoltaicas (ya puestas o en la misma obra) no hay deducción.
 *
 * REGLA — el Bono CAE SÍ se obtiene, y hay que decirlo en el mismo aviso: el CAE sale
 * del ahorro de energía FINAL certificado, no de la primaria no renovable. Decir solo
 * «no hay deducción» deja al cliente pensando que toda la ayuda se cae.
 *
 * REGLA — el CARBÓN no entra: es fósil y la aerotermia sí le reduce la primaria no
 * renovable.
 *
 * REGLA — con una caldera de COMBUSTIBLE SÓLIDO se ELIGE carbón o biomasa, y lo
 * elegido MANDA (Fran, 12/11/2026, 26RES060_OP403: una Roca policombustible que
 * quemaba carbón salió como biomasa y la propuesta avisó de que sin placas no había
 * deducción del IRPF). Lo elegido va en `inputs.combustibleSolido` (`carbon` ·
 * `lena` · `pellets`), lo pone el desplegable «¿Carbón o biomasa?» de la
 * calculadora (o el alta por WhatsApp) y pasa por encima de lo que dijeran el
 * funnel o la placa.
 *
 * Sin elegir, se decide como antes: el combustible tecleado (`fuelType`: pellets /
 * leña → biomasa; carbón → no) y, si el desplegable lo dejó en «carbón» por
 * defecto (al elegir una fila `solid_*` la calculadora pone carbón), lo que dicen
 * el funnel (`boilerHeatingType: 'BIOMASA'`) o la placa leída
 * (`placa_caldera.combustible: 'biomasa'`).
 */

const BIOMASA_FUEL = new Set(['pellets', 'lena']);

/** Lo que se puede elegir para una caldera de combustible sólido (clave = `fuelType`). */
export const COMBUSTIBLES_SOLIDOS = [
    { id: 'carbon', label: 'Carbón', corto: 'Carbón' },
    { id: 'lena', label: 'Biomasa: leña, hueso, astilla…', corto: 'Leña' },
    { id: 'pellets', label: 'Biomasa: pellets', corto: 'Pellets' },
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** ¿La fila de la caldera es de combustible SÓLIDO (carbón o biomasa)? */
export const esFilaSolida = (boilerId) => String(boilerId || '').startsWith('solid_');

/** El combustible sólido ELEGIDO (`carbon` · `lena` · `pellets`), o null si nadie lo ha elegido. */
export function combustibleSolidoElegido(inputs) {
    const c = norm(inputs?.combustibleSolido);
    return COMBUSTIBLES_SOLIDOS.some(x => x.id === c) ? c : null;
}

/** ¿La caldera que se sustituye es de biomasa (combustible sólido que no es carbón)? */
export function esCalderaBiomasa(inputs) {
    if (!inputs) return false;
    const elegido = combustibleSolidoElegido(inputs);
    if (elegido && esFilaSolida(inputs.boilerId)) return elegido !== 'carbon';
    const fuel = norm(inputs.fuelType);
    if (BIOMASA_FUEL.has(fuel)) return true;
    const esSolida = String(inputs.boilerId || '').startsWith('solid_');
    const dicenBiomasa = norm(inputs.boilerHeatingType) === 'biomasa'
        || norm(inputs.placa_caldera?.combustible) === 'biomasa';
    if (fuel === 'carbon') return esSolida && dicenBiomasa;
    return dicenBiomasa;
}

/**
 * ¿Hay placas solares fotovoltaicas que cumplan el requisito? Las que YA tiene la
 * vivienda (`fotovoltaica.estado === 'si'`) o las que entran en ESTA obra (un
 * presupuesto de fotovoltaica o las placas marcadas en la reforma).
 */
export function tienePlacasSolares(inputs) {
    if (!inputs) return false;
    if (norm(inputs.fotovoltaica?.estado) === 'si') return true;
    if (Number(inputs.presupuestoFotovoltaica) > 0) return true;
    if (inputs.reforma_elementos?.placas === true || inputs.landing_funnel?.reforma_elementos?.placas === true) return true;
    return false;
}

/**
 * ¿Hay que avisar? Biomasa, sin placas y con deducción en juego (`conIrpf`): a un
 * titular empresa sin IRPF advertirle de un requisito de algo que no tiene es ruido.
 */
export function avisarIrpfBiomasa(inputs, { conIrpf = true } = {}) {
    return !!conIrpf && esCalderaBiomasa(inputs) && !tienePlacasSolares(inputs);
}

/**
 * El aviso. Impersonal a propósito: vale igual para el cliente, el partner y el
 * instalador, que es a quien va el mismo texto en el mensaje.
 * @returns {{titulo: string, parrafos: string[]}}
 */
export function avisoIrpfBiomasa() {
    return {
        titulo: 'Caldera de biomasa: la deducción del IRPF requiere placas solares',
        parrafos: [
            'Al sustituir una caldera de biomasa (pellets, leña, hueso…) por aerotermia no se reduce el consumo de energía primaria no renovable, que es el requisito para las deducciones del IRPF por eficiencia energética. Por eso, para poder acogerse a la deducción del IRPF es necesario contar con placas solares fotovoltaicas (ya instaladas o incluidas en la obra).',
            'El Bono Energético CAE NO se ve afectado: se obtiene igualmente, con o sin placas solares.',
        ],
    };
}

/** El mismo aviso en un párrafo, para el mensaje de WhatsApp / email. */
export function lineaIrpfBiomasa() {
    const { parrafos } = avisoIrpfBiomasa();
    return `⚠️ *Importante — caldera de biomasa y deducción del IRPF.* ${parrafos.join(' ')}`;
}
