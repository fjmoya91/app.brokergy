#!/usr/bin/env node
// ============================================================================
// cee_inicial.js — GENERAR EL CEE INICIAL de una obra, desde sus fotos.
//
// Lo usa la skill `generar-cee-inicial` (skills/generar-cee-inicial).
// Es el gemelo de `revisar_cee.js`: aquél mira el `.cex` que ENTREGA el
// certificador; éste prepara el que se le da ya hecho.
//
//   node scripts/cee_inicial.js estado   <clave>
//   node scripts/cee_inicial.js placas   <clave>
//   node scripts/cee_inicial.js fotos    <clave> [--out DIR]
//   node scripts/cee_inicial.js paredes  <clave> [--out DIR] [--sin-sede]
//   node scripts/cee_inicial.js catastro <clave> [--out DIR] [--escribir] [--refrescar-catastro]
//   node scripts/cee_inicial.js leer-pared <clave> --pared FBE1 --fotos id1,id2
//   node scripts/cee_inicial.js eprel    <codigo del modelo> [--out DIR]
//   node scripts/cee_inicial.js alta-aerotermia --json datos.json
//            [--ficha ft.pdf[:1,3-4]] [--eprel-fiche f.pdf] [--eprel-label l.pdf] [--escribir]
//   node scripts/cee_inicial.js aplicar  <clave> --plan plan.json [--escribir] [--sin-aviso]
//            [--sin-pdf] [--calificar]
//
// Con --escribir, además del .cex deja su XML y su PDF OFICIAL al lado
// (`… _REVISAR.xml/.pdf`), calificados por CE3X 3.1 sin abrir su ventana
// (`services/cee/cexAPdf.js`; solo en un PC con CE3X). --sin-pdf lo salta.
// En seco, --calificar hace lo mismo junto a la copia local, sin subir nada.
//
// Con --escribir, al terminar avisa como el AGENTE IA (services/agenteIa.js):
// fase «pendiente de revisión» y WhatsApp + email al equipo. --sin-aviso lo calla.
//
// DOCUMENTOS DEL CATASTRO (`paredes` y `catastro`): de la Sede del Catastro se
// bajan el CROQUIS CATASTRAL POR PLANTAS (PDF), su FXCC (DXF + ASC: cada local
// de cada planta DIBUJADO con su uso), los KML 3D y el FXCC con colindantes
// (`cee-engine/src/catastro/sede.py`). El motor usa el FXCC para proponer las
// zonas que no son vivienda con sus polígonos EXACTOS (garaje, almacén,
// porche, comercio) en vez de conjeturarlas; con --escribir, `aplicar` y
// `catastro` los dejan en `1. CEE / CEE INICIAL / CATASTRO`. --sin-sede lo salta.
//
// <clave> = el nº de la oportunidad (26RES060_OP246), el del expediente
// (26RES060_186) o el de un CEE directo (2026CEE_55); el origen se deduce del
// formato y se puede forzar con --origen op|cae|cee.
//
// REGLAS (las mismas de la app; ver CLAUDE.md, «Generar el CEE inicial»):
//   · Todo sale por las MISMAS funciones que la ventana de la envolvente
//     (`ceeEnvolventeCex`, `senalado.js`, `paredFotoService`, los lectores de
//     placas): el `.cex` de la skill y el del botón no pueden diferir.
//   · El modelo solo LEE. Lo leído de una foto NACE DUDOSO (el ámbar de la
//     ventana) y lo que no se puede afirmar no se escribe.
//   · Sin --escribir no se toca nada: ni la BD, ni Drive, ni el catálogo.
// ============================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const supabase = require('../services/supabaseClient');
const cex = require('../services/ceeEnvolventeCex');
const fotosSrv = require('../services/paredFotoService');
const paredOcr = require('../services/paredOcrService');
const placaOcr = require('../services/placaOcrService');
const placaEquipo = require('../services/placaEquipoOcrService');
const driveService = require('../services/driveService');

const MOTOR = process.env.CEE_ENGINE_URL || 'http://127.0.0.1:8090';
const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src', 'features');
const CACHE = path.join(os.tmpdir(), 'brokergy-cee-inicial');

// ─── Argumentos ─────────────────────────────────────────────────────────────

const [, , ORDEN, ...RESTO] = process.argv;
const POS = RESTO.filter(a => !a.startsWith('--'));
function opt(nombre) {
    const i = RESTO.findIndex(a => a === `--${nombre}` || a.startsWith(`--${nombre}=`));
    if (i < 0) return null;
    const a = RESTO[i];
    if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
    const sig = RESTO[i + 1];
    return sig && !sig.startsWith('--') ? sig : true;
}
const ESCRIBIR = RESTO.includes('--escribir');
const cexAPdf = require('../services/cee/cexAPdf');

/** De qué negocio es la clave. Se deduce del formato; `--origen` manda. */
function origenDe(clave) {
    const o = opt('origen');
    if (o && o !== true) return o;
    if (/_OP\d+$/i.test(clave)) return 'op';
    if (/^\d{4}CEE_\d+$/i.test(clave)) return 'cee';
    return 'cae';
}

const esm = f => import(pathToFileURL(path.join(FRONT, f)).href);
const kb = n => `${Math.round((n || 0) / 1024)} KB`;
const fmt = n => (n === null || n === undefined || n === '' ? '—'
    : Number(n).toFixed(2).replace('.', ','));

// ─── Motor ──────────────────────────────────────────────────────────────────

