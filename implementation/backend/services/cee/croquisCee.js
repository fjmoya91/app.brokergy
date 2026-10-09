// ============================================================================
// croquisCee.js — el CROQUIS de la envolvente de un `.cex`, en PDF.
//
// Es un PLANO DE OBRA, con la marca de BROKERGY, que sirve para revisar un
// borrador y para enseñarlo en una auditoría: una planta por hoja a escala
// normalizada, muros con su grosor y su tipo, ventanas y puertas con su símbolo,
// cotas y lo que no es vivienda. Al final, el cuadro de superficies, el de
// huecos y el de cerramientos.
//
// REGLAS
//   · NO lleva avisos, decisiones ni el detalle de instalaciones (decisión del
//     usuario, 2026-10-05: «lo que quiero es que se vea el plano bien, que se
//     distingan muros, ventanas, etc., para usarlo incluso en una auditoría»).
//     Lo pendiente vive en la ventana de la envolvente y en el aviso del agente.
//   · El DIBUJO sale de la geometría del motor con el TRABAJO puesto encima
//     por la MISMA siembra que la ventana (`estadoDeTrabajo`): la misma pared,
//     el mismo tipo efectivo y los mismos huecos que se ven allí.
//   · Los CUADROS salen del propio `.cex` (la radiografía del motor) cuando lo
//     hay: lo que se enseña es exactamente lo que va al fichero.
//   · Es COSMÉTICO dónde cae un hueco a lo largo del muro (como en la ventana):
//     CE3X no coloca los huecos, quiere su superficie y su cerramiento.
//   · La ESCALA es real (1:50 … 1:250, la mayor que cabe): el SVG se mide en
//     milímetros de papel, así que impreso a A4 sin ajustar se puede medir.
//   · La MARCA (Montserrat + DM Sans, logo, degradado) va INCRUSTADA desde
//     `plantillas/marca/` (kit de marca de BROKERGY): el PDF se compone en el
//     PC y en el VPS, y no puede depender de que una URL responda.
//   · Puro: compone HTML. Rasterizarlo y subirlo es de quien lo llama.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const FRONT = path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'features');
const esm = (rel) => import(pathToFileURL(path.join(FRONT, rel)).href);

// ─── La marca ───────────────────────────────────────────────────────────────

//: Los colores del kit de marca (00_MARCA.md).
const M = {
    naranja: '#FFA000', ambar: '#F8BA27', lima: '#B1CE34', negro: '#1A1A1A',
    gris: '#6B7280', grisClaro: '#E7E9EC', crema: '#FAFAF7', naranjaClaro: '#FFE4BE',
};
//: Los del plano. El MURO al exterior va en negro macizo (poché), como en
//: cualquier plano de obra; la medianera, rayada en gris; la partición con un
//: espacio no habitable, rayada en lima. Ventanas en azul (el vidrio).
const P = {
    muro: M.negro, medianera: '#8A9099', particion: M.lima, fuera: '#B8BEC6',
    vidrio: '#2A8FD8', puerta: '#6B4A2B', cota: M.naranja, zona: '#9AA0A8',
};
const MARCA_DIR = path.join(__dirname, '..', '..', 'plantillas', 'marca');
const SLOGAN = 'Ahorra energía, gana dinero, ayuda al planeta';

let _marca = null;
function marca() {
    if (_marca) return _marca;
    const b64 = (f) => fs.readFileSync(path.join(MARCA_DIR, f)).toString('base64');
    const fuente = (fam, peso, f) => `@font-face{font-family:'${fam}';font-weight:${peso};font-style:normal;`
        + `src:url(data:font/woff;base64,${b64(f)}) format('woff');}`;
    try {
        _marca = {
            fuentes: [fuente('Montserrat', 600, 'Montserrat-SemiBold.woff'),
                      fuente('Montserrat', 700, 'Montserrat-Bold.woff'),
                      fuente('DM Sans', 400, 'DMSans-Regular.woff'),
                      fuente('DM Sans', 500, 'DMSans-Medium.woff'),
                      fuente('DM Sans', 700, 'DMSans-Bold.woff')].join('\n'),
            logo: `data:image/png;base64,${b64('logo_horizontal_negro.png')}`,
        };
    } catch {
        // Sin el kit el croquis sale igual, con la letra del sistema.
        _marca = { fuentes: '', logo: null };
    }
    return _marca;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v, d = 2) => (v == null || v === '' || !Number.isFinite(Number(v)))
    ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const idDeNombre = (s) => String(s || '').trim().split(/\s+/)[0];
const NOMBRE_TIPO = { FACHADA: 'Fachada', MEDIANERA: 'Medianera', PARTICION_VERTICAL: 'Partición' };
const ROTULO_ZONA = {
    GARAJE: 'Garaje', ALMACEN: 'Almacén', PORCHE: 'Porche', 'ESPACIO NO HABITABLE': 'Espacio no habitable',
};

// ─── El dibujo de una planta ────────────────────────────────────────────────

function bbox(puntos) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of puntos) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

//: Las escalas normalizadas que se prueban, de la más grande a la más pequeña.
const ESCALAS = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500];

/**
 * El GIRO que deja la casa recta en la hoja: el del muro más largo, llevado a
 * horizontal (en grados, como el `rotate()` de SVG, entre -90 y 90). Un plano
 * de obra se dibuja ortogonal y el norte se señala con su flecha: girada, la
 * casa ocupa menos papel —cabe a mayor escala— y los rótulos se leen rectos.
 */
function giroDeLaCasa(G, muros) {
    let mejor = null;
    for (const m of muros) {
        const p = m.svg || [];
        if (p.length < 2 || G.esFuera(m)) continue;
        for (let i = 1; i < p.length; i++) {
            const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1];
            const L = Math.hypot(dx, dy);
            if (!mejor || L > mejor.L) mejor = { L, ang: (Math.atan2(dy, dx) * 180) / Math.PI };
        }
    }
    if (!mejor) return 0;
    let a = -mejor.ang;
    while (a > 90) a -= 180;
    while (a <= -90) a += 180;
    return a;
}

