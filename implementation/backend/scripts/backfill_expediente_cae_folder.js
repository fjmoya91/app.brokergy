#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKFILL: documentación ya validada → carpeta de auditoría "10. EXPEDIENTE CAE".
 *
 * Desde ahora, validar un documento firmado (Anexo I, Cesión, Ficha RES, CIFO/
 * RES080, Anexo Fotográfico, RITE) o generar el PDF único de facturas copia el
 * fichero a "10. EXPEDIENTE CAE" (ver POST /:id/documentos/validar y
 * /:id/facturas/generar-pdf en routes/expedientes.js). Este script hace ese mismo
 * backfill para los expedientes que YA tenían documentos validados / facturas
 * combinadas ANTES de que existiera esa lógica.
 *
 * SEGURO E IDEMPOTENTE:
 *   - COPIA (no mueve): el original sigue intacto en su carpeta habitual.
 *   - Si en "10. EXPEDIENTE CAE" ya existe un fichero con el mismo nombre final,
 *     se salta (no duplica). Volver a ejecutar el script no hace nada nuevo.
 *
 * USO:
 *   node scripts/backfill_expediente_cae_folder.js              # dry-run (NO copia nada)
 *   node scripts/backfill_expediente_cae_folder.js --execute    # copia de verdad
 *   node scripts/backfill_expediente_cae_folder.js --limit 5    # solo N expedientes
 *   node scripts/backfill_expediente_cae_folder.js --verbose    # detalle por fichero
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');

const AUDIT_FOLDER_NAME = '10. EXPEDIENTE CAE';

// Mismo mapeo que POST /:id/documentos/validar (routes/expedientes.js) — mantener
// sincronizado si se añade un nuevo documento validable.
const DOCUMENTO_VALIDABLE_LABELS = {
    anexo_i_signed_link: 'Anexo I',
    anexo_cesion_signed_link: 'Anexo Cesión de Ahorro',
    cert_cifo_signed_link: 'Certificado CIFO',
    ficha_res060_signed_link: 'Ficha RES',
    anexo_fotografico_signed_link: 'Anexo Fotográfico',
    cert_rite_signed_link: 'Certificado RITE',
};

function extractDriveFileId(link) {
    if (!link) return null;
    const s = String(link);
    const m = s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/) || s.match(/\/folders\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
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
    log(`\n🗂️  Backfill de documentación validada → "${AUDIT_FOLDER_NAME}"  ${OPTS.execute ? '(EJECUCIÓN REAL)' : '(DRY-RUN — no copia nada)'}\n`);

    // OJO: "expedientes" NO tiene columna drive_folder_id propia (vive en
    // datos_calculo de la oportunidad) — no seleccionarla explícitamente.
    const { data: exps, error: expErr } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, oportunidad_id, documentacion')
        .order('numero_expediente', { ascending: true });
    if (expErr) { console.error('❌ Error leyendo expedientes:', expErr.message); process.exitCode = 1; return; }

    const oppIds = [...new Set((exps || []).map(e => e.oportunidad_id).filter(Boolean))];
    const oppById = new Map();
    for (let i = 0; i < oppIds.length; i += 200) {
        const slice = oppIds.slice(i, i + 200);
        const { data: opps, error } = await supabase
            .from('oportunidades')
            .select('id, datos_calculo')
            .in('id', slice);
        if (error) { console.error('❌ Error leyendo oportunidades:', error.message); process.exitCode = 1; return; }
        (opps || []).forEach(o => oppById.set(o.id, o));
    }

    let procesados = 0, conAlgoQueCopiar = 0, copiados = 0, saltados = 0, errores = 0;
    const resumen = [];

    for (const exp of (exps || [])) {
        if (procesados >= OPTS.limit) break;
        const doc = exp.documentacion || {};
        const validados = doc.docs_validados || {};
        const pendientes = []; // [{ name, sourceFileId }]

        // 1) Documentos firmados validados
        for (const field of Object.keys(DOCUMENTO_VALIDABLE_LABELS)) {
            if (!validados[field]) continue; // solo los ya validados
            const link = doc[field];
            const fileId = extractDriveFileId(link);
            if (!fileId) continue;
            const baseName = DOCUMENTO_VALIDABLE_LABELS[field];
            pendientes.push({ name: `${exp.numero_expediente || ''} - ${baseName}.pdf`.trim(), sourceFileId: fileId });
        }

        // 2) PDF único de facturas (ya combinado y guardado)
        if (doc.facturas_combined_link) {
            const fileId = extractDriveFileId(doc.facturas_combined_link);
            if (fileId) {
                pendientes.push({ name: `${exp.numero_expediente || ''} - FACTURAS.pdf`.trim(), sourceFileId: fileId });
            }
        }

        if (!pendientes.length) continue; // nada validado en este expediente

        procesados++;
        conAlgoQueCopiar++;
        const opp = oppById.get(exp.oportunidad_id);
        const dc = opp?.datos_calculo || {};
        const driveFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        const tag = exp.numero_expediente || exp.id;
        if (!driveFolderId) { log(`⚠️  ${tag}: sin carpeta Drive — salto`); saltados++; continue; }

        try {
            const auditFolderId = await driveService.getOrCreateSubfolderNormalized(driveFolderId, AUDIT_FOLDER_NAME);
            const existentes = await driveService.listFiles(auditFolderId);
            const existentesNombres = new Set((existentes || []).map(f => f.name));

            const aCopiar = pendientes.filter(p => !existentesNombres.has(p.name));
            if (!aCopiar.length) { OPTS.verbose && log(`   ${tag}: ya estaba todo copiado (${pendientes.length} doc(s))`); saltados++; continue; }

            log(`📄 ${tag}: ${aCopiar.length} documento(s) a copiar → "${AUDIT_FOLDER_NAME}"`);
            aCopiar.forEach(p => OPTS.verbose && log(`      · ${p.name}`));

            if (OPTS.execute) {
                for (const p of aCopiar) {
                    const copied = await driveService.copyFile(p.sourceFileId, auditFolderId, p.name);
                    if (copied?.id) { copiados++; } else { errores++; log(`      ❌ no se pudo copiar ${p.name}`); }
                    await sleep(250); // gentil con la API de Drive
                }
            } else {
                copiados += aCopiar.length; // contabilizado como "se copiaría"
            }
            resumen.push({ exp: tag, n: aCopiar.length });
        } catch (e) {
            errores++;
            console.error(`❌ ${tag}: ${e.message}`);
        }
    }

    log('\n──────────── RESUMEN ────────────');
    log(`Expedientes con documentación validada : ${conAlgoQueCopiar}`);
    log(`Expedientes con algo que copiar          : ${resumen.length}`);
    log(`Ficheros ${OPTS.execute ? 'COPIADOS' : 'que se copiarían'}                : ${copiados}`);
    log(`Saltados (ya al día / sin carpeta Drive) : ${saltados}`);
    log(`Errores                                  : ${errores}`);
    if (!OPTS.execute) log(`\n👉 Dry-run. Vuelve a lanzar con --execute para copiar de verdad.`);
    log('');
}

main().catch(e => { console.error('❌ Fallo general:', e); process.exitCode = 1; });
