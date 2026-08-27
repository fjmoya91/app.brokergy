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

// Tipo que se aplica cuando el documento NO declara ninguno. No es un dato: es una
// suposición, y por eso todo lo que sale de aquí viaja marcado `iva_estimado` para
// que la pantalla lo diga y una persona pueda corregirlo.
const IVA_DEFECTO_PCT = 21;

const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Los DOS importes del documento, que NO son el mismo dinero:
 *
 *   · sinIva — la BASE IMPONIBLE. Es la inversión que declara el Anexo del expediente
 *              (`documentacion.facturas[].importe_sin_iva`) y no cambia: el CAE se
 *              justifica sobre la base, no sobre lo que se pagó de impuestos.
 *   · conIva — el TOTAL A PAGAR. Es lo que se vuelca a la economía de la oportunidad
 *              (`funnel.presupuesto_eur` → `inputs.presupuesto`), porque el titular
 *              casi siempre es un PARTICULAR: no se deduce el IVA, así que su
 *              inversión real —la que compara con el bono y con la deducción de la
 *              renta— lo incluye. Con la base a secas, la propuesta le prometía un
 *              coste ~21 % más barato del que iba a pagar.
 *
 * Se deriva uno del otro solo cuando el documento no trae los dos escritos, y
 * SIEMPRE por el camino más fiable disponible: cuota declarada > tipo declarado >
 * tipo por defecto (y este último, marcado como estimado).
 *
 * Exportada para poder probarla sin gastar una llamada al OCR.
 */
function importesDocumento(ocr) {
    const sumaLineas = (ocr?.lineas || []).reduce((acc, l) => acc + (Number(l?.importe_total) || 0), 0);
    const base = pos(ocr?.totales?.base_imponible) ?? pos(r2(sumaLineas));
    const total = pos(ocr?.totales?.total);
    const cuota = pos(ocr?.totales?.iva_importe);
    const pct = pos(ocr?.totales?.iva_pct);

    const ok = (sinIva, conIva, ivaPct, ivaEstimado) => ({
        sinIva: r2(sinIva), conIva: r2(conIva), ivaPct: r2(ivaPct), ivaEstimado,
    });

    if (base) {
        // El documento declara las dos cifras: no hay nada que calcular.
        if (total && total > base) return ok(base, total, ((total / base) - 1) * 100, false);
        if (cuota) return ok(base, base + cuota, (cuota / base) * 100, false);
        if (pct) return ok(base, base * (1 + pct / 100), pct, false);
        // Presupuesto que solo suma las partidas y no llega a poner el IVA: es el
        // caso que motiva todo esto. Se estima al tipo general y se avisa.
        return ok(base, base * (1 + IVA_DEFECTO_PCT / 100), IVA_DEFECTO_PCT, true);
    }

    if (total) {
        // Sin base (al modelo se le prohíbe calcularla él). El total de un documento
        // español es el importe A PAGAR, así que es el de con IVA.
        if (cuota && cuota < total) return ok(total - cuota, total, (cuota / (total - cuota)) * 100, false);
        if (pct) return ok(total / (1 + pct / 100), total, pct, false);
        return ok(total / (1 + IVA_DEFECTO_PCT / 100), total, IVA_DEFECTO_PCT, true);
    }

    return ok(0, 0, 0, false);
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

        const imp = importesDocumento(ocr);

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
                // Las dos cifras viajan siempre: la base es la del Anexo del
                // expediente; el total con IVA es el que manda en la economía de la
                // oportunidad (ver importesDocumento).
                importe_sin_iva: imp.sinIva,
                importe_total: imp.conIva,
                iva_pct: imp.ivaPct,
                iva_estimado: imp.ivaEstimado,
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
module.exports.importesDocumento = importesDocumento;
