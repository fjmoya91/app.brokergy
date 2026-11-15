// ============================================================================
// medidasObra.js — las medidas de mejora que pidió la OBRA (app de
// certificadores) frente a las que de verdad va a escribir el `.cex`.
//
// En la obra el certificador elige qué medidas quiere (`cuestionario.medidas`,
// catálogo `MEDIDAS` de `certificadores/logic/cuestionario.js`; sin elegir, las
// sugeridas con `medidasSugeridas`). La ventana de la envolvente no lo sabía:
// la pestaña decía «ninguna: el .cex sale sin medidas» en 2026EXT_1 mientras el
// PC había dejado en la receta la aerotermia como MEDIDA LIBRE
// (`ajustes.medidas_libres`) y el `.cex` de Drive la llevaba (Fran, 28/10/2026:
// «quiero que en la app envolvente aparezcan descritas tal y como van a
// aparecer en CE3X»).
//
// REGLA — lo pedido se CRUZA con lo que se escribe, y lo que falta se dice con
// lo que hay que hacer. Una medida pedida que no va en el `.cex` no se calla:
// sale «falta» con su porqué, y si la app la sabe componer, un botón.
//
// Puro (sin React): lo prueba `backend/scripts/test_medidas_obra.mjs`.
// ============================================================================

import { MEDIDAS, medidasSugeridas, propositosDe } from '../../../certificadores/logic/cuestionario.js';

/** Lo que pidió la obra: `{ ids, sugeridas }` (sugeridas = no eligió y se proponen las de la casa). */
export function medidasPedidasDeLaObra(obra = {}) {
    const c = obra.cuestionario || {};
    const elegidas = Array.isArray(c.medidas) ? c.medidas.filter(v => MEDIDAS.some(m => m.value === v)) : [];
    if (elegidas.length) return { ids: elegidas, sugeridas: false };
    return { ids: medidasSugeridas(c, propositosDe(obra)), sugeridas: true };
}

const etiqueta = (id) => MEDIDAS.find(m => m.value === id)?.label || id;

const FV = /FOTOVOLT|PLACAS|AUTOCONSUMO/;
const AERO = /AEROTERM|BOMBA DE CALOR/;
const nombreDe = (l) => String(l?.nombre || '').toUpperCase();

//: Qué medida del catálogo de la pestaña, o qué medida LIBRE, cumple cada una
//: de las de la obra. Por el NOMBRE en las libres: es lo que se escribe en CE3X
//: y lo que lee el certificador.
const CUMPLE = {
    AEROTERMIA: { cat: 'aerotermia', libre: (n) => AERO.test(n) && !FV.test(n) },
    AEROTERMIA_FV: { cat: 'aerotermia_fv', libre: (n) => AERO.test(n) && FV.test(n) },
    PLACAS_FV: { cat: 'autoconsumo', libre: (n) => FV.test(n) && !AERO.test(n) },
    VENTANAS: { libre: (n) => /VENTANA|HUECO|CARPINTER|ACRISTAL/.test(n) },
    AISLAMIENTO_FACHADA: { libre: (n) => /AISLA/.test(n) && /FACHADA|MURO/.test(n) },
    AISLAMIENTO_CUBIERTA: { libre: (n) => /AISLA/.test(n) && /CUBIERTA|TEJADO/.test(n) },
};

/**
 * Cada medida pedida, con si va en el `.cex` y, si no, por qué y qué hacer.
 * `marcadas`: ids del catálogo que se escriben · `libres`: las de la receta.
 * Devuelve `[{ id, etiqueta, va, como, falta, componible }]`.
 */
export function cruceMedidasObra({ pedidas = [], marcadas = [], catalogo = [], libres = [] } = {}) {
    return pedidas.map((id) => {
        const r = CUMPLE[id] || {};
        const cat = r.cat ? catalogo.find(m => m.id === r.cat) : null;
        const libre = (libres || []).find(l => r.libre?.(nombreDe(l)));
        const enCatalogo = !!cat?.disponible && marcadas.includes(cat.id);
        const base = { id, etiqueta: etiqueta(id) };
        if (libre) return { ...base, va: true, como: `«${libre.nombre}»` };
        if (enCatalogo) return { ...base, va: true, como: `«${cat.datos?.nombre || cat.titulo}»` };
        if (cat?.disponible) return { ...base, va: false, falta: 'Está en la lista, sin marcar: márcala.' };
        if (id === 'AEROTERMIA') {
            return { ...base, va: false, componible: true,
                     falta: 'Aún no hay equipo elegido: se puede poner la aerotermia genérica (SCOP 4,00 y 3,00), '
                          + 'como la deja el PC.' };
        }
        if (id === 'AEROTERMIA_FV' || id === 'PLACAS_FV') {
            return { ...base, va: false,
                     falta: 'Las placas se dimensionan con el consumo que calcule CE3X y PVGIS: las añade el PC '
                          + 'al generar el CEE (skill generar-cee-inicial).' };
        }
        return { ...base, va: false,
                 falta: 'La ventana todavía no compone esta medida: la pone el PC como medida libre.' };
    });
}

