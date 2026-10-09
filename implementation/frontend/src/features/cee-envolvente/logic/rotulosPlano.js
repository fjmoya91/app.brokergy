// ─────────────────────────────────────────────────────────────────────────────
// Los RÓTULOS del plano 2D, colocados en UNA sola pasada para que no se pisen.
//
// Lo medido (26RES060_188, auditoría de los `<text>` del SVG a 1920, 1440 y
// 1280 px): «GARAJE · NO CUENTA» tapado por «PVBSO1» —en planta sola se leía
// «GARAJE · NO»—, los m² del porche encima de «FBN1», dos cotas casi iguales
// una encima de otra. La causa: cada capa colocaba lo suyo sin mirar a las
// demás. `colocarRotulos` solo evitaba choques ENTRE nombres de pared, y las
// etiquetas de las zonas, de los cuerpos, del croquis y las cotas iban a su
// sitio pasara lo que pasara — las de las zonas, al centro de la CAJA del
// polígono, que en una L cae encima de una pared.
//
// Aquí todos compiten por el mismo papel:
//  1. Cada rótulo trae CANDIDATOS (dónde podría ir y lo que cuesta cada sitio)
//     y un NIVEL. Primero lo FORZADO (la pared seleccionada, la entrada y la
//     cota de la seleccionada): se pinta siempre. Después lo que TIENE que
//     verse (zonas, cuerpos que no cuentan, croquis), luego las COTAS y al final
//     los NOMBRES de pared, de la más larga a la más corta.
//  2. Se colocan en ese orden: cada uno se queda con el candidato más barato
//     que no choque con lo ya puesto. Tapar el sitio PREFERIDO de los que aún
//     faltan cuenta como coste blando —así una etiqueta de zona deja libre el
//     centro de las paredes— y una etiqueta de zona paga además por tapar
//     muros, que es lo que se viene a mirar.
//  3. Lo que no cabe y no es imprescindible se ESCONDE, como antes.
//
// Es PURO —sin React ni DOM— y DETERMINISTA: los mismos datos dan los mismos
// rótulos, así que no bailan al mover el ratón (el plano se vuelve a pintar a
// cada movimiento, y por eso también tiene que ser barato).
// Pruebas: `node implementation/backend/scripts/test_rotulos_plano.mjs`.
//
// Todo en METROS del lienzo. `tam` es el cuerpo de letra del plano: sale del
// encuadre, así que es constante en PANTALLA, y todos los tamaños de aquí son
// múltiplos suyos.
// ─────────────────────────────────────────────────────────────────────────────

import { at, areaPoligono, caja, cota, fmt, largo } from './geometriaPlano.js';
import { ETIQUETA_USO_ZONA } from './zonasFuera.js';

//: El orden en que se colocan. Un nivel más bajo va antes y gana el sitio.
export const NIVEL = Object.freeze({ forzado: 0, imprescindible: 1, cota: 2, nombre: 3, pasajero: 4 });

//: Lo que ocupa cada carácter, en em, MEDIDO con Inter en el navegador
//: (`getBBox` de los textos del plano de 26RES060_188): mayúsculas en peso
//: 800-900 hasta 0,665; cifras en peso 600, ~0,56. Se redondea hacia arriba:
//: quedarse corto es lo que hace que dos rótulos «que no chocan» se toquen.
const EM = { mayus: 0.67, cifras: 0.57 };

//: El rótulo de una pared (papel de 1,32 em con la línea base a 0,96 em de su
//: borde de arriba): su centro queda 0,30 em por ENCIMA de la línea base. Y en
//: el sitio de siempre, el centro cae 0,05 em por debajo del medio del muro.
const PARED = { alto: 1.32, base: 0.30, bajada: 0.05 };

//: Aire entre dos rótulos, en múltiplos de `tam`.
const MARGEN = 0.1;
//: Lo que cuesta tapar el sitio preferido de uno que va DETRÁS, según su
//: nivel: una cota no se puede mover (o va en su sitio o no va), un nombre sí.
const PESO_BLANDO = { [NIVEL.imprescindible]: 3, [NIVEL.cota]: 1.5, [NIVEL.nombre]: 1 };
//: Lo que cuesta, por cada `tam` de muro, que una etiqueta de zona lo tape.
const PESO_PARED = 0.8;
//: Lo que cuesta un choque que ya no se puede evitar (solo para lo que se
//: pinta sí o sí): se elige el sitio donde se tape MENOS.
const PESO_CHOQUE = 10;

// ── cajas ────────────────────────────────────────────────────────────────────

/**
 * Una caja de rótulo: centro, ancho, alto y giro en grados (las cotas van
 * giradas con su pared; lo demás, derecho). Lleva ya su caja alineada a los
 * ejes, que es la que descarta de un vistazo casi todos los pares.
 *
 * Lo que el rótulo lleva de más (el texto, la cota, la escala) va aparte, en
 * `dato`: con todas las cajas de la MISMA forma, el motor de JS las compara
 * deprisa (mezclándolo con `...datos` la pasada tardaba el doble).
 */
