#!/usr/bin/env node
// ============================================================================
// pdf_del_xml.js — el PDF oficial del CEE sale SOLO en cuanto se guarda su XML.
//
// Sustituye al «botón derecho → Mostrar más opciones → Enviar a → PDF del CEE», que
// colgaba el Explorador de Windows: ese menú clásico carga todas las extensiones del
// shell (Google Drive, TeamViewer…) y explorer.exe «dejó de interactuar» 11 veces del
// 21/09 al 09/10/2026 (visor de eventos, Id 1002, Cross-thread). El generador, xml2cert,
// funcionaba: en 26RES060_188 sacó el PDF bien.
//
//   node scripts/pdf_del_xml.js vigilar            vigila «Mi unidad» y hace los PDF solos
//   node scripts/pdf_del_xml.js "<.xml|carpeta>"   lo hace ya, para ese XML o los de esa carpeta
//
// Opciones:
//   --raiz="C:/…"     qué vigilar (por defecto LOCAL_DRIVE_BASE o C:\Users\Usuario\Mi unidad)
//   --repasar=24      al arrancar, también los XML de las últimas N horas sin PDF (por
//                     defecto NO: solo lo que se guarde a partir de ahora)
//   --en-seco         dice qué haría, sin escribir nada
//   --sin-avisos      sin notificaciones de Windows
//   --forzar          (con una ruta) lo rehace aunque el PDF esté al día
//
// Al arrancar en el PC lo lanza tools/windows/pdf_del_xml.vbs (sin ventana); se instala
// con tools/windows/instalar-pdf-del-xml.cmd. Lo que hace queda en
// %LOCALAPPDATA%\Brokergy\pdf-del-xml.log.
//
// REGLA — el PDF va AL LADO del XML y con su MISMO nombre (lo que hacía el .bat): así
// es como lo dejaba CE3X y lo que firma Autofirma (`…_fdo.pdf`). Solo el PDF: el .log de
// xml2cert se queda en el temporal, no ensucia la carpeta de Drive.
// REGLA — el PDF que hubiera con ese nombre se mueve a OLD/ con la hora
// (`…_AAAAMMDD_HHMMSS.pdf`), como `cex_a_pdf.js`: nunca se pisa ni se borra
// (decisión del usuario, 12/10/2026). El firmado `_fdo.pdf` lleva otro nombre y no se toca.
// REGLA — no se repite: un PDF está AL DÍA si es posterior al XML, o a otro XML de la
// misma carpeta con los MISMOS bytes (la app sube `{nº} – CEE INICIAL.xml` con raya
// y CE3X lo guarda con guion: son el mismo certificado y no llevan dos PDF), o si ya
// está el firmado `_fdo.pdf`.
// REGLA — un `_REVISAR.xml` espera 45 s: los deja el Agente IA con su PDF al lado y
// Drive los baja por separado; hacerlo antes de que llegue el suyo daría un «(1)».
// REGLA — SOLO en la carpeta de una fase del CEE (`1. CEE\CEE INICIAL|CEE FINAL` de un
// expediente; `1. CEE`, `1. CEE INICIAL`, `2. CEE FINAL` de un CEE directo), nunca en
// sus subcarpetas. Medido en seco el 12/10/2026 sobre «Mi unidad»: la mitad de los XML
// recientes estaban en los paquetes de los lotes («LOTE-… - ENVIO GESTOR\E1»,
// «07. ENVIADOS A…», «10. REQUERIMIENTOS») y en «12. DOCUMENTOS PARA CEE» (el CEE
// anterior del cliente): ahí no se añade nada.
// REGLA — el reloj del PC no es de fiar (el 12/10/2026 estaba puesto al 05/10): además
// de las fechas, se recuerda qué XML (sus bytes) dio cada PDF.
// ============================================================================
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { pdfDeXml, disponiblePdf } = require('../services/cee/cexAPdf');

const argv = process.argv.slice(2);
const OPC = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=');
    return [k, v.length ? v.join('=') : true];
}));
const posicionales = argv.filter((a) => !a.startsWith('--'));
const EN_SECO = !!OPC['en-seco'];
const AVISOS = !OPC['sin-avisos'];
const RAIZ = path.resolve(OPC.raiz || process.env.LOCAL_DRIVE_BASE || 'C:\\Users\\Usuario\\Mi unidad');

