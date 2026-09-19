#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CUÁNDO sale un envío programado — la aritmética del panel del reloj.
 *
 *   node implementation/backend/scripts/test_programar_envio.mjs
 *
 * Lo que se comprueba es lo que no se ve en pantalla: que la hora que se teclea
 * sea la hora de quien la teclea. Componerla con `toISOString` —o partir la
 * cadena por la T— se lleva el día entero por delante en cuanto son más de las
 * 22:00 en España, y eso solo se nota el día que una propuesta sale 24 h tarde.
 * ─────────────────────────────────────────────────────────────────────────────
 */
process.env.TZ = 'Europe/Madrid';

const { aFecha, aHora, componer, esValido, atajos, porDefecto, MARGEN_MS } =
    await import('../../frontend/src/features/calculator/logic/programarEnvio.js');

let fallos = 0;
const ok = (cond, txt) => { console.log(`${cond ? '  ✓' : '  ✗'} ${txt}`); if (!cond) fallos++; };

console.log('\n── La hora es la de quien la teclea, no UTC ──');
{
    // 23:30 del 18 en Madrid (verano, UTC+2) son las 21:30 UTC del MISMO día,
    // pero a las 00:30 del 19 el ISO ya dice 18. Los dos campos van en local.
    const tarde = new Date(2026, 8, 18, 23, 30);
    ok(aFecha(tarde) === '2026-09-18', 'a las 23:30 la fecha sigue siendo la del día 18');
    ok(aHora(tarde) === '23:30', 'y la hora, 23:30');

    const medianoche = new Date(2026, 8, 19, 0, 30);
    ok(aFecha(medianoche) === '2026-09-19', 'a las 00:30 la fecha ya es la del 19');
    ok(medianoche.toISOString().slice(0, 10) === '2026-09-18',
        '   (con toISOString habría salido el 18 — por eso no se usa)');

    const d = componer('2026-09-19', '09:00');
    ok(d.getHours() === 9 && d.getDate() === 19, 'componer devuelve las 9:00 LOCALES del 19');
    ok(d.toISOString() === '2026-09-19T07:00:00.000Z', 'que viajan como 07:00 UTC (España en verano)');
}

console.log('\n── Ida y vuelta ──');
{
    for (const d of [new Date(2026, 0, 1, 0, 0), new Date(2026, 11, 31, 23, 59), new Date(2026, 5, 15, 13, 5)]) {
        const v = componer(aFecha(d), aHora(d));
        ok(v.getTime() === new Date(d).setSeconds(0, 0), `${aFecha(d)} ${aHora(d)} sobrevive al viaje`);
    }
    ok(componer('', '09:00') === null && componer('2026-09-19', '') === null, 'sin uno de los dos campos, null');
    ok(componer('no-es-fecha', '09:00') === null, 'una cadena que no es fecha, null');
}

console.log('\n── Qué hora vale ──');
{
    const ahora = Date.now();
    ok(esValido(new Date(ahora + 5 * 60000), ahora), 'dentro de cinco minutos, sí');
    ok(!esValido(new Date(ahora - 1000), ahora), 'hace un segundo, no');
    ok(!esValido(new Date(ahora + MARGEN_MS - 1000), ahora), 'dentro de medio minuto, tampoco: el barrido no llega');
    ok(!esValido(null, ahora), 'sin fecha, no');
}

console.log('\n── Los atajos ──');
{
    // Un martes a las 10:00: caben los cinco.
    const martes = new Date(2026, 8, 15, 10, 0);
    const a = atajos(martes);
    ok(a.length === 5, 'por la mañana se ofrecen los cinco');
    ok(a[0].label === 'En 1 hora' && a[0].d.getDate() === 15 && a[0].d.getHours() === 11,
        '"En 1 hora" va primero y es HOY — el único que sirve a cualquier hora');
    ok(a[1].label === 'Hoy 18:00' && a[1].d.getDate() === 15, '"Hoy 18:00" es hoy');
    ok(a[2].d.getDate() === 16 && a[2].d.getHours() === 9, '"Mañana 9:00" es mañana a las 9');
    const lunes = a[a.length - 1];
    ok(lunes.d.getDay() === 1 && lunes.d.getDate() === 21, 'el lunes es el 21, no el de dentro de un rato');

    // "En 1 hora" cae en un múltiplo de 5 minutos (el campo va a pasos de 5).
    const raro = atajos(new Date(2026, 8, 15, 7, 13));
    ok(raro[0].d.getHours() === 8 && raro[0].d.getMinutes() === 15,
        'a las 7:13, "En 1 hora" son las 8:15 y no las 8:13');
    ok(raro[0].d.getSeconds() === 0, 'y sin segundos sueltos');

    // A las 20:00 ya no tiene sentido ofrecer "Hoy 18:00", pero "En 1 hora" sigue.
    const noche = atajos(new Date(2026, 8, 15, 20, 0));
    ok(!noche.some(x => x.label === 'Hoy 18:00'), 'pasadas las 18:00 desaparece "Hoy 18:00"');
    ok(noche[0].label === 'En 1 hora' && noche[0].d.getDate() === 15,
        'pero a las 20:00 todavía se puede programar para HOY a las 21:00');
    ok(noche.length === 4, 'quedan cuatro');

    // Un LUNES, "Lunes 9:00" tiene que ser el de la semana que viene.
    const l = atajos(new Date(2026, 8, 21, 16, 0));
    const suLunes = l[l.length - 1].d;
    ok(suLunes.getDate() === 28, 'un lunes por la tarde, "Lunes 9:00" es el lunes que viene');

    // Un DOMINGO, el lunes es mañana (getDay() === 0 es el caso que rompe la
    // aritmética modular si se escribe a la ligera).
    const dom = atajos(new Date(2026, 8, 20, 12, 0));
    ok(dom[dom.length - 1].d.getDate() === 21, 'un domingo, el lunes es mañana');

    ok(atajos(martes).every(x => esValido(x.d, martes.getTime())), 'ningún atajo propone una hora que ya pasó');
}

console.log('\n── Con qué se abre ──');
{
    const d = porDefecto(new Date(2026, 8, 15, 23, 50));
    ok(d.getDate() === 16 && d.getHours() === 9, 'mañana a las 9:00, también si se abre a las 23:50');
}

console.log(`\n${fallos ? `❌ ${fallos} comprobación(es) fallidas` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
