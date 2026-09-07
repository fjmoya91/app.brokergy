#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENLAZAR el CERTIFICADO RITE (y la MEMORIA) que la reconciliación dejó sueltos
 * en "7. LEGALIZACION RITE", y leer del certificado sus fechas.
 *
 * Medido el 2026-09-07: 18 de los 24 expedientes en "DOC. COMPLETA APPSHEET"
 * tenían el certificado en Drive y `cert_rite_drive_link` VACÍO. Como del RITE
 * depende poder emitir el CIFO, la app los daba por incompletos teniéndolo.
 *
 * REGLA — cuál es el certificado se decide LEYÉNDOLO, no por el nombre. En esa
 * carpeta conviven el Certificado de Instalación Térmica (el impreso oficial que
 * registra el instalador) y la Memoria Técnica que generamos NOSOTROS, y son dos
 * slots distintos: confundirlos es lo que hacía creer que el RITE ya estaba
 * aportado y daba vía libre al CIFO (ver `separar_memoria_rite_de_certificado.js`
 * y la regla 27 de CLAUDE.md). El nombre solo ORDENA a los candidatos; la prueba
 * es que `leerCertificadoRite` encuentre en él las fechas de pruebas del impreso.
 *
 * Después llama a `procesarCertificadoRite` — la MISMA función que corre cuando
 * el instalador sube su certificado — que anota `fecha_pruebas_cert_instalacion`
 * y `fecha_firma_cert_instalacion` SOLO si están vacías, cruza el emplazamiento
 * (dirección + referencia catastral) contra el expediente y deja la huella en
 * `documentacion.rite_ocr`.
 *
 * COSTE: se envían solo las DOS PRIMERAS PÁGINAS (~640 tokens): ~0,0005 € y ~3 s
 * por certificado.
 *
 * USO:
 *   node scripts/enlazar_rite.js                       # dry-run: no escribe nada
 *   node scripts/enlazar_rite.js --execute
 *   node scripts/enlazar_rite.js --exp 25RES060_82
 *   node scripts/enlazar_rite.js --estado "PENDIENTE REVISAR EXPTE"
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { leerCertificadoRite } = require('../services/riteOcrService');
const { procesarCertificadoRite, fechaPruebasDe } = require('../services/riteCertificado');
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

const esES = (f) => (f ? String(f).split('-').reverse().join('/') : '—');
const esMemoria = (n) => /memoria/i.test(n);
// El BORRADOR del certificado lo generamos NOSOTROS y es el mismo impreso sin
// firmar ni registrar: lee igual de bien las fechas de pruebas, así que la prueba
// del OCR no lo descarta. Y su nombre empieza por "BORRADOR_CERTIFICADO_RITE_",
// que casaba con el patrón canónico y lo ponía EL PRIMERO de la cola. Medido en
// dry-run el 07/09/2026: en 26RES060_97 se quedaba con el borrador teniendo al
// lado el certificado real, y en 26RES060_130 —que solo tiene borrador— habría
// dado el RITE por aportado sin tenerlo, que es justo lo que este slot no puede
// afirmar (de él depende poder emitir el CIFO). Se excluye antes de ordenar.
const esBorrador = (n) => /borrador/i.test(n);
/** Cuanto más bajo, antes se prueba. El canónico primero; la memoria, la última. */
const prioridad = (n) => (esMemoria(n) ? 90 : /CERTIFICADO RITE/i.test(n) ? 0 : /certificad|CIT[_\s]/i.test(n) ? 10 : 50);

async function pdfsRite(raizId) {
    const { data: subs } = await drive.files.list({
        q: `'${raizId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name)', pageSize: 100,
    });
    const carpeta = (subs.files || []).find(f => /7\..*LEGALIZ/i.test(f.name));
    if (!carpeta) return [];
    const { data } = await drive.files.list({
        q: `'${carpeta.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)', pageSize: 200,
    });
    // Los .zip (mtt_/amt_/aft_) son los paquetes de registro de Industria y los
    // .jpg, fotos sueltas: ni uno ni otro son el impreso.
    return (data.files || [])
        .filter(f => f.mimeType === 'application/pdf')
        .filter(f => !esBorrador(f.name))
        .sort((a, b) => prioridad(a.name) - prioridad(b.name));
}