const ESPERA_MS = 2500;          // sin cambios durante esto, el XML se da por escrito
const ESPERA_REVISAR_MS = 45000; // el del Agente IA: que baje antes su PDF
const MAX_BYTES = 30 * 1024 * 1024;

// ── registro ────────────────────────────────────────────────────────────────
const DIR_LOG = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Brokergy');
const FICHERO_LOG = path.join(DIR_LOG, 'pdf-del-xml.log');
function anotar(msg) {
    const linea = `${new Date().toLocaleString('es-ES')}  ${msg}`;
    console.log(linea);
    try {
        fs.mkdirSync(DIR_LOG, { recursive: true });
        if (fs.existsSync(FICHERO_LOG) && fs.statSync(FICHERO_LOG).size > 1024 * 1024) {
            fs.renameSync(FICHERO_LOG, `${FICHERO_LOG}.1`);
        }
        fs.appendFileSync(FICHERO_LOG, `${linea}\n`);
    } catch { /* sin log, sigue */ }
}

// ── notificación de Windows ─────────────────────────────────────────────────
// Con el AppID de Windows PowerShell (registrado en todo Windows): sin instalar nada.
const AUMID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const psEsc = (s) => String(s).replace(/'/g, "''");
function avisar(titulo, texto, abrir) {
    if (!AVISOS || EN_SECO) return;
    const lanzar = abrir ? ` activationType="protocol" launch="${xmlEsc(pathToFileURL(abrir).href)}"` : '';
    const toast = `<toast${lanzar}><visual><binding template="ToastGeneric"><text>${xmlEsc(titulo)}</text>`
        + `<text>${xmlEsc(texto)}</text></binding></visual></toast>`;
    const ps = [
        '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
        '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
        '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
        `$x.LoadXml('${psEsc(toast)}')`,
        `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${psEsc(AUMID)}').Show((New-Object Windows.UI.Notifications.ToastNotification $x))`,
    ].join('; ');
    try {
        const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true, stdio: 'ignore' });
        p.on('error', () => { /* sin aviso, el log lo tiene */ });
    } catch { /* idem */ }
}

// ── ¿dónde sí? ──────────────────────────────────────────────────────────────
/** ¿Está el XML en la carpeta de una fase del CEE? Ver la REGLA de la cabecera. */
function enCarpetaDeCee(ruta) {
    const padre = path.basename(path.dirname(ruta)).trim();
    const abuelo = path.basename(path.dirname(path.dirname(ruta))).trim();
    if (/^CEE (INICIAL|FINAL)$/i.test(padre) && /^1\. CEE$/i.test(abuelo)) return true;
    return /^(1\. CEE|1\. CEE INICIAL|2\. CEE FINAL)$/i.test(padre) && /^\d{4}CEE_\d+\b/i.test(abuelo);
}

// ── ¿está el PDF al día?────────────────────────────────────────────────────
/** Mismo nombre para la raya de la app («–») y el guion de CE3X («-»). */
const normal = (nombre) => nombre.normalize('NFC').toLowerCase()
    .replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();

/** Qué bytes de XML dieron cada PDF (por si el reloj del PC miente). */
const FICHERO_HECHOS = path.join(DIR_LOG, 'pdf-del-xml.json');
let hechos = null;
const huella = (bytes) => require('crypto').createHash('sha1').update(bytes).digest('hex');
function leerHechos() {
    if (!hechos) { try { hechos = JSON.parse(fs.readFileSync(FICHERO_HECHOS, 'utf8')); } catch { hechos = {}; } }
    return hechos;
}
function apuntarHecho(rutaPdf, bytes) {
    const h = leerHechos();
    h[rutaPdf] = { xml: huella(bytes), fecha: new Date().toISOString() };
    const claves = Object.keys(h);
    if (claves.length > 3000) for (const k of claves.slice(0, claves.length - 3000)) delete h[k];
    try { fs.mkdirSync(DIR_LOG, { recursive: true }); fs.writeFileSync(FICHERO_HECHOS, JSON.stringify(h)); } catch { /* sin memoria, quedan las fechas */ }
}

