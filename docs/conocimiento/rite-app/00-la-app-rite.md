<!-- conocimiento · área: rite-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app RITE — rite.brokergy.es (2026-11-25)

**Por qué.** Lo pidió Fran el 25/11/2026, a raíz de un instalador que pedía una memoria RITE suelta:
«al igual que tengo una aplicación de los certificados de eficiencia energética, una aplicación que sea
independiente pero que esté integrada» para hacer las memorias RITE. Los datos de entrada son los de
siempre (el titular, la superficie del Catastro, los rendimientos de la máquina) y hay dos niveles:
**rápido** (las estancias se estiman por la superficie) y **extendido** (se meten las estancias y los
elementos de radiador de cada una, y de ahí sale la potencia por estancia). Se le propusieron tres
alcances: el asistente dentro del CIT del CRM, el CIT más la app del instalador, o una app externa. **Eligió
la app externa en su subdominio, como «CEE by BROKERGY»** (tarjeta del 25/11/2026).

### Lo que se reutiliza (no se reescribe ninguna regla de la memoria)

**REGLA — la memoria suelta pasa por las MISMAS funciones que la de una obra CAE.** Una memoria de la app
no tiene expediente: [services/riteapp/payload.js](implementation/backend/services/riteapp/payload.js) traduce sus
datos y la cuenta del instalador a las formas `exp`, `cli`, `op` y `pres` del CRM y las pasa por
`validateMemoriaRite` ([utils/riteValidation.js](implementation/backend/utils/riteValidation.js)) y por
`buildRitePayloads` ([services/riteGenerador.js](implementation/backend/services/riteGenerador.js), sacado de
`routes/expedientes.js` ese día para que sea la fuente única de las dos entradas). El generador
(`rite-generator`, `/generar-rite-json`) es el mismo contenedor: las reglas 74, 228, la cascada, el
emplazamiento de la regla 149 y el ACS valen solas.

| Pieza | Dónde | Estado |
|---|---|---|
| Generador (Word, PDF, borrador del certificado, guía JE6) | `implementation/rite-generator` | ya en producción |
| Validación (lo que falta) | `validateMemoriaRite` | ya en producción |
| Payload del generador | `services/riteGenerador.js` | sacado del router el 25/11 |
| Memoria suelta → formas del CRM, tabla de estancias, avisos | `services/riteapp/payload.js` | hecho, 11 pruebas |
| Modo extendido (elementos reales) | `cargas_desde_locales` en `rite-generator/lib/cargas_termicas.py` | hecho |
| Tablas | [scripts/riteapp_schema.sql](implementation/backend/scripts/riteapp_schema.sql) | escrito, **sin aplicar** |
| Cuentas, alta con Google o email, créditos | `middleware/riteappAuth.js`, `routes/riteapp.js` (`/alta`, `/me`), `riteapp_movimientos` | hecho |
| Pantallas | 3.ª entrada del build, `rite.html` + `src/rite/`, con las piezas de `src/certificadores/ui` | hecho (25/11) |
| Catastro | `traerDireccionCatastral` / `catastroService.getByRC` (dirección, superficie, plantas y zona) | ya existe |
| Equipos | catálogo `aerotermia` (potencias, SCOP, frío) con `resolvePotenciasCatalogo` | ya existe |

### El modo extendido: la potencia sale de los radiadores

**REGLA — en el modo extendido, la POTENCIA INSTALADA de una estancia es elementos × W por elemento; la
CARGA de cálculo sigue siendo m² × W/m² de la zona.** Por defecto 100 W por elemento (el criterio del
22/09/2026: aluminio de 600 mm a ΔT50 da 119-141 W, y 100 W deja margen para la aerotermia), editable para
toda la vivienda (`estancias.w_elemento`) o por estancia (`w_elemento` del local), entre 30 y 400 W. Una
estancia sin elementos se calcula como en el rápido (⌈carga / 100 W⌉). Solo con RADIADORES: con suelo,
splits o conductos los elementos no se guardan y la columna va en blanco. En el modo rápido los elementos
tecleados se descartan. El cálculo está DOS veces, a propósito: `cargas_desde_locales` (lo que sale en el
documento) y su espejo `tablaEstancias` (lo que se enseña antes de generar). Si se cambia uno, se cambia el
otro.

