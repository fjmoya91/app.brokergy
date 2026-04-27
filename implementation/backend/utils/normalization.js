/**
 * Utilidad para normalizar datos antes de persistirlos en la BD.
 * Reglas:
 * 1. Todos los strings pasan a MAYÚSCULAS.
 * 2. Si la clave es 'email', pasa a minúsculas.
 * 3. Se eliminan espacios en blanco extra (trim).
 */
const BLACKLIST = ['id', 'id_oportunidad', 'id_cliente', 'password', 'token', 'reformaType', 'method', 'type', 'icon', 'link', 'url', 'ficha'];

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
