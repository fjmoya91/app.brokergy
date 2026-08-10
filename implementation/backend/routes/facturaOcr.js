/**
 * routes/facturaOcr — Lectura de FACTURAS y PRESUPUESTOS de obra **sin expediente**.
 *
 * El gemelo de `expedientes/:id/facturas/ocr` para el momento en que todavía NO hay
 * expediente: la toma de datos de una nueva simulación. Mismo servicio de extracción
 * (`facturaOcrService`) y misma normalización a PDF (`ceeOcrService.normalizeToPdf`,
 * que une fotos sueltas antes de leer), pero:
 *
 *   · NO guarda nada en Drive — aún no hay carpeta a la que subir. Los ficheros
 *     originales se quedan en el navegador y se suben a su slot en cuanto la
 *     oportunidad existe (ver ReformaSubFlow.subirDocsPendientes).
 *   · NO detecta incidencias — el filtro previo de `facturaIncidencias` cruza contra
 *     el expediente (titular, instalador, alcance de la ficha), y aquí no hay contra
 *     qué cruzar. Las incidencias se levantan luego, al aceptar.
 *
 * staffOnly: la factura lleva importes, y los importes no salen del staff
 * (misma regla que el panel de facturación).
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, staffOnly } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 20 },
});

function uploadFiles(req, res, next) {
    upload.array('files', 20)(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Algún fichero supera los 25 MB.' });
            console.error('[facturaOcr/lead] multer:', err.message);
            return res.status(400).json({ error: 'No se pudieron procesar los ficheros.' });
        }
        next();
    });
}

/** Importe SIN IVA del documento. Si no hay base imponible declarada, se suma el desglose. */
function baseImponible(ocr) {
    const base = ocr?.totales?.base_imponible;
    if (Number.isFinite(base) && base > 0) return base;
    const suma = (ocr?.lineas || []).reduce((acc, l) => acc + (Number(l?.importe_total) || 0), 0);
    return suma > 0 ? Math.round(suma * 100) / 100 : 0;
}

/**
 * POST /api/factura-ocr/extract
 * Body multipart: files[] (1 PDF o N imágenes) + tipo = 'factura' | 'presupuesto'
 *
 * Respuesta: { ok, tipo, doc, equipos, ocr }
 *   doc     — fila con la MISMA forma que `expedientes.documentacion.facturas[]`, para
 *             que al aceptar la oportunidad se vuelque tal cual (menos drive_link/id,
 *             que se rellenan al subirla).
 *   equipos — marca/modelo/nº de serie leídos en las líneas, para pre-rellenar la
 *             pestaña Instalación del expediente sin volver a leer nada.
 */
router.post('/extract', requireAuth, staffOnly, uploadFiles, async (req, res) => {
    try {
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: 'No se recibió ningún fichero (campo "files").' });

        const tipo = String(req.body?.tipo || 'factura').toLowerCase() === 'presupuesto' ? 'presupuesto' : 'factura';

        // 1) Normalizar a PDF (varias fotos de una factura se unen en un solo PDF).
        const ceeOcrService = require('../services/ceeOcrService');
        let pdf;
        try {
            ({ pdf } = await ceeOcrService.normalizeToPdf(files));
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        // 2) Leer.
        const facturaOcrService = require('../services/facturaOcrService');
        let ocr;
        try {
            ocr = await facturaOcrService.extractFacturaFromPdf(pdf);
        } catch (e) {
            console.error('[facturaOcr/lead] extracción falló:', e.message);
            return res.status(e.status === 429 ? 429 : 502).json({ error: 'La lectura falló: ' + e.message });
        }

        const partidas = [...new Set((ocr.lineas || [])
            .map(l => String(l?.partida || '').trim().toUpperCase())
            .filter(Boolean))];

        // Equipos citados en las líneas: es lo que después hay que teclear a mano en
        // Instalación (marca/modelo/nº de serie van al CIFO y al Anexo I).
        const equipos = (ocr.lineas || [])
            .filter(l => l?.marca || l?.modelo || l?.numero_serie)
            .map(l => ({
                partida: l.partida || 'OTROS',
                marca: l.marca || null,
                modelo: l.modelo || null,
                numero_serie: l.numero_serie || null,
                descripcion: l.descripcion || null,
            }));

        return res.json({
            ok: true,
            tipo,
            provider: facturaOcrService.PROVIDER,
            doc: {
                tipo,
                numero_factura: ocr.numero_factura || '',
                fecha_factura: ocr.fecha_factura || null,
                importe_sin_iva: baseImponible(ocr),
                importe_total: ocr.totales?.total ?? null,
                emisor_nombre: ocr.emisor?.nombre || null,
                emisor_nif: ocr.emisor?.nif || null,
                cliente_nombre: ocr.cliente?.nombre || null,
                cliente_nif: ocr.cliente?.nif || null,
                partidas,
                origen: 'ocr',
                validada: false,
                drive_link: null,
                drive_id: null,
            },
            equipos,
            ocr,
        });
    } catch (err) {
        console.error('Error POST /api/factura-ocr/extract:', err);
        res.status(500).json({ error: 'Error procesando el documento', details: err.message });
    }
});

module.exports = router;
