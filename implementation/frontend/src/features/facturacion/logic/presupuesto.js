// ─── presupuesto.js ──────────────────────────────────────────────────────────
// Las PARTIDAS de un presupuesto: cómo nace una línea de un artículo del
// catálogo (con su variante y las partidas que arrastra), cómo se calcula y qué
// resumen sale de ellas.
//
// FUENTE ÚNICA del editor (total en vivo), del backend (lo que se guarda, el PDF
// y el mensaje), del MCP (crear un presupuesto hablando) y de la página pública
// de aceptación. Si cada uno calculara a su manera, el cliente podría aceptar en
// pantalla una cifra distinta de la del PDF.
//
// Puro ESM y sin React: el backend lo carga por import() dinámico (ver
// project_backend_importa_frontend_esm). El PDF y el mensaje viven en
// `cee-directo/logic/ofertaCee.js`, que lee estas líneas.
// ─────────────────────────────────────────────────────────────────────────────

const num = (n) => {
    if (typeof n === 'string') n = n.replace(/\s/g, '').replace(',', '.');
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
};
const r2 = (n) => Math.round(num(n) * 100) / 100;

/** Qué expediente abre cada `genera` del catálogo al aceptarse. */
export const ALCANCE_DE_GENERA = { CEE_UNICO: 'UNICO', CEE_DOBLE: 'DOBLE' };

export const FAMILIAS = ['CEE', 'LEGALIZACIÓN', 'SUBVENCIONES', 'INGENIERÍA', 'CAE', 'CONSULTORÍA', 'TASAS', 'OTROS'];

export const MAX_LINEAS = 60;
// Las observaciones son UN bloque del PDF y no se parten entre hojas: con el tope
// caben en una (lo mide `check_presupuesto_paginas.mjs`).
export const MAX_OBSERVACIONES = 2000;

/** Minúsculas y sin tildes: para buscar «legalizacion» y encontrar «Legalización». */
export const normalizarTexto = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const nuevaClave = () => Math.random().toString(36).slice(2, 10);

/** La variante de un artículo por su id o por su nombre (sin tildes). */
export function varianteDe(art, ref) {
    if (!art || ref == null || ref === '') return null;
    const vs = Array.isArray(art.variantes) ? art.variantes : [];
    return vs.find(v => String(v.id) === String(ref))
        || vs.find(v => normalizarTexto(v.nombre) === normalizarTexto(ref))
        || null;
}

/** El concepto que lee el cliente: el artículo y, si la tiene, su variante. */
export function descripcionArticulo(art, variante) {
    return variante ? `${art.nombre} — ${variante.nombre}` : String(art?.nombre || '');
}

/**
 * Una línea a partir de un artículo. El precio sale de la variante (si la hay)
 * o del artículo; un suplido va sin IVA y sin descuento: es dinero que se paga
 * a la Administración tal cual, en nombre del cliente.
 */
export function lineaDeArticulo(art, { varianteId = null, uds = 1, precio = null, dtoPct = 0, detalle = '', arrastradaDe = null } = {}) {
    const variante = varianteDe(art, varianteId);
    const suplido = !!art.suplido;
    return {
        key: nuevaClave(),
        articulo_id: art.id ?? null,
        appsheet_id: art.appsheet_id ?? null,
        variante_id: variante?.id ?? null,
        descripcion: descripcionArticulo(art, variante),
        detalle: String(detalle || ''),
        uds: num(uds) || 1,
        precio: r2(precio != null && precio !== '' ? precio : (variante?.precio ?? art.precio)),
        dtoPct: suplido ? 0 : Math.min(100, Math.max(0, num(dtoPct))),
        ivaPct: suplido ? 0 : num(art.iva_pct ?? 21),
        suplido,
        genera: art.genera || null,
        arrastrada_de: arrastradaDe,
    };
}

/**
 * Las líneas que añade elegir un artículo: la suya y las que ARRASTRA (el CEE
 * inicial y final trae sus dos tasas de registro). Las arrastradas quedan
 * colgadas de la principal (`arrastrada_de` = su `key`): quitar la principal
 * las quita, pero se pueden tocar o borrar una a una.
 */
export function lineasDeArticulo(art, catalogo = [], opts = {}) {
    const principal = lineaDeArticulo(art, opts);
    if (opts.sinArrastre) return [principal];
    const hijas = (Array.isArray(art.arrastra) ? art.arrastra : [])
        .map(a => {
            const hija = catalogo.find(c => String(c.id) === String(a.articulo_id));
            return hija && hija.activo !== false
                ? lineaDeArticulo(hija, { uds: num(a.uds) || 1, arrastradaDe: principal.key })
                : null;
        })
        .filter(Boolean);
    return [principal, ...hijas];
}

