/**
 * Cache LRU en memoria para respuestas del Catastro.
 *
 * Razón de ser: el Catastro tiene rate-limit por IP/hora. Muchos clientes
 * consultan la misma RC o coordenadas cercanas (varios clientes en el mismo
 * edificio, mismo barrio, prueba/error sobre la misma vivienda). Cachear las
 * respuestas reduce drásticamente las peticiones que disparan el ban.
 *
 * Política:
 *   - 2 espacios de cache: 'rc' (por referencia catastral) y 'coords' (por
 *     lat/lng redondeados a 5 decimales — precisión ~1.1m).
 *   - TTL diferenciado:
 *       rc:     30 días — los datos catastrales no cambian a corto plazo
 *       coords: 7 días   — más conservador por si se modifica la cartografía
 *   - LRU con tamaño máximo de 500 entradas (suficiente para varios miles
 *     de consultas únicas; con repeticiones aguanta bastante más).
 *   - In-memory: si el backend reinicia se pierde, pero se reconstruye solo.
 *
 * No usa Redis ni dependencias externas — solo Map nativo de JS.
 */

const MAX_SIZE = 500;
const TTL_RC = 30 * 24 * 60 * 60 * 1000;     // 30 días
const TTL_COORDS = 7 * 24 * 60 * 60 * 1000;  // 7 días

// Map preserva orden de inserción → LRU "manual" promoviendo on touch.
const store = new Map();

let hits = 0;
let misses = 0;

function get(key) {
    const entry = store.get(key);
    if (!entry) {
        misses++;
        return null;
    }
    if (entry.expiresAt < Date.now()) {
        store.delete(key);
        misses++;
        return null;
    }
    // LRU touch: re-insertar al final
    store.delete(key);
    store.set(key, entry);
    hits++;
    return entry.data;
}

function set(key, data, ttl) {
    if (data === null || data === undefined) return;
    store.set(key, {
        data,
        expiresAt: Date.now() + ttl
    });
    // Evicción LRU: si crecemos por encima del máximo, eliminamos el primero
    while (store.size > MAX_SIZE) {
        const oldestKey = store.keys().next().value;
        store.delete(oldestKey);
    }
}

function clear() {
    store.clear();
    hits = 0;
    misses = 0;
}

function stats() {
    const total = hits + misses;
    return {
        size: store.size,
        max: MAX_SIZE,
        hits,
        misses,
        hitRate: total > 0 ? (hits / total) : 0
    };
}

// ─── Helpers de clave ────────────────────────────────────────────────────
function rcKey(rc) {
    return `rc:${String(rc || '').toUpperCase().trim()}`;
}

function coordsKey(lat, lng) {
    // Redondeo a 5 decimales (~1.1m). Coordenadas muy cercanas usan la misma key.
    const la = Number(lat).toFixed(5);
    const ln = Number(lng).toFixed(5);
    return `coords:${la}:${ln}`;
}

function dwellingsKey(rc14) {
    return `dwellings:${String(rc14 || '').toUpperCase().trim()}`;
}

// ─── API pública del módulo ──────────────────────────────────────────────
module.exports = {
    get,
    set,
    clear,
    stats,
    rcKey,
    coordsKey,
    dwellingsKey,
    TTL_RC,
    TTL_COORDS
};
