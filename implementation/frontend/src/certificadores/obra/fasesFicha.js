// ─── fasesFicha.js — la ficha por FASES ─────────────────────────────────────
// Fran (25/10/2026, «MEJORAS APP CEE»): «las pantallas que sean como por fases,
// porque hay que hacer demasiado scroll». Una fase por pantalla, la barra de
// progreso arriba y «Siguiente» abajo; lo ya hecho se pliega en una línea con
// «Cambiar». Las preguntas siguen saliendo de logic/cuestionario.js (fuente
// única) y obra/pasos.js; aquí solo el orden de las fases y lo que resume cada una.
//
// Lo que se pregunta se ha quedado en lo que la IA NO puede sacar sola: el
// inmueble (lo confirma, viene del Catastro), el titular, para qué es y las
// fotos con sus equipos. El tipo de vivienda, lo que la rodea, las ventanas… se
// DEDUCEN en «Lo que ha visto la IA» (fase 5) y el certificador solo confirma o
// cambia, ANTES de gastar el crédito.
import {
    ACS, CALEFACCION, FASE_IDS, PROPOSITOS, cuentaSlot, propositosDe, slotsAplicables,
} from '../logic/cuestionario';
import { PASOS } from './pasos';

export const FASES = [
    { id: 'inmueble', titulo: 'La vivienda', sub: 'Lo que dice el Catastro' },
    { id: 'titular', titulo: 'El titular', sub: 'Quién pide el certificado' },
    { id: 'proposito', titulo: 'Para qué es', sub: 'Decide las medidas de mejora' },
    { id: 'fotos', titulo: 'Las fotos', sub: 'Fachadas, ventanas y equipos' },
    { id: 'visto_ia', titulo: 'Lo que ha visto la IA', sub: 'Revisa y confirma, sin gastar' },
    { id: 'generar', titulo: 'Pedir el certificado', sub: 'Gasta 1 certificado' },
];
if (FASES.map(f => f.id).join() !== FASE_IDS.join()) throw new Error('fasesFicha.js y FASE_IDS no casan');

export const FASE_POR_ID = Object.fromEntries(FASES.map((f, i) => [f.id, { ...f, n: i + 1 }]));

/** Los `paso` del barrido (secciones de antes) → la fase donde se arreglan. */
export function faseDePaso(paso) {
    if (['inmueble', 'titular', 'proposito', 'fotos'].includes(paso)) return paso;
    if (['calefaccion', 'acs', 'refrigeracion', 'renovables'].includes(paso)) return 'fotos';
    if (['vivienda', 'entorno', 'ventanas'].includes(paso)) return 'visto_ia';
    return 'generar';   // medidas, notas
}

/** Qué le falta a una fase para poder seguir (null = puede seguir). Solo lo que bloquea. */
export function faltaEnFase(id, form, obra) {
    if (id === 'inmueble') {
        if (!obra?.ref_catastral) return 'Falta la referencia catastral.';
        if (!String(form.direccion || '').trim() || !String(form.municipio || '').trim()) return 'Falta la dirección o el municipio.';
    }
    if (id === 'titular' && !String(form.titular?.nombre || '').trim()) return 'Escribe al menos el nombre del titular.';
    if (id === 'proposito' && !propositosDe(form).length) return 'Elige para qué es el certificado.';
    return null;
}

const labelDe = (lista, v) => lista.find(o => o.value === v)?.label || null;

/** Una línea con lo que hay en una fase ya hecha (la que se ve plegada). */
export function resumenFase(id, form, obra, slots) {
    const c = form.cuestionario || {};
    if (id === 'inmueble') {
        return [form.direccion, form.municipio, form.superficie_catastro && `${form.superficie_catastro} m²`, form.anio_construccion]
            .filter(Boolean).join(' · ') || obra?.ref_catastral || '';
    }
    if (id === 'titular') {
        const t = form.titular || {};
        return [[t.nombre, t.apellidos].filter(Boolean).join(' '), t.nif].filter(Boolean).join(' · ');
    }
    if (id === 'proposito') return propositosDe(form).map(v => labelDe(PROPOSITOS, v)).join(' · ');
    if (id === 'fotos') {
        const n = slotsAplicables(c).reduce((s, x) => s + cuentaSlot(slots, x.id), 0);
        const cal = labelDe(CALEFACCION, c.calefaccion);
        const acs = labelDe(ACS, c.acs);
        return [`${n} ${n === 1 ? 'archivo' : 'archivos'}`, cal, acs && `agua: ${acs.toLowerCase()}`].filter(Boolean).join(' · ');
    }
    if (id === 'visto_ia') {
        const v = c.visto_ia || {};
        const n = Object.keys(c.origen || {}).length;
        return v.confirmado_at ? `Confirmado · ${n} ${n === 1 ? 'dato deducido' : 'datos deducidos'}` : 'Sin confirmar';
    }
    return '';
}

