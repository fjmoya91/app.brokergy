<!-- conocimiento · área: instalador-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app del INSTALADOR, fase 3: «Tu página web», el escaparate que propone el instalador y revisa BROKERGY (2026-11-21)

**Por qué.** Cada instalador de la red tiene su ficha en brokergy.es («Encuentra tu instalador»), pero
hasta hoy solo la tocaba el ADMIN: publicaba fotos de obra con el botón «Publicar en el escaparate» del
gestor de documentación. Fran (21/11/2026): que el instalador **proponga** desde su app las fotos de sus
obras (o fotos sueltas del móvil) y sus textos, y que BROKERGY revise cada cosa antes de publicarla.
Decisiones de Fran que no se reabren:

- el instalador **marca** que los clientes le han dado permiso; BROKERGY revisa cada foto;
- los textos también se revisan, y no llevan teléfonos ni precios;
- **regla de oro**: CERO datos personales del cliente en lo público (ni nombre, ni dirección, ni nº de
  expediente); la geografía, solo el pueblo; DTO públicos por lista blanca; nunca importes por obra,
  margen ni nº de serie.

| Qué | Dónde |
|---|---|
| El SQL (sin aplicar) | [escaparate_revision_schema.sql](implementation/backend/scripts/escaparate_revision_schema.sql) |
| Lo común: publicar una foto de obra, validar textos, la red y el slug, el aviso apagado, el tipo por los bytes | [services/escaparateService.js](implementation/backend/services/escaparateService.js) |
| Las rutas del instalador (`/api/instalador-app/escaparate…`) | [routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js), bloque «FASE 3» |
| La revisión (`/api/escaparate-revision/…`) | [routes/escaparateRevision.js](implementation/backend/routes/escaparateRevision.js) |
| La API pública de la página (`/api/public/marketplace/red/:slug/pagina`) | [routes/publicMarketplace.js](implementation/backend/routes/publicMarketplace.js) |
| La carpeta de Drive de las fotos sueltas | `carpetaEscaparate()` en [services/driveFolders.js](implementation/backend/services/driveFolders.js) |
| Las pantallas «Tu página web» y «Elegir fotos de mis obras» | [MiPaginaView.jsx](implementation/frontend/src/features/instalador/views/MiPaginaView.jsx) y [ElegirFotosView.jsx](implementation/frontend/src/features/instalador/views/ElegirFotosView.jsx) |
| La cola de revisión (CRM, oscuro) | [RevisionEscaparate.jsx](implementation/frontend/src/features/admin/components/RevisionEscaparate.jsx), en la ficha del instalador ([PrescriptorDetailModal.jsx](implementation/frontend/src/features/admin/views/PrescriptorDetailModal.jsx)), con aviso en [PrescriptoresList.jsx](implementation/frontend/src/features/admin/views/PrescriptoresList.jsx) y número en el menú ([DashboardLayout.jsx](implementation/frontend/src/components/layout/DashboardLayout.jsx)) |
| Banco sin API | `/instalador-demo.html` ([instaladorDemo.jsx](implementation/frontend/src/demo/instaladorDemo.jsx)): `?seccion=pagina`, `&pagina=vacia\|revision\|publicada\|novale\|textos`, `&elegir=1`, `?cola=1` (`&lector=1`, sin poder resolver) |
| Pruebas | `test_escaparate_instalador.js` (81), más `test_rutas_sin_sesion.js` y `auditar_rutas_sin_guardian.js` |

### Nada se publica al proponer

**REGLA — lo que propone el instalador nace EN REVISIÓN y no sale en ningún sitio público hasta que un
ADMIN lo aprueba; aprobar una foto de obra es el MISMO camino que el botón «Publicar en el escaparate».**

- **Fotos.** Cada foto es una fila de `instalador_fotos_escaparate` con `estado` **PENDIENTE · PUBLICADA ·
  NO_VALE**. La propuesta nace `PENDIENTE` con `consentimiento_cliente = false` (la marca pública) y
  `permiso_cliente = true` + su fecha (la marca del instalador). Las dos rutas públicas que ya existían
  (`/instaladores/:slug/fotos` y `/foto/:id`) filtran ahora además por `estado = 'PUBLICADA'`: una foto en
  revisión o rechazada **no se sirve ni sabiendo su id**. La estrella del gestor (`GET
  /oportunidades/:id/docs/escaparate`) también, solo en las publicadas.
