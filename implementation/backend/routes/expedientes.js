const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../services/supabaseClient');
const { enforceAuth, adminOnly } = require('../middleware/auth');
const { getCoordinatesByRC } = require('../services/catastroService');
const { normalizeData } = require('../utils/normalization');
const emailService = require('../services/emailService');


// ─── GET /api/expedientes ─────────────────────────────────────────────────────
// Lista todos los expedientes con datos básicos de oportunidad y cliente
router.get('/', enforceAuth, async (req, res) => {
    try {
        // Solo ADMIN puede ver todo. DISTRIBUIDOR e INSTALADOR están limitados por prescriptor_id en el JOIN.
        // CERTIFICADOR debe ser filtrado específicamente por cee.certificador_id.
        const canViewAll = req.user.rol_nombre === 'ADMIN';
        
        // Ya no usamos embedded resources (.select('clientes(...)')) para evitar fallos por ambigüedad de relaciones (PGRST201)
        // Hacemos el join manualmente en Node.js, que es más robusto ante cambios en el esquema.
        const { data: simpleData, error: simpleErr } = await supabase
            .from('expedientes')
            .select('*')
            .order('created_at', { ascending: false });

        if (simpleErr) throw simpleErr;

        let data = simpleData || [];

        // Filtro adicional por cliente si no es ADMIN ni CERTIFICADOR
        if (!canViewAll && req.user.rol_nombre !== 'CERTIFICADOR') {
            if (!req.user.prescriptor_id) return res.json([]);
            const { data: clienteIds } = await supabase
                .from('clientes')
                .select('id_cliente')
                .eq('prescriptor_id', req.user.prescriptor_id);
            
            if (!clienteIds || clienteIds.length === 0) return res.json([]);
            const validIds = clienteIds.map(c => c.id_cliente);
            data = data.filter(r => validIds.includes(r.cliente_id));
        }

        // Filtro específico para CERTIFICADOR
        if (req.user.rol_nombre === 'CERTIFICADOR') {
            if (!req.user.prescriptor_id) return res.json([]);
            data = data.filter(r => String(r.cee?.certificador_id) === String(req.user.prescriptor_id));
        }

        if (data.length > 0) {
            const clienteIds = [...new Set(data.map(r => r.cliente_id).filter(Boolean))];
            const opIds = [...new Set(data.map(r => r.oportunidad_id).filter(Boolean))];

            const [{ data: clientesData }, { data: opsData }] = await Promise.all([
                supabase.from('clientes').select('*').in('id_cliente', clienteIds),
                supabase.from('oportunidades').select('id, id_oportunidad, referencia_cliente, ficha, datos_calculo').in('id', opIds)
            ]);

            const cliMap = Object.fromEntries((clientesData || []).map(c => [c.id_cliente, c]));
            const opMap  = Object.fromEntries((opsData || []).map(o => [o.id, o]));

            data = data.map(r => ({
                ...r,
                clientes:      cliMap[r.cliente_id]      || null,
                oportunidades: opMap[r.oportunidad_id]   || null,
            }));
        }

        res.json(data);
    } catch (err) {
        console.error('Error GET expedientes (Manual Join):', err);
        res.status(500).json({ error: 'Error al recuperar expedientes', details: err.message });
    }
});

// ─── GET /api/expedientes/:id ─────────────────────────────────────────────────
router.get('/:id', enforceAuth, async (req, res) => {
    try {
        // Obtenemos solo el expediente primero (sin JOINs para evitar errores de ambiguedad de claves foráneas)
        const { data: simple, error } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !simple) return res.status(404).json({ error: 'Expediente no encontrado' });

        // Recuperamos los datos relacionados
        const [{ data: cli }, { data: op }] = await Promise.all([
            supabase.from('clientes').select('*').eq('id_cliente', simple.cliente_id).single(),
            supabase.from('oportunidades').select('id, id_oportunidad, referencia_cliente, ficha, ref_catastral, datos_calculo, prescriptor_id').eq('id', simple.oportunidad_id).single()
        ]);

        // Recuperamos el instalador asignado (desde Instalacion o el genérico de Oportunidades)
        let assignedPrescriptor = null;
        const targetInstId = simple.instalacion?.instalador_id || op?.prescriptor_id;
        
        if (targetInstId) {
            const { data: presInfo } = await supabase
                .from('prescriptores')
                .select('*')
                .eq('id_empresa', targetInstId)
                .single();
            if (presInfo) assignedPrescriptor = presInfo;
        }

        return res.json({ 
            ...simple, 
            clientes: cli || null,
            oportunidades: op || null,
            prescriptores: assignedPrescriptor 
        });
    } catch (err) {
        console.error('Error GET expedientes/:id:', err);
        res.status(500).json({ error: 'Error al obtener el expediente' });
    }
});

const expedienteService = require('../services/expedienteService');
const whatsappService = require('../services/whatsappService');

// ─── POST /api/expedientes/:id/comunicar-cee-inicial ──────────────────────────
// Envía un mensaje automático al cliente informando de la presentación del CEE Inicial
router.post('/:id/comunicar-cee-inicial', enforceAuth, async (req, res) => {
    // Esta ruta ha sido desactivada en favor del endpoint manual /notify-registration.
    // Se mantiene como placeholder para no romper posibles disparadores externos (webhooks).
    console.log(`[Deprecation] Intento de llamada a comunicar-cee-inicial para expediente ${req.params.id}. Ignorado.`);
    res.json({ success: true, message: 'Endpoint deprecado. Use /notify-registration en su lugar.' });
});

