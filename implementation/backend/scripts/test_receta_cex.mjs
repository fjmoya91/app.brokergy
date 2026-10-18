// La RECETA del `.cex` y su SELLO (2026-10-15, 26RES060_217).
//
// Sin BD ni red. Comprueba que lo que antes vivía solo en el plan de la skill o
// en la pantalla sale ahora de `ajustes` (la receta que se guarda con el
// trabajo), así que la ventana y la skill componen el MISMO `.cex`:
//   · la aerotermia de la SIMULACIÓN se ofrece y, pedida en la receta, se pone;
//   · las placas de la 2.ª medida suman su inversión SIN hacer «la obra trae
//     placas» (eso solo lo dice `autoconsumo_inversion`);
//   · la HUELLA no cambia con las imágenes del Catastro ni con el orden de las
//     claves, y sí con lo que va al motor.
//
//   node implementation/backend/scripts/test_receta_cex.mjs

import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const F = await import(pathToFileURL(path.join(aqui,
    '../../frontend/src/features/cee-envolvente/logic/fichaCe3x.js')).href);
const require = createRequire(import.meta.url);
process.env.SUPABASE_URL ||= 'http://localhost';
process.env.SUPABASE_SERVICE_KEY ||= 'x';
const { huellaFicha } = require('../services/ceeEnvolventeCex');

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

//: Un expediente SIN aerotermia elegida, con la simulación de 26RES060_217.
const exp = {
    instalacion: { cambio_acs: true, emisor: 'suelo_radiante' },
    oportunidades: { datos_calculo: { inputs: { scopHeating: 5, scopAcs: 3, potenciaBomba: 12,
        changeAcs: true, emitterType: 'suelo_radiante', zona: 'D3' } } },
};

console.log('La aerotermia de la SIMULACIÓN');
t('sin pedirla, la medida no se puede escribir pero se OFRECE', () => {
    const { catalogo } = F.medidasCe3x({ expediente: exp, superficie: 197 });
    const a = catalogo.find(m => m.id === 'aerotermia');
    assert.equal(a.disponible, false);
    assert.equal(a.generica_posible, true);
    assert.equal(a.generica, false);
});
t('pedida (la receta), la medida va con la GENÉRICA', () => {
    const { catalogo, medidas } = F.medidasCe3x({ expediente: exp, superficie: 197, generica: true });
    const a = catalogo.find(m => m.id === 'aerotermia');
    assert.equal(a.disponible, true);
    assert.equal(a.generica, true);
    assert.deepEqual(medidas.map(m => m.id), ['aerotermia']);
});

console.log('La 2.ª medida (aerotermia y DESPUÉS placas)');
t('su inversión cuenta en el conjunto y NO la marca por defecto', () => {
    const { catalogo, medidas } = F.medidasCe3x({
        expediente: exp, superficie: 197, generica: true, autoconsumoKwh: 7446,
        inversionFvSegunda: 6120, elegidas: ['aerotermia', 'aerotermia_fv'] });
    assert.equal(catalogo.find(m => m.id === 'aerotermia').porDefecto, true,
        'sigue siendo la aerotermia la de por defecto: la obra no trae placas');
    assert.equal(catalogo.find(m => m.id === 'aerotermia_fv').porDefecto, false);
    assert.deepEqual(medidas.map(m => m.id), ['aerotermia', 'aerotermia_fv']);
    assert.equal(medidas[1].inversion, (Number(medidas[0].inversion) || 0) + 6120);
});
t('«la obra trae placas» (autoconsumo_inversion) SÍ cambia la de por defecto, como siempre', () => {
    const { catalogo } = F.medidasCe3x({ expediente: exp, superficie: 197, generica: true,
        autoconsumoKwh: 7446, autoconsumoInversion: 6000 });
    assert.equal(catalogo.find(m => m.id === 'aerotermia').porDefecto, false);
    assert.equal(catalogo.find(m => m.id === 'aerotermia_fv').porDefecto, true);
});

console.log('La HUELLA de la receta');
const ficha = {
    generales: { ano_construccion: { valor: 2005 }, foto_edificio: { valor: 'AAAA' }, plano_situacion: { valor: 'BBBB' } },
    medidas: [{ id: 'aerotermia', nombre: 'A', inversion: 10000 }],
    envolvente: { huecos: [{ id: 'V1', ancho: 1.2 }] },
};
t('no cambia con las imágenes del Catastro (la previsualización no las trae)', () => {
    const sin = { ...ficha, generales: { ano_construccion: { valor: 2005 } } };
    assert.equal(huellaFicha(ficha), huellaFicha(sin));
});
t('no cambia con el ORDEN de las claves', () => {
    const otra = { envolvente: ficha.envolvente, medidas: ficha.medidas, generales: { ...ficha.generales } };
    assert.equal(huellaFicha(ficha), huellaFicha(otra));
});
t('SÍ cambia con lo que va al motor: un hueco, una medida', () => {
    assert.notEqual(huellaFicha(ficha),
        huellaFicha({ ...ficha, envolvente: { huecos: [{ id: 'V1', ancho: 1.3 }] } }));
    assert.notEqual(huellaFicha(ficha),
        huellaFicha({ ...ficha, medidas: [...ficha.medidas, { id: 'aerotermia_fv' }] }));
});

console.log(`\n${ok} comprobaciones correctas`);
