/**
 * Utilidad para normalizar datos antes de persistirlos en la BD.
 * Reglas:
 * 1. Todos los strings pasan a MAYÚSCULAS.
 * 2. Si la clave es 'email', pasa a minúsculas.
 * 3. Se eliminan espacios en blanco extra (trim).
 */
const BLACKLIST = ['id', 'id_oportunidad', 'id_cliente', 'password', 'token', 'reformaType', 'method', 'type', 'icon', 'link', 'url', 'ficha', 'tipo_emisor', 'metodo_scop', 'rendimiento_id', 'comb_', 'datos_calculo'];

function normalizeData(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const normalized = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
        let value = obj[key];

        if (BLACKLIST.some(b => key.toLowerCase().includes(b.toLowerCase()))) {
            normalized[key] = value;
            continue;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (key.toLowerCase().includes('email')) {
                normalized[key] = trimmed.toLowerCase();
            } else if (/^https?:\/\//i.test(trimmed)) {
                // URLs nunca se normalizan: los IDs/tokens en el path son case-sensitive
                // (p. ej. Drive fileIds: /file/d/1Tq6-tZiUj... ≠ /file/d/1TQ6-TZIUJ...)
                normalized[key] = trimmed;
            } else {
                normalized[key] = trimmed.toUpperCase();
            }
        } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
            normalized[key] = normalizeData(value);
        } else {
            normalized[key] = value;
        }
    }

    return normalized;
}

module.exports = { normalizeData };
