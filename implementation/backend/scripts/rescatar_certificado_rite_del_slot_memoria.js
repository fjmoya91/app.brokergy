#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SACAR el Certificado RITE del campo de la MEMORIA.
 *
 * Gemelo (y espejo) de `separar_memoria_rite_de_certificado.js`: aquél saca la
 * Memoria del campo del certificado; éste saca el CERTIFICADO del campo de la
 * memoria.
 *
 * POR QUÉ EXISTE. En la fila "Certificado RITE" de Documentación, el control de
 * subir escribía en `cert_rite_signed_link` —que desde el 27/08/2026 significa
 * "Memoria RITE FIRMADA"— y archivaba el fichero como
 * "{nº} - Certificado RITE_fdo.pdf", el mismo nombre que le pone al CERTIFICADO
 * la subida del instalador. Consecuencias medidas:
 *   · la app enseña el certificado como memoria, y en la fila de la memoria;
 *   · si además no había `cert_rite_drive_link`, para el CIFO —que no se emite
 *     sin RITE— y para el parte diario ese RITE no existía;
 *   · y si la memoria firmada de verdad estaba enlazada ahí, la pisa: su fichero
 *     se queda en Drive sin que lo enlace ningún campo.
 *
 * DOS CASOS, y se distinguen solos:
 *   A) `cert_rite_signed_link` con el certificado y `cert_rite_drive_link` VACÍO
 *      → se MUEVE el enlace al campo del certificado y se sella
 *        `cert_rite_aportado_at`. Referencia: 26RES060_119.
 *   B) los DOS llenos y el de la memoria apuntando también a un certificado
 *      → es un DUPLICADO (mismo documento subido dos veces por dos puertas). Se
 *        DESENLAZA, y si en "7. LEGALIZACION RITE" hay una "Memoria RITE_fdo",
 *        se enlaza ésa — que es la que el duplicado había tapado.
 *        Referencia: 26RES080_44 (mismo MD5 en los dos ficheros).
 *
 * NO ADIVINA. Solo actúa cuando el NOMBRE DEL FICHERO en Drive lo declara sin
 * ambigüedad: dice "CERTIFICADO", no dice "MEMORIA" y no es un Word. Cualquier
 * otra cosa se deja como está y se lista para mirarla a mano.
 *
 * El fichero duplicado NO se borra ni se mueve: se deja en Drive y se lista. Un
 * documento del expediente no lo tira un script.
 *
 * SEGURO E IDEMPOTENTE: re-ejecutarlo no hace nada.
 *
 * USO:
 *   node scripts/rescatar_certificado_rite_del_slot_memoria.js            # dry-run
 *   node scripts/rescatar_certificado_rite_del_slot_memoria.js --execute
 *   node scripts/rescatar_certificado_rite_del_slot_memoria.js --verbose
 *   node scripts/rescatar_certificado_rite_del_slot_memoria.js --solo 26RES080_44
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { carpetaDeExpediente } = require('../services/expedienteFolderSync');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, def) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const OPTS = {
    execute: has('--execute'),
    limit: parseInt(val('--limit', '0'), 10) || Infinity,
    solo: val('--solo', null),
    verbose: has('--verbose'),
};

const fileIdDe = (link) => {
    const s = String(link || '');
    const m = s.match(/\/(?:file|document)\/d\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/) || s.match(/[-\w]{25,}/);
    return m ? (m[1] || m[0]) : null;
};

// Solo es concluyente lo que se llama CERTIFICADO y no menciona la memoria. El
// "_fdo" del final no dice nada: se lo ponía la subida de la app a los dos.
function clasificar(nombre) {
    const n = (nombre || '').toUpperCase();
    if (!n) return 'desconocido';
    if (n.endsWith('.DOCX') || n.endsWith('.DOC')) return 'memoria';
    if (n.includes('MEMORIA')) return 'memoria';
    if (n.includes('CERTIFICADO')) return 'certificado';
    return 'desconocido';
}

