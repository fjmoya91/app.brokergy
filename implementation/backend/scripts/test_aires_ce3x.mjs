// Los AIRES ACONDICIONADOS existentes en la envolvente (CE3X), 2026-09-29.
//
// Sin BD ni red. Comprueba que el bloque «Aires acondicionados» de la pestaña de
// Instalaciones crea los equipos que el motor sabe escribir, con las dos formas
// de referencia:
//   · CAE, 26RES060_206: 5 × «Equipo de sólo refrigeración», máquina
//     frigorífica, 250 %, 20 % y 28,4 m² cada uno (142 m²).
//   · CEE directo, 2026CEE_60: «Equipo de calefacción y refrigeración», bomba
//     de calor, 270 % / 250 %, estimado.
//
//   node implementation/backend/scripts/test_aires_ce3x.mjs

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const F = await import(pathToFileURL(path.join(aqui,
    '../../frontend/src/features/cee-envolvente/logic/fichaCe3x.js')).href);

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

console.log('Crear los aires');
t('5 aires solo frío sobre 142 m²: lo del CEE de 26RES060_206', () => {
    const a = F.airesAcondicionados({ n: 5, modo: 'refrigeracion', superficie: 142 });
    assert.equal(a.length, 5);
    assert.deepEqual(a.map(x => x.nombre),
        ['AIRE ACONDICIONADO 1', 'AIRE ACONDICIONADO 2', 'AIRE ACONDICIONADO 3',
         'AIRE ACONDICIONADO 4', 'AIRE ACONDICIONADO 5']);
    for (const x of a) {
        assert.equal(x.slot, 'refrigeracion');
        assert.equal(x.generador, 'Maquina frigorífica');
        assert.equal(x.pct_refrigeracion, '20');
        assert.equal(x.superficie_refrigeracion, '28.4');
        assert.equal(x.rend_nominal, '250.0');
        assert.ok(F.esAire(x));
    }
});
t('3 aires: 34 · 33 · 33, y la superficie en la misma proporción', () => {
    const a = F.airesAcondicionados({ n: 3, modo: 'refrigeracion', superficie: 100 });
    assert.deepEqual(a.map(x => x.pct_refrigeracion), ['34', '33', '33']);
    assert.deepEqual(a.map(x => x.superficie_refrigeracion), ['34', '33', '33']);
});
t('uno solo se llama «AIRE ACONDICIONADO», sin número', () => {
    assert.equal(F.airesAcondicionados({ n: 1, superficie: 90 })[0].nombre, 'AIRE ACONDICIONADO');
});
t('frío y calor (deducción): bomba de calor, 270 / 250, reparte los dos servicios', () => {
    const [x] = F.airesAcondicionados({ n: 1, modo: 'climatizacion', superficie: 142 });
    assert.equal(x.slot, 'climatizacion');
    assert.equal(x.generador, 'Bomba de Calor - Caudal Ref. Variable');
    assert.equal(x.rend_nominal_calefaccion, '270.0');
    assert.equal(x.rend_nominal_refrigeracion, '250.0');
    assert.equal(x.pct_calefaccion, '100');
    assert.equal(x.superficie_calefaccion, '142');
});

console.log('\nLo que llega al motor');
t('un aire solo frío se escribe con su nominal y su reparto', () => {
    const [x] = F.airesAcondicionados({ n: 5, superficie: 142 });
    const { equipo, avisos } = F.equipoAnadido(x, { superficie: 142 });
    assert.ok(equipo, avisos.join(' · '));
    assert.equal(equipo.slot, 'refrigeracion');
    assert.equal(equipo.rend_nominal, '250.0');
    assert.equal(equipo.pct_refrigeracion, '20');
    assert.equal(equipo.superficie_refrigeracion, 28.4);
    assert.equal(equipo.aire, undefined, 'la marca del bloque no viaja al motor');
});
t('un aire frío y calor se escribe ESTIMADO con sus dos nominales', () => {
    const [x] = F.airesAcondicionados({ n: 2, modo: 'climatizacion', superficie: 142 });
    const { equipo, avisos } = F.equipoAnadido(x, { superficie: 142 });
    assert.ok(equipo, avisos.join(' · '));
    assert.equal(equipo.slot, 'climatizacion');
    assert.equal(equipo.rendimiento, undefined, 'estimado: el motor lo toma por defecto');
    assert.equal(equipo.rend_nominal_calefaccion, '270.0');
    assert.equal(equipo.rend_nominal_refrigeracion, '250.0');
    assert.equal(equipo.pct_calefaccion, '50');
});
t('frío y calor con combustible no se escribe (el motor no conoce esa forma)', () => {
    const { equipo } = F.equipoAnadido({ slot: 'climatizacion', nombre: 'RARO',
        generador: 'Caldera Estándar', combustible: 'Gas Natural' }, { superficie: 100 });
    assert.equal(equipo, null);
});
t('el uso «frío y calor» estimado se ofrece a los añadidos, no al principal', () => {
    const anadido = F.usosDeEquipo({ rendimiento: 'estimado' }).map(u => u.valor);
    const principal = F.usosDeEquipo({ rendimiento: 'estimado' }, { principal: true }).map(u => u.valor);
    assert.ok(anadido.includes('climatizacion'));
    assert.ok(!principal.includes('climatizacion'));
});

console.log('\nLo que dijo el cliente');
t('CAE: de la confirmación del expediente, y solo frío', () => {
    const a = F.airesDelCliente({ instalacion: { confirmacion_cliente:
        { aire_acondicionado: true, num_aires: 5 } } });
    assert.deepEqual({ tiene: a.tiene, num: a.num, modo: a.modo },
                     { tiene: true, num: 5, modo: 'refrigeracion' });
});
t('CEE directo: del cuestionario de la oferta, y frío y calor', () => {
    const a = F.airesDelCliente({ es_cee_directo: true,
        documentacion: { cuestionario: { aire_acondicionado: true, num_aires: 6 } } });
    assert.deepEqual({ tiene: a.tiene, num: a.num, modo: a.modo },
                     { tiene: true, num: 6, modo: 'climatizacion' });
});
t('sin contestar: null (no es lo mismo que «no tiene»)', () => {
    assert.equal(F.airesDelCliente({ instalacion: {} }), null);
    assert.equal(F.airesDelCliente({ instalacion: { confirmacion_cliente:
        { aire_acondicionado: false } } }).tiene, false);
});

console.log(`\n${ok} comprobaciones correctas`);
process.exit(0);
