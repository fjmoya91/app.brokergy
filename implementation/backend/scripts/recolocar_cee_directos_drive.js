// ─── recolocar_cee_directos_drive.js ─────────────────────────────────────────
// Recoloca los ficheros de CEE directos que cayeron en una carpeta con forma de
// CAE (`1. CEE / CEE INICIAL|CEE FINAL`).
//
// Los subía la rejilla del módulo CEE, compartida con el CAE, que escribía esa
// ruta a mano; `getOrCreateSubfolder` la creaba al vuelo dentro de la carpeta del
// encargo. El fichero quedaba fuera de donde mira `scanSection` y fuera de lo que
// se comparte con el técnico y con el cliente.
//
// Simulación:  node scripts/recolocar_cee_directos_drive.js
// De verdad:   node scripts/recolocar_cee_directos_drive.js --execute
require('dotenv').config();
const supabase = require('../services/supabaseClient');
const drive = require('../services/driveService');
const folders = require('../services/ceeDirectoFolders');

const EXEC = process.argv.includes('--execute');
const CAE_ANIDADAS = ['CEE INICIAL', 'CEE FINAL'];

(async () => {
    const { data: filas, error } = await supabase
        .from('cee_directos')
        .select('id, numero_expediente, alcance, drive_folder_id')
        .not('drive_folder_id', 'is', null)
        .order('numero_expediente');
    if (error) throw error;

    console.log(`${EXEC ? '🚚 RECOLOCANDO' : '🔍 SIMULACIÓN'} · ${filas.length} encargos con carpeta\n`);
    let movidos = 0, limpiadas = 0, tocados = 0;

    for (const row of filas) {
        const hijos = await drive.listFiles(row.drive_folder_id);
        // Solo las carpetas con forma de CAE: una `1. CEE` que contenga dentro
        // una `CEE INICIAL` o `CEE FINAL`. En un encargo ÚNICO `1. CEE` es la
        // carpeta BUENA, así que lo que se recoloca es lo de dentro, nunca ella.
        const contenedores = hijos.filter(h =>
            h.mimeType === 'application/vnd.google-apps.folder' &&
            /^1\.\s*CEE$/i.test(h.name.trim()));

        const lineas = [];
        for (const cont of contenedores) {
            const dentro = await drive.listFiles(cont.id);

            // SALVAGUARDA — en un encargo ÚNICO las dos fases caerían en la MISMA
            // carpeta (`1. CEE`). Si dentro hay certificados de las dos, eso no es
            // un fichero mal colocado: es un encargo que en realidad es DOBLE y se
            // dio de alta como único. Aplanarlo mezclaría dos certificados en una
            // carpeta y `matchSlot` se quedaría con el primero de cada slot, así
            // que la app enseñaría una mezcla de los dos. No se toca; se avisa.
            const esUnico = folders.subcarpetaFase(row.alcance, 'inicial')
                === folders.subcarpetaFase(row.alcance, 'final');
            if (esUnico) {
                const conFicheros = [];
                for (const sub of dentro) {
                    if (sub.mimeType !== 'application/vnd.google-apps.folder') continue;
                    if (!CAE_ANIDADAS.some(n => n.toLowerCase() === sub.name.trim().toLowerCase())) continue;
                    const ff = await drive.listFiles(sub.id);
                    if (ff.some(f => f.mimeType !== 'application/vnd.google-apps.folder')) conFicheros.push(sub.name);
                }
                if (conFicheros.length > 1) {
                    const aviso = `${row.numero_expediente}: consta UNICO pero tiene certificados de ${conFicheros.join(' y ')}.`;
                    console.log('⚠️  ' + aviso);
                    console.log('    Amplialo a DOBLE desde la ficha y vuelve a pasar el script. NO se toca.');
                    console.log('');
                    continue;
                }
            }

            for (const sub of dentro) {
                if (sub.mimeType !== 'application/vnd.google-apps.folder') continue;
                if (!CAE_ANIDADAS.some(n => n.toLowerCase() === sub.name.trim().toLowerCase())) continue;

                const fase = /final/i.test(sub.name) ? 'final' : 'inicial';
                const destinoNombre = folders.subcarpetaFase(row.alcance, fase);
                const ficheros = (await drive.listFiles(sub.id))
                    .filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
                if (!ficheros.length) { lineas.push(`   · ${cont.name}/${sub.name} vacía → se retira`); }

                for (const f of ficheros) {
                    lineas.push(`   · ${f.name}\n       ${cont.name}/${sub.name}  →  ${destinoNombre}`);
                    if (!EXEC) { movidos++; continue; }
                    const destinoId = await drive.getOrCreateSubfolder(row.drive_folder_id, destinoNombre);
                    if (!destinoId) { console.log('     ⚠️ sin carpeta destino'); continue; }
                    // Si ya hay uno con ese nombre en el destino, el recién
                    // llegado NO lo pisa: se archiva el de allí en OLD, igual que
                    // hace la subida. Los dos son prueba de algo.
                    const choque = await drive.findFileByName(destinoId, f.name);
                    if (choque) await drive.archiveExistingToOld(destinoId, choque, f.name);
                    await drive.moveFolder(f.id, destinoId);
                    try { await drive.setFolderPublic(f.id, 'reader'); } catch { /* noop */ }
                    movidos++;
                }
                // La carpeta anidada ya no pinta nada. Se manda a la papelera, no
                // se borra: si algo se ha quedado dentro, se puede recuperar.
                if (EXEC) { try { await drive.deleteFile(sub.id); limpiadas++; } catch (e) { console.log('     ⚠️', e.message); } }
                else limpiadas++;
            }

            // `1. CEE` solo se retira si sobra: en un encargo ÚNICO es la buena.
            const esLaBuena = folders.subcarpetaFase(row.alcance, 'inicial').toUpperCase() === '1. CEE';
            if (!esLaBuena) {
                const resto = EXEC ? await drive.listFiles(cont.id) : [];
                if (!EXEC || !resto.length) {
                    lineas.push(`   · ${cont.name} sobra en un encargo ${row.alcance} → se retira`);
                    if (EXEC) { try { await drive.deleteFile(cont.id); } catch (e) { console.log('     ⚠️', e.message); } }
                }
            }
        }

        if (lineas.length) { tocados++; console.log(`📁 ${row.numero_expediente} (${row.alcance})`); console.log(lineas.join('\n')); console.log(''); }
    }

    console.log(`\n${EXEC ? '✅' : '📋'} ${tocados} encargos · ${movidos} ficheros · ${limpiadas} carpetas retiradas`);
    if (!EXEC && tocados) console.log('   Repite con --execute para aplicarlo.');
    process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
