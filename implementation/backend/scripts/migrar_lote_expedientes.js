#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN EN LOTE de expedientes antiguos (Drive sincronizado en local) → app.
 * Reutiliza EXACTAMENTE la rutina de migración existente:
 *   services/expedienteService.migrateExpedienteFromXml  (origen 'migracion_xml')
 *
 * IDEMPOTENTE y SIN PERDER INFORMACIÓN:
 *   - Si NO existe expedientes.numero_expediente → crea vía la rutina.
 *   - Si YA existe → unifica rellenando SOLO campos vacíos ("lo existente gana"),
 *     nunca sobrescribe, nunca borra claves, nunca toca drive_folder_id /
 *     datos_calculo.result / documentacion / seguimiento.estado_relleno.
 *
 * USO:
 *   node scripts/migrar_lote_expedientes.js                  # dry-run (NO escribe)
 *   node scripts/migrar_lote_expedientes.js --execute        # escribe de verdad
 *   node scripts/migrar_lote_expedientes.js --limit 2        # solo N expedientes
 *   node scripts/migrar_lote_expedientes.js --filter EMILIO  # subset por substring (ruta/nombre)
 *   node scripts/migrar_lote_expedientes.js --placeholders skip|namekey  # _XX / _00 (def: skip)
 *   node scripts/migrar_lote_expedientes.js --no-drive       # crear sin carpeta Drive
 *   node scripts/migrar_lote_expedientes.js --sleep 4000     # ms entre creaciones (rate-limit)
 *   node scripts/migrar_lote_expedientes.js --verbose        # detalle por expediente
 *
 * Salida: CSV migracion_lote_YYYYMMDD.csv en este directorio + resumen por consola.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const xml2js = require('xml2js');
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');

// ───────────────────────── CLI ─────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, def) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };

const OPTS = {
  execute: has('--execute'),
  limit: parseInt(val('--limit', '0'), 10) || Infinity,
  filter: val('--filter', null),
  path: val('--path', null),                     // migrar UNA carpeta concreta por ruta absoluta
  copiarOrigen: has('--copiar-origen'),          // copia TODO el contenido Drive de la carpeta origen → nueva
  placeholders: val('--placeholders', 'skip'),   // 'skip' | 'create' (crea con autonúmero)
  ficha: val('--ficha', null),                   // fuerza la ficha: RES060 | RES080 | RES093
  drive: !has('--no-drive'),
  sleep: parseInt(val('--sleep', '4000'), 10),
  verbose: has('--verbose') || (parseInt(val('--limit', '0'), 10) > 0 && parseInt(val('--limit', '0'), 10) <= 5),
};

const PROD = process.env.MIGRACION_PROD_PATH ||
  'C:\\Users\\Usuario\\Mi unidad\\01. RD 36-2023 (CAES)\\05. PRODUCCIÓN';

// Carpetas de estado a recorrer (ficha, subcarpeta de estado)
const STATE_DIRS = [
  ['RES060', '2. ACEPTADO'],
  ['RES060', '3. EN CURSO'],
  ['RES060', '4. DOC. COMPLETA'],
  ['RES060', '5. REVISADO  LISTOS PARA VERIFICAR'],
  ['RES060', '6. ENVIADOS VERIFICAR'],
  ['RES080', '01. EN CURSO'],
  ['RES080', '02. PARA TERMINAR BROKERGY'],
  ['RES080', '03. DOC COMPLETA'],
  ['RES080', '03. ENVIADOS A VERIFICAR'],
];

// ───────────────────────── utilidades ─────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (s) => String(s || '')
  .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Tokens significativos de un nombre (quita partículas, vías y tokens de 1 letra)
const STOP = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'SAN', 'SANTA',
  'CL', 'CALLE', 'AV', 'AVDA', 'AVENIDA', 'PLAZA', 'PZA', 'TRAVESIA', 'TVA',
  'CTRA', 'CARRETERA', 'PASEO', 'PJE', 'Nº', 'NUM']);
const tokens = (s) => norm(s).split(' ').filter((t) => t && t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));

// Patrón de carpeta de expediente: NN(N)RES0NN_<num|XX>  -  NOMBRE
const EXP_RE = /^(\d{2,3})RES0(\d{2})_([0-9]+|[Xx]+)\s*-?\s*(.*)$/;

function isExpedienteFolder(name) {
  if (!EXP_RE.test(name)) return false;
  if (/EXPEDIENTE\s+CAE/i.test(name)) return false; // subcarpeta plantilla interna
  return true;
}

