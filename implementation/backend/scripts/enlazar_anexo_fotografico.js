#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENLAZAR el ANEXO / INFORME FOTOGRÁFICO que ya existe en Drive a su slot.
 *
 * Medido el 2026-09-07: los 24 expedientes de "DOC. COMPLETA APPSHEET" tenían su
 * informe fotográfico —borrador Y firmado— en Drive, y solo 6 lo tenían enlazado.
 * La app los daba por pendientes y `generar-anexo-fotografico` habría vuelto a
 * generar un documento que ya está hecho y firmado.
 *
 * ⚠️ SE BUSCA SIN TILDES. Los ficheros se llaman "INFORME FOTOGRÁFICO" y un
 * `/FOTOGRAF/i` NO casa con la Á — así se me escapó la primera vez y salió que no
 * había ninguno. Misma regla que el resto de buscadores de la app
 * (memoria `project_busqueda_sin_tildes`).
 *
 * QUÉ SLOT recibe cada uno:
 *   · `_fdo` / `_FDO` / `firmado` / `_signed` → `anexo_fotografico_signed_link`
 *   · el resto                                → `anexo_fotografico_drive_link`
 *
 * PREFERENCIA DE CARPETA (la misma que en el resto de slots): `6. ANEXOS CAE`
 * primero, luego `2. FOTOS Y VIDEOS`. NUNCA la carpeta de auditoría
 * ("10. EXPEDIENTE CAE" y sus variantes del esquema viejo "<n> - EXPEDIENTE
 * CAE"): ahí llega una COPIA que hace la app al VALIDAR, así que apuntar el slot
 * a ella sería circular. Tampoco `OLD`, que son versiones sustituidas.
 *
 * Solo rellena HUECOS: un slot ya enlazado no se toca.
 *
 * USO:
 *   node scripts/enlazar_anexo_fotografico.js                # dry-run
 *   node scripts/enlazar_anexo_fotografico.js --execute
 *   node scripts/enlazar_anexo_fotografico.js --exp 25RES060_82
 *   node scripts/enlazar_anexo_fotografico.js --estado "PENDIENTE REVISAR EXPTE"
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { google } = require('googleapis');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

const EXECUTE = flag('--execute') || flag('--apply');
const SOLO_EXP = opt('--exp');
const ESTADO = opt('--estado') || 'DOC. COMPLETA APPSHEET';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth2callback'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

/** Sin tildes y en mayúsculas: "FOTOGRÁFICO" y "FOTOGRAFICO" son lo mismo. */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const esAuditoria = (carpeta) => /EXPEDIENTE\s+CAE/.test(norm(carpeta));
const esOld = (carpeta) => /(^|\/)OLD($|\/)/.test(norm(carpeta));
const esFirmado = (nombre) => /_FDO|FIRMAD|_SIGNED/.test(norm(nombre));

/** Cuanto más bajo, mejor sitio para que apunte el slot. */
function rankCarpeta(nombre) {
    const n = norm(nombre);
    if (/6\.\s*ANEXOS CAE/.test(n)) return 0;
    if (/2\.\s*FOTOS/.test(n)) return 1;
    if (esAuditoria(n)) return 90;
    return 50;
}
/** Entre dos iguales, la que no se llame "Copy of". */
const rankNombre = (nombre) => (/^COPY OF/.test(norm(nombre)) ? 5 : 0);

async function candidatos(raizId) {
    const { data: subs } = await drive.files.list({
        q: `'${raizId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name)', pageSize: 100,
    });
    const out = [];
    for (const sub of subs.files || []) {
        if (esOld(sub.name)) continue;
        const { data } = await drive.files.list({
            q: `'${sub.id}' in parents and trashed = false and mimeType = 'application/pdf'`,
            fields: 'files(id, name)', pageSize: 200,
        });
        for (const f of data.files || []) {
            if (!/FOTOGRAF|REPORTAJE/.test(norm(f.name))) continue;
            out.push({ ...f, carpeta: sub.name, firmado: esFirmado(f.name), rank: rankCarpeta(sub.name) + rankNombre(f.name) });
        }
    }
    return out.sort((a, b) => a.rank - b.rank);
}

(async function main() {
    console.log(EXECUTE
        ? '⚠️  MODO EJECUCIÓN: se enlazarán slots en Supabase.\n'
        : '🔍 DRY-RUN: no se toca nada. Añade --execute cuando la tabla te convenza.\n');

    let q = supabase.from('expedientes')
        .select('numero_expediente, oportunidad_id, documentacion')
        .order('numero_expediente');
    q = SOLO_EXP ? q.eq('numero_expediente', SOLO_EXP) : q.eq('estado', ESTADO);
    const { data: filas, error } = await q;
    if (error) { console.error('✗ Supabase:', error.message); process.exit(1); }

    const csv = [['expediente', 'campo', 'carpeta', 'fichero'].join(';')];
    let enlazados = 0, yaEstaban = 0, sinNada = 0;

    for (const exp of filas) {
        const num = exp.numero_expediente;
        const doc = exp.documentacion || {};
        const { data: op } = await supabase.from('oportunidades')
            .select('a:datos_calculo->>drive_folder_id, b:datos_calculo->inputs->>drive_folder_id')
            .eq('id', exp.oportunidad_id).maybeSingle();
        const raiz = op?.a || op?.b;
        if (!raiz) { console.log(`· ${num.padEnd(14)} ✗ sin carpeta de Drive`); continue; }

        const cands = await candidatos(raiz);
        if (!cands.length) { console.log(`· ${num.padEnd(14)} —  no hay informe fotográfico en Drive`); sinNada++; continue; }

        const elegido = {
            anexo_fotografico_signed_link: cands.find(c => c.firmado && !esAuditoria(c.carpeta)) || null,
            anexo_fotografico_drive_link: cands.find(c => !c.firmado && !esAuditoria(c.carpeta)) || null,
        };

        const lineas = [];
        for (const [campo, f] of Object.entries(elegido)) {
            if (!f) continue;
            if (doc[campo]) { yaEstaban++; lineas.push(`      ${campo}: ya enlazado, no se toca`); continue; }
            lineas.push(`      ${campo} ← ${f.carpeta}/${f.name}`);
            csv.push([num, campo, f.carpeta, f.name].join(';'));
            if (!EXECUTE) { enlazados++; continue; }
            const link = await driveService.getWebViewLink(f.id);
            const { error: e } = await supabase.rpc('set_expediente_doc_field', {
                p_oportunidad_id: exp.oportunidad_id, p_field: campo, p_value: link,
            });
            if (e) lineas.push(`         ✗ ${e.message}`); else enlazados++;
        }
        // Lo que solo existe en la carpeta de auditoría no se enlaza: se dice.
        for (const [campo, f] of Object.entries(elegido)) {
            if (f || doc[campo]) continue;
            const soloAudit = cands.find(c => c.firmado === (campo.includes('signed')) && esAuditoria(c.carpeta));
            if (soloAudit) lineas.push(`      ⚠ ${campo}: solo existe en "${soloAudit.carpeta}" (copia de auditoría) — no se enlaza ahí`);
        }

        console.log(`· ${num.padEnd(14)} ${cands.length} candidato(s)`);
        for (const l of lineas) console.log(l);
    }

    const salida = path.join(__dirname, EXECUTE ? 'anexo_fotografico.csv' : 'anexo_fotografico_dryrun.csv');
    fs.writeFileSync(salida, '﻿' + csv.join('\n'), 'utf8');
    console.log('\n─────────────────────────────────────────────');
    console.log(`${EXECUTE ? 'Enlazados' : 'Se enlazarían'}: ${enlazados}   ·   ya estaban: ${yaEstaban}   ·   sin informe: ${sinNada}`);
    console.log(`CSV: ${salida}`);
    if (!EXECUTE) console.log('\nRevisa la tabla y, si te convence, repite con --execute.');
})().catch(err => { console.error('\n✗ Fallo:', err); process.exit(1); });
