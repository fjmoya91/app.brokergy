// Prueba de la negociación con Autofirma — features/firma/autofirma.js
//
// Qué se comprueba, y por qué cada cosa importa:
//   1. Si el WebSocket no responde, se firma igual por el servidor intermedio.
//      Es el caso que tenía a los clientes parados: Autofirma instalada, pero el
//      `wss://127.0.0.1` sin abrirse (certificado local caducado, versión antigua…).
//   2. Si el firmante CANCELA, no se vuelve a abrir Autofirma encima.
//   3. Un documento grande no pierde medio minuto probando el WebSocket.
//   4. El modo compatible rebaja la versión del protocolo (Autofirma antiguas)
//      y NO va automático: encadenarlo pone al firmante a esperar otro minuto.
//   5. Los servlets que se declaran son los NUESTROS (/api/...) y solo en el
//      camino que los usa.
//   6. Los diálogos propios de autoscript quedan apagados, o se comen el error y
//      el fallback no llega a dispararse.
//
//   node implementation/backend/scripts/test_autofirma_caminos.mjs

import assert from 'node:assert/strict';

// ── DOM mínimo: el módulo solo necesita window/document/navigator/fetch ──────
const ventana = {
    location: { origin: 'https://app.brokergy.es' },
    SupportDialog: { enableSupportDialog(v) { ventana.__dialogos = v; } },
};
globalThis.window = ventana;
globalThis.document = { createElement: () => ({}), head: { appendChild() { } } };
// Node ya trae `navigator` de solo lectura (>=21); solo se define si falta.
if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'test', platform: 'test' } });
}
globalThis.fetch = async () => ({ ok: true });

const { firmarConAutofirma, clasificarError, explicarError, CAMINOS } =
    await import('../../frontend/src/features/firma/autofirma.js');

// ── Autofirma de mentira: se le dice qué hace en cada intento ────────────────
function montarAutoScript(guion) {
    const traza = [];
    let i = 0;
    ventana.AutoScript = {
        AUTOFIRMA_CONNECTION_RETRIES: 15,
        setForceWSMode(v) { traza.push({ paso: 'forceWSMode', v }); },
        setServlets(s, r) { traza.push({ paso: 'setServlets', s, r }); },
        cargarAppAfirma() { traza.push({ paso: 'cargar', ver: ventana.AFIRMA_PROTOCOL_VERSION }); },
        getErrorCode() { return ''; },
        sign(_dat, _alg, _fmt, _params, ok, ko) {
            const acto = guion[Math.min(i, guion.length - 1)];
            i++;
            traza.push({ paso: 'sign', acto: acto.tipo });
            if (acto.tipo === 'ok') return ok('RklSTUFETw==');
            return ko(acto.tipo, acto.mensaje, acto.codigo);
        },
    };
    return traza;
}

const pdfPequeno = 'A'.repeat(1000);
const pdfGrande = 'A'.repeat(6 * 1024 * 1024);
const caminos = (t) => t.filter(x => x.paso === 'cargar').length;

