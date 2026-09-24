// ============================================================================
// materialCee.js — ¿tiene el certificador con qué levantar el CEE INICIAL?
//
// FUENTE ÚNICA del criterio. Lo usan el radar del parte (bloque CEE_SIN_MATERIAL
// y la columna de material de "Aceptados y sin encargar") y la petición al
// cliente (`faltantesPorDestino` con `materialCee`). Si cada uno decidiera por su
// cuenta, la pantalla diría "listo" de un expediente al que el parte le reclama
// fotos, o al revés.
//
// LO QUE HACE FALTA (decisión del usuario, 2026-09-23):
//   · La VIVIENDA por fuera: o bien el VÍDEO de la vivienda, o bien las fotos de
//     la fachada a la calle y de las paredes que dan a patios. El vídeo sustituye
//     a las fotos — en él salen las fachadas y las ventanas.
//   · La CALDERA que se va a sustituir y su PLACA: de ahí salen el generador, el
//     combustible y la potencia que se escriben en el CEE inicial.
//
// REGLA — los PATIOS no bloquean. No todas las viviendas tienen patio, y la app
// no lo sabe: exigir su foto dejaría para siempre sin "listo" a toda casa sin
// patio. Con la fachada y sin patios el estado es `parcial` (ámbar, "¿tiene
// patios?"), que cuenta como suficiente para encargar. Antes el parte exigía las
// dos fotos y reclamaba un patio que a lo mejor no existe.
//
// REGLA — sin calefacción no se pide la caldera. Una vivienda que DECLARA no
// tener calefacción (`rendimiento_id = 'sin_calefaccion'`, regla 8.d) no tiene
// caldera que fotografiar, y pedírsela es pedirle una foto imposible.
//
// ⚠️ Mira `reforma_uploads`, no Drive: es lo único que se puede traer de toda la
// cartera sin una llamada a Drive por expediente. Una foto copiada a mano en la
// carpeta y no registrada daría un falso "falta". El MENSAJE al cliente sí
// reconcilia con Drive (`faltantesPorDestino`), así que nunca se le reclama algo
// que ya está.
// ============================================================================

const SLOT = {
    VIDEO: 'VIDEO_VIVIENDA',
    FACHADA: 'FOTO_FACHADA_PRINCIPAL',
    PATIOS: 'FOTO_PATIOS_INTERIORES',
    CALDERA: 'FOTO_CALDERA_ANTES',
    PLACA: 'FOTO_PLACA_CALDERA_ANTES',
};

// Los slots de la vivienda que el vídeo hace innecesarios.
const SUSTITUYE_VIDEO = [SLOT.FACHADA, SLOT.PATIOS];
// Lo que se le pide al cliente, además del material de destino CEE.
const SLOTS_CALDERA = [SLOT.CALDERA, SLOT.PLACA];

const cuenta = (uploads, k) => (Array.isArray(uploads?.[k]) ? uploads[k].length : 0);

/** ¿La vivienda declara que NO tiene calefacción? Entonces no hay caldera que fotografiar. */
function sinCalefaccion(instalacion) {
    const id = String(instalacion?.caldera_antigua_cal?.rendimiento_id || '').toLowerCase();
    return id === 'sin_calefaccion';
}

/**
 * @param {object} uploads      datos_calculo.reforma_uploads de la oportunidad
 * @param {object} instalacion  expedientes.instalacion (para saber si hay caldera)
 * @returns {{
 *   vivienda: { estado: 'ok'|'parcial'|'falta', video: number, fachada: number, patios: number },
 *   caldera:  { aplica: boolean, fotos: number },
 *   placa:    { aplica: boolean, fotos: number },
 *   listo: boolean,
 *   faltan: string[],
 * }}
 */
function materialCee(uploads, instalacion) {
    const video = cuenta(uploads, SLOT.VIDEO);
    const fachada = cuenta(uploads, SLOT.FACHADA);
    const patios = cuenta(uploads, SLOT.PATIOS);
    const estadoVivienda = (video > 0 || (fachada > 0 && patios > 0)) ? 'ok'
        : fachada > 0 ? 'parcial'
        : 'falta';

    const hayCaldera = !sinCalefaccion(instalacion);
    const caldera = { aplica: hayCaldera, fotos: cuenta(uploads, SLOT.CALDERA) };
    const placa = { aplica: hayCaldera, fotos: cuenta(uploads, SLOT.PLACA) };

    const faltan = [];
    if (estadoVivienda === 'falta') faltan.push('vídeo o fotos de la vivienda');
    if (caldera.aplica && !caldera.fotos) faltan.push('caldera');
    if (placa.aplica && !placa.fotos) faltan.push('placa de la caldera');

    return {
        vivienda: { estado: estadoVivienda, video, fachada, patios },
        caldera,
        placa,
        listo: faltan.length === 0,
        faltan,
    };
}

module.exports = { materialCee, sinCalefaccion, SLOT, SUSTITUYE_VIDEO, SLOTS_CALDERA };
