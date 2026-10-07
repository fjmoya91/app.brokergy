// ─────────────────────────────────────────────────────────────────────────────
// La PIZARRA del plano: dibujar a mano alzada cómo es DE VERDAD la vivienda.
//
// POR QUÉ EXISTE. El CEE inicial lo prepara la IA (skill `generar-cee-inicial`)
// con lo que dicen Catastro y las fotos, y a veces no coincide con la realidad:
// una partición que no está, una medianera que en realidad da a un patio, una
// ventana que no se ve en ninguna foto. Corregirlo con los mandos de siempre
// —seleccionar la pared, «da contra», «+ ventana», teclear medidas— es lento en
// un ordenador y casi imposible en una tablet. Con un lápiz es lo natural: se
// elige QUÉ se dibuja (muro exterior, medianera, partición, ventana, puerta) y
// se raya encima del plano.
//
// QUÉ HACE ESTE FICHERO. Solo INTERPRETA el trazo: dice qué ha querido decir
// quien lo ha dibujado (dar de alta una pared, cambiarle el tipo a otra, poner
// una ventana en un muro, borrar algo). No toca el estado: eso lo hace
// `aplicaPizarra` en `usePlanoEnvolvente`, con las MISMAS funciones que los
// botones del panel. Es PURO —sin React ni DOM— para poder comprobarlo desde
// Node (`backend/scripts/test_pizarra.mjs`) y para que lo use igual la página
// del MÓVIL.
//
// REGLA — la pizarra dice QUÉ HAY y DÓNDE, no CUÁNTO MIDE. Una ventana dibujada
// nace con un ancho aproximado (lo que mide el trazo) y la medida POR
// CONFIRMAR: las medidas reales las pone después quien tiene las fotos o la
// cinta. Lo que sí manda es la ESTRUCTURA: qué paredes hay, de qué tipo y qué
// huecos llevan.
//
// TODO EN METROS, en coordenadas del LIENZO del plano (como `geometriaPlano`).
// ─────────────────────────────────────────────────────────────────────────────

import {
    largo, puntoMasCercano, pegarAPared, simplificarTrazo, rumboDelAzimut,
    centroide, reparto, LARGO_MINIMO_PARED,
} from './geometriaPlano.js';
import { tipoDe, esFuera, admiteHuecos } from './tiposPared.js';

//: Las herramientas del lápiz. `mano` es el modo de siempre (mover el plano,
//: elegir una pared, arrastrar sus tiradores): se queda en la paleta para no
//: tener que salir de la pizarra para mirar algo.
export const HERRAMIENTAS = [
    { id: 'mano', etiqueta: 'Mover', corta: 'Mover',
      ayuda: 'Mover el plano y tocar una pared para ver sus datos' },
    { id: 'FACHADA', etiqueta: 'Muro exterior', corta: 'Exterior', pared: true,
      ayuda: 'Raya una pared nueva que da a la calle o a un patio — o repasa una que ya está para que lo sea' },
    { id: 'MEDIANERA', etiqueta: 'Medianera', corta: 'Medianera', pared: true,
      ayuda: 'La pared contra la casa de al lado: dibújala o repasa la que está' },
    { id: 'PARTICION_VERTICAL', etiqueta: 'Partición', corta: 'Partición', pared: true,
      ayuda: 'La pared contra un garaje, trastero o local sin calefacción' },
    { id: 'ventana', etiqueta: 'Ventana', corta: 'Ventana', hueco: true,
      ayuda: 'Raya sobre el muro exterior lo que ocupa la ventana (un toque la pone de 1,30 m)' },
    { id: 'puerta', etiqueta: 'Puerta', corta: 'Puerta', hueco: true,
      ayuda: 'Raya sobre el muro exterior lo que ocupa la puerta (un toque la pone de 0,90 m)' },
    { id: 'goma', etiqueta: 'Borrar', corta: 'Borrar',
      ayuda: 'Pasa por encima de una ventana, una puerta o una pared dibujada para quitarla' },
];