async function alMotor(ruta, cuerpo, ms = 240_000) {
    const r = await fetch(`${MOTOR}${ruta}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(ms),
    });
    return r;
}

async function saludMotor() {
    try {
        const s = await (await fetch(`${MOTOR}/health`, { signal: AbortSignal.timeout(5000) })).json();
        if (s.codigo_en_disco_at && s.codigo_at !== s.codigo_en_disco_at) {
            console.warn('⚠ El motor se levantó ANTES del último cambio en su código: '
                + 'reinícialo o lo que pruebes será la versión anterior.');
        }
        return true;
    } catch {
        throw new Error(`El motor (cee-engine) no responde en ${MOTOR}. Levántalo antes.`);
    }
}

// ─── Carga ──────────────────────────────────────────────────────────────────

async function cargar(clave) {
    if (!clave) throw new Error('Dime qué expediente u oportunidad.');
    const origen = origenDe(clave);
    const ctx = await cex.cargarExpediente(clave, origen);
    if (!ctx) throw new Error(`No encuentro ${clave} (origen ${origen}).`);
    return { ...ctx, origen, clave };
}

const inputsDe = ctx => ctx.expediente?.oportunidades?.datos_calculo?.inputs || {};
const rcDe = ctx => ctx.expediente?.instalacion?.ref_catastral
    || ctx.expediente?.ref_catastral || null;

/**
 * La geometría, pedida al motor con lo mismo que la pediría la ventana: las
 * construcciones que marcó una persona en la oportunidad y lo que el trabajo (o
 * el plan) deja fuera. Se cachea en disco para `leer-pared`.
 */
async function geometria(ctx, { cuerpos = null, zonas = null, recorte = null,
                                croquis = null, ajustar = true, altura = null,
                                ajustes = undefined } = {}) {
    const rc = rcDe(ctx);
    if (!rc) throw new Error('No hay referencia catastral.');
    const construcciones = await cex.construccionesElegidas(ctx.clave, ctx.origen);
    // El SEMISÓTANO y las unidades de OTRA parcela (ver `declaracionesEdificio`):
    // los del plan si los trae, si no los del trabajo guardado.
    if (ajustes === undefined) {
        try { ajustes = (await cex.leerTrabajo(ctx.clave, ctx.origen))?.ajustes || null; }
        catch { ajustes = null; }
    }
    const { semisotano, anexos } = cex.declaracionesEdificio(ajustes);
    // Las mismas PISTAS que manda la ventana para proponer el croquis: las
    // fachadas en cuya foto hay una puerta de garaje.
    let pistas = null;
    try { pistas = fotosSrv.pistasCroquis(ctx.expediente); } catch { /* sin pista */ }
    const r = await alMotor('/envolvente', {
        referencia_catastral: rc, construcciones,
        ...(semisotano ? { semisotano } : {}),
        ...(anexos.length ? { anexos } : {}),
        // La ALTURA DE PLANTA con la que se miden las fachadas. Es la misma que
        // declara la ficha (`ajustes.altura_libre_planta`): si se midiera con
        // otra, las superficies del .cex no cuadrarían con la altura que dice.
        ...(Number(altura) > 0 ? { altura_planta: Number(altura) } : {}),
        cuerpos_excluidos: cuerpos, zonas_fuera: zonas, recorte_vivienda: recorte,
        pistas_croquis: pistas,
        // El CROQUIS CATASTRAL POR PLANTAS de la Sede: dice DÓNDE está cada uso
        // de cada planta. Cacheado 30 días en el motor; --sin-sede lo salta.
        sede_catastro: !RESTO.includes('--sin-sede'),
        // El CROQUIS (ver `gis/croquis.py`): el motor lo ajusta a los m² de
        // Catastro y devuelve los polígonos en `croquis_ajustado`.
        ...(croquis?.length ? { croquis, croquis_ajustar: ajustar } : {}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(`El motor no ha medido el edificio: ${d?.detail || r.status}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(path.join(CACHE, `${ctx.expediente.numero_expediente}.geo.json`),
                     JSON.stringify(d));
    return d;
}

/** Cómo se llama en disco cada documento de la Sede (en `<out>/catastro/`). */
const FICHEROS_CATASTRO = {
    croquis_pdf: 'croquis_por_plantas.pdf',
    fxcc_plantas: 'fxcc_por_plantas.zip',
    kml_plantas: 'plantas_3d.kml',
    kml_3d: 'parcela_3d.kml',
    fxcc_colindantes: 'fxcc_con_colindantes.zip',
};

/**
 * Los documentos de la Sede del Catastro de la parcela, por el motor
 * (`/catastro/documentos`, cacheados allí 30 días). Con `out`, se dejan en
 * `<out>/catastro/` para MIRARLOS: el PDF es el croquis de cada planta con sus
 * locales rotulados. Nunca lanza: sin Sede se dice y se sigue.
 */
async function documentosCatastro(ctx, out = null) {
    const rc = rcDe(ctx);
    if (!rc) return null;
    let d;
    try {
        const r = await alMotor('/catastro/documentos', {
            referencia_catastral: rc,
            ...(RESTO.includes('--refrescar-catastro') ? { refresh: true } : {}),
        }, 180_000);
        d = await r.json();
        if (!r.ok) throw new Error(d?.detail || `el motor respondió ${r.status}`);
    } catch (e) {
        console.log(`\n(sin documentos de la Sede del Catastro: ${e.message})`);
        return null;
    }
    const ficheros = {};
    for (const [k, f] of Object.entries(d.ficheros || {})) {
        ficheros[k] = { ...f, datos: Buffer.from(f.datos_b64 || '', 'base64') };
        delete ficheros[k].datos_b64;
    }
    let dir = null;
    if (out) {
        dir = path.join(out, 'catastro');
        fs.mkdirSync(dir, { recursive: true });
        for (const [k, f] of Object.entries(ficheros)) {
            f.local = path.join(dir, FICHEROS_CATASTRO[k] || f.nombre);
            fs.writeFileSync(f.local, f.datos);
        }
    }
    return { ...d, ficheros, dir };
}

/** Lo que dice el croquis catastral, planta a planta, y dónde están sus ficheros. */
function imprimirCatastro(doc, fxGeo = null) {
    if (!doc && !fxGeo) return;
    const fx = fxGeo || doc?.fxcc;
    if (doc) {
        console.log('\nDOCUMENTOS DEL CATASTRO (Sede Electrónica)');
        for (const [k, f] of Object.entries(doc.ficheros || {})) {
            console.log(`  ✓ ${String(f.titulo || k).padEnd(62)} ${kb(f.bytes)}`
                + `${f.de_cache ? ' (caché)' : ''}${f.local ? `\n      ${f.local}` : ''}`);
        }
        for (const [k, v] of Object.entries(doc.fallos || {})) console.log(`  · ${k}: ${v}`);
    }
    if (fx?.plantas?.length) {
        console.log(`\nCROQUIS CATASTRAL POR PLANTAS (de ${fx.fecha || 'fecha desconocida'})`
            + `${fx.alineado === false ? ' — ⚠ NO cae sobre la parcela: no se usa' : ''}`
            + `${fx.srs_origen ? ` · reproyectado desde ${fx.srs_origen}` : ''}`);
        for (const p of fx.plantas) {
            console.log(`  ${p.nombre || p.capa} (nivel ${p.niveles.join(',')})`
                + `${p.nivel_deducido ? ' ⚠ nivel deducido por su orden' : ''}`);
            for (const r of p.recintos || []) {
                console.log(`    ${String(r.codigo).padEnd(10)} ${String(r.literal || '').padEnd(20)}`
                    + ` ${fmt(r.superficie)} m² (dibujado ${fmt(r.area)})`);
            }
        }
        for (const a of fx.avisos || []) console.log(`  ⚠ ${a}`);
    }
    const pdf = doc?.ficheros?.croquis_pdf?.local;
    if (pdf) {
        console.log(`\n→ MIRA el croquis por plantas antes de decidir las zonas: ${pdf}`);
    }
}

// ─── catastro ───────────────────────────────────────────────────────────────

async function catastro() {
    await saludMotor();
    const ctx = await cargar(POS[0]);
    const out = opt('out') && opt('out') !== true ? opt('out')
        : path.join(CACHE, ctx.expediente.numero_expediente);
    const doc = await documentosCatastro(ctx, out);
    imprimirCatastro(doc);
    if (!doc) return;
    if (!ESCRIBIR) { console.log('\nEN SECO: no se ha subido a Drive. Pásale --escribir.'); return; }
    const g = await cex.guardarDocsCatastro(ctx, doc.ficheros, 'inicial');
    if (!g.ok) throw new Error(`Los documentos del Catastro no han llegado a Drive: ${g.error}`);
    console.log(`\n✓ En Drive: ${g.carpeta_link}`);
    for (const s of g.subidos) console.log(`  ${s.sin_cambios ? '=' : '✓'} ${s.nombre}`);
}

function geoCacheada(ctx) {
    const f = path.join(CACHE, `${ctx.expediente.numero_expediente}.geo.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

/** La altura de planta con la que el motor ha medido las fachadas. */
const alturaMedida = geo => Number(geo?.geometria?.parametros?.floor_height_m
    ?? geo?.parametros?.floor_height_m) || 2.8;

const murosDe = geo =>(geo?.plantas || []).flatMap(p => (p.muros || [])
    .map(m => ({ ...m, planta: m.planta || p.id, nivel: m.nivel ?? p.nivel })));

// ─── Lo que se ve en una imagen, sin librerías ───────────────────────────────

/** Ancho, alto y orientación EXIF de un JPEG o PNG. La relación de aspecto es
 *  lo que necesita el lector de fachadas para cruzar las dos escalas. */
function dimensiones(buf) {
    if (!buf || buf.length < 24) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50) {
        return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), orient: 1 };
    }
    if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    let i = 2, orient = 1, w = null, h = null;
    while (i < buf.length - 9) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const m = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (m === 0xE1 && buf.toString('latin1', i + 4, i + 8) === 'Exif') {
            const t = i + 10;
            const le = buf.toString('latin1', t, t + 2) === 'II';
            const u16 = o => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
            const u32 = o => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
            const ifd = t + u32(t + 4);
            const n = u16(ifd);
            for (let k = 0; k < n; k++) {
                const e = ifd + 2 + k * 12;
                if (u16(e) === 0x0112) orient = u16(e + 8);
            }
        }
        if ([0xC0, 0xC1, 0xC2].includes(m)) {
            h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7);
            break;
        }
        i += 2 + len;
    }
    return w && h ? { w, h, orient } : null;
}

const aspectoDe = (buf) => {
    const d = dimensiones(buf);
    if (!d) return null;
    const girada = d.orient >= 5 && d.orient <= 8;
    return girada ? d.h / d.w : d.w / d.h;
};

// ─── estado ─────────────────────────────────────────────────────────────────

async function estado() {
    const ctx = await cargar(POS[0]);
    const e = ctx.expediente, inp = inputsDe(ctx), inst = e.instalacion || {};
    const titular = [ctx.cliente?.nombre_razon_social, ctx.cliente?.apellidos].filter(Boolean).join(' ')
        || e.nombre || '';
    console.log(`\n${e.numero_expediente} · ${ctx.origen.toUpperCase()}`);
    console.log(`  cliente: ${titular || '—'}`);
    // El título de la sesión de Claude: «{nº} - {CLIENTE}», como la cabecera de
    // la ficha. Así se sabe de qué obra es cada conversación.
    console.log(`  título de la sesión: ${e.numero_expediente}${titular ? ` - ${titular.toUpperCase()}` : ''}`);
    console.log(`  RC: ${rcDe(ctx) || '— NO TIENE'} · zona ${inp.zona || e.zona_climatica || '—'} · año ${inp.anio || '—'}`);
    console.log(`  carpeta de Drive: ${ctx.driveFolderId || '— NO TIENE (no hay dónde dejar el .cex)'}`);
    console.log(`  caldera: ${inst.caldera_antigua_cal?.rendimiento_id || '—'} · combustible ${inp.fuelType || '—'}`
                + ` · potencia ${inst.potencia_caldera_kw || inst.potencia_caldera || inp.potenciaCaldera || '— sin declarar'}`);
    console.log(`  ACS actual: ${inp.boilerAcsType || '—'} · ¿la obra cambia el ACS? ${inp.changeAcs ? 'sí' : 'no'}`);
    const a = inst.aerotermia_cal || {};
    console.log(`  aerotermia: ${a.aerotermia_db_id ? `catálogo id ${a.aerotermia_db_id} · ${a.marca || ''} ${a.modelo || ''}`
        : `GENÉRICA de la simulación (${inp.customModelName || 'sin modelo'})`} · SCOP ${inp.scopHeating ?? a.scop ?? '—'}`
                + ` · emisor ${inst.tipo_emisor || inp.emitterType || '—'}`);
    console.log(`  construcciones elegidas: ${JSON.stringify(await cex.construccionesElegidas(ctx.clave, ctx.origen))}`);
    const t = await cex.leerTrabajo(e.id, ctx.origen).catch(() => null);
    if (t) {
        const n = Object.values(t.huecos || {}).reduce((s, l) => s + (l || []).length, 0);
        console.log(`  trabajo guardado: entrada ${t.entrada || '—'} · ${n} huecos · guardado ${t.guardado_at || '—'}`);
    } else console.log('  trabajo guardado: NINGUNO (envolvente sin empezar)');
    // Para MIRAR no se crea ni se hace pública ninguna carpeta (`carpetaFase` lo
    // hace, y es lo correcto al generar, no aquí). Mismo criterio que la revisión.
    if (ctx.driveFolderId && ctx.origen !== 'cee') {
        const raiz = await driveService.findSubfolderByName(ctx.driveFolderId, '1. CEE');
        const ini = raiz && await driveService.findSubfolderByName(raiz, 'CEE INICIAL');
        const cexs = ini ? (await driveService.listFiles(ini) || [])
            .filter(f => /\.cex$/i.test(f.name || '')) : [];
        console.log(`  .cex en «1. CEE / CEE INICIAL»: ${cexs.length
            ? cexs.map(f => f.name).join(' · ') : 'ninguno'}`);
    }
}

// ─── placas ─────────────────────────────────────────────────────────────────

async function placas() {
    const ctx = await cargar(POS[0]);
    const inst = ctx.expediente.instalacion || {};
    const combustible = placaOcr.combustibleDeclarado(inst, inputsDe(ctx));
    console.log(`\nCALDERA (combustible declarado: ${combustible || '— sin declarar'})`);
    const c = await placaOcr.leerPlacaCaldera({ datos_calculo: { drive_folder_id: ctx.driveFolderId } },
                                             { combustible });
    console.log(JSON.stringify({ leido: c.leido, potencia_kw: c.potencia_kw, base: c.potencia_base,
                                 fotos: (c.fotos || []).map(f => f.name), avisos: c.avisos }, null, 1));

    console.log('\nAEROTERMIA');
    const a = await placaEquipo.leerPlacasAerotermia(ctx.driveFolderId);
    console.log(JSON.stringify({ unidades: a.unidades, fotos: a.fotos, avisos: a.avisos }, null, 1));
    const m = await placaEquipo.casarConCatalogo(a.unidades?.exterior, a.unidades?.interior);
    console.log('\nCATÁLOGO', m.modelo
        ? `→ id ${m.modelo.id} · ${m.modelo.marca} ${m.modelo.modelo_comercial || ''} (por ${m.por})`
        : `→ NO ESTÁ${m.candidatos?.length ? ` · ${m.candidatos.length} candidatos: ${
            m.candidatos.map(x => `${x.id} ${x.modelo_comercial}`).join(' | ')}` : ''}`);
    if (m.aviso) console.log(`  ⚠ ${m.aviso}`);
    console.log('\nCOMPRUEBA cada lectura contra la FOTO antes de usarla: el modelo solo transcribe.');
}

// ─── fotos ──────────────────────────────────────────────────────────────────

async function fotos() {
    const ctx = await cargar(POS[0]);
    const out = opt('out') && opt('out') !== true ? opt('out')
        : path.join(CACHE, ctx.expediente.numero_expediente, 'fotos');
    fs.mkdirSync(out, { recursive: true });
    const { fotos: cands, aviso } = await fotosSrv.candidatas(ctx.expediente);
    if (aviso) console.log(`⚠ ${aviso}`);
    // Además de las de envolvente, TODO lo que hay en «12. DOCUMENTOS PARA CEE»:
    // la caldera, las placas y la aerotermia se miran también.
    // En un CEE directo la documentación vive en «4. DOCUMENTACIÓN PARA CEE»
    // (no hay obra ni slots `FOTO_*`): la misma carpeta que mira `candidatas`.
    const raiz = ctx.driveFolderId;
    const subNombre = ctx.origen === 'cee' ? '4. DOCUMENTACIÓN PARA CEE' : placaOcr.SUBCARPETA_DOCS;
    const sub = raiz && await driveService.findSubfolderByName(raiz, subNombre);
    const todas = sub ? (await driveService.listFiles(sub) || [])
        .filter(f => /^image\//.test(f.mimeType || '')) : [];
    console.log(`\n${todas.length} imágenes en «${subNombre}» → ${out}`);
    for (const f of todas) {
        const esCand = cands.some(c => c.drive_id === f.id);
        const buf = await driveService.getFileContent(f.id).catch(() => null);
        if (!buf?.length) { console.log(`  ✗ ${f.name} (no baja)`); continue; }
        const dest = path.join(out, f.name.replace(/[\\/:*?"<>|]/g, '_'));
        fs.writeFileSync(dest, buf);
        const d = dimensiones(buf);
        console.log(`  ${esCand ? '▣' : '·'} ${f.id}  ${f.name}  ${kb(buf.length)}`
            + `${d ? `  ${d.w}×${d.h}${d.orient > 1 ? ` exif${d.orient}` : ''}` : ''}`);
    }
    console.log('\n▣ = foto de envolvente (se puede pegar a una pared con el plan)');
}

// ─── La VISTA AÉREA (ortofoto del PNOA) ─────────────────────────────────────
// La cartografía dice lo que está DADO DE ALTA; la foto aérea, lo que hay: el
// tejado (teja o azotea), el patio, el cobertizo que no consta, la entrada de
// coches que delata el garaje, las placas del tejado. Es la misma capa que la
// ventana de la envolvente, y la rejilla sale de la MISMA función
// (`teselasOrtofoto` de `logic/ortofoto.js`): aquí solo se descarga y se pinta.

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const PLANO_PY = path.join(__dirname, 'cee_inicial_plano.py');
const UA_IGN = 'Mozilla/5.0 (compatible; Brokergy/1.0; +https://app.brokergy.es)';

/**
 * Baja las teselas que cubren el rectángulo del plano (el del ENTORNO, sin
 * margen: es lo que se dibuja) y la fecha del vuelo, y deja un manifiesto que
 * `cee_inicial_plano.py` sabe componer. Las teselas se cachean en disco por su
 * clave: `aplicar` vuelve a dibujar sin volver a pedirlas.
 */
async function ortofoto(geo, out) {
    const { teselasOrtofoto, urlFechaVuelo, leerFechaVuelo } =
        await esm('cee-envolvente/logic/ortofoto.js');
    const r = teselasOrtofoto(geo.georef, { margen: 0 });
    if (!r.teselas) return { aviso: r.aviso };
    const dir = path.join(CACHE, 'ortofoto');
    fs.mkdirSync(dir, { recursive: true });
    const pendientes = [...r.teselas];
    let fallidas = 0;
    const teselas = [];
    // De cuatro en cuatro: es el servidor público del IGN, y más a la vez no
    // acelera nada (cada tesela baja en ~0,3 s).
    await Promise.all(Array.from({ length: 4 }, async () => {
        for (let t = pendientes.shift(); t; t = pendientes.shift()) {
            const archivo = path.join(dir, `${t.key.replace(/[^\w.-]/g, '_')}.jpg`);
            try {
                if (!fs.existsSync(archivo)) {
                    const resp = await fetch(t.href, { headers: { 'User-Agent': UA_IGN },
                                                       signal: AbortSignal.timeout(30_000) });
                    // Un WMTS contesta sus errores con un XML: si no es una
                    // imagen, no es una tesela.
                    if (!resp.ok || !/image/.test(resp.headers.get('content-type') || '')) {
                        throw new Error(`HTTP ${resp.status}`);
                    }
                    fs.writeFileSync(archivo, Buffer.from(await resp.arrayBuffer()));
                }
                teselas.push({ archivo, x: t.x, y: t.y, ancho: t.ancho, alto: t.alto });
            } catch { fallidas++; }
        }
    }));
    let vuelo = null;
    try {
        const u = urlFechaVuelo(geo.georef, geo.ancho / 2, geo.alto / 2);
        if (u) {
            const resp = await fetch(u, { headers: { 'User-Agent': UA_IGN },
                                          signal: AbortSignal.timeout(30_000) });
            if (resp.ok) vuelo = leerFechaVuelo(await resp.json());
        }
    } catch { /* sin fecha: la imagen lo dice */ }
    const manifiesto = { nivel: r.nivel, crs: r.crs, vuelo, fallidas, teselas };
    fs.writeFileSync(path.join(out, 'ortofoto.json'), JSON.stringify(manifiesto));
    return manifiesto;
}

/**
 * El plano de las paredes sobre los DOS fondos: la cartografía del Catastro
 * (`<base>.png`) y la foto aérea (`<base>_satelite.png`, más la foto SIN rayas en
 * `satelite.png`). Nunca lanza: si falta un fondo se dice y se sigue con el otro.
 */
async function dibujarPlanos(ctx, geo, out, base, fTrabajo = null) {
    const fGeo = path.join(CACHE, `${ctx.expediente.numero_expediente}.geo.json`);
    const extra = fTrabajo ? [fTrabajo] : [];
    const correr = (args) => {
        try {
            execFileSync(PYTHON, [PLANO_PY, ...args], { stdio: 'pipe' });
            return null;
        } catch (e) { return String(e.stdout || e.message).trim().slice(0, 160); }
    };

    const carto = await cex.cartografia(geo.georef).catch(() => null);
    if (carto?.imagen) {
        const fCarto = path.join(out, 'cartografia.png');
        fs.writeFileSync(fCarto, Buffer.from(carto.imagen, 'base64'));
        const f = path.join(out, `${base}.png`);
        const err = correr([fGeo, fCarto, f, ...extra]);
        console.log(err ? `\n(no se ha podido dibujar el plano: ${err})`
                        : `\nPLANO (cartografía): ${f}  (norte arriba; rótulo grande = planta baja)`);
    } else {
        console.log(`\n(sin cartografía: ${carto?.aviso || 'Catastro no responde'})`);
    }

    const orto = await ortofoto(geo, out).catch(e => ({ aviso: e.message }));
    if (!orto.teselas?.length) {
        console.log(`(sin vista aérea: ${orto.aviso || 'el IGN no ha servido ninguna tesela'})`);
        return;
    }
    const f = path.join(out, `${base}_satelite.png`);
    const fFoto = path.join(out, 'satelite.png');
    const err = correr([fGeo, path.join(out, 'ortofoto.json'), f, ...extra, '--foto', fFoto]);
    if (err) { console.log(`(no se ha podido dibujar la vista aérea: ${err})`); return; }
    console.log(`PLANO (satélite):   ${f}`);
    console.log(`FOTO AÉREA sola:    ${fFoto}`
        + `  · ${orto.vuelo?.texto || 'fecha del vuelo desconocida'}`
        + (orto.vuelo?.resolucion ? ` · ${String(orto.vuelo.resolucion).replace('.', ',')} m/píxel` : '')
        + (orto.fallidas ? ` · ⚠ ${orto.fallidas} tesela(s) sin descargar` : ''));
}

// ─── paredes ────────────────────────────────────────────────────────────────

async function paredes() {
    await saludMotor();
    const ctx = await cargar(POS[0]);
    const t = await cex.leerTrabajo(ctx.expediente.id, ctx.origen).catch(() => null);
    const geo = await geometria(ctx, { cuerpos: t?.cuerpos_fuera || null,
                                       zonas: t?.zonas_fuera || null,
                                       recorte: t?.recorte_vivienda || null,
                                       altura: t?.ajustes?.altura_libre_planta || null });
    const { admiteHuecos } = await esm('cee-envolvente/logic/tiposPared.js');
    console.log(`\n${rcDe(ctx)} · ${geo.plantas.length} planta(s) · lienzo ${fmt(geo.ancho)} × ${fmt(geo.alto)} m`);
    console.log(`altura de planta ${fmt(alturaMedida(geo))} m`
        + (t?.ajustes?.altura_libre_planta ? ' (la guardada en el trabajo)'
                                           : ' (la de por defecto: cámbiala con «altura_planta» en el plan)'));
    for (const p of geo.plantas) {
        console.log(`\nPLANTA ${p.id} (nivel ${p.nivel})${p.habitable === false ? ' — NO habitable' : ''}`);
        for (const m of p.muros || []) {
            console.log(`  ${m.id.padEnd(6)} ${String(m.tipo).padEnd(28)} ${String(m.subtipo || '').padEnd(24)}`
                + ` ${String(m.orientacion || '—').padEnd(3)} L ${fmt(m.largo)} m · h ${fmt(m.alto)} m`
                + `${admiteHuecos({ ...m }) ? '' : '  (no admite huecos)'}${m.fuera ? '  FUERA' : ''}`);
        }
    }
    // Qué cuenta y qué no, según Catastro y lo marcado en la oportunidad. Lo que
    // NO es vivienda dentro de una planta (el garaje, el porche) no se separa
    // por cuerpos si comparten BuildingPart: hay que DELIMITARLO en la ventana
    // («✂ Quitar una zona»). Aquí solo se dice; su polígono no se inventa.
    // La PROPUESTA de croquis del motor (ver `gis/croquis_propuesta.py`):
    // dónde está, probablemente, lo que no es vivienda en cada planta, ya
    // ajustado a los m² de Catastro. Es un PUNTO DE PARTIDA: se contrasta con
    // las fotos y la cartografía, y si vale se copia al `croquis` del plan
    // (con `poligono`, en EPSG:25830).
    // Con el CROQUIS CATASTRAL POR PLANTAS (`origen: 'fxcc'`) la propuesta no
    // es una conjetura: son los recintos que dibuja Catastro. Esos polígonos van
    // a `zonas_fuera` TAL CUAL (ya son los m² de Catastro); los de la conjetura
    // geométrica, a `croquis`, que los ajusta.
    for (const pr of geo.croquis_propuesto || []) {
        const exacta = pr.origen === 'fxcc';
        console.log(`\nPROPUESTA · nivel ${pr.nivel} · `
            + (exacta ? 'DEL CROQUIS CATASTRAL (exacta: va a `zonas_fuera` tal cual)'
                      : 'conjetura geométrica (compruébala; va a `croquis`)'));
        for (const t of pr.trazos || []) {
            console.log(`  ${String(t.uso).padEnd(22)} ${fmt(t.area_m2)} m² (Catastro ${fmt(t.catastro_m2)})`
                + `${exacta ? '' : ` · lado ${t.lado}`} · confianza ${t.confianza}\n    ${t.por_que}`);
            console.log(`    { "nivel": ${pr.nivel}, "uso": "${t.uso}", "poligono": ${JSON.stringify(t.poligono)} }`);
        }
        for (const a of pr.avisos || []) console.log(`  ⚠ ${a}`);
    }
    console.log('\nCONSTRUCCIONES (Catastro)');
    for (const c of geo.construcciones || []) {
        console.log(`  ${c.cuenta ? '✓' : '·'} ${c.codigo}  ${String(c.uso).padEnd(16)} planta ${c.planta}`
            + `  ${fmt(c.superficie)} m²${c.cuenta ? '' : '  (no cuenta)'}`);
    }
    // Las esquinas del edificio en EPSG:25830: es como van las `zonas_fuera`
    // del plan (el lienzo cambia de origen al volver a medir; el mundo no).
    const ref = geo.georef?.bbox && geo.georef?.en_el_lienzo
        ? { dx: geo.georef.bbox[0] - geo.georef.en_el_lienzo.x,
            y0: geo.georef.bbox[3] + geo.georef.en_el_lienzo.y } : null;
    for (const c of geo.cuerpos || []) {
        if (ref) {
            console.log(`
CONTORNO de ${c.id} en EPSG:25830 (para las zonas del plan):`);
            for (const [x, y] of (c.contornos?.[0] || [])) {
                console.log(`  [${(x + ref.dx).toFixed(2)}, ${(ref.y0 - y).toFixed(2)}]`);
            }
        }
        const noViv = (c.usos_nivel || []).filter(u => !u.habitable);
        console.log(`\nCUERPO ${c.id}: ${fmt(c.superficie)} m² de huella · niveles ${JSON.stringify(c.niveles)}`
            + `${c.fuera ? ' · FUERA' : ''}`);
        const k = c.construccion || {};
        if (k.por_croquis) {
            // El croquis catastral dice qué hay DENTRO de este cuerpo, planta a planta.
            for (const d of k.detalle || []) {
                console.log(`  nivel ${d.nivel}: ${d.codigo} ${d.literal} ${fmt(d.superficie)} m²`
                    + ` ${d.cuenta ? '(cuenta)' : '(NO cuenta)'}`);
            }
            for (const n of k.niveles_de_otra_parcela || []) {
                console.log(`  nivel ${n}: nada de esta parcela (es de un vecino: casa «maclada»)`);
            }
            if (c.habitable === false) {
                console.log(`  → sobra en los niveles ${JSON.stringify(c.niveles_fuera)}: va a \`cuerpos_fuera\`.`);
            }
        } else if (noViv.length && (c.usos_nivel || []).some(u => u.habitable)) {
            console.log(`  ⚠ mezcla vivienda con ${noViv.map(u => `${u.uso} ${u.superficie} m² (nivel ${u.nivel})`)
                .join(', ')}: Catastro no dibuja dónde está cada uso. Se mide la planta ENTERA;`
                + ' el garaje/porche se delimita en la ventana con «✂ Quitar una zona».');
        }
    }
    const diag = geo.diagnostico || {};
    for (const d of (Array.isArray(diag) ? diag : diag.avisos || [])) {
        console.log(`  · ${d.codigo || ''} ${d.mensaje || JSON.stringify(d)}`);
    }

    // El plano sobre la cartografía Y sobre la foto aérea, para decir qué foto
    // es de qué fachada y dónde está lo que no es vivienda.
    const out = opt('out') && opt('out') !== true ? opt('out')
        : path.join(CACHE, ctx.expediente.numero_expediente);
    fs.mkdirSync(out, { recursive: true });
    // Los documentos de la Sede del Catastro, para MIRARLOS (el PDF del croquis
    // por plantas) y para el certificador. El FXCC ya lo ha usado el motor.
    if (!RESTO.includes('--sin-sede')) {
        imprimirCatastro(await documentosCatastro(ctx, out), geo.catastro_fxcc);
    }
    let fT = null;
    if (t) { fT = path.join(out, 'trabajo.json'); fs.writeFileSync(fT, JSON.stringify(t)); }
    await dibujarPlanos(ctx, geo, out, 'plano', fT);
}

