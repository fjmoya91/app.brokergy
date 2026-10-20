/**
 * ¿Qué haría el buzón de firmados del S.O. (services/firmadosSoCorreo.js) con los
 * correos que hay ahora mismo? EN SECO por defecto: lee el buzón y las firmas, no
 * registra nada, no avisa a nadie y no marca ningún correo como visto.
 *
 *   node scripts/probar_firmados_correo.js                 # últimos 10 días, en seco
 *   node scripts/probar_firmados_correo.js --dias 30
 *   node scripts/probar_firmados_correo.js --aplicar       # REGISTRA (Supabase y Drive de PRODUCCIÓN)
 *   node scripts/probar_firmados_correo.js --aplicar --avisar
 *
 * En seco mira también los correos ya vistos; con --aplicar, solo los nuevos
 * (como el barrido del servidor).
 */
require('dotenv').config({ quiet: true });
const { revisarBuzon } = require('../services/firmadosSoCorreo');

const args = process.argv.slice(2);
const val = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
const aplicar = args.includes('--aplicar');
const dias = Number(val('--dias', 10));

(async () => {
    console.log(`Buzón de firmados del S.O. — últimos ${dias} días — ${aplicar ? 'APLICANDO (escribe en producción)' : 'EN SECO'}\n`);
    const informes = await revisarBuzon({
        dryRun: !aplicar, dias, revisarVistos: !aplicar, avisos: aplicar && args.includes('--avisar'),
    });
    if (!informes.length) { console.log('Ningún correo de un S.O. en ese plazo.'); return; }
    for (const i of informes) {
        const fecha = i.fecha ? new Date(i.fecha).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '¿?';
        console.log(`■ ${fecha} · ${i.de}\n  ${i.asunto}`);
        console.log(`  → ${i.lote || 'sin lote'} · ${i.accion}${i.motivo ? ` (${i.motivo})` : ''}`);
        if (i.resultado && i.accion !== 'ignorado') {
            for (const r of i.resultado.resultados) {
                const marca = r.registrado ? '✅' : r.estado === 'listo' ? '✓ ' : r.estado === 'ya_registrado' ? 'ℹ️' : '⚠️';
                console.log(`     ${marca} ${r.fichero} → ${r.estado}${r.expediente ? ` · ${r.expediente}` : r.doc ? ` · ${r.doc}` : ''}`
                    + `${r.firmas?.length ? ` · firma: ${r.firmas.map(f => f.nombre || f.cn).join(' + ')}` : ''}`);
                for (const a of r.avisos || []) console.log(`        ${a}`);
            }
            const p = i.resultado.pendientes;
            console.log(`     Pendientes de firma en el lote: ${p.length ? p.map(x => x.expediente || x.etiqueta).join(' · ') : 'ninguno'}`);
        }
        console.log('');
    }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
