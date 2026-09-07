#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENLAZAR a mano el documento que el reconciliador NO pudo elegir.
 *
 * `reconciliar_migrados.js` solo enlaza lo que no tiene ambigüedad: cuando en la
 * carpeta hay DOS ficheros que encajan en el mismo slot, se para y avisa
 * ("2 candidatos — enlázalo tú"). Y hace bien: son versiones distintas del mismo
 * documento (`_fdo` vs `_fdo_fdo`, `_rev1`, `_S2E2`…) y elegir la equivocada deja
 * en el expediente un papel que no es el que se presentó.
 *
 * Esto es la otra mitad: una vez que una PERSONA ha decidido cuál vale, aplicarlo.
 * La decisión va en el CSV, con su nota, y el CSV queda como traza de por qué se
 * eligió cada uno.
 *
 * USO:
 *   node scripts/enlazar_slot.js --pares scripts/enlaces_decididos.csv
 *   node scripts/enlazar_slot.js --pares … --execute
 *   node scripts/enlazar_slot.js --exp 25RES060_85 --slot cert_cifo_signed_link \
 *        --fichero "25RES060_85 - CERTIF INSTALADOR_rev1_signed.pdf" --execute
 *
 * FORMATO del CSV (';', con o sin cabecera): expediente;slot;fichero[;nota]
 *
 * SEGURO:
 *   · El fichero se busca POR NOMBRE EXACTO dentro de la carpeta del expediente.
 *     Si no aparece, o aparece más de una vez, no se escribe nada y se dice.
 *   · Un slot que YA tiene enlace no se pisa (salvo --forzar): puede haberlo
 *     escrito la app, y lo de la app es más fiable que un CSV de hace un rato.
 *   · Escribe con la RPC `set_expediente_doc_field` (jsonb_set sobre UNA clave),
 *     nunca un update de `documentacion` entera — regla 19.
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
const FORZAR = flag('--forzar');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth2callback'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

function leerPares() {
    const uno = opt('--exp');
    if (uno) {
        const slot = opt('--slot'), fichero = opt('--fichero');
        if (!slot || !fichero) { console.error('✗ --exp necesita también --slot y --fichero.'); process.exit(1); }
        return [{ exp: uno, slot, fichero, nota: '' }];
    }
    const csv = opt('--pares');
    if (!csv) { console.error('✗ Pasa --pares <csv> o --exp/--slot/--fichero.'); process.exit(1); }
    const texto = fs.readFileSync(csv, 'utf8').replace(/^﻿/, '');
    const out = [];
    for (const linea of texto.split(/\r?\n/)) {
        const l = linea.trim();
        if (!l || /^expediente\s*;/i.test(l) || l.startsWith('#')) continue;
        const [exp, slot, fichero, ...resto] = l.split(';');
        if (!exp || !slot || !fichero) continue;
        out.push({ exp: exp.trim(), slot: slot.trim(), fichero: fichero.trim(), nota: (resto.join(';') || '').trim() });
    }
    return out;
}

