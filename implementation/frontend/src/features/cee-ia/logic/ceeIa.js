// ─────────────────────────────────────────────────────────────────────────────
// Generar el CEE inicial con IA desde el botón CE3X — lo que se decide (puro).
//
// El botón CE3X de la calculadora y del módulo CEE ya no abre la envolvente a
// ciegas: pregunta cómo hacer el CEE (con IA, o a mano en la envolvente). Si la
// IA ya lo hizo, abre la envolvente directamente (allí se ve lo que hizo), y si
// la IA está trabajando, enseña en qué va. El estado lo da el backend
// (`GET /api/cee-ia/:negocio/:id`, services/ceeIa.js).
// ─────────────────────────────────────────────────────────────────────────────

export const VIVOS = ['EN_COLA', 'EN_CURSO'];
export const esVivo = (t) => !!t && VIVOS.includes(t.estado) && !t.atascado;

/** Lo que hace el botón al pulsarlo: abrir la envolvente o el popup. */
export function alPulsarCe3x(estado) {
    if (!estado) return 'popup';
    if (esVivo(estado.trabajo)) return 'popup';
    if (estado.expediente) return 'popup';
    return estado.ia?.hecho ? 'abrir' : 'popup';
}

/** «hace 3 min», «hace 2 h», o la fecha si es de otro día. */
export function haceCuanto(iso, ahora = Date.now()) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const s = Math.max(0, Math.round((ahora - t) / 1000));
    if (s < 60) return 'hace un momento';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 6 * 3600) return `hace ${Math.round(s / 3600)} h`;
    return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const fmtUsd = (n) => (Number.isFinite(Number(n)) ? `${Number(n).toFixed(2).replace('.', ',')} $` : '—');

/** Qué orden de la skill está corriendo, en palabras. */
const ORDENES = {
    estado: 'leyendo el expediente', placas: 'leyendo las placas', fotos: 'mirando las fotos',
    paredes: 'trayendo las paredes de Catastro', 'leer-pared': 'contando huecos de una fachada',
    video: 'viendo el vídeo', catastro: 'bajando los documentos de Catastro', aplicar: 'escribiendo y calificando el .cex',
    croquis: 'dibujando el croquis', listo: 'dejándolo listo para firmar', instalacion: 'revisando la instalación',
    eprel: 'buscando la ficha EPREL', keymark: 'buscando el Keymark',
};
export const queHace = (ultima) => (ultima ? (ORDENES[ultima] || ultima) : 'empezando');

/** El texto corto del estado de un trabajo, para la píldora y el popup. */
export function lineaTrabajo(t) {
    if (!t) return null;
    if (t.estado === 'EN_COLA') return `En cola ${haceCuanto(t.pedido_at)}`;
    if (t.estado === 'EN_CURSO') {
        if (t.atascado) return 'El PC ha dejado de responder a medias';
        const p = t.progreso || {};
        return `Generando · ${queHace(p.ultima)} · ${p.vueltas || 0} vueltas · ${fmtUsd(p.coste_usd || 0)}`;
    }
    const r = t.resultado || {};
    if (t.estado === 'HECHO') return `Hecho ${haceCuanto(t.terminado_at)} · ${fmtUsd(r.coste_usd)}`;
    if (t.estado === 'PARCIAL') return `A medias ${haceCuanto(t.terminado_at)} · ${(r.preguntas || []).length} preguntas`;
    if (t.estado === 'CANCELADO') return `Cancelado ${haceCuanto(t.terminado_at || t.pedido_at)}`;
    return `No ha podido ${haceCuanto(t.terminado_at)}`;
}
