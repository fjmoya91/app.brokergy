#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN: facturas antiguas del popup → carpeta Drive "5.FACTURAS".
 *
 * Histórico: las facturas subidas por el cliente/instalador en el popup
 * (slot DOC_FACTURAS) aterrizaban en "12. DOCUMENTOS PARA CEE". Desde 2026-06-17
 * todas las facturas (admin y popup) van a "5.FACTURAS". Este script mueve las
 * antiguas para dejarlo unificado.
 *
 * SEGURO E IDEMPOTENTE:
 *   - Mueve con drive.files.update (addParents/removeParents): el fileId y el
 *     enlace (webViewLink) NO cambian → documentacion.facturas[] y
 *     reforma_uploads.DOC_FACTURAS siguen válidos SIN tocar la BD.
 *   - Solo mueve ficheros cuyo nombre case con el slot (DOC_FACTURAS / DOC_FACTURAS_N).
 *   - Re-ejecutar no hace nada: si ya no quedan facturas en "12. DOCUMENTOS PARA CEE"
 *     para ese expediente, se salta.
 *
 * USO:
 *   node scripts/migrar_facturas_a_5facturas.js              # dry-run (NO mueve nada)
 *   node scripts/migrar_facturas_a_5facturas.js --execute    # mueve de verdad
 *   node scripts/migrar_facturas_a_5facturas.js --limit 5    # solo N expedientes
 *   node scripts/migrar_facturas_a_5facturas.js --verbose    # detalle por fichero
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');

// NO requerimos reformaUploadService: arrastra whatsappService (auto-conecta y deja
// el proceso colgado). Replicamos aquí las constantes y el helper que necesitamos.
const SUBCARPETA_DOCS = '12. DOCUMENTOS PARA CEE';
const SUBCARPETA_FACTURAS = '5.FACTURAS';
// ¿El fichero `fileName` pertenece al slot `slotKey`? (exacto o `slotKey_N`)
function fileBelongsToSlot(fileName, slotKey) {
    const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
    if (base === slotKey) return true;
    if (base.startsWith(slotKey + '_')) return /^\d+$/.test(base.slice(slotKey.length + 1));
    return false;
}

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
    log(`\n🧾 Migración de facturas → "${SUBCARPETA_FACTURAS}"  ${OPTS.execute ? '(EJECUCIÓN REAL)' : '(DRY-RUN — no mueve nada)'}\n`);

    // Las facturas solo existen en expedientes (post-aceptación). Iteramos expedientes
    // y traemos la datos_calculo de su oportunidad en un único query.
    const { data: exps, error: expErr } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, oportunidad_id')
        .order('numero_expediente', { ascending: true });
    if (expErr) { console.error('❌ Error leyendo expedientes:', expErr.message); process.exitCode = 1; return; }

    const oppIds = [...new Set((exps || []).map(e => e.oportunidad_id).filter(Boolean))];
    const oppById = new Map();
    // Traer datos_calculo en lotes (evita un IN gigante).
    for (let i = 0; i < oppIds.length; i += 200) {
        const slice = oppIds.slice(i, i + 200);
        const { data: opps, error } = await supabase
            .from('oportunidades')
            .select('id, datos_calculo')
            .in('id', slice);
        if (error) { console.error('❌ Error leyendo oportunidades:', error.message); process.exitCode = 1; return; }
        (opps || []).forEach(o => oppById.set(o.id, o));
    }

    let procesados = 0, conFacturas = 0, movidos = 0, errores = 0, saltados = 0;
    const resumen = [];

    for (const exp of (exps || [])) {
        if (procesados >= OPTS.limit) break;
        const opp = oppById.get(exp.oportunidad_id);
        const dc = opp?.datos_calculo || {};
        const slotEntries = Array.isArray(dc?.reforma_uploads?.DOC_FACTURAS) ? dc.reforma_uploads.DOC_FACTURAS : [];
        if (!slotEntries.length) continue; // este expediente nunca tuvo facturas por popup

        procesados++;
        conFacturas++;
        const driveFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        const tag = exp.numero_expediente || exp.id;
        if (!driveFolderId) { log(`⚠️  ${tag}: sin carpeta Drive — salto`); saltados++; continue; }

        try {
            const docsFolderId = await driveService.findSubfolderByName(driveFolderId, SUBCARPETA_DOCS);
            if (!docsFolderId) { OPTS.verbose && log(`   ${tag}: no existe "${SUBCARPETA_DOCS}" — nada que mover`); saltados++; continue; }

            const files = await driveService.listFiles(docsFolderId);
            const facturas = (files || []).filter(f => fileBelongsToSlot(f.name, 'DOC_FACTURAS'));
            if (!facturas.length) { OPTS.verbose && log(`   ${tag}: ya migrado (0 facturas en "${SUBCARPETA_DOCS}")`); saltados++; continue; }

            log(`📦 ${tag}: ${facturas.length} factura(s) a mover desde "${SUBCARPETA_DOCS}" → "${SUBCARPETA_FACTURAS}"`);
            facturas.forEach(f => OPTS.verbose && log(`      · ${f.name}  (${f.id})`));

            if (OPTS.execute) {
                const facturasFolderId = await driveService.getOrCreateSubfolder(driveFolderId, SUBCARPETA_FACTURAS);
                for (const f of facturas) {
                    const ok = await driveService.moveFolder(f.id, facturasFolderId);
                    if (ok) { movidos++; } else { errores++; log(`      ❌ no se pudo mover ${f.name}`); }
                    await sleep(250); // gentil con la API de Drive
                }
            } else {
                movidos += facturas.length; // contabilizado como "se movería"
            }
            resumen.push({ exp: tag, n: facturas.length });
        } catch (e) {
            errores++;
            console.error(`❌ ${tag}: ${e.message}`);
        }
    }

    log('\n──────────── RESUMEN ────────────');
    log(`Expedientes con facturas de popup : ${conFacturas}`);
    log(`Expedientes con algo que mover     : ${resumen.length}`);
    log(`Ficheros ${OPTS.execute ? 'MOVIDOS' : 'que se moverían'}        : ${movidos}`);
    log(`Saltados (sin nada que mover)      : ${saltados}`);
    log(`Errores                            : ${errores}`);
    if (!OPTS.execute) log(`\n👉 Dry-run. Vuelve a lanzar con --execute para mover de verdad.`);
    log('');
}

main().catch(e => { console.error('❌ Fallo general:', e); process.exitCode = 1; });
