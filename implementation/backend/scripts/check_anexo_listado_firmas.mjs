/**
 * Las CASILLAS DE FIRMA del «Anexo I · Listado Cesión» del lote son FIJAS
 * (`SIGN_BOXES.anexo_i_listado` para el S.O. y `anexo_i_listado_proveedor` para
 * Brokergy, en signBoxes.js) y el documento no: la tabla crece con cada actuación.
 * Hasta el 12/11/2026 el bloque de firmas iba detrás de la tabla y la casilla,
 * medida con un lote corto, caía ENCIMA de las filas 8 y 9 de un lote de 10
 * (LOTE-2026-018). Desde entonces las firmas van ancladas al pie de la hoja.
 *
 *   node scripts/check_anexo_listado_firmas.mjs [--medir]
 *
 * Genera el PDF con el MISMO motor que la app (`htmlToPdf`), con 1, 5 y 10
 * actuaciones (las filas más altas de un lote real), y comprueba en cada uno que:
 *   · es UNA sola hoja;
 *   · los rótulos «EL PROVEEDOR» y el del S.O. están a la MISMA altura en todos;
 *   · cada casilla cae DEBAJO de su rótulo, centrada con él, dentro de la hoja, y
 *     sin NINGÚN texto dentro.
 * `--medir` imprime las posiciones para re-derivar las casillas y cuántas
 * actuaciones caben en una hoja (RES060 y RES093).
 */
import { createRequire } from 'module';
import { anexoListadoHtml } from '../../frontend/src/features/lotes/logic/anexoListadoHtml.js';
import { SIGN_BOXES } from '../../frontend/src/features/expedientes/logic/signBoxes.js';

const require = createRequire(import.meta.url);
const { htmlToPdf } = require('../services/pdfService');
const mupdf = await import('mupdf');

const MEDIR = process.argv.includes('--medir');
const SO = 'INTERNACIONAL DE ALCOHOLES, S.A.';
// Filas como las de un lote real (LOTE-2026-018, 10 actuaciones RES060): dos de
// cada diez con la dirección y la referencia catastral partidas en TRES líneas
// (las del 106 y el 202) y el resto en dos. Con TODAS las filas así, o con el
// título de cinco líneas de la RES093, caben menos: lo dice `--medir`.
const TITULO = {
    RES060: 'Sustitución de caldera de combustión por una bomba de calor de accionamiento eléctrico.',
    RES093: 'Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática D1, D2 o D3',
};
const fila = (n, ficha = 'RES060', todasLargas = false) => ({
    n, codigo: `26${ficha}_${100 + n}`,
    direccion: (todasLargas || n % 5 === 2) ? 'AV PRINCIPE FELIPE DE BORBON 104 16660 LAS PEDROÑERAS (CUENCA)' : 'CL CONCORDIA 53 13710 ARGAMASILLA DE ALBA (CIUDAD REAL)',
    refCatastral: (todasLargas || n % 5 === 2) ? '5119613WJ0651N0001XS, 5119612WJ0651N0001DS' : '1408019VJ9310N0001TD',
    utm: 'X: 528035, Y: 4365927', fechaInicio: '02/10/2026', fechaFin: '06/10/2026', ficha,
    titulo: TITULO[ficha], inversion: 20263, vidaUtil: 15, ahorroKwh: 126299, precio: 174,
});
// Un lote de 10 tiene que caber: es el tamaño de los lotes de INTERALCO.
const CASOS = [1, 5, 10];
const SO_TOT = { ahorroKwh: 596516, ahorroMwh: 596.516, ahorroGwh: 0.6 };
const htmlDe = (rows) => anexoListadoHtml({ rows, tot: { numActuaciones: rows.length, ...SO_TOT }, soNombre: SO, convenio: '27/02/2026', mes: 'Noviembre', anio: '2026', ccaa: 'Castilla-La Mancha' });

function lineas(pdf) {
    const doc = mupdf.Document.openDocument(pdf, 'application/pdf');
    const n = doc.countPages();
    const page = doc.loadPage(0);
    const [, , , alto] = page.getBounds();
    const out = [];
    const st = JSON.parse(page.toStructuredText('preserve-whitespace').asJSON());
    for (const b of st.blocks || []) for (const l of b.lines || []) {
        const t = (l.text || '').trim();
        if (!t) continue;
        // mupdf da y desde ARRIBA; las casillas de Autofirma, desde ABAJO.
        out.push({ t, x0: l.bbox.x, x1: l.bbox.x + l.bbox.w, y0: alto - (l.bbox.y + l.bbox.h), y1: alto - l.bbox.y });
    }
    return { paginas: n, alto, out };
}

