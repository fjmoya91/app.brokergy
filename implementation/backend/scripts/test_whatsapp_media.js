/**
 * Pruebas de lo PURO de `services/whatsappMedia.js` — sin WhatsApp ni base de datos.
 *
 *   node implementation/backend/scripts/test_whatsapp_media.js
 *
 * Lo que corre dentro de WhatsApp Web (LEER_CHAT, BAJAR) no se puede probar
 * aquí: se prueba contra la sesión real, en un chat concreto.
 */

const assert = require('assert');
const m = require('../services/whatsappMedia');

let ok = 0;
function prueba(nombre, fn) {
    try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
}

console.log('\nchatDeMsgId — de qué chat es un mensaje');
prueba('número clásico', () => assert.strictEqual(m.chatDeMsgId('false_34612345678@c.us_3EB0C0B5A3B9D3E0A1F2'), '34612345678@c.us'));
prueba('@lid', () => assert.strictEqual(m.chatDeMsgId('false_71159068520593@lid_AC1F2B'), '71159068520593@lid'));
prueba('grupo con participante: el chat es el grupo', () =>
    assert.strictEqual(m.chatDeMsgId('false_120363041234@g.us_3EB0AA_34612345678@c.us'), '120363041234@g.us'));
prueba('basura → null (nunca un chat inventado)', () => {
    assert.strictEqual(m.chatDeMsgId('34612345678@c.us'), null);
    assert.strictEqual(m.chatDeMsgId(''), null);
    assert.strictEqual(m.chatDeMsgId(null), null);
    assert.strictEqual(m.chatDeMsgId('sim_caldera.jpg'), null);
});

console.log('\nnombreArchivo');
prueba('una foto se nombra por su fecha de Madrid', () => {
    // 2026-09-28 09:45:12 UTC = 11:45:12 en Madrid (horario de verano)
    const t = Date.UTC(2026, 8, 28, 9, 45, 12) / 1000;
    assert.strictEqual(m.nombreArchivo({ id: 'false_34612345678@c.us_3EB0C0B5A3', t, mimetype: 'image/jpeg', tipo: 'image' }),
        'WA-20260928-114512-C0B5A3.jpg');
});
prueba('un documento conserva su nombre', () =>
    assert.strictEqual(m.nombreArchivo({ id: 'x', t: 0, mimetype: 'application/pdf', filename: 'Factura 123.pdf', tipo: 'document' }), 'Factura 123.pdf'));
prueba('…y se le añade la extensión si no la trae', () =>
    assert.strictEqual(m.nombreArchivo({ id: 'x', t: 0, mimetype: 'application/pdf', filename: 'presupuesto', tipo: 'document' }), 'presupuesto.pdf'));
prueba('caracteres que Drive o Windows no quieren', () =>
    assert.strictEqual(m.nombreArchivo({ id: 'x', t: 0, mimetype: 'application/pdf', filename: 'a/b:c?.pdf', tipo: 'document' }), 'a_b_c_.pdf'));
prueba('mime con parámetros', () => assert.strictEqual(m.extDeMime('video/mp4; codecs=avc1'), 'mp4'));

console.log('\nfiltrarMedia — qué se ofrece traer');
const ahora = Math.floor(Date.now() / 1000);
const corteSeg = ahora - 30 * 86400;
const crudos = [
    { id: 'false_1@c.us_A', tipo: 'image', t: ahora - 100, mimetype: 'image/jpeg', size: 200_000 },
    { id: 'true_1@c.us_B', tipo: 'image', t: ahora - 90, fromMe: true, mimetype: 'image/jpeg' },
    { id: 'false_1@c.us_C', tipo: 'image', t: corteSeg - 10, mimetype: 'image/jpeg' },
    { id: 'false_1@c.us_D', tipo: 'image', t: ahora - 80, viewOnce: true, mimetype: 'image/jpeg' },
    { id: 'false_1@c.us_E', tipo: 'document', t: ahora - 70, mimetype: 'application/pdf', filename: 'factura.pdf' },
    { id: 'false_1@c.us_F', tipo: 'document', t: ahora - 60, mimetype: 'application/vnd.ms-excel', filename: 'x.xls' },
    { id: 'false_1@c.us_G', tipo: 'document', t: ahora - 50, mimetype: 'image/jpeg', filename: 'IMG_1.jpg' },
    { id: 'false_1@c.us_H', tipo: 'video', t: ahora - 40, mimetype: 'video/mp4', size: 90 * 1024 * 1024 },
    { id: 'false_1@c.us_I', tipo: 'ptt', t: ahora - 30 },
    { tipo: 'image', t: ahora },
];
const fil = m.filtrarMedia(crudos, { corteSeg, tel: '612345678', chatId: '34612345678@c.us', maxBytes: 50 * 1024 * 1024 });
const ids = fil.map(x => x.id.split('_').pop());
prueba('fuera lo nuestro, lo de "ver una vez", lo viejo, lo que no es foto/vídeo/PDF', () =>
    assert.deepStrictEqual(ids.slice().sort(), ['A', 'E', 'G', 'H']));
