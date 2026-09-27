// ─── RECHAZADO: el segundo estado TERMINAL del expediente ────────────────────
//
// FINALIZADO y RECHAZADO cierran el expediente, pero no igual: FINALIZADO es el
// último paso del ciclo y RECHAZADO es una SALIDA a la que se llega desde
// cualquier estado. Por eso RECHAZADO no se elige como una opción más del
// desplegable: pide quién lo rechaza y por qué (RechazoExpedienteModal) y se
// escribe por su propia ruta, que guarda el estado previo para poder reabrirlo.
//
// Espejo de backend/utils/expedienteEstados.js (RECHAZADO_POR, MOTIVOS_RECHAZO,
// MOTIVO_RECHAZO_MIN) y de los CHECK de scripts/expedientes_rechazo.sql: si una
// lista cambia, cambian las tres.

export const ESTADO_RECHAZADO = 'RECHAZADO';

// Metadatos por estado. `terminal` = el expediente ya no está vivo: no cuenta
// en el "todos menos finalizado" ni en las cifras del resumen.
export const ESTADO_META = {
    FINALIZADO: { color: 'emerald', terminal: true },
    RECHAZADO:  { color: 'red',     terminal: true },
};

export const ESTADOS_TERMINALES = Object.keys(ESTADO_META).filter(k => ESTADO_META[k].terminal);
export const esTerminal = (estado) => !!ESTADO_META[estado]?.terminal;
export const esRechazado = (expOrEstado) =>
    (typeof expOrEstado === 'string' ? expOrEstado : expOrEstado?.estado) === ESTADO_RECHAZADO;

export const RECHAZADO_POR = [
    { value: 'VERIFICADOR', label: 'Verificador' },
    { value: 'MITECO',      label: 'MITECO / Gestor autonómico' },
    { value: 'SO',          label: 'Sujeto Obligado' },
    { value: 'CLIENTE',     label: 'Cliente' },
    { value: 'INSTALADOR',  label: 'Instalador' },
    { value: 'BROKERGY',    label: 'Brokergy' },
];

export const MOTIVOS_RECHAZO = [
    { value: 'DOC_INSUFICIENTE',        label: 'Documentación insuficiente' },
    { value: 'AHORRO_NO_JUSTIFICADO',   label: 'Ahorro no justificado' },
    { value: 'EQUIPO_NO_VALIDO',        label: 'Equipo no válido' },
    { value: 'FUERA_PLAZO',             label: 'Fuera de plazo' },
    { value: 'DUPLICADO',               label: 'Duplicado' },
    { value: 'CLIENTE_DESISTE',         label: 'El cliente desiste' },
    { value: 'INSTALACION_NO_CONFORME', label: 'Instalación no conforme' },
    { value: 'OTRO',                    label: 'Otro' },
];

export const MOTIVO_RECHAZO_MIN = 20;

const etiqueta = (lista, v) => lista.find(o => o.value === v)?.label || v || '—';
export const etiquetaRechazadoPor = (v) => etiqueta(RECHAZADO_POR, v);
export const etiquetaMotivoRechazo = (v) => etiqueta(MOTIVOS_RECHAZO, v);

const fechaCorta = (iso) => {
    const t = Date.parse(iso || '');
    return Number.isNaN(t) ? null : new Date(t).toLocaleDateString('es-ES');
};

/** Texto del tooltip del badge: quién, por qué, cuándo y de dónde venía. */
export function tooltipRechazo(exp) {
    if (!exp) return '';
    const l = [
        `RECHAZADO por ${etiquetaRechazadoPor(exp.rechazado_por)}${fechaCorta(exp.fecha_rechazo) ? ` el ${fechaCorta(exp.fecha_rechazo)}` : ''}`,
        `Motivo: ${etiquetaMotivoRechazo(exp.motivo_rechazo_cat)}`,
    ];
    if (exp.motivo_rechazo) l.push(exp.motivo_rechazo);
    if (exp.estado_previo_rechazo) l.push(`Estado anterior: ${exp.estado_previo_rechazo}`);
    if (exp.rechazo_adjunto_url) l.push(`Adjunto: ${exp.rechazo_adjunto_url}`);
    return l.join('\n');
}

/** Clases del badge / <select> de estado (fondo, texto y borde). */
export function claseEstado(estado) {
    const e = estado || '';
    if (e === 'FINALIZADO') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (e === ESTADO_RECHAZADO) return 'bg-red-500/15 text-red-400 border-red-500/40';
    if (e.includes('REQUERIMIENTO')) return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (e.startsWith('ENVIADO')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-white/5 text-white/50 border-white/10';
}
