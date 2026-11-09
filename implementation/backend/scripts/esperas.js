// Las ESPERAS de WhatsApp (services/esperasWhatsapp.js), vistas desde un PC.
//
//   node scripts/esperas.js seco [--dias 14] [--api https://app.brokergy.es]
//       EN SECO y sin la tabla: rehace lo que se ha PEDIDO por WhatsApp en los últimos días
//       (el historial de los expedientes: «Solicitar lo que falta» y el pedido del agente tras
//       la aceptación), lee cada chat en el WhatsApp del VPS (la ruta de solo lectura
//       /conversacion, de una en una y con pausa) y dice qué habría hecho el agente: quién
//       contestó, quién solo acusó recibo y a quién se le recordaría, con el texto ENTERO.
//       No escribe en la BD (candado como el de ronda_cc.js) ni le escribe a nadie.
//       Deja el informe en backend/scratch/esperas/ (fuera de git: lleva nombres y teléfonos).
//   node scripts/esperas.js estado [--api …]
//       Lo abierto en el servidor (GET /api/whatsapp/esperas), si ya está la tabla.
//   node scripts/esperas.js resumen [--api …]
//       El bloque del repaso de las 9:00 tal y como saldría hoy.
const path = require('path');
const fs = require('fs');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });

const args = process.argv.slice(2);
const orden = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const API = String(opt('api', process.env.RONDA_API_URL || 'https://app.brokergy.es')).replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY;
const DIR = path.join(__dirname, '..', 'scratch', 'esperas');
const PAUSA_MS = 1500;   // entre lecturas: es la sesión de PRODUCCIÓN

// ── Candado: este proceso no escribe en la BD ────────────────────────────────
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

const esperas = require('../services/esperasWhatsapp');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ult9 = (t) => String(t || '').replace(/\D/g, '').slice(-9) || null;

