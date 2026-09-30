/**
 * scopRedondeo — el SCOP se GUARDA con dos decimales.
 *
 * Es lo que declara la ficha del fabricante y lo que imprimen el CIFO y las
 * fichas; y como las fórmulas del ahorro también redondean, un SCOP guardado con
 * tres decimales hacía que el formulario enseñara «4,017» mientras el documento
 * decía «4,02». El redondeo NO se reescribe aquí: se importa `redondeaScop` de
 * calculation.js (ESM, igual que hace cifoService con cifoDoc), la misma función
 * de las fórmulas y los documentos. Dos redondeos acabarían en dos números.
 *
 * Solo toca los campos NUMÉRICOS de SCOP (`scop`, `scop_propio`, el `scop` de cada
 * equipo en cascada y el de la piscina), y conserva su tipo: un SCOP guardado como
 * texto sigue siendo texto. `scop_temporada` ('calido' | 'medio') no se toca.
 */
const path = require('path');
const { pathToFileURL } = require('url');

let _calc = null;
function calc() {
    if (!_calc) {
        _calc = import(pathToFileURL(
            path.join(__dirname, '../../frontend/src/features/calculator/logic/calculation.js')).href);
    }
    return _calc;
}

function redondear(v, r2) {
    if (v === null || v === undefined || v === '') return v;
    const n = r2(v);
    if (!Number.isFinite(n)) return v;
    return typeof v === 'string' ? String(n) : n;
}

function nodo(n, r2) {
    if (!n || typeof n !== 'object') return n;
    const out = { ...n };
    for (const k of ['scop', 'scop_propio']) if (k in out) out[k] = redondear(out[k], r2);
    if (Array.isArray(out.equipos_extra)) {
        out.equipos_extra = out.equipos_extra.map((u) => (u && typeof u === 'object' && 'scop' in u
            ? { ...u, scop: redondear(u.scop, r2) } : u));
    }
    return out;
}

/** La instalación de un expediente con sus SCOP a dos decimales (devuelve una copia). */
async function redondearScopsInstalacion(inst) {
    if (!inst || typeof inst !== 'object') return inst;
    const { redondeaScop } = await calc();
    const out = { ...inst };
    for (const k of ['aerotermia_cal', 'aerotermia_acs']) if (out[k]) out[k] = nodo(out[k], redondeaScop);
    if (out.piscina && typeof out.piscina === 'object' && 'scop' in out.piscina) {
        out.piscina = { ...out.piscina, scop: redondear(out.piscina.scop, redondeaScop) };
    }
    return out;
}

/** Los inputs de una oportunidad (calculadora) con `scopHeating` y `scopAcs` a dos decimales. */
async function redondearScopsInputs(inputs) {
    if (!inputs || typeof inputs !== 'object') return inputs;
    const { redondeaScop } = await calc();
    const out = { ...inputs };
    for (const k of ['scopHeating', 'scopAcs', 'scopPool']) if (k in out) out[k] = redondear(out[k], redondeaScop);
    return out;
}

module.exports = { redondearScopsInstalacion, redondearScopsInputs };
