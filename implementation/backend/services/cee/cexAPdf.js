// ============================================================================
// cexAPdf.js — de un .cex al XML y al PDF OFICIAL del certificado, sin abrir
// CE3X: lo mismo que abrirlo y pulsar «Calificar», «Calcular medidas», «Generar
// XML» e «Informe».
//
//   const { calificarCex } = require('./cee/cexAPdf');
//   const r = await calificarCex(bufferOCaminoDelCex);
//   // r = { ok, xml, pdf, version, calificacion, medidas, avisos, error }
//
// Cómo:
//   1. El MOTOR DE CE3X 3.1, ejecutado sin ventana con su propio Python
//      (`cee-engine/tools/oraculo_ce3x`, script `cex_a_xml.py`), abre el .cex,
//      lo califica, calcula sus medidas de mejora y escribe el XML.
//   2. `xml2cert.exe` (el generador que trae CE3X 3.1) hace el PDF desde el XML.
//
// REGLA — SOLO EN UN PC CON CE3X 3.1 INSTALADO. En el VPS no hay CE3X: esto lo
// usan los scripts de las skills, que corren en el PC. Sin CE3X se devuelve
// `{ ok:false, noDisponible:true }` y quien llama sigue sin el PDF.
//
// REGLA — todo se hace en una carpeta TEMPORAL con nombres ASCII sin puntos.
// CE3X 3.1 no saca el PDF si la ruta lleva tildes o eñes (su subprocess de
// Python 2.7 no admite argumentos Unicode: «JOSÉ ÁNGEL» falla) y xml2cert no
// encuentra el XML si el nombre del .cex lleva puntos. Medido el 02/10/2026.
//
// REGLA — el motor sin ventana solo abre ficheros con un CE3X 3.1 ABIERTO en el
// equipo (sin él, `abreArchivoCEX` no hace nada y no dice nada). Si no lo está,
// se arranca OCULTO, se espera ~10 s y se cierra al terminar.
//
// REGLA — un .cex de la 2.3 NO se califica aquí: CE3X 3.1 lo abriría, lo
// migraría y escribiría un XML de la 3.1 que no corresponde al fichero. Se dice.
//
// REGLA — el .cex de origen NO se toca: se califica una COPIA. El XML y el PDF
// salen de lo que CE3X calcula, nunca de una cifra nuestra.
// ============================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CE3X_DIR = process.env.CE3X_DIR || 'C:\\Program Files (x86)\\CE3Xv3.1';
const CE3X_EXE = process.env.CE3X_EXE || 'ce3xv3.1.exe';
const ORACULO_DIR = path.resolve(__dirname, '..', '..', '..', 'cee-engine', 'tools', 'oraculo_ce3x');
const ESPERA_CE3X_MS = Number(process.env.CEX_A_PDF_ESPERA_MS) || 6 * 60 * 1000;
const ESPERA_PDF_MS = 2 * 60 * 1000;

/** El xml2cert.exe más reciente que trae CE3X (`moduloXML/xmlcert_AAAAMMDD`). */
function rutaXml2cert() {
    const base = path.join(CE3X_DIR, 'moduloXML');
    try {
        const dirs = fs.readdirSync(base).filter((d) => /^xmlcert_/i.test(d)).sort().reverse();
        for (const d of dirs) {
            const exe = path.join(base, d, 'xml2cert.exe');
            if (fs.existsSync(exe)) return exe;
        }
    } catch { /* sin CE3X */ }
    return null;
}

/** ¿Hay en este PC lo necesario? Devuelve el motivo si no. */
function disponible() {
    if (process.platform !== 'win32') return { ok: false, motivo: 'CE3X solo existe en Windows' };
    if (!fs.existsSync(path.join(CE3X_DIR, CE3X_EXE))) return { ok: false, motivo: `no está CE3X 3.1 en ${CE3X_DIR}` };
    if (!rutaXml2cert()) return { ok: false, motivo: 'no está el generador del PDF (moduloXML/xmlcert_*/xml2cert.exe)' };
    if (!fs.existsSync(path.join(ORACULO_DIR, 'ce3xpy.exe'))) return { ok: false, motivo: `falta ${path.join(ORACULO_DIR, 'ce3xpy.exe')}` };
    return { ok: true };
}

/** Versión de CE3X que declara el fichero (pickle 0): '3.1', '2.3' o null. */
function versionDelCex(buf) {
    const cab = buf.subarray(0, 400).toString('latin1');
    if (/CE3Xv3\.1/.test(cab)) return '3.1';
    if (/CEXv2\.3/.test(cab)) return '2.3';
    return null;
}

