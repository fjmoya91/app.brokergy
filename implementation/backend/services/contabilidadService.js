// ─── contabilidadService.js ──────────────────────────────────────────────────
// CUADRO DE MANDO y CIERRE TRIMESTRAL de la pestaña Facturación.
//
//   · cuadro(anio)        ventas por mes y línea, cobros, embudo de presupuestos,
//                         el trimestre en curso (303/111 y el plazo), top 5 de
//                         clientes y avisos. Una sola llamada, sin JSONB.
//   · cobroVentaDrive(fileId, {cobrada, fecha})  el cobro de una venta CAE que solo
//                         está en Drive (autofactura), en las appProperties del
//                         fichero. ESCRIBE en el Drive de producción.
//   · trimestre('2026-T3') el detalle: ventas, gastos, 303 de cada contribuyente
//                         (ISP incluida), 111, 349, 130 acumulado, el checklist
//                         del SOP y lo pendiente de cobro.
//   · paquete(t, {seco})  la carpeta para la gestoría en ENTREGA GESTORÍA con la
//                         MISMA estructura y nombres que el T3 hecho a mano.
//
// DOS CONTRIBUYENTES que no se mezclan: la SOCIEDAD (líneas CAE e ING) y el
// AUTÓNOMO (línea FML: Fran factura a la sociedad con retención). Sus NIF y
// nombres salen de `facturacion_emisores` (el DNI de una persona física no va
// en el código: el repositorio es público).
//
// REGLA — todo lo que sale de aquí es una ESTIMACIÓN: los modelos los presenta
// la gestoría. Los criterios fiscales (combustible al 50 % y 0 en IRPF, ISP con
// autorrepercusión y 349, tickets sin NIF sin IVA deducible) son los del SOP de
// «04. CONTABILIDAD» y se aplican AQUÍ, en código; el modelo de IA solo lee.
//
// Ver docs/conocimiento/facturacion/trimestres-y-contabilidad.md.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const gastosDrive = require('./gastosDrive');
const tipoCambio = require('./tipoCambio');
const cuotasAutonomo = require('./cuotasAutonomo');

let _logica = null;
const logica = () => (_logica ||= import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/facturacion/logic/factura.js')).href));
let _plantilla = null;
const plantilla = () => (_plantilla ||= import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/cee-directo/logic/ofertaCee.js')).href));

const error = (msg, status = 400) => Object.assign(new Error(msg), { status });
// Redondeo a céntimos como Excel/la gestoría: 5,21 × 50 % = 2,605 → 2,61 (en
// coma flotante es 2,60499…; sin el épsilon saldría 2,60 y el 303 no cuadraría).
const r2 = (n) => { const x = Number(n) || 0; return (Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-7)) / 100; };
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));
const suma = (xs, f) => r2(xs.reduce((s, x) => s + num(typeof f === 'function' ? f(x) : x[f]), 0));
const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
/** «02/10/2026» → «2026-10-02» (las fechas de facturas_so son texto). */
const isoDeEs = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const esDeIso = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const LINEAS = ['ING', 'CAE', 'FML'];
const CONTRIBUYENTE = { ING: 'SL', CAE: 'SL', FML: 'AUTONOMO' };

// ── Criterios fiscales (SOP «Cierre contable trimestral», sección 4) ─────────
const IVA_GENERAL = 21;
const PCT_130 = 20;                  // pago fraccionado del 130 (art. 110 LIRPF)
const UMBRAL_INVERSION = 300;        // un EQUIPO de 300 € o más es inmovilizado
// NIF-IVA de un Estado miembro (lo que va al 349). «EU…» es el régimen de no
// establecidos (OpenAI): no es una adquisición intracomunitaria.
const UE = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'GR', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']);
const TIPO_TEXTO = {
    GASTO_CORRIENTE: 'Gasto corriente', ISP: 'Servicio extranjero ISP', COMBUSTIBLE: 'Combustible',
    VEHICULO: 'Vehículo', TICKET_SIN_NIF: 'Ticket sin NIF', RESTAURACION: 'Gasto corriente (restauración)',
    TASA: 'Tasa pública', RECIBO: 'Recibo (sin factura)', INVERSION: 'Inversión (inmovilizado)',
    BONO_CAE: 'Bono CAE pagado a cliente (cesión de ahorro)', NO_GASTO: 'No es un gasto',
    // Del autónomo, sacadas del extracto del banco (no llegan en PDF): sin IVA, 100 % en el IRPF.
    CUOTA_AUTONOMO: 'Cuota de autónomos (RETA)', COLEGIO: 'Cuota del colegio profesional',
};

// ── Trimestres y plazos ─────────────────────────────────────────────────────

/** «2026-T3» → { anio, n, t, desde, hasta, meses, corto: 'jul-sep', etiqueta: '2026-T3 (jul-sep)' } */
function parseTrimestre(t) {
    const m = /^(\d{4})-?T([1-4])$/i.exec(String(t || '').trim());
    if (!m) throw error('El trimestre va como AAAA-Tn (2026-T3)');
    const anio = Number(m[1]);
    const n = Number(m[2]);
    if (anio < 2020 || anio > 2100) throw error('Año fuera de rango');
    const m0 = (n - 1) * 3 + 1;
    const fin = new Date(Date.UTC(anio, m0 + 2, 0)).getUTCDate();
    const corto = `${MESES_CORTOS[m0 - 1]}-${MESES_CORTOS[m0 + 1]}`;
    return {
        anio, n, t: `${anio}-T${n}`, meses: [m0, m0 + 1, m0 + 2],
        desde: `${anio}-${String(m0).padStart(2, '0')}-01`,
        hasta: `${anio}-${String(m0 + 2).padStart(2, '0')}-${fin}`,
        corto, etiqueta: `${anio}-T${n} (${corto})`,
    };
}

const trimestreDeFecha = (iso) => `${iso.slice(0, 4)}-T${Math.ceil(Number(iso.slice(5, 7)) / 3)}`;

/**
 * Plazos de presentación. T1-T3: hasta el 20 del mes siguiente. T4: el 111
 * hasta el 20 de enero y el 303, el 130 y el 349 hasta el 30 de enero.
 */
function plazos({ anio, n }) {
    if (n === 4) return { m303: `${anio + 1}-01-30`, m111: `${anio + 1}-01-20`, m130: `${anio + 1}-01-30`, m349: `${anio + 1}-01-30` };
    const mes = String(n * 3 + 1).padStart(2, '0');
    const f = `${anio}-${mes}-20`;
    return { m303: f, m111: f, m130: f, m349: f };
}

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function plazoMasCercano(T, hoy) {
    const p = plazos(T);
    const [modelo, fecha] = Object.entries(p).sort((a, b) => a[1].localeCompare(b[1]))[0];
    return { modelo: modelo.replace('m', ''), fecha, dias: diasEntre(hoy, fecha), plazos: p };
}

// ── NIF ─────────────────────────────────────────────────────────────────────

const nifLimpio = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** El NIF español sin el «ES» del NIF-IVA (ESB19350222 → B19350222). */
const nifEs = (v) => { const s = nifLimpio(v); return /^ES[0-9A-Z]\d{7}[0-9A-Z]$/.test(s) ? s.slice(2) : s; };
/** El Estado miembro de un NIF-IVA (IE3668997OH → IE), o null. */
const ueDeNif = (v) => { const s = nifLimpio(v); const p = s.slice(0, 2); return UE.has(p) && /\d/.test(s.slice(2)) ? p : null; };

// ── Ventas ──────────────────────────────────────────────────────────────────

/**
 * Base, cuota y suplidos de una factura emitida. Con sus LÍNEAS es exacto (lo
 * calcula `logic/factura.js`, la fuente única). Sin ellas —el cuadro, que no
 * lee JSONB (regla 22)— se estima con la cuota: lo sujeto va al 21 % y lo que
 * sobra del neto son suplidos (las tasas). Así sale el 26ING_66: neto 166,39,
 * IVA 31,50 → base 150 y 16,39 de tasa.
 */
function desgloseVenta(f, L = null) {
    if (L && Array.isArray(f.lineas) && f.lineas.length) {
        const t = L.calcularFactura({ lineas: f.lineas, irpfPct: num(f.irpf_pct) });
        if (Math.abs(r2(t.iva) - r2(f.iva)) <= 0.02 && Math.abs(r2(t.neto) - r2(f.neto)) <= 0.02) {
            return { base: r2(t.baseSujeta), cuota: r2(f.iva), suplidos: r2(t.suplidos), tipos: L.desgloseIva(f.lineas), metodo: 'lineas' };
        }
    }
    const s = num(f.neto) < 0 || num(f.iva) < 0 ? -1 : 1;
    const neto = Math.abs(num(f.neto));
    const iva = Math.abs(num(f.iva));
    if (!iva) return { base: r2(s * neto), cuota: 0, suplidos: 0, tipos: [{ tipo: 0, base: r2(s * neto), cuota: 0 }], metodo: 'estimado' };
    const b21 = r2(iva / (IVA_GENERAL / 100));
    if (b21 >= neto - 0.05) {
        const tipo = Math.abs(b21 - neto) <= 0.05 ? IVA_GENERAL : Math.round((iva / neto) * 100);
        return { base: r2(s * neto), cuota: r2(s * iva), suplidos: 0, tipos: [{ tipo, base: r2(s * neto), cuota: r2(s * iva) }], metodo: 'estimado' };
    }
    return { base: r2(s * b21), cuota: r2(s * iva), suplidos: r2(s * (neto - b21)), tipos: [{ tipo: IVA_GENERAL, base: r2(s * b21), cuota: r2(s * iva) }], metodo: 'estimado' };
}

const COLS_VENTA = 'id, serie, tipo, numero, estado, fecha, vencimiento, fecha_pago, cliente_id, cliente_nombre, cliente_nif, concepto, neto, iva, irpf_pct, irpf, total, origen, fecha_operacion, rectifica_numero';

function cobroDe(estado, vencimiento, fechaPago, hoy) {
    if (estado === 'PAGADA') return { estado: 'COBRADA', fecha: fechaPago || null };
    if (estado === 'RECTIFICADA') return { estado: 'RECTIFICADA', fecha: null };
    if (vencimiento && vencimiento < hoy) return { estado: 'VENCIDA', fecha: null, dias: diasEntre(vencimiento, hoy) };
    return { estado: 'PENDIENTE', fecha: null };
}

function ventaDeEmitida(f, hoy, L = null) {
    const d = desgloseVenta(f, L);
    return {
        id: f.id, linea: f.serie, contribuyente: CONTRIBUYENTE[f.serie] || 'SL', tipo: f.tipo,
        numero: f.numero, fecha: f.fecha, vencimiento: f.vencimiento,
        cliente: f.cliente_nombre || '', nif: f.cliente_nif || '', concepto: f.concepto || '',
        estado: f.estado, cobro: cobroDe(f.estado, f.vencimiento, f.fecha_pago, hoy),
        base: d.base, cuota: d.cuota, suplidos: d.suplidos, irpf: r2(f.irpf), total: r2(f.total), tipos: d.tipos, metodo: d.metodo,
        origen: f.origen, fecha_operacion: f.fecha_operacion || null,
        pdf: f.pdf_id ? { driveId: f.pdf_id, nombre: f.pdf_nombre || null } : null,
    };
}

function ventaDeSo(f, nombres, hoy) {
    const fecha = isoDeEs(f.fecha);
    const venc = isoDeEs(f.vencimiento);
    const so = nombres[f.sujeto_obligado_id] || {};
    const base = r2(f.base);
    const cuota = r2(f.iva);
    return {
        id: f.id, linea: 'CAE', contribuyente: 'SL', tipo: 'F1', numero: f.numero, fecha, vencimiento: venc,
        cliente: so.nombre || '', nif: so.nif || '', concepto: 'Venta de ahorros energéticos (CAE)',
        estado: f.estado === 'PAGADA' ? 'PAGADA' : 'EMITIDA',
        cobro: cobroDe(f.estado === 'PAGADA' ? 'PAGADA' : 'EMITIDA', venc, isoDeEs(f.fecha_cobro), hoy),
        base, cuota, suplidos: 0, irpf: 0, total: r2(f.total),
        tipos: [{ tipo: base ? Math.round((cuota / base) * 100) : IVA_GENERAL, base, cuota }], metodo: 'columnas',
        origen: 'LOTE', lote_id: f.lote_id, pdf: f.drive_file_id ? { driveId: f.drive_file_id, nombre: null } : null,
    };
}

/** Lo emitido (ING y FML) entre dos fechas, sin borradores. Con `conLineas`, exacto. */
async function emitidas({ desde, hasta, conLineas = false, hoy = hoyMadrid() }) {
    const L = conLineas ? await logica() : null;
    const cols = conLineas ? `${COLS_VENTA}, lineas, pdf_id:pdf->>driveId, pdf_nombre:pdf->>nombre` : COLS_VENTA;
    const { data, error: e } = await supabase.from('facturas_emitidas').select(cols)
        .neq('estado', 'BORRADOR').gte('fecha', desde).lte('fecha', hasta).order('fecha').limit(5000);
    if (e) throw error(`No se pudieron leer las facturas: ${e.message}`, 503);
    return (data || []).map(f => ventaDeEmitida(f, hoy, L));
}

/** Las facturas CAE a los Sujetos Obligados (fecha en texto dd/mm/aaaa). */
async function facturasCae({ desde = null, hasta = null, hoy = hoyMadrid() } = {}) {
    const { data, error: e } = await supabase.from('facturas_so')
        .select('id, lote_id, numero, fecha, vencimiento, base, iva, total, estado, fecha_cobro, sujeto_obligado_id, drive_file_id')
        .not('numero', 'is', null).neq('estado', 'BORRADOR').limit(2000);
    if (e) throw error(`No se pudieron leer las facturas CAE: ${e.message}`, 503);
    const ids = [...new Set((data || []).map(f => f.sujeto_obligado_id).filter(Boolean))];
    const nombres = {};
    if (ids.length) {
        const { data: ps, error: e2 } = await supabase.from('prescriptores').select('id_empresa, razon_social, acronimo, cif').in('id_empresa', ids);
        if (e2) throw error(`No se pudieron leer los Sujetos Obligados: ${e2.message}`, 503);
        for (const p of ps || []) nombres[p.id_empresa] = { nombre: p.razon_social || p.acronimo || '', acronimo: p.acronimo || '', nif: p.cif || '' };
    }
    return (data || []).map(f => ventaDeSo(f, nombres, hoy))
        .filter(v => v.fecha && (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta))
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, 'es', { numeric: true }));
}

async function emisores() {
    const { data, error: e } = await supabase.from('facturacion_emisores').select('serie, razon_social, nif');
    if (e) throw error(`No se pudieron leer los emisores: ${e.message}`, 503);
    const de = Object.fromEntries((data || []).map(x => [x.serie, x]));
    return {
        sl: { nombre: de.ING?.razon_social || 'BROKERGY SL', nif: nifLimpio(de.ING?.nif) || null },
        autonomo: { nombre: de.FML?.razon_social || 'Autónomo (FML)', nif: nifLimpio(de.FML?.nif) || null },
    };
}

/** Totales de un montón de ventas. */
function totalesVentas(vs) {
    const porTipo = new Map();
    for (const v of vs) for (const t of v.tipos || []) {
        const x = porTipo.get(t.tipo) || { tipo: t.tipo, base: 0, cuota: 0 };
        x.base = r2(x.base + t.base); x.cuota = r2(x.cuota + t.cuota);
        porTipo.set(t.tipo, x);
    }
    return {
        n: vs.length, base: suma(vs, 'base'), cuota: suma(vs, 'cuota'), suplidos: suma(vs, 'suplidos'),
        irpf: suma(vs, 'irpf'), total: suma(vs, 'total'), por_tipo: [...porTipo.values()].sort((a, b) => b.tipo - a.tipo),
    };
}

// ── Gastos: el criterio fiscal (el CÓDIGO decide, el modelo solo leyó) ──────

/**
 * Aplica los criterios del SOP a un gasto leído. `g.datos` es lo leído (o lo
 * corregido a mano) y `g.ajustes` lo que se forzó (tipo, % deducible…). Todo en
 * EUROS: lo que viene en otra moneda se convierte al cambio del BCE del día de
 * la factura (art. 79.Once LIVA; `cambio(moneda, fecha)`, de `tipoCambio`). Lo
 * cargado en la tarjeta (`total_eur`) solo se usa si no hay cambio, y si están
 * los dos, la diferencia es la comisión del cambio (`dif_cambio`).
 */
