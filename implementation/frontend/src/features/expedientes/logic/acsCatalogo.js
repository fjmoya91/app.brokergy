// ============================================================================
// acsCatalogo.js — FUENTE ÚNICA de "qué ACS da este equipo del catálogo".
// ----------------------------------------------------------------------------
// El catálogo `aerotermia` contesta a DOS preguntas distintas que durante mucho
// tiempo se leyeron como una sola:
//
//   · `deposito_acs_incluido` → el equipo trae el acumulador DENTRO. Es lo que
//     en obra se llama un CONJUNTO (all-in-one, compacto, hidrokit con depósito).
//   · ¿produce ACS? → ¿tenemos con qué justificar un SCOP_dhw?
//
// NO son lo mismo, y confundirlas tiene consecuencias medidas (09/2026, sobre
// 490 modelos): 79 equipos producen ACS SIN depósito integrado —el depósito va
// aparte, que es justo el supuesto del Anexo VI— y 27 llevan depósito y no
// tienen ningún dato de ACS en el catálogo. Filtrar el desplegable de ACS por
// "lleva depósito" dejaría fuera a los primeros, y darlo por bueno en los
// segundos deja pasar un equipo cuyo SCOP_dhw no se puede justificar.
//
// REGLA — el desplegable de ACS ofrece los que PUEDEN JUSTIFICAR un SCOP_dhw,
// no los que llevan depósito. Sin ese filtro, elegir un modelo sin datos de ACS
// no daba error: `getScopAcsFromModel` cae a un **3,0 inventado** (calculation.js)
// y ese número acaba en un certificado firmado. Medido: 22 expedientes apuntan
// hoy a un modelo de ACS sin SCOP_dhw en el catálogo.
//
// REGLA — el SCOP_dhw sale de la FICHA si la ficha lo trae; si no, del Anexo IV.
// El valor declarado por el fabricante es el más directo de defender ante el
// verificador (226 de los 253 conjuntos lo tienen). El Anexo IV —SCOP = 2,5·η_wh,
// con el η_wh del EPREL— es el método propio del conjunto y entra cuando la
// ficha no lo declara. Y el Anexo VI (COP·Fc) NO es una alternativa a los
// anteriores: su enunciado es literalmente "depósito **no** suministrado como
// conjunto", así que solo aplica a los equipos SIN depósito integrado. En un
// conjunto sin ninguno de los dos datos no se inventa un tercero: se pide el
// η_wh del EPREL, que es lo que falta.
//
// REGLA — este módulo decide el MÉTODO, nunca calcula el SCOP. El número lo da
// `getScopAcsFromModel` (calculation.js), que es donde viven las fórmulas y de
// donde las lee todo lo demás. Dos sitios que calculen el mismo SCOP acaban
// dando dos números distintos para el mismo equipo.
//
// ESM puro (sin React, sin Node): lo importan el frontend y el backend, igual
// que aerotermiaUnits.js.
// ============================================================================

/**
 * Zona CÁLIDA = todo salvo E1. Es la equivalencia del Anexo III de la ficha
 * RES060 entre la zona climática española y la temporada del Rgto. 813/2013, y
 * es la MISMA que aplica `getScopAcsFromModel`: si aquí se leyera otra columna
 * que allí, el método elegido y el valor calculado hablarían de climas distintos.
 */
export const esZonaCalida = (zona) => String(zona || 'D3').toUpperCase() !== 'E1';

/** Número estrictamente positivo, o null. El catálogo guarda 0 y '' como "no consta". */
const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/** SCOP_dhw declarado en la FICHA TÉCNICA para la zona (null si no consta). */
export function scopDhwFicha(model, zona) {
    if (!model) return null;
    return esZonaCalida(zona)
        ? (num(model.scop_dhw_calido) ?? num(model.scop_dhw_medio))
        : num(model.scop_dhw_medio);
}

/** η_wh (%) del EPREL para la zona — el dato del Anexo IV (null si no consta). */
export function etaAcsEprel(model, zona) {
    if (!model) return null;
    return esZonaCalida(zona)
        ? (num(model.eta_acs_calida) ?? num(model.eta_acs_media))
        : num(model.eta_acs_media);
}

/** COP A7/55 — el dato del Anexo VI (null si no consta). */
export const copA755 = (model) => num(model?.cop_a7_55);

/**
 * ¿El equipo trae el acumulador de ACS DENTRO? Es lo que en obra se llama un
 * CONJUNTO, y lo que hace que el ACS no haya que volver a elegirlo.
 *
 * El catálogo guarda un booleano, pero el valor puede llegar de una importación
 * como texto ('SI', 'true'): se acepta igual antes que dar por falso un conjunto.
 */
export function esConjuntoAcs(model) {
    const v = model?.deposito_acs_incluido;
    if (typeof v === 'boolean') return v;
    const s = String(v ?? '').trim().toUpperCase();
    return s === 'TRUE' || s === 'SI' || s === 'SÍ' || s === '1';
}

/** Litros de acumulación del conjunto (null si el catálogo no los tiene). */
export const litrosAcsCatalogo = (model) => num(model?.litros_acs);

