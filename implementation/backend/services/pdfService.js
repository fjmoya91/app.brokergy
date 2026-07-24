const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Localización de Chrome en Windows para desarrollo local
const LOCAL_CHROME_PATH = 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';

// Tamaño A4 en puntos PDF (1 pt = 1/72 pulgada).
const A4_WIDTH_PT = 595.276;
const A4_HEIGHT_PT = 841.890;

async function getBrowser() {
    // Importamos dinámicamente para evitar problemas de ESM/CJS en Node 25
    const { default: puppeteer } = await import('puppeteer-core');

    // Si estamos en Vercel, usamos el paquete @sparticuz/chromium
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        const { default: chromium } = await import('@sparticuz/chromium');

        return await puppeteer.launch({
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
            defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
    }

    return await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
        executablePath: LOCAL_CHROME_PATH,
        headless: "new",
    });
}

/**
 * Convierte una imagen (base64) a un Buffer de PDF usando Puppeteer
 */
async function imageToPdf(base64Image, mimeType) {
    let browser = null;
    let page = null;
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        
        const html = `
            <html>
            <body style="margin:0; padding:0; display:flex; justify-content:center; align-items:center; background-color:white;">
                <img src="data:${mimeType};base64,${base64Image}" style="max-width:100%; max-height:100%; object-fit:contain; page-break-inside:avoid;">
            </body>
            </html>
        `;
        
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });
        
        return Buffer.from(pdfBuffer);
    } catch (err) {
        console.error('[pdfService] Error converting image to PDF:', err);
        throw err;
    } finally {
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
    }
}

/**
 * Renderiza un HTML a un Buffer de PDF A4 (mismo motor que POST /api/pdf/generate).
 * Pensado para reutilizar la generación de PDF desde otras rutas (p. ej. la
 * factura del lote) sin duplicar la lógica de Puppeteer.
 */
async function htmlToPdf(html) {
    if (!html || typeof html !== 'string') throw new Error('htmlToPdf: se requiere html');
    let browser = null;
    let page = null;
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 1000));
        try { await page.evaluate(() => document.fonts.ready); } catch (_) { }
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });
        return Buffer.from(pdfBuffer);
    } finally {
        if (page) { try { await page.close(); } catch (_) { } }
        if (browser) { try { await browser.close(); } catch (_) { } }
    }
}

// ── Concatenación de anexos (movido desde routes/pdf.js para reutilizarlo también
// desde cifoService). Detecta tipo por magic bytes y embebe cada página/imagen en
// una A4 escalada y centrada, para que todo el PDF final tenga el mismo tamaño.
function detectBufferType(buf) {
    if (!buf || buf.length < 4) return null;
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';   // %PDF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';                        // JPEG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';    // PNG
    return null;
}

async function mergePdfs(mainBuffer, annexBuffers) {
    if (!annexBuffers || annexBuffers.length === 0) return mainBuffer;
    const merged = await PDFDocument.load(mainBuffer);

    const addScaledA4Page = ({ width: w, height: h }, draw) => {
        const page = merged.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
        const scale = Math.min(A4_WIDTH_PT / w, A4_HEIGHT_PT / h);
        const drawW = w * scale;
        const drawH = h * scale;
        const x = (A4_WIDTH_PT - drawW) / 2;
        const y = (A4_HEIGHT_PT - drawH) / 2;
        draw(page, { x, y, width: drawW, height: drawH });
    };

    for (const item of annexBuffers) {
        // Cada anexo puede venir como Buffer pelado (llamadas antiguas) o como
        // { buffer, excludedPages } cuando el usuario ha recortado páginas en el
        // gestor de anexos (documentacion.cifo_annex_prefs.excluded).
        const buf = Buffer.isBuffer(item) ? item : item?.buffer;
        const excluded = new Set((Buffer.isBuffer(item) ? [] : (item?.excludedPages || []))
            .map(p => parseInt(p, 10))
            .filter(n => Number.isFinite(n) && n >= 1));
        if (!buf || buf.length === 0) continue;
        const type = detectBufferType(buf);
        try {
            if (type === 'jpg' || type === 'png') {
                if (excluded.has(1)) {
                    console.log('[mergePdfs] Anexo imagen omitido por recorte de páginas');
                    continue;
                }
                const img = type === 'jpg' ? await merged.embedJpg(buf) : await merged.embedPng(buf);
                addScaledA4Page(img, (page, opts) => page.drawImage(img, opts));
                console.log(`[mergePdfs] Anexo imagen (${type}): 1 pág embebida`);
            } else {
                const annexDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
                // getPageIndices() es 0-based; las páginas excluidas se guardan
                // 1-based (tal y como se ven y se escriben en el modal).
                const all = annexDoc.getPageIndices();
                const indices = all.filter(i => !excluded.has(i + 1));
                if (indices.length === 0) {
                    console.log(`[mergePdfs] Anexo PDF omitido: sus ${all.length} pág están excluidas`);
                    continue;
                }
                const embedded = await merged.embedPdf(annexDoc, indices);
                console.log(`[mergePdfs] Anexo PDF: ${all.length} pág, ${all.length - indices.length} excluidas → ${embedded.length} embebidas`);
                for (const ep of embedded) {
                    addScaledA4Page(ep, (page, opts) => page.drawPage(ep, opts));
                }
            }
        } catch (e) {
            console.warn('[mergePdfs] Skip anexo no parseable:', e.message);
        }
    }
    return Buffer.from(await merged.save());
}

// Acepta ['driveId', …] (formato antiguo) o [{ driveId, excludedPages }, …].
// Devuelve [{ buffer, excludedPages }] en el MISMO orden recibido, que es el
// orden en el que se concatenan al PDF principal.
async function fetchAnnexBuffers(annexes) {
    if (!Array.isArray(annexes) || annexes.length === 0) return [];
    const specs = annexes
        .map(a => (typeof a === 'string' ? { driveId: a, excludedPages: [] } : a))
        .filter(a => a && a.driveId);
    if (specs.length === 0) return [];
    const { getFileContent } = require('./driveService');
    const results = await Promise.all(
        specs.map(spec => getFileContent(spec.driveId)
            .then(buffer => ({ buffer, excludedPages: spec.excludedPages || [] }))
            .catch(err => {
                console.warn(`[fetchAnnexBuffers] Falló ${spec.driveId}:`, err.message);
                return null;
            }))
    );
    return results.filter(r => r && r.buffer && r.buffer.length > 0);
}

module.exports = {
    getBrowser,
    imageToPdf,
    htmlToPdf,
    detectBufferType,
    mergePdfs,
    fetchAnnexBuffers,
};
