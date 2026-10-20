// ============================================================================
// estimar.mjs — cuánto va a costar el banco ANTES de gastar nada.
//
// No hay forma de saber cuántas vueltas dará el agente sin correrlo, así que se
// parte de lo MEDIDO: las sesiones de Claude Code en las que se usó la skill
// `generar-cee-inicial` ya madura (desde el 13/10/2026), llamada a llamada. A
// cada llamada se le quita lo que en Claude Code va siempre delante y aquí no
// (herramientas de Claude Code, CLAUDE.md, memoria, la conversación anterior) y
// se le pone lo que lleva el agente del banco (su `system` y sus herramientas,
// contados con `count_tokens`, que es gratis, o estimados si no hay llave).
// Lo nuevo de cada llamada (resultados, fotos, lo que escribe el modelo) se
// queda igual. Con `--recortar` se simula además la limpieza de contexto.
// ============================================================================
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { DEFINICIONES } from './herramientas.mjs';
import { sistema, primerMensaje, PRECIOS, MODELOS } from './agente.mjs';

const TRANSCRIPTS = path.join(os.homedir(), '.claude', 'projects', 'C--Proyectos-app-brokergy');

function leer(f) {
    return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** Las llamadas (una por mensaje del modelo) desde que se lanzó la skill. */
export function sesionesMedidas({ desde = '2026-10-13', skill = 'generar-cee-inicial' } = {}) {
    const out = [];
    for (const f of fs.readdirSync(TRANSCRIPTS).filter(n => n.endsWith('.jsonl'))) {
        const ls = leer(path.join(TRANSCRIPTS, f));
        const i0 = ls.findIndex(o => Array.isArray(o.message?.content) && o.message.content
            .some(b => b.type === 'tool_use' && b.name === 'Skill' && String(b.input?.skill || '').endsWith(skill)));
        if (i0 < 0 || String(ls[i0].timestamp || '') < desde) continue;
        const porId = new Map();
        for (const o of ls.slice(i0)) {
            if (o.type !== 'assistant' || !o.message?.usage) continue;
            porId.set(o.message.id || o.uuid, o.message.usage);
        }
        const llamadas = [...porId.values()].map(u => ({
            in: u.input_tokens || 0, cw: u.cache_creation_input_tokens || 0,
            cr: u.cache_read_input_tokens || 0, out: u.output_tokens || 0,
        }));
        if (llamadas.length >= 10) out.push({ sesion: f.slice(0, 8), fecha: String(ls[i0].timestamp).slice(0, 10), llamadas });
    }
    return out;
}

/** Lo que costaría UNA sesión medida si la hiciera el agente del banco. */
export function simular(llamadas, { base, precio, recortar = false, T = 110_000, M = 40_000 }) {
    // Lo escrito en caché en cada llamada medida (`cw`) es lo nuevo desde la
    // anterior: la respuesta anterior del modelo y los resultados de las
    // herramientas. Por eso la salida no se suma aparte al contexto.
    let cur = base, r = 0, w = base, o = 0, primera = true;
    for (const c of llamadas) {
        const nuevo = c.cw + c.in;
        o += c.out;
        if (primera) { primera = false; continue; }
        if (recortar && cur + nuevo > T) {
            cur = Math.max(base, cur - Math.max(M, cur + nuevo - T));
            w += cur; // la caché del historial se rehace tras limpiar
        } else r += cur;
        w += nuevo;
        cur += nuevo;
    }
    const usd = (w * precio.cw + r * precio.cr + o * precio.out) / 1e6;
    return { usd, lect: r, escr: w, sal: o };
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };

async function tokensBase(modelo) {
    const cuerpo = {
        model: modelo, system: [{ type: 'text', text: sistema() }],
        tools: DEFINICIONES.map(({ eager_input_streaming, ...d }) => d),
        messages: [{ role: 'user', content: primerMensaje({ clave: '26RES060_199', dir: 'C:\\x', hoy: '2026-10-19' }) }],
    };
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const r = await new Anthropic().messages.countTokens(cuerpo);
            return { tokens: r.input_tokens, de: 'count_tokens' };
        } catch (e) { /* cae a la estimación */ }
    }
    const chars = JSON.stringify(cuerpo.system).length + JSON.stringify(cuerpo.tools).length + 300;
    return { tokens: Math.round(chars / 3.1), de: 'estimado (≈3,1 caracteres por token; sin llave no se cuenta)' };
}

export async function estimar({ n = 10, recortar = false } = {}) {
    const ses = sesionesMedidas();
    const filas = [];
    for (const [corto, modelo] of Object.entries(MODELOS)) {
        const b = await tokensBase(modelo);
        const precio = PRECIOS[modelo];
        const sin = ses.map(s => simular(s.llamadas, { base: b.tokens, precio }).usd);
        const con = ses.map(s => simular(s.llamadas, { base: b.tokens, precio, recortar: true }).usd);
        filas.push({ corto, modelo, base: b, sin, con });
    }
    return { sesiones: ses.length, llamadasMediana: q(ses.map(s => s.llamadas.length), 0.5), filas, n, q };
}

export function imprimirEstimacion(e) {
    const f = v => `${v.toFixed(2)} $`;
    console.log(`\nPerfil: ${e.sesiones} sesiones reales de generar-cee-inicial (desde el 13/10/2026), mediana ${e.llamadasMediana} llamadas.\n`);
    let totMed = 0, totP75 = 0, totMedR = 0, totP75R = 0;
    for (const r of e.filas) {
        console.log(`${r.modelo}: prefijo fijo ${r.base.tokens.toLocaleString('es')} tokens (${r.base.de})`);
        console.log(`  por CEE, sin recortar:  p25 ${f(e.q(r.sin, 0.25))} · mediana ${f(e.q(r.sin, 0.5))} · p75 ${f(e.q(r.sin, 0.75))} · máx ${f(Math.max(...r.sin))}`);
        console.log(`  por CEE, con --recortar: p25 ${f(e.q(r.con, 0.25))} · mediana ${f(e.q(r.con, 0.5))} · p75 ${f(e.q(r.con, 0.75))} · máx ${f(Math.max(...r.con))}`);
        totMed += e.q(r.sin, 0.5) * e.n; totP75 += e.q(r.sin, 0.75) * e.n;
        totMedR += e.q(r.con, 0.5) * e.n; totP75R += e.q(r.con, 0.75) * e.n;
    }
    console.log(`\n${e.n} expedientes × ${e.filas.length} modelos:`);
    console.log(`  sin recortar: ${f(totMed)} (mediana) · ${f(totP75)} (p75)`);
    console.log(`  con recortar: ${f(totMedR)} (mediana) · ${f(totP75R)} (p75)`);
}
