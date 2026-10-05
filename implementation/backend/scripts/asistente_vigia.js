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
// (`claude -p`), con las instrucciones de `asistente_instrucciones.md`, los mensajes nuevos (las
// notas de voz transcritas, las fotos y documentos bajados) y lo último del chat.
// Claude hace el trabajo y le contesta él mismo por `asistente_whatsapp.js decir`.
//
// - SOLO atiende al chat 1:1 con ese número, y solo lo que escribe él (no lo que mandamos nosotros).
// - Un trabajo cada vez: lo que llegue mientras tanto se atiende en la siguiente vuelta.
// - Si Claude acaba sin haberle contestado, el vigilante le manda el final de su salida.
// - Órdenes sin Claude: «consumo» (lo gastado en 7 días).
// - MODO PROACTIVO (asistente_proactivo.js): el backend avisa también de los mensajes de los demás
//   chats (/entrante); si un instalador manda una petición y nadie le contesta, se le pregunta a Fran.
// - En el VPS corre en el contenedor «asistente» (docker-compose.yml, implementation/asistente/),
//   con el repo montado: un `git pull` le cambia los scripts y las instrucciones sin reconstruir.
// - Estado, registros y consumo en backend/scratch/asistente/ (fuera de git).
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { api, mandar, transcribir, TEL } = require('./asistente_whatsapp');
const proactivo = require('./asistente_proactivo');

const RAIZ = path.join(__dirname, '..', '..', '..');
const DIR = path.join(__dirname, '..', 'scratch', 'asistente');
const ESTADO = path.join(DIR, 'vigia.json');
const LOCK = path.join(DIR, 'vigia.lock');
const LOGS = path.join(DIR, 'log');
const CONSUMO = path.join(DIR, 'consumo.jsonl');
const INSTRUCCIONES = path.join(__dirname, 'asistente_instrucciones.md');
const SERVIDOR = process.argv.includes('--servidor');
const PUERTO = Number(process.env.ASISTENTE_PUERTO) || 8091;
const CADA_MS = Number(process.env.ASISTENTE_VIGIA_MS) || (SERVIDOR ? 120_000 : 30_000);
const SILENCIO_S = Number(process.env.ASISTENTE_SILENCIO_S) || 20;       // ráfaga: espera a que pare de escribir
const PLAZO_MS = Number(process.env.ASISTENTE_PLAZO_MIN || 45) * 60_000; // tope de un trabajo
const CLAUDE = process.env.ASISTENTE_CLAUDE_CMD || 'claude';
// Claude trabaja desde una carpeta FUERA del repo y con acceso a él (--add-dir). Desde dentro carga
// entero el CLAUDE.md de la raíz (1,1 MB ≈ 490.000 tokens) en CADA trabajo: medido el 05/10/2026, un
// «contesta ok» costaba 514.000 tokens desde el repo y 31.000 desde fuera.
const TRABAJO = process.env.ASISTENTE_CWD || path.join(os.tmpdir(), 'asistente-trabajo');
// El modelo: por defecto Sonnet; los CEE, con Opus (ASISTENTE_MODELO_CEE). Fran puede forzar otro
// escribiendo «con opus» / «con sonnet» / «con haiku», y eso manda sobre todo lo demás.
const MODELO = process.env.ASISTENTE_MODELO || 'sonnet';
const MODELO_CEE = process.env.ASISTENTE_MODELO_CEE || 'opus';
const ES_CEE = /\bCEE\b|\.cex\b|\bce3x\b|envolvente|certificado (de )?eficiencia|certificaci[oó]n energ/i;

// ─── Topes: que un fallo no se coma la cuota de Claude ni el VPS ───
// Trabajos por día natural (Madrid): por encima, se le dice a Fran y no se lanza nada.
const MAX_DIA = Number(process.env.ASISTENTE_MAX_TRABAJOS_DIA) || 40;
// Gasto por trabajo, en $ equivalentes de API (`--max-budget-usd`): corta un trabajo desbocado. Con la
// suscripción no se cobra, pero es lo que mide lo que se come de los límites de uso.
const TOPE_USD = Number(process.env.ASISTENTE_TOPE_USD) || 8;
const TOPE_USD_CEE = Number(process.env.ASISTENTE_TOPE_USD_CEE) || 40;