- **Aprobar** una foto de OBRA llama a `publicarFotoDeObra` (movido tal cual de `oportunidades.js` a
  `escaparateService.js`, que ahora usan los dos: el botón del gestor y la cola), con el instalador, la
  obra y el pueblo de la fila: fase, actuación y par antes/después como siempre. Si la fila ya existía
  (la propuso el instalador), se actualiza; nunca se duplica. Una foto SUELTA pasa a `PUBLICADA` con
  `consentimiento_cliente = true`. El ADMIN puede poner un título público y corregir el pueblo; el título
  pasa el mismo filtro que los textos.
- **Rechazar** exige un motivo de 5 letras o más (**400 `FALTA_MOTIVO`**): el instalador lo lee.
- **Textos.** Los VIGENTES siguen en `prescriptores` (`descripcion_publica`, `especialidades` y la nueva
  `zona_trabajo_publica`); lo PROPUESTO va a `instalador_textos_escaparate`, como mucho UNA propuesta
  `PENDIENTE` por instalador (la nueva sustituye a la anterior). Aprobar copia a los vigentes.

### Lo que el instalador puede proponer, y lo que no

Guardián: `enforceAuth` + la beta (regla 230). Siempre **su** empresa, la de `req.user.prescriptor_id`:
nunca un id que mande el navegador.

- **Fotos de sus obras** (`GET /escaparate/obras`, `POST /escaparate/fotos`): solo de las obras que
  **instala** su empresa (el mismo `instaladorIdDe` que la factura y el CIFO): la que trae pero instala
  otra empresa da **403 `NO_ES_INSTALADORA`**; la ajena o rechazada, **404**. Solo fotos que estén de
  verdad en un apartado de esa obra (`reforma_uploads`), que sean imagen y que no estén rechazadas en el
  gestor (**404 `FOTO_NO_ES_DE_LA_OBRA`**). **Todo o nada**: se comprueban todas antes de escribir una.
  Sin el permiso marcado (`permiso: true`, booleano), **400 `PERMISO_CLIENTE`**. Idempotente: la que ya
  está propuesta o publicada no se duplica (y el índice único lo garantiza aunque dos pestañas choquen).
- **Fotos sueltas del móvil** (`POST /escaparate/fotos/subir`, multipart): ≤ 10 de una vez, ≤ 10 MB cada
  una; el tipo se decide por los **bytes** (JPG, PNG, WEBP o HEIC), nunca por el nombre ni por lo que diga
  el navegador; van a Drive (`DRIVE_FOLDER_ESCAPARATE/<empresa>`, decidido en `driveFolders.js`) y en la
  BD solo el `driveId` (regla 21). **Sin `DRIVE_FOLDER_ESCAPARATE` no se sube nada** (503
  `ESCAPARATE_SIN_CARPETA`): a propósito no cae a otra carpeta.
- **Quitar** (`DELETE /escaparate/fotos/:id`): solo la suya, esté como esté; se borra la fila, el fichero
  de Drive se queda (borrar en Drive no se deshace).
- **Textos** (`PUT /escaparate/textos`): presentación ≤ 300 letras, especialidades de una lista cerrada
  (aerotermia, suelo radiante, placas solares, aire acondicionado, calderas) y ≤ 15 pueblos (solo letras).
  Se rechazan con un mensaje que dice qué quitar: **teléfono** (9 cifras que empiezan por 6–9, con o sin
  separadores, o `+34`/`0034`), **correo**, **página web** y **precio** (cifra con €/euros, o las palabras
  «precio» o «tarifa»). Códigos `TEXTO_CON_TELEFONO`, `TEXTO_CON_EMAIL`, `TEXTO_CON_WEB`, `TEXTO_CON_PRECIO`.
- **Miniaturas**: por proxy, `GET /escaparate/foto/:id?llave=`, con la llave HMAC de `utils/llaveObra.js`
  sobre `esc-<empresa>` (12 h): solo abre fotos de ESA empresa. Es la única ruta abierta nueva, y está en
  la lista de `auditar_rutas_sin_guardian.js` con su motivo. Nunca un enlace de Drive (regla 1).

