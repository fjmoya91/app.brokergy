#!/usr/bin/env node
// =============================================================================
// COMPARAR DOS RONDAS de WhatsApp (2026-10-19) — ¿lee igual un modelo más barato?
// -----------------------------------------------------------------------------
// Toma dos ficheros `ronda_*.json` de `scratch/ronda/` (la de referencia y la de
// prueba, mismo periodo) y compara, chat a chat (por teléfono): a qué obra asigna
// los adjuntos, qué apartado propone, cuántos deja dudosos, cuántas preguntas sin
// contestar saca y qué haría con el borrador. Y el coste de cada una.
// Solo lee ficheros: ni BD, ni WhatsApp, ni Gemini.
//
//   node scripts/comparar_rondas.js scratch/ronda/<referencia>.json scratch/ronda/<prueba>.json
// =============================================================================
'use strict';
const fs = require('fs');

const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) { console.error('Uso: node scripts/comparar_rondas.js <referencia.json> <prueba.json>'); process.exit(1); }
const A = JSON.parse(fs.readFileSync(fa, 'utf8'));
const B = JSON.parse(fs.readFileSync(fb, 'utf8'));

const porTel = (r) => new Map((r.chats || []).map(c => [c.telefono, c]));
const resumenChat = (c) => {
    const filas = (c.filas || []).filter(f => f.tipo !== 'NO_RELACIONADO');
    const cuenta = (xs) => { const m = {}; for (const x of xs) m[x] = (m[x] || 0) + 1; return m; };
    return {
        obras: cuenta(filas.map(f => f.obra || 'dudoso')),
        slots: cuenta(filas.filter(f => f.slot).map(f => f.slot)),
        adjuntos: filas.length,
        preguntas: c.analisis?.preguntas_sin_contestar?.length || 0,
        accion: c.borrador?.accion || '—',
    };
};
// Cuántos adjuntos caen en la MISMA obra (o en el mismo apartado) en las dos.
const coinciden = (a, b) => Object.keys(a).reduce((s, k) => s + Math.min(a[k], b[k] || 0), 0);

const ta = porTel(A);
const tb = porTel(B);
const comunes = [...ta.keys()].filter(t => tb.has(t));
let adjA = 0, obraIgual = 0, slotA = 0, slotIgual = 0, accIgual = 0, accTotal = 0, pregA = 0, pregB = 0, dudA = 0, dudB = 0;
const distintos = [];
for (const t of comunes) {
    const a = resumenChat(ta.get(t));
    const b = resumenChat(tb.get(t));
    if (ta.get(t).error || tb.get(t).error) continue;
    adjA += a.adjuntos;
    obraIgual += coinciden(a.obras, b.obras);
    const sa = Object.values(a.slots).reduce((s, n) => s + n, 0);
    slotA += sa;
    slotIgual += coinciden(a.slots, b.slots);
    pregA += a.preguntas; pregB += b.preguntas;
    dudA += a.obras.dudoso || 0; dudB += b.obras.dudoso || 0;
    if (a.accion !== '—' || b.accion !== '—') { accTotal++; if (a.accion === b.accion) accIgual++; }
    if (coinciden(a.obras, b.obras) < a.adjuntos || a.accion !== b.accion) {
        distintos.push(`${ta.get(t).titulo.split(' — ')[0].slice(0, 40)} · obras ${JSON.stringify(a.obras)} → ${JSON.stringify(b.obras)} · borrador ${a.accion} → ${b.accion}`);
    }
}
const pct = (x, y) => (y ? `${Math.round((x / y) * 100)} %` : '—');
// El prototipo del 19/10 guardaba el coste en `costeEur`; el servicio, en `coste.eur`.
const eur = (r) => (r.coste?.eur ?? r.costeEur ?? 0).toFixed(3);
console.log(`Referencia: ${A.modelo || '(sin modelo anotado)'} · ${A.chats.length} chats · ≈ ${eur(A)} € · ${A.coste?.think ?? '?'} tokens pensados`);
console.log(`Prueba:     ${B.modelo || '(sin modelo anotado)'} · ${B.chats.length} chats · ≈ ${eur(B)} € · ${B.coste?.think ?? '?'} tokens pensados`);
console.log(`Chats en las dos: ${comunes.length}`);
console.log(`Adjuntos a la MISMA obra:      ${obraIgual} de ${adjA} (${pct(obraIgual, adjA)})`);
console.log(`Fotos al MISMO apartado:       ${slotIgual} de ${slotA} (${pct(slotIgual, slotA)})`);
console.log(`Dudosos:                       ${dudA} → ${dudB}`);
console.log(`Preguntas sin contestar:       ${pregA} → ${pregB}`);
console.log(`Misma decisión de borrador:    ${accIgual} de ${accTotal} (${pct(accIgual, accTotal)})`);
if (distintos.length) {
    console.log('\nDonde no coinciden (para mirarlo a mano):');
    for (const d of distintos.slice(0, 40)) console.log(`  · ${d}`);
}
