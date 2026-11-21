const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const compression = require('compression');
const catastroRoutes = require('./routes/catastro');
const oportunidadesRoutes = require('./routes/oportunidades');
const prescriptoresRoutes = require('./routes/prescriptores');
const usuariosRoutes = require('./routes/usuarios');
const pdfRoutes = require('./routes/pdf');
const clientesRoutes = require('./routes/clientes');
const geoRoutes = require('./routes/geo');
const aerotermiaRoutes = require('./routes/aerotermia');
const expedientesRoutes = require('./routes/expedientes');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Evitar que errores no capturados (ej. Puppeteer/WhatsApp) maten el proceso
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException (no fatal):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection (no fatal):', reason?.message || reason);
});

// Middleware
// CORS: la app (FRONTEND_URL + CERTAPP_URL + localhost + LAN en desarrollo) como siempre; brokergy.es solo
// GET sin credenciales a /api/public/marketplace/…; un origen desconocido, 403 (antes un 500). Ver
// utils/corsOrigenes.js y test_cors_web.js.
app.use(require('./utils/corsOrigenes').crearCors());
// Compresión gzip para todas las respuestas JSON — reduce payload ~80-90% en listados
// con datos_calculo/cee/instalacion (JSONB grandes). Mejora drásticamente tiempos de carga.
app.use(compression({
  threshold: 1024, // solo comprimir respuestas > 1KB
  level: 6,        // balance compresión/CPU
}));
app.use(express.json({ limit: '50mb' }));

