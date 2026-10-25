// ─── /api/facturacion ────────────────────────────────────────────────────────
// Pestaña FACTURACIÓN: el catálogo de ARTÍCULOS, los PRESUPUESTOS con N
// partidas (fase 1) y las FACTURAS propias (fase 2: series ING y FML,
// rectificativas, cobro, VERI*FACTU, el libro de AppSheet).
//
// Guardianes (regla 102): el catálogo y los presupuestos los ve y los toca el
// EQUIPO (o el MCP con la clave interna, `staffOClaveInterna`: lo que sale de la
// casa a un tercero va así); los PRECIOS del catálogo solo los cambia ADMIN. Las
// FACTURAS son importes de Brokergy: solo ADMIN o el MCP (`adminOClaveInterna`);
// los datos de un emisor (llevan su IBAN) y la importación, solo ADMIN.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const { adminOnly, staffOClaveInterna, adminOClaveInterna } = require('../middleware/auth');
const svc = require('../services/presupuestoService');
const ofertas = require('../services/ceeOfertaService');
const facturas = require('../services/facturaService');

const quien = (req) => (req.internalCall ? 'AGENTE IA' : (req.user?.email || null));
const falla = (res, err, donde) => {
    if (!err.status || err.status >= 500) console.error(`[facturacion ${donde}]`, err.message);
    res.status(err.status || 500).json({
        error: err.message,
        ...(err.errores ? { errores: err.errores, avisos: err.avisos || [] } : {}),
        ...(err.facturas ? { facturas: err.facturas } : {}),
    });
};

// ── Artículos ───────────────────────────────────────────────────────────────

router.get('/articulos', staffOClaveInterna, async (req, res) => {
    try { res.json(await svc.articulos({ todos: !!req.query.todos })); }
    catch (err) { falla(res, err, 'articulos'); }
});

router.post('/articulos', adminOnly, async (req, res) => {
    try { res.status(201).json(await svc.guardarArticulo(req.body || {})); }
    catch (err) { falla(res, err, 'alta articulo'); }
});

router.put('/articulos/:id', adminOnly, async (req, res) => {
    try { res.json(await svc.guardarArticulo(req.body || {}, req.params.id)); }
    catch (err) { falla(res, err, 'articulo'); }
});

// ── Presupuestos ────────────────────────────────────────────────────────────