//: El color del lápiz es el de lo que se dibuja en el plano: un muro exterior
//: sale verde, una medianera azul, una partición rosa (`COLOR_TIPO` de
//: `PlanoPlanta`); la puerta en su marrón.
export const COLOR_LAPIZ = {
    mano: 'var(--text-secondary)',
    FACHADA: 'var(--success)',
    MEDIANERA: 'var(--info)',
    PARTICION_VERTICAL: '#e0559b',
    ventana: 'var(--info)',
    puerta: '#b5763a',
    goma: 'var(--danger)',
};
export const colorDeLapiz = (h) => COLOR_LAPIZ[h] || 'var(--text-primary)';

export const ETIQUETA_TIPO = {
    FACHADA: 'muro exterior', MEDIANERA: 'medianera', PARTICION_VERTICAL: 'partición',
};

//: Ancho de partida de un hueco puesto con un TOQUE. Son los mismos que los de
//: «+ ventana» del panel (`POR_DEFECTO` del hook): un toque es decir «aquí hay
//: una», y su tamaño lo da quien la mida.
export const ANCHO_TOQUE = { ventana: 1.30, puerta: 0.90 };
//: El alto con el que nace, igual que en el panel.
export const ALTO_DEFECTO = { ventana: 1.30, puerta: 2.10 };

//: Un hueco más estrecho que esto es un resbalón (o un toque que se ha movido).
const ANCHO_MINIMO_HUECO = 0.4;
//: Cada cuánto se muestrea el trazo para medirlo contra las paredes.
const PASO = 0.1;

const r2 = v => Math.round(v * 100) / 100;
const r5 = v => Math.round(v * 20) / 20;      // a 5 cm: lo que se puede afirmar de una raya

/** Los tamaños que dependen del ZOOM, con un suelo y un techo en metros. */
export function tolerancias(tam = 0.5, iman = 1.1) {
    const t = Number(tam) > 0 ? Number(tam) : 0.5;
    return {
        // Un TOQUE: lo que se mueve el dedo al tocar la pantalla.
        toque: Math.max(0.25, Math.min(0.9, t * 0.7)),
        // Cerca de una pared, para repasarla o borrarla.
        sobre: Math.max(0.3, Math.min(1.0, t * 0.9)),
        // Un hueco se busca un poco más lejos: se raya por fuera del muro.
        hueco: Math.max(0.45, Math.min(1.6, t * 1.4)),
        // Las esquinas y el arranque de un tabique.
        iman: Math.max(0.15, Math.min(1.6, Number(iman) || 1.1)),
        // Lo que se aleja un trazo de su recta antes de contar como un quiebro.
        recta: Math.max(0.25, Math.min(1.2, t * 0.6)),
    };
}

/** El trazo con un punto cada `paso` metros, para medirlo sin depender de la velocidad del dedo. */
export function muestrear(pts, paso = PASO) {
    const p = (pts || []).filter(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]));
    if (p.length < 2) return p.map(q => [q[0], q[1]]);
    const out = [[p[0][0], p[0][1]]];
    let resto = 0;
    for (let i = 1; i < p.length; i++) {
        const [ax, ay] = p[i - 1], [bx, by] = p[i];
        const L = Math.hypot(bx - ax, by - ay);
        let d = paso - resto;
        while (d <= L) {
            out.push([ax + (bx - ax) * (d / L), ay + (by - ay) * (d / L)]);
            d += paso;
        }
        resto = L - (d - paso);
    }
    const u = p[p.length - 1];
    const o = out[out.length - 1];
    if (Math.hypot(u[0] - o[0], u[1] - o[1]) > 1e-6) out.push([u[0], u[1]]);
    return out;
}

/** Cuánto se ha recorrido sobre una polilínea hasta el punto más cercano a (x, y). */
export function abscisa(pts, x, y) {
    let mejor = null, acc = 0;
    for (let i = 1; i < (pts || []).length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const dx = bx - ax, dy = by - ay;
        const L2 = dx * dx + dy * dy;
        const L = Math.sqrt(L2);
        const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
        const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
        if (!mejor || d < mejor.d) mejor = { s: acc + L * t, d };
        acc += L;
    }
    return mejor || { s: 0, d: Infinity };
}

const conTrazo = (muros) => (muros || []).filter(m => m && Array.isArray(m.svg) && m.svg.length >= 2);

/**
 * La pared sobre la que se ha rayado: la que tiene más puntos del trazo cerca.
 * `frac` es la parte del trazo que va pegada a ella.
 */