/** La fase en la que se está: la primera sin dar por buena. */
export function faseActual(form) {
    const ok = form?.cuestionario?.fases_ok || [];
    return FASES.find(f => !ok.includes(f.id))?.id || 'generar';
}

/** Lo que se enseña de una respuesta ya dada (plegada). */
export function textoRespuesta(p, v) {
    if (p.tipo === 'sino') return v ? 'Sí' : 'No';
    if (p.tipo === 'multi') return (v || []).map(x => p.lista.find(o => o.value === x)?.label || x).join(', ');
    if (p.lista) return p.lista.find(o => o.value === v)?.label || String(v);
    return `${v}${p.sufijo ? ` ${p.sufijo}` : ''}`;
}

// Las preguntas de pasos.js por su clave: «Cambiar» en la fase 5 abre la misma
// pregunta que antes estaba en su sección.
export const PREGUNTA_POR_CLAVE = Object.fromEntries(
    PASOS.flatMap(p => p.preguntas.filter(q => q.k && !q.obra).map(q => [q.k, { ...q, pasoId: p.id }])),
);

// Lo que se enseña en «Lo que ha visto la IA», agrupado. `cuando(c)` como en pasos.js.
const esPiso = (c) => c.tipo_edificio === 'PISO';
const tieneCubierta = (c) => !esPiso(c) || c.posicion_piso === 'ULTIMO';
export const GRUPOS_DATOS = [
    {
        id: 'vivienda', titulo: 'La vivienda',
        claves: ['tipo_edificio', 'posicion_piso', 'plantas', 'sotano', 'cubierta', 'suelo', 'colinda_no_calefactado', 'colindantes', 'patios'],
    },
    {
        id: 'envolvente', titulo: 'Fachadas y ventanas',
        claves: ['fachada', 'aislamiento_fachada', 'aislamiento_cubierta', 'marco', 'vidrio'],
    },
    {
        id: 'instalaciones', titulo: 'Instalaciones',
        claves: ['calefaccion', 'tipo_caldera', 'emisor', 'potencia_kw', 'marca_modelo_calefaccion', 'acs', 'aire_acondicionado', 'num_aires', 'placas_fv'],
    },
];

// El nombre corto de cada dato en la lista (la pregunta entera sale al cambiarlo).
export const ETIQUETA_DATO = {
    tipo_edificio: 'Tipo de vivienda', posicion_piso: 'Planta del piso', plantas: 'Plantas', sotano: 'Sótano',
    cubierta: 'Cubierta', suelo: 'Suelo', colinda_no_calefactado: 'Linda con algo sin calefacción', colindantes: 'Con qué',
    patios: 'Patios interiores', fachada: 'Fachada', aislamiento_fachada: 'Aislamiento de la fachada',
    aislamiento_cubierta: 'Aislamiento de la cubierta', marco: 'Marcos', vidrio: 'Vidrio', calefaccion: 'Calefacción',
    tipo_caldera: 'Tipo de caldera', emisor: 'Emisores', potencia_kw: 'Potencia', marca_modelo_calefaccion: 'Marca y modelo',
    acs: 'Agua caliente', aire_acondicionado: 'Aire acondicionado', num_aires: 'Aparatos de aire', placas_fv: 'Placas fotovoltaicas',
};

/** ¿Se enseña esta clave en la fase 5 para esta vivienda? */
export function claveVisible(k, c) {
    const p = PREGUNTA_POR_CLAVE[k];
    if (!p) return false;
    if (k === 'posicion_piso') return esPiso(c);
    if (k === 'aislamiento_cubierta' || k === 'cubierta') return tieneCubierta(c);
    return !p.cuando || p.cuando(c);
}
