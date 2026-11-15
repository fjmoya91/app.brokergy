// ============================================================================
// estudioPrecios.js — A cuánto se cobra cada partida en las facturas de obra
// (03/11/2026, Fran: «saber a qué precio se están cobrando las placas solares»).
// ----------------------------------------------------------------------------
// Las facturas de obra se registran ENTERAS aunque una parte no compute para el
// CAE (regla 189, logic/facturasCae.js): de `documentacion.facturas[].desglose`
// sale una fila por partida con su importe y, en la fotovoltaica, sus kWp. Aquí se
// juntan las de todos los expedientes para estudiar el precio (€/kWp en las placas)
// por instalador y por fecha. Solo LEE.
//
// REGLA — lo que se estudia es la partida, computara o no para el CAE: la placa de
// un RES060 queda fuera del expediente y es justo la que interesa.
// REGLA — una factura SIN desglose cuenta solo si el OCR la dejó en UNA partida
// (`partidas: ['FOTOVOLTAICA']`): entonces es entera de esa partida. Si no, no se
// sabe qué parte es y no se inventa.
// REGLA — los listados no traen un JSONB entero (regla 22): de `documentacion`,
// solo `facturas`.
// ============================================================================
const supabase = require('./supabaseClient');

const error = (msg, status = 400) => Object.assign(new Error(msg), { status });
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const LOTE = 100; // .in() por lotes: una lista larga de uuid revienta las cabeceras

const PARTIDAS = ['FOTOVOLTAICA', 'AEROTERMIA', 'ACS', 'EMISORES', 'VENTANAS', 'CUBIERTA', 'FACHADA', 'SUELO'];

/** Las filas de UNA factura para esa partida (vacío si no la lleva o no se puede saber). */
function filasDeFactura(f, partida) {
    if (!f) return [];
    const base = num(f.importe_sin_iva);
    const desglose = Array.isArray(f.desglose) ? f.desglose : [];
    if (desglose.length) {
        return desglose
            .filter(d => d && String(d.partida || '').toUpperCase() === partida && num(d.importe) > 0)
            .map(d => ({
                importe: r2(num(d.importe)),
                kwp: num(d.kwp) > 0 ? num(d.kwp) : null,
                computa: f.computa_cae !== false && d.computa !== false,
                origen: d.manual ? 'MANUAL' : 'DESGLOSE',
            }));
    }
    const partidas = (Array.isArray(f.partidas) ? f.partidas : []).map(p => String(p).toUpperCase());
    if (partidas.length === 1 && partidas[0] === partida && base > 0) {
        return [{ importe: r2(base), kwp: num(f.kwp) > 0 ? num(f.kwp) : null, computa: f.computa_cae !== false, origen: 'FACTURA' }];
    }
    return [];
}

/** El nombre de una empresa sin puntuación, paréntesis ni la forma jurídica, para agrupar. */
function nombreClave(s) {
    return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\(.*?\)/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim()
        .replace(/(\s+(S\s?L\s?U?|S\s?A\s?U?|S\s?L\s?L|S\s?COOP|C\s?B))+$/, '').replace(/\s+/g, '');
}

