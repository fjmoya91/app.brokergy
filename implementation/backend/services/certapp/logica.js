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

module.exports = { cuestionario, RUTA };