//: La caldera que se sustituye, como la nombra el PC en la medida libre.
const CALDERA = {
    gasoleo: 'LA CALDERA DE GASÓLEO', gas: 'LA CALDERA DE GAS', glp: 'LA CALDERA DE GLP',
    carbon: 'LA CALDERA DE CARBÓN', electrica: 'LA CALEFACCIÓN ELÉCTRICA',
};
const CALDERA_TXT = {
    gasoleo: 'la caldera de gasóleo', gas: 'la caldera de gas', glp: 'la caldera de GLP',
    carbon: 'la caldera de carbón', electrica: 'la calefacción eléctrica',
};

/**
 * La AEROTERMIA GENÉRICA como MEDIDA LIBRE, la misma que deja el PC en una obra
 * sin equipo elegido (2026EXT_1, 28/10/2026): bomba de calor aire-agua para
 * calefacción y ACS, SCOP 4,00 / 3,00, 15.000 € y 15 años. `calefaccion`: la del
 * cuestionario de la obra. Sin caldera que sustituir (o de biomasa, que tiene
 * otra justificación) no se compone: `null`.
 */
export function aerotermiaGenericaLibre({ calefaccion, superficie } = {}) {
    const k = String(calefaccion || '').toLowerCase();
    if (!CALDERA[k]) return null;
    const s = Math.round(Number(superficie) || 0) || null;
    return {
        nombre: `SUSTITUCIÓN DE ${CALDERA[k]} POR AEROTERMIA (CALEFACCIÓN Y ACS)`,
        inversion: 15000,
        vida_util: 15,
        secuencia: 2,
        caracteristicas: `Sustitución de ${CALDERA_TXT[k]} existente por una bomba de calor aire-agua (aerotermia) `
            + 'que da la calefacción por los emisores existentes y el agua caliente sanitaria. SCOP calefacción 4,00 '
            + 'y SCOP ACS 3,00 (valores genéricos: sustituir por los del equipo elegido).',
        otros_datos: 'Equipo genérico: sin modelo elegido todavía.',
        justificacion: 'El generador actual, de bajo rendimiento estacional, concentra la mayor parte del consumo '
            + 'de energía primaria no renovable y de las emisiones de CO2 del edificio. Su sustitución por una bomba '
            + 'de calor aerotérmica, que aprovecha la energía renovable contenida en el aire exterior con un '
            + 'rendimiento estacional (SCOP) varias veces superior, es la medida que más reduce el consumo de energía '
            + 'primaria no renovable y las emisiones de todas las analizadas, y se integra en la instalación existente '
            + 'sin modificar los emisores. Se ejecuta después de las mejoras de la envolvente, si las hay, para '
            + 'dimensionar el equipo a la demanda ya reducida.',
        instalaciones: [{
            slot: 'mixto2', nombre: 'AEROTERMIA GENÉRICA (CALEFACCIÓN Y ACS)',
            generador: 'Bomba de Calor - Caudal Ref. Variable', tipo_bdc: 1,
            combustible: 'Electricidad', rendimiento: 'conocido',
            pct_calefaccion: '100', rend_calefaccion: '400', pct_acs: '100', rend_acs: '300',
            ...(s ? { superficie_calefaccion: s, superficie_acs: s } : {}),
        }],
    };
}

/** Los equipos de una medida libre, en una línea por equipo, como los verá CE3X. */
export function equiposDeLibre(l) {
    return (l?.instalaciones || []).map((i) => {
        const p = [];
        if (i.generador) p.push(i.generador);
        if (i.combustible) p.push(i.combustible);
        if (i.rend_calefaccion) p.push(`calefacción ${i.pct_calefaccion || 100} % · rend. ${i.rend_calefaccion} %`);
        if (i.rend_acs) p.push(`ACS ${i.pct_acs || 100} % · rend. ${i.rend_acs} %`);
        if (i.potencia_pico_kwp) p.push(`${String(i.potencia_pico_kwp).replace('.', ',')} kWp`);
        if (i.superficie_calefaccion) p.push(`${i.superficie_calefaccion} m²`);
        return `${i.nombre || 'Equipo'} — ${p.join(' · ')}`;
    });
}