// ─── POST /api/expedientes/:id/notify-registration ────────────────────────────
// Envía notificaciones manuales (seleccionadas por el usuario) al registrar un CEE
router.post('/:id/notify-registration', enforceAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { target, type, channels = ['email', 'whatsapp'] } = req.body; 

        const sendEmail = channels.includes('email');
        const sendWA = channels.includes('whatsapp');

        const { data: exp, error: expErr } = await supabase.from('expedientes').select('*').eq('id', id).single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const [{ data: cli }, { data: op }] = await Promise.all([
            supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).single(),
            supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).single()
        ]);

        if (!cli || !op) return res.status(404).json({ error: 'Datos de cliente u oportunidad no encontrados' });

        const numExp = (exp.numero_expediente || op.id_oportunidad || '—').trim();
        const clienteName = (cli.nombre_razon_social || 'Cliente').trim();
        const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`.trim();
        const uploadLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/firma/${op.id}`;
        const labelType = type === 'final' ? 'Final' : 'Inicial';

        const photoTextEmail = `📸 Recuerda hacerle fotografías a todo:
• Caldera existente y placa de fabricación.
• Desmontaje de la caldera.
• Montaje de la aerotermia.
• Fotos de las nuevas placas de fabricación (tanto de la unidad exterior como de la interior).

Las fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.

Puedes subirlas directamente al expediente a través de este enlace:
🔗 ${uploadLink}`;

        const photoTextWA = `📸 Recuerda hacerle fotografías a todo:
• *Caldera existente y placa de fabricación.*
• *Desmontaje de la caldera.*
• *Montaje de la aerotermia.*
• *Fotos de las nuevas placas de fabricación* (tanto de la unidad exterior como de la interior).

Las fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.

Puedes subirlas directamente al expediente a través de este enlace:
🔗 ${uploadLink}`;

        const closingTextEmail = `Una vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.\n\n¡Muchas gracias!\nBROKERGY — Ingeniería Energética`;
        const closingTextWA = `Una vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;

        // ─── NOTIFICACIÓN AL CLIENTE ───────────────────────────────────────────
        if (target === 'CLIENTE' || target === 'AMBOS') {
            const subject = `Certificado de Eficiencia Energética ${labelType} presentado - Expediente ${numExp}`;
            
            // Email (Normal)
            if (sendEmail && cli.email) {
                const intro = `¡Hola ${clienteName}! 👋\n\nTe escribimos para comunicarte que ya ha sido presentado el Certificado de Eficiencia Energética ${labelType} de tu expediente ${numExp}.`;
                const body = type === 'inicial' 
                    ? `${intro}\n\n${photoTextEmail}\n\n${closingTextEmail}`
                    : `${intro}\n\nYa puedes proceder con los siguientes pasos de tu expediente.\n\n¡Muchas gracias!\nBROKERGY — Ingeniería Energética`;
                await emailService.sendMail({ to: cli.email, subject, text: body }).catch(e => console.error('Error Email Cliente:', e.message));
            }

            // WhatsApp (Negritas)
            if (sendWA && cli.tlf && whatsappService) {
                const waIntro = `¡Hola *${clienteName}*! 👋\n\nTe escribimos para comunicarte que ya ha sido presentado el *Certificado de Eficiencia Energética ${labelType.toUpperCase()}* de tu expediente *${numExp}*.`;
                const waBody = type === 'inicial'
                    ? `${waIntro}\n\n${photoTextWA}\n\n${closingTextWA}`
                    : `${waIntro}\n\nYa puedes proceder con los siguientes pasos de tu expediente.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
                await whatsappService.sendText(cli.tlf, waBody).catch(e => console.error('Error WA Cliente:', e.message));
            }
        }

        // ─── NOTIFICACIÓN AL PARTNER ───────────────────────────────────────────
        if (target === 'PARTNER' || target === 'AMBOS') {
            if (op.prescriptor_id) {
                const { data: partner } = await supabase.from('prescriptores').select('*').eq('id_empresa', op.prescriptor_id).maybeSingle();
                if (partner) {
                    let partnerName = (partner.acronimo || partner.razon_social || 'Partner').trim();
                    let targetEmail = partner.email;
                    let targetPhone = partner.tlf;

                    console.log(`[Notify] Partner config:`, { 
                        id: partner.id_empresa, 
                        redirection: partner.contacto_notificaciones_activas, 
                        contactPhone: partner.tlf_contacto, 
                        mainPhone: partner.tlf 
                    });

                    // Redirección a persona de contacto si está activo
                    const isRedirectionActive = partner.contacto_notificaciones_activas === true || partner.contacto_notificaciones_activas === 'true' || partner.contacto_notificaciones_activas === 1;
                    
                    if (isRedirectionActive) {
                        if (partner.nombre_contacto) partnerName = partner.nombre_contacto;
                        if (partner.email_contacto) targetEmail = partner.email_contacto;
                        if (partner.tlf_contacto) targetPhone = partner.tlf_contacto;
                        console.log(`[Notify] Redirección ACTIVADA -> Usando: ${targetPhone} / ${targetEmail}`);
                    } else {
                        console.log(`[Notify] Redirección DESACTIVADA -> Usando principal: ${targetPhone} / ${targetEmail}`);
                    }

                    const partnerSubject = `${numExp} - ${clienteFull} · CEE ${labelType.toUpperCase()} Presentado`;
                    
                    // Email (Normal)
                    if (sendEmail && targetEmail) {
                        const intro = `¡Hola ${partnerName}! 👋\n\nTe informamos que ya se ha presentado el Certificado de Eficiencia Energética ${labelType} de tu cliente:`;
                        const info = `Cliente: ${clienteFull}\nDirección: ${ubicacion}\nExpediente: ${numExp}`;
                        const body = type === 'inicial'
                            ? `${intro}\n\n${info}\n\n${photoTextEmail}\n\n${closingTextEmail}`
                            : `${intro}\n\n${info}\n\nEl proceso continúa según lo previsto.\n\n¡Muchas gracias!\nBROKERGY — Ingeniería Energética`;
                        await emailService.sendMail({ to: targetEmail, subject: partnerSubject, text: body }).catch(e => console.error('Error Email Partner:', e.message));
                    }

                    // WhatsApp (Negritas)
                    if (sendWA && targetPhone && whatsappService) {
                        const waIntro = `¡Hola *${partnerName}*! 👋\n\nTe informamos que ya se ha presentado el *Certificado de Eficiencia Energética ${labelType.toUpperCase()}* de tu cliente:`;
                        const waInfo = `*Cliente:* *${clienteFull}*\n*Dirección:* ${ubicacion}\n*Expediente:* ${numExp}`;
                        const waBody = type === 'inicial'
                            ? `${waIntro}\n\n${waInfo}\n\n${photoTextWA}\n\n${closingTextWA}`
                            : `${waIntro}\n\n${waInfo}\n\nEl proceso continúa según lo previsto.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
                        await whatsappService.sendText(targetPhone, waBody).catch(e => console.error('Error WA Partner:', e.message));
                    }
                }
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error notify-registration:', err);
        res.status(500).json({ error: 'Error al enviar notificaciones' });
    }
});

// ─── POST /api/expedientes ────────────────────────────────────────────────────
// Crea un nuevo expediente. Requiere oportunidad_id y cliente_id.
// Este endpoint es usado por el panel de administración y por la calculadora (aceptar)
router.post('/', enforceAuth, async (req, res) => {
    try {
        const { oportunidad_id, cliente_id, numero_expediente } = req.body;

        if (!oportunidad_id) return res.status(400).json({ error: 'oportunidad_id es obligatorio' });
        if (!cliente_id)     return res.status(400).json({ error: 'cliente_id es obligatorio' });

        // 1. Obtener la oportunidad para validar pertenencia y obtener datos para notificación
        const { data: op, error: opErr } = await supabase
            .from('oportunidades')
            .select('*, clientes(*)')
            .eq('id', oportunidad_id)
            .single();

        if (opErr || !op) return res.status(404).json({ error: 'Oportunidad no encontrada' });

        // 2. Si no es ADMIN, validar que sea su oportunidad
        if (req.user.rol_nombre !== 'ADMIN') {
            if (String(op.prescriptor_id) !== String(req.user.prescriptor_id)) {
                return res.status(403).json({ error: 'No tienes permiso para aceptar esta oportunidad' });
            }
        }

        // 3. Llamar al servicio centralizado para crear el expediente
        const newExp = await expedienteService.createExpediente(oportunidad_id, cliente_id, numero_expediente);

        // 3b. Registrar aceptación en historial de la oportunidad
        if (op.datos_calculo?.estado !== 'ACEPTADA') {
            const usuarioLabel = req.user.rol_nombre === 'ADMIN'
                ? `Firma Administrador (${req.user.email})`
                : `Firma Partner (${req.user.razon_social || req.user.acronimo || req.user.email})`;
            const historialEntry = {
                id: Date.now().toString() + '_aceptacion',
                tipo: 'cambio_estado',
                estado: 'ACEPTADA',
                fecha: new Date().toISOString(),
                usuario: usuarioLabel,
            };
            const newHistorial = [...(op.datos_calculo?.historial || []), historialEntry];
            supabase.from('oportunidades').update({
                datos_calculo: { ...(op.datos_calculo || {}), estado: 'ACEPTADA', historial: newHistorial }
            }).eq('id', oportunidad_id).then(({ error: hErr }) => {
                if (hErr) console.error('[Expedientes] Error actualizando historial:', hErr.message);
            });
        }

        // 4. Si es una aceptación por parte de un Distribuidor/Instalador, notificar a administración
        if (req.user.rol_nombre !== 'ADMIN') {
            console.log(`[POST /api/expedientes] Notificando aceptación por parte de ${req.user.acronimo || req.user.email}`);
            
            try {
                const client = op.clientes;
                const dc = op.datos_calculo || {};
                const address = dc.inputs?.direccion || 'No especificada';
                const usuarioName = req.user.acronimo || req.user.razon_social || req.user.email || 'DISTRIBUIDOR';
                const finalNumExp = newExp?.numero_expediente || numero_expediente || op.id_oportunidad;
                
                // --- EXTRACCIÓN DE NOTAS ---
                const notesList = dc.historial?.filter(h => h.tipo === 'comentario') || [];
                const notesStr = notesList.length > 0 
                    ? notesList.map(n => `- ${n.texto} (${n.usuario})`).join('\n')
                    : 'Sin notas adicionales.';

                // Deep link para administración
                const deepLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}?exp=${finalNumExp}`;

                // --- WHATSAPP A ADMIN ---
                const adminMsg = 
`*${op.id_oportunidad || 'EXP'} – ACEPTACIÓN (CALCULADORA)*

¡Hola BROKERGY! 👋
Te informamos que el Distribuidor (*${usuarioName}*) ha aceptado un expediente desde la calculadora:

*Cliente:* ${client?.nombre_razon_social || op.referencia_cliente} ${client?.apellidos || ''}
*Dirección:* ${address}
*Expediente:* ${finalNumExp}
*Origen:* Calculadora de Resultados

*NOTAS:*
${notesStr}

🔗 *Acceso Directo:* ${deepLink}

¡Muchas gracias!
*BROKERGY — Ingeniería Energética*`;

                whatsappService.sendText(process.env.WHATSAPP_ADMIN_CHAT || '34623926179', adminMsg)
                    .catch(e => console.warn('[Expedientes POST] Error WhatsApp Admin:', e.message));

                // --- EMAIL A ADMIN ---
                await emailService.sendAdminNotificationEmail({
                    numeroExpediente: finalNumExp,
                    clientName: `${client?.nombre_razon_social || op.referencia_cliente} ${client?.apellidos || ''}`.trim(),
                    address,
                    distributorName: usuarioName,
                    installerName: 'Ver expediente',
                    notes: notesStr,
                    expedienteId: finalNumExp
                }).catch(e => console.warn('[Expedientes POST] Error Email Admin:', e.message));

            } catch (notifErr) {
                console.error('[Expedientes POST] Error en proceso de notificación:', notifErr.message);
            }
        }


        res.status(201).json(newExp);
    } catch (err) {
        console.error('Error POST expedientes:', err);
        res.status(500).json({ 
            error: 'Error al crear el expediente', 
            details: err.message 
        });
    }
});

