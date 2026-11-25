// Prueba sin BD de utils/solicitudesPartner.js — varios instaladores piden la misma obra.
//   node implementation/backend/scripts/test_solicitudes_partner.js
const assert = require('assert');
const {
    partnerDeVersion, partnerDePropuesta, comprobarBonoIgual, versionesPorPartner, listaConImplicito,
} = require('../utils/solicitudesPartner');

const SANTOS = '34d8a4f0-f67c-46c1-8f3f-757a561c2f12';
const ISM = 'cd84a2d4-cbbe-4605-b52d-502952bd465a';
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// Una versión sin marca es del partner de la oportunidad.
ok(partnerDeVersion({ v: 1 }, SANTOS.toUpperCase()) === SANTOS, 'sin marca → partner de la oportunidad, en minúscula');
ok(partnerDeVersion({ v: 2, partner_id: ISM }, SANTOS) === ISM, 'con marca → la marca');
ok(partnerDePropuesta({ partner_propuesta_id: ISM }, SANTOS) === ISM, 'el elegido en la calculadora manda');
ok(partnerDePropuesta({}, SANTOS) === SANTOS, 'sin elegir → el de la oportunidad');

// 26RES060_OP360: v1 a SANTOS con 4.374 €.
const versiones = [{ v: 1, importes: { rama: 'aerotermia', caeBonus: 4374, inversion: 15000 }, destinatarios: [{ modo: 'PARTNER' }], canales: ['email', 'whatsapp'] }];

ok(comprobarBonoIgual({ versiones, prescriptorIdOp: SANTOS, partnerId: ISM, importes: { rama: 'aerotermia', caeBonus: 4374, inversion: 11868.7 } }) === null,
    'mismo bono y otro presupuesto → pasa');
ok(comprobarBonoIgual({ versiones, prescriptorIdOp: SANTOS, partnerId: ISM, importes: { rama: 'aerotermia', caeBonus: 4374.6 } }) === null,
    'menos de 1 € de diferencia es la misma cifra');
const f = comprobarBonoIgual({ versiones, prescriptorIdOp: SANTOS, partnerId: ISM, importes: { rama: 'aerotermia', caeBonus: 3900 } });
ok(f && f.code === 'BONO_DISTINTO' && f.diferencias[0].suyo === 4374 && f.diferencias[0].ahora === 3900, 'bono distinto → BONO_DISTINTO');
ok(/v1/.test(f.mensaje) && /4\.374 €/.test(f.mensaje), 'el mensaje dice la versión y la cifra');
ok(comprobarBonoIgual({ versiones, prescriptorIdOp: SANTOS, partnerId: SANTOS, importes: { rama: 'aerotermia', caeBonus: 3900 } }) === null,
    'a UNO MISMO se le puede mandar una versión corregida');
ok(comprobarBonoIgual({ versiones: [], prescriptorIdOp: SANTOS, partnerId: ISM, importes: { caeBonus: 1 } }) === null,
    'sin versiones previas no hay con qué comparar');

// Solo opción con opción: la reforma de una comparativa frente a la reforma.
const comp = [{ v: 1, importes: { rama: 'comparativa', caeBonus: 2000, reforma: { caeBonus: 5000 } } }];
ok(comprobarBonoIgual({ versiones: comp, prescriptorIdOp: SANTOS, partnerId: ISM, importes: { rama: 'reforma', caeBonus: 5000 } }) === null,
    'solo reforma frente a la reforma de la comparativa: igual');
ok(comprobarBonoIgual({ versiones: comp, prescriptorIdOp: SANTOS, partnerId: ISM, importes: { rama: 'reforma', caeBonus: 4800 } })?.diferencias[0].opcion === 'reforma',
    'la reforma distinta se detecta como reforma');

// Se compara con la ÚLTIMA versión de cada otro instalador.
const dos = [...versiones, { v: 2, partner_id: SANTOS, importes: { rama: 'aerotermia', caeBonus: 4500 } }];
ok(comprobarBonoIgual({ versiones: dos, prescriptorIdOp: SANTOS, partnerId: ISM, importes: { rama: 'aerotermia', caeBonus: 4500 } }) === null,
    'la última de SANTOS (v2) es la que cuenta');

// Versiones por instalador.
const pp = versionesPorPartner([...versiones, { v: 2, partner_id: ISM, importes: { caeBonus: 4374, inversion: 11868.7 }, destinatarios: [{ modo: 'CLIENTE' }, { modo: 'PARTNER' }], canales: ['whatsapp'] }], SANTOS);
ok(pp[SANTOS].length === 1 && pp[SANTOS][0].a[0] === 'PARTNER', 'v1 → SANTOS');
ok(pp[ISM].length === 1 && pp[ISM][0].v === 2 && pp[ISM][0].a.join() === 'CLIENTE,PARTNER', 'v2 → ISM, al cliente y al partner');

// Sin filas, el partner de la oportunidad es el 1º implícito.
const imp = listaConImplicito([], { prescriptorIdOp: SANTOS, creadaAt: '2026-10-31', presupuestoOp: 15000, estimadoOp: true });
ok(imp.length === 1 && imp[0].implicito && imp[0].orden === 1 && imp[0].presupuesto_estimado, '1º implícito');
ok(listaConImplicito([{ orden: 2 }, { orden: 1 }], { prescriptorIdOp: SANTOS })[0].orden === 1, 'con filas, en orden');

console.log(`OK ${n} comprobaciones`);
