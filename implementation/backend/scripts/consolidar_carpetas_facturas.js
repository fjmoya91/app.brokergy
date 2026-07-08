#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONSOLIDACIÓN: fusiona carpetas de facturas DUPLICADAS por diferencia de nombre.
 *
 * Causa: la plantilla de Drive trae "5. FACTURAS" (con espacio) pero el código
 * antiguo buscaba/creaba "5.FACTURAS" (sin espacio) con match EXACTO → en algunos
 * expedientes acabaron DOS carpetas ("5. FACTURAS" y "5.FACTURAS"), cada una con
 * parte de las facturas. Ya está corregido en el código (resolución tolerante);
 * este script limpia el histórico.
 *
 * QUÉ HACE (por expediente):
 *   1. Lista las subcarpetas cuyo nombre normalizado == "5facturas".
 *   2. Si hay >1, elige la CANÓNICA (preferencia: nombre exacto "5. FACTURAS";
 *      si no, la que más ficheros tenga; empate → la primera).
 *   3. Mueve los ficheros de las demás a la canónica (drive.files.update reparenta:
 *      fileId y enlace NO cambian → documentacion.facturas[] sigue válido SIN tocar BD).
 *   4. Si una duplicada queda vacía, la manda a la papelera.
 *
 * SEGURO E IDEMPOTENTE: re-ejecutar no hace nada si ya hay una única carpeta.
 *
 * USO:
 *   node scripts/consolidar_carpetas_facturas.js            # dry-run (no toca nada)
 *   node scripts/consolidar_carpetas_facturas.js --execute  # fusiona de verdad
 *   node scripts/consolidar_carpetas_facturas.js --limit 5  # solo N expedientes
 *   node scripts/consolidar_carpetas_facturas.js --verbose  # detalle por fichero
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');

// NO requerir reformaUploadService (arrastra whatsappService y cuelga el proceso).
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CANONICO = '5. FACTURAS';
const norm = driveService.normalizeFolderName;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, def) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const OPTS = {
    execute: has('--execute'),
    limit: parseInt(val('--limit', '0'), 10) || Infinity,
    verbose: has('--verbose'),
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function main() {
    log(`\n🗂️  Consolidación de carpetas de facturas → "${CANONICO}"  ${OPTS.execute ? '(EJECUCIÓN REAL)' : '(DRY-RUN — no toca nada)'}\n`);

    const { data: exps, error: expErr } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, oportunidad_id')
        .order('numero_expediente', { ascending: true });
    if (expErr) { console.error('❌ Error leyendo expedientes:', expErr.message); process.exitCode = 1; return; }

    const oppIds = [...new Set((exps || []).map(e => e.oportunidad_id).filter(Boolean))];
    const oppById = new Map();
    for (let i = 0; i < oppIds.length; i += 200) {
        const slice = oppIds.slice(i, i + 200);
        const { data: opps, error } = await supabase
            .from('oportunidades').select('id, datos_calculo').in('id', slice);
        if (error) { console.error('❌ Error leyendo oportunidades:', error.message); process.exitCode = 1; return; }
        (opps || []).forEach(o => oppById.set(o.id, o));
    }

    let procesados = 0, conDuplicado = 0, ficherosMovidos = 0, carpetasBorradas = 0, errores = 0;

    for (const exp of (exps || [])) {
        if (procesados >= OPTS.limit) break;
        const opp = oppById.get(exp.oportunidad_id);
        const dc = opp?.datos_calculo || {};
        const driveFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        const tag = exp.numero_expediente || exp.id;
        if (!driveFolderId) continue;

        procesados++;
        try {
            const items = await driveService.listFiles(driveFolderId);
            const dupFolders = (items || []).filter(f => f.mimeType === FOLDER_MIME && norm(f.name) === norm(CANONICO));
            if (dupFolders.length <= 1) continue; // 0 o 1 carpeta → nada que consolidar

            conDuplicado++;

            // Contar ficheros por carpeta para elegir canónica.
            const withCounts = [];
            for (const fol of dupFolders) {
                const files = (await driveService.listFiles(fol.id)).filter(x => x.mimeType !== FOLDER_MIME);
                withCounts.push({ ...fol, files });
            }
            // Canónica: nombre exacto "5. FACTURAS" > más ficheros > primera.
            withCounts.sort((a, b) => {
                const ax = a.name === CANONICO ? 1 : 0, bx = b.name === CANONICO ? 1 : 0;
                if (ax !== bx) return bx - ax;
                return b.files.length - a.files.length;
            });
            const canon = withCounts[0];
            const otras = withCounts.slice(1);

            log(`📁 ${tag}: ${dupFolders.length} carpetas → canónica "${canon.name}" (${canon.files.length} fich.); fusionar ${otras.map(o => `"${o.name}"(${o.files.length})`).join(', ')}`);

            for (const o of otras) {
                for (const file of o.files) {
                    OPTS.verbose && log(`      · mover ${file.name} (${file.id})`);
                    if (OPTS.execute) {
                        const ok = await driveService.moveFolder(file.id, canon.id);
                        if (ok) ficherosMovidos++; else { errores++; log(`      ❌ no se pudo mover ${file.name}`); }
                        await sleep(200);
                    } else {
                        ficherosMovidos++;
                    }
                }
                // Borrar la carpeta duplicada si queda vacía.
                if (OPTS.execute) {
                    const rest = (await driveService.listFiles(o.id)).filter(x => x.mimeType !== FOLDER_MIME);
                    if (!rest.length) {
                        const ok = await driveService.deleteFile(o.id);
                        if (ok) { carpetasBorradas++; OPTS.verbose && log(`      🗑️  papelera "${o.name}"`); }
                    } else {
                        log(`      ⚠️  "${o.name}" no quedó vacía (${rest.length}) — no se borra`);
                    }
                    await sleep(200);
                } else {
                    carpetasBorradas++;
                }
            }
        } catch (e) {
            errores++;
            console.error(`❌ ${tag}: ${e.message}`);
        }
    }

    log('\n──────────── RESUMEN ────────────');
    log(`Expedientes revisados               : ${procesados}`);
    log(`Con carpetas duplicadas             : ${conDuplicado}`);
    log(`Ficheros ${OPTS.execute ? 'MOVIDOS' : 'que se moverían'}        : ${ficherosMovidos}`);
    log(`Carpetas ${OPTS.execute ? 'BORRADAS' : 'que se borrarían'}      : ${carpetasBorradas}`);
    log(`Errores                             : ${errores}`);
    if (!OPTS.execute) log(`\n👉 Dry-run. Vuelve a lanzar con --execute para consolidar de verdad.`);
    log('');
}

main().catch(e => { console.error('❌ Fallo general:', e); process.exitCode = 1; });
