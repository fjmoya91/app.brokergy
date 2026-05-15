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
const { getAvailableCCAA, ALLOWED_PROVINCES } = require('../data/allowedProvinces');
const { verifyTurnstileToken, isEnabled: isTurnstileEnabled } = require('../services/turnstileService');
const { createLead } = require('../services/leadService');

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
            .select('id_empresa, acronimo, razon_social, logo_empresa, landing_slug, landing_activa, landing_color_primary, landing_titulo, landing_subtitulo, landing_telefono_contacto, tipo_empresa, provincia, ccaa')
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
router.post('/lead', geoGate, async (req, res) => {
    const { turnstile_token, partner_slug, contacto, catastro, funnel, calculatorInputs, precomputedResult, demandaCalefaccionPorM2 } = req.body || {};

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

    // 2. Resolver prescriptor_id desde partner_slug (si vino de landing white-label)
    let prescriptorId = null;
    if (partner_slug) {
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
            prescriptorId
        });

        console.log(`[landing/lead] LEAD creado: ${result.id_oportunidad} (score=${result.lead_score}, caliente=${result.lead_caliente})`);
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