function mediana(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Resumen de un conjunto de filas: lo de €/kWp solo con las que traen kWp. */
function resumen(filas) {
    const conKwp = filas.filter(f => f.eur_kwp != null);
    const kwp = conKwp.reduce((s, f) => s + f.kwp, 0);
    const imp = conKwp.reduce((s, f) => s + f.importe, 0);
    return {
        n: filas.length,
        n_con_kwp: conKwp.length,
        importe: r2(filas.reduce((s, f) => s + f.importe, 0)),
        kwp: r2(kwp),
        eur_kwp_mediana: conKwp.length ? Math.round(mediana(conKwp.map(f => f.eur_kwp))) : null,
        // Ponderado por potencia: lo que se paga de media por cada kWp instalado.
        eur_kwp_medio: kwp > 0 ? Math.round(imp / kwp) : null,
        eur_kwp_min: conKwp.length ? Math.min(...conKwp.map(f => f.eur_kwp)) : null,
        eur_kwp_max: conKwp.length ? Math.max(...conKwp.map(f => f.eur_kwp)) : null,
    };
}

async function porLotes(ids, fn) {
    const out = [];
    for (let i = 0; i < ids.length; i += LOTE) {
        const { data, error: e } = await fn(ids.slice(i, i + LOTE));
        if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
        out.push(...(data || []));
    }
    return out;
}

/**
 * Las filas de una partida en todas las facturas de obra, con su resumen total y
 * por instalador (el EMISOR de la factura; si no se leyó, el instalador del expediente).
 */
async function estudio({ partida = 'FOTOVOLTAICA', desde = null, hasta = null } = {}) {
    const p = String(partida || '').toUpperCase();
    if (!PARTIDAS.includes(p)) throw error(`Partida no válida: ${partida}`);

    const { data: exps, error: e } = await supabase.from('expedientes')
        .select('id, numero_expediente, instalador_asociado_id, facturas:documentacion->facturas')
        .not('documentacion->facturas', 'is', null)
        .order('numero_expediente')
        .limit(5000);
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);

    const filas = [];
    for (const x of exps || []) {
        (Array.isArray(x.facturas) ? x.facturas : []).forEach((f, idx) => {
            const fecha = f?.fecha_factura || f?.fecha || null;
            if (desde && (!fecha || fecha < desde)) return;
            if (hasta && (!fecha || fecha > hasta)) return;
            for (const r of filasDeFactura(f, p)) {
                filas.push({
                    expediente_id: x.id,
                    numero_expediente: x.numero_expediente,
                    instalador_id: x.instalador_asociado_id || null,
                    factura_idx: idx,
                    numero_factura: f.numero_factura || f.numero || null,
                    fecha,
                    emisor: String(f.emisor_nombre || f.emisor || f.proveedor || '').trim() || null,
                    emisor_nif: f.emisor_nif || null,
                    base_factura: r2(num(f.importe_sin_iva)),
                    ...r,
                    eur_kwp: r.kwp ? Math.round(r.importe / r.kwp) : null,
                });
            }
        });
    }

    // Sin emisor leído, el instalador del expediente (el que factura casi siempre).
    const sinEmisor = [...new Set(filas.filter(f => !f.emisor && f.instalador_id).map(f => f.instalador_id))];
    if (sinEmisor.length) {
        const pres = await porLotes(sinEmisor, ids => supabase.from('prescriptores').select('id_empresa, razon_social').in('id_empresa', ids));
        const nombre = new Map(pres.map(r => [r.id_empresa, r.razon_social]));
        filas.forEach(f => { if (!f.emisor && nombre.get(f.instalador_id)) { f.emisor = nombre.get(f.instalador_id); f.emisor_de_ficha = true; } });
    }

    filas.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

    // Por instalador: el mismo emisor llega escrito de varias maneras («… S.L.», «… SL»,
    // «… (ISM)», con y sin NIF). Manda el NIF; sin él, el nombre normalizado, y si ese
    // nombre tiene NIF en otra factura, se junta con ella.
    const nif = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const grupos = new Map();
    const nifDeNombre = new Map();
    filas.forEach(f => { if (f.emisor_nif && f.emisor) nifDeNombre.set(nombreClave(f.emisor), nif(f.emisor_nif)); });
    for (const f of filas) {
        const clave = (f.emisor_nif && nif(f.emisor_nif)) || nifDeNombre.get(nombreClave(f.emisor)) || nombreClave(f.emisor) || 'SIN EMISOR';
        if (!grupos.has(clave)) grupos.set(clave, { emisor: f.emisor || 'Sin emisor', emisor_nif: f.emisor_nif, filas: [] });
        grupos.get(clave).filas.push(f);
    }
    const porInstalador = [...grupos.values()]
        .map(g => ({ emisor: g.emisor, emisor_nif: g.emisor_nif, ...resumen(g.filas), ultima: g.filas[0]?.fecha || null }))
        .sort((a, b) => b.n - a.n || String(a.emisor).localeCompare(String(b.emisor)));

    return { partida: p, partidas: PARTIDAS, total: resumen(filas), por_instalador: porInstalador, filas };
}

module.exports = { estudio, filasDeFactura, resumen, nombreClave, PARTIDAS };
