const express = require('express');
const router = express.Router();

const { getBrowser } = require('../services/pdfService');

/**
 * POST /api/pdf/generate
 * Body: { html: string }
 * Returns: application/pdf
 */
router.post('/generate', async (req, res) => {
    const { html } = req.body;
    console.log(`[PDF] Generando PDF oficial... (Payload: ${Math.round((html?.length || 0)/1024)} KB)`);

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
        // setContent con domcontentloaded es más rápido y estable para evitar detacheo de frames
        await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 60000 // Aumentamos timeout a 60s
        });

        // Esperar un poco a que el CSS se aplique y las fuentes se carguen
        await new Promise(r => setTimeout(r, 1000));

        // Comprobar fuentes con seguridad
        try {
            await page.evaluate(() => document.fonts.ready);
        } catch (_) { }

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

/**
 * POST /api/pdf/save-to-drive
 * Body: { html: string, folderId: string, fileName: string, subfolderName?: string }
 * Returns: { success: boolean, driveLink: string }
 */
router.post('/save-to-drive', async (req, res) => {
    const { html, folderId, fileName, subfolderName } = req.body;
    const driveService = require('../services/driveService');

    if (!html || !folderId) {
        return res.status(400).json({ error: 'Se requiere el contenido HTML y el ID de la carpeta de Drive.' });
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

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

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
    const { html, to, userName, summaryData } = req.body;
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
            summaryData
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
    const { html, to, instaladorNombre, numExpediente, clienteNombre, direccionInstalacion, uploadLink } = req.body;
    const emailService = require('../services/emailService');

    if (!html || !to) {
        return res.status(400).json({ error: 'Se requiere el contenido HTML y el correo del instalador.' });
    }

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

        const nombre  = instaladorNombre   || 'instalador';
        const expte   = numExpediente      || '';
        const cliente = clienteNombre      || '';
        const dir     = direccionInstalacion || '';
        const link    = uploadLink          || '';

        await emailService.sendMail({
            to,
            subject: `Certificado CIFO — Expediente ${expte} | BROKERGY`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
                    <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:24px 32px;">
                        <h1 style="margin:0;color:#fff;font-size:20px;letter-spacing:1px;">BROKERGY</h1>
                        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;">Ingeniería Energética</p>
                    </div>
                    <div style="padding:32px;">
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
                        ` : ''}
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
