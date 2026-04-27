/**
 * whatsappService.js
 *
 * Servicio singleton para integrar whatsapp-web.js como canal de notificación
 * del CRM. Cola de mensajes PERSISTENTE en Supabase (tabla: whatsapp_queue).
 *
 * Comportamiento clave:
 *  - Si el cliente no está listo al llamar sendText/sendMedia, el mensaje se
 *    guarda en BD con status='PENDING' y se enviará automáticamente cuando el
 *    cliente vuelva a estado READY.
 *  - Un polling cada 60s intenta re-procesar mensajes PENDING aunque no haya
 *    llegado nuevo evento de reconexión.
 *  - Resiliente a reinicios del servidor: los mensajes pendientes sobreviven.
 */

const path = require('path');
const fs = require('fs');
const supabase = require('./supabaseClient');

const SESSION_ROOT = path.join(__dirname, '..', '.wwebjs_auth');

// Configuración por ENV (con defaults conservadores)
const CONFIG = {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    clientId: process.env.WHATSAPP_CLIENT_ID || 'brokergy-main',
    minDelayMs: parseInt(process.env.WWA_MIN_DELAY_MS || '2500', 10),
    maxDelayMs: parseInt(process.env.WWA_MAX_DELAY_MS || '6000', 10),
    ratePerMin: parseInt(process.env.WWA_RATE_PER_MIN || '10', 10),
    typingMs: parseInt(process.env.WWA_TYPING_MS || '1500', 10),
    maxRetries: parseInt(process.env.WWA_MAX_RETRIES || '5', 10),
    pollIntervalMs: 60_000, // cada 60s revisa la cola
};

// Estado interno del cliente WA
let client = null;
let state = 'DISCONNECTED';
let lastQr = null;
let lastQrAt = null;
let meInfo = null;
let lastError = null;

// Rate limit (en memoria, se resetea con el servidor pero es aceptable)
const sentTimestamps = [];

// Flag para evitar ejecuciones paralelas del procesador de cola
let processing = false;

// ─── Utilidades ───────────────────────────────────────────────────────────────

function ensureSessionDir() {
    try {
        if (!fs.existsSync(SESSION_ROOT)) fs.mkdirSync(SESSION_ROOT, { recursive: true });
    } catch (e) {
        console.error('[wwa] No se pudo crear directorio de sesión:', e.message);
    }
}

function randomDelay() {
    const min = Math.min(CONFIG.minDelayMs, CONFIG.maxDelayMs);
    const max = Math.max(CONFIG.minDelayMs, CONFIG.maxDelayMs);
    return Math.floor(min + Math.random() * (max - min));
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function pruneRateWindow() {
    const now = Date.now();
    const cutoff = now - 60_000;
    while (sentTimestamps.length && sentTimestamps[0] < cutoff) sentTimestamps.shift();
}

async function waitForRateSlot() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        pruneRateWindow();
        if (sentTimestamps.length < CONFIG.ratePerMin) return;
        const oldest = sentTimestamps[0];
        const waitMs = Math.max(500, 60_000 - (Date.now() - oldest));
        console.log(`[wwa] rate-limit alcanzado (${CONFIG.ratePerMin}/min). Esperando ${waitMs}ms.`);
        await sleep(waitMs);
    }
}

/**
 * Normaliza un teléfono a formato E.164 sin '+', sin espacios, solo dígitos.
 * '+34 612 34 56 78' → '34612345678'
 */
function normalizePhone(phone) {
    if (!phone) throw new Error('Teléfono vacío');
    let p = String(phone).trim().replace(/[^\d+]/g, '');
    if (p.startsWith('+')) p = p.slice(1);
    if (/^\d{9}$/.test(p)) p = '34' + p;
    console.log(`[wwa-service] Normalizando: ${phone} -> ${p}`);
    if (!/^\d{10,15}$/.test(p)) {
        console.error(`[wwa-service] Formato inválido para: ${p}`);
        throw new Error(`Teléfono no válido: ${phone}`);
    }
    return p;
}

function toChatId(phone) {
    return `${normalizePhone(phone)}@c.us`;
}

function isReady() {
    return state === 'READY' && !!client;
}

function loadWwebModule() {
    try {
        // eslint-disable-next-line global-require
        return require('whatsapp-web.js');
    } catch (err) {
        lastError = `Dependencia no instalada: ${err.message}`;
        return null;
    }
}