function fiscalGasto(g, { nifSl = null, nifAutonomo = null, cambio = null } = {}) {
    const d = g.datos || {};
    const aj = g.ajustes || {};
    const avisos = [];
    const autonomo = g.contribuyente === 'AUTONOMO';
    const leido = d.total != null || d.base != null;
    // «… 6C62BA10-0017 (ANULADA por IVA erroneo).pdf»: la sustituye otra; no cuenta.
    const anulada = /\bANULAD[AO]\b/i.test(g.nombre || '');
    if (anulada && !aj.tipo) avisos.push('Su nombre dice ANULADA: no cuenta ni va al paquete (si no es así, cambia su tipo)');

    const moneda = String(d.moneda || 'EUR').toUpperCase();
    let factor = 1;
    let tc = null;
    if (moneda !== 'EUR') {
        tc = d.fecha && typeof cambio === 'function' ? cambio(moneda, d.fecha) : null;
        if (tc) factor = 1 / tc.valor;
        else if (num(d.total_eur) > 0 && num(d.total) > 0) {
            factor = num(d.total_eur) / num(d.total);
            avisos.push(`En ${moneda} sin el cambio del BCE de su fecha: se usa lo cargado en la tarjeta`);
        } else {
            factor = null;
            avisos.push(d.fecha ? `En ${moneda} y no se pudo traer el cambio del BCE del ${esDeIso(d.fecha)}: vuelve a abrirlo o pon lo cargado en la tarjeta`
                : `En ${moneda} sin fecha: sin ella no hay cambio (pon la fecha o lo cargado en la tarjeta)`);
        }
    }
    const eur = (v) => (v == null || factor == null ? null : r2(num(v) * factor));
    let base = eur(d.base);
    let cuota = eur(d.cuota);
    const irpf = eur(d.irpf) || 0;
    const suplidos = eur(d.suplidos) || 0;
    let total = eur(d.total);
    if (base == null && total != null) {
        if (cuota != null) base = r2(total - cuota - suplidos + irpf);
        else { base = r2(total - suplidos + irpf); cuota = 0; avisos.push('Sin desglose de IVA: el total se toma como base'); }
    }
    if (cuota == null) cuota = 0;
    if (total == null && base != null) total = r2(base + cuota + suplidos - irpf);
    if (leido && base != null && total != null && Math.abs(r2(base + cuota + suplidos - irpf) - total) > 0.05) {
        avisos.push(`No cuadra: base + IVA + suplidos − retención da ${r2(base + cuota + suplidos - irpf)} y el total es ${total}`);
    }
    // Con el cambio del BCE Y lo cargado en la tarjeta, lo que va de uno a otro es
    // la comisión del cambio de divisa: gasto financiero, no base del IVA.
    const cargadoEur = tc && num(d.total_eur) > 0 ? r2(num(d.total_eur)) : null;
    const difCambio = cargadoEur != null && total != null ? r2(cargadoEur - total) : 0;

    const pais = d.pais || (nifLimpio(d.nif).match(/^[A-Z]{2}(?=\d)/)?.[0] ?? null);
    const extranjero = !!pais && pais !== 'ES' && pais !== 'EU';
    let tipo = aj.tipo || null;
    if (!tipo) {
        if (d.documento === 'NO_ES_GASTO' || anulada) tipo = 'NO_GASTO';
        else if (leido && !num(d.total) && !num(d.base)) tipo = 'NO_GASTO';    // «consumo sept (0 EUR, aplica prepago)»
        else if (d.naturaleza === 'CESION_AHORRO') tipo = 'BONO_CAE';
        else if (d.naturaleza === 'COMBUSTIBLE') tipo = 'COMBUSTIBLE';
        else if (d.naturaleza === 'VEHICULO') tipo = 'VEHICULO';
        else if ((extranjero || /^EU\d/.test(nifLimpio(d.nif))) && !num(cuota)) tipo = 'ISP';
        else if (d.naturaleza === 'TASA') tipo = 'TASA';
        else if (d.naturaleza === 'RESTAURACION') tipo = 'RESTAURACION';
        else if (d.documento === 'SIMPLIFICADA' && !d.nif_destinatario) tipo = 'TICKET_SIN_NIF';
        else if (d.documento === 'RECIBO') tipo = 'RECIBO';
        else if (d.naturaleza === 'EQUIPO' && num(base) >= UMBRAL_INVERSION) tipo = 'INVERSION';
        else tipo = 'GASTO_CORRIENTE';
    }

    // IVA deducible (art. 95-97 LIVA)
    let pct;
    switch (tipo) {
        case 'COMBUSTIBLE': case 'VEHICULO': pct = 50; break;          // turismo: 50 % (art. 95.Tres)
        case 'TICKET_SIN_NIF': case 'RESTAURACION': case 'NO_GASTO':
        case 'TASA': case 'RECIBO': case 'BONO_CAE': case 'CUOTA_AUTONOMO': case 'COLEGIO': pct = 0; break;
        case 'ISP': pct = 0; break;                                     // se autorrepercute y se deduce aparte
        default: pct = 100;
    }
    if (tipo === 'RESTAURACION') avisos.push('Restauración: IVA no deducible (atenciones). Si fue un viaje de trabajo con factura a nombre propio, corrígelo');
    if (pct > 0 && extranjero && num(cuota) > 0) { pct = 0; avisos.push('IVA de otro país: no se deduce en el 303'); }
    const propio = autonomo ? nifAutonomo : nifSl;
    const dest = nifEs(d.nif_destinatario);
    if (pct > 0 && dest && propio && dest !== propio) {
        pct = 0;
        avisos.push(`La factura no está a nombre ${autonomo ? 'del autónomo' : 'de la sociedad'} (va al NIF ${dest}): su IVA no se deduce`);
    }
    if (aj.deducible_pct != null) pct = num(aj.deducible_pct);
    const ivaDeducible = r2(cuota * pct / 100);

    // ISP y 349
    const ispBase = tipo === 'ISP' ? r2(base || 0) : 0;
    const ispCuota = r2(ispBase * IVA_GENERAL / 100);
    const nifUe = ueDeNif(d.nif);
    const es349 = tipo === 'ISP' && !!nifUe;
    if (tipo === 'ISP' && pais && UE.has(pais) && !nifUe) avisos.push('Proveedor de la UE sin NIF-IVA: pídelo para el 349');

    // IRPF del autónomo (130): el combustible y el vehículo, 0 salvo afectación exclusiva.
    let irpfPct = null;
    let gastoIrpf = 0;
    if (autonomo) {
        irpfPct = ['COMBUSTIBLE', 'VEHICULO', 'NO_GASTO'].includes(tipo) ? 0 : 100;
        if (aj.irpf_deducible_pct != null) irpfPct = num(aj.irpf_deducible_pct);
        // El IVA que no se deduce es coste.
        gastoIrpf = r2((num(base) + suplidos + (cuota - ivaDeducible) + difCambio) * irpfPct / 100);
        if (irpf) avisos.push('Un gasto del autónomo con retención: esa retención la ingresa él, no la sociedad');
    }

    const documento = d.documento || null;
    const destino = tipo === 'NO_GASTO' ? null
        : (documento === 'SIMPLIFICADA' || documento === 'RECIBO' || ['TICKET_SIN_NIF', 'TASA', 'RECIBO', 'BONO_CAE', 'CUOTA_AUTONOMO', 'COLEGIO'].includes(tipo)) ? 'OTROS' : 'RECIBIDAS';

    return {
        tipo, tipo_texto: TIPO_TEXTO[tipo] || tipo, moneda,
        cambio: tc ? { moneda, valor: tc.valor, fecha: tc.fecha, fuente: 'BCE' } : null, cargado_eur: cargadoEur, dif_cambio: difCambio,
        base: base == null ? null : r2(base), cuota: r2(cuota), iva_pct: d.iva_pct ?? (base ? Math.round((cuota / base) * 100) : 0),
        suplidos, retencion: autonomo ? 0 : irpf, total: total == null ? null : r2(total),
        deducible_pct: pct, iva_deducible: ivaDeducible,
        isp_base: ispBase, isp_cuota: ispCuota, nif_ue: nifUe, es_349: es349,
        irpf_deducible_pct: irpfPct, gasto_irpf: gastoIrpf,
        inversion: tipo === 'INVERSION', destino, avisos,
    };
}

/** El contexto del criterio fiscal: los NIF propios y el cambio del BCE (sincrónico: antes, `precargarCambios`). */
const ctxFiscal = (quien) => ({ nifSl: quien.sl.nif, nifAutonomo: quien.autonomo.nif, cambio: tipoCambio.cambio });
/** Trae el cambio del BCE de los gastos en otra moneda. Sin red no falla: el gasto avisa. */
const precargarCambios = (filas) => tipoCambio.precargar((filas || []).map(g => ({ moneda: g.datos?.moneda, fecha: g.datos?.fecha })));

/**
 * La actividad de un gasto de la SL, como se repartió el T3 a mano (no hay
 * prorrata: las dos actividades llevan IVA; es para la gestoría): lo específico
 * de CAE en CAE, lo general en COMÚN. Por defecto: lo de la carpeta de CAE es CAE
 * salvo el teléfono y el material; lo de la carpeta de ING (la FNMT) y las FML de
 * Fran, COMÚN. «B - ING» no sale sola: solo si se elige a mano (en el T3 no hubo
 * ningún gasto propio de ingeniería). La elegida a mano manda.
 */
const GENERALES = new Set(['TELEFONIA', 'SUMINISTRO']);
function actividadDe(g) {
    if (g.contribuyente !== 'SL') return null;
    if (g.ajustes?.actividad) return g.ajustes.actividad;
    if (g.fml || g.linea !== 'CAE') return 'COMUN';
    return GENERALES.has(g.datos?.naturaleza) ? 'COMUN' : 'CAE';
}

/** Gasto de Drive + su criterio fiscal + la actividad (solo la SL: CAE, ING o COMÚN). */
function conFiscal(g, ctx) {
    const fiscal = fiscalGasto(g, ctx);
    return { ...g, actividad: actividadDe(g), fiscal };
}

/** Una FML emitida (de la app) como GASTO de la sociedad: 2.250 + 472,50 − 337,50. */
function gastoDeFml(v, aut, driveFila = null) {
    return {
        fileId: driveFila?.fileId || null, nombre: driveFila?.nombre || null, link: driveFila?.link || null,
        linea: driveFila?.linea || 'ING', contribuyente: 'SL', origen: 'APP', estado: 'APP', fml: v.numero,
        carpeta: driveFila?.carpeta || null, revisado: true,
        datos: {
            fecha: v.fecha, proveedor: aut.nombre, nif: aut.nif, numero: v.numero, documento: 'FACTURA', naturaleza: 'PROFESIONAL',
            concepto: v.concepto, base: v.base, iva_pct: IVA_GENERAL, cuota: v.cuota, irpf: v.irpf, suplidos: v.suplidos, total: v.total, moneda: 'EUR',
        },
        ajustes: driveFila?.ajustes || {},
        trimestre_fiscal: trimestreDeFecha(v.fecha),
    };
}

/**
 * La cuota de autónomos o la del colegio de un mes (de `cuotasAutonomo`) como
 * gasto del autónomo. Sin `fileId`: no es un justificante de las carpetas de
 * gastos (no se lee ni se corrige); el suyo va en `justificante` (el CSV del
 * banco o el recibo de la TGSS).
 */
function gastoDeCuota(c) {
    const C = cuotasAutonomo.CLASES[c.clase];
    const estimada = c.origen === 'ESTIMADA';
    return {
        fileId: null, nombre: `${c.fecha} - ${c.clase === 'RETA' ? 'TGSS - cuota de autónomos' : 'Colegio - cuota'} (${MESES[c.mes - 1]})`,
        linea: 'FML', contribuyente: 'AUTONOMO', origen: estimada ? 'ESTIMADA' : 'BANCO', estado: estimada ? 'ESTIMADA' : 'BANCO',
        revisado: !estimada, carpeta: 'EXTRACTOS Y RECIBOS / 02. AUTÓNOMO', link: c.fuente?.link || null,
        justificante: c.fuente || null, cuota_origen: c.origen,
        anio_carpeta: Number(c.fecha.slice(0, 4)), mes_carpeta: c.mes,
        datos: {
            fecha: c.fecha, proveedor: C.proveedor,
            concepto: `${C.texto} de ${MESES[c.mes - 1]}${estimada ? ' (estimada)' : c.origen === 'RECIBO' ? ' (recibo; importe del cargo más cercano)' : ''}`,
            documento: 'RECIBO', base: c.importe, cuota: 0, iva_pct: 0, total: c.importe, moneda: 'EUR',
        },
        ajustes: { tipo: c.clase === 'RETA' ? 'CUOTA_AUTONOMO' : 'COLEGIO' },
        trimestre_fiscal: trimestreDeFecha(c.fecha),
    };
}

/** Las cuotas del autónomo de un trimestre, con su criterio fiscal, y los avisos. Sin extractos, nada. */
function cuotasDe(T, ext, ctx, hoy) {
    if (!ext) return { filas: [], avisos: [] };
    const r = cuotasAutonomo.cuotasDe({ anio: T.anio, meses: T.meses, hoy, extractos: ext.extractos, recibos: ext.recibos });
    return { filas: r.filas.map(c => conFiscal(gastoDeCuota(c), ctx)), avisos: r.avisos };
}

// ── Ventas CAE que solo están en Drive (autofacturas) ───────────────────────

const NO_ES_VENTA = /JUSTIFICANTE|COMPROBANTE|TRANSFERENCIA|\bPAGO\b/i;
/** Los ficheros de VENTAS CAE de Drive que no son ninguna factura de la app (su nº no abre el nombre). */
function ventasCaeSinRegistrar(ficheros, numerosApp) {
    const ns = [...numerosApp].filter(Boolean);
    return (ficheros || []).filter(f => f.estado !== 'NO_LEGIBLE' && !NO_ES_VENTA.test(f.nombre)
        && !ns.some(n => f.nombre === n || f.nombre.startsWith(`${n} `) || f.nombre.startsWith(`${n}.`)));
}

/**
 * Una venta CAE de Drive ya LEÍDA → una venta como las de la app (origen DRIVE).
 * null si no está leída, si no es una factura (un justificante de pago) o si no
 * tiene fecha ni importes.
 *
 * Su COBRO va en las appProperties del propio fichero (`cobro_fecha`, que escribe
 * `cobroVentaDrive`): con fecha, COBRADA (cuenta en «Cobrado» del año del cobro y
 * en los días medios); sin ella, PENDIENTE (cuenta en «Te deben»). No tiene
 * vencimiento escrito, así que nunca sale VENCIDA. Antes del 25/10/2026 era «no
 * consta» y estas ventas facturaban sin deberse ni cobrarse nunca.
 */
function ventaDeDrive(f, hoy = hoyMadrid()) {
    const d = f.datos || {};
    if (!['LEIDO', 'REVISADO'].includes(f.estado)) return null;
    if (d.documento && !['FACTURA', 'RECTIFICATIVA'].includes(d.documento)) return null;
    const total = d.total != null ? r2(d.total) : null;
    let base = d.base != null ? r2(d.base) : null;
    let cuota = d.cuota != null ? r2(d.cuota) : null;
    if (base == null && total != null) base = r2(total - (cuota || 0));
    if (cuota == null && base != null && total != null) cuota = r2(total - base);
    if (base == null || !d.fecha) return null;
    cuota = cuota || 0;
    const cobrada = /^\d{4}-\d{2}-\d{2}$/.test(String(f.cobro_fecha || ''));
    const estado = cobrada ? 'PAGADA' : 'EMITIDA';
    return {
        id: f.fileId, linea: 'CAE', contribuyente: 'SL', tipo: d.documento === 'RECTIFICATIVA' ? 'R1' : 'F1',
        numero: d.numero || String(f.nombre).replace(/\.[a-z0-9]{2,4}$/i, ''), fecha: d.fecha, vencimiento: null,
        cliente: d.cliente || '', nif: d.nif || '', concepto: d.concepto || 'Venta de ahorros energéticos (CAE)',
        estado, cobro: cobroDe(estado, null, cobrada ? f.cobro_fecha : null, hoy),
        base, cuota, suplidos: 0, irpf: 0, total: total ?? r2(base + cuota),
        tipos: [{ tipo: d.iva_pct ?? (base ? Math.round((cuota / base) * 100) : IVA_GENERAL), base, cuota }], metodo: 'drive',
        origen: 'DRIVE', autofactura: !!d.autofactura, revisada: f.estado === 'REVISADO',
        drive: { fileId: f.fileId, nombre: f.nombre, link: f.link || null, carpeta: f.carpeta, estado: f.estado },
    };
}

/** Los números de TODAS las facturas CAE de la app (para saber qué hay en Drive que no esté). */
const numerosCae = async (hoy) => new Set((await facturasCae({ hoy })).map(v => v.numero));

/** «29/04/2026» o «2026-04-29» → «2026-04-29»; null si no se entiende. */
const fechaIsoDe = (s) => {
    const x = String(s || '').trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.test(x) ? x : isoDeEs(x);
    return iso && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
};

