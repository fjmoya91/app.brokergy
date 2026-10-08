// ─────────────────────────────────────────────────────────────────────────────
// La GUÍA DE TRANSMITANCIAS de BROKERGY desde el 08/10/2026: las U y masas que el
// propio CE3X 3.2 pone a cada cerramiento con «Estimados según antigüedad y zona
// climática» (en el fichero, 'Por defecto'), y que el `.cex` escribe como
// «Conocidas». Decisión de Fran, 08/10/2026: «cada nuevo CEE debe llevar valores
// conocidos como si se hubiera seleccionado estimados según antigüedad y zona».
//
// FUENTE ÚNICA: la calculadora (`getUByYear`), la ficha del `.cex`
// (`transmitancias` en fichaCe3x.js), la revisión del CEE y el PDF de la Guía
// (scripts/guia_transmitancias.mjs) leen ESTA tabla.
//
// De dónde sale: no está publicada; CE3X la lleva compilada en
// `Envolvente/tablasValores.pyd`. Se la preguntó el oráculo
// (cee-engine/tools/oraculo_ce3x/valores_por_defecto.py): 7 periodos × 20 zonas
// HE-1 × 5 zonas NBE × 12 cerramientos, sin un error; y se comprobó además por la
// pantalla (cambiando «Normativa vigente» y la zona en el 188). Agrupada por
// ÉPOCA porque CE3X da lo mismo en «1980 - 1998» y «1998 - 2007», y en
// «2014 - 2020», «Después 2020» y «Otros (post 2020)» (medido, cero diferencias).
// Ver docs/conocimiento/envolvente-ce3x/los-valores-por-defecto-de-ce3x-3-2-por-epoca-y-zona.md
//
// REGLA — en las épocas de la NBE-CT-79 la U va por la ZONA DE LA NBE (V…Z), no
// por la HE-1. Nuestros `.cex` llevan siempre la localidad «Otro», y con ella
// CE3X la deduce de la HE-1 (`zonaNbe`); el `.cex` la escribe en sus datos
// generales para que CE3X no ponga otra.
// ─────────────────────────────────────────────────────────────────────────────

/** Los periodos de «Normativa vigente»: lo que guarda el fichero, lo que enseña la 3.2 y su época. */
export const PERIODOS_CE3X = [
    { valor: 'Anterior', etiqueta: 'Antes 1980', epoca: 'anterior' },
    { valor: 'NBE-CT-79', etiqueta: '1980 - 1998', epoca: 'nbe' },
    { valor: 'NBE-CT-79_aPartir1998', etiqueta: '1998 - 2007', epoca: 'nbe' },
    { valor: 'C.T.E.', etiqueta: '2007 - 2013', epoca: 'cte2006' },
    { valor: 'CTE 2013', etiqueta: '2014 - 2020', epoca: 'cte2013' },
    { valor: 'Apartir2020', etiqueta: 'Después 2020', epoca: 'cte2013' },
    { valor: 'Otros', etiqueta: 'Otros (post 2020)', epoca: 'cte2013' },
];

/** El periodo por el año de construcción: los tramos de la 3.1/3.2 (`normativa31`). */
export function periodoDeAnio(anio) {
    const a = Number(anio);
    if (!Number.isFinite(a) || !a) return null;
    if (a < 1980) return 'Anterior';
    if (a < 1998) return 'NBE-CT-79';
    if (a < 2007) return 'NBE-CT-79_aPartir1998';
    if (a < 2014) return 'C.T.E.';
    if (a <= 2020) return 'CTE 2013';
    return 'Apartir2020';
}

//: La 2.3 escribe cuatro periodos; los suyos caen en la misma época.
const EPOCA_DE = Object.fromEntries(PERIODOS_CE3X.map(p => [p.valor, p.epoca]));

/** La época de la tabla para un periodo de CE3X (o null si no se reconoce). */
export function epocaDe(periodo) {
    return EPOCA_DE[String(periodo || '').trim()] || null;
}

/** La letra de una zona HE-1 ('D3' → 'D', 'α1'/'alpha1' → 'alpha'). Sin zona, D. */
export function letraZona(zona) {
    const z = String(zona || '').trim();
    if (!z) return 'D';
    if (/^(alpha|α)/i.test(z)) return 'alpha';
    const l = z.charAt(0).toUpperCase();
    return 'ABCDE'.includes(l) ? l : 'D';
}

//: La zona de la NBE-CT-79 que CE3X 3.2 pone con la localidad «Otro», por la
//: HE-1 (medido en las 52 provincias: no depende de la provincia).
const NBE_DE_HE1 = {
    A1: 'V', A2: 'V', B1: 'V', B2: 'V',
    A3: 'W', A4: 'W', B3: 'W', B4: 'W', C1: 'W', C2: 'W',
    C4: 'X',
    C3: 'Y', D1: 'Y', D2: 'Y', D3: 'Y',
    E1: 'Z',
};

