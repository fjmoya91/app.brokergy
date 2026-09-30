#!/usr/bin/env node
/**
 * Prueba lo DETERMINISTA del nº de serie de una placa (utils/serieDePlaca.js),
 * sin llamar a ningún modelo. Cada caso sale de una placa real medida el
 * 30/09/2026 sobre el corpus de expedientes.
 *
 *   node implementation/backend/scripts/test_serie_placa.js
 */
const {
    elegirSerie, combinarSeries, serieDesdeTexto, esGtin, esEan13, reglasSerie, EJEMPLOS_SERIE, norm,
} = require('../utils/serieDePlaca');

let fallos = 0;
const ok = (cond, msg) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
    if (!cond) fallos++;
};

console.log('\n── El texto junto a un código de barras o un QR ES el nº de serie ──');
// LASIAN AERIA HT 12 (26RES093_11): «8D00260116160057» bajo las barras, sin rótulo.
// El prompt anterior lo prohibía y salía en blanco.
let s = elegirSerie({ numero_serie: null, codigos: [{ texto: '8D00260116160057', rotulo: '', junto_a: 'codigo_barras' }] });
ok(s.serie === '8D00260116160057' && s.origen === 'barras', 'LASIAN: el código sin rótulo bajo las barras');
// Aerosun (26RES060_195): «IN2601309004-053» bajo un QR.
s = elegirSerie({ numero_serie: null, codigos: [{ texto: 'IN2601309004-053', rotulo: '', junto_a: 'qr' }] });
ok(s.serie === 'IN2601309004-053', 'Aerosun: el código sin rótulo bajo el QR');
// Lo propone el propio lector desde las barras.
s = elegirSerie({ numero_serie: '8D00260116160057', serie_texto: '8D00260116160057', serie_junto_a: 'codigo_barras' });
ok(s.serie === '8D00260116160057' && s.origen === 'barras', 'lo que propone el lector desde las barras vale');

console.log('\n── Lo rotulado manda sobre lo suelto ─────────────────────────────');
// Daikin (26RES060_155): el lector no aisló el número, pero lo listó rotulado.
s = elegirSerie({ numero_serie: null, codigos: [
    { texto: '85829402655B', rotulo: '', junto_a: 'codigo_barras' },
    { texto: '1602655', rotulo: 'MFG.NO.', junto_a: 'otro' },
] });
ok(s.serie === '1602655' && s.origen === 'rotulo', 'MFG.NO. antes que el código de las barras');
// Calderas: «Nº de fabricación» es el nº de serie (26RES060_202).
s = elegirSerie({ numero_serie: null, codigos: [{ texto: '16480', rotulo: 'N FABRICACION Y AÑO', junto_a: 'tabla' }] });
ok(s.serie === '16480', 'caldera: «N FABRICACION Y AÑO» es el nº de serie');

console.log('\n── Lo que NO es el nº de serie ───────────────────────────────────');
// Sime (26RES060_170): el lector dio «SN: 8119208», que es su «CODICE 8119208».
s = elegirSerie({ numero_serie: '8119208', serie_texto: 'SN: 8119208', codigos: [
    { texto: '8119208', rotulo: 'CODICE', junto_a: 'tabla' },
    { texto: '8 021297 786486', rotulo: '', junto_a: 'codigo_barras' },
] });
ok(s.serie === null && /PRODUCTO/.test(s.aviso || ''), 'Sime: el CODICE de la tabla no es el nº de serie');
ok(esGtin('8 021297 786486') && esGtin('8431312256175'), 'un EAN-13 se reconoce (con o sin espacios)');
ok(!esGtin('8431312256176'), 'con el dígito de control mal, no es un EAN');
ok(esEan13('8 431312 256175') && !esEan13('SN: 8431312256175'), 'rotulado como nº de serie, se respeta');
s = elegirSerie({ numero_serie: '8431312256175', serie_texto: '8 431312 256175' });
ok(s.serie === null, 'MIDEA (26RES060_OP246): el EAN bajo las barras se descarta');
// Caldera (26RES093_11): «N.R.I. FABRICANTE» es el registro del fabricante.
s = elegirSerie({ numero_serie: null, codigos: [
    { texto: '20-17338-SS', rotulo: 'N.R.I. FABRICANTE', junto_a: 'tabla' },
    { texto: 'D4.40.FM', rotulo: 'CÓD. IDEN. TIPO', junto_a: 'tabla' },
] });
ok(s.serie === null, 'caldera: ni el N.R.I. del fabricante ni el «Cód. iden. tipo»');
s = elegirSerie({ numero_serie: '20-17338-SS', serie_texto: 'N.R.I. FABRICANTE: 20-17338-SS' });
ok(s.serie === null, '…tampoco si el lector lo propone con su línea');
s = elegirSerie({ numero_serie: 'AERIAHT12', serie_texto: 'AERIA HT 12' }, { modelo: 'AERIA HT 12' });
ok(s.serie === null, 'el MODELO no es el nº de serie');