/**
 * El PDF que ya cubre este XML, o null. Ver la REGLA de la cabecera.
 * @returns {{ pdf: string, porque: string } | null}
 */
function pdfAlDia(rutaXml, bytes) {
    const dir = path.dirname(rutaXml);
    const base = normal(path.basename(rutaXml, path.extname(rutaXml)));
    const mXml = fs.statSync(rutaXml).mtimeMs;
    let ficheros;
    try { ficheros = fs.readdirSync(dir); } catch { return null; }
    const pdfs = ficheros.filter((f) => /\.pdf$/i.test(f))
        .filter((f) => { const b = normal(f.slice(0, -4)); return b === base || b === `${base}_fdo`; })
        .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }));
    if (!pdfs.length) return null;
    // 0. lo hizo este vigilante con estos mismos bytes
    const h = huella(bytes);
    const recordado = pdfs.find((p) => leerHechos()[path.join(dir, p.f)]?.xml === h);
    if (recordado) return { pdf: recordado.f, porque: 'se hizo con este mismo XML' };
    // 1. posterior a este XML
    const nuevo = pdfs.find((p) => p.m >= mXml - 1000);
    if (nuevo) return { pdf: nuevo.f, porque: 'es posterior al XML' };
    // 2. posterior a un XML gemelo (mismos bytes) de la misma carpeta
    const gemelos = ficheros.filter((f) => /\.xml$/i.test(f) && normal(f.slice(0, -4)) === base
        && path.join(dir, f) !== rutaXml);
    for (const g of gemelos) {
        const rg = path.join(dir, g);
        const st = fs.statSync(rg);
        if (st.size !== bytes.length || !fs.readFileSync(rg).equals(bytes)) continue;
        const p = pdfs.find((x) => x.m >= st.mtimeMs - 1000);
        if (p) return { pdf: p.f, porque: `ya se hizo con «${g}», que es el mismo XML` };
    }
    return null;
}

// ── hacer uno ───────────────────────────────────────────────────────────────
/**
 * Mueve el PDF anterior a OLD/ con la hora en el nombre, como `cex_a_pdf.js`
 * (`…_AAAAMMDD_HHMMSS.pdf`). Devuelve la ruta en OLD o null si no había. Si está
 * abierto en otro programa, el rename falla (EBUSY/EPERM) y no se toca nada.
 */
function aOld(ruta) {
    if (!fs.existsSync(ruta)) return null;
    const old = path.join(path.dirname(ruta), 'OLD');
    fs.mkdirSync(old, { recursive: true });
    const n = new Date();
    const dos = (x) => String(x).padStart(2, '0');
    const sello = `${n.getFullYear()}${dos(n.getMonth() + 1)}${dos(n.getDate())}_${dos(n.getHours())}${dos(n.getMinutes())}${dos(n.getSeconds())}`;
    const ext = path.extname(ruta);
    let destino = path.join(old, `${path.basename(ruta, ext)}_${sello}${ext}`);
    for (let i = 2; fs.existsSync(destino); i++) destino = path.join(old, `${path.basename(ruta, ext)}_${sello}_${i}${ext}`);
    fs.renameSync(ruta, destino);
    return destino;
}

/** Escribe el PDF nuevo; el que hubiera va antes a OLD/ y, si la escritura falla, vuelve a su sitio. */
function escribirPdf(destino, bytes) {
    const viejo = aOld(destino);
    try {
        fs.writeFileSync(destino, bytes);
    } catch (e) {
        if (viejo) { try { fs.rmSync(destino, { force: true }); fs.renameSync(viejo, destino); } catch { /* queda en OLD */ } }
        throw e;
    }
    return viejo;
}

const corta =(ruta) => path.relative(RAIZ, ruta).startsWith('..') ? ruta : path.relative(RAIZ, ruta);

/** La carpeta de la obra («26RES060_188 - OLAYO…», «2026CEE_54 - …»), subiendo desde el fichero. */
function obraDe(ruta) {
    let d = path.dirname(ruta);
    for (let i = 0; i < 4; i++, d = path.dirname(d)) {
        if (/^[0-9A-Z]+_[0-9A-Z]+ - /i.test(path.basename(d))) return path.basename(d);
    }
    return path.basename(path.dirname(ruta));
}

