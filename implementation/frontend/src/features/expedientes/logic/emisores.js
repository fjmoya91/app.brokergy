// ============================================================================
// emisores.js — el emisor INICIAL y el/los emisores FINALES de un expediente.
// ----------------------------------------------------------------------------
// Hasta ahora `instalacion.tipo_emisor` era UNO por expediente y valía para todo:
// para el estado inicial, para el final y para las N unidades de una cascada. En
// las fichas de SUSTITUCIÓN DE GENERADOR eso es correcto y además es la regla:
//
//   REGLA — en RES060 / RES093 / TER100 / TER173 el emisor inicial y el final son
//   EL MISMO. La actuación es cambiar el generador; la instalación de distribución
//   no se toca, y es justo lo que fija la temperatura de impulsión y con ella el
//   SCOP declarado. Ahí no se pregunta dos veces: se deriva.
//
//   REGLA — en RES080 son cosas distintas. La actuación toca la envolvente y la
//   instalación entera puede cambiar de naturaleza: el inicial puede ser incluso
//   NINGUNO (una vivienda sin calefacción) y en el final hay tantos emisores como
//   equipos se instalen — un conductos y un split conviviendo es el caso normal.
//
// Por eso el dato vive donde se puede declarar por separado y NO se duplica:
//   · `instalacion.tipo_emisor`          → el emisor final de referencia (unidad 1).
//     Sigue siendo lo que leen el CIFO, el RITE, el RES080 y el SCOP. No cambia.
//   · `instalacion.tipo_emisor_inicial`  → solo RES080. Sin declarar = el de siempre.
//   · `unidad.tipo_emisor`               → solo RES080, por equipo de la cascada.
//
// Sin ninguno de los dos campos nuevos, un expediente se comporta EXACTAMENTE
// como antes: `inicial` y `finales` salen todos de `tipo_emisor`.
// ============================================================================

import { EMITTER_OPTIONS } from './cifoDoc.js';
import { getUnidades, modeloUnidad } from './aerotermiaUnits.js';

/** El estado inicial puede ser "no había calefacción". No es un emisor final válido. */
export const EMISOR_NINGUNO = 'ninguno';

const OPCION_NINGUNO = {
    value: EMISOR_NINGUNO,
    label: 'No tenía calefacción',
    temp: null,
    ninguno: true,
};

/** Opciones para el emisor INICIAL: las de siempre más "no tenía calefacción". */
export function emisorInicialOptions(numeroExpediente) {
    return [OPCION_NINGUNO, ...emisorFinalOptions(numeroExpediente)];
}

/**
 * Opciones para un emisor FINAL. Las unidades AIRE-AIRE (splits / conductos) solo
 * en RES080 — es el criterio que ya aplicaba `emitterOptionsFor`.
 */
export function emisorFinalOptions(numeroExpediente) {
    return EMITTER_OPTIONS.filter(o => !o.aire || esRes080(numeroExpediente));
}

export function esRes080(numeroExpediente) {
    return /RES080/i.test(String(numeroExpediente || ''));
}

/** Etiqueta legible de un emisor. `null`/vacío → guion; 'ninguno' → su rótulo. */
export function emisorLabel(valor, dash = '—') {
    const v = String(valor || '').trim().toLowerCase();
    if (!v) return dash;
    if (v === EMISOR_NINGUNO) return OPCION_NINGUNO.label;
    return EMITTER_OPTIONS.find(o => o.value === v)?.label || dash;
}

/**
 * Emisor del estado INICIAL.
 * En las fichas de sustitución se DERIVA del final (son el mismo por definición);
 * en RES080 manda lo declarado, y si no hay nada declarado se cae al final, que
 * es como se ha comportado el expediente hasta ahora.
 */
export function emisorInicial(exp) {
    const inst = exp?.instalacion || {};
    if (!esRes080(exp?.numero_expediente)) return norm(inst.tipo_emisor);
    return norm(inst.tipo_emisor_inicial) || norm(inst.tipo_emisor);
}