/** La zona NBE (V…Z) de una zona HE-1, como CE3X con la localidad «Otro». Sin zona, la de D3. */
export function zonaNbe(zona) {
    const z = String(zona || '').trim().toUpperCase().replace('Α', 'ALPHA');
    if (!z) return 'Y';
    if (z.startsWith('ALPHA')) return 'V';
    return NBE_DE_HE1[z] || 'Y';
}

//: [U W/m²K, masa kg/m²] por cerramiento y época. NBE por su zona (V…Z); los
//: del C.T.E. por la letra de la HE-1. Copiados de la salida del oráculo.
export const TABLA_CE3X = {
    fachada_aire: {
        anterior: [2.38, 168],
        nbe: { V: [1.8, 200], W: [1.8, 200], X: [1.6, 200], Y: [1.4, 200], Z: [1.4, 200] },
        cte2006: { alpha: [0.94, 200], A: [0.94, 200], B: [0.82, 200], C: [0.73, 200], D: [0.66, 200], E: [0.57, 200] },
        cte2013: { alpha: [0.94, 200], A: [0.5, 200], B: [0.38, 200], C: [0.29, 200], D: [0.27, 200], E: [0.25, 200] },
    },
    muro_terreno: {
        anterior: [2, 200],
        nbe: { V: [2, 200], W: [2, 200], X: [2, 200], Y: [2, 200], Z: [2, 200] },
        cte2006: { alpha: [0.94, 200], A: [0.94, 200], B: [0.82, 200], C: [0.73, 200], D: [0.66, 200], E: [0.57, 200] },
        cte2013: { alpha: [0.94, 200], A: [0.5, 200], B: [0.38, 200], C: [0.29, 200], D: [0.27, 200], E: [0.25, 200] },
    },
    cubierta_plana: {
        anterior: [2.17, 344],
        nbe: { V: [1.4, 344], W: [1.4, 344], X: [1.2, 344], Y: [0.9, 344], Z: [0.7, 344] },
        cte2006: { alpha: [0.5, 344], A: [0.5, 344], B: [0.45, 344], C: [0.41, 344], D: [0.38, 344], E: [0.35, 344] },
        cte2013: { alpha: [0.5, 344], A: [0.47, 344], B: [0.33, 344], C: [0.23, 344], D: [0.22, 344], E: [0.19, 344] },
    },
    cubierta_inclinada: {
        anterior: [2.63, 180],
        nbe: { V: [1.4, 344], W: [1.4, 344], X: [1.2, 344], Y: [0.9, 344], Z: [0.7, 344] },
        cte2006: { alpha: [0.5, 344], A: [0.5, 344], B: [0.45, 344], C: [0.41, 344], D: [0.38, 344], E: [0.35, 344] },
        cte2013: { alpha: [0.5, 344], A: [0.47, 344], B: [0.33, 344], C: [0.23, 344], D: [0.22, 344], E: [0.19, 344] },
    },
    cubierta_terreno: {
        anterior: [1, 400],
        nbe: { V: [1, 400], W: [1, 400], X: [1, 400], Y: [1, 400], Z: [1, 400] },
        cte2006: { alpha: [0.94, 400], A: [0.94, 400], B: [0.82, 400], C: [0.73, 400], D: [0.66, 400], E: [0.57, 400] },
        cte2013: { alpha: [0.94, 400], A: [0.5, 400], B: [0.38, 400], C: [0.29, 400], D: [0.27, 400], E: [0.25, 400] },
    },
    suelo_aire: {
        anterior: [2.5, 50],
        nbe: { V: [1, 333], W: [1, 333], X: [0.9, 333], Y: [0.8, 333], Z: [0.7, 333] },
        cte2006: { alpha: [0.53, 333], A: [0.53, 333], B: [0.52, 333], C: [0.5, 333], D: [0.49, 333], E: [0.48, 333] },
        cte2013: { alpha: [0.53, 333], A: [0.53, 333], B: [0.46, 333], C: [0.36, 333], D: [0.34, 333], E: [0.31, 333] },
    },
    suelo_terreno: {
        anterior: [1, 750],
        nbe: { V: [1, 750], W: [1, 750], X: [1, 750], Y: [1, 750], Z: [1, 750] },
        cte2006: { alpha: [0.94, 750], A: [0.94, 750], B: [0.82, 750], C: [0.73, 750], D: [0.66, 750], E: [0.57, 750] },
        cte2013: { alpha: [0.94, 750], A: [0.5, 750], B: [0.38, 750], C: [0.29, 750], D: [0.27, 750], E: [0.25, 750] },
    },
    particion_vertical: {
        anterior: [2.25, 60],
        nbe: { V: [1.8, 60], W: [1.8, 60], X: [1.62, 60], Y: [1.44, 60], Z: [1.44, 60] },
        cte2006: { alpha: [0.94, 60], A: [0.94, 60], B: [0.82, 60], C: [0.73, 60], D: [0.66, 60], E: [0.57, 60] },
        cte2013: { alpha: [0.94, 60], A: [0.94, 60], B: [0.82, 60], C: [0.73, 60], D: [0.66, 60], E: [0.57, 60] },
    },
    particion_inferior: {
        anterior: [2.17, 50],
        nbe: { V: [2.17, 333], W: [2.17, 333], X: [1.4, 333], Y: [1.2, 333], Z: [1.2, 333] },
        cte2006: { alpha: [0.53, 333], A: [0.53, 333], B: [0.52, 333], C: [0.5, 333], D: [0.49, 333], E: [0.48, 333] },
        cte2013: { alpha: [0.53, 333], A: [0.53, 333], B: [0.52, 333], C: [0.5, 333], D: [0.49, 333], E: [0.48, 333] },
    },
    camara_sanitaria: {
        anterior: [2, 333],
        nbe: { V: [2, 333], W: [2, 333], X: [1.4, 333], Y: [1.2, 333], Z: [1.2, 333] },
        cte2006: { alpha: [0.53, 333], A: [0.53, 333], B: [0.52, 333], C: [0.5, 333], D: [0.49, 333], E: [0.48, 333] },
        cte2013: { alpha: [0.53, 333], A: [0.53, 333], B: [0.52, 333], C: [0.5, 333], D: [0.49, 333], E: [0.48, 333] },
    },
    particion_bajo_cubierta: {
        anterior: [1.36, 120],
        nbe: { V: [1.36, 400], W: [1.36, 400], X: [1.12, 400], Y: [0.96, 400], Z: [0.96, 400] },
        cte2006: { alpha: [0.5, 400], A: [0.5, 400], B: [0.45, 400], C: [0.41, 400], D: [0.38, 400], E: [0.35, 400] },
        cte2013: { alpha: [0.5, 400], A: [0.5, 400], B: [0.45, 400], C: [0.41, 400], D: [0.38, 400], E: [0.35, 400] },
    },
    particion_superior_otro: {
        anterior: [1.7, 220],
        nbe: { V: [1.7, 500], W: [1.7, 500], X: [1.4, 500], Y: [1.2, 500], Z: [1.2, 500] },
        cte2006: { alpha: [0.5, 500], A: [0.5, 500], B: [0.45, 500], C: [0.41, 500], D: [0.38, 500], E: [0.35, 500] },
        cte2013: { alpha: [0.5, 500], A: [0.5, 500], B: [0.45, 500], C: [0.41, 500], D: [0.38, 500], E: [0.35, 500] },
    },
};