/**
 * Marca (o desmarca) el COBRO de una venta CAE que solo está en Drive (autofactura
 * de Iberdrola, la F-2026CAE_6 a Naturgy…): se guarda en `brk_cobro_fecha` de su
 * propio fichero. Es la función que llaman la ruta
 * `POST /api/facturacion/ventas-drive/:fileId/cobro` y los scripts.
 *
 *   cobroVentaDrive(fileId, { cobrada = true, fecha = 'dd/mm/aaaa' | 'AAAA-MM-DD' })
 *     → { venta: { …fila de Drive, cobro_fecha, venta: ventaDeDrive(fila) } }
 *
 * ESCRIBE en el Drive de PRODUCCIÓN. La fecha es obligatoria al cobrar y no puede
 * ser futura. Rechaza (409) una factura que ya está en la app (`facturas_so`):
 * esa se cobra desde su lote.
 */
async function cobroVentaDrive(fileId, { cobrada = true, fecha = null, hoy = hoyMadrid() } = {}) {
    if (!fileId) throw error('Falta el fichero');
    let iso = null;
    if (cobrada) {
        iso = fechaIsoDe(fecha);
        if (!iso) throw error('Indica la fecha del cobro (dd/mm/aaaa)');
        if (iso > hoy) throw error('La fecha del cobro no puede ser futura');
    }
    const numeros = await numerosCae(hoy);
    const fila = await gastosDrive.marcarCobroVenta(fileId, iso, {
        comprobar: (f) => {
            if (!ventasCaeSinRegistrar([f], numeros).length) throw error(`«${f.nombre}» es una factura de la app: su cobro se marca en el Resumen de su lote`, 409);
        },
    });
    return { venta: { ...fila, venta: ventaDeDrive(fila, hoy) } };
}

// Estados del lote desde los que el S.O. ya nos ha pagado (el mismo criterio que
// `LOTE_PAGO_CLIENTE` de routes/lotes.js y el estado de la fase 7).
const LOTE_YA_COBRADO = ['PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'];

/**
 * Un aviso ÁMBAR por cada lote en «PTE. PAGO BROKERGY A CLIENTE» o después cuya
 * factura al S.O. siga sin cobrar. Pasa cuando el lote se movió a mano por
 * `PATCH /lotes/:id/estado` sin marcar el cobro: el 25/10/2026, F-2026CAE_8, _9 y
 * _10 (LOTE-2026-004, LOTE-2025-003, LOTE-2025-001) salían como «Te deben 183.805 €».
 * Lleva en el `filtro` el lote y la factura, para que «Para hoy» no la repita.
 */
function avisosLotesSinCobro(lotes, facturas) {
    const porLote = new Map((lotes || []).filter(l => LOTE_YA_COBRADO.includes(l.estado)).map(l => [l.id, l]));
    return (facturas || [])
        .filter(v => v.origen === 'LOTE' && v.lote_id && porLote.has(v.lote_id) && v.cobro.estado !== 'COBRADA')
        .map(v => {
            const l = porLote.get(v.lote_id);
            const donde = l.estado === 'FINALIZADO' ? 'FINALIZADO' : 'PTE. PAGO A CLIENTE';
            return {
                tono: 'ambar',
                texto: `${l.codigo || 'Un lote'} ya está en ${donde} y su ${v.numero} sigue sin cobrar`,
                filtro: { vista: 'lotes', motivo: 'COBRO_SIN_MARCAR', lote_id: l.id, lote: l.codigo || null, factura_id: v.id, factura: v.numero, total: v.total },
            };
        });
}

/** «FACTP_1 · FACTP_2»: los nombres sin la extensión. */
const nombresCortos = (fs) => fs.map(f => String(f.nombre).replace(/\.[a-z0-9]{2,4}$/i, '')).join(' · ');

/**
 * La comparación con el año anterior NO vale si ese año tiene ventas CAE de Drive
 * sin leer (no cuentan en lo facturado): en 2025 eran cinco (dos FACTP de Iberdrola
 * y F-2025CAE_3/4/5 a Axoil) y el titular decía «87 veces lo de 2025». Devuelve
 * `{ comparable, nota }` y, si hace falta, el aviso.
 */
function comparacionAnterior(anio, { sinLeerAnterior = [], driveOk = true } = {}) {
    const ant = anio - 1;
    if (!driveOk) return { comparable: false, nota: `No se han podido leer las ventas CAE de Drive: la comparación con ${ant} no es fiable`, aviso: null };
    if (!sinLeerAnterior.length) return { comparable: true, nota: null, aviso: null };
    const n = sinLeerAnterior.length;
    const t = `${ant}-T${Math.ceil((sinLeerAnterior[0].mes || 1) / 3)}`;
    return {
        comparable: false,
        nota: `${ant} tiene ${n === 1 ? 'una venta CAE de Drive' : `${n} ventas CAE de Drive`} sin leer: hasta leerlas, lo de ${ant} está incompleto`,
        aviso: {
            tono: 'ambar',
            texto: `${n === 1 ? 'Una venta CAE de Drive' : `${n} ventas CAE de Drive`} de ${ant} sin leer (${nombresCortos(sinLeerAnterior)}): la comparación con ${ant} no vale hasta leerlas`,
            filtro: { vista: 'gastos', t },
        },
    };
}

