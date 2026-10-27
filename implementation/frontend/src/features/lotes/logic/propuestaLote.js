// ============================================================
// propuestaLote.js — qué expedientes meter en un lote, propuesto por la app
//
// El picker de «Añadir expediente» listaba los elegibles por nº y había que
// armar el lote a ojo. Aquí se proponen lotes ya hechos, con dos criterios:
//   • ANTIGÜEDAD: lo que más lleva listo y sin lotear, primero (es dinero parado:
//     el CAE no se emite ni se cobra hasta que entra en un lote).
//   • INSTALADOR: los del mismo instalador juntos, los suyos más antiguos primero.
// La antigüedad es la de `listo_desde` (registro del CEE final, o el inicial), el
// MISMO criterio que el bloque SIN_LOTEAR del radar del parte diario.
//
// Un lote es de UN año de actuación y UNA CCAA (lo exige el backend al añadir),
// así que cada propuesta vive dentro de un grupo año+CCAA, y nunca pasa del
// cupo que le queda al lote (máximo recomendado 5).
// ============================================================

export const MAX_EXPEDIENTES_LOTE = 5;

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const fechaMs = (iso) => {
    if (!iso) return null;
    const t = Date.parse(String(iso).slice(0, 10));
    return Number.isFinite(t) ? t : null;
};

/** Días que lleva listo para lotear (null si no se sabe). */
export function diasListo(exp, hoy = new Date()) {
    const t = fechaMs(exp?.listo_desde);
    if (t == null) return null;
    return Math.max(0, Math.floor((hoy.getTime() - t) / 86400000));
}

/** Más antiguo primero; sin fecha al final (no se puede ordenar, pero no se esconde). */
export function compararAntiguedad(a, b) {
    const ta = fechaMs(a.listo_desde), tb = fechaMs(b.listo_desde);
    if (ta != null && tb != null && ta !== tb) return ta - tb;
    if (ta == null && tb != null) return 1;
    if (tb == null && ta != null) return -1;
    return String(a.numero_expediente || '').localeCompare(String(b.numero_expediente || ''), 'es', { numeric: true });
}

/** Instaladores presentes en una lista, con cuántos expedientes tiene cada uno. */
export function instaladoresDe(lista) {
    const m = new Map();
    for (const e of lista) {
        if (!e.instalador_id) continue;
        const k = String(e.instalador_id);
        const v = m.get(k) || { id: k, nombre: e.instalador_nombre || 'Instalador sin nombre', n: 0 };
        v.n += 1;
        m.set(k, v);
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Propuestas de lote.
 * @param {Array} elegibles  filas de GET /api/lotes/elegibles
 * @param {Object} o
 *   ccaa, anio           claves del lote (o filtros del usuario); null = cualquiera
 *   cupo                 huecos que le quedan al lote
 *   instaladoresLote     ids de instalador que YA están en el lote (van primero)
 *   maxPorInstalador     cuántas propuestas por instalador como mucho
 * @returns {Array<{ clave, tipo, titulo, instalador_id, instalador_nombre, ccaa, anio, expedientes, desde }>}
 */
export function proponerLotes(elegibles, { ccaa = null, anio = null, cupo = MAX_EXPEDIENTES_LOTE, instaladoresLote = [], maxPorInstalador = 12 } = {}) {
    if (!cupo || cupo <= 0) return [];
    const base = (elegibles || []).filter(e =>
        (!ccaa || norm(e.ccaa) === norm(ccaa)) && (!anio || Number(e.anio_actuacion) === Number(anio)));
    if (!base.length) return [];

    // Grupos año + CCAA: solo dentro de uno se puede armar un lote.
    const grupos = new Map();
    for (const e of base) {
        const k = `${e.anio_actuacion}|${norm(e.ccaa)}`;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(e);
    }
    for (const g of grupos.values()) g.sort(compararAntiguedad);

    // 1) Los más antiguos, UNA propuesta por año + CCAA (el grupo que más lleva
    //    esperando, primero). Con solo la del expediente más viejo, el lote vacío
    //    proponía un lote de UNO: medido el 27/10/2026, 25RES080_28 es el único
    //    elegible de 2025 y tapaba los 28 de 2026.
    const antiguedad = [...grupos.entries()]
        .map(([k, g]) => {
            const sel = g.slice(0, cupo);
            return {
                clave: `antiguedad|${k}`,
                tipo: 'antiguedad',
                titulo: 'Los más antiguos',
                instalador_id: null, instalador_nombre: null,
                ccaa: sel[0].ccaa, anio: sel[0].anio_actuacion,
                expedientes: sel,
                total: g.length,
                desde: sel[0].listo_desde || null,
            };
        })
        .sort((a, b) => compararAntiguedad(a.expedientes[0], b.expedientes[0]));
    const out = [...antiguedad];

    // 2) Por instalador: sus expedientes más antiguos, dentro de cada grupo.
    const enLote = new Set((instaladoresLote || []).filter(Boolean).map(String));
    const porIns = [];
    for (const g of grupos.values()) {
        const m = new Map();
        for (const e of g) {
            if (!e.instalador_id) continue;
            const k = String(e.instalador_id);
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(e); // ya vienen por antigüedad
        }
        for (const [insId, exps] of m) {
            const sel = exps.slice(0, cupo);
            porIns.push({
                clave: `instalador|${insId}|${sel[0].anio_actuacion}|${norm(sel[0].ccaa)}`,
                tipo: 'instalador',
                titulo: sel[0].instalador_nombre || 'Instalador sin nombre',
                instalador_id: insId, instalador_nombre: sel[0].instalador_nombre || null,
                ccaa: sel[0].ccaa, anio: sel[0].anio_actuacion,
                expedientes: sel,
                total: exps.length,
                desde: sel[0].listo_desde || null,
                yaEnLote: enLote.has(insId),
            });
        }
    }
    // El instalador que ya está en el lote va primero (el lote ya es «suyo»); luego,
    // los que tienen al menos DOS (uno solo no es un lote «por instalador»); y entre
    // ellos, el que más lleva esperando; a igualdad, el que llena más lote.
    porIns.sort((a, b) =>
        (Number(b.yaEnLote) - Number(a.yaEnLote))
        || (Number(b.expedientes.length >= 2) - Number(a.expedientes.length >= 2))
        || compararAntiguedad(a.expedientes[0], b.expedientes[0])
        || (b.expedientes.length - a.expedientes.length));

    // Una propuesta de instalador idéntica a una de antigüedad no se repite: se dice
    // en la de antigüedad que son todos suyos. Y un instalador con UN solo expediente
    // no es propuesta (ya está en la lista), salvo que sea el del lote.
    const idsDe = (p) => p.expedientes.map(e => e.id).sort().join(',');
    let nIns = 0;
    for (const p of porIns) {
        if (nIns >= maxPorInstalador) break;
        if (p.expedientes.length < 2 && !p.yaEnLote) continue;
        const igual = antiguedad.find(a => idsDe(a) === idsDe(p));
        if (igual) {
            // El nombre delante: en el móvil el título se corta por el final.
            if (p.expedientes.length >= 2) igual.titulo = `${p.titulo} · los más antiguos`;
            continue;
        }
        out.push(p);
        nIns += 1;
    }
    return out;
}
