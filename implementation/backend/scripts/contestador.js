// El CONTESTADOR de WhatsApp (services/contestadorWhatsapp.js), visto desde un PC o
// desde el asistente.
//
//   node scripts/contestador.js seco [--tel 6xxxxxxxx,7xxxxxxxx] [--de fichero.json] [--max 8]
//                                    [--cerebro claude|gemini] [--api https://app.brokergy.es]
//       EN SECO: para cada chat, lee la conversación en el WhatsApp del VPS (rutas de SOLO
//       LECTURA, de una en una y con pausa), mira la BD SIN escribir (candado, dossier en
//       soloLectura) y dice qué contestaría y por qué, con el mensaje que le llegaría a
//       Fran al grupo. Redacta con el Claude Code de este PC (la suscripción) o con Gemini.
//       Sin --tel ni --de: los chats que han contestado a una espera estas 72 h.
//       `--de` es un JSON { "<tel9>": { "ultimo_es_suyo": true, … } } (el de un triaje).
//       Deja el informe en backend/scratch/contestador/ (fuera de git: conversaciones reales).
//   node scripts/contestador.js estado [--api …]
//       Los últimos turnos en el servidor (GET /api/whatsapp/contestador).
//   node scripts/contestador.js resumen [--api …]
//       Su línea del repaso de las 9:00, tal y como saldría hoy.
//   node scripts/contestador.js enviar C12 --si "<respuesta literal de Fran>" [--api …]
//       «manda C12»: envía tal cual lo que el contestador habría dicho (modo copia). Solo con
//       el «manda C12» de Fran, que va LITERAL en --si. El servidor comprueba que el chat no
//       ha cambiado desde entonces.
const path = require('path');
const fs = require('fs');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });

