const axios = require('axios');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const xml2js = require('xml2js');

const climateService = require('./climateService');
const cache = require('./catastroCache');
const monitor = require('./catastroMonitor');

// El WAF del Catastro hace HTTP fingerprinting por orden de headers:
//   - http.request envía:  User-Agent, Accept, Accept-Encoding, Host, Connection
//   - axios envía:         Accept, User-Agent, Accept-Encoding, Host, Connection
// El segundo orden (axios) es bloqueado con 400 "No se puede procesar".
// Solución: usar http.request puro con orden idéntico al de curl/navegadores.
// Además forzamos family:4 (el VPS tiene IPv6 y Happy Eyeballs confunde al WAF).
// El WAF de los WCF del Catastro rechaza UAs muy específicos (Chrome desktop
// completo "Windows NT 10.0...", curl, Postman) pero acepta UAs identificables
// y genéricos. Empíricamente: "Mozilla/5.0 (compatible; Brokergy/1.0)" pasa.
const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Brokergy/1.0; +https://app.brokergy.es)',
    'Accept': 'application/json',
    'Accept-Encoding': 'identity'
};

/**
 * Cliente HTTP minimalista para Catastro. Devuelve { status, data, headers }
 * compatible con la firma de axios. data es Buffer si responseType==='arraybuffer',
 * string en otro caso. Rechaza con Error que tiene .response={status, data} si status>=400.
 */
function catastroGet(rawUrl, { headers = COMMON_HEADERS, timeout = 8000, responseType = 'text', params } = {}) {
    return new Promise((resolve, reject) => {
        let urlObj;
        try {
            urlObj = new URL(rawUrl);
            if (params) {
                for (const [k, v] of Object.entries(params)) urlObj.searchParams.append(k, v);
            }
        } catch (e) { return reject(e); }

        const lib = urlObj.protocol === 'https:' ? https : http;
        const opts = {
            host: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            family: 4,
            headers
        };

        const req = lib.request(opts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const data = responseType === 'arraybuffer' ? buf : buf.toString('utf8');
                const response = { status: res.statusCode, data, headers: res.headers };
                if (res.statusCode >= 400) {
                    const err = new Error(`Request failed with status code ${res.statusCode}`);
                    err.response = response;
                    return reject(err);
                }
                resolve(response);
            });
        });
        req.setTimeout(timeout, () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
        req.end();
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Helper para detectar el rate-limit/WAF del catastro en respuestas HTTP.
// Variantes vistas:
//   - 403 directo
//   - 200 con XML/HTML conteniendo "Peticion denegada / limite de peticiones por hora"
//   - 400 con HTML "No se puede procesar su petición" (WAF de ráfaga, IP datacenter)
function isRateLimitResponse(error, body) {
    const status = error?.response?.status;
    const bodyStr = String(body || error?.response?.data || error?.message || '').toLowerCase();
    if (status === 403) return true;
    if (bodyStr.includes('limite de peticiones')) return true;
    if (bodyStr.includes('peticion denegada')) return true;
    if (bodyStr.includes('no se puede procesar')) return true;
    return false;
}

class CatastroBlockedError extends Error {
    constructor(message) {
        super(message || 'Servicio del Catastro temporalmente no disponible');
        this.code = 'CATASTRO_RATE_LIMITED';
        this.statusCode = 503;
    }
}

// Catastro Web Services — WCF JSON (HTTPS).
// Migrado el 2026-05-19 desde los ASMX/XML legados porque el WAF del Catastro
// bloquea la familia ASMX desde IPs de datacenter (400 "No se puede procesar
// su petición"). Los WCF JSON sirven los mismos datos sin ese WAF.
// Docs: https://www.catastro.meh.es/ws/Webservices_Libres.pdf
const BASE_URL = 'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json';
const COORD_URL = 'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json';

/**
 * Helper to parse XML response from Catastro
 */
async function parseXML(xml) {
    const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true,
        tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    return await parser.parseStringPromise(xml);
}

/**
 * Helper to get text content from potentially complex XML nodes
 */
function getText(node) {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node._) return node._;
    if (typeof node === 'object' && Object.keys(node).length === 0) return '';
    return node.toString();
}

/**
 * Normaliza el tipo de construcción a un nombre legible
 */
function normalizeConstructionType(lcd) {
    if (!lcd) return 'OTRO';
    const upper = lcd.toUpperCase();
    if (upper.includes('VIVIENDA') || upper === 'V') return 'VIVIENDA';
    if (upper.includes('ALMACEN') || upper === 'K') return 'ALMACEN';
    if (upper.includes('APARCAMIENTO') || upper.includes('GARAJE') || upper === 'G') return 'APARCAMIENTO';
    if (upper.includes('LOCAL') || upper === 'C') return 'LOCAL COMERCIAL';
    if (upper.includes('OFICINA') || upper === 'O') return 'OFICINA';
    if (upper.includes('INDUSTRIAL') || upper === 'I') return 'INDUSTRIAL';
    return lcd;
}

/**
 * Extrae la planta del código de localización
 */
function extractFloor(loint) {
    if (!loint) return '00';
    const pt = loint.pt || loint.Pt || '00';
    return pt.toString().padStart(2, '0');
}

/**
 * Obtener coordenadas UTM reales desde Consulta_CPMRC (WCF JSON)
 */
