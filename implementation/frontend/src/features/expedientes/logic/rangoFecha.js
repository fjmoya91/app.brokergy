// ─────────────────────────────────────────────────────────────────────────────
// Comparar una fecha con un rango desde/hasta — la parte que puede fallar.
//
// Vive aparte de `expedientesColumnas.jsx` (que lleva JSX y no se puede importar
// desde Node) para que se pueda PROBAR: el desfase de zona horaria no se ve en
// pantalla, solo se nota en los extremos del rango, que es justo donde se mira.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ISO con hora → 'YYYY-MM-DD' en hora LOCAL.
 *
 * REGLA — NUNCA `iso.slice(0, 10)`. `created_at` viene en UTC, así que un
 * expediente dado de alta a las 00:30 en España son las 22:30 UTC del día
 * ANTERIOR: cortando la cadena se filtraría en el día que no es. Y un
 * `<input type="date">` escribe siempre en local, así que es con lo local con lo
 * que hay que comparar. Mismo criterio que la columna Fecha de Oportunidades.
 */
export const fechaLocal = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * ¿Cae `iso` dentro del rango? Los dos extremos son INCLUSIVOS: quien escribe
 * "hasta el 18" espera ver lo del 18.
 *
 * REGLA — una fila SIN fecha NO entra en un rango. No se sabe si cae dentro, y
 * colarla haría creer que sí. Sin rango puesto, en cambio, entra todo: ahí no se
 * está preguntando nada.
 */
export const dentroDelRango = (iso, desde, hasta) => {
    if (!desde && !hasta) return true;
    const f = fechaLocal(iso);
    if (!f) return false;
    return (!desde || f >= desde) && (!hasta || f <= hasta);
};

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' para el botón y la chapa de filtros activos. */
export const delEs = (ymd) => (ymd ? String(ymd).split('-').reverse().join('/') : '');
