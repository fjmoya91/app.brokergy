#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Skills de BROKERGY: UNA sola fuente (skills/ del repo) para Claude Code y Cowork.
//
// Las dos superficies cargan las skills de la CUENTA de claude.ai («Mis skills»), así que el
// repo se publica ahí y no hay una segunda copia en ninguna parte. Ver skills/README.md.
//
//   node scripts/skills.mjs estado               qué está al día y qué falta publicar
//   node scripts/skills.mjs empaquetar           .skill de las que NO están al día
//   node scripts/skills.mjs empaquetar --todas   .skill de todas
//   node scripts/skills.mjs empaquetar revisar-cee generar-cee-inicial
//   node scripts/skills.mjs importar <nombre> [--forzar]   trae al repo la versión de la cuenta
//
// «Instalada» = la copia que la app de escritorio sincroniza desde la cuenta en
// %APPDATA%/Claude/local-agent-mode-sessions/skills-plugin/*/*/skills/<nombre>. Es lo que de
// verdad ejecutan Code y Cowork, así que compararse con ella dice si lo publicado es lo del repo.
//
// ⚠ Node y no Python a propósito: la Python de la Microsoft Store VIRTUALIZA %APPDATA% y no ve
// esa carpeta (dice que no existe).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(RAIZ, 'skills');
const COMUN = path.join(SKILLS, '_comun');   // se inyecta como <skill>/comun/ en las que lo citan
const DIST = path.join(SKILLS, 'dist');      // .skill generados (dist/ está en .gitignore)
const TEXTO = new Set(['.md', '.py', '.js', '.mjs', '.json', '.txt', '.sql', '.yaml', '.yml']);
const EXCLUIR = new Set(['__pycache__', 'node_modules', '.DS_Store']);
// Límites de claude.ai para el frontmatter: si se pasan, la subida falla.
const MAX_NOMBRE = 64, MAX_DESCRIPCION = 1024;

// ── Leer una skill ────────────────────────────────────────────────────────────

export function frontmatter(texto) {
    const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    const campos = {};
    let clave = null;
    for (const linea of m[1].split(/\r?\n/)) {
        const mm = linea.match(/^([A-Za-z_-]+):\s*(.*)$/);
        if (mm) {
            clave = mm[1];
            const v = mm[2].trim();
            campos[clave] = ['>-', '>', '|', '|-'].includes(v) ? ''
                : /^'.*'$/.test(v) ? v.slice(1, -1).replace(/''/g, "'")       // YAML con comilla simple
                : /^".*"$/.test(v) ? v.slice(1, -1).replace(/\\"/g, '"')   // YAML con comilla doble
                : v;
        } else if (clave) {
            campos[clave] = `${campos[clave]} ${linea.trim()}`.trim();
        }
    }
    return campos;
}

function ficheros(dir) {
    const out = [];
    const recorrer = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (EXCLUIR.has(e.name) || e.name.endsWith('.pyc')) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) recorrer(p); else if (e.isFile()) out.push(p);
        }
    };
    if (fs.existsSync(dir)) recorrer(dir);
    return out.sort();
}

// El repo tiene CRLF (autocrlf) y la copia instalada no tiene por qué: se compara y se publica en LF.
const normalizar = (ruta, datos) =>
    TEXTO.has(path.extname(ruta).toLowerCase()) ? Buffer.from(datos.toString('binary').replace(/\r\n/g, '\n'), 'binary') : datos;

// claude.ai REESCRIBE la cabecera al guardar (la descripción en bloque `>-` pasa a una línea entre
// comillas simples). Para comparar se mira el CONTENIDO de la cabecera y el cuerpo, no el formato:
// si no, toda skill escrita en bloque saldría «distinta» recién publicada.
function canonSkillMd(buf) {
    const texto = buf.toString('utf8');
    const fm = frontmatter(texto);
    if (!fm) return buf;
    const cuerpo = texto.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const campos = Object.keys(fm).sort().map(k => [k, fm[k]]);
    return Buffer.from(JSON.stringify({ campos, cuerpo }), 'utf8');
}
const comparable = (archivos) => Object.fromEntries(Object.entries(archivos)
    .map(([k, v]) => [k, k === 'SKILL.md' ? canonSkillMd(v) : v]));

