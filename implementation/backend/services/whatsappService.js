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

// Versión de whatsapp-web.js usada para crear la sesión actual.
// Si cambia entre arranques, la sesión vieja se borra automáticamente
// porque versiones nuevas suelen incluir un "WhatsApp Web Version" pinned
// distinto e incompatible con la sesión guardada en Chrome.
const WWEB_VERSION = (() => {
    try { return require('whatsapp-web.js/package.json').version; }
    catch (_) { return 'unknown'; }
})();

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
let initTimeoutHandle = null; // timeout para evitar INITIALIZING infinito

// Timestamp del arranque del módulo: sirve para detectar fácilmente si el
// backend está ejecutando código stale (no reiniciado tras un edit).
const SERVICE_START_TIME = new Date().toISOString();

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

/**
 * Resuelve cualquier destino (teléfono o chatId de grupo) a un chatId WhatsApp.
 * - Si ya contiene '@', se devuelve tal cual (ej: "120363XXXX@g.us" o "34612345@c.us")
 * - Si no, se trata como número de teléfono → "34612345678@c.us"
 */
function resolveTarget(target) {
    if (!target) throw new Error('Destino vacío');
    const t = String(target).trim();
    if (t.includes('@')) return t; // ya es un chatId completo
    return toChatId(t);
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
    // Si el destino ya es un chatId (contiene '@'), almacenar tal cual; si no, normalizar como teléfono
    const stored = String(phone).trim().includes('@') ? phone : normalizePhone(phone);
    const { data, error } = await supabase
        .from('whatsapp_queue')
        .insert({ phone: stored, message, status: 'PENDING' })
        .select()
        .single();
    if (error) throw new Error(`Error guardando en cola BD: ${error.message}`);
    console.log(`[wwa-queue] Encolado mensaje ID ${data.id} para ${stored}`);
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

                const chatId = resolveTarget(job.phone);
                const isGroup = chatId.endsWith('@g.us');

                // Verificar que el número existe en WhatsApp (omitir para grupos)
                if (!isGroup) {
                    const isRegistered = await client.isRegisteredUser(chatId);
                    if (!isRegistered) {
                        throw new Error(`El número ${job.phone} no está registrado en WhatsApp`);
                    }
                }

                // Typing indicator (patrón humano, omitir para grupos)
                if (!isGroup) {
                    try {
                        const chat = await client.getChatById(chatId);
                        await chat.sendStateTyping();
                        await sleep(CONFIG.typingMs);
                    } catch (_) { /* no bloqueante */ }
                }

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
    // 1. Override explícito por env (recomendado en VPS)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        const p = process.env.PUPPETEER_EXECUTABLE_PATH;
        if (!fs.existsSync(p)) {
            throw new Error(`PUPPETEER_EXECUTABLE_PATH apunta a ${p} pero no existe.`);
        }
        console.log('[wwa] Chrome desde env:', p);
        return { executablePath: p, args: process.platform === 'win32' ? [] : LINUX_ARGS };
    }

    // 2. Windows: buscar Chrome instalado
    if (process.platform === 'win32') {
        const winPaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA && (process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ].filter(Boolean);
        for (const p of winPaths) {
            if (fs.existsSync(p)) {
                console.log('[wwa] Chrome detectado en Windows:', p);
                return { executablePath: p, args: [] };
            }
        }
        throw new Error('Chrome no encontrado en Windows. Instala Google Chrome o define PUPPETEER_EXECUTABLE_PATH.');
    }

    // 3. Linux: probar paths comunes de VPS antes de @sparticuz/chromium
    //    @sparticuz/chromium está pensado para AWS Lambda — pesa cada init
    //    porque descomprime el binario; un Chromium nativo del VPS es más rápido.
    const linuxPaths = [
        '/usr/bin/chromium-browser',     // Debian/Ubuntu
        '/usr/bin/chromium',             // Arch, algunas distros
        '/usr/bin/google-chrome-stable', // Google Chrome
        '/usr/bin/google-chrome',
        '/snap/bin/chromium',            // snap
    ];
    for (const p of linuxPaths) {
        if (fs.existsSync(p)) {
            console.log('[wwa] Chromium detectado en Linux:', p);
            return { executablePath: p, args: LINUX_ARGS };
        }
    }

    // 4. Fallback: @sparticuz/chromium (binary bundleado, p. ej. para Lambda)
    try {
        const sparticuz = require('@sparticuz/chromium');
        const executablePath = await sparticuz.executablePath();
        if (!fs.existsSync(executablePath)) {
            throw new Error(`@sparticuz/chromium no extrajo binario en ${executablePath}`);
        }
        console.log('[wwa] Chrome via @sparticuz/chromium:', executablePath);
        return { executablePath, args: [...sparticuz.args, ...LINUX_ARGS] };
    } catch (e) {
        throw new Error(`No se encontró Chromium. Instala con: apt-get install -y chromium-browser. Detalle: ${e.message}`);
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

    const sessionDir = path.join(SESSION_ROOT, `session-${CONFIG.clientId}`);
    const versionStampPath = path.join(SESSION_ROOT, `.wweb-version-${CONFIG.clientId}`);

    // Auto-recuperación: si la versión de whatsapp-web.js que creó la sesión
    // es distinta a la actual, borramos sesión y caché para forzar QR fresco.
    // Esto evita el "stuck en INITIALIZING" tras actualizar la librería.
    let storedVersion = null;
    try { storedVersion = fs.readFileSync(versionStampPath, 'utf8').trim(); } catch (_) {}

    if (fs.existsSync(sessionDir) && storedVersion && storedVersion !== WWEB_VERSION) {
        console.warn(`[wwa] Versión de lib cambió (${storedVersion} → ${WWEB_VERSION}). Borrando sesión incompatible.`);
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) { console.error('[wwa] No se pudo borrar sesión vieja:', e.message); }
        const cacheDir = path.join(__dirname, '..', '.wwebjs_cache');
        try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch (_) {}
    }

    // Guardar la versión actual para el próximo arranque (también si es la primera vez)
    try {
        if (!fs.existsSync(SESSION_ROOT)) fs.mkdirSync(SESSION_ROOT, { recursive: true });
        fs.writeFileSync(versionStampPath, WWEB_VERSION, 'utf8');
    } catch (e) { console.warn('[wwa] No se pudo escribir version stamp:', e.message); }

    // Eliminar locks de Chrome — usar unlinkSync directo porque existsSync devuelve
    // false en symlinks rotos (SingletonLock es un symlink al contenedor anterior)
    ['SingletonLock', 'SingletonCookie', 'SingletonSocket'].forEach(f => {
        try {
            fs.unlinkSync(path.join(sessionDir, f));
            console.log(`[wwa] Lock eliminado: ${f}`);
        } catch (e) {
            if (e.code !== 'ENOENT') console.warn(`[wwa] No se pudo eliminar ${f}:`, e.message);
        }
    });

    const { Client, LocalAuth } = wweb;

    state = 'INITIALIZING';
    lastError = null;

    // Timeout de seguridad: si tras 90s no hay ningún evento (qr/ready/auth_failure),
    // probablemente Chrome cargó una sesión corrupta o se bloqueó sin disparar eventos.
    // Reseteamos a DISCONNECTED para que el panel muestre el botón "Conectar" de nuevo.
    if (initTimeoutHandle) clearTimeout(initTimeoutHandle);
    initTimeoutHandle = setTimeout(() => {
        if (state === 'INITIALIZING') {
            console.error('[wwa] Timeout de inicialización (90s). Sesión posiblemente corrupta. Usa "Cerrar sesión" y reconecta.');
            lastError = 'Timeout (90s): sesión expirada o Chrome bloqueado. Haz "Cerrar sesión" y reconecta.';
            try { if (client) client.destroy().catch(() => {}); } catch (_) {}
            client = null;
            state = 'DISCONNECTED';
            initTimeoutHandle = null;
        }
    }, 90_000);

    const clearInitTimeout = () => {
        if (initTimeoutHandle) {
            clearTimeout(initTimeoutHandle);
            initTimeoutHandle = null;
        }
    };

    let executablePath, chromiumArgs;
    try {
        const resolved = await resolveChromium();
        executablePath = resolved.executablePath;
        chromiumArgs = resolved.args;
    } catch (err) {
        clearInitTimeout();
        console.error('[wwa] Error resolviendo Chrome:', err.message);
        lastError = err.message;
        state = 'DISCONNECTED';
        return { ok: false, error: err.message };
    }
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
        clearInitTimeout();
        lastQr = qr;
        lastQrAt = Date.now();
        state = 'QR';
        console.log('[wwa] QR recibido. Escanéalo desde WhatsApp Business en el móvil.');
    });

    client.on('authenticated', () => {
        clearInitTimeout();
        state = 'AUTHENTICATED';
        lastQr = null;
        console.log('[wwa] Autenticado.');
    });

    client.on('auth_failure', (msg) => {
        clearInitTimeout();
        state = 'AUTH_FAILED';
        lastError = `auth_failure: ${msg}`;
        console.error('[wwa] Fallo de autenticación:', msg);
    });

    client.on('ready', async () => {
        clearInitTimeout();
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
        clearInitTimeout();
        console.warn('[wwa] Desconectado:', reason);
        state = 'DISCONNECTED';
        lastError = `disconnected: ${reason}`;
        meInfo = null;
    });

    try {
        // initialize() es async fire-and-forget; capturamos su rechazo
        // para que el estado no quede pillado en INITIALIZING si Chrome falla.
        client.initialize().catch(err => {
            clearInitTimeout();
            console.error('[wwa] Error lanzando Chrome:', err.message);
            lastError = err.message;
            state = 'DISCONNECTED';
            client = null;
        });
        return { ok: true, state };
    } catch (err) {
        clearInitTimeout();
        lastError = err.message;
        state = 'DISCONNECTED';
        client = null;
        return { ok: false, error: err.message };
    }
}

