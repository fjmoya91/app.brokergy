// ─── /api/certapp — la API del CERTIFICADOR (app cee.brokergy.es) ────────────
// Guardián `certappOnly` en cada ruta (salvo GET /me, `certappOAdmin`): un
// certificador externo con cuenta ACTIVA (o PENDIENTE que ya entró). Un usuario
// del CRM sin cuenta de la app no pasa.
//
// REGLA — cada certificador toca SOLO lo suyo, y lo ajeno es 404: toda ruta con
// `:id` pasa por `obraDeLaCuenta` (la comprobación única, middleware/certappAuth.js)
// ANTES de leer nada más (también antes de recibir ficheros). BD caída → 503.
//
// REGLA — el crédito va LIGADO A LA OBRA (`credito_consumido`): se gasta y se
// devuelve con las RPC `certapp_consumir_credito_obra` / `certapp_devolver_credito_obra`,
// que cambian la marca y el saldo en la misma transacción. Una obra no gasta dos
// créditos ni se le devuelve dos veces. Pedida la obra, sus datos se congelan
// (obras.exigirBorrador) y «revisar de nuevo» tiene un máximo (CERTAPP_REVISIONES_MAX).
//
// Incidencias (`/feedback`): el certificador lista SOLO las suyas (`cuenta_id`) y
// una obra ajena en `obra_id` es 404, como en todo lo demás.
// Mis gastos (`/movimientos`): SOLO los de su cuenta; GASTO/DEVOLUCION los apuntan
// las propias RPC del crédito (services/certapp/movimientos.js).
//
// Contrato: docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const supabase = require('../services/supabaseClient');
const { certappOnly, certappOAdmin, obraDeLaCuenta, olvidarCuenta } = require('../middleware/certappAuth');
const cuentas = require('../services/certapp/cuentas');
const obras = require('../services/certapp/obras');
const docs = require('../services/certapp/docs');
const ia = require('../services/certapp/ia');
const entrega = require('../services/certapp/entrega');
const asistente = require('../services/certapp/asistente');
const vistoIa = require('../services/certapp/vistoIa');
const avisos = require('../services/certapp/avisos');
const incidencias = require('../services/certapp/incidencias');
const movimientos = require('../services/certapp/movimientos');
const { datosDelCatastro } = require('../services/certapp/catastro');
const { cuestionario: logica } = require('../services/certapp/logica');
const {
    responderError, fallo, errorBd, cuentaPublica, evento, limitador, textoLargo, texto,
    nombreCompleto, numEnv, certappUrl,
} = require('../services/certapp/comun');

const maxRevisiones = () => numEnv('CERTAPP_REVISIONES_MAX', 2);

const router = express.Router();

const limiteAltas = limitador(30, 60 * 60 * 1000);        // 30 obras/hora por cuenta
const limiteCatastro = limitador(20, 10 * 60 * 1000);     // el WAF del Catastro no perdona ráfagas
const limiteFeedback = limitador(20, 60 * 60 * 1000);

/** La obra de :id si es de la cuenta; 404 si no (no se confirma que exista). */
async function obraSuya(req, id = req.params.id) {
    const cuenta = req.certapp.cuenta;
    if (!(await obraDeLaCuenta(id, cuenta.id))) throw fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
    const obra = await obras.cargar(id);
    if (!obra || obra.cuenta_id !== cuenta.id) throw fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
    return obra;
}

/** Para las subidas: la propiedad se comprueba antes de que multer lea un byte. */
async function obraSuyaAntes(req, res, next) {
    try { req.obra = await obraSuya(req); return next(); } catch (e) { return responderError(res, e, 'propiedad de la obra'); }
}

// ── Perfil ──────────────────────────────────────────────────────────────────
router.get('/me', certappOAdmin, async (req, res) => {
    try {
        if (req.certapp?.cuenta) cuentas.apuntarAcceso(req.certapp.cuenta);
        return res.json({ cuenta: cuentaPublica(req.certapp?.cuenta || null), esAdmin: !!req.certappAdmin });
    } catch (e) { return responderError(res, e, 'GET /me'); }
});