export function paredBajoTrazo(muestras, muros, tol) {
    let mejor = null;
    for (const m of conTrazo(muros)) {
        let cerca = 0, suma = 0;
        for (const [x, y] of muestras) {
            const q = puntoMasCercano(m.svg, x, y);
            if (q && q.d <= tol) { cerca++; suma += q.d; }
        }
        if (!cerca) continue;
        const frac = cerca / muestras.length;
        const media = suma / cerca;
        // Las paredes que CUENTAN antes que las apartadas: encima de una
        // apartada suele haber otra que es la buena.
        const peso = frac - (esFuera(m) ? 0.05 : 0);
        if (!mejor || peso > mejor.peso + 1e-9 || (Math.abs(peso - mejor.peso) < 1e-9 && media < mejor.media)) {
            mejor = { m, frac, media, peso };
        }
    }
    return mejor;
}

/** La pared más cercana a un punto, dentro de `tol`. */
export function paredMasCercana(muros, x, y, tol) {
    let mejor = null;
    for (const m of conTrazo(muros)) {
        const q = puntoMasCercano(m.svg, x, y);
        if (q && q.d <= tol && (!mejor || q.d < mejor.d - 1e-9
            || (Math.abs(q.d - mejor.d) < 1e-9 && esFuera(mejor.m) && !esFuera(m)))) {
            mejor = { m, d: q.d };
        }
    }
    return mejor;
}

/**
 * La dirección DOMINANTE del edificio, en radianes, módulo 90°.
 *
 * Las casas se construyen a escuadra: las paredes van en dos direcciones
 * perpendiculares. Se saca de las que ya hay (pesadas por su largo) con la
 * media circular de 4θ, que trata igual una pared y su perpendicular. Es lo que
 * permite ENDEREZAR un trazo a mano alzada sin que quede torcido un grado.
 */
export function direccionDominante(muros) {
    let s = 0, c = 0;
    for (const m of conTrazo(muros)) {
        const p = m.svg;
        for (let i = 1; i < p.length; i++) {
            const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1];
            const L = Math.hypot(dx, dy);
            if (L < 0.3) continue;
            const a = Math.atan2(dy, dx);
            s += L * Math.sin(4 * a);
            c += L * Math.cos(4 * a);
        }
    }
    if (!s && !c) return 0;
    return Math.atan2(s, c) / 4;
}

/**
 * La dirección de un tramo, ENDEREZADA a la escuadra del edificio si le falta
 * poco (menos de `tolGrados`). Devuelve el vector unitario.
 */
export function enderezar(dx, dy, dominante, tolGrados = 9) {
    const L = Math.hypot(dx, dy);
    if (!L) return [1, 0];
    const a = Math.atan2(dy, dx);
    // Los cuatro rumbos de la escuadra: la dominante y sus perpendiculares.
    let mejor = null;
    for (let k = -4; k <= 4; k++) {
        const b = dominante + (k * Math.PI) / 2;
        let d = a - b;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (!mejor || Math.abs(d) < Math.abs(mejor.d)) mejor = { b, d };
    }
    if (Math.abs(mejor.d) <= (tolGrados * Math.PI) / 180) return [Math.cos(mejor.b), Math.sin(mejor.b)];
    return [dx / L, dy / L];
}

/** Dónde corta la semirrecta (o, d) a la polilínea `pts`, o `null`. */
function corteConPared(pts, o, d) {
    let mejor = null;
    for (let i = 1; i < (pts || []).length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const ex = bx - ax, ey = by - ay;
        const den = d[0] * ey - d[1] * ex;
        if (Math.abs(den) < 1e-9) continue;          // paralelas
        const t = ((ax - o[0]) * ey - (ay - o[1]) * ex) / den;   // sobre la semirrecta
        const u = ((ax - o[0]) * d[1] - (ay - o[1]) * d[0]) / den; // sobre el tramo
        if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && (!mejor || t < mejor.t)) {
            mejor = { t, x: o[0] + d[0] * t, y: o[1] + d[1] * t };
        }
    }
    return mejor;
}