Avisos que no bloquean: estancias sin elementos en el modo extendido; los radiadores suman más de un 25 %
por encima de la potencia de la bomba; estancias estimadas en el rápido («revísalas antes de firmar»).

**REGLA — de momento solo Castilla-La Mancha.** La plantilla es la oficial de la JCCM
(`plantilla_rite_jccm.docx`) y la guía es la de la JE6: una vivienda de otra provincia BLOQUEA con su
motivo (`PROVINCIAS_CLM`).

### El flujo previsto

1. **Alta** (`rite.brokergy.es/`): con Google o con un enlace al email, y una memoria gratis (como la app
   de CEE). Datos de la EMPRESA instaladora: razón social, CIF, nº de empresa RITE, representante que firma
   (o técnico habilitado distinto) y municipio. Si ya es partner de BROKERGY, `prescriptor_id`.
2. **Nueva memoria**: referencia catastral → «Traer datos del Catastro» (dirección, superficie, plantas y
   zona) → titular → equipo del catálogo (o a mano) con su nº de serie, emisor, ACS y frío → fecha de
   pruebas → **estancias, rápido o extendido** (la pantalla de `LocalesRiteModal` más la columna de
   elementos) → revisión con la tabla de cargas y los avisos.
3. **Generar**: la primera vez gasta 1 crédito (`riteapp_consumir_credito_memoria`); volver a generar la
   misma, no. Ficheros: la memoria en Word y PDF, el borrador del certificado y la guía JE6, en su carpeta
   de Drive.
4. **Firmar y presentar**: los firma él (AutoFirma del representante) y los presenta en eDICE, o **«Que la
   presente BROKERGY»**, que da de alta un CIT (`{AAAA}CIT_{n}`) en el CRM con la memoria ya hecha y sigue
   el circuito CIT de siempre.

Numeración de la app: `{AAAA}RIT_{n}`, correlativo propio por año (trigger con candado, como los informes).

### «Hazme esta memoria»: BROKERGY la hace y aparece en los documentos del instalador (2026-11-25)

Fran, ese mismo día: «la idea es que yo te diga "haz esta memoria" y automáticamente seas capaz de
hacerla y que ya aparezca en los documentos». Una sola llamada,
[services/riteapp/encargo.js](implementation/backend/services/riteapp/encargo.js) `hazMemoria`, por
`POST /api/riteapp-admin/memorias` (`staffOClaveInterna`) y, desde Claude, la herramienta del MCP
**`memoria_rite`** (y `completar_memoria_rite` para lo que faltaba o para cambiarla, y
`listar_memorias_rite`):

1. **El instalador**: su cuenta de la app por id, email o CIF; si no la tiene pero es PARTNER, se le crea
   una **PENDIENTE** con los datos de quien firma de verdad (`resolveInstaladorFirmante`, con su
   delegación), sin créditos, y la ve al entrar con ese email (el alta la ADOPTA: `auth_user_id`).
2. **La vivienda**: el Catastro por la referencia (`viviendaDelCatastro`, una petición con caché): la
   superficie de VIVIENDA (sin garajes ni almacenes si el Catastro los separa), las plantas, la dirección
   y la zona climática por el municipio (`climateService`). Lo dicho a mano manda.
3. **El equipo**: por id del catálogo, o por texto; con varias coincidencias **no elige**: devuelve
   `opciones_equipo` y la memoria queda en BORRADOR.
4. **Las estancias**: la propuesta por superficie (`proponerLocales` + `resolverLocales` de
   `logic/localesRite.js`, la MISMA del popup del CRM, importada por el backend) o las que se digan por
   tipo y planta, con sus elementos (modo extendido).
5. Si no falta nada, **se genera** (`origen: 'BROKERGY'`, **no gasta créditos**) y queda en sus
   Documentos; si falta, devuelve `faltan` para preguntarlo.

**REGLA — lo de BROKERGY NO gasta créditos del instalador**; lo que genera él, sí: 1 la PRIMERA vez
(`riteapp_consumir_credito_memoria`), regenerar la misma es gratis, y si el generador falla se le
devuelve.

### Los documentos de una memoria

