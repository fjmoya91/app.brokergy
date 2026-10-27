'use strict';
// Los módulos del frontend importan sin extensión (`'./boilerMapping'`), que es lo
// que hace Vite y Node no. Este gancho deja que el backend los cargue por import()
// ESM: solo toca lo relativo que no se resuelve tal cual. Se registra UNA vez por
// proceso, lo pida quien lo pida (alta_oportunidad.js, cargarCeeOportunidad.js).
const { registerHooks } = require('node:module');

// `registerHooks` es de Node ≥ 22.15. El contenedor del backend va con Node 20: ahí
// no se registra (antes tumbaba el ARRANQUE entero) y quien importe sin extensión
// falla en su import(), con su error, sin llevarse el servidor por delante.
if (typeof registerHooks === 'function' && !globalThis.__brokergyEsmSinExtension) {
    globalThis.__brokergyEsmSinExtension = true;
    registerHooks({
        resolve(specifier, context, nextResolve) {
            try { return nextResolve(specifier, context); } catch (e) {
                if (!/^\.\.?\//.test(specifier) || /\.[cm]?jsx?$/.test(specifier)) throw e;
                for (const suf of ['.js', '.jsx', '/index.js']) {
                    try { return nextResolve(specifier + suf, context); } catch { /* siguiente */ }
                }
                throw e;
            }
        },
    });
}