export function cajaRotulo(cx, cy, ancho, alto, ang = 0, dato = {}) {
    const r = (ang * Math.PI) / 180;
    const cos = Math.cos(r), sin = Math.sin(r);
    const hw = ancho / 2, hh = alto / 2;
    const ex = Math.abs(cos) * hw + Math.abs(sin) * hh;
    const ey = Math.abs(sin) * hw + Math.abs(cos) * hh;
    return { cx, cy, ancho, alto, ang, cos, sin, hw, hh,
             x0: cx - ex, y0: cy - ey, x1: cx + ex, y1: cy + ey,
             coste: Number(dato.coste) || 0, dato };
}

const radio = (c, ax, ay) => c.hw * Math.abs(c.cos * ax + c.sin * ay)
                           + c.hh * Math.abs(-c.sin * ax + c.cos * ay);

/** ¿Se pisan? Con `margen` de aire. Dos cajas giradas, por ejes separadores. */
export function seCortan(a, b, margen = 0) {
    if (a.x1 + margen <= b.x0 || b.x1 + margen <= a.x0
        || a.y1 + margen <= b.y0 || b.y1 + margen <= a.y0) return false;
    if (!a.ang && !b.ang) return true;
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    for (const [ax, ay] of [[a.cos, a.sin], [-a.sin, a.cos], [b.cos, b.sin], [-b.sin, b.cos]]) {
        if (Math.abs(dx * ax + dy * ay) >= radio(a, ax, ay) + radio(b, ax, ay) + margen) return false;
    }
    return true;
}

//: Qué parte de la MENOR de las dos tapa la otra (0 a 1). Para los costes
//: blandos basta la caja alineada a los ejes.
function tapado(a, b) {
    const x = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const y = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (x <= 0 || y <= 0) return 0;
    const menor = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
    return menor > 0 ? Math.min(1, (x * y) / menor) : 0;
}

//: Lo que mide el trozo del segmento a→b que cae dentro de la caja (recorte
//: de Liang-Barsky contra su caja alineada a los ejes).
function dentroDeCaja(ax, ay, bx, by, c) {
    const dx = bx - ax, dy = by - ay;
    const p = [-dx, dx, -dy, dy];
    const q = [ax - c.x0, c.x1 - ax, ay - c.y0, c.y1 - ay];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) { if (q[i] < 0) return 0; continue; }
        const t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return 0; if (t > t0) t0 = t; }
        else { if (t < t0) return 0; if (t < t1) t1 = t; }
    }
    return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
}

function distanciaASegmento(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    return Math.hypot(ax + t * dx - x, ay + t * dy - y);
}

function distanciaAPolilinea(x, y, pts) {
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) {
        d = Math.min(d, distanciaASegmento(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    }
    return d;
}

/** Los tramos rectos de los muros, con su caja: es lo que una etiqueta de zona no debe tapar. */
export function segmentosDe(muros) {
    const s = [];
    for (const m of muros || []) {
        const p = m.svg || [];
        for (let i = 1; i < p.length; i++) {
            const [ax, ay] = p[i - 1], [bx, by] = p[i];
            s.push({ id: m.id, ax, ay, bx, by,
                     x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) });
        }
    }
    return s;
}

//: Una REJILLA de cajas: cada caja se apunta en las celdas que toca y una
//: consulta solo mira las de su zona. Sin ella, cada candidato se comparaba con
//: TODO lo puesto y con todo lo que falta, y un adosado sin delimitar (188
//: paredes) costaba ~17 ms por pasada — y la pasada se repite a cada
//: movimiento del ratón.
//:
//: Va con bucles a pelo y sin funciones de ida y vuelta: es lo que más se
//: ejecuta de todo el plano.
function rejilla(lado) {
    const celdas = new Map();
    let sello = 0;
    // Las celdas que toca un rectángulo, o null si viene roto (sin números).
    const rango = (x0, y0, x1, y1) => {
        const r = [Math.floor(x0 / lado), Math.floor(y0 / lado), Math.floor(x1 / lado), Math.floor(y1 / lado)];
        return r.every(Number.isFinite) ? r : null;
    };
    const clave = (i, k) => (i + 1e5) * 2e5 + (k + 1e5);
    return {
        meter(c, dato) {
            const r = rango(c.x0, c.y0, c.x1, c.y1);
            if (!r) return;
            for (let i = r[0]; i <= r[2]; i++) {
                for (let k = r[1]; k <= r[3]; k++) {
                    const l = celdas.get(clave(i, k));
                    if (l) l.push(dato); else celdas.set(clave(i, k), [dato]);
                }
            }
        },
        //: ¿Pisa `c` (con su aire) a alguna de las cajas apuntadas?
        //: Devuelve la caja con la que choca (o null). Quien llama la prueba
        //: PRIMERO con el siguiente candidato: los sitios de un mismo rótulo
        //: suelen chocar con lo mismo, y así casi nunca hace falta recorrer.
        corta(c, margen, sospechosa = null) {
            if (sospechosa && seCortan(c, sospechosa, margen)) return sospechosa;
            const r = rango(c.x0 - margen, c.y0 - margen, c.x1 + margen, c.y1 + margen);
            if (!r) return null;
            sello += 1;
            for (let i = r[0]; i <= r[2]; i++) {
                for (let k = r[1]; k <= r[3]; k++) {
                    const l = celdas.get(clave(i, k));
                    if (!l) continue;
                    for (const d of l) {
                        if (d.visto === sello) continue;
                        d.visto = sello;
                        if (seCortan(c, d.c, margen)) return d.c;
                    }
                }
            }
            return null;
        },
        //: Lo que cuesta tapar los sitios preferidos de los que van DETRÁS de
        //: `i`. Para en cuanto pasa de `tope`: ya no puede ganar.
        blando(c, i, base, tope) {
            const r = rango(c.x0, c.y0, c.x1, c.y1);
            if (!r) return base;
            sello += 1;
            let total = base;
            for (let a = r[0]; a <= r[2]; a++) {
                for (let k = r[1]; k <= r[3]; k++) {
                    const l = celdas.get(clave(a, k));
                    if (!l) continue;
                    for (const d of l) {
                        if (d.visto === sello) continue;
                        d.visto = sello;
                        if (d.j > i) total += d.w * tapado(c, d.c);
                        if (total >= tope) return total;
                    }
                }
            }
            return total;
        },
        //: ¿Hay algún muro que no sea `propia` a menos de `r` de (x, y)?
        hayOtroMasCerca(x, y, r, propia) {
            const q = rango(x - r, y - r, x + r, y + r);
            if (!q) return false;
            sello += 1;
            for (let i = q[0]; i <= q[2]; i++) {
                for (let k = q[1]; k <= q[3]; k++) {
                    const l = celdas.get(clave(i, k));
                    if (!l) continue;
                    for (const d of l) {
                        if (d.visto === sello) continue;
                        d.visto = sello;
                        const s = d.s;
                        if (s.id !== propia && distanciaASegmento(x, y, s.ax, s.ay, s.bx, s.by) < r) return true;
                    }
                }
            }
            return false;
        },
        //: Cuántos metros de muro (que no sea `propia`) caen dentro de `c`.
        paredes(c, propia) {
            const r = rango(c.x0, c.y0, c.x1, c.y1);
            if (!r) return 0;
            sello += 1;
            let L = 0;
            for (let i = r[0]; i <= r[2]; i++) {
                for (let k = r[1]; k <= r[3]; k++) {
                    const l = celdas.get(clave(i, k));
                    if (!l) continue;
                    for (const d of l) {
                        if (d.visto === sello) continue;
                        d.visto = sello;
                        const s = d.s;
                        if (s.id !== propia) L += dentroDeCaja(s.ax, s.ay, s.bx, s.by, c);
                    }
                }
            }
            return L;
        },
    };
}

