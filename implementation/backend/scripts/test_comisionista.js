// Prueba sin BD del COMISIONISTA de una oportunidad: quién ve qué y qué se
// admite al escribir. node scripts/test_comisionista.js (desde implementation/backend)
const assert = require('assert');
const { capaComisionista, normalizarComisionista, normalizarImporte, esStaff } = require('../utils/comisionista');

const admin = { user: { rol_nombre: 'ADMIN' } };
const trab = { user: { rol_nombre: 'TRABAJADOR' } };
const partner = { user: { rol_nombre: 'DISTRIBUIDOR', prescriptor_id: 'x' } };
const anon = { user: null };

const op = { id_oportunidad: '26RES060_OP308', comisionista_id: 'c1', comisionista_importe: 150, prescriptor_id: 'p' };

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

ok(capaComisionista(op, admin).comisionista_importe === 150, 'ADMIN ve el importe');
ok(capaComisionista(op, trab).comisionista_id === 'c1', 'TRABAJADOR ve quién es');
ok(!('comisionista_importe' in capaComisionista(op, trab)), 'TRABAJADOR no ve el importe');
ok(!('comisionista_id' in capaComisionista(op, partner)), 'partner no ve el comisionista');
ok(!('comisionista_importe' in capaComisionista(op, partner)), 'partner no ve el importe');
ok(!('comisionista_id' in capaComisionista(op, anon)), 'sin sesión no ve nada');
ok(op.comisionista_importe === 150, 'no muta la fila original');
ok(esStaff({ internalCall: true }), 'la clave interna cuenta como equipo interno');

ok(normalizarImporte('150').valor === 150, '150');
ok(normalizarImporte('150.5').valor === 150.5, '150.5 de un input numérico');
ok(normalizarImporte('1.234,56').valor === 1234.56, '1.234,56 en castellano');
ok(normalizarImporte('').valor === null, 'vacío = sin fijar');
ok(!!normalizarImporte('-3').error, 'negativo no');
ok(!!normalizarImporte('abc').error, 'texto no');

ok(!!normalizarComisionista({}, { alta: true }).error, 'alta sin nombre no');
const alta = normalizarComisionista({ nombre: ' juanma ', tlf: '+34 600 11 22 33', comision_tipo: 'pct', comision_valor: 10 }, { alta: true, admin: false });
ok(alta.fila.nombre === 'JUANMA', 'nombre en mayúsculas');
ok(alta.fila.tlf === '+34600112233', 'teléfono sin espacios');
ok(!('comision_tipo' in alta.fila) && !('comision_valor' in alta.fila), 'un TRABAJADOR no fija lo pactado');
const altaAdmin = normalizarComisionista({ nombre: 'x', comision_tipo: 'pct', comision_valor: '10' }, { alta: true, admin: true });
ok(altaAdmin.fila.comision_tipo === 'pct' && altaAdmin.fila.comision_valor === 10, 'ADMIN sí');
ok(!!normalizarComisionista({ nombre: 'x', comision_tipo: 'raro' }, { alta: true, admin: true }).error, 'tipo cerrado');
ok(!!normalizarComisionista({ nombre: 'x', email: 'no-es-email' }, { alta: true }).error, 'email inválido');
ok(Object.keys(normalizarComisionista({ notas: 'a' }, { alta: false }).fila).join() === 'notas', 'PATCH solo lo que llega');

console.log(`OK — ${n} comprobaciones del comisionista.`);
