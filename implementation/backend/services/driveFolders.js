// ─── Carpetas de estado de Drive: registro único + reglas de destino ──────────
//
// La carpeta de Drive de un expediente DEBE reflejar en qué punto del ciclo está.
// Antes esto solo pasaba al aceptar la oportunidad (se dejaba en "03. ACEPTADO" y
// ahí se quedaba para siempre), así que "04. EN CURSO" y "05. DOC. COMPLETA"
// estaban vacías y la carpeta no decía nada.
//
// Aquí viven DOS cosas y nada más:
//   1. Los IDs de las carpetas de estado (env primero, constante de respaldo).
//   2. Las funciones PURAS que deciden a qué carpeta va cada cosa.
// El movimiento en sí lo hace expedienteFolderSync.js.
//
// REGLA DE ORO: en cuanto un expediente entra en un LOTE, su carpeta vive DENTRO
// de la carpeta del lote y no vuelve a salir por su cuenta. A partir de ahí es el
// ESTADO DEL LOTE el que mueve la carpeta del lote entera (con todo dentro).

const { rankEstado } = require('../utils/expedienteEstados');

// Los IDs son estables (creadas a mano en el Drive de Brokergy). El env manda por
// si algún día se recrean; el respaldo evita tener que tocar el .env del VPS.
const FOLDERS = {
    OPORTUNIDADES:      process.env.DRIVE_ROOT_FOLDER_ID            || '1YNImdjT3f5Z-ORv9K9JL-AfAc9_1lfEe', // 01
    SIMULACION_ENVIADA: process.env.DRIVE_FOLDER_ENVIADA            || '1C4XSprT61mOgpW6LSNXwXefwuFRqudjn', // 02
    ACEPTADO:           process.env.DRIVE_FOLDER_ACEPTADA           || '1L2Wl9OIOpvmihySZkT09S1FG14Pu3VNy', // 03
    EN_CURSO:           process.env.DRIVE_FOLDER_EN_CURSO           || '1sXDU-s-MqZ6EJSZnoMtAXJHcm_AIjL78', // 04
    DOC_COMPLETA:       process.env.DRIVE_FOLDER_DOC_COMPLETA       || '1GQmpo7sC40xXmvs3ja6McIona7w4TuHv', // 05
    LISTO_VERIFICAR:    process.env.DRIVE_FOLDER_LISTO_VERIFICAR    || '1nyGRAWy_SgcJsB_0auOPmGGk_C6cdOJv', // 06
    ENVIADOS_VERIFICAR: process.env.DRIVE_FOLDER_ENVIADOS_VERIFICAR || '1Rc-b_sBc-v2pOTcAmyDZSL9sVZ8nEpYr', // 07
    PAGO_BROKERGY:      process.env.DRIVE_FOLDER_PAGO_BROKERGY      || '14F7GskdnMZi_ebOJXmzkBjuUGqy1lKKg', // 08
    PAGO_CLIENTE:       process.env.DRIVE_FOLDER_PAGO_CLIENTE       || '1DpmOHoeb7FnCqRB9dP7kBNLujToqc3FF', // 09
    REQUERIMIENTO:      process.env.DRIVE_FOLDER_REQUERIMIENTO      || '1Dg7zit68_E3vtS1QkamjY_0q2yWQvi_N', // 10
    FINALIZADOS:        process.env.DRIVE_FOLDER_FINALIZADOS        || '1z7rV8RZLjPR1_RqxSheiMzYBeBjk5Nar', // 11
    RECHAZADOS:         process.env.DRIVE_FOLDER_RECHAZADOS         || '12JpKgREa5guVUj2zGFJC3kXAr0JprY5-', // 12
    DOC_COMPLETA_APPSHEET: process.env.DRIVE_FOLDER_DOC_COMPLETA_APPSHEET || '1VeytESzajCysr0s5vYae8FDeWG4G2OZj', // 13
};

// Nombre legible de cada carpeta (para logs y para el script de recolocación).
const FOLDER_NAMES = {
    [FOLDERS.OPORTUNIDADES]:         '01. OPORTUNIDADES',
    [FOLDERS.SIMULACION_ENVIADA]:    '02. SIMULACION ENVIADA',
    [FOLDERS.ACEPTADO]:              '03. ACEPTADO',
    [FOLDERS.EN_CURSO]:              '04. EN CURSO',
    [FOLDERS.DOC_COMPLETA]:          '05. DOC. COMPLETA',
    [FOLDERS.LISTO_VERIFICAR]:       '06. REVISADO LISTO PARA VERIFICAR',
    [FOLDERS.ENVIADOS_VERIFICAR]:    '07. ENVIADOS A VERIFICAR',
    [FOLDERS.PAGO_BROKERGY]:         '08. PENDIENTE DE PAGO A BROKERGY',
    [FOLDERS.PAGO_CLIENTE]:          '09.PENDIENTE DE PAGO A CLIENTE',
    [FOLDERS.REQUERIMIENTO]:         '10. REQUERIMIENTO',
    [FOLDERS.FINALIZADOS]:           '11. FINALIZADOS',
    [FOLDERS.RECHAZADOS]:            '12. RECHAZADOS',
    [FOLDERS.DOC_COMPLETA_APPSHEET]: '13. DOC. COMPLETA APPSHEET',
};

