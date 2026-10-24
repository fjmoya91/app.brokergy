// El CUARTO origen de la envolvente y del generador: la OBRA de un certificador
// externo (app de certificadores, `ext`, tabla `certapp_obras`). Sin BD ni red:
// donde un servicio habla con Supabase se le pone un doble que apunta qué pide.
//
//   node implementation/backend/scripts/test_origen_ext.mjs
//
// Lo que vigila:
//   1. El MAPA (`ORIGENES`) y `origenNorm`: 'ext' existe, un valor desconocido es
//      un error (400) y nunca el CAE, y los patrones de los números no se pisan.
//   2. `negocioDe` mira la obra externa ANTES que el CEE directo (la obra lleva
//      las dos marcas), y `setCeeField`/`setDocField` van a SUS RPC.
//   3. Una tabla que aún no existe es 503 ORIGEN_SIN_ESQUEMA, no un 500.
//   4. ceeIa: 'ext' es un negocio, su fila sale de su tabla y una obra ARCHIVADA
//      no se pide; el texto del encargo no promete escribir a nadie.
//   5. agenteIa: el aviso de una obra externa (entregada, pendiente o POR
//      CALIFICAR) y sus pendientes.
//   6. ESTÁTICO: en los ficheros de la envolvente y del generador no aparece
//      ninguna tabla ni RPC de los CEE directos o de las obras fuera del mapa.
//   7. (A) La RC de una obra `ext` sale de la BD: la del cuerpo se ignora (geometría,
//      imágenes del Catastro) y no se miden unidades de otra parcela.
//   8. (B) `/cex` de una obra `ext`: 409 OBRA_SIN_PEDIR en BORRADOR o ARCHIVADA, y
//      409 RC_NO_COINCIDE con la geometría de otro edificio (el handler de verdad).
//   9. (C) El tope por CUENTA (429 DEMASIADAS) y una medición a la vez; el equipo
//      interno y los demás orígenes, sin tope.
//  10. (D) El aviso del agente para una obra `ext` no sale sin CERTAPP_AVISOS_ENABLED,
//      y con él no duplica el WhatsApp de `alTerminarIa`.
import Module, { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BACK = path.join(AQUI, '..');

// WhatsApp y email FALSOS, antes de cargar nada: aquí no sale ningún mensaje,
// solo se apunta qué se habría mandado (punto 10).
const ENVIOS = { wa: [], email: [] };
function moduloFalso(rel, propios) {
    const p = require.resolve(rel);
    const m = new Module(p);
    m.filename = p;
    m.loaded = true;
    m.exports = new Proxy(propios, {
        get: (t, k) => (k in t || typeof k === 'symbol' || k === 'then' ? t[k] : async () => null),
    });
    require.cache[p] = m;
}
moduloFalso('../services/whatsappService', { sendText: async (to, texto) => { ENVIOS.wa.push({ to, texto }); return { ok: true }; } });
// El de email es el de verdad (sus piezas de marca componen el aviso), sin envío.
const emailService = require('../services/emailService');
emailService.sendMail = async (o) => { ENVIOS.email.push(o); return { ok: true }; };

const supabase = require('../services/supabaseClient');
const cex = require('../services/ceeEnvolventeCex');
const ceeIa = require('../services/ceeIa');
const agenteIa = require('../services/agenteIa');

let ok = 0;
let fallos = 0;
async function caso(nombre, fn) {
    try { await fn(); ok++; console.log(`✓ ${nombre}`); }
    catch (e) { fallos++; console.log(`✗ ${nombre}\n    ${e.message}`); }
}

/** Sustituye un método del cliente de Supabase durante `fn` y lo devuelve. */
async function conDoble(metodo, doble, fn) {
    const propio = Object.prototype.hasOwnProperty.call(supabase, metodo);
    const antes = supabase[metodo];
    supabase[metodo] = doble;
    try { return await fn(); }
    finally { if (propio) supabase[metodo] = antes; else delete supabase[metodo]; }
}

/** Un `from()` falso: cualquier cadena de filtros acaba en `fila`. Apunta la tabla. */
function fromFalso(fila, apunte) {
    return (tabla) => {
        apunte.tablas.push(tabla);
        const q = {
            select: (s) => { apunte.select = s; return q; },
            eq: (c, v) => { apunte.eq.push([c, v]); return q; },
            maybeSingle: async () => ({ data: fila, error: null }),
        };
        return q;
    };
}

// ─── 1. El mapa y origenNorm ────────────────────────────────────────────────

await caso('el mapa tiene los CUATRO orígenes y está congelado', () => {
    assert.deepEqual(Object.keys(cex.ORIGENES).sort(), ['cae', 'cee', 'ext', 'op']);
    assert.ok(Object.isFrozen(cex.ORIGENES));
    for (const m of Object.values(cex.ORIGENES)) assert.ok(Object.isFrozen(m), `${m.negocio} no está congelado`);
});

await caso('ext: certapp_obras y sus dos RPC, por el id de la obra', () => {
    const m = cex.ORIGENES.ext;
    assert.equal(m.negocio, 'ext');
    assert.equal(m.tabla, 'certapp_obras');
    assert.equal(m.clave, 'numero_expediente');
    assert.equal(m.rutaCee, 'cee');
    assert.equal(m.rpcCee, 'set_certapp_obra_cee_field');
    assert.equal(m.paramIdCee, 'p_obra_id');
    assert.equal(m.rpcDoc, 'set_certapp_obra_doc_field');
    assert.equal(m.paramIdDoc, 'p_obra_id');
    assert.equal(m.idDoc, 'id');
});

await caso('los tres de siempre no han cambiado', () => {
    assert.equal(cex.ORIGENES.cae.tabla, 'expedientes');
    assert.equal(cex.ORIGENES.cae.rpcCee, 'set_expediente_cee_field');
    assert.equal(cex.ORIGENES.cae.paramIdDoc, 'p_oportunidad_id');
    assert.equal(cex.ORIGENES.cae.idDoc, 'oportunidad_id');
    assert.equal(cex.ORIGENES.cee.tabla, 'cee_directos');
    assert.equal(cex.ORIGENES.cee.rpcCee, 'set_cee_directo_cee_field');
    assert.equal(cex.ORIGENES.cee.paramIdCee, 'p_cee_directo_id');
    assert.equal(cex.ORIGENES.cee.paramIdDoc, 'p_id');
    assert.equal(cex.ORIGENES.op.tabla, 'oportunidades');
    assert.equal(cex.ORIGENES.op.rutaCee, 'datos_calculo->envolvente_cee');
    assert.equal(cex.ORIGENES.op.rpcDoc, null);
});

await caso('cada número casa con UN solo patrón (el CAE, con ninguno)', () => {
    const muestras = { '2026EXT_3': 'ext', '2026ext_12': 'ext', '2026CEE_55': 'cee',
                       '26RES060_OP246': 'op', '26RES060_186': null, '26RES080_94': null };
    for (const [num, esperado] of Object.entries(muestras)) {
        const casan = Object.values(cex.ORIGENES).filter(m => m.patron && m.patron.test(num)).map(m => m.negocio);
        assert.deepEqual(casan, esperado ? [esperado] : [], `${num} casa con ${casan.join(',') || 'ninguno'}`);
    }
});

await caso('origenNorm: vacío = CAE, ext en cualquier caja, lo desconocido es 400', () => {
    assert.equal(cex.origenNorm(undefined), 'cae');
    assert.equal(cex.origenNorm(null), 'cae');
    assert.equal(cex.origenNorm(''), 'cae');
    assert.equal(cex.origenNorm('ext'), 'ext');
    assert.equal(cex.origenNorm(' EXT '), 'ext');
    assert.equal(cex.origenNorm('Cee'), 'cee');
    assert.equal(cex.origenNorm('op'), 'op');
    for (const malo of ['externo', 'certapp', 'cee_directos', 'x']) {
        assert.throws(() => cex.origenNorm(malo), (e) => e.status === 400 && e.code === 'ORIGEN_DESCONOCIDO',
                      `«${malo}» debería ser un error`);
    }
});

// ─── 2. negocioDe, el stub y la escritura por el mapa ───────────────────────

await caso('negocioDe: la obra externa ANTES que el CEE directo', () => {
    assert.equal(cex.negocioDe({ es_ext: true, es_cee_directo: true }), 'ext');
    assert.equal(cex.negocioDe({ negocio: 'ext', es_cee_directo: true }), 'ext');
    assert.equal(cex.negocioDe({ es_cee_directo: true }), 'cee');
    assert.equal(cex.negocioDe({ es_oportunidad: true }), 'op');
    assert.equal(cex.negocioDe({}), 'cae');
    assert.equal(cex.esExt({ es_cee_directo: true }), false);
});

await caso('expedienteStub(ext) lleva las dos marcas, como su adaptador', () => {
    const s = cex.expedienteStub('ext', 'u-1');
    assert.equal(s.id, 'u-1');
    assert.equal(s.es_ext, true);
    assert.equal(s.es_cee_directo, true);       // un CEE suelto de alcance único
    assert.equal(cex.negocioDe(s), 'ext');
    assert.equal(cex.tablaDe(s), 'certapp_obras');
    assert.equal(cex.tablaDe('ext'), 'certapp_obras');
    assert.equal(cex.tablaDe(cex.expedienteStub('cee', 'x')), 'cee_directos');
    assert.throws(() => cex.expedienteStub('nada', 'x'), (e) => e.status === 400);
});

await caso('setCeeField(ext) → set_certapp_obra_cee_field con p_obra_id', async () => {
    const llamadas = [];
    await conDoble('rpc', async (fn, args) => { llamadas.push([fn, args]); return { error: null }; }, () =>
        cex.setCeeField(cex.expedienteStub('ext', 'obra-1'), 'agente_ia', { inicial: {} }));
    assert.deepEqual(llamadas, [['set_certapp_obra_cee_field',
        { p_obra_id: 'obra-1', p_field: 'agente_ia', p_value: { inicial: {} } }]]);
});

await caso('setDocField(ext) → set_certapp_obra_doc_field con el id de la obra', async () => {
    const llamadas = [];
    await conDoble('rpc', async (fn, args) => { llamadas.push([fn, args]); return { error: null }; }, () =>
        cex.setDocField(cex.expedienteStub('ext', 'obra-2'), 'fecha_firma_cee_inicial', '2026-10-24'));
    assert.deepEqual(llamadas, [['set_certapp_obra_doc_field',
        { p_obra_id: 'obra-2', p_field: 'fecha_firma_cee_inicial', p_value: '2026-10-24' }]]);
});

await caso('el CAE sigue escribiendo donde siempre (y su documentación, por la oportunidad)', async () => {
    const llamadas = [];
    await conDoble('rpc', async (fn, args) => { llamadas.push([fn, args]); return { error: null }; }, async () => {
        await cex.setCeeField({ id: 'e-1' }, 'envolvente', 1);
        await cex.setDocField({ id: 'e-1', oportunidad_id: 'op-1' }, 'k', 2);
        await cex.setCeeField({ id: 'c-1', es_cee_directo: true }, 'envolvente', 3);
    });
    assert.deepEqual(llamadas, [
        ['set_expediente_cee_field', { p_expediente_id: 'e-1', p_field: 'envolvente', p_value: 1 }],
        ['set_expediente_doc_field', { p_oportunidad_id: 'op-1', p_field: 'k', p_value: 2 }],
        ['set_cee_directo_cee_field', { p_cee_directo_id: 'c-1', p_field: 'envolvente', p_value: 3 }],
    ]);
});

// ─── 3. Sin el SQL aplicado ─────────────────────────────────────────────────

await caso('función inexistente (PGRST202) → 503 ORIGEN_SIN_ESQUEMA, no un 500', async () => {
    await conDoble('rpc', async () => ({ error: { code: 'PGRST202', message: 'Could not find the function' } }), async () => {
        await assert.rejects(cex.setCeeField(cex.expedienteStub('ext', 'o'), 'x', 1),
                             (e) => e.status === 503 && e.code === 'ORIGEN_SIN_ESQUEMA');
    });
    for (const code of ['PGRST205', 'PGRST202', '42P01', '42883']) assert.equal(cex.noExisteEnBd({ code }), true);
    assert.equal(cex.noExisteEnBd({ code: '23505' }), false);
    assert.equal(cex.noExisteEnBd(null), false);
});

await caso('un error cualquiera de BD NO se disfraza de «falta el SQL»', async () => {
    await conDoble('rpc', async () => ({ error: { code: '23514', message: 'check violation' } }), async () => {
        await assert.rejects(cex.setCeeField(cex.expedienteStub('ext', 'o'), 'x', 1),
                             (e) => e.code !== 'ORIGEN_SIN_ESQUEMA' && /check violation/.test(e.message));
    });
});

// ─── 4. ceeIa ───────────────────────────────────────────────────────────────

await caso('ceeIa: un negocio desconocido es 400', async () => {
    await assert.rejects(ceeIa.filaDe('externo', 'x'), (e) => e.status === 400);
});

await caso('ceeIa: la fila de una obra sale de certapp_obras, por su número', async () => {
    const apunte = { tablas: [], eq: [] };
    const fila = { id: 'obra-9', numero_expediente: '2026EXT_9', estado: 'EN_PREPARACION', sub: null, sello: null, ag: null };
    const f = await conDoble('from', fromFalso(fila, apunte), () => ceeIa.filaDe('ext', '2026EXT_9'));
    assert.deepEqual(apunte.tablas, ['certapp_obras']);
    assert.deepEqual(apunte.eq, [['numero_expediente', '2026EXT_9']]);
    assert.match(apunte.select, /estado/);
    assert.equal(f.negocio, 'ext');
    assert.equal(f.ref_id, 'obra-9');
    assert.equal(f.obraEstado, 'EN_PREPARACION');
});

await caso('ceeIa: el CAE no pide la columna «estado» de la obra', async () => {
    const apunte = { tablas: [], eq: [] };
    const fila = { id: 'e-1', numero_expediente: '26RES060_186', sub: 'pte_emitir', sello: null, ag: null };
    const f = await conDoble('from', fromFalso(fila, apunte), () => ceeIa.filaDe('cae', '26RES060_186'));
    assert.deepEqual(apunte.tablas, ['expedientes']);
    assert.doesNotMatch(apunte.select, /, estado/);
    assert.equal(f.subestado, 'PTE_EMITIR');
    assert.equal('obraEstado' in f, false);
});

await caso('ceeIa: una obra ARCHIVADA no se pide (409), antes de tocar la cola', async () => {
    const apunte = { tablas: [], eq: [] };
    const fila = { id: 'obra-3', numero_expediente: '2026EXT_3', estado: 'ARCHIVADA', sub: null, sello: null, ag: null };
    await conDoble('from', fromFalso(fila, apunte), async () => {
        await assert.rejects(ceeIa.pedir({ negocio: 'ext', id: '2026EXT_3', usuario: 'certapp:x' }),
                             (e) => e.status === 409 && e.extra?.code === 'ARCHIVADA');
    });
    assert.deepEqual(apunte.tablas, ['certapp_obras'], 'no debía leer cee_ia_trabajos');
});

await caso('ceeIa: una obra que no existe es 404 «obra»', async () => {
    await conDoble('from', fromFalso(null, { tablas: [], eq: [] }), async () => {
        await assert.rejects(ceeIa.filaDe('ext', '2026EXT_404'), (e) => e.status === 404 && /obra/.test(e.message));
    });
});

await caso('ceeIa: el encargo de una obra no promete escribir a nadie', () => {
    const t = ceeIa.textoEncargo({ clave: '2026EXT_3', usuario: 'certapp:x', negocio: 'ext' });
    assert.match(t, /APP DE CERTIFICADORES/);
    assert.match(t, /CERTIFICADOR EXTERNO/);
    assert.match(t, /no sale NADA/);
    assert.doesNotMatch(t, /prepárame el WhatsApp/);
    assert.doesNotMatch(t, /«sí» de Fran/);
    const cae = ceeIa.textoEncargo({ clave: '26RES060_186', usuario: 'FRAN' });
    assert.match(cae, /BOTÓN CE3X/);
    assert.match(cae, /prepárame el WhatsApp/);
    assert.doesNotMatch(cae, /EXTERNO/);
});

// ─── 5. agenteIa: el aviso de una obra externa ──────────────────────────────

const base = { numero: '2026EXT_3', cliente: 'TITULAR DE PRUEBA', faseLabel: 'CEE', fichero: '2026EXT_3 - CEE_REVISAR.cex',
               enlaces: { app: 'https://cee.example/admin/obras/x' }, avisos: [], delAgente: false,
               tecnicoHumano: 'CERTIFICADOR DE PRUEBA' };

await caso('aviso: pendiente de entregar, con el certificador y sin fase que mover', () => {
    const ext = { certificador: 'CERTIFICADOR DE PRUEBA', entregado: false, porCalificar: false, motivoEntrega: null };
    const m = agenteIa.componerAviso({ ...base, pendientes: agenteIa.pendientesExt(ext), externo: ext });
    assert.match(m.whatsapp, /APP DE CERTIFICADORES/);
    assert.match(m.whatsapp, /PENDIENTE DE ENTREGAR/);
    assert.match(m.whatsapp, /CERTIFICADOR DE PRUEBA/);
    assert.match(m.asunto, /app de certificadores/);
    assert.doesNotMatch(m.whatsapp, /PENDIENTE DE REVISIÓN/);
});

await caso('aviso: entregado solo', () => {
    const ext = { certificador: 'C', entregado: true, porCalificar: false, motivoEntrega: null };
    const m = agenteIa.componerAviso({ ...base, pendientes: agenteIa.pendientesExt(ext), externo: ext });
    assert.match(m.whatsapp, /ENTREGADO\* sola/);
    assert.match(agenteIa.pendientesExt(ext)[0], /ENTREGADO/);
});

await caso('aviso: sin calificar con CE3X NO dice «listo para entregar» y pide calificarlo', () => {
    const ext = { certificador: 'C', entregado: false, porCalificar: true, motivoEntrega: null };
    const pend = agenteIa.pendientesExt(ext);
    assert.match(pend[0], /CALIFICARLO en el PC/);
    const m = agenteIa.componerAviso({ ...base, pendientes: pend, externo: ext });
    assert.match(m.whatsapp, /NO está calificado con CE3X/);
    assert.doesNotMatch(m.whatsapp, /entrega automática ha fallado/);
    assert.match(m.html, /por calificar en el PC/);
});

await caso('aviso: la entrega automática fallida se dice con su motivo', () => {
    const ext = { certificador: 'C', entregado: false, porCalificar: false, motivoEntrega: 'sin carpeta' };
    const m = agenteIa.componerAviso({ ...base, pendientes: agenteIa.pendientesExt(ext), externo: ext });
    assert.match(m.whatsapp, /entrega automática ha fallado: sin carpeta/);
});

await caso('aviso del CAE: el de siempre (sin «app de certificadores»)', () => {
    const m = agenteIa.componerAviso({ ...base, numero: '26RES060_186', delAgente: true, pendientes: ['x'] });
    assert.doesNotMatch(m.whatsapp, /APP DE CERTIFICADORES/);
    assert.match(m.whatsapp, /PENDIENTE DE REVISIÓN/);
});

await caso('el agente no pone una fase FINAL en una obra', async () => {
    await assert.rejects(agenteIa.terminar({ negocio: 'ext', clave: '2026EXT_3', fase: 'final' }), /fase final/);
    await assert.rejects(agenteIa.empezar({ negocio: 'ext', clave: '2026EXT_3', fase: 'final' }), /fase final/);
    await assert.rejects(agenteIa.esperar({ negocio: 'ext', clave: '2026EXT_3', fase: 'final', que: 'x' }), /fase final/);
});

// ─── 6. ESTÁTICO: las tablas de los CEE directos y de las obras, solo en el mapa ──
//
// Una tabla escrita a mano es por donde un origen nuevo se cuela en la tabla de
// otro (la obra acabaría en `cee_directos` con un uuid que allí no existe). En
// estos ficheros la tabla y la RPC de cada origen salen de `ORIGENES`.
//
// Excepciones justificadas (y SOLO éstas):
//   · el propio bloque `const ORIGENES = Object.freeze({ … });` de ceeEnvolventeCex.js;
//   · los comentarios (explican de qué tabla se habla);
//   · `certapp_cuentas` y `certapp_eventos` no cuentan: no son la tabla de un
//     origen (la cuenta del certificador y el rastro de la obra), y solo los usa
//     el agente para el aviso y el evento IA_HECHA.
const PROHIBIDO = /\bcee_directos\b|\bset_cee_directo_[a-z_]+|\bcertapp_obras\b/g;
const FICHEROS = [
    'services/ceeEnvolventeCex.js',
    'routes/ceeEnvolvente.js',
    'services/paredFotoService.js',
    'services/croquisMovil.js',
    'services/agenteIa.js',
    'services/ceeIa.js',
    'scripts/cee_inicial.js',
    'scripts/agente_ia.js',
    ...fs.readdirSync(path.join(BACK, 'services/cee')).filter(f => f.endsWith('.js')).map(f => `services/cee/${f}`),
];

/** El código sin comentarios, conservando los saltos de línea (para dar la línea). */
function sinComentarios(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/^([ \t]*)\/\/.*$/gm, '$1');
}