router.put('/me', certappOnly, async (req, res) => {
    try {
        const cuenta = await cuentas.actualizarPerfil(req.certapp.cuenta.id, req.body || {});
        return res.json({ cuenta: cuentaPublica(cuenta) });
    } catch (e) { return responderError(res, e, 'PUT /me'); }
});

/** Los municipios de una provincia (la dirección profesional del perfil, en cascada). */
router.get('/municipios', certappOnly, (req, res) => {
    try {
        const cod = String(req.query.prov || '').replace(/\D/g, '').padStart(2, '0');
        if (!/^(0[1-9]|[1-4]\d|5[0-2])$/.test(cod)) throw fallo(400, 'Provincia desconocida.', 'PROVINCIA_INVALIDA');
        const { cargarMunicipios } = require('./geo');
        return res.json({ municipios: cargarMunicipios()[cod] || [] });
    } catch (e) { return responderError(res, e, 'GET /municipios'); }
});

// ── Obras ───────────────────────────────────────────────────────────────────
router.get('/obras', certappOnly, async (req, res) => {
    try {
        return res.json({ obras: await obras.listar(req.certapp.cuenta.id) });
    } catch (e) { return responderError(res, e, 'GET /obras'); }
});

router.post('/obras', certappOnly, async (req, res) => {
    try {
        if (!limiteAltas(req.certapp.cuenta.id)) return res.status(429).json({ error: 'Demasiadas obras nuevas seguidas. Espera un rato.', code: 'DEMASIADAS_ALTAS' });
        const r = await obras.crear(req.certapp.cuenta, req.body || {});
        return res.status(201).json({ obra: obras.obraParaCertificador(r.obra), drive: r.drive });
    } catch (e) { return responderError(res, e, 'POST /obras'); }
});

router.get('/obras/:id', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        const { barrido } = await logica();
        const [eventos, enlaces] = await Promise.all([
            obras.eventos(obra.id),
            // Los enlaces del certificado, solo cuando ya se le ha entregado.
            ['LISTO', 'VALIDADO'].includes(obra.estado) ? entrega.enlaces(obra) : Promise.resolve(null),
        ]);
        if (enlaces) delete enlaces.ficheros;
        return res.json({
            obra: obras.obraParaCertificador(obra), barrido: barrido(obra, req.certapp.cuenta), eventos, enlaces,
            revisiones: { hechas: Number(obra.revisiones) || 0, max: maxRevisiones() },
        });
    } catch (e) { return responderError(res, e, 'GET /obras/:id'); }
});

router.put('/obras/:id', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        const nueva = await obras.actualizar(obra, req.body || {});
        return res.json({ obra: obras.obraParaCertificador(nueva) });
    } catch (e) { return responderError(res, e, 'PUT /obras/:id'); }
});

router.post('/obras/:id/catastro', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        obras.exigirBorrador(obra);   // pedida la obra, la vivienda no cambia (y no se consulta el Catastro)
        if (!limiteCatastro(req.certapp.cuenta.id)) return res.status(429).json({ error: 'Demasiadas consultas al Catastro seguidas. Espera unos minutos.', code: 'DEMASIADAS_CONSULTAS' });
        const rc = req.body?.rc || req.body?.ref_catastral || obra.ref_catastral;
        if (!rc) throw fallo(400, 'Falta la referencia catastral.', 'FALTA_RC');
        const patch = await datosDelCatastro(rc);
        const nueva = await obras.aplicarCatastro(obra, patch);
        await evento(obra.id, obra.cuenta_id, 'CATASTRO', `Datos del Catastro (${patch.ref_catastral})`, 'certificador');
        return res.json({ obra: obras.obraParaCertificador(nueva) });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/catastro'); }
});

// ── Fotos y documentos ──────────────────────────────────────────────────────
router.get('/obras/:id/docs', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        return res.json(await docs.vista(obra));
    } catch (e) { return responderError(res, e, 'GET /obras/:id/docs'); }
});

