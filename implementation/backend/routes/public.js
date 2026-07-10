const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const emailService = require('../services/emailService');
const expedienteService = require('../services/expedienteService');
const whatsappService = require('../services/whatsappService');
const driveService = require('../services/driveService');
const reformaUploadService = require('../services/reformaUploadService');
const ceeUploadService = require('../services/ceeUploadService');
const anexoFotograficoService = require('../services/anexoFotograficoService');
const { requireAuth } = require('../middleware/auth');
const axios = require('axios');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');

// Configuración de multer (memoria para subida directa a Drive)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB para justificante
});

// Multer dedicado a la documentación del expediente: admite vídeos del recorrido
// de la vivienda, que pesan bastante más que una foto (móvil 1080p ≈ 30-150MB).
const DOCS_MAX_MB = 120;
const uploadDocs = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: DOCS_MAX_MB * 1024 * 1024 },
});
// Envuelve multer para devolver un error claro (413) si el archivo excede el límite,
// en lugar de un 500 genérico.
function uploadDocsSingle(req, res, next) {
    uploadDocs.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: `El archivo es demasiado grande (máximo ${DOCS_MAX_MB} MB). Si es un vídeo, grábalo más corto o en menor calidad.` });
            }
            console.error('[Reforma] multer upload error:', err.message);
            return res.status(400).json({ error: 'No se pudo procesar el archivo. Inténtalo de nuevo.' });
        }
        next();
    });
}

async function imageToPdf(imageBuffer, mimeType) {
    const pdfDoc = await PDFDocument.create();
    const img = mimeType === 'image/png'
        ? await pdfDoc.embedPng(imageBuffer)
        : await pdfDoc.embedJpg(imageBuffer);
    const { width, height } = img.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
    return Buffer.from(await pdfDoc.save());
}

// Une varias imágenes en un único PDF (una imagen por página, sin reescalar).
// pdf-lib solo sabe embeber JPG y PNG: detectamos el formato por los bytes mágicos
// y omitimos lo que no sea embebible (HEIC/webp…). Devuelve el buffer + cuántas
// se incluyeron / se omitieron para poder avisar al usuario.
async function imagesToPdf(images) {
    const pdfDoc = await PDFDocument.create();
    let added = 0, skipped = 0;
    for (const { buffer } of images) {
        try {
            const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
            const isJpg = buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
            let img;
            if (isPng) img = await pdfDoc.embedPng(buffer);
            else if (isJpg) img = await pdfDoc.embedJpg(buffer);
            else { skipped++; continue; }
            const { width, height } = img.scale(1);
            const page = pdfDoc.addPage([width, height]);
            page.drawImage(img, { x: 0, y: 0, width, height });
            added++;
        } catch (e) {
            console.warn('[imagesToPdf] no se pudo embeber una imagen:', e.message);
            skipped++;
        }
    }
    const pdf = Buffer.from(await pdfDoc.save());
    return { pdf, added, skipped };
}

const A4_WIDTH_PT = 595.276;
const A4_HEIGHT_PT = 841.890;

// Coloca las DOS caras del DNI (imágenes) en UNA sola página A4 (delante arriba,
// detrás abajo), centradas. Devuelve el buffer PDF de 1 página, o null si algún
// lado no es imagen embebible (PDF/HEIC…) → el llamador cae al modo antiguo.
async function dniTwoSidesOnePage(frontBuf, backBuf) {
    const embedImg = async (doc, buf) => {
        if (!buf || buf.length < 4) return null;
        const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
        const isJpg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
        try {
            if (isPng) return await doc.embedPng(buf);
            if (isJpg) return await doc.embedJpg(buf);
        } catch (e) { console.warn('[dniOnePage] no embebible:', e.message); }
        return null;
    };
    const doc = await PDFDocument.create();
    const page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const margin = 40;
    const gap = 24;
    const halfH = (A4_HEIGHT_PT - margin * 2 - gap) / 2;
    const maxW = A4_WIDTH_PT - margin * 2;
    const drawImg = (img, topY) => {
        const s = Math.min(maxW / img.width, halfH / img.height);
        const w = img.width * s, h = img.height * s;
        page.drawImage(img, { x: (A4_WIDTH_PT - w) / 2, y: topY - h, width: w, height: h });
    };
    const imgF = await embedImg(doc, frontBuf);
    const imgB = await embedImg(doc, backBuf);
    if (!imgF || !imgB) return null;   // alguna cara no es imagen → modo antiguo
    drawImg(imgF, A4_HEIGHT_PT - margin);                         // arriba
    drawImg(imgB, A4_HEIGHT_PT - margin - halfH - gap);           // abajo
    return Buffer.from(await doc.save());
}

// DNI del representante de Brokergy (se anexa a la Cesión manuscrita). Se lee de
// backend/assets/dni_representante.(pdf|jpg|png) si el fichero existe.
function readRepresentanteDni() {
    const fs = require('fs'); const path = require('path');
    for (const ext of ['pdf', 'jpg', 'jpeg', 'png']) {
        const p = path.join(__dirname, '..', 'assets', `dni_representante.${ext}`);
        try { if (fs.existsSync(p)) return { buffer: fs.readFileSync(p), ext }; } catch (e) {}
    }
    return null;
}

// Concatena un PDF principal con varios PDF anexo, normalizando cada página
// anexada a A4 (escalada y centrada). Réplica del helper de routes/pdf.js para
// no acoplar este módulo al router de PDF. Se usa para anexar el DNI (delante +
// detrás) al final del Anexo de Cesión firmado a mano.
async function mergePdfs(mainBuffer, annexBuffers) {
    if (!annexBuffers || annexBuffers.length === 0) return mainBuffer;
    const merged = await PDFDocument.load(mainBuffer);
    for (const buf of annexBuffers) {
        if (!buf || buf.length === 0) continue;
        try {
            const annexDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
            const indices = annexDoc.getPageIndices();
            const embedded = await merged.embedPdf(annexDoc, indices);
            for (const ep of embedded) {
                const page = merged.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
                const { width: w, height: h } = ep;
                const scale = Math.min(A4_WIDTH_PT / w, A4_HEIGHT_PT / h);
                const drawW = w * scale;
                const drawH = h * scale;
                page.drawPage(ep, { x: (A4_WIDTH_PT - drawW) / 2, y: (A4_HEIGHT_PT - drawH) / 2, width: drawW, height: drawH });
            }
        } catch (e) {
            console.warn('[mergePdfs/public] Skip anexo no parseable:', e.message);
        }
    }
    return Buffer.from(await merged.save());
}



// Helper para que el link público pueda usar tanto id_oportunidad (inicial) como numero_expediente (trazabilidad) o el ID único (UUID)
const resolveOportunidadId = async (idParam) => {
    if (!idParam) return null;
    
    // 1. Intentar resolver por UUID directamente (más seguro y no predecible)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
    if (isUuid) {
        const { data: oppByUuid } = await supabase.from('oportunidades').select('id_oportunidad').eq('id', idParam).maybeSingle();
        if (oppByUuid) return oppByUuid.id_oportunidad;
    }

    // 2. Intentar resolver como numero_expediente
    const { data: exp } = await supabase.from('expedientes').select('id_oportunidad_ref').eq('numero_expediente', idParam).maybeSingle();
    if (exp && exp.id_oportunidad_ref) {
        return exp.id_oportunidad_ref;
    }
    
    // 3. Por defecto, asumir que es el id_oportunidad legible
    return idParam;
};

// GET /api/public/propuesta/:id
router.get('/propuesta/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: opp, error } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id_oportunidad', id)
            .maybeSingle();
            
        if (error || !opp) {
            return res.status(404).send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h2>Oportunidad no encontrada</h2>
                    <p>La propuesta a la que intentas acceder no existe o es inválida.</p>
                </div>
            `);
        }
        
        const html = opp.datos_calculo?.html_propuesta;
        if (!html) {
             return res.status(404).send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h2>Vista no disponible</h2>
                    <p>Esta propuesta aún no tiene una versión web generada. Pide a tu asesor que la vuelva a enviar.</p>
                </div>
             `);
        }

        res.send(html);
    } catch(e) {
        console.error('Error serving public html:', e);
        res.status(500).send('Error interno del servidor');
    }
});

