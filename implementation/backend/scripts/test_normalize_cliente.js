/**
 * Comprueba que TODA escritura a `clientes` deja el dato como lo guarda la app:
 * MAYÚSCULAS, sin espacios sobrantes y con los emails en minúsculas.
 *
 * Nace de la limpieza del 2026-09-15: 72 de 379 fichas tenían el nombre en
 * minúsculas porque las escrituras públicas no pasaban por `normalizeData` y
 * porque `apellidos` caía en su BLACKLIST ('apellIDos' contiene 'id').
 *
 *   node implementation/backend/scripts/test_normalize_cliente.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizeCliente } = require('../utils/normalization');

let fallos = 0;
const test = (nombre, fn) => {
    try { fn(); console.log(`  ✓ ${nombre}`); }
    catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};

console.log('\nnormalizeCliente()');

test('sube el nombre y los APELLIDOS (el que se colaba por la BLACKLIST)', () => {
    const r = normalizeCliente({ nombre_razon_social: 'maría josé ', apellidos: 'bravo bernabeu' });
    assert.strictEqual(r.nombre_razon_social, 'MARÍA JOSÉ');
    assert.strictEqual(r.apellidos, 'BRAVO BERNABEU');
});

test('conserva tildes y Ñ', () => {
    const r = normalizeCliente({ nombre_razon_social: 'Ángel', apellidos: 'Becerra Cañas' });
    assert.strictEqual(r.nombre_razon_social, 'ÁNGEL');
    assert.strictEqual(r.apellidos, 'BECERRA CAÑAS');
});

test('cubre representante, persona de contacto y dirección', () => {
    const r = normalizeCliente({
        representante_nombre: 'begoña', representante_apellidos: 'gonzález sierra',
        representante_dni: '12345678z', persona_contacto_nombre: 'alba (novia)',
        dni: '05678901x', direccion: 'calle real 3', municipio: 'tomelloso',
        provincia: 'ciudad real', ccaa: 'castilla-la mancha', codigo_postal: ' 13700 ',
    });
    assert.strictEqual(r.representante_nombre, 'BEGOÑA');
    assert.strictEqual(r.representante_apellidos, 'GONZÁLEZ SIERRA');
    assert.strictEqual(r.representante_dni, '12345678Z');
    assert.strictEqual(r.persona_contacto_nombre, 'ALBA (NOVIA)');
    assert.strictEqual(r.dni, '05678901X');
    assert.strictEqual(r.direccion, 'CALLE REAL 3');
    assert.strictEqual(r.municipio, 'TOMELLOSO');
    assert.strictEqual(r.provincia, 'CIUDAD REAL');
    assert.strictEqual(r.ccaa, 'CASTILLA-LA MANCHA');
    assert.strictEqual(r.codigo_postal, '13700');
});

test('los EMAIL van en minúsculas (los dos)', () => {
    const r = normalizeCliente({ email: ' Juan@Gmail.COM ', persona_contacto_email: 'A@B.ES' });
    assert.strictEqual(r.email, 'juan@gmail.com');
    assert.strictEqual(r.persona_contacto_email, 'a@b.es');
});

test('el teléfono solo se recorta: ni mayúsculas ni tocar el +34', () => {
    const r = normalizeCliente({ tlf: ' +34 615 49 27 28 ', persona_contacto_tlf: ' 615492728 ' });
    assert.strictEqual(r.tlf, '+34 615 49 27 28');
    assert.strictEqual(r.persona_contacto_tlf, '615492728');
});

test('un UPDATE parcial no inventa claves: undefined sigue ausente', () => {
    const r = normalizeCliente({ apellidos: 'luna' });
    assert.deepStrictEqual(Object.keys(r), ['apellidos']);
    assert.ok(!('nombre_razon_social' in r));
});

test('null sigue siendo null y el vacío NO se vuelve null', () => {
    const r = normalizeCliente({ apellidos: null, nombre_razon_social: '   ' });
    assert.strictEqual(r.apellidos, null);
    assert.strictEqual(r.nombre_razon_social, '');
});

test('no toca lo que no es texto (booleanos, ids, fechas)', () => {
    const r = normalizeCliente({
        es_empresa: true, notificaciones_contacto_activas: false,
        id_cliente: 'a1B2-c3D4', prescriptor_id: 'X9y8',
    });
    assert.strictEqual(r.es_empresa, true);
    assert.strictEqual(r.notificaciones_contacto_activas, false);
    assert.strictEqual(r.id_cliente, 'a1B2-c3D4', 'un UUID no se puede recasear');
    assert.strictEqual(r.prescriptor_id, 'X9y8');
});

test('es IDEMPOTENTE (se puede aplicar encima de una ruta que ya limpió)', () => {
    const una = normalizeCliente({ nombre_razon_social: ' ana ', email: 'A@B.ES', numero_cuenta: 'es12 3456' });
    assert.deepStrictEqual(normalizeCliente(una), una);
});

test('no rompe con null/undefined/array', () => {
    assert.strictEqual(normalizeCliente(null), null);
    assert.strictEqual(normalizeCliente(undefined), undefined);
    assert.deepStrictEqual(normalizeCliente([1]), [1]);
});

test('devuelve una COPIA: no muta el objeto que le pasan', () => {
    const original = { apellidos: 'luna' };
    normalizeCliente(original);
    assert.strictEqual(original.apellidos, 'luna');
});

console.log('\nTodas las escrituras a `clientes` pasan por el helper');

// Red de seguridad: que nadie añada mañana un insert/update crudo.
const raiz = path.join(__dirname, '..');
for (const rel of ['routes/clientes.js', 'routes/public.js', 'services/leadService.js']) {
    test(`${rel} — sin escrituras crudas`, () => {
        const src = fs.readFileSync(path.join(raiz, rel), 'utf8');
        // .insert(x) / .update(x) sobre clientes, con x sin envolver
        const crudas = [...src.matchAll(/\.(insert|update)\(\s*\[?\s*([A-Za-z_$][\w$]*)\s*\]?\s*\)/g)]
            .filter(m => ['payload', 'updates', 'datos', 'patch', 'newCliente', 'clienteUpdate'].includes(m[2]));
        assert.strictEqual(crudas.length, 0,
            `escritura sin normalizeCliente(): .${crudas.map(c => `${c[1]}(${c[2]})`).join(', ')}`);
    });
}

console.log(fallos === 0 ? '\n✅ Todo correcto\n' : `\n❌ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
