// ============================================================
// loteService.js — Lógica de negocio de los LOTES de expedientes
//
// Un lote agrupa expedientes (máx. 5 recomendado) para enviarlos en bloque
// a un Sujeto Obligado y un Verificador. Reglas:
//   • SO y Verificador viven en el lote (no en el expediente).
//   • Agrupación OBLIGATORIA: mismo año de actuación + misma CCAA de instalación.
//   • Un expediente sin CIFO (sin año) no se puede lotear.
//   • La membresía solo se edita mientras el lote está en BORRADOR.
// ============================================================

const supabase = require('./supabaseClient');
const geoCcaa = require('./geoCcaa');

const MAX_RECOMENDADO = 5;

// Solo se pueden lotear expedientes COMPLETOS (documentación cerrada).
// El resto de estados (PENDIENTE REVISAR EXPTE, PTE. FIN OBRA, etc.) NO son elegibles
// aunque tengan fecha de CIFO.
const ESTADOS_COMPLETO = ['DOC. COMPLETA'];

// Estados del LOTE (fase verificación → CAE → pago). Los expedientes del lote
// avanzan en bloque; un requerimiento puede marcar un expediente concreto vía
// el módulo de incidencias. (La lista canónica se consolida en el Slice 5.)
const LOTE_ESTADOS = [
    'BORRADOR',
    'SOLICITADO PRESUPUESTO A VERIFICADOR',
    'ENVIADO A VERIFICADOR',
    'REQUERIMIENTO VERIFICADOR',
    'PTE. SUBIDA MITECO',
    'REQUERIMIENTO G.A.',
    'CAE EMITIDO – PTE PAGO BROKERGY',
    'PTE. PAGO BROKERGY A CLIENTE',
    'FINALIZADO',
];

// Instalador asociado al expediente (para la recomendación "mismo instalador").
function getInstaladorId(exp, op) {
    return (exp && exp.instalador_asociado_id)
        || (exp && exp.instalacion && exp.instalacion.instalador_id)
        || (op && op.instalador_asociado_id)
        || (op && op.prescriptor_id)
        || null;
}