/** Quita el bloque del mapa (solo en ceeEnvolventeCex.js), conservando las líneas. */
function sinMapa(src) {
    const ini = src.indexOf('const ORIGENES = Object.freeze({');
    if (ini < 0) throw new Error('ceeEnvolventeCex.js ya no declara `const ORIGENES = Object.freeze({`');
    const fin = src.indexOf('\n});', ini);
    if (fin < 0) throw new Error('no encuentro el cierre del mapa ORIGENES');
    return src.slice(0, ini) + src.slice(ini, fin + 4).replace(/[^\n]/g, ' ') + src.slice(fin + 4);
}

await caso(`ESTÁTICO: ninguna tabla/RPC de cee_directos o certapp_obras fuera del mapa (${FICHEROS.length} ficheros)`, () => {
    const malos = [];
    for (const rel of FICHEROS) {
        const abs = path.join(BACK, rel);
        if (!fs.existsSync(abs)) { malos.push(`${rel}: NO EXISTE (¿se ha movido? actualiza la lista)`); continue; }
        let src = sinComentarios(fs.readFileSync(abs, 'utf8'));
        if (rel === 'services/ceeEnvolventeCex.js') src = sinMapa(src);
        src.split('\n').forEach((linea, i) => {
            for (const m of linea.matchAll(PROHIBIDO)) malos.push(`${rel}:${i + 1}  «${m[0]}»  ${linea.trim().slice(0, 110)}`);
        });
    }
    assert.equal(malos.length, 0, `fuera del mapa:\n      ${malos.join('\n      ')}`);
});