// ── la pasada ────────────────────────────────────────────────────────────────

/**
 * Coloca los rótulos. `items`: `{ id, nivel, peso, candidatos, evitaParedes,
 * propia }`, con los candidatos hechos con `cajaRotulo` (y su `coste`).
 * Devuelve un `Map` id → candidato elegido; lo que no cabe no está.
 *
 * Dentro de un nivel va antes el de más `peso` (la pared más larga). Lo de los
 * niveles `cota` y `nombre` que no cabe se esconde; lo demás se pinta siempre,
 * donde tape menos.
 */
export function colocar(items, { tam = 1, segmentos = [] } = {}) {
    const margen = tam * MARGEN;
    const porCoste = (l) => {
        for (let i = 1; i < l.length; i++) if (l[i].coste < l[i - 1].coste) return [...l].sort((a, b) => a.coste - b.coste);
        return l;
    };
    const orden = (items || [])
        .filter(it => it && it.candidatos && it.candidatos.length)
        .map(it => ({ ...it, candidatos: porCoste(it.candidatos) }))
        .sort((a, b) => a.nivel - b.nivel || (b.peso || 0) - (a.peso || 0)
                        || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    const lado = Math.max(tam * 3, 1e-6);
    // Lo ya puesto; el sitio PREFERIDO de cada uno (para el coste blando de
    // taparlo antes de que le toque); y los muros.
    const puestos = rejilla(lado);
    const lista = [];
    const preferidos = rejilla(lado);
    orden.forEach((it, j) => {
        const w = PESO_BLANDO[it.nivel];
        if (w) preferidos.meter(it.candidatos[0], { c: it.candidatos[0], j, w });
    });
    const muros = rejilla(lado);
    for (const s of segmentos) muros.meter(s, { s });
    const salida = new Map();

    for (let i = 0; i < orden.length; i++) {
        const it = orden[i];
        let mejor = null;
        let estorbo = null;
        for (const c of it.candidatos) {
            // Van por coste y lo blando solo suma: a partir de aquí ninguno mejora.
            if (mejor && c.coste >= mejor.total) break;
            const choca = puestos.corta(c, margen, estorbo);
            if (choca) { estorbo = choca; continue; }
            // Un nombre SUELTO (fuera de su muro) tiene que seguir siendo de
            // SU muro: si hay otro más cerca, se leería como el nombre de ése.
            // Mejor esconderlo que ponerlo donde engaña.
            if (c.dato.suelto && it.trazo) {
                const propio = distanciaAPolilinea(c.cx, c.cy, it.trazo);
                if (muros.hayOtroMasCerca(c.cx, c.cy, propio * 0.9, it.propia)) continue;
            }
            let total = c.coste;
            if (it.evitaParedes) total += (muros.paredes(c, it.propia) / tam) * PESO_PARED;
            total = preferidos.blando(c, i, total, mejor ? mejor.total : Infinity);
            if (!mejor || total < mejor.total) mejor = { c, total };
        }
        if (!mejor) {
            // No cabe sin pisar a nadie. Una cota o un nombre se esconden; lo
            // forzado y lo imprescindible van donde tapen MENOS.
            if (it.nivel === NIVEL.cota || it.nivel === NIVEL.nombre) continue;
            for (const c of it.candidatos) {
                const total = c.coste + PESO_CHOQUE * lista.reduce((s, p) => s + tapado(c, p), 0);
                if (!mejor || total < mejor.total) mejor = { c, total };
            }
        }
        puestos.meter(mejor.c, { c: mejor.c });
        lista.push(mejor.c);
        salida.set(it.id, mejor.c);
    }
    return salida;
}

// ── los nombres de las paredes ───────────────────────────────────────────────

//: Lo que ocupa un rótulo de pared, en unidades del plano (metros).
//:
//: En un SVG no se puede medir el texto sin pintarlo, así que se estima por
//: caracteres: ~0,62 em en mayúsculas y peso 800. El SUELO de 3,4 em es el ancho
//: fijo que tenía antes, para que un `FBN1` de siempre se siga viendo igual.
export function anchoRotulo(texto, tam) {
    return Math.max(tam * 3.4, tam * (0.62 * String(texto || '').length + 0.7));
}

/**
 * Dónde puede ir el nombre de una pared: en su MEDIO (el sitio de siempre),
 * corrido A LO LARGO de ella y, si ahí no cabe, A UN LADO —pegado, un poco
 * corrido o un renglón más allá—, primero hacia dentro del edificio (fuera
 * están las cotas). Siempre derecho. Una pared corta encajonada entre otras
 * (el tabique del fondo de un almacén) solo tiene sitio a un lado: sin esos
 * candidatos se escondía.
 */
export function rotuloDePared(m, { texto, tam, hacia = null }) {
    const pts = m.svg || [];
    const L = largo(pts);
    const papel = anchoRotulo(texto, tam);
    // Para chocar, lo que ocupa de verdad: el texto largo se sale del papel.
    const ancho = Math.max(papel, tam * (EM.mayus * String(texto).length + 0.2));
    const alto = tam * PARED.alto;
    const candidatos = [];
    // `suelto`: fuera del muro. Solo vale si sigue siendo el muro más cercano.
    const en = (x, y, coste, suelto = true) => candidatos.push(
        cajaRotulo(x, y + tam * PARED.bajada, ancho, alto, 0, { coste, papel, suelto }));
    for (const [t, coste] of [[0.5, 0], [0.35, 0.6], [0.65, 0.6], [0.2, 1.2], [0.8, 1.2]]) {
        const p = at(pts, L * t);
        en(p.x, p.y, coste, false);
    }
    const mid = at(pts, L / 2);
    const r = (mid.ang * Math.PI) / 180;
    const ux = Math.cos(r), uy = Math.sin(r);
    const nx = -uy, ny = ux;
    // Lo que ocupa la caja (derecha) medida a lo ancho de la pared y a lo largo.
    const deLado = (Math.abs(nx) * ancho + Math.abs(ny) * alto) / 2;
    const aLoLargo = (Math.abs(ux) * ancho + Math.abs(uy) * alto) / 2;
    const d = deLado + tam * 0.3;
    const dentro = hacia && ((hacia[0] - mid.x) * nx + (hacia[1] - mid.y) * ny) < 0 ? -1 : 1;
    const lejos = d + deLado * 1.2;
    for (const [s, extra] of [[dentro, 0], [-dentro, 0.2]]) en(mid.x + s * nx * d, mid.y + s * ny * d, 1.6 + extra);
    for (const [s, extra] of [[dentro, 0], [-dentro, 0.2]]) {
        for (const a of [-1, 1]) {
            en(mid.x + s * nx * d + a * ux * aLoLargo, mid.y + s * ny * d + a * uy * aLoLargo, 2.0 + extra);
        }
    }
    for (const [s, extra] of [[dentro, 0], [-dentro, 0.2]]) en(mid.x + s * nx * lejos, mid.y + s * ny * lejos, 2.4 + extra);
    // Y como último recurso, una corona alrededor del medio, a renglones y
    // medios anchos: en un rincón con tres paredes cortas y una etiqueta de
    // zona (el almacén de 26RES060_188), el nombre que antes se veía montado a
    // medias sobre el del vecino se escondía.
    for (const [i, k] of [[0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
                          [0, -2], [0, 2], [-1, -2], [1, -2], [-1, 2], [1, 2]]) {
        en(mid.x + i * ancho * 0.55, mid.y + k * alto * 1.15, 2.8 + 0.4 * Math.hypot(i, k));
    }
    return { candidatos, trazo: pts, propia: m.id };
}

// ── las cotas ────────────────────────────────────────────────────────────────

//: La caja del texto de una cota (0,8 em, peso 600) con su papel, en las
//: coordenadas de la cota: el centro va 0,29 em por encima de la línea base.
function cajaDeCota(c, tam, coste, dato = { cota: c }) {
    const n = String(c.texto).length;
    const fs = tam * 0.8;
    const ancho = Math.max(n * 0.5 * fs + tam * 0.24, n * EM.cifras * fs + tam * 0.1);
    const r = (c.en.rot * Math.PI) / 180;
    const sube = tam * 0.29;
    return cajaRotulo(c.en.x + sube * Math.sin(r), c.en.y - sube * Math.cos(r),
                      ancho, tam * 1.0, c.en.rot, { ...dato, coste });
}

//: Dos cotas DICEN LO MISMO si son de paredes paralelas, casi iguales y sus
//: cifras caen una sobre otra (dos paredes pegadas, cada una con su cota):
//: 3,51 y 3,50 a un palmo no aportan nada y se tapan.
function dicenLoMismo(a, b, tam) {
    const ca = a.candidatos[0], cb = b.candidatos[0];
    // Lo barato primero: casi todos los pares están lejos.
    const cerca = tam * 1.6;
    if (ca.x1 + cerca < cb.x0 || cb.x1 + cerca < ca.x0 || ca.y1 + cerca < cb.y0 || cb.y1 + cerca < ca.y0) return false;
    const giro = Math.abs(((ca.ang - cb.ang) % 180 + 180) % 180);
    if (Math.min(giro, 180 - giro) > 4) return false;
    const La = ca.dato.cota.largo, Lb = cb.dato.cota.largo;
    if (Math.abs(La - Lb) > Math.max(0.1, 0.03 * Math.max(La, Lb))) return false;
    const dx = cb.cx - ca.cx, dy = cb.cy - ca.cy;
    const aLoLargo = Math.abs(dx * ca.cos + dy * ca.sin);
    const deLado = Math.abs(-dx * ca.sin + dy * ca.cos);
    return aLoLargo < (ca.ancho + cb.ancho) / 2 && deLado < tam * 1.6;
}

/**
 * Las cotas que se dibujan, con el MISMO criterio que antes (solo muros
 * rectos, ni lo apartado ni lo interior, de 2 m para arriba, y con el entorno
 * a la vista solo la de la seleccionada) y dos sitios: el suyo y uno más
 * afuera, escalonada como en un plano de obra. La de la seleccionada es
 * forzada; de dos que dicen lo mismo se queda una.
 */
export function cotasDelPlano(muros, { sel = null, hacia, tam, interior = () => false,
                                       entorno = false, fuera = () => false }) {
    const items = [];
    for (const m of muros || []) {
        if ((m.svg || []).length !== 2) continue;
        // Lo APARTADO no se acota: su medida no va a ninguna parte.
        if (m.id !== sel && fuera(m)) continue;
        if (m.id !== sel && (entorno || interior(m) || largo(m.svg) < 2)) continue;
        const apartar = interior(m) ? 0.95 : 1.35;
        const c0 = cota(m.svg, { hacia, apartar });
        if (!c0) continue;
        // La ESCALONADA es la misma cota corrida hacia fuera; se compone entera
        // solo si gana (la pasada se repite a cada movimiento del ratón).
        const [p, q] = [m.svg[0], m.svg[1]];
        const ox = c0.en.x - (p[0] + q[0]) / 2, oy = c0.en.y - (p[1] + q[1]) / 2;
        const lo = Math.hypot(ox, oy) || 1;
        const paso = tam * 1.3;
        const escalon = { ...c0, en: { x: c0.en.x + (ox / lo) * paso, y: c0.en.y + (oy / lo) * paso,
                                       rot: c0.en.rot } };
        const c1 = cajaDeCota(escalon, tam, 1.0,
                              { rehacer: () => cota(m.svg, { hacia, apartar: apartar + paso }) });
        items.push({
            id: `c:${m.id}`, muro: m.id,
            nivel: m.id === sel ? NIVEL.forzado : NIVEL.cota,
            peso: c0.largo,
            candidatos: [cajaDeCota(c0, tam, 0), c1],
        });
    }
    items.sort((a, b) => a.nivel - b.nivel || b.peso - a.peso || (a.id < b.id ? -1 : 1));
    const quedan = [];
    for (const it of items) {
        if (it.nivel !== NIVEL.forzado && quedan.some(q => dicenLoMismo(q, it, tam))) continue;
        quedan.push(it);
    }
    return quedan;
}

// ── las etiquetas de las manchas (zonas, cuerpos, croquis) ───────────────────

//: Lo que ocupa una `EtiquetaMancha` (papel, título, raya y m² debajo). La
//: fórmula es la del componente, que la lee de aquí: si fueran dos, el plano
//: reservaría un sitio y la etiqueta pintaría otro.
export function medidaMancha({ titulo, sub = null, tam, escala = 1 }) {
    const f1 = tam * 0.95 * escala;
    const f2 = tam * 0.72 * escala;
    const ancho = Math.max(String(titulo).length * 0.64 * f1,
                           sub ? String(sub).length * 0.58 * f2 : 0) + tam * 0.9 * escala;
    const alto = (sub ? tam * 2.35 : tam * 1.55) * escala;
    return { ancho, alto, f1, f2 };
}

/** Distancia de (x, y) al borde del polígono: POSITIVA dentro, negativa fuera. */
export function distanciaAlBorde(x, y, pol) {
    let dentro = false;
    let d2 = Infinity;
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
        const [ax, ay] = pol[i], [bx, by] = pol[j];
        if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) dentro = !dentro;
        const dx = bx - ax, dy = by - ay;
        const L2 = dx * dx + dy * dy;
        let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = ax + t * dx - x, ey = ay + t * dy - y;
        d2 = Math.min(d2, ex * ex + ey * ey);
    }
    return (dentro ? 1 : -1) * Math.sqrt(d2);
}