// ─── Operaciones con la cola en BD ────────────────────────────────────────────

/**
 * Inserta un mensaje en la cola persistente de Supabase.
 */
async function dbEnqueue(phone, message) {
    const normalized = normalizePhone(phone);
    const { data, error } = await supabase
        .from('whatsapp_queue')
        .insert({ phone: normalized, message, status: 'PENDING' })
        .select()
        .single();
    if (error) throw new Error(`Error guardando en cola BD: ${error.message}`);
    console.log(`[wwa-queue] Encolado mensaje ID ${data.id} para ${normalized}`);
    return data;
}

/**
 * Obtiene los mensajes pendientes de la cola.
 */
async function dbGetPending() {
    const { data, error } = await supabase
        .from('whatsapp_queue')
        .select('*')
        .eq('status', 'PENDING')
        .lt('retries', CONFIG.maxRetries)
        .order('created_at', { ascending: true })
        .limit(20);
    if (error) {
        console.error('[wwa-queue] Error leyendo cola BD:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Marca un mensaje como enviado.
 */
async function dbMarkSent(id) {
    await supabase
        .from('whatsapp_queue')
        .update({ status: 'SENT', sent_at: new Date().toISOString() })
        .eq('id', id);
}

/**
 * Marca un mensaje como fallido e incrementa el contador de reintentos.
 */
async function dbMarkFailed(id, errorMsg, currentRetries) {
    const newRetries = (currentRetries || 0) + 1;
    const newStatus = newRetries >= CONFIG.maxRetries ? 'FAILED' : 'PENDING';
    await supabase
        .from('whatsapp_queue')
        .update({ status: newStatus, error: errorMsg, retries: newRetries })
        .eq('id', id);
}

// ─── Procesador de cola ────────────────────────────────────────────────────────

/**
 * Lee mensajes PENDING de la BD y los envía uno a uno respetando rate-limit.
 */
async function processQueue() {
    if (processing) return;
    if (!isReady()) return; // No hay cliente listo, nada que hacer

    processing = true;
    console.log('[wwa-queue] Iniciando procesamiento de cola...');

    try {
        const pending = await dbGetPending();
        console.log(`[wwa-queue] ${pending.length} mensajes pendientes en cola.`);

        for (const job of pending) {
            if (!isReady()) {
                console.log('[wwa-queue] Cliente desconectado durante procesamiento. Pausando.');
                break;
            }

            try {
                await waitForRateSlot();

                const chatId = toChatId(job.phone);

                // Verificar que el número existe en WhatsApp
                const isRegistered = await client.isRegisteredUser(chatId);
                if (!isRegistered) {
                    throw new Error(`El número ${job.phone} no está registrado en WhatsApp`);
                }

                // Typing indicator (patrón humano)
                try {
                    const chat = await client.getChatById(chatId);
                    await chat.sendStateTyping();
                    await sleep(CONFIG.typingMs);
                } catch (_) { /* no bloqueante */ }

                await client.sendMessage(chatId, job.message);

                sentTimestamps.push(Date.now());
                await dbMarkSent(job.id);
                console.log(`[wwa-queue] ✅ Mensaje ID ${job.id} enviado a ${job.phone}`);

                // Delay humano antes del siguiente
                if (pending.indexOf(job) < pending.length - 1) await sleep(randomDelay());

            } catch (err) {
                console.error(`[wwa-queue] ❌ Error enviando ID ${job.id}:`, err.message);
                await dbMarkFailed(job.id, err.message, job.retries);
            }
        }
    } catch (err) {
        console.error('[wwa-queue] Error fatal procesando cola:', err.message);
    } finally {
        processing = false;
    }
}

// ─── Polling periódico ────────────────────────────────────────────────────────

let pollTimer = null;

function startPolling() {
    if (pollTimer) return; // ya corriendo
    pollTimer = setInterval(async () => {
        if (isReady()) {
            processQueue().catch(e => console.error('[wwa-poll] Error:', e.message));
        }
    }, CONFIG.pollIntervalMs);
    console.log(`[wwa-queue] Polling iniciado cada ${CONFIG.pollIntervalMs / 1000}s.`);
}

// ─── Chrome executable resolution ────────────────────────────────────────────

const LINUX_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--disable-extensions',
    '--disable-background-networking',
];

async function resolveChromium() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        console.log('[wwa] Chrome desde env:', process.env.PUPPETEER_EXECUTABLE_PATH);
        return { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: LINUX_ARGS };
    }

    // Windows: buscar Chrome instalado
    if (process.platform === 'win32') {
        const winPaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        ].filter(Boolean);
        for (const p of winPaths) {
            if (fs.existsSync(p)) {
                console.log('[wwa] Chrome detectado en Windows:', p);
                return { executablePath: p, args: [] };
            }
        }
        console.warn('[wwa] Chrome no encontrado en Windows. Instala Google Chrome.');
        return { executablePath: '', args: [] };
    }

    // Linux: intentar @sparticuz/chromium (entornos containerizados)
    try {
        const sparticuz = require('@sparticuz/chromium');
        const executablePath = await sparticuz.executablePath();
        console.log('[wwa] Chrome via @sparticuz/chromium:', executablePath);
        return { executablePath, args: [...sparticuz.args, ...LINUX_ARGS] };
    } catch (e) {
        console.warn('[wwa] @sparticuz/chromium no disponible:', e.message);
        return { executablePath: '/usr/bin/chromium-browser', args: LINUX_ARGS };
    }
}

