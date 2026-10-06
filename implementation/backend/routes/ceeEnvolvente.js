const express = require('express');
const router = express.Router();
const multer = require('multer');
const { internalOnly, staffOnly, isStaff } = require('../middleware/auth');
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
// (PRESCRIPTOR / INSTALADOR / DISTRIBUIDOR) no entran: no es su ámbito.
// ─────────────────────────────────────────────────────────────────────────────

const MOTOR = process.env.CEE_ENGINE_URL || 'http://cee-engine:8080';

/**
 * De qué NEGOCIO es el id que llega: el expediente CAE de siempre o un CEE
 * contratado suelto (`cee_directos`).
 *
 * REGLA — viaja EXPLÍCITO desde el navegador (`?origen=cee`), nunca se busca «a
 * ver en qué tabla está ese UUID». Son dos tablas y el mismo id no vale en las
 * dos: una búsqueda a ciegas es la forma de escribir el trabajo del certificador
 * en el negocio equivocado. Es el mismo criterio que `?cee=` frente a `?exp=` en
 * los enlaces que ya viajan en los mensajes.
 */
const origenDe = (req) => cex.origenNorm(req.query?.origen || req.body?.origen);

/**
 * `origen=op` — una OPORTUNIDAD aún sin aceptar: la envolvente se empieza desde
 * la calculadora y lo señalado pasa al expediente al aceptarla.
 *
 * REGLA — eso es del EQUIPO INTERNO. El certificador entra a los expedientes
 * que tiene asignados, y una oportunidad no tiene certificador: no es su sitio
 * (y la oportunidad lleva el margen de Brokergy dentro).
 */
