<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app de certificadores — cee.brokergy.es (2026-10-24)

Lo pidió Fran: una aplicación **independiente del CRM pero hecha con sus piezas**, para que otros
certificadores energéticos (autónomos y empresas tipo Fessa) hagan sus CEE con lo que BROKERGY ya
tiene —las skills de generar el CEE inicial, la envolvente, el Catastro, los cuestionarios— y para
monetizarla. Las ideas de partida están en `C:\Proyectos\IDEAS PARA APP EXTENRA CEE.docx`. Nombre
comercial: **pendiente** (en el código, la constante `NOMBRE_APP` de `src/certificadores/marca.js`).

### El flujo

1. **Lista de espera de la beta** (pública): `cee.brokergy.es/` y `/beta`. Preguntas: perfil
   (autónomo · empresa con técnicos · empresa que subcontrata), CEE al mes, tiempo por CEE, tiempo en
   presentarlo, interés en que una IA lo presente, lo que paga por CEE si subcontrata, programa,
   comunidades. BROKERGY aprueba y se crea la cuenta (`/activar?token=` para poner la contraseña).
2. **Panel del certificador** → «Nueva obra»: referencia catastral (o dirección, mapa, GPS) →
   «Traer datos del Catastro» (superficie, año, uso, dirección, vivienda dentro del edificio) →
   titular (opcional al principio) → **«¿Estás en la vivienda?»** → el cuestionario.
3. **El cuestionario** (fuente única: [cuestionario.js](implementation/frontend/src/certificadores/logic/cuestionario.js)):
   para qué es el CEE, tipo de vivienda, lo que la rodea (medianeras, garajes, patios, terreno,
   cubierta), ventanas, calefacción, ACS, refrigeración, renovables y medidas de mejora sugeridas.
   Al elegir un equipo salen sus fotos (equipo + placa): **subir ahora, después o usar uno genérico**.
4. **Barrido** al pulsar «Generar certificado»: lo que bloquea y lo que solo empeora el resultado.
   Lo calcula `barrido()` en el navegador y otra vez en el servidor.
5. **Generar**: descuenta el crédito DE LA OBRA, la obra pasa a EN_PREPARACION (y sus datos se congelan), avisa a BROKERGY (WhatsApp +
   email) y —con `CERTAPP_IA_AUTO=true`— se lo encarga al Claude del WhatsApp por la cola de siempre
   (`cee_ia_trabajos`, negocio `ext`). Al certificador: «lo estamos preparando, te avisamos».
6. **Entrega**: el `.cex`, el XML, el PDF y el croquis en SU carpeta de Drive (compartida solo con su
   email) + el enlace a la envolvente. BROKERGY pulsa «Entregar» en el admin (o sola con
   `CERTAPP_ENTREGA_AUTO=true`): obra LISTO y aviso al certificador por email y WhatsApp.
7. **Validar**: con el PDF tal cual, o cambiando cosas en la envolvente y validando allí (se vuelve a
   generar). **Lo que se cambie a mano en el `.cex` con CE3X no vuelve a la envolvente**: se le dice.

Vistas: **CERTIFICADOR** (panel, obras, perfil), **CLIENTE** (`/subir/:obraId?token=`: el
propietario sube fotos sin cuenta) y **ADMIN** (`/admin`, ADMIN de BROKERGY: lista de espera,
cuentas y créditos, obras, entregas, sugerencias).

### Arquitectura

| Qué | Dónde |
|---|---|
| Esquema (tablas `certapp_*`, RPC, cola `ext`) | [scripts/certapp_schema.sql](implementation/backend/scripts/certapp_schema.sql) |
| Quién llama (guardianes `certappOnly`, `certappOAdmin`, `obraDeLaCuenta`) | [middleware/certappAuth.js](implementation/backend/middleware/certappAuth.js) |
| Cuestionario, fotos, barrido, resumen para la IA | [src/certificadores/logic/cuestionario.js](implementation/frontend/src/certificadores/logic/cuestionario.js) |
| API pública (beta, activar, recuperar, fotos del cliente) | `routes/certappPublic.js` → `/api/public/certapp` |
| API del certificador | `routes/certapp.js` → `/api/certapp` |
| API del admin | `routes/certappAdmin.js` → `/api/certapp-admin` |
| Servicios | `services/certapp/*.js` |
| La app (segunda entrada de Vite) | `implementation/frontend/certificadores.html` + `src/certificadores/` |
| La envolvente para el certificador | `src/certificadores/envolvente/EnvolventeCertapp.jsx` + origen `ext` |
| nginx del subdominio | `nginx/cee.brokergy.es.conf` (copia de referencia; el del VPS no está en git) |

