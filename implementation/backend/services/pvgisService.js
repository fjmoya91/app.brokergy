// ─── pvgisService.js ─────────────────────────────────────────────────────────
// La PRODUCCIÓN FOTOVOLTAICA de un sitio, preguntada a PVGIS (Photovoltaic
// Geographical Information System, JRC · Comisión Europea).
//
// Se usa para el autoconsumo de los CEE: cuántos kWp hacen falta para declarar
// los kWh/año que salen del certificado, y cómo se reparten esos kWh por meses
// (la tabla «Autoconsumo mensual» de CE3X). La regla de tres y el reparto viven
// en el frontend (`features/expedientes/logic/produccionFv.js`); aquí solo se
// consulta y se normaliza.
//
// REGLA — se pregunta SIEMPRE con 1 kWp. La producción de PVGIS es lineal en la
// potencia pico, así que la de 1 kWp (la ESPECÍFICA, kWh/kWp) vale para
// cualquier potencia y para la pregunta inversa, y una sola consulta por sitio
// sirve a todo. Por eso la caché es por sitio y ángulos, no por potencia.
//
// REGLA — la API es la ESTABLE (PVGIS 5.3, `PVcalc`). Da la media mensual de
// 19 años (PVGIS-SARAH3, 2005-2023), las sombras del horizonte y los ángulos
// ÓPTIMOS del sitio, en una sola llamada de ~4 s. La v6
// (photovoltaic-geographic-information-system.ec.europa.eu/api/v6) está en
// prototipo: medido el 02/10/2026, su `performance/broadband` solo devuelve el
// total del periodo y su `power/broadband` la serie HORARIA entera (590 KB por
// diez años). Cambiar de API es cambiar `PVGIS_API_URL` y `normalizar`.
//
// No lleva ningún dato de nadie: solo una latitud y una longitud.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { pathToFileURL } = require('url');
const axios = require('axios');

const PVGIS_URL = (process.env.PVGIS_API_URL || 'https://re.jrc.ec.europa.eu/api/v5_3').replace(/\/+$/, '');
const PLAZO_MS = Number(process.env.PVGIS_PLAZO_MS || 25000);

//: La producción de un sitio no cambia de un día para otro (la base de datos
//: se actualiza con cada versión de PVGIS): 30 días por proceso.
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRADAS = 500;
const cache = new Map();          // clave → { expira, datos }
const enVuelo = new Map();        // clave → promesa (dos peticiones a la vez = una)

const PERDIDAS_POR_DEFECTO = 14;

function errorCon(status, mensaje) {
    const e = new Error(mensaje);
    e.status = status;
    return e;
}

const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

//: España entera, Canarias incluida, con margen. Una UTM mal tecleada (de otro
//: huso, o con las cifras cambiadas) cae fuera, y vale más decirlo que darle a
//: PVGIS un punto en el mar.
const enEspana = (lat, lon) => lat > 27 && lat < 44.5 && lon > -19 && lon < 5;

// ── De UTM a lat/lon: la MISMA función que la ventana de la envolvente ───────
const ORTOFOTO_JS = path.join(__dirname,
    '../../frontend/src/features/cee-envolvente/logic/ortofoto.js');
let _ortofoto = null;
const loadOrtofoto = () => (_ortofoto ||= import(pathToFileURL(ORTOFOTO_JS).href));

/**
 * Dónde preguntar. Acepta, por este orden:
 *   · `lat` + `lon` (grados WGS84/ETRS89 — lo que tiene la envolvente);
 *   · `utm_x` + `utm_y` (+ `huso`, 30 por defecto) — la UTM que sembró el
 *     Catastro al crear el expediente (`instalacion.coord_x/coord_y`);
 *   · `rc` — la referencia catastral, resuelta con el Catastro (cacheado 30
 *     días, así que normalmente no cuesta una petición).
 * @returns {Promise<{lat:number, lon:number, origen:string}>}
 */
