/**
 * ============================================================================
 * Selección ligera de `expedientes.cee` para los listados
 * ============================================================================
 *
 * `cee` guarda además del resumen energético el XML CRUDO del certificado
 * (`xml_inicial` / `xml_final`): 12 MB repartidos en la tabla, hasta 168 kB en
 * una sola fila. Pedir la columna entera obliga a Postgres a descomprimirla
 * completa, y los listados que lo hacían sobre todos los expedientes fueron una
 * de las causas de las caídas de la BD del 21/07/2026.
 *
 * El XML solo se usa en el DETALLE de un expediente (CeeModule,
 * CertificadoRes080Modal, res080Doc.js y services/cifoService.js), que carga la
 * fila por id. Los listados solo necesitan los 11 campos del cálculo económico,
 * que es lo que declara este módulo.
 *
 * Uso:
 *   const { CEE_ECO_SELECT, rebuildCee } = require('../utils/ceeEcoFields');
 *   const { data } = await supabase.from('expedientes').select(`id, ${CEE_ECO_SELECT}`)...
 *   const filas = data.map(rebuildCee);   // deja el objeto `cee` como siempre
 */

// Verificado contra services/expedienteFinancialsNode.js, utils/financialScrub.js
// y frontend/src/features/lotes: ningún consumidor de listado usa otros campos.
const CEE_ECO_FIELDS = [
    'cee_inicial',
    'cee_final',
    'acs_method',
    'num_rooms',
    'superficie_custom',
    'comb_acs_inicial',
    'comb_acs_final',
    'comb_cal_inicial',
    'comb_cal_final',
    'comb_ref_inicial',
    'comb_ref_final',
];

// Prefijo para no chocar con columnas reales del expediente al aplanar el JSON.
const ALIAS_PREFIX = 'ceef_';

/** Fragmento listo para interpolar en un `.select()` de PostgREST. */
const CEE_ECO_SELECT = CEE_ECO_FIELDS.map(f => `${ALIAS_PREFIX}${f}:cee->${f}`).join(', ');

/**
 * Rehace el objeto `cee` a partir de los campos aplanados y quita los alias,
 * de modo que el resto del código siga viendo `row.cee.<campo>` como siempre.
 * Devuelve `cee: null` si el expediente no tiene ningún dato de CEE.
 */
function rebuildCee(row) {
    if (!row) return row;
    const out = { ...row };
    const cee = {};
    let algo = false;
    for (const f of CEE_ECO_FIELDS) {
        const alias = `${ALIAS_PREFIX}${f}`;
        if (alias in out) {
            const v = out[alias];
            delete out[alias];
            if (v !== null && v !== undefined) { cee[f] = v; algo = true; }
        }
    }
    out.cee = algo ? cee : null;
    return out;
}

module.exports = { CEE_ECO_FIELDS, CEE_ECO_SELECT, rebuildCee };
