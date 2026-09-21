// Prueba del troceo de las consultas por ids (utils/consultaLotes.js).
//
// Lo que vigila es el fallo que dejó el listado de clientes diciendo "SIN
// ASIGNAR" en las 410 fichas: la URL de un `.in(...)` con la lista entera pasó
// de 16 KB y PostgREST la rechazó, y la ruta se tragó el error.
//
//   node implementation/backend/scripts/test_consulta_lotes.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { enLotes, LOTE_IDS } = require('../utils/consultaLotes');

let fallos = 0;
const ok = (cond, msg) => { if (!cond) { fallos++; console.log('  ✗', msg); } else console.log('  ✓', msg); };

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ── 1. Trocea y NO se deja nada ──────────────────────────────────────────────
{
    const ids = Array.from({ length: 410 }, (_, i) => uuid(i));
    const vistos = [];
    const filas = await enLotes(ids, (trozo) => {
        vistos.push(trozo.length);
        return Promise.resolve({ data: trozo.map(id => ({ id })) });
    });
    ok(filas.length === 410, `devuelve las 410 filas (${filas.length})`);
    ok(vistos.length === Math.ceil(410 / LOTE_IDS), `las pide en ${Math.ceil(410 / LOTE_IDS)} lotes (${vistos.length})`);
    ok(Math.max(...vistos) <= LOTE_IDS, `ningún lote pasa de ${LOTE_IDS} ids`);
}

// ── 2. La URL de un lote cabe de sobra ───────────────────────────────────────
// 410 UUID medidos en producción = 16.131 caracteres, por encima del tope de
// 16 KB. Un lote tiene que quedarse MUY por debajo.
{
    const uno = Array.from({ length: LOTE_IDS }, (_, i) => uuid(i)).join(',');
    const largo = `https://x.supabase.co/rest/v1/oportunidades?select=id,id_oportunidad,referencia_cliente,cliente_id&cliente_id=in.(${uno})`.length;
    ok(largo < 8000, `la URL de un lote mide ${largo} caracteres (tope 16.384)`);
}

// ── 3. Un lote que falla LANZA, no devuelve media verdad ─────────────────────
{
    let lanzo = false;
    try {
        await enLotes([uuid(1), uuid(2)], () => Promise.resolve({ error: { message: 'HeadersOverflowError' } }));
    } catch (e) {
        lanzo = e?.message === 'HeadersOverflowError';
    }
    ok(lanzo, 'un error del lote se propaga (no se traga)');
}

// ── 4. Casos de borde ────────────────────────────────────────────────────────
{
    ok((await enLotes([], () => { throw new Error('no debería preguntar'); })).length === 0, 'lista vacía: no pregunta nada');
    ok((await enLotes([null, undefined, ''], () => { throw new Error('no debería preguntar'); })).length === 0, 'solo huecos: no pregunta nada');

    let pedidos = null;
    await enLotes([uuid(1), uuid(1), uuid(2)], (t) => { pedidos = t; return Promise.resolve({ data: [] }); });
    ok(pedidos.length === 2, 'los ids repetidos se piden una sola vez');
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