await caso('ESTÁTICO: el mapa sigue nombrando las cuatro tablas (el test de arriba no mira en vacío)', () => {
    const src = fs.readFileSync(path.join(BACK, 'services/ceeEnvolventeCex.js'), 'utf8');
    const ini = src.indexOf('const ORIGENES = Object.freeze({');
    const bloque = src.slice(ini, src.indexOf('\n});', ini));
    for (const t of ["'expedientes'", "'cee_directos'", "'certapp_obras'", "'oportunidades'"]) {
        assert.ok(bloque.includes(t), `el mapa no nombra ${t}`);
    }
});

await caso('ESTÁTICO: el número de la obra se reconoce por el MAPA (sin el patrón copiado)', () => {
    const copia = /\\d\{4\}EXT_/;
    const donde = ['scripts/cee_inicial.js', 'scripts/agente_ia.js', 'services/agenteIa.js', 'services/ceeIa.js',
                   'services/asistenteApp.js', 'routes/ceeEnvolvente.js']
        .filter(rel => copia.test(sinComentarios(fs.readFileSync(path.join(BACK, rel), 'utf8'))));
    assert.deepEqual(donde, []);
    for (const rel of ['scripts/cee_inicial.js', 'scripts/agente_ia.js']) {
        assert.match(fs.readFileSync(path.join(BACK, rel), 'utf8'), /ORIGENES\)\)?\s*\{[\s\S]{0,80}patron/,
                     `${rel} ya no deduce el origen por los patrones del mapa`);
    }
});

