<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app de certificadores — cee.brokergy.es (2026-10-24)

Lo pidió Fran: una aplicación **independiente del CRM pero hecha con sus piezas**, para que otros
certificadores energéticos (autónomos y empresas tipo Fessa) hagan sus CEE con lo que BROKERGY ya
tiene —las skills de generar el CEE inicial, la envolvente, el Catastro, los cuestionarios— y para
monetizarla. Las ideas de partida están en `C:\Proyectos\IDEAS PARA APP EXTENRA CEE.docx`. Nombre
comercial: **«CEE by BROKERGY»** (decidido con Fran el 24/10/2026; en el código, `NOMBRE_APP` de
`src/certificadores/marca.js`).

### El flujo

1. **Alta en la beta** (pública): `cee.brokergy.es/` y `/beta`. Preguntas: perfil
   (autónomo · empresa con técnicos · empresa que subcontrata), CEE al mes, tiempo por CEE, tiempo en
   presentarlo, interés en que una IA lo presente, lo que paga por CEE si subcontrata, programa,
   comunidades, y aceptar las condiciones. **Desde el 24/10/2026 la cuenta se crea AL MOMENTO**, con
   Google o con un enlace al email, y trae 1 certificado gratis: ver
   [alta-directa-google-y-email.md](docs/conocimiento/certificadores-app/alta-directa-google-y-email.md).
   La invitación a mano desde el admin (`/activar?token=` para poner la contraseña) sigue existiendo.
2. **Panel del certificador** → «Nueva obra»: referencia catastral (o dirección, mapa, GPS) →
   «Traer datos del Catastro» (superficie, año, uso, dirección, vivienda dentro del edificio) →
   titular (opcional al principio) → **«¿Estás en la vivienda?»** → la ficha.
3. **La ficha, por FASES** (desde el 25/10/2026; antes, un cuestionario largo): la vivienda · el
   titular · para qué es (varios a la vez) · las fotos · **«Lo que ha visto la IA»** (gratis: el
   Catastro, su época, las fotos y Street View deducen lo que pueden, cada dato con su origen, y el
   certificador confirma o contesta las dudas) · pedir el certificado. Todo en
   [lo-que-ha-visto-la-ia.md](docs/conocimiento/certificadores-app/lo-que-ha-visto-la-ia.md). Fuente
   única de preguntas, orígenes y deducciones: [cuestionario.js](implementation/frontend/src/certificadores/logic/cuestionario.js).
   Al elegir un equipo salen sus fotos (equipo + placa): **subir ahora, después o usar uno genérico**
   (en una bomba de calor, con la antigüedad de CE3X). Las fotos opcionales llevan su chip y «Ahora
   no»: [fotos-opcionales-y-equipo-generico.md](docs/conocimiento/certificadores-app/fotos-opcionales-y-equipo-generico.md).
4. **Barrido** al pedir el certificado. **Solo bloquea** la referencia catastral, la dirección, el
   nombre del titular y «para qué»; lo demás es un aviso («la IA completará N cosas»). Lo calcula
   `barrido()` en el navegador y otra vez en el servidor.
5. **Generar**: descuenta el crédito DE LA OBRA, la obra pasa a EN_PREPARACION (y sus datos se congelan), avisa a BROKERGY con
   **un solo mensaje de encargo** (WhatsApp + email) y —con `CERTAPP_IA_AUTO=true`— se lo encarga al Claude del WhatsApp por la
   cola de siempre (`cee_ia_trabajos`, negocio `ext`), **en silencio**; el `.cex` lo califica después el PC de Fran con CE3X y,
   hecho, llega al equipo «✅ CEE listo para revisar». Al certificador: «lo estamos preparando, te avisamos». Todo el circuito en
   [el-cee-de-una-obra-encargo-calificacion-entrega-y-firma.md](docs/conocimiento/certificadores-app/el-cee-de-una-obra-encargo-calificacion-entrega-y-firma.md).
6. **Entrega**: el `.cex`, el XML, el PDF y el croquis en SU carpeta de Drive (compartida solo con su
   email) + el enlace a la envolvente. BROKERGY pulsa «Entregar» en el admin (o sola con
   `CERTAPP_ENTREGA_AUTO=true`): obra LISTO y aviso al certificador por email y WhatsApp (la obra y la envolvente).
