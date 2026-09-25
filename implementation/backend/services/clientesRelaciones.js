// ─── clientesRelaciones.js ───────────────────────────────────────────────────
// Lo que se le tramita a cada cliente: sus oportunidades, sus expedientes CAE y
// sus CEE directos. De aquí salen las etiquetas de tipo y el estado del cliente
// (`frontend/src/features/clientes/logic/clientesEtiquetas.js`).
//
// FUENTE ÚNICA para las dos superficies que los necesitan: el listado de
// Clientes (`GET /api/clientes`) y la sincronización de etiquetas de WhatsApp
// (`whatsappClientesSync`). Si cada una los cargara a su manera, el chat del
// cliente diría "CERRADO" mientras la pantalla dice "EN CURSO".
//
// ⚠️ Los ids viajan en la URL, así que todo va POR LOTES (`enLotes`), y un fallo
// LANZA: pintar "SIN ASIGNAR" en un cliente que sí tiene oportunidad es afirmar
// algo falso. Y SIN columnas JSONB enteras (regla 22): del `datos_calculo` de la
// oportunidad solo se proyecta su estado.

const supabase = require('./supabaseClient');
const { enLotes } = require('../utils/consultaLotes');

const CAMPOS_OP = 'id, id_oportunidad, referencia_cliente, cliente_id, created_at, estado:datos_calculo->>estado';
const CAMPOS_EXP = 'id, numero_expediente, estado, created_at, cliente_id, oportunidad_id';
const CAMPOS_CEE = 'id, numero_expediente, nombre, estado, alcance, created_at, correlativo, cliente_id';

const masReciente = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);

/**
 * @param {string[]} clienteIds
 * @param {{ internos?: boolean }} opts  `internos` = expedientes y CEE directos,
 *        que son solo del equipo: a un partner se le devuelven vacíos.
 * @returns {Promise<Map<string, {oportunidades, expedientes, cee_directos}>>}
 */
async function cargarRelaciones(clienteIds, { internos = false } = {}) {
    const out = new Map(clienteIds.map(id => [id, { oportunidades: [], expedientes: [], cee_directos: [] }]));
    if (!clienteIds.length) return out;

    const ops = await enLotes(clienteIds, t => supabase.from('oportunidades').select(CAMPOS_OP).in('cliente_id', t));
    ops.sort(masReciente); // la más reciente primero: es la que se pinta en la fila
    for (const o of ops) out.get(o.cliente_id)?.oportunidades.push(o);
    if (!internos) return out;

    // Expedientes por LOS DOS caminos y fusionados, igual que la ficha del
    // cliente: por el propio expediente y por su oportunidad, que no siempre
    // coinciden (un migrado puede tener ya el cliente real mientras su
    // oportunidad sigue apuntando al placeholder de la migración).
    const opIds = ops.map(o => o.id).filter(Boolean);
    const [porCli, porOp, cees] = await Promise.all([
        enLotes(clienteIds, t => supabase.from('expedientes').select(CAMPOS_EXP).in('cliente_id', t)),
        enLotes(opIds, t => supabase.from('expedientes').select(CAMPOS_EXP).in('oportunidad_id', t)),
        enLotes(clienteIds, t => supabase.from('cee_directos').select(CAMPOS_CEE).in('cliente_id', t)),
    ]);
    const opACliente = new Map(ops.map(o => [o.id, o.cliente_id]));
    const vistos = new Set();
    for (const e of [...porCli, ...porOp]) {
        if (!e?.id || vistos.has(e.id)) continue;
        const dueno = e.cliente_id || opACliente.get(e.oportunidad_id) || null;
        if (!dueno || !out.has(dueno)) continue;
        vistos.add(e.id);
        out.get(dueno).expedientes.push(e);
    }
    for (const c of cees) out.get(c.cliente_id)?.cee_directos.push(c);

    for (const r of out.values()) {
        r.expedientes.sort(masReciente); // al más reciente apuntan los accesos directos
        r.cee_directos.sort((a, b) => (b.correlativo || 0) - (a.correlativo || 0));
    }
    return out;
}

module.exports = { cargarRelaciones };
