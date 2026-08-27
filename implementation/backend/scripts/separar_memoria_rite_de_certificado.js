#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SEPARAR la Memoria RITE del Certificado RITE en `documentacion`.
 *
 * Hasta 2026-08-27, `POST /memoria-rite/generate` guardaba la Memoria (Word) que
 * generamos NOSOTROS en `documentacion.cert_rite_drive_link` — que es justo el
 * campo donde la subida pública deja el CERTIFICADO RITE que nos devuelve el
 * instalador. Consecuencias reales:
 *   · generar la memoria dejaba el expediente diciendo que el RITE ya estaba
 *     aportado, y con él vía libre para emitir el CIFO ("el CIFO no se emite sin
 *     RITE" era, en la práctica, "sin haber generado la memoria");
 *   · si después el instalador subía el certificado, el enlace de la memoria se
 *     perdía sin dejar rastro.
 *
 * Desde el cambio, la memoria vive en `memoria_rite_docx_link`. Este script
 * deshace la ambigüedad de los expedientes anteriores mirando el NOMBRE DEL
 * FICHERO en Drive: si `cert_rite_drive_link` apunta a un ".docx" o a algo que se
 * llama "Memoria", se mueve a `memoria_rite_docx_link` y el campo del certificado
 * queda vacío (que es la verdad: ese RITE no lo tenemos).
 *
 * No adivina: si el fichero no se puede leer o el nombre no es concluyente, LO
 * DEJA COMO ESTÁ y lo lista como "a revisar a mano". Ver la fuente única de la
 * heurística en frontend/src/features/expedientes/logic/instaladorPendientes.js.
 *
 * SEGURO E IDEMPOTENTE: solo toca expedientes con `cert_rite_drive_link` y sin
 * `memoria_rite_docx_link`. Re-ejecutarlo no hace nada.
 *
 * USO:
 *   node scripts/separar_memoria_rite_de_certificado.js            # dry-run
 *   node scripts/separar_memoria_rite_de_certificado.js --execute
 *   node scripts/separar_memoria_rite_de_certificado.js --limit 5 --verbose
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, def) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const OPTS = {
    execute: has('--execute'),
    limit: parseInt(val('--limit', '0'), 10) || Infinity,
    verbose: has('--verbose'),
};

const fileIdDe = (link) => {
    const s = String(link || '');
    const m = s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/) || s.match(/[-\w]{25,}/);
    return m ? (m[1] || m[0]) : null;
};

// El nombre manda, y solo el WORD es concluyente: la memoria que genera el
// microservicio es un .docx, y ningún instalador nos devuelve el RITE en Word.
// Un PDF llamado "Memoria" NO se toca: puede ser la memoria FIRMADA que alguien
// subió a mano como enlace del RITE (visto: "Copy of Memoria Ricardo.pdf" en
// 25RES060_67), y vaciar ese campo borraría la única prueba del RITE que tenemos.
function clasificar(nombre) {
    const n = (nombre || '').toUpperCase();
    if (!n) return 'desconocido';
    if (n.endsWith('.DOCX') || n.endsWith('.DOC')) return 'memoria';
    if (n.includes('CERTIFICADO')) return 'certificado';
    return 'desconocido';
}

async function main() {
    console.log(`\n📄 Separar Memoria RITE / Certificado RITE  ${OPTS.execute ? '(EJECUCIÓN REAL)' : '(DRY-RUN — no escribe nada)'}\n`);

    const { data: exps, error } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, documentacion')
        .order('numero_expediente', { ascending: true });
    if (error) { console.error('❌ Error leyendo expedientes:', error.message); process.exitCode = 1; return; }

    const candidatos = (exps || []).filter(e => {
        const d = e.documentacion || {};
        return d.cert_rite_drive_link && !d.memoria_rite_docx_link;
    }).slice(0, OPTS.limit);

    console.log(`Candidatos: ${candidatos.length}\n`);
    const resumen = { memoria: 0, certificado: 0, desconocido: 0, error: 0 };

    for (const e of candidatos) {
        const doc = e.documentacion || {};
        const fileId = fileIdDe(doc.cert_rite_drive_link);
        let nombre = null;
        if (fileId) {
            try { nombre = (await driveService.getFileMetadata(fileId, 'id, name'))?.name || null; }
            catch (err) { nombre = null; }
        }
        const clase = fileId ? clasificar(nombre) : 'error';
        resumen[clase === 'error' ? 'error' : clase]++;

        if (OPTS.verbose || clase !== 'certificado') {
            console.log(`  ${e.numero_expediente.padEnd(18)} ${clase.toUpperCase().padEnd(12)} ${nombre || '(nombre no legible)'}`);
        }

        if (clase !== 'memoria') continue;   // solo se mueve lo que SEGURO es la memoria

        if (!OPTS.execute) continue;
        const next = {
            ...doc,
            memoria_rite_docx_link: doc.cert_rite_drive_link,
            cert_rite_drive_link: null,
        };
        const { error: upErr } = await supabase.from('expedientes')
            .update({ documentacion: next, updated_at: new Date().toISOString() })
            .eq('id', e.id);
        if (upErr) console.error(`    ❌ ${e.numero_expediente}: ${upErr.message}`);
    }

    console.log(`\nResumen — memoria: ${resumen.memoria} · certificado (se deja): ${resumen.certificado} · sin clasificar (a revisar a mano): ${resumen.desconocido} · ilegibles: ${resumen.error}`);
    if (!OPTS.execute) console.log('\n(dry-run) Vuelve a lanzarlo con --execute para aplicar los cambios.\n');
}

main().catch(e => { console.error(e); process.exitCode = 1; });
