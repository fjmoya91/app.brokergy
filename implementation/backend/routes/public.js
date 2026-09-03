const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const emailService = require('../services/emailService');
const expedienteService = require('../services/expedienteService');
const whatsappService = require('../services/whatsappService');
const driveService = require('../services/driveService');
const reformaUploadService = require('../services/reformaUploadService');
const docsAlcance = require('../services/docsAlcance');
const facturaAutoOcr = require('../services/facturaAutoOcr');
const ceeUploadService = require('../services/ceeUploadService');
const anexoFotograficoService = require('../services/anexoFotograficoService');
const uploadNotifier = require('../services/uploadNotifier');
const { buildCertClienteData } = require('../services/certClienteData');
// Una versión NUEVA de un documento ya validado lo devuelve a "pendiente de revisar".
const { invalidarValidacionDocs, invalidarValidacionCee, rechazoBorrador } = require('../utils/docValidacion');
const { requireAuth, isStaff } = require('../middleware/auth');
const {
    imageToPdf, imagesToPdf, dniTwoSidesOnePage, readRepresentanteDni, mergePdfs,
} = require('../utils/dniAnexo');
const axios = require('axios');
const multer = require('multer');

// Qué le falta al INSTALADOR (CIFO por firmar / RITE por registrar). FUENTE
// ÚNICA con el popup de envío de la app: se importa el módulo ESM del frontend,
// igual que hace cifoService con cifoDoc.js.
let _instaladorPendientesPromise = null;
function loadInstaladorPendientes() {
    if (!_instaladorPendientesPromise) {
        const url = require('url').pathToFileURL(
            require('path').join(__dirname, '../../frontend/src/features/expedientes/logic/instaladorPendientes.js')
        ).href;
        _instaladorPendientesPromise = import(url);
    }
    return _instaladorPendientesPromise;
}

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