// ─── leer-pared ─────────────────────────────────────────────────────────────

async function leerPared() {
    const ctx = await cargar(POS[0]);
    const id = opt('pared');
    const ids = String(opt('fotos') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!id || !ids.length) throw new Error('Uso: leer-pared <clave> --pared FBE1 --fotos id1,id2');
    const geo = geoCacheada(ctx) || await geometria(ctx);
    const m = murosDe(geo).find(x => x.id === id);
    if (!m) throw new Error(`La pared ${id} no está en el plano (pasa antes «paredes»).`);
    const { fotos: cands } = await fotosSrv.candidatas(ctx.expediente);
    const imgs = [];
    for (const d of ids) {
        const f = await fotosSrv.bytesDe(ctx.expediente, d, { cands });
        imgs.push({ name: f.nombre, buffer: f.buffer, mimeType: f.mimeType });
    }
    const aspecto = aspectoDe(imgs[0].buffer);
    const lectura = await paredOcr.leerFachada(imgs,
        { nombre: m.id, orientacion: m.orientacion, largo: m.largo, alto: m.alto }, { aspecto });
    console.log(JSON.stringify({ pared: { id: m.id, largo: m.largo, alto: m.alto, orientacion: m.orientacion },
                                 aspecto, ...lectura }, null, 1));
    console.log('\nLo leído NACE DUDOSO: compruébalo contra la foto antes de pasarlo al plan.');
}

