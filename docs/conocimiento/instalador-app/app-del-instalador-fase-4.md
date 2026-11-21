<!-- conocimiento · área: instalador-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app del INSTALADOR, fase 4: el CATÁLOGO de aerotermia con TARIFAS (2026-11-21)

**Por qué.** El instalador elige el equipo al hacer el presupuesto, y hasta hoy no tenía en la app ni qué
equipos hay de sus marcas ni a cuánto se los vende el distribuidor. Fran (21/11/2026), decisiones que no se
reabren:

- BROKERGY sube por **Excel** la tarifa del distribuidor por marca: la MISMA para todos los instaladores;
- cada instalador ajusta **SU** precio, y solo lo ve él;
- la comisión y el margen siguen ocultos para el partner; el rol DISTRIBUIDOR queda fuera de la app nueva;
- los presupuestos propios con partidas **no** entran en esta fase.

| Qué | Dónde |
|---|---|
| El SQL (sin aplicar) | [aerotermia_tarifas_schema.sql](implementation/backend/scripts/aerotermia_tarifas_schema.sql) |
| Lo común: leer el Excel, casar, tarifa vigente, la plantilla, el DTO del instalador | [services/catalogoTarifas.js](implementation/backend/services/catalogoTarifas.js) |
| La carga del Excel (`/api/aerotermia/tarifas/…`, solo ADMIN) | [routes/aerotermiaTarifas.js](implementation/backend/routes/aerotermiaTarifas.js), montada en [server.js](implementation/backend/server.js) ANTES que `/api/aerotermia` |
| Las rutas del instalador (`/api/instalador-app/catalogo…`) | [routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js), bloque «FASE 4» |
| El popup «Cargar tarifa (Excel)» del CRM (oscuro) | [CargarTarifaModal.jsx](implementation/frontend/src/features/aerotermia/components/CargarTarifaModal.jsx), botón en [AerotermiaView.jsx](implementation/frontend/src/features/aerotermia/views/AerotermiaView.jsx) |
| Las pantallas «Catálogo» y la ficha del equipo | [CatalogoView.jsx](implementation/frontend/src/features/instalador/views/CatalogoView.jsx) |
| «Calcular una obra con este equipo» | [equipoInicial.js](implementation/frontend/src/features/landing/data/equipoInicial.js), usado por [LandingFunnelView.jsx](implementation/frontend/src/features/landing/views/LandingFunnelView.jsx) y [ReformaSubFlow.jsx](implementation/frontend/src/features/landing/views/ReformaSubFlow.jsx) |
| Banco sin API | `/instalador-demo.html`: `?seccion=catalogo`, `&catalogo=sinmarcas`, `?equipo=101\|102\|103\|104`, `?tarifa=1` (`&fallo=1` → el 409 del plan cambiado) |
| Pruebas | `test_catalogo_instalador.js` (74) y `test_equipo_inicial_catalogo.mjs` (22), más `test_rutas_sin_sesion.js` y `auditar_rutas_sin_guardian.js` |

### El esquema (aditivo, sin tocar `aerotermia`)

- `aerotermia_tarifas_cargas`: una fila por Excel cargado — distribuidor, «vale desde», **nombre y sha256 del
  fichero** (el Excel NO se guarda), filas leídas / cargadas / fuera, quién y cuándo.
- `aerotermia_tarifas`: la tarifa de un modelo, **con histórico** (una tarifa nueva es una fila nueva).
  **La VIGENTE es la de `vigente_desde` más reciente que ya ha empezado**; a igualdad, la cargada después. Una
  tarifa con fecha futura no se enseña hasta su día.
- `instalador_precios_equipo`: el precio propio, uno vivo por (instalador, modelo); quitarlo es borrarlo.
- Precios **sin IVA**, `NUMERIC(10,2)`, > 0. RLS sin policies, GRANT solo a `service_role`, REVOKE a `anon` y
  `authenticated` (regla 150). **Va ANTES del deploy**: sin las tablas el Catálogo responde 503 y la carga no
  confirma.

### El Excel y cómo se casa

**REGLA — la carga va SIEMPRE en dos pasos, y el Excel NUNCA crea un modelo.**

- Formato: la PRIMERA hoja, con una fila de títulos en las 15 primeras: **MARCA** (o FABRICANTE), **MODELO**
  (o REFERENCIA / REF / CÓDIGO) y **PRECIO** sin IVA (o TARIFA / PVP / IMPORTE). Precios como número o como
  texto «4.650,00 €», «4650.5». Máximo 5 MB (413) y 5.000 filas. El tipo se mira por los BYTES (un `.xlsx` es
  un ZIP), no por la extensión. La plantilla se baja del propio popup (`GET /plantilla`).