### La revisión, en el CRM

`/api/escaparate-revision`: la cola (`GET /contador`, `GET /instalador/:id`) la ve el **equipo interno**
(`staffOnly`); **aprobar y rechazar, solo ADMIN** (`adminOnly`), como el botón del gestor. Se ve en:

- la ficha del instalador (Partners → su ficha), bloque **«Pendiente de revisar»** con su contador, encima
  de los expedientes; ahí sí se ve el nº de la obra de cada foto (es interno);
- una franja ámbar en Partners con un chip por instalador que tiene algo pendiente, que abre su ficha;
- el número junto a «Partners» en el menú lateral.

No va al radar del parte diario: el radar trabaja por expediente y esto es por instalador.

**Los avisos están APAGADOS** (`ESCAPARATE_AVISOS_ENABLED`, en la lista de CLAUDE.md): en esta fase no se
manda nada, ni con el interruptor encendido; `avisoEscaparate` solo deja el rastro en el log. Cablearlo
(WhatsApp al equipo cuando llega algo y al instalador cuando se resuelve) es de la fase siguiente y
necesita un «sí» de Fran al texto.

### La API pública de la página: el CONTRATO

`GET /api/public/marketplace/red/:slug/pagina`, sin sesión, `Cache-Control: public, max-age=300`.

- **Quién sale y con qué slug**: el criterio de `brokergy-web/scripts/red.mjs` (todos los INSTALADORES
  con al menos una obra sin rechazar, salvo BROKERGY, la ficha de prueba y los `oculto_web`; slug =
  `marketplace_slug` o el de su nombre, con «-2» si se repite), en `redDeInstaladores()`, cacheado 10 min.
  No usa `visible_marketplace` (eso es el escaparate antiguo, que sigue igual). Diferencia conocida:
  `red.mjs` además salta obras cuyo municipio no tiene centro en `municipio_geo`; aquí no.
- **Slug** `^[a-z0-9-]{1,80}$`; desconocido, oculto o sin obra → **404**. BD caída → **503
  `PAGINA_UNAVAILABLE`** (nunca una página vacía, regla 38).
- **Respuesta** (claves exactas, lista blanca y `assertAnonymous`):

```json
{
  "slug": "rca",
  "nombre": "RCA",
  "presentacion": "texto vigente o null",
  "especialidades": ["aerotermia", "suelo_radiante"],
  "pueblos": ["Tomelloso", "Argamasilla de Alba"],
  "fotos": [
    { "url": "/api/public/marketplace/foto/<id>", "fase": "antes|despues",
      "actuacion": "aerotermia|ventanas|cubierta|fachada|suelo|obra",
      "municipio": "Tomelloso", "titulo": "texto o null", "grupo": "<par_id o id>" }
  ]
}
```

- Solo fotos `PUBLICADA` **y** con `consentimiento_cliente`, como mucho 60, por `orden` y luego las más
  nuevas. `grupo` junta el antes y el después de una misma actuación. Las especialidades fuera de la lista
  no salen. Los textos son los VIGENTES (lo propuesto no sale hasta aprobarse).
- **Nunca**: `drive_id`, `expediente_id`, nº de obra, nada del cliente, importes por obra, margen ni nº de
  serie. La imagen se sirve por `/foto/:id`, que a su vez solo sirve las publicadas.

**Pendiente fuera de este repo**: que `brokergy-web` lea esta API para pintar la página (ese repo no se ha
tocado).

### El SQL y su orden respecto al deploy

[escaparate_revision_schema.sql](implementation/backend/scripts/escaparate_revision_schema.sql), aditivo e
idempotente. **Se aplica ANTES del deploy**: el código nuevo ya lee las columnas nuevas, también en las
rutas del escaparate antiguo (el filtro por `estado`); sin el SQL, la galería antigua daría error.
Orden: **1) el SQL · 2) `deploy.sh`**. Lo que hace:

- en `instalador_fotos_escaparate`: `estado` (DEFAULT `PUBLICADA`, así que las fotos que ya había quedan
  exactamente como estaban), `motivo_rechazo`, `origen` (`OBRA`/`SUELTA`), `slot`, `mime_type`,
  `permiso_cliente` y su fecha, quién y cuándo la propuso y la revisó; `expediente_id` deja de ser
  obligatorio (solo para las sueltas: un CHECK lo ata a `origen`); «no vale» exige motivo; índices únicos
  por (expediente, drive) y (instalador, drive) —comprobado el 21/11 que no hay duplicados— y el de la cola;
- en `prescriptores`: `zona_trabajo_publica TEXT[]`;
- tabla nueva `instalador_textos_escaparate` con RLS sin policies y GRANT solo a `service_role` (regla 150);
- **el hallazgo**: una consulta de solo lectura del 21/11/2026 mostró que **`anon` y `authenticated`
  tenían TODOS los privilegios** (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) en las
  cinco tablas `instalador_*` del escaparate. No se notaba porque tienen RLS sin policies, pero
  **TRUNCATE no pasa por el RLS** y la clave anónima es pública. El script se lo QUITA (`REVOKE ALL … FROM
  anon, authenticated`) y deja el GRANT a `service_role`; al final trae la consulta para comprobarlo.

### Las pantallas

Estilo «carta de pago» sin modo oscuro, como las fases 1 y 2 (`.ia-`, piezas de `features/instalador/ui/`).

- **Entradas**: tarjeta «Tu página web» en Inicio; «Tu página web» en el menú lateral del ordenador; la
  hoja del avatar / Perfil (que ahora siempre se abre: «Mis datos de empresa», «Tu página web», «Cerrar
  sesión»); y en cada obra que instala su empresa, en «Fotos y papeles», «Enseñar fotos en mi página»,
  que abre «Elegir fotos» filtrado a esa obra.
- **Tu página web**: la ficha (nombre, pueblo, Publicada / Oculta, la dirección de su página, «Ver mi
  página» abre brokergy.es y «Compartir» usa `navigator.share`, o copia el enlace si no hay); sin página
  todavía, el aviso de que sale con su primera obra. Sus fotos con su estado (en revisión · publicada · no
  vale, y el motivo); «Elegir fotos de mis obras» (naranja) y «Subir fotos del móvil». Sus textos, con el
  contador de letras, los chips de a qué se dedica y los pueblos, y el aviso si están en revisión o no
  valieron. «Lo que sale solo»: obras, ayuda media (desde 3 obras, como la web) y marcas.
- **Elegir fotos**: por obra («Aerotermia en Tomelloso» y el mes: nunca el cliente), con Antes/Después,
  las que ya están en la página marcadas y sin poder elegirse, y abajo el permiso y «Enviar N fotos a
  revisión». Todo envío va por `SendActionOverlay`.

### Lo medido (21/11/2026, banco a 390×844, 1280×800 y 360 px)

Tu página (mezcla, vacía, con fotos que no valen, con textos en revisión), Elegir fotos, Inicio con la
tarjeta y la cola de revisión: **sin scroll horizontal a 360 px, sin errores de consola, ningún objetivo
táctil por debajo de 44 px en la app del instalador** (la cola del CRM usa los botones de siempre del
CRM, 33 px) y ningún botón ni título cortado. Arreglos que salieron de medir: «Ver mi página» partía en
dos líneas; los textos salían en MAYÚSCULAS porque el CSS global de `index.css` las pone en `input` y
`textarea` (`.ia-campo` y el motivo de la cola llevan ahora `text-transform: none` / `no-uppercase`); el
campo de pueblos se cortaba (ahora es un `textarea`); en la obra salían dos botones de volver; y «1
publicadas».

**Ninguna escritura real**: los tests simulan Supabase, Drive y la red (sin red: `axios` falla y la
miniatura cae al Drive simulado); el banco contesta la API dentro del navegador. El SQL **no** se ha
aplicado.

### Lo que no se ha podido comprobar

- la subida real a Drive de una foto suelta (no hay `DRIVE_FOLDER_ESCAPARATE` en local, y no se sube nada
  real);
- `navigator.share` en un móvil de verdad (en el banco cae a copiar el enlace);
- las rutas contra la BD real con el SQL aplicado (el SQL está sin aplicar a propósito);
- que la página pública de brokergy.es pinte esta API (repo aparte).
