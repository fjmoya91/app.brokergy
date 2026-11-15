// ─── colaFotos — las fotos que aún no han subido, guardadas EN EL MÓVIL ──────
// En la visita, Safari puede descartar la pestaña en segundo plano (la cámara, el
// móvil bloqueado un rato) y lo que estaba en memoria se pierde; la foto hecha con
// la cámara desde la app no queda en el carrete. Por eso cada foto se apunta aquí
// (IndexedDB, en este navegador) ANTES de mandarla y se borra al subir: lo que
// queda al volver a abrir la obra es lo que no llegó, y sale con «Reintentar».
// Si IndexedDB no está (navegación privada, sin espacio), todo sigue en memoria:
// nada de aquí puede romper una subida.
// ─────────────────────────────────────────────────────────────────────────────

const BD = 'certapp_cola';
const ALMACEN = 'fotos';

let abierta = null;
function abrir() {
    if (abierta) return abierta;
    abierta = new Promise((res, rej) => {
        if (typeof indexedDB === 'undefined') { rej(new Error('sin IndexedDB')); return; }
        const r = indexedDB.open(BD, 1);
        r.onupgradeneeded = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'k' }).createIndex('obra', 'obra');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    }).catch((e) => { abierta = null; throw e; });
    return abierta;
}

function tx(modo, fn) {
    return abrir().then(db => new Promise((res, rej) => {
        const t = db.transaction(ALMACEN, modo);
        const out = fn(t.objectStore(ALMACEN));
        t.oncomplete = () => res(out?.result ?? out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
    }));
}

const nuevaClave = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Apunta un fichero de un apartado. Devuelve su clave, o null si no se ha podido. */
export async function apuntar(obraId, slotId, file) {
    const k = nuevaClave();
    try {
        await tx('readwrite', s => s.put({ k, obra: obraId, slot: slotId, nombre: file.name, tipo: file.type, blob: file, at: Date.now() }));
        return k;
    } catch {
        return null;
    }
}

/** Lo quita (ya ha subido, o el servidor no lo quiere). */
export async function quitar(k) {
    if (!k) return;
    try { await tx('readwrite', s => s.delete(k)); } catch { /* se queda: se reintentará */ }
}

/** Lo que queda de una obra: `[{ k, slot, file }]`, del más antiguo al más nuevo. */
export async function deLaObra(obraId) {
    try {
        const filas = await tx('readonly', s => s.index('obra').getAll(obraId));
        return (filas || [])
            .sort((a, b) => a.at - b.at)
            .map(f => ({ k: f.k, slot: f.slot, file: new File([f.blob], f.nombre || 'foto.jpg', { type: f.tipo || f.blob?.type || 'image/jpeg', lastModified: f.at }) }));
    } catch {
        return [];
    }
}