/** Gira puntos `a` grados (sentido de SVG) alrededor de `c`. */
function girador(a, c) {
    const r = (a * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
    const uno = ([x, y]) => [c[0] + (x - c[0]) * co - (y - c[1]) * si, c[1] + (x - c[0]) * si + (y - c[1]) * co];
    return (pts) => (pts || []).map(uno);
}

/**
 * La superficie que encierran los muros de una planta (m², construida): se
 * encadenan por sus extremos y se cierra el anillo. Es la que se DIBUJA —ya sin
 * el garaje ni el porche—, no la que declara Catastro. `null` si no cierra.
 */
function superficieDeMuros(muros) {
    const tramos = muros.map(m => (m.svg || []).map(p => [p[0], p[1]])).filter(p => p.length >= 2);
    if (tramos.length < 3) return null;
    const cerca = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
    const anillo = [...tramos.shift()];
    while (tramos.length) {
        const fin = anillo[anillo.length - 1];
        const i = tramos.findIndex(t => cerca(t[0], fin) || cerca(t[t.length - 1], fin));
        if (i < 0) return null;
        let t = tramos.splice(i, 1)[0];
        if (!cerca(t[0], fin)) t = [...t].reverse();
        anillo.push(...t.slice(1));
    }
    if (!cerca(anillo[0], anillo[anillo.length - 1])) return null;
    let s = 0;
    for (let i = 1; i < anillo.length; i++) s += anillo[i - 1][0] * anillo[i][1] - anillo[i][0] * anillo[i - 1][1];
    return Math.abs(s) / 2;
}

//: Un símbolo de la leyenda: el MISMO dibujo que en el plano, en miniatura.
function simbolo(tipo) {
    const caja = (cont) => `<svg width="26" height="10" viewBox="0 0 26 10">${cont}</svg>`;
    const muro = (relleno) => caja(`<rect x="1" y="2" width="24" height="6" fill="${relleno}" stroke="${M.negro}" stroke-width="1"/>`);
    switch (tipo) {
    case 'fachada': return muro(M.negro);
    case 'medianera': return muro('url(#lyMed)');
    case 'particion': return muro('url(#lyPart)');
    case 'zona': return caja(`<rect x="1" y="1" width="24" height="8" fill="url(#lyZona)" stroke="${P.zona}" stroke-width=".8" stroke-dasharray="2 1.2"/>`);
    case 'ventana': return caja(`<rect x="1" y="2" width="5" height="6" fill="${M.negro}"/><rect x="20" y="2" width="5" height="6" fill="${M.negro}"/>`
        + `<line x1="6" y1="2.3" x2="20" y2="2.3" stroke="${M.negro}" stroke-width=".6"/><line x1="6" y1="7.7" x2="20" y2="7.7" stroke="${M.negro}" stroke-width=".6"/>`
        + `<line x1="6" y1="5" x2="20" y2="5" stroke="${P.vidrio}" stroke-width="1.6"/>`);
    case 'puerta': return caja(`<rect x="1" y="7" width="3" height="3" fill="${M.negro}"/><rect x="22" y="7" width="3" height="3" fill="${M.negro}"/>`
        + `<line x1="4" y1="7" x2="4" y2="0" stroke="${P.puerta}" stroke-width="1.2"/><path d="M 4 0 A 18 18 0 0 1 22 7" fill="none" stroke="${P.puerta}" stroke-width=".7" stroke-dasharray="1.6 1"/>`);
    case 'cota': return caja(`<line x1="2" y1="5" x2="24" y2="5" stroke="${M.naranja}" stroke-width="1"/><line x1="2" y1="2" x2="2" y2="8" stroke="${M.naranja}" stroke-width="1"/><line x1="24" y1="2" x2="24" y2="8" stroke="${M.naranja}" stroke-width="1"/>`);
    case 'acceso': return caja(`<line x1="2" y1="5" x2="18" y2="5" stroke="${M.naranja}" stroke-width="1.3"/><polygon points="24,5 17,1.5 17,8.5" fill="${M.naranja}"/>`);
    default: return '';
    }
}
const DEFS_LEYENDA = `<svg width="0" height="0" style="position:absolute"><defs>
<pattern id="lyMed" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)"><rect width="3" height="3" fill="#fff"/><line x1="0" y1="0" x2="0" y2="3" stroke="${P.medianera}" stroke-width="1"/></pattern>
<pattern id="lyPart" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(-45)"><rect width="3" height="3" fill="#fff"/><line x1="0" y1="0" x2="0" y2="3" stroke="${P.particion}" stroke-width="1.3"/></pattern>
<pattern id="lyZona" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><rect width="4" height="4" fill="${M.crema}"/><line x1="0" y1="0" x2="0" y2="4" stroke="#C9CED6" stroke-width=".6"/></pattern>
</defs></svg>`;

/**
 * Un plano en SVG, norte arriba. El `viewBox` está en METROS (el lienzo del
 * motor ya lo es: el mundo trasladado con la Y del revés) y el tamaño en
 * MILÍMETROS de papel, así que la escala que se rotula es la de verdad.
 */
function planoPlanta(G, { muros: murosIn, zonas: zonasIn, entrada, contexto: ctxIn,
                         equipos: equiposIn = [],
                         giro = 0, centroGiro = [0, 0], anchoMm = 178, altoMm = 196 }) {
    // Todo se gira a la vez (ver `giroDeLaCasa`); la flecha del norte, también.
    const rot = girador(giro, centroGiro);
    const muros = murosIn.map(m => ({ ...m, svg: rot(m.svg) }));
    const zonas = zonasIn.map(z => ({ ...z, puntos: rot(z.puntos) }));
    const equipos = equiposIn.map(e => ({ ...e, lienzo: rot([e.lienzo])[0] }));
    const contexto = { vecinos: (ctxIn?.vecinos || []).map(rot), parcela: (ctxIn?.parcela || []).map(rot) };
    const pts = [];
    for (const m of muros) pts.push(...(m.svg || []));
    for (const z of zonas) pts.push(...z.puntos);
    for (const e of equipos) pts.push(e.lienzo);
    const caja = bbox(pts);
    if (!caja) return { svg: '<p class="nota">Sin paredes que dibujar en esta planta.</p>', escala: null };
    const margen = 2.6;                                  // m: sitio para cotas y rótulos
    const w = caja.x1 - caja.x0 + 2 * margen, h = caja.y1 - caja.y0 + 2 * margen;
    const den = ESCALAS.find(d => (w * 1000) / d <= anchoMm && (h * 1000) / d <= altoMm) || ESCALAS.at(-1);
    const mmPorM = 1000 / den;
    // El dibujo se centra en la caja de papel disponible.
    const W = anchoMm, H = Math.min(altoMm, h * mmPorM + 14);
    const vbW = W / mmPorM, vbH = H / mmPorM;
    const vb = { x: (caja.x0 + caja.x1) / 2 - vbW / 2, y: (caja.y0 + caja.y1) / 2 - vbH / 2, w: vbW, h: vbH };
    const mm = (v) => v / mmPorM;                        // milímetros de papel → metros
    const fs = mm(2.6), fsSub = mm(2.1), fsMin = mm(1.8);
    const halo = `stroke="#fff" stroke-width="${mm(0.9)}" paint-order="stroke" stroke-linejoin="round"`;
    const linea = (p) => p.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

    // Hacia dónde está "fuera" de cada pared: lejos del centro de la planta.
    const cs = muros.map(m => G.centro(m.svg));
    const cx = cs.reduce((s, c) => s + c[0], 0) / (cs.length || 1);
    const cy = cs.reduce((s, c) => s + c[1], 0) / (cs.length || 1);
    const normal = (m, punto = null) => {
        const p = m.svg || [];
        const [mx, my] = punto || G.centro(p);
        const a = p[0], b = p[p.length - 1];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0];
        const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
        if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
        return { mx, my, nx, ny };
    };
    const tipoDe = (m) => (G.esFuera(m) ? 'FUERA' : G.tipoDe(m));
    //: Grosor de dibujo: el cerramiento al exterior más grueso que el tabique.
    const grosor = (m) => (tipoDe(m) === 'PARTICION_VERTICAL' ? 0.2 : 0.3);

    const capas = [];
    // 1 · Contexto: vecinos y linde de la parcela, muy apagados.
    for (const v of contexto?.vecinos || []) {
        capas.push(`<polygon points="${linea(v)}" fill="#F1F2F4" stroke="#D5D9DF" stroke-width="${mm(0.2)}"/>`);
    }
    for (const p of contexto?.parcela || []) {
        capas.push(`<polygon points="${linea(p)}" fill="none" stroke="#C3C8CF" stroke-width="${mm(0.25)}" stroke-dasharray="${mm(2)} ${mm(1.2)}"/>`);
    }
    // 2 · Lo que NO cuenta como vivienda en esta planta.
    for (const z of zonas) {
        const [zx, zy] = G.centroide(z.puntos);
        const exterior = String(z.uso || '').toUpperCase() === 'PORCHE';
        const rotulo = (ROTULO_ZONA[String(z.uso || '').toUpperCase()] || z.uso || '').toUpperCase();
        capas.push(`<polygon points="${linea(z.puntos)}" fill="url(#trZona)" stroke="${P.zona}" stroke-width="${mm(0.25)}" stroke-dasharray="${mm(1.4)} ${mm(0.8)}"/>`);
        // Una zona pequeña (un porche de 2 m²) va SIN rótulo: el rayado ya dice
        // que no es vivienda, el cuadro de superficies dice qué es y cuánto
        // mide, y aquí se montaría sobre la puerta o la ventana de al lado.
        if ((Number(z.area_m2) || 0) < 5) continue;
        capas.push(`<text x="${zx}" y="${zy - fsSub * 0.2}" font-size="${fsSub}" text-anchor="middle" fill="#4B5260" font-weight="700" ${halo}>${esc(rotulo)}</text>`);
        capas.push(`<text x="${zx}" y="${zy + fsSub * 1.05}" font-size="${fsMin}" text-anchor="middle" fill="#6B7280" ${halo}>${num(z.area_m2, 1)} m² · ${exterior ? 'exterior' : 'no habitable'}</text>`);
    }
    // 3 · Los MUROS. Primero el contorno negro de todos (las esquinas se unen
    //     como en un plano de obra) y encima el relleno de los que van rayados.
    const vivos = muros.filter(m => !G.esFuera(m));
    for (const m of vivos) {
        capas.push(`<polyline points="${linea(m.svg)}" fill="none" stroke="${P.muro}" stroke-width="${grosor(m)}" stroke-linecap="square" stroke-linejoin="miter"/>`);
    }
    for (const m of vivos) {
        const t = tipoDe(m);
        if (t === 'FACHADA') continue;
        const tr = t === 'MEDIANERA' ? 'trMed' : 'trPart';
        const g = grosor(m) - mm(0.5);
        capas.push(`<polyline points="${linea(m.svg)}" fill="none" stroke="#fff" stroke-width="${g}" stroke-linecap="butt"/>`);
        capas.push(`<polyline points="${linea(m.svg)}" fill="none" stroke="url(#${tr})" stroke-width="${g}" stroke-linecap="butt"/>`);
    }
    for (const m of muros.filter(G.esFuera)) {
        capas.push(`<polyline points="${linea(m.svg)}" fill="none" stroke="${P.fuera}" stroke-width="${mm(0.5)}" stroke-dasharray="${mm(1.5)} ${mm(1)}"/>`);
    }
    // 4 · Los HUECOS: el muro se abre y se dibuja el símbolo.
    for (const m of vivos) {
        if (!(m.huecos || []).length) continue;
        const L = G.largo(m.svg);
        const t = grosor(m);
        for (const { hueco: hu, pos } of G.reparto(m.huecos)) {
            const ancho = Math.min(Number(hu.ancho) || 0.8, L);
            const c = G.at(m.svg, pos * L);
            const r = (c.ang * Math.PI) / 180;
            const ux = Math.cos(r), uy = Math.sin(r);          // a lo largo del muro
            const { nx, ny } = normal(m, [c.x, c.y]);          // hacia fuera
            const a = [c.x - ux * ancho / 2, c.y - uy * ancho / 2];
            const b = [c.x + ux * ancho / 2, c.y + uy * ancho / 2];
            const off = (p, d) => [p[0] + nx * d, p[1] + ny * d];
            const seg = (p, q, attrs) => `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" ${attrs}/>`;
            // El hueco en el muro, en blanco.
            capas.push(seg(a, b, `stroke="#fff" stroke-width="${t + mm(0.3)}" stroke-linecap="butt"`));
            // Las jambas.
            for (const p of [a, b]) capas.push(seg(off(p, -t / 2), off(p, t / 2), `stroke="${P.muro}" stroke-width="${mm(0.35)}"`));
            const esPuerta = hu.tipo === 'puerta';
            //: Una puerta ACRISTALADA (corredera de patio, % de marco bajo) se
            //: dibuja como un hueco de vidrio: un arco de 2,40 m no es lo que hay.
            const pm = Number(hu.porc_marco);
            const acristalada = esPuerta && Number.isFinite(pm) && pm > 0 && pm <= 60;
            if (esPuerta && !acristalada) {
                // Umbral y hoja batiendo hacia DENTRO, con su arco.
                capas.push(seg(off(a, t / 2), off(b, t / 2), `stroke="${P.puerta}" stroke-width="${mm(0.2)}"`));
                const bisagra = off(a, -t / 2);
                const tope = [bisagra[0] - nx * ancho, bisagra[1] - ny * ancho];
                const fin = off(b, -t / 2);
                capas.push(seg(bisagra, tope, `stroke="${P.puerta}" stroke-width="${mm(0.45)}"`));
                // Sentido del arco: del extremo de la hoja a la otra jamba.
                const cruz = (tope[0] - bisagra[0]) * (fin[1] - bisagra[1]) - (tope[1] - bisagra[1]) * (fin[0] - bisagra[0]);
                capas.push(`<path d="M ${tope[0]} ${tope[1]} A ${ancho} ${ancho} 0 0 ${cruz > 0 ? 1 : 0} ${fin[0]} ${fin[1]}" fill="none" stroke="${P.puerta}" stroke-width="${mm(0.2)}" stroke-dasharray="${mm(0.8)} ${mm(0.5)}"/>`);
            } else {
                // Ventana: las dos caras del marco y el vidrio en medio.
                for (const d of [-t / 2, t / 2]) capas.push(seg(off(a, d), off(b, d), `stroke="${P.muro}" stroke-width="${mm(0.25)}"`));
                capas.push(seg(a, b, `stroke="${P.vidrio}" stroke-width="${mm(0.6)}"`));
                if (acristalada) {
                    // Dos hojas que se cruzan: la marca de una corredera.
                    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                    const sol = ancho * 0.08;
                    const p1 = [mid[0] + ux * sol, mid[1] + uy * sol], p2 = [mid[0] - ux * sol, mid[1] - uy * sol];
                    capas.push(seg(off(a, -t / 6), off(p1, -t / 6), `stroke="${P.puerta}" stroke-width="${mm(0.35)}"`));
                    capas.push(seg(off(p2, t / 6), off(b, t / 6), `stroke="${P.puerta}" stroke-width="${mm(0.35)}"`));
                }
            }
            // Su rótulo, hacia DENTRO (la cota del muro va fuera).
            //: En un muro corto (los de un patinillo) solo va su nombre: la medida
            //: está en el cuadro de huecos y aquí se montaría sobre las de al lado.
            const corto = L < 2;
            const dentro = corto ? t / 2 + 0.3 : (esPuerta && !acristalada) ? Math.max(ancho, 0.5) + 0.35 : t / 2 + 0.55;
            const tx = c.x - nx * dentro, ty = c.y - ny * dentro;
            const nombre = G.nombreHueco ? G.nombreHueco(hu) : hu.nombre;
            const col = esPuerta ? P.puerta : P.vidrio;
            capas.push(`<text x="${tx}" y="${ty + (corto ? fsMin * 0.35 : 0)}" font-size="${corto ? fsMin : fsSub}" text-anchor="middle" font-weight="700" fill="${col}" ${halo}>${esc(nombre)}</text>`);
            if (!corto) {
                capas.push(`<text x="${tx}" y="${ty + fsSub * 1.05}" font-size="${fsMin}" text-anchor="middle" fill="#4B5260" ${halo}>${num(hu.ancho)} × ${num(hu.alto)}</text>`);
            }
            if (m.id === entrada && esPuerta) {
                // La entrada: una flecha desde fuera.
                const p0 = [c.x + nx * (t / 2 + 1.0), c.y + ny * (t / 2 + 1.0)];
                const p1 = [c.x + nx * (t / 2 + 0.25), c.y + ny * (t / 2 + 0.25)];
                const ax = -ny * 0.16, ay = nx * 0.16;
                capas.push(seg(p0, p1, `stroke="${M.naranja}" stroke-width="${mm(0.5)}"`));
                capas.push(`<polygon points="${p1[0]},${p1[1]} ${p1[0] + nx * 0.3 + ax},${p1[1] + ny * 0.3 + ay} ${p1[0] + nx * 0.3 - ax},${p1[1] + ny * 0.3 - ay}" fill="${M.naranja}"/>`);
            }
        }
    }
    // 5 · Las COTAS de cada muro, fuera, con su nombre.
    for (const m of muros) {
        const L = G.largo(m.svg);
        const nombre = G.nombreDe(m) || m.id;
        const fuera = G.esFuera(m);
        if (L < 1.0) {
            const { mx, my, nx, ny } = normal(m);
            capas.push(`<text x="${mx + nx * 0.55}" y="${my + ny * 0.55 + fsMin * 0.35}" font-size="${fsMin}" text-anchor="middle" fill="${M.gris}" ${halo}>${esc(nombre)}</text>`);
            continue;
        }
        //: Una PARTICIÓN (contra el garaje) da a lo que no es vivienda, y por ese
        //: lado ya va el rótulo de la zona: lleva solo su texto, pegado al muro.
        if (tipoDe(m) === 'PARTICION_VERTICAL') {
            const k = G.cota(m.svg, { hacia: [cx, cy], apartar: grosor(m) / 2 - 0.2, tope: 0 });
            if (k) {
                capas.push(`<text transform="${k.tr}" font-size="${fsMin}" text-anchor="middle" dominant-baseline="middle" fill="#5E7016" ${halo}>`
                    + `<tspan font-weight="700">${esc(nombre)}</tspan> · ${num(L)} m</text>`);
            }
            continue;
        }
        const k = G.cota(m.svg, { hacia: [cx, cy], apartar: grosor(m) / 2 + 0.75, tope: 0.14 });
        if (!k) continue;
        capas.push(`<path d="${k.d}" stroke="${fuera ? P.fuera : P.cota}" stroke-width="${mm(0.25)}" fill="none"/>`);
        capas.push(`<text transform="${k.tr}" font-size="${fsSub}" text-anchor="middle" dominant-baseline="middle" fill="${fuera ? '#8A9099' : M.negro}" ${halo}>`
            + `<tspan font-weight="700">${esc(nombre)}</tspan> · ${num(L)} m${fuera ? ' · no cuenta' : ''}</text>`);
    }
    // 6 · Los EQUIPOS de esta planta: dónde está la caldera que se retira y
    //     dónde van la máquina nueva, el ACS y la unidad exterior.
    capas.push(...marcasEquiposSvg(G, equipos, { mm, fsMin, halo }));
    // 7 · Norte y escala gráfica.
    capas.push(...norteYEscala({ vb, mm, giro, fsSub, fsMin, mmPorM, den }));

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(1)}mm" height="${H.toFixed(1)}mm" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" font-family="'DM Sans', Arial, sans-serif">
<defs>
<pattern id="trMed" patternUnits="userSpaceOnUse" width="0.12" height="0.12" patternTransform="rotate(45)">
<rect width="0.12" height="0.12" fill="#fff"/><line x1="0" y1="0" x2="0" y2="0.12" stroke="${P.medianera}" stroke-width="0.035"/></pattern>
<pattern id="trPart" patternUnits="userSpaceOnUse" width="0.12" height="0.12" patternTransform="rotate(-45)">
<rect width="0.12" height="0.12" fill="#fff"/><line x1="0" y1="0" x2="0" y2="0.12" stroke="${P.particion}" stroke-width="0.045"/></pattern>
<pattern id="trZona" patternUnits="userSpaceOnUse" width="0.35" height="0.35" patternTransform="rotate(45)">
<rect width="0.35" height="0.35" fill="${M.crema}"/><line x1="0" y1="0" x2="0" y2="0.35" stroke="#D3D7DD" stroke-width="0.03"/></pattern>
</defs>
${capas.join('\n')}
</svg>`;
    return { svg, escala: den };
}

/** La aguja del NORTE (girada con la casa) y la escala gráfica, arriba a la
 *  derecha y abajo a la izquierda del dibujo. La comparten las plantas y la
 *  cubierta. */
function norteYEscala({ vb, mm, giro, fsSub, fsMin, mmPorM, den }) {
    const capas = [];
    const nX = vb.x + vb.w - mm(9), nY = vb.y + mm(10);
    const R = mm(5);
    const nT = nX + Math.sin((giro * Math.PI) / 180) * (R + fsSub * 0.9);
    const nTy = nY - Math.cos((giro * Math.PI) / 180) * (R + fsSub * 0.9);
    capas.push(`<g><circle cx="${nX}" cy="${nY}" r="${R}" fill="#fff" stroke="${M.negro}" stroke-width="${mm(0.3)}"/>`
        + `<g transform="rotate(${giro} ${nX} ${nY})">`
        + `<polygon points="${nX},${nY - R * 0.86} ${nX - R * 0.3},${nY} ${nX + R * 0.3},${nY}" fill="${M.naranja}"/>`
        + `<polygon points="${nX},${nY + R * 0.86} ${nX - R * 0.3},${nY} ${nX + R * 0.3},${nY}" fill="#fff" stroke="${M.negro}" stroke-width="${mm(0.25)}"/></g>`
        + `<text x="${nT}" y="${nTy + fsSub * 0.35}" font-size="${fsSub}" text-anchor="middle" font-weight="700" fill="${M.negro}">N</text></g>`);
    const esc_m = [1, 2, 5, 10, 20].find(s => s * mmPorM >= 25) || 20;
    const sX = vb.x + mm(6), sY = vb.y + vb.h - mm(6);
    // Un fondo blanco debajo de la escala: el contexto (los vecinos) llega hasta el borde.
    capas.push(`<rect x="${sX - mm(2)}" y="${sY - mm(5.5)}" width="${esc_m + mm(22)}" height="${mm(8)}" fill="#fff" fill-opacity=".92"/>`);
    const tramos = 4, tr = esc_m / tramos;
    for (let i = 0; i < tramos; i++) {
        capas.push(`<rect x="${sX + i * tr}" y="${sY - mm(1.2)}" width="${tr}" height="${mm(1.2)}" fill="${i % 2 ? '#fff' : M.negro}" stroke="${M.negro}" stroke-width="${mm(0.2)}"/>`);
    }
    capas.push(`<text x="${sX}" y="${sY - mm(2)}" font-size="${fsMin}" fill="${M.negro}">0</text>`
        + `<text x="${sX + esc_m}" y="${sY - mm(2)}" font-size="${fsMin}" text-anchor="middle" fill="${M.negro}">${esc_m} m</text>`
        + `<text x="${sX + esc_m + mm(4)}" y="${sY}" font-size="${fsSub}" font-weight="700" fill="${M.negro}">E 1:${den}</text>`);
    return capas;
}

/**
 * Los iconos de los EQUIPOS (ya girados, en metros del dibujo): el cuadrado de
 * su color con su trazo —el MISMO que en la ventana (`equiposPlano.js`)— y su
 * rótulo debajo. Dos en el mismo sitio (la máquina nueva donde estaba la
 * caldera) se corren y se unen a su punto con una línea.
 */
function marcasDelPapel(G, equipos, { mm, fsMin }) {
    if (!equipos?.length || !G.ep) return [];
    const lado = mm(6.5);
    const anchoDe = (tipo) => (G.ep.tipoEquipo(tipo)?.rotulo || '').length * fsMin * 0.66;
    // Corridos lo bastante para que los RÓTULOS no se lean como uno solo
    // («CALDERA ACTUAL EQUIPO NUEVO» a 2 mm, revisión de diseño 09/10/2026).
    const paso = Math.max(lado * 2.5, ...equipos.map(e => anchoDe(e.tipo) + mm(4)));
    return G.ep.separarMarcas(equipos, paso).map(m => ({ ...m, lado, fs: fsMin, ancho: Math.max(lado, anchoDe(m.e.tipo)) }));
}

function marcasEquiposSvg(G, equipos, { mm, fsMin, halo }) {
    const marcas = marcasDelPapel(G, equipos, { mm, fsMin });
    if (!marcas.length) return [];
    const capas = [];
    // DOS pasadas: las líneas de los corridos debajo de TODOS los iconos. En una,
    // la del equipo nuevo tapaba la llama de la caldera que tiene debajo.
    for (const { e, ancla, pos, corrida } of marcas) {
        const t = G.ep.tipoEquipo(e.tipo);
        if (!t || !corrida) continue;
        capas.push(`<line x1="${ancla[0]}" y1="${ancla[1]}" x2="${pos[0]}" y2="${pos[1]}" stroke="${t.colorPdf}" stroke-width="${mm(0.35)}"/>`
            + `<circle cx="${ancla[0]}" cy="${ancla[1]}" r="${mm(0.9)}" fill="${t.colorPdf}" stroke="#fff" stroke-width="${mm(0.25)}"/>`);
    }
    for (const { e, pos, lado } of marcas) {
        const t = G.ep.tipoEquipo(e.tipo);
        if (!t) continue;
        capas.push(G.ep.iconoSvg(e.tipo, pos[0], pos[1], lado, { filo: mm(0.45) }));
        capas.push(`<text x="${pos[0]}" y="${pos[1] + lado / 2 + fsMin * 1.15}" font-size="${fsMin}" text-anchor="middle" font-weight="700" fill="${t.colorPdf}" ${halo}>${esc(t.rotulo)}</text>`);
    }
    return capas;
}

/**
 * El PLANO DE CUBIERTA: el tejado visto desde arriba, con sus tejas, y los
 * equipos que van en él (la unidad exterior). Cada faldón es una edificación
 * de Catastro a la altura de su planta más alta (`faldonesCubierta`), pintados
 * de abajo arriba. Mismo giro y misma escala normalizada que las plantas.
 */
function planoCubierta(G, { faldones: faldonesIn, equipos: equiposIn = [], contexto: ctxIn, nombreNivel,
                           giro = 0, centroGiro = [0, 0], anchoMm = 178, altoMm = 196 }) {
    const rot = girador(giro, centroGiro);
    const faldones = (faldonesIn || []).map(f => ({ ...f, puntos: rot(f.puntos) }));
    const equipos = equiposIn.map(e => ({ ...e, lienzo: rot([e.lienzo])[0] }));
    const vecinos = (ctxIn?.vecinos || []).map(rot);
    const caja = bbox([...faldones.flatMap(f => f.puntos), ...equipos.map(e => e.lienzo)]);
    if (!caja) return { svg: '<p class="nota">Sin contorno del edificio para dibujar la cubierta.</p>', escala: null };
    const margen = 2.6;
    const w = caja.x1 - caja.x0 + 2 * margen, h = caja.y1 - caja.y0 + 2 * margen;
    const den = ESCALAS.find(d => (w * 1000) / d <= anchoMm && (h * 1000) / d <= altoMm) || ESCALAS.at(-1);
    const mmPorM = 1000 / den;
    const W = anchoMm, H = Math.min(altoMm, h * mmPorM + 14);
    const vbW = W / mmPorM, vbH = H / mmPorM;
    const vb = { x: (caja.x0 + caja.x1) / 2 - vbW / 2, y: (caja.y0 + caja.y1) / 2 - vbH / 2, w: vbW, h: vbH };
    const mm = (v) => v / mmPorM;
    const fsSub = mm(2.1), fsMin = mm(1.8);
    const halo = `stroke="#fff" stroke-width="${mm(0.9)}" paint-order="stroke" stroke-linejoin="round"`;
    const linea = (p) => p.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
    const capas = [];
    for (const v of vecinos) {
        capas.push(`<polygon points="${linea(v)}" fill="#F1F2F4" stroke="#D5D9DF" stroke-width="${mm(0.2)}"/>`);
    }
    // La TEJA en VECTORIAL: hileras de arcos recortadas a cada faldón. Con un
    // `<pattern>`, Chrome lo convierte en imagen a 72 ppp al hacer el PDF y al
    // imprimir salía un punteado (revisión de diseño, 09/10/2026). Mide 0,5 m de
    // verdad pero nunca menos de 3 mm de papel: a 1:250 se leía como un rayado.
    const t = Math.max(0.5, mm(3));
    const a = t / 2;                                    // ancho de cada teja (arco)
    const r2 = (v) => Math.round(v * 100) / 100;
    const arriba = Math.max(...faldones.map(f => f.nivel));
    const defs = [];
    faldones.forEach((f, i) => {
        const c = bbox(f.puntos);
        const tramos = [];
        for (let k = 0, y = c.y0 + a; y <= c.y1 + a; k++, y += a) {
            let d = `M${r2(c.x0 - a - (k % 2) * a / 2)} ${r2(y)}`;
            for (let x = c.x0 - a - (k % 2) * a / 2; x < c.x1 + a; x += a) d += `Q${r2(x + a / 2)} ${r2(y - a * 0.84)} ${r2(x + a)} ${r2(y)}`;
            tramos.push(d);
        }
        defs.push(`<clipPath id="cf${i}"><polygon points="${linea(f.puntos)}"/></clipPath>`);
        // El tejado más BAJO (el del garaje junto al de la casa), más claro: se
        // ve la diferencia de altura sin leer el rótulo.
        const op = f.nivel < arriba ? ' opacity=".6"' : '';
        capas.push(`<g${op}><polygon points="${linea(f.puntos)}" fill="${TEJA.fondo}"/>`
            + `<path d="${tramos.join('')}" fill="none" stroke="${TEJA.linea}" stroke-width="${mm(0.18)}" clip-path="url(#cf${i})"/>`
            + `<polygon points="${linea(f.puntos)}" fill="none" stroke="${TEJA.borde}" stroke-width="${mm(0.45)}" stroke-linejoin="round"/></g>`);
    });
    // Con tejados a distintas alturas, a qué planta cubre cada uno: en su sitio
    // más holgado (no el centroide, que en una L cae en el codo) y, si ahí hay
    // un icono, debajo de su rótulo — era lo único que decía sobre qué tejado
    // está la unidad exterior y quedaba tapado.
    const marcas = marcasDelPapel(G, equipos, { mm, fsMin });
    if (new Set(faldones.map(f => f.nivel)).size > 1) {
        for (const f of faldones) {
            const texto = `sobre ${nombreNivel(f.nivel)}`;
            const [x, y] = G.ep.sitioRotuloFaldon(f.puntos, marcas, (p) => G.polo(p), { texto, fs: fsMin });
            capas.push(`<text x="${x}" y="${y}" font-size="${fsMin}" text-anchor="middle" font-weight="700" fill="#5B3A22" ${halo}>${esc(texto)}</text>`);
        }
    }
    capas.push(...marcasEquiposSvg(G, equipos, { mm, fsMin, halo }));
    capas.push(...norteYEscala({ vb, mm, giro, fsSub, fsMin, mmPorM, den }));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(1)}mm" height="${H.toFixed(1)}mm" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" font-family="'DM Sans', Arial, sans-serif">
<defs>${defs.join('')}</defs>
${capas.join('\n')}
</svg>`;
    return { svg, escala: den };
}
//: La TEJA en el papel: terracota clara de fondo y la línea de cada hilera.
const TEJA = { fondo: '#F4D9C6', linea: '#C9764A', borde: '#A0522D' };