prueba('lo más reciente primero', () => assert.deepStrictEqual(ids, ['H', 'G', 'E', 'A']));
prueba('un documento con imagen es una FOTO ORIGINAL', () => {
    const g = fil.find(x => x.id.endsWith('_G'));
    assert.strictEqual(g.tipo, 'image');
    assert.strictEqual(g.original, true);
});
prueba('un PDF se llama pdf', () => assert.strictEqual(fil.find(x => x.id.endsWith('_E')).tipo, 'pdf'));
prueba('lo demasiado grande se marca, no se esconde', () => assert.strictEqual(fil.find(x => x.id.endsWith('_H')).grande, true));
prueba('cada una sabe de qué chat sale', () => assert.ok(fil.every(x => x.chatId === '34612345678@c.us' && x.tel === '612345678')));

console.log('\nunirContactos — a quién se busca');
const u = m.unirContactos([
    { tel: '+34 612 345 678', nombre: 'MARÍA LÓPEZ', rol: 'titular', detalle: 'Titular' },
    { tel: '612345678', nombre: 'María', rol: 'vinculo', detalle: 'Vinculado a esta obra a mano', fijado: true },
    { tel: '699000111', nombre: 'Juan (hijo)', rol: 'contacto', detalle: 'Persona de contacto' },
    { tel: '655000222', nombre: 'INSTOTERMA', rol: 'instalador', detalle: 'Teléfono de la empresa' },
    { tel: '699000111', nombre: 'Juan', rol: 'instalador', detalle: 'INSTOTERMA · comercial' },
    { tel: '677000333', rol: 'vinculo', detalle: 'Vinculado por el asistente' },
    { tel: '123', rol: 'titular' },
]);
const porTel = Object.fromEntries(u.map(x => [x.tel, x]));
prueba('el mismo número con y sin prefijo es UN contacto', () => {
    assert.ok(porTel['612345678']);
    assert.strictEqual(u.filter(x => x.tel === '612345678').length, 1);
    assert.deepStrictEqual(porTel['612345678'].roles, ['titular', 'vinculo']);
});
prueba('lo del cliente viene marcado', () => assert.strictEqual(porTel['612345678'].recomendado, true));
prueba('lo del instalador NO viene marcado, y se dice por qué', () => {
    assert.strictEqual(porTel['655000222'].recomendado, false);
    assert.match(porTel['655000222'].aviso, /otras obras/);
});
prueba('número en las DOS fichas: no se marca y se avisa', () => {
    assert.strictEqual(porTel['699000111'].recomendado, false);
    assert.match(porTel['699000111'].aviso, /también es del instalador/);
});
prueba('un vínculo aprendido (no fijado) se ofrece sin marcar', () => {
    assert.strictEqual(porTel['677000333'].recomendado, false);
    assert.strictEqual(porTel['677000333'].nombre, 'Chat vinculado');
});
prueba('un número que no es un teléfono no entra', () => assert.ok(!porTel['123']));
prueba('el titular va primero', () => assert.strictEqual(u[0].tel, '612345678'));

console.log(`\n${ok} pruebas correctas${process.exitCode ? ' · HAY FALLOS' : ''}\n`);
