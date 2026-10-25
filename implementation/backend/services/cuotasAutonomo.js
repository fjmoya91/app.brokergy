// ─── cuotasAutonomo.js ───────────────────────────────────────────────────────
// La CUOTA DE AUTÓNOMOS (RETA) y la del COLEGIO del autónomo, que no llegan en
// PDF a «FML / GASTOS»: se cargan en su cuenta de CaixaBank y se sacan de los
// EXTRACTOS de «EXTRACTOS Y RECIBOS / 02. AUTÓNOMO» (Fran, 24/10/2026: «tenlo en
// cuenta. El objetivo es tener una situación real de la empresa»).
//
// - Un cargo del extracto («TGSS.COTIZACI.;31/07/2026;-315,00EUR») es el dato
//   bueno. Un recibo de la TGSS («PERIODO LIQUIDACION 01 2026-01 2026.pdf») dice
//   que ese mes se pagó, pero su importe no se lee: se toma la cuota del cargo más
//   cercano y se avisa.
// - Un mes ya cargado sin extracto ni recibo se ESTIMA con la cuota del cargo más
//   cercano DEL MISMO AÑO (la cuota cambia en enero) y sale en ámbar. Sin ningún
//   dato del año no se estima: se avisa.
// - El colegio (COITI Albacete) cobra el semestre en febrero y julio (2025: 05/02
//   y 09/07; 2026: 08/07): en esos meses, sin cargo, se estima igual.
// - Las dos son gasto deducible del IRPF al 100 % y sin IVA (es lo que se hizo en
//   «Gastos imputables autonomo 2025» y en el T3 de 2026).
//
// Puro (sin Drive ni red): lo prueba scripts/test_contabilidad.mjs. Los ficheros
// los trae `gastosDrive.extractosAutonomo`.
// ─────────────────────────────────────────────────────────────────────────────

