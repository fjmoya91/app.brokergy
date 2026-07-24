import axios from 'axios';

// ============================================================================
// emailFallback.js — reenvío desde el buzón alternativo cuando el principal
// agota su cuota.
// ----------------------------------------------------------------------------
// Hostinger limita cada buzón a 100 correos/24 h. Cuando `brokergy@brokergy.es`
// llega al tope, el backend responde 500 con:
//     { quotaExceeded: true, fallbackFrom: 'franciscojavier.moya@brokergy.es' }
// (ver emailService.emailErrorResponse). Ese segundo buzón tiene credenciales
// propias y cuota propia, así que el envío puede salir de verdad desde él.
//
// Este helper hace el POST normal y, SOLO si el fallo es por cuota, pregunta al
// usuario si quiere reenviarlo desde el otro buzón. Si dice que sí, repite la
// misma petición añadiendo `from`. Si dice que no, se propaga el error original
// y el flujo de llamada lo trata como cualquier otro fallo de envío.
//
// Uso:
//     const { showConfirm } = useModal();
//     await postEmail('/api/pdf/send-annex', payload, showConfirm);
// ============================================================================

// El ModalProvider registra aquí su showConfirm al montarse, para que cualquier
// llamada pueda preguntar sin tener que recibir el confirm por parámetro (evita
// tocar el scope de una docena de modales de envío).
let confirmGlobal = null;

/** Lo llama ModalProvider. No usar desde otro sitio. */
export function registrarConfirm(fn) {
    confirmGlobal = fn;
}

/** El backend marcó el fallo como "cuota agotada" y hay buzón alternativo. */
export function esCuotaAgotada(err) {
    const d = err?.response?.data;
    return !!(d?.quotaExceeded && d?.fallbackFrom);
}

/**
 * POST de un envío de email con reintento OPCIONAL desde el buzón alternativo.
 *
 * @param {string}   url          endpoint de envío (p. ej. '/api/pdf/send-annex')
 * @param {object}   body         payload; se le añade `from` en el reintento
 * @param {function} showConfirm  del ModalContext: (mensaje, título, variante) => Promise<boolean>
 * @param {object}   [config]     config de axios (headers, timeout…)
 */
export async function postEmail(url, body, showConfirm = confirmGlobal, config) {
    try {
        return await axios.post(url, body, config);
    } catch (err) {
        const confirmar = typeof showConfirm === 'function' ? showConfirm : confirmGlobal;
        if (!esCuotaAgotada(err) || typeof confirmar !== 'function') throw err;

        const otroBuzon = err.response.data.fallbackFrom;
        const seguir = await confirmar(
            `El buzón habitual ha alcanzado su límite diario de envíos (100 correos cada 24 h).\n\n` +
            `¿Quieres enviarlo desde ${otroBuzon}?\n\n` +
            `El destinatario verá esa dirección como remitente.`,
            'Límite de envíos alcanzado',
            'warning'
        );
        if (!seguir) throw err;

        return await axios.post(url, { ...body, from: otroBuzon }, config);
    }
}