// ─── 7-9. La ruta de la envolvente con origen `ext` (A, B, C) ────────────────

const rutaEnv = require('../routes/ceeEnvolvente');
const P = rutaEnv._pruebasExt;
const RUTA_SRC = fs.readFileSync(path.join(BACK, 'routes/ceeEnvolvente.js'), 'utf8');
const RC_OBRA = '9302601VJ7190S0001XY';     // 20: parcela + vivienda
const RC_OTRA = '0005703VJ8100N0001AB';

/** Sustituye métodos de un objeto durante `fn` y los devuelve. */
async function conMetodos(obj, nuevos, fn) {
    const antes = {};
    for (const k of Object.keys(nuevos)) { antes[k] = obj[k]; obj[k] = nuevos[k]; }
    try { return await fn(); }
    finally { for (const k of Object.keys(nuevos)) obj[k] = antes[k]; }
}

/** El motor falso: apunta el cuerpo de cada petición y contesta 200. */
async function conMotor(fn) {
    const pedidos = [];
    const antes = globalThis.fetch;
    globalThis.fetch = async (url, opts = {}) => {
        pedidos.push({ url: String(url), cuerpo: opts.body ? JSON.parse(opts.body) : null });
        return { ok: true, status: 200, json: async () => ({ plantas: [] }), headers: new Map() };
    };
    try { await fn(pedidos); }
    finally { globalThis.fetch = antes; }
}

