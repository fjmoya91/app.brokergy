const express = require('express');
const router = express.Router();

const { getBrowser, mergePdfs, fetchAnnexBuffers } = require("../services/pdfService");

// Anexos a concatenar. Formato actual: `annexes` = [{ driveId, excludedPages }]
// (permite recortar páginas de cada anexo, ver documentacion.cifo_annex_prefs).
// Formato antiguo: `annexDriveFileIds` = ['driveId'] → todas las páginas.
const annexSpecs = (body) => (Array.isArray(body?.annexes) ? body.annexes : body?.annexDriveFileIds);


/**
 * POST /api/pdf/generate
 * Body: { html: string }
 * Returns: application/pdf
 */
router.post('/generate', async (req, res) => {
    const { html } = req.body;
    const annexes = annexSpecs(req.body);
    console.log(`[PDF] Generando PDF oficial... (Payload: ${Math.round((html?.length || 0)/1024)} KB, anexos=${annexes?.length || 0})`);

    if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'Se requiere el campo "html" con el contenido HTML.' });
    }

    let browser = null;
    let page = null;
    try {
        // Lanzar la descarga de anexos en paralelo con la generación del PDF principal
        const annexPromise = fetchAnnexBuffers(annexes);

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
    const { html, folderId, fileName, subfolderName } = req.body;
    const annexes = annexSpecs(req.body);
    const driveService = require('../services/driveService');

    if (!html || !folderId) {
        return res.status(400).json({ error: 'Se requiere el contenido HTML y el ID de la carpeta de Drive.' });
    }

    let browser = null;
    let page = null;
    try {
        const annexPromise = fetchAnnexBuffers(annexes);

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
    const { html, to, instaladorNombre, numExpediente, clienteNombre, direccionInstalacion, uploadLink, subject, message } = req.body;
    const annexes = annexSpecs(req.body);
    const emailService = require('../services/emailService');

    if (!html || !to) {
        return res.status(400).json({ error: 'Se requiere el contenido HTML y el correo del instalador.' });
    }

    let browser = null;
    let page = null;
    try {
        const annexPromise = fetchAnnexBuffers(annexes);

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

        // Mensaje por defecto si el frontend no envía uno editable.
        const defaultMessage = `Hola ${nombre},\n\nTe adjuntamos el *Certificado CIFO* del expediente ${expte}${cliente ? ` de ${cliente}` : ''}${dir ? `, de la instalación realizada en ${dir}` : ''}.\n\nPuedes *firmarlo directamente* con tu certificado electrónico, sin descargar ni volver a subir nada.\n\n${link}\n\nUn saludo,\n*BROKERGY · Ingeniería Energética*`;

        // Email con la MISMA identidad visual que los emails al certificador
        // (brandEmailShell). El enlace de firma se renderiza como botón destacado.
        await emailService.sendDocumentEmail({
            to,
            subject: emailSubject,
            title: link ? 'Firma tu Certificado CIFO' : 'Documentación de tu expediente',
            message: message || defaultMessage,
            primaryLink: link || null,
            primaryLabel: '🖊️ Firmar CIFO ahora',
            secondaryNote: link
                ? 'Necesitas tener Autofirma instalado para firmar en el navegador. Si lo prefieres, puedes subir el PDF ya firmado desde ese mismo enlace.'
                : null,
            pill: link ? { tone: 'warning', text: 'Pendiente de firma', emoji: '✍️' } : null,
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
