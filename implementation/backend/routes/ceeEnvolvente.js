const express = require('express');
const router = express.Router();
const multer = require('multer');
const { internalOnly, staffOnly, isStaff, requireAuth } = require('../middleware/auth');
const { identificarCertapp, obraDeLaCuenta } = require('../middleware/certappAuth');
const cex = require('../services/ceeEnvolventeCex');

// ─────────────────────────────────────────────────────────────────────────────
// Envolvente térmica — proxy al microservicio `cee-engine`.
//
// Aquí NO se hace geometría. El motor vive en su propio contenedor Python
// porque lo que hace —GEOS, PROJ y escribir pickles de CE3X— no tiene
// equivalente en Node, igual que el `rite-generator`. Este fichero pone lo que
// el motor no sabe: quién pregunta, de qué expediente y dónde se guarda.
//
// El motor no tiene sesión ni estado: entra un JSON, sale geometría o un .cex.
//
// Acceso: `internalOnly`, no `staffOnly`. El CERTIFICADOR es quien usa esto —es
// su herramienta de trabajo— y con `staffOnly` se quedaba fuera. Los partners
// (PRESCRIPTOR / INSTALADOR / DISTRIBUIDOR) no entran: no es su ámbito. Y el
// certificador EXTERNO de la app de certificadores entra solo a SUS obras
// (`origen=ext`): ver `internoOExtSuyo`, el guardián de las rutas con id.
// ─────────────────────────────────────────────────────────────────────────────

const MOTOR = process.env.CEE_ENGINE_URL || 'http://cee-engine:8080';

/**
 * De qué NEGOCIO es el id que llega: el expediente CAE de siempre, un CEE
 * contratado suelto (`cee`), una oportunidad (`op`) o la obra de un certificador
 * externo (`ext`). El mapa de dónde vive cada uno: `cex.ORIGENES`.
 *
 * REGLA — viaja EXPLÍCITO desde el navegador (`?origen=cee`), nunca se busca «a
 * ver en qué tabla está ese UUID». Son varias tablas y el mismo id no vale en
 * todas: una búsqueda a ciegas es la forma de escribir el trabajo del certificador
 * en el negocio equivocado. Es el mismo criterio que `?cee=` frente a `?exp=` en
 * los enlaces que ya viajan en los mensajes. Un origen desconocido es 400.
 */
//: ⚠️ El origen que vale es el que vio el GUARDIÁN (`req._origenEnvolvente`). En
//: una subida multipart el cuerpo lo lee `multer` DESPUÉS del guardián: con el
//: origen en el cuerpo y no en la query, el guardián vería «cae» (y dejaría pasar
//: a un CERTIFICADOR del CRM) y el handler, «ext». El navegador lo manda siempre
//: en la query (`apiEnvolvente.api`).
const origenDe = (req) => req._origenEnvolvente
    || cex.origenNorm(req.query?.origen || req.body?.origen);

/**
 * `origen=op` — una OPORTUNIDAD aún sin aceptar: la envolvente se empieza desde
 * la calculadora y lo señalado pasa al expediente al aceptarla.
 *
 * REGLA — eso es del EQUIPO INTERNO. El certificador entra a los expedientes
 * que tiene asignados, y una oportunidad no tiene certificador: no es su sitio
 * (y la oportunidad lleva el margen de Brokergy dentro).
 */
const staffSiOportunidad = (req, res, next) => {
    let origen;
    try { origen = origenDe(req); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message, code: e.code }); }
    if (origen === 'op' && !isStaff(req)) {
        return res.status(403).json({
            error: 'La envolvente de una oportunidad es del equipo interno.' });
    }
    next();
};

/**
 * El guardián de toda ruta con `:expedienteId` (salvo las `staffOnly`).
 *
 *   · `origen` cae / cee / op → `internalOnly`, exactamente como hasta ahora.
 *   · `origen=ext` (la OBRA de un certificador externo, app de certificadores):
 *       - el equipo interno (ADMIN / TRABAJADOR) pasa, como a todo;
 *       - un certificador de la app pasa SOLO a una obra SUYA (`obraDeLaCuenta`);
 *         si no lo es —o no existe, o no tiene cuenta—, 404: no se confirma que
 *         exista (docs/conocimiento/certificadores-app, «lo ajeno es 404»);
 *       - un CERTIFICADOR del CRM es un técnico de BROKERGY, no el dueño de la
 *         obra: sin una cuenta de la app que sea la dueña, 404 igual;
 *       - sin sesión, 401; con la BD caída, 503 (regla 38), nunca «no es tuya».
 *   · un `origen` que no existe, 400 (nunca se trata como CAE).
 *
 * Un certificador de la app NO pasa por aquí a nada que no sea `origen=ext`:
 * no tiene fila en `usuarios`, así que `internalOnly` le responde 403.
 * Deja `req.certapp` (la cuenta) cuando entra un certificador de la app.
 */
const internoOExtSuyo = (req, res, next) => {
    let origen;
    try { origen = origenDe(req); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message, code: e.code }); }
    req._origenEnvolvente = origen;                 // fijado: el handler usa ESTE
    if (origen !== 'ext') return internalOnly(req, res, next);

    const noEncontrada = () => res.status(404).json({ error: 'Obra no encontrada.', code: 'OBRA_NO_ENCONTRADA' });
    requireAuth(req, res, async () => {
        try {
            if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión.', code: 'SIN_SESION' });
            if (isStaff(req)) return next();
            const id = await identificarCertapp(req);
            if (!id) return res.status(401).json({ error: 'Debes iniciar sesión.', code: 'SIN_SESION' });
            if (!id.ok) return res.status(id.status).json({ error: id.error, code: id.code });
            const cuenta = id.cuenta;
            if (!cuenta) return noEncontrada();
            if (cuenta.estado === 'BLOQUEADA') {
                return res.status(403).json({ error: 'Tu cuenta está bloqueada. Escríbenos si crees que es un error.',
                                              code: 'CERTAPP_BLOQUEADA' });
            }
            if (!(await obraDeLaCuenta(req.params.expedienteId, cuenta.id))) return noEncontrada();
            req.certapp = { authId: id.authId, email: id.email, cuenta };
            return next();
        } catch (e) {
            if (e.status === 503) {
                return res.status(503).json({ error: 'No hemos podido comprobar la obra. Vuelve a intentarlo en '
                                                     + 'unos segundos.', code: 'OBRA_NO_DISPONIBLE' });
            }
            console.error('[ceeEnvolvente] guardián ext:', e.message);
            return res.status(500).json({ error: 'Error interno en autenticación' });
        }
    });
};

// ─── Origen `ext`: la RC fijada, la obra pedida y un tope por CUENTA ─────────
//
// La obra de un certificador externo se PAGA por edificio (un crédito al pasar
// de BORRADOR a EN_PREPARACION). Tres cosas lo hacen valer:
//   · la RC sale SIEMPRE de `certapp_obras.ref_catastral` (`rcFijadaExt`): la del
//     cuerpo de la petición se ignora (`pedirGeometria`, `rcDe` en el servicio);
//   · el `.cex` (y el croquis) solo con la obra PEDIDA (`obraSinPedir`) y sobre
//     una geometría de ESA RC (`geometriaDeOtraRc`);
//   · un TOPE por cuenta en lo que cuesta: Catastro (reglas 15-17: en serie,
//     nunca en ráfaga; su WAF es el mismo del que depende el CRM) y Gemini.
// El equipo interno y los orígenes cae / cee / op no pasan por aquí.

/** La RC de una obra `ext`, de la BD y normalizada (14 o 20 caracteres). */
function rcFijadaExt(ctx) {
    return String(ctx?.expediente?.ref_catastral || ctx?.expediente?.instalacion?.ref_catastral || '')
        .replace(/[\s./-]+/g, '').toUpperCase();
}

//: Los estados en que la obra NO está pedida. Sin estado se trata como BORRADOR:
//: ante la duda, no se regala un certificado.
const ESTADOS_SIN_PEDIR = ['BORRADOR', 'ARCHIVADA'];

/** `null` si la obra está pedida; si no, `{ status: 409, code: 'OBRA_SIN_PEDIR', error }`. */
function obraSinPedir(expediente) {
    const estado = String(expediente?.estado || 'BORRADOR').toUpperCase();
    if (!ESTADOS_SIN_PEDIR.includes(estado)) return null;
    return {
        status: 409, code: 'OBRA_SIN_PEDIR',
        error: estado === 'ARCHIVADA'
            ? 'Esta obra está archivada: ya no se puede generar su certificado. Si la necesitas, escríbenos.'
            : 'Esta obra todavía es un borrador: el certificado se genera cuando la pides (es entonces '
              + 'cuando se usa el crédito). Pídela desde la ficha de la obra y vuelve a intentarlo.',
    };
}

/**
 * ¿La geometría que manda el navegador es de OTRA referencia catastral? El motor
 * la devuelve con su `referencia_catastral` (`refcat_parcela`, `refcat_inmueble`,
 * `entrada`): tiene que ser la de la obra —la parcela (14) y, si las dos llevan
 * la vivienda, la vivienda (20)—. Devuelve el motivo, o `null` si casa.
 */
function geometriaDeOtraRc(geometria, rcObra) {
    const obra = String(rcObra || '').replace(/[\s./-]+/g, '').toUpperCase();
    if (obra.length < 14) return 'La obra no tiene una referencia catastral válida.';
    const r = geometria?.referencia_catastral || {};
    const vistas = [r.refcat_parcela, r.refcat_inmueble, r.inmueble, r.completa, r.entrada]
        .filter(v => v != null && String(v).trim())
        .map(v => String(v).replace(/[\s./-]+/g, '').toUpperCase());
    if (!vistas.length) {
        return 'La geometría no dice de qué referencia catastral es: vuelve a traer la envolvente y genera otra vez.';
    }
    const otra = vistas.some(v => (v.length >= 20 && obra.length >= 20)
        ? v.slice(0, 20) !== obra.slice(0, 20)
        : v.slice(0, 14) !== obra.slice(0, 14));
    return otra
        ? 'Esa geometría es de otra referencia catastral, no de la de esta obra. Vuelve a traer la envolvente y genera otra vez.'
        : null;
}

