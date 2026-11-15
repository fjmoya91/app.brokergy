/**
 * facturasCae (backend) — ESPEJO CJS de
 * `frontend/src/features/expedientes/logic/facturasCae.js`, que es la fuente y
 * explica el porqué. Lo usan las rutas y servicios síncronos del backend (el filtro
 * de incidencias, los lotes, el PDF único). Si cambias uno, cambia el otro:
 * `node implementation/backend/scripts/test_facturas_cae.mjs` compara los dos.
 */

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round(n * 100) / 100;

function facturaComputa(f) {
    return !!f && f.computa_cae !== false;
}

function importeNoComputable(f) {
    if (!f) return 0;
    const base = num(f.importe_sin_iva);
    if (f.computa_cae === false) return base;
    const fuera = (Array.isArray(f.desglose) ? f.desglose : [])
        .filter(d => d && d.computa === false)
        .reduce((s, d) => s + num(d.importe), 0);
    return r2(Math.min(base, Math.max(0, fuera)));
}

function importeCae(f) {
    if (!f) return 0;
    return r2(Math.max(0, num(f.importe_sin_iva) - importeNoComputable(f)));
}

function inversionCae(facturas) {
    return r2((Array.isArray(facturas) ? facturas : []).reduce((s, f) => s + importeCae(f), 0));
}

module.exports = { facturaComputa, importeNoComputable, importeCae, inversionCae };