// ─── El CUADERNO: la memoria de trabajo entre mensajes ───
// No se reabre la sesión anterior (`--resume`): recargaría todo su contexto —cientos de miles de
// tokens tras un CEE— para contestar a un «vale». El cuaderno es corto, lo reescribe Claude al
// terminar cada trabajo y entra en el siguiente. Sus recordatorios y su «Pendiente» los manda el
// vigilante SIN Claude (coste cero).
const CUADERNO = path.join(DIR, 'cuaderno.md');
const CUADERNO_MAX = 8000;
const PLANTILLA_CUADERNO = `# Cuaderno del asistente

## Pendiente
<!-- lo que espera algo (de Fran, de un instalador, de un cliente): «- 05/10 OP271: esperando a Fran (envíala / la reviso)» -->

## Recordatorios
<!-- «- [AAAA-MM-DD HH:MM] texto» (hora de Madrid): el vigilante se lo manda a Fran a esa hora y borra la línea -->

## Hecho reciente
<!-- las últimas 10 cosas, una línea cada una; lo más viejo se borra -->
`;

fs.mkdirSync(LOGS, { recursive: true });
if (!fs.existsSync(CUADERNO)) fs.writeFileSync(CUADERNO, PLANTILLA_CUADERNO);
const ahora = () => Math.floor(Date.now() / 1000);
const hora = t => new Date(t * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
const log = (...a) => console.log(new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }), ...a);
const mil = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function modeloPara(texto) {
    if (/\bopus\b/i.test(texto)) return 'opus';
    if (/\bhaiku\b/i.test(texto)) return 'haiku';
    if (/\bsonnet\b/i.test(texto)) return 'sonnet';
    if (ES_CEE.test(texto)) return MODELO_CEE;
    return MODELO;
}

// Las skills del repo, REGISTRADAS como skills del Claude del servidor ($CLAUDE_CONFIG_DIR/skills):
// así las carga con su herramienta Skill igual que en el PC, no como un fichero suelto. Cada skill es
// una carpeta de enlaces a la del repo (que va montado: un `git pull` las actualiza) más `comun`
// → skills/_comun, que es lo que el empaquetador mete dentro y las skills citan como comun/….
// Se rehace antes de cada trabajo: una skill nueva no exige reiniciar el contenedor.
function registrarSkills() {
    const destino = process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, 'skills') : null;
    const origen = path.join(RAIZ, 'skills');
    if (!destino || process.platform === 'win32' || !fs.existsSync(origen)) return;
    try {
        fs.rmSync(destino, { recursive: true, force: true });
        fs.mkdirSync(destino, { recursive: true });
        for (const nombre of fs.readdirSync(origen)) {
            const dir = path.join(origen, nombre);
            if (nombre.startsWith('_') || nombre.startsWith('.') || nombre === 'dist') continue;
            if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue;
            const d = path.join(destino, nombre);
            fs.mkdirSync(d);
            for (const f of fs.readdirSync(dir)) fs.symlinkSync(path.join(dir, f), path.join(d, f));
            if (!fs.existsSync(path.join(d, 'comun'))) fs.symlinkSync(path.join(origen, '_comun'), path.join(d, 'comun'));
        }
    } catch (e) { log('No se pudieron registrar las skills:', e.message); }
}

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
    if (/ptt|audio/.test(m.tipo)) return `(nota de voz) ${await transcribir(m)}`;
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