router.get('/presupuestos', staffOClaveInterna, async (req, res) => {
    try {
        const estados = String(req.query.estados || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        res.json(await svc.listar({ estados: estados.length ? estados : null, q: req.query.q || '' }));
    } catch (err) { falla(res, err, 'listado'); }
});

/**
 * Alta. Sin `envio` queda BORRADOR (el MCP lo enseña antes de mandarlo). Con
 * `envio` se manda en el mismo gesto; si no sale por ningún canal se queda como
 * BORRADOR (no se borra: las partidas ya están escritas y se reenvía).
 */
router.post('/presupuestos', staffOClaveInterna, async (req, res) => {
    const { envio = null, ...datos } = req.body || {};
    try {
        const creado = await svc.crear(datos, { usuarioId: req.user?.id_usuario || null, usuarioNombre: quien(req) });
        if (!envio) return res.status(201).json({ presupuesto: await svc.detalle(creado.id) });
        const o = await ofertas.cargar(creado.id);
        let r;
        try { r = await ofertas.enviar(o, { ...envio, usuario: quien(req) }); }
        catch (e) { return res.status(e.status || 502).json({ error: e.message, presupuesto: await svc.detalle(creado.id) }); }
        const presupuesto = await svc.detalle(creado.id);
        if (!r.canalesOk.length) return res.status(502).json({ error: 'No salió por ningún canal: queda como borrador', resultados: r.resultados, presupuesto });
        res.status(201).json({ presupuesto, ...r });
    } catch (err) { falla(res, err, 'alta'); }
});

/** El PDF de lo que hay en el editor, SIN guardar (el «Descargar PDF» de la vista previa). */
router.post('/presupuestos/vista-previa/pdf', staffOClaveInterna, async (req, res) => {
    try {
        const { buffer, filename } = await svc.pdfBorrador(req.body || {});
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(buffer);
    } catch (err) { falla(res, err, 'pdf vista previa'); }
});

router.get('/presupuestos/:id', staffOClaveInterna, async (req, res) => {
    try {
        const d = await svc.detalle(req.params.id);
        if (!d) return res.status(404).json({ error: 'Presupuesto no encontrado' });
        res.json(d);
    } catch (err) { falla(res, err, 'detalle'); }
});

router.put('/presupuestos/:id', staffOClaveInterna, async (req, res) => {
    try {
        await svc.actualizar(req.params.id, req.body || {}, { usuarioNombre: quien(req) });
        res.json(await svc.detalle(req.params.id));
    } catch (err) { falla(res, err, 'edición'); }
});

router.get('/presupuestos/:id/pdf', staffOClaveInterna, async (req, res) => {
    try {
        const o = await ofertas.cargar(req.params.id);
        if (!o) return res.status(404).json({ error: 'Presupuesto no encontrado' });
        const { buffer, filename } = await ofertas.pdfDe(o);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
        res.send(buffer);
    } catch (err) { falla(res, err, 'pdf'); }
});

/** Lo que se enviaría y a quién, SIN enviar (vista previa del MCP). */
router.get('/presupuestos/:id/mensaje', staffOClaveInterna, async (req, res) => {
    try { res.json(await svc.previsualizarEnvio(req.params.id)); }
    catch (err) { falla(res, err, 'mensaje'); }
});

/** Envía (un BORRADOR pasa a ENVIADA) o reenvía. Sin email/tlf, los de la ficha. */
router.post('/presupuestos/:id/enviar', staffOClaveInterna, async (req, res) => {
    try {
        const o = await ofertas.cargar(req.params.id);
        if (!o) return res.status(404).json({ error: 'Presupuesto no encontrado' });
        const r = await ofertas.enviar(o, { ...(req.body || {}), usuario: quien(req) });
        if (!r.canalesOk.length) return res.status(502).json({ error: 'No salió por ningún canal', resultados: r.resultados });
        res.json(r);
    } catch (err) { falla(res, err, 'envío'); }
});

router.post('/presupuestos/:id/duplicar', staffOClaveInterna, async (req, res) => {
    try {
        const nuevo = await svc.duplicar(req.params.id, { usuarioId: req.user?.id_usuario || null, usuarioNombre: quien(req) });
        // El MCP lo enseña como borrador: va entero, con el mensaje que saldría.
        const presupuesto = await svc.detalle(nuevo.id);
        const { mensaje } = await svc.previsualizarEnvio(nuevo.id);
        res.status(201).json({ id: nuevo.id, numero: nuevo.numero, presupuesto: { ...presupuesto, mensaje } });
    } catch (err) { falla(res, err, 'duplicar'); }
});

router.post('/presupuestos/:id/rechazar', staffOClaveInterna, async (req, res) => {
    try { res.json(await svc.rechazar(req.params.id, quien(req))); }
    catch (err) { falla(res, err, 'rechazar'); }
});

router.post('/presupuestos/:id/anular', staffOClaveInterna, async (req, res) => {
    try { res.json(await ofertas.anular(req.params.id, quien(req))); }
    catch (err) { falla(res, err, 'anular'); }
});

// ── Emisores ────────────────────────────────────────────────────────────────

router.get('/emisores', adminOClaveInterna, async (req, res) => {
    try { res.json(await facturas.emisores()); }
    catch (err) { falla(res, err, 'emisores'); }
});

router.put('/emisores/:serie', adminOnly, async (req, res) => {
    try { res.json(await facturas.guardarEmisor(req.params.serie, req.body || {})); }
    catch (err) { falla(res, err, 'emisor'); }
});

// ── Facturas ────────────────────────────────────────────────────────────────

router.get('/facturas', adminOClaveInterna, async (req, res) => {
    try {
        const { serie = null, anio = null, estado = null, q = '' } = req.query;
        res.json(await facturas.listar({ serie, anio, estado, q }));
    } catch (err) { falla(res, err, 'facturas'); }
});

router.get('/facturas/proximo', adminOClaveInterna, async (req, res) => {
    try { res.json({ numero: await facturas.proximoNumero(req.query.serie || 'ING', { tipo: req.query.tipo, fecha: req.query.fecha }) }); }
    catch (err) { falla(res, err, 'próximo número'); }
});

/**
 * Alta como BORRADOR. Con `emitir: true` se emite en el mismo gesto (el MCP,
 * tras enseñarla), y con `envio` además se manda; si el envío falla, la factura
 * queda emitida (el número no se tira) y se reenvía.
 */
router.post('/facturas', adminOClaveInterna, async (req, res) => {
    const { emitir = false, envio = null, ...datos } = req.body || {};
    try {
        const { id } = await facturas.crear(datos, { usuarioId: req.user?.id_usuario || null, usuarioNombre: quien(req) });
        if (!emitir) return res.status(201).json({ factura: await facturas.detalle(id) });
        let emitida;
        try { emitida = await facturas.emitir(id, { usuario: quien(req) }); }
        catch (e) { return res.status(e.status || 500).json({ error: e.message, errores: e.errores, avisos: e.avisos, factura: await facturas.detalle(id) }); }
        let envioRes = null;
        if (envio) {
            try { envioRes = await facturas.enviar(id, { ...envio, usuario: quien(req) }); }
            catch (e) { envioRes = { error: e.message }; }
        }
        res.status(201).json({ factura: await facturas.detalle(id), ...emitida, envio: envioRes });
    } catch (err) { falla(res, err, 'alta factura'); }
});

router.post('/facturas/desde-presupuesto/:id', adminOClaveInterna, async (req, res) => {
    try {
        const { id } = await facturas.desdePresupuesto(req.params.id, { usuarioId: req.user?.id_usuario || null, usuarioNombre: quien(req), otraMas: !!req.body?.otraMas });
        res.status(201).json({ factura: await facturas.detalle(id) });
    } catch (err) { falla(res, err, 'facturar presupuesto'); }
});

/** El PDF de lo que hay en el editor de un borrador, sin guardar (antes que POST /facturas/:id/pdf). */
router.post('/facturas/vista-previa/pdf', adminOClaveInterna, async (req, res) => {
    try {
        const { buffer, filename } = await facturas.pdfVistaPrevia(req.body || {});
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(buffer);
    } catch (err) { falla(res, err, 'pdf vista previa factura'); }
});

/** Trae lo emitido en AppSheet. En SECO salvo `escribir: true`. */
router.post('/facturas/importar', adminOnly, async (req, res) => {
    try { res.json(await facturas.importarLibro({ serie: req.body?.serie || 'ING', escribir: req.body?.escribir === true })); }
    catch (err) { falla(res, err, 'importar'); }
});

router.get('/facturas/:id', adminOClaveInterna, async (req, res) => {
    try {
        const d = await facturas.detalle(req.params.id);
        if (!d) return res.status(404).json({ error: 'Factura no encontrada' });
        res.json(d);
    } catch (err) { falla(res, err, 'factura'); }
});

router.put('/facturas/:id', adminOClaveInterna, async (req, res) => {
    try {
        await facturas.actualizar(req.params.id, req.body || {}, { usuarioNombre: quien(req) });
        res.json(await facturas.detalle(req.params.id));
    } catch (err) { falla(res, err, 'editar factura'); }
});

router.delete('/facturas/:id', adminOClaveInterna, async (req, res) => {
    try { res.json(await facturas.borrar(req.params.id)); }
    catch (err) { falla(res, err, 'borrar factura'); }
});

router.post('/facturas/:id/emitir', adminOClaveInterna, async (req, res) => {
    try {
        const r = await facturas.emitir(req.params.id, { usuario: quien(req) });
        res.json({ ...r, factura: await facturas.detalle(req.params.id) });
    } catch (err) { falla(res, err, 'emitir'); }
});

router.get('/facturas/:id/pdf', adminOClaveInterna, async (req, res) => {
    try {
        const { buffer, filename } = await facturas.pdfDe(req.params.id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
        res.send(buffer);
    } catch (err) { falla(res, err, 'pdf factura'); }
});

/** Rehace el PDF archivado de una emitida (mismo número). */
router.post('/facturas/:id/pdf', adminOClaveInterna, async (req, res) => {
    try { res.json({ pdf: await facturas.rehacerPdf(req.params.id) }); }
    catch (err) { falla(res, err, 'rehacer pdf'); }
});

/** Lo que se enviaría y a quién, SIN enviar. */
router.get('/facturas/:id/mensaje', adminOClaveInterna, async (req, res) => {
    try { res.json(await facturas.previsualizarEnvio(req.params.id)); }
    catch (err) { falla(res, err, 'mensaje factura'); }
});

router.post('/facturas/:id/enviar', adminOClaveInterna, async (req, res) => {
    try {
        const r = await facturas.enviar(req.params.id, { ...(req.body || {}), usuario: quien(req) });
        if (!r.canalesOk.length) return res.status(502).json({ error: 'No salió por ningún canal', resultados: r.resultados });
        res.json(r);
    } catch (err) { falla(res, err, 'enviar factura'); }
});

router.post('/facturas/:id/cobro', adminOClaveInterna, async (req, res) => {
    try { res.json(await facturas.cobro(req.params.id, { pagada: req.body?.pagada !== false, fecha: req.body?.fecha || null, usuario: quien(req) })); }
    catch (err) { falla(res, err, 'cobro'); }
});

router.post('/facturas/:id/rectificar', adminOClaveInterna, async (req, res) => {
    try {
        const { id } = await facturas.rectificar(req.params.id, { ...(req.body || {}), usuarioId: req.user?.id_usuario || null, usuarioNombre: quien(req) });
        res.status(201).json({ factura: await facturas.detalle(id) });
    } catch (err) { falla(res, err, 'rectificar'); }
});

router.post('/facturas/:id/duplicar', adminOClaveInterna, async (req, res) => {
    try {
        const { id } = await facturas.duplicar(req.params.id, { usuarioId: req.user?.id_usuario || null, usuarioNombre: quien(req) });
        res.status(201).json({ factura: await facturas.detalle(id) });
    } catch (err) { falla(res, err, 'duplicar factura'); }
});

// ── Cuadro de mando y cierre trimestral ─────────────────────────────────────
// Importes de Brokergy: leer, ADMIN o el MCP (`adminOClaveInterna`). Lo que
// GASTA en Gemini o ESCRIBE en Drive, solo ADMIN con sesión: `adminOnly`, y el
// paquete, que en seco solo lee, comprueba dentro que quien escribe no es la
// clave interna. Todo lo fiscal es ESTIMADO (lo presenta la gestoría).
// Ver docs/conocimiento/facturacion/trimestres-y-contabilidad.md.

const conta = require('../services/contabilidadService');
const gastosDrive = require('../services/gastosDrive');
const trimestreActual = () => {
    const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
    return `${hoy.slice(0, 4)}-T${Math.ceil(Number(hoy.slice(5, 7)) / 3)}`;
};
const esSeco = (req) => ['1', 'true', 'si', 'sí'].includes(String(req.query.seco ?? req.body?.seco ?? '').toLowerCase()) || req.body?.seco === true;

router.get('/cuadro', adminOClaveInterna, async (req, res) => {
    try { res.json(await conta.cuadro(req.query.anio)); }
    catch (err) { falla(res, err, 'cuadro'); }
});

router.get('/trimestre', adminOClaveInterna, async (req, res) => {
    try { res.json(await conta.trimestre(req.query.t || trimestreActual())); }
    catch (err) { falla(res, err, 'trimestre'); }
});

router.get('/gastos', adminOClaveInterna, async (req, res) => {
    try { res.json(await conta.gastos(req.query.t || trimestreActual())); }
    catch (err) { falla(res, err, 'gastos'); }
});

// Lee con Gemini lo que falta del trimestre (o los `fileIds` pedidos). Nunca al
// abrir la pantalla; nunca dos veces la misma md5 salvo `forzar` con su id.
router.post('/gastos/leer', adminOnly, async (req, res) => {
    try {
        const T = conta.parseTrimestre(req.body?.t || trimestreActual());
        const fileIds = Array.isArray(req.body?.fileIds) && req.body.fileIds.length ? req.body.fileIds.map(String) : null;
        // Los gastos y, con el tiempo que quede, las ventas CAE de Drive que no están en la app.
        res.json(await conta.leer(T.t, { fileIds, forzar: !!req.body?.forzar && !!fileIds }));
    } catch (err) { falla(res, err, 'leer gastos'); }
});

// Corrige lo leído (o los ajustes: tipo, actividad, % deducible) y, con
// `revisado: true`, lo da por revisado.
router.put('/gastos/:fileId', adminOnly, async (req, res) => {
    try {
        const { revisado, ...cambios } = req.body || {};
        const fila = await gastosDrive.corregir(req.params.fileId, cambios, { revisado: typeof revisado === 'boolean' ? revisado : undefined });
        // Una venta CAE de Drive (autofactura) se corrige por la misma ruta.
        if (fila.venta) return res.json({ venta: { ...fila, venta: conta.ventaDeDrive(fila) } });
        res.json({ gasto: await conta.conFiscalDe(fila) });
    } catch (err) { falla(res, err, 'corregir gasto'); }
});

// El COBRO de una venta CAE que solo está en Drive (autofactura de Iberdrola, la
// F-2026CAE_6 a Naturgy…): no está en `facturas_so`, así que se anota en las
// appProperties del propio fichero (`brk_cobro_fecha`). Body: { cobrada (o
// pagada) = true|false, fecha: 'dd/mm/aaaa' | 'AAAA-MM-DD' }. Escribe en Drive:
// solo ADMIN con sesión (los scripts llaman a `conta.cobroVentaDrive`).
router.post('/ventas-drive/:fileId/cobro', adminOnly, async (req, res) => {
    try {
        const b = req.body || {};
        const cobrada = (b.cobrada ?? b.pagada) !== false;
        res.json(await conta.cobroVentaDrive(req.params.fileId, { cobrada, fecha: b.fecha || b.fecha_cobro || null }));
    } catch (err) { falla(res, err, 'cobro venta de Drive'); }
});

// El paquete para la gestoría. `?seco=1` devuelve el plan sin escribir nada.
router.post('/trimestre/:t/paquete', adminOClaveInterna, async (req, res) => {
    try {
        const seco = esSeco(req);
        if (!seco && req.internalCall) return res.status(403).json({ error: 'Montar el paquete en Drive lo hace un ADMIN desde la app; con la clave interna, solo en seco (?seco=1).' });
        res.json(await conta.paquete(req.params.t, { seco }));
    } catch (err) { falla(res, err, 'paquete'); }
});

module.exports = router;
