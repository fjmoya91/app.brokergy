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
                'User-Agent': 'CatastroIntegration/1.0'
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
                    'User-Agent': 'CatastroIntegration/1.0'
                },
                timeout: 8000
            }),
            getCoordinatesByRC(cleanRC)
        ]);

        const result = await parseXML(response.data);
        const consulta = result.consulta_dnp || result['consulta_dnp'];

        if (!consulta || consulta.lerr) {
            let errDesc = 'Error en Catastro';
            if (consulta?.lerr?.err) {
                const errs = Array.isArray(consulta.lerr.err) ? consulta.lerr.err : [consulta.lerr.err];
                // Use getText to be safe with xml2js output
                errDesc = errs.map(e => getText(e.des)).filter(Boolean).join('. ') || errDesc;
            } else if (consulta?.lerr?.des) {
                errDesc = getText(consulta.lerr.des);
            }
            console.warn(`Catastro API Error [${cleanRC}]:`, errDesc);
            throw new Error(errDesc);
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
            headers: { 'Accept': 'application/xml, text/xml, */*', 'User-Agent': 'CatastroIntegration/1.0' },
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
    // Search pattern: Center + 8 surrounding points (3x3 grid)
    // 0.0001 deg ~ 11 meters
    const step = 0.0001;
    const offsets = [
        { lat: 0, lng: 0 },         // Center
        { lat: step, lng: 0 },      // N
        { lat: -step, lng: 0 },     // S
        { lat: 0, lng: step },      // E
        { lat: 0, lng: -step },     // W
        { lat: step, lng: step },   // NE
        { lat: step, lng: -step },  // NW
        { lat: -step, lng: step },  // SE
        { lat: -step, lng: -step }  // SW
    ];

    const candidates = [];

    const requests = offsets.map(offset => {
        const targetLat = lat + offset.lat;
        const targetLng = lng + offset.lng;
        const url = `${COORD_URL}/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${targetLng}&Coordenada_Y=${targetLat}`;

        return axios.get(url, {
            headers: { 'Accept': 'application/xml, text/xml, */*', 'User-Agent': 'CatastroIntegration/1.0' },
            timeout: 5000
        })
            .then(response => parseXML(response.data))
            .then(result => {
                const coordenadas = result.consulta_coordenadas || result['Consulta_Coordenadas'];
                if (coordenadas && !coordenadas.lerr) {
                    const coord = coordenadas.coordenadas?.coord || coordenadas.coord;
                    const pc = coord?.pc || {};

                    if (pc.pc1 && pc.pc2) {
                        const rc14 = pc.pc1 + pc.pc2;
                        const address = getText(coord?.ldt);
                        return {
                            rc14,
                            address,
                            location: { lat: targetLat, lng: targetLng },
                            distanceScore: Math.abs(offset.lat) + Math.abs(offset.lng) // Lower is closer to center
                        };
                    }
                }
                return null;
            })
            .catch(() => null); // Ignore errors for individual requests
    });

    const results = await Promise.all(requests);

    // Filter valid results and deduplicate
    const uniqueCandidates = new Map();
    results.forEach(res => {
        if (res && !uniqueCandidates.has(res.rc14)) {
            uniqueCandidates.set(res.rc14, res);
        }
    });

    if (uniqueCandidates.size === 0) return null;

    // Convert map to array and sort by distance score (closest to center first)
    const sortedCandidates = Array.from(uniqueCandidates.values())
        .sort((a, b) => a.distanceScore - b.distanceScore);

    // Pick the best candidate (closest to center)
    const bestCandidate = sortedCandidates[0];

    // Retrieve full RC for the chosen candidate
    const fullRC = await getFullRC(bestCandidate.rc14);

    return {
        rc: fullRC,
        address: bestCandidate.address,
        location: bestCandidate.location,
        distance: bestCandidate.distanceScore === 0 ? 0 : 'approx_10m'
    };
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

module.exports = { getByRC, getRCByCoords, getDetails, getFacadeImage, getCoordinatesByRC, getParcelImage };
