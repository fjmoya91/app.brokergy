// El VIGILANTE del canal con Fran: deja abierto, siempre, el WhatsApp entre Fran y Claude.
//
//   node scripts/asistente_vigia.js --servidor  en el VPS (contenedor «asistente»): espera el aviso
//                                               del backend en :8091 y repasa cada 2 min de respaldo
//   node scripts/asistente_vigia.js             sin servidor: repasa cada 30 s (pruebas en un PC)
//   node scripts/asistente_vigia.js --una       una sola pasada
//
// Lee el chat del móvil personal de Fran (ASISTENTE_WHATSAPP_TEL, la etiqueta MOIA) por la API del
// backend. El backend (services/asistenteCanal.js) le avisa en cuanto Fran escribe, así que no hay
// que estar mirando el chat a cada rato. Cuando Fran escribe algo nuevo —y lleva unos segundos sin
// escribir, para coger la ráfaga entera— le acusa recibo y lanza Claude Code sin pantalla
// (`claude -p`) en este PC, con las instrucciones de `asistente_instrucciones.md`, los mensajes
// nuevos (las notas de voz transcritas, las fotos y documentos bajados) y lo último del chat.
// Claude hace el trabajo y le contesta él mismo por `asistente_whatsapp.js decir`.
//
// - SOLO atiende al chat 1:1 con ese número, y solo lo que escribe él (no lo que mandamos nosotros).
// - Un trabajo cada vez: lo que llegue mientras tanto se atiende en la siguiente vuelta.
// - Si Claude acaba sin haberle contestado, el vigilante le manda el final de su salida.
// - En el VPS corre en el contenedor «asistente» (docker-compose.yml, implementation/asistente/),
//   con el repo montado: un `git pull` le cambia los scripts y las instrucciones sin reconstruir.
// - Estado y registros en backend/scratch/asistente/ (fuera de git).
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { api, mandar, transcribir, TEL } = require('./asistente_whatsapp');

const RAIZ = path.join(__dirname, '..', '..', '..');
const DIR = path.join(__dirname, '..', 'scratch', 'asistente');
const ESTADO = path.join(DIR, 'vigia.json');
const LOCK = path.join(DIR, 'vigia.lock');
const LOGS = path.join(DIR, 'log');
const INSTRUCCIONES = path.join(__dirname, 'asistente_instrucciones.md');
const SERVIDOR = process.argv.includes('--servidor');
const PUERTO = Number(process.env.ASISTENTE_PUERTO) || 8091;
const CADA_MS = Number(process.env.ASISTENTE_VIGIA_MS) || (SERVIDOR ? 120_000 : 30_000);
const SILENCIO_S = Number(process.env.ASISTENTE_SILENCIO_S) || 20;       // ráfaga: espera a que pare de escribir
const PLAZO_MS = Number(process.env.ASISTENTE_PLAZO_MIN || 45) * 60_000; // tope de un trabajo
const CLAUDE = process.env.ASISTENTE_CLAUDE_CMD || 'claude';

fs.mkdirSync(LOGS, { recursive: true });
const ahora = () => Math.floor(Date.now() / 1000);
const hora = t => new Date(t * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
const log = (...a) => console.log(new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }), ...a);

function leerEstado() {
    try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { return null; }
}
function guardarEstado(e) { fs.writeFileSync(ESTADO, JSON.stringify(e, null, 2)); }

// Una sola instancia: si el lock es de un proceso vivo, se sale.
function cogerLock() {
    try {
        const pid = Number(fs.readFileSync(LOCK, 'utf8'));
        if (pid && pid !== process.pid) { process.kill(pid, 0); return false; }
    } catch { /* sin lock o proceso muerto */ }
    fs.writeFileSync(LOCK, String(process.pid));
    process.on('exit', () => { try { if (Number(fs.readFileSync(LOCK, 'utf8')) === process.pid) fs.unlinkSync(LOCK); } catch { /* */ } });
    return true;
}