//: `conFallos`: un corte de conexión se LANZA en vez de devolverse como `null`.
//: Por defecto no, que es lo que esperan todos los que ya la usan; lo pide quien
//: necesita distinguir «Catastro no tiene el dato» de «Catastro no ha
//: respondido» — que no pueden tratarse igual (ver `imagenesDeCatastro`).
async function getCoordinatesByRC(rc, { conFallos = false } = {}) {
    try {
        const cleanRC = rc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const parcelRC = cleanRC.substring(0, 14);

        const url = `${COORD_URL}/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:25830&RefCat=${parcelRC}`;
        const response = await catastroGet(url, { headers: COMMON_HEADERS, timeout: 8000 });

        const result = JSON.parse(response.data);
        const inner = result.Consulta_CPMRCResult;
        if (!inner || inner.lerr) return null;

        // Catastro JSON: `coord` puede venir como array u objeto suelto.
        const coordList = inner.coordenadas?.coord;
        const coord = Array.isArray(coordList) ? coordList[0] : coordList;
        if (!coord || !coord.geo) return null;

        const x = parseFloat(coord.geo.xcen);
        const y = parseFloat(coord.geo.ycen);
        if (!x || !y) return null;

        return {
            x: Math.round(x),
            y: Math.round(y),
            srs: 'EPSG:25830',
            zone: 30
        };
    } catch (error) {
        console.error(`Catastro Coordinates Error [${rc}]:`, error.message);
        if (conFallos) throw error;
        return null;
    }
}

// URL de la ficha web (Consulta Descriptiva y Gráfica) de la Sede Electrónica.
const SEDE_FICHA_URL = 'https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx';

/**
 * Reforma por construcción (Tipo Reforma / Fecha Reforma).
 *
 * IMPORTANTE: el web service WCF JSON `Consulta_DNPRC` NO devuelve la reforma.
 * En su `lcons` cada construcción solo trae uso, ubicación, superficie y tipología.
 * El dato "Tipo Reforma" + "Fecha Reforma" SOLO aparece en la ficha web de la Sede
 * (la Consulta Descriptiva y Gráfica), en la tabla `tblLocales` de OVCConCiud.aspx.
 *
 * Esa ficha es accesible con `del` (código de provincia) y `mun` (código de
 * municipio de Catastro), ambos presentes en la propia respuesta del DNPRC
 * (`dt.loine.cp` y `dt.cmc`). Devuelve un 200 directo con la tabla.
 *
 * Best-effort: ante CUALQUIER fallo (red, WAF, HTML cambiado, códigos erróneos)
 * devuelve [] y la búsqueda principal del Catastro no se ve afectada. No pasa por
 * el `catastroMonitor` (es otro host/servicio: www1.sedecatastro.gob.es).
 *
 * @returns {Promise<Array<{uso,es,pt,pu,surface,reformType,reformYear}>>}
 */
async function getReformsByRC(rc, del, mun) {
    if (!rc || !del || !mun) return [];
    try {
        const cleanRC = rc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const url = `${SEDE_FICHA_URL}?del=${del}&mun=${mun}&RefC=${cleanRC}&from=OVCBusqueda&pest=urbana&final=&RCABRV=`;
        const response = await catastroGet(url, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
                'Accept': 'text/html',
                'Accept-Encoding': 'identity'
            }
        });

        const html = String(response.data || '');
        const tIdx = html.indexOf('tblLocales');
        if (tIdx < 0) return [];
        const endIdx = html.indexOf('</table>', tIdx);
        const tableHtml = html.slice(tIdx, endIdx < 0 ? undefined : endIdx);

        const cellText = (cell) => cell
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const out = [];
        for (const row of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
            const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => cellText(c[1]));
            // Columnas: Uso | Escalera | Planta | Puerta | Superficie | Tipo Reforma | Fecha Reforma
            // La cabecera usa <th>, así que no genera celdas <td> → se descarta sola.
            if (cells.length < 7) continue;
            const [uso, es, pt, pu, sup, tipoRef, fechaRef] = cells;
            const reformType = tipoRef ? tipoRef.trim() : '';
            const yr = parseInt(String(fechaRef || '').replace(/\D/g, ''), 10);
            out.push({
                uso,
                es,
                pt,
                pu,
                surface: parseInt(sup, 10) || 0,
                reformType: reformType || null,
                reformYear: (Number.isFinite(yr) && yr > 1700 && yr < 2100) ? yr : null
            });
        }
        return out;
    } catch (e) {
        console.warn(`[getReformsByRC] ${rc}:`, e.message);
        return [];
    }
}

/**
 * Consulta_DNPRC: Get data by RC
 * Cacheado durante 30 días (datos catastrales muy estables).
 */
