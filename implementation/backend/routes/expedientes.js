const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../services/supabaseClient');
const { enforceAuth, adminOnly } = require('../middleware/auth');
const { getCoordinatesByRC } = require('../services/catastroService');
const { normalizeData } = require('../utils/normalization');
const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');


// ─── Helpers de notificación CEE registrado ───────────────────────────────────
// Extraídos de los IIFE async dentro de PUT /:id para que también se puedan
// re-disparar manualmente desde POST /:id/resend-cee-notifications.

async function loadNotificationContext(expediente) {
    const [{ data: cli }, { data: op }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id_cliente', expediente.cliente_id).single(),
        supabase.from('oportunidades').select('*').eq('id', expediente.oportunidad_id).single()
    ]);

    let techName = 'Técnico no asignado';
    const certId = expediente.cee?.certificador_id;
    if (certId) {
        const { data: certData } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', certId).maybeSingle();
        if (certData?.razon_social) techName = certData.razon_social;
    }

    let partnerPhone = null;
    let partnerEmail = null;
    if (op?.prescriptor_id && String(op.prescriptor_id) !== '1') {
        const { data: pData } = await supabase.from('prescriptores').select('telefono, email').eq('id_empresa', op.prescriptor_id).maybeSingle();
        if (pData) {
            partnerPhone = pData.telefono;
            partnerEmail = pData.email;
        }
    }

    return { cli, op, techName, partnerPhone, partnerEmail };
}

