// ─── fasesFicha.js — la ficha por FASES ─────────────────────────────────────
// Fran (25/10/2026, «MEJORAS APP CEE»): «las pantallas que sean como por fases,
// porque hay que hacer demasiado scroll». Una fase por pantalla, la barra de
// progreso arriba y «Siguiente» abajo; lo ya hecho se pliega en una línea con
// «Cambiar». Las preguntas siguen saliendo de logic/cuestionario.js (fuente
// única) y obra/pasos.js; aquí solo el orden de las fases y lo que resume cada una.
//
// Lo que se pregunta se ha quedado en lo que la IA NO puede sacar sola: el
// inmueble (lo confirma, viene del Catastro), el titular, para qué es y las
// fotos con sus equipos. El tipo de vivienda, lo que la rodea, las ventanas… los
// saca la IA al hacer el certificado (de las fotos y del Catastro). La fase
// «Lo que ha visto la IA», donde se confirmaban antes de pedir, se QUITÓ el
// 26/10/2026 (Fran: «nos la podemos saltar y que vaya directamente a simular»);
// su pantalla (VistoIa.jsx) y su ruta siguen, sin usar.
import {
    ACS, ANTIGUEDAD_EQUIPO, CALEFACCION, FASE_IDS, ORIGENES, PROPOSITOS, RANGO_ORIGEN, SLOTS, cuentaSlot, estadoEquipos, propositosDe, slotsAplicables,
} from '../logic/cuestionario';
import { PASOS, PASO_POR_ID, contestada } from './pasos';

export const FASES = [
    { id: 'inmueble', titulo: 'La vivienda', sub: 'Lo que dice el Catastro' },
    { id: 'titular', titulo: 'El titular', sub: 'Quién pide el certificado' },
    { id: 'proposito', titulo: 'Para qué es', sub: 'Decide las medidas de mejora' },
    { id: 'fotos', titulo: 'Las fotos', sub: 'Fachadas, ventanas y equipos' },
    { id: 'generar', titulo: 'Pedir el certificado', sub: 'Gasta 1 certificado' },
];
if (FASES.map(f => f.id).join() !== FASE_IDS.join()) throw new Error('fasesFicha.js y FASE_IDS no casan');

export const FASE_POR_ID = Object.fromEntries(FASES.map((f, i) => [f.id, { ...f, n: i + 1 }]));