/** La puerta del `.cex` de una obra `ext`: pedida, y con la geometría de SU RC. */
function cortaCexExt(ctx, geometria) {
    const sinPedir = obraSinPedir(ctx?.expediente);
    if (sinPedir) return sinPedir;
    const motivo = geometriaDeOtraRc(geometria, rcFijadaExt(ctx));
    return motivo ? { status: 409, code: 'RC_NO_COINCIDE', error: motivo } : null;
}

//: Topes por CUENTA (en memoria: un reinicio los vacía, y es aceptable — son un
//: freno, no una factura). `serie`: una sola a la vez por cuenta (Catastro).
const HORA_MS = 60 * 60 * 1000;
const LIMITES_EXT = {
    geometria:     { max: 20, ventanaMs: HORA_MS,      serie: true, que: 'mediciones del edificio', plazo: 'una hora' },
    croquis:       { max: 20, ventanaMs: HORA_MS,      serie: true, que: 'croquis', plazo: 'una hora' },
    imagenes:      { max: 30, ventanaMs: HORA_MS,      que: 'consultas de las imágenes del Catastro', plazo: 'una hora' },
    cartografia:   { max: 60, ventanaMs: HORA_MS,      que: 'mapas del Catastro', plazo: 'una hora' },
    croquis_movil: { max: 20, ventanaMs: HORA_MS,      que: 'enlaces para el móvil', plazo: 'una hora' },
    cex:           { max: 10, ventanaMs: HORA_MS,      que: 'certificados generados', plazo: 'una hora' },
    fotos_leer:    { max: 30, ventanaMs: 24 * HORA_MS, que: 'lecturas de fotos', plazo: 'un día' },
    asistente:     { max: 60, ventanaMs: HORA_MS,      que: 'correcciones con el asistente', plazo: 'una hora' },
    asistente_voz: { max: 40, ventanaMs: HORA_MS,      que: 'audios al asistente', plazo: 'una hora' },
};
const usosExt = new Map();       // `${tipo}|${cuentaId}` → [instantes]
const enCursoExt = new Set();    // `${tipo}|${cuentaId}` con una petición en marcha

/**
 * Cuenta un uso de `tipo` para la cuenta, o dice por qué no. Puro salvo el mapa.
 * @returns {{ ok: true } | { ok: false, esperaS: number, error: string }}
 */
function tomarTurnoExt(tipo, cuentaId, ahora = Date.now()) {
    const lim = LIMITES_EXT[tipo];
    if (!lim) throw new Error(`Tope desconocido: ${tipo}`);
    const k = `${tipo}|${cuentaId}`;
    const vivos = (usosExt.get(k) || []).filter(t => ahora - t < lim.ventanaMs);
    if (vivos.length >= lim.max) {
        usosExt.set(k, vivos);
        const esperaS = Math.max(1, Math.ceil((vivos[0] + lim.ventanaMs - ahora) / 1000));
        const min = Math.ceil(esperaS / 60);
        return {
            ok: false, esperaS,
            error: `Has llegado al máximo de ${lim.max} ${lim.que} en ${lim.plazo}. Es un freno para no `
                 + `saturar al Catastro: vuelve a intentarlo en ${min > 1 ? `${min} minutos` : 'un minuto'}. `
                 + 'Si lo necesitas antes, escríbenos.',
        };
    }
    vivos.push(ahora);
    usosExt.set(k, vivos);
    return { ok: true };
}

/**
 * Middleware: el tope de `tipo` para un CERTIFICADOR DE LA APP (`req.certapp`,
 * que pone `internoOExtSuyo`) en `origen=ext`. Al equipo interno y a los demás
 * orígenes no les toca. Fuera de tope: 429 `DEMASIADAS`.
 */
function limiteExt(tipo) {
    const lim = LIMITES_EXT[tipo];
    if (!lim) throw new Error(`Tope desconocido: ${tipo}`);
    return (req, res, next) => {
        const cuentaId = req.certapp?.cuenta?.id;
        let origen;
        try { origen = origenDe(req); } catch { return next(); }   // el 400 ya lo dio el guardián
        if (origen !== 'ext' || !cuentaId) return next();
        const k = `${tipo}|${cuentaId}`;
        if (lim.serie && enCursoExt.has(k)) {
            return res.status(429).set('Retry-After', '30').json({
                code: 'DEMASIADAS', reintentar_en_s: 30,
                error: 'Ya hay una medición en marcha en tu cuenta: espera a que termine (tarda hasta tres '
                     + 'minutos) antes de pedir otra.',
            });
        }
        const turno = tomarTurnoExt(tipo, cuentaId);
        if (!turno.ok) {
            return res.status(429).set('Retry-After', String(turno.esperaS))
                .json({ code: 'DEMASIADAS', reintentar_en_s: turno.esperaS, error: turno.error });
        }
        if (lim.serie) {
            enCursoExt.add(k);
            let suelto = false;
            const soltar = () => { if (!suelto) { suelto = true; enCursoExt.delete(k); } };
            res.on('finish', soltar);
            res.on('close', soltar);
        }
        return next();
    };
}

// La envolvente de una parcela tarda: son varias peticiones a Catastro EN
// SERIE —nunca en ráfaga, porque al otro lado está el mismo WAF del que
// depende el buscador— más el análisis geométrico.
const ESPERA_ENVOLVENTE_MS = 180_000;
const ESPERA_CEX_MS = 120_000;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

/**
 * Lo mismo pero SUBIENDO un `.cex`: es como viaja el CEE final, que se hace
 * sobre el inicial en vez de levantarse de cero. El fichero va en multipart y
 * la ficha como JSON en un campo, porque el motor no puede recibir megas de
 * pickle dentro de un JSON.
 */
async function alMotorConFichero(ruta, fichero, ficha, ms) {
    const fd = new FormData();
    fd.append('fichero', new Blob([fichero]), 'base.cex');
    fd.append('datos', JSON.stringify(ficha));
    try {
        return await fetch(`${MOTOR}${ruta}`, {
            method: 'POST', body: fd, signal: AbortSignal.timeout(ms),
        });
    } catch (e) {
        const err = new Error(
            e.name === 'TimeoutError'
                ? 'El motor de envolvente ha tardado demasiado.'
                : 'El motor de envolvente no responde. ¿Está levantado el contenedor cee-engine?');
        err.status = 503;
        throw err;
    }
}

