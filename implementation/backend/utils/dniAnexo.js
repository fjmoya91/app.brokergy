// ─── Montaje del Anexo de Cesión firmado A MANO ───────────────────────────────
// Cuando la Cesión se firma de forma MANUSCRITA, el PDF que vale no es el escaneo
// suelto: es el escaneo + el DNI del cliente (las dos caras en UNA página) + el DNI
// del representante de Brokergy como ÚLTIMA página. Así lo exige el verificador para
// dar por identificadas a las dos partes que comparecen en el convenio.
//
// Esto ya lo hacía la subida pública (/firmar-anexos) y solo ella. Vive aquí para que
// la app pueda montar exactamente el MISMO documento cuando el escaneo llega por
// correo/mano y se sube desde el expediente — dos montajes distintos del mismo anexo
// significarían dos documentos distintos delante del verificador.

const { PDFDocument } = require('pdf-lib');

const A4_WIDTH_PT = 595.276;
const A4_HEIGHT_PT = 841.890;

const isPng = (b) => !!b && b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
const isJpg = (b) => !!b && b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
const isPdf = (b) => !!b && b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

/** Una imagen → un PDF de una página del tamaño de la imagen. */
async function imageToPdf(imageBuffer, mimeType) {
    const pdfDoc = await PDFDocument.create();
    const png = mimeType === 'image/png' || (!mimeType && isPng(imageBuffer));
    const img = png ? await pdfDoc.embedPng(imageBuffer) : await pdfDoc.embedJpg(imageBuffer);
    const { width, height } = img.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
    return Buffer.from(await pdfDoc.save());
}

// Une varias imágenes en un único PDF (una imagen por página, sin reescalar).
// pdf-lib solo sabe embeber JPG y PNG: detectamos el formato por los bytes mágicos
// y omitimos lo que no sea embebible (HEIC/webp…). Devuelve el buffer + cuántas
// se incluyeron / se omitieron para poder avisar al usuario.
async function imagesToPdf(images) {
    const pdfDoc = await PDFDocument.create();
    let added = 0, skipped = 0;
    for (const { buffer } of images) {
        try {
            let img;
            if (isPng(buffer)) img = await pdfDoc.embedPng(buffer);
            else if (isJpg(buffer)) img = await pdfDoc.embedJpg(buffer);
            else { skipped++; continue; }
            const { width, height } = img.scale(1);
            const page = pdfDoc.addPage([width, height]);
            page.drawImage(img, { x: 0, y: 0, width, height });
            added++;
        } catch (e) {
            console.warn('[imagesToPdf] no se pudo embeber una imagen:', e.message);
            skipped++;
        }
    }
    const pdf = Buffer.from(await pdfDoc.save());
    return { pdf, added, skipped };
}

// Coloca las DOS caras del DNI (imágenes) en UNA sola página A4 (delante arriba,
// detrás abajo), centradas. Devuelve el buffer PDF de 1 página, o null si algún
// lado no es imagen embebible (PDF/HEIC…) → el llamador cae al modo antiguo.
async function dniTwoSidesOnePage(frontBuf, backBuf) {
    const embedImg = async (doc, buf) => {
        if (!buf || buf.length < 4) return null;
        try {
            if (isPng(buf)) return await doc.embedPng(buf);
            if (isJpg(buf)) return await doc.embedJpg(buf);
        } catch (e) { console.warn('[dniOnePage] no embebible:', e.message); }
        return null;
    };
    const doc = await PDFDocument.create();
    const page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const margin = 40;
    const gap = 24;
    const halfH = (A4_HEIGHT_PT - margin * 2 - gap) / 2;
    const maxW = A4_WIDTH_PT - margin * 2;
    const drawImg = (img, topY) => {
        const s = Math.min(maxW / img.width, halfH / img.height);
        const w = img.width * s, h = img.height * s;
        page.drawImage(img, { x: (A4_WIDTH_PT - w) / 2, y: topY - h, width: w, height: h });
    };
    const imgF = await embedImg(doc, frontBuf);
    const imgB = await embedImg(doc, backBuf);
    if (!imgF || !imgB) return null;   // alguna cara no es imagen → modo antiguo
    drawImg(imgF, A4_HEIGHT_PT - margin);                         // arriba
    drawImg(imgB, A4_HEIGHT_PT - margin - halfH - gap);           // abajo
    return Buffer.from(await doc.save());
}

// DNI del representante de Brokergy (se anexa a la Cesión manuscrita). Se lee de
// backend/assets/dni_representante.(pdf|jpg|png) si el fichero existe.
function readRepresentanteDni() {
    const fs = require('fs'); const path = require('path');
    for (const ext of ['pdf', 'jpg', 'jpeg', 'png']) {
        const p = path.join(__dirname, '..', 'assets', `dni_representante.${ext}`);
        try { if (fs.existsSync(p)) return { buffer: fs.readFileSync(p), ext }; } catch (e) {}
    }
    return null;
}

