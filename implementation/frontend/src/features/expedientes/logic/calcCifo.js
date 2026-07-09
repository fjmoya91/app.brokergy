// Calculadora de fechas CIFO (inicio/fin de actuación): min/max entre la fecha
// de pruebas del certificado de instalación y las fechas de todas las facturas.
//
// IMPORTANTE: es la única fuente de verdad para estas fechas. El campo
// `documentacion.fecha_inicio_cifo` / `fecha_fin_cifo` persistido en BD puede
// quedar desfasado (p.ej. se guardó antes de subir todas las facturas) — NO
// confiar en ese valor guardado, siempre recalcular con esta función a partir
// de `fecha_pruebas_cert_instalacion` + `facturas`.
export function calcCifo(doc) {
    const allDates = [
        doc?.fecha_pruebas_cert_instalacion,
        ...((doc?.facturas || []).map(f => f.fecha_factura))
    ].filter(Boolean);

    if (allDates.length === 0) return { inicio: null, fin: null };
    const sorted = [...allDates].sort();
    return { inicio: sorted[0], fin: sorted[sorted.length - 1] };
}
