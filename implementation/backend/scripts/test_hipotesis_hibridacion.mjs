// Hibridación manteniendo la caldera: las DOS hipótesis del bono (criterio de la
// demanda, que defendemos, y el de la potencia de la caldera) van al cliente en
// un mensaje aparte (2026-10-21).
// Fuente única: frontend/src/features/calculator/logic/hibridacionPropuesta.js
//   node implementation/backend/scripts/test_hipotesis_hibridacion.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const FRONT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'frontend', 'src');
const m = await import(pathToFileURL(path.join(FRONT, 'features/calculator/logic/hibridacionPropuesta.js')).href);

// El caso de las capturas: 2.308 € por demanda, 1.438 € por la caldera de 37,8 kW, 2.422 € sin ella.
const result = {
    financials: { caeBonus: 2308.4 },
    financialsSinCaldera: { caeBonus: 2421.7 },
    hipotesisHibridacion: {
        demanda: { caeBonus: 2308.4, cb: 0.9531 },
        caldera: { caeBonus: 1437.9, cb: 0.5938, potenciaCaldera: 37.8 },
    },
};
const inputs = { hibridacion: true };

const hip = m.hipotesisHibridacion(result, inputs);
assert.deepEqual(hip, { defendida: 2308, potencia: 1438, potenciaCaldera: 37.8, sinCaldera: 2422, enPropuesta: 1 });

// Sin hibridación, en reforma, sin potencia de la caldera o si la caldera no da menos: nada.
assert.equal(m.hipotesisHibridacion(result, { hibridacion: false }), null);
assert.equal(m.hipotesisHibridacion(result, { hibridacion: true, isReforma: true }), null);
assert.equal(m.hipotesisHibridacion({ ...result, hipotesisHibridacion: { ...result.hipotesisHibridacion, caldera: null } }, inputs), null);
assert.equal(m.hipotesisHibridacion({ ...result, hipotesisHibridacion: { ...result.hipotesisHibridacion, caldera: { caeBonus: 2400, potenciaCaldera: 10 } } }, inputs), null);

// Con el selector en «Potencia de la caldera» la propuesta lleva la cifra 2.
assert.equal(m.hipotesisHibridacion({ ...result, financials: { caeBonus: 1437.9 } }, inputs).enPropuesta, 2);
// Con «Retirando la caldera» la propuesta va sin caldera: no se cita ninguna.
assert.equal(m.hipotesisHibridacion(result, { ...inputs, hibridacionPropuesta: 'RETIRA' }).enPropuesta, null);

// El mensaje dice las dos cifras, la potencia y lo de retirarla; al partner en tercera persona.
const txt = m.mensajeHipotesisHibridacion(hip);
for (const s of ['2.308 €', '1.438 €', '37,8 kW', '2.422 €', 'propuesta adjunta', 'tienes instalada']) assert.ok(txt.includes(s), `falta «${s}»`);
assert.ok(!/horas/i.test(txt), 'no se explican las horas');
const b2b = m.mensajeHipotesisHibridacion(hip, { b2b: true });
assert.ok(b2b.includes('el cliente') && !b2b.includes('tienes'), 'al partner, tercera persona');
assert.equal(m.mensajeHipotesisHibridacion(null), '');

// El recuadro del PDF lleva el párrafo, también sin comparativa de retirar.
const conOp = m.avisoHibridacion(m.opcionesHibridacion(result, inputs), hip);
assert.equal(conOp.parrafos.length, 3);
assert.ok(conOp.parrafos[1].includes('1.438 €'));
const soloHip = m.avisoHibridacion(null, hip);
assert.equal(soloHip.parrafos.length, 1);
assert.equal(m.avisoHibridacion(null, null), null);

console.log('✓ hipótesis de la hibridación: cifras, casos nulos, mensaje y recuadro');
console.log('\n── Mensaje al cliente ──\n' + txt + '\n');
