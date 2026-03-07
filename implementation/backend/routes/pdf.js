const express = require('express');
const router = express.Router();

// Localización de Chrome en Windows para desarrollo local
const LOCAL_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function getBrowser() {
    // Importamos dinámicamente para evitar problemas de ESM/CJS en Node 25
    const { default: puppeteer } = await import('puppeteer-core');

    // Si estamos en Vercel, usamos el paquete @sparticuz/chromium
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        const { default: chromium } = await import('@sparticuz/chromium');

        // Configuración específica para Vercel
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

    // SI ESTÁS LEYENDO ESTO: NO TOCAR BAJO NINGÚN CONCEPTO EL CÓDIGO DE ABAJO. 
    // ES EL QUE FUNCIONA EN LOCALHOST SEGÚN EL USUARIO.
    return await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
        executablePath: LOCAL_CHROME_PATH,
        headless: "new",
    });
}

/**
 * POST /api/pdf/generate
 * Body: { html: string }
 * Returns: application/pdf
 */
router.post('/generate', async (req, res) => {
    const { html } = req.body;

    if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'Se requiere el campo "html" con el contenido HTML.' });
    }

    let browser = null;
    let page = null;
    try {
        browser = await getBrowser();
        page = await browser.newPage();

        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

        // setContent con timeout; usamos domcontentloaded para no bloquear
        // en recursos externos como Google Fonts (que pueden timeout en Lambda)
        await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Esperar a que las fuentes estén listas (si se cargaron)
        try {
            await Promise.race([
                page.evaluateHandle('document.fonts.ready'),
                new Promise(r => setTimeout(r, 3000))
            ]);
        } catch (_) { /* continuar si falla */ }

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            preferCSSPageSize: false,
            scale: 1,
        });

        // Enviar como base64 JSON para evitar problemas de serialización
        // binaria en Vercel serverless (Buffer → JSON.stringify issue)
        const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
        res.json({ pdf: pdfBase64 });
    } catch (error) {
        console.error('Error generando PDF:', error);
        res.status(500).json({
            error: 'Error interno al generar el PDF.',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (page) { try { await page.close(); } catch (_) { } }
        if (browser) { try { await browser.close(); } catch (_) { } }
    }
});

module.exports = router;
