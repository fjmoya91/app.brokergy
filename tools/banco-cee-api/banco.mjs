#!/usr/bin/env node
// ============================================================================
// banco.mjs — banco de pruebas EN SECO de la skill generar-cee-inicial por la API.
//
//   node banco.mjs estimar   [--n 10]                      ← no gasta nada
//   node banco.mjs correr    --modelo opus (defecto)|sonnet|ambos [--exp 26RES060_199,…] [--prueba]
//                            [--tope-run 8] [--tope-total 130] [--recortar] [--esfuerzo high (defecto)]
//   node banco.mjs comparar  <carpeta de la tanda>
//   node banco.mjs generar   <clave> [--modelo opus] [--esfuerzo high] [--tope 10]
//            PRODUCCIÓN: marca al AGENTE IA (agente_ia.js empezar) y el agente hace el CEE
//            inicial DE VERDAD: aplicar --escribir sube .cex/XML/PDF y avisa al equipo.
//            Deja su rastro en implementation/backend/scratch/banco-cee-api/real/.
//   node banco.mjs atender   [--una] [--cada 20]
//            La COLA de la app (botón CE3X → «Generar con IA», tabla cee_ia_trabajos):
//            late en cee_ia_vigilantes, toma el trabajo más antiguo, hace `generar`
//            escribiendo su progreso y deja el resultado. atender.cmd lo deja corriendo.
//
// La llave: ANTHROPIC_API_KEY en el entorno o en tools/banco-cee-api/.env (fuera
// de git). Lo que deja cada pasada: implementation/backend/scratch/banco-cee-api/
// <tanda>/<expediente>/<modelo>/ — transcript.jsonl, resumen.json, comparacion.json,
// seco.log (lo que se intentó escribir y se cortó) y la caché del script en tmp/.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACK } from './herramientas.mjs';
import { correrAgente, MODELOS } from './agente.mjs';
import { compararPasada, lineaComparacion } from './comparar.mjs';
import { estimar, imprimirEstimacion } from './estimar.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [, , ORDEN, ...RESTO] = process.argv;
const opt = (n, def = null) => {
    const i = RESTO.indexOf(`--${n}`);
    if (i < 0) return def;
    const v = RESTO[i + 1];
    return v && !v.startsWith('--') ? v : true;
};

// La llave del .env del banco (si no está ya en el entorno).
const envBanco = path.join(AQUI, '.env');
if (!process.env.ANTHROPIC_API_KEY && fs.existsSync(envBanco)) {
    for (const l of fs.readFileSync(envBanco, 'utf8').split(/\r?\n/)) {
        const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m) process.env[m[1]] ||= m[2].replace(/^["']|["']$/g, '');
    }
}

const EXPEDIENTES = JSON.parse(fs.readFileSync(path.join(AQUI, 'expedientes.json'), 'utf8'));
const hoy = new Date().toISOString().slice(0, 10);

async function motorVivo() {
    const url = process.env.CEE_ENGINE_URL || 'http://127.0.0.1:8090';
    try { await (await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })).json(); return true; }
    catch { return false; }
}