/** El extremo de un tabique: a una ESQUINA si hay una cerca; si no, a la pared más cercana. */
function pegarExtremo(muros, x, y, iman) {
    let esquina = null;
    for (const m of conTrazo(muros)) {
        for (const q of [m.svg[0], m.svg[m.svg.length - 1]]) {
            const d = Math.hypot(q[0] - x, q[1] - y);
            if (d <= iman * 0.6 && (!esquina || d < esquina.d)) esquina = { x: q[0], y: q[1], d, id: m.id };
        }
    }
    if (esquina) return esquina;
    const q = pegarAPared(conTrazo(muros), x, y, iman, null);
    return q ? { x: q.x, y: q.y, id: q.id } : { x, y, id: null };
}

/**
 * Las paredes que salen de un trazo a mano alzada: se quedan sus QUIEBROS
 * (Ramer-Douglas-Peucker con una tolerancia de medio metro), cada tramo se
 * endereza a la escuadra del edificio y los dos extremos se pegan a la pared
 * que tienen al lado — un tabique va de algo a algo.
 */
export function tramosDeTrazo(pts, muros, { recta = 0.4, iman = 1.1 } = {}) {
    const limpios = simplificarTrazo(pts, recta, 40);
    if (limpios.length < 2) return [];
    // Fuera los quiebros que dejan un tramo ridículo: son el dedo al levantar.
    const minimo = Math.max(LARGO_MINIMO_PARED * 2, recta);
    const v = [limpios[0]];
    for (let i = 1; i < limpios.length; i++) {
        const q = limpios[i];
        const u = v[v.length - 1];
        const ultimo = i === limpios.length - 1;
        if (Math.hypot(q[0] - u[0], q[1] - u[1]) < minimo) {
            if (ultimo && v.length > 1) v[v.length - 1] = q;   // el final manda sobre el quiebro
            continue;
        }
        v.push(q);
    }
    if (v.length < 2) return [];
    // Un quiebro que apenas se aparta de la recta entre sus vecinos no es un
    // quiebro: es el pulso. `simplificarTrazo` no toca los trazos de tres puntos
    // o menos —y un arrastre rápido deja justo eso—, así que se mira aquí.
    for (let i = 1; i < v.length - 1;) {
        const [ax, ay] = v[i - 1], [bx, by] = v[i + 1], [x, y] = v[i];
        const L = Math.hypot(bx - ax, by - ay);
        const d = L ? Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / L : Infinity;
        if (d <= recta) v.splice(i, 1); else i++;
    }

    const dom = direccionDominante(muros);
    const a0 = pegarExtremo(muros, v[0][0], v[0][1], iman);
    const vert = [[a0.x, a0.y]];
    for (let i = 1; i < v.length; i++) {
        const prev = vert[vert.length - 1];
        const crudo = v[i];
        const d = enderezar(crudo[0] - prev[0], crudo[1] - prev[1], dom);
        const largoTramo = (crudo[0] - prev[0]) * d[0] + (crudo[1] - prev[1]) * d[1];
        let q = [prev[0] + d[0] * largoTramo, prev[1] + d[1] * largoTramo];
        if (i === v.length - 1) {
            // El final: se busca la pared contra la que muere el tabique y se
            // corta con ella sin perder la escuadra. Si no corta ninguna cerca,
            // se pega a la más cercana.
            const cerca = pegarExtremo(muros, q[0], q[1], iman);
            let mejor = null;
            if (cerca.id) {
                const m = conTrazo(muros).find(x => x.id === cerca.id);
                const c = m && corteConPared(m.svg, prev, d);
                if (c && Math.hypot(c.x - q[0], c.y - q[1]) <= iman) mejor = [c.x, c.y];
            }
            q = mejor || [cerca.x, cerca.y];
        }
        vert.push(q);
    }
    const out = [];
    for (let i = 1; i < vert.length; i++) {
        const a = vert[i - 1], b = vert[i];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= LARGO_MINIMO_PARED) out.push([[r2(a[0]), r2(a[1])], [r2(b[0]), r2(b[1])]]);
    }
    return out;
}

/**
 * El rumbo hacia FUERA de una pared nueva: el de su normal que se aleja del
 * centro de la planta. Es una PROPUESTA —una pared que cierra un patio puede
 * mirar hacia dentro— y por eso se dice en el panel, donde se cambia.
 *
 * Lienzo = mundo con la Y del revés (ver `rumbosDeLaPared`).
 */