const ctxObra = (extra = {}) => ({
    expediente: { id: 'obra-1', numero_expediente: '2026EXT_1', es_ext: true, es_cee_directo: true, negocio: 'ext',
                  estado: 'EN_PREPARACION', ref_catastral: RC_OBRA, instalacion: { ref_catastral: RC_OBRA }, ...extra },
    driveFolderId: null, modelos: {},
});
const trabajoConAnexo = { ajustes: { anexos: [RC_OTRA] } };

await caso('A · ext: la RC que va al motor es la de la BD; la del cuerpo se ignora', async () => {
    await conMetodos(cex, {
        cargarExpediente: async () => ctxObra(),
        construccionesElegidas: async () => null,
        leerTrabajo: async () => trabajoConAnexo,
    }, () => conMotor(async (pedidos) => {
        const r = await P.pedirGeometria('obra-1', 'ext', { referencia_catastral: RC_OTRA });
        assert.equal(r.status, 200);
        assert.equal(pedidos.length, 1);
        assert.equal(pedidos[0].cuerpo.referencia_catastral, RC_OBRA);
        assert.equal('anexos' in pedidos[0].cuerpo, false, 'una obra ext no mide unidades de otra parcela');
    }));
});

await caso('A · ext: sin RC en la obra es 400 aunque el cuerpo traiga una; sin obra, 404', async () => {
    await conMetodos(cex, {
        cargarExpediente: async () => ctxObra({ ref_catastral: null, instalacion: {} }),
        construccionesElegidas: async () => null, leerTrabajo: async () => null,
    }, () => conMotor(async (pedidos) => {
        const r = await P.pedirGeometria('obra-1', 'ext', { referencia_catastral: RC_OTRA });
        assert.equal(r.status, 400);
        assert.equal(pedidos.length, 0, 'no debía preguntar a Catastro');
    }));
    await conMetodos(cex, { cargarExpediente: async () => null }, () => conMotor(async (pedidos) => {
        const r = await P.pedirGeometria('obra-x', 'ext', { referencia_catastral: RC_OTRA });
        assert.equal(r.status, 404);
        assert.equal(pedidos.length, 0);
    }));
});