async function correr() {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('Falta ANTHROPIC_API_KEY (en el entorno o en tools/banco-cee-api/.env).');
    }
    if (!(await motorVivo())) throw new Error('El motor cee-engine no responde: levántalo antes (preview «cee-engine»).');
    const quien = opt('modelo', 'opus');
    const modelos = quien === 'ambos' ? ['opus', 'sonnet'] : [quien];
    for (const m of modelos) if (!MODELOS[m]) throw new Error(`Modelo desconocido: ${m}`);
    let exps = opt('exp') && opt('exp') !== true ? String(opt('exp')).split(',') : EXPEDIENTES.map(e => e.clave);
    if (RESTO.includes('--prueba')) exps = exps.slice(0, 1);
    const topeRun = Number(opt('tope-run', 8));
    const topeTotal = Number(opt('tope-total', 130));
    const recortar = RESTO.includes('--recortar');
    const esfuerzo = opt('esfuerzo', 'high');

    const tanda = path.join(BACK, 'scratch', 'banco-cee-api', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
    fs.mkdirSync(tanda, { recursive: true });
    fs.writeFileSync(path.join(tanda, 'tanda.json'), JSON.stringify({ exps, modelos, topeRun, topeTotal, recortar, esfuerzo, hoy }, null, 2));
    console.log(`Tanda: ${tanda}\n${exps.length} expedientes × ${modelos.join(' + ')} · tope ${topeRun} $/pasada, ${topeTotal} $ en total${recortar ? ' · con recorte de contexto' : ''}\n`);

    let total = 0;
    const filas = [];
    fuera:
    for (const clave of exps) {
        for (const m of modelos) {
            if (total >= topeTotal) { console.log(`\n⛔ Tope total de ${topeTotal} $ alcanzado: paro.`); break fuera; }
            const dir = path.join(tanda, clave, m);
            const tmp = path.join(dir, 'tmp');
            fs.mkdirSync(tmp, { recursive: true });
            const registro = o => fs.appendFileSync(path.join(dir, 'ordenes.jsonl'), JSON.stringify(o) + '\n');
            process.stdout.write(`▶ ${clave} · ${m} … `);
            const r = await correrAgente({
                modelo: MODELOS[m], ctx: { clave, dir, tmp, registro },
                esfuerzo, topeUsd: Math.min(topeRun, topeTotal - total), recortar, hoy,
                alGastar: (c, g) => process.stdout.write(`\r▶ ${clave} · ${m} … ${g.toFixed(2)} $   `),
            });
            total += r.coste;
            fs.writeFileSync(path.join(dir, 'resumen.json'), JSON.stringify(r, null, 2));
            let comp = null;
            try { comp = await compararPasada(dir, clave); } catch (e) { comp = { clave, motivo: e.message }; }
            fs.writeFileSync(path.join(dir, 'comparacion.json'), JSON.stringify(comp, null, 2));
            const seco = fs.existsSync(path.join(dir, 'seco.log')) ? fs.readFileSync(path.join(dir, 'seco.log'), 'utf8').trim().split('\n').length : 0;
            console.log(`\r✓ ${clave} · ${m}: ${r.estado} · ${r.coste.toFixed(2)} $ · ${r.vueltas} vueltas · ${Math.round(r.ms / 60000)} min`
                + `${seco ? ` · ${seco} escrituras cortadas` : ''}\n    ${lineaComparacion(comp)}`);
            filas.push({ clave, modelo: m, estado: r.estado, coste: r.coste, vueltas: r.vueltas, min: r.ms / 60000, usage: r.usage, comp });
            fs.writeFileSync(path.join(tanda, 'resultados.json'), JSON.stringify({ total, filas }, null, 2));
        }
    }
    console.log(`\nGastado en la tanda: ${total.toFixed(2)} $ · ${tanda}`);
}

/**
 * UNA pasada de PRODUCCIÓN sobre un CEE inicial: marca al AGENTE IA
 * (`agente_ia.js empezar`), corre el agente con `ctx.real` y deja el rastro en
 * scratch/banco-cee-api/real/<stamp>_<clave>/. La usan `generar` (a mano) y
 * `atender` (la cola de la app).
 *
 * `alProgreso({ vueltas, coste_usd, ultima })` se llama en cada vuelta y en cada
 * orden; `debeParar()` se pregunta antes de cada llamada a la API.
 * @returns {{ r, dir, escribio: boolean }}  `escribio`: lanzó un `aplicar --escribir` que acabó bien.
 */
