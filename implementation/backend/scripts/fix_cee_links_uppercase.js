// Script ejecutable: repara todos los cee.cee_files con webViewLink en mayúsculas.
// Recorre los expedientes, escanea la carpeta 1. CEE en Drive y reescribe los links rotos.
// Uso: node scripts/fix_cee_links_uppercase.js [--dry-run] [--exp <numero_expediente>]
require('dotenv').config();

const supabase = require('../services/supabaseClient');
const drive = require('../services/driveService');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_EXP = (() => {
    const i = args.indexOf('--exp');
    return i >= 0 ? args[i + 1] : null;
})();

function matchSlot(filename) {
    const lower = (filename || '').toLowerCase();
    if (lower.endsWith('.xml')) return 'xml';
    if (lower.endsWith('.cex')) return 'cex';
    if (lower.endsWith('_reg.pdf')) return 'registro';
    if (lower.endsWith('_etq.pdf')) return 'etiqueta';
    if (lower.endsWith('_fdo.pdf')) return 'pdf';
    return null;
}

function looksCorrupted(link) {
    if (!link || typeof link !== 'string') return false;
    // Corrupto si el path está en MAYÚSCULAS (los IDs reales tienen caja mezclada y `view`/`preview` son lowercase)
    return /\/FILE\/D\/|\/VIEW\b|\/PREVIEW\b/.test(link);
}

(async () => {
    console.log(`[fix-uppercase-links] DRY_RUN=${DRY_RUN} ONLY_EXP=${ONLY_EXP || '(todos)'}`);

    let q = supabase.from('expedientes').select('id, numero_expediente, oportunidad_id, cee');
    if (ONLY_EXP) q = q.eq('numero_expediente', ONLY_EXP);
    const { data: expedientes, error } = await q;
    if (error) {
        console.error('Error listando expedientes:', error);
        process.exit(1);
    }
    console.log(`[fix-uppercase-links] ${expedientes.length} expedientes a revisar`);

    let totalRep = 0, totalFix = 0;

    for (const exp of expedientes) {
        const ceeFiles = exp.cee?.cee_files;
        if (!ceeFiles) continue;

        // Detectar si hay links rotos
        let hasBroken = false;
        for (const section of ['inicial', 'final']) {
            const sec = ceeFiles[section] || {};
            for (const slotId of ['xml', 'pdf', 'cex', 'registro', 'etiqueta']) {
                if (looksCorrupted(sec[slotId])) { hasBroken = true; break; }
            }
            if (Array.isArray(sec.otros) && sec.otros.some(looksCorrupted)) hasBroken = true;
            if (hasBroken) break;
        }
        if (!hasBroken) continue;
        totalRep++;
        console.log(`\n=== Expediente ${exp.numero_expediente} (id=${exp.id}) ===`);

        // Buscar carpeta Drive — primero en BD, fallback buscar por nombre
        const { data: op } = await supabase
            .from('oportunidades')
            .select('*')
            .eq('id', exp.oportunidad_id)
            .single();
        let dc = op?.datos_calculo || {};
        if (typeof dc === 'string') { try { dc = JSON.parse(dc); } catch (e) { dc = {}; } }
        let driveFolderId = op?.drive_folder_id || op?.drive_folder_link || dc?.drive_folder_id || dc?.inputs?.drive_folder_id;
        // Si es una URL de Drive (drive_folder_link), extraer el ID
        if (driveFolderId && typeof driveFolderId === 'string' && driveFolderId.startsWith('http')) {
            const m = driveFolderId.match(/\/folders\/([-\w]{20,})/) || driveFolderId.match(/[-\w]{25,}/);
            driveFolderId = m ? m[1] || m[0] : null;
        }
        if (!driveFolderId) {
            // Fallback: buscar carpeta por nombre que contenga el numero_expediente
            const { google } = require('googleapis');
            const { OAuth2 } = google.auth;
            const oauth = new OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
            oauth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
            const driveCli = google.drive({ version: 'v3', auth: oauth });
            const resp = await driveCli.files.list({
                q: `name contains '${exp.numero_expediente}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id,name)',
                pageSize: 5
            });
            const folder = (resp.data.files || [])[0];
            if (folder) driveFolderId = folder.id;
        }
        if (!driveFolderId) { console.log('  ⚠️ Sin drive_folder_id ni carpeta nombrada. Saltando.'); continue; }
        console.log(`  Drive folder: ${driveFolderId}`);

        const ceeRoot = await drive.findSubfolderByName(driveFolderId, '1. CEE');
        if (!ceeRoot) { console.log('  ⚠️ Sin carpeta 1. CEE.'); continue; }

        const newFiles = { inicial: { otros: [] }, final: { otros: [] } };
        for (const sectionLabel of ['CEE INICIAL', 'CEE FINAL']) {
            const sectionKey = sectionLabel.endsWith('INICIAL') ? 'inicial' : 'final';
            const sectionFolder = await drive.findSubfolderByName(ceeRoot, sectionLabel);
            if (!sectionFolder) continue;
            const files = await drive.listFiles(sectionFolder);
            for (const f of files) {
                if (f.mimeType === 'application/vnd.google-apps.folder') continue;
                const slot = matchSlot(f.name);
                if (slot && !newFiles[sectionKey][slot]) {
                    newFiles[sectionKey][slot] = f.webViewLink;
                    if (!DRY_RUN) {
                        try { await drive.setFolderPublic(f.id, 'reader'); } catch (_) {}
                    }
                    console.log(`  ✓ ${sectionLabel} ${slot.toUpperCase()}: ${f.name}`);
                } else if (!slot) {
                    newFiles[sectionKey].otros.push(f.webViewLink);
                }
            }
        }

        // Construir cee_files final: arrancamos de los actuales y limpiamos slots corruptos sin reemplazo
        const buildSection = (section) => {
            const src = exp.cee.cee_files?.[section] || {};
            const found = newFiles[section] || {};
            const out = {};
            for (const slot of ['xml', 'pdf', 'cex', 'registro', 'etiqueta']) {
                if (found[slot]) {
                    out[slot] = found[slot]; // archivo real encontrado en Drive
                } else if (looksCorrupted(src[slot])) {
                    out[slot] = null; // link corrupto sin archivo real → limpiar
                    console.log(`  🧹 ${section.toUpperCase()} ${slot}: link corrupto sin archivo real → null`);
                } else {
                    out[slot] = src[slot] || null; // mantener si era válido
                }
            }
            // OTROS: filtrar links corruptos, añadir los nuevos
            const cleanOtros = (Array.isArray(src.otros) ? src.otros : []).filter(l => !looksCorrupted(l));
            out.otros = [...cleanOtros, ...(found.otros || [])];
            return out;
        };

        const updatedCee = {
            ...exp.cee,
            cee_files: {
                inicial: buildSection('inicial'),
                final:   buildSection('final'),
            }
        };

        if (DRY_RUN) {
            console.log('  [DRY] Quedaría como:', JSON.stringify(updatedCee.cee_files, null, 2));
            continue;
        }
        const { error: updErr } = await supabase.from('expedientes').update({ cee: updatedCee }).eq('id', exp.id);
        if (updErr) {
            console.error('  ❌ Error update:', updErr.message);
        } else {
            console.log('  ✅ Actualizado en BD');
            totalFix++;
        }
    }

    console.log(`\n[fix-uppercase-links] Total con corrupción: ${totalRep}. Reparados: ${totalFix}.`);
    process.exit(0);
})();
