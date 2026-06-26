const path = require('path');

// Localización de Chrome en Windows para desarrollo local
const LOCAL_CHROME_PATH = 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';

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

module.exports = {
    getBrowser,
    imageToPdf,
    htmlToPdf
};
