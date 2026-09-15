/**
 * Las tipografías de los documentos están COMPLETAS y no se piden a Google.
 *
 * Dos comprobaciones, las dos deterministas y sin navegador:
 *
 *   1. Ningún módulo que componga un documento referencia `fonts.googleapis.com`
 *      ni `fonts.gstatic.com`. El PDF lo rasteriza Puppeteer en el servidor
 *      abriendo y cerrando un Chrome por documento, así que una fuente remota es
 *      una descarga en cada generación y una lotería: el 15/09/2026 una propuesta
 *      salió ENTERA en Courier y así la recibió el cliente (regla 25.b).
 *
 *   2. Cada cara declarada en `fuentesDoc.js` tiene su .woff2 en
 *      `frontend/public/fonts`. Un peso que se añade a una familia y cuyo fichero
 *      nadie descarga no falla en el build ni en pantalla: falla en el PDF, y solo
 *      en los textos que usan ESE peso.
 *
 *   node implementation/backend/scripts/check_fuentes_documentos.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as FUENTES from '../../frontend/src/features/expedientes/logic/fuentesDoc.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dirFuentes = path.join(raiz, 'frontend/public/fonts');
const SUBSETS = ['latin', 'latinext'];

let malos = 0;

// ── 1. Nadie pide fuentes a Google ───────────────────────────────────────────
// Solo cuenta el código: en un comentario la cadena es documentación, no una
// dependencia (este mismo fichero la nombra tres veces).
const sinComentarios = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const remotas = [];
(function barrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') barrer(p); continue; }
        if (!/\.(js|jsx)$/.test(e.name)) continue;
        if (/fonts\.(googleapis|gstatic)\.com/.test(sinComentarios(fs.readFileSync(p, 'utf8')))) {
            remotas.push(path.relative(raiz, p).replace(/\\/g, '/'));
        }
    }
})(path.join(raiz, 'frontend/src'));

if (remotas.length) {
    malos++;
    console.log('  ✗ Piden su tipografía a Google Fonts:');
    for (const f of remotas) console.log(`      ${f}`);
} else {
    console.log('  ✓ Ningún documento pide su tipografía a Google.');
}

// ── 2. Están todos los ficheros que se declaran ──────────────────────────────
const familias = Object.entries(FUENTES).filter(([k, v]) => k.startsWith('FUENTE_') && Array.isArray(v));
const faltan = [];
const vistos = new Set();
for (const [, fams] of familias) {
    for (const [nombre, slug, pesos] of fams) {
        for (const w of pesos) {
            for (const sub of SUBSETS) {
                const f = `${slug}-${w}-${sub}.woff2`;
                if (vistos.has(f)) continue;
                vistos.add(f);
                if (!fs.existsSync(path.join(dirFuentes, f))) faltan.push(`${f}  (${nombre} ${w})`);
            }
        }
    }
}

if (faltan.length) {
    malos++;
    console.log(`  ✗ Faltan ${faltan.length} ficheros en public/fonts:`);
    for (const f of faltan) console.log(`      ${f}`);
} else {
    console.log(`  ✓ Las ${vistos.size} caras declaradas están en public/fonts (${familias.length} documentos).`);
}

console.log(malos ? '\nRevisa lo de arriba.' : '\nLas tipografías de los documentos están en orden.');
process.exit(malos ? 1 : 0);
