const express = require('express');
const router = express.Router();
const multer = require('multer');
const { adminOnly } = require('../middleware/auth');
const ceeOcrService = require('../services/ceeOcrService');

// Subida en memoria: PDF del CEE o varias imágenes (que uniremos a PDF).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 }, // 25MB/fichero, hasta 20
});

function uploadFiles(req, res, next) {
  upload.array('files', 20)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Algún fichero supera los 25 MB.' });
      }
      console.error('[ceeOcr] multer error:', err.message);
      return res.status(400).json({ error: 'No se pudieron procesar los ficheros.' });
    }
    next();
  });
}

/**
 * POST /api/cee-ocr/extract   (solo ADMIN)
 * Body multipart: files[] = 1 PDF del CEE  ó  N imágenes (JPG/PNG) que se unen a PDF.
 * Respuesta: { data, pdfBase64, source, mergedPages, skippedImages }
 *   - data: JSON estructurado del CEE (ver ceeOcrService).
 *   - pdfBase64: el PDF resultante (para guardarlo luego en el slot DOC_CEE_PREVIO).
 */
router.post('/extract', adminOnly, uploadFiles, async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No se recibió ningún fichero (campo "files").' });
    }

    const { pdf, source, added, skipped } = await ceeOcrService.normalizeToPdf(files);

    let data;
    try {
      data = await ceeOcrService.extractCeeFromPdf(pdf);
    } catch (e) {
      const status = e.status === 429 ? 429 : 502;
      console.error('[ceeOcr] extracción falló:', e.message);
      return res.status(status).json({ error: 'La extracción OCR falló: ' + e.message });
    }

    res.json({
      ok: true,
      provider: ceeOcrService.PROVIDER,
      source,                       // 'pdf' | 'images'
      mergedPages: source === 'images' ? added : undefined,
      skippedImages: skipped || 0,
      pdfBase64: pdf.toString('base64'),
      data,
    });
  } catch (err) {
    console.error('[ceeOcr] error:', err.message);
    res.status(400).json({ error: err.message || 'Error procesando el CEE.' });
  }
});

/**
 * POST /api/cee-ocr/merge   (solo ADMIN) — botón "Convertir a PDF"
 * Une N imágenes en un único PDF sin lanzar OCR. Respuesta: { pdfBase64, pages, skipped }.
 */
router.post('/merge', adminOnly, uploadFiles, async (req, res) => {
  try {
    const files = req.files || [];
    const images = files
      .filter((f) => (f.mimetype || '').startsWith('image/'))
      .map((f) => f.buffer);
    if (images.length === 0) return res.status(400).json({ error: 'No se recibieron imágenes.' });
    const { pdf, added, skipped } = await ceeOcrService.imagesToPdf(images);
    if (added === 0) return res.status(400).json({ error: 'No se pudo convertir ninguna imagen (¿HEIC/webp?).' });
    res.json({ ok: true, pdfBase64: pdf.toString('base64'), pages: added, skipped });
  } catch (err) {
    console.error('[ceeOcr] merge error:', err.message);
    res.status(400).json({ error: err.message || 'Error uniendo imágenes.' });
  }
});

module.exports = router;
