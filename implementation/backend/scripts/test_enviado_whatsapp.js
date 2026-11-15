/**
 * El mensaje que acabamos de enviar, buscado en el chat cuando `sendMessage()`
 * no lo devuelve (utils/enviadoWhatsapp.js). Sin WhatsApp: lista simulada.
 *
 *   node implementation/backend/scripts/test_enviado_whatsapp.js
 */
'use strict';
const { elegirEnviado } = require('../utils/enviadoWhatsapp');

let fallos = 0;
const ok = (titulo, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${titulo}`); if (!cond) fallos++; };

const T = 1793892800;
const TEXTO = 'Hola José Ángel. Soy Fran…';
const msgs = [
    // Del chat, pero de ANTES de este envío.
    { id: 'viejo', fromMe: true, remoteUser: '34639330476', t: T - 600, type: 'chat', body: TEXTO },
    // Lo que nos escribe él (no es nuestro).
    { id: 'suyo', fromMe: false, remoteUser: '34639330476', t: T + 1, type: 'chat', body: TEXTO },
    // Nuestro, a OTRO chat, a la vez.
    { id: 'otro', fromMe: true, remoteUser: '34609755363', t: T + 1, type: 'chat', body: TEXTO },
    // El bueno: el chat vive bajo su @lid.
    { id: 'texto-lid', fromMe: true, remoteUser: '223849534759118', t: T + 2, type: 'chat', body: TEXTO },
    // El vídeo, con su pie.
    { id: 'video', fromMe: true, remoteUser: '223849534759118', t: T + 30, type: 'video', caption: 'Te dejo este vídeo' },
];
const usuarios = ['34639330476', '223849534759118'];

ok('texto: el nuestro, de este envío y de ese chat (por su @lid)',
    elegirEnviado(msgs, { usuarios, desde: T, tipo: 'texto', texto: TEXTO }) === 'texto-lid');
ok('texto: con otro cuerpo no se adivina → null',
    elegirEnviado(msgs, { usuarios, desde: T, tipo: 'texto', texto: 'otra cosa' }) === null);
ok('adjunto: el vídeo, aunque haya un texto después del corte',
    elegirEnviado(msgs, { usuarios, desde: T, tipo: 'adjunto', pie: 'Te dejo este vídeo' }) === 'video');
ok('adjunto: con un pie distinto → null',
    elegirEnviado(msgs, { usuarios, desde: T, tipo: 'adjunto', pie: 'Anexo I' }) === null);
ok('adjunto sin pie: vale cualquier adjunto nuestro de ese chat',
    elegirEnviado(msgs, { usuarios, desde: T, tipo: 'adjunto' }) === 'video');
ok('fuera del chat (solo el número del otro) → no coge lo de este',
    elegirEnviado(msgs, { usuarios: ['34609755363'], desde: T, tipo: 'adjunto' }) === null);
ok('de dos iguales, el más reciente',
    elegirEnviado([...msgs, { id: 'texto-2', fromMe: true, remoteUser: '34639330476', t: T + 40, type: 'chat', body: TEXTO }],
        { usuarios, desde: T, tipo: 'texto', texto: TEXTO }) === 'texto-2');
ok('lista vacía o sin criterio → null',
    elegirEnviado([], { usuarios, desde: T, tipo: 'texto', texto: TEXTO }) === null && elegirEnviado(msgs, null) === null);

// Se inyecta por su código fuente en la página: tiene que sobrevivir a eso.
const reconstruida = new Function('return (' + String(elegirEnviado) + ')')();
ok('funciona igual tras pasar por su código fuente (como en la página)',
    reconstruida(msgs, { usuarios, desde: T, tipo: 'texto', texto: TEXTO }) === 'texto-lid');

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