// Parsea el nombre de carpeta → metadatos del expediente
function parseFolderName(name) {
  const m = name.match(EXP_RE);
  if (!m) return null;
  let [, year, fichaNum, numToken, rest] = m;
  const flags = [];
  // normalizar año a 2 dígitos
  let yy = year;
  if (year.length !== 2) { yy = year.slice(-2); flags.push(`anomalia_anio(${year})`); }
  const ficha = `RES0${fichaNum}`;
  const isPlaceholder = /^[Xx]+$/.test(numToken) || /^0+$/.test(numToken);
  let numero_expediente = null;
  if (!isPlaceholder) {
    const n = parseInt(numToken, 10);
    if (String(n) !== numToken) flags.push(`anomalia_num(${numToken})`);
    numero_expediente = `${yy}${ficha}_${n}`;
  }
  // nombre cliente: quitar paréntesis final (suele ser el instalador) y limpiar
  let cliente = rest.replace(/\([^)]*\)\s*$/, '').trim();
  if (!cliente) { cliente = rest.trim(); flags.push('cliente_solo_instalador'); }
  if (/^(C|CL|CALLE|AV|AVDA|PLAZA|PZA|TRAVESIA|TVA|CTRA|PASEO|PJE)\b/i.test(cliente) || /\b\d{1,4}\b/.test(cliente.split(' ')[0])) {
    flags.push('cliente_parece_direccion');
  }
  return { ficha, fichaNum, yy, numToken, isPlaceholder, numero_expediente, cliente, flags };
}

// ───────────────────────── parser CEE (port Node de parseCeeXml) ─────────────────────────
function mapVectorEnergetico(v) {
  if (!v) return null;
  const map = {
    GasoleoC: 'Gasoleo Calefacción', GasNatural: 'Gas Natural',
    ElectricidadPeninsular: 'Electricidad peninsular', ElectricidadBaleares: 'Electricidad peninsular',
    ElectricidadCanarias: 'Electricidad peninsular', ElectricidadCeutaMelilla: 'Electricidad peninsular',
    Butano: 'GLP', Propano: 'GLP', BiomasaPellete: 'Biomasa densificada (pelets)',
    BiomasaOtros: 'Biomasa no densificada', Carbon: 'Carbón',
    Gasoil: 'Gasoleo Calefacción', Diesel: 'Gasoleo Calefacción',
  };
  return map[v] || v;
}

function parseDateFlexible(str) {
  if (!str) return null;
  const s = String(str).trim();
  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = s.split(/[\/\-.]/);
  if (parts.length !== 3) return null;
  let [d, m, y] = parts;
  const fullYear = y.length === 4 ? y : y.length === 2 ? `20${y}` : null;
  if (!fullYear || !d || !m) return null;
  return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const textOf = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'object' && typeof node._ === 'string') return node._.trim();
  return '';
};