/**
 * El POLO DE INACCESIBILIDAD: el punto de dentro más alejado del borde (el
 * centro del mayor círculo que cabe). En un polígono en L el centro de la caja
 * cae en el codo —o fuera—, y el de masas, pegado a la esquina de dentro; éste
 * cae en el brazo más ancho, que es donde una etiqueta se lee. Es el algoritmo
 * de celdas de `polylabel` (Mapbox), con un tope de vueltas para que sea
 * barato siempre.
 */
export function poloInaccesible(pol, precision = 0.1) {
    const c = caja(pol, 0);
    const lado = Math.min(c.ancho, c.alto);
    const celda = (x, y, h) => {
        const d = distanciaAlBorde(x, y, pol);
        return { x, y, h, d, max: d + h * Math.SQRT2 };
    };
    let mejor = celda(c.x + c.ancho / 2, c.y + c.alto / 2, 0);
    if (!(lado > 0)) return { x: mejor.x, y: mejor.y, d: 0 };
    // El centro de masas suele ser un buen arranque (y en un polígono convexo,
    // casi la respuesta).
    let A = 0, gx = 0, gy = 0;
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
        const f = pol[j][0] * pol[i][1] - pol[i][0] * pol[j][1];
        A += f; gx += (pol[j][0] + pol[i][0]) * f; gy += (pol[j][1] + pol[i][1]) * f;
    }
    if (A) { const g = celda(gx / (3 * A), gy / (3 * A), 0); if (g.d > mejor.d) mejor = g; }

    const h0 = lado / 2;
    const cola = [];
    for (let x = c.x; x < c.x + c.ancho; x += lado) {
        for (let y = c.y; y < c.y + c.alto; y += lado) cola.push(celda(x + h0, y + h0, h0));
    }
    for (let vueltas = 0; cola.length && vueltas < 1500; vueltas++) {
        let k = 0;
        for (let i = 1; i < cola.length; i++) if (cola[i].max > cola[k].max) k = i;
        const cel = cola[k];
        cola[k] = cola[cola.length - 1];
        cola.pop();
        if (cel.d > mejor.d) mejor = cel;
        if (cel.max - mejor.d <= precision) continue;
        const h = cel.h / 2;
        cola.push(celda(cel.x - h, cel.y - h, h), celda(cel.x + h, cel.y - h, h),
                  celda(cel.x - h, cel.y + h, h), celda(cel.x + h, cel.y + h, h));
    }
    return { x: mejor.x, y: mejor.y, d: Math.max(0, mejor.d) };
}

