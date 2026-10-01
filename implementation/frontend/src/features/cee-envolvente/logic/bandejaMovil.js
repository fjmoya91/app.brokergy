/**
 * La BANDEJA DE SALIDA del teléfono (croquis móvil): que aguante SIN COBERTURA.
 *
 * En un sótano o en un pueblo la señal va y viene, y lo que se hace en ese rato
 * —pintar lo que no es vivienda, hacerle la foto a una fachada, confirmar sus
 * ventanas— no puede perderse ni obligar a repetirlo. Así que todo se apunta
 * PRIMERO en el teléfono y después se manda:
 *
 *  · lo PINTADO, en `localStorage` (es poco: unas manchas), por planta;
 *  · las FOTOS, en IndexedDB (son megas; `localStorage` no las aguanta), con
 *    respaldo en memoria si el navegador no deja (modo privado);
 *  · los HUECOS confirmados, en `localStorage`.
 *
 * Y se manda solo en cuanto vuelve la red. Cada envío lleva su `id_local`: si
 * se perdió la RESPUESTA (el caso típico con poca señal), el reintento no hace
 * las cosas dos veces — el servidor lo recuerda (`croquisMovil.yaHecho`).
 *
 * REGLA — se guarda por PLANTA (`clave`, que da el servidor), no por enlace: si
 * el enlace caduca con cosas sin mandar, el siguiente QR de ESA planta las
 * recupera en este mismo teléfono (lo pintado, trasladado a su lienzo con
 * `recuperarTrazos`; las fotos, tal cual).
 *
 * Lo puro se prueba desde Node (`scripts/test_bandeja_movil.mjs`); lo de
 * IndexedDB necesita el navegador y se comprueba en el banco de pruebas.
 */
import { deltaLienzo } from './trabajoGuardado.js';

// ── La RED ───────────────────────────────────────────────────────────────────

/** No se ha podido hablar con el servidor: sin cobertura, plazo agotado o servidor caído. */
export class SinRed extends Error {
    constructor(mensaje = 'Sin cobertura') {
        super(mensaje);
        this.name = 'SinRed';
        this.sinRed = true;
    }
}

/**
 * Lo que contesta algo que NO es la app (nginx en mitad de un despliegue, un
 * proxy caído, un portal cautivo que no deja pasar): se trata igual que no
 * tener red — se reintenta — y nunca como una respuesta de verdad.
 */
export const esTransitorio = (status) => [0, 408, 502, 503, 504].includes(Number(status));

/**
 * `fetch` con PLAZO. Con poca señal una petición puede quedarse colgada minutos
 * sin fallar nunca, y mientras tanto no se reintenta nada. Lanza `SinRed` si no
 * hay red, si se agota el plazo o si contesta algo transitorio.
 */
export async function pedir(url, opciones = {}, { plazo = 20_000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), plazo);
    try {
        const r = await fetch(url, { ...opciones, signal: ctrl.signal });
        if (esTransitorio(r.status)) throw new SinRed();
        return r;
    } catch (e) {
        if (e?.sinRed) throw e;
        throw new SinRed();
    } finally {
        clearTimeout(t);
    }
}

