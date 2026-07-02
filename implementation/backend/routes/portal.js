// ============================================================================
// routes/portal.js — PORTAL DEL CLIENTE ("Mi expediente")
// ----------------------------------------------------------------------------
// Montado en /api/public/portal (server.js). Solo lectura + subida (reusa los
// endpoints /reforma-docs existentes). Auth por el MISMO token que /subir-docs
// (oportunidades.datos_calculo.upload_token). NUNCA expone margen/precio SO.
// ============================================================================
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { attachUploadToken } = require('../services/reformaUploadService');
const portal = require('../services/portalService');

// --- Rate limiter en memoria para el login (el DNI es semi-público) ----------
const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 min
const LOGIN_MAX = 8;                      // intentos por ventana
const loginHits = new Map();              // ip -> [timestamps]
function loginRateLimited(ip) {
    const now = Date.now();
    const arr = (loginHits.get(ip) || []).filter(t => now - t < LOGIN_WINDOW_MS);
    arr.push(now);
    loginHits.set(ip, arr);
    return arr.length > LOGIN_MAX;
}
// Limpieza perezosa para no acumular IPs (se ejecuta en cada login)
function sweepLoginHits() {
    const now = Date.now();
    for (const [ip, arr] of loginHits) {
        const kept = arr.filter(t => now - t < LOGIN_WINDOW_MS);
        if (kept.length) loginHits.set(ip, kept); else loginHits.delete(ip);
    }
}

// Valida el token contra la oportunidad; devuelve la oportunidad o null.
async function loadOppByToken(uuid, token) {
    const { data: opp } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, ficha, datos_calculo')
        .eq('id', uuid)
        .maybeSingle();
    if (!opp) return { error: 404 };
    if (!token || opp.datos_calculo?.upload_token !== token) return { error: 403 };
    return { opp };
}

// ---------------------------------------------------------------------------
// POST /api/public/portal/login  { numeroExpediente, dni }
// → { token, uuid } si nº de expediente + DNI coinciden.
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
        sweepLoginHits();
        if (loginRateLimited(ip)) {
            return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
        }

        const numeroExpediente = String(req.body?.numeroExpediente || '').trim();
        const dni = portal.normalizeDni(req.body?.dni);
        if (!numeroExpediente || !dni) {
            return res.status(400).json({ error: 'Introduce tu nº de expediente y tu DNI.' });
        }

        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, cliente_id, numero_expediente')
            .eq('numero_expediente', numeroExpediente)
            .maybeSingle();

        // Mensaje genérico para no permitir enumerar expedientes/DNIs.
        const genericFail = () => res.status(401).json({ error: 'Nº de expediente o DNI incorrectos.' });
        if (!exp || !exp.cliente_id || !exp.oportunidad_id) return genericFail();

        const { data: cli } = await supabase
            .from('clientes')
            .select('dni')
            .eq('id_cliente', exp.cliente_id)
            .maybeSingle();
        if (!cli || portal.normalizeDni(cli.dni) !== dni) return genericFail();

        const { token } = await attachUploadToken(exp.oportunidad_id);
        return res.json({ token, uuid: exp.oportunidad_id });
    } catch (e) {
        console.error('[portal/login]', e.message);
        return res.status(500).json({ error: 'Error interno. Inténtalo más tarde.' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/public/portal/expediente/:uuid?token= → DTO curado cliente-safe
// ---------------------------------------------------------------------------
router.get('/expediente/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const { token } = req.query;
        const { opp, error } = await loadOppByToken(uuid, token);
        if (error === 404) return res.status(404).json({ error: 'Expediente no encontrado.' });
        if (error === 403) return res.status(403).json({ error: 'Enlace inválido o caducado.' });

        // Expediente vinculado a la oportunidad
        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, cliente_id, documentacion, cee, instalacion, lote_id')
            .eq('oportunidad_id', uuid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Aún no hay expediente para esta solicitud.' });

        // Estado / qué falta desde la vista de lifecycle
        const { data: lc } = await supabase
            .from('v_expedientes_lifecycle')
            .select('estado_actual, dias_en_estado_actual, responsable_bloqueo, campos_pendientes, cee_ini_registro_ok, cee_fin_registro_ok')
            .eq('numero_expediente', exp.numero_expediente)
            .maybeSingle();

        // Estado del lote (fase de Tramitación CAE), si el expediente está en un lote
        let loteEstado = null;
        if (exp.lote_id) {
            const { data: lote } = await supabase.from('lotes').select('estado').eq('id', exp.lote_id).maybeSingle();
            loteEstado = lote?.estado || null;
        }

        // Nombre del cliente (para la cabecera)
        const { data: cli } = await supabase
            .from('clientes')
            .select('nombre_razon_social, apellidos')
            .eq('id_cliente', exp.cliente_id)
            .maybeSingle();

        const estadoActual = lc?.estado_actual || null;
        const hito = portal.mapEstadoToHito(estadoActual);
        const requerimiento = portal.buildRequerimiento(exp.documentacion);

        // DTO whitelist — jamás la fila cruda, jamás margen/precio SO.
        return res.json({
            identidad: {
                numeroExpediente: exp.numero_expediente,
                nombre: [cli?.nombre_razon_social, cli?.apellidos].filter(Boolean).join(' ').trim() || null,
            },
            dinero: await portal.buildClientMoney(opp, exp),
            estado: {
                hitoIndex: hito.hitoIndex,
                hitoLabel: hito.hitoLabel,
                microcopy: hito.microcopy,
                subestado: hito.subestado,
                responsable: lc?.responsable_bloqueo || null,
                diasEnEstado: lc?.dias_en_estado_actual ?? null,
                loteEstado,
            },
            requerimiento,
            queFalta: portal.clientPendings(lc?.campos_pendientes),
            documentos: portal.buildDocumentos(exp, { ceeIniOk: lc?.cee_ini_registro_ok, ceeFinOk: lc?.cee_fin_registro_ok }),
            upload: { uuid, token },
        });
    } catch (e) {
        console.error('[portal/expediente]', e.message);
        return res.status(500).json({ error: 'Error interno.' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/public/portal/doc/:uuid/:docKey?token= → proxy de descarga (Drive)
// ---------------------------------------------------------------------------
function guessMime(name) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    return 'application/octet-stream';
}

router.get('/doc/:uuid/:docKey', async (req, res) => {
    try {
        const { uuid, docKey } = req.params;
        const { token } = req.query;
        const { error } = await loadOppByToken(uuid, token);
        if (error === 404) return res.status(404).end();
        if (error === 403) return res.status(403).end();

        const { data: exp } = await supabase
            .from('expedientes')
            .select('documentacion, cee')
            .eq('oportunidad_id', uuid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!exp) return res.status(404).end();

        const resolved = portal.resolveDocLink(exp, docKey);
        if (!resolved) return res.status(404).json({ error: 'Documento no disponible.' });

        const buf = await driveService.getFileContent(resolved.driveId);
        if (!buf) return res.status(404).end();

        res.set('Content-Type', guessMime(resolved.name));
        res.set('Content-Disposition', `inline; filename="${resolved.name}"`);
        res.set('Cache-Control', 'private, max-age=3600');
        return res.send(buf);
    } catch (e) {
        console.error('[portal/doc]', e.message);
        return res.status(500).end();
    }
});

module.exports = router;