**REGLA — mismo repo, mismo backend, mismo Supabase; tablas propias.** Se reutiliza todo sin copiarlo
(un solo build, un solo despliegue), pero un certificador externo **no es un `usuarios`** (no entra en
el CRM; `internalOnly` deja pasar a CERTIFICADOR, que son los técnicos de BROKERGY) y sus obras **no
son `cee_directos`** (esa tabla dispara avisos al cliente, entrega automática, el radar del parte y la
facturación de BROKERGY). Sus obras son `certapp_obras`, con la MISMA forma que `cee_directos` en lo
que leen la envolvente y el generador.

**REGLA — el origen `ext` se ADAPTA, no se bifurca** (el mismo criterio que los CEE directos en la
envolvente): la obra se presenta como un CEE suelto de alcance único (`es_cee_directo` + `es_ext`) y
toda la persistencia pasa por un mapa central de orígenes (tabla, RPC). Número `{AAAA}EXT_{n}`, que
el generador reconoce por el formato. Un origen desconocido es un error, nunca 'cae' por defecto.

**REGLA — cada certificador toca SOLO lo suyo, y lo ajeno es 404.** Toda ruta con `:id` pasa por
`obraDeLaCuenta`. En la envolvente, un certificador externo solo entra con `origen=ext` y una obra
suya; el equipo interno, como siempre.

**REGLA — nada sale a terceros desde local.** Los avisos de la app (`services/certapp/avisos.js`)
nacen APAGADOS: sin `CERTAPP_AVISOS_ENABLED=true` se escriben en el log. Local escribe en la Supabase y
el Drive de producción.

**REGLA — el asistente va capado.** Modelo barato, sin herramientas, tope por cuenta y día y tope
global al mes (`CERTAPP_ASISTENTE_*`), y no ve nada de BROKERGY: su conocimiento es el de CE3X y el de
la propia app, no `docs/conocimiento`.

**REGLA — la carpeta de Drive se comparte con el EMAIL del certificador**, nunca «cualquiera con el
enlace»: dentro hay datos de su cliente. Y como **LECTOR** (24/10/2026): con escritura podía dejar en
«1. CEE» un `.cex` que luego abre CE3X en el equipo de BROKERGY.

### Contrato de la API

Todas las respuestas en JSON; errores `{ error, code }` (a veces con más campos: `motivo`,
`barrido`, `rechazados`, `revisiones`). `:id` = uuid de `certapp_obras`.

**Pública** (`/api/public/certapp`, sin sesión; cada ruta valida lo suyo):