// Busca el primer nodo cuyo tag (case-insensitive) coincida; mira hijos directos antes de recursar
function findNode(obj, tagLower) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of Object.keys(obj)) {
    if (k === '$' || k === '_') continue;
    if (k.toLowerCase() === tagLower) {
      const v = obj[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  for (const k of Object.keys(obj)) {
    if (k === '$' || k === '_') continue;
    const v = obj[k];
    const arr = Array.isArray(v) ? v : [v];
    for (const c of arr) {
      if (c && typeof c === 'object') {
        const f = findNode(c, tagLower);
        if (f !== null && f !== undefined) return f;
      }
    }
  }
  return null;
}

function getNum(parent, tag) {
  const n = findNode(parent, tag.toLowerCase());
  const t = textOf(n).replace(',', '.');
  if (!t) return null;
  const v = parseFloat(t);
  if (isNaN(v) || v >= 9999999) return null; // placeholders 99999999.99
  return v;
}

async function parseCeeXmlNode(xmlString) {
  const root = await xml2js.parseStringPromise(xmlString, { explicitArray: false, trim: true });
  const result = {
    demandaCalefaccion: null, demandaACS: null, demandaRefrigeracion: null, demandaGlobal: null,
    emisionesCalefaccion: null, emisionesACS: null, emisionesRefrigeracion: null,
    superficieHabitable: null, anoConstruccion: null, zonaClimatica: null,
    identificacion: null, fechaFirma: null, fechaVisita: null,
    combustibleCalefaccion: null, combustibleACS: null,
  };

  const edificio = findNode(root, 'edificioobjeto');
  if (edificio) {
    result.demandaCalefaccion = getNum(edificio, 'Calefaccion');
    result.demandaACS = getNum(edificio, 'ACS');
    result.demandaRefrigeracion = getNum(edificio, 'Refrigeracion');
    result.demandaGlobal = getNum(edificio, 'Global');
  }

  const emis = findNode(root, 'emisionesco2');
  if (emis) {
    result.emisionesCalefaccion = getNum(emis, 'Calefaccion');
    result.emisionesACS = getNum(emis, 'ACS');
    result.emisionesRefrigeracion = getNum(emis, 'Refrigeracion');
  }

  const sup = getNum(root, 'SuperficieHabitable');
  if (sup != null && sup > 0 && sup < 99999) result.superficieHabitable = sup;

  const ano = textOf(findNode(root, 'anoconstruccion'));
  if (ano) result.anoConstruccion = ano;

  const zona = textOf(findNode(root, 'zonaclimatica'));
  if (zona) result.zonaClimatica = zona;

  // IdentificacionEdificio (Direccion/Municipio/Provincia/RC SON los del edificio, no el certificador)
  const idNode = findNode(root, 'identificacionedificio');
  if (idNode) {
    result.identificacion = {
      nombre: textOf(findNode(idNode, 'nombredeledificio')) || null,
      direccion: textOf(findNode(idNode, 'direccion')) || null,
      municipio: textOf(findNode(idNode, 'municipio')) || null,
      provincia: textOf(findNode(idNode, 'provincia')) || null,
      refCatastral: textOf(findNode(idNode, 'referenciacatastral')) || null,
    };
  }

  const f = textOf(findNode(root, 'fecha'));
  if (f) result.fechaFirma = parseDateFlexible(f);
  const fv = textOf(findNode(root, 'fechavisita'));
  if (fv) result.fechaVisita = parseDateFlexible(fv);

  const thermal = findNode(root, 'instalacionestermicas');
  if (thermal) {
    const cal = findNode(thermal, 'generadoresdecalefaccion');
    if (cal) { const v = textOf(findNode(cal, 'vectorenergetico')); if (v) result.combustibleCalefaccion = mapVectorEnergetico(v); }
    const acs = findNode(thermal, 'instalacionesacs');
    if (acs) { const v = textOf(findNode(acs, 'vectorenergetico')); if (v) result.combustibleACS = mapVectorEnergetico(v); }
  }

  return result;
}

// ───────────────────────── localización de XML dentro del expediente ─────────────────────────
function listDirSafe(d) { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } }

// Busca el .xml de CEE inicial/final dentro de "1. CEE".
// OJO: los .cex NO son XML (son pickle de Python "S'CEXv2.3 Residencial'…") → NO se usan.
function locateCeeXml(expDir, kind /* 'INICIAL' | 'FINAL' */) {
  const ceeRoot = path.join(expDir, '1. CEE');
  const candidates = [];
  const collect = (dir) => {
    for (const e of listDirSafe(dir)) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) collect(full);
      else if (/\.xml$/i.test(e.name)) candidates.push(full);
    }
  };
  if (fs.existsSync(ceeRoot)) collect(ceeRoot);
  // fallback: raíz del expediente
  for (const e of listDirSafe(expDir)) {
    if (!e.isDirectory() && /\.xml$/i.test(e.name)) candidates.push(path.join(expDir, e.name));
  }
  const kindRe = kind === 'INICIAL'
    ? /(INICIAL|ESTADO\s*PREVIO|PREVIO)/i
    : /(FINAL|PREVIST|PROYECTO|REFORMADO)/i;
  // 1) .xml que contenga la palabra clave de su tipo
  let pick = candidates.find((c) => kindRe.test(path.basename(c)));
  // 2) si solo hay un único .xml y buscamos INICIAL, úsalo (muchos expedientes solo tienen el inicial)
  if (!pick && kind === 'INICIAL' && candidates.length === 1) pick = candidates[0];
  return pick || null;
}

// ───────────────────────── descubrimiento de expedientes ─────────────────────────
function discover() {
  const expedientes = [];
  const noReconocidas = [];
  for (const [ficha, estado] of STATE_DIRS) {
    const stateAbs = path.join(PROD, ficha, estado);
    if (!fs.existsSync(stateAbs)) { console.warn(`!! No existe carpeta de estado: ${ficha}/${estado}`); continue; }
    // DFS con prune al encontrar un expediente
    const stack = [{ dir: stateAbs, depth: 0 }];
    while (stack.length) {
      const { dir, depth } = stack.pop();
      for (const e of listDirSafe(dir)) {
        if (!e.isDirectory()) continue;
        const full = path.join(dir, e.name);
        if (isExpedienteFolder(e.name)) {
          const rel = path.relative(path.join(PROD, ficha), full); // estado + anidamiento + nombre
          const estadoOrigen = path.dirname(rel) === '.' ? estado : `${path.dirname(rel)}`;
          expedientes.push({
            ficha, estado, full, name: e.name,
            carpeta_origen: path.relative(PROD, full),
            estado_origen: estadoOrigen.replace(/\\/g, '/'),
          });
          // prune: no descender
        } else if (depth < 5) {
          stack.push({ dir: full, depth: depth + 1 });
        }
      }
    }
  }
  // no reconocidas = hijos directos de carpetas de estado que no son expedientes ni contienen expedientes
  for (const [ficha, estado] of STATE_DIRS) {
    const stateAbs = path.join(PROD, ficha, estado);
    for (const e of listDirSafe(stateAbs)) {
      if (!e.isDirectory()) continue;
      if (isExpedienteFolder(e.name)) continue;
      const childAbs = path.join(stateAbs, e.name);
      const tieneExp = expedientes.some((x) => x.full.startsWith(childAbs + path.sep));
      if (!tieneExp) noReconocidas.push(`${ficha}/${estado}/${e.name}`);
    }
  }
  return { expedientes, noReconocidas };
}

