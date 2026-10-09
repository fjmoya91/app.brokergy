/**
 * Los EQUIPOS en el plano de la envolvente (caldera actual, equipo nuevo,
 * depósito de ACS, unidad exterior) y el PLANO DE CUBIERTA, en la ventana y en
 * el croquis PDF.
 *
 *   node implementation/backend/scripts/test_equipos_plano.mjs
 *
 * Lo pidió Fran el 09/10/2026: marcar en el plano dónde está la caldera vieja,
 * dónde va la nueva y el ACS, y si la unidad exterior va en el tejado, un plano
 * más de la cubierta. Sin red, sin BD y sin motor: geometría inventada.
 */
import { createRequire } from 'module';
import {
    NIVEL_CUBIERTA, TIPOS_EQUIPO, alLienzo, alMundo, anilloDeMuros, equiposEnLienzo, equiposValidos,
    faldonesCubierta, iconoSvg, nombreDelSitio, ponEquipo, quitaEquipo, separarMarcas,
} from '../../frontend/src/features/cee-envolvente/logic/equiposPlano.js';
import { aplicarTrabajo, trasladarTrabajo } from '../../frontend/src/features/cee-envolvente/logic/trabajoGuardado.js';
import { cajaDeMarca, marcasDelPlano, sitioRotuloFaldon } from '../../frontend/src/features/cee-envolvente/logic/equiposPlano.js';
import { colocarRotulosPlano, poloInaccesible } from '../../frontend/src/features/cee-envolvente/logic/rotulosPlano.js';

const require = createRequire(import.meta.url);
let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };

// ── 1. Lo guardado se SANEA: tipos conocidos, nivel válido, uno de cada ─────────
{
    const l = equiposValidos([
        { tipo: 'ud_exterior', nivel: NIVEL_CUBIERTA, punto: [500010.123, 4300020.456] },
        { tipo: 'caldera_actual', nivel: 0, punto: ['500001', '4300002'] },
        { tipo: 'nevera', nivel: 0, punto: [1, 2] },
        { tipo: 'acs', nivel: 'tejado', punto: [1, 2] },
        { tipo: 'acs', nivel: 1.5, punto: [1, 2] },
        { tipo: 'equipo_nuevo', nivel: 0, punto: [NaN, 2] },
        { tipo: 'caldera_actual', nivel: 1, punto: [500003, 4300004] },
        null, 'x',
    ]);
    ok(l.length === 2, `quedan 2 válidos de 9 (${l.length})`);
    ok(l[0].tipo === 'caldera_actual' && l[1].tipo === 'ud_exterior', 'en el orden de los tipos, no en el de llegada');
    ok(l[0].nivel === 1 && l[0].punto[0] === 500003, 'un tipo repetido: manda el ÚLTIMO');
    ok(l[1].punto[0] === 500010.12 && l[1].punto[1] === 4300020.46, 'el punto se redondea al centímetro');
    ok(equiposValidos(undefined).length === 0 && equiposValidos({}).length === 0, 'un trabajo viejo o roto da []');
}

// ── 2. Poner y quitar ───────────────────────────────────────────────────────────
{
    let l = ponEquipo([], { tipo: 'caldera_actual', nivel: 0, punto: [1, 1] });
    l = ponEquipo(l, { tipo: 'equipo_nuevo', nivel: 0, punto: [1, 1] });
    l = ponEquipo(l, { tipo: 'caldera_actual', nivel: 0, punto: [5, 5] });
    ok(l.length === 2, 'poner otra vez el mismo tipo lo CAMBIA de sitio, no lo duplica');
    ok(l.find(e => e.tipo === 'caldera_actual').punto[0] === 5, '…y queda donde se ha puesto lo último');
    l = quitaEquipo(l, 'caldera_actual');
    ok(l.length === 1 && l[0].tipo === 'equipo_nuevo', 'quitar quita solo ese tipo');
}