async function getByRC(rc) {
    const cleanRC = rc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // 1) Cache hit → devolver al instante sin tocar catastro
    const cacheKey = cache.rcKey(cleanRC);
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    // 2) Si el monitor está bloqueado, abortar antes de quemar quota
    if (monitor.shouldSkipRequest()) {
        throw new CatastroBlockedError();
    }

    try {
        monitor.recordRequest();
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RefCat=${cleanRC}`;

        // Datos y coordenadas en serie (defensa contra antiguos WAF de ráfaga).
        const response = await catastroGet(url, { headers: COMMON_HEADERS, timeout: 8000 });
        await sleep(500);
        const coordinates = await getCoordinatesByRC(cleanRC);

        // Detectar rate-limit en el body
        if (isRateLimitResponse(null, response.data)) {
            monitor.record403(String(response.data).substring(0, 200));
            throw new CatastroBlockedError();
        }

        const result = JSON.parse(response.data);
        const consulta = result.consulta_dnprcResult;

        if (!consulta || consulta.lerr) {
            let errDesc = 'Error en Catastro';
            let errCode = 'CATASTRO_APP_ERROR';

            const errs = Array.isArray(consulta?.lerr) ? consulta.lerr : (consulta?.lerr ? [consulta.lerr] : []);
            if (errs.length) {
                const firstErr = errs[0];
                const code = String(firstErr.cod || '');
                errDesc = errs.map(e => String(e.des || '')).filter(Boolean).join('. ') || errDesc;

                if (['4', '7', '8'].includes(code)) {
                    errCode = 'RC_INVALID_FORMAT';
                } else if (code === '1' || errDesc.toUpperCase().includes('NO ENCONTRADA') || errDesc.toUpperCase().includes('NO SE HA ENCONTRADO')) {
                    errCode = 'RC_NOT_FOUND';
                }
            }

            const error = new Error(errDesc);
            error.code = errCode;
            console.warn(`Catastro API Error [${cleanRC}] [${errCode}]:`, errDesc);
            throw error;
        }

        // PARCELA con división horizontal: el Catastro devuelve la LISTA de inmuebles
        // (`lrcdnp`) y ningún `bico`. Es un EDIFICIO completo, no una vivienda, así que se
        // resume como tal en vez de morir leyendo `bico.bi` de un undefined.
        if (!consulta.bico && consulta.lrcdnp) {
            const parcela = resumirParcela(cleanRC, consulta, coordinates);
            monitor.recordSuccess();
            cache.set(cacheKey, parcela, cache.TTL_RC);
            return parcela;
        }

        const bico = consulta.bico;
        const bi = Array.isArray(bico.bi) ? bico.bi[0] : bico.bi;
        const debi = bi?.debi || {};

        // Parsear construcciones — en JSON `lcons` es array directo (no wrap "cons").
        const lconsRaw = bico.lcons;
        const constructions = [];
        let totalSurface = 0;
        const floorSet = new Set();
        const summaryByType = {};

        if (lconsRaw) {
            const consList = Array.isArray(lconsRaw) ? lconsRaw : [lconsRaw];
            consList.forEach((c, index) => {
                const lcd = String(c.lcd || '') || 'OTRO';
                const type = normalizeConstructionType(lcd);
                const surface = parseInt(c.dfcons?.stl) || 0;
                const floor = extractFloor(c.dt?.lourb?.loint || {});

                const es = c.dt?.lourb?.loint?.es || '01';
                const pt = c.dt?.lourb?.loint?.pt || '00';
                const pu = c.dt?.lourb?.loint?.pu || '001';

                constructions.push({
                    type,
                    originalType: lcd,
                    floor,
                    surface,
                    code: `${es}/${pt}/${pu}`,
                    index: index + 1
                });

                totalSurface += surface;
                floorSet.add(floor);
                summaryByType[type] = (summaryByType[type] || 0) + surface;
            });
        }

        // --- Enriquecer con la REFORMA (Tipo/Fecha) de la ficha de la Sede ---
        // El DNPRC no trae reforma; se obtiene de la ficha web (best-effort).
        let reformaResumen = { has: false, tipo: null, anio: null };
        try {
            const del = bi.dt?.loine?.cp;
            const mun = bi.dt?.cmc || bi.dt?.loine?.cm;
            const reforms = await getReformsByRC(cleanRC, del, mun);
            if (reforms.length) {
                const norm = (s) => String(s ?? '').trim().replace(/^0+(?=\d)/, '').toUpperCase();
                constructions.forEach((cons, idx) => {
                    let r = null;
                    // 1) Posicional si los conteos cuadran y coincide el uso (mismo orden y fuente).
                    if (reforms.length === constructions.length) {
                        const cand = reforms[idx];
                        if (cand && norm(cand.uso) === norm(cons.originalType)) r = cand;
                    }
                    // 2) Fallback por uso + planta + puerta (parseando code "es/pt/pu").
                    if (!r) {
                        const [, pt, pu] = String(cons.code || '//').split('/');
                        r = reforms.find(x =>
                            norm(x.uso) === norm(cons.originalType) &&
                            norm(x.pt) === norm(pt) &&
                            norm(x.pu) === norm(pu)
                        ) || null;
                    }
                    cons.reformType = r?.reformType || null;
                    cons.reformYear = r?.reformYear || null;
                });
                // Resumen del inmueble = reforma más reciente entre sus construcciones.
                const conRef = constructions.filter(c => c.reformType);
                if (conRef.length) {
                    const latest = conRef.reduce((a, b) => ((b.reformYear || 0) > (a.reformYear || 0) ? b : a));
                    reformaResumen = { has: true, tipo: latest.reformType, anio: latest.reformYear };
                }
            }
        } catch (e) {
            console.warn(`[getByRC] reforma enrichment [${cleanRC}]:`, e.message);
        }

        const primaryUse = summaryByType['VIVIENDA'] ? 'Residencial' : (String(debi.luso || '') || 'No especificado');

        const propertyData = {
            rc: cleanRC,
            address: String(bi?.ldt || bico?.ldt || '') || 'Dirección no disponible',
            use: primaryUse,
            totalSurface: totalSurface || parseInt(debi.sfc) || 0,
            yearBuilt: parseInt(debi.ant) || 0,
            utm: coordinates || { x: 0, y: 0, zone: 30, srs: 'EPSG:25830' },
            constructions: constructions.sort((a, b) => a.floor.localeCompare(b.floor)),
            // Reforma registrada en Catastro (resumen del inmueble). El detalle por
            // construcción va en cada item de `constructions` (reformType/reformYear).
            reforma: reformaResumen,
            summaryByType,
            floors: {
                total: floorSet.size || 1,
                list: Array.from(floorSet).sort()
            },
            provinceCode: bi.dt?.loine?.cp || '',
            municipalityCode: bi.dt?.loine?.cm || '',
            // Código postal de la finca (Catastro lo trae en dt.lourb.dp). Sirve para
            // autocompletar el CP del cliente aunque el XML del CEE no lo incluya.
            postalCode: String(bi.dt?.locs?.lous?.lourb?.dp || bi.dt?.lourb?.dp || '') || null,

            // Desglose de la dirección de la INSTALACIÓN (vivienda) para poder
            // separarla del domicilio del cliente en los documentos (Anexo I, CIFO,
            // RES080, Cesión...). `street` = la dirección (ldt) sin el CP/municipio/
            // provincia del final — coincide con cómo la formatea el propio Catastro
            // (sin interior en unifamiliares); fallback a construir desde `dt`.
            // `municipality`/`province` = nombre del municipio y provincia.
            street: (function () {
                const ldt = String(bi?.ldt || bico?.ldt || '');
                const m = ldt.match(/^(.*?)\s+\d{5}\b/);
                return (m ? m[1] : '').trim() || buildStreetFromDt(bi.dt) || null;
            })(),
            municipality: getText(bi.dt?.nm) || null,
            province: getText(bi.dt?.np) || null,

            // Enrich with Climate Data
            climateInfo: climateService.getClimateInfo(bi.dt?.loine?.cp, bi.dt?.loine?.cm),

            // CAMPOS SOLICITADOS: Participación y Tipo Catastro
            participation: (function (cpt) {
                const val = String(cpt || '');
                if (!val) return '100,00';
                const num = parseFloat(val.replace(',', '.'));
                if (isNaN(num)) return val;
                return num.toFixed(2).replace('.', ',');
            })(debi.cpt),
            typeCatastro: (function () {
                // El JSON suele traer el tipo en `bico.finca.ltp`
                const finca = bico?.finca;
                if (finca?.ltp) return String(finca.ltp);
                const explicitType = String(bi?.idbi?.rat?.ant || debi?.tip || '');
                if (explicitType && explicitType.length > 2) return explicitType;
                const val = String(debi.cpt || '');
                if (val) {
                    const num = parseFloat(val.replace(',', '.'));
                    if (!isNaN(num) && num < 99.99) {
                        return 'Parcela con varios inmuebles (división horizontal)';
                    }
                }
                return 'Parcela construida sin división horizontal';
            })(),

            verified: true,
            source: 'Catastro (OVCC)'
        };

        monitor.recordSuccess();
        cache.set(cacheKey, propertyData, cache.TTL_RC);
        return propertyData;

    } catch (error) {
        if (error instanceof CatastroBlockedError) throw error;
        if (isRateLimitResponse(error)) {
            monitor.record403(error.message);
            throw new CatastroBlockedError();
        }
        if (error.code && error.code.startsWith('RC_')) {
            monitor.recordSuccess(); // RC inválida/no encontrada = catastro respondió OK
            throw error;
        }
        if (error.code && error.code.startsWith('CATASTRO_APP_ERROR')) {
            monitor.recordSuccess();
            throw error;
        }
        monitor.recordOtherError(error.message);

        // Categorizar errores de red/servidor
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            error.code = 'CATASTRO_TIMEOUT';
        } else if (error.response) {
            error.code = 'CATASTRO_DOWN';
        } else if (error.request) {
            error.code = 'CATASTRO_UNREACHABLE';
        }
        throw error;
    }
}

/**
 * Intenta obtener la RC completa (20 caracteres) dada la referencia parcelaria (14 caracteres)
 */
async function getFullRC(rc14) {
    try {
        const cleanRC = rc14.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 14);
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RefCat=${cleanRC}`;

        const response = await catastroGet(url, { headers: COMMON_HEADERS, timeout: 5000 });

        const result = JSON.parse(response.data);
        const consulta = result.consulta_dnprcResult;
        if (!consulta || consulta.lerr) return rc14;

        // Case 1: Multiple dwellings (lrcdnp - list of property references)
        if (consulta.lrcdnp) {
            const list = Array.isArray(consulta.lrcdnp) ? consulta.lrcdnp : (consulta.lrcdnp.rcdnp ? (Array.isArray(consulta.lrcdnp.rcdnp) ? consulta.lrcdnp.rcdnp : [consulta.lrcdnp.rcdnp]) : []);
            if (list.length > 0) {
                const node = list[0].rc || list[0];
                if (node && node.pc1 && node.pc2) {
                    return node.pc1 + node.pc2 + (node.car || '') + (node.cc1 || '') + (node.cc2 || '');
                }
            }
        }

        // Case 2: Single property (bico - direct property data)
        if (consulta.bico) {
            const bi = Array.isArray(consulta.bico.bi) ? consulta.bico.bi[0] : consulta.bico.bi;
            const rcNode = bi?.idbi?.rc;
            if (rcNode && rcNode.pc1 && rcNode.pc2) {
                return rcNode.pc1 + rcNode.pc2 + (rcNode.car || '') + (rcNode.cc1 || '') + (rcNode.cc2 || '');
            }
        }

        return rc14;
    } catch (e) {
        return rc14;
    }
}

