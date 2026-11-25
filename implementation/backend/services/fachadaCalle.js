// ─── fachadaCalle.js — la FOTO de Street View de una parcela, para confirmarla ──
// Fran (25/11/2026): «un botón de Google Maps por si tenemos que buscar la
// fachada… para no errar en la referencia catastral», y después «haz esa mejora»:
// ver la calle DENTRO de «Confirma el inmueble», sin salir de la app.
//
// La foto la saca `streetView` de la app de certificadores (el panorama más
// cercano al punto, mirando hacia él): la misma cuenta y la misma API.
//
// REGLA — se paga por foto (Street View Static), así que:
//   · solo con SESIÓN (equipo y partner): la landing pública sigue con los
//     ENLACES, o cualquiera la convertiría en un grifo de nuestra cuenta;
//   · la pide el usuario con un clic, no se pide sola al abrir la tarjeta;
//   · UNA vez por punto (redondeado a ~1 m) y día, en memoria; un «no hay
//     panorama» se recuerda 2 min (Street View a veces contesta vacío y luego sí);
//   · tope por usuario y día (FACHADA_CALLE_MAX_DIA, 150).
// La metadata (¿hay panorama?) es gratis; solo se paga la imagen.
// ─────────────────────────────────────────────────────────────────────────────
const { streetView } = require('./certapp/vistoIa');

const TTL = 24 * 60 * 60 * 1000;
const TTL_VACIO = 2 * 60 * 1000;
const MAX_CACHE = 300;
const cache = new Map();   // 'lat,lng' → { at, foto | null }
const usos = new Map();    // `${usuario}:${día}` → n

const maxDia = () => Number(process.env.FACHADA_CALLE_MAX_DIA) || 150;
const hoy = () => new Date().toISOString().slice(0, 10);

/** El punto, validado: en España (con Canarias) y con 5 decimales (~1 m). */
function punto(lat, lng) {
    const la = Number(lat), lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    if (la < 27 || la > 44.5 || lo < -19 || lo > 5) return null;
    return { lat: Number(la.toFixed(5)), lng: Number(lo.toFixed(5)) };
}

/**
 * La foto de la calle de ese punto → `{ buffer, mime, fecha }`, null si no hay
 * panorama. Lanza `{ status }` con 400 (punto inválido), 429 (tope) o 503 (sin
 * clave de Google).
 */
async function fotoCalle(lat, lng, usuarioId) {
    const p = punto(lat, lng);
    if (!p) throw Object.assign(new Error('Punto fuera de España o inválido.'), { status: 400 });
    if (!process.env.GOOGLE_MAPS_KEY) throw Object.assign(new Error('Street View no está configurado.'), { status: 503 });

    const clave = `${p.lat},${p.lng}`;
    const c = cache.get(clave);
    if (c && Date.now() - c.at < (c.foto ? TTL : TTL_VACIO)) return c.foto;

    // El tope solo cuenta lo que se PIDE a Google (lo de la caché es gratis).
    const k = `${usuarioId || 'anon'}:${hoy()}`;
    const n = usos.get(k) || 0;
    if (n >= maxDia()) throw Object.assign(new Error('Tope diario de fotos de Street View alcanzado.'), { status: 429 });
    usos.set(k, n + 1);
    if (usos.size > 2000) usos.clear();

    const foto = await streetView(p.lat, p.lng).catch((e) => {
        console.warn('[fachadaCalle]', clave, e.message);
        return undefined;   // un fallo no se recuerda: se reintenta la próxima vez
    });
    if (foto === undefined) return null;
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(clave, { at: Date.now(), foto });
    return foto;
}

const _vaciar = () => { cache.clear(); usos.clear(); };

module.exports = { fotoCalle, punto, _vaciar };