// ── 3. Mundo ⇄ lienzo, con la MISMA traslación que las zonas ───────────────────
{
    const lam = { dx: 500000, y0: 4300030 };
    const m = alMundo([12.34, 5.67], lam);
    ok(m[0] === 500012.34 && m[1] === 4300024.33, 'del lienzo al mundo: x + dx, y0 − y');
    const v = alLienzo(m, lam);
    ok(v[0] === 12.34 && v[1] === 5.67, 'y de vuelta, sin perder un centímetro');
    ok(equiposEnLienzo([{ tipo: 'acs', nivel: 0, punto: m }], null).length === 0, 'sin georreferencia no se pinta nada');
}

// ── 4. Viaja con el TRABAJO y no se traslada al volver a medir ──────────────────
{
    const g = { equipos_plano: [{ tipo: 'acs', nivel: 1, punto: [500002, 4300003] }],
                lienzo_ref: { dx: 499990, y0: 4300040 },
                cubierta_reforma: { PB: { poligono: [[1, 1], [2, 2], [3, 1]] } } };
    const t = trasladarTrabajo(g, [10, -10]);
    ok(t.equipos_plano[0].punto[0] === 500002, 'trasladar el trabajo NO mueve los equipos (van en el mundo)');
    ok(t.cubierta_reforma.PB.poligono[0][0] === 11, '…y sí lo que va en el lienzo (la cubierta)');
    const r = aplicarTrabajo({}, g, k => k, { paredDibujada: d => d, rescatarHueco: h => h, medirPared: () => ({}) });
    ok(r.equiposPlano.length === 1 && r.equiposPlano[0].tipo === 'acs', 'aplicarTrabajo devuelve los equipos guardados');
    const r0 = aplicarTrabajo({}, {}, k => k, { paredDibujada: d => d, rescatarHueco: h => h, medirPared: () => ({}) });
    ok(Array.isArray(r0.equiposPlano) && r0.equiposPlano.length === 0, 'un trabajo sin equipos da []');
}

// ── 5. Los FALDONES de la cubierta ──────────────────────────────────────────────
const muro = (id, planta, nivel, svg) => ({ id, planta, nivel, tipo: 'FACHADA', svg, alto: 2.8,
                                            largo: Math.hypot(svg[1][0] - svg[0][0], svg[1][1] - svg[0][1]),
                                            superficie: 28, orientacion: 'S' });
const cuadrado = (planta, nivel, x0, y0, x1, y1) => [
    muro(`F${planta}S`, planta, nivel, [[x0, y1], [x1, y1]]),
    muro(`F${planta}E`, planta, nivel, [[x1, y1], [x1, y0]]),
    muro(`F${planta}N`, planta, nivel, [[x1, y0], [x0, y0]]),
    muro(`F${planta}O`, planta, nivel, [[x0, y0], [x0, y1]]),
];
const plantas = [
    { id: 'PB', nombre: 'PLANTA BAJA', nivel: 0, superficie: 100, habitable: true, muros: cuadrado('PB', 0, 5, 5, 15, 15) },
    { id: 'P1', nombre: 'PLANTA 1', nivel: 1, superficie: 100, habitable: true, muros: cuadrado('P1', 1, 5, 5, 15, 15) },
];
const cuerpos = [
    { id: 'G', niveles: [0], contornos: [[[15, 8], [21, 8], [21, 15], [15, 15]]] },
    { id: 'A', niveles: [0, 1], contornos: [[[5, 5], [15, 5], [15, 15], [5, 15]]] },
];
{
    const f = faldonesCubierta({ cuerpos, plantas });
    ok(f.length === 2, 'un faldón por edificación');
    ok(f[0].nivel === 0 && f[1].nivel === 1, 'del más bajo al más alto (el garaje debajo de la casa)');
    const sin = faldonesCubierta({ cuerpos: [], plantas });
    ok(sin.length === 2 && sin.every(x => x.puntos.length === 4), 'sin cuerpos, el contorno de cada planta por sus muros');
    ok(anilloDeMuros(plantas[0].muros.slice(0, 3)) === null, 'unos muros que no cierran no dan contorno');
}