function nombreCarpeta(folderId) {
    return FOLDER_NAMES[folderId] || folderId || '—';
}

// ─── Oportunidades ────────────────────────────────────────────────────────────
// Mientras no se envía la propuesta la carpeta se queda en "01. OPORTUNIDADES"
// (antes 'EN CURSO' la mandaba a "04. EN CURSO", que ahora es de expedientes).
const CARPETA_OPORTUNIDAD = {
    'PTE ENVIAR': FOLDERS.OPORTUNIDADES,
    'EN CURSO':   FOLDERS.OPORTUNIDADES,
    'LEAD':       FOLDERS.OPORTUNIDADES,   // lead de la landing, aún sin trabajar
    'ENVIADA':    FOLDERS.SIMULACION_ENVIADA,
    'ACEPTADA':   FOLDERS.ACEPTADO,
    'RECHAZADA':  FOLDERS.RECHAZADOS,
};

function carpetaObjetivoOportunidad(estado) {
    return CARPETA_OPORTUNIDAD[estado] || null;
}

// ─── Lotes ────────────────────────────────────────────────────────────────────
// El lote se lleva dentro las carpetas de sus expedientes, así que su estado
// arrastra a todo el grupo.
const CARPETA_LOTE = {
    'BORRADOR':                             FOLDERS.LISTO_VERIFICAR,
    'SOLICITADO PRESUPUESTO A VERIFICADOR':  FOLDERS.LISTO_VERIFICAR,
    'ENVIADO A VERIFICADOR':                 FOLDERS.ENVIADOS_VERIFICAR,
    'PTE. SUBIDA MITECO':                    FOLDERS.ENVIADOS_VERIFICAR,
    'REQUERIMIENTO VERIFICADOR':             FOLDERS.REQUERIMIENTO,
    'REQUERIMIENTO G.A.':                    FOLDERS.REQUERIMIENTO,
    'CAE EMITIDO – PTE PAGO BROKERGY':       FOLDERS.PAGO_BROKERGY,   // guion largo U+2013
    'PTE. PAGO BROKERGY A CLIENTE':          FOLDERS.PAGO_CLIENTE,
    'FINALIZADO':                            FOLDERS.FINALIZADOS,
};

function carpetaObjetivoLote(estadoLote) {
    return CARPETA_LOTE[estadoLote] || FOLDERS.LISTO_VERIFICAR;
}

// ─── Expedientes ──────────────────────────────────────────────────────────────
// Estados posteriores a la documentación completa. En la práctica un expediente
// en estos estados SIEMPRE está en un lote (y por tanto no se mueve solo); este
// mapa es la red para los huérfanos.
const CARPETA_EXPEDIENTE_POSTERIOR = {
    'ENVIADO A VERIFICADOR':           FOLDERS.ENVIADOS_VERIFICAR,
    'PTE. SUBIDA MITECO':              FOLDERS.ENVIADOS_VERIFICAR,
    'REQUERIMIENTO VERIFICADOR':       FOLDERS.REQUERIMIENTO,
    'REQUERIMIENTO G.A.':              FOLDERS.REQUERIMIENTO,
    'CAE EMITIDO – PTE PAGO BROKERGY': FOLDERS.PAGO_BROKERGY,
    'PTE. PAGO BROKERGY A CLIENTE':    FOLDERS.PAGO_CLIENTE,
    'FINALIZADO':                      FOLDERS.FINALIZADOS,
};

/**
 * Carpeta de estado que le toca a la carpeta de un expediente.
 * Devuelve null cuando NO hay que tocar nada (en lote, o estado desconocido).
 *
 * @param {{ estado?: string, lote_id?: string|null, cee?: object }} exp
 * @param {{ ignorarLote?: boolean }} [opts] - ignorarLote: calcular el destino
 *        como si no estuviera loteado (se usa al sacarlo de un lote).
 */
function carpetaObjetivoExpediente(exp, opts = {}) {
    if (!exp) return null;
    // En un lote la carpeta vive dentro de la del lote y no sale.
    if (exp.lote_id && !opts.ignorarLote) return null;

    const estado = exp.estado;
    if (estado === 'DOC. COMPLETA APPSHEET') return FOLDERS.DOC_COMPLETA_APPSHEET;
    if (estado === 'DOC. COMPLETA')          return FOLDERS.DOC_COMPLETA;

    const rank = rankEstado(estado);
    if (rank === -1) return null; // estado desconocido: mejor no tocar la carpeta

    if (rank > rankEstado('DOC. COMPLETA APPSHEET')) {
        return CARPETA_EXPEDIENTE_POSTERIOR[estado] || null;
    }

    // Zona "en curso": todo lo anterior a DOC. COMPLETA (incluidos
    // 'PENDIENTE REVISAR EXPTE' de los migrados y 'REQUERIMIENTO BROKERGY').
    // Única excepción: el expediente recién aceptado al que todavía no se le ha
    // encargado el CEE se queda en "03. ACEPTADO".
    if (estado === 'PTE. CEE INICIAL' && !exp.cee?.certificador_id) return FOLDERS.ACEPTADO;
    return FOLDERS.EN_CURSO;
}

module.exports = {
    FOLDERS,
    FOLDER_NAMES,
    nombreCarpeta,
    carpetaObjetivoOportunidad,
    carpetaObjetivoLote,
    carpetaObjetivoExpediente,
};
