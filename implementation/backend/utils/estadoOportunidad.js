// ─── El estado que se VE de una oportunidad, una vez aceptada ─────────────────
//
// `datos_calculo.estado` describe la CAPTACIÓN (LEAD → … → ENVIADA →
// PRE-ACEPTADO → ACEPTADA) y ahí se queda parado para siempre: una oportunidad
// aceptada hace ocho meses, con su obra terminada y su CAE cobrado, seguía
// diciendo ACEPTADA en la lista. El avance real vive en el EXPEDIENTE.
//
// REGLA — a partir de la aceptación manda el EXPEDIENTE, y este estado se
// CALCULA. No se escribe en `datos_calculo.estado`: duplicar la verdad en dos
// tablas es garantizar que un día digan cosas distintas (mismo criterio que
// `esCaptacionViva`, que ya excluye del embudo lo que tiene expediente "aunque
// su estado diga otra cosa: mandan los hechos, no la etiqueta").
//
// REGLA — el criterio es EL MISMO que mueve la carpeta de Drive
// (`carpetaObjetivoExpediente` en services/driveFolders.js): 03. ACEPTADO
// mientras no hay certificador, 04. EN CURSO en cuanto lo hay, 11. FINALIZADOS
// al terminar. Si aquí se decidiera distinto, la etiqueta de la lista y la
// carpeta en la que está el expediente contarían dos historias del mismo día.

const { rankEstado } = require('./expedienteEstados');

/** Los tres estados que puede tomar una oportunidad YA ACEPTADA. */
const ESTADOS_POST_ACEPTACION = ['ACEPTADA', 'EN CURSO', 'FINALIZADO'];

/**
 * Estado visible de una oportunidad que ya tiene expediente.
 *
 * @param {{ estado?: string, cee?: { certificador_id?: string|null } }} exp
 * @returns {'ACEPTADA'|'EN CURSO'|'FINALIZADO'}
 */
function estadoDesdeExpediente(exp) {
    if (!exp) return 'ACEPTADA';

    const estado = exp.estado;
    if (estado === 'FINALIZADO') return 'FINALIZADO';

    // Un estado que no está en la lista canónica no puede hacer avanzar nada:
    // se queda en ACEPTADA, que es lo único que sabemos seguro (hay expediente).
    if (rankEstado(estado) === -1) return 'ACEPTADA';

    // Recién aceptado y aún sin encargar el CEE: sigue siendo solo "aceptada".
    // El certificador es lo que convierte la aceptación en trabajo en marcha.
    if (estado === 'PTE. CEE INICIAL' && !exp.cee?.certificador_id) return 'ACEPTADA';

    return 'EN CURSO';
}

/**
 * Estado que se PINTA en la lista de oportunidades.
 * Sin expediente manda la captación (`datos_calculo.estado`); con expediente,
 * manda el expediente.
 *
 * @param {string|null|undefined} estadoCaptacion - `datos_calculo.estado`
 * @param {object|null|undefined} exp - expediente de esa oportunidad, si existe
 */
function estadoVisible(estadoCaptacion, exp) {
    if (!exp) return estadoCaptacion || 'PTE ENVIAR';
    return estadoDesdeExpediente(exp);
}

module.exports = { ESTADOS_POST_ACEPTACION, estadoDesdeExpediente, estadoVisible };
