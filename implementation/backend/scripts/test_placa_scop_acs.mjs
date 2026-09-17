/**
 * LA PLACA QUE JUSTIFICA EL COP DEL ANEXO VI — lo determinista.
 *
 * Qué se comprueba, y por qué cada cosa:
 *  · Cuándo APLICA: solo con el SCOP_dhw por el Anexo VI. En cualquier otro
 *    método el COP no se lee de ninguna placa y la foto sería ruido en el
 *    certificado.
 *  · Cuál se ELIGE de las que hay, y que un cambio de foto nunca es silencioso.
 *  · Que el recuadro del documento CITA la placa como fuente del COP, y que sin
 *    ella el documento sale exactamente como antes.
 *
 *   node implementation/backend/scripts/test_placa_scop_acs.mjs
 */
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { aplicaAnexoVi, elegir, sanearRecorte } = require('../services/placaScopAcs');
const { scopAcsAnexoViHtml, FC_ZONA_ACS, placaImgHtml } = await import('../../frontend/src/features/expedientes/logic/cifoDoc.js');

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✔', nombre); };

console.log('\n── ¿A qué expedientes les toca? ──');
t('el Anexo VI (dep. independiente) sí', () =>
    assert.strictEqual(aplicaAnexoVi({ aerotermia_acs: { metodo_scop: 'independiente' } }), true));
t('el conjunto (η_wh del EPREL) no', () =>
    assert.strictEqual(aplicaAnexoVi({ aerotermia_acs: { metodo_scop: 'conjunto' } }), false));
t('la ficha técnica no', () =>
    assert.strictEqual(aplicaAnexoVi({ aerotermia_acs: { metodo_scop: 'ficha' } }), false));
t('sin método declarado no (el valor por defecto es la ficha)', () =>
    assert.strictEqual(aplicaAnexoVi({ aerotermia_acs: {} }), false));
t('sin instalación no revienta', () =>
    assert.strictEqual(aplicaAnexoVi(undefined), false));

console.log('\n── Cuál de las fotos se imprime ──');
const A = { driveId: 'a', name: 'FOTO_UNIDAD_EXTERIOR_PLACA_1.jpg' };
const B = { driveId: 'b', name: 'FOTO_UNIDAD_EXTERIOR_PLACA_2.jpg' };
t('sin ninguna, no se inventa ninguna', () =>
    assert.deepStrictEqual(elegir([], null), { elegida: null, aviso: null }));
t('sin elección guardada, la primera', () =>
    assert.strictEqual(elegir([A, B], null).elegida, A));
t('con elección guardada, manda ella', () =>
    assert.strictEqual(elegir([A, B], 'b').elegida, B));
t('si la elegida ya no está en Drive, se cae a la primera Y SE DICE', () => {
    const r = elegir([A, B], 'zzz');
    assert.strictEqual(r.elegida, A);
    assert.ok(r.aviso, 'cambiar de foto en silencio es cambiar lo que ve el verificador');
});

console.log('\n── El recuadro del certificado ──');
const comun = { zoneStr: 'D3', zoneLabel: 'Cálido', scopAcsRaw: 3.34, scopAcsStr: '3,34', acsFtUrl: null,
    anexoRef: 'Anexo VI de la ficha RES060' };
const sinPlaca = scopAcsAnexoViHtml({ ...comun });
const conPlaca = scopAcsAnexoViHtml({ ...comun, placaSrc: 'data:image/jpeg;base64,AAA' });

