/**
 * geminiAjustes — El RAZONAMIENTO y la TEMPERATURA que se le mandan a Gemini,
 * según el modelo. Fuente única para todos los lectores con IA.
 *
 * ── Por qué existe (aviso de Google AI Studio, 07/10/2026) ──────────────────
 * Google retira `thinkingBudget` y los parámetros de muestreo (`temperature`,
 * `topP`, `topK`): en los modelos que vengan, mandarlos dará `400
 * INVALID_ARGUMENT`. Todos nuestros lectores mandaban `temperature: 0` y
 * `thinkingBudget`, así que el día que se cambiara `GEMINI_MODEL` se caían todos
 * a la vez. Aquí se decide qué se manda a cada modelo.
 *
 * ── Lo medido el 07/10/2026 (texto de prueba, sin datos de clientes) ────────
 *   · gemini-2.5-*: `thinkingLevel` → 400 («not supported for this model»). La
 *     serie 2.5 SOLO entiende `thinkingBudget`, y sigue respetando la temperatura.
 *   · gemini-3.5-flash: `thinkingLevel: minimal` → 0 tokens pensados, igual que
 *     `thinkingBudget: 0`. La temperatura 0 SÍ se respeta (4 de 4 iguales).
 *   · gemini-3.5-flash-lite: `thinkingBudget: 0` → 400; `minimal` vale.
 *   · gemini-3.6-flash: `minimal` vale. La temperatura se IGNORA: con
 *     `temperature: 0`, 4 llamadas iguales dieron 4 respuestas distintas.
 *   · gemini-3.7-flash y 3.8-flash: `minimal` → 400 («MINIMAL is not supported»);
 *     el nivel más bajo que aceptan es `low` (en la 3.8, 0 tokens pensados).
 *
 * ── REGLA: ningún lector escribe `thinkingConfig` ni `temperature` a mano ────
 * Se mezcla `...ajustesGemini(modelo, { pensamiento, temperatura })` en el
 * `generationConfig`. Así un cambio de modelo no rompe nada.
 */

// «gemini-3.6-flash» → [3, 6]. Un alias sin versión («gemini-flash-latest») o un
// nombre desconocido da null y se trata como un modelo NUEVO: lo más restrictivo.
function versionGemini(modelo) {
    const m = /^(?:models\/)?gemini-(\d+)(?:\.(\d+))?/.exec(String(modelo || ''));
    return m ? [Number(m[1]), Number(m[2] || 0)] : null;
}

const antesDe = (v, mayor, menor) => !!v && (v[0] < mayor || (v[0] === mayor && v[1] < menor));

/**
 * @param {string} modelo  el de la URL (`gemini-2.5-flash`…)
 * @param {object} o
 * @param {number|null} [o.pensamiento]  0 = no razonar (transcribir); >0 = tope de
 *   tokens de razonamiento, como el antiguo `thinkingBudget`; null/undefined/-1 =
 *   lo que traiga el modelo (no se manda nada).
 * @param {number} [o.temperatura]  se manda SOLO a los modelos que la respetan
 *   (anteriores a la 3.6); a los demás no se les manda.
 * @returns {object} campos para mezclar en `generationConfig`
 */
function ajustesGemini(modelo, { pensamiento = null, temperatura } = {}) {
    const v = versionGemini(modelo);
    const out = {};
    if (temperatura !== undefined && temperatura !== null && antesDe(v, 3, 6)) out.temperature = temperatura;
    if (pensamiento === null || pensamiento === undefined || pensamiento < 0) return out;

    if (v && v[0] < 3) {
        out.thinkingConfig = { thinkingBudget: pensamiento };
    } else if (pensamiento === 0) {
        // `minimal` solo lo aceptan los Flash hasta la 3.6; `low` lo acepta todo Gemini 3.
        const minimal = antesDe(v, 3, 7) && /flash/.test(modelo);
        out.thinkingConfig = { thinkingLevel: minimal ? 'minimal' : 'low' };
    } else {
        out.thinkingConfig = { thinkingLevel: pensamiento <= 2048 ? 'low' : pensamiento <= 8192 ? 'medium' : 'high' };
    }
    return out;
}

module.exports = { ajustesGemini, versionGemini };