7. **Validar y firmar**: con el PDF tal cual (lo firma en la app con AutoFirma: firmar es validar), o cambiando cosas en la
   envolvente (se vuelve a generar). Si lo termina en su CE3X, sube el XML o el PDF definitivos. **Lo que se cambie a mano en
   el `.cex` con CE3X no vuelve a la envolvente**: se le dice.

Vistas: **CERTIFICADOR** (panel, obras, perfil, `/incidencias`, `/gastos`), **CLIENTE** (`/subir/:obraId?token=`: el
propietario sube fotos sin cuenta) y **ADMIN** (`/admin`, ADMIN de BROKERGY: lista de espera,
cuentas y créditos, obras, entregas, incidencias —la ruta sigue siendo `/admin/sugerencias`—).

### Incidencias y sugerencias (24/10/2026)

Lo pidió Fran: «que el certificador nos pueda dejar incidencias para mejorar, tanto en cada CEE porque
puede haber algo puntual como en general en la app». No se rehízo nada: se **amplió el buzón
`certapp_feedback`** que ya existía (botón flotante de sugerencias), porque el problema no era recoger
—eso ya funcionaba— sino que el certificador **no veía qué había pasado con lo que mandó** y no podía
decir «esto, en ESTE certificado».

- **En la ficha de cada obra** (también en la cerrada): «¿Algo mal en este certificado? Avísanos»
  abre el mismo formulario con la obra puesta y el tipo ERROR, y debajo, lo que ya nos ha contado de
  esa obra. El botón flotante pasa a llamarse **«Incidencias y sugerencias»** y es GENERAL (sin
  obra; la pantalla sí se guarda).
- **«Mis incidencias»** (`/incidencias`, en el menú): fecha, tipo, texto, nº de obra, estado y la
  respuesta. `?id=` lleva a una y la resalta (es el enlace del email).
- **Estados en palabras llanas** (el certificador nunca ve los códigos): NUEVA = Recibida · VISTA =
  En revisión · HECHA = Resuelta · DESCARTADA = Cerrada. Contestar una NUEVA la pasa sola a VISTA.
- **Respuesta desde el admin** (pestaña «Incidencias»): estado + respuesta; al guardar una respuesta
  NUEVA se le avisa por email (`avisos.avisarPersona` + `plantilla`, botón «Ver mis incidencias»),
  salvo que se desmarque «Avisarle por email». En local, en seco como todos los avisos.
- Columnas `respuesta_at` y `respuesta_por` (al final de `certapp_schema.sql`). `respuesta_por` (quién
  del equipo) **no** llega al certificador. Lógica común en `services/certapp/incidencias.js`.

### Mis gastos (24/10/2026)

Lo pidió Fran: «que puedan ver el gasto que llevan en qué expedientes». En la beta los certificados son
de regalo y la pasarela de pago vendrá después, pero el libro se monta ya para que, cuando se cobre,
cada compra y cada certificado gastado tengan su sitio sin rehacer nada.

- **`certapp_movimientos`** (al final de `certapp_schema.sql`): una fila por cada certificado que entra o
  sale, con `saldo_despues`. Tipos: **ALTA** (los de regalo al crear la cuenta) · **COMPRA** (pasarela,
  más adelante: `importe_eur`, `factura_id`) · **GASTO** (−1 al pedir una obra) · **DEVOLUCION** (+1 si no
  se ha podido hacer) · **AJUSTE** (lo que el admin pone a mano).
- **REGLA — el saldo de verdad sigue siendo `certapp_cuentas.creditos`**; el libro es su historia.
  **GASTO y DEVOLUCION los apuntan las propias RPC** (`certapp_consumir_credito_obra` /
  `certapp_devolver_credito_obra`, `create or replace` con la MISMA firma y los mismos -1/-2) en la misma
  transacción que el saldo: no puede quedar un crédito gastado sin su fila. Desde Node,
  `services/certapp/movimientos.js` → `apuntar()` para ALTA (lo llaman `cuentas.crearCuenta`, `altaDirecta` y `altaConSesion`) y AJUSTE
  (`PATCH /api/certapp-admin/cuentas/:id`, por la diferencia); `apuntar()` nunca lanza: si falla, log
  y sigue (el saldo ya está cambiado).
- **`por`** (quién: `certificador`, el email del admin, `automático`) es interno: la API del certificador
  no lo devuelve. La nota interna de una devolución tampoco va al movimiento.