// GET /api/public/cliente/:id
router.get('/cliente/:id', async (req, res) => {
    try {
        const paramId = req.params.id;
        const id = await resolveOportunidadId(paramId);

        const { data: opp, error: oppErr } = await supabase
            .from('oportunidades')
            .select(`
                id,
                cliente_id, 
                referencia_cliente, 
                prescriptor_id,
                datos_calculo,
                expedientes (
                    numero_expediente
                )
            `)
            .eq('id_oportunidad', id)
            .maybeSingle();

        if (oppErr || !opp) {
            return res.status(404).json({ error: 'Oportunidad no encontrada' });
        }

        let clienteStr = opp.referencia_cliente; 
        let foundCliente = null;

        if (opp.cliente_id) {
            const { data: c } = await supabase.from('clientes').select('*').eq('id_cliente', opp.cliente_id).maybeSingle();
            if (c) foundCliente = c;
        }

        // Búsqueda alternativa por nombre si no hay cliente_id
        if (!foundCliente && clienteStr) {
            console.log(`[Public] Intentando fallback search para cliente: "${clienteStr}"`);
            const { data: cList } = await supabase.from('clientes').select('*');
            if (cList) {
                const normalize = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
                const target = normalize(clienteStr);
                
                foundCliente = cList.find(c => {
                    const fullName = normalize(`${c.nombre_razon_social || ''} ${c.apellidos || ''}`);
                    const soloNombre = normalize(c.nombre_razon_social);
                    return fullName === target || soloNombre === target || fullName.includes(target) || target.includes(soloNombre);
                });
                console.log(`[Public] Fallback search result: ${foundCliente ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
            }
        }

        // Fallback variables for name/surname parsing if client not found
        let nombre = clienteStr || '';
        let apellidos = '';
        if (nombre.includes(' ')) {
            const parts = nombre.split(' ');
            nombre = parts[0];
            apellidos = parts.slice(1).join(' ');
        }

        const historial = opp.datos_calculo?.historial || [];
        const acceptanceEntry = historial.find(h => h.tipo === 'cambio_estado' && h.estado === 'ACEPTADA');

        const useContact = foundCliente?.notificaciones_contacto_activas;
        
        return res.json({
            id_oportunidad: id,
            id_cliente: foundCliente?.id_cliente || null,
            nombre_razon_social: foundCliente?.nombre_razon_social || nombre,
            apellidos: foundCliente?.apellidos || apellidos,
            dni_cif: foundCliente?.dni || '',
            email: (useContact && foundCliente?.persona_contacto_email) ? foundCliente.persona_contacto_email : (foundCliente?.email || ''),
            telefono: (useContact && foundCliente?.persona_contacto_tlf) ? foundCliente.persona_contacto_tlf : (foundCliente?.tlf || ''),
            iban: foundCliente?.numero_cuenta || '',
            estado: opp.datos_calculo?.estado || 'BORRADOR',
            numero_expediente: opp.expedientes?.[0]?.numero_expediente || opp.expedientes?.numero_expediente || null,
            tiene_instalador: true,
            fecha_aceptacion: acceptanceEntry?.fecha || null,
            aceptado_por: acceptanceEntry?.usuario || null,
            // El cliente aportó un CEE inicial → la firma ofrecerá elegir usarlo o hacer uno nuevo.
            cee_aportado: !!(opp.datos_calculo?.cee_previo || opp.datos_calculo?.inputs?.cee_previo),
            cee_decision: opp.datos_calculo?.cee_decision || null,
        });

    } catch (e) {
        console.error('Error public cliente details:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST /api/public/aceptar/:id_oportunidad
router.post('/aceptar/:id', upload.single('justificante'), async (req, res) => {
    try {
        const paramId = req.params.id;
        const id = await resolveOportunidadId(paramId);
        
        const formFields = req.body;
        
        // Find opportunity
        const { data: opp, error: oppErr } = await supabase
            .from('oportunidades')
            .select('*')
            .eq('id_oportunidad', id)
            .maybeSingle();

        if (oppErr || !opp) {
            return res.status(404).json({ error: 'Oportunidad no encontrada' });
        }

        let id_cliente = opp.cliente_id;

        const clienteData = {
            nombre_razon_social: formFields.nombre_razon_social,
            apellidos: formFields.apellidos,
            dni: formFields.dni_cif,
            numero_cuenta: formFields.iban || null,
            prescriptor_id: opp.prescriptor_id // Mantenemos el partner asociado a la oportunidad
        };

        // 1. Resolver si debemos actualizar datos principales o de contacto
        if (id_cliente) {
            const { data: currentCli } = await supabase.from('clientes').select('notificaciones_contacto_activas').eq('id_cliente', id_cliente).single();
            if (currentCli?.notificaciones_contacto_activas) {
                // Si el modo contacto está activo, guardamos email/tlf en los campos de contacto
                clienteData.persona_contacto_email = formFields.email;
                clienteData.persona_contacto_tlf = formFields.telefono;
            } else {
                // Si no, actualizamos los datos principales del titular
                clienteData.email = formFields.email;
                clienteData.tlf = formFields.telefono;
            }
        } else {
            // Si es un cliente nuevo, por defecto usamos los campos principales
            clienteData.email = formFields.email;
            clienteData.tlf = formFields.telefono;
        }


        // 1. Si no hay id_cliente en la oportunidad, buscamos si ya existe alguien con este DNI
        if (!id_cliente && clienteData.dni) {
            const { data: existingClient } = await supabase
                .from('clientes')
                .select('id_cliente')
                .eq('dni', clienteData.dni)
                .maybeSingle();
            
            if (existingClient) {
                id_cliente = existingClient.id_cliente;
                console.log(`[Public] Identificado cliente previo por DNI ${clienteData.dni}: ${id_cliente}`);
            }
        }

        if (id_cliente) {
            // 2. Actualizar datos del cliente (siempre actualizamos para tener lo más reciente: tlf, email, iban...)
            console.log(`[Public] Actualizando datos de cliente ${id_cliente}`);
            const { error: updErr } = await supabase.from('clientes')
                .update(clienteData)
                .eq('id_cliente', id_cliente);
            if (updErr) console.error("[Public] Error al actualizar cliente:", updErr.message);
            
            // Garantizar vinculación en la oportunidad
            const updatePayload = { cliente_id: id_cliente };
            
            // Solo sobreescribimos la referencia si está vacía o es nula (siguiendo política de integridad de datos)
            if (!opp.referencia_cliente || opp.referencia_cliente.trim() === '') {
                updatePayload.referencia_cliente = formFields.nombre_razon_social + ' ' + (formFields.apellidos || '');
            }

            await supabase.from('oportunidades').update(updatePayload).eq('id_oportunidad', id);
        } else {
            // 3. Crear nuevo cliente solo si no existe por ID ni por DNI
            console.log(`[Public] Creando nuevo cliente para DNI ${clienteData.dni}`);
            const refNum = Math.floor(100000 + Math.random() * 900000);
            const { data: newCli, error: createErr } = await supabase.from('clientes')
                .insert({
                    id_cliente: 'CL' + refNum,
                    ...clienteData
                }).select().maybeSingle();
                
            if (!createErr && newCli) {
                id_cliente = newCli.id_cliente;
                
                const updatePayload = { cliente_id: id_cliente };
                if (!opp.referencia_cliente || opp.referencia_cliente.trim() === '') {
                    updatePayload.referencia_cliente = formFields.nombre_razon_social + ' ' + (formFields.apellidos || '');
                }

                // Vincular oportunidad
                await supabase.from('oportunidades').update(updatePayload).eq('id_oportunidad', id);
            } else {
                console.error("[Public] Error creando nuevo cliente:", createErr?.message || 'Error desconocido');
            }
        }

        // 1. Marcar la oportunidad como ACEPTADA (si no lo está ya)
        const currentHistorial = opp.datos_calculo?.historial || [];
        const prevEstado = opp.datos_calculo?.estado || 'BORRADOR';
        
        console.log(`[Public] Procesando aceptación para ${id}. Estado previo: ${prevEstado}`);

        // Decisión del cliente sobre el CEE inicial (solo si aportó uno): 'aportado' | 'nuevo'.
        const ceeChoice = formFields.cee_choice;
        const ceeDecision = ceeChoice === 'aportado' ? 'usar_cee_aportado'
            : (ceeChoice === 'nuevo' ? 'calcular_cee_nuevo' : null);

        // Fechas que el cliente dice que le ha dado su instalador. Son OPCIONALES.
        // La de inicio marca el plazo del CEE inicial: debe registrarse antes de que
        // empiece la obra. Se guardan en la oportunidad y `createExpediente` las hereda.
        const esFechaIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
        const fechaInicio = esFechaIso(formFields.fecha_prevista_inicio) ? formFields.fecha_prevista_inicio : null;
        const fechaFinRaw = esFechaIso(formFields.fecha_prevista_fin) ? formFields.fecha_prevista_fin : null;
        // Una obra no puede terminar antes de empezar: si llega incoherente, se ignora el fin.
        const fechaFin = (fechaInicio && fechaFinRaw && fechaFinRaw < fechaInicio) ? null : fechaFinRaw;
        const fechasPrevistas = (fechaInicio || fechaFin)
            ? { fecha_prevista_inicio: fechaInicio, fecha_prevista_fin: fechaFin }
            : null;

        if (prevEstado !== 'ACEPTADA') {
            const clienteNombre = [formFields.nombre_razon_social, formFields.apellidos].filter(Boolean).join(' ');
            const newHistorial = [...currentHistorial, {
                id: Date.now().toString() + '_aceptacion',
                tipo: 'cambio_estado',
                estado: 'ACEPTADA',
                fecha: new Date().toISOString(),
                usuario: `Firma Cliente (${clienteNombre})`,
                ...(ceeDecision ? { cee_decision: ceeDecision } : {})
            }];

            const newData = { ...(opp.datos_calculo || {}), estado: 'ACEPTADA', historial: newHistorial, ...(ceeDecision ? { cee_decision: ceeDecision } : {}), ...(fechasPrevistas || {}) };
            await supabase.from('oportunidades')
                .update({ datos_calculo: newData })
                .eq('id_oportunidad', id);
            opp.datos_calculo = newData; // reflejar para createExpediente
            console.log(`[Public] Oportunidad ${id} marcada como ACEPTADA${ceeDecision ? ` (CEE: ${ceeDecision})` : ''}${fechaInicio ? ` (inicio obra: ${fechaInicio})` : ''}`);
        } else if ((ceeDecision && opp.datos_calculo?.cee_decision !== ceeDecision) || fechasPrevistas) {
            // Re-aceptación, cambio de decisión CEE o fechas nuevas cuando ya estaba ACEPTADA.
            const newData = { ...(opp.datos_calculo || {}), ...(ceeDecision ? { cee_decision: ceeDecision } : {}), ...(fechasPrevistas || {}) };
            await supabase.from('oportunidades').update({ datos_calculo: newData }).eq('id_oportunidad', id);
            opp.datos_calculo = newData; // reflejar para createExpediente
            console.log(`[Public] Oportunidad ${id}: datos de aceptación actualizados`);
        } else {
            console.log(`[Public] La oportunidad ${id} ya estaba en estado ACEPTADA`);
        }

        // Crear expediente de forma síncrona para devolver el número al cliente
        let numeroExpediente = null;
        // Enlace UNIFICADO de subida (mismo que validamos en el popup de fotos):
        // /subir-docs/:uuid?token=  (antes era /firma/:uuid)
        const uploadLink = await reformaUploadService.ensureUploadLink(opp.id);
        try {
            console.log(`[Public] Solicitando creación de expediente para OP UUID: ${opp.id}`);
            const newExp = await expedienteService.createExpediente(opp.id, id_cliente);
            numeroExpediente = newExp?.numero_expediente;
            console.log(`[Public] Resultado expediente: ${numeroExpediente || 'NO GENERADO/ERROR'}`);
        } catch (expErr) {
            console.error("[Public] Error crítico creando expediente automático:", expErr.message);
        }

        // Subir justificante a Drive (antes de responder para incluirlo en notif)
        const justificanteAdjunto = !!req.file;
        const justificanteBuffer = req.file ? { buffer: req.file.buffer, mimeType: req.file.mimetype } : null;

        // Responder con el número de expediente real
        res.json({ success: true, message: 'Propuesta procesada correctamente.', numeroExpediente, justificanteAdjunto });

        // Background: emails + WhatsApp + Drive justificante (no bloquea la respuesta HTTP)
        setImmediate(async () => {

            // 0. Subir justificante bancario a Drive
            if (justificanteBuffer) {
                try {
                    const driveFolderId = opp.datos_calculo?.drive_folder_id || opp.datos_calculo?.inputs?.drive_folder_id;
                    if (driveFolderId) {
                        let fileBuffer = justificanteBuffer.buffer;
                        if (justificanteBuffer.mimeType !== 'application/pdf') {
                            fileBuffer = await imageToPdf(fileBuffer, justificanteBuffer.mimeType);
                        }
                        await driveService.saveFileToFolder(
                            driveFolderId,
                            'justificante de titularidad bancaria.pdf',
                            'application/pdf',
                            fileBuffer
                        );
                        console.log(`[Public] Justificante bancario subido a Drive para ${id}`);
                    }
                } catch (jErr) {
                    console.error('[Public] Error subiendo justificante a Drive:', jErr.message);
                }
            }

            // 3. Email cliente
            try {
                await emailService.sendAcceptanceNotificationEmail({
                    to: formFields.email,
                    userName: formFields.nombre_razon_social,
                    numeroExpediente,
                    uploadLink
                });
                console.log(`[Public] Email cliente enviado.`);
            } catch (emailErr) {
                console.error("[Public] Error email cliente:", emailErr.message);
            }

            // 4. WhatsApp cliente
            if (formFields.telefono) {
                const whatsappMsg =
`¡Hola *${formFields.nombre_razon_social}*! 👋

Hemos recibido correctamente la aceptación de tu propuesta. *¡Muchas gracias por confiar en Brokergy!*

Tu número de expediente asignado es: *${numeroExpediente || 'Pte. confirmar'}*

A partir de este momento, nuestro equipo técnico comenzará a preparar el *Certificado de Eficiencia Energética inicial*. Es fundamental emitirlo antes de la última factura de obra para asegurar tus deducciones fiscales y tramitar el expediente CAE.

📁 *Documentación necesaria (puedes enviarla poco a poco):*
• Planos de la vivienda o croquis de distribución.
• Foto de la caldera existente y de su placa de características.
• Foto de los radiadores o del colector si es suelo radiante.
• Vídeo corto recorriendo la vivienda.
• Si cambias ventanas o aislamiento, fotos y presupuesto.

🔗 *Puedes subir tu documentación aquí:*
${uploadLink}

¡Quedamos a tu disposición para cualquier duda!
*BROKERGY — Ingeniería Energética*`;
                whatsappService.sendText(formFields.telefono, whatsappMsg)
                    .catch(err => console.warn(`[Public] Error WhatsApp cliente:`, err.message));
            }

            // 5. Notificación administración
            try {
                let installerName = 'No asignado';
                const installerId = opp.instalador_asociado_id || opp.prescriptor_id;
                if (installerId) {
                    const { data: inst } = await supabase.from('prescriptores').select('razon_social, acronimo').eq('id_empresa', installerId).maybeSingle();
                    if (inst) installerName = inst.razon_social || inst.acronimo || 'No asignado';
                }
                const dc = opp.datos_calculo || {};
                const notesList = dc.historial?.filter(h => h.tipo === 'comentario') || [];
                const notesStr = notesList.length > 0
                    ? notesList.map(n => `- ${n.texto} (${n.usuario})`).join('\n')
                    : 'Aceptado por el cliente desde el portal público.';

                const justificanteStr = justificanteAdjunto ? '✅ Justificante bancario adjunto' : '⚠️ Sin justificante bancario';
                const adminMsg = `🚀 *ACEPTACIÓN (PORTAL PÚBLICO)*\n\nOportunidad *${id}*\n👤 *Cliente:* ${formFields.nombre_razon_social} ${formFields.apellidos || ''}\n📍 ${opp.datos_calculo?.inputs?.direccion || 'S/N'}\n👷 *Instalador:* ${installerName}\n📋 Expediente: *${numeroExpediente || 'Pte.'}*\n🏦 ${justificanteStr}\n\n${notesStr}\n\n${process.env.FRONTEND_URL || 'https://app.brokergy.es'}?exp=${numeroExpediente || ''}`;
                whatsappService.sendText(process.env.WHATSAPP_ADMIN_CHAT || '34623926179', adminMsg).catch(e => console.warn('[Public] Error WhatsApp Admin:', e.message));

                await emailService.sendAdminNotificationEmail({
                    numeroExpediente,
                    clientName: `${formFields.nombre_razon_social} ${formFields.apellidos || ''}`,
                    address: opp.datos_calculo?.inputs?.direccion,
                    distributorName: 'Firma del Cliente (Portal Público)',
                    installerName,
                    notes: notesStr,
                    expedienteId: numeroExpediente
                });
            } catch (adminErr) {
                console.error("[Public] Error notificando administración:", adminErr.message);
            }
        });

    } catch(e) {
        console.error('Error public aceptar propuesta:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PATCH /api/public/datos/:id — Actualiza datos del cliente sin reenviar notificaciones
router.patch('/datos/:id', async (req, res) => {
    try {
        const id = await resolveOportunidadId(req.params.id);
        const { nombre_razon_social, apellidos, dni_cif, email, telefono, iban } = req.body;

        const { data: opp, error: oppErr } = await supabase
            .from('oportunidades')
            .select('cliente_id, prescriptor_id')
            .eq('id_oportunidad', id)
            .maybeSingle();

        if (oppErr || !opp) return res.status(404).json({ error: 'Oportunidad no encontrada' });
        if (!opp.cliente_id) return res.status(400).json({ error: 'Esta oportunidad no tiene cliente vinculado aún' });

        const updates = {};
        if (nombre_razon_social !== undefined) updates.nombre_razon_social = nombre_razon_social;

        if (apellidos !== undefined) updates.apellidos = apellidos;
        if (dni_cif !== undefined) updates.dni = dni_cif;
        if (iban !== undefined) updates.numero_cuenta = iban || null;

        // Distinguir entre actualizar titular o contacto alternativo
        const { data: currentCli } = await supabase.from('clientes').select('notificaciones_contacto_activas').eq('id_cliente', opp.cliente_id).single();
        
        if (currentCli?.notificaciones_contacto_activas) {
            if (email !== undefined) updates.persona_contacto_email = email;
            if (telefono !== undefined) updates.persona_contacto_tlf = telefono;
        } else {
            if (email !== undefined) updates.email = email;
            if (telefono !== undefined) updates.tlf = telefono;
        }

        const { error: updErr } = await supabase.from('clientes').update(updates).eq('id_cliente', opp.cliente_id);

        if (updErr) return res.status(500).json({ error: 'Error al actualizar datos del cliente' });

        res.json({ success: true });
    } catch (e) {
        console.error('Error PATCH /public/datos:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Extrae la extensión de un nombre, tomando el último punto. Si no hay punto, infiere desde mimeType.
function inferExtension(originalName, mimeType) {
    const name = String(originalName || '');
    const lastDot = name.lastIndexOf('.');
    if (lastDot >= 0 && lastDot < name.length - 1) {
        const ext = name.substring(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (ext) return ext;
    }
    const mt = String(mimeType || '').toLowerCase();
    if (mt.includes('jpeg') || mt.includes('jpg')) return 'jpg';
    if (mt.includes('png')) return 'png';
    if (mt.includes('webp')) return 'webp';
    if (mt.includes('heic')) return 'heic';
    if (mt.includes('heif')) return 'heif';
    if (mt.includes('pdf')) return 'pdf';
    if (mt.includes('mp4')) return 'mp4';
    return 'jpg';
}

// POST /api/public/upload-docs/:id
// Body multipart:
//   files: file[]
//   canonical_names (opcional): JSON string array — un nombre canónico por fichero (alineado por índice).
//     Si se proporciona para el fichero i, el backend lo guarda con ese nombre (+ extensión inferida).
//     Si no, conserva el nombre original.
router.post('/upload-docs/:id', upload.array('files', 50), async (req, res) => {
    try {
        const paramId = req.params.id;
        const id = await resolveOportunidadId(paramId); // id_oportunidad

        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No se han recibido archivos' });
        }

        // Parseo defensivo de canonical_names (puede venir como JSON string o como array)
        let canonicalNames = [];
        if (req.body.canonical_names) {
            try {
                const raw = req.body.canonical_names;
                canonicalNames = Array.isArray(raw) ? raw : JSON.parse(raw);
                if (!Array.isArray(canonicalNames)) canonicalNames = [];
            } catch (e) {
                console.warn('[Upload] canonical_names inválido, se ignora:', e.message);
                canonicalNames = [];
            }
        }

        // 1. Buscar la oportunidad para obtener la carpeta de Drive
        const { data: opp, error: oppErr } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id_oportunidad', id)
            .maybeSingle();

        if (oppErr || !opp) {
            return res.status(404).json({ error: 'Oportunidad no encontrada' });
        }

        const driveFolderId = opp.datos_calculo?.drive_folder_id || opp.datos_calculo?.inputs?.drive_folder_id;

        if (!driveFolderId) {
            console.error(`[Upload] Oportunidad ${id} no tiene carpeta de Drive vinculada.`);
            return res.status(500).json({ error: 'La oportunidad no tiene una carpeta de Drive configurada. Contacta con soporte.' });
        }

        // 2. Asegurar que existe la subcarpeta "12. DOCUMENTOS PARA CEE"
        console.log(`[Upload] Preparando subcarpeta en ${driveFolderId}...`);
        const subfolderId = await driveService.getOrCreateSubfolder(driveFolderId, "12. DOCUMENTOS PARA CEE");

        // 3. Resolver nombres finales con DOS fuentes:
        //    a) canonical_names[i] (campo body, parseado arriba) — prioridad alta
        //    b) file.originalname si ya empieza por FOTO_ (frontend lo renombró vía Content-Disposition)
        //    c) file.originalname tal cual (sin convención canónica)
        const resolveFileName = (file, i) => {
            const canonical = (canonicalNames[i] || '').trim();
            if (canonical) {
                const hasExt = /\.[a-z0-9]{2,5}$/i.test(canonical);
                if (hasExt) return canonical;
                const ext = inferExtension(file.originalname, file.mimetype);
                return `${canonical}.${ext}`;
            }
            return file.originalname;
        };

        // Log de diagnóstico para detectar problemas de parseo de canonical_names
        const finalNames = files.map((f, i) => resolveFileName(f, i));
        console.log(`[Upload] id=${id} canonical_names=${JSON.stringify(canonicalNames)} originalnames=${JSON.stringify(files.map(f => f.originalname))} finalnames=${JSON.stringify(finalNames)}`);

        // 4. Dedup: para cada fichero cuyo nombre final empiece por FOTO_ (canónico, vengan
        //    de canonical_names o de Content-Disposition), borrar versiones previas del mismo slot.
        await Promise.all(finalNames.map(async (finalName) => {
            if (!/^FOTO_/i.test(finalName)) return;
            const baseNoExt = finalName.replace(/\.[a-z0-9]{2,5}$/i, '');
            const existing = await driveService.listFilesByPrefix(subfolderId, baseNoExt);
            await Promise.all(existing.map(async (f) => {
                const fBase = f.name.replace(/\.[a-z0-9]{2,5}$/i, '');
                if (fBase.toUpperCase() === baseNoExt.toUpperCase()) {
                    console.log(`[Upload] Reemplazando archivo previo del slot: ${f.name} (${f.id})`);
                    await driveService.deleteFile(f.id);
                }
            }));
        }));

        // 5. Subir archivos en paralelo a Drive con el nombre resuelto
        const uploadPromises = files.map((file, i) => {
            return driveService.saveFileToFolder(
                subfolderId,
                finalNames[i],
                file.mimetype,
                file.buffer
            );
        });

        const results = await Promise.all(uploadPromises);
        const successCount = results.filter(r => r && r.id).length;

        console.log(`[Upload] Éxito: ${successCount}/${files.length} archivos subidos a Drive.`);

        if (successCount === 0) {
            return res.status(500).json({ error: 'Error al subir los archivos a Google Drive' });
        }

        res.json({
            success: true,
            message: `${successCount} archivos subidos correctamente.`,
            count: successCount
        });

    } catch (e) {
        console.error('Error public upload docs:', e);
        res.status(500).json({ error: 'Error interno al procesar la subida' });
    }
});

// ===========================================================================
// FLUJO /reforma — subida guiada por slots con enlace único + token
// ===========================================================================

// GET /api/public/reforma-thumb/:uuid/:driveId?token=&sz=400
// Proxy de miniatura: el navegador NO puede hotlinkear las URLs de Drive
// (lh3/thumbnail) de forma fiable desde la app, pero el backend sí. Servimos la
// imagen desde nuestro propio origen → el navegador siempre la carga. Cacheable.
router.get('/reforma-thumb/:uuid/:driveId', async (req, res) => {
    try {
        const { uuid, driveId } = req.params;
        const { token, sz } = req.query;
        const { data: opp } = await supabase
            .from('oportunidades').select('datos_calculo').eq('id', uuid).maybeSingle();
        if (!opp || opp.datos_calculo?.upload_token !== token) return res.status(403).end();

        const size = /^\d+$/.test(String(sz)) ? String(sz) : '400';
        const tryFetch = async (url) => {
            try {
                const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 9000, maxRedirects: 5, validateStatus: s => s === 200 });
                return { buf: Buffer.from(r.data), type: r.headers['content-type'] || 'image/jpeg' };
            } catch { return null; }
        };
        let img = await tryFetch(`https://lh3.googleusercontent.com/d/${driveId}=w${size}`);
        if (!img) img = await tryFetch(`https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}`);
        if (!img) {
            // Último recurso: bytes originales por la API de Drive (autenticada)
            const buf = await driveService.getFileContent(driveId);
            if (!buf) return res.status(404).end();
            img = { buf, type: 'image/jpeg' };
        }
        res.set('Content-Type', img.type);
        res.set('Cache-Control', 'private, max-age=86400');
        return res.send(img.buf);
    } catch (e) {
        console.error('[reforma-thumb]', e.message);
        return res.status(500).end();
    }
});

// GET /api/public/reforma-docs/:uuid?token= → valida token y devuelve slots+estado
router.get('/reforma-docs/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const { token } = req.query;
        const { data: opp } = await supabase
            .from('oportunidades')
            .select('id, id_oportunidad, referencia_cliente, datos_calculo')
            .eq('id', uuid)
            .maybeSingle();
        if (!opp) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (!token || opp.datos_calculo?.upload_token !== token) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }

        // Vista unificada (checklist + estado por foto + miniaturas + flag aceptada)
        return res.json(await reformaUploadService.buildDocsView(opp));
    } catch (e) {
        console.error('Error reforma-docs GET:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/public/reforma-docs/:uuid/:slot?token= → sube 1 fichero al slot
// requireAuth es NO bloqueante: si hay sesión (admin/instalador) marca subido_por
// en consecuencia; si solo hay token (cliente), subido_por = 'cliente'.
router.post('/reforma-docs/:uuid/:slot', requireAuth, uploadDocsSingle, async (req, res) => {
    try {
        const { uuid, slot } = req.params;
        const { token } = req.query;
        if (!req.file) return res.status(400).json({ error: 'No se ha recibido ningún archivo' });

        const { data: opp } = await supabase
            .from('oportunidades')
            .select('id, id_oportunidad, datos_calculo')
            .eq('id', uuid)
            .maybeSingle();
        if (!opp) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (!token || opp.datos_calculo?.upload_token !== token) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }

        const dc = opp.datos_calculo || {};
        const checklist = reformaUploadService.buildDocChecklist(dc);
        const slotDef = checklist.find(s => s.key === slot);
        if (!slotDef) return res.status(400).json({ error: 'Tipo de documento no válido' });

        // Asegurar carpeta del lead + subcarpeta destino (la crea si falta).
        // Las FACTURAS van TODAS a "5. FACTURAS" (mismo sitio que el alta del admin);
        // el resto de documentos/fotos a "12. DOCUMENTOS PARA CEE".
        const folderId = await reformaUploadService.ensureDriveFolder(uuid);
        const targetSub = slot === 'DOC_FACTURAS'
            ? reformaUploadService.SUBCARPETA_FACTURAS
            : reformaUploadService.SUBCARPETA_DOCS;
        // Facturas: búsqueda TOLERANTE (evita duplicar "5. FACTURAS" vs "5.FACTURAS").
        const subId = slot === 'DOC_FACTURAS'
            ? await driveService.getOrCreateSubfolderNormalized(folderId, targetSub)
            : await driveService.getOrCreateSubfolder(folderId, targetSub);

        // Nombre por slot-key (compatible con scan-photos del Anexo Fotográfico)
        const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const prev = Array.isArray(dc.reforma_uploads?.[slot]) ? dc.reforma_uploads[slot] : [];
        // Slots "named" (Otros…): el usuario da una etiqueta legible que se usa como
        // nombre del fichero en Drive → `SLOT__Etiqueta.ext` (reconciliable y reconocible).
        const rawLabel = (req.body?.label || '').toString().trim();
        let fileName;
        if (slotDef.named && rawLabel) {
            fileName = `${reformaUploadService.buildNamedFileBase(slot, rawLabel, prev)}.${ext}`;
        } else {
            fileName = slotDef.multiple ? `${slot}_${prev.length + 1}.${ext}` : `${slot}.${ext}`;
        }

        // Slot único: borrar versión previa en Drive para no acumular duplicados
        if (!slotDef.multiple) {
            try {
                const existing = await driveService.listFilesByPrefix(subId, slot);
                await Promise.all(existing.map(async (f) => {
                    const fBase = f.name.replace(/\.[a-z0-9]{2,5}$/i, '');
                    if (fBase.toUpperCase() === slot.toUpperCase()) await driveService.deleteFile(f.id);
                }));
            } catch (dErr) { console.warn('[Reforma] dedup slot único:', dErr.message); }
        }

        const saved = await driveService.saveFileToFolder(subId, fileName, req.file.mimetype, req.file.buffer);
        if (!saved?.id) return res.status(500).json({ error: 'Error al subir a Google Drive' });

        // Estado y autoría POR FOTO en la propia entrada de reforma_uploads
        const subidoPor = req.user ? (req.user.rol_nombre === 'ADMIN' ? 'admin' : 'instalador') : 'cliente';
        const entry = {
            name: fileName, link: saved.link, driveId: saved.id, at: new Date().toISOString(),
            estado: 'subida', subido_por: subidoPor, motivo: null
        };

        // Escritura ATÓMICA por slot (evita que subidas concurrentes se pisen)
        const { error: rpcErr } = await supabase.rpc('reforma_append', {
            p_id: uuid, p_slot: slot, p_entry: entry, p_multiple: !!slotDef.multiple
        });
        if (rpcErr) {
            console.error('[Reforma] rpc reforma_append:', rpcErr.message);
            return res.status(500).json({ error: 'No se pudo registrar la foto. Inténtalo de nuevo.' });
        }

        // RITE unificado: si es el Certificado RITE, refleja el enlace en el expediente
        // (cert_rite_drive_link) para que Documentación, CIFO y el agente lo vean.
        if (slot === 'DOC_RITE') reformaUploadService.syncRiteToExpediente(uuid, saved.link);
        // FACTURAS unificadas: crea la entrada en documentacion.facturas del expediente.
        if (slot === 'DOC_FACTURAS') reformaUploadService.addFacturaToExpediente(uuid, saved.link, saved.id);

        return res.json({
            success: true, slot, name: fileName, link: saved.link,
            label: slotDef.named ? reformaUploadService.parseOtrosLabel(fileName, slot) : null,
            driveId: saved.id,
            thumb: reformaUploadService.driveThumb(saved.id),
            estado: 'subida', count: (slotDef.multiple ? prev.length + 1 : 1)
        });
    } catch (e) {
        console.error('Error reforma-docs POST:', e);
        res.status(500).json({ error: 'Error interno al subir el archivo' });
    }
});

// DELETE /api/public/reforma-docs/:uuid/:slot?token=&name= → borra un fichero del slot
router.delete('/reforma-docs/:uuid/:slot', async (req, res) => {
    try {
        const { uuid, slot } = req.params;
        const { token, name, driveId } = req.query;
        if (!name && !driveId) return res.status(400).json({ error: 'Falta el identificador del archivo' });

        const { data: opp } = await supabase
            .from('oportunidades')
            .select('id, datos_calculo')
            .eq('id', uuid)
            .maybeSingle();
        if (!opp) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (!token || opp.datos_calculo?.upload_token !== token) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }

        const dc = opp.datos_calculo || {};
        const list = Array.isArray(dc.reforma_uploads?.[slot]) ? dc.reforma_uploads[slot] : [];

        // Borrar de Drive: por driveId (exacto, evita ambigüedad con nombres duplicados);
        // si no llega, fallback a la entrada de BD por nombre o búsqueda en la subcarpeta.
        try {
            const targetId = driveId || list.find(it => it.name === name)?.driveId;
            if (targetId) {
                await driveService.deleteFile(targetId);
            } else if (name) {
                const folderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
                if (folderId) {
                    const subName = slot === 'DOC_FACTURAS'
                        ? reformaUploadService.SUBCARPETA_FACTURAS
                        : reformaUploadService.SUBCARPETA_DOCS;
                    const subId = slot === 'DOC_FACTURAS'
                        ? await driveService.findSubfolderByNameNormalized(folderId, subName)
                        : await driveService.findSubfolderByName(folderId, subName);
                    const fid = subId ? await driveService.findFileByName(subId, name) : null;
                    if (fid) await driveService.deleteFile(fid);
                }
            }
        } catch (dErr) { console.warn('[Reforma] DELETE drive:', dErr.message); }

        // Filtrar la entrada de la BD por driveId (preferente) o por nombre
        const remaining = list.filter(it => (driveId ? it.driveId !== driveId : it.name !== name));

        // Escritura ATÓMICA por slot
        const { error: rpcErr } = await supabase.rpc('reforma_replace_slot', {
            p_id: uuid, p_slot: slot, p_array: remaining
        });
        if (rpcErr) {
            console.error('[Reforma] rpc reforma_replace_slot (delete):', rpcErr.message);
            return res.status(500).json({ error: 'No se pudo borrar el archivo.' });
        }

        // RITE unificado: al borrar el Certificado RITE, refleja el cambio en el
        // expediente (queda el siguiente si lo hubiera, o se limpia el campo).
        if (slot === 'DOC_RITE') reformaUploadService.syncRiteToExpediente(uuid, remaining[0]?.link || null);
        // FACTURAS unificadas: al borrar una factura del popup, quítala del expediente.
        if (slot === 'DOC_FACTURAS') {
            const rid = driveId || list.find(it => it.name === name)?.driveId;
            reformaUploadService.removeFacturaFromExpediente(uuid, rid);
        }

        return res.json({ success: true, slot, count: remaining.length, estado: remaining.length ? 'subida' : 'pendiente' });
    } catch (e) {
        console.error('Error reforma-docs DELETE:', e);
        res.status(500).json({ error: 'Error interno al borrar el archivo' });
    }
});

// ─── SUBIDA PÚBLICA DEL CEE REGISTRADO POR EL CERTIFICADOR ────────────────────
// Popup "similar al de fotos" con los slots del CEE (.xml/.cex/pdf firmado/
// registro/etiqueta). El enlace se envía en el "visto bueno" (approve-cee):
// una vez presentado en Industria, el certificador sube aquí el CEE registrado.
// Token = firma HMAC stateless (ceeUploadService.ceeUploadSignature).

// GET /api/public/cee-upload/:expedienteId?token=&phase=inicial|final → estado + slots
router.get('/cee-upload/:expedienteId', async (req, res) => {
    try {
        const { expedienteId } = req.params;
        const { token, phase } = req.query;
        const ph = phase === 'final' ? 'final' : 'inicial';
        if (!ceeUploadService.ceeUploadSignatureValid(expedienteId, ph, token)) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }

        const { data: exp } = await supabase.from('expedientes').select('*').eq('id', expedienteId).maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const driveFolderId = await ceeUploadService.resolveDriveFolderId(exp);
        const current = driveFolderId ? await ceeUploadService.scanCeeSection(driveFolderId, ph) : {};

        let cliente = '';
        if (exp.cliente_id) {
            const { data: cli } = await supabase.from('clientes')
                .select('nombre_razon_social, apellidos').eq('id_cliente', exp.cliente_id).maybeSingle();
            if (cli) cliente = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        }

        res.json({
            numero_expediente: exp.numero_expediente || expedienteId,
            phase: ph,
            phaseLabel: ph === 'final' ? 'CEE Final' : 'CEE Inicial',
            cliente,
            registrado: (exp.seguimiento?.[ph === 'final' ? 'cee_final' : 'cee_inicial']) === 'REGISTRADO',
            slots: ceeUploadService.CEE_SLOTS.map(s => ({
                id: s.id, label: s.label, accept: s.accept, current: current[s.id] || null
            })),
        });
    } catch (e) {
        console.error('[cee-upload GET]', e.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/public/cee-upload/:expedienteId/:slot?token=&phase= → sube 1 fichero
router.post('/cee-upload/:expedienteId/:slot', uploadDocsSingle, async (req, res) => {
    try {
        const { expedienteId, slot } = req.params;
        const { token, phase } = req.query;
        const ph = phase === 'final' ? 'final' : 'inicial';
        if (!ceeUploadService.ceeUploadSignatureValid(expedienteId, ph, token)) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }
        if (!req.file || !req.file.buffer?.length) {
            return res.status(400).json({ error: 'No se ha recibido ningún archivo' });
        }
        if (!ceeUploadService.CEE_SLOTS.find(s => s.id === slot)) {
            return res.status(400).json({ error: 'Tipo de documento no válido' });
        }

        const { data: exp } = await supabase.from('expedientes').select('*').eq('id', expedienteId).maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const driveFolderId = await ceeUploadService.resolveDriveFolderId(exp);
        if (!driveFolderId) return res.status(400).json({ error: 'El expediente no tiene carpeta de Drive' });

        const numExp = exp.numero_expediente || expedienteId;
        const uploaded = await ceeUploadService.uploadCeeFile(
            driveFolderId, ph, numExp, slot, req.file.buffer, req.file.mimetype
        );

        // Persistir el enlace en cee.cee_files[section][slot] (igual que la app).
        const sectionK = ph === 'final' ? 'final' : 'inicial';
        const cee = exp.cee || {};
        const ceeFiles = cee.cee_files || {};
        ceeFiles[sectionK] = { ...(ceeFiles[sectionK] || {}), [slot]: uploaded.link };
        cee.cee_files = ceeFiles;
        await supabase.from('expedientes').update({ cee, updated_at: new Date().toISOString() }).eq('id', expedienteId);

        // Al subir el REGISTRO → misma notificación/transición que la app.
        let registrado = false;
        if (slot === 'registro') {
            const r = await ceeUploadService.markCeeRegistradoFromUpload(exp, ph);
            registrado = !!r.ok;
        }

        res.json({ success: true, slot, link: uploaded.link, name: uploaded.fileName, registrado });
    } catch (e) {
        console.error('[cee-upload POST]', e.message);
        res.status(500).json({ error: e.message || 'Error interno al subir el archivo' });
    }
});

// POST /api/public/reforma-docs/:uuid/:slot/merge-pdf?token=
// Une las imágenes subidas en un slot (p.ej. las páginas fotografiadas del CEE
// existente) en un ÚNICO PDF (una imagen por página), lo sube a Drive con el
// nombre canónico {slot}.pdf y elimina las fotos sueltas. Idempotente: si se
// vuelve a pulsar, regenera el PDF con las imágenes que haya en ese momento.
// requireAuth NO bloqueante: marca subido_por (admin/instalador) o 'cliente' por token.
router.post('/reforma-docs/:uuid/:slot/merge-pdf', requireAuth, async (req, res) => {
    try {
        const { uuid, slot } = req.params;
        const { token } = req.query;

        const { data: opp } = await supabase
            .from('oportunidades')
            .select('id, id_oportunidad, datos_calculo')
            .eq('id', uuid)
            .maybeSingle();
        if (!opp) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (!token || opp.datos_calculo?.upload_token !== token) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }

        const dc = opp.datos_calculo || {};
        const checklist = reformaUploadService.buildDocChecklist(dc);
        const slotDef = checklist.find(s => s.key === slot);
        if (!slotDef) return res.status(400).json({ error: 'Tipo de documento no válido' });
        if (!slotDef.mergePdf) return res.status(400).json({ error: 'Este apartado no admite unir fotos en un PDF.' });

        // Fuente de verdad = Drive (regla nº 20). Listar las imágenes del slot en
        // "12. DOCUMENTOS PARA CEE" y ordenarlas por su sufijo numérico (_1, _2…).
        const folderId = await reformaUploadService.ensureDriveFolder(uuid);
        const subId = await driveService.getOrCreateSubfolder(folderId, reformaUploadService.SUBCARPETA_DOCS);
        const driveFiles = await driveService.listFiles(subId);
        const IMG_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
        const isImg = (f) => (f.mimeType || '').startsWith('image/') || IMG_EXT.test(f.name || '');
        const images = driveFiles
            .filter(f => reformaUploadService.fileBelongsToSlot(f.name, slot) && isImg(f))
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }));

        if (images.length < 1) {
            return res.status(400).json({ error: 'No hay fotos que unir en este apartado.' });
        }

        // Descargar y construir el PDF (una imagen por página).
        const buffers = [];
        for (const f of images) {
            // eslint-disable-next-line no-await-in-loop
            const buf = await driveService.getFileContent(f.id);
            if (buf && buf.length) buffers.push({ name: f.name, buffer: buf });
        }
        const { pdf, added, skipped } = await imagesToPdf(buffers);
        if (added === 0) {
            return res.status(422).json({ error: 'No pudimos leer las fotos (formato no compatible). Súbelas en JPG o PNG, o sube directamente el PDF.' });
        }

        // Subir el PDF unificado con nombre canónico (slot único → sin sufijo)
        const canonicalPdf = `${slot}.pdf`;
        const saved = await driveService.saveFileToFolder(subId, canonicalPdf, 'application/pdf', pdf);
        if (!saved?.id) return res.status(500).json({ error: 'No se pudo guardar el PDF en Drive.' });

        // Borrar las imágenes recién unidas + cualquier PDF canónico previo (re-merge),
        // pero nunca el que acabamos de subir.
        const toDelete = driveFiles.filter(f =>
            (reformaUploadService.fileBelongsToSlot(f.name, slot) && isImg(f)) ||
            (f.name === canonicalPdf && f.id !== saved.id)
        );
        await Promise.all(toDelete.map(f => driveService.deleteFile(f.id)
            .catch(e => console.warn('[Merge] borrar', f.name, e.message))));

        // Actualizar reforma_uploads del slot: conservar lo que NO hemos borrado + el nuevo PDF.
        const deletedSet = new Set(toDelete.map(f => f.id));
        const prev = Array.isArray(dc.reforma_uploads?.[slot]) ? dc.reforma_uploads[slot] : [];
        const kept = prev.filter(it => it.driveId && !deletedSet.has(it.driveId) && it.driveId !== saved.id);
        const subidoPor = req.user ? (req.user.rol_nombre === 'ADMIN' ? 'admin' : 'instalador') : 'cliente';
        const pdfEntry = {
            name: canonicalPdf, link: saved.link, driveId: saved.id, mimeType: 'application/pdf',
            at: new Date().toISOString(), estado: 'subida', subido_por: subidoPor, motivo: null
        };
        const { error: rpcErr } = await supabase.rpc('reforma_replace_slot', {
            p_id: uuid, p_slot: slot, p_array: [...kept, pdfEntry]
        });
        if (rpcErr) console.warn('[Merge] reforma_replace_slot:', rpcErr.message);

        return res.json({
            success: true, slot, name: canonicalPdf, link: saved.link, driveId: saved.id,
            pages: added, skipped,
            message: skipped > 0
                ? `Unidas ${added} foto(s) en un PDF. ${skipped} no se pudieron incluir (formato no compatible).`
                : `Unidas ${added} foto(s) en un único PDF.`
        });
    } catch (e) {
        console.error('Error reforma-docs merge-pdf:', e);
        res.status(500).json({ error: 'Error interno al unir las fotos en un PDF' });
    }
});