router.post('/obras/:id/docs/:slot', certappOnly, obraSuyaAntes, docs.recibirFicheros, async (req, res) => {
    try {
        const r = await docs.subir(req.obra, req.certapp.cuenta, req.params.slot, req.files || [], { por: 'certificador' });
        const fresca = await obras.cargar(req.obra.id);
        const vista = await docs.vista(fresca || req.obra);
        return res.json({
            ok: true,
            subidos: r.subidos.map(e => (vista.slots[req.params.slot] || []).find(x => x.driveId === e.driveId) || { driveId: e.driveId, nombre: e.nombre }),
            rechazados: r.rechazados, errores: r.errores, slots: vista.slots,
        });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/docs/:slot'); }
});

router.delete('/obras/:id/docs/:slot/:driveId', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        if (['LISTO', 'VALIDADO', 'ARCHIVADA'].includes(obra.estado)) throw fallo(409, 'El certificado ya está entregado: las fotos ya no se quitan.', 'OBRA_CERRADA');
        await docs.borrar(obra, req.params.slot, req.params.driveId);
        const fresca = await obras.cargar(obra.id);
        return res.json({ ok: true, ...(await docs.vista(fresca || obra)) });
    } catch (e) { return responderError(res, e, 'DELETE /obras/:id/docs'); }
});

/** El enlace del propietario: el vigente, o uno nuevo si no hay o ha caducado. */
router.post('/obras/:id/enlace-cliente', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        const { url, caduca_at } = await obras.enlacePortal(obra);
        return res.json({ url, caduca_at });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/enlace-cliente'); }
});

/** Enlace NUEVO para el propietario: el anterior deja de valer en el acto. */
router.post('/obras/:id/enlace-cliente/rotar', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        const nueva = await obras.rotarPortal(obra);
        await evento(obra.id, obra.cuenta_id, 'ENLACE_ROTADO', 'Enlace del propietario renovado (el anterior ya no vale)', 'certificador');
        return res.json({ url: obras.urlPortal(nueva), caduca_at: obras.portalCaducaAt(nueva).toISOString() });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/enlace-cliente/rotar'); }
});

// ── Generar, validar, revisar ───────────────────────────────────────────────
router.get('/obras/:id/barrido', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        return res.json((await logica()).barrido(obra, req.certapp.cuenta));
    } catch (e) { return responderError(res, e, 'GET /obras/:id/barrido'); }
});

/**
 * «Lo que ha visto la IA» (fase 5): mira las fotos (o Street View) y PROPONE;
 * no escribe en la obra. Gratis para el certificador, con tope por cuenta y día
 * y por obra (services/certapp/vistoIa.js).
 */
router.post('/obras/:id/visto-ia', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        obras.exigirBorrador(obra);
        return res.json(await vistoIa.mirar(obra, req.certapp.cuenta));
    } catch (e) { return responderError(res, e, 'POST /obras/:id/visto-ia'); }
});

// Lo que devuelven las RPC del crédito de la obra (scripts/certapp_schema.sql).
const SIN_CREDITOS = -1;        // la cuenta no tiene saldo
const YA_CONSUMIDO = -2;        // consumir: la obra YA tiene su crédito · devolver: no lo tiene

/**
 * Generar: barrido en el servidor → BORRADOR→EN_PREPARACION (condicional, así
 * dos clics no piden dos veces) → el crédito DE LA OBRA (402 si no le quedan;
 * si la obra ya lo tenía gastado, no se cobra otra vez) → aviso al equipo y, si
 * CERTAPP_IA_AUTO, encargo a la IA. Si algo falla después de gastarlo, se devuelve
 * (la RPC deja la obra en BORRADOR) y se apunta CREDITO_DEVUELTO.
 */
