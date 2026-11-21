<!-- conocimiento · área: transversal-backend · las rutas de los enlaces son relativas a la raíz del repo -->

## El CORS: la web pública (brokergy.es) lee el marketplace, y un origen desconocido recibe un 403, no un 500 (2026-11-21)

**Por qué.** La web de brokergy.es (repo aparte, `brokergy-web`) pinta la ficha de cada instalador pidiendo
DESDE EL NAVEGADOR `GET /api/public/marketplace/red/:slug/pagina` y las fotos `/api/public/marketplace/foto/:id`
(fase 3 de la app del instalador). Su sesión midió que producción contestaba **500** a cualquier petición
con `Origin: https://brokergy.es`.

**La causa.** El `origin` de `cors` en `server.js` hacía `cb(new Error('CORS: origin … not allowed'))` con
todo lo que no fuera la app. No hay manejador de errores en Express, así que el Error acababa en el de por
defecto: **500** con su página HTML. La ruta no llegaba a ejecutarse (eso estaba bien), pero el navegador
veía un fallo del servidor en vez de un «no». Reproducido en
[test_cors_web.js](implementation/backend/scripts/test_cors_web.js) con el CORS de antes copiado tal cual.

**REGLA — el CORS de la API lo decide `crearCors` en [utils/corsOrigenes.js](implementation/backend/utils/corsOrigenes.js),
y brokergy.es solo LEE el marketplace: GET/HEAD, sin credenciales y solo bajo `/api/public/marketplace/`.**

| Origen | Qué recibe |
|---|---|
| Sin `Origin` (servidor a servidor), `FRONTEND_URL`, `CERTAPP_URL`, `http://localhost…`, LAN privada fuera de producción | Lo de siempre: cualquier método, `Access-Control-Allow-Credentials: true` |
| `https://brokergy.es`, `https://www.brokergy.es` → GET/HEAD (y su preflight) a `/api/public/marketplace/…` | Su `Allow-Origin`, **sin credenciales**, `Vary: Origin` |
| Esos dos orígenes en cualquier otra ruta o método (el `POST /lead`, `/api/oportunidades`…) | Como un desconocido |
| Un origen desconocido | **403 `ORIGEN_NO_PERMITIDO`**, sin cabeceras de CORS; la ruta no se ejecuta |

Decisiones:

- **No va en `FRONTEND_URL`**: es la base de los enlaces del CRM y además daría credenciales y todos los
  métodos a la web. Mismo motivo que el de `CERTAPP_URL` ([desplegar-cee-brokergy-es.md](docs/conocimiento/certificadores-app/desplegar-cee-brokergy-es.md)).
- **El desconocido, 403 y no «pasar sin cabeceras»**: con un `cb(null, false)` la ruta se ejecutaría y
  un POST simple desde otra web llegaría al servidor (el navegador solo impide LEER la respuesta). El 403
  conserva el bloqueo de antes con un código que dice la verdad.
- La comparación es EXACTA (`http://brokergy.es`, `https://brokergy.es.otra.cosa` o `null` no valen) y el
  prefijo lleva la barra (`/api/public/marketplacex` no cuela).
- `Vary: Origin` siempre: `/red/:slug/pagina` va con `Cache-Control: public, max-age=300` y una caché
  intermedia no debe servir la respuesta de un origen a otro.

Tras tocarlo: `node implementation/backend/scripts/test_cors_web.js` (58) y `auditar_rutas_sin_guardian.js`.
