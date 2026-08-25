const express = require('express');
const router = express.Router();
const { adminOnly, requireAuth, staffOnly } = require('../middleware/auth');

// Cargamos el servicio de forma tolerante: si falla, la app sigue viva.
let wwa = null;
let loadError = null;
try {
    wwa = require('../services/whatsappService');
} catch (err) {
    loadError = err.message;
    console.error('[whatsapp route] No se pudo cargar el servicio:', err.message);
}

function requireService(req, res, next) {
    if (!wwa) {
        return res.status(503).json({
            error: 'Servicio WhatsApp no disponible',
            details: loadError,
        });
    }
    next();
}

// GET /api/whatsapp/status
router.get('/status', requireAuth, requireService, (req, res) => {
    try {
        res.json(wwa.getStatus());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/whatsapp/connect  → inicializa el cliente (lazy)
router.post('/connect', adminOnly, requireService, async (req, res) => {
    try {
        const result = await wwa.init();
        res.json({ ...result, status: wwa.getStatus() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/whatsapp/qr  → devuelve el QR actual como data URL (PNG)
router.get('/qr', adminOnly, requireService, async (req, res) => {
    try {
        const qr = wwa.getQr();
        if (!qr) {
            return res.status(404).json({ error: 'No hay QR disponible en este momento.' });
        }
        // qrcode es una dep ligera y común; si no está, devolvemos el string crudo.
        try {
            // eslint-disable-next-line global-require
            const QRCode = require('qrcode');
            const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
            return res.json({ qr, dataUrl });
        } catch (_) {
            return res.json({ qr, dataUrl: null });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/whatsapp/disconnect — pausa el servicio, sesión conservada
router.post('/disconnect', adminOnly, requireService, async (req, res) => {
    try {
        const result = await wwa.disconnect();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/whatsapp/logout — cierra sesión completamente, requiere QR de nuevo
router.post('/logout', adminOnly, requireService, async (req, res) => {
    try {
        const result = await wwa.logout();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/whatsapp/send-text  { phone, message }
router.post('/send-text', requireAuth, requireService, async (req, res) => {
    try {
        const { phone, message } = req.body || {};
        if (!phone || !message) {
            return res.status(400).json({ error: 'phone y message son obligatorios' });
        }
        const out = await wwa.sendText(phone, message);
        res.json(out);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET /api/whatsapp/groups  → lista los grupos del número conectado
router.get('/groups', adminOnly, requireService, async (req, res) => {
    try {
        const groups = await wwa.getGroups();
        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/whatsapp/send-media  { phone, caption, media: { url?, base64?, mimetype?, filename? }, asDocument? }
router.post('/send-media', requireAuth, requireService, async (req, res) => {
    try {
        const { phone, caption, media, asDocument } = req.body || {};
        if (!phone || !media) {
            return res.status(400).json({ error: 'phone y media son obligatorios' });
        }
        const out = await wwa.sendMedia(phone, media, { caption, asDocument });
        res.json(out);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETAS de WhatsApp Business
//
// Son de WhatsApp, no del bot: sirven para organizar la cartera y una de ellas,
// además, enciende el asistente. Se exponen para poder gestionarlas desde la
// ficha del cliente sin tener que ir al móvil.
//
// LEER es `staffOnly`; ESCRIBIR es `adminOnly`, porque poner la etiqueta del
// asistente es decidir que a ese cliente le va a contestar una máquina en
// nombre de BROKERGY.
// ─────────────────────────────────────────────────────────────────────────────
const waLabels = require('../services/whatsappLabels');

// Un fallo de dato o de estado (WhatsApp caído, chat inexistente, cuenta que no
// es Business) NO es una avería del servidor: su mensaje ya está escrito para
// que lo lea una persona, y devolverlo como 500 hace pensar que la app se ha
// roto cuando lo único que hay que hacer es conectar WhatsApp.
const errorLabels = (res, e) => res.status(e.datoInvalido ? 400 : 500).json({ error: e.message });

// ⚠️ OJO con `requireAuth`: NO exige sesión. Si no hay token pone `req.user =
// null` y deja pasar — sirve para SABER quién eres, no para exigirlo. Las
// etiquetas dicen cómo está clasificada la cartera y una de ellas enciende el
// asistente, así que aquí se usa `staffOnly` para leer y `adminOnly` para
// escribir. Comprobado el 25/08/2026: con `requireAuth` la lista salía entera
// a un curl sin cabeceras.

// GET /api/whatsapp/etiquetas → todas las de la cuenta
router.get('/etiquetas', staffOnly, async (req, res) => {
    try {
        res.json({ etiquetas: await waLabels.listar(), etiquetaBot: process.env.BOT_WHATSAPP_ETIQUETA || 'MOIA' });
    } catch (e) { errorLabels(res, e); }
});

// GET /api/whatsapp/etiquetas/:telefono → las que lleva ese chat
router.get('/etiquetas/:telefono', staffOnly, async (req, res) => {
    try {
        // Sin `crear`: abrir la ficha de un cliente no puede hacer aparecer una
        // conversación vacía en el móvil. El chat se prepara solo al etiquetar,
        // que es una acción deliberada.
        const chatId = await waLabels.chatIdDeTelefono(req.params.telefono);
        const [etiquetas, puestas] = await Promise.all([waLabels.listar(), waLabels.deChat(chatId)]);
        res.json({
            chat_id: chatId,
            puestas,
            etiquetas,
            etiquetaBot: process.env.BOT_WHATSAPP_ETIQUETA || 'MOIA',
        });
    } catch (e) { errorLabels(res, e); }
});

// PUT /api/whatsapp/etiquetas/:telefono  { ids: [...] }
//
// La lista va COMPLETA, no incremental: así es la operación de WhatsApp por
// dentro, y además evita el problema clásico de dos pestañas abiertas — gana la
// última en guardar, en vez de mezclarse en un estado que nadie pidió.
router.put('/etiquetas/:telefono', adminOnly, async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
        if (!ids) return res.status(400).json({ error: 'Falta la lista de etiquetas (ids).' });
        // `crear: true` — se puede etiquetar a un cliente al que todavía no se le
        // ha escrito: se da de alta, se clasifica, y ya se hablará con él. El
        // chat se prepara vacío; NO se le manda nada ni se le notifica.
        const chatId = await waLabels.chatIdDeTelefono(req.params.telefono, { crear: true });
        const puestas = await waLabels.poner(chatId, ids);
        res.json({ ok: true, chat_id: chatId, puestas });
    } catch (e) { errorLabels(res, e); }
});

// ─────────────────────────────────────────────────────────────────────────────
// BOT — el asistente que contesta a los chats etiquetados.
//
// Todo ADMIN: aquí se ve lo que una máquina le ha dicho a clientes reales en
// nombre de BROKERGY, y eso incluye conversaciones privadas suyas.
// ─────────────────────────────────────────────────────────────────────────────
let bot = null;
try {
    bot = require('../services/botWhatsapp');
} catch (err) {
    console.error('[whatsapp route] No se pudo cargar el bot:', err.message);
}

function requireBot(req, res, next) {
    if (!bot) return res.status(503).json({ error: 'Bot de WhatsApp no disponible' });
    next();
}

// GET /api/whatsapp/bot/status → si está activo, qué etiqueta ve y qué lleva hoy
router.get('/bot/status', adminOnly, requireBot, async (req, res) => {
    try {
        res.json(await bot.estado());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/whatsapp/bot/mensajes → el log de conversaciones
router.get('/bot/mensajes', adminOnly, requireBot, async (req, res) => {
    try {
        const supabase = require('../services/supabaseClient');
        const limite = Math.min(Number(req.query.limite) || 50, 200);
        let q = supabase.from('whatsapp_bot_mensajes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limite);
        if (req.query.estado) q = q.eq('estado', String(req.query.estado).toUpperCase());
        if (req.query.chat) q = q.eq('chat_id', req.query.chat);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        res.json({ mensajes: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/whatsapp/bot/refrescar-etiqueta → releer la etiqueta al momento
// (al etiquetar un chat nuevo, para no esperar a que caduque la caché)
router.post('/bot/refrescar-etiqueta', adminOnly, requireBot, async (req, res) => {
    try {
        const c = await bot.refrescarEtiqueta({ force: true });
        res.json({ encontrada: !!c.id, chats: c.chats.size, error: c.error });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/whatsapp/bot/simular → probar la respuesta SIN enviar nada.
//
// Es la forma de ajustar el prompt sin gastar un mensaje real: se le pasa un
// teléfono y un texto, y devuelve exactamente lo que habría contestado, con el
// dossier que ha usado para hacerlo. No toca WhatsApp ni el log.
router.post('/bot/simular', adminOnly, requireBot, async (req, res) => {
    try {
        const { telefono, mensaje } = req.body || {};
        if (!telefono || !mensaje) return res.status(400).json({ error: 'Faltan telefono y mensaje' });
        const botContexto = require('../services/botContexto');
        const botCerebro = require('../services/botCerebro');
        const { redactarDossier } = require('../services/botPrompt');
        const ctx = await botContexto.construirContexto(String(telefono).replace(/\D/g, ''));
        const decision = await botCerebro.pensar(ctx, String(mensaje));
        res.json({ decision, dossier: redactarDossier(ctx) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