- Las cuentas que ya existían reciben su historia al pasar el SQL (un ALTA con lo recibido y un GASTO por
  cada obra con el crédito gastado), solo si no tenían ninguna fila: se puede volver a pasar.
- **Pantalla `/gastos`** (menú «Mis gastos»; el contador de créditos de la barra lleva aquí): arriba,
  disponibles · usados · recibidos gratis · gastado en € (en la beta, «0 €» dicho en claro); un hueco
  «Comprar certificados — muy pronto» sin pasarela; debajo, cada movimiento con fecha, concepto, la obra
  (nº y dirección, enlace a su ficha), +/− y lo que quedaba.
- Las cifras salen del saldo de la cuenta y de TODAS sus compras, no de la página de la lista:
  `recibidos_gratis = disponibles + usados − comprados`.

### La landing en el ordenador (25/10/2026)

Fran: «mejora la página principal para que en versión PC se vea mucho mejor». Hasta ese día la landing
era la columna del móvil (560 px) centrada en una pantalla de 1440: mucho vacío y nada que enseñar.

- Desde **1024 px** el contenedor `.ca-land` se abre a 1200 px: portada a dos columnas (titular a 60–80 px
  y, a la derecha, el **vídeo promo**; hasta el 26/10 era una maqueta estática del CEE entregado), una
  franja de cuatro hechos, los pasos en cuatro tarjetas (2×2 entre 1024 y 1199), entrega y «para quién»
  lado a lado, las dudas con su título fijo a la izquierda y la llamada final en una fila.
- Lo que solo existe en el PC lleva **`.ca-solo-ancho`** (oculto por debajo de 1024). Los títulos grandes de
  cada sección son de ese tipo: en el móvil manda la etiqueta pequeña de siempre.
- **REGLA — los textos de la landing dicen solo lo que la app hace**: ni cifras, ni testimonios, ni
  una referencia catastral o un cliente de verdad.
- La palabra en lima del titular va **por debajo** del texto (`.ca-hero .ca-mark{z-index:-1}`): su fondo
  tapaba los rabos de «preparado» en la línea de arriba, también en el móvil.
- Junto al logo, la etiqueta **«Certifica con IA»** (`EtiquetaIa` en `ui/piezas.jsx`, la usan la cabecera
  pública y la barra de la app): píldora negra con la chispa en lima. Antes era «CEE con IA» en gris; Fran
  la quería «más rompedora, con más punch» (26/10/2026). En el móvil solo se ve en la cabecera pública.
- Comprobación: capturas a 1440, 1024 y 390 px sin scroll horizontal.

### El vídeo promo (26/10/2026)

Fran: «un vídeo promo, tipo tutorial, para la landing, donde se vea un móvil y los pasos, para campañas».
Vertical 9:16, 30 s, **sin sonido** (solo textos), con las pantallas **recreadas con los componentes y el
CSS de la app** y los datos de demo (`dev/demo.js`): nada de una obra o un cliente de verdad.

- Se hace con **Remotion** en [implementation/promo-video](implementation/promo-video/LEEME.md). Importa el
  `CSS` de `ui/estilo.js` y los iconos de la app: si cambia el aspecto de la app, se vuelve a renderizar.
- Guion: «¿Te imaginas tener el .cex hecho sin pasar horas de gabinete?» → «Lo hemos hecho posible» →
  1 metes los datos de la obra → 2 contestas unas preguntas y subes las fotos → 3 se lo envías a la IA
  (aviso de WhatsApp) → 4 revisas el croquis y lo firmas desde la web → «Tu primer certificado, gratis» +
  cee.brokergy.es. Va al lado del titular de la portada, así que **no repite** su «preparado por IA, tú lo
  revisas y lo firmas».
- **REGLA — el vídeo dice solo lo que la app hace**, como la landing: sin cifras de tiempo ni testimonios
  ni logos. Fran propuso «el certificado en menos de un minuto»: **no** se puso, porque no es verdad (el
  `.cex` se califica en el PC, que pasa cada 2 min, y el equipo lo entrega; ver
  [el CEE de una obra](docs/conocimiento/certificadores-app/el-cee-de-una-obra-encargo-calificacion-entrega-y-firma.md)).
  Si un día se mide de verdad, se cambia el gancho. Los botones dicen lo que dice la app («Validar y firmar
  con AutoFirma»).
