// ─── Cuadro de mando de DIRECCIÓN (pestaña «Cuadro de mando», solo ADMIN) ──────
//
// El cerebro de la empresa en una pantalla: el NEGOCIO (CAE de punta a punta,
// CEE directos, ingeniería) y las FINANZAS (cuenta de resultados con EBITDA,
// caja y circulante, salud y previsión). Doc: docs/conocimiento/cuadro-mando/.
//
// Dos bloques, dos rutas, cada uno con su caché en memoria:
//   negocio()        ~2 s  — expedientes (la MISMA RPC del listado), captación,
//                            lotes con su dinero, bonos pagados, CEE directos.
//   finanzas(anio)   ~9 s en frío — contabilidadService.cuadro (lo que pinta
//                            Facturación) + los gastos de Drive del año, y encima
//                            la cuenta de resultados, la salud y la previsión.
//
// Las cuentas por expediente NO se rehacen aquí: se importan del frontend
// (dashboardAgg.buildRow, loteEco) para que el cuadro, la pestaña de Lotes y la
// ficha del expediente digan lo mismo. Si un número cambia, cambia en un sitio.
//
// Nada de esto escribe: solo lee Supabase y Drive.

const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const conta = require('./contabilidadService');
const libroContable = require('./libroContable');

const FRONT = path.join(__dirname, '../../frontend/src/features');
let _mods = null;
const mods = () => (_mods ||= Promise.all([
    import(pathToFileURL(path.join(FRONT, 'dashboard/logic/dashboardAgg.js')).href),
    import(pathToFileURL(path.join(FRONT, 'lotes/logic/loteEco.js')).href),
    import(pathToFileURL(path.join(FRONT, 'expedientes/logic/expedienteFinancials.js')).href),
]).then(([agg, eco, fin]) => ({ agg, eco, fin })));

// ─── utilidades ──────────────────────────────────────────────────────────────
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r0 = (n) => Math.round(Number(n) || 0);
const n0 = (v) => (v == null || v === '' || isNaN(Number(v))) ? 0 : Number(v);
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

/** dd/mm/aaaa (o ISO) → aaaa-mm-dd; null si no se entiende. */
function isoDe(f) {
    if (!f) return null;
    const s = String(f).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
}
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Error de BD: la ruta lo convierte en 503 (regla 38: nunca una cifra a cero). */
class BdCaida extends Error {
    constructor(que, causa) { super(`${que}: ${causa?.message || causa}`); this.status = 503; }
}
async function q(que, promesa) {
    const { data, error } = await promesa;
    if (error) throw new BdCaida(que, error);
    return data || [];
}

// El guion del estado de lote/expediente a veces llega corto: se compara normalizado.
const normEstado = (e) => String(e || '').toUpperCase().replace(/[‒–—−]/g, '-').replace(/\s+/g, ' ').trim();

// ─── Etapas del lote, en palabras de Fran ────────────────────────────────────
// Hasta el CAE emitido manda el estado del lote; desde ahí mandan los HECHOS del
// dinero (factura emitida, cobrada, bonos transferidos), que no mueven el estado.
const ETAPAS_LOTE = [
    { id: 'PREPARACION', label: 'En preparación', desc: 'Armándose o pendiente de la firma del S.O. y la oferta del verificador' },
    { id: 'VERIFICADOR', label: 'En el verificador', desc: 'Enviados a verificar: «las enviadas»' },
    { id: 'MITECO', label: 'En el Ministerio', desc: 'Verificados y presentados al MITECO / Gestor Autonómico' },
    { id: 'POR_FACTURAR', label: 'CAE emitido, por facturar', desc: 'Certificado emitido y la factura al S.O. sin hacer' },
    { id: 'POR_COBRAR', label: 'Facturado, por cobrar', desc: 'Factura al S.O. emitida y sin cobrar' },
    { id: 'POR_PAGAR', label: 'Cobrado, bonos por pagar', desc: 'El S.O. ha pagado; quedan bonos de clientes por transferir' },
    { id: 'CERRADO', label: 'Cerrado', desc: 'Cobrado y bonos pagados' },
];
const PREPARACION = ['BORRADOR', 'SOLICITADO PRESUPUESTO A VERIFICADOR', 'PTE. FIRMA S.O.', 'PTE. OFERTA VERIFICADOR', 'PTE. FIRMA OFERTA S.O.'];
const VERIFICADOR = ['ENVIADO A VERIFICADOR', 'REQUERIMIENTO VERIFICADOR', 'VERIFICADO'];
const MITECO = ['PTE. SUBIDA MITECO', 'SUBIDO A MITECO', 'REQUERIMIENTO G.A.'];

function etapaLote(estado, factura, bonosPendientes) {
    const e = normEstado(estado);
    if (PREPARACION.includes(e)) return 'PREPARACION';
    if (VERIFICADOR.includes(e)) return 'VERIFICADOR';
    if (MITECO.includes(e)) return 'MITECO';
    if (e === 'FINALIZADO') return 'CERRADO';
    // «PTE. PAGO BROKERGY A CLIENTE» ya dice que el S.O. ha pagado, haya o no
    // fila en facturas_so (los PRE APP se vendieron por autofactura o por Drive).
    const pagoSo = e === 'PTE. PAGO BROKERGY A CLIENTE';
    const facturada = pagoSo || (!!factura?.numero && factura.estado !== 'BORRADOR');
    const cobrada = pagoSo || factura?.estado === 'PAGADA' || !!factura?.fecha_cobro;
    if (!facturada) return 'POR_FACTURAR';
    if (!cobrada) return 'POR_COBRAR';
    return bonosPendientes > 0.5 ? 'POR_PAGAR' : 'CERRADO';
}

// ─── Caché ───────────────────────────────────────────────────────────────────
const TTL_NEGOCIO = 5 * 60 * 1000;
const TTL_FINANZAS = 10 * 60 * 1000;
const cache = new Map();   // clave → { t, p (promesa) }
function conCache(clave, ttl, forzar, fn) {
    const c = cache.get(clave);
    if (!forzar && c && Date.now() - c.t < ttl) return c.p;
    const p = fn().catch((e) => { cache.delete(clave); throw e; });
    cache.set(clave, { t: Date.now(), p });
    return p;
}

// ════════════════════════════════════════════════════════════════════════════
// NEGOCIO
// ════════════════════════════════════════════════════════════════════════════
const ESTADOS_CAPTACION = ['LEAD', 'PTE ENVIAR', 'EN CURSO', 'ENVIADA', 'PRE-ACEPTADO'];