/**
 * @returns {Promise<'hecho'|'al-dia'|'no-cee'|'v2'|'incompleto'|'fallo'|'no-esta'>}
 */
async function hacer(rutaXml, { forzar = false } = {}) {
    if (!fs.existsSync(rutaXml)) return 'no-esta';
    const st = fs.statSync(rutaXml);
    if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) return 'no-cee';
    const bytes = fs.readFileSync(rutaXml);
    const cabecera = bytes.subarray(0, 4096).toString('utf8');
    if (!/<DatosEnergeticosDelEdificio\b/.test(cabecera)) return 'no-cee';
    //: CE3X o Drive aún escribiéndolo: vuelve a intentarlo quien llama.
    if (!/<\/DatosEnergeticosDelEdificio>\s*$/.test(bytes.subarray(-200).toString('utf8'))) return 'incompleto';

    if (!forzar) {
        const ya = pdfAlDia(rutaXml, bytes);
        if (ya) { anotar(`= ${corta(rutaXml)}: al día (${ya.pdf}, ${ya.porque})`); return 'al-dia'; }
    }
    const destino = rutaXml.replace(/\.xml$/i, '.pdf');
    if (EN_SECO) { anotar(`· EN SECO: haría ${corta(destino)}`); return 'hecho'; }

    const t0 = Date.now();
    const r = await pdfDeXml(bytes);
    const nombre = path.basename(destino);
    if (!r.ok) {
        if (r.version && !String(r.version).startsWith('3')) { anotar(`- ${corta(rutaXml)}: ${r.error}`); return 'v2'; }
        anotar(`✗ ${corta(rutaXml)}: ${r.error}`);
        avisar('PDF del CEE: no se ha podido', `${path.basename(rutaXml)}\n${r.error}`.slice(0, 250));
        return 'fallo';
    }
    // REGLA — un PDF con la marca «certificado incompleto» NO se deja en la carpeta
    // (2026-10-19, 26RES060_195): la carpeta es de Drive y se comparte con el
    // técnico, que lo firmaba y lo intentaba presentar. Se avisa de por qué.
    if (r.marcaDeAgua) {
        anotar(`⛔ ${corta(rutaXml)}: XML INCOMPLETO, no se deja el PDF: ${r.avisos.join(' · ')}`);
        avisar('CEE INCOMPLETO: no se hace el PDF', `${path.basename(rutaXml)}\n${r.avisos[0]}`.slice(0, 250));
        return 'incompleto-xml';
    }
    // Entre medias pudo bajar de Drive el suyo (el del Agente IA): no se pisa.
    if (!forzar && pdfAlDia(rutaXml, bytes)) { anotar(`= ${corta(rutaXml)}: llegó su PDF mientras se hacía`); return 'al-dia'; }
    let viejo = null;
    try {
        viejo = escribirPdf(destino, r.pdf);
    } catch (e) {
        const abierto = /EBUSY|EPERM|EACCES/.test(e.code || '');
        anotar(`✗ ${corta(destino)}: ${e.message}`);
        avisar('PDF del CEE: no se ha podido guardar', abierto
            ? `${nombre} está abierto en otro programa. Ciérralo y vuelve a guardar el XML.`
            : `${nombre}: ${e.message}`);
        return 'fallo';
    }
    apuntarHecho(destino, bytes);
    const seg = ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',');
    if (viejo) anotar(`  el anterior, a OLD/${path.basename(viejo)}`);
    anotar(`✓ ${corta(destino)} (${seg} s)`);
    avisar('PDF del CEE listo', `${nombre}\n${obraDe(destino)}`, destino);
    return 'hecho';
}

// ── cola: de uno en uno ─────────────────────────────────────────────────────
const temporizadores = new Map();
const intentos = new Map();
let cola = Promise.resolve();

function encolar(ruta) {
    cola = cola.then(async () => {
        try {
            const r = await hacer(ruta);
            if (r === 'incompleto') {
                const n = (intentos.get(ruta) || 0) + 1;
                intentos.set(ruta, n);
                if (n <= 6) programar(ruta, 5000);
                else { anotar(`✗ ${corta(ruta)}: el XML sigue a medias tras 30 s`); intentos.delete(ruta); }
            } else intentos.delete(ruta);
        } catch (e) {
            anotar(`✗ ${corta(ruta)}: ${e.message}`);
        }
    });
}