async function api(ruta, { method = 'GET', body, plazo = 120_000 } = {}) {
    if (!KEY) throw new Error('Falta INTERNAL_API_KEY en el .env del backend.');
    const r = await fetch(`${API}/api/whatsapp${ruta}`, {
        method, signal: AbortSignal.timeout(plazo),
        headers: { 'x-internal-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
}

/** Lo pedido por WhatsApp en el historial de los expedientes tocados en los últimos `dias`. */
async function pedidosRecientes(dias) {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
    const { data, error } = await supabase.from('expedientes')
        .select('id, numero_expediente, oportunidad_id, historial:documentacion->historial, aa:documentacion->aceptacion_agente')
        .gte('updated_at', desde).limit(500);
    if (error) throw new Error(error.message);
    const out = [];
    for (const e of data || []) {
        for (const h of Array.isArray(e.historial) ? e.historial : []) {
            if (!h?.fecha || h.fecha < desde) continue;
            if (h.tipo === 'solicitud_docs' && /vía [^.]*WhatsApp/.test(h.texto || '')) {
                // «… enviada a Cliente (Ana García · 600111222) vía WhatsApp + Email. Pedido: …»
                const m = String(h.texto).match(/\(([^()]*?)\s·\s(\+?[\d\s]{9,})\)/);
                const tel = ult9(m?.[2]);
                if (!tel) continue;
                out.push({
                    tel, nombre: m[1].trim(), quien: h.target === 'INSTALADOR' ? 'INSTALADOR' : 'CLIENTE',
                    numero: e.numero_expediente, oportunidad_id: e.oportunidad_id, motivo: 'DOCUMENTACION',
                    pedido: Array.isArray(h.solicitado) ? h.solicitado : [], enviado_at: h.fecha, origen: 'solicitar-faltantes',
                });
            }
            if (h.tipo === 'pedido_aceptacion' && e.aa?.pedido_a) {
                const quien = e.aa.pedido_quien === 'instalador' ? 'INSTALADOR' : 'CLIENTE';
                const nombre = (String(h.texto || '').match(/^Pedido por WhatsApp a (.+?)(?: \(instalador\))? para el CEE inicial/) || [])[1] || null;
                out.push({
                    tel: ult9(e.aa.pedido_a), nombre, quien, numero: e.numero_expediente, oportunidad_id: e.oportunidad_id,
                    motivo: 'CEE_INICIAL', pedido: Array.isArray(e.aa.pedido) ? e.aa.pedido : [], enviado_at: h.fecha, origen: 'aceptacion',
                });
            }
        }
    }
    // Una por teléfono + obra + motivo: la última (un segundo pedido RENUEVA la espera).
    const por = new Map();
    for (const p of out.filter(p => p.tel).sort((a, b) => a.enviado_at.localeCompare(b.enviado_at))) por.set(`${p.tel}|${p.numero}|${p.motivo}`, p);
    return [...por.values()];
}

/** Cuántos archivos se han subido a la obra desde `desde` (cada entrada de `reforma_uploads` lleva `at`). */
async function subidoDesde(oportunidadId, desde) {
    if (!oportunidadId) return 0;
    const { data } = await supabase.from('oportunidades')
        .select('ru:datos_calculo->reforma_uploads').eq('id', oportunidadId).maybeSingle();
    let n = 0;
    const mirar = (v) => {
        if (Array.isArray(v)) return v.forEach(mirar);
        if (v && typeof v === 'object') {
            if (typeof v.at === 'string' && v.driveId && v.at >= desde) n += 1;
            Object.values(v).forEach(x => { if (x && typeof x === 'object') mirar(x); });
        }
    };
    mirar(data?.ru);
    return n;
}

async function seco() {
    const dias = Number(opt('dias', 14)) || 14;
    const ahora = new Date();
    const pedidos = await pedidosRecientes(dias);
    console.log(`${pedidos.length} pedido(s) por WhatsApp en los últimos ${dias} días. Leyendo los chats en ${API}…`);
    const conv = new Map();          // tel → mensajes (se lee cada chat UNA vez)
    const filas = [];
    for (const p of pedidos) {
        if (!conv.has(p.tel)) {
            try {
                const c = await api('/conversacion', { method: 'POST', body: { telefono: p.tel, dias: dias + 1 }, plazo: 90_000 });
                conv.set(p.tel, { mensajes: c.mensajes || [], incompleto: !!c.incompleto });
            } catch (e) { conv.set(p.tel, { error: e.message, mensajes: [] }); }
            await sleep(PAUSA_MS);
        }
        const c = conv.get(p.tel);
        const t0 = Date.parse(p.enviado_at) / 1000;
        const suyos = c.mensajes.filter(m => !m.de_mi && m.t >= t0)
            .filter(m => !esperas.esAutomatica({ body: m.texto, timestamp: m.t }, t0 * 1000));
        const reales = suyos.filter(m => !esperas.esAcuse({ type: m.tipo, body: m.texto }));
        const vence = esperas.venceTras(new Date(p.enviado_at), esperas.CFG.primerAvisoH);
        const subido = await subidoDesde(p.oportunidad_id, p.enviado_at);
        let estado;
        if (c.error) estado = { tipo: 'error', txt: `no se ha podido leer el chat (${c.error})` };
        else if (reales.length) estado = { tipo: 'contestada', txt: esperas.describirMensaje({ type: reales[0].tipo, body: reales[0].texto }) };
        else if (subido) estado = { tipo: 'contestada', txt: `ha subido ${subido} archivo(s) por el enlace` };
        else if (vence > ahora) estado = { tipo: 'esperando', txt: `aún en plazo (vence el ${vence.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})` };
        else estado = { tipo: 'recordar', txt: suyos.length ? `solo acusó recibo (${esperas.describirMensaje({ type: suyos[0].tipo, body: suyos[0].texto })})` : 'sin respuesta' };
        let texto = null;
        if (estado.tipo === 'recordar') {
            let enlace = null;
            try { enlace = await require('../services/reformaUploadService').uploadLinkSiExiste(p.oportunidad_id); } catch { /* sin enlace */ }
            texto = esperas.textoRecordatorio(p, { enlace });
        }
        filas.push({ ...p, estado, texto, acuses: suyos.length - reales.length });
    }

    const ESTADOS = { contestada: 'Han contestado', recordar: 'Se les recordaría (modo copia: no saldría nada)', esperando: 'En plazo todavía', error: 'No se ha podido leer' };
    const md = [`# Esperas de WhatsApp — en seco (${ahora.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })})`, '',
        `Pedidos por WhatsApp en los últimos ${dias} días: **${filas.length}**. Plazo hasta el primer recordatorio: ${esperas.CFG.primerAvisoH} h hábiles.`, ''];
    for (const k of Object.keys(ESTADOS)) {
        const g = filas.filter(f => f.estado.tipo === k);
        if (!g.length) continue;
        md.push(`## ${ESTADOS[k]} (${g.length})`, '');
        for (const f of g) {
            md.push(`- **${f.numero}** · ${f.nombre || '—'}${f.quien !== 'CLIENTE' ? ` (${f.quien.toLowerCase()})` : ''} · ${f.motivo === 'CEE_INICIAL' ? 'pedido tras la aceptación' : 'documentación'} del ${new Date(f.enviado_at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })} — ${f.estado.txt}`);
            if (f.texto) md.push('', '```', f.texto, '```', '');
        }
        md.push('');
    }
    md.push(`_Escrituras bloqueadas por el candado: ${bloqueadas.length ? bloqueadas.join(', ') : 'ninguna'}._`);
    fs.mkdirSync(DIR, { recursive: true });
    const fichero = path.join(DIR, `seco-${ahora.toISOString().slice(0, 10)}.md`);
    fs.writeFileSync(fichero, md.join('\n'));
    console.log(md.join('\n'));
    console.log(`\nInforme: ${fichero}`);
}

(async () => {
    try {
        if (orden === 'seco') await seco();
        else if (orden === 'estado') console.log(JSON.stringify(await api('/esperas'), null, 2));
        else if (orden === 'resumen') console.log((await api('/esperas/resumen')).texto || '(nada que contar)');
        else { console.log('Uso: node scripts/esperas.js seco [--dias 14] | estado | resumen'); process.exit(1); }
        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
})();
