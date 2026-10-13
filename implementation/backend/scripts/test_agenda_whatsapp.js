// node implementation/backend/scripts/test_agenda_whatsapp.js
// Lo puro de buscar en la agenda de WhatsApp para dar de alta a un cliente.
const assert = require('assert');
const { nombreDeContacto, unirAgenda, filtrarAgenda, codigoObra, obraDelPrefijo } = require('../utils/agendaWhatsapp');
const { leerPrefijo } = require('../utils/nombreContactoCliente');

let n = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// ── El nombre: sin el prefijo de la casa, y el partner aparte ───────────────
eq(nombreDeContacto('RES080_87 Irene Lopez (Gonzagarri)'),
    { completo: 'Irene Lopez', nombre: 'Irene', apellidos: 'Lopez', partner: 'Gonzagarri' });
eq(nombreDeContacto('RES060 - Miguel Angel Buitrago (Inst. Miguelturra)'),
    { completo: 'Miguel Angel Buitrago', nombre: 'Miguel', apellidos: 'Angel Buitrago', partner: 'Inst. Miguelturra' });
eq(nombreDeContacto('CEE_54 Carlos HERNANDO').completo, 'Carlos HERNANDO');
eq(nombreDeContacto('María José García López'),
    { completo: 'María José García López', nombre: 'María José', apellidos: 'García López', partner: null });
eq(nombreDeContacto('Francisca'), { completo: 'Francisca', nombre: 'Francisca', apellidos: '', partner: null });
// Solo el paréntesis: el nombre sale del pushname.
eq(nombreDeContacto('RES060 (Carmelo ARGAMAS Inst. Miguelturra)', 'Carmelo').completo, 'Carmelo');
// Sin agenda: el pushname, sin emojis.
eq(nombreDeContacto(null, 'Pepi 🌻 ').completo, 'Pepi');
// Un nombre que se parece a un prefijo no se toca.
eq(nombreDeContacto('Teresa Alonso Gil').completo, 'Teresa Alonso Gil');

// ── La misma persona por @c.us y por @lid: una sola fila ────────────────────
const unida = unirAgenda([
    { id: '34654547040@c.us', numero: '34654547040', nombre: 'RES080 Irene Lopez', enAgenda: true, chat: false, t: 0 },
    { id: '1234@lid', numero: '34654547040', pushname: 'Irene', enAgenda: false, chat: true, t: 1700000000, etiquetas: ['RES080', 'EN CURSO'] },
    { id: '999@lid', numero: null, pushname: 'Sin número', chat: true, t: 5 },
]);
eq(unida.length, 2);
eq(unida[0], { numero: '34654547040', nombre: 'RES080 Irene Lopez', pushname: 'Irene', enAgenda: true, chat: true, t: 1700000000, etiquetas: ['RES080', 'EN CURSO'] });

// ── Buscar ───────────────────────────────────────────────────────────────────
const agenda = unirAgenda([
    { id: 'a', numero: '34654547040', nombre: 'RES080 Irene López (Gonzagarri)', enAgenda: true, t: 10 },
    { id: 'b', numero: '34600111222', nombre: null, pushname: 'Irene Martín', enAgenda: false, chat: true, t: 99 },
    { id: 'c', numero: '34611222333', nombre: 'Francisca Martínez', enAgenda: true, t: 50 },
    { id: 'd', numero: '34622333444', nombre: 'Fran (cuñado)', enAgenda: true, t: 70 },
]);
// Por palabras, sin tildes; los de la agenda delante aunque el otro sea más reciente.
eq(filtrarAgenda(agenda, 'irene').map(c => c.numero), ['34654547040', '34600111222']);
eq(filtrarAgenda(agenda, 'lopez irene').map(c => c.numero), ['34654547040']);
// Todas las palabras tienen que estar.
eq(filtrarAgenda(agenda, 'irene garcia'), []);
// Por número, con espacios o con el 34.
eq(filtrarAgenda(agenda, '654 54 70').map(c => c.numero), ['34654547040']);
eq(filtrarAgenda(agenda, '+34 611 222 333').map(c => c.numero), ['34611222333']);
// Menos de tres letras: nada (el desplegable no se llena con media agenda).
eq(filtrarAgenda(agenda, 'fr'), []);
// "fran" casa con Francisca y con Fran: los dos en la agenda, primero el más reciente.
eq(filtrarAgenda(agenda, 'fran').map(c => c.numero), ['34622333444', '34611222333']);
// Tope.
eq(filtrarAgenda(agenda, 'irene', 1).length, 1);

