const axios = require('axios');
const xml2js = require('xml2js');

const climateService = require('./climateService');

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
 */
async function getByRC(rc) {
    const cleanRC = rc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    try {
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RC=${cleanRC}`;

        // PARALELIZACIÓN: Lanzamos la petición de datos y la de coordenadas a la vez
        const [response, coordinates] = await Promise.all([
            axios.get(url, {
                headers: {
                    'Accept': 'application/xml, text/xml, */*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 8000
            }),
            getCoordinatesByRC(cleanRC)
        ]);

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

        return {
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

    } catch (error) {
        if (error.code && error.code.startsWith('RC_')) throw error;
        if (error.code && error.code.startsWith('CATASTRO_')) throw error;

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

async function getRCByCoords(lat, lng, options = {}) {
    // Búsqueda escalonada por anillos en lugar de "todos los puntos en paralelo".
    // Razón: 25 peticiones simultáneas al Catastro desde una IP de datacenter
    // dispara rate-limiting (403). Probando anillos secuenciales:
    //   1. Solo centro     → 1 petición
    //   2. Si falla, anillo medio → 8 peticiones
    //   3. Si falla, anillo externo (solo GPS) → 16 peticiones
    // El caso ideal (chincheta sobre edificio) resuelve con UNA sola llamada.
    const source = typeof options === 'string' ? options : (options.source || 'maps');
    const isGps = source === 'gps';
    const step = isGps ? 0.00015 : 0.0001; // ~16m vs ~11m

    const queryPoint = async (targetLat, targetLng, distanceScore) => {
        const url = `${COORD_URL}/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${targetLng}&Coordenada_Y=${targetLat}`;
        try {
            const response = await axios.get(url, {
                headers: { 'Accept': 'application/xml, text/xml, */*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 5000
            });
            const result = await parseXML(response.data);
            const coordenadas = result.consulta_coordenadas || result['Consulta_Coordenadas'];
            if (coordenadas && !coordenadas.lerr) {
                const coord = coordenadas.coordenadas?.coord || coordenadas.coord;
                const pc = coord?.pc || {};
                if (pc.pc1 && pc.pc2) {
                    return {
                        rc14: pc.pc1 + pc.pc2,
                        address: getText(coord?.ldt),
                        location: { lat: targetLat, lng: targetLng },
                        distanceScore
                    };
                }
            }
        } catch {
            // Errores individuales se ignoran (timeout, 403, etc.)
        }
        return null;
    };

    // Genera offsets de un anillo concreto (radio = N): los puntos que están
    // EXACTAMENTE a distancia N del centro (norma Chebyshev). El centro es
    // anillo 0 (1 punto), anillo 1 son los 8 adyacentes, anillo 2 son 16, etc.
    const ringOffsets = (radius) => {
        if (radius === 0) return [{ lat: 0, lng: 0 }];
        const offsets = [];
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) {
                    offsets.push({ lat: dy * step, lng: dx * step });
                }
            }
        }
        return offsets;
    };

    const maxRadius = isGps ? 2 : 1; // GPS busca en anillo 0,1,2 (max 25). Maps en 0,1 (max 9).
    let bestCandidate = null;

    for (let r = 0; r <= maxRadius; r++) {
        const offsets = ringOffsets(r);
        const results = await Promise.all(offsets.map(o =>
            queryPoint(lat + o.lat, lng + o.lng, Math.abs(o.lat) + Math.abs(o.lng))
        ));
        const valid = results.filter(Boolean);
        if (valid.length > 0) {
            // El más cercano al centro de este anillo
            bestCandidate = valid.sort((a, b) => a.distanceScore - b.distanceScore)[0];
            break;
        }
    }

    if (!bestCandidate) return null;
    const fullRC = await getFullRC(bestCandidate.rc14);
    return {
        rc: fullRC,
        address: bestCandidate.address,
        location: bestCandidate.location,
        distance: bestCandidate.distanceScore === 0 ? 0 : 'approx_10m'
    };
}

/**
 * Construye la dirección de un inmueble a partir del nodo `dt` del XML resumido.
 * El XML resumido (lrcdnp.rcdnp) no incluye `ldt`, solo la estructura jerárquica.
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
 * Heurística rápida: las plantas negativas o sótanos NO son residenciales.
 * Permite descartar trasteros/garajes sin necesidad de hacer un fetch adicional.
 */
function isLikelyNonResidentialFloor(floor) {
    if (!floor) return false;
    const f = floor.toString().trim().toUpperCase();
    if (/^-\d+$/.test(f)) return true;          // -1, -2, -3…
    if (['SS', 'SO', 'ST'].includes(f)) return true; // sótanos
    return false;
}

/**
 * Llama a Consulta_DNPRC con la RC COMPLETA (20 chars) para obtener uso + superficie.
 * Devuelve { use, surface, block, floor, door } o null si falla.
 */
async function fetchInmuebleDetail(rcFull) {
    try {
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RC=${rcFull}`;
        const r = await axios.get(url, {
            headers: { 'Accept': 'application/xml, text/xml, */*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 7000
        });
        const parsed = await parseXML(r.data);
        const c = parsed.consulta_dnp || parsed['consulta_dnp'];
        if (!c || c.lerr) return null;

        const bi = c.bico && (Array.isArray(c.bico.bi) ? c.bico.bi[0] : c.bico.bi);
        if (!bi) return null;

        const debi = bi.debi || {};
        const use = getText(debi.luso) || '';
        const surface = parseInt(getText(debi.sfc)) || 0;

        // En la respuesta detallada el path es bi.dt.lourb.loint (sin locs.lous)
        const dt = bi.dt || {};
        const lourb = dt.locs?.lous?.lourb || dt.lourb || {};
        const loint = lourb.loint || {};
        const block = getText(loint.es) || '';
        const floor = getText(loint.pt) || '';
        const door = getText(loint.pu) || '';

        return { use, surface, block, floor, door };
    } catch (e) {
        return null;
    }
}

/**
 * Lista de inmuebles (viviendas, locales, trasteros…) de una parcela con división horizontal.
 *
 * Una sola llamada con la RC parcelaria (14 chars). Heurística por planta para detectar
 * residenciales (rápido, no bloqueante). El detalle de superficie/uso real de cada inmueble
 * se carga bajo demanda cuando el usuario lo selecciona (vía /property-data).
 */
async function getDwellingsByParcel(rc14) {
    try {
        const cleanRC = rc14.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 14);
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RC=${cleanRC}`;

        const response = await axios.get(url, {
            headers: { 'Accept': 'application/xml, text/xml, */*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 8000
        });

        const result = await parseXML(response.data);
        const consulta = result.consulta_dnp || result['consulta_dnp'];
        if (!consulta || consulta.lerr) return [];

        const extractBasic = (item) => {
            const rcNode = item.rc || item.idbi?.rc;
            let fullRc = '';
            if (typeof rcNode === 'string') fullRc = rcNode;
            else if (rcNode && rcNode.pc1 && rcNode.pc2) {
                fullRc = rcNode.pc1 + rcNode.pc2 + (rcNode.car || '') + (rcNode.cc1 || '') + (rcNode.cc2 || '');
            }

            // El XML resumido usa dt.locs.lous.lourb; el detallado usa dt.lourb directo.
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

        console.log(`[Catastro] Parcela ${cleanRC}: ${dwellings.length} inmuebles detectados`);

        // Marcar isResidential por heurística (sin enrichment bloqueante):
        //  - Uso explícito presente → matchea por texto.
        //  - Planta negativa o sótano → false (garaje/trastero casi seguro).
        //  - Resto → true (asumir vivienda; el usuario reconoce su planta+puerta).
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
        console.error(`Dwellings Error [${rc14}]:`, error.message);
        return [];
    }
}

async function getFacadeImage(rc) {
    const cleanRC = rc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const imageUrl = `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc/RecuperarFotoFachadaGet?ReferenciaCatastral=${cleanRC}`;
    try {
        const response = await axios.get(imageUrl, {
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
