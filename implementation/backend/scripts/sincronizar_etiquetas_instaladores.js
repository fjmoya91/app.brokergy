#!/usr/bin/env node
/**
 * Repasa la cartera de INSTALADORES y deja cada chat de WhatsApp con su
 * etiqueta (y, si el número no estaba guardado, con su nombre de la BBDD).
 *
 *   node scripts/sincronizar_etiquetas_instaladores.js            → SIMULACIÓN
 *   node scripts/sincronizar_etiquetas_instaladores.js --execute  → de verdad
 *   node scripts/sincronizar_etiquetas_instaladores.js --id=<uuid>
 *
 * ⚠️ NO importa el servicio: la sesión de WhatsApp es un singleton que vive en
 * el proceso del servidor, y un `node scripts/…` arranca un proceso nuevo que no
 * la ve (medido: devuelve DISCONNECTED aunque esté perfectamente conectada). Por
 * eso llama a la API con la clave interna.
 *
 * ⚠️ Y se ejecuta en el HOST del VPS, no dentro del contenedor: `.dockerignore`
 * excluye `scripts/` a propósito, así que en la imagen no está. Ahí tampoco hay
 * `node_modules` —las dependencias viven dentro de la imagen—, de modo que este
 * script no puede requerir NADA: lee el `.env` a mano y usa el `fetch` de Node.
 *
 *   ssh root@<VPS> 'cd /opt/brokergy/implementation/backend && node scripts/sincronizar_etiquetas_instaladores.js'
 */

const fs = require('fs');
const path = require('path');

// .env a mano (sin dotenv: en el host no hay node_modules).
const envPath = path.join(__dirname, '../.env');
const env = {};
try {
    for (const linea of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
        if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
} catch (_) { /* si no hay .env, quedan las variables del entorno */ }

const BASE = process.env.INTERNAL_API_BASE || env.APP_URL || 'https://app.brokergy.es';
const KEY = process.env.INTERNAL_API_KEY || env.INTERNAL_API_KEY;

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const idArg = (args.find(a => a.startsWith('--id=')) || '').split('=')[1] || null;

(async () => {
    if (!KEY) {
        console.error('❌ Falta INTERNAL_API_KEY en el .env: es la que autoriza esta llamada.');
        process.exit(1);
    }

    console.log(execute
        ? '⚡ EJECUTANDO de verdad (etiqueta + agenda del teléfono)\n'
        : '🔍 SIMULACIÓN — no se escribe nada. Añade --execute para hacerlo de verdad.\n');

    const r = await fetch(`${BASE}/api/whatsapp/etiquetas/sincronizar-instaladores`, {
        method: 'POST',
        headers: { 'x-internal-key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: !execute, ids: idArg ? [idArg] : null }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        console.error(`❌ ${r.status}: ${j.error || 'error desconocido'}`);
        process.exit(1);
    }

    console.log(`Etiqueta: ${j.etiqueta} (id ${j.labelId})`);
    console.log(`Instaladores: ${j.instaladores} · teléfonos mirados: ${j.telefonos}`);
    console.log(`  ${execute ? 'Etiquetados' : 'Se etiquetarían'}: ${j.etiquetados}   (ya la tenían: ${j.yaEtiquetados})`);
    console.log(`  ${execute ? 'Contactos guardados' : 'Contactos que se guardarían'}: ${j.contactosGuardados}`);
    if (j.sinTelefono.length) console.log(`  Sin teléfono en la ficha: ${j.sinTelefono.length} → ${j.sinTelefono.join(', ')}`);
    if (j.sinWhatsapp.length) {
        console.log(`\n  Números sin WhatsApp (${j.sinWhatsapp.length}):`);
        j.sinWhatsapp.forEach(x => console.log(`   · ${x.instalador} — ${x.tlf}`));
    }
    if (j.errores.length) {
        console.log(`\n  ⚠️ Errores (${j.errores.length}):`);
        j.errores.forEach(x => console.log(`   · ${x.instalador} — ${x.tlf}: ${x.error}`));
    }
    if (j.abortado) console.log(`\n  ⛔ ${j.abortado}`);

    // El detalle solo cuando se pide: son ~90 líneas y lo que se mira es el resumen.
    if (args.includes('--detalle')) {
        console.log('\nDetalle:');
        j.detalle.forEach(d => console.log(`   ${d.instalador} · ${d.tlf} (${d.origen})`
            + ` → etiqueta: ${d.accionEtiqueta}, agenda: ${d.accionContacto}`
            + (d.nombreEnAgenda ? ` [ya guardado como "${d.nombreEnAgenda}"]` : ` [se guardaría como "${d.nombrePropuesto}"]`)));
    }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
