#!/usr/bin/env node
/**
 * Ver EN VIVO qué le llega al bot de WhatsApp y qué contesta.
 *
 *   node scripts/vigilar_bot_whatsapp.js
 *
 * Una línea por cambio de estado, con la pregunta y la respuesta. Es lo que
 * hace falta mientras se prueba: los logs del backend cuentan lo que hace el
 * bot por dentro, pero no ponen juntas la pregunta del cliente y el texto que
 * acabó saliendo — que es justo lo que hay que juzgar.
 *
 * Al arrancar toma nota de lo que ya hay y NO lo anuncia: solo interesa lo que
 * pase a partir de ahora. Ctrl-C para salir.
 */

require('dotenv').config({ quiet: true });
const supabase = require('../services/supabaseClient');

const INTERVALO_MS = Number(process.env.BOT_VIGILA_MS || 6000);

const visto = new Map();      // id → último estado anunciado
let primera = true;

const corto = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

async function tick() {
    const { data, error } = await supabase
        .from('whatsapp_bot_mensajes')
        .select('id, estado, pregunta, respuesta, motivo, numero_expediente')
        .order('id', { ascending: false })
        .limit(30);
    if (error) return;

    // De más antiguo a más nuevo, para que se lea en el orden en que pasó.
    const filas = (data || []).slice().reverse();

    if (primera) {
        primera = false;
        for (const m of filas) visto.set(m.id, m.estado);
        console.log(`>> vigilando la bandeja del bot (${filas.length} mensaje(s) ya registrados, no se anuncian)`);
        return;
    }

    for (const m of filas) {
        if (visto.get(m.id) === m.estado) continue;
        visto.set(m.id, m.estado);
        const p = corto(m.pregunta, 100);
        const exp = m.numero_expediente ? ` [${m.numero_expediente}]` : '';
        if (m.estado === 'PENDIENTE') {
            console.log(`>> LLEGÓ: "${p}" — preparando respuesta`);
        } else if (m.estado === 'RESPONDIDO') {
            console.log(`>> CONTESTADO${exp}: "${p}"`);
            console.log(`   ${corto(m.respuesta, 400)}`);
        } else if (m.estado === 'ESCALADO') {
            console.log(`>> ESCALADO a una persona: "${p}"`);
            console.log(`   motivo: ${corto(m.motivo, 200)}`);
        } else {
            console.log(`>> ${m.estado}: "${p}"`);
            console.log(`   motivo: ${corto(m.motivo, 200)}`);
        }
    }
}

setInterval(() => { tick().catch(() => {}); }, INTERVALO_MS);
tick().catch(e => console.error('>> error inicial:', e.message));
