// ============================================================================
// streetView.js — QUÉ FOTO de Google Street View enseña cada fachada.
//
// Lo usa `scripts/cee_inicial.js streetview` (skill generar-cee-inicial). Sin
// fotos de las fachadas el CEE sale sin ventanas, y casi siempre las fachadas
// que dan a la calle están en Street View: es lo que se hacía a mano (Google
// Maps → captura → subir). Aquí se hace por la API, pared a pared.
//
// Puro y sin red: la geometría (qué paredes forman un LADO de la casa, dónde
// ponerse para verlo y hacia dónde mirar). La red la pone quien llama.
//
// REGLAS
//   · Un LADO es el conjunto de fachadas de la misma orientación en el mismo
//     plano, de TODAS las plantas: una foto de la calle enseña la planta baja y
//     la primera a la vez. Catastro trocea una fachada cada vez que cambia el
//     vecino de enfrente; la foto no.
//   · El panorama tiene que estar DELANTE de la fachada (en su lado exterior).
//     Uno detrás —en la calle de atrás— enseñaría la pared contraria, que es
//     justo el error que convierte una foto en una mentira.
//   · Los lados a un patio NO se ven desde la calle: se dicen para pedirlos.
// ============================================================================

const AZ = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315 };
const rad = (g) => (g * Math.PI) / 180;
const grados = (r) => (r * 180) / Math.PI;
const norm360 = (g) => ((g % 360) + 360) % 360;

/** El lienzo del motor → el mundo (EPSG:25830): X = x + dx, Y = y0 − y. */
function aMundo(p, ref) { return [p[0] + ref.dx, ref.y0 - p[1]]; }

/**
 * La normal EXTERIOR de una pared: de las dos perpendiculares a su trazo, la más
 * cercana al rumbo que declara (el rumbo viene redondeado a 45°; el trazo no).
 */
function normalExterior(A, B, orientacion) {
    const az = AZ[orientacion];
    if (az === undefined) return null;
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) return null;
    const cands = [[dy / L, -dx / L], [-dy / L, dx / L]];
    const objetivo = [Math.sin(rad(az)), Math.cos(rad(az))];
    return cands.sort((a, b) => (b[0] * objetivo[0] + b[1] * objetivo[1])
                              - (a[0] * objetivo[0] + a[1] * objetivo[1]))[0];
}

/** Azimut (0 = N, horario) de un vector (este, norte). */
const azimut = (v) => norm360(grados(Math.atan2(v[0], v[1])));

/**
 * Los LADOS de la casa que se pueden fotografiar desde fuera.
 *
 * `muros`: los del motor (con `svg` en el lienzo, `tipo`, `subtipo`,
 * `orientacion`, `nivel`, `largo`). Solo FACHADAS; las de patio van aparte.
 * Devuelve `{ lados, patios }`, cada lado con su centro en el mundo, su normal,
 * su ancho, las paredes que lo forman y cuántas plantas tiene.
 */
