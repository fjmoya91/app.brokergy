// ─── direccionCatastral.js ───────────────────────────────────────────────────
// Traducir una dirección del Catastro a campos.
//
// El Catastro devuelve la dirección como UNA cadena
// ("AV BARBER (DE) 26 45005 TOLEDO (TOLEDO)") y la app la necesita partida en
// calle / CP / municipio / provincia / CCAA. Vivía dentro de ClienteDetailModal;
// se saca aquí en cuanto lo necesitó la segunda pantalla (los CEE directos),
// porque de lo contrario habría dos parsers y direcciones que se rellenan
// distinto según por dónde entres.

export function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export const PROV_CCAA = {
    '04':'ANDALUCÍA','11':'ANDALUCÍA','14':'ANDALUCÍA','18':'ANDALUCÍA',
    '21':'ANDALUCÍA','23':'ANDALUCÍA','29':'ANDALUCÍA','41':'ANDALUCÍA',
    '22':'ARAGÓN','44':'ARAGÓN','50':'ARAGÓN',
    '33':'ASTURIAS','07':'ISLAS BALEARES','35':'CANARIAS','38':'CANARIAS',
    '39':'CANTABRIA','02':'CASTILLA-LA MANCHA','13':'CASTILLA-LA MANCHA',
    '16':'CASTILLA-LA MANCHA','19':'CASTILLA-LA MANCHA','45':'CASTILLA-LA MANCHA',
    '05':'CASTILLA Y LEÓN','09':'CASTILLA Y LEÓN','24':'CASTILLA Y LEÓN',
    '34':'CASTILLA Y LEÓN','37':'CASTILLA Y LEÓN','40':'CASTILLA Y LEÓN',
    '42':'CASTILLA Y LEÓN','47':'CASTILLA Y LEÓN','49':'CASTILLA Y LEÓN',
    '08':'CATALUÑA','17':'CATALUÑA','25':'CATALUÑA','43':'CATALUÑA',
    '51':'CEUTA','03':'COMUNIDAD VALENCIANA','12':'COMUNIDAD VALENCIANA','46':'COMUNIDAD VALENCIANA',
    '06':'EXTREMADURA','10':'EXTREMADURA','15':'GALICIA','27':'GALICIA','32':'GALICIA','36':'GALICIA',
    '26':'LA RIOJA','28':'COMUNIDAD DE MADRID','52':'MELILLA','30':'REGIÓN DE MURCIA',
    '31':'NAVARRA','01':'PAÍS VASCO','20':'PAÍS VASCO','48':'PAÍS VASCO',
};

export const PROV_NOMBRE = {
    '01':'ÁLAVA','02':'ALBACETE','03':'ALICANTE','04':'ALMERÍA','05':'ÁVILA',
    '06':'BADAJOZ','07':'BALEARES','08':'BARCELONA','09':'BURGOS','10':'CÁCERES',
    '11':'CÁDIZ','12':'CASTELLÓN','13':'CIUDAD REAL','14':'CÓRDOBA','15':'A CORUÑA',
    '16':'CUENCA','17':'GIRONA','18':'GRANADA','19':'GUADALAJARA','20':'GUIPÚZCOA',
    '21':'HUELVA','22':'HUESCA','23':'JAÉN','24':'LEÓN','25':'LLEIDA',
    '26':'LA RIOJA','27':'LUGO','28':'MADRID','29':'MÁLAGA','30':'MURCIA',
    '31':'NAVARRA','32':'OURENSE','33':'ASTURIAS','34':'PALENCIA','35':'LAS PALMAS',
    '36':'PONTEVEDRA','37':'SALAMANCA','38':'S.C. DE TENERIFE','39':'CANTABRIA',
    '40':'SEGOVIA','41':'SEVILLA','42':'SORIA','43':'TARRAGONA','44':'TERUEL',
    '45':'TOLEDO','46':'VALENCIA','47':'VALLADOLID','48':'VIZCAYA','49':'ZAMORA',
    '50':'ZARAGOZA','51':'CEUTA','52':'MELILLA',
};

export const CCAA_LIST = Object.values(PROV_CCAA).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a.localeCompare(b, 'es'));

// Obtener código de provincia a partir del nombre
export function getProvCodByNombre(nombre) {
    if (!nombre) return '';
    const norm = normalize(nombre);
    return Object.entries(PROV_NOMBRE).find(([, n]) => normalize(n) === norm)?.[0] || '';
}

// Provincias ordenadas por longitud desc para matchear las largas primero
const PROV_NOMBRE_SORTED = Object.entries(PROV_NOMBRE).sort((a, b) => b[1].length - a[1].length);

/**
 * Parsea una dirección catastral tipo "CL EDUARDO NUÑEZ 5 13300 VALDEPEÑAS (CIUDAD REAL)"
 * en sus partes estructuradas: calle, CP, municipio, provincia, CCAA.
 * Devuelve null si no encuentra un CP (no se puede inferir nada fiable).
 */
export function parseCatastroAddressFull(address) {
    if (!address) return null;
    const str = String(address).trim().replace(/[()]/g, ' ').replace(/\s+/g, ' ');
    const cpMatch = str.match(/\b(\d{5})\b/);
    if (!cpMatch) return null;

    const cp = cpMatch[0];
    const cpIdx = str.indexOf(cp);
    const calle = str.substring(0, cpIdx).trim();
    let municipioRaw = str.substring(cpIdx + 5).trim();

    let provCode = '';
    let provNombre = '';
    let ccaa = '';

    for (const [cod, nombre] of PROV_NOMBRE_SORTED) {
        if (normalize(municipioRaw).endsWith(normalize(nombre))) {
            provCode = cod;
            provNombre = nombre;
            ccaa = PROV_CCAA[cod] || '';
            const provWords = nombre.split(' ');
            const muniWords = municipioRaw.split(' ');
            if (muniWords.length > provWords.length) {
                municipioRaw = muniWords.slice(0, -provWords.length).join(' ');
            }
            break;
        }
    }

    // Fallback: derivar provincia del CP
    if (!provNombre && cp.length >= 2) {
        const cpProvCode = cp.substring(0, 2);
        if (PROV_NOMBRE[cpProvCode]) {
            provCode = cpProvCode;
            provNombre = PROV_NOMBRE[cpProvCode];
            ccaa = PROV_CCAA[cpProvCode] || '';
        }
    }

    return {
        direccion: calle,
        codigo_postal: cp,
        municipioHint: municipioRaw.trim(),
        provincia: provNombre,
        provincia_cod: provCode,
        ccaa,
    };
}
