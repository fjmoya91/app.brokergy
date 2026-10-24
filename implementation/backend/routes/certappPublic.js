// ─── /api/public/certapp — lo público de la app de certificadores ────────────
// Sin sesión POR DISEÑO: cada ruta valida lo suyo dentro.
//   · /beta/token    token del formulario (HMAC con la hora), límite por IP
//   · /beta          honeypot `web` + límite por IP + `form_token` (≥ 3 s, ≤ 2 h, un
//                    solo uso) + Turnstile solo si TURNSTILE_ENABLED, hay clave y
//                    llega `turnstile_token`. Respuesta SIEMPRE `{ ok }`.
//   · /activar       token HMAC firmado con caducidad y de un solo uso (services/certapp/tokens.js)
//   · /recuperar     responde YA y SIEMPRE { ok } (no se confirma qué emails tienen cuenta,
//                    ni por lo que tarda: el envío va después, con setImmediate)
//   · /subir         el `portal_token` de la obra (enlace del propietario), que CADUCA
//                    (CERTAPP_PORTAL_DIAS) y se puede rotar
//   · /thumb         firma HMAC de MINIATURA sobre obra + fichero, 12 h (no vale para /fichero)
//   · /fichero       firma HMAC de FICHERO, 12 h
// /thumb y /fichero sirven con Content-Type de una lista, nosniff y CSP sandbox
// (services/certapp/tipos.js): nada de lo subido se ejecuta en el origen de la app.
//
// REGLA — la IP de los límites es `X-Real-IP` (comun.ipDe), nunca la primera de
// X-Forwarded-For, que la escribe el cliente.
//
// Montado en server.js ANTES de /api/public. Ver
// docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const crypto = require('crypto');
const supabase = require('../services/supabaseClient');
const { verifyTurnstileToken, isEnabled: turnstileActivo } = require('../services/turnstileService');
const beta = require('../services/certapp/beta');
const cuentas = require('../services/certapp/cuentas');
const docs = require('../services/certapp/docs');
const drive = require('../services/certapp/drive');
const obras = require('../services/certapp/obras');
const tokens = require('../services/certapp/tokens');
const tipos = require('../services/certapp/tipos');
const { responderError, fallo, errorBd, ipDe, esUuid, limitador, unaVez, evento } = require('../services/certapp/comun');

const router = express.Router();

const limiteBeta = limitador(6, 60 * 60 * 1000);          // 6 envíos/hora por IP
const limiteBetaToken = limitador(60, 60 * 60 * 1000);    // pedir formularios
const formularioUsado = unaVez(tokens.FORMULARIO.maxMs + 60 * 1000);
const limiteActivar = limitador(20, 15 * 60 * 1000);      // probar tokens a lo bruto
const limiteRecuperarIp = limitador(8, 60 * 60 * 1000);
const limiteRecuperarEmail = limitador(3, 60 * 60 * 1000);
const limiteSubidaCliente = limitador(60, 10 * 60 * 1000);

// ── Lista de espera de la beta ──────────────────────────────────────────────
router.get('/beta/token', (req, res) => {
    try {
        if (!limiteBetaToken(ipDe(req))) return res.status(429).json({ error: 'Demasiadas peticiones seguidas. Prueba dentro de un rato.', code: 'DEMASIADOS_ENVIOS' });
        res.set('Cache-Control', 'no-store');
        return res.json({ token: tokens.firmarFormulario() });
    } catch (e) { return responderError(res, e, 'GET /beta/token'); }
});

const MENSAJE_FORMULARIO = {
    formato: 'Recarga la página y vuelve a enviar el formulario.',
    firma: 'Recarga la página y vuelve a enviar el formulario.',
    usado: 'Este formulario ya se ha enviado. Recarga la página si quieres enviarlo otra vez.',
    pronto: 'Espera un momento antes de enviar el formulario.',
    caducado: 'El formulario ha caducado. Recarga la página y vuelve a enviarlo.',
};