// ── Pendientes de alta: qué obra dice el prefijo ────────────────────────────
const obraDe = (nombre) => obraDelPrefijo(leerPrefijo(nombre).prefijo);
eq(obraDe('RES080 Jesús Quero (Foncaman)'), null);
eq(obraDe('CEEI Carmen'), null);
eq(obraDe('RES060_OP212 María (Quero)'), { tipo: 'oportunidad', codigo: 'RES060_OP212' });
eq(obraDe('RES080_93 David Minaya'), { tipo: 'expediente', codigo: 'RES080_93' });
eq(obraDe('26RES080_78 Juan Manuel'), { tipo: 'expediente', codigo: 'RES080_78' });
eq(obraDe('RES060-08 Ruben Casarrubios'), { tipo: 'expediente', codigo: 'RES060_8' });
eq(obraDe('2026CEE_48 - Carlos HERNANDO'), { tipo: 'cee', codigo: 'CEE_48' });
eq(obraDe('CEE_54 Carlos'), { tipo: 'cee', codigo: 'CEE_54' });
// La BD, al mismo formato: así se casan.
eq(codigoObra('26RES060_OP212'), 'RES060_OP212');
eq(codigoObra('25RES060_8'), 'RES060_8');
eq(codigoObra('2026CEE_54'), 'CEE_54');
eq(codigoObra('26TER173_1'), 'TER173_1');
eq(codigoObra('RES060'), null);

// ── Instaladores pendientes: quién parece del ramo ──────────────────────────
const { pareceInstalador, telefonosDeCliente, textoWhatsapp } = require('../utils/agendaWhatsapp');
eq(pareceInstalador({ nombre: 'Inst. Miguelturra Jose' }), true);
eq(pareceInstalador({ nombre: 'Fontanería Ruiz' }), true);
eq(pareceInstalador({ nombre: 'Climatizacion Hermanos Gil' }), true);
eq(pareceInstalador({ nombre: 'Paco', etiquetas: ['INSTALADORES'] }), true);
// Un cliente con el instalador entre paréntesis NO es un instalador.
eq(pareceInstalador({ nombre: 'RES060 Miguel Angel (Inst. Miguelturra)' }), false);
eq(pareceInstalador({ nombre: 'Irene Lopez' }), false);
eq(pareceInstalador({ nombre: 'Instituto Bachillerato' }), false);
// Lo del paréntesis es quién lo trae, y «aerotermia» es lo que quiere un cliente.
eq(pareceInstalador({ nombre: 'Cris Truji (Inst. Miguelturra)' }), false);
eq(pareceInstalador({ nombre: 'Mari Carmen Aerotermia La Solana' }), false);
eq(pareceInstalador({ nombre: 'MALAÑO Jose Vicente (Inst. Bolaños)', etiquetas: ['INSTALADORES'] }), true);
eq(pareceInstalador({ nombre: 'Manuel Sepulveda Instalador (fontaneria Molinilla)' }), true);
eq(pareceInstalador({ nombre: 'Vicente Calefaccion Miguel Gonzalez' }), true);

// ── Teléfonos de una ficha y el texto de búsqueda ───────────────────────────
eq(telefonosDeCliente({ tlf: '654 54 70 40', persona_contacto_tlf: '+34 625096717', copropietarios: [{ tlf: '654547040' }] }),
    [{ via: 'titular', telefono: '654547040' }, { via: 'persona de contacto', telefono: '625096717' }]);
eq(textoWhatsapp([{ nombre: 'RES060_225 Ceferino (ISM)', pushname: 'Cefe' }, { nombre: null, pushname: 'cefe' }]),
    'RES060_225 Ceferino (ISM) · Cefe');
eq(textoWhatsapp([]), null);

// ── Bandeja: ¿pide respuesta? ────────────────────────────────────────────────
const { esCortesia } = require('../utils/bandejaWhatsapp');
for (const t of ['De acuerdo, muchas gracias.', 'Perfecto', 'muchas gracias Fran', '👍', 'Vale gracias!!', 'Ok', 'Gracias a ti 🙏', 'Genial, un saludo'])
    eq(esCortesia({ tipo: 'chat', texto: t }), true, t);
for (const t of ['Me la tiene que pasar José Antonio', '¿Cuándo venís?', 'Vale, pero el lunes no puedo', 'Te mando la factura mañana', 'gracias, ¿y lo del banco?'])
    eq(esCortesia({ tipo: 'chat', texto: t }), false, t);
eq(esCortesia({ tipo: 'sticker', texto: '' }), true);
eq(esCortesia({ tipo: 'image', texto: 'gracias' }), false);   // una foto se mira aunque diga gracias

console.log(`✓ ${n} comprobaciones`);
