// Cuántas incidencias ABIERTAS tiene un expediente, leves y graves, a partir de
// `documentacion.incidencias` (el mismo criterio que el contador del listado y el
// MCP: estado ABIERTA). Lo usan el picker del lote y la Vista S.O. para separar lo
// que pasará la verificación de lo que el verificador nos devolverá (03/11/2026).
function contarIncidenciasAbiertas(incidencias) {
    const out = { leves: 0, graves: 0 };
    for (const i of Array.isArray(incidencias) ? incidencias : []) {
        if (!i || i.estado !== 'ABIERTA') continue;
        if (i.severidad === 'GRAVE') out.graves++; else out.leves++;
    }
    return out;
}

module.exports = { contarIncidenciasAbiertas };