// ── Copia de contenido Drive→Drive (para --copiar-origen) ──
// Resuelve el ID de la carpeta de Drive a partir de la ruta local bajo "Mi unidad".
async function resolveDriveFolderIdFromLocalPath(localAbs) {
  const slash = String(localAbs).replace(/\\/g, '/');
  const i = slash.toLowerCase().indexOf('mi unidad/');
  if (i < 0) throw new Error('La ruta no está bajo "Mi unidad": ' + localAbs);
  const segs = slash.slice(i + 'mi unidad/'.length).replace(/\/+$/, '').split('/').filter(Boolean);
  let parent = 'root';
  for (const seg of segs) {
    const id = await driveService.findSubfolderByName(parent, seg);
    if (!id) throw new Error(`No encuentro en Drive la subcarpeta "${seg}"`);
    parent = id;
  }
  return parent;
}

// Copia recursiva FUSIONANDO por nombre: subcarpetas con mismo nombre se reutilizan
// (no duplica la plantilla); ficheros ya presentes por nombre se saltan (idempotente).
async function mergeCopyDrive(sourceId, targetId) {
  const items = await driveService.listFiles(sourceId);
  const existentes = new Set((await driveService.listFiles(targetId)).map((f) => f.name));
  let files = 0, folders = 0;
  for (const it of items) {
    if (it.mimeType === 'application/vnd.google-apps.folder') {
      const sub = await driveService.getOrCreateSubfolder(targetId, it.name);
      folders++;
      const r = await mergeCopyDrive(it.id, sub);
      files += r.files; folders += r.folders;
    } else if (!existentes.has(it.name)) {
      const r = await driveService.copyFile(it.id, targetId, it.name);
      if (r) files++;
    }
  }
  return { files, folders };
}

async function getOpDriveFolderId(opId) {
  const { data } = await supabase.from('oportunidades').select('datos_calculo').eq('id', opId).maybeSingle();
  return data?.datos_calculo?.drive_folder_id || null;
}

// Construye una entrada de expediente desde una ruta absoluta (modo --path), sin discovery.
function buildExpFromPath(abs) {
  const name = path.basename(abs);
  const rel = path.relative(PROD, abs);
  const parts = rel.split(path.sep);
  const ficha = parts[0] || '';                     // RES060 / RES080
  const estadoOrigen = parts.slice(1, -1).join('/'); // p.ej. "8. REQUERIMIENTO"
  return { ficha, estado: estadoOrigen, full: abs, name, carpeta_origen: rel, estado_origen: estadoOrigen };
}

// ───────────────────────── clientes (match por nombre normalizado) ─────────────────────────
let _clientesCache = null;
async function getClientes() {
  if (_clientesCache) return _clientesCache;
  const all = [];
  let from = 0; const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('clientes')
      .select('id_cliente, nombre_razon_social, apellidos, dni')
      .range(from, from + page - 1);
    if (error) throw new Error('Error leyendo clientes: ' + error.message);
    all.push(...(data || []));
    if (!data || data.length < page) break;
    from += page;
  }
  _clientesCache = all.map((c) => {
    const full = `${c.nombre_razon_social || ''} ${c.apellidos || ''}`;
    return { ...c, _norm: norm(full), _tokset: new Set(tokens(full)), _label: norm(full) };
  });
  return _clientesCache;
}

// Match por nombre de carpeta (corto/apodo) contra clientes (nombre+apellidos completos):
//   1) coincidencia exacta normalizada
//   2) SUBCONJUNTO de tokens: todos los tokens de la carpeta (≥2) están en el cliente
//      → único=match, varios=ambiguo. Evita duplicar a quien ya está con DNI.
async function matchCliente(nombre) {
  const target = norm(nombre);
  if (!target) return { status: 'vacio', matches: [] };
  const clientes = await getClientes();

  const exact = clientes.filter((c) => c._norm === target);
  if (exact.length === 1) return { status: 'unico', exact: true, cliente_id: exact[0].id_cliente, matches: exact };
  if (exact.length > 1) return { status: 'ambiguo', matches: exact };

  const ftoks = tokens(nombre);
  if (ftoks.length >= 2) {
    const sub = clientes.filter((c) => c._tokset.size && ftoks.every((t) => c._tokset.has(t)));
    if (sub.length === 1) return { status: 'unico', exact: false, cliente_id: sub[0].id_cliente, matches: sub };
    if (sub.length > 1) return { status: 'ambiguo', matches: sub };
  }
  return { status: 'nuevo', matches: [] };
}