// Actualizar parcialmente un expediente (cee, instalacion, documentacion)
router.put('/:id', enforceAuth, async (req, res) => {
    try {
        const body = normalizeData(req.body);
        const { cee, instalacion, documentacion, estado, seguimiento } = body;

        const { data: existing, error: fetchErr } = await supabase
            .from('expedientes')
            .select('id, cee, instalacion, documentacion, estado, seguimiento, cliente_id, oportunidad_id, numero_expediente')

            .eq('id', req.params.id)
            .single();

        if (fetchErr || !existing) return res.status(404).json({ error: 'Expediente no encontrado' });

        const updates = { updated_at: new Date().toISOString() };
        if (cee !== undefined)           updates.cee           = { ...existing.cee,           ...cee };
        if (instalacion !== undefined)   updates.instalacion   = { ...existing.instalacion,   ...instalacion };
        if (seguimiento !== undefined)   updates.seguimiento   = { ...existing.seguimiento,   ...seguimiento };
        
        // ─── AUTOMATIZACIÓN REGISTRO CEE INICIAL ────────────────────────────────
        // Si el estado del CEE Inicial pasa a REGISTRADO, automatizamos tareas básicas
        if (seguimiento?.cee_inicial === 'REGISTRADO' && existing.seguimiento?.cee_inicial !== 'REGISTRADO') {
            if (existing.estado === 'PTE. CEE INICIAL') {
                updates.estado = 'PTE. FIN OBRA';
                console.log(`[Automation] Exp ${req.params.id}: Triggereando cambio a PTE. FIN OBRA por Registro CEE.`);
            }

            // Notificación automática SOLO al Administrador
            (async () => {
                try {
                    const [{ data: cli }, { data: op }] = await Promise.all([
                        supabase.from('clientes').select('*').eq('id_cliente', existing.cliente_id).single(),
                        supabase.from('oportunidades').select('*').eq('id', existing.oportunidad_id).single()
                    ]);
                    
                    if (!cli) return;

                    let techName = 'Técnico no asignado';
                    const certId = cee?.certificador_id || existing.cee?.certificador_id;
                    if (certId) {
                        const { data: certData } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', certId).maybeSingle();
                        if (certData?.razon_social) techName = certData.razon_social;
                    }

                    const numExp = existing.numero_expediente || op?.id_oportunidad || req.params.id;
                    const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
                    const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;

                    await emailService.sendMail({
                        to: 'franciscojavier.moya.s2e2@gmail.com',
                        subject: `${numExp} - ${clienteFull} · CEE INICIAL Presentado.`,
                        text: `Hola, te comunicamos que el certificado de eficiencia energética inicial de la vivienda situada en ${ubicacion} propiedad de ${clienteFull} ya ha sido presentado por el técnico ${techName}.\n\nUn saludo\n\nBROKERGY · Ingeniería Energética.`
                    });
                } catch (err) {
                    console.error('[Automation Error CEE Inicial Admin]', err);
                }
            })();
        }

        // ─── AUTOMATIZACIÓN REGISTRO CEE FINAL ──────────────────────────────────
        if (seguimiento?.cee_final === 'REGISTRADO' && existing.seguimiento?.cee_final !== 'REGISTRADO') {
            (async () => {
                try {
                    const [{ data: cli }, { data: op }] = await Promise.all([
                        supabase.from('clientes').select('*').eq('id_cliente', existing.cliente_id).single(),
                        supabase.from('oportunidades').select('*').eq('id', existing.oportunidad_id).single()
                    ]);
                    
                    if (!cli) return;

                    const numExp = existing.numero_expediente || op?.id_oportunidad || req.params.id;
                    const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
                    const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;

                    let techName = 'Técnico no asignado';
                    const certId = cee?.certificador_id || existing.cee?.certificador_id;
                    if (certId) {
                        const { data: certData } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', certId).maybeSingle();
                        if (certData?.razon_social) techName = certData.razon_social;
                    }

                    await emailService.sendMail({
                        to: 'franciscojavier.moya.s2e2@gmail.com',
                        subject: `${numExp} - ${clienteFull} · CEE FINAL Presentado.`,
                        text: `Hola, te comunicamos que el certificado de eficiencia energética final de la vivienda situada en ${ubicacion} propiedad de ${clienteFull} ya ha sido presentado por el técnico ${techName}.\n\nUn saludo\n\nBROKERGY · Ingeniería Energética.`
                    });
                } catch (err) {
                    console.error('[Automation Error CEE Final Admin]', err);
                }
            })();
        }

        let docObj = existing.documentacion || {};
        if (documentacion !== undefined) docObj = { ...docObj, ...documentacion };
        
        // Log de historial si cambia el estado (incluyendo el forzado por la automatización superior)
        const activeEstado = updates.estado || estado;
        if (activeEstado !== undefined && activeEstado !== existing.estado) {
            updates.estado = activeEstado;
            const hist = docObj.historial || [];
            const usuarioName = req.user.rol_nombre === 'ADMIN' 
                ? 'ADMINISTRADOR' 
                : (req.user.acronimo || req.user.razon_social || 'PARTNER');
            
            hist.push({
                id: Date.now().toString() + '_status',
                estado: activeEstado,
                fecha: new Date().toISOString(),
                usuario: usuarioName
            });
            docObj.historial = hist;
        }

        updates.documentacion = docObj;


        const { data, error } = await supabase
            .from('expedientes')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error PUT expedientes/:id:', err);
        res.status(500).json({ error: 'Error al actualizar el expediente', details: err.message });
    }
});