| Ruta | Qué |
|---|---|
| `GET /beta/token` | → `{ token }`: el `form_token` del formulario (HMAC con la hora; `{seg}.{nonce}.{firma}`). Se pide al ABRIR el formulario. Límite por IP |
| `POST /beta` `{ …, form_token, web, turnstile_token? }` | Alta en la lista de espera. Honeypot `web` (relleno → `{ ok }` sin guardar), límite de 6/h por IP, y `form_token` de entre **3 s y 2 h** y de **un solo uso**: si no, 400 `FORM_TOKEN` con `motivo` `formato` · `firma` · `pronto` · `caducado` · `usado` (un 400 de un campo o un 503 no gastan el token). Turnstile solo si `TURNSTILE_ENABLED`, hay `TURNSTILE_SECRET_KEY` **y** llega `turnstile_token` (403 `CAPTCHA_FALLIDO`). Un email que ya estaba **no se pisa**. → SIEMPRE `{ ok: true }` (ya no hay `nueva`) |
| `GET /activar/:token` · `POST /activar` `{ token, password }` | Invitación: ver a quién es y poner la contraseña |
| `POST /recuperar` `{ email }` | Enlace para cambiar la contraseña: responde YA `{ ok }` y envía después |
| `GET /subir/:id?token=` | Vista CLIENTE: `{ obra: { …, cerrada, caduca_at }, apartados: [{ id, label, …, cubierto, ficheros }] }`. `ficheros` = solo lo que subió el PROPIETARIO; `cubierto` = un apartado de un solo archivo que ya tiene el del certificador. Token malo 404 `ENLACE_INVALIDO`; caducado **410 `ENLACE_CADUCADO`** |
| `POST /subir/:id/:slot?token=` (multipart `files`) | Subir con el enlace. 400 `SLOT_NO_APLICA` (apartado que no toca a esa vivienda) · **409 `YA_LO_TIENE_EL_CERTIFICADOR`** · 409 `OBRA_CERRADA` · 400 `TIPO_NO_ADMITIDO` (en DOC_*, solo PDF o fotos: nunca un `.cex`) |
| `GET /thumb/:id/:driveId?t=&sz=` | Miniatura con firma de MINIATURA (12 h); `sz` se lleva a 200/400/800 |
| `GET /fichero/:id/:driveId?t=` | Descarga con firma de FICHERO (12 h; la de miniatura no vale: 403) |

`/thumb` y `/fichero` llevan SIEMPRE `X-Content-Type-Options: nosniff`, `Content-Security-Policy:
default-src 'none'; sandbox` y un `Content-Type` de la lista (si no, `application/octet-stream`);
en línea solo imágenes y PDF, lo demás `Content-Disposition: attachment`.

**Tipos admitidos** (por los BYTES, no por la extensión ni el mimetype del navegador): fotos
jpg/png/webp/heic/heif; vídeo mp4/mov; en DOC_* además pdf y —solo el certificador— `.cex` y el XML
de un CEE. Fuera svg, html, gif, tif, bmp, webm, avi, mkv, dwg, doc… → 400 `TIPO_NO_ADMITIDO` con
`rechazados`.

**Certificador** (`/api/certapp`, `certappOnly` salvo `/me`):

| Ruta | Qué |
|---|---|
| `GET /me` (`certappOAdmin`) | `{ cuenta, esAdmin }` |
| `PUT /me` | Perfil (nombre, NIF, titulación, colegiado, teléfono, empresa…) |
| `GET /obras` | Lista (solo escalares: nº, nombre, dirección, estado, fechas) |
| `POST /obras` | Alta `{ ref_catastral?, titular?, en_vivienda? }` → `{ obra }`; crea la carpeta de Drive |
| `GET /obras/:id` | `{ obra, barrido, eventos, enlaces, revisiones: { hechas, max } }` (enlaces: pdf, cex, xml, croquis, carpeta, envolvente). En `eventos`, `por` es `certificador` · `cliente` · `BROKERGY` · `IA`: nunca el nombre de quién del equipo ni el motivo interno |
| `PUT /obras/:id` | Parcial: `titular`, columnas del inmueble, `en_vivienda`, `proposito`, `cuestionario` (saneado con `sanearCuestionario`). **Solo en BORRADOR**: si no, 409 `OBRA_CERRADA` (archivada: 409 `ARCHIVADA`) |
| `POST /obras/:id/catastro` `{ rc }` | El servidor trae del Catastro y rellena el inmueble (zona climática incluida). Solo en BORRADOR (409 `OBRA_CERRADA`) |
| `GET /obras/:id/docs` | `{ slots: { [slot]: [{ driveId, nombre, mime, link, thumb, subido_at }] } }` |
| `POST /obras/:id/docs/:slot` | multipart `files` → Drive «4. DOCUMENTACIÓN PARA CEE» + `certapp_docs_append`. El nombre y el tipo, los detectados por los bytes |
| `DELETE /obras/:id/docs/:slot/:driveId` | Quitar un fichero del apartado |
| `POST /obras/:id/enlace-cliente` | `{ url, caduca_at }`: el enlace vigente del propietario, o uno NUEVO si no había o había caducado (`CERTAPP_PORTAL_DIAS`, 30) |
| `POST /obras/:id/enlace-cliente/rotar` | `{ url, caduca_at }`: enlace nuevo; el anterior deja de valer en el acto (evento `ENLACE_ROTADO`) |
| `GET /obras/:id/barrido` | El barrido del servidor |
| `POST /obras/:id/generar` `{ genericos? }` | 422 `{ barrido }` si bloquea · 402 `SIN_CREDITOS` · 409 `YA_PEDIDO` · → `{ ok, obra, creditos }`. Gasta el crédito DE ESA OBRA (si ya lo tenía gastado, no cobra otra vez) |
| `POST /obras/:id/validar` | LISTO → VALIDADO |
| `POST /obras/:id/revisar-de-nuevo` `{ nota }` | Tras tocar la envolvente: pide regenerar (aviso a BROKERGY) sin cambiar ningún dato. Máximo `CERTAPP_REVISIONES_MAX` (2) por obra: luego **409 `SIN_REVISIONES`** `{ revisiones: { hechas, max } }`. → `{ ok, obra, revisiones }` |
| `POST /feedback` `{ tipo, texto, pantalla, obra_id? }` | Botón de sugerencias |
| `POST /asistente` `{ mensajes, obra_id? }` · `GET /asistente/cupo` | Asistente capado |

