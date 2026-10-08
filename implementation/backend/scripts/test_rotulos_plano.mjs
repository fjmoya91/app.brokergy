// ============================================================================
// test_rotulos_plano.mjs — los RÓTULOS del plano 2D no se pisan.
//
// Medido en 26RES060_188 (auditoría de los `<text>` del SVG): «GARAJE · NO
// CUENTA» tapado por «PVBSO1», los m² del porche encima de «FBN1», las cotas
// «3,51 m» y «3,50 m» una encima de otra. Cada capa colocaba lo suyo sin mirar
// a las demás. Ahora paredes, zonas, cuerpos, croquis y cotas comparten UNA
// pasada (`logic/rotulosPlano.js`); aquí se comprueba con casos pequeños:
//
//  - dos nombres que chocan → uno se mueve, o se esconde, según prioridad;
//  - una zona en L → la etiqueta DENTRO del polígono y fuera de los nombres;
//  - dos cotas casi iguales y pegadas → una sola;
//  - y que es determinista, barata y no esconde lo que no choca.
//
// $ node implementation/backend/scripts/test_rotulos_plano.mjs
// ============================================================================

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/cee-envolvente/logic');
const { colocarRotulosPlano, cotasDelPlano, distanciaAlBorde, poloInaccesible, cajaRotulo, seCortan,
        anchoRotulo, medidaMancha } =
    await import(pathToFileURL(path.join(LOGIC, 'rotulosPlano.js')).href);

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

const muro = (id, a, b, extra = {}) => ({ id, svg: [a, b], largo: Math.hypot(b[0] - a[0], b[1] - a[1]), ...extra });

//: La caja que ocupa en el plano un rótulo de pared tal y como lo pinta
//: `PlanoPlanta` (papel de 1,32 em, línea base a 0,30 em por debajo del centro).
const cajaPared = (r, tam) => cajaRotulo(r.x, r.y - tam * 0.30,
    Math.max(r.ancho, tam * (0.67 * r.texto.length + 0.2)), tam * 1.32);
const cajaZona = (z, tam) => {
    const { ancho, alto } = medidaMancha({ titulo: z.titulo, sub: z.sub, tam, escala: z.escala });
    return cajaRotulo(z.cx, z.cy, ancho, alto);
};
const ningunoSePisa = (cajas) => {
    for (let i = 0; i < cajas.length; i++) {
        for (let j = i + 1; j < cajas.length; j++) {
            assert.ok(!seCortan(cajas[i], cajas[j]), `se pisan ${cajas[i].que} y ${cajas[j].que}`);
        }
    }
};

const TAM = 0.5;