async function getRCByCoords(lat, lng, numberHint = null) {
    // Estrategia SECUENCIAL con backoff. Diseñada para sobrevivir al WAF
    // de ráfaga del Catastro que dispara 400/TCP-reset cuando ve >2-3
    // peticiones simultáneas desde IPs de datacenter (descubierto 2026-05-18).
    //
    //   1. Cache hit → 0 peticiones
    //   2. Petición CENTRAL → si encuentra, 1 petición
    //   3. Si no, hasta 4 puntos del grid EN SERIE con 200ms entre ellos.
    //      Paramos en cuanto uno acierta.
    //
    // Peor caso: 5 peticiones espaciadas ~200ms = ~1.5s. Sigue siendo
    // rápido y respetuoso con el rate-limit por ráfaga del Catastro.

    const cacheKey = cache.coordsKey(lat, lng);
    const cached = cache.get(cacheKey);
    if (cached !== null) return cached;

    if (monitor.shouldSkipRequest()) {
        throw new CatastroBlockedError();
    }

    // Helper: una sola consulta de coordenada. Devuelve { rc14, address, lat, lng, distance } o null.
    const queryPoint = async (targetLat, targetLng, distance) => {
        const url = `${COORD_URL}/Consulta_RCCOOR?SRS=EPSG:4326&CoorX=${targetLng}&CoorY=${targetLat}`;
        monitor.recordRequest();
        try {
            const response = await catastroGet(url, { headers: COMMON_HEADERS, timeout: 5000 });
            if (isRateLimitResponse(null, response.data)) {
                monitor.record403(String(response.data).substring(0, 200));
                throw new CatastroBlockedError();
            }
            const result = JSON.parse(response.data);
            const inner = result.Consulta_RCCOORResult;
            if (!inner || inner.lerr) {
                monitor.recordSuccess();
                return null;
            }
            const coordList = inner.coordenadas?.coord;
            const coord = Array.isArray(coordList) ? coordList[0] : coordList;
            const pc = coord?.pc || {};
            if (!pc.pc1 || !pc.pc2) {
                monitor.recordSuccess();
                return null;
            }
            monitor.recordSuccess();
            return {
                rc14: pc.pc1 + pc.pc2,
                address: String(coord?.ldt || ''),
                lat: targetLat,
                lng: targetLng,
                distance
            };
        } catch (err) {
            if (err instanceof CatastroBlockedError) throw err;
            if (isRateLimitResponse(err)) {
                monitor.record403(err.message);
                throw new CatastroBlockedError();
            }
            monitor.recordOtherError(err.message);
            return null;
        }
    };

    try {
        // 1. Petición CENTRAL
        let match = await queryPoint(lat, lng, 0);

        // 2. Si la central falla, 2 puntos en SERIE (N, E) con delay generoso.
        //    Reducido de 4→2 puntos y 200→800ms tras detectar que el WAF del
        //    Catastro bloquea agresivamente IPs de datacenter al menor burst.
        if (!match) {
            const step = 0.0001;
            const offsets = [
                { dlat:  step, dlng:     0, d: 1 },  // N
                { dlat:     0, dlng:  step, d: 1 }   // E
            ];
            for (const o of offsets) {
                await sleep(800);
                const r = await queryPoint(lat + o.dlat, lng + o.dlng, o.d);
                if (r) { match = r; break; }
            }
        }

        if (!match) {
            cache.set(cacheKey, null, cache.TTL_COORDS);
            return null;
        }

        await sleep(500);
        const fullRC = await getFullRC(match.rc14);
        const result_data = {
            rc: fullRC,
            address: match.address,
            location: { lat: match.lat, lng: match.lng },
            distance: match.distance === 0 ? 0 : 'approx_10m'
        };
        cache.set(cacheKey, result_data, cache.TTL_COORDS);
        return result_data;
    } catch (err) {
        if (err instanceof CatastroBlockedError) throw err;
        console.warn(`[getRCByCoords] Error en ${lat},${lng}:`, err.message);
        return null;
    }
}

