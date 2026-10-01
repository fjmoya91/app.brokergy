// La ORTOFOTO bajo el plano de la envolvente: rejilla de teselas del PNOA y el
// paso de UTM a latitud/longitud para los enlaces a Google.
//
//   node implementation/backend/scripts/test_ortofoto.mjs
//
// Sin red: comprueba contra lo que se MIDIÓ el 30/09/2026 (la tesela que salió
// byte a byte igual que la WMS del mismo rectángulo) y contra proj4.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const proj4 = require(path.join(aqui, '..', 'node_modules', 'proj4'));
const {
    teselasOrtofoto, ladoTesela, utmALatLon, lienzoALatLon, husoDe, enlacesMapas,
    urlFechaVuelo, leerFechaVuelo, REJILLAS_PNOA, MAX_TESELAS,
} = await import('../../frontend/src/features/cee-envolvente/logic/ortofoto.js');
const { lienzoAMundo } = await import('../../frontend/src/features/cee-envolvente/logic/geometriaPlano.js');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };
const cerca = (a, b, tol) => Math.abs(a - b) <= tol;

// Un georef como el que devuelve el motor: el entorno de 26RES060_186, de
// Tomelloso. El lienzo pone el entorno en (−12, −9) y mide 80 × 60 m.
const georef = {
    crs: 'EPSG:25830',
    bbox: [498000, 4334240, 498080, 4334300],
    en_el_lienzo: { x: -12, y: -9, ancho: 80, alto: 60 },
};

// 1 · El lado de una tesela.
ok(cerca(ladoTesela(19), 38.21851415, 1e-6), 'nivel 19: 38,22 m de lado (0,149 m/píxel)');
ok(cerca(ladoTesela(18), 76.43702830, 1e-6), 'nivel 18: 76,44 m de lado');

// 2 · La tesela MEDIDA: col 64528, fila 76854 del nivel 19 salió idéntica a la
//     WMS del rectángulo [498007.186, 4334248.095, 498045.405, 4334286.313].
const r = teselasOrtofoto(georef);
ok(r.nivel === 19 && r.teselas.length > 0, `nivel 19 para un entorno de 80 × 60 m (${r.teselas?.length} teselas)`);
const medida = r.teselas.find(t => t.key === 'EPSG:25830/19/76854/64528');
ok(!!medida, 'incluye la tesela 76854/64528 medida contra la WMS');
if (medida) {
    // Su esquina, de vuelta al mundo con la MISMA traslación que usa la app.
    const t = lienzoAMundo(georef);
    const X = medida.x + t.dx, Y = t.y0 - medida.y;
    ok(cerca(X, 498007.186, 0.01), `su oeste cae en 498007,19 (sale ${X.toFixed(3)})`);
    ok(cerca(Y, 4334286.313, 0.15), `su norte cae en 4334286,31 ±0,15 (sale ${Y.toFixed(3)})`);
    ok(medida.href.includes('TILEMATRIX=19&TILEROW=76854&TILECOL=64528'), 'la URL pide esa tesela');
}

// 3 · Cubren el rectángulo entero, sin huecos.
const xs = r.teselas.map(t => t.x), ys = r.teselas.map(t => t.y);
const lado = ladoTesela(r.nivel);
ok(Math.min(...xs) <= -12 && Math.max(...xs) + lado >= 68, 'cubren el entorno de oeste a este');
ok(Math.min(...ys) <= -9 && Math.max(...ys) + lado >= 51, 'cubren el entorno de norte a sur');
ok(r.teselas.every(t => t.ancho > lado), 'cada tesela solapa un píxel (sin rendijas)');

// 4 · Un entorno grande baja de nivel en vez de pedir cien teselas.
const grande = teselasOrtofoto({ ...georef, bbox: [497800, 4334000, 498200, 4334400],
                                 en_el_lienzo: { x: 0, y: 0, ancho: 400, alto: 400 } });
ok(grande.nivel === 18 && grande.teselas.length <= MAX_TESELAS,
   `400 × 400 m (una comunidad de adosados) → nivel 18, el nativo del PNOA, con ${grande.teselas?.length} teselas`);