**Admin** (`/api/certapp-admin`, `adminOnly`): `GET /resumen` · `GET /beta` · `PATCH /beta/:id` ·
`POST /beta/:id/invitar { creditos }` (crea la cuenta y devuelve el enlace de activación) ·
`GET /cuentas` · `POST /cuentas` · `PATCH /cuentas/:id { creditos, estado }` · `GET /obras` ·
`GET /obras/:id` (eventos con `por_detalle` y `nota_interna`, que SOLO ve el admin; `enlace_cliente`
solo si está vigente, con `enlace_cliente_caduca_at`) · `POST /obras/:id/pedir-ia` ·
`POST /obras/:id/entregar` · `POST /obras/:id/enlace-cliente/rotar` →`{ url, caduca_at }` ·
`POST /obras/:id/devolver-credito { motivo }` (el motivo va a la nota interna; sin crédito gastado o
ya devuelto, **409 `SIN_CREDITO_GASTADO`**) · `GET /feedback` · `PATCH /feedback/:id`.

**Códigos nuevos (24/10/2026):** 400 `FORM_TOKEN` (+`motivo`) · 409 `OBRA_CERRADA` (también en PUT y
catastro) · 409 `SIN_REVISIONES` · 410 `ENLACE_CADUCADO` · 409 `YA_LO_TIENE_EL_CERTIFICADOR` · 400
`SLOT_NO_APLICA` · 409 `SIN_CREDITO_GASTADO` · 503 `CERTAPP_SIN_SECRETO` (producción sin
`CERTAPP_TOKEN_SECRET`). Las columnas que falten en la BD también dan 503 `CERTAPP_SIN_TABLAS`.

### Seguridad del backend (revisión del 24/10/2026)

Lo de la envolvente y el generador está en [seguridad-de-la-app.md](docs/conocimiento/certificadores-app/seguridad-de-la-app.md);
esto es lo de las rutas `certapp*` y `services/certapp/`:

**REGLA — el tipo de un fichero sale de sus BYTES y se sirve sin poder ejecutarse** ([tipos.js](implementation/backend/services/certapp/tipos.js)):
un SVG subido como «foto.jpg» era un XSS en el origen de la app. Lista permitida arriba; `/fichero` y
`/thumb` con nosniff, CSP sandbox y `attachment` para lo que no sea imagen o PDF.

**REGLA — pedida la obra, la vivienda, el titular y el cuestionario se CONGELAN** (`obras.exigirBorrador`,
y el update condicionado a `estado = BORRADOR`): con un crédito no se certifica otra casa. «Revisar de
nuevo» no cambia datos y tiene un máximo por obra (contador `revisiones`).

**REGLA — el crédito va LIGADO A LA OBRA** (`credito_consumido`): solo lo cambian las RPC
`certapp_consumir_credito_obra` / `certapp_devolver_credito_obra`, en una transacción con el saldo;
devolver apunta `CREDITO_DEVUELTO` y no se puede dos veces. Las RPC por cuenta se retiraron.

