// node implementation/backend/scripts/test_cors_web.js
// El CORS de la API (utils/corsOrigenes.js): por qué brokergy.es recibía un 500 y qué recibe ahora.
// Sin red ni BD: una app de Express en un puerto local con rutas de mentira.
const http = require('http');
const express = require('express');
const cors = require('cors');
const { crearCors } = require('../utils/corsOrigenes');

let ok = 0, ko = 0;
const t = (cond, nombre, extra = '') => { if (cond) { ok++; } else { ko++; console.log('  ✗', nombre, extra); } };

function montar(mw) {
  const app = express();
  app.use(mw);
  let ejecutadas = 0;
  app.get('/api/public/marketplace/red/:slug/pagina', (req, res) => { ejecutadas++; res.json({ slug: req.params.slug }); });
  app.get('/api/public/marketplace/foto/:id', (req, res) => { ejecutadas++; res.type('image/jpeg').send(Buffer.from([0xff, 0xd8])); });
  app.post('/api/public/marketplace/lead', (req, res) => { ejecutadas++; res.json({ ok: true }); });
  app.get('/api/oportunidades', (req, res) => { ejecutadas++; res.json([]); });
  app.post('/api/oportunidades', (req, res) => { ejecutadas++; res.json({ ok: true }); });
  return { app, ejecutadas: () => ejecutadas };
}

function pedir(server, { method = 'GET', path, origin, headers = {} }) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    if (origin) h.Origin = origin;
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path, headers: h }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const escuchar = (app) => new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });

