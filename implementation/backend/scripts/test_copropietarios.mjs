// ─── Los OTROS propietarios de una vivienda ──────────────────────────────────
//
// Dos cosas que no se ven mirando la pantalla y que, si se rompen, se rompen en
// silencio:
//
//  1. El SANEADO (`normalizeCliente`): es lo único que hay entre un formulario y
//     una columna que después se lee en cuatro popups de envío.
//
//  2. Que los DOS ESPEJOS digan lo mismo — `clienteContacts` (frontend, lo que se
//     enseña y se marca) y `contactosDeCliente` (backend, lo que se manda). Si
//     los ids no coinciden, el popup marca a uno y el envío sale a otro; y esa
//     divergencia no falla: entrega el mensaje a quien no era.
//
//     node implementation/backend/scripts/test_copropietarios.mjs

import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeCliente, sanearCopropietarios } = require('../utils/normalization');
const { contactosDeCliente } = require('../services/notifyContacts');
const { clienteContacts } = await import('../../frontend/src/features/expedientes/utils/docContacts.js');

let n = 0;
const test = (nombre, fn) => { fn(); n++; console.log(`  ✓ ${nombre}`); };

console.log('\n── Saneado ───────────────────────────────────────────────────');

test('nombre, apellidos y DNI en MAYÚSCULAS; el email en minúsculas', () => {
    const [c] = sanearCopropietarios([
        { nombre: ' carlos ', apellidos: 'poveda ochoa', dni: '12345678z', email: ' Carlos@Gmail.COM ', tlf: ' 600 11 22 33 ' },
    ]);
    assert.strictEqual(c.nombre, 'CARLOS');
    assert.strictEqual(c.apellidos, 'POVEDA OCHOA');
    assert.strictEqual(c.dni, '12345678Z');
    assert.strictEqual(c.email, 'carlos@gmail.com');
    assert.strictEqual(c.tlf, '600 11 22 33');
});

test('una fila sin nombre y sin ningún canal NO es nadie: se descarta', () => {
    assert.strictEqual(sanearCopropietarios([{ nombre: '', email: '', tlf: '' }]).length, 0);
    assert.strictEqual(sanearCopropietarios([{ dni: '12345678Z' }]).length, 0);
    // Con solo el teléfono sí entra: hay a quién escribir.
    assert.strictEqual(sanearCopropietarios([{ tlf: '600112233' }]).length, 1);
});

test('solo se guardan las claves CONOCIDAS', () => {
    const [c] = sanearCopropietarios([{ nombre: 'ANA', rol: 'ADMIN', numero_cuenta: 'ES00', __proto__: {} }]);
    assert.deepStrictEqual(Object.keys(c).sort(), ['apellidos', 'dni', 'email', 'es_empresa', 'id', 'nombre', 'tlf']);
});

test('llega como texto JSON (que es como sale de un formulario)', () => {
    const l = sanearCopropietarios(JSON.stringify([{ nombre: 'ana', tlf: '600' }]));
    assert.strictEqual(l[0].nombre, 'ANA');
    // Y lo que no es una lista no tumba nada.
    assert.deepStrictEqual(sanearCopropietarios('{'), []);
    assert.deepStrictEqual(sanearCopropietarios(null), []);
    assert.deepStrictEqual(sanearCopropietarios({ nombre: 'ANA' }), []);
});

test('el id que ya tiene se conserva; el que falta se inventa una sola vez', () => {
    const [a] = sanearCopropietarios([{ id: 'cop-1', nombre: 'ANA' }]);
    assert.strictEqual(a.id, 'cop-1');
    const [b] = sanearCopropietarios([{ nombre: 'ANA' }]);
    assert.ok(b.id, 'tiene que salir con id');
    // Y al volver a sanear lo ya saneado no cambia (los guardados se encadenan).
    assert.strictEqual(sanearCopropietarios([b])[0].id, b.id);
});

test('tope de 5: esto es una ficha de cliente, no un buzón de correo', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => ({ nombre: `P${i}`, tlf: '600' }));
    assert.strictEqual(sanearCopropietarios(muchos).length, 5);
});

