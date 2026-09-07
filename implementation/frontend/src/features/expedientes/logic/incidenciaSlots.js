// ============================================================================
// A QUÉ SLOT pertenece cada incidencia — fuente única.
// ----------------------------------------------------------------------------
// Las incidencias viven en `documentacion.incidencias[]` y hasta ahora solo se
// veían en el aviso de la cabecera: un contador que dice "3 GRAVES" y te deja
// buscando cuál de los ocho documentos falla. Este módulo las reparte por SLOT
// para que cada fila de Documentación enseñe LA SUYA y se pueda subsanar desde
// donde está el problema.
//
// REGLA — el vínculo se GUARDA, no se adivina. Desde 2026-09-07 la incidencia
// lleva `slot` (y `tipo`) desde que nace, porque quien la detecta sabe de qué
// documento habla. La heurística por texto de más abajo es solo para el
// histórico: hay incidencias registradas antes de que existiera el campo, y
// dejarlas fuera de las filas sería esconder justo las más viejas.
//
// REGLA — ante la duda, NINGÚN slot. Una incidencia colgada del documento
// equivocado es peor que una sin colgar: manda a corregir donde no toca, y la
// que sí falla se queda en verde. Lo que no se sabe encajar sigue saliendo en el
// aviso de la cabecera, que no se va a ninguna parte.
// ============================================================================

/** Slots documentales que pueden llevar incidencia, con su etiqueta. */
export const SLOTS_INCIDENCIA = {
    facturas: 'Facturas de la obra',
    anexo_i: 'Anexo I',
    anexo_cesion: 'Convenio de Cesión de Ahorro',
    cert_cifo: 'Certificado CIFO',
    ficha_res: 'Ficha RES',
    anexo_fotografico: 'Anexo Fotográfico',
    cert_rite: 'Certificado RITE',
    cee: 'Certificado de Eficiencia Energética',
};

export const esSlotValido = (s) => Object.prototype.hasOwnProperty.call(SLOTS_INCIDENCIA, String(s || ''));

// Los `tipo` que emiten los detectores (facturaIncidencias, cifoFechas…). Es el
// camino bueno: un código cerrado no depende de cómo esté redactado el texto.
const TIPO_A_SLOT = {
    // facturaIncidencias.js
    UNIDADES_TERMINALES: 'facturas',
    TITULAR: 'facturas',
    EMISOR: 'facturas',
    ALCANCE: 'facturas',
    ALCANCE_SIN_EQUIPO: 'facturas',
    DUPLICADA: 'facturas',
    SERIE_DISTINTA: 'facturas',
    FECHA: 'facturas',
    SOBREFINANCIACION: 'facturas',
    SIN_EQUIPO: 'facturas',
    SIN_DESGLOSE: 'facturas',
    DIRECCION: 'facturas',
    SIN_CLIENTE: 'facturas',
    SIN_FECHA: 'facturas',
    // cifoFechas.js
    FECHAS_CIFO: 'cert_cifo',
    FECHA_FUTURA: 'cert_cifo',
    FECHA_ANTERIOR_CEE: 'cert_cifo',
    SIN_PRUEBAS_RITE: 'cert_rite',
};

// Último recurso, solo para el histórico sin `tipo` ni `slot`. El orden importa:
// gana la primera que case, así que lo más específico va primero ("anexo
// fotográfico" antes que "anexo").
//
// Se busca solo en el ARRANQUE del texto (CABEZA_TEXTO) y se exige que case UN
// solo documento. Las dos condiciones salen de incidencias reales:
//   · "No hay factura de material AISLANTE que respalde la mejora de opacos del
//     CEE final" habla de una factura y menciona el CEE de pasada; leyéndola
//     entera casarían dos y se perdería una asignación buena.
//   · "Documentos pendientes de generar y firmar: ficha RES080…, Anexo I…" habla
//     de VARIOS a la vez: ahí no hay un slot al que colgarla, y elegir el primero
//     pondría en rojo un documento y dejaría los otros en verde.
const CABEZA_TEXTO = 120;
const PISTAS = [
    [/anexo\s*fotogr|informe\s*fotogr|reportaje\s*fotogr/i, 'anexo_fotografico'],
    [/cesi[oó]n\s*(de\s*)?ahorro|convenio\s*de\s*cesi[oó]n/i, 'anexo_cesion'],
    [/anexo\s*i\b|declaraci[oó]n\s*responsable/i, 'anexo_i'],
    [/\bcifo\b|certificado\s*de\s*instalaci[oó]n\s*y\s*fin|certif\.?\s*instalador/i, 'cert_cifo'],
    [/\brite\b|instalaci[oó]n\s*t[eé]rmica/i, 'cert_rite'],
    [/ficha\s*(res|t[eé]cnica\s*res)|res060|res080|res093|ter100/i, 'ficha_res'],
    [/\bfactura/i, 'facturas'],
    // El CEE se queda FUERA de la heurística a propósito: se menciona como punto
    // de referencia en incidencias que van de otra cosa ("…que respalde la mejora
    // de opacos del CEE final") y volvía ambigua una asignación que estaba clara.
    // Su slot sigue existiendo para las incidencias que lo declaren.
];

/**
 * @param {object} inc  una entrada de `documentacion.incidencias[]`
 * @returns {string|null} clave de SLOTS_INCIDENCIA, o null si no se sabe
 */
export function slotDeIncidencia(inc) {
    if (!inc) return null;
    if (esSlotValido(inc.slot)) return inc.slot;

    const porTipo = TIPO_A_SLOT[String(inc.tipo || '').toUpperCase()];
    if (porTipo) return porTipo;

    const cabeza = String(inc.texto || '').slice(0, CABEZA_TEXTO);
    if (!cabeza) return null;
    const casan = new Set();
    for (const [re, slot] of PISTAS) if (re.test(cabeza)) casan.add(slot);
    return casan.size === 1 ? [...casan][0] : null;
}

const abierta = (inc) => inc && inc.estado !== 'SUBSANADA';

/** Las incidencias ABIERTAS de un slot, las graves primero. */
export function incidenciasDeSlot(incidencias, slot) {
    if (!slot) return [];
    return (incidencias || [])
        .filter(i => abierta(i) && slotDeIncidencia(i) === slot)
        .sort((a, b) => (b.severidad === 'GRAVE') - (a.severidad === 'GRAVE'));
}

/**
 * Resumen para pintar la fila: cuántas y de qué gravedad.
 * @returns {{total:number, graves:number, leves:number, hay:boolean, grave:boolean}}
 */
export function resumenSlot(incidencias, slot) {
    const abiertas = incidenciasDeSlot(incidencias, slot);
    const graves = abiertas.filter(i => i.severidad === 'GRAVE').length;
    return { total: abiertas.length, graves, leves: abiertas.length - graves, hay: abiertas.length > 0, grave: graves > 0 };
}

/** Las que no se han sabido encajar en ningún slot: siguen saliendo arriba. */
export function incidenciasSinSlot(incidencias) {
    return (incidencias || []).filter(i => abierta(i) && !slotDeIncidencia(i));
}

/** Todas las abiertas repartidas por slot, para pintar la cabecera de un vistazo. */
export function repartoPorSlot(incidencias) {
    const out = {};
    for (const slot of Object.keys(SLOTS_INCIDENCIA)) {
        const r = resumenSlot(incidencias, slot);
        if (r.hay) out[slot] = r;
    }
    return out;
}
