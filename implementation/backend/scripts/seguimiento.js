// node scripts/seguimiento.js seco [--fecha 2026-11-17T10:30] [--dia] [--json fichero]
//
// El SEGUIMIENTO de propuestas y del material del CEE inicial (services/seguimientoWhatsapp.js),
// EN SECO contra los datos de producción: qué seguimientos nacerían, a quién, y los mensajes
// ENTEROS que saldrían en una vuelta (o, con --dia, en el primer día entero, con los topes del
// día en modo real). No escribe NADA: un candado corta toda escritura en Supabase y nada se
// manda por WhatsApp (un script no ve la sesión del servidor; y en seco no se llama).
//
//   seco               una vuelta, ahora (sin mirar el horario)
//   --fecha <ISO>      como si fuera ese momento (hora de Madrid si no lleva zona)
//   --dia              el día entero: sin el tope por vuelta ni por hora, con el del día
//   --json <fichero>   además, todo en un JSON (lleva nombres: fuera de git)
//
// Los teléfonos salen ENMASCARADOS.
const path = require('path');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });

const args = process.argv.slice(2);
const orden = args[0];
const opt = (k, d = null) => { const i = args.indexOf(`--${k}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };

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
    // Y WhatsApp, por si acaso: nada sale.
    const ws = require('../services/whatsappService');
    ws.sendText = async () => { bloqueadas.push('whatsapp sendText'); return { ok: false, error: 'EN SECO' }; };
    ws.sendMedia = async () => { bloqueadas.push('whatsapp sendMedia'); return { ok: false, error: 'EN SECO' }; };
    return bloqueadas;
}

const mascara = (t) => (t ? `${String(t).slice(0, 1)}xx xxx ${String(t).slice(-3)}` : '—');
const fecha = (d) => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function cuandoEs() {
    const f = opt('fecha');
    if (!f || f === true) return new Date();
    if (/[zZ]|[+-]\d\d:?\d\d$/.test(f)) return new Date(f);
    // Sin zona: hora de Madrid (noviembre–marzo +01:00; el resto +02:00, aproximado).
    const mes = Number(String(f).slice(5, 7));
    return new Date(`${f}${mes >= 4 && mes <= 10 ? '+02:00' : '+01:00'}`);
}

(async () => {
    if (orden !== 'seco') {
        console.log('Uso: node scripts/seguimiento.js seco [--fecha 2026-11-17T10:30] [--dia] [--json fichero]');
        process.exit(1);
    }
    const bloqueadas = candado();
    const seg = require('../services/seguimientoWhatsapp');
    const ahora = cuandoEs();
    if (opt('dia')) {
        // El día entero en real: como mucho el tope del día, sin el de la vuelta ni el de la hora.
        process.env.SEGUIMIENTO_MODO = 'real';
        process.env.SEGUIMIENTO_PRUEBA = '';
        seg.CFG.porVuelta = 1000;
        seg.CFG.topeHora = seg.CFG.topeDia;
    }
    console.log(`Seguimiento EN SECO · ${fecha(ahora)} · modo ${seg.modo()}${opt('dia') ? ' (simulando el día entero en real)' : ''}\n`);

    // Con --dia, todo lo que vence ese día hasta las 21:00 (la franja de la casa).
    const Pasos = require('../utils/seguimientoPasos');
    const hasta = opt('dia') ? Pasos.aLasMadrid(Pasos.ymdMadrid(ahora), 21) : null;
    const r = await seg.vuelta({ seco: true, ahora, sinHorario: true, hasta });
    if (r.motivo) console.log(`(la vuelta dice: ${r.motivo})`);
    const s = r.siembra || { nuevos: [], cerrados: [], reiniciados: [], sinDestino: [] };
    if (s.sinTabla) console.log('⚠ La tabla wa_seguimientos aún no existe (scripts/wa_seguimientos_schema.sql): se simula vacía.\n');

    // ── Lo que nacería ──
    const cuenta = (lista, clave) => lista.reduce((m, x) => { const k = clave(x); m[k] = (m[k] || 0) + 1; return m; }, {});
    const nuevos = s.nuevos || [];
    console.log(`Nacerían ${nuevos.length} seguimientos:`);
    const porTipo = cuenta(nuevos, x => `${x.tipo} · ${x.fase} · ${x.destino}`);
    for (const [k, n] of Object.entries(porTipo).sort()) console.log(`  ${String(n).padStart(4)}  ${k}`);
    const personas = new Set(nuevos.map(x => `${x.tipo}|${x.tel9}`));
    console.log(`  (${personas.size} personas distintas)`);
    if (s.sinDestino?.length) console.log(`\nSin nadie a quien escribir (${s.sinDestino.length}): ${s.sinDestino.join(', ')}`);
    if (s.cerrados?.length) console.log(`\nSe cerrarían ${s.cerrados.length}: ${s.cerrados.map(c => `${c.numero} (${c.resultado})`).join(', ')}`);
    if (s.reiniciados?.length) console.log(`\nSe reiniciarían ${s.reiniciados.length}: ${s.reiniciados.map(c => `${c.numero} → ${c.fase}`).join(', ')}`);

    // Cuándo toca lo que no es hoy.
    const futuros = nuevos.filter(x => Date.parse(x.proximo_at) > ahora.getTime());
    if (futuros.length) {
        const porDia = cuenta(futuros, x => new Date(x.proximo_at).toISOString().slice(0, 10));
        console.log(`\nMás adelante (primer toque): ${Object.entries(porDia).sort().map(([d, n]) => `${d}: ${n}`).join(' · ')}`);
    }

    // ── Lo que saldría ──
    const mensajes = (r.hecho || []).filter(h => h.texto);
    const otros = (r.hecho || []).filter(h => !h.texto);
    console.log(`\n${'═'.repeat(70)}\nMENSAJES QUE SALDRÍAN (${mensajes.length})\n${'═'.repeat(70)}`);
    mensajes.forEach((h, i) => {
        const a = String(h.a || '').replace(/\d{9,}/g, (m) => mascara(m.slice(-9)));
        console.log(`\n── ${i + 1}. ${h.tipo} · ${h.fase} · a ${a} · ${mascara(h.tel9)} · ${h.numeros.join(', ')}\n`);
        console.log(h.texto);
    });
    if (otros.length) {
        console.log(`\n${'─'.repeat(70)}\nLo demás de la vuelta:`);
        const porAccion = cuenta(otros, x => `${x.accion}${x.motivo ? ` (${x.motivo})` : ''}`);
        for (const [k, n] of Object.entries(porAccion)) console.log(`  ${String(n).padStart(4)}  ${k}`);
        const agente = otros.filter(x => /^agente/.test(x.accion));
        if (agente.length) console.log(`  CEE con el material completo (se le pasarían a Claude): ${agente.map(a => a.numeros.join(',')).join(', ')}`);
    }

    console.log(`\nEscrituras cortadas por el candado: ${bloqueadas.length}${bloqueadas.length ? ` (${[...new Set(bloqueadas)].join(', ')})` : ''}`);
    const fj = opt('json');
    if (fj && fj !== true) {
        require('fs').writeFileSync(fj, JSON.stringify({ ahora, siembra: s, hecho: r.hecho }, null, 2));
        console.log(`JSON: ${fj}`);
    }
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