/** Una carpeta temporal cuya ruta sea ASCII (el usuario de Windows puede no serlo). */
function carpetaTemporal() {
    const nombre = `cex_a_pdf_${process.pid}_${Date.now().toString(36)}`;
    for (const base of [os.tmpdir(), 'C:\\Users\\Public\\Documents']) {
        // eslint-disable-next-line no-control-regex
        if (!/^[\x20-\x7e]+$/.test(base)) continue;
        try {
            const d = path.join(base, nombre);
            fs.mkdirSync(d, { recursive: true });
            return d;
        } catch { /* la siguiente */ }
    }
    throw new Error('no hay una carpeta temporal con la ruta sin tildes');
}

function ejecutar(exe, args, { cwd, env, plazoMs }) {
    return new Promise((resolve) => {
        const p = spawn(exe, args, { cwd, env, windowsHide: true });
        let salida = '';
        p.stdout?.on('data', (d) => { salida += d; });
        p.stderr?.on('data', (d) => { salida += d; });
        const t = setTimeout(() => { try { p.kill(); } catch { /* ya */ } resolve({ code: null, plazo: true, salida }); }, plazoMs);
        p.on('error', (e) => { clearTimeout(t); resolve({ code: null, error: e.message, salida }); });
        p.on('close', (code) => { clearTimeout(t); resolve({ code, salida }); });
    });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** ¿Hay un CE3X 3.1 abierto en el equipo? */
async function ce3xAbierto() {
    const r = await ejecutar('tasklist', ['/FI', `IMAGENAME eq ${CE3X_EXE}`, '/NH'], { plazoMs: 15000 });
    return new RegExp(CE3X_EXE.replace(/\./g, '\\.'), 'i').test(r.salida || '');
}

/** Arranca CE3X 3.1 sin ventana y le da tiempo a levantarse (≈10 s medidos). */
async function arrancarCe3xOculto() {
    const g = spawn(path.join(CE3X_DIR, CE3X_EXE), [], { cwd: CE3X_DIR, windowsHide: true, stdio: 'ignore' });
    g.on('error', () => { /* sin CE3X: lo dirá el intento */ });
    await esperar(Number(process.env.CEX_A_PDF_ARRANQUE_MS) || 10000);
    return g;
}

/** El script de Python envuelto como lo hace `run.sh` (Python 2.7 de CE3X). */
function envolver(script, out) {
    const cuerpo = fs.readFileSync(script, 'utf8').split(/\r?\n/).map((l) => `    ${l}`).join('\n');
    return [
        '# -*- coding: utf-8 -*-',
        'import sys, os',
        `OUT = open(r'${out}', 'w')`,
        'sys.stdout = OUT; sys.stderr = OUT',
        "CE = os.environ['CE3X_DIR']",
        `sys.frozen = 'windows_exe'; sys.executable = os.path.join(CE, '${CE3X_EXE}'); sys.argv = [sys.executable]`,
        "os.environ['MATPLOTLIBDATA'] = os.path.join(CE, 'mpl-data')",
        'try:', cuerpo,
        'except SystemExit: pass',
        'except BaseException:',
        '    import traceback; traceback.print_exc()',
        'OUT.close()', '',
    ].join('\n');
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);

/**
 * Ejecuta un script del oráculo (`cee-engine/tools/oraculo_ce3x/<script>`) con
 * el Python de CE3X, con un CE3X 3.1 abierto (arrancándolo oculto si no lo
 * está). Devuelve `{ s }` (el JSON que escribe el script) o `{ fallo }`.
 *
 * ⚠️ El motor sin ventana NO abre ningún .cex si no hay un CE3X 3.1 ABIERTO en
 * el equipo: `abreArchivoCEX` vuelve sin leer el fichero (medido el 02/10/2026:
 * funciona con CE3X abierto, falla al cerrarlo, también con los ejemplos
 * oficiales). Si no lo está, se arranca OCULTO y se cierra al terminar; si ya
 * estaba abierto, no se toca.
 */
async function correrOraculo(dir, script, envExtra) {
    const res = path.join(dir, 'resultado.json');
    const out = path.join(dir, 'ce3x.out');
    const wrapped = path.join(dir, `${path.basename(script, '.py')}.wrapped.py`);
    fs.writeFileSync(wrapped, envolver(path.join(ORACULO_DIR, script), out));
    const env = { ...process.env, CE3X_DIR, ORACULO_DIR, RESULTADO: res, ...envExtra };
    for (const k of Object.keys(env)) if (env[k] == null) delete env[k];

    const correr = async () => {
        try { fs.rmSync(res, { force: true }); } catch { /* no estaba */ }
        const r = await ejecutar(path.join(ORACULO_DIR, 'ce3xpy.exe'), [wrapped], { cwd: dir, env, plazoMs: ESPERA_CE3X_MS });
        if (r.plazo) return { fallo: `CE3X no ha terminado en ${Math.round(ESPERA_CE3X_MS / 1000)} s` };
        try { return { s: JSON.parse(fs.readFileSync(res, 'utf8')) }; } catch { /* abajo */ }
        const log = fs.existsSync(out) ? fs.readFileSync(out, 'latin1').slice(-1500) : (r.error || r.salida || '');
        return { fallo: `CE3X no ha devuelto resultado.\n${log}` };
    };
    let gui = null;
    let s = null;
    try {
        if (!(await ce3xAbierto())) gui = await arrancarCe3xOculto();
        for (let intento = 0; intento < 3; intento++) {
            const r = await correr();
            if (r.fallo) return r;
            s = r.s;
            if (s.error !== 'NO_ABRE') break;
            if (!gui && !(await ce3xAbierto())) gui = await arrancarCe3xOculto();
            await esperar(8000);
        }
    } finally {
        if (gui) { try { gui.kill(); } catch { /* ya cerrado */ } }
    }
    if (s.error === 'NO_ABRE') return { fallo: 'CE3X 3.1 no abre el fichero (ni con CE3X arrancado). Ábrelo en CE3X para ver por qué.' };
    return { s };
}

/** La calificación tal y como la devuelve `res.py`, en limpio. */
function calificacionDe(c) {
    return c && c._valido ? {
        emisiones: num(c.emisiones), emisiones_letra: c.emisiones_nota || null,
        epnr: num(c.enPrimNoRen), epnr_letra: c.enPrimNoRen_nota || null,
        demanda_cal: num(c.ddaBrutaCal), demanda_ref: num(c.ddaBrutaRef), demanda_acs: num(c.ddaBrutaACS),
    } : null;
}

/** El PDF oficial desde el XML (`xml2cert`), en la misma carpeta y con su nombre. */
async function pdfDesdeXml(xml, dir) {
    const r2 = await ejecutar(rutaXml2cert(), [xml, '-o', dir], { cwd: dir, env: process.env, plazoMs: ESPERA_PDF_MS });
    const pdfRuta = path.join(dir, `${path.basename(xml, '.xml')}.pdf`);
    if (!fs.existsSync(pdfRuta)) {
        return { error: `xml2cert no ha generado el PDF${r2.plazo ? ' (se ha pasado de tiempo)' : ''}: ${(r2.salida || r2.error || '').slice(-800)}` };
    }
    return { pdf: fs.readFileSync(pdfRuta) };
}

/** Los diálogos de CE3X que no dicen nada. */
const ruidoCe3x = (x) => x && !/^Dialog\.ShowModal: Dialog Opciones del Informe/.test(x);

/**
 * Califica un .cex y devuelve su XML y su PDF.
 * @param {Buffer|string} entrada  el .cex (bytes o ruta)
 * @param {{ medidas?: boolean, pdf?: boolean }} [opts]
 */
async function calificarCex(entrada, { medidas = true, pdf = true } = {}) {
    const disp = disponible();
    if (!disp.ok) return { ok: false, noDisponible: true, error: disp.motivo };

    const buf = Buffer.isBuffer(entrada) ? entrada : fs.readFileSync(entrada);
    const version = versionDelCex(buf);
    if (version === '2.3') {
        return { ok: false, version, error: 'el .cex es de CE3X 2.3: CE3X 3.1 lo migraría y el XML no sería el de ese fichero. Conviértelo antes (tools/convertir_cex.py) o califícalo en la 2.3.' };
    }

    const dir = carpetaTemporal();
    const cex = path.join(dir, 'cee.cex');
    const xml = path.join(dir, 'cee.xml');
    try {
        fs.writeFileSync(cex, buf);
        const r = await correrOraculo(dir, 'cex_a_xml.py', { CASO: cex, XML: xml, SIN_MEDIDAS: medidas ? null : '1' });
        if (r.fallo) return { ok: false, version, error: r.fallo };
        const s = r.s;
        if (s.error) return { ok: false, version, error: `CE3X ha fallado:\n${s.error}` };

        const c = s.calificacion || {};
        const calificacion = calificacionDe(c);
        const avisos = [...(s.abrir || []), ...((c._log) || []), ...(s.medidas_log || [])].filter(ruidoCe3x);
        if (!calificacion) {
            return { ok: false, version: s.version || version, avisos,
                     error: `CE3X no ha podido calificarlo${c._aviso ? `: ${c._aviso}` : ''}` };
        }
        if (!fs.existsSync(xml)) {
            //: Lo que dijo CE3X al pedirle el XML (sus diálogos): sin esto el
            //: fallo no se puede diagnosticar.
            const porQue = (s.xml || []).filter(Boolean).join(' · ');
            return { ok: false, version: s.version || version, calificacion, avisos,
                     medidas: s.medidas || [],
                     error: `CE3X no ha escrito el XML${porQue ? `: ${porQue}` : ''}` };
        }

        const resultado = {
            ok: true, version: s.version || version, calificacion, avisos,
            generales: s.generales || null,
            medidas: (s.medidas || []).map((m) => ({ nombre: m.nombre, ahorro: m.ahorro })),
            xml: fs.readFileSync(xml), pdf: null,
        };
        if (!pdf) return resultado;
        const p = await pdfDesdeXml(xml, dir);
        if (p.error) return { ...resultado, ok: false, error: p.error };
        resultado.pdf = p.pdf;
        return resultado;
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temporal */ }
    }
}