async function prepararMensaje(m, carpeta) {
    if (m.tipo === 'chat') return m.texto || '';
    if (/ptt|audio/.test(m.tipo)) return `🎤 (nota de voz) ${await transcribir(m)}`;
    if (['image', 'video', 'document', 'sticker'].includes(m.tipo)) {
        try {
            const f = await api(`/api/whatsapp/conversacion/adjunto?msg=${encodeURIComponent(m.id)}`, { binario: true });
            const ext = ((f.mimetype || '').split(';')[0].split('/')[1] || 'bin').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
            fs.mkdirSync(carpeta, { recursive: true });
            const ruta = path.join(carpeta, `${m.t}_${m.tipo}.${ext}`);
            fs.writeFileSync(ruta, f.buffer);
            return `[${m.tipo} adjunto: ${ruta}]${m.texto ? ` «${m.texto}»` : ''}`;
        } catch (e) {
            return `[${m.tipo} que no se ha podido bajar: ${e.message}]${m.texto ? ` «${m.texto}»` : ''}`;
        }
    }
    return m.texto || `[${m.tipo}]`;
}

function lanzarClaude(prompt, etiqueta) {
    return new Promise(resolve => {
        const salida = path.join(LOGS, `${etiqueta}.log`);
        const out = fs.createWriteStream(salida);
        out.write(`=== PROMPT ===\n${prompt}\n\n=== SALIDA ===\n`);
        const args = ['-p', '--permission-mode', 'bypassPermissions', '--output-format', 'text'];
        const hijo = spawn(CLAUDE, args, { cwd: RAIZ, shell: true, windowsHide: true, env: process.env });
        let texto = '';
        hijo.stdout.on('data', d => { texto += d; out.write(d); });
        hijo.stderr.on('data', d => { texto += d; out.write(d); });
        const plazo = setTimeout(() => { out.write('\n[PLAZO AGOTADO]\n'); hijo.kill(); }, PLAZO_MS);
        hijo.on('close', code => { clearTimeout(plazo); out.end(); resolve({ code, texto, salida }); });
        hijo.on('error', e => { clearTimeout(plazo); out.end(); resolve({ code: -1, texto: e.message, salida }); });
        hijo.stdin.write(prompt);
        hijo.stdin.end();
    });
}

let trabajando = false;
let enVuelta = false;

// Una vuelta cada vez: el aviso, el repaso periódico y el fin de la ráfaga pueden coincidir, y dos
// vueltas a la vez leerían los mismos mensajes nuevos y harían el trabajo dos veces.
async function vuelta() {
    if (enVuelta) return;
    enVuelta = true;
    try { await vueltaUnica(); } finally { enVuelta = false; }
}