/** Cómo se llama cada cerramiento en CE3X (para la Guía y los avisos). */
export const NOMBRE_CERRAMIENTO_CE3X = {
    fachada_aire: 'Muro de fachada',
    muro_terreno: 'Muro en contacto con el terreno',
    cubierta_plana: 'Cubierta plana en contacto con el aire',
    cubierta_inclinada: 'Cubierta inclinada en contacto con el aire',
    cubierta_terreno: 'Cubierta enterrada',
    suelo_aire: 'Suelo en contacto con el aire exterior',
    suelo_terreno: 'Suelo en contacto con el terreno',
    particion_vertical: 'Partición vertical con espacio no habitable',
    particion_inferior: 'Partición horizontal inferior (garaje / local)',
    camara_sanitaria: 'Partición horizontal inferior (cámara sanitaria)',
    particion_bajo_cubierta: 'Partición horizontal superior (bajo cubierta inclinada)',
    particion_superior_otro: 'Partición horizontal superior (otro)',
};

/**
 * La U y la masa que CE3X 3.2 pone a un cerramiento con «Estimados según
 * antigüedad y zona climática».
 * @param {string} cerramiento clave de TABLA_CE3X
 * @param {{ anio?: number, periodo?: string, zona?: string }} o — el periodo
 *   (el que declara el `.cex`) manda sobre el año
 * @returns {{ u: number, masa: number, periodo: string, epoca: string, zona_nbe: string|null, letra: string|null } | null}
 */
export function uCe3x(cerramiento, { anio, periodo, zona } = {}) {
    const t = TABLA_CE3X[cerramiento];
    const p = periodo || periodoDeAnio(anio);
    const epoca = epocaDe(p);
    if (!t || !epoca) return null;
    if (epoca === 'anterior') {
        const [u, masa] = t.anterior;
        return { u, masa, periodo: p, epoca, zona_nbe: null, letra: null };
    }
    if (epoca === 'nbe') {
        const nbe = zonaNbe(zona);
        const [u, masa] = t.nbe[nbe];
        return { u, masa, periodo: p, epoca, zona_nbe: nbe, letra: null };
    }
    const letra = letraZona(zona);
    const [u, masa] = t[epoca][letra];
    return { u, masa, periodo: p, epoca, zona_nbe: null, letra };
}

/** La etiqueta de un periodo como la enseña CE3X 3.2 («1998 - 2007»). */
export function etiquetaPeriodo(periodo) {
    return PERIODOS_CE3X.find(p => p.valor === periodo)?.etiqueta || periodo || '';
}
