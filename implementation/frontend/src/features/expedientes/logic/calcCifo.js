// Calculadora de fechas CIFO (inicio/fin de actuación). INICIO = la primera
// factura (las pruebas RITE solo si aún no hay facturas). FIN = lo último entre la
// última factura y la fecha de pruebas del certificado de instalación (15/11/2026).
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
// TODAS LAS FACTURAS ABREN LA ACTUACIÓN, también la de material o un anticipo
// (2026-11-12). Desde el 30/09 una factura marcada `motivo_no_inicio` ('MATERIAL' |
// 'ANTICIPO') se sacaba del INICIO, y el verificador lo rechazó (Marwen CAE-2078,
// 26RES060_114 y _180): «la fecha de inicio declarada difiere de la fecha de la
// factura en la que se alcanza un primer compromiso en firme para la realización»
// (RD 36/2023). Ahora la marca NO cuenta para nada: el inicio es la primera factura
// que computa (desde el 15/11/2026, aunque las pruebas RITE sean antes). Lo que la marca quería proteger
// —un CEE inicial posterior a la primera factura— lo vigila la regla 199
// (backend/utils/ceeFechas.js, que ya contaba material y anticipos). Una marca
// antigua que siga guardada se LEE (`motivoNoInicio`) solo para avisar en el popup
// «Hitos» y quitarla al guardar.

// UNA FACTURA QUE NO COMPUTA PARA EL CAE NO CUENTA (2026-11-03): la de solo placas
// de un RES060 se registra para el estudio de precios, pero no es obra de la
// actuación, así que ni abre ni cierra (logic/facturasCae.js).

import { facturaComputa } from './facturasCae.js';

// Las marcas que se ponían hasta el 12/11/2026. Ya no se ofrecen ni cuentan: solo
// sirven para reconocer una marca antigua y avisar de que se quita.
export const MOTIVOS_NO_INICIO = {
    MATERIAL: { label: 'Entrega de material', corto: 'entrega de material' },
    ANTICIPO: { label: 'Anticipo', corto: 'anticipo' },
};

/**
 * La marca ANTIGUA de esa factura (MATERIAL / ANTICIPO), o null. Ya no cambia
 * ninguna fecha: solo dice que hay una marca que quitar.
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
    // Solo las que computan para el CAE: una factura entera de placas en un RES060
    // se registra (logic/facturasCae.js) pero no es obra de la actuación.
    const facturas = (doc?.facturas || []).filter(facturaComputa);
    const fechasFactura = facturas.map(f => f?.fecha_factura).filter(Boolean).sort();
    const todas = [pruebas, ...fechasFactura].filter(Boolean).sort();

    // INICIO = la PRIMERA FACTURA, siempre (Fran, 15/11/2026: «Fecha de inicio
    // siempre primera factura sea anticipo o lo que sea»). Las pruebas RITE ya NO
    // abren la actuación aunque sean anteriores: solo se usan de inicio mientras no
    // hay ninguna factura registrada (expediente en curso).
    // FIN = lo ÚLTIMO entre la última factura y las pruebas RITE.
    let inicio = fechasFactura[0] || pruebas || null;
    let fin = todas.length ? todas[todas.length - 1] : null;

    return {
        inicio: manualInicio || inicio,
        fin: manualFin || fin,
    };
}