- En la landing va en la **portada** (Fran, 26/10: «en la primera parte, es más llamativo»): a la derecha
  del titular en el PC (360 px de ancho) y debajo de los botones en el móvil. Fichero ligero (540×960,
  ~0,9 MB) en `frontend/public/certificadores/promo-cee.mp4` + póster `promo-cee.jpg` (el gancho, para que
  no salte al arrancar). Arranca al verse (IntersectionObserver) y se para al salir; con «reducir
  movimiento» no arranca solo y enseña los controles.
- Para anuncios, el bueno es el de 1080×1920 (`out/promo-cee-9x16.mp4`, no va a git: se renderiza).

### Arquitectura

| Qué | Dónde |
|---|---|
| Esquema (tablas `certapp_*`, RPC, cola `ext`) | [scripts/certapp_schema.sql](implementation/backend/scripts/certapp_schema.sql) |
| Quién llama (guardianes `certappOnly`, `certappOAdmin`, `obraDeLaCuenta`) | [middleware/certappAuth.js](implementation/backend/middleware/certappAuth.js) |
| Cuestionario, fotos, barrido, resumen para la IA | [src/certificadores/logic/cuestionario.js](implementation/frontend/src/certificadores/logic/cuestionario.js) |
| API pública (beta y alta, enlace para entrar, activar, recuperar, fotos del cliente) | `routes/certappPublic.js` → `/api/public/certapp` |
| Alta con sesión (Google) | `routes/certappAlta.js` → `/api/certapp/alta` (montada ANTES que `/api/certapp`) |
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

**REGLA — el arranque del CRM solo monta en SU página** ([src/main.jsx](implementation/frontend/src/main.jsx),
25/10/2026). La envolvente es del CRM, y Rollup deja en el trozo de entrada del CRM (`main-*.js`)
piezas que comparte con ella (37 módulos: cálculo, transmitancias, la pizarra…). Al abrirla en la app,
el navegador carga ese trozo, y con él el `createRoot` del CRM sobre el mismo `#root`: el CRM se
montaba encima de la app y la envolvente reventaba con «Failed to execute 'removeChild'» (Fran, al
abrirla desde el admin con la 2026EXT_2). En desarrollo no se ve: Vite sirve módulo a módulo. Por eso
`certificadores.html` lleva `<html data-app="certificadores">` y `main.jsx` no monta ni arranca el
puente nativo si lo ve. El coste: abrir la envolvente en la app baja también ese trozo (~1,8 MB
comprimido). Se comprueba con un build de producción (`vite build` + `vite preview`), cargando
`EnvolventeVentana-*.js` en `/certificadores.html`: `#root` sigue siendo el de la app.

**REGLA — cada certificador toca SOLO lo suyo, y lo ajeno es 404.** Toda ruta con `:id` pasa por
`obraDeLaCuenta`. En la envolvente, un certificador externo solo entra con `origen=ext` y una obra
suya; el equipo interno, como siempre.

**REGLA — nada sale a terceros desde local.** Los avisos de la app (`services/certapp/avisos.js`)
nacen APAGADOS: sin `CERTAPP_AVISOS_ENABLED=true` se escriben en el log. Local escribe en la Supabase y
el Drive de producción.

**REGLA — el asistente va capado.** Modelo barato, sin herramientas, tope por cuenta y día y tope
global al mes (`CERTAPP_ASISTENTE_*`), y no ve nada de BROKERGY: su conocimiento es el de CE3X y el de
la propia app, no `docs/conocimiento`.

