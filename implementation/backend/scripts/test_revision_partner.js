// Pruebas del cierre de «Solicitar revisión» del partner (services/revisionPartner.js).
// Solo lo PURO: el texto del WhatsApp al partner. No toca la BD ni envía nada.
//   node implementation/backend/scripts/test_revision_partner.js
'use strict';
process.env.FRONTEND_URL = 'http://localhost:5173'; // como en el PC: el enlace tiene que ir a producción
const { textoAvisoPartner, APP } = require('../services/revisionPartner');

let ok = 0, ko = 0;
const prueba = (nombre, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
    else { ko++; console.log(`  ✗ ${nombre}${extra ? `\n      ${extra}` : ''}`); }
};
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const base = { nombre: 'Pepe', id: '26RES060_OP123', direccion: 'CL EJEMPLO 12, TOMELLOSO' };
const sube = textoAvisoPartner({ ...base, antes: 2640, despues: 3120 });
const igual = textoAvisoPartner({ ...base, antes: 2640, despues: 2640 });
const baja = textoAvisoPartner({ ...base, antes: 2640, despues: 2100 });
const sinNombre = textoAvisoPartner({ id: '26RES060_OP9', antes: 1000, despues: 1500 });

console.log('Aviso al partner');
prueba('sube: dice de cuánto a cuánto', sube.includes('sube de 2.640 € (estimado) a *3.120 €*'), sube);
prueba('igual: se queda en la cifra', igual.includes('se queda en *2.640 €*'), igual);
prueba('baja: la cifra nueva y la estimación', baja.includes('queda en *2.100 €*') && baja.includes('la estimación era 2.640 €'), baja);
prueba('saluda por el nombre', sube.startsWith('Hola Pepe,'));
prueba('sin nombre, «Hola,»', sinNombre.startsWith('Hola,'));
prueba('lleva el número y la dirección', sube.includes('*26RES060_OP123*') && sube.includes('(CL EJEMPLO 12, TOMELLOSO)'));
prueba('el enlace va a PRODUCCIÓN aunque FRONTEND_URL sea localhost', APP() === 'https://app.brokergy.es' && sube.includes('https://app.brokergy.es/?op=26RES060_OP123'));
prueba('sin emojis (regla de la casa)', ![sube, igual, baja, sinNombre].some(t => EMOJI.test(t)));
prueba('no habla de comisión ni de margen', ![sube, igual, baja].some(t => /comisi|margen/i.test(t)));

process.env.FRONTEND_URL = 'https://app.brokergy.es/';
prueba('con FRONTEND_URL de producción, sin barra doble', textoAvisoPartner({ ...base, antes: 1, despues: 2 }).includes('https://app.brokergy.es/?op='));

console.log(`\n${ok} bien, ${ko} mal`);
process.exit(ko ? 1 : 0);
