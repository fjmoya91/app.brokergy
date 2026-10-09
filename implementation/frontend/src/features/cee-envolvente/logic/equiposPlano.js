// ============================================================================
// Los EQUIPOS en el plano: dónde está la caldera que se retira, dónde va la
// máquina nueva, el depósito de ACS y la unidad exterior — y, si la unidad
// exterior va en el tejado, el PLANO DE CUBIERTA donde se marca.
//
// POR QUÉ (2026-10-09, lo pidió Fran): el croquis de la envolvente ya dice qué
// es cada pared y dónde está cada hueco, pero no dónde está la instalación, que
// es lo primero que pregunta quien va a la obra (el instalador, el técnico que
// visita, una auditoría). Se marca con un ICONO sobre el plano de su planta.
//
// REGLAS
//   · Un equipo de cada TIPO: poner otra vez el mismo tipo lo CAMBIA de sitio
//     (es «dónde está», no un inventario). Quitarlo es decirlo.
//   · Se guarda en el MUNDO (EPSG:25830), como las zonas y el contorno del
//     adosado: el motor re-encuadra el lienzo al volver a medir, y un punto en
//     coordenadas del lienzo acabaría en otro sitio del edificio.
//   · La planta se guarda por NIVEL (0, 1, -1…), no por el id de la planta, y
//     la cubierta es el nivel `'cubierta'`: lo que se ve desde arriba.
//   · NO va al `.cex`: CE3X no coloca los equipos. Es del plano y del croquis.
//   · Puro y sin React: lo usan la ventana de la envolvente y el PDF del croquis
//     (`services/cee/croquisCee.js`), y se prueba en Node
//     (`backend/scripts/test_equipos_plano.mjs`).
// ============================================================================

export const NIVEL_CUBIERTA = 'cubierta';

/**
 * Los tipos, en el orden en que se ofrecen. `color` es el de la PANTALLA: un
 * token de tema (`--equipo-*` en `index.css`, más oscuro en el tema claro) que
 * vale para el cuadrado del icono —blanco encima, ≥ 3:1— y para su rótulo sobre
 * el papel del plano —≥ 4,5:1—. Con `--success` el «Nuevo» se quedaba en 2,0:1
 * en claro (revisión de diseño, 09/10/2026). `colorPdf`, el del papel: los
 * mismos que el tema claro.
 */
export const TIPOS_EQUIPO = [
    {
        id: 'caldera_actual', etiqueta: 'Caldera actual', corta: 'Caldera',
        rotulo: 'CALDERA ACTUAL',
        ayuda: 'dónde está HOY la caldera que se va a retirar',
        color: 'var(--equipo-caldera, #FF5252)', colorPdf: '#C8373B',
    },
    {
        id: 'equipo_nuevo', etiqueta: 'Equipo nuevo', corta: 'Nuevo',
        rotulo: 'EQUIPO NUEVO',
        ayuda: 'dónde va la máquina nueva: la unidad interior (hidrokit) de la aerotermia o la caldera nueva',
        color: 'var(--equipo-nuevo, #00A043)', colorPdf: '#1E7A46',
    },
    {
        id: 'acs', etiqueta: 'Depósito de ACS', corta: 'ACS',
        rotulo: 'DEPÓSITO ACS',
        ayuda: 'dónde va el acumulador de agua caliente o la unidad interior de ACS',
        color: 'var(--equipo-acs, #0891B2)', colorPdf: '#0E7490',
    },
    {
        id: 'ud_exterior', etiqueta: 'Unidad exterior', corta: 'Ud. ext.',
        rotulo: 'UD. EXTERIOR',
        ayuda: 'dónde va la unidad exterior: en el patio, colgada de la fachada o en la cubierta',
        color: 'var(--equipo-exterior, #8B5CF6)', colorPdf: '#6D28D9',
    },
];

const POR_ID = new Map(TIPOS_EQUIPO.map(t => [t.id, t]));
export const tipoEquipo = (id) => POR_ID.get(id) || null;

