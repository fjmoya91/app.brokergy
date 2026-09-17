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
const { aplicaAnexoVi, elegir } = require('../services/placaScopAcs');
const { scopAcsAnexoViHtml, FC_ZONA_ACS } = await import('../../frontend/src/features/expedientes/logic/cifoDoc.js');

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

console.log(`\n${ok} comprobaciones, todas bien.\n`);
