const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const supabase = require('../services/supabaseClient');
const { enforceAuth, adminOnly } = require('../middleware/auth');
const { getCoordinatesByRC } = require('../services/catastroService');
const { normalizeData } = require('../utils/normalization');
const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');
const reformaUploadService = require('../services/reformaUploadService');


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

async function notifyCeeInicialRegistrado(expediente, filters = {}) {
    const targets  = filters.targets  || ['CLIENTE', 'PARTNER', 'ADMIN'];
    const chFilter = filters.channels || ['email', 'whatsapp'];
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
        // Enlace UNIFICADO de subida de fotos/docs (/subir-docs/:uuid?token=)
        const portalLink = op?.id
            ? await reformaUploadService.ensureUploadLink(op.id)
            : `https://app.brokergy.es/firma/${expediente.id}`;
        const expedienteLink = `https://app.brokergy.es/expedientes/${expediente.id}`;

        const waState = whatsappService.getStatus?.()?.state || 'unknown';
        const cliPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
        console.log(`${tag} Disparando notificaciones (targets=[${targets}], channels=[${chFilter}], wa=${waState})`);

        const channels = { whatsapp: [], email: [] };

        const clientMsg = `¡Hola *${clienteName}*! 👋\n\nTe escribimos para comunicarte que ya ha sido presentado el *Certificado de Eficiencia Energética INICIAL* de tu expediente *${numExp}*.\n\n*Desde este momento ya se pueden emitir facturas y pagos*\n\n📸 Recuerda hacerle fotografías a todo:\n• *Caldera existente y placa de fabricación.*\n• *Desmontaje de la caldera.*\n• *Montaje de la aerotermia.*\n• *Fotos de las nuevas placas de fabricación* (tanto de la unidad exterior como de la interior).\n\nLas fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.\n\nPuedes subirlas directamente al expediente a través de este enlace:\n🔗 ${portalLink}\n\nUna vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
        const staffMsg = `✅ *REGISTRO CEE INICIAL PRESENTADO*\nExpediente: ${numExp}\nCliente: ${clienteFull}\n\nSe ha subido el justificante de registro del CEE Inicial al sistema. Desde este momento ya se pueden emitir facturas y pagos.\n\nVer expediente:\n🔗 ${expedienteLink}`;

        // --- WHATSAPP ---
        if (chFilter.includes('whatsapp')) {
            if (targets.includes('CLIENTE') && cliPhone) {
                channels.whatsapp.push('cliente');
                whatsappService.sendText(cliPhone, clientMsg)
                    .catch(e => console.error(`${tag} WhatsApp Cliente:`, e.message));
            } else if (targets.includes('CLIENTE') && !cliPhone) {
                console.warn(`${tag} Cliente sin teléfono, no se envía WhatsApp`);
            }

            if (targets.includes('ADMIN')) {
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
                channels.whatsapp.push('admin');
                whatsappService.sendText(adminPhone, staffMsg)
                    .catch(e => console.error(`${tag} WhatsApp Admin:`, e.message));
            }

            if (targets.includes('PARTNER') && partnerPhone) {
                channels.whatsapp.push('partner');
                whatsappService.sendText(partnerPhone, staffMsg)
                    .catch(e => console.error(`${tag} WhatsApp Partner:`, e.message));
            }
        }

        // --- EMAIL ---
        if (chFilter.includes('email')) {
            if (targets.includes('CLIENTE') && cli.email) {
                channels.email.push('cliente');
                await emailService.sendCeeInicialRegistradoClientEmail(cli.email, clienteName, numExp, portalLink)
                    .catch(e => console.error(`${tag} Email Cliente:`, e.message));
            }
            if (targets.includes('ADMIN')) {
                channels.email.push('admin');
                await emailService.sendCeeRegistradoStaffEmail('franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, techName, 'CEE INICIAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Admin:`, e.message));
            }
            if (targets.includes('PARTNER') && partnerEmail) {
                channels.email.push('partner');
                await emailService.sendCeeRegistradoStaffEmail(partnerEmail, true, numExp, clienteFull, ubicacion, techName, 'CEE INICIAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Partner:`, e.message));
            }
        }

        console.log(`${tag} Disparado: whatsapp=[${channels.whatsapp.join(',')}] email=[${channels.email.join(',')}]`);
        return { ok: true, whatsappState: waState, channels };
    } catch (err) {
        console.error(`${tag} Error en notificaciones:`, err);
        return { ok: false, reason: err.message };
    }
}

async function notifyCeeFinalRegistrado(expediente, filters = {}) {
    const targets  = filters.targets  || ['CLIENTE', 'PARTNER', 'ADMIN'];
    const chFilter = filters.channels || ['email', 'whatsapp'];
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
        console.log(`${tag} Disparando notificaciones (targets=[${targets}], channels=[${chFilter}], wa=${waState})`);

        const channels = { whatsapp: [], email: [] };

        const clientMsg = `¡Hola *${clienteName}*! 👋\n\nTe comunicamos que ya ha sido presentado el *Certificado de Eficiencia Energética FINAL* de tu expediente *${numExp}*.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
        const staffMsg = `✅ *REGISTRO CEE FINAL PRESENTADO*\nExpediente: ${numExp}\nCliente: ${clienteFull}\n\nSe ha subido el justificante de registro del CEE Final al sistema.\n\nVer expediente:\n🔗 ${expedienteLink}`;

        // --- WHATSAPP ---
        if (chFilter.includes('whatsapp')) {
            if (targets.includes('CLIENTE') && cliPhone) {
                channels.whatsapp.push('cliente');
                whatsappService.sendText(cliPhone, clientMsg)
                    .catch(e => console.error(`${tag} WhatsApp Cliente:`, e.message));
            } else if (targets.includes('CLIENTE') && !cliPhone) {
                console.warn(`${tag} Cliente sin teléfono, no se envía WhatsApp`);
            }

            if (targets.includes('ADMIN')) {
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
                channels.whatsapp.push('admin');
                whatsappService.sendText(adminPhone, staffMsg)
                    .catch(e => console.error(`${tag} WhatsApp Admin:`, e.message));
            }

            if (targets.includes('PARTNER') && partnerPhone) {
                channels.whatsapp.push('partner');
                whatsappService.sendText(partnerPhone, staffMsg)
                    .catch(e => console.error(`${tag} WhatsApp Partner:`, e.message));
            }
        }

        // --- EMAIL ---
        if (chFilter.includes('email')) {
            if (targets.includes('ADMIN')) {
                channels.email.push('admin');
                await emailService.sendCeeRegistradoStaffEmail('franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, techName, 'CEE FINAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Admin:`, e.message));
            }
            if (targets.includes('PARTNER') && partnerEmail) {
                channels.email.push('partner');
                await emailService.sendCeeRegistradoStaffEmail(partnerEmail, true, numExp, clienteFull, ubicacion, techName, 'CEE FINAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Partner:`, e.message));
            }
        }

        console.log(`${tag} Disparado: whatsapp=[${channels.whatsapp.join(',')}] email=[${channels.email.join(',')}]`);
        return { ok: true, whatsappState: waState, channels };
    } catch (err) {
        console.error(`${tag} Error en notificaciones:`, err);
        return { ok: false, reason: err.message };
    }
}


