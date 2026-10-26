// ─── /api/certapp-admin — el panel de BROKERGY de la app de certificadores ───
// `adminOnly` (middleware/auth.js) EN CADA RUTA, en línea: lo vigila
// scripts/auditar_rutas_sin_guardian.js. La única excepción, `POST
// /interno/calificada` (el PC avisa de que ha calificado), lleva `adminOInterno`:
// un ADMIN o la clave interna. Lista de espera, cuentas y créditos
// (cambiarlos a mano apunta un AJUSTE en «Mis gastos»), obras (pedir a la IA,
// entregar, devolver el crédito) e incidencias (estado y respuesta, que llega al
// certificador por email).
//
// Listados sin JSONB enteros (regla 22); BD caída → 503 (regla 38).
//
// REGLA — en los eventos que ve el certificador, quien actúa desde aquí es
// «BROKERGY» (`por`); el email del admin va en `por_detalle` y el motivo interno
// en `nota_interna`, que SOLO devuelve este panel (obras.eventos(…, { admin: true })).
// Contrato: docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const supabase = require('../services/supabaseClient');
const { adminOnly, esClaveInterna } = require('../middleware/auth');
const { olvidarCuenta } = require('../middleware/certappAuth');
const cuentas = require('../services/certapp/cuentas');
const obras = require('../services/certapp/obras');
const docs = require('../services/certapp/docs');
const ia = require('../services/certapp/ia');
const entrega = require('../services/certapp/entrega');
const documentos = require('../services/certapp/documentos');
const asistente = require('../services/certapp/asistente');
const beta = require('../services/certapp/beta');
const drive = require('../services/certapp/drive');
const incidencias = require('../services/certapp/incidencias');
const movimientos = require('../services/certapp/movimientos');
const { cuestionario: logica } = require('../services/certapp/logica');
const { responderError, fallo, errorBd, esUuid, cuentaPublica, evento, texto, textoLargo, certappUrl } = require('../services/certapp/comun');

const router = express.Router();
const quien = (req) => req.user?.email || req.user?.nombre || 'ADMIN';

function uuid(req, campo = 'id') {
    if (!esUuid(req.params[campo])) throw fallo(404, 'No encontrado.', 'NO_ENCONTRADO');
    return req.params[campo];
}

async function contar(tabla, filtro = null) {
    let q = supabase.from(tabla).select('id', { count: 'exact', head: true });
    if (filtro) q = filtro(q);
    const { count, error } = await q;
    if (error) throw errorBd(error, `contar ${tabla}`);
    return count || 0;
}

// ── Resumen ─────────────────────────────────────────────────────────────────
router.get('/resumen', adminOnly, async (req, res) => {
    try {
        // En serie a propósito: son consultas de conteo baratas y así una BD
        // con problemas recibe una cada vez.
        const beta_ = {};
        for (const e of beta.ESTADOS) beta_[e] = await contar('certapp_beta_solicitudes', q => q.eq('estado', e));
        const cuentas_ = {};
        for (const e of ['PENDIENTE', 'ACTIVA', 'BLOQUEADA']) cuentas_[e] = await contar('certapp_cuentas', q => q.eq('estado', e));
        const obras_ = {};
        for (const e of ['BORRADOR', 'EN_PREPARACION', 'LISTO', 'VALIDADO', 'ARCHIVADA']) obras_[e] = await contar('certapp_obras', q => q.eq('estado', e));
        const feedbackNuevo = await contar('certapp_feedback', q => q.eq('estado', 'NUEVA'));
        const { data: cred, error } = await supabase.from('certapp_cuentas').select('creditos, creditos_usados').limit(10000);
        if (error) throw errorBd(error, 'créditos');
        const c = await asistente.cupo('00000000-0000-0000-0000-000000000000');
        return res.json({
            beta: beta_, cuentas: cuentas_, obras: obras_, feedback_nuevo: feedbackNuevo,
            creditos: {
                disponibles: (cred || []).reduce((s, r) => s + (r.creditos || 0), 0),
                usados: (cred || []).reduce((s, r) => s + (r.creditos_usados || 0), 0),
            },
            asistente: { gastado_mes_usd: c._gastado_mes_usd, tope_mes_usd: c._tope_mes_usd, encendido: c.disponible },
            // La carpeta donde se van guardando los certificados (una por certificador y,
            // dentro, una por obra). Solo la ve un ADMIN (regla 1).
            drive: { raiz_configurada: !!drive.raiz(), raiz_link: drive.raiz() ? `https://drive.google.com/drive/folders/${drive.raiz()}` : null },
            config: {
                avisos: process.env.CERTAPP_AVISOS_ENABLED === 'true',
                ia_auto: process.env.CERTAPP_IA_AUTO === 'true',
                entrega_auto: process.env.CERTAPP_ENTREGA_AUTO === 'true',
                url: certappUrl(),
            },
        });
    } catch (e) { return responderError(res, e, 'GET /resumen'); }
});

