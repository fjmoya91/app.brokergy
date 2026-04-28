const express = require('express');
const router = express.Router();
const { adminOnly, requireAuth } = require('../middleware/auth');

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

module.exports = router;
