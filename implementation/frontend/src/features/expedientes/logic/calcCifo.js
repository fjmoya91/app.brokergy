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
export function calcCifo(doc) {
    const manualInicio = doc?.fecha_inicio_cifo_manual || null;
    const manualFin = doc?.fecha_fin_cifo_manual || null;

    const allDates = [
        doc?.fecha_pruebas_cert_instalacion,
        ...((doc?.facturas || []).map(f => f.fecha_factura))
    ].filter(Boolean);

    let inicio = null;
    let fin = null;
    if (allDates.length > 0) {
        const sorted = [...allDates].sort();
        inicio = sorted[0];
        fin = sorted[sorted.length - 1];
    }

    return {
        inicio: manualInicio || inicio,
        fin: manualFin || fin,
    };
}