// ── Lista de espera de la beta ──────────────────────────────────────────────
const COLS_BETA = 'id, created_at, updated_at, nombre, email, telefono, provincia, perfil, empresa, cee_mes, minutos_cee, '
    + 'minutos_presentar, interes_ia_presentar, coste_subcontrata_eur, software, comunidades, comentarios, '
    + 'acepta_comunicaciones, origen, estado, cuenta_id, notas';

router.get('/beta', adminOnly, async (req, res) => {
    try {
        let q = supabase.from('certapp_beta_solicitudes').select(COLS_BETA).order('created_at', { ascending: false }).limit(2000);
        if (beta.ESTADOS.includes(String(req.query.estado || '').toUpperCase())) q = q.eq('estado', String(req.query.estado).toUpperCase());
        const { data, error } = await q;
        if (error) throw errorBd(error, 'listar beta');
        return res.json({ solicitudes: data || [] });
    } catch (e) { return responderError(res, e, 'GET /beta'); }
});

// El detalle, con el formulario crudo (`respuestas`), que el listado no trae.
router.get('/beta/:id', adminOnly, async (req, res) => {
    try {
        const { data, error } = await supabase.from('certapp_beta_solicitudes').select(`${COLS_BETA}, respuestas, utm`).eq('id', uuid(req)).maybeSingle();
        if (error) throw errorBd(error, 'beta');
        if (!data) throw fallo(404, 'No encuentro esa solicitud.', 'NO_ENCONTRADO');
        return res.json({ solicitud: data });
    } catch (e) { return responderError(res, e, 'GET /beta/:id'); }
});

router.patch('/beta/:id', adminOnly, async (req, res) => {
    try {
        const patch = {};
        if ('estado' in (req.body || {})) {
            const e = String(req.body.estado || '').toUpperCase();
            if (!beta.ESTADOS.includes(e)) throw fallo(400, 'Estado desconocido.', 'ESTADO_INVALIDO');
            patch.estado = e;
        }
        if ('notas' in (req.body || {})) patch.notas = textoLargo(req.body.notas, 4000);
        if (!Object.keys(patch).length) throw fallo(400, 'No hay nada que guardar.', 'SIN_CAMBIOS');
        const { data, error } = await supabase.from('certapp_beta_solicitudes').update(patch).eq('id', uuid(req)).select(COLS_BETA).maybeSingle();
        if (error) throw errorBd(error, 'actualizar beta');
        if (!data) throw fallo(404, 'No encuentro esa solicitud.', 'NO_ENCONTRADO');
        return res.json({ solicitud: data });
    } catch (e) { return responderError(res, e, 'PATCH /beta/:id'); }
});

/** Invita: crea la cuenta (o la reinvita) y devuelve el enlace de activación. */
router.post('/beta/:id/invitar', adminOnly, async (req, res) => {
    try {
        const { data: sol, error } = await supabase.from('certapp_beta_solicitudes').select(COLS_BETA).eq('id', uuid(req)).maybeSingle();
        if (error) throw errorBd(error, 'beta');
        if (!sol) throw fallo(404, 'No encuentro esa solicitud.', 'NO_ENCONTRADO');
        const r = await cuentas.crearCuenta({
            email: sol.email, nombre: sol.nombre, telefono: sol.telefono, empresa: sol.empresa,
            provincia: sol.provincia, creditos: req.body?.creditos,
        }, { por: quien(req), solicitud: sol });
        await supabase.from('certapp_beta_solicitudes').update({ estado: 'INVITADA', cuenta_id: r.cuenta.id }).eq('id', sol.id);
        return res.json({ ok: true, ...r });
    } catch (e) { return responderError(res, e, 'POST /beta/:id/invitar'); }
});

// ── Cuentas ─────────────────────────────────────────────────────────────────
const COLS_CUENTA = 'id, email, nombre, apellidos, nif, telefono, empresa, empresa_nif, titulacion, num_colegiado, colegio, '
    + 'provincia, municipio, estado, creditos, creditos_usados, drive_folder_link, beta_solicitud_id, ultimo_acceso_at, created_at';

