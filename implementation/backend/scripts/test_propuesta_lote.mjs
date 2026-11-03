#!/usr/bin/env node
/**
 * Qué lotes PROPONDRÍA hoy el picker de «Añadir expediente», sin tocar nada.
 *
 *   node scripts/test_propuesta_lote.mjs              (casos sintéticos + lo de hoy)
 *   node scripts/test_propuesta_lote.mjs --solo-casos (sin base de datos)
 *
 * Usa la MISMA función que la pantalla (`proponerLotes`), así que si aquí no sale,
 * en el modal tampoco. Lo de hoy se arma como la ruta GET /api/lotes/elegibles:
 * DOC. COMPLETA, sin lote, y la antigüedad del bloque SIN_LOTEAR del radar.
 */
import path from 'path';
import assert from 'assert';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { proponerLotes, compararAntiguedad, compararRecientes, diasListo, instaladoresDe, pasaRiesgo, textoIncidencias } = await import(
    pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/propuestaLote.js')).href);

// ─── Casos sintéticos ──────────────────────────────────────────────────────────
const e = (id, ins, desde, anio = 2026, ccaa = 'CASTILLA-LA MANCHA') =>
    ({ id, numero_expediente: id, instalador_id: ins, instalador_nombre: ins && `INS ${ins}`, listo_desde: desde, anio_actuacion: anio, ccaa });

const lista = [
    e('A1', 'a', '2026-03-01'), e('A2', 'a', '2026-01-01'), e('A3', 'a', '2026-05-01'),
    e('B1', 'b', '2025-12-01'), e('B2', 'b', null),
    e('C1', 'c', '2026-02-01'), e('X1', null, '2026-02-15'),
    e('V1', 'v', '2024-06-01', 2025, 'VALENCIA'), // el más viejo, pero de otro año/CCAA
];

// Orden: más antiguo primero; sin fecha al final.
assert.deepStrictEqual([...lista].filter(x => x.anio_actuacion === 2026).sort(compararAntiguedad).map(x => x.id),
    ['B1', 'A2', 'C1', 'X1', 'A1', 'A3', 'B2']);

// Sin claves: una propuesta por antigüedad por cada año + CCAA (el grupo más viejo
// primero), y ninguna mezcla años ni CCAA.
let p = proponerLotes(lista, { cupo: 5 });
assert.deepStrictEqual(p.filter(q => q.tipo === 'antiguedad').map(q => q.expedientes.map(x => x.id)),
    [['V1'], ['B1', 'A2', 'C1', 'X1', 'A1']]);
assert.ok(p.every(q => q.expedientes.every(x => x.anio_actuacion === q.anio && x.ccaa === q.ccaa)), 'una propuesta mezcla año o CCAA');

// Con claves del lote: los 5 más antiguos de CLM 2026.
p = proponerLotes(lista, { ccaa: 'castilla-la mancha', anio: 2026, cupo: 5 });
assert.deepStrictEqual(p[0].expedientes.map(x => x.id), ['B1', 'A2', 'C1', 'X1', 'A1']);
// Por instalador: B (más antiguo) antes que A; C, con uno solo, no es propuesta; el
// sin instalador tampoco tiene propuesta propia.
assert.deepStrictEqual(p.slice(1).map(q => q.instalador_id), ['b', 'a']);
assert.deepStrictEqual(p.find(q => q.instalador_id === 'a').expedientes.map(x => x.id), ['A2', 'A1', 'A3']);

// El cupo manda: con 2 huecos, ninguna propuesta pasa de 2.
p = proponerLotes(lista, { ccaa: 'CASTILLA-LA MANCHA', anio: 2026, cupo: 2 });
assert.ok(p.every(q => q.expedientes.length <= 2));
assert.strictEqual(p.find(q => q.instalador_id === 'a').total, 3);

// El instalador que ya está en el lote va primero entre los de instalador.
p = proponerLotes(lista, { ccaa: 'CASTILLA-LA MANCHA', anio: 2026, cupo: 5, instaladoresLote: ['c'] });
assert.strictEqual(p[1].instalador_id, 'c');
assert.strictEqual(p[1].yaEnLote, true);

// Lote lleno: nada que proponer.
assert.deepStrictEqual(proponerLotes(lista, { cupo: 0 }), []);

// Si la propuesta de un instalador es idéntica a la de antigüedad, no se repite.
p = proponerLotes([e('A1', 'a', '2026-01-01'), e('A2', 'a', '2026-02-01')], { cupo: 5 });
assert.strictEqual(p.length, 1);
assert.strictEqual(p[0].titulo, 'INS a · los más antiguos');

assert.strictEqual(diasListo({ listo_desde: '2026-10-17' }, new Date('2026-10-27T12:00:00')), 10);
assert.strictEqual(diasListo({ listo_desde: null }), null);
assert.deepStrictEqual(instaladoresDe(lista).map(i => [i.id, i.n]), [['a', 3], ['b', 2], ['c', 1], ['v', 1]]);

// ─── Riesgo, recientes y «los de más MWh» (03/11/2026) ─────────────────────────
const conInc = (x, leves, graves) => ({ ...x, incidencias: { leves, graves } });
assert.strictEqual(pasaRiesgo(conInc(e('R1'), 3, 0), 'sin_graves'), true);
assert.strictEqual(pasaRiesgo(conInc(e('R1'), 3, 0), 'limpios'), false);
assert.strictEqual(pasaRiesgo(conInc(e('R1'), 0, 1), 'sin_graves'), false);
assert.strictEqual(pasaRiesgo(conInc(e('R1'), 0, 1), 'todos'), true);
assert.strictEqual(pasaRiesgo(conInc(e('R1'), 0, 1)), true, 'por defecto manda DOC. COMPLETA: también con graves');
assert.strictEqual(pasaRiesgo(e('R2'), 'limpios'), true, 'sin dato de incidencias cuenta como limpio');
assert.strictEqual(textoIncidencias(conInc(e('R1'), 2, 1)), '1 grave · 2 leves');
assert.strictEqual(textoIncidencias(e('R2')), null);
assert.deepStrictEqual([...lista].filter(x => x.anio_actuacion === 2026).sort(compararRecientes).map(x => x.id),
    ['A3', 'A1', 'X1', 'C1', 'A2', 'B1', 'B2']);
// Con kWh, va primero la de más MWh de cada grupo, y se titula con el S.O. si le falta.
const KWH = { A1: 10, A2: 50, A3: 30, B1: 5, B2: 80, C1: 20, X1: 40, V1: 999 };
p = proponerLotes(lista, { cupo: 3, kwhDe: (x) => KWH[x.id] * 1000, cubrir: { nombre: 'INTERALCO', faltaKwh: 1.9e6 } });
assert.strictEqual(p[0].tipo, 'mwh');
assert.strictEqual(p[0].titulo, 'Para cubrir a INTERALCO · los de más MWh');
assert.deepStrictEqual(p.filter(q => q.tipo === 'mwh').map(q => q.expedientes.map(x => x.id)), [['V1'], ['B2', 'A2', 'X1']]);
// Sin S.O. (o sin nada que le falte), el título es neutro.
assert.strictEqual(proponerLotes(lista, { cupo: 3, kwhDe: (x) => KWH[x.id] })[0].titulo, 'Los de más MWh');
// Si «los de más MWh» y «los más antiguos» son los mismos, solo sale una.
p = proponerLotes([e('A1', 'a', '2026-01-01'), e('B1', 'b', '2026-02-01')], { cupo: 5, kwhDe: () => 1 });
assert.deepStrictEqual(p.map(q => q.tipo), ['mwh']);

console.log('✓ casos sintéticos');

if (process.argv.includes('--solo-casos')) process.exit(0);

// ─── Lo de hoy, con datos reales (solo lectura) ─────────────────────────────────
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const geoCcaa = require('../services/geoCcaa');
const { ESTADOS_COMPLETO } = require('../services/loteService');

const { data: rows, error } = await supabase.from('expedientes')
    .select('id, numero_expediente, estado, instalador_asociado_id, instalacion, cliente_id, oportunidad_id, doc_fecha_fin_cifo:documentacion->fecha_fin_cifo, reg_fin:documentacion->>fecha_registro_cee_final, reg_ini:documentacion->>fecha_registro_cee_inicial')
    .is('lote_id', null);
if (error) { console.error(error.message); process.exit(1); }
const pre = rows.filter(r => ESTADOS_COMPLETO.includes(r.estado));
const opIds = [...new Set(pre.map(r => r.oportunidad_id).filter(Boolean))];
const cliIds = [...new Set(pre.map(r => r.cliente_id).filter(Boolean))];
const insDe = (r) => r.instalador_asociado_id || r.instalacion?.instalador_id || null;
const insIds = [...new Set(pre.map(insDe).filter(Boolean).map(String))];
const [ops, clis, ins] = await Promise.all([
    opIds.length ? supabase.from('oportunidades').select('id, datos_calculo').in('id', opIds) : { data: [] },
    cliIds.length ? supabase.from('clientes').select('id_cliente, provincia, ccaa').in('id_cliente', cliIds) : { data: [] },
    insIds.length ? supabase.from('prescriptores').select('id_empresa, acronimo, razon_social').in('id_empresa', insIds) : { data: [] },
]);
const opMap = new Map((ops.data || []).map(o => [o.id, o]));
const cliMap = new Map((clis.data || []).map(c => [c.id_cliente, c]));
const insMap = new Map((ins.data || []).map(p => [String(p.id_empresa), (p.acronimo || p.razon_social || '').trim() || null]));

const elegibles = [];
for (const r of pre) {
    const anio = geoCcaa.resolveAnioActuacion({ ...r, documentacion: { fecha_fin_cifo: r.doc_fecha_fin_cifo } });
    const ccaa = geoCcaa.resolveCcaaInstalacion(r, cliMap.get(r.cliente_id), opMap.get(r.oportunidad_id));
    if (anio == null || !ccaa) continue;
    const insId = insDe(r);
    elegibles.push({
        id: r.id, numero_expediente: r.numero_expediente, anio_actuacion: anio, ccaa,
        instalador_id: insId, instalador_nombre: insId ? insMap.get(String(insId)) || null : null,
        listo_desde: r.reg_fin || r.reg_ini || null,
    });
}
console.log(`\n${elegibles.length} elegibles hoy · ${elegibles.filter(x => !x.instalador_nombre).length} sin nombre de instalador · ${elegibles.filter(x => !x.listo_desde).length} sin fecha`);
for (const q of proponerLotes(elegibles, { cupo: 5 })) {
    const d = diasListo(q.expedientes[0]);
    console.log(`\n${q.tipo === 'antiguedad' ? '⏳' : '🔧'} ${q.titulo} — ${q.anio} ${q.ccaa}${d != null ? ` · el más antiguo hace ${d} días` : ''}${q.total ? ` · tiene ${q.total}` : ''}`);
    console.log('   ' + q.expedientes.map(x => `${x.numero_expediente} (${x.listo_desde || 's/f'})`).join(' · '));
}