export function rumboHaciaFuera(pts, centro) {
    const p = pts || [];
    if (p.length < 2 || !centro) return null;
    const [ax, ay] = p[0], [bx, by] = p[p.length - 1];
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy);
    if (!L) return null;
    let nx = -dy / L, ny = dx / L;                       // una de las dos normales
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if ((mx + nx - centro[0]) ** 2 + (my + ny - centro[1]) ** 2
        < (mx - nx - centro[0]) ** 2 + (my - ny - centro[1]) ** 2) { nx = -nx; ny = -ny; }
    // Al mundo: la Y del lienzo crece hacia el SUR.
    const az = ((Math.atan2(nx, -ny) * 180) / Math.PI + 360) % 360;
    return rumboDelAzimut(az);
}

/** Dónde cae cada hueco de un muro (centro, medio ancho), en metros sobre su recorrido. */
export function huecosColocados(m) {
    const L = largo(m?.svg);
    if (!L) return [];
    return reparto(m.huecos).map(({ hueco: h, pos, i }) => ({
        h, i, s: L * pos, medio: Math.min(Number(h.ancho) || 0.9, L * 0.9) / 2, L,
    }));
}

/**
 * QUÉ ha querido decir un trazo, según la herramienta.
 *
 * `muros` son los de la PLANTA en la que se dibuja, en el lienzo, con su tipo
 * (`tipo_manual` incluido), sus huecos y si son dibujados. Devuelve una ACCIÓN
 * o `{ error }` con lo que hay que decirle a quien dibuja:
 *
 *   { accion: 'reclasificar', id, tipo }
 *   { accion: 'paredes', tipo, tramos: [[a, b], …] }
 *   { accion: 'hueco', id, tipo, ancho, pos }
 *   { accion: 'borrar', huecos: [{ id, uid, nombre }], paredes: [id] }
 */
