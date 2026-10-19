#!/usr/bin/env node
// ─── firmar_cee.js ───────────────────────────────────────────────────────────
// FIRMA el PDF de un CEE con el certificado de REPRESENTANTE de Brokergy, sin abrir
// ninguna ventana, cuando el usuario lo da por válido («doy por válido el CEE inicial
// de NNN»). Nunca por iniciativa propia: firmar es un acto de quien firma.
//
//   node scripts/firmar_cee.js <nº> [--fase inicial|final] [--pdf <ruta>]        en seco
//   node scripts/firmar_cee.js <nº> [--fase …] --escribir                          firma y sube
//
// Cómo (medido el 15/10/2026 sobre una copia marcada «PRUEBA»):
//   · `AutofirmaCommandLine sign -format pades -store windows -filter thumbprint:SHA1:<huella>`
//     firma sin diálogo: las claves del almacén de Windows no tienen protección reforzada.
//     La huella es la del certificado de representante vigente («(R: B19350222)»), que es con
//     el que firma Brokergy (`ceeFirmaService.CIF_BROKERGY`); o CEE_FIRMA_HUELLA del .env.
//   · La firma va en la ÚLTIMA página, DEBAJO del rótulo «Firma del/la técnico/a
//     certificador/a» (CE3X 3.2; antes «Firma del técnico certificador»), como la pone Fran a
//     mano: el LOGO a la izquierda —estampado en la página ANTES de firmar, así que la firma lo
//     cubre— y la caja de la firma, con «NIF NOMBRE (R: CIF) aaaa.mm.dd hh:mm:ss», a la derecha.
//     AutoFirma escribe el texto sobre TODA la caja: con la rúbrica dentro, el texto la pisaba.
//   · `obfuscateCertText=false` (si no, «***8255**»), `layer2FontFamily=1` (Helvetica).
//   · Las coordenadas van en ENTEROS (si no, AutoFirma firma invisible) y el `-config` va en
//     una línea con «\n»: por eso la rúbrica NO va en la caja (su base64 no cabe en los
//     32.767 caracteres de la línea de órdenes de Windows).
// Después se COMPRUEBA con `leerFirmasPdf`: firmada, íntegra y por quien debe.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { leerFirmasPdf } = require('../utils/firmasPdf');
const { CIF_BROKERGY } = require('../services/ceeFirmaService');

const args = process.argv.slice(2);
const numero = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const flag = (k) => args.includes(`--${k}`);
const fase = (opt('fase') || 'inicial').toLowerCase() === 'final' ? 'final' : 'inicial';
const FASE = fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL';
const SCRATCH = path.join(__dirname, '..', 'scratch', 'firmar-cee');
const FE = path.join(__dirname, '..', '..', 'frontend');
const CLI = process.env.AUTOFIRMA_CLI || 'C:\\Program Files\\AutoFirma\\Autofirma\\AutofirmaCommandLine.exe';
const LOGO = path.join(FE, 'public', 'logo-brokergy-circular-transparent.png');
const CAJA = { ancho: 182, alto: 94, aire: 12 };   // medida sobre la firma real de 2026CEE_63

