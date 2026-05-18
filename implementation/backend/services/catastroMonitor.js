/**
 * Monitor del estado del Catastro: detecta rate-limit y notifica al admin.
 *
 * Flujo:
 *   1. catastroService llama a recordSuccess() o record403(errorMsg) tras cada petición.
 *   2. Si hay 3+ errores 403 consecutivos (o 1 que contenga "limite de peticiones"),
 *      entra en modo BLOQUEADO:
 *        - Envía alerta al admin (WhatsApp + email) UNA SOLA VEZ por bloqueo
 *        - Las nuevas peticiones devuelven inmediatamente sin contactar al Catastro
 *          (para no quemar más quota y dejar margen a que se desbloquee)
 *   3. En modo BLOQUEADO, cada 5 minutos hace un "ping" de prueba para detectar
 *      cuándo el Catastro vuelve a responder OK.
 *   4. Al volver a OK: sale del modo BLOQUEADO + envía alerta de recuperación.
 *
 * El endpoint público /api/catastro/status devuelve este estado para que el
 * frontend pueda mostrar un banner informativo al cliente.
 */

const axios = require('axios');
const http = require('http');
const whatsappService = require('./whatsappService');
const emailService = require('./emailService');

const COORD_URL = 'http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx';

// Mismos defaults que catastroService: IPv4 forzado + sin gzip. El WAF del
// Catastro rechaza axios con headers default desde IPs de datacenter.
const PING_AGENT = new http.Agent({ keepAlive: false, family: 4 });
const PING_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/xml, text/xml, */*',
    'Accept-Encoding': 'identity'
};
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
// Bajado de 3 → 1 (2026-05-18): el WAF del Catastro contra IPs de datacenter
// es agresivo y prolongado. Tras detectar 1 sólo error de WAF/rate-limit
// conviene cortar tráfico de inmediato para no empeorar el ban.
const CONSECUTIVE_403_THRESHOLD = 1;

let state = {
    blocked: false,
    blockedAt: null,
    blockedMessage: null,
    consecutive403: 0,
    alertSentForCurrentBlock: false,
    totalRequests: 0,
    totalErrors: 0,
    lastSuccessAt: null,
    pingIntervalHandle: null
};

function getStatus() {
    return {
        blocked: state.blocked,
        blockedAt: state.blockedAt,
        blockedMessage: state.blockedMessage,
        consecutive403: state.consecutive403,
        totalRequests: state.totalRequests,
        totalErrors: state.totalErrors,
        lastSuccessAt: state.lastSuccessAt,
        durationMs: state.blocked && state.blockedAt ? (Date.now() - state.blockedAt) : 0
    };
}

function shouldSkipRequest() {
    // Si estamos bloqueados, no enviar peticiones (no quemar más quota).
    // El ping interno sigue funcionando porque no usa esta función.
    return state.blocked;
}

function recordRequest() {
    state.totalRequests++;
}

function recordSuccess() {
    state.lastSuccessAt = Date.now();
    state.consecutive403 = 0;
    if (state.blocked) {
        const wasBlockedFor = Date.now() - (state.blockedAt || Date.now());
        const minutes = Math.round(wasBlockedFor / 60000);
        console.log(`[catastroMonitor] ✅ Catastro DESBLOQUEADO tras ${minutes} min`);
        state.blocked = false;
        state.blockedAt = null;
        state.blockedMessage = null;
        notifyUnblocked(wasBlockedFor);
        stopPingLoop();
    }
}

function record403(errorMessage) {
    state.totalErrors++;
    state.consecutive403++;

    const msg = (errorMessage || '').toLowerCase();
    const explicitRateLimit = msg.includes('limite de peticiones') || msg.includes('peticion denegada');

    const shouldBlock = !state.blocked && (
        explicitRateLimit || state.consecutive403 >= CONSECUTIVE_403_THRESHOLD
    );

    if (shouldBlock) {
        state.blocked = true;
        state.blockedAt = Date.now();
        state.blockedMessage = errorMessage || 'Rate-limit del Catastro detectado';
        console.warn(`[catastroMonitor] ⛔ Catastro BLOQUEADO: ${state.blockedMessage}`);

        // Disparar alerta una sola vez por bloqueo
        if (!state.alertSentForCurrentBlock) {
            state.alertSentForCurrentBlock = true;
            notifyBlocked(state.blockedMessage);
        }

        startPingLoop();
    }
}

function recordOtherError(errorMessage) {
    state.totalErrors++;
    // Otros errores (timeout, red) NO incrementan el contador de 403.
    // El monitor solo cuenta los bloqueos por rate-limit.
}

// ─── Alertas al admin ────────────────────────────────────────────────────
async function notifyBlocked(blockedMessage) {
    const fechaHora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    const subject = '⛔ Catastro rate-limited en app.brokergy.es';
    const bodyText = [
        '⛔ ALERTA: API del Catastro bloqueada por rate-limit',
        '',
        `Hora: ${fechaHora}`,
        `Detalle del Catastro: ${blockedMessage}`,
        '',
        'Mientras dure el bloqueo:',
        '- Las búsquedas catastrales fallarán para los usuarios',
        '- El backend muestra mensaje informativo en lugar de error técnico',
        '- Se hará ping cada 5 min para detectar cuándo vuelve a funcionar',
        '',
        'Acción automática: ninguna. Catastro suele desbloquear en 1-2 horas.',
        '',
        '— BROKERGY Monitor'
    ].join('\n');

    // WhatsApp al admin
    try {
        const adminChat = process.env.WHATSAPP_ADMIN_CHAT;
        if (adminChat && whatsappService.getStatus?.()?.ready) {
            const waMessage = `⛔ *Catastro bloqueado*\n\n${fechaHora}\n\n${blockedMessage}\n\nMonitor pinga cada 5 min, te aviso cuando vuelva.`;
            await whatsappService.sendText({ phone: adminChat, message: waMessage });
            console.log('[catastroMonitor] WhatsApp de aviso enviado');
        }
    } catch (err) {
        console.warn('[catastroMonitor] No se pudo enviar WhatsApp:', err.message);
    }

    // Email al admin
    try {
        const adminEmail = process.env.ADMIN_EMAIL || 'info@brokergy.es';
        if (emailService.sendMail) {
            await emailService.sendMail({
                to: adminEmail,
                subject,
                text: bodyText,
                html: `<pre style="font-family: monospace; white-space: pre-wrap;">${bodyText}</pre>`
            });
            console.log('[catastroMonitor] Email de aviso enviado a', adminEmail);
        }
    } catch (err) {
        console.warn('[catastroMonitor] No se pudo enviar email:', err.message);
    }
}

async function notifyUnblocked(durationMs) {
    const minutes = Math.round(durationMs / 60000);
    const fechaHora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

    try {
        const adminChat = process.env.WHATSAPP_ADMIN_CHAT;
        if (adminChat && whatsappService.getStatus?.()?.ready) {
            await whatsappService.sendText({
                phone: adminChat,
                message: `✅ *Catastro recuperado*\n\n${fechaHora}\nDuración del bloqueo: ${minutes} min\n\nServicio normal restaurado.`
            });
        }
    } catch (err) {
        console.warn('[catastroMonitor] WhatsApp recuperación falló:', err.message);
    }

    try {
        const adminEmail = process.env.ADMIN_EMAIL || 'info@brokergy.es';
        if (emailService.sendMail) {
            await emailService.sendMail({
                to: adminEmail,
                subject: '✅ Catastro recuperado en app.brokergy.es',
                text: `Catastro vuelve a responder OK.\n\nHora: ${fechaHora}\nDuración del bloqueo: ${minutes} min\n\nNo se requiere acción.\n\n— BROKERGY Monitor`
            });
        }
    } catch (err) {
        console.warn('[catastroMonitor] Email recuperación falló:', err.message);
    }

    // Reset flag para próximos bloqueos
    state.alertSentForCurrentBlock = false;
}

// ─── Ping loop mientras estamos bloqueados ───────────────────────────────
function startPingLoop() {
    if (state.pingIntervalHandle) return;
    console.log(`[catastroMonitor] Iniciando ping loop cada ${PING_INTERVAL_MS / 60000} min`);

    state.pingIntervalHandle = setInterval(async () => {
        // Coordenadas seguras: centro de Madrid (Puerta del Sol)
        const url = `${COORD_URL}/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=-3.703&Coordenada_Y=40.4168`;
        try {
            const response = await axios.get(url, {
                httpAgent: PING_AGENT,
                decompress: false,
                headers: PING_HEADERS,
                timeout: 5000
            });
            // Si responde 200 sin "limite de peticiones" → desbloqueado
            const body = String(response.data || '');
            if (!body.toLowerCase().includes('limite de peticiones')) {
                console.log('[catastroMonitor] Ping OK — Catastro responde');
                recordSuccess();
            } else {
                console.log('[catastroMonitor] Ping detectó rate-limit todavía');
            }
        } catch (err) {
            const status = err.response?.status;
            console.log(`[catastroMonitor] Ping fallo (status=${status || 'network'})`);
        }
    }, PING_INTERVAL_MS);
}

function stopPingLoop() {
    if (state.pingIntervalHandle) {
        clearInterval(state.pingIntervalHandle);
        state.pingIntervalHandle = null;
    }
}

module.exports = {
    getStatus,
    shouldSkipRequest,
    recordRequest,
    recordSuccess,
    record403,
    recordOtherError
};
