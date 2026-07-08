#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RENOMBRADO: ficheros del CERTIFICADO RITE firmado (campo cert_rite_signed_link)
 * que se guardaron con el nombre INCORRECTO "Memoria RITE" (bug ya corregido en
 * el código: DocumentacionModule.jsx / routes/expedientes.js).
 *
 * cert_rite_signed_link es el Certificado RITE firmado que sube el instalador,
 * DISTINTO de cert_rite_drive_link (la Memoria RITE generada). Este script
 * renombra en Drive (mismo fileId, el enlace guardado en BD no cambia):
 *   - "{nº expte} - Memoria RITE_fdo.pdf"  en "7. LEGALIZACION RITE"
 *   - "{nº expte} - Memoria RITE.pdf"      en "10. EXPEDIENTE CAE"
 * a "... Certificado RITE_fdo.pdf" / "... Certificado RITE.pdf" respectivamente.
 *
 * SEGURO E IDEMPOTENTE: solo actúa sobre expedientes con cert_rite_signed_link
 * definido; re-ejecutar no hace nada si ya no queda ningún fichero con el
 * nombre antiguo.
 *
 * USO:
 *   node scripts/renombrar_memoria_rite_a_certificado.js            # dry-run
 *   node scripts/renombrar_memoria_rite_a_certificado.js --execute  # renombra de verdad
 *   node scripts/renombrar_memoria_rite_a_certificado.js --limit 5
 *   node scripts/renombrar_memoria_rite_a_certificado.js --verbose
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');

const SUBCARPETA_RITE = '7. LEGALIZACION RITE';
const SUBCARPETA_AUDITORIA = '10. EXPEDIENTE CAE';

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
    log(`\n📄 Renombrado "Memoria RITE" → "Certificado RITE"  ${OPTS.execute ? '(EJECUCIÓN REAL)' : '(DRY-RUN — no renombra nada)'}\n`);

    const { data: exps, error: expErr } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, oportunidad_id, documentacion')
        .order('numero_expediente', { ascending: true });
    if (expErr) { console.error('❌ Error leyendo expedientes:', expErr.message); process.exitCode = 1; return; }

    const conCertificado = (exps || []).filter(e => e.documentacion?.cert_rite_signed_link);

    const oppIds = [...new Set(conCertificado.map(e => e.oportunidad_id).filter(Boolean))];
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

    let procesados = 0, renombrados = 0, errores = 0, saltados = 0;
    const resumen = [];

    for (const exp of conCertificado) {
        if (procesados >= OPTS.limit) break;
        const tag = exp.numero_expediente || exp.id;

        const opp = oppById.get(exp.oportunidad_id);
        let dc = opp?.datos_calculo || {};
        if (typeof dc === 'string') { try { dc = JSON.parse(dc); } catch (e) { dc = {}; } }
        const driveFolderId = dc?.drive_folder_id || dc?.inputs?.drive_folder_id;
        if (!driveFolderId) { OPTS.verbose && log(`⚠️  ${tag}: sin carpeta Drive — salto`); saltados++; continue; }

        procesados++;

        try {
            const targets = [
                { sub: SUBCARPETA_RITE, oldName: `${tag} - Memoria RITE_fdo.pdf`, newName: `${tag} - Certificado RITE_fdo.pdf` },
                { sub: SUBCARPETA_AUDITORIA, oldName: `${tag} - Memoria RITE.pdf`, newName: `${tag} - Certificado RITE.pdf` },
            ];

            let algo = false;
            for (const t of targets) {
                const subId = await driveService.findSubfolderByName(driveFolderId, t.sub);
                if (!subId) continue;
                const fileId = await driveService.findFileByName(subId, t.oldName);
                if (!fileId) continue;

                algo = true;
                log(`✏️  ${tag}: "${t.oldName}" → "${t.newName}"  (${t.sub})`);
                if (OPTS.execute) {
                    const ok = await driveService.renameFolder(fileId, t.newName);
                    if (ok) renombrados++; else { errores++; log(`   ❌ no se pudo renombrar`); }
                    await sleep(250);
                } else {
                    renombrados++;
                }
            }
            if (algo) resumen.push(tag); else OPTS.verbose && log(`   ${tag}: ya correcto — nada que renombrar`);
            if (!algo) saltados++;
        } catch (e) {
            errores++;
            console.error(`❌ ${tag}: ${e.message}`);
        }
    }

    log('\n──────────── RESUMEN ────────────');
    log(`Expedientes con Certificado RITE firmado : ${conCertificado.length}`);
    log(`Expedientes con algo que renombrar        : ${resumen.length}`);
    log(`Ficheros ${OPTS.execute ? 'RENOMBRADOS' : 'que se renombrarían'}             : ${renombrados}`);
    log(`Saltados (ya correcto / sin carpeta)      : ${saltados}`);
    log(`Errores                                   : ${errores}`);
    if (!OPTS.execute) log(`\n👉 Dry-run. Vuelve a lanzar con --execute para renombrar de verdad.`);
    log('');
}

main().catch(e => { console.error('❌ Fallo general:', e); process.exitCode = 1; });