async function calcularNegocio() {
    const { agg, eco, fin } = await mods();
    const hoy = hoyMadrid();
    const anioHoy = Number(hoy.slice(0, 4));

    const [rpc, opsTodas, opsVivas, lotes, facturasSo, cobrosExp, prescriptores, ceeDir, factIng] = await Promise.all([
        q('expedientes', supabase.rpc('get_expedientes_list_v4')),
        q('oportunidades', supabase.from('oportunidades').select('id, created_at, estado:datos_calculo->>estado, origen:datos_calculo->>origen')),
        q('captación', supabase.from('oportunidades')
            .select(`id, id_oportunidad, referencia_cliente, ficha, prescriptor_id, instalador_asociado_id, created_at,
                     estado:datos_calculo->>estado, origen:datos_calculo->>origen,
                     provincia:datos_calculo->inputs->>provincia, cae_so_rate:datos_calculo->inputs->>cae_so_rate,
                     financials:datos_calculo->result->financials, savings:datos_calculo->result->savings`)
            .in('datos_calculo->>estado', ESTADOS_CAPTACION)),
        q('lotes', supabase.from('lotes').select('id, codigo, estado, sujeto_obligado_id, verificador_id, anio_actuacion, ccaa, oferta_lote, coste_verificacion, fecha_envio_verificador, fecha_cae, created_at, updated_at')),
        q('facturas_so', supabase.from('facturas_so').select('lote_id, numero, fecha, vencimiento, fecha_cobro, estado, base, iva, total, unidades_kwh, precio_kwh')),
        // Solo el pago del bono: `documentacion->cobro` son metadatos pequeños.
        q('cobros', supabase.from('expedientes').select('id, lote_id, cobro:documentacion->cobro').not('lote_id', 'is', null)),
        q('prescriptores', supabase.from('prescriptores').select('id_empresa, razon_social, acronimo, tipo_empresa, cif')),
        q('cee_directos', supabase.from('cee_directos').select(`id, numero_expediente, anio, estado, alcance, origen, cobrado, cobrado_at, created_at, prescriptor_id, duplicado_historico,
            oferta_total:documentacion->oferta->>total, oferta_neto:documentacion->oferta->>neto, oferta_precio:documentacion->oferta->>precio,
            fact_cert:documentacion->fact_cert, registro_ini:documentacion->>fecha_registro_cee_inicial, facturas_ficha:documentacion->facturas_emitidas`)),
        // Las facturas de la serie ING del año y el anterior: las de AppSheet (los CEE
        // de antes de la app) no están enlazadas a su CEE directo, así que lo facturado
        // y lo pendiente de cobro de los CEE se cuentan aquí, no en la ficha.
        q('facturas ING', supabase.from('facturas_emitidas').select('id, numero, fecha, fecha_pago, estado, neto, iva, total, origen, cee_directo_id').eq('serie', 'ING').gte('fecha', `${anioHoy - 1}-01-01`)),
    ]);

    // ── Expedientes ──────────────────────────────────────────────────────────
    const nTotalExp = rpc.length;
    const rechazados = rpc.filter(e => normEstado(e.estado) === 'RECHAZADO');
    const vivos = rpc.filter(e => normEstado(e.estado) !== 'RECHAZADO');
    const filas = [];
    const rawPorLote = new Map();
    for (const e of vivos) {
        let fila;
        try { fila = agg.buildRow(e); } catch (err) {
            fila = { id: e.id, numero: e.numero_expediente || '—', cliente: '—', estado: e.estado, faseId: 'CEE_INICIAL', estadoReconocido: false, mwh: 0, cae: 0, profit: null, precioSOGuardado: agg.PRECIO_SO_DEFAULT, sinEconomia: true, errorCalculo: true };
        }
        fila.loteId = e.lote_id || null;
        fila.loteCodigo = e.lote?.codigo || null;
        filas.push(fila);
        if (e.lote_id) (rawPorLote.get(e.lote_id) || rawPorLote.set(e.lote_id, []).get(e.lote_id)).push(e);
    }
    const filaPorId = new Map(filas.map(f => [String(f.id), f]));

    // Lo que el verificador deja del ahorro estimado (medido en los que ya tienen las dos cifras).
    let kwhEst = 0, kwhVer = 0, nVer = 0;
    for (const e of vivos) {
        const v = Number(e.instalacion?.verificacion?.ahorro_verificado_kwh);
        if (!(v > 0)) continue;
        try {
            const f = fin.computeExpedienteFinancials(e);
            if (f.savingsKwh > 0 && f.savingsKwhVerificado > 0) { kwhEst += f.savingsKwh; kwhVer += f.savingsKwhVerificado; nVer++; }
        } catch { /* sin cálculo, no cuenta */ }
    }
    const ratioVerificado = nVer >= 5 && kwhEst > 0 ? Math.min(1.1, kwhVer / kwhEst) : null;

    // ── Captación ────────────────────────────────────────────────────────────
    const idsOpConExp = new Set(rpc.map(e => e.oportunidad_id).filter(Boolean).map(String));
    const captacion = opsVivas
        .filter(o => o.origen !== 'migracion_xml')
        .map(o => ({
            id: o.id, id_oportunidad: o.id_oportunidad, referencia_cliente: o.referencia_cliente, ficha: o.ficha,
            prescriptor_id: o.prescriptor_id, instalador_asociado_id: o.instalador_asociado_id, created_at: o.created_at,
            datos_calculo: { estado: o.estado, inputs: { provincia: o.provincia, cae_so_rate: o.cae_so_rate }, result: { financials: o.financials || {}, savings: o.savings || {} } },
        }))
        .filter(o => agg.esCaptacionViva(o, idsOpConExp))
        .map(agg.buildRowOportunidad);

    // Conversión histórica: de las oportunidades de hace entre 2 y 14 meses (ya
    // con tiempo de decidirse), cuántas acabaron en expediente.
    const reales = opsTodas.filter(o => o.origen !== 'migracion_xml');
    // Y por ANTIGÜEDAD: una propuesta enviada hace 6 meses sin respuesta no vale lo
    // que una de la semana pasada. Para cada tramo de edad A: de las oportunidades
    // observadas al menos A+60 días que seguían sin convertir a los A días, cuántas
    // acabaron convirtiendo. La fecha de conversión es el alta del expediente.
    const altaExpDeOp = new Map();
    for (const e of rpc) if (e.oportunidad_id && e.created_at) {
        const k = String(e.oportunidad_id), prev = altaExpDeOp.get(k);
        if (!prev || e.created_at < prev) altaExpDeOp.set(k, e.created_at);
    }
    const ahora = Date.now();
    const edad = (o) => (ahora - Date.parse(o.created_at)) / 86400000;
    const retraso = (o) => {
        const alta = altaExpDeOp.get(String(o.id));
        if (alta) return Math.max(0, (Date.parse(alta) - Date.parse(o.created_at)) / 86400000);
        return normEstado(o.estado) === 'ACEPTADA' ? 0 : null;   // aceptada sin expediente: convertida, fecha desconocida
    };
    const TRAMOS_EDAD = [0, 30, 90, 180];
    const convPorEdad = TRAMOS_EDAD.map((A) => {
        const den = reales.filter(o => o.created_at && edad(o) >= A + 60).filter(o => { const d = retraso(o); return d == null || d >= A; });
        const num = den.filter(o => retraso(o) != null).length;
        return { desde: A, n: den.length, convertidas: num, tasa: den.length >= 10 ? num / den.length : null };
    });
    const probDeEdad = (dias) => {
        let t = null;
        for (const c of convPorEdad) if (dias >= c.desde && c.tasa != null) t = c.tasa;
        return t;
    };
    for (const c of captacion) {
        const d = c.diasSinMovimiento ?? 0;
        c.probConversion = probDeEdad(d);
    }
    const desdeConv = new Date(Date.now() - 425 * 86400000).toISOString();
    const hastaConv = new Date(Date.now() - 60 * 86400000).toISOString();
    const cohorte = reales.filter(o => o.created_at >= desdeConv && o.created_at <= hastaConv);
    const convertidas = cohorte.filter(o => idsOpConExp.has(String(o.id)) || normEstado(o.estado) === 'ACEPTADA').length;
    const conversion = cohorte.length >= 10 ? convertidas / cohorte.length : null;
    const opsPorEstado = {};
    for (const o of reales) { const k = normEstado(o.estado) || 'PTE ENVIAR'; opsPorEstado[k] = (opsPorEstado[k] || 0) + 1; }
    const altasOpMes = Array(12).fill(0);
    for (const o of reales) if (String(o.created_at || '').startsWith(String(anioHoy))) altasOpMes[Number(o.created_at.slice(5, 7)) - 1]++;

    // Tasa de rechazo de expedientes (sobre todos los que han llegado a serlo).
    const tasaRechazo = nTotalExp ? rechazados.length / nTotalExp : 0;

    // ── Nombres de partners (instaladores, certificadores, S.O.) ─────────────
    const nombreDe = new Map(prescriptores.map(p => [String(p.id_empresa), p.acronimo || p.razon_social || '—']));
    const usados = new Set();
    for (const f of [...filas, ...captacion]) { if (f.instaladorId) usados.add(f.instaladorId); if (f.certificadorId) usados.add(f.certificadorId); }
    for (const l of lotes) { if (l.sujeto_obligado_id) usados.add(String(l.sujeto_obligado_id)); }
    const nombres = {};
    for (const id of usados) nombres[id] = nombreDe.get(id) || '—';

    // ── Lotes con su dinero ──────────────────────────────────────────────────
    const facturaDe = new Map(facturasSo.map(f => [f.lote_id, f]));
    const pagadoExp = new Map();   // id expediente → importe transferido
    for (const c of cobrosExp) {
        const t = c.cobro?.transferencia;
        if (t?.at) pagadoExp.set(String(c.id), t.importe != null ? n0(t.importe) : null);
    }
    const lotesOut = [];
    for (const l of lotes) {
        const raw = rawPorLote.get(l.id) || [];
        const filasLote = raw.map(e => filaPorId.get(String(e.id))).filter(Boolean);
        const factura = facturaDe.get(l.id) || null;
        const ecoL = eco.computeLoteEco({ ...l, expedientes_eco: raw });
        const cobro = eco.totalCobroSo({ ...l, factura_so: factura }, ecoL);
        // Precio al que se vende de verdad: el de la factura; si no, la oferta del lote.
        const precio = cobro?.precioMwh ?? (l.oferta_lote != null && l.oferta_lote !== '' ? Number(l.oferta_lote) : null);
        // Pendiente = los bonos de los expedientes SIN transferencia (el importe
        // transferido puede no coincidir al céntimo con el calculado).
        let bonos = 0, bonosPagados = 0, bonosPendientes = 0, nPagados = 0, margen = 0, sinMargen = 0, mwh = 0;
        for (const f of filasLote) {
            bonos += f.cae || 0;
            mwh += f.mwh || 0;
            if (pagadoExp.has(String(f.id))) { nPagados++; bonosPagados += pagadoExp.get(String(f.id)) ?? (f.cae || 0); }
            else bonosPendientes += f.cae || 0;
            const rp = agg.repricearFila(f, precio ?? f.precioSOGuardado);
            if (rp.profit == null) sinMargen++; else margen += rp.profit;
        }
        const etapa = etapaLote(l.estado, factura, bonosPendientes);
        const preApp = /PRE\s*APP/i.test(l.codigo || '');
        // Fecha en que se VENDIÓ (para la cuenta de resultados del año).
        const fechaVenta = isoDe(factura?.fecha) || (['POR_COBRAR', 'POR_PAGAR', 'CERRADO'].includes(etapa) ? isoDe(l.fecha_cae) : null);
        const base = cobro?.base ?? (precio != null ? mwh * precio : null);
        lotesOut.push({
            id: l.id, codigo: l.codigo, estado: l.estado, etapa, preApp,
            so: nombreDe.get(String(l.sujeto_obligado_id)) || null,
            anio: l.anio_actuacion, ccaa: l.ccaa,
            nExp: filasLote.length, mwh: r2(mwh),
            precio, fuente: cobro?.fuente || (precio != null ? 'estimado' : null),
            base: base != null ? r2(base) : null, total: cobro?.total != null ? r2(cobro.total) : (base != null ? r2(base * 1.21) : null),
            margen: r2(margen), sinMargen,
            bonos: r2(bonos), bonosPagados: r2(bonosPagados), bonosPendientes: r2(bonosPendientes), nPagados,
            fullyVerif: !!ecoL.fullyVerif,
            factura: factura ? { numero: factura.numero, estado: factura.estado, fecha: isoDe(factura.fecha), vencimiento: isoDe(factura.vencimiento), cobro: isoDe(factura.fecha_cobro) } : null,
            fechaVenta, fechaCae: isoDe(l.fecha_cae), fechaEnvioVerificador: isoDe(l.fecha_envio_verificador),
            diasEnEstado: l.updated_at ? diasEntre(l.updated_at.slice(0, 10), hoy) : null,
        });
    }
    lotesOut.sort((a, b) => ETAPAS_LOTE.findIndex(x => x.id === a.etapa) - ETAPAS_LOTE.findIndex(x => x.id === b.etapa) || String(a.codigo).localeCompare(String(b.codigo)));
    const etapas = ETAPAS_LOTE.map(et => {
        const ls = lotesOut.filter(l => l.etapa === et.id);
        return { ...et, n: ls.length, nExp: ls.reduce((a, l) => a + l.nExp, 0), mwh: r2(ls.reduce((a, l) => a + l.mwh, 0)), base: r2(ls.reduce((a, l) => a + (l.base || 0), 0)), margen: r2(ls.reduce((a, l) => a + l.margen, 0)), bonosPendientes: r2(ls.reduce((a, l) => a + l.bonosPendientes, 0)) };
    });

    // Listos para lote (sin lote todavía) y los que no pueden entrar por falta de año CIFO.
    const listos = filas.filter(f => f.faseId === 'LISTO' && !f.loteId);
    const listosSinCifo = listos.filter(f => f.tieneAnioCifo === false);

    // ── CEE directos ─────────────────────────────────────────────────────────
    const cee = resumenCeeDirectos(ceeDir.filter(c => !c.duplicado_historico), factIng, nombreDe, anioHoy, hoy);

    // ── Informes técnicos y CIT (la tercera línea, {AAAA}INF_n) ─────────────
    let informes = null;
    try {
        const E = require('../utils/informeEstados');
        const lista = await require('./informeService').listar();
        const porEstado = {};
        const porLinea = {};
        let vivos = 0, delAnio = 0, porFacturarInf = 0;
        for (const r of lista) {
            const est = E.derivar(r).estado;
            porEstado[est] = (porEstado[est] || 0) + 1;
            porLinea[r.linea || 'INF'] = (porLinea[r.linea || 'INF'] || 0) + 1;
            if (!['ENTREGADO', 'ANULADO'].includes(est)) vivos++;
            if (Number(r.anio) === anioHoy) delAnio++;
            if (est === 'PTE. FACTURA') porFacturarInf++;
        }
        informes = { total: lista.length, vivos, delAnio, porEstado, porLinea, porFacturar: porFacturarInf };
    } catch (e) {
        console.warn('[cuadroDireccion] informes:', e.message);
    }

    // ── Atención (lo del negocio; la de finanzas la añade finanzas()) ────────
    const atencion = [];
    const porFact = etapas.find(e => e.id === 'POR_FACTURAR');
    if (porFact.n) atencion.push({ tono: 'ambar', clave: 'lotes_por_facturar', texto: `${porFact.n} lote${porFact.n > 1 ? 's' : ''} con el CAE emitido sin facturar al S.O.`, importe: porFact.base, link: '?tab=lotes' });
    const porPagar = etapas.find(e => e.id === 'POR_PAGAR');
    if (porPagar.n) atencion.push({ tono: 'ambar', clave: 'bonos_por_pagar', texto: `Bonos por transferir a clientes de ${porPagar.n} lote${porPagar.n > 1 ? 's' : ''} ya cobrado${porPagar.n > 1 ? 's' : ''}`, importe: porPagar.bonosPendientes, link: '?tab=lotes' });
    if (listos.length - listosSinCifo.length >= 1) {
        const n = listos.length - listosSinCifo.length;
        atencion.push({ tono: 'gris', clave: 'listos_para_lote', texto: `${n} expediente${n > 1 ? 's' : ''} listo${n > 1 ? 's' : ''} para lote (≈ ${Math.ceil(n / 5)} lote${Math.ceil(n / 5) > 1 ? 's' : ''} por crear)`, link: `?tab=expedientes&estados=${encodeURIComponent(['DOC. COMPLETA', 'DOC. COMPLETA APPSHEET'].join(','))}` });
    }
    if (listosSinCifo.length) atencion.push({ tono: 'ambar', clave: 'listos_sin_cifo', texto: `${listosSinCifo.length} listo${listosSinCifo.length > 1 ? 's' : ''} sin fecha de CIFO: no pueden entrar en lote`, link: `?tab=expedientes&estados=${encodeURIComponent('DOC. COMPLETA')}` });
    const urgentes = filas.filter(f => String(f.prioridad).toUpperCase() === 'URGENTE');
    if (urgentes.length) atencion.push({ tono: 'ambar', clave: 'urgentes', texto: `${urgentes.length} expediente${urgentes.length > 1 ? 's' : ''} marcado${urgentes.length > 1 ? 's' : ''} como urgente${urgentes.length > 1 ? 's' : ''}`, link: '?tab=expedientes&prioridad=URGENTE' });
    const conInc = filas.filter(f => f.incidenciasAbiertas > 0);
    if (conInc.length) atencion.push({ tono: 'gris', clave: 'incidencias', texto: `${conInc.length} expediente${conInc.length > 1 ? 's' : ''} con incidencias abiertas (${conInc.reduce((a, f) => a + f.incidenciasAbiertas, 0)})`, link: '?tab=expedientes' });
    const parados = filas.filter(f => ['CIERRE', 'LISTO'].includes(f.faseId) && f.diasSinMovimiento >= 30);
    if (parados.length) atencion.push({ tono: 'gris', clave: 'parados', texto: `${parados.length} expediente${parados.length > 1 ? 's' : ''} en cierre o listos sin moverse hace 30 días o más`, link: '?tab=expedientes' });
    if (cee.porFacturar.n) atencion.push({ tono: 'ambar', clave: 'cee_por_facturar', texto: `${cee.porFacturar.n} CEE directo${cee.porFacturar.n > 1 ? 's' : ''} terminado${cee.porFacturar.n > 1 ? 's' : ''} sin factura`, importe: cee.porFacturar.importe, link: '?tab=cee-directos' });
    if (informes?.porFacturar) atencion.push({ tono: 'ambar', clave: 'informes_por_facturar', texto: `${informes.porFacturar} informe${informes.porFacturar > 1 ? 's' : ''} firmado${informes.porFacturar > 1 ? 's' : ''} sin factura`, link: '?tab=cee-directos' });
    if (cee.porCobrar.n) atencion.push({ tono: 'gris', clave: 'cee_por_cobrar', texto: `${cee.porCobrar.n} CEE directo${cee.porCobrar.n > 1 ? 's' : ''} facturado${cee.porCobrar.n > 1 ? 's' : ''} sin cobrar`, importe: cee.porCobrar.importe, link: '?tab=cee-directos' });
    const opsPteEnviar = captacion.filter(c => c.faseId === 'PTE_ENVIAR' && c.diasSinMovimiento >= 3);
    if (opsPteEnviar.length) atencion.push({ tono: 'gris', clave: 'propuestas_sin_enviar', texto: `${opsPteEnviar.length} propuesta${opsPteEnviar.length > 1 ? 's' : ''} calculada${opsPteEnviar.length > 1 ? 's' : ''} sin enviar hace 3 días o más`, link: `?tab=oportunidades&opestado=${encodeURIComponent('PTE ENVIAR')}` });

    return {
        generado: new Date().toISOString(),
        hoy,
        filas,
        captacion,
        nombres,
        fases: agg.FASES.map(({ id, label, desc, fiabilidad, estados }) => ({ id, label, desc, fiabilidad, estados })),
        fasesCaptacion: agg.FASES_CAPTACION.map(({ id, label, desc, estados }) => ({ id, label, desc, estados })),
        expedientes: { total: nTotalExp, vivos: vivos.length, rechazados: rechazados.length, tasaRechazo: r2(tasaRechazo * 100) / 100, listos: listos.length, listosSinCifo: listosSinCifo.length },
        oportunidades: { total: reales.length, porEstado: opsPorEstado, altasMes: altasOpMes, conversion, cohorte: cohorte.length, convertidas, convPorEdad },
        verificacion: { ratio: ratioVerificado, n: nVer },
        lotes: lotesOut,
        etapas,
        cee,
        informes,
        atencion,
    };
}