t('el COP sale de dividir el SCOP por el F_c de SU zona', () => {
    const cop = (3.34 / FC_ZONA_ACS.D3).toFixed(2).replace('.', ',');   // 3,00
    assert.ok(sinPlaca.includes(`COP = ${cop}`), 'el COP impreso no cuadra con el F_c de la zona');
    assert.ok(sinPlaca.includes('1,113'), 'no imprime el F_c de la D3');
});
t('sin foto, el documento no la menciona ni deja hueco', () => {
    assert.ok(!sinPlaca.includes('<img'), 'no debería haber imagen');
    assert.ok(sinPlaca.includes('(según ficha técnica del fabricante)'));
});
t('con foto, el documento CITA la placa como fuente del COP', () => {
    assert.ok(conPlaca.includes('<img'), 'falta la foto');
    assert.ok(conPlaca.includes('placa de características del equipo, que se reproduce en este certificado'),
        'la placa tiene que constar como fuente: es lo que el verificador no encontraba');
});
t('el número NO cambia por llevar foto', () => {
    const num = (h) => h.match(/= 3,34/g)?.length;
    assert.strictEqual(num(conPlaca), num(sinPlaca));
});

console.log('\n-- El RECORTE (recuadro, nunca la imagen recortada) --');
const R = { x: 10, y: 20, w: 50, h: 30, ar: 1.5 };
t('un recuadro valido se guarda tal cual', () =>
    assert.deepStrictEqual(sanearRecorte(R), R));
t('lo que se sale de la foto NO se guarda', () =>
    assert.strictEqual(sanearRecorte({ x: 60, y: 0, w: 50, h: 30, ar: 1.5 }), null));
t('un recorte ridiculo (<5 %) es un arrastre sin querer, no un encuadre', () =>
    assert.strictEqual(sanearRecorte({ x: 0, y: 0, w: 2, h: 90, ar: 1.5 }), null));
t('lo que no son numeros no se escribe a ciegas', () => {
    assert.strictEqual(sanearRecorte({ x: 'a', y: 0, w: 50, h: 30, ar: 1.5 }), null);
    assert.strictEqual(sanearRecorte(null), null);
    assert.strictEqual(sanearRecorte('{}'), null);
});

console.log('\n-- El encuadre en el documento --');
t('sin recorte, la foto va entera y acotada por alto', () => {
    const h = placaImgHtml({ src: 'X', recorte: null, ancho: 208, maxAlto: 290 });
    assert.ok(h.startsWith('<img'), 'sin recorte no hace falta caja');
    assert.ok(h.includes('max-height:290px'));
});
t('con recorte, la ventana y el desplazamiento salen en PIXELES', () => {
    // ar 1.5 y recorte al 50 % de ancho: la foto se pinta al doble (416 px), su
    // alto es 416/1.5 = 277,33 y la ventana el 30 % de eso = 83,2.
    const h = placaImgHtml({ src: 'X', recorte: R, ancho: 208, maxAlto: 290 });
    assert.ok(h.includes('width:208px;height:83.2px'), h);
    assert.ok(h.includes('width:416px'));
    assert.ok(h.includes('left:-41.6px'));   // 10 % de 416
    assert.ok(h.includes('top:-55.47px'));   // 20 % de 277,33
    assert.ok(h.includes('overflow:hidden'));
});
t('un recorte que no cabe de alto se reduce ENTERO, sin deformarse', () => {
    const alto = { x: 0, y: 0, w: 20, h: 90, ar: 1.5 };
    const h = placaImgHtml({ src: 'X', recorte: alto, ancho: 208, maxAlto: 290 });
    const caja = h.match(/width:([\d.]+)px;height:([\d.]+)px/);
    const img = h.match(/width:([\d.]+)px;height:([\d.]+)px;max-width/);
    assert.ok(caja && img);
    assert.ok(Number(caja[2]) <= 290.01, 'la hoja del PDF es fija: no puede pasarse');
    assert.ok(Math.abs(Number(img[1]) / Number(img[2]) - 1.5) < 0.01, 'la foto no puede deformarse');
    assert.ok(Math.abs((Number(caja[1]) / Number(caja[2])) - (0.20 * 1.5) / 0.90) < 0.01, 'la ventana no es la del recuadro pedido');
});

console.log(`\n${ok} comprobaciones, todas bien.\n`);