// Actualizar estado (PATCH /api/expedientes/:id/estado)
router.patch('/:id/estado', enforceAuth, async (req, res) => {
    const { id } = req.params;
    const { nuevo_estado } = req.body;
    try {
        const { data: exp, error: getErr } = await supabase
            .from('expedientes')
            .select('id, estado, documentacion')
            .eq('id', id)
            .single();
            
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        const hist = docObj.historial || [];
        
        const usuarioName = req.user.rol_nombre === 'ADMIN' 
            ? 'ADMINISTRADOR' 
            : (req.user.acronimo || req.user.razon_social || 'PARTNER');

        hist.push({
            id: Date.now().toString() + '_status',
            estado: nuevo_estado,
            fecha: new Date().toISOString(),
            usuario: usuarioName
        });
        
        docObj.historial = hist;

        const { data: upData, error: upErr } = await supabase
            .from('expedientes')
            .update({ 
                estado: nuevo_estado,
                documentacion: docObj,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (upErr) return res.status(500).json({ error: 'Error al actualizar estado.' });
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Añadir un comentario (POST /api/expedientes/:id/comentarios)
router.post('/:id/comentarios', enforceAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const body = normalizeData(req.body);
        const { comentario } = body;
        if (!comentario) return res.status(400).json({ error: 'Comentario vacío.' });
        
        const { data: exp, error: getErr } = await supabase
            .from('expedientes')
            .select('id, documentacion')
            .eq('id', id)
            .single();
            
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        const hist = docObj.historial || [];
        
        const usuarioName = req.user.rol_nombre === 'ADMIN' 
            ? 'ADMINISTRADOR' 
            : (req.user.acronimo || req.user.razon_social || 'PARTNER');

        hist.push({
            id: Date.now().toString() + '_comment',
            tipo: 'comentario',
            texto: comentario,
            fecha: new Date().toISOString(),
            usuario: usuarioName
        });
        
        docObj.historial = hist;

        const { data: upData, error: upErr } = await supabase
            .from('expedientes')
            .update({ 
                documentacion: docObj,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (upErr) return res.status(500).json({ error: 'Error al añadir comentario.' });
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Borrar historial completo (DELETE /api/expedientes/:id/historial)
router.delete('/:id/historial', adminOnly, async (req, res) => {
    const { id } = req.params;
    try {
        const { data: exp, error: getErr } = await supabase.from('expedientes').select('documentacion').eq('id', id).single();
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        docObj.historial = [];
        
        const { data: upData, error: upErr } = await supabase.from('expedientes').update({ documentacion: docObj }).eq('id', id).select().single();
        if (upErr) return res.status(500).json({ error: 'Error al borrar historial.' });
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Borrar entrada específica (DELETE /api/expedientes/:id/historial/:entryId)
router.delete('/:id/historial/:entryId', adminOnly, async (req, res) => {
    const { id, entryId } = req.params;
    try {
        const { data: exp, error: getErr } = await supabase.from('expedientes').select('documentacion').eq('id', id).single();
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        const hist = docObj.historial || [];
        docObj.historial = hist.filter(h => h.id !== entryId);

        const { data: upData, error: upErr } = await supabase.from('expedientes').update({ documentacion: docObj }).eq('id', id).select().single();
        if (upErr) return res.status(500).json({ error: 'Error al borrar entrada.' });
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Actualizar entrada específica (PUT /api/expedientes/:id/historial/:entryId)
router.put('/:id/historial/:entryId', adminOnly, async (req, res) => {
    const { id, entryId } = req.params;
    const { texto } = req.body;
    try {
        if (!texto) return res.status(400).json({ error: 'El texto es obligatorio.' });

        const { data: exp, error: getErr } = await supabase.from('expedientes').select('documentacion').eq('id', id).single();
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        const hist = docObj.historial || [];
        
        const entryIndex = hist.findIndex(h => h.id === entryId);
        if (entryIndex === -1) return res.status(404).json({ error: 'Entrada no encontrada.' });

        // Solo permitir editar comentarios
        if (hist[entryIndex].tipo !== 'comentario') {
            return res.status(403).json({ error: 'Solo se pueden editar notas manuales.' });
        }

        hist[entryIndex].texto = texto;
        hist[entryIndex].updated_at = new Date().toISOString();
        
        docObj.historial = hist;

        const { data: upData, error: upErr } = await supabase.from('expedientes').update({ documentacion: docObj }).eq('id', id).select().single();
        if (upErr) return res.status(500).json({ error: 'Error al actualizar entrada.' });
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// ─── POST /api/expedientes/:id/facturas/upload ────────────────────────────────
// Sube una factura PDF a la carpeta "5.FACTURAS" de la oportunidad en Drive.
// Body JSON: { base64, fileName, mimeType? }
router.post('/:id/facturas/upload', enforceAuth, async (req, res) => {
    try {
        const { base64, fileName, mimeType = 'application/pdf' } = req.body;
        if (!base64 || !fileName) {
            return res.status(400).json({ error: 'base64 y fileName son obligatorios' });
        }

        // Obtener el expediente para encontrar la oportunidad
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        // Obtener el drive_folder_id de la oportunidad
        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo, drive_folder_id')
            .eq('id', exp.oportunidad_id)
            .single();

        const driveFolderId = op?.drive_folder_id || op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) {
            return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada' });
        }

        const { findSubfolderByName, createSubfolder, saveFileToFolder } = require('../services/driveService');

        // Buscar la subcarpeta "5.FACTURAS", crearla si no existe
        let facturasFolderId = await findSubfolderByName(driveFolderId, '5.FACTURAS');
        if (!facturasFolderId) {
            facturasFolderId = await createSubfolder(driveFolderId, '5.FACTURAS');
        }

        const fileBuffer = Buffer.from(base64, 'base64');
        const result = await saveFileToFolder(facturasFolderId, fileName, mimeType, fileBuffer);

        if (!result) return res.status(500).json({ error: 'Error al subir el archivo a Drive' });

        res.json({ drive_link: result.link, drive_id: result.id });
    } catch (err) {
        console.error('Error POST expedientes/:id/facturas/upload:', err);
        res.status(500).json({ error: 'Error al subir la factura', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/documents/upload ───────────────────────────────
// Sube un documento genérico a una ruta de subcarpetas en Drive.
// Body JSON: { base64, fileName, mimeType, subfolders: ["1.CEE", "CEE INICIAL"] }
router.post('/:id/documents/upload', enforceAuth, async (req, res) => {
    try {
        const { base64, fileName, mimeType, subfolders = [] } = req.body;
        if (!base64 || base64.trim() === '' || !fileName) {
            return res.status(400).json({ error: 'base64 y fileName son obligatorios y no pueden estar vacíos' });
        }

        let { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();

        // Fallback: Si no se encuentra por UUID, intentar por numero_expediente (para robustez)
        if (!exp) {
            const { data: expSeq } = await supabase
                .from('expedientes')
                .select('*')
                .eq('numero_expediente', req.params.id)
                .maybeSingle();
            exp = expSeq;
        }

        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const { data: op } = await supabase
            .from('oportunidades')
            .select('*')
            .eq('id', exp.oportunidad_id)
            .single();

        // Asegurar que datos_calculo es un objeto (si viene como string de la DB)
        let normalizedDatos = op?.datos_calculo || {};
        if (typeof normalizedDatos === 'string') {
            try { normalizedDatos = JSON.parse(normalizedDatos); } catch(e) { normalizedDatos = {}; }
        }

        const driveFolderId = op?.drive_folder_id || normalizedDatos?.drive_folder_id || normalizedDatos?.inputs?.drive_folder_id || exp.drive_folder_id;
        console.log(`[POST /documents/upload] ExpID: ${req.params.id}, OpID: ${exp.oportunidad_id}`);
        console.log(`[POST /documents/upload] driveFolderId identified: ${driveFolderId}`);

        if (!driveFolderId) {
            console.error(`[POST /documents/upload] Drive folder missing for opportunity ${exp.oportunidad_id}`);
            return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada' });
        }

        const { getOrCreateSubfolder, saveFileToFolder } = require('../services/driveService');

        // Navegar/Crear la estructura de subcarpetas
        let currentFolderId = driveFolderId;
        for (const sub of subfolders) {
            console.log(`[POST /documents/upload] Navigating to subfolder: ${sub} (parent: ${currentFolderId})`);
            currentFolderId = await getOrCreateSubfolder(currentFolderId, sub);
        }
        console.log(`[POST /documents/upload] Final target FolderID: ${currentFolderId}`);

        const fileBuffer = Buffer.from(base64, 'base64');
        const result = await saveFileToFolder(currentFolderId, fileName, mimeType || 'application/octet-stream', fileBuffer);

        if (!result) return res.status(500).json({ error: 'Error al subir el archivo a Drive' });

        res.json({ drive_link: result.link, drive_id: result.id });
    } catch (err) {
        console.error('Error POST expedientes/:id/documents/upload:', err);
        res.status(500).json({ error: 'Error al subir el documento', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/documents/upload-budget ────────────────────────
// Sube el presupuesto del instalador. 
// Nombre fijo: "PRESUPUESTO DE LA INSTALACIÓN.pdf"
// Si ya existe, se renombra el anterior a "..._old.pdf"
// Si es imagen, se convierte a PDF.
router.post('/:id/documents/upload-budget', enforceAuth, async (req, res) => {
    try {
        const { base64, mimeType } = req.body;
        if (!base64) return res.status(400).json({ error: 'base64 es obligatorio' });

        const { data: exp } = await supabase.from('expedientes').select('*, oportunidades(*)').eq('id', req.params.id).maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const op = exp.oportunidades;
        const driveFolderId = op?.drive_folder_id || exp.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'No hay carpeta de Drive' });

        const { getOrCreateSubfolder, findFileByName, renameFolder, deleteFile, saveFileToFolder } = require('../services/driveService');
        const { imageToPdf } = require('../services/pdfService');

        // Carpeta destino: 2.ANEXOS / PRESUPUESTO INSTALADOR
        const anexosId = await getOrCreateSubfolder(driveFolderId, '2.ANEXOS');
        const targetFolderId = await getOrCreateSubfolder(anexosId, 'PRESUPUESTO INSTALADOR');

        const finalFileName = 'PRESUPUESTO DE LA INSTALACIÓN.pdf';
        const oldFileName = 'PRESUPUESTO DE LA INSTALACIÓN_old.pdf';

        // 1. Manejar sustitución (Versioning simple)
        const existingId = await findFileByName(targetFolderId, finalFileName);
        if (existingId) {
            const oldId = await findFileByName(targetFolderId, oldFileName);
            if (oldId) await deleteFile(oldId); // Borrar el _old anterior si existe
            await renameFolder(existingId, oldFileName); // Renombrar el actual a _old
        }

        // 2. Procesar archivo (Convertir a PDF si es imagen)
        let fileBuffer = Buffer.from(base64, 'base64');
        let finalMime = 'application/pdf';

        if (mimeType && (mimeType.includes('image/jpeg') || mimeType.includes('image/png') || mimeType.includes('image/jpg'))) {
            console.log(`[Upload-Budget] Detectada imagen (${mimeType}), convirtiendo a PDF...`);
            fileBuffer = await imageToPdf(base64, mimeType);
        } else if (mimeType && mimeType.includes('pdf')) {
            finalMime = 'application/pdf';
        }

        // 3. Guardar en Drive
        const result = await saveFileToFolder(targetFolderId, finalFileName, finalMime, fileBuffer);
        if (!result) throw new Error('Error al guardar en Drive');

        res.json({ success: true, link: result.link });
    } catch (err) {
        console.error('Error upload-budget:', err);
        res.status(500).json({ error: 'Error al subir presupuesto', details: err.message });
    }
});

// ─── DELETE /api/expedientes/:id ──────────────────────────────────────────────
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'ADMIN') {
            return res.status(403).json({ error: 'Solo el administrador puede eliminar expedientes' });
        }
        const { error } = await supabase
            .from('expedientes')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('Error DELETE expedientes/:id:', err);
        res.status(500).json({ error: 'Error al eliminar el expediente' });
    }
});



// ─── GET /api/expedientes/proxy/pdf ──────────────────────────────────────────
// Proxy para descargar PDFs externos sin problemas de CORS en el frontend
router.get('/proxy/pdf', enforceAuth, async (req, res) => {
    let { url } = req.query;
    if (!url) return res.status(400).send('URL missing');

    // Transformación automática para enlaces de Google Drive
    if (url.includes('drive.google.com')) {
        // Soporta /file/d/ID/view, /open?id=ID, /file/d/ID/edit, etc.
        const driveIdMatch = url.match(/\/file\/d\/([^\/\?]+)/) || url.match(/[?&]id=([^\&]+)/);
        if (driveIdMatch) {
            url = `https://docs.google.com/uc?export=download&id=${driveIdMatch[1]}`;
            console.log(`[Proxy] Detected Google Drive URL, transformed to: ${url}`);
        }
    }

    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer', 
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const contentType = response.headers['content-type'];
        if (contentType && !contentType.includes('pdf') && !url.includes('download')) {
             console.warn(`[Proxy] Advertencia: El contenido descargado no parece un PDF (${contentType})`);
        }

        res.set('Content-Type', contentType || 'application/pdf');
        res.send(response.data);
    } catch (err) {
        console.error('Error in proxy-pdf:', err.message);
        res.status(500).send('Error fetching PDF');
    }
});

// POST /api/expedientes/:id/notify-certificador
// Asigna un certificador al expediente, le da acceso Editor a la subcarpeta
// "12. DOCUMENTOS PARA CEE" del Drive del expediente, persiste el folder ID en
// expediente.cee y opcionalmente envía el email de directrices técnicas.
//
// Body: { certificador_id?: string, sendEmail?: boolean }
//   - certificador_id: si viene, se persiste antes de procesar (evita race con save del módulo)
//   - sendEmail (default true): si false, ejecuta toda la asignación pero no envía mail
router.post('/:id/notify-certificador', enforceAuth, async (req, res) => {
    const driveService = require('../services/driveService');
    const CEE_FOLDER_NAME = '12. DOCUMENTOS PARA CEE';

    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const bodyCertId = req.body?.certificador_id || null;
        const sendEmail = req.body?.sendEmail !== false; // default true
        const dbCertId = exp.cee?.certificador_id || null;
        const certId = bodyCertId || dbCertId;
        if (!certId) return res.status(400).json({ error: 'El expediente no tiene certificador asignado' });

        // Persistir el cert si vino en body y difiere del guardado
        let workingCee = { ...(exp.cee || {}) };
        if (bodyCertId && bodyCertId !== dbCertId) {
            workingCee.certificador_id = bodyCertId;
        }

        const [
            { data: cert },
            { data: cli },
            { data: op }
        ] = await Promise.all([
            supabase.from('prescriptores').select('razon_social, acronimo, email').eq('id_empresa', certId).maybeSingle(),
            supabase.from('clientes').select('nombre_razon_social, apellidos').eq('id_cliente', exp.cliente_id).maybeSingle(),
            supabase.from('oportunidades').select('id_oportunidad, ficha, datos_calculo').eq('id', exp.oportunidad_id).maybeSingle()
        ]);

        if (!cert) return res.status(404).json({ error: 'Certificador no encontrado en la base de datos' });
        if (!cert.email) {
            return res.status(400).json({
                error: `El certificador "${cert.razon_social || cert.acronimo || ''}" no tiene email registrado en su ficha. Edítalo desde Prescriptores.`
            });
        }

        const ficha = op?.ficha || 'RES060';
        const dc = op?.datos_calculo || {};
        const result = dc.result || {};
        const inputs = dc.inputs || {};

        // Demanda objetivo en cascada de fallbacks (algunos expedientes antiguos no tienen Q_net en result)
        const superficieRef = parseFloat(inputs.superficieCalefactable) || parseFloat(inputs.surface) || null;
        const demandaPerM2 = parseFloat(inputs.demand_per_m2) || parseFloat(inputs.demandaCalefaccion) || null;
        const demandaObjetivo =
            parseFloat(result.Q_net) ||
            parseFloat(dc.Q_net) ||
            (superficieRef && demandaPerM2 ? superficieRef * demandaPerM2 : null);
        const ahorroObjetivo = parseFloat(result.res080?.ahorroEnergiaFinalTotal) || null;

        const expedienteNum = exp.numero_expediente || op?.id_oportunidad || req.params.id;
        const clienteName = cli
            ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() || null
            : null;
        const certName = cert.razon_social || cert.acronimo || 'Técnico';
        const portalLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/expedientes/${req.params.id}`;

        // ── Drive: localizar subcarpeta CEE y dar permiso Editor al cert ────────
        let ceeFolderId = workingCee.cee_folder_id || null;
        let ceeFolderLink = workingCee.cee_folder_link || null;
        let driveAccessGranted = false;

        const rootFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id || null;
        if (rootFolderId) {
            try {
                if (!ceeFolderId) {
                    ceeFolderId = await driveService.getOrCreateSubfolder(rootFolderId, CEE_FOLDER_NAME);
                }
                if (ceeFolderId && !ceeFolderLink) {
                    ceeFolderLink = await driveService.getWebViewLink(ceeFolderId);
                }
                if (ceeFolderId) {
                    await driveService.grantPermissionToEmail(ceeFolderId, cert.email, 'writer');
                    driveAccessGranted = true;
                    workingCee.cee_folder_id = ceeFolderId;
                    workingCee.cee_folder_link = ceeFolderLink;
                }
            } catch (driveErr) {
                console.error('[notify-certificador] error Drive:', driveErr.message);
                // No bloqueamos: seguimos con el email aunque falle el permiso Drive
            }
        } else {
            console.warn('[notify-certificador] Oportunidad sin drive_folder_id — sin acceso Drive para el cert');
        }

        // Persistir cee actualizado (cert_id + folder ids)
        const { error: updErr } = await supabase
            .from('expedientes')
            .update({ cee: workingCee })
            .eq('id', req.params.id);
        if (updErr) console.error('[notify-certificador] error persistiendo cee:', updErr.message);

        // Email opcional
        if (sendEmail) {
            await emailService.sendCertificadorNotificationEmail({
                to: cert.email,
                certName,
                expedienteNum,
                clienteName,
                ficha,
                ceeFolderLink,
                portalLink,
                demandaObjetivo,
                superficieRef,
                ahorroObjetivo,
            });
        }

        res.json({
            ok: true,
            sentTo: sendEmail ? cert.email : null,
            certName,
            ceeFolderId,
            ceeFolderLink,
            driveAccessGranted,
            emailSent: sendEmail,
        });
    } catch (err) {
        console.error('[notify-certificador]', err.message);
        res.status(500).json({ error: 'Error procesando la asignación', details: err.message });
    }
});

// Regenerar número de expediente (PATCH /api/expedientes/:id/regenerar-numero)
// Se usa cuando se cambia de programa (Aerotermia <-> Reforma) después de creado
router.patch('/:id/regenerar-numero', adminOnly, async (req, res) => {
    try {
        const { targetProgram } = req.body;
        const usuarioName = req.user.rol_nombre === 'ADMIN' 
            ? 'ADMINISTRADOR' 
            : (req.user.acronimo || req.user.razon_social || 'PARTNER');

        const result = await expedienteService.migrateExpedienteProgram(req.params.id, usuarioName, targetProgram);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error al regenerar número:', error.message);
        res.status(500).json({ error: 'Error al regenerar el número de expediente', details: error.message });
    }
});

module.exports = router;