async function generarReal({ clave, modelo = 'opus', esfuerzo = 'high', tope = 10, alProgreso = () => {}, debeParar = null }) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY (en tools/banco-cee-api/.env).');
    if (!(await motorVivo())) throw new Error('El motor cee-engine no responde: levántalo antes.');
    if (!MODELOS[modelo]) throw new Error(`Modelo desconocido: ${modelo}`);
    const dir = path.join(BACK, 'scratch', 'banco-cee-api', 'real',
        `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${clave}`);
    const tmp = path.join(dir, 'tmp');
    fs.mkdirSync(tmp, { recursive: true });

    // El paso 0 de la skill lo da el arnés, no el agente: el AGENTE IA a la barra.
    const { execFileSync } = await import('node:child_process');
    const empezar = execFileSync('node', ['scripts/agente_ia.js', 'empezar', clave], { cwd: BACK, encoding: 'utf8' });
    fs.writeFileSync(path.join(dir, 'empezar.txt'), empezar);
    console.log(empezar.split('\n').filter(l => /✓|⚠|AGENTE|certificador/i.test(l)).join('\n'));

    const prog = { vueltas: 0, coste_usd: 0, ultima: null, ordenes: 0 };
    let escribio = false;
    const registro = o => {
        fs.appendFileSync(path.join(dir, 'ordenes.jsonl'), JSON.stringify(o) + '\n');
        if (o?.tipo === 'orden' && Array.isArray(o.orden)) {
            prog.ordenes++;
            prog.ultima = o.orden[0] || null;
            if (o.orden[0] === 'aplicar' && o.orden.includes('--escribir') && o.codigo === 0) escribio = true;
            alProgreso({ ...prog });
        }
    };
    const r = await correrAgente({
        modelo: MODELOS[modelo], ctx: { clave, dir, tmp, registro, real: true },
        esfuerzo, topeUsd: Number(tope), hoy, debeParar,
        alGastar: (c, g) => { prog.vueltas++; prog.coste_usd = Math.round(g * 100) / 100; alProgreso({ ...prog }); },
    });
    fs.writeFileSync(path.join(dir, 'resumen.json'), JSON.stringify(r, null, 2));
    return { r, dir, escribio };
}

async function generar() {
    const clave = RESTO.find(a => !a.startsWith('--'));
    if (!clave) throw new Error('Dime la clave: node banco.mjs generar 26RES060_190');
    const m = opt('modelo', 'opus');
    process.stdout.write(`▶ ${clave} · ${m} · producción … `);
    const { r, dir, escribio } = await generarReal({
        clave, modelo: m, esfuerzo: opt('esfuerzo', 'high'), tope: Number(opt('tope', 10)),
        alProgreso: p => process.stdout.write(`\r▶ ${clave} · ${m} · producción … ${p.coste_usd.toFixed(2)} $   `),
    });
    console.log(`\n✓ ${clave}: ${r.estado} · ${r.coste.toFixed(2)} $ · ${r.vueltas} vueltas · ${Math.round(r.ms / 60000)} min`
        + ` · ${escribio ? 'ESCRITO en Drive y en la app' : 'NO ha llegado a escribir'}\n${dir}`);
}

// ─── atender: la COLA de la app (botón CE3X → «Generar con IA») ──────────────
//
//   node banco.mjs atender [--una] [--cada 20]
//
// Late cada 30 s en `cee_ia_vigilantes` (la app dice si hay un PC atendiendo),
// toma el trabajo EN_COLA más antiguo con un UPDATE condicionado, corre
// `generarReal` escribiendo su progreso y deja el resultado. Uno a uno: el
// motor y CE3X no se comparten bien entre dos agentes a la vez.