console.log('\nDOS NOMBRES QUE CHOCAN');
prueba('el de la pared LARGA se queda en su medio y el otro se aparta (los dos se ven)', () => {
    const A = muro('A', [0, 0], [6, 0]);
    const B = muro('B', [1, 0.4], [5, 0.4]);
    const r = colocarRotulosPlano({ muros: [A, B], tam: TAM, hacia: [3, 5] });
    const a = r.paredes.find(p => p.id === 'A'), b = r.paredes.find(p => p.id === 'B');
    assert.ok(a && b, 'tienen que verse los dos');
    assert.equal(a.x, 3); assert.ok(Math.abs(a.y - (0 + TAM * 0.35)) < 1e-9, 'A, en el sitio de siempre');
    assert.ok(!seCortan(cajaPared(a, TAM), cajaPared(b, TAM)), 'y ya no se pisan');
});
prueba('la SELECCIONADA gana su sitio aunque sea la corta', () => {
    const A = muro('A', [0, 0], [6, 0]);
    const B = muro('B', [1, 0.4], [5, 0.4]);
    const r = colocarRotulosPlano({ muros: [A, B], tam: TAM, sel: 'B', hacia: [3, 5] });
    const b = r.paredes.find(p => p.id === 'B');
    assert.equal(b.x, 3); assert.ok(Math.abs(b.y - (0.4 + TAM * 0.35)) < 1e-9);
    assert.equal(b.destacado, true);
    const a = r.paredes.find(p => p.id === 'A');
    if (a) assert.ok(!seCortan(cajaPared(a, TAM), cajaPared(b, TAM)));
});
prueba('apretadas sin sitio: se ESCONDEN las cortas, nunca se pintan encima', () => {
    // Treinta tabiques de 2 m a 0,3 m uno de otro: no caben todos los nombres.
    const muros = Array.from({ length: 30 }, (_, i) => muro(`T${i}`, [0, i * 0.3], [2 - i * 0.02, i * 0.3]));
    const r = colocarRotulosPlano({ muros, tam: TAM, hacia: [1, 10] });
    assert.ok(r.paredes.length < 30, 'alguno tiene que esconderse');
    assert.ok(r.paredes.some(p => p.id === 'T0'), 'el más largo se ve');
    ningunoSePisa(r.paredes.map(p => ({ ...cajaPared(p, TAM), que: p.id })));
});
prueba('la seleccionada y la entrada se ven SIEMPRE, quepan o no', () => {
    const muros = Array.from({ length: 7 }, (_, i) => muro(`T${i}`, [0, i * 0.4], [2 - i * 0.05, i * 0.4]));
    const r = colocarRotulosPlano({ muros, tam: TAM, sel: 'T5', entrada: 'T6', hacia: [1, 10] });
    assert.ok(r.paredes.some(p => p.id === 'T5' && p.destacado));
    assert.ok(r.paredes.some(p => p.id === 'T6' && p.destacado));
});
prueba('con el ENTORNO a la vista solo van los forzados (y la cota de la seleccionada)', () => {
    const muros = [muro('A', [0, 0], [6, 0]), muro('B', [6, 0], [6, 5]), muro('C', [6, 5], [0, 5])];
    const r = colocarRotulosPlano({ muros, tam: TAM, sel: 'B', entrada: 'C', entorno: true, hacia: [3, 2.5] });
    assert.deepEqual(r.paredes.map(p => p.id).sort(), ['B', 'C']);
    assert.deepEqual(r.cotas.map(c => c.id), ['B']);
});
prueba('lo que NO choca se queda donde estaba (el rótulo de siempre, centrado en el muro)', () => {
    const muros = [muro('A', [0, 0], [8, 0]), muro('B', [8, 0], [8, 8]), muro('C', [8, 8], [0, 8]),
                   muro('D', [0, 8], [0, 0])];
    const r = colocarRotulosPlano({ muros, tam: TAM, hacia: [4, 4] });
    assert.equal(r.paredes.length, 4);
    for (const p of r.paredes) {
        const m = muros.find(x => x.id === p.id);
        const cx = (m.svg[0][0] + m.svg[1][0]) / 2, cy = (m.svg[0][1] + m.svg[1][1]) / 2;
        assert.ok(Math.abs(p.x - cx) < 1e-9 && Math.abs(p.y - (cy + TAM * 0.35)) < 1e-9, `${p.id} se ha movido`);
        assert.ok(Math.abs(p.ancho - anchoRotulo(p.texto, TAM)) < 1e-9, 'el papel, el de siempre');
    }
    assert.equal(r.cotas.length, 4, 'y las cuatro cotas');
});

