/**
 * test_placa_equipo — Lo DETERMINISTA del lector de placas de la bomba de calor.
 *
 * Aquí no se llama a ningún modelo ni se toca el catálogo: se prueba `casan()`,
 * que es quien decide si el código que se ha leído en una placa y el que guarda
 * el catálogo son el mismo equipo. De esa decisión cuelgan el SCOP y la ficha
 * técnica que se adjunta al certificado, así que equivocarse ahí es declarar el
 * rendimiento de otra máquina.
 *
 *   node implementation/backend/scripts/test_placa_equipo.js
 */

const { casan, norm, serieDesdeTexto } = require('../services/placaEquipoOcrService');

let fallos = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); } else { console.log(`  ✗ ${msg}`); fallos++; }
};

console.log('\n── Normalización ───────────────────────────────────────────────');
ok(norm('WH-MDC07J3E5') === 'WHMDC07J3E5', 'quita los guiones');
ok(norm(' wh mdc07j3e5 ') === 'WHMDC07J3E5', 'mayúsculas y espacios');
ok(norm(null) === '', 'un nulo no revienta');

console.log('\n── Casa lo que es el mismo equipo ──────────────────────────────');
// Códigos reales del catálogo (490 modelos, 404 con ud. exterior declarada).
ok(casan('EPGA16DAV37', 'EPGA16DAV37'), 'DAIKIN exacto');
ok(casan('epga16dav37', 'EPGA16DAV37'), 'da igual el casing de la placa');
ok(casan('RAV-GV1601ATP-E', 'RAVGV1601ATPE'), 'TOSHIBA con y sin guiones');
ok(casan('GIA-K12BPT3R32', 'GIA-K12BPT3R32'), 'GIATSU exacto');
// El catálogo guarda la Panasonic como WH-MDC07J3E5 y su placa dice ...-1: es la
// misma máquina con la revisión detrás.
ok(casan('WH-MDC07J3E5-1', 'WH-MDC07J3E5'), 'PANASONIC con sufijo de revisión');
ok(casan('WH-MDC07J3E5', 'WH-MDC07J3E5-1'), 'y al revés');

console.log('\n── NO casa lo que es otro equipo ───────────────────────────────');
ok(!casan('EPGA16DAV37', 'EPGA14DAV37'), 'una cifra de potencia distinta NO es el mismo equipo');
ok(!casan('EPRA16DAV37', 'EPGA16DAV37'), 'una letra distinta en la gama tampoco');
ok(!casan('', 'EPGA16DAV37'), 'un código vacío no casa con nada');
ok(!casan('ABC', 'ABC'), 'tres caracteres es demasiado poco para afirmar nada');

console.log('\n── Los códigos NUMÉRICOS solo casan exactos ────────────────────');
// THERMOR referencia sus unidades exteriores con seis cifras (526672, 527038).
// Ahí un prefijo emparejaría equipos distintos cuyo número empieza igual — y de
// paso podría morder un trozo de nº de serie.
ok(casan('526672', '526672'), 'THERMOR 526672 consigo mismo');
ok(!casan('5266721', '526672'), 'un dígito de más NO es el mismo equipo');
ok(!casan('526672', '52667'), 'ni uno de menos');
ok(!casan('5270380', '527038'), 'ningún numérico casa por prefijo');

console.log('\n── El sufijo largo NO cuela ────────────────────────────────────');
// Dos caracteres es la tolerancia: una revisión ("-1", "-E"). Más allá ya es
// otra referencia, y estirar la tolerancia es empezar a adivinar.
ok(!casan('WH-MDC07J3E5-XYZW', 'WH-MDC07J3E5'), 'cuatro caracteres de más ya es otra cosa');
ok(casan('WHMDC07J3E5E', 'WHMDC07J3E5'), 'uno de más sí (misma familia)');

console.log('\n── El nº de serie, de su línea literal ─────────────────────────');
// Las tres placas reales sobre las que se midió esto.
const s1 = serieDesdeTexto('MFG.NO. : 1650773', '1650773');
ok(s1.serie === '1650773' && !s1.aviso, 'DAIKIN «MFG.NO. : 1650773» → 1650773');

const s2 = serieDesdeTexto('SERIAL NO. 5624802034', '5624802034');
ok(s2.serie === '5624802034' && !s2.aviso, 'PANASONIC «SERIAL NO. 5624802034» → 5624802034');

// ⚠️ El nº de serie puede venir POR BLOQUES y los espacios son suyos: quedarse
// con el primero («1KK018») deja el número a un cuarto. Medido en 26RES080_79.
const s3 = serieDesdeTexto('S/N:1KK018 038JAP D8D5BJF 0134', '1KK018038JAPD8D5BJF0134');
ok(s3.serie === '1KK018038JAPD8D5BJF0134' && !s3.aviso, 'nº de serie por bloques: NO se corta por el espacio');

// Las dos lecturas discrepan de verdad → se avisa, no se traga.
const s4 = serieDesdeTexto('SERIAL NO. 5624802034', '5621802034');
ok(s4.serie === '5624802034' && !!s4.aviso, 'si las dos lecturas difieren, manda la línea Y se avisa');

// Sin línea no hay nada que contrastar, pero el dato no se tira.
const s5 = serieDesdeTexto(null, '1650773');
ok(s5.serie === '1650773' && !s5.aviso, 'sin línea literal, vale el número aislado');
ok(serieDesdeTexto(null, null).serie === null, 'sin nada, null');

console.log(`\n${fallos ? `❌ ${fallos} FALLO(S)` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