/**
 * Detiene Chrome SIN cerrar sesión. La sesión persiste en el volumen Docker
 * y se restaura automáticamente en el próximo arranque (sin escanear QR).
 * Usar para paradas temporales o cuando el servicio debe reiniciarse.
 */
async function disconnect() {
    if (!client) {
        // Cliente ya destruido pero puede haber timeout pendiente
        if (initTimeoutHandle) { clearTimeout(initTimeoutHandle); initTimeoutHandle = null; }
        state = 'DISCONNECTED';
        return { ok: true, already: true };
    }

    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (initTimeoutHandle) { clearTimeout(initTimeoutHandle); initTimeoutHandle = null; }

    // Timeout: si destroy() se cuelga (Chrome bloqueado), abortamos en 8s
    try {
        await Promise.race([
            client.destroy(),
            new Promise(r => setTimeout(r, 8000)),
        ]);
    } catch (_) { /* noop */ }
    client = null;
    state = 'DISCONNECTED';
    meInfo = null;
    lastQr = null;
    return { ok: true };
}

/**
 * Cierra la sesión completamente y borra los datos locales.
 * La próxima vez que se conecte habrá que escanear el QR de nuevo.
 * Usar solo cuando se quiere cambiar de número o desvincular el dispositivo.
 */
async function logout() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (initTimeoutHandle) { clearTimeout(initTimeoutHandle); initTimeoutHandle = null; }

    if (client) {
        // Timeout en logout/destroy para evitar colgarse si Chrome está bloqueado
        try {
            await Promise.race([
                client.logout(),
                new Promise(r => setTimeout(r, 8000)),
            ]);
        } catch (e) {
            console.warn('[wwa] logout warning:', e.message);
        }
        try {
            await Promise.race([
                client.destroy(),
                new Promise(r => setTimeout(r, 8000)),
            ]);
        } catch (_) { /* noop */ }
        client = null;
    }

    // Borrar sesión del disco SIEMPRE en logout (independientemente de si el
    // cliente respondió). Garantiza que próxima conexión empiece limpia.
    const sessionDir = path.join(SESSION_ROOT, `session-${CONFIG.clientId}`);
    try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log('[wwa] Sesión borrada del volumen.');
    } catch (e) {
        console.warn('[wwa] No se pudo borrar sesión del volumen:', e.message);
    }

    state = 'DISCONNECTED';
    meInfo = null;
    lastQr = null;
    return { ok: true };
}