//: Puntos de dentro donde puede ir la etiqueta: el polo primero y después los
//: más holgados de una rejilla, separados entre sí para que sean ALTERNATIVAS
//: de verdad y no el mismo sitio corrido un palmo.
function puntosInteriores(pol, tam, max = 8) {
    const polo = poloInaccesible(pol, Math.max(tam * 0.2, 0.02));
    const c = caja(pol, 0);
    const paso = Math.max(tam * 0.6, Math.max(c.ancho, c.alto) / 10);
    const muestras = [];
    for (let x = c.x + paso / 2; x < c.x + c.ancho; x += paso) {
        for (let y = c.y + paso / 2; y < c.y + c.alto; y += paso) {
            const d = distanciaAlBorde(x, y, pol);
            if (d > 0) muestras.push({ x, y, d });
        }
    }
    muestras.sort((a, b) => b.d - a.d || a.x - b.x || a.y - b.y);
    const sep = Math.max(paso * 1.5, tam * 1.5);
    const puntos = [polo];
    for (const p of muestras) {
        if (puntos.length >= max) break;
        if (puntos.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= sep)) puntos.push(p);
    }
    return puntos;
}

//: Qué parte de la caja se sale del polígono (por muestreo, 5 × 3 puntos).
function fraccionFuera(c, pol) {
    let fuera = 0;
    for (let i = 0; i < 5; i++) {
        for (let k = 0; k < 3; k++) {
            const x = c.x0 + ((i + 0.5) / 5) * (c.x1 - c.x0);
            const y = c.y0 + ((k + 0.5) / 3) * (c.y1 - c.y0);
            if (distanciaAlBorde(x, y, pol) < 0) fuera++;
        }
    }
    return fuera / 15;
}