// Logger middleware (simple)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Routes
app.use('/api/catastro', catastroRoutes);
app.use('/api/oportunidades', oportunidadesRoutes);
app.use('/api/prescriptores', prescriptoresRoutes);
// La PERSONA que trae una obra, aparte del partner (solo equipo interno).
app.use('/api/comisionistas', require('./routes/comisionistas'));
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/geo', geoRoutes);
// Tarifas por Excel (solo ADMIN, app del instalador fase 4): ANTES que aerotermia,
// cuyo `GET /:id` se tragaría `/tarifas/...`.
app.use('/api/aerotermia/tarifas', require('./routes/aerotermiaTarifas'));
app.use('/api/aerotermia', aerotermiaRoutes);
// El otro catálogo de equipos: marcos y vidrios de un RES080 (ver routes/ventanas.js).
app.use('/api/ventanas', require('./routes/ventanas'));
app.use('/api/expedientes', expedientesRoutes);
app.use('/api/lotes', require('./routes/lotes'));
app.use('/api/auth', authRoutes);
app.use('/api/public/portal', require('./routes/portal'));
// La factura de la obra hecha en la app, en la plantilla del instalador («como su ERP»). ANTES de /api/public.
app.use('/api/public/factura-instalador', require('./routes/facturaInstalador'));
// Escaparate público de instaladores (instaladores.brokergy.es). El frontend vive
// en un repo aparte (C:/Proyectos/marketplace); aquí solo servimos su API pública.
app.use('/api/public/marketplace', require('./routes/publicMarketplace'));
// App de certificadores (cee.brokergy.es), lo público: beta, activar, fotos del propietario. ANTES de /api/public.
app.use('/api/public/certapp', require('./routes/certappPublic'));
// El enlace del CLIENTE de un informe técnico (2026INF_n): su token, sin sesión. ANTES de /api/public.
app.use('/api/public/informe', require('./routes/informesPublic'));
app.use('/api/public', require('./routes/public'));
// Servlets de almacenamiento intermedio de Autofirma (@firma) para firmar/recuperar
// ficheros GRANDES. Montados bajo /api para reutilizar el proxy nginx existente
// (client_max_body_size 120m) SIN tocar la config de nginx. El modal configura
// setServlets(`${origin}/api/afirma-signature-...`).
app.use('/api', require('./routes/afirmaStorage'));
app.use('/api/landing', require('./routes/landing'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/cee-ocr', require('./routes/ceeOcr'));
app.use('/api/cee-envolvente', require('./routes/ceeEnvolvente'));
// Generar el CEE inicial con IA: la app lo apunta y lo atiende el PC (banco.mjs atender).
app.use('/api/cee-ia', require('./routes/ceeIa'));
// Producción fotovoltaica de un sitio (PVGIS, JRC): kWp ⇄ kWh/año y su reparto
// mensual para el autoconsumo de los CEE.
app.use('/api/pvgis', require('./routes/pvgis'));
// Lectura de facturas/presupuestos ANTES de que exista expediente (toma de datos de
// una nueva simulación). El gemelo con expediente vive en routes/expedientes.
app.use('/api/factura-ocr', require('./routes/facturaOcr'));
// Acciones del parte diario de seguimiento: páginas PÚBLICAS firmadas con HMAC
// (utils/accionToken) que preparan el recordatorio al certificador / cliente /
// instalador sin tener que entrar en la app. Validan su propio token.
app.use('/api/acciones', require('./routes/acciones'));
// El mismo parte, dentro de la app (con sesión de staff): cola de trabajo por bloque
// y por destinatario + envío en bloque. Gemelo INTERNO de /api/acciones.
app.use('/api/seguimiento', require('./routes/seguimiento'));
// CEE contratados SUELTOS (fuera del negocio CAE): tabla `cee_directos`, carpetas
// en "26. CERTIF. EFICIENCIA ENER / 1. PRODUCCION". Rutas propias a propósito —
// no comparten tabla ni handlers con /api/expedientes.
app.use('/api/cee-directos', require('./routes/ceeDirectos'));
// INFORMES técnicos ({AAAA}INF_{n}): todo lo que no es CAE ni CEE. Ver docs/conocimiento/informes/.
app.use('/api/informes', require('./routes/informes'));
// FACTURACIÓN: catálogo de artículos y presupuestos con N partidas (sustituye a
// la app de presupuestos de AppSheet). Ver routes/facturacion.js.
app.use('/api/facturacion', require('./routes/facturacion'));
// CUADRO DE MANDO de dirección (solo ADMIN): negocio + finanzas (EBITDA, caja,
// previsión). Ver services/cuadroDireccion.js y docs/conocimiento/cuadro-mando/.
app.use('/api/cuadro-mando', require('./routes/cuadroMando'));
// El asistente de la app (botón flotante, solo ADMIN): contesta por la API de
// Anthropic con datos en vivo y propone encargos al Claude del WhatsApp.
app.use('/api/asistente-app', require('./routes/asistenteApp'));
// App de certificadores (cee.brokergy.es): la API del certificador (certappOnly) y el panel de BROKERGY (adminOnly).
// El alta con Google (sesión sin cuenta) va ANTES: /api/certapp exige cuenta.
app.use('/api/certapp/alta', require('./routes/certappAlta'));
app.use('/api/certapp', require('./routes/certapp'));
app.use('/api/certapp-admin', require('./routes/certappAdmin'));
// App del INSTALADOR (fase 1, solo lectura): sus obras ya resueltas, solo para quien
// está en la beta (APP_INSTALADOR_BETA). Ver docs/conocimiento/instalador-app/.
app.use('/api/instalador-app', require('./routes/instaladorApp'));
// Fase 3: la REVISIÓN de lo que el instalador propone para su página (fotos y textos).
// Ver la cola, el equipo interno; aprobar y rechazar, solo ADMIN.
app.use('/api/escaparate-revision', require('./routes/escaparateRevision'));

// WhatsApp (opcional): cargar e inicializar de forma automática al arrancar
try {
    const whatsappService = require('./services/whatsappService');
    app.use('/api/whatsapp', require('./routes/whatsapp'));
    console.log('[server] Rutas WhatsApp montadas en /api/whatsapp');

    // Intentar inicialización automática
    whatsappService.init().then(res => {
        if (res.ok) {
            console.log(`[server] WhatsApp: Inicialización automática solicitada (Estado actual: ${res.state})`);
        } else {
            console.log('[server] WhatsApp: No configurado para arranque automático o deshabilitado.');
        }
    }).catch(err => {
        console.error('[server] WhatsApp: Error en arranque automático:', err.message);
    });

    // Bot de respuestas automáticas a los chats etiquetados. Se arranca aquí y
    // no dentro del `ready` de WhatsApp porque tiene que suscribirse UNA vez:
    // el listener se re-engancha solo en cada reconexión, y su barrido no hace
    // nada mientras la sesión no esté lista. Nace apagado salvo que
    // BOT_WHATSAPP_ENABLED=true (en LOCAL escribiría a clientes REALES).
    //
    // Try/catch PROPIO: si el bot no carga, WhatsApp sigue perfectamente vivo y
    // hay que decirlo así. Compartiendo el catch de fuera, un fallo del bot se
    // anunciaba como "WhatsApp no disponible" y mandaba a buscar la avería al
    // sitio equivocado.
    try {
        require('./services/botWhatsapp').start();
    } catch (e) {
        console.warn('[server] Bot de WhatsApp no disponible:', e.message);
    }
    // Etiquetas y nº de obra en el nombre del chat de cada cliente, solos (repaso
    // cada 6 h). Nace apagado salvo WA_AUTO_SYNC=true: escribe en la agenda REAL.
    try {
        require('./services/whatsappAutoSync').iniciar();
    } catch (e) {
        console.warn('[server] Sincronización automática de WhatsApp no disponible:', e.message);
    }
    // El timbre del canal de trabajo con Fran: avisa al contenedor «asistente» cuando él escribe.
    try {
        require('./services/asistenteCanal').start();
    } catch (e) {
        console.warn('[server] Canal del asistente no disponible:', e.message);
    }
} catch (err) {
    console.warn('[server] WhatsApp no disponible o error al cargar: ', err.message);
}

// SMTP startup check
try {
    const emailService = require('./services/emailService');
    if (process.env.SMTP_PASS) {
        emailService.verifySmtp().then(ok => {
            if (ok) console.log('[server] SMTP: Conexión verificada OK');
            else console.warn('[server] SMTP: Verificación fallida — revisa credenciales');
        }).catch(e => console.error('[server] SMTP: Error de verificación:', e.message));
    } else {
        console.warn('[server] SMTP: SMTP_PASS no está configurado — los emails no se enviarán');
    }
} catch (e) {
    console.warn('[server] SMTP: No se pudo cargar emailService:', e.message);
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date(), version: '1.0.1-debug' });
});