/** Un id para lo que se manda: con él un reenvío no se hace dos veces. */
export const nuevoIdLocal = (prefijo = 'm') =>
    `${prefijo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ── Lo PINTADO (localStorage, por planta) ────────────────────────────────────

const K_TRABAJO = (clave) => `brokergy.croquisMovil.trabajo.${clave}`;
const K_RESCATE = (clave) => `brokergy.croquisMovil.rescate.${clave}`;
const K_PONER = (clave) => `brokergy.croquisMovil.poner.${clave}`;
const K_CLAVE = (token) => `brokergy.croquisMovil.clave.${token}`;

function leerJson(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; }
}
function guardarJson(k, v) {
    try {
        if (v === null || v === undefined) localStorage.removeItem(k);
        else localStorage.setItem(k, JSON.stringify(v));
        return true;
    } catch { return false; }
}

/**
 * Lo pintado en ESTA planta: `{ token, marco, trazos, sinEnviar, ajuste, at }`.
 * `token` dice con qué enlace se pintó; `marco`, en qué lienzo.
 */
export const leerTrabajo = (clave) => (clave ? leerJson(K_TRABAJO(clave)) : null);
export const guardarTrabajo = (clave, t) => (clave ? guardarJson(K_TRABAJO(clave), t ? { ...t, at: Date.now() } : null) : false);

/**
 * Lo pintado con un enlace ANTERIOR que quedó sin mandar, apartado para que no
 * lo pise el enlace de ahora mientras se decide si se recupera.
 */
export const leerRescate = (clave) => (clave ? leerJson(K_RESCATE(clave)) : null);
export const guardarRescate = (clave, t) => (clave ? guardarJson(K_RESCATE(clave), t) : false);

/** Los huecos confirmados que aún no han llegado al servidor. */
export const leerPoner = (clave) => (clave ? leerJson(K_PONER(clave)) || [] : []);
export const guardarPoner = (clave, lista) => (clave ? guardarJson(K_PONER(clave), lista?.length ? lista : null) : false);

/** De qué planta es un enlace: para decir, con el enlace ya caducado, que queda algo sin mandar. */
export const recordarClave = (token, clave) => guardarJson(K_CLAVE(token), clave);
export const claveDeToken = (token) => leerJson(K_CLAVE(token));

/**
 * Deja listo lo que se encuentra en el teléfono al abrir un enlace: si es de
 * ESTE enlace, se sigue con ello; si es de uno ANTERIOR y tiene cosas sin
 * mandar, se aparta como rescate (se ofrece recuperarlo). Puro: devuelve qué
 * hacer, no toca nada.
 *
 * @returns {{ propio: object|null, rescate: object|null }}
 */
export function repartirLocal(local, token) {
    if (!local || typeof local !== 'object') return { propio: null, rescate: null };
    if (local.token === token) return { propio: local, rescate: null };
    const hay = local.sinEnviar && Array.isArray(local.trazos) && local.trazos.length > 0;
    return { propio: null, rescate: hay ? local : null };
}

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Lo pintado con un enlace anterior, llevado al lienzo del de ahora. El motor
 * re-encuadra el lienzo al volver a medir (regla 79), así que el mismo garaje
 * puede tener otras coordenadas; sin los dos marcos no se sabe y se deja igual.
 */
export function recuperarTrazos(trazos, marcoViejo, marcoNuevo) {
    const lista = Array.isArray(trazos) ? trazos : [];
    const d = deltaLienzo(marcoViejo, marcoNuevo);
    if (!d) return lista;
    return lista.map((t) => ({
        ...t,
        pts: (t.pts || []).map(([x, y]) => [r2(x + d[0]), r2(y + d[1])]),
    }));
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** «2 zonas, 3 fotos y el ajuste»: lo que queda por mandar, en una línea. */
export function textoPendiente({ zonas = false, fotos = 0, ajuste = false, huecos = 0, lecturas = 0,
                                  vivienda = false, contras = 0 } = {}) {
    const partes = [];
    if (zonas) partes.push(typeof zonas === 'number' ? plural(zonas, 'zona pintada', 'zonas pintadas') : 'lo pintado');
    if (fotos) partes.push(plural(fotos, 'foto', 'fotos'));
    if (lecturas) partes.push(plural(lecturas, 'foto por contar', 'fotos por contar'));
    if (huecos) partes.push(plural(huecos, 'pared con ventanas por poner', 'paredes con ventanas por poner'));
    if (contras) partes.push(plural(contras, 'pared por cambiar', 'paredes por cambiar'));
    if (vivienda) partes.push('el contorno de la vivienda');
    if (ajuste) partes.push('el ajuste a Catastro');
    if (!partes.length) return '';
    if (partes.length === 1) return partes[0];
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** «hace 40 min», «hace 2 h»: cuánto lleva algo esperando. */
export function haceCuanto(at, ahora = Date.now()) {
    const min = Math.max(0, Math.round((ahora - Number(at || ahora)) / 60_000));
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 48) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} días`;
}