// Busca el fichero por nombre EXACTO en la carpeta del expediente y sus
// subcarpetas (dos niveles: la estructura 0–12 y lo que cuelgue de ella).
// Devuelve cada hallazgo CON SU RUTA: el mismo documento aparece a menudo dos y
// tres veces —en "6. ANEXOS CAE" y en la carpeta de auditoría del esquema viejo
// ("<n> - EXPEDIENTE CAE")—, y sin la ruta no se puede decir cuál se enlaza.
async function buscarPorNombre(raiz, nombre, ruta = '', profundidad = 0) {
    const encontrados = [];
    const { data } = await drive.files.list({
        q: `'${raiz}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, webViewLink)',
        pageSize: 200,
    });
    for (const f of data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
            if (profundidad < 2) encontrados.push(...await buscarPorNombre(f.id, nombre, `${ruta}/${f.name}`, profundidad + 1));
        } else if (f.name === nombre) {
            encontrados.push({ ...f, ruta: ruta || '/' });
        }
    }
    return encontrados;
}

// El CSV puede pedir el fichero a secas ("ANEXO I.pdf") o cualificado con su
// carpeta ("6. ANEXOS CAE/ANEXO I.pdf"), que es como se desempata un duplicado.
function partirDestino(valor) {
    const i = valor.lastIndexOf('/');
    return i < 0
        ? { carpeta: null, nombre: valor }
        : { carpeta: valor.slice(0, i).trim(), nombre: valor.slice(i + 1).trim() };
}

(async function main() {
    const pares = leerPares();
    console.log(EXECUTE
        ? '⚠️  MODO EJECUCIÓN: se escribirán enlaces en Supabase.\n'
        : '🔍 DRY-RUN: no se toca nada. Añade --execute cuando la tabla te convenza.\n');

    let ok = 0, saltados = 0;

    for (const { exp: num, slot, fichero, nota } of pares) {
        const { data: e } = await supabase.from('expedientes')
            .select('oportunidad_id, documentacion')
            .eq('numero_expediente', num).maybeSingle();
        if (!e) { console.log(`· ${num.padEnd(14)} ✗ no existe ese expediente`); saltados++; continue; }

        const { data: op } = await supabase.from('oportunidades')
            .select('folder:datos_calculo->>drive_folder_id, folder_inputs:datos_calculo->inputs->>drive_folder_id')
            .eq('id', e.oportunidad_id).maybeSingle();
        const raiz = op?.folder || op?.folder_inputs || null;
        if (!raiz) { console.log(`· ${num.padEnd(14)} ✗ sin carpeta de Drive`); saltados++; continue; }

        const yaTiene = (e.documentacion || {})[slot];
        if (yaTiene && !FORZAR) {
            console.log(`· ${num.padEnd(14)} ${slot}\n    ✗ ya enlazado, no se pisa (usa --forzar si de verdad quieres cambiarlo)`);
            saltados++; continue;
        }

        const { carpeta, nombre } = partirDestino(fichero);
        let hits = await buscarPorNombre(raiz, nombre);
        // Con carpeta en el CSV, se filtra por ella: es el desempate explícito de
        // un documento que está duplicado en varias subcarpetas.
        if (carpeta) hits = hits.filter(h => h.ruta.toLowerCase().endsWith(carpeta.toLowerCase()));

        if (hits.length !== 1) {
            console.log(`· ${num.padEnd(14)} ${slot}`);
            if (!hits.length) {
                console.log(`    ✗ no encuentro "${nombre}"${carpeta ? ` dentro de "${carpeta}"` : ''}`);
            } else {
                console.log(`    ✗ "${nombre}" está en ${hits.length} carpetas — cualifícalo en el CSV con la que valga:`);
                for (const h of hits) console.log(`         ${h.ruta.replace(/^\//, '')}/${nombre}`);
            }
            saltados++; continue;
        }

        console.log(`· ${num.padEnd(14)} ${slot}`);
        console.log(`    ← ${hits[0].ruta.replace(/^\//, '')}/${nombre}${nota ? `   · ${nota}` : ''}`);
        if (!EXECUTE) { console.log('    (simulado)\n'); ok++; continue; }

        const link = hits[0].webViewLink || await driveService.getWebViewLink(hits[0].id);
        const { error: err } = await supabase.rpc('set_expediente_doc_field', {
            p_oportunidad_id: e.oportunidad_id, p_field: slot, p_value: link,
        });
        console.log(err ? `    ✗ Supabase: ${err.message}\n` : '    ✓ enlazado\n');
        if (err) saltados++; else ok++;
    }

    console.log('─────────────────────────────────────────────');
    console.log(`${EXECUTE ? 'Enlazados' : 'Se enlazarían'}: ${ok}   ·   saltados: ${saltados}`);
    if (!EXECUTE) console.log('\nRepite con --execute cuando la tabla te convenza.');
})().catch(err => { console.error('\n✗ Fallo:', err); process.exit(1); });
