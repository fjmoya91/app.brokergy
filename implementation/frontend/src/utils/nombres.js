// ─────────────────────────────────────────────────────────────────────────────
// Cómo se escribe el NOMBRE de alguien en un mensaje.
//
// En la app los nombres se guardan en MAYÚSCULAS porque los formularios las
// fuerzan (ficha de partner, de cliente, de contacto). Escritos tal cual en un
// saludo — "¡Hola JOSÉ ANTONIO!" — se leen como un grito, así que se capitalizan
// antes de meterlos en un texto que va a leer una persona.
//
// Se capitalizan los NOMBRES, no las razones sociales: "AGUAHORRO, SL" pasaría a
// "Aguahorro, Sl", que es peor. Por eso `nombrePila` se queda con la PRIMERA
// palabra, que es lo único que se usa para saludar ("Foncaman Criptana, SL" →
// "Foncaman") y donde el resultado siempre se lee bien.
//
// Espejo del backend: `capitalizar` / `nombrePila` en services/recordatorios.js.
// ─────────────────────────────────────────────────────────────────────────────

/** "JOSÉ ANTONIO BARBA" → "José Antonio Barba" (respeta espacios múltiples). */
export const capitalizarNombre = (s) => String(s || '').toLowerCase()
    .split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// "Otro contacto…" es el rótulo de un BOTÓN, no el nombre de nadie: si se marca
// sin escribir un nombre, el saludo salía literalmente "Hola Otro".
const GENERICO = /^(otro|otro contacto|contacto|destinatario|partner|instalador|cliente)$/i;

/**
 * Nombre para SALUDAR: la primera palabra, bien escrita. Vacío si lo que llega
 * no es el nombre de nadie (para que quien llame ponga su propio genérico).
 */
export const nombrePila = (s) => {
    const v = String(s || '').trim();
    if (!v || GENERICO.test(v)) return '';
    return capitalizarNombre(v.split(/\s+/)[0] || '');
};
