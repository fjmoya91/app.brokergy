// ============================================================================
// expedienteTaxonomia.js — Cómo se CLASIFICA un expediente (ficha, año, CCAA).
//
// FUENTE ÚNICA de los criterios de agrupación. Vivían dentro de ExpedientesView;
// se extraen aquí porque el Cuadro de Mando agrega por los mismos ejes y si cada
// vista se define su propio criterio los totales dejan de cuadrar entre pantallas.
// ============================================================================

// Provincia INE (2 díg.) → CCAA. Espejo del backend (geoCcaa.js).
export const CCAA_MAP = {
    '01': 'País Vasco', '02': 'Castilla-La Mancha', '03': 'Comunidad Valenciana', '04': 'Andalucía',
    '05': 'Castilla y León', '06': 'Extremadura', '07': 'Islas Baleares', '08': 'Cataluña',
    '09': 'Castilla y León', '10': 'Extremadura', '11': 'Andalucía', '12': 'Comunidad Valenciana',
    '13': 'Castilla-La Mancha', '14': 'Andalucía', '15': 'Galicia', '16': 'Castilla-La Mancha',
    '17': 'Cataluña', '18': 'Andalucía', '19': 'Castilla-La Mancha', '20': 'País Vasco',
    '21': 'Andalucía', '22': 'Aragón', '23': 'Andalucía', '24': 'Castilla y León',
    '25': 'Cataluña', '26': 'La Rioja', '27': 'Galicia', '28': 'Madrid',
    '29': 'Andalucía', '30': 'Murcia', '31': 'Navarra', '32': 'Galicia',
    '33': 'Asturias', '34': 'Castilla y León', '35': 'Canarias', '36': 'Galicia',
    '37': 'Castilla y León', '38': 'Canarias', '39': 'Cantabria', '40': 'Castilla y León',
    '41': 'Andalucía', '42': 'Castilla y León', '43': 'Cataluña', '44': 'Aragón',
    '45': 'Castilla-La Mancha', '46': 'Comunidad Valenciana', '47': 'Castilla y León',
    '48': 'País Vasco', '49': 'Castilla y León', '50': 'Aragón', '51': 'Ceuta', '52': 'Melilla'
};

// Código de provincia INE a 2 dígitos ('9' → '09'), o null.
export const pad2 = (v) => { const s = String(v ?? '').trim(); return s ? s.padStart(2, '0') : null; };

export const getFicha = (exp) => {
    if (exp.numero_expediente?.includes('RES080')) return 'RES080';
    if (exp.numero_expediente?.includes('RES093')) return 'RES093';
    return 'RES060';
};

// Año de la ACTUACIÓN según la fecha de fin de obra del CIFO. Es el criterio con
// el que se agrupan los lotes, por eso no se sustituye por created_at.
export const getCifoYear = (exp) => {
    const fin = exp.fecha_fin_cifo;
    if (!fin) return null;
    const y = new Date(fin).getFullYear();
    return isNaN(y) ? null : y;
};

// CCAA de la ACTUACIÓN (instalación), NO la del cliente. Mismo criterio que el
// backend (geoCcaa.resolveCcaaInstalacion): así el filtro, la selección de lote y
// la validación del servidor coinciden. El cliente solo es último recurso.
export const getCCAA = (exp) => {
    const inst = exp.instalacion || {};
    // 1. Instalación con dirección propia → su provincia manda.
    if (inst.misma_direccion === false) {
        const cod = pad2(inst.provincia_cod);
        if (cod && CCAA_MAP[cod]) return CCAA_MAP[cod];
    }
    // 2. Código de provincia del funnel de la oportunidad (el dato más fiable).
    const opCod = pad2(exp.oportunidades?.datos_calculo?.inputs?.provincia);
    if (opCod && CCAA_MAP[opCod]) return CCAA_MAP[opCod];
    // 3. Fallbacks al cliente: CCAA guardada o provincia textual.
    if (exp.clientes?.ccaa) return exp.clientes.ccaa;
    if (exp.clientes?.provincia) return exp.clientes.provincia;
    return '—';
};

// ─── Normalización de CCAA para AGRUPAR ──────────────────────────────────────
// getCCAA devuelve la etiqueta bonita del CCAA_MAP cuando hay código de provincia,
// pero cae al campo del cliente cuando no lo hay — y ahí normalizeData guarda el
// texto en MAYÚSCULAS. Resultado: 'Madrid' y 'MADRID' conviven, y cualquier suma
// por comunidad se parte en dos grupos.
//
// Se usa SOLO para agrupar/filtrar (p.ej. el cuadro de mando). A propósito NO se
// aplica dentro de getCCAA: ese valor alimenta la creación de lotes, que el
// backend valida con su propio criterio, y cambiarlo podría desalinearlos.
const CLAVE_CCAA = (s) => (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/^(comunidadforalde|comunidadautonomade|comunidadde|principadode|regionde|islas|comunidad)/, '')
    .replace(/y/g, '');

const INDICE_CCAA = Object.values(CCAA_MAP).reduce((acc, canonica) => {
    acc[CLAVE_CCAA(canonica)] = canonica;
    return acc;
}, {});

export const normalizeCcaa = (valor) => {
    if (!valor || valor === '—') return '—';
    return INDICE_CCAA[CLAVE_CCAA(valor)] || valor;
};

// Año para PREVISIÓN de facturación. Difiere de getCifoYear a propósito: aquí no
// se puede descartar un expediente por no tener aún fecha de CIFO (justo los que
// están en curso son los que interesa prever), así que se cae al año del número
// de expediente ('26RES060_118' → 2026), que se asigna al crearlo.
export const getAnioPrevision = (exp) => {
    const cifo = getCifoYear(exp);
    if (cifo) return cifo;
    const m = /^(\d{2})RES/.exec(exp.numero_expediente || '');
    if (m) return 2000 + parseInt(m[1], 10);
    const created = exp.created_at ? new Date(exp.created_at).getFullYear() : null;
    return created && !isNaN(created) ? created : null;
};
