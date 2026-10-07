/**
 * Lo dibujado A MANO en la pizarra del plano manda sobre el plan de la IA.
 *
 *   node implementation/backend/scripts/test_lo_dibujado.js
 */
const assert = require('node:assert/strict');
const { paredesTocadas, respetarLoDibujado, medirHuecos } = require('../utils/loDibujadoAMano');

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

const prev = {
    huecos: {
        FBS1: [{ nombre: 'V1', tipo: 'ventana', ancho: 1.3, alto: 1.3, estado: 'dudoso' },
               { nombre: 'V3', tipo: 'ventana', ancho: 1.5, alto: 1.3, estado: 'dudoso', origen: 'pizarra' }],
        FBN1: [{ nombre: 'P1', tipo: 'puerta', ancho: 0.9, alto: 2.1, estado: 'medido' }],
    },
    tipos: { MBO1: 'FACHADA' },
    excluidas: ['FBE2'],
    pizarra: { cambios: [], tocadas: ['MBO1', 'FBE2'] },
};

console.log('\nQUÉ HA TOCADO UNA PERSONA');
prueba('las tocadas de la pizarra y las que tienen un hueco dibujado', () => {
    assert.deepEqual([...paredesTocadas(prev)].sort(), ['FBE2', 'FBS1', 'MBO1']);
});
prueba('sin pizarra, nada', () => {
    assert.equal(paredesTocadas({ huecos: { FBS1: [{ nombre: 'V1' }] } }).size, 0);
    assert.deepEqual(respetarLoDibujado({ huecos: { FBS1: [] } }, null), []);
});

console.log('\nLO QUE EL PLAN NO PUEDE HACER');
prueba('volver a poner los huecos de una pared tocada', () => {
    assert.throws(() => respetarLoDibujado({ huecos: { FBS1: [{ tipo: 'ventana' }] } }, prev), /FBS1/);
});
prueba('pero SÍ los de una pared que nadie ha tocado', () => {
    assert.deepEqual(respetarLoDibujado({ huecos: { FBN1: [{ tipo: 'ventana' }] } }, prev), []);
});
prueba('cambiarle el tipo a una pared reclasificada a mano', () => {
    assert.throws(() => respetarLoDibujado({ tipos: { MBO1: 'MEDIANERA' } }, prev), /MBO1/);
    // Repetir lo mismo que dijo la persona no es deshacerlo.
    assert.deepEqual(respetarLoDibujado({ tipos: { MBO1: 'FACHADA' } }, prev), []);
});
prueba('devolver a la envolvente una pared apartada a mano', () => {
    assert.throws(() => respetarLoDibujado({ excluidas: [] }, prev), /FBE2/);
    assert.deepEqual(respetarLoDibujado({ excluidas: ['FBE2', 'XX9'] }, prev), []);
});
prueba('«reemplazar» con algo dibujado a mano', () => {
    assert.throws(() => respetarLoDibujado({ reemplazar: true }, prev), /reemplazar/);
});
prueba('«forzar_mano» lo deja pasar, AVISANDO', () => {
    const a = respetarLoDibujado({ forzar_mano: true, huecos: { FBS1: [] } }, prev);
    assert.equal(a.length, 1);
    assert.match(a[0], /PISA/);
});

console.log('\nMEDIR LO DIBUJADO');
prueba('«medir» pone la medida sin quitar ni añadir huecos', () => {
    const r = medirHuecos(prev.huecos, { FBS1: { V3: { ancho: 1.18, alto: 1.12 } } });
    assert.equal(r.huecos.FBS1.length, 2);
    const v3 = r.huecos.FBS1.find(h => h.nombre === 'V3');
    assert.equal(v3.ancho, 1.18);
    assert.equal(v3.alto, 1.12);
    assert.equal(v3.estado, 'dudoso');
    assert.equal(v3.origen, 'pizarra', 'sigue siendo de la pizarra');
    assert.match(v3.por_que, /dibujada a mano/);
    assert.equal(prev.huecos.FBS1[1].ancho, 1.5, 'no toca el original');
});
prueba('«medido» si el plan lo dice', () => {
    const r = medirHuecos(prev.huecos, { FBN1: { P1: { ancho: 0.82, estado: 'medido' } } });
    assert.equal(r.huecos.FBN1[0].estado, 'medido');
    assert.equal(r.huecos.FBN1[0].alto, 2.1);
});
prueba('un hueco o una pared que no están se avisan', () => {
    const r = medirHuecos(prev.huecos, { FBS1: { V9: { ancho: 1 } }, XX1: { V1: { ancho: 1 } } });
    assert.equal(r.avisos.length, 2);
    assert.equal(r.hechos.length, 0);
});

console.log(`\n${ok} pruebas bien${process.exitCode ? ' — ALGUNA HA FALLADO' : ''}.\n`);
