// ─────────────────────────────────────────────────────────────────────────────
// El REGISTRO NACIONAL DE CAE de un Sujeto Obligado, leído del certificado que le
// expide el MITECO (Fran, 19/11/2026: «EN DESCARGAS HE DEJADO LOS CAEs QUE TIENE
// INTERALCO EMITIDOS EN EL MINISTERIO»).
//
// El S.O. lo pide por el Registro Electrónico Común y el MITECO contesta con:
//   · un EXCEL con los tramos inscritos a su nombre SIN liquidar (vencimiento,
//     código inicial y final, total y expediente de emisión);
//   · un PDF firmado que dice si ha liquidado algo contra el año y qué solicitudes
//     de emisión a su favor siguen sin resolver (E_CAE_… + REGAGE…).
// Se guarda en `app_settings` como `registro_cae_so:{id}` (el patrón de la
// obligación, sin migración) TAL CUAL lo dice el MITECO; el cruce con nuestros
// lotes lo hace `cruzarRegistro` de lotes/logic/obligacionSo.js, en cada vista.
//
// El modelo no interviene: el Excel se lee por sus columnas y el PDF por su texto.
// Ver docs/conocimiento/lotes/la-vista-del-sujeto-obligado.md.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const ExcelJS = require('exceljs');
const supabase = require('./supabaseClient');

let _logica = null;
const logica = () => (_logica ||= import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/obligacionSo.js')).href));
const error = (msg, status = 400) => Object.assign(new Error(msg), { status });
const settingsKey = (soId) => `registro_cae_so:${soId}`;

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const iso = (d, m, a) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const fechaLarga = (txt) => {
    const m = String(txt || '').match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
    return m && MESES[m[2].toLowerCase()] ? iso(m[1], MESES[m[2].toLowerCase()], m[3]) : null;
};
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const valorCelda = (v) => (v && typeof v === 'object' && !(v instanceof Date) ? (v.result ?? v.text ?? v.richText?.map(r => r.text).join('') ?? null) : v);

/**
 * Los tramos del Excel. Se localiza la fila de cabecera por sus títulos (no por su
 * posición) y se para en la primera fila vacía; lo de las columnas de la derecha
 * («DATOS CORRESPONDIENTES A», «TOTAL INVENTARIO») se lee aparte, para cotejar.
 */
async function leerExcel(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw error('El Excel no tiene ninguna hoja');
    let cab = null;
    const col = {};
    ws.eachRow((row, n) => {
        if (cab) return;
        const vals = row.values.map(v => sinTildes(valorCelda(v)));
        const i = (re) => vals.findIndex(v => re.test(v));
        if (i(/FECHA VENCIMIENTO/) > 0 && i(/TOTAL CAE/) > 0) {
            cab = n;
            col.vence = i(/FECHA VENCIMIENTO/); col.inicial = i(/CAE INICIAL/); col.final = i(/CAE FINAL/);
            col.total = i(/TOTAL CAE/); col.exp = i(/EXPEDIENTE/);
        }
    });
    if (!cab) throw error('No encuentro en el Excel la cabecera «FECHA VENCIMIENTO … TOTAL CAE»: ¿es el de los tramos del MITECO?');

    const tramos = [];
    let titular = null, totalDeclarado = null;
    for (let n = cab + 1; n <= ws.rowCount; n++) {
        const row = ws.getRow(n);
        const v = (c) => valorCelda(row.getCell(c).value);
        // Lo de la derecha: el titular y el TOTAL INVENTARIO.
        row.eachCell((cell, c) => {
            if (c <= Math.max(col.vence, col.inicial, col.final, col.total, col.exp)) return;
            const t = sinTildes(valorCelda(cell.value));
            if (t === 'TOTAL INVENTARIO') {
                for (let k = c + 1; k <= c + 3; k++) { const x = Number(valorCelda(row.getCell(k).value)); if (x > 0) { totalDeclarado = x; break; } }
            } else if (t && t !== 'DATOS CORRESPONDIENTES A:' && !titular && /S\.?A\.?|S\.?L\.?|,/.test(t)) titular = t;
        });
        const total = Number(v(col.total));
        const ve = v(col.vence);
        if (!(total > 0) || !ve) continue;
        const vence = ve instanceof Date ? ve.toISOString().slice(0, 10) : String(ve);
        tramos.push({
            vence, inicial: String(v(col.inicial) || '').trim(), final: String(v(col.final) || '').trim(),
            total: Math.round(total), expediente: String(v(col.exp) || '').trim().toUpperCase(),
        });
    }
    if (!tramos.length) throw error('El Excel no trae ningún tramo de CAE');
    return { tramos, titular, totalDeclarado };
}

/** Lo que dice el PDF: fechas, NIF, liquidado y solicitudes pendientes. Solo texto, sin IA. */
async function textoPdf(buffer) {
    const mupdf = await import('mupdf');
    const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
    let t = '';
    try {
        for (let i = 0; i < doc.countPages(); i++) {
            const p = doc.loadPage(i);
            const st = p.toStructuredText();
            t += st.asText() + '\n';
            st.destroy(); p.destroy();
        }
    } finally { doc.destroy(); }
    return t;
}

function leerTextoCertificado(t) {
    const plano = t.replace(/\s+/g, ' ');
    const pendientes = [];
    for (const m of plano.matchAll(/(E_CAE_\d{4}_\d{3,6})\s+(REGAGE\w{10,})/gi)) {
        // El REGAGE se guarda como lo escribe la Administración («REGAGE26e…»); se compara sin mayúsculas.
        pendientes.push({ expediente: m[1].toUpperCase(), registro: m[2] });
    }
    const firma = plano.match(/FECHA\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/);
    const nif = plano.match(/NIF\s*:?\s*([A-Z]\d{8}|\d{8}[A-Z])/i);
    const liqAnio = plano.match(/liquidado\s+ning[uú]n\s+CAE\s+contra\s+la\s+obligaci[oó]n\s+de\s+ahorro\s+de\s+(\d{4})/i);
    return {
        fecha_certificado: firma ? iso(firma[1], firma[2], firma[3]) : null,
        // «a la vista del escrito presentado … el 3 de noviembre de 2026»: la foto es de esa fecha.
        fecha_datos: fechaLarga(plano.match(/escrito presentado[^.]*?el\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)?.[1]),
        fecha_pendientes: fechaLarga(plano.match(/a fecha\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4}),\s*constan/i)?.[1]),
        registro_solicitud: plano.match(/n[uú]mero de registro\s+(REGAGE\w+)/i)?.[1] || null,
        csv: plano.match(/CSV\s*:\s*(GEN-[\w-]+)/i)?.[1] || null,
        firmante: plano.match(/FIRMANTE\(1\)\s*:\s*([^|]+?)\s*\|/i)?.[1]?.trim() || null,
        nif: nif ? nif[1].toUpperCase() : null,
        // Solo se afirma lo que dice: «no consta que se haya liquidado ningún CAE contra 2026» → 0.
        liquidado: liqAnio ? { anio: Number(liqAnio[1]), kwh: 0 } : null,
        pendientes,
    };
}

