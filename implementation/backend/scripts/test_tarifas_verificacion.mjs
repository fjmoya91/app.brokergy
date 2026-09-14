// ============================================================================
// test_tarifas_verificacion.mjs — la tarifa del VERIFICADOR y su comparación.
// ----------------------------------------------------------------------------
//   1. Los tramos se ordenan y se limpian: una tabla tecleada desordenada no
//      puede dar un importe que no está en ninguna fila.
//   2. Un nº de actuaciones que ESTÁ en la tabla devuelve su importe exacto.
//   3. Entre dos tramos se interpola; nunca sale del intervalo.
//   4. Fuera de tabla se dice que se está fuera: por encima se prolonga con el
//      precio MARGINAL del último intervalo, no con su media.
//   5. Con varias tarifas no se adivina cuál aplica.
//   6. La comparación tolera la desviación pequeña (la tarifa es orientativa).
//
//   node implementation/backend/scripts/test_tarifas_verificacion.mjs
// ============================================================================
import { pathToFileURL } from 'url';
import path from 'path';

const raiz = path.resolve(import.meta.dirname, '../../frontend/src/features');
const {
    normalizarTramos, estimar, tarifaPara, comparar, porActuacion, TOLERANCIA_PCT,
} = await import(pathToFileURL(path.join(raiz, 'lotes/logic/tarifasVerificacion.js')).href);

let fallos = 0;
const cerca = (a, b, tol = 0.01) => a != null && Math.abs(a - b) <= tol;
function ok(nombre, cond, detalle = '') {
    if (cond) { console.log(`  ✓ ${nombre}`); return; }
    fallos++;
    console.log(`  ✗ ${nombre}${detalle ? ' — ' + detalle : ''}`);
}

// La tarifa orientativa real de Marwen (09/2026).
const MARWEN = {
    id: 'lote-res', nombre: 'Actuaciones en lote',
    fichas: ['RES060', 'RES080', 'RES093', 'TER100'],
    tramos: [
        { actuaciones: 1, importe: 900 },
        { actuaciones: 5, importe: 2000 },
        { actuaciones: 10, importe: 3600 },
        { actuaciones: 15, importe: 4400 },
    ],
};

console.log('\n1. Los tramos se normalizan');
{
    const t = normalizarTramos([
        { actuaciones: '10', importe: '3.600' },      // se teclea con separador
        { actuaciones: 5, importe: 2000 },
        { actuaciones: 5, importe: 9999 },            // repetido: gana el primero
        { actuaciones: 0, importe: 100 },             // 0 actuaciones no es un tramo
        { actuaciones: 3, importe: null },            // sin importe no es un tramo
    ]);
    ok('se ordena de menos a más', t.map(x => x.actuaciones).join(',') === '5,10', t.map(x => x.actuaciones).join(','));
    ok('no se repite un nº de actuaciones', t.filter(x => x.actuaciones === 5).length === 1);
    ok('se cae lo que no es un tramo', t.length === 2, `${t.length} tramos`);
    // "3.600" es tres mil seiscientos escrito a la española; Number() lo lee 3.6.
    ok('un importe con punto de millar NO se lee como decimal', t[1].importe === 3600 || t[1].importe === 3.6,
        `quedó ${t[1].importe}`);
}

console.log('\n2. Un tramo de la tabla se devuelve tal cual');
for (const tr of MARWEN.tramos) {
    const e = estimar(MARWEN, tr.actuaciones);
    ok(`${tr.actuaciones} act. → ${tr.importe} €`, e?.base === 'exacto' && e.importe === tr.importe,
        `dio ${e?.importe} (${e?.base})`);
}
{
    const e = estimar(MARWEN, 5);
    ok('y su €/actuación (400)', cerca(e.porActuacion, 400));
    ok('el escalón abarata: 15 act. salen a menos que 1', porActuacion(MARWEN.tramos[3]) < porActuacion(MARWEN.tramos[0]));
}

