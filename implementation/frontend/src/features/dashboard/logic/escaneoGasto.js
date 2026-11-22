// ─── escaneoGasto.js ─────────────────────────────────────────────────────────
// El «escáner» del alta rápida de gastos (botón «Gasto» del cuadro de mando):
// la foto del móvil → una página de PDF que parece escaneada.
//
//   1. prepararFoto: la foto se reduce (lado mayor 2000 px, con la orientación
//      EXIF) y se manda así, en color, a leer: el servidor devuelve lo leído y
//      el recuadro del PAPEL en la foto (`cajas`).
//   2. escanearPagina: se recorta al papel, se quita la sombra (se divide por
//      el brillo del papel medido a trozos) y se pasa a grises con el texto
//      oscuro. Sin recuadro, la foto entera.
//   3. pdfDePaginas: una página por foto, de 595 pt de ancho (A4) y su alto.
//
// Todo en el navegador: el móvil sube un PDF de ~300 KB por página, no una foto
// de 5 MB. Ante una foto que el navegador no sabe abrir (HEIC en un navegador
// que no lo decodifica) se dice; no se sube a ciegas.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf';

const LADO_MAX = 2000;
const CALIDAD_LECTURA = 0.82;
const CALIDAD_PDF = 0.78;
const ANCHO_PT = 595;

function lienzo(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
}

function cargarImagen(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se puede abrir esta foto. Hazla otra vez o súbela en JPG o PDF.'));
        img.src = src;
    });
}

/** La foto decodificada, con la orientación del EXIF aplicada. */
async function decodificar(file) {
    if (typeof createImageBitmap === 'function') {
        try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* al <img> */ }
    }
    const url = URL.createObjectURL(file);
    try { return await cargarImagen(url); } finally { URL.revokeObjectURL(url); }
}

/** File → base64 (sin el «data:…;base64,»). */
export function base64DeFichero(file) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
        fr.onerror = () => reject(new Error('No se pudo leer el fichero.'));
        fr.readAsDataURL(file);
    });
}

/**
 * Una foto → { lienzo, w, h, lectura } con `lectura` el JPEG (base64) que se
 * manda a leer. El lienzo se guarda para recortarlo cuando llegue su recuadro.
 */
export async function prepararFoto(file) {
    const img = await decodificar(file);
    const w0 = img.width, h0 = img.height;
    if (!w0 || !h0) throw new Error('La foto está vacía.');
    const k = Math.min(1, LADO_MAX / Math.max(w0, h0));
    const c = lienzo(w0 * k, h0 * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    img.close?.();
    return { lienzo: c, w: c.width, h: c.height, lectura: c.toDataURL('image/jpeg', CALIDAD_LECTURA).split(',')[1] };
}

/** Percentil `p` (0-1) de un histograma de 256 cubos con `n` muestras. */
function percentil(hist, n, p) {
    const meta = n * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= meta) return v; }
    return 255;
}

/**
 * El filtro «documento»: L / brillo del papel alrededor, y una curva que deja el
 * papel blanco y el texto negro. El brillo del papel se mide en una rejilla
 * (el percentil 90 de cada celda, suavizado), así se va la sombra de la mano o
 * del móvil sin quemar el texto.
 */