/** Lo de las ventas CAE de Drive en los cobros: lo pendiente (una a una, para «Para hoy») y lo cobrado en el año. */
function cobrosDrive(ventas, anio) {
    const pend = ventas.filter(v => v.cobro.estado !== 'COBRADA' && v.total > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const cob = ventas.filter(v => v.cobro.estado === 'COBRADA' && String(v.cobro.fecha).startsWith(String(anio)));
    return {
        pendiente: suma(pend, 'total'), n_pendientes: pend.length, cobrado: suma(cob, 'total'), n_cobradas: cob.length,
        pendientes: pend.slice(0, 20).map(v => ({ fileId: v.id, numero: v.numero, cliente: v.cliente, fecha: v.fecha, total: v.total, autofactura: v.autofactura, nombre: v.drive?.nombre || null })),
    };
}

function totalesGastos(gs) {
    const f = (k) => suma(gs, x => x.fiscal[k]);
    const porActividad = {};
    for (const g of gs) {
        if (!g.actividad) continue;
        const a = porActividad[g.actividad] ||= { base: 0, iva_deducible: 0, n: 0 };
        a.base = r2(a.base + num(g.fiscal.base)); a.iva_deducible = r2(a.iva_deducible + g.fiscal.iva_deducible + g.fiscal.isp_cuota); a.n++;
    }
    return {
        n: gs.length, base: f('base'), cuota: f('cuota'), iva_deducible: f('iva_deducible'),
        isp_base: f('isp_base'), isp_cuota: f('isp_cuota'), retenciones: f('retencion'), suplidos: f('suplidos'),
        total: f('total'), gasto_irpf: f('gasto_irpf'), inversiones: suma(gs.filter(g => g.fiscal.inversion), x => x.fiscal.base),
        por_actividad: porActividad,
    };
}

// ── Modelos (ESTIMADOS) ─────────────────────────────────────────────────────

/**
 * 303 de un contribuyente. ISP: base de lo autorrepercutido × 21 % (sobre el
 * total, como la casilla), devengado y deducible a la vez. El IVA deducible de
 * las facturas interiores NO incluye el de ISP: así no se cuenta dos veces (el
 * libro del T3 hecho a mano lo sumaba en J y otra vez en «IVA deducible ISP»).
 */
function calcular303(ventas, gastos) {
    const tv = totalesVentas(ventas);
    const ispBase = suma(gastos, x => x.fiscal.isp_base);
    const ispCuota = r2(ispBase * IVA_GENERAL / 100);
    const deducible = suma(gastos, x => x.fiscal.iva_deducible);
    return {
        devengado: { por_tipo: tv.por_tipo, base: tv.base, cuota: tv.cuota },
        no_sujeto_suplidos: tv.suplidos,
        isp: { base: ispBase, cuota: ispCuota },
        deducible: { interior: deducible, isp: ispCuota, total: r2(deducible + ispCuota) },
        resultado: r2(tv.cuota + ispCuota - deducible - ispCuota),
    };
}

/** 111 de la SL: lo retenido a profesionales (certificadores, la FML de Fran), por perceptor. */
function calcular111(gastosSl) {
    const por = new Map();
    for (const g of gastosSl) {
        if (!(g.fiscal.retencion > 0)) continue;
        const k = nifLimpio(g.datos.nif) || sinTildes(g.datos.proveedor);
        const x = por.get(k) || { perceptor: g.datos.proveedor || '', nif: nifLimpio(g.datos.nif) || null, base: 0, retencion: 0, n: 0, origen: g.origen === 'APP' ? 'FML' : 'PROFESIONAL' };
        x.base = r2(x.base + num(g.fiscal.base)); x.retencion = r2(x.retencion + g.fiscal.retencion); x.n++;
        por.set(k, x);
    }
    const perceptores = [...por.values()].sort((a, b) => b.retencion - a.retencion);
    return { perceptores, base: suma(perceptores, 'base'), retencion: suma(perceptores, 'retencion') };
}

function calcular349(gastosSl) {
    const por = new Map();
    for (const g of gastosSl) {
        if (!g.fiscal.es_349) continue;
        const k = nifLimpio(g.datos.nif);
        const x = por.get(k) || { proveedor: g.datos.proveedor || '', nif: k, pais: g.fiscal.nif_ue, base: 0, n: 0 };
        x.base = r2(x.base + g.fiscal.isp_base); x.n++;
        por.set(k, x);
    }
    const candidatos = [...por.values()];
    return { candidatos, base: suma(candidatos, 'base') };
}

/**
 * 130 del autónomo, ACUMULADO del año: 20 % del rendimiento (ingresos − gastos
 * deducibles) − retenciones soportadas − lo ingresado en los trimestres
 * anteriores (aquí, lo que ESTE cálculo dio en ellos). Nunca negativo.
 * `trimestres` = [{ t, ingresos, gastos, retenciones }] del T1 al que se pide.
 */
function calcular130(trimestres) {
    let ing = 0, gas = 0, ret = 0, pagado = 0;
    const filas = [];
    for (const q of trimestres) {
        ing = r2(ing + num(q.ingresos)); gas = r2(gas + num(q.gastos)); ret = r2(ret + num(q.retenciones));
        const rendimiento = r2(ing - gas);
        const cuota = r2(Math.max(0, rendimiento) * PCT_130 / 100);
        const resultado = r2(Math.max(0, cuota - ret - pagado));
        filas.push({ t: q.t, ingresos: ing, gastos: gas, rendimiento, cuota, retenciones: ret, pagos_anteriores: pagado, resultado });
        pagado = r2(pagado + resultado);
    }
    return { acumulado: filas[filas.length - 1] || null, por_trimestre: filas, pct: PCT_130 };
}

// ── Checklist del SOP («que no se escape nada») ─────────────────────────────

const RECURRENTES = [
    { clave: 'LANUZA', texto: 'Facturas AP del certificador Lanuza (una por mes)', re: /LANUZA|ATLICENCIAS/ },
    { clave: 'OPENAI', texto: 'Software: ChatGPT (OpenAI) de los 3 meses', re: /OPENAI|CHATGPT/ },
    { clave: 'ANTHROPIC', texto: 'Software: Claude (Anthropic) de los 3 meses', re: /ANTHROPIC|CLAUDE/ },
    { clave: 'PEPEPHONE', texto: 'Pepephone de los 3 meses', re: /PEPEPHONE|PEPEMOBILE/ },
];

/** Los meses que cubre una FML: el de su fecha y el que nombre su concepto («– julio 2026»). */
function mesesDeFml(v) {
    const out = new Set();
    if (v.fecha) out.add(Number(v.fecha.slice(5, 7)));
    const t = `${v.concepto || ''} ${v.fecha_operacion || ''}`.toLowerCase();
    MESES.forEach((m, i) => { if (t.includes(m)) out.add(i + 1); });
    return out;
}

/** Huecos y repetidos de una serie ({YY}ING_n) entre su primer y su último número. */
function huecosSerie(numeros, prefijo) {
    const ns = numeros.map(n => { const m = new RegExp(`^${prefijo}_(\\d+)$`).exec(n || ''); return m ? Number(m[1]) : null; }).filter(n => n != null).sort((a, b) => a - b);
    if (!ns.length) return { desde: null, hasta: null, huecos: [], repetidos: [] };
    const set = new Set(ns);
    const huecos = [];
    for (let i = ns[0]; i <= ns[ns.length - 1]; i++) if (!set.has(i)) huecos.push(`${prefijo}_${i}`);
    const repetidos = [...new Set(ns.filter((n, i) => ns.indexOf(n) !== i))].map(n => `${prefijo}_${n}`);
    return { desde: `${prefijo}_${ns[0]}`, hasta: `${prefijo}_${ns[ns.length - 1]}`, huecos, repetidos };
}

function checklist(T, { ventasSl, ventasAut, gastos, numerosIngAnio, ventasDrive, ventasCae = { leidas: [], sin_leer: [] } }) {
    const out = [];
    const cubiertos = new Set();
    for (const v of ventasAut) for (const m of mesesDeFml(v)) cubiertos.add(m);
    const faltanFml = T.meses.filter(m => !cubiertos.has(m));
    out.push({ clave: 'FML', texto: 'Facturas FML del autónomo de los 3 meses', ok: !faltanFml.length,
        detalle: faltanFml.length ? `Falta ${faltanFml.map(m => MESES[m - 1]).join(', ')}` : ventasAut.map(v => v.numero).join(', ') });

    const gsSl = gastos.filter(g => g.contribuyente === 'SL');
    for (const r of RECURRENTES) {
        const suyos = gsSl.filter(g => r.re.test(sinTildes(`${g.datos?.proveedor || ''} ${g.nombre || ''}`)));
        const meses = new Set(suyos.map(g => (g.datos?.fecha ? Number(g.datos.fecha.slice(5, 7)) : g.mes_carpeta)));
        const falta = T.meses.filter(m => !meses.has(m));
        out.push({ clave: r.clave, texto: r.texto, ok: !falta.length,
            detalle: falta.length ? `Falta ${falta.map(m => MESES[m - 1]).join(', ')} (${suyos.length} encontradas)` : `${suyos.length} encontradas` });
    }

    const caeApp = ventasSl.filter(v => v.linea === 'CAE' && v.origen !== 'DRIVE');
    const caeSinCobrar = caeApp.filter(v => v.cobro.estado !== 'COBRADA');
    // Las de Drive también se cobran (su cobro va en el propio fichero, `cobroVentaDrive`).
    const driveSinCobrar = ventasCae.leidas.filter(v => v.cobro.estado !== 'COBRADA');
    out.push({ clave: 'CAE', texto: 'Ventas CAE (también las autofacturas de Iberdrola/Naturgy) y su cobro',
        ok: !caeSinCobrar.length && !driveSinCobrar.length && !ventasCae.sin_leer.length,
        detalle: [
            caeApp.length ? `${caeApp.length} en la app${caeSinCobrar.length ? `, sin cobrar: ${caeSinCobrar.map(v => v.numero).join(', ')}` : ', cobradas'}` : 'Ninguna en la app',
            ventasCae.leidas.length ? `${ventasCae.leidas.length} leídas de Drive: ${ventasCae.leidas.map(v => `${v.numero} (${v.cliente || '¿cliente?'})`).join(', ')}${driveSinCobrar.length ? `; sin el cobro marcado: ${driveSinCobrar.map(v => v.numero).join(', ')}` : ''}` : null,
            ventasCae.sin_leer.length ? `En Drive sin leer: ${ventasCae.sin_leer.map(f => f.nombre).join(' · ')}` : null,
        ].filter(Boolean).join('. ') });

    const cuotas = gastos.filter(g => g.ajustes?.tipo === 'CUOTA_AUTONOMO' || g.ajustes?.tipo === 'COLEGIO');
    const estimadas = cuotas.filter(g => g.origen === 'ESTIMADA');
    const sinReta = T.meses.filter(m => !cuotas.some(g => g.ajustes.tipo === 'CUOTA_AUTONOMO' && g.mes_carpeta === m));
    out.push({ clave: 'CUOTAS', texto: 'Cuota de autónomos y colegio, con su extracto', ok: cuotas.length ? !estimadas.length : null,
        detalle: !cuotas.length ? 'Ninguna este trimestre (sin extractos en 02. AUTÓNOMO, o aún no se ha cargado)'
            : [`${cuotas.length} (${fmt(suma(cuotas, x => x.fiscal.base))})`,
                estimadas.length ? `estimadas: ${estimadas.map(g => g.datos.concepto).join(', ')}` : 'todas del banco',
                sinReta.length ? `sin cuota de autónomos: ${sinReta.map(m => MESES[m - 1]).join(', ')}` : null,
            ].filter(Boolean).join(' · ') });

    const yy = String(T.anio).slice(2);
    const h = huecosSerie(numerosIngAnio, `${yy}ING`);
    const repDrive = [];
    const vistos = new Map();
    for (const f of ventasDrive?.ING || []) {
        const n = /^(\d{2}ING_\d+)\b/.exec(f.nombre)?.[1];
        if (!n) continue;
        if (vistos.has(n)) repDrive.push(`${n} (${vistos.get(n)} / ${f.nombre})`); else vistos.set(n, f.nombre);
    }
    out.push({ clave: 'SERIE_ING', texto: `Serie ${yy}ING_n correlativa sin huecos`, ok: !h.huecos.length && !h.repetidos.length && !repDrive.length,
        detalle: [h.desde ? `${h.desde} a ${h.hasta}` : 'Sin facturas', h.huecos.length ? `huecos: ${h.huecos.join(', ')}` : null,
            repDrive.length ? `dos PDF con el mismo número en Drive: ${repDrive.join(' · ')}` : null].filter(Boolean).join(' · ') });

    const sinLeer = gastos.filter(g => ['SIN_LEER', 'CAMBIADO', 'ERROR'].includes(g.estado));
    const sinRevisar = gastos.filter(g => g.estado === 'LEIDO');
    out.push({ clave: 'GASTOS_LEIDOS', texto: 'Todos los gastos leídos y revisados', ok: !sinLeer.length && !sinRevisar.length,
        detalle: `${gastos.length} gastos · ${sinLeer.length} sin leer · ${sinRevisar.length} sin revisar` });
    out.push({ clave: 'EXTRACTOS', texto: 'Extractos de tarjeta cuadrados con las facturas', ok: null, detalle: 'No se comprueba solo: míralo con los extractos del paquete (06)' });
    return out;
}

// ── El trimestre ────────────────────────────────────────────────────────────

async function pendientesDeCobro(hoy) {
    const { data, error: e } = await supabase.from('facturas_emitidas').select(COLS_VENTA).eq('estado', 'EMITIDA').gt('total', 0).order('vencimiento').limit(2000);
    if (e) throw error(`No se pudieron leer los cobros: ${e.message}`, 503);
    const fe = (data || []).map(f => ventaDeEmitida(f, hoy));
    const so = (await facturasCae({ hoy })).filter(v => v.cobro.estado !== 'COBRADA');
    return [...fe, ...so].map(v => ({
        linea: v.linea, contribuyente: v.contribuyente, numero: v.numero, fecha: v.fecha, vencimiento: v.vencimiento,
        cliente: v.cliente, total: v.total, vencida: v.cobro.estado === 'VENCIDA', dias_vencida: v.cobro.dias || 0,
    })).sort((a, b) => String(a.vencimiento).localeCompare(String(b.vencimiento)));
}

/**
 * El detalle de un trimestre. Lee las ventas de la BD (con sus líneas) y los
 * gastos de Drive (lo ya leído, de sus appProperties: aquí no se gasta Gemini).
 */
async function trimestre(tStr, { hoy = hoyMadrid(), con130 = true, conVentasDrive = true } = {}) {
    const T = parseTrimestre(tStr);
    const avisos = [];
    const [quien, fe, cae] = await Promise.all([
        emisores(),
        emitidas({ desde: T.desde, hasta: T.hasta, conLineas: true, hoy }),
        facturasCae({ desde: T.desde, hasta: T.hasta, hoy }),
    ]);
    const ctx = ctxFiscal(quien);
    const ventasSl = [...fe.filter(v => v.contribuyente === 'SL'), ...cae].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, 'es', { numeric: true }));
    const ventasAut = fe.filter(v => v.contribuyente === 'AUTONOMO');

    // Gastos (Drive). Si Drive falla, el trimestre sale igual con el aviso.
    let lista = { filas: [], ignorados: [], sinCarpeta: [] };
    let driveOk = true;
    try { lista = await gastosDrive.listarGastos(T); }
    catch (e) { driveOk = false; avisos.push({ tono: 'rojo', texto: `No se pudo leer Drive: los gastos no están (${e.message})` }); }
    await precargarCambios(lista.filas);
    for (const c of lista.sinCarpeta) avisos.push({ tono: 'azul', texto: `No existe la carpeta ${c}` });
    if (lista.vecinos?.length) avisos.push({ tono: 'ambar', texto: `${lista.vecinos.length} justificantes sin leer en la carpeta de ${MESES[(T.meses[0] + 10) % 12]}: los que tengan fecha de este trimestre (la Pepephone del día 1) contarán aquí al leerlos`, filtro: { vista: 'gastos', t: T.t, estado: 'SIN_LEER' } });

    // Las FML de Fran son GASTO de la sociedad: sus cifras salen de la app. Si su
    // PDF está en las carpetas de gastos de la SL, se usa ese fichero y no se lee.
    const fmlDrive = new Map(lista.filas.filter(g => g.fml).map(g => [g.fml, g]));
    const gastosSl = [];
    const gastosAut = [];
    for (const g of lista.filas) {
        if (g.fml) continue;
        (g.contribuyente === 'SL' ? gastosSl : gastosAut).push(conFiscal({ ...g, origen: 'DRIVE' }, ctx));
    }
    for (const v of ventasAut) {
        const fila = fmlDrive.get(String(v.numero).toUpperCase()) || null;
        gastosSl.push(conFiscal(gastoDeFml(v, quien.autonomo, fila), ctx));
        if (driveOk && !fila) avisos.push({ tono: 'azul', texto: `${v.numero} no está en las carpetas de gastos de la SL: se cuenta con los datos de la app` });
    }
    for (const [n, g] of fmlDrive) {
        if (!ventasAut.some(v => String(v.numero).toUpperCase() === n)) avisos.push({ tono: 'ambar', texto: `${n} está en ${g.carpeta} pero la app no la tiene en este trimestre`, filtro: { vista: 'facturas', serie: 'FML' } });
    }
    // La cuota de autónomos y la del colegio, de los extractos del banco del autónomo.
    let extAut = null;
    if (driveOk) {
        try { extAut = await gastosDrive.extractosAutonomo(); }
        catch (e) { avisos.push({ tono: 'ambar', texto: `No se pudieron leer los extractos del autónomo: la cuota de autónomos y el colegio no cuentan (${e.message})` }); }
    }
    const cuotas = cuotasDe(T, extAut, ctx, hoy);
    gastosAut.push(...cuotas.filas);
    for (const a of cuotas.avisos) avisos.push({ ...a, filtro: { vista: 'gastos', t: T.t } });
    // Por fecha de la factura; sin leer, la del nombre («2026-07-04 - SUPABASE …»).
    const fechaOrden = (g) => g.datos?.fecha || /^(\d{4}-\d{2}-\d{2})/.exec(g.nombre || '')?.[1] || '9999';
    const ordenar = (a, b) => fechaOrden(a).localeCompare(fechaOrden(b)) || String(a.nombre || '').localeCompare(String(b.nombre || ''));
    gastosSl.sort(ordenar); gastosAut.sort(ordenar);
    const todos = [...gastosSl, ...gastosAut];

    const sinLeer = todos.filter(g => ['SIN_LEER', 'CAMBIADO', 'ERROR'].includes(g.estado));
    const sinRevisar = todos.filter(g => g.estado === 'LEIDO');
    if (sinLeer.length) avisos.push({ tono: 'ambar', texto: `${sinLeer.length} gastos sin leer: sus importes no cuentan todavía`, filtro: { vista: 'gastos', t: T.t, estado: 'SIN_LEER' } });
    if (sinRevisar.length) avisos.push({ tono: 'azul', texto: `${sinRevisar.length} gastos leídos sin revisar`, filtro: { vista: 'gastos', t: T.t, estado: 'LEIDO' } });
    for (const g of todos) {
        if (g.fecha_fuera && g.datos?.fecha && g.datos.fecha < T.desde) avisos.push({ tono: 'azul', texto: `${g.nombre}: factura del ${esDeIso(g.datos.fecha)} archivada en este trimestre; quítala si ya se declaró`, filtro: { vista: 'gastos', t: T.t, fileId: g.fileId } });
        if (g.fiscal.tipo === 'NO_GASTO') avisos.push({ tono: 'azul', texto: `${g.nombre}: no parece un gasto (no cuenta ni va al paquete)`, filtro: { vista: 'gastos', t: T.t, fileId: g.fileId } });
    }

    // Ventas en Drive: las CAE que no están en la app (autofacturas de Iberdrola,
    // una factura hecha fuera) cuentan como venta de la SL ya LEÍDAS; y los
    // números repetidos.
    let ventasDrive = null;
    const ventasCae = { leidas: [], sin_leer: [] };
    if (conVentasDrive && driveOk) {
        try { ventasDrive = await gastosDrive.listarVentas({ anio: T.anio, meses: T.meses }); }
        catch (e) { avisos.push({ tono: 'ambar', texto: `No se pudieron listar las carpetas de VENTAS: ${e.message}` }); }
    }
    if (ventasDrive) {
        for (const f of ventasCaeSinRegistrar(ventasDrive.CAE, await numerosCae(hoy))) {
            if (ESTADOS_PENDIENTES.includes(f.estado)) { ventasCae.sin_leer.push(f); continue; }
            const v = ventaDeDrive(f, hoy);
            if (!v) { avisos.push({ tono: 'azul', texto: `${f.nombre} (ventas CAE): ${f.datos?.documento && !['FACTURA', 'RECTIFICATIVA'].includes(f.datos.documento) ? 'no es una factura' : 'sin fecha o sin importes'}: no cuenta`, filtro: { vista: 'gastos', t: T.t } }); continue; }
            if (v.fecha < T.desde || v.fecha > T.hasta) { avisos.push({ tono: 'azul', texto: `${f.nombre}: venta CAE del ${esDeIso(v.fecha)}, de otro trimestre: no cuenta aquí`, filtro: { vista: 'gastos', t: T.t } }); continue; }
            ventasSl.push(v);
            ventasCae.leidas.push(v);
        }
        ventasSl.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));
        if (ventasCae.sin_leer.length) avisos.push({ tono: 'ambar', texto: `${ventasCae.sin_leer.length === 1 ? 'Una venta CAE de Drive' : `${ventasCae.sin_leer.length} ventas CAE de Drive`} sin leer (${ventasCae.sin_leer.map(f => f.nombre).join(' · ')}): su IVA no cuenta en el 303 todavía`, filtro: { vista: 'gastos', t: T.t } });
        const sinRevisarV = ventasCae.leidas.filter(v => !v.revisada);
        if (sinRevisarV.length) avisos.push({ tono: 'azul', texto: `${sinRevisarV.length === 1 ? 'Una venta CAE leída' : `${sinRevisarV.length} ventas CAE leídas`} de Drive sin revisar: ${sinRevisarV.map(v => `${v.numero} (${v.cliente || 'sin cliente'}, base ${fmt(v.base)})`).join(' · ')}`, filtro: { vista: 'gastos', t: T.t } });
    }

    // La serie ING del año hasta el final del trimestre.
    const { data: ingAnio, error: e1 } = await supabase.from('facturas_emitidas').select('numero')
        .eq('serie', 'ING').eq('tipo', 'F1').neq('estado', 'BORRADOR').gte('fecha', `${T.anio}-01-01`).lte('fecha', T.hasta);
    if (e1) throw error(`No se pudo leer la serie ING: ${e1.message}`, 503);

    const m303 = { sl: calcular303(ventasSl, gastosSl), autonomo: calcular303(ventasAut, gastosAut) };
    const m111 = calcular111(gastosSl);
    const m349 = calcular349(gastosSl);

    let m130 = null;
    if (con130) {
        const filas = [];
        let sinLeerAntes = 0;
        let cuotasAntes = 0;
        for (let k = 1; k <= T.n; k++) {
            const Tk = k === T.n ? T : parseTrimestre(`${T.anio}-T${k}`);
            let ingresos, retenciones;
            if (k === T.n) { ingresos = suma(ventasAut, 'base'); retenciones = suma(ventasAut, 'irpf'); }
            else {
                const vk = (await emitidas({ desde: Tk.desde, hasta: Tk.hasta, hoy })).filter(v => v.linea === 'FML');
                ingresos = suma(vk, 'base'); retenciones = suma(vk, 'irpf');
            }
            let gk = gastosAut;
            if (k !== T.n && driveOk) {
                try {
                    const lk = await gastosDrive.listarGastos(Tk, { lineas: ['FML'] });
                    await precargarCambios(lk.filas);
                    gk = lk.filas.map(g => conFiscal({ ...g, origen: 'DRIVE' }, ctx));
                    sinLeerAntes += gk.filter(g => ['SIN_LEER', 'CAMBIADO', 'ERROR'].includes(g.estado)).length;
                } catch { gk = []; }
                const ck = cuotasDe(Tk, extAut, ctx, hoy);
                gk = [...gk, ...ck.filas];
                cuotasAntes += ck.filas.filter(g => g.origen === 'ESTIMADA').length;
            }
            filas.push({ t: Tk.t, ingresos, gastos: suma(gk, x => x.fiscal.gasto_irpf), retenciones });
        }
        m130 = {
            ...calcular130(filas),
            nota: 'Estimado. Los gastos incluyen la cuota de autónomos y la del colegio, sacadas de los extractos del banco de «EXTRACTOS Y RECIBOS / 02. AUTÓNOMO» (sin extracto ni recibo, estimadas con la cuota del cargo más cercano). '
                + 'Si el 70 % o más de los ingresos del año anterior llevó retención, el autónomo puede no estar obligado al 130 (art. 109.3 RIRPF).',
        };
        if (sinLeerAntes) avisos.push({ tono: 'ambar', texto: `${sinLeerAntes} gastos del autónomo de trimestres anteriores sin leer: el 130 no los cuenta`, filtro: { vista: 'gastos', t: `${T.anio}-T1` } });
        if (cuotasAntes) avisos.push({ tono: 'azul', texto: `${cuotasAntes} cuotas (autónomos o colegio) de trimestres anteriores ESTIMADAS en el 130: faltan sus extractos`, filtro: { vista: 'gastos', t: `${T.anio}-T1` } });
    }

    const lista_checklist = checklist(T, { ventasSl, ventasAut, gastos: todos, numerosIngAnio: (ingAnio || []).map(x => x.numero), ventasDrive, ventasCae });
    for (const c of lista_checklist) if (c.ok === false && !['GASTOS_LEIDOS'].includes(c.clave)) avisos.push({ tono: 'ambar', texto: `${c.texto}: ${c.detalle}`, filtro: { vista: 'trimestre', t: T.t, checklist: c.clave } });
    for (const v of [...ventasSl, ...ventasAut]) if (v.metodo === 'estimado') avisos.push({ tono: 'azul', texto: `${v.numero}: sin líneas que cuadren, la base se estima con la cuota` });

    return {
        t: T.t, etiqueta: T.etiqueta, desde: T.desde, hasta: T.hasta, generado: new Date().toISOString(),
        estimado: true, nota: 'ESTIMACIÓN para preparar el cierre: los modelos los presenta la gestoría.',
        plazos: plazos(T), plazo: plazoMasCercano(T, hoy),
        contribuyentes: quien,
        ventas: {
            sl: { facturas: ventasSl, totales: totalesVentas(ventasSl) },
            autonomo: { facturas: ventasAut, totales: totalesVentas(ventasAut) },
        },
        gastos: {
            sl: { filas: gastosSl, totales: totalesGastos(gastosSl) },
            autonomo: { filas: gastosAut, totales: totalesGastos(gastosAut) },
            sin_leer: sinLeer.length, sin_revisar: sinRevisar.length, ignorados: lista.ignorados, drive: driveOk,
        },
        ventas_drive: ventasDrive,
        ventas_cae_drive: { leidas: ventasCae.leidas.length, base: suma(ventasCae.leidas, 'base'), sin_leer: ventasCae.sin_leer.map(f => ({ fileId: f.fileId, nombre: f.nombre, carpeta: f.carpeta, mes: f.mes, link: f.link })) },
        m303, m111, m349, m130,
        checklist: lista_checklist,
        pendientes_cobro: await pendientesDeCobro(hoy),
        avisos,
    };
}

// ── La lista de gastos de un trimestre (barata: lo leído está en Drive) ─────

const ESTADOS_PENDIENTES = ['SIN_LEER', 'CAMBIADO', 'ERROR'];

/**
 * Los gastos de un trimestre con su criterio fiscal, para la pantalla de
 * revisión. No lee con Gemini (eso es `POST /gastos/leer`). Las FML de las
 * carpetas de la SL salen con las cifras de la app.
 */
