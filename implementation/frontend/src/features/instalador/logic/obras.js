// ─── obras.js — filtros y textos de la lista de obras del instalador ─────────
// Lo que es una obra (paso, quién, tareas) lo decide el BACKEND
// (`utils/appInstalador.js`); aquí solo se filtra y se cuenta lo que ya llega.
import { sinTildes } from '../ui/piezas';

export const FILTROS = [
    { key: 'todas', texto: 'Todas' },
    { key: 'tu', texto: 'Te toca' },
    { key: 'marcha', texto: 'En marcha' },
    { key: 'cobradas', texto: 'Cobradas' },
];

export function pasaFiltro(obra, filtro) {
    if (filtro === 'tu') return obra.quien === 'tu';
    if (filtro === 'marcha') return obra.quien !== 'fin';
    if (filtro === 'cobradas') return obra.quien === 'fin';
    return true;
}

/** Busca por cliente, dirección, municipio, nº de expediente o de oportunidad, sin tildes. */
export function pasaBusqueda(obra, q) {
    const t = sinTildes(q);
    if (!t) return true;
    const pajar = sinTildes([obra.cliente, obra.direccion, obra.municipio, obra.numero_expediente, obra.id].filter(Boolean).join(' '));
    return t.split(/\s+/).every((w) => pajar.includes(w));
}

export const filtrarObras = (obras, filtro, q) => (obras || []).filter((o) => pasaFiltro(o, filtro) && pasaBusqueda(o, q));

/** «Paso 4 de 5 · Trámite». */
export const textoPaso = (o) => `Paso ${o.paso} de 5 · ${o.fase}`;

/** Una línea para la tarjeta del cliente: «2 obras · 1 te toca». */
export function resumenObrasCliente(obras) {
    const n = obras.length;
    if (!n) return 'Sin obras todavía';
    const tu = obras.filter((o) => o.quien === 'tu').length;
    return `${n} ${n === 1 ? 'obra' : 'obras'}${tu ? ` · ${tu} te ${tu === 1 ? 'toca' : 'tocan'}` : ''}`;
}

/** Lo que dice la tarjeta de la obra cuando no te toca a ti. */
export const TEXTO_QUIEN = {
    nos: 'Ahora lo llevamos nosotros: no tienes que hacer nada. Te avisamos si te necesitamos.',
    cli: 'Estamos esperando a tu cliente (que firme o que acepte). Si le ves, recuérdaselo.',
    fin: 'Obra cobrada. ¡Enhorabuena!',
    tu: '',
};