/**
 * ¿Tiene este equipo ALGÚN dato de ACS? Es el filtro del desplegable de ACS.
 * Un equipo que no tiene ninguno no es que "no dé agua caliente": es que
 * elegirlo aquí produce un SCOP que no se sostiene ante el verificador.
 *
 * OJO — esto NO equivale a `metodoAcsDelModelo(...).metodo != null`, y la
 * diferencia es deliberada: un CONJUNTO que solo tiene COP A7/55 aparece en la
 * lista (tiene un dato) pero no tiene método aplicable, porque el Anexo VI es de
 * depósitos NO suministrados en conjunto. Ese hueco exacto es donde salta el
 * popup que pide el η_wh del EPREL. Igualar las dos funciones escondería el
 * modelo en vez de dejar completarlo, que es justo lo contrario de lo que se
 * quiere: el popup existe para que el catálogo quede arreglado para siempre.
 */
export function produceAcs(model, zona) {
    if (!model) return false;
    return !!(scopDhwFicha(model, zona) || etaAcsEprel(model, zona) || copA755(model));
}

/** Motivos por los que un modelo no resuelve el ACS solo. */
export const FALTA_ACS = {
    /** Conjunto sin SCOP_dhw de ficha ni η_wh: hay que aportar el EPREL. */
    ETA_EPREL: 'eta_eprel',
    /** No conjunto y sin ningún dato: ni ficha, ni η_wh, ni COP. */
    SIN_DATOS: 'sin_datos',
};

/**
 * Qué método de SCOP_dhw le corresponde a un modelo, y con qué se justifica.
 *
 * Devuelve SIEMPRE un objeto; `metodo` es null solo cuando no hay forma de
 * justificarlo, y entonces `falta` dice qué dato hay que conseguir. El valor del
 * SCOP no se calcula aquí (ver la regla de arriba): quien llama se lo pide a
 * `getScopAcsFromModel(model, zona, metodo)`.
 *
 * @returns {{
 *   metodo: 'ficha'|'conjunto'|'independiente'|null,
 *   justifica: 'ficha'|'eprel'|null,   // qué documento hay que adjuntar al CIFO
 *   conjunto: boolean,                 // el equipo trae el depósito dentro
 *   falta: string|null,                // FALTA_ACS.* cuando no se puede resolver
 *   motivo: string,                    // explicación en una línea, para pantalla
 * }}
 */
export function metodoAcsDelModelo(model, zona) {
    const conjunto = esConjuntoAcs(model);
    if (!model) {
        return { metodo: null, justifica: null, conjunto, falta: FALTA_ACS.SIN_DATOS, motivo: 'No hay modelo seleccionado.' };
    }

    if (scopDhwFicha(model, zona)) {
        return {
            metodo: 'ficha', justifica: 'ficha', conjunto, falta: null,
            motivo: 'La ficha técnica del fabricante declara el SCOP para ACS.',
        };
    }

    if (etaAcsEprel(model, zona)) {
        return {
            metodo: 'conjunto', justifica: 'eprel', conjunto, falta: null,
            motivo: conjunto
                ? 'La ficha no declara SCOP para ACS: se calcula por el Anexo IV (2,5 · η_wh) con el η_wh del EPREL.'
                : 'Se calcula por el Anexo IV (2,5 · η_wh) con el η_wh del EPREL.',
        };
    }

    // Anexo VI — "depósito NO suministrado como conjunto". No es una alternativa
    // para un conjunto: aplicarlo ahí declararía por un procedimiento cuyo
    // enunciado dice lo contrario de lo que el equipo es.
    if (!conjunto && copA755(model)) {
        return {
            metodo: 'independiente', justifica: 'ficha', conjunto, falta: null,
            motivo: 'Depósito aparte: se calcula por el Anexo VI (COP A7/55 · Fc) con el COP de la ficha.',
        };
    }

    return {
        metodo: null, justifica: null, conjunto,
        falta: conjunto ? FALTA_ACS.ETA_EPREL : FALTA_ACS.SIN_DATOS,
        motivo: conjunto
            ? 'El catálogo no tiene ni SCOP para ACS de ficha ni η_wh del EPREL para este conjunto.'
            : 'El catálogo no tiene ningún dato de ACS para este modelo.',
    };
}

/**
 * Los datos que hay que copiar al nodo de ACS cuando lo resuelve el MISMO equipo
 * (un conjunto). Es la misma máquina, así que va con su mismo modelo, sus mismas
 * referencias de placa y su MISMO nº de serie — lo único propio del ACS es el
 * método y el SCOP_dhw, que no es el de calefacción.
 *
 * `scop` lo pone quien llama con `getScopAcsFromModel`: aquí no se calcula.
 */
export function nodoAcsDesdeConjunto(nodoCal, model, { metodo, scop, litros }) {
    const base = { ...(nodoCal || {}) };
    // Un conjunto es UNA máquina: no arrastra la cascada del bloque de
    // calefacción. Si la arrastrara, el CIFO contaría los equipos dos veces.
    delete base.equipos_extra;
    delete base.scop_propio;
    return {
        ...base,
        tipo_equipo_nuevo: 'bdc',
        es_acumulador: false,
        metodo_scop: metodo || 'ficha',
        scop: scop ?? null,
        litros: litros ?? null,
        url_eprel: model?.eprel ?? nodoCal?.url_eprel ?? null,
        url_keymark: model?.url_keymark ?? nodoCal?.url_keymark ?? null,
        url_ficha: model?.ficha_tecnica ?? nodoCal?.url_ficha ?? null,
    };
}