// Carga un expediente con su cliente y oportunidad, y deriva año + CCAA + instalador.
async function loadExpedienteContext(expedienteId) {
    const { data: exp, error } = await supabase
        .from('expedientes').select('*').eq('id', expedienteId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!exp) return null;

    const [cliRes, opRes] = await Promise.all([
        exp.cliente_id
            ? supabase.from('clientes')
                .select('id_cliente, provincia, ccaa, nombre_razon_social, apellidos')
                .eq('id_cliente', exp.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
        exp.oportunidad_id
            ? supabase.from('oportunidades')
                .select('id, datos_calculo, prescriptor_id, instalador_asociado_id')
                .eq('id', exp.oportunidad_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    const cliente = cliRes.data;
    const op = opRes.data;

    return {
        exp,
        cliente,
        op,
        anio: geoCcaa.resolveAnioActuacion(exp),
        ccaa: geoCcaa.resolveCcaaInstalacion(exp, cliente, op),
        instaladorId: getInstaladorId(exp, op),
    };
}

// Comprueba que un expediente PUEDE entrar en algún lote (reglas duras
// independientes del lote concreto). Devuelve { ok, motivo? }.
function evaluarElegibilidadBase(ctx) {
    if (!ctx) return { ok: false, motivo: 'Expediente no encontrado' };
    if (ctx.exp.lote_id) return { ok: false, motivo: 'El expediente ya está asignado a un lote' };
    if (!ESTADOS_COMPLETO.includes(ctx.exp.estado)) return { ok: false, motivo: `Solo se pueden lotear expedientes completos (DOC. COMPLETA). Este está en "${ctx.exp.estado}"` };
    if (ctx.anio == null) return { ok: false, motivo: 'El expediente no tiene CIFO (fecha fin) → sin año de actuación, no se puede lotear' };
    if (!ctx.ccaa) return { ok: false, motivo: 'No se puede determinar la CCAA de la instalación del expediente' };
    return { ok: true };
}

// Comprueba que un expediente CASA con las claves de un lote (mismo año + CCAA).
// loteAnio / loteCcaa pueden ser null si el lote aún no tiene claves fijadas.
function casaConLote(ctx, loteAnio, loteCcaa) {
    if (loteAnio == null && loteCcaa == null) return { ok: true }; // lote vacío: fija claves con este
    if (ctx.anio !== loteAnio) {
        return { ok: false, motivo: `El año de actuación del expediente (${ctx.anio}) no coincide con el del lote (${loteAnio})` };
    }
    if (geoCcaa.norm(ctx.ccaa) !== geoCcaa.norm(loteCcaa)) {
        return { ok: false, motivo: `La CCAA del expediente (${ctx.ccaa}) no coincide con la del lote (${loteCcaa})` };
    }
    return { ok: true };
}

// Genera el siguiente código LOTE-{anio}-NNN.
async function nextLoteCodigo(anio) {
    const prefix = `LOTE-${anio}-`;
    const { data: rows, error } = await supabase
        .from('lotes').select('codigo').like('codigo', `${prefix}%`);
    if (error) throw new Error(error.message);
    let max = 0;
    for (const r of (rows || [])) {
        const n = parseInt(String(r.codigo || '').slice(prefix.length), 10);
        if (!Number.isNaN(n) && n > max) max = n;
    }
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// Busca expedientes del MISMO instalador, elegibles (con CIFO del mismo año +
// misma CCAA), sin lote, que NO estén ya en este lote → recomendación blanda.
async function sugerirMismoInstalador({ instaladorId, anio, ccaa, excludeIds = [] }) {
    if (!instaladorId || anio == null || !ccaa) return [];

    const { data: rows } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, estado, instalador_asociado_id, instalacion, documentacion, cliente_id, oportunidad_id')
        .is('lote_id', null);
    if (!rows) return [];

    // Prefiltro barato (sin más consultas): completo + mismo instalador + mismo año.
    const pre = [];
    for (const r of rows) {
        if (excludeIds.includes(r.id)) continue;
        if (!ESTADOS_COMPLETO.includes(r.estado)) continue;
        const inst = r.instalador_asociado_id || (r.instalacion && r.instalacion.instalador_id) || null;
        if (String(inst || '') !== String(instaladorId)) continue;
        if (geoCcaa.resolveAnioActuacion(r) !== anio) continue;
        pre.push(r);
    }
    if (!pre.length) return [];

    // Batch: cargar oportunidades y clientes de los precandidatos para resolver la CCAA real.
    const opIds = [...new Set(pre.map(r => r.oportunidad_id).filter(Boolean))];
    const cliIds = [...new Set(pre.map(r => r.cliente_id).filter(Boolean))];
    const [opsRes, clisRes] = await Promise.all([
        opIds.length ? supabase.from('oportunidades').select('id, datos_calculo').in('id', opIds) : Promise.resolve({ data: [] }),
        cliIds.length ? supabase.from('clientes').select('id_cliente, provincia, ccaa').in('id_cliente', cliIds) : Promise.resolve({ data: [] }),
    ]);
    const opMap = new Map((opsRes.data || []).map(o => [o.id, o]));
    const cliMap = new Map((clisRes.data || []).map(c => [c.id_cliente, c]));

    const target = geoCcaa.norm(ccaa);
    const out = [];
    for (const r of pre) {
        const rCcaa = geoCcaa.resolveCcaaInstalacion(r, cliMap.get(r.cliente_id), opMap.get(r.oportunidad_id));
        if (rCcaa && geoCcaa.norm(rCcaa) === target) {
            out.push({ id: r.id, numero_expediente: r.numero_expediente });
        }
    }
    return out;
}

module.exports = {
    MAX_RECOMENDADO,
    ESTADOS_COMPLETO,
    LOTE_ESTADOS,
    getInstaladorId,
    loadExpedienteContext,
    evaluarElegibilidadBase,
    casaConLote,
    nextLoteCodigo,
    sugerirMismoInstalador,
};