await caso('A · el CAE no cambia: la RC del cuerpo manda y los anexos viajan', async () => {
    await conMetodos(cex, {
        cargarExpediente: async () => ({ expediente: { id: 'e-1', instalacion: { ref_catastral: RC_OBRA } } }),
        construccionesElegidas: async () => null,
        leerTrabajo: async () => trabajoConAnexo,
    }, () => conMotor(async (pedidos) => {
        await P.pedirGeometria('e-1', 'cae', { referencia_catastral: RC_OTRA });
        assert.equal(pedidos[0].cuerpo.referencia_catastral, RC_OTRA);
        assert.deepEqual(pedidos[0].cuerpo.anexos.map(a => a.referencia_catastral), [RC_OTRA]);
    }));
});

await caso('A · las imágenes del Catastro de una obra ext salen de SU RC (rcDe)', () => {
    const geo = { referencia_catastral: { inmueble: RC_OTRA, completa: RC_OTRA } };
    assert.equal(cex.rcDe(ctxObra(), geo), RC_OBRA);
    assert.equal(cex.rcDe({ expediente: { instalacion: { ref_catastral: RC_OBRA } } }, geo), RC_OTRA, 'el CAE, como siempre');
    assert.equal(P.rcFijadaExt({ expediente: { ref_catastral: ' 9302601 vj7190s ' } }), '9302601VJ7190S');
});

await caso('B · obraSinPedir: BORRADOR, ARCHIVADA o sin estado → 409 OBRA_SIN_PEDIR; pedida, pasa', () => {
    for (const estado of ['BORRADOR', 'ARCHIVADA', 'borrador', null, undefined, '']) {
        const c = P.obraSinPedir({ estado });
        assert.ok(c, `${estado} debería cortar`);
        assert.equal(c.status, 409);
        assert.equal(c.code, 'OBRA_SIN_PEDIR');
        assert.ok(c.error.length > 20);
    }
    assert.match(P.obraSinPedir({ estado: 'ARCHIVADA' }).error, /archivada/);
    for (const estado of ['EN_PREPARACION', 'LISTO', 'VALIDADO']) assert.equal(P.obraSinPedir({ estado }), null, estado);
});

await caso('B · la geometría tiene que ser de la RC de la obra (parcela y, si la hay, vivienda)', () => {
    const geo = (r) => ({ referencia_catastral: r });
    assert.equal(P.geometriaDeOtraRc(geo({ entrada: RC_OBRA, refcat_parcela: RC_OBRA.slice(0, 14), refcat_inmueble: RC_OBRA }), RC_OBRA), null);
    assert.equal(P.geometriaDeOtraRc(geo({ refcat_parcela: RC_OBRA.slice(0, 14), refcat_inmueble: null }), RC_OBRA), null);
    assert.ok(P.geometriaDeOtraRc(geo({ refcat_parcela: RC_OTRA.slice(0, 14) }), RC_OBRA));
    assert.ok(P.geometriaDeOtraRc(geo({ refcat_parcela: RC_OBRA.slice(0, 14), refcat_inmueble: `${RC_OBRA.slice(0, 14)}0002ZZ` }), RC_OBRA),
              'otra vivienda de la misma parcela');
    assert.ok(P.geometriaDeOtraRc(geo({ refcat_parcela: RC_OBRA.slice(0, 14), inmueble: RC_OTRA }), RC_OBRA), 'una RC colada en «inmueble»');
    assert.ok(P.geometriaDeOtraRc({}, RC_OBRA), 'sin RC en la geometría no se da por buena');
    assert.ok(P.geometriaDeOtraRc(geo({ refcat_parcela: RC_OBRA.slice(0, 14) }), ''), 'obra sin RC');
});

/** El último handler de una ruta del router (el de la ruta, sin guardianes). */
function handlerDe(metodo, ruta) {
    const capa = rutaEnv.stack.find(l => l.route?.path === ruta && l.route.methods[metodo]);
    assert.ok(capa, `no encuentro ${metodo.toUpperCase()} ${ruta}`);
    return capa.route.stack[capa.route.stack.length - 1].handle;
}
function resFalsa() {
    const r = new EventEmitter();
    Object.assign(r, { statusCode: 200, body: undefined, headers: {},
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; this.emit('finish'); return this; },
        send(b) { this.body = b; this.emit('finish'); return this; },
        set(k, v) { this.headers[k] = v; return this; } });
    return r;
}
const geoDe = (rc) => ({ referencia_catastral: { entrada: rc, refcat_parcela: rc.slice(0, 14), refcat_inmueble: rc } });

await caso('B · POST /cex de una obra en BORRADOR → 409 OBRA_SIN_PEDIR, sin componer la ficha', async () => {
    const h = handlerDe('post', '/:expedienteId/cex');
    const compuestas = [];
    for (const estado of ['BORRADOR', 'ARCHIVADA']) {
        const res = resFalsa();
        await conMetodos(cex, {
            cargarExpediente: async () => ctxObra({ estado }),
            componerFicha: async () => { compuestas.push(estado); throw new Error('no debía llegar'); },
        }, () => h({ params: { expedienteId: 'obra-1' }, query: {}, body: { geometria: geoDe(RC_OBRA) },
                     _origenEnvolvente: 'ext', user: null }, res));
        assert.equal(res.statusCode, 409, estado);
        assert.equal(res.body.code, 'OBRA_SIN_PEDIR', estado);
    }
    assert.deepEqual(compuestas, []);
});

await caso('B · POST /cex de una obra pedida con la geometría de OTRO edificio → 409 RC_NO_COINCIDE', async () => {
    const h = handlerDe('post', '/:expedienteId/cex');
    const res = resFalsa();
    await conMetodos(cex, { cargarExpediente: async () => ctxObra({ estado: 'LISTO' }) },
        () => h({ params: { expedienteId: 'obra-1' }, query: {}, body: { geometria: geoDe(RC_OTRA) },
                  _origenEnvolvente: 'ext', user: null }, res));
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'RC_NO_COINCIDE');
});

