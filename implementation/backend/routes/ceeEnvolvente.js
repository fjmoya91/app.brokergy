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
const origenDe = (req) => (
    String(req.query?.origen || req.body?.origen || 'cae').toLowerCase() === 'cee'
        ? 'cee' : 'cae');

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
 * POST /api/cee-envolvente/:expedienteId/geometria
 * Body: { referencia_catastral, altura_planta? }
 *
 * De la RC a la envolvente medida y clasificada, más el plan de fotos.
 * La RC sale del expediente si no viene en el cuerpo: cada consulta a Catastro
 * cuesta, y no se pregunta dos veces lo mismo.
 */
router.post('/:expedienteId/geometria', internalOnly, async (req, res) => {
    try {
        const rc = (req.body?.referencia_catastral || '').trim();
        if (!rc) return res.status(400).json({ error: 'Falta la referencia catastral.' });

        // Qué plantas cuentan lo marcó una persona en la ficha técnica de la
        // oportunidad; sin selección guardada, el motor sigue con el uso de
        // Catastro. Se lee AQUÍ y no se acepta del navegador: de esto depende
        // la superficie que acaba en el certificado.
        const construcciones = await cex.construccionesElegidas(
            req.params.expedienteId, origenDe(req));

        const r = await alMotor('/envolvente', {
            referencia_catastral: rc,
            altura_planta: req.body?.altura_planta ?? null,
            offline: req.body?.offline === true,
            construcciones,
            // Los CUERPOS del edificio que el certificador deja fuera (el
            // aparcamiento adosado, el porche). Vienen del navegador como el
            // resto de lo que señala en el plano —las paredes apartadas, los
            // huecos— y se guardan con su trabajo; las CONSTRUCCIONES, en
            // cambio, se leen aquí porque son de la oportunidad.
            cuerpos_excluidos: Array.isArray(req.body?.cuerpos_excluidos)
                ? req.body.cuerpos_excluidos.filter(x => typeof x === 'string').slice(0, 50)
                : null,
        }, ESPERA_ENVOLVENTE_MS);

        const datos = await r.json();
        if (!r.ok) {
            // 502 del motor = ha fallado Catastro, no nosotros. Se deja pasar
            // tal cual para que el front no invite a reintentar contra el WAF.
            return res.status(r.status === 502 ? 502 : 400)
                .json({ error: datos?.detail || 'No se pudo construir la envolvente.' });
        }
        res.json(datos);
    } catch (e) {
        console.error('[ceeEnvolvente] geometria:', e.message);
        res.status(e.status || 500).json({ error: e.message });
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
router.get('/:expedienteId/trabajo', internalOnly, async (req, res) => {
    try {
        res.json({ trabajo: await cex.leerTrabajo(req.params.expedienteId, origenDe(req)) });
    } catch (e) {
        console.error('[ceeEnvolvente] leer trabajo:', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.put('/:expedienteId/trabajo', internalOnly, async (req, res) => {
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
router.post('/:expedienteId/ficha', internalOnly, async (req, res) => {
    try {
        const { geometria } = req.body || {};
        if (!geometria) return res.status(400).json({ error: 'Falta `geometria`.' });
        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });

        const fase = req.body?.fase || 'inicial';
        const { ficha, catalogo, faltan, avisos, fuente } = await cex.componerFicha(ctx, {
            geometria, envolvente: req.body?.envolvente, ajustes: req.body?.ajustes,
            medidas: req.body?.medidas, fase,
        });
        // `medidas` es el CATÁLOGO de mejoras que se pueden proponer, con su
        // motivo cuando no procede: es lo que pinta la pestaña de Medidas para
        // que el certificador elija, y no viaja dentro del `.cex`.
        // `fuente` son las COLUMNAS en crudo del cliente y del técnico: es lo
        // que edita el formulario de administrativos, porque sobre el valor
        // compuesto de la ficha no se puede escribir.
        res.json({ ficha, avisos, fase, medidas: catalogo, faltan, fuente,
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
router.post('/:expedienteId/imagenes', internalOnly, async (req, res) => {
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
router.post('/:expedienteId/cartografia', internalOnly, async (req, res) => {
    try {
        res.json(await cex.cartografia(req.body?.georef));
    } catch (e) {
        console.error('[ceeEnvolvente] cartografia:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
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
router.put('/:expedienteId/construcciones', internalOnly, async (req, res) => {
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
router.put('/:expedienteId/cliente', staffOnly, async (req, res) => {
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
router.put('/:expedienteId/tecnico', internalOnly, async (req, res) => {
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
router.post('/:expedienteId/imagenes/:cual', internalOnly, upload.single('file'),
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

router.delete('/:expedienteId/imagenes/:cual', internalOnly, async (req, res) => {
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
router.post('/:expedienteId/cex', internalOnly, async (req, res) => {
    try {
        const { geometria } = req.body || {};
        if (!geometria) return res.status(400).json({ error: 'Falta `geometria`.' });

        const ctx = await cex.cargarExpediente(req.params.expedienteId, origenDe(req));
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado.' });

        const fase = req.body?.fase || 'inicial';
        const esFinal = fase === 'final';

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
                error: 'El CEE final se hace sobre el inicial, y este expediente todavía '
                     + 'no tiene ninguno en «1. CEE / CEE INICIAL». Genera primero el inicial.',
            });
        }

        // Con imágenes solo al generar el INICIAL: son peticiones al mismo WAF
        // del que depende el buscador, y el final las hereda del fichero copiado.
        const { ficha, avisos: avisosFicha } = await cex.componerFicha(ctx, {
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
        res.json({ ...guardado, fase, avisos, contraste, ficha });
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
router.get('/:expedienteId/fotos', internalOnly, async (req, res) => {
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
router.post('/:expedienteId/fotos', internalOnly, uploadFotos.array('files', 6),
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
router.post('/:expedienteId/fotos/adoptar', internalOnly, async (req, res) => {
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
router.delete('/:expedienteId/fotos', internalOnly, async (req, res) => {
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
router.put('/:expedienteId/fotos/marcas', internalOnly, async (req, res) => {
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
router.get('/:expedienteId/fotos/:driveId/contenido', internalOnly, async (req, res) => {
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
router.post('/:expedienteId/fotos/leer', internalOnly, async (req, res) => {
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
