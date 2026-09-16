/**
 * test_pared_ocr — Lo DETERMINISTA de leer la foto de un cerramiento.
 *
 * Lo que el modelo devuelve son CAJAS; los metros los pone `aMetros()` tomando
 * como referencia la PUERTA DE ENTRADA, que mide 2,05 m de alto y está dentro de
 * la misma foto. O sea que el riesgo no está en el prompt: está aquí, en la regla
 * de tres y —sobre todo— en cuándo NO hay que aplicarla. De estas cifras sale la
 * superficie de huecos que acaba en el `.cex`.
 *
 *   node implementation/backend/scripts/test_pared_ocr.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { aMetros, escalas, contraste, PUERTA_ALTO_M } =
    require('../services/paredOcrService.js');

let fallos = 0;
let total = 0;

function ok(nombre, cond, detalle = '') {
    total++;
    if (!cond) fallos++;
    console.log(`${cond ? '  ok  ' : '  FALLA'}  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}
const cerca = (a, b, tol = 0.03) => a !== null && Math.abs(a - b) <= tol;

// La pared del caso real: FBS3 de 26RES060_186, medida por el motor.
const FBS3 = { nombre: 'FBS3', orientacion: 'S', largo: 10.94, alto: 2.80 };
const ASPECTO = 4 / 3;

/**
 * Una escena COHERENTE, construida hacia atrás desde la realidad.
 *
 * Si la fachada de 10,94 m ocupa el 95 % del ancho del encuadre, el ancho visible
 * son 11,52 m y el alto 8,64 m. De ahí sale la caja que le tocaría a cada hueco
 * si el modelo midiera perfecto. Lo que se comprueba es que `aMetros()` deshace
 * esa cuenta y devuelve los metros de partida.
 */
const ANCHO_VISIBLE = 10.94 / 0.95;               // 11,52 m
const ALTO_VISIBLE = ANCHO_VISIBLE / ASPECTO;     // 8,64 m
const box = (xm, ym, anchoM, altoM) => {
    const x0 = Math.round((xm / ANCHO_VISIBLE) * 1000);
    const y0 = Math.round((ym / ALTO_VISIBLE) * 1000);
    return [y0, x0,
        y0 + Math.round((altoM / ALTO_VISIBLE) * 1000),
        x0 + Math.round((anchoM / ANCHO_VISIBLE) * 1000)];
};

const PUERTA = { tipo: 'puerta', es_entrada: true, box_2d: box(5.0, 4.5, 0.90, 2.05) };
const VENTANA = (x) => ({ tipo: 'ventana', box_2d: box(x, 4.0, 1.30, 1.30),
                          material_marco: 'aluminio', persiana: true });

console.log('\n── La escala sale de la PUERTA, y devuelve los metros de partida ─');
{
    const r = aMetros({
        encuadre: 'completa',
        huecos: [VENTANA(2.0), PUERTA, VENTANA(7.0)],
        fachada_box_2d: box(0.28, 0, 10.94, 8.0),
    }, FBS3, ASPECTO);

    ok('3 huecos leídos, 3 propuestos', r.huecos.length === 3);
    ok('la ventana de 1,30 vuelve como 1,30 de ancho',
        cerca(r.huecos[0].ancho, 1.30), `${r.huecos[0].ancho} m`);
    ok('y como 1,30 de alto', cerca(r.huecos[0].alto, 1.30), `${r.huecos[0].alto} m`);
    ok('la puerta vuelve como 0,90 × 2,05',
        cerca(r.huecos[1].ancho, 0.90) && cerca(r.huecos[1].alto, 2.05),
        `${r.huecos[1].ancho} × ${r.huecos[1].alto} m`);
    ok('la referencia es la puerta, y se dice',
        (r.escala || []).some(s => s.includes('puerta')), (r.escala || []).join(' · '));
    ok('cada medida dice de dónde sale', !!r.huecos[0].de, r.huecos[0].de || '(sin procedencia)');
    ok('sin avisos: la escala cuadra con lo que midió el motor',
        !r.avisos.length, r.avisos.join(' | ') || '(ninguno)');
}

console.log('\n── El sesgo del modelo se CANCELA: agrandar todo no cambia nada ──');
{
    // El modelo agranda TODAS las cajas ~1,5× de forma consistente (medido). Como
    // la referencia está dentro de la misma foto, el factor se va.
    const agranda = (b, k = 1.5) => {
        const [y0, x0, y1, x1] = b;
        const cy = (y0 + y1) / 2, cx = (x0 + x1) / 2;
        return [Math.round(cy - (cy - y0) * k), Math.round(cx - (cx - x0) * k),
                Math.round(cy + (y1 - cy) * k), Math.round(cx + (x1 - cx) * k)];
    };
    const v = VENTANA(2.0);
    const r = aMetros({
        encuadre: 'completa',
        huecos: [{ ...v, box_2d: agranda(v.box_2d) },
                 { ...PUERTA, box_2d: agranda(PUERTA.box_2d) }],
        fachada_box_2d: null,
    }, FBS3, ASPECTO);
    ok('con todas las cajas un 50 % más grandes, la ventana sigue saliendo 1,30',
        cerca(r.huecos[0].ancho, 1.30, 0.05), `${r.huecos[0].ancho} m`);
}