const pdfjsP = import(pathToFileURL(path.join(FE, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\/(la|a)\b/g, '').replace(/\s+/g, ' ').trim();

async function localizar(num) {
    const { data: cd } = await supabase.from('cee_directos').select('id, numero_expediente, alcance, drive_folder_id, cee').eq('numero_expediente', num).maybeSingle();
    if (cd) return { origen: 'cee_directo', row: cd };
    const { data: ex } = await supabase.from('expedientes').select('*').eq('numero_expediente', num).maybeSingle();
    if (ex) return { origen: 'expediente', row: ex };
    throw new Error(`No encuentro ${num}`);
}

async function carpetaDeFase(origen, row) {
    if (origen === 'cee_directo') {
        const nombre = require('../services/ceeDirectoFolders').subcarpetaFase(row.alcance, fase);
        return row.drive_folder_id ? driveService.findSubfolderByName(row.drive_folder_id, nombre) : null;
    }
    const raiz = await require('../services/ceeUploadService').resolveDriveFolderId(row);
    const root = raiz ? await driveService.findSubfolderByName(raiz, '1. CEE') : null;
    return root ? driveService.findSubfolderByName(root, FASE) : null;
}

/** El PDF de CE3X SIN firmar: `{nº} – CEE INICIAL.pdf` (nunca `_REVISAR`, nunca `_fdo`). */
async function pdfAFirmar(origen, row) {
    if (opt('pdf')) return { buffer: fs.readFileSync(opt('pdf')), nombre: path.basename(opt('pdf')), xml: null };
    const carpeta = await carpetaDeFase(origen, row);
    if (!carpeta) throw new Error(`${numero}: no encuentro la carpeta «${FASE}» en Drive`);
    const files = (await driveService.listFiles(carpeta)).filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    const pdfs = files.filter(f => /\.pdf$/i.test(f.name) && new RegExp(`${FASE}\\.pdf$`, 'i').test(f.name.replace(/\s+/g, ' ')));
    if (files.some(f => /_fdo\.pdf$/i.test(f.name) && f.name.toUpperCase().includes(FASE))) {
        console.log(`⚠️ Ya hay un «…_fdo.pdf» en la carpeta: se firmará otra vez y SUSTITUIRÁ al anterior (va a OLD).`);
    }
    if (!pdfs.length) {
        const revisar = files.find(f => /revisar/i.test(f.name) && /\.pdf$/i.test(f.name));
        throw new Error(revisar
            ? `${numero}: solo está «${revisar.name}». Un _REVISAR no se firma: primero hay que darlo por bueno y subirlo con su nombre canónico ({nº} – ${FASE}.pdf/.xml/.cex).`
            : `${numero}: no hay «${numero} – ${FASE}.pdf» en Drive.`);
    }
    const f = pdfs.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0];
    const xmlF = files.find(x => new RegExp(`${FASE}\\.xml$`, 'i').test(x.name.replace(/\s+/g, ' ')) && !/revisar/i.test(x.name));
    const xml = xmlF ? Buffer.from(await driveService.getFileContent(xmlF.id)).toString('latin1') : null;
    return { buffer: Buffer.from(await driveService.getFileContent(f.id)), nombre: f.name, xml };
}

/** La huella del certificado de REPRESENTANTE de Brokergy, vigente, en el almacén de Windows. */
function huellaRepresentante() {
    if (process.env.CEE_FIRMA_HUELLA) return process.env.CEE_FIRMA_HUELLA.trim();
    const ps = `Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) -and $_.Subject -match 'R: ${CIF_BROKERGY}' -and $_.Subject -match 'MOYA' } | Sort-Object NotAfter -Descending | Select-Object -First 1 -ExpandProperty Thumbprint`;
    const h = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
    if (!/^[0-9A-F]{40}$/i.test(h)) throw new Error('No encuentro el certificado de representante de Brokergy vigente en el almacén de Windows');
    return h;
}

async function colocar(buffer) {
    const pdfjs = await pdfjsP;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
    const last = doc.numPages;
    const page = await doc.getPage(last);
    const it = (await page.getTextContent()).items
        .filter(i => norm(i.str).includes('firma del tecnico certificador'))
        .sort((a, b) => a.transform[5] - b.transform[5])[0];
    if (!it) throw new Error('No encuentro «Firma del/la técnico/a certificador/a» en la última página: no se firma a ciegas.');
    const ex = it.transform[4], ey = it.transform[5], w = it.width || 140, fh = it.height || 10;
    const urx = Math.ceil(ex + w + CAJA.aire), ury = Math.floor(ey - fh * 0.9);
    const caja = { llx: urx - CAJA.ancho, lly: ury - CAJA.alto, urx, ury };
    return { page: last, caja };
}

async function vistaPrevia(buffer, png) {
    const pdfjs = await pdfjsP;
    const { createCanvas } = await import(pathToFileURL(path.join(FE, 'node_modules/@napi-rs/canvas/index.js')).href).then(m => m.default || m);
    const standardFontDataUrl = path.join(FE, 'node_modules/pdfjs-dist/standard_fonts') + path.sep;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0, standardFontDataUrl }).promise;
    const page = await doc.getPage(doc.numPages);
    const vp = page.getViewport({ scale: 1.6 });
    const cv = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp, intent: 'print', annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS }).promise;
    fs.writeFileSync(png, cv.toBuffer('image/png'));
}

