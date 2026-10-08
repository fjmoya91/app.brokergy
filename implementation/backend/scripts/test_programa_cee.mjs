// Prueba de `programaCee`: con qué programa —y qué versión— se hizo un .xml de CEE.
// Es la etiqueta «CE3X 2.3 / 3.1 / 3.2» de la rejilla del CEE.
//   node implementation/backend/scripts/test_programa_cee.mjs
import assert from 'node:assert/strict';
import { programaCee, FECHA_CE3X_31, FECHA_CE3X_32 } from '../../frontend/src/features/cee/programaCee.js';

const V23 = '<?xml version="1.0"?><DatosEnergeticosDelEdificio version="2.0"><IdentificacionEdificio>'
    + '<AnoConstruccion>1990</AnoConstruccion><Procedimiento>CEXv2.3</Procedimiento></IdentificacionEdificio>'
    + '<DatosDelCertificador/></DatosEnergeticosDelEdificio>';
const V31 = '<DatosEnergeticosDelEdificio version="3.0"><DatosEdificio/><DatosCertificado><Procedimiento>'
    + '<Nombre>CE3X</Nombre><Version>2026.08.20</Version></Procedimiento></DatosCertificado><Indicadores/>'
    + '</DatosEnergeticosDelEdificio>';

let n = 0;
const ok = (desc, fn) => { fn(); n++; console.log(`  ✓ ${desc}`); };

ok('CE3X 2.3 (esquema v2.0)', () => {
    const p = programaCee(V23);
    assert.equal(p.etiqueta, 'CE3X 2.3'); assert.equal(p.esquema, '2.0'); assert.equal(p.tono, 'anterior');
});
ok('el .xml de la BD va en MAYÚSCULAS y se lee igual', () => {
    assert.equal(programaCee(V23.toUpperCase()).etiqueta, 'CE3X 2.3');
    assert.equal(programaCee(V31.toUpperCase()).etiqueta, 'CE3X 3.1');
});
ok('CE3X 3.1: su <Version> es una FECHA, no la versión (no sale «2026.08»)', () => {
    const p = programaCee(V31);
    assert.equal(p.etiqueta, 'CE3X 3.1'); assert.equal(p.esquema, '3.0'); assert.equal(p.tono, 'actual');
});
ok(`una 2.3 emitida desde el ${FECHA_CE3X_31} sale en ámbar; antes, no`, () => {
    assert.equal(programaCee(V23, { fechaEmision: '2026-10-02' }).tono, 'aviso');
    assert.equal(programaCee(V23, { fechaEmision: '2026-09-30' }).tono, 'anterior');
    assert.equal(programaCee(V31, { fechaEmision: '2026-10-02' }).tono, 'actual');
});
ok('CE3X 3.2: el mismo esquema v3.0, con su compilación (2026.10.05)', () => {
    const V32 = V31.replace('2026.08.20', '2026.10.05');
    const p = programaCee(V32, { fechaEmision: '2026-10-09' });
    assert.equal(p.etiqueta, 'CE3X 3.2'); assert.equal(p.esquema, '3.0'); assert.equal(p.tono, 'actual');
    assert.equal(programaCee(V32.toUpperCase()).etiqueta, 'CE3X 3.2');
});
ok(`una 3.1 emitida desde el ${FECHA_CE3X_32} sale en ámbar; antes, no`, () => {
    const p = programaCee(V31, { fechaEmision: '2026-10-09' });
    assert.equal(p.tono, 'aviso'); assert.match(p.titulo, /CE3X 3\.2/);
    assert.equal(programaCee(V31, { fechaEmision: '2026-10-07' }).tono, 'actual');
});
ok('otro programa: se nombra, no se le inventa versión', () => {
    const p = programaCee('<DatosEnergeticosDelEdificio version="2.0"><IdentificacionEdificio><Procedimiento>HULC 2.0'
        + '</Procedimiento></IdentificacionEdificio></DatosEnergeticosDelEdificio>');
    assert.equal(p.etiqueta, 'HULC'); assert.equal(p.version, null); assert.equal(p.tono, 'otro');
});
ok('sin .xml no hay etiqueta; con lo leído (v3.0) sí', () => {
    assert.equal(programaCee(null), null);
    assert.equal(programaCee(''), null);
    assert.equal(programaCee(null, { parsed: { version: '3.0' } }).etiqueta, 'CE3X 3.1');
});

console.log(`\n${n} comprobaciones ✓`);
