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
        assert.equal(x.potencia_refrigeracion, '3', '28,4 m² × 0,1 kW/m² = 2,8 → el mínimo, 3 kW');
        assert.ok(F.esAire(x));
    }
});

console.log('\nCuánto enfría cada aire (solo frío, 2026-10-08)');
t('uno solo NO cubre la casa: 233 m² → 17 % (40 m²), 4 kW', () => {
    const [x] = F.airesAcondicionados({ n: 1, superficie: 233 });
    assert.equal(x.pct_refrigeracion, '17');
    assert.equal(x.superficie_refrigeracion, '39.61');
    assert.equal(x.potencia_refrigeracion, '4');
});
t('cada uno entre el 10 % y el 25 % de la vivienda', () => {
    assert.equal(F.pctPorAire(90), 25, 'en una casa pequeña, el tope');
    assert.equal(F.pctPorAire(500), 10, 'en una muy grande, el suelo');
    assert.equal(F.pctPorAire(null), 20, 'sin superficie, 20 %');
});
t('van sumando hasta el 100 %: a partir de 4 en una casa de 160 m²', () => {
    const total = (n, s) => F.repartoAires(n, { superficie: s }).reduce((a, b) => a + b, 0);
    assert.deepEqual([1, 2, 3, 4, 5].map(n => total(n, 160)), [25, 50, 75, 100, 100]);
    assert.deepEqual([1, 4, 6].map(n => total(n, 233)), [17, 68, 100]);
    assert.deepEqual(F.repartoAires(3, { superficie: 100 }), [25, 25, 25]);
    assert.deepEqual(F.repartoAires(6, { superficie: 100 }), [17, 17, 17, 17, 16, 16]);
});
t('la potencia de frío va de 3 a 5 kW por lo que sirve (0,1 kW/m²)', () => {
    assert.equal(F.potenciaAireKw(22), 3);
    assert.equal(F.potenciaAireKw(43), 4.5);
    assert.equal(F.potenciaAireKw(80), 5);
    assert.equal(F.potenciaAireKw(null), 3);
});
t('frío y calor (CEE directo) sigue repartiendo el 100 %', () => {
    assert.deepEqual(F.repartoAires(3, { superficie: 233, modo: 'climatizacion' }), [34, 33, 33]);
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