/**
 * El ICONO de cada tipo, en una caja de 24 × 24, en trazos BLANCOS sobre el
 * cuadrado de su color. Son cadenas de SVG para que el PDF las use tal cual; la
 * pantalla las pinta con las mismas `d` (ver `trazosIcono`).
 *   · caldera actual: el cuerpo de la caldera con la LLAMA (quema algo);
 *   · equipo nuevo: el mismo cuerpo con el RAYO (es eléctrico: aerotermia);
 *   · ACS: el acumulador con la GOTA;
 *   · unidad exterior: la caja con el VENTILADOR y la rejilla.
 */
const ICONOS = {
    caldera_actual: [
        { d: 'M7.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v12.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 17.5V5a1.5 1.5 0 0 1 1.5-1.5z', trazo: 1.6 },
        { d: 'M10 19v2.5M14 19v2.5', trazo: 1.6 },
        { d: 'M12 7.6c1.9 1.7 2.8 3.2 2.8 4.8a2.8 2.8 0 0 1-5.6 0c0-1 .4-1.9 1.1-2.6.1 1.1.6 1.6 1.3 1.7-.3-1.4 0-2.7.4-3.9z', relleno: true },
    ],
    equipo_nuevo: [
        { d: 'M7.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v12.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 17.5V5a1.5 1.5 0 0 1 1.5-1.5z', trazo: 1.6 },
        { d: 'M10 19v2.5M14 19v2.5', trazo: 1.6 },
        { d: 'M13.1 6.6l-3.7 6h2.5l-.9 4.8 3.7-6.1h-2.5z', relleno: true },
    ],
    acs: [
        { d: 'M8 6.2c0-1.6 1.8-2.7 4-2.7s4 1.1 4 2.7v11.6c0 1.6-1.8 2.7-4 2.7s-4-1.1-4-2.7z', trazo: 1.6 },
        { d: 'M12 9c1.5 2 2.2 3.2 2.2 4.3a2.2 2.2 0 0 1-4.4 0c0-1.1.7-2.3 2.2-4.3z', relleno: true },
    ],
    ud_exterior: [
        { d: 'M4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9A1.5 1.5 0 0 1 4.5 6z', trazo: 1.6 },
        { d: 'M10 8.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z', trazo: 1.4 },
        { d: 'M10 12V8.9M10 12l2.7 1.6M10 12l-2.7 1.6', trazo: 1.3 },
        { d: 'M16 9.3h3M16 12h3M16 14.7h3', trazo: 1.3 },
    ],
};

/** Los trazos del icono de un tipo: `[{ d, trazo?, relleno? }]`. */
export const trazosIcono = (id) => ICONOS[id] || [];

/**
 * El icono en SVG (cadena), centrado en `(x, y)` con `lado` de cuadrado, para
 * el PDF. El cuadrado lleva el color del tipo y un filo blanco, para que se
 * despegue de un muro negro o de la trama del tejado.
 */
export function iconoSvg(id, x, y, lado, { color = null, filo = null } = {}) {
    const t = tipoEquipo(id);
    if (!t) return '';
    const k = lado / 24;
    const fondo = color || t.colorPdf;
    const borde = filo == null ? lado * 0.07 : filo;
    const piezas = trazosIcono(id).map(p => (p.relleno
        ? `<path d="${p.d}" fill="#fff"/>`
        : `<path d="${p.d}" fill="none" stroke="#fff" stroke-width="${p.trazo || 1.5}" stroke-linecap="round" stroke-linejoin="round"/>`));
    return `<g transform="translate(${(x - lado / 2).toFixed(3)} ${(y - lado / 2).toFixed(3)})">`
        + `<rect width="${lado}" height="${lado}" rx="${lado * 0.22}" fill="${fondo}" stroke="#fff" stroke-width="${borde}"/>`
        + `<g transform="scale(${k})">${piezas.join('')}</g></g>`;
}