router.get('/cuentas', adminOnly, async (req, res) => {
    try {
        const { data, error } = await supabase.from('certapp_cuentas').select(COLS_CUENTA).order('created_at', { ascending: false }).limit(2000);
        if (error) throw errorBd(error, 'listar cuentas');
        return res.json({ cuentas: data || [] });
    } catch (e) { return responderError(res, e, 'GET /cuentas'); }
});

/** Cuenta suelta (sin pasar por la beta). */
router.post('/cuentas', adminOnly, async (req, res) => {
    try {
        const b = req.body || {};
        const r = await cuentas.crearCuenta({
            email: b.email, nombre: b.nombre, apellidos: b.apellidos, telefono: b.telefono,
            empresa: b.empresa, provincia: b.provincia, creditos: b.creditos,
        }, { por: quien(req) });
        return res.status(r.reinvitada ? 200 : 201).json({ ok: true, ...r });
    } catch (e) { return responderError(res, e, 'POST /cuentas'); }
});

/**
 * Créditos (el saldo nuevo, absoluto) y estado. Si cambian los créditos, se apunta
 * un AJUSTE en «Mis gastos» por la diferencia (`concepto` opcional: lo lee el
 * certificador). El update va condicionado al saldo leído: si entretanto ha
 * pedido un certificado, 409 `CREDITOS_CAMBIADOS` en vez de pisarlo a ciegas.
 */
router.patch('/cuentas/:id', adminOnly, async (req, res) => {
    try {
        const id = uuid(req);
        const patch = {};
        if ('creditos' in (req.body || {})) {
            const n = Number(req.body.creditos);
            if (!Number.isInteger(n) || n < 0 || n > 100000) throw fallo(400, 'Los créditos son un número entero, 0 o más.', 'CREDITOS_INVALIDOS');
            patch.creditos = n;
        }
        if ('estado' in (req.body || {})) {
            const e = String(req.body.estado || '').toUpperCase();
            if (!['PENDIENTE', 'ACTIVA', 'BLOQUEADA'].includes(e)) throw fallo(400, 'Estado desconocido.', 'ESTADO_INVALIDO');
            patch.estado = e;
        }
        if (!Object.keys(patch).length) throw fallo(400, 'No hay nada que guardar.', 'SIN_CAMBIOS');

        let antes = null;
        if ('creditos' in patch) {
            const { data: a, error: errA } = await supabase.from('certapp_cuentas').select('creditos').eq('id', id).maybeSingle();
            if (errA) throw errorBd(errA, 'leer créditos');
            if (!a) throw fallo(404, 'No encuentro esa cuenta.', 'NO_ENCONTRADO');
            antes = Number(a.creditos ?? 0);
        }
        let q = supabase.from('certapp_cuentas').update(patch).eq('id', id);
        if (antes !== null) q = q.eq('creditos', antes);
        const { data, error } = await q.select(COLS_CUENTA).maybeSingle();
        if (error) throw errorBd(error, 'actualizar cuenta');
        if (!data) {
            if (antes !== null) throw fallo(409, 'Los créditos de esta cuenta acaban de cambiar. Recarga y vuelve a ponerlos.', 'CREDITOS_CAMBIADOS');
            throw fallo(404, 'No encuentro esa cuenta.', 'NO_ENCONTRADO');
        }
        // Bloquear o cambiar créditos se nota ya (la caché del guardián dura 2 min).
        olvidarCuenta(id);

        let movimiento = null;
        const diferencia = antes === null ? 0 : Number(data.creditos) - antes;
        if (diferencia) {
            const n = Math.abs(diferencia);
            const porDefecto = diferencia > 0
                ? `BROKERGY te ha dado ${n} ${n === 1 ? 'certificado' : 'certificados'}`
                : `Ajuste de BROKERGY: ${n} ${n === 1 ? 'certificado' : 'certificados'} menos`;
            movimiento = await movimientos.apuntar({
                cuentaId: id, tipo: 'AJUSTE', creditos: diferencia, saldoDespues: Number(data.creditos),
                concepto: texto(req.body?.concepto, 200) || porDefecto, por: quien(req),
            });
        }
        return res.json({ cuenta: data, movimiento: movimiento ? { id: movimiento.id ?? null, creditos: diferencia } : null });
    } catch (e) { return responderError(res, e, 'PATCH /cuentas/:id'); }
});

