/**
 * Provincias en las que la landing pública acepta nuevos LEADs.
 *
 * Fuente: códigos INE oficiales de provincia (2 dígitos).
 * Actualización 2026-05-15 — Castilla-La Mancha + Madrid + Comunidad
 * Valenciana + Andalucía.
 *
 * Si BROKERGY expande operación, basta con añadir entradas aquí. El gate
 * geográfico (geoGate middleware) leerá la nueva lista al siguiente request.
 */

const ALLOWED_PROVINCES = {
    // Andalucía
    '04': { provincia: 'Almería',     ccaa: 'Andalucía' },
    '11': { provincia: 'Cádiz',       ccaa: 'Andalucía' },
    '14': { provincia: 'Córdoba',     ccaa: 'Andalucía' },
    '18': { provincia: 'Granada',     ccaa: 'Andalucía' },
    '21': { provincia: 'Huelva',      ccaa: 'Andalucía' },
    '23': { provincia: 'Jaén',        ccaa: 'Andalucía' },
    '29': { provincia: 'Málaga',      ccaa: 'Andalucía' },
    '41': { provincia: 'Sevilla',     ccaa: 'Andalucía' },

    // Castilla-La Mancha
    '02': { provincia: 'Albacete',    ccaa: 'Castilla-La Mancha' },
    '13': { provincia: 'Ciudad Real', ccaa: 'Castilla-La Mancha' },
    '16': { provincia: 'Cuenca',      ccaa: 'Castilla-La Mancha' },
    '19': { provincia: 'Guadalajara', ccaa: 'Castilla-La Mancha' },
    '45': { provincia: 'Toledo',      ccaa: 'Castilla-La Mancha' },

    // Comunidad de Madrid
    '28': { provincia: 'Madrid',      ccaa: 'Comunidad de Madrid' },

    // Comunidad Valenciana
    '03': { provincia: 'Alicante',    ccaa: 'Comunidad Valenciana' },
    '12': { provincia: 'Castellón',   ccaa: 'Comunidad Valenciana' },
    '46': { provincia: 'Valencia',    ccaa: 'Comunidad Valenciana' }
};

/**
 * Normaliza el código de provincia a 2 dígitos string ('1' → '01').
 * Tolera undefined/null/número/string con espacios.
 */
function normalizeProvinceCode(code) {
    if (code === null || code === undefined) return null;
    const s = String(code).trim();
    if (!s) return null;
    return s.padStart(2, '0').slice(0, 2);
}

/**
 * Función pura: ¿esta provincia (código INE) está permitida?
 */
function isAllowedProvince(code) {
    const normalized = normalizeProvinceCode(code);
    return normalized !== null && Object.prototype.hasOwnProperty.call(ALLOWED_PROVINCES, normalized);
}

/**
 * Devuelve { provincia, ccaa } si la provincia es válida, null si no.
 */
function getProvinceInfo(code) {
    const normalized = normalizeProvinceCode(code);
    if (!normalized) return null;
    return ALLOWED_PROVINCES[normalized] || null;
}

/**
 * Lista única de CCAA atendidas (orden alfabético).
 */
function getAvailableCCAA() {
    const set = new Set(Object.values(ALLOWED_PROVINCES).map(p => p.ccaa));
    return Array.from(set).sort();
}

module.exports = {
    ALLOWED_PROVINCES,
    normalizeProvinceCode,
    isAllowedProvince,
    getProvinceInfo,
    getAvailableCCAA
};
