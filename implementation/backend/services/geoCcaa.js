// ============================================================
// geoCcaa.js — Resolución canónica de CCAA y año de actuación
//
// Por qué existe: la CCAA en texto está SUCIA en la BD
// ("CASTILLA LA MANCHA" vs "Castilla - La Mancha" vs null). Para agrupar
// expedientes en lotes por CCAA hace falta una clave estable. La anclamos
// al CÓDIGO de provincia INE (2 dígitos), que sí es fiable, y mapeamos
// código → CCAA canónica.
//
// Regla de negocio (lotes): la CCAA es la de la INSTALACIÓN, no la del
// cliente. Solo cuando la instalación tiene dirección propia
// (instalacion.misma_direccion === false) usamos sus datos; si coincide
// con el domicilio del cliente (caso normal) usamos el código de provincia
// del funnel de la oportunidad (el dato más fiable) y, en su defecto, el
// texto de provincia del cliente.
// ============================================================

// Fuente única de verdad: mismas tablas que routes/geo.js (no duplicar nombres).
const CCAA_PROVINCIAS = {
    'Andalucía':            ['04', '11', '14', '18', '21', '23', '29', '41'],
    'Aragón':               ['22', '44', '50'],
    'Asturias':             ['33'],
    'Islas Baleares':       ['07'],
    'Canarias':             ['35', '38'],
    'Cantabria':            ['39'],
    'Castilla-La Mancha':   ['02', '13', '16', '19', '45'],
    'Castilla y León':      ['05', '09', '24', '34', '37', '40', '42', '47', '49'],
    'Cataluña':             ['08', '17', '25', '43'],
    'Ceuta':                ['51'],
    'Comunidad Valenciana': ['03', '12', '46'],
    'Extremadura':          ['06', '10'],
    'Galicia':              ['15', '27', '32', '36'],
    'La Rioja':             ['26'],
    'Comunidad de Madrid':  ['28'],
    'Melilla':              ['52'],
    'Región de Murcia':     ['30'],
    'Navarra':              ['31'],
    'País Vasco':           ['01', '20', '48'],
};

const PROVINCIA_NOMBRES = {
    '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería',
    '05': 'Ávila', '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona',
    '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
    '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca',
    '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa',
    '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
    '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid',
    '29': 'Málaga', '30': 'Murcia', '31': 'Navarra', '32': 'Ourense',
    '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
    '37': 'Salamanca', '38': 'S.C. de Tenerife', '39': 'Cantabria', '40': 'Segovia',
    '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel',
    '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya',
    '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

// Alias frecuentes de nombres de provincia que no coinciden 1:1 con la tabla.
const PROVINCIA_ALIAS = {
    'araba': '01', 'alava': '01',
    'gipuzkoa': '20', 'guipuzcoa': '20',
    'bizkaia': '48', 'vizcaya': '48',
    'la coruna': '15', 'coruna': '15', 'a coruna': '15',
    'illes balears': '07', 'islas baleares': '07', 'baleares': '07',
    'las palmas de gran canaria': '35',
    'santa cruz de tenerife': '38', 'tenerife': '38',
    'gerona': '17', 'lerida': '25', 'orense': '32',
};

// Inverso: código de provincia → CCAA canónica
const COD_A_CCAA = {};
for (const [ccaa, cods] of Object.entries(CCAA_PROVINCIAS)) {
    for (const c of cods) COD_A_CCAA[c] = ccaa;
}

// Inverso normalizado: nombre de provincia → código
const NOMBRE_A_COD = {};
for (const [cod, nombre] of Object.entries(PROVINCIA_NOMBRES)) {
    NOMBRE_A_COD[norm(nombre)] = cod;
}
for (const [alias, cod] of Object.entries(PROVINCIA_ALIAS)) {
    NOMBRE_A_COD[norm(alias)] = cod;
}

// Normaliza texto: minúsculas, sin tildes, sin signos, espacios colapsados.
function norm(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function pad2(v) {
    const s = String(v == null ? '' : v).trim();
    return s ? s.padStart(2, '0') : null;
}

// Nombre de provincia (texto sucio) → código INE, o null.
function provinciaNombreACod(nombre) {
    const n = norm(nombre);
    if (!n) return null;
    if (NOMBRE_A_COD[n]) return NOMBRE_A_COD[n];
    // Coincidencia laxa: el texto empieza por un nombre conocido (p.ej. "toledo (45)")
    for (const [key, cod] of Object.entries(NOMBRE_A_COD)) {
        if (n === key || n.startsWith(key + ' ')) return cod;
    }
    return null;
}

// Código de provincia de la INSTALACIÓN del expediente.
// exp.instalacion, cliente (fila clientes), op (fila oportunidades).
function resolveProvinciaCodInstalacion(exp, cliente, op) {
    const inst = (exp && exp.instalacion) || {};

    // 1. Instalación con dirección propia → su provincia manda.
    if (inst.misma_direccion === false) {
        const cod = pad2(inst.provincia_cod) || provinciaNombreACod(inst.provincia);
        if (cod) return cod;
        // sin datos de instalación: caemos al cliente como mejor esfuerzo
    }

    // 2. Instalación = domicilio del cliente → código del funnel (más fiable).
    const opCod = pad2(op && op.datos_calculo && op.datos_calculo.inputs && op.datos_calculo.inputs.provincia);
    if (opCod) return opCod;

    // 3. Fallback: texto de provincia del cliente.
    if (cliente && cliente.provincia) return provinciaNombreACod(cliente.provincia);

    return null;
}

// CCAA canónica de la instalación, o null si no se puede determinar.
function resolveCcaaInstalacion(exp, cliente, op) {
    const cod = resolveProvinciaCodInstalacion(exp, cliente, op);
    return cod ? (COD_A_CCAA[cod] || null) : null;
}

// Año de actuación = año de documentacion.fecha_fin_cifo (espejo de getCifoYear
// del frontend). Soporta ISO (yyyy-mm-dd) y dd/mm/yyyy. null si no hay CIFO.
function resolveAnioActuacion(exp) {
    const fin = exp && exp.documentacion && exp.documentacion.fecha_fin_cifo;
    if (!fin) return null;
    const s = String(fin).trim();
    let m = s.match(/^(\d{4})-\d{2}-\d{2}/);          // ISO
    if (m) return parseInt(m[1], 10);
    m = s.match(/^\d{1,2}[/-]\d{1,2}[/-](\d{4})/);    // dd/mm/yyyy
    if (m) return parseInt(m[1], 10);
    const y = new Date(s).getFullYear();
    return Number.isNaN(y) ? null : y;
}

module.exports = {
    COD_A_CCAA,
    norm,
    provinciaNombreACod,
    resolveProvinciaCodInstalacion,
    resolveCcaaInstalacion,
    resolveAnioActuacion,
};
