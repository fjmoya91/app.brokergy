// Prueba de lo determinista de los códigos CAE (sin BD, sin red).
//   node implementation/backend/scripts/test_codigos_cae.js
const assert = require('assert');
const { normalizarCodigoCae, contarRangoCae, comprobarRangoCae } = require('../utils/codigosCae');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// El caso real: LOTE-2026-004, resolución de inscripción de 300.828 CAE.
const INI = 'CAE_008569324655_311229';
const FIN = 'CAE_008569625482_311229';

ok(normalizarCodigoCae(INI) === INI, 'canónico tal cual');
ok(normalizarCodigoCae(' cae 008569324655 311229 ') === INI, 'con espacios y en minúscula');
ok(normalizarCodigoCae('desde el código: CAE-008569324655-311229.') === INI, 'con guiones y en una frase');
ok(normalizarCodigoCae('CAE_8569324655_311229') === null, 'sin ceros a la izquierda NO es un código (no se completa)');
ok(normalizarCodigoCae('CAE_00856932465O_311229') === null, 'una letra donde va una cifra no se corrige');
ok(normalizarCodigoCae(null) === null && normalizarCodigoCae('') === null, 'vacío');

ok(contarRangoCae(INI, FIN) === 300828, 'el rango cubre 300.828');
ok(contarRangoCae(INI, INI) === 1, 'un solo código');
ok(contarRangoCae(FIN, INI) === null, 'cruzados');
ok(contarRangoCae(INI, 'CAE_008569625482_311228') === null, 'sufijos distintos');

let r = comprobarRangoCae({ cae_inicial: INI, cae_final: FIN, total: 300828 }, { esperado: 300828 });
ok(r.avisos.length === 0 && r.rango === 300828, 'cuadra todo: sin avisos');

r = comprobarRangoCae({ cae_inicial: INI, cae_final: 'CAE_008569625483_311229', total: 300828 });
ok(r.avisos.some(a => a.includes('algún dígito')), 'un dígito mal leído se avisa');

r = comprobarRangoCae({ cae_inicial: INI, cae_final: FIN, total: 300828 }, { esperado: 300339 });
ok(r.avisos.some(a => a.includes('ahorro verificado')), 'no casa con el ahorro verificado');

r = comprobarRangoCae({ cae_inicial: INI, cae_final: null, total: 300828 });
ok(r.avisos.some(a => a.includes('CAE final')) && r.rango === null, 'falta el final');

r = comprobarRangoCae({ cae_inicial: FIN, cae_final: INI });
ok(r.avisos.some(a => a.includes('cruzados')), 'cruzados se avisa');

console.log(`✓ ${n} comprobaciones`);
