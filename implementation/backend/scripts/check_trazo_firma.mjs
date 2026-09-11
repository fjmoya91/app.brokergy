/**
 * ¿Con qué GROSOR llega al documento la firma que traza el cliente a mano?
 *
 *   node implementation/backend/scripts/check_trazo_firma.mjs
 *
 * El grosor no es una preferencia: la firma acaba en la misma página que la de
 * Brokergy, impresa en la columna del Cesionario del Convenio, y dos trazos
 * distintos en el mismo papel es lo que se ve antes que nada. Esa referencia
 * mide **2,25 pt** (medido sobre `firma_brokergy.png`), y el objetivo es
 * `TRAZO_PT` = 2,0.
 *
 * Lo que se comprueba, y por qué hace falta un script:
 *
 *  1. El grosor final NO depende solo de la punta. La firma se estampa al ancho
 *     de su recuadro, así que quien firma compacto se lleva un trazo mucho más
 *     gordo: medido antes de normalizar, de 2,44 pt firmando grande a 5,92
 *     firmando pequeño — 2,4 veces, con la misma punta.
 *  2. `radioParaTrazo` corrige eso con dos constantes MEDIDAS (`TRAZO_A` y
 *     `TRAZO_B`) sobre la física de la tinta de `ink.js`. `ink.js` es un port
 *     literal de ScannerApp y se re-porta entero cuando allí se corrige algo
 *     (regla 34), así que esas dos constantes pueden quedarse atrás sin que nada
 *     falle de forma visible: la firma simplemente saldría de otro grosor.
 *
 * Se mide sobre el MISMO código que corre en el navegador —`ink.js` y
 * `trazoFirma.js`, que no tienen dependencias— servido por un servidor mínimo,
 * porque la tinta se pinta en un canvas y eso pide un navegador de verdad.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FIRMA = path.join(AQUI, '..', '..', 'frontend', 'src', 'features', 'firma');

/** Referencia: el trazo de la firma de Brokergy ya estampada, en puntos. */
const REFERENCIA_PT = 2.25;
/** Cuánto puede desviarse del objetivo antes de considerarlo descalibrado. */
const TOLERANCIA = 0.15;   // ±15 %

/** Los recuadros donde acaba una firma manuscrita, en puntos PDF. */
const CAJAS = {
    'Convenio de Cesión': { page: 2, llx: 27, lly: 52, urx: 285, ury: 175 },
    'Anexo I (clásico)': { page: 3, llx: 57.10, lly: 80.20, urx: 284.57, ury: 155.74 },
};

const PAGINA = `<!doctype html><meta charset="utf-8"><body><script type="module">
import { InkBrush, INSTRUMENTS, applyPaperGrain, extractInk } from '/ink.js';
import { radioParaTrazo, escalaEstampado, TRAZO_PT } from '/trazoFirma.js';
const PLUMA = INSTRUMENTS.find(i => i.key === 'pluma');

/* Grosor medio del trazo: 4 x la media de la distancia al borde. */
function grosorPx(img) {
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const a = ctx.getImageData(0, 0, w, h).data;
    const tinta = new Uint8Array(w * h);
    let n = 0;
    for (let i = 0; i < w * h; i++) if (a[i * 4 + 3] >= 89) { tinta[i] = 1; n++; }
    if (!n) return 0;
    const d = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) d[i] = tinta[i] ? 1e9 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (!tinta[i]) continue;
        let m = d[i];
        if (y > 0) { m = Math.min(m, d[i-w] + 2); if (x > 0) m = Math.min(m, d[i-w-1] + 3); if (x < w-1) m = Math.min(m, d[i-w+1] + 3); }
        if (x > 0) m = Math.min(m, d[i-1] + 2);
        d[i] = m;
    }
    for (let y = h-1; y >= 0; y--) for (let x = w-1; x >= 0; x--) {
        const i = y * w + x; if (!tinta[i]) continue;
        let m = d[i];
        if (y < h-1) { m = Math.min(m, d[i+w] + 2); if (x > 0) m = Math.min(m, d[i+w-1] + 3); if (x < w-1) m = Math.min(m, d[i+w+1] + 3); }
        if (x < w-1) m = Math.min(m, d[i+1] + 2);
        d[i] = m;
    }
    let s = 0;
    for (let i = 0; i < w * h; i++) if (tinta[i]) s += d[i] / 2;
    return 4 * (s / n);
}

const cargar = (url) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });

/* Una rubrica que ocupa una fraccion del ancho de la hoja. */
function firmar(ctx, { W, H, scale, radio, ocupa }) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'darken';
    const cx = W/2, cy = H/2, R = (W*ocupa)/2, A = [], B = [];
    for (let i = 0; i <= 160; i++) { const t = i/160; A.push({ x: cx-R+t*2*R, y: cy-Math.sin(t*Math.PI*2.6)*R*0.34-t*R*0.1, pressure: null, t: i*7 }); }
    for (let i = 0; i <= 60; i++) { const t = i/60; B.push({ x: cx-R*0.8+t*1.7*R, y: cy+R*0.3+Math.sin(t*Math.PI)*R*0.08, pressure: null, t: 1200+i*7 }); }
    for (const pts of [A, B]) {
        const b = new InkBrush(ctx, { instrument: PLUMA, radius: radio, seed: 12345, scale, grain: false });
        pts.forEach((p, i) => (i ? b.move(p) : b.down(p)));
        b.up();
    }
    applyPaperGrain(ctx, PLUMA);
}

window.medir = async (CAJAS, FACTOR_PUNTA) => {
    const out = [];
    const W = 1280, H = 720, scale = 2;
    for (const [nombre, caja] of Object.entries(CAJAS)) {
        for (const ocupa of [0.75, 0.5, 0.3]) {
            const c = document.createElement('canvas');
            c.width = W*scale; c.height = H*scale;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            const pad = Math.round(scale*8);
            firmar(ctx, { W, H, scale, radio: Math.min(9, Math.max(0.8, W*FACTOR_PUNTA)), ocupa });
            let ink = extractInk(c, PLUMA, pad);
            const sinNormalizar = grosorPx(await cargar(ink.dataUrl)) * escalaEstampado(ink, caja);
            for (let i = 0; i < 2; i++) {           // lo que hace accept
                firmar(ctx, { W, H, scale, radio: radioParaTrazo(ink, caja, scale), ocupa });
                ink = extractInk(c, PLUMA, pad);
            }
            const pt = grosorPx(await cargar(ink.dataUrl)) * escalaEstampado(ink, caja);
            out.push({ nombre, ocupa, sinNormalizar, pt, objetivo: TRAZO_PT });
        }
    }
    return out;
};
</script></body>`;