// ───────────────────────── idempotencia: por nº y por referencia catastral ─────────────────────────
const rcNorm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
let _rcMap = null; // rc(20) -> numero_expediente que ya la tiene
async function loadRcMap() {
  if (_rcMap) return _rcMap;
  _rcMap = new Map();
  let from = 0; const page = 1000;
  for (;;) {
    const { data, error } = await supabase.from('expedientes').select('numero_expediente, instalacion, cee').range(from, from + page - 1);
    if (error) throw new Error('Error leyendo RCs existentes: ' + error.message);
    for (const e of (data || [])) {
      const rc = rcNorm(e.instalacion?.ref_catastral || e.cee?.cee_inicial?.identificacion?.refCatastral || e.cee?.cee_final?.identificacion?.refCatastral || '');
      if (rc.length >= 14 && !_rcMap.has(rc)) _rcMap.set(rc, e.numero_expediente);
    }
    if (!data || data.length < page) break;
    from += page;
  }
  return _rcMap;
}

async function getExpedienteByNumero(numero) {
  // OJO: expedientes NO tiene columna drive_folder_id; vive en oportunidades.datos_calculo.
  const { data, error } = await supabase
    .from('expedientes')
    .select('id, numero_expediente, cliente_id, oportunidad_id, cee, instalacion, documentacion, seguimiento, oportunidades(datos_calculo)')
    .eq('numero_expediente', numero)
    .maybeSingle();
  if (error) throw new Error('Error consultando expediente ' + numero + ': ' + error.message);
  return data || null;
}