router.post('/beta', async (req, res) => {
    try {
        const body = req.body || {};
        // Honeypot: un bot rellena el campo oculto; se le dice que sí y no se guarda nada.
        if (body.web) return res.json({ ok: true });
        const ip = ipDe(req);
        if (!limiteBeta(ip)) return res.status(429).json({ error: 'Demasiados envíos seguidos. Prueba dentro de un rato.', code: 'DEMASIADOS_ENVIOS' });

        // El formulario se pidió con GET /beta/token hace entre 3 s y 2 h, y una sola vez.
        const ft = tokens.verificarFormulario(body.form_token);
        if (!ft.ok) return res.status(400).json({ error: MENSAJE_FORMULARIO[ft.motivo], code: 'FORM_TOKEN', motivo: ft.motivo });
        const claveForm = String(body.form_token).trim().toLowerCase();
        if (!formularioUsado(claveForm)) {
            return res.status(400).json({ error: MENSAJE_FORMULARIO.usado, code: 'FORM_TOKEN', motivo: 'usado' });
        }
        try {
            // Turnstile, solo si está encendido, configurado y el navegador lo trae
            // (sin claves de Cloudflare no rompe nada: manda el form_token).
            if (turnstileActivo() && process.env.TURNSTILE_SECRET_KEY && body.turnstile_token) {
                const t = await verifyTurnstileToken(body.turnstile_token, ip);
                if (!t.ok) {
                    formularioUsado.liberar(claveForm);
                    return res.status(403).json({ error: 'No hemos podido comprobar que no eres un robot. Recarga la página y vuelve a probar.', code: 'CAPTCHA_FALLIDO' });
                }
            }
            await beta.apuntar(body, { ip, userAgent: req.headers['user-agent'] });
        } catch (e) {
            // Un campo mal (400) o la BD caída (503) no gastan el formulario: se corrige y se reenvía.
            formularioUsado.liberar(claveForm);
            throw e;
        }
        return res.json({ ok: true });
    } catch (e) { return responderError(res, e, 'POST /beta'); }
});

// ── Activar la cuenta / cambiar la contraseña ───────────────────────────────
router.get('/activar/:token', async (req, res) => {
    try {
        if (!limiteActivar(ipDe(req))) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.', code: 'DEMASIADOS_INTENTOS' });
        return res.json(await cuentas.infoActivacion(req.params.token));
    } catch (e) { return responderError(res, e, 'GET /activar'); }
});

router.post('/activar', async (req, res) => {
    try {
        if (!limiteActivar(ipDe(req))) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.', code: 'DEMASIADOS_INTENTOS' });
        const { token, password } = req.body || {};
        return res.json(await cuentas.activar(token, password));
    } catch (e) { return responderError(res, e, 'POST /activar'); }
});

router.post('/recuperar', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ip = ipDe(req);
    // Se responde YA: lo que tardaría buscar la cuenta y mandar el email diría
    // si ese email tiene cuenta. Ni el límite ni un fallo cambian la respuesta.
    res.json({ ok: true });
    setImmediate(() => {
        if (!(limiteRecuperarIp(ip) && limiteRecuperarEmail(email))) return;
        cuentas.recuperar(email).catch((e) => console.warn('[certapp] recuperar:', e.message));
    });
});