/**
 * La etiqueta de una MANCHA (zona, cuerpo o croquis): dentro del polígono y en
 * el sitio más holgado. `variantes` son las formas de decirlo, de la entera a
 * la COMPACTA, cada una con su `ancho`, `alto` y `coste`; lo que traigan de
 * más (el texto, la escala) viaja con el candidato elegido. Paga por salirse
 * del polígono y, en la pasada, por tapar muros.
 */
export function rotuloEnPoligono(pol, variantes, tam) {
    if (!pol || pol.length < 3) return { candidatos: [] };
    const puntos = puntosInteriores(pol, tam);
    const dmax = Math.max(...puntos.map(p => p.d), 1e-9);
    const candidatos = [];
    for (const v of variantes) {
        for (const p of puntos) {
            const c = cajaRotulo(p.x, p.y, v.ancho, v.alto, 0, v);
            // Salirse de su mancha es lo peor: la etiqueta deja de decir de cuál
            // es y se monta en los muros del borde. Por eso pesa más que pasar a
            // la versión compacta.
            c.coste = (v.coste || 0) + 1.2 * (1 - p.d / dmax) + 10 * fraccionFuera(c, pol);
            candidatos.push(c);
        }
    }
    return { candidatos, evitaParedes: true };
}

// ── el plano entero ──────────────────────────────────────────────────────────

