// ─────────────────────────────────────────────────────────────────────────────
// Capado del MARGEN BROKERGY en un `datos_calculo` (estado de la calculadora).
//
// Quita únicamente lo que revela lo que gana Brokergy: precio CAE de venta al
// Sujeto Obligado, comisión de prescriptor y beneficio Brokergy. CONSERVA lo de
// cara al cliente (bono CAE del cliente `caePriceClient`/`caeBonus`, presupuesto,
// energía/demanda).
//
// IMPORTANTE — capado PROFUNDO (recursivo):
// Algunos `datos_calculo` guardan un SNAPSHOT anidado de la calculadora dentro de
// `datos_calculo.inputs` (que a su vez tiene su propio `inputs` y `result`), por lo
// que un borrado plano de primer nivel dejaba escapar el margen por
// `datos_calculo.inputs.inputs.caePriceSO` o `...inputs.result.financials.profitBrokergy`.
// Estas claves son SIEMPRE de margen (nunca guardan dato de cara al cliente), así que
// se borran allá donde aparezcan en el árbol.
// ─────────────────────────────────────────────────────────────────────────────

// Claves de margen a eliminar EN CUALQUIER NIVEL del árbol de datos_calculo.
const MARGIN_KEYS_DEEP = [
    'caePriceSO', 'caePricePrescriptor', 'prescriptorMode', 'caePriceBrokergy',
    'cae_so_rate', 'cae_prescriptor_rate', 'cae_prescriptor_mode',
    'profitBrokergy', 'totalPrescriptor',
];
const MARGIN_DEEP_SET = new Set(MARGIN_KEYS_DEEP);

// Compatibilidad con quien ya importaba estos nombres.
const MARGIN_DATOS      = ['caePriceSO', 'caePricePrescriptor', 'prescriptorMode', 'caePriceBrokergy'];
const MARGIN_INPUTS     = ['cae_so_rate', 'cae_prescriptor_rate', 'cae_prescriptor_mode'];
const MARGIN_FINANCIALS = ['profitBrokergy', 'caePriceBrokergy', 'totalPrescriptor', 'prescriptorMode'];

// Clona en profundidad quitando las claves de margen dondequiera que estén.
// No recorre strings (p.ej. html_propuesta) — solo objetos/arrays.
function deepScrub(value) {
    if (Array.isArray(value)) return value.map(deepScrub);
    if (value && typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) {
            if (MARGIN_DEEP_SET.has(k)) continue; // se elimina el margen a cualquier nivel
            out[k] = deepScrub(value[k]);
        }
        return out;
    }
    return value;
}

function stripDatosCalculoMargin(dc) {
    if (!dc || typeof dc !== 'object') return dc;
    return deepScrub(dc);
}

module.exports = {
    stripDatosCalculoMargin,
    MARGIN_KEYS_DEEP,
    MARGIN_DATOS,
    MARGIN_INPUTS,
    MARGIN_FINANCIALS,
};