const fallos = [];
const rotulos = {};
for (const nFilas of CASOS) {
    const rows = Array.from({ length: nFilas }, (_, i) => fila(i + 1));
    const { paginas, out } = lineas(await htmlToPdf(htmlDe(rows)));
    const prov = out.find(l => l.t === 'EL PROVEEDOR');
    const so = out.find(l => l.t === SO && l.y1 < 200);
    if (paginas !== 1) fallos.push(`${nFilas} filas: ${paginas} hojas`);
    if (!prov || !so) { fallos.push(`${nFilas} filas: no encuentro los rótulos`); continue; }
    if (MEDIR) console.log(`${nFilas} filas · PROVEEDOR x ${prov.x0.toFixed(1)}–${prov.x1.toFixed(1)} y ${prov.y0.toFixed(1)}–${prov.y1.toFixed(1)} · S.O. x ${so.x0.toFixed(1)}–${so.x1.toFixed(1)} y ${so.y0.toFixed(1)}–${so.y1.toFixed(1)} · lo más bajo de la tabla y ${Math.min(...out.filter(l => l.y1 > prov.y1 + 20).map(l => l.y0)).toFixed(1)}`);
    rotulos[nFilas] = { prov: prov.y0, so: so.y0 };
    for (const [clave, rot] of [['anexo_i_listado_proveedor', prov], ['anexo_i_listado', so]]) {
        const c = SIGN_BOXES[clave];
        const debajo = out.filter(l => l.t !== 'BROKERGY' || clave !== 'anexo_i_listado_proveedor');
        const rotBajo = clave === 'anexo_i_listado_proveedor' ? (out.find(l => l.t === 'BROKERGY')?.y0 ?? rot.y0) : rot.y0;
        if (c.page !== 1) fallos.push(`${clave}: página ${c.page}`);
        if (c.ury > rotBajo - 2) fallos.push(`${nFilas} filas · ${clave}: la casilla (ury ${c.ury}) no queda DEBAJO de su rótulo (y ${rotBajo.toFixed(1)})`);
        if (c.lly < 20) fallos.push(`${clave}: se sale por abajo (lly ${c.lly})`);
        const centroRot = (rot.x0 + rot.x1) / 2, centroCaja = (c.llx + c.urx) / 2;
        if (Math.abs(centroRot - centroCaja) > 15) fallos.push(`${nFilas} filas · ${clave}: descentrada ${(centroCaja - centroRot).toFixed(1)} pt de su rótulo`);
        const pisa = debajo.filter(l => l.x1 > c.llx && l.x0 < c.urx && l.y1 > c.lly && l.y0 < c.ury);
        if (pisa.length) fallos.push(`${nFilas} filas · ${clave}: pisa texto: ${pisa.map(l => l.t).join(' | ').slice(0, 120)}`);
    }
}
const ys = Object.values(rotulos);
if (ys.length && ys.some(r => Math.abs(r.prov - ys[0].prov) > 0.5 || Math.abs(r.so - ys[0].so) > 0.5)) {
    fallos.push(`los rótulos se MUEVEN con el nº de filas: ${JSON.stringify(rotulos)}`);
}

if (MEDIR) {
    for (const [ficha, todas] of [['RES060', false], ['RES060', true], ['RES093', false]]) {
        const cabe = async (n) => lineas(await htmlToPdf(htmlDe(Array.from({ length: n }, (_, i) => fila(i + 1, ficha, todas))))).paginas === 1;
        let n = 10;
        while (await cabe(n + 1)) n++;
        while (n > 1 && !(await cabe(n))) n--;
        console.log(`Caben en UNA hoja: ${n} actuaciones ${ficha}${todas ? ' (TODAS con dirección y RC en 3 líneas)' : ''}`);
    }
}

if (fallos.length) { console.error('✗ Anexo I del lote:\n  ' + fallos.join('\n  ')); process.exit(1); }
console.log(`✓ Anexo I del lote: una hoja y las dos casillas libres bajo su rótulo con ${CASOS.join(', ')} actuaciones`);
process.exit(0);