/**
 * Construye la dirección de un inmueble a partir del nodo `dt` del XML resumido.
 */
function buildAddressFromDt(dt) {
    if (!dt) return '';
    const lourb = dt.locs?.lous?.lourb || dt.lourb || {};
    const dir = lourb.dir || {};
    const loint = lourb.loint || {};

    const tv = getText(dir.tv);
    const nv = getText(dir.nv);
    const pnp = getText(dir.pnp);
    const es = getText(loint.es);
    const pt = getText(loint.pt);
    const pu = getText(loint.pu);
    const dp = getText(lourb.dp);
    const nm = getText(dt.nm);
    const np = getText(dt.np);

    const parts = [];
    if (tv && nv) parts.push(`${tv} ${nv}`);
    if (pnp) parts.push(pnp);

    const intParts = [];
    if (es) intParts.push(`Es:${es}`);
    if (pt) intParts.push(`Pl:${pt}`);
    if (pu) intParts.push(`Pt:${pu}`);

    let address = parts.join(' ');
    if (intParts.length) address += ' ' + intParts.join(' ');
    if (dp) address += ' ' + dp;
    if (nm) address += ' ' + nm;
    if (np) address += ` (${np})`;

    return address.trim();
}

/**
 * Igual que buildAddressFromDt pero SOLO la parte de calle (tipo vía + nombre +
 * número + interior), sin código postal, municipio ni provincia. Se usa para
 * autocompletar la dirección de la instalación por separado (la app guarda
 * municipio/provincia/CP en campos propios).
 */
function buildStreetFromDt(dt) {
    if (!dt) return '';
    const lourb = dt.locs?.lous?.lourb || dt.lourb || {};
    const dir = lourb.dir || {};
    const loint = lourb.loint || {};

    const tv = getText(dir.tv);
    const nv = getText(dir.nv);
    const pnp = getText(dir.pnp);
    const es = getText(loint.es);
    const pt = getText(loint.pt);
    const pu = getText(loint.pu);

    const parts = [];
    if (tv && nv) parts.push(`${tv} ${nv}`);
    if (pnp) parts.push(pnp);

    const intParts = [];
    if (es) intParts.push(`Es:${es}`);
    if (pt) intParts.push(`Pl:${pt}`);
    if (pu) intParts.push(`Pt:${pu}`);

    let street = parts.join(' ');
    if (intParts.length) street += ' ' + intParts.join(' ');

    return street.trim();
}

function isLikelyNonResidentialFloor(floor) {
    if (!floor) return false;
    const f = floor.toString().trim().toUpperCase();
    if (/^-\d+$/.test(f)) return true;
    if (['SS', 'SO', 'ST'].includes(f)) return true;
    return false;
}

/**
 * Un inmueble de la lista `lrcdnp` (o el `bi` de un bico), en la forma que consume la app.
 * Vive fuera de `getDwellingsByParcel` porque `getByRC` lo necesita sobre la respuesta que
 * YA tiene en la mano: repetirlo alli acabaria con dos lecturas distintas del mismo JSON.
 */
function extraerInmueble(item) {
    const rcNode = item.rc || item.idbi?.rc;
    let fullRc = '';
    if (rcNode && rcNode.pc1 && rcNode.pc2) {
        fullRc = rcNode.pc1 + rcNode.pc2 + (rcNode.car || '') + (rcNode.cc1 || '') + (rcNode.cc2 || '');
    }
    const dt = item.dt || {};
    const lourb = dt.locs?.lous?.lourb || dt.lourb || {};
    const loint = lourb.loint || {};
    const debi = item.debi || {};
    return {
        rc: fullRc,
        address: String(item.ldt || '') || buildAddressFromDt(dt),
        block: String(loint.es || ''),
        floor: String(loint.pt || ''),
        door: String(loint.pu || ''),
        use: String(debi.luso || ''),
        surface: parseInt(debi.sfc) || 0,
        yearBuilt: parseInt(debi.ant) || 0,
    };
}

