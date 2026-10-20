#!/usr/bin/env node
// =============================================================================
// RONDA DE WHATSAPP — lanzarla a mano y esperar el informe (2026-10-19)
// -----------------------------------------------------------------------------
// La ronda vive en el BACKEND (services/rondaWhatsapp.js): la sesión de WhatsApp
// es un singleton de ese proceso y un script suelto no la ve. Esto solo la lanza
// por su ruta (`POST /api/whatsapp/ronda/ejecutar`, con `x-internal-key`), sigue
// el progreso y dice dónde han quedado el informe, el email y el WhatsApp que
// se habrían mandado. EN SECO: sin `--enviar` no sale nada.
//
// Uso (con el backend arrancado y WhatsApp conectado):
//   node scripts/ronda_whatsapp_seco.js [--dias 1] [--telefono 6XXXXXXXX] [--api http://localhost:3000]
//   node scripts/ronda_whatsapp_seco.js --dias 7 --modelo gemini-3.5-flash-lite   ← para comparar modelos
//   node scripts/ronda_whatsapp_seco.js --enviar     ← manda el informe a Fran (email + chat del asistente)
// =============================================================================
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const opt = (n, d) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const API = String(opt('api', 'http://localhost:3000')).replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY;
if (!KEY) { console.error('Falta INTERNAL_API_KEY en el .env'); process.exit(1); }

const llamar = async (ruta, opciones = {}) => {
    const r = await fetch(`${API}/api/whatsapp${ruta}`, {
        ...opciones,
        headers: { 'x-internal-key': KEY, 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
};
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const hora = () => new Date().toLocaleTimeString('es-ES');

(async () => {
    const st = await llamar('/status');
    if (!st.ready) throw new Error(`WhatsApp no está listo en ${API} (${st.state})`);
    const body = {
        dias: opt('dias', null) ? Number(opt('dias')) : undefined,
        telefono: opt('telefono', undefined),
        modelo: opt('modelo', undefined),
        enviar: args.includes('--enviar'),
    };
    await llamar('/ronda/ejecutar', { method: 'POST', body: JSON.stringify(body) });
    console.log(`${hora()} Ronda lanzada${body.enviar ? ' (CON envío a Fran)' : ' en seco (sin enviar nada)'}…`);
    let ultimo = '';
    for (;;) {
        await espera(10_000);
        const e = await llamar('/ronda');
        const p = e.progreso;
        const linea = `${p.fase} ${p.hechos}/${p.total}`;
        if (linea !== ultimo) { console.log(`${hora()} ${linea}`); ultimo = linea; }
        if (p.fase === 'error') throw new Error(p.error);
        if (!p.corriendo && p.fase === 'hecha') {
            const u = e.ultima;
            console.log(`${hora()} Hecha con ${u.modelo}: ${u.resumen.activos} chats, ${u.resumen.adjuntos} adjuntos, ${u.resumen.preguntas} preguntas · ≈ ${u.coste.eur.toFixed(3)} € (${u.coste.llamadas} llamadas, ${u.coste.think || 0} tokens pensados)`);
            if (u.archivos) for (const [k, v] of Object.entries(u.archivos)) console.log(`   ${k.padEnd(9)} ${v}`);
            if (body.enviar) {
                await espera(5000);
                console.log('   envío:', JSON.stringify((await llamar('/ronda')).ultima?.envio || 'pendiente'));
            }
            break;
        }
    }
    process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
