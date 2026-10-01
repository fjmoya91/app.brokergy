// Pintar el croquis desde el MÓVIL: la sesión en memoria (`services/croquisMovil.js`).
//
//   node implementation/backend/scripts/test_croquis_movil.js
//
// Sin red y sin BD: se abre una sesión, el "teléfono" pinta y el "ordenador"
// espera con la petición LARGA, que tiene que despertarse al instante.

const assert = require('assert');
const cm = require('../services/croquisMovil');

const MUROS = [{ svg: [[2, 2], [16, 2]], tipo: 'FACHADA' }, { svg: [[16, 2], [16, 16]], tipo: 'FACHADA' },
               { svg: [[16, 16], [2, 16]], tipo: 'MEDIANERA' }, { svg: [[2, 16], [2, 2]], tipo: 'FACHADA' }];
const GARAJE = { uso: 'GARAJE', pts: [[1, 1], [17, 1], [17, 7], [1, 7]] };

let fallos = 0;
async function prueba(nombre, fn) {
    try { await fn(); console.log(`  ✓ ${nombre}`); }
    catch (e) { fallos++; console.log(`  ✗ ${nombre}\n    ${e.message}`); }
}

(async () => {
    console.log('croquisMovil');
    const abierto = cm.abrir({ expediente: 'EXP-1', planta: { id: 'PB', nombre: 'Planta baja', nivel: 0 },
                               muros: MUROS, lienzo: { ancho: 18, alto: 18 },
                               catastro: [{ uso: 'APARCAMIENTO', superficie: 122 }],
                               trazos: [], origen: 'https://app.brokergy.es' });
    const { token } = abierto;

    await prueba('el enlace va a la app pública y lleva el token', () => {
        assert.strictEqual(abierto.url, `https://app.brokergy.es/croquis-movil/${token}`);
        assert.match(token, /^[0-9a-f]{32}$/);
    });

    await prueba('al teléfono solo le viaja la geometría', () => {
        const d = cm.paraMovil(token);
        assert.ok(d);
        assert.deepStrictEqual(Object.keys(d).sort(),
            ['catastro', 'clave', 'marco', 'plano', 'planta', 'propuesta', 'resultado', 'trazos', 'usos', 'version']);
        // La clave es un resumen: no lleva el id del expediente.
        assert.match(d.clave, /^[0-9a-f]{20}$/);
        assert.ok(!d.clave.includes('EXP-1'));
        assert.strictEqual(d.plano.muros.length, 4);
    });

    await prueba('la espera del ORDENADOR se despierta en cuanto el teléfono pinta', async () => {
        const v0 = (await cm.esperar(token, 'EXP-1', 0)).version;
        const t0 = Date.now();
        const esperando = cm.esperar(token, 'EXP-1', v0);
        setTimeout(() => cm.actualizar(token, { trazos: [], enCurso: { uso: 'GARAJE', pts: [[1, 1], [5, 1]] } }), 50);
        const r = await esperando;
        assert.ok(Date.now() - t0 < 1000, 'tardó demasiado');
        assert.ok(r.version > v0);
        assert.strictEqual(r.enCurso.pts.length, 2);
        assert.ok(r.movilVisto);
    });

    await prueba('con el token de OTRO expediente no se lee nada', async () => {
        assert.strictEqual((await cm.esperar(token, 'EXP-2', 0)).estado, 'caducada');
        assert.strictEqual(cm.responder(token, 'EXP-2', { ok: true }), false);
    });

    await prueba('lo que no es un número o un uso conocido no se guarda tal cual', () => {
        cm.actualizar(token, { trazos: [GARAJE, { uso: 'PISCINA', pts: [[0, 0], [1, 0], [1, 1]] },
                                        { uso: 'GARAJE', pts: [[0, 0], ['x', 1], [1, 1]] }] });
        const r = cm.paraMovil(token);
        assert.strictEqual(r.trazos.length, 2);
        assert.strictEqual(r.trazos[1].uso, 'ESPACIO NO HABITABLE');
    });

    await prueba('pedir el ajuste lo ve el ordenador, y su respuesta el teléfono', async () => {
        const v = (await cm.esperar(token, 'EXP-1', 0)).version;
        const esperando = cm.esperar(token, 'EXP-1', v);
        const p = cm.pedirAjuste(token, { ajustar: true, trazos: [GARAJE] });
        assert.ok(p.ok);
        const r = await esperando;
        assert.deepStrictEqual(r.pedido, { n: 1, ajustar: true });
        cm.responder(token, 'EXP-1', { n: 1, ok: true, texto: 'Garaje 121,6 m²' });
        const e = cm.estadoMovil(token);
        assert.strictEqual(e.resultado.texto, 'Garaje 121,6 m²');
        // Aplicado: lo pintado ya es zona, y el teléfono arranca limpio.
        assert.strictEqual(cm.paraMovil(token).trazos.length, 0);
    });

    await prueba('el resultado lleva las zonas que han salido, y el teléfono las ve al volver', () => {
        cm.pedirAjuste(token, { ajustar: true, trazos: [GARAJE] });
        cm.responder(token, 'EXP-1', { ok: true, texto: 'ok',
                                       zonas: [{ uso: 'GARAJE', lienzo: GARAJE.pts }, { uso: 'X', lienzo: [[0, 0]] }] });
        const e = cm.estadoMovil(token);
        assert.strictEqual(e.resultado.zonas.length, 1);       // la de un punto no es una zona
        assert.ok(e.resultado.serial >= 2);                     // cada respuesta, un serial nuevo
        assert.strictEqual(cm.paraMovil(token).plano.zonas.length, 1);
    });

    await prueba('al VOLVER A MEDIR, la sesión se queda con las paredes y las zonas de ahora', () => {
        const NUEVOS = [{ svg: [[2, 7], [16, 7]], tipo: 'PARTICION_INTERIOR_VERTICAL' },
                        { svg: [[2, 7], [2, 16]], tipo: 'FACHADA' }];
        cm.responder(token, 'EXP-1', { ok: true, texto: 'ok', remedido: true,
                                       zonas: [{ uso: 'GARAJE', lienzo: GARAJE.pts }],
                                       muros: NUEVOS });
        const d = cm.paraMovil(token);
        assert.strictEqual(d.plano.muros.length, 2);
        assert.strictEqual(d.plano.muros[0].tipo, 'PARTICION_INTERIOR_VERTICAL');
        assert.strictEqual(d.plano.zonas.length, 1);
        // El estado LIGERO dice que se ha vuelto a medir, pero no trae las paredes.
        const e = cm.estadoMovil(token);
        assert.strictEqual(e.resultado.remedido, true);
        assert.ok(!('muros' in e.resultado));
        // Un ajuste que no ha dejado ninguna zona también se cuenta: la planta
        // se ha quedado sin ellas, y el teléfono tiene que dejar de verlas.
        cm.responder(token, 'EXP-1', { ok: false, texto: 'nada', remedido: true, zonas: [], muros: NUEVOS });
        assert.strictEqual(cm.paraMovil(token).plano.zonas.length, 0);
        // Sin paredes válidas no se borran las que había.
        cm.responder(token, 'EXP-1', { ok: false, remedido: true, zonas: [], muros: [{ svg: 'x' }] });
        assert.strictEqual(cm.paraMovil(token).plano.muros.length, 2);
    });

    await prueba('PROPUESTA: viaja saneada al teléfono y se retira al volver a medir', () => {
        const a = cm.abrir({ expediente: 'EXP-P', planta: { id: 'PB', nombre: 'PB', nivel: 0 },
                             muros: MUROS, lienzo: { ancho: 18, alto: 18 },
                             propuesta: [{ uso: 'GARAJE', pts: GARAJE.pts, por_que: 'da a la calle' },
                                         { uso: 'PISCINA', pts: [[0, 0], [1, 0], [1, 1]], por_que: 'x'.repeat(400) },
                                         { uso: 'PORCHE', pts: [[0, 0], [1, 1]] }],
                             origen: 'https://app.brokergy.es' });
        const d = cm.paraMovil(a.token);
        assert.strictEqual(d.propuesta.length, 2);                 // la de dos puntos no es una mancha
        assert.strictEqual(d.propuesta[0].por_que, 'da a la calle');
        assert.strictEqual(d.propuesta[1].uso, 'ESPACIO NO HABITABLE');
        assert.ok(d.propuesta[1].por_que.length <= 200);
        cm.responder(a.token, 'EXP-P', { ok: true, remedido: true, zonas: [{ uso: 'GARAJE', lienzo: GARAJE.pts }],
                                         muros: [{ svg: [[2, 7], [16, 7]], tipo: 'FACHADA' }] });
        assert.strictEqual(cm.paraMovil(a.token).propuesta.length, 0);
        cm.cerrar(a.token, 'EXP-P');
    });

    await prueba('si el ordenador deja de preguntar, el teléfono lo sabe', () => {
        assert.strictEqual(cm.estadoMovil(token).ordenadorAusente, false);
        cm._sesiones.get(token).ordenadorVisto = Date.now() - 60_000;
        assert.strictEqual(cm.estadoMovil(token).ordenadorAusente, true);
    });

    await prueba('sin nada pintado no se pide el ajuste', () => {
        assert.strictEqual(cm.pedirAjuste(token, { trazos: [] }).motivo, 'vacio');
    });

    await prueba('cerrar desde el ordenador lo corta en el teléfono', () => {
        assert.ok(cm.cerrar(token, 'EXP-1'));
        assert.strictEqual(cm.paraMovil(token), null);
        assert.strictEqual(cm.estadoMovil(token).estado, 'cerrada');
        assert.strictEqual(cm.actualizar(token, { trazos: [] }).ok, false);
    });

    await prueba('FOTOS: la sesión sabe de qué paredes y de qué negocio, y nada más', () => {
        const a = cm.abrir({ expediente: 'EXP-9', negocio: 'op', planta: { id: 'PB', nombre: 'PB', nivel: 0 },
                             muros: [{ svg: [[0, 0], [5, 0]], tipo: 'FACHADA', id: 'FBN1', nombre: 'FBN1 CALLE',
                                       largo: 5, alto: 2.8, orientacion: 'N', admite: true, huecos: 0 },
                                     { svg: [[5, 0], [5, 4]], tipo: 'MEDIANERA', id: 'MBE1', admite: false },
                                     { svg: [[0, 4], [0, 0]], tipo: 'FACHADA', id: 'no vale!' }],
                             lienzo: { ancho: 6, alto: 5 } });
        const f = cm.paraFotos(a.token);
        assert.strictEqual(f.negocio, 'op');
        assert.deepStrictEqual(f.paredes.map(p => p.id), ['FBN1', 'MBE1']);   // un id raro no entra
        assert.strictEqual(cm.pared(a.token, 'FBN1').largo, 5);
        assert.strictEqual(cm.pared(a.token, 'OTRA'), null);
        globalThis.__tokFotos = a.token;
    });

    await prueba('FOTOS: se piden huecos, los pone el ordenador y el pedido se RETIRA', async () => {
        const t = globalThis.__tokFotos;
        const H = [{ uid: 'a1b2c3d4', tipo: 'ventana', ancho: 1.2, alto: 1.1,
                     box: { x: 0.1, y: 0.2, ancho: 0.2, alto: 0.3 } }];
        assert.strictEqual(cm.pedirHuecos(t, { pared: 'MBE1', huecos: H }).motivo, 'no_admite');
        assert.strictEqual(cm.pedirHuecos(t, { pared: 'NADA', huecos: H }).motivo, 'pared');
        assert.strictEqual(cm.pedirHuecos(t, { pared: 'FBN1', huecos: [{ uid: '!!' }] }).motivo, 'vacio');
        const v0 = (await cm.esperar(t, 'EXP-9', 0)).version;
        const esperando = cm.esperar(t, 'EXP-9', v0);
        const p = cm.pedirHuecos(t, { pared: 'FBN1', huecos: H, drive_id: '1AbCdEfGhIjKlMnOp' });
        assert.ok(p.ok);
        const d = await esperando;                       // el ordenador se despierta
        assert.strictEqual(d.pedidoHuecos.pared, 'FBN1');
        assert.strictEqual(d.pedidoHuecos.huecos[0].uid, 'a1b2c3d4');
        assert.strictEqual(d.pedidoHuecos.drive_id, '1AbCdEfGhIjKlMnOp');
        // Uno cada vez: el segundo espera a que el ordenador conteste.
        assert.strictEqual(cm.pedirHuecos(t, { pared: 'FBN1', huecos: H }).motivo, 'pendiente');
        cm.responderHuecos(t, 'EXP-9', { n: p.n, ok: true, texto: '1 hueco', pared: 'FBN1', total: 1 });
        const e = cm.estadoMovil(t);
        assert.strictEqual(e.resultadoHuecos.ok, true);
        assert.strictEqual(e.resultadoHuecos.total, 1);
        assert.strictEqual(e.huecosPendientes, false);
        // Si la ventana del ordenador se recarga, no vuelve a ver el pedido.
        assert.strictEqual((await cm.esperar(t, 'EXP-9', 0)).pedidoHuecos, null);
    });

    await prueba('FOTOS: lo que el ordenador cuenta de las paredes le llega al teléfono', () => {
        const t = globalThis.__tokFotos;
        const v = cm.paredesMovil(t).paredesV;
        cm.actualizarParedes(t, 'EXP-9', { FBN1: { nombre: 'FBN1 CALLE', huecos: 3, admite: true } });
        const r = cm.paredesMovil(t);
        assert.strictEqual(r.paredesV, v + 1);
        assert.strictEqual(r.paredes.FBN1.huecos, 3);
        assert.ok(!('svg' in r.paredes.FBN1));           // lo ligero, sin geometría
        // Lo mismo otra vez no cuenta como cambio.
        cm.actualizarParedes(t, 'EXP-9', { FBN1: { nombre: 'FBN1 CALLE', huecos: 3, admite: true } });
        assert.strictEqual(cm.paredesMovil(t).paredesV, v + 1);
        // Con el token de otro expediente, nada.
        assert.strictEqual(cm.actualizarParedes(t, 'EXP-1', { FBN1: { huecos: 9 } }), false);
    });

    await prueba('FOTOS: las lecturas (de pago) tienen tope por sesión', () => {
        const t = globalThis.__tokFotos;
        let n = 0;
        while (cm.gastaLectura(t)) n++;
        assert.strictEqual(n, cm.MAX_LECTURAS);
        assert.ok(cm.puedeSubir(t));
        cm.apuntarFoto(t, { subida: true });
        assert.strictEqual(cm.estadoMovil(t).estado, 'abierta');
    });

    // ── SIN COBERTURA ────────────────────────────────────────────────────────
    const GEO = { bbox: [500000, 4300000, 500030, 4300030], en_el_lienzo: { x: 2, y: 3 } };
    const nueva = (extra = {}) => cm.abrir({ expediente: 'EXP-S', planta: { id: 'PB', nombre: 'PB', nivel: 0 },
                                             muros: MUROS, lienzo: { ancho: 18, alto: 18 }, georef: GEO, ...extra });

    await prueba('SIN RED: el marco del lienzo y una clave ESTABLE de la planta', () => {
        const a = nueva(), b = nueva();
        const da = cm.paraMovil(a.token), db = cm.paraMovil(b.token);
        assert.deepStrictEqual(da.marco, { dx: 499998, y0: 4300033 });
        // Otro QR de la MISMA planta: la misma clave (así se recupera lo pintado).
        assert.strictEqual(da.clave, db.clave);
        const otra = cm.abrir({ expediente: 'EXP-S', planta: { id: 'P1', nombre: 'P1', nivel: 1 },
                                muros: MUROS, lienzo: { ancho: 18, alto: 18 } });
        assert.notStrictEqual(cm.paraMovil(otra.token).clave, da.clave);
        assert.strictEqual(cm.paraMovil(otra.token).marco, null);           // sin georef, sin marco
        [a, b, otra].forEach(x => cm.cerrar(x.token, 'EXP-S'));
    });

    await prueba('SIN RED: el enlace NO caduca mientras el ordenador lo mira, pero tiene tope', async () => {
        const a = nueva();
        const s = cm._sesiones.get(a.token);
        s.caduca = Date.now() + 1000;                       // el teléfono lleva un rato sin decir nada
        await cm.esperar(a.token, 'EXP-S', 0);              // …y el ordenador sigue mirando
        assert.ok(s.caduca > Date.now() + 25 * 60_000, 'no se ha renovado');
        // Pero no más allá del tope desde que se abrió.
        s.nace = Date.now() - (cm.VIDA_MAXIMA_HORAS * 3600_000 - 60_000);
        s.caduca = Date.now() + 1000;
        await cm.esperar(a.token, 'EXP-S', 0);
        assert.ok(s.caduca <= s.nace + cm.VIDA_MAXIMA_HORAS * 3600_000);
        assert.ok(s.caduca < Date.now() + 2 * 60_000);
        cm.cerrar(a.token, 'EXP-S');
    });

    await prueba('SIN RED: un AJUSTE reenviado (se perdió la respuesta) no pide otro', () => {
        const a = nueva();
        const r1 = cm.pedirAjuste(a.token, { trazos: [GARAJE], id_local: 'aj-123456' });
        const r2 = cm.pedirAjuste(a.token, { trazos: [GARAJE], id_local: 'aj-123456' });
        assert.deepStrictEqual(r2, r1);
        assert.strictEqual(cm._sesiones.get(a.token).pedido.n, 1);
        // Otro id sí es otro ajuste.
        assert.strictEqual(cm.pedirAjuste(a.token, { trazos: [GARAJE], id_local: 'aj-999999' }).n, 2);
        // El pedido que ve el ordenador no cambia de forma.
        assert.deepStrictEqual(cm._sesiones.get(a.token).pedido, { n: 2, ajustar: true });
        cm.cerrar(a.token, 'EXP-S');
    });

    await prueba('SIN RED: unos HUECOS reenviados no se ponen dos veces (ni dan «pendiente»)', () => {
        const a = cm.abrir({ expediente: 'EXP-S', planta: { id: 'PB', nombre: 'PB', nivel: 0 },
                             muros: [{ svg: [[0, 0], [5, 0]], tipo: 'FACHADA', id: 'FBN1', admite: true }],
                             lienzo: { ancho: 6, alto: 5 } });
        const H = [{ uid: 'a1b2c3d4', tipo: 'ventana' }];
        const r1 = cm.pedirHuecos(a.token, { pared: 'FBN1', huecos: H, id_local: 'hu-123456' });
        assert.ok(r1.ok);
        // El reenvío del MISMO pedido: lo de entonces, no «pendiente».
        assert.deepStrictEqual(cm.pedirHuecos(a.token, { pared: 'FBN1', huecos: H, id_local: 'hu-123456' }), r1);
        // Uno DISTINTO sí espera a que el ordenador conteste.
        assert.strictEqual(cm.pedirHuecos(a.token, { pared: 'FBN1', huecos: H, id_local: 'hu-777777' }).motivo, 'pendiente');
        cm.responderHuecos(a.token, 'EXP-S', { n: r1.n, ok: true, pared: 'FBN1', total: 1 });
        // Ya puesto: el reenvío tardío sigue sin volver a pedirlo.
        assert.deepStrictEqual(cm.pedirHuecos(a.token, { pared: 'FBN1', huecos: H, id_local: 'hu-123456' }), r1);
        assert.strictEqual(cm._sesiones.get(a.token).pedidoHuecos, null);
        cm.cerrar(a.token, 'EXP-S');
    });

    await prueba('SIN RED: lo «ya hecho» se recuerda con tope, y un id raro no cuenta', () => {
        const a = nueva();
        assert.strictEqual(cm.apuntarHecho(a.token, 'subida', 'x', { ok: 1 }), false);   // demasiado corto
        assert.strictEqual(cm.yaHecho(a.token, 'subida', 'x'), undefined);
        assert.ok(cm.apuntarHecho(a.token, 'subida', 'fo-123456', { ok: 1 }));
        assert.deepStrictEqual(cm.yaHecho(a.token, 'subida', 'fo-123456'), { ok: 1 });
        assert.strictEqual(cm.yaHecho(a.token, 'lectura', 'fo-123456'), undefined);     // por tipo
        for (let i = 0; i < 250; i++) cm.apuntarHecho(a.token, 'subida', 'fo-' + (100000 + i), i);
        assert.ok(cm._sesiones.get(a.token).hechos.size <= 200);
        cm.cerrar(a.token, 'EXP-S');
    });

    await prueba('una planta sin paredes no abre sesión', () => {
        assert.throws(() => cm.abrir({ expediente: 'X', muros: [] }), /no tiene paredes/);
    });

    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
})();