/** Marca cada inmueble como residencial o no. El USO manda; sin uso, la planta desempata. */
function extraerInmuebles(consulta) {
    let lista = [];
    if (consulta?.lrcdnp) {
        const raw = consulta.lrcdnp;
        const rcList = Array.isArray(raw) ? raw : (raw.rcdnp ? (Array.isArray(raw.rcdnp) ? raw.rcdnp : [raw.rcdnp]) : []);
        lista = rcList.map(extraerInmueble).filter(d => d.rc);
    } else if (consulta?.bico) {
        const bi = Array.isArray(consulta.bico.bi) ? consulta.bico.bi[0] : consulta.bico.bi;
        if (bi) {
            const d = extraerInmueble(bi);
            if (d.rc) lista.push(d);
        }
    }
    return lista.map(d => {
        const u = (d.use || '').toUpperCase();
        let isResidential;
        if (u) isResidential = /RESIDENCIAL|VIVIENDA/.test(u);
        else if (isLikelyNonResidentialFloor(d.floor)) isResidential = false;
        else isResidential = true;
        return { ...d, isResidential };
    });
}

/**
 * Resumen de una PARCELA con division horizontal --- un bloque de viviendas.
 *
 * El Catastro responde a una RC de 14 de dos formas distintas e incompatibles: si la finca
 * no esta dividida devuelve `bico` (UN inmueble) y si lo esta devuelve `lrcdnp` (la LISTA).
 * `getByRC` solo sabia leer la primera, asi que buscar el bloque de la calle Fuenmayor
 * 72-74 de Logrono (118 inmuebles) moria en `bico.bi` sobre un undefined y la app decia
 * "no se pudo completar la busqueda" --- no que fuera un edificio.
 *
 * Lo que se devuelve aqui NO es una vivienda: es el EDIFICIO. Por eso no lleva
 * `constructions` (son las de un inmueble) y si lleva lo que hace falta para decidir:
 * cuantos inmuebles hay, cuantos son viviendas y de que portales.
 */
function resumirParcela(cleanRC, consulta, coordinates) {
    const inmuebles = extraerInmuebles(consulta);
    const viviendas = inmuebles.filter(i => i.isResidential);
    const rcdnpLista = (() => {
        const raw = consulta?.lrcdnp?.rcdnp;
        return Array.isArray(raw) ? raw : (raw ? [raw] : []);
    })();
    const inmueblesDt = rcdnpLista.map(i => ({ dt: i.dt || {} }));

    // Un bloque ocupa varios portales y a veces DOS CALLES: el de Fuenmayor hace esquina
    // con Irlanda. El Catastro no publica una direccion "de la parcela", asi que se compone
    // agrupando los portales por via --- y desde el nodo ESTRUCTURADO (`dir`), nunca
    // parseando el `ldt`: ese texto lleva pegado el interior ("Es:1 Pl:00 Pt:01") y el
    // primer numero que aparece en el no siempre es el del portal.
    const porVia = new Map();
    inmueblesDt.forEach(({ dt }) => {
        const dir = (dt.locs?.lous?.lourb || dt.lourb || {}).dir || {};
        const via = [String(dir.tv || '').trim(), String(dir.nv || '').trim()].filter(Boolean).join(' ');
        if (!via) return;
        if (!porVia.has(via)) porVia.set(via, new Set());
        if (dir.pnp) porVia.get(via).add(String(dir.pnp).trim());
    });
    const direcciones = [...porVia.entries()]
        // La via principal es la que reune mas inmuebles; las demas van detras.
        .sort((a, b) => b[1].size - a[1].size)
        .map(([via, nums]) => `${via} ${[...nums].sort((x, y) => Number(x) - Number(y)).join('-')}`.trim());

    const anios = inmuebles.map(i => i.yearBuilt).filter(Boolean).sort((a, b) => a - b);

    const dt0 = rcdnpLista[0]?.dt || {};
    const lourb0 = dt0.locs?.lous?.lourb || dt0.lourb || {};

    return {
        rc: cleanRC,
        // La bandera que lee el frontend. Un consumidor que no la conozca sigue recibiendo
        // un objeto con `rc` y `address`, no un undefined a media pantalla.
        isParcela: true,
        kind: 'PARCELA',
        address: direcciones[0] || inmuebles[0]?.address || 'Dirección no disponible',
        // Todas las vías de la parcela. Un bloque en esquina tiene dos, y esconder la
        // segunda hace dudar de si la referencia buscada es la correcta.
        addresses: direcciones,
        totalUnits: inmuebles.length,
        dwellingCount: viviendas.length,
        // Superficie CONSTRUIDA (Catastro), no util habitable: la del calculo sale del CEE.
        dwellingSurface: viviendas.reduce((a, i) => a + (i.surface || 0), 0),
        totalSurface: inmuebles.reduce((a, i) => a + (i.surface || 0), 0),
        yearBuilt: anios.length ? anios[Math.floor(anios.length / 2)] : 0,
        dwellings: inmuebles,
        utm: coordinates || { x: 0, y: 0, zone: 30, srs: 'EPSG:25830' },
        provinceCode: String(dt0.loine?.cp || ''),
        municipalityCode: String(dt0.loine?.cm || ''),
        postalCode: String(lourb0.dp || '') || null,
        municipality: getText(dt0.nm) || null,
        province: getText(dt0.np) || null,
        climateInfo: climateService.getClimateInfo(dt0.loine?.cp, dt0.loine?.cm),
        typeCatastro: 'Parcela con división horizontal (edificio completo)',
        verified: true,
        source: 'Catastro (OVCC)',
    };
}