const staffSiOportunidad = (req, res, next) => {
    if (origenDe(req) === 'op' && !isStaff(req)) {
        return res.status(403).json({
            error: 'La envolvente de una oportunidad es del equipo interno.' });
    }
    next();
};

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
async function pedirGeometria(expedienteId, origen, body = {}) {
    const rc = (body?.referencia_catastral || '').trim();
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
        const ctx = await cex.cargarExpediente(expedienteId, origen);
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
    const { semisotano, anexos } = cex.declaracionesEdificio(trabajo?.ajustes);

    const r = await alMotor('/envolvente', {
        referencia_catastral: rc,
        altura_planta: altura,
        offline: body?.offline === true,
        construcciones,
        ...(semisotano ? { semisotano } : {}),
        ...(anexos.length ? { anexos } : {}),
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

router.post('/:expedienteId/geometria', internalOnly, staffSiOportunidad, async (req, res) => {
    try {
        const { status, datos } = await pedirGeometria(req.params.expedienteId, origenDe(req), req.body || {});
        if (status === 400 && datos?.detail === 'Falta la referencia catastral.') {
            return res.status(400).json({ error: datos.detail });
        }
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
    });
    if (status < 200 || status >= 300) {
        return { ok: false, status: status === 502 ? 502 : 400,
                 error: `No se ha podido medir el edificio: ${geo?.detail || status}` };
    }
    const r = await croq.croquisDeExpediente(ctx, { geo, trabajo: t, fase, avisos, autor });
    return r.ok ? r : { ...r, status: 502 };
}

router.post('/:expedienteId/croquis', internalOnly, staffSiOportunidad, async (req, res) => {
    try {
        const fase = req.body?.fase === 'final' ? 'final' : 'inicial';
        const r = await croquisDesdeTrabajo(req.params.expedienteId, origenDe(req),
            { fase, autor: req.user?.nombre || req.user?.email || null });
        if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
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
router.get('/:expedienteId/trabajo', internalOnly, staffSiOportunidad, async (req, res) => {
    try {
        res.json({ trabajo: await cex.leerTrabajo(req.params.expedienteId, origenDe(req)) });
    } catch (e) {
        console.error('[ceeEnvolvente] leer trabajo:', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.put('/:expedienteId/trabajo', internalOnly, staffSiOportunidad, async (req, res) => {
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
 * POST /api/cee-envolvente/:expedienteId/ficha
 * Body: { geometria, ajustes? }
 *
 * Lo que se va a escribir en el .cex, SIN escribir nada. Cada valor lleva de
 * dónde sale, y eso es lo que el certificador revisa antes de generar: aquí se
 * ve si una transmitancia o un año no son los que él daría por buenos.
 */
router.post('/:expedienteId/ficha', internalOnly, staffSiOportunidad, async (req, res) => {
    try {
        const { geometria } = req.body || {};
        if (!geometria) return res.status(400).json({ error: 'Falta `geometria`.' });
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });

        const fase = req.body?.fase || 'inicial';
        const { ficha, catalogo, faltan, avisos, fuente, equipos, aires,
                versionCe3x } = await cex.componerFicha(ctx, {
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
        res.json({ ficha, avisos, fase, medidas: catalogo, faltan, fuente, equipos, aires,
                   version_ce3x: versionCe3x,
                   nombre: cex.nombreDelCex(ctx.expediente, fase) });
    } catch (e) {
        console.error('[ceeEnvolvente] ficha:', e.message);
        res.status(e.status || 500).json({ error: e.message });
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
router.post('/:expedienteId/imagenes', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.post('/:expedienteId/cartografia', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.post('/:expedienteId/croquis-movil', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.get('/:expedienteId/croquis-movil/:token/esperar', internalOnly, staffSiOportunidad, async (req, res) => {
    let soltar = null;
    req.on('close', () => soltar?.());
    const datos = await croquisMovil.esperar(req.params.token, req.params.expedienteId,
                                             req.query.v, (fn) => { soltar = fn; });
    if (!res.writableEnded && !res.destroyed) res.json(datos);
});

/** POST …/croquis-movil/:token/resultado — cómo ha ido el ajuste que pidió el teléfono. */
router.post('/:expedienteId/croquis-movil/:token/resultado', internalOnly, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.responder(req.params.token, req.params.expedienteId, req.body || {});
    res.status(ok ? 200 : 410).json({ ok });
});

/**
 * POST …/croquis-movil/:token/resultado-huecos — el ordenador ha puesto (o no)
 * en el plano los huecos que se revisaron en el teléfono.
 */
router.post('/:expedienteId/croquis-movil/:token/resultado-huecos', internalOnly, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.responderHuecos(req.params.token, req.params.expedienteId, req.body || {});
    res.status(ok ? 200 : 410).json({ ok });
});

/**
 * POST …/croquis-movil/:token/paredes — cómo están las paredes AHORA en el plano
 * del ordenador (huecos, nombre, si admiten ventanas), para que el teléfono lo vea.
 */
router.post('/:expedienteId/croquis-movil/:token/paredes', internalOnly, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.actualizarParedes(req.params.token, req.params.expedienteId, req.body?.paredes);
    res.status(ok ? 200 : 410).json({ ok });
});

/**
 * POST …/croquis-movil/:token/resultado-contra — el ordenador ha aplicado (o no)
 * lo que se dijo desde el teléfono de una pared (contra qué da).
 */
router.post('/:expedienteId/croquis-movil/:token/resultado-contra', internalOnly, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.responderContra(req.params.token, req.params.expedienteId, req.body || {});
    res.status(ok ? 200 : 410).json({ ok });
});

/**
 * POST …/croquis-movil/:token/plano — el ordenador ha vuelto a MEDIR por su
 * cuenta: la planta del teléfono se pone al día (paredes, zonas, contorno), ya
 * en el lienzo del teléfono.
 */
router.post('/:expedienteId/croquis-movil/:token/plano', internalOnly, staffSiOportunidad, (req, res) => {
    const ok = croquisMovil.actualizarPlano(req.params.token, req.params.expedienteId, req.body || {});
    res.status(ok ? 200 : 410).json({ ok });
});

/** DELETE …/croquis-movil/:token — el ordenador cierra; el teléfono lo verá. */
router.delete('/:expedienteId/croquis-movil/:token', internalOnly, staffSiOportunidad, (req, res) => {
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
router.put('/:expedienteId/construcciones', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.put('/:expedienteId/tecnico', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.post('/:expedienteId/imagenes/:cual', internalOnly, staffSiOportunidad, upload.single('file'),
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

router.delete('/:expedienteId/imagenes/:cual', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.post('/:expedienteId/cex', internalOnly, staffSiOportunidad, async (req, res) => {
    try {
        const { geometria } = req.body || {};
        if (!geometria) return res.status(400).json({ error: 'Falta `geometria`.' });

        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });

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
        const { ficha, avisos: avisosFicha, imagenesFallidas = [] } = await cex.componerFicha(ctx, {
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

        const crudo = Buffer.from(await r.arrayBuffer());
        const avisos = [...avisosFicha, ...leerCabecera(r, 'X-Cee-Avisos')];
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
        res.json({ ...guardado, fase, avisos, contraste, ficha,
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
router.get('/:expedienteId/fotos', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.post('/:expedienteId/fotos', internalOnly, staffSiOportunidad, uploadFotos.array('files', 6),
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
router.post('/:expedienteId/fotos/adoptar', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.delete('/:expedienteId/fotos', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.put('/:expedienteId/fotos/marcas', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.get('/:expedienteId/fotos/:driveId/contenido', internalOnly, staffSiOportunidad, async (req, res) => {
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
router.post('/:expedienteId/fotos/leer', internalOnly, staffSiOportunidad, async (req, res) => {
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
