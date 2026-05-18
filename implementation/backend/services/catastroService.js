const axios = require('axios');
const http = require('http');
const https = require('https');
const xml2js = require('xml2js');

const climateService = require('./climateService');
const cache = require('./catastroCache');
const monitor = require('./catastroMonitor');

// Forzamos IPv4 en TODAS las peticiones al Catastro. Desde el VPS (Ubuntu con
// IPv6 habilitado), Node + axios usan Happy Eyeballs / preferencia IPv6 y el
// WAF del Catastro responde 400 "No se puede procesar su petición" — incluso
// aunque el host no tenga AAAA. Forzando family:4 conectamos como `curl -4`,
// que sí pasa el WAF. Sin esto, todas las llamadas al Catastro desde VPS fallan.
const httpAgent = new http.Agent({ keepAlive: true, family: 4 });
const httpsAgent = new https.Agent({ keepAlive: true, family: 4 });
const AXIOS_DEFAULTS = { httpAgent, httpsAgent };

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

// Catastro Web Services (HTTPS)
// Docs: https://www.catastro.meh.es/ws/Webservices_Libres.pdf
const BASE_URL = 'http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx';
const COORD_URL = 'http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx';

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
 * Obtener coordenadas UTM reales desde Consulta_CPMRC
 */
async function getCoordinatesByRC(rc) {
    try {
        const cleanRC = rc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const parcelRC = cleanRC.substring(0, 14);

        const url = `${COORD_URL}/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:25830&RC=${parcelRC}`;
        const response = await axios.get(url, {
            ...AXIOS_DEFAULTS,
            headers: {
                'Accept': 'application/xml, text/xml, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 8000
        });

        const result = await parseXML(response.data);
        const consulta = result.consulta_coordenadas || result.coordenadas_RC || result['Consulta_Coordenadas'];

        if (!consulta || consulta.lerr) return null;

        const coord = consulta.coordenadas?.coord || consulta.coord;
        let x = 0, y = 0;

        if (coord && coord.geo) {
            x = parseFloat(coord.geo.xcen);
            y = parseFloat(coord.geo.ycen);
        } else if (consulta.coordenadas?.coord?.geo) {
            x = parseFloat(consulta.coordenadas.coord.geo.xcen);
            y = parseFloat(consulta.coordenadas.coord.geo.ycen);
        }

        if (!x || !y) return null;

        return {
            x: Math.round(x),
            y: Math.round(y),
            srs: 'EPSG:25830',
            zone: 30
        };
    } catch (error) {
        console.error(`Catastro Coordinates Error [${rc}]:`, error.message);
        return null;
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
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RC=${cleanRC}`;

        // Datos y coordenadas en serie (el WAF del Catastro no tolera ráfagas
        // paralelas desde IPs de datacenter — devuelve 400/TCP-reset).
        const response = await axios.get(url, {
            ...AXIOS_DEFAULTS,
            headers: {
                'Accept': 'application/xml, text/xml, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 8000
        });
        await sleep(150);
        const coordinates = await getCoordinatesByRC(cleanRC);

        // Detectar rate-limit en el body de respuesta 200
        if (isRateLimitResponse(null, response.data)) {
            monitor.record403(String(response.data).substring(0, 200));
            throw new CatastroBlockedError();
        }

        const result = await parseXML(response.data);
        const consulta = result.consulta_dnp || result['consulta_dnp'];

        if (!consulta || consulta.lerr) {
            let errDesc = 'Error en Catastro';
            let errCode = 'CATASTRO_APP_ERROR';
            
            if (consulta?.lerr?.err) {
                const errs = Array.isArray(consulta.lerr.err) ? consulta.lerr.err : [consulta.lerr.err];
                const firstErr = errs[0];
                const code = getText(firstErr.cod);
                errDesc = errs.map(e => getText(e.des)).filter(Boolean).join('. ') || errDesc;
                
                // Categorizar errores comunes de Catastro
                if (['4', '7', '8'].includes(code)) {
                    errCode = 'RC_INVALID_FORMAT';
                } else if (code === '1' || errDesc.toUpperCase().includes('NO ENCONTRADA') || errDesc.toUpperCase().includes('NO SE HA ENCONTRADO')) {
                    errCode = 'RC_NOT_FOUND';
                }
            } else if (consulta?.lerr?.des) {
                errDesc = getText(consulta.lerr.des);
                if (errDesc.toUpperCase().includes('NO ENCONTRADA')) errCode = 'RC_NOT_FOUND';
            }

            const error = new Error(errDesc);
            error.code = errCode;
            console.warn(`Catastro API Error [${cleanRC}] [${errCode}]:`, errDesc);
            throw error;
        }

        const bico = consulta.bico;
        const bi = Array.isArray(bico.bi) ? bico.bi[0] : bico.bi;
        const debi = bi?.debi || {};

        // Parsear construcciones
        const lcons = bico.lcons?.cons;
        const constructions = [];
        let totalSurface = 0;
        const floorSet = new Set();
        const summaryByType = {};

        if (lcons) {
            const consList = Array.isArray(lcons) ? lcons : [lcons];
            consList.forEach((c, index) => {
                const lcd = getText(c.lcd) || 'OTRO';
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

        const primaryUse = summaryByType['VIVIENDA'] ? 'Residencial' : (getText(debi.luso) || 'No especificado');

        const propertyData = {
            rc: cleanRC,
            address: getText(bi?.ldt || bico.ldt) || 'Dirección no disponible',
            use: primaryUse,
            totalSurface: totalSurface || parseInt(debi.sfc) || 0,
            yearBuilt: parseInt(debi.ant) || 0,
            utm: coordinates || { x: 0, y: 0, zone: 30, srs: 'EPSG:25830' },
            constructions: constructions.sort((a, b) => a.floor.localeCompare(b.floor)),
            summaryByType,
            floors: {
                total: floorSet.size || 1,
                list: Array.from(floorSet).sort()
            },
            provinceCode: bi.dt?.loine?.cp || '',
            municipalityCode: bi.dt?.loine?.cm || '',

            // Enrich with Climate Data
            climateInfo: climateService.getClimateInfo(bi.dt?.loine?.cp, bi.dt?.loine?.cm),

            // CAMPOS SOLICITADOS: Participación y Tipo Catastro
            participation: (function (cpt) {
                const val = getText(cpt);
                if (!val) return '100,00';
                // Convertir coma a punto para parsear
                const num = parseFloat(val.replace(',', '.'));
                if (isNaN(num)) return val;
                // Formatear a 2 decimales y volver a poner la coma
                return num.toFixed(2).replace('.', ',');
            })(debi.cpt),
            typeCatastro: (function () {
                const explicitType = getText(bi?.idbi?.rat?.ant) || getText(debi.tip);
                if (explicitType && explicitType.length > 2) return explicitType;

                // Heuristic for Horizontal Division
                const val = getText(debi.cpt);
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
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RC=${cleanRC}`;

        const response = await axios.get(url, {
            ...AXIOS_DEFAULTS,
            headers: { 'Accept': 'application/xml, text/xml, */*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 5000
        });

        const result = await parseXML(response.data);
        const consulta = result.consulta_dnp || result['consulta_dnp'];

        if (!consulta || consulta.lerr) return rc14;

        // Case 1: Multiple dwellings (lrcdnp - list of property references)
        if (consulta.lrcdnp) {
            const rcList = Array.isArray(consulta.lrcdnp.rcdnp) ? consulta.lrcdnp.rcdnp : [consulta.lrcdnp.rcdnp];
            if (rcList.length > 0) {
                const node = rcList[0].rc;
                if (typeof node === 'string') return node;
                if (node && node.pc1 && node.pc2) {
                    return node.pc1 + node.pc2 + (node.car || '') + (node.cc1 || '') + (node.cc2 || '');
                }
                return getText(node) || rc14;
            }
        }

        // Case 2: Single property (bico - direct property data)
        if (consulta.bico) {
            const bi = Array.isArray(consulta.bico.bi) ? consulta.bico.bi[0] : consulta.bico.bi;
            if (bi && bi.idbi && bi.idbi.rc) {
                const rcNode = bi.idbi.rc;
                if (typeof rcNode === 'string') return rcNode;
                if (rcNode && rcNode.pc1 && rcNode.pc2) {
                    return rcNode.pc1 + rcNode.pc2 + (rcNode.car || '') + (rcNode.cc1 || '') + (rcNode.cc2 || '');
                }
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
        const url = `${COORD_URL}/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${targetLng}&Coordenada_Y=${targetLat}`;
        monitor.recordRequest();
        try {
            const response = await axios.get(url, {
                ...AXIOS_DEFAULTS,
                headers: { 'Accept': 'application/xml, text/xml, */*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 5000
            });
            if (isRateLimitResponse(null, response.data)) {
                monitor.record403(String(response.data).substring(0, 200));
                throw new CatastroBlockedError();
            }
            const result = await parseXML(response.data);
            const coordenadas = result.consulta_coordenadas || result['Consulta_Coordenadas'];
            if (!coordenadas || coordenadas.lerr) {
                monitor.recordSuccess();
                return null;
            }
            const coord = coordenadas.coordenadas?.coord || coordenadas.coord;
            const pc = coord?.pc || {};
            if (!pc.pc1 || !pc.pc2) {
                monitor.recordSuccess();
                return null;
            }
            monitor.recordSuccess();
            return {
                rc14: pc.pc1 + pc.pc2,
                address: getText(coord?.ldt),
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

        // 2. Si la central falla, hasta 4 puntos en SERIE (N, S, E, O ~11m).
        if (!match) {
            const step = 0.0001;
            const offsets = [
                { dlat:  step, dlng:     0, d: 1 },  // N
                { dlat: -step, dlng:     0, d: 1 },  // S
                { dlat:     0, dlng:  step, d: 1 },  // E
                { dlat:     0, dlng: -step, d: 1 }   // O
            ];
            for (const o of offsets) {
                await sleep(200);
                const r = await queryPoint(lat + o.dlat, lng + o.dlng, o.d);
                if (r) { match = r; break; }
            }
        }

        if (!match) {
            cache.set(cacheKey, null, cache.TTL_COORDS);
            return null;
        }

        await sleep(150);
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

function isLikelyNonResidentialFloor(floor) {
    if (!floor) return false;
    const f = floor.toString().trim().toUpperCase();
    if (/^-\d+$/.test(f)) return true;
    if (['SS', 'SO', 'ST'].includes(f)) return true;
    return false;
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
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RC=${cleanRC}`;

        monitor.recordRequest();
        const response = await axios.get(url, {
            ...AXIOS_DEFAULTS,
            headers: { 'Accept': 'application/xml, text/xml, */*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 8000
        });

        if (isRateLimitResponse(null, response.data)) {
            monitor.record403(String(response.data).substring(0, 200));
            throw new CatastroBlockedError();
        }

        const result = await parseXML(response.data);
        const consulta = result.consulta_dnp || result['consulta_dnp'];
        if (!consulta || consulta.lerr) {
            monitor.recordSuccess();
            return [];
        }

        monitor.recordSuccess();

        const extractBasic = (item) => {
            const rcNode = item.rc || item.idbi?.rc;
            let fullRc = '';
            if (typeof rcNode === 'string') fullRc = rcNode;
            else if (rcNode && rcNode.pc1 && rcNode.pc2) {
                fullRc = rcNode.pc1 + rcNode.pc2 + (rcNode.car || '') + (rcNode.cc1 || '') + (rcNode.cc2 || '');
            }
            const dt = item.dt || {};
            const lourb = dt.locs?.lous?.lourb || dt.lourb || {};
            const loint = lourb.loint || {};
            const block = getText(loint.es) || '';
            const floor = getText(loint.pt) || '';
            const door = getText(loint.pu) || '';
            const debi = item.debi || {};
            const use = getText(debi.luso) || '';
            const surface = parseInt(getText(debi.sfc)) || 0;
            const address = getText(item.ldt) || buildAddressFromDt(dt);
            return { rc: fullRc, address, block, floor, door, use, surface };
        };

        let dwellings = [];
        if (consulta.lrcdnp) {
            const rcList = Array.isArray(consulta.lrcdnp.rcdnp) ? consulta.lrcdnp.rcdnp : [consulta.lrcdnp.rcdnp];
            dwellings = rcList.map(extractBasic).filter(d => d.rc);
        } else if (consulta.bico) {
            const bi = Array.isArray(consulta.bico.bi) ? consulta.bico.bi[0] : consulta.bico.bi;
            if (bi) {
                const d = extractBasic(bi);
                if (d.rc) dwellings.push(d);
            }
        }

        return dwellings.map(d => {
            const u = (d.use || '').toUpperCase();
            let isResidential;
            if (u) {
                isResidential = /RESIDENCIAL|VIVIENDA/.test(u);
            } else if (isLikelyNonResidentialFloor(d.floor)) {
                isResidential = false;
            } else {
                isResidential = true;
            }
            return { ...d, isResidential };
        });
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

async function getFacadeImage(rc) {
    const cleanRC = rc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const imageUrl = `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc/RecuperarFotoFachadaGet?ReferenciaCatastral=${cleanRC}`;
    try {
        const response = await axios.get(imageUrl, {
            ...AXIOS_DEFAULTS,
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
        });
        if (response.headers['content-type']?.includes('image')) {
            return { data: response.data, contentType: response.headers['content-type'] };
        }
        return null;
    } catch (error) {
        console.error(`Facade Image Error for ${rc}:`, error.message);
        return null;
    }
}

async function getParcelImage(rc) {
    try {
        const coords = await getCoordinatesByRC(rc);
        if (!coords) return null;
        const x = parseFloat(coords.x);
        const y = parseFloat(coords.y);
        const radius = 30; // Zoom level (smaller radius = closer)
        const bbox = `${x - radius},${y - radius},${x + radius},${y + radius}`;

        // Use HTTPS if possible, or handle mixed content in backend (which we do)
        const wmsUrl = 'http://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx';
        const params = { SERVICE: 'WMS', REQUEST: 'GetMap', SRS: 'EPSG:25830', LAYERS: 'Catastro', STYLES: '', FORMAT: 'image/jpeg', WIDTH: '800', HEIGHT: '600', BBOX: bbox, TRANSPARENT: 'false', VERSION: '1.1.1' };

        const response = await axios.get(wmsUrl, {
            ...AXIOS_DEFAULTS,
            params,
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        return { data: response.data, contentType: response.headers['content-type'] };
    } catch (error) {
        console.error(`Parcel Image Error for ${rc}:`, error.message);
        return null;
    }
}

async function getDetails(rc) { return await getByRC(rc); }

module.exports = { getByRC, getRCByCoords, getDetails, getFacadeImage, getCoordinatesByRC, getParcelImage, getDwellingsByParcel };
