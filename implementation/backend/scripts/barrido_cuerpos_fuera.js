// ============================================================================
// barrido_cuerpos_fuera.js — ¿sigue siendo el MISMO cuerpo lo que se guardó en
// `cuerpos_fuera`?
//
//   node implementation/backend/scripts/barrido_cuerpos_fuera.js \
//        --motor=http://127.0.0.1:8097 [--vps] [--ahora] [--solo=26RES060_226] \
//        [--salida=informe.json] [--escribir]
//
// POR QUÉ EXISTE — 26RES060_226 (20/10/2026): los cuerpos que no cuentan se
// guardaban por el número que Catastro pone a cada parte («…_part3»), y Catastro
// lo reparte de nuevo en cada lectura. El `_part3` que era el aparcamiento el
// 09/10 era la CASA el 20/10, y al rehacer el CEE se quitaba la casa. El motor
// nombra ahora cada cuerpo por DÓNDE está (`…@x,y`, `floors.clave_de`); esto
// busca los trabajos guardados con el número y dice qué cuerpo era cada uno.
//
// Para cada trabajo con `cuerpos_fuera` (expedientes, oportunidades y CEE
// directos) mira qué cuerpo es cada «_partN» en las lecturas de Catastro que
// hay a mano —la caché del motor local, la del VPS (`--vps`, por ssh, solo
// lectura) y una lectura nueva (`--ahora`, UNA petición por parcela, en serie)—
// y, si no coinciden, MIDE cada candidato con el motor (con la clave, que no
// depende de la numeración) y elige el que cuadra con el resto del trabajo:
//   · no se quita un cuerpo que Catastro dice que es VIVIENDA;
//   · no hay ZONAS dibujadas dentro de lo quitado, en esa planta;
//   · los HUECOS guardados caen en paredes que son FACHADA.
//
// ⚠ `--motor` tiene que ser un motor con el código NUEVO (devuelve
// `cuerpos_traduccion`): el de 8090 puede ser el de antes.
//
// Sin --escribir no toca nada. Con --escribir cambia SOLO `cuerpos_fuera` de
// los trabajos con veredicto claro, por `guardarTrabajo` (la RPC de clave), y
// solo si lo guardado no ha cambiado desde que se leyó. Local = PRODUCCIÓN.
// ============================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const supabase = require('../services/supabaseClient');
const cex = require('../services/ceeEnvolventeCex');

const ARGS = process.argv.slice(2);
const opt = (n) => {
    const a = ARGS.find(x => x === `--${n}` || x.startsWith(`--${n}=`));
    if (!a) return null;
    return a.includes('=') ? a.slice(a.indexOf('=') + 1) : true;
};
const MOTOR = opt('motor') || process.env.CEE_ENGINE_URL || 'http://127.0.0.1:8090';
const ESCRIBIR = !!opt('escribir');
const SOLO = typeof opt('solo') === 'string' ? opt('solo').split(',') : null;
const VPS = 'root@187.77.93.213';
const VPS_CACHE = '/var/lib/docker/volumes/brokergy_cee_cache/_data';
const MOTOR_DIR = path.join(__dirname, '..', '..', 'cee-engine');
const CACHE_LOCAL = process.env.CEE_CACHE_DIR || path.join(os.tmpdir(), 'cee-engine', 'cache');
const TRABAJO = path.join(os.tmpdir(), 'barrido-cuerpos-fuera');