router.post('/obras/:id/generar', certappOnly, async (req, res) => {
    const cuenta = req.certapp.cuenta;
    let obra;
    let marcada = false;
    let gastado = false;
    try {
        obra = await obraSuya(req);
        if (obra.estado !== 'BORRADOR') {
            throw fallo(409, obra.estado === 'EN_PREPARACION' ? 'Este certificado ya está pedido: te avisamos cuando esté.' : 'Este certificado ya está hecho.', 'YA_PEDIDO');
        }
        const { barrido, sanearCuestionario, NOMBRE_EQUIPO } = await logica();

        // «Usar un equipo genérico» desde el popup del barrido.
        const g = req.body?.genericos;
        const genericos = (Array.isArray(g) ? g : (g && typeof g === 'object' ? Object.keys(g).filter(k => g[k]) : []))
            .map(s => String(s).toUpperCase()).filter(e => NOMBRE_EQUIPO[e]);
        if (genericos.length) {
            const c = { ...(obra.cuestionario || {}) };
            c.fotos_decision = { ...(c.fotos_decision || {}) };
            for (const e of genericos) c.fotos_decision[e] = 'GENERICA';
            const { data, error } = await supabase.from('certapp_obras').update({ cuestionario: sanearCuestionario(c) })
                .eq('id', obra.id).eq('estado', 'BORRADOR').select('*');
            if (error) throw errorBd(error, 'genéricos');
            if (!data?.length) throw fallo(409, 'Este certificado ya está pedido.', 'YA_PEDIDO');
            obra = data[0];
        }

        const b = barrido(obra, cuenta);
        if (!b.listo) return res.status(422).json({ error: 'Falta algo para poder pedir el certificado.', code: 'BARRIDO', barrido: b });

        const ahora = new Date().toISOString();
        const { data: filas, error: errMarca } = await supabase.from('certapp_obras')
            .update({ estado: 'EN_PREPARACION', pedido_at: ahora }).eq('id', obra.id).eq('estado', 'BORRADOR').select('*');
        if (errMarca) throw errorBd(errMarca, 'marcar EN_PREPARACION');
        if (!filas?.length) throw fallo(409, 'Este certificado ya está pedido.', 'YA_PEDIDO');
        marcada = true;
        obra = filas[0];

        const { data: quedan, error: errCred } = await supabase.rpc('certapp_consumir_credito_obra', { p_obra_id: obra.id });
        if (errCred) throw errorBd(errCred, 'consumir crédito');
        if (typeof quedan !== 'number') throw fallo(503, 'No he podido comprobar tus certificados. Prueba en un momento.', 'BD_NO_DISPONIBLE');
        if (quedan === SIN_CREDITOS) {
            await supabase.from('certapp_obras').update({ estado: 'BORRADOR', pedido_at: null }).eq('id', obra.id).eq('estado', 'EN_PREPARACION');
            marcada = false;
            return res.status(402).json({ error: 'No te quedan certificados. Escríbenos para conseguir más.', code: 'SIN_CREDITOS' });
        }
        const yaPagada = quedan === YA_CONSUMIDO;   // p. ej. un intento anterior que no llegó a devolverlo
        gastado = !yaPagada;
        if (gastado) olvidarCuenta(cuenta.id);
        const saldo = yaPagada ? (cuenta.creditos ?? null) : quedan;

        await evento(obra.id, cuenta.id, 'GENERAR',
            yaPagada ? 'Certificado pedido (el crédito de esta obra ya estaba gastado)' : `Certificado pedido (quedan ${quedan} créditos)`,
            'certificador', { genericos, avisos: b.avisos.map(a => a.id) });
        const r = await ia.pedirCee(obra, cuenta);
        return res.json({ ok: true, obra: obras.obraParaCertificador(obra), creditos: saldo, ia: { auto: r.ia.auto, ok: r.ia.ok ?? null } });
    } catch (e) {
        if (gastado && obra?.id) {
            const { data, error } = await supabase.rpc('certapp_devolver_credito_obra', {
                p_obra_id: obra.id, p_por: 'BROKERGY',
                p_texto: 'Crédito devuelto: no se ha podido pedir el certificado',
                p_por_detalle: 'automático', p_nota_interna: texto(e?.message, 500) || null,
            });
            if (error) console.error('[certapp] ¡crédito SIN devolver tras un fallo!', obra.id, error.message);
            else if (data !== YA_CONSUMIDO) olvidarCuenta(cuenta.id);
        }
        if (marcada && obra?.id) {
            await supabase.from('certapp_obras').update({ estado: 'BORRADOR', pedido_at: null }).eq('id', obra.id).eq('estado', 'EN_PREPARACION');
        }
        return responderError(res, e, 'POST /obras/:id/generar');
    }
});

