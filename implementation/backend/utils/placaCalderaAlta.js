// ============================================================================
// placaCalderaAlta.js — ¿la foto que sube el PARTNER al dar de alta es una placa
// de caldera que sirve?
//
// En «Nueva simulación» el instalador sube la foto de la caldera y de su placa
// de características. La LECTURA es la de siempre (`placaOcrService.leerPlacaCaldera`,
// regla 27.d: la misma placa no puede leerse distinto según por dónde se entre).
// Lo que añade este módulo es el JUICIO para el que la sube, con la caldera
// delante y el móvil en la mano: «esta vale», «acércate a la etiqueta» o «esto
// no es una placa». Es puro (sin Gemini ni Drive) para poder probarlo solo.
//
// REGLA — lo decide el CÓDIGO con lo leído, no el modelo. Una placa sirve si de
// ella sale la caldera (marca o modelo) Y su potencia; sin potencia se puede
// seguir, pero se le pide otra foto más cerca, porque sin ella no se escribe la
// instalación en el .cex (regla 27.d) y alguien acabará pidiéndosela por WhatsApp.
//
// REGLA — en una placa POLICOMBUSTIBLE la potencia depende del combustible, que
// en el alta aún no está declarado: se devuelve la de CADA familia y la elige el
// combustible que confirme el partner (`elegirPotencia`, la misma decisión).
// ============================================================================

/** Combustibles de la placa → familia que entiende `elegirPotencia`. */
const COMBUSTIBLES_PRUEBA = ['gas_natural', 'gasoleo', 'carbon'];

/**
 * La potencia útil para cada combustible posible, cuando la placa declara una
 * por combustible. `{ gas_natural: 23.3, gasoleo: 23.3, carbon: 15.3 }`.
 * Vacío si la placa no es policombustible.
 *
 * `elegir` es `placaOcrService.elegirPotencia`; se pide al llamar (y no arriba)
 * porque importar ese servicio levanta el cliente de Gemini y Drive, y la prueba
 * de este módulo no tiene por qué.
 */
function potenciasPorCombustible(potencias = [], elegir = null) {
    const elegirPotencia = elegir || require('../services/placaOcrService').elegirPotencia;
    const out = {};
    for (const c of COMBUSTIBLES_PRUEBA) {
        const r = elegirPotencia(potencias, c);
        if (r.base !== 'multicombustible') return {};
        if (r.kw) out[c] = r.kw;
    }
    return out;
}

/**
 * El veredicto para el partner.
 *
 * @param {object} r  lo que devuelve `leerPlacaCaldera` (leido, potencia_kw, potencia_base…)
 * @returns {{ estado: 'ok'|'incompleta'|'no_valida', titulo: string, faltan: string[], consejo: string|null }}
 */
function veredictoPlaca(r = {}) {
    const l = r.leido || {};
    const hayCaldera = !!(l.marca || l.modelo);
    const policombustible = r.potencia_base === 'multicombustible';
    const hayPotencia = Number(r.potencia_kw) > 0 || (policombustible && (l.potencias || []).length > 0);
    const hayAlgo = hayCaldera || hayPotencia || !!l.numero_serie || !!l.potencia_texto;

    if (!hayAlgo) {
        return {
            estado: 'no_valida',
            titulo: 'No reconocemos una placa de caldera en la foto',
            faltan: ['marca', 'modelo', 'potencia'],
            consejo: 'Haz la foto de cerca a la ETIQUETA de características (suele estar en un lateral, '
                + 'debajo o tras la tapa frontal) y que se lean los números. Sin reflejos ni flash.',
        };
    }

    const faltan = [];
    if (!l.marca) faltan.push('marca');
    if (!l.modelo) faltan.push('modelo');
    if (!hayPotencia) faltan.push('potencia');
    if (!l.combustible) faltan.push('combustible');
    if (!l.anio) faltan.push('año');

    // Lo que IMPIDE dar la placa por buena: sin caldera o sin potencia.
    if (!hayCaldera || !hayPotencia) {
        return {
            estado: 'incompleta',
            titulo: !hayPotencia ? 'Se ve la caldera, pero no su potencia' : 'Se lee la potencia, pero no la caldera',
            faltan,
            consejo: !hayPotencia
                ? 'Acércate a la etiqueta: necesitamos la línea de la potencia en kW («Pn», «Potencia útil»). '
                    + 'Puedes seguir y mandarla luego, pero sin ella no se puede hacer el certificado.'
                : 'Añade una foto de la caldera entera: la marca suele estar en el frontal, no en la etiqueta.',
        };
    }

    return {
        estado: 'ok',
        titulo: 'Placa leída',
        // El año y el combustible no impiden nada: el año, si falta, se toma la
        // fila más reciente de su tipo (regla 99), y el combustible lo confirma
        // el partner en la misma pantalla.
        faltan: faltan.filter((f) => f === 'año' || f === 'combustible'),
        consejo: null,
    };
}

const NOMBRE_COMBUSTIBLE = {
    gas_natural: 'gas natural', glp: 'propano/butano', gasoleo: 'gasóleo',
    biomasa: 'biomasa', pellets: 'biomasa', carbon: 'carbón', electricidad: 'eléctrica',
};
const NOMBRE_CONDENSACION = { si: 'sí', no: 'no', no_se: 'no lo sabe' };
const NOMBRE_VEREDICTO = {
    ok: 'placa leída', incompleta: 'placa INCOMPLETA', no_valida: 'la foto NO es una placa', sin_lectura: 'no se pudo leer',
};

/**
 * La nota del historial de la oportunidad cuando la caldera se dio de alta desde
 * la FOTO de su placa en «Nueva simulación». Es lo que necesita quien la recibe para
 * fiarse o no de la simulación sin abrir las fotos: qué se leyó, qué confirmó quien
 * estaba delante (el combustible leído y el confirmado, si difieren) y si la foto
 * servía. Sin `placa_caldera`, null.
 */
function notaHistorialPlaca(pc) {
    if (!pc || typeof pc !== 'object') return null;
    const caldera = [pc.marca, pc.modelo].filter(Boolean).join(' ') || 'marca y modelo sin leer';
    const kw = Number(pc.potencia_kw) > 0 ? `${String(pc.potencia_kw).replace('.', ',')} kW` : 'potencia sin leer';
    const anio = pc.anio ? `${pc.anio}${pc.anio_tecleado ? ' (tecleado)' : ''}` : 'sin año';
    const comb = NOMBRE_COMBUSTIBLE[pc.combustible] || pc.combustible || '?';
    const leido = pc.combustible_leido && NOMBRE_COMBUSTIBLE[pc.combustible_leido] !== comb
        ? ` — la placa decía ${NOMBRE_COMBUSTIBLE[pc.combustible_leido] || pc.combustible_leido}`
        : (pc.combustible_leido ? '' : ' — la placa no lo dice');
    const cond = pc.condensacion ? ` · condensación: ${NOMBRE_CONDENSACION[pc.condensacion] || pc.condensacion}` : '';
    const ver = NOMBRE_VEREDICTO[pc.veredicto] || pc.veredicto || '?';
    return `🔥 Caldera dada de alta con la FOTO de su placa (${ver}): ${caldera} · ${kw} · ${anio}. `
        + `Combustible confirmado: ${comb}${leido}${cond}.`
        + (pc.serie_dudosa ? ' Nº de serie dudoso: se elige en el expediente mirando la foto.' : '');
}

module.exports = { veredictoPlaca, potenciasPorCombustible, notaHistorialPlaca };
