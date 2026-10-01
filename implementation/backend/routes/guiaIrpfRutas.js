// ─── guiaIrpfRutas.js ────────────────────────────────────────────────────────
// Las rutas de la GUÍA de la deducción del IRPF, montadas en LOS DOS negocios:
// `/api/expedientes/:id/guia-irpf…` y `/api/cee-directos/:id/guia-irpf…`.
//
// El módulo CEE es el MISMO componente en los dos y llama a
// `${apiBase}/${id}/guia-irpf` sin saber en cuál está: un endpoint declarado en
// una sola de las dos rutas deja el botón muerto en la otra. Se monta desde aquí
// para que los dos sean literalmente el mismo código.
//
// staffOnly: lleva importes de facturas y le escribe al cliente.
//
//   GET  /:id/guia-irpf            lo que pinta el popup (con los ajustes guardados)
//   POST /:id/guia-irpf/estado     lo mismo, recompuesto con los ajustes del popup
//   POST /:id/guia-irpf/pdf        el PDF (vista previa y descarga)
//   POST /:id/guia-irpf/ajustes    guarda SOLO los ajustes del popup (autoguardado)
//   POST /:id/guia-irpf/guardar    lo guarda en Drive y lo sella (portal del cliente)
//   POST /:id/guia-irpf/enviar     certificados + guía al cliente por email/WhatsApp

const guiaIrpf = require('../services/guiaIrpfService');

const usuarioDe = (req) => req.user?.email || req.user?.nombre || null;

function responderError(res, err, etiqueta, porDefecto) {
    if (!err.status || err.status >= 500) console.error(`[guia-irpf ${etiqueta}]`, err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : porDefecto });
}

function montarGuiaIrpf(router, origen, { staffOnly }) {
    router.get('/:id/guia-irpf', staffOnly, async (req, res) => {
        try { res.json(await guiaIrpf.estado(origen, req.params.id)); }
        catch (err) { responderError(res, err, 'estado', 'No se pudo preparar la guía'); }
    });

    router.post('/:id/guia-irpf/estado', staffOnly, async (req, res) => {
        try { res.json(await guiaIrpf.estado(origen, req.params.id, req.body || {})); }
        catch (err) { responderError(res, err, 'estado', 'No se pudo preparar la guía'); }
    });

    router.post('/:id/guia-irpf/pdf', staffOnly, async (req, res) => {
        try {
            const { buffer, filename } = await guiaIrpf.pdf(origen, req.params.id, req.body || {});
            res.setHeader('Content-Type', 'application/pdf');
            // Con tilde y guion largo: va también en filename* (RFC 5987).
            res.setHeader('Content-Disposition',
                `inline; filename="${filename.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
            res.send(buffer);
        } catch (err) { responderError(res, err, 'pdf', 'No se pudo generar la guía'); }
    });

    router.post('/:id/guia-irpf/ajustes', staffOnly, async (req, res) => {
        try { res.json(await guiaIrpf.guardarAjustes(origen, req.params.id, req.body || {}, { usuario: usuarioDe(req) })); }
        catch (err) { responderError(res, err, 'ajustes', 'No se pudieron guardar los ajustes de la guía'); }
    });

    router.post('/:id/guia-irpf/guardar', staffOnly, async (req, res) => {
        try { res.json(await guiaIrpf.guardar(origen, req.params.id, req.body || {}, { usuario: usuarioDe(req) })); }
        catch (err) { responderError(res, err, 'guardar', 'No se pudo guardar la guía en Drive'); }
    });

    router.post('/:id/guia-irpf/enviar', staffOnly, async (req, res) => {
        try { res.json(await guiaIrpf.enviar(origen, req.params.id, req.body || {}, { usuario: usuarioDe(req) })); }
        catch (err) { responderError(res, err, 'enviar', 'No se pudo enviar'); }
    });
}

module.exports = { montarGuiaIrpf };
