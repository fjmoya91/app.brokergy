// ─────────────────────────────────────────────────────────────────────────────
// Cómo se escribe el NOMBRE de alguien en un mensaje.
//
// En la app los nombres se guardan en MAYÚSCULAS porque los formularios las
// fuerzan (ficha de partner, de cliente, de contacto). Escritos tal cual en un
// saludo — "Hola MARIA JOSÉ" — se leen como un grito, así que se capitalizan
// antes de meterlos en un texto que va a leer una persona.
//
// Y NO se cortan: "MARIA JOSÉ" saludada como "Hola Maria" es otra persona, y los
// nombres compuestos son mayoría aquí (José Antonio, Juan Francisco, María José).
// La excepción es la RAZÓN SOCIAL, donde sí se toma la primera palabra: "Hola
// Fessa" se lee bien y "Hola Fessa Solar, Sl" no.
//
// Espejo del backend: `capitalizar` en services/recordatorios.js.
// ─────────────────────────────────────────────────────────────────────────────

// Partículas que van en minúscula dentro de un nombre ("José de la Torre"),
// salvo cuando abren el nombre.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'van', 'von']);

// Los apellidos compuestos con guion llevan las DOS mayúsculas
// ("SÁNCHEZ-CARRILLEJO" → "Sánchez-Carrillejo", no "Sánchez-carrillejo").
const mayusInicial = (w) => w.split('-')
    .map(t => t ? t.charAt(0).toUpperCase() + t.slice(1) : t)
    .join('-');

/** "MARIA JOSÉ DE LA TORRE" → "Maria José de la Torre". */
export const capitalizarNombre = (s) => String(s || '').toLowerCase()
    .split(/\s+/).filter(Boolean)
    .map((w, i) => (i > 0 && PARTICULAS.has(w)) ? w : mayusInicial(w))
    .join(' ');

// Formas societarias: si el nombre las lleva, es una EMPRESA y con la primera
// palabra basta ("FESSA SOLAR, SL" → "Fessa").
const SOCIETARIO = /(^|[\s,.])(s\.?\s?l\.?\s?u?|s\.?\s?a\.?\s?u?|s\.?\s?c\.?\s?p?|c\.?\s?b|s\.?\s?coop|slne?|sll)\.?\s*$/i;

// "Otro contacto…" es el rótulo de un BOTÓN, no el nombre de nadie: si se marca
// sin escribir un nombre, el saludo salía literalmente "Hola Otro".
const GENERICO = /^(otro|otro contacto|contacto|destinatario|partner|instalador|cliente|titular)$/i;

/**
 * Nombre para SALUDAR, bien escrito y sin cortar.
 *
 * Devuelve '' si lo que llega no es el nombre de nadie, para que quien llame
 * ponga su propio genérico ("compañeros").
 */
export const nombreSaludo = (s) => {
    const v = String(s || '').trim();
    if (!v || GENERICO.test(v)) return '';
    // Empresa: la primera palabra. Una razón social entera capitalizada
    // ("Aguahorro, Sl") queda peor que el nombre corto.
    if (SOCIETARIO.test(v)) return capitalizarNombre(v.split(/\s+/)[0].replace(/,$/, ''));
    return capitalizarNombre(v);
};

/**
 * Solo el primer nombre. Para donde el texto pida tuteo corto y se sepa que
 * llega nombre + apellidos.
 */
export const nombrePila = (s) => {
    const v = String(s || '').trim();
    if (!v || GENERICO.test(v)) return '';
    return capitalizarNombre(v.split(/\s+/)[0].replace(/,$/, ''));
};