// ─── API pública ──────────────────────────────────────────────────────────────

function getStatus() {
    pruneRateWindow();
    return {
        enabled: CONFIG.enabled,
        state,
        ready: isReady(),
        me: meInfo,
        hasQr: !!lastQr,
        qrAgeMs: lastQrAt ? Date.now() - lastQrAt : null,
        lastError,
        sentInWindow: sentTimestamps.length,
        serviceStartTime: SERVICE_START_TIME,
        wwebVersion: WWEB_VERSION,
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

    const chatId = resolveTarget(phone);
    const isGroup = chatId.endsWith('@g.us');
    console.log(`[wwa] sendMedia → ${chatId}, archivo: ${media.filename || 'sin nombre'}`);
    await waitForRateSlot();

    if (!isGroup) {
        try {
            const chat = await withTimeout(client.getChatById(chatId), 10_000, 'getChatById');
            await chat.sendStateTyping();
            await sleep(CONFIG.typingMs);
        } catch (e) {
            console.warn('[wwa] typing indicator fallido (no bloqueante):', e.message);
        }
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

/**
 * Devuelve los grupos de WhatsApp en los que está el teléfono conectado.
 * Útil para que el admin obtenga el chatId de su grupo de notificaciones.
 */
async function getGroups() {
    if (!isReady()) throw new Error('Cliente WhatsApp no listo');
    const chats = await client.getChats();
    return chats
        .filter(c => c.isGroup)
        .map(c => ({
            id: c.id._serialized,
            name: c.name,
            participants: c.participants?.length || 0,
        }));
}

module.exports = {
    init,
    disconnect,
    logout,
    getStatus,
    getQr,
    sendText,
    sendMedia,
    getGroups,
    normalizePhone,
    _config: CONFIG,
};

// ─── Graceful shutdown ─────────────────────────────────────────────────────────
// Al recibir SIGTERM (docker stop, deploy), destruimos Chrome SIN hacer logout.
// Esto da tiempo a Chrome para flushear su IndexedDB y la sesión sobrevive al
// siguiente arranque. stop_grace_period: 30s en docker-compose da el margen necesario.
['SIGTERM', 'SIGINT'].forEach(sig => {
    process.once(sig, async () => {
        console.log(`[wwa] ${sig} — cerrando Chrome sin logout (sesión preservada)...`);
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (client) {
            try {
                await Promise.race([
                    client.destroy(),
                    new Promise(r => setTimeout(r, 8000)), // timeout de seguridad 8s
                ]);
            } catch (_) { /* noop */ }
            client = null;
        }
        process.exit(0);
    });
});

// Auto-inicializar si hay sesión previa guardada en el volumen.
// Permite que WhatsApp se reconecte solo tras cada deploy sin intervención manual.
if (CONFIG.enabled) {
    const sessionDir = path.join(SESSION_ROOT, `session-${CONFIG.clientId}`);
    if (fs.existsSync(sessionDir)) {
        console.log('[wwa] Sesión previa detectada — auto-reconectando en 5s...');
        setTimeout(() => {
            init().catch(e => console.error('[wwa] Error en auto-init:', e.message));
        }, 5000);
    } else {
        console.log('[wwa] Sin sesión previa. Conéctate desde el panel admin para iniciar.');
    }
}