const NUMERO = /_part\d+$/;
//: «2026-10-20T10:54:31+0200» (la caché del motor) también es una fecha.
const fechaDe = s => new Date(String(s || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime() || 0;
const rcDeId = id => (String(id).match(/BU\.([0-9A-Z]{14})/) || [])[1] || null;

// ─── 1. Los trabajos ────────────────────────────────────────────────────────

async function trabajos() {
    const fuentes = [
        ['cae', 'expedientes', 'id,numero:numero_expediente,t:cee->envolvente'],
        ['op', 'oportunidades', 'id,numero:id_oportunidad,t:datos_calculo->envolvente_cee->envolvente'],
        ['cee', 'cee_directos', 'id,numero:numero_expediente,t:cee->envolvente'],
    ];
    const out = [];
    for (const [origen, tabla, sel] of fuentes) {
        for (let desde = 0; ; desde += 200) {
            const { data, error } = await supabase.from(tabla).select(sel).range(desde, desde + 199);
            if (error) throw new Error(`${tabla}: ${error.message}`);
            if (!data.length) break;
            for (const r of data) {
                const cf = r.t?.cuerpos_fuera;
                if (!Array.isArray(cf) || !cf.some(x => NUMERO.test(String(x)))) continue;
                if (SOLO && !SOLO.includes(r.numero)) continue;
                out.push({ origen, id: r.id, numero: r.numero, t: r.t });
            }
        }
    }
    return out;
}

// ─── 2. Las lecturas de Catastro de cada parcela ────────────────────────────

function metaDe(fichero) {
    try { return JSON.parse(fs.readFileSync(fichero.replace(/\.bin$/, '.meta.json'), 'utf8')); }
    catch { return {}; }
}

function lecturaLocal(rc) {
    const dir = path.join(CACHE_LOCAL, rc);
    const f = fs.existsSync(dir) && fs.readdirSync(dir).find(x => x.startsWith(`partes_${rc}.`) && x.endsWith('.bin'));
    if (!f) return null;
    const fichero = path.join(dir, f);
    return { fichero, fecha: metaDe(fichero).fetched_at || null };
}

function lecturasVps(rcs) {
    const dir = path.join(TRABAJO, 'vps');
    fs.mkdirSync(dir, { recursive: true });
    // UNA conexión: por cada parcela, «rc fecha base64». Solo lectura.
    const guion = `for rc in ${rcs.join(' ')}; do f=$(ls ${VPS_CACHE}/$rc/partes_$rc.*.bin 2>/dev/null | head -1); `
        + `[ -n "$f" ] && echo "$rc $(grep -o '"fetched_at": *"[^"]*"' \${f%.bin}.meta.json | cut -d'"' -f4) $(base64 -w0 $f)"; done; true`;
    let salida = '';
    try {
        salida = execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', VPS, guion],
                              { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 120000 });
    } catch (e) {
        console.log(`⚠ VPS: ${e.message.split('\n')[0]}`);
    }
    const out = {};
    for (const linea of salida.split('\n')) {
        const [rc, fecha, b64] = linea.trim().split(' ');
        if (!rc || !b64) continue;
        const fichero = path.join(dir, `${rc}.gml`);
        fs.writeFileSync(fichero, Buffer.from(b64, 'base64'));
        out[rc] = { fichero, fecha: fecha || null };
    }
    return out;
}

function lecturaAhora(rc) {
    const dir = path.join(TRABAJO, 'ahora');
    const ya = path.join(dir, `${rc}.gml`);
    if (fs.existsSync(ya)) return { fichero: ya, fecha: fs.statSync(ya).mtime.toISOString() };
    const fichero = execFileSync('python', ['-m', 'tools.numeracion_partes', 'bajar', rc, dir],
                                 { cwd: MOTOR_DIR, encoding: 'utf8', timeout: 180000 }).trim();
    return { fichero, fecha: new Date().toISOString() };
}

function leerPartes(ficheros) {
    if (!ficheros.length) return {};
    return JSON.parse(execFileSync('python', ['-m', 'tools.numeracion_partes', 'leer', ...ficheros],
                                   { cwd: MOTOR_DIR, encoding: 'utf8', maxBuffer: 64 << 20 }));
}

function zonasDentro(fichero, zonas) {
    if (!zonas?.length) return {};
    const f = path.join(TRABAJO, `zonas_${process.pid}.json`);
    fs.writeFileSync(f, JSON.stringify(zonas));
    return JSON.parse(execFileSync('python', ['-m', 'tools.numeracion_partes', 'zonas', fichero, f],
                                   { cwd: MOTOR_DIR, encoding: 'utf8' }));
}

// ─── 3. Medir un candidato ──────────────────────────────────────────────────

async function medir(w, ctx, claves) {
    const t = w.t;
    const rc = ctx.expediente?.instalacion?.ref_catastral || ctx.expediente?.ref_catastral || rcDeId(t.cuerpos_fuera[0]);
    const construcciones = await cex.construccionesElegidas(w.id, w.origen).catch(() => null);
    const { semisotano, anexos, volumenes } = cex.declaracionesEdificio(t.ajustes || null);
    const altura = Number(t.ajustes?.altura_libre_planta) > 0 ? Number(t.ajustes.altura_libre_planta) : null;
    const r = await fetch(`${MOTOR}/envolvente`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            referencia_catastral: rc, construcciones,
            ...(semisotano ? { semisotano } : {}), ...(anexos.length ? { anexos } : {}),
            ...(volumenes.length ? { volumenes } : {}), ...(altura ? { altura_planta: altura } : {}),
            cuerpos_excluidos: claves, zonas_fuera: t.zonas_fuera || [],
            recorte_vivienda: t.recorte_vivienda || null, sede_catastro: true,
        }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(`motor ${r.status}: ${d?.detail || ''}`);
    if (!Array.isArray(d.cuerpos_traduccion)) throw new Error(`el motor de ${MOTOR} es el de ANTES (no devuelve cuerpos_traduccion)`);
    const tipo = {};
    for (const e of d.geometria?.elementos || []) tipo[e.id] = e.tipo;
    // Los huecos guardados, en las paredes de CATASTRO (las dibujadas llevan su
    // propio id y no dependen de qué cuerpo se quite). Una pared que con este
    // candidato ya no existe cuenta en el total y no en fachada.
    const dibujadas = new Set((t.paredes?.dibujadas || []).map(d => d?.id));
    let enFachada = 0, total = 0;
    for (const [k, hs] of Object.entries(t.huecos || {})) {
        const n = Array.isArray(hs) ? hs.length : 0;
        if (!n || dibujadas.has(k)) continue;
        total += n;
        if (String(t.tipos?.[k] || tipo[k] || '').startsWith('FACHADA')) enFachada += n;
    }
    const fuera = (d.cuerpos || []).filter(c => c.fuera);
    return {
        fuera: fuera.map(c => ({ clave: c.id, catastro: c.catastro_id, superficie: c.superficie,
                                 uso: c.construccion?.uso || null, habitable: c.habitable,
                                 niveles_fuera: c.niveles_fuera })),
        vivienda: fuera.filter(c => c.habitable === true).map(c => `${c.construccion?.uso || 'VIVIENDA'} ${c.superficie} m²`),
        huecos: { en_fachada: enFachada, total },
        superficie: (d.diagnostico || []).filter(x => /^FLOOR_AREA_MISMATCH/.test(x)).map(x => x.slice(0, 140)),
    };
}

// ─── 4. Elegir ──────────────────────────────────────────────────────────────

function puntos(m, zonasMal) {
    // Lo que más pesa es no quitar la casa; después, zonas dentro de lo quitado;
    // después, cuántos huecos guardados caen en una fachada.
    return -1000 * m.vivienda.length - 100 * zonasMal + m.huecos.en_fachada;
}

async function main() {
    fs.mkdirSync(TRABAJO, { recursive: true });
    const lista = await trabajos();
    console.log(`${lista.length} trabajos con cuerpos guardados por su número de Catastro · motor ${MOTOR}`);
    const rcs = [...new Set(lista.flatMap(w => w.t.cuerpos_fuera.map(rcDeId)).filter(Boolean))].sort();
    const vps = opt('vps') ? lecturasVps(rcs) : {};
    const lecturas = {};
    for (const rc of rcs) {
        lecturas[rc] = {};
        const l = lecturaLocal(rc); if (l) lecturas[rc].local = l;
        if (vps[rc]) lecturas[rc].vps = vps[rc];
        if (opt('ahora')) {
            try { lecturas[rc].ahora = lecturaAhora(rc); }
            catch (e) { console.log(`⚠ ${rc}: no se ha podido leer ahora (${e.message.split('\n')[0]})`); }
        }
    }
    const ficheros = Object.values(lecturas).flatMap(o => Object.values(o).map(x => x.fichero));
    const partes = leerPartes(ficheros);

    const informe = [];
    for (const w of lista) {
        const t = w.t;
        const fila = { numero: w.numero, origen: w.origen, guardado: t.guardado_at, guardado_con: t.cuerpos_fuera,
                       lecturas: {}, candidatos: [], veredicto: null, propuesta: null };
        // Qué cuerpo es cada id guardado en cada lectura.
        const porFuente = {};
        for (const id of t.cuerpos_fuera) {
            const rc = rcDeId(id);
            for (const [fuente, l] of Object.entries(lecturas[rc] || {})) {
                const p = (partes[l.fichero] || []).find(x => x.id === id);
                fila.lecturas[fuente] = l.fecha;
                (porFuente[fuente] ||= []).push(p ? p.clave : `?${id}`);
                (fila.cuerpos ||= {})[id] = { ...(fila.cuerpos?.[id] || {}),
                    [fuente]: p ? `${p.superficie} m² · ${p.plantas_sobre} pl. · ${p.clave}` : 'no está' };
            }
        }
        const distintos = [...new Map(Object.entries(porFuente)
            .map(([f, cl]) => [JSON.stringify([...cl].sort()), { fuentes: [], claves: cl }]))
            .entries()].map(([k, v]) => ({ ...v, k }));
        for (const [f, cl] of Object.entries(porFuente)) {
            distintos.find(d => d.k === JSON.stringify([...cl].sort())).fuentes.push(f);
        }
        if (!distintos.length) {
            fila.veredicto = 'SIN LECTURA';
            informe.push(fila);
            continue;
        }
        let ctx = null;
        try { ctx = await cex.cargarExpediente(w.id, w.origen); } catch { ctx = null; }
        const unFichero = Object.values(lecturas[rcDeId(t.cuerpos_fuera[0])] || {})[0]?.fichero;
        const dentro = unFichero ? zonasDentro(unFichero, t.zonas_fuera) : {};
        for (const d of distintos) {
            if (d.claves.some(c => c.startsWith('?'))) {
                fila.candidatos.push({ fuentes: d.fuentes, claves: d.claves, error: 'algún número no existe en esa lectura' });
                continue;
            }
            try {
                const m = await medir(w, ctx || {}, d.claves);
                // Zonas dibujadas DENTRO de un cuerpo quitado, en una planta donde está fuera.
                let zonasMal = 0;
                (t.zonas_fuera || []).forEach((z, i) => {
                    for (const c of m.fuera) {
                        if ((c.niveles_fuera || []).includes(z.nivel) && (dentro[c.clave]?.[i] || 0) >= 0.5) zonasMal++;
                    }
                });
                fila.candidatos.push({ fuentes: d.fuentes, claves: d.claves, ...m, zonas_dentro: zonasMal,
                                       puntos: puntos(m, zonasMal) });
            } catch (e) {
                fila.candidatos.push({ fuentes: d.fuentes, claves: d.claves, error: e.message });
            }
        }
        // Si lo que dicen las lecturas es SOSPECHOSO (quita vivienda, o hay zonas
        // dentro de lo quitado), se prueban los demás cuerpos de la parcela: la
        // numeración de cuando se guardó es otra permutación de las mismas partes.
        const sospechoso = c => !c.error && (c.vivienda.length || c.zonas_dentro);
        if (fila.candidatos.every(c => c.error || sospechoso(c))) {
            const todas = [...new Map(Object.values(lecturas[rcDeId(t.cuerpos_fuera[0])] || {})
                .flatMap(l => partes[l.fichero] || []).map(p => [p.clave, p])).values()];
            const k = t.cuerpos_fuera.length;
            const vistos = new Set(fila.candidatos.map(c => JSON.stringify([...c.claves].sort())));
            const subconjuntos = [];
            const elegir = (desde, actual) => {
                if (subconjuntos.length >= 12) return;
                if (actual.length === k) { subconjuntos.push([...actual]); return; }
                for (let i = desde; i < todas.length; i++) elegir(i + 1, [...actual, todas[i].clave]);
            };
            elegir(0, []);
            for (const claves of subconjuntos) {
                if (vistos.has(JSON.stringify([...claves].sort()))) continue;
                try {
                    const m = await medir(w, ctx || {}, claves);
                    let zonasMal = 0;
                    (t.zonas_fuera || []).forEach((z, i) => {
                        for (const c of m.fuera) {
                            if ((c.niveles_fuera || []).includes(z.nivel) && (dentro[c.clave]?.[i] || 0) >= 0.5) zonasMal++;
                        }
                    });
                    fila.candidatos.push({ fuentes: ['otra permutación'], claves, ...m, zonas_dentro: zonasMal,
                                           puntos: puntos(m, zonasMal) });
                } catch (e) {
                    fila.candidatos.push({ fuentes: ['otra permutación'], claves, error: e.message });
                }
            }
        }
        const buenos = fila.candidatos.filter(c => !c.error).sort((a, b) => b.puntos - a.puntos);
        // LA PRUEBA QUE MANDA es la lectura que ya estaba en una caché CUANDO SE
        // GUARDÓ (bajada antes de `guardado_at`): con esa numeración se eligió.
        // Quitar una VIVIENDA no descarta nada por sí solo —hay quien la quita a
        // propósito (otra vivienda de la parcela, 26RES060_224)—; solo desempata.
        const deLecturas = fila.candidatos.filter(c => !c.fuentes.includes('otra permutación'));
        const antes = deLecturas.filter(c => c.fuentes.some(f => fila.lecturas[f]
            && fechaDe(fila.lecturas[f]) <= fechaDe(t.guardado_at)));
        const claveDe = c => JSON.stringify([...c.claves].sort());
        const total = buenos[0]?.huecos.total || 0;
        const encaja = c => !c.error && (total === 0 || c.huecos.en_fachada === Math.max(...buenos.map(b => b.huecos.en_fachada)));
        let elegido = null;
        if (antes.length && new Set(antes.map(claveDe)).size === 1 && !antes[0].error) {
            elegido = antes[0];
            fila.por = 'la lectura que había al guardar';
            if (!encaja(elegido)) fila.por += ' (⚠ otro candidato deja más huecos en fachada: mirarlo)';
        } else if (buenos.length) {
            // Sin lectura de entonces: lo que cuadra con el trabajo (huecos, zonas).
            const orden = [...buenos].sort((a, b) => (b.huecos.en_fachada - 50 * b.zonas_dentro - 2 * b.vivienda.length)
                                                   - (a.huecos.en_fachada - 50 * a.zonas_dentro - 2 * a.vivienda.length));
            const [a, b] = orden;
            const margen = b ? (a.huecos.en_fachada - 50 * a.zonas_dentro) - (b.huecos.en_fachada - 50 * b.zonas_dentro) : 99;
            if (margen >= 3 || (!b && !sospechoso(a))) { elegido = a; fila.por = 'lo que cuadra con los huecos y las zonas guardados'; }
        }
        const unanime = new Set(deLecturas.map(claveDe)).size === 1;
        if (!buenos.length && unanime && !deLecturas[0].claves.some(c => c.startsWith('?'))) {
            fila.veredicto = 'ESTABLE (sin medir: el motor no lo mide)';
            fila.propuesta = deLecturas[0].claves;
        } else if (!buenos.length) fila.veredicto = 'NO SE HA PODIDO MEDIR';
        else if (!elegido) fila.veredicto = 'DUDOSO: lo decide una persona';
        else if (unanime) fila.veredicto = 'ESTABLE';
        else fila.veredicto = deLecturas.includes(elegido) ? 'EL NÚMERO CAMBIA ENTRE LECTURAS' : 'EL NÚMERO HA CAMBIADO';
        if (elegido) fila.propuesta = elegido.claves;
        // Qué quita HOY cada lectura: lo que haría la app (VPS) y el script (local).
        fila.hoy_quita_lo_que_toca = Object.fromEntries(deLecturas.flatMap(c => c.fuentes
            .map(f => [f, !c.error && fila.propuesta && JSON.stringify([...c.claves].sort()) === JSON.stringify([...fila.propuesta].sort())])));
        informe.push(fila);
        console.log(`\n${w.numero} (${w.origen}) · guardado ${String(t.guardado_at).slice(0, 10)} · ${fila.veredicto}`);
        for (const [id, f] of Object.entries(fila.cuerpos || {})) {
            console.log(`  ${id.replace(/^ES\.SDGC\.BU\./, '')}`);
            for (const [fuente, txt] of Object.entries(f)) console.log(`     ${fuente.padEnd(5)} ${String(fila.lecturas[fuente] || '').slice(0, 16)}  ${txt}`);
        }
        for (const c of fila.candidatos) {
            console.log(`  → quitando lo de [${c.fuentes.join(', ')}]: ` + (c.error ? `ERROR ${c.error}` :
                `${c.fuera.map(x => `${x.uso || 'sin uso'} ${x.superficie} m²`).join(' + ') || 'nada'}`
                + ` · huecos en fachada ${c.huecos.en_fachada}/${c.huecos.total}`
                + (c.vivienda.length ? ` · ⚠ quita VIVIENDA` : '') + (c.zonas_dentro ? ` · ⚠ ${c.zonas_dentro} zona(s) dentro` : '')
                + (c.superficie.length ? ` · ${c.superficie[0]}` : '')));
        }
        if (fila.propuesta) console.log(`  PROPUESTA (${fila.por || 'todas las lecturas coinciden'}) cuerpos_fuera = ${JSON.stringify(fila.propuesta)}`);
    }

    const salida = typeof opt('salida') === 'string' ? opt('salida') : path.join(TRABAJO, 'informe.json');
    fs.writeFileSync(salida, JSON.stringify(informe, null, 1));
    const cuenta = informe.reduce((a, f) => ({ ...a, [f.veredicto]: (a[f.veredicto] || 0) + 1 }), {});
    console.log(`\nResumen: ${JSON.stringify(cuenta)}\nInforme: ${salida}`);

    if (!ESCRIBIR) { console.log('En seco: no se ha escrito nada.'); return; }
    for (const f of informe.filter(x => x.propuesta)) {
        const w = lista.find(x => x.numero === f.numero && x.origen === f.origen);
        const ahora = await cex.leerTrabajo(w.id, w.origen);
        if (JSON.stringify(ahora?.cuerpos_fuera) !== JSON.stringify(w.t.cuerpos_fuera)) {
            console.log(`✗ ${f.numero}: el trabajo ha cambiado desde que se leyó; no se toca`);
            continue;
        }
        try {
            await cex.guardarTrabajo(w.id, { ...ahora, cuerpos_fuera: f.propuesta }, w.origen);
            console.log(`✓ ${f.numero}: cuerpos_fuera = ${JSON.stringify(f.propuesta)}`);
        } catch (e) {
            // Una oportunidad ya ACEPTADA no se escribe (409): su trabajo vive en el expediente.
            console.log(`✗ ${f.numero}: ${e.message}`);
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
