// Prueba del JUICIO sobre el justificante de titularidad (sin red, sin BD):
//   node implementation/backend/scripts/test_justificante_bancario.js
const assert = require('assert');
const J = require('../utils/justificanteBancario');

const IBAN = 'ES9121000418450200051332'; // IBAN de ejemplo válido
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// IBAN: espacios, guiones y puntos son el mismo número
ok(J.ibanValido(IBAN), 'IBAN válido');
ok(J.ibanValido('ES91 2100-0418.4502 0005 1332'), 'con separadores sigue siendo válido');
ok(!J.ibanValido('ES9121000418450200051333'), 'un dígito mal no pasa el control');
ok(J.compararIban('ES91-2100-0418-4502-0005-1332', 'es91 2100 0418 4502 0005 1332').estado === 'coincide', 'mismo IBAN con distinto formato');
ok(J.compararIban(IBAN, 'ES9121000418450200051333').estado === 'no_coincide', 'IBAN distinto');
ok(J.compararIban('ES91 **** **** **** **** 1332', IBAN).estado === 'coincide_visible', 'enmascarado casa en lo visible');
ok(J.compararIban('ES91****1332', IBAN).estado === 'coincide_visible', 'enmascarado corto');
ok(J.compararIban('ES91 **** **** **** **** 9999', IBAN).estado === 'no_coincide', 'enmascarado que no casa');
ok(J.compararIban(IBAN, '').estado === 'sin_dato', 'ficha sin IBAN');
ok(J.formatearIban(IBAN) === 'ES91 2100 0418 4502 0005 1332', 'formato impreso');

// Titular
const cli = { nombre_razon_social: 'FRANCISCO JAVIER', apellidos: 'MORENO SERRANO', numero_cuenta: '' };
ok(J.compararTitular(['MORENO SERRANO FRANCISCO JAVIER'], cli).estado === 'coincide', 'orden invertido');
ok(J.compararTitular(['Fco. Javier Moreno Serrano'], cli).estado === 'coincide', 'abreviatura del nombre');
ok(J.compararTitular(['Francisco Javier Moreno Serrano', 'María López Ruiz'], cli).estado === 'coincide', 'cotitulares');
ok(J.compararTitular(['JAVIER MORENO GARCÍA'], cli).estado === 'parcial', 'un apellido distinto → parcial');
ok(J.compararTitular(['ANA PÉREZ GÓMEZ'], cli).estado === 'no_coincide', 'otra persona');
const errata = J.compararTitular(['SEGUNDO PINTADO ZARCO'], { nombre_razon_social: 'SEGUNDO', apellidos: 'PINTADO ZARZO' });
ok(errata.estado === 'errata' && errata.erratas[0].leido === 'ZARCO', 'una letra distinta → errata');
ok(J.evaluarJustificante({ iban: IBAN, titulares: ['SEGUNDO PINTADO ZARCO'] }, { nombre_razon_social: 'SEGUNDO', apellidos: 'PINTADO ZARZO', numero_cuenta: IBAN }).avisos.some(a => a.includes('una letra')), 'aviso de errata');
const conCop = { ...cli, copropietarios: [{ nombre: 'MARÍA', apellidos: 'LÓPEZ RUIZ' }] };
const r = J.compararTitular(['MARIA LOPEZ RUIZ'], conCop);
ok(r.estado === 'coincide' && r.rol === 'copropietario', 'cuenta del copropietario');
ok(J.compararTitular(['INSTALACIONES GARCIA S.L.'], { es_empresa: true, nombre_razon_social: 'INSTALACIONES GARCÍA, SL' }).estado === 'coincide', 'sociedad');

// Veredicto
let e = J.evaluarJustificante({ iban: 'ES91 2100 0418 4502 0005 1332', titulares: ['MORENO SERRANO, FRANCISCO JAVIER'] }, cli);
ok(e.ok && e.rellenar === 'ES91 2100 0418 4502 0005 1332', 'rellena si la ficha no lo tiene');
e = J.evaluarJustificante({ iban: IBAN, titulares: ['FRANCISCO JAVIER MORENO SERRANO'] }, { ...cli, numero_cuenta: 'ES91-2100-0418-4502-0005-1332' });
ok(e.ok && !e.rellenar && !e.avisos.length, 'coincide sin avisos');
e = J.evaluarJustificante({ iban: 'ES9121000418450200051333', titulares: ['FRANCISCO JAVIER MORENO SERRANO'] }, cli);
ok(!e.ok && !e.rellenar && e.avisos.some(a => a.includes('dígito de control')), 'no rellena un IBAN que no valida');
e = J.evaluarJustificante({ iban: 'ES91****1332', titulares: ['FRANCISCO JAVIER MORENO SERRANO'] }, cli);
ok(!e.rellenar && e.avisos.some(a => a.includes('oculta')), 'no rellena un IBAN enmascarado');
e = J.evaluarJustificante({ iban: IBAN, titulares: ['ANA PEREZ'] }, { ...cli, numero_cuenta: IBAN });
ok(!e.ok && e.avisos.some(a => a.includes('no parece el cliente')), 'avisa del titular');

console.log(`OK · ${n} comprobaciones`);
