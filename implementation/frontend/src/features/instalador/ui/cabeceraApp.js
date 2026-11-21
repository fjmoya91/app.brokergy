// ─── cabeceraApp.js — la app del instalador, INSTALABLE (fase 5) ─────────────
// app.brokergy.es sirve UN index.html para todos (manifiesto oscuro del CRM). Solo
// cuando entra un instalador de la beta, mientras su app está montada, se cambian en
// el <head>: el manifiesto (`/instalador/manifest.webmanifest`, crema), el color de
// la barra del navegador, el icono de iPhone y su barra de estado. Al desmontarse
// (cerrar sesión) se deja TODO como estaba: los demás usuarios no ven nada distinto.
// Sin service worker: no hace falta para instalarla y así nada cachea la API.
//
// El nombre de la app instalada es «BROKERGY» para todos (ver el documento de la
// fase 5: un manifiesto por instalador exigiría servirlo sin sesión).
import { useEffect, useState } from 'react';

export const CABECERA_INSTALADOR = {
    manifest: '/instalador/manifest.webmanifest',
    themeColor: '#faf9f7',
    appleIcon: '/instalador/apple-touch-icon.png',
    appleStatus: 'default',
    appleTitle: 'BROKERGY',
};

function etiqueta(selector, crear) {
    let el = document.head.querySelector(selector);
    let creada = false;
    if (!el) { el = crear(); document.head.appendChild(el); creada = true; }
    return { el, creada };
}
const meta = (name) => () => { const m = document.createElement('meta'); m.setAttribute('name', name); return m; };
const link = (rel) => () => { const l = document.createElement('link'); l.setAttribute('rel', rel); return l; };

/** Pone la cabecera de la app del instalador y devuelve cómo deshacerlo. */
export function ponerCabeceraInstalador(c = CABECERA_INSTALADOR) {
    if (typeof document === 'undefined') return () => {};
    const cambios = [
        [etiqueta('link[rel="manifest"]', link('manifest')), 'href', c.manifest],
        [etiqueta('meta[name="theme-color"]', meta('theme-color')), 'content', c.themeColor],
        [etiqueta('link[rel="apple-touch-icon"]', link('apple-touch-icon')), 'href', c.appleIcon],
        [etiqueta('meta[name="apple-mobile-web-app-status-bar-style"]', meta('apple-mobile-web-app-status-bar-style')), 'content', c.appleStatus],
        [etiqueta('meta[name="apple-mobile-web-app-title"]', meta('apple-mobile-web-app-title')), 'content', c.appleTitle],
    ].map(([{ el, creada }, attr, valor]) => {
        const antes = el.getAttribute(attr);
        el.setAttribute(attr, valor);
        return { el, creada, attr, antes };
    });
    return () => {
        for (const { el, creada, attr, antes } of cambios) {
            if (creada) el.remove();
            else if (antes == null) el.removeAttribute(attr);
            else el.setAttribute(attr, antes);
        }
    };
}

// ── «Ponla en tu pantalla de inicio» ─────────────────────────────────────────
// Chrome en Android avisa UNA vez, al cargar, de que la app se puede instalar
// (`beforeinstallprompt`). Se guarda aquí, al cargar este módulo (que solo
// descarga un instalador de la beta), para ofrecerla con un botón nuestro.
let aviso = null;
const oyentes = new Set();
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); aviso = e; oyentes.forEach((f) => f()); });
    window.addEventListener('appinstalled', () => { aviso = null; oyentes.forEach((f) => f()); });
}

/** ¿Ya está abierta como app instalada? */
export function esAppInstalada() {
    if (typeof window === 'undefined') return false;
    return !!(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator?.standalone === true);
}

/** El sistema del móvil, para dar las instrucciones que tocan. */
export function sistemaDelMovil(ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'iphone';
    if (/Android/i.test(ua)) return 'android';
    return 'otro';
}

/** `{ puede: bool, instalar: () => Promise<'ok'|'no'> }`: el aviso de Chrome, si lo ha dado. */
export function useAvisoInstalar() {
    const [, setN] = useState(0);
    useEffect(() => {
        const f = () => setN((n) => n + 1);
        oyentes.add(f);
        return () => oyentes.delete(f);
    }, []);
    return {
        puede: !!aviso,
        instalar: async () => {
            if (!aviso) return 'no';
            const e = aviso;
            aviso = null;
            try {
                await e.prompt();
                const r = await e.userChoice;
                return r?.outcome === 'accepted' ? 'ok' : 'no';
            } catch { return 'no'; } finally { oyentes.forEach((f) => f()); }
        },
    };
}
