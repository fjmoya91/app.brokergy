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

    for (const buf of annexBuffers) {
        if (!buf || buf.length === 0) continue;
        const type = detectBufferType(buf);
        try {
            if (type === 'jpg' || type === 'png') {
                const img = type === 'jpg' ? await merged.embedJpg(buf) : await merged.embedPng(buf);
                addScaledA4Page(img, (page, opts) => page.drawImage(img, opts));
                console.log(`[mergePdfs] Anexo imagen (${type}): 1 pág embebida`);
            } else {
                const annexDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
                const indices = annexDoc.getPageIndices();
                const embedded = await merged.embedPdf(annexDoc, indices);
                console.log(`[mergePdfs] Anexo PDF: ${indices.length} pág → ${embedded.length} embebidas`);
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

async function fetchAnnexBuffers(annexDriveFileIds) {
    if (!Array.isArray(annexDriveFileIds) || annexDriveFileIds.length === 0) return [];
    const { getFileContent } = require('./driveService');
    const buffers = await Promise.all(
        annexDriveFileIds.map(id => getFileContent(id).catch(err => {
            console.warn(`[fetchAnnexBuffers] Falló ${id}:`, err.message);
            return null;
        }))
    );
    return buffers.filter(b => b && b.length > 0);
}

module.exports = {
    getBrowser,
    imageToPdf,
    htmlToPdf,
    detectBufferType,
    mergePdfs,
    fetchAnnexBuffers,
};