// ─── Lo guardado ────────────────────────────────────────────────────────────

const r2 = v => Math.round(v * 100) / 100;
const esNivel = n => n === NIVEL_CUBIERTA || Number.isInteger(n);

/**
 * La lista guardada, saneada: tipos conocidos, nivel válido, punto con dos
 * números. Si un tipo sale dos veces, manda el ÚLTIMO (es el que se puso
 * después). Nunca lanza: un trabajo viejo o roto da `[]`.
 */
export function equiposValidos(lista) {
    if (!Array.isArray(lista)) return [];
    const porTipo = new Map();
    for (const e of lista) {
        if (!e || typeof e !== 'object' || !POR_ID.has(e.tipo) || !esNivel(e.nivel)) continue;
        const p = e.punto;
        if (!Array.isArray(p) || p.length < 2) continue;
        const X = Number(p[0]), Y = Number(p[1]);
        if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
        porTipo.delete(e.tipo);
        porTipo.set(e.tipo, { tipo: e.tipo, nivel: e.nivel, punto: [r2(X), r2(Y)] });
    }
    // En el orden de los tipos: la lista se lee igual la pongas como la pongas.
    return TIPOS_EQUIPO.map(t => porTipo.get(t.id)).filter(Boolean);
}

/** Pone (o cambia de sitio) un equipo. `punto` en el MUNDO. */
export function ponEquipo(lista, { tipo, nivel, punto }) {
    return equiposValidos([...(Array.isArray(lista) ? lista : []), { tipo, nivel, punto }]);
}

/** Quita el equipo de ese tipo. */
export function quitaEquipo(lista, tipo) {
    return equiposValidos((Array.isArray(lista) ? lista : []).filter(e => e?.tipo !== tipo));
}

// ─── Del mundo al lienzo y vuelta ───────────────────────────────────────────
// `lam` es `lienzoAMundo(georef)` (geometriaPlano.js): `x_mundo = x + dx` e
// `y_mundo = y0 − y`. Es la MISMA traslación que usan las zonas y el contorno.

export const alLienzo = ([X, Y], lam) => [r2(X - lam.dx), r2(lam.y0 - Y)];
export const alMundo = ([x, y], lam) => [r2(x + lam.dx), r2(lam.y0 - y)];

/** Los equipos con su punto en el LIENZO (`lienzo`). Sin `lam`, ninguno. */
export function equiposEnLienzo(lista, lam) {
    if (!lam) return [];
    return equiposValidos(lista).map(e => ({ ...e, lienzo: alLienzo(e.punto, lam) }));
}

/**
 * Cómo se dice el sitio de un equipo: «Planta baja», «Planta 1», «Cubierta».
 * Siempre en mayúscula solo la primera: el motor llama «PLANTA BAJA» a la planta
 * y salía «✓ PLANTA BAJA» junto a «✓ Cubierta».
 */
export function nombreDelSitio(nivel, plantas = []) {
    if (nivel === NIVEL_CUBIERTA) return 'Cubierta';
    const p = (plantas || []).find(x => x?.nivel === nivel);
    const frase = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    if (p?.nombre) return frase(/^planta/i.test(p.nombre) ? p.nombre : `Planta ${p.nombre}`);
    if (nivel === 0) return 'Planta baja';
    return nivel < 0 ? `Sótano ${Math.abs(nivel)}` : `Planta ${nivel}`;
}

// ─── El PLANO DE CUBIERTA ───────────────────────────────────────────────────

