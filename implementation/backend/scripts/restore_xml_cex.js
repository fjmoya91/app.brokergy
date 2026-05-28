// Script de recuperación: busca .xml y .cex en TODA la jerarquía de la carpeta del expediente
// y los asigna a los slots correspondientes si están vacíos.
// Heurística:
//   - Si encuentra UN solo XML → INICIAL.xml
//   - Si encuentra UN solo CEX → INICIAL.cex
//   - Si encuentra DOS XML (uno con "FINAL" en el nombre) → INICIAL/FINAL en consecuencia
//   - Si encuentra DOS CEX (idem) → INICIAL/FINAL
// Uso: node scripts/restore_xml_cex.js [--dry-run] [--exp <numero_expediente>]
require('dotenv').config();

const supabase = require('../services/supabaseClient');
const driveSvc = require('../services/driveService');
const { google } = require('googleapis');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_EXP = (() => {
    const i = args.indexOf('--exp');
    return i >= 0 ? args[i + 1] : null;
})();

const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
);
oauth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth });

async function listAllRecursive(folderId, depth = 0) {
    // Devuelve TODOS los archivos no-carpeta dentro de la jerarquía, con su path
    if (depth > 5) return [];
    const out = [];
    try {
        const resp = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id,name,mimeType,webViewLink,parents)',
            pageSize: 200
        });
        for (const f of (resp.data.files || [])) {
            if (f.mimeType === 'application/vnd.google-apps.folder') {
                // Saltar carpetas OLD para no recuperar archivos ya archivados
                if (f.name.toUpperCase() === 'OLD') continue;
                const sub = await listAllRecursive(f.id, depth + 1);
                out.push(...sub);
            } else {
                out.push(f);
            }
        }
    } catch (err) {
        console.error(`Error listando ${folderId}:`, err.message);
    }
    return out;
}

function classifySection(filename) {
    const upper = (filename || '').toUpperCase();
    if (upper.includes('FINAL') || upper.includes('PREVISTO')) return 'final';
    return 'inicial'; // default
}