const rel = (base, f) => path.relative(base, f).split(path.sep).join('/');

/** { ruta relativa: Buffer } de lo que se PUBLICA: la carpeta + skills/_comun/ si la cita. */
function contenido(dirSkill) {
    const out = {};
    for (const f of ficheros(dirSkill)) out[rel(dirSkill, f)] = normalizar(f, fs.readFileSync(f));
    const md = out['SKILL.md']?.toString('utf8') || '';
    if (md.includes('comun/')) {
        for (const f of ficheros(COMUN)) out[`comun/${rel(COMUN, f)}`] = normalizar(f, fs.readFileSync(f));
    }
    return out;
}

function contenidoInstalado(dir) {
    const out = {};
    for (const f of ficheros(dir)) out[rel(dir, f)] = normalizar(f, fs.readFileSync(f));
    return out;
}

function huella(archivos) {
    const h = crypto.createHash('sha256');
    for (const k of Object.keys(archivos).sort()) {
        h.update(k + '\0');
        h.update(crypto.createHash('sha256').update(archivos[k]).digest());
    }
    return h.digest('hex').slice(0, 12);
}

/** Errores que harían fallar la subida (vacío = vale). */
function validar(dirSkill) {
    const mdPath = path.join(dirSkill, 'SKILL.md');
    if (!fs.existsSync(mdPath)) return ['no tiene SKILL.md'];
    const md = fs.readFileSync(mdPath, 'utf8');
    const fm = frontmatter(md);
    if (!fm) return ['SKILL.md sin frontmatter (--- name / description ---)'];
    const errores = [];
    const nombre = fm.name || '', desc = fm.description || '';
    if (nombre !== path.basename(dirSkill)) errores.push(`name '${nombre}' no coincide con la carpeta '${path.basename(dirSkill)}'`);
    if (!/^[a-z0-9-]+$/.test(nombre) || nombre.length > MAX_NOMBRE) errores.push(`name inválido (minúsculas, cifras y guiones, ≤${MAX_NOMBRE})`);
    if (!desc) errores.push('sin description');
    else if (desc.length > MAX_DESCRIPCION) errores.push(`description de ${desc.length} caracteres (máximo ${MAX_DESCRIPCION})`);
    for (const ref of new Set([...md.matchAll(/comun\/([A-Za-z0-9_.-]+\.md)/g)].map(m => m[1]))) {
        if (!fs.existsSync(path.join(COMUN, ref))) errores.push(`cita comun/${ref}, que no existe en skills/_comun/`);
    }
    return errores;
}

const skillsRepo = () => fs.readdirSync(SKILLS, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.') && e.name !== 'dist')
    .map(e => e.name).sort();

// ── Lo instalado en la cuenta ─────────────────────────────────────────────────

function carpetasInstaladas() {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const base = path.join(appdata, 'Claude', 'local-agent-mode-sessions', 'skills-plugin');
    const res = [];
    if (!fs.existsSync(base)) return res;
    for (const a of fs.readdirSync(base)) for (const b of fs.readdirSync(path.join(base, a)).filter(x => !x.startsWith('.'))) {
        const m = path.join(base, a, b, 'manifest.json');
        try { res.push({ dir: path.join(base, a, b, 'skills'), manifest: JSON.parse(fs.readFileSync(m, 'utf8')) }); } catch { /* no es una cuenta */ }
    }
    return res;
}

/** { nombre: { dir, updatedAt } } de las skills SUBIDAS POR EL USUARIO (no las de Anthropic). */
function instaladas() {
    const out = {};
    for (const { dir, manifest } of carpetasInstaladas()) {
        for (const s of manifest.skills || []) {
            if (s.creatorType !== 'user') continue;
            const d = path.join(dir, s.name);
            if (fs.existsSync(d)) out[s.name] = { dir: d, updatedAt: (s.updatedAt || '').slice(0, 16).replace('T', ' '), ts: Date.parse(s.updatedAt || '') || 0 };
        }
    }
    return out;
}

// ── ZIP con carpetas (DEFLATE), sin dependencias ──────────────────────────────

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = (c >>> 8) ^ CRC[(c ^ b[i]) & 0xFF]; return (c ^ -1) >>> 0; };

