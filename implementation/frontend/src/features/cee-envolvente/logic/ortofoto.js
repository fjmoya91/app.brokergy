// ─────────────────────────────────────────────────────────────────────────────
// La VISTA AÉREA debajo del plano: la ortofoto del PNOA (IGN), por teselas.
//
// Es la otra mitad de la cartografía del Catastro. Aquélla dice qué hay DADO DE
// ALTA; ésta enseña lo que hay de verdad: el tejado a dos aguas o la azotea, el
// patio, el cobertizo sin declarar, la piscina, el porche. Es lo que se mira en
// Google Earth antes de levantar un certificado, pero EN SU SITIO, debajo de las
// paredes que se están clasificando.
//
// POR QUÉ el PNOA y no Google: el PNOA es del Instituto Geográfico Nacional, se
// publica con licencia CC BY 4.0 (basta con citarlo) y se sirve en EPSG:25830 —
// el mismo sistema en el que el motor dibuja el plano—, así que encaja sin
// reproyectar nada. Las imágenes de Google no se pueden poner debajo de un plano
// propio sin su API de pago, y por eso de Google se ofrecen ENLACES (ver
// `enlacesMapas`), que es además donde está su 3D y el Street View.
//
// POR QUÉ teselas (WMTS) y no una sola imagen (WMS): medido el 30/09/2026, la
// WMS del PNOA tarda 13-30 s en devolver una imagen del entorno de una casa; las
// teselas están precalculadas y bajan en ~1,5 s cada una, en paralelo y
// cacheadas por el navegador y por el propio IGN. Las pide el NAVEGADOR
// directamente —igual que las de OpenStreetMap del selector de ubicación—: no
// pasan por nuestro servidor.
//
// ⚠️ LA ESQUINA DE LA REJILLA QUE PUBLICA EL IGN ESTÁ REDONDEADA AL METRO.
// Sus capabilities dan `TopLeftCorner` con la Y entera (7271570.0), y con ese
// valor la tesela del nivel 18 salía desplazada un píxel (0,30 m) frente a la
// WMS del mismo rectángulo. La rejilla está alineada POR ABAJO: `Y_arriba =
// minY + filas · lado` con un `minY` fijo por huso, y ese sí se puede acotar
// cruzando los ocho niveles (cada uno lo da con ±0,5 m). Con el punto medio
// del intervalo, comprobado tesela contra WMS con correlación de imagen:
// desplazamiento 0 en los niveles 17-19 del huso 30 (Tomelloso y Madrid), 18-19
// del 31 (Barcelona) y 18-19 del 29 (Santiago). El huso 28 (Canarias) NO se
// ofrece: no se pudo comprobar (la WMS respondía 502) y una capa desplazada
// debajo de un plano enseña una fachada donde no está.
// ─────────────────────────────────────────────────────────────────────────────

export const PNOA_WMTS = 'https://www.ign.es/wmts/pnoa-ma';
export const ATRIBUCION_PNOA = 'Ortofoto PNOA © Instituto Geográfico Nacional';

//: El denominador de escala de cada nivel (idéntico en los tres husos). Un
//: píxel mide `denominador · 0,28 mm`: 0,149 m en el 19, 0,299 en el 18.
const DENOMINADOR = {
    17: 2132.7295842851913,
    18: 1066.364792142596,
    19: 533.182396071298,
};

//: La rejilla de cada huso: la X de la esquina (exacta en las capabilities), el
//: `minY` en el que se alinea por abajo (ver la cabecera) y cuántas filas tiene
//: cada nivel (`MatrixHeight`).
export const REJILLAS_PNOA = {
    'EPSG:25829': { x0: -495135.75545113813, minY: 2988008.143,
                    filas: { 17: 12953, 18: 25906, 19: 51811 } },
    'EPSG:25830': { x0: -1968157.095, minY: 2818578.357,
                    filas: { 17: 29129, 18: 58257, 19: 116513 } },
    'EPSG:25831': { x0: -1714549.1480570585, minY: 2988008.143,
                    filas: { 17: 13902, 18: 27804, 19: 55608 } },
};