// ── 6. Dos iconos en el mismo sitio se CORREN ───────────────────────────────────
{
    const m = separarMarcas([{ tipo: 'caldera_actual', lienzo: [10, 10] },
                             { tipo: 'equipo_nuevo', lienzo: [10, 10] },
                             { tipo: 'acs', lienzo: [30, 30] }], 2);
    ok(!m[0].corrida && m[1].corrida && m[1].pos[0] === 12, 'la máquina nueva donde la caldera: se corre un paso');
    ok(m[1].ancla[0] === 10, '…y se dibuja unida a su punto de verdad');
    ok(!m[2].corrida, 'el que está lejos no se toca');
}

// ── 7. Los iconos y los nombres ─────────────────────────────────────────────────
{
    ok(TIPOS_EQUIPO.length === 4, 'cuatro tipos: caldera actual, equipo nuevo, ACS y unidad exterior');
    ok(TIPOS_EQUIPO.every(t => iconoSvg(t.id, 0, 0, 6).includes('<path')), 'cada tipo tiene su icono');
    ok(iconoSvg('nevera', 0, 0, 6) === '', 'un tipo desconocido no pinta nada');
    ok(nombreDelSitio(NIVEL_CUBIERTA, plantas) === 'Cubierta', 'la cubierta se llama «Cubierta»');
    ok(nombreDelSitio(1, plantas) === 'Planta 1' && nombreDelSitio(0, plantas) === 'Planta baja'
       && nombreDelSitio(2, plantas) === 'Planta 2', 'la planta, por su nombre y en minúsculas como «Cubierta»');
}

// ── 8. El CROQUIS PDF: iconos, hoja de cubierta y cuadro de equipos ─────────────
{
    const croq = require('../services/cee/croquisCee.js');
    const lam = { dx: 500000, y0: 4300030 };
    const geo = {
        georef: { bbox: [500000, 4299990, 500040, 4300030], en_el_lienzo: { x: 0, y: 0 } },
        plantas, cuerpos, contexto: { vecinos: [], parcela: [] },
    };
    const trabajo = {
        lienzo_ref: lam,
        equipos_plano: [
            { tipo: 'caldera_actual', nivel: 0, punto: alMundo([7, 13], lam) },
            { tipo: 'equipo_nuevo', nivel: 0, punto: alMundo([7, 13], lam) },
            { tipo: 'acs', nivel: 1, punto: alMundo([12, 7], lam) },
            { tipo: 'ud_exterior', nivel: NIVEL_CUBIERTA, punto: alMundo([18, 11], lam) },
        ],
    };
    const html = await croq.componerCroquisHtml({ cabecera: { numero: 'PRUEBA' }, geo, trabajo });
    ok((html.match(/class="hoja"/g) || []).length === 4, 'cuatro hojas: dos plantas, la cubierta y los cuadros');
    ok(/<h2>Cubierta/.test(html) && html.includes('clip-path="url(#cf0)"') && !html.includes('<pattern id="trTeja"'),
       'la hoja de CUBIERTA lleva su tejado con tejas, en VECTORIAL (sin <pattern>, que el PDF rasteriza)');
    ok(html.includes('CALDERA ACTUAL') && html.includes('EQUIPO NUEVO') && html.includes('UD. EXTERIOR'),
       'los rótulos de los equipos salen en el plano');
    ok(html.includes('Ubicación de los equipos'), 'y el cuadro de dónde está cada uno');
    ok(html.includes('Pág. 4 de 4'), 'la numeración cuenta la hoja de cubierta');
    const sinEquipos = await croq.componerCroquisHtml({ cabecera: { numero: 'PRUEBA' }, geo, trabajo: { lienzo_ref: lam } });
    ok((sinEquipos.match(/class="hoja"/g) || []).length === 3 && !sinEquipos.includes('Ubicación de los equipos')
       && !/<h2>Cubierta/.test(sinEquipos), 'sin equipos, el croquis de siempre (sin hoja de cubierta ni cuadro)');
    const soloPlanta = await croq.componerCroquisHtml({ cabecera: { numero: 'PRUEBA' }, geo,
        trabajo: { lienzo_ref: lam, equipos_plano: trabajo.equipos_plano.slice(0, 1) } });
    ok(!/<h2>Cubierta/.test(soloPlanta), 'sin nada en el tejado no hay hoja de cubierta');
}

