// Servicio interno ce3x-engine: el MOTOR DE CE3X 3.2 (su Python 2.7 y su código, sin ventana)
// con Wine, en el servidor. Califica un .cex, calcula sus medidas y escribe el XML sin depender
// de que el PC de Fran esté encendido.
//
// Lo usa el backend (`services/cee/cexAPdf.js`, con CE3X_URL): ejecuta aquí el MISMO script del
// oráculo (`cee-engine/tools/oraculo_ce3x/<script>`) que en el PC lanza `ce3xpy.exe`, en una
// carpeta temporal, y devuelve lo que ha dejado en ella. Lo que diga CE3X es lo que vale.
//
//   POST /oraculo  { script: 'cex_a_xml.py', env: { CASO: '{DIR}\\cee.cex', … }, ficheros: { 'cee.cex': base64 } }
//                  → 200 { s: <resultado.json o null>, salida: <ce3x.out>, ficheros: { nombre: base64 }, codigo, ms }
//                  `{DIR}` en los valores de `env` es la carpeta del trabajo (ruta de Wine).
//                  Vuelven los ficheros NUEVOS o CAMBIADOS (el XML, el .cex guardado…).
//   GET  /salud    → { ok, listo, version, ocupado, en_cola }
//
// REGLA — como en el PC: CE3X 3.2 ABIERTO (oculto, en la pantalla virtual) y el arnés con OTRO
// nombre (`ce3xpy.exe`). El motor solo abre un .cex si hay un PROCESO `ce3xv3.2.exe` (vg2/TASKLIST,
// ver el README del oráculo); se cumple abriendo el programa de verdad, no llamando así al arnés.
// `abrirCe3x` lo arranca si no está (al empezar, tras matar Wine por un plazo o si se cierra) y se
// queda abierto: ~190 MB. Un NO_ABRE se reintenta como en el PC (3 veces, 8 s).
//
// REGLA — NUNCA un `wineserver -p` suelto. Medido el 23/11/2026: con el wineserver arrancado ANTES de
// la primera sesión de Wine, la primera calificación del contenedor se cuelga al salir (2 de 2, también
// la autoprueba) o falla («'wxFrame1' object has no attribute 'barraEstado'»). Y /tmp sin los restos
// del build (arrancar.sh). Al arrancar —y tras matar Wine por un plazo— se califica el ejemplo OFICIAL
// 2 (`calentar`, hasta 3 intentos) con el turno cogido: `listo` en /salud dice que CE3X califica aquí.
//
// Uno a la vez: hay UN prefijo de Wine y CE3X escribe en su registro (ficheros recientes) y en
// Documentos (erroresCEX.txt). Cola corta; llena, 503. Sin puertos publicados: solo lo ve el
// backend por la red `brokergy`.
// Detalle: docs/conocimiento/cee-generacion/el-motor-de-ce3x-en-el-servidor.md

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PUERTO = Number(process.env.PORT) || 8096;
const ORACULO = '/opt/oraculo';
const HOST = '/opt/host/ce3xpy.exe';
const CE3X_DIR = 'C:\\Program Files (x86)\\CE3Xv3.2';
const CE3X_PROGRAMA = `${CE3X_DIR}\\ce3xv3.2.exe`;
const ESPERA_ABRIR_MS = Number(process.env.CE3X_ESPERA_ABRIR_MS) || 12000;
const TRABAJOS = '/tmp/ce3x';
const MAX_CUERPO = 80 * 1024 * 1024;            // un .cex grande ronda los 6 MB; en base64, más
const PLAZO_MS = Number(process.env.CE3X_PLAZO_MS) || 6 * 60 * 1000;
const COLA_MAX = 10;

let ocupado = false;
const cola = [];
function turno() {
    return new Promise((resolve, reject) => {
        if (!ocupado) { ocupado = true; return resolve(); }
        if (cola.length >= COLA_MAX) return reject(Object.assign(new Error('demasiadas calificaciones en cola'), { status: 503 }));
        cola.push(resolve);
    });
}
function soltar() {
    const siguiente = cola.shift();
    if (siguiente) siguiente(); else ocupado = false;
}

/** Ruta de Wine (Z:) de una ruta del contenedor. */
const aWine = p => `Z:${p.replace(/\//g, '\\')}`;

/** Los scripts que se pueden ejecutar: los del oráculo y nada más. */
function scriptValido(nombre) {
    return /^[a-z_0-9]+\.py$/.test(String(nombre || '')) && fs.existsSync(path.join(ORACULO, nombre));
}