let fallos = 0;
const prueba = async (nombre, fn) => {
    try { await fn(); console.log('  ✓ ' + nombre); }
    catch (e) { fallos++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
};

console.log('\nNegociación con Autofirma\n');

await prueba('el WebSocket que no responde cae al servidor intermedio y firma', async () => {
    const traza = montarAutoScript([
        { tipo: 'es.gob.afirma.standalone.ApplicationNotFoundException', mensaje: 'No se pudo invocar', codigo: 'AS620017' },
        { tipo: 'ok' },
    ]);
    const vistos = [];
    const { firmado, camino } = await firmarConAutofirma({
        pdfBase64: pdfPequeno, extraParams: 'x=1', onCamino: (c) => vistos.push(c),
    });
    assert.equal(firmado, 'RklSTUFETw==');
    assert.equal(camino, CAMINOS.SERVIDOR, 'debería haber firmado por el servidor intermedio');
    assert.deepEqual(vistos, [CAMINOS.WEBSOCKET, CAMINOS.SERVIDOR]);
    const servlets = traza.find(x => x.paso === 'setServlets');
    assert.ok(servlets, 'no se declararon los servlets propios');
    assert.equal(servlets.s, 'https://app.brokergy.es/api/afirma-signature-storage/StorageService');
    assert.equal(servlets.r, 'https://app.brokergy.es/api/afirma-signature-retriever/RetrieveService');
});

await prueba('el firmante que CANCELA no ve Autofirma abrirse otra vez', async () => {
    const traza = montarAutoScript([
        { tipo: 'es.gob.afirma.core.AOCancelledOperationException', mensaje: 'Operacion cancelada por el usuario', codigo: 'AS500001' },
        { tipo: 'ok' },
    ]);
    await assert.rejects(() => firmarConAutofirma({ pdfBase64: pdfPequeno, extraParams: 'x=1' }));
    assert.equal(caminos(traza), 1, 'se reintentó una firma que el usuario había cancelado');
});

await prueba('un certificado que no sirve tampoco se reintenta', async () => {
    const traza = montarAutoScript([
        { tipo: 'java.security.KeyException', mensaje: 'No se ha podido acceder al almacen de certificados', codigo: '' },
        { tipo: 'ok' },
    ]);
    await assert.rejects(() => firmarConAutofirma({ pdfBase64: pdfPequeno, extraParams: 'x=1' }));
    assert.equal(caminos(traza), 1);
});

await prueba('un documento grande no pierde tiempo probando el WebSocket', async () => {
    const traza = montarAutoScript([{ tipo: 'ok' }]);
    const vistos = [];
    await firmarConAutofirma({ pdfBase64: pdfGrande, extraParams: 'x=1', onCamino: (c) => vistos.push(c) });
    assert.deepEqual(vistos, [CAMINOS.SERVIDOR], 'un documento grande no debe probar el WebSocket');
    assert.ok(traza.some(x => x.paso === 'setServlets'));
});

await prueba('el fichero que no cabe por WebSocket (AS620018) se reintenta por servidor', async () => {
    montarAutoScript([
        { tipo: 'java.lang.OutOfMemoryError', mensaje: 'excede de la memoria disponible', codigo: 'AS620018' },
        { tipo: 'ok' },
    ]);
    const { camino } = await firmarConAutofirma({ pdfBase64: pdfPequeno, extraParams: 'x=1' });
    assert.equal(camino, CAMINOS.SERVIDOR);
});

await prueba('automáticos van DOS caminos, no tres (el tercero alarga la espera de todos)', async () => {
    const traza = montarAutoScript([{ tipo: 'error', mensaje: 'No se pudo conectar', codigo: 'AS620017' }]);
    const e = await firmarConAutofirma({ pdfBase64: pdfPequeno, extraParams: 'x=1' }).then(() => null, (x) => x);
    assert.ok(e, 'debería haber fallado');
    assert.deepEqual(e.afirma.caminosProbados, [CAMINOS.WEBSOCKET, CAMINOS.SERVIDOR]);
    assert.equal(caminos(traza), 2);
    const exp = explicarError(e.afirma);
    assert.ok(exp.instalar, 'debe ofrecer la descarga de Autofirma');
    assert.ok(exp.compat, 'debe ofrecer el modo compatible para Autofirma antiguas');
    assert.ok(/los dos caminos|ninguno/.test(exp.detalle), 'debe decir que se agotaron las vías: ' + exp.detalle);
    assert.deepEqual(traza.filter(x => x.paso === 'cargar').map(x => x.ver), [4, 4]);
});

await prueba('el modo compatible pide el protocolo antiguo, y solo él', async () => {
    const traza = montarAutoScript([{ tipo: 'ok' }]);
    const { camino } = await firmarConAutofirma({ pdfBase64: pdfPequeno, extraParams: 'x=1', forzarCompat: true });
    assert.equal(camino, CAMINOS.SERVIDOR_COMPAT);
    assert.deepEqual(traza.filter(x => x.paso === 'cargar').map(x => x.ver), [1]);
});

await prueba('probado ya el modo compatible, no se vuelve a ofrecer', () => {
    const exp = explicarError({ codigo: 'AS620017', caminosProbados: [CAMINOS.SERVIDOR_COMPAT] });
    assert.equal(exp.compat, false, 'ofrecería un botón que no lleva a nada nuevo');
});

await prueba('los diálogos propios de autoscript quedan apagados', async () => {
    montarAutoScript([{ tipo: 'ok' }]);
    ventana.__dialogos = undefined;
    await firmarConAutofirma({ pdfBase64: pdfPequeno, extraParams: 'x=1' });
    assert.equal(ventana.__dialogos, false, 'con los diálogos del Gobierno activos el error no llega al fallback');
});

await prueba('cada código de error se clasifica donde toca', () => {
    const casos = [
        [{ codigo: 'AS500001' }, 'usuario'],
        [{ codigo: 'AS620018' }, 'memoria'],
        [{ codigo: 'AS620014' }, 'memoria'],
        [{ codigo: 'AS420002' }, 'comunicacion'],
        [{ codigo: 'AS420503' }, 'comunicacion'],
        [{ codigo: 'AS620017' }, 'comunicacion'],
        // Medido en un navegador real sin Autofirma: el servidor intermedio se rinde
        // con AS620024, que no existía en las versiones antiguas de la librería.
        [{ codigo: 'AS620024' }, 'comunicacion'],
        [{ codigo: 'AS620025' }, 'comunicacion'],
        [{ codigo: 'AS620023' }, 'comunicacion'],
        [{ codigo: 'AS300302' }, 'comunicacion'],
        [{ mensaje: 'Version de protocolo no soportada' }, 'version'],
        [{ tipo: 'es.gob.afirma.core.AOCancelledOperationException' }, 'usuario'],
        [{ tipo: 'es.gob.afirma.standalone.ApplicationNotFoundException' }, 'comunicacion'],
    ];
    for (const [err, esperado] of casos) {
        assert.equal(clasificarError(err), esperado, JSON.stringify(err) + ' → ' + clasificarError(err));
    }
});

await prueba('el parche de autoscript.js lee el override y sin él sigue valiendo 4', async () => {
    // autoscript.js es un fichero VENDORIZADO de 6.000 líneas: el parche son tres
    // líneas idénticas (una por cliente de conexión) y hay que poder comprobar que
    // siguen ahí después de cualquier actualización de la librería.
    const { readFileSync } = await import('node:fs');
    const ruta = new URL('../../frontend/public/autofirma/autoscript.js', import.meta.url);
    const src = readFileSync(ruta, 'utf8');
    const lineas = src.split('\n').filter(l => /var PROTOCOL_VERSION\s*=/.test(l));
    assert.equal(lineas.length, 3, 'autoscript.js debería tener 3 PROTOCOL_VERSION parcheadas, tiene ' + lineas.length);
    for (const linea of lineas) {
        assert.ok(/AFIRMA_PROTOCOL_VERSION/.test(linea), 'sin override: ' + linea.trim());
        const evaluar = (v) => {
            const w = v == null ? {} : { AFIRMA_PROTOCOL_VERSION: v };
            return new Function('window', linea + '\nreturn PROTOCOL_VERSION;')(w);
        };
        assert.equal(evaluar(null), 4, 'sin global debe comportarse como el original');
        assert.equal(evaluar(1), 1, 'el override no se está aplicando');
    }
});

console.log(fallos ? `\n${fallos} prueba(s) FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
