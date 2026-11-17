// Contrafirma como «EL PROVEEDOR» el Anexo I del LOTE (Listado de cesión de ahorros) que
// el S.O. devuelve firmado solo por él, lo registra y deja la pieza como la pide Marwen.
//
//   node implementation/backend/scripts/contrafirmar_anexo_i_lote.js LOTE-AAAA-NNN --pdf "<PDF del S.O.>" [--escribir]
//
// El buzón del S.O. (regla 141) deja SIN registrar un Anexo I con una sola firma
// («El Anexo I debe llevar DOS firmas»). Fran, 11/11/2026: «si falta que firme yo el
// anexo I, lo firmas». Hasta ahora se hacía con scripts sueltos (LOTE-2026-015, 019 y
// 016); este es el mismo camino, de una vez:
//   1. Comprueba que el PDF lleva UNA firma, íntegra y que no es la de Brokergy, y que la
//      casilla de «EL PROVEEDOR» está donde la espera la caja (formato oficial apaisado).
//   2. Lo firma con AutoFirma y el certificado de representante, SIN pdf-lib (rompería la
//      firma del S.O.). Rúbrica = logo circular a 1,5 px/pt (la línea de órdenes corta a
//      32 KB); `layer2Text` en UNA línea (un \n parte la configuración y se pierde la fecha).
//   3. `procesarFirmados` (EN SECO sin --escribir): con --escribir lo registra, y
//      `colocarRefirmados` lo pone en todas las E{n} y en «N. REQUERIMIENTO» (lo anterior, a OLD).
//   4. Con --escribir, renombra esas copias `…_revN_fdo.pdf` → `…_vN.pdf` (como el resto de
//      piezas corregidas que se entregan al verificador).
// La firma del paso 2 es local (no sube nada) y se hace también en seco, para enseñarla.
// Doc: docs/conocimiento/lotes/contestar-inexactitudes-en-el-portal-de-marwen.md
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { leerFirmasPdf } = require('../utils/firmasPdf');
const { CIF_BROKERGY } = require('../services/ceeFirmaService');

const args = process.argv.slice(2);
const codigo = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const ESCRIBIR = args.includes('--escribir');
const FE = path.join(__dirname, '..', '..', 'frontend');
const CLI = process.env.AUTOFIRMA_CLI || 'C:\\Program Files\\AutoFirma\\Autofirma\\AutofirmaCommandLine.exe';
const SCRATCH = path.join(__dirname, '..', 'scratch', 'contrafirmar-anexo-i');
// La casilla de «EL PROVEEDOR» en el Anexo I oficial apaisado (842 × 596 pt), pág. 1.
const CAJA = { page: 1, llx: 160, lly: 39, urx: 366, ury: 105 };
const RUBRICA_PX_PT = 1.5;
const FOLDER = 'application/vnd.google-apps.folder';
const RE_ANEXO = (lote) => new RegExp(`^(E\\d+|E1a\\d+)-1-1 - ${lote} - ANEXO I LISTADO CESION_rev(\\d+)_fdo\\.pdf$`);

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
class NoSeSigue extends Error {}
const fallo = (m) => { throw new NoSeSigue(m); };