**REGLA — el asistente sabe en qué pantalla está** (25/10/2026, [asistente.js](implementation/backend/services/certapp/asistente.js)):
el navegador manda `pantalla` (`menu` · `obra` · `envolvente`) y el servidor añade al system SOLO lo
de esa pantalla, leído de la obra SUYA: en `obra`, zona, año, superficie, respuestas con su origen y
lo que falta; en `envolvente`, lo dibujado (paredes, huecos por pared, m²; máx. 2500 caracteres); en
`menu`, solo la app. Siempre lleva la **tabla de U por defecto de CE3X 3.2**
(`transmitanciasCe3x.js`, la misma del CRM: periodos, zonas NBE, una fila por cerramiento) y sabe que
nuestros `.cex` van con la localidad «Otro». También está en la envolvente (solo el asistente, sin el
botón de incidencias, y con un hueco abajo para no tapar nada).
Haiku 5.5 con `effort: 'low'` y `max_tokens` 3000: con el razonamiento adaptativo por defecto, con
menos se quedaba pensando y volvía SIN texto (`stop_reason: max_tokens`); si pasa, se le dice «se me ha
ido el tiempo pensándolo». Medido: ~0,001 $ por pregunta.

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
| `POST /beta` `{ …, acepta_condiciones, form_token, web, turnstile_token? }` | Alta en la beta: guarda la solicitud y **crea la cuenta** (`cuentas.altaDirecta`, PENDIENTE, email con `/entrar?t=`); con `CERTAPP_ALTA_DIRECTA=false`, solo la lista de espera. Sin `acepta_condiciones`: 400 `FALTA_CONDICIONES`. Honeypot `web` (relleno → `{ ok }` sin guardar), límite de 6/h por IP, y `form_token` de entre **3 s y 2 h** y de **un solo uso**: si no, 400 `FORM_TOKEN` con `motivo` `formato` · `firma` · `pronto` · `caducado` · `usado` (un 400 de un campo o un 503 no gastan el token). Turnstile solo si `TURNSTILE_ENABLED`, hay `TURNSTILE_SECRET_KEY` **y** llega `turnstile_token` (403 `CAPTCHA_FALLIDO`). Un email que ya estaba **no se pisa**. → SIEMPRE `{ ok: true }` (ya no hay `nueva`) |
| `GET /activar/:token` · `POST /activar` `{ token, password }` | Invitación: ver a quién es y poner la contraseña |
| `POST /recuperar` `{ email }` | Enlace para cambiar la contraseña: responde YA `{ ok }` y envía después |
| `POST /enlace` `{ email }` | «Mándame un enlace para entrar» (1 h). SIEMPRE `{ ok }`, haya cuenta o no. Límite por IP |
| `POST /enlace/canjear` `{ token }` | Token `e` → `{ ok, email, token_hash }` para `verifyOtp` en el navegador. Un uso (rota el nonce): usado 400 `TOKEN_INVALIDO`, caducado 410 `TOKEN_CADUCADO` |
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
| `POST /alta` (`certappSesion`: sesión de Supabase, con o sin cuenta) | Alta con Google: el formulario de la beta → `cuentas.altaConSesion` (email de la sesión) → 201 `{ ok, cuenta, nueva: true }`; si ya tenía cuenta, 200 `nueva: false`. 400 `FALTA_CONDICIONES` · 403 `EMAIL_SIN_CONFIRMAR` · 409 `CUENTA_YA_EXISTE` · 429 |
| `GET /me` (`certappOAdmin`) | `{ cuenta, esAdmin }`. Sesión sin cuenta: 403 `CERTAPP_SIN_CUENTA` (el frontend la lleva al formulario). `cuenta` trae además `comunidades`, `software`, `condiciones` y `telefono_por_confirmar` |
| `PUT /me` | Perfil (nombre, NIF, titulación, colegiado, teléfono, empresa…, `comunidades` y `software`, a `prefs.perfil`). Guardar el teléfono limpia `telefono_por_confirmar` |
| `GET /obras` | Lista (solo escalares: nº, nombre, dirección, estado, fechas) |
| `POST /obras` | Alta `{ ref_catastral?, titular?, en_vivienda? }` → `{ obra }`; crea la carpeta de Drive |
| `GET /obras/:id` | `{ obra, barrido, eventos, enlaces, cee, revisiones: { hechas, max } }` (enlaces: pdf, firmado, cex, xml, croquis, carpeta, envolvente; `cee`: `{ calificacion, firma }` con la obra entregada). En `eventos`, `por` es `certificador` · `cliente` · `BROKERGY` · `IA`: nunca el nombre de quién del equipo ni el motivo interno |
| `PUT /obras/:id` | Parcial: `titular`, columnas del inmueble, `en_vivienda`, `proposito`, `cuestionario` (saneado con `sanearCuestionario`: también `propositos`, `fases_ok`, `origen` y `visto_ia`; la columna `proposito` = el primero de `propositos`). **Solo en BORRADOR**: si no, 409 `OBRA_CERRADA` (archivada: 409 `ARCHIVADA`) |
| `POST /obras/:id/visto-ia` | «Lo que ha visto la IA»: mira las fotos (o Street View) y PROPONE `{ at, propuesta, dudas, fuentes, uso }`; no escribe en la obra. Solo en BORRADOR. Topes y códigos en [lo-que-ha-visto-la-ia.md](docs/conocimiento/certificadores-app/lo-que-ha-visto-la-ia.md) |
| `GET /municipios?prov=NN` | Los municipios de una provincia (la dirección del perfil, en cascada comunidad → provincia → municipio). Provincia mala: 400 `PROVINCIA_INVALIDA` |
| `POST /obras/:id/catastro` `{ rc }` | El servidor trae del Catastro y rellena el inmueble (zona climática incluida). Solo en BORRADOR (409 `OBRA_CERRADA`) |
| `GET /obras/:id/docs` | `{ slots: { [slot]: [{ driveId, nombre, mime, link, thumb, subido_at }] } }` |
| `POST /obras/:id/docs/:slot` | multipart `files` → Drive «4. DOCUMENTACIÓN PARA CEE» + `certapp_docs_append`. El nombre y el tipo, los detectados por los bytes |
| `DELETE /obras/:id/docs/:slot/:driveId` | Quitar un fichero del apartado |
| `POST /obras/:id/enlace-cliente` | `{ url, caduca_at }`: el enlace vigente del propietario, o uno NUEVO si no había o había caducado (`CERTAPP_PORTAL_DIAS`, 30) |
| `POST /obras/:id/enlace-cliente/rotar` | `{ url, caduca_at }`: enlace nuevo; el anterior deja de valer en el acto (evento `ENLACE_ROTADO`) |
| `GET /obras/:id/barrido` | El barrido del servidor |
| `POST /obras/:id/generar` `{ genericos? }` | 422 `{ barrido }` si bloquea · 402 `SIN_CREDITOS` · 409 `YA_PEDIDO` · → `{ ok, obra, creditos }`. Gasta el crédito DE ESA OBRA (si ya lo tenía gastado, no cobra otra vez) |
| `POST /obras/:id/validar` | LISTO → VALIDADO |
| `GET /obras/:id/cee/para-firmar` · `POST /obras/:id/cee/firmado` · `POST /obras/:id/cee/definitivo` | Firmar el PDF con AutoFirma (firmar valida) y subir el XML o el PDF definitivos; el `.cex` no (415). En [el-cee-de-una-obra-encargo-calificacion-entrega-y-firma.md](docs/conocimiento/certificadores-app/el-cee-de-una-obra-encargo-calificacion-entrega-y-firma.md) |
| `POST /obras/:id/revisar-de-nuevo` `{ nota }` | Tras tocar la envolvente: pide regenerar (aviso a BROKERGY) sin cambiar ningún dato. Máximo `CERTAPP_REVISIONES_MAX` (2) por obra: luego **409 `SIN_REVISIONES`** `{ revisiones: { hechas, max } }`. → `{ ok, obra, revisiones }` |
| `POST /feedback` `{ tipo, texto, pantalla, obra_id? }` | Incidencia o sugerencia (`tipo` ERROR · MEJORA · SUGERENCIA · OTRO; con `obra_id`, una obra SUYA o 404) → 201 `{ ok, id, incidencia }`. Texto vacío: 400 `FALTA_TEXTO` |
| `GET /feedback[?obra_id=]` | → `{ incidencias: [{ id, created_at, tipo, texto, obra_id, numero_expediente, estado, respuesta, respuesta_at }] }`: SOLO las suyas (las 200 últimas). Obra ajena o id que no es uuid: 404 sin tocar la tabla |
| `GET /movimientos` | Mis gastos → `{ resumen: { disponibles, usados, comprados, recibidos_gratis, gastado_eur, compras_abiertas }, movimientos: [{ id, created_at, tipo, creditos, saldo_despues, importe_eur, concepto, factura_id, obra: { id, numero_expediente, direccion, municipio } \| null }] }`: SOLO los suyos (los 500 últimos), sin `por`. BD caída: 503 |
| `POST /asistente` `{ mensajes, obra_id?, pantalla? }` · `GET /asistente/cupo` | Asistente capado; `pantalla` ∈ `menu` · `obra` · `envolvente` (otra cosa se ignora: con obra, `obra`; sin ella, `menu`) |