function lanzarClaude(prompt, etiqueta, modelo, tope) {
    return new Promise(resolve => {
        const salida = path.join(LOGS, `${etiqueta}.log`);
        const out = fs.createWriteStream(salida);
        out.write(`=== MODELO: ${modelo} ===\n=== PROMPT ===\n${prompt}\n\n=== SALIDA ===\n`);
        fs.mkdirSync(TRABAJO, { recursive: true });
        // --no-session-persistence: sin historiales de sesión en disco (los registros ya son nuestros, y
        // cada trabajo de un CEE dejaba megas). --max-budget-usd: el tope de gasto del trabajo.
        // --fallback-model: si Opus está saturado, sigue con Sonnet en vez de fallar.
        const args = ['-p', '--permission-mode', 'bypassPermissions', '--output-format', 'json',
            '--model', modelo, '--add-dir', `"${RAIZ}"`, '--no-session-persistence',
            '--max-budget-usd', String(tope), ...(modelo === 'opus' ? ['--fallback-model', 'sonnet'] : [])];
        const inicio = Date.now();
        const hijo = spawn(CLAUDE, args, { cwd: TRABAJO, shell: true, windowsHide: true, env: process.env });
        let json = '';
        let error = '';
        hijo.stdout.on('data', d => { json += d; });
        hijo.stderr.on('data', d => { error += d; out.write(d); });
        const plazo = setTimeout(() => { out.write('\n[PLAZO AGOTADO]\n'); hijo.kill(); }, PLAZO_MS);
        let hecho = false;
        const fin = (code) => {
            if (hecho) return;
            hecho = true;
            clearTimeout(plazo);
            let r = null;
            try { r = JSON.parse(json); } catch { /* sin JSON: se cayó antes de acabar */ }
            const texto = r?.result ?? (json || error);
            out.write(`${texto}\n`);
            if (r) {
                const uso = Object.entries(r.modelUsage || {}).map(([m, u]) => ({
                    modelo: m,
                    entrada: (u.inputTokens || 0) + (u.cacheCreationInputTokens || 0) + (u.cacheReadInputTokens || 0),
                    salida: u.outputTokens || 0,
                    coste_usd: u.costUSD || 0,
                }));
                const fila = {
                    fecha: new Date().toISOString(), etiqueta, modelo, segundos: Math.round((Date.now() - inicio) / 1000),
                    turnos: r.num_turns, coste_usd: r.total_cost_usd, uso, ok: !r.is_error,
                };
                out.write(`\n=== CONSUMO ===\n${JSON.stringify(fila)}\n`);
                try { fs.appendFileSync(CONSUMO, `${JSON.stringify(fila)}\n`); } catch { /* no impide nada */ }
            }
            out.end();
            resolve({ code, texto, salida });
        };
        hijo.on('close', fin);
        hijo.on('error', e => { error += e.message; fin(-1); });
        hijo.stdin.write(prompt);
        hijo.stdin.end();
    });
}

// «consumo»: lo que han gastado los trabajos de los últimos 7 días, sin lanzar a Claude.
function textoConsumo() {
    let filas = [];
    try { filas = fs.readFileSync(CONSUMO, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { /* aún nada */ }
    const desde = Date.now() - 7 * 24 * 3600_000;
    filas = filas.filter(f => Date.parse(f.fecha) >= desde);
    if (!filas.length) return 'En los últimos 7 días no he hecho ningún trabajo con Claude.';
    const porModelo = {};
    for (const f of filas) {
        for (const u of f.uso || []) {
            const m = (porModelo[u.modelo] ||= { entrada: 0, salida: 0 });
            m.entrada += u.entrada;
            m.salida += u.salida;
        }
    }
    const total = filas.reduce((a, f) => a + (f.coste_usd || 0), 0);
    const minutos = filas.reduce((a, f) => a + (f.segundos || 0), 0) / 60;
    return [
        `*Consumo de los últimos 7 días*: ${filas.length} trabajos, ${mil(minutos)} min.`,
        ...Object.entries(porModelo).map(([m, u]) => `• ${m}: ${mil(u.entrada)} tokens de entrada, ${mil(u.salida)} de salida`),
        `Equivale a ${total.toFixed(2).replace('.', ',')} $ a precio de API. Con tu plan no se cobra aparte: cuenta para tus límites de uso.`,
        `Por defecto uso ${MODELO}; escribe «con opus» o «con haiku» en tu mensaje para cambiarlo.`,
    ].join('\n');
}

// ─── Fechas de Madrid ───
function partesMadrid(d = new Date()) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map(x => [x.type, x.value]));
}
const hoyMadrid = () => { const p = partesMadrid(); return `${p.year}-${p.month}-${p.day}`; };
const ahoraMadrid = () => { const p = partesMadrid(); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };

function trabajosDeHoy() {
    try {
        const hoy = hoyMadrid();
        return fs.readFileSync(CONSUMO, 'utf8').trim().split('\n').filter(Boolean)
            .filter(l => { const p = partesMadrid(new Date(JSON.parse(l).fecha)); return `${p.year}-${p.month}-${p.day}` === hoy; }).length;
    } catch { return 0; }
}