/** Los `paso` del barrido (secciones de antes) → la fase donde se arreglan. */
export function faseDePaso(paso) {
    if (['inmueble', 'titular', 'proposito', 'fotos'].includes(paso)) return paso;
    if (['calefaccion', 'acs', 'refrigeracion', 'renovables'].includes(paso)) return 'fotos';
    return 'generar';   // vivienda, entorno, ventanas (los saca la IA), medidas, notas
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

// «Lo que ha visto la IA» con el GUION DE CE3X (Fran, 25/10/2026: «que siga el
// mismo guion que CE3X para que la curva de aprendizaje sea más rápida» y «menos
// preguntas, más directo»): las pestañas de CE3X (Datos generales · Envolvente
// térmica · Instalaciones) y UNA línea por elemento de CE3X (la cubierta, el muro
// de fachada, los huecos, cada equipo…), no una por pregunta. «Cambiar» abre las
// preguntas de ese elemento.
const esPiso = (c) => c.tipo_edificio === 'PISO';
const tieneCubierta = (c) => !esPiso(c) || c.posicion_piso === 'ULTIMO';
const acsMixta = (c) => c.acs === 'misma_caldera' || (c.acs === 'aerotermia' && c.calefaccion === 'aerotermia');
export const PESTANAS_CE3X = [
    {
        id: 'generales', titulo: 'Datos generales',
        elementos: [
            { id: 'edificio', titulo: 'Tipo de edificio', claves: ['tipo_edificio', 'posicion_piso', 'plantas', 'altura_libre'] },
        ],
    },
    {
        id: 'envolvente', titulo: 'Envolvente térmica',
        elementos: [
            { id: 'cubierta', titulo: 'Cubierta', claves: ['cubierta', 'aislamiento_cubierta'] },
            { id: 'fachada', titulo: 'Muro de fachada', claves: ['fachada', 'aislamiento_fachada', 'patios'] },
            { id: 'particion', titulo: 'Partición interior', claves: ['colinda_no_calefactado', 'colindantes'] },
            { id: 'suelo', titulo: 'Suelo', claves: ['suelo', 'sotano'] },
            { id: 'huecos', titulo: 'Huecos', claves: ['marco', 'vidrio', 'persianas'] },
        ],
    },
    {
        id: 'instalaciones', titulo: 'Instalaciones',
        elementos: [
            {
                id: 'calefaccion', equipo: 'CALDERA',
                titulo: c => (c.calefaccion === 'no_tiene' ? 'Calefacción'
                    : c.calefaccion === 'bomba_aire' ? 'Equipo de calefacción y refrigeración'
                        : acsMixta(c) ? 'Equipo mixto de calefacción y ACS' : 'Equipo de sólo calefacción'),
                claves: ['calefaccion', 'tipo_caldera', 'emisor', 'potencia_kw', 'marca_modelo_calefaccion'],
            },
            { id: 'acs', titulo: 'Equipo de ACS', claves: ['acs', 'termo_extra', 'litros_termo'] },
            { id: 'refrigeracion', equipo: 'AIRE', titulo: 'Equipo de refrigeración', claves: ['aire_acondicionado', 'num_aires', 'tipo_aire'] },
            { id: 'contribuciones', titulo: 'Contribuciones energéticas', claves: ['placas_fv', 'kwp'] },
        ],
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

const vacio = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
const tituloDe = (el, c) => (typeof el.titulo === 'function' ? el.titulo(c) : el.titulo);

// Un sí/no dicho en una línea; null = lo dice ya otra clave más concreta.
const FRASE_SINO = {
    colinda_no_calefactado: ['Linda con algo sin calefacción', 'No linda con nada sin calefacción'],
    patios: ['con patios interiores', 'sin patios interiores'],
    persianas: ['con persianas', 'sin persianas'],
    aire_acondicionado: ['Tiene aire acondicionado', 'No tiene aire acondicionado'],
    termo_extra: ['y un termo eléctrico', 'sin termo eléctrico aparte'],
};
const LO_DICE = { colinda_no_calefactado: 'colindantes', aire_acondicionado: 'num_aires' };

function fraseDato(k, p, v, c) {
    if (p.tipo === 'sino') {
        if (v === true && LO_DICE[k] && !vacio(c[LO_DICE[k]])) return null;
        return FRASE_SINO[k]?.[v ? 0 : 1] || `${(ETIQUETA_DATO[k] || p.titulo).toLowerCase()}: ${v ? 'sí' : 'no'}`;
    }
    if (k === 'plantas') return `${v} ${Number(v) === 1 ? 'planta' : 'plantas'}`;
    if (k === 'num_aires') return `${v} ${Number(v) === 1 ? 'aparato' : 'aparatos'}`;
    if (k === 'altura_libre') return `${v} m de altura libre`;
    if (k === 'colindantes') return `Linda con ${textoRespuesta(p, v).toLowerCase()}`;
    if (k === 'aislamiento_fachada' || k === 'aislamiento_cubierta') return `aislamiento: ${textoRespuesta(p, v).toLowerCase()}`;
    return textoRespuesta(p, v);
}

/** Las claves de un elemento que se enseñan para esta vivienda. */
export function clavesDe(el, c) {
    return el.claves.filter(k => claveVisible(k, c));
}

/** Los elementos de una pestaña que tienen algo que enseñar, con su título ya resuelto. */
export function elementosVisibles(pestana, c) {
    return pestana.elementos
        .map(el => ({ ...el, titulo: tituloDe(el, c), claves: clavesDe(el, c) }))
        .filter(el => el.claves.length);
}

/**
 * La línea de un elemento: lo que hay, sus notas y de dónde sale.
 * `origen`: el MENOS fiable de lo deducido (un supuesto se ve aunque lo demás sea dato);
 * 'TU' si todo lo contestó él; null si no hay nada (CE3X pone lo de su año).
 */
export function lineaElemento(el, c) {
    const partes = [];
    const notas = [];
    let peor = null;
    let suyo = false;
    for (const k of el.claves) {
        const v = c[k];
        if (vacio(v)) continue;
        const f = fraseDato(k, PREGUNTA_POR_CLAVE[k], v, c);
        if (f) partes.push(f);
        const o = c.origen?.[k];
        if (!o) { suyo = true; continue; }
        if (!peor || (RANGO_ORIGEN[o] || 0) < (RANGO_ORIGEN[peor] || 0)) peor = o;
        const nota = c.visto_ia?.notas?.[k];
        if (nota && !notas.includes(nota)) notas.push(nota);
    }
    if (el.equipo && c.fotos_decision?.[el.equipo] === 'GENERICA') {
        const a = ANTIGUEDAD_EQUIPO.find(x => x.value === c.fotos_antiguedad?.[el.equipo])?.label;
        partes.push(`equipo genérico${a ? ` (${a.toLowerCase()})` : ''}`);
    }
    const texto = partes.join(' · ');
    return {
        texto: texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '',
        notas,
        origen: peor || (suyo ? 'TU' : null),
        supuesto: !!peor && ORIGENES[peor]?.fiable === false,
    };
}

/**
 * Las fotos de la fase 4 que se ven AHORA en pantalla, en su orden (el de
 * FaseFotos.jsx: la casa y luego cada equipo cuando se ha contestado lo anterior),
 * con si ya tienen archivo. Es el índice «Ir a…» de la visita (Fran, 26/10/2026:
 * «en cualquier momento debes poder ir a la foto de la fachada o de la caldera»).
 * Si cambia cuándo sale un equipo en FaseFotos, cambia aquí también.
 */
export function fotosDeLaFase(form, slots) {
    const c = form.cuestionario || {};
    const aplican = slotsAplicables(c);
    const porId = Object.fromEntries(SLOTS.map(s => [s.id, s]));
    const aplica = (id) => aplican.some(s => s.id === id);
    const hecha = (paso, k) => contestada(PASO_POR_ID[paso].preguntas.find(q => q.k === k), form);
    const verAcs = hecha('calefaccion', 'calefaccion');
    const verAire = verAcs && hecha('acs', 'acs');
    const conBombaAire = c.calefaccion === 'bomba_aire';
    const verPlacas = verAire && (conBombaAire || hecha('refrigeracion', 'aire_acondicionado'));
    const eqCal = { gas: 'CALDERA', glp: 'CALDERA', gasoleo: 'CALDERA', biomasa: 'CALDERA', carbon: 'CALDERA', aerotermia: 'AEROTERMIA', bomba_aire: 'AIRE' }[c.calefaccion];
    const eqAcs = { termo: 'TERMO', calentador: 'TERMO', solar: 'SOLAR' }[c.acs] || (c.acs === 'aerotermia' && c.calefaccion !== 'aerotermia' ? 'AEROTERMIA' : null);
    const equipos = [
        verAcs && eqCal,
        verAcs && (eqAcs || (c.termo_extra === true ? 'TERMO' : null)),
        verAire && c.aire_acondicionado === true && !conBombaAire && 'AIRE',
        verPlacas && c.placas_fv === 'SI' && c.acs !== 'solar' && 'SOLAR',
    ].filter(Boolean);
    const deEquipos = [...new Set(equipos)].flatMap(eq => estadoEquipos(c, slots).find(e => e.equipo === eq)?.slots || []);
    const vivienda = ['FOTO_FACHADA_PRINCIPAL', 'FOTO_FACHADAS', 'FOTO_PATIOS_INTERIORES', 'FOTO_VENTANAS', 'FOTO_CUBIERTA', 'VIDEO_VIVIENDA'].filter(aplica);
    return [...vivienda, ...deEquipos].filter(id => porId[id]).map(id => ({
        id, label: porId[id].label, hecho: cuentaSlot(slots, id) > 0,
    }));
}
