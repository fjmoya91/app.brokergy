#!/usr/bin/env node
// ============================================================================
// cee_inicial.js — GENERAR EL CEE INICIAL de una obra, desde sus fotos.
//
// Lo usa la skill `generar-cee-inicial` (.claude/skills/generar-cee-inicial).
// Es el gemelo de `revisar_cee.js`: aquél mira el `.cex` que ENTREGA el
// certificador; éste prepara el que se le da ya hecho.
//
//   node scripts/cee_inicial.js estado   <clave>
//   node scripts/cee_inicial.js placas   <clave>
//   node scripts/cee_inicial.js fotos    <clave> [--out DIR]
//   node scripts/cee_inicial.js paredes  <clave> [--out DIR]
//   node scripts/cee_inicial.js leer-pared <clave> --pared FBE1 --fotos id1,id2
//   node scripts/cee_inicial.js eprel    <codigo del modelo> [--out DIR]
//   node scripts/cee_inicial.js alta-aerotermia --json datos.json
//            [--ficha ft.pdf[:1,3-4]] [--eprel-fiche f.pdf] [--eprel-label l.pdf] [--escribir]
//   node scripts/cee_inicial.js aplicar  <clave> --plan plan.json [--escribir]
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
                                croquis = null, ajustar = true } = {}) {
    const rc = rcDe(ctx);
    if (!rc) throw new Error('No hay referencia catastral.');
    const construcciones = await cex.construccionesElegidas(ctx.clave, ctx.origen);
    // Las mismas PISTAS que manda la ventana para proponer el croquis: las
    // fachadas en cuya foto hay una puerta de garaje.
    let pistas = null;
    try { pistas = fotosSrv.pistasCroquis(ctx.expediente); } catch { /* sin pista */ }
    const r = await alMotor('/envolvente', {
        referencia_catastral: rc, construcciones,
        cuerpos_excluidos: cuerpos, zonas_fuera: zonas, recorte_vivienda: recorte,
        pistas_croquis: pistas,
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

function geoCacheada(ctx) {
    const f = path.join(CACHE, `${ctx.expediente.numero_expediente}.geo.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

const murosDe = geo => (geo?.plantas || []).flatMap(p => (p.muros || [])
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
    console.log(`\n${e.numero_expediente} · ${ctx.origen.toUpperCase()}`);
    console.log(`  cliente: ${[ctx.cliente?.nombre_razon_social, ctx.cliente?.apellidos].filter(Boolean).join(' ') || '—'}`);
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
    const raiz = ctx.driveFolderId;
    const sub = raiz && await driveService.findSubfolderByName(raiz, placaOcr.SUBCARPETA_DOCS);
    const todas = sub ? (await driveService.listFiles(sub) || [])
        .filter(f => /^image\//.test(f.mimeType || '')) : [];
    console.log(`\n${todas.length} imágenes en «${placaOcr.SUBCARPETA_DOCS}» → ${out}`);
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
                                       recorte: t?.recorte_vivienda || null });
    const { admiteHuecos } = await esm('cee-envolvente/logic/tiposPared.js');
    console.log(`\n${rcDe(ctx)} · ${geo.plantas.length} planta(s) · lienzo ${fmt(geo.ancho)} × ${fmt(geo.alto)} m`);
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
    for (const pr of geo.croquis_propuesto || []) {
        console.log(`\nPROPUESTA DE CROQUIS · nivel ${pr.nivel} (compruébala antes de usarla)`);
        for (const t of pr.trazos || []) {
            console.log(`  ${String(t.uso).padEnd(22)} ${fmt(t.area_m2)} m² (Catastro ${fmt(t.catastro_m2)})`
                + ` · lado ${t.lado} · confianza ${t.confianza}\n    ${t.por_que}`);
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
        if (noViv.length && (c.usos_nivel || []).some(u => u.habitable)) {
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
    if (plan.aerotermia_id) {
        const { data: mod } = await supabase.from('aerotermia').select('*').eq('id', plan.aerotermia_id).maybeSingle();
        if (!mod) throw new Error(`No existe la aerotermia ${plan.aerotermia_id} en el catálogo.`);
        if (ctx0.origen !== 'op') {
            const act = e0.instalacion?.aerotermia_cal?.aerotermia_db_id;
            if (String(act) !== String(mod.id)) {
                avisos.push(`El expediente declara la aerotermia ${act || '—'} y el plan dice ${mod.id}: `
                    + 'cámbiala desde Instalación («Leer placas»), que recalcula el SCOP. Aquí no se toca.');
            }
        } else {
            const calc = await esm('calculator/logic/calculation.js');
            const inp = inputsDe(ctx0);
            const emisor = inp.emitterType || 'radiadores_convencionales';
            const temp = emisor === 'radiadores_convencionales' ? 55 : (emisor === 'radiadores_baja_temp' ? 45 : 35);
            patchInputs = {
                aerothermiaModel: String(mod.id),
                customModelName: '',
                scopHeating: calc.getScopFromModel(mod, inp.zona, temp),
                scopTemporada: calc.getScopSeason(mod, inp.zona, temp),
                scopAcs: calc.getScopAcsFromModel(mod, inp.zona),
                potenciaBomba: mod.potencia_calefaccion || inp.potenciaBomba || 0,
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
        const iguales = ['aerothermiaModel', 'scopHeating', 'potenciaCaldera']
            .every(k => patchInputs[k] === undefined || String(inp[k]) === String(patchInputs[k]));
        if (iguales) patchInputs = null;
    }
    let ctx = ctx0;
    if (patchInputs && ESCRIBIR) {
        const { error } = await supabase.rpc('oportunidad_merge_inputs', { p_id: e0.id, p_patch: patchInputs });
        if (error) throw new Error(`No se han podido guardar los inputs: ${error.message}`);
        await anotar(e0.id, `CEE inicial preparado por la skill: aerotermia ${patchInputs.aerothermiaModel}`
            + ` (SCOP ${patchInputs.scopHeating})${patchInputs.potenciaCaldera ? `, caldera ${patchInputs.potenciaCaldera} kW` : ''}`
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
    const geo = await geometria(ctx, { cuerpos, zonas, recorte: prev?.recorte_vivienda || null,
                                       croquis, ajustar: plan.croquis_ajustar !== false });
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
            };
        });
    }
    const ajustes = {
        ...(prev?.ajustes || {}),
        persiana_defecto: true,
        ...(plan.ventanas ? { ventanas: { ...plan.ventanas, de: 'fotos del expediente (skill generar-cee-inicial)' } } : {}),
        ...(plan.ajustes || {}),
    };
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
    const trabajo = {
        entrada: plan.entrada || prev?.entrada || null, sel: null,
        huecos: { ...(plan.reemplazar ? {} : (prev?.huecos || {})), ...huecos },
        particiones: plan.particiones ?? prev?.particiones ?? [],
        excluidas: plan.excluidas ?? prev?.excluidas ?? [],
        revisadas: prev?.revisadas || [],
        cambian: prev?.cambian || [],
        cubierta_reforma: prev?.cubierta_reforma || {},
        ...(prev?.lucernarios ? { lucernarios: prev.lucernarios } : {}),
        tipos: prev?.tipos || {}, nombres: prev?.nombres || {}, us: prev?.us || {},
        orientaciones: prev?.orientaciones || {}, pilares: prev?.pilares || {},
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

    // 6. La ficha, por el MISMO camino que el botón.
    const { ficha, avisos: avFicha, imagenesFallidas = [] } = await cex.componerFicha(ctx, {
        geometria: geo.geometria, envolvente, ajustes, conImagenes: true, fase: 'inicial',
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
    }
    const todos = [...avisos, ...avMotor];
    if (todos.length) console.log(`\nAVISOS (${todos.length})\n  ⚠ ${todos.join('\n  ⚠ ')}`);
}

/**
 * Una línea en el historial de la oportunidad. Es el MISMO patrón que
 * `anotarHistorial` de `routes/oportunidades.js` (el historial vive dentro de
 * `datos_calculo` y no tiene RPC propia); se relee justo antes de escribir para
 * no pisar lo que acaba de fundir `oportunidad_merge_inputs`.
 */
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

// ─── main ───────────────────────────────────────────────────────────────────

const ORDENES = { estado, placas, fotos, paredes, 'leer-pared': leerPared, eprel,
                  'alta-aerotermia': altaAerotermia, aplicar };

(async () => {
    const f = ORDENES[ORDEN];
    if (!f) {
        console.log(`Órdenes: ${Object.keys(ORDENES).join(' · ')}\n`
            + 'Ver la cabecera de este fichero y .claude/skills/generar-cee-inicial/SKILL.md');
        process.exit(1);
    }
    await f();
    process.exit(0);
})().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