async function comprobarCasilla(buffer) {
    const pdfjs = await import(pathToFileURL(path.join(FE, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
    const pag = await doc.getPage(CAJA.page);
    const [, , w, h] = pag.view;
    if (!(w > h)) fallo(`la pág. ${CAJA.page} no es apaisada (${Math.round(w)}×${Math.round(h)}): no es el formato oficial, la caja no vale.`);
    const items = (await pag.getTextContent()).items;
    const prov = items.find(i => norm(i.str) === 'EL PROVEEDOR');
    const x = prov?.transform[4], y = prov?.transform[5];
    if (!prov || !(x >= CAJA.llx - 20 && x <= CAJA.urx) || !(y > CAJA.ury && y < CAJA.ury + 40)) {
        fallo(`«EL PROVEEDOR» no está encima de la caja ${JSON.stringify(CAJA)} (${JSON.stringify({ x, y })}): la plantilla ha cambiado.`);
    }
    return { paginas: doc.numPages };
}

async function rubrica() {
    const { createCanvas, loadImage } = (await import(pathToFileURL(path.join(FE, 'node_modules/@napi-rs/canvas/index.js')).href)).default;
    const img = await loadImage(path.join(FE, 'public', 'logo-brokergy-circular-transparent.png'));
    const cw = Math.round((CAJA.urx - CAJA.llx) * RUBRICA_PX_PT), ch = Math.round((CAJA.ury - CAJA.lly) * RUBRICA_PX_PT);
    const cv = createCanvas(cw, ch);
    const s = Math.min(cw / img.width, ch / img.height);
    cv.getContext('2d').drawImage(img, (cw - img.width * s) / 2, (ch - img.height * s) / 2, img.width * s, img.height * s);
    return cv.toBuffer('image/png').toString('base64');
}

function huella() {
    if (process.env.CEE_FIRMA_HUELLA) return process.env.CEE_FIRMA_HUELLA.trim();
    const ps = `Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) -and $_.Subject -match 'R: ${CIF_BROKERGY}' -and $_.Subject -match 'MOYA' } | Sort-Object NotAfter -Descending | Select-Object -First 1 -ExpandProperty Thumbprint`;
    const h = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
    if (!/^[0-9A-F]{40}$/i.test(h)) fallo('no encuentro el certificado de representante de Brokergy vigente en el almacén de Windows.');
    return h;
}

/** Las carpetas donde `colocarRefirmados` deja la copia: la «E{n}» de cada expediente y las «N. REQUERIMIENTO». */
async function carpetasDelAnexo(lote) {
    const { carpetaDeExpediente } = require('../services/expedienteFolderSync');
    const { data: exps, error } = await supabase.from('expedientes')
        .select('id, numero_expediente, oportunidad_id, orden:instalacion->verificacion->>orden_actuacion').eq('lote_id', lote.id);
    if (error) throw new Error(`Supabase: ${error.message}`);
    const out = [];
    for (const e of exps || []) {
        if (!Number(e.orden)) continue;
        const raiz = await carpetaDeExpediente(e);
        const c = raiz ? await driveService.findSubfolderByName(raiz, `E${Number(e.orden)}`) : null;
        if (c) out.push({ id: c, nombre: `E${Number(e.orden)} (${e.numero_expediente})` });
        else console.log(`  aviso: ${e.numero_expediente} no tiene carpeta E${Number(e.orden)}`);
    }
    for (const f of (await driveService.listFiles(lote.drive_folder_id) || [])) {
        if (f.mimeType === FOLDER && /^\d+\. REQUERIMIENTO$/.test(f.name)) out.push({ id: f.id, nombre: f.name });
    }
    return out;
}

(async () => {
    if (!/^LOTE-\d{4}-\d{3}$/.test(codigo || '') || !opt('pdf')) {
        fallo('uso: node scripts/contrafirmar_anexo_i_lote.js LOTE-AAAA-NNN --pdf "<PDF devuelto por el S.O.>" [--escribir]');
    }
    const { data: lote, error } = await supabase.from('lotes')
        .select('id, codigo, drive_folder_id, documentos_so').eq('codigo', codigo).maybeSingle();
    if (error) fallo(`Supabase: ${error.message}`);
    if (!lote) fallo(`no encuentro ${codigo}`);
    const d = (lote.documentos_so || []).find(x => x?.key === 'anexo_i');
    if (!d) fallo(`${codigo} no tiene Anexo I del lote.`);
    if (d.signed_at || d.signed_file_id) fallo(`el Anexo I de ${codigo} ya consta firmado (${d.signed_at || d.signed_file_id}): nada que contrafirmar.`);
    const rev = Number(d.rev) || 0;
    const nombreEnviado = d.file_name || `2. Anexo I ${codigo}${rev ? `_rev${rev}` : ''}.pdf`;
    console.log(`${codigo} · Anexo I enviado: «${nombreEnviado}» (rev ${rev}${d.requerimiento_at ? `, requerimiento ${d.requerimiento_at.slice(0, 10)}` : ''})`);

    // 1) El PDF del S.O.: una firma, íntegra, no nuestra; la casilla, en su sitio.
    const src = fs.readFileSync(opt('pdf'));
    const l0 = leerFirmasPdf(src);
    if (l0.n !== 1) fallo(`el PDF lleva ${l0.n} firmas; se espera solo la del S.O.`);
    if (l0.integridad?.rota) fallo('la firma del S.O. no está íntegra.');
    if (String(l0.firmantes?.[0]?.cn || '').includes(`R: ${CIF_BROKERGY}`)) fallo('la única firma es la de Brokergy, no la del S.O.');
    await comprobarCasilla(src);
    console.log(`Firma del S.O.: ${l0.firmantes[0].cn} · ${l0.firmantes[0].fecha} · íntegra`);

    // 2) Firmar como proveedor (local).
    const dir = path.join(SCRATCH, codigo);
    fs.mkdirSync(dir, { recursive: true });
    const entrada = path.join(dir, 'del_so.pdf');
    const salida = path.join(dir, nombreEnviado.replace(/\.pdf$/i, '_fdo.pdf'));
    fs.writeFileSync(entrada, src);
    const config = [
        'signatureFormat=PAdES', `signaturePage=${CAJA.page}`,
        `signaturePositionOnPageLowerLeftX=${CAJA.llx}`, `signaturePositionOnPageLowerLeftY=${CAJA.lly}`,
        `signaturePositionOnPageUpperRightX=${CAJA.urx}`, `signaturePositionOnPageUpperRightY=${CAJA.ury}`,
        'signatureProductionCity=Tomelloso',
        'layer2Text=Firmado por $$SUBJECTCN$$ - Fecha: $$SIGNDATE=dd/MM/yyyy HH:mm:ss$$', 'layer2FontSize=8',
        'obfuscateCertText=false', `signatureRubricImage=${await rubrica()}`,
    ].join('\\n');
    if (fs.existsSync(salida)) fs.unlinkSync(salida);
    const r = execFileSync(CLI, ['sign', '-i', entrada, '-o', salida, '-format', 'pades', '-store', 'windows',
        '-filter', `thumbprint:SHA1:${huella()}`, '-config', config], { encoding: 'utf8' });
    if (!fs.existsSync(salida)) fallo(`AutoFirma no ha firmado: ${r.trim().slice(-300)}`);
    const firmado = fs.readFileSync(salida);
    const l = leerFirmasPdf(firmado);
    const quien = (l.firmantes || []).map(f => `${f.cn} (${f.fecha})`).join(' | ');
    if (l.n !== 2 || l.integridad?.rota || !String(l.firmantes[1]?.cn || '').includes(`R: ${CIF_BROKERGY}`)) {
        fallo(`la contrafirma no ha quedado bien: ${quien}`);
    }
    console.log(`Contrafirmado: ${quien} · las dos íntegras\nPDF: ${salida}`);

    // 3) Registrar (en seco sin --escribir).
    const { procesarFirmados } = require('../services/firmadosSo');
    const res = await procesarFirmados(lote.id, [{ nombre: nombreEnviado, buffer: firmado }], {
        dryRun: !ESCRIBIR, noReemplazar: true, usuario: 'Francisco Javier',
        origen: `contrafirmado por Brokergy sobre el devuelto por el S.O. (${path.basename(opt('pdf'))})`,
    });
    const x = (res.resultados || [])[0] || {};
    console.log(`Registro${ESCRIBIR ? '' : ' (EN SECO)'}: ${x.estado || '?'}${x.registrado ? ' · registrado' : ''}`
        + `${(x.avisos || []).length ? ` · avisos: ${x.avisos.join('; ')}` : ''}${(x.faltan || []).length ? ` · faltan: ${JSON.stringify(x.faltan)}` : ''}`);
    if (x.estado !== 'listo') fallo('procesarFirmados no lo da por bueno: no se registra.');
    if (!ESCRIBIR) { console.log('EN SECO · con --escribir se registra, se coloca en las E{n} y en «N. REQUERIMIENTO» y se renombra a _vN.'); process.exit(0); }
    if (!x.registrado) fallo('no ha quedado registrado.');
    if (res.paquete?.texto) console.log(`Paquete: ${res.paquete.texto}`);

    // 4) _revN_fdo → _vN en las copias.
    let n = 0;
    for (const c of await carpetasDelAnexo(lote)) {
        for (const f of (await driveService.listFiles(c.id) || []).filter(f => RE_ANEXO(codigo).test(f.name))) {
            const nuevo = f.name.replace(/_rev(\d+)_fdo\.pdf$/, '_v$1.pdf');
            if (!(await driveService.renameFolder(f.id, nuevo))) fallo(`no se ha podido renombrar «${f.name}» en ${c.nombre}`);
            console.log(`  ${c.nombre}: ${nuevo}`);
            n++;
        }
    }
    console.log(`Renombrados a _vN: ${n}`);
    process.exit(0);
})().catch(e => { console.error(e instanceof NoSeSigue ? `NO SE SIGUE: ${e.message}` : `ERROR ${e.message}`); process.exitCode = 1; setTimeout(() => process.exit(1), 50); });
