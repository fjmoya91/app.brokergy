// ─────────────────────────────────────────────────────────────────────────────
// «¿Cumple tu cliente el factor multiplicador?» — las cinco preguntas que ve el
// PARTNER en su oportunidad (Fran, 16/11/2026: «que vea el FM, con su normativa
// bien explicada en un popup»). Fuente única del texto y del veredicto; el backend
// guarda las respuestas con las MISMAS claves (utils/viaFmAlGuardar.js,
// `PREGUNTAS_FM`) y como booleanos: true = sí, false = no, null = no lo sé.
//
// Los requisitos salen de la Resolución del 3/11/2026 (BOE del 7/11), ficha
// RES060_FM: ver docs/conocimiento/calculo/factor-multiplicador-la-resolucion-publicada-res060-fm.md.
// El popup NO cambia la vía: «Pedir que vaya por FM» deja la petición y la vía la
// elige el equipo con su conmutador.
// ─────────────────────────────────────────────────────────────────────────────

export const PREGUNTAS_FM = [
    {
        id: 'caldera',
        texto: '¿La caldera que se quita es de gas natural, propano o gasóleo?',
        ayuda: 'Carbón, leña o pellets van siempre por la vía normal. Caldera eléctrica: pendiente de lo que conteste el Ministerio.',
        // «No» también es una caldera eléctrica: el motivo no puede decir «sólido».
        motivo: 'La caldera no es de gas natural, propano ni gasóleo: va por la vía normal.',
    },
    {
        id: 'habitual',
        texto: '¿Es la vivienda habitual del cliente?',
        ayuda: 'Se demuestra con las facturas de luz o gas del 1/11 al 31/3 del invierno anterior a la obra: seguidas, a la dirección del Catastro y con más de 75 kWh al mes de media.',
        motivo: 'No es su vivienda habitual: va por la vía normal.',
    },
    {
        id: 'aerotermia',
        texto: '¿La aerotermia es aire-agua y da calefacción y agua caliente?',
        ayuda: 'Aire-aire (splits o conductos) no entra. Si solo da calefacción, basta con añadir el depósito de ACS al presupuesto.',
        motivo: 'La aerotermia tiene que dar también el agua caliente: añade el depósito de ACS al presupuesto.',
    },
    {
        id: 'fechas',
        texto: '¿La obra empieza después del 22/03/2026 y se factura antes del 01/12/2027?',
        ayuda: 'Cuenta la fecha de la primera factura de la obra.',
        motivo: 'Fuera de las fechas: va por la vía normal.',
    },
    {
        id: 'retirada',
        texto: '¿Se retira la caldera vieja?',
        ayuda: 'También vale dejarla desconectada, solo para emergencias y sin funcionar a la vez que la aerotermia.',
        motivo: 'Si caldera y aerotermia funcionan juntas es una hibridación: otra ficha, la estudiamos.',
    },
];

export const DOCUMENTOS_FM = [
    ['Facturas de luz o gas del invierno anterior', '(1/11 a 31/3, seguidas): prueban que es su vivienda habitual.'],
    ['Facturas de la obra con el nº de serie', 'de la aerotermia y el depósito.'],
    ['Los litros de inercia', 'de la instalación, según el manual del fabricante. El certificado va dentro del CIFO: lo preparamos nosotros.'],
    ['Oferta de mantenimiento de 2 años', 'firmada por el cliente (la acepte o la rechace).'],
    ['Zonas D y E:', 'la aerotermia con su protección para heladas (resistencias).'],
];

/** Respuestas limpias: solo las cinco claves, cada una true / false / null. */
export function limpiarRespuestas(r) {
    const o = r && typeof r === 'object' ? r : {};
    const out = {};
    for (const p of PREGUNTAS_FM) out[p.id] = o[p.id] === true ? true : o[p.id] === false ? false : null;
    return out;
}

/**
 * Veredicto del popup. `contestadas` cuenta las que tienen respuesta (también
 * «No lo sé»), para distinguir «aún no has empezado» de «faltan por confirmar».
 * @returns {{ estado: 'cumple'|'no_cumple'|'faltan', motivos: string[], faltan: number }}
 */
export function veredictoRequisitosFm(respuestas) {
    const r = limpiarRespuestas(respuestas);
    const motivos = PREGUNTAS_FM.filter(p => r[p.id] === false).map(p => p.motivo);
    const sies = PREGUNTAS_FM.filter(p => r[p.id] === true).length;
    const faltan = PREGUNTAS_FM.length - sies - motivos.length;
    const estado = motivos.length ? 'no_cumple' : faltan === 0 ? 'cumple' : 'faltan';
    return { estado, motivos, faltan };
}