function crearZip(items) {   // items: [{ name: 'a/b.md', data: Buffer }]
    const partes = [], central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const it of items) {
        const nombre = Buffer.from(it.name, 'utf8');
        const comp = zlib.deflateRawSync(it.data);
        const crc = crc32(it.data);
        const loc = Buffer.alloc(30);
        loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(8, 8);
        loc.writeUInt16LE(time, 10); loc.writeUInt16LE(fecha, 12); loc.writeUInt32LE(crc, 14);
        loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(it.data.length, 22); loc.writeUInt16LE(nombre.length, 26);
        partes.push(loc, nombre, comp);
        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
        cd.writeUInt16LE(8, 10); cd.writeUInt16LE(time, 12); cd.writeUInt16LE(fecha, 14); cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(it.data.length, 24); cd.writeUInt16LE(nombre.length, 28);
        cd.writeUInt32LE(offset, 42);
        central.push(cd, nombre);
        offset += 30 + nombre.length + comp.length;
    }
    const cdBuf = Buffer.concat(central);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(items.length, 8); fin.writeUInt16LE(items.length, 10);
    fin.writeUInt32LE(cdBuf.length, 12); fin.writeUInt32LE(offset, 16);
    return Buffer.concat([...partes, cdBuf, fin]);
}

// ── Órdenes ───────────────────────────────────────────────────────────────────

function calcularEstado() {
    const inst = instaladas();
    const filas = skillsRepo().map((n) => {
        const errores = validar(path.join(SKILLS, n));
        const local = comparable(contenido(path.join(SKILLS, n)));
        if (!inst[n]) return { n, estado: 'NO PUBLICADA', detalle: '', errores };
        const remoto = comparable(contenidoInstalado(inst[n].dir));
        if (huella(local) === huella(remoto)) return { n, estado: 'AL DÍA', detalle: `(cuenta: ${inst[n].updatedAt})`, errores };
        const cambian = [...new Set([...Object.keys(local), ...Object.keys(remoto)])].sort()
            .filter(k => !local[k] || !remoto[k] || !local[k].equals(remoto[k]));
        // ¿Quién es más nuevo? Si la cuenta se actualizó después del último cambio en el repo, se
        // editó allí (Cowork / skill-creator) y lo que toca es IMPORTAR, no publicar encima.
        const mtimeRepo = Math.max(...ficheros(path.join(SKILLS, n)).map(f => fs.statSync(f).mtimeMs));
        const cuentaMasNueva = inst[n].ts > mtimeRepo;
        const lista = `${cambian.slice(0, 4).join(', ')}${cambian.length > 4 ? ' …' : ''}`;
        return cuentaMasNueva
            ? { n, estado: 'CUENTA + NUEVA', detalle: `difiere: ${lista} → node scripts/skills.mjs importar ${n}`, errores }
            : { n, estado: 'DESACTUALIZADA', detalle: `difiere: ${lista}`, errores };
    });
    const enRepo = new Set(skillsRepo());
    return { filas, huerfanas: Object.keys(inst).filter(n => !enRepo.has(n)).sort(), hayCuenta: carpetasInstaladas().length > 0 };
}

function estado() {
    const { filas, huerfanas, hayCuenta } = calcularEstado();
    if (!hayCuenta) console.log('⚠ No encuentro la copia sincronizada de la cuenta (¿sin la app de escritorio de Claude en este PC?). Solo valido.\n');
    const ancho = Math.max(...filas.map(f => f.n.length));
    const marca = { 'AL DÍA': '✓', DESACTUALIZADA: '↑', 'NO PUBLICADA': '+', 'CUENTA + NUEVA': '↓' };
    for (const f of filas) {
        console.log(`  ${marca[f.estado]} ${f.n.padEnd(ancho)}  ${f.estado.padEnd(14)} ${f.detalle}`);
        for (const e of f.errores) console.log(`      ✗ ${e}`);
    }
    if (huerfanas.length) {
        console.log('\n  En la cuenta pero NO en el repo (tráelas con `importar`, o bórralas de la cuenta):');
        for (const h of huerfanas) console.log(`    ? ${h}`);
    }
    const pendientes = filas.filter(f => f.estado === 'DESACTUALIZADA' || f.estado === 'NO PUBLICADA');
    const traer = filas.filter(f => f.estado === 'CUENTA + NUEVA');
    if (traer.length) console.log(`
↓ Editadas en la cuenta después que en el repo: ${traer.map(f => f.n).join(', ')}. Impórtalas ANTES de publicar nada encima.`);
    console.log('');
    if (pendientes.length) console.log(`Por publicar: ${pendientes.length}. → node scripts/skills.mjs empaquetar`);
    else if (!traer.length) console.log('Todo publicado: Code y Cowork ejecutan exactamente lo que hay en skills/.');
    return filas.some(f => f.errores.length) ? 1 : 0;
}