function filtroDocumento(c) {
    const w = c.width, h = c.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const n = w * h;
    const L = new Uint8ClampedArray(n);
    const global = new Uint32Array(256);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
        const v = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
        L[i] = v;
        global[v]++;
    }
    const papelGlobal = Math.max(60, percentil(global, n, 0.9));

    // La rejilla del papel.
    const S = Math.max(16, Math.round(Math.max(w, h) / 40));
    const gx = Math.ceil(w / S), gy = Math.ceil(h / S);
    let rej = new Float32Array(gx * gy);
    const hist = new Uint32Array(256);
    for (let cy = 0; cy < gy; cy++) {
        for (let cx = 0; cx < gx; cx++) {
            hist.fill(0);
            let m = 0;
            const y1 = Math.min(h, (cy + 1) * S), x1 = Math.min(w, (cx + 1) * S);
            for (let y = cy * S; y < y1; y += 2) for (let x = cx * S; x < x1; x += 2) { hist[L[y * w + x]]++; m++; }
            // Una celda casi toda tinta (un logotipo) no es papel: manda el del documento.
            rej[cy * gx + cx] = Math.max(papelGlobal * 0.55, m ? percentil(hist, m, 0.9) : papelGlobal);
        }
    }
    // Suavizado 3×3, dos pasadas: sin escalones entre celdas.
    for (let pasada = 0; pasada < 2; pasada++) {
        const sig = new Float32Array(gx * gy);
        for (let cy = 0; cy < gy; cy++) for (let cx = 0; cx < gx; cx++) {
            let s = 0, k = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const yy = cy + dy, xx = cx + dx;
                if (yy >= 0 && yy < gy && xx >= 0 && xx < gx) { s += rej[yy * gx + xx]; k++; }
            }
            sig[cy * gx + cx] = s / k;
        }
        rej = sig;
    }

    // Cada píxel: su luz entre la del papel de alrededor (interpolada), y la curva.
    const curva = new Uint8ClampedArray(1001);
    for (let i = 0; i <= 1000; i++) {
        const r = i / 1000 * 1.25;                       // 0 … 1,25 veces el papel
        const t = Math.min(1, Math.max(0, (r - 0.22) / 0.68));
        curva[i] = Math.round(255 * Math.pow(t, 1.45));
    }
    for (let y = 0; y < h; y++) {
        const fy = Math.min(gy - 1, Math.max(0, y / S - 0.5));
        const y0 = Math.floor(fy), y1 = Math.min(gy - 1, y0 + 1), ty = fy - y0;
        for (let x = 0; x < w; x++) {
            const fx = Math.min(gx - 1, Math.max(0, x / S - 0.5));
            const x0 = Math.floor(fx), x1 = Math.min(gx - 1, x0 + 1), tx = fx - x0;
            const a = rej[y0 * gx + x0], b = rej[y0 * gx + x1], c2 = rej[y1 * gx + x0], e = rej[y1 * gx + x1];
            const papel = (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + e * tx) * ty;
            const i = y * w + x;
            const v = curva[Math.min(1000, Math.round((L[i] / papel) / 1.25 * 1000))];
            const j = i * 4;
            d[j] = d[j + 1] = d[j + 2] = v;
        }
    }
    ctx.putImageData(img, 0, 0);
}

/**
 * La página escaneada: recortada al papel (`caja` en fracción, con un margen
 * del 0,4 %), girada `giro` grados (0/90/180/270) y con el filtro documento.
 * Devuelve { url (JPEG data URL), w, h }.
 */
export function escanearPagina({ lienzo: origen, w, h }, caja = null, giro = 0) {
    // Margen mínimo: con más, el filo de la mesa sale como un marco negro.
    const m = 0.004;
    const x0 = caja ? Math.max(0, caja.x0 - m) * w : 0;
    const y0 = caja ? Math.max(0, caja.y0 - m) * h : 0;
    const x1 = caja ? Math.min(1, caja.x1 + m) * w : w;
    const y1 = caja ? Math.min(1, caja.y1 + m) * h : h;
    const cw = Math.max(1, Math.round(x1 - x0)), ch = Math.max(1, Math.round(y1 - y0));
    const recorte = lienzo(cw, ch);
    recorte.getContext('2d').drawImage(origen, x0, y0, cw, ch, 0, 0, cw, ch);
    filtroDocumento(recorte);
    let final = recorte;
    const g = ((giro % 360) + 360) % 360;
    if (g) {
        final = g === 180 ? lienzo(cw, ch) : lienzo(ch, cw);
        const ctx = final.getContext('2d');
        ctx.translate(final.width / 2, final.height / 2);
        ctx.rotate((g * Math.PI) / 180);
        ctx.drawImage(recorte, -cw / 2, -ch / 2);
        recorte.width = recorte.height = 0;
    }
    const out = { url: final.toDataURL('image/jpeg', CALIDAD_PDF), w: final.width, h: final.height };
    final.width = final.height = 0;
    return out;
}

/** Las páginas escaneadas → PDF (base64): una por página, 595 pt de ancho. */
export function pdfDePaginas(paginas) {
    let doc = null;
    for (const p of paginas) {
        const alto = Math.round((ANCHO_PT * p.h) / p.w);
        const formato = [ANCHO_PT, alto];
        const orient = alto >= ANCHO_PT ? 'p' : 'l';
        if (!doc) doc = new jsPDF({ unit: 'pt', format: formato, orientation: orient, compress: true });
        else doc.addPage(formato, orient);
        doc.addImage(p.url, 'JPEG', 0, 0, ANCHO_PT, alto, undefined, 'FAST');
    }
    if (!doc) throw new Error('No hay ninguna página.');
    return doc.output('datauristring').split(',')[1];
}
