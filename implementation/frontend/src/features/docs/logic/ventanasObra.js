/**
 * Las fotos de las VENTANAS, ventana por ventana.
 *
 * En un RES080 se cambian cinco, ocho, doce ventanas, y cada una necesita su foto
 * de antes y su foto de después. Iban a granel —todas las de antes en un montón y
 * todas las de después en otro— y nadie sabía qué foto nueva correspondía a qué
 * ventana vieja: ni quien las revisa, ni el Anexo Fotográfico, que las sacaba en
 * dos bloques sin emparejar.
 *
 * Ahora cada foto dice de QUÉ VENTANA es (`ventana: 'V3'`) y, si alguien se lo ha
 * puesto, dónde está (`ventana_nombre: 'Cocina'`). Va en la propia entrada de la
 * foto en `reforma_uploads`, junto a su estado: no hay tabla nueva ni lista
 * aparte que pueda desincronizarse. Una ventana EXISTE cuando tiene alguna foto.
 *
 * FUENTE ÚNICA: la usan el enlace del cliente y el panel (DocsManager →
 * VentanasPorVentana), el backend al guardar (lo importa por `import()`, como el
 * CIFO) y el Anexo Fotográfico al rotular. Puro, sin React: se prueba desde Node.
 */

/** Los apartados que van ventana por ventana, y en qué fase. */
export const SLOTS_POR_VENTANA = {
    FOTO_VENTANAS_ANTES: 'ANTES',
    FOTO_VENTANAS_DESPUES: 'DESPUES',
};

export const esPorVentana = (key) => Object.prototype.hasOwnProperty.call(SLOTS_POR_VENTANA, key);

/** El otro apartado de la pareja (el antes del después y al revés). */
export const pareja = (key) => (key === 'FOTO_VENTANAS_ANTES' ? 'FOTO_VENTANAS_DESPUES'
    : key === 'FOTO_VENTANAS_DESPUES' ? 'FOTO_VENTANAS_ANTES' : null);

/** Nombres de un toque: en el móvil, escribir "dormitorio" es lo que no se hace. */
export const NOMBRES_RAPIDOS = ['Salón', 'Cocina', 'Dormitorio', 'Baño', 'Pasillo', 'Terraza'];

// V1…V99. El id no se reutiliza al borrar: "Ventana 3" sigue siendo la 3 aunque
// se quite la 2, o la foto de después se emparejaría con otra ventana.
const RE_ID = /^V([1-9]\d?)$/;

export function numeroVentana(id) {
    const m = RE_ID.exec(String(id || '').trim().toUpperCase());
    return m ? Number(m[1]) : null;
}

/**
 * Lo que llega del navegador, limpio. `null` si el id no es una ventana — una
 * foto sin ventana sigue siendo válida (va a "sin ventana asignada").
 */
