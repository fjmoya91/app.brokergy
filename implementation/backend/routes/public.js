const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const emailService = require('../services/emailService');
const expedienteService = require('../services/expedienteService');
const whatsappService = require('../services/whatsappService');
const driveService = require('../services/driveService');
const reformaUploadService = require('../services/reformaUploadService');
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

        // Asegurar carpeta del lead + subcarpeta de documentos (la crea si falta)
        const folderId = await reformaUploadService.ensureDriveFolder(uuid);
        const subId = await driveService.getOrCreateSubfolder(folderId, reformaUploadService.SUBCARPETA_DOCS);

        // Nombre por slot-key (compatible con scan-photos del Anexo Fotográfico)
        const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const prev = Array.isArray(dc.reforma_uploads?.[slot]) ? dc.reforma_uploads[slot] : [];
        const fileName = slotDef.multiple ? `${slot}_${prev.length + 1}.${ext}` : `${slot}.${ext}`;

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
                    const subId = await driveService.findSubfolderByName(folderId, reformaUploadService.SUBCARPETA_DOCS);
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

        const dc = opp.datos_calculo || {};
        const driveFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        if (!driveFolderId) return res.json({ success: true, groups: [] });
        const subfolderId = await driveService.findSubfolderByName(driveFolderId, '12. DOCUMENTOS PARA CEE');
        if (!subfolderId) return res.json({ success: true, groups: [] });

        const driveFiles = await driveService.listFiles(subfolderId);
        const IMG_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
        const isImg = (f) => (f.mimeType || '').startsWith('image/') || IMG_EXT.test(f.name || '');

        // Conceptos: todas las actuaciones (DESPUÉS) + el estado inicial de cada una
        // (ANTES). En ANTES se excluyen solo las fotos de CONTEXTO (no son actuación):
        // fachada de la calle y patios. Así, las ventanas/cubierta/etc. de ANTES
        // habilitadas a posteriori sí entran. Sin vídeos/docs/otros.
        const ANTES_CONTEXTO = new Set(['FOTO_FACHADA_PRINCIPAL', 'FOTO_PATIOS_INTERIORES']);
        const concepts = reformaUploadService.buildDocChecklist(dc)
            .filter(s => !/^(VIDEO_|DOC_|OTROS_)/.test(s.key) && (s.fase === 'DESPUES' || !ANTES_CONTEXTO.has(s.key)))
            .map(s => ({ key: s.key, label: s.label, fase: s.fase }));
        // Legacy: "unidad interior / ACS" suelto (expedientes antiguos del anexo previo).
        if (!concepts.some(c => c.key === 'FOTO_UNIDAD_INTERIOR')) {
            concepts.push({ key: 'FOTO_UNIDAD_INTERIOR', label: 'Unidad interior / ACS', fase: 'DESPUES' });
        }

        const extToMime = (filename) => {
            const ext = (String(filename).split('.').pop() || '').toLowerCase();
            const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', bmp: 'image/bmp' };
            return map[ext] || 'image/jpeg';
        };
        const toB64 = async (file) => {
            const buffer = await driveService.getFileContent(file.id);
            if (!buffer) return null;
            let mt = file.mimeType;
            if (!mt || !mt.startsWith('image/')) mt = extToMime(file.name);
            return { name: file.name, data: `data:${mt};base64,${buffer.toString('base64')}` };
        };

        const groups = [];
        for (const c of concepts) {
            const matches = driveFiles
                .filter(f => isImg(f) && reformaUploadService.fileBelongsToSlot(f.name, c.key))
                .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }));
            if (!matches.length) continue;
            const photos = [];
            for (const f of matches) {
                // eslint-disable-next-line no-await-in-loop
                const p = await toB64(f);
                if (p) photos.push(p);
            }
            if (photos.length) groups.push({ key: c.key, label: c.label, fase: c.fase, photos });
        }

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
                await emailService.sendMail({
                    to: adminEmail,
                    subject: `✅ CIFO firmado recibido — ${numexpte}`,
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                            <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 28px;">
                                <h2 style="margin:0;color:#fff;font-size:16px;">BROKERGY · Nuevo CIFO firmado</h2>
                            </div>
                            <div style="padding:24px;background:#fff;">
                                <p>El instalador <strong>${instalador}</strong> ha subido el <strong>Certificado CIFO firmado</strong> del expediente <strong>${numexpte}</strong>.</p>
                                <p>Cliente: <strong>${clienteNombre}</strong></p>
                                ${fileLink ? `<p><a href="${fileLink}" style="color:#f59e0b;font-weight:bold;">Ver documento en Drive</a></p>` : ''}
                            </div>
                        </div>
                    `
                });
            } catch (e) { console.error('[CIFO upload] Email notify error:', e.message); }
        });

    } catch (e) {
        console.error('[CIFO upload] Error:', e);
        res.status(500).json({ error: 'Error al procesar la subida', message: e.message });
    }
});

module.exports = router;