/**
 * Lista de inmuebles (viviendas, locales, trasteros) de una parcela con división horizontal.
 * Solo se llama BAJO DEMANDA desde /api/catastro/dwellings/:rc14, no en cada búsqueda.
 * Cache 30 días gestionado por el handler de la ruta.
 */
async function getDwellingsByParcel(rc14) {
    if (monitor.shouldSkipRequest()) {
        throw new CatastroBlockedError();
    }
    try {
        const cleanRC = rc14.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 14);
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RefCat=${cleanRC}`;

        monitor.recordRequest();
        const response = await catastroGet(url, { headers: COMMON_HEADERS, timeout: 8000 });

        if (isRateLimitResponse(null, response.data)) {
            monitor.record403(String(response.data).substring(0, 200));
            throw new CatastroBlockedError();
        }

        const result = JSON.parse(response.data);
        const consulta = result.consulta_dnprcResult;
        if (!consulta || consulta.lerr) {
            monitor.recordSuccess();
            return [];
        }

        monitor.recordSuccess();

        return extraerInmuebles(consulta);
    } catch (error) {
        if (error instanceof CatastroBlockedError) throw error;
        if (isRateLimitResponse(error)) {
            monitor.record403(error.message);
            throw new CatastroBlockedError();
        }
        monitor.recordOtherError(error.message);
        console.error(`Dwellings Error [${rc14}]:`, error.message);
        return [];
    }
}

/**
 * La MINIATURA que la foto de fachada lleva dentro, para MIRARLA.
 *
 * Catastro sirve la fachada a tamaño de cámara —medido en 4410205WJ0641S0001JH:
 * **2304×1728 y 323 KB**— y la app la pinta en un recuadro de 300×170. En base64
 * dentro de un JSON son 431 KB que hay que esperar para ver una foto del tamaño
 * de un sello: por eso la imagen del certificado tardaba en aparecer.
 *
 * Pero el fichero YA trae una miniatura de **640×480 en 58 KB** metida en su
 * segmento EXIF, que es de sobra para lo único que se hace con ella (comprobar
 * que es esta casa). Sacarla no cuesta nada y no hay que reescalar ni añadir una
 * dependencia de imágenes al backend.
 *
 * REGLA — esto es para la VISTA. Al `.cex` sigue yendo la grande: el motor la
 * reescala él a los 179×134 que guarda CE3X, y esa parte está verificada contra
 * un `.cex` real.
 *
 * Ante cualquier duda devuelve `null` y se enseña la grande: una foto pesada
 * tarda; una foto cortada por donde no es, no se ve.
 */
function miniaturaExif(buf) {
    if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    // El APP1 con "Exif" es donde vive; se localiza por marcadores y no
    // buscando a ojo, que en un binario encuentra cualquier cosa.
    let i = 2;
    while (i + 3 < buf.length && buf[i] === 0xFF) {
        const marca = buf[i + 1];
        if (marca === 0xDA || marca === 0xD9) return null;     // ya son datos
        const largo = buf.readUInt16BE(i + 2);
        if (largo < 2) return null;
        if (marca === 0xE1 && buf.subarray(i + 4, i + 8).toString('latin1') === 'Exif') {
            return _jpegDentro(buf.subarray(i + 4, Math.min(i + 2 + largo, buf.length)));
        }
        i += 2 + largo;
    }
    return null;
}

/** El primer JPEG COMPLETO que haya dentro de un bloque, si se sostiene solo. */
function _jpegDentro(bloque) {
    const ini = bloque.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]));
    if (ini < 0) return null;
    const fin = bloque.lastIndexOf(Buffer.from([0xFF, 0xD9]));
    if (fin <= ini) return null;
    const jpeg = Buffer.from(bloque.subarray(ini, fin + 2));
    return _dimensiones(jpeg) ? jpeg : null;   // si no se puede leer, no vale
}

/** `[ancho, alto]` de un JPEG, o null. Sirve para comprobar que lo es. */
function _dimensiones(b) {
    let i = 2;
    while (i + 9 < b.length && b[i] === 0xFF) {
        const m = b[i + 1];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
            return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        }
        if (i + 3 >= b.length) return null;
        const largo = b.readUInt16BE(i + 2);
        if (largo < 2) return null;
        i += 2 + largo;
    }
    return null;
}

/**
 * ¿Se puede PINTAR esta foto de fachada?
 *
 * Catastro guarda fotos ROTAS: el fichero llega con su cabecera y su EXIF, pero
 * los datos de la imagen se cortan a media línea y el fin de JPEG no llega nunca.
 * Medido el 16/09/2026 sobre 20 viviendas reales, **6 llegan así** — idénticas
 * byte a byte en tres descargas seguidas y también bajándolas de su servidor sin
 * pasar por la app, o sea que están rotas en origen y no hay reintento que las
 * arregle.
 *
 * Y no se nota hasta que se intenta pintar: un `<img>` dispara `load` y dice
 * 1024×768, pero el lienzo sale NEGRO y en la página no se ve nada. Por eso la
 * portada de una propuesta se quedaba sin su foto sin que nada lo delatara
 * (26RES080_OP62).
 *
 * REGLA — el fin de JPEG cuenta solo si está DESPUÉS del inicio del scan. El
 * `FFD9` de un fichero cortado es el de la miniatura del EXIF, que va en la
 * cabecera y no dice nada de la imagen grande. Y no vale exigirlo al final del
 * fichero: Catastro escribe relleno detrás —medido en 4410205WJ0641S0001JH:
 * 330.687 bytes cuya imagen acaba en el 62.354— y ésa se ve perfectamente.
 */
function fachadaCompleta(buf) {
    if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return false;
    let i = 2, sos = -1;
    while (i + 3 < buf.length && buf[i] === 0xFF) {
        const marca = buf[i + 1];
        if (marca === 0xDA) { sos = i; break; }              // empiezan los datos
        if (marca === 0xD8 || (marca >= 0xD0 && marca <= 0xD9)) { i += 2; continue; }
        const largo = buf.readUInt16BE(i + 2);
        if (largo < 2) return false;
        i += 2 + largo;
    }
    if (sos < 0) return false;
    return buf.lastIndexOf(Buffer.from([0xFF, 0xD9])) > sos;
}

async function getFacadeImage(rc, { conFallos = false } = {}) {
    const cleanRC = rc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const imageUrl = `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc/RecuperarFotoFachadaGet?ReferenciaCatastral=${cleanRC}`;
    try {
        const response = await catastroGet(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Brokergy/1.0; +https://app.brokergy.es)',
                'Accept': '*/*',
                'Accept-Encoding': 'identity'
            }
        });
        if (response.headers['content-type']?.includes('image')) {
            const byteLength = response.data?.byteLength ?? response.data?.length ?? 0;
            // Imágenes placeholder del Catastro (sin foto registrada) son píxeles 1×1
            // o respuestas vacías: siempre < 500 bytes.
            // Una foto real de fachada, incluso muy comprimida, supera 1 KB.
            if (byteLength < 500) {
                console.warn(`Facade Image [${rc}]: placeholder descartado (${byteLength} bytes)`);
                return null;
            }
            const grande = Buffer.from(response.data);
            return { data: grande, contentType: response.headers['content-type'],
                     // La misma foto, en pequeño, para enseñarla sin esperar.
                     miniatura: miniaturaExif(grande) };
        }
        // Sin foto registrada, Catastro contesta 200 con el cuerpo VACÍO y sin
        // tipo (medido: es lo mismo que devuelve con una referencia que no
        // existe): eso es una respuesta — «no la tiene» —, no un fallo. Lo que
        // sí es un fallo es un cuerpo que no es una imagen: una página del WAF.
        const cuerpo = response.data?.byteLength ?? response.data?.length ?? 0;
        if (conFallos && cuerpo > 0) {
            throw new Error(`Catastro no ha devuelto una imagen (${response.headers['content-type'] || 'sin tipo'})`);
        }
        return null;
    } catch (error) {
        console.error(`Facade Image Error for ${rc}:`, error.message);
        if (conFallos) throw error;
        return null;
    }
}

const WMS_CATASTRO = 'http://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx';

/**
 * La cartografía del Catastro de UN RECTÁNGULO concreto.
 *
 * El WMS sirve lo que se le pida en las coordenadas que se le pidan, así que
 * dándole el mismo rectángulo en el que el motor dibujó el plano, la imagen
 * encaja con él **píxel a píxel**: no hay nada que ajustar a ojo, ni un
 * desplazamiento que corregir cuando el edificio esté en otra esquina.
 *
 * `bbox` va en el orden de un WMS 1.1.1: `[oeste, sur, este, norte]`, en las
 * unidades del CRS (metros en EPSG:25830).
 *
 * REGLA — el ancho y el alto en píxeles guardan la MISMA proporción que el
 * bbox. El WMS no la corrige: estira la imagen para llenar lo que se le pide, y
 * un plano estirado es un plano que miente sobre las medidas que enseña.
 */
async function getWmsImage(bbox, { crs = 'EPSG:25830', ladoMax = 1600,
                                   formato = 'image/png',
                                   px = null } = {}) {
    const [oeste, sur, este, norte] = (bbox || []).map(Number);
    if (![oeste, sur, este, norte].every(Number.isFinite)
        || este <= oeste || norte <= sur) {
        throw new Error('El rectángulo pedido no es válido.');
    }
    const anchoM = este - oeste;
    const altoM = norte - sur;
    const k = ladoMax / Math.max(anchoM, altoM);
    // `px` fuerza un tamaño concreto. Lo usa el croquis del `.cex`, que lleva
    // pidiendo 800×600 desde siempre y está verificado contra un fichero real:
    // no se cambia de tamaño por pasar por aquí.
    const ancho = px ? px[0] : Math.max(1, Math.min(2048, Math.round(anchoM * k)));
    const alto = px ? px[1] : Math.max(1, Math.min(2048, Math.round(altoM * k)));

    const response = await catastroGet(WMS_CATASTRO, {
        params: {
            SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1',
            SRS: crs, LAYERS: 'Catastro', STYLES: '', FORMAT: formato,
            WIDTH: String(ancho), HEIGHT: String(alto),
            BBOX: `${oeste},${sur},${este},${norte}`, TRANSPARENT: 'false',
        },
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Brokergy/1.0; +https://app.brokergy.es)',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
        },
    });
    // Un WMS contesta los errores con un XML y status 200: si no es una imagen,
    // no lo es — devolverlo dejaría un cuadro roto de fondo del plano.
    const tipo = response.headers['content-type'] || '';
    if (!tipo.includes('image')) {
        throw new Error(`el WMS del Catastro no ha devuelto una imagen (${tipo})`);
    }
    return { data: Buffer.from(response.data), contentType: tipo, ancho, alto };
}

async function getParcelImage(rc, { conFallos = false } = {}) {
    try {
        const coords = await getCoordinatesByRC(rc, { conFallos });
        if (!coords) return null;
        const x = parseFloat(coords.x);
        const y = parseFloat(coords.y);
        const radio = 30;   // cuánto se aleja: menos radio, más cerca
        return await getWmsImage([x - radio, y - radio, x + radio, y + radio],
                                 { formato: 'image/jpeg', px: [800, 600] });
    } catch (error) {
        console.error(`Parcel Image Error for ${rc}:`, error.message);
        if (conFallos) throw error;
        return null;
    }
}

async function getDetails(rc) { return await getByRC(rc); }

module.exports = { getByRC, getRCByCoords, getDetails, getFacadeImage, getCoordinatesByRC, getParcelImage, getDwellingsByParcel, fachadaCompleta, extraerInmuebles, resumirParcela, miniaturaExif, getWmsImage };
