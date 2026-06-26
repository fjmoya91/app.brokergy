const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const supabase = require('../services/supabaseClient');
const emailService = require('../services/emailService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cuenta SMTP autenticada. Es solo de referencia para el UI: la dirección "from"
// que configure el admin debe ser de este mismo dominio para no caer en spam.
const SMTP_ACCOUNT = process.env.SMTP_USER || 'brokergy@brokergy.es';
const smtpDomain = (SMTP_ACCOUNT.split('@')[1] || '').toLowerCase();

// ─── Remitente de emails (nombre visible + dirección) ──────────────────────────
router.get('/email-sender', adminOnly, async (req, res) => {
    try {
        const sender = await emailService.getSender();
        res.json({
            from_name: sender.name,
            from_address: sender.address,
            smtp_account: SMTP_ACCOUNT,
            smtp_domain: smtpDomain,
        });
    } catch (err) {
        console.error('[GET /settings/email-sender]', err);
        res.status(500).json({ error: 'No se pudo leer la configuración de email' });
    }
});

router.patch('/email-sender', adminOnly, async (req, res) => {
    try {
        const { from_name, from_address } = req.body || {};
        const updates = [];

        if (from_name !== undefined) {
            const name = String(from_name || '').trim();
            if (!name) return res.status(400).json({ error: 'El nombre del remitente no puede estar vacío.' });
            if (name.length > 120) return res.status(400).json({ error: 'El nombre del remitente es demasiado largo.' });
            updates.push({ key: 'email_from_name', value: name });
        }
        if (from_address !== undefined) {
            const addr = String(from_address || '').trim().toLowerCase();
            if (!EMAIL_RE.test(addr)) {
                return res.status(400).json({ error: 'La dirección del remitente no es un email válido.' });
            }
            updates.push({ key: 'email_from_address', value: addr });
        }
        if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar.' });

        const nowIso = new Date().toISOString();
        const rows = updates.map(u => ({ ...u, updated_at: nowIso }));
        const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
        if (error) throw new Error(error.message);

        // Refrescar la caché del remitente para que el siguiente email use lo nuevo al instante
        emailService.invalidateSenderCache();
        const sender = await emailService.getSender();

        res.json({
            ok: true,
            from_name: sender.name,
            from_address: sender.address,
            smtp_account: SMTP_ACCOUNT,
            smtp_domain: smtpDomain,
        });
    } catch (err) {
        console.error('[PATCH /settings/email-sender]', err);
        res.status(500).json({ error: err.message || 'No se pudo guardar la configuración de email' });
    }
});

module.exports = router;