console.log('\nUNA ZONA EN L');
//: Un garaje en L con brazos de 3 m: el centro de su CAJA (5, 5) cae FUERA
//: del polígono — es donde se pintaba la etiqueta hasta ahora.
const L = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 10], [0, 10]];
const murosL = L.map((p, i) => muro(`W${i + 1}`, p, L[(i + 1) % L.length]));
// Y un tabique que cruza el brazo horizontal, con su nombre en el medio.
murosL.push(muro('PV1', [6, 0], [6, 3]));
prueba('el centro de la caja de una L cae fuera: por eso no vale', () => {
    assert.ok(distanciaAlBorde(5, 5, L) < 0);
    const polo = poloInaccesible(L, 0.05);
    assert.ok(polo.d > 1.4 && distanciaAlBorde(polo.x, polo.y, L) > 1.4, 'el polo, en un brazo, a 1,5 m del borde');
});
prueba('la etiqueta cae DENTRO, entera, y fuera de los nombres de pared', () => {
    const tam = 0.4;
    const zonas = [{ indice: 0, uso: 'GARAJE', lienzo: L, area_real: 51 }];
    const r = colocarRotulosPlano({ muros: murosL, zonas, tam, hacia: [3, 3] });
    const z = r.zonas.get(0);
    assert.ok(z, 'la zona tiene etiqueta');
    assert.equal(z.titulo, 'GARAJE · NO CUENTA', 'cabe entera: no hace falta la compacta');
    const c = cajaZona(z, tam);
    for (const [x, y] of [[c.x0, c.y0], [c.x1, c.y0], [c.x0, c.y1], [c.x1, c.y1]]) {
        assert.ok(distanciaAlBorde(x, y, L) > 0, `la esquina (${x.toFixed(2)}, ${y.toFixed(2)}) se sale`);
    }
    for (const p of r.paredes) {
        assert.ok(!seCortan(c, cajaPared(p, tam)), `pisa el nombre ${p.id}`);
    }
    // Y no se sienta encima del tabique: cae a un lado de x = 6.
    assert.ok(c.x1 <= 6 || c.x0 >= 6, 'tapa el tabique PV1');
});
prueba('en una mancha PEQUEÑA va la versión COMPACTA (solo el uso y los m²)', () => {
    const tam = 0.5;
    const peq = [[0, 0], [2.6, 0], [2.6, 1.6], [0, 1.6]];
    const r = colocarRotulosPlano({ muros: [], zonas: [{ indice: 3, uso: 'GARAJE', lienzo: peq, area_real: 4.16 }],
                                    tam, hacia: [1, 1] });
    const z = r.zonas.get(3);
    assert.equal(z.titulo, 'GARAJE');
    assert.equal(z.sub, '4,16 m²');
    const c = cajaZona(z, tam);
    assert.ok(c.x0 >= 0 && c.x1 <= 2.6 && c.y0 >= 0 && c.y1 <= 1.6, 'y cabe dentro');
});
prueba('el cuerpo que NO CUENTA lleva su rótulo, y el de pasar el ratón NO mueve a nadie', () => {
    const cuerpos = [{ id: 'k1', contornos: [L], fueraAqui: true },
                     { id: 'k2', contornos: [[[12, 0], [16, 0], [16, 4], [12, 4]]], fueraAqui: false,
                       construccion: { uso: 'ALMACEN' }, superficie: 16 }];
    const muros = [...murosL, muro('X1', [12, 0], [16, 0]), muro('X2', [16, 0], [16, 4])];
    const sin = colocarRotulosPlano({ muros, cuerpos, tam: 0.4, hacia: [5, 3] });
    assert.equal(sin.cuerpos.get('k1').texto, 'NO CUENTA');
    assert.equal(sin.cuerpos.has('k2'), false, 'sin el ratón encima no se rotula');
    const con = colocarRotulosPlano({ muros, cuerpos, cuerpoSobre: 'k2', tam: 0.4, hacia: [5, 3] });
    assert.equal(con.cuerpos.get('k2').texto, 'ALMACEN · 16,00 m²');
    assert.deepEqual(con.paredes, sin.paredes, 'los nombres no se mueven');
    assert.deepEqual(con.cotas.map(c => c.id), sin.cotas.map(c => c.id));
});