const TIPOS = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8' };

function servir() {
    return new Promise((resolve) => {
        const s = http.createServer((req, res) => {
            const ruta = (req.url || '/').split('?')[0];
            if (ruta === '/' || ruta === '/index.html') {
                res.writeHead(200, { 'Content-Type': TIPOS['.html'] }).end(PAGINA);
                return;
            }
            // Solo los dos módulos de firma, y por nombre: esto sirve ficheros.
            const nombre = path.basename(ruta);
            if (!['ink.js', 'trazoFirma.js'].includes(nombre)) {
                res.writeHead(404).end('no');
                return;
            }
            res.writeHead(200, { 'Content-Type': TIPOS['.js'] })
                .end(fs.readFileSync(path.join(FIRMA, nombre)));
        });
        s.listen(0, '127.0.0.1', () => resolve({ s, puerto: s.address().port }));
    });
}

/** El Chrome del sistema: el mismo que ya usa `check_cifo_paginas.mjs`. */
function chrome() {
    const candidatos = [
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
    ].filter(Boolean);
    return candidatos.find(p => { try { return fs.existsSync(p); } catch { return false; } });
}

const FACTOR_PUNTA = (() => {
    // Se lee del propio componente, para que el script no tenga su propia copia.
    const src = fs.readFileSync(path.join(FIRMA, 'SignaturePad.jsx'), 'utf8');
    const m = src.match(/const FACTOR_PUNTA\s*=\s*([0-9.]+)/);
    return m ? Number(m[1]) : null;
})();

const exe = chrome();
if (!exe) {
    console.error('No se ha encontrado Chrome. Pon su ruta en CHROME_PATH.');
    process.exit(2);
}
if (!FACTOR_PUNTA) {
    console.error('No se ha podido leer FACTOR_PUNTA de SignaturePad.jsx.');
    process.exit(2);
}

const { s, puerto } = await servir();
const navegador = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] });
try {
    const pagina = await navegador.newPage();
    await pagina.goto(`http://127.0.0.1:${puerto}/`, { waitUntil: 'networkidle0' });
    await pagina.waitForFunction('typeof window.medir === "function"');
    const filas = await pagina.evaluate((c, f) => window.medir(c, f), CAJAS, FACTOR_PUNTA);

    console.log(`\nGrosor del trazo de la firma manuscrita, en puntos PDF`);
    console.log(`objetivo ${filas[0].objetivo} pt · referencia (firma de Brokergy) ${REFERENCIA_PT} pt · punta ${FACTOR_PUNTA}\n`);
    console.log('documento              firma      sin normalizar   RESULTADO   desvío');
    let mal = 0;
    for (const f of filas) {
        const desvio = f.pt / f.objetivo - 1;
        const ok = Math.abs(desvio) <= TOLERANCIA;
        if (!ok) mal++;
        const tam = { 0.75: 'grande ', 0.5: 'media  ', 0.3: 'compacta' }[f.ocupa];
        console.log(`${f.nombre.padEnd(22)} ${tam}   ${f.sinNormalizar.toFixed(2).padStart(9)} pt   ${f.pt.toFixed(2).padStart(6)} pt   ${(desvio * 100).toFixed(1).padStart(6)}%  ${ok ? 'ok' : '  ← DESCALIBRADO'}`);
    }
    if (mal) {
        console.error(`\n❌ ${mal} de ${filas.length} fuera del ±${TOLERANCIA * 100} %.`);
        console.error('   Vuelve a medir TRAZO_A y TRAZO_B en trazoFirma.js: la tinta de ink.js ha cambiado.');
        process.exitCode = 1;
    } else {
        console.log(`\n✅ Las ${filas.length} dentro del ±${TOLERANCIA * 100} %: el trazo mide lo mismo firme quien firme.`);
    }
} finally {
    await navegador.close();
    s.close();
}