async function gastos(tStr, { hoy = hoyMadrid() } = {}) {
    const T = parseTrimestre(tStr);
    const [quien, lista, fml, vd, numeros, ext] = await Promise.all([
        emisores(),
        gastosDrive.listarGastos(T),
        emitidas({ desde: T.desde, hasta: T.hasta }).then(vs => vs.filter(v => v.linea === 'FML')),
        gastosDrive.listarVentas({ anio: T.anio, meses: T.meses }, { lineas: ['CAE'] }),
        numerosCae(hoy),
        gastosDrive.extractosAutonomo().catch(() => null),
    ]);
    const ctx = ctxFiscal(quien);
    await precargarCambios(lista.filas);
    const filas = lista.filas.map(g => {
        if (!g.fml) return conFiscal({ ...g, origen: 'DRIVE' }, ctx);
        const v = fml.find(x => String(x.numero).toUpperCase() === g.fml);
        return v ? conFiscal(gastoDeFml(v, quien.autonomo, g), ctx) : conFiscal({ ...g, origen: 'DRIVE' }, ctx);
    });
    // La cuota de autónomos y el colegio (del banco): se ven, no se leen ni se corrigen.
    const cuotas = cuotasDe(T, ext, ctx, hoy);
    filas.push(...cuotas.filas);
    // Las ventas CAE de Drive que no están en la app: se leen con el mismo botón.
    const ventasCae = ventasCaeSinRegistrar(vd.CAE, numeros).map(f => ({ ...f, venta: ventaDeDrive(f, hoy) }));
    const vPend = ventasCae.filter(f => ESTADOS_PENDIENTES.includes(f.estado)).length;
    const cuenta = (e) => filas.filter(g => g.estado === e).length;
    return {
        t: T.t, etiqueta: T.etiqueta, desde: T.desde, hasta: T.hasta,
        filas, ignorados: lista.ignorados, sin_carpeta: lista.sinCarpeta,
        // Sin leer en la carpeta del mes ANTERIOR: al leerlos, los de fecha de este trimestre entran aquí.
        vecinos_sin_leer: (lista.vecinos || []).map(g => ({ fileId: g.fileId, nombre: g.nombre, carpeta: g.carpeta, link: g.link })),
        ventas_cae: ventasCae,
        avisos_cuotas: cuotas.avisos,
        resumen: {
            n: filas.length, sin_leer: filas.filter(g => ESTADOS_PENDIENTES.includes(g.estado)).length + (lista.vecinos || []).length + vPend,
            leidos: cuenta('LEIDO'), revisados: cuenta('REVISADO'), app: cuenta('APP'), cambiados: cuenta('CAMBIADO'), errores: cuenta('ERROR'),
            banco: cuenta('BANCO'), estimadas: cuenta('ESTIMADA'), ventas_sin_leer: vPend,
        },
        totales: {
            sl: totalesGastos(filas.filter(g => g.contribuyente === 'SL')),
            autonomo: totalesGastos(filas.filter(g => g.contribuyente === 'AUTONOMO')),
        },
        tipos: TIPO_TEXTO, actividades: ['CAE', 'ING', 'COMUN'],
    };
}

/**
 * «Leer con IA» del trimestre: los gastos pendientes (`leerPendientes`) y, con el
 * tiempo que quede (nginx corta a los 120 s), las VENTAS CAE de Drive que no están
 * en la app. Lo que no da tiempo sale en `quedan` y se lee en la siguiente tanda.
 */
async function leer(tStr, { fileIds = null, forzar = false, hoy = hoyMadrid() } = {}) {
    const T = parseTrimestre(tStr);
    const t0 = Date.now();
    const g = await gastosDrive.leerPendientes(T, { fileIds, forzar });
    const [vd, numeros] = await Promise.all([gastosDrive.listarVentas({ anio: T.anio, meses: T.meses }, { lineas: ['CAE'] }), numerosCae(hoy)]);
    const pedidas = fileIds ? new Set([].concat(fileIds)) : null;
    const pend = ventasCaeSinRegistrar(vd.CAE, numeros)
        .filter(f => (pedidas ? pedidas.has(f.fileId) : ['SIN_LEER', 'CAMBIADO'].includes(f.estado)));
    let v = { leidos: [], errores: [], quedan: 0, tokens: { in: 0, out: 0 } };
    const restante = 85000 - (Date.now() - t0);
    if (pend.length && restante > 15000) v = await gastosDrive.leerVentas(T, { fileIds: pend.map(f => f.fileId), forzar: forzar && !!pedidas, presupuestoMs: restante });
    else v.quedan = pend.length;
    return {
        leidos: [...g.leidos, ...v.leidos], errores: [...g.errores, ...v.errores], quedan: g.quedan + v.quedan,
        ventas: { leidas: v.leidos.length, errores: v.errores.length, quedan: v.quedan },
        tokens: { in: (g.tokens?.in || 0) + (v.tokens?.in || 0), out: (g.tokens?.out || 0) + (v.tokens?.out || 0) },
        segundos: Math.round((Date.now() - t0) / 100) / 10,
    };
}

/** Una fila de gasto recién corregida, con su criterio fiscal. */
async function conFiscalDe(fila) {
    const quien = await emisores();
    await precargarCambios([fila]);
    return conFiscal({ ...fila, origen: 'DRIVE' }, ctxFiscal(quien));
}

// ── El cuadro de mando ──────────────────────────────────────────────────────

const vacio = () => ({ base: 0, iva: 0, total: 0, n: 0 });
const acumula = (x, v) => { x.base = r2(x.base + v.base); x.iva = r2(x.iva + v.cuota); x.total = r2(x.total + v.total); x.n++; };

/**
 * Presupuestos ACEPTADOS (de cualquier año) sin factura viva. El MISMO criterio que
 * `facturaService.facturasDelPresupuesto`, en lote: lo que nació del presupuesto, lo
 * que emitió su CEE directo y lo que solo consta en la ficha de ese CEE (las
 * importadas de AppSheet llegaron sin `cee_directo_id`). Solo cuentan las F1 no
 * anuladas: una rectificativa hereda el `presupuesto_id`.
 */
async function porFacturar(P) {
    const { data: acept, error: e } = await supabase.from('cee_ofertas')
        .select('id, numero, cee_directo_id, precio, dto_pct, iva_pct, tasa, num_tasas, neto, iva, total, aceptada_at')
        .eq('estado', 'ACEPTADA').limit(2000);
    if (e) throw error(`No se pudieron leer los presupuestos: ${e.message}`, 503);
    const trozos = (xs) => Array.from({ length: Math.ceil(xs.length / 100) }, (_, i) => xs.slice(i * 100, i * 100 + 100));
    const conFactura = new Set();
    for (const t of trozos((acept || []).map(o => o.id))) {
        const { data, error: e2 } = await supabase.from('facturas_emitidas').select('presupuesto_id').in('presupuesto_id', t).eq('tipo', 'F1').neq('estado', 'RECTIFICADA');
        if (e2) throw error(`No se pudieron leer las facturas: ${e2.message}`, 503);
        for (const f of data || []) conFactura.add(f.presupuesto_id);
    }
    const cdConFactura = new Set();
    for (const t of trozos([...new Set((acept || []).map(o => o.cee_directo_id).filter(Boolean))])) {
        const [fs, cds] = await Promise.all([
            supabase.from('facturas_emitidas').select('cee_directo_id, numero, estado, tipo').in('cee_directo_id', t),
            supabase.from('cee_directos').select('id, facturas:documentacion->facturas_emitidas').in('id', t),
        ]);
        for (const r of [fs, cds]) if (r.error) throw error(`No se pudieron leer las facturas de los CEE: ${r.error.message}`, 503);
        const registradas = new Set((fs.data || []).map(f => f.numero));
        for (const f of fs.data || []) if (f.tipo === 'F1' && f.estado !== 'RECTIFICADA') cdConFactura.add(f.cee_directo_id);
        for (const c of cds.data || []) if (Object.keys(c.facturas || {}).some(n => !registradas.has(n))) cdConFactura.add(c.id);
    }
    const sin = (acept || []).filter(o => !conFactura.has(o.id) && !(o.cee_directo_id && cdConFactura.has(o.cee_directo_id)))
        .map(o => {
            const t = o.total == null ? P.totalesOferta(o) : { neto: num(o.neto), total: num(o.total) };
            return { id: o.id, numero: o.numero, importe: r2(t.neto), importe_total: r2(t.total), aceptada_at: o.aceptada_at };
        })
        .sort((a, b) => String(a.aceptada_at || '').localeCompare(String(b.aceptada_at || '')));
    return { n: sin.length, importe: suma(sin, 'importe'), importe_total: suma(sin, 'importe_total'), presupuestos: sin.slice(0, 20) };
}