(async function main() {
    console.log(EXECUTE
        ? '⚠️  MODO EJECUCIÓN: se enlazarán slots y se anotarán fechas.\n'
        : '🔍 DRY-RUN: no se toca nada. Añade --execute cuando la tabla te convenza.\n');

    let q = supabase.from('expedientes')
        .select('numero_expediente, oportunidad_id, documentacion, instalacion')
        .order('numero_expediente');
    q = SOLO_EXP ? q.eq('numero_expediente', SOLO_EXP) : q.eq('estado', ESTADO);
    const { data: filas, error } = await q;
    if (error) { console.error('✗ Supabase:', error.message); process.exit(1); }

    const csv = [['expediente', 'certificado', 'memoria', 'fecha_pruebas', 'fecha_firma', 'avisos'].join(';')];
    let conCert = 0, sinCert = 0, leidos = 0;

    for (const exp of filas) {
        const num = exp.numero_expediente;
        const doc = exp.documentacion || {};
        const { data: op } = await supabase.from('oportunidades')
            .select('a:datos_calculo->>drive_folder_id, b:datos_calculo->inputs->>drive_folder_id')
            .eq('id', exp.oportunidad_id).maybeSingle();
        const raiz = op?.a || op?.b;
        if (!raiz) { console.log(`· ${num.padEnd(14)} ✗ sin carpeta de Drive`); continue; }

        const pdfs = await pdfsRite(raiz);
        if (!pdfs.length) { console.log(`· ${num.padEnd(14)} —  sin PDF en "7. LEGALIZACION RITE"`); sinCert++; csv.push([num, '', '', '', '', 'sin PDF'].join(';')); continue; }

        // Se prueban en orden hasta que uno lea como el impreso oficial. Un PDF
        // que no trae fechas de pruebas NO es el certificado, se llame como se
        // llame — que es justo el error que esto viene a evitar.
        let cert = null, lectura = null, probados = 0;
        for (const f of pdfs) {
            if (esMemoria(f.name) && cert === null && probados >= 2) break;
            const buf = await driveService.getFileContent(f.id);
            if (!buf) continue;
            probados++;
            let l = null;
            try { l = await leerCertificadoRite(buf); } catch { /* sigue con el siguiente */ }
            if (l && fechaPruebasDe(l)) { cert = { ...f, buf }; lectura = l; break; }
            await new Promise(r => setTimeout(r, 800));
        }

        const memoria = pdfs.find(f => esMemoria(f.name) && (!cert || f.id !== cert.id)) || null;
        const avisos = [];

        if (!cert) {
            sinCert++;
            const yaTiene = doc.cert_rite_drive_link ? ' · OJO: cert_rite_drive_link apunta a algo que NO lee como certificado' : '';
            console.log(`· ${num.padEnd(14)} ✗ ninguno de sus ${probados} PDF lee como Certificado de Instalación Térmica${yaTiene}`);
            csv.push([num, '', memoria?.name || '', '', '', `sin certificado legible${yaTiene}`].join(';'));
            continue;
        }

        conCert++;
        console.log(`· ${num.padEnd(14)} ✓ ${cert.name}`);
        console.log(`      pruebas ${esES(fechaPruebasDe(lectura))} · firma ${esES(lectura.fecha_firma)}${memoria ? `\n      memoria: ${memoria.name}` : ''}`);

        if (!EXECUTE) {
            csv.push([num, cert.name, memoria?.name || '', fechaPruebasDe(lectura) || '', lectura.fecha_firma || '', '(simulado)'].join(';'));
            continue;
        }

        // Enlaces: solo huecos. Un slot ya escrito puede haberlo puesto una persona.
        for (const [campo, fichero] of [['cert_rite_drive_link', cert], ['memoria_rite_docx_link', memoria]]) {
            if (!fichero || doc[campo]) continue;
            const link = await driveService.getWebViewLink(fichero.id);
            const { error: e } = await supabase.rpc('set_expediente_doc_field', {
                p_oportunidad_id: exp.oportunidad_id, p_field: campo, p_value: link,
            });
            if (e) avisos.push(`${campo}: ${e.message}`); else console.log(`      → ${campo}`);
            // El sello de "este enlace ES el certificado, no la Memoria". Aquí no
            // hay nada que adivinar —acaba de leerse como el impreso oficial— y sin
            // él la heurística de `esMemoriaRiteEnDriveLink` puede volver a tomarlo
            // por la memoria en cuanto el expediente tenga un borrador generado.
            if (!e && campo === 'cert_rite_drive_link' && !doc.cert_rite_aportado_at) {
                await supabase.rpc('set_expediente_doc_field', {
                    p_oportunidad_id: exp.oportunidad_id,
                    p_field: 'cert_rite_aportado_at',
                    p_value: new Date().toISOString(),
                });
            }
        }

        // Y las fechas + el cruce del emplazamiento, por la MISMA función que usa
        // la subida del instalador.
        try {
            const r = await procesarCertificadoRite({ exp: { ...exp, documentacion: { ...doc } }, pdf: cert.buf, origen: 'script' });
            leidos++;
            for (const c of r?.conflictos || []) avisos.push(`${c.label}: app ${c.en_app} ≠ certificado ${c.en_certificado}`);
            for (const a of r?.emplazamiento?.avisos || []) avisos.push(a);
            if (r?.escrito?.length) console.log(`      → ${r.escrito.join(', ')}`);
        } catch (e) { avisos.push(`OCR: ${e.message}`); }

        for (const a of avisos) console.log(`      ⚠ ${a}`);
        csv.push([num, cert.name, memoria?.name || '', fechaPruebasDe(lectura) || '', lectura.fecha_firma || '', avisos.join(' | ')].map(v => String(v ?? '').replace(/[\r\n;]+/g, ' ')).join(';'));
        await new Promise(r => setTimeout(r, 800));
    }

    const salida = path.join(__dirname, EXECUTE ? 'rite_enlazado.csv' : 'rite_enlazado_dryrun.csv');
    fs.writeFileSync(salida, '﻿' + csv.join('\n'), 'utf8');
    console.log('\n─────────────────────────────────────────────');
    console.log(`Con certificado: ${conCert}   ·   sin certificado: ${sinCert}${EXECUTE ? `   ·   leídos: ${leidos}` : ''}`);
    console.log(`CSV: ${salida}`);
    if (!EXECUTE) console.log('\nRevisa la tabla y, si te convence, repite con --execute.');
})().catch(err => { console.error('\n✗ Fallo:', err); process.exit(1); });