/**
 * RES080: mete el CEE PREVISTO en el INICIAL como su medida de mejora («Nuevo
 * Edificio Definido por el Usuario»), con sus textos, la calcula y devuelve el
 * inicial resultante con su XML y su PDF. Lo hace CE3X (oráculo
 * `medida_previsto.py`): lo mismo que «Cargar edificio» en Medidas de mejora.
 *
 * REGLA — fuera las medidas que traiga el inicial: la de un RES080 es el previsto
 * entero, no la aerotermia por un lado y las ventanas por otro.
 *
 * `textos` = { nombre, caracteristicas, otros, justificacion, inversion,
 * vida_util, coste_mantenimiento } (los tres últimos, su análisis económico).
 * Devuelve { ok, cex, xml, pdf, calificacion (la del inicial), medida: {nombre,
 * ahorro}, avisos, error }.
 */
async function ponerPrevistoComoMedida(inicial, previsto, textos = {}, { pdf = true } = {}) {
    const disp = disponible();
    if (!disp.ok) return { ok: false, noDisponible: true, error: disp.motivo };
    const bi = Buffer.isBuffer(inicial) ? inicial : fs.readFileSync(inicial);
    const bp = Buffer.isBuffer(previsto) ? previsto : fs.readFileSync(previsto);
    for (const [que, b] of [['inicial', bi], ['previsto', bp]]) {
        if (versionDelCex(b) !== '3.1') {
            return { ok: false, error: `el CEE ${que} no es de CE3X 3.1: la medida «Nuevo edificio» solo se pone con la 3.1` };
        }
    }

    const dir = carpetaTemporal();
    const ini = path.join(dir, 'inicial.cex');
    const prev = path.join(dir, 'previsto.cex');
    const salida = path.join(dir, 'inicial_medida.cex');
    const xml = path.join(dir, 'inicial_medida.xml');
    try {
        fs.writeFileSync(ini, bi);
        fs.writeFileSync(prev, bp);
        // Los textos en un JSON y no por el entorno: el Python 2 de CE3X lee el
        // entorno en la página de códigos de Windows y una tilde lo tumba.
        const ftextos = path.join(dir, 'textos.json');
        fs.writeFileSync(ftextos, JSON.stringify({
            nombre: textos.nombre || '', caracteristicas: textos.caracteristicas || '',
            otros: textos.otros || '', justificacion: textos.justificacion || '',
            inversion: textos.inversion ?? null, vida_util: textos.vida_util ?? null,
            coste_mantenimiento: textos.coste_mantenimiento ?? null,
        }), 'utf8');
        const r = await correrOraculo(dir, 'medida_previsto.py', {
            CASO: ini, PREVISTO: prev, SALIDA_CEX: salida, XML: xml, TEXTOS: ftextos,
        });
        if (r.fallo) return { ok: false, error: r.fallo };
        const s = r.s;
        if (s.error === 'NO_CALIFICA') return { ok: false, error: 'CE3X no califica el CEE inicial: ábrelo en CE3X para ver por qué.' };
        if (s.error === 'NO_CARGA_PREVISTO') return { ok: false, error: 'CE3X no ha cargado el previsto como medida («Cargar edificio»).' };
        if (s.error) return { ok: false, error: `CE3X ha fallado:\n${s.error}` };
        if (!fs.existsSync(salida)) return { ok: false, error: 'CE3X no ha guardado el inicial con la medida' };

        const medida = (s.medidas || [])[0] || null;
        const resultado = {
            ok: true, calificacion: calificacionDe(s.calificacion || {}),
            medida: medida ? { nombre: medida.nombre, ahorro: medida.ahorro } : null,
            avisos: (s.log || []).filter(ruidoCe3x),
            cex: fs.readFileSync(salida), xml: null, pdf: null,
        };
        if (!fs.existsSync(xml)) {
            const porQue = (s.xml || []).filter(Boolean).join(' · ');
            return { ...resultado, ok: false, error: `CE3X no ha escrito el XML${porQue ? `: ${porQue}` : ''}` };
        }
        resultado.xml = fs.readFileSync(xml);
        if (!pdf) return resultado;
        const p = await pdfDesdeXml(xml, dir);
        if (p.error) return { ...resultado, ok: false, error: p.error };
        resultado.pdf = p.pdf;
        return resultado;
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temporal */ }
    }
}

