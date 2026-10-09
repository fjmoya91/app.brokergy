// ============================================================================
// test_eta_wh_anexo_iv.mjs — el η_wh que imprime el certificado junto a un
// SCOP_dhw de CONJUNTO (Anexo IV) es el del EPREL, no la división del SCOP.
//
//   node implementation/backend/scripts/test_eta_wh_anexo_iv.mjs
//
// Caso real: 26RES060_144 (Daikin EBVX16S18DJ6V, EPREL η_wh cálido 139 %) salía
// con «η_wh 139,2 % obtenida de la Ficha EPREL» porque 3,48 / 2,5 = 139,2.
// Puro, sin BD.
// ============================================================================
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const front = (rel) => pathToFileURL(path.join(__dirname, '../../frontend/src', rel)).href;
const { etaWhAnexoIv } = await import(front('features/expedientes/logic/cifoDoc.js'));

let fallos = 0;
const ok = (cond, msg, got) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${msg}${cond ? '' : `  (sale: ${JSON.stringify(got)})`}`);
    if (!cond) fallos++;
};

console.log('\nη entero del EPREL que redondea al SCOP guardado');
let r = etaWhAnexoIv(3.48);
ok(r.etaStr === '139' && r.calculo === '2,5 · 139% = 3,475', '3,48 → 139 % (2,5 · 139 % = 3,475)', r);
r = etaWhAnexoIv(3.10);
ok(r.etaStr === '124' && r.calculo === '2,5 · 124%', '3,10 → 124 %, sin producto: es exacto', r);
r = etaWhAnexoIv(2.73);
ok(r.etaStr === '109' && r.calculo === '2,5 · 109% = 2,725', '2,73 → 109 % (2,725 redondea arriba)', r);
r = etaWhAnexoIv(3.2);
ok(r.etaStr === '128' && r.calculo === '2,5 · 128%', '3,20 → 128 %', r);
r = etaWhAnexoIv('3,48');
ok(r.etaStr === '139', 'acepta el SCOP con coma', r);

console.log('\nSin η entero que case, la división de siempre (no se inventa un η)');
r = etaWhAnexoIv(3.47);
ok(r.etaStr === '138,8' && r.calculo === '2,5 · 138,8%', '3,47 → 138,8 % (139 % daría 3,48)', r);
r = etaWhAnexoIv(3.77);
ok(r.etaStr === '150,8', '3,77 → 150,8 % (151 % daría 3,775 → 3,78)', r);
r = etaWhAnexoIv(null);
ok(r.etaStr === '—', 'sin SCOP no pinta un número', r);
r = etaWhAnexoIv(0);
ok(r.etaStr === '—', 'con SCOP 0 tampoco', r);

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
