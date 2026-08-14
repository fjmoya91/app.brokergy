// ─── routes/seguimiento — el parte, dentro de la app ──────────────────────────
//
// Sirve la misma información que el parte diario de WhatsApp/email, pero en JSON y
// con las dos lecturas que hacen falta para trabajar:
//
//   · por BLOQUE       → diagnóstico: qué tipo de atasco hay y cuánto
//   · por DESTINATARIO → despacho: a quién hay que escribir y de cuántos expedientes
//
// El envío en bloque vive aquí y no en `routes/acciones` porque aquél es la superficie
// PÚBLICA (enlaces firmados, sin sesión) y esto es la superficie INTERNA, con sesión y
// permisos de staff. Comparten servicios, no rutas.
//
// Todo es `staffOnly`: el parte enseña la cartera entera. No lleva importes, así que
// el TRABAJADOR lo ve igual que el ADMIN — es su cola de trabajo diaria.

const express = require('express');
const router = express.Router();
const { staffOnly } = require('../middleware/auth');
const radar = require('../services/seguimientoRadar');
const lote = require('../services/seguimientoLote');
const seguimientoDiario = require('../services/seguimientoDiario');
const supabase = require('../services/supabaseClient');

const usuarioDe = (req) => (req.user?.rol_nombre === 'ADMIN'
    ? 'ADMINISTRADOR'
    : (req.user?.acronimo || req.user?.razon_social || req.user?.rol_nombre || 'SISTEMA'));

// ─── GET /api/seguimiento/parte ───────────────────────────────────────────────
// Todo lo atascado, en las dos agrupaciones. Una sola llamada: la vista necesita
// ambas a la vez y volver a escanear por cada una duplicaría el trabajo de BD.
router.get('/parte', staffOnly, async (req, res) => {
    try {
        const filas = await radar.escanear();

        // `silenciada` se resuelve en el servidor: es el mismo criterio que usa el
        // parte de WhatsApp y no puede depender de que el frontend lo replique bien.
        const conEstado = filas.map(f => ({ ...f, silenciada: radar.silenciadaPor(f) }));

        const porBloque = radar.agruparPorBloque(conEstado).map(g => ({
            bloque: g.bloque,
            titulo: g.def.titulo,
            emoji: g.def.emoji,
            nota: g.def.nota,
            umbral_dias: g.def.dias,
            total: g.filas.length,
            filas: g.filas,
        }));

        const porDestinatario = radar.agruparPorDestinatario(conEstado).map(g => ({
            clave: g.clave,
            tipo: g.tipo,
            scope: g.scope,
            bloque: g.bloque,
            emoji: g.def.emoji,
            etiqueta: g.etiqueta,
            titulo_bloque: g.def.titulo,
            destinatario: g.destinatario,
            dias: g.dias,
            total: g.filas.length,
            expedientes: g.filas.map(f => ({
                expediente_id: f.expediente_id,
                numero_expediente: f.numero_expediente,
                cliente_nombre: f.cliente_nombre,
                detalle: f.detalle,
                dias: f.dias,
                sin_fecha: f.sin_fecha,
                municipio: f.municipio,
                scope: f.scope,
            })),
        }));

        res.json({
            generado: new Date().toISOString(),
            total: filas.length,
            accionables: porDestinatario.reduce((a, g) => a + g.total, 0),
            grupos_envio: porDestinatario.length,
            por_bloque: porBloque,
            por_destinatario: porDestinatario,
        });
    } catch (err) {
        console.error('[seguimiento/parte]', err.message);
        res.status(500).json({ error: 'No se ha podido generar el parte', detalle: err.message });
    }
});

/** Rehidrata un grupo por su clave, escaneando de nuevo. */
async function grupoPorClave(clave) {
    const filas = await radar.escanear();
    return radar.agruparPorDestinatario(filas).find(g => g.clave === clave) || null;
}

