/**
 * DELIMITAR LA VIVIENDA desde el MÓVIL — lo geométrico, sin React.
 *
 * En una comunidad de adosados la parcela es la del CONJUNTO y Catastro no dice
 * dónde acaba cada casa (regla 75): hay que dibujar el contorno de la vivienda,
 * y el motor vuelve a medir con lo de fuera como la casa de al lado (medianera).
 * En el ordenador se pulsa vértice a vértice; aquí, lo mismo con el dedo, desde
 * la planta que se abre con el QR del croquis.
 *
 * Lo comparten la página del teléfono (`CroquisMovilView`) y la ventana del
 * ordenador (que convierte el contorno al MUNDO y resume lo que ha salido), y se
 * prueba desde Node (`scripts/test_contorno_movil.mjs`).
 */
import { TIPOS_PARED, esFuera, tipoDe } from './tiposPared.js';

const r2 = (v) => Math.round(v * 100) / 100;
//: Los vértices que admite un contorno: una casa no tiene cuarenta esquinas, y
//: lo que viaja al motor no puede ser una lista sin tope.
export const MAX_VERTICES = 60;

/**
 * El IMÁN de un vértice del contorno: primero las ESQUINAS (los extremos de las
 * paredes), que es donde casi siempre se apoya el contorno; si no hay ninguna
 * cerca, la pared más cercana —el punto en que la fachada se encuentra con la
 * casa de al lado—. Fuera del radio el punto se queda donde cae: por la calle y
 * por el jardín se puede pasar, lo que sobresale del edificio no cuenta.
 *
 * Es el mismo criterio que el imán de las zonas del ordenador (`pegarVertice`
 * en `PlanoPlanta`), en coordenadas del lienzo (metros).
 *
 * @returns {{ p: [number, number], pegado: 'esquina'|'pared'|null }}
 */
export function pegarVerticeContorno(muros, [x, y], radio) {
    let mejor = null;
    for (const m of muros || []) {
        const pts = m?.svg || [];
        for (const q of [pts[0], pts[pts.length - 1]]) {
            if (!q) continue;
            const d = Math.hypot(q[0] - x, q[1] - y);
            if (d <= radio && (!mejor || d < mejor.d)) mejor = { x: q[0], y: q[1], d };
        }
    }
    if (mejor) return { p: [r2(mejor.x), r2(mejor.y)], pegado: 'esquina' };
    let linea = null;
    for (const m of muros || []) {
        const pts = m?.svg || [];
        for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
            const dx = bx - ax, dy = by - ay;
            const l2 = dx * dx + dy * dy;
            const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
            const qx = ax + dx * t, qy = ay + dy * t;
            const d = Math.hypot(x - qx, y - qy);
            if (d <= radio && (!linea || d < linea.d)) linea = { x: qx, y: qy, d };
        }
    }
    if (linea) return { p: [r2(linea.x), r2(linea.y)], pegado: 'pared' };
    return { p: [r2(x), r2(y)], pegado: null };
}

/** ¿Este toque CIERRA el contorno? Tocar el primer punto, con 3 o más ya puestos. */
export function cierraContorno(pts, p, radio) {
    return Array.isArray(pts) && pts.length >= 3
        && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= radio;
}

/**
 * Del lienzo del TELÉFONO al MUNDO (EPSG:25830). El teléfono pinta en el lienzo
 * del momento en que se abrió la sesión (`marco`), y el contorno se guarda en el
 * mundo: al recortar, el motor encuadra la casa y el lienzo cambia de origen.
 */
export function contornoAlMundo(pts, marco) {
    if (!marco || !Array.isArray(pts)) return null;
    return pts.map(([x, y]) => [r2(x + marco.dx), r2(marco.y0 - y)]);
}

/** Del mundo al lienzo del teléfono (lo contrario de `contornoAlMundo`). */
export function mundoAlContorno(pts, marco) {
    if (!marco || !Array.isArray(pts)) return null;
    return pts.map(([X, Y]) => [r2(X - marco.dx), r2(marco.y0 - Y)]);
}

function largoDe(m) {
    if (Number(m?.largo) > 0) return Number(m.largo);
    const s = m?.svg || [];
    let l = 0;
    for (let i = 1; i < s.length; i++) l += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    return l;
}

/**
 * Cuántas paredes de cada TIPO tiene la planta, y cuánto miden. Es lo que dice
 * si el contorno ha salido como se esperaba: en un adosado entre medianeras,
 * dos medianeras largas y dos fachadas.
 */
export function resumenParedes(muros) {
    const salida = TIPOS_PARED.map(t => ({ tipo: t.id, etiqueta: t.etiqueta, n: 0, largo: 0 }));
    for (const m of muros || []) {
        if (esFuera(m)) continue;
        const fila = salida.find(f => f.tipo === tipoDe(m));
        if (!fila) continue;
        fila.n += 1;
        fila.largo += largoDe(m);
    }
    return salida.map(f => ({ ...f, largo: r2(f.largo) }));
}

const NOMBRE_TIPO = {
    FACHADA: ['fachada', 'fachadas'],
    MEDIANERA: ['medianera', 'medianeras'],
    PARTICION_VERTICAL: ['partición a un local', 'particiones a un local'],
};
const coma = (v, d = 1) => (Number(v) || 0).toFixed(d).replace('.', ',');

/** «2 medianeras · 18,4 m»: el resumen en líneas, sin los tipos que no hay. */
export function lineasResumen(resumen) {
    return (resumen || []).filter(f => f.n > 0).map(f => {
        const [uno, varios] = NOMBRE_TIPO[f.tipo] || [f.tipo, f.tipo];
        return `${f.n} ${f.n === 1 ? uno : varios} · ${coma(f.largo)} m`;
    });
}

/**
 * Lo que se le pasa a `reclasifica` cuando desde el teléfono se dice contra qué
 * da una pared. Elegir lo mismo que dice Catastro es VOLVER a lo de Catastro
 * (`null`): así queda limpio, igual que en el panel del ordenador.
 * `undefined` si lo pedido no es ninguno de los tres tipos.
 */
export function contraParaReclasificar(m, contra) {
    if (!TIPOS_PARED.some(t => t.id === contra)) return undefined;
    return contra === tipoDe({ tipo: m?.tipo }) ? null : contra;
}

export default { pegarVerticeContorno, cierraContorno, contornoAlMundo, mundoAlContorno,
                 resumenParedes, lineasResumen, contraParaReclasificar, MAX_VERTICES };
