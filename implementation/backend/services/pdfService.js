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
        await encajarPortadas(page);
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


/**
 * Los bytes de UN documento, venga como venga. Es el punto por el que pasan las
 * tres formas que ya conviven en la app:
 *
 *   { pdfBase64 }   → el PDF ya está hecho (p.ej. uno que acaba de firmarse).
 *   { formulario }  → un IMPRESO OFICIAL en formato formulario, que se rellena
 *                     (fichas RES060/RES080/RES093/TER100 y Anexo I).
 *   { html }        → la maqueta clásica, rasterizada con Puppeteer.
 *
 * Existe para que las cuatro superficies que generan estos documentos —descargar,
 * guardar en Drive, enviar por email y el envío del lote al Sujeto Obligado— no
 * tengan cada una su propia cascada: si una se quedara sin la rama del formulario,
 * ese camino seguiría mandando la maqueta antigua sin que nadie lo notara.
 */
async function documentoAPdf(doc) {
    const d = doc || {};
    if (d.pdfBase64) return Buffer.from(d.pdfBase64, 'base64');
    if (d.formulario) {
        const { rellenarDesdePeticion } = require('./formularioOficialService');
        return rellenarDesdePeticion(d.formulario);
    }
    return htmlToPdf(d.html);
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

/**
 * Une varios anexos en UN PDF, sin documento principal delante.
 *
 * `mergePdfs` siempre concatena DETRÁS de algo; aquí no hay nada delante —es el
 * caso de la ficha técnica que se entrega SUELTA, además de ir dentro del CIFO—,
 * así que se parte de un documento vacío. No vale usar el primer anexo como base:
 * entonces su propio recorte de páginas no se aplicaría, y el fichero suelto
 * dejaría de coincidir con lo que lleva dentro el certificado.
 *
 * @param {Array<Buffer|{buffer:Buffer, excludedPages?:number[]}>} items
 * @returns {Promise<Buffer|null>} null si no queda ni una página
 */
async function unirAnexos(items) {
    const lista = (items || []).filter(Boolean);
    if (!lista.length) return null;
    // ⚠️ Un documento de CERO páginas guardado con pdf-lib vuelve a cargarse con
    // UNA, en blanco (comprobado: 583 bytes → getPageCount() === 1). Así que la
    // hoja de arranque existe y hay que QUITARLA después de concatenar; si no, el
    // fichero suelto empieza con una página vacía que no está en el certificado.
    const arranque = Buffer.from(await (await PDFDocument.create()).save());
    const unido = await mergePdfs(arranque, lista);
    const doc = await PDFDocument.load(unido, { ignoreEncryption: true });
    if (doc.getPageCount() <= 1) return null;        // ni un anexo legible
    doc.removePage(0);
    return Buffer.from(await doc.save());
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

/**
 * Red de seguridad de la PORTADA de la propuesta, medida con el MISMO motor que
 * la imprime.
 *
 * La hoja 1 es un A4 de alto FIJO con el pie negro (`.prop-cta`) anclado abajo
 * en `position:absolute`: lo que no cabe no empuja nada, se queda DEBAJO del pie
 * y desaparece. El navegador ajusta la portada antes de mandar el HTML (ver el
 * "ajuste de la portada" de ProposalModal), pero lo mide con SU tipografía, y el
 * Chrome del servidor pinta el texto algo más ancho: medido el 24/09/2026 sobre
 * 26RES060_OP230, la hoja sale ~14 px más alta que en la vista previa. Con una
 * fila más en la tabla (la fotovoltaica) eso basta para que el final de la
 * tabla se meta bajo el pie.
 *
 * Aquí se vuelve a medir y, si el contenido pisa el pie, se reduce SOLO el
 * cuerpo de esa hoja con `zoom` lo justo para que quepa. El ancho visual se
 * conserva (un bloque con zoom sigue llenando su contenedor), así que no queda
 * margen a la derecha. Con un tope: por debajo de 0,85 la letra deja de leerse
 * y se deja como está (y se avisa en el log).
 *
 * Solo actúa sobre hojas con `.prop-pb` + `.prop-cta` como hijos directos, o
 * sea las de la propuesta: cualquier otro documento pasa sin tocarse.
 */
async function encajarPortadas(page) {
    try {
        // `page.pdf` imprime con media print; se mide igual.
        await page.emulateMediaType('print');
        const r = await page.evaluate(() => {
            const AIRE = 6;
            const MIN_ZOOM = 0.85;
            const out = [];
            for (const hoja of document.querySelectorAll('.prop-page')) {
                const body = hoja.querySelector(':scope > .prop-pb');
                const cta = hoja.querySelector(':scope > .prop-cta');
                if (!body || !cta) continue;
                const medir = () => {
                    const b = body.getBoundingClientRect();
                    const c = cta.getBoundingClientRect();
                    return { top: b.top, alto: b.height, libre: c.top - AIRE - b.top };
                };
                let m = medir();
                if (m.alto <= m.libre) continue;
                let zoom = 1;
                // Iterativo: al reducir, el texto reparte las líneas de otra forma.
                for (let i = 0; i < 5 && m.alto > m.libre; i++) {
                    zoom = Math.max(MIN_ZOOM, zoom * (m.libre / m.alto) - 0.002);
                    body.style.zoom = String(zoom);
                    m = medir();
                    if (zoom <= MIN_ZOOM) break;
                }
                out.push({ zoom: Math.round(zoom * 1000) / 1000, cabe: m.alto <= m.libre });
            }
            return out;
        });
        if (r.length) console.log('[PDF] Portada reajustada en el servidor:', JSON.stringify(r));
    } catch (e) {
        console.warn('[PDF] No se pudo comprobar el encaje de la portada:', e.message);
    }
}

module.exports = {
    encajarPortadas,
    getBrowser,
    imageToPdf,
    htmlToPdf,
    documentoAPdf,
    detectBufferType,
    mergePdfs,
    unirAnexos,
    fetchAnnexBuffers,
};
