/**
 * Utilidad para normalizar datos antes de persistirlos en la BD.
 * Reglas:
 * 1. Todos los strings pasan a MAYÚSCULAS.
 * 2. Si la clave es 'email', pasa a minúsculas.
 * 3. Se eliminan espacios en blanco extra (trim).
 */
// `tipo_equipo_nuevo` va aquí por el mismo motivo que `tipo_emisor` / `metodo_scop`:
// son ENUMS en minúscula que la app compara con === ('termo_electrico'). Subirlos a
// MAYÚSCULAS los rompe (los lectores caían al valor por defecto).
const BLACKLIST = ['id', 'id_oportunidad', 'id_cliente', 'password', 'token', 'reformaType', 'method', 'type', 'icon', 'link', 'url', 'ficha', 'tipo_emisor', 'tipo_equipo_nuevo', 'metodo_scop', 'hibridacion_metodo', 'rendimiento_id', 'comb_', 'datos_calculo'];

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
            } else if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
                // URLs y data-URIs nunca se normalizan: son case-sensitive.
                //  · URLs: los IDs/tokens del path (p. ej. Drive fileIds:
                //    /file/d/1Tq6-tZiUj... ≠ /file/d/1TQ6-TZIUJ...).
                //  · data:...;base64,... : el payload base64 es case-sensitive;
                //    subirlo a MAYÚSCULAS corrompe la imagen (bug fotos del Anexo
                //    Fotográfico que dejaban de renderizar). Ver photo_attachments.
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