Tomado de la app de certificadores: los ficheros viven en Drive y la BD solo guarda ids. Cada
generación deja los cuatro (memoria en PDF y Word, borrador del certificado y guía JE6) en la carpeta
de la memoria y la versión anterior pasa a «OLD» (`_OLD`, `_OLD1`…). `documentos()` devuelve lo
**actual** de cada clase y, aparte, las **anteriores**; la clase sale del NOMBRE que pone el generador
(`claseDe`). **REGLA — un fichero solo se sirve si es de ESA memoria** (en su carpeta o en su OLD): si
no, 404 sin tocar Drive (`fichero()`), como el token de una obra (regla 232). Sin enlaces de Drive al
instalador (regla 1): se sirven los bytes por la API.

Pruebas en seco de todo el circuito (Supabase, Drive y Catastro de mentira; el generador de verdad):
`node implementation/backend/scripts/test_riteapp_encargo.js`.

### Todo unificado: el CIT del CRM, el enlace al instalador, la administración y el precio (2026-11-25, tarde)

Fran: «ponla en producción… la primera gratis y se les pueden añadir BONOS desde ADMIN. Desde ADMIN quiero
tener acceso a la app de los CEE y la del RITE. También quiero que esté conectado a mi app maestra… una
opción de que le llegue un mensaje con una URL al instalador para que complete los datos él mismo… y que
desde un agente le diga "hazme la memoria técnica de tal sitio"».

- **Una memoria por CIT** (`riteapp_memorias.informe_id`, índice único salvo ANULADA). En la ficha del CIT
  del CRM (`InformeDetailView`, línea CIT) va la tarjeta **«Memoria RITE (app RITE)»**
  ([MemoriaRiteCit.jsx](implementation/frontend/src/features/informes/components/MemoriaRiteCit.jsx)):
  «Crear la memoria» (`POST /api/riteapp-admin/desde-informe/:id`, `encargo.desdeInforme`) la monta con lo
  que el CIT sabe (el cliente como titular, su instalador —el prescriptor del CIT— como cuenta, la
  referencia catastral o la dirección) y, si no falta nada, la genera. **Generada, la memoria en PDF y en
  Word SUBE AL CIT como versión final** (`FINAL_PDF` / `FINAL_WORD` por `informeService.subir`, con su
  nota): el circuito del CIT sigue igual (firmar, eDICE, facturar). Si la subida falla, se anota y la
  memoria queda generada igual. Un CIT que ya tiene memoria devuelve la que hay (`existia: true`).
- **`origen`** (`INSTALADOR` / `BROKERGY`): la de BROKERGY no gasta créditos la regenere quien la regenere.
- **El enlace del instalador**: `rite.brokergy.es/completar/:token` (`crearEnlace`: 32 hex al azar, caduca a
  los 30 días, uno nuevo anula el anterior). Sin cuenta: la MISMA pantalla de la memoria (fuente `enlace`,
  `/api/public/riteapp/:token`, pública por diseño y en `ROUTERS_PUBLICOS`), empezando por la
  Instalación si BROKERGY ya puso vivienda y titular, en el modo pedido (rápido o con radiadores, el
  modo se cambia SIN tocar las estancias que haya). **«Enviar a BROKERGY»** la deja `completada_at` y, si
  no falta nada, la genera (origen BROKERGY) y sube al CIT; si falta, la recibe igual y lo completa
  BROKERGY. **REGLA — el enlace vale para UNA memoria**: solo lee, guarda y sirve ficheros de ESA (regla
  232), con límites por IP y 503 con la BD caída. **El mensaje con el enlace nunca sale solo**: el CRM, la
  administración y el MCP (`enlace_memoria_rite`) dan el BORRADOR; se copia o se abre en el WhatsApp de
  quien lo prepara.
- **La administración** (`rite.brokergy.es/admin`): una sesión con fila en `usuarios` (ADMIN o
  TRABAJADOR; `GET /api/riteapp-admin/yo`, que `RiteAuth` pregunta cuando `/me` da SIN_CUENTA → `equipo`)
  ve todas las memorias y abre cada una con la MISMA pantalla (fuente `admin`, no gasta) más la tarjeta
  del enlace y su CIT. **Cuentas y bonos, solo ADMIN**: «Añadir memorias» (`POST /cuentas/:id/creditos`,
  con concepto e importe, queda en `riteapp_movimientos`) y bloquear/activar.
