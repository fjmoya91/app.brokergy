// ─── certapp/fachada.js — la foto de la fachada que se le PROPONE al certificador ─
// Fran (26/10/2026): «la foto de la fachada que la coja automática del Catastro
// o Street View y se la muestre al certificador y la pueda validar o subir otra».
//
//   · catastro   la foto oficial de la parcela (catastroService.getFacadeImage)
//   · streetview la del panorama más cercano, mirando a la casa (vistoIa.streetView)
//
// REGLA — se PROPONE, no se guarda sola: solo entra en «Fachada principal» si el
// certificador pulsa «Usar esta foto» (POST …/fachada-sugerida/:fuente/usar), y
// entonces se sube como cualquier foto suya (docs.subir, por 'certificador').
// REGLA — cada foto se pide UNA vez por obra y fuente y se guarda en memoria
// 30 min: Street View se paga por petición y el Catastro tiene WAF (regla 15).
// ─────────────────────────────────────────────────────────────────────────────
const catastroService = require('../catastroService');
const { streetView } = require('./vistoIa');
const { fallo } = require('./comun');

const FUENTES = ['catastro', 'streetview'];
const TTL = 30 * 60 * 1000;
const TTL_VACIO = 2 * 60 * 1000;
const MAX_CACHE = 200;
const cache = new Map();   // `${obraId}:${fuente}` → { at, foto | null }

async function pedir(obra, fuente) {
    if (fuente === 'catastro') {
        if (!obra.ref_catastral) return null;
        const r = await catastroService.getFacadeImage(obra.ref_catastral);
        return r?.data ? { buffer: Buffer.from(r.data), mime: 'image/jpeg', fecha: null } : null;
    }
    const r = await streetView(obra.lat, obra.lng);
    return r ? { buffer: r.buffer, mime: r.mime, fecha: r.fecha } : null;
}

/** La foto propuesta de esa fuente → `{ buffer, mime, fecha }` o null si no hay. */
async function sugerida(obra, fuente) {
    if (!FUENTES.includes(fuente)) throw fallo(400, 'Fuente desconocida.', 'FUENTE_INVALIDA');
    const clave = `${obra.id}:${fuente}`;
    const c = cache.get(clave);
    // Un «no hay foto» se recuerda poco: Street View contesta a veces vacío de forma
    // puntual (medido con la 2026EXT_1, 26/10/2026) y luego sí la da.
    if (c && Date.now() - c.at < (c.foto ? TTL : TTL_VACIO)) return c.foto;
    const foto = await pedir(obra, fuente).catch((e) => {
        console.warn(`[certappFachada] ${obra.numero_expediente} ${fuente}:`, e.message);
        return undefined;   // un fallo no se recuerda: se reintenta la próxima vez
    });
    if (foto === undefined) return null;
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(clave, { at: Date.now(), foto });
    return foto;
}

/** El fichero con la forma de multer, para `docs.subir`. */
function comoFichero(foto, fuente, obra) {
    const nombre = `FACHADA_${fuente === 'catastro' ? 'CATASTRO' : 'STREETVIEW'}_${obra.numero_expediente || obra.id}.jpg`;
    return { originalname: nombre, buffer: foto.buffer, mimetype: foto.mime, size: foto.buffer.length };
}

const _vaciarCache = () => cache.clear();

module.exports = { FUENTES, sugerida, comoFichero, _vaciarCache };