console.log('\n── SIN puerta de entrada no se inventa la escala ────────────────');
{
    const r = aMetros({
        encuadre: 'completa',
        huecos: [VENTANA(2.0), VENTANA(7.0)],
        fachada_box_2d: box(0.28, 0, 10.94, 8.0),
    }, FBS3, ASPECTO);
    ok('los huecos se cuentan igual', r.huecos.length === 2);
    ok('pero sin medidas', r.huecos.every(h => h.ancho === null && h.alto === null));
    ok('y se dice por qué', r.avisos.some(a => a.includes('puerta de entrada')),
        r.avisos[0]);
}

console.log('\n── El largo de la pared VALIDA: si no cuadra, se avisa ──────────');
{
    // La misma escena, pero diciendo que la fachada ocupa solo medio encuadre:
    // saldría de 5,8 m y el motor la midió en 10,94.
    const r = aMetros({
        encuadre: 'completa',
        huecos: [VENTANA(2.0), PUERTA],
        fachada_box_2d: box(0.28, 0, 5.5, 8.0),
    }, FBS3, ASPECTO);
    ok('el desvío contra lo que midió el motor se avisa',
        r.avisos.some(a => a.includes('escorzada')), r.avisos[0]);
    ok('pero las medidas se siguen proponiendo (el aviso no bloquea)',
        r.huecos[0].ancho !== null, `${r.huecos[0].ancho} m`);

    const c = contraste(escalas({ huecos: [PUERTA] }, FBS3, ASPECTO),
                        { fachada_box_2d: box(0.28, 0, 10.94, 8.0) }, FBS3);
    ok('y cuando SÍ cuadra, no avisa', c && !c.avisa,
        `desvío ${(c.desvio * 100).toFixed(1)} %`);
}

console.log('\n── Una escala absurda se descarta; el recuento se conserva ──────');
{
    // Seis ventanas de 3 m en una pared de 10,94: 18 m de hueco. Imposible.
    const r = aMetros({
        encuadre: 'completa',
        huecos: [...Array.from({ length: 6 }, (_, k) =>
            ({ tipo: 'ventana', box_2d: box(0.2 + k * 0.3, 4.0, 3.0, 1.30) })), PUERTA],
        fachada_box_2d: null,
    }, FBS3, ASPECTO);
    ok('las 7 aberturas se siguen proponiendo', r.huecos.length === 7);
    ok('pero ninguna con medida', r.huecos.every(h => h.ancho === null && h.alto === null));
    ok('y se dice que la escala no cuadra',
        r.avisos.some(a => a.includes('no cuadra')), r.avisos[0]);
}

console.log('\n── Un hueco no puede ser más alto que su planta ─────────────────');
{
    const r = aMetros({
        encuadre: 'completa',
        huecos: [{ tipo: 'ventana', box_2d: box(2.0, 0.5, 1.20, 5.0) }, PUERTA],
        fachada_box_2d: null,
    }, FBS3, ASPECTO);
    ok('un alto de 5 m con planta de 2,80 se descarta', r.huecos[0].alto === null,
        `alto=${r.huecos[0].alto}`);
    ok('pero su ancho se conserva', cerca(r.huecos[0].ancho, 1.20, 0.05),
        `${r.huecos[0].ancho} m`);
}

console.log('\n── Cajas que no son cajas ──────────────────────────────────────');
{
    const r = aMetros({
        encuadre: 'completa',
        huecos: [
            { tipo: 'ventana', box_2d: [500, 400, 300, 500] },   // invertida
            { tipo: 'ventana', box_2d: [0, 0, 2000, 500] },      // fuera de rango
            { tipo: 'ventana', box_2d: [10, 20] },               // incompleta
            { tipo: 'ventana' },                                  // sin caja
            PUERTA,
        ],
        fachada_box_2d: null,
    }, FBS3, ASPECTO);
    ok('las cuatro se cuentan', r.huecos.length === 5);
    ok('y ninguna de las cuatro malas se mide',
        r.huecos.slice(0, 4).every(h => h.ancho === null && h.alto === null));
    ok('la puerta buena sí', cerca(r.huecos[4].ancho, 0.90), `${r.huecos[4].ancho} m`);
}

