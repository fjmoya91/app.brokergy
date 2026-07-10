// ============================================================
// fechasPrevistas.js — Plazo de ejecución de la obra
//
// El cliente nos dice cuándo tiene previsto que su instalador empiece y termine.
// La fecha de INICIO es la que manda para el CEE INICIAL: certifica el estado
// PREVIO a la actuación, así que tiene que estar registrado ANTES de que la obra
// empiece. La de FIN gobierna el CEE FINAL, que se emite después.
//
// De aquí sale la urgencia REAL de un certificado. Es un cálculo, no un dato
// guardado: nunca escribe en `expedientes.prioridad`, que sigue siendo la etiqueta
// manual de Brokergy y manda sobre esto en la ordenación.
// ============================================================

const MS_DIA = 86400000;

// `new Date('2026-07-10')` se parsea como MEDIANOCHE UTC, no local: en husos
// negativos eso cae en el día anterior y la cuenta atrás se iría un día. Los
// `<input type="date">` dan siempre 'YYYY-MM-DD', así que lo construimos a mano.
function aFechaLocal(iso) {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
    if (isNaN(d)) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Días que faltan para `iso` (negativo si ya pasó). null si no hay fecha. */
export function diasHasta(iso) {
    const objetivo = aFechaLocal(iso);
    if (!objetivo) return null;
    // Comparamos a medianoche: "faltan 0 días" significa "es hoy", no "hace 3 horas".
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((objetivo - hoy) / MS_DIA);
}

// Umbrales de aviso, en días naturales antes de la fecha prevista.
export const UMBRAL_CRITICO = 7;
export const UMBRAL_AVISO = 15;

/**
 * Estado del plazo del CEE INICIAL respecto a la fecha prevista de inicio de obra.
 *
 * @param {string|null} fechaPrevistaInicio
 * @param {boolean} ceeInicialRegistrado
 * @returns {{ nivel: 'ok'|'vencido'|'critico'|'aviso'|'holgado'|'sin_fecha', dias: number|null, texto: string }}
 */
export function estadoPlazoCeeInicial(fechaPrevistaInicio, ceeInicialRegistrado) {
    // Si ya está registrado, el plazo dejó de importar: llegamos.
    if (ceeInicialRegistrado) return { nivel: 'ok', dias: null, texto: 'CEE inicial registrado' };
    if (!fechaPrevistaInicio) return { nivel: 'sin_fecha', dias: null, texto: 'Sin fecha prevista' };

    const dias = diasHasta(fechaPrevistaInicio);
    if (dias === null) return { nivel: 'sin_fecha', dias: null, texto: 'Sin fecha prevista' };

    if (dias < 0) return { nivel: 'vencido', dias, texto: `La obra empezó hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'} sin CEE inicial` };
    if (dias === 0) return { nivel: 'vencido', dias, texto: 'La obra empieza HOY y no hay CEE inicial' };
    if (dias <= UMBRAL_CRITICO) return { nivel: 'critico', dias, texto: `Faltan ${dias} día${dias === 1 ? '' : 's'} para el inicio de obra` };
    if (dias <= UMBRAL_AVISO) return { nivel: 'aviso', dias, texto: `Faltan ${dias} días para el inicio de obra` };
    return { nivel: 'holgado', dias, texto: `Faltan ${dias} días para el inicio de obra` };
}

// Peso de ordenación: lo que antes vence, arriba. Los que no tienen fecha o ya
// están registrados van al final.
export const PESO_PLAZO = { vencido: 0, critico: 1, aviso: 2, holgado: 3, sin_fecha: 4, ok: 5 };

export const COLOR_PLAZO = {
    vencido: 'text-red-400',
    critico: 'text-red-400',
    aviso: 'text-amber-400',
    holgado: 'text-white/40',
    sin_fecha: 'text-white/20',
    ok: 'text-emerald-400',
};

// Franja izquierda de la fila, en la misma línea que la de prioridad manual.
export const BORDE_PLAZO = {
    vencido: 'border-l-2 border-l-red-500/70',
    critico: 'border-l-2 border-l-red-500/70',
    aviso: 'border-l-2 border-l-amber-500/70',
};

export const fmtFechaCorta = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d) ? null : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