// ─── Los cuadros ────────────────────────────────────────────────────────────

function tabla(cabeceras, filas, { clase = '' } = {}) {
    if (!filas.length) return '<p class="nota">— nada —</p>';
    return `<table class="${clase}"><thead><tr>${cabeceras.map(c => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${filas.join('\n')}</tbody></table>`;
}

const chipTipo = (tipo) => {
    const t = String(tipo || '');
    const cls = /mediane/i.test(t) ? 'med' : /partici/i.test(t) ? 'part' : /fachada/i.test(t) ? 'fach' : 'otro';
    return `<span class="chip ${cls}">${esc(t || '—')}</span>`;
};

/**
 * El HTML del croquis.
 *
 * @param {object} p
 * @param {object} p.cabecera  { numero, cliente, direccion, rc, fase, fichero, fecha }
 * @param {object} p.geo       la respuesta de /envolvente (plantas, contexto, georef…)
 * @param {object} p.trabajo   el trabajo guardado de la ventana
 * @param {object|null} p.rx   la radiografía del `.cex` (/cex/radiografia)
 * (`avisos` y `decisiones` se aceptan por compatibilidad y NO se imprimen.)
 */
async function componerCroquisHtml({ cabecera = {}, geo, trabajo, rx = null }) {
    const geom = await esm('cee-envolvente/logic/geometriaPlano.js');
    const tp = await esm('cee-envolvente/logic/tiposPared.js');
    const sen = await esm('cee-envolvente/logic/senalado.js');
    const ref = await esm('cee-envolvente/logic/reforma.js').catch(() => ({}));
    const ep = await esm('cee-envolvente/logic/equiposPlano.js').catch(() => null);
    const rp = await esm('cee-envolvente/logic/rotulosPlano.js').catch(() => null);
    const G = { ...geom, ...tp, ...sen, nombreHueco: ref.nombreHueco, ep,
                //: El punto más holgado de un polígono (para el rótulo de un faldón).
                polo: rp?.poloInaccesible || ((p) => { const [x, y] = geom.centroide(p); return { x, y }; }) };
    const { fuentes, logo } = marca();

    const st = sen.estadoDeTrabajo(geo, trabajo || null);
    const muros = Object.values(st.muros || {});
    const lam = st.lienzoAMundo;
    const zonasLienzo = (trabajo?.zonas_fuera || [])
        .filter(z => Array.isArray(z.poligono) && z.poligono.length >= 3 && lam)
        .map(z => ({ ...z, puntos: z.poligono.map(([X, Y]) => [X - lam.dx, lam.y0 - Y]) }));

    const plantas = sen.plantasDe(geo);
    const c = cabecera;
    const g = rx?.generales || {};
    const env = rx?.envolvente || {};
    let totalPaginas = plantas.length + 1;
    //: Dónde están los EQUIPOS (se guardan en el mundo, como las zonas) y si
    //: alguno va en la CUBIERTA: entonces el croquis lleva su hoja de tejado.
    const equipos = ep ? ep.equiposEnLienzo(trabajo?.equipos_plano, lam) : [];
    const enCubierta = equipos.filter(e => e.nivel === ep?.NIVEL_CUBIERTA);
    const conCubierta = enCubierta.length > 0;
    const nombreSitio = (n) => (ep ? ep.nombreDelSitio(n, plantas) : String(n));

    const cabeceraHoja = () => `<header class="cab">
  ${logo ? `<img class="logo" src="${logo}" alt="BROKERGY">` : '<b class="logo-txt">BROKERGY</b>'}
  <div class="fiscal">Soluciones Sostenibles para Eficiencia Energética SL · CIF B19350222<br>C/ Don Sergio 12 - 1ºE · 13700 Tomelloso (Ciudad Real)</div>
</header><div class="hairline"></div>`;
    const pie = (n) => `<footer class="pie"><span>${SLOGAN}</span><span>${esc(c.numero || '')} · Croquis de la envolvente · Pág. ${n} de %%TOTAL_PAGINAS%%</span></footer>`;
    const titulo = (n, texto, sub = '') => `<div class="titulo"><span class="num">${String(n).padStart(2, '0')}</span>`
        + `<h2>${esc(texto)}${sub ? ` <small>${sub}</small>` : ''}</h2></div><div class="regla"></div>`;

    //: Los equipos en la leyenda: solo los que salen en ESA hoja (la planta 1 no
    //: lista la caldera que está en la baja).
    const iconoLeyenda = (tipo) => `<svg width="12" height="12" viewBox="0 0 24 24">${ep.iconoSvg(tipo, 12, 12, 24, { filo: 0 })}</svg>`;
    const leyendaEquipos = (lista) => (ep ? ep.TIPOS_EQUIPO.filter(t => lista.some(e => e.tipo === t.id))
        .map(t => `<span>${iconoLeyenda(t.id)}${esc(t.etiqueta)}</span>`).join('') : '');
    const leyenda = (lista = []) => `<div class="leyenda">
  <span>${simbolo('fachada')}Muro al exterior</span><span>${simbolo('medianera')}Medianera</span>
  <span>${simbolo('particion')}Partición con espacio no habitable</span><span>${simbolo('zona')}No es vivienda</span>
  <span>${simbolo('ventana')}Ventana</span><span>${simbolo('puerta')}Puerta</span>
  <span>${simbolo('cota')}Cota (m)</span><span>${simbolo('acceso')}Acceso</span>${leyendaEquipos(lista)}
</div>`;
    // Un solo giro para todas las plantas: la misma casa, en la misma posición.
    const vivosTodos = muros.filter(m => !G.esFuera(m));
    const giro = giroDeLaCasa(G, vivosTodos);
    const centroGiro = G.centroide(vivosTodos.flatMap(m => m.svg || []));
    const supPlanta = (p) => superficieDeMuros(muros.filter(m => (m.planta || null) === p.id && !G.esFuera(m)));
    // La carpintería efectiva de cada hueco (lo suyo o lo de la vivienda).
    const vv = await esm('cee-envolvente/logic/ventanasVivienda.js').catch(() => null);
    const defecto = vv?.huecosDefecto ? vv.huecosDefecto(trabajo?.ajustes || {}) : null;
    const carp = (h) => (vv?.carpinteriaDe ? vv.carpinteriaDe(h, defecto) : h);

    const meta = `<table class="meta"><tbody>
<tr><th>Expediente</th><td><b>${esc(c.numero || '—')}</b></td><th>Certificado</th><td>${esc(c.fase || 'CEE INICIAL')}</td></tr>
<tr><th>Titular</th><td>${esc(c.cliente || '—')}</td><th>Referencia catastral</th><td>${esc(c.rc || '—')}</td></tr>
<tr><th>Emplazamiento</th><td colspan="3">${esc(c.direccion || '—')}</td></tr>
${rx ? `<tr><th>Superficie útil</th><td>${num(g.superficie)} m² · ${num(g.plantas, 0)} planta(s)</td><th>Año · zona</th><td>${num(g.anio, 0)} · ${esc(g.zona_he1 || '—')}</td></tr>` : ''}
</tbody></table>`;

    // ── Los huecos, con su planta: del .cex si lo hay; si no, del trabajo ──
    const huecosRx = env.huecos || [];
    const plantaDeMuro = (id) => (st.muros?.[id] || muros.find(x => G.nombreDe(x) === id))?.planta || null;
    // En el .cex la PERSIANA de un hueco es su puente «Caja de Persiana»
    // («PT Caja de Persiana-V5»), no `tieneProteccionSolar`, que es otra cosa
    // (toldos, lamas, voladizos): leyendo ése, la columna salía «No» en todos
    // los huecos de todos los croquis (visto en 26RES060_226, con 14 cajas).
    const conCaja = new Set((env.puentes || [])
        .filter(p => /caja de persiana/i.test(p.tipo || ''))
        .map(p => String(p.nombre || '').replace(/^PT\s*Caja de Persiana\s*-\s*/i, '').trim()));
    const huecos = huecosRx.length ? huecosRx.map((h) => ({
        planta: plantaDeMuro(idDeNombre(h.cerramiento)),
        nombre: h.nombre, muro: idDeNombre(h.cerramiento), orient: h.orientacion,
        ancho: h.ancho, alto: h.alto, sup: (Number(h.superficie) || 0) * (Number(h.multiplicador) || 1),
        marco: h.marco, vidrio: h.vidrio, porc: h.porc_marco, persiana: conCaja.has(String(h.nombre || '').trim()),
    })) : muros.filter(m => !G.esFuera(m)).flatMap(m => (m.huecos || []).map((h) => {
        const k = carp(h);
        return {
            planta: m.planta || null, nombre: G.nombreHueco ? G.nombreHueco(h) : h.nombre,
            muro: G.nombreDe(m) || m.id, orient: G.rumboDe ? G.rumboDe(m) : null,
            ancho: h.ancho, alto: h.alto, sup: (Number(h.ancho) || 0) * (Number(h.alto) || 0),
            marco: k.marco, vidrio: k.opaca ? null : k.vidrio, porc: k.porc_marco, persiana: !!k.persiana,
        };
    }));
    const filaHueco = (h) => `<tr><td><b>${esc(h.nombre)}</b></td><td>${esc(h.muro)}</td><td>${esc(h.orient || '—')}</td>`
        + `<td class="n">${num(h.ancho)} × ${num(h.alto)}</td><td class="n">${num(h.sup)}</td>`
        + `<td>${esc(h.marco || '—')}</td><td>${esc(h.vidrio || '—')}</td><td class="n">${h.porc != null && h.porc !== '' ? `${num(h.porc, 0)} %` : '—'}</td>`
        + `<td>${h.persiana ? 'Sí' : 'No'}</td></tr>`;
    const CAB_HUECOS = ['Hueco', 'Muro', 'Orient.', 'Ancho × alto (m)', 'Sup. (m²)', 'Marco', 'Vidrio', '% marco', 'Persiana'];
    const totHue = huecos.reduce((s, h) => s + (Number(h.sup) || 0), 0);

    const hojasPlanos = plantas.map((p, i) => {
        const ms = muros.filter(m => (m.planta || null) === p.id);
        const zs = zonasLienzo.filter(z => Number(z.nivel) === Number(p.nivel));
        const primera = i === 0;
        const hs = huecos.filter(h => h.planta === p.id);
        // El plano se lleva el sitio que deja el cuadro de huecos de su planta.
        const alto = (primera ? 175 : 222) - Math.min(14, hs.length) * 6.2 - (hs.length ? 16 : 0);
        const eqs = equipos.filter(e => e.nivel === p.nivel);
        const { svg, escala } = planoPlanta(G, {
            muros: ms, zonas: zs, entrada: st.entrada, contexto: geo.contexto,
            equipos: eqs, giro, centroGiro, altoMm: Math.max(110, alto),
        });
        const nombre = /^planta/i.test(p.nombre || '') ? p.nombre : `Planta ${p.nombre || p.id}`;
        const sup = supPlanta(p);
        const supH = hs.reduce((s, h) => s + (Number(h.sup) || 0), 0);
        const sub = [sup ? `${num(sup, 1)} m² construidos` : null,
                     `${hs.length} hueco${hs.length === 1 ? '' : 's'}`, escala ? `E 1:${escala}` : null].filter(Boolean).join(' · ');
        return `<section class="hoja">${cabeceraHoja()}
${primera ? `<div class="portada"><div class="kicker">${esc(c.fase || 'CEE INICIAL')} · CROQUIS DE LA ENVOLVENTE TÉRMICA</div>${meta}</div>` : ''}
${titulo(i + 1, nombre, sub)}
${leyenda(eqs)}
<div class="plano">${svg}</div>
${hs.length ? `<h3>Huecos de esta planta <small>· ${hs.length} · ${num(supH)} m²</small></h3>${tabla(CAB_HUECOS, hs.map(filaHueco), { clase: 'huecos' })}` : ''}
${pie(i + 1)}</section>`;
    }).join('\n');

    // ── La CUBIERTA, si algún equipo va en el tejado (la unidad exterior) ──
    const hojaCubierta = conCubierta ? (() => {
        const n = plantas.length + 1;
        const faldones = ep.faldonesCubierta({ cuerpos: geo.cuerpos || [], plantas });
        const { svg, escala } = planoCubierta(G, {
            faldones, equipos: enCubierta, contexto: geo.contexto, giro, centroGiro, altoMm: 200,
            nombreNivel: (nv) => nombreSitio(nv).toLowerCase(),
        });
        const sub = ['vista desde arriba', escala ? `E 1:${escala}` : null].filter(Boolean).join(' · ');
        const legendaTeja = `<span><svg width="26" height="10" viewBox="0 0 26 10"><rect x="1" y="1" width="24" height="8" fill="${TEJA.fondo}" stroke="${TEJA.borde}" stroke-width=".8"/>`
            + `<path d="M1 7 Q4 3 7 7 Q10 3 13 7 Q16 3 19 7 Q22 3 25 7" fill="none" stroke="${TEJA.linea}" stroke-width=".7"/></svg>Tejado</span>`;
        return `<section class="hoja">${cabeceraHoja()}
${titulo(n, 'Cubierta', sub)}
<div class="leyenda">${legendaTeja}${enCubierta.map(e => `<span>${iconoLeyenda(e.tipo)}${esc(ep.tipoEquipo(e.tipo)?.etiqueta || e.tipo)}</span>`).join('')}</div>
<div class="plano">${svg}</div>
<p class="nota">Cubierta según las edificaciones de Catastro: cada faldón a la altura de la planta más alta de su edificación. La posición de los equipos es la marcada sobre el plano.</p>
${pie(n)}</section>`;
    })() : '';
    const nHojasPlano = plantas.length + (conCubierta ? 1 : 0);

    // ── Dónde está cada equipo ──
    const filasEquipos = ep ? equipos.map((e) => {
        const t = ep.tipoEquipo(e.tipo);
        return `<tr><td class="nw">${iconoLeyenda(e.tipo)} <b>${esc(t?.etiqueta || e.tipo)}</b></td><td class="nw">${esc(nombreSitio(e.nivel))}</td></tr>`;
    }) : [];

    // ── Cuadros ──
    // Superficies por planta (de la geometría y de las zonas). Dos porches de la
    // misma planta son UNA línea con su suma: el cuadro dice cuánto, el plano dónde.
    const porUso = (zs) => {
        const m = new Map();
        for (const z of zs) { const u = String(z.uso || '').toUpperCase(); m.set(u, (m.get(u) || 0) + (Number(z.area_m2) || 0)); }
        return [...m.entries()];
    };
    const nombrePlanta = (id) => {
        const p = plantas.find(x => x.id === id);
        if (!p) return id || '—';
        return /^planta/i.test(p.nombre || '') ? p.nombre : `Planta ${p.nombre || p.id}`;
    };
    // Cuántas líneas ocupa cada fila de superficies: una por uso que no es vivienda.
    const lineasSup = [];
    const filasSup = plantas.map((p) => {
        const zs = (trabajo?.zonas_fuera || []).filter(z => Number(z.nivel) === Number(p.nivel));
        const nombre = /^planta/i.test(p.nombre || '') ? p.nombre : `Planta ${p.nombre || p.id}`;
        const hs = huecos.filter(h => h.planta === p.id);
        lineasSup.push(Math.max(1, porUso(zs).length));
        return `<tr><td class="nw"><b>${esc(nombre)}</b></td><td class="n">${num(supPlanta(p), 1)}</td>`
            + `<td>${porUso(zs).map(([uso, a]) => `${esc(ROTULO_ZONA[uso] || uso)} ${num(a, 1)} m²`).join('<br>') || '—'}</td>`
            + `<td class="n">${num(p.superficie, 1)}</td><td class="n">${hs.length} · ${num(hs.reduce((s, h) => s + (Number(h.sup) || 0), 0))} m²</td></tr>`;
    });

    // Cerramientos opacos: del .cex. Cada fila con su NOMBRE (lo que decide si
    // ocupa una línea o dos, ver la paginación de abajo).
    const filasCer = (env.cerramientos || []).map((ce) => {
        const id = idDeNombre(ce.nombre);
        const mu = st.muros?.[id] || muros.find(x => G.nombreDe(x) === id);
        return { nombre: ce.nombre, html: `<tr><td><b>${esc(ce.nombre)}</b></td><td>${chipTipo(ce.tipo)}</td><td class="nw">${esc(mu?.planta ? nombrePlanta(mu.planta) : (ce.zona || '—'))}</td>`
            + `<td>${esc(ce.orientacion || '—')}</td><td class="n">${mu ? `${num(G.largo(mu.svg))} × ${num(mu.alto)}` : '—'}</td>`
            + `<td class="n">${num(ce.superficie)}</td><td class="n">${ce.tipo === 'Medianera' ? '—' : num(ce.u)}</td></tr>` };
    });
    // Sin el .cex, los muros del dibujo.
    const filasMuros = filasCer.length ? filasCer : muros.filter(m => !G.esFuera(m)).map((m) => {
        const t = G.tipoDe(m);
        const nombre = G.nombreDe(m) || m.id;
        return { nombre, html: `<tr><td><b>${esc(nombre)}</b></td><td>${chipTipo(NOMBRE_TIPO[t] || t)}</td><td class="nw">${esc(m.planta ? nombrePlanta(m.planta) : '—')}</td>`
            + `<td>${esc((G.rumboDe && G.rumboDe(m)) || '—')}</td><td class="n">${num(G.largo(m.svg))} × ${num(m.alto)}</td>`
            + `<td class="n">${num(G.largo(m.svg) * (Number(m.alto) || 0))}</td><td class="n">—</td></tr>` };
    });

    // Las hojas son de alto FIJO (y recortan): los cerramientos se reparten en
    // tantas hojas como haga falta, repitiendo la cabecera de la tabla.
    //
    // Se reparten por ALTO, no por número de filas (2026-10-09, 26RES060_226): un
    // nombre largo («FBNE6 ESPACIO_LIBRE_PARCELA») parte en dos líneas y la
    // planta también lo hacía («PLANTA / BAJA»), así que 34 filas «de una
    // línea» medían 300 mm y las últimas quedaban bajo el pie o fuera de la
    // hoja — un cuadro de auditoría con cerramientos que no se ven. La planta va
    // ya sin partir (`nw`) y cada fila cuenta lo que mide (medido en el PDF:
    // 6,7 mm una línea, 10,5 dos). El hueco útil de la tabla en una hoja (entre
    // la cabecera de la tabla y el pie, dejando la nota final) son 212 mm.
    const CAB_CER = ['Cerramiento', 'Tipo', 'Planta', 'Orientación / espacio', 'Largo × alto (m)', 'Sup. bruta (m²)', 'U (W/m²K)'];
    const ALTO_UTIL_MM = 212;
    const altoFila = (f) => (String(f.nombre || '').length > 25 ? 10.5 : 6.7);
    // La primera hoja lleva además el título, las superficies y —si hay— los equipos.
    const altoPrimera = ALTO_UTIL_MM - 18 - 16 - lineasSup.reduce((s, l) => s + 6.7 + (l - 1) * 3.8, 0)
        - (filasEquipos.length ? 16 + filasEquipos.length * 6.7 : 0);
    const trozos = [[]];
    let queda = Math.max(40, altoPrimera);
    for (const f of filasMuros) {
        const h = altoFila(f);
        if (h > queda && trozos[trozos.length - 1].length) { trozos.push([]); queda = ALTO_UTIL_MM; }
        trozos[trozos.length - 1].push(f.html);
        queda -= h;
    }
    const nota = `<p class="nota">Croquis de la envolvente térmica del edificio a partir de la cartografía catastral y de la documentación del expediente${c.fichero ? `; los cuadros reproducen el fichero ${esc(c.fichero)}` : ''}. Superficies construidas medidas sobre el dibujo. La posición de los huecos a lo largo de cada muro es orientativa: el cálculo usa su superficie y el cerramiento al que pertenecen.</p>`;
    const nCuadros = nHojasPlano + 1;
    const hojaCuadros = trozos.map((filas, k) => {
        const n = nCuadros + k;
        const ultima = k === trozos.length - 1;
        return `<section class="hoja">${cabeceraHoja()}
${k === 0 ? `${titulo(nCuadros, 'Cuadro de superficies y cerramientos')}
<h3>Superficies por planta</h3>
${tabla(['Planta', 'Construida dibujada (m²)', 'No es vivienda', 'Vivienda según Catastro (m²)', 'Huecos'], filasSup)}
${filasEquipos.length ? `<h3>Ubicación de los equipos <small>· ${filasEquipos.length}</small></h3>
${tabla(['Equipo', 'Dónde'], filasEquipos, { clase: 'compacta equipos' })}` : ''}
<h3>Cerramientos <small>· ${filasMuros.length}${totHue ? ` · huecos ${num(totHue)} m²` : ''}</small></h3>`
            : `<h3>Cerramientos <small>· continuación (${k + 1} de ${trozos.length})</small></h3>`}
${tabla(CAB_CER, filas)}
${ultima ? nota : ''}
${pie(n)}</section>`;
    }).join(String.fromCharCode(10));
    totalPaginas = nHojasPlano + trozos.length;

    return (`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Croquis ${esc(c.numero)}</title>
<style>
${fuentes}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: 'DM Sans', Arial, sans-serif; color: ${M.negro}; font-size: 8.6pt; background: #fff; }
.hoja { position: relative; width: 210mm; height: 297mm; padding: 13mm 16mm 16mm; page-break-after: always; overflow: hidden; }
.hoja:last-child { page-break-after: auto; }
.cab { display: flex; justify-content: space-between; align-items: center; }
.cab .logo { height: 9mm; }
.cab .logo-txt { font-family: Montserrat, Arial, sans-serif; font-size: 14pt; }
.cab .fiscal { text-align: right; font-size: 6.8pt; color: ${M.gris}; line-height: 1.45; }
.hairline { height: 1.2mm; margin: 3mm 0 4mm; background: linear-gradient(90deg, ${M.naranja}, ${M.ambar}, ${M.lima}); border-radius: 1mm; }
.portada { margin-bottom: 3mm; }
.kicker { font-family: Montserrat, Arial, sans-serif; font-weight: 700; color: ${M.naranja}; letter-spacing: .08em; font-size: 8.4pt; margin-bottom: 2mm; }
table.meta { width: 100%; border-collapse: collapse; background: ${M.crema}; border: 1px solid ${M.grisClaro}; border-radius: 2mm; }
table.meta th { width: 20%; text-align: left; color: ${M.gris}; font-weight: 500; padding: 1.5mm 2.5mm; font-size: 7.6pt; }
table.meta td { padding: 1.5mm 2.5mm; }
.titulo { position: relative; margin-top: 2mm; height: 12mm; }
.titulo .num { position: absolute; left: 0; top: -3mm; font-family: Montserrat, Arial, sans-serif; font-weight: 700; font-size: 30pt; color: ${M.naranjaClaro}; z-index: 0; line-height: 1; }
.titulo h2 { position: relative; z-index: 1; margin: 0; padding: 3.2mm 0 0 15mm; font-family: Montserrat, Arial, sans-serif; font-weight: 700; font-size: 14pt; }
.titulo h2 small { font-family: 'DM Sans', Arial, sans-serif; font-weight: 400; font-size: 8.4pt; color: ${M.gris}; }
.regla { height: .5mm; background: linear-gradient(90deg, ${M.naranja}, ${M.ambar}, ${M.lima}); margin: 1mm 0 2.5mm; }
.leyenda { display: flex; flex-wrap: wrap; gap: 2mm 5mm; color: #3F4652; font-size: 7.4pt; margin-bottom: 2.5mm; }
.leyenda span { display: inline-flex; align-items: center; gap: 1.4mm; }
.plano { display: flex; justify-content: center; }
.plano svg { display: block; }
h3 { font-family: Montserrat, Arial, sans-serif; font-weight: 600; font-size: 10pt; margin: 4mm 0 1.5mm; }
h3::before { content: ''; display: inline-block; width: 2mm; height: 2mm; border-radius: 50%; background: ${M.lima}; margin-right: 2mm; vertical-align: middle; }
h3 small { font-family: 'DM Sans', Arial, sans-serif; font-weight: 400; color: ${M.gris}; font-size: 8pt; }
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid ${M.grisClaro}; padding: 1.2mm 1.8mm; text-align: left; vertical-align: top; }
thead th { background: ${M.crema}; font-size: 6.9pt; text-transform: uppercase; letter-spacing: .04em; color: ${M.gris}; font-weight: 700; border-bottom: .4mm solid ${M.naranja}; }
td.n { text-align: right; white-space: nowrap; }
table.compacta { width: 75%; }
table.huecos td, table.huecos th { padding: .9mm 1.6mm; }
td.nw { white-space: nowrap; }
table.equipos td { vertical-align: middle; }
table.equipos td svg { vertical-align: -0.5mm; }
.chip { border-radius: 2mm; padding: 0 1.6mm; font-size: 7pt; white-space: nowrap; border: .25mm solid; }
.chip.fach { border-color: ${M.negro}; } .chip.med { border-color: ${P.medianera}; color: #4B5260; }
.chip.part { border-color: #8EA72A; color: #5E7016; } .chip.otro { border-color: ${M.grisClaro}; color: ${M.gris}; }
.nota { color: ${M.gris}; font-size: 7.4pt; margin-top: 4mm; line-height: 1.45; }
.pie { position: absolute; left: 16mm; right: 16mm; bottom: 8mm; display: flex; justify-content: space-between; border-top: 1px solid ${M.grisClaro}; padding-top: 2mm; font-size: 6.9pt; color: ${M.gris}; }
.pie span:first-child { font-style: italic; }
</style></head><body>
${DEFS_LEYENDA}
${hojasPlanos}
${hojaCubierta}
${hojaCuadros}
</body></html>`).split('%%TOTAL_PAGINAS%%').join(String(totalPaginas));
}