(async () => {
    console.log(`[restore-xml-cex] DRY_RUN=${DRY_RUN} ONLY_EXP=${ONLY_EXP || '(todos)'}`);

    let q = supabase.from('expedientes').select('id, numero_expediente, oportunidad_id, cee');
    if (ONLY_EXP) q = q.eq('numero_expediente', ONLY_EXP);
    const { data: expedientes, error } = await q;
    if (error) { console.error(error); process.exit(1); }
    console.log(`[restore-xml-cex] ${expedientes.length} expedientes a revisar`);

    let totalCheck = 0, totalUpd = 0;

    for (const exp of expedientes) {
        const ceeFiles = exp.cee?.cee_files;
        if (!ceeFiles) continue;

        const ini = ceeFiles.inicial || {};
        const fin = ceeFiles.final || {};
        const needsXml = !ini.xml || !fin.xml;
        const needsCex = !ini.cex || !fin.cex;
        if (!needsXml && !needsCex) continue;
        totalCheck++;

        console.log(`\n=== Expediente ${exp.numero_expediente} (id=${exp.id}) ===`);

        // Drive folder
        const { data: op } = await supabase
            .from('oportunidades').select('*').eq('id', exp.oportunidad_id).single();
        let dc = op?.datos_calculo || {};
        if (typeof dc === 'string') { try { dc = JSON.parse(dc); } catch (e) { dc = {}; } }
        let driveFolderId = op?.drive_folder_id || op?.drive_folder_link || dc?.drive_folder_id || dc?.inputs?.drive_folder_id;
        if (driveFolderId && typeof driveFolderId === 'string' && driveFolderId.startsWith('http')) {
            const m = driveFolderId.match(/\/folders\/([-\w]{20,})/) || driveFolderId.match(/[-\w]{25,}/);
            driveFolderId = m ? m[1] || m[0] : null;
        }
        if (!driveFolderId) {
            // Fallback por nombre
            const resp = await drive.files.list({
                q: `name contains '${exp.numero_expediente}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id,name)', pageSize: 5
            });
            const folder = (resp.data.files || [])[0];
            if (folder) driveFolderId = folder.id;
        }
        if (!driveFolderId) { console.log('  ⚠️ Sin folder. Saltando.'); continue; }

        // Buscar la subcarpeta 1. CEE para reducir el ámbito de búsqueda
        const ceeRoot = await driveSvc.findSubfolderByName(driveFolderId, '1. CEE');
        const searchRoot = ceeRoot || driveFolderId;
        const allFiles = await listAllRecursive(searchRoot);

        const xmls = allFiles.filter(f => f.name.toLowerCase().endsWith('.xml'));
        const cexs = allFiles.filter(f => f.name.toLowerCase().endsWith('.cex'));
        console.log(`  XMLs encontrados: ${xmls.length}; CEXs encontrados: ${cexs.length}`);

        const patch = { inicial: {}, final: {} };

        const assign = (type, items) => {
            const slot = type; // 'xml' o 'cex'
            if (items.length === 0) return;
            if (items.length === 1) {
                const sec = classifySection(items[0].name);
                patch[sec][slot] = items[0].webViewLink;
                console.log(`  ✓ ${slot.toUpperCase()} → ${sec.toUpperCase()}: ${items[0].name}`);
                return;
            }
            // Múltiples: clasificar cada uno por nombre
            const byClass = { inicial: [], final: [] };
            for (const it of items) byClass[classifySection(it.name)].push(it);
            if (byClass.inicial.length > 0) {
                patch.inicial[slot] = byClass.inicial[0].webViewLink;
                console.log(`  ✓ ${slot.toUpperCase()} → INICIAL: ${byClass.inicial[0].name}` + (byClass.inicial.length > 1 ? ` (+${byClass.inicial.length - 1} más, ignorados)` : ''));
            }
            if (byClass.final.length > 0) {
                patch.final[slot] = byClass.final[0].webViewLink;
                console.log(`  ✓ ${slot.toUpperCase()} → FINAL: ${byClass.final[0].name}` + (byClass.final.length > 1 ? ` (+${byClass.final.length - 1} más, ignorados)` : ''));
            }
        };

        assign('xml', xmls);
        assign('cex', cexs);

        // Construir update: solo cubrir slots actualmente null
        const updated = {
            ...exp.cee,
            cee_files: {
                inicial: {
                    ...ini,
                    xml: ini.xml || patch.inicial.xml || null,
                    cex: ini.cex || patch.inicial.cex || null,
                },
                final: {
                    ...fin,
                    xml: fin.xml || patch.final.xml || null,
                    cex: fin.cex || patch.final.cex || null,
                }
            }
        };

        const changed = (updated.cee_files.inicial.xml !== ini.xml)
            || (updated.cee_files.inicial.cex !== ini.cex)
            || (updated.cee_files.final.xml   !== fin.xml)
            || (updated.cee_files.final.cex   !== fin.cex);

        if (!changed) { console.log('  ℹ️ Nada que actualizar.'); continue; }

        if (DRY_RUN) {
            console.log('  [DRY] Quedaría con xml/cex:', JSON.stringify({
                inicial: { xml: updated.cee_files.inicial.xml, cex: updated.cee_files.inicial.cex },
                final:   { xml: updated.cee_files.final.xml,   cex: updated.cee_files.final.cex }
            }, null, 2));
            continue;
        }

        // Hacer públicos los archivos asignados
        for (const sec of ['inicial', 'final']) {
            for (const slot of ['xml', 'cex']) {
                const link = patch[sec][slot];
                if (!link) continue;
                const m = link.match(/\/file\/d\/([-\w]{20,})/);
                if (m) { try { await driveSvc.setFolderPublic(m[1], 'reader'); } catch (_) {} }
            }
        }

        const { error: updErr } = await supabase.from('expedientes').update({ cee: updated }).eq('id', exp.id);
        if (updErr) console.error('  ❌', updErr.message);
        else { console.log('  ✅ Actualizado en BD'); totalUpd++; }
    }

    console.log(`\n[restore-xml-cex] Revisados: ${totalCheck}. Actualizados: ${totalUpd}.`);
    process.exit(0);
})();