// ─── eprel ──────────────────────────────────────────────────────────────────

const EPREL = 'https://eprel.ec.europa.eu';
const CAB_EPREL = { Referer: `${EPREL}/screen/product/spaceheaters`, Origin: EPREL,
                    Accept: 'application/json, application/pdf, */*' };

async function eprel() {
    const codigo = POS[0];
    if (!codigo) throw new Error('Uso: eprel <código del modelo> [--out DIR]');
    const out = opt('out') && opt('out') !== true ? opt('out') : path.join(CACHE, 'eprel');
    fs.mkdirSync(out, { recursive: true });
    const hallados = [];
    for (const grupo of ['spaceheaters', 'waterheaters', 'airconditioners']) {
        const r = await fetch(`${EPREL}/api/products/${grupo}?_page=1&_limit=10&modelIdentifier=${
            encodeURIComponent(codigo)}`, { headers: CAB_EPREL });
        if (!r.ok) { console.log(`  ${grupo}: ${r.status}`); continue; }
        const d = await r.json().catch(() => ({}));
        for (const h of d.hits || []) hallados.push({ grupo, ...h });
    }
    if (!hallados.length) { console.log(`EPREL no tiene «${codigo}».`); return; }
    for (const h of hallados) {
        const reg = h.eprelRegistrationNumber || h.registrationNumber;
        console.log(`\n${h.grupo} · ${reg} · ${h.supplierOrTrademark} ${h.modelIdentifier}`);
        console.log(`  ${EPREL}/screen/product/${h.grupo}/${reg}`);
        for (const [q, nombre] of [[`fiches?language=ES`, `eprel_fiche_${reg}_ES.pdf`],
                                   [`labels?format=PDF`, `eprel_label_${reg}.pdf`]]) {
            const r = await fetch(`${EPREL}/api/products/${h.grupo}/${reg}/${q}`,
                                  { headers: CAB_EPREL, redirect: 'follow' });
            const b = Buffer.from(await r.arrayBuffer());
            if (r.ok && b.slice(0, 4).toString() === '%PDF') {
                fs.writeFileSync(path.join(out, nombre), b);
                console.log(`  → ${path.join(out, nombre)} (${kb(b.length)})`);
            } else console.log(`  ✗ ${q}: ${r.status}`);
        }
    }
}

// ─── alta-aerotermia ────────────────────────────────────────────────────────

/** «1,3-4» → [0,2,3] (índices de página). */
function paginas(spec, total) {
    if (!spec) return [...Array(total).keys()];
    return spec.split(',').flatMap((t) => {
        const [a, b] = t.split('-').map(Number);
        return b ? [...Array(b - a + 1).keys()].map(k => a - 1 + k) : [a - 1];
    }).filter(i => i >= 0 && i < total);
}

async function altaAerotermia() {
    const fJson = opt('json');
    if (!fJson || fJson === true) throw new Error('Uso: alta-aerotermia --json datos.json [...]');
    const datos = JSON.parse(fs.readFileSync(fJson, 'utf8'));
    const { buildPayload } = require('../routes/aerotermia');
    const payload = buildPayload(datos);

    console.log('\nFILA QUE SE DA DE ALTA');
    for (const [k, v] of Object.entries(payload)) if (v !== null && v !== false) console.log(`  ${k.padEnd(22)} ${v}`);

    // ¿YA está? Por el código de placa, con la MISMA casación que el lector.
    const m = await placaEquipo.casarConCatalogo(
        { marca: payload.marca, modelo: payload.modelo_ud_exterior || payload.modelo_conjunto },
        { marca: payload.marca, modelo: payload.modelo_ud_interior });
    if (m.modelo) throw new Error(`YA está en el catálogo: id ${m.modelo.id} (${m.modelo.modelo_comercial}). No se duplica.`);

    // El SCOP y el η declaran lo mismo: SCOP = 2,5 · (η + 3) / 100 (Rgto. 813/2013).
    const avisos = [];
    for (const [s, e] of [['scop_cal_calido_35', 'eta_calida_35'], ['scop_cal_calido_55', 'eta_calida_55'],
                          ['scop_cal_medio_35', 'eta_media_35'], ['scop_cal_medio_55', 'eta_media_55']]) {
        if (payload[s] == null || payload[e] == null) {
            if (/calido/.test(s)) avisos.push(`FALTA ${s}: es el que justifica una zona cálida (A-D).`);
            continue;
        }
        const esperado = Math.round(2.5 * (payload[e] + 3)) / 100;
        if (Math.abs(esperado - payload[s]) > 0.05) {
            avisos.push(`${s} = ${payload[s]} no casa con ${e} = ${payload[e]} (daría ${esperado}): revísalo en la ficha.`);
        }
    }
    avisos.forEach(a => console.log(`  ⚠ ${a}`));

    // La FICHA: las páginas que justifican los datos, más la EPREL y la etiqueta.
    const { PDFDocument } = require('pdf-lib');
    const piezas = [];
    const ft = opt('ficha');
    if (ft && ft !== true) {
        const [f, spec] = ft.split(/:(?=[\d,-]+$)/);
        piezas.push({ fichero: f, spec, nombre: path.basename(f) });
    }
    for (const k of ['eprel-fiche', 'eprel-label']) {
        const f = opt(k);
        if (f && f !== true) piezas.push({ fichero: f, spec: null, nombre: path.basename(f) });
    }
    let unida = null;
    const partes = [];
    if (piezas.length) {
        const doc = await PDFDocument.create();
        for (const p of piezas) {
            const src = await PDFDocument.load(fs.readFileSync(p.fichero), { ignoreEncryption: true });
            const idx = paginas(p.spec, src.getPageCount());
            const copiadas = await doc.copyPages(src, idx);
            copiadas.forEach(pg => doc.addPage(pg));
            // La MISMA forma que `fichaConsolidada` (el gestor de anexos la pinta:
            // «📎 Conjunto de 3 documentos · 8 págs»).
            const recortadas = src.getPageCount() - idx.length;
            partes.push({ nombre: p.nombre, paginas: idx.length, ...(recortadas > 0 ? { recortadas } : {}) });
        }
        unida = Buffer.from(await doc.save());
        console.log(`\nFICHA unida: ${partes.map(p => `${p.nombre} (${p.paginas} pág)`).join(' + ')} · ${kb(unida.length)}`);
    } else console.log('\n⚠ Sin ficha técnica: el certificado no tendrá con qué justificar el SCOP.');

    if (!ESCRIBIR) { console.log('\nEN SECO. Pásale --escribir para darlo de alta.'); return; }

    await supabase.from('aerotermia_marcas').upsert({ nombre: payload.marca },
                                                   { onConflict: 'nombre', ignoreDuplicates: true });
    const { data: fila, error } = await supabase.from('aerotermia').insert(payload).select('id').single();
    if (error) throw new Error(`No se ha podido dar de alta: ${error.message}`);
    console.log(`\n✓ Alta: aerotermia id ${fila.id}`);
    if (unida) {
        const { guardarFichaEnCatalogo } = require('../services/catalogoFichas');
        const g = await guardarFichaEnCatalogo('aerotermia', fila.id, {
            buffer: unida, sustituir: true,
            partes: partes.length > 1 || partes.some(p => p.recortadas)
                ? { at: new Date().toISOString(), paginas: partes.reduce((s, p) => s + p.paginas, 0), piezas: partes }
                : null,
        });
        console.log(g.ok ? `✓ Ficha en el catálogo: ${g.link}` : `✗ Ficha: ${g.motivo}`);
    }
}

// ─── aplicar ────────────────────────────────────────────────────────────────

/**
 * El PLAN (JSON), escrito por quien ha mirado las fotos:
 * {
 *   "aerotermia_id": 540,                 // del catálogo (op: va a los inputs)
 *   "placa_aerotermia": { exterior, interior },   // lo leído (opcional, metadatos)
 *   "caldera": { "nombre": "CALDERA …", "potencia_kw": 43, "da_acs": false },
 *   "acs_aparte": { "nombre": "TERMO ELÉCTRICO", "litros": 80 } | null,
 *   "ventanas": { "vidrio": "Doble", "marco": "PVC", "persiana": true },
 *   "entrada": "FBE1",
 *   "huecos": { "FBE1": [ { "tipo": "puerta"|"ventana", "ancho": 0.9, "alto": 2.1,
 *                           "por_que": "…", "foto": "<driveId>", "box": {x,y,ancho,alto} } ] },
 *   "fotos": { "FBE1": ["<driveId>"] },
 *   "excluidas": [], "cuerpos_fuera": [], "zonas_fuera": [],
 *   "ajustes": { … }                       // cualquier otro ajuste, tal cual
 * }
 */
