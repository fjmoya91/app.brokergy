const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
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
const allowedOrigins = (process.env.FRONTEND_URL || 'https://app.brokergy.es')
  .split(',')
  .map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server calls (no origin) and localhost in dev
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost/.test(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
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
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/aerotermia', aerotermiaRoutes);
app.use('/api/expedientes', expedientesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/public', require('./routes/public'));

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
  });
}

module.exports = app;
