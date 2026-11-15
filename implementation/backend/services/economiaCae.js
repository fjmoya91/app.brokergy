// ============================================================================
// economiaCae.js — El DINERO de los CAE, por expediente y en volumen (para el MCP).
// ----------------------------------------------------------------------------
// Para sacar cifras REALES de la app (convocatorias de premios, previsión de
// cierre): cuánto ahorro gestionamos, cuánto bono pagamos, cuánto ganamos y
// cuánto hemos facturado al Sujeto Obligado.
//
// REGLA — la economía de un expediente sale de `computeExpedienteFinancials`, la
// FUENTE ÚNICA del frontend (la del listado, el panel y el lote), importada por ESM
// como hace cifoService con calculation.js. El gemelo de Node
// (expedienteFinancialsNode.js) no trae ni el verificado ni la herencia de la
// propuesta guardada: con él, un expediente sin CEE saldría a cero.
//
// REGLA — los listados no traen un JSONB entero (regla 22): de `cee`, los campos del
// cálculo (CEE_ECO_SELECT) y de `datos_calculo`, solo lo que lee la economía.
// ============================================================================
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const { CEE_ECO_SELECT, rebuildCee } = require('../utils/ceeEcoFields');
const { ESTADO_RECHAZADO } = require('../utils/expedienteEstados');

let _fin = null;
const logica = () => (_fin ||= import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/expedienteFinancials.js')).href));

const error = (msg, status = 400) => Object.assign(new Error(msg), { status });
const r2 = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100) / 100);
const kwh = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n)));
const LOTE = 100; // .in() por lotes: una lista larga de uuid revienta las cabeceras

const SELECT_EXP = `id, numero_expediente, estado, created_at, lote_id, oportunidad_id, instalacion, ${CEE_ECO_SELECT}`;
// Lo que la economía lee de la oportunidad, sin el resto de `datos_calculo`.
const SELECT_OP = 'id, ficha, dc_inputs:datos_calculo->inputs, dc_zona:datos_calculo->zona, '
    + 'dc_fin:datos_calculo->result->financials, dc_sav:datos_calculo->result->savings, '
    + 'dc_fin080:datos_calculo->result->financialsRes080, dc_res080:datos_calculo->result->res080, '
    + 'dc_kwh:datos_calculo->result->savingsKwh';

function rehacerOp(o) {
    if (!o) return null;
    const result = {};
    if (o.dc_fin) result.financials = o.dc_fin;
    if (o.dc_sav) result.savings = o.dc_sav;
    if (o.dc_fin080) result.financialsRes080 = o.dc_fin080;
    if (o.dc_res080) result.res080 = o.dc_res080;
    if (o.dc_kwh != null) result.savingsKwh = o.dc_kwh;
    return { id: o.id, ficha: o.ficha, datos_calculo: { inputs: o.dc_inputs || {}, zona: o.dc_zona || null, result } };
}

async function porLotes(ids, consulta) {
    const out = [];
    for (let i = 0; i < ids.length; i += LOTE) {
        const { data, error: e } = await consulta(ids.slice(i, i + LOTE));
        if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
        out.push(...(data || []));
    }
    return out;
}

/** Filas de `expedientes` → su economía, con el lote y la factura al S.O. */
async function economiaDe(filas) {
    const { computeExpedienteFinancials } = await logica();
    const opIds = [...new Set(filas.map(e => e.oportunidad_id).filter(Boolean))];
    const loteIds = [...new Set(filas.map(e => e.lote_id).filter(Boolean))];
    const [ops, lotes, facturas] = await Promise.all([
        porLotes(opIds, ids => supabase.from('oportunidades').select(SELECT_OP).in('id', ids)),
        porLotes(loteIds, ids => supabase.from('lotes').select('id, codigo, estado').in('id', ids)),
        porLotes(loteIds, ids => supabase.from('facturas_so').select('lote_id, numero, fecha, estado, unidades_kwh, precio_kwh, base, total, fecha_cobro').in('lote_id', ids)),
    ]);
    const opMap = new Map(ops.map(o => [o.id, rehacerOp(o)]));
    const loteMap = new Map(lotes.map(l => [l.id, l]));
    const facMap = new Map(facturas.map(f => [f.lote_id, f]));

    return filas.map(raw => {
        const exp = rebuildCee(raw);
        exp.oportunidades = opMap.get(exp.oportunidad_id) || null;
        const f = computeExpedienteFinancials(exp);
        const inst = exp.instalacion || {};
        const lote = loteMap.get(exp.lote_id) || null;
        const fac = lote ? facMap.get(lote.id) : null;
        const precioMwh = fac?.precio_kwh != null ? r2(Number(fac.precio_kwh) * 1000) : null;
        // La parte de la factura del lote que es de ESTE expediente: su ahorro
        // verificado al precio facturado. Sin verificado, no se reparte.
        const parte = fac?.numero && precioMwh != null && f.savingsKwhVerificado != null
            ? r2((f.savingsKwhVerificado / 1000) * precioMwh) : null;
        return {
            numero: exp.numero_expediente,
            ficha: f.ficha,
            estado: exp.estado,
            alta: exp.created_at ? String(exp.created_at).slice(0, 10) : null,
            ahorro_kwh: kwh(f.savingsKwh),
            ahorro_verificado_kwh: kwh(f.savingsKwhVerificado),
            bono_cliente: r2(f.cae),
            bono_cliente_verificado: r2(f.caeVerificado),
            beneficio_brokergy: r2(f.profit),
            beneficio_brokergy_verificado: r2(f.profitVerificado),
            // CEE = recalculado con el certificado; PROPUESTA = heredado de la oferta
            // aceptada (aún sin CEE); null = sin datos para calcular.
            origen_cifra: f.estimadoGuardado ? 'PROPUESTA' : (f.savingsKwh != null ? 'CEE' : null),
            // El mismo presupuesto con el que calcula la economía (finArgs.presupuesto).
            inversion: r2(inst.economico_override?.presupuesto ?? (parseFloat(inst.presupuesto_final)
                || parseFloat(exp.oportunidades?.datos_calculo?.inputs?.presupuesto || exp.oportunidades?.datos_calculo?.inputs?.importe_total) || null)),
            inversion_verificada: r2(inst.verificacion?.inversion_verificada_eur),
            lote: lote ? { codigo: lote.codigo, estado: lote.estado } : null,
            factura_so: fac?.numero ? {
                numero: fac.numero, fecha: fac.fecha, estado: fac.estado, cobrada: fac.fecha_cobro || null,
                kwh_lote: kwh(fac.unidades_kwh), precio_mwh: precioMwh, base_lote: r2(fac.base), total_lote: r2(fac.total),
                parte_expediente_base: parte,
            } : null,
        };
    });
}