// ─── Init & Lifecycle ─────────────────────────────────────────────────────────

async function init() {
    if (!CONFIG.enabled) {
        lastError = 'WHATSAPP_ENABLED=false. Ponlo a true en .env para habilitar.';
        return { ok: false, error: lastError };
    }
    if (client) {
        return { ok: true, state, already: true };
    }

    const wweb = loadWwebModule();
    if (!wweb) return { ok: false, error: lastError };

    ensureSessionDir();

    const { Client, LocalAuth } = wweb;

    state = 'INITIALIZING';
    lastError = null;

    const { executablePath, args: chromiumArgs } = await resolveChromium();
    console.log('[wwa] Lanzando Chrome desde:', executablePath);

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: CONFIG.clientId,
            dataPath: SESSION_ROOT,
        }),
        puppeteer: {
            headless: true,
            executablePath,
            args: [
                ...chromiumArgs,
                '--no-first-run',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-translate',
            ],
        },
    });

    client.on('qr', (qr) => {
        lastQr = qr;
        lastQrAt = Date.now();
        state = 'QR';
        console.log('[wwa] QR recibido. Escanéalo desde WhatsApp Business en el móvil.');
    });

    client.on('authenticated', () => {
        state = 'AUTHENTICATED';
        lastQr = null;
        console.log('[wwa] Autenticado.');
    });

    client.on('auth_failure', (msg) => {
        state = 'AUTH_FAILED';
        lastError = `auth_failure: ${msg}`;
        console.error('[wwa] Fallo de autenticación:', msg);
    });

    client.on('ready', async () => {
        state = 'READY';
        try {
            const info = client.info || {};
            meInfo = {
                id: info.wid?._serialized || null,
                pushname: info.pushname || null,
                number: info.wid?.user || null,
                platform: info.platform || null,
            };
        } catch (_) {
            meInfo = null;
        }
        console.log('[wwa] Cliente listo:', meInfo?.number);

        // Al reconectar, procesamos mensajes pendientes de la BD
        processQueue().catch(e => console.error('[wwa] Error procesando cola tras ready:', e.message));
        startPolling();
    });

    client.on('disconnected', (reason) => {
        console.warn('[wwa] Desconectado:', reason);
        state = 'DISCONNECTED';
        lastError = `disconnected: ${reason}`;
        meInfo = null;
    });

    try {
        client.initialize();
        return { ok: true, state };
    } catch (err) {
        lastError = err.message;
        state = 'DISCONNECTED';
        client = null;
        return { ok: false, error: err.message };
    }
}

async function disconnect() {
    if (!client) return { ok: true, already: true };

    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }

    try {
        await client.logout();
    } catch (e) {
        console.warn('[wwa] logout warning:', e.message);
    }
    try {
        await client.destroy();
    } catch (_) { /* noop */ }
    client = null;
    state = 'DISCONNECTED';
    meInfo = null;
    lastQr = null;
    return { ok: true };
}

// ─── API pública ──────────────────────────────────────────────────────────────

