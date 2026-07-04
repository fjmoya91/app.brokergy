const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');

const { getBrowser } = require('../services/pdfService');

// Tamaño A4 en puntos PDF (1 pt = 1/72 pulgada).
const A4_WIDTH_PT = 595.276;
const A4_HEIGHT_PT = 841.890;

/**
 * Concatena el PDF principal con varios PDFs anexo descargados desde Drive.
 * Cada página del anexo se incrusta en una página A4 nueva, escalándola
 * proporcionalmente y centrándola, para que TODO el PDF final tenga el mismo
 * tamaño de página (evita la diferencia visual entre CIFO A4 y fichas
 * técnicas con tamaños custom).
 * Si un anexo no se puede parsear (encriptado, corrupto), se ignora con warning.
 */
// Detecta el tipo de un buffer por sus "magic bytes" (los anexos de Drive
// pueden ser PDF o imágenes JPEG/PNG, p. ej. fotos de WhatsApp).
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

    // Añade una página A4 nueva y dibuja en ella el contenido embebido (página
    // de PDF o imagen) escalado proporcionalmente y centrado, para que TODO el
    // PDF final tenga el mismo tamaño de página.
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
                // Anexo imagen (foto de WhatsApp, escaneo…): embeber como 1 página.
                const img = type === 'jpg' ? await merged.embedJpg(buf) : await merged.embedPng(buf);
                addScaledA4Page(img, (page, opts) => page.drawImage(img, opts));
                console.log(`[mergePdfs] Anexo imagen (${type}): 1 pág embebida`);
            } else {
                // Anexo PDF. Cargamos aparte para conocer su número de páginas, ya
                // que embedPdf(buf) SIN indices solo embebe la PRIMERA página.
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

/**
 * Descarga en paralelo los PDFs de Drive cuyos IDs se pasen.
 */
async function fetchAnnexBuffers(annexDriveFileIds) {
    if (!Array.isArray(annexDriveFileIds) || annexDriveFileIds.length === 0) return [];
    const { getFileContent } = require('../services/driveService');
    const buffers = await Promise.all(
        annexDriveFileIds.map(id => getFileContent(id).catch(err => {
            console.warn(`[fetchAnnexBuffers] Falló ${id}:`, err.message);
            return null;
        }))
    );
    return buffers.filter(b => b && b.length > 0);
}

/**
 * POST /api/pdf/generate
 * Body: { html: string }
 * Returns: application/pdf
 */
router.post('/generate', async (req, res) => {
    const { html, annexDriveFileIds } = req.body;
    console.log(`[PDF] Generando PDF oficial... (Payload: ${Math.round((html?.length || 0)/1024)} KB, anexos=${annexDriveFileIds?.length || 0})`);

    if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'Se requiere el campo "html" con el contenido HTML.' });
    }

    let browser = null;
    let page = null;
    try {
        // Lanzar la descarga de anexos en paralelo con la generación del PDF principal
        const annexPromise = fetchAnnexBuffers(annexDriveFileIds);

        browser = await getBrowser();
        page = await browser.newPage();

        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

        await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await new Promise(r => setTimeout(r, 1000));

        try {
            await page.evaluate(() => document.fonts.ready);
        } catch (_) { }

        let pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            preferCSSPageSize: false,
            scale: 1,
        });

        const annexBuffers = await annexPromise;
        if (annexBuffers.length > 0) {
            pdfBuffer = await mergePdfs(pdfBuffer, annexBuffers);
        }

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

/**
 * POST /api/pdf/save-to-drive
 * Body: { html: string, folderId: string, fileName: string, subfolderName?: string }
 * Returns: { success: boolean, driveLink: string }
 */
