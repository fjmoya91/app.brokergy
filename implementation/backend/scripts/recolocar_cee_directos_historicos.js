// ─── recolocar_cee_directos_historicos.js ────────────────────────────────────
// Lleva a sus carpetas canónicas la documentación de los CEE directos importados
// del Drive antiguo.
//
// Los 55 encargos se dieron de alta con la estructura de la app
// (`1. CEE INICIAL` · `2. CEE FINAL` · …), pero sus ficheros siguen en las
// carpetas que se hicieron a mano en su día: `CEE INICIAL`, `CEE FINAL`,
// `CEE INICIAL SOLO ACS`. La app solo mira las canónicas, así que el módulo CEE
// de esos expedientes sale VACÍO aunque el certificado, la etiqueta y el
// justificante de registro estén ahí. Medido: 17 encargos dobles dados por
// FINALIZADO sin que la app pueda enseñar ni uno de sus ficheros.
//
// Se MUEVE el contenido, no se renombra la carpeta: la canónica ya existe (la
// creó el alta), y renombrar dejaría dos carpetas con el mismo nombre — que es
// justo el lío que hay que evitar.
//
// Simulación:  node scripts/recolocar_cee_directos_historicos.js
// De verdad:   node scripts/recolocar_cee_directos_historicos.js --execute
require('dotenv').config();
const supabase = require('../services/supabaseClient');
const drive = require('../services/driveService');
const folders = require('../services/ceeDirectoFolders');

const EXEC = process.argv.includes('--execute');
const ES_CARPETA = 'application/vnd.google-apps.folder';

/** Normaliza para comparar: sin tildes, sin dobles espacios, en mayúsculas. */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * ¿A qué fase pertenece una carpeta de la época manual?
 * Se acepta el sufijo libre ("CEE INICIAL SOLO ACS" es la inicial de 2025CEE_20),
 * pero NO se toca la que ya es canónica.
 */
function faseDe(nombre, canonicas) {
    const n = norm(nombre);
    if (canonicas.includes(n)) return null;
    if (n.startsWith('CEE INICIAL')) return 'inicial';
    if (n.startsWith('CEE FINAL')) return 'final';
    return null;
}

(async () => {
    const { data: filas, error } = await supabase
        .from('cee_directos')
        .select('id, numero_expediente, alcance, origen, drive_folder_id')
        .not('drive_folder_id', 'is', null)
        .order('numero_expediente');
    if (error) throw error;

    console.log(`${EXEC ? '🚚 RECOLOCANDO' : '🔍 SIMULACIÓN'} · ${filas.length} encargos con carpeta\n`);
    let movidos = 0, retiradas = 0, tocados = 0, conRestos = 0;

    for (const row of filas) {
        const canonicas = [
            norm(folders.subcarpetaFase(row.alcance, 'inicial')),
            norm(folders.subcarpetaFase(row.alcance, 'final')),
        ];
        const hijos = await drive.listFiles(row.drive_folder_id);
        const lineas = [];

        for (const c of hijos) {
            if (c.mimeType !== ES_CARPETA) continue;
            const fase = faseDe(c.name, canonicas);
            if (!fase) continue;

            // ⚠️ La carpeta canónica de la fase FINAL solo existe si el encargo es
            // DOBLE. Si un encargo marcado ÚNICO tiene una carpeta "CEE FINAL" con
            // ficheros, su contenido acabaría en la misma carpeta que el inicial y
            // se mezclarían dos certificados. Eso no se recoloca: se avisa, igual
            // que en el barrido de `1. CEE`.
            const destinoNombre = folders.subcarpetaFase(row.alcance, fase);
            const mezcla = fase === 'final'
                && norm(destinoNombre) === norm(folders.subcarpetaFase(row.alcance, 'inicial'));

            const dentro = await drive.listFiles(c.id);
            const ficheros = dentro.filter(f => f.mimeType !== ES_CARPETA);
            const subcarpetas = dentro.filter(f => f.mimeType === ES_CARPETA);

            if (mezcla && ficheros.length) {
                lineas.push(`   ⚠️  "${c.name}" tiene ${ficheros.length} ficheros pero el encargo consta ${row.alcance}.`);
                lineas.push('       Amplíalo a DOBLE desde la ficha y vuelve a pasarlo. NO se toca.');
                continue;
            }
            if (!ficheros.length && !subcarpetas.length) {
                lineas.push(`   · "${c.name}" vacía → se retira`);
                if (EXEC) { try { await drive.deleteFile(c.id); retiradas++; } catch (e) { console.log('     ⚠️', e.message); } }
                else retiradas++;
                continue;
            }

            lineas.push(`   · "${c.name}" → "${destinoNombre}"  (${ficheros.length} ficheros)`);
            for (const f of ficheros) {
                if (!EXEC) { movidos++; continue; }
                const destinoId = await drive.getOrCreateSubfolder(row.drive_folder_id, destinoNombre);
                if (!destinoId) { console.log('     ⚠️ sin carpeta destino'); break; }
                // Si ya hay uno con ese nombre en el destino, el que llega NO lo
                // pisa: el de allí se archiva en OLD. Los dos prueban algo.
                const choque = await drive.findFileByName(destinoId, f.name);
                if (choque) await drive.archiveExistingToOld(destinoId, choque, f.name);
                await drive.moveFolder(f.id, destinoId);
                movidos++;
            }

            // La carpeta de origen solo se retira si queda COMPLETAMENTE vacía. Si
            // dentro había subcarpetas (2025CEE_20 tiene una "CEE FINAL" anidada con
            // un .cex), se deja y se dice: mover a ciegas una carpeta que no se ha
            // mirado es cómo se pierden cosas.
            if (subcarpetas.length) {
                conRestos++;
                lineas.push(`       ↳ quedan ${subcarpetas.length} subcarpeta(s) dentro (${subcarpetas.map(s => s.name).join(', ')}): se deja, revísala a mano`);
            } else if (EXEC) {
                try { await drive.deleteFile(c.id); retiradas++; } catch (e) { console.log('     ⚠️', e.message); }
            } else retiradas++;
        }

        if (lineas.length) {
            tocados++;
            console.log(`📁 ${row.numero_expediente} (${row.alcance}${row.origen === 'HISTORICO' ? ' · histórico' : ''})`);
            console.log(lineas.join('\n'));
            console.log('');
        }
    }

    console.log(`${EXEC ? '✅' : '📋'} ${tocados} encargos · ${movidos} ficheros · ${retiradas} carpetas retiradas` +
        (conRestos ? ` · ${conRestos} con subcarpetas que se dejan intactas` : ''));
    if (!EXEC && tocados) console.log('   Repite con --execute para aplicarlo.');
    process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
