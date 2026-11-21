// El CORS de la API: quién puede llamarla desde un navegador (2026-11-21, fase 5 de la app del instalador).
//
// - La APP (app.brokergy.es = FRONTEND_URL, cee.brokergy.es = CERTAPP_URL, localhost y, fuera de producción,
//   la LAN privada): exactamente como siempre, con credenciales.
// - La WEB pública (brokergy.es y www.brokergy.es): SOLO GET/HEAD, SIN credenciales y SOLO a
//   `/api/public/marketplace/…` (la ficha del instalador y sus fotos). A cualquier otra ruta, como un desconocido.
// - Un origen DESCONOCIDO: 403 `ORIGEN_NO_PERMITIDO` sin cabeceras de CORS. Antes el `origin` de `cors`
//   devolvía `cb(new Error(...))` y, sin manejador de errores, Express contestaba **500** con su página de error:
//   la web veía un fallo del servidor en vez de un «no». La ruta tampoco se ejecuta ahora (igual que antes).
//
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-5.md.
const cors = require('cors');

const ORIGENES_WEB = ['https://brokergy.es', 'https://www.brokergy.es'];
const PREFIJO_WEB = '/api/public/marketplace/';
const METODOS_WEB = ['GET', 'HEAD'];

function origenesDeLaApp(env = process.env) {
  const lista = String(env.FRONTEND_URL || 'https://app.brokergy.es').split(',').map(s => s.trim()).filter(Boolean);
  // La app de certificadores (cee.brokergy.es) llama a esta MISMA API desde su origen. No va en FRONTEND_URL,
  // que es además la base de los enlaces del CRM: su origen sale de CERTAPP_URL (mismo valor por defecto que
  // services/certapp/comun.js).
  try {
    const origenCertapp = new URL(String(env.CERTAPP_URL || 'https://cee.brokergy.es').trim()).origin;
    if (!lista.includes(origenCertapp)) lista.push(origenCertapp);
  } catch { /* CERTAPP_URL mal escrita: la app de certificadores no podrá llamar a la API */ }
  return lista;
}

// En DESARROLLO se admite también la IP privada del propio equipo: es como se abre la hoja de firma desde el
// móvil (`/firma-movil/:token`). Solo rangos privados (RFC 1918) y solo cuando NO estamos en producción.
const esLanPrivada = (origin, env = process.env) => env.NODE_ENV !== 'production'
  && /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);

function crearCors(env = process.env) {
  const deLaApp = origenesDeLaApp(env);
  const esDeLaApp = (origin) => !origin || deLaApp.includes(origin)
    || /^http:\/\/localhost/.test(origin) || esLanPrivada(origin, env);

  const corsApp = cors({ origin: true, credentials: true });
  const corsWeb = cors({ origin: true, credentials: false, methods: METODOS_WEB, maxAge: 600 });

  const esRutaWeb = (req) => {
    const ruta = String(req.path || '');
    if (!ruta.startsWith(PREFIJO_WEB)) return false;
    if (METODOS_WEB.includes(req.method)) return true;
    // El preflight solo, si lo que se va a pedir es un GET/HEAD.
    return req.method === 'OPTIONS'
      && METODOS_WEB.includes(String(req.headers['access-control-request-method'] || '').toUpperCase());
  };

  return function corsBrokergy(req, res, next) {
    const origin = req.headers.origin;
    if (esDeLaApp(origin)) return corsApp(req, res, next);
    if (ORIGENES_WEB.includes(origin) && esRutaWeb(req)) return corsWeb(req, res, next);
    res.setHeader('Vary', 'Origin');
    return res.status(403).json({ error: 'ORIGEN_NO_PERMITIDO', message: 'Este origen no puede llamar a esta API.' });
  };
}

module.exports = { crearCors, origenesDeLaApp, esLanPrivada, ORIGENES_WEB, PREFIJO_WEB };