- Se casa por **marca + una de las referencias del modelo** (`modelo_comercial`, `modelo_conjunto`,
  `modelo_ud_exterior`), comparando sin tildes, mayúsculas, espacios ni guiones (`norm`: «wh-wdg 12» →
  `WHWDG12`). Estados: **CASA** · **AMBIGUA** (casa con más de un modelo) · **SIN_PAREJA** · **ERROR** (precio
  ilegible) · **DUPLICADA** (mismo modelo con dos precios: no se carga ninguno) · **REPETIDA** (mismo modelo y
  precio: vale la primera). En lo que casa, el cambio: **NUEVA · IGUAL · SUBE · BAJA** frente a la vigente.
- `POST /leer` es **en seco**: no escribe nada y devuelve el plan, su `firma` y el `sha256` del fichero.
  `POST /confirmar` manda el MISMO fichero con esa firma; el servidor lo vuelve a leer y solo escribe si el
  plan coincide (si no, **409 `PLAN_CAMBIADO`** y el popup vuelve al paso 1). Escribe la carga y, en UN insert,
  las tarifas; si ese insert falla, borra la carga y responde 503.
- Lo AMBIGUO se resuelve en el popup eligiendo uno de SUS candidatos y **volviendo a leer** («Guardar» queda
  apagado mientras haya una elección sin releer); el servidor solo acepta un id de esos candidatos. Lo que NO
  casa no se carga: se da de alta o se corrige en el catálogo (skill `alta-aerotermia`) y se vuelve a subir.
- **Una fila IGUAL no se vuelve a insertar**: el histórico solo crece con cambios de verdad.
- Todas las rutas de carga, **`adminOnly`**: la tarifa es un dato de compra.

### Lo que ve el instalador

**REGLA — el instalador ve SOLO sus marcas, la tarifa vigente y SU precio; nunca el distribuidor, el margen,
la comisión, otro instalador ni un enlace de Drive.**

- Rutas con `enforceAuth` + la beta (regla 230): `GET /catalogo` · `GET /catalogo/:id` (404 si no es de sus
  marcas) · `GET /catalogo/:id/ficha` (la ficha técnica **por proxy**, nunca el enlace) · `PUT` y `DELETE
  /catalogo/:id/precio` (siempre con SU `prescriptor_id`; 400 `PRECIO_NO_VALIDO`).
- Sus marcas: `marcas_autorizadas`, el MISMO filtro que `routes/aerotermia.js`. **Sin marcas no ve NINGÚN
  equipo** (`sin_marcas: true` y la tarjeta «Aún no tienes marcas en tu catálogo»): lo más conservador; nunca
  el catálogo entero.
- El equipo va en LISTA BLANCA (`equipoParaInstalador`): marca, nombre, referencias, uso, montaje, potencias,
  **SCOP con 2 decimales** (cálido; si no hay, medio, y se dice), ACS, refrigerante, `tarifa {precio, desde}`
  o `null`, `tu_precio` y `papeles` (solo «Ficha técnica», y qué trae dentro).
- Pantallas (estilo «carta de pago», `.ia-`): **Catálogo** con buscador sin tildes (también sin espacios ni
  guiones), chips de marca y tarjetas con la tarifa; la **ficha** con la tarifa como cifra protagonista
  («Sin IVA · desde {mes}»), «Tu precio en los presupuestos» con **Cambiar**, «Lo que hace» en lenguaje
  llano y «Sus papeles». **Sin tarifa dice «Sin tarifa todavía», nunca un 0.**
- La barra de abajo pasa a **Inicio · Obras · ＋ Nueva · Clientes · Catálogo**; el Perfil se queda en el
  avatar de la cabecera y al pie del menú lateral del ordenador.

### «Calcular una obra con este equipo»

Abre la «Nueva simulación» de siempre (`openNewSimulation({ equipo })` en `App.jsx`) con el equipo
preseleccionado y su precio (el suyo o, si no tiene, la tarifa) como presupuesto **editable**:

- el importe del embudo es el **TOTAL CON IVA** (regla de StepDocsObra), así que se le suma el 21 %;
- caldera (embudo): entra como «Sí, hay un presupuesto» en el paso 8, con el campo abierto;
- reforma (`docs_obra`): entra como documento «importe a mano», con la forma de `docManual`;
- el modelo queda en `inputs.aerothermiaModel` y, leído con `GET /api/aerotermia/:id`, su SCOP, temporada y
  potencia salen de `scopsParaClima`: **lo MISMO que el efecto de CalculatorForm al elegirlo a mano** (que no
  corre en una oportunidad ya guardada, por eso se aplica al crearla). Si el modelo no se puede leer, queda
  solo preseleccionado y el SCOP es el de siempre.
- Un aviso ámbar en el embudo dice de dónde salen equipo y precio. No se fuerza el cálculo.

### Para desplegar

1. `aerotermia_tarifas_schema.sql` (fase 4) y, si no se aplicó, `escaparate_revision_schema.sql` (fase 3):
   los dos **ANTES** del deploy. Son aditivos e idempotentes.
2. Deploy. 3. Subir la primera tarifa desde Aerotermia → «Cargar tarifa (Excel)».
