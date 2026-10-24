// ─── router.js — enrutado a mano por pathname, como el CRM (sin react-router) ─
// `navegar(ruta)` hace pushState y avisa a quien escucha; `useRuta()` devuelve
// la ruta actual y se repinta con atrás/adelante del navegador. Las rutas son de
// RAÍZ (`/panel`, `/obra/:id`): en producción el subdominio cee.brokergy.es entero
// es la app; en desarrollo, ver el plugin de vite.config.js.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react';

const EVENTO = 'certapp:navegar';

const suscribir = (cb) => {
    window.addEventListener('popstate', cb);
    window.addEventListener(EVENTO, cb);
    return () => {
        window.removeEventListener('popstate', cb);
        window.removeEventListener(EVENTO, cb);
    };
};
const instantanea = () => window.location.pathname + window.location.search;

/** Ir a otra pantalla de la app. `replace` no deja rastro en el historial. */
// Páginas que NO son de esta app aunque vivan en el mismo dominio: las públicas
// de la entrada del CRM (index.html). `/croquis-movil/:token` es el QR que genera
// la envolvente; nginx (nginx/cee.brokergy.es.conf) y el middleware de Vite la
// mandan a index.html. Aquí se navega a ellas recargando, nunca con pushState.
export const DEL_CRM = /^\/croquis-movil(?:\/|$)/;
export const esDelCrm = (destino) => {
    try { return DEL_CRM.test(new URL(destino, window.location.origin).pathname); } catch { return false; }
};

export function navegar(destino, { replace = false, arriba = true } = {}) {
    if (!destino) return;
    if (esDelCrm(destino)) { window.location[replace ? 'replace' : 'assign'](destino); return; }
    const actual = instantanea();
    if (destino !== actual) {
        window.history[replace ? 'replaceState' : 'pushState']({}, '', destino);
        window.dispatchEvent(new Event(EVENTO));
    }
    if (arriba) window.scrollTo({ top: 0, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/** Volver atrás si hay de dónde; si se entró directo, a `porDefecto`. */
export function volver(porDefecto = '/panel') {
    if (window.history.length > 1 && document.referrer && new URL(document.referrer).origin === window.location.origin) {
        window.history.back();
    } else {
        navegar(porDefecto, { replace: true });
    }
}

/** La ruta actual: `{ path, query, completa }`. */
export function useRuta() {
    const completa = useSyncExternalStore(suscribir, instantanea, () => '/');
    const u = new URL(completa, 'http://x');
    return {
        path: u.pathname.replace(/\/+$/, '') || '/',
        query: u.searchParams,
        completa,
    };
}

/** `/obra/:id` contra `/obra/123` → `{ id: '123' }` o null. */
export function casar(patron, path) {
    const a = patron.split('/').filter(Boolean);
    const b = path.split('/').filter(Boolean);
    if (a.length !== b.length) return null;
    const params = {};
    for (let i = 0; i < a.length; i++) {
        if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
        else if (a[i] !== b[i]) return null;
    }
    return params;
}

/**
 * Enlace interno: un <a> de verdad (se puede abrir en otra pestaña, copiar…)
 * que dentro de la app navega sin recargar.
 */
export function Enlace({ to, onClick, children, ...resto }) {
    return (
        <a
            href={to}
            onClick={(e) => {
                onClick?.(e);
                if (e.defaultPrevented) return;
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                if (resto.target && resto.target !== '_self') return;
                if (esDelCrm(to)) return; // la sirve el CRM: navegación normal
                e.preventDefault();
                navegar(to);
            }}
            {...resto}
        >
            {children}
        </a>
    );
}