// Concatena un PDF principal con varios PDF anexo, normalizando cada página
// anexada a A4 (escalada y centrada). Se usa para anexar el DNI (delante + detrás)
// al final del Anexo de Cesión firmado a mano.
async function mergePdfs(mainBuffer, annexBuffers) {
    if (!annexBuffers || annexBuffers.length === 0) return mainBuffer;
    const merged = await PDFDocument.load(mainBuffer);
    for (const buf of annexBuffers) {
        if (!buf || buf.length === 0) continue;
        try {
            const annexDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
            const indices = annexDoc.getPageIndices();
            const embedded = await merged.embedPdf(annexDoc, indices);
            for (const ep of embedded) {
                const page = merged.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
                const { width: w, height: h } = ep;
                const scale = Math.min(A4_WIDTH_PT / w, A4_HEIGHT_PT / h);
                const drawW = w * scale;
                const drawH = h * scale;
                page.drawPage(ep, { x: (A4_WIDTH_PT - drawW) / 2, y: (A4_HEIGHT_PT - drawH) / 2, width: drawW, height: drawH });
            }
        } catch (e) {
            console.warn('[mergePdfs] Skip anexo no parseable:', e.message);
        }
    }
    return Buffer.from(await merged.save());
}

/**
 * ¿El PDF lleva una firma ELECTRÓNICA incrustada?
 *
 * Un PDF firmado con Autofirma/AdobeSign trae un diccionario de firma con `/ByteRange`
 * y un subfiltro `adbe.pkcs7.*` o `ETSI.CAdES.*`. Un escaneo (o una foto convertida a
 * PDF) no tiene nada de eso — y ésa es justo la señal de que la firma es MANUSCRITA y
 * hay que anexarle los DNI. Se mira sobre los bytes crudos, sin parsear: es una
 * comprobación de milisegundos sobre ficheros de decenas de MB.
 *
 * Ante la duda responde `true` (parece firmado): equivocarse por exceso solo hace que
 * se suba tal cual, mientras que equivocarse por defecto anexaría DNI a un documento
 * que ya está firmado electrónicamente.
 */
function tieneFirmaElectronica(buffer) {
    if (!isPdf(buffer)) return false;                 // una foto/JPG nunca lo es
    const txt = buffer.toString('latin1');
    if (!txt.includes('/ByteRange')) return false;
    return /\/SubFilter\s*\/(adbe\.pkcs7|adbe\.x509|ETSI\.CAdES|ETSI\.RFC3161)/.test(txt)
        || /\/Type\s*\/Sig\b/.test(txt);
}

/**
 * Monta el Anexo de Cesión manuscrito definitivo:
 *   [escaneo firmado] + [DNI del cliente: 1 página con las 2 caras] + [DNI del representante]
 *
 * @param {Buffer} cesionBuffer   escaneo del anexo firmado (PDF o imagen)
 * @param {string} cesionMime     su mimetype (para convertir si es imagen)
 * @param {object} opts
 *   - dniFront/dniBack {Buffer}  caras del DNI del cliente (imágenes)
 *   - dniPdf {Buffer}            página de DNI ya montada (p. ej. la que ya tiene el
 *                                expediente en Drive) — se usa si no llegan las caras
 * @returns {{ pdf: Buffer, dniPage: Buffer|null, incluidos: string[], faltan: string[] }}
 *   `dniPage` es la página de DNI recién montada (null si se reutilizó una previa),
 *   para que el llamador la archive en Drive sin volver a componerla.
 */
async function buildCesionManuscrita(cesionBuffer, cesionMime, opts = {}) {
    const incluidos = ['Anexo firmado'];
    const faltan = [];

    let pdf = isPdf(cesionBuffer) ? cesionBuffer : await imageToPdf(cesionBuffer, cesionMime);

    // DNI del cliente: las dos caras recién subidas mandan sobre la página que ya
    // hubiera en el expediente (si se vuelven a subir es porque las anteriores no valían).
    let dniPage = null;
    if (opts.dniFront && opts.dniBack) {
        dniPage = await dniTwoSidesOnePage(opts.dniFront, opts.dniBack);
    }
    const dniAnexar = dniPage || opts.dniPdf || null;
    if (dniAnexar) incluidos.push('DNI del cliente');
    else faltan.push('DNI del cliente');

    // DNI del representante de Brokergy: SIEMPRE la última página.
    const rep = readRepresentanteDni();
    let repPdf = null;
    if (rep) {
        try {
            repPdf = rep.ext === 'pdf'
                ? rep.buffer
                : await imageToPdf(rep.buffer, rep.ext === 'png' ? 'image/png' : 'image/jpeg');
            incluidos.push('DNI del representante de Brokergy');
        } catch (e) {
            console.warn('[cesion-manuscrita] DNI del representante no anexable:', e.message);
            faltan.push('DNI del representante de Brokergy');
        }
    } else {
        faltan.push('DNI del representante de Brokergy');
    }

    const annexes = [dniAnexar, repPdf].filter(Boolean);
    if (annexes.length) pdf = await mergePdfs(pdf, annexes);

    return { pdf, dniPage, incluidos, faltan };
}

module.exports = {
    A4_WIDTH_PT,
    A4_HEIGHT_PT,
    isPdf,
    imageToPdf,
    imagesToPdf,
    dniTwoSidesOnePage,
    readRepresentanteDni,
    mergePdfs,
    tieneFirmaElectronica,
    buildCesionManuscrita,
};
