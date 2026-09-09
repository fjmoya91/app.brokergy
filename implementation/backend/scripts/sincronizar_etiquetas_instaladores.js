#!/usr/bin/env node
/**
 * Repasa la cartera de INSTALADORES y deja cada chat de WhatsApp con su
 * etiqueta (y, si el número no estaba guardado, con su nombre de la BBDD).
 *
 *   node scripts/sincronizar_etiquetas_instaladores.js            → SIMULACIÓN
 *   node scripts/sincronizar_etiquetas_instaladores.js --execute  → de verdad
 *   node scripts/sincronizar_etiquetas_instaladores.js --id=<uuid>
 *
 * ⚠️ Se ejecuta DENTRO del contenedor del backend, y llama a su propia API por
 * localhost con la clave interna. No puede importar el servicio y ya está: la
 * sesión de WhatsApp es un singleton que vive en el proceso del servidor, y un
 * `node scripts/…` arranca un proceso nuevo que no la ve (medido: devuelve
 * DISCONNECTED aunque la sesión esté perfectamente conectada).
 *
 *   ssh root@<VPS> 'docker exec brokergy-backend node scripts/sincronizar_etiquetas_instaladores.js'
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE = process.env.INTERNAL_API_BASE || 'http://localhost:3000';
const KEY = process.env.INTERNAL_API_KEY;

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
