#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * El filtro por rango de fechas de la columna CREADO.
 *
 *   node scripts/test_rango_fecha.mjs
 *
 * Lo que se comprueba es lo que NO se ve en pantalla: que la fecha se lea en
 * hora LOCAL y no en UTC. `created_at` viene en UTC, así que un expediente dado
 * de alta de madrugada en España cae el día anterior si se corta la cadena — y
 * solo se nota en los extremos del rango, que es justo donde se mira.
 * ─────────────────────────────────────────────────────────────────────────────
 */
process.env.TZ = 'Europe/Madrid';   // el filtro se usa desde España

const { fechaLocal, dentroDelRango, delEs } =
    await import('../../frontend/src/features/expedientes/logic/rangoFecha.js');

let fallos = 0;
const ok = (cond, txt) => { console.log(`${cond ? '  ✓' : '  ✗'} ${txt}`); if (!cond) fallos++; };

console.log('\n── La fecha se lee en LOCAL, no en UTC ──');
{
    // 00:30 del 18 en Madrid (verano, UTC+2) son las 22:30 UTC del 17.
    const madrugada = '2026-09-17T22:30:00.000Z';
    ok(fechaLocal(madrugada) === '2026-09-18',
        `22:30Z del 17 es el 18 en Madrid (dice: ${fechaLocal(madrugada)})`);
    ok(madrugada.slice(0, 10) === '2026-09-17',
        'y cortando la cadena habría salido el 17 — el día que no es');
}

console.log('\n── Los dos extremos son INCLUSIVOS ──');
{
    const d = '2026-09-18T10:00:00.000Z';
    ok(dentroDelRango(d, '2026-09-18', '2026-09-18'), 'el propio día entra');
    ok(dentroDelRango(d, '2026-09-18', ''), 'entra con "desde" en su día');
    ok(dentroDelRango(d, '', '2026-09-18'), 'entra con "hasta" en su día');
    ok(!dentroDelRango(d, '2026-09-19', ''), 'y no entra si empieza al día siguiente');
    ok(!dentroDelRango(d, '', '2026-09-17'), 'ni si acaba el día antes');
}

console.log('\n── Sin rango entra todo; sin fecha, nada ──');
{
    ok(dentroDelRango('2026-01-01T00:00:00.000Z', '', ''), 'sin rango no se descarta nada');
    ok(dentroDelRango(null, '', ''), 'una fila sin fecha tampoco, si no se filtra');
    ok(!dentroDelRango(null, '2026-09-01', ''), 'pero SÍ se descarta en cuanto hay rango');
    ok(!dentroDelRango('no es una fecha', '2026-09-01', ''), 'y una fecha ilegible se trata igual');
}

console.log('\n── Un rango de un mes ──');
{
    const dentro = ['2026-09-01T12:00:00Z', '2026-09-15T12:00:00Z', '2026-09-30T12:00:00Z'];
    const fuera = ['2026-08-31T12:00:00Z', '2026-10-01T12:00:00Z'];
    ok(dentro.every(d => dentroDelRango(d, '2026-09-01', '2026-09-30')), 'los tres de septiembre entran');
    ok(fuera.every(d => !dentroDelRango(d, '2026-09-01', '2026-09-30')), 'los dos de fuera no');
}

console.log('\n── Cómo se escribe en pantalla ──');
{
    ok(delEs('2026-09-18') === '18/09/2026', `en castellano (${delEs('2026-09-18')})`);
    ok(delEs('') === '', 'y sin fecha no escribe nada');
}

console.log(fallos ? `\n❌ ${fallos} comprobación(es) fallan\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