**REGLA — la IP de los límites es la de verdad**: `X-Real-IP` (la pone nginx con `$remote_addr`) si el
que conecta es la red interna de Docker; si no, la del socket. **Nunca** la primera de
`X-Forwarded-For`, que la escribe el cliente. Los limitadores en memoria se limpian cada 10 minutos.

**REGLA — la beta no se puede usar para mandar correo ni para pisar a otro**: `form_token` firmado con
la hora (sin depender de Turnstile), nombre saneado antes de ir al email, tope global de
`CERTAPP_BETA_EMAILS_DIA` confirmaciones al día y WhatsApp al equipo agrupados pasadas
`CERTAPP_BETA_AVISOS_DIA` altas. Un email que ya estaba solo rellena lo vacío; lo demás queda en
`respuestas.revisiones` (RPC `certapp_beta_apuntar`) y la respuesta es la misma.

**REGLA — el enlace del propietario caduca** (`portal_token_at` + `CERTAPP_PORTAL_DIAS`) y se rota; el
propietario solo ve lo que subió él, no sube `.cex` ni reemplaza o manda a la papelera lo del
certificador. Firmas distintas para miniatura y para fichero.

**REGLA — lo interno no llega al certificador**: en sus eventos `por` es `BROKERGY` (o `IA`); quién del
equipo y el motivo van en `por_detalle` / `nota_interna`, que solo devuelve el admin.

**REGLA — sin `CERTAPP_TOKEN_SECRET` en producción, la app se cierra** (503 `CERTAPP_SIN_SECRETO` y
aviso al arrancar): nunca se firma con una clave del repo.

Tras tocarlo: `node implementation/backend/scripts/test_certapp_unidad.js`,
`node implementation/backend/scripts/test_certapp_rutas.js` y
`node implementation/backend/scripts/auditar_rutas_sin_guardian.js` (sin BD ni Drive).
`test_certapp_bd.js` escribe en la Supabase de producción: solo con el SQL aplicado y con permiso.

### Variables de entorno (backend)

| Variable | Qué | Local | Producción |
|---|---|---|---|
| `CERTAPP_URL` | Base de los enlaces **y origen admitido por el CORS** (`server.js`) | `http://localhost:5173` | `https://cee.brokergy.es` |
| `CERTAPP_DRIVE_ROOT_ID` | Carpeta raíz de Drive de la app («APP CERTIFICADORES (cee.brokergy.es)») | la misma (local = Drive de producción) | `1gJFbLEDT70dkwt1OR8VMqkk0gb7sEmrM` |
| `CERTAPP_AVISOS_ENABLED` | WhatsApp y email de verdad | **apagado** | `true` |
| `CERTAPP_IA_AUTO` | Encargar solo al Claude del WhatsApp | apagado | según la beta |
| `CERTAPP_ENTREGA_AUTO` | Entregar al certificador sin revisar | apagado | apagado en la beta |
| `CERTAPP_CREDITOS_BETA` | Créditos al invitar | 5 | 5 |
| `CERTAPP_ASISTENTE_ENABLED` · `_MODELO` · `_MAX_DIA` · `_TOPE_USD_MES` | El asistente y sus topes | apagado | `true` · Haiku · 20 · 30 |
| `CERTAPP_TOKEN_SECRET` | Clave de TODAS las firmas (activar, recuperar, miniaturas, ficheros, `form_token`). **Obligatoria en producción**: sin ella, 503 | la del `.env` | 64 hex al azar (`openssl rand -hex 32`) |
| `CERTAPP_PORTAL_DIAS` | Días que vale el enlace del propietario | 30 | 30 |
| `CERTAPP_REVISIONES_MAX` | «Revisar de nuevo» por obra | 2 | 2 |
| `CERTAPP_BETA_EMAILS_DIA` · `CERTAPP_BETA_AVISOS_DIA` | Tope de confirmaciones de la beta al día · WhatsApp al equipo uno por alta hasta… | 40 · 10 | 40 · 10 |