const CLASES = {
    RETA: { re: /TGSS|COTIZACI|SEG(?:URIDAD)?\.?\s*SOC|R\.?E\.?\s*AUT[OÓ]NOMOS/i, proveedor: 'Tesorería General de la Seguridad Social', texto: 'Cuota de autónomos (RETA)' },
    COLEGIO: { re: /COITI|COLEGIO/i, proveedor: 'Colegio profesional (COITI Albacete)', texto: 'Cuota del colegio profesional' },
};
const MESES_COLEGIO = [2, 7];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const finDeMes = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-${String(new Date(Date.UTC(anio, mes, 0)).getUTCDate()).padStart(2, '0')}`;
const dias = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

/** «-1.353,17EUR» / «-315,00» / «-298.40» → número con signo, o null. */
function importe(s) {
    let t = String(s ?? '').replace(/EUR|€|\s/gi, '');
    if (!t) return null;
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

/** «31/07/2026» o «2026-07-31 09:07:38» → «2026-07-31», o null. */
function fecha(s) {
    const t = String(s || '').trim();
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Una línea de CSV con comillas (las de Revolut) en sus campos. */
function campos(linea, sep) {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < linea.length; i++) {
        const c = linea[i];
        if (q) {
            if (c === '"' && linea[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') q = false;
            else cur += c;
        } else if (c === '"') q = true;
        else if (c === sep) { out.push(cur); cur = ''; }
        else cur += c;
    }
    out.push(cur);
    return out.map(x => x.trim());
}

/**
 * Los movimientos de un CSV del banco: CaixaBank («Concepto;Fecha;Importe;Saldo»)
 * o Revolut («…,Fecha de finalización,Descripción,Importe,…,State,…»; solo los
 * COMPLETADOS). [{ fecha, concepto, importe }] (importe < 0 = cargo).
 */
function movimientosDeCsv(texto) {
    const lineas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lineas.length) return [];
    const sep = lineas[0].split(';').length > lineas[0].split(',').length ? ';' : ',';
    const cab = campos(lineas[0], sep).map(c => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    const col = (...nombres) => cab.findIndex(c => nombres.includes(c));
    const iConcepto = col('concepto', 'descripcion', 'description');
    const iFecha = col('fecha de finalizacion', 'completed date', 'fecha', 'fecha operacion', 'fecha valor', 'date');
    const iImporte = col('importe', 'amount');
    const iEstado = col('state', 'estado');
    if (iConcepto < 0 || iFecha < 0 || iImporte < 0) return [];
    const out = [];
    for (const l of lineas.slice(1)) {
        const c = campos(l, sep);
        if (iEstado >= 0 && c[iEstado] && !/COMPLET/i.test(c[iEstado])) continue;
        const f = fecha(c[iFecha]);
        const imp = importe(c[iImporte]);
        if (f && imp != null) out.push({ fecha: f, concepto: c[iConcepto] || '', importe: imp });
    }
    return out;
}

/** 'RETA' | 'COLEGIO' | null */
const clase = (concepto) => Object.keys(CLASES).find(k => CLASES[k].re.test(String(concepto || ''))) || null;

/** «PERIODO LIQUIDACION  01 2026-01 2026.pdf» → { anio: 2026, mes: 1 }, o null. */
function mesDeRecibo(nombre) {
    const m = /LIQUIDACI[OÓ]N\D*?(\d{1,2})\s+(\d{4})/i.exec(String(nombre || ''));
    if (!m) return null;
    const mes = Number(m[1]);
    return mes >= 1 && mes <= 12 ? { anio: Number(m[2]), mes } : null;
}

/**
 * Los cargos de RETA y colegio que tocan a unos meses de un año, con los que
 * falten estimados. `extractos` = [{ fileId, nombre, link, texto }] (CSV) y
 * `recibos` = [{ fileId, nombre, link }] (PDF de la TGSS). Devuelve
 * { filas: [{ clase, mes, fecha, importe, origen: BANCO|RECIBO|ESTIMADA, concepto, fuente }], avisos }.
 */
function cuotasDe({ anio, meses, hoy, extractos = [], recibos = [] }) {
    const avisos = [];
    // Todos los cargos (de cualquier fecha: sirven de referencia), sin repetidos.
    const vistos = new Set();
    const cargos = [];
    for (const x of extractos) {
        for (const m of movimientosDeCsv(x.texto)) {
            const k = clase(m.concepto);
            if (!k || !(m.importe < 0)) continue;
            const id = `${k}|${m.fecha}|${r2(-m.importe)}`;
            if (vistos.has(id)) continue;
            vistos.add(id);
            cargos.push({ clase: k, fecha: m.fecha, importe: r2(-m.importe), concepto: m.concepto, fuente: { fileId: x.fileId, nombre: x.nombre, link: x.link || null, tipo: 'EXTRACTO' } });
        }
    }
    const recibosDe = recibos.map(r => ({ ...r, am: mesDeRecibo(r.nombre) })).filter(r => r.am);
    const delAnio = (k) => cargos.filter(c => c.clase === k && c.fecha.startsWith(String(anio)));
    // La cuota de referencia: la del cargo del mismo año más cercano a esa fecha.
    const referencia = (k, f) => delAnio(k).sort((a, b) => dias(a.fecha, f) - dias(b.fecha, f))[0] || null;

    const filas = [];
    const enMes = (k, m) => cargos.filter(c => c.clase === k && c.fecha.slice(0, 7) === `${anio}-${String(m).padStart(2, '0')}`);
    for (const m of meses) {
        const fin = finDeMes(anio, m);
        const cargado = fin <= hoy;            // la RETA se carga el último día del mes
        // RETA: todos los meses
        const reales = enMes('RETA', m);
        if (reales.length) for (const c of reales) filas.push({ ...c, mes: m, origen: 'BANCO' });
        else {
            const rec = recibosDe.find(r => r.am.anio === anio && r.am.mes === m);
            const ref = referencia('RETA', fin);
            if (rec && ref) {
                filas.push({ clase: 'RETA', mes: m, fecha: fin, importe: ref.importe, origen: 'RECIBO', concepto: rec.nombre, fuente: { fileId: rec.fileId, nombre: rec.nombre, link: rec.link || null, tipo: 'RECIBO' } });
            } else if (cargado && ref) {
                filas.push({ clase: 'RETA', mes: m, fecha: fin, importe: ref.importe, origen: 'ESTIMADA', concepto: null, fuente: null });
                avisos.push({ tono: 'ambar', texto: `Cuota de autónomos de ${MESES[m - 1]} ESTIMADA (${String(ref.importe).replace('.', ',')} €, la del ${ref.fecha.split('-').reverse().join('/')}): falta el extracto o el recibo en EXTRACTOS Y RECIBOS / 02. AUTÓNOMO` });
            } else if (cargado || rec) {
                avisos.push({ tono: 'ambar', texto: `Sin dato de la cuota de autónomos de ${MESES[m - 1]} ${anio}: sube el extracto de CaixaBank a EXTRACTOS Y RECIBOS / 02. AUTÓNOMO (no cuenta en el 130)` });
            }
        }
        // Colegio: los cargos que haya, y en febrero y julio, el que falte
        const col = enMes('COLEGIO', m);
        if (col.length) for (const c of col) filas.push({ ...c, mes: m, origen: 'BANCO' });
        else if (MESES_COLEGIO.includes(m) && cargado) {
            const ref = referencia('COLEGIO', fin) || cargos.filter(c => c.clase === 'COLEGIO').sort((a, b) => dias(a.fecha, fin) - dias(b.fecha, fin))[0] || null;
            if (ref) {
                filas.push({ clase: 'COLEGIO', mes: m, fecha: fin, importe: ref.importe, origen: 'ESTIMADA', concepto: ref.concepto, fuente: null });
                avisos.push({ tono: 'ambar', texto: `Cuota del colegio de ${MESES[m - 1]} ESTIMADA (${String(ref.importe).replace('.', ',')} €, la del ${ref.fecha.split('-').reverse().join('/')}): falta el extracto de ese mes` });
            } else {
                avisos.push({ tono: 'azul', texto: `Sin dato de la cuota del colegio de ${MESES[m - 1]} ${anio}: si se cobró, sube el extracto` });
            }
        }
    }
    filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clase.localeCompare(b.clase));
    return { filas, avisos };
}

module.exports = { cuotasDe, movimientosDeCsv, clase, mesDeRecibo, importe, CLASES, MESES_COLEGIO };