const args = process.argv.slice(2);
const orden = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const API = String(opt('api', process.env.BROKERGY_API_URL || process.env.RONDA_API_URL || 'https://app.brokergy.es')).replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY;
const DIR = path.join(__dirname, '..', 'scratch', 'contestador');
const PAUSA_MS = 2000;   // entre lecturas: es la sesión de PRODUCCIÓN
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(ruta, { method = 'GET', body, binario = false, plazo = 150_000 } = {}) {
    if (!KEY) throw new Error('Falta INTERNAL_API_KEY en el .env del backend.');
    const r = await fetch(`${API}/api/whatsapp${ruta}`, {
        method, signal: AbortSignal.timeout(plazo),
        headers: { 'x-internal-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (binario && r.ok) {
        return {
            buffer: Buffer.from(await r.arrayBuffer()),
            mimetype: String(r.headers.get('content-type') || '').split(';')[0].trim(),
            nombre: decodeURIComponent(r.headers.get('x-nombre-archivo') || 'adjunto'),
        };
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return j;
}

// La conversación y los adjuntos, del WhatsApp del VPS (aquí no hay sesión).
const fuenteVps = {
    leer: (q) => api('/conversacion', { method: 'POST', body: q }),
    descargarAdjunto: (id) => api(`/conversacion/adjunto?msg=${encodeURIComponent(id)}`, { binario: true }),
    transcribir: (id) => api('/conversacion/transcribir', { method: 'POST', body: { msg: id } }),
};

// ── Candado: en seco este proceso no escribe en la BD ────────────────────────
function candado() {
    const supabase = require('../services/supabaseClient');
    const bloqueadas = [];
    const falso = (motivo) => {
        const res = { data: null, error: { message: `EN SECO: ${motivo}` } };
        const p = new Proxy(function () {}, {
            get(_, prop) {
                if (prop === 'then') return (ok, ko) => Promise.resolve(res).then(ok, ko);
                if (prop === 'catch') return (ko) => Promise.resolve(res).catch(ko);
                if (prop === 'finally') return (f) => Promise.resolve(res).finally(f);
                return () => p;
            },
            apply() { return p; },
        });
        return p;
    };
    const fromOriginal = supabase.from.bind(supabase);
    supabase.from = (tabla) => {
        const qb = fromOriginal(tabla);
        for (const op of ['insert', 'update', 'upsert', 'delete']) qb[op] = () => { bloqueadas.push(`${op} ${tabla}`); return falso(op); };
        return qb;
    };
    supabase.rpc = (nombre) => { bloqueadas.push(`rpc ${nombre}`); return falso(nombre); };
    return bloqueadas;
}

async function candidatos() {
    const tels = opt('tel', '');
    if (tels) return tels.split(',').map(t => t.replace(/\D/g, '').slice(-9)).filter(t => t.length === 9);
    const de = opt('de', '');
    if (de) {
        const j = JSON.parse(fs.readFileSync(de, 'utf8'));
        return Object.entries(j).filter(([, v]) => v && v.ultimo_es_suyo).map(([t]) => t);
    }
    const supabase = require('../services/supabaseClient');
    const { data, error } = await supabase.from('wa_esperas').select('tel9')
        .eq('estado', 'CONTESTADA').gte('cerrado_at', new Date(Date.now() - 72 * 3_600_000).toISOString()).limit(50);
    if (error) throw new Error(`wa_esperas: ${error.message}`);
    return [...new Set((data || []).map(r => r.tel9))];
}

async function seco() {
    const bloqueadas = candado();
    if (opt('cerebro', 'claude') === 'gemini') process.env.CONTESTADOR_CEREBRO = 'gemini';
    else { process.env.CONTESTADOR_CEREBRO = 'claude'; process.env.CONTESTADOR_CLAUDE_LOCAL = 'true'; delete process.env.ASISTENTE_URL; }
    // --horas 720: redactar también lo que lleva días sin contestar (en vivo, pasadas 48 h va a Fran).
    if (opt('horas', '')) process.env.CONTESTADOR_MAX_HORAS = opt('horas', '');
    const C = require('../services/contestadorWhatsapp');
    const max = Number(opt('max', 8));
    const tels = (await candidatos()).slice(0, max);
    if (!tels.length) { console.log('No hay chats que probar (usa --tel o --de).'); return; }
    console.log(`EN SECO · ${tels.length} chat(s) · cerebro ${process.env.CONTESTADOR_CEREBRO} · leyendo de ${API}\n`);
    const out = [];
    let n = 0;
    for (const tel of tels) {
        n += 1;
        const t0 = Date.now();
        let d;
        try { d = await C.decidir({ telefono: tel, fuente: fuenteVps }); }
        catch (e) { d = { estado: 'FALLO', motivo: e.message, tel9: tel }; }
        d.segundos = Math.round((Date.now() - t0) / 1000);
        out.push(d);
        console.log(`──── ${n}. ${tel} · ${d.estado}${d.accion ? ` · ${d.accion}` : ''}${d.obra ? ` · ${d.obra}` : ''} · ${d.segundos} s${d.cerebro ? ` · ${d.cerebro}` : ''}`);
        if (d.estado === 'DECIDIDO' && d.accion !== 'CALLAR') console.log(C.textoParaFran({ id: `S${n}` }, d, { m: 'copia' }));
        else console.log(`   ${d.motivo || ''}${d.pendientes?.length ? `\n   escribió: ${d.pendientes.join(' | ').slice(0, 300)}` : ''}`);
        if (d.detalle?.problemas_enlaces?.length) console.log(`   ⚠ enlaces: ${d.detalle.problemas_enlaces.join('; ')}`);
        console.log('');
        await sleep(PAUSA_MS);
    }
    fs.mkdirSync(DIR, { recursive: true });
    const fichero = path.join(DIR, `seco_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(fichero, JSON.stringify(out, null, 2));
    const cuenta = (p) => out.filter(p).length;
    console.log(`Resumen: ${cuenta(d => d.accion === 'RESPONDER')} contestaría · ${cuenta(d => d.accion === 'ESCALAR')} para Fran · `
        + `${cuenta(d => d.accion === 'CALLAR')} callaría · ${cuenta(d => d.estado === 'DESCARTADA')} descartados · ${cuenta(d => d.estado === 'FALLO')} fallos.`);
    console.log(`Escrituras bloqueadas por el candado: ${bloqueadas.length ? bloqueadas.join(', ') : 'ninguna'}.`);
    console.log(`Informe: ${fichero}`);
}

(async () => {
    if (orden === 'seco') return seco();
    if (orden === 'estado') {
        const r = await api('/contestador');
        console.log(`Activo: ${r.activo} · modo ${r.modo}`);
        for (const t of r.turnos || []) console.log(`C${t.id}  ${t.estado.padEnd(10)} ${(t.accion || '').padEnd(9)} ${t.tel9 || ''}  ${t.obra || ''}  ${(t.motivo || t.error || '').slice(0, 90)}`);
        return;
    }
    if (orden === 'resumen') { console.log((await api('/contestador/resumen')).texto || '(nada que contar)'); return; }
    if (orden === 'enviar') {
        const id = String(args[1] || '').replace(/^C/i, '');
        const si = opt('si', '');
        if (!id || !si) throw new Error('Uso: enviar C12 --si "<respuesta literal de Fran>"');
        const r = await api(`/contestador/${id}/enviar`, { method: 'POST', body: { si } });
        console.log(`✓ C${r.id} enviado a ${r.tel9}:\n${r.texto}`);
        return;
    }
    console.log('Órdenes: seco [--tel …|--de …] [--max 8] [--cerebro claude|gemini] · estado · resumen · enviar C12 --si "…"');
})().catch((e) => { console.error(`✗ ${e.message}`); process.exitCode = 1; });