console.log('\nCOTAS CASI IGUALES Y PEGADAS');
prueba('dos paredes paralelas a 30 cm, de 3,50 y 3,51 m → UNA cota', () => {
    const P = muro('P', [0, 0], [3.50, 0]);
    const Q = muro('Q', [0, -0.3], [3.51, -0.3]);
    const R = muro('R', [0, 0], [0, 5]);
    const cotas = cotasDelPlano([P, Q, R], { hacia: [2, 5], tam: TAM });
    assert.deepEqual(cotas.map(c => c.muro).sort(), ['Q', 'R'], 'se queda la de la más larga, y la otra pared aparte');
});
prueba('si la seleccionada es la otra, se queda la SUYA', () => {
    const P = muro('P', [0, 0], [3.50, 0]);
    const Q = muro('Q', [0, -0.3], [3.51, -0.3]);
    const cotas = cotasDelPlano([P, Q], { hacia: [2, 5], tam: TAM, sel: 'P' });
    assert.deepEqual(cotas.map(c => c.muro), ['P']);
});
prueba('dos paredes IGUALES pero lejos (las dos fachadas de un pasillo) llevan cada una la suya', () => {
    const P = muro('P', [0, 0], [3.5, 0]);
    const Q = muro('Q', [0, 6], [3.5, 6]);
    const cotas = cotasDelPlano([P, Q], { hacia: [1.75, 3], tam: TAM });
    assert.equal(cotas.length, 2);
});
prueba('ninguna cota pisa a otra ni a un nombre (las que chocan se escalonan o se omiten)', () => {
    const muros = [muro('A', [0, 0], [2.2, 0]), muro('B', [2.2, 0], [2.2, 2.1]), muro('C', [2.2, 2.1], [4.4, 2.1]),
                   muro('D', [4.4, 2.1], [4.4, 0]), muro('E', [4.4, 0], [8, 0]), muro('F', [8, 0], [8, 6]),
                   muro('G', [8, 6], [0, 6]), muro('H', [0, 6], [0, 0])];
    const r = colocarRotulosPlano({ muros, tam: TAM, hacia: [4, 3] });
    const cajas = [
        ...r.paredes.map(p => ({ ...cajaPared(p, TAM), que: p.id })),
        ...r.cotas.map(({ id, c }) => {
            const rad = (c.en.rot * Math.PI) / 180, n = c.texto.length;
            return { ...cajaRotulo(c.en.x + TAM * 0.29 * Math.sin(rad), c.en.y - TAM * 0.29 * Math.cos(rad),
                                   Math.max(n * 0.4 * TAM + TAM * 0.24, n * 0.57 * 0.8 * TAM + TAM * 0.1), TAM,
                                   c.en.rot), que: `cota ${id}` };
        }),
    ];
    ningunoSePisa(cajas);
});

console.log('\n26RES060_188, CON SU GEOMETRÍA DE VERDAD (la de la auditoría)');
//: Las dos plantas tal y como las pinta la ventana (redondeadas al cm). Antes:
//: «GARAJE · NO CUENTA» bajo «PVBSO1», «5,60 m²» bajo «FBN1», «ALMACÉN · NO
//: CUENTA» bajo «PV1E1» y «7,52 m²» bajo «PV1N1».
const de188 = (lista) => lista.map(([id, svg, interior]) => ({ id, svg, interior: !!interior,
                                                              largo: Math.hypot(svg[1][0] - svg[0][0], svg[1][1] - svg[0][1]) }));
const T188 = 0.6768421052631579;
const BAJA = de188([['FBE1', [[22.29, 12.95], [23.57, 7.91]]], ['FBN1', [[7.08, 7.08], [3.81, 5.84]]],
    ['FBN2', [[23.57, 7.91], [17.49, 5.6]]], ['FBO1', [[3.81, 5.84], [3.57, 6.76]]], ['FBO2', [[3.57, 6.76], [2.14, 11.62]]],
    ['FBS1', [[2.14, 11.62], [6.36, 13.18]]], ['PVBE1', [[6.36, 13.18], [8.02, 7.44]], 1],
    ['PVBN1', [[8.02, 7.44], [7.08, 7.08]], 1], ['PVBO1', [[17.49, 5.6], [16.05, 9.34]], 1],
    ['PVBS1', [[17.15, 11.01], [22.29, 12.95]], 1], ['PVBSO1', [[16.05, 9.34], [17.15, 11.01]], 1]]);
