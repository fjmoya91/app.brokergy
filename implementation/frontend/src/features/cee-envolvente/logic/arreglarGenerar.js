/**
 * Cuando el `.cex` NO sale: lo que hay que arreglar para que salga, para el
 * ASISTENTE (2026-10-30, lo pidió Fran en 2026EXT_3: «si al darle a generar me
 * da un error, pedirle al asistente que lo vuelva a generar y me lo deje listo
 * para firmar»).
 *
 * El motor contesta 422 con UN motivo («PVBS1 se escribe como FACHADA y no
 * tiene orientacion…») y para en el primero. La ventana ya sabe TODO lo que lo
 * para —es el grupo `bloquea` de `faltaParaGenerar`—, así que el asistente no
 * le pregunta a Claude lo que el plano ya dice:
 *
 *   - una FACHADA SIN RUMBO es una pregunta con DOS botones, los dos lados de
 *     su propio trazo (`rumbosDeLaPared`). Cuál es el bueno lo dice la persona:
 *     la app no lo puede deducir (regla de `PanelPared` → `Rumbo`) y Claude
 *     tampoco, así que no se gasta un token en adivinarlo;
 *   - lo demás que bloquea (la entrada, un «! falta…» de otra pestaña) va con
 *     su «Ir»: se arregla donde vive;
 *   - si no hay nada de eso, el motivo del motor va a Claude, que propone las
 *     operaciones de siempre (lo que no casa con el plano no se aplica).
 *
 * Puro: sin React. ⚠️ Los imports llevan `.js` (Node lo exige; Vite no).
 */
import { rumbosDeLaPared } from './geometriaPlano.js';

//: Reintentos SOLOS (Claude propone, se aplica y se vuelve a generar) seguidos
//: como mucho: si el motor sigue diciendo que no, lo mira una persona.
export const MAX_REINTENTOS_SOLOS = 2;

/**
 * @param {object} p
 * @param {{ items: Array }} p.falta   lo de `faltaParaGenerar`
 * @param {object} p.muros            `plano.muros`
 * @param {Function} p.nombreDe       cómo se llama la pared en CE3X
 * @param {Function} p.rumbosDe       los dos rumbos posibles de una pared
 * @returns {{ preguntas: Array, otros: Array }}
 *   preguntas: `{ clave, muro, pared, planta, opciones: [r1, r2], ir }`
 *   otros:     `{ clave, texto, detalle, ir }`
 */
export function arreglosParaGenerar({ falta, muros, nombreDe = (m) => m?.id,
                                      rumbosDe = (m) => rumbosDeLaPared(m?.svg) } = {}) {
    const preguntas = [];
    const otros = [];
    for (const it of falta?.items || []) {
        if (it.grupo !== 'bloquea') continue;
        if (String(it.clave).startsWith('rumbo|')) {
            const id = it.clave.slice('rumbo|'.length);
            const m = muros?.[id];
            const opciones = m ? rumbosDe(m) || [] : [];
            // Sin trazo del que sacar los dos lados no hay botones que ofrecer:
            // se va a la pared y se dice allí.
            if (opciones.length === 2) {
                preguntas.push({ clave: it.clave, muro: id, pared: nombreDe(m) || id,
                                 planta: it.detalle || null, opciones, ir: it.ir || null });
                continue;
            }
        }
        otros.push({ clave: it.clave, texto: it.texto, detalle: it.detalle || null, ir: it.ir || null });
    }
    return { preguntas, otros };
}

/**
 * Las respuestas a las preguntas de rumbo, como las operaciones que ya entiende
 * `validarOperaciones` (las mismas que devolvería Claude por «PVBS1 da al sur»).
 * Solo las contestadas; la pared va por su id, que `buscaPared` casa exacto.
 */
export function operacionesDeRumbos(preguntas, respuestas) {
    return (preguntas || [])
        .filter(p => respuestas?.[p.clave])
        .map(p => ({ op: 'cambiar_pared', pared: p.muro, rumbo: respuestas[p.clave] }));
}

/** El texto con el que el motivo del motor va a Claude cuando el plano no lo explica. */
export function textoDelFallo(error) {
    const motivo = String(error || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    return `Al generar el .cex ha fallado: «${motivo}». Arréglalo en el plano si se puede con tus operaciones; si no, di qué hay que hacer.`;
}

/** ¿Es un «no» del motor (422: no lo ha escrito a propósito y dice por qué)? */
export function esFalloDelMotor(e) {
    const status = e?.original?.response?.status ?? e?.response?.status ?? null;
    return status === 422;
}
