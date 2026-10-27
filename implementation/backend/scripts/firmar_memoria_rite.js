#!/usr/bin/env node
// ─── firmar_memoria_rite.js ──────────────────────────────────────────────────
// FIRMA la Memoria Técnica RITE (plantilla JCCM que genera la app) con el certificado de
// REPRESENTANTE de la empresa instaladora, sin ventanas, y la deja lista para eDICE-Térmicas:
// el PDF firmado y el ZIP que pide la plataforma (solo con la memoria firmada).
// Nunca por iniciativa propia: firmar es un acto de quien firma.
//
//   node scripts/firmar_memoria_rite.js <nº> [--pdf <ruta>] [--empresa <CIF>]     en seco
//   node scripts/firmar_memoria_rite.js <nº> … --escribir                          firma y sube a Drive
//
// · Por defecto firma Brokergy (B19350222, «Soluciones Sostenibles»), con el MISMO
//   certificado de representante que `firmar_cee.js`. `--empresa <CIF>` firma con el de otra
//   empresa instaladora cuyo certificado de representante esté en el almacén de Windows.
// · La firma va en la ÚLTIMA página, DEBAJO de «Fecha y firma del/la Instalador/a o técnico/a
//   competente» y por encima de los «Ejemplar para…» del pie. Sin logo: el hueco de al lado es
//   el «Sello de la empresa instaladora».
// · Después se COMPRUEBA con `leerFirmasPdf` (firmada, íntegra y por esa empresa).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const archiver = require('archiver');
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { leerFirmasPdf } = require('../utils/firmasPdf');
const { CIF_BROKERGY } = require('../services/ceeFirmaService');

const args = process.argv.slice(2);
const numero = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const flag = (k) => args.includes(`--${k}`);
const CIF = (opt('empresa') || CIF_BROKERGY).toUpperCase().trim();
const CARPETA_RITE = '7. LEGALIZACION RITE';
const SCRATCH = path.join(__dirname, '..', 'scratch', 'firmar-rite');
const FE = path.join(__dirname, '..', '..', 'frontend');
const CLI = process.env.AUTOFIRMA_CLI || 'C:\\Program Files\\AutoFirma\\Autofirma\\AutofirmaCommandLine.exe';
const CAJA = { ancho: 230, alto: 56 };