function programar(ruta, ms) {
    clearTimeout(temporizadores.get(ruta));
    temporizadores.set(ruta, setTimeout(() => { temporizadores.delete(ruta); encolar(ruta); }, ms));
}

/** Lo que no se vigila: OLD/, carpetas ocultas o temporales de Drive (`.tmp.drivedownload`). */
function ignorada(rel) {
    return rel.split(/[\\/]/).slice(0, -1).some((s) => /^old$/i.test(s) || s.startsWith('.') || s.startsWith('~'));
}

// ── vigilar ─────────────────────────────────────────────────────────────────
async function repasar(horas) {
    const desde = Date.now() - horas * 3600 * 1000;
    let n = 0;
    try {
        const todos = await fs.promises.readdir(RAIZ, { recursive: true });
        for (const rel of todos) {
            if (!/\.xml$/i.test(rel) || ignorada(rel)) continue;
            const ruta = path.join(RAIZ, rel);
            if (!enCarpetaDeCee(ruta)) continue;
            try { if (fs.statSync(ruta).mtimeMs < desde) continue; } catch { continue; }
            n++;
            encolar(ruta);
        }
    } catch (e) {
        anotar(`✗ no se ha podido repasar ${RAIZ}: ${e.message}`);
    }
    anotar(`Repaso de las últimas ${horas} h: ${n} XML para mirar.`);
}

/** Uno solo a la vez: un segundo arranque (otra sesión, doble clic) se va sin hacer nada. */
function unaSolaVez() {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.on('error', () => resolve(false));
        srv.listen('\\\\.\\pipe\\brokergy-pdf-del-xml', () => resolve(true));
    });
}

async function vigilar() {
    if (!(await unaSolaVez())) { console.log('Ya hay uno vigilando en este PC.'); process.exit(0); }
    if (!fs.existsSync(RAIZ)) throw new Error(`No existe ${RAIZ} (¿Google Drive para escritorio?)`);
    anotar(`Vigilando ${RAIZ}${EN_SECO ? ' (EN SECO)' : ''}`);
    fs.watch(RAIZ, { recursive: true }, (_evento, rel) => {
        if (!rel || !/\.xml$/i.test(rel) || ignorada(rel)) return;
        const ruta = path.join(RAIZ, rel);
        if (!enCarpetaDeCee(ruta)) return;
        programar(ruta, /_revisar/i.test(rel) ? ESPERA_REVISAR_MS : ESPERA_MS);
    }).on('error', (e) => { anotar(`✗ el vigilante se ha caído: ${e.message}`); process.exit(1); });
    const horas = Number(OPC.repasar) || 0;
    if (horas > 0) repasar(horas);
}

// ── una ruta suelta ─────────────────────────────────────────────────────────
async function deUna(rutas) {
    let fallos = 0;
    for (const r of rutas) {
        const abs = path.resolve(r);
        const xmls = fs.statSync(abs).isDirectory()
            ? fs.readdirSync(abs).filter((f) => /\.xml$/i.test(f)).map((f) => path.join(abs, f))
            : [abs];
        for (const x of xmls) {
            const res = await hacer(x, { forzar: !!OPC.forzar });
            if (res === 'fallo' || res === 'incompleto') fallos++;
            if (res === 'no-cee') console.log(`- ${path.basename(x)}: no es el XML de un certificado energético`);
            if (res === 'incompleto') anotar(`✗ ${corta(x)}: está a medias (no acaba en </DatosEnergeticosDelEdificio>)`);
        }
    }
    if (fallos) process.exit(1);
}

async function main() {
    const d = disponiblePdf();
    if (!d.ok) throw new Error(`No se puede: ${d.motivo}`);
    if (posicionales[0] === 'vigilar') return vigilar();
    if (!posicionales.length) throw new Error('Dime «vigilar» o un .xml / una carpeta');
    return deUna(posicionales);
}

if (require.main === module) {
    main().catch((e) => { anotar(`✗ ${e.message}`); process.exit(1); });
}

module.exports = { pdfAlDia, normal, ignorada, enCarpetaDeCee, escribirPdf };