// ── 9. Revisión de diseño (09/10/2026): rótulos que no se pisan ─────────────────
{
    const tam = 0.5;
    const m = marcasDelPlano([{ tipo: 'caldera_actual', lienzo: [10, 10] },
                              { tipo: 'equipo_nuevo', lienzo: [10, 10] }], tam);
    const [a, b] = m.map(cajaDeMarca);
    ok(a.x1 <= b.x0, 'dos iconos en el mismo sitio: sus RÓTULOS tampoco se tocan');
    // Un muro cuyo nombre caería justo encima del icono: la pasada lo aparta o lo esconde.
    const muros = [{ id: 'FBS1', svg: [[4, 10.6], [16, 10.6]], largo: 12 }];
    const sin = colocarRotulosPlano({ muros, tam, hacia: [10, 0] });
    const con = colocarRotulosPlano({ muros, tam, hacia: [10, 0],
                                      equipos: m.map(x => ({ id: x.e.tipo, caja: cajaDeMarca(x) })) });
    const pisa = (r) => r && [a, b].some(c => r.x > c.x0 - tam && r.x < c.x1 + tam && r.y > c.y0 && r.y - tam < c.y1);
    ok(pisa(sin.paredes[0]), '(sin iconos, el nombre del muro caía ahí)');
    ok(!pisa(con.paredes[0]), 'con los iconos en la pasada, el nombre del muro se aparta o se esconde');
    // El rótulo «sobre planta 1» no se queda debajo de la unidad exterior.
    const faldon = [[0, 0], [20, 0], [20, 10], [0, 10]];
    const ud = marcasDelPlano([{ tipo: 'ud_exterior', lienzo: [10, 5] }], tam);
    const [x, y] = sitioRotuloFaldon(faldon, ud, poloInaccesible);
    ok(y > cajaDeMarca(ud[0]).y1 && Math.abs(x - 10) < 1, 'el rótulo del faldón baja por debajo del icono que tiene encima');
    const [, y2] = sitioRotuloFaldon(faldon, [], poloInaccesible);
    ok(Math.abs(y2 - 5) < 0.5, 'sin icono, en el punto más holgado del faldón');
    // La unidad a UN LADO del rótulo (a ~2 lados del centro): su «Ud. ext.» se
    // comía la cola de «sobre planta b…» (segunda revisión, 17 de 117 sitios).
    const texto = 'sobre planta baja', fs = tam * 0.75;
    const corta = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    let pisados = 0;
    for (let dx = -6; dx <= 6; dx += 0.5) {
        for (let dy = -2; dy <= 2; dy += 0.5) {
            const u = marcasDelPlano([{ tipo: 'ud_exterior', lienzo: [10 + dx, 5 + dy] }], tam);
            const [lx, ly] = sitioRotuloFaldon(faldon, u, poloInaccesible, { texto, fs });
            const w = texto.length * fs * 0.6;
            if (corta({ x0: lx - w / 2, x1: lx + w / 2, y0: ly - fs * 0.95, y1: ly + fs * 0.3 }, cajaDeMarca(u[0]))) pisados++;
        }
    }
    ok(pisados === 0, `el rótulo del faldón no queda bajo la unidad exterior, esté donde esté (${pisados} sitios pisados de 225)`);
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