function leerCuaderno() {
    try { return fs.readFileSync(CUADERNO, 'utf8'); } catch { return PLANTILLA_CUADERNO; }
}
// Las líneas de una sección del cuaderno (sin comentarios ni vacías).
function seccion(texto, titulo) {
    const m = texto.match(new RegExp(`## ${titulo}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`));
    return (m ? m[1] : '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('<!--'));
}

// ─── Mantenimiento, en cada vuelta y SIN Claude: recordatorios, el repaso de la mañana y limpieza ───
let ultimaLimpieza = 0;
async function mantenimiento() {
    if (trabajando) return;                       // el cuaderno lo puede estar reescribiendo Claude
    // 1. Recordatorios vencidos: se mandan y se borran del cuaderno.
    const texto = leerCuaderno();
    const ya = ahoraMadrid();
    const vencidos = seccion(texto, 'Recordatorios').filter(l => {
        const m = l.match(/^-\s*\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]/);
        return m && m[1] <= ya;
    });
    if (vencidos.length) {
        await mandar(`*Recordatorio*\n${vencidos.map(l => l.replace(/^-\s*\[[^\]]+\]\s*/, '• ')).join('\n')}`);
        fs.writeFileSync(CUADERNO, texto.split('\n').filter(l => !vencidos.includes(l.trim())).join('\n'));
        log(`${vencidos.length} recordatorio(s) enviado(s).`);
    }
    // 2. El repaso de la mañana: a partir de las 9, una vez al día y solo si hay algo pendiente.
    const p = partesMadrid();
    const estado = leerEstado();
    if (estado && Number(p.hour) >= 9 && Number(p.hour) < 21 && estado.parte !== hoyMadrid()) {
        const pend = seccion(leerCuaderno(), 'Pendiente');
        estado.parte = hoyMadrid();
        guardarEstado(estado);
        if (pend.length) await mandar(`Buenos días, Fran. Esto sigue pendiente:\n${pend.join('\n')}`);
    }
    // 3. Limpieza, una vez por hora: registros y adjuntos de más de 30 días, la carpeta de trabajo de más de 7.
    if (Date.now() - ultimaLimpieza > 3600_000) {
        ultimaLimpieza = Date.now();
        const borrarViejos = (dir, dias) => {
            let n = 0;
            try {
                for (const f of fs.readdirSync(dir)) {
                    const ruta = path.join(dir, f);
                    if (Date.now() - fs.statSync(ruta).mtimeMs > dias * 86400_000) { fs.rmSync(ruta, { recursive: true, force: true }); n += 1; }
                }
            } catch { /* la carpeta aún no existe */ }
            return n;
        };
        const n = borrarViejos(LOGS, 30) + borrarViejos(path.join(DIR, 'entrada'), 30) + borrarViejos(TRABAJO, 7);
        if (n) log(`Limpieza: ${n} ficheros/carpetas viejos borrados.`);
    }
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
        // Se marcan como atendidos ANTES de trabajar: si Claude se cae, no se repite el trabajo en bucle.
        estado.visto = ultimo;
        estado.atendidos = [...estado.atendidos, ...nuevos.map(m => m.id)].slice(-200);
        guardarEstado(estado);

        // Órdenes que contesta el vigilante sin lanzar a Claude.
        const soloTexto = nuevos.every(m => m.tipo === 'chat') ? nuevos.map(m => m.texto || '').join(' ').trim() : '';
        if (/^(consumo|gasto|cu[aá]nto (has )?gastado)\??$/i.test(soloTexto)) {
            await mandar(textoConsumo());
            return;
        }

        const carpeta = path.join(DIR, 'entrada', etiqueta);
        const lineas = [];
        for (const m of nuevos) {
            // eslint-disable-next-line no-await-in-loop
            lineas.push(`${hora(m.t)}  ${await prepararMensaje(m, carpeta)}`);
        }
        const modelo = modeloPara(lineas.join(' '));
        if (trabajosDeHoy() >= MAX_DIA) {
            await mandar(`Hoy ya he hecho ${MAX_DIA} trabajos, que es el tope que tengo puesto para no gastarte la cuota. `
                + 'Lo retomo mañana, o súbelo con ASISTENTE_MAX_TRABAJOS_DIA si lo necesitas hoy.');
            return;
        }
        await mandar('Recibido, me pongo con ello.').catch(e => log('No se pudo acusar recibo:', e.message));

        const contexto = mensajes.filter(m => !nuevos.includes(m)).slice(-20)
            .map(m => `${hora(m.t)}  ${m.de_mi ? 'CLAUDE/EMPRESA' : 'FRAN'}: ${(m.texto || `[${m.tipo}]`).slice(0, 600)}`).join('\n');
        let pendiente = '';
        try { pendiente = fs.readFileSync(path.join(DIR, 'pendiente.json'), 'utf8'); } catch { /* nada pendiente */ }
        const peticiones = proactivo.paraElPrompt();

        const prompt = [
            fs.readFileSync(INSTRUCCIONES, 'utf8'),
            '\n## Lo último del chat (para contexto)\n', contexto || '(nada)',
            pendiente ? `\n## Oportunidad esperando respuesta de Fran (scratch/asistente/pendiente.json)\n${pendiente}` : '',
            peticiones ? `\n## Peticiones de instaladores que le has propuesto y esperan su «sí» / «no»\n${peticiones}` : '',
            `\n## Tu CUADERNO (${CUADERNO})\nLéelo antes de empezar y REESCRÍBELO al terminar (ver «El cuaderno» arriba).\n`,
            (() => { const c = leerCuaderno(); return c.length > CUADERNO_MAX ? `${c.slice(0, CUADERNO_MAX)}\n[… CORTADO: pasa de ${CUADERNO_MAX} caracteres; acórtalo]` : c; })(),
            '\n## LO QUE FRAN TE ACABA DE ESCRIBIR\n', lineas.join('\n'),
            '\nHazlo y contéstale por WhatsApp con `asistente_whatsapp.js decir … --enviar`.',
        ].join('\n');

        const inicio = ahora();
        registrarSkills();
        const tope = modelo === 'opus' || ES_CEE.test(lineas.join(' ')) ? TOPE_USD_CEE : TOPE_USD;
        const r = await lanzarClaude(prompt, etiqueta, modelo, tope);
        log(`Claude (${modelo}) terminó (código ${r.code}). Registro: ${r.salida}`);

        // ¿Le ha contestado? Si no, el vigilante le manda el final de la salida.
        const despues = await api('/api/whatsapp/conversacion', { method: 'POST', body: { telefono: TEL, dias: 1 }, ms: 60_000 });
        const contesto = (despues.mensajes || []).some(m => m.de_mi && m.t > inicio + 1);
        if (!contesto) {
            const cola = String(r.texto || '').trim().slice(-1200);
            await mandar(r.code === 0 && cola
                ? cola
                : `No he podido terminarlo (código ${r.code}).${cola ? `\n\n${cola.slice(-600)}` : ''}`);
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
        if (req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) { res.writeHead(403); res.end(); return; }
        if (req.method === 'POST' && req.url === '/aviso') {
            log('Aviso del backend: Fran ha escrito.');
            programar((SILENCIO_S + 2) * 1000);
            res.writeHead(202); res.end();
            return;
        }
        if (req.method === 'POST' && req.url === '/entrante') {      // un mensaje de cualquier otro chat
            let cuerpo = '';
            req.on('data', d => { cuerpo += d; if (cuerpo.length > 4096) req.destroy(); });
            req.on('end', () => {
                try { proactivo.alEntrante(JSON.parse(cuerpo || '{}').chatId); } catch { /* cuerpo raro: se ignora */ }
                res.writeHead(202); res.end();
            });
            return;
        }
        res.writeHead(404); res.end();
    }).listen(PUERTO, () => log(`Esperando avisos en :${PUERTO}.`));
}

(async () => {
    if (!TEL) { log('Falta ASISTENTE_WHATSAPP_TEL en el .env: el canal no arranca.'); return; }
    if (!cogerLock()) { log('Ya hay un vigilante corriendo.'); return; }
    log(`Vigilando el chat de ${TEL} cada ${CADA_MS / 1000} s${SERVIDOR ? ' y con el aviso del backend' : ''} · modelo por defecto ${MODELO}.`);
    if (SERVIDOR) servidor();
    const una = process.argv.includes('--una');
    for (;;) {
        try { await vuelta(); } catch (e) { log('Vuelta fallida:', e.message); }
        try { await proactivo.enviarEnCola(); } catch (e) { log('Cola proactiva:', e.message); }
        try { await mantenimiento(); } catch (e) { log('Mantenimiento:', e.message); }
        if (una) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, CADA_MS));
    }
})();