// La memoria firmada que el duplicado tapó: se busca por su nombre canónico en la
// carpeta del RITE. Si no está, no se inventa nada — el campo queda vacío, que es
// la verdad (esa memoria no la tenemos).
async function buscarMemoriaFirmada(exp) {
    try {
        const folderId = await carpetaDeExpediente(exp);
        if (!folderId) return null;
        const sub = await driveService.findSubfolderByName(folderId, '7. LEGALIZACION RITE');
        if (!sub) return null;
        const files = await driveService.listFiles(sub);
        const hit = (files || []).find(f => /MEMORIA RITE/i.test(f.name || '') && /\.pdf$/i.test(f.name || ''));
        return hit ? { id: hit.id, name: hit.name, link: `https://drive.google.com/file/d/${hit.id}/view?usp=drivesdk` } : null;
    } catch (e) { return null; }
}

// La validación (o el rechazo) se dio sobre el documento equivocado: se retira.
// Dejarla pondría en verde un slot cuyo contenido acaba de cambiar.
function limpiarRevision(doc, campo) {
    const dv = { ...(doc.docs_validados || {}) }; delete dv[campo];
    const dr = { ...(doc.docs_rechazados || {}) }; delete dr[campo];
    return { docs_validados: dv, docs_rechazados: dr };
}