async function resolverUbicacion(q = {}) {
    const lat = num(q.lat);
    const lon = num(q.lon);
    if (lat !== null && lon !== null) {
        if (!enEspana(lat, lon)) throw errorCon(422, `El punto ${lat}, ${lon} cae fuera de España.`);
        return { lat, lon, origen: 'coordenadas' };
    }

    const desdeUtm = async (x, y, huso, origen) => {
        const { utmALatLon } = await loadOrtofoto();
        const p = utmALatLon(x, y, huso || 30);
        if (!p || !Number.isFinite(p.lat) || !enEspana(p.lat, p.lon)) return null;
        return { lat: p.lat, lon: p.lon, origen };
    };

    const ux = num(q.utm_x);
    const uy = num(q.utm_y);
    if (ux !== null && uy !== null) {
        const r = await desdeUtm(ux, uy, num(q.huso) || 30, 'coordenadas UTM del expediente');
        if (r) return r;
        if (!q.rc) throw errorCon(422, `Las coordenadas UTM del expediente (${ux}, ${uy}) no caen en España: revísalas en Instalación.`);
    }

    const rc = String(q.rc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (rc.length >= 14) {
        const catastro = require('./catastroService');
        let utm = null;
        try {
            const d = await catastro.getByRC(rc);
            utm = d?.utm || d?.parcela?.utm || null;
            if (!(Number(utm?.x) > 0)) utm = await catastro.getCoordinatesByRC(rc);
        } catch (e) {
            throw errorCon(503, `No se ha podido preguntar al Catastro dónde está la referencia ${rc}`
                + ` (${e.message}). Vuelve a intentarlo en un rato.`);
        }
        if (Number(utm?.x) > 0 && Number(utm?.y) > 0) {
            const r = await desdeUtm(Number(utm.x), Number(utm.y), Number(utm.zone) || 30,
                                     `referencia catastral ${rc}`);
            if (r) return r;
        }
        throw errorCon(422, `El Catastro no devuelve coordenadas para la referencia ${rc}.`);
    }

    throw errorCon(400, 'Falta la ubicación: el expediente no tiene coordenadas ni referencia catastral.');
}

/** La respuesta de PVcalc (PVGIS 5.x) en la forma de la app. */
function normalizar(json, pedido = {}) {
    const fijo = json?.outputs?.monthly?.fixed;
    const tot = json?.outputs?.totals?.fixed;
    if (!Array.isArray(fijo) || fijo.length !== 12 || !(Number(tot?.E_y) > 0)) {
        throw errorCon(502, 'PVGIS ha contestado algo que no es una producción mensual.');
    }
    const meses = [...fijo].sort((a, b) => a.month - b.month);
    const montaje = json?.inputs?.mounting_system?.fixed || {};
    const meteo = json?.inputs?.meteo_data || {};
    const loc = json?.inputs?.location || {};
    const r2 = (v) => Math.round(Number(v) * 100) / 100;
    return {
        // kWh producidos por cada kWp instalado
        anual: r2(tot.E_y),
        mensual: meses.map(m => r2(m.E_m)),
        irradiacion_anual: Number.isFinite(Number(tot['H(i)_y'])) ? r2(tot['H(i)_y']) : null,
        perdidas_totales_pct: Number.isFinite(Number(tot.l_total)) ? r2(tot.l_total) : null,
        inclinacion: num(montaje.slope?.value),
        orientacion: num(montaje.azimuth?.value),
        optimos: !!(montaje.slope?.optimal || montaje.azimuth?.optimal),
        montaje: pedido.montaje === 'building' ? 'building' : 'free',
        perdidas: num(json?.inputs?.pv_module?.system_loss) ?? pedido.perdidas ?? PERDIDAS_POR_DEFECTO,
        lat: num(loc.latitude),
        lon: num(loc.longitude),
        elevacion: num(loc.elevation),
        base_radiacion: meteo.radiation_db || null,
        anios: (meteo.year_min && meteo.year_max) ? [meteo.year_min, meteo.year_max] : null,
        horizonte: meteo.use_horizon !== false,
        fuente: `PVGIS ${/v(\d+)_(\d+)/.exec(PVGIS_URL)?.slice(1).join('.') || ''} (JRC, Comisión Europea)`.replace('  ', ' '),
    };
}

/** Los parámetros, limpios y con sus valores por defecto. */
function limpiar(p = {}) {
    const inc = num(p.inclinacion);
    const ori = num(p.orientacion);
    const per = num(p.perdidas);
    return {
        lat: Math.round(Number(p.lat) * 10000) / 10000,
        lon: Math.round(Number(p.lon) * 10000) / 10000,
        //: Sin inclinación, PVGIS calcula la inclinación y la orientación
        //: ÓPTIMAS del sitio, que es lo que se supone cuando aún no hay tejado
        //: elegido.
        inclinacion: inc === null ? null : Math.min(90, Math.max(0, inc)),
        orientacion: inc === null ? null : Math.min(180, Math.max(-180, ori ?? 0)),
        perdidas: per === null || per < 0 || per >= 100 ? PERDIDAS_POR_DEFECTO : per,
        montaje: p.montaje === 'building' ? 'building' : 'free',
    };
}

const claveDe = (p) => [p.lat.toFixed(4), p.lon.toFixed(4), p.inclinacion ?? 'opt',
                        p.orientacion ?? 'opt', p.perdidas, p.montaje].join('|');

async function preguntar(p) {
    const params = {
        lat: p.lat, lon: p.lon, peakpower: 1, loss: p.perdidas,
        mountingplace: p.montaje, outputformat: 'json',
    };
    if (p.inclinacion === null) params.optimalangles = 1;
    else { params.angle = p.inclinacion; params.aspect = p.orientacion; }

    let ultimo;
    //: Un corte de red se repite UNA vez; lo que vuelve con respuesta, no
    //: (mismo criterio que el Catastro: repetir un "no" no lo cambia).
    for (let intento = 0; intento < 2; intento++) {
        try {
            const r = await axios.get(`${PVGIS_URL}/PVcalc`, { params, timeout: PLAZO_MS });
            return normalizar(r.data, p);
        } catch (e) {
            ultimo = e;
            //: El nuestro de `normalizar`. Ojo: axios TAMBIÉN pone `status` en
            //: sus errores (el HTTP), así que se distingue por `isAxiosError`.
            if (!e.isAxiosError) throw e;
            if (e.response) {
                const msg = e.response.data?.message || e.response.statusText || '';
                if (e.response.status === 400) {
                    throw errorCon(422, `PVGIS no tiene datos de ese punto: ${msg}`.trim());
                }
                if (e.response.status === 429) {
                    throw errorCon(503, 'PVGIS está limitando las consultas ahora mismo. Vuelve a intentarlo en un minuto.');
                }
                throw errorCon(502, `PVGIS ha contestado ${e.response.status}${msg ? `: ${msg}` : ''}.`);
            }
            if (intento === 0) await new Promise(r => setTimeout(r, 1200));
        }
    }
    throw errorCon(503, `PVGIS no ha respondido (${ultimo?.code || ultimo?.message || 'sin respuesta'}). `
        + 'Vuelve a intentarlo en un rato.');
}

/**
 * La producción ESPECÍFICA (por kWp) de un sitio.
 * @param {{lat, lon, inclinacion?, orientacion?, perdidas?, montaje?}} pedido
 */
async function produccionEspecifica(pedido) {
    const p = limpiar(pedido);
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) throw errorCon(400, 'Faltan la latitud y la longitud.');
    const clave = claveDe(p);

    const hit = cache.get(clave);
    if (hit && hit.expira > Date.now()) {
        cache.delete(clave); cache.set(clave, hit);    // LRU: al final
        return { ...hit.datos, cacheado: true };
    }
    if (enVuelo.has(clave)) return enVuelo.get(clave);

    const promesa = preguntar(p)
        .then((datos) => {
            cache.set(clave, { expira: Date.now() + TTL_MS, datos });
            while (cache.size > MAX_ENTRADAS) cache.delete(cache.keys().next().value);
            return { ...datos, cacheado: false };
        })
        .finally(() => enVuelo.delete(clave));
    enVuelo.set(clave, promesa);
    return promesa;
}

module.exports = { produccionEspecifica, resolverUbicacion, normalizar, limpiar, PVGIS_URL, _cache: cache };