// Los estados de un CEE directo, agrupados para leerse de un vistazo.
const GRUPOS_CEE = [
    { id: 'ENCARGO', label: 'Por encargar', estados: ['PTE. CEE INICIAL', 'PTE. CEE FINAL'] },
    { id: 'TECNICO', label: 'Con el técnico', estados: ['EN CERTIFICADOR CEE INICIAL', 'EN TRABAJO (CEE INICIAL)', 'EN CERTIFICADOR CEE FINAL', 'EN TRABAJO (CEE FINAL)'] },
    { id: 'REVISION', label: 'Por revisar', estados: ['PENDIENTE REVISIÓN (INICIAL)', 'PENDIENTE REVISIÓN (FINAL)'] },
    { id: 'REGISTRO', label: 'Por registrar', estados: ['REVISADO Y LISTO (INICIAL)', 'PTE. PRESENTACIÓN (INICIAL)', 'REVISADO Y LISTO (FINAL)', 'PTE. PRESENTACIÓN (FINAL)'] },
    { id: 'FINALIZADO', label: 'Terminados', estados: ['FINALIZADO'] },
];
const grupoCee = (estado) => (GRUPOS_CEE.find(g => g.estados.includes(normEstado(estado))) || GRUPOS_CEE[0]).id;

function resumenCeeDirectos(lista, facturasIng, nombreDe, anioHoy, hoy) {
    // Los HISTÓRICOS (migrados de AppSheet) se facturaron allí: su factura está en
    // facturas_emitidas (origen APPSHEET) sin enlace y su ficha dice «no cobrado».
    // Para lo pendiente de facturar solo cuentan los nacidos en la app; para el
    // trabajo en curso, también los históricos del año (los de años pasados sin
    // terminar son restos de la migración, se cuentan aparte).
    const esCee = (f) => ['CEE_DIRECTO', 'APPSHEET'].includes(f.origen);
    // Base SIN suplidos (las tasas del registro se repercuten al cliente y no son
    // ingreso), con el mismo desglose que la contabilidad: si no, no cuadra con ella.
    const base = (f) => conta.desgloseVenta(f).base;
    const vivasFact = facturasIng.filter(f => !['RECTIFICADA', 'BORRADOR'].includes(f.estado));
    const factCee = vivasFact.filter(esCee);
    const factPorCee = new Map();
    for (const f of vivasFact) if (f.cee_directo_id) (factPorCee.get(f.cee_directo_id) || factPorCee.set(f.cee_directo_id, []).get(f.cee_directo_id)).push(f);

    const delAnio = factCee.filter(f => String(f.fecha || '').startsWith(String(anioHoy)));
    const delAnterior = factCee.filter(f => String(f.fecha || '').startsWith(String(anioHoy - 1)));
    const facturadoAnio = delAnio.reduce((a, f) => a + base(f), 0);
    const facturadoMes = Array(12).fill(0);
    for (const f of delAnio) facturadoMes[Number(f.fecha.slice(5, 7)) - 1] += base(f);
    const ticket = delAnio.length ? facturadoAnio / delAnio.length : (delAnterior.length ? delAnterior.reduce((a, f) => a + base(f), 0) / delAnterior.length : null);
    const pendCobro = factCee.filter(f => f.estado !== 'PAGADA');
    const porCobrar = { n: pendCobro.length, importe: pendCobro.reduce((a, f) => a + base(f), 0) };

    const grupos = Object.fromEntries(GRUPOS_CEE.map(g => [g.id, { id: g.id, label: g.label, n: 0 }]));
    let altasAnio = 0, terminadosAnio = 0, costeTec = 0, nCosteTec = 0, restosMigracion = 0;
    const porFacturar = { n: 0, importe: 0, estimados: 0, numeros: [] };
    const enCurso = { n: 0, importe: 0, estimados: 0 };
    const dias = [];
    const partners = new Map();

    for (const c of lista) {
        const g = grupoCee(c.estado);
        const app = c.origen !== 'HISTORICO';
        const delAnioC = Number(c.anio) === anioHoy;
        if (delAnioC) {
            altasAnio++;
            const pid = c.prescriptor_id ? String(c.prescriptor_id) : null;
            const k = pid || '—';
            partners.set(k, { id: pid, nombre: pid ? (nombreDe.get(pid) || '—') : 'Cliente directo', n: (partners.get(k)?.n || 0) + 1 });
        }
        const reg = isoDe(c.registro_ini);
        if (reg && reg.startsWith(String(anioHoy))) terminadosAnio++;
        if (app && reg && c.created_at && reg >= c.created_at.slice(0, 10)) dias.push(diasEntre(c.created_at.slice(0, 10), reg));
        if (g !== 'FINALIZADO') {
            if (app || delAnioC) grupos[g].n++;
            else restosMigracion++;
        } else grupos[g].n++;

        // Coste del técnico sellado al conciliar su factura mensual: su HONORARIO.
        // Las tasas del registro que adelanta se le repercuten al cliente como
        // suplido: no son ingreso ni coste (fuera de los dos lados de la cuenta).
        const fc = c.fact_cert || {};
        const coste = n0(fc.honorario?.importe);
        if (coste > 0) { costeTec += coste; nCosteTec++; }

        if (!app) continue;
        const fichaFacts = c.facturas_ficha && typeof c.facturas_ficha === 'object' ? Object.values(c.facturas_ficha).filter(f => f && f.estado !== 'RECTIFICADA') : [];
        const tieneFactura = (factPorCee.get(c.id) || []).length > 0 || fichaFacts.length > 0;
        if (tieneFactura || c.cobrado) continue;
        // Importe esperado: el de la oferta aceptada (sin IVA); si no hay, el ticket medio.
        const ofertaNeto = n0(c.oferta_neto) || (n0(c.oferta_total) ? n0(c.oferta_total) / 1.21 : 0);
        // Terminado = FINALIZADO, o con el CEE inicial ya registrado (es lo que se cobra).
        const destino = (g === 'FINALIZADO' || reg) ? porFacturar : enCurso;
        destino.n++;
        if (ofertaNeto) destino.importe += ofertaNeto; else { destino.estimados++; if (ticket) destino.importe += ticket; }
        if (destino === porFacturar) porFacturar.numeros.push(c.numero_expediente);
    }
    dias.sort((a, b) => a - b);
    return {
        total: lista.length,
        grupos: Object.values(grupos),
        restosMigracion,
        altasAnio, terminadosAnio,
        facturadoAnio: r2(facturadoAnio), nFacturasAnio: delAnio.length, facturadoMes: facturadoMes.map(r2),
        facturadoAnterior: r2(delAnterior.reduce((a, f) => a + n0(f.neto), 0)), nFacturasAnterior: delAnterior.length,
        ticketMedio: ticket != null ? r2(ticket) : null,
        costeTecnicoMedio: nCosteTec ? r2(costeTec / nCosteTec) : null, nCosteTecnico: nCosteTec,
        margenMedio: (ticket != null && nCosteTec) ? r2(ticket - costeTec / nCosteTec) : null,
        diasMedianaEntrega: dias.length ? dias[Math.floor(dias.length / 2)] : null, nDias: dias.length,
        porFacturar: { n: porFacturar.n, importe: r2(porFacturar.importe), estimados: porFacturar.estimados, numeros: porFacturar.numeros.slice(0, 20) },
        porCobrar: { n: porCobrar.n, importe: r2(porCobrar.importe) },
        enCurso: { n: enCurso.n, importe: r2(enCurso.importe), estimados: enCurso.estimados },
        topPartners: [...partners.values()].sort((a, b) => b.n - a.n).slice(0, 5),
        hoy,
    };
}

