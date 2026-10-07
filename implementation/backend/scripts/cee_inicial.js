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
//   node scripts/cee_inicial.js leer-pared <clave> --pared FBE1 --fotos id1,id2   (o frame:F1)
//   node scripts/cee_inicial.js video    <clave> [--archivo v.mp4] [--videos id1,id2] [--refrescar]
//   node scripts/cee_inicial.js pedir-fotos <clave> [--paredes FBN1,F1O1] [--sin-planos] [--enviar]
//   node scripts/cee_inicial.js eprel    <codigo del modelo> [--out DIR]
//   node scripts/cee_inicial.js alta-aerotermia --json datos.json
//            [--ficha ft.pdf[:1,3-4]] [--eprel-fiche f.pdf] [--eprel-label l.pdf] [--escribir]
//   node scripts/cee_inicial.js aplicar  <clave> --plan plan.json [--escribir] [--sin-aviso]
//            [--sin-pdf] [--calificar]
//   node scripts/cee_inicial.js instalacion <clave> --plan plan.json [--escribir]
//            (solo lo de las PLACAS a la app: sin .cex, sin Drive y sin avisar)
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
// VÍDEO (`video` y `pedir-fotos`): si el cliente manda un vídeo andando por la
// casa en vez de fotos de las paredes, `video` lo lee con Gemini, saca el
// fotograma de cada hueco, lo comprueba con OTRO modelo y pone cada hueco en su
// pared por planta y por lo que se ve por él (`utils/videoEnvolvente.js`). Lo
// que no se puede decidir NO se adivina: `pedir-fotos` prepara el WhatsApp al
// propietario con cada pared y su plano marcado en rojo (en seco; --enviar solo
// con su «sí»). Los fotogramas entran en el plan como `frame:H3`.
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
const { contrastarPlacaConRendimiento } = require('../utils/combustibleCaldera');
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
//: El técnico que FIRMA el .cex si el plan no dice otro y no hay un técnico de
//: verdad en la barra: Francisco Javier Moya López (`prescriptores.id_empresa`).
//: Decisión del usuario, 2026-10-06. `CEE_TECNICO_POR_DEFECTO` lo cambia.
const TECNICO_POR_DEFECTO = process.env.CEE_TECNICO_POR_DEFECTO || 'c05b23c1-aa81-4a9a-bd6b-b59cb65775c5';
const cexAPdf = require('../services/cee/cexAPdf');
const previstoSrv = require('../services/cee/previstoRes080');
const revisionPlano = require('../services/cee/revisionPlano');
const { respetarLoDibujado, medirHuecos } = require('../utils/loDibujadoAMano');

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
    const { semisotano, anexos, volumenes } = cex.declaracionesEdificio(ajustes);
    // Las mismas PISTAS que manda la ventana para proponer el croquis: las
    // fachadas en cuya foto hay una puerta de garaje.
    let pistas = null;
    try { pistas = fotosSrv.pistasCroquis(ctx.expediente); } catch { /* sin pista */ }
    const r = await alMotor('/envolvente', {
        referencia_catastral: rc, construcciones,
        ...(semisotano ? { semisotano } : {}),
        ...(anexos.length ? { anexos } : {}),
        ...(volumenes.length ? { volumenes } : {}),
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
    // Los VÍDEOS de la vivienda: si los hay, la orden `video` los lee.
    const vids = await videosDeDrive(ctx).catch(() => []);
    console.log(`  vídeos de la vivienda: ${vids.length
        ? `${vids.length} (${vids.map(v => v.name).join(' · ')}) → «video ${ctx.clave}»` : 'ninguno'}`);
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

    // Lo leído se guarda en disco (no se vuelve a pagar) y se propone el bloque
    // del PLAN: con él, `aplicar` lo escribe también en la app — en la
    // Instalación del expediente o en la oportunidad (`placasDelPlan`).
    const dir = path.join(CACHE, ctx.expediente.numero_expediente);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'placas.json'), JSON.stringify({
        at: new Date().toISOString(), caldera: c, unidades: a.unidades || {}, fotos: a.fotos || [],
        catalogo: m.modelo ? { id: m.modelo.id, modelo: m.modelo.modelo_comercial, por: m.por } : null,
        candidatos: (m.candidatos || []).map(x => ({ id: x.id, modelo: x.modelo_comercial })),
    }, null, 1));
    const sinDudosa = (o) => (o && !o.serie_dudosa ? o.numero_serie || undefined : undefined);
    const l = c.leido || {};
    const bloque = {
        ...(m.modelo ? { aerotermia_id: m.modelo.id } : {}),
        caldera: Object.fromEntries(Object.entries({
            marca: l.marca || undefined, modelo: l.modelo || undefined,
            numero_serie: sinDudosa(l), potencia_kw: c.potencia_kw ?? undefined,
            anio: l.anio || undefined, combustible: l.combustible || undefined,
        }).filter(([, v]) => v !== undefined)),
        placa_aerotermia: Object.fromEntries(['exterior', 'interior'].map(k => {
            const u = a.unidades?.[k];
            return [k, u ? Object.fromEntries(Object.entries({ marca: u.marca || undefined, modelo: u.modelo || undefined,
                numero_serie: sinDudosa(u) }).filter(([, v]) => v !== undefined)) : null];
        })),
    };
    // El año y el combustible de la placa frente a la fila de rendimiento, de la
    // que sale el ahorro. Solo se dice: cambiarla es decisión de una persona.
    const filaId = inst.caldera_antigua_cal?.rendimiento_id || inputsDe(ctx).boilerId;
    if (filaId && (l.anio || l.combustible)) {
        const calc = await esm('calculator/logic/calculation.js');
        const et = calc.BOILER_EFFICIENCIES.find(b => b.id === filaId)?.label || null;
        const dif = contrastarPlacaConRendimiento(filaId, l, et);
        if (dif.length) for (const d of dif) console.log(`\n⚠ ${d}`);
        else console.log(`\nLa placa (${[l.anio, l.combustible].filter(Boolean).join(', ')}) cuadra con el rendimiento declarado «${et || filaId}».`);
    }
    console.log(`\nLeído guardado en ${path.join(dir, 'placas.json')}`);
    console.log('PARA EL PLAN (corrígelo con la foto delante; añade a «caldera» su «nombre» y «da_acs»):');
    console.log(JSON.stringify(bloque, null, 1));
    if (l.serie_dudosa || a.unidades?.exterior?.serie_dudosa || a.unidades?.interior?.serie_dudosa) {
        console.log('  ⚠ Hay un nº de serie DUDOSO (las dos lecturas no coinciden): se ha quitado del bloque. '
            + 'Ponlo solo si en la foto se lee claro; si no, se elige en «Leer placas» de la app.');
    }
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
    const man = ids.some(d => d.startsWith('frame:')) ? manifiestoVideo(ctx) : null;
    const manSv = ids.some(d => d.startsWith('sv:')) ? manifiestoSV(ctx) : null;
    for (const d of ids) {
        // Una foto de Google STREET VIEW (`sv:SV1`, de la orden `streetview`).
        if (d.startsWith('sv:')) {
            const f = manSv?.fotos?.find(x => x.id === d.slice(3));
            if (!f || !fs.existsSync(f.archivo)) throw new Error(`No encuentro la foto ${d}: lanza antes «streetview».`);
            imgs.push({ name: path.basename(f.archivo), buffer: fs.readFileSync(f.archivo), mimeType: 'image/jpeg' });
            continue;
        }
        // Un FOTOGRAMA del vídeo (`frame:F1`, de la orden `video`): de la carpeta de trabajo.
        if (d.startsWith('frame:')) {
            const f = man?.fotogramas?.[d.slice(6)];
            if (!f || !fs.existsSync(f.archivo)) throw new Error(`No encuentro el fotograma ${d}: lanza antes «video».`);
            imgs.push({ name: path.basename(f.archivo), buffer: fs.readFileSync(f.archivo), mimeType: 'image/jpeg' });
            continue;
        }
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
async function aplicar(planDado = null) {
    await saludMotor();
    const ctx0 = await cargar(POS[0]);
    const fPlan = opt('plan');
    if (!planDado && (!fPlan || fPlan === true)) throw new Error('Uso: aplicar <clave> --plan plan.json [--escribir]');
    const plan = planDado || JSON.parse(fs.readFileSync(fPlan, 'utf8'));
    const e0 = ctx0.expediente;
    const avisos = [];
    // Lo dibujado A MANO en la pizarra del plano MANDA (`utils/loDibujadoAMano.js`):
    // se comprueba ANTES de escribir nada (la aerotermia del paso 1 ya escribe),
    // y si el plan lo deshace se para aquí, diciendo qué y cómo respetarlo.
    for (const a of respetarLoDibujado(plan, await cex.leerTrabajo(e0.id, ctx0.origen).catch(() => null))) {
        avisos.push(a);
    }

    // 0. Los FOTOGRAMAS del vídeo (`frame:H3`, los deja la orden `video`): se
    //    comprueba que están en su carpeta de trabajo; con --escribir se suben a
    //    «FOTOS ENVOLVENTE» (con el vídeo y el segundo de los que salen) y la
    //    referencia pasa a ser su id de Drive.
    const esFrame = (d) => String(d || '').startsWith('frame:');
    const refsFrame = new Set();
    for (const ids of Object.values(plan.fotos || {})) for (const d of ids || []) if (esFrame(d)) refsFrame.add(d);
    for (const lista of Object.values(plan.huecos || {})) for (const h of lista || []) if (esFrame(h.foto)) refsFrame.add(h.foto);
    // Y las de Google STREET VIEW (`sv:SV1`, de la orden `streetview`): igual.
    const esSv = (d) => String(d || '').startsWith('sv:');
    const refsSv = new Set();
    for (const ids of Object.values(plan.fotos || {})) for (const d of ids || []) if (esSv(d)) refsSv.add(d);
    for (const lista of Object.values(plan.huecos || {})) for (const h of lista || []) if (esSv(h.foto)) refsSv.add(h.foto);
    const manSv = refsSv.size ? manifiestoSV(ctx0) : null;
    for (const r of refsSv) {
        const f = manSv?.fotos?.find(x => x.id === r.slice(3));
        if (!f || !fs.existsSync(f.archivo)) throw new Error(`La foto ${r} no está: lanza antes «streetview».`);
    }
    if (refsSv.size) {
        console.log(`
${refsSv.size} foto(s) de Street View: con --escribir se suben a `
            + '«1. CEE / CEE INICIAL / FOTOS ENVOLVENTE», cada una a su pared.');
    }
    const manVideo = refsFrame.size ? manifiestoVideo(ctx0) : null;
    if (refsFrame.size) {
        if (!manVideo) {
            throw new Error('El plan usa fotogramas (frame:…) y no hay video.json: lanza antes «video» '
                + '(o pasa --video-dir con su carpeta).');
        }
        for (const r of refsFrame) {
            const f = manVideo.fotogramas?.[r.slice(6)];
            if (!f || !fs.existsSync(f.archivo)) throw new Error(`El fotograma ${r} no está en la carpeta del vídeo.`);
        }
        console.log(`
${refsFrame.size} fotograma(s) del vídeo: con --escribir se suben a `
            + '«1. CEE / CEE INICIAL / FOTOS ENVOLVENTE», cada uno a su pared.');
    }

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
            };
            console.log(`\nAEROTERMIA → ${mod.marca} ${mod.modelo_comercial} (id ${mod.id}) · SCOP ${
                inp.scopHeating ?? '—'} → ${patchInputs.scopHeating} (${patchInputs.scopTemporada}, ${temp} °C)`);
        }
    }

    // 1b. En una OPORTUNIDAD, lo leído de las PLACAS va a sus inputs aunque el
    //     plan no cambie el equipo: la caldera a `placa_caldera` (la MISMA forma
    //     que deja `alta-oportunidad`) y la aerotermia a `placa_ocr` (la del
    //     botón «Leer la placa» de la calculadora). `expedienteService` los
    //     hereda al aceptarla —solo huecos—, así que el expediente nace con la
    //     marca, el modelo, el nº de serie y la potencia ya escritos.
    if (ctx0.origen === 'op') {
        const { BOILER_EFFICIENCIES } = await esm('calculator/logic/calculation.js');
        const etFila = BOILER_EFFICIENCIES.find(b => b.id === inputsDe(ctx0).boilerId)?.label || null;
        const extra = placasParaInputs(plan, inputsDe(ctx0), avisos, etFila);
        if (extra) {
            patchInputs = { ...(patchInputs || {}), ...extra };
            const pc = extra.placa_caldera;
            console.log('\nOPORTUNIDAD ← placas (el expediente lo heredará al aceptarse, solo huecos):');
            if (pc) {
                console.log(`  ${ESCRIBIR ? '✓' : '+'} caldera: ${[pc.marca, pc.modelo].filter(Boolean).join(' ') || '—'}`
                    + `${pc.numero_serie ? ` · nº ${pc.numero_serie}` : ''}${pc.potencia_kw ? ` · ${fmt(pc.potencia_kw)} kW` : ''}`);
            }
            if (extra.potenciaCaldera) console.log(`  ${ESCRIBIR ? '✓' : '+'} potencia de la caldera en la simulación: ${fmt(extra.potenciaCaldera)} kW`);
            if (extra.placa_ocr) console.log(`  ${ESCRIBIR ? '✓' : '+'} placa de la aerotermia (nº de serie de la ud. exterior para el expediente)`);
        }
    }

    // 2. Con los inputs nuevos, el contexto se vuelve a cargar (en seco, en memoria).
    // Lo que ya está no se vuelve a escribir (ni se anota otra vez en el
    // historial): relanzar el plan tras corregir un hueco no cambia la simulación.
    if (patchInputs) {
        const inp = inputsDe(ctx0);
        // Los objetos (las placas) se comparan sin su sello de hora.
        const igual = (a, b) => {
            if (a && typeof a === 'object') {
                const sin = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).filter(([k]) => k !== 'at')));
                return sin(a) === sin(b);
            }
            return String(a) === String(b);
        };
        const iguales = Object.keys(patchInputs).every(k => patchInputs[k] === undefined || igual(patchInputs[k], inp[k]));
        if (iguales) patchInputs = null;
    }
    let ctx = ctx0;
    if (patchInputs && ESCRIBIR) {
        const { error } = await supabase.rpc('oportunidad_merge_inputs', { p_id: e0.id, p_patch: patchInputs });
        if (error) throw new Error(`No se han podido guardar los inputs: ${error.message}`);
        const pc = patchInputs.placa_caldera;
        const partes = [
            patchInputs.aerothermiaModel ? `aerotermia ${patchInputs.aerothermiaModel} (SCOP ${patchInputs.scopHeating})` : null,
            pc ? `caldera ${[pc.marca, pc.modelo].filter(Boolean).join(' ') || 'de la placa'}`
                + `${pc.numero_serie ? ` nº ${pc.numero_serie}` : ''}` : null,
            patchInputs.potenciaCaldera ? `potencia de la caldera ${patchInputs.potenciaCaldera} kW` : null,
            patchInputs.placa_ocr ? 'placa de la aerotermia leída' : null,
            patchInputs.emitterType ? `emisor ${patchInputs.emitterType}` : null,
        ].filter(Boolean);
        await anotar(e0.id, `CEE inicial preparado por la skill: ${partes.join(', ')}.`
            + (patchInputs.aerothermiaModel || patchInputs.potenciaCaldera || patchInputs.emitterType
                ? ' La simulación hay que RECALCULARLA en la calculadora y guardarla.'
                : ' El expediente lo heredará al aceptarse.'));
        ctx = await cargar(POS[0]);
    } else if (patchInputs) {
        const dc = ctx.expediente.oportunidades.datos_calculo;
        dc.inputs = { ...dc.inputs, ...patchInputs };
        const { oportunidadComoExpediente } = await esm('cee-envolvente/logic/oportunidad.js');
        const exp = oportunidadComoExpediente(ctx.expediente.oportunidades, { cliente: ctx.cliente });
        ctx = { ...ctx, expediente: exp };
        if (plan.aerotermia_id) {
            const { data: mod } = await supabase.from('aerotermia').select('*').eq('id', plan.aerotermia_id).maybeSingle();
            exp.instalacion.aerotermia_cal = { ...exp.instalacion.aerotermia_cal, marca: mod.marca,
                modelo: mod.modelo_comercial || mod.modelo_conjunto || mod.modelo_ud_exterior || '' };
            ctx.modelos = { ...ctx.modelos, [mod.id]: mod };
        }
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
            const conSerie = !!placasDelPlan(plan).equipos.unidades.exterior?.numero_serie;
            await anotarExpediente(e0.id, `Aerotermia ${plan.placa_aerotermia ? 'de la placa' : 'del presupuesto'} `
                + `puesta por la skill generar-cee-inicial: `
                + `${a.marca} ${a.modelo} (catálogo ${a.aerotermia_db_id}), SCOP ${a.scop} (${a.scop_temporada})`
                + (aeroExpediente.acs ? `, ACS del conjunto SCOP_dhw ${aeroExpediente.inst.aerotermia_acs.scop}` : '')
                + (conSerie ? '.' : '. Sin placa: el nº de serie queda por poner.'));
            ctx = await cargar(POS[0]);
        } else {
            ctx = { ...ctx, expediente: { ...ctx.expediente, instalacion: aeroExpediente.inst } };
        }
        ctx = { ...ctx, modelos: { ...(ctx.modelos || {}), [aeroExpediente.mod.id]: aeroExpediente.mod } };
    }

    // 2c. En un EXPEDIENTE, lo leído de las PLACAS va también a su INSTALACIÓN:
    //     marca, modelo, nº de serie y potencia de la caldera que se retira, y
    //     los nº de serie de la bomba de calor si ya está puesta. Con las MISMAS
    //     reglas que el botón «✨ Leer placas» (`services/placasInstalacion.js`):
    //     solo HUECOS, lo que choca con lo escrito se enseña y no se toca, y un
    //     nº de serie dudoso no se escribe. Así, al entrar en la app ya está.
    if (ctx0.origen === 'cae') {
        const r = await placasEnInstalacion(ctx, plan, avisos);
        if (r?.escrito) {
            ctx = await cargar(POS[0]);
        } else if (r?.instalacion) {
            ctx = { ...ctx, expediente: { ...ctx.expediente, instalacion: r.instalacion } };
            ctx = { ...ctx, modelos: { ...(ctx.modelos || {}), ...(await cex.modelosDeAerotermia(ctx.expediente)) } };
        }
    }

    // 3. La geometría, con lo que el plan deja fuera.
    //
    //    El CROQUIS manda sobre las zonas de SUS plantas: describe la planta
    //    entera (dónde está el garaje, el porche…) y el motor lo ajusta a los m²
    //    de Catastro. Las zonas de las plantas que no trae se conservan.
    const prev = await cex.leerTrabajo(ctx.expediente.id, ctx.origen).catch(() => null);
    // Las ventanas y puertas dibujadas a mano se MIDEN aquí (`medir`): la pizarra
    // dice que están y dónde, no cuánto miden. Lo demás de lo tocado a mano ya se
    // ha comprobado al principio (`respetarLoDibujado`).
    if (prev && plan.medir) {
        const r = medirHuecos(prev.huecos, plan.medir);
        prev.huecos = r.huecos;
        for (const l of r.hechos) console.log(`MEDIDO ${l}`);
        for (const a of r.avisos) avisos.push(a);
    }
    const cuerpos = plan.cuerpos_fuera ?? prev?.cuerpos_fuera ?? null;
    let zonas = plan.zonas_fuera ?? prev?.zonas_fuera ?? null;
    // El CONTORNO de la vivienda (o del local) dentro de una parcela que es el
    // conjunto: el mismo `recorte_vivienda` que dibuja «Delimitar adosado», en
    // EPSG:25830. Lo de fuera queda como colindante (medianera), no se borra.
    // Se admite la lista de vértices a pelo o `{ poligono }`, que es como lo guarda la ventana.
    const recPlan = Array.isArray(plan.recorte_vivienda) ? { poligono: plan.recorte_vivienda }
        : plan.recorte_vivienda;
    const recorte = Array.isArray(recPlan?.poligono) && recPlan.poligono.length >= 3
        ? { poligono: recPlan.poligono } : (prev?.recorte_vivienda || null);
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
    const geo = await geometria(ctx, { cuerpos, zonas, recorte,
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
    // Las paredes DIBUJADAS a mano en la ventana no las trae el motor: viven en
    // el trabajo (`paredes.dibujadas`), con el tipo al que se hayan pasado.
    for (const d of prev?.paredes?.dibujadas || []) {
        if (d?.id && !porId[d.id]) porId[d.id] = { ...d, tipo: prev?.tipos?.[d.id] || d.tipo };
    }
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
        if ((lista || []).length && !admiteHuecos({ ...m })) throw new Error(`${id} es ${m.tipo}: no admite huecos (solo fachadas).`);
        huecos[id] = (lista || []).map((h) => {
            const tipo = h.tipo === 'puerta' ? 'puerta' : 'ventana';
            n[tipo] += 1;
            const uid = nuevoUid();
            if (h.foto && h.box) marcas.push({ clave: id, drive_id: h.foto, uid, box: h.box });
            return {
                //: El nombre del plan si lo trae (el que usa el certificador en su
                //: croquis: «V2» es la de la calle aunque haya desaparecido la V1).
                uid, nombre: (typeof h.nombre === 'string' && /^[A-Z]{1,3}\d{1,3}$/.test(h.nombre.trim()))
                    ? h.nombre.trim() : `${tipo === 'puerta' ? 'P' : 'V'}${n[tipo]}`, tipo,
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
        // Al REHACER sobre una revisión a mano no se cambia el defecto que ya
        // tuviera el expediente: el plano lo ha dado por bueno una persona.
        ...(plan._rehacer ? {} : { persiana_defecto: true }),
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
        // `potencia_kw`: la de refrigeración de cada aparato, si se sabe o se
        // supone (un split doméstico, 3.000-5.000 frigorías ≈ 3,5-5,8 kW).
        // Sin ella va la de por defecto del motor, y se avisa.
        const potKw = Number(plan.aires?.potencia_kw) || null;
        ajustes.equipos_extra = [
            ...(ajustes.equipos_extra || []).filter(x => !x.aire),
            ...f.airesAcondicionados({ n, modo, superficie })
                .map(eq => (potKw ? { ...eq, potencia_refrigeracion: String(potKw) } : eq)),
        ];
        console.log(`AIRES ACONDICIONADOS → ${n} · ${modo === 'climatizacion' ? 'calefacción y refrigeración' : 'máquina frigorífica (sólo refrigeración)'}`
            + `${superficie ? ` · ${fmt(superficie)} m²` : ''}`);
    }
    // La caldera: lo que dice su placa. «da_acs: false» = solo calefacción, que es
    // el USO que se cambia en Instalaciones cuando el ACS lo hace otro aparato.
    //
    // Con la caldera ya en la INSTALACIÓN (paso 2c) o en la oportunidad
    // (`placa_caldera`), la ficha compone sola su nombre («CALDERA {marca}
    // {modelo}») y su potencia: ponerlos además como ajuste los marcaría
    // «puestos a mano por el certificador», que es falso. Al ajuste solo va lo que
    // DIFIERE de lo que consta en la app (un conflicto que allí no se ha tocado),
    // y uno anterior que ya coincide se retira.
    if (plan.caldera) {
        const instC = ctx.expediente?.instalacion || {};
        const calC = instC.caldera_antigua_cal || {};
        const nombreApp = [calC.marca, calC.modelo].filter(Boolean).join(' ').trim();
        const nombreDerivado = nombreApp ? `CALDERA ${nombreApp}`.toUpperCase() : null;
        const potApp = [instC.potencia_caldera_kw, instC.potencia_caldera].map(Number).find(n => n > 0) || null;
        const insAj = { ...(ajustes.instalacion || {}) };
        const nombrePlan = plan.caldera.nombre ? String(plan.caldera.nombre).trim() : null;
        if (nombrePlan) {
            if (nombreDerivado && nombrePlan.toUpperCase() === nombreDerivado) {
                if (String(insAj.nombre || '').trim().toUpperCase() === nombreDerivado) delete insAj.nombre;
            } else insAj.nombre = nombrePlan;
        }
        const potPlan = Number(plan.caldera.potencia_kw) > 0 ? Number(plan.caldera.potencia_kw) : null;
        if (potPlan) {
            if (potApp === potPlan) {
                if (Number(insAj.potencia) === potPlan) delete insAj.potencia;
            } else insAj.potencia = String(potPlan);
        }
        if (plan.caldera.da_acs === false) insAj.slot = 'calefaccion';
        ajustes.instalacion = insAj;
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
        //: Lo que se REFORMA («- CAMBIA» en el nombre, regla 66): paredes por id y
        //: la cubierta por planta (`{ "PB": { "entera": true } }`). Del plan si lo trae.
        cambian: plan.cambian ?? prev?.cambian ?? [],
        cubierta_reforma: plan.cubierta_reforma ?? prev?.cubierta_reforma ?? {},
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
        cuerpos_fuera: cuerpos || [], recorte_vivienda: recorte,
        zonas_fuera: zonas || [],
        // Lo dibujado en la pizarra y lo que ha tocado una persona: si se
        // perdiera aquí, la próxima pasada de la skill ya no lo respetaría.
        ...(prev?.pizarra ? { pizarra: prev.pizarra } : {}),
        ...(prev?.huecos_sin_pared ? { huecos_sin_pared: prev.huecos_sin_pared } : {}),
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
    // Lo apartado que NO es una pared (un forjado `PH…`): la ventana solo sabe
    // apartar muros, así que se le dice al motor aquí y SE AVISA — regenerar el
    // .cex desde la ventana lo volvería a escribir.
    const sinMuro = (plan.excluidas || []).filter(id => !(st.muros || {})[id]);
    if (sinMuro.length) {
        envolvente.excluir_ids.ids = [...new Set([...envolvente.excluir_ids.ids, ...sinMuro])];
        avisos.push(`Apartado del .cex por el plan (no es una pared, la ventana no lo guarda): ${sinMuro.join(', ')}. `
            + 'Si se regenera el .cex desde la ventana, vuelve a salir: quítalo en CE3X.');
    }

    // 6a. Una OPORTUNIDAD aún no tiene certificador ni fechas del CEE, y sin los
    //     datos del técnico CE3X 3.1 califica pero NO escribe el XML («Revise …
    //     Datos Administrativos»). El plan puede declararlos: `tecnico` (el
    //     id_empresa del certificador que firma) y `fechas` ({emision, visita},
    //     AAAA-MM-DD). Lo de un expediente manda: aquí solo se rellena lo que falta.
    //     El AGENTE IA no firma (`tecnicoCe3x` lo deja sin técnico): con él en la
    //     barra, el `tecnico` del plan es quien va a firmar y lo sustituye en el .cex.
    //     POR DEFECTO firma FRAN (decisión del usuario, 2026-10-06: «ponme como
    //     certificador a mí siempre a no ser que te indique lo contrario»):
    //     `TECNICO_POR_DEFECTO`. Otro técnico, con `"tecnico": "<id_empresa>"`;
    //     ninguno, con `"tecnico": false`. Un técnico DE VERDAD asignado en la
    //     barra no se sustituye: es quien firma (y el agente no le quita nada).
    const tecnicoPlan = plan.tecnico === false || plan.tecnico === null ? null
        : (plan.tecnico || TECNICO_POR_DEFECTO);
    if (tecnicoPlan && (!ctx.certificador || ctx.certificador.es_agente_ia)) {
        const delAgente = !!ctx.certificador;
        ctx.certificador = await cex.leerCertificador(String(tecnicoPlan));
        if (!ctx.certificador) throw new Error(`El técnico ${tecnicoPlan} no está en prescriptores.`);
        avisos.push(`Técnico certificador${plan.tecnico ? ' del plan' : ' (por defecto)'}: ${ctx.certificador.razon_social} `
            + (delAgente ? '(el encargo es del AGENTE IA, que no firma: en la barra sigue el agente).'
                : '(la oportunidad no tiene uno asignado).'));
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
    let fichero = Buffer.from(await r.arrayBuffer());
    const avMotor = JSON.parse(r.headers.get('X-Cee-Avisos') || '[]');
    // 7b. Una medida de mejora que NO está en el catálogo de la ventana (en un
    //     CEE directo no hay aerotermia declarada de la que salga: «retirar la
    //     caldera, dos aires frío-calor, un termo y placas»). Se pone con los
    //     MISMOS escritores que «Poner la medida» (`/cex/medida`): los equipos
    //     que asumen un servicio retiran el generador que lo daba.
    if (Array.isArray(plan.medidas_libres) && plan.medidas_libres.length) {
        const fdm = new FormData();
        fdm.append('fichero', new Blob([fichero]), 'x.cex');
        fdm.append('datos', JSON.stringify({ medidas: plan.medidas_libres, envolvente: ficha.envolvente || {} }));
        const rm = await fetch(`${MOTOR}/cex/medida`, { method: 'POST', body: fdm });
        if (!rm.ok) {
            const f = await rm.json().catch(() => ({}));
            throw new Error(`El motor no ha puesto la medida libre: ${f.detail || rm.status}`);
        }
        fichero = Buffer.from(await rm.arrayBuffer());
        avMotor.push(...JSON.parse(rm.headers.get('X-Cee-Avisos') || '[]'));
        for (const m of plan.medidas_libres) {
            console.log(`  medida libre «${m.nombre}»: ${(m.instalaciones || []).map(x => `[${x.slot}] ${x.nombre}`).join(' · ')}`);
        }
    }
    const fd = new FormData();
    fd.append('fichero', new Blob([fichero]), 'x.cex');
    const leido = await (await fetch(`${MOTOR}/leer-cex`, { method: 'POST', body: fd })).json();
    console.log(`\n.cex · ${kb(fichero.length)} · releído ${leido.version} · errores ${leido.errores?.length ?? '?'}`);
    console.log(`  ${JSON.stringify(leido.resumen_envolvente)}`);
    if (imagenesFallidas.length) avisos.push(`Sin ${imagenesFallidas.join(' ni ')}: Catastro no ha respondido.`);

    // 7c. RES080: el CEE PREVISTO (la casa con TODA la obra hecha), copiando el
    //     inicial. Va a ser la medida del inicial y el «CEE final» de la app.
    const previsto = plan.previsto ? await componerPrevisto(ctx, { fichero, ficha, plan }) : null;
    if (previsto) avMotor.push(...previsto.avisos);

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
        if (previsto) {
            const lp = path.join(CACHE, previstoSrv.nombrePrevisto(ctx.expediente));
            fs.writeFileSync(lp, previsto.buffer);
            console.log(`  copia local del previsto: ${lp}`);
            if (RESTO.includes('--calificar')) {
                const { cal, med } = await previstoAlInicial(previsto, fichero);
                for (const [ext, b] of [['.xml', cal?.xml], ['.pdf', cal?.pdf]]) {
                    if (b) fs.writeFileSync(lp.replace(/\.cex$/i, ext), b);
                }
                if (med?.ok) {
                    const li = local.replace(/\.cex$/i, '_CON PREVISTO.cex');
                    fs.writeFileSync(li, med.cex);
                    if (med.xml) fs.writeFileSync(li.replace(/\.cex$/i, '.xml'), med.xml);
                    if (med.pdf) fs.writeFileSync(li.replace(/\.cex$/i, '.pdf'), med.pdf);
                    console.log(`  inicial con el previsto como medida: ${li}`);
                }
            }
        }
        console.log('\nEN SECO: no se ha guardado nada. Pásale --escribir.');
    } else {
        await cex.guardarTrabajo(ctx.expediente.id, trabajo, ctx.origen);
        console.log('\n✓ Trabajo guardado: abre la envolvente y lo verás señalado (en ámbar lo dudoso).');
        // Un fotograma se SUBE (una vez por pared); una foto del expediente se
        // REFERENCIA (`adoptar`), como desde la ventana.
        const subidoFrame = {};
        const subirFrame = async (pared, ref) => {
            const k = `${pared}|${ref}`;
            if (subidoFrame[k]) return subidoFrame[k];
            if (esSv(ref)) {
                const g = manSv.fotos.find(x => x.id === ref.slice(3));
                const sub = await fotosSrv.subir(ctx.expediente, pared,
                    { buffer: fs.readFileSync(g.archivo), mimetype: 'image/jpeg' }, 'skill generar-cee-inicial',
                    { streetview: { pano_id: g.pano_id, fecha: g.fecha, heading: g.heading, fov: g.fov } });
                subidoFrame[k] = sub.drive_id;
                return sub.drive_id;
            }
            const f = manVideo.fotogramas[ref.slice(6)];
            const sub = await fotosSrv.subir(ctx.expediente, pared,
                { buffer: fs.readFileSync(f.archivo), mimetype: 'image/jpeg' }, 'skill generar-cee-inicial',
                { video: f.video_nombre, video_drive_id: f.video_drive_id, t: f.t });
            subidoFrame[k] = sub.drive_id;
            return sub.drive_id;
        };
        for (const [clave, ids] of Object.entries(plan.fotos || {})) {
            for (const d of ids) {
                try {
                    if (esFrame(d) || esSv(d)) await subirFrame(clave, d);
                    else await fotosSrv.adoptar(ctx.expediente, clave, d, 'skill generar-cee-inicial');
                } catch (err) { avisos.push(`Foto ${d} en ${clave}: ${err.message}`); }
            }
        }
        if (Object.keys(subidoFrame).length) {
            console.log(`✓ ${Object.keys(subidoFrame).length} fotograma(s) del vídeo pegados a sus paredes.`);
        }
        const porFoto = {};
        for (const mk0 of marcas) {
            let mk = mk0;
            if (esFrame(mk0.drive_id) || esSv(mk0.drive_id)) {
                try { mk = { ...mk0, drive_id: await subirFrame(mk0.clave, mk0.drive_id) }; }
                catch (err) { avisos.push(`Fotograma ${mk0.drive_id} en ${mk0.clave}: ${err.message}`); continue; }
            }
            (porFoto[`${mk.clave}|${mk.drive_id}`] ||= []).push(mk);
        }
        for (const [k, lista] of Object.entries(porFoto)) {
            const [clave, d] = k.split('|');
            try {
                await fotosSrv.guardarMarcas(ctx.expediente, clave, d,
                    lista.map(x => ({ uid: x.uid, box: x.box, de: 'lectura' })), { fundir: true });
            } catch (err) { avisos.push(`Marcas en ${clave}: ${err.message}`); }
        }
        // RES080: el previsto se mete como medida del inicial ANTES de guardarlo,
        // para que en Drive quede una sola versión del inicial (la buena).
        let res080 = null;
        if (previsto) {
            if (RESTO.includes('--sin-pdf')) {
                avisos.push('Con --sin-pdf no se usa CE3X: el previsto NO va como medida del inicial. '
                    + 'Ponlo en CE3X (Medidas de mejora → «Cargar edificio»).');
            } else {
                res080 = await previstoAlInicial(previsto, fichero);
                if (res080.med?.ok) fichero = res080.med.cex;
                else {
                    avisos.push(`El previsto NO se ha puesto como medida del inicial (${res080.med?.error || res080.cal?.error}): `
                        + 'ponlo en CE3X (Medidas de mejora → «Cargar edificio»).');
                }
            }
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
        if (res080?.med?.ok) {
            // Ya calificado por CE3X con la medida dentro: se suben su XML y su PDF.
            const g2 = await cex.guardarCalificadoEnDrive(ctx, 'inicial', gd.nombre,
                { xml: res080.med.xml, pdf: res080.med.pdf });
            console.log(`CE3X lo califica: ${cexAPdf.textoCalificacion(res080.med.calificacion)}`);
            if (g2.ok) for (const s of g2.subidos) console.log(`✓ ${s.nombre}\n  ${s.link}`);
            else avisos.push(`XML/PDF del inicial calificados pero no subidos: ${g2.error}`);
        } else if (!RESTO.includes('--sin-pdf')) {
            console.log('\nCalificando con CE3X 3.1 y generando el PDF (≈1 min)…');
            const cal = await cexAPdf.calificarYGuardar(ctx, 'inicial', gd.nombre, fichero);
            for (const l of cexAPdf.lineasCalificado(cal)) console.log(l);
        }
        if (previsto) await guardarPrevistoYFinal(ctx, previsto, res080, avisos);
        // El AGENTE IA termina: la fase queda «pendiente de revisión» y se avisa
        // al equipo, como cuando un técnico sube su .cex. Va AQUÍ y no en la skill
        // para que no se pueda olvidar; `--sin-aviso` lo calla al relanzar.
        await avisarAgente(ctx, gd, [...avisos, ...avMotor], 'inicial', decisiones);
        // Si se estaba REHACIENDO sobre una revisión a mano («Así es como está»),
        // queda hecho: la ventana deja de decir «Claude lo está rehaciendo».
        if (await revisionPlano.marcarRehecho({ clave: ctx.expediente.id, origen: ctx.origen, fichero: gd.nombre })) {
            console.log('✓ Revisión a mano del plano: REHECHA.');
        }
    }
    const todos = [...avisos, ...avMotor];
    if (todos.length) console.log(`\nAVISOS (${todos.length})\n  ⚠ ${todos.join('\n  ⚠ ')}`);
}

// ─── RES080: el CEE PREVISTO (services/cee/previstoRes080.js) ───────────────

/**
 * El previsto del plan (`plan.previsto`): el motor COPIA el inicial y le pone
 * los equipos de la medida, las ventanas y el aislamiento nuevos, ventilación
 * 0,53 y masa Ligera. Se imprime lo que ha cambiado de verdad y los textos de la
 * medida con los que irá dentro del inicial.
 */
async function componerPrevisto(ctx, { fichero, ficha, plan }) {
    const datos = previstoSrv.datosParaMotor(ficha, plan.previsto);
    const p = await previstoSrv.pedirPrevisto(fichero, datos);
    p.textos = previstoSrv.textosDelPrevisto({ ficha, previsto: plan.previsto, hechos: p.hechos,
                                              expediente: ctx.expediente });
    console.log(`\nCEE PREVISTO (RES080) · ${kb(p.buffer.length)}`);
    console.log(`  equipos: ${datos.instalaciones.map(e => `[${e.slot}] ${e.nombre}`).join(' · ') || '— los del inicial'}`);
    console.log(`  huecos que cambian (${p.hechos.huecos.length}): ${p.hechos.huecos.join(', ') || '—'}`);
    for (const c of p.hechos.cerramientos) console.log(`  aislado ${c.nombre}: U ${c.u_antes} → ${c.u}`);
    console.log(`  ventilación ${datos.previsto.ventilacion} ren/h · masa ${datos.previsto.masa_particiones}`);
    const t = p.textos;
    console.log(`  MEDIDA del inicial: «${t.nombre}» · inversión ${t.inversion ?? '— (no consta)'} € · vida útil ${t.vida_util} años`);
    console.log(`    Características: ${t.caracteristicas}`);
    console.log(`    Otros datos: ${t.otros || '—'}`);
    if (!t.inversion) p.avisos.push('La medida del previsto va SIN inversión: CE3X dará el coste y el plazo de recuperación en blanco.');
    return p;
}

/** CE3X 3.1 (en este PC): califica el previsto y lo mete como medida del inicial. */
async function previstoAlInicial(previsto, inicial) {
    console.log('\nCalificando el PREVISTO con CE3X 3.1 (≈1 min)…');
    const cal = await cexAPdf.calificarCex(previsto.buffer, { medidas: false });
    for (const l of cexAPdf.lineasCalificado(cal)) console.log(`  ${l}`);
    if (!cal.ok) return { cal, med: null };
    console.log('Poniendo el previsto como MEDIDA del inicial («Nuevo edificio», ≈30 s)…');
    const med = await cexAPdf.ponerPrevistoComoMedida(inicial, previsto.buffer, previsto.textos);
    if (med.ok) {
        console.log(`  ✓ «${med.medida?.nombre}» · ahorro ${(med.medida?.ahorro || []).join(' / ')} %`
            + ` · inicial ${cexAPdf.textoCalificacion(med.calificacion)}`);
    } else {
        console.log(`  ✗ ${med.error}`);
    }
    return { cal, med };
}

/**
 * Deja el previsto en `1. CEE / CEE INICIAL` (con su XML y su PDF) y, en un
 * expediente, carga su XML como el del CEE FINAL de la app: es de donde sale el
 * ahorro del RES080 hasta que haya un final de verdad.
 */
async function guardarPrevistoYFinal(ctx, previsto, res080, avisos) {
    const gp = await previstoSrv.guardarPrevisto(ctx, previsto.buffer);
    if (!gp.ok) { avisos.push(`El CEE PREVISTO no ha llegado a Drive: ${gp.error}`); return; }
    console.log(`✓ ${gp.nombre}\n  ${gp.link}`);
    avisos.push(`CEE PREVISTO (RES080): ${gp.link}`);
    const cal = res080?.cal;
    if (!cal?.xml) {
        avisos.push('El previsto va SIN calificar (sin CE3X en este PC): su XML hay que sacarlo en CE3X y '
            + 'cargarlo como CEE FINAL en la app.');
        return;
    }
    const g2 = await cex.guardarCalificadoEnDrive(ctx, 'inicial', gp.nombre, { xml: cal.xml, pdf: cal.pdf });
    if (g2.ok) for (const s of g2.subidos) console.log(`✓ ${s.nombre}\n  ${s.link}`);
    if (ctx.origen !== 'cae') {
        avisos.push('Es una oportunidad: el XML del previsto se carga como CEE FINAL cuando sea expediente '
            + '(«Cargar CEE» en la columna del final).');
        return;
    }
    try {
        const p = await previstoSrv.cargarComoFinal(ctx, cal.xml.toString('utf8'),
            gp.nombre.replace(/\.cex$/i, '.xml'));
        console.log(`✓ XML del previsto cargado como CEE FINAL en la app (demanda cal ${p.demandaCalefaccion}, `
            + `EPNR ${p.epnrConsumo} ${p.epnrLetra || ''})`);
    } catch (e) {
        avisos.push(`El XML del previsto NO se ha cargado como CEE FINAL: ${e.message}`);
    }
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

// ─── Las PLACAS, también en la app ──────────────────────────────────────────
//
// La skill ya ha leído la placa de la caldera que se retira (y la de la bomba de
// calor, si está puesta) y las ha contrastado con la foto para escribir el `.cex`.
// Esos mismos datos se escriben en la app, para que al abrir el expediente la
// Instalación ya esté rellena: dos pájaros de un tiro (decisión del usuario,
// 2026-10-07). Lo que entra es lo del PLAN —lo revisado—, nunca una lectura nueva.

/**
 * Lo leído de las placas tal y como lo escribió en el PLAN quien miró las fotos
 * (`caldera.{marca, modelo, numero_serie, potencia_kw}` y `placa_aerotermia`), en
 * la forma que entiende `placasInstalacion.proponerPlacas`. Un nº de serie con
 * `serie_dudosa: true` se queda fuera: lo elige una persona en «Leer placas».
 */
function placasDelPlan(plan = {}) {
    const txt = (v) => {
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
        return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const dudosas = [];
    const leerUnidad = (u, etiqueta) => {
        if (!u || typeof u !== 'object') return null;
        const o = {};
        for (const k of ['marca', 'modelo', 'numero_serie']) { const v = txt(u[k]); if (v) o[k] = v; }
        if (u.serie_dudosa && o.numero_serie) { delete o.numero_serie; dudosas.push(etiqueta); }
        return Object.keys(o).length ? o : null;
    };
    let leido = leerUnidad(plan.caldera, 'la caldera');
    // El AÑO y el COMBUSTIBLE de la placa no se escriben en ningún sitio: viajan
    // para contrastarlos con la fila de rendimiento (solo avisa) y a la huella.
    const anio = Number(plan.caldera?.anio);
    const comb = txt(plan.caldera?.combustible);
    if (Number.isInteger(anio) && anio > 1900) leido = { ...(leido || {}), anio };
    if (comb) leido = { ...(leido || {}), combustible: comb.toLowerCase() };
    const kw = Number(plan.caldera?.potencia_kw) > 0 ? Number(plan.caldera.potencia_kw) : null;
    const exterior = leerUnidad(plan.placa_aerotermia?.exterior, 'la unidad exterior');
    const interior = leerUnidad(plan.placa_aerotermia?.interior, 'la unidad interior');
    return {
        caldera: { leido, potencia_kw: kw, fotos: [], avisos: [], sin_fotos: !leido && !kw },
        equipos: {
            unidades: { ...(exterior ? { exterior } : {}), ...(interior ? { interior } : {}) },
            fotos: [], avisos: [], sin_fotos: !exterior && !interior,
        },
        dudosas,
    };
}

/**
 * EXPEDIENTE: las placas del plan a su INSTALACIÓN, por el MISMO servicio que el
 * botón «✨ Leer placas» (solo huecos; conflictos a la vista; serie dudosa fuera).
 * Devuelve `{ escrito, instalacion }` — en seco, la instalación compuesta, para
 * que el `.cex` que se enseña sea el que saldría.
 */
async function placasEnInstalacion(ctx, plan, avisos) {
    const { caldera, equipos, dudosas } = placasDelPlan(plan);
    for (const d of dudosas) {
        avisos.push(`Nº de serie de ${d} DUDOSO: no se escribe en la app. Se elige en «Leer placas» mirando la foto.`);
    }
    if (caldera.sin_fotos && equipos.sin_fotos) return null;
    const { proponerPlacas } = require('../services/placasInstalacion');
    const exp = ctx.expediente;
    const inst = exp.instalacion || {};
    const dc = exp.oportunidades?.datos_calculo || {};
    // La misma zona que usa el botón (la de la simulación), para el SCOP.
    const zona = String(dc.zona || dc.inputs?.zona || inst.zona_climatica || 'D3').toUpperCase();
    // El EQUIPO: si el plan dice cuál (`aerotermia_id`, ya puesto en el paso 2b),
    // manda el plan y la placa solo lo confirma o lo contradice. Si no, la placa
    // rellena el HUECO, y uno ya elegido solo se sustituye con `aerotermia_sustituir`.
    const tieneEquipo = !!inst.aerotermia_cal?.aerotermia_db_id;
    const ponerEquipo = plan.aerotermia_id ? false : (!tieneEquipo || !!plan.aerotermia_sustituir);
    const r = await proponerPlacas({
        exp, zona, caldera, equipos, aplicar: ESCRIBIR, simular: !ESCRIBIR, ponerEquipo,
        por: 'skill generar-cee-inicial', origen: 'plan de la skill generar-cee-inicial',
    });

    console.log(`\nINSTALACIÓN del EXPEDIENTE ← placas (solo huecos, como «Leer placas»):`);
    const marca = ESCRIBIR ? '✓' : '+';
    for (const p of r.propuesta) console.log(`  ${marca} ${p.etiqueta}: ${p.valor}`);
    const eq = r.equipo_catalogo;
    const equipoPuesto = !!eq && ponerEquipo;
    if (eq) {
        const txtEq = `${eq.marca || ''} ${eq.modelo || ''} (catálogo ${eq.id}, por ${eq.por})`.trim();
        if (equipoPuesto) {
            console.log(`  ${marca} Equipo del catálogo: ${txtEq} · SCOP ${eq.scop ?? '—'} (${eq.scop_temporada || '—'})`
                + (eq.acs ? ` · ACS del conjunto SCOP_dhw ${eq.acs.scop ?? '—'}` : ''));
        } else if (plan.aerotermia_id) {
            avisos.push(`La placa casa con ${txtEq} y el plan dice la aerotermia ${plan.aerotermia_id}: `
                + 'se queda la del plan. Compruébalo con la foto.');
        } else {
            avisos.push(`La placa casa con ${txtEq} y el expediente declara otra (${eq.sustituye}): no se sustituye `
                + 'sin «aerotermia_sustituir: true» en el plan (o cámbiala en Instalación).');
        }
    }
    if (r.acs_conjunto) console.log(`  ${marca} ACS del conjunto ${r.acs_conjunto.equipo}: SCOP_dhw ${r.acs_conjunto.scop ?? '—'}`);
    if (!eq && !tieneEquipo && !plan.aerotermia_id && (r.catalogo_candidatos || []).length) {
        avisos.push(`La placa casa con ${r.catalogo_candidatos.length} equipos del catálogo `
            + `(${r.catalogo_candidatos.map(c => `${c.id} ${c.modelo_comercial || ''}`).join(' | ')}): `
            + 'elige uno con «aerotermia_id» en el plan o en «Leer placas» de la app.');
    }
    for (const c of r.conflictos) {
        console.log(`  ≠ ${c.etiqueta}: consta «${c.actual}» · placa «${c.leido}» — no se toca`);
        avisos.push(`${c.etiqueta}: en la app consta «${c.actual}» y la placa dice «${c.leido}». No se ha tocado: revísalo.`);
    }
    for (const d of r.dudosos) avisos.push(`${d.etiqueta}: nº de serie dudoso, no se escribe (elígelo en «Leer placas»).`);
    for (const a of r.avisos) avisos.push(a);
    if (!r.propuesta.length && !equipoPuesto && !r.acs_conjunto) console.log('  nada que rellenar: lo de las placas ya consta.');

    if (ESCRIBIR && r.escrito.length) {
        const lineas = [...r.propuesta.map(p => `${p.etiqueta}: ${p.valor}`),
            ...(equipoPuesto ? [`equipo ${eq.marca} ${eq.modelo} (catálogo ${eq.id})`] : [])];
        await anotarExpediente(exp.id, `Placas puestas en Instalación por la skill generar-cee-inicial (solo huecos): `
            + `${lineas.join(' · ')}.`
            + (r.conflictos.length ? ` ${r.conflictos.length} dato(s) no coinciden con lo que constaba y no se han tocado.` : ''));
        return { escrito: true, instalacion: r.instalacion };
    }
    return { escrito: false, instalacion: r.instalacion };
}

/**
 * OPORTUNIDAD: las placas del plan a sus INPUTS, que el expediente hereda al
 * aceptarse (`expedienteService`, solo huecos):
 *   · la caldera a `placa_caldera` (la MISMA forma que deja `alta-oportunidad`),
 *     sin pisar lo que ya leyó o tecleó otro — lo distinto se avisa;
 *   · su potencia útil a `potenciaCaldera` (la de la simulación: en un RES093 por
 *     caldera es la base del C_b, y por eso se dice que hay que recalcular);
 *   · la aerotermia a `placa_ocr` (la del botón «Leer la placa» de la calculadora).
 */
function placasParaInputs(plan, inp = {}, avisos = [], etiquetaFila = null) {
    const { caldera, equipos } = placasDelPlan(plan);
    const out = {};
    const l = caldera.leido || {};
    const norm = (v) => String(v ?? '').replace(/[\s\-./]/g, '').toUpperCase();
    if (inp.boilerId && (l.anio || l.combustible)) avisos.push(...contrastarPlacaConRendimiento(inp.boilerId, l, etiquetaFila));
    if (l.marca || l.modelo || l.numero_serie || caldera.potencia_kw) {
        const prev = inp.placa_caldera && typeof inp.placa_caldera === 'object' ? inp.placa_caldera : {};
        const fusion = { ...prev };
        const nuevo = {
            marca: l.marca, modelo: l.modelo, numero_serie: l.numero_serie,
            potencia_kw: caldera.potencia_kw, combustible: plan.caldera?.combustible,
        };
        for (const [k, v] of Object.entries(nuevo)) {
            if (v === null || v === undefined || v === '') continue;
            const ya = prev[k];
            // Una serie que constaba como DUDOSA la resuelve quien ha mirado la foto.
            const libre = ya === null || ya === undefined || ya === '' || (k === 'numero_serie' && prev.serie_dudosa);
            if (libre) {
                fusion[k] = v;
                if (k === 'numero_serie') fusion.serie_dudosa = false;
            } else if (norm(ya) !== norm(v)) {
                avisos.push(`Placa de la caldera (oportunidad): «${k}» consta «${ya}» y el plan dice «${v}». No se ha tocado.`);
            }
        }
        if (JSON.stringify(fusion) !== JSON.stringify(prev)) {
            out.placa_caldera = { ...fusion, at: new Date().toISOString(), origen: prev.origen || 'skill generar-cee-inicial' };
        }
    }
    if (caldera.potencia_kw && Number(inp.potenciaCaldera) !== caldera.potencia_kw) {
        out.potenciaCaldera = caldera.potencia_kw;
    }
    if (!equipos.sin_fotos && plan.placa_aerotermia) {
        out.placa_ocr = { at: new Date().toISOString(), ...plan.placa_aerotermia };
    }
    return Object.keys(out).length ? out : null;
}

// ─── instalacion ────────────────────────────────────────────────────────────
//
// SOLO lo de las placas a la app, con el mismo plan que `aplicar` (`caldera`,
// `placa_aerotermia`): ni `.cex`, ni Drive, ni aviso al equipo, ni fase del
// agente. Para un CEE ya generado al que le falta la Instalación rellena, o para
// rellenarla antes de hacerlo. En seco por defecto.
async function instalacion() {
    const ctx = await cargar(POS[0]);
    const fPlan = opt('plan');
    if (!fPlan || fPlan === true) throw new Error('Uso: instalacion <clave> --plan plan.json [--escribir]');
    const plan = JSON.parse(fs.readFileSync(fPlan, 'utf8'));
    const avisos = [];
    if (plan.aerotermia_id) {
        avisos.push('El plan trae «aerotermia_id»: esta orden NO cambia el equipo (eso lo hace «aplicar»). '
            + 'Solo escribe lo de las placas.');
    }
    if (ctx.origen === 'cae') {
        await placasEnInstalacion(ctx, plan, avisos);
    } else if (ctx.origen === 'op') {
        const { BOILER_EFFICIENCIES } = await esm('calculator/logic/calculation.js');
        const etFila = BOILER_EFFICIENCIES.find(b => b.id === inputsDe(ctx).boilerId)?.label || null;
        const patch = placasParaInputs(plan, inputsDe(ctx), avisos, etFila);
        console.log('\nOPORTUNIDAD ← placas (el expediente lo heredará al aceptarse, solo huecos):');
        if (!patch) console.log('  nada que rellenar: lo de las placas ya consta.');
        else {
            for (const [k, v] of Object.entries(patch)) {
                console.log(`  ${ESCRIBIR ? '✓' : '+'} ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
            }
            if (ESCRIBIR) {
                const { error } = await supabase.rpc('oportunidad_merge_inputs',
                    { p_id: ctx.expediente.id, p_patch: patch });
                if (error) throw new Error(`No se han podido guardar los inputs: ${error.message}`);
                await anotar(ctx.expediente.id, 'Placas leídas puestas por la skill generar-cee-inicial: '
                    + `${Object.keys(patch).join(', ')}.`
                    + (patch.potenciaCaldera ? ' La simulación hay que RECALCULARLA en la calculadora y guardarla.'
                        : ' El expediente lo heredará al aceptarse.'));
            }
        }
    } else {
        throw new Error('Un CEE directo no tiene Instalación: lo de la placa va solo al .cex (ajustes.instalacion).');
    }
    if (avisos.length) console.log(`\nAVISOS (${avisos.length})\n  ⚠ ${avisos.join('\n  ⚠ ')}`);
    console.log(ESCRIBIR ? '\n✓ Escrito en la app.' : '\nEN SECO: no se ha guardado nada. Pásale --escribir.');
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

// ─── video ──────────────────────────────────────────────────────────────────
// Cuando el cliente no manda fotos de las paredes sino un VÍDEO andando por la
// casa (el apartado `VIDEO_VIVIENDA`). Lo medido: casi siempre es de DENTRO, así
// que lo que hay que saber es a qué pared de fuera da cada ventana.
//
//   1. Se baja el vídeo de «12. DOCUMENTOS PARA CEE» (o el de --archivo).
//   2. Gemini lo MIRA (`videoEnvolventeService.analizarVideos`): estancias,
//      plantas y, de cada hueco, el segundo en que mejor se ve y a qué da.
//   3. Se saca el fotograma más nítido de cada hueco (`cee_inicial_video.py`) y
//      OTRO modelo lo mira quieto (`confirmarFotogramas`): si las dos lecturas
//      no dicen lo mismo, no se decide.
//   4. El CÓDIGO pone cada hueco en su pared (`utils/videoEnvolvente.js`): por
//      planta y por lo que se ve por él. Lo que no se puede decidir queda
//      DUDOSO, y las paredes que el vídeo no resuelve son las fotos que hay que
//      pedirle al propietario (`pedir-fotos`).
//
// Nada se escribe: deja en la carpeta de trabajo la hoja de contactos, el
// mosaico de fotogramas rotulados y `video.json`, con la PROPUESTA lista para
// el plan de `aplicar` (los fotogramas van como `frame:H3`).

const VIDEO_PY = path.join(__dirname, 'cee_inicial_video.py');
const videoSrv = () => require('../services/videoEnvolventeService');
const videoUtil = () => require('../utils/videoEnvolvente');

/** Llama al script de fotogramas y devuelve su JSON (la última línea). */
function videoPy(args, ms = 900_000) {
    let out;
    try {
        out = execFileSync(PYTHON, [VIDEO_PY, ...args], {
            encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: ms, stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (e) {
        const ultima = String(e.stdout || '').trim().split('\n').pop();
        let j = null;
        try { j = JSON.parse(ultima); } catch { /* no era JSON */ }
        throw new Error(j?.error ? `fotogramas: ${j.error}`
            : `cee_inicial_video.py: ${String(e.stderr || e.message).slice(0, 300)}`);
    }
    return JSON.parse(out.trim().split('\n').pop());
}

const mmss = t => (t === null || t === undefined ? '?'
    : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`);
const carpetaVideo = (ctx) => (opt('out') && opt('out') !== true ? opt('out')
    : path.join(CACHE, ctx.expediente.numero_expediente, 'video'));

/** Los vídeos de ANTES de la obra que hay en la carpeta de documentación. */
async function videosDeDrive(ctx) {
    const raiz = ctx.driveFolderId;
    const subNombre = ctx.origen === 'cee' ? '4. DOCUMENTACIÓN PARA CEE' : placaOcr.SUBCARPETA_DOCS;
    const sub = raiz && await driveService.findSubfolderByName(raiz, subNombre);
    if (!sub) return [];
    return (await driveService.listFiles(sub) || [])
        .filter(f => videoSrv().esVideo(f))
        // El de la REFORMA es de después: enseña la casa ya cambiada.
        .filter(f => !/^VIDEO_REFORMA/i.test(f.name || ''))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }));
}

/** El manifiesto que deja `video` (o null). */
function manifiestoVideo(ctx) {
    const dir = opt('video-dir') && opt('video-dir') !== true ? opt('video-dir') : carpetaVideo(ctx);
    const f = path.join(dir, 'video.json');
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

async function video() {
    const ctx = await cargar(POS[0]);
    const out = carpetaVideo(ctx);
    const dirVid = path.join(out, 'videos');
    const dirFr = path.join(out, 'fotogramas');
    fs.mkdirSync(dirVid, { recursive: true });
    fs.mkdirSync(dirFr, { recursive: true });
    const refrescar = RESTO.includes('--refrescar');

    // 1. Los vídeos: los de --archivo (locales, p. ej. bajados del WhatsApp) o
    //    los de Drive (todos, o los de --videos id1,id2).
    const videos = [];
    const archivos = opt('archivo') && opt('archivo') !== true ? String(opt('archivo')).split(',') : [];
    if (archivos.length) {
        for (const a of archivos) {
            if (!fs.existsSync(a)) throw new Error(`No existe ${a}.`);
            videos.push({ nombre: path.basename(a), local: path.resolve(a), drive_id: null,
                          tam: fs.statSync(a).size });
        }
    } else {
        let lista = await videosDeDrive(ctx);
        const elegidos = opt('videos') && opt('videos') !== true ? String(opt('videos')).split(',') : null;
        if (elegidos) lista = lista.filter(f => elegidos.includes(f.id) || elegidos.includes(f.name));
        if (!lista.length) {
            throw new Error('No hay ningún vídeo de la vivienda en la carpeta de documentación '
                + '(apartado VIDEO_VIVIENDA). Si llegó por WhatsApp, bájalo y pásalo con --archivo.');
        }
        for (const f of lista) {
            const local = path.join(dirVid, f.name.replace(/[\\/:*?"<>|]/g, '_'));
            const meta = await driveService.getFileMetadata(f.id, 'id, name, mimeType, size').catch(() => null);
            const tam = Number(meta?.size) || null;
            if (!fs.existsSync(local) || (tam && fs.statSync(local).size !== tam)) {
                process.stdout.write(`Bajando ${f.name} (${kb(tam)})… `);
                const buf = await driveService.getFileContent(f.id);
                fs.writeFileSync(local, buf);
                console.log('✓');
            }
            videos.push({ nombre: f.name, local, drive_id: f.id, tam: tam || fs.statSync(local).size,
                          mime: meta?.mimeType || f.mimeType || null });
        }
    }

    // 2. Cuánto dura cada uno, si tiene sonido, y su hoja de contactos.
    for (const [i, v] of videos.entries()) {
        Object.assign(v, videoPy(['probe', v.local]));
        v.hoja = path.join(out, `hoja_${i + 1}.jpg`);
        const n = Math.max(12, Math.min(48, Math.round((v.duracion_s || 60) / 5)));
        videoPy(['hoja', v.local, v.hoja, '--n', String(n), '--cols', '6']);
        console.log(`VÍDEO ${i + 1}: ${v.nombre} · ${mmss(v.duracion_s)} · ${v.ancho}×${v.alto}`
            + ` · ${v.audio === true ? 'con sonido' : v.audio === false ? 'SIN sonido' : 'sonido ?'}`
            + ` · ${kb(v.tam)} (motor de fotogramas: ${v.motor})`);
    }

    // 3. La lectura del vídeo, cacheada: la misma entrada no se vuelve a pagar
    //    (y da lo mismo cada vez que se mire).
    const svc = videoSrv();
    const claveLectura = JSON.stringify({ v: videos.map(v => [v.drive_id || v.nombre, v.tam]), m: svc.MODELO });
    const fLectura = path.join(out, 'lectura.json');
    let lectura = null;
    if (!refrescar && fs.existsSync(fLectura)) {
        const c = JSON.parse(fs.readFileSync(fLectura, 'utf8'));
        // Se vuelve a NORMALIZAR lo que dijo el modelo: si las reglas han
        // cambiado desde que se pidió, se aplican sin volver a pagarla.
        if (c.clave === claveLectura && c.lectura?.bruto) {
            lectura = { ...svc.normalizar(c.lectura.bruto, videos), bruto: c.lectura.bruto,
                        modelo: c.lectura.modelo, at: c.lectura.at };
            if (videos.every(v => v.audio === false)) lectura.narracion = [];
        }
    }
    if (!lectura) {
        console.log(`\nMirando ${videos.length > 1 ? 'los vídeos' : 'el vídeo'} con ${svc.MODELO} (≈1 min)…`);
        lectura = await svc.analizarVideos(videos.map(v => ({
            buffer: fs.readFileSync(v.local), nombre: v.nombre, mimeType: v.mime, duracion_s: v.duracion_s,
        })));
        // Un vídeo SIN sonido no puede tener narración: lo que diga el modelo
        // de lo que «dice quien graba» es inventado.
        if (videos.every(v => v.audio === false)) lectura.narracion = [];
        fs.writeFileSync(fLectura, JSON.stringify({ clave: claveLectura, lectura }, null, 1));
    } else console.log('\n(lectura del vídeo de la caché: --refrescar para volver a pedirla)');

    // 4. Los fotogramas: el más nítido de ±0,7 s del segundo de cada hueco y de
    //    cada fachada vista desde fuera.
    const pedidos = [
        ...lectura.huecos.filter(h => h.t !== null).map(h => ({ clave: h.id, t: h.t, video: h.video })),
        ...lectura.fachadas.filter(f => f.t !== null).map(f => ({ clave: f.id, t: f.t, video: f.video })),
    ];
    const fotogramas = {};
    for (const [i, v] of videos.entries()) {
        const suyos = pedidos.filter(p => p.video === i + 1);
        if (!suyos.length) continue;
        const fPed = path.join(out, `pedidos_${i + 1}.json`);
        fs.writeFileSync(fPed, JSON.stringify(suyos));
        const r = videoPy(['fotogramas', v.local, fPed, dirFr]);
        for (const f of r.fotogramas || []) {
            if (f.error) { console.log(`  ✗ ${f.clave}: ${f.error}`); continue; }
            fotogramas[f.clave] = { archivo: f.archivo, t: f.t, nitidez: f.nitidez, video: i + 1,
                                    video_nombre: v.nombre, video_drive_id: v.drive_id };
        }
    }

    // 5. La SEGUNDA lectura, fotograma a fotograma y con otro modelo (cacheada).
    const conFoto = lectura.huecos.filter(h => fotogramas[h.id]);
    const fConf = path.join(out, 'confirmacion.json');
    const claveConf = JSON.stringify({ l: claveLectura, at: lectura.at, m: svc.MODELO_FOTOGRAMAS,
                                       f: conFoto.map(h => [h.id, fotogramas[h.id].t]) });
    let conf = null;
    if (!refrescar && fs.existsSync(fConf)) {
        const c = JSON.parse(fs.readFileSync(fConf, 'utf8'));
        if (c.clave === claveConf) conf = c.conf;
    }
    if (!conf && conFoto.length && !RESTO.includes('--sin-confirmar')) {
        console.log(`Comprobando los ${conFoto.length} fotogramas con ${svc.MODELO_FOTOGRAMAS}…`);
        conf = await svc.confirmarFotogramas(conFoto.map(h => ({
            id: h.id, buffer: fs.readFileSync(fotogramas[h.id].archivo), mimeType: 'image/jpeg',
            descripcion: [h.tipo.replace('_', ' '), h.descripcion].filter(Boolean).join(': '),
        })));
        fs.writeFileSync(fConf, JSON.stringify({ clave: claveConf, conf }, null, 1));
    }
    const rec = svc.reconciliar(lectura.huecos, conf?.lecturas || {});

    // 6. Cada hueco a su pared, con el plano de la geometría (la misma que la
    //    ventana: lo que el trabajo ya deja fuera, fuera).
    const t = await cex.leerTrabajo(ctx.expediente.id, ctx.origen).catch(() => null);
    let geo = geoCacheada(ctx);
    if (!geo) {
        await saludMotor();
        geo = await geometria(ctx, { cuerpos: t?.cuerpos_fuera || null, zonas: t?.zonas_fuera || null,
                                     recorte: t?.recorte_vivienda || null,
                                     altura: t?.ajustes?.altura_libre_planta || null });
    }
    const u = videoUtil();
    const lados = u.ladosDePlano(murosDe(geo));
    const niveles = (geo.plantas || []).filter(p => p.habitable !== false).map(p => p.nivel);
    // Las fachadas vistas desde FUERA, primero: a su lado, con la misma regla
    // (planta baja). Sus huecos heredan esa pared.
    const fachadasVistas = [];
    const fachadas = lectura.fachadas.map((f) => {
        const a = u.asignarHuecos({ huecos: [{ id: f.id, tipo: f.tiene_entrada ? 'puerta_entrada' : 'ventana',
                                               planta: niveles.includes(0) ? 0 : niveles[0], da_a: f.da_a }] },
                                  lados, { niveles, entrada: t?.entrada || null }).huecos[0];
        if (a?.estado === 'asignado') fachadasVistas.push(a.lado);
        return { ...f, lado: a?.estado === 'asignado' ? a.lado : null, pared: a?.pared || null,
                 candidatas: a?.candidatas || [] };
    });
    const asig = u.asignarHuecos({ huecos: rec.huecos }, lados, {
        niveles, entrada: t?.entrada || null, estancias: lectura.estancias,
        fachadas: Object.fromEntries(fachadas.filter(f => f.lado).map(f => [f.id, f.lado])),
    });
    const est = u.estadoDeLados(lados, asig, { fachadasVistas });
    const exceso = u.capacidad(asig.huecos, lados);

    // 7. El mosaico rotulado, para repasar de una vez lo que se propone.
    const nombreEst = Object.fromEntries(lectura.estancias.map(e => [e.id, e.nombre]));
    const mosaico = [
        ...asig.huecos, ...asig.lucernarios, ...asig.descartados,
    ].filter(h => fotogramas[h.id]).map(h => ({
        clave: h.id, archivo: fotogramas[h.id].archivo,
        // «|» separa las dos líneas del rótulo (cee_inicial_video.py, `componer`).
        rotulo: `${h.id} · ${mmss(fotogramas[h.id].t)} · P${h.nivel ?? h.planta ?? '?'} · ${h.tipo.replace('_', ' ')}|`
            + `${nombreEst[h.estancia] || ''} →${h.estado === 'asignado' ? h.pared : h.tipo === 'lucernario' ? 'cubierta'
                : h.motivo && !h.estado ? 'no se pone' : '¿?'}`,
    }));
    for (const f of fachadas.filter(x => fotogramas[x.id])) {
        mosaico.push({ clave: f.id, archivo: fotogramas[f.id].archivo,
                       rotulo: `${f.id} · ${mmss(fotogramas[f.id].t)} · fachada vista desde fuera|`
                           + `da a ${f.da_a || '?'} → ${f.pared || '¿?'}` });
    }
    let fMosaico = null;
    if (mosaico.length) {
        const fM = path.join(out, 'mosaico.json');
        fs.writeFileSync(fM, JSON.stringify(mosaico));
        fMosaico = path.join(out, 'mosaico.jpg');
        videoPy(['mosaico', fM, fMosaico, '--cols', '4']);
    }

    // 8. La PROPUESTA para el plan, y las paredes que hay que pedir.
    const huecosPlan = u.huecosParaPlan(asig, { varios: videos.length > 1 });
    const fotosPlan = {};
    for (const [pared, lista] of Object.entries(huecosPlan)) {
        fotosPlan[pared] = [...new Set(lista.map(h => h.foto))].slice(0, 8);
    }
    for (const f of fachadas) {
        if (f.pared && fotogramas[f.id]) (fotosPlan[f.pared] ||= []).unshift(`frame:${f.id}`);
    }
    const plantaDe = n => (geo.plantas || []).find(p => p.nivel === n)?.id;
    const arriba = [...(geo.plantas || [])].filter(p => p.habitable !== false).sort((a, b) => b.nivel - a.nivel)[0];
    const lucernariosPlan = asig.lucernarios.map(l => {
        const med = u.medidas(l);
        return { planta: plantaDe(l.nivel) || arriba?.id, ancho: med.ancho, alto: med.alto,
                 por_que: `${l.descripcion || 'lucernario'} — vídeo ${mmss(l.t)} (${med.estimada
                     ? `medida estimada: ${l.medida_referencia}` : 'medida por defecto'})`.slice(0, 280) };
    });
    const pedir = est.pedir.flatMap(l => l.muros.filter(m => (m.largo || 0) >= u.LARGO_MINIMO).map(m => m.id));

    const manifiesto = {
        clave: ctx.clave, generado_at: new Date().toISOString(),
        videos: videos.map(v => ({ nombre: v.nombre, drive_id: v.drive_id, local: v.local,
                                   duracion_s: v.duracion_s, audio: v.audio, hoja: v.hoja })),
        modelo: lectura.modelo, modelo_fotogramas: conf?.modelo || null,
        lectura: { ...lectura, huecos: undefined },
        fotogramas,
        huecos: asig.huecos, lucernarios: asig.lucernarios, descartados: asig.descartados,
        fachadas, lados: est.lados, exceso, avisos: [...lectura.avisos, ...rec.avisos, ...asig.avisos],
        pedir,
        confirmar: est.confirmar.flatMap(l => l.muros.filter(m => (m.largo || 0) >= u.LARGO_MINIMO).map(m => m.id)),
        propuesta: { huecos: huecosPlan, fotos: fotosPlan, lucernarios: lucernariosPlan },
    };
    fs.writeFileSync(path.join(out, 'video.json'), JSON.stringify(manifiesto, null, 1));

    // 9. El informe.
    console.log(`\nLECTURA (${lectura.modelo}): ${lectura.tipo_recorrido} · calidad ${lectura.calidad || '?'}`
        + `${lectura.calidad_nota ? ` (${lectura.calidad_nota})` : ''} · plantas ${JSON.stringify(lectura.plantas_recorridas)}`
        + ` · ¿todas las habitaciones? ${lectura.recorrido_completo === true ? 'sí' : lectura.recorrido_completo === false ? 'NO' : '?'}`);
    console.log('ESTANCIAS: ' + lectura.estancias.map(e => `${e.id} ${e.nombre} (P${e.planta ?? '?'}, ${mmss(e.t_desde)})`).join(' · '));
    console.log('\nHUECOS');
    for (const h of asig.huecos) {
        const ev = h.evidencia ? ` «${String(h.evidencia).slice(0, 70)}»` : '';
        const med = u.medidas(h);
        console.log(`  ${h.id.padEnd(4)} ${mmss(fotogramas[h.id]?.t ?? h.t).padStart(5)} P${h.nivel ?? '?'} `
            + `${(nombreEst[h.estancia] || h.fachada || '').padEnd(16).slice(0, 16)} ${h.tipo.padEnd(14)}`
            + ` da a ${(h.da_a || '¿?').padEnd(7)} (${h.da_a_fuente || '—'})${ev}`);
        console.log(`        ${med.ancho}×${med.alto} m ${med.estimada ? `(estimada: ${h.medida_referencia})` : '(por defecto)'}`
            + ` → ${h.estado === 'asignado' ? `${h.pared} [${h.confianza}]` : h.estado.toUpperCase()} · ${h.motivo}`
            + `${h.estado === 'dudoso' && h.candidatas?.length ? ` · candidatas: ${h.candidatas.map(c => c.pared).join(', ')}` : ''}`);
    }
    if (asig.lucernarios.length) {
        console.log('\nLUCERNARIOS: ' + asig.lucernarios.map(l => `${l.id} ${mmss(l.t)} (${l.descripcion || ''})`).join(' · '));
    }
    for (const d of asig.descartados) console.log(`  · ${d.id} ${d.tipo}: ${d.motivo}`);
    if (fachadas.length) {
        console.log('\nFACHADAS VISTAS DESDE FUERA');
        for (const f of fachadas) {
            console.log(`  ${f.id} ${mmss(f.t)} da a ${f.da_a || '?'} · ${f.encuadre} · ${f.descripcion || ''} → ${f.pared || `¿? (${f.candidatas.map(c => c.pared).join(', ') || 'sin candidatas'})`}`);
        }
    }
    console.log('\nLADOS DEL PLANO');
    const SIMB = { resuelto: '✓', por_confirmar: '~', dudoso: '?', sin_ver: '✗', no_caben: '!' };
    for (const l of est.lados) {
        console.log(`  ${SIMB[l.estado]} ${u.rotuloLado(l)} — ${l.estado.replace('_', ' ')}`
            + `${l.huecos.length ? ` · ${l.huecos.join(', ')}` : ''}${l.dudosos.length ? ` · dudosos ${l.dudosos.join(', ')}` : ''}`);
    }
    for (const e of exceso) console.log(`  ! ${e.pared}: los huecos suman ${fmt(e.suma)} m y la pared mide ${fmt(e.largo)} m`);
    for (const l of est.sinPedir) console.log(`  · ${l.id} (${fmt(l.largo)} m) ${l.estado === 'sin_ver' ? 'sin ver' : 'en duda'}: muy corta para pedir su foto (si tiene una ventana, lo verá el certificador)`);
    const avisos = manifiesto.avisos;
    if (avisos.length) { console.log('\nAVISOS'); for (const a of avisos) console.log(`  ⚠ ${a}`); }
    if (lectura.narracion.length) {
        console.log('\nLO QUE DICE QUIEN GRABA (según la lectura; NO comprobado — úsalo como pista):');
        for (const n of lectura.narracion) console.log(`  ${mmss(n.t)} «${n.texto}»`);
    }
    if (lectura.no_se_ve.length) { console.log('\nNO SE VE'); for (const x of lectura.no_se_ve) console.log(`  · ${x}`); }
    if (lectura.observaciones) console.log(`\nOBSERVACIONES: ${lectura.observaciones}`);

    console.log(`\nFICHEROS en ${out}`);
    for (const v of videos) console.log(`  ${path.basename(v.hoja)}  (hoja de contactos de ${v.nombre})`);
    if (fMosaico) console.log('  mosaico.jpg  (cada hueco con su fotograma y la pared propuesta)');
    console.log('  fotogramas/  ·  video.json (con la PROPUESTA para el plan: «propuesta»)');
    console.log('\nSIGUIENTE');
    console.log('  1. MIRA mosaico.jpg y la hoja de contactos junto a plano.png / plano_satelite.png.');
    console.log('     Lo asignado se copia al plan desde video.json → propuesta (huecos, fotos con «frame:H3», lucernarios).');
    if (pedir.length) {
        console.log(`  2. ${est.pedir.length} lado(s) sin resolver (${pedir.join(', ')}): hay que pedir las fotos al propietario.`);
        console.log(`     node scripts/cee_inicial.js pedir-fotos ${ctx.clave}        (en seco: enseña el mensaje)`);
    } else {
        console.log('  2. Todas las fachadas quedan resueltas con el vídeo.');
    }
    if (est.confirmar.length) {
        const ids = est.confirmar.flatMap(l => l.muros.filter(m => (m.largo || 0) >= u.LARGO_MINIMO).map(m => m.id));
        console.log(`  3. ${est.confirmar.length} lado(s) asignados con confianza MEDIA (${ids.join(', ')}): míralos en el`
            + ' mosaico; si no lo ves claro, pídelos también (--paredes).');
    }
}

// ─── pedir-fotos ────────────────────────────────────────────────────────────
// Lo que el vídeo (o las fotos) no deja resolver se le PIDE al propietario por
// WhatsApp: un mensaje con cada pared en su lenguaje (el «plan de fotos» del
// motor) y, detrás, el plano de cada una con la pared marcada en rojo.
//
// En SECO por defecto: enseña a quién va, el texto y deja los planos en la
// carpeta. Solo con --enviar sale, y solo con el «sí» del usuario para ESE
// mensaje (CLAUDE.md: nada sale a un tercero sin su confirmación).

const SLOT_DE_TOMA = (tipo) => (tipo === 'CALLE' ? 'FOTO_FACHADA_PRINCIPAL' : 'FOTO_PATIOS_INTERIORES');

async function enlaceSubida(ctx, slots) {
    // Sin --enviar no se crea ningún token: solo se usa el que ya exista.
    if (ctx.origen === 'cee') {
        const row = { id: ctx.expediente.id, portal_token: ctx.expediente.portal_token || null };
        if (!row.portal_token) {
            const { data } = await supabase.from('cee_directos').select('portal_token').eq('id', row.id).maybeSingle();
            row.portal_token = data?.portal_token || null;
        }
        if (!row.portal_token && !RESTO.includes('--enviar')) return null;
        return require('../services/ceeDirectoDocsService').enlace(row, slots);
    }
    const oppId = ctx.expediente.oportunidad_id || (ctx.origen === 'op' ? ctx.expediente.id : null);
    if (!oppId) return null;
    const ru = require('../services/reformaUploadService');
    const { data } = await supabase.from('oportunidades')
        .select('token:datos_calculo->>upload_token').eq('id', oppId).maybeSingle();
    let base = data?.token ? ru.buildUploadLink(oppId, data.token) : null;
    if (!base && RESTO.includes('--enviar')) base = await ru.ensureUploadLink(oppId);
    if (!base || base.includes('/firma/')) return base;
    return `${base}${base.includes('?') ? '&' : '?'}need=${slots.join(',')}`;
}

async function apiInterna(ruta, cuerpo) {
    const key = process.env.INTERNAL_API_KEY;
    if (!key) throw new Error('Falta INTERNAL_API_KEY en el .env del backend.');
    const API = String(process.env.BROKERGY_API_URL || 'https://app.brokergy.es').replace(/\/+$/, '');
    const r = await fetch(`${API}${ruta}`, {
        method: 'POST', headers: { 'x-internal-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(120_000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `${API}${ruta} → ${r.status}`);
    return j;
}

async function pedirFotos() {
    const ctx = await cargar(POS[0]);
    const enviar = RESTO.includes('--enviar');
    const conPlanos = !RESTO.includes('--sin-planos');
    const man = manifiestoVideo(ctx);
    let paredes = opt('paredes') && opt('paredes') !== true
        ? String(opt('paredes')).split(',').map(s => s.trim()).filter(Boolean)
        : (man?.pedir || []);
    if (!paredes.length) {
        throw new Error('No hay paredes que pedir: pásalas con --paredes FBN1,F1O1 (o lanza antes «video»).');
    }
    let geo = geoCacheada(ctx);
    if (!geo) { await saludMotor(); geo = await geometria(ctx); }
    // Se pide por LADO de la casa (una foto con todas sus plantas), no por muro.
    const u = videoUtil();
    const lados = u.ladosDePlano(murosDe(geo));
    const quiero = new Set(paredes);
    const ladosPedir = lados.filter(l => l.muros.some(m => quiero.has(m.id)));
    const enLado = new Set(ladosPedir.flatMap(l => l.muros.map(m => m.id)));
    const fuera = paredes.filter(p => !enLado.has(p));
    if (fuera.length) {
        console.log(`⚠ ${fuera.join(', ')} no son fachadas de la vivienda (¿medianera o fuera?): no se piden.`);
    }
    if (!ladosPedir.length) throw new Error('Ninguna de esas paredes es una fachada que se pueda fotografiar.');

    // A quién: el titular o su persona de contacto, con el MISMO criterio que el
    // resto de avisos al cliente (`ceeDirectoService.contactoCliente`).
    const cli = ctx.cliente;
    if (!cli) throw new Error('Esta obra no tiene cliente vinculado: no hay a quién escribir.');
    const contacto = require('../services/ceeDirectoService').contactoCliente(cli);
    const titular = [cli.nombre_razon_social, cli.apellidos].filter(Boolean).join(' ');
    const { buildInstalacionAddress } = await esm('expedientes/utils/docGenerators.js').catch(() => ({}));
    const dirObj = buildInstalacionAddress ? buildInstalacionAddress({ ...ctx.expediente, clientes: cli }) : null;
    // La calle SIN código postal ni provincia (a veces `calle` trae la dirección
    // entera): en un WhatsApp el cliente ya sabe en qué pueblo vive.
    const calleCorta = String([dirObj?.calle, dirObj?.num].filter(Boolean).join(' ') || dirObj?.full || '')
        .replace(/\s+\d{5}\b.*$/, '').replace(/,\s*$/, '').trim();
    const direccion = [calleCorta, dirObj?.municipio].filter(Boolean).join(', ')
        || ctx.expediente.direccion || '';
    const peticiones = u.peticionesPorLado(ladosPedir, geo.plan_fotos, { direccion: calleCorta });
    const slots = [...new Set(peticiones.map(p => p.slot))];
    const url = await enlaceSubida(ctx, slots);
    const motivo = opt('motivo') && opt('motivo') !== true ? opt('motivo') : (man ? 'video' : 'fotos');
    const texto = require('../services/recordatorios').paredesFotosMsg({
        destinatario: contacto.nombre, tercero: contacto.tercero,
        numExp: ctx.origen === 'op' ? null : ctx.expediente.numero_expediente,
        obra: { cliente: titular, direccion }, motivo,
        paredes: peticiones.map(p => ({ titulo: p.titulo, subtitulo: p.subtitulo })), url, conPlanos,
    });

    // Los planos, para mirarlos antes de mandarlos.
    const out = path.join(CACHE, ctx.expediente.numero_expediente, 'pedir-fotos');
    fs.mkdirSync(out, { recursive: true });
    const planos = [];
    peticiones.forEach((p, i) => {
        const b64 = String(p.plano_datos || '').replace(/^data:image[/]png;base64,/, '');
        if (!b64) return;
        const f = path.join(out, `${i + 1} - ${p.lado}.png`);
        fs.writeFileSync(f, Buffer.from(b64, 'base64'));
        planos.push({ archivo: f, b64, caption: `${i + 1}. ${p.titulo}` });
    });
    const tomas = peticiones;

    const tel = String(contacto.tlf || '');
    console.log(`\nTITULAR: ${titular || '—'}`);
    console.log(`IRÁ A:   ${contacto.nombre || '—'} · WhatsApp ${tel ? `${tel.slice(0, 3)}•••${tel.slice(-3)}` : '— SIN TELÉFONO'}`
        + `${contacto.tercero ? '  (es su PERSONA DE CONTACTO: se le escribe en tercera persona)' : ''}`);
    console.log(`PAREDES: ${tomas.map((t, i) => `${i + 1}. ${t.lado} (${t.muros.join('+')})`).join(' · ')}`);
    console.log(`ENLACE:  ${url || '— (no hay token de subida: se creará al enviar)'}`);
    console.log(`\n────── MENSAJE ──────\n${texto}\n─────────────────────`);
    if (conPlanos) console.log(`\n+ ${planos.length} plano(s) con la pared en rojo:\n${planos.map(p => `  ${p.archivo}`).join('\n')}`);

    if (!enviar) {
        console.log('\nEN SECO: no se ha enviado nada. Enséñaselo al usuario y, con su «sí» para ESTE mensaje, '
            + 'repite con --enviar.');
        return;
    }
    if (!tel) throw new Error('El destinatario no tiene teléfono: no se puede mandar por WhatsApp.');
    const encolado = await apiInterna('/api/whatsapp/send-text', { phone: tel, message: texto });
    // El texto ENTRA EN LA COLA y los planos salen directos: sin esperar, el
    // primer plano puede llegar antes que el mensaje que lo explica. Se espera a
    // que el servidor lo dé por enviado (con su ACK, ver whatsappService).
    let estadoCola = 'PENDING';
    for (let i = 0; i < 40 && encolado?.id && estadoCola === 'PENDING'; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const { data } = await supabase.from('whatsapp_queue').select('status, error').eq('id', encolado.id).maybeSingle();
        estadoCola = data?.status || 'PENDING';
        if (estadoCola === 'FAILED') throw new Error(`El mensaje no ha salido: ${data?.error || 'fallo de WhatsApp'}`);
    }
    if (estadoCola !== 'SENT') {
        console.log('⚠ El mensaje sigue en la cola tras 2 minutos: NO se mandan los planos (llegarían antes '
            + 'que el texto). Mira el estado de WhatsApp en la app.');
        return;
    }
    console.log('✓ Mensaje enviado.');
    let enviados = 0;
    if (conPlanos) {
        for (const p of planos) {
            try {
                await apiInterna('/api/whatsapp/send-media', {
                    phone: tel, caption: p.caption, asDocument: false,
                    media: { base64: p.b64, mimetype: 'image/png', filename: path.basename(p.archivo) },
                });
                enviados++;
            } catch (e) { console.log(`  ✗ plano «${p.caption}»: ${e.message}`); }
        }
        console.log(`✓ ${enviados} de ${planos.length} plano(s) enviados.`);
    }
    // Que conste: en el historial y, si el CEE es del agente, como «esperando».
    const que = `las fotos de ${tomas.length} pared${tomas.length > 1 ? 'es' : ''} de fuera (pedidas por WhatsApp a ${contacto.nombre || 'el cliente'}: ${paredes.join(', ')})`;
    try {
        await require('../services/agenteIa').esperar({ negocio: ctx.origen, clave: ctx.clave, que });
        console.log('✓ Anotado: el CEE queda «esperando las fotos» (lo dice agente_ia.js cola).');
    } catch (e) { console.log(`  (no se ha podido anotar: ${e.message})`); }
}

// ─── streetview ─────────────────────────────────────────────────────────────
//
// Sin fotos de las fachadas el CEE sale sin ventanas, y las que dan a la CALLE
// casi siempre están en Google Street View: se hacía a mano (Maps → captura →
// subir). Aquí, por cada LADO de la casa (sus fachadas de todas las plantas en
// el mismo plano) se busca el panorama más cercano DELANTE de él, se le apunta
// y se baja la foto a `<out>/streetview/SV<n>.jpg`, con su manifiesto.
//
// No escribe nada: las fotos entran en el plan de `aplicar` como `sv:SV1` (en
// `fotos` y en `huecos[].foto`), y es `aplicar --escribir` quien las sube a su
// pared, como los fotogramas del vídeo. `leer-pared --fotos sv:SV1` las lee.
//
// Clave: GOOGLE_MAPS_KEY del .env (la API «Street View Static»). La consulta de
// si hay panorama (metadata) es gratis; cada foto, ~0,007 €.

const SV_API = 'https://maps.googleapis.com/maps/api/streetview';
const carpetaSV = (ctx) => (opt('out') && opt('out') !== true ? path.join(opt('out'), 'streetview')
    : path.join(CACHE, ctx.expediente.numero_expediente, 'streetview'));

/** El manifiesto que deja `streetview` (o null). */
function manifiestoSV(ctx) {
    const dirs = [opt('sv-dir') && opt('sv-dir') !== true ? opt('sv-dir') : null, carpetaSV(ctx),
                  path.join(CACHE, ctx.expediente.numero_expediente, 'streetview')].filter(Boolean);
    for (const d of dirs) {
        const f = path.join(d, 'streetview.json');
        if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    }
    return null;
}

async function streetview() {
    const key = process.env.GOOGLE_MAPS_KEY;
    if (!key) throw new Error('Falta GOOGLE_MAPS_KEY en el .env del backend (API Street View Static).');
    await saludMotor();
    const ctx = await cargar(POS[0]);
    const t = await cex.leerTrabajo(ctx.expediente.id, ctx.origen).catch(() => null);
    const geo = geoCacheada(ctx) || await geometria(ctx, { cuerpos: t?.cuerpos_fuera || null,
        zonas: t?.zonas_fuera || null, recorte: t?.recorte_vivienda || null,
        altura: t?.ajustes?.altura_libre_planta || null });
    const sv = require('../utils/streetView');
    const { lienzoAMundo } = await esm('cee-envolvente/logic/geometriaPlano.js');
    const { husoDe, utmALatLon } = await esm('cee-envolvente/logic/ortofoto.js');
    const ref = lienzoAMundo(geo.georef);
    const huso = husoDe(geo.georef?.crs);
    if (!ref || !huso) throw new Error('La geometría no trae su georreferencia: no se puede situar la casa.');
    const { lados, patios } = sv.ladosDeFachada(murosDe(geo), ref);
    const dir = carpetaSV(ctx);
    fs.mkdirSync(dir, { recursive: true });

    const metadata = async (p, radio) => {
        const { lat, lon } = utmALatLon(p[0], p[1], huso);
        const u = `${SV_API}/metadata?location=${lat.toFixed(7)},${lon.toFixed(7)}&radius=${radio}`
            + `&source=outdoor&key=${key}`;
        const j = await (await fetch(u, { signal: AbortSignal.timeout(20_000) })).json();
        if (j.status !== 'OK') return j.status === 'ZERO_RESULTS' ? null
            : (() => { throw new Error(`Street View: ${j.status} ${j.error_message || ''}`); })();
        return { ...j, mundo: sv.latLonAUtm(j.location.lat, j.location.lng, huso) };
    };

    const fotosSv = [];
    const sinPanorama = [];
    let n = 0;
    for (const lado of lados) {
        // Delante de la fachada, a 12 m y a 25 m: el primero que esté DELANTE.
        let pano = null, enc = null;
        for (const [d, r] of [[12, 30], [25, 40]]) {
            // eslint-disable-next-line no-await-in-loop
            const p = await metadata(sv.desplazar(lado.centro, lado.normal, d), r);
            if (!p) continue;
            const e = sv.encuadre(lado, p.mundo, { alturaPlanta: alturaMedida(geo) });
            if (e) { pano = p; enc = e; break; }
        }
        if (!pano) { sinPanorama.push(lado); continue; }
        n += 1;
        const id = `SV${n}`;
        const archivo = path.join(dir, `${id}_${lado.orientacion}.jpg`);
        const u = `${SV_API}?size=640x480&pano=${pano.pano_id}&heading=${enc.heading}`
            + `&fov=${enc.fov}&pitch=${enc.pitch}&source=outdoor&return_error_code=true&key=${key}`;
        // eslint-disable-next-line no-await-in-loop
        const r = await fetch(u, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) {
            sinPanorama.push({ ...lado, error: `HTTP ${r.status}` });
            continue;
        }
        // eslint-disable-next-line no-await-in-loop
        fs.writeFileSync(archivo, Buffer.from(await r.arrayBuffer()));
        fotosSv.push({ id, archivo, lado: lado.orientacion, muros: lado.muros, plantas: lado.plantas,
                       ancho: Math.round(lado.ancho * 100) / 100, pano_id: pano.pano_id,
                       fecha: pano.date || null, copyright: pano.copyright || '© Google', ...enc });
    }
    fs.writeFileSync(path.join(dir, 'streetview.json'),
        JSON.stringify({ clave: ctx.clave, at: new Date().toISOString(), fotos: fotosSv }, null, 1));

    console.log(`\nSTREET VIEW · ${rcDe(ctx)} · ${lados.length} lado(s) con fachada al exterior\n`);
    for (const f of fotosSv) {
        console.log(`  sv:${f.id}  ${f.lado.padEnd(2)} · ${f.ancho} m · ${f.plantas} planta(s) · `
            + `${f.muros.join(', ')}\n        panorama ${f.fecha || 's/f'} a ${String(f.distancia).replace('.', ',')} m`
            + ` · mira ${f.heading}° · fov ${f.fov}° · ${f.oblicuidad > 45 ? `⚠ muy de lado (${f.oblicuidad}°)` : `de frente (${f.oblicuidad}°)`}`
            + `\n        ${f.archivo}`);
    }
    for (const l of sinPanorama) {
        console.log(`  ✗ ${l.orientacion.padEnd(2)} · ${Math.round(l.ancho * 100) / 100} m · ${l.muros.join(', ')}`
            + ` — ${l.error || 'sin panorama DELANTE (no da a una calle con Street View)'}`);
    }
    if (patios.length) {
        console.log(`\n  PATIOS (no se ven desde la calle: hay que pedir sus fotos): ${patios.map(m => m.id).join(', ')}`);
    }
    console.log(`\nMÍRALAS: cada foto, ¿es de verdad esa fachada? (la calle de enfrente, la fecha del panorama).`
        + '\nEn el plan van como «sv:SV1» en `fotos` y en `huecos[].foto` (con su `box`); `leer-pared --fotos sv:SV1`.'
        + '\nSon fotos de Google: se pegan a la pared como apoyo, nunca como foto del cliente.');
}

// ─── REHACER sobre lo dibujado a mano («Así es como está») ─────────────────

/**
 * Rehace el CEE inicial sobre el trabajo GUARDADO, que ha corregido una persona
 * en la pizarra del plano y ha dado por bueno («Así es como está»). Es `aplicar`
 * con un plan vacío —todo sale de lo guardado— más lo que traiga `--plan` (para
 * MEDIR las ventanas y puertas dibujadas: `medir`, y poco más: lo tocado a mano no
 * se puede cambiar desde el plan).
 */
async function rehacer() {
    const fPlan = opt('plan');
    const plan = fPlan && fPlan !== true ? JSON.parse(fs.readFileSync(fPlan, 'utf8')) : {};
    const ctx = await cargar(POS[0]);
    const rev = await revisionPlano.leer({ clave: ctx.expediente.id, origen: ctx.origen }).catch(() => null);
    const prev = await cex.leerTrabajo(ctx.expediente.id, ctx.origen).catch(() => null);
    if (!prev) throw new Error('No hay trabajo guardado en la envolvente: no hay nada que rehacer (usa «aplicar»).');
    if (rev) {
        console.log(`\nREVISIÓN A MANO nº ${rev.n} · ${rev.por} · ${rev.at} · ${rev.estado}`);
        if (rev.nota) console.log(`  Nota: «${rev.nota}»`);
        for (const c of rev.cambios || []) console.log(`  · ${c.texto}`);
        if (!(rev.cambios || []).length) console.log('  (sin cambios dibujados: da el plano por bueno tal cual)');
    } else {
        console.log('\n(No hay revisión a mano registrada: se rehace con lo guardado tal cual.)');
    }
    const pend = [];
    for (const [id, hs] of Object.entries(prev.huecos || {})) {
        for (const h of hs || []) {
            if (h?.origen === 'pizarra' && h.estado !== 'medido') pend.push(`${id} ${h.nombre} (${h.tipo}, ≈${h.ancho} m)`);
        }
    }
    if (pend.length) {
        console.log(`\nPOR MEDIR (dibujados a mano, medida aproximada): ${pend.join(' · ')}`
            + '\n  Mídelos con las fotos y pásalos en el plan: "medir": { "FBS1": { "V3": { "ancho": 1.2, "alto": 1.1 } } }.');
    }
    await aplicar({ ...plan, _rehacer: true });
}

// ─── main ───────────────────────────────────────────────────────────────────

const ORDENES = { estado, placas, fotos, paredes, catastro, 'leer-pared': leerPared, eprel,
                  'alta-aerotermia': altaAerotermia, aplicar, croquis, video,
                  'pedir-fotos': pedirFotos, streetview, rehacer, instalacion };

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
