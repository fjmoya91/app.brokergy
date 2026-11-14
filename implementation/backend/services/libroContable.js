// ════════════════════════════════════════════════════════════════════════════
// El LIBRO MAESTRO de la contabilidad: lo que ya se ha entregado a la gestoría.
//
// «04. CONTABILIDAD / CONTABILIDAD {año} - BROKERGY (master).xlsx» es el libro que
// se cierra cada trimestre (SOP «Cierre contable trimestral», en la misma carpeta):
// hoja «GASTOS {año}» con las facturas recibidas de la SL (líneas CAE, ING y la
// FML que el socio factura a la SL) y hoja «VEHÍCULO Y DIETAS» con los tickets
// (columna Contrib.: «Empresa SL» o «Autónomo»). Para un trimestre CERRADO es la
// verdad contable: manda sobre la lectura factura a factura de Drive.
//
// SOLO LEE: descarga el .xlsx y lo interpreta en memoria. No escribe nada en Drive.
// Las columnas se buscan por su cabecera, no por su posición.
// ════════════════════════════════════════════════════════════════════════════
const ExcelJS = require('exceljs');
const gd = require('./gastosDrive');

const nombreLibro = (anio) => `CONTABILIDAD ${anio} - BROKERGY (master).xlsx`;
const MES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const TTL_MS = 10 * 60 * 1000;
const cache = new Map();   // anio → { modifiedTime, libro, en }

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const nifDe = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function valor(cell) {
    const x = cell?.value;
    if (x == null) return null;
    if (x instanceof Date) return x.toISOString().slice(0, 10);
    if (typeof x === 'object') {
        if ('result' in x) return x.result instanceof Date ? x.result.toISOString().slice(0, 10) : x.result;
        if (x.richText) return x.richText.map(t => t.text).join('');
        if ('text' in x) return x.text;
        return null;   // una fórmula sin resultado guardado
    }
    return x;
}
const num = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/[€\s]/g, '');
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? n : null;
};

/** La fila de cabecera (la que tiene todas las `claves`) y { CABECERA → nº de columna }. */
function cabecera(ws, claves, { hasta = 8 } = {}) {
    for (let r = 1; r <= Math.min(hasta, ws.rowCount); r++) {
        const row = ws.getRow(r);
        const mapa = {};
        for (let c = 1; c <= Math.min(ws.columnCount, 40); c++) {
            const t = sinTildes(valor(row.getCell(c)));
            if (t && !(t in mapa)) mapa[t] = c;
        }
        if (claves.every(k => Object.keys(mapa).some(h => h.startsWith(k)))) return { fila: r, mapa };
    }
    return null;
}
const col = (mapa, prefijo) => { const h = Object.keys(mapa).find(k => k.startsWith(prefijo)); return h ? mapa[h] : null; };

// El mes contable: el de la columna Mes si cae dentro del trimestre fiscal de la
// fila; si no (la Pepephone de marzo facturada el 1/04 va en T2), el primer mes
// de ese trimestre. Así los meses suman exactamente lo de cada trimestre.
function mesContable(trim, mesTxt, fecha) {
    const q = Number(String(trim || '').match(/T([1-4])/)?.[1]);
    if (!q) return null;
    let m = MES[String(mesTxt || '').toLowerCase().slice(0, 3)] || (fecha ? Number(String(fecha).slice(5, 7)) : null);
    if (!m || Math.ceil(m / 3) !== q) m = (q - 1) * 3 + 1;
    return m;
}