//: Cuántas teselas se piden como mucho. El entorno de una casa son 4-6 teselas
//: de lado en el nivel 19 (38 m cada una); una comunidad de adosados, más. Por
//: encima de esto se baja un nivel en vez de pedirle al IGN cien imágenes.
//: Medido en el navegador: 20 teselas bajan en paralelo en 0,26 s (~15 KB cada
//: una), así que 64 es poco más de un megabyte.
export const MAX_TESELAS = 64;

//: Cuánto se cubre alrededor del entorno, en fracción de su lado mayor. Con 0,5
//: un entorno de 62 m (el de una casa) se cubre con 124 m: 16-25 teselas del
//: nivel 19. Uno de 200 m pasa al nivel 18, que es la resolución nativa del
//: PNOA (25 cm) — el 19 la amplía, no añade detalle.
const MARGEN = 0.5;
const MARGEN_MAX_M = 40;

const NIVELES = [19, 18, 17];

/** Lo que mide de lado una tesela del nivel `n`, en metros. */
export function ladoTesela(nivel) {
    return 256 * DENOMINADOR[nivel] * 0.00028;
}

/** La URL de una tesela (petición KVP: el IGN no publica plantilla REST). */
export function urlTesela(crs, nivel, fila, col) {
    return `${PNOA_WMTS}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0`
        + '&LAYER=OI.OrthoimageCoverage&STYLE=default'
        + `&TILEMATRIXSET=${crs}&TILEMATRIX=${nivel}`
        + `&TILEROW=${fila}&TILECOL=${col}&FORMAT=image/jpeg`;
}

/**
 * Las teselas que cubren el rectángulo del plano, YA COLOCADAS en el lienzo.
 *
 * `georef` es el que devuelve el motor con la geometría: el rectángulo del
 * ENTORNO en el mundo (`bbox`) y dónde cae dentro del lienzo (`en_el_lienzo`).
 * Del mundo al lienzo es una traslación con la Y del revés —la MISMA que
 * `lienzoAMundo`—, así que una tesela, que en el mundo es un cuadrado alineado
 * con los ejes, en el lienzo también lo es: basta con su esquina y su lado.
 *
 * Devuelve `{ nivel, lado, teselas: [{ key, href, x, y, ancho, alto }] }`, o
 * `{ aviso }` si no se puede — nunca lanza: la vista aérea es una ayuda, y el
 * plano funciona igual sin ella.
 */
export function teselasOrtofoto(georef, { max = MAX_TESELAS, margen = MARGEN } = {}) {
    const bbox = (georef?.bbox || []).map(Number);
    const en = georef?.en_el_lienzo;
    if (bbox.length !== 4 || !bbox.every(Number.isFinite) || !en) {
        return { aviso: 'Falta la georreferencia del plano: vuelve a traer la envolvente.' };
    }
    const crs = georef.crs || 'EPSG:25830';
    const rejilla = REJILLAS_PNOA[crs];
    if (!rejilla) {
        return { aviso: `La ortofoto solo está comprobada en la península (husos 29, 30 y 31); `
                      + `este plano está en ${crs}.` };
    }
    if (!(bbox[2] > bbox[0] && bbox[3] > bbox[1])) {
        return { aviso: 'El rectángulo del plano no es válido.' };
    }

    // Del mundo al lienzo: x = X − dx ; y = y0 − Y (ver `lienzoAMundo`). Sale
    // del rectángulo SIN el margen: es el que el motor colocó en el lienzo.
    const dx = bbox[0] - Number(en.x || 0);
    const y0 = bbox[3] + Number(en.y || 0);

    // Lo que se cubre va MÁS ALLÁ del entorno: la pantalla casi nunca tiene su
    // proporción, y sin margen quedaban dos bandas negras a los lados justo al
    // mirar la manzana. En 3D, además, es el suelo que se ve alrededor.
    // Con TOPE: en una comunidad de adosados el entorno ya mide 400 m, y un
    // margen proporcional hacía bajar la foto al nivel 17 (0,6 m/píxel), que
    // ya no enseña una ventana.
    const extra = Math.min(margen * Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]),
                           MARGEN_MAX_M);
    const [oeste, sur, este, norte] = [bbox[0] - extra, bbox[1] - extra,
                                       bbox[2] + extra, bbox[3] + extra];

    for (const nivel of NIVELES) {
        const lado = ladoTesela(nivel);
        const arriba = rejilla.minY + rejilla.filas[nivel] * lado;
        // El `1e-9` evita pedir una columna entera de más cuando el borde del
        // rectángulo cae justo en el de una tesela.
        const c0 = Math.floor((oeste - rejilla.x0) / lado);
        const c1 = Math.floor((este - rejilla.x0) / lado - 1e-9);
        const f0 = Math.floor((arriba - norte) / lado);
        const f1 = Math.floor((arriba - sur) / lado - 1e-9);
        const cuantas = (c1 - c0 + 1) * (f1 - f0 + 1);
        if (cuantas > max && nivel !== NIVELES[NIVELES.length - 1]) continue;
        if (cuantas > max * 2) {
            return { aviso: 'El entorno de este plano es demasiado grande para la ortofoto.' };
        }
        // Un píxel de solape por el lado derecho y el de abajo: sin él, el
        // suavizado del navegador deja una rendija de un píxel entre dos
        // teselas y la foto sale cuadriculada.
        const solape = lado / 256;
        const teselas = [];
        for (let f = f0; f <= f1; f++) {
            for (let c = c0; c <= c1; c++) {
                const X = rejilla.x0 + c * lado;     // esquina superior izquierda
                const Y = arriba - f * lado;
                teselas.push({
                    key: `${crs}/${nivel}/${f}/${c}`,
                    href: urlTesela(crs, nivel, f, c),
                    x: X - dx, y: y0 - Y,
                    ancho: lado + solape, alto: lado + solape,
                });
            }
        }
        return { nivel, lado, crs, teselas };
    }
    return { aviso: 'No se ha podido componer la ortofoto de este plano.' };
}

