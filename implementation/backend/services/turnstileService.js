/**
 * Validación de tokens Cloudflare Turnstile contra el endpoint oficial
 * `challenges.cloudflare.com/turnstile/v0/siteverify`.
 *
 * Modo de operación controlado por TURNSTILE_ENABLED:
 *   - 'true'  → Validación real contra Cloudflare. Requiere TURNSTILE_SECRET_KEY.
 *   - cualquier otro valor (incluso undefined) → Validación deshabilitada,
 *     devuelve { ok: true, skipped: true }. Útil para desarrollo local y
 *     para arrancar la landing sin keys configuradas todavía.
 *
 * Política frente a fallos de la API de Cloudflare: FAIL-CLOSED.
 * Si Cloudflare no responde (timeout, error de red), consideramos el token
 * inválido. Es más conservador que abrir la puerta a bots en caso de incidente.
 *
 * Docs Cloudflare:
 *   https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const axios = require('axios');

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const REQUEST_TIMEOUT_MS = 5000;

function isEnabled() {
    return String(process.env.TURNSTILE_ENABLED || '').toLowerCase() === 'true';
}

/**
 * Verifica un token Turnstile recibido del frontend.
 *
 * @param {string} token        Token devuelto por el widget Turnstile.
 * @param {string} [remoteIp]   IP del cliente (opcional, mejora detección).
 * @returns {Promise<{ ok: boolean, skipped?: boolean, errorCodes?: string[], hostname?: string }>}
 */
async function verifyTurnstileToken(token, remoteIp) {
    if (!isEnabled()) {
        return { ok: true, skipped: true };
    }

    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
        console.error('[Turnstile] TURNSTILE_ENABLED=true pero falta TURNSTILE_SECRET_KEY. Bloqueando request por seguridad.');
        return { ok: false, errorCodes: ['missing-secret'] };
    }

    if (!token || typeof token !== 'string') {
        return { ok: false, errorCodes: ['missing-input-response'] };
    }

    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (remoteIp) params.append('remoteip', remoteIp);

    try {
        const response = await axios.post(SITEVERIFY_URL, params, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const data = response.data || {};
        if (data.success === true) {
            return { ok: true, hostname: data.hostname };
        }
        return { ok: false, errorCodes: data['error-codes'] || ['unknown'] };
    } catch (err) {
        // Fail-closed ante errores de red o timeout.
        console.error('[Turnstile] Fallo al contactar siteverify:', err.message);
        return { ok: false, errorCodes: ['network-error'] };
    }
}

module.exports = {
    isEnabled,
    verifyTurnstileToken
};
