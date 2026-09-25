// ─────────────────────────────────────────────────────────────────────────────
// Etiquetas y ESTADO de un cliente en el listado.
//
// Un cliente no tiene ficha ni estado propios: los tiene lo que se le tramita.
// Aquí se DERIVAN de sus oportunidades, expedientes CAE y CEE directos, con UNA
// sola función para las dos cosas que se hacen con ellos (pintarlos en la fila y
// filtrar por ellos). Si cada una decidiera por su cuenta, el filtro "Cerrados"
// acabaría trayendo filas que en pantalla dicen "EN CURSO".
//
// Puro, sin React: se puede comprobar desde Node.
// ─────────────────────────────────────────────────────────────────────────────

// Orden en que se pintan y se ofrecen en el filtro. CEE al final: es el otro
// negocio (no lleva ficha ni bono).
export const TIPOS_CLIENTE = ['RES060', 'RES080', 'RES093', 'TER100', 'TER173', 'CEE'];

// La ficha va escrita dentro del número (26RES080_61, 26RES060_OP212). El orden
// de la búsqueda no importa porque ninguna contiene a otra.
const FICHAS_EN_CODIGO = ['RES080', 'RES093', 'TER173', 'TER100', 'RES060'];
export function fichaDeCodigo(codigo) {
    const s = String(codigo || '').toUpperCase();
    return FICHAS_EN_CODIGO.find(f => s.includes(f)) || null;
}

// Un expediente / CEE está cerrado cuando llega a FINALIZADO: es el único estado
// terminal de las dos tablas (medido el 24/09/2026 en producción).
export const estaCerrado = (x) => String(x?.estado || '').toUpperCase() === 'FINALIZADO';

// Estados de la oportunidad en los que todavía es una propuesta viva. ACEPTADA
// no lo es (tiene —o va a tener— expediente) y RECHAZADA tampoco.
const opViva = (op) => !['ACEPTADA', 'RECHAZADA'].includes(String(op?.estado || '').toUpperCase());
const opRechazada = (op) => String(op?.estado || '').toUpperCase() === 'RECHAZADA';

/**
 * Etiquetas de tipo del cliente, sin repetir.
 * Una ficha que solo viene de una OPORTUNIDAD sin expediente sale marcada
 * `propuesta`: es lo que se le ha presupuestado, no lo que se le tramita.
 */
export function etiquetasCliente(c) {
    const exps = c?.expedientes || [];
    const cees = c?.cee_directos || [];
    const ops = c?.oportunidades || [];
    const porTipo = new Map();

    for (const e of exps) {
        const f = fichaDeCodigo(e.numero_expediente) || 'RES060';
        const prev = porTipo.get(f);
        porTipo.set(f, { tipo: f, propuesta: false, abiertos: (prev?.abiertos || 0) + (estaCerrado(e) ? 0 : 1) });
    }
    const opsConExp = new Set(exps.map(e => e.oportunidad_id).filter(Boolean));
    for (const o of ops) {
        if (opsConExp.has(o.id) || opRechazada(o)) continue;
        const f = fichaDeCodigo(o.id_oportunidad);
        if (!f || porTipo.has(f)) continue;
        porTipo.set(f, { tipo: f, propuesta: true, abiertos: 0 });
    }
    if (cees.length) {
        porTipo.set('CEE', { tipo: 'CEE', propuesta: false, abiertos: cees.filter(x => !estaCerrado(x)).length });
    }
    return TIPOS_CLIENTE.filter(t => porTipo.has(t)).map(t => porTipo.get(t));
}