// ─── GET /api/seguimiento/lote/:clave ─────────────────────────────────────────
// Borrador del mensaje de un grupo, para previsualizarlo antes de mandarlo.
router.get('/lote/:clave', staffOnly, async (req, res) => {
    try {
        const grupo = await grupoPorClave(decodeURIComponent(req.params.clave));
        if (!grupo) return res.status(404).json({ error: 'Ese grupo ya no está pendiente (puede que se haya resuelto o avisado).' });

        // `?ids=` acota el borrador a los expedientes que siguen marcados. Sin esto,
        // al desmarcar uno el mensaje seguía nombrándolo y anunciando "7 certificados"
        // cuando iban 6: el destinatario recibiría una lista que no cuadra con nada.
        const soloIds = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
        const acotado = soloIds.length
            ? { ...grupo, filas: grupo.filas.filter(f => soloIds.includes(f.expediente_id)) }
            : grupo;
        if (!acotado.filas.length) return res.status(400).json({ error: 'No has dejado ningún expediente seleccionado.' });

        const prep = await lote.prepararLote(acotado);
        if (prep.error) return res.status(400).json({ error: prep.error });

        res.json({
            clave: grupo.clave,
            tipo: grupo.tipo,
            etiqueta: grupo.etiqueta,
            destinatario: { ...grupo.destinatario, ...prep.destinatario },
            asunto: prep.asunto,
            mensaje: prep.mensaje,
            expedientes: prep.items.map(i => ({
                expediente_id: i.expediente_id, numero_expediente: i.numExp,
                cliente: i.cliente, detalle: i.detalle, dias: i.dias,
            })),
        });
    } catch (err) {
        console.error('[seguimiento/lote]', err.message);
        res.status(500).json({ error: 'No se ha podido preparar el mensaje', detalle: err.message });
    }
});

// ─── POST /api/seguimiento/lote/:clave/enviar ─────────────────────────────────
// UN mensaje al destinatario + una marca por expediente.
router.post('/lote/:clave/enviar', staffOnly, async (req, res) => {
    try {
        const grupo = await grupoPorClave(decodeURIComponent(req.params.clave));
        if (!grupo) return res.status(404).json({ error: 'Ese grupo ya no está pendiente.' });

        const out = await lote.enviarLote(grupo, {
            canales: Array.isArray(req.body?.canales) ? req.body.canales : [],
            mensaje: req.body?.mensaje,
            asunto: req.body?.asunto,
            expedientes: Array.isArray(req.body?.expedientes) ? req.body.expedientes : null,
            usuario: usuarioDe(req),
        });
        res.json(out);
    } catch (err) {
        console.error('[seguimiento/enviar]', err.message);
        res.status(400).json({ error: err.message });
    }
});

// ─── POST /api/seguimiento/posponer ───────────────────────────────────────────
// "Ahora no": silencia una línea (o un grupo entero) sin enviar nada.
// Body: { tipo, expedientes: [ id | {expediente_id, scope} ], scope? }
//
// El `scope` se admite POR EXPEDIENTE porque un grupo puede mezclar fases (el CEE
// inicial de una obra y el final de otra): posponerlos a todos con la misma fase
// silenciaría la equivocada y la línea real volvería mañana.
router.post('/posponer', staffOnly, async (req, res) => {
    try {
        const lista = Array.isArray(req.body?.expedientes) ? req.body.expedientes.filter(Boolean) : [];
        const tipo = String(req.body?.tipo || '').trim();
        if (!lista.length || !tipo) return res.status(400).json({ error: 'Faltan expedientes o tipo' });

        const at = new Date().toISOString();
        let hechos = 0;
        for (const item of lista) {
            const id = typeof item === 'string' ? item : item.expediente_id;
            const scope = (typeof item === 'object' && item.scope) || req.body?.scope || 'inicial';
            if (!id) continue;
            const clave = tipo === 'fin-obra' ? 'fin-obra' : `${tipo}:${scope}`;
            const { error } = await supabase.rpc('merge_expediente_doc_json', {
                p_expediente_id: id, p_field: 'recordatorios',
                p_value: { [clave]: { at, pospuesto: true, origen: 'app', usuario: usuarioDe(req) } },
            });
            if (error) console.warn('[seguimiento/posponer]', id, error.message);
            else hechos++;
        }
        res.json({ ok: true, pospuestos: hechos, dias: radar.POSPONER_DIAS });
    } catch (err) {
        console.error('[seguimiento/posponer]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/seguimiento/enviar-parte ───────────────────────────────────────
// Manda el parte diario ahora mismo, sin esperar a la hora. Útil para probarlo.
router.post('/enviar-parte', staffOnly, async (req, res) => {
    try {
        res.json(await seguimientoDiario.comprobarYAvisar({ force: true }));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
