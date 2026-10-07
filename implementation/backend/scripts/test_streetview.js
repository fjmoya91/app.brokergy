// Prueba de utils/streetView.js (sin red): lados de una casa y encuadre.
//   node implementation/backend/scripts/test_streetview.js
const assert = require('assert');
const sv = require('../utils/streetView');

// Lienzo con la Y hacia abajo; ref coloca el lienzo en UTM (como el motor).
const ref = { dx: 479200, y0: 4309990 };
// Casa rectangular de 10 × 8 m girada 0°: fachada SUR (y lienzo = 18) en dos
// tramos y dos plantas, NORTE a un PATIO, ESTE y OESTE a la calle.
const muros = [
    { id: 'FBS1', tipo: 'FACHADA', subtipo: 'CALLE', orientacion: 'S', nivel: 0, svg: [[0, 18], [6, 18]] },
    { id: 'FBS2', tipo: 'FACHADA', subtipo: 'CALLE', orientacion: 'S', nivel: 0, svg: [[6, 17], [10, 17]] },
    { id: 'F1S1', tipo: 'FACHADA', subtipo: 'CALLE', orientacion: 'S', nivel: 1, svg: [[0, 18], [10, 18]] },
    { id: 'FBN1', tipo: 'FACHADA', subtipo: 'PATIO', orientacion: 'N', nivel: 0, svg: [[10, 10], [0, 10]] },
    { id: 'FBE1', tipo: 'FACHADA', subtipo: 'CALLE', orientacion: 'E', nivel: 0, svg: [[10, 18], [10, 10]] },
    { id: 'MBO1', tipo: 'MEDIANERA', subtipo: 'EDIFICIO', orientacion: 'O', nivel: 0, svg: [[0, 10], [0, 18]] },
];
const { lados, patios } = sv.ladosDeFachada(muros, ref);
const sur = lados.find(l => l.orientacion === 'S');
assert.ok(sur, 'hay lado sur');
assert.deepStrictEqual(sur.muros.sort(), ['F1S1', 'FBS1', 'FBS2'], 'el retranqueo de 1 m va al mismo lado');
assert.strictEqual(sur.plantas, 2);
assert.ok(Math.abs(sur.ancho - 10) < 0.01, `ancho 10 m (${sur.ancho})`);
assert.ok(sur.normal[1] < -0.99, 'la normal del sur apunta al sur');
assert.deepStrictEqual(patios.map(m => m.id), ['FBN1'], 'el patio va aparte');
assert.ok(!lados.some(l => l.muros.includes('MBO1')), 'una medianera no es un lado');

// Panorama 12 m al sur del centro: de frente y mirando al norte.
const pano = sv.desplazar(sur.centro, sur.normal, 12);
const e = sv.encuadre(sur, pano);
assert.ok(e && e.heading <= 1 || e.heading >= 359, `mira al norte (${e && e.heading})`);
assert.strictEqual(e.oblicuidad, 0);
assert.ok(e.fov > 40 && e.fov < 80, `fov razonable (${e.fov})`);
// Un panorama DETRÁS (al norte de la casa) no vale para la fachada sur.
assert.strictEqual(sv.encuadre(sur, sv.desplazar(sur.centro, sur.normal, -15)), null);

// latLonAUtm es la inversa de utmALatLon (frontend/…/ortofoto.js), huso 30.
(async () => {
    const path = require('path');
    const { pathToFileURL } = require('url');
    const { utmALatLon } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src',
        'features', 'cee-envolvente', 'logic', 'ortofoto.js')).href);
    for (const [X, Y] of [[479240.5, 4309950.2], [430100, 4470300], [380000, 4200000]]) {
        const { lat, lon } = utmALatLon(X, Y, 30);
        const [x, y] = sv.latLonAUtm(lat, lon, 30);
        assert.ok(Math.abs(x - X) < 0.05 && Math.abs(y - Y) < 0.05, `ida y vuelta (${X}, ${Y}) → (${x}, ${y})`);
    }
    console.log('✓ test_streetview: lados, patios, encuadre y UTM');
})().catch((e) => { console.error(e); process.exit(1); });