// ── Las FOTOS (IndexedDB, con respaldo en memoria) ───────────────────────────

const DB = 'brokergy-croquis-movil';
const ALMACEN = 'fotos';
//: Lo que no se ha podido mandar en dos semanas ya no lo va a recoger nadie.
const DIAS_COLA = 14;
let promesaDb = null;
//: Si el navegador no deja usar IndexedDB (modo privado en algunos), la cola
//: vive en memoria: se pierde al recargar, pero mientras la página siga abierta
//: se sigue reintentando.
const memoria = new Map();

function abrirDb() {
    if (promesaDb) return promesaDb;
    promesaDb = new Promise((resolve) => {
        try {
            if (typeof indexedDB === 'undefined') { resolve(null); return; }
            const r = indexedDB.open(DB, 1);
            r.onupgradeneeded = () => {
                if (!r.result.objectStoreNames.contains(ALMACEN)) r.result.createObjectStore(ALMACEN, { keyPath: 'id' });
            };
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => resolve(null);
            r.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return promesaDb;
}

function operar(modo, fn) {
    return abrirDb().then((db) => new Promise((resolve, reject) => {
        if (!db) { reject(new Error('sin IndexedDB')); return; }
        let tx;
        try { tx = db.transaction(ALMACEN, modo); } catch (e) { reject(e); return; }
        let valor;
        const req = fn(tx.objectStore(ALMACEN));
        if (req) req.onsuccess = () => { valor = req.result; };
        tx.oncomplete = () => resolve(valor);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    }));
}

/**
 * Apunta una foto en la cola ANTES de mandarla: si se corta a mitad, sigue en
 * el teléfono. `item`: `{ id, clave, pared, paredNombre, blob, nombre, aspecto,
 * leer, at }`. Devuelve dónde ha quedado: 'telefono' o 'memoria'.
 */
export async function encolarFoto(item) {
    try {
        await operar('readwrite', (s) => s.put(item));
        return 'telefono';
    } catch {
        memoria.set(item.id, item);
        return 'memoria';
    }
}

/** Las fotos de ESTA planta que aún no han llegado, de la más antigua a la más nueva. */
export async function fotosEnCola(clave) {
    let lista = [];
    try { lista = (await operar('readonly', (s) => s.getAll())) || []; } catch { lista = []; }
    const todas = [...lista, ...[...memoria.values()].filter((m) => !lista.some((l) => l.id === m.id))];
    return todas.filter((i) => i && i.clave === clave).sort((a, b) => (a.at || 0) - (b.at || 0));
}

export async function quitarDeCola(id) {
    memoria.delete(id);
    try { await operar('readwrite', (s) => s.delete(id)); } catch { /* ya no estaba */ }
}

export async function cambiarEnCola(id, cambios) {
    const m = memoria.get(id);
    if (m) { memoria.set(id, { ...m, ...cambios }); return; }
    try {
        const actual = await operar('readonly', (s) => s.get(id));
        if (actual) await operar('readwrite', (s) => s.put({ ...actual, ...cambios }));
    } catch { /* se queda como estaba */ }
}

/** Tira lo que lleva más de dos semanas en la cola (de cualquier planta). */
export async function purgarCola(ahora = Date.now()) {
    const limite = ahora - DIAS_COLA * 86_400_000;
    try {
        const lista = (await operar('readonly', (s) => s.getAll())) || [];
        for (const i of lista) if ((i.at || 0) < limite) await quitarDeCola(i.id);
    } catch { /* sin IndexedDB no hay nada viejo */ }
}
