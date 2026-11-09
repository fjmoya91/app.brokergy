// ============================================================================
// horarioWhatsapp.js — CUÁNDO puede escribir la casa por WhatsApp sin que se
// note que es una máquina (fuente única, 2026-11-09).
//
// Fran (09/11/2026): «que las contestaciones sean desde las 7 de la mañana
// hasta las 9 de la noche […] como si estuviese contestando yo realmente,
// para que los clientes no me contesten a las horas». LEER se lee siempre
// (los listeners de la sesión no tienen horario: una espera se cierra a las 3
// de la mañana si contesta a esa hora); lo que se ESCRIBE a un tercero espera a
// que abra el horario.
//
//   · `puedeContestar(d)` — contestar a quien ha escrito: de 7 a 21 h de Madrid,
//     todos los días.
//   · `puedeInsistir(d)` — escribir sin que nos hayan escrito (un recordatorio,
//     un «¿cómo va la obra?»): la misma franja, pero de lunes a viernes. Un
//     recordatorio en domingo se lee como presión; `WA_INSISTIR_FINDE=true` lo
//     abre también el fin de semana.
//   · `siguienteApertura(d, { insistir })` — la primera hora en que se podrá.
//
// Las horas se cambian con `WA_HORA_DESDE` / `WA_HORA_HASTA` (7 y 21 por
// defecto). Lo usan el agente de la aceptación, las esperas y el bot.
// ============================================================================

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 24 ? n : d; };
const desde = () => num(process.env.WA_HORA_DESDE, 7);
const hasta = () => num(process.env.WA_HORA_HASTA, 21);
const insistirFinde = () => process.env.WA_INSISTIR_FINDE === 'true';

/** Hora, minuto y día de la semana en Madrid (0 = domingo). */
function partesMadrid(d = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(d).map(x => [x.type, x.value]));
    const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { h: Number(p.hour), m: Number(p.minute), dia };
}

const enFranja = (d) => { const { h } = partesMadrid(d); return h >= desde() && h < hasta(); };
const esFinde = (d) => { const { dia } = partesMadrid(d); return dia === 0 || dia === 6; };

/** ¿Se le puede CONTESTAR ahora a quien nos ha escrito? */
const puedeContestar = (d = new Date()) => enFranja(d);
/** ¿Se le puede escribir ahora SIN que nos haya escrito (recordar, preguntar cómo va)? */
const puedeInsistir = (d = new Date()) => enFranja(d) && (insistirFinde() || !esFinde(d));

/**
 * La primera hora en que se podrá escribir a partir de `d` (ella misma si ya se
 * puede), en punto: un mensaje programado sale a las 7:00, no a las 7:13.
 */
function siguienteApertura(d = new Date(), { insistir = false } = {}) {
    const vale = insistir ? puedeInsistir : puedeContestar;
    if (vale(d)) return d;
    let t = new Date(d.getTime());
    t.setSeconds(0, 0);
    t = new Date(t.getTime() + (60 - partesMadrid(t).m) * 60_000);   // a la hora en punto siguiente
    for (let i = 0; i < 24 * 4 && !vale(t); i++) t = new Date(t.getTime() + 3_600_000);
    return t;
}

module.exports = { puedeContestar, puedeInsistir, siguienteApertura, partesMadrid, desde, hasta };