/** Una línea con sus importes (la misma cuenta que AppSheet y que `facturaCee.calcularLinea`: el IVA se redondea POR LÍNEA). */
export function calcularLinea(l = {}) {
    const uds = num(l.uds ?? 1);
    const precio = r2(l.precio);
    const suplido = !!l.suplido;
    const dtoPct = suplido ? 0 : Math.min(100, Math.max(0, num(l.dtoPct)));
    const ivaPct = suplido ? 0 : num(l.ivaPct);
    const bruto = r2(uds * precio);
    const descuento = r2(bruto * dtoPct / 100);
    const subtotal = r2(bruto - descuento);
    const iva = r2(subtotal * ivaPct / 100);
    return { ...l, uds, precio, dtoPct, ivaPct, suplido, bruto, descuento, subtotal, iva, importe: r2(subtotal + iva) };
}

/** Base, IVA, descuento, suplidos y total. */
export function totalesLineas(lineas = []) {
    const ls = (Array.isArray(lineas) ? lineas : []).map(calcularLinea);
    const neto = r2(ls.reduce((s, l) => s + l.subtotal, 0));
    const iva = r2(ls.reduce((s, l) => s + l.iva, 0));
    const descuento = r2(ls.reduce((s, l) => s + l.descuento, 0));
    const suplidos = r2(ls.filter(l => l.suplido).reduce((s, l) => s + l.subtotal, 0));
    return { lineas: ls, neto, iva, descuento, suplidos, total: r2(neto + iva) };
}

/** El expediente CEE que abre aceptarlo: 'DOBLE', 'UNICO' o null (no abre ninguno). */
export function alcanceDeLineas(lineas = []) {
    const g = (lineas || []).map(l => l?.genera).filter(Boolean);
    if (g.includes('CEE_DOBLE')) return 'DOBLE';
    if (g.includes('CEE_UNICO')) return 'UNICO';
    return null;
}

/** Las partidas que se le cuentan al cliente: todo menos los suplidos (las tasas). */
export function partidasDe(lineas = []) {
    return (lineas || []).filter(l => !l?.suplido && String(l?.descripcion || '').trim())
        .map(l => String(l.descripcion).trim());
}

/** Resumen corto para el listado («Certificado… + Legalización… — Nave industrial»). */
export function conceptoDeLineas(lineas = [], max = 140) {
    const t = partidasDe(lineas).join(' + ');
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const recorta = (s, n) => String(s ?? '').trim().slice(0, n);

/**
 * Las líneas tal como se GUARDAN: números saneados, textos acotados y sin
 * líneas vacías. Lo que manda el navegador o el MCP pasa por aquí antes de
 * tocar la BD; el catálogo NO se vuelve a aplicar (el precio puede haberse
 * cambiado a mano en esa línea a propósito).
 */
export function sanearLineas(lineas = []) {
    return (Array.isArray(lineas) ? lineas : [])
        .filter(l => l && String(l.descripcion || '').trim())
        .slice(0, MAX_LINEAS)
        .map(l => {
            const c = calcularLinea(l);
            return {
                key: recorta(l.key, 20) || nuevaClave(),
                articulo_id: l.articulo_id ? String(l.articulo_id) : null,
                appsheet_id: l.appsheet_id != null && l.appsheet_id !== '' ? String(l.appsheet_id) : null,
                variante_id: l.variante_id ? String(l.variante_id) : null,
                descripcion: recorta(l.descripcion, 300),
                detalle: recorta(l.detalle, 600),
                uds: c.uds, precio: c.precio, dtoPct: c.dtoPct, ivaPct: c.ivaPct,
                suplido: c.suplido,
                genera: l.genera === 'CEE_UNICO' || l.genera === 'CEE_DOBLE' ? l.genera : null,
                arrastrada_de: l.arrastrada_de ? recorta(l.arrastrada_de, 20) : null,
            };
        });
}

/**
 * Busca artículos por texto, sin tildes, en el CONCEPTO (el nombre), sus variantes
 * y su familia; cada palabra puede ir en cualquier sitio y orden («inicial
 * certificado»). Primero los que EMPIEZAN así, luego los que lo contienen tal
 * cual, luego aquellos en que cada palabra empieza una del concepto; dentro, los
 * más usados.
 */
export function buscarArticulos(catalogo = [], texto = '') {
    const q = normalizarTexto(texto);
    const activos = (catalogo || []).filter(a => a.activo !== false);
    if (!q) return [...activos].sort((a, b) => (b.usos || 0) - (a.usos || 0));
    const palabras = q.split(/\s+/).filter(Boolean);
    const puntua = (a) => {
        const n = normalizarTexto(a.nombre);
        const vs = (a.variantes || []).map(v => normalizarTexto(v.nombre)).join(' ');
        const todo = `${n} ${vs} ${normalizarTexto(a.familia)}`;
        if (!palabras.every(p => todo.includes(p))) return -1;
        const inicios = n.split(/[^a-z0-9ñ]+/).filter(Boolean);
        const porInicio = palabras.every(p => inicios.some(w => w.startsWith(p)));
        return (n.startsWith(q) ? 1000 : 0) + (n.includes(q) ? 500 : 0) + (porInicio ? 250 : 0) + (a.usos || 0);
    };
    return activos.map(a => [a, puntua(a)]).filter(([, p]) => p >= 0).sort((x, y) => y[1] - x[1]).map(([a]) => a);
}