function empaquetar(args) {
    const todas = args.includes('--todas');
    const nombres = args.filter(a => !a.startsWith('--'));
    const { filas } = calcularEstado();
    const por = Object.fromEntries(filas.map(f => [f.n, f]));
    const raras = nombres.filter(n => !por[n]);
    if (raras.length) { console.log(`✗ No están en skills/: ${raras.join(', ')}`); return 1; }
    const elegidas = nombres.length ? nombres : todas ? Object.keys(por)
        : filas.filter(f => f.estado === 'DESACTUALIZADA' || f.estado === 'NO PUBLICADA').map(f => f.n);
    const pisaria = elegidas.filter(n => por[n].estado === 'CUENTA + NUEVA');
    if (pisaria.length && !args.includes('--pisar')) {
        console.log(`✗ ${pisaria.join(', ')}: la cuenta tiene una versión MÁS NUEVA que el repo. Impórtala primero (o --pisar).`);
        return 1;
    }
    if (!elegidas.length) { console.log('Nada que empaquetar: todo está al día. (--todas para forzar)'); return 0; }
    fs.mkdirSync(DIST, { recursive: true });
    let fallos = 0;
    for (const n of elegidas) {
        const errores = validar(path.join(SKILLS, n));
        if (errores.length) { fallos++; console.log(`✗ ${n}: ${errores.join('; ')}`); continue; }
        const items = Object.entries(contenido(path.join(SKILLS, n))).map(([k, data]) => ({ name: `${n}/${k}`, data }));
        const destino = path.join(DIST, `${n}.skill`);   // la carpeta de la skill es la raíz del zip
        fs.writeFileSync(destino, crearZip(items));
        console.log(`✓ ${rel(RAIZ, destino)}  (${por[n].estado}, ${items.length} ficheros)`);
    }
    if (fallos) return 1;
    console.log('\nPublicar: abre cada .skill y pulsa «Guardar skill» (o claude.ai → Ajustes → Capacidades → Skills → subir).');
    console.log('Mismo nombre = sustituye a la anterior. Después: node scripts/skills.mjs estado');
    return 0;
}

function importar(args) {
    const n = args.find(a => !a.startsWith('--'));
    const forzar = args.includes('--forzar');
    const inst = instaladas();
    if (!n || !inst[n]) { console.log(`✗ '${n || ''}' no está instalada en la cuenta.`); return 1; }
    const destino = path.join(SKILLS, n);
    if (fs.existsSync(destino) && !forzar) {
        if (huella(comparable(contenido(destino))) === huella(comparable(contenidoInstalado(inst[n].dir)))) { console.log(`'${n}' ya es idéntica a la de la cuenta.`); return 0; }
        console.log(`⚠ skills/${n} existe y es distinta. Repite con --forzar para sustituirla y revisa el diff con git.`);
        return 1;
    }
    fs.rmSync(destino, { recursive: true, force: true });
    fs.cpSync(inst[n].dir, destino, { recursive: true });
    // comun/ lo pone el empaquetador: no se guarda dentro de la skill.
    if (fs.existsSync(path.join(destino, 'comun'))) { fs.rmSync(path.join(destino, 'comun'), { recursive: true }); console.log('  (quitado comun/: vive en skills/_comun/)'); }
    console.log(`✓ skills/${n} ← cuenta (${inst[n].updatedAt}). Revisa el diff con git antes de commitear:`
        + ' el repo es PÚBLICO (nada de DNI, IBAN, teléfonos ni claves).');
    return 0;
}

const [orden = 'estado', ...resto] = process.argv.slice(2);
const ordenes = { estado, empaquetar, importar };
if (!ordenes[orden]) { console.log(`Orden desconocida: ${orden}. Usa: estado | empaquetar | importar`); process.exit(1); }
process.exit(ordenes[orden](resto));