/**
 * Los FALDONES que se ven desde arriba, en el lienzo, del más bajo al más
 * alto (así, al pintarlos en orden, el tejado de arriba tapa al de abajo).
 *
 * Salen de los CUERPOS del edificio que ya manda el motor (`geo.cuerpos`, cada
 * parte de Catastro con su contorno y sus `niveles`): un cuerpo es un prisma,
 * así que su tejado es su contorno a la altura de su planta más alta — el
 * garaje de una planta queda como un tejado más bajo que el de la casa, que es
 * justo donde se suele poner la unidad exterior. Sin cuerpos (una geometría
 * antigua), el contorno de cada planta por sus muros.
 *
 * @returns {Array<{ id, puntos: [x,y][], nivel: number, plantas: number }>}
 */
export function faldonesCubierta({ cuerpos = [], plantas = [] } = {}) {
    const out = [];
    for (const c of cuerpos || []) {
        const ns = (Array.isArray(c?.niveles) ? c.niveles : []).filter(Number.isInteger);
        const arriba = ns.length ? Math.max(...ns) : 0;
        const sobreRasante = ns.filter(n => n >= 0).length || 1;
        (c?.contornos || []).forEach((pts, i) => {
            if (Array.isArray(pts) && pts.length >= 3) {
                out.push({ id: `${c.id ?? 'c'}-${i}`, puntos: pts, nivel: arriba, plantas: sobreRasante });
            }
        });
    }
    if (!out.length) {
        for (const p of plantas || []) {
            const anillo = anilloDeMuros((p?.muros || []).filter(m => !m?.fuera));
            if (anillo) out.push({ id: `p-${p.id}`, puntos: anillo, nivel: Number(p.nivel) || 0, plantas: 1 });
        }
    }
    return out.sort((a, b) => a.nivel - b.nivel);
}

/**
 * El contorno cerrado que forman los muros de una planta, encadenándolos por
 * sus extremos (como `superficieDeMuros` del croquis). `null` si no cierra.
 */
export function anilloDeMuros(muros) {
    const tramos = (muros || []).map(m => (m?.svg || []).map(p => [p[0], p[1]])).filter(p => p.length >= 2);
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
    return anillo.slice(0, -1);
}

/** La caja `{x0,y0,x1,y1}` de unos faldones (y de unos puntos sueltos). */
export function cajaDe(faldones, extra = []) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const mete = ([x, y]) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    };
    for (const f of faldones || []) for (const p of f.puntos || []) mete(p);
    for (const p of extra || []) mete(p);
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/**
 * Dónde se DIBUJA cada icono. La máquina nueva va muchas veces justo donde
 * estaba la caldera vieja, y dos iconos en el mismo punto son uno: el que llega
 * a un sitio ocupado se corre a la derecha (`paso`) y se une a su punto con una
 * línea. Lo que se guarda no se toca: esto es solo el dibujo.
 *
 * @param {Array<{ lienzo: [x,y] }>} lista
 * @returns {Array<{ e, ancla: [x,y], pos: [x,y], corrida: boolean }>}
 */
export function separarMarcas(lista, paso) {
    const puestas = [];
    for (const e of lista || []) {
        const ancla = e?.lienzo;
        if (!Array.isArray(ancla)) continue;
        let pos = [ancla[0], ancla[1]];
        for (let n = 0; n < 8 && puestas.some(p => Math.hypot(p.pos[0] - pos[0], p.pos[1] - pos[1]) < paso * 0.98); n++) {
            pos = [pos[0] + paso, pos[1]];
        }
        puestas.push({ e, ancla, pos, corrida: pos[0] !== ancla[0] || pos[1] !== ancla[1] });
    }
    return puestas;
}

/**
 * La MAQUETA de los iconos de un plano en pantalla: dónde va cada uno, cuánto
 * mide y lo que ocupa su rótulo. La usan el dibujo (`MarcasEquipos`) y la pasada
 * de rótulos del plano (`rotulosPlano.js`, que los trata como obstáculos fijos
 * para que ningún nombre de pared ni cota caiga encima): los dos tienen que
 * medir lo MISMO, por eso es una sola función. `tam` es la letra del plano.
 *
 * @returns {Array<{ e, ancla, pos, corrida, lado, fs, ancho, texto }>}
 */
