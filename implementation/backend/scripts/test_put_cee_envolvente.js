/**
 * El PUT del expediente (y el del CEE directo) NO pisa lo que escribe la
 * ventana de la ENVOLVENTE desde otra pestaña.
 *
 * Caso real (26RES060_222, 07/10/2026): ficha del expediente abierta a las
 * 18:22 → en otra pestaña se cambian las ventanas de la envolvente y se genera
 * el .cex (18:28) → desde la ficha se encarga el CEE al certificador (18:29), y
 * ese PUT reenviaba `cee` ENTERO con la envolvente de las 18:22: al recargar la
 * envolvente, los cambios no estaban.
 *
 * Monta las rutas REALES con una Supabase simulada en memoria (y el servicio
 * de CEE directos sustituido): no toca la BD ni Drive.
 *   node implementation/backend/scripts/test_put_cee_envolvente.js
 */
const path = require('path');
const assert = require('assert');

// ── Supabase simulada: lo que se lee sale de `filas`, lo que se escribe se anota ──
const filas = {};
const escrito = [];
function consulta(tabla) {
    const q = { tabla, op: 'select', payload: null };
    const resultado = () => {
        if (q.op === 'update') {
            escrito.push({ tabla, payload: q.payload });
            return { data: { ...(filas[tabla] || {}), ...q.payload }, error: null };
        }
        if (q.op === 'insert' || q.op === 'upsert' || q.op === 'delete') return { data: null, error: null };
        return { data: filas[tabla] ?? null, error: null };
    };
    const p = new Proxy(q, {
        get(obj, prop) {
            if (prop === 'then') {
                return (ok, ko) => Promise.resolve(resultado()).then(ok, ko);
            }
            if (['update', 'insert', 'upsert', 'delete'].includes(prop)) {
                return (payload) => { obj.op = prop; obj.payload = payload; return p; };
            }
            return () => p;   // select, eq, single, maybeSingle, order, limit…
        },
    });
    return p;
}
const supabaseFalsa = {
    from: consulta,
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: {} }) }) },
};
const rutaCliente = require.resolve(path.join(__dirname, '../services/supabaseClient'));
require.cache[rutaCliente] = { id: rutaCliente, filename: rutaCliente, loaded: true, exports: supabaseFalsa };

function manejador(router, metodo, ruta) {
    const capa = router.stack.find(l => l.route?.path === ruta && l.route.methods[metodo]);
    assert.ok(capa, `no encuentro ${metodo.toUpperCase()} ${ruta}`);
    const pila = capa.route.stack;
    return pila[pila.length - 1].handle;   // el último: el de la ruta, sin guardianes
}

function respuesta() {
    const r = { statusCode: 200, cuerpo: null };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.cuerpo = b; return r; };
    r.send = (b) => { r.cuerpo = b; return r; };
    return r;
}

const VIEJA = { huecos: { FBS1: [{ nombre: 'V1', estado: 'dudoso' }] }, guardado_at: '2026-10-06T18:44:00Z' };
const NUEVA = { huecos: { FBS1: [{ nombre: 'V1', estado: 'medido', ancho: 1.2 }] }, guardado_at: '2026-10-07T16:28:07Z' };

let fallos = 0;
async function caso(nombre, fn) {
    try { await fn(); console.log(`  ✓ ${nombre}`); }
    catch (e) { fallos++; console.log(`  ✗ ${nombre}\n    ${e.message}`); }
}

(async () => {
    console.log('PUT /api/expedientes/:id');
    const expedientes = require('../routes/expedientes');
    const putExp = manejador(expedientes, 'put', '/:id');
    const ADMIN = { id: 'u1', rol_nombre: 'ADMIN', nombre: 'Prueba' };

    await caso('la envolvente guardada se queda aunque la ficha mande la de cuando se abrió', async () => {
        escrito.length = 0;
        filas.expedientes = {
            id: 'e1', numero_expediente: '26RES060_222', estado: 'PTE. CEE INICIAL',
            seguimiento: {}, instalacion: {}, documentacion: {},
            cee: { certificador_id: null, envolvente: NUEVA,
                   envolvente_fotos: { FBS1: ['nueva'] }, envolvente_imagenes: { fachada: 'nueva' } },
        };
        const res = respuesta();
        await putExp({ params: { id: 'e1' }, user: ADMIN, body: {
            cee: { certificador_id: 'c05b', envolvente: VIEJA,
                   envolvente_fotos: { FBS1: ['vieja'] }, envolvente_imagenes: { fachada: 'vieja' } },
        } }, res);
        const upd = escrito.find(w => w.tabla === 'expedientes' && w.payload?.cee);
        assert.ok(upd, `no se escribió el expediente (respuesta ${res.statusCode}: ${JSON.stringify(res.cuerpo)})`);
        assert.deepStrictEqual(upd.payload.cee.envolvente, NUEVA, 'la envolvente se ha pisado');
        assert.deepStrictEqual(upd.payload.cee.envolvente_fotos, { FBS1: ['nueva'] }, 'las fotos se han pisado');
        assert.deepStrictEqual(upd.payload.cee.envolvente_imagenes, { fachada: 'nueva' }, 'las imágenes se han pisado');
        assert.strictEqual(upd.payload.cee.certificador_id, 'c05b', 'lo demás de `cee` SÍ se guarda');
    });

    await caso('sin envolvente guardada, la ficha no la crea', async () => {
        escrito.length = 0;
        filas.expedientes = { id: 'e2', numero_expediente: 'X', estado: 'PTE. CEE INICIAL',
                              seguimiento: {}, instalacion: {}, documentacion: {}, cee: {} };
        await putExp({ params: { id: 'e2' }, user: ADMIN,
                       body: { cee: { envolvente: VIEJA, dacs_manual: 120 } } }, respuesta());
        const upd = escrito.find(w => w.tabla === 'expedientes' && w.payload?.cee);
        assert.ok(upd, 'no se escribió el expediente');
        assert.ok(!('envolvente' in upd.payload.cee), 'ha aparecido una envolvente que no estaba');
        assert.strictEqual(upd.payload.cee.dacs_manual, 120);
    });

    console.log('PUT /api/cee-directos/:id');
    const svc = require('../services/ceeDirectoService');
    const ceeDirectos = require('../routes/ceeDirectos');
    const putCee = manejador(ceeDirectos, 'put', '/:id');

    await caso('en un CEE directo, igual: envolvente y construcciones se quedan', async () => {
        const guardados = [];
        svc.cargar = async () => ({
            id: 'c1', numero_expediente: '2026CEE_1', seguimiento: {}, documentacion: {},
            cee: { envolvente: NUEVA, construcciones_elegidas: ['1/00/01'] },
        });
        svc.guardar = async (id, patch) => { guardados.push(patch); return { id, ...patch }; };
        await putCee({ params: { id: 'c1' }, user: ADMIN, body: {
            cee: { envolvente: VIEJA, construcciones_elegidas: [], dacs_manual: 90 },
        } }, respuesta());
        const p = guardados[0];
        assert.ok(p?.cee, 'no se guardó el encargo');
        assert.deepStrictEqual(p.cee.envolvente, NUEVA, 'la envolvente se ha pisado');
        assert.deepStrictEqual(p.cee.construcciones_elegidas, ['1/00/01'], 'las construcciones se han pisado');
        assert.strictEqual(p.cee.dacs_manual, 90, 'lo demás de `cee` SÍ se guarda');
    });

    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
