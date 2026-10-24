<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## Desplegar cee.brokergy.es (2026-10-24)

La app de certificadores sale en el MISMO despliegue que el CRM (`scripts/deploy.sh`): el build de
`implementation/frontend` genera las dos entradas (`index.html` y `certificadores.html`) y el backend
lleva sus rutas. Lo que se hace UNA vez:

| Paso | Quién | Cómo |
|---|---|---|
| 1. Tablas | persona en el panel de Supabase (editor SQL) | pegar [certapp_schema.sql](implementation/backend/scripts/certapp_schema.sql); es idempotente. No hay ejecutor de SQL en el repo |
| 2. DNS | Fran, en el proveedor del dominio | registro **A** `cee` → `187.77.93.213`; comprobar con `nslookup cee.brokergy.es` |
| 3. Variables del backend | `.env` del VPS (`/opt/brokergy/implementation/backend/.env`) | las `CERTAPP_*` de la tabla de «La app de certificadores», y `CERTAPP_TOKEN_SECRET` propio (`openssl rand -hex 32`): en producción sin él lo que firma tokens falla cerrado |
| 4. nginx + certificado | VPS | los dos bloques de [nginx/cee.brokergy.es.conf](nginx/cee.brokergy.es.conf): primero el :80, `certbot certonly --webroot -w /var/www/certbot -d cee.brokergy.es`, luego el :443. Copia de seguridad del nginx.conf antes (`nginx.conf.bak.pre-cee.<fecha>`), `nginx -t` y reload |
| 5. Código | como siempre | probado en local → `git push origin main` → `bash scripts/deploy.sh` |
| 6. Comprobar | | `https://cee.brokergy.es` (landing), `/beta` (alta de prueba y borrarla), `/entrar` con una cuenta de prueba |

**REGLA — el nginx.conf del VPS no está en git**: se edita allí, con copia de seguridad fechada al
lado (es lo que se ha hecho con qr, factura y hostelería), y la copia de referencia del bloque vive en
`nginx/cee.brokergy.es.conf`. Si se cambia uno, se cambia el otro.

**REGLA — `index certificadores.html` en ese server**: con `try_files $uri $uri/ …` y el `index` por
defecto, la raíz `/` serviría el `index.html` del CRM en el subdominio.

**REGLA — el CORS de cee.brokergy.es sale de `CERTAPP_URL`, nunca de `FRONTEND_URL`**: aunque `/api/`
cuelgue del mismo host, el navegador manda `Origin` en cada POST y el backend corta lo que no está en
su lista. `FRONTEND_URL` es además la base de los enlaces del CRM (~55 sitios): añadirle el subdominio
cambiaría los enlaces de los emails. [server.js](implementation/backend/server.js) suma el origen de
`CERTAPP_URL` (por defecto `https://cee.brokergy.es`); en local, `CERTAPP_URL=http://localhost:5173`.

**REGLA — un certificador de la app NO entra en el CRM** (2026-10-24): tiene sesión de Supabase pero
ninguna fila en `usuarios`, y `enforceAuth` le respondía como a uno más en las ~100 rutas que no miran el
rol. Ahora `enforceAuth` y `GET /api/usuarios/me` cortan con **403 `SIN_PERFIL_CRM`** a toda sesión sin
perfil ([middleware/auth.js](implementation/backend/middleware/auth.js)). Medido antes de cambiarlo:
ninguna cuenta de Auth estaba sin perfil (el robot de Claude tiene el suyo). Sus rutas van por
`certappOnly` y la envolvente `ext` por `internoOExtSuyo`, que no pasan por `enforceAuth`. Tras tocarlo:
`node implementation/backend/scripts/test_rutas_sin_sesion.js` (casos `tok-ext`).