// 4b · Y el de una casa cubre MÁS que el entorno (sin bandas negras al mirarlo).
const cubre = r.teselas.reduce((a, t) => ({
    x0: Math.min(a.x0, t.x), y0: Math.min(a.y0, t.y),
    x1: Math.max(a.x1, t.x + lado), y1: Math.max(a.y1, t.y + lado) }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
ok(cubre.x0 <= -12 - 30 && cubre.x1 >= 68 + 30 && cubre.y0 <= -9 - 30 && cubre.y1 >= 51 + 30,
   `cubre 40 m más allá del entorno por cada lado (${r.teselas.length} teselas)`);

// 5 · Lo que no se ha comprobado no se ofrece.
ok(!!teselasOrtofoto({ ...georef, crs: 'EPSG:25828' }).aviso, 'Canarias (25828): aviso, sin teselas');
ok(!!teselasOrtofoto({ crs: 'EPSG:25830' }).aviso, 'sin bbox: aviso, no lanza');
ok(Object.keys(REJILLAS_PNOA).join() === 'EPSG:25829,EPSG:25830,EPSG:25831', 'husos 29, 30 y 31');

// 6 · UTM → lat/lon, contra proj4, en los tres husos.
for (const [huso, X, Y] of [[30, 498030.1, 4334277.2], [31, 430500, 4582000], [29, 537200, 4747400]]) {
    const def = `+proj=utm +zone=${huso} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
    const [lon, lat] = proj4(def, 'EPSG:4326', [X, Y]);
    const p = utmALatLon(X, Y, huso);
    // 1e-6° son ~10 cm: sobra para abrir otro visor en el sitio.
    ok(cerca(p.lat, lat, 1e-6) && cerca(p.lon, lon, 1e-6),
       `huso ${huso}: ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)} = proj4`);
}
ok(husoDe('EPSG:25830') === 30 && husoDe('EPSG:32628') === 28 && husoDe('EPSG:3857') === null, 'huso del EPSG');

// 7 · Un punto del lienzo → lat/lon, y los enlaces.
const ll = lienzoALatLon(georef, 28, 21);   // (28, 21) del lienzo = (498040, 4334270)
const [lonRef, latRef] = proj4('+proj=utm +zone=30 +ellps=GRS80 +units=m +no_defs',
                               'EPSG:4326', [498040, 4334270]);
ok(ll && cerca(ll.lat, latRef, 1e-6) && cerca(ll.lon, lonRef, 1e-6), 'lienzo → lat/lon');
const enlaces = enlacesMapas(ll);
ok(enlaces.length === 3 && enlaces.every(e => e.href.startsWith('https://')), 'tres enlaces https');
ok(enlaces.find(e => e.id === 'streetview').href.includes('map_action=pano'), 'Street View por la URL documentada');
ok(enlacesMapas(null).length === 0, 'sin coordenadas, sin enlaces');

// 8 · La fecha del vuelo: la petición, centrada en el punto, y la respuesta
//     REAL del IGN en Manzanares (30/09/2026).
const u = urlFechaVuelo(georef, 28, 21);
ok(u && u.includes('QUERY_LAYERS=OI.MosaicElement') && u.includes('I=50&J=50')
   && u.includes('BBOX=497989.50,4334219.50,498090.50,4334320.50'),
   'GetFeatureInfo centrado en (498040, 4334270)');
ok(urlFechaVuelo({ ...georef, crs: 'EPSG:25828' }, 0, 0) === null, 'fuera de los husos comprobados: nada');
const respuesta = { type: 'FeatureCollection', features: [
    { type: 'Feature', id: '', geometry: null, properties: { Fecha: '2024-06', Resolucion: '0.25' } }] };
const v = leerFechaVuelo(respuesta);
ok(v?.fecha === '2024-06' && v.resolucion === 0.25 && v.texto === 'vuelo de junio de 2024',
   `se lee «${v?.texto}» · ${v?.resolucion} m/píxel`);
ok(leerFechaVuelo({ features: [] }) === null && leerFechaVuelo(null) === null, 'sin fecha: null, no lanza');

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