(async () => {
    if (!numero || numero.startsWith('--')) {
        console.log('Uso: node scripts/firmar_cee.js <nº> [--fase inicial|final] [--pdf <ruta>] [--escribir]');
        process.exit(1);
    }
    const { origen, row } = await localizar(numero);
    const { buffer, nombre, xml } = await pdfAFirmar(origen, row);
    console.log(`${numero} (${origen}) · ${FASE} · firmo «${nombre}»`);
    if (leerFirmasPdf(buffer).firmada) throw new Error(`«${nombre}» ya lleva firma electrónica: no se firma otra vez.`);
    // REGLA — no se firma un CEE cuyo XML no VALIDA (2026-10-19, 26RES060_195): su PDF lleva
    // la marca «certificado incompleto» y firmarlo no la quita.
    if (xml) {
        const cexAPdf = require('../services/cee/cexAPdf');
        const v = await cexAPdf.validarXml(Buffer.from(xml, 'latin1'));
        if (!v.ok) throw new Error(`NO se firma: ${cexAPdf.textoIncompleto(v.errores)}`);
    } else {
        console.log('⚠️ Sin el XML al lado no se puede validar: comprueba que el PDF NO lleva la marca «certificado incompleto».');
    }

    // La fecha: AutoFirma sella con el reloj de este PC. La sede compara la emisión con la
    // <FechaGeneracion> del XML; si no es hoy, se avisa (lo bueno es regenerar en CE3X hoy).
    const hoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const gen = xml && (xml.match(/<FechaGeneracion>\s*([\d/]+)/i) || [])[1];
    if (gen && gen !== hoy) console.log(`⚠️ El certificado se generó el ${gen} y se firma hoy (${hoy}). Si la sede o el Registro piden que coincidan, hay que regenerarlo en CE3X hoy y firmar ese.`);

    const { page, caja } = await colocar(buffer);
    const logoW = CAJA.alto - 4;
    const cajaTexto = { llx: caja.llx + logoW + 6, lly: caja.lly, urx: caja.urx, ury: caja.ury };
    console.log(`Firma en la pág ${page} · logo ${caja.llx},${caja.lly} · texto ${JSON.stringify(cajaTexto)}`);

    // Logo de Brokergy estampado ANTES de firmar (la firma lo cubre). Firma Brokergy: lleva logo.
    const { PDFDocument } = require('pdf-lib');
    const d = await PDFDocument.load(buffer);
    const png = await d.embedPng(fs.readFileSync(LOGO));
    d.getPages()[page - 1].drawImage(png, { x: caja.llx, y: caja.lly + 2, width: logoW, height: logoW });
    const dir = path.join(SCRATCH, `${numero}_${fase}`);
    fs.mkdirSync(dir, { recursive: true });
    const entrada = path.join(dir, 'sin_firmar.pdf');
    const salida = path.join(dir, `${numero} – ${FASE}_fdo.pdf`);
    fs.writeFileSync(entrada, await d.save());

    const config = [
        'signatureFormat=PAdES', `signaturePage=${page}`,
        `signaturePositionOnPageLowerLeftX=${cajaTexto.llx}`, `signaturePositionOnPageLowerLeftY=${cajaTexto.lly}`,
        `signaturePositionOnPageUpperRightX=${cajaTexto.urx}`, `signaturePositionOnPageUpperRightY=${cajaTexto.ury}`,
        'signatureProductionCity=Tomelloso',
        'layer2Text=$$SUBJECTCN$$ $$SIGNDATE=yyyy.MM.dd HH:mm:ss$$', 'layer2FontSize=10', 'layer2FontFamily=1',
        'obfuscateCertText=false',
    ].join('\\n');
    if (fs.existsSync(salida)) fs.unlinkSync(salida);
    const r = execFileSync(CLI, ['sign', '-i', entrada, '-o', salida, '-format', 'pades', '-store', 'windows',
        '-filter', `thumbprint:SHA1:${huellaRepresentante()}`, '-config', config], { encoding: 'utf8' });
    if (!fs.existsSync(salida)) throw new Error(`AutoFirma no ha firmado: ${r.trim().slice(-300)}`);

    const firmado = fs.readFileSync(salida);
    const lectura = leerFirmasPdf(firmado);
    const quien = (lectura.firmantes || []).map(f => `${f.nombre} (${f.fecha})`).join(', ');
    console.log(`Comprobación: firmada ${lectura.firmada} · íntegra ${lectura.integridad?.ok !== false && !lectura.integridad?.rota} · firma ${quien || '?'}`);
    if (!lectura.firmada || lectura.integridad?.rota) throw new Error('La firma no ha quedado bien: no se sube.');
    if (!(lectura.firmantes || []).some(f => /MOYA/i.test(f.nombre || ''))) throw new Error('El firmante no es el esperado: no se sube.');
    const png2 = path.join(dir, 'ultima_pagina.png');
    await vistaPrevia(firmado, png2);
    console.log(`Vista de la última página: ${png2}`);

    if (!flag('escribir')) { console.log(`EN SECO · firmado en ${salida}. Con --escribir se sube como «${numero} – ${FASE}_fdo.pdf».`); process.exit(0); }

    if (origen === 'cee_directo') {
        const { subirCeeDirecto } = require('../services/cee/subidaCeePublica');
        const up = await subirCeeDirecto({ id: row.id, fase, slot: 'pdf', buffer: firmado, mimetype: 'application/pdf',
            quien: { texto: 'Fran (firma automática)', usuario: 'FRAN' } });
        console.log('SUBIDO:', up.name);
    } else {
        const up = await require('../services/ceeFirmaService').guardarCertificado(row.id, fase, firmado);
        console.log('SUBIDO:', up.fileName || up.name, '· avisos:', (up.comprobacion?.avisos || []).join(' | ') || 'ninguno');
    }
    await new Promise(r2 => setTimeout(r2, 2000));
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