/** El script envuelto como lo hace `cexAPdf.envolver` en el PC (y `run.sh`). */
function envolver(script, out) {
    const cuerpo = fs.readFileSync(path.join(ORACULO, script), 'utf8').split(/\r?\n/).map(l => `    ${l}`).join('\n');
    return [
        '# -*- coding: utf-8 -*-',
        'import sys, os',
        `OUT = open(r'${out}', 'w')`,
        'sys.stdout = OUT; sys.stderr = OUT',
        "CE = os.environ['CE3X_DIR']",
        "sys.frozen = 'windows_exe'; sys.executable = os.path.join(CE, 'ce3xv3.2.exe'); sys.argv = [sys.executable]",
        "os.environ['MATPLOTLIBDATA'] = os.path.join(CE, 'mpl-data')",
        'try:', cuerpo,
        'except SystemExit: pass',
        'except BaseException:',
        '    import traceback; traceback.print_exc()',
        'OUT.close()', '',
    ].join('\n');
}

function ejecutar(args, env, plazoMs) {
    return new Promise((resolve) => {
        const hijo = spawn('wine', args, { cwd: '/', env });
        let salida = '';
        hijo.stdout.on('data', d => { salida += d; });
        hijo.stderr.on('data', d => { salida += d; });
        let plazo = false;
        const reloj = setTimeout(() => {
            plazo = true;
            hijo.kill('SIGKILL');
            // El Python de CE3X sigue vivo dentro de Wine aunque muera el lanzador.
            spawn('wineserver', ['-k'], { stdio: 'ignore' });
        }, plazoMs);
        hijo.on('close', codigo => { clearTimeout(reloj); resolve({ codigo, salida, plazo }); });
        hijo.on('error', e => { clearTimeout(reloj); resolve({ codigo: -1, salida: `${salida}\n${e.message}`, plazo }); });
    });
}

const huella = buf => crypto.createHash('sha1').update(buf).digest('hex');
const esperar = ms => new Promise(r => setTimeout(r, ms));

// ─── CE3X abierto, como en el PC ─────────────────────────────────────────────
let gui = null;
async function abrirCe3x() {
    if (gui) return false;
    const hijo = spawn('wine', [CE3X_PROGRAMA], { cwd: '/', env: process.env, stdio: 'ignore' });
    gui = hijo;
    hijo.on('exit', () => { if (gui === hijo) gui = null; });
    hijo.on('error', () => { if (gui === hijo) gui = null; });
    await esperar(ESPERA_ABRIR_MS);                 // en el PC, ~10 s hasta que abre
    console.log(`[ce3x-engine] CE3X 3.2 ${gui === hijo ? 'abierto (oculto)' : 'NO se ha quedado abierto'}`);
    return true;
}

