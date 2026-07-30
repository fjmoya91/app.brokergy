import { lazy } from 'react';

/**
 * lazyWithReload — React.lazy() a prueba de deploys.
 *
 * PROBLEMA: los chunks de Vite llevan el hash del contenido en el nombre
 * (`CeePrevioGate-BkHfMGPe.js`). Cuando se despliega una versión nueva, los
 * ficheros del build anterior desaparecen del servidor. Una pestaña que lleve
 * abierta desde antes del deploy sigue con el index.html viejo en memoria, así
 * que al abrir por primera vez una vista lazy pide un fichero que ya no existe
 * y revienta con "Failed to fetch dynamically imported module". Recargar a mano
 * lo arregla porque trae el index.html nuevo (nginx lo sirve con no-cache).
 *
 * SOLUCIÓN: si el import falla por chunk inexistente, recargamos la pestaña.
 * Para no entrar en bucle si el fallo persiste tras recargar, apuntamos en
 * sessionStorage cuándo recargamos y no repetimos dentro de la ventana; pasada
 * esa ventana sí volvemos a recargar, porque una pestaña que lleva días abierta
 * puede encontrarse varios deploys. `beforeReload` permite dejar apuntada la
 * intención del usuario para reanudarla al volver.
 */

const KEY_PREFIX = 'brokergy:chunk-reload:';
// Un bucle recargaría en cuestión de milisegundos; 30 s lo corta de sobra.
const RETRY_WINDOW_MS = 30_000;

/** ¿Acabamos de recargar por este mismo chunk? (= el fallo NO era un deploy) */
const reloadedJustNow = (key) => {
    try {
        const ts = Number(sessionStorage.getItem(key));
        return Number.isFinite(ts) && ts > 0 && Date.now() - ts < RETRY_WINDOW_MS;
    } catch { return false; }
};
const markReloaded = (key) => {
    try { sessionStorage.setItem(key, String(Date.now())); } catch { /* modo privado */ }
};
const clearReloaded = (key) => {
    try { sessionStorage.removeItem(key); } catch { /* modo privado */ }
};

/**
 * ¿El error es "el chunk ya no está" y no un fallo dentro del propio módulo?
 * Los mensajes cambian por navegador, de ahí la lista.
 */
export function isChunkLoadError(error) {
    const msg = String(error?.message || error || '');
    return (
        /failed to fetch dynamically imported module/i.test(msg) ||   // Chrome / Edge
        /error loading dynamically imported module/i.test(msg) ||     // Firefox
        /importing a module script failed/i.test(msg) ||              // Safari
        /unable to preload css/i.test(msg) ||                         // Vite (preload de CSS)
        /'text\/html' is not a valid javascript mime type/i.test(msg) // 404 servido como index.html
    );
}

/**
 * Envuelve un `import()` dinámico cualquiera (no solo componentes).
 *
 * @param {() => Promise<any>} factory  el `() => import('...')` de siempre
 * @param {{ name: string, beforeReload?: () => void }} opts
 */
export function loadWithReload(factory, { name, beforeReload } = {}) {
    const key = KEY_PREFIX + (name || 'chunk');

    return factory().then(
        (mod) => {
            // Cargó bien: limpiamos la marca para que un deploy futuro pueda
            // volver a recargar si hace falta.
            clearReloaded(key);
            return mod;
        },
        (error) => {
            // Si no es un chunk perdido (o acabamos de recargar por él, o estamos
            // sin red y la recarga solo daría la página de "sin conexión"), que lo
            // pinte el ErrorBoundary como hasta ahora.
            if (!isChunkLoadError(error) || reloadedJustNow(key) || navigator.onLine === false) throw error;

            console.warn(`[lazyWithReload] chunk obsoleto (${name}); recargando para traer el build nuevo.`);
            markReloaded(key);
            try { beforeReload?.(); } catch { /* nunca bloquear la recarga */ }
            window.location.reload();

            // La pestaña se está recargando: no resolvemos nunca para que no se
            // pinte el error un instante antes de que se vaya la página.
            return new Promise(() => { });
        },
    );
}

/** React.lazy() con la misma protección. Mismos argumentos que loadWithReload. */
export function lazyWithReload(factory, opts) {
    return lazy(() => loadWithReload(factory, opts));
}

export default lazyWithReload;
