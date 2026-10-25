// ─── certapp/logica.js — la lógica del cuestionario, la MISMA que el navegador ──
// Fuente única: frontend/src/certificadores/logic/cuestionario.js (ESM). El
// servidor la carga con import() —el patrón de cartaPagoService y cobroService—
// para que el barrido, el saneado del cuestionario y el resumen para la IA sean
// idénticos en los dos lados. En el VPS la imagen copia `frontend/src` a
// `/frontend/src` (Dockerfile), así que la ruta relativa vale en los dos sitios.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');

const RUTA = path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'certificadores', 'logic', 'cuestionario.js');
let promesa = null;

/** @returns {Promise<typeof import('../../../frontend/src/certificadores/logic/cuestionario.js')>} */
function cuestionario() {
    if (!promesa) {
        promesa = import(pathToFileURL(RUTA).href).catch((e) => {
            promesa = null;   // que el siguiente intento vuelva a probar
            console.error('[certapp] No se pudo cargar cuestionario.js:', e.message);
            throw e;
        });
    }
    return promesa;
}

// La Guía de transmitancias = los valores por defecto de CE3X 3.2 (la MISMA
// tabla que usan la calculadora, la ficha del .cex y la revisión). La lee el
// asistente para contestar «¿qué U pone CE3X a un muro de 1975?».
const RUTA_U = path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'features', 'calculator', 'logic', 'transmitanciasCe3x.js');
let promesaU = null;

/** @returns {Promise<typeof import('../../../frontend/src/features/calculator/logic/transmitanciasCe3x.js')>} */
function transmitancias() {
    if (!promesaU) {
        promesaU = import(pathToFileURL(RUTA_U).href).catch((e) => {
            promesaU = null;
            console.error('[certapp] No se pudo cargar transmitanciasCe3x.js:', e.message);
            throw e;
        });
    }
    return promesaU;
}

module.exports = { cuestionario, transmitancias, RUTA, RUTA_U };