async function correr({ script, env = {}, ficheros = {} }, { plazoMs = PLAZO_MS } = {}) {
    if (!scriptValido(script)) throw Object.assign(new Error(`script desconocido: ${script}`), { status: 400 });
    fs.mkdirSync(TRABAJOS, { recursive: true });
    const dir = fs.mkdtempSync(path.join(TRABAJOS, 't'));
    const dirW = aWine(dir);
    try {
        const entrada = {};
        for (const [nombre, b64] of Object.entries(ficheros || {})) {
            if (!/^[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)?$/.test(nombre)) throw Object.assign(new Error(`nombre de fichero no válido: ${nombre}`), { status: 400 });
            const buf = Buffer.from(String(b64), 'base64');
            fs.writeFileSync(path.join(dir, nombre), buf);
            entrada[nombre] = huella(buf);
        }
        const out = `${dirW}\\ce3x.out`;
        const wrapped = path.join(dir, 'script.wrapped.py');
        fs.writeFileSync(wrapped, envolver(script, out));
        const extra = {};
        for (const [k, v] of Object.entries(env || {})) {
            if (!/^[A-Z_][A-Z0-9_]*$/.test(k)) continue;
            if (v == null) continue;
            extra[k] = String(v).split('{DIR}').join(dirW);
        }
        const envW = {
            ...process.env, ...extra,
            CE3X_DIR, ORACULO_DIR: aWine(ORACULO), RESULTADO: `${dirW}\\resultado.json`,
        };
        const t0 = Date.now();
        const leer = n => { try { return fs.readFileSync(path.join(dir, n)); } catch { return null; } };
        let r = null;
        let s = null;
        for (let intento = 0; intento < 3; intento++) {
            // eslint-disable-next-line no-await-in-loop
            await abrirCe3x();
            fs.rmSync(path.join(dir, 'resultado.json'), { force: true });
            // eslint-disable-next-line no-await-in-loop
            r = await ejecutar([HOST, aWine(wrapped)], envW, plazoMs);
            s = null;
            try { s = JSON.parse(leer('resultado.json').toString('utf8')); } catch { /* sin resultado */ }
            if (r.plazo || !s || s.error !== 'NO_ABRE') break;
            // eslint-disable-next-line no-await-in-loop
            await esperar(8000);                        // CE3X aún abriéndose: como en el PC
        }
        const ms = Date.now() - t0;
        console.log(`[ce3x-engine] ${new Date().toISOString()} ${script} · ${Math.round(ms / 1000)} s · ${r.plazo ? 'FUERA DE PLAZO' : s ? (s.error || 'ok') : `sin resultado (código ${r.codigo})`}`);
        const salida = (leer('ce3x.out') || Buffer.from('')).toString('latin1');
        const vuelta = {};
        for (const nombre of fs.readdirSync(dir)) {
            if (['resultado.json', 'ce3x.out', 'script.wrapped.py'].includes(nombre)) continue;
            const ruta = path.join(dir, nombre);
            if (!fs.statSync(ruta).isFile()) continue;
            const buf = fs.readFileSync(ruta);
            if (entrada[nombre] && entrada[nombre] === huella(buf)) continue;
            vuelta[nombre] = buf.toString('base64');
        }
        if (r.plazo) listo = false;                 // se ha matado Wine: el siguiente vuelve a estar frío
        return { s, salida: salida.slice(-20000), ficheros: vuelta, codigo: r.codigo, plazo: r.plazo, ms };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ─── Calentar: el ejemplo OFICIAL 2 hasta que califique bien ─────────────────
const EJEMPLO = '/opt/autoprueba/ejemplo2.cex';
let listo = false;
const trabajoEjemplo = () => ({
    script: 'cex_a_xml.py',
    env: { CASO: '{DIR}\\cee.cex', XML: '{DIR}\\cee.xml', AJUSTAR_AUTOCONSUMO: '1', SALIDA_CEX: '{DIR}\\cee_ajustado.cex' },
    ficheros: { 'cee.cex': fs.readFileSync(EJEMPLO).toString('base64') },
});
const califica = r => !!(r && r.s && !r.s.error && r.s.calificacion && r.s.calificacion._valido !== false && r.ficheros['cee.xml']);
async function calentar() {
    for (let i = 1; i <= 3 && !listo; i++) {
        // eslint-disable-next-line no-await-in-loop
        const r = await correr(trabajoEjemplo(), { plazoMs: 2 * 60 * 1000 });
        listo = califica(r) && !r.plazo;
        const porque = r.plazo ? 'fuera de plazo'
            : r.s && r.s.error ? String(r.s.error).split(/\r?\n/).filter(Boolean).pop() : `código ${r.codigo}`;
        console.log(`[ce3x-engine] calentar ${i}/3: ${listo ? 'listo' : `todavía no (${porque})`}`);
    }
    return listo;
}

function responder(res, status, cuerpo) {
    const json = JSON.stringify(cuerpo);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json) });
    res.end(json);
}

const VERSION = (() => {
    try { return fs.readFileSync('/opt/ce3x-version.txt', 'utf8').trim(); } catch { return 'CE3X 3.2'; }
})();

const servidor = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/salud') {
        return responder(res, 200, { ok: fs.existsSync(HOST), listo, ce3x_abierto: !!gui, version: VERSION, ocupado, en_cola: cola.length });
    }
    if (req.method !== 'POST' || req.url !== '/oraculo') return responder(res, 404, { error: 'no existe' });
    const trozos = [];
    let total = 0;
    req.on('data', d => {
        total += d.length;
        if (total > MAX_CUERPO) { responder(res, 413, { error: 'la petición pasa de 80 MB' }); req.destroy(); return; }
        trozos.push(d);
    });
    req.on('end', async () => {
        if (res.writableEnded) return;
        let pedido;
        try { pedido = JSON.parse(Buffer.concat(trozos).toString('utf8')); } catch { return responder(res, 400, { error: 'JSON no válido' }); }
        try { await turno(); } catch (e) { return responder(res, e.status || 500, { error: e.message }); }
        try {
            if (!listo && !(await calentar())) return responder(res, 503, { error: 'CE3X no arranca en el servidor (calentando, 3 intentos)' });
            responder(res, 200, await correr(pedido));
        } catch (e) {
            console.error('[ce3x-engine]', e.message);
            responder(res, e.status || 500, { error: e.message });
        } finally {
            // Si se ha matado Wine por un plazo, se vuelve a calentar ANTES de soltar el turno.
            if (!listo) { try { await calentar(); } catch (e) { console.error('[ce3x-engine] calentar:', e.message); } }
            soltar();
        }
    });
});

if (require.main === module) {
    servidor.listen(PUERTO, () => console.log(`[ce3x-engine] escuchando en :${PUERTO} (${VERSION})`));
    ocupado = true;                                   // lo que llegue mientras calienta, a la cola
    calentar().catch(e => console.error('[ce3x-engine] calentar:', e.message)).finally(soltar);
}

module.exports = { correr, cerrarCe3x: () => { if (gui) { try { gui.kill('SIGKILL'); } catch { /* ya no está */ } } } };