/** Interpreta un libro ya abierto (puro: se prueba sin Drive). */
function interpretar(wb, anio) {
    const filas = [];
    const avisos = [];

    // ── GASTOS {año}: facturas recibidas de la SL ───────────────────────────
    const wsG = wb.worksheets.find(w => sinTildes(w.name) === `GASTOS ${anio}`) || wb.worksheets.find(w => sinTildes(w.name).startsWith('GASTOS'));
    const cg = wsG && cabecera(wsG, ['LINEA', 'TRIM', 'PROVEEDOR', 'BASE']);
    if (!cg) avisos.push('El libro no tiene la hoja de GASTOS con su cabecera (Línea, Trim., Proveedor, Base).');
    else {
        const C = (p) => col(cg.mapa, p);
        const c = { linea: C('LINEA'), trim: C('TRIM'), mes: C('MES'), prov: C('PROVEEDOR'), nif: C('NIF'), concepto: C('CONCEPTO'), base: C('BASE'), cuota: C('CUOTA IVA'), ded: C('IVA DEDUC. ('), isp: C('ISP'), inmov: C('INMOV') };
        if (!c.ded) c.ded = Object.entries(cg.mapa).filter(([k]) => k.startsWith('IVA DEDUC')).map(([, v]) => v).sort((a, b) => b - a)[0] || null;
        for (let r = cg.fila + 1; r <= wsG.rowCount; r++) {
            const row = wsG.getRow(r);
            const g = (k) => (c[k] ? valor(row.getCell(c[k])) : null);
            const linea = sinTildes(g('linea'));
            const proveedor = String(g('prov') ?? '').trim();
            if (!linea && !proveedor) continue;
            if (!['CAE', 'ING', 'FML'].includes(linea)) continue;   // filas de totales o notas
            const trim = String(g('trim') || '').toUpperCase().trim();
            filas.push({
                hoja: 'GASTOS', fila: r, linea, trimestre: /^T[1-4]$/.test(trim) ? trim : null,
                mes: mesContable(trim, g('mes')), proveedor, nif: nifDe(g('nif')), concepto: String(g('concepto') ?? '').trim(),
                base: num(g('base')), cuota: num(g('cuota')) || 0, ivaDeducible: num(g('ded')) || 0,
                isp: /ISP/i.test(String(g('isp') || '')), inmovilizado: /INMOV/i.test(String(g('inmov') || '')),
            });
        }
    }

    // ── VEHÍCULO Y DIETAS: solo los tickets de la EMPRESA ───────────────────
    const wsV = wb.worksheets.find(w => sinTildes(w.name).startsWith('VEHICULO'));
    const cv = wsV && cabecera(wsV, ['CONTRIB', 'TRIM', 'PROVEEDOR', 'BASE']);
    if (wsV && !cv) avisos.push('La hoja VEHÍCULO Y DIETAS no tiene su cabecera (Contrib., Trim., Proveedor, Base).');
    if (cv) {
        const C = (p) => col(cv.mapa, p);
        const c = { contrib: C('CONTRIB'), trim: C('TRIM'), fecha: C('FECHA'), prov: C('PROVEEDOR'), concepto: C('CONCEPTO'), cat: C('CATEGORIA'), base: C('BASE'), cuota: C('CUOTA IVA') };
        c.ded = Object.entries(cv.mapa).filter(([k]) => k.startsWith('IVA DEDUC')).map(([, v]) => v).sort((a, b) => b - a)[0] || null;
        for (let r = cv.fila + 1; r <= wsV.rowCount; r++) {
            const row = wsV.getRow(r);
            const g = (k) => (c[k] ? valor(row.getCell(c[k])) : null);
            const contrib = sinTildes(g('contrib'));
            if (!contrib.startsWith('EMPRESA') && !contrib.includes('SL')) continue;   // lo del autónomo no es de la SL
            const t = String(g('trim') || '').toUpperCase().match(/^(\d{4})-(T[1-4])$/);
            if (!t || Number(t[1]) !== Number(anio)) continue;
            filas.push({
                hoja: 'VEHICULO', fila: r, linea: 'SL', trimestre: t[2],
                mes: mesContable(t[2], null, g('fecha')), proveedor: String(g('prov') ?? '').trim(), nif: '',
                concepto: [g('cat'), g('concepto')].filter(Boolean).join(' · '),
                base: num(g('base')), cuota: num(g('cuota')) || 0, ivaDeducible: num(g('ded')) || 0, isp: false, inmovilizado: false,
            });
        }
    }

    // ── El control de la gestoría: «Gastos SL — Base imponible» del RESUMEN ──
    const control = {};
    const wsR = wb.worksheets.find(w => sinTildes(w.name) === 'RESUMEN');
    if (wsR) {
        let colsT = null;
        for (let r = 1; r <= wsR.rowCount; r++) {
            const row = wsR.getRow(r);
            const celdas = Array.from({ length: Math.min(wsR.columnCount, 10) }, (_, i) => valor(row.getCell(i + 1)));
            const ts = celdas.map(v => String(v || '').match(/^\d{4}-(T[1-4])$/)?.[1] || null);
            if (ts.filter(Boolean).length >= 2) colsT = ts;
            if (colsT && sinTildes(celdas[0]).startsWith('GASTOS SL')) {
                colsT.forEach((t, i) => { if (t && num(celdas[i]) != null) control[t] = r2(num(celdas[i])); });
                break;
            }
        }
    }
    return { filas, control, avisos };
}

