// ─────────────────────────────────────────────────────────────────────────────
// La geometría de DIBUJO del plano: medir sobre una polilínea, proyectar en
// axonometría y encuadrar.
//
// Esto NO mide el edificio. Las longitudes, las superficies y a qué da cada
// pared vienen del motor (`viz/plano_svg.py`, donde están shapely y pyproj) y
// aquí llegan ya colocadas sobre el lienzo. Lo de este fichero es lo que hace
// falta para PINTARLAS: dónde cae un hueco a lo largo de un muro quebrado, por
// qué lado sale su cota, y qué encuadre abarca el edificio visto en 3D.
//
// Va aparte de `PlanoPlanta` porque es PURO: sin React, sin DOM y sin estado,
// así que se puede comprobar con un `node -e` cuando un dibujo sale raro.
//
// TODO LO DE AQUÍ ESTÁ EN METROS. El SVG del plano también: un `viewBox` de
// 21 × 20 son veintiún metros por veinte.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que mide un recorrido, sumando tramo a tramo. */
export function largo(pts) {
    const p = pts || [];
    let s = 0;
    for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    return s;
}

/**
 * El punto que está a `d` metros del arranque, MEDIDO SOBRE EL RECORRIDO.
 *
 * Hay que recorrerlo tramo a tramo y no interpolar entre los extremos: una
 * fachada con un retranqueo es una polilínea, y la recta que une su principio
 * con su final atraviesa la casa por dentro — la ventana saldría dibujada en el
 * salón. Devuelve también el ÁNGULO del tramo, que es el que orienta el hueco.
 */
export function at(pts, d) {
    const p = pts || [];
    if (p.length < 2) return { x: p[0]?.[0] || 0, y: p[0]?.[1] || 0, ang: 0 };
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc + L >= d || i === p.length - 1) {
            const t = L ? Math.min(1, Math.max(0, (d - acc) / L)) : 0;
            return {
                x: a[0] + (b[0] - a[0]) * t,
                y: a[1] + (b[1] - a[1]) * t,
                ang: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
            };
        }
        acc += L;
    }
    return { x: p[0][0], y: p[0][1], ang: 0 };
}

/** El medio del muro sobre su recorrido, por el mismo motivo que `at`. */
export function centro(pts) {
    const c = at(pts, largo(pts) / 2);
    return [c.x, c.y];
}

/** El centro de masas de un puñado de puntos: de él sale hacia dónde se
 *  aparta una cota (siempre HACIA FUERA del edificio). */
export function centroide(puntos) {
    const p = puntos || [];
    if (!p.length) return [0, 0];
    return [p.reduce((s, q) => s + q[0], 0) / p.length,
            p.reduce((s, q) => s + q[1], 0) / p.length];
}

/**
 * La línea de cota de un muro RECTO, apartada hacia fuera.
 *
 * Devuelve el trazo (`d`), la transformación del texto y el propio texto. El
 * texto se voltea 180° cuando la rotación se pasa de ±90°: sin eso, las cotas
 * de la mitad izquierda del plano se leen del revés.
 */
export function cota(pts, { hacia, apartar = 1.35, tope = 0.26 }) {
    const [p, q] = [pts[0], pts[pts.length - 1]];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy);
    if (!L) return null;

    let nx = -dy / L, ny = dx / L;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    // La normal, del lado contrario al centro del edificio: una cota por dentro
    // se pisa con las paredes de al lado y con los rótulos.
    if ((mx - hacia[0]) * nx + (my - hacia[1]) * ny < 0) { nx = -nx; ny = -ny; }

    const a = [p[0] + nx * apartar, p[1] + ny * apartar];
    const b = [q[0] + nx * apartar, q[1] + ny * apartar];
    let rot = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (rot > 90 || rot < -90) rot += 180;

    return {
        d: `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`
           + ` M ${a[0] - nx * tope} ${a[1] - ny * tope} L ${a[0] + nx * tope} ${a[1] + ny * tope}`
           + ` M ${b[0] - nx * tope} ${b[1] - ny * tope} L ${b[0] + nx * tope} ${b[1] + ny * tope}`,
        tr: `translate(${mx + nx * (apartar + 0.55)} ${my + ny * (apartar + 0.55)}) rotate(${rot})`,
        texto: `${fmt(L)} m`,
        largo: L,
    };
}

/**
 * Axonometría: del metro del plano al metro de la pantalla.
 *
 * Es una proyección de PLATO GIRATORIO, como la de cualquier programa de
 * arquitectura: el edificio se gira sobre su eje vertical (`az`, el acimut) y
 * la cámara sube o baja sobre el horizonte (`alt`). No es una fórmula nueva —
 * la isométrica de siempre es EXACTAMENTE este caso con az 45° y alt 35,264°,
 * y `iso()` la conserva byte a byte para que la vista de partida no se mueva.
 *
 *   u =  x·cos az − y·sen az        el plano, ya girado
 *   v =  x·sen az + y·cos az
 *   pantalla = ( K·u , K·(v·sen alt − z·cos alt) )
 *
 * Con `alt` 90° se ve la planta (la altura no aporta nada) y con 0°, el alzado
 * (el plano se aplasta en una línea): por eso los topes de giro están ahí.
 *
 * La Y del SVG ya crece hacia abajo —el motor la invirtió al colocar los
 * puntos—, así que la ALTURA se RESTA: un muro sube en pantalla al crecer `z`.
 *
 * El PIVOTE es lo que hace que girar no sea un salto: sin él, el edificio da
 * vueltas alrededor del origen del plano —que puede caer a treinta metros— y se
 * sale de la pantalla al primer arrastre. Restándolo, gira sobre sí mismo y su
 * centro se queda clavado en el (0,0) de la pantalla.
 *
 * `K` no significa nada: es el factor que deja la vista de partida con los
 * mismos números que la isométrica anterior. El `viewBox` encuadra solo, así
 * que una escala uniforme no cambia el dibujo.
 */
