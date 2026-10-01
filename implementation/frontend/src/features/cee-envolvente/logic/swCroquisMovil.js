/**
 * Registra el service worker del croquis móvil (`public/sw-croquis.js`), que
 * hace que la página abra aunque no haya cobertura. Ver su cabecera.
 *
 * Solo en la app CONSTRUIDA (en desarrollo Vite sirve los módulos sueltos y no
 * hay nada estable que guardar) y solo en un contexto seguro (https, o
 * localhost): el navegador no deja registrarlo en otro sitio. Si algo falla, no
 * pasa nada: la página funciona igual, solo que sin abrir sin red.
 */
export function prepararSinCobertura(token) {
    try {
        if (!import.meta.env?.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
        navigator.serviceWorker.register('/sw-croquis.js', { scope: '/croquis-movil/' })
            .then(() => navigator.serviceWorker.ready)
            .then((reg) => {
                // Lo que ya se cargó antes de que existiera el service worker: la
                // app, sus estilos, sus tipografías y la planta de este enlace.
                const urls = new Set([window.location.pathname,
                                      `/api/public/croquis-movil/${token}`,
                                      `/api/public/croquis-movil/${token}/fotos`]);
                for (const e of performance.getEntriesByType('resource')) {
                    try {
                        const u = new URL(e.name);
                        if (u.origin === window.location.origin && /^\/(assets|fonts)\//.test(u.pathname)) urls.add(u.pathname);
                    } catch { /* una entrada rara */ }
                }
                reg.active?.postMessage({ tipo: 'guardar', urls: [...urls] });
            })
            .catch(() => { /* sin service worker: la página va igual, sin abrir sin red */ });
    } catch { /* ídem */ }
}

export default prepararSinCobertura;