// ── Obras ───────────────────────────────────────────────────────────────────
router.get('/obras', adminOnly, async (req, res) => {
    try {
        let q = supabase.from('certapp_obras')
            .select(`${obras.COLUMNAS_LISTA}, cuenta_id, zona_climatica, superficie_catastro, cuenta:certapp_cuentas(id, email, nombre, apellidos, empresa)`)
            .order('created_at', { ascending: false }).limit(2000);
        const estado = String(req.query.estado || '').toUpperCase();
        if (['BORRADOR', 'EN_PREPARACION', 'LISTO', 'VALIDADO', 'ARCHIVADA'].includes(estado)) q = q.eq('estado', estado);
        if (esUuid(req.query.cuenta_id)) q = q.eq('cuenta_id', req.query.cuenta_id);
        const { data, error } = await q;
        if (error) throw errorBd(error, 'listar obras');
        return res.json({ obras: data || [] });
    } catch (e) { return responderError(res, e, 'GET /obras'); }
});

async function obraYCuenta(req) {
    const obra = await obras.cargar(uuid(req));
    if (!obra) throw fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
    const cuenta = await cuentas.cuentaPorId(obra.cuenta_id);
    return { obra, cuenta };
}

router.get('/obras/:id', adminOnly, async (req, res) => {
    try {
        const { obra, cuenta } = await obraYCuenta(req);
        const { barrido } = await logica();
        const [eventos, enlaces, vista] = await Promise.all([
            obras.eventos(obra.id, 200, { admin: true }),
            entrega.enlaces(obra, { admin: true }),
            docs.vista(obra, { admin: true }),
        ]);
        return res.json({
            obra: obras.obraParaAdmin(obra),
            cuenta: cuenta ? { ...cuentaPublica(cuenta), drive_folder_link: cuenta.drive_folder_link || null } : null,
            barrido: barrido(obra, cuenta),
            eventos, enlaces, docs: vista,
            // El enlace del propietario solo si sigue vigente (si no, «Rotar» da uno nuevo).
            enlace_cliente: obras.portalVigente(obra) ? obras.urlPortal(obra) : null,
            enlace_cliente_caduca_at: obras.portalVigente(obra) ? obras.portalCaducaAt(obra).toISOString() : null,
        });
    } catch (e) { return responderError(res, e, 'GET /obras/:id'); }
});

/** «Documentos» de la obra, como los ve el certificador y con el enlace de Drive de cada uno. */
router.get('/obras/:id/documentos', adminOnly, async (req, res) => {
    try {
        const { obra } = await obraYCuenta(req);
        return res.json({ ...(await documentos.listar(obra, { admin: true })), entregado: ['LISTO', 'VALIDADO'].includes(obra.estado) });
    } catch (e) { return responderError(res, e, 'GET /obras/:id/documentos'); }
});

