// Calculadora de fechas CIFO (inicio/fin de actuación): min/max entre la fecha
// de pruebas del certificado de instalación y las fechas de todas las facturas.
//
// IMPORTANTE: es la única fuente de verdad para estas fechas. El campo
// `documentacion.fecha_inicio_cifo` / `fecha_fin_cifo` persistido en BD puede
// quedar desfasado (p.ej. se guardó antes de subir todas las facturas) — NO
// confiar en ese valor guardado, siempre recalcular con esta función a partir
// de `fecha_pruebas_cert_instalacion` + `facturas`.
//
// OVERRIDE MANUAL: el usuario puede fijar a mano estas fechas (p.ej. para
// atender un requerimiento). Si existe `fecha_inicio_cifo_manual` /
// `fecha_fin_cifo_manual` en el doc, ese valor MANDA sobre el cálculo
// automático. Como todos los consumidores (CIFO, fichas RES, docs de lote)
// llaman a esta función, el override se respeta en todas partes sin tocarlos.
// Para volver al automático basta con vaciar el override (queda null).
//
// UNA FACTURA PUEDE NO ABRIR LA ACTUACIÓN (2026-09-30). La fecha de una factura
// no es la fecha en que se ejecutó la obra: el instalador factura el EQUIPO cuando
// se lo entregan, o cobra un anticipo, semanas antes de empezar. Con el mínimo a
// secas, esa factura fijaba el inicio de la actuación antes del CEE inicial y el
// verificador abría un requerimiento sobre una obra que todavía no existía (medido
// en 26RES093_11: la bomba de calor se facturó el 29/05/2026, el CEE inicial se
// firmó el 01/09 y la instalación se facturó el 11/09).
// `facturas[].motivo_no_inicio` ('MATERIAL' | 'ANTICIPO') la saca del INICIO — no
// del fin, ni de la lista de facturas asociadas, ni de la inversión: sigue siendo
// una factura del expediente. Lo marca una persona; nunca se deduce. Y lo explica
// el propio CIFO en «Hitos de la actuación» (ver hitosActuacion.js).

// Por qué una factura no abre la actuación. Fuente única: la usan el cálculo, el
// bloque de hitos del CIFO, la aclaración sugerida y el popup donde se marca.
export const MOTIVOS_NO_INICIO = {
    MATERIAL: { label: 'Entrega de material', corto: 'entrega de material' },
    ANTICIPO: { label: 'Anticipo', corto: 'anticipo' },
};

/**
 * El motivo por el que ESA factura no abre la actuación, o null si la abre.
 * Se lee sin distinguir mayúsculas: el PUT del expediente pasa `documentacion`
 * por `normalizeData`, que sube los valores a MAYÚSCULAS.
 */
export function motivoNoInicio(factura) {
    const v = String(factura?.motivo_no_inicio || '').trim().toUpperCase();
    return MOTIVOS_NO_INICIO[v] ? v : null;
}

export function calcCifo(doc) {
    const manualInicio = doc?.fecha_inicio_cifo_manual || null;
    const manualFin = doc?.fecha_fin_cifo_manual || null;

    const pruebas = doc?.fecha_pruebas_cert_instalacion || null;
    const facturas = doc?.facturas || [];
    const todas = [pruebas, ...facturas.map(f => f?.fecha_factura)].filter(Boolean);
    // Las que pueden abrir la actuación. Si al quitar las marcadas no queda NADA
    // (todas marcadas y sin fecha de pruebas), se usan todas: una fecha de inicio
    // discutible es mejor que un CIFO sin fecha de inicio.
    const abren = [pruebas, ...facturas.filter(f => !motivoNoInicio(f)).map(f => f?.fecha_factura)].filter(Boolean);

    let inicio = null;
    let fin = null;
    if (todas.length > 0) {
        const sorted = [...todas].sort();
        fin = sorted[sorted.length - 1];
        inicio = (abren.length ? [...abren].sort() : sorted)[0];
    }

    return {
        inicio: manualInicio || inicio,
        fin: manualFin || fin,
    };
}