/** El nombre del PDF, junto al `.cex` de la fase. No lleva sufijo de slot
 *  (`_fdo`/`_reg`/`_etq`): la rejilla del CEE no lo toma por una entrega. */
function nombreCroquis(numero, fase = 'inicial') {
    return `${numero || 'EXPEDIENTE'} - CEE ${String(fase).toLowerCase() === 'final' ? 'FINAL' : 'INICIAL'}_CROQUIS.pdf`;
}

//: ¿Es un croquis de estos? Vive con los "archivos del CEE", que lo apartan.
const { esCroquis } = require('../ceeUploadService');

/**
 * La radiografía del `.cex` (lo que hay DENTRO) pidiéndosela al motor.
 * `null` si el motor no responde: el croquis sale igual, sin las tablas.
 */
async function radiografiaDe(bytes, motor = process.env.CEE_ENGINE_URL || 'http://cee-engine:8080') {
    try {
        const fd = new FormData();
        fd.append('fichero', new Blob([bytes]), 'x.cex');
        const r = await fetch(`${motor}/cex/radiografia`, { method: 'POST', body: fd,
                                                            signal: AbortSignal.timeout(60_000) });
        return r.ok ? await r.json() : null;
    } catch { return null; }
}

/**
 * La cabecera del croquis desde el contexto de `ceeEnvolventeCex.cargarExpediente`
 * (vale para los tres negocios: el CEE directo y la oportunidad llegan ya
 * adaptados con su `instalacion`). La dirección es la de INSTALACIÓN.
 */