export function interpretarTrazo({ pts, herramienta, muros, tam = 0.5, iman = 1.1 }) {
    const tol = tolerancias(tam, iman);
    const herr = HERRAMIENTAS.find(h => h.id === herramienta);
    if (!herr || herr.id === 'mano') return { error: 'Elige primero qué vas a dibujar.' };
    const crudo = (pts || []).filter(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]));
    if (!crudo.length) return { error: 'No ha llegado ningún trazo.' };
    const L = largo(crudo);
    const toque = L < tol.toque;
    const muestras = toque ? [crudo[0]] : muestrear(crudo);
    const lista = conTrazo(muros);

    // ── Paredes ──────────────────────────────────────────────────────────────
    if (herr.pared) {
        if (toque) {
            const c = paredMasCercana(lista, crudo[0][0], crudo[0][1], Math.max(tol.sobre, tol.hueco));
            if (!c) return { error: `Toca una pared para que sea ${ETIQUETA_TIPO[herr.id]}, o arrastra para dibujar una nueva.` };
            return { accion: 'reclasificar', id: c.m.id, tipo: herr.id };
        }
        // Repasar una pared que YA está es decir qué es: no se dibuja otra encima.
        const sobre = paredBajoTrazo(muestras, lista, tol.sobre);
        if (sobre && sobre.frac >= 0.7) {
            // …salvo que el trazo sea mucho más largo que la pared: entonces
            // es un tabique nuevo que pasa por al lado.
            const Lp = largo(sobre.m.svg);
            if (L <= Lp * 1.6 + tol.sobre) return { accion: 'reclasificar', id: sobre.m.id, tipo: herr.id };
        }
        const tramos = tramosDeTrazo(crudo, lista, { recta: tol.recta, iman: tol.iman });
        if (!tramos.length) return { error: 'Esa raya es demasiado corta para ser una pared: arrástrala de una pared a otra.' };
        return { accion: 'paredes', tipo: herr.id, tramos };
    }

    // ── Huecos ───────────────────────────────────────────────────────────────
    if (herr.hueco) {
        let m = null;
        if (toque) {
            m = paredMasCercana(lista, crudo[0][0], crudo[0][1], tol.hueco)?.m || null;
        } else {
            // La pared con la que va el trazo: la de menor distancia media,
            // contando solo las que tienen al menos la mitad del trazo cerca.
            let mejor = null;
            for (const w of lista) {
                let cerca = 0, suma = 0;
                for (const [x, y] of muestras) {
                    const q = puntoMasCercano(w.svg, x, y);
                    if (q && q.d <= tol.hueco) { cerca++; suma += q.d; }
                }
                if (cerca < muestras.length * 0.5) continue;
                const media = suma / cerca;
                if (!mejor || media < mejor.media - 1e-9
                    || (Math.abs(media - mejor.media) < 1e-9 && esFuera(mejor.w) && !esFuera(w))) {
                    mejor = { w, media };
                }
            }
            m = mejor?.w || null;
        }
        const que = herr.id === 'puerta' ? 'la puerta' : 'la ventana';
        if (!m) return { error: `Dibuja ${que} encima de su pared.` };
        if (!admiteHuecos(m)) {
            const es = esFuera(m) ? 'está apartada de la envolvente' : `es ${ETIQUETA_TIPO[tipoDe(m)] || 'otra cosa'}`;
            return { error: `${herr.id === 'puerta' ? 'Las puertas' : 'Las ventanas'} solo van en un muro exterior, y ${m.nombre || m.id} ${es}. `
                + 'Pásala antes a «Muro exterior» (repásala con ese lápiz).' };
        }
        const Lp = largo(m.svg);
        const ss = muestras.map(([x, y]) => abscisa(m.svg, x, y).s);
        const sMin = Math.min(...ss), sMax = Math.max(...ss);
        let ancho = toque ? ANCHO_TOQUE[herr.id] : r5(sMax - sMin);
        if (!toque && ancho < ANCHO_MINIMO_HUECO) ancho = ANCHO_TOQUE[herr.id];
        ancho = Math.min(ancho, r5(Lp * 0.9));
        const centro = toque ? ss[0] : (sMin + sMax) / 2;
        const margen = Math.min(0.48, (ancho / 2) / (Lp || 1));
        const pos = Math.round(Math.max(margen, Math.min(1 - margen, centro / (Lp || 1))) * 1000) / 1000;
        return { accion: 'hueco', id: m.id, tipo: herr.id, ancho, pos };
    }

    // ── Goma ─────────────────────────────────────────────────────────────────
    // Primero los HUECOS: borrar una ventana es lo corriente, y está encima de
    // su pared — si se mirara antes la pared, no habría forma de quitar solo
    // la ventana.
    const huecos = [];
    for (const m of lista) {
        for (const c of huecosColocados(m)) {
            const toca = muestras.some(([x, y]) => {
                const q = abscisa(m.svg, x, y);
                return q.d <= tol.sobre && Math.abs(q.s - c.s) <= c.medio + Math.min(0.25, tol.sobre * 0.5);
            });
            if (toca) huecos.push({ id: m.id, uid: c.h.uid || null, nombre: c.h.nombre || null, i: c.i });
        }
    }
    if (huecos.length) return { accion: 'borrar', huecos, paredes: [] };
    let paredes;
    if (toque) {
        const c = paredMasCercana(lista, crudo[0][0], crudo[0][1], tol.sobre);
        paredes = c ? [c.m] : [];
    } else {
        paredes = lista.filter(m => muestras.some(([x, y]) => (puntoMasCercano(m.svg, x, y)?.d ?? Infinity) <= tol.sobre));
    }
    // Las que ya están fuera no se «borran» otra vez.
    paredes = paredes.filter(m => m.dibujada || !esFuera(m));
    if (!paredes.length) return { error: 'Pasa la goma por encima de una ventana, una puerta o una pared.' };
    return { accion: 'borrar', huecos: [], paredes: paredes.map(m => m.id) };
}

/** El centro de una planta: hacia dónde queda «dentro». */
export function centroDePlanta(muros) {
    return centroide(conTrazo(muros).filter(m => !m.dibujada).flatMap(m => m.svg));
}

export default {
    HERRAMIENTAS, COLOR_LAPIZ, colorDeLapiz, ETIQUETA_TIPO, ANCHO_TOQUE, ALTO_DEFECTO, tolerancias, muestrear, abscisa,
    paredBajoTrazo, paredMasCercana, direccionDominante, enderezar, tramosDeTrazo,
    rumboHaciaFuera, huecosColocados, interpretarTrazo, centroDePlanta,
};