async function notifyCeeInicialRegistrado(expediente) {
    const tag = `[CEE-INICIAL ${expediente.id}]`;
    try {
        const { cli, op, techName, partnerPhone, partnerEmail } = await loadNotificationContext(expediente);
        if (!cli) {
            console.warn(`${tag} cliente_id=${expediente.cliente_id} no encontrado, abortando notificaciones`);
            return { ok: false, reason: 'cliente-not-found' };
        }

        const numExp = expediente.numero_expediente || op?.id_oportunidad || expediente.id;
        const clienteName = (cli.nombre_razon_social || 'Cliente').trim();
        const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;
        const portalLink = `https://app.brokergy.es/firma/${op?.id || expediente.id}`;
        const expedienteLink = `https://app.brokergy.es/expedientes/${expediente.id}`;

        const waState = whatsappService.getStatus?.()?.state || 'unknown';
        const cliPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
        console.log(`${tag} Disparando notificaciones (whatsappState=${waState}, cliente=${cliPhone || 'sin tlf'}, partner=${partnerPhone || 'sin partner'})`);

        const channels = { whatsapp: [], email: [] };

        // --- WHATSAPP ---
        const clientMsg = `¡Hola *${clienteName}*! 👋\n\nTe escribimos para comunicarte que ya ha sido presentado el *Certificado de Eficiencia Energética INICIAL* de tu expediente *${numExp}*.\n\n*Desde este momento ya se pueden emitir facturas y pagos*\n\n📸 Recuerda hacerle fotografías a todo:\n• *Caldera existente y placa de fabricación.*\n• *Desmontaje de la caldera.*\n• *Montaje de la aerotermia.*\n• *Fotos de las nuevas placas de fabricación* (tanto de la unidad exterior como de la interior).\n\nLas fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.\n\nPuedes subirlas directamente al expediente a través de este enlace:\n🔗 ${portalLink}\n\nUna vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
        const staffMsg = `✅ *REGISTRO CEE INICIAL PRESENTADO*\nExpediente: ${numExp}\nCliente: ${clienteFull}\n\nSe ha subido el justificante de registro del CEE Inicial al sistema. Desde este momento ya se pueden emitir facturas y pagos.\n\nVer expediente:\n🔗 ${expedienteLink}`;

        if (cliPhone) {
            channels.whatsapp.push('cliente');
            whatsappService.sendText(cliPhone, clientMsg)
                .catch(e => console.error(`${tag} WhatsApp Cliente (state=${waState}, phone=${cliPhone}):`, e.message));
        } else {
            console.warn(`${tag} Cliente sin teléfono, no se envía WhatsApp`);
        }

        const adminPhone = process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
        channels.whatsapp.push('admin');
        whatsappService.sendText(adminPhone, staffMsg)
            .catch(e => console.error(`${tag} WhatsApp Admin (state=${waState}):`, e.message));

        if (partnerPhone) {
            channels.whatsapp.push('partner');
            whatsappService.sendText(partnerPhone, staffMsg)
                .catch(e => console.error(`${tag} WhatsApp Partner (state=${waState}, phone=${partnerPhone}):`, e.message));
        }

        // --- EMAIL ---
        if (cli.email) {
            channels.email.push('cliente');
            await emailService.sendCeeInicialRegistradoClientEmail(cli.email, clienteName, numExp, portalLink)
                .catch(e => console.error(`${tag} Email Cliente:`, e.message));
        }
        channels.email.push('admin');
        await emailService.sendCeeRegistradoStaffEmail('franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, techName, 'CEE INICIAL', expedienteLink)
            .catch(e => console.error(`${tag} Email Admin:`, e.message));
        if (partnerEmail) {
            channels.email.push('partner');
            await emailService.sendCeeRegistradoStaffEmail(partnerEmail, true, numExp, clienteFull, ubicacion, techName, 'CEE INICIAL', expedienteLink)
                .catch(e => console.error(`${tag} Email Partner:`, e.message));
        }

        console.log(`${tag} Disparado: whatsapp=[${channels.whatsapp.join(',')}] email=[${channels.email.join(',')}]`);
        return { ok: true, whatsappState: waState, channels };
    } catch (err) {
        console.error(`${tag} Error en notificaciones:`, err);
        return { ok: false, reason: err.message };
    }
}

async function notifyCeeFinalRegistrado(expediente) {
    const tag = `[CEE-FINAL ${expediente.id}]`;
    try {
        const { cli, op, techName, partnerPhone, partnerEmail } = await loadNotificationContext(expediente);
        if (!cli) {
            console.warn(`${tag} cliente_id=${expediente.cliente_id} no encontrado, abortando notificaciones`);
            return { ok: false, reason: 'cliente-not-found' };
        }

        const numExp = expediente.numero_expediente || op?.id_oportunidad || expediente.id;
        const clienteName = (cli.nombre_razon_social || 'Cliente').trim();
        const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;
        const expedienteLink = `https://app.brokergy.es/expedientes/${expediente.id}`;

        const waState = whatsappService.getStatus?.()?.state || 'unknown';
        const cliPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
        console.log(`${tag} Disparando notificaciones (whatsappState=${waState}, cliente=${cliPhone || 'sin tlf'}, partner=${partnerPhone || 'sin partner'})`);

        const channels = { whatsapp: [], email: [] };

        const clientMsg = `¡Hola *${clienteName}*! 👋\n\nTe comunicamos que ya ha sido presentado el *Certificado de Eficiencia Energética FINAL* de tu expediente *${numExp}*.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
        const staffMsg = `✅ *REGISTRO CEE FINAL PRESENTADO*\nExpediente: ${numExp}\nCliente: ${clienteFull}\n\nSe ha subido el justificante de registro del CEE Final al sistema.\n\nVer expediente:\n🔗 ${expedienteLink}`;

        if (cliPhone) {
            channels.whatsapp.push('cliente');
            whatsappService.sendText(cliPhone, clientMsg)
                .catch(e => console.error(`${tag} WhatsApp Cliente (state=${waState}, phone=${cliPhone}):`, e.message));
        } else {
            console.warn(`${tag} Cliente sin teléfono, no se envía WhatsApp`);
        }

        const adminPhone = process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
        channels.whatsapp.push('admin');
        whatsappService.sendText(adminPhone, staffMsg)
            .catch(e => console.error(`${tag} WhatsApp Admin (state=${waState}):`, e.message));

        if (partnerPhone) {
            channels.whatsapp.push('partner');
            whatsappService.sendText(partnerPhone, staffMsg)
                .catch(e => console.error(`${tag} WhatsApp Partner (state=${waState}, phone=${partnerPhone}):`, e.message));
        }

        // --- EMAIL ---
        channels.email.push('admin');
        await emailService.sendCeeRegistradoStaffEmail('franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, techName, 'CEE FINAL', expedienteLink)
            .catch(e => console.error(`${tag} Email Admin:`, e.message));
        if (partnerEmail) {
            channels.email.push('partner');
            await emailService.sendCeeRegistradoStaffEmail(partnerEmail, true, numExp, clienteFull, ubicacion, techName, 'CEE FINAL', expedienteLink)
                .catch(e => console.error(`${tag} Email Partner:`, e.message));
        }

        console.log(`${tag} Disparado: whatsapp=[${channels.whatsapp.join(',')}] email=[${channels.email.join(',')}]`);
        return { ok: true, whatsappState: waState, channels };
    } catch (err) {
        console.error(`${tag} Error en notificaciones:`, err);
        return { ok: false, reason: err.message };
    }
}


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
            .order('updated_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (simpleErr) throw simpleErr;

        let data = simpleData || [];

        // Filtro adicional por cliente/oportunidad si no es ADMIN ni CERTIFICADOR
        if (!canViewAll && req.user.rol_nombre !== 'CERTIFICADOR') {
            if (!req.user.prescriptor_id) return res.json([]);

            // Ambas queries son independientes → en paralelo
            const [{ data: clienteIdsData }, { data: opIdsData }] = await Promise.all([
                supabase.from('clientes').select('id_cliente').eq('prescriptor_id', req.user.prescriptor_id),
                supabase.from('oportunidades').select('id').eq('prescriptor_id', req.user.prescriptor_id)
            ]);
            const clienteIds = clienteIdsData;
            const opIds = opIdsData;

            const validClientIds = new Set((clienteIds || []).map(c => c.id_cliente));
            const validOpIds    = new Set((opIds || []).map(o => o.id));

            if (validClientIds.size === 0 && validOpIds.size === 0) return res.json([]);
            data = data.filter(r => validClientIds.has(r.cliente_id) || validOpIds.has(r.oportunidad_id));
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
                supabase.from('oportunidades').select('id, id_oportunidad, referencia_cliente, ficha, ref_catastral, datos_calculo, prescriptor_id').in('id', opIds)
            ]);


            const cliMap = Object.fromEntries((clientesData || []).map(c => [c.id_cliente, c]));
            const opMap  = Object.fromEntries((opsData || []).map(o => [o.id, o]));

            data = data.map(r => ({
                ...r,
                clientes:      cliMap[r.cliente_id]      || null,
                oportunidades: opMap[r.oportunidad_id]   || null,
            }));
        }

        // Excluir `documentacion` del payload del listado — solo se usa en el modal
        // de historial, que ya hace su propio GET /:id con el dato completo.
        // Reduce significativamente el tamaño de la respuesta.
        data = data.map(r => {
            const { documentacion, ...rest } = r;
            return rest;
        });

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
            const cliWaPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
            if (sendWA && cliWaPhone && whatsappService) {
                const waIntro = `¡Hola *${clienteName}*! 👋\n\nTe escribimos para comunicarte que ya ha sido presentado el *Certificado de Eficiencia Energética ${labelType.toUpperCase()}* de tu expediente *${numExp}*.`;
                const waBody = type === 'inicial'
                    ? `${waIntro}\n\n${photoTextWA}\n\n${closingTextWA}`
                    : `${waIntro}\n\nYa puedes proceder con los siguientes pasos de tu expediente.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
                await whatsappService.sendText(cliWaPhone, waBody).catch(e => console.error('Error WA Cliente:', e.message));
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
        // Cambio de estado automático cuando el CEE Inicial pasa a REGISTRADO.
        // Las notificaciones (cliente/partner/admin) las decide el ADMIN desde el
        // popup del frontend (/notify-registration). El botón "Omitir" del popup
        // debe omitir de verdad, así que NO disparamos nada automático aquí.
        if (seguimiento?.cee_inicial === 'REGISTRADO' && existing.seguimiento?.cee_inicial !== 'REGISTRADO') {
            if (existing.estado === 'PTE. CEE INICIAL') {
                updates.estado = 'PTE. FIN OBRA';
            }
            console.log(`[Automation] Exp ${req.params.id}: CEE INICIAL → REGISTRADO`);
        }

        // ─── AUTOMATIZACIÓN REGISTRO CEE FINAL ──────────────────────────────────
        if (seguimiento?.cee_final === 'REGISTRADO' && existing.seguimiento?.cee_final !== 'REGISTRADO') {
            console.log(`[Automation] Exp ${req.params.id}: CEE FINAL → REGISTRADO`);
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
        
        const { data: upData, error: upErr } = await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', id).select().single();
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

        const { data: upData, error: upErr } = await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', id).select().single();
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

        const { data: upData, error: upErr } = await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', id).select().single();
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
// Notificar al certificador asignado (multi-canal, multi-plantilla, trazabilidad)
// Body: { certificador_id?, sendEmail?, sendWhatsApp?, phase?, template? }
router.post('/:id/notify-certificador', enforceAuth, async (req, res) => {
    const driveService = require('../services/driveService');
    const crypto = require('crypto');
    const CEE_FOLDER_NAME = '12. DOCUMENTOS PARA CEE';

    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const bodyCertId = req.body?.certificador_id || null;
        const sendEmail = req.body?.sendEmail === true;
        const sendWhatsApp = req.body?.sendWhatsApp === true;
        const phase = req.body?.phase || 'initial';
        const template = req.body?.template || 'standard';
        const priority = req.body?.priority === 'urgent' ? 'urgent' : 'normal';
        const adminMessage = (req.body?.adminMessage || '').trim() || null;
        const dbCertId = exp.cee?.certificador_id || null;
        const certId = bodyCertId || dbCertId;
        if (!certId) return res.status(400).json({ error: 'El expediente no tiene certificador asignado' });

        // Automatización de estado
        const newEstado = phase === 'final' ? 'EN CERTIFICADOR CEE FINAL' : 'EN CERTIFICADOR CEE INICIAL';
        await supabase.from('expedientes').update({ estado: newEstado, updated_at: new Date().toISOString() }).eq('id', req.params.id);

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
            supabase.from('prescriptores').select('*').eq('id_empresa', certId).maybeSingle(),
            supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle(),
            supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).maybeSingle()
        ]);

        if (!cert) return res.status(404).json({ error: 'Certificador no encontrado en la base de datos' });
        if (!cert.email && sendEmail) {
            return res.status(400).json({
                error: `El certificador "${cert.razon_social || cert.acronimo || ''}" no tiene email registrado en su ficha. Edítalo desde Prescriptores.`
            });
        }

        const ficha = op?.ficha || 'RES060';
        const dc = op?.datos_calculo || {};
        const result = dc.result || {};
        const inputs = dc.inputs || {};

        // Demanda objetivo: priorizamos kWh/m²·año (q_net) sobre el total (Q_net)
        const superficieRef = parseFloat(inputs.superficieCalefactable) || parseFloat(inputs.surface) || null;
        const demandaPerM2 =
            parseFloat(result.q_net) ||
            parseFloat(inputs.demand_per_m2) ||
            parseFloat(inputs.demandaCalefaccion) ||
            (superficieRef && parseFloat(result.Q_net) ? parseFloat(result.Q_net) / superficieRef : null);
        const demandaObjetivoTotal =
            parseFloat(result.Q_net) ||
            parseFloat(dc.Q_net) ||
            (superficieRef && demandaPerM2 ? superficieRef * demandaPerM2 : null);
        const ahorroObjetivo = parseFloat(result.res080?.ahorroEnergiaFinalTotal) || null;

        const expedienteNum = exp.numero_expediente || op?.id_oportunidad || req.params.id;
        
        // Prioridad de nombre: 1. Tabla clientes, 2. Referencia cliente en Oportunidad
        const clienteName = (cli
            ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim()
            : null) || op?.referencia_cliente || null;

        // Datos completos del cliente con fallbacks. Evitamos duplicados si la dirección base ya es completa.
        const baseDir = (inputs.direccion || inputs.address || cli?.direccion || '').trim();
        const cp = (cli?.codigo_postal || inputs.cp || '').trim();
        const municipio = (cli?.municipio || inputs.municipio || '').trim();
        const provincia = (cli?.provincia || inputs.provincia || '').trim();

        let direccionCompleta = baseDir;
        
        // Si la dirección base es corta (solo la calle), añadimos el resto. 
        // Si ya contiene el código postal o el municipio, la dejamos como está.
        if (baseDir.length < 30 && cp && !baseDir.includes(cp)) {
            direccionCompleta = [baseDir, cp, municipio, provincia ? `(${provincia})` : null].filter(Boolean).join(', ');
        }

        const clienteData = {
            nombre: clienteName,
            dni: cli?.dni || inputs.dni || null,
            tlf: cli?.tlf || cli?.telefono || inputs.tlf || inputs.phone || null,
            email: cli?.email || inputs.email || null,
            refCatastral: op?.ref_catastral || inputs.rc || inputs.referencia_catastral || null,
            direccion: direccionCompleta || null,
        };

        const certName = cert.razon_social || cert.acronimo || 'Técnico';
        const portalLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${req.params.id}`;

        // Tipo de actuación para el asunto del email
        const tipoActuacion =
            ficha === 'RES080' ? 'REFORMA' :
            ficha === 'RES093' ? 'HIBRIDACIÓN' :
            'AEROTERMIA';

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

        // ── Token de confirmación (cert-ack) ─────────────────────────────────────
        const ackToken = crypto.createHash('sha256')
            .update(`${req.params.id}-${certId}-${Date.now()}`)
            .digest('hex').slice(0, 32);
        workingCee.ack_token = ackToken;
        workingCee.ack_phase = phase;
        const ackLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/cert-ack/${req.params.id}?token=${ackToken}&phase=${phase}`;

        // Persistir cee actualizado (cert_id + folder ids + ack_token)
        const seguimiento = exp.seguimiento || { cee_inicial: 'PTE_EMITIR', cee_final: 'PTE_EMITIR', anexos: 'PTE_EMITIR' };
        
        // Solo actualizamos el Roadmap a ASIGNADO si es un nuevo encargo (standard). 
        // Si es un recordatorio (reminder) o aviso urgente (urgent), no tocamos el Roadmap para no perder la trazabilidad.
        if (template === 'standard') {
            if (phase === 'final') {
                seguimiento.cee_final = 'ASIGNADO';
            } else {
                seguimiento.cee_inicial = 'ASIGNADO';
            }
        }

        const { error: updErr } = await supabase
            .from('expedientes')
            .update({ cee: workingCee, seguimiento, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (updErr) console.error('[notify-certificador] error persistiendo cee:', updErr.message);

        // ── Envío de comunicaciones ──────────────────────────────────────────────
        const channels = [];
        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const templateLabels = { standard: 'Encargo', reminder: 'Recordatorio', urgent: 'Urgente' };

        // === EMAIL ===
        if (sendEmail) {
            const emailParams = {
                to: cert.email,
                certName,
                expedienteNum,
                clienteName,
                clienteData,
                ficha,
                tipoActuacion,
                ceeFolderLink,
                portalLink,
                ackLink,
                priority,
                adminMessage,
            };

            if (template === 'reminder') {
                await emailService.sendCertificadorReminderEmail(emailParams);
            } else if (template === 'urgent') {
                await emailService.sendCertificadorUrgentEmail(emailParams);
            } else if (phase === 'final') {
                await emailService.sendCertificadorFinalNotificationEmail(emailParams);
            } else {
                await emailService.sendCertificadorNotificationEmail({
                    ...emailParams,
                    demandaPerM2,
                    superficieRef,
                    ahorroObjetivo
                });
            }
            channels.push('Email');
        }

        // === WHATSAPP VÍA COLA ===
        if (sendWhatsApp) {
            const certPhone = cert.telefono || cert.movil || cert.tlf || null;
            if (!certPhone) {
                console.warn('[notify-certificador] Certificador sin teléfono para WhatsApp');
            } else {
                const urgentWaPrefix = priority === 'urgent' && template === 'standard' ? '🚨 *URGENTE* 🚨\n\n' : '';
                const adminMsgWa = adminMessage ? `\n💬 *Mensaje:* ${adminMessage}\n` : '';

                let waMsg = '';
                if (template === 'reminder') {
                    waMsg = `¡Hola *${certName}*! 👋\n\nTe recordamos que tienes pendiente el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\n¿Podrías darnos una estimación de fecha de entrega?\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n*BROKERGY · Ingeniería Energética*`;
                } else if (template === 'urgent') {
                    waMsg = `*⚠️ AVISO URGENTE*\n\nHola *${certName}*, necesitamos con urgencia el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\nEs importante que lo priorices para cumplir con los plazos del programa.\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\nQuedamos a la espera.\n*BROKERGY · Ingeniería Energética*`;
                } else if (phase === 'final') {
                    waMsg = `${urgentWaPrefix}¡Hola *${certName}*! 👋\n\nYa puedes presentar el *CEE FINAL* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\nToda la documentación de obra ya está en la carpeta compartida.${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n*BROKERGY · Ingeniería Energética*`;
                } else {
                    waMsg = `${urgentWaPrefix}¡Hola *${certName}*! 👋\n\nTe hemos asignado el expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''} para el *CEE Inicial*.\n\nTienes toda la documentación en la carpeta y el portal.${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n*BROKERGY · Ingeniería Energética*`;
                }

                try {
                    await whatsappService.sendText(certPhone, waMsg);
                    channels.push('WhatsApp');
                } catch (waErr) {
                    console.error('[notify-certificador] Error WhatsApp:', waErr.message);
                    channels.push('WhatsApp (encolado)');
                }
            }
        }

        // ── Registro en historial (Trazabilidad) ────────────────────────────────
        if (channels.length > 0) {
            try {
                const docObj = exp.documentacion || {};
                const historial = docObj.historial || [];
                const userName = req.user?.rol_nombre === 'ADMIN'
                    ? 'ADMINISTRADOR'
                    : (req.user?.acronimo || req.user?.razon_social || 'SISTEMA');

                const priorityTag = priority === 'urgent' ? ' · 🚨 URGENTE' : '';
                const msgTag = adminMessage ? `\n💬 Mensaje: "${adminMessage}"` : '';
                historial.push({
                    id: Date.now().toString() + '_certnotif',
                    tipo: 'notificacion_certificador',
                    texto: `Notificación ${phaseLabel} (${templateLabels[template] || 'Estándar'}${priorityTag}) enviada a ${certName} vía ${channels.join(' + ')}${msgTag}`,
                    fecha: new Date().toISOString(),
                    usuario: userName,
                    priority,
                    adminMessage
                });

                await supabase.from('expedientes')
                    .update({ documentacion: { ...docObj, historial }, updated_at: new Date().toISOString() })
                    .eq('id', req.params.id);
            } catch (histErr) {
                console.error('[notify-certificador] Error guardando historial:', histErr.message);
            }
        }

        res.json({
            ok: true,
            sentTo: sendEmail ? cert.email : null,
            certName,
            ceeFolderId,
            ceeFolderLink,
            driveAccessGranted,
            emailSent: sendEmail,
            whatsAppSent: sendWhatsApp && channels.includes('WhatsApp'),
            channels,
            newEstado,
            template
        });
    } catch (err) {
        console.error('[notify-certificador]', err.message);
        res.status(500).json({ error: 'Error procesando la asignación', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/cert-ack ───────────────────────────────────────
// Endpoint PÚBLICO (sin auth) para que el certificador confirme recepción del encargo.
// Protegido por token temporal generado en notify-certificador.
router.post('/:id/cert-ack', async (req, res) => {
    try {
        const { token, phase } = req.body;
        if (!token) return res.status(400).json({ error: 'Token requerido' });

        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const cee = exp.cee || {};
        if (cee.ack_token !== token) {
            return res.status(403).json({ error: 'Token inválido o expirado. Es posible que se haya enviado una notificación más reciente.' });
        }

        // Token válido — marcar como confirmado
        const certId = cee.certificador_id;
        const { data: cert } = await supabase.from('prescriptores').select('razon_social, acronimo').eq('id_empresa', certId).maybeSingle();
        const certName = cert?.razon_social || cert?.acronimo || 'Técnico';

        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';

        // Invalidar token (uso único)
        cee.ack_token = null;
        cee.ack_confirmed_at = new Date().toISOString();
        cee.ack_confirmed_phase = phase;
        cee.estado = phase === 'final' ? 'EN TRABAJO (CEE FINAL)' : 'EN TRABAJO (CEE INICIAL)';
        
        const seguimiento = exp.seguimiento || { cee_inicial: 'ASIGNADO', cee_final: 'ASIGNADO', anexos: 'PTE_EMITIR' };
        if (phase === 'final') {
            seguimiento.cee_final = 'EN_TRABAJO';
        } else {
            seguimiento.cee_inicial = 'EN_TRABAJO';
        }

        await supabase.from('expedientes').update({ cee, seguimiento, updated_at: new Date().toISOString() }).eq('id', req.params.id);

        // Registrar en historial
        try {
            const docObj = exp.documentacion || {};
            const historial = docObj.historial || [];
            historial.push({
                id: Date.now().toString() + '_certack',
                tipo: 'confirmacion_certificador',
                texto: `El certificador ${certName} ha confirmado la recepción del encargo ${phaseLabel}`,
                fecha: new Date().toISOString(),
                usuario: certName
            });
            await supabase.from('expedientes')
                .update({ documentacion: { ...docObj, historial }, updated_at: new Date().toISOString() })
                .eq('id', req.params.id);
        } catch (histErr) {
            console.error('[cert-ack] Error guardando historial:', histErr.message);
        }

        // Notificar a BROKERGY por email (de fondo, sin bloquear respuesta)
        setImmediate(async () => {
            try {
                await emailService.sendCertifierAcceptedAdminNotification(exp.id, exp.numero_expediente, certName, phaseLabel);
            } catch (mailErr) {
                console.error('[cert-ack] Error enviando notificación a admin:', mailErr.message);
            }
        });

        res.json({ ok: true, certName, phase: phaseLabel, newEstado: cee.estado });
    } catch (err) {
        console.error('[cert-ack]', err.message);
        res.status(500).json({ error: 'Error procesando la confirmación' });
    }
});

// ─── POST /api/expedientes/:id/notify-review ──────────────────────────────
// El certificador notifica que ha subido el CEX y está pendiente de revisión
router.post('/:id/notify-review', enforceAuth, async (req, res) => {
    try {
        const { phase } = req.body;
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
            
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const newEstado = phase === 'final' ? 'PENDIENTE REVISIÓN (FINAL)' : 'PENDIENTE REVISIÓN (INICIAL)';

        const userName = req.user?.rol_nombre === 'CERTIFICADOR' ? req.user?.acronimo || req.user?.razon_social : 'Técnico';

        // Preparar actualizaciones
        const cee = exp.cee || {};
        cee.estado = newEstado;
        const globalEstado = newEstado; // PENDIENTE REVISIÓN (INICIAL) o FINAL

        const docObj = exp.documentacion || {};
        const historial = docObj.historial || [];
        
        // 1. Añadir notificación técnica
        historial.push({
            id: Date.now().toString() + '_revreq',
            tipo: 'notificacion_tecnica',
            texto: `El técnico ha subido el archivo .CEX del ${phaseLabel}. PENDIENTE DE REVISIÓN por BROKERGY.`,
            fecha: new Date().toISOString(),
            usuario: userName || 'Sistema'
        });

        // 2. Añadir registro de cambio de estado (para que se vea en el historial unificado)
        historial.push({
            id: Date.now().toString() + '_status',
            estado: globalEstado,
            fecha: new Date().toISOString(),
            usuario: userName || 'Sistema'
        });

        const seguimiento = exp.seguimiento || { cee_inicial: 'ASIGNADO', cee_final: 'ASIGNADO', anexos: 'PTE_EMITIR' };
        if (phase === 'final') {
            seguimiento.cee_final = 'PTE_REVISION';
        } else {
            seguimiento.cee_inicial = 'PTE_REVISION';
        }

        // Actualizar en Supabase (Todo en una sola llamada)
        const { error: updErr } = await supabase.from('expedientes')
            .update({ 
                cee, 
                estado: globalEstado,
                seguimiento,
                documentacion: { ...docObj, historial },
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id);
            
        if (updErr) {
            console.error('Error actualizando Supabase en notify-review:', updErr);
            throw updErr;
        }

        // Enviar aviso por email
        try {
            const certName = userName || 'Un técnico';
            await emailService.sendReviewRequestEmailToAdmin(exp.id, exp.numero_expediente, certName, phase);
        } catch (mailErr) {
            console.error('Error enviando email a admin notify-review:', mailErr.message);
        }

        res.json({ ok: true, newEstado });
    } catch (err) {
        console.error('[notify-review]', err.message);
        res.status(500).json({ error: 'Error procesando la solicitud de revisión' });
    }
});

// ─── POST /api/expedientes/:id/approve-cee ────────────────────────────────
// Admin aprueba el CEX y autoriza presentación
router.post('/:id/approve-cee', adminOnly, async (req, res) => {
    try {
        const { phase } = req.body;
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
            
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const newEstado = phase === 'final' ? 'REVISADO Y LISTO (FINAL)' : 'REVISADO Y LISTO (INICIAL)';

        // Obtener datos del certificador asignado
        const cee = exp.cee || {};
        let certEmail = null;
        let certName = 'Técnico';
        if (cee.certificador_id) {
            const { data: cert } = await supabase.from('prescriptores').select('email, razon_social, acronimo').eq('id_empresa', cee.certificador_id).maybeSingle();
            if (cert) {
                certEmail = cert.email;
                certName = cert.razon_social || cert.acronimo || 'Técnico';
            }
        }

        // Preparar actualizaciones (Estado interno, global y seguimiento)
        cee.estado = newEstado;
        const globalEstado = newEstado;

        const seguimiento = exp.seguimiento || { cee_inicial: 'ASIGNADO', cee_final: 'ASIGNADO', anexos: 'PTE_EMITIR' };
        if (phase === 'final') {
            seguimiento.cee_final = 'REVISADO';
        } else {
            seguimiento.cee_inicial = 'REVISADO';
        }

        const docObj = exp.documentacion || {};
        const historial = docObj.historial || [];

        // Registro de la aprobación
        historial.push({
            id: Date.now().toString() + '_revok',
            tipo: 'aprobacion_tecnica',
            texto: `BROKERGY ha revisado y dado el VISTO BUENO al ${phaseLabel}. Se autoriza su registro en Industria.`,
            fecha: new Date().toISOString(),
            usuario: 'ADMINISTRADOR'
        });

        // Registro de cambio de estado (para el historial unificado)
        historial.push({
            id: Date.now().toString() + '_status_revok',
            estado: globalEstado,
            fecha: new Date().toISOString(),
            usuario: 'ADMINISTRADOR'
        });

        // Actualizar en Supabase (Todo en una sola llamada)
        const { error: updErr } = await supabase.from('expedientes')
            .update({ 
                cee, 
                estado: globalEstado,
                seguimiento,
                documentacion: { ...docObj, historial },
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id);

        if (updErr) throw updErr;

        // Enviar email automático al técnico indicando que ya tiene luz verde
        if (certEmail) {
            const portalLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${req.params.id}`;
            const ceeFolderLink = cee.cee_folder_link || null;
            
            setImmediate(async () => {
                try {
                    await emailService.sendCertificadorApproveNotification(
                        certEmail, 
                        certName, 
                        exp.numero_expediente, 
                        phaseLabel, 
                        portalLink, 
                        ceeFolderLink
                    );
                } catch (mailErr) {
                    console.error('[approve-cee] Error enviando email de visto bueno al certificador:', mailErr.message);
                }
            });
        }

        res.json({ ok: true, newEstado, seguimiento });
    } catch (err) {
        console.error('[approve-cee]', err.message);
        res.status(500).json({ error: 'Error aprobando el CEE' });
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

// ─── POST /api/expedientes/:id/resend-cee-notifications ───────────────────────
// Re-disparo manual (admin) de las notificaciones de CEE registrado.
// Útil cuando la primera ejecución no envió los WhatsApp porque el cliente
// estaba DISCONNECTED, o cuando el usuario quiere insistir al cliente.
router.post('/:id/resend-cee-notifications', enforceAuth, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'ADMIN') {
            return res.status(403).json({ error: 'Solo ADMIN puede reenviar notificaciones' });
        }
        const phase = (req.body?.phase || '').toLowerCase();
        if (phase !== 'inicial' && phase !== 'final') {
            return res.status(400).json({ error: 'phase debe ser "inicial" o "final"' });
        }

        const { data: exp, error } = await supabase.from('expedientes').select('*').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const seguimientoKey = phase === 'final' ? 'cee_final' : 'cee_inicial';
        if (exp.seguimiento?.[seguimientoKey] !== 'REGISTRADO') {
            return res.status(400).json({ error: `El ${seguimientoKey} no está en estado REGISTRADO` });
        }

        const result = phase === 'final'
            ? await notifyCeeFinalRegistrado(exp)
            : await notifyCeeInicialRegistrado(exp);

        return res.json(result);
    } catch (err) {
        console.error('[resend-cee-notifications]', err);
        res.status(500).json({ error: 'Error reenviando notificaciones', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/fichas-tecnicas/upload ────────────────────────
// Sube una ficha técnica PDF a "3. FICHAS TÉCNICAS Y CERTIFICACIONES" en Drive
// Body: { base64: string, type: 'cal'|'acs', numexpte?: string }
router.post('/:id/fichas-tecnicas/upload', enforceAuth, async (req, res) => {
    const { base64, type, numexpte } = req.body;
    if (!base64 || !type) return res.status(400).json({ error: 'Faltan campos requeridos.' });
    console.log(`[FT] Subiendo ficha técnica tipo=${type} para expediente ${req.params.id} (base64 len=${base64.length})`);

    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, numero_expediente, documentacion')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        console.log(`[FT] Expediente encontrado: ${exp.numero_expediente}, oportunidad_id=${exp.oportunidad_id}`);

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();

        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        console.log(`[FT] driveFolderId=${driveFolderId}`);
        if (!driveFolderId) return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada.' });

        const { findSubfolderByName, createSubfolder, saveFileToFolder } = require('../services/driveService');

        const FOLDER_NAME = '3. FICHAS TÉCNICAS Y CERTIFICACIONES';
        let ftFolderId = await findSubfolderByName(driveFolderId, FOLDER_NAME);
        if (!ftFolderId) ftFolderId = await createSubfolder(driveFolderId, FOLDER_NAME);

        const expteNum = numexpte || exp.numero_expediente || req.params.id;
        const suffix = type === 'acs' ? 'ACS' : 'CALEFACCION';
        const fileName = `${expteNum} - FT AEROTERMIA ${suffix}.pdf`;

        const fileBuffer = Buffer.from(base64.split(',')[1] || base64, 'base64');
        // Debug: verificar que el buffer empieza con %PDF-
        const headerBytes = fileBuffer.slice(0, 8).toString('utf8');
        console.log(`[FT] Buffer subida: ${fileBuffer.length} bytes, header="${headerBytes}" (debe empezar por %PDF-)`);
        const result = await saveFileToFolder(ftFolderId, fileName, 'application/pdf', fileBuffer);
        if (!result) return res.status(500).json({ error: 'Error al subir a Drive.' });

        const linkField = type === 'acs' ? 'ft_aerotermia_acs_link' : 'ft_aerotermia_cal_link';
        const idField   = type === 'acs' ? 'ft_aerotermia_acs_id'   : 'ft_aerotermia_cal_id';
        const docObj = { ...(exp.documentacion || {}), [linkField]: result.link, [idField]: result.id };
        await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', req.params.id);
        console.log(`[FT] Guardado en Drive: ${fileName} (id=${result.id})`);

        res.json({ link: result.link, driveId: result.id });
    } catch (err) {
        console.error('Error POST expedientes/:id/fichas-tecnicas/upload:', err);
        res.status(500).json({ error: 'Error al subir la ficha técnica.', details: err.message });
    }
});

// ─── GET /api/expedientes/:id/fichas-tecnicas/:type ──────────────────────────
// Busca la ficha técnica directamente en Drive por nombre dentro de
// "3. FICHAS TÉCNICAS Y CERTIFICACIONES" y la sirve si existe.
// No depende de IDs guardados en documentacion — fuente de verdad: Drive.
router.get('/:id/fichas-tecnicas/:type', async (req, res) => {
    const { type } = req.params; // 'cal' | 'acs'
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('oportunidad_id, numero_expediente')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).send('Expediente no encontrado');

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();

        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(404).send('Sin carpeta Drive');

        const { findSubfolderByName, findFileByName, getFileContent } = require('../services/driveService');
        const ftFolderId = await findSubfolderByName(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');
        if (!ftFolderId) return res.status(404).send('Subcarpeta no encontrada');

        const suffix = type === 'acs' ? 'ACS' : 'CALEFACCION';
        const fileName = `${exp.numero_expediente} - FT AEROTERMIA ${suffix}.pdf`;
        const fileId = await findFileByName(ftFolderId, fileName);
        if (!fileId) return res.status(404).send('Archivo no encontrado en Drive');

        const content = await getFileContent(fileId);
        if (!content) return res.status(404).send('No se pudo leer el archivo');

        console.log(`[FT] Servido "${fileName}" (${content.length} bytes, header="${content.slice(0, 8).toString('utf8')}")`);

        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(content);
    } catch (err) {
        console.error('Error GET expedientes/:id/fichas-tecnicas/:type:', err);
        res.status(500).send('Error');
    }
});

module.exports = router;
