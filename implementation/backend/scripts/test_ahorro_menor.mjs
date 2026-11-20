// Pruebas de la regla 226: el ahorro verificado se GUARDA SOLO (lo que casa sin
// duda) y, si sale MENOR que lo declarado, se decide antes de pagar.
//   node implementation/backend/scripts/test_ahorro_menor.mjs
import { createRequire } from 'module';
import { estadoAhorroMenor, precioParaAcordado, UMBRAL_EUR } from '../../frontend/src/features/lotes/logic/ahorroMenor.js';

const require = createRequire(import.meta.url);
const { separarAplicables } = require('../services/loteVerificados.js');
const { conPrecio } = require('../services/ahorroMenorService.js');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };
const cerca = (a, b, tol = 0.005) => Math.abs(Number(a) - Number(b)) <= tol;

console.log('\n— estadoAhorroMenor —');
// 40.000 kWh a 100 €/MWh = 4.000 €; verificado 36.000 → 3.600 €.
const fin = { savingsKwh: 40000, cae: 4000, savingsKwhVerificado: 36000, caeVerificado: 3600 };
let e = estadoAhorroMenor(fin, null);
ok(e && e.pendiente && e.diferencia === 400 && e.bono_verificado === 3600, 'menor sin decidir → pendiente, −400 €');
ok(estadoAhorroMenor({ ...fin, savingsKwhVerificado: 40000, caeVerificado: 4000 }) === null, 'igual → nada que decidir');
ok(estadoAhorroMenor({ ...fin, savingsKwhVerificado: 41000, caeVerificado: 4100 }) === null, 'mayor → nada que decidir');
ok(estadoAhorroMenor({ ...fin, savingsKwh: 40000.4, savingsKwhVerificado: 40000 }) === null, `por debajo de ${UMBRAL_EUR} € (redondeo a kWh) → nada`);
ok(estadoAhorroMenor({ savingsKwh: 40000, cae: 4000 }) === null, 'sin verificado → null');

const dAcordado = { decision: 'acordado', kwh_declarado: 40000, kwh_verificado: 36000, bono_declarado: 4000, por: 'FRAN', at: '2026-11-18T10:00:00Z' };
// Con el precio subido (111,11 €/MWh) el declarado recalculado sube a 4.444 €: manda el CONGELADO.
e = estadoAhorroMenor({ savingsKwh: 40000, cae: 4444.44, savingsKwhVerificado: 36000, caeVerificado: 4000 }, dAcordado);
ok(e && !e.pendiente && e.decision === 'acordado' && e.bono_a_pagar === 4000 && e.bono_declarado === 4000,
    'acordado: se paga el declarado congelado aunque el precio ya esté subido');
ok(e.bono_verificado === 3600, 'el verificado se sigue diciendo al precio pactado (lineal en kWh)');
e = estadoAhorroMenor(fin, { ...dAcordado, decision: 'verificado' });
ok(e && !e.pendiente && e.bono_a_pagar === 3600, 'verificado: se paga lo verificado');
e = estadoAhorroMenor({ ...fin, savingsKwhVerificado: 35000 }, dAcordado);
ok(e && e.pendiente && e.decision_caducada && e.bono_declarado === 4000, 'otro verificado → la decisión caduca y vuelve a pedirse');
e = estadoAhorroMenor({ ...fin, savingsKwh: 39000, cae: 3900 }, dAcordado);
ok(e && e.pendiente && e.bono_declarado === 3900, 'cambia el declarado → se recalcula y vuelve a pedirse');

console.log('\n— precioParaAcordado —');
// Bono = MWh verificados × (precio − 5 de descuento del prescriptor al cliente) × 1,21 (empresa con IVA).
const bono = (p) => 36 * (p - 5) * 1.21;
const objetivo = 40 * (100 - 5) * 1.21;
const p = precioParaAcordado(bono, 100, objetivo);
ok(cerca(bono(p), objetivo, 0.001), `precio ${p} da el bono declarado al céntimo (descuento e IVA incluidos)`);
ok(precioParaAcordado(() => 0, 100, 1000) === null, 'economía plana → null (no se ofrece)');

console.log('\n— conPrecio —');
const exp = { id: 'x', instalacion: { a: 1, economico_override: { cae_client_rate: 95, otro: 2 } } };
ok(conPrecio(exp, 110.5).instalacion.economico_override.cae_client_rate === 110.5 && conPrecio(exp, 110.5).instalacion.a === 1, 'fija el precio sin tocar lo demás');
ok(!('cae_client_rate' in conPrecio(exp, null).instalacion.economico_override) && conPrecio(exp, null).instalacion.economico_override.otro === 2, 'null lo quita (vuelve al de la oportunidad)');
ok(exp.instalacion.economico_override.cae_client_rate === 95, 'no muta el original');

console.log('\n— separarAplicables —');
const fila = (o) => ({ aplicable: true, casado_por: 'numero', ahorro_kwh: 1000, expediente_id: o.id, numero_expediente: o.id, avisos: [], ahorro_actual_kwh: null, inversion_eur: 5000, inversion_actual_eur: 4000, ...o });
const prop = {
    leido: true, total: { cuadra: true },
    filas: [
        fila({ id: 'A' }),
        fila({ id: 'B', casado_por: 'titular', avisos: ['Casado por el titular, no por el número: compruébalo.'] }),
        fila({ id: 'C', ahorro_actual_kwh: 900, avisos: ['Ya tenía 900 kWh registrados.'] }),
        fila({ id: 'D', ahorro_actual_kwh: 1000, inversion_actual_eur: 5000 }),
        fila({ id: 'E', aplicable: false, expediente_id: null, avisos: ['No hay ningún expediente de este lote con ese número.'] }),
        fila({ id: 'F', avisos: ['Este expediente ya aparece en otra actuación del informe.'] }),
        fila({ id: 'G', ahorro_actual_kwh: 1000, inversion_actual_eur: 4000 }),
    ],
};
const s = separarAplicables(prop);
ok(s.aplicar.map(f => f.id).join() === 'A,G', 'se guardan solas: la limpia (A) y la que solo trae la inversión nueva (G)');
ok(s.revisar.map(f => f.id).join() === 'B,C,E,F', 'a revisar: por titular, verificado distinto, sin casar, repetida');
ok(s.yaEstaban.map(f => f.id).join() === 'D', 'ya estaba igual: no se reescribe');
const sNo = separarAplicables({ ...prop, total: { cuadra: false } });
ok(sNo.aplicar.length === 0 && sNo.revisar.length === prop.filas.length && sNo.motivo, 'el total no cuadra → NINGUNA sola');
ok(separarAplicables({ leido: false, filas: [] }).aplicar.length === 0, 'sin leer → nada');

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