/** ¿La vivienda NO tenía emisores de calefacción antes de la obra? */
export function sinEmisorInicial(exp) {
    return emisorInicial(exp) === EMISOR_NINGUNO;
}

/**
 * Emisores del estado FINAL, uno por equipo instalado.
 *
 * @returns {Array<{n, tipo_emisor, label, modelo, unidad}>}
 *          En una ficha de sustitución todas las unidades comparten el emisor del
 *          expediente; en RES080 cada una puede traer el suyo.
 */
export function emisoresFinales(exp) {
    const inst = exp?.instalacion || {};
    const base = norm(inst.tipo_emisor);
    const porUnidad = esRes080(exp?.numero_expediente);
    return getUnidades(inst.aerotermia_cal).map((u, i) => {
        const tipo = (porUnidad && norm(u.tipo_emisor)) || base;
        return {
            n: i + 1,
            unidad: u,
            tipo_emisor: tipo,
            label: emisorLabel(tipo),
            modelo: modeloUnidad(u),
        };
    });
}

/**
 * ¿Los equipos instalados llevan emisores de tipos DISTINTOS?
 * Es lo que obliga a declararlos por separado en CE3X (un conductos y un split no
 * son el mismo generador) en vez de agrupar la cascada en un solo bloque.
 */
export function emisoresFinalesMixtos(exp) {
    const tipos = new Set(emisoresFinales(exp).map(e => e.tipo_emisor).filter(Boolean));
    return tipos.size > 1;
}

/**
 * Etiqueta del sistema de distribución para los CERTIFICADOS.
 *
 * Con un solo tipo de emisor es el de siempre. Con varios (un RES080 que instala
 * un conductos y un split) los enumera: el certificado no puede decir "Conductos"
 * a secas mientras el CE3X declara dos generadores distintos — esa contradicción
 * entre dos documentos del mismo expediente es lo primero que cruza un verificador.
 */
export function emisorLabelDocumento(exp, dash = '—') {
    const tipos = [...new Set(emisoresFinales(exp).map(e => e.tipo_emisor).filter(Boolean))];
    if (!tipos.length) return emisorLabel(exp?.instalacion?.tipo_emisor, dash);
    return tipos.map(t => emisorLabel(t, dash)).join(' · ');
}

/**
 * Nombre CORTO del emisor, para meterlo dentro de una frase. El label largo
 * ("Conductos (aire-aire)") entre paréntesis dentro de otra frase se lee
 * "(conductos (aire-aire))", que es ruido.
 */
export function emisorCorto(tipoEmisor) {
    const v = String(tipoEmisor || '').trim().toLowerCase();
    return ({
        conductos: 'conductos',
        splits: 'split',
        suelo_radiante: 'suelo radiante',
        radiadores_baja_temp: 'radiadores de baja temperatura',
        radiadores_convencionales: 'radiadores',
        [EMISOR_NINGUNO]: 'sin emisores',
    })[v] || emisorLabel(v, '').toLowerCase();
}

/**
 * Cómo se declara el generador en CE3X según su unidad terminal.
 *
 * Un conductos y un split NO son el mismo generador aunque los dos sean bombas de
 * calor aire-aire, así que en una instalación mixta hay que teclearlos por
 * separado. En aire-agua se mantiene el matiz de "Caudal Ref. Variable", que es lo
 * que se viene declarando.
 */
export function generadorCe3x(tipoEmisor) {
    const v = String(tipoEmisor || '').trim().toLowerCase();
    if (v === 'conductos') return 'Bomba de calor aire-aire (conductos)';
    if (v === 'splits') return 'Bomba de calor aire-aire (split)';
    return 'Bomba de Calor - Caudal Ref. Variable';
}

function norm(v) {
    return String(v || '').trim().toLowerCase() || null;
}
