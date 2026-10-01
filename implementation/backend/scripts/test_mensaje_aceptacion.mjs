// Prueba del enlace para ACEPTAR la propuesta, que va en un mensaje APARTE.
//
//   node implementation/backend/scripts/test_mensaje_aceptacion.mjs
//
// Comprueba el texto (fuente única: logic/mensajeAceptacion.js) y que ninguna de
// las ocho variantes del mensaje de la propuesta vuelva a llevar el enlace
// dentro: a mitad del texto no lo veía nadie.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const front = path.resolve(aqui, '../../frontend/src/features/calculator');
const { lineaEnlaceDebajo, mensajeAceptacion, esB2B } = await import(
    'file://' + path.join(front, 'logic/mensajeAceptacion.js').replace(/\\/g, '/')
);

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };
const URL = 'https://app.brokergy.es/firma/10c53708-843f-44a4-bfc6-032381649973';

console.log('Mensaje de aceptación');
t('cliente: el enlace va SOLO en su línea', () => {
    const m = mensajeAceptacion({ url: URL });
    assert.ok(m.split('\n').includes(URL));
    assert.match(m, /Para aceptar la propuesta/);
    assert.doesNotMatch(m, /el cliente/i);
});
t('partner: en tercera persona, para poder reenviarlo tal cual', () => {
    const m = mensajeAceptacion({ url: URL, b2b: true });
    assert.ok(m.split('\n').includes(URL));
    assert.match(m, /el cliente/);
    assert.doesNotMatch(m, /\btus datos\b|\bpulsa\b/);
});
t('sin enlace no hay mensaje', () => {
    assert.equal(mensajeAceptacion({ url: '' }), '');
    assert.equal(mensajeAceptacion({}), '');
});
t('la línea que lo anuncia vale para WhatsApp y email ("más abajo")', () => {
    for (const b2b of [false, true]) {
        const l = lineaEnlaceDebajo({ b2b });
        assert.match(l, /Más abajo/);
        assert.doesNotMatch(l, /mensaje/i);
        assert.doesNotMatch(l, /https?:/);
    }
});
t('esB2B', () => {
    assert.equal(esB2B('PARTNER'), true);
    assert.equal(esB2B('INSTALADOR'), true);
    assert.equal(esB2B('CLIENTE'), false);
});

console.log('Plantillas del mensaje de la propuesta (ProposalModal)');
t('ninguna de las 8 variantes lleva el enlace dentro', () => {
    const src = fs.readFileSync(path.join(front, 'components/ProposalModal.jsx'), 'utf8');
    const ini = src.indexOf('const buildCaptionBase = useCallback(');
    const fin = src.indexOf('const buildAceptacion = useCallback(', ini);
    assert.ok(ini > 0 && fin > ini, 'no encuentro buildCaptionBase / buildAceptacion');
    const tramo = src.slice(ini, fin);
    assert.doesNotMatch(tramo, /firma\/\$\{urlId\}/);
    assert.equal((tramo.match(/\$\{enlaceDebajo\}/g) || []).length, 8);
});

console.log(`\n${ok} comprobaciones correctas.`);
