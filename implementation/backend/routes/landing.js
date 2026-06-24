/**
 * Routes públicas de la landing.
 *
 * IMPORTANTE — Todas las rutas son PÚBLICAS, sin requireAuth/enforceAuth.
 * La seguridad descansa sobre:
 *   - geoGate (bloquea por provincia)
 *   - turnstileService (verifica que el envío viene de humano)
 *   - validaciones en leadService (rgpd, formato de datos)
 *
 * Endpoints expuestos:
 *   GET  /api/landing/config            → Config pública (CCAA permitidas, flags)
 *   GET  /api/landing/partner/:slug     → Branding del partner (404 si no activa)
 *   GET  /api/landing/instaladores      → Instaladores activos por provincia/distribuidor
 *   POST /api/landing/lead              → Creación del LEAD (con captcha + geoGate)
 */

const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { geoGate } = require('../middleware/geoGate');
const { requireAuth } = require('../middleware/auth');
const { getAvailableCCAA, ALLOWED_PROVINCES } = require('../data/allowedProvinces');
const { verifyTurnstileToken, isEnabled: isTurnstileEnabled } = require('../services/turnstileService');
const { createLead } = require('../services/leadService');
const reformaUploadService = require('../services/reformaUploadService');
const { sendLeadSummaryEmail } = require('../services/emailService');

// Regex de validación del slug (mismo que en SQL CHECK constraint)
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{1,78}[a-z0-9])$/;

// ---------------------------------------------------------------------------
// GET /api/landing/config
// Devuelve la configuración pública necesaria para el frontend del funnel.
// ---------------------------------------------------------------------------
router.get('/config', (req, res) => {
    res.json({
        ccaa_atendidas: getAvailableCCAA(),
        provincias_atendidas: Object.entries(ALLOWED_PROVINCES).map(([code, info]) => ({
            code,
            provincia: info.provincia,
            ccaa: info.ccaa
        })),
        turnstile_enabled: isTurnstileEnabled(),
        presupuesto_default_eur: 15000
    });
});

