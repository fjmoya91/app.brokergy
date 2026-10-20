// Corrige los `importes` sellados en las versiones de la propuesta de las
// oportunidades con REFORMA (ver utils/importesPropuesta.js): hasta el 19/10/2026
// se sellaba siempre la rama de solo aerotermia, aunque el PDF imprimiera la de
// la reforma, y la inversión salía null.
//
//   node implementation/backend/scripts/reparar_importes_versiones.js              EN SECO (solo lee)
//   node implementation/backend/scripts/reparar_importes_versiones.js --escribir   escribe lo CONFIRMADO
//   ... --op 26RES080_OP76                                                         solo esa oportunidad
//
// La verdad es el PDF ARCHIVADO de cada versión (Drive, `drive_id`), no el
// `result` de hoy, que puede haber cambiado después del envío:
//   1. Qué ofrecía la propuesta se lee del PDF: dos columnas «Bono Energético CAE»
//      es la comparativa; una sola con «Inversión Reforma de Vivienda» es solo
//      reforma; si no, solo aerotermia.
//   2. Las cifras candidatas salen del `result` guardado, con esa rama, y solo se
//      dan por buenas si TODAS aparecen impresas en la página 1 del PDF.
//   3. Si no cuadran y es de una sola opción, se leen de la línea de la portada
//      «CAE X € + IRPF Y € … sobre Z € de inversión».
//   4. Si nada de eso cuadra, NO se toca: se lista para revisarla a mano.
// Al escribir, se guarda lo anterior en `importes_antes` (MERGE por la RPC
// `propuesta_version_merge`, nunca reescribiendo la lista).
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config({ quiet: true });
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { importesDe } = require('../utils/importesPropuesta');