async function cuadro(anioArg, { hoy = hoyMadrid(), conDrive = true } = {}) {
    const anio = Number(anioArg || hoy.slice(0, 4));
    if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw error('Año no válido');
    const P = await plantilla();

    const [quien, fe, cae, pendFe, borr, ofertas, lotesCobrados] = await Promise.all([
        emisores(),
        emitidas({ desde: `${anio - 1}-01-01`, hasta: `${anio}-12-31`, hoy }),
        facturasCae({ desde: `${anio - 1}-01-01`, hasta: `${anio}-12-31`, hoy }),
        supabase.from('facturas_emitidas').select(COLS_VENTA).eq('estado', 'EMITIDA').limit(2000),
        supabase.from('facturas_emitidas').select('id', { count: 'exact', head: true }).eq('estado', 'BORRADOR'),
        supabase.from('cee_ofertas').select('id, numero, estado, alcance, precio, dto_pct, iva_pct, tasa, num_tasas, neto, iva, total, created_at, aceptada_at, rechazada_at, visto_at')
            .gte('created_at', `${anio}-01-01`).lte('created_at', `${anio}-12-31T23:59:59`).limit(5000),
        supabase.from('lotes').select('id, codigo, estado').in('estado', LOTE_YA_COBRADO).limit(2000),
    ]);
    for (const r of [pendFe, borr, ofertas, lotesCobrados]) if (r.error) throw error(`No se pudo leer la BD: ${r.error.message}`, 503);

    const avisos = [];
    // Las ventas CAE que solo están en Drive (autofacturas), ya leídas, son ventas de
    // la SL como las demás; las sin leer, un aviso. Se miran TODOS los años con
    // carpeta (lo que se debe se debe desde cuando sea; el cobro, en su año), pero en
    // lo facturado solo cuentan este año y el anterior, como lo demás.
    const caeTodas = await facturasCae({ hoy });
    const driveTodas = [];
    let comparacion = { comparable: true, nota: null, aviso: null };
    if (conDrive) {
        try {
            const numeros = new Set(caeTodas.map(v => v.numero));
            const sinLeer = { [anio]: [], [anio - 1]: [] };
            const anioHoy = Number(hoy.slice(0, 4));
            const anios = [...new Set([...(await gastosDrive.aniosVentas('CAE')), anio - 1, anio])].filter(a => a <= Math.max(anio, anioHoy)).sort();
            for (const a of anios) {
                const vd = await gastosDrive.listarVentas({ anio: a, meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }, { lineas: ['CAE'] });
                for (const f of ventasCaeSinRegistrar(vd.CAE, numeros)) {
                    const v = ventaDeDrive(f, hoy);
                    if (v) driveTodas.push(v);
                    else if (sinLeer[a] && ESTADOS_PENDIENTES.includes(f.estado)) sinLeer[a].push(f);
                }
            }
            const sl = sinLeer[anio];
            if (sl.length) {
                const t = `${anio}-T${Math.ceil((sl[0].mes || 1) / 3)}`;
                avisos.push({ tono: 'ambar', texto: `${sl.length === 1 ? 'Una venta CAE de Drive' : `${sl.length} ventas CAE de Drive`} sin leer (${nombresCortos(sl)}): no cuentan en las ventas`, filtro: { vista: 'gastos', t } });
            }
            comparacion = comparacionAnterior(anio, { sinLeerAnterior: sinLeer[anio - 1] });
        } catch (e) {
            avisos.push({ tono: 'ambar', texto: `No se pudieron leer las ventas CAE de Drive (autofacturas): ${e.message}` });
            comparacion = comparacionAnterior(anio, { driveOk: false });
        }
    }
    if (comparacion.aviso) avisos.push(comparacion.aviso);
    const deDrive = driveTodas.filter(v => v.fecha >= `${anio - 1}-01-01` && v.fecha <= `${anio}-12-31`);
    const todas = [...fe, ...cae, ...deDrive];
    const delAnio = todas.filter(v => v.fecha.startsWith(String(anio)));

    // Ventas por mes y línea
    const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ING: vacio(), CAE: vacio(), FML: vacio(), sl: vacio(), autonomo: vacio() }));
    const lineas = { ING: vacio(), CAE: vacio(), FML: vacio() };
    const contrib = { sl: vacio(), autonomo: vacio() };
    for (const v of delAnio) {
        const m = meses[Number(v.fecha.slice(5, 7)) - 1];
        const c = v.contribuyente === 'SL' ? 'sl' : 'autonomo';
        acumula(m[v.linea], v); acumula(m[c], v); acumula(lineas[v.linea], v); acumula(contrib[c], v);
    }
    const esteAnio = anio === Number(hoy.slice(0, 4));
    const corte = esteAnio ? hoy.slice(5) : '12-31';
    const hasta = (a) => `${a}-${corte}`;
    const acum = (a, l) => suma(todas.filter(v => v.fecha >= `${a}-01-01` && v.fecha <= hasta(a) && (!l || v.linea === l)), 'base');
    const variacion = (a, b) => (b ? r2(((a - b) / Math.abs(b)) * 100) : null);
    const acumulado = { hasta: hasta(anio), hasta_anterior: hasta(anio - 1), por_linea: {} };
    for (const l of LINEAS) {
        const a = acum(anio, l), b = acum(anio - 1, l);
        acumulado.por_linea[l] = { base: a, base_anterior: b, variacion_pct: variacion(a, b) };
    }
    const slA = r2(acumulado.por_linea.ING.base + acumulado.por_linea.CAE.base);
    const slB = r2(acumulado.por_linea.ING.base_anterior + acumulado.por_linea.CAE.base_anterior);
    acumulado.sl = { base: slA, base_anterior: slB, variacion_pct: variacion(slA, slB) };
    // Con ventas CAE del año anterior sin leer, lo de entonces está incompleto: el
    // titular no presume («87 veces»), dice la nota. La FML no lleva ventas de Drive.
    for (const x of [acumulado.sl, acumulado.por_linea.CAE]) Object.assign(x, { comparable: comparacion.comparable, nota_comparacion: comparacion.nota });

    // Cobros: los de la SOCIEDAD arriba; lo de FML (lo que la SL debe a Fran) aparte.
    // Las ventas CAE de Drive también se deben y se cobran (su cobro, en el fichero).
    const pendientes = [
        ...(pendFe.data || []).map(f => ventaDeEmitida(f, hoy)).filter(v => v.total > 0),
        ...caeTodas.filter(v => v.cobro.estado !== 'COBRADA'),
        ...driveTodas.filter(v => v.cobro.estado !== 'COBRADA' && v.total > 0),
    ];
    const cobrado = [...fe, ...cae, ...driveTodas].filter(v => v.estado === 'PAGADA' && String(v.cobro.fecha || v.fecha).startsWith(String(anio)));
    const porLineaCobros = {};
    for (const l of LINEAS) {
        const p = pendientes.filter(v => v.linea === l);
        porLineaCobros[l] = {
            pendiente: suma(p, 'total'), n_pendientes: p.length,
            vencido: suma(p.filter(v => v.cobro.estado === 'VENCIDA'), 'total'), n_vencidas: p.filter(v => v.cobro.estado === 'VENCIDA').length,
            cobrado: suma(cobrado.filter(v => v.linea === l), 'total'),
        };
    }
    const pSl = pendientes.filter(v => v.contribuyente === 'SL');
    const vencidasSl = pSl.filter(v => v.cobro.estado === 'VENCIDA').sort((a, b) => (b.cobro.dias || 0) - (a.cobro.dias || 0));
    // Días medios de cobro: de la fecha de la factura a la del cobro, de lo cobrado en el
    // año por la SOCIEDAD (la FML es Fran cobrándose a sí mismo: no cuenta).
    const diasCobro = (xs) => {
        const ds = xs.filter(v => v.cobro.fecha && v.fecha).map(v => diasEntre(v.fecha, v.cobro.fecha)).filter(d => d >= 0);
        return ds.length ? { dias: Math.round(ds.reduce((a, b) => a + b, 0) / ds.length), n: ds.length } : { dias: null, n: 0 };
    };
    const cobradoSl = cobrado.filter(v => v.contribuyente === 'SL');
    const cobros = {
        pendiente: suma(pSl, 'total'), n_pendientes: pSl.length,
        vencido: suma(vencidasSl, 'total'), n_vencidas: vencidasSl.length,
        cobrado: suma(cobradoSl, 'total'),
        dias_medios_cobro: { ...diasCobro(cobradoSl), por_linea: { ING: diasCobro(cobradoSl.filter(v => v.linea === 'ING')), CAE: diasCobro(cobradoSl.filter(v => v.linea === 'CAE')) } },
        por_linea: porLineaCobros,
        vencidas: vencidasSl.slice(0, 10).map(v => ({ id: v.id, linea: v.linea, origen: v.origen, lote_id: v.lote_id || null, numero: v.numero, cliente: v.cliente, total: v.total, vencimiento: v.vencimiento, dias: v.cobro.dias })),
        // Ya dentro de lo de arriba (CAE): las de Drive, aparte, porque no se cobran en Lotes sino aquí.
        drive: cobrosDrive(driveTodas, anio),
    };
    const vencFe = vencidasSl.filter(v => v.linea !== 'CAE');
    const vencCae = vencidasSl.filter(v => v.linea === 'CAE');
    if (vencFe.length) avisos.push({ tono: 'rojo', texto: `${vencFe.length} ${vencFe.length === 1 ? 'factura vencida' : 'facturas vencidas'} sin cobrar (${fmt(suma(vencFe, 'total'))})`, filtro: { vista: 'facturas', estado: 'VENCIDA' } });
    if (vencCae.length) avisos.push({ tono: 'rojo', texto: `${vencCae.length === 1 ? 'Factura CAE vencida' : `${vencCae.length} facturas CAE vencidas`} sin cobrar: ${vencCae.map(v => v.numero).join(', ')} (${fmt(suma(vencCae, 'total'))})`, filtro: { vista: 'lotes' } });
    // Un lote que ya pasó a «PTE. PAGO BROKERGY A CLIENTE» (o a FINALIZADO) con su
    // factura sin cobrar: casi seguro que el S.O. pagó y no se marcó.
    avisos.push(...avisosLotesSinCobro(lotesCobrados.data, caeTodas));

    // Embudo de presupuestos (los de partidas y las ofertas antiguas)
    const ps = (ofertas.data || []).map(o => {
        const antiguo = o.total == null;
        const t = antiguo ? P.totalesOferta(o) : { neto: num(o.neto), total: num(o.total), tasas: 0 };
        return { ...o, antiguo, importe: r2(t.neto), importe_total: r2(t.total) };
    });
    const grupo = (est) => { const xs = ps.filter(p => p.estado === est); return { n: xs.length, importe: suma(xs, 'importe'), importe_total: suma(xs, 'importe_total') }; };
    const enviados = ps.filter(p => p.estado === 'ENVIADA');
    const resp = ps.filter(p => ['ACEPTADA', 'RECHAZADA'].includes(p.estado)).length;
    const salieron = ps.filter(p => ['ENVIADA', 'ACEPTADA', 'RECHAZADA'].includes(p.estado)).length;
    const acept = ps.filter(p => p.estado === 'ACEPTADA').length;
    const presupuestos = {
        borradores: grupo('BORRADOR'),
        enviados: { ...grupo('ENVIADA'), vistos: enviados.filter(p => p.visto_at).length },
        aceptados: grupo('ACEPTADA'), rechazados: grupo('RECHAZADA'), anulados: grupo('ANULADA'),
        tasa_aceptacion: salieron ? r2(acept / salieron) : null,
        tasa_aceptacion_contestados: resp ? r2(acept / resp) : null,
        con_partidas: ps.filter(p => !p.antiguo).length, antiguos: ps.filter(p => p.antiguo).length,
        por_facturar: await porFacturar(P),
    };
    const viejos = enviados.filter(p => diasEntre(String(p.created_at).slice(0, 10), hoy) > 15);
    if (viejos.length) avisos.push({ tono: 'azul', texto: `${viejos.length} ${viejos.length === 1 ? 'presupuesto enviado' : 'presupuestos enviados'} hace más de 15 días sin contestar`, filtro: { vista: 'presupuestos', estado: 'ENVIADA' } });
    if (borr.count) avisos.push({ tono: 'azul', texto: `${borr.count} ${borr.count === 1 ? 'factura' : 'facturas'} en borrador`, filtro: { vista: 'facturas', estado: 'BORRADOR' } });

    // Top 5 clientes de la SOCIEDAD (la FML tiene un solo cliente: la propia SL)
    const porCliente = new Map();
    for (const v of delAnio.filter(x => x.contribuyente === 'SL')) {
        const k = nifLimpio(v.nif) || sinTildes(v.cliente);
        const x = porCliente.get(k) || { nombre: v.cliente, nif: nifLimpio(v.nif) || null, base: 0, n: 0, lineas: [] };
        x.base = r2(x.base + v.base); x.n++;
        if (!x.lineas.includes(v.linea)) x.lineas.push(v.linea);
        porCliente.set(k, x);
    }
    const topClientes = [...porCliente.values()].sort((a, b) => b.base - a.base).slice(0, 5);

    // Serie ING del año: huecos
    const yy = String(anio).slice(2);
    const h = huecosSerie(delAnio.filter(v => v.linea === 'ING' && v.tipo === 'F1').map(v => v.numero), `${yy}ING`);
    if (h.huecos.length) avisos.push({ tono: 'ambar', texto: `Serie ${yy}ING con huecos: ${h.huecos.slice(0, 8).join(', ')}${h.huecos.length > 8 ? '…' : ''}`, filtro: { vista: 'facturas', serie: 'ING' } });

    // FML del mes sin hacer (los meses ya cerrados; el en curso, desde el día 25)
    if (esteAnio) {
        const cubiertos = new Set();
        for (const v of delAnio.filter(x => x.linea === 'FML')) for (const m of mesesDeFml(v)) cubiertos.add(m);
        const mesHoy = Number(hoy.slice(5, 7));
        const hastaMes = Number(hoy.slice(8, 10)) >= 25 ? mesHoy : mesHoy - 1;
        const faltan = [];
        for (let m = 1; m <= hastaMes; m++) if (!cubiertos.has(m)) faltan.push(MESES[m - 1]);
        if (faltan.length) avisos.push({ tono: 'ambar', texto: `Falta la factura FML de ${faltan.join(', ')}`, filtro: { vista: 'facturas', serie: 'FML' } });
    }

    // El trimestre en curso (con lo leído de Drive) y el que queda por presentar
    let trimestreEnCurso = null;
    let aPresentar = null;
    if (esteAnio) {
        const T = parseTrimestre(trimestreDeFecha(hoy));
        const ctx = ctxFiscal(quien);
        const vq = delAnio.filter(v => v.fecha >= T.desde && v.fecha <= T.hasta);
        const vSl = vq.filter(v => v.contribuyente === 'SL');
        const vAut = vq.filter(v => v.contribuyente === 'AUTONOMO');
        let gSl = [], gAut = [], gastos = null;
        if (conDrive) {
            try {
                const lista = await gastosDrive.listarGastos(T);
                await precargarCambios(lista.filas);
                for (const g of lista.filas) if (!g.fml) (g.contribuyente === 'SL' ? gSl : gAut).push(conFiscal({ ...g, origen: 'DRIVE' }, ctx));
                const sinLeer = lista.filas.filter(g => ['SIN_LEER', 'CAMBIADO', 'ERROR'].includes(g.estado)).length;
                const sinRevisar = lista.filas.filter(g => g.estado === 'LEIDO').length;
                gastos = { n: lista.filas.length, sin_leer: sinLeer, sin_revisar: sinRevisar };
                if (sinLeer) avisos.push({ tono: 'ambar', texto: `${sinLeer} gastos del ${T.t} sin leer`, filtro: { vista: 'gastos', t: T.t, estado: 'SIN_LEER' } });
            } catch (e) {
                avisos.push({ tono: 'ambar', texto: `No se pudo leer Drive: el IVA soportado del ${T.t} no está (${e.message})` });
            }
        }
        for (const v of vAut) gSl.push(conFiscal(gastoDeFml(v, quien.autonomo), ctx));
        const s303 = calcular303(vSl, gSl);
        const a303 = calcular303(vAut, gAut);
        const s111 = calcular111(gSl);
        trimestreEnCurso = {
            t: T.t, etiqueta: T.etiqueta, desde: T.desde, hasta: T.hasta,
            sl: { iva_repercutido: s303.devengado.cuota, iva_isp: s303.isp.cuota, iva_soportado_deducible: s303.deducible.interior, resultado_303: s303.resultado },
            autonomo: { iva_repercutido: a303.devengado.cuota, iva_soportado_deducible: a303.deducible.interior, resultado_303: a303.resultado, retenciones: suma(vAut, 'irpf') },
            m111: s111.retencion,
            plazo: plazoMasCercano(T, hoy),
            gastos, parcial: !gastos || gastos.sin_leer > 0,
            estimado: true,
        };
        const anterior = T.n === 1 ? parseTrimestre(`${anio - 1}-T4`) : parseTrimestre(`${anio}-T${T.n - 1}`);
        const pa = plazoMasCercano(anterior, hoy);
        const ultimo = Object.values(pa.plazos).sort().pop();
        if (diasEntre(hoy, ultimo) >= 0) {
            aPresentar = { t: anterior.t, etiqueta: anterior.etiqueta, plazos: pa.plazos, plazo: pa };
            avisos.push({ tono: pa.dias <= 5 ? 'rojo' : 'ambar', texto: `Quedan ${Math.max(0, pa.dias)} días para presentar el ${anterior.t} (${esDeIso(pa.fecha)})`, filtro: { vista: 'trimestre', t: anterior.t } });
        }
    }

    return {
        anio, generado: new Date().toISOString(), estimado: true,
        contribuyentes: quien,
        ventas: { meses, lineas, por_contribuyente: contrib, acumulado, base_estimada: 'Sin leer las líneas: la base sale de la cuota al 21 % (las tasas, aparte). El detalle exacto, en el trimestre.' },
        cobros, presupuestos, trimestre: trimestreEnCurso, a_presentar: aPresentar,
        top_clientes: topClientes, avisos,
    };
}