export const ESCALA_AXO = 1.224745;
const K = ESCALA_AXO;

export const CAMARA_ISO = { az: 45, alt: 35.264 };

/** Los topes del giro. Pasado el horizonte el edificio se ve por debajo del
 *  forjado, que no es una vista de nada; y en 90° clavados la axonometría ES
 *  la planta, y para eso está el 2D. */
export const TOPE_ALT = { min: 8, max: 88 };

export function proyector(camara) {
    const { az = 45, alt = 35.264, pivote } = camara || {};
    const a = (az * Math.PI) / 180, e = (alt * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a), se = Math.sin(e), ce = Math.cos(e);
    const [px, py, pz] = pivote || [0, 0, 0];
    const f = (x, y, z) => {
        const dx = x - px, dy = y - py, dz = (z || 0) - pz;
        return [K * (dx * ca - dy * sa),
                K * ((dx * sa + dy * ca) * se - dz * ce)];
    };
    f.escala = K;
    // Hacia dónde cae cada rumbo EN PANTALLA, que es lo que dibuja la brújula.
    // En el lienzo del motor la X crece al ESTE y la Y al SUR (`svg_y = maxy − y`),
    // así que el norte es el (0,−1) del plano.
    f.rumbo = (ex, ey) => [K * (ex * ca - ey * sa), K * ((ex * sa + ey * ca) * se)];
    f.aplanado = se;   // cuánto se aplasta el suelo: el achatamiento de la brújula
    return f;
}

/** La isométrica de toda la vida, que es la vista de partida. */
export const iso = proyector(CAMARA_ISO);

/** La caja que abarca unos puntos, con su respiro. */
export function caja(puntos, aire = 1) {
    const p = puntos || [];
    if (!p.length) return { x: 0, y: 0, ancho: 1, alto: 1 };
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    const x = Math.min(...xs) - aire, y = Math.min(...ys) - aire;
    return {
        x, y,
        ancho: Math.max(...xs) - x + aire,
        alto: Math.max(...ys) - y + aire,
    };
}

/**
 * El punto de una polilínea más cercano a (x, y), con su distancia.
 *
 * Es la proyección sobre cada tramo, acotada a sus extremos: sin acotarla, un
 * muro corto "atrae" desde el otro lado del plano porque su RECTA pasa cerca.
 */
export function puntoMasCercano(pts, x, y) {
    let mejor = null;
    for (let i = 1; i < (pts || []).length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const dx = bx - ax, dy = by - ay;
        const L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
        const qx = ax + dx * t, qy = ay + dy * t;
        const d = Math.hypot(x - qx, y - qy);
        if (!mejor || d < mejor.d) mejor = { x: qx, y: qy, d };
    }
    return mejor;
}

/**
 * El IMÁN: pega un punto a la pared más cercana.
 *
 * POR QUÉ EXISTE: un extremo suelto en medio de la nada deja un plano que no
 * cierra — y una pared que no llega a ninguna parte no es una pared, es una
 * raya. Pegándola a la de al lado, lo que se dibuja siempre va de algo a algo,
 * que es como se dibuja un tabique en un plano de obra.
 *
 * `radio` está en METROS, como todo lo de aquí. Fuera de él no se pega nada y
 * el punto se queda donde se ha soltado: forzarlo a la pared más cercana del
 * edificio daría saltos de tres metros.
 */
export function pegarAPared(paredes, x, y, radio = 1.1, salvo = null) {
    let mejor = null;
    for (const m of paredes || []) {
        if (!m || m.id === salvo || !(m.svg || []).length) continue;
        const q = puntoMasCercano(m.svg, x, y);
        if (q && q.d <= radio && (!mejor || q.d < mejor.d)) mejor = { ...q, id: m.id };
    }
    return mejor;
}

/** Los puntos tal cual, en el formato de `<polyline>` / `<polygon>`. */
export function recorrido(pts) {
    return (pts || []).map(([x, y]) => `${x},${y}`).join(' ');
}

/**
 * Dónde cae cada hueco a lo largo de su muro, en tanto por uno.
 *
 * ES COSMÉTICO Y NO VIAJA AL `.cex`. CE3X no coloca los huecos: de cada uno
 * quiere su superficie, su orientación y a qué cerramiento pertenece, nada
 * más. Pero el plano se mira para PENSAR, y una fachada con la puerta en el
 * centro y la ventana a un lado se reconoce de un vistazo — la misma fachada
 * con los huecos repartidos a partes iguales, no. Por eso se puede arrastrar
 * cada uno a su sitio (`hueco.pos`) y eso se guarda con el trabajo.
 *
 * El que no se haya tocado se reparte como siempre: si no, colocar uno a mano
 * movería de sitio a todos los demás.
 */
export function reparto(huecos) {
    const n = (huecos || []).length;
    return (huecos || []).map((h, i) => ({
        hueco: h, i,
        pos: Number.isFinite(h?.pos) ? Math.min(1, Math.max(0, h.pos))
                                     : (i + 1) / (n + 1),
    }));
}

export const fmt = n => (Number(n) || 0).toFixed(2).replace('.', ',');

export default { largo, at, centro, centroide, cota, iso, proyector, CAMARA_ISO, ESCALA_AXO,
                 TOPE_ALT, caja, recorrido, reparto, fmt, puntoMasCercano, pegarAPared };