async function vueltaUnica() {
    if (trabajando) return;
    const estado = leerEstado() || { visto: ahora(), atendidos: [] };
    if (!leerEstado()) { guardarEstado(estado); log(`Arranca: se atiende lo que llegue desde ${hora(estado.visto)}.`); }

    const conv = await api('/api/whatsapp/conversacion', { method: 'POST', body: { telefono: TEL, dias: 1 }, ms: 60_000 });
    if (conv.grupo) throw new Error('El chat configurado es un grupo: el canal solo atiende el chat 1:1 con Fran.');
    const mensajes = conv.mensajes || [];
    const nuevos = mensajes.filter(m => !m.de_mi && m.t > estado.visto && !estado.atendidos.includes(m.id));
    if (!nuevos.length) return;
    const ultimo = Math.max(...nuevos.map(m => m.t));
    if (ahora() - ultimo < SILENCIO_S) {                // sigue escribiendo: se mira otra vez al callar
        programar((SILENCIO_S - (ahora() - ultimo) + 2) * 1000);
        return;
    }

    trabajando = true;
    const etiqueta = new Date().toISOString().replace(/[:.]/g, '-');
    try {
        log(`${nuevos.length} mensaje(s) nuevo(s) de Fran.`);
        const carpeta = path.join(DIR, 'entrada', etiqueta);
        const lineas = [];
        for (const m of nuevos) {
            // eslint-disable-next-line no-await-in-loop
            lineas.push(`${hora(m.t)}  ${await prepararMensaje(m, carpeta)}`);
        }
        // Se marcan como atendidos ANTES de trabajar: si Claude se cae, no se repite el trabajo en bucle.
        estado.visto = ultimo;
        estado.atendidos = [...estado.atendidos, ...nuevos.map(m => m.id)].slice(-200);
        guardarEstado(estado);

        await mandar('Recibido, me pongo con ello.').catch(e => log('No se pudo acusar recibo:', e.message));
        const contexto = mensajes.filter(m => !nuevos.includes(m)).slice(-20)
            .map(m => `${hora(m.t)}  ${m.de_mi ? 'CLAUDE/EMPRESA' : 'FRAN'}: ${(m.texto || `[${m.tipo}]`).slice(0, 600)}`).join('\n');
        let pendiente = '';
        try { pendiente = fs.readFileSync(path.join(DIR, 'pendiente.json'), 'utf8'); } catch { /* nada pendiente */ }

        const prompt = [
            fs.readFileSync(INSTRUCCIONES, 'utf8'),
            '\n## Lo último del chat (para contexto)\n', contexto || '(nada)',
            pendiente ? `\n## Oportunidad esperando respuesta de Fran (scratch/asistente/pendiente.json)\n${pendiente}` : '',
            '\n## LO QUE FRAN TE ACABA DE ESCRIBIR\n', lineas.join('\n'),
            '\nHazlo y contéstale por WhatsApp con `asistente_whatsapp.js decir … --enviar`.',
        ].join('\n');

        const inicio = ahora();
        const r = await lanzarClaude(prompt, etiqueta);
        log(`Claude terminó (código ${r.code}). Registro: ${r.salida}`);

        // ¿Le ha contestado? Si no, el vigilante le manda el final de la salida.
        const despues = await api('/api/whatsapp/conversacion', { method: 'POST', body: { telefono: TEL, dias: 1 }, ms: 60_000 });
        const contesto = (despues.mensajes || []).some(m => m.de_mi && m.t > inicio + 1);
        if (!contesto) {
            const cola = String(r.texto || '').trim().slice(-1200);
            await mandar(r.code === 0 && cola
                ? cola
                : `⚠️ No he podido terminarlo (código ${r.code}).${cola ? `\n\n${cola.slice(-600)}` : ''}`);
        }
    } finally {
        trabajando = false;
        programar(3000);                                  // por si llegó algo mientras trabajaba
    }
}

// Una vuelta pedida para dentro de `ms` (el aviso del backend, o esperar a que acabe la ráfaga).
let temporizador = null;
function programar(ms) {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => { temporizador = null; vuelta().catch(e => log('Vuelta fallida:', e.message)); }, ms);
}

function servidor() {
    http.createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/estado') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, trabajando, estado: leerEstado() }));
            return;
        }
        if (req.method === 'POST' && req.url === '/aviso') {
            if (req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) { res.writeHead(403); res.end(); return; }
            log('Aviso del backend: Fran ha escrito.');
            programar((SILENCIO_S + 2) * 1000);
            res.writeHead(202); res.end();
            return;
        }
        res.writeHead(404); res.end();
    }).listen(PUERTO, () => log(`Esperando avisos en :${PUERTO}.`));
}

(async () => {
    if (!TEL) { log('Falta ASISTENTE_WHATSAPP_TEL en el .env: el canal no arranca.'); return; }
    if (!cogerLock()) { log('Ya hay un vigilante corriendo.'); return; }
    log(`Vigilando el chat de ${TEL} cada ${CADA_MS / 1000} s${SERVIDOR ? ' y con el aviso del backend' : ''}.`);
    if (SERVIDOR) servidor();
    const una = process.argv.includes('--una');
    for (;;) {
        try { await vuelta(); } catch (e) { log('Vuelta fallida:', e.message); }
        if (una) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, CADA_MS));
    }
})();
