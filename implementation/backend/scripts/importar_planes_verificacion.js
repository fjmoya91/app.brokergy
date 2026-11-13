/**
 * Los PLANES DE VERIFICACIÓN que el verificador mandó por correo → su lote, con el
 * equipo (verificador jefe y revisor técnico, email y teléfono).
 * Ver docs/conocimiento/lotes/el-equipo-de-verificacion-del-lote.md.
 *
 * EN SECO por defecto: solo dice lo que haría. Lee el buzón LOTE_SO_SMTP_* en solo
 * lectura y el PDF de cada plan con Gemini (~3 s por plan).
 *
 *   node scripts/importar_planes_verificacion.js                 # en seco, 120 días
 *   node scripts/importar_planes_verificacion.js --lote LOTE-2026-014
 *   node scripts/importar_planes_verificacion.js --escribir      # archiva y sella
 *   node scripts/importar_planes_verificacion.js --forzar        # también los ya leídos
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { importarPlanesDelBuzon } = require('../services/equipoVerificacion');

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const escribir = process.argv.includes('--escribir');

const persona = (p) => p ? [p.nombre, p.email, p.telefono].filter(Boolean).join(' · ') : '—';

(async () => {
    const informes = await importarPlanesDelBuzon({
        dryRun: !escribir,
        dias: Number(arg('--dias')) || 120,
        forzar: process.argv.includes('--forzar'),
        lote: arg('--lote'),
    });
    console.log(`${escribir ? 'ESCRIBIENDO' : 'EN SECO'} · ${informes.length} correo(s) «Plan de verificación»\n`);
    for (const i of informes) {
        console.log(`${i.lote || '?'} · ${i.accion}${i.archivaria ? ' (archivaría el PDF: el lote no lo tiene)' : ''}${i.motivo ? ` — ${i.motivo}` : ''}`);
        console.log(`   «${i.asunto}» ${i.fecha ? new Date(i.fecha).toLocaleDateString('es-ES') : ''}`);
        if (i.equipo) {
            console.log(`   Verificador jefe: ${persona(i.equipo.verificador_jefe)}`);
            console.log(`   Revisor técnico:  ${persona(i.equipo.revisor_tecnico)}`);
        }
    }
    process.exit(0);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