/**
 * Escanea la carpeta "12. DOCUMENTOS PARA CEE" buscando las fotos pre-cargadas
 * y devuelve su contenido en base64 para el Anexo Fotográfico.
 *
 * Matching por slot EXACTO o con sufijo numérico `_N` (vía fileBelongsToSlot), NO por
 * prefijo suelto. Así `FOTO_UNIDAD_EXTERIOR` no captura `FOTO_UNIDAD_EXTERIOR_PLACA*`.
 * Devuelve TODAS las fotos de cada slot: `photos[slot] = [{ name, data(base64) }, ...]`.
 *  - Nombres canónicos exactos: `FOTO_CALDERA_ANTES.jpeg`
 *  - Variantes con sufijo numérico: `FOTO_UNIDAD_EXTERIOR_1.jpg`, `FOTO_UNIDAD_EXTERIOR_2.jpg`
 *
 * Param opcional `?slots=KEY1,KEY2,...` para añadir/restringir slots a escanear.
 */
router.get('/scan-photos/:id', async (req, res) => {
    const { id: paramId } = req.params;
    try {
        const id = await resolveOportunidadId(paramId);

        const { data: opp, error: oppErr } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id_oportunidad', id)
            .maybeSingle();

        if (oppErr || !opp) {
            return res.status(404).json({ error: 'Oportunidad no encontrada' });
        }

        const driveFolderId = opp.datos_calculo?.drive_folder_id || opp.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.json({ success: true, photos: {} });

        const subfolderId = await driveService.findSubfolderByName(driveFolderId, "12. DOCUMENTOS PARA CEE");
        if (!subfolderId) return res.json({ success: true, photos: {} });

        // Slots por defecto (legacy + nuevos canónicos para los 6 huecos del Anexo Fotográfico)
        const DEFAULT_SLOTS = [
            'FOTO_CALDERA_ANTES',
            'FOTO_PLACA_CALDERA_ANTES',
            'FOTO_UNIDAD_EXTERIOR',
            'FOTO_UNIDAD_EXTERIOR_PLACA',
            'FOTO_UNIDAD_INTERIOR',
            'FOTO_UNIDAD_INTERIOR_PLACA'
        ];
        const extraSlots = String(req.query.slots || '')
            .split(',').map(s => s.trim()).filter(Boolean);
        const targetSlots = [...new Set([...DEFAULT_SLOTS, ...extraSlots])];

        const foundPhotos = {};

        const extToMime = (filename) => {
            const lastDot = filename.lastIndexOf('.');
            const ext = lastDot >= 0 ? filename.substring(lastDot + 1).toLowerCase() : '';
            const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
            return map[ext] || 'image/jpeg';
        };

        // Búsqueda paralela por slot. Por cada slot devolvemos TODAS sus fotos como ARRAY.
        // Filtramos con fileBelongsToSlot (nombre exacto o sufijo _N) para evitar el cruce
        // por prefijo: FOTO_UNIDAD_EXTERIOR NO debe capturar FOTO_UNIDAD_EXTERIOR_PLACA*.
        await Promise.all(targetSlots.map(async (slot) => {
            try {
                const candidates = await driveService.listFilesByPrefix(subfolderId, slot);
                const matches = (candidates || [])
                    .filter(f => reformaUploadService.fileBelongsToSlot(f.name, slot))
                    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }));
                if (!matches.length) return;
                const photos = [];
                for (const file of matches) {
                    // eslint-disable-next-line no-await-in-loop
                    const buffer = await driveService.getFileContent(file.id);
                    if (!buffer) continue;
                    let mimeType = file.mimeType;
                    if (!mimeType || !mimeType.startsWith('image/')) mimeType = extToMime(file.name);
                    photos.push({ name: file.name, data: `data:${mimeType};base64,${buffer.toString('base64')}` });
                }
                if (photos.length) {
                    console.log(`[ScanPhotos] Slot ${slot} -> ${photos.length} foto(s): ${matches.map(m => m.name).join(', ')}`);
                    foundPhotos[slot] = photos;
                }
            } catch (slotErr) {
                console.warn(`[ScanPhotos] Error procesando slot ${slot}:`, slotErr.message);
            }
        }));

        // Respuesta: photos[slot] = [{ name, data }, ...] (array; antes era un único objeto).
        res.json({ success: true, photos: foundPhotos });

    } catch (e) {
        console.error('Error scanning photos from Drive:', e);
        res.status(500).json({ error: 'Error al escanear fotos en Drive' });
    }
});

