// ─── facturasCombineService ──────────────────────────────────────────────────
// Combina varias facturas de Drive (PDFs e imágenes) en un ÚNICO PDF, conservando
// los originales. Solo depende de pdf-lib + driveService (seguro para el servidor;
// NO requerir reformaUploadService aquí para no arrastrar whatsappService).

const { PDFDocument } = require('pdf-lib');
const driveService = require('./driveService');

// Detección de formato por bytes de cabecera (no depende de un mimeType fiable).
function sniff(buf) {
    if (!buf || buf.length < 4) return null;
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf'; // %PDF
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpg';                                        // JPEG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';  // PNG
    return null;
}

/**
 * Combina los ficheros indicados en un único PDF.
 * @param {Array<{id:string,name?:string}>} files ficheros de Drive a fusionar (en orden).
 * @returns {Promise<{buffer:Buffer, pages:number, skipped:string[]}|null>} null si no se añadió ninguna página.
 */
async function combineFilesToPdf(files) {
    const out = await PDFDocument.create();
    const skipped = [];
    let pages = 0;

    for (const f of files) {
        try {
            const buf = await driveService.getFileContent(f.id);
            if (!buf || !buf.length) { skipped.push(f.name || f.id); continue; }

            const name = f.name || '';
            const kind = sniff(buf)
                || (/\.pdf$/i.test(name) ? 'pdf'
                    : /\.png$/i.test(name) ? 'png'
                    : /\.jpe?g$/i.test(name) ? 'jpg' : null);

            if (kind === 'pdf') {
                const src = await PDFDocument.load(buf, { ignoreEncryption: true });
                const copied = await out.copyPages(src, src.getPageIndices());
                copied.forEach(p => out.addPage(p));
                pages += copied.length;
            } else if (kind === 'jpg' || kind === 'png') {
                const img = kind === 'png' ? await out.embedPng(buf) : await out.embedJpg(buf);
                const { width, height } = img.scale(1);
                const page = out.addPage([width, height]);
                page.drawImage(img, { x: 0, y: 0, width, height });
                pages += 1;
            } else {
                skipped.push(name || f.id);
            }
        } catch (e) {
            console.warn(`[FacturasCombine] Error añadiendo "${f.name || f.id}":`, e.message);
            skipped.push(f.name || f.id);
        }
    }

    if (!pages) return null;
    return { buffer: Buffer.from(await out.save()), pages, skipped };
}

module.exports = { combineFilesToPdf };