await caso('B · POST /cex de una obra pedida con SU geometría pasa la puerta (sigue al chequeo de Drive)', async () => {
    const h = handlerDe('post', '/:expedienteId/cex');
    const res = resFalsa();
    await conMetodos(cex, { cargarExpediente: async () => ctxObra({ estado: 'VALIDADO' }) },
        () => h({ params: { expedienteId: 'obra-1' }, query: {}, body: { geometria: geoDe(RC_OBRA) },
                  _origenEnvolvente: 'ext', user: null }, res));
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, undefined, 'es el 409 de «sin carpeta de Drive», no el de la obra');
    assert.match(res.body.error, /carpeta de Drive/);
});

await caso('B · el CAE no pasa por la puerta de la obra (un estado raro no le afecta)', async () => {
    const h = handlerDe('post', '/:expedienteId/cex');
    const res = resFalsa();
    await conMetodos(cex, { cargarExpediente: async () => ({ expediente: { id: 'e-1', estado: 'BORRADOR' }, driveFolderId: null }) },
        () => h({ params: { expedienteId: 'e-1' }, query: {}, body: { geometria: geoDe(RC_OTRA) },
                  _origenEnvolvente: 'cae', user: null }, res));
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /carpeta de Drive/);
});

await caso('B · ESTÁTICO: el croquis (entregable) también exige la obra pedida', () => {
    assert.match(RUTA_SRC, /async function croquisDesdeTrabajo[\s\S]{0,600}origen === 'ext'[\s\S]{0,120}obraSinPedir\(ctx\.expediente\)/);
});

await caso('C · tomarTurnoExt: 20 mediciones por hora y cuenta; la 21.ª espera; otra cuenta, aparte', () => {
    P.reiniciar();
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 20; i++) assert.equal(P.tomarTurnoExt('geometria', 'c1', t0 + i).ok, true, `la ${i + 1}.ª`);
    const no = P.tomarTurnoExt('geometria', 'c1', t0 + 100);
    assert.equal(no.ok, false);
    assert.ok(no.esperaS > 3500 && no.esperaS <= 3600, `espera ${no.esperaS}`);
    assert.match(no.error, /máximo de 20 mediciones/);
    assert.equal(P.tomarTurnoExt('geometria', 'c2', t0 + 100).ok, true, 'otra cuenta');
    assert.equal(P.tomarTurnoExt('cex', 'c1', t0 + 100).ok, true, 'otro tope');
    assert.equal(P.tomarTurnoExt('geometria', 'c1', t0 + 60 * 60 * 1000 + 1).ok, true, 'pasada la hora');
    P.reiniciar();
    for (let i = 0; i < 30; i++) assert.equal(P.tomarTurnoExt('fotos_leer', 'c1', t0 + i * 1000).ok, true);
    assert.equal(P.tomarTurnoExt('fotos_leer', 'c1', t0 + 12 * 60 * 60 * 1000).ok, false, 'fotos: 30 al DÍA');
    assert.throws(() => P.tomarTurnoExt('nada', 'c1'), /desconocido/);
    assert.equal(P.LIMITES_EXT.cex.max, 10);
    P.reiniciar();
});

/** Pasa `req` por el middleware: 'next' o la respuesta. */
function pasar(mw, req) {
    const res = resFalsa();
    let siguio = false;
    mw(req, res, () => { siguio = true; });
    return { siguio, res };
}
const reqExt = (cuenta = 'c1') => ({ _origenEnvolvente: 'ext', query: {}, body: {}, certapp: { cuenta: { id: cuenta } } });

await caso('C · /cex: 10 por hora y cuenta, la 11.ª es 429 DEMASIADAS con mensaje amable', () => {
    P.reiniciar();
    const mw = P.limiteExt('cex');
    for (let i = 0; i < 10; i++) assert.equal(pasar(mw, reqExt()).siguio, true, `la ${i + 1}.ª`);
    const { siguio, res } = pasar(mw, reqExt());
    assert.equal(siguio, false);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, 'DEMASIADAS');
    assert.ok(Number(res.headers['Retry-After']) > 0);
    assert.match(res.body.error, /vuelve a intentarlo/);
    assert.equal(pasar(mw, reqExt('c2')).siguio, true, 'otra cuenta no paga por esta');
    P.reiniciar();
});

await caso('C · el equipo interno y los orígenes cae/cee/op no tienen tope', () => {
    P.reiniciar();
    const mw = P.limiteExt('cex');
    for (let i = 0; i < 25; i++) {
        assert.equal(pasar(mw, { _origenEnvolvente: 'ext', query: {}, body: {}, user: { rol_nombre: 'ADMIN' } }).siguio, true);
        assert.equal(pasar(mw, { _origenEnvolvente: 'cae', query: {}, body: {}, certapp: { cuenta: { id: 'c1' } } }).siguio, true);
        assert.equal(pasar(mw, { _origenEnvolvente: 'cee', query: {}, body: {} }).siguio, true);
    }
    P.reiniciar();
});

await caso('C · geometría: UNA a la vez por cuenta (Catastro en serie); al terminar, la siguiente', () => {
    P.reiniciar();
    const mw = P.limiteExt('geometria');
    const a = pasar(mw, reqExt());
    assert.equal(a.siguio, true);
    const b = pasar(mw, reqExt());
    assert.equal(b.siguio, false);
    assert.equal(b.res.statusCode, 429);
    assert.equal(b.res.body.code, 'DEMASIADAS');
    assert.match(b.res.body.error, /en marcha/);
    assert.equal(pasar(mw, reqExt('c2')).siguio, true, 'otra cuenta mide a la vez');
    a.res.emit('finish');
    assert.equal(pasar(mw, reqExt()).siguio, true, 'terminada la primera, entra otra');
    P.reiniciar();
});

