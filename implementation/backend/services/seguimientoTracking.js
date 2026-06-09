// ─── seguimientoTracking.js ──────────────────────────────────────────────────
// Trazabilidad temporal de los subestados de seguimiento del expediente.
//
// El objeto `expedientes.seguimiento` (JSONB) guarda el subestado actual de cada
// fase como STRING (cee_inicial, cee_final, anexos). Para NO romper la lógica que
// lee esos strings (SeguimientoModule, vistas SQL v_expedientes_lifecycle, etc.)
// añadimos campos PARALELOS y ADITIVOS por cada fase:
//
//   seguimiento.cee_inicial            = 'PTE_REVISION'        (string — sin cambios)
//   seguimiento.cee_inicial_ts         = { ASIGNADO: '<iso>', EN_TRABAJO: '<iso>', ... }
//   seguimiento.cee_inicial_desde      = '<iso>'   ← cuándo entró en el subestado ACTUAL
//   seguimiento.cee_inicial_last_contacto_at = '<iso>'  ← última comunicación al cert (incl. recordatorios)
//
// Con esto el frontend puede calcular "lleva N días en este estado" y mostrar la
// fecha de cada hito, y el admin sabe cuándo fue la última vez que escribió al
// certificador (resuelve "no recuerdo si se lo he enviado").
//
// IMPORTANTE: estos campos extra son retro-compatibles. Cualquier consumidor que
// lea `seguimiento.cee_inicial` como string sigue funcionando igual.

const TRACKED_KEYS = ['cee_inicial', 'cee_final', 'anexos'];

/**
 * Aplica un nuevo subestado a una fase, registrando el timestamp de la transición.
 * Lee el valor previo del propio objeto `seguimiento[key]` ANTES de sobreescribirlo,
 * por lo que debe llamarse EN LUGAR de `seguimiento[key] = nuevoEstado`.
 *
 * @param {object} seguimiento  Objeto seguimiento (se muta y se devuelve)
 * @param {string} key          'cee_inicial' | 'cee_final' | 'anexos'
 * @param {string} newStatus    Nuevo subestado (string)
 * @param {string} [atIso]      Timestamp ISO (por defecto: ahora)
 * @returns {object} el mismo objeto seguimiento mutado
 */
function applyStatus(seguimiento, key, newStatus, atIso) {
    if (!seguimiento || !key || !newStatus) return seguimiento;
    const at = atIso || new Date().toISOString();
    const prevStatus = seguimiento[key];
    seguimiento[key] = newStatus;

    // Solo sellamos timestamp en transiciones reales (evita pisar la fecha de inicio
    // del estado actual cuando se re-guarda sin cambiar de subestado).
    if (prevStatus !== newStatus) {
        const tsKey = `${key}_ts`;
        seguimiento[tsKey] = { ...(seguimiento[tsKey] || {}), [newStatus]: at };
        seguimiento[`${key}_desde`] = at;
    }
    return seguimiento;
}

/**
 * Sella timestamps comparando el seguimiento previo con el nuevo (merge ya hecho).
 * Pensado para el chokepoint PUT /:id, donde el subestado entrante ya viene fundido
 * en `next` y disponemos de `prev` (lo almacenado) por separado.
 *
 * @param {object} prev   seguimiento almacenado en BD
 * @param {object} next   seguimiento resultante tras el merge (se muta y se devuelve)
 * @param {string} [atIso]
 * @returns {object} next mutado
 */
function stampSeguimientoTimestamps(prev, next, atIso) {
    if (!next) return next;
    const at = atIso || new Date().toISOString();
    const prevObj = prev || {};
    for (const key of TRACKED_KEYS) {
        const nextStatus = next[key];
        if (nextStatus === undefined || nextStatus === null) continue;
        const prevStatus = prevObj[key];
        if (nextStatus === prevStatus) continue;
        const tsKey = `${key}_ts`;
        next[tsKey] = { ...(prevObj[tsKey] || next[tsKey] || {}), [nextStatus]: at };
        next[`${key}_desde`] = at;
    }
    return next;
}

/**
 * Registra que se ha contactado al certificador para una fase (incluye recordatorios
 * y avisos urgentes que NO cambian el subestado). Útil para "última comunicación".
 *
 * @param {object} seguimiento  (se muta y se devuelve)
 * @param {('initial'|'final'|'inicial')} phase
 * @param {string} [atIso]
 * @returns {object} seguimiento mutado
 */
function markCertContact(seguimiento, phase, atIso) {
    if (!seguimiento) return seguimiento;
    const at = atIso || new Date().toISOString();
    const key = phase === 'final' ? 'cee_final' : 'cee_inicial';
    seguimiento[`${key}_last_contacto_at`] = at;
    return seguimiento;
}

module.exports = {
    TRACKED_KEYS,
    applyStatus,
    stampSeguimientoTimestamps,
    markCertContact,
};