(async () => {
  // ── 1. La CAUSA: el CORS de antes (copiado tal cual de server.js) ─────────────────────────────────
  const antes = montar(cors({
    origin: (origin, cb) => {
      const permitidos = ['https://app.brokergy.es', 'https://cee.brokergy.es'];
      if (!origin || permitidos.includes(origin) || /^http:\/\/localhost/.test(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }));
  antes.app.set('env', 'test'); // sin la traza del Error en la consola
  const sA = await escuchar(antes.app);
  const r0 = await pedir(sA, { path: '/api/public/marketplace/red/rca/pagina', origin: 'https://brokergy.es' });
  t(r0.status === 500, 'ANTES: brokergy.es recibe 500 (cb(new Error) sin manejador de errores)', r0.status);
  t(/CORS: origin https:\/\/brokergy\.es not allowed/.test(r0.body), 'ANTES: el 500 es el Error del CORS');
  t(antes.ejecutadas() === 0, 'ANTES: la ruta ni se ejecutaba');
  sA.close();

  // ── 2. Ahora ───────────────────────────────────────────────────────────────────────────────────────
  const env = { FRONTEND_URL: 'https://app.brokergy.es', CERTAPP_URL: 'https://cee.brokergy.es', NODE_ENV: 'production' };
  const ahora = montar(crearCors(env));
  const s = await escuchar(ahora.app);

  for (const web of ['https://brokergy.es', 'https://www.brokergy.es']) {
    const r = await pedir(s, { path: '/api/public/marketplace/red/rca/pagina', origin: web });
    t(r.status === 200, `${web}: GET de la página → 200`, r.status);
    t(r.headers['access-control-allow-origin'] === web, `${web}: Allow-Origin es el suyo`, r.headers['access-control-allow-origin']);
    t(!r.headers['access-control-allow-credentials'], `${web}: SIN credenciales`);
    t(/Origin/.test(r.headers.vary || ''), `${web}: Vary: Origin (la caché no mezcla orígenes)`);

    const f = await pedir(s, { path: '/api/public/marketplace/foto/abc', origin: web });
    t(f.status === 200 && f.headers['access-control-allow-origin'] === web, `${web}: GET de una foto → 200 con CORS`);

    const pre = await pedir(s, { method: 'OPTIONS', path: '/api/public/marketplace/red/rca/pagina', origin: web, headers: { 'Access-Control-Request-Method': 'GET' } });
    t(pre.status === 204 && /GET/.test(pre.headers['access-control-allow-methods'] || '') && !/POST/.test(pre.headers['access-control-allow-methods'] || ''),
      `${web}: preflight de GET → 204, solo GET/HEAD`, `${pre.status} ${pre.headers['access-control-allow-methods']}`);

    const prePost = await pedir(s, { method: 'OPTIONS', path: '/api/public/marketplace/lead', origin: web, headers: { 'Access-Control-Request-Method': 'POST' } });
    t(prePost.status === 403 && !prePost.headers['access-control-allow-origin'], `${web}: preflight de POST → 403 sin CORS`, prePost.status);

    const post = await pedir(s, { method: 'POST', path: '/api/public/marketplace/lead', origin: web });
    t(post.status === 403 && !post.headers['access-control-allow-origin'], `${web}: POST al marketplace → 403 sin CORS`, post.status);

    const otra = await pedir(s, { path: '/api/oportunidades', origin: web });
    t(otra.status === 403 && !otra.headers['access-control-allow-origin'], `${web}: GET fuera del marketplace → 403 sin CORS`, otra.status);

    const truco = await pedir(s, { path: '/api/public/marketplacex/foto/1', origin: web });
    t(truco.status === 403, `${web}: un prefijo parecido no cuela`, truco.status);
  }

  // Un origen DESCONOCIDO: 403 sin cabeceras de CORS y la ruta no se ejecuta.
  const antesDeDesconocido = ahora.ejecutadas();
  for (const malo of ['https://evil.example', 'https://brokergy.es.evil.example', 'http://brokergy.es', 'null']) {
    const r = await pedir(s, { path: '/api/public/marketplace/red/rca/pagina', origin: malo });
    t(r.status === 403, `${malo}: 403, no 500`, r.status);
    t(!r.headers['access-control-allow-origin'], `${malo}: sin cabeceras de CORS`);
    t(/ORIGEN_NO_PERMITIDO/.test(r.body), `${malo}: dice por qué`);
    const p = await pedir(s, { method: 'POST', path: '/api/oportunidades', origin: malo });
    t(p.status === 403, `${malo}: POST a la API → 403`, p.status);
  }
  t(ahora.ejecutadas() === antesDeDesconocido, 'un desconocido no llega a ejecutar ninguna ruta');

  // ── 3. La APP, igual que siempre ───────────────────────────────────────────────────────────────────
  for (const appOrigen of ['https://app.brokergy.es', 'https://cee.brokergy.es', 'http://localhost:5173']) {
    const r = await pedir(s, { path: '/api/oportunidades', origin: appOrigen });
    t(r.status === 200 && r.headers['access-control-allow-origin'] === appOrigen && r.headers['access-control-allow-credentials'] === 'true',
      `${appOrigen}: GET con credenciales como siempre`);
    const p = await pedir(s, { method: 'POST', path: '/api/oportunidades', origin: appOrigen });
    t(p.status === 200, `${appOrigen}: POST como siempre`, p.status);
    const pre = await pedir(s, { method: 'OPTIONS', path: '/api/oportunidades', origin: appOrigen, headers: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    t(pre.status === 204 && /PUT/.test(pre.headers['access-control-allow-methods'] || '') && pre.headers['access-control-allow-credentials'] === 'true',
      `${appOrigen}: preflight de PUT como siempre`);
    const m = await pedir(s, { path: '/api/public/marketplace/red/rca/pagina', origin: appOrigen });
    t(m.headers['access-control-allow-credentials'] === 'true', `${appOrigen}: también el marketplace, como siempre`);
  }
  const sinOrigen = await pedir(s, { path: '/api/oportunidades' });
  t(sinOrigen.status === 200 && !sinOrigen.headers['access-control-allow-origin'], 'sin Origin (servidor a servidor): pasa, sin cabeceras');
  // La LAN privada: solo fuera de producción.
  const lan = await pedir(s, { path: '/api/oportunidades', origin: 'http://192.168.1.20:5173' });
  t(lan.status === 403, 'LAN privada en PRODUCCIÓN → 403', lan.status);
  s.close();

  const dev = montar(crearCors({ ...env, NODE_ENV: 'development' }));
  const sD = await escuchar(dev.app);
  const lanDev = await pedir(sD, { path: '/api/oportunidades', origin: 'http://192.168.1.20:5173' });
  t(lanDev.status === 200 && lanDev.headers['access-control-allow-origin'] === 'http://192.168.1.20:5173', 'LAN privada en DESARROLLO → como siempre');
  sD.close();

  // CERTAPP_URL con otro valor manda; FRONTEND_URL con varios orígenes, todos valen.
  const otro = montar(crearCors({ FRONTEND_URL: 'https://app.brokergy.es, https://otra.brokergy.es', CERTAPP_URL: 'https://cee2.brokergy.es/x', NODE_ENV: 'production' }));
  const sO = await escuchar(otro.app);
  for (const o of ['https://otra.brokergy.es', 'https://cee2.brokergy.es']) {
    const r = await pedir(sO, { method: 'POST', path: '/api/oportunidades', origin: o });
    t(r.status === 200, `${o}: sale de FRONTEND_URL / CERTAPP_URL`, r.status);
  }
  const ceeViejo = await pedir(sO, { path: '/api/oportunidades', origin: 'https://cee.brokergy.es' });
  t(ceeViejo.status === 403, 'si CERTAPP_URL cambia, el origen viejo deja de valer', ceeViejo.status);
  sO.close();

  console.log(ko ? `✗ ${ko} fallos, ${ok} correctas` : `✓ ${ok}/${ok} comprobaciones del CORS`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
