// ─── obras.js — filtros y textos de la lista de obras del instalador ─────────
// Lo que es una obra (paso, quién, tareas) lo decide el BACKEND
// (`utils/appInstalador.js`); aquí solo se filtra, se ordena y se cuenta lo que ya llega.
//
// Los filtros (22/11/2026, Fran: «se debe poder filtrar las que son oportunidades de las que
// son obras en curso»). Antes eran Todas · Te toca · En marcha · Cobradas, y «En marcha» salía
// igual que «Todas» (11 y 11): nada separaba lo que el cliente aún no ha aceptado de lo que ya
// es obra. Ahora son DOS ejes que se combinan, más pueblo, tipo y orden:
//   · ETAPA (de qué se trata): Oportunidades (pasos 1-2, sin aceptar) · En obra (pasos 3-4) ·
//     Cobradas (paso 5).
//   · QUIÉN la tiene: Te toca · Espera al cliente · Lo llevamos nosotros.
// Las cifras de cada botón se cuentan con los DEMÁS filtros puestos: lo que dice el botón es lo
// que sale al pulsarlo.
import { sinTildes } from '../ui/piezas';

export const ETAPAS = [
    { key: 'todas', texto: 'Todas' },
    { key: 'oportunidades', texto: 'Oportunidades', ayuda: 'Simuladas o con la propuesta enviada: el cliente aún no ha aceptado' },
    { key: 'obra', texto: 'En obra', ayuda: 'Aceptadas y en trámite' },
    { key: 'cobradas', texto: 'Cobradas' },
];

export const QUIENES = [
    { key: 'tu', texto: 'Te toca' },
    { key: 'cli', texto: 'Espera al cliente' },
    { key: 'nos', texto: 'Lo llevamos nosotros' },
];

export const ORDENES = [
    { key: 'urgente', texto: 'Lo que te toca primero' },
    { key: 'reciente', texto: 'Lo último que se ha movido' },
    { key: 'bono', texto: 'Bono más alto' },
    { key: 'cliente', texto: 'Cliente (A-Z)' },
    { key: 'pueblo', texto: 'Pueblo (A-Z)' },
];

/** Compatibilidad con lo recordado antes de los filtros nuevos (`memoriaVista`). */
export function filtrosIniciales(m = {}) {
    const etapa = ETAPAS.some((e) => e.key === m.etapa) ? m.etapa : m.filtro === 'cobradas' ? 'cobradas' : 'todas';
    const quien = QUIENES.some((x) => x.key === m.quien) ? m.quien : m.filtro === 'tu' ? 'tu' : null;
    return {
        etapa, quien,
        pueblo: typeof m.pueblo === 'string' && m.pueblo ? m.pueblo : null,
        tipo: typeof m.tipo === 'string' && m.tipo ? m.tipo : null,
        orden: ORDENES.some((o) => o.key === m.orden) ? m.orden : 'urgente',
    };
}

export function etapaDe(obra) {
    if (obra.paso >= 5 || obra.quien === 'fin') return 'cobradas';
    if (obra.paso >= 3 || obra.con_expediente) return 'obra';
    return 'oportunidades';
}

/** Mismo texto para el filtro que para la lista: «Villanueva del Campo». */
export const puebloDe = (o) => (o.municipio || '').trim();

/** Busca por cliente, dirección, municipio, nº de expediente o de oportunidad, sin tildes. */
export function pasaBusqueda(obra, q) {
    const t = sinTildes(q);
    if (!t) return true;
    const pajar = sinTildes([obra.cliente, obra.direccion, obra.municipio, obra.numero_expediente, obra.id].filter(Boolean).join(' '));
    return t.split(/\s+/).every((w) => pajar.includes(w));
}

/** ¿Pasa los filtros? `sin` deja fuera uno (para contar lo que saldría al pulsar ese botón). */
export function pasaFiltros(o, f, sin = null) {
    if (sin !== 'etapa' && f.etapa && f.etapa !== 'todas' && etapaDe(o) !== f.etapa) return false;
    if (sin !== 'quien' && f.quien && o.quien !== f.quien) return false;
    if (sin !== 'pueblo' && f.pueblo && sinTildes(puebloDe(o)) !== sinTildes(f.pueblo)) return false;
    if (sin !== 'tipo' && f.tipo && o.tipo !== f.tipo) return false;
    if (sin !== 'q' && !pasaBusqueda(o, f.q)) return false;
    return true;
}

const RANGO_QUIEN = { tu: 0, cli: 1, nos: 2, fin: 3 };
const fecha = (o) => Date.parse(o.actualizada || '') || 0;
const porTexto = (a, b) => (a || '').localeCompare(b || '', 'es', { sensitivity: 'base' });

export function ordenarObras(obras, orden) {
    const l = [...obras];
    if (orden === 'reciente') return l.sort((a, b) => fecha(b) - fecha(a));
    if (orden === 'bono') return l.sort((a, b) => (b.bono ?? -1) - (a.bono ?? -1));
    if (orden === 'cliente') return l.sort((a, b) => porTexto(a.cliente, b.cliente));
    if (orden === 'pueblo') return l.sort((a, b) => porTexto(puebloDe(a), puebloDe(b)) || porTexto(a.cliente, b.cliente));
    // urgente: lo que te toca, luego lo que espera al cliente, lo nuestro y lo cobrado; dentro, lo último movido
    return l.sort((a, b) => (RANGO_QUIEN[a.quien] ?? 9) - (RANGO_QUIEN[b.quien] ?? 9) || fecha(b) - fecha(a));
}

export const filtrarObras = (obras, f) => ordenarObras((obras || []).filter((o) => pasaFiltros(o, f)), f.orden);

/** Cifras de cada botón con los demás filtros puestos, y las opciones de pueblo y tipo. */
export function cuentasFiltros(obras, f) {
    const l = obras || [];
    const sinEtapa = l.filter((o) => pasaFiltros(o, f, 'etapa'));
    const sinQuien = l.filter((o) => pasaFiltros(o, f, 'quien'));
    const etapa = { todas: sinEtapa.length };
    for (const e of ETAPAS.slice(1)) etapa[e.key] = sinEtapa.filter((o) => etapaDe(o) === e.key).length;
    const quien = {};
    for (const x of QUIENES) quien[x.key] = sinQuien.filter((o) => o.quien === x.key).length;
    const opciones = (clave, valor) => {
        const m = new Map();
        for (const o of l.filter((o2) => pasaFiltros(o2, f, clave))) {
            const v = valor(o);
            if (v) m.set(v, (m.get(v) || 0) + 1);
        }
        return [...m.entries()].map(([v, n]) => ({ v, n })).sort((a, b) => porTexto(a.v, b.v));
    };
    return { etapa, quien, pueblos: opciones('pueblo', puebloDe), tipos: opciones('tipo', (o) => o.tipo) };
}

/** ¿Hay algo puesto además de la búsqueda? (para «Quitar filtros»). */
export const hayFiltros = (f) => (f.etapa && f.etapa !== 'todas') || !!f.quien || !!f.pueblo || !!f.tipo;

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
