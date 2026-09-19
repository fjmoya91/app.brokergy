// ─────────────────────────────────────────────────────────────────────────────
// CUÁNDO sale un envío programado — la parte que no pinta nada.
//
// Vive fuera del `.jsx` por lo mismo que `rangoFecha.js`: es aritmética de
// fechas, que es donde se cuelan los errores de un día o de una zona horaria, y
// desde aquí se puede probar con `node`.
//
// REGLA — la hora se compone en LOCAL y viaja en ISO. Quien escribe las 9:00
// quiere las 9:00 suyas, no las 9:00 UTC; `new Date('2026-09-21T09:00')` (sin
// zona) es exactamente eso. El servidor solo compara el instante resultante
// contra `now()`, así que el huso del VPS —que va en UTC— no interviene.
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** Date → 'aaaa-mm-dd' en hora LOCAL (nunca `toISOString`, que pasa por UTC y
 *  se come el día entero en cuanto son las 00:30 en España). */
export const aFecha = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Date → 'hh:mm' en hora LOCAL. */
export const aHora = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Los dos campos del panel → Date local, o null si no hay fecha válida. */
export const componer = (fecha, hora) => {
    if (!fecha || !hora) return null;
    const d = new Date(`${fecha}T${hora}`);
    return Number.isNaN(d.getTime()) ? null : d;
};

/** Cómo se le dice al usuario: "viernes, 19 de septiembre, 09:00". */
export const textoFecha = (d) => new Date(d).toLocaleString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

// Margen mínimo. Programar "para dentro de diez segundos" es enviar ahora, y el
// barrido del servidor tarda hasta un minuto en ver la fila.
export const MARGEN_MS = 60 * 1000;

/** ¿Se puede programar para ese instante? */
export const esValido = (d, ahora = Date.now()) =>
    !!d && d.getTime() > ahora + MARGEN_MS;

/** Redondea hacia ARRIBA al múltiplo de 5 minutos: el campo de hora va a pasos
 *  de 5 min, y un 08:13 se lee como un número tecleado por error. */
const aCinco = (d) => {
    const r = new Date(d);
    r.setSeconds(0, 0);
    const m = r.getMinutes();
    if (m % 5) r.setMinutes(m + (5 - m % 5));
    return r;
};

/**
 * Los atajos del panel. La hora a la que se manda una propuesta casi siempre es
 * una de cuatro, y teclear día y hora para eso son seis pulsaciones y una
 * oportunidad de equivocarse de mes.
 *
 * "En 1 hora" va PRIMERO porque es el único que sirve para HOY a cualquier hora:
 * los demás son horas fijas y a media tarde ya han pasado todas.
 *
 * "Hoy 18:00" solo aparece si todavía queda margen: un atajo que al pulsarlo
 * dice que esa hora ya pasó es peor que no ofrecerlo.
 */
export function atajos(ahora = new Date()) {
    const out = [{ label: 'En 1 hora', d: aCinco(new Date(ahora.getTime() + 3600000)) }];

    const hoyTarde = new Date(ahora); hoyTarde.setHours(18, 0, 0, 0);
    if (hoyTarde.getTime() > ahora.getTime() + 5 * 60000) out.push({ label: 'Hoy 18:00', d: hoyTarde });

    const m9 = new Date(ahora); m9.setDate(m9.getDate() + 1); m9.setHours(9, 0, 0, 0);
    const m13 = new Date(ahora); m13.setDate(m13.getDate() + 1); m13.setHours(13, 0, 0, 0);
    out.push({ label: 'Mañana 9:00', d: m9 }, { label: 'Mañana 13:00', d: m13 });

    // Próximo lunes a primera hora. Si hoy ES lunes, el de la semana que viene:
    // "lunes" dicho un lunes por la tarde no significa dentro de diez minutos.
    const lunes = new Date(ahora);
    const salto = ((8 - lunes.getDay()) % 7) || 7;
    lunes.setDate(lunes.getDate() + salto);
    lunes.setHours(9, 0, 0, 0);
    out.push({ label: 'Lunes 9:00', d: lunes });

    return out;
}

/** El valor con el que se abre el panel: mañana a primera hora. */
export function porDefecto(ahora = new Date()) {
    const d = new Date(ahora);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
}