async function atender() {
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(BACK, 'package.json'));
    const supabase = req('./services/supabaseClient');
    const ceeIa = req('./services/ceeIa');
    let cexAPdf = null;
    try { cexAPdf = req('./services/cee/cexAPdf'); } catch { /* sin CE3X: se dice en el latido */ }
    const os = await import('node:os');
    const equipo = os.hostname();
    const una = RESTO.includes('--una');
    const cada = Math.max(5, Number(opt('cada', 20))) * 1000;
    const dormir = ms => new Promise(r => setTimeout(r, ms));

    let ocupado = null;   // clave del trabajo en curso, para el latido
    const listoAhora = async () => {
        if (!process.env.ANTHROPIC_API_KEY) return { listo: false, motivo: 'Falta la llave de la API en el PC.' };
        if (!(await motorVivo())) return { listo: false, motivo: 'El motor cee-engine del PC no responde.' };
        const d = cexAPdf?.disponible?.();
        if (d && !d.ok) return { listo: false, motivo: `CE3X 3.2 no está disponible en el PC (${d.error}).` };
        return { listo: true, motivo: ocupado ? `Generando ${ocupado}` : null };
    };
    const latir = async () => {
        const l = await listoAhora().catch(e => ({ listo: false, motivo: e.message }));
        await supabase.from('cee_ia_vigilantes')
            .upsert({ equipo, visto_at: new Date().toISOString(), listo: l.listo, motivo: l.motivo || null });
        return l;
    };
    const latido = setInterval(() => { latir().catch(() => {}); }, 30_000);

    // El CEE A CIEGAS de las oportunidades (apagado salvo CEE_CIEGO_ENABLED=true).
    // Una por vuelta y en serie (Catastro, regla 15-17); lo que falla no se
    // reintenta con los MISMOS datos en esta sesión del vigilante.
    const ceeCiego = process.env.CEE_CIEGO_ENABLED === 'true' ? req('./services/cee/ceeCiego') : null;
    const ciegasFallidas = new Set();
    const unaCiega = async () => {
        if (!ceeCiego) return false;
        let lista;
        try { lista = await ceeCiego.pendientes(); } catch (e) { console.log(`· a ciegas: ${e.message}`); return false; }
        const o = lista.find(x => !ciegasFallidas.has(x.id));
        if (!o) return false;
        ocupado = `${o.id_oportunidad} (a ciegas)`;
        try {
            const r = await ceeCiego.calcularCiega(o.id, { escribir: true });
            const e = r.estimacion;
            console.log(`◌ ${o.id_oportunidad} a ciegas: ${r.omitido || `${e.demanda_ciega} kWh/m²·año × ${e.superficie} m² · bono ${e.bono} € (calculadora ${e.bono_calculadora} €)`}`);
        } catch (e) {
            ciegasFallidas.add(o.id);
            console.log(`◌ ${o.id_oportunidad} a ciegas: ✗ ${e.message}`);
        } finally {
            ocupado = null;
        }
        await dormir(4000);
        return true;
    };

    // Lo que este mismo PC dejó a medias (se apagó o se cerró la ventana) no se
    // retoma solo: se marca, y la app deja pedirlo otra vez.
    await supabase.from('cee_ia_trabajos').update({
        estado: 'ERROR', terminado_at: new Date().toISOString(),
        error: 'El vigilante del PC se reinició con este trabajo a medias.',
    }).eq('estado', 'EN_CURSO').eq('equipo', equipo);

    console.log(`Atendiendo la cola de CEE con IA en ${equipo}${una ? ' (uno y salgo)' : ''} · Ctrl+C para parar.`);
    try {
        for (;;) {
            const l = await latir();
            if (!l.listo) { console.log(`· no listo: ${l.motivo}`); if (una) return; await dormir(cada); continue; }

            const { data: cola, error: eCola } = await supabase.from('cee_ia_trabajos').select(ceeIa.COLUMNAS)
                .eq('estado', 'EN_COLA').order('pedido_at', { ascending: true }).limit(1);
            // Sin BD no se afirma «cola vacía»: se dice y se reintenta.
            if (eCola) { console.log(`· no puedo leer la cola: ${eCola.message}`); if (una) return; await dormir(cada); continue; }
            const siguiente = cola?.[0];
            // Sin trabajos de IA, el PC adelanta UNA cifra a ciegas de la captación viva
            // (cero tokens; docs/conocimiento/calculo/cee-a-ciegas-diseno-para-la-oportunidad.md).
            if (!siguiente && !una && await unaCiega()) continue;
            if (!siguiente) { if (una) { console.log('La cola está vacía.'); return; } await dormir(cada); continue; }

            const ahora = new Date().toISOString();
            const { data: tomado } = await supabase.from('cee_ia_trabajos')
                .update({ estado: 'EN_CURSO', tomado_at: ahora, latido_at: ahora, equipo })
                .eq('id', siguiente.id).eq('estado', 'EN_COLA').select(ceeIa.COLUMNAS);
            const t = tomado?.[0];
            if (!t) continue;   // se lo llevó otro PC, o lo cancelaron
            ocupado = t.clave;
            console.log(`\n▶ ${t.clave} · pedido por ${t.pedido_por || '—'} · ${t.modelo} ${t.esfuerzo} · tope ${t.tope_usd} $`);

            const escribirProgreso = async (p) => {
                await supabase.from('cee_ia_trabajos')
                    .update({ progreso: p, latido_at: new Date().toISOString() }).eq('id', t.id);
                process.stdout.write(`\r  ${p.vueltas} vueltas · ${Number(p.coste_usd || 0).toFixed(2)} $ · ${p.ultima || '…'}        `);
            };
            const debeParar = async () => {
                const { data } = await supabase.from('cee_ia_trabajos').select('cancelar').eq('id', t.id).maybeSingle();
                return data?.cancelar === true;
            };

            let fin;
            try {
                const { r, dir, escribio } = await generarReal({
                    clave: t.clave, modelo: t.modelo, esfuerzo: t.esfuerzo, tope: Number(t.tope_usd),
                    alProgreso: p => { escribirProgreso(p).catch(() => {}); }, debeParar,
                });
                // Lo que de verdad quedó: el SELLO del .cex inicial (¿es de la IA y lleva PDF?).
                const f = await ceeIa.filaDe(t.negocio, t.ref_id).catch(() => null);
                const ia = f ? ceeIa.generadoPorIa(f.sello, f.ag) : { hecho: false };
                const nuevo = ia.hecho && ia.at && new Date(ia.at) >= new Date(t.tomado_at);
                const estado = r.estado === 'cancelado' ? 'CANCELADO'
                    : (escribio && nuevo && ia.pdf && r.estado === 'hecho') ? 'HECHO'
                    : (escribio || r.estado === 'parcial') ? 'PARCIAL' : 'ERROR';
                fin = {
                    estado,
                    resultado: {
                        estado: r.estado, informe: String(r.informe || '').slice(0, 4000),
                        preguntas: (r.preguntas || []).slice(0, 20).map(p => String(p).slice(0, 600)),
                        coste_usd: Math.round(r.coste * 100) / 100, vueltas: r.vueltas,
                        minutos: Math.round(r.ms / 6000) / 10, escribio, pdf: !!(nuevo && ia.pdf),
                        rastro: path.relative(BACK, dir),
                    },
                    error: estado === 'ERROR' ? String(r.informe || 'El agente no ha terminado.').slice(0, 1000) : null,
                };
            } catch (e) {
                fin = { estado: 'ERROR', error: String(e.message || e).slice(0, 1000) };
            }
            await supabase.from('cee_ia_trabajos')
                .update({ ...fin, terminado_at: new Date().toISOString(), latido_at: new Date().toISOString() })
                .eq('id', t.id);
            ocupado = null;
            console.log(`\n✓ ${t.clave}: ${fin.estado}${fin.resultado ? ` · ${fin.resultado.coste_usd} $` : ''}${fin.error ? ` · ${fin.error}` : ''}`);
            if (una) return;
        }
    } finally {
        clearInterval(latido);
    }
}

async function comparar() {
    const tanda = RESTO.find(a => !a.startsWith('--'));
    if (!tanda) throw new Error('Dime la carpeta de la tanda.');
    for (const clave of fs.readdirSync(tanda).filter(d => fs.statSync(path.join(tanda, d)).isDirectory())) {
        for (const m of fs.readdirSync(path.join(tanda, clave))) {
            const c = await compararPasada(path.join(tanda, clave, m), clave);
            console.log(`${clave} · ${m}: ${lineaComparacion(c)}`);
        }
    }
}

try {
    if (ORDEN === 'estimar') imprimirEstimacion(await estimar({ n: Number(opt('n', EXPEDIENTES.length)) }));
    else if (ORDEN === 'correr') await correr();
    else if (ORDEN === 'comparar') await comparar();
    else if (ORDEN === 'generar') await generar();
    else if (ORDEN === 'atender') await atender();
    else console.log('Órdenes: estimar · correr · comparar · generar · atender (ver la cabecera de banco.mjs).');
    process.exit(0);
} catch (e) {
    console.error(`\n✗ ${e.message}`);
    process.exit(1);
}