/** «D 32,12 kgCO2 · D 189,6 kWh EPNR» para los informes de los scripts. */
function textoCalificacion(c) {
    if (!c) return '—';
    const f = (v) => (v == null ? '?' : String(v).replace('.', ','));
    return `emisiones ${f(c.emisiones)} (${c.emisiones_letra || '?'}) · EPNR ${f(c.epnr)} (${c.epnr_letra || '?'})`
        + ` · demanda cal ${f(c.demanda_cal)}`;
}

/**
 * Lo que hacen las skills tras escribir el `.cex`: calificarlo y dejar su XML y
 * su PDF en Drive, al lado y con su mismo nombre. Sin CE3X en este PC no falla:
 * devuelve `noDisponible` y el `.cex` sigue donde está.
 */
async function calificarYGuardar(ctx, fase, nombreCex, buffer, { escribir = true, medidas = true } = {}) {
    const r = await calificarCex(buffer, { medidas });
    if (!escribir || (!r.xml && !r.pdf)) return r;
    const guardado = await require('../ceeEnvolventeCex')
        .guardarCalificadoEnDrive(ctx, fase, nombreCex, { xml: r.xml, pdf: r.pdf });
    return { ...r, guardado };
}

/**
 * Las líneas que imprimen los scripts. Con `esperado` (lo que CE3X calculó para
 * la medida del inicial, en el CEE final) dice si cuadra: es la comprobación que
 * antes se hacía a mano al calificarlo.
 */