async function main() {
    console.log(`\n📄 Sacar el Certificado RITE del campo de la Memoria  ${OPTS.execute ? '(EJECUCIÓN REAL)' : '(DRY-RUN — no escribe nada)'}\n`);

    const { data: exps, error } = await supabase
        .from('expedientes')
        // `carpetaDeExpediente` resuelve la carpeta desde la oportunidad él solo.
        .select('id, numero_expediente, oportunidad_id, documentacion')
        .order('numero_expediente', { ascending: true });
    if (error) { console.error('❌ Error leyendo expedientes:', error.message); process.exitCode = 1; return; }

    const candidatos = (exps || [])
        .filter(e => (e.documentacion || {}).cert_rite_signed_link)
        .filter(e => !OPTS.solo || e.numero_expediente === OPTS.solo)
        .slice(0, OPTS.limit);

    console.log(`Candidatos (con algo en el campo de la memoria firmada): ${candidatos.length}\n`);
    const resumen = { movidos: 0, duplicados: 0, memoria: 0, desconocido: 0, error: 0 };

    for (const e of candidatos) {
        const doc = e.documentacion || {};
        const fileId = fileIdDe(doc.cert_rite_signed_link);
        let meta = null;
        if (fileId) {
            try { meta = await driveService.getFileMetadata(fileId, 'id, name, createdTime'); }
            catch (err) { meta = null; }
        }
        const clase = fileId && meta ? clasificar(meta.name) : 'error';

        // ⚠️ Tener `cert_rite_drive_link` NO significa tener el certificado: puede
        // ser la MEMORIA, que es el fallo espejo (ver
        // `separar_memoria_rite_de_certificado.js`). Si lo es, esto no es un
        // duplicado sino un INTERCAMBIO — los dos documentos están cruzados—, y
        // desenlazar el del campo de la memoria dejaría el certificado sin enlace
        // en ninguna parte. Medido el 07/09/2026: 7 expedientes se quedaron así al
        // pasar este script y después el espejo.
        let claseActual = null;
        if (clase === 'certificado' && doc.cert_rite_drive_link) {
            const idActual = fileIdDe(doc.cert_rite_drive_link);
            if (idActual === fileId) claseActual = 'certificado';       // el mismo fichero
            else {
                try { claseActual = clasificar((await driveService.getFileMetadata(idActual, 'id, name'))?.name); }
                catch (err) { claseActual = 'desconocido'; }
            }
        }
        const caso = clase !== 'certificado' ? null
            : !doc.cert_rite_drive_link ? 'A'
            : claseActual === 'memoria' ? 'A'   // están cruzados: se intercambian
            : 'B';

        if (clase !== 'certificado') {
            resumen[clase === 'error' ? 'error' : clase]++;
            if (OPTS.verbose || clase === 'error') {
                console.log(`  ${String(e.numero_expediente).padEnd(18)} ${clase.toUpperCase().padEnd(12)} ${meta?.name || '(nombre no legible)'}`);
            }
            continue;
        }

        let next;
        if (caso === 'A') {
            resumen.movidos++;
            const cruzados = claseActual === 'memoria';
            console.log(`  ${String(e.numero_expediente).padEnd(18)} A · ${cruzados ? 'INTERCAMBIAR' : 'MOVER      '} ${meta.name}`);
            if (cruzados) console.log(`  ${''.padEnd(18)}   → lo que había en el campo del certificado era la Memoria: se manda a memoria_rite_docx_link`);
            next = {
                ...doc,
                // Cruzados: la Memoria que ocupaba el campo del certificado va a su
                // sitio, no se tira. Solo si ese campo está libre — nunca se pisa un
                // enlace que ya haya puesto una persona.
                ...(cruzados && !doc.memoria_rite_docx_link ? { memoria_rite_docx_link: doc.cert_rite_drive_link } : {}),
                cert_rite_drive_link: doc.cert_rite_signed_link,
                cert_rite_aportado_at: meta.createdTime || new Date().toISOString(),
                cert_rite_signed_link: null,
                // La revisión viaja CON el documento: se dio sobre este fichero, no
                // sobre el campo. Se traslada al slot al que ahora pertenece.
                docs_validados: (() => { const d2 = { ...(doc.docs_validados || {}) }; if (d2.cert_rite_signed_link) { d2.cert_rite_drive_link = d2.cert_rite_signed_link; delete d2.cert_rite_signed_link; } return d2; })(),
                docs_rechazados: (() => { const d2 = { ...(doc.docs_rechazados || {}) }; if (d2.cert_rite_signed_link) { d2.cert_rite_drive_link = d2.cert_rite_signed_link; delete d2.cert_rite_signed_link; } return d2; })(),
            };
        } else {
            resumen.duplicados++;
            const memoria = await buscarMemoriaFirmada(e);
            const mismo = fileIdDe(doc.cert_rite_drive_link) === fileId;
            console.log(`  ${String(e.numero_expediente).padEnd(18)} B · DUPLICADO  ${meta.name}${mismo ? ' (el MISMO fichero que el certificado)' : ''}`);
            console.log(`  ${''.padEnd(18)}   ${memoria ? `→ se enlaza la memoria firmada: ${memoria.name}` : '→ no hay memoria firmada en la carpeta: el campo queda vacío'}`);
            next = {
                ...doc,
                cert_rite_signed_link: memoria ? memoria.link : null,
                ...limpiarRevision(doc, 'cert_rite_signed_link'),
            };
        }

        if (!OPTS.execute) continue;
        const { error: upErr } = await supabase.from('expedientes')
            .update({ documentacion: next, updated_at: new Date().toISOString() })
            .eq('id', e.id);
        if (upErr) console.error(`    ❌ ${e.numero_expediente}: ${upErr.message}`);
        else console.log(`    ✓ ${e.numero_expediente} actualizado`);
    }

    console.log(`\nResumen — caso A (certificado movido a su campo): ${resumen.movidos} · caso B (duplicado desenlazado): ${resumen.duplicados} · memorias de verdad (se dejan): ${resumen.memoria} · sin clasificar (a mano): ${resumen.desconocido} · ilegibles: ${resumen.error}`);
    if (!OPTS.execute) console.log('\n(dry-run) Vuelve a lanzarlo con --execute para aplicar los cambios.\n');
}

main().catch(e => { console.error(e); process.exitCode = 1; });