router.post('/save-to-drive', async (req, res) => {
    const { html, folderId, fileName, subfolderName, annexDriveFileIds } = req.body;
    const driveService = require('../services/driveService');

    if (!html || !folderId) {
        return res.status(400).json({ error: 'Se requiere el contenido HTML y el ID de la carpeta de Drive.' });
    }

    let browser = null;
    let page = null;
    try {
        const annexPromise = fetchAnnexBuffers(annexDriveFileIds);

        browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
        await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await new Promise(r => setTimeout(r, 1000));
        try { await page.evaluate(() => document.fonts.ready); } catch (_) { }

        let pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        const annexBuffers = await annexPromise;
        if (annexBuffers.length > 0) {
            pdfBuffer = await mergePdfs(pdfBuffer, annexBuffers);
        }

        // Manejar subcarpeta si se provee
        let targetFolderId = folderId;
        if (subfolderName) {
            targetFolderId = await driveService.getOrCreateSubfolder(folderId, subfolderName);
        }

        // Guardar en Drive (Permitimos espacios y caracteres españoles)
        const safeFileName = (fileName || 'Propuesta_Brokergy').trim().replace(/[\\/<>:"|?*]/g, '_') + '.pdf';
        const driveResult = await driveService.saveFileToFolder(targetFolderId, safeFileName, 'application/pdf', pdfBuffer);

        if (!driveResult) {
            throw new Error('No se pudo guardar el archivo en Drive.');
        }

        res.json({ success: true, driveLink: driveResult.link });
    } catch (error) {
        console.error('Error guardando PDF en Drive:', error);
        res.status(500).json({ error: 'Error al guardar el PDF en Drive.', message: error.message });
    } finally {
        if (page) { try { await page.close(); } catch (_) { } }
        if (browser) { try { await browser.close(); } catch (_) { } }
    }
});

/**
 * POST /api/pdf/send-proposal
 * Body: { html: string, to: string, userName: string, summaryData: object }
 */
router.post('/send-proposal', async (req, res) => {
    const { html, to, userName, summaryData, customMessage } = req.body;
    const emailService = require('../services/emailService');

    if (!html || !to) {
        return res.status(400).json({ error: 'Se requiere el contenido HTML y el correo del destinatario.' });
    }

    let browser = null;
    let page = null;
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
        await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Esperar fuentes y estilos
        await new Promise(r => setTimeout(r, 1000));
        try { await page.evaluate(() => document.fonts.ready); } catch (_) { }

        // 1. Generar PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        // 2. Omitir captura de imagen (se enviará solo texto/HTML)
        let tableImageBase64 = null;

        // 3. Enviar email usando el servicio dedicado
        await emailService.sendProposalEmail({
            to,
            userName,
            pdfBuffer,
            tableImageBase64,
            summaryData,
            customMessage: customMessage || null
        });

        // 4. Guardar HTML en base de datos para la vista web online
        if (summaryData && summaryData.id && summaryData.id !== 'Simulación') {
            const supabase = require('../services/supabaseClient');
            const { data: opp, error: fetchErr } = await supabase
                .from('oportunidades')
                .select('datos_calculo')
                .eq('id_oportunidad', summaryData.id)
                .maybeSingle();

            if (opp && !fetchErr) {
                const currentDatos = opp.datos_calculo || {};
                const currentHistorial = currentDatos.historial || [];
                
                // Si el estado actual no es ENVIADA o ya aceptada, actualizamos
                if (currentDatos.estado !== 'ENVIADA' && currentDatos.estado !== 'ACEPTADA') {
                    const newHistorial = [...currentHistorial, {
                        id: Date.now().toString() + '_envio',
                        tipo: 'cambio_estado',
                        estado: 'ENVIADA',
                        fecha: new Date().toISOString(),
                        usuario: 'Sistema'
                    }];
                    
                    const newData = { 
                        ...currentDatos, 
                        html_propuesta: html,
                        estado: 'ENVIADA',
                        historial: newHistorial
                    };
                    await supabase.from('oportunidades')
                        .update({ datos_calculo: newData })
                        .eq('id_oportunidad', summaryData.id);
                        
                    console.log(`[PDF] Oportunidad ${summaryData.id} actualizada a ENVIADA tras envío de email.`);
                } else {
                    // Solo actualizamos el HTML si ya estaba enviada/aceptada
                    const newData = { ...currentDatos, html_propuesta: html };
                    await supabase.from('oportunidades')
                        .update({ datos_calculo: newData })
                        .eq('id_oportunidad', summaryData.id);
                }
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error enviando propuesta por email:', error);
        res.status(500).json({ 
            error: 'Error al enviar la propuesta por email.', 
            message: error.message 
        });
    } finally {
        if (page) { try { await page.close(); } catch (_) { } }
        if (browser) { try { await browser.close(); } catch (_) { } }
    }
});

/**
 * POST /api/pdf/send-annex
 * Body: { 
 *   to: string, 
 *   userName: string, 
 *   customMessage?: string,
 *   summaryData: object,
 *   docs: [{ html: string, fileName: string }] 
 * }
 */
router.post('/send-annex', async (req, res) => {
    const { to, userName, customMessage, summaryData, docs } = req.body;
    const emailService = require('../services/emailService');

    if (!to || !docs || !Array.isArray(docs)) {
        return res.status(400).json({ error: 'Se requieren destinatario y lista de documentos.' });
    }

    let browser = null;
    try {
        browser = await getBrowser();
        const attachments = [];

        for (const doc of docs) {
            const page = await browser.newPage();
            await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
            await page.setContent(doc.html, { waitUntil: 'domcontentloaded', timeout: 30000 });
            try { await page.evaluateHandle('document.fonts.ready'); } catch (_) { }

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: 0, right: 0, bottom: 0, left: 0 }
            });
            
            attachments.push({
                filename: (doc.fileName || 'Documento').endsWith('.pdf') ? doc.fileName : `${doc.fileName}.pdf`,
                content: pdfBuffer
            });
            await page.close();
        }

        await emailService.sendAnnexEmail({
            to,
            userName,
            attachments,
            customMessage,
            summaryData
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error enviando anexos por email:', error);
        res.status(500).json({ error: 'Error al enviar los anexos por email.', message: error.message });
    } finally {
        if (browser) { try { await browser.close(); } catch (_) { } }
    }
});

/**
 * POST /api/pdf/send-cifo
 * Genera el CIFO como PDF y lo envía al instalador por email.
 * Body: { html, to, instaladorNombre, numExpediente }
 */
router.post('/send-cifo', async (req, res) => {
    const { html, to, instaladorNombre, numExpediente, clienteNombre, direccionInstalacion, uploadLink, annexDriveFileIds, subject, message } = req.body;
    const emailService = require('../services/emailService');

    if (!html || !to) {
        return res.status(400).json({ error: 'Se requiere el contenido HTML y el correo del instalador.' });
    }

    let browser = null;
    let page = null;
    try {
        const annexPromise = fetchAnnexBuffers(annexDriveFileIds);

        browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 1000));
        try { await page.evaluate(() => document.fonts.ready); } catch (_) { }

        let pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        const annexBuffers = await annexPromise;
        if (annexBuffers.length > 0) {
            pdfBuffer = await mergePdfs(pdfBuffer, annexBuffers);
        }

        const nombre  = instaladorNombre   || 'instalador';
        const expte   = numExpediente      || '';
        const cliente = clienteNombre      || '';
        const dir     = direccionInstalacion || '';
        const link    = uploadLink          || '';

        const emailSubject = subject || `${expte} - Firmar Certificado CIFO de ${cliente}`;

        // Si el frontend manda un `message` editable, lo renderizamos como cuerpo
        // (escapando HTML, *negritas* → <strong>, URLs → enlaces, saltos → <br>).
        // Si no, se usa la plantilla por defecto con botón de subida.
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const messageToHtml = (msg) => esc(msg)
            .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
            .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#f59e0b;font-weight:bold;">$1</a>')
            .replace(/\n/g, '<br>');

        const bodyInner = message
            ? `<div style="color:#444;line-height:1.6;font-size:14px;">${messageToHtml(message)}</div>`
            : `
                        <p style="font-size:16px;color:#111;">Hola, <strong>${nombre}</strong>:</p>
                        <p style="color:#444;line-height:1.6;">
                            Te adjuntamos el <strong>Certificado CIFO</strong> que nos debes devolver <strong>firmado digitalmente</strong>,
                            correspondiente al expediente <strong>${expte}</strong>${cliente ? ` de <strong>${cliente}</strong>` : ''}${dir ? ` de la instalación realizada en <strong>${dir}</strong>` : ''}.
                        </p>
                        <p style="color:#444;line-height:1.6;">
                            Quedamos a la espera de recibirlo para continuar con el trámite${link ? ' o puedes subirlo directamente haciendo clic en el botón:' : '.'}
                        </p>
                        ${link ? `
                        <div style="text-align:center;margin:28px 0;">
                            <a href="${link}" style="display:inline-block;background:#f59e0b;color:#000;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:14px 32px;border-radius:10px;">
                                📤 Subir CIFO firmado
                            </a>
                        </div>
                        ` : ''}`;

        await emailService.sendMail({
            to,
            subject: emailSubject,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
                    <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:24px 32px;">
                        <h1 style="margin:0;color:#fff;font-size:20px;letter-spacing:1px;">BROKERGY</h1>
                        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;">Ingeniería Energética</p>
                    </div>
                    <div style="padding:32px;">
                        ${bodyInner}
                        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
                        <p style="color:#888;font-size:12px;margin:0;">
                            BROKERGY · Ingeniería Energética<br>
                            <a href="mailto:brokergy@brokergy.es" style="color:#f59e0b;">brokergy@brokergy.es</a>
                        </p>
                    </div>
                </div>
            `,
            attachments: [{
                filename: `${expte ? expte + ' - ' : ''}Certificado_CIFO.pdf`,
                content: pdfBuffer
            }]
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error enviando CIFO por email:', error);
        res.status(500).json({ error: 'Error al enviar el CIFO por email.', message: error.message });
    } finally {
        if (browser) { try { await browser.close(); } catch (_) { } }
        if (page)    { try { await page.close();    } catch (_) { } }
    }
});

module.exports = router;