// Helpers de PDF/DNI: fuente ÚNICA en utils/dniAnexo.js. El montaje del Anexo de
// Cesión manuscrito (escaneo + DNI del cliente + DNI del representante) lo comparten
// esta subida pública y la subida desde la app, y tiene que dar EL MISMO documento.



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

        // Versión de la propuesta que este enlace está sirviendo. El enlace es
        // el mismo siempre, así que quien recibió la v1 y entra hoy ve la v2:
        // hay que decírselo antes de que firme, no después.
        const { vigente: versionVigente } = require('../services/propuestaVersiones');
        const vProp = versionVigente(opp.datos_calculo);

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
            propuesta_version: vProp?.v || null,
            propuesta_version_fecha: vProp?.fecha || null,
            // Qué versión firmó, si ya está aceptada. Puede ser ANTERIOR a la
            // vigente: se le reenvió una revisión después de aceptar.
            propuesta_version_aceptada: acceptanceEntry?.propuesta_version || null,
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

        // QUÉ VERSIÓN de la propuesta está aceptando. El enlace público sirve
        // siempre la vigente, así que un cliente que recibió la v1 y entra hoy
        // acepta la v2 sin saberlo. Sin este sello, después no hay forma de
        // saber sobre qué documento dio su conformidad.
        const propuestaVersiones = require('../services/propuestaVersiones');
        const vAceptada = propuestaVersiones.vigente(opp.datos_calculo)?.v || null;

        if (prevEstado !== 'ACEPTADA') {
            const clienteNombre = [formFields.nombre_razon_social, formFields.apellidos].filter(Boolean).join(' ');
            const newHistorial = [...currentHistorial, {
                id: Date.now().toString() + '_aceptacion',
                tipo: 'cambio_estado',
                estado: 'ACEPTADA',
                fecha: new Date().toISOString(),
                usuario: `Firma Cliente (${clienteNombre})`,
                ...(vAceptada ? { propuesta_version: vAceptada } : {}),
                ...(ceeDecision ? { cee_decision: ceeDecision } : {})
            }];

            const newData = { ...(opp.datos_calculo || {}), estado: 'ACEPTADA', historial: newHistorial, ...(ceeDecision ? { cee_decision: ceeDecision } : {}), ...(fechasPrevistas || {}) };
            await supabase.from('oportunidades')
                .update({ datos_calculo: newData })
                .eq('id_oportunidad', id);
            opp.datos_calculo = newData; // reflejar para createExpediente
            // Sello en la propia versión (RPC de MERGE): el historial dice
            // "aceptó la v2" y la v2 dice "fue aceptada". Las dos caras hacen
            // falta — el listado de versiones se lee sin el historial delante.
            try { await propuestaVersiones.sellarAceptacion(opp, { aceptadoPor: `Firma Cliente (${clienteNombre})` }); } catch (_) { }
            console.log(`[Public] Oportunidad ${id} marcada como ACEPTADA${vAceptada ? ` (propuesta v${vAceptada})` : ''}${ceeDecision ? ` (CEE: ${ceeDecision})` : ''}${fechaInicio ? ` (inicio obra: ${fechaInicio})` : ''}`);
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
`¡Hola *${formFields.nombre_razon_social}*!

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
            .select('id, datos_calculo')
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

        // Aviso al staff (agrupado). Esta pantalla sube TODO de golpe, así que la
        // ventana solo sirve para fusionarlo con lo que llegue por /subir-docs.
        // Se agrupa por nombre canónico (FOTO_CALDERA_ANTES_2 → FOTO_CALDERA_ANTES).
        const porSlot = new Map();
        finalNames.forEach((n, i) => {
            if (!results[i]?.id) return; // solo lo que se subió de verdad
            const base = String(n).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_\d+$/, '');
            porSlot.set(base, (porSlot.get(base) || 0) + 1);
        });
        for (const [base, n] of porSlot) {
            uploadNotifier.registrarSubida({
                oportunidadUuid: opp.id,
                slotKey: base,
                slotLabel: /^FOTO_/i.test(base) ? base.replace(/^FOTO_/i, '').replace(/_/g, ' ').toLowerCase() : base,
                subidoPor: 'cliente',
                cantidad: n,
            });
        }

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

        // Vista unificada (checklist + estado por foto + miniaturas + flag aceptada).
        // `audience: 'cliente'` → en un expediente en curso no se le enseñan los
        // apartados prescindibles (vídeos, planos, "Otros", CEE posterior).
        return res.json(await reformaUploadService.buildDocsView(opp, { audience: 'cliente' }));
    } catch (e) {
        console.error('Error reforma-docs GET:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/public/reforma-docs/:uuid/:slot?token= → sube 1 fichero al slot
// requireAuth es NO bloqueante: si hay sesión (admin/instalador) marca subido_por
// en consecuencia; si solo hay token (cliente), subido_por = 'cliente'.
// POST /api/public/reforma-docs/:uuid/fin-obra?token=
// El cliente/instalador comunica que la obra está TERMINADA desde el enlace de
// subida (el mensaje del CEE inicial se lo pide, pero hasta ahora no había dónde
// pulsar). Avisa al staff y deja fecha en el expediente.
// OJO: se declara ANTES de '/:uuid/:slot' o Express lo tomaría por un slot.
router.post('/reforma-docs/:uuid/fin-obra', requireAuth, async (req, res) => {
    try {
        const { uuid } = req.params;
        const { token } = req.query;
        const { data: opp } = await supabase
            .from('oportunidades')
            .select('id, upload_token:datos_calculo->>upload_token')
            .eq('id', uuid)
            .maybeSingle();
        if (!opp) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (!isStaff(req) && (!token || opp.upload_token !== token)) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }

        const quien = req.body?.rol === 'instalador' ? 'instalador' : 'cliente';
        const comentario = String(req.body?.comentario || '').trim().slice(0, 300);

        // Anti-doble-pulsación: si ya se comunicó en las últimas 24 h, no volvemos
        // a molestar al grupo (el usuario ve el mismo acuse).
        const { data: exp } = await supabase
            .from('expedientes')
            .select('fin:documentacion->>fecha_fin_obra_comunicada')
            .eq('oportunidad_id', uuid)
            .maybeSingle();
        const yaAvisado = exp?.fin && (Date.now() - new Date(exp.fin).getTime()) < 24 * 60 * 60 * 1000;
        if (yaAvisado) return res.json({ success: true, ya_comunicado: true, at: exp.fin });

        res.json({ success: true, at: new Date().toISOString() });
        setImmediate(() => {
            uploadNotifier.notificarFinObra({ oportunidadUuid: uuid, quien, comentario })
                .catch(e => console.error('[Fin obra] notificación:', e.message));
        });
    } catch (e) {
        console.error('Error fin-obra:', e);
        if (!res.headersSent) res.status(500).json({ error: 'No se pudo registrar el fin de obra' });
    }
});

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
        // El token es la credencial del canal PÚBLICO (cliente/instalador por enlace).
        // Una sesión interna (ADMIN/TRABAJADOR) vale igual: el gestor de fotos del
        // Anexo Fotográfico sube por aquí sin tener que pedir antes el token.
        if (!isStaff(req) && (!token || opp.datos_calculo?.upload_token !== token)) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }

        const dc = opp.datos_calculo || {};
        // MISMO checklist que ve el cliente: con el alcance del expediente resuelto.
        // Si la vista poda un apartado (ACS fuera de alcance, CEE inicial ya
        // registrado…), aquí tampoco es un destino válido.
        const checklist = await reformaUploadService.checklistForOportunidad(opp);
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
        } else if (slotDef.multiple) {
            // El índice se calcula contra DRIVE, no solo contra reforma_uploads: las
            // fotos que llegaron por migración o copia manual existen en Drive pero no
            // en la BD, y `prev.length + 1` habría reutilizado un nombre ya ocupado
            // (dos ficheros `FOTO_VENTANAS_DESPUES_1.jpg` en la misma carpeta).
            let maxIdx = prev.length;
            try {
                const existing = await driveService.listFilesByPrefix(subId, slot);
                const re = new RegExp(`^${slot}_(\\d+)\\.`, 'i');
                for (const f of existing || []) {
                    const m = re.exec(f.name || '');
                    if (m) maxIdx = Math.max(maxIdx, parseInt(m[1], 10));
                }
            } catch (nErr) { console.warn('[Reforma] índice multiple desde Drive:', nErr.message); }
            fileName = `${slot}_${maxIdx + 1}.${ext}`;
        } else {
            fileName = `${slot}.${ext}`;
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

        // Aviso al staff: se agrupa en una ventana de silencio (el enlace sube foto
        // a foto) y sale UN resumen por tanda. No avisa si lo sube el propio staff.
        uploadNotifier.registrarSubida({
            oportunidadUuid: uuid,
            slotKey: slot,
            slotLabel: slotDef.named && rawLabel ? `${slotDef.label}: ${rawLabel}` : slotDef.label,
            fase: slotDef.fase || null,
            // Cualquier subida desde dentro (ADMIN o TRABAJADOR) no genera aviso:
            // `subidoPor` marca 'instalador' a un TRABAJADOR y avisaría en falso.
            subidoPor: isStaff(req) ? 'admin' : subidoPor,
        });

        // RITE unificado: si es el Certificado RITE, refleja el enlace en el expediente
        // (cert_rite_drive_link) para que Documentación, CIFO y el agente lo vean.
        if (slot === 'DOC_RITE') reformaUploadService.syncRiteToExpediente(uuid, saved.link);
        // FACTURAS unificadas: crea la entrada en documentacion.facturas del expediente.
        if (slot === 'DOC_FACTURAS') {
            reformaUploadService.addFacturaToExpediente(uuid, saved.link, saved.id);
            // …y la LEE en segundo plano para que la fila no llegue al admin con el
            // nº, la fecha y el importe en blanco. El cliente no espera ni lo ve:
            // la respuesta ya se está devolviendo abajo. Ver services/facturaAutoOcr.
            setImmediate(() => {
                facturaAutoOcr.leerYCompletar({
                    oportunidadId: uuid,
                    driveId: saved.id,
                    buffer: req.file.buffer,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                }).catch(e => console.warn('[facturaAutoOcr] subida pública:', e.message));
            });
        }

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
        // Fichero nuevo ⇒ la validación anterior del slot ya no vale (igual que al
        // subirlo desde la app en CeeDocumentsGrid): vuelve a ámbar.
        const ceeActualizado = invalidarValidacionCee(cee, sectionK, slot);
        await supabase.from('expedientes').update({ cee: ceeActualizado, updated_at: new Date().toISOString() }).eq('id', expedienteId);

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

// ═══════════════════════════════════════════════════════════════════════════
// ACUSE DEL ENCARGO — CEE contratados sueltos
// ---------------------------------------------------------------------------
// El técnico contesta desde el email o el WhatsApp: lo cojo / no puedo. Sin esto
// solo se sabía llamándole por teléfono a los diez días, con el expediente
// parado y nadie enterado.
//
// Es PÚBLICA a propósito (el técnico no tiene por qué estar logueado para decir
// que no puede) y va protegida por el token de un solo uso de `cee.ack_token`.
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/public/cee-ack/:id?token=  → datos para pintar la página
router.get('/cee-ack/:id', async (req, res) => {
    try {
        const ceeAck = require('../services/ceeDirectoAck');
        const r = await ceeAck.leer(req.params.id, req.query.token);
        if (!r.ok) {
            return res.status(r.motivo === 'YA_CONTESTADO' ? 409 : 403).json({
                error: r.motivo === 'YA_CONTESTADO'
                    ? 'Ya nos diste tu respuesta a este encargo. Gracias.'
                    : 'Este enlace ya no es válido. Puede que se haya enviado un encargo más reciente.',
                motivo: r.motivo
            });
        }
        res.json(r.datos);
    } catch (e) {
        console.error('[cee-ack GET]', e.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/public/cee-ack/:id  { token, respuesta: 'acepta'|'rechaza', motivo? }
router.post('/cee-ack/:id', async (req, res) => {
    try {
        const ceeAck = require('../services/ceeDirectoAck');
        const { token, respuesta, motivo } = req.body || {};
        if (respuesta !== 'acepta' && respuesta !== 'rechaza') {
            return res.status(400).json({ error: 'Respuesta no válida' });
        }

        const r = await ceeAck.responder(req.params.id, token, { respuesta, motivo });
        if (!r.ok) {
            return res.status(r.motivo === 'YA_CONTESTADO' ? 409 : 403).json({
                error: r.motivo === 'YA_CONTESTADO'
                    ? 'Ya nos diste tu respuesta a este encargo. Gracias.'
                    : 'Este enlace ya no es válido.',
                motivo: r.motivo
            });
        }

        // El aviso al equipo va FUERA de la respuesta: el técnico ya ha contestado
        // y no puede quedarse esperando a que salga un WhatsApp.
        setImmediate(async () => {
            try {
                const svcCee = require('../services/ceeDirectoService');
                const row = await svcCee.cargar(req.params.id);
                const num = row?.numero_expediente || req.params.id;
                const APP = process.env.FRONTEND_URL || 'https://app.brokergy.es';
                const enlace = `${APP}/?cee=${row.id}`;

                let texto;
                if (r.respuesta === 'acepta') {
                    texto = `✅ *${r.certNombre}* ha ACEPTADO el encargo de ${num}.\n\n${enlace}`;
                } else {
                    // Al rechazo se le acompañan candidatos: el aviso sirve para
                    // decidir, no solo para enterarse. Sin ellos hay que entrar,
                    // abrir el desplegable y acordarse de a quién no ofrecérselo.
                    const sug = await require('../services/ceeDirectoAck').sugerirCertificadores(row, 3);
                    const lista = sug.length
                        ? `\n\nPuedes probar con:\n${sug.map(c => `· ${c.razon_social || c.acronimo}${c.abiertos ? ` (${c.abiertos} abiertos)` : ' (sin carga)'}`).join('\n')}`
                        : '';
                    texto = `⚠️ *${r.certNombre}* NO puede coger ${num}.\n\nEl expediente vuelve a *pendiente de encargar* y se le ha retirado como técnico.${lista}\n\nReasígnalo aquí:\n${enlace}`;
                }

                const wa = process.env.WHATSAPP_ADMIN_CHAT;
                if (wa) await require('../services/whatsappService').sendText(wa, texto);
                if (process.env.ADMIN_EMAIL) {
                    await require('../services/emailService').sendMail({
                        to: process.env.ADMIN_EMAIL,
                        subject: `${num} — ${r.respuesta === 'acepta' ? 'encargo aceptado' : 'el técnico NO puede'}`,
                        text: texto.replace(/\*/g, ''),
                        html: `<pre style="font-family:inherit;white-space:pre-wrap">${texto.replace(/\*/g, '')}</pre>`
                    });
                }
            } catch (e) { console.error('[cee-ack aviso]', e.message); }
        });

        res.json({ ok: true, respuesta: r.respuesta });
    } catch (e) {
        console.error('[cee-ack POST]', e.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Subida del CEE registrado — CEE contratados SUELTOS (tabla cee_directos)
// ---------------------------------------------------------------------------
// Gemelo de /cee-upload de arriba. Existe porque el visto bueno de un CEE
// directo manda al certificador el enlace `/subir-cee-directo/:id`, y sin estas
// dos rutas ese enlace sería un 404 en el móvil del técnico. La página que lo
// pinta es la MISMA (SubirCeeView), montada con otro endpoint.
//
// La firma HMAC lleva un prefijo distinto al del CAE ('cee-directo-upload:'):
// los dos ids son UUID, y sin esa separación una firma válida en un negocio
// abriría la puerta del otro.
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/public/cee-directo-upload/:id?token=&phase=inicial|final
router.get('/cee-directo-upload/:id', async (req, res) => {
    try {
        const ceeDirectoUploads = require('../services/ceeDirectoUploadService');
        const svcCeeDirecto = require('../services/ceeDirectoService');
        const { id } = req.params;
        const { token, phase } = req.query;
        const ph = phase === 'final' ? 'final' : 'inicial';
        if (!ceeDirectoUploads.uploadSignatureValid(id, ph, token)) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }

        const row = await svcCeeDirecto.cargar(id);
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        const current = await ceeDirectoUploads.scanSection(row, ph);
        const cli = row.cliente;

        res.json({
            numero_expediente: row.numero_expediente,
            phase: ph,
            // En un encargo de un solo certificado no se le llama "inicial": el
            // técnico no tiene que preguntarse dónde está el final.
            phaseLabel: ceeDirectoUploads.sectionLabel(row, ph) === 'CEE' ? 'CEE' : (ph === 'final' ? 'CEE Final' : 'CEE Inicial'),
            cliente: cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : '',
            registrado: (row.seguimiento?.[ph === 'final' ? 'cee_final' : 'cee_inicial']) === 'REGISTRADO',
            slots: ceeDirectoUploads.CEE_SLOTS.map(sl => ({
                id: sl.id, label: sl.label, accept: sl.accept, current: current[sl.id] || null
            })),
        });
    } catch (e) {
        console.error('[cee-directo-upload GET]', e.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/public/cee-directo-upload/:id/:slot?token=&phase=
router.post('/cee-directo-upload/:id/:slot', uploadDocsSingle, async (req, res) => {
    try {
        const ceeDirectoUploads = require('../services/ceeDirectoUploadService');
        const svcCeeDirecto = require('../services/ceeDirectoService');
        const { id, slot } = req.params;
        const { token, phase } = req.query;
        const ph = phase === 'final' ? 'final' : 'inicial';
        if (!ceeDirectoUploads.uploadSignatureValid(id, ph, token)) {
            return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        }
        if (!req.file || !req.file.buffer?.length) {
            return res.status(400).json({ error: 'No se ha recibido ningún archivo' });
        }
        if (!ceeDirectoUploads.CEE_SLOTS.find(sl => sl.id === slot)) {
            return res.status(400).json({ error: 'Tipo de documento no válido' });
        }

        const row = await svcCeeDirecto.cargar(id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (!row.drive_folder_id) return res.status(400).json({ error: 'El expediente no tiene carpeta de Drive' });

        const subido = await ceeDirectoUploads.uploadFile(row, ph, slot, req.file.buffer, req.file.mimetype);

        const sectionK = ph === 'final' ? 'final' : 'inicial';
        const cee = row.cee || {};
        const ceeFiles = cee.cee_files || {};
        ceeFiles[sectionK] = { ...(ceeFiles[sectionK] || {}), [slot]: subido.link };
        cee.cee_files = ceeFiles;
        // Fichero nuevo ⇒ la validación anterior del slot deja de valer y vuelve a
        // ámbar, igual que al subirlo desde la app.
        const patch = { cee: invalidarValidacionCee(cee, sectionK, slot) };

        // El justificante de REGISTRO es el hito: cierra la fase. Se sella aquí y
        // no en un segundo paso porque el técnico no vuelve a entrar.
        let registrado = false;
        const key = ph === 'final' ? 'cee_final' : 'cee_inicial';
        if (slot === 'registro' && row.seguimiento?.[key] !== 'REGISTRADO') {
            patch.seguimiento = { ...(row.seguimiento || {}), [key]: 'REGISTRADO' };
            patch.documentacion = {
                ...(row.documentacion || {}),
                [`fecha_registro_${key}`]: new Date().toISOString().slice(0, 10)
            };
            registrado = true;
        }

        await svcCeeDirecto.guardar(row.id, patch, { seguimientoPrev: row.seguimiento });

        if (registrado) {
            // Otra de las dos mitades de la condición de entrega: el certificador
            // acaba de subir el justificante. Si el expediente ya estaba cobrado,
            // el cliente recibe su certificado sin que nadie tenga que acordarse.
            require('../services/ceeDirectoEntrega')
                .intentarEntregaAsync(row.id, ph, 'registro subido por el certificador');

            await svcCeeDirecto.anotarHistorial(row.id, {
                tipo: 'CEE',
                texto: `${(ph === 'final' ? 'CEE FINAL' : 'CEE INICIAL')} REGISTRADO — JUSTIFICANTE SUBIDO POR EL CERTIFICADOR`,
                usuario: null
            });
            // Aviso al equipo: registrado el certificado, lo siguiente es cobrarlo
            // y entregárselo al cliente. Best-effort, fuera de la respuesta: el
            // técnico ya ha subido el fichero y no puede quedarse esperando.
            setImmediate(async () => {
                try {
                    const wa = process.env.WHATSAPP_ADMIN_CHAT;
                    const texto = `✅ ${row.numero_expediente} — ${ph === 'final' ? 'CEE FINAL' : 'CEE'} REGISTRADO por el certificador.`;
                    if (wa) await require('../services/whatsappService').sendText(wa, texto);
                    if (process.env.ADMIN_EMAIL) {
                        await require('../services/emailService').sendMail({
                            to: process.env.ADMIN_EMAIL,
                            subject: `${row.numero_expediente} — CEE registrado`,
                            text: texto, html: `<p>${texto}</p>`
                        });
                    }
                } catch (e) { console.error('[cee-directo-upload aviso]', e.message); }
            });
        }

        res.json({ success: true, slot, link: subido.link, name: subido.fileName, registrado });
    } catch (e) {
        console.error('[cee-directo-upload POST]', e.message);
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
        const checklist = await reformaUploadService.checklistForOportunidad(opp);
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
 * Además de los conceptos CON foto, devuelve los que el expediente ESPERA y aún
 * están vacíos (`pendientes`) y el catálogo de apartados añadibles
 * (`addableConcepts`): el gestor de fotos del Anexo pinta esos huecos para poder
 * subir la foto que falta directamente a su slot de Drive, en vez de obligar a
 * inventarse un "campo personalizado" que nunca llega a Drive.
 *
 * Respuesta: { success, oportunidad_id, groups: [{ key, label, fase, photos }],
 *              pendientes: [{ key, label, fase }], addableConcepts }
 */
router.get('/anexo-photos/:id', async (req, res) => {
    try {
        const id = await resolveOportunidadId(req.params.id);
        const { data: opp, error } = await supabase
            .from('oportunidades')
            .select('id, datos_calculo')
            .eq('id_oportunidad', id)
            .maybeSingle();
        if (error || !opp) return res.status(404).json({ error: 'Oportunidad no encontrada' });

        // Con el alcance del expediente resuelto: el Anexo no puede seguir
        // listando como "pendiente" una foto de ACS en un expediente sin ACS, ni
        // los apartados de envolvente en una ficha que no los contempla. Mismo
        // criterio que el popup de documentación.
        const { datosCalculo: dc } = await docsAlcance.enriquecer(opp);

        // Recopilación centralizada (misma lógica que usa la generación automática
        // server-side del anexo, en anexoFotograficoService).
        const { groups } = await anexoFotograficoService.collectPhotoGroups(dc);

        // Huecos: conceptos esperados por el alcance del expediente que aún no
        // tienen ninguna foto en "12. DOCUMENTOS PARA CEE".
        // `fullRes` viaja con cada concepto: dice al navegador si esa foto debe
        // subirse intacta (placas) o puede reducirla antes de enviarla.
        const conceptos = anexoFotograficoService.anexoConcepts(dc);
        const fullResDe = new Map(conceptos.map(c => [c.key, !!c.fullRes]));
        for (const g of groups) g.fullRes = fullResDe.get(g.key) === true;

        const conFoto = new Set(groups.map(g => g.key));
        const pendientes = conceptos
            .filter(c => !conFoto.has(c.key))
            .map(c => ({ key: c.key, label: c.label, fase: c.fase, fullRes: !!c.fullRes }));

        // Catálogo de apartados de obra que el admin puede activar (ventanas,
        // cubierta, fachada…) con su estado actual, igual que en DocsManager.
        const visibles = new Set(reformaUploadService.buildDocChecklist(dc).map(s => s.key));
        const addableConcepts = reformaUploadService.ADDABLE_CONCEPTS.map(c => ({
            id: c.id,
            label: c.label,
            slots: c.slots,
            shown: c.slots.some(k => visibles.has(k)),
        }));

        console.log(`[AnexoPhotos] ${id}: ${groups.length} concepto(s) con foto, ${pendientes.length} pendiente(s)`);
        res.json({ success: true, oportunidad_id: opp.id, groups, pendientes, addableConcepts });
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
            .select('id, numero_expediente, instalacion, documentacion, clientes!cliente_id(nombre_razon_social, apellidos)')
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

        // CIFO rechazado y todavía sin corregir: la página no ofrece la firma. Si no,
        // el instalador vuelve al enlace del email y firma otra vez el mismo PDF malo.
        const rechazo = rechazoBorrador(exp.documentacion || {}, 'cert_cifo');

        res.json({
            numero_expediente: exp.numero_expediente,
            cliente: [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—',
            instalador: instaladorNombre,
            bloqueado: !!rechazo?.obsoleto,
            rechazo: rechazo ? { label: rechazo.label, motivo: rechazo.motivo, at: rechazo.at, preparando: rechazo.obsoleto } : null,
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

        // Mismo criterio que los anexos del cliente: mientras el CIFO rechazado no se
        // haya regenerado y reenviado no se sirve, ni siquiera desde una pestaña vieja.
        const rechazoCifo = rechazoBorrador(exp.documentacion || {}, 'cert_cifo');
        if (rechazoCifo?.obsoleto) {
            return res.status(409).json({
                error: 'Este certificado tenía un error y lo estamos corrigiendo. Te enviaremos la versión corregida para que la firmes.',
                motivo: rechazoCifo.motivo || null,
            });
        }

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
        const subfolderId = await driveService.getOrCreateSubfolder(driveFolderId, '6. ANEXOS CAE');
        const currentDoc = exp.documentacion || {};

        // ── VERSIONADO (requerimientos → re-firma) ────────────────────────────
        // Si YA había un CIFO firmado, se ARCHIVA el anterior en la subcarpeta "OLD"
        // y el nuevo se nombra `_rev{N}_fdo` (N = nº de versión). La 1ª firma va sin
        // sufijo (`_fdo`). Cubre: 1ª firma, re-firma por requerimiento y sucesivas.
        const prevSignedLink = currentDoc.cert_cifo_signed_link;
        const prevRev = currentDoc.cert_cifo_rev || (prevSignedLink ? 1 : 0);
        let rev, fileName;
        if (prevSignedLink) {
            rev = prevRev + 1;
            fileName = `${numexpte} - Certificado_CIFO_rev${rev}_fdo.pdf`;
            const prevId = (String(prevSignedLink).match(/[-\w]{25,}/) || [])[0];
            if (prevId) {
                const prevName = `${numexpte} - Certificado_CIFO${prevRev > 1 ? `_rev${prevRev}` : ''}_fdo.pdf`;
                try { await driveService.archiveExistingToOld(subfolderId, prevId, prevName); }
                catch (e) { console.warn('[CIFO upload] no se pudo archivar el firmado anterior a OLD:', e.message); }
            }
        } else {
            rev = 1;
            fileName = `${numexpte} - Certificado_CIFO_fdo.pdf`;
        }

        const driveFile = await driveService.saveFileToFolder(subfolderId, fileName, req.file.mimetype, req.file.buffer);
        const fileLink = driveFile?.link || null;

        // Guardar link + versión (mismo campo cert_cifo_signed_link que usa DocumentacionModule).
        // Si el CIFO anterior ya estaba validado (verde), esta versión nueva lo devuelve
        // a ámbar: hay que revisarla y validarla para que sustituya a la de auditoría.
        const docActualizado = invalidarValidacionDocs(
            { ...currentDoc, cert_cifo_signed_link: fileLink, cert_cifo_rev: rev },
            'cert_cifo_signed_link',
            { usuario: instaladorNombre !== '—' ? instaladorNombre : 'INSTALADOR', origen: 'subida por el instalador' }
        );
        await supabase.from('expedientes').update({ documentacion: docActualizado }).eq('id', expedienteId);

        res.json({ success: true, fileLink, rev });

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public/instalador/:expedienteId
// ─────────────────────────────────────────────────────────────────────────────
// Lo que el INSTALADOR tiene pendiente en esta obra: firmar el CIFO y/o
// devolvernos la legalización RITE. Es lo que alimenta /instalador/:id, el
// enlace ÚNICO que va en el mensaje cuando se le mandan las dos cosas juntas.
//
// El cálculo NO se reimplementa aquí: sale de la misma función que usa el popup
// de envío de la app (logic/instaladorPendientes.js). Si divergieran, el mensaje
// prometería un documento que la página no pide — o al revés.
router.get('/instalador/:expedienteId', async (req, res) => {
    try {
        const { expedienteId } = req.params;
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, instalacion, documentacion, clientes!cliente_id(nombre_razon_social, apellidos, direccion, codigo_postal, municipio, provincia)')
            .eq('id', expedienteId)
            .maybeSingle();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        let instaladorNombre = '—';
        const instaladorId = exp.instalacion?.instalador_id;
        if (instaladorId) {
            const { data: pres } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', instaladorId).maybeSingle();
            if (pres?.razon_social) instaladorNombre = pres.razon_social;
        }

        const { estadoInstalador } = await loadInstaladorPendientes();
        const doc = exp.documentacion || {};
        const est = estadoInstalador(doc);
        const rechazo = rechazoBorrador(doc, 'cert_cifo');

        const tareas = [];
        // El CIFO solo se ofrece si hay un borrador que firmar. Sin él, la página
        // pediría una firma sobre un documento que todavía no existe.
        if (est.cifo.borrador || est.cifo.firmado) {
            tareas.push({
                key: 'cifo',
                hecho: est.cifo.recibido,
                bloqueado: !!rechazo?.obsoleto,
                rechazo: rechazo ? { label: rechazo.label, motivo: rechazo.motivo, at: rechazo.at } : null,
                aviso: rechazo?.obsoleto ? 'Lo estamos corrigiendo — te avisaremos' : null,
            });
        }
        // El RITE se le pide siempre: es suyo por definición. La memoria firmada
        // solo si alguna vez le mandamos una — si no, es un papel que no tiene.
        tareas.push({
            key: 'rite',
            hecho: est.rite.recibido,
            pide_memoria: est.rite.memoriaGenerada,
            memoria_subida: est.rite.memoriaRecibida,
            certificado_subido: est.rite.certificadoRecibido,
        });

        // Dónde está la obra. Va aquí solo para que el instalador reconozca de qué
        // expediente le hablamos: la dirección de la INSTALACIÓN no es el domicilio
        // del cliente, salvo cuando el propio expediente declara `misma_direccion`
        // (mismo criterio que `buildInstalacionAddress`).
        const ins = exp.instalacion || {};
        const c = exp.clientes || {};
        const usaCliente = !ins.direccion || ins.misma_direccion === true || String(ins.misma_direccion).toUpperCase() === 'SI';
        const direccion = usaCliente
            ? [c.direccion, c.codigo_postal, c.municipio, c.provincia && `(${c.provincia})`].filter(Boolean).join(', ')
            : [ins.direccion, ins.codigo_postal, ins.municipio, ins.provincia && `(${ins.provincia})`].filter(Boolean).join(', ');

        res.json({
            numero_expediente: exp.numero_expediente,
            cliente: [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—',
            instalador: instaladorNombre,
            direccion: direccion || null,
            tareas,
        });
    } catch (e) {
        console.error('[instalador] Error:', e);
        res.status(500).json({ error: 'Error interno' });
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
        // Mismo criterio que /instalador/:id (fuente única): `cert_rite_drive_link`
        // NO cuenta como certificado aportado cuando lo que guarda es la Memoria
        // que generamos nosotros. Sin esto, esta página decía "ya subido" de un
        // certificado que nunca llegó, y la página unificada decía lo contrario.
        const { estadoInstalador } = await loadInstaladorPendientes();
        const estRite = estadoInstalador(exp.documentacion || {}).rite;
        res.json({
            numero_expediente: exp.numero_expediente,
            cliente: [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—',
            instalador: instaladorNombre,
            memoria_subida: estRite.memoriaRecibida,
            certificado_subido: estRite.certificadoRecibido,
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
                .select('id, oportunidad_id, numero_expediente, documentacion, instalacion, clientes!cliente_id(nombre_razon_social, apellidos), oportunidades!oportunidad_id(datos_calculo)')
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

            let docUpdate = { ...(exp.documentacion || {}) };
            const camposSubidos = [];
            let memoriaLink = null;
            let certLink = null;
            if (memFile) {
                const r = await saveReplacing(`${numexpte} - Memoria RITE_fdo.pdf`, memFile.mimetype, memFile.buffer);
                memoriaLink = r?.link || null;
                docUpdate.cert_rite_signed_link = memoriaLink;
                camposSubidos.push('cert_rite_signed_link');
                if (r?.id) try { await driveService.setFolderPublic(r.id, 'reader'); } catch (e) {}
            }
            if (certFile) {
                const r = await saveReplacing(`${numexpte} - Certificado RITE.pdf`, certFile.mimetype, certFile.buffer);
                certLink = r?.link || null;
                docUpdate.cert_rite_drive_link = certLink;   // → slot "Certificado RITE" (validación del agente)
                camposSubidos.push('cert_rite_drive_link');
                if (r?.id) try { await driveService.setFolderPublic(r.id, 'reader'); } catch (e) {}
            }

            // Versión nueva ⇒ el slot vuelve a ámbar aunque ya estuviera validado.
            docUpdate = invalidarValidacionDocs(docUpdate, camposSubidos, {
                usuario: instaladorNombre !== '—' ? instaladorNombre : 'INSTALADOR',
                origen: 'subida por el instalador',
            });

            await supabase.from('expedientes').update({ documentacion: docUpdate }).eq('id', expedienteId);

            res.json({ success: true, memoria_link: memoriaLink, certificado_link: certLink });

            // Notificación al admin (background)
            setImmediate(async () => {
                // El certificado que acaba de entrar se LEE aquí mismo: de él salen la
                // fecha de pruebas y la de firma del Certificado de Instalación —las que
                // fijan el inicio y el fin de actuación del CIFO— y la comprobación de
                // que el emplazamiento es el de este expediente. El instalador no espera
                // ni ve nada: la respuesta ya ha salido. Lo leído viaja en el MISMO aviso
                // al staff, que es donde hace falta: sin eso, la señal de que la
                // referencia catastral no casaba habría que ir a buscarla.
                let lecturaRite = null;
                if (certFile) {
                    try {
                        const { procesarCertificadoRite } = require('../services/riteCertificado');
                        lecturaRite = await procesarCertificadoRite({
                            exp: { ...exp, documentacion: docUpdate },
                            pdf: certFile.buffer,
                            origen: 'instalador',
                        });
                    } catch (e) { console.error('[RITE upload] lectura del certificado:', e.message); }
                }
                const esES = (f) => (f ? String(f).split('-').reverse().join('/') : null);
                const lineasLectura = [];
                if (lecturaRite) {
                    if (lecturaRite.fechas?.pruebas) lineasLectura.push(`Fecha de pruebas: ${esES(lecturaRite.fechas.pruebas)}${lecturaRite.escrito.includes('fecha_pruebas_cert_instalacion') ? ' (anotada en el expediente)' : ''}`);
                    for (const c of lecturaRite.conflictos || []) lineasLectura.push(`⚠️ ${c.label}: en la app ${esES(c.en_app)} y en el certificado ${esES(c.en_certificado)}`);
                    for (const c of (lecturaRite.comprobaciones || []).filter(x => x.estado === 'revisar')) lineasLectura.push(`⚠️ ${c.campo}: "${c.leido}" no cuadra con "${c.esperado}"`);
                }

                const clienteNombre = [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—';
                const partes = [memFile ? 'Memoria firmada' : null, certFile ? 'Certificado RITE' : null].filter(Boolean).join(' + ');
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
                const adminEmail = process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
                const msg = `✅ *Documentación RITE recibida*\nExpediente: *${numexpte}*\nInstalador: ${instaladorNombre}\nCliente: ${clienteNombre}\nRecibido: ${partes}` + (lineasLectura.length ? `\n\n${lineasLectura.join('\n')}` : '');
                try { if (adminPhone) await whatsappService.sendText(adminPhone, msg); } catch (e) { console.error('[RITE upload] WA notify:', e.message); }
                try {
                    await emailService.sendMail({
                        to: adminEmail,
                        subject: `✅ Documentación RITE recibida — ${numexpte}`,
                        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                            <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 28px;"><h2 style="margin:0;color:#fff;font-size:16px;">BROKERGY · Documentación RITE</h2></div>
                            <div style="padding:24px;background:#fff;">
                              <p>El instalador <strong>${instaladorNombre}</strong> ha subido <strong>${partes}</strong> del expediente <strong>${numexpte}</strong> (${clienteNombre}).</p>
                              ${lineasLectura.length ? `<ul style="padding-left:18px;color:#374151;font-size:13px;">${lineasLectura.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
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
        // Anexos rechazados por Brokergy. Mientras el borrador corregido no esté
        // regenerado y enviado, el anexo se retira de la página: si no, el cliente
        // se descarga el mismo PDF erróneo y lo vuelve a firmar mal.
        const rechazoI = rechazoBorrador(doc, 'anexo_i');
        const rechazoC = rechazoBorrador(doc, 'anexo_cesion');
        const bloqI = !!rechazoI?.obsoleto;
        const bloqC = !!rechazoC?.obsoleto;
        res.json({
            numero_expediente: exp.numero_expediente,
            cliente: [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—',
            // qué documentos se enviaron / esperamos de vuelta
            anexo_i_pedido: !!(doc.anexo_i_drive_link || doc.anexo_i_sent_at),
            anexo_cesion_pedido: !!(doc.anexo_cesion_drive_link || doc.anexo_cesion_sent_at),
            // anexos YA generados (borrador en Drive) → descargables
            anexo_i_disponible: !!doc.anexo_i_drive_link && !bloqI,
            anexo_cesion_disponible: !!doc.anexo_cesion_drive_link && !bloqC,
            // anexos ENVIADOS al cliente → habilitan la fase de firma (aunque no estén en Drive)
            anexo_i_enviado: !!doc.anexo_i_sent_at && !bloqI,
            anexo_cesion_enviado: !!doc.anexo_cesion_sent_at && !bloqC,
            // rechazos: motivo + si estamos preparando ya la versión corregida
            rechazos: [rechazoI, rechazoC].filter(Boolean).map(r => ({
                doc: r.doc, label: r.label, motivo: r.motivo, at: r.at, preparando: r.obsoleto,
            })),
            // qué ya hemos recibido firmado (un firmado RECHAZADO no cuenta como recibido)
            anexo_i_firmado: !!doc.anexo_i_signed_link && !rechazoI,
            anexo_cesion_firmado: !!doc.anexo_cesion_signed_link && !rechazoC,
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
                .select('id, numero_expediente, cliente_id, documentacion, instalacion, clientes!cliente_id(id_cliente, notificaciones_contacto_activas), oportunidades!oportunidad_id(datos_calculo, ref_catastral, referencia_cliente)')
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
                .select('nombre_razon_social, apellidos, email, tlf, dni, numero_cuenta, notificaciones_contacto_activas, persona_contacto_email, persona_contacto_tlf, direccion, codigo_postal, municipio, provincia')
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
                // El nº de expediente solo no dice de quién es: se manda la ficha
                // (titular + dirección de la instalación), igual que en el resto
                // de avisos (encargo al certificador, entrega de CIFO…).
                const { data: clienteData } = buildCertClienteData(exp, exp.oportunidades, cliFresh);
                const portalLink = `https://app.brokergy.es/?exp=${exp.id}`;
                const msg = [
                    '📝 *Datos del cliente completados*',
                    `Expediente: *${numexpte}*`,
                    clienteData.nombre ? `Cliente: *${clienteData.nombre}*` : null,
                    clienteData.direccionInstalacion ? `Instalación: ${clienteData.direccionInstalacion}` : null,
                    clienteData.direccionCliente ? `Domicilio: ${clienteData.direccionCliente}` : null,
                    `Actualizado: ${partes}`,
                    '',
                    '👉 Ya puedes *generar y enviar los anexos* al cliente para que los firme.',
                ].filter(v => v !== null).join('\n');
                try { if (adminPhone) await whatsappService.sendText(adminPhone, msg); } catch (e) {}
                try {
                    await emailService.sendDatosClienteCompletadosEmail({
                        to: adminEmail,
                        numExp: numexpte,
                        partes,
                        clienteData,
                        portalLink,
                    });
                } catch (e) { console.warn('[anexos-datos] email admin:', e.message); }
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
                .select('id, numero_expediente, documentacion, instalacion, clientes!cliente_id(nombre_razon_social, apellidos, dni, tlf, email, direccion, codigo_postal, municipio, provincia), oportunidades!oportunidad_id(datos_calculo, ref_catastral, referencia_cliente)')
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
            // El fichero anterior NO se borra: se archiva en "6. ANEXOS CAE/OLD" como
            // `{nombre}_OLD`. Cuando esta subida es la corrección de un anexo RECHAZADO,
            // el PDF que se rechazó es justo el que queda archivado — sin eso, el motivo
            // del rechazo quedaba en el historial pero la versión mala desaparecía.
            // Mismo versionado que el alta desde la app (POST /documents/upload).
            const saveReplacing = async (name, buffer) => {
                try {
                    const existing = await driveService.findFileByName(subfolderId, name);
                    if (existing) await driveService.archiveExistingToOld(subfolderId, existing, name);
                } catch (e) { console.warn('[anexos-upload] no se pudo archivar el previo:', e.message); }
                const r = await driveService.saveFileToFolder(subfolderId, name, 'application/pdf', buffer);
                if (r?.id) { try { await driveService.setFolderPublic(r.id, 'reader'); } catch (e) {} }
                return r;
            };

            let docUpdate = { ...(exp.documentacion || {}) };
            const recibido = [];
            const camposSubidos = [];

            // Anexo I firmado
            if (anexoIFile) {
                const buf = await toPdfBuffer(anexoIFile);
                const r = await saveReplacing(`${numexpte} - Anexo I_fdo.pdf`, buf);
                if (r?.link) { docUpdate.anexo_i_signed_link = r.link; camposSubidos.push('anexo_i_signed_link'); recibido.push('Anexo I firmado'); }
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
                    camposSubidos.push('anexo_cesion_signed_link');
                    // Firma electrónica: el cliente firma primero, falta la contrafirma de
                    // Brokergy (segunda firma digital) antes de poder validar/auditar.
                    // Firma manuscrita: el PDF escaneado ya lleva ambas firmas físicas (más el
                    // DNI anexado) — no hace falta ninguna firma digital adicional de Brokergy.
                    docUpdate.cesion_firmado_brokergy = cesionFirma !== 'electronica';
                    recibido.push(cesionFirma === 'manuscrita' ? 'Anexo de Cesión firmado (con DNI anexado)' : 'Anexo de Cesión firmado (firma electrónica)');
                }
            }

            // Re-firma (p. ej. tras un requerimiento): el slot vuelve a ámbar aunque el
            // anexo anterior estuviera validado, para que se revise la versión nueva.
            docUpdate = invalidarValidacionDocs(docUpdate, camposSubidos, {
                usuario: 'CLIENTE',
                origen: 'firmado por el cliente',
            });

            await supabase.from('expedientes').update({ documentacion: docUpdate }).eq('id', expedienteId);

            res.json({ success: true, recibido });

            // Notificación al admin (background)
            setImmediate(async () => {
                const partes = recibido.join(' + ') || 'documentación';
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
                const adminEmail = process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
                // Misma ficha (titular + dirección de la instalación) que el resto de avisos.
                const { data: clienteData } = buildCertClienteData(exp, exp.oportunidades, exp.clientes);
                const portalLink = `https://app.brokergy.es/?exp=${exp.id}`;
                // Enlace de CONTRAFIRMA: abre el expediente y lanza ya el popup de
                // Autofirma sobre el Anexo de Cesión firmado por el cliente (igual que
                // el enlace de firma de las fichas del lote: un click y a firmar). Al
                // firmar, el propio flujo lo sube a Drive y lo deja validado.
                const firmaLink = `${portalLink}&firmar=cesion`;
                // Firma electrónica del cliente ⇒ el Convenio de Cesión espera aún la
                // contrafirma de Brokergy (con firma manuscrita el PDF ya va completo).
                const pendienteContrafirma = !!docUpdate.anexo_cesion_signed_link
                    && docUpdate.anexo_cesion_firma_tipo === 'electronica'
                    && !docUpdate.cesion_firmado_brokergy;
                const msg = [
                    pendienteContrafirma ? '✍️ *Anexos firmados — falta tu firma*' : '✅ *Anexos firmados recibidos*',
                    `Expediente: *${numexpte}*`,
                    clienteData.nombre ? `Cliente: *${clienteData.nombre}*` : null,
                    clienteData.direccionInstalacion ? `Instalación: ${clienteData.direccionInstalacion}` : null,
                    `Recibido: ${partes}`,
                    ...(pendienteContrafirma
                        ? ['', `El cliente firmó *electrónicamente*: falta la firma de Brokergy en el Anexo de Cesión.\nAbre este enlace y se lanza directamente la firma con Autofirma:\n${firmaLink}`]
                        : []),
                ].filter(v => v !== null).join('\n');
                try { if (adminPhone) await whatsappService.sendText(adminPhone, msg); } catch (e) { console.error('[anexos-upload] WA notify:', e.message); }
                try {
                    await emailService.sendAnexosFirmadosEmail({
                        to: adminEmail,
                        numExp: numexpte,
                        partes,
                        clienteData,
                        cesionLink: docUpdate.anexo_cesion_signed_link || null,
                        anexoILink: docUpdate.anexo_i_signed_link || null,
                        portalLink,
                        firmaLink,
                        pendienteContrafirma,
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
        // Anexo rechazado y todavía sin corregir: no se sirve. La página ya no lo
        // ofrece, pero una pestaña abierta de antes o el enlace del email seguirían
        // bajando el PDF erróneo — y firmarlo otra vez es justo lo que evitamos.
        const rechazo = rechazoBorrador(d, doc === 'anexo_i' ? 'anexo_i' : 'anexo_cesion');
        if (rechazo?.obsoleto) {
            return res.status(409).json({
                error: 'Este documento tenía un error y lo estamos corrigiendo. Te enviaremos la versión corregida para que la firmes.',
                motivo: rechazo.motivo || null,
            });
        }
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
        // `?r=` acota la página a la RONDA de un requerimiento: solo los documentos
        // que se regeneraron y se mandaron a firmar de nuevo en ese envío. El resto
        // del papeleo del lote (y lo que quedó pendiente de envíos anteriores) no
        // sale aquí. Filtro en services/loteDocs.docsParaFirma.
        const ronda = String(req.query.r || '').trim() || null;
        const { docsParaFirma } = require('../services/loteDocs');
        const docs = docsParaFirma(lote.documentos_so, { ronda }).map(d => ({
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
            requerimiento: !!ronda,
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

        // Guardar el firmado es la MISMA operación venga del enlace público o del
        // panel: services/loteDocs.guardarDocFirmado (misma carpeta, mismo nombre,
        // y retira el visto bueno anterior porque hay que revisar el nuevo).
        const buf = Buffer.from(signedPdfBase64, 'base64');
        let docsSo, idx, saved, todosFirmados;
        try {
            const r = await require('../services/loteDocs').guardarDocFirmado(lote, docKey, buf);
            docsSo = r.docsSo; saved = r.saved; todosFirmados = r.todosFirmados;
            idx = docsSo.findIndex(d => d.key === docKey);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }
        const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
        historial.push({
            id: `${Date.now()}_firma_so`, tipo: 'sistema',
            texto: `S.O. firmó "${docsSo[idx].label || docKey}"${todosFirmados ? ' — TODOS los documentos firmados' : ` (${docsSo.filter(d => d.signed_link).length}/${docsSo.length})`}.`,
            fecha: new Date().toISOString(), usuario: 'Sujeto Obligado',
        });
        await supabase.from('lotes').update({ documentos_so: docsSo, historial, updated_at: new Date().toISOString() }).eq('id', lote.id);

        // Cada firma puede completar un hito: cuando el S.O. termina el Anexo I + las
        // fichas el lote pasa a esperar la oferta, y cuando devuelve la oferta firmada
        // pasa a ENVIADO A VERIFICADOR (que ya sí mueve la carpeta a "07").
        await require('../services/loteDocs').sincronizarEstadoLote(lote.id, {
            docs: docsSo, usuario: 'Sujeto Obligado', motivo: 'firma del S.O.',
        });

        // La OFERTA DE VERIFICACIÓN se avisa aparte y siempre: es el hito que
        // desbloquea la verificación, y llega tanto si el S.O. la firma con su
        // certificado como si sube el PDF firmado a mano desde el mismo enlace.
        if (docKey === 'oferta_verificacion') {
            const label = docsSo[idx].label || 'Oferta de verificación';
            const link = saved.link;
            setImmediate(async () => {
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
                const adminEmail = process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
                const msg = `✍️ *Oferta de verificación firmada*\nLote: *${lote.codigo || lote.id}*\nEl Sujeto Obligado ha firmado la oferta. Ya está en la carpeta del lote en Drive.`;
                try { if (adminPhone) await whatsappService.sendText(adminPhone, msg); } catch (e) {}
                try {
                    await emailService.sendMail({
                        to: adminEmail,
                        subject: `✍️ Oferta de verificación firmada — lote ${lote.codigo || ''}`,
                        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 28px;"><h2 style="margin:0;color:#fff;font-size:16px;">BROKERGY · Oferta firmada</h2></div><div style="padding:24px;background:#fff;"><p>El Sujeto Obligado ha firmado <strong>${label}</strong> del lote <strong>${lote.codigo || lote.id}</strong>.</p><p style="margin-top:12px;">El PDF firmado está en la carpeta del lote en Drive${link ? `: <a href="${link}">abrir documento</a>` : ''}.</p></div></div>`,
                    });
                } catch (e) {}
            });
        }

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
