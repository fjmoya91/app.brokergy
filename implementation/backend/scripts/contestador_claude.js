// =============================================================================
// contestador_claude.js — la llamada a Claude del CONTESTADOR de WhatsApp
// (fase 2 del agente autónomo, 10/11/2026).
//
// Una llamada CORTA y SIN herramientas: el backend ya ha mirado la base de datos y
// la conversación y le pasa a Claude un prompt con todo dentro (el conocimiento de
// la casa, el dossier de la obra, lo que ha llegado y el chat). Claude solo redacta
// y devuelve un JSON. Medido el 10/11/2026: sin herramientas, con su propio prompt
// de sistema y fuera del repo, un «devuelve este JSON» son 271 tokens de entrada y
// 3 s; con el prompt del contestador, unos pocos miles.
//
// La usan:
//   · el vigilante del contenedor «asistente» (POST /contestar), en un carril
//     APARTE del de los trabajos de Fran: un CEE de 7 minutos no puede dejar a un
//     cliente sin contestar;
//   · la prueba en seco del PC (scripts/contestador.js seco), con el Claude Code de
//     Fran.
//
// REGLAS:
//  - Con la SUSCRIPCIÓN, nunca con la clave de la API: se le quitan ANTHROPIC_API_KEY
//    y ANTHROPIC_AUTH_TOKEN del entorno (regla del asistente, medido el 22/10/2026).
//  - Fuera del repo (una carpeta vacía): desde dentro cargaría CLAUDE.md entero.
//  - Sin herramientas (`--tools ""`), sin MCP (`--strict-mcp-config`), sin ajustes ni
//    hooks del usuario (`--setting-sources ""`) y sin sesión en disco.
//  - Con plazo y tope de gasto: lo peor que pasa es que el contestador use su
//    respaldo (Gemini) o se lo pase a Fran.
// =============================================================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CLAUDE = process.env.ASISTENTE_CLAUDE_CMD || 'claude';
const MODELO = () => process.env.CONTESTADOR_MODELO || 'sonnet';
const CARPETA = path.join(os.tmpdir(), 'contestador-trabajo');
const SISTEMA = 'Eres quien contesta los WhatsApp de BROKERGY en nombre de Fran. No tienes herramientas ni las necesitas: '
    + 'todo lo que hace falta va en el mensaje. Devuelves SOLO el JSON que se te pide, sin texto alrededor ni bloques de codigo.';

function entorno() {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    return env;
}

/** El primer objeto JSON de un texto (Claude a veces lo envuelve en ```json … ```). */
function sacarJson(texto) {
    const s = String(texto || '').trim();
    try { return JSON.parse(s); } catch { /* sigue */ }
    const i = s.indexOf('{');
    const j = s.lastIndexOf('}');
    if (i >= 0 && j > i) {
        try { return JSON.parse(s.slice(i, j + 1)); } catch { /* sigue */ }
    }
    return null;
}

/**
 * Le pasa el prompt a Claude y devuelve lo que contesta.
 * @returns {Promise<{ ok: boolean, json: object|null, texto: string, modelo: string,
 *   segundos: number, coste_usd: number|null, entrada: number|null, salida: number|null, error?: string }>}
 * Nunca lanza.
 */
function pensar(prompt, { modelo = MODELO(), plazoMs = Number(process.env.CONTESTADOR_PLAZO_MS) || 150_000, topeUsd = 1 } = {}) {
    return new Promise((resolve) => {
        const inicio = Date.now();
        try { fs.mkdirSync(CARPETA, { recursive: true }); } catch { /* el spawn lo dirá */ }
        const win = process.platform === 'win32';
        // En Windows `claude` es un .cmd y hace falta la shell: los argumentos con espacios van entre comillas.
        const q = (s) => (win ? `"${String(s).replace(/"/g, '\\"')}"` : s);
        const args = ['-p', '--output-format', 'json', '--model', modelo, '--tools', win ? '""' : '',
            '--system-prompt', q(SISTEMA), '--setting-sources', win ? '""' : '', '--strict-mcp-config',
            '--no-session-persistence', '--max-budget-usd', String(topeUsd)];
        let hijo;
        try {
            hijo = spawn(CLAUDE, args, { cwd: CARPETA, shell: win, windowsHide: true, env: entorno() });
        } catch (e) {
            resolve({ ok: false, json: null, texto: '', modelo, segundos: 0, coste_usd: null, entrada: null, salida: null, error: e.message });
            return;
        }
        let out = '';
        let err = '';
        hijo.stdout.on('data', (d) => { out += d; });
        hijo.stderr.on('data', (d) => { err += d; });
        const plazo = setTimeout(() => { err += '\n[plazo agotado]'; try { hijo.kill(); } catch { /* ya no está */ } }, plazoMs);
        let hecho = false;
        const fin = (code) => {
            if (hecho) return;
            hecho = true;
            clearTimeout(plazo);
            let r = null;
            try { r = JSON.parse(out); } catch { /* sin JSON: se cayó antes de acabar */ }
            const texto = String(r?.result ?? '');
            const uso = Object.values(r?.modelUsage || {})[0] || {};
            const json = r && !r.is_error ? sacarJson(texto) : null;
            resolve({
                ok: !!json,
                json,
                texto,
                modelo: Object.keys(r?.modelUsage || {})[0] || modelo,
                segundos: Math.round((Date.now() - inicio) / 100) / 10,
                coste_usd: r?.total_cost_usd ?? null,
                entrada: uso.inputTokens != null ? (uso.inputTokens || 0) + (uso.cacheReadInputTokens || 0) + (uso.cacheCreationInputTokens || 0) : null,
                salida: uso.outputTokens ?? null,
                ...(json ? {} : { error: r?.is_error ? `Claude: ${texto.slice(0, 300)}` : `sin JSON (código ${code}): ${(err || out).trim().slice(-300)}` }),
            });
        };
        hijo.on('close', fin);
        hijo.on('error', (e) => { err += e.message; fin(-1); });
        hijo.stdin.write(String(prompt || ''));
        hijo.stdin.end();
    });
}

module.exports = { pensar, sacarJson, SISTEMA };

if (require.main === module) {
    // Prueba suelta: node scripts/contestador_claude.js "Devuelve {\"ok\":true}"
    pensar(process.argv[2] || 'Devuelve SOLO este JSON: {"ok":true}').then((r) => {
        console.log(JSON.stringify(r, null, 2));
        process.exitCode = r.ok ? 0 : 1;
    });
}