function getStatus() {
    return {
        enabled: CONFIG.enabled,
        state,
        ready: isReady(),
        me: meInfo,
        hasQr: !!lastQr,
        qrAgeMs: lastQrAt ? Date.now() - lastQrAt : null,
        lastError,
        config: {
            clientId: CONFIG.clientId,
            minDelayMs: CONFIG.minDelayMs,
            maxDelayMs: CONFIG.maxDelayMs,
            ratePerMin: CONFIG.ratePerMin,
            typingMs: CONFIG.typingMs,
            maxRetries: CONFIG.maxRetries,
            pollIntervalMs: CONFIG.pollIntervalMs,
        },
    };
}

function getQr() {
    return lastQr;
}

/**
 * Encola un mensaje de texto. Si el cliente no está listo, el mensaje queda
 * guardado en BD y se enviará automáticamente al reconectar.
 */
async function sendText(phone, message) {
    if (!CONFIG.enabled) throw new Error('WhatsApp deshabilitado (WHATSAPP_ENABLED=false)');
    if (!message || !message.trim()) throw new Error('Mensaje vacío');

    // Guardamos siempre en BD (fuente de verdad)
    const queued = await dbEnqueue(phone, message);

    // Intentamos enviar ahora si el cliente está listo
    if (isReady()) {
        processQueue().catch(e => console.error('[wwa] Error en processQueue inmediato:', e.message));
    } else {
        console.log(`[wwa-queue] Cliente no listo (${state}). Mensaje ID ${queued.id} queda en cola hasta reconexión.`);
    }

    return { ok: true, queued: true, id: queued.id, state };
}

function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Timeout en ${label} (${ms / 1000}s)`)), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}

/**
 * Envío de media (PDF, imagen...). Solo funciona con cliente activo.
 * Si no está listo, lanza error (media no se puede persistir fácilmente en BD).
 */
async function sendMedia(phone, media, { caption, asDocument = true } = {}) {
    if (!CONFIG.enabled) throw new Error('WhatsApp deshabilitado (WHATSAPP_ENABLED=false)');
    if (!media || (!media.url && !media.base64)) throw new Error('media requiere url o base64');
    if (!isReady()) throw new Error(`Cliente WhatsApp no listo (estado: ${state}). Conecta WhatsApp primero.`);

    const chatId = toChatId(phone);
    console.log(`[wwa] sendMedia → ${chatId}, archivo: ${media.filename || 'sin nombre'}`);
    await waitForRateSlot();

    try {
        const chat = await withTimeout(client.getChatById(chatId), 10_000, 'getChatById');
        await chat.sendStateTyping();
        await sleep(CONFIG.typingMs);
    } catch (e) {
        console.warn('[wwa] typing indicator fallido (no bloqueante):', e.message);
    }

    const wweb = loadWwebModule();
    const { MessageMedia } = wweb;
    let mediaObj;
    if (media.url) {
        mediaObj = await MessageMedia.fromUrl(media.url, { unsafeMime: true });
    } else {
        mediaObj = new MessageMedia(
            media.mimetype || 'application/pdf',
            media.base64,
            media.filename || 'archivo.pdf'
        );
    }

    console.log(`[wwa] Llamando client.sendMessage a ${chatId}...`);
    let result;
    try {
        result = await withTimeout(
            client.sendMessage(chatId, mediaObj, {
                caption: caption || undefined,
                sendMediaAsDocument: asDocument !== false,
            }),
            60_000,
            'sendMessage'
        );
    } catch (err) {
        // Chrome crash: resetear cliente para que el estado sea correcto en el frontend
        if (/detached Frame|Session closed|Target closed|Protocol error/i.test(err.message)) {
            console.error('[wwa] Chrome crash detectado. Reseteando cliente...');
            client = null;
            state = 'DISCONNECTED';
            meInfo = null;
        }
        throw err;
    }

    sentTimestamps.push(Date.now());
    console.log(`[wwa] ✅ Media enviada a ${chatId}`);
    return {
        ok: true,
        id: result?.id?._serialized || null,
        timestamp: result?.timestamp || null,
    };
}

module.exports = {
    init,
    disconnect,
    getStatus,
    getQr,
    sendText,
    sendMedia,
    normalizePhone,
    _config: CONFIG,
};