console.log('\n── Un reflejo de 10 cm no es una ventana ───────────────────────');
{
    const r = aMetros({
        encuadre: 'completa',
        huecos: [{ tipo: 'ventana', box_2d: box(1.0, 5.0, 0.12, 0.12) }, PUERTA],
        fachada_box_2d: null,
    }, FBS3, ASPECTO);
    ok('una medida por debajo del mínimo no se propone',
        r.huecos[0].ancho === null, `${r.huecos[0].ancho}`);
}

console.log('\n── Sin nada que medir, nada revienta ───────────────────────────');
{
    ok('pared vacía', aMetros({ encuadre: 'completa', huecos: [] }, {}, null).huecos.length === 0);
    ok('lectura sin huecos ni pared',
        Array.isArray(aMetros({}, {}, null).huecos));
    ok('la puerta de referencia es 2,05 m', PUERTA_ALTO_M === 2.05);
    const r = aMetros({ encuadre: 'parcial', huecos: [PUERTA] }, FBS3, ASPECTO);
    ok('un encuadre parcial avisa de que puede faltar algo fuera',
        r.avisos.some(a => a.includes('fuera del encuadre')));
    ok('pero con la puerta a la vista SÍ mide', cerca(r.huecos[0].ancho, 0.90),
        `${r.huecos[0].ancho} m`);
}

console.log('\n── La CAJA de cada hueco viaja, para poder señalarlo en la foto ──');
{
    const r = aMetros({
        encuadre: 'completa',
        huecos: [VENTANA(2.0), PUERTA],
        fachada_box_2d: null,
    }, FBS3, ASPECTO);
    const b = r.huecos[0].box;
    ok('el hueco leido trae su caja', !!b, JSON.stringify(b));
    ok('en fracciones del encuadre, no en 0-1000',
        b && b.x > 0 && b.x < 1 && b.ancho > 0 && b.ancho < 1);
    ok('es la ESQUINA, no el centro: cae donde se dibuja',
        cerca(b.x, 2.0 / ANCHO_VISIBLE, 0.005), `x=${b.x}`);
    ok('un hueco sin caja no inventa una',
        aMetros({ encuadre: 'completa', huecos: [{ tipo: 'ventana' }] }, FBS3, ASPECTO)
            .huecos[0].box === null);
}

console.log('\n── Lo que se guarda de una MARCA ────────────────────────────────');
{
    const { normalizarMarcas, MAX_MARCAS } = require('../services/paredFotoService.js');
    const buena = { uid: 'abc123', box: { x: 0.15, y: 0.38, ancho: 0.2, alto: 0.27 } };

    ok('una marca buena se guarda', normalizarMarcas([buena]).length === 1);
    ok('y nace «a mano» si no se dice otra cosa', normalizarMarcas([buena])[0].de === 'mano');
    ok('lo LEIDO se distingue de lo puesto a mano',
        normalizarMarcas([{ ...buena, de: 'lectura' }])[0].de === 'lectura');

    ok('sin uid no se guarda', normalizarMarcas([{ box: buena.box }]).length === 0);
    ok('sin caja tampoco', normalizarMarcas([{ uid: 'x' }]).length === 0);
    ok('una caja sin superficie no senala nada',
        normalizarMarcas([{ uid: 'x', box: { x: 0.1, y: 0.1, ancho: 0, alto: 0.2 } }]).length === 0);
    ok('una caja con texto dentro se descarta',
        normalizarMarcas([{ uid: 'x', box: { x: 'a', y: 0.1, ancho: 0.2, alto: 0.2 } }]).length === 0);

    const fuera = normalizarMarcas([{ uid: 'x', box: { x: -0.4, y: 1.9, ancho: 3, alto: 0.2 } }])[0];
    ok('lo que se sale del encuadre se recorta, no cuelga del borde',
        fuera.box.x === 0 && fuera.box.y === 1 && fuera.box.ancho === 1, JSON.stringify(fuera.box));

    ok('se redondea a milesimas',
        normalizarMarcas([{ uid: 'x', box: { x: 0.1234567, y: 0.2, ancho: 0.3, alto: 0.4 } }])[0]
            .box.x === 0.123);
    ok(`no se guardan mas de ${MAX_MARCAS}`,
        normalizarMarcas(Array.from({ length: 200 }, (_, k) => ({ ...buena, uid: `u${k}` })))
            .length === MAX_MARCAS);
    ok('un uid desmesurado se trunca',
        normalizarMarcas([{ ...buena, uid: 'z'.repeat(400) }])[0].uid.length === 40);
    ok('nada no revienta', normalizarMarcas(null).length === 0 && normalizarMarcas('x').length === 0);
}

console.log(`\n${fallos ? `❌ ${fallos} de ${total} FALLAN` : `✅ ${total} comprobaciones, todas bien`}\n`);
process.exit(fallos ? 1 : 0);