function lineasCalificado(r, { esperado = null } = {}) {
    if (!r) return [];
    if (r.noDisponible) return [`· XML y PDF: no se generan en este equipo (${r.error}). Califícalo en CE3X o con scripts/cex_a_pdf.js en el PC.`];
    const out = [];
    if (r.calificacion) out.push(`CE3X lo califica: ${textoCalificacion(r.calificacion)}`);
    if (esperado && r.calificacion) {
        const d = (a, b) => (a == null || b == null ? null : Math.abs(Number(a) - Number(b)));
        const de = d(r.calificacion.emisiones, esperado.emisiones);
        const dp = d(r.calificacion.epnr, esperado.epnr);
        const igual = de != null && dp != null && de < 0.05 && dp < 0.05
            && r.calificacion.emisiones_letra === esperado.emisiones_letra
            && r.calificacion.epnr_letra === esperado.epnr_letra;
        out.push(igual ? '  ✓ coincide con lo que CE3X calculó para la medida del inicial'
            : `  ⚠ NO coincide con lo calculado para la medida del inicial (emisiones ${esperado.emisiones} ${esperado.emisiones_letra} · EPNR ${esperado.epnr} ${esperado.epnr_letra})`);
    }
    for (const m of r.medidas || []) out.push(`  medida «${m.nombre}» · ahorro ${(m.ahorro || []).join(' / ')}`);
    for (const a of r.avisos || []) out.push(`  ⚠ CE3X: ${String(a).split('\n')[0]}`);
    if (r.guardado?.ok) for (const s of r.guardado.subidos) out.push(`✓ ${s.nombre}${s.archivado ? ' (el anterior, a OLD)' : ''}\n  ${s.link}`);
    if (r.guardado && !r.guardado.ok) out.push(`✗ XML/PDF calificados pero no se han subido a Drive: ${r.guardado.error}`);
    if (!r.ok) out.push(`✗ ${r.error}`);
    return out;
}

module.exports = { calificarCex, calificarYGuardar, ponerPrevistoComoMedida, lineasCalificado, disponible, versionDelCex, textoCalificacion };