/**
 * Clasifica una fila del libro para la cuenta de resultados de la SL (puro).
 *  - BONO: la cesión del ahorro al cliente (ya está en el coste directo de cada venta).
 *  - INVERSION: inmovilizado (CAPEX, va debajo del EBITDA).
 *  - CERTIFICADOS: honorarios de los certificadores y tasas del registro de los CEE
 *    del CAE (ya están en el coste directo de cada expediente).
 *  - SIN_IMPORTE: filas sin base todavía («IMPORTE PENDIENTE»).
 *  - ESTRUCTURA: el resto (incluida la FML del socio).
 */
function clasificar(f, { certNifs = new Set() } = {}) {
    if (!f.trimestre) return 'SIN_IMPORTE';
    if (f.base == null || f.base === 0) return 'SIN_IMPORTE';
    const texto = sinTildes(`${f.proveedor} ${f.concepto}`);
    if (/CESION .*BONO|BONO ENERGETICO|CESION (DE(L)? )?AHORRO/.test(texto)) return 'BONO';
    if (f.inmovilizado) return 'INVERSION';
    if (f.linea === 'CAE' && ((f.nif && certNifs.has(f.nif)) || /\bCEE\b/.test(texto))) return 'CERTIFICADOS';
    return 'ESTRUCTURA';
}
// IVA soportado que no se deduce: es coste (el ISP se autorrepercute y deduce: neutro).
const ivaNoDeducible = (f) => (f.isp ? 0 : Math.max(0, (f.cuota || 0) - (f.ivaDeducible || 0)));

/** Lo que el libro dice de los gastos de la SL, por trimestre y mes (puro). */
function resumir({ filas, control }, { certNifs } = {}) {
    const T = {};
    for (const f of filas) {
        const tipo = clasificar(f, { certNifs });
        if (!f.trimestre) continue;
        const t = (T[f.trimestre] ||= { filas: 0, estructura: 0, fml: 0, ivaNoDeducible: 0, inversiones: 0, certificadores: 0, bonos: 0, sinImporte: 0, meses: Array(12).fill(0), baseTotal: 0 });
        t.filas++;
        t.baseTotal += f.base || 0;
        if (tipo === 'SIN_IMPORTE') { t.sinImporte++; continue; }
        if (tipo === 'BONO') { t.bonos += f.base; continue; }
        if (tipo === 'INVERSION') { t.inversiones += f.base; continue; }
        if (tipo === 'CERTIFICADOS') { t.certificadores += f.base; continue; }
        const iva = ivaNoDeducible(f);
        const importe = f.base + iva;
        t.estructura += importe;
        t.ivaNoDeducible += iva;
        if (f.linea === 'FML') t.fml += f.base;
        if (f.mes) t.meses[f.mes - 1] += importe;
    }
    for (const [k, t] of Object.entries(T)) {
        for (const c of ['estructura', 'fml', 'ivaNoDeducible', 'inversiones', 'certificadores', 'bonos', 'baseTotal']) t[c] = r2(t[c]);
        t.meses = t.meses.map(r2);
        // ¿Suma lo mismo que el RESUMEN de la gestoría? (toda la base, sin clasificar)
        t.control = control?.[k] ?? null;
        t.cuadra = t.control == null ? null : Math.abs(t.control - t.baseTotal) < 1;
    }
    return T;
}

/**
 * El libro del año desde Drive: { archivo, trimestres, avisos } o null si no existe.
 * Se recuerda mientras el fichero no cambie (comprueba su modifiedTime cada 10 min).
 */
async function gastosDelLibro(anio, { certNifs, forzar = false } = {}) {
    const c = cache.get(anio);
    if (c && !forzar && Date.now() - c.en < TTL_MS) return conResumen(c, certNifs);
    const meta = await gd.ficheroEn(gd.RAIZ_CONTABILIDAD, nombreLibro(anio));
    if (!meta) { cache.set(anio, { modifiedTime: null, libro: null, en: Date.now() }); return null; }
    if (c?.libro && c.modifiedTime === meta.modifiedTime) { c.en = Date.now(); return conResumen(c, certNifs); }
    const buf = await gd.contenido(meta.id);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const libro = { archivo: { id: meta.id, nombre: meta.name, modificado: meta.modifiedTime }, ...interpretar(wb, anio) };
    const nuevo = { modifiedTime: meta.modifiedTime, libro, en: Date.now() };
    cache.set(anio, nuevo);
    return conResumen(nuevo, certNifs);
}
function conResumen(c, certNifs) {
    if (!c.libro) return null;
    return { archivo: c.libro.archivo, avisos: c.libro.avisos, trimestres: resumir(c.libro, { certNifs }) };
}

module.exports = { gastosDelLibro, nombreLibro, interpretar, resumir, clasificar, mesContable, ivaNoDeducible };