await caso('C · ESTÁTICO: las rutas que cuestan llevan su tope, detrás del guardián', () => {
    const rutas = { geometria: 'geometria', croquis: 'croquis', imagenes: 'imagenes', cartografia: 'cartografia',
                    'croquis-movil': 'croquis_movil', cex: 'cex', 'fotos/leer': 'fotos_leer' };
    for (const [ruta, tipo] of Object.entries(rutas)) {
        const re = new RegExp(`router\\.post\\('/:expedienteId/${ruta.replace('/', '\\/')}', internoOExtSuyo, staffSiOportunidad, limiteExt\\('${tipo}'\\)`);
        assert.match(RUTA_SRC, re, `POST /${ruta} sin limiteExt('${tipo}')`);
        assert.ok(P.LIMITES_EXT[tipo], `sin tope definido para ${tipo}`);
    }
});

// ─── 10. agenteIa: el aviso de una obra ext y CERTAPP_AVISOS_ENABLED (D) ─────

/** Un `from()` falso para terminarExt: la obra, la cuenta y el insert del evento. */
function fromAgente(apunte) {
    const obra = { id: 'obra-7', numero_expediente: '2026EXT_7', estado: 'EN_PREPARACION', cuenta_id: 'c7', nombre: 'X',
                   drive_folder_link: null, tit_nombre: 'TITULAR', tit_apellidos: null, agente_ia: null };
    const cuenta = { id: 'c7', email: 'cert@example.com', nombre: 'CERT', apellidos: 'PRUEBA', empresa: null };
    return (tabla) => {
        apunte.tablas.push(tabla);
        const q = {
            select: () => q, eq: () => q,
            maybeSingle: async () => ({ data: tabla === 'certapp_cuentas' ? cuenta : obra, error: null }),
            insert: async (fila) => { apunte.eventos.push({ tabla, fila }); return { error: null }; },
        };
        return q;
    };
}
async function conEnv(vars, fn) {
    const antes = {};
    for (const [k, v] of Object.entries(vars)) { antes[k] = process.env[k]; if (v == null) delete process.env[k]; else process.env[k] = v; }
    try { return await fn(); }
    finally { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

await caso('D · obra ext con CERTAPP_AVISOS_ENABLED apagado: ni WhatsApp ni email (al log)', async () => {
    ENVIOS.wa.length = 0; ENVIOS.email.length = 0;
    const apunte = { tablas: [], eventos: [] };
    const r = await conEnv({ CERTAPP_AVISOS_ENABLED: null, CERTAPP_ENTREGA_AUTO: null, WHATSAPP_ADMIN_CHAT: '000' }, () =>
        conDoble('rpc', async () => ({ error: null }), () =>
            conDoble('from', fromAgente(apunte), () =>
                agenteIa.terminar({ negocio: 'ext', clave: '2026EXT_7', fase: 'inicial', fichero: { nombre: 'f.cex' } }))));
    assert.equal(ENVIOS.wa.length, 0, 'salió un WhatsApp');
    assert.equal(ENVIOS.email.length, 0, 'salió un email');
    assert.match(r.canales.join(' '), /CERTAPP_AVISOS_ENABLED apagado/);
    assert.equal(apunte.eventos.filter(e => e.tabla === 'certapp_eventos').length, 1, 'el evento IA_HECHA sí se apunta');
});

await caso('D · encendido y sin entrega automática: UN WhatsApp (el de la app) y el email; nada duplicado', async () => {
    ENVIOS.wa.length = 0; ENVIOS.email.length = 0;
    const apunte = { tablas: [], eventos: [] };
    const r = await conEnv({ CERTAPP_AVISOS_ENABLED: 'true', CERTAPP_ENTREGA_AUTO: null, WHATSAPP_ADMIN_CHAT: '000' }, () =>
        conDoble('rpc', async () => ({ error: null }), () =>
            conDoble('from', fromAgente(apunte), () =>
                agenteIa.terminar({ negocio: 'ext', clave: '2026EXT_7', fase: 'inicial', fichero: { nombre: 'f.cex' } }))));
    assert.equal(ENVIOS.wa.length, 1, `WhatsApp: ${ENVIOS.wa.length}`);
    assert.match(ENVIOS.wa[0].texto, /2026EXT_7/);
    assert.equal(ENVIOS.email.length, 1);
    assert.equal(r.entrega?.auto, false);
    assert.ok(r.canales.includes('WhatsApp (el de la app)'));
});

await caso('D · encendido pero POR CALIFICAR: no llama a la app y el WhatsApp lo manda el agente (uno)', async () => {
    ENVIOS.wa.length = 0; ENVIOS.email.length = 0;
    const apunte = { tablas: [], eventos: [] };
    const r = await conEnv({ CERTAPP_AVISOS_ENABLED: 'true', CERTAPP_ENTREGA_AUTO: 'true', WHATSAPP_ADMIN_CHAT: '000' }, () =>
        conDoble('rpc', async () => ({ error: null }), () =>
            conDoble('from', fromAgente(apunte), () =>
                agenteIa.terminar({ negocio: 'ext', clave: '2026EXT_7', fase: 'inicial', entregable: false }))));
    assert.equal(r.entrega, null, 'no debía llamar a la entrega');
    assert.equal(ENVIOS.wa.length, 1);
    assert.match(ENVIOS.wa[0].texto, /NO está calificado/);
    assert.equal(ENVIOS.email.length, 1);
});

console.log(`\n${ok} bien · ${fallos} mal`);
process.exit(fallos ? 1 : 0);