/**
 * GET /api/public/anexo-photos/:id
 * Fotos del Anexo Fotográfico, DINÁMICAS: una entrada por concepto que REALMENTE
 * tiene imagen en Drive (un concepto sin foto no aparece). En orden antes→después.
 *
 * Fuente única: los conceptos salen de buildDocChecklist(datos_calculo) (mismas
 * etiquetas/orden que el popup). Se incluyen los de la fase DESPUÉS (las actuaciones:
 * unidad exterior, placas, depósito ACS, caldera desmontada…) + el equipo de ANTES
 * (caldera, placa de caldera, ACS previo) para documentar el estado inicial. Se
 * omiten vídeos, documentos y catch-alls "otros". Imágenes en base64 listas para PDF.
 *
 * Respuesta: { success, groups: [{ key, label, fase, photos: [{ name, data }] }] }
 */
router.get('/anexo-photos/:id', async (req, res) => {
    try {
        const id = await resolveOportunidadId(req.params.id);
        const { data: opp, error } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id_oportunidad', id)
            .maybeSingle();
        if (error || !opp) return res.status(404).json({ error: 'Oportunidad no encontrada' });

        // Recopilación centralizada (misma lógica que usa la generación automática
        // server-side del anexo, en anexoFotograficoService).
        const { groups } = await anexoFotograficoService.collectPhotoGroups(opp.datos_calculo || {});
        console.log(`[AnexoPhotos] ${id}: ${groups.length} concepto(s) con foto`);
        res.json({ success: true, groups });
    } catch (e) {
        console.error('[AnexoPhotos] error:', e);
        res.status(500).json({ error: 'Error al recopilar fotos del anexo' });
    }
});