async function aplicar() {
    await saludMotor();
    const ctx0 = await cargar(POS[0]);
    const fPlan = opt('plan');
    if (!fPlan || fPlan === true) throw new Error('Uso: aplicar <clave> --plan plan.json [--escribir]');
    const plan = JSON.parse(fs.readFileSync(fPlan, 'utf8'));
    const e0 = ctx0.expediente;
    const avisos = [];

    // 1. La AEROTERMIA real. En una oportunidad va a los INPUTS, con los mismos
    //    campos que pone el botón «Leer la placa» de la calculadora
    //    (`aplicarModeloLeido`): el expediente la hereda al aceptar.
    let patchInputs = null;
    let aeroExpediente = null;           // { inst, temp, acs } — expediente CAE
    if (plan.aerotermia_id) {
        const { data: mod } = await supabase.from('aerotermia').select('*').eq('id', plan.aerotermia_id).maybeSingle();
        if (!mod) throw new Error(`No existe la aerotermia ${plan.aerotermia_id} en el catálogo.`);
        if (ctx0.origen === 'cae') {
            const act = e0.instalacion?.aerotermia_cal?.aerotermia_db_id;
            if (String(act || '') !== String(mod.id)) {
                // Un equipo YA elegido no se sustituye en silencio: eso lo decide
                // una persona (`"aerotermia_sustituir": true` en el plan).
                if (act && !plan.aerotermia_sustituir) {
                    avisos.push(`El expediente declara la aerotermia ${act} y el plan dice ${mod.id}: `
                        + 'no se sustituye sin «aerotermia_sustituir: true» (o cámbiala en Instalación).');
                } else {
                    aeroExpediente = await aerotermiaParaExpediente(e0, mod);
                    console.log(`\nAEROTERMIA del EXPEDIENTE → ${mod.marca} ${aeroExpediente.inst.aerotermia_cal.modelo}`
                        + ` (id ${mod.id}) · SCOP ${aeroExpediente.inst.aerotermia_cal.scop}`
                        + ` (${aeroExpediente.inst.aerotermia_cal.scop_temporada}, ${aeroExpediente.temp} °C)`
                        + (aeroExpediente.acs ? ` · ACS del conjunto SCOP_dhw ${aeroExpediente.inst.aerotermia_acs.scop}` : ''));
                }
            }
        } else if (ctx0.origen === 'op') {
            const calc = await esm('calculator/logic/calculation.js');
            const inp = inputsDe(ctx0);
            //: El emisor del PRESUPUESTO (splits/conductos en un RES080) manda sobre el
            //: de la simulación: de él cuelgan la temperatura del SCOP y si la medida da frío.
            const emisor = plan.emisor || inp.emitterType || 'radiadores_convencionales';
            const temp = emisor === 'radiadores_convencionales' ? 55 : (emisor === 'radiadores_baja_temp' ? 45 : 35);
            patchInputs = {
                aerothermiaModel: String(mod.id),
                customModelName: '',
                scopHeating: calc.getScopFromModel(mod, inp.zona, temp),
                scopTemporada: calc.getScopSeason(mod, inp.zona, temp),
                scopAcs: calc.getScopAcsFromModel(mod, inp.zona),
                //: Varias unidades iguales (splits de un RES080): la potencia es la suma.
                potenciaBomba: Math.round((Number(mod.potencia_calefaccion) || Number(inp.potenciaBomba) || 0)
                    * (Number(plan.unidades) > 1 ? Number(plan.unidades) : 1) * 100) / 100,
                ...(plan.emisor ? { emitterType: plan.emisor } : {}),
                ...(plan.placa_aerotermia ? { placa_ocr: { at: new Date().toISOString(), ...plan.placa_aerotermia } } : {}),
            };
            if (plan.caldera?.potencia_kw) patchInputs.potenciaCaldera = Number(plan.caldera.potencia_kw);
            console.log(`\nAEROTERMIA → ${mod.marca} ${mod.modelo_comercial} (id ${mod.id}) · SCOP ${
                inp.scopHeating ?? '—'} → ${patchInputs.scopHeating} (${patchInputs.scopTemporada}, ${temp} °C)`);
        }
    }

    // 2. Con los inputs nuevos, el contexto se vuelve a cargar (en seco, en memoria).
    // Lo que ya está no se vuelve a escribir (ni se anota otra vez en el
    // historial): relanzar el plan tras corregir un hueco no cambia la simulación.
    if (patchInputs) {
        const inp = inputsDe(ctx0);
        const iguales = ['aerothermiaModel', 'scopHeating', 'potenciaCaldera', 'emitterType']
            .every(k => patchInputs[k] === undefined || String(inp[k]) === String(patchInputs[k]));
        if (iguales) patchInputs = null;
    }
    let ctx = ctx0;
    if (patchInputs && ESCRIBIR) {
        const { error } = await supabase.rpc('oportunidad_merge_inputs', { p_id: e0.id, p_patch: patchInputs });
        if (error) throw new Error(`No se han podido guardar los inputs: ${error.message}`);
        await anotar(e0.id, `CEE inicial preparado por la skill: aerotermia ${patchInputs.aerothermiaModel}`
            + ` (SCOP ${patchInputs.scopHeating})${patchInputs.potenciaCaldera ? `, caldera ${patchInputs.potenciaCaldera} kW` : ''}`
            + (patchInputs.emitterType ? `, emisor ${patchInputs.emitterType}` : '')
            + '. La simulación hay que RECALCULARLA en la calculadora y guardarla.');
        ctx = await cargar(POS[0]);
    } else if (patchInputs) {
        const dc = ctx.expediente.oportunidades.datos_calculo;
        dc.inputs = { ...dc.inputs, ...patchInputs };
        const { oportunidadComoExpediente } = await esm('cee-envolvente/logic/oportunidad.js');
        const exp = oportunidadComoExpediente(ctx.expediente.oportunidades, { cliente: ctx.cliente });
        const { data: mod } = await supabase.from('aerotermia').select('*').eq('id', plan.aerotermia_id).maybeSingle();
        exp.instalacion.aerotermia_cal = { ...exp.instalacion.aerotermia_cal, marca: mod.marca,
            modelo: mod.modelo_comercial || mod.modelo_conjunto || mod.modelo_ud_exterior || '' };
        ctx = { ...ctx, expediente: exp, modelos: { ...ctx.modelos, [mod.id]: mod } };
    }

    // 2b. En un EXPEDIENTE, la aerotermia va a su INSTALACIÓN con los mismos
    //     campos que escribe el desplegable de Instalación (`handleModeloChange`)
    //     y, si el equipo es un CONJUNTO con ACS, el nodo de ACS con
    //     `nodoAcsDesdeConjunto` (lo mismo que «Leer placas»). El ahorro del
    //     expediente se recalcula solo al abrirlo: sale del SCOP guardado.
    if (aeroExpediente) {
        if (ESCRIBIR) {
            const { data: fresca } = await supabase.from('expedientes')
                .select('instalacion').eq('id', e0.id).maybeSingle();
            const inst = { ...(fresca?.instalacion || {}), ...aeroExpediente.cambios };
            const { error } = await supabase.from('expedientes')
                .update({ instalacion: inst, updated_at: new Date().toISOString() }).eq('id', e0.id);
            if (error) throw new Error(`No se ha podido guardar la aerotermia: ${error.message}`);
            const a = aeroExpediente.inst.aerotermia_cal;
            await anotarExpediente(e0.id, `Aerotermia del presupuesto puesta por la skill generar-cee-inicial: `
                + `${a.marca} ${a.modelo} (catálogo ${a.aerotermia_db_id}), SCOP ${a.scop} (${a.scop_temporada})`
                + (aeroExpediente.acs ? `, ACS del conjunto SCOP_dhw ${aeroExpediente.inst.aerotermia_acs.scop}` : '')
                + '. Sin placa: el nº de serie queda por poner.');
            ctx = await cargar(POS[0]);
        } else {
            ctx = { ...ctx, expediente: { ...ctx.expediente, instalacion: aeroExpediente.inst } };
        }
        ctx = { ...ctx, modelos: { ...(ctx.modelos || {}), [aeroExpediente.mod.id]: aeroExpediente.mod } };
    }

    // 3. La geometría, con lo que el plan deja fuera.
    //
    //    El CROQUIS manda sobre las zonas de SUS plantas: describe la planta
    //    entera (dónde está el garaje, el porche…) y el motor lo ajusta a los m²
    //    de Catastro. Las zonas de las plantas que no trae se conservan.
    const prev = await cex.leerTrabajo(ctx.expediente.id, ctx.origen).catch(() => null);
    const cuerpos = plan.cuerpos_fuera ?? prev?.cuerpos_fuera ?? null;
    let zonas = plan.zonas_fuera ?? prev?.zonas_fuera ?? null;
    const croquis = Array.isArray(plan.croquis) && plan.croquis.length ? plan.croquis : null;
    if (croquis) {
        const niveles = new Set(croquis.map(c => Number(c.nivel)));
        zonas = (zonas || []).filter(z => !niveles.has(Number(z.nivel)));
    }
    // La ALTURA DE PLANTA: la del plan, o la ya guardada. Se mide con ella y la
    // ficha la declara (`ajustes.altura_libre_planta`): las dos cosas a la vez.
    const altura = Number(plan.altura_planta) > 0 ? Number(plan.altura_planta)
        : (Number(prev?.ajustes?.altura_libre_planta) > 0 ? Number(prev.ajustes.altura_libre_planta) : null);
    // El SEMISÓTANO y las unidades de OTRA parcela: los del plan funden sobre
    // los guardados (se guardan con el resto de los ajustes).
    const ajustesGeo = { ...(prev?.ajustes || {}), ...(plan.ajustes || {}) };
    const geo = await geometria(ctx, { cuerpos, zonas, recorte: prev?.recorte_vivienda || null,
                                       croquis, ajustar: plan.croquis_ajustar !== false, altura,
                                       ajustes: ajustesGeo });
    console.log(`\nALTURA DE PLANTA ${fmt(alturaMedida(geo))} m${altura ? '' : ' (por defecto)'}`);
    if (croquis) {
        const etiqueta = n => (geo.plantas || []).find(p => p.nivel === n)?.id || (n === 0 ? 'PB' : `P${n}`);
        const hechas = (geo.croquis_ajustado || []).map(z => ({
            nivel: z.nivel, planta: etiqueta(z.nivel), uso: z.uso, poligono: z.poligono,
            area_m2: z.area_m2,
        }));
        console.log('\nCROQUIS ajustado:');
        for (const z of geo.croquis_ajustado || []) {
            console.log(`  ${etiqueta(z.nivel)} ${z.uso.padEnd(22)} ${fmt(z.area_m2)} m²`
                + `${z.catastro_m2 ? `  (Catastro ${fmt(z.catastro_m2)})` : ''} · dibujado ${fmt(z.dibujado_m2)} · ${z.de}`);
        }
        zonas = [...(zonas || []), ...hechas];
    }
    const muros = murosDe(geo);
    const porId = Object.fromEntries(muros.map(m => [m.id, m]));
    const { admiteHuecos } = await esm('cee-envolvente/logic/tiposPared.js');
    const { lienzoAMundo } = await esm('cee-envolvente/logic/geometriaPlano.js');
    const { estadoDeTrabajo, senaladoDe, nuevoUid } = await esm('cee-envolvente/logic/senalado.js');

    // 4. El TRABAJO, con la forma exacta que guarda la ventana.
    if (plan.entrada && !porId[plan.entrada]) throw new Error(`La entrada ${plan.entrada} no es ninguna pared.`);
    const huecos = {};
    const marcas = [];                    // [{ clave, drive_id, uid, box }]
    const n = { puerta: 0, ventana: 0 };
    for (const [id, lista] of Object.entries(plan.huecos || {})) {
        const m = porId[id];
        if (!m) throw new Error(`La pared ${id} no está en el plano.`);
        if (!admiteHuecos({ ...m })) throw new Error(`${id} es ${m.tipo}: no admite huecos (solo fachadas).`);
        huecos[id] = (lista || []).map((h) => {
            const tipo = h.tipo === 'puerta' ? 'puerta' : 'ventana';
            n[tipo] += 1;
            const uid = nuevoUid();
            if (h.foto && h.box) marcas.push({ clave: id, drive_id: h.foto, uid, box: h.box });
            return {
                uid, nombre: `${tipo === 'puerta' ? 'P' : 'V'}${n[tipo]}`, tipo,
                ancho: Number(h.ancho), alto: Number(h.alto),
                // Lo leído de una foto NACE DUDOSO: lo confirma el certificador.
                estado: h.estado === 'medido' ? 'medido' : 'dudoso',
                por_que: h.por_que || 'estimado de la foto: confírmalo',
                ...(h.marco ? { marco: h.marco } : {}),
                ...(h.vidrio ? { vidrio: h.vidrio } : {}),
                // Una puerta de patio ACRISTALADA no es una puerta de entrada:
                // su % de marco (30-40) es lo que la distingue en CE3X.
                ...(Number(h.porc_marco) > 0 ? { porc_marco: Number(h.porc_marco) } : {}),
                ...(h.persiana !== undefined ? { persiana: !!h.persiana } : {}),
                //: Se sustituye en la reforma: «V1 - CAMBIA» (solo el nombre, como en la ventana).
                ...(h.cambia ? { cambia: true } : {}),
            };
        });
    }
    const ajustes = {
        ...(prev?.ajustes || {}),
        persiana_defecto: true,
        ...(plan.ventanas ? { ventanas: { ...plan.ventanas, de: 'fotos del expediente (skill generar-cee-inicial)' } } : {}),
        ...(altura ? { altura_libre_planta: altura } : {}),
        ...(plan.ajustes || {}),
    };
    // Los AIRES ACONDICIONADOS que ya tiene la vivienda: con el MISMO bloque de
    // la ventana (`airesAcondicionados`). En un CAE, «Equipo de sólo
    // refrigeración» (máquina frigorífica, 250 %); en un CEE directo, «calefacción
    // y refrigeración». Sustituyen a los que puso el bloque (`aire: true`), nunca
    // se suman. `"aires": true` = los que confirmó el cliente; `{ "n": 2 }` a mano.
    if (plan.aires) {
        const f = await esm('cee-envolvente/logic/fichaCe3x.js');
        const conf = f.airesDelCliente(ctx.expediente);
        const n = Number(plan.aires?.n) || conf?.num || 1;
        const modo = plan.aires?.modo || conf?.modo || 'refrigeracion';
        const superficie = Number(plan.aires?.superficie) || Number(ajustes.superficie_util_habitable)
            || Number(inputsDe(ctx).superficieCalefactable || inputsDe(ctx).superficie) || null;
        ajustes.equipos_extra = [
            ...(ajustes.equipos_extra || []).filter(x => !x.aire),
            ...f.airesAcondicionados({ n, modo, superficie }),
        ];
        console.log(`AIRES ACONDICIONADOS → ${n} · ${modo === 'climatizacion' ? 'calefacción y refrigeración' : 'máquina frigorífica (sólo refrigeración)'}`
            + `${superficie ? ` · ${fmt(superficie)} m²` : ''}`);
    }
    // La caldera: lo que dice su placa. «da_acs: false» = solo calefacción, que es
    // el USO que se cambia en Instalaciones cuando el ACS lo hace otro aparato.
    if (plan.caldera) {
        ajustes.instalacion = {
            ...(ajustes.instalacion || {}),
            ...(plan.caldera.nombre ? { nombre: plan.caldera.nombre } : {}),
            ...(plan.caldera.potencia_kw ? { potencia: String(plan.caldera.potencia_kw) } : {}),
            ...(plan.caldera.da_acs === false ? { slot: 'calefaccion' } : {}),
        };
    }
    if (plan.acs_aparte) {
        const litros = Number(plan.acs_aparte.litros) || 0;
        ajustes.equipos_extra = [
            ...(ajustes.equipos_extra || []).filter(x => x.slot !== 'ACS'),
            { slot: 'ACS', nombre: plan.acs_aparte.nombre || 'TERMO ELÉCTRICO', pct_acs: '100',
              ...(litros > 0 ? { acumulacion: true, litros_acumulacion: litros } : {}) },
        ];
    }
    // Los LUCERNARIOS, por planta (la de ARRIBA: van en su cubierta). Cada
    // planta que trae el plan SUSTITUYE la suya; las demás se conservan. Nacen
    // dudosos, como los huecos: su medida sale de una foto.
    // Con `reemplazar` los huecos del plan sustituyen a TODOS los guardados, y
    // un lucernario es un hueco más: conservarlo dejaba uno colgando de una
    // planta que ya no existe (el .cex no se escribía).
    let lucernarios = !plan.reemplazar && prev?.lucernarios ? { ...prev.lucernarios } : null;
    if (Array.isArray(plan.lucernarios) && plan.lucernarios.length) {
        lucernarios = lucernarios || {};
        const idsPlanta = new Set((geo.plantas || []).map(p => p.id));
        const porPlanta = {};
        for (const l of plan.lucernarios) {
            const planta = l.planta || (geo.plantas || []).at(-1)?.id;
            if (!idsPlanta.has(planta)) throw new Error(`Lucernario en la planta ${planta}, que no está en el plano.`);
            (porPlanta[planta] ||= []).push(l);
        }
        let k = 0;
        for (const [planta, lista] of Object.entries(porPlanta)) {
            lucernarios[planta] = lista.map(l => ({
                uid: nuevoUid(), nombre: `L${++k}`, tipo: 'lucernario',
                ancho: Number(l.ancho) || 1, alto: Number(l.alto) || 1,
                estado: l.estado === 'medido' ? 'medido' : 'dudoso',
                por_que: l.por_que || 'estimado de las fotos: confírmalo',
                ...(l.marco ? { marco: l.marco } : {}),
                ...(l.vidrio ? { vidrio: l.vidrio } : {}),
                ...(Number(l.porc_marco) > 0 ? { porc_marco: Number(l.porc_marco) } : {}),
            }));
            console.log(`LUCERNARIOS ${planta}: ${lucernarios[planta].map(l => `${l.nombre} ${fmt(l.ancho)} × ${fmt(l.alto)} m`).join(' · ')}`);
        }
    }
    const trabajo = {
        //: `"entrada": null` en el plan la QUITA (se entra por el portal del bloque).
        entrada: 'entrada' in plan ? (plan.entrada || null) : (prev?.entrada || null), sel: null,
        huecos: { ...(plan.reemplazar ? {} : (prev?.huecos || {})), ...huecos },
        particiones: plan.particiones ?? prev?.particiones ?? [],
        excluidas: plan.excluidas ?? prev?.excluidas ?? [],
        revisadas: prev?.revisadas || [],
        cambian: prev?.cambian || [],
        cubierta_reforma: prev?.cubierta_reforma || {},
        ...(lucernarios ? { lucernarios } : {}),
        // `tipos` del plan: { pared: 'FACHADA'|'MEDIANERA'|'PARTICION_VERTICAL' } —
        // lo mismo que «da contra» en el panel de la pared (una medianera que en
        // realidad da a la calle). `orientaciones`: { pared: 'S' } si hace falta rumbo.
        tipos: { ...(prev?.tipos || {}), ...(plan.tipos || {}) },
        nombres: prev?.nombres || {}, us: prev?.us || {},
        // `pilares` del plan: { pared: nº } — a 0 no se escribe el puente (un
        // quiebro de 30 cm no tiene pilares integrados, y el mínimo estimado es 2).
        orientaciones: { ...(prev?.orientaciones || {}), ...(plan.orientaciones || {}) },
        pilares: { ...(prev?.pilares || {}), ...(plan.pilares || {}) },
        paredes: prev?.paredes || { movidas: {}, dibujadas: [] },
        cuerpos_fuera: cuerpos || [], recorte_vivienda: prev?.recorte_vivienda || null,
        zonas_fuera: zonas || [],
        lienzo_ref: lienzoAMundo(geo.georef),
        ajustes,
    };

    // El PLANO con el resultado (paredes, huecos y zonas) sobre la cartografía
    // y sobre la foto aérea: es lo que se mira para dar el croquis por bueno
    // —¿cae el garaje donde se ve la entrada de coches?— antes de escribir nada.
    try {
        const out = path.join(CACHE, ctx.expediente.numero_expediente);
        fs.mkdirSync(out, { recursive: true });
        const fT = path.join(out, 'trabajo_plan.json');
        fs.writeFileSync(fT, JSON.stringify(trabajo));
        await dibujarPlanos(ctx, geo, out, 'plano_plan', fT);
    } catch (e) { console.log(`(sin plano: ${String(e.stdout || e.message).trim().slice(0, 120)})`); }

    // 5. Lo SEÑALADO: la misma traducción que hace la ventana (`loSenalado`).
    const st = estadoDeTrabajo(geo, trabajo);
    const envolvente = senaladoDe(st, ajustes, { lienzoAMundo: st.lienzoAMundo });

    // 6a. Una OPORTUNIDAD aún no tiene certificador ni fechas del CEE, y sin los
    //     datos del técnico CE3X 3.1 califica pero NO escribe el XML («Revise …
    //     Datos Administrativos»). El plan puede declararlos: `tecnico` (el
    //     id_empresa del certificador que firma) y `fechas` ({emision, visita},
    //     AAAA-MM-DD). Lo de un expediente manda: aquí solo se rellena lo que falta.
    if (plan.tecnico && !ctx.certificador) {
        ctx.certificador = await cex.leerCertificador(String(plan.tecnico));
        if (!ctx.certificador) throw new Error(`El técnico ${plan.tecnico} no está en prescriptores.`);
        avisos.push(`Técnico certificador del plan: ${ctx.certificador.razon_social} (la oportunidad no tiene uno asignado).`);
    }
    if (plan.fechas && (plan.fechas.emision || plan.fechas.visita)) {
        const cee0 = ctx.expediente.cee || {};
        ctx.expediente = { ...ctx.expediente, cee: {
            ...cee0,
            fecha_firma_cee_inicial: cee0.fecha_firma_cee_inicial || plan.fechas.emision || null,
            fecha_visita_cee_inicial: cee0.fecha_visita_cee_inicial || plan.fechas.visita || null,
        } };
    }

    // 6b. Sin aerotermia ELEGIDA, la medida puede ir con la GENÉRICA de la
    //     simulación (`aerotermia_generica: true`): la MISMA función que usa la
    //     revisión del CEE (`conAerotermiaSimulada`), con el SCOP, el SCOP_dhw y la
    //     potencia de la oportunidad. Lo que se teclee en `ajustes.instalacion_final`
    //     (el uso, el SEER) se le aplica igual que en la ventana.
    if (plan.aerotermia_generica) {
        const { conAerotermiaSimulada } = await esm('cee-envolvente/logic/fichaCe3x.js');
        let exp = ctx.expediente;
        if (!exp.oportunidad?.datos_calculo && !exp.oportunidades?.datos_calculo) {
            const idOp = ctx.origen === 'op' ? exp.id : exp.oportunidad_id;
            const { data } = await supabase.from('oportunidades')
                .select('scopHeating:datos_calculo->inputs->scopHeating, scopAcs:datos_calculo->inputs->scopAcs, '
                        + 'potenciaBomba:datos_calculo->inputs->potenciaBomba, changeAcs:datos_calculo->inputs->changeAcs')
                .eq('id', idOp).maybeSingle();
            exp = { ...exp, oportunidad: { datos_calculo: { inputs: data || {} } } };
        }
        const sim = conAerotermiaSimulada(exp);
        if (sim.simulada) { ctx.expediente = sim.expediente; avisos.push(sim.aviso); }
        else avisos.push('aerotermia_generica: el expediente ya declara su aerotermia (o la simulación no tiene SCOP): se usa la suya.');
    }

    // 6. La ficha, por el MISMO camino que el botón.
    const { ficha, avisos: avFicha, imagenesFallidas = [] } = await cex.componerFicha(ctx, {
        geometria: geo.geometria, envolvente, ajustes, conImagenes: true, fase: 'inicial',
        //: Las medidas de mejora que se piden (`["autoconsumo"]`). Sin esta clave
        //: mandan las que trae marcadas la fase, como en la ventana.
        medidas: Array.isArray(plan.medidas) ? plan.medidas : null,
    });
    avisos.push(...avFicha);
    const g = ficha.generales;
    console.log(`\nFICHA · ${g.ano_construccion.valor} · zona ${g.zona_climatica_he1.valor}`
        + ` · ${g.superficie_util_habitable.valor} m² · ${g.n_plantas_habitables.valor} planta(s)`);
    for (const eq of ficha.instalaciones || []) {
        console.log(`  instalación [${eq.slot}] ${eq.nombre} · ${eq.generador} · ${eq.combustible}`
            + `${eq.potencia ? ` · ${eq.potencia} kW` : ''}${eq.pct_acs ? ` · ACS ${eq.pct_acs} %` : ''}`);
    }
    for (const med of ficha.medidas || []) {
        console.log(`  medida «${med.nombre}»: ${(med.instalaciones || []).map(x =>
            `[${x.slot}] ${x.nombre} ${x.rend_calefaccion || ''}${x.rend_acs ? `/${x.rend_acs}` : ''}`).join(' · ')}`);
    }
    if (!(ficha.medidas || []).length) avisos.push('La ficha NO lleva medida de mejora.');
    console.log(`  huecos: ${n.ventana} ventanas + ${n.puerta} puertas nuevas en el plan`
        + ` · entrada ${trabajo.entrada || '— sin señalar'}`);

    // 6b. El RESUMEN DE DECISIONES: lo que redacta quien hizo el plan (el
    //     porqué, que no se ve en el plano) y lo que el script sabe por sí solo.
    //     Va al sello del Agente IA y al croquis: es lo que lee quien revisa.
    const decisiones = resumenDecisiones({ plan, trabajo, geo, ficha,
        aerotermia: aeroExpediente?.inst?.aerotermia_cal || (patchInputs ? { aerotermia_db_id: patchInputs.aerothermiaModel,
            scop: patchInputs.scopHeating } : null) });
    console.log(`\nDECISIONES (${decisiones.length})\n  · ${decisiones.join('\n  · ')}`);

    // 7. El motor escribe el .cex.
    const r = await alMotor('/cex', { geometria: geo.geometria, datos: ficha }, 180_000);
    if (!r.ok) {
        const f = await r.json().catch(() => ({}));
        throw new Error(`El motor no ha escrito el .cex: ${f.detail || r.status}\n  ${avisos.join('\n  ')}`);
    }
    const fichero = Buffer.from(await r.arrayBuffer());
    const avMotor = JSON.parse(r.headers.get('X-Cee-Avisos') || '[]');
    const fd = new FormData();
    fd.append('fichero', new Blob([fichero]), 'x.cex');
    const leido = await (await fetch(`${MOTOR}/leer-cex`, { method: 'POST', body: fd })).json();
    console.log(`\n.cex · ${kb(fichero.length)} · releído ${leido.version} · errores ${leido.errores?.length ?? '?'}`);
    console.log(`  ${JSON.stringify(leido.resumen_envolvente)}`);
    if (imagenesFallidas.length) avisos.push(`Sin ${imagenesFallidas.join(' ni ')}: Catastro no ha respondido.`);

    const local = path.join(CACHE, `${cex.nombreDelCex(ctx.expediente, 'inicial')}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(local, fichero);
    console.log(`  copia local: ${local}`);

    if (!ESCRIBIR) {
        await hacerCroquis(ctx, { geo, trabajo, cexBytes: fichero, avisos: [...avisos, ...avMotor], decisiones });
        // Con --calificar, CE3X 3.1 (en este PC) lo califica y deja el XML y el
        // PDF junto a la copia local: para revisarlo antes de escribir nada.
        if (RESTO.includes('--calificar')) {
            console.log('\nCalificando con CE3X 3.1 (≈1 min)…');
            const cal = await cexAPdf.calificarCex(fichero);
            for (const [ext, b] of [['.xml', cal.xml], ['.pdf', cal.pdf]]) {
                if (b) fs.writeFileSync(local.replace(/\.cex$/i, ext), b);
            }
            for (const l of cexAPdf.lineasCalificado(cal)) console.log(l);
        }
        console.log('\nEN SECO: no se ha guardado nada. Pásale --escribir.');
    } else {
        await cex.guardarTrabajo(ctx.expediente.id, trabajo, ctx.origen);
        console.log('\n✓ Trabajo guardado: abre la envolvente y lo verás señalado (en ámbar lo dudoso).');
        for (const [clave, ids] of Object.entries(plan.fotos || {})) {
            for (const d of ids) {
                try { await fotosSrv.adoptar(ctx.expediente, clave, d, 'skill generar-cee-inicial'); }
                catch (err) { avisos.push(`Foto ${d} en ${clave}: ${err.message}`); }
            }
        }
        const porFoto = {};
        for (const mk of marcas) (porFoto[`${mk.clave}|${mk.drive_id}`] ||= []).push(mk);
        for (const [k, lista] of Object.entries(porFoto)) {
            const [clave, d] = k.split('|');
            try {
                await fotosSrv.guardarMarcas(ctx.expediente, clave, d,
                    lista.map(x => ({ uid: x.uid, box: x.box, de: 'lectura' })), { fundir: true });
            } catch (err) { avisos.push(`Marcas en ${clave}: ${err.message}`); }
        }
        const gd = await cex.guardarEnDrive(ctx, fichero, 'inicial');
        if (!gd.ok) throw new Error(`El .cex no ha llegado a Drive: ${gd.error}`);
        console.log(`✓ ${gd.nombre} → ${gd.carpeta}\n  ${gd.link}\n  carpeta: ${gd.carpeta_link}`);
        if (gd.archivado) console.log(`  (el anterior se ha archivado en OLD como «${gd.archivado}»)`);
        // El CROQUIS de lo escrito, junto al .cex: para revisar el borrador sin
        // abrir CE3X (y con lo POR CONFIRMAR en ámbar).
        const cq = await hacerCroquis(ctx, { geo, trabajo, cexBytes: fichero, avisos: [...avisos, ...avMotor], decisiones,
                                             ficheroCex: gd.nombre, escribir: true });
        if (cq.ok && cq.link) gd.croquis_link = cq.link;
        // Los documentos de la Sede del Catastro, en `CEE INICIAL / CATASTRO`:
        // el certificador los tiene al lado del borrador. Un fallo no para nada.
        if (!RESTO.includes('--sin-sede')) {
            const doc = await documentosCatastro(ctx);
            if (doc && Object.keys(doc.ficheros || {}).length) {
                const gc = await cex.guardarDocsCatastro(ctx, doc.ficheros, 'inicial');
                if (gc.ok) {
                    console.log(`✓ Documentos del Catastro → CATASTRO (${gc.subidos.length})\n  ${gc.carpeta_link}`);
                } else {
                    avisos.push(`Los documentos del Catastro no han llegado a Drive: ${gc.error}`);
                }
            }
        }
        // Su XML y su PDF oficial, calificados por CE3X 3.1 en este PC, junto al
        // .cex (`cee/cexAPdf.js`). Sin CE3X se dice y se sigue: el .cex ya está.
        if (!RESTO.includes('--sin-pdf')) {
            console.log('\nCalificando con CE3X 3.1 y generando el PDF (≈1 min)…');
            const cal = await cexAPdf.calificarYGuardar(ctx, 'inicial', gd.nombre, fichero);
            for (const l of cexAPdf.lineasCalificado(cal)) console.log(l);
        }
        // El AGENTE IA termina: la fase queda «pendiente de revisión» y se avisa
        // al equipo, como cuando un técnico sube su .cex. Va AQUÍ y no en la skill
        // para que no se pueda olvidar; `--sin-aviso` lo calla al relanzar.
        await avisarAgente(ctx, gd, [...avisos, ...avMotor], 'inicial', decisiones);
    }
    const todos = [...avisos, ...avMotor];
    if (todos.length) console.log(`\nAVISOS (${todos.length})\n  ⚠ ${todos.join('\n  ⚠ ')}`);
}

/**
 * El AGENTE IA ha terminado: fase «pendiente de revisión» (si el encargo es
 * suyo) y aviso al equipo por WhatsApp + email (`services/agenteIa.js`). Un
 * fallo aquí NUNCA deshace lo escrito: el `.cex` ya está en Drive.
 */
async function avisarAgente(ctx, gd, avisos, fase, decisiones = null) {
    try {
        const r = await require('../services/agenteIa').terminar({
            negocio: ctx.origen, clave: ctx.clave, fase,
            fichero: { nombre: gd.nombre, link: gd.link, carpeta_link: gd.carpeta_link,
                       croquis_link: gd.croquis_link || null },
            avisos, decisiones, aviso: !RESTO.includes('--sin-aviso'),
        });
        require('./agente_ia').informeTerminar(r);
    } catch (e) {
        console.log(`\n✗ AGENTE IA: el .cex está guardado, pero no se ha podido marcar ni avisar: ${e.message}`
            + `\n  Reintenta con: node scripts/agente_ia.js terminar ${ctx.clave}${fase === 'final' ? ' --fase final' : ''}`);
    }
}

/**
 * Una línea en el historial de la oportunidad. Es el MISMO patrón que
 * `anotarHistorial` de `routes/oportunidades.js` (el historial vive dentro de
 * `datos_calculo` y no tiene RPC propia); se relee justo antes de escribir para
 * no pisar lo que acaba de fundir `oportunidad_merge_inputs`.
 */
/**
 * La aerotermia del catálogo, puesta en la INSTALACIÓN de un expediente con los
 * MISMOS campos que el desplegable de Instalación (`handleModeloChange`):
 * SCOP y temporada por `getScopFromModel`/`getScopSeason` con la temperatura del
 * EMISOR, y si es un CONJUNTO con ACS (y el ACS entra en la obra), el nodo de ACS
 * con `nodoAcsDesdeConjunto` y `misma_aerotermia_acs: false` (regla 49: el
 * SCOP_dhw es PROPIO). Devuelve la instalación entera y solo las claves tocadas.
 */
async function aerotermiaParaExpediente(exp, mod) {
    const calc = await esm('calculator/logic/calculation.js');
    const { getEmitterTemp } = await esm('expedientes/logic/cifoDoc.js');
    const acsCat = await esm('expedientes/logic/acsCatalogo.js');
    const inst0 = exp.instalacion || {};
    const dc = exp.oportunidades?.datos_calculo || {};
    const zona = String(inst0.zona_climatica || dc.zona || dc.inputs?.zona || 'D3').toUpperCase();
    const temp = getEmitterTemp(inst0.tipo_emisor || dc.inputs?.emitterType);
    const previa = inst0.aerotermia_cal || {};
    const metodo = previa.metodo_scop || 'ficha';
    const aero = {
        ...previa,
        aerotermia_db_id: mod.id,
        marca: mod.marca,
        modelo_sin_repetir: true,
        modelo: mod.modelo_comercial || mod.modelo_conjunto || mod.modelo_ud_exterior || '',
        modelo_ud_exterior: mod.modelo_ud_exterior || '',
        modelo_ud_interior: mod.modelo_ud_interior || '',
        modelo_conjunto: mod.modelo_conjunto || '',
        scop: calc.getScopFromModel(mod, zona, temp, metodo),
        scop_temporada: calc.getScopSeason(mod, zona, temp, metodo),
        potencia: mod.potencia_calefaccion || mod.potencia_nominal_35 || 0,
        metodo_scop: metodo,
        url_eprel: mod.eprel, url_keymark: mod.url_keymark, url_ficha: mod.ficha_tecnica,
    };
    const cambios = { aerotermia_cal: aero, potencia_bomba: aero.potencia || inst0.potencia_bomba };
    let acs = false;
    if (inst0.cambio_acs !== false && acsCat.esConjuntoAcs(mod)) {
        const { metodo: mAcs } = acsCat.metodoAcsDelModelo(mod, zona);
        if (mAcs) {
            cambios.aerotermia_acs = acsCat.nodoAcsDesdeConjunto(aero, mod, {
                metodo: mAcs,
                scop: calc.getScopAcsFromModel(mod, zona, mAcs),
                litros: acsCat.litrosAcsCatalogo(mod),
            });
            cambios.misma_aerotermia_acs = false;
            acs = true;
        }
    }
    return { inst: { ...inst0, ...cambios }, cambios, temp, acs, mod };
}

/** Una línea en el historial del EXPEDIENTE (lectura fresca de `documentacion`). */
async function anotarExpediente(id, texto) {
    const { data } = await supabase.from('expedientes').select('documentacion').eq('id', id).maybeSingle();
    const doc = data?.documentacion || {};
    const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
    historial.push({ id: `${Date.now()}_cee_inicial`, tipo: 'comentario', texto,
                     fecha: new Date().toISOString(), usuario: 'SISTEMA' });
    const { error } = await supabase.from('expedientes')
        .update({ documentacion: { ...doc, historial }, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) console.warn(`  (no se ha podido anotar en el historial: ${error.message})`);
}

async function anotar(oportunidadId, texto) {
    const { data } = await supabase.from('oportunidades')
        .select('datos_calculo').eq('id', oportunidadId).maybeSingle();
    const dc = data?.datos_calculo || {};
    const hist = Array.isArray(dc.historial) ? dc.historial : [];
    hist.push({ id: `${Date.now()}_cee_inicial`, tipo: 'comentario', texto,
                fecha: new Date().toISOString(), usuario: 'Sistema' });
    const { error } = await supabase.from('oportunidades')
        .update({ datos_calculo: { ...dc, historial: hist } }).eq('id', oportunidadId);
    if (error) console.warn(`  (no se ha podido anotar en el historial: ${error.message})`);
}

// ─── el resumen de decisiones ───────────────────────────────────────────────

/**
 * Lo que se decidió al preparar el CEE, en frases cortas: primero las que
 * escribe en el plan quien miró las fotos (`plan.decisiones`: el PORQUÉ, que no
 * se ve en el plano) y luego las que el script sabe solo — qué equipo, qué
 * caldera, qué zonas y con qué criterio, qué paredes se reclasificaron, cuántos
 * huecos y de dónde. Solo texto, con tope (regla 21).
 */
function resumenDecisiones({ plan = {}, trabajo = {}, geo = {}, ficha = null, aerotermia = null }) {
    const out = [];
    for (const d of (Array.isArray(plan.decisiones) ? plan.decisiones : []).slice(0, 12)) {
        if (typeof d === 'string' && d.trim()) out.push(d.trim());
    }
    const a = aerotermia;
    if (a?.aerotermia_db_id) {
        out.push(`Aerotermia: ${[a.marca, a.modelo].filter(Boolean).join(' ') || 'catálogo'} (catálogo ${a.aerotermia_db_id})`
            + `${a.scop ? ` · SCOP ${String(a.scop).replace('.', ',')}${a.scop_temporada ? ` (${a.scop_temporada})` : ''}` : ''}`
            + `${plan.placa_aerotermia ? ' · leída de su placa' : ' · del presupuesto'}`);
    }
    if (plan.caldera) {
        out.push(`Caldera actual: ${plan.caldera.nombre || 'sin nombre'}`
            + `${plan.caldera.potencia_kw ? ` · ${String(plan.caldera.potencia_kw).replace('.', ',')} kW (de su placa)` : ' · sin potencia leída'}`
            + `${plan.caldera.da_acs === false ? ' · solo calefacción' : ''}`);
    }
    if (plan.acs_aparte) out.push(`ACS aparte: ${plan.acs_aparte.nombre || 'termo eléctrico'}${plan.acs_aparte.litros ? ` de ${plan.acs_aparte.litros} l` : ''}`);
    if (plan.aires) out.push('Aires acondicionados existentes declarados (lo confirmó el cliente o se ven en las fotos)');
    const nombreNivel = n => (geo.plantas || []).find(p => Number(p.nivel) === Number(n))?.nombre || `nivel ${n}`;
    for (const z of geo.croquis_ajustado || []) {
        out.push(`${nombreNivel(z.nivel)}: ${z.uso} de ${String(Number(z.area_m2).toFixed(1)).replace('.', ',')} m² no cuenta`
            + `${z.catastro_m2 ? ` (Catastro declara ${String(Number(z.catastro_m2).toFixed(1)).replace('.', ',')})` : ''}`
            + `${z.de ? ` · ${z.de}` : ''}`);
    }
    if (!(geo.croquis_ajustado || []).length) {
        for (const z of trabajo.zonas_fuera || []) {
            out.push(`${z.planta || nombreNivel(z.nivel)}: ${z.uso} de ${String(Number(z.area_m2 || 0).toFixed(1)).replace('.', ',')} m² no cuenta`);
        }
    }
    if ((trabajo.cuerpos_fuera || []).length) out.push(`Cuerpos fuera de la envolvente: ${trabajo.cuerpos_fuera.length}`);
    if (trabajo.recorte_vivienda) out.push('Vivienda delimitada a mano dentro de la parcela (adosado)');
    for (const [id, t] of Object.entries(plan.tipos || {})) out.push(`${id} reclasificada a ${String(t).toLowerCase().replace('_', ' ')}`);
    for (const id of plan.excluidas || []) out.push(`${id} apartada de la envolvente`);
    for (const [id, lista] of Object.entries(plan.huecos || {})) {
        const n = (lista || []).length;
        if (!n) { out.push(`${id}: sin huecos`); continue; }
        const conFoto = (lista || []).filter(h => h.foto).length;
        out.push(`${id}: ${n} hueco${n === 1 ? '' : 's'}${conFoto ? ` (${conFoto} señalado${conFoto === 1 ? '' : 's'} en su foto)` : ''}`
            + `${(lista || []).every(h => h.estado !== 'medido') ? ' · medidas por confirmar' : ''}`);
    }
    if (plan.entrada) out.push(`Entrada por ${plan.entrada}`);
    if (Number(plan.altura_planta) > 0) out.push(`Altura de planta ${String(plan.altura_planta).replace('.', ',')} m`);
    for (const m of ficha?.medidas || []) out.push(`Medida de mejora: «${m.nombre}» (sin calcular)`);
    return out.slice(0, 30).map(d => (d.length > 300 ? `${d.slice(0, 299)}…` : d));
}

// ─── croquis ────────────────────────────────────────────────────────────────

/**
 * El CROQUIS en PDF de lo que hay en el `.cex`: un plano de obra por planta con
 * la marca, a escala (muros, huecos, cotas, lo que no es vivienda), y los cuadros
 * de huecos, superficies y cerramientos. Sin avisos: vale para una auditoría. Siempre deja una copia local;
 * con `escribir` lo sube junto al `.cex` (`… - CEE INICIAL_CROQUIS.pdf`).
 * Nunca lanza: un croquis que falla no puede tumbar el `.cex`, que ya está.
 */
async function hacerCroquis(ctx, { geo, trabajo, cexBytes, avisos = [], decisiones = null, fase = 'inicial',
                                   ficheroCex = null, escribir = false }) {
    const croq = require('../services/cee/croquisCee');
    try {
        const { pdf } = await croq.croquisPdf({
            cabecera: await croq.cabeceraDe(ctx, { fase,
                ficheroCex: ficheroCex || cex.nombreDelCex(ctx.expediente, fase) }),
            geo, trabajo, cexBytes, avisos,
            decisiones: decisiones || ctx.expediente?.cee?.agente_ia?.[fase]?.decisiones || null,
        });
        const local = path.join(CACHE, croq.nombreCroquis(ctx.expediente.numero_expediente, fase));
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(local, pdf);
        console.log(`\nCROQUIS · ${kb(pdf.length)} · copia local: ${local}`);
        if (!escribir) return { ok: true, local };
        const gd = await croq.guardarCroquisEnDrive(ctx, pdf, fase);
        if (!gd.ok) { console.log(`  ✗ el croquis no ha llegado a Drive: ${gd.error}`); return { ok: false, local }; }
        console.log(`✓ ${gd.nombre}\n  ${gd.link}`);
        return { ...gd, local };
    } catch (e) {
        console.log(`\n(sin croquis: ${e.message})`);
        return { ok: false, error: e.message };
    }
}

/**
 * `croquis <clave> [--escribir]`: el croquis de lo que YA hay — el trabajo
 * guardado en la ventana y el `.cex` de la carpeta —, sin volver a escribir
 * nada más. Es para los borradores generados antes de que existiera.
 */
async function croquis() {
    await saludMotor();
    const ctx = await cargar(POS[0]);
    const fase = opt('fase') === 'final' ? 'final' : 'inicial';
    const t = await cex.leerTrabajo(ctx.expediente.id, ctx.origen).catch(() => null);
    if (!t) throw new Error('Ese expediente no tiene trabajo de envolvente guardado.');
    const geo = await geometria(ctx, { cuerpos: t.cuerpos_fuera || null, zonas: t.zonas_fuera || null,
                                       recorte: t.recorte_vivienda || null,
                                       altura: t.ajustes?.altura_libre_planta || null });
    // El .cex ENTREGADO por el técnico si lo hay (es el que va al Registro); si
    // no, el borrador `_REVISAR` de la app.
    const croqSvc = require('../services/cee/croquisCee');
    const leido = await croqSvc.cexEntregadoDeFase(ctx, fase).catch(() => null)
        || await cex.leerCexDeFase(ctx, fase).catch(() => null);
    if (!leido) console.log(`(no hay .cex de la fase ${fase} en la carpeta: el croquis sale sin tablas)`);
    else console.log(`(.cex: ${leido.nombre})`);
    const avisos = [];
    await hacerCroquis(ctx, { geo, trabajo: t, cexBytes: leido?.bytes || null, avisos, fase,
                              ficheroCex: leido?.nombre, escribir: ESCRIBIR });
    if (!ESCRIBIR) console.log('\nEN SECO: no se ha subido a Drive. Pásale --escribir.');
}

// ─── main ───────────────────────────────────────────────────────────────────

const ORDENES = { estado, placas, fotos, paredes, catastro, 'leer-pared': leerPared, eprel,
                  'alta-aerotermia': altaAerotermia, aplicar, croquis };

(async () => {
    const f = ORDENES[ORDEN];
    if (!f) {
        console.log(`Órdenes: ${Object.keys(ORDENES).join(' · ')}\n`
            + 'Ver la cabecera de este fichero y skills/generar-cee-inicial/SKILL.md');
        process.exit(1);
    }
    await f();
    process.exit(0);
})().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
