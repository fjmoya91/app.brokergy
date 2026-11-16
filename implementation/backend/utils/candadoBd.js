// =============================================================================
// candadoBd — este PROCESO no escribe en la base de datos.
//
// Local escribe en la Supabase de PRODUCCIÓN, así que lo que solo tiene que MIRAR
// (el seco del contestador, las consultas del investigador del contestador) se
// ejecuta con este candado: `insert`, `update`, `upsert`, `delete` y cualquier
// `rpc` devuelven `{ data: null, error: 'EN SECO: …' }` sin salir del proceso, y se
// apuntan en la lista que devuelve. Las lecturas (`select`) siguen igual.
//
// Lo usaban dentro de `scripts/contestador.js seco`; se saca aquí (16/11/2026) para
// que el investigador del contestador (`scripts/contestador_consultas.js`) sea de
// solo lectura POR CONSTRUCCIÓN, no por buena fe del modelo.
// =============================================================================

/**
 * Pone el candado al cliente de Supabase del backend (el singleton de supabaseClient).
 * @returns {string[]} lo que se ha intentado escribir (se va llenando).
 */
function candado() {
    const supabase = require('../services/supabaseClient');
    if (supabase.__candado) return supabase.__candado;
    const bloqueadas = [];
    const falso = (motivo) => {
        const res = { data: null, error: { message: `EN SECO: ${motivo}` } };
        const p = new Proxy(function () {}, {
            get(_, prop) {
                if (prop === 'then') return (ok, ko) => Promise.resolve(res).then(ok, ko);
                if (prop === 'catch') return (ko) => Promise.resolve(res).catch(ko);
                if (prop === 'finally') return (f) => Promise.resolve(res).finally(f);
                return () => p;
            },
            apply() { return p; },
        });
        return p;
    };
    const fromOriginal = supabase.from.bind(supabase);
    supabase.from = (tabla) => {
        const qb = fromOriginal(tabla);
        for (const op of ['insert', 'update', 'upsert', 'delete']) qb[op] = () => { bloqueadas.push(`${op} ${tabla}`); return falso(op); };
        return qb;
    };
    supabase.rpc = (nombre) => { bloqueadas.push(`rpc ${nombre}`); return falso(nombre); };
    Object.defineProperty(supabase, '__candado', { value: bloqueadas, enumerable: false });
    return bloqueadas;
}

module.exports = { candado };
