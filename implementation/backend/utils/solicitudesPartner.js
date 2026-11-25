// ─── Varios INSTALADORES piden la MISMA obra ────────────────────────────────
//
// Puro (sin BD ni Drive). Caso de origen: 26RES060_OP360 (HÉCTOR MUÑOZ), que
// pidió SANTOS GONZÁLEZ GARRIDO el 31/10/2026 y nos volvió a llegar por ISM el
// 25/11 con su presupuesto. Decisión de Fran (25/11/2026): queda registrado
// quién la ha pedido y en qué orden, la propuesta que se le manda a cada uno, y
// **el bono CAE es EXACTAMENTE el mismo para todos**: lo único que cambia de una
// propuesta a otra es el presupuesto del instalador.
//
// Tabla: scripts/oportunidad_solicitudes_schema.sql. Rutas: routes/solicitudesPartner.js.
// Ver docs/conocimiento/oportunidades/varios-instaladores-piden-la-misma-obra.md

const norm = (id) => (id == null || id === '' ? null : String(id).toLowerCase());

/** Para quién se hizo una versión: la marca nueva o, si no la lleva, el partner de la oportunidad. */
function partnerDeVersion(version, prescriptorIdOp) {
    return norm(version?.partner_id) || norm(prescriptorIdOp);
}

/** El instalador para el que se prepara la propuesta ahora: el elegido en la calculadora o el de la oportunidad. */
function partnerDePropuesta(inputs, prescriptorIdOp) {
    return norm(inputs?.partner_propuesta_id) || norm(prescriptorIdOp);
}

const num = (v) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : null;
};

// Los bonos que imprime una versión, por opción. Se comparan opción con opción.
function bonosDe(importes) {
    if (!importes) return {};
    const out = {};
    const principal = num(importes.caeBonus);
    if (importes.rama === 'reforma') { if (principal != null) out.reforma = principal; }
    else if (principal != null) out.aerotermia = principal;
    const ref = num(importes.reforma?.caeBonus);
    if (ref != null) out.reforma = ref;
    return out;
}

const eur = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' }).format(n)} €`;
const TOLERANCIA_EUR = 1;

/**
 * ¿El bono de la propuesta que se va a registrar es el MISMO que el de la última
 * versión enviada a CADA uno de los OTROS instaladores? Devuelve null si sí (o si
 * no hay con qué comparar) y, si no, { code, mensaje, diferencias }.
 *
 * Solo compara con OTROS instaladores: a uno mismo se le puede mandar una versión
 * corregida (el reenvío normal). Y solo opción con opción (regla del historial).
 */
function comprobarBonoIgual({ versiones = [], prescriptorIdOp, partnerId, importes, nombres = {} }) {
    const actual = bonosDe(importes);
    if (!Object.keys(actual).length) return null;
    const yo = norm(partnerId);

    // La última versión de cada OTRO instalador.
    const ultimaPorPartner = new Map();
    for (const v of versiones) {
        if (!v) continue;
        const p = partnerDeVersion(v, prescriptorIdOp);
        if (!p || p === yo) continue;
        const prev = ultimaPorPartner.get(p);
        if (!prev || (Number(v.v) || 0) > (Number(prev.v) || 0)) ultimaPorPartner.set(p, v);
    }

    const diferencias = [];
    for (const [p, v] of ultimaPorPartner) {
        const suyos = bonosDe(v.importes);
        for (const opcion of Object.keys(actual)) {
            if (suyos[opcion] == null) continue;
            if (Math.abs(suyos[opcion] - actual[opcion]) > TOLERANCIA_EUR) {
                diferencias.push({
                    partner_id: p,
                    partner: nombres[p] || v.partner_nombre || 'otro instalador',
                    version: v.v,
                    opcion,
                    suyo: suyos[opcion],
                    ahora: actual[opcion],
                });
            }
        }
    }
    if (!diferencias.length) return null;
    const lineas = diferencias.map(d =>
        `v${d.version} a ${d.partner}: ${eur(d.suyo)}${d.opcion === 'reforma' ? ' (reforma)' : ''} · ahora ${eur(d.ahora)}`);
    return {
        code: 'BONO_DISTINTO',
        mensaje: `El bono CAE tiene que ser el MISMO para todos los instaladores que han pedido esta obra, y no lo es: ${lineas.join(' · ')}. `
            + 'Solo puede cambiar el presupuesto. Revisa la comisión y el cálculo; si el ahorro ha cambiado para todos (un CEE nuevo), confirma el envío y manda también la versión nueva a los demás.',
        diferencias,
    };
}

/**
 * Las versiones enviadas a cada instalador: { [partnerId]: [{ v, fecha, caeBonus, inversion, a: ['CLIENTE', …] }] }.
 * «A quién» es el modo de cada envío (CLIENTE, PARTNER…), sin teléfonos ni emails.
 */
function versionesPorPartner(versiones = [], prescriptorIdOp) {
    const out = {};
    for (const v of versiones) {
        if (!v) continue;
        const p = partnerDeVersion(v, prescriptorIdOp);
        if (!p) continue;
        (out[p] = out[p] || []).push({
            v: v.v,
            fecha: v.fecha || null,
            caeBonus: num(v.importes?.caeBonus),
            inversion: num(v.importes?.inversion),
            a: [...new Set((v.destinatarios || []).map(d => d?.modo).filter(Boolean))],
            enlace: Array.isArray(v.canales) && v.canales.includes('enlace'),
            aceptada: !!v.aceptada_at,
        });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (Number(a.v) || 0) - (Number(b.v) || 0));
    return out;
}

/**
 * La lista para enseñar, en orden. Si la tabla aún no tiene filas, el partner de
 * la oportunidad es el 1º IMPLÍCITO (sin guardar): la oportunidad nació con él.
 */
function listaConImplicito(filas = [], { prescriptorIdOp, creadaAt, presupuestoOp, estimadoOp } = {}) {
    const ordenadas = [...filas].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    if (ordenadas.length || !prescriptorIdOp) return ordenadas;
    return [{
        id: null,
        implicito: true,
        prescriptor_id: norm(prescriptorIdOp),
        orden: 1,
        recibida_at: creadaAt || null,
        presupuesto: num(presupuestoOp),
        presupuesto_estimado: !!estimadoOp,
    }];
}

module.exports = {
    norm,
    partnerDeVersion,
    partnerDePropuesta,
    bonosDe,
    comprobarBonoIgual,
    versionesPorPartner,
    listaConImplicito,
};