export function marcasDelPlano(equipos, tam) {
    const lado = tam * 2.3;
    const fs = tam * 0.9;
    const anchoDe = t => Math.max(lado, (tipoEquipo(t)?.corta || '').length * fs * 0.62 + fs * 0.8);
    // Corridos lo bastante para que los RÓTULOS no se toquen, no solo los iconos.
    const paso = Math.max(lado * 2, ...(equipos || []).map(e => anchoDe(e?.tipo) + tam * 0.6));
    return separarMarcas(equipos, paso).map((m) => {
        const texto = tipoEquipo(m.e?.tipo)?.corta || '';
        return { ...m, lado, fs, texto, ancho: anchoDe(m.e?.tipo) };
    });
}

/** La caja que ocupa una marca —icono y rótulo— en el lienzo: `{x0, y0, x1, y1}`. */
export function cajaDeMarca(m) {
    const w = Math.max(m.lado, m.ancho) / 2;
    return { x0: m.pos[0] - w, x1: m.pos[0] + w,
             y0: m.pos[1] - m.lado / 2, y1: m.pos[1] + m.lado * 0.58 + m.fs * 1.35 };
}

/**
 * Dónde va el rótulo de un FALDÓN («sobre planta 1»): en su polo de
 * inaccesibilidad (el punto de dentro más holgado, no el centroide, que en una L
 * cae en el codo) y, si ahí hay un icono, justo debajo de su rótulo — era lo
 * único que decía sobre qué tejado está la unidad exterior y quedaba tapado.
 * `polo` es `poloInaccesible` de `rotulosPlano.js` (se inyecta para no atar este
 * módulo a aquél).
 *
 * Se mira si las CAJAS se cortan (la del rótulo, con su `texto` a `fs`, y la del
 * icono con el suyo), no la distancia entre centros: con la unidad exterior a un
 * lado, su «Ud. ext.» —más ancho que el icono— se comía la cola del rótulo
 * («sobre planta b…»; segunda revisión de diseño, 09/10/2026: 17 de 117 sitios).
 */
export function sitioRotuloFaldon(puntos, marcas, polo, { texto = '', fs = 1 } = {}) {
    const p = polo(puntos);
    const x = p.x;
    let y = p.y;
    const w = String(texto).length * fs * 0.6;
    const cajaEn = yy => ({ x0: x - w / 2, x1: x + w / 2, y0: yy - fs * 0.95, y1: yy + fs * 0.3 });
    const corta = (a, b, mg) => a.x0 < b.x1 + mg && b.x0 < a.x1 + mg && a.y0 < b.y1 + mg && b.y0 < a.y1 + mg;
    // En orden de arriba abajo: al bajar por debajo de uno puede caer encima del siguiente.
    const cajas = (marcas || []).map(cajaDeMarca).sort((a, b) => a.y0 - b.y0);
    for (const cm of cajas) {
        if (corta(cajaEn(y), cm, fs * 0.3)) y = cm.y1 + fs * 1.1;
    }
    return [x, y];
}

/** El equipo más cercano a un punto del lienzo, dentro de `radio`. */
export function equipoCercano(lista, [x, y], radio) {
    let mejor = null;
    for (const e of lista || []) {
        if (!e?.lienzo) continue;
        const d = Math.hypot(e.lienzo[0] - x, e.lienzo[1] - y);
        if (d <= radio && (!mejor || d < mejor.d)) mejor = { e, d };
    }
    return mejor?.e || null;
}

export default { NIVEL_CUBIERTA, TIPOS_EQUIPO, tipoEquipo, trazosIcono, iconoSvg, equiposValidos,
                 ponEquipo, quitaEquipo, alLienzo, alMundo, equiposEnLienzo, nombreDelSitio,
                 faldonesCubierta, anilloDeMuros, cajaDe, separarMarcas, marcasDelPlano, cajaDeMarca,
                 sitioRotuloFaldon, equipoCercano };