console.log('\n── Un ejemplo del prompt NUNCA es un dato ────────────────────────');
for (const e of EJEMPLOS_SERIE) {
    s = elegirSerie({ numero_serie: e.replace(/\s/g, ''), serie_texto: `SN: ${e}` });
    ok(s.serie === null && /EJEMPLO/.test(s.aviso || ''), `se descarta «${e}»`);
    ok(reglasSerie().includes(e), `…y es el que lleva el prompt`);
}
ok(!/\b(1650773|5624802034|541S7757904A3150100002|8D00260116160057|540W4809601A8260100023)\b/.test(reglasSerie()),
    'el prompt no lleva ningún nº de serie REAL (el modelo los copiaba)');

console.log('\n── Quitar el rótulo ──────────────────────────────────────────────');
const t = (linea, suelto) => serieDesdeTexto(linea, suelto);
ok(t('Número fabricación 2-88-00058', 'Número fabricación 2-88-00058').serie === '2-88-00058', '«Número fabricación» (26RES080_63)');
ok(t('N 18247', 'N18247').serie === '18247', 'una «N» suelta delante (26RES060_208)');
ok(t('Nº SERIE: 0905326219', '0905326219').serie === '0905326219', '«Nº SERIE:» (26RES093_11)');
ok(t('S/N:1KK018 038JAP D8D5BJF 0134', '1KK018038JAPD8D5BJF0134').serie === '1KK018038JAPD8D5BJF0134',
    'un nº de serie por bloques no se corta por el primer espacio (26RES080_79)');
const disc = t('SERIAL NO. 5624802034', '5621802034');
ok(disc.serie === '5624802034' && disc.aviso, 'si la línea y el aislado discrepan, manda la línea y se avisa');

console.log('\n── Dos lecturas de dos modelos ───────────────────────────────────');
const A = (serie, texto = serie) => ({ serie, texto, origen: 'lector', aviso: null });
let c = combinarSeries(A('1650773'), A('1650773'));
ok(c.confirmada && !c.dudosa && c.serie === '1650773', 'coinciden → confirmada');
c = combinarSeries(A('2-93-00577'), A('29300577'));
ok(c.confirmada && c.serie === '2-93-00577', 'con distintos separadores es el mismo dato');
// 26RITE_001: el de siempre se come un cero de la racha.
c = combinarSeries(A('540W4809601A8260100023'), A('540W4809601A82601000023'));
ok(c.dudosa && c.serie === '540W4809601A8260100023' && c.alternativas.length === 2, 'discrepan → dudosa, con las dos');
c = combinarSeries(null, A('1602655'));
ok(!c.dudosa && !c.confirmada && c.serie === '1602655', 'solo una lectura → se propone sin confirmar');
c = combinarSeries(null, null);
ok(c.serie === null && !c.dudosa, 'ninguna → nada');
ok(norm('2-93 00577') === '29300577', 'norm quita separadores');

console.log(`\n${fallos ? `❌ ${fallos} FALLO(S)` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
