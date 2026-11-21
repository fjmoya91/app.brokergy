// ─────────────────────────────────────────────────────────────────────────────
// «Solicitar revisión» del PARTNER (Fran, 17/11/2026): con el bono por debajo de
// 3.000 € (el umbral de la regla 161), pide que se haga el CEE INICIAL de la
// vivienda; se le encarga a la IA y su XML pasa la simulación a cálculo real.
// El servidor (`POST /api/oportunidades/:id/peticion-revision`) vuelve a mirar el
// umbral con lo GUARDADO: esto solo decide si se ENSEÑA el botón.
// ─────────────────────────────────────────────────────────────────────────────

/** El umbral de la regla 161 (también `UMBRAL_REVISION_EUR` en routes/oportunidades.js). */
export const UMBRAL_REVISION_EUR = 3000;

/**
 * ¿Se le ofrece al partner «Solicitar revisión»? Bono por debajo de 3.000 €, sin el CEE
 * de la vivienda en la simulación, guardada y en captación (ni aceptada ni expediente).
 */
export function ofrecerRevision(inputs = {}, bono, expediente = null) {
    if (expediente || !inputs.id_oportunidad) return false;
    if (String(inputs.estado || '').toUpperCase() === 'ACEPTADA') return false;
    if (inputs.cee_previo || inputs.xmlDemandData) return false;
    const b = Math.round(Number(bono) || 0);
    return b > 0 && b < UMBRAL_REVISION_EUR;
}