const fmt = (n) => `${r2(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// ── El PAQUETE para la gestoría ─────────────────────────────────────────────
//
// REGLA — la estructura y los nombres se REPRODUCEN del T3 hecho a mano
// («ENTREGA GESTORÍA / 2026-T3 (jul-sep)»), no se inventan. Los PDF se COPIAN,
// nunca se mueven; lo que ya está con su nombre no se toca; el libro no pisa uno
// que ya exista (sale con otro nombre).

const SUB = {
    EMITIDAS_SL: '01 SL - FACTURAS EMITIDAS',
    RECIBIDAS_SL: '02 SL - FACTURAS RECIBIDAS',
    OTROS_SL: '03 SL - TICKETS, TASAS Y OTROS',
    EMITIDAS_AUT: '04 AUTONOMO - FACTURAS EMITIDAS',
    GASTOS_AUT: '05 AUTONOMO - GASTOS',
    EXTRACTOS: '06 EXTRACTOS BANCARIOS',
};
const ACT = { CAE: 'A - CAE', ING: 'B - ING', COMUN: 'C - COMUNES (ambas actividades)' };

const limpiaNombre = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
const dos = (i) => String(i).padStart(2, '0');
const extDe = (nombre, mime) => (/\.[a-z0-9]{2,4}$/i.test(nombre || '') ? '' : mime === 'image/jpeg' ? '.jpg' : mime === 'image/png' ? '.png' : '.pdf');
/** «Supabase Pte. Ltd.» → «SUPABASE»; «Pepemobile, SL» → «PEPEMOBILE». */
function proveedorCorto(s) {
    return sinTildes(s).replace(/[,.]/g, ' ').replace(/\b(S\s?L\s?U?|S\s?A\s?U?|SLU|SLL|SCOOP|CB|PTE|LTD|LIMITED|LLC|INC|PBC|GMBH|BV|SARL|SAS|SPA|OPCO)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
/** El nombre de una factura recibida: el suyo si ya sigue «AAAA-MM-DD - PROVEEDOR - Nº», si no, se compone. */
function nombreRecibida(g) {
    if (g.nombre && /^\d{4}-\d{2}-\d{2} - /.test(g.nombre)) return limpiaNombre(g.nombre + extDe(g.nombre, g.mime));
    const d = g.datos || {};
    if (!d.fecha && g.nombre) return limpiaNombre(g.nombre + extDe(g.nombre, g.mime));
    const ext = (/\.[a-z0-9]{2,4}$/i.exec(g.nombre || '')?.[0] || extDe('', g.mime)).toLowerCase();
    return limpiaNombre(`${d.fecha || 'SIN FECHA'} - ${proveedorCorto(d.proveedor) || 'PROVEEDOR'} - ${String(d.numero || 'SN').replace(/[\\/]/g, '-')}${ext}`);
}
const nombreCarpetaPaquete = (T) => T.etiqueta;                         // «2026-T3 (jul-sep)»
/**
 * El extracto con el nombre del T3: «SL - BBVA cuenta {últimas 4} - jul-sep 2026.xlsx»,
 * «AUTONOMO - CaixaBank - jul-sep 2026.csv». Si no se reconoce el banco, el suyo.
 */
function nombreExtracto(x, T) {
    const n = sinTildes(x.nombre);
    const ext = (/\.[a-z0-9]{2,4}$/i.exec(x.nombre || '')?.[0] || '').toLowerCase();
    const quien = x.contribuyente === 'AUTONOMO' ? 'AUTONOMO' : 'SL';
    let banco = null;
    if (/REVOLUT/.test(n)) banco = 'Revolut';
    else if (/CAIXA/.test(n)) banco = 'CaixaBank';
    else if (/TARJETA/.test(n)) banco = 'Tarjetas';
    else if (/BBVA/.test(n)) { const c = /[•·*](\d{4})/.exec(x.nombre)?.[1]; banco = c ? `BBVA cuenta ${c}` : 'BBVA'; }
    return limpiaNombre(banco ? `${quien} - ${banco} - ${T.corto} ${T.anio}${ext}` : `${quien} - ${x.nombre}`);
}
/** «R-07 - 2026-07-17 - …» → «2026-07-17 - …»; «SL - BBVA …» → «BBVA …». */
const sinPrefijoRegistro = (n) => String(n || '').replace(/^(?:[A-Z]{1,2}-\d+|SL|AUTONOMO) - /, '');
const nombreLibro = (T) => `BROKERGY ${T.t} - Paquete para OTS.xlsx`;

/** El fichero de VENTAS de Drive de una factura: «26ING_66 - …», «F-2026CAE_8 - …». */
function pdfVentaDrive(ventasDrive, v) {
    const xs = (ventasDrive?.[v.linea] || []).filter(f => f.nombre.startsWith(`${v.numero} `) || f.nombre.startsWith(`${v.numero}.`) || f.nombre === v.numero);
    if (xs.length <= 1) return xs[0] || null;
    const cli = sinTildes(v.cliente).split(' ')[0];
    return xs.find(f => sinTildes(f.nombre).includes(cli)) || xs[0];
}

/**
 * El PLAN del paquete: qué carpetas, qué ficheros con qué nombre y de dónde, y
 * lo que falta. Sin escribir nada (es lo que devuelve `?seco=1`).
 */
async function planPaquete(det) {
    const T = parseTrimestre(det.t);
    const ventasDrive = det.ventas_drive || await gastosDrive.listarVentas({ anio: T.anio, meses: T.meses });
    const extractos = await gastosDrive.listarExtractos(T).catch(() => []);
    const faltan = [];
    const ficheros = [];
    const add = (carpeta, nombre, origen, fila) => ficheros.push({ carpeta, nombre: limpiaNombre(nombre), origen, fila });

    // 01 · SL emitidas (ING + CAE, también las CAE que solo están en Drive: las
    // leídas, con sus cifras; las sin leer, sin ellas)
    const emitidasSl = [...det.ventas.sl.facturas];
    const autofacturas = det.ventas_cae_drive?.sin_leer || [];
    let i = 0;
    const filasEmitidasSl = [];
    for (const v of emitidasSl) {
        const f = v.origen === 'DRIVE' ? v.drive : pdfVentaDrive(ventasDrive, v);
        const reg = `E-${dos(++i)}`;
        let nombre = null, origen = null;
        if (f) { nombre = `${reg} - ${f.nombre}`; origen = { fileId: f.fileId, ruta: `${f.carpeta} / ${f.nombre}` }; }
        else if (v.pdf?.driveId) { nombre = `${reg} - ${v.numero} - ${sinTildes(v.cliente)}.pdf`; origen = { fileId: v.pdf.driveId, ruta: 'PDF archivado por la app' }; }
        else faltan.push({ tono: 'rojo', texto: `${v.numero} (${v.cliente}): no está su PDF en ${gastosDrive.RUTA.VENTAS[v.linea]}` });
        if (nombre) add(SUB.EMITIDAS_SL, nombre, origen);
        filasEmitidasSl.push({ reg, v, archivo: nombre ? `${SUB.EMITIDAS_SL}/${limpiaNombre(nombre)}` : 'FALTA EL PDF' });
    }
    for (const f of autofacturas) {
        const reg = `E-${dos(++i)}`;
        const nombre = `${reg} - ${f.nombre}`;
        add(SUB.EMITIDAS_SL, nombre, { fileId: f.fileId, ruta: `${f.carpeta} / ${f.nombre}` });
        filasEmitidasSl.push({ reg, v: null, drive: f, archivo: `${SUB.EMITIDAS_SL}/${limpiaNombre(nombre)}` });
        faltan.push({ tono: 'ambar', texto: `${f.nombre}: venta CAE de Drive sin leer; léela en Gastos («Leer con IA») o pon sus importes en el libro` });
    }

    // 02 / 03 · SL recibidas y otros (por actividad)
    const sl = det.gastos.sl.filas.filter(g => g.fiscal.destino);
    let r = 0, o = 0;
    const filasRecibidas = [];
    const filasOtros = [];
    for (const g of sl) {
        const otros = g.fiscal.destino === 'OTROS';
        const reg = otros ? `O-${dos(++o)}` : `R-${dos(++r)}`;
        const carpeta = `${otros ? SUB.OTROS_SL : SUB.RECIBIDAS_SL}/${ACT[g.actividad] || ACT.COMUN}`;
        let origen = g.fileId ? { fileId: g.fileId, ruta: `${g.carpeta} / ${g.nombre}` } : null;
        let base = nombreRecibida(g);
        if (!origen && g.origen === 'APP') {
            const fv = pdfVentaDrive(ventasDrive, { linea: 'FML', numero: g.fml, cliente: '' });
            if (fv) { origen = { fileId: fv.fileId, ruta: `${fv.carpeta} / ${fv.nombre}` }; base = limpiaNombre(`${g.datos.fecha} - ${proveedorCorto(g.datos.proveedor)} - ${g.fml}.pdf`); }
        }
        const nombre = `${reg} - ${base}`;
        if (origen) add(carpeta, nombre, origen); else faltan.push({ tono: 'ambar', texto: `${g.fml || g.nombre}: sin PDF que copiar` });
        if (['SIN_LEER', 'CAMBIADO', 'ERROR'].includes(g.estado)) faltan.push({ tono: 'ambar', texto: `${g.nombre}: sin leer, va al paquete pero sin importes en el libro` });
        (otros ? filasOtros : filasRecibidas).push({ reg, g, archivo: origen ? `${carpeta}/${limpiaNombre(nombre)}` : 'SIN PDF' });
    }

    // 04 · Autónomo emitidas
    const filasAutEmitidas = [];
    let ae = 0;
    for (const v of det.ventas.autonomo.facturas) {
        const f = pdfVentaDrive(ventasDrive, v);
        const reg = `AE-${dos(++ae)}`;
        let nombre = null, origen = null;
        if (f) { nombre = `${reg} - ${f.nombre}`; origen = { fileId: f.fileId, ruta: `${f.carpeta} / ${f.nombre}` }; }
        else if (v.pdf?.driveId) { nombre = `${reg} - ${v.numero} - ${sinTildes(v.cliente)}.pdf`; origen = { fileId: v.pdf.driveId, ruta: 'PDF archivado por la app' }; }
        else faltan.push({ tono: 'rojo', texto: `${v.numero}: no está su PDF en ${gastosDrive.RUTA.VENTAS.FML}` });
        if (nombre) add(SUB.EMITIDAS_AUT, nombre, origen);
        filasAutEmitidas.push({ reg, v, archivo: nombre ? `${SUB.EMITIDAS_AUT}/${limpiaNombre(nombre)}` : 'FALTA EL PDF' });
    }

    // 06 · Extractos (los nombres, antes: las cuotas del autónomo los citan)
    const usados = new Set();
    const nombre06 = new Map();
    for (const x of extractos) {
        let nombre = nombreExtracto(x, T);
        for (let k = 2; usados.has(nombre); k++) nombre = nombreExtracto(x, T).replace(/(\.[a-z0-9]{2,4})?$/i, ` (${k})$1`);
        usados.add(nombre);
        nombre06.set(x.fileId, nombre);
    }

    // 05 · Autónomo gastos. La cuota de autónomos y el colegio no tienen PDF: su
    // justificante es el extracto (en 06) o el recibo de la TGSS (se copia aquí).
    const filasAutGastos = [];
    let ag = 0;
    for (const g of det.gastos.autonomo.filas.filter(x => x.fiscal.destino)) {
        const reg = `AG-${dos(++ag)}`;
        if (!g.fileId) {
            const j = g.justificante;
            let archivo;
            if (j?.tipo === 'RECIBO') {
                const nombre = `${reg} - ${g.datos.fecha} - TGSS - ${j.nombre}`;
                add(SUB.GASTOS_AUT, nombre, { fileId: j.fileId, ruta: `EXTRACTOS Y RECIBOS / 02. AUTÓNOMO / ${j.nombre}` });
                archivo = `${SUB.GASTOS_AUT}/${limpiaNombre(nombre)}`;
            } else if (j) {
                archivo = nombre06.has(j.fileId) ? `Justificante: ${SUB.EXTRACTOS}/${nombre06.get(j.fileId)}` : `Justificante: EXTRACTOS Y RECIBOS / 02. AUTÓNOMO / ${j.nombre}`;
            } else {
                archivo = 'ESTIMADA: falta el extracto del banco';
                faltan.push({ tono: 'ambar', texto: `${g.datos.concepto}: sin extracto ni recibo; sube el de CaixaBank a EXTRACTOS Y RECIBOS / 02. AUTÓNOMO` });
            }
            filasAutGastos.push({ reg, g, archivo });
            continue;
        }
        const nombre = `${reg} - ${nombreRecibida(g)}`;
        add(SUB.GASTOS_AUT, nombre, { fileId: g.fileId, ruta: `${g.carpeta} / ${g.nombre}` });
        if (['SIN_LEER', 'CAMBIADO', 'ERROR'].includes(g.estado)) faltan.push({ tono: 'ambar', texto: `${g.nombre}: sin leer, va al paquete pero sin importes en el libro` });
        filasAutGastos.push({ reg, g, archivo: `${SUB.GASTOS_AUT}/${limpiaNombre(nombre)}` });
    }

    // 06 · Extractos
    for (const x of extractos) add(SUB.EXTRACTOS, nombre06.get(x.fileId), { fileId: x.fileId, ruta: `EXTRACTOS Y RECIBOS / ${x.carpeta} / ${x.nombre}` });
    if (!extractos.length) faltan.push({ tono: 'ambar', texto: `No hay extractos del ${T.corto} en EXTRACTOS Y RECIBOS: bájalos del banco` });
    else faltan.push({ tono: 'azul', texto: `Extractos elegidos por su fecha de subida (${extractos.length}): comprueba que cubren ${T.corto}` });

    return {
        T, ficheros, faltan,
        filas: { emitidasSl: filasEmitidasSl, recibidas: filasRecibidas, otros: filasOtros, autEmitidas: filasAutEmitidas, autGastos: filasAutGastos },
    };
}

// ── El libro Excel (mismas hojas y columnas que el del T3) ──────────────────

const EUR = '#,##0.00" €";[RED]-#,##0.00" €";-';
const AZUL = 'FF2E5496';

function cabecera(ws, fila, titulos, anchos) {
    const row = ws.getRow(fila);
    titulos.forEach((t, k) => {
        const c = row.getCell(k + 1);
        c.value = t;
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
        c.alignment = { vertical: 'middle', wrapText: true };
    });
    anchos.forEach((w, k) => { ws.getColumn(k + 1).width = w; });
}

function totalFila(ws, fila, etiquetaCol, cols, desde, hasta, valores) {
    const row = ws.getRow(fila);
    row.getCell(etiquetaCol).value = 'TOTAL';
    row.getCell(etiquetaCol).font = { bold: true };
    for (const col of cols) {
        const c = row.getCell(col);
        const L = ws.getColumn(col).letter;
        c.value = hasta >= desde ? { formula: `SUM(${L}${desde}:${L}${hasta})`, result: valores[col] ?? 0 } : 0;
        c.numFmt = EUR;
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    }
}

function eurCells(row, cols) { for (const c of cols) row.getCell(c).numFmt = EUR; }
const cobroTexto = (v) => (v.cobro.estado === 'COBRADA' ? (v.cobro.fecha ? `${esDeIso(v.cobro.fecha).slice(0, 5)} cobrada` : 'Cobrada')
    : v.cobro.estado === 'NO_CONSTA' ? 'No consta en la app'
        : v.cobro.estado === 'VENCIDA' ? 'PENDIENTE (vencida)' : `Pendiente${v.vencimiento ? ` (vence ${esDeIso(v.vencimiento).slice(0, 5)})` : ''}`);
const pct = (n) => `${r2(n)}%`;

async function libroPaquete(det, plan, { hoy = hoyMadrid() } = {}) {
    const ExcelJS = require('exceljs');
    const T = plan.T;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BROKERGY app';
    wb.created = new Date();
    const titulo = (ws, a1, a2) => { ws.getCell('A1').value = a1; ws.getCell('A1').font = { bold: true, size: 13 }; ws.getCell('A2').value = a2; };
    const sl = det.contribuyentes.sl;
    const aut = det.contribuyentes.autonomo;

    const res = wb.addWorksheet(`RESUMEN ${T.n}T`);
    const emi = wb.addWorksheet('SL EMITIDAS', { views: [{ state: 'frozen', ySplit: 4 }] });
    const rec = wb.addWorksheet('SL RECIBIDAS', { views: [{ state: 'frozen', ySplit: 4 }] });
    const otr = wb.addWorksheet('SL OTROS GASTOS', { views: [{ state: 'frozen', ySplit: 4 }] });
    const aem = wb.addWorksheet('AUT EMITIDAS', { views: [{ state: 'frozen', ySplit: 4 }] });
    const agt = wb.addWorksheet('AUT GASTOS', { views: [{ state: 'frozen', ySplit: 4 }] });
    const r111 = wb.addWorksheet('111 RETENCIONES');
    const pen = wb.addWorksheet('PENDIENTES');

    // SL EMITIDAS
    titulo(emi, 'SL EMITIDAS', `${sl.nombre} (${sl.nif || ''}) · Libro de facturas expedidas · ${T.n}T ${T.anio}`);
    cabecera(emi, 4, ['Nº reg.', 'Fecha', 'Nº factura', 'Cliente', 'NIF', 'Concepto', 'Base 21%', 'Cuota IVA', 'Exento (tasas suplidas)', 'Total', 'Cobro', 'Archivo en el paquete'], [7, 10, 11, 30, 11, 40, 11, 10, 11, 11, 13, 60]);
    let f = 5;
    for (const x of plan.filas.emitidasSl) {
        const v = x.v;
        const row = emi.getRow(f++);
        row.values = v
            ? [x.reg, esDeIso(v.fecha), v.numero, v.cliente, v.nif, v.origen === 'DRIVE' ? `${v.concepto} · ${v.autofactura ? 'AUTOFACTURA expedida por el cliente' : 'factura hecha fuera de la app'} (leída del PDF)` : v.concepto,
                v.base, v.cuota, v.suplidos, r2(v.base + v.cuota + v.suplidos), cobroTexto(v), x.archivo]
            : [x.reg, '', x.drive.nombre.split(' - ')[0], '', '', 'Venta CAE de Drive SIN LEER (autofactura o factura hecha fuera de la app): poner sus importes', null, null, null, null, '', x.archivo];
        eurCells(row, [7, 8, 9, 10]);
    }
    const emiTot = f;
    const ve = det.ventas.sl.facturas;
    totalFila(emi, emiTot, 2, [7, 8, 9, 10], 5, emiTot - 1, { 7: suma(ve, 'base'), 8: suma(ve, 'cuota'), 9: suma(ve, 'suplidos'), 10: suma(ve, v => v.base + v.cuota + v.suplidos) });

    // SL RECIBIDAS
    const ISP_TXT = TIPO_TEXTO.ISP;
    titulo(rec, 'SL RECIBIDAS', `${sl.nombre} · Libro de facturas recibidas · ${T.n}T ${T.anio} (solo documentos con factura completa)`);
    cabecera(rec, 4, ['Nº reg.', 'Fecha fra.', 'Proveedor', 'NIF', 'Concepto', 'Tipo', 'Base', '% IVA', 'Cuota IVA', 'IVA deducible', 'Base ISP (autorrepercutir 21%)', 'Retención IRPF', 'Suplidos', 'Total', 'Pago', 'Archivo en el paquete', 'Actividad'], [7, 10, 26, 13, 46, 18, 10, 6, 9, 10, 11, 9, 9, 10, 18, 60, 12]);
    f = 5;
    const actTxt = { CAE: 'CAE', ING: 'ING', COMUN: 'COMÚN' };
    for (const x of plan.filas.recibidas) {
        const g = x.g, d = g.datos || {}, fi = g.fiscal;
        const row = rec.getRow(f++);
        const divisa = fi.moneda === 'EUR' ? null
            : `${d.total} ${fi.moneda}${fi.cambio ? ` al cambio BCE del ${esDeIso(fi.cambio.fecha)} (1 € = ${String(fi.cambio.valor).replace('.', ',')} ${fi.moneda})` : ''}`
              + (fi.dif_cambio ? `; cargado ${String(fi.cargado_eur).replace('.', ',')} €` : '');
        const concepto = [d.concepto, d.numero ? `fra ${d.numero}` : null, divisa].filter(Boolean).join(' · ');
        row.values = [x.reg, esDeIso(d.fecha), d.proveedor || g.nombre, d.nif || '', concepto, fi.tipo_texto, fi.base, pct(fi.tipo === 'ISP' ? 0 : fi.iva_pct || 0), fi.cuota,
            // Como en el libro del T3: en las ISP, «IVA deducible» es lo autorrepercutido (el RESUMEN lo resta para no contarlo dos veces).
            fi.tipo === 'ISP' ? fi.isp_cuota : fi.iva_deducible,
            fi.isp_base, fi.retencion, fi.suplidos, fi.total, g.origen === 'APP' ? 'Pendiente' : '', x.archivo, actTxt[g.actividad] || ''];
        eurCells(row, [7, 9, 10, 11, 12, 13, 14]);
        row.getCell(17).font = { bold: true };
    }
    const recTot = f;
    const gr = plan.filas.recibidas.map(x => x.g.fiscal);
    totalFila(rec, recTot, 2, [7, 9, 10, 11, 12, 13, 14], 5, recTot - 1, {
        7: suma(gr, 'base'), 9: suma(gr, 'cuota'), 10: suma(gr, x => (x.tipo === 'ISP' ? x.isp_cuota : x.iva_deducible)), 11: suma(gr, 'isp_base'),
        12: suma(gr, 'retencion'), 13: suma(gr, 'suplidos'), 14: suma(gr, 'total'),
    });

    // SL OTROS GASTOS
    titulo(otr, 'SL OTROS GASTOS', `${sl.nombre} · Gastos sin factura completa: tickets, tasas, recibos · ${T.n}T ${T.anio}`);
    cabecera(otr, 4, ['Nº reg.', 'Fecha/mes', 'Proveedor/Perceptor', 'NIF', 'Concepto', 'Tipo de justificante', 'Base', '% IVA', 'Cuota IVA', 'IVA deducible', 'Total', 'Pago', 'Archivo / justificante', 'Actividad'], [7, 10, 28, 11, 46, 26, 10, 6, 9, 10, 10, 15, 60, 12]);
    f = 5;
    for (const x of plan.filas.otros) {
        const g = x.g, d = g.datos || {}, fi = g.fiscal;
        const row = otr.getRow(f++);
        row.values = [x.reg, esDeIso(d.fecha), d.proveedor || g.nombre, d.nif || '', d.concepto || '', fi.tipo_texto, fi.base, pct(fi.iva_pct || 0), fi.cuota, fi.iva_deducible, fi.total, '', x.archivo, actTxt[g.actividad] || ''];
        eurCells(row, [7, 9, 10, 11]);
        row.getCell(14).font = { bold: true };
    }
    const otrTot = f;
    const go = plan.filas.otros.map(x => x.g.fiscal);
    totalFila(otr, otrTot, 2, [7, 9, 10, 11], 5, otrTot - 1, { 7: suma(go, 'base'), 9: suma(go, 'cuota'), 10: suma(go, 'iva_deducible'), 11: suma(go, 'total') });

    // AUT EMITIDAS
    titulo(aem, 'AUT EMITIDAS', `${aut.nombre} · Facturas expedidas · ${T.n}T ${T.anio}`);
    cabecera(aem, 4, ['Nº reg.', 'Fecha', 'Nº factura', 'Cliente', 'NIF', 'Concepto', 'Base 21%', 'Cuota IVA', 'Retención IRPF 15%', 'Total', 'Cobro', 'Archivo en el paquete'], [7, 10, 11, 30, 11, 40, 11, 10, 11, 11, 22, 60]);
    f = 5;
    for (const x of plan.filas.autEmitidas) {
        const v = x.v;
        const row = aem.getRow(f++);
        row.values = [x.reg, esDeIso(v.fecha), v.numero, v.cliente, v.nif, v.concepto, v.base, v.cuota, v.irpf, v.total, cobroTexto(v), x.archivo];
        eurCells(row, [7, 8, 9, 10]);
    }
    const aemTot = f;
    const va = det.ventas.autonomo.facturas;
    totalFila(aem, aemTot, 2, [7, 8, 9, 10], 5, aemTot - 1, { 7: suma(va, 'base'), 8: suma(va, 'cuota'), 9: suma(va, 'irpf'), 10: suma(va, 'total') });

    // AUT GASTOS
    titulo(agt, 'AUT GASTOS', `${aut.nombre} · Gastos ${T.n}T ${T.anio} (combustible: IVA 50 %, IRPF no deducible)`);
    cabecera(agt, 4, ['Nº reg.', 'Fecha', 'Proveedor', 'Concepto', 'Categoría', 'Base', '% IVA', 'Cuota IVA', 'IVA deducible', 'Deducible IRPF', 'Total', 'Archivo / justificante'], [7, 10, 22, 34, 18, 10, 6, 9, 10, 10, 10, 60]);
    f = 5;
    for (const x of plan.filas.autGastos) {
        const g = x.g, d = g.datos || {}, fi = g.fiscal;
        const row = agt.getRow(f++);
        const ded = fi.irpf_deducible_pct === 100 ? 'Sí' : fi.irpf_deducible_pct === 0 ? 'No' : pct(fi.irpf_deducible_pct);
        const concepto = [d.concepto, d.numero ? `fra ${d.numero}` : null, g.justificante?.tipo === 'EXTRACTO' ? 'cargo en el extracto del banco' : null].filter(Boolean).join(' · ');
        row.values = [x.reg, esDeIso(d.fecha), d.proveedor || g.nombre, concepto, fi.tipo_texto, fi.base, pct(fi.iva_pct || 0), fi.cuota, fi.iva_deducible, ded, fi.total, x.archivo];
        eurCells(row, [6, 8, 9, 11]);
    }
    const agtTot = f;
    const gaf = plan.filas.autGastos.map(x => x.g.fiscal);
    totalFila(agt, agtTot, 2, [6, 8, 9, 11], 5, agtTot - 1, { 6: suma(gaf, 'base'), 8: suma(gaf, 'cuota'), 9: suma(gaf, 'iva_deducible'), 11: suma(gaf, 'total') });

    // 111
    r111.getCell('A1').value = `111 RETENCIONES · ${sl.nombre} · ${T.n}T ${T.anio}`;
    r111.getCell('A1').font = { bold: true, size: 13 };
    cabecera(r111, 3, ['Perceptor', 'NIF', 'Base', 'Retención 15%'], [32, 12, 14, 14]);
    f = 4;
    for (const p of det.m111.perceptores) {
        const row = r111.getRow(f);
        row.values = [p.perceptor, p.nif || '',
            { formula: `SUMIFS('SL RECIBIDAS'!G:G,'SL RECIBIDAS'!D:D,B${f},'SL RECIBIDAS'!L:L,">0")`, result: p.base },
            { formula: `SUMIFS('SL RECIBIDAS'!L:L,'SL RECIBIDAS'!D:D,B${f})`, result: p.retencion }];
        eurCells(row, [3, 4]);
        f++;
    }
    totalFila(r111, f, 1, [3, 4], 4, f - 1, { 3: det.m111.base, 4: det.m111.retencion });

    // RESUMEN
    res.getColumn(1).width = 62; res.getColumn(2).width = 16; res.getColumn(3).width = 69;
    res.getCell('A1').value = `BROKERGY · CIERRE ${T.n}T ${T.anio} (${MESES[T.meses[0] - 1]}-${MESES[T.meses[2] - 1]}) · Paquete para Grupo Asesor OTS`;
    res.getCell('A1').font = { bold: true, size: 13 };
    res.getCell('A2').value = `Preparado el ${esDeIso(hoy)} desde la app de BROKERGY. Cifras ESTIMADAS: los modelos los presenta la gestoría.`;
    const bloque = (fila, texto) => { const c = res.getCell(`A${fila}`); c.value = texto; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }; };
    const linea = (fila, texto, valor, nota = '', destacar = null) => {
        res.getCell(`A${fila}`).value = texto;
        const b = res.getCell(`B${fila}`);
        b.value = valor; b.numFmt = EUR;
        if (nota) res.getCell(`C${fila}`).value = nota;
        if (destacar) for (const k of ['A', 'B']) { const c = res.getCell(`${k}${fila}`); c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: destacar } }; }
    };
    const s3 = det.m303.sl, a3 = det.m303.autonomo;
    const ispProv = [...new Set(det.gastos.sl.filas.filter(g => g.fiscal.tipo === 'ISP').map(g => proveedorCorto(g.datos.proveedor)))].join(', ');
    const nums = ve.map(v => v.numero);
    bloque(4, `${sl.nombre} (${sl.nif || ''})`);
    linea(5, 'Base imponible ventas 21%', { formula: `'SL EMITIDAS'!G${emiTot}`, result: suma(ve, 'base') }, nums.length ? `${nums.length} facturas ${nums[0]} a ${nums[nums.length - 1]}` : 'Sin ventas');
    linea(6, 'IVA devengado (régimen general)', { formula: `'SL EMITIDAS'!H${emiTot}`, result: s3.devengado.cuota });
    linea(7, 'Base ISP (servicios de empresarios no establecidos)', { formula: `'SL RECIBIDAS'!K${recTot}`, result: s3.isp.base }, ispProv ? `${ispProv}. Autorrepercutir y deducir el 21%` : '');
    linea(8, 'IVA devengado ISP (21%)', { formula: 'ROUND(B7*0.21,2)', result: s3.isp.cuota });
    linea(9, 'IVA deducible facturas recibidas (sin el de ISP)', { formula: `'SL RECIBIDAS'!J${recTot}-SUMIFS('SL RECIBIDAS'!J:J,'SL RECIBIDAS'!F:F,"${ISP_TXT}")+'SL OTROS GASTOS'!J${otrTot}`, result: s3.deducible.interior }, 'La columna J de las ISP es lo autorrepercutido: se resta aquí para no deducirlo dos veces');
    linea(10, 'IVA deducible ISP (21%)', { formula: 'B8', result: s3.isp.cuota });
    linea(11, 'RESULTADO 303 SL (positivo = a ingresar; negativo = a compensar)', { formula: 'B6+B8-B9-B10', result: s3.resultado }, '', 'FFE2EFDA');
    linea(12, 'Retenciones practicadas (modelo 111)', { formula: `'SL RECIBIDAS'!L${recTot}`, result: det.m111.retencion }, det.m111.perceptores.map(p => `${p.perceptor} ${fmt(p.retencion)}`).join(' + '), 'FFFFF2CC');
    linea(13, 'Adquisiciones intracomunitarias de servicios (349)', det.m349.base, det.m349.candidatos.map(c => `${c.proveedor} (${c.pais}) ${fmt(c.base)}`).join('; ') || 'Ninguna');
    linea(14, 'Inversiones del trimestre (inmovilizado)', { formula: `SUMIFS('SL RECIBIDAS'!G:G,'SL RECIBIDAS'!F:F,"Inversión*")`, result: det.gastos.sl.totales.inversiones });
    bloque(16, `AUTÓNOMO · ${aut.nombre} (${aut.nif || ''})`);
    linea(17, 'Base imponible ventas 21%', { formula: `'AUT EMITIDAS'!G${aemTot}`, result: suma(va, 'base') }, va.map(v => v.numero).join(', '));
    linea(18, 'IVA devengado', { formula: `'AUT EMITIDAS'!H${aemTot}`, result: a3.devengado.cuota });
    linea(19, 'IVA deducible', { formula: `'AUT GASTOS'!I${agtTot}`, result: a3.deducible.interior });
    linea(20, 'RESULTADO 303 AUTÓNOMO (a ingresar)', { formula: 'B18-B19', result: a3.resultado }, '', 'FFE2EFDA');
    linea(21, 'Retenciones soportadas (15%)', { formula: `'AUT EMITIDAS'!I${aemTot}`, result: suma(va, 'irpf') }, 'Practicadas por la SL e ingresadas en su 111');
    linea(22, 'Gastos deducibles IRPF del trimestre', { formula: `SUMIFS('AUT GASTOS'!F:F,'AUT GASTOS'!J:J,"Sí")`, result: suma(gaf.filter(x => x.irpf_deducible_pct === 100), 'base') }, 'Con la cuota de autónomos y el colegio (de los extractos del banco; las que faltan, estimadas)');
    if (det.m130?.acumulado) linea(23, `Modelo 130 estimado (acumulado ${T.anio})`, det.m130.acumulado.resultado, `Rendimiento ${fmt(det.m130.acumulado.rendimiento)} · retenciones ${fmt(det.m130.acumulado.retenciones)}. ${det.m130.nota}`);
    bloque(25, 'PENDIENTES ANTES DE PRESENTAR: ver la hoja PENDIENTES');
    bloque(27, 'GASTOS SL POR ACTIVIDAD (lo específico de CAE en CAE; lo general en COMUNES)');
    ['Actividad', 'Base', 'IVA deducible'].forEach((t, k) => { const c = res.getRow(28).getCell(k + 1); c.value = t; c.font = { bold: true }; });
    const pa = det.gastos.sl.totales.por_actividad;
    [['CAE', 'CAE'], ['Comunes (ambas actividades)', 'COMÚN'], ['Ingeniería (específicas)', 'ING']].forEach(([txt, clave], k) => {
        const fila = 29 + k;
        const key = clave === 'COMÚN' ? 'COMUN' : clave;
        res.getCell(`A${fila}`).value = txt;
        res.getCell(`B${fila}`).value = { formula: `SUMIFS('SL RECIBIDAS'!G:G,'SL RECIBIDAS'!Q:Q,"${clave}")+SUMIFS('SL OTROS GASTOS'!G:G,'SL OTROS GASTOS'!N:N,"${clave}")`, result: pa[key]?.base || 0 };
        res.getCell(`C${fila}`).value = { formula: `SUMIFS('SL RECIBIDAS'!J:J,'SL RECIBIDAS'!Q:Q,"${clave}")+SUMIFS('SL OTROS GASTOS'!J:J,'SL OTROS GASTOS'!N:N,"${clave}")`, result: pa[key]?.iva_deducible || 0 };
        res.getCell(`B${fila}`).numFmt = EUR; res.getCell(`C${fila}`).numFmt = EUR;
    });

    // PENDIENTES
    pen.getCell('A1').value = `PENDIENTES ANTES DE PRESENTAR (plazo ${esDeIso(det.plazo.fecha)})`;
    pen.getCell('A1').font = { bold: true, size: 13 };
    cabecera(pen, 3, ['Prioridad', 'Pendiente', 'Responsable'], [11, 100, 14]);
    const prioridad = { rojo: ['ALTA', 'FFFCE4D6'], ambar: ['MEDIA', 'FFFFF2CC'], azul: ['BAJA', 'FFF2F2F2'] };
    const vistos = new Set();
    const items = [...plan.faltan, ...det.avisos, ...det.checklist.filter(c => c.ok === false).map(c => ({ tono: 'ambar', texto: `${c.texto}: ${c.detalle}` }))]
        .filter(a => !vistos.has(a.texto) && vistos.add(a.texto))
        .sort((a, b) => ['rojo', 'ambar', 'azul'].indexOf(a.tono) - ['rojo', 'ambar', 'azul'].indexOf(b.tono));
    f = 4;
    for (const a of items) {
        const [p, color] = prioridad[a.tono] || prioridad.azul;
        const row = pen.getRow(f++);
        row.values = [p, a.texto, 'Fran'];
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        row.getCell(2).alignment = { wrapText: true };
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const hojas = wb.worksheets.map(ws => ({ nombre: ws.name, filas: ws.actualRowCount }));
    return { buffer, hojas };
}

/**
 * Monta el paquete en «ENTREGA GESTORÍA / {AAAA-Tn (mes-mes)}». Con `seco`
 * devuelve el plan SIN escribir nada. Sin `seco`: crea las carpetas que falten,
 * COPIA los PDF que no estén ya con su nombre y sube el libro (sin pisar uno que
 * ya exista: el nuevo sale con la fecha).
 */
async function paquete(tStr, { seco = true, hoy = hoyMadrid() } = {}) {
    const det = await trimestre(tStr, { hoy });
    if (!det.gastos.drive) throw error('Drive no responde: el paquete no se puede preparar', 502);
    const plan = await planPaquete(det);
    const T = plan.T;
    const nombreCarpeta = nombreCarpetaPaquete(T);
    const libro = await libroPaquete(det, plan, { hoy });

    // Lo que ya hay (para no copiar dos veces). Un fichero cuenta como puesto si
    // está en el paquete con el mismo nombre SIN su prefijo de registro, en
    // cualquier subcarpeta: el T3 se montó a mano con otra numeración R-/O- y
    // otro reparto por actividad, y no se duplica.
    const raizId = await gastosDrive.carpeta(gastosDrive.ENTREGA_GESTORIA, nombreCarpeta);
    const ids = { '': raizId };
    const carpetas = [...new Set(plan.ficheros.map(x => x.carpeta))].sort();
    const idDe = async (ruta, crear) => {
        if (ids[ruta] !== undefined) return ids[ruta];
        const partes = ruta.split('/');
        const padre = partes.length > 1 ? await idDe(partes.slice(0, -1).join('/'), crear) : ids[''];
        ids[ruta] = padre ? await gastosDrive.carpeta(padre, partes[partes.length - 1], { crear }) : null;
        return ids[ruta];
    };
    const yaHay = raizId ? await gastosDrive.nombresBajo(raizId, 3) : new Map();
    const porBase = new Map([...yaHay].map(([n, ruta]) => [sinPrefijoRegistro(n), ruta ? `${ruta}/${n}` : n]));
    const libroExiste = yaHay.get(nombreLibro(T)) === '';
    const libroNombre = libroExiste ? nombreLibro(T).replace(/\.xlsx$/, ` (app ${hoy}).xlsx`) : nombreLibro(T);

    const ficheros = plan.ficheros.map(x => {
        const esta = porBase.get(sinPrefijoRegistro(x.nombre));
        return { carpeta: x.carpeta, nombre: x.nombre, origen: x.origen, accion: esta ? 'YA_ESTA' : 'COPIAR', ...(esta && esta !== `${x.carpeta}/${x.nombre}` ? { esta_como: esta } : {}) };
    });
    const resumen = {
        t: T.t, carpeta: `ENTREGA GESTORÍA / ${nombreCarpeta}`, carpeta_existe: !!raizId, seco,
        carpetas: [...new Set(carpetas.flatMap(c => c.split('/').map((_, k, a) => a.slice(0, k + 1).join('/'))))].sort(),
        ficheros, copiar: ficheros.filter(x => x.accion === 'COPIAR').length, ya_estan: ficheros.filter(x => x.accion === 'YA_ESTA').length,
        libro: { nombre: libroNombre, hojas: libro.hojas, bytes: libro.buffer.length, pisaria: false },
        faltan: plan.faltan, checklist: det.checklist,
        m303: { sl: det.m303.sl.resultado, autonomo: det.m303.autonomo.resultado }, m111: det.m111.retencion,
        estimado: true,
    };
    if (seco) return resumen;

    // Escribir: carpetas, copias y el libro.
    if (!raizId) ids[''] = await gastosDrive.carpeta(gastosDrive.ENTREGA_GESTORIA, nombreCarpeta, { crear: true });
    for (const k of Object.keys(ids)) if (k && !ids[k]) delete ids[k];
    const hechos = [];
    const errores = [];
    for (const x of ficheros) {
        if (x.accion !== 'COPIAR') continue;
        try {
            const destino = await idDe(x.carpeta, true);
            const c = await gastosDrive.copiar(x.origen.fileId, destino, x.nombre);
            hechos.push({ ...x, id: c.id });
        } catch (e) { errores.push({ ...x, error: e.message }); }
    }
    const subido = await gastosDrive.subir(ids[''], libroNombre, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', libro.buffer);
    return { ...resumen, seco: false, copiados: hechos.length, errores, libro: { ...resumen.libro, id: subido.id, link: subido.link } };
}

module.exports = {
    cuadro, trimestre, gastos, leer, conFiscalDe, paquete, planPaquete, libroPaquete,
    // ESCRIBE en Drive: el cobro de una venta CAE de Drive (ruta y scripts)
    cobroVentaDrive,
    // puros (pruebas)
    parseTrimestre, plazos, trimestreDeFecha, desgloseVenta, fiscalGasto, conFiscal, gastoDeFml, gastoDeCuota, actividadDe, ventaDeDrive, ventasCaeSinRegistrar,
    avisosLotesSinCobro, comparacionAnterior, cobrosDrive, LOTE_YA_COBRADO, fechaIsoDe,
    calcular303, calcular111, calcular349, calcular130, totalesVentas, totalesGastos, huecosSerie, mesesDeFml,
    nombreRecibida, nombreCarpetaPaquete, nombreLibro, nombreExtracto, sinPrefijoRegistro, proveedorCorto, ueDeNif, nifEs, SUB, ACT, TIPO_TEXTO,
};