const ESCRIBIR = process.argv.includes('--escribir');
const iOp = process.argv.indexOf('--op');
const SOLO_OP = iOp > 0 ? process.argv[iOp + 1] : null;
const FE = path.join(__dirname, '../../frontend');
const pdfjsP = import(pathToFileURL(path.join(FE, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);

const aNum = (s) => Number(String(s).replace(/\./g, ''));

// La página del resumen: casi siempre la 1, pero hay PDFs con hojas delante
// (26RES080_OP59 empieza en la 3).
async function textoPaginaResumen(buffer) {
    const pdfjs = await pdfjsP;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
    for (let p = 1; p <= Math.min(4, doc.numPages); p++) {
        const tc = await (await doc.getPage(p)).getTextContent();
        const t = tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ');
        if (/Bono Energético CAE \( ?Ingreso Bruto ?\)/.test(t)) return t;
    }
    return '';
}

function ramaDelPdf(texto) {
    const bonos = (texto.match(/Bono Energético CAE \( ?Ingreso Bruto ?\)/g) || []).length;
    if (bonos >= 2) return 'comparativa';
    return /Inversión Reforma de Vivienda/.test(texto) ? 'reforma' : 'aerotermia';
}

function numerosDe(texto) {
    return new Set((texto.match(/\d{1,3}(?:\.\d{3})+|\d+/g) || []).map(aNum));
}

const impreso = (set, n) => n == null || set.has(n) || set.has(n - 1) || set.has(n + 1);

// Con varios propietarios la tabla imprime la deducción de CADA UNO, no el total.
function cuadra(imp, set, propietarios = 1) {
    return [imp, imp.reforma].filter(Boolean).every(x =>
        [x.caeBonus, x.totalAyuda, x.inversion].every(n => impreso(set, n))
        && (!x.irpfDeduction || impreso(set, x.irpfDeduction)
            || (propietarios > 1 && impreso(set, Math.round(x.irpfDeduction / propietarios)))));
}

// Portada de una propuesta de UNA opción: «CAE 6.262 € + IRPF 9.000 €» y, más
// abajo, «sobre 18.427 € de inversión».
function deLaPortada(texto) {
    const m = texto.match(/CAE ([\d.]+) €(?: \+ IRPF ([\d.]+) €)?/);
    if (!m) return null;
    const cae = aNum(m[1]), irpf = m[2] ? aNum(m[2]) : 0;
    const inv = texto.match(/sobre ([\d.]+) € de inversión/);
    return { inversion: inv ? aNum(inv[1]) : null, caeBonus: cae, irpfDeduction: irpf, totalAyuda: cae + irpf };
}

const fmt = (x) => (x ? `${x.caeBonus ?? '—'}/${x.irpfDeduction ?? '—'}/${x.totalAyuda ?? '—'}/${x.inversion ?? '—'}` : '—');
const fmtImp = (imp) => (imp ? fmt(imp) + (imp.reforma ? ` + reforma ${fmt(imp.reforma)}` : '') : '—');

(async () => {
    let q = supabase.from('oportunidades')
        .select('id, id_oportunidad, inputs:datos_calculo->inputs, result:datos_calculo->result, v:datos_calculo->propuesta_versiones')
        .not('datos_calculo->propuesta_versiones', 'is', null)
        .eq('datos_calculo->inputs->>isReforma', 'true');
    if (SOLO_OP) q = q.eq('id_oportunidad', SOLO_OP);
    const { data, error } = await q;
    if (error) throw error;

    console.log(ESCRIBIR ? '*** ESCRIBIENDO lo confirmado ***\n' : 'EN SECO: no se escribe nada (--escribir para escribir)\n');
    console.log('oportunidad | v | fecha | PDF | sellado (CAE/IRPF/total/inversión) | propuesto | de dónde');
    const resumen = { confirmadas: 0, portada: 0, revisar: 0, iguales: 0, escritas: 0 };

    for (const op of data.sort((a, b) => a.id_oportunidad.localeCompare(b.id_oportunidad))) {
        for (const ver of (op.v || []).sort((a, b) => a.v - b.v)) {
            const fila = [op.id_oportunidad, `v${ver.v}`, String(ver.fecha || '').slice(0, 10)];
            if (!ver.drive_id) { console.log([...fila, 'SIN PDF', fmtImp(ver.importes), '—', 'REVISAR: no hay PDF en Drive'].join(' | ')); resumen.revisar++; continue; }
            const buf = await driveService.getFileContent(ver.drive_id);
            if (!buf) { console.log([...fila, 'PDF ilegible', fmtImp(ver.importes), '—', 'REVISAR'].join(' | ')); resumen.revisar++; continue; }
            const texto = await textoPaginaResumen(buf);
            if (!texto) { console.log([...fila, 'sin resumen', fmtImp(ver.importes), '—', 'REVISAR: no encuentro el resumen en el PDF'].join(' | ')); resumen.revisar++; continue; }
            const rama = ramaDelPdf(texto);
            const nums = numerosDe(texto);
            const propietarios = Number(op.result?.financials?.numOwners) || 1;

            const inputs = { isReforma: rama !== 'aerotermia', comparativaReforma: rama === 'comparativa' ? true : false };
            let nuevo = importesDe(op.result, inputs);
            let origen = null;
            if (nuevo.rama === rama && cuadra(nuevo, nums, propietarios)) origen = 'result guardado = PDF';
            else if (rama === 'aerotermia' && ver.importes && !ver.importes.rama
                && cuadra({ ...ver.importes, inversion: null }, nums, propietarios)) {
                // Solo aerotermia es justo lo que se sellaba: las cifras ya eran
                // las del PDF. Se añade la rama y la inversión solo si sale impresa.
                const inv = impreso(nums, nuevo.inversion) ? nuevo.inversion : null;
                nuevo = { ...ver.importes, inversion: inv, rama };
                origen = 'lo sellado ya era el PDF (+ rama)';
            } else if (rama !== 'comparativa') {
                const p = deLaPortada(texto);
                if (p && impreso(nums, p.totalAyuda)) { nuevo = { ...p, rama }; origen = 'portada del PDF'; }
            }
            if (!origen) {
                console.log([...fila, rama, fmtImp(ver.importes), fmtImp(nuevo), 'REVISAR: las cifras no salen en el PDF'].join(' | '));
                resumen.revisar++;
                continue;
            }
            const igual = JSON.stringify(ver.importes) === JSON.stringify(nuevo);
            console.log([...fila, rama, fmtImp(ver.importes), fmtImp(nuevo), igual ? 'ya estaba bien' : origen].join(' | '));
            if (igual) { resumen.iguales++; continue; }
            resumen[origen === 'result guardado = PDF' ? 'confirmadas' : 'portada']++;

            if (ESCRIBIR) {
                const { error: e } = await supabase.rpc('propuesta_version_merge', {
                    p_id: op.id, p_v: ver.v,
                    p_patch: { importes: nuevo, importes_antes: ver.importes || null, importes_corregidos_at: new Date().toISOString() },
                });
                if (e) console.error(`   ✗ ${op.id_oportunidad} v${ver.v}: ${e.message}`);
                else resumen.escritas++;
            }
        }
    }
    console.log('\n', resumen);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
