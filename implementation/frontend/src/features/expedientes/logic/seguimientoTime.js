// ─── seguimientoTime.js ──────────────────────────────────────────────────────
// Helpers de tiempo para la trazabilidad de subestados del expediente.
// Leen los campos paralelos sembrados por el backend (services/seguimientoTracking.js):
//   seguimiento.<fase>_ts[<estado>]  → fecha de entrada en cada subestado
//   seguimiento.<fase>_desde         → fecha de entrada en el subestado ACTUAL
//   seguimiento.<fase>_last_contacto_at → última comunicación al certificador

const MS_DAY = 24 * 60 * 60 * 1000;

// Etiquetas humanas de los subestados CEE (debe coincidir con STATUS_CONFIG de SeguimientoModule).
export const SUBESTADO_LABELS = {
    PTE_EMITIR: 'Pendiente de emitir',
    ASIGNADO: 'Asignado a técnico',
    EN_TRABAJO: 'Técnico trabajando',
    PTE_PRESENTACION: 'Pendiente presentación',
    PTE_REVISION: 'Pendiente revisión Brokergy',
    PRESENTADO: 'Presentado',
    REVISADO: 'Revisado y listo',
    REGISTRADO: 'Registrado',
};

/** Días enteros transcurridos desde una fecha ISO (null si no hay fecha). */
export function daysSince(iso) {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / MS_DAY));
}

/** dd/mm/yyyy */
export function fmtDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** dd/mm/yyyy HH:mm */
export function fmtDateTime(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Clasifica el retraso según los días en estado.
 * @param {number|null} days
 * @returns {'none'|'ok'|'warn'|'late'}
 */
export function staleness(days) {
    if (days == null) return 'none';
    if (days <= 4) return 'ok';
    if (days <= 13) return 'warn';
    return 'late';
}

/** Texto humano de antigüedad: "hoy", "ayer", "hace 5 días". */
export function humanDays(days) {
    if (days == null) return null;
    if (days === 0) return 'hoy';
    if (days === 1) return 'ayer';
    return `hace ${days} días`;
}

/** Clases tailwind (texto/borde/fondo) por nivel de staleness. */
export const STALE_CLASSES = {
    none: 'text-white/30 border-white/10 bg-white/[0.03]',
    ok:   'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    warn: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    late: 'text-red-400 border-red-500/40 bg-red-500/10',
};

/**
 * Lee la info temporal de una fase de seguimiento.
 * @param {object} seguimiento
 * @param {'cee_inicial'|'cee_final'|'anexos'} key
 */
export function readPhaseTime(seguimiento, key) {
    const s = seguimiento || {};
    const ts = s[`${key}_ts`] || {};
    const desde = s[`${key}_desde`] || null;
    const lastContacto = s[`${key}_last_contacto_at`] || null;
    const diasEnEstado = daysSince(desde);
    return {
        ts,
        desde,
        lastContacto,
        diasEnEstado,
        nivel: staleness(diasEnEstado),
    };
}