- **El precio** (Fran, 25/11/2026): **la primera memoria gratis** (`RITEAPP_CREDITOS_ALTA`, 1 por
  defecto) y las demás por **bonos** desde la administración. La cuenta que le preparó BROKERGY también
  recibe la gratis al adoptarla, una sola vez (si no tiene ya un movimiento `ALTA`).
- **El CRM enlaza las dos apps**: «App CEE» y «App RITE» en el menú lateral del ADMIN (grupo «Apps»,
  `utils/appsExternas.js`: en producción su subdominio; en local `cee.localhost` / `rite.localhost`).
- **El agente**: `memoria_rite` acepta `cit` (con eso basta: instalador, titular y vivienda salen del
  CIT; lo que se diga encima manda) o, sin CIT, instalador + referencia catastral + titular.
  `enlace_memoria_rite({ id | cit, modo })` devuelve la URL y el borrador del mensaje, sin enviar.

La pantalla de la memoria sirve a las tres fuentes (`fuenteDe('cuenta' | 'admin' | 'enlace', clave)` en
`pantallas/Memoria.jsx`): de dónde lee, adónde guarda, cómo genera y de dónde trae el Catastro y el
catálogo. Lo que bloquea lo sigue diciendo el servidor.

### Las pantallas (`rite.html` + `src/rite/`, 2026-11-25)

Tercera entrada del build de Vite. Reutiliza de la app de certificadores el CSS `.ca-` (estilo «carta de
pago»), `piezas.jsx`, `Iconos.jsx`, el router y el visor de PDF (`obra/VisorPdf.jsx`); lo propio va con
prefijo `.rt-` en `src/rite/ui/estilo.js`. Rutas: `/` (portada y entrar), `/alta`, `/panel`,
`/memoria/:id` (`?paso=` abre uno concreto), `/perfil`, `/completar/:token` (el enlace del instalador) y
`/admin`, `/admin/cuentas`, `/admin/memoria/:id` (el equipo).

- **Entrar**: Google (`signInWithOAuth`) o el enlace mágico de Supabase (`signInWithOtp`, sin
  contraseña). La sesión sin cuenta (`403 RITEAPP_SIN_CUENTA`) va a `/alta`; con el servidor caído se
  dice y se reintenta, nunca se trata como «sin cuenta» (regla 38). El correo del enlace es la
  plantilla de Supabase Auth: se cambia en su panel.
- **La memoria, por pasos**: Vivienda (Catastro) → Titular → Instalación (catálogo o a mano, emisor,
  ACS, frío, fechas) → Estancias → Revisar → Documentos. Se guarda sola a los 900 ms y SIEMPRE antes de
  revisar o generar. Lo que falta y la tabla de cargas los da el SERVIDOR (`/comprobar`): la pantalla no
  repite ninguna regla.
- **REGLA — la pantalla de estancias no calcula potencias.** Reparte con `logic/localesRite.js` (la del
  CRM) y la potencia por estancia la enseña «Revisar» con `tablaEstancias`; una tercera copia del cálculo
  acabaría enseñando una tabla y firmando otra.
- **El arranque del CRM no monta en `rite.html`**: `src/main.jsx` mira `data-app` (como con
  certificadores).
- En desarrollo: `http://rite.localhost:5173/` (mejor que `/?app=rite`, que deja una cookie por puerto y
  el CRM de ese puerto pasa a ser la app RITE; `vite.config.js`). Producción: `nginx/rite.brokergy.es.conf` (con 300 s para `/generar`).

### Para producción (lo de una vez, como cee.brokergy.es)

SQL `riteapp_schema.sql` en Supabase (Fran dio el «sí» el 25/11/2026) · DNS `rite` → `187.77.93.213` · bloque de
nginx + certbot (copia de referencia en `nginx/`) · `RITEAPP_URL` en el `.env` del VPS y en `crearCors` ·
Redirect URLs de Supabase Auth para Google · desplegar el backend y **el contenedor del rite-generator**
(lleva el modo extendido).

Tras tocarlo: `node implementation/backend/scripts/test_riteapp_payload.js` (con el generador levantado,
`--generar <carpeta>` hace los ficheros de verdad).
