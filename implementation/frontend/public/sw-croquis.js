/*
 * Service worker del CROQUIS MÓVIL — que la página ABRA aunque no haya cobertura.
 *
 * El técnico pinta el croquis y hace las fotos con el teléfono delante del
 * edificio, a menudo en un sótano o en un pueblo sin señal. Lo que hace se
 * guarda en el teléfono (`logic/bandejaMovil.js`); pero si la página se recarga
 * en ese rato —Android la cierra muchas veces al abrir la cámara— sin esto no
 * volvería a abrir, y con ella se iría el acceso a todo lo guardado.
 *
 * REGLA — solo controla `/croquis-movil/` (se registra con ese `scope`): el
 * resto de la app no pasa por aquí y se comporta exactamente como siempre.
 *
 * Qué guarda, y cómo:
 *   · la PÁGINA (el index de la app) — red primero; sin red, la guardada;
 *   · lo ESTÁTICO (`/assets/`, `/fonts/`, imágenes) — lo guardado primero: sus
 *     nombres llevan un resumen del contenido, así que no envejece;
 *   · la PLANTA y la lista de fotos de un enlace — red primero, con la copia
 *     guardada si no contesta en unos segundos;
 *   · las FOTOS ya subidas — lo guardado primero (una foto no cambia).
 * Nada más: lo que MANDA algo (POST) y el estado que se consulta cada pocos
 * segundos van siempre a la red, sin copia.
 */
const CACHE = 'croquis-movil-v1';
//: La página es la misma para todos los enlaces (la app entera): se guarda una vez.
const PAGINA = '/croquis-movil/__pagina__';
const MAX_ENTRADAS = 150;
//: Con poca señal una petición puede tardar minutos sin fallar: pasado este
//: plazo se usa la copia guardada (y la respuesta de la red, si llega, la renueva).
const PLAZO_RED_MS = 6000;

const RE_PLANTA = /^\/api\/public\/croquis-movil\/[0-9a-f]{32}(\/fotos)?$/;
const RE_FOTO = /^\/api\/public\/croquis-movil\/[0-9a-f]{32}\/fotos\/[A-Za-z0-9_-]{10,100}$/;
const esEstatico = (u) => /^\/(assets|fonts)\//.test(u.pathname)
    || /\.(png|svg|ico|webmanifest|woff2?)$/.test(u.pathname);

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) {
            if (k.startsWith('croquis-movil-') && k !== CACHE) await caches.delete(k);
        }
        await self.clients.claim();
    })());
});

async function recortar(cache) {
    const claves = await cache.keys();
    const sobran = claves.length - MAX_ENTRADAS;
    for (let i = 0; i < sobran; i++) {
        if (!claves[i].url.endsWith(PAGINA)) await cache.delete(claves[i]);
    }
}

async function guardar(clave, respuesta) {
    if (!respuesta || !respuesta.ok || respuesta.type === 'opaque') return;
    const c = await caches.open(CACHE);
    await c.put(clave, respuesta);
    recortar(c);
}

function conPlazo(promesa, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('plazo')), ms);
        promesa.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
}

/** Red primero; si no contesta a tiempo o no hay red, la copia guardada. */
async function redPrimero(req, clave) {
    const red = fetch(req).then(async (r) => {
        if (r.ok) await guardar(clave, r.clone());
        // Un enlace que ya no vale no puede seguir abriéndose desde la copia.
        else if (r.status === 410) await (await caches.open(CACHE)).delete(clave);
        return r;
    });
    try {
        return await conPlazo(red, PLAZO_RED_MS);
    } catch {
        const copia = await caches.match(clave);
        return copia || red;
    }
}

async function guardadoPrimero(req) {
    const copia = await caches.match(req);
    if (copia) return copia;
    const r = await fetch(req);
    if (r.ok) await guardar(req, r.clone());
    return r;
}

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const u = new URL(req.url);
    if (req.mode === 'navigate') {
        if (u.pathname.startsWith('/croquis-movil/')) e.respondWith(redPrimero(req, PAGINA));
        return;
    }
    if (u.origin !== self.location.origin) return;
    if (RE_FOTO.test(u.pathname)) { e.respondWith(guardadoPrimero(req)); return; }
    if (RE_PLANTA.test(u.pathname)) { e.respondWith(redPrimero(req, u.pathname)); return; }
    if (esEstatico(u)) e.respondWith(guardadoPrimero(req));
});

// La página, en cuanto este service worker la controla, le pasa lo que YA había
// cargado (la app, sus estilos, la planta): se cargó antes de que existiera y no
// ha pasado por aquí, así que sin esto la primera recarga sin red no abriría.
self.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.tipo !== 'guardar' || !Array.isArray(d.urls)) return;
    e.waitUntil((async () => {
        const c = await caches.open(CACHE);
        for (const url of d.urls.slice(0, 80)) {
            try {
                const u = new URL(url, self.location.origin);
                if (u.origin !== self.location.origin) continue;
                const esPagina = u.pathname.startsWith('/croquis-movil/');
                const clave = esPagina ? PAGINA : (RE_PLANTA.test(u.pathname) ? u.pathname : u.href);
                if (!esPagina && !RE_PLANTA.test(u.pathname) && await c.match(clave)) continue;
                const r = await fetch(u.href, { credentials: 'same-origin' });
                if (r.ok) await c.put(clave, r);
            } catch { /* lo que no baje, se guardará la próxima vez que se pida */ }
        }
        await recortar(c);
    })());
});