// ─── Estado del cliente ──────────────────────────────────────────────────────
// Manda lo MÁS VIVO: un cliente con un expediente cerrado y otro en marcha está
// EN CURSO, y uno con un expediente cerrado y una propuesta nueva sigue siendo
// una propuesta abierta — cerrado es solo cuando no queda nada por hacer.
export const ESTADOS_CLIENTE = {
    EN_CURSO:    { label: 'En curso',    pill: 'bg-amber-500/10 text-amber-400 border-amber-500/25' },
    PROPUESTA:   { label: 'Propuesta',   pill: 'bg-sky-500/10 text-sky-400 border-sky-500/25' },
    CERRADO:     { label: 'Cerrado',     pill: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
    RECHAZADO:   { label: 'Rechazado',   pill: 'bg-red-500/10 text-red-400 border-red-500/25' },
    SIN_ASIGNAR: { label: 'Sin asignar', pill: 'bg-white/5 text-white/40 border-white/10' },
};
export const ORDEN_ESTADOS_CLIENTE = ['EN_CURSO', 'PROPUESTA', 'CERRADO', 'RECHAZADO', 'SIN_ASIGNAR'];

export function estadoCliente(c) {
    const exps = c?.expedientes || [];
    const cees = c?.cee_directos || [];
    const ops = c?.oportunidades || [];
    const opsConExp = new Set(exps.map(e => e.oportunidad_id).filter(Boolean));

    if (exps.some(e => !estaCerrado(e)) || cees.some(x => !estaCerrado(x))) return 'EN_CURSO';
    // Una ACEPTADA sin expediente a la vista: a quien no es staff no se le
    // mandan los expedientes, y para él eso es una obra en marcha.
    const opsSinExp = ops.filter(o => !opsConExp.has(o.id));
    if (!exps.length && opsSinExp.some(o => String(o.estado || '').toUpperCase() === 'ACEPTADA')) return 'EN_CURSO';
    if (opsSinExp.some(opViva)) return 'PROPUESTA';
    if (exps.length || cees.length) return 'CERRADO';
    if (ops.length) return 'RECHAZADO';
    return 'SIN_ASIGNAR';
}

/**
 * El PUNTO en que está lo que se le tramita, para pintarlo junto al estado:
 * "EN CURSO · PTE. FIN OBRA", "PROPUESTA · ENVIADA". Sale del expediente (o CEE)
 * ABIERTO más reciente; si hay más de uno abierto, `otros` dice cuántos más, que
 * el detalle de todos va en el tooltip. En un cliente cerrado no se añade nada:
 * "CERRADO · FINALIZADO" sería decir lo mismo dos veces.
 */
export function puntoCliente(c) {
    const estado = estadoCliente(c);
    const fecha = (x) => new Date(x?.created_at || 0).getTime();
    if (estado === 'EN_CURSO') {
        const abiertos = [
            ...(c?.expedientes || []).filter(e => !estaCerrado(e)),
            ...(c?.cee_directos || []).filter(x => !estaCerrado(x)),
        ].sort((a, b) => fecha(b) - fecha(a));
        if (abiertos.length) {
            return { numero: abiertos[0].numero_expediente, estado: abiertos[0].estado || null, otros: abiertos.length - 1 };
        }
        const op = (c?.oportunidades || []).find(o => String(o.estado || '').toUpperCase() === 'ACEPTADA');
        return op ? { numero: op.id_oportunidad, estado: op.estado, otros: 0 } : null;
    }
    if (estado === 'PROPUESTA') {
        const conExp = new Set((c?.expedientes || []).map(e => e.oportunidad_id).filter(Boolean));
        const vivas = (c?.oportunidades || []).filter(o => !conExp.has(o.id) && opViva(o))
            .sort((a, b) => fecha(b) - fecha(a));
        if (vivas.length) return { numero: vivas[0].id_oportunidad, estado: vivas[0].estado || null, otros: vivas.length - 1 };
    }
    return null;
}

/** Texto del tooltip del estado: qué hay abierto y en qué punto. */
export function detalleEstado(c) {
    const lineas = [];
    for (const e of c?.expedientes || []) lineas.push(`${e.numero_expediente} · ${e.estado || '—'}`);
    for (const x of c?.cee_directos || []) lineas.push(`${x.numero_expediente} · ${x.estado || '—'}`);
    const opsConExp = new Set((c?.expedientes || []).map(e => e.oportunidad_id).filter(Boolean));
    for (const o of c?.oportunidades || []) {
        if (!opsConExp.has(o.id)) lineas.push(`${o.id_oportunidad} · ${o.estado || '—'}`);
    }
    return lineas.join('\n');
}
