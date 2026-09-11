#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RENOMBRAR en "10. EXPEDIENTE CAE" las copias guardadas con el nombre del CAMPO.
 *
 * Al validar un documento, la app copia el fichero a la carpeta de auditoría con
 * el nombre `{nº} - {etiqueta}.pdf`. Un slot sin etiqueta en
 * DOCUMENTO_VALIDABLE_LABELS caía al nombre del campo: el Certificado RITE se
 * archivó durante meses como "25RES060_93 - cert rite drive link.pdf", que en la
 * carpeta que audita el verificador no dice qué documento es.
 *
 * Ya no se genera ninguno así (la etiqueta está declarada), pero los ya copiados
 * siguen ahí. Este script los renombra al nombre bueno. Si en la carpeta ya existe
 * un fichero con el nombre bueno, NO se toca: son dos ficheros distintos y decidir
 * cuál vale es de una persona.
 *
 * SEGURO E IDEMPOTENTE: solo renombra, no copia, no borra y no toca Supabase.
 *
 * USO:
 *   node scripts/renombrar_copias_auditoria.js                 # dry-run
 *   node scripts/renombrar_copias_auditoria.js --execute
 *   node scripts/renombrar_copias_auditoria.js --expte 25RES060_93 --execute
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { DOCUMENTO_VALIDABLE_LABELS } = require('../utils/docValidacion');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, def) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const OPTS = { execute: has('--execute'), expte: val('--expte', null) };

const AUDIT = '10. EXPEDIENTE CAE';
const heredado = (field) => field.replace(/_/g, ' ');

(async () => {
    let q = supabase
        .from('expedientes')
        .select('id, numero_expediente, documentacion, oportunidades(datos_calculo)')
        .order('numero_expediente');
    if (OPTS.expte) q = q.eq('numero_expediente', OPTS.expte);
    const { data: exps, error } = await q;
    if (error) { console.error('❌', error.message); process.exit(1); }

    // Solo los slots cuyo nombre heredado difiere del bueno: los demás nunca se
    // copiaron mal.
    const campos = Object.keys(DOCUMENTO_VALIDABLE_LABELS)
        .filter(f => DOCUMENTO_VALIDABLE_LABELS[f] !== heredado(f));

    console.log(`\n${OPTS.execute ? '🚀 EJECUTANDO' : '🔍 SIMULACIÓN (sin --execute no se toca nada)'}`);
    console.log(`   ${exps.length} expedientes · ${campos.length} slots vigilados\n`);

    let tocados = 0, saltados = 0;
    for (const exp of exps) {
        const validados = exp.documentacion?.docs_validados || {};
        const pendientes = campos.filter(f => validados[f]);
        if (!pendientes.length) continue;

        let datos = exp.oportunidades?.datos_calculo || {};
        if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (_) { datos = {}; } }
        const rootId = datos?.drive_folder_id || datos?.inputs?.drive_folder_id;
        if (!rootId) continue;

        let auditId = null;
        try { auditId = await driveService.findSubfolderByNameNormalized(rootId, AUDIT); } catch (_) {}
        if (!auditId) continue;

        for (const field of pendientes) {
            const viejo = `${exp.numero_expediente} - ${heredado(field)}.pdf`;
            const bueno = `${exp.numero_expediente} - ${DOCUMENTO_VALIDABLE_LABELS[field]}.pdf`;
            const viejoId = await driveService.findFileByName(auditId, viejo);
            if (!viejoId) continue;

            if (await driveService.findFileByName(auditId, bueno)) {
                console.log(`⚠️  ${exp.numero_expediente}: existen los DOS ("${viejo}" y "${bueno}") — a mano`);
                saltados++;
                continue;
            }
            console.log(`${OPTS.execute ? '✏️ ' : '· '} ${exp.numero_expediente}: "${viejo}" → "${bueno}"`);
            if (OPTS.execute) await driveService.renameFolder(viejoId, bueno);
            tocados++;
        }
    }

    console.log(`\n${OPTS.execute ? 'Renombrados' : 'Se renombrarían'}: ${tocados}${saltados ? ` · a revisar a mano: ${saltados}` : ''}\n`);
    process.exit(0);
})();