test('normalizeCliente lo aplica solo si viene (los UPDATE son parciales)', () => {
    assert.strictEqual(normalizeCliente({ dni: 'x' }).copropietarios, undefined);
    assert.deepStrictEqual(normalizeCliente({ copropietarios: [] }).copropietarios, []);
    assert.strictEqual(normalizeCliente({ copropietarios: [{ nombre: 'ana', tlf: '600' }] }).copropietarios[0].nombre, 'ANA');
});

console.log('\n── Los dos espejos dicen lo mismo ────────────────────────────');

const CLI = {
    nombre_razon_social: 'MÓNICA', apellidos: 'CASTELLANOS SÁNCHEZ',
    tlf: '600111222', email: 'monica@ejemplo.es',
    copropietarios: [
        { id: 'a', nombre: 'CARLOS', apellidos: 'POVEDA OCHOA', dni: '11111111H', tlf: '600333444', email: 'carlos@ejemplo.es' },
        { id: 'b', nombre: 'SIN CANAL' },                       // no se ofrece
        { id: 'c', es_empresa: true, nombre: 'INMUEBLES SL', tlf: '900000000' },
    ],
    persona_contacto_nombre: 'JUAN ANTONIO', persona_contacto_tlf: '600555666',
};

test('el ORDEN es titular → propietarios → persona de contacto', () => {
    const ids = clienteContacts(CLI).map(c => c.id);
    assert.deepStrictEqual(ids, ['cli', 'cop0', 'cop2', 'cli_contacto']);
});

test('quien no tiene NI teléfono NI email no sale (no se puede marcar)', () => {
    assert.ok(!clienteContacts(CLI).some(c => (c.label || '').includes('SIN CANAL')));
    assert.ok(!contactosDeCliente(CLI).some(c => (c.nombre || '').includes('SIN CANAL')));
});

test('el índice del id es el de la LISTA ORIGINAL, no el de los ofrecidos', () => {
    // La empresa es la 3ª del array y se ofrece la 2ª: su id tiene que seguir
    // siendo `cop2`, o quitar a alguien de en medio reasignaría destinatarios.
    const empresa = clienteContacts(CLI).find(c => c.label === 'INMUEBLES SL');
    assert.strictEqual(empresa.id, 'cop2');
    assert.strictEqual(contactosDeCliente(CLI).find(c => c.nombre === 'INMUEBLES SL').id, 'cop2');
});

test('frontend y backend: mismos ids, mismos nombres y mismos canales', () => {
    const front = clienteContacts(CLI);
    const back = contactosDeCliente(CLI);
    assert.strictEqual(front.length, back.length);
    front.forEach((f, i) => {
        const b = back[i];
        assert.strictEqual(f.id, b.id, `id de ${f.label}`);
        assert.strictEqual(f.label, b.nombre, `nombre de ${f.id}`);
        assert.strictEqual(f.saludo, b.saludo, `saludo de ${f.id}`);
        assert.strictEqual(f.sublabel, b.tipo, `rótulo de ${f.id}`);
        assert.strictEqual(f.phone, b.tlf, `teléfono de ${f.id}`);
        assert.strictEqual(f.email, b.email, `email de ${f.id}`);
    });
});

test('una sociedad no arrastra apellidos a su rótulo', () => {
    const cli = { ...CLI, copropietarios: [{ id: 'x', es_empresa: true, nombre: 'INMUEBLES SL', apellidos: 'NO DEBERÍA', tlf: '900' }] };
    assert.strictEqual(clienteContacts(cli).find(c => c.id === 'cop0').label, 'INMUEBLES SL');
});

test('una ficha SIN copropietarios se comporta exactamente como antes', () => {
    const cli = { nombre_razon_social: 'MÓNICA', apellidos: 'CASTELLANOS', tlf: '600111222' };
    assert.deepStrictEqual(clienteContacts(cli).map(c => c.id), ['cli']);
    assert.deepStrictEqual(clienteContacts({ ...cli, copropietarios: null }).map(c => c.id), ['cli']);
    assert.deepStrictEqual(contactosDeCliente(cli).map(c => c.id), ['cli']);
});

console.log(`\n✅ ${n} comprobaciones\n`);