export function sanearVentana(id, nombre) {
    const n = numeroVentana(id);
    if (!n) return null;
    const nom = [...String(nombre ?? '')]
        .filter(c => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
    return { ventana: `V${n}`, ventana_nombre: nom || null };
}

/** "Ventana 2 · Cocina", o "Ventana 2" si nadie le ha puesto nombre. */
export function rotuloVentana(id, nombre) {
    const n = numeroVentana(id);
    if (!n) return 'Sin ventana asignada';
    return nombre ? `Ventana ${n} · ${nombre}` : `Ventana ${n}`;
}

const fecha = (it) => (it && it.at ? Date.parse(it.at) || 0 : 0);

/**
 * Las ventanas de un expediente a partir de las fotos de los dos apartados.
 *
 * `extra` son ventanas recién añadidas en pantalla que aún no tienen foto (se
 * enseñan para poder subirles la primera). El nombre de una ventana es el más
 * reciente que tenga cualquiera de sus fotos: renombrar escribe en todas, pero si
 * una escritura falla a medias, gana lo último que se dijo.
 *
 * @returns {{ ventanas: Array<{id, n, nombre, antes:[], despues:[]}>,
 *             sinVentana: { antes: [], despues: [] } }}
 */
export function ventanasDe(antesItems = [], despuesItems = [], extra = []) {
    const porId = new Map();
    const sinVentana = { antes: [], despues: [] };
    const alta = (id) => {
        if (!porId.has(id)) porId.set(id, { id, n: numeroVentana(id), nombre: null, nombreAt: -1, antes: [], despues: [] });
        return porId.get(id);
    };
    const meter = (items, fase) => {
        for (const it of items || []) {
            const id = numeroVentana(it?.ventana) ? `V${numeroVentana(it.ventana)}` : null;
            if (!id) { sinVentana[fase].push(it); continue; }
            const v = alta(id);
            v[fase].push(it);
            if (it.ventana_nombre && fecha(it) >= v.nombreAt) { v.nombre = it.ventana_nombre; v.nombreAt = fecha(it); }
        }
    };
    meter(antesItems, 'antes');
    meter(despuesItems, 'despues');
    for (const e of extra || []) {
        const s = sanearVentana(e?.id, e?.nombre);
        if (!s) continue;
        const v = alta(s.ventana);
        if (!v.nombre && s.ventana_nombre) v.nombre = s.ventana_nombre;
    }
    const ventanas = [...porId.values()]
        .sort((a, b) => a.n - b.n)
        .map(({ nombreAt, ...v }) => v); // eslint-disable-line no-unused-vars
    return { ventanas, sinVentana };
}

/** El id de la siguiente ventana: nunca uno ya usado, aunque esté vacío. */
export function siguienteId(ventanas = []) {
    const max = ventanas.reduce((m, v) => Math.max(m, v.n || numeroVentana(v.id) || 0), 0);
    return `V${Math.min(max + 1, 99)}`;
}

/**
 * «Subir todas a la vez» del ANTES: cada foto pasa a ser una ventana nueva, con
 * números seguidos DESPUÉS de las que ya tienen foto. Una ventana añadida en
 * pantalla y aún vacía no cuenta: la primera foto de la tanda la ocupa.
 */
export function idsParaTanda(ventanas = [], n = 0) {
    const conFoto = ventanas.filter(v => (v.antes?.length || 0) + (v.despues?.length || 0) > 0);
    const desde = numeroVentana(siguienteId(conFoto)) || 1;
    return Array.from({ length: Math.max(0, n) }, (_, i) => `V${Math.min(desde + i, 99)}`);
}

/**
 * Cuántas ventanas tienen ya su foto de DESPUÉS, sobre las que tienen la de
 * ANTES (una ventana solo con foto de después también cuenta como hecha).
 */
export function progresoDespues(ventanas = []) {
    const total = ventanas.filter(v => v.antes.length || v.despues.length).length;
    const hechas = ventanas.filter(v => v.despues.length).length;
    return { total, hechas, faltan: Math.max(0, total - hechas) };
}

/**
 * Para el Anexo Fotográfico: las fotos de UN apartado por ventana, con su
 * rótulo. Las que no tienen ventana van al final, con el rótulo del apartado.
 *
 * @param photos   [{ name, ventana?, ventana_nombre?, … }] en su orden natural
 * @param nombres  { V3: 'Cocina' } — el nombre vigente de cada ventana (sale de
 *                 los DOS apartados, para que antes y después se llamen igual)
 */
export function ordenarPorVentana(photos = [], nombres = {}) {
    const conIdx = photos.map((ph, i) => ({ ph, i, n: numeroVentana(ph?.ventana) }));
    conIdx.sort((a, b) => ((a.n || 1e6) - (b.n || 1e6)) || (a.i - b.i));
    const vistas = {};
    return conIdx.map(({ ph, n }) => {
        if (!n) return { ...ph, rotulo: null };
        const id = `V${n}`;
        vistas[id] = (vistas[id] || 0) + 1;
        const base = rotuloVentana(id, nombres[id] || ph.ventana_nombre);
        return { ...ph, rotulo: vistas[id] > 1 ? `${base} (${vistas[id]})` : base };
    });
}

/** `{ V3: 'Cocina' }` a partir de las entradas de los dos apartados. */
export function nombresDeVentanas(antesItems = [], despuesItems = []) {
    const { ventanas } = ventanasDe(antesItems, despuesItems);
    return Object.fromEntries(ventanas.filter(v => v.nombre).map(v => [v.id, v.nombre]));
}