/**
 * GET /api/public/cifo-upload/:expedienteId
 * Devuelve info básica del expediente para la página pública de subida del CIFO firmado.
 */
router.get('/cifo-upload/:expedienteId', async (req, res) => {
    try {
        const { expedienteId } = req.params;
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, instalacion, clientes!cliente_id(nombre_razon_social, apellidos)')
            .eq('id', expedienteId)
            .maybeSingle();

        if (error || !exp) {
            console.error('[CIFO upload info] Query error:', error);
            return res.status(404).json({ error: 'Expediente no encontrado' });
        }

        // Resolver nombre del instalador desde el JSONB instalacion.instalador_id
        let instaladorNombre = '—';
        const instaladorId = exp.instalacion?.instalador_id;
        if (instaladorId) {
            const { data: pres } = await supabase
                .from('prescriptores')
                .select('razon_social')
                .eq('id_empresa', instaladorId)
                .maybeSingle();
            if (pres?.razon_social) instaladorNombre = pres.razon_social;
        }

        res.json({
            numero_expediente: exp.numero_expediente,
            cliente: [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—',
            instalador: instaladorNombre,
        });
    } catch (e) {
        console.error('[CIFO upload info] Error:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});

/**
 * GET /api/public/cifo-upload/:expedienteId/pdf
 * Devuelve el PDF BORRADOR del CIFO (documentacion.cert_cifo_drive_link) en base64
 * para que el instalador lo firme EN EL NAVEGADOR con Autofirma, sin descargarlo.
 */
router.get('/cifo-upload/:expedienteId/pdf', async (req, res) => {
    try {
        const { expedienteId } = req.params;
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, documentacion')
            .eq('id', expedienteId)
            .maybeSingle();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const draftLink = exp.documentacion?.cert_cifo_drive_link;
        if (!draftLink) return res.status(404).json({ error: 'Este expediente aún no tiene un CIFO generado para firmar' });

        const m = String(draftLink).match(/\/file\/d\/([A-Za-z0-9_-]+)/) || String(draftLink).match(/[?&]id=([A-Za-z0-9_-]+)/);
        const fileId = m ? m[1] : null;
        if (!fileId) return res.status(422).json({ error: 'No se pudo resolver el fichero del CIFO en Drive' });

        const { getFileContent } = require('../services/driveService');
        const buffer = await getFileContent(fileId);
        if (!buffer || !buffer.length) return res.status(502).json({ error: 'No se pudo descargar el CIFO desde Drive' });

        res.json({ pdf: Buffer.from(buffer).toString('base64') });
    } catch (e) {
        console.error('[cifo-upload/pdf] Error:', e);
        res.status(500).json({ error: 'Error interno al obtener el CIFO' });
    }
});

/**
 * POST /api/public/cifo-upload/:expedienteId
 * Recibe el PDF firmado del instalador, lo sube a Drive "6. ANEXOS CAE"
 * y guarda el link en expediente.documentacion.cifo_fdo_link.
 * Envía notificación al admin.
 */
router.post('/cifo-upload/:expedienteId', upload.single('cifo'), async (req, res) => {
    try {
        const { expedienteId } = req.params;

        if (!req.file) return res.status(400).json({ error: 'No se ha recibido ningún archivo' });

        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, documentacion, instalacion, clientes!cliente_id(nombre_razon_social, apellidos), oportunidades!oportunidad_id(datos_calculo)')
            .eq('id', expedienteId)
            .maybeSingle();

        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        // Resolver nombre del instalador desde el JSONB instalacion.instalador_id
        let instaladorNombre = '—';
        const instaladorId = exp.instalacion?.instalador_id;
        if (instaladorId) {
            const { data: pres } = await supabase
                .from('prescriptores')
                .select('razon_social')
                .eq('id_empresa', instaladorId)
                .maybeSingle();
            if (pres?.razon_social) instaladorNombre = pres.razon_social;
        }

        const driveFolderId = exp.oportunidades?.drive_folder_id || exp.oportunidades?.datos_calculo?.drive_folder_id || exp.oportunidades?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'El expediente no tiene carpeta Drive configurada' });

        const numexpte = exp.numero_expediente || expedienteId;
        const fileName = `${numexpte} - Certificado_CIFO_fdo.pdf`;

        // Subir a "6. ANEXOS CAE"
        const subfolderId = await driveService.getOrCreateSubfolder(driveFolderId, '6. ANEXOS CAE');
        const driveFile = await driveService.saveFileToFolder(subfolderId, fileName, req.file.mimetype, req.file.buffer);
        const fileLink = driveFile?.link || null;

        // Guardar link en cert_cifo_signed_link (mismo campo que usa DocumentacionModule)
        const currentDoc = exp.documentacion || {};
        await supabase.from('expedientes').update({
            documentacion: { ...currentDoc, cert_cifo_signed_link: fileLink }
        }).eq('id', expedienteId);

        res.json({ success: true, fileLink });

        // Notificaciones en background
        setImmediate(async () => {
            const instalador = instaladorNombre;
            const clienteNombre = [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—';
            const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
            const adminEmail = 'franciscojavier.moya.s2e2@gmail.com';

            const adminMsg = `✅ *CIFO firmado recibido*\nExpediente: *${numexpte}*\nInstalador: ${instalador}\nCliente: ${clienteNombre}${fileLink ? `\n\n🔗 ${fileLink}` : ''}`;

            try {
                if (adminPhone) await whatsappService.sendText(adminPhone, adminMsg);
            } catch (e) { console.error('[CIFO upload] WhatsApp notify error:', e.message); }

            try {
                await emailService.sendDocumentEmail({
                    to: adminEmail,
                    subject: `✅ CIFO firmado recibido — ${numexpte}`,
                    title: 'Nuevo CIFO firmado recibido',
                    message: `El instalador *${instalador}* ha subido el *Certificado CIFO firmado* del expediente *${numexpte}*.\n\nCliente: *${clienteNombre}*\n\nQueda pendiente de revisión por vuestra parte.`,
                    primaryLink: fileLink || null,
                    primaryLabel: '📄 Ver documento en Drive',
                    pill: { tone: 'success', text: 'CIFO firmado', emoji: '✅' },
                });
            } catch (e) { console.error('[CIFO upload] Email notify error:', e.message); }
        });

    } catch (e) {
        console.error('[CIFO upload] Error:', e);
        res.status(500).json({ error: 'Error al procesar la subida', message: e.message });
    }
});

// ─── RITE: subida pública por el instalador (memoria firmada + certificado) ───
// GET  /api/public/rite-upload/:expedienteId  → info del expediente para la página
// POST /api/public/rite-upload/:expedienteId  → sube memoria firmada y/o certificado RITE
router.get('/rite-upload/:expedienteId', async (req, res) => {
    try {
        const { expedienteId } = req.params;
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, documentacion, instalacion, clientes!cliente_id(nombre_razon_social, apellidos)')
            .eq('id', expedienteId)
            .maybeSingle();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        let instaladorNombre = '—';
        const instaladorId = exp.instalacion?.instalador_id;
        if (instaladorId) {
            const { data: pres } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', instaladorId).maybeSingle();
            if (pres?.razon_social) instaladorNombre = pres.razon_social;
        }
        res.json({
            numero_expediente: exp.numero_expediente,
            cliente: [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—',
            instalador: instaladorNombre,
            memoria_subida: !!(exp.documentacion?.cert_rite_signed_link),
            certificado_subido: !!(exp.documentacion?.cert_rite_drive_link),
        });
    } catch (e) {
        console.error('[RITE upload info] Error:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});

router.post('/rite-upload/:expedienteId',
    upload.fields([{ name: 'memoria', maxCount: 1 }, { name: 'certificado', maxCount: 1 }]),
    async (req, res) => {
        try {
            const { expedienteId } = req.params;
            const memFile = req.files?.memoria?.[0] || null;
            const certFile = req.files?.certificado?.[0] || null;
            if (!memFile && !certFile) return res.status(400).json({ error: 'No se ha recibido ningún archivo' });

            const { data: exp, error } = await supabase
                .from('expedientes')
                .select('id, numero_expediente, documentacion, instalacion, clientes!cliente_id(nombre_razon_social, apellidos), oportunidades!oportunidad_id(datos_calculo)')
                .eq('id', expedienteId)
                .maybeSingle();
            if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

            let instaladorNombre = '—';
            const instaladorId = exp.instalacion?.instalador_id;
            if (instaladorId) {
                const { data: pres } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', instaladorId).maybeSingle();
                if (pres?.razon_social) instaladorNombre = pres.razon_social;
            }

            const driveFolderId = exp.oportunidades?.drive_folder_id || exp.oportunidades?.datos_calculo?.drive_folder_id || exp.oportunidades?.datos_calculo?.inputs?.drive_folder_id;
            if (!driveFolderId) return res.status(400).json({ error: 'El expediente no tiene carpeta Drive configurada' });

            const numexpte = exp.numero_expediente || expedienteId;
            const subfolderId = await driveService.getOrCreateSubfolder(driveFolderId, '7. LEGALIZACION RITE');

            // Reemplaza el fichero si ya existía con ese nombre (evita duplicados al re-subir).
            const saveReplacing = async (name, mime, buffer) => {
                try {
                    const existing = await driveService.findFileByName(subfolderId, name);
                    if (existing) await driveService.deleteFile(existing);
                } catch (e) { console.warn('[RITE upload] no se pudo reemplazar previo:', e.message); }
                return driveService.saveFileToFolder(subfolderId, name, mime, buffer);
            };

            const docUpdate = { ...(exp.documentacion || {}) };
            let memoriaLink = null;
            let certLink = null;
            if (memFile) {
                const r = await saveReplacing(`${numexpte} - Memoria RITE_fdo.pdf`, memFile.mimetype, memFile.buffer);
                memoriaLink = r?.link || null;
                docUpdate.cert_rite_signed_link = memoriaLink;
                if (r?.id) try { await driveService.setFolderPublic(r.id, 'reader'); } catch (e) {}
            }
            if (certFile) {
                const r = await saveReplacing(`${numexpte} - Certificado RITE.pdf`, certFile.mimetype, certFile.buffer);
                certLink = r?.link || null;
                docUpdate.cert_rite_drive_link = certLink;   // → slot "Certificado RITE" (validación del agente)
                if (r?.id) try { await driveService.setFolderPublic(r.id, 'reader'); } catch (e) {}
            }

            await supabase.from('expedientes').update({ documentacion: docUpdate }).eq('id', expedienteId);

            res.json({ success: true, memoria_link: memoriaLink, certificado_link: certLink });

            // Notificación al admin (background)
            setImmediate(async () => {
                const clienteNombre = [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—';
                const partes = [memFile ? 'Memoria firmada' : null, certFile ? 'Certificado RITE' : null].filter(Boolean).join(' + ');
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
                const adminEmail = process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
                const msg = `✅ *Documentación RITE recibida*\nExpediente: *${numexpte}*\nInstalador: ${instaladorNombre}\nCliente: ${clienteNombre}\nRecibido: ${partes}`;
                try { if (adminPhone) await whatsappService.sendText(adminPhone, msg); } catch (e) { console.error('[RITE upload] WA notify:', e.message); }
                try {
                    await emailService.sendMail({
                        to: adminEmail,
                        subject: `✅ Documentación RITE recibida — ${numexpte}`,
                        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                            <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 28px;"><h2 style="margin:0;color:#fff;font-size:16px;">BROKERGY · Documentación RITE</h2></div>
                            <div style="padding:24px;background:#fff;">
                              <p>El instalador <strong>${instaladorNombre}</strong> ha subido <strong>${partes}</strong> del expediente <strong>${numexpte}</strong> (${clienteNombre}).</p>
                              ${certLink ? `<p><a href="${certLink}" style="color:#f59e0b;font-weight:bold;">Certificado RITE en Drive</a></p>` : ''}
                              ${memoriaLink ? `<p><a href="${memoriaLink}" style="color:#f59e0b;font-weight:bold;">Memoria firmada en Drive</a></p>` : ''}
                            </div></div>`
                    });
                } catch (e) { console.error('[RITE upload] Email notify:', e.message); }
            });
        } catch (e) {
            console.error('[RITE upload] Error:', e);
            res.status(500).json({ error: 'Error al procesar la subida', message: e.message });
        }
    });

// ─────────────────────────────────────────────────────────────────────────────
// FIRMA DE ANEXOS (cliente): el cliente sube el Anexo I firmado, el Anexo de
// Cesión de Ahorros firmado y la foto del DNI por ambas caras.
// Regla clave: si el Anexo de Cesión NO va firmado electrónicamente (es decir,
// firmado a mano y escaneado), el DNI (delantera + trasera) se ANEXA directamente
// al final del PDF de la Cesión. Si va firmado electrónicamente, el DNI se guarda
// aparte (la firma electrónica ya acredita la identidad).
// ─────────────────────────────────────────────────────────────────────────────
// Construye el bloque de datos del cliente + qué falta (mismo set que la propuesta:
// email, DNI/CIF, IBAN/nº de cuenta y justificante de titularidad bancaria).
function buildDatosCliente(cli, doc) {
    cli = cli || {}; doc = doc || {};
    const notif = cli.notificaciones_contacto_activas === true;
    // Prefill: el campo "efectivo" según preferencia, con fallback al otro.
    const email = (notif ? cli.persona_contacto_email : cli.email) || cli.email || cli.persona_contacto_email || '';
    const tlf = (notif ? cli.persona_contacto_tlf : cli.tlf) || cli.tlf || cli.persona_contacto_tlf || '';
    const dni = cli.dni || '';
    const iban = cli.numero_cuenta || '';
    const justificante = doc.justificante_titularidad_link || '';
    const ibanIncompleto = !iban || String(iban).includes('_');
    return {
        nombre_razon_social: cli.nombre_razon_social || '',
        apellidos: cli.apellidos || '',
        email,
        telefono: tlf,
        dni,
        iban,
        notificaciones_contacto_activas: notif,
        // Falta solo si NO hay dato en ninguno de los campos posibles.
        falta_email: !(cli.email || cli.persona_contacto_email),
        falta_dni: !dni,
        falta_iban: ibanIncompleto,
        justificante_subido: !!justificante,
        falta_justificante: !justificante,
    };
}

router.get('/anexos-upload/:expedienteId', async (req, res) => {
    try {
        const { expedienteId } = req.params;
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, documentacion, clientes!cliente_id(nombre_razon_social, apellidos, email, tlf, dni, numero_cuenta, notificaciones_contacto_activas, persona_contacto_email, persona_contacto_tlf)')
            .eq('id', expedienteId)
            .maybeSingle();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        const doc = exp.documentacion || {};
        res.json({
            numero_expediente: exp.numero_expediente,
            cliente: [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—',
            // qué documentos se enviaron / esperamos de vuelta
            anexo_i_pedido: !!(doc.anexo_i_drive_link || doc.anexo_i_sent_at),
            anexo_cesion_pedido: !!(doc.anexo_cesion_drive_link || doc.anexo_cesion_sent_at),
            // anexos YA generados (borrador en Drive) → descargables
            anexo_i_disponible: !!doc.anexo_i_drive_link,
            anexo_cesion_disponible: !!doc.anexo_cesion_drive_link,
            // anexos ENVIADOS al cliente → habilitan la fase de firma (aunque no estén en Drive)
            anexo_i_enviado: !!doc.anexo_i_sent_at,
            anexo_cesion_enviado: !!doc.anexo_cesion_sent_at,
            // qué ya hemos recibido firmado
            anexo_i_firmado: !!doc.anexo_i_signed_link,
            anexo_cesion_firmado: !!doc.anexo_cesion_signed_link,
            dni_subido: !!(doc.dni_frontal_link && doc.dni_trasero_link),
            // datos del cliente + qué falta por completar
            datos_cliente: buildDatosCliente(exp.clientes, doc),
        });
    } catch (e) {
        console.error('[anexos-upload info] Error:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});

// El cliente completa sus datos (email, DNI/CIF, IBAN) y sube el justificante de
// titularidad bancaria. Misma información que se pide al aceptar la propuesta,
// para los casos en que no se rellenó entonces.
router.post('/anexos-datos/:expedienteId',
    upload.single('justificante'),
    async (req, res) => {
        try {
            const { expedienteId } = req.params;
            const b = req.body || {};
            const { data: exp, error } = await supabase
                .from('expedientes')
                .select('id, numero_expediente, cliente_id, documentacion, clientes!cliente_id(id_cliente, notificaciones_contacto_activas), oportunidades!oportunidad_id(datos_calculo)')
                .eq('id', expedienteId)
                .maybeSingle();
            if (error) console.error('[anexos-datos] select error:', error.message);
            if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
            const idCliente = exp.clientes?.id_cliente || exp.cliente_id;
            if (!idCliente) return res.status(400).json({ error: 'El expediente no tiene cliente asociado.' });

            // Email/teléfono van a los campos principales o a los de "persona de
            // contacto" según la preferencia del cliente (igual que la propuesta).
            const notif = exp.clientes?.notificaciones_contacto_activas === true;
            const clienteUpdate = {};
            if (b.nombre_razon_social != null && b.nombre_razon_social !== '') clienteUpdate.nombre_razon_social = b.nombre_razon_social.trim();
            if (b.apellidos != null) clienteUpdate.apellidos = b.apellidos.trim() || null;
            if (b.dni_cif != null && b.dni_cif !== '') clienteUpdate.dni = b.dni_cif.trim().toUpperCase();
            if (b.iban != null && b.iban !== '') clienteUpdate.numero_cuenta = b.iban.replace(/\s+/g, '').toUpperCase();
            if (b.email != null && b.email !== '') {
                if (notif) clienteUpdate.persona_contacto_email = b.email.trim().toLowerCase();
                else clienteUpdate.email = b.email.trim().toLowerCase();
            }
            if (b.telefono != null && b.telefono !== '') {
                if (notif) clienteUpdate.persona_contacto_tlf = b.telefono.trim();
                else clienteUpdate.tlf = b.telefono.trim();
            }

            if (Object.keys(clienteUpdate).length) {
                const { error: upErr } = await supabase.from('clientes').update(clienteUpdate).eq('id_cliente', idCliente);
                if (upErr) {
                    if (upErr.code === '23505') return res.status(409).json({ error: 'Ese DNI/CIF ya está registrado con otro cliente.' });
                    console.error('[anexos-datos] update cliente:', upErr.message);
                    return res.status(500).json({ error: 'No se pudieron guardar los datos.' });
                }
            }

            // Justificante de titularidad bancaria → carpeta raíz del expediente en Drive.
            const docUpdate = { ...(exp.documentacion || {}) };
            if (req.file) {
                const driveFolderId = exp.oportunidades?.drive_folder_id || exp.oportunidades?.datos_calculo?.drive_folder_id || exp.oportunidades?.datos_calculo?.inputs?.drive_folder_id;
                if (driveFolderId) {
                    let buf = req.file.buffer;
                    if (req.file.mimetype !== 'application/pdf') buf = await imageToPdf(buf, req.file.mimetype);
                    try {
                        const existing = await driveService.findFileByName(driveFolderId, 'justificante de titularidad bancaria.pdf');
                        if (existing) await driveService.deleteFile(existing);
                    } catch (e) {}
                    const r = await driveService.saveFileToFolder(driveFolderId, 'justificante de titularidad bancaria.pdf', 'application/pdf', buf);
                    if (r?.link) {
                        docUpdate.justificante_titularidad_link = r.link;
                        if (r?.id) { try { await driveService.setFolderPublic(r.id, 'reader'); } catch (e) {} }
                    }
                }
            }
            if (docUpdate.justificante_titularidad_link !== (exp.documentacion || {}).justificante_titularidad_link) {
                await supabase.from('expedientes').update({ documentacion: docUpdate }).eq('id', expedienteId);
            }

            // Releer cliente para devolver el estado actualizado de "qué falta".
            const { data: cliFresh } = await supabase
                .from('clientes')
                .select('nombre_razon_social, apellidos, email, tlf, dni, numero_cuenta, notificaciones_contacto_activas, persona_contacto_email, persona_contacto_tlf')
                .eq('id_cliente', idCliente)
                .maybeSingle();
            res.json({ success: true, datos_cliente: buildDatosCliente(cliFresh, docUpdate) });

            // Notificación al admin (background)
            setImmediate(async () => {
                const numexpte = exp.numero_expediente || expedienteId;
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
                const adminEmail = process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
                const partes = [
                    clienteUpdate.email || clienteUpdate.persona_contacto_email ? 'email' : null,
                    clienteUpdate.tlf || clienteUpdate.persona_contacto_tlf ? 'teléfono' : null,
                    clienteUpdate.dni ? 'DNI/CIF' : null,
                    clienteUpdate.numero_cuenta ? 'IBAN' : null,
                    req.file ? 'justificante bancario' : null,
                ].filter(Boolean).join(' + ') || 'datos';
                const msg = `📝 *Datos del cliente completados*\nExpediente: *${numexpte}*\nActualizado: ${partes}\n\n👉 Ya puedes *generar y enviar los anexos* al cliente para que los firme.`;
                try { if (adminPhone) await whatsappService.sendText(adminPhone, msg); } catch (e) {}
                try {
                    await emailService.sendMail({
                        to: adminEmail,
                        subject: `📝 Datos completados — ${numexpte} · listo para enviar anexos`,
                        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 28px;"><h2 style="margin:0;color:#fff;font-size:16px;">BROKERGY · Datos del cliente</h2></div><div style="padding:24px;background:#fff;"><p>El cliente ha completado sus datos del expediente <strong>${numexpte}</strong>: <strong>${partes}</strong>.</p><p style="margin-top:12px;"><strong>👉 Ya puedes generar y enviar los anexos</strong> al cliente para que los firme.</p></div></div>`,
                    });
                } catch (e) {}
            });
        } catch (e) {
            console.error('[anexos-datos] Error:', e);
            res.status(500).json({ error: 'Error al guardar los datos', message: e.message });
        }
    });

router.post('/anexos-upload/:expedienteId',
    upload.fields([
        { name: 'anexo_i', maxCount: 1 },
        { name: 'anexo_cesion', maxCount: 1 },
        { name: 'dni_frontal', maxCount: 1 },
        { name: 'dni_trasero', maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const { expedienteId } = req.params;
            const cesionFirma = (req.body?.cesion_firma || '').toLowerCase() === 'electronica' ? 'electronica' : 'manuscrita';
            const anexoIFile   = req.files?.anexo_i?.[0] || null;
            const cesionFile   = req.files?.anexo_cesion?.[0] || null;
            const dniFrontFile = req.files?.dni_frontal?.[0] || null;
            const dniBackFile  = req.files?.dni_trasero?.[0] || null;

            if (!anexoIFile && !cesionFile && !dniFrontFile && !dniBackFile) {
                return res.status(400).json({ error: 'No se ha recibido ningún archivo' });
            }
            // Si la Cesión es manuscrita, necesitamos el DNI por ambas caras para anexarlo.
            if (cesionFile && cesionFirma === 'manuscrita' && (!dniFrontFile || !dniBackFile)) {
                return res.status(400).json({ error: 'Para una firma manuscrita del Anexo de Cesión necesitamos la foto del DNI por la cara delantera y la trasera.' });
            }

            const { data: exp, error } = await supabase
                .from('expedientes')
                .select('id, numero_expediente, documentacion, clientes!cliente_id(nombre_razon_social, apellidos), oportunidades!oportunidad_id(datos_calculo)')
                .eq('id', expedienteId)
                .maybeSingle();
            if (error) console.error('[anexos-upload] select error:', error.message);
            if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

            const driveFolderId = exp.oportunidades?.datos_calculo?.drive_folder_id || exp.oportunidades?.datos_calculo?.inputs?.drive_folder_id;
            if (!driveFolderId) return res.status(400).json({ error: 'El expediente no tiene carpeta Drive configurada' });

            const numexpte = exp.numero_expediente || expedienteId;
            const subfolderId = await driveService.getOrCreateSubfolder(driveFolderId, '6. ANEXOS CAE');

            // PDF de un fichero subido (los anexos/DNI pueden venir como imagen o PDF).
            const toPdfBuffer = async (file) => {
                if (!file) return null;
                if (file.mimetype === 'application/pdf') return file.buffer;
                if ((file.mimetype || '').startsWith('image/')) return imageToPdf(file.buffer, file.mimetype);
                // Desconocido: intentamos tratarlo como PDF.
                return file.buffer;
            };
            const saveReplacing = async (name, buffer) => {
                try {
                    const existing = await driveService.findFileByName(subfolderId, name);
                    if (existing) await driveService.deleteFile(existing);
                } catch (e) { console.warn('[anexos-upload] no se pudo reemplazar previo:', e.message); }
                const r = await driveService.saveFileToFolder(subfolderId, name, 'application/pdf', buffer);
                if (r?.id) { try { await driveService.setFolderPublic(r.id, 'reader'); } catch (e) {} }
                return r;
            };

            const docUpdate = { ...(exp.documentacion || {}) };
            const recibido = [];

            // Anexo I firmado
            if (anexoIFile) {
                const buf = await toPdfBuffer(anexoIFile);
                const r = await saveReplacing(`${numexpte} - Anexo I_fdo.pdf`, buf);
                if (r?.link) { docUpdate.anexo_i_signed_link = r.link; recibido.push('Anexo I firmado'); }
            }

            // DNI (delantera + trasera) → UNA sola página (delante arriba, detrás abajo).
            let dniOnePage = null, dniFrontPdf = null, dniBackPdf = null;
            if (dniFrontFile && dniBackFile) {
                dniOnePage = await dniTwoSidesOnePage(dniFrontFile.buffer, dniBackFile.buffer);
            }
            if (dniOnePage) {
                const r = await saveReplacing(`${numexpte} - DNI.pdf`, dniOnePage);
                if (r?.link) { docUpdate.dni_link = r.link; }
                // Borrar posibles ficheros antiguos con las caras sueltas.
                try {
                    for (const old of [`${numexpte} - DNI_frontal.pdf`, `${numexpte} - DNI_trasero.pdf`]) {
                        const ex = await driveService.findFileByName(subfolderId, old);
                        if (ex) await driveService.deleteFile(ex);
                    }
                } catch (e) { }
                recibido.push('Foto del DNI');
            } else {
                // Fallback (p. ej. si una cara viene como PDF/HEIC): caras sueltas como antes.
                if (dniFrontFile) { dniFrontPdf = await toPdfBuffer(dniFrontFile); const r = await saveReplacing(`${numexpte} - DNI_frontal.pdf`, dniFrontPdf); if (r?.link) docUpdate.dni_frontal_link = r.link; }
                if (dniBackFile) { dniBackPdf = await toPdfBuffer(dniBackFile); const r = await saveReplacing(`${numexpte} - DNI_trasero.pdf`, dniBackPdf); if (r?.link) docUpdate.dni_trasero_link = r.link; }
                if (dniFrontFile || dniBackFile) recibido.push('Foto del DNI');
            }

            // Anexo de Cesión firmado
            if (cesionFile) {
                let cesionPdf = await toPdfBuffer(cesionFile);
                docUpdate.anexo_cesion_firma_tipo = cesionFirma;
                if (cesionFirma === 'manuscrita') {
                    // Anexar: DNI del cliente (1 página) + DNI del representante de Brokergy.
                    const annexes = [];
                    if (dniOnePage) annexes.push(dniOnePage);
                    else { if (dniFrontPdf) annexes.push(dniFrontPdf); if (dniBackPdf) annexes.push(dniBackPdf); }
                    const rep = readRepresentanteDni();
                    if (rep) {
                        try {
                            annexes.push(rep.ext === 'pdf' ? rep.buffer : await imageToPdf(rep.buffer, rep.ext === 'png' ? 'image/png' : 'image/jpeg'));
                        } catch (e) { console.warn('[anexos-upload] DNI representante no anexable:', e.message); }
                    }
                    if (annexes.length) cesionPdf = await mergePdfs(cesionPdf, annexes);
                }
                const r = await saveReplacing(`${numexpte} - Anexo Cesión ahorro_fdo.pdf`, cesionPdf);
                if (r?.link) {
                    docUpdate.anexo_cesion_signed_link = r.link;
                    // Firma electrónica: el cliente firma primero, falta la contrafirma de
                    // Brokergy (segunda firma digital) antes de poder validar/auditar.
                    // Firma manuscrita: el PDF escaneado ya lleva ambas firmas físicas (más el
                    // DNI anexado) — no hace falta ninguna firma digital adicional de Brokergy.
                    docUpdate.cesion_firmado_brokergy = cesionFirma !== 'electronica';
                    recibido.push(cesionFirma === 'manuscrita' ? 'Anexo de Cesión firmado (con DNI anexado)' : 'Anexo de Cesión firmado (firma electrónica)');
                }
            }

            await supabase.from('expedientes').update({ documentacion: docUpdate }).eq('id', expedienteId);

            res.json({ success: true, recibido });

            // Notificación al admin (background)
            setImmediate(async () => {
                const clienteNombre = [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—';
                const partes = recibido.join(' + ') || 'documentación';
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
                const adminEmail = process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
                const msg = `✅ *Anexos firmados recibidos*\nExpediente: *${numexpte}*\nCliente: ${clienteNombre}\nRecibido: ${partes}`;
                try { if (adminPhone) await whatsappService.sendText(adminPhone, msg); } catch (e) { console.error('[anexos-upload] WA notify:', e.message); }
                try {
                    await emailService.sendMail({
                        to: adminEmail,
                        subject: `✅ Anexos firmados recibidos — ${numexpte}`,
                        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                            <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 28px;"><h2 style="margin:0;color:#fff;font-size:16px;">BROKERGY · Anexos firmados</h2></div>
                            <div style="padding:24px;background:#fff;">
                              <p>El cliente <strong>${clienteNombre}</strong> ha subido <strong>${partes}</strong> del expediente <strong>${numexpte}</strong>.</p>
                              ${docUpdate.anexo_cesion_signed_link ? `<p><a href="${docUpdate.anexo_cesion_signed_link}" style="color:#f59e0b;font-weight:bold;">Anexo de Cesión firmado en Drive</a></p>` : ''}
                              ${docUpdate.anexo_i_signed_link ? `<p><a href="${docUpdate.anexo_i_signed_link}" style="color:#f59e0b;font-weight:bold;">Anexo I firmado en Drive</a></p>` : ''}
                            </div></div>`
                    });
                } catch (e) { console.error('[anexos-upload] Email notify:', e.message); }
            });
        } catch (e) {
            console.error('[anexos-upload] Error:', e);
            res.status(500).json({ error: 'Error al procesar la subida', message: e.message });
        }
    });

// Descarga (proxy) del PDF del anexo generado para que el cliente lo firme.
// Sirve el contenido desde Drive vía la cuenta de servicio (no depende de que el
// fichero sea público). doc ∈ anexo_i | cesion.
router.get('/anexos-upload/:expedienteId/descargar/:doc', async (req, res) => {
    try {
        const { expedienteId, doc } = req.params;
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('numero_expediente, documentacion')
            .eq('id', expedienteId)
            .maybeSingle();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        const d = exp.documentacion || {};
        const link = doc === 'anexo_i' ? d.anexo_i_drive_link : doc === 'cesion' ? d.anexo_cesion_drive_link : null;
        if (!link) return res.status(404).json({ error: 'Documento no disponible' });
        const fileId = (String(link).match(/[-\w]{25,}/) || [])[0];
        if (!fileId) return res.status(400).json({ error: 'Enlace no válido' });
        const { getFileContent } = require('../services/driveService');
        const buf = await getFileContent(fileId);
        if (!buf || !buf.length) return res.status(404).json({ error: 'No se pudo obtener el documento' });
        const fname = doc === 'anexo_i' ? `${exp.numero_expediente} - Anexo I.pdf` : `${exp.numero_expediente} - Anexo Cesion.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
        res.send(buf);
    } catch (e) {
        console.error('[anexos descargar] Error:', e.message);
        res.status(500).json({ error: 'Error al descargar el documento' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// FIRMA EN CADENA DEL LOTE POR EL SUJETO OBLIGADO — /firmar-lote/:loteId
// El S.O. recibe el enlace en el email de "Enviar al S.O." y firma en cadena con
// su certificado (Autofirma) los documentos del lote (Anexo I + fichas RES +
// Solicitud de Verificación). Los borradores viven en la carpeta del lote en Drive
// (lotes.documentos_so). El id del lote (UUID) es el secreto del enlace (mismo
// patrón que /firmar-anexos y /subir-cifo). Cada firma se guarda al instante.
// ─────────────────────────────────────────────────────────────────────────────

// Extrae el fileId de Drive de un enlace o lo devuelve tal cual si ya es un id.
function driveFileIdFrom(entry) {
    if (entry?.draft_file_id) return entry.draft_file_id;
    const m = String(entry?.draft_link || '').match(/[-\w]{25,}/);
    return m ? m[0] : null;
}

// GET estado de firma del lote (documentos + flags de disponible/firmado).
router.get('/lote-firma/:loteId', async (req, res) => {
    try {
        const { data: lote, error } = await supabase
            .from('lotes').select('id, codigo, sujeto_obligado_id, documentos_so').eq('id', req.params.loteId).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });

        let soNombre = null, representante = null;
        if (lote.sujeto_obligado_id) {
            const { data: so } = await supabase.from('prescriptores')
                .select('razon_social, nombre_responsable, apellidos_responsable').eq('id_empresa', lote.sujeto_obligado_id).maybeSingle();
            if (so) {
                soNombre = so.razon_social || null;
                representante = [so.nombre_responsable, so.apellidos_responsable].filter(Boolean).join(' ') || null;
            }
        }
        const docs = (Array.isArray(lote.documentos_so) ? lote.documentos_so : []).map(d => ({
            key: d.key, label: d.label, tipo: d.tipo, expediente_id: d.expediente_id || null,
            anchor: d.anchor || null,
            fixedBox: d.fixedBox || null,
            disponible: !!driveFileIdFrom(d),
            firmado: !!d.signed_link,
        }));
        const total = docs.length;
        const firmados = docs.filter(d => d.firmado).length;
        res.json({
            codigo: lote.codigo, sujeto_obligado: soNombre, representante,
            docs, total, firmados, todos_firmados: total > 0 && firmados === total,
        });
    } catch (e) {
        console.error('[lote-firma estado] Error:', e.message);
        res.status(500).json({ error: 'Error al cargar el lote' });
    }
});

// GET descarga (proxy) del borrador de un documento del lote desde Drive.
router.get('/lote-firma/:loteId/descargar/:docKey', async (req, res) => {
    try {
        const { loteId, docKey } = req.params;
        const { data: lote, error } = await supabase
            .from('lotes').select('documentos_so').eq('id', loteId).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });
        const entry = (lote.documentos_so || []).find(d => d.key === docKey);
        if (!entry) return res.status(404).json({ error: 'Documento no encontrado' });
        const fileId = driveFileIdFrom(entry);
        if (!fileId) return res.status(404).json({ error: 'Documento no disponible' });
        const buf = await driveService.getFileContent(fileId);
        if (!buf || !buf.length) return res.status(404).json({ error: 'No se pudo obtener el documento' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${(entry.file_name || 'documento.pdf').replace(/"/g, '')}"`);
        res.send(buf);
    } catch (e) {
        console.error('[lote-firma descargar] Error:', e.message);
        res.status(500).json({ error: 'Error al descargar el documento' });
    }
});

// POST recibe UN documento firmado (base64) y lo guarda en la carpeta del lote.
// La firma en cadena del frontend llama a este endpoint tras cada firma → progreso
// parcial guardado (si el S.O. firma 4 de 7 y para, esos 4 quedan guardados).
router.post('/lote-firma/:loteId/firmar', async (req, res) => {
    try {
        const { loteId } = req.params;
        const { docKey, signedPdfBase64 } = req.body || {};
        if (!docKey || !signedPdfBase64) return res.status(400).json({ error: 'Faltan docKey o el PDF firmado' });

        const { data: lote, error } = await supabase
            .from('lotes').select('id, codigo, drive_folder_id, documentos_so, historial, sujeto_obligado_id').eq('id', loteId).maybeSingle();
        if (error || !lote) return res.status(404).json({ error: 'Lote no encontrado' });
        if (!lote.drive_folder_id) return res.status(409).json({ error: 'El lote no tiene carpeta de Drive' });

        const docsSo = Array.isArray(lote.documentos_so) ? [...lote.documentos_so] : [];
        const idx = docsSo.findIndex(d => d.key === docKey);
        if (idx < 0) return res.status(404).json({ error: 'Documento no encontrado en el lote' });

        const buf = Buffer.from(signedPdfBase64, 'base64');
        if (buf.length < 5 || buf[0] !== 0x25 || buf[1] !== 0x50) { // %P
            return res.status(400).json({ error: 'El fichero firmado no es un PDF válido' });
        }

        const base = String(docsSo[idx].file_name || docsSo[idx].label || docKey).replace(/\.pdf$/i, '').replace(/[\\/<>:"|?*]/g, '_');
        const fileName = `${base}_fdo.pdf`;
        // Carpeta destino del FIRMADO: si el documento pertenece a un expediente (ficha),
        // va a su carpeta "10. EXPEDIENTE CAE"; si es de lote (Anexo I / Solicitud), a la del lote.
        let signedFolder = lote.drive_folder_id;
        if (docsSo[idx].exp_folder_id) {
            signedFolder = await driveService.getOrCreateSubfolder(docsSo[idx].exp_folder_id, '10. EXPEDIENTE CAE') || lote.drive_folder_id;
        }
        try {
            const prev = await driveService.findFileByName(signedFolder, fileName);
            if (prev) await driveService.deleteFile(prev);
        } catch (_) { /* no bloqueante */ }
        const saved = await driveService.saveFileToFolder(signedFolder, fileName, 'application/pdf', buf);
        if (!saved) throw new Error('No se pudo guardar el documento firmado en Drive');

        docsSo[idx] = { ...docsSo[idx], signed_link: saved.link, signed_file_id: saved.id || null, signed_at: new Date().toISOString() };
        const todosFirmados = docsSo.length > 0 && docsSo.every(d => d.signed_link);

        const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
        historial.push({
            id: `${Date.now()}_firma_so`, tipo: 'sistema',
            texto: `S.O. firmó "${docsSo[idx].label || docKey}"${todosFirmados ? ' — TODOS los documentos firmados' : ` (${docsSo.filter(d => d.signed_link).length}/${docsSo.length})`}.`,
            fecha: new Date().toISOString(), usuario: 'Sujeto Obligado',
        });
        await supabase.from('lotes').update({ documentos_so: docsSo, historial, updated_at: new Date().toISOString() }).eq('id', lote.id);

        // Al completar todas las firmas, avisar al admin (background).
        if (todosFirmados) {
            setImmediate(async () => {
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
                const adminEmail = process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
                const msg = `✅ *Lote firmado por el S.O.*\nLote: *${lote.codigo || lote.id}*\nEl Sujeto Obligado ha firmado los ${docsSo.length} documentos (Anexo I + fichas + solicitud). Ya están en la carpeta del lote en Drive.`;
                try { if (adminPhone) await whatsappService.sendText(adminPhone, msg); } catch (e) {}
                try {
                    await emailService.sendMail({
                        to: adminEmail,
                        subject: `✅ Lote ${lote.codigo || ''} firmado por el S.O.`,
                        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 28px;"><h2 style="margin:0;color:#fff;font-size:16px;">BROKERGY · Lote firmado</h2></div><div style="padding:24px;background:#fff;"><p>El Sujeto Obligado ha firmado <strong>todos</strong> los documentos del lote <strong>${lote.codigo || lote.id}</strong> (${docsSo.length} documentos).</p><p style="margin-top:12px;">Los firmados están en la carpeta del lote en Drive. Ya puedes continuar con el envío al verificador.</p></div></div>`,
                    });
                } catch (e) {}
            });
        }

        res.json({ ok: true, todos_firmados: todosFirmados, firmados: docsSo.filter(d => d.signed_link).length, total: docsSo.length });
    } catch (e) {
        console.error('[lote-firma firmar] Error:', e.message);
        res.status(500).json({ error: e.message || 'Error al guardar el documento firmado' });
    }
});

module.exports = router;