//: El uso de la zona dicho en una palabra, para la etiqueta COMPACTA.
const USO_CORTO = { 'ESPACIO NO HABITABLE': 'NO HABITABLE', PORCHE: 'PORCHE' };

const contornoMayor = (contornos) => (contornos || [])
    .filter(p => p && p.length >= 3)
    .reduce((m, p) => (!m || areaPoligono(p) > areaPoligono(m) ? p : m), null);

/**
 * Todos los rótulos de UNA planta en 2D, en una sola pasada.
 *
 * Recibe lo que se va a pintar —quien llama decide qué entra: en modo entorno
 * solo los nombres forzados; mientras se pinta un croquis, las zonas sin
 * rótulo; mientras se dibuja una pared, sin cuerpos— y devuelve dónde va cada
 * cosa:
 *  - `paredes`: `[{ id, texto, x, y (línea base), ancho (papel), destacado }]`
 *  - `cotas`:   `[{ id, c }]`, con `c` el resultado de `cota()` en su sitio
 *  - `zonas`:   `Map(índice → { cx, cy, titulo, sub, escala })`
 *  - `croquis`: `Map(índice → { cx, cy, titulo, sub, escala })`
 *  - `cuerpos`: `Map(id → { x, y (línea base), fs, texto })`
 *
 * `equipos` (`[{ id, caja: {x0,y0,x1,y1} }]`, ver `marcasDelPlano` en
 * `equiposPlano.js`) son obstáculos FIJOS: se colocan los primeros y no salen.
 *
 * `memoria` (opcional) es un objeto que guarda quien llama —un `useRef`—: si
 * nada de lo que cuenta para los rótulos ha cambiado desde la última vez, se
 * devuelve lo mismo sin recalcular. El plano se repinta a cada movimiento del
 * ratón (el globo, el cursor) y los rótulos no se mueven por eso.
 */
export function colocarRotulosPlano(datos, memoria = null) {
    const firma = firmaDe(datos);
    if (memoria && memoria.firma && mismaFirma(memoria.firma, firma)) return memoria.salida;
    const salida = calcularRotulosPlano(datos);
    if (memoria) { memoria.firma = firma; memoria.salida = salida; }
    return salida;
}

//: Lo que decide los rótulos, en una lista plana que se compara elemento a
//: elemento (por IDENTIDAD los objetos: el trazo de cada muro, las listas de
//: zonas, cuerpos y croquis). Un nombre cambiado, una pared movida o apartada,
//: otra selección o otro encuadre la cambian; pasar el ratón por encima, no.
function firmaDe({ muros = [], sel = null, entrada = null, tam, entorno = false, nombreDe = m => m.id,
                   hacia = null, interior = () => false, fuera = () => false, zonas = [], cuerpos = [],
                   cuerpoSobre = null, croquis = [], equipos = [] }) {
    // Una lista VACÍA vale lo mismo venga de donde venga (un `= []` por
    // defecto es otra lista en cada render).
    const lista = l => (l && l.length ? l : 0);
    // Los equipos llegan recalculados en cada render: cuentan por DÓNDE están.
    const eq = (equipos || []).map(e => `${e.id}:${e.caja.x0},${e.caja.y0},${e.caja.x1},${e.caja.y1}`).join('|');
    const f = [tam, entorno, sel, entrada, hacia?.[0], hacia?.[1], lista(zonas), lista(cuerpos), cuerpoSobre,
               lista(croquis), eq, muros.length];
    for (const m of muros) {
        f.push(m.id, m.svg, nombreDe ? nombreDe(m) : m.id, !!m.cambia, m.largo, !!fuera(m), !!interior(m));
    }
    return f;
}