/**
 * Lee el Excel (obligatorio) y el PDF (opcional) y devuelve lo que se guardaría,
 * con sus AVISOS. Un PDF de OTRO NIF no se acepta: sería guardar la cuenta de otra
 * empresa en la vista de esta.
 */
async function leerCertificado({ excel, pdf = null, so }) {
    if (!excel) throw error('Falta el Excel de los tramos');
    const x = await leerExcel(excel);
    const avisos = [];
    const suma = x.tramos.reduce((s, t) => s + t.total, 0);
    if (x.totalDeclarado != null && x.totalDeclarado !== suma) {
        avisos.push(`El Excel dice TOTAL INVENTARIO ${x.totalDeclarado.toLocaleString('es-ES')} y sus tramos suman ${suma.toLocaleString('es-ES')}.`);
    }
    // El titular del Excel frente a la razón social: con que compartan una palabra
    // significativa basta («INTERNACIONAL DE ALCOHOLES, S.A.»); si no, se avisa.
    const palabras = (s) => new Set(sinTildes(s).replace(/[^A-Z ]/g, ' ').split(' ').filter(w => w.length > 3));
    if (x.titular && so?.razon_social) {
        const a = palabras(x.titular), b = palabras(so.razon_social);
        if (![...a].some(w => b.has(w))) avisos.push(`El Excel es de «${x.titular}» y el S.O. es «${so.razon_social}».`);
    }
    let p = null;
    if (pdf) {
        p = leerTextoCertificado(await textoPdf(pdf));
        const cif = String(so?.cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (p.nif && cif && p.nif !== cif) throw error(`El certificado es del NIF ${p.nif} y ${so.acronimo || so.razon_social} es ${cif}.`);
        if (!p.pendientes.length) avisos.push('El certificado no trae solicitudes pendientes de resolución (o no se han podido leer).');
        if (!p.liquidado) avisos.push('El certificado no dice qué ha liquidado contra el año: no se afirma nada.');
    } else {
        avisos.push('Sin el PDF del certificado: no se sabe qué está pendiente de resolver ni qué ha liquidado.');
    }
    const registro = {
        fecha_certificado: p?.fecha_certificado || null,
        fecha_datos: p?.fecha_datos || null,
        fecha_pendientes: p?.fecha_pendientes || null,
        registro_solicitud: p?.registro_solicitud || null,
        csv: p?.csv || null,
        firmante: p?.firmante || null,
        liquidado: p?.liquidado || null,
        pendientes: p?.pendientes || [],
        tramos: x.tramos,
    };
    return { registro, avisos, titular: x.titular, totalDeclarado: x.totalDeclarado, suma };
}

async function getRegistro(soId) {
    const { normalizarRegistro } = await logica();
    const { data, error: e } = await supabase.from('app_settings').select('value').eq('key', settingsKey(soId)).maybeSingle();
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
    if (!data?.value) return null;
    try { return normalizarRegistro(JSON.parse(data.value)); } catch { return null; }
}

/** Se REEMPLAZA entero: cada certificado es la foto completa de su cuenta a esa fecha. */
async function saveRegistro(soId, registro, { quien = null, ficheros = null } = {}) {
    const { normalizarRegistro } = await logica();
    const limpio = normalizarRegistro({ ...registro, ficheros, actualizado_at: new Date().toISOString(), actualizado_por: quien });
    if (!limpio) throw error('El certificado no trae ningún tramo válido');
    const { error: e } = await supabase.from('app_settings').upsert(
        { key: settingsKey(soId), value: JSON.stringify(limpio), updated_at: new Date().toISOString() },
        { onConflict: 'key' });
    if (e) throw error(`No se pudo guardar: ${e.message}`, 503);
    return limpio;
}

module.exports = { leerCertificado, leerExcel, leerTextoCertificado, textoPdf, getRegistro, saveRegistro, settingsKey };
