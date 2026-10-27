#!/usr/bin/env node
// ─── guardar_certificado_rite.js ─────────────────────────────────────────────
// Tras diligenciar en eDICE-Térmicas, guarda en la app lo que devuelve la JCCM, por el MISMO
// camino que la fila «Certificado RITE» de Documentación (POST /:id/rite/ocr):
//
//   · el CERTIFICADO oficial (el PDF de la IMPRESORA de eDICE, «GenerarPdf.pdf»; nunca la página
//     web impresa) → «7. LEGALIZACION RITE/{nº} - Certificado RITE.pdf» y `cert_rite_drive_link`
//     (+ `cert_rite_aportado_at`), y se LEE (regla 27.b): fechas de pruebas y firma, emplazamiento;
//   · la memoria firmada que se presentó (`MEMORIA_RITE_{nº}_fdo.pdf`) → `cert_rite_signed_link`;
//   · el justificante de la tasa (opcional) → «{nº} - JUSTIFICANTE TASA RITE.pdf», sin slot.
//
//   node scripts/guardar_certificado_rite.js <nº> --certificado <pdf> [--tasa <pdf>]            en seco
//   node scripts/guardar_certificado_rite.js <nº> --certificado <pdf> [--tasa <pdf>] --escribir
//
// Lo que ya hubiera con el mismo nombre se archiva en OLD, no se borra.

require('dotenv').config({ quiet: true });
const fs = require('fs');
const supabase = require('../services/supabaseClient');
const drive = require('../services/driveService');
const { carpetaDeExpediente } = require('../services/expedienteFolderSync');
const { procesarCertificadoRite } = require('../services/riteCertificado');
const { leerFirmasPdf } = require('../utils/firmasPdf');

const args = process.argv.slice(2);
const numero = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const ESCRIBIR = args.includes('--escribir');
const CARPETA_RITE = '7. LEGALIZACION RITE';

(async () => {
    if (!numero || numero.startsWith('--') || !opt('certificado')) {
        console.log('Uso: node scripts/guardar_certificado_rite.js <nº> --certificado <pdf> [--tasa <pdf>] [--escribir]');
        process.exit(1);
    }
    const certificado = fs.readFileSync(opt('certificado'));
    if (certificado.subarray(0, 5).toString() !== '%PDF-') {
        throw new Error('El certificado no es un PDF: el que vale es el de la impresora de eDICE (GenerarPdf.pdf), no la página web.');
    }
    const tasa = opt('tasa') ? fs.readFileSync(opt('tasa')) : null;

    const { data: exp } = await supabase.from('expedientes')
        .select('id, oportunidad_id, numero_expediente, documentacion, instalacion')
        .eq('numero_expediente', numero).maybeSingle();
    if (!exp) throw new Error(`No encuentro el expediente ${numero}`);
    const raiz = await carpetaDeExpediente(exp);
    if (!raiz) throw new Error(`${numero}: el expediente no tiene carpeta de Drive`);
    const carpeta = await drive.getOrCreateSubfolderNormalized(raiz, CARPETA_RITE);

    // La memoria firmada que se presentó: la deja `firmar_memoria_rite.js --escribir`
    const nombreFdo = `MEMORIA_RITE_${numero}_fdo.pdf`;
    const fdoId = await drive.findFileByName(carpeta, nombreFdo);
    if (fdoId) {
        const lectura = leerFirmasPdf(Buffer.from(await drive.getFileContent(fdoId)));
        if (!lectura.firmada) throw new Error(`«${nombreFdo}» no lleva firma electrónica`);
    } else {
        console.log(`AVISO: no está «${nombreFdo}» en «${CARPETA_RITE}»: cert_rite_signed_link no se toca.`);
    }

    const ficheros = [[`${numero} - Certificado RITE.pdf`, certificado]];
    if (tasa) ficheros.push([`${numero} - JUSTIFICANTE TASA RITE.pdf`, tasa]);
    const doc = exp.documentacion || {};
    console.log(`${numero} · ahora: cert_rite_drive_link=${doc.cert_rite_drive_link || '—'} · cert_rite_signed_link=${doc.cert_rite_signed_link || '—'}`);

    const links = {};
    for (const [name, buf] of ficheros) {
        const prev = await drive.findFileByName(carpeta, name);
        console.log(`${name} (${buf.length} B)${prev ? ' · ya existe: se archiva en OLD' : ''}`);
        if (!ESCRIBIR) continue;
        if (prev) await drive.archiveExistingToOld(carpeta, prev, name);
        const up = await drive.saveFileToFolder(carpeta, name, 'application/pdf', buf);
        if (!up?.link) throw new Error(`No se ha podido subir ${name}`);
        try { await drive.setFolderPublic(up.id, 'reader'); } catch (e) { /* no bloqueante */ }
        links[name] = up.link;
        console.log('  SUBIDO', up.link);
    }
    if (!ESCRIBIR) {
        console.log(`EN SECO · con --escribir: cert_rite_drive_link${fdoId ? ' y cert_rite_signed_link' : ''}, y se lee el certificado.`);
        process.exit(0);
    }

    const campos = {
        cert_rite_drive_link: links[ficheros[0][0]],
        cert_rite_aportado_at: new Date().toISOString(),
        ...(fdoId ? { cert_rite_signed_link: `https://drive.google.com/file/d/${fdoId}/view?usp=drivesdk` } : {}),
    };
    for (const [k, v] of Object.entries(campos)) {
        const { error } = await supabase.rpc('set_expediente_doc_field', { p_oportunidad_id: exp.oportunidad_id, p_field: k, p_value: v });
        if (error) throw new Error(`No se pudo escribir ${k}: ${error.message}`);
    }
    exp.documentacion = { ...doc, ...campos };

    const r = await procesarCertificadoRite({ exp, pdf: certificado, origen: 'admin' });
    console.log(`Leído: pruebas ${r.fechas?.pruebas || '?'} · firma ${r.fechas?.firma || '?'} · escrito [${r.escrito.join(', ')}]`);
    for (const c of r.conflictos) console.log(`CONFLICTO ${c.label}: en la app ${c.en_app}, en el certificado ${c.en_certificado}`);
    for (const c of r.comprobaciones) console.log(`${c.estado === 'ok' ? 'OK' : 'REVISAR'} ${c.campo}: ${c.nota}`);
    await new Promise(r2 => setTimeout(r2, 1000));
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