const ZONAS_BAJA = [
    { indice: 0, uso: 'GARAJE', area_real: 139.16, lienzo: [[22.29, 12.95], [20.95, 18.32], [20.58, 18.46], [6.36, 13.18],
        [8.02, 7.44], [7.08, 7.08], [7.49, 5.53], [8.37, 2.14], [12.82, 3.83], [17.49, 5.6], [16.95, 7.01], [16.05, 9.34],
        [17.15, 11.01], [22.29, 12.95]] },
    { indice: 1, uso: 'PORCHE', area_real: 5.6, lienzo: [[4.21, 4.28], [7.49, 5.53], [7.08, 7.08], [3.81, 5.84], [4.21, 4.28]] }];
const PRIMERA = de188([['F1E1', [[20.95, 18.32], [23.35, 8.76]]], ['F1E2', [[23.35, 8.76], [23.57, 7.91]]],
    ['F1N1', [[23.57, 7.91], [17.49, 5.6]]], ['F1N2', [[12.82, 3.83], [8.37, 2.14]]], ['F1N3', [[7.49, 5.53], [4.21, 4.28]]],
    ['F1O1', [[8.37, 2.14], [7.49, 5.53]]], ['F1O2', [[4.21, 4.28], [3.81, 5.84]]], ['F1O3', [[8.02, 7.44], [6.36, 13.18]]],
    ['F1S1', [[6.36, 13.18], [20.58, 18.46]]], ['F1S2', [[20.58, 18.46], [20.95, 18.32]]],
    ['F1S3', [[3.81, 5.84], [8.02, 7.44]]], ['PV1E1', [[12.28, 5.23], [12.82, 3.83]], 1],
    ['PV1N1', [[16.95, 7.01], [12.28, 5.23]], 1], ['PV1O1', [[17.49, 5.6], [16.95, 7.01]], 1]]);
const ZONAS_PRIMERA = [{ indice: 2, uso: 'ALMACEN', area_real: 7.52,
    lienzo: [[17.49, 5.6], [16.95, 7.01], [12.28, 5.23], [12.82, 3.83], [17.49, 5.6]] }];
const cajasDe = (r, tam) => [
    ...r.paredes.map(p => ({ ...cajaPared(p, tam), que: p.id })),
    ...[...r.zonas.values()].map(z => ({ ...cajaZona(z, tam), que: z.titulo })),
    ...r.cotas.map(({ id, c }) => {
        const rad = (c.en.rot * Math.PI) / 180, n = c.texto.length;
        return { ...cajaRotulo(c.en.x + tam * 0.29 * Math.sin(rad), c.en.y - tam * 0.29 * Math.cos(rad),
                               Math.max(n * 0.4 * tam + tam * 0.24, n * 0.57 * 0.8 * tam + tam * 0.1), tam,
                               c.en.rot), que: `cota ${id}` };
    }),
];
for (const [nombre, muros, zonas, hacia] of [['planta baja', BAJA, ZONAS_BAJA, [11.59, 8.98]],
                                              ['planta 1', PRIMERA, ZONAS_PRIMERA, [13.3, 8.11]]]) {
    // (Antes, en la baja se escondía FBO1; en la primera, PV1O1 se escondía
    // con la primera versión de esta pasada.)
    prueba(`${nombre}: nada se pisa y se ven TODOS los nombres`, () => {
        const r = colocarRotulosPlano({ muros, zonas, tam: T188, hacia, entrada: 'FBE1',
                                        interior: m => m.interior });
        ningunoSePisa(cajasDe(r, T188));
        assert.deepEqual(r.paredes.map(p => p.id).sort(), muros.map(m => m.id).sort());
        for (const z of zonas) {
            const e = r.zonas.get(z.indice);
            assert.ok(distanciaAlBorde(e.cx, e.cy, z.lienzo) > 0, `la etiqueta de ${z.uso} cae fuera de su zona`);
        }
    });
}
prueba('el garaje (139 m²) va ENTERO; el porche (5,6 m²) y el almacén (7,5 m²), en COMPACTA', () => {
    const b = colocarRotulosPlano({ muros: BAJA, zonas: ZONAS_BAJA, tam: T188, hacia: [11.59, 8.98] });
    assert.equal(b.zonas.get(0).titulo, 'GARAJE · NO CUENTA');
    assert.equal(b.zonas.get(1).titulo, 'PORCHE');
    const p = colocarRotulosPlano({ muros: PRIMERA, zonas: ZONAS_PRIMERA, tam: T188, hacia: [13.3, 8.11] });
    assert.equal(p.zonas.get(2).titulo, 'ALMACÉN');
    assert.equal(p.zonas.get(2).sub, '7,52 m²');
});