// ───────────────────────── main ─────────────────────────
async function main() {
  console.log('═'.repeat(78));
  console.log(`MIGRACIÓN EN LOTE  —  modo: ${OPTS.execute ? '*** EXECUTE (escribe) ***' : 'DRY-RUN (no escribe)'}`);
  console.log(`Origen: ${PROD}`);
  console.log(`Opciones: placeholders=${OPTS.placeholders}  drive=${OPTS.drive}  sleep=${OPTS.sleep}ms  limit=${OPTS.limit}` +
    (OPTS.ficha ? `  ficha=FORZADA:${OPTS.ficha}` : '') + (OPTS.filter ? `  filter="${OPTS.filter}"` : ''));
  console.log('═'.repeat(78));

  let expedientes = [], noReconocidas = [], lista;
  if (OPTS.path) {
    if (!fs.existsSync(OPTS.path)) throw new Error('--path no existe: ' + OPTS.path);
    lista = [buildExpFromPath(OPTS.path)];
    console.log(`\nModo --path → 1 carpeta: ${lista[0].name}`);
  } else {
    ({ expedientes, noReconocidas } = discover());
    lista = expedientes;
    if (OPTS.filter) lista = lista.filter((x) => (x.carpeta_origen + ' ' + x.name).toLowerCase().includes(OPTS.filter.toLowerCase()));
    console.log(`\nDescubiertos: ${expedientes.length} expedientes | ${noReconocidas.length} carpetas no reconocidas`);
    if (OPTS.filter) console.log(`Tras filtro "${OPTS.filter}": ${lista.length}`);
  }

  const rows = [];
  const tally = { creado: 0, unificado: 0, saltado: 0, error: 0 };
  let processed = 0;

  for (const exp of lista) {
    if (processed >= OPTS.limit) break;
    processed++;

    const meta = parseFolderName(exp.name);
    const flags = meta ? [...meta.flags] : ['nombre_no_parseable'];
    const conflictos = [];
    let accion = 'saltado';
    let drive_folder_id = '';
    let numero = meta?.numero_expediente || `${meta?.yy || '??'}${meta?.ficha || '??'}_${meta?.numToken || 'XX'}`;
    const clienteLabel = meta?.cliente || exp.name;

    const log = (...a) => OPTS.verbose && console.log('   ', ...a);
    console.log(`\n[${processed}] ${exp.ficha} · ${exp.estado_origen}`);
    console.log(`    carpeta: ${exp.name}`);

    try {
      if (!meta) { flags.push('no_reconocida'); throw { soft: true, msg: 'nombre no parseable' }; }

      // localizar XML
      const xmlIniPath = locateCeeXml(exp.full, 'INICIAL');
      const xmlFinPath = locateCeeXml(exp.full, 'FINAL');
      let ceeInicial = null, ceeFinal = null;
      if (xmlIniPath) { try { ceeInicial = await parseCeeXmlNode(fs.readFileSync(xmlIniPath, 'utf8')); } catch (e) { flags.push('xml_ini_corrupto'); } }
      if (xmlFinPath) { try { ceeFinal = await parseCeeXmlNode(fs.readFileSync(xmlFinPath, 'utf8')); } catch (e) { flags.push('xml_fin_corrupto'); } }
      if (xmlIniPath && /\.cex$/i.test(xmlIniPath)) flags.push('usado_cex_ini');
      if (xmlFinPath && /\.cex$/i.test(xmlFinPath)) flags.push('usado_cex_fin');
      if (!ceeInicial && !ceeFinal) flags.push('sin_xml');

      const ident = (ceeInicial && ceeInicial.identificacion) || (ceeFinal && ceeFinal.identificacion) || {};
      const zona = (ceeInicial && ceeInicial.zonaClimatica) || (ceeFinal && ceeFinal.zonaClimatica) || null;
      log(`XML inicial: ${xmlIniPath ? path.basename(xmlIniPath) : '—'}`);
      log(`XML final:   ${xmlFinPath ? path.basename(xmlFinPath) : '—'}`);
      log(`RC=${ident.refCatastral || '—'}  zona=${zona || '—'}  mun=${ident.municipio || '—'}  prov=${ident.provincia || '—'}`);
      log(`dir=${ident.direccion || '—'}`);
      log(`fechas: visita_ini=${ceeInicial?.fechaVisita || '—'} firma_ini=${ceeInicial?.fechaFirma || '—'} visita_fin=${ceeFinal?.fechaVisita || '—'} firma_fin=${ceeFinal?.fechaFirma || '—'}`);

      // placeholder sin número
      if (meta.isPlaceholder) {
        flags.push('sin_numero');
        if (OPTS.placeholders !== 'create') {
          log('→ PLACEHOLDER (_XX/_00) y placeholders!=create ⇒ SALTADO');
          accion = 'saltado';
          throw { soft: true, msg: 'placeholder sin número (skip)' };
        }
        // modo create: se le asignará un número NUEVO automático (manualNumber=null).
        // La ficha sale de --ficha si se fuerza, o de la del propio nombre de carpeta.
        numero = null;
        flags.push('placeholder_creado_autonumero');
      }

      // idempotencia por numero_expediente (sin número → autonúmero, no aplica)
      const existing = numero ? await getExpedienteByNumero(numero) : null;

      // match cliente (solo necesario para CREAR; para unificar ya tiene cliente_id)
      const cm = await matchCliente(clienteLabel);
      const matchLabel = cm.matches && cm.matches[0] ? cm.matches[0]._label : '';
      log(`cliente "${clienteLabel}" → ${cm.status}` +
        (cm.status === 'unico' ? ` [${cm.exact ? 'exacto' : 'parcial'}] → ${matchLabel}` : '') +
        (cm.status === 'ambiguo' ? ` (${cm.matches.length}: ${cm.matches.map((m) => m._label).join(' | ')})` : ''));

      if (existing) {
        // ── UNIFICAR ──
        accion = 'unificado';
        drive_folder_id = existing.oportunidades?.datos_calculo?.drive_folder_id || '';
        const cee = existing.cee || {};
        // rellenar SOLO si está vacío; nunca sobrescribir
        const fill = [];
        if (ceeInicial && !cee.cee_inicial) fill.push('cee.cee_inicial');
        if (ceeFinal && !cee.cee_final) fill.push('cee.cee_final');
        const inst = existing.instalacion || {};
        if (ident.refCatastral && !inst.ref_catastral) fill.push('instalacion.ref_catastral');
        // conflictos: valor existente DISTINTO del XML
        if (cee.cee_inicial && ceeInicial && cee.cee_inicial.identificacion?.refCatastral &&
            ident.refCatastral && cee.cee_inicial.identificacion.refCatastral !== ident.refCatastral) {
          conflictos.push(`RC: actual=${cee.cee_inicial.identificacion.refCatastral} xml=${ident.refCatastral}`);
        }
        if (inst.ref_catastral && ident.refCatastral && inst.ref_catastral !== ident.refCatastral) {
          conflictos.push(`instalacion.ref_catastral: actual=${inst.ref_catastral} xml=${ident.refCatastral}`);
        }
        log(`EXISTE id=${existing.id} ⇒ UNIFICAR. Rellenaría: [${fill.join(', ') || 'nada'}]` +
            (conflictos.length ? ` | CONFLICTOS: ${conflictos.join('; ')}` : ''));
        flags.push(`rellena:${fill.join('+') || 'nada'}`);

        if (OPTS.execute) {
          await unificar(existing, { ceeInicial, ceeFinal, ident, exp, flags });
        }
      } else {
        // ── CREAR ──
        if (cm.status === 'ambiguo') {
          flags.push('cliente_ambiguo');
          accion = 'saltado';
          log(`→ cliente ambiguo (${cm.matches.length}) ⇒ SALTADO (revisión manual)`);
          throw { soft: true, msg: 'cliente ambiguo' };
        }
        if (!ceeInicial && !ceeFinal) {
          // la rutina exige ≥1 XML — no se puede crear vía migrateExpedienteFromXml
          accion = 'saltado';
          log('→ sin XML y la rutina exige ≥1 CEE ⇒ SALTADO (flag sin_xml)');
          throw { soft: true, msg: 'sin_xml: rutina exige ≥1 CEE' };
        }
        // BLINDAJE ANTI-DUPLICADOS: si la referencia catastral ya tiene expediente, NO crear.
        const rcN = rcNorm(ident.refCatastral);
        if (rcN.length >= 14) {
          const rcMap = await loadRcMap();
          if (rcMap.has(rcN)) {
            flags.push(`rc_ya_existe(${rcMap.get(rcN)})`);
            accion = 'saltado';
            log(`→ RC ${rcN} ya existe en ${rcMap.get(rcN)} ⇒ SALTADO (evita duplicado)`);
            throw { soft: true, msg: 'rc_ya_existe' };
          }
        }
        accion = 'creado';
        const fichaToUse = OPTS.ficha || meta.ficha;
        const manualNum = meta.isPlaceholder ? null : numero;   // placeholder → autonúmero
        let cliente_id = cm.cliente_id || null;
        if (cm.status === 'nuevo') flags.push('cliente_nuevo_sin_dni');
        if (cm.status === 'unico' && !cm.exact) flags.push(`cliente_match_parcial(${cm.matches[0]._label})`);

        if (OPTS.execute) {
          if (!cliente_id) cliente_id = await crearCliente(clienteLabel);
          const created = await crearExpediente({ ficha: fichaToUse, manualNumber: manualNum, cliente_id, ceeInicial, ceeFinal, ident, exp, flags });
          numero = created?.numero_expediente || numero;   // captura el nº real (autonúmero)
          if (rcN.length >= 14 && _rcMap) _rcMap.set(rcN, numero); // reserva la RC para el resto del lote
          drive_folder_id = await getOpDriveFolderId(created.oportunidad_id) || '';

          // COPIA de TODO el contenido de la carpeta Drive origen → la nueva (merge por nombre)
          if (OPTS.copiarOrigen && OPTS.path && drive_folder_id) {
            try {
              const sourceId = await resolveDriveFolderIdFromLocalPath(OPTS.path);
              log(`Copiando contenido de la carpeta origen (${sourceId}) → nueva (${drive_folder_id})...`);
              const r = await mergeCopyDrive(sourceId, drive_folder_id);
              log(`Contenido copiado: ${r.files} ficheros / ${r.folders} subcarpetas (merge).`);
              flags.push(`contenido_copiado(${r.files}f/${r.folders}c)`);
            } catch (e) {
              console.error('    !! copia de contenido falló:', e.message);
              flags.push('copia_contenido_error:' + e.message.slice(0, 60));
            }
          }
          await sleep(OPTS.sleep); // rate-limit Drive
        } else {
          log(`→ CREARÍA expediente ${manualNum || '(nº AUTO)'} ficha=${fichaToUse} (cliente=${cm.cliente_id || 'NUEVO'}, drive=${OPTS.drive})`);
        }
      }
    } catch (err) {
      if (err && err.soft) {
        // decisión blanda (saltado) ya registrada
      } else {
        accion = 'error';
        flags.push('error:' + (err?.message || String(err)).slice(0, 80));
        console.error('    !! ERROR:', err?.message || err);
      }
    }

    tally[accion] = (tally[accion] || 0) + 1;
    rows.push({
      numero_expediente: numero,
      ficha: meta?.ficha || '',
      cliente: clienteLabel,
      accion,
      drive_folder_id,
      estado_origen: exp.estado_origen,
      flags: flags.join(' | '),
      conflictos: conflictos.join(' ; '),
    });
  }

  // ── CSV ──
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const csvPath = path.join(__dirname, `migracion_lote_${stamp}${OPTS.execute ? '' : '_dryrun'}.csv`);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['numero_expediente', 'ficha', 'cliente', 'accion', 'drive_folder_id', 'estado_origen', 'flags', 'conflictos'];
  const csv = [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n');
  fs.writeFileSync(csvPath, '﻿' + csv, 'utf8');

  // ── resumen ──
  console.log('\n' + '═'.repeat(78));
  console.log('RESUMEN');
  console.log('═'.repeat(78));
  console.log(`Procesados: ${processed}  |  creado=${tally.creado || 0}  unificado=${tally.unificado || 0}  saltado=${tally.saltado || 0}  error=${tally.error || 0}`);
  const conFlags = rows.filter((r) => r.flags || r.conflictos);
  if (conFlags.length) {
    console.log(`\nCon flags / conflictos (${conFlags.length}):`);
    for (const r of conFlags) console.log(`  · ${r.numero_expediente} [${r.accion}] ${r.flags}${r.conflictos ? ' || CONFLICTO: ' + r.conflictos : ''}`);
  }
  if (noReconocidas.length && !OPTS.filter) {
    console.log(`\nCarpetas NO reconocidas (${noReconocidas.length}):`);
    for (const n of noReconocidas) console.log('  · ' + n);
  }
  console.log(`\nCSV: ${csvPath}`);
  if (!OPTS.execute) console.log('\n(DRY-RUN: no se ha escrito nada en BD ni Drive. Añade --execute para aplicar.)');
}

// ───────────────────────── escrituras (solo --execute) ─────────────────────────
async function crearCliente(nombre) {
  const { data, error } = await supabase
    .from('clientes')
    .insert([{ nombre_razon_social: nombre }])
    .select('id_cliente')
    .single();
  if (error) throw new Error('No se pudo crear cliente: ' + error.message);
  _clientesCache = null; // invalidar cache
  return data.id_cliente;
}

async function crearExpediente({ ficha, manualNumber, cliente_id, ceeInicial, ceeFinal, ident, exp, flags }) {
  const expedienteService = require('../services/expedienteService');
  const fechas = {
    visita_inicial: ceeInicial?.fechaVisita || null,
    firma_inicial: ceeInicial?.fechaFirma || null,
    visita_final: ceeFinal?.fechaVisita || null,
    firma_final: ceeFinal?.fechaFirma || null,
  };
  // localizar de nuevo los paths para subir XML crudo a Drive
  const xmlIniPath = locateCeeXml(exp.full, 'INICIAL');
  const xmlFinPath = locateCeeXml(exp.full, 'FINAL');
  const xmlInicialBase64 = OPTS.drive && xmlIniPath ? fs.readFileSync(xmlIniPath).toString('base64') : null;
  const xmlFinalBase64 = OPTS.drive && xmlFinPath ? fs.readFileSync(xmlFinPath).toString('base64') : null;

  const newExp = await expedienteService.migrateExpedienteFromXml({
    ficha,
    cliente_id,
    manualNumber,                    // null → autonúmero ({YY}{ficha}_{N}); si no, nº fijo
    ceeInicial,
    ceeFinal,
    refCatastral: ident.refCatastral || '',
    fechas,
    combustibles: {},
    xmlInicialBase64,
    xmlFinalBase64,
    usuario: null,
  });

  // trazabilidad: seguimiento.migracion_lote (merge, sin machacar)
  await mergeMigracionLote(newExp.id, exp, flags);
  return newExp;
}

async function unificar(existing, { ceeInicial, ceeFinal, ident, exp, flags }) {
  const cee = { ...(existing.cee || {}) };
  let touched = false;
  if (ceeInicial && !cee.cee_inicial) { cee.cee_inicial = ceeInicial; touched = true; }
  if (ceeFinal && !cee.cee_final) { cee.cee_final = ceeFinal; touched = true; }
  const inst = { ...(existing.instalacion || {}) };
  if (ident.refCatastral && !inst.ref_catastral) { inst.ref_catastral = ident.refCatastral; touched = true; }

  const updates = {};
  if (touched) { updates.cee = cee; updates.instalacion = inst; }
  // seguimiento.migracion_lote SIEMPRE (additivo, sin tocar estado_relleno)
  const seg = { ...(existing.seguimiento || {}) };
  seg.migracion_lote = buildTrazabilidad(exp, flags);
  updates.seguimiento = seg;

  const { error } = await supabase.from('expedientes').update(updates).eq('id', existing.id);
  if (error) throw new Error('Error unificando ' + existing.numero_expediente + ': ' + error.message);
}

function buildTrazabilidad(exp, flags) {
  return {
    carpeta_origen: exp.carpeta_origen.replace(/\\/g, '/'),
    estado_origen: exp.estado_origen,
    fecha_lote: new Date().toISOString(),
    flags: flags.slice(),
  };
}

async function mergeMigracionLote(expId, exp, flags) {
  const { data } = await supabase.from('expedientes').select('seguimiento').eq('id', expId).maybeSingle();
  const seg = { ...((data && data.seguimiento) || {}) };
  seg.migracion_lote = buildTrazabilidad(exp, flags);
  await supabase.from('expedientes').update({ seguimiento: seg }).eq('id', expId);
}

main()
  .then(() => { process.exitCode = 0; })
  .catch((e) => { console.error('FATAL:', e); process.exitCode = 1; });
// Sin process.exit() forzado: evita el assertion de libuv (undici keep-alive) en Node/Windows.
// El event-loop drena al cerrarse los sockets keep-alive (pocos segundos).