/** La economía de UN expediente por su número (o un trozo inequívoco). */
async function expediente(numero) {
    const q = String(numero || '').replace(/\s/g, '');
    if (!q) throw error('Falta el número de expediente.');
    // Dos pasos (como findExpediente del MCP): el ilike sin JSONB, luego la fila.
    const { data: hits, error: e } = await supabase.from('expedientes').select('id, numero_expediente').ilike('numero_expediente', `%${q}%`).limit(20);
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
    if (!hits?.length) return { found: false, message: `No encontrado: "${numero}"` };
    const exacto = hits.find(h => h.numero_expediente.toUpperCase() === q.toUpperCase());
    if (!exacto && hits.length > 1) return { found: false, ambiguous: hits.map(h => h.numero_expediente), message: 'Hay varios; indica el número completo.' };
    const { data: fila, error: e2 } = await supabase.from('expedientes').select(SELECT_EXP).eq('id', (exacto || hits[0]).id).single();
    if (e2) throw error(`No se pudo leer la BD: ${e2.message}`, 503);
    const [eco] = await economiaDe([fila]);
    return { found: true, economia: eco };
}

function acumula(g, e) {
    g.n++;
    const sum = (k, v) => { if (v != null) g[k] = r2((g[k] || 0) + v); };
    sum('ahorro_kwh', e.ahorro_kwh);
    sum('bono_cliente', e.bono_cliente);
    sum('beneficio_brokergy', e.beneficio_brokergy);
    sum('inversion', e.inversion);
    if (e.ahorro_verificado_kwh != null) { g.n_verificados++; sum('ahorro_verificado_kwh', e.ahorro_verificado_kwh); }
    if (e.origen_cifra === 'PROPUESTA') g.n_cifra_de_propuesta++;
    if (e.origen_cifra == null) g.n_sin_cifra++;
}
const grupo = () => ({ n: 0, ahorro_kwh: 0, bono_cliente: 0, beneficio_brokergy: 0, inversion: 0, n_verificados: 0, ahorro_verificado_kwh: 0, n_cifra_de_propuesta: 0, n_sin_cifra: 0 });
const conMwh = (g) => ({ ...g, ahorro_mwh: r2(g.ahorro_kwh / 1000), ahorro_verificado_mwh: r2(g.ahorro_verificado_kwh / 1000) });

/**
 * El VOLUMEN de la cartera CAE: totales, por ficha, por año de alta y por estado.
 * Sin los RECHAZADOS (como el cuadro de mando), salvo que se pidan.
 */
async function volumen({ anio = null, ficha = null, conRechazados = false, detalle = false } = {}) {
    let q = supabase.from('expedientes').select(SELECT_EXP).order('numero_expediente').limit(5000);
    if (!conRechazados) q = q.or(`estado.is.null,estado.neq.${ESTADO_RECHAZADO}`);
    if (anio) q = q.gte('created_at', `${anio}-01-01`).lt('created_at', `${Number(anio) + 1}-01-01`);
    if (ficha) q = q.ilike('numero_expediente', `%${ficha}%`);
    const { data, error: e } = await q;
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
    const ecos = await economiaDe(data || []);

    const total = grupo();
    const porFicha = {}, porAnio = {}, porEstado = {};
    for (const x of ecos) {
        acumula(total, x);
        acumula(porFicha[x.ficha] ||= grupo(), x);
        acumula(porAnio[(x.alta || '????').slice(0, 4)] ||= grupo(), x);
        acumula(porEstado[x.estado || 'SIN ESTADO'] ||= grupo(), x);
    }
    const map = (o) => Object.fromEntries(Object.entries(o).map(([k, g]) => [k, conMwh(g)]));
    return {
        filtro: { anio, ficha, con_rechazados: !!conRechazados },
        total: conMwh(total),
        por_ficha: map(porFicha),
        por_anio_alta: map(porAnio),
        por_estado: map(porEstado),
        notas: [
            'ahorro_kwh / bono_cliente / beneficio_brokergy son ESTIMADOS: con CEE se recalculan con el certificado; sin él, los de la propuesta aceptada (n_cifra_de_propuesta).',
            'Lo VERIFICADO (n_verificados, ahorro_verificado_kwh) es lo que da por bueno el verificador y sobre lo que se factura al S.O.',
            'Lo facturado al S.O. está en listar_facturas con serie CAE.',
        ],
        expedientes: detalle ? ecos : undefined,
    };
}

module.exports = { expediente, volumen, economiaDe, SELECT_EXP };
