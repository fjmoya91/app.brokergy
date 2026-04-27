const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
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
