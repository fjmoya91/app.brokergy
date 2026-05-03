const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const emailService = require('../services/emailService');
const expedienteService = require('../services/expedienteService');
const whatsappService = require('../services/whatsappService');
const driveService = require('../services/driveService');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');

// Configuración de multer (memoria para subida directa a Drive)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB para justificante
});

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

        return res.json({
            id_oportunidad: id,
            id_cliente: foundCliente?.id_cliente || null,
            nombre_razon_social: foundCliente?.nombre_razon_social || nombre,
            apellidos: foundCliente?.apellidos || apellidos,
            dni_cif: foundCliente?.dni || '',
            email: foundCliente?.email || '',
            telefono: foundCliente?.tlf || '',
            iban: foundCliente?.numero_cuenta || '',
            estado: opp.datos_calculo?.estado || 'BORRADOR',
            numero_expediente: opp.expedientes?.[0]?.numero_expediente || opp.expedientes?.numero_expediente || null,
            tiene_instalador: true,
            fecha_aceptacion: acceptanceEntry?.fecha || null,
            aceptado_por: acceptanceEntry?.usuario || null,
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
            email: formFields.email,
            tlf: formFields.telefono,
            numero_cuenta: formFields.iban || null,
            prescriptor_id: opp.prescriptor_id // Mantenemos el partner asociado a la oportunidad
        };

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

        if (prevEstado !== 'ACEPTADA') {
            const clienteNombre = [formFields.nombre_razon_social, formFields.apellidos].filter(Boolean).join(' ');
            const newHistorial = [...currentHistorial, {
                id: Date.now().toString() + '_aceptacion',
                tipo: 'cambio_estado',
                estado: 'ACEPTADA',
                fecha: new Date().toISOString(),
                usuario: `Firma Cliente (${clienteNombre})`
            }];
            
            const newData = { ...(opp.datos_calculo || {}), estado: 'ACEPTADA', historial: newHistorial };
            await supabase.from('oportunidades')
                .update({ datos_calculo: newData })
                .eq('id_oportunidad', id);
            console.log(`[Public] Oportunidad ${id} marcada como ACEPTADA`);
        } else {
            console.log(`[Public] La oportunidad ${id} ya estaba en estado ACEPTADA`);
        }

        // Crear expediente de forma síncrona para devolver el número al cliente
        let numeroExpediente = null;
        const uploadLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/firma/${opp.id}`;
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
        if (email !== undefined) updates.email = email;
        if (telefono !== undefined) updates.tlf = telefono;
        if (iban !== undefined) updates.numero_cuenta = iban || null;

        const { error: updErr } = await supabase.from('clientes').update(updates).eq('id_cliente', opp.cliente_id);
        if (updErr) return res.status(500).json({ error: 'Error al actualizar datos del cliente' });

        res.json({ success: true });
    } catch (e) {
        console.error('Error PATCH /public/datos:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST /api/public/upload-docs/:id
router.post('/upload-docs/:id', upload.array('files', 50), async (req, res) => {
    try {
        const paramId = req.params.id;
        const id = await resolveOportunidadId(paramId); // id_oportunidad

        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No se han recibido archivos' });
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

        // 3. Subir archivos en paralelo a Drive
        const uploadPromises = files.map(file => {
            return driveService.saveFileToFolder(
                subfolderId,
                file.originalname,
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

/**
 * Escanea la carpeta "12. DOCUMENTOS PARA CEE" buscando las fotos pre-cargadas
 * y devuelve su contenido en base64 para el Anexo Fotográfico.
 */
router.get('/scan-photos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Buscar la oportunidad
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

        // 2. Buscar la subcarpeta "12. DOCUMENTOS PARA CEE"
        const subfolderId = await driveService.findSubfolderByName(driveFolderId, "12. DOCUMENTOS PARA CEE");
        if (!subfolderId) return res.json({ success: true, photos: {} });

        // 3. Listar archivos
        const files = await driveService.listFiles(subfolderId);
        
        const targetNames = ['FOTO_CALDERA_ANTES', 'FOTO_PLACA_CALDERA_ANTES'];
        const foundPhotos = {};

        for (const file of files) {
            const nameWithoutExt = file.name.split('.')[0];
            if (targetNames.includes(nameWithoutExt)) {
                console.log(`[ScanPhotos] Encontrado ${file.name} (${file.id}). MimeType: ${file.mimeType}. Descargando...`);
                const buffer = await driveService.getFileContent(file.id);
                if (buffer) {
                    // Drive puede reportar mimeType como application/octet-stream para imágenes de WhatsApp.
                    // Inferir por extensión si no es un mimeType de imagen válido.
                    let mimeType = file.mimeType;
                    if (!mimeType || !mimeType.startsWith('image/')) {
                        const ext = file.name.split('.').pop()?.toLowerCase();
                        const extMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
                        mimeType = extMap[ext] || 'image/jpeg';
                        console.log(`[ScanPhotos] MimeType corregido a ${mimeType} por extensión .${ext}`);
                    }
                    const b64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
                    foundPhotos[nameWithoutExt] = {
                        name: file.name,
                        data: b64
                    };
                }
            }
        }

        res.json({ success: true, photos: foundPhotos });

    } catch (e) {
        console.error('Error scanning photos from Drive:', e);
        res.status(500).json({ error: 'Error al escanear fotos en Drive' });
    }
});

module.exports = router;
