// Prueba del juicio de la placa de la caldera en «Nueva simulación» (sin Gemini).
//   node implementation/backend/scripts/test_placa_caldera_alta.js
const assert = require('assert');
const { veredictoPlaca, potenciasPorCombustible, notaHistorialPlaca } = require('../utils/placaCalderaAlta');

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log(`  ✓ ${nombre}`); };

// elegirPotencia de mentira con el MISMO contrato que la de placaOcrService
// (la de verdad levanta Gemini y Drive al importarse).
const poli = (pot, comb) => {
    const fam = { gas_natural: 'Gas', gasoleo: 'Líquido', carbon: 'Sólido' }[comb];
    const fila = pot.find((p) => p.etiqueta === fam);
    return { base: 'multicombustible', kw: fila ? Number(String(fila.valor).replace(',', '.')) : null };
};
const normal = () => ({ base: 'util', kw: 24 });

t('una placa con marca, modelo y potencia vale', () => {
    const v = veredictoPlaca({ leido: { marca: 'FERROLI', modelo: 'DOMIPROJECT F24', combustible: 'gas_natural', anio: 2005, potencias: [{ valor: '24' }] }, potencia_kw: 24, potencia_base: 'util' });
    assert.strictEqual(v.estado, 'ok');
    assert.deepStrictEqual(v.faltan, []);
});

t('sin año ni combustible sigue valiendo, pero lo dice', () => {
    const v = veredictoPlaca({ leido: { marca: 'BAXI', modelo: 'X', potencias: [{ valor: '24' }] }, potencia_kw: 24 });
    assert.strictEqual(v.estado, 'ok');
    assert.deepStrictEqual(v.faltan.sort(), ['año', 'combustible']);
});

t('se ve la caldera pero no la potencia: incompleta', () => {
    const v = veredictoPlaca({ leido: { marca: 'ROCA', modelo: 'P-30' }, potencia_kw: null });
    assert.strictEqual(v.estado, 'incompleta');
    assert.ok(v.faltan.includes('potencia'));
    assert.match(v.titulo, /potencia/);
});

t('se lee la potencia pero no la caldera: incompleta', () => {
    const v = veredictoPlaca({ leido: { potencias: [{ valor: '23,3' }], potencia_texto: 'Pn 23,3 kW' }, potencia_kw: 23.3 });
    assert.strictEqual(v.estado, 'incompleta');
    assert.match(v.titulo, /caldera/);
});

t('nada leído: no es una placa', () => {
    const v = veredictoPlaca({ leido: { marca: null, modelo: null, potencias: [] }, potencia_kw: null });
    assert.strictEqual(v.estado, 'no_valida');
});

t('una policombustible cuenta como potencia leída aunque no se haya elegido', () => {
    const v = veredictoPlaca({ leido: { marca: 'ROCA', modelo: 'P-30-4', potencias: [{ etiqueta: 'Sólido', valor: '15,3' }, { etiqueta: 'Líquido', valor: '23,3' }] }, potencia_kw: null, potencia_base: 'multicombustible' });
    assert.strictEqual(v.estado, 'ok');
});

t('policombustible: una potencia por combustible', () => {
    const pot = [{ etiqueta: 'Sólido', valor: '15,3' }, { etiqueta: 'Líquido', valor: '23,3' }, { etiqueta: 'Gas', valor: '23,3' }];
    assert.deepStrictEqual(potenciasPorCombustible(pot, poli), { gas_natural: 23.3, gasoleo: 23.3, carbon: 15.3 });
});

t('placa normal: no hay potencias por combustible', () => {
    assert.deepStrictEqual(potenciasPorCombustible([{ etiqueta: 'Pn', valor: '24' }], normal), {});
});

t('la nota del historial dice lo leído, lo confirmado y si la foto servía', () => {
    const n = notaHistorialPlaca({
        marca: 'FERROLI', modelo: 'DOMIPROJECT F24', potencia_kw: 23.3, anio: 2005,
        combustible: 'glp', combustible_leido: 'gas_natural', condensacion: 'no_se', veredicto: 'ok',
    });
    assert.match(n, /FERROLI DOMIPROJECT F24/);
    assert.match(n, /23,3 kW/);
    assert.match(n, /2005/);
    assert.match(n, /confirmado: propano\/butano — la placa decía gas natural/);
    assert.match(n, /condensación: no lo sabe/);
    assert.match(n, /placa leída/);
});

t('la nota avisa de una foto que no servía y de un año tecleado', () => {
    const n = notaHistorialPlaca({ combustible: 'gasoleo', anio: 1999, anio_tecleado: true, veredicto: 'no_valida', serie_dudosa: true });
    assert.match(n, /NO es una placa/);
    assert.match(n, /marca y modelo sin leer/);
    assert.match(n, /1999 \(tecleado\)/);
    assert.match(n, /la placa no lo dice/);
    assert.match(n, /serie dudoso/);
    assert.strictEqual(notaHistorialPlaca(null), null);
});

console.log(`\n${ok} pruebas OK`);