function negocio({ forzar = false } = {}) {
    return conCache('negocio', TTL_NEGOCIO, forzar, calcularNegocio);
}

// ════════════════════════════════════════════════════════════════════════════
// FINANZAS
// ════════════════════════════════════════════════════════════════════════════
// Gastos de Drive que NO son gasto de explotación: la inversión (es CAPEX, va
// debajo del EBITDA), el bono del CAE (ya está en el coste directo de cada
// expediente) y lo que no es un gasto.
const TIPOS_FUERA_EBITDA = new Set(['INVERSION', 'BONO_CAE', 'NO_GASTO']);

function trimestresDe(anio, hoy) {
    const anioHoy = Number(hoy.slice(0, 4));
    const hasta = anio < anioHoy ? 4 : anio > anioHoy ? 0 : Math.ceil(Number(hoy.slice(5, 7)) / 3);
    return Array.from({ length: hasta }, (_, i) => `${anio}-T${i + 1}`);
}
const mesDeGasto = (g) => {
    const f = isoDe(g.datos?.fecha);
    if (f) return Number(f.slice(5, 7));
    return g.mes_carpeta ? Number(g.mes_carpeta) : null;
};

async function calcularFinanzas(anio, { forzar }) {
    const hoy = hoyMadrid();
    const [neg, cuadro] = await Promise.all([
        negocio({ forzar }),
        conta.cuadro(anio, { hoy }).catch((e) => { throw new BdCaida('contabilidad', e); }),
    ]);
    const ventasCae = await conta.ventasCae(anio, { hoy }).catch(() => null);
    const { agg } = await mods();
    const avisos = [];

    // ── Gastos del año ───────────────────────────────────────────────────────
    // Un trimestre CERRADO que está en el libro maestro (lo entregado a la gestoría)
    // sale del libro: es la verdad contable. Si no, de la lectura de Drive factura a
    // factura. El trimestre EN CURSO cuenta cada mes con lo leído o, si es menos,
    // con la media mensual de los cerrados (las facturas de un mes llegan después):
    // es una estimación y se dice.
    const anioHoy = Number(hoy.slice(0, 4));
    const ts = trimestresDe(anio, hoy);
    const qEnCurso = anio === anioHoy ? Math.ceil(Number(hoy.slice(5, 7)) / 3) : anio < anioHoy ? 5 : 0;
    const certNifs = new Set();   // los certificadores ya están en el coste directo
    const { data: certs } = await supabase.from('prescriptores').select('cif, tipo_empresa').eq('tipo_empresa', 'CERTIFICADOR');
    for (const c of certs || []) if (c.cif) certNifs.add(String(c.cif).toUpperCase().replace(/[^A-Z0-9]/g, ''));
    const libro = await libroContable.gastosDelLibro(anio, { certNifs, forzar }).catch(e => ({ error: e.message }));
    const delLibro = (t) => {
        const q = Number(t.slice(-1));
        return q < qEnCurso && libro && !libro.error && libro.trimestres?.[`T${q}`]?.filas > 0;
    };
    const gastosT = await Promise.all(ts.filter(t => !delLibro(t)).map(t => conta.gastos(t, { hoy }).then(g => ({ t, g })).catch(e => ({ t, error: e.message }))));

    const estructuraMes = Array(12).fill(0);
    const gastos = {
        trimestres: [], estructura: 0, fml: 0, ivaNoDeducible: 0, inversiones: 0, certificadores: 0, bonosLibro: 0,
        sinLeer: 0, sinLeerEnCurso: 0, leidos: 0, errores: 0, porTipo: {}, drive: true,
        libro: libro?.error ? { error: libro.error } : libro ? { nombre: libro.archivo.nombre, modificado: libro.archivo.modificado, trimestres: [], cuadra: true, avisos: libro.avisos } : null,
        estimado: null,
    };
    for (const t of ts.filter(delLibro)) {
        const L = libro.trimestres[`T${Number(t.slice(-1))}`];
        gastos.estructura += L.estructura; gastos.fml += L.fml; gastos.ivaNoDeducible += L.ivaNoDeducible;
        gastos.inversiones += L.inversiones; gastos.certificadores += L.certificadores; gastos.bonosLibro += L.bonos;
        gastos.porTipo.LIBRO = r2((gastos.porTipo.LIBRO || 0) + L.estructura);
        L.meses.forEach((v, i) => { estructuraMes[i] += v; });
        if (L.cuadra === false) gastos.libro.cuadra = false;
        gastos.libro.trimestres.push(t);
        gastos.trimestres.push({ t, fuente: 'LIBRO', base: r2(L.estructura), filas: L.filas, sinImporte: L.sinImporte, cuadra: L.cuadra });
    }
    for (const { t, g, error } of gastosT) {
        if (error) { gastos.drive = false; gastos.trimestres.push({ t, fuente: 'DRIVE', error }); continue; }
        let base = 0, sinLeer = 0, leidos = 0;
        for (const f of g.filas || []) {
            if (f.contribuyente !== 'SL') continue;
            if (f.estado === 'SIN_LEER') { sinLeer++; continue; }
            leidos++;
            const tipo = f.fiscal?.tipo || 'GASTO_CORRIENTE';
            const b = n0(f.fiscal?.base);
            if (tipo === 'INVERSION') { gastos.inversiones += b; continue; }
            if (TIPOS_FUERA_EBITDA.has(tipo)) continue;
            const nif = String(f.datos?.nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (f.actividad === 'CAE' && nif && certNifs.has(nif)) { gastos.certificadores += b; continue; }
            const ivaNoDed = Math.max(0, n0(f.fiscal?.cuota) - n0(f.fiscal?.iva_deducible));
            const importe = b + ivaNoDed;
            base += importe;
            gastos.ivaNoDeducible += ivaNoDed;
            if (f.origen === 'APP' || f.fml) gastos.fml += b;
            gastos.porTipo[tipo] = r2((gastos.porTipo[tipo] || 0) + importe);
            const m = mesDeGasto(f);
            if (m >= 1 && m <= 12) estructuraMes[m - 1] += importe;
        }
        gastos.estructura += base;
        const enCurso = Number(t.slice(-1)) >= qEnCurso;
        if (enCurso) gastos.sinLeerEnCurso += sinLeer; else gastos.sinLeer += sinLeer;
        gastos.leidos += leidos;
        gastos.trimestres.push({ t, fuente: 'DRIVE', base: r2(base), sinLeer, leidos, enCurso });
    }
    gastos.trimestres.sort((a, b) => a.t.localeCompare(b.t));
    // El trimestre en curso: cada mes transcurrido vale lo leído o la media de los
    // cerrados, lo que sea mayor (el mes de hoy cuenta entero: prudente).
    const mesesCerrados = Math.min(12, (qEnCurso - 1) * 3);
    const cerrados = ts.filter(t => Number(t.slice(-1)) < qEnCurso);
    const cerradosFiables = cerrados.every(t => { const x = gastos.trimestres.find(q => q.t === t); return x && !x.error && (x.fuente === 'LIBRO' || x.sinLeer === 0); });
    if (anio === anioHoy && mesesCerrados > 0 && cerrados.length) {
        const media = estructuraMes.slice(0, mesesCerrados).reduce((a, b) => a + b, 0) / mesesCerrados;
        const mesHoy = Number(hoy.slice(5, 7));
        const meses = [];
        let extra = 0;
        for (let m = mesesCerrados + 1; m <= mesHoy; m++) {
            if (estructuraMes[m - 1] < media) { extra += media - estructuraMes[m - 1]; estructuraMes[m - 1] = media; meses.push(m); }
        }
        if (meses.length) {
            gastos.estructura += extra;
            gastos.porTipo.ESTIMADO = r2(extra);
            gastos.estimado = { meses, importe: r2(extra), mediaMensual: r2(media), base: cerradosFiables ? 'cerrados' : 'parcial' };
        }
    }
    if (!gastos.drive) avisos.push({ tono: 'ambar', texto: 'Drive no ha respondido para algún trimestre: los gastos están incompletos.' });
    if (gastos.libro?.error) avisos.push({ tono: 'ambar', texto: `No se pudo leer el libro maestro de la contabilidad (${gastos.libro.error}): los trimestres cerrados salen de la lectura de Drive.` });
    if (gastos.libro && gastos.libro.cuadra === false) avisos.push({ tono: 'ambar', clave: 'libro_no_cuadra', texto: 'El libro maestro no suma lo mismo que su hoja RESUMEN en algún trimestre: revísalo antes de fiarte de la estructura.' });

    // ── Ingresos por mes y línea (SL) ────────────────────────────────────────
    const meses = cuadro.ventas?.meses || [];
    const ingCaeMes = meses.map(m => n0(m.CAE?.base));
    const ingIngMes = meses.map(m => n0(m.ING?.base));
    const ingresosCae = ingCaeMes.reduce((a, b) => a + b, 0);
    const ingresosIng = ingIngMes.reduce((a, b) => a + b, 0);
    const ingresos = ingresosCae + ingresosIng;

    // Desglose de ING por origen (CEE directos / gestión CAE / ingeniería y otros).
    const { data: factIng, error: eIng } = await supabase.from('facturas_emitidas')
        .select('neto, iva, fecha, estado, origen, serie').eq('serie', 'ING').gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`);
    const ingPorOrigen = { CEE: 0, GESTION_CAE: 0, OTROS: 0 };
    if (!eIng) for (const f of factIng || []) {
        if (f.estado === 'BORRADOR') continue;
        const k = ['CEE_DIRECTO', 'APPSHEET'].includes(f.origen) ? 'CEE' : f.origen === 'GESTION_CAE' ? 'GESTION_CAE' : 'OTROS';
        ingPorOrigen[k] += conta.desgloseVenta(f).base; // sin suplidos, como la contabilidad
    }

    // ── Coste directo del CAE ────────────────────────────────────────────────
    // Por cada venta CAE del año (la misma lista que Facturación): lo que se lleva
    // el cliente (bono), la comisión del partner, el ITP y los certificados, tal y
    // como lo calcula cada expediente de su lote al precio real de venta. Coste =
    // venta × (1 − margen del lote ÷ facturación del lote).
    const loteDeCodigo = new Map(neg.lotes.map(l => [l.codigo, l]));
    const pctCosteLote = (l) => (n0(l.base) > 0 ? Math.min(1, Math.max(0, 1 - n0(l.margen) / n0(l.base))) : null);
    const ventasLista = (ventasCae?.ventas || []).filter(v => v.estado !== 'RECTIFICADA' && String(v.fecha || '').startsWith(String(anio)));
    const usados = new Set();
    const casadas = [];
    for (const v of ventasLista) {
        let l = v.lote ? loteDeCodigo.get(v.lote) : null;
        // Las autofacturas de Drive (lotes PRE APP) no llevan lote: se casan por importe.
        if (!l && n0(v.base) > 0) l = neg.lotes.find(x => x.preApp && !usados.has(x.id) && n0(x.base) > 0 && Math.abs(n0(x.base) - n0(v.base)) / n0(v.base) < 0.02) || null;
        if (l) usados.add(l.id);
        casadas.push({ v, l, pct: l ? pctCosteLote(l) : null });
    }
    const conLote = casadas.filter(c => c.pct != null);
    const baseCubierta = conLote.reduce((a, c) => a + n0(c.v.base), 0);
    const costeCubierto = conLote.reduce((a, c) => a + n0(c.v.base) * c.pct, 0);
    // Lo que no casa con ningún lote (ventas antiguas por Drive) lleva el margen
    // medio de lo que sí casa, y se dice.
    let pctCosteMedio = baseCubierta > 0 ? costeCubierto / baseCubierta : null;
    if (pctCosteMedio == null) {
        const tot = agg.agregar(neg.filas.filter(f => f.profit != null), agg.PRECIO_SO_DEFAULT);
        pctCosteMedio = tot.facturacion > 0 ? 1 - tot.profit / tot.facturacion : 0.85;
    }
    const costeCaeMes = Array(12).fill(0);
    const casadoMes = Array(12).fill(0);
    for (const c of conLote) { const m = Number(c.v.fecha.slice(5, 7)) - 1; costeCaeMes[m] += n0(c.v.base) * c.pct; casadoMes[m] += n0(c.v.base); }
    for (let i = 0; i < 12; i++) costeCaeMes[i] += Math.max(0, ingCaeMes[i] - casadoMes[i]) * pctCosteMedio;
    const sinCasar = Math.max(0, ingresosCae - baseCubierta);
    const costeDirectoCae = costeCaeMes.reduce((a, b) => a + b, 0);
    if (!ventasCae) avisos.push({ tono: 'ambar', texto: 'No se pudo leer la lista de ventas CAE: el coste directo sale del margen medio.' });

    // ── Coste directo de los CEE directos: el técnico y las tasas ───────────
    const nCeeFact = (factIng || []).filter(f => !['BORRADOR', 'RECTIFICADA'].includes(f.estado) && ['CEE_DIRECTO', 'APPSHEET'].includes(f.origen)).length;
    const costeUnitCee = neg.cee.costeTecnicoMedio != null ? neg.cee.costeTecnicoMedio : 60;
    const costeCee = nCeeFact * costeUnitCee;

    const costeDirecto = costeDirectoCae + costeCee;
    const margenBruto = ingresos - costeDirecto;
    const estructura = gastos.estructura;
    const ebitda = margenBruto - estructura;

    const costeCeeMes = Array(12).fill(0);
    if (ingresosIng > 0) for (let i = 0; i < 12; i++) costeCeeMes[i] = costeCee * (ingIngMes[i] / ingresosIng);
    const mesesPyG = Array.from({ length: 12 }, (_, i) => {
        const ing = ingCaeMes[i] + ingIngMes[i];
        const mb = ing - costeCaeMes[i] - costeCeeMes[i];
        return { mes: i + 1, ingresos: r0(ing), cae: r0(ingCaeMes[i]), ing: r0(ingIngMes[i]), margenBruto: r0(mb), estructura: r0(estructuraMes[i]), ebitda: r0(mb - estructuraMes[i]) };
    });
    const mesesTranscurridos = anio < anioHoy ? 12 : anio > anioHoy ? 0 : Number(hoy.slice(5, 7));
    // Estructura mensual: la media de los trimestres con algo leído (los meses sin
    // leer valen 0 y la bajarían).
    const mesesConGasto = estructuraMes.filter(v => v > 0).length;
    const estructuraMensual = mesesConGasto ? estructura / mesesConGasto : null;

    const pyg = {
        ingresos: r2(ingresos), ingresosCae: r2(ingresosCae), ingresosIng: r2(ingresosIng),
        ingPorOrigen: Object.fromEntries(Object.entries(ingPorOrigen).map(([k, v]) => [k, r2(v)])),
        costeDirecto: r2(costeDirecto), costeDirectoCae: r2(costeDirectoCae), costeCee: r2(costeCee),
        margenBruto: r2(margenBruto), margenBrutoPct: ingresos > 0 ? margenBruto / ingresos : null,
        estructura: r2(estructura), fml: r2(gastos.fml),
        ebitda: r2(ebitda), ebitdaPct: ingresos > 0 ? ebitda / ingresos : null,
        inversiones: r2(gastos.inversiones),
        cobertura: { caeCasado: r2(baseCubierta), caeSinCasar: r2(sinCasar), pctCosteMedio: Math.round(pctCosteMedio * 10000) / 10000, nVentas: ventasLista.length, nCasadas: conLote.length, costeUnitCee: r2(costeUnitCee), nCeeFact,
            ventas: casadas.map(c => ({ numero: c.v.numero, fecha: c.v.fecha, cliente: c.v.cliente || null, base: r2(c.v.base), lote: c.l?.codigo || null, margenPct: c.pct != null ? Math.round((1 - c.pct) * 1000) / 10 : null })) },
        gastos: { ...gastos, estructura: r2(gastos.estructura), fml: r2(gastos.fml), ivaNoDeducible: r2(gastos.ivaNoDeducible), inversiones: r2(gastos.inversiones), certificadores: r2(gastos.certificadores), bonosLibro: r2(gastos.bonosLibro) },
        meses: mesesPyG,
        mesesTranscurridos,
        // Fiable: los trimestres cerrados salen del libro de la gestoría o de Drive
        // leído entero (el trimestre en curso va estimado, y se dice).
        fiable: gastos.drive && !gastos.libro?.error && gastos.sinLeer === 0,
    };
    if (gastos.sinLeer > 0) avisos.push({ tono: 'ambar', clave: 'gastos_sin_leer', texto: `${gastos.sinLeer} factura${gastos.sinLeer > 1 ? 's' : ''} de gasto de trimestres cerrados sin leer en Drive (y sin el libro de la gestoría): no restan en el EBITDA, que puede ser menor.`, link: '?tab=facturacion&sub=trimestres' });

    // ── Caja y circulante ───────────────────────────────────────────────────
    const cobros = cuadro.cobros || {};
    const bonosPorPagar = neg.lotes.filter(l => ['POR_COBRAR', 'POR_PAGAR'].includes(l.etapa)).reduce((a, l) => a + l.bonosPendientes, 0);
    const bonosPorPagarCobrados = neg.lotes.filter(l => l.etapa === 'POR_PAGAR').reduce((a, l) => a + l.bonosPendientes, 0);
    const tri = cuadro.trimestre || {};
    const ivaAPagar = Math.max(0, n0(tri.sl?.resultado_303));
    const retenciones = Math.max(0, n0(tri.m111));
    // Las ventas CAE de Drive ya van dentro de cobros.pendiente/cobrado (no se suman otra vez).
    const circulante = n0(cobros.pendiente) - bonosPorPagar - ivaAPagar - retenciones;
    const caja = {
        teDeben: r2(cobros.pendiente), nTeDeben: n0(cobros.n_pendientes),
        vencido: r2(cobros.vencido), nVencidas: n0(cobros.n_vencidas),
        cobradoAnio: r2(cobros.cobrado),
        diasCobro: cobros.dias_medios_cobro?.dias ?? null,
        porLinea: cobros.por_linea || null,
        vencidas: cobros.vencidas || [],
        bonosPorPagar: r2(bonosPorPagar), bonosPorPagarCobrados: r2(bonosPorPagarCobrados),
        ivaAPagar: r2(ivaAPagar), retenciones: r2(retenciones),
        trimestre: { t: tri.t, etiqueta: tri.etiqueta, plazo: tri.plazo || null, parcial: !!tri.parcial },
        circulante: r2(circulante),
    };
    if (bonosPorPagarCobrados > 0) avisos.push({ tono: 'ambar', clave: 'bonos_cobrados', texto: `Tienes ${Math.round(bonosPorPagarCobrados).toLocaleString('es-ES')} € de bonos de clientes ya cobrados al S.O. y sin transferir.`, link: '?tab=lotes' });
    if (tri.plazo?.dias != null && tri.plazo.dias <= 20) avisos.push({ tono: 'ambar', clave: 'plazo_fiscal', texto: `Modelo ${tri.plazo.modelo} en ${tri.plazo.dias} días (${tri.plazo.fecha}).`, link: `?tab=facturacion&sub=trimestres&t=${tri.t}` });

    // ── Previsión ───────────────────────────────────────────────────────────
    const ratio = neg.verificacion.ratio ?? 1;
    const r = neg.expedientes.tasaRechazo || 0;
    const conv = neg.oportunidades.conversion;
    const tramoLotes = (etapa) => neg.lotes.filter(l => l.etapa === etapa);
    const sumaLotes = (ls, conRatio) => ls.reduce((a, l) => {
        const k = conRatio && !l.fullyVerif ? ratio : 1;
        a.n++; a.nExp += l.nExp; a.mwh += l.mwh; a.base += n0(l.base) * k; a.margen += n0(l.margen) * k; a.bruto += n0(l.base);
        return a;
    }, { n: 0, nExp: 0, mwh: 0, base: 0, margen: 0, bruto: 0 });
    const sumaFilas = (fs, k) => fs.reduce((a, f) => {
        const rp = agg.repricearFila(f, f.precioSOGuardado);
        a.nExp++; a.mwh += f.mwh; a.bruto += rp.facturacion; a.base += rp.facturacion * k; a.margen += (rp.profit ?? 0) * k;
        return a;
    }, { n: 0, nExp: 0, mwh: 0, base: 0, margen: 0, bruto: 0 });
    const sinLote = (ids) => neg.filas.filter(f => !f.loteId && ids.includes(f.faseId));
    // Cada propuesta viva pesa lo que convierte una de su antigüedad (ver negocio()).
    const captacionPonderada = () => {
        const a = neg.captacion.reduce((acc, f) => {
            const k = (f.probConversion ?? conv ?? 0) * ratio;
            const rp = agg.repricearFila(f, f.precioSOGuardado);
            acc.nExp++; acc.mwh += f.mwh; acc.bruto += rp.facturacion; acc.base += rp.facturacion * k; acc.margen += (rp.profit ?? 0) * k;
            return acc;
        }, { n: 0, nExp: 0, mwh: 0, base: 0, margen: 0, bruto: 0 });
        return { ...a, prob: a.bruto > 0 ? a.base / a.bruto : 0 };
    };
    const notaConversion = () => {
        const cs = (neg.oportunidades.convPorEdad || []).filter(c => c.tasa != null);
        if (!cs.length) return conv != null ? `Convierte el ${Math.round(conv * 100)} % de las propuestas` : 'Sin histórico suficiente';
        const txt = cs.map(c => `${c.desde ? `desde ${c.desde} días` : 'recién hecha'} ${Math.round(c.tasa * 100)} %`).join(' · ');
        return `Cada propuesta pesa lo que convierte una de su antigüedad: ${txt}`;
    };
    const tramos = [
        { id: 'POR_FACTURAR', label: 'CAE emitido, por facturar', horizonte: 'Ya', prob: 1, ...sumaLotes(tramoLotes('POR_FACTURAR'), false), nota: 'Se puede facturar hoy' },
        { id: 'MITECO', label: 'En el Ministerio', horizonte: 'Semanas', prob: 1, ...sumaLotes(tramoLotes('MITECO'), true), nota: 'Verificado: falta que el MITECO emita el CAE' },
        { id: 'VERIFICADOR', label: 'En el verificador', horizonte: '1–3 meses', prob: ratio, ...sumaLotes(tramoLotes('VERIFICADOR'), true), nota: neg.verificacion.ratio != null ? `Al ${Math.round(ratio * 100)} % del estimado: lo que deja el verificador de media (${neg.verificacion.n} expedientes)` : 'Al 100 % del estimado' },
        { id: 'LOTE', label: 'Listos o en lote en preparación', horizonte: '2–4 meses', prob: ratio, ...(() => { const a = sumaLotes(tramoLotes('PREPARACION'), true); const b = sumaFilas(sinLote(['LISTO']), ratio); return { n: a.n, nExp: a.nExp + b.nExp, mwh: a.mwh + b.mwh, base: a.base + b.base, margen: a.margen + b.margen, bruto: a.bruto + b.bruto }; })(), nota: 'Documentación completa' },
        { id: 'CIERRE', label: 'Cierre y documentación', horizonte: '3–6 meses', prob: ratio * (1 - r / 2), ...sumaFilas(sinLote(['CIERRE']), ratio * (1 - r / 2)), nota: 'Obra terminada, papeles en marcha' },
        { id: 'OBRA', label: 'En obra y CEE inicial', horizonte: '6–12 meses', prob: ratio * (1 - r), ...sumaFilas(sinLote(['OBRA', 'CEE_INICIAL']), ratio * (1 - r)), nota: `Descontado el rechazo histórico (${(r * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} % de los expedientes)` },
        { id: 'CAPTACION', label: 'Captación (propuestas vivas)', horizonte: '6–18 meses', ...captacionPonderada(), nota: notaConversion() },
    ].map(t => ({ ...t, base: r2(t.base), margen: r2(t.margen), bruto: r2(t.bruto), mwh: r2(t.mwh) }));

    const pres = cuadro.presupuestos || {};
    const tasaAcept = pres.tasa_aceptacion ?? null;
    const tramosIng = [
        { id: 'PRES_POR_FACTURAR', label: 'Presupuestos aceptados por facturar', prob: 1, n: n0(pres.por_facturar?.n), base: r2(pres.por_facturar?.importe) },
        { id: 'CEE_POR_FACTURAR', label: 'CEE directos terminados sin factura', prob: 1, n: neg.cee.porFacturar.n, base: neg.cee.porFacturar.importe },
        { id: 'CEE_EN_CURSO', label: 'CEE directos en curso', prob: 1, n: neg.cee.enCurso.n, base: neg.cee.enCurso.importe },
        { id: 'PRES_ENVIADOS', label: 'Presupuestos enviados', prob: tasaAcept ?? 0.5, n: n0(pres.enviados?.n), base: r2(n0(pres.enviados?.importe) * (tasaAcept ?? 0.5)), bruto: r2(pres.enviados?.importe) },
    ];
    const carteraCae = tramos.reduce((a, t) => a + t.base, 0);
    const carteraMargen = tramos.reduce((a, t) => a + t.margen, 0);
    const carteraIng = tramosIng.reduce((a, t) => a + t.base, 0);
    const ytd = ingresos;
    const seguro = tramos[0].base + tramosIng[0].base + tramosIng[1].base;
    const posible = tramos[1].base;

    // ── ¿Qué de lo enviado se factura dentro del año? ───────────────────────
    // Del envío al verificador a la factura al S.O. tarda lo que han tardado los
    // lotes ya facturados (la MEDIANA, regla 216: lo medido, no una tasa a ojo).
    // Cada lote del Ministerio o del verificador se factura en su fecha de envío
    // + esa mediana, nunca antes de una semana desde hoy; entra en el cierre si
    // esa fecha cae en el año. Pesa lo que deja el verificador (como su tramo).
    const medidos = neg.lotes
        .filter(l => l.fechaEnvioVerificador && l.factura?.fecha)
        .map(l => diasEntre(l.fechaEnvioVerificador, l.factura.fecha))
        .filter(d => Number.isFinite(d) && d >= 0)
        .sort((a, b) => a - b);
    const mitad = Math.floor(medidos.length / 2);
    const medianaDias = medidos.length >= 3 ? Math.round(medidos.length % 2 ? medidos[mitad] : (medidos[mitad - 1] + medidos[mitad]) / 2) : null;
    const diasFactura = medianaDias ?? 60;
    const masDias = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
    const finAnio = `${anio}-12-31`;
    const enCamino = neg.lotes.filter(l => l.etapa === 'MITECO' || l.etapa === 'VERIFICADOR').map(l => {
        const k = l.fullyVerif ? 1 : ratio;
        const porRitmo = l.fechaEnvioVerificador ? masDias(l.fechaEnvioVerificador, diasFactura) : null;
        const pronto = masDias(hoy, 7);
        const prevista = !porRitmo || porRitmo < pronto ? pronto : porRitmo;
        return {
            codigo: l.codigo, etapa: l.etapa, estado: l.estado, so: l.so, nExp: l.nExp,
            base: r2(n0(l.base) * k), margen: r2(n0(l.margen) * k),
            fechaEnvio: l.fechaEnvioVerificador, fechaPrevista: prevista, entra: prevista <= finAnio,
        };
    }).sort((a, b) => a.fechaPrevista.localeCompare(b.fechaPrevista) || String(a.codigo).localeCompare(String(b.codigo)));
    const entraAnio = enCamino.filter(l => l.entra).reduce((a, l) => a + l.base, 0);
    const todoEnviado = enCamino.reduce((a, l) => a + l.base, 0);
    const prevision = {
        tramos, tramosIng,
        ratioVerificado: neg.verificacion.ratio, tasaRechazo: r, conversion: conv, tasaAceptacion: tasaAcept,
        cartera: r2(carteraCae + carteraIng), carteraCae: r2(carteraCae), carteraIng: r2(carteraIng), carteraMargen: r2(carteraMargen),
        // seguro = facturado + lo que ya se puede facturar · esperado = + lo del
        // Ministerio y del verificador que al ritmo medido se factura antes del 31/12
        // · maximo = + todo lo enviado (si todo va más rápido) · posible (antiguo) = + el Ministerio.
        cierreAnio: anio === anioHoy ? {
            ytd: r2(ytd), seguro: r2(ytd + seguro), posible: r2(ytd + seguro + posible),
            esperado: r2(ytd + seguro + entraAnio), maximo: r2(ytd + seguro + todoEnviado),
            lotes: enCamino,
            diasFactura: { mediana: medianaDias, n: medidos.length, min: medidos[0] ?? null, max: medidos[medidos.length - 1] ?? null, usado: diasFactura },
        } : null,
        // Cuántos meses de estructura paga el margen que hay en cartera.
        mesesCubiertos: estructuraMensual ? r2(carteraMargen / estructuraMensual) : null,
    };

    // ── Salud ───────────────────────────────────────────────────────────────
    const top = (cuadro.top_clientes || [])[0];
    const slBase = n0(cuadro.ventas?.por_contribuyente?.sl?.base) || ingresos;
    const variacion = cuadro.ventas?.acumulado?.sl?.variacion_pct ?? null;
    const tono = (ok, ambar) => ok ? 'ok' : ambar ? 'ambar' : 'gris';
    const pct = (v) => v == null ? null : Math.round(v * 1000) / 10;
    const salud = [
        { id: 'margen_bruto', label: 'Margen bruto', valor: pct(pyg.margenBrutoPct), unidad: '%', tono: tono(pyg.margenBrutoPct >= 0.12, pyg.margenBrutoPct != null && pyg.margenBrutoPct < 0.08), nota: 'Lo que queda de cada euro vendido tras bonos, comisiones, ITP y técnicos' },
        { id: 'margen_ebitda', label: 'Margen EBITDA', valor: pct(pyg.ebitdaPct), unidad: '%', tono: pyg.fiable ? tono(pyg.ebitdaPct >= 0.08, pyg.ebitdaPct != null && pyg.ebitdaPct < 0.03) : 'gris', nota: pyg.fiable ? 'Sobre la venta del año' : 'Con gastos sin leer: provisional' },
        { id: 'crecimiento', label: 'Crecimiento interanual', valor: variacion, unidad: '%', tono: tono(variacion > 10, variacion != null && variacion < 0), nota: `Venta de la SL a ${hoy.slice(8, 10)}/${hoy.slice(5, 7)} frente al año anterior` },
        { id: 'dias_cobro', label: 'Días medios de cobro', valor: caja.diasCobro, unidad: 'días', tono: tono(caja.diasCobro != null && caja.diasCobro <= 30, caja.diasCobro > 60), nota: 'De la factura al ingreso' },
        { id: 'vencido', label: 'Vencido sobre lo pendiente', valor: caja.teDeben > 0 ? pct(caja.vencido / caja.teDeben) : 0, unidad: '%', tono: tono(caja.teDeben === 0 || caja.vencido / caja.teDeben < 0.05, caja.vencido / caja.teDeben > 0.15), nota: `${caja.nVencidas} factura${caja.nVencidas === 1 ? '' : 's'} vencida${caja.nVencidas === 1 ? '' : 's'}` },
        { id: 'concentracion', label: 'Peso del mayor cliente', valor: top && slBase > 0 ? pct(top.base / slBase) : null, unidad: '%', tono: tono(top && top.base / slBase < 0.4, top && top.base / slBase > 0.6), nota: top ? top.nombre : '' },
        // Con gastos sin leer la estructura sale baja y estos dos presumen de más: van en gris.
        { id: 'cobertura', label: 'Estructura cubierta por la cartera', valor: prevision.mesesCubiertos != null ? Math.min(99, Math.round(prevision.mesesCubiertos)) : null, mas: prevision.mesesCubiertos > 99, unidad: 'meses', tono: pyg.fiable ? tono(prevision.mesesCubiertos >= 12, prevision.mesesCubiertos != null && prevision.mesesCubiertos < 6) : 'gris', nota: pyg.fiable ? 'Margen ponderado en cartera ÷ gasto de estructura mensual' : 'Provisional: con los gastos sin leer la estructura sale baja' },
        { id: 'equilibrio', label: 'Punto de equilibrio', valor: (estructuraMensual && pyg.margenBrutoPct > 0) ? r0(estructuraMensual / pyg.margenBrutoPct) : null, unidad: '€/mes', tono: 'gris', nota: pyg.fiable ? 'Venta mensual que paga la estructura' : 'Provisional: con los gastos sin leer' },
    ];

    return {
        generado: new Date().toISOString(),
        anio, hoy,
        negocioGenerado: neg.generado,
        ventas: cuadro.ventas,
        cobros: cuadro.cobros,
        presupuestos: cuadro.presupuestos,
        trimestre: cuadro.trimestre,
        topClientes: cuadro.top_clientes,
        avisosContabilidad: cuadro.avisos,
        pyg, caja, prevision, salud,
        avisos,
    };
}

function finanzas(anio, { forzar = false } = {}) {
    const a = Number(anio) || Number(hoyMadrid().slice(0, 4));
    return conCache(`finanzas:${a}`, TTL_FINANZAS, forzar, () => calcularFinanzas(a, { forzar }));
}

module.exports = { negocio, finanzas, etapaLote, isoDe, ETAPAS_LOTE, BdCaida };