// ─── GET /api/expedientes ─────────────────────────────────────────────────────
// Lista todos los expedientes usando RPC (1 sola query con JOIN en BD, sin documentacion)
router.get('/', enforceAuth, async (req, res) => {
    try {
        const canViewAll   = req.user.rol_nombre === 'ADMIN';
        const isCertificador = req.user.rol_nombre === 'CERTIFICADOR';

        // RPC: un solo JOIN en BD — evita 3 round-trips y el timeout por documentacion pesada
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_expedientes_list_v2');
        if (rpcErr) throw rpcErr;

        let data = rpcData || [];

        // ── Filtros por rol ──────────────────────────────────────────────────
        if (!canViewAll && !isCertificador) {
            // PARTNER / INSTALADOR / DISTRIBUIDOR → solo sus clientes u oportunidades
            if (!req.user.prescriptor_id) return res.json([]);

            const [{ data: cliIds }, { data: opIds }] = await Promise.all([
                supabase.from('clientes').select('id_cliente').eq('prescriptor_id', req.user.prescriptor_id),
                supabase.from('oportunidades').select('id').eq('prescriptor_id', req.user.prescriptor_id)
            ]);

            const validCli = new Set((cliIds || []).map(c => c.id_cliente));
            const validOp  = new Set((opIds  || []).map(o => o.id));
            if (validCli.size === 0 && validOp.size === 0) return res.json([]);

            data = data.filter(r => validCli.has(r.cliente_id) || validOp.has(r.oportunidad_id));
        }

        if (isCertificador) {
            if (!req.user.prescriptor_id) return res.json([]);
            data = data.filter(r => String(r.cee?.certificador_id) === String(req.user.prescriptor_id));
        }

        res.json(data);
    } catch (err) {
        console.error('Error GET expedientes (RPC):', err);
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
        // Enlace UNIFICADO de subida de fotos/docs (/subir-docs/:uuid?token=)
        const uploadLink = await reformaUploadService.ensureUploadLink(op.id);
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
        // Cuando el CEE Inicial pasa a REGISTRADO:
        //   1. Avanzar estado global a PTE. FIN OBRA (si procede)
        //   2. Generar token de un solo uso para que el admin notifique al cliente
        //      pulsando el enlace que recibirá por WA/email
        let _notifyAdminCeeInicial = null;
        if (seguimiento?.cee_inicial === 'REGISTRADO' && existing.seguimiento?.cee_inicial !== 'REGISTRADO') {
            if (existing.estado === 'PTE. CEE INICIAL') {
                updates.estado = 'PTE. FIN OBRA';
            }
            const notifyToken = crypto.randomBytes(32).toString('hex');
            if (!updates.seguimiento) updates.seguimiento = { ...existing.seguimiento };
            updates.seguimiento.notify_client_token_inicial = notifyToken;
            updates.seguimiento.notify_client_token_inicial_exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 días
            _notifyAdminCeeInicial = { token: notifyToken, expId: req.params.id, exp: existing };
            console.log(`[Automation] Exp ${req.params.id}: CEE INICIAL → REGISTRADO, token generado`);
        }

        // ─── AUTOMATIZACIÓN REGISTRO CEE FINAL ──────────────────────────────────
        let _notifyAdminCeeFinal = null;
        if (seguimiento?.cee_final === 'REGISTRADO' && existing.seguimiento?.cee_final !== 'REGISTRADO') {
            const notifyToken = crypto.randomBytes(32).toString('hex');
            if (!updates.seguimiento) updates.seguimiento = { ...existing.seguimiento };
            updates.seguimiento.notify_client_token_final = notifyToken;
            updates.seguimiento.notify_client_token_final_exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
            _notifyAdminCeeFinal = { token: notifyToken, expId: req.params.id, exp: existing };
            console.log(`[Automation] Exp ${req.params.id}: CEE FINAL → REGISTRADO, token generado`);
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

        // ── Notificaciones admin con enlace one-tap (fire-and-forget post-save) ──
        if (_notifyAdminCeeInicial) {
            const { token, expId, exp: capturedExp } = _notifyAdminCeeInicial;
            setImmediate(async () => {
                try {
                    const [{ data: cli }, { data: op }] = await Promise.all([
                        supabase.from('clientes').select('nombre_razon_social, apellidos, municipio, provincia, codigo_postal, direccion').eq('id_cliente', capturedExp.cliente_id).maybeSingle(),
                        supabase.from('oportunidades').select('id_oportunidad').eq('id', capturedExp.oportunidad_id).maybeSingle()
                    ]);
                    const numExp = capturedExp.numero_expediente || op?.id_oportunidad || expId;
                    const clienteFull = cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : '';
                    const expedienteLink = `https://app.brokergy.es/expedientes/${expId}`;
                    const notifyLink = `https://app.brokergy.es/api/expedientes/${expId}/notify-client?token=${token}&phase=inicial`;

                    const ubicacion = cli ? `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})` : '';
                    await emailService.sendCeeRegistradoStaffEmail(
                        'franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, '', 'CEE INICIAL', expedienteLink, notifyLink
                    ).catch(e => console.error('[Automation CEE_INI] Email Admin:', e.message));
                } catch (notifErr) {
                    console.error('[Automation CEE_INI REGISTRADO] Admin notification error:', notifErr.message);
                }
            });
        }

        if (_notifyAdminCeeFinal) {
            const { token, expId, exp: capturedExp } = _notifyAdminCeeFinal;
            setImmediate(async () => {
                try {
                    const [{ data: cli }, { data: op }] = await Promise.all([
                        supabase.from('clientes').select('nombre_razon_social, apellidos, municipio, provincia, codigo_postal, direccion').eq('id_cliente', capturedExp.cliente_id).maybeSingle(),
                        supabase.from('oportunidades').select('id_oportunidad').eq('id', capturedExp.oportunidad_id).maybeSingle()
                    ]);
                    const numExp = capturedExp.numero_expediente || op?.id_oportunidad || expId;
                    const clienteFull = cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : '';
                    const expedienteLink = `https://app.brokergy.es/expedientes/${expId}`;
                    const notifyLink = `https://app.brokergy.es/api/expedientes/${expId}/notify-client?token=${token}&phase=final`;

                    const ubicacion = cli ? `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})` : '';
                    await emailService.sendCeeRegistradoStaffEmail(
                        'franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, '', 'CEE FINAL', expedienteLink, notifyLink
                    ).catch(e => console.error('[Automation CEE_FIN] Email Admin:', e.message));
                } catch (notifErr) {
                    console.error('[Automation CEE_FIN REGISTRADO] Admin notification error:', notifErr.message);
                }
            });
        }

        res.json(data);
    } catch (err) {
        console.error('Error PUT expedientes/:id:', err);
        res.status(500).json({ error: 'Error al actualizar el expediente', details: err.message });
    }
});

// Cambiar cliente vinculado (PATCH /api/expedientes/:id/vincular-cliente)
router.patch('/:id/vincular-cliente', enforceAuth, async (req, res) => {
    const { id } = req.params;
    const { cliente_id } = req.body;
    try {
        if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido.' });

        const { data: cli, error: cliErr } = await supabase
            .from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos')
            .eq('id_cliente', cliente_id)
            .single();
        if (cliErr || !cli) return res.status(404).json({ error: 'Cliente no encontrado.' });

        const { error: upErr } = await supabase
            .from('expedientes')
            .update({ cliente_id })
            .eq('id', id);
        if (upErr) return res.status(500).json({ error: upErr.message });

        res.json({ success: true, cliente: cli });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor.' });
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

        const { getOrCreateSubfolder, saveFileToFolder, findFileByName, renameFolder, moveFolder } = require('../services/driveService');

        // Navegar/Crear la estructura de subcarpetas
        let currentFolderId = driveFolderId;
        for (const sub of subfolders) {
            console.log(`[POST /documents/upload] Navigating to subfolder: ${sub} (parent: ${currentFolderId})`);
            currentFolderId = await getOrCreateSubfolder(currentFolderId, sub);
        }
        console.log(`[POST /documents/upload] Final target FolderID: ${currentFolderId}`);

        // Versionado: si ya existe un archivo con el mismo nombre, moverlo a subcarpeta "OLD" con prefijo
        const existingId = await findFileByName(currentFolderId, fileName);
        if (existingId) {
            try {
                const oldFolderId = await getOrCreateSubfolder(currentFolderId, 'OLD');
                const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
                const dotIdx = fileName.lastIndexOf('.');
                const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
                const ext = dotIdx > 0 ? fileName.substring(dotIdx) : '';
                const oldName = `_old_${stamp} ${baseName}${ext}`;
                await renameFolder(existingId, oldName);
                await moveFolder(existingId, oldFolderId);
                console.log(`[POST /documents/upload] Versionado: '${fileName}' archivado en OLD como '${oldName}'`);
            } catch (vErr) {
                console.warn(`[POST /documents/upload] No se pudo versionar archivo existente: ${vErr.message}`);
            }
        }

        const fileBuffer = Buffer.from(base64, 'base64');
        const result = await saveFileToFolder(currentFolderId, fileName, mimeType || 'application/octet-stream', fileBuffer);

        if (!result) return res.status(500).json({ error: 'Error al subir el archivo a Drive' });

        // Hacer el archivo público (anyone with link → reader). Necesario para que el iframe
        // /preview funcione desde el navegador del usuario aunque no esté logueado con la cuenta de Brokergy.
        try {
            const { setFolderPublic } = require('../services/driveService');
            await setFolderPublic(result.id, 'reader');
        } catch (permErr) {
            console.warn(`[POST /documents/upload] No se pudo hacer público el archivo ${result.id}: ${permErr.message}`);
        }

        res.json({ drive_link: result.link, drive_id: result.id });
    } catch (err) {
        console.error('Error POST expedientes/:id/documents/upload:', err);
        res.status(500).json({ error: 'Error al subir el documento', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/documents/make-public ──────────────────────────
// Endpoint utilitario para hacer público un archivo de Drive existente.
// Útil para archivos ya subidos antes de este cambio que siguen dando 403.
// Body: { driveLink?, driveId? }
router.post('/:id/documents/make-public', enforceAuth, async (req, res) => {
    try {
        const { driveLink, driveId } = req.body || {};
        let fileId = driveId;
        if (!fileId && driveLink) {
            // Buscar SOLO en el segmento `/file/d/{ID}` o `/folders/{ID}` para evitar capturar otros tokens largos
            const m = String(driveLink).match(/\/(?:file\/d|folders|drive\/folders)\/([-\w]{20,})/);
            fileId = m ? m[1] : null;
            // Fallback: primera cadena de 25+ chars [-\w]
            if (!fileId) {
                const m2 = String(driveLink).match(/[-\w]{25,}/);
                fileId = m2 ? m2[0] : null;
            }
        }
        if (!fileId) return res.status(400).json({ error: 'No se pudo extraer el ID de Drive del link proporcionado.' });

        console.log(`[make-public] Procesando fileId=${fileId} (link=${driveLink || 'N/A'})`);

        const { setFolderPublic, getFileMetadata } = require('../services/driveService');

        // Verificar primero que el archivo es accesible por la cuenta OAuth de la app.
        const meta = await getFileMetadata(fileId);
        if (!meta) {
            return res.status(404).json({
                error: 'El archivo no existe o la cuenta de Drive de Brokergy no tiene acceso a él. '
                     + 'Probablemente fue subido por otra cuenta de Google. Solución: sustitúyelo subiendo el archivo de nuevo desde la app.',
                fileId
            });
        }

        const ok = await setFolderPublic(fileId, 'reader');
        if (!ok) return res.status(500).json({ error: 'No se pudo cambiar permisos del archivo (ver logs del servidor).' });
        res.json({ ok: true, fileId, fileName: meta.name });
    } catch (err) {
        console.error('Error POST expedientes/:id/documents/make-public:', err);
        res.status(500).json({ error: 'Error al cambiar permisos', details: err.message });
    }
});

// ─── GET /api/expedientes/:id/documents/scan-cee ──────────────────────────────
// Escanea las carpetas 1. CEE / CEE INICIAL y CEE FINAL en Drive y mapea
// los archivos encontrados a los slots por sufijo del nombre.
// Útil para detectar archivos subidos directamente en Drive (fuera de la app).
router.get('/:id/documents/scan-cee', enforceAuth, async (req, res) => {
    try {
        let { data: exp } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();
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
            .select('drive_folder_id, datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();

        let normalizedDatos = op?.datos_calculo || {};
        if (typeof normalizedDatos === 'string') {
            try { normalizedDatos = JSON.parse(normalizedDatos); } catch (e) { normalizedDatos = {}; }
        }
        const driveFolderId = op?.drive_folder_id || normalizedDatos?.drive_folder_id || normalizedDatos?.inputs?.drive_folder_id || exp.drive_folder_id;
        if (!driveFolderId) return res.json({ inicial: {}, final: {} });

        const { findSubfolderByName, listFiles } = require('../services/driveService');

        // Mapeo sufijo → slot id (mismo criterio que el frontend en DOCUMENT_SLOTS)
        const matchSlot = (filename) => {
            const lower = (filename || '').toLowerCase();
            if (lower.endsWith('.xml')) return 'xml';
            if (lower.endsWith('.cex')) return 'cex';
            if (lower.endsWith('_reg.pdf')) return 'registro';
            if (lower.endsWith('_etq.pdf')) return 'etiqueta';
            if (lower.endsWith('_fdo.pdf')) return 'pdf';
            return null; // OTROS o desconocido
        };

        const scanSection = async (sectionLabel) => {
            const out = { xml: null, pdf: null, cex: null, registro: null, etiqueta: null, otros: [] };
            const ceeRoot = await findSubfolderByName(driveFolderId, '1. CEE');
            if (!ceeRoot) return out;
            const sectionFolder = await findSubfolderByName(ceeRoot, sectionLabel);
            if (!sectionFolder) return out;
            const files = await listFiles(sectionFolder);
            for (const f of files) {
                if (f.mimeType === 'application/vnd.google-apps.folder') continue; // ignorar OLD
                const slot = matchSlot(f.name);
                if (slot === 'otros' || slot === null) {
                    out.otros.push(f.webViewLink);
                } else if (!out[slot]) {
                    out[slot] = f.webViewLink;
                }
            }
            return out;
        };

        const [inicial, final] = await Promise.all([
            scanSection('CEE INICIAL'),
            scanSection('CEE FINAL')
        ]);

        res.json({ inicial, final });
    } catch (err) {
        console.error('Error GET expedientes/:id/documents/scan-cee:', err);
        res.status(500).json({ error: 'Error al escanear carpeta CEE', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/documents/repair-cee-links ─────────────────────
// Repara los webViewLink rotos en cee.cee_files (todos en mayúsculas por bug histórico).
// Escanea la carpeta CEE en Drive y sustituye cada slot por el link real del archivo.
router.post('/:id/documents/repair-cee-links', enforceAuth, async (req, res) => {
    try {
        console.log(`[repair-cee-links] Inicio para expediente ${req.params.id}`);
        let { data: exp } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();
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
            .select('drive_folder_id, datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();
        let normalizedDatos = op?.datos_calculo || {};
        if (typeof normalizedDatos === 'string') {
            try { normalizedDatos = JSON.parse(normalizedDatos); } catch (e) { normalizedDatos = {}; }
        }
        const driveFolderId = op?.drive_folder_id || normalizedDatos?.drive_folder_id || normalizedDatos?.inputs?.drive_folder_id || exp.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'Sin carpeta de Drive' });
        console.log(`[repair-cee-links] driveFolderId=${driveFolderId}`);

        const { findSubfolderByName, listFiles, setFolderPublic } = require('../services/driveService');
        const matchSlot = (filename) => {
            const lower = (filename || '').toLowerCase();
            if (lower.endsWith('.xml')) return 'xml';
            if (lower.endsWith('.cex')) return 'cex';
            if (lower.endsWith('_reg.pdf')) return 'registro';
            if (lower.endsWith('_etq.pdf')) return 'etiqueta';
            if (lower.endsWith('_fdo.pdf')) return 'pdf';
            return null;
        };

        const newFiles = { inicial: { otros: [] }, final: { otros: [] } };
        const ceeRoot = await findSubfolderByName(driveFolderId, '1. CEE');
        console.log(`[repair-cee-links] ceeRoot=${ceeRoot}`);
        if (ceeRoot) {
            for (const sectionLabel of ['CEE INICIAL', 'CEE FINAL']) {
                const sectionKey = sectionLabel.endsWith('INICIAL') ? 'inicial' : 'final';
                const sectionFolder = await findSubfolderByName(ceeRoot, sectionLabel);
                console.log(`[repair-cee-links] ${sectionLabel} folder=${sectionFolder}`);
                if (!sectionFolder) continue;
                const files = await listFiles(sectionFolder);
                console.log(`[repair-cee-links] ${sectionLabel}: ${files.length} archivos`);
                for (const f of files) {
                    if (f.mimeType === 'application/vnd.google-apps.folder') continue; // ignorar OLD
                    const slot = matchSlot(f.name);
                    console.log(`[repair-cee-links]   '${f.name}' → slot=${slot} link=${f.webViewLink}`);
                    if (slot && !newFiles[sectionKey][slot]) {
                        newFiles[sectionKey][slot] = f.webViewLink;
                        // De paso, hacer público el archivo
                        try { await setFolderPublic(f.id, 'reader'); } catch (_) {}
                    } else if (!slot) {
                        newFiles[sectionKey].otros.push(f.webViewLink);
                    }
                }
            }
        }

        // Mergear con el cee actual del expediente, preservando otros campos.
        // IMPORTANTE: sobrescribimos los slots existentes con los del scan (la BD puede tener links corruptos)
        const currentCee = exp.cee || {};
        const updatedCee = {
            ...currentCee,
            cee_files: {
                inicial: { ...(currentCee.cee_files?.inicial || {}), ...newFiles.inicial },
                final:   { ...(currentCee.cee_files?.final   || {}), ...newFiles.final   },
            }
        };

        console.log(`[repair-cee-links] Updating expediente ${exp.id} con:`, JSON.stringify(updatedCee.cee_files));

        const { error: updErr } = await supabase
            .from('expedientes')
            .update({ cee: updatedCee })
            .eq('id', exp.id);
        if (updErr) {
            console.error(`[repair-cee-links] supabase update error:`, updErr);
            return res.status(500).json({ error: 'Error guardando cee_files', details: updErr.message });
        }

        console.log(`[repair-cee-links] ✅ Reparado expediente ${exp.id}`);
        res.json({ ok: true, repaired: newFiles });
    } catch (err) {
        console.error('Error POST expedientes/:id/documents/repair-cee-links:', err);
        res.status(500).json({ error: 'Error al reparar links', details: err.message });
    }
});

// ─── DELETE /api/expedientes/:id/documents/file ───────────────────────────────
// Borra un archivo de Drive (lo manda a papelera).
// Body: { driveLink? , driveId? }
router.delete('/:id/documents/file', enforceAuth, async (req, res) => {
    try {
        const { driveLink, driveId } = req.body || {};
        let fileId = driveId;
        if (!fileId && driveLink) {
            // Extraer ID del webViewLink: https://drive.google.com/file/d/{ID}/view?...
            const m = String(driveLink).match(/[-\w]{25,}/);
            fileId = m ? m[0] : null;
        }
        if (!fileId) return res.status(400).json({ error: 'driveId o driveLink son obligatorios' });

        const { deleteFile } = require('../services/driveService');
        const ok = await deleteFile(fileId);
        if (!ok) return res.status(500).json({ error: 'No se pudo eliminar el archivo de Drive' });
        res.json({ ok: true, deletedId: fileId });
    } catch (err) {
        console.error('Error DELETE expedientes/:id/documents/file:', err);
        res.status(500).json({ error: 'Error al borrar archivo', details: err.message });
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
// Al borrar el expediente, también se mueve la carpeta Drive a la papelera
// (la carpeta vive en la oportunidad asociada — datos_calculo.drive_folder_id).
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'ADMIN') {
            return res.status(403).json({ error: 'Solo el administrador puede eliminar expedientes' });
        }

        // 1. Obtener el expediente + la oportunidad asociada (para el drive_folder_id)
        const { data: exp, error: getErr } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, oportunidad_id, oportunidades:oportunidad_id(datos_calculo)')
            .eq('id', req.params.id)
            .maybeSingle();
        if (getErr) throw getErr;
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        // 2. Mover carpeta Drive a papelera si existe (best-effort, no bloqueante)
        const datosCalculo = exp.oportunidades?.datos_calculo || {};
        const driveFolderId = datosCalculo.drive_folder_id || datosCalculo.inputs?.drive_folder_id;
        let driveDeleted = false;
        if (driveFolderId) {
            try {
                const { deleteFile } = require('../services/driveService');
                driveDeleted = await deleteFile(driveFolderId);
                if (driveDeleted) {
                    console.log(`[DELETE expediente ${exp.numero_expediente}] Carpeta Drive ${driveFolderId} movida a papelera`);
                } else {
                    console.warn(`[DELETE expediente ${exp.numero_expediente}] No se pudo mover la carpeta Drive ${driveFolderId}`);
                }
            } catch (e) {
                console.warn(`[DELETE expediente ${exp.numero_expediente}] Error borrando Drive folder:`, e.message);
            }
        }

        // 3. Borrar el expediente
        const { error } = await supabase
            .from('expedientes')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true, drive_deleted: driveDeleted, drive_folder_id: driveFolderId || null });
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
        // GUARD: solo avanzar si el estado actual es anterior al de "en certificador".
        // Evita que un recordatorio al certificador sobreescriba un estado más avanzado
        // (ej: PENDIENTE REVISIÓN → EN CERTIFICADOR es un retroceso incorrecto).
        const estadosQuePermiteAvanzar = [
            'PTE. CEE INICIAL',
            'EN CERTIFICADOR CEE INICIAL',
            'PTE. CEE FINAL',
            'EN CERTIFICADOR CEE FINAL'
        ];
        const newEstado = phase === 'final' ? 'EN CERTIFICADOR CEE FINAL' : 'EN CERTIFICADOR CEE INICIAL';
        if (estadosQuePermiteAvanzar.includes(exp.estado)) {
            await supabase.from('expedientes').update({ estado: newEstado, updated_at: new Date().toISOString() }).eq('id', req.params.id);
        }

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
                // Persistir SIEMPRE la info de carpeta, independiente del grant
                if (ceeFolderId) {
                    workingCee.cee_folder_id = ceeFolderId;
                    workingCee.cee_folder_link = ceeFolderLink;
                }
                // Grant solo si el cert tiene email registrado
                if (ceeFolderId && cert.email) {
                    await driveService.grantPermissionToEmail(ceeFolderId, cert.email, 'writer');
                    driveAccessGranted = true;
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
                    waMsg = `¡Hola *${certName}*! 👋\n\nTe recordamos que tienes pendiente el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\n¿Podrías darnos una estimación de fecha de entrega?${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n*BROKERGY · Ingeniería Energética*`;
                } else if (template === 'urgent') {
                    waMsg = `*⚠️ AVISO URGENTE*\n\nHola *${certName}*, necesitamos con urgencia el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\nEs importante que lo priorices para cumplir con los plazos del programa.${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\nQuedamos a la espera.\n*BROKERGY · Ingeniería Energética*`;
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

                if (priority === 'urgent') {
                    await supabase.from('expedientes')
                        .update({ prioridad: 'URGENTE' })
                        .eq('id', req.params.id);
                }
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
        const { token } = req.body;
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

        // La fase REAL es la que se guardó al generar el token, no la del body
        // (evita que un URL manipulado cambie el estado a fase incorrecta)
        const phase = cee.ack_phase || req.body.phase || 'initial';

        // Token válido — marcar como confirmado
        const certId = cee.certificador_id;
        const { data: cert } = await supabase.from('prescriptores').select('razon_social, acronimo').eq('id_empresa', certId).maybeSingle();
        const certName = cert?.razon_social || cert?.acronimo || 'Técnico';

        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const newEstado = phase === 'final' ? 'EN TRABAJO (CEE FINAL)' : 'EN TRABAJO (CEE INICIAL)';

        // Invalidar token (uso único)
        cee.ack_token = null;
        cee.ack_confirmed_at = new Date().toISOString();
        cee.ack_confirmed_phase = phase;
        cee.estado = newEstado;

        const seguimiento = exp.seguimiento || { cee_inicial: 'ASIGNADO', cee_final: 'ASIGNADO', anexos: 'PTE_EMITIR' };
        if (phase === 'final') {
            seguimiento.cee_final = 'EN_TRABAJO';
        } else {
            seguimiento.cee_inicial = 'EN_TRABAJO';
        }

        // Persistimos cee + seguimiento + estado global + historial en una sola escritura
        const docObj = exp.documentacion || {};
        const historial = docObj.historial || [];
        const nowIso = new Date().toISOString();

        // Entry de confirmación (tipo)
        historial.push({
            id: Date.now().toString() + '_certack',
            tipo: 'confirmacion_certificador',
            texto: `El certificador ${certName} ha confirmado la recepción del encargo ${phaseLabel}`,
            fecha: nowIso,
            usuario: certName
        });
        // Entry de cambio de estado (para historial unificado)
        historial.push({
            id: Date.now().toString() + '_status_certack',
            estado: newEstado,
            fecha: nowIso,
            usuario: certName
        });

        await supabase.from('expedientes')
            .update({
                cee,
                seguimiento,
                estado: newEstado,
                documentacion: { ...docObj, historial },
                updated_at: nowIso
            })
            .eq('id', req.params.id);

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
// Body: { phase, priority?, techMessage? }
router.post('/:id/notify-review', enforceAuth, async (req, res) => {
    try {
        const { phase } = req.body;
        const priority = req.body?.priority === 'urgent' ? 'urgent' : 'normal';
        const techMessage = (req.body?.techMessage || '').trim() || null;

        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const newEstado = phase === 'final' ? 'PENDIENTE REVISIÓN (FINAL)' : 'PENDIENTE REVISIÓN (INICIAL)';

        const userName = req.user?.rol_nombre === 'CERTIFICADOR'
            ? (req.user?.acronimo || req.user?.razon_social)
            : (req.user?.nombre || 'Técnico');

        // ── Datos del certificador (para teléfono/email) y del cliente ────
        const certId = exp.cee?.certificador_id || null;
        const [
            { data: cert } = { data: null },
            { data: cli } = { data: null },
            { data: op } = { data: null }
        ] = await Promise.all([
            certId
                ? supabase.from('prescriptores').select('*').eq('id_empresa', certId).maybeSingle()
                : Promise.resolve({ data: null }),
            exp.cliente_id
                ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle()
                : Promise.resolve({ data: null }),
            exp.oportunidad_id
                ? supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).maybeSingle()
                : Promise.resolve({ data: null }),
        ]);

        const inputs = op?.datos_calculo?.inputs || {};
        const clienteName = (cli
            ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim()
            : null) || op?.referencia_cliente || null;

        const baseDir = (inputs.direccion || inputs.address || cli?.direccion || '').trim();
        const cp = (cli?.codigo_postal || inputs.cp || '').trim();
        const municipio = (cli?.municipio || inputs.municipio || '').trim();
        const provincia = (cli?.provincia || inputs.provincia || '').trim();
        let direccionCompleta = baseDir;
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

        const certName = (cert?.razon_social || cert?.acronimo) || userName || 'Técnico';
        const certPhone = cert?.telefono || cert?.movil || cert?.tlf || null;
        const certEmail = cert?.email || null;

        const expedienteNum = exp.numero_expediente || op?.id_oportunidad || req.params.id;
        const portalLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${req.params.id}`;
        const ceeFolderLink = exp.cee?.cee_folder_link || null;

        const prevSeguimiento = exp.seguimiento || {};
        const seguimientoKey = phase === 'final' ? 'cee_final' : 'cee_inicial';

        // ¿Es un reenvío? (ya estaba PTE_REVISION antes de esta llamada)
        const isResend = prevSeguimiento[seguimientoKey] === 'PTE_REVISION';

        // Guard: si Brokergy ya dio el visto bueno (REVISADO o REGISTRADO), la nueva subida
        // de .CEX es el definitivo — solo se registra el evento, sin retroceder el estado.
        const postApprovalStates = ['REVISADO', 'REGISTRADO'];
        const isAlreadyApproved = postApprovalStates.includes(prevSeguimiento[seguimientoKey]);

        const docObj = exp.documentacion || {};
        const historial = docObj.historial || [];

        if (isAlreadyApproved) {
            historial.push({
                id: Date.now().toString() + '_cex_def',
                tipo: 'informativo',
                texto: `El certificador ha subido la versión definitiva del .CEX del ${phaseLabel}. El expediente ya estaba revisado y aprobado por BROKERGY; no se requiere nueva revisión.`,
                fecha: new Date().toISOString(),
                usuario: userName || 'Sistema'
            });

            const { error: updErr } = await supabase.from('expedientes')
                .update({ documentacion: { ...docObj, historial }, updated_at: new Date().toISOString() })
                .eq('id', req.params.id);

            if (updErr) throw updErr;

            return res.json({
                ok: true,
                alreadyApproved: true,
                message: 'CEX actualizado. Estado no modificado — el expediente ya estaba aprobado por Brokergy.'
            });
        }

        // Preparar actualizaciones
        const cee = exp.cee || {};
        cee.estado = newEstado;
        const globalEstado = newEstado;

        const priorityTag = priority === 'urgent' ? ' · 🚨 URGENTE' : '';
        const msgTag = techMessage ? `\n💬 Mensaje: "${techMessage}"` : '';
        const resendTag = isResend ? ' (reenvío)' : '';

        // 1. Notificación técnica (con prioridad y mensaje opcional)
        historial.push({
            id: Date.now().toString() + '_revreq',
            tipo: 'notificacion_tecnica',
            texto: `El técnico ha subido el archivo .CEX del ${phaseLabel}${priorityTag}${resendTag}. PENDIENTE DE REVISIÓN por BROKERGY.${msgTag}`,
            priority,
            techMessage,
            isResend,
            fecha: new Date().toISOString(),
            usuario: userName || 'Sistema'
        });

        // 2. Cambio de estado para historial unificado (solo si no es reenvío)
        if (!isResend) {
            historial.push({
                id: Date.now().toString() + '_status',
                estado: globalEstado,
                fecha: new Date().toISOString(),
                usuario: userName || 'Sistema'
            });
        }

        const seguimiento = exp.seguimiento || { cee_inicial: 'ASIGNADO', cee_final: 'ASIGNADO', anexos: 'PTE_EMITIR' };
        if (phase === 'final') {
            seguimiento.cee_final = 'PTE_REVISION';
        } else {
            seguimiento.cee_inicial = 'PTE_REVISION';
        }

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

        const channels = [];

        // Email rico al admin
        try {
            await emailService.sendReviewRequestEmailToAdmin({
                expedienteId: exp.id,
                numExp: expedienteNum,
                certName,
                certPhone,
                certEmail,
                phase,
                clienteName,
                clienteData,
                portalLink,
                ceeFolderLink,
                priority,
                techMessage,
                isResend,
            });
            channels.push('Email');
        } catch (mailErr) {
            console.error('Error enviando email a admin notify-review:', mailErr.message);
        }

        // WhatsApp al admin (homogeneidad con el flujo admin → cert)
        try {
            const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
            if (adminPhone) {
                const urgentWaPrefix = priority === 'urgent' ? '🚨 *URGENTE* 🚨\n\n' : '';
                const resendWaTag = isResend ? ' *(reenvío)*' : '';
                const msgBlock = techMessage ? `\n💬 *Mensaje del técnico:* ${techMessage}\n` : '';
                const clientLine = clienteName ? ` del cliente *${clienteName}*` : '';
                const waMsg = `${urgentWaPrefix}📢 *REVISIÓN SOLICITADA*${resendWaTag}\n\nEl técnico *${certName}* ha subido el *.CEX* del *${phaseLabel}* del expediente *${expedienteNum}*${clientLine}.${msgBlock}\n${certPhone ? '📞 Tlf técnico: ' + certPhone + '\n' : ''}🔗 Ver expediente: ${portalLink}\n${ceeFolderLink ? '📁 Carpeta CEE: ' + ceeFolderLink + '\n' : ''}\n*BROKERGY · Ingeniería Energética*`;
                await whatsappService.sendText(adminPhone, waMsg);
                channels.push('WhatsApp');
            }
        } catch (waErr) {
            console.error('[notify-review] Error WhatsApp admin:', waErr.message);
        }

        res.json({ ok: true, newEstado, priority, isResend, channels });
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
        const adminMessage = (req.body?.adminMessage || '').trim() || null;
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
            texto: `BROKERGY ha revisado y dado el VISTO BUENO al ${phaseLabel}. Se autoriza su registro en Industria.${adminMessage ? ` Nota: ${adminMessage}` : ''}`,
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
                        ceeFolderLink,
                        adminMessage
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

        // Filtros opcionales enviados por el frontend
        const targets  = req.body?.targets  || ['CLIENTE', 'PARTNER', 'ADMIN'];
        const channels = req.body?.channels || ['email', 'whatsapp'];

        const { data: exp, error } = await supabase.from('expedientes').select('*').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const seguimientoKey = phase === 'final' ? 'cee_final' : 'cee_inicial';
        if (exp.seguimiento?.[seguimientoKey] !== 'REGISTRADO') {
            return res.status(400).json({ error: `El ${seguimientoKey} no está en estado REGISTRADO` });
        }

        const result = phase === 'final'
            ? await notifyCeeFinalRegistrado(exp, { targets, channels })
            : await notifyCeeInicialRegistrado(exp, { targets, channels });

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
// Si se pasa ?info=1, devuelve metadatos JSON en lugar del binario (más ligero
// para que el frontend evite descargar el PDF y lo encadene como Drive ID).
router.get('/:id/fichas-tecnicas/:type', async (req, res) => {
    const { type } = req.params; // 'cal' | 'acs'
    const wantInfo = req.query.info === '1' || req.query.info === 'true';
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

        const { findSubfolderByName, findFileByName, getFileContent, getFileMetadata } = require('../services/driveService');
        const ftFolderId = await findSubfolderByName(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');
        if (!ftFolderId) return res.status(404).send('Subcarpeta no encontrada');

        const suffix = type === 'acs' ? 'ACS' : 'CALEFACCION';
        const fileName = `${exp.numero_expediente} - FT AEROTERMIA ${suffix}.pdf`;
        const fileId = await findFileByName(ftFolderId, fileName);
        if (!fileId) return res.status(404).send('Archivo no encontrado en Drive');

        if (wantInfo) {
            const meta = await getFileMetadata(fileId);
            return res.json({
                driveId: fileId,
                fileName,
                link: meta?.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
                size: meta?.size ? Number(meta.size) : null
            });
        }

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

// ─── POST /api/expedientes/:id/fichas-tecnicas/auto-copy ─────────────────────
// Copia la ficha técnica del modelo de aerotermia (campo aerotermia.ficha_tecnica)
// a la subcarpeta "3. FICHAS TÉCNICAS Y CERTIFICACIONES" del expediente.
// Body: { type: 'cal'|'acs', force?: boolean }
// Responde 200 { link, driveId, copied, source } o 400 { error, model? }
router.post('/:id/fichas-tecnicas/auto-copy', enforceAuth, async (req, res) => {
    const { type, force } = req.body;
    if (!['cal', 'acs'].includes(type)) {
        return res.status(400).json({ error: 'bad_type', message: 'type debe ser cal o acs' });
    }
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, numero_expediente, documentacion, instalacion')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).json({ error: 'expediente_not_found' });

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();

        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'no_drive_folder' });

        // Resolver el modelo aerotermia que aplica a este "type"
        const inst = exp.instalacion || {};
        let aeroNode;
        if (type === 'cal') {
            aeroNode = inst.aerotermia_cal;
        } else {
            // Para ACS: si misma_aerotermia_acs, usar el de calefacción
            aeroNode = inst.misma_aerotermia_acs ? inst.aerotermia_cal : inst.aerotermia_acs;
        }
        const aeroDbId = aeroNode?.aerotermia_db_id;
        if (!aeroDbId) {
            return res.status(400).json({ error: 'no_model', message: 'Selecciona un modelo de aerotermia primero' });
        }

        const { data: equipo } = await supabase
            .from('aerotermia')
            .select('id, marca, modelo_comercial, modelo_conjunto, ficha_tecnica')
            .eq('id', aeroDbId)
            .single();
        if (!equipo) return res.status(400).json({ error: 'model_not_found', aeroDbId });
        const modelLabel = equipo.modelo_comercial || equipo.modelo_conjunto || `id=${aeroDbId}`;

        if (!equipo.ficha_tecnica) {
            return res.status(400).json({ error: 'no_ficha_in_db', model: modelLabel });
        }

        // Extraer fileId del URL de Drive (formatos /d/<id>/ o ?id=<id>)
        const m = String(equipo.ficha_tecnica).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(equipo.ficha_tecnica).match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const sourceFileId = m?.[1];
        if (!sourceFileId) {
            return res.status(400).json({ error: 'bad_ficha_url', model: modelLabel, url: equipo.ficha_tecnica });
        }

        const { findSubfolderByName, createSubfolder, findFileByName, copyFile, deleteFile, getFileMetadata } = require('../services/driveService');

        let ftFolderId = await findSubfolderByName(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');
        if (!ftFolderId) ftFolderId = await createSubfolder(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');

        const suffix = type === 'acs' ? 'ACS' : 'CALEFACCION';
        const fileName = `${exp.numero_expediente} - FT AEROTERMIA ${suffix}.pdf`;

        // Si ya existe y no fuerzan, devolver el existente
        const existingId = await findFileByName(ftFolderId, fileName);
        if (existingId && !force) {
            const meta = await getFileMetadata(existingId);
            return res.json({
                driveId: existingId,
                link: meta?.webViewLink || `https://drive.google.com/file/d/${existingId}/view`,
                copied: false,
                source: 'existing'
            });
        }
        if (existingId && force) {
            await deleteFile(existingId);
        }

        const result = await copyFile(sourceFileId, ftFolderId, fileName);
        if (!result) return res.status(500).json({ error: 'copy_failed' });

        const linkField = type === 'acs' ? 'ft_aerotermia_acs_link' : 'ft_aerotermia_cal_link';
        const idField   = type === 'acs' ? 'ft_aerotermia_acs_id'   : 'ft_aerotermia_cal_id';
        const docObj = { ...(exp.documentacion || {}), [linkField]: result.link, [idField]: result.id };
        await supabase.from('expedientes')
            .update({ documentacion: docObj, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);

        console.log(`[FT auto-copy] ${fileName} ← modelo "${modelLabel}" (driveId=${result.id})`);
        res.json({ driveId: result.id, link: result.link, copied: true, source: 'model' });
    } catch (err) {
        console.error('Error POST /:id/fichas-tecnicas/auto-copy:', err);
        res.status(500).json({ error: 'internal', message: err.message });
    }
});

// ─── POST /api/expedientes/:id/anexos-cifo/upload ────────────────────────────
// Sube un PDF arbitrario como anexo extra del CIFO a la subcarpeta
// "3. FICHAS TÉCNICAS Y CERTIFICACIONES" del expediente y lo persiste en
// documentacion.cifo_extra_annexes[].
// Body: { base64, fileName, label? }
router.post('/:id/anexos-cifo/upload', enforceAuth, async (req, res) => {
    const { base64, fileName, label } = req.body;
    if (!base64 || !fileName) return res.status(400).json({ error: 'missing_fields' });
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, numero_expediente, documentacion')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).json({ error: 'expediente_not_found' });

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();
        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'no_drive_folder' });

        const { findSubfolderByName, createSubfolder, saveFileToFolder } = require('../services/driveService');
        let ftFolderId = await findSubfolderByName(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');
        if (!ftFolderId) ftFolderId = await createSubfolder(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');

        const safeName = String(fileName).trim().replace(/[\\/<>:"|?*]/g, '_');
        const buffer = Buffer.from(base64.split(',')[1] || base64, 'base64');
        const result = await saveFileToFolder(ftFolderId, safeName, 'application/pdf', buffer);
        if (!result) return res.status(500).json({ error: 'upload_failed' });

        const docObj = exp.documentacion || {};
        const list = Array.isArray(docObj.cifo_extra_annexes) ? docObj.cifo_extra_annexes : [];
        list.push({ driveId: result.id, link: result.link, fileName: safeName, label: label || safeName });
        await supabase.from('expedientes')
            .update({ documentacion: { ...docObj, cifo_extra_annexes: list }, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);

        res.json({ driveId: result.id, link: result.link, fileName: safeName, label: label || safeName });
    } catch (err) {
        console.error('Error POST /:id/anexos-cifo/upload:', err);
        res.status(500).json({ error: 'internal', message: err.message });
    }
});

// ─── GET /api/expedientes/:id/anexos-cifo/:driveId/content ───────────────────
// Sirve el contenido binario de un anexo extra del CIFO. Solo lo permite si el
// driveId aparece en documentacion.cifo_extra_annexes del expediente (para no
// exponer la Drive API como proxy genérico).
router.get('/:id/anexos-cifo/:driveId/content', async (req, res) => {
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('documentacion')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).send('Expediente no encontrado');
        const list = exp.documentacion?.cifo_extra_annexes || [];
        const allowed = list.some(a => a.driveId === req.params.driveId);
        if (!allowed) return res.status(404).send('Anexo no encontrado en el expediente');

        const { getFileContent } = require('../services/driveService');
        const content = await getFileContent(req.params.driveId);
        if (!content) return res.status(404).send('No se pudo leer el archivo');

        res.setHeader('Content-Type', 'application/pdf');
        res.send(content);
    } catch (err) {
        console.error('Error GET anexos-cifo/:driveId/content:', err);
        res.status(500).send('Error');
    }
});

// ─── DELETE /api/expedientes/:id/anexos-cifo/:driveId ────────────────────────
// Elimina un anexo extra del CIFO (de la lista cifo_extra_annexes y de Drive).
router.delete('/:id/anexos-cifo/:driveId', enforceAuth, async (req, res) => {
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, documentacion')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).json({ error: 'expediente_not_found' });

        const docObj = exp.documentacion || {};
        const list = Array.isArray(docObj.cifo_extra_annexes) ? docObj.cifo_extra_annexes : [];
        const newList = list.filter(a => a.driveId !== req.params.driveId);

        const { deleteFile } = require('../services/driveService');
        await deleteFile(req.params.driveId);

        await supabase.from('expedientes')
            .update({ documentacion: { ...docObj, cifo_extra_annexes: newList }, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);

        res.json({ success: true });
    } catch (err) {
        console.error('Error DELETE /:id/anexos-cifo/:driveId:', err);
        res.status(500).json({ error: 'internal', message: err.message });
    }
});

// Hace público un archivo de Drive (anyone with link → reader)
// Usado para fichas técnicas del modelo de aerotermia que se referencian por enlace
router.post('/drive/make-public', enforceAuth, async (req, res) => {
    const { fileId } = req.body;
    if (!fileId) return res.status(400).json({ error: 'fileId requerido' });
    try {
        const { setFolderPublic } = require('../services/driveService');
        await setFolderPublic(fileId);
        res.json({ ok: true });
    } catch (err) {
        // Si ya es público o no tenemos acceso, no es un error crítico
        console.warn('[drive/make-public] No se pudo hacer público el archivo:', err.message);
        res.json({ ok: false, warning: err.message });
    }
});

// ─── GET /api/expedientes/:id/notify-client ──────────────────────────────────
// Endpoint PÚBLICO (sin auth). El admin lo recibe como enlace one-tap en su WA/email
// cuando el certificador registra el CEE. Al pulsarlo envía las notificaciones
// al cliente (WA + email) y marca el expediente como notificado.
// Query params: token (string), phase (inicial | final)
router.get('/:id/notify-client', async (req, res) => {
    const { token, phase } = req.query;

    const sendHtmlPage = (ok, message) => {
        const color = ok ? '#10b981' : '#ef4444';
        const icon = ok ? '✅' : '❌';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BROKERGY</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0e1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 20px; padding: 40px 30px; max-width: 420px; width: 100%; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { color: ${color}; margin-bottom: 12px; font-size: 22px; }
    p { color: #94a3b8; line-height: 1.5; margin-bottom: 8px; }
    .brand { color: #475569; font-size: 11px; margin-top: 30px; letter-spacing: 0.05em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? '📱' : '⚠️'}</div>
    <h2>${ok ? 'Cliente Notificado' : 'Error'}</h2>
    <p>${message}</p>
    <div class="brand">BROKERGY · Ingeniería Energética</div>
  </div>
</body>
</html>`);
    };

    if (!token || !phase) return sendHtmlPage(false, 'Parámetros inválidos.');
    if (phase !== 'inicial' && phase !== 'final') return sendHtmlPage(false, 'Phase inválida. Usa "inicial" o "final".');

    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return sendHtmlPage(false, 'Expediente no encontrado.');

        const seguimiento = exp.seguimiento || {};
        const tokenField = phase === 'final' ? 'notify_client_token_final' : 'notify_client_token_inicial';
        const expField   = phase === 'final' ? 'notify_client_token_final_exp' : 'notify_client_token_inicial_exp';
        const notifiedField = phase === 'final' ? 'cee_fin_client_notified_at' : 'cee_ini_client_notified_at';

        if (!seguimiento[tokenField]) {
            return sendHtmlPage(false, 'Este enlace ya fue utilizado o no existe.');
        }
        if (seguimiento[tokenField] !== token) {
            return sendHtmlPage(false, 'Token inválido. Es posible que se haya generado un enlace más reciente.');
        }
        const expTimestamp = seguimiento[expField];
        if (expTimestamp && Date.now() > expTimestamp) {
            return sendHtmlPage(false, 'El enlace ha caducado (validez 7 días). Genera uno nuevo desde el panel.');
        }

        // Invalidar token de inmediato (uso único) y marcar como notificado
        const newSeguimiento = {
            ...seguimiento,
            [tokenField]: null,
            [expField]: null,
            [notifiedField]: new Date().toISOString()
        };
        await supabase.from('expedientes')
            .update({ seguimiento: newSeguimiento, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);

        // Enviar notificaciones al cliente (y partners/admin como de costumbre)
        const result = phase === 'final'
            ? await notifyCeeFinalRegistrado(exp)
            : await notifyCeeInicialRegistrado(exp);

        if (!result.ok && result.reason === 'cliente-not-found') {
            return sendHtmlPage(false, 'No se encontró al cliente en la base de datos. Verifícalo en el panel.');
        }

        return sendHtmlPage(true, `El cliente ha sido notificado correctamente por WhatsApp y email sobre el registro del CEE ${phase === 'final' ? 'Final' : 'Inicial'}.`);
    } catch (err) {
        console.error('[notify-client]', err.message);
        return sendHtmlPage(false, 'Error interno del servidor. Inténtalo desde el panel de administración.');
    }
});

// PATCH /api/expedientes/:id/prioridad
router.patch('/:id/prioridad', enforceAuth, async (req, res) => {
    try {
        const { prioridad } = req.body;
        const valid = ['NORMAL', 'ALTA', 'URGENTE'];
        if (!valid.includes(prioridad)) return res.status(400).json({ error: 'Prioridad inválida' });
        const { error } = await supabase.from('expedientes')
            .update({ prioridad, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ ok: true, prioridad });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