/** Enlace NUEVO para el propietario de la obra: el anterior deja de valer en el acto. */
router.post('/obras/:id/enlace-cliente/rotar', adminOnly, async (req, res) => {
    try {
        const { obra } = await obraYCuenta(req);
        const nueva = await obras.rotarPortal(obra);
        await evento(obra.id, obra.cuenta_id, 'ENLACE_ROTADO', 'Enlace del propietario renovado (el anterior ya no vale)', 'BROKERGY',
            null, { porDetalle: quien(req) });
        return res.json({ url: obras.urlPortal(nueva), caduca_at: obras.portalCaducaAt(nueva).toISOString() });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/enlace-cliente/rotar'); }
});

/** Encarga a mano el CEE a la IA (cuando CERTAPP_IA_AUTO está apagado o falló). */
router.post('/obras/:id/pedir-ia', adminOnly, async (req, res) => {
    try {
        const { obra } = await obraYCuenta(req);
        if (!['EN_PREPARACION', 'LISTO'].includes(obra.estado)) {
            throw fallo(409, 'Solo se encarga a la IA una obra pedida (EN_PREPARACION) o una lista que se quiere rehacer.', 'ESTADO_NO_ENCARGABLE');
        }
        let trabajo;
        try {
            trabajo = await ia.encargarIa(obra, { usuario: quien(req), rehacer: !!req.body?.rehacer || obra.estado === 'LISTO' });
        } catch (e) {
            const st = Number(e?.status) || 503;
            throw fallo(st >= 400 && st < 600 ? st : 503, e?.message || 'No se ha podido encargar a la IA.', e?.extra?.code || 'IA_NO_ENCARGADA');
        }
        await evento(obra.id, obra.cuenta_id, 'IA_PEDIDA', 'Certificado en preparación', 'BROKERGY',
            { trabajo_id: trabajo?.id || null }, { porDetalle: quien(req), notaInterna: 'Encargado a la IA desde el admin' });
        return res.json({ ok: true, trabajo: trabajo || null });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/pedir-ia'); }
});

/**
 * El PC ha calificado con CE3X el `.cex` de una obra (scripts/cee_inicial.js
 * calificar, lanzado por la cola del PC). El aviso sale de AQUÍ, de producción:
 * en el PC los avisos de la app están apagados y su CERTAPP_URL es la de local.
 * `agenteIa.terminarExt` con el certificado ya entregable → evento IA_HECHA,
 * `alTerminarIa` (entrega sola o el WhatsApp de «listo para revisar» al equipo) y
 * el email con el detalle. Con la clave interna (el PC) o un ADMIN.
 */
const adminOInterno = (req, res, next) => (esClaveInterna(req) ? next() : adminOnly(req, res, next));

router.post('/interno/calificada', adminOInterno, async (req, res) => {
    try {
        const numero = texto(req.body?.numero, 40);
        if (!numero) throw fallo(400, 'Falta el número de la obra.', 'SIN_NUMERO');
        const { data: fila, error } = await supabase.from('certapp_obras').select('id').eq('numero_expediente', numero).maybeSingle();
        if (error) throw errorBd(error, 'obra calificada');
        if (!fila) throw fallo(404, `No encuentro la obra ${numero}.`, 'OBRA_NO_ENCONTRADA');
        const obra = await obras.cargar(fila.id);
        if (!['EN_PREPARACION', 'LISTO'].includes(obra?.estado)) {
            return res.json({ ok: true, omitido: `la obra está ${obra?.estado || '—'}: no se avisa` });
        }
        const enl = await entrega.enlaces(obra, { admin: true });
        if (!enl.ficheros.pdf || !enl.ficheros.xml) {
            throw fallo(409, 'En «1. CEE» no están el PDF y el XML: no está calificada.', 'SIN_CALIFICAR');
        }
        const r = await require('../services/agenteIa').terminarExt({
            clave: obra.id, fase: 'inicial', aviso: true, entregable: true, calificada: true,
            fichero: { nombre: enl.ficheros.cex?.nombre || null, link: enl.cex, carpeta_link: enl.carpeta, croquis_link: enl.croquis },
        });
        return res.json({ ok: true, canales: r.canales, fallos: r.fallos, entrega: r.entrega });
    } catch (e) { return responderError(res, e, 'POST /interno/calificada'); }
});

router.post('/obras/:id/entregar', adminOnly, async (req, res) => {
    try {
        const r = await entrega.entregar(uuid(req), { por: 'BROKERGY', porDetalle: quien(req), forzar: !!req.body?.forzar });
        return res.json({ ok: true, obra: obras.obraParaAdmin(r.obra), enlaces: r.enlaces, compartida: r.compartida, aviso: r.aviso });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/entregar'); }
});

/**
 * Devuelve el crédito DE LA OBRA (el de un pedido que no se ha podido entregar).
 * La RPC `certapp_devolver_credito_obra` lo hace todo en una transacción: quita la
 * marca `credito_consumido`, suma el crédito a la cuenta, vuelve la obra a BORRADOR
 * si seguía EN_PREPARACION y apunta CREDITO_DEVUELTO. Sin marca → 409: una obra no
 * se devuelve dos veces, ni con dos clics a la vez.
 */
router.post('/obras/:id/devolver-credito', adminOnly, async (req, res) => {
    try {
        const { obra, cuenta } = await obraYCuenta(req);
        if (!cuenta) throw fallo(409, 'La obra no tiene cuenta.', 'SIN_CUENTA');
        const sinCredito = () => fallo(409, 'Esta obra no tiene ningún crédito gastado (o ya se devolvió).', 'SIN_CREDITO_GASTADO');
        if (!obra.credito_consumido) throw sinCredito();
        const { data: quedan, error } = await supabase.rpc('certapp_devolver_credito_obra', {
            p_obra_id: obra.id, p_por: 'BROKERGY', p_texto: 'Te hemos devuelto el crédito de esta obra',
            p_por_detalle: quien(req), p_nota_interna: texto(req.body?.motivo, 300) || null,
        });
        if (error) throw errorBd(error, 'devolver crédito');
        if (quedan === -2) throw sinCredito();
        if (typeof quedan !== 'number') throw fallo(503, 'No se ha podido confirmar la devolución. Recarga y mira el historial.', 'BD_NO_DISPONIBLE');
        olvidarCuenta(cuenta.id);
        const nueva = (await obras.cargar(obra.id)) || obra;
        return res.json({ ok: true, creditos: quedan, obra: obras.obraParaAdmin(nueva) });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/devolver-credito'); }
});

// ── Incidencias y sugerencias ───────────────────────────────────────────────
// El certificador las ve en «Mis incidencias» con el estado en palabras llanas
// (NUEVA → Recibida, VISTA → En revisión, HECHA → Resuelta, DESCARTADA → Cerrada)
// y la respuesta. Quién contestó (`respuesta_por`) solo lo ve este panel.
const COLS_FEEDBACK = 'id, created_at, cuenta_id, obra_id, tipo, texto, pantalla, user_agent, estado, respuesta, respuesta_at, respuesta_por, '
    + 'cuenta:certapp_cuentas(id, email, nombre, apellidos), obra:certapp_obras(numero_expediente)';

router.get('/feedback', adminOnly, async (req, res) => {
    try {
        let q = supabase.from('certapp_feedback').select(COLS_FEEDBACK)
            .order('created_at', { ascending: false }).limit(2000);
        const estado = String(req.query.estado || '').toUpperCase();
        if (incidencias.ESTADOS.includes(estado)) q = q.eq('estado', estado);
        const { data, error } = await q;
        if (error) throw errorBd(error, 'listar feedback');
        return res.json({ feedback: data || [] });
    } catch (e) { return responderError(res, e, 'GET /feedback'); }
});

/**
 * Estado y/o respuesta de una incidencia `{ estado?, respuesta?, avisar? }`.
 * Una respuesta NUEVA (distinta de la que había, no vacía) apunta `respuesta_at` y
 * `respuesta_por`, pasa una NUEVA a VISTA si no se dice otro estado, y avisa al
 * certificador por email con el enlace a «Mis incidencias» (salvo `avisar: false`;
 * con CERTAPP_AVISOS_ENABLED apagado, en seco). Guardar lo mismo no cambia nada
 * ni manda nada. → `{ feedback, aviso }` (aviso null si no tocaba avisar).
 */
async function guardarFeedback(req, res) {
    try {
        const id = uuid(req);
        const b = req.body || {};
        if (!('estado' in b) && !('respuesta' in b)) throw fallo(400, 'No hay nada que guardar.', 'SIN_CAMBIOS');
        const { data: antes, error: errAntes } = await supabase.from('certapp_feedback').select(COLS_FEEDBACK).eq('id', id).maybeSingle();
        if (errAntes) throw errorBd(errAntes, 'incidencia');
        if (!antes) throw fallo(404, 'No encuentro esa incidencia.', 'NO_ENCONTRADO');

        const patch = {};
        if ('estado' in b) {
            const e = String(b.estado || '').toUpperCase();
            if (!incidencias.ESTADOS.includes(e)) throw fallo(400, 'Estado desconocido.', 'ESTADO_INVALIDO');
            if (e !== antes.estado) patch.estado = e;
        }
        let respuestaNueva = false;
        if ('respuesta' in b) {
            const r = textoLargo(b.respuesta, 4000) || null;
            if (r !== (antes.respuesta || null)) {
                patch.respuesta = r;
                patch.respuesta_at = r ? new Date().toISOString() : null;
                patch.respuesta_por = r ? quien(req) : null;
                respuestaNueva = !!r;
            }
        }
        // Contestar es haberla visto: que el certificador no lea «Recibida» con la respuesta debajo.
        if (respuestaNueva && !('estado' in patch) && antes.estado === 'NUEVA') patch.estado = 'VISTA';
        if (!Object.keys(patch).length) return res.json({ feedback: antes, aviso: null });

        const { data, error } = await supabase.from('certapp_feedback').update(patch).eq('id', id).select(COLS_FEEDBACK).maybeSingle();
        if (error) throw errorBd(error, 'actualizar feedback');
        if (!data) throw fallo(404, 'No encuentro esa incidencia.', 'NO_ENCONTRADO');
        const aviso = respuestaNueva && b.avisar !== false ? await incidencias.avisarRespuesta(data) : null;
        return res.json({ feedback: data, aviso });
    } catch (e) { return responderError(res, e, `${req.method} /feedback/:id`); }
}
router.put('/feedback/:id', adminOnly, guardarFeedback);
router.patch('/feedback/:id', adminOnly, guardarFeedback);   // el nombre de antes; mismo comportamiento

module.exports = router;