router.post('/obras/:id/validar', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        if (obra.estado !== 'LISTO') throw fallo(409, 'Solo se valida un certificado entregado.', 'ESTADO_NO_VALIDABLE');
        const { data, error } = await supabase.from('certapp_obras')
            .update({ estado: 'VALIDADO', validado_at: new Date().toISOString() }).eq('id', obra.id).eq('estado', 'LISTO').select('*');
        if (error) throw errorBd(error, 'validar');
        if (!data?.length) throw fallo(409, 'El certificado ha cambiado de estado. Recarga.', 'ESTADO_NO_VALIDABLE');
        await evento(obra.id, obra.cuenta_id, 'VALIDADO', 'El certificador da el certificado por bueno', 'certificador');
        return res.json({ ok: true, obra: obras.obraParaCertificador(data[0]) });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/validar'); }
});

/**
 * Tras tocar la envolvente: vuelve a EN_PREPARACION y avisa a BROKERGY, sin gastar
 * crédito y SIN cambiar ningún dato de la obra. Como mucho CERTAPP_REVISIONES_MAX
 * veces por obra (contador `revisiones`, condicional: dos clics no cuentan dos).
 */
router.post('/obras/:id/revisar-de-nuevo', certappOnly, async (req, res) => {
    try {
        const obra = await obraSuya(req);
        if (!['LISTO', 'VALIDADO'].includes(obra.estado)) throw fallo(409, 'Solo se pide revisar un certificado ya entregado.', 'ESTADO_NO_REVISABLE');
        const max = maxRevisiones();
        const hechas = Number(obra.revisiones) || 0;
        if (hechas >= max) {
            throw fallo(409, `Ya has pedido revisar este certificado ${hechas} ${hechas === 1 ? 'vez' : 'veces'}, el máximo. Si hay que cambiar algo más, escríbenos.`,
                'SIN_REVISIONES', { revisiones: { hechas, max } });
        }
        const nota = textoLargo(req.body?.nota, 2000);
        const { data, error } = await supabase.from('certapp_obras')
            .update({ estado: 'EN_PREPARACION', pedido_at: new Date().toISOString(), revisiones: hechas + 1 })
            .eq('id', obra.id).eq('estado', obra.estado).eq('revisiones', hechas).select('*');
        if (error) throw errorBd(error, 'revisar de nuevo');
        if (!data?.length) throw fallo(409, 'El certificado ha cambiado de estado. Recarga.', 'ESTADO_NO_REVISABLE');
        await evento(obra.id, obra.cuenta_id, 'REVISAR',
            `${nota ? `Pide revisar de nuevo: ${nota}` : 'Pide revisar de nuevo tras tocar la envolvente'} (${hechas + 1} de ${max})`, 'certificador');
        const quien = nombreCompleto(req.certapp.cuenta) || req.certapp.cuenta.email;
        await avisos.avisarEquipo({
            asunto: `${obra.numero_expediente} — piden regenerar el certificado`,
            cuerpo: `🔁 ${obra.numero_expediente}: ${quien} ha tocado la envolvente y pide regenerar el certificado (${hechas + 1}.ª de ${max}).${nota ? `\nNota: ${nota}` : ''}\nAbrir: ${ia.enlaceAdmin(obra)}`,
        });
        return res.json({ ok: true, obra: obras.obraParaCertificador(data[0]), revisiones: { hechas: hechas + 1, max } });
    } catch (e) { return responderError(res, e, 'POST /obras/:id/revisar-de-nuevo'); }
});