// ── Vista CLIENTE: el propietario sube fotos con el enlace ──────────────────
function tokenIgual(a, b) {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

const COLS_ENLACE = 'id, numero_expediente, cuenta_id, estado, direccion, municipio, titular, cuestionario, documentacion, portal_token, portal_token_at, drive_folder_id, drive_folder_link, nombre';

async function obraDelEnlace(req) {
    const { id } = req.params;
    if (!esUuid(id)) throw fallo(404, 'Este enlace no es válido.', 'ENLACE_INVALIDO');
    const { data: obra, error } = await supabase.from('certapp_obras').select(COLS_ENLACE).eq('id', id).maybeSingle();
    if (error) throw errorBd(error, 'obra del enlace');
    // 404 tanto si no existe como si el token no cuadra: no se confirma que exista.
    if (!obra || !tokenIgual(req.query.token, obra.portal_token)) throw fallo(404, 'Este enlace no es válido o ha caducado.', 'ENLACE_INVALIDO');
    // Con el token bueno ya se puede decir que ha caducado (quien lo tiene lo recibió).
    if (!obras.portalVigente(obra)) throw fallo(410, 'Este enlace ha caducado. Pide uno nuevo a quien te lo mandó.', 'ENLACE_CADUCADO');
    return obra;
}

const caducaDe = (obra) => obras.portalCaducaAt(obra)?.toISOString() || null;

router.get('/subir/:id', async (req, res) => {
    try {
        const obra = await obraDelEnlace(req);
        return res.json(await docs.vistaCliente(obra, { caducaAt: caducaDe(obra) }));
    } catch (e) { return responderError(res, e, 'GET /subir'); }
});

// El enlace se comprueba ANTES de leer los ficheros: sin token válido no se
// carga en memoria ni un byte (multer va en memoria, hasta 110 MB por fichero).
async function enlaceValido(req, res, next) {
    try {
        if (!limiteSubidaCliente(ipDe(req))) return res.status(429).json({ error: 'Demasiadas subidas seguidas. Espera unos minutos.', code: 'DEMASIADAS_SUBIDAS' });
        req.obraEnlace = await obraDelEnlace(req);
        if (['LISTO', 'VALIDADO', 'ARCHIVADA'].includes(req.obraEnlace.estado)) {
            return res.status(409).json({ error: 'El certificado ya está hecho: ya no hace falta subir más fotos.', code: 'OBRA_CERRADA' });
        }
        return next();
    } catch (e) { return responderError(res, e, 'POST /subir (enlace)'); }
}

router.post('/subir/:id/:slot', enlaceValido, docs.recibirFicheros, async (req, res) => {
    try {
        const obra = req.obraEnlace;
        const { data: cuenta, error } = await supabase.from('certapp_cuentas').select('*').eq('id', obra.cuenta_id).maybeSingle();
        if (error) throw errorBd(error, 'cuenta de la obra');
        const r = await docs.subir(obra, cuenta, req.params.slot, req.files || [], { por: 'cliente' });
        if (r.subidos.length) await evento(obra.id, obra.cuenta_id, 'SUBIDA_CLIENTE', `El propietario ha subido ${r.subidos.length} archivo(s) a ${req.params.slot}`, 'cliente');
        const { data: fresca, error: errFresca } = await supabase.from('certapp_obras').select(COLS_ENLACE).eq('id', obra.id).maybeSingle();
        // Lo subido ya está guardado: si releer falla, se enseña lo de antes.
        if (errFresca) console.warn('[certapp] /subir: no se ha podido releer la obra:', errFresca.message);
        const vista = await docs.vistaCliente(fresca || obra, { caducaAt: caducaDe(fresca || obra) });
        return res.json({ ok: true, subidos: r.subidos.length, rechazados: r.rechazados, errores: r.errores, ...vista });
    } catch (e) { return responderError(res, e, 'POST /subir'); }
});

// ── Miniaturas y ficheros con firma (para <img> y <a> sin cabecera de sesión) ──
const idsValidos = (id, driveId) => esUuid(id) && /^[\w-]{10,200}$/.test(driveId);

router.get('/thumb/:id/:driveId', async (req, res) => {
    try {
        const { id, driveId } = req.params;
        if (!idsValidos(id, driveId) || !tokens.verificarMiniatura(id, driveId, req.query.t)) return res.status(403).end();
        const img = await drive.miniatura(driveId, req.query.sz);
        if (!img || !tipos.MIME_MINIATURA.has(img.type)) return res.status(404).end();
        tipos.cabecerasSeguras(res);
        res.set('Content-Type', img.type);
        res.set('Content-Disposition', 'inline');
        res.set('Cache-Control', 'private, max-age=3600');
        return res.send(img.buf);
    } catch (e) {
        if (e?.status === 503) return responderError(res, e, 'GET /thumb');   // sin CERTAPP_TOKEN_SECRET
        console.warn('[certapp thumb]', e.message);
        return res.status(404).end();
    }
});

router.get('/fichero/:id/:driveId', async (req, res) => {
    try {
        const { id, driveId } = req.params;
        if (!idsValidos(id, driveId) || !tokens.verificarFichero(id, driveId, req.query.t)) {
            return res.status(403).json({ error: 'El enlace ha caducado. Vuelve a abrir la obra.', code: 'ENLACE_CADUCADO' });
        }
        const f = await drive.abrirFichero(driveId);
        if (!f) return res.status(404).json({ error: 'No encuentro ese archivo.', code: 'FICHERO_NO_ENCONTRADO' });
        // Content-Type de la LISTA (si no, octet-stream), en línea solo imagen y
        // PDF, y siempre nosniff + CSP sandbox.
        tipos.cabecerasFichero(res, { mime: f.meta.mimeType, nombre: f.meta.name || 'archivo' });
        if (f.meta.size) res.set('Content-Length', String(f.meta.size));
        res.set('Cache-Control', 'private, max-age=600');
        f.stream.on('error', (e) => { console.warn('[certapp fichero] stream:', e.message); res.destroy(e); });
        return f.stream.pipe(res);
    } catch (e) {
        if (e?.status === 503) return responderError(res, e, 'GET /fichero');   // sin CERTAPP_TOKEN_SECRET
        console.warn('[certapp fichero]', e.message);
        return res.status(404).json({ error: 'No encuentro ese archivo.', code: 'FICHERO_NO_ENCONTRADO' });
    }
});

module.exports = router;