// ── La FECHA DEL VUELO ───────────────────────────────────────────────────────
// Una ortofoto es de un día concreto, y el PNOA mezcla vuelos de años
// distintos: en una zona puede ser de 2024 y en la de al lado de 2021. Sin la
// fecha, una foto anterior a la ampliación del garaje se lee como que el garaje
// no existe. El IGN la da punto a punto (capa `OI.MosaicElement`), con la
// resolución: medido en Manzanares, «Fecha 2024-06 · Resolucion 0.25».
export const PNOA_WMS = 'https://www.ign.es/wms-inspire/pnoa-ma';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** La petición que da la fecha del vuelo en un punto del LIENZO. */
export function urlFechaVuelo(georef, x, y) {
    const bbox = (georef?.bbox || []).map(Number);
    const en = georef?.en_el_lienzo;
    const crs = georef?.crs || 'EPSG:25830';
    if (bbox.length !== 4 || !bbox.every(Number.isFinite) || !en || !REJILLAS_PNOA[crs]) return null;
    const X = Number(x) + (bbox[0] - Number(en.x || 0));
    const Y = (bbox[3] + Number(en.y || 0)) - Number(y);
    if (!Number.isFinite(X) || !Number.isFinite(Y)) return null;
    // Un cuadrado de 101 × 101 píxeles de un metro con el punto en el centro:
    // en WMS 1.3.0 y un UTM el orden de ejes es este, E-N.
    const b = [X - 50.5, Y - 50.5, X + 50.5, Y + 50.5].map(v => v.toFixed(2)).join(',');
    return `${PNOA_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo`
        + '&LAYERS=OI.MosaicElement&QUERY_LAYERS=OI.MosaicElement&STYLES='
        + `&CRS=${crs}&BBOX=${b}&WIDTH=101&HEIGHT=101&I=50&J=50`
        + '&INFO_FORMAT=application/json&FORMAT=image/png';
}

/** De la respuesta del IGN a `{ fecha: '2024-06', resolucion: 0.25, texto }`. */
export function leerFechaVuelo(json) {
    const p = json?.features?.[0]?.properties || {};
    const m = /^(\d{4})-(\d{2})/.exec(String(p.Fecha || p.fecha || ''));
    if (!m) return null;
    const mes = MESES[Number(m[2]) - 1];
    const resolucion = Number(String(p.Resolucion ?? p.resolucion ?? '').replace(',', '.'));
    return { fecha: `${m[1]}-${m[2]}`,
             resolucion: Number.isFinite(resolucion) && resolucion > 0 ? resolucion : null,
             texto: mes ? `vuelo de ${mes} de ${m[1]}` : `vuelo de ${m[1]}` };
}