function ladosDeFachada(muros, ref, { minimo = 1.5, tolerancia = 1.5 } = {}) {
    const lados = [];
    const patios = [];
    // TODO en coordenadas LOCALES (respecto a un punto de la casa): en UTM las X
    // e Y son millones de metros, y proyectarlas sobre dos normales que difieren
    // en 5° da «fondos» que se separan kilómetros. Cada tramo se proyecta sobre
    // la normal de SU lado, no sobre la suya.
    let O = null;
    const dot = (p, v) => p[0] * v[0] + p[1] * v[1];
    for (const m of muros || []) {
        if (m.tipo !== 'FACHADA' || m.fuera || !Array.isArray(m.svg) || m.svg.length < 2) continue;
        const A0 = aMundo(m.svg[0], ref), B0 = aMundo(m.svg[m.svg.length - 1], ref);
        if (!O) O = A0;
        const A = [A0[0] - O[0], A0[1] - O[1]], B = [B0[0] - O[0], B0[1] - O[1]];
        const n = normalExterior(A, B, m.orientacion);
        if (!n) continue;
        if (/PATIO/.test(String(m.subtipo || ''))) { patios.push(m); continue; }
        const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        let lado = lados.find(l => l.orientacion === m.orientacion && dot(l.n, n) > Math.cos(Math.PI / 9)
            && Math.abs(dot(mid, l.n) - l.s) <= tolerancia);
        if (!lado) {
            lado = { orientacion: m.orientacion, n, t: [n[1], -n[0]], s: dot(mid, n),
                     tmin: Infinity, tmax: -Infinity, muros: [], niveles: new Set() };
            lados.push(lado);
        }
        lado.tmin = Math.min(lado.tmin, dot(A, lado.t), dot(B, lado.t));
        lado.tmax = Math.max(lado.tmax, dot(A, lado.t), dot(B, lado.t));
        lado.muros.push(m.id);
        lado.niveles.add(m.nivel ?? 0);
    }
    // Catastro trocea un lado de la casa en tramos de un metro (un retranqueo, el
    // fondo de un porche, la planta de arriba un poco metida): para la FOTO es
    // el mismo lado. Se juntan los de la misma orientación que están a menos de
    // `juntar` m de fondo y se tocan (o casi) a lo largo.
    const juntar = 3.5, hueco = 3;
    for (let cambio = true; cambio;) {
        cambio = false;
        for (let i = 0; i < lados.length && !cambio; i++) {
            for (let j = i + 1; j < lados.length && !cambio; j++) {
                const a = lados[i], b = lados[j];
                if (a.orientacion !== b.orientacion || Math.abs(a.s - b.s) > juntar) continue;
                if (a.n[0] * b.n[0] + a.n[1] * b.n[1] < Math.cos(Math.PI / 9)) continue;
                if (Math.max(a.tmin, b.tmin) - Math.min(a.tmax, b.tmax) > hueco) continue;
                const wa = a.tmax - a.tmin, wb = b.tmax - b.tmin;
                a.s = (a.s * wa + b.s * wb) / ((wa + wb) || 1);
                a.tmin = Math.min(a.tmin, b.tmin);
                a.tmax = Math.max(a.tmax, b.tmax);
                a.muros.push(...b.muros);
                for (const nv of b.niveles) a.niveles.add(nv);
                lados.splice(j, 1);
                cambio = true;
            }
        }
    }
    const out = lados.map((l) => {
        const tc = (l.tmin + l.tmax) / 2;
        return {
            orientacion: l.orientacion,
            muros: l.muros,
            plantas: l.niveles.size,
            ancho: l.tmax - l.tmin,
            centro: [O[0] + l.t[0] * tc + l.n[0] * l.s, O[1] + l.t[1] * tc + l.n[1] * l.s],
            normal: l.n,
            azimut_normal: azimut(l.n),
        };
    }).filter(l => l.ancho >= minimo)
      .sort((a, b) => b.ancho - a.ancho);
    return { lados: out, patios };
}

/** Un punto del mundo desplazado `d` metros a lo largo de `v`. */
const desplazar = (p, v, d) => [p[0] + v[0] * d, p[1] + v[1] * d];

/**
 * El encuadre para ver un lado desde un panorama: hacia dónde mirar, cuánto
 * abrir el objetivo y cuánto levantarlo. `pano` en el mundo (EPSG:25830).
 * Devuelve null si el panorama NO está delante de la fachada.
 */
function encuadre(lado, pano, { alturaPlanta = 2.8, camara = 2.5, holgura = 1.5 } = {}) {
    const v = [lado.centro[0] - pano[0], lado.centro[1] - pano[1]];
    const delante = -(v[0] * lado.normal[0] + v[1] * lado.normal[1]);
    if (delante < 2) return null;
    const dist = Math.hypot(v[0], v[1]);
    const fov = Math.max(35, Math.min(110, 2 * grados(Math.atan((lado.ancho / 2 + holgura) / delante))));
    const altura = lado.plantas * alturaPlanta;
    const pitch = Math.max(0, Math.min(25, grados(Math.atan((altura / 2 - camara) / dist))));
    // Cuánto se ve de LADO: 0 = de frente. A más de 45° la fachada sale muy
    // escorzada y sus huecos no se pueden medir.
    const oblicuidad = grados(Math.acos(Math.min(1, delante / dist)));
    return { heading: Math.round(azimut(v)), fov: Math.round(fov), pitch: Math.round(pitch),
             distancia: Math.round(dist * 10) / 10, oblicuidad: Math.round(oblicuidad) };
}

/**
 * Latitud/longitud (ETRS89 ≈ WGS84) → UTM del huso dado. Es la inversa de
 * `utmALatLon` (frontend/…/ortofoto.js), con el mismo elipsoide GRS80: la
 * posición de un panorama tiene que caer en el mismo mundo que las paredes.
 */
function latLonAUtm(lat, lon, huso) {
    const A = 6378137, F = 1 / 298.257222101, K0 = 0.9996;
    const e2 = F * (2 - F), ep2 = e2 / (1 - e2);
    const phi = rad(lat), lam = rad(lon), lam0 = rad(huso * 6 - 183);
    const N = A / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2;
    const Aa = Math.cos(phi) * (lam - lam0);
    const M = A * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi
        - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
        + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi)
        - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
    const x = K0 * N * (Aa + ((1 - T + C) * Aa ** 3) / 6
        + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * Aa ** 5) / 120) + 500000;
    const y = K0 * (M + N * Math.tan(phi) * (Aa ** 2 / 2
        + ((5 - T + 9 * C + 4 * C ** 2) * Aa ** 4) / 24
        + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * Aa ** 6) / 720));
    return [x, y];
}

module.exports = { AZ, aMundo, normalExterior, ladosDeFachada, desplazar, encuadre, azimut, latLonAUtm };