console.log('\nDETERMINISTA Y BARATO');
//: Un adosado sin delimitar: 26RES060_205 traía 188 paredes.
const muchos = [];
for (let i = 0; i < 14; i++) {
    for (let k = 0; k < 7; k++) {
        const x = i * 4, y = k * 5;
        muchos.push(muro(`M${i}_${k}a`, [x, y], [x + 4, y]));
        muchos.push(muro(`M${i}_${k}b`, [x, y], [x, y + 5]));
    }
}
const zonasMuchos = [{ indice: 0, uso: 'GARAJE', lienzo: [[0, 0], [12, 0], [12, 10], [0, 10]], area_real: 120 }];
prueba('los mismos datos dan los mismos rótulos', () => {
    const a = colocarRotulosPlano({ muros: muchos, zonas: zonasMuchos, tam: 1.4, hacia: [28, 17] });
    const b = colocarRotulosPlano({ muros: [...muchos].reverse(), zonas: zonasMuchos, tam: 1.4, hacia: [28, 17] });
    assert.deepEqual(a.paredes.map(p => [p.id, p.x, p.y]).sort(), b.paredes.map(p => [p.id, p.x, p.y]).sort());
    assert.deepEqual([...a.zonas], [...b.zonas]);
});
//: Se toma la pasada MÁS RÁPIDA de diez: la media sube y baja con lo que
//: esté haciendo el ordenador en ese momento, y aquí se mide el algoritmo.
const mejorDe = (fn, N = 10) => {
    fn();
    let min = Infinity;
    for (let i = 0; i < N; i++) { const t0 = performance.now(); fn(); min = Math.min(min, performance.now() - t0); }
    return min;
};
prueba(`${muchos.length} paredes apretadas (un adosado sin delimitar) en menos de 40 ms`, () => {
    const ms = mejorDe(() => colocarRotulosPlano({ muros: muchos, zonas: zonasMuchos, tam: 1.4, hacia: [28, 17] }));
    console.log(`    (${ms.toFixed(1)} ms por pasada)`);
    assert.ok(ms < 40, `${ms.toFixed(1)} ms`);
});
prueba('y si no cambia nada, NO se recalcula (el plano se repinta a cada movimiento del ratón)', () => {
    const memoria = {};
    const datos = { muros: muchos, zonas: zonasMuchos, tam: 1.4, hacia: [28, 17] };
    const a = colocarRotulosPlano(datos, memoria);
    assert.equal(colocarRotulosPlano({ ...datos, hacia: [28, 17] }, memoria), a, 'mismo resultado, sin recalcular');
    const ms = mejorDe(() => colocarRotulosPlano({ ...datos }, memoria));
    assert.ok(ms < 2, `${ms.toFixed(2)} ms`);
    assert.notEqual(colocarRotulosPlano({ ...datos, sel: 'M0_0a' }, memoria), a, 'otra selección sí recoloca');
});

console.log(`\n${ok} comprobaciones`);
if (process.exitCode) console.error('HAY FALLOS');
else console.log('todo correcto\n');