const pdfjsP = import(pathToFileURL(path.join(FE, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\/(la|a)\b/g, '').replace(/\s+/g, ' ').trim();

async function carpetaRite(num) {
    const { data: ex } = await supabase.from('expedientes').select('*').eq('numero_expediente', num).maybeSingle();
    if (!ex) throw new Error(`No encuentro el expediente ${num}`);
    const raiz = await require('../services/ceeUploadService').resolveDriveFolderId(ex);
    const carpeta = raiz ? await driveService.findSubfolderByName(raiz, CARPETA_RITE) : null;
    if (!carpeta) throw new Error(`${num}: no hay carpeta «${CARPETA_RITE}» en Drive (genera antes la memoria)`);
    return carpeta;
}

/** `MEMORIA_RITE_{nº}.pdf` de «7. LEGALIZACION RITE» (nunca un `_fdo`), o el de `--pdf`. */
async function pdfAFirmar(carpeta) {
    if (opt('pdf')) return { buffer: fs.readFileSync(opt('pdf')), nombre: path.basename(opt('pdf')) };
    const nombre = `MEMORIA_RITE_${numero}.pdf`;
    const id = await driveService.findFileByName(carpeta, nombre);
    if (!id) throw new Error(`${numero}: no está «${nombre}» en «${CARPETA_RITE}»`);
    return { buffer: Buffer.from(await driveService.getFileContent(id)), nombre };
}

/** Certificado de REPRESENTANTE vigente de la empresa `CIF` en el almacén de Windows. */
function huella() {
    if (CIF === CIF_BROKERGY && process.env.CEE_FIRMA_HUELLA) return process.env.CEE_FIRMA_HUELLA.trim();
    const ps = `Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) -and $_.Subject -match 'R: ${CIF}' } | Sort-Object NotAfter -Descending | Select-Object -First 1 -ExpandProperty Thumbprint`;
    const h = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
    if (!/^[0-9A-F]{40}$/i.test(h)) throw new Error(`No hay certificado de representante vigente de ${CIF} en el almacén de Windows`);
    return h;
}

/** Caja bajo «Fecha y firma del/la Instalador/a…» y por encima del pie «Ejemplar para…». */
async function colocar(buffer) {
    const pdfjs = await pdfjsP;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
    const last = doc.numPages;
    const items = (await (await doc.getPage(last)).getTextContent()).items;
    // El rótulo llega troceado («Fecha y firma del» · «/la» · «Instalador»…): basta el primer trozo
    const ancla = items.find(i => norm(i.str).startsWith('fecha y firma'));
    if (!ancla) throw new Error('No encuentro «Fecha y firma del/la Instalador/a» en la última página: no se firma a ciegas.');
    const pie = items.filter(i => norm(i.str).includes('ejemplar para')).sort((a, b) => b.transform[5] - a.transform[5])[0];
    const ex = ancla.transform[4], ey = ancla.transform[5];
    const ury = Math.floor(ey - 8);
    const suelo = pie ? Math.ceil(pie.transform[5] + (pie.height || 8) + 4) : ury - CAJA.alto;
    const lly = Math.max(suelo, ury - CAJA.alto);
    if (ury - lly < 30) throw new Error('No hay sitio para la firma entre «Fecha y firma» y el pie');
    return { page: last, caja: { llx: Math.floor(ex), lly, urx: Math.floor(ex) + CAJA.ancho, ury } };
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

/** El ZIP de eDICE: solo la memoria firmada (decisión de Fran, 25/10/2026). */
function comprimir(pdf, zip) {
    return new Promise((ok, ko) => {
        const out = fs.createWriteStream(zip);
        const a = archiver('zip', { zlib: { level: 9 } });
        out.on('close', ok); a.on('error', ko);
        a.pipe(out); a.file(pdf, { name: path.basename(pdf) }); a.finalize();
    });
}

(async () => {
    if (!numero || numero.startsWith('--')) {
        console.log('Uso: node scripts/firmar_memoria_rite.js <nº> [--pdf <ruta>] [--empresa <CIF>] [--escribir]');
        process.exit(1);
    }
    const carpeta = opt('pdf') && !flag('escribir') ? null : await carpetaRite(numero);
    const { buffer, nombre } = await pdfAFirmar(carpeta);
    console.log(`${numero} · firmo «${nombre}» con el representante de ${CIF}`);
    if (leerFirmasPdf(buffer).firmada) throw new Error(`«${nombre}» ya lleva firma electrónica: no se firma otra vez.`);

    const { page, caja } = await colocar(buffer);
    console.log(`Firma en la pág ${page} · ${JSON.stringify(caja)}`);
    const dir = path.join(SCRATCH, numero);
    fs.mkdirSync(dir, { recursive: true });
    const entrada = path.join(dir, 'sin_firmar.pdf');
    const base = `MEMORIA_RITE_${numero}_fdo`;
    const salida = path.join(dir, `${base}.pdf`);
    fs.writeFileSync(entrada, buffer);

    const config = [
        'signatureFormat=PAdES', `signaturePage=${page}`,
        `signaturePositionOnPageLowerLeftX=${caja.llx}`, `signaturePositionOnPageLowerLeftY=${caja.lly}`,
        `signaturePositionOnPageUpperRightX=${caja.urx}`, `signaturePositionOnPageUpperRightY=${caja.ury}`,
        'signatureProductionCity=Tomelloso',
        'layer2Text=$$SUBJECTCN$$ $$SIGNDATE=yyyy.MM.dd HH:mm:ss$$', 'layer2FontSize=9', 'layer2FontFamily=1',
        'obfuscateCertText=false',
    ].join('\\n');
    if (fs.existsSync(salida)) fs.unlinkSync(salida);
    const r = execFileSync(CLI, ['sign', '-i', entrada, '-o', salida, '-format', 'pades', '-store', 'windows',
        '-filter', `thumbprint:SHA1:${huella()}`, '-config', config], { encoding: 'utf8' });
    if (!fs.existsSync(salida)) throw new Error(`AutoFirma no ha firmado: ${r.trim().slice(-300)}`);

    const firmado = fs.readFileSync(salida);
    const lectura = leerFirmasPdf(firmado);
    const quien = (lectura.firmantes || []).map(f => `${f.nombre} (${f.fecha})`).join(', ');
    console.log(`Comprobación: firmada ${lectura.firmada} · íntegra ${lectura.integridad?.ok !== false && !lectura.integridad?.rota} · firma ${quien || '?'}`);
    if (!lectura.firmada || lectura.integridad?.rota) throw new Error('La firma no ha quedado bien: no se sube.');
    if (!(lectura.firmantes || []).some(f => String(f.cn || '').toUpperCase().includes(`R: ${CIF}`))) throw new Error(`El firmante no es el representante de ${CIF}: no se sube.`);

    const zip = path.join(dir, `${base}.zip`);
    await comprimir(salida, zip);
    const png = path.join(dir, 'ultima_pagina.png');
    await vistaPrevia(firmado, png);
    console.log(`PDF firmado: ${salida}\nZIP para eDICE: ${zip}\nVista de la última página: ${png}`);

    if (!flag('escribir')) { console.log(`EN SECO · con --escribir se suben «${base}.pdf» y «${base}.zip» a «${CARPETA_RITE}».`); process.exit(0); }

    for (const [f, mime] of [[salida, 'application/pdf'], [zip, 'application/zip']]) {
        const name = path.basename(f);
        const prev = await driveService.findFileByName(carpeta, name);
        if (prev) await driveService.archiveExistingToOld(carpeta, prev, name);
        const up = await driveService.saveFileToFolder(carpeta, name, mime, fs.readFileSync(f));
        if (!up) throw new Error(`No se ha podido subir ${name}`);
        console.log('SUBIDO:', name, up.link);
    }
    await new Promise(r2 => setTimeout(r2, 1500));
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