/** Llama al motor y traduce sus fallos a algo que el front pueda enseñar. */
async function alMotor(ruta, cuerpo, ms) {
    const corte = AbortSignal.timeout(ms);
    let r;
    try {
        r = await fetch(`${MOTOR}${ruta}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
            signal: corte,
        });
    } catch (e) {
        // El motor caído no es un 500 nuestro: es que falta un servicio. Se
        // distingue para que en el VPS se sepa qué mirar.
        const err = new Error(
            e.name === 'TimeoutError'
                ? 'El motor de envolvente ha tardado demasiado.'
                : 'El motor de envolvente no responde. ¿Está levantado el contenedor cee-engine?');
        err.status = 503;
        throw err;
    }
    return r;
}

/**
 * POST /api/cee-envolvente/diagnostico
 *
 * Qué ha fallado en la ventana del certificador y desde qué máquina. No escribe
 * en base de datos: es una línea en el log, que es donde se mira cuando alguien
 * dice «no me funciona».
 *
 * REGLA — se declara ANTES que `/:expedienteId/...` o Express tomaría
 * «diagnostico» por un id de expediente (mismo gotcha que `/fin-obra` en las
 * subidas públicas y `/parte/global` en las acciones).
 *
 * REGLA — aquí NO entra nada del expediente ni del cliente: la ruta, el código
 * del fallo y el navegador. Mismo criterio que `/api/afirma-diagnostico`.
 */
router.post('/diagnostico', internalOnly, express.json({ limit: '8kb' }), (req, res) => {
    const b = req.body || {};
    const texto = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').slice(0, n);
    console.warn('[ceeEnvolvente] fallo en la ventana', JSON.stringify({
        haciendo: texto(b.haciendo, 60),
        ruta: texto(b.ruta, 120),
        status: Number.isFinite(Number(b.status)) ? Number(b.status) : null,
        codigo: texto(b.codigo, 40),
        repetido: !!b.repetido,
        // Puesto = el fallo es NUESTRO (la petición ni salió del navegador). Es
        // lo que distingue «mirar el código» de «mirar la red».
        nuestro: b.nuestro ? texto(b.nuestro, 200) : null,
        mensaje: texto(b.mensaje, 200),
        navegador: texto(b.navegador, 200),
        ip: texto(req.headers['x-forwarded-for'] || req.ip, 60),
    }));
    res.status(204).end();
});

/**
 * GET /api/cee-envolvente/:id/oportunidad
 *
 * Lo que la ventana necesita para abrir la envolvente de una OPORTUNIDAD (`:id`
 * es su `id_oportunidad` o su uuid): la fila —proyectada, sin el HTML de las
 * propuestas—, su cliente y, si ya se aceptó, el expediente al que la ventana
 * tiene que saltar. Solo el equipo interno.
 */
router.get('/:expedienteId/oportunidad', staffOnly, async (req, res) => {
    try {
        const d = await cex.datosOportunidad(req.params.expedienteId);
        if (!d) return res.status(404).json({ error: 'Esa oportunidad no existe.' });
        res.json(d);
    } catch (e) {
        console.error('[ceeEnvolvente] oportunidad:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/** El contorno de la vivienda tal y como puede viajar al motor, o `null`. */
function recorteSaneado(r) {
    const pts = Array.isArray(r?.poligono) ? r.poligono : null;
    if (!pts || pts.length < 3 || pts.length > 100) return null;
    const limpio = pts.map(p => (Array.isArray(p) && p.length >= 2
        ? [Number(p[0]), Number(p[1])] : null));
    if (limpio.some(p => !p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
    return { poligono: limpio };
}

/**
 * Las ZONAS que no cuentan en UNA planta (el garaje dentro de la casa, con la
 * vivienda encima), tal y como pueden viajar al motor. Vértices en el CRS
 * métrico, como el contorno de la vivienda; lo que no sean pares de números, o
 * un nivel que no sea un entero, no viaja. GARAJE, ALMACEN y el genérico solo
 * ponen nombre (en CE3X se escriben igual); PORCHE es un porche ABIERTO, que el
 * motor trata como exterior.
 */
const USOS_ZONA = ['GARAJE', 'ALMACEN', 'ESPACIO NO HABITABLE', 'PORCHE'];
function zonasSaneadas(zs) {
    if (!Array.isArray(zs)) return [];
    return zs.slice(0, 20).map((z) => {
        const r = recorteSaneado(z);
        const nivel = Number(z?.nivel);
        if (!r || !Number.isInteger(nivel)) return null;
        const uso = String(z?.uso || '').toUpperCase();
        return { nivel, poligono: r.poligono, uso: USOS_ZONA.includes(uso) ? uso : null };
    }).filter(Boolean);
}

/**
 * El CROQUIS a mano alzada de lo que no es vivienda (ver `gis/croquis.py` en el
 * motor): manchas por planta que el motor endereza y ajusta a los m² de
 * Catastro. Vértices en EPSG:25830 (`poligono`, lo que dibuja la ventana) o en
 * fracciones de la huella (`uv`, de oeste a este y de sur a norte: lo que
 * escribe la skill). Lo demás no viaja.
 */
function croquisSaneado(cs) {
    if (!Array.isArray(cs)) return null;
    const out = cs.slice(0, 20).map((c) => {
        const nivel = Number(c?.nivel);
        if (!Number.isInteger(nivel)) return null;
        const uso = String(c?.uso || '').toUpperCase();
        const base = { nivel, uso: USOS_ZONA.includes(uso) ? uso : null };
        if (Array.isArray(c?.uv) && c.uv.length >= 3 && c.uv.length <= 100) {
            const uv = c.uv.map(p => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : null));
            if (uv.every(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return { ...base, uv };
            return null;
        }
        // Un croquis es a mano alzada: admite más vértices que un contorno
        // pulsado vértice a vértice (el navegador ya lo simplifica, pero un
        // trazo largo del dedo sigue pasando de 100).
        const pts = Array.isArray(c?.poligono) ? c.poligono : null;
        if (!pts || pts.length < 3 || pts.length > 400) return null;
        const limpio = pts.map(p => (Array.isArray(p) && p.length >= 2
            ? [Number(p[0]), Number(p[1])] : null));
        if (limpio.some(p => !p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
        return { ...base, poligono: limpio };
    }).filter(Boolean);
    return out.length ? out : null;
}

/**
 * POST /api/cee-envolvente/:expedienteId/geometria
 * Body: { referencia_catastral, altura_planta?, cuerpos_excluidos?, recorte_vivienda?, zonas_fuera? }
 *
 * De la RC a la envolvente medida y clasificada, más el plan de fotos.
 * La RC sale del expediente si no viene en el cuerpo: cada consulta a Catastro
 * cuesta, y no se pregunta dos veces lo mismo.
 */
/**
 * La GEOMETRÍA del motor con lo mismo que la pediría la ventana. Es una función
 * y no solo la ruta porque el CROQUIS la necesita también (`/croquis`, y tras
 * generar el .cex): dos caminos que midieran distinto dibujarían otra casa.
 * Devuelve `{ status, datos }` con la respuesta del motor tal cual.
 */
async function pedirGeometria(expedienteId, origen, body = {}, { ctx: ctxDado = undefined } = {}) {
    // REGLA (origen `ext`) — la RC de la obra de un certificador externo sale
    // SIEMPRE de la BD (`certapp_obras.ref_catastral`, también la de 20
    // caracteres de la vivienda); lo que mande el navegador se IGNORA. La obra
    // se paga por edificio: con la RC del cuerpo se mediría otro, y con `/cex`
    // se sacaría su certificado gratis, tantas veces como se quisiera.
    let ctx = ctxDado;
    let rc;
    if (origen === 'ext') {
        if (ctx === undefined) ctx = await cex.cargarExpediente(expedienteId, origen);
        if (!ctx) return { status: 404, datos: { detail: 'Obra no encontrada.' } };
        rc = rcFijadaExt(ctx);
    } else {
        rc = (body?.referencia_catastral || '').trim();
    }
    if (!rc) return { status: 400, datos: { detail: 'Falta la referencia catastral.' } };

    // Qué plantas cuentan lo marcó una persona en la ficha técnica de la
    // oportunidad; sin selección guardada, el motor sigue con el uso de
    // Catastro. Se lee AQUÍ y no se acepta del navegador: de esto depende
    // la superficie que acaba en el certificado.
    const construcciones = await cex.construccionesElegidas(
        expedienteId, origen);

    // Las PISTAS para proponer el croquis: las fachadas en cuya foto hay una
    // puerta de garaje. Un fallo aquí solo quita la pista, nunca la medición.
    let pistasCroquis = null;
    try {
        if (ctx === undefined) ctx = await cex.cargarExpediente(expedienteId, origen);
        if (ctx) pistasCroquis = fotos.pistasCroquis(ctx.expediente);
    } catch (e) { console.warn('[ceeEnvolvente] pistas del croquis:', e.message); }

    // La ALTURA DE PLANTA con la que se miden las fachadas. Si el navegador
    // no la manda, la que el trabajo declara en la ficha
    // (`ajustes.altura_libre_planta`): medir con 2,80 y declarar otra deja un
    // .cex cuyas superficies no cuadran con su propia altura.
    let trabajo = null;
    try { trabajo = await cex.leerTrabajo(expedienteId, origen); }
    catch (e) { console.warn('[ceeEnvolvente] trabajo:', e.message); }
    let altura = Number(body?.altura_planta) > 0 ? Number(body.altura_planta) : null;
    if (!altura) {
        const a = Number(trabajo?.ajustes?.altura_libre_planta);
        if (a >= 2 && a <= 6) altura = a;
    }
    // El SEMISÓTANO y las unidades de OTRA parcela: los declara el
    // certificador en su trabajo y se leen AQUÍ, no del navegador.
    const { semisotano, anexos: anexosDeclarados, volumenes } = cex.declaracionesEdificio(trabajo?.ajustes);
    // Las unidades de OTRA parcela son otras RC que el motor pide a Catastro: en
    // una obra `ext` (lo pagado es UN edificio, el de su RC) no se miden.
    const anexos = origen === 'ext' ? [] : anexosDeclarados;
    if (origen === 'ext' && anexosDeclarados.length) {
        console.warn(`[ceeEnvolvente] obra ext ${expedienteId}: ${anexosDeclarados.length} unidad(es) de otra `
                     + 'parcela declaradas y NO medidas (la obra es de una sola RC).');
    }

    const r = await alMotor('/envolvente', {
        referencia_catastral: rc,
        altura_planta: altura,
        offline: body?.offline === true,
        construcciones,
        ...(semisotano ? { semisotano } : {}),
        ...(anexos.length ? { anexos } : {}),
        ...(volumenes.length ? { volumenes } : {}),
        // Los CUERPOS del edificio que el certificador deja fuera (el
        // aparcamiento adosado, el porche). Vienen del navegador como el
        // resto de lo que señala en el plano —las paredes apartadas, los
        // huecos— y se guardan con su trabajo; las CONSTRUCCIONES, en
        // cambio, se leen aquí porque son de la oportunidad.
        cuerpos_excluidos: Array.isArray(body?.cuerpos_excluidos)
            ? body.cuerpos_excluidos.filter(x => typeof x === 'string').slice(0, 50)
            : null,
        // El CONTORNO de la vivienda cuando la parcela es una comunidad de
        // adosados: Catastro no dibuja dónde acaba cada casa, así que lo
        // dibuja el certificador. Vértices en el CRS métrico (EPSG:25830);
        // lo que no sean pares de números no viaja.
        recorte_vivienda: recorteSaneado(body?.recorte_vivienda),
        // Lo que NO es vivienda dentro de una planta —el garaje dentro de la
        // casa de dos plantas—, dibujado por el certificador. Al contrario
        // que el contorno (un prisma para todas las plantas), se resta SOLO
        // de su nivel: la vivienda de encima sigue entera.
        zonas_fuera: zonasSaneadas(body?.zonas_fuera),
        // El CROQUIS a mano alzada: el motor lo ajusta a los m² de Catastro,
        // lo mide como zonas más y devuelve los polígonos (`croquis_ajustado`)
        // para que se guarden como zonas. `croquis_ajustar: false` = tal cual.
        croquis: croquisSaneado(body?.croquis),
        croquis_ajustar: body?.croquis_ajustar !== false,
        // Para la PROPUESTA de croquis (el motor la calcula y la ofrece).
        pistas_croquis: pistasCroquis,
        // El CROQUIS CATASTRAL POR PLANTAS de la Sede del Catastro: con él la
        // propuesta deja de ser una conjetura (son los recintos de Catastro,
        // con su uso) y cada cuerpo sabe qué tiene dentro, planta a planta.
        // Son otras 3 peticiones a la Sede —www1.sedecatastro.gob.es, no el
        // `ovc` del buscador— y el motor las cachea 30 días por parcela (y un
        // fallo, 6 h). `CEE_SEDE_CATASTRO=false` lo apaga.
        sede_catastro: process.env.CEE_SEDE_CATASTRO !== 'false',
        // El PROGRAMA de CE3X (residencial / pequeño / gran terciario). De
        // él cuelga QUÉ SE MIDE: en un terciario cuentan también los usos
        // del terciario que Catastro no da por habitables (un hotel es
        // «HOTELERO», una parroquia «RELIGIOSO»). Solo los tres valores de
        // CE3X; cualquier otra cosa se mide como siempre.
        tipo_edificio_ce3x: ['residencial', 'pequeno_terciario', 'gran_terciario']
            .includes(body?.tipo_edificio_ce3x) ? body.tipo_edificio_ce3x : null,
    }, ESPERA_ENVOLVENTE_MS);

    return { status: r.status, datos: await r.json() };
}

router.post('/:expedienteId/geometria', internoOExtSuyo, staffSiOportunidad, limiteExt('geometria'), async (req, res) => {
    try {
        const { status, datos } = await pedirGeometria(req.params.expedienteId, origenDe(req), req.body || {});
        if (status === 400 && datos?.detail === 'Falta la referencia catastral.') {
            return res.status(400).json({ error: datos.detail });
        }
        if (status === 404) return res.status(404).json({ error: datos.detail, code: 'OBRA_NO_ENCONTRADA' });
        if (status < 200 || status >= 300) {
            // 502 del motor = ha fallado Catastro, no nosotros. Se deja pasar
            // tal cual para que el front no invite a reintentar contra el WAF.
            return res.status(status === 502 ? 502 : 400)
                .json({ error: datos?.detail || 'No se pudo construir la envolvente.' });
        }
        res.json(datos);
    } catch (e) {
        console.error('[ceeEnvolvente] geometria:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * El CROQUIS en PDF de lo que hay en la envolvente: un plano por planta con las
 * medidas y los huecos, las tablas de lo que hay DENTRO del .cex y lo POR
 * CONFIRMAR en ámbar. Se compone con el TRABAJO GUARDADO (el de la ventana o el
 * de la skill) y la geometría medida con lo mismo que lo mediría la ventana, y
 * se deja junto al .cex (`… - CEE INICIAL_CROQUIS.pdf`). Cero tokens: es código.
 */
async function croquisDesdeTrabajo(expedienteId, origen, { fase = 'inicial', avisos = null, autor = null } = {}) {
    const croq = require('../services/cee/croquisCee');
    const ctx = await cex.cargarExpediente(expedienteId, origen);
    if (!ctx) return { ok: false, status: 404, error: 'Expediente no encontrado.' };
    // El croquis es un ENTREGABLE (plano de obra con la marca): en una obra
    // `ext`, como el `.cex`, solo con la obra ya pedida.
    if (origen === 'ext') {
        const corte = obraSinPedir(ctx.expediente);
        if (corte) return { ok: false, ...corte };
    }
    if (!ctx.driveFolderId) return { ok: false, status: 409, error: 'No tiene carpeta de Drive: no hay dónde dejar el croquis.' };
    const t = await cex.leerTrabajo(expedienteId, origen);
    if (!t) return { ok: false, status: 409, error: 'Todavía no hay nada señalado en la envolvente.' };
    const { status, datos: geo } = await pedirGeometria(expedienteId, origen, {
        referencia_catastral: ctx.expediente?.instalacion?.ref_catastral || '',
        cuerpos_excluidos: t.cuerpos_fuera || null,
        recorte_vivienda: t.recorte_vivienda || null,
        zonas_fuera: t.zonas_fuera || null,
        altura_planta: t.ajustes?.altura_libre_planta || null,
        tipo_edificio_ce3x: t.ajustes?.tipo_ce3x || null,
    }, { ctx });
    if (status < 200 || status >= 300) {
        return { ok: false, status: status === 502 ? 502 : 400,
                 error: `No se ha podido medir el edificio: ${geo?.detail || status}` };
    }
    const r = await croq.croquisDeExpediente(ctx, { geo, trabajo: t, fase, avisos, autor });
    return r.ok ? r : { ...r, status: 502 };
}

router.post('/:expedienteId/croquis', internoOExtSuyo, staffSiOportunidad, limiteExt('croquis'), async (req, res) => {
    try {
        const fase = req.body?.fase === 'final' ? 'final' : 'inicial';
        const r = await croquisDesdeTrabajo(req.params.expedienteId, origenDe(req),
            { fase, autor: req.user?.nombre || req.user?.email || null });
        if (!r.ok) return res.status(r.status || 500).json({ error: r.error, ...(r.code ? { code: r.code } : {}) });
        res.json(r);
    } catch (e) {
        console.error('[ceeEnvolvente] croquis:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET|PUT /api/cee-envolvente/:expedienteId/trabajo
 *
 * Lo que el certificador ha señalado en el plano: la entrada, los huecos de
 * cada pared y las que ha reclasificado. Vivía solo en el `localStorage` del
 * navegador —sobrevive a recargar, pero no a cambiar de ordenador ni a que lo
 * siga otra persona— y aquí hay trabajo de verdad: las ventanas se ponen una a
 * una.
 */
router.get('/:expedienteId/trabajo', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        res.json({ trabajo: await cex.leerTrabajo(req.params.expedienteId, origenDe(req)) });
    } catch (e) {
        console.error('[ceeEnvolvente] leer trabajo:', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.put('/:expedienteId/trabajo', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const t = req.body?.trabajo;
        if (!t || typeof t !== 'object') {
            return res.status(400).json({ error: 'Falta `trabajo`.' });
        }
        await cex.guardarTrabajo(req.params.expedienteId, t, origenDe(req));
        res.json({ ok: true, guardado_at: new Date().toISOString() });
    } catch (e) {
        console.error('[ceeEnvolvente] guardar trabajo:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/cee-envolvente/:expedienteId/revision
 * Body: { fase, nota?, cambios: [{ at, texto }], avisar_claude? }
 *
 * «✓ Así es como está»: quien conoce la vivienda da el plano por bueno —tras
 * corregirlo en la PIZARRA, o tal cual— y, si quiere, le pide a Claude que
 * rehaga el CEE sobre él. El trabajo ya lo ha guardado la ventana justo antes;
 * aquí se sella la revisión, se anota y se avisa (ver `services/cee/revisionPlano.js`).
 *
 * Pedírselo a Claude es del EQUIPO INTERNO: el asistente es el de Fran, y un
 * certificador de fuera no le encarga trabajo.
 */
router.get('/:expedienteId/revision', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const revision = await require('../services/cee/revisionPlano')
            .leer({ clave: req.params.expedienteId, origen: origenDe(req) });
        res.json({ revision });
    } catch (e) {
        console.error('[ceeEnvolvente] leer revisión del plano:', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.post('/:expedienteId/revision', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const b = req.body || {};
        const u = req.user;
        const perfil = u?.perfilCompleto || {};
        const nombre = [perfil.nombre, perfil.apellidos].filter(Boolean).join(' ').trim();
        const por = u?.esRobot ? 'CLAUDE'
            : (nombre || u?.acronimo || u?.razon_social
               || (u?.rol_nombre === 'ADMIN' ? 'ADMINISTRADOR' : 'Equipo'));
        const r = await require('../services/cee/revisionPlano').registrar({
            clave: req.params.expedienteId, origen: origenDe(req),
            fase: b.fase, nota: b.nota, cambios: b.cambios, por,
            avisarClaude: !!b.avisar_claude && isStaff(req),
        });
        res.json(r);
    } catch (e) {
        console.error('[ceeEnvolvente] revisión del plano:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * POST /api/cee-envolvente/:expedienteId/ficha
 * Body: { geometria, ajustes? }
 *
 * Lo que se va a escribir en el .cex, SIN escribir nada. Cada valor lleva de
 * dónde sale, y eso es lo que el certificador revisa antes de generar: aquí se
 * ve si una transmitancia o un año no son los que él daría por buenos.
 */
router.post('/:expedienteId/ficha', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const { geometria } = req.body || {};
        if (!geometria) return res.status(400).json({ error: 'Falta `geometria`.' });
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });

        const fase = req.body?.fase || 'inicial';
        const { ficha, catalogo, faltan, avisos, fuente, equipos, aires,
                versionCe3x, huella } = await cex.componerFicha(ctx, {
            geometria, envolvente: req.body?.envolvente, ajustes: req.body?.ajustes,
            medidas: req.body?.medidas, fase,
        });
        // `medidas` es el CATÁLOGO de mejoras que se pueden proponer, con su
        // motivo cuando no procede: es lo que pinta la pestaña de Medidas para
        // que el certificador elija, y no viaja dentro del `.cex`.
        // `fuente` son las COLUMNAS en crudo del cliente y del técnico: es lo
        // que edita el formulario de administrativos, porque sobre el valor
        // compuesto de la ficha no se puede escribir.
        // ires: los que dijo tener el cliente al aceptar, para el bloque de
        // Instalaciones que los declara de un clic.
        // `huella`: la de la receta que se está viendo. Si no es la del SELLO
        // del `.cex` de Drive, el fichero está DESFASADO (lo dice la ventana).
        res.json({ ficha, avisos, fase, medidas: catalogo, faltan, fuente, equipos, aires,
                   version_ce3x: versionCe3x, huella,
                   nombre: cex.nombreDelCex(ctx.expediente, fase) });
    } catch (e) {
        console.error('[ceeEnvolvente] ficha:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * GET /api/cee-envolvente/:expedienteId/estado-cex?fase=inicial
 *
 * Qué lleva el `.cex` de Drive de esa fase (su SELLO: medidas, quién, cuándo,
 * calificación, si está por calificar en el PC) y si se ha TOCADO a mano desde
 * que se selló. Una consulta a Drive: la ventana la pide al abrir y al generar.
 */
router.get('/:expedienteId/estado-cex', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });
        const fase = req.query?.fase === 'final' ? 'final' : 'inicial';
        // En una obra de la app, también su visto bueno (certapp/vistoBueno.js).
        // Quién del equipo lo dio, solo al equipo (como `porDetalle` en los eventos).
        let vistoBueno = {};
        if (origenDe(req) === 'ext' && fase === 'inicial') {
            const vb = await require('../services/certapp/vistoBueno').estado(ctx.expediente.id);
            if (vb && !isStaff(req)) delete vb.por;
            vistoBueno = { visto_bueno: vb };
        }
        res.json({ fase, ...(await cex.estadoDelCex(ctx, fase)), ...vistoBueno });
    } catch (e) {
        console.error('[ceeEnvolvente] estado del .cex:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * POST /api/cee-envolvente/:expedienteId/visto-bueno?origen=ext
 * Body: { huella }   la receta de lo que se ve en la ventana
 *
 * El visto bueno de BROKERGY a la obra de un certificador de la app: calificado,
 * se le entrega «listo para firmar»; por calificar, se entrega solo cuando el PC
 * lo califique. Solo el EQUIPO (un certificador de la app no se lo da a sí
 * mismo) y solo en `ext` (en el CRM es «Validar»). certapp/vistoBueno.js
 */
router.post('/:expedienteId/visto-bueno', internoOExtSuyo, async (req, res) => {
    try {
        if (origenDe(req) !== 'ext') {
            return res.status(400).json({ error: 'Esto es de las obras de la app de certificadores; en el CRM, «Validar».',
                                          code: 'SOLO_EXT' });
        }
        if (!isStaff(req)) {
            return res.status(403).json({ error: 'El visto bueno lo da BROKERGY.', code: 'SOLO_EQUIPO' });
        }
        const r = await require('../services/certapp/vistoBueno').dar(req.params.expedienteId, {
            quien: req.user?.nombre || req.user?.email || null,
            huella: typeof req.body?.huella === 'string' ? req.body.huella.slice(0, 64) : null,
        });
        res.json(r);
    } catch (e) {
        if (!e.status || e.status >= 500) console.error('[ceeEnvolvente] visto bueno:', e.message);
        res.status(e.status || 500).json({ error: e.message, code: e.code || null });
    }
});

/**
 * POST /api/cee-envolvente/:expedienteId/imagenes
 * Body: { geometria? }
 *
 * La foto de fachada y el croquis de parcela que van DENTRO del `.cex`, para
 * poder verlas antes de generar — es lo que CE3X enseña en Datos generales.
 *
 * Ruta aparte y no un campo de `/ficha` a propósito: la ficha se vuelve a pedir
 * con cada tecla que se toca, y esto son dos consultas a Catastro. Aquí se piden
 * cuando alguien las pide, y el helper las cachea por referencia catastral, así
 * que mirarlas no cuesta una petición más al generar después.
 */
router.post('/:expedienteId/imagenes', internoOExtSuyo, staffSiOportunidad, limiteExt('imagenes'), async (req, res) => {
    try {
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });
        const img = await cex.imagenesDelCex(ctx, req.body?.geometria);
        // Esta ruta es para MIRAR: va la versión ligera de la fachada (la misma
        // foto en 640×480). Al `.cex` lo escribe `componerFicha`, que coge la
        // grande de esta misma función — la imagen es la misma, cambia el peso.
        res.json({ foto_edificio: img.foto_edificio_vista || img.foto_edificio || null,
                   plano_situacion: img.plano_situacion || null,
                   sustituidas: img.sustituidas || {},
                   avisos: img.avisos || [] });
    } catch (e) {
        console.error('[ceeEnvolvente] imagenes:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * POST /api/cee-envolvente/:expedienteId/cartografia
 * Body: { georef }   — el que devuelve `/geometria`
 *
 * La cartografía del Catastro para poner DEBAJO del plano. Se pide el MISMO
 * rectángulo en el que el motor dibujó, así que encaja píxel a píxel. Se cachea
 * por rectángulo: encender y apagar el fondo no puede ser una petición cada vez
 * al WMS del que depende el buscador de la app.
 */
router.post('/:expedienteId/cartografia', internoOExtSuyo, staffSiOportunidad, limiteExt('cartografia'), async (req, res) => {
    try {
        res.json(await cex.cartografia(req.body?.georef));
    } catch (e) {
        console.error('[ceeEnvolvente] cartografia:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ─── El CROQUIS pintado desde el MÓVIL ───────────────────────────────────────
// Ver `services/croquisMovil.js`. Estas son las rutas del ORDENADOR (con sesión);
// las del teléfono son públicas por token y viven en `routes/public.js`. La
// sesión queda atada a ESTE expediente: con el token de otro no se lee nada.
const croquisMovil = require('../services/croquisMovil');

/**
 * POST /api/cee-envolvente/:expedienteId/croquis-movil
 * Body: { planta, muros, lienzo, zonas, catastro, trazos, georef, recorte, modo }
 *
 * `recorte` es el contorno de la vivienda ya aplicado (en el lienzo) y `modo`, la
 * pestaña en la que se abre el teléfono ('vivienda' al delimitar un adosado).
 *
 * Abre el enlace y dibuja su QR. La CARTOGRAFÍA la pone el backend con el mismo
 * helper cacheado del plano (cero peticiones de más si ya se veía en pantalla):
 * pintar dónde está el garaje sin ver la parcela es pintar a ciegas.
 */
router.post('/:expedienteId/croquis-movil', internoOExtSuyo, staffSiOportunidad, limiteExt('croquis_movil'), async (req, res) => {
    try {
        let cartografia = null;
        if (req.body?.georef) {
            const c = await cex.cartografia(req.body.georef).catch(() => null);
            if (c?.imagen && req.body.georef.en_el_lienzo) {
                cartografia = { imagen: c.imagen, tipo: c.tipo, en_el_lienzo: req.body.georef.en_el_lienzo };
            }
        }
        const enlace = croquisMovil.abrir({
            ...(req.body || {}),
            cartografia,
            expediente: req.params.expedienteId,
            // De qué negocio es: las FOTOS que se hagan desde el teléfono se
            // escriben en la tabla que toque.
            negocio: origenDe(req),
            origen: req.get('origin') || req.get('referer'),
            // «Así es como está» desde el teléfono solo pone a Claude a trabajar
            // si quien abrió el croquis es del equipo interno.
            puedeClaude: isStaff(req),
        });
        const QRCode = require('qrcode');
        const pintar = (u) => QRCode.toDataURL(u, { margin: 1, width: 460 });
        enlace.qr = await pintar(enlace.url);
        enlace.qrAlternativas = await Promise.all(enlace.alternativas.map(pintar));
        enlace.conCartografia = !!cartografia;
        res.json(enlace);
    } catch (e) {
        res.status(e.status || 503).json({ error: e.message });
    }
});

/**
 * GET /api/cee-envolvente/:expedienteId/croquis-movil/:token/esperar?v=N
 *
 * Petición LARGA: contesta en cuanto el teléfono manda algo más nuevo que la
 * versión `v`, o a los 20 s con lo que haya. Es lo que hace que el croquis se
 * vea AQUÍ según se pinta allí, sin la cadencia a saltos de una encuesta.
 */
router.get('/:expedienteId/croquis-movil/:token/esperar', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    let soltar = null;
    req.on('close', () => soltar?.());
    const datos = await croquisMovil.esperar(req.params.token, req.params.expedienteId,
                                             req.query.v, (fn) => { soltar = fn; });
    if (!res.writableEnded && !res.destroyed) res.json(datos);
});

/** POST …/croquis-movil/:token/resultado — cómo ha ido el ajuste que pidió el teléfono. */
router.post('/:expedienteId/croquis-movil/:token/resultado', internoOExtSuyo, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.responder(req.params.token, req.params.expedienteId, req.body || {});
    res.status(ok ? 200 : 410).json({ ok });
});

/**
 * POST …/croquis-movil/:token/resultado-huecos — el ordenador ha puesto (o no)
 * en el plano los huecos que se revisaron en el teléfono.
 */
router.post('/:expedienteId/croquis-movil/:token/resultado-huecos', internoOExtSuyo, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.responderHuecos(req.params.token, req.params.expedienteId, req.body || {});
    res.status(ok ? 200 : 410).json({ ok });
});

/**
 * POST …/croquis-movil/:token/paredes — cómo están las paredes AHORA en el plano
 * del ordenador (huecos, nombre, si admiten ventanas), para que el teléfono lo vea.
 */
router.post('/:expedienteId/croquis-movil/:token/paredes', internoOExtSuyo, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.actualizarParedes(req.params.token, req.params.expedienteId, req.body?.paredes);
    res.status(ok ? 200 : 410).json({ ok });
});

/**
 * POST …/croquis-movil/:token/resultado-contra — el ordenador ha aplicado (o no)
 * lo que se dijo desde el teléfono de una pared (contra qué da).
 */
router.post('/:expedienteId/croquis-movil/:token/resultado-contra', internoOExtSuyo, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.responderContra(req.params.token, req.params.expedienteId, req.body || {});
    res.status(ok ? 200 : 410).json({ ok });
});

/**
 * POST …/croquis-movil/:token/resultado-pizarra — el ordenador ha aplicado (o
 * no) lo dibujado en la pizarra del teléfono.
 */
router.post('/:expedienteId/croquis-movil/:token/resultado-pizarra', internoOExtSuyo, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.responderPizarra(req.params.token, req.params.expedienteId, req.body || {});
    res.status(ok ? 200 : 410).json({ ok });
});

/**
 * POST …/croquis-movil/:token/plano — el ordenador ha vuelto a MEDIR por su
 * cuenta: la planta del teléfono se pone al día (paredes, zonas, contorno), ya
 * en el lienzo del teléfono.
 */
router.post('/:expedienteId/croquis-movil/:token/plano', internoOExtSuyo, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.actualizarPlano(req.params.token, req.params.expedienteId, req.body || {});
    res.status(ok ? 200 : 410).json({ ok });
});

/** DELETE …/croquis-movil/:token — el ordenador cierra; el teléfono lo verá. */
router.delete('/:expedienteId/croquis-movil/:token', internoOExtSuyo, staffSiOportunidad, (req, res) => {
    res.json({ ok: croquisMovil.cerrar(req.params.token, req.params.expedienteId) });
});

/**
 * PUT /api/cee-envolvente/:expedienteId/construcciones
 * Body: { elegidas: ['1/00/01', ...], construcciones: [...] }
 *
 * Cambiar qué construcciones del Catastro cuentan. Se marca al abrir la
 * oportunidad, pero el error se ve con el PLANO delante: escribe en la
 * oportunidad —que es la fuente— y NO toca las cifras con las que se le
 * presupuestó al cliente.
 *
 * Después hay que volver a TRAER la envolvente: el motor mide con esto puesto.
 */
router.put('/:expedienteId/construcciones', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const r = await cex.guardarConstrucciones(
            req.params.expedienteId, req.body?.elegidas, req.body?.construcciones,
            origenDe(req));
        res.json({ ok: true, ...r });
    } catch (e) {
        console.error('[ceeEnvolvente] construcciones:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * PUT /api/cee-envolvente/:expedienteId/cliente
 * Body: { campos: { ... } }
 *
 * Corregir la ficha del TITULAR sin salir de la ventana. Se escribe en
 * `clientes`, que es la fuente: aquí no queda ninguna copia.
 *
 * REGLA — el CERTIFICADOR no toca los datos del cliente. Es el titular del
 * expediente y de sus documentos —el Anexo I, el convenio de cesión y el
 * certificado salen de ahí—, así que se corrige donde se corrige todo lo demás
 * suyo. Al técnico le toca su propio bloque, que es el de abajo.
 */
router.put('/:expedienteId/cliente', staffOnly, staffSiOportunidad, async (req, res) => {
    try {
        const r = await cex.guardarCliente(
            req.params.expedienteId, req.body?.campos, origenDe(req));
        res.json({ ok: true, ...r });
    } catch (e) {
        console.error('[ceeEnvolvente] guardar cliente:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * PUT /api/cee-envolvente/:expedienteId/tecnico
 * Body: { campos: { ... } }
 *
 * Los once campos de «Datos del técnico certificador», que viven en su ficha de
 * Prescriptores. Los corrige el equipo interno o EL PROPIO técnico —son sus
 * datos, y es él quien sabe su nº de colegiado—, nunca un certificador sobre la
 * ficha de otro: se comprueba contra el que está ASIGNADO a este expediente,
 * que es el único cuyo nombre va a salir en este `.cex`.
 */
router.put('/:expedienteId/tecnico', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        // `soloSuyo` a null = sin restricción (equipo interno). Un CERTIFICADOR
        // sin empresa queda en 0, que no casa con ningún id: 403.
        const soloSuyo = isStaff(req) ? null : (req.user?.prescriptor_id || 0);
        const r = await cex.guardarTecnico(
            req.params.expedienteId, req.body?.campos, { soloSuyo, origen: origenDe(req) });
        res.json({ ok: true, ...r });
    } catch (e) {
        console.error('[ceeEnvolvente] guardar tecnico:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * POST|DELETE /api/cee-envolvente/:expedienteId/imagenes/:cual
 *   cual: 'fachada' | 'croquis'
 *
 * Sustituir por otra la imagen que va dentro del `.cex`, o volver a la de
 * Catastro. Catastro no siempre tiene foto, y cuando la tiene puede ser de hace
 * quince años: el certificador ha estado delante del edificio.
 *
 * El fichero va a DRIVE, a la misma carpeta que el `.cex`; en la BD solo queda
 * su id (regla 21).
 */
router.post('/:expedienteId/imagenes/:cual', internoOExtSuyo, staffSiOportunidad, upload.single('file'),
    async (req, res) => {
        try {
            const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
            if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });
            const puesta = await cex.sustituirImagen(ctx, req.params.cual, req.file);
            res.json({ ok: true, imagen: puesta });
        } catch (e) {
            console.error('[ceeEnvolvente] sustituir imagen:', e.message);
            res.status(e.status || 500).json({ error: e.message });
        }
    });

router.delete('/:expedienteId/imagenes/:cual', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });
        await cex.quitarImagen(ctx, req.params.cual);
        res.json({ ok: true });
    } catch (e) {
        console.error('[ceeEnvolvente] quitar imagen:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * POST /api/cee-envolvente/:expedienteId/cex
 * Body: { geometria, envolvente, ajustes?, fase? }   fase: 'inicial' | 'final'
 *
 * Genera el .cex y lo DEJA EN LA CARPETA DEL EXPEDIENTE (`1. CEE/CEE INICIAL`),
 * que es donde el certificador va a buscarlo — la misma carpeta que se le
 * comparte al encargarle el CEE.
 *
 * REGLA — el .cex se guarda SIEMPRE, no se descarga y ya está. Un fichero que
 * solo existe en la carpeta de descargas de quien pulsó el botón no está en el
 * expediente: no lo ve el técnico, no lo ve el que revisa, y a la semana nadie
 * sabe si se llegó a generar.
 *
 * REGLA — la ficha se compone AQUÍ, no llega del navegador. Los datos son del
 * expediente (titular, zona climática, año) y las transmitancias salen de la
 * misma función que estudió la oportunidad. Si el cliente los mandara, un
 * navegador viejo —o cualquiera con la sesión— podría escribir un certificado
 * con las U que quisiera.
 */
router.post('/:expedienteId/cex', internoOExtSuyo, staffSiOportunidad, limiteExt('cex'), async (req, res) => {
    try {
        const { geometria } = req.body || {};
        if (!geometria) return res.status(400).json({ error: 'Falta `geometria`.' });

        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });

        // Obra `ext`: solo PEDIDA (el crédito se consume al pasar de BORRADOR a
        // EN_PREPARACION) y siempre sobre SU referencia catastral. Regenerar al
        // validar sigue valiendo: la obra ya está pedida y la RC es la fijada.
        if (origenDe(req) === 'ext') {
            const corte = cortaCexExt(ctx, geometria);
            if (corte) return res.status(corte.status).json({ error: corte.error, code: corte.code });
        }

        const fase = req.body?.fase || 'inicial';
        const esFinal = fase === 'final';

        // En una OPORTUNIDAD también se escribe (decisión del 2026-09-28). Va a
        // SU carpeta de Drive —que es la del futuro expediente: no se mueve al
        // aceptarla— con el número de la oportunidad, y sin técnico, que aún no
        // lo hay (la ficha lo avisa). Al aceptarla, el expediente encuentra ese
        // inicial para el final (`leerCexDeFase`) y, al regenerarlo, lo archiva
        // en OLD (`guardarEnDrive`).
        //
        // Sin carpeta no hay dónde dejarlo: se dice ANTES de pedirle nada al
        // motor, no después de escribir un fichero que no tiene sitio.
        if (!ctx.driveFolderId) {
            return res.status(409).json({
                error: cex.esOportunidad(ctx.expediente)
                    ? 'Esta oportunidad todavía no tiene carpeta de Drive: guárdala desde la '
                      + 'calculadora para que se cree, y vuelve a generar.'
                    : 'Este expediente no tiene carpeta de Drive: no hay dónde dejar el .cex.',
            });
        }

        // Un CEE contratado de ALCANCE ÚNICO no tiene fase final: su fichero se
        // llama «CEE» a secas y vive en «1. CEE», así que un «final» saldría con
        // el MISMO nombre en la MISMA carpeta y archivaría en OLD el que se
        // acaba de generar. La pantalla ya no ofrece el botón; esto es la red de
        // abajo (un navegador sin refrescar lo seguiría mandando).
        if (esFinal && cex.esCeeDirecto(ctx.expediente)
            && String(ctx.expediente.alcance || 'UNICO').toUpperCase() !== 'DOBLE') {
            return res.status(409).json({
                error: 'Este encargo es de UN solo certificado: no tiene CEE final. '
                     + 'Si la obra lo necesita, amplía el alcance a doble desde su ficha.',
            });
        }

        // El CEE FINAL no se levanta de cero: se COPIA el inicial y se le cambia
        // el generador. Es como se hace a mano, y por dos motivos que no son de
        // comodidad — la envolvente, el técnico y las dos imágenes del Catastro
        // ya son las buenas (no hay que volver a pedirlas al WAF), y si el
        // certificador corrigió algo al abrirlo en CE3X, su corrección se
        // conserva en vez de deshacerse sin decirlo.
        const partida = esFinal ? await cex.leerCexDeFase(ctx, 'inicial') : null;
        if (esFinal && !partida) {
            return res.status(409).json({
                error: `El CEE final se hace sobre el inicial, y ${cex.esOportunidad(ctx.expediente)
                    ? 'esta oportunidad' : 'este expediente'} todavía no tiene ninguno en `
                     + '«1. CEE / CEE INICIAL». Genera primero el inicial.',
            });
        }

        // Con imágenes solo al generar el INICIAL: son peticiones al mismo WAF
        // del que depende el buscador, y el final las hereda del fichero copiado.
        // El `.cex` de Drive se ha TOCADO a mano desde que se selló (se guardó en
        // CE3X, o lo subió otra persona): regenerar se lo lleva a OLD y lo que se
        // cambió allí no vuelve. Se pregunta antes; `forzar` es el «sí».
        if (!req.body?.forzar) {
            const est = await cex.estadoDelCex(ctx, fase).catch(() => ({}));
            if (est.tocado) {
                return res.status(409).json({
                    tocado: true,
                    error: `El «${est.sello?.nombre || cex.nombreDelCex(ctx.expediente, fase)}» de Drive se ha `
                         + 'guardado a mano (en CE3X o subido por otra persona) después de generarlo. Si lo '
                         + 'vuelves a generar, ese irá a OLD y lo que se cambió en CE3X no pasa a la app.',
                });
            }
        }

        const { ficha, avisos: avisosFicha, imagenesFallidas = [], huella } = await cex.componerFicha(ctx, {
            geometria, envolvente: req.body?.envolvente, ajustes: req.body?.ajustes,
            medidas: req.body?.medidas, conImagenes: !esFinal, fase,
        });

        if (esFinal && !(ficha.instalaciones || []).length) {
            // Sin equipo nuevo el final sería el inicial con otro nombre. Lo que
            // falta ya viene dicho en los avisos de la ficha.
            return res.status(422).json({
                error: 'No hay equipo nuevo que escribir: el .cex final sería el inicial.',
                avisos: avisosFicha,
            });
        }

        const r = esFinal
            ? await alMotorConFichero('/cex/instalaciones', partida.bytes, ficha, ESPERA_CEX_MS)
            : await alMotor('/cex', { geometria, datos: ficha }, ESPERA_CEX_MS);
        if (!r.ok) {
            const fallo = await r.json().catch(() => ({}));
            // 422 del motor: NO ha escrito el fichero a propósito porque los
            // datos no daban para escribirlo bien. Es una respuesta, no un error.
            return res.status(r.status === 422 ? 422 : 500)
                .json({ error: fallo?.detail || 'No se pudo generar el .cex.',
                        avisos: avisosFicha });
        }

        let crudo = Buffer.from(await r.arrayBuffer());
        const avisos = [...avisosFicha, ...leerCabecera(r, 'X-Cee-Avisos')];
        // Las MEDIDAS LIBRES de la receta (las que no están en el catálogo de la
        // pestaña): con los MISMOS escritores que la skill.
        const libres = !esFinal ? req.body?.ajustes?.medidas_libres : null;
        if (Array.isArray(libres) && libres.length) {
            const ml = await cex.ponerMedidasLibres(crudo, libres, ficha.envolvente);
            crudo = ml.fichero;
            avisos.push(...ml.avisos);
        }
        if (esFinal) avisos.unshift(`Hecho sobre «${partida.nombre}»: lo único que cambia `
                                    + 'es el generador. Todo lo demás viene de él.');
        const contraste = leerCabecera(r, 'X-Cee-Contraste', {});

        const guardado = await cex.guardarEnDrive(ctx, crudo, fase);
        if (!guardado.ok) {
            // El fichero está escrito pero no ha llegado a su sitio. Se dice: dar
            // por bueno un "generado" que no está en la carpeta es peor que fallar.
            return res.status(502).json({
                error: `El .cex se ha generado pero no se ha podido guardar en Drive: ${guardado.error}`,
                avisos, contraste,
            });
        }
        // El SELLO: qué lleva, con qué receta, y que está POR CALIFICAR en el PC
        // (aquí no hay CE3X: ni XML ni PDF, ni el recorte mes a mes del
        // autoconsumo, y la 2.ª medida va con el consumo de la última vez).
        const conFv2 = (ficha.medidas || []).some(m => m.id === 'aerotermia_fv')
            && (ficha.medidas || []).some(m => m.id === 'aerotermia');
        const sellado = await cex.sellar(ctx, fase, {
            huella, bytes: crudo, driveId: guardado.driveId, nombre: guardado.nombre,
            por: 'ventana', autor: req.user?.nombre || req.user?.email || null,
            medidas: ficha.medidas || [], por_calificar: true,
            motivo: `Generado desde la ventana: sin XML ni PDF${conFv2
                ? ' y con las placas de la 2.ª medida medidas con el consumo de la última vez' : ''}. `
                + 'Lo califica CE3X en el PC (cola «por calificar»).',
        }).catch(e => { avisos.push(`No se ha podido sellar el .cex: ${e.message}`); return null; });
        if (sellado?.visto_bueno_anulado) {
            avisos.push('El visto bueno de BROKERGY que tenía ya no vale: lo generado es otro. Hay que volver a darlo.');
        }
        // Una OBRA de la app de certificadores no espera a que alguien lance la
        // cola: se encarga al PC sola y en silencio (lo mismo que hace
        // agenteIa.terminarExt con lo que deja el agente). Calificada, producción
        // manda el aviso de «listo para revisar» (POST /certapp-admin/interno/calificada).
        if (origenDe(req) === 'ext' && !esFinal) {
            const pc = await require('../services/asistenteCanal')
                .encargarCalificarExt({ numero: ctx.expediente?.numero_expediente, obraId: ctx.expediente?.id });
            avisos.push(pc.ok
                ? 'Ahora se calcula con CE3X (unos minutos): saldrán el XML y el PDF nuevos y os avisamos cuando esté.'
                : `Queda POR CALIFICAR: CE3X sacará su XML y su PDF en el PC (no se ha podido encargar solo: ${pc.motivo}).`);
            if (!pc.ok) console.warn(`[ceeEnvolvente] calificar ${ctx.expediente?.numero_expediente} en el PC:`, pc.motivo);
        } else {
            avisos.push('Queda POR CALIFICAR en el PC: CE3X sacará su XML y su PDF'
                + (conFv2 ? ', volverá a medir las placas de la 2.ª medida' : '')
                + ' y recortará el autoconsumo mes a mes si hace falta.');
        }
        if (guardado.archivados_otros?.length) {
            avisos.unshift(`Se ha archivado en OLD ${guardado.archivados_otros.map(n => `«${n}»`)
                .join(', ')}: es el que se generó cuando era una oportunidad.`);
        }
        // `sin_imagenes`: lo que ha salido SIN foto o croquis porque el
        // Catastro no ha respondido. El popup lo dice en grande y ofrece volver
        // a generar.
        // La VERSIÓN de CE3X con la que ha salido: la dice el motor (es quien
        // escribe la cabecera), y si no la dijera, la que se pidió.
        // El CROQUIS se rehace con el .cex nuevo, en segundo plano: tarda unos
        // segundos (medir + rasterizar) y no puede retrasar ni tumbar el .cex.
        const origenCroquis = origenDe(req);
        setImmediate(() => croquisDesdeTrabajo(req.params.expedienteId, origenCroquis,
            { fase, avisos: [...avisos], autor: req.user?.nombre || req.user?.email || null })
            .then(c => { if (!c.ok) console.warn('[ceeEnvolvente] croquis tras el .cex:', c.error); })
            .catch(e => console.warn('[ceeEnvolvente] croquis tras el .cex:', e.message)));
        // `huella`: la receta sellada (el visto bueno de una obra de la app se da sobre ella).
        res.json({ ...guardado, fase, huella, avisos, contraste, ficha,
                   version_ce3x: r.headers.get('X-Cee-Version') || ficha.version_ce3x || null,
                   sin_imagenes: imagenesFallidas });
    } catch (e) {
        console.error('[ceeEnvolvente] cex:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * POST /api/cee-envolvente/leer
 * Body multipart: file = un .cex
 *
 * Qué hay dentro de un .cex que sube alguien. El motor lo lee SIN
 * deserializarlo: un .cex es un pickle de Python y `pickle.load()` ejecuta el
 * código que traiga dentro.
 */
router.post('/leer', internalOnly, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún fichero.' });

        const form = new FormData();
        form.append('fichero',
            new Blob([req.file.buffer]), req.file.originalname || 'subido.cex');

        const r = await fetch(`${MOTOR}/leer-cex`, {
            method: 'POST', body: form, signal: AbortSignal.timeout(30_000),
        });
        const datos = await r.json();
        if (!r.ok) return res.status(400).json({ error: datos?.detail || 'No se pudo leer el .cex.' });
        res.json(datos);
    } catch (e) {
        console.error('[ceeEnvolvente] leer:', e.message);
        res.status(503).json({ error: 'El motor de envolvente no responde.' });
    }
});

// ─── La FOTO REAL de cada cerramiento ───────────────────────────────────────
//
// El plano dice que FBS3 da a la calle y mide 10,94 m; no dice QUÉ HAY en ella.
// Eso se mira en una foto, y la foto casi siempre ya está en el expediente.
//
// La CLAVE del cerramiento (`FBS3`, o `FBS3/a1b2c3` para uno de sus huecos) va
// en la query y no en la ruta: lleva una barra, y Express partiría el parámetro
// por ella.
//
// ⚠️ El `upload` de arriba admite UN fichero de `.cex`. Aquí se sueltan varias
// fotos de la misma fachada a la vez, así que va su propio multer.

// ─── El ASISTENTE: lo que está mal, dicho con palabras ──────────────────────
//
// POST /api/cee-envolvente/:expedienteId/asistente  { texto, resumen, reintento? }
//
// Devuelve las OPERACIONES que Claude saca de lo dicho; no escribe nada. Las
// aplica la ventana tras el «Sí» (ver `services/asistenteEnvolvente.js`). Lo que
// llega es el RESUMEN que compone la ventana, nunca el trabajo entero: el plano
// de un certificador externo ya lo tiene él delante, así que el guardián de
// siempre basta (su obra, o 404) y el tope es por cuenta, como el de Gemini.
const asistenteEnv = require('../services/asistenteEnvolvente');
router.post('/:expedienteId/asistente', internoOExtSuyo, staffSiOportunidad, limiteExt('asistente'),
    async (req, res) => {
        const { texto, resumen, reintento } = req.body || {};
        const r = await asistenteEnv.interpretar({
            texto, resumen, reintento: reintento || null,
            quien: req.certapp?.email || quienEs(req), obra: req.params.expedienteId,
        });
        if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
        res.json(r);
    });

// POST /api/cee-envolvente/:expedienteId/asistente/voz  (multipart: `audio`)
//
// La RESERVA del micrófono para cuando el navegador no dicta solo (Firefox, la
// app del móvil): se transcribe con la misma llamada que las notas de voz del
// WhatsApp (Gemini, «literalmente») y se devuelve el TEXTO, que se enseña y se
// manda después al asistente como si se hubiera escrito. Claude no oye audio.
const uploadVoz = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
router.post('/:expedienteId/asistente/voz', internoOExtSuyo, staffSiOportunidad, limiteExt('asistente_voz'),
    uploadVoz.single('audio'), async (req, res) => {
        const f = req.file;
        if (!f?.buffer?.length) return res.status(400).json({ error: 'No ha llegado el audio.' });
        const mime = String(f.mimetype || '').split(';')[0];
        if (!/^audio\//.test(mime)) return res.status(400).json({ error: 'Eso no es un audio.' });
        try {
            const { llamarGemini } = require('../services/placaOcrService');
            const r = await llamarGemini([{ buffer: f.buffer, mimeType: mime }], {
                prompt: 'Transcribe literalmente este audio en español. Habla de la envolvente de una vivienda: '
                    + 'paredes como FBE1 o MBN2, ventanas V1, V2…, marcos de PVC, madera o aluminio. '
                    + 'No resumas. Si algo no se entiende, pon [inaudible].',
                schema: { type: 'object', properties: { transcripcion: { type: 'string' } }, required: ['transcripcion'] },
                etiqueta: 'asistente-envolvente-voz', maxTokens: 1024,
            });
            const texto = String(r?.transcripcion || '').trim();
            if (!texto) return res.status(502).json({ error: 'No se ha entendido nada en el audio.' });
            res.json({ texto });
        } catch (e) {
            console.error('[ceeEnvolvente] asistente/voz:', e.message);
            res.status(502).json({ error: `No se ha podido transcribir: ${e.message}` });
        }
    });

const uploadFotos = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024, files: 6 },
});

const fotos = require('../services/paredFotoService');
const paredOcr = require('../services/paredOcrService');

const quienEs = (req) => req.user?.email || req.user?.nombre || null;

/**
 * GET /api/cee-envolvente/:expedienteId/fotos
 *
 * Lo que tiene cada cerramiento —reconciliado con Drive— y las CANDIDATAS: las
 * fotos de fachada, patios y ventanas que el expediente ya tiene. Se ofrecen
 * primero porque volver a pedirle al cliente una foto que mandó en junio es la
 * peor forma de estrenar esto, y además la suya es la buena: es de antes de la
 * obra.
 */
router.get('/:expedienteId/fotos', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });
        const [puestas, cands] = await Promise.all([
            fotos.estado(ctx.expediente),
            fotos.candidatas(ctx.expediente),
        ]);
        res.json({ fotos: puestas, candidatas: cands.fotos, aviso: cands.aviso });
    } catch (e) {
        console.error('[ceeEnvolvente] fotos:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/** POST /:expedienteId/fotos?clave=FBS3 — sube fotos nuevas a ese cerramiento. */
router.post('/:expedienteId/fotos', internoOExtSuyo, staffSiOportunidad, uploadFotos.array('files', 6),
    async (req, res) => {
        try {
            const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
            if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });
            const clave = fotos.validaClave(req.query.clave || req.body?.clave);
            if (!req.files?.length) {
                return res.status(400).json({ error: 'No se ha recibido ninguna foto.' });
            }
            // EN SERIE: cada subida lee el estado y lo reescribe, y en paralelo dos
            // se pisarían — la segunda escribiría sobre lo que leyó antes de la
            // primera. Mismo motivo que la subida secuencial de `subirDocsPendientes`.
            // `subir` deja el estado puesto en `ctx.expediente`, así que la siguiente
            // vuelta ya ve la anterior sin recargar nada.
            const puestas = [];
            for (const f of req.files) {
                // eslint-disable-next-line no-await-in-loop
                puestas.push(await fotos.subir(ctx.expediente, clave, f, quienEs(req)));
            }
            res.json({ ok: true, puestas });
        } catch (e) {
            console.error('[ceeEnvolvente] subir foto:', e.message);
            res.status(e.status || 500).json({ error: e.message });
        }
    });

/** POST /:expedienteId/fotos/adoptar — pega una que YA está en el expediente. */
router.post('/:expedienteId/fotos/adoptar', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });
        const { clave, drive_id: driveId } = req.body || {};
        const puesta = await fotos.adoptar(ctx.expediente, clave, driveId, quienEs(req));
        res.json({ ok: true, puesta });
    } catch (e) {
        console.error('[ceeEnvolvente] adoptar foto:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/** DELETE /:expedienteId/fotos?clave=FBS3&drive_id=… — la despega. */
router.delete('/:expedienteId/fotos', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });
        await fotos.quitar(ctx.expediente, req.query.clave, req.query.drive_id);
        res.json({ ok: true });
    } catch (e) {
        console.error('[ceeEnvolvente] quitar foto:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * PUT /:expedienteId/fotos/marcas
 * Body: { clave, drive_id, marcas: [{ uid, box:{x,y,ancho,alto}, de }] }
 *
 * Dónde cae cada hueco DENTRO de esta foto. Se escribe al aplicar una lectura
 * —el modelo ya ha mirado dónde está cada ventana— y al señalar una a mano.
 */
router.put('/:expedienteId/fotos/marcas', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });
        const { clave, drive_id: driveId, marcas, fundir } = req.body || {};
        const puestas = await fotos.guardarMarcas(
            ctx.expediente, clave, driveId, marcas, { fundir: !!fundir });
        res.json({ ok: true, marcas: puestas });
    } catch (e) {
        console.error('[ceeEnvolvente] marcas:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/**
 * GET /:expedienteId/fotos/:driveId/contenido
 *
 * Los bytes de una foto, para poder verla en la pantalla. `internalOnly` como
 * todo lo demás: el navegador la pide con su sesión y la pinta desde un blob, en
 * vez de abrir una ruta pública con el id de Drive en la URL.
 *
 * Solo sirve fotos de ESTE expediente —pegadas a un cerramiento o candidatas—:
 * el driveId llega del navegador y esto no puede ser un proxy de la Drive API.
 */
router.get('/:expedienteId/fotos/:driveId/contenido', internoOExtSuyo, staffSiOportunidad, async (req, res) => {
    try {
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).send('Expediente no encontrado');
        const f = await fotos.bytesDe(ctx.expediente, req.params.driveId);
        res.setHeader('Content-Type', f.mimeType);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.send(f.buffer);
    } catch (e) {
        res.status(e.status || 500).send(e.message);
    }
});

/**
 * POST /:expedienteId/fotos/leer
 * Body: { clave, drive_ids[], ambito: 'pared'|'hueco', pared?, hueco?, aspecto? }
 *
 * LEE y PROPONE. No escribe ni un hueco en el plano: lo que devuelve va a un
 * popup donde se revisa y se aplica, porque de aquí sale una superficie de
 * huecos que acaba en el certificado. Mismo gesto de dos tiempos que las placas.
 *
 * La PARED viaja desde el navegador —su largo, su alto y su orientación— y eso
 * es deliberado: es la geometría que está en pantalla, la que el motor midió y
 * la que el certificador puede haber corregido moviendo la pared. Con ella el
 * código pone la escala; el modelo solo da proporciones.
 */
router.post('/:expedienteId/fotos/leer', internoOExtSuyo, staffSiOportunidad, limiteExt('fotos_leer'), async (req, res) => {
    try {
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });

        const { clave, drive_ids: driveIds, ambito, pared, hueco, aspecto } = req.body || {};
        fotos.validaClave(clave);
        const ids = (Array.isArray(driveIds) ? driveIds : []).slice(0, paredOcr.MAX_FOTOS);
        if (!ids.length) {
            return res.status(400).json({ error: 'Elige al menos una foto para leerla.' });
        }

        const cands = (await fotos.candidatas(ctx.expediente)).fotos;
        const imagenes = [];
        for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop
            const f = await fotos.bytesDe(ctx.expediente, id, { cands });
            imagenes.push({ name: f.nombre, buffer: f.buffer, mimeType: f.mimeType });
        }

        const lectura = ambito === 'hueco'
            ? await paredOcr.leerHueco(imagenes, hueco || {})
            : await paredOcr.leerFachada(imagenes, pared || {}, { aspecto });

        // La huella queda en el expediente: una comprobación que se ve una vez y
        // se pierde al cerrar el popup no sirve de nada.
        try { await fotos.sellarLectura(ctx.expediente, clave, ids, lectura); }
        catch (e) { console.warn('[ceeEnvolvente] sellar lectura:', e.message); }

        res.json(lectura);
    } catch (e) {
        console.error('[ceeEnvolvente] leer foto:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

/** GET /api/cee-envolvente/health — para el deploy y para el panel de admin. */
router.get('/health', internalOnly, async (_req, res) => {
    try {
        const r = await fetch(`${MOTOR}/health`, { signal: AbortSignal.timeout(5_000) });
        res.status(r.ok ? 200 : 503).json(await r.json());
    } catch {
        res.status(503).json({ ok: false, error: 'cee-engine no responde', motor: MOTOR });
    }
});

function leerCabecera(r, nombre, porDefecto = []) {
    try { return JSON.parse(r.headers.get(nombre) || 'null') ?? porDefecto; }
    catch { return porDefecto; }
}

module.exports = router;
//: Para las pruebas (`scripts/test_origen_ext.mjs`): lo de `ext`, sin montar Express.
module.exports._pruebasExt = {
    rcFijadaExt, obraSinPedir, geometriaDeOtraRc, cortaCexExt, tomarTurnoExt, limiteExt,
    pedirGeometria, LIMITES_EXT,
    reiniciar: () => { usosExt.clear(); enCursoExt.clear(); },
};
