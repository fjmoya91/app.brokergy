#!/usr/bin/env node
/**
 * Prueba la parte DETERMINISTA del lector de placas: qué potencia se escribe de
 * entre todas las que declara una placa. Sin BD, sin Drive y sin llamar a Gemini.
 *
 *   node implementation/backend/scripts/test_placa_ocr.js
 *
 * Es lo único que hay que vigilar aquí: el modelo solo TRANSCRIBE, y de una mala
 * transcripción se da cuenta quien mira la línea literal en pantalla. De una
 * mala ELECCIÓN, no — se escribe en el expediente y de ahí al .cex.
 */
const {
    potenciaDesdeTexto, elegirPotencia, combustibleDeclarado,
} = require('../services/placaOcrService');

let fallos = 0;
const comprueba = (que, real, esperado) => {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) { fallos++; console.log(`  MAL  ${que}\n       esperado ${JSON.stringify(esperado)}, salió ${JSON.stringify(real)}`); }
    else console.log(`  ok   ${que}`);
};

// ── 1. La línea literal ──────────────────────────────────────────────────────
// Red de seguridad: se usa cuando el modelo no separa las potencias una a una.
console.log('\n1. La potencia sacada de la línea literal');
[
    ['Pn 80/60°C 10,9-23,3 kW', 23.3, 'util'],          // rango: manda el máximo
    ['Qn = 25,5 kW  Pn = 23,3 kW', 23.3, 'util'],       // útil sobre consumo
    ['Consumo calorífico Qn 24,1 kW / Potencia útil Pn 21,8 kW', 21.8, 'util'],
    ['Potencia útil Pn 23,3 kW - Consumo Qn 25,5 kW', 23.3, 'util'], // y al revés
    ['Wärmebelastung Qn 25 kW Nutzleistung Pn 22,4 kW', 22.4, 'util'],
    ['Potencia útil 24 kW', 24, 'util'],
    ['Qn 28.9 kW', 28.9, 'consumo'],                    // solo consumo: se avisa
    ['Potencia nominal: 30 kW', 30, 'unica'],
    ['P 7,1 - 20,2 kW', 20.2, 'unica'],
    ['Presión máx 3 bar - Caudal 13 l/min', null, null],  // nada que sea potencia
    ['230V 50Hz 110W', null, null],                       // W no es kW
].forEach(([texto, kw, base]) => {
    const r = potenciaDesdeTexto(texto);
    comprueba(`«${texto}»`, [r.kw, r.base], [kw, base]);
});

// ── 2. La placa POLICOMBUSTIBLE ──────────────────────────────────────────────
// El caso de 26RES060_186 (ROCA P-30-4): tres potencias y la buena depende del
// combustible del expediente. Coger la mayor sería declarar una caldera un 52 %
// más potente que la real.
console.log('\n2. Una potencia por combustible');
const ROCA = [
    { etiqueta: 'Sólido', valor: '15,3' },
    { etiqueta: 'Líquido', valor: '23,3' },
    { etiqueta: 'Gas', valor: '23,3' },
];
comprueba('carbón → la de sólido', elegirPotencia(ROCA, 'carbon').kw, 15.3);
comprueba('pellets → la de sólido', elegirPotencia(ROCA, 'pellets').kw, 15.3);
comprueba('gasóleo → la de líquido', elegirPotencia(ROCA, 'gasoleo').kw, 23.3);
comprueba('gas natural → la de gas', elegirPotencia(ROCA, 'gas_natural').kw, 23.3);
comprueba('GLP → la de gas', elegirPotencia(ROCA, 'glp').kw, 23.3);
comprueba('sin combustible declarado, NO se elige', elegirPotencia(ROCA, null).kw, null);
comprueba('  …y se dice por qué', !!elegirPotencia(ROCA, null).aviso, true);
comprueba('electricidad no casa con ninguna', elegirPotencia(ROCA, 'electricidad').kw, null);

// «gasóleo» contiene «gas»: el rótulo líquido tiene que ganar.
comprueba('«Gasóleo» no se lee como gas',
          elegirPotencia([{ etiqueta: 'Gasóleo', valor: '23,3' },
                          { etiqueta: 'Leña', valor: '15,3' }], 'gasoleo').kw, 23.3);

// UN solo rótulo de combustible no es una placa policombustible: es una caldera
// normal cuyo combustible viene rotulado. Se escribe igual.
comprueba('un solo combustible rotulado no bloquea',
          elegirPotencia([{ etiqueta: 'Gas', valor: '24' }], 'gasoleo').kw, 24);

console.log('\n3. Útil sobre consumo, ya transcritas');
comprueba('Qn/Pn', elegirPotencia([{ etiqueta: 'Qn', valor: '25,5' },
                                   { etiqueta: 'Pn', valor: '23,3' }], 'gas_natural').kw, 23.3);
comprueba('rango en una sola entrada',
          elegirPotencia([{ etiqueta: 'Pn 80/60', valor: '10,9-23,3' }], 'gas_natural').kw, 23.3);
comprueba('sin rótulo', elegirPotencia([{ etiqueta: '', valor: '24' }], 'gasoleo').kw, 24);
comprueba('nada legible', elegirPotencia([], 'gasoleo').kw, null);

// ── 4. El combustible del expediente ─────────────────────────────────────────
// `BOILER_EFFICIENCIES` no tiene fila de GLP ni distingue carbón de biomasa: eso
// lo dice `inputs.fuelType`, y sin ello se elegiría la columna equivocada.
console.log('\n4. Qué combustible declara el expediente');
const conId = (id, fuelType) => combustibleDeclarado(
    { caldera_antigua_cal: { rendimiento_id: id } }, { fuelType });
comprueba('gas_post98_auto → gas natural', conId('gas_post98_auto'), 'gas_natural');
comprueba('gas_* + fuelType glp → GLP', conId('gas_pre79', 'glp'), 'glp');
comprueba('oil_* → gasóleo', conId('oil_85_97'), 'gasoleo');
comprueba('solid_* → carbón por defecto', conId('solid_auto'), 'carbon');
comprueba('solid_* + fuelType pellets → pellets', conId('solid_auto', 'pellets'), 'pellets');
comprueba('electric → electricidad', conId('electric'), 'electricidad');
comprueba('sin declarar → nada', conId(undefined), null);

console.log(fallos ? `\n${fallos} FALLAN` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