app.get('/api/debug-direct', (req, res) => {
  res.json({ message: 'Direct API access works', time: new Date() });
});

// Start server only if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Puerto REAL de escucha, para las llamadas que el backend se hace a sí mismo
    // (routes/acciones delega en /api/expedientes con la clave interna). En desarrollo
    // el puerto puede no ser el del .env si el 3000 estaba ocupado, y sin esto la
    // llamada interna acabaría en OTRO backend.
    process.env.PORT_EFECTIVO = String(PORT);
    // Refresco periódico de stats del escaparate de instaladores (no bloqueante).
    try {
      require('./services/marketplaceStatsRefresher').start();
    } catch (err) {
      console.warn('[marketplaceStats] no se pudo iniciar el refrescador:', err.message);
    }
    // Parte diario de seguimiento: un solo aviso al día con TODO lo atascado
    // (CEE sin revisar, sin registrar, obras sin cerrar, firmas sin devolver…).
    // Absorbe al antiguo `revisionPendienteNotifier`, que ahora es uno de sus bloques.
    try {
      require('./services/seguimientoDiario').start();
    } catch (err) {
      console.warn('[Parte] no se pudo iniciar la vigilancia:', err.message);
    }
    // Propuestas con el envío PROGRAMADO: a su hora sale el mismo recorrido que
    // haría el popup, con el ordenador de quien lo programó apagado. Nace
    // APAGADO (PROPUESTA_PROGRAMADA_ENABLED): dos backends contra la misma base
    // —el del VPS y el de un portátil— barrerían la misma tabla.
    try {
      require('./services/propuestaProgramada').start();
    } catch (err) {
      console.warn('[PropProg] no se pudo iniciar el despachador:', err.message);
    }
    // Petición de RESEÑA en Google, programada al avisar de la transferencia al
    // cliente (fase 7 del lote). Nace APAGADA (RESENA_PROGRAMADA_ENABLED), por
    // el mismo motivo que el envío programado de propuestas.
    try {
      require('./services/pagoClientesService').start();
    } catch (err) {
      console.warn('[reseña] no se pudo iniciar el despachador:', err.message);
    }
    // La RONDA DE WHATSAPP: lee de madrugada los chats con mensajes nuevos de quien
    // tiene algo vivo y a las 9:00 le manda a Fran el informe (email) y un resumen
    // corto (chat del asistente). Fase 1, en seco: no coloca ni escribe a nadie.
    // Nace APAGADA (WA_RONDA_ENABLED): en local la sesión es la misma cuenta.
    try {
      require('./services/rondaWhatsapp').start();
    } catch (err) {
      console.warn('[ronda] no se pudo iniciar:', err.message);
    }
    // Los FIRMADOS que el S.O. devuelve por correo se registran solos en su lote,
    // por el mismo camino que soltarlos en la fase 2. Nace APAGADO
    // (FIRMADOS_SO_CORREO_ENABLED): dos servidores leyendo el mismo buzón.
    try {
      require('./services/firmadosSoCorreo').start();
    } catch (err) {
      console.warn('[FirmadosCorreo] no se pudo iniciar:', err.message);
    }
    // El PLAN DE VERIFICACIÓN que manda el verificador por correo se archiva solo en
    // su lote, con el equipo (verificador jefe y revisor, email y teléfono). Nace
    // APAGADO (PLAN_VERIFICACION_CORREO_ENABLED): local escribe en producción.
    try {
      require('./services/equipoVerificacion').start();
    } catch (err) {
      console.warn('[PlanVerificacion] no se pudo iniciar:', err.message);
    }
    // La OFERTA DE VERIFICACIÓN que Marwen deja en beCAE se trae sola al lote y, si
    // su importe se lee limpio, se manda al S.O. con el mismo correo que a mano.
    // Nace APAGADA (OFERTA_VERIFICADOR_AUTO): le escribe al Sujeto Obligado.
    try {
      require('./services/ofertaVerificadorAuto').start();
    } catch (err) {
      console.warn('[OfertaAuto] no se pudo iniciar:', err.message);
    }
    // El INFORME DE INEXACTITUDES que Marwen manda por correo se sube solo a su lote
    // (incidencias registradas) y, con INEXACTITUDES_AGENTE_ENABLED, el Claude del
    // servidor prepara la contestación sin enviar nada. Nace APAGADO
    // (INEXACTITUDES_CORREO_ENABLED): local escribe en producción.
    try {
      require('./services/inexactitudesCorreo').start();
    } catch (err) {
      console.warn('[InexactitudesCorreo] no se pudo iniciar:', err.message);
    }
    // El INFORME DE VERIFICACIÓN, el DICTAMEN y la FACTURA del verificador que manda
    // Marwen por correo se suben solos a su lote (y se leen, como al subirlos a mano).
    // El ahorro verificado se sigue aplicando a mano. Nace APAGADO
    // (VERIFICACION_CORREO_ENABLED): local escribe en producción.
    try {
      require('./services/verificacionCorreo').start();
    } catch (err) {
      console.warn('[VerificacionCorreo] no se pudo iniciar:', err.message);
    }
    // La revisión de la documentación tras la ACEPTACIÓN: manda a las 9:00 lo que el
    // agente pidió fuera de horario y avisa si un encargo lleva 24 h sin moverse.
    // Nace APAGADA (ACEPTACION_AGENTE_ENABLED): local escribe en producción.
    try {
      require('./services/aceptacionAgente').start();
    } catch (err) {
      console.warn('[aceptacion-agente] no se pudo iniciar:', err.message);
    }
    // Lo que se le ha PEDIDO a alguien por WhatsApp: se cierra al contestar y, si
    // no, se le recuerda (en modo copia, solo lo ve Fran). Nace APAGADO (ESPERAS_ENABLED).
    try {
      require('./services/esperasWhatsapp').start();
    } catch (err) {
      console.warn('[esperas] no se pudo iniciar:', err.message);
    }
    // El CONTESTADOR: contesta como Fran a quien tiene algo vivo, tras 15 min de silencio
    // y de 7 a 21 h. Nace APAGADO (CONTESTADOR_ENABLED) y, encendido, en modo copia
    // (CONTESTADOR_MODO=real para escribir): lo que diría le llega a Fran al grupo.
    try {
      require('./services/contestadorWhatsapp').start();
    } catch (err) {
      console.warn('[contestador] no se pudo iniciar:', err.message);
    }
    // El SEGUIMIENTO: que no se quede nada pendiente. Pregunta por las propuestas enviadas
    // y recuerda el material del CEE inicial, con plantilla y su escalera. Nace APAGADO
    // (SEGUIMIENTO_ENABLED) y, encendido, en modo copia (SEGUIMIENTO_MODO=real para escribir).
    try {
      require('./services/seguimientoWhatsapp').start();
    } catch (err) {
      console.warn('[seguimiento] no se pudo iniciar:', err.message);
    }
    // A quien escribe por PRIMERA VEZ, una vez y sola: el formulario «Calcula tu ayuda»
    // y el vídeo de las ayudas. Nace APAGADA (WA_BIENVENIDA_ENABLED) y, encendida, en
    // modo copia (WA_BIENVENIDA_MODO=real para escribir): local es la misma cuenta.
    try {
      require('./services/bienvenidaWhatsapp').start();
    } catch (err) {
      console.warn('[bienvenida] no se pudo iniciar:', err.message);
    }
  });
}

module.exports = app;