async function cabeceraDe(ctx, { fase = 'inicial', ficheroCex = null, autor = null } = {}) {
    let direccion = null;
    try {
        const dg = await esm('expedientes/utils/docGenerators.js');
        direccion = dg.buildInstalacionAddress({ ...ctx.expediente, clientes: ctx.cliente })?.full || null;
    } catch { /* sin dirección: el croquis sale igual */ }
    const cliente = [ctx.cliente?.nombre_razon_social, ctx.cliente?.apellidos].filter(Boolean).join(' ');
    return {
        numero: ctx.expediente?.numero_expediente, cliente, direccion,
        rc: ctx.expediente?.instalacion?.ref_catastral || ctx.expediente?.ref_catastral || null,
        fase: fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL',
        fichero: ficheroCex, autor,
        fecha: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
    };
}

/**
 * Compone el croquis y lo rasteriza. Devuelve `{ pdf, html, rx }`.
 * No escribe nada.
 */
async function croquisPdf({ cabecera, geo, trabajo, cexBytes, avisos, decisiones = null }) {
    const rx = cexBytes ? await radiografiaDe(cexBytes) : null;
    const html = await componerCroquisHtml({ cabecera, geo, trabajo, rx, avisos, decisiones });
    const pdf = await require('../pdfService').htmlToPdf(html);
    return { pdf, html, rx };
}