**Admin** (`/api/certapp-admin`, `adminOnly`): `GET /resumen` · `GET /beta` · `PATCH /beta/:id` ·
`POST /beta/:id/invitar { creditos }` (crea la cuenta y devuelve el enlace de activación) ·
`GET /cuentas` · `POST /cuentas` · `PATCH /cuentas/:id { creditos, estado, concepto? }` (créditos = saldo
nuevo; si cambia, AJUSTE en Mis gastos por la diferencia → `{ cuenta, movimiento }`; el update va
condicionado al saldo leído: si entretanto ha gastado uno, **409 `CREDITOS_CAMBIADOS`**) · `GET /obras` ·
`GET /obras/:id` (eventos con `por_detalle` y `nota_interna`, que SOLO ve el admin; `enlace_cliente`
solo si está vigente, con `enlace_cliente_caduca_at`) · `POST /obras/:id/pedir-ia` ·
`POST /obras/:id/entregar` · `POST /obras/:id/enlace-cliente/rotar` →`{ url, caduca_at }` ·
`POST /obras/:id/devolver-credito { motivo }` (el motivo va a la nota interna; sin crédito gastado o
ya devuelto, **409 `SIN_CREDITO_GASTADO`**) · `GET /feedback[?estado=]` (con cuenta, obra,
`respuesta_por`) · `PUT /feedback/:id { estado?, respuesta?, avisar? }` (`PATCH`, alias) →
`{ feedback, aviso }`: sin nada que cambiar 400 `SIN_CAMBIOS`, estado raro 400 `ESTADO_INVALIDO`, 404 si
no existe; una respuesta nueva pone `respuesta_at`/`respuesta_por` y avisa por email salvo `avisar:false`.
`POST /interno/calificada { numero }` (`adminOInterno`: la clave interna o ADMIN): la llama el PC de Fran al terminar de
calificar con CE3X una obra ext; sin PDF o sin XML, 409 `SIN_CALIFICAR`; fuera de EN_PREPARACION y LISTO, `{ ok, omitido }`.
`GET /resumen` trae `drive.raiz_link` (la carpeta de todos los certificados).

