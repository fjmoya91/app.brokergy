// Servicio interno xml2cert: XML de un CEE (CE3X 3.x) → PDF OFICIAL, en el servidor.
//
// Lo usa el backend (`services/cee/cexAPdf.js`, con XML2CERT_URL) para que un certificador
// pueda subir solo el XML y la app le haga el PDF: sin depender de un PC encendido.
// El generador es el xml2cert.exe del IETcc-CSIC (el mismo que trae CE3X 3.2), que corre
// aquí con Wine; valida el XML con bin/jing.jar (un Java de Windows dentro de Wine).
//
//   POST /pdf     cuerpo = el XML  →  200 { pdf: base64|null, log, codigo, ms }
//                 El veredicto (válido, con marca de agua, inviable) lo saca el backend del
//                 log, con las mismas reglas que en el PC (`avisosDelLog`).
//   GET  /salud   →  { ok, version }
//
// Sin puertos publicados: solo lo ve el backend por la red `brokergy` de Docker.
// Detalle: docs/conocimiento/certificadores-app/el-pdf-del-xml-en-el-servidor.md

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PUERTO = Number(process.env.PORT) || 8095;
const DIR_XMLCERT = '/opt/xmlcert';
const MAX_XML = 10 * 1024 * 1024;
const PLAZO_MS = 90 * 1000;
// Cada conversión es un Wine con un Java dentro: dos a la vez y el resto espera.
const A_LA_VEZ = 2;
const COLA_MAX = 20;

let enCurso = 0;
const cola = [];

function turno() {
    return new Promise((resolve, reject) => {
        if (enCurso < A_LA_VEZ) { enCurso++; return resolve(); }
        if (cola.length >= COLA_MAX) return reject(Object.assign(new Error('demasiadas conversiones en cola'), { status: 503 }));
        cola.push(resolve);
    });
}
function soltar() {
    const siguiente = cola.shift();
    if (siguiente) siguiente(); else enCurso--;
}

function ejecutar(args, plazoMs) {
    return new Promise((resolve) => {
        const hijo = spawn('wine', [path.join(DIR_XMLCERT, 'xml2cert.exe'), ...args], { cwd: DIR_XMLCERT, env: process.env });
        let salida = '';
        hijo.stdout.on('data', d => { salida += d; });
        hijo.stderr.on('data', d => { salida += d; });
        const reloj = setTimeout(() => { salida += '\n[xml2cert] plazo agotado'; hijo.kill('SIGKILL'); }, plazoMs);
        hijo.on('close', codigo => { clearTimeout(reloj); resolve({ codigo, salida }); });
        hijo.on('error', e => { clearTimeout(reloj); resolve({ codigo: -1, salida: `${salida}\n${e.message}` }); });
    });
}

async function convertir(xml) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xml2cert-'));
    try {
        const rutaXml = path.join(dir, 'cee.xml');
        fs.writeFileSync(rutaXml, xml);
        const t0 = Date.now();
        const r = await ejecutar([rutaXml, '-o', dir], PLAZO_MS);
        const rutaPdf = path.join(dir, 'cee.pdf');
        const rutaLog = path.join(dir, 'cee.log');
        // Sin los colores de la consola ni el ruido de Wine, que no es del certificado.
        // eslint-disable-next-line no-control-regex
        const salida = r.salida.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)
            .filter(l => l && !/XDG_RUNTIME_DIR|^wine: /.test(l)).join('\n');
        return {
            pdf: fs.existsSync(rutaPdf) ? fs.readFileSync(rutaPdf).toString('base64') : null,
            log: fs.existsSync(rutaLog) ? fs.readFileSync(rutaLog, 'utf8') : '',
            salida,
            codigo: r.codigo,
            ms: Date.now() - t0,
        };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function responder(res, status, cuerpo) {
    const json = JSON.stringify(cuerpo);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json) });
    res.end(json);
}

let version = null;
async function versionXml2cert() {
    if (!version) {
        const r = await ejecutar(['-V'], 60 * 1000);
        version = (r.salida.match(/xml2cert \d[^\r\n]*/) || [null])[0];
    }
    return version;
}

const servidor = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/salud') {
        return versionXml2cert().then(v => responder(res, 200, { ok: !!v, version: v }));
    }
    if (req.method !== 'POST' || req.url !== '/pdf') return responder(res, 404, { error: 'no existe' });

    const trozos = [];
    let total = 0;
    req.on('data', d => {
        total += d.length;
        if (total > MAX_XML) { responder(res, 413, { error: 'el XML pasa de 10 MB' }); req.destroy(); return; }
        trozos.push(d);
    });
    req.on('end', async () => {
        if (res.writableEnded) return;
        const xml = Buffer.concat(trozos);
        if (!xml.length) return responder(res, 400, { error: 'falta el XML' });
        try {
            await turno();
        } catch (e) {
            return responder(res, e.status || 500, { error: e.message });
        }
        try {
            responder(res, 200, await convertir(xml));
        } catch (e) {
            console.error('[xml2cert]', e.message);
            responder(res, 500, { error: e.message });
        } finally {
            soltar();
        }
    });
});

// wineserver persistente: la primera conversión arranca Wine entero; las demás, no.
spawn('wineserver', ['-p'], { stdio: 'ignore', detached: true }).unref();

servidor.listen(PUERTO, () => {
    console.log(`[xml2cert] escuchando en :${PUERTO}`);
    setTimeout(() => versionXml2cert().then(v => console.log(`[xml2cert] ${v || 'versión desconocida'}`)), 3000);
});