// ---------------------------------------------------------------------------
// GET /api/landing/partner/:slug
// Devuelve branding del partner para la landing white-label.
// 404 si el slug no existe o la landing no está activa.
// ---------------------------------------------------------------------------
router.get('/partner/:slug', async (req, res) => {
    const { slug } = req.params;

    if (!slug || !SLUG_REGEX.test(slug)) {
        return res.status(400).json({ error: 'Formato de slug inválido', code: 'INVALID_SLUG' });
    }

    try {
        const { data, error } = await supabase
            .from('prescriptores')
            .select('id_empresa, acronimo, razon_social, logo_empresa, landing_slug, landing_activa, landing_color_primary, landing_titulo, landing_subtitulo, landing_telefono_contacto, landing_email_contacto, tipo_empresa, provincia, ccaa')
            .eq('landing_slug', slug)
            .eq('landing_activa', true)
            .maybeSingle();

        if (error) {
            console.error('[landing/partner] Error:', error.message);
            return res.status(500).json({ error: 'Error consultando el partner' });
        }
        if (!data) {
            return res.status(404).json({ error: 'Landing no encontrada', code: 'PARTNER_NOT_FOUND' });
        }

        // Solo exponemos campos seguros (no devolvemos email, tlf interno, cif, etc.)
        res.json({
            slug: data.landing_slug,
            nombre_comercial: data.acronimo || data.razon_social,
            logo_url: data.logo_empresa,
            color_primary: data.landing_color_primary,
            titulo: data.landing_titulo,
            subtitulo: data.landing_subtitulo,
            telefono_contacto: data.landing_telefono_contacto,
            email_contacto: data.landing_email_contacto,
            tipo_empresa: data.tipo_empresa,
            provincia: data.provincia,
            ccaa: data.ccaa
        });
    } catch (err) {
        console.error('[landing/partner] Excepción:', err);
        res.status(500).json({ error: 'Error inesperado' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/landing/instaladores?provincia=XX&distribuidor_slug=YY
// Lista instaladores activos para la pantalla final del funnel.
//
// Si distribuidor_slug se proporciona, filtra por instaladores vinculados a
// ese distribuidor vía tabla distribuidor_instalador. Si no, devuelve todos
// los instaladores con landing_activa=true en la provincia indicada.
// ---------------------------------------------------------------------------
router.get('/instaladores', async (req, res) => {
    const provincia = (req.query.provincia || '').toString().trim();
    const distribuidorSlug = (req.query.distribuidor_slug || '').toString().trim();

    if (!provincia) {
        return res.status(400).json({ error: 'Falta el parámetro `provincia`', code: 'MISSING_PROVINCIA' });
    }

    try {
        let instaladorIds = null;

        // Si viene con distribuidor, primero resolvemos sus instaladores vinculados
        if (distribuidorSlug) {
            if (!SLUG_REGEX.test(distribuidorSlug)) {
                return res.status(400).json({ error: 'Formato de distribuidor_slug inválido' });
            }

            const { data: dist, error: distErr } = await supabase
                .from('prescriptores')
                .select('id_empresa')
                .eq('landing_slug', distribuidorSlug)
                .maybeSingle();

            if (distErr) console.error('[landing/instaladores] Error buscando distribuidor:', distErr.message);
            if (!dist) {
                return res.json({ instaladores: [], origen: 'sin_distribuidor' });
            }

            const { data: links, error: linksErr } = await supabase
                .from('distribuidor_instalador')
                .select('instalador_id')
                .eq('distribuidor_id', dist.id_empresa);

            if (linksErr) console.error('[landing/instaladores] Error consultando vínculos:', linksErr.message);
            instaladorIds = (links || []).map(l => l.instalador_id);

            // Si el distribuidor no tiene instaladores asociados, vamos a fallback
            // (mostramos todos los instaladores de la provincia).
            if (instaladorIds.length === 0) instaladorIds = null;
        }

        let query = supabase
            .from('prescriptores')
            .select('id_empresa, acronimo, razon_social, logo_empresa, provincia, ccaa, tipo_empresa, landing_telefono_contacto')
            .eq('tipo_empresa', 'INSTALADOR')
            .ilike('provincia', provincia)
            .limit(8);

        if (instaladorIds) {
            query = query.in('id_empresa', instaladorIds);
        }

        const { data, error } = await query;
        if (error) {
            console.error('[landing/instaladores] Error:', error.message);
            return res.status(500).json({ error: 'Error consultando instaladores' });
        }

        const instaladores = (data || []).map(p => ({
            id: p.id_empresa,
            nombre: p.acronimo || p.razon_social,
            logo_url: p.logo_empresa,
            provincia: p.provincia,
            ccaa: p.ccaa,
            telefono_contacto: p.landing_telefono_contacto
        }));

        res.json({
            instaladores,
            origen: distribuidorSlug
                ? (instaladorIds ? 'distribuidor' : 'fallback_provincia')
                : 'provincia'
        });
    } catch (err) {
        console.error('[landing/instaladores] Excepción:', err);
        res.status(500).json({ error: 'Error inesperado' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/landing/check-rc/:rc
// Verifica si ya existe alguna oportunidad para esa referencia catastral.
// Solo devuelve metadata segura (no expone email/tlf/nombre del cliente que
// la creó). Se usa en la landing para avisar "ya hicimos una simulación
// para esta vivienda" sin filtrar datos personales.
// ---------------------------------------------------------------------------
router.get('/check-rc/:rc', async (req, res) => {
    const { rc } = req.params;
    if (!rc || rc.length < 14) {
        return res.status(400).json({ error: 'RC inválida', code: 'INVALID_RC' });
    }
    try {
        const { data, error } = await supabase
            .from('oportunidades')
            .select('id_oportunidad, created_at, ficha, datos_calculo')
            .eq('ref_catastral', rc)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('[landing/check-rc] Error:', error.message);
            return res.status(500).json({ error: 'Error consulta' });
        }
        if (!data || data.length === 0) {
            return res.json({ exists: false });
        }

        const op = data[0];
        const diffDays = Math.floor((Date.now() - new Date(op.created_at).getTime()) / 86400000);
        return res.json({
            exists: true,
            createdAt: op.created_at,
            daysAgo: diffDays,
            ficha: op.ficha,
            origen: op.datos_calculo?.origen || null,
            estado: op.datos_calculo?.estado || null
        });
    } catch (err) {
        console.error('[landing/check-rc] Excepción:', err);
        res.status(500).json({ error: 'Error inesperado' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/landing/lead
// Crea un LEAD en estado='LEAD' a partir del funnel completo.
//
// Body esperado:
// {
//   provinceCode: '28',                ← geoGate validará
//   turnstile_token: 'xxx',            ← turnstileService validará si está enabled
//   partner_slug: 'mi-instalador' | null,
//   contacto: { nombre, apellidos, email, tlf, dni, titular_type, rgpd_aceptado },
//   catastro: { ref_catastral, address, municipio, codigo_postal, ... },
//   funnel: { isReforma, combustible_actual, edad_caldera, ... },
//   calculatorInputs: { ... }          ← ya mapeado por el frontend
// }
// ---------------------------------------------------------------------------
// requireAuth añadido en modo "opcional" — si hay token resuelve req.user (necesario
// para identificar al partner que crea desde "Nueva Simulación" en mode='internal').
// Si no hay token, req.user queda null y el flujo público sigue funcionando normal.
router.post('/lead', requireAuth, geoGate, async (req, res) => {
    const { turnstile_token, partner_slug, contacto, catastro, funnel, calculatorInputs, precomputedResult, demandaCalefaccionPorM2, origen, delivery_preference, delivery_summary, mode } = req.body || {};
    const isReformaLead = origen === 'reforma';
    const isInternalReq = mode === 'internal';

    // 1. Captcha (si está habilitado)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const turnstileResult = await verifyTurnstileToken(turnstile_token, clientIp);
    if (!turnstileResult.ok) {
        console.warn('[landing/lead] Captcha rechazado:', turnstileResult.errorCodes);
        return res.status(403).json({
            error: 'Verificación anti-bot fallida. Recarga la página e inténtalo de nuevo.',
            code: 'CAPTCHA_FAILED'
        });
    }

    // 2. Resolver prescriptor_id:
    //    - Si es internal (Nueva Simulación) y el user logueado es PARTNER/DISTRIBUIDOR
    //      → su prescriptor_id (auto-asignación, no se pregunta en el form)
    //    - Si es público con partner_slug → resolver desde slug (landing white-label)
    let prescriptorId = null;
    const rol = (req.user?.rol_nombre || req.user?.rol || '').toUpperCase();
    if (isInternalReq && req.user?.prescriptor_id && rol !== 'ADMIN') {
        prescriptorId = req.user.prescriptor_id;
    } else if (partner_slug) {
        if (!SLUG_REGEX.test(partner_slug)) {
            return res.status(400).json({ error: 'Formato de partner_slug inválido' });
        }
        const { data: partner } = await supabase
            .from('prescriptores')
            .select('id_empresa')
            .eq('landing_slug', partner_slug)
            .eq('landing_activa', true)
            .maybeSingle();
        prescriptorId = partner?.id_empresa || null;
    }

    // 3. Delegar al servicio
    try {
        const result = await createLead({
            contacto: contacto || {},
            catastro: catastro || {},
            funnel: funnel || {},
            calculatorInputs: calculatorInputs || {},
            precomputedResult: precomputedResult || null,
            demandaCalefaccionPorM2: demandaCalefaccionPorM2 || null,
            geoContext: req.geoContext,
            partnerSlug: partner_slug || null,
            prescriptorId,
            mode: isInternalReq ? 'internal' : 'public',
            creatorUser: req.user || null
        });

        // delivery_preference llega como array desde el frontend
        const deliveryArr = Array.isArray(delivery_preference)
            ? delivery_preference
            : (delivery_preference ? [delivery_preference] : ['tecnico']);
        const wantsWA    = deliveryArr.includes('whatsapp');
        const wantsEmail = deliveryArr.includes('email');

        console.log(`[landing/lead] LEAD creado: ${result.id_oportunidad} (score=${result.lead_score}, caliente=${result.lead_caliente}, delivery=${deliveryArr.join(',')})`);

        // --- Enlace único de subida de documentación (TODOS los leads) ---
        // Se genera siempre el token + se expone en la respuesta para que el
        // frontend muestre el CTA de "Subir fotos" en la pantalla de resultado.
        // La carpeta Drive se crea en background (no bloquea la respuesta).
        let uploadLink = null;
        if (result.oportunidad_uuid) {
            try {
                const { token } = await reformaUploadService.attachUploadToken(result.oportunidad_uuid);
                uploadLink = reformaUploadService.buildUploadLink(result.oportunidad_uuid, token);
                result.upload_link = uploadLink;
                setImmediate(async () => {
                    try { await reformaUploadService.ensureDriveFolder(result.oportunidad_uuid); }
                    catch (e) { console.error('[lead/upload] Error creando carpeta Drive:', e.message); }
                });
            } catch (e) {
                console.error('[lead/upload] No se pudo preparar el enlace de subida:', e.message);
            }
        }

        // --- Entrega de la propuesta al cliente según su preferencia ---
        // Los valores financieros vienen pre-calculados desde el frontend en
        // delivery_summary. Se ejecuta en background (setImmediate) para no
        // bloquear la respuesta.
        if (wantsWA || wantsEmail) {
            setImmediate(async () => {
                try {
                    const ds    = delivery_summary || {};
                    const nombre = contacto?.nombre?.split(' ')[0] || 'cliente';
                    const fmtEur = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.abs(n || 0))} €`;
                    const caeN   = ds.cae   || 0;
                    const irpfN  = ds.irpf  || 0;
                    const totalN = caeN + irpfN;
                    const netaN  = ds.neta  || 0;
                    const ahorroN = ds.ahorro || 0;

                    if (wantsWA && contacto?.tlf) {
                        const whatsappService = require('../services/whatsappService');
                        // NO comprobamos status?.ready aquí: sendText() ya tiene cola
                        // persistente en Supabase. Si WhatsApp no está listo en este
                        // momento, el mensaje queda PENDING y se envía en cuanto reconecte.
                        // El guard anterior causaba que el mensaje se eliminase en lugar
                        // de encolarse, de ahí que el cliente no recibiese nada.
                        const lines = [
                            `¡Hola ${nombre}! 👋`,
                            ``,
                            `Hemos calculado tu simulación de ayudas para cambiar a aerotermia (Ref. *${result.id_oportunidad}*).`,
                            ``,
                            `🔹 *A modo resumen:*`,
                            ``,
                            `Instalando el sistema de aerotermia, podrías obtener una ayuda de *${fmtEur(caeN)}* gracias al Bono Energético BROKERGY.`,
                        ];
                        if (irpfN > 0) {
                            lines.push('');
                            lines.push(`Además, si en tu caso puedes acogerte a las deducciones en el IRPF por contar con retenciones aplicables y siempre que estén vigentes, el importe estimado sería de *${fmtEur(irpfN)}*. (Nosotros dejaremos toda la parte técnica preparada para que las puedas solicitar).`);
                        }
                        lines.push('');
                        lines.push(`💡 *Resumen total de ayudas:* hasta *${fmtEur(totalN)}*.`);
                        lines.push(`🏠 *Tu inversión neta tras ayudas:* *${fmtEur(netaN)}*.`);
                        if (ahorroN > 0) {
                            lines.push(`⚡ *Ahorro estimado en factura:* *${fmtEur(ahorroN)}* al año.`);
                        }
                        if (uploadLink) {
                            lines.push('');
                            lines.push(`📸 *Ayúdanos a afinar la propuesta* subiendo algunas fotos de tu vivienda e instalación actual. Te llevará 2 minutos desde el móvil:`);
                            lines.push(uploadLink);
                        }
                        lines.push('');
                        lines.push(`Un técnico de Brokergy revisará tu caso y te contactará para concretar la propuesta definitiva.`);
                        lines.push('');
                        lines.push(`Un saludo,`);
                        lines.push(`*BROKERGY — Ingeniería Energética*`);
                        lines.push(`info@brokergy.es · 623 926 179`);
                        await whatsappService.sendText(contacto.tlf, lines.join('\n'));
                        console.log(`[landing/delivery] WhatsApp encolado para ${contacto.tlf}`);
                    }

                    if (wantsEmail && contacto?.email) {
                        await sendLeadSummaryEmail({
                            to: contacto.email,
                            nombre: contacto.nombre,
                            idOportunidad: result.id_oportunidad,
                            cae:    caeN,
                            irpf:   irpfN,
                            neta:   netaN,
                            ahorro: ahorroN,
                            uploadLink,
                        });
                        console.log(`[landing/delivery] Email enviado a ${contacto.email}`);
                    }
                } catch (e) {
                    console.error('[landing/delivery] Error entregando propuesta al cliente:', e.message);
                }
            });
        }

        // --- Flujo /reforma: aviso al admin (NO al cliente — el cliente ya
        //     recibe el mensaje proposal-style del bloque anterior con datos
        //     económicos y enlace de subida). Aquí solo se avisa al grupo
        //     admin de Brokergy de la entrada del lead. ---
        if (isReformaLead) {
            setImmediate(async () => {
                try {
                    const whatsappService = require('../services/whatsappService');
                    const nombre = contacto?.nombre || 'cliente';
                    const adminMsg = `🆕 *LEAD REFORMA (web)*\n\nRef *${result.id_oportunidad}*\n👤 ${nombre}${contacto?.tlf ? `\n📞 ${contacto.tlf}` : ''}${contacto?.email ? `\n✉ ${contacto.email}` : ''}${uploadLink ? `\n\n📎 Enlace subida: ${uploadLink}` : ''}`;
                    whatsappService.sendText(process.env.WHATSAPP_ADMIN_CHAT || '34623926179', adminMsg).catch(() => {});
                } catch (e) { console.error('[reforma/lead] Error avisando al admin:', e.message); }
            });
        }

        return res.status(201).json(result);
    } catch (err) {
        console.error('[landing/lead] Error creando lead:', err.message);
        const msg = err.message || 'Error creando el lead';
        // Errores de validación → 400; errores BD/internos → 500
        const isValidation = /Falta|obligatorio|inválid|inválido|Necesitamos/i.test(msg);
        return res.status(isValidation ? 400 : 500).json({ error: msg });
    }
});

module.exports = router;