// ── De UTM a latitud / longitud, para los enlaces a Google ──────────────────
// Solo para ABRIR otro visor en el sitio: un error de un metro no se nota ahí,
// y no hace falta cargar proj4 en el navegador para esto. Fórmulas de Snyder
// (USGS PP 1395, §8) sobre el elipsoide GRS80, el del ETRS89.
const A = 6378137;
const F = 1 / 298.257222101;
const K0 = 0.9996;

/** El huso de un EPSG UTM (258ZZ ETRS89 · 326ZZ WGS84), o null. */
export function husoDe(crs) {
    const m = /^EPSG:(258|326)(\d\d)$/.exec(String(crs || ''));
    return m ? Number(m[2]) : null;
}

export function utmALatLon(x, y, huso) {
    const e2 = F * (2 - F);
    const ep2 = e2 / (1 - e2);
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const M = y / K0;
    const mu = M / (A * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
    const phi1 = mu
        + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
        + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
        + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
        + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
    const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
    const N1 = A / Math.sqrt(1 - e2 * s * s);
    const T1 = t * t;
    const C1 = ep2 * c * c;
    const R1 = (A * (1 - e2)) / (1 - e2 * s * s) ** 1.5;
    const D = (x - 500000) / (N1 * K0);
    const lat = phi1 - ((N1 * t) / R1) * (
        (D ** 2) / 2
        - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4) / 24
        + ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6) / 720);
    const lon0 = ((huso * 6 - 183) * Math.PI) / 180;
    const lon = lon0 + (
        D
        - ((1 + 2 * T1 + C1) * D ** 3) / 6
        + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5) / 120
    ) / c;
    return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

/** Un punto del LIENZO, en latitud y longitud. */
export function lienzoALatLon(georef, x, y) {
    const bbox = (georef?.bbox || []).map(Number);
    const en = georef?.en_el_lienzo;
    const huso = husoDe(georef?.crs || 'EPSG:25830');
    if (bbox.length !== 4 || !bbox.every(Number.isFinite) || !en || !huso) return null;
    const X = Number(x) + (bbox[0] - Number(en.x || 0));
    const Y = (bbox[3] + Number(en.y || 0)) - Number(y);
    if (!Number.isFinite(X) || !Number.isFinite(Y)) return null;
    return utmALatLon(X, Y, huso);
}

/**
 * Dónde ver el edificio FUERA de la app. Son las URL documentadas de Google
 * Maps (`api=1`), que no cambian de formato, y la búsqueda por coordenadas de
 * Google Earth. Lo que aportan y el plano no puede: el 3D fotogramétrico de
 * Google y, sobre todo, el Street View — la FACHADA, que desde arriba no se ve.
 */
export function enlacesMapas(latlon) {
    if (!latlon || !Number.isFinite(latlon.lat) || !Number.isFinite(latlon.lon)) return [];
    const p = `${latlon.lat.toFixed(6)},${latlon.lon.toFixed(6)}`;
    return [
        { id: 'satelite', etiqueta: 'Google Maps · satélite',
          detalle: 'La vista aérea de Google, con su fecha de vuelo',
          href: `https://www.google.com/maps/@?api=1&map_action=map&center=${p}&zoom=20&basemap=satellite` },
        { id: 'streetview', etiqueta: 'Street View',
          detalle: 'La fachada desde la calle: ventanas, persianas, balcones',
          href: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p}` },
        { id: 'earth', etiqueta: 'Google Earth · 3D',
          detalle: 'El edificio en 3D: Mayús + arrastrar para inclinar la vista',
          href: `https://earth.google.com/web/search/${p}` },
    ];
}

export default { teselasOrtofoto, ladoTesela, urlTesela, utmALatLon, lienzoALatLon,
                 husoDe, enlacesMapas, urlFechaVuelo, leerFechaVuelo,
                 REJILLAS_PNOA, MAX_TESELAS, ATRIBUCION_PNOA };