// ── Incidencias y sugerencias ───────────────────────────────────────────────
// De una obra (el acceso «¿Algo mal en este certificado?» de su ficha) o de la app
// en general (el botón flotante). El certificador ve las SUYAS en «Mis incidencias»
// con el estado en palabras llanas y la respuesta de BROKERGY (services/certapp/incidencias.js).
router.post('/feedback', certappOnly, async (req, res) => {
    try {
        const cuenta = req.certapp.cuenta;
        if (!limiteFeedback(cuenta.id)) return res.status(429).json({ error: 'Muchos avisos seguidos: espera un rato.', code: 'DEMASIADAS_SUGERENCIAS' });
        const textoFb = textoLargo(req.body?.texto, 4000);
        if (!textoFb) throw fallo(400, 'Cuéntanos qué pasa.', 'FALTA_TEXTO');
        const tipo = incidencias.TIPOS.includes(String(req.body?.tipo || '').toUpperCase()) ? String(req.body.tipo).toUpperCase() : 'SUGERENCIA';
        let obraId = req.body?.obra_id || null;
        if (obraId && !(await obraDeLaCuenta(obraId, cuenta.id))) throw fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
        const { data, error } = await supabase.from('certapp_feedback').insert({
            cuenta_id: cuenta.id, obra_id: obraId, tipo, texto: textoFb,
            pantalla: texto(req.body?.pantalla, 200), user_agent: texto(req.headers['user-agent'], 300),
        }).select(incidencias.COLS_CERTIFICADOR).single();
        if (error) throw errorBd(error, 'feedback');
        const num = data?.obra?.numero_expediente;
        await avisos.avisarEquipo({
            asunto: 'Incidencia en la app de certificadores',
            cuerpo: `💬 ${tipo} de ${nombreCompleto(cuenta) || cuenta.email}${num ? ` en ${num}` : ' en la app de certificadores'}${req.body?.pantalla ? ` (${texto(req.body.pantalla, 80)})` : ''}: ${textoFb.slice(0, 300)}${textoFb.length > 300 ? '…' : ''}\nContestar: ${certappUrl()}/admin/sugerencias`,
            soloWhatsapp: true,
        });
        return res.status(201).json({ ok: true, id: data.id, incidencia: incidencias.paraCertificador(data) });
    } catch (e) { return responderError(res, e, 'POST /feedback'); }
});

/**
 * Las incidencias DEL certificador (nunca las de otro), las más nuevas primero.
 * `?obra_id=` → solo las de esa obra, que tiene que ser suya: si no, 404.
 */
router.get('/feedback', certappOnly, async (req, res) => {
    try {
        const cuenta = req.certapp.cuenta;
        const obraId = req.query.obra_id != null && req.query.obra_id !== '' ? String(req.query.obra_id) : null;
        // La propiedad, antes de leer nada de la tabla.
        if (obraId && !(await obraDeLaCuenta(obraId, cuenta.id))) throw fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
        let q = supabase.from('certapp_feedback').select(incidencias.COLS_CERTIFICADOR).eq('cuenta_id', cuenta.id);
        if (obraId) q = q.eq('obra_id', obraId);
        const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
        if (error) throw errorBd(error, 'listar incidencias');
        return res.json({ incidencias: (data || []).map(incidencias.paraCertificador) });
    } catch (e) { return responderError(res, e, 'GET /feedback'); }
});

// ── Mis gastos ──────────────────────────────────────────────────────────────
/**
 * Sus certificados: las cifras (disponibles, usados, recibidos gratis, gastado en €)
 * y los movimientos, SOLO los de su cuenta, con la obra (nº y dirección) de cada
 * gasto. Sin `por` (quién del equipo). BD caída → 503, nunca un 0.
 */
router.get('/movimientos', certappOnly, async (req, res) => {
    try {
        const cuentaId = req.certapp.cuenta.id;
        const resumen = await movimientos.resumen(cuentaId);
        const lista = await movimientos.listar(cuentaId);
        return res.json({ resumen, movimientos: lista });
    } catch (e) { return responderError(res, e, 'GET /movimientos'); }
});

// ── Asistente capado ────────────────────────────────────────────────────────
router.post('/asistente', certappOnly, async (req, res) => {
    try {
        const cuenta = req.certapp.cuenta;
        let obra = null;
        if (req.body?.obra_id) obra = await obraSuya(req, req.body.obra_id);
        const pantalla = ['menu', 'obra', 'envolvente'].includes(req.body?.pantalla) ? req.body.pantalla : null;
        return res.json(await asistente.preguntar({ cuenta, mensajes: req.body?.mensajes, obra, pantalla }));
    } catch (e) { return responderError(res, e, 'POST /asistente'); }
});

router.get('/asistente/cupo', certappOnly, async (req, res) => {
    try {
        return res.json(asistente.cupoPublico(await asistente.cupo(req.certapp.cuenta.id)));
    } catch (e) { return responderError(res, e, 'GET /asistente/cupo'); }
});

module.exports = router;
