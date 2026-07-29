// ============================================================================
// fincaInputs.js — RESCATE de los datos de la finca (superficie / zona
// climática / nº de plantas) para expedientes que no vienen del simulador.
//
// Problema que resuelve: `datos_calculo.inputs.{superficie,zona,plantas}` solo
// se rellena cuando la oportunidad nace de la CALCULADORA. Un expediente
// MIGRADO (desde XML, desde AppSheet o por las skills de Cowork) crea una
// oportunidad sintética con inputs mínimos (dirección + RC), así que el barrido
// de la Memoria RITE pedía a mano tres datos que la app YA TIENE:
//   · superficie y zona climática → están en el CEE parseado del expediente.
//   · nº de plantas               → sale del Catastro con la referencia
//                                   catastral que el expediente ya guarda.
//
// Regla: NUNCA pisa un valor existente (el usuario puede haberlo corregido a
// mano). Solo rellena huecos, y persiste lo resuelto en la oportunidad para
// que el Catastro se consulte UNA sola vez por expediente (regla 17: nada de
// ráfagas contra el WAF del Catastro).
// ============================================================================

const { getByRC } = require('../services/catastroService');

/** Número positivo o null. Acepta "143", "143,5", 143. */
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
};

/** Texto relleno de verdad o null (mismo criterio que isPresent). */
const str = (v) => {
    const s = String(v === null || v === undefined ? '' : v).trim();
    if (!s || s === '—' || s.includes('_____')) return null;
    return s;
};

/** Primer valor no nulo de una cascada de fuentes. */
const first = (...vals) => vals.find(v => v !== null && v !== undefined) ?? null;

/**
 * Rellena los huecos de `datos_calculo.inputs` con lo que ya se sabe del
 * expediente y, si hace falta, del Catastro.
 *
 * @returns {{ datosCalculo: object, patch: object, fuentes: object }}
 *   `datosCalculo` es una COPIA con los inputs completados (nunca muta el
 *   original); `patch` son solo los campos añadidos (vacío = no había nada que
 *   rescatar); `fuentes` dice de dónde salió cada uno (para el log).
 */
async function resolveFincaInputs({ exp, op, datosCalculo }, supabase, { persist = true } = {}) {
    const dc = JSON.parse(JSON.stringify(datosCalculo || {}));
    dc.inputs = dc.inputs || {};
    const inputs = dc.inputs;

    const cee = exp?.cee || {};
    const ini = (cee.cee_inicial && typeof cee.cee_inicial === 'object') ? cee.cee_inicial : {};
    const fin = (cee.cee_final && typeof cee.cee_final === 'object') ? cee.cee_final : {};

    const patch = {};
    const fuentes = {};

    // ── 1) Fuentes OFFLINE (coste cero): el propio expediente ────────────────
    // El CEE del expediente trae la superficie habitable y la zona climática
    // oficiales del certificador: mejor dato que el Catastro (superficie
    // construida) y sin tocar la red.
    if (!num(inputs.superficie)) {
        const v = first(num(ini.superficieHabitable), num(fin.superficieHabitable));
        if (v) { patch.superficie = v; fuentes.superficie = 'cee'; }
    }
    if (!str(inputs.zona)) {
        // `datos_calculo.zona` (nivel raíz) lo escribe la migración desde XML.
        const v = first(str(dc.zona), str(ini.zonaClimatica), str(fin.zonaClimatica));
        if (v) { patch.zona = v; fuentes.zona = str(dc.zona) ? 'datos_calculo' : 'cee'; }
    }
    // El nº de plantas no consta en el CEE: solo puede venir del Catastro.

    // ── 2) Catastro (una sola petición, solo si aún falta algo) ──────────────
    const faltaAlgo = (!num(inputs.superficie) && !patch.superficie)
        || (!str(inputs.zona) && !patch.zona)
        || !num(inputs.plantas);
    const rc = str(exp?.instalacion?.ref_catastral) || str(op?.ref_catastral) || str(inputs.ref_catastral) || str(inputs.rc);

    if (faltaAlgo && rc) {
        try {
            const finca = await getByRC(rc);
            if (finca) {
                if (!num(inputs.superficie) && !patch.superficie && num(finca.totalSurface)) {
                    patch.superficie = num(finca.totalSurface); fuentes.superficie = 'catastro';
                }
                if (!str(inputs.zona) && !patch.zona && str(finca.climateInfo?.climateZone)) {
                    patch.zona = str(finca.climateInfo.climateZone); fuentes.zona = 'catastro';
                }
                if (!num(inputs.plantas) && num(finca.floors?.total)) {
                    patch.plantas = num(finca.floors.total); fuentes.plantas = 'catastro';
                }
            }
        } catch (e) {
            // El Catastro puede estar bloqueado por el WAF: no es motivo para
            // tumbar la generación. Lo que no se rescate seguirá saliendo en el
            // barrido de "DATOS FALTANTES", que es el comportamiento correcto.
            console.warn(`[fincaInputs] Catastro no disponible para RC ${rc}:`, e.message);
        }
    }

    if (!Object.keys(patch).length) return { datosCalculo: dc, patch, fuentes };

    Object.assign(inputs, patch);

    // ── 3) Persistir para no repetir el trabajo (ni la petición al Catastro) ──
    // Escritura ATÓMICA por clave (jsonb_set en la RPC): no hace
    // read-modify-write de `datos_calculo` entero, así que no pisa subidas
    // concurrentes a reforma_uploads (regla de oro del proyecto).
    if (persist && op?.id && supabase) {
        try {
            const { error } = await supabase.rpc('oportunidad_merge_inputs', {
                p_id: op.id, p_patch: patch
            });
            if (error) throw new Error(error.message);
            console.log(`[fincaInputs] ${exp?.numero_expediente || op.id}: rescatado`,
                Object.entries(fuentes).map(([k, v]) => `${k}←${v}`).join(', '));
        } catch (e) {
            // Si no se puede guardar, el dato sigue valiendo para ESTA petición.
            console.warn('[fincaInputs] no se pudo persistir el rescate:', e.message);
        }
    }

    return { datosCalculo: dc, patch, fuentes };
}

module.exports = { resolveFincaInputs };