**Códigos nuevos (24/10/2026):** 400 `FORM_TOKEN` (+`motivo`) · 409 `OBRA_CERRADA` (también en PUT y
catastro) · 409 `SIN_REVISIONES` · 410 `ENLACE_CADUCADO` · 409 `YA_LO_TIENE_EL_CERTIFICADOR` · 400
`SLOT_NO_APLICA` · 409 `SIN_CREDITO_GASTADO` · 409 `CREDITOS_CAMBIADOS` (admin) · 503 `CERTAPP_SIN_SECRETO` (producción sin
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
devolver apunta `CREDITO_DEVUELTO` y no se puede dos veces. Las RPC por cuenta se retiraron. Desde el
24/10/2026 las dos apuntan además su GASTO / DEVOLUCION en `certapp_movimientos` (Mis gastos).

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
| `CERTAPP_CREDITOS_BETA` | Créditos al darse de alta (y por defecto al invitar) | 1 | 1 |
| `CERTAPP_ALTA_DIRECTA` | El formulario de la beta crea la cuenta al momento. `false` = la lista de espera de antes | encendido (por defecto) | encendido (por defecto) |
| `CERTAPP_ASISTENTE_ENABLED` · `_MODELO` · `_MAX_DIA` · `_TOPE_USD_MES` | El asistente y sus topes | apagado | `true` · Haiku · 20 · 30 |
| `CERTAPP_VISTO_IA_ENABLED` · `_MAX_DIA` · `_MAX_OBRA` | «Lo que ha visto la IA»: `false` lo apaga (503); veces por cuenta y día · por obra. Usa `GEMINI_API_KEY` y, para Street View, `GOOGLE_MAPS_KEY` | encendido · 15 · 6 | encendido · 15 · 6 |
| `CERTAPP_TOKEN_SECRET` | Clave de TODAS las firmas (activar, recuperar, miniaturas, ficheros, `form_token`). **Obligatoria en producción**: sin ella, 503 | la del `.env` | 64 hex al azar (`openssl rand -hex 32`) |
| `CERTAPP_PORTAL_DIAS` | Días que vale el enlace del propietario | 30 | 30 |
| `CERTAPP_REVISIONES_MAX` | «Revisar de nuevo» por obra | 2 | 2 |
| `CERTAPP_BETA_EMAILS_DIA` · `CERTAPP_BETA_AVISOS_DIA` | Tope de confirmaciones de la beta al día · WhatsApp al equipo uno por alta hasta… | 40 · 10 | 40 · 10 |