function mismaFirma(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function calcularRotulosPlano({ muros = [], sel = null, entrada = null, tam, entorno = false,
                                nombreDe = m => m.id, hacia = null, interior = () => false,
                                fuera = () => false, zonas = [], cuerpos = [], cuerpoSobre = null,
                                croquis = [], equipos = [] }) {
    const items = [];

    // Los ICONOS de los equipos (caldera, máquina nueva, ACS, unidad exterior),
    // con su rótulo: no se mueven —están donde los puso una persona—, así que
    // entran los PRIMEROS y como obstáculo fijo, y los nombres y las cotas se
    // apartan o se esconden. No salen en la respuesta: los pinta `MarcasEquipos`.
    // Sin esto, «FBSO3» quedaba debajo de «Nuevo» (revisión de diseño, 09/10/2026).
    for (const e of equipos || []) {
        const c = e?.caja;
        if (!c) continue;
        items.push({ id: `e:${e.id}`, clase: 'equipo', nivel: NIVEL.forzado, peso: 3e9,
                     candidatos: [cajaRotulo((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2,
                                             c.x1 - c.x0, c.y1 - c.y0)] });
    }

    for (const m of muros) {
        const forzado = m.id === sel || m.id === entrada;
        if (entorno && !forzado) continue;
        const texto = (nombreDe ? nombreDe(m) : m.id) + (m.cambia ? ' · CAMBIA' : '');
        items.push({
            ...rotuloDePared(m, { texto, tam, hacia }),
            id: `p:${m.id}`, clase: 'pared', muro: m.id, texto, forzado,
            nivel: forzado ? NIVEL.forzado : NIVEL.nombre,
            // La seleccionada antes que la entrada; las demás, de la más larga.
            peso: m.id === sel ? 2e9 : m.id === entrada ? 1e9 : (m.largo || largo(m.svg)),
        });
    }

    for (const it of cotasDelPlano(muros, { sel, hacia, tam, interior, entorno, fuera })) {
        items.push({ ...it, clase: 'cota' });
    }

    (zonas || []).forEach((z, i) => {
        if (!(z?.lienzo?.length >= 3)) return;
        const uso = (ETIQUETA_USO_ZONA[z.uso] || 'No habitable').toUpperCase();
        const corto = USO_CORTO[z.uso] || uso;
        const sub = `${fmt(z.area_real ?? z.area_m2 ?? 0)} m²`;
        // La entera; la COMPACTA (solo el uso, sin «NO CUENTA»: lo dicen ya el
        // gris, los trazos y la leyenda); y la compacta más pequeña.
        const variantes = [
            { titulo: `${uso} · NO CUENTA`, sub, escala: 0.85, coste: 0 },
            { titulo: corto, sub, escala: 0.85, coste: 2.5 },
            { titulo: corto, sub, escala: 0.68, coste: 4 },
        ].map(v => ({ ...v, ...medidaMancha({ ...v, tam }) }));
        items.push({ ...rotuloEnPoligono(z.lienzo, variantes, tam), id: `z:${z.indice ?? i}`,
                     clase: 'zona', clave: z.indice ?? i, nivel: NIVEL.imprescindible,
                     // La mancha más pequeña, antes: es la que menos sitios tiene.
                     peso: -Math.abs(areaPoligono(z.lienzo)) });
    });

    (croquis || []).forEach((t, i) => {
        if (!(t?.pts?.length >= 3)) return;
        const titulo = (ETIQUETA_USO_ZONA[t.uso] || 'No habitable').toUpperCase();
        const sub = `≈${Math.round(areaPoligono(t.pts))} m²`;
        const variantes = [
            { titulo, sub, escala: 1, coste: 0 },
            { titulo, sub, escala: 0.8, coste: 2 },
            { titulo, sub, escala: 0.65, coste: 3.5 },
        ].map(v => ({ ...v, ...medidaMancha({ ...v, tam }) }));
        items.push({ ...rotuloEnPoligono(t.pts, variantes, tam), id: `k:${i}`, clase: 'croquis',
                     clave: i, nivel: NIVEL.imprescindible, peso: -Math.abs(areaPoligono(t.pts)) });
    });

    for (const c of cuerpos || []) {
        const fueraAqui = !!c.fueraAqui;
        const activo = cuerpoSobre === c.id;
        if (!fueraAqui && !activo) continue;
        const pol = contornoMayor(c.contornos);
        if (!pol) continue;
        const texto = fueraAqui ? 'NO CUENTA'
            : `${c.construccion?.uso || 'CUERPO'} · ${fmt(c.superficie)} m²`;
        // Texto suelto, sin papel: de la línea base hacia arriba ~0,98 em y
        // hacia abajo ~0,26 em.
        const variantes = [0.85, 0.7].map((k, n) => {
            const fs = tam * k;
            return { texto, fs, coste: n * 2, ancho: texto.length * EM.mayus * fs, alto: fs * 1.24 };
        });
        items.push({ ...rotuloEnPoligono(pol, variantes, tam), id: `b:${c.id}`, clase: 'cuerpo',
                     clave: c.id,
                     // El de pasar el ratón se pone el ÚLTIMO: es momentáneo y
                     // no puede mover a los demás cada vez que el ratón cruza.
                     nivel: fueraAqui ? NIVEL.imprescindible : NIVEL.pasajero,
                     peso: -Math.abs(areaPoligono(pol)) });
    }

    const puestos = colocar(items, { tam, segmentos: segmentosDe(muros) });

    const salida = { paredes: [], cotas: [], zonas: new Map(), croquis: new Map(), cuerpos: new Map() };
    for (const it of items) {
        const c = puestos.get(it.id);
        if (!c) continue;
        if (it.clase === 'pared') {
            salida.paredes.push({ id: it.muro, texto: it.texto, x: c.cx, y: c.cy + tam * PARED.base,
                                  ancho: c.dato.papel, destacado: it.forzado });
        } else if (it.clase === 'cota') {
            salida.cotas.push({ id: it.muro, c: c.dato.cota || c.dato.rehacer() });
        } else if (it.clase === 'zona' || it.clase === 'croquis') {
            (it.clase === 'zona' ? salida.zonas : salida.croquis).set(it.clave,
                { cx: c.cx, cy: c.cy, titulo: c.dato.titulo, sub: c.dato.sub, escala: c.dato.escala });
        } else if (it.clase === 'cuerpo') {
            salida.cuerpos.set(it.clave, { x: c.cx, y: c.cy + c.dato.fs * 0.36, fs: c.dato.fs,
                                           texto: c.dato.texto });
        }
    }
    return salida;
}

export default { colocar, colocarRotulosPlano, cotasDelPlano, rotuloDePared, rotuloEnPoligono,
                 anchoRotulo, medidaMancha, poloInaccesible, distanciaAlBorde, cajaRotulo, seCortan,
                 segmentosDe, NIVEL };
