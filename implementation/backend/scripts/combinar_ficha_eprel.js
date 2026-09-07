// ============================================================================
// combinar_ficha_eprel.js — la ficha técnica del CATÁLOGO lleva también el EPREL
// ----------------------------------------------------------------------------
// `aerotermia.ficha_tecnica` es de donde sale el anexo del CIFO: la ruta
// POST /:id/fichas-tecnicas/auto-copy copia ESE fichero a la carpeta del
// expediente. Si ahí solo está la ficha comercial del fabricante, el verificador
// se queda sin lo que ACREDITA el SCOP declarado — la ficha del producto del
// Reglamento (UE) 811/2013 y la etiqueta energética, que son los documentos
// oficiales del registro EPREL.
//
// Hasta ahora eso se resolvía a mano, expediente por expediente: se bajaban del
// EPREL y se subían como anexos extra del CIFO (medido en 26RES060_119). Este
// script lo arregla EN EL ORIGEN — un solo PDF por modelo, en el mismo orden en
// el que ya se venían anexando:
//
//     ficha técnica del fabricante → ficha del producto EPREL → etiqueta EPREL
//
// El PDF combinado se sube JUNTO a los originales (no los reemplaza ni los
// borra) y `ficha_tecnica` pasa a apuntar a él. A partir de ahí, cualquier
// expediente nuevo con ese modelo recibe el anexo completo sin tocar nada.
//
// Uso:
//   node scripts/combinar_ficha_eprel.js --id 83              (simulación)
//   node scripts/combinar_ficha_eprel.js --id 83 --execute
//
// Los dos documentos del EPREL se buscan SOLOS en la carpeta de Drive donde vive
// la ficha técnica actual del modelo ("Fiche_*" la ficha, "Label_*" la etiqueta).
// Se pueden fijar a mano con --fiche <driveId> / --label <driveId>, y omitir con
// --sin-fiche / --sin-label.
// ============================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PDFDocument } = require('pdf-lib');
const { google } = require('googleapis');
const supabase = require('../services/supabaseClient');
const { getFileContent, getFileMetadata, saveFileToFolder } = require('../services/driveService');

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n) => args.includes(n);

const ID = flag('--id');
const EXECUTE = has('--execute');

if (!ID) {
    console.error('Falta --id <id de la fila de aerotermia>');
    process.exit(1);
}

/** El fileId de Drive dentro de cualquiera de las formas de URL que guarda el catálogo. */
function driveIdFrom(url) {
    const s = String(url || '');
    const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m && m[1] ? m[1] : null;
}

/** Los PDF que acompañan a la ficha técnica en su misma carpeta de Drive. */
async function hermanos(folderId) {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });
    const { data } = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`,
        fields: 'files(id, name)',
        pageSize: 100,
    });
    return data.files || [];
}

const esFiche = (n) => /^(fiche|ficha[_\s-]*producto|product[_\s-]*fiche)/i.test(n) || /fiche[_\s-]*\d+/i.test(n);
const esLabel = (n) => /^(label|etiqueta)/i.test(n) || /label[_\s-]*\d+/i.test(n);

(async () => {
    const { data: eq, error } = await supabase
        .from('aerotermia')
        .select('id, marca, modelo_comercial, modelo_conjunto, modelo_ud_exterior, eprel, ficha_tecnica')
        .eq('id', ID)
        .single();
    if (error || !eq) { console.error('Modelo no encontrado:', error && error.message); process.exit(1); }

    const modelo = eq.modelo_comercial || eq.modelo_conjunto || `id=${eq.id}`;
    console.log(`\nModelo ${eq.id} · ${eq.marca} ${modelo}`);
    console.log(`  EPREL         : ${eq.eprel || '—'}`);
    console.log(`  ficha_tecnica : ${eq.ficha_tecnica || '—'}`);

    const ftId = flag('--ft') || driveIdFrom(eq.ficha_tecnica);
    if (!ftId) {
        console.error('\nLa ficha técnica del catálogo no es un fichero de Drive; pásalo con --ft <driveId>.');
        process.exit(1);
    }

    const ftMeta = await getFileMetadata(ftId, 'id, name, parents');
    const folderId = ftMeta && ftMeta.parents && ftMeta.parents[0];
    if (!folderId) { console.error('No se pudo resolver la carpeta de la ficha técnica.'); process.exit(1); }

    let ficheId = has('--sin-fiche') ? null : flag('--fiche');
    let labelId = has('--sin-label') ? null : flag('--label');
    if ((!ficheId && !has('--sin-fiche')) || (!labelId && !has('--sin-label'))) {
        const sibs = await hermanos(folderId);
        if (!ficheId && !has('--sin-fiche')) {
            const f = sibs.find(x => x.id !== ftId && esFiche(x.name));
            ficheId = f ? f.id : null;
        }
        if (!labelId && !has('--sin-label')) {
            const l = sibs.find(x => x.id !== ftId && esLabel(x.name));
            labelId = l ? l.id : null;
        }
        const folderMeta = await getFileMetadata(folderId);
        console.log(`\nEn la carpeta "${(folderMeta && folderMeta.name) || folderId}":`);
        sibs.forEach(f => {
            const marca = f.id === ftId ? '   ← ficha técnica'
                : f.id === ficheId ? '   ← ficha EPREL'
                    : f.id === labelId ? '   ← etiqueta EPREL' : '';
            console.log(`  · ${f.name}${marca}`);
        });
    }

    if (!ficheId && !labelId) {
        console.error('\nNo hay nada del EPREL que añadir: no se ha encontrado ni la ficha ni la etiqueta.');
        process.exit(1);
    }

    // El orden NO es arbitrario: es el mismo con el que se venían anexando a mano
    // al CIFO (ficha del fabricante → ficha del producto EPREL → etiqueta).
    const partes = [
        { rotulo: 'Ficha técnica del fabricante', id: ftId },
        ficheId ? { rotulo: 'Ficha del producto (EPREL)', id: ficheId } : null,
        labelId ? { rotulo: 'Etiqueta energética (EPREL)', id: labelId } : null,
    ].filter(Boolean);

    const merged = await PDFDocument.create();
    console.log('');
    for (const p of partes) {
        const buf = await getFileContent(p.id);
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach(pg => merged.addPage(pg));
        console.log(`  + ${p.rotulo}: ${doc.getPageCount()} pág. (${buf.length} bytes)`);
    }

    const out = Buffer.from(await merged.save());
    const fileName = `${eq.marca} ${modelo} - FT + EPREL.pdf`;
    console.log(`\n  = ${fileName}: ${merged.getPageCount()} páginas, ${out.length} bytes`);

    if (!EXECUTE) {
        console.log('\n[SIMULACIÓN] No se ha subido nada ni se ha tocado la base de datos.');
        console.log('Repite con --execute para subirlo y apuntar ficha_tecnica al combinado.');
        return;
    }

    const res = await saveFileToFolder(folderId, fileName, 'application/pdf', out, { throwOnError: true });
    const { error: upErr } = await supabase
        .from('aerotermia')
        .update({ ficha_tecnica: res.link })
        .eq('id', eq.id);
    if (upErr) { console.error('Subido a Drive pero NO se pudo actualizar la BD:', upErr.message); process.exit(1); }

    console.log(`\n✅ Subido: ${res.link}`);
    console.log(`✅ aerotermia.id=${eq.id}.ficha_tecnica actualizado.`);
    console.log(`   (la ficha anterior sigue en Drive: ${ftId})`);
})();