/**
 * Lo deja JUNTO al `.cex`, en la carpeta de la fase (`1. CEE / CEE INICIAL`).
 * El anterior se archiva en OLD, como el `.cex`: puede ser el que alguien
 * estaba mirando.
 */
async function guardarCroquisEnDrive(ctx, buffer, fase = 'inicial') {
    const cex = require('../ceeEnvolventeCex');
    const driveService = require('../driveService');
    try {
        const { id: carpeta, link: carpetaLink } = await cex.carpetaFase(ctx, fase);
        if (!carpeta) throw new Error('no se ha podido resolver la carpeta de la fase');
        const nombre = nombreCroquis(ctx.expediente?.numero_expediente, fase);
        const previo = await driveService.findFileByName(carpeta, nombre);
        if (previo) await driveService.archiveExistingToOld(carpeta, previo, nombre);
        const g = await driveService.saveFileToFolder(carpeta, nombre, 'application/pdf', buffer,
                                                      { throwOnError: true });
        if (!g?.id) throw new Error('Drive no ha devuelto el fichero');
        return { ok: true, nombre, link: g.link, driveId: g.id, carpeta_link: carpetaLink };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * Los avisos de la FICHA (lo que va por defecto o falta), sin pedir imágenes al
 * Catastro: es lo que se lista arriba del croquis cuando no lo genera la skill
 * (que ya trae los suyos). Nunca lanza.
 */
async function avisosDeFicha(ctx, { geo, trabajo, fase = 'inicial' }) {
    try {
        const cex = require('../ceeEnvolventeCex');
        const { estadoDeTrabajo, senaladoDe } = await esm('cee-envolvente/logic/senalado.js');
        const st = estadoDeTrabajo(geo, trabajo);
        const envolvente = senaladoDe(st, trabajo?.ajustes || {}, { lienzoAMundo: st.lienzoAMundo });
        const r = await cex.componerFicha(ctx, { geometria: geo.geometria, envolvente,
                                                 ajustes: trabajo?.ajustes || {}, conImagenes: false, fase });
        return r.avisos || [];
    } catch (e) {
        return [`(no se han podido componer los avisos de la ficha: ${e.message})`];
    }
}

/**
 * Del expediente al croquis en Drive, con la geometría YA pedida al motor (la
 * pide quien llama, con lo mismo que la ventana). Lo usan la ventana (botón y
 * tras «Generar .cex») y la skill: un solo camino.
 *
 * @returns {{ok, nombre?, link?, error?}}
 */
/**
 * El `.cex` que ENTREGÓ el técnico en la carpeta de la fase (el que no lleva
 * `_REVISAR`: lo reconoce `matchSlot`, el mismo criterio que la rejilla). Es el
 * que va al Registro, así que es el que reproduce el croquis cuando existe.
 */
async function cexEntregadoDeFase(ctx, fase) {
    const cex = require('../ceeEnvolventeCex');
    const driveService = require('../driveService');
    const { matchSlot } = require('../ceeUploadService');
    const carpeta = await cex.carpetaFase(ctx, fase);
    if (!carpeta?.id) return null;
    const r = await driveService.listFiles(carpeta.id);
    const f = (r?.files || r || []).find(x => /\.cex$/i.test(x.name || '') && matchSlot(x.name) === 'cex');
    if (!f) return null;
    const bytes = await driveService.getFileContent(f.id);
    return bytes?.length ? { bytes, nombre: f.name, driveId: f.id } : null;
}

async function croquisDeExpediente(ctx, { geo, trabajo, fase = 'inicial', avisos = null, autor = null }) {
    const cex = require('../ceeEnvolventeCex');
    const leido = await cexEntregadoDeFase(ctx, fase).catch(() => null)
        || await cex.leerCexDeFase(ctx, fase).catch(() => null);
    const av = Array.isArray(avisos) ? avisos : await avisosDeFicha(ctx, { geo, trabajo, fase });
    if (!leido) av.unshift(`Todavía no hay .cex del ${fase === 'final' ? 'CEE final' : 'CEE inicial'} en la carpeta: el croquis sale sin las tablas del fichero.`);
    const { pdf } = await croquisPdf({
        cabecera: await cabeceraDe(ctx, { fase, ficheroCex: leido?.nombre || null, autor }),
        geo, trabajo, cexBytes: leido?.bytes || null, avisos: av,
        // Las decisiones del Agente IA, si este borrador es suyo (su sello).
        decisiones: ctx.expediente?.cee?.agente_ia?.[fase]?.decisiones || null,
    });
    return guardarCroquisEnDrive(ctx, pdf, fase);
}

module.exports = { componerCroquisHtml, nombreCroquis, esCroquis, planoPlanta,
                   radiografiaDe, croquisPdf, guardarCroquisEnDrive, cabeceraDe,
                   avisosDeFicha, croquisDeExpediente, cexEntregadoDeFase };