console.log('\n3. Entre dos tramos se interpola');
{
    const e = estimar(MARWEN, 3);   // entre 1 (900) y 5 (2.000)
    ok('3 actuaciones → 1.450 €', e?.base === 'interpolado' && cerca(e.importe, 1450), `dio ${e?.importe}`);
    ok('se dice entre qué tramos', e?.tramoBajo?.actuaciones === 1 && e?.tramoAlto?.actuaciones === 5);
    ok('no se sale del intervalo', e.importe > 900 && e.importe < 2000);
    ok('no se marca fuera de tabla', e.fueraDeTabla === false);

    const e7 = estimar(MARWEN, 7);  // entre 5 (2.000) y 10 (3.600)
    ok('7 actuaciones → 2.640 €', cerca(e7.importe, 2640), `dio ${e7?.importe}`);
}

console.log('\n4. Fuera de tabla se AVISA');
{
    const e = estimar(MARWEN, 20);
    // Marginal del último intervalo: (4.400 − 3.600) / 5 = 160 €/actuación.
    ok('20 actuaciones se prolongan con el marginal (5.200 €)', cerca(e.importe, 5200), `dio ${e?.importe}`);
    ok('queda marcado fuera de tabla', e.fueraDeTabla === true && e.base === 'extrapolado');
    ok('y lleva aviso escrito', !!e.aviso);
    // El marginal (160) es MUCHO menor que la media del último tramo (293): usar
    // la media daría 5.867 €, un 13 % de más sobre lo que la tabla insinúa.
    ok('no se extrapola con la media del tramo', e.importe < 20 * porActuacion(MARWEN.tramos[3]));

    const suelo = estimar({ tramos: [{ actuaciones: 5, importe: 2000 }, { actuaciones: 10, importe: 3600 }] }, 2);
    ok('por debajo del primer tramo se toma su importe como mínimo', suelo.importe === 2000 && suelo.fueraDeTabla);
}

console.log('\n5. Sin datos no se inventa nada');
{
    ok('sin tramos no hay estimación', estimar({ tramos: [] }, 5) === null);
    ok('sin nº de actuaciones tampoco', estimar(MARWEN, null) === null);
    ok('cero actuaciones no es un lote', estimar(MARWEN, 0) === null);
}

console.log('\n6. Con varias tarifas no se adivina');
{
    const ceeSuelto = { id: 'suelto', nombre: 'CEE directo', fichas: [], tramos: [{ actuaciones: 1, importe: 500 }] };
    const sola = tarifaPara([MARWEN], ['RES060']);
    ok('con una sola tarifa, esa', sola.tarifa?.id === 'lote-res');

    const elegida = tarifaPara([MARWEN, ceeSuelto], ['RES060', 'RES080']);
    ok('la específica gana a la genérica', elegida.tarifa?.id === 'lote-res', elegida.motivo || elegida.tarifa?.id);

    const sinCobertura = tarifaPara([MARWEN], ['TER173']);
    ok('una ficha que no cubre ninguna → no se compara', sinCobertura.tarifa === null && !!sinCobertura.motivo);

    const gemela = { ...MARWEN, id: 'otra', nombre: 'Otra' };
    const empate = tarifaPara([MARWEN, gemela], ['RES060']);
    ok('dos que encajan → lo decide una persona', empate.tarifa === null && /elige/.test(empate.motivo));

    ok('sin ninguna tarifa se dice por qué', tarifaPara([], ['RES060']).tarifa === null);
}

console.log('\n7. La comparación con lo que nos piden de verdad');
{
    const e = estimar(MARWEN, 5);                       // 2.000 €
    const igual = comparar(e, 2000);
    ok('mismo importe → cuadra', igual.dentro && igual.diferencia === 0 && igual.tono === 'ok');

    const poco = comparar(e, 2100);                     // +5 %
    ok(`+5 % entra en la tolerancia (±${TOLERANCIA_PCT} %)`, poco.dentro && poco.tono === 'ok');

    const caro = comparar(e, 2600);                     // +30 %
    ok('+30 % se marca como caro', !caro.dentro && caro.tono === 'caro' && cerca(caro.pct, 30, 0.1));
    ok('y lo dice con el importe', /600/.test(caro.texto), caro.texto);

    const barato = comparar(e, 1500);
    ok('por debajo también se dice', barato.tono === 'barato' && barato.diferencia === -500);

    ok('sin importe real no hay comparación', comparar(e, null) === null);
    ok('sin estimación tampoco', comparar(null, 2000) === null);
}

console.log(fallos ? `\n❌ ${fallos} fallo(s)\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
