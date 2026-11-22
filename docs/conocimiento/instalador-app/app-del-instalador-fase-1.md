<!-- conocimiento · área: instalador-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app del INSTALADOR, fase 1: cáscara, Inicio, Obras y Clientes en solo lectura (2026-11-21)

**Por qué.** Fran (21/11/2026) pidió rehacer la app SOLO para el rol INSTALADOR, mobile first y «tipo
Holded», para gente sin experiencia digital. Hasta ahora el instalador solo tenía Oportunidades y Clientes;
lo demás le llegaba por enlaces sueltos y la obra desaparecía de su vista al aceptarse. El diseño está
aprobado (prototipo de Claude Design, decisiones en la memoria del proyecto «Diseño app instalador») y el
beta tester es **RCA**. La idea central: **oportunidad + expediente = UNA «obra»** con 5 pasos y, en cada
una, **quién tiene la pelota**.

| Qué | Dónde |
|---|---|
| Quién entra (beta), la tabla de pasos, las tareas y las cuentas | [utils/appInstalador.js](implementation/backend/utils/appInstalador.js) |
| La API de solo lectura (`GET /obras`, `GET /obras/:id`) | [routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js), montada en `/api/instalador-app` |
| `app_instalador` en `/api/usuarios/me` | [routes/usuarios.js](implementation/backend/routes/usuarios.js) |
| Pantallas (cáscara, Inicio, Obras, Obra, Clientes, Cliente) | [features/instalador/](implementation/frontend/src/features/instalador/) |
| CSS `.ia-` y piezas comunes (fases 2 y 3 las reutilizan) | [ui/estilo.js](implementation/frontend/src/features/instalador/ui/estilo.js) y [ui/piezas.jsx](implementation/frontend/src/features/instalador/ui/piezas.jsx) |
| Enganche con la sesión, el perfil y los modales de clientes | [HostInstalador.jsx](implementation/frontend/src/features/instalador/HostInstalador.jsx) y la rama `user.app_instalador` de [App.jsx](implementation/frontend/src/App.jsx) |
| Banco sin sesión ni API (datos de mentira) | `/instalador-demo.html` → [src/demo/instaladorDemo.jsx](implementation/frontend/src/demo/instaladorDemo.jsx); en `launch.json`, `instalador-demo-5187` |
| Pruebas | `node implementation/backend/scripts/test_app_instalador.js` (y `test_rutas_sin_sesion.js`, que ya incluye las dos rutas) |

### El interruptor de la beta

**REGLA — quién ve la app nueva lo decide UN sitio: `enBetaInstalador(user)` en `utils/appInstalador.js`.**
Hace falta rol `INSTALADOR` y que el `prescriptor_id` del usuario esté en la variable de entorno
`APP_INSTALADOR_BETA` del backend (lista de `id_empresa` separados por comas; sin la variable, nadie). El
**DISTRIBUIDOR nunca entra** aunque su empresa esté en la lista (la app es del que instala). No es una
quinta definición de «partner»: lo de quién es partner sigue en `getRoleFlags` / `isStaff`.
`/api/usuarios/me` devuelve `app_instalador`, el `AuthContext` lo copia y `App.jsx` monta `HostInstalador`
**en lugar** del `DashboardLayout`. Cualquier otro usuario (partner fuera de la beta, distribuidor, equipo
interno) sigue viendo exactamente lo de siempre: la rama solo depende de ese booleano.

Activarla para RCA: `APP_INSTALADOR_BETA=<id_empresa de RCA>` en el `.env` del backend (el id está en
`prescriptores`, acrónimo «RCA INSTALACIONES») y reiniciar. Quitarla = borrar la variable.

### La obra en 5 pasos (tabla escrita, coherente con `estadoOportunidad.js`)

Pasos: **1 Simulada · 2 Propuesta · 3 Aceptada · 4 Trámite · 5 Cobro**. Quién: `tu` (Te toca) · `nos` (Lo
llevamos nosotros) · `cli` (Espera al cliente) · `fin` (Cobrada).

| Situación | Paso | Quién |
|---|---|---|
| Sin expediente · LEAD, PTE ENVIAR o EN CURSO (la preparamos y la enviamos nosotros) | 1 | nos |
| Sin expediente · ENVIADA o PRE-ACEPTADO, y la propuesta le llegó SOLO al instalador | 2 | tu (tarea «Pásale la propuesta a tu cliente» → acción `propuesta` de la obra) |
| Sin expediente · ENVIADA o PRE-ACEPTADO, el resto | 2 | cli |
| Sin expediente · ACEPTADA | 3 | nos |
| Sin expediente · RECHAZADA u otro | — | fuera de la app |
| Con expediente · visible RECHAZADA | — | fuera de la app |
| Con expediente · FINALIZADO | 5 | fin |
| Con expediente · EN CURSO y (estado ≥ PTE. CEE FINAL u «obra hecha») | 4 | ver abajo |
| Con expediente · el resto (ACEPTADA, EN CURSO antes de la obra) | 3 | ver abajo |

> Las tres primeras filas cambiaron el 21/11/2026: hasta entonces LEAD y PTE ENVIAR eran `tu` con la tarea
> «Envía la propuesta al cliente», que abría la oportunidad — donde el instalador no tiene botón de enviar.
> Y desde ese día una obra SIN expediente abre la MISMA ficha que una con él. Ver «La ficha de la OBRA es
> la misma con expediente y sin él» ([la-ficha-de-la-obra-para-toda-obra.md](docs/conocimiento/instalador-app/la-ficha-de-la-obra-para-toda-obra.md)).

Con expediente, **quién** = `tu` si tiene alguna tarea; `cli` si hay un Anexo I o una Cesión enviados sin
firmar; si no, `nos`. «Obra hecha» es el criterio del radar del parte diario (fin de obra comunicado,
facturas, CIFO enviado o generado, RITE). El estado visible sale de `estadoDesdeExpediente`.

**Tareas** (solo si su empresa es la INSTALADORA de la obra, `instaladorIdDe`, y la obra no está ni
FINALIZADA ni RECHAZADA), leídas con `estadoInstalador` (el mismo de `/instalador/:id`):
- `cifo` — «Firma el certificado de la instalación» (o «Vuelve a firmarlo» si hay re-firma): hay borrador, no
  está recibido ni bloqueado, y se le ha ENVIADO (o hay re-firma). → `/instalador/:expId`.
- `rite` — «Sube la legalización RITE»: no recibido, y se le ha enviado el RITE o el CIFO. → `/instalador/:expId`.
- `factura` — «Haz la factura de la obra»: sin facturas y con el CEE inicial registrado. → `/factura-obra/:expId?token=`
  si su empresa tiene plantilla y la obra no es RES080; si no, `/subir-docs/:opUuid?token=…&rol=instalador`.
  El token es el `upload_token` de ESA oportunidad y solo viaja dentro del enlace de su propia obra.
  **Desde la fase 2 (21/11/2026) ya no hay enlaces**: el destino es `{ tipo: 'accion', accion }` y la tarea
  se hace dentro de la obra, con sesión; el token no sale del servidor. Ver «La app del INSTALADOR, fase 2».

**Decisiones conservadoras de la fase 1** (a revisar con RCA): las RECHAZADAS no se enseñan; CIFO y RITE
solo cuentan como pendientes una vez ENVIADOS (antes «lo preparamos nosotros»); la factura se pide tras
registrar el CEE inicial; el paso 5 es FINALIZADO (cobro al cliente hecho); «lo suyo» es el criterio de
`soloLoSuyo` del listado de oportunidades (lo que creó él o lo de su empresa): un instalador puesto en la
oportunidad de un DISTRIBUIDOR no la ve aquí, igual que hoy no la ve en Oportunidades.

### Lo que devuelve la API (lista blanca)

**REGLA — la app del instalador nunca recibe margen, comisión, `via_fm`, notas internas, comisionista ni
enlaces de Drive (reglas 1, 102 y 218, y la de `via_fm` de cálculo), y ningún JSONB entero (regla 22).** Los `select` piden escalares concretos de
`datos_calculo`, `documentacion` y `seguimiento` (y `documentacion->facturas`, como el radar); el test
recorre la respuesta buscando las claves prohibidas. Lo ajeno o rechazado da **404** (no se confirma que
exista); con la BD caída, **503** `OBRAS_UNAVAILABLE` y la pantalla dice «ahora mismo no podemos», nunca
un cero (regla 38).

- **Bono**: sin expediente, la economía de la página de la oportunidad del partner (la de la reforma solo si
  la propuesta va solo con la reforma, `comparativaReforma === false`); con expediente, la aceptada por
  `propuestaGuardada` (la misma que el portal del cliente).
- **Las cuentas de tu cliente** (`cuentasCliente`): presupuesto − bono + IRPF del bono − deducción («hasta») +
  gestión. Es la fórmula del resumen de oportunidad del partner que se está construyendo aparte
  (`ResumenOportunidadPartner`, aún sin commitear el 21/11/2026): está COPIADA en `appInstalador.js`. Cuando
  ese resumen llegue a `main`, las dos deben salir de una sola función.

### Las pantallas

Estilo «carta de pago» (regla 164) **sin modo oscuro**: el instalador ve siempre papel crema, pase lo que pase
con el tema del CRM. CSS con prefijo `.ia-` inyectado por `EstiloInstalador`; tipografías auto-alojadas.

- **Cáscara propia** (`MarcoInstalador`, no se toca `DashboardLayout`). Móvil: cabecera con logo y avatar, y
  barra de abajo **Inicio · Obras · ＋ Nueva · Clientes · Catálogo** con «Nueva» en el centro, en naranja
  (hasta la fase 4 el quinto botón era Perfil; ahora el Perfil se abre con el avatar de la cabecera).
  Desde 1024 px: menú lateral blanco con «Nueva simulación» y el contador de lo que te toca, y el Perfil
  al pie. Desde la fase 3, debajo de Clientes en el menú lateral va «Tu página web» (en la barra de abajo
  no: se entra por Inicio, por el Perfil y por la obra); desde la fase 4, «Catálogo», entre Clientes y «Tu página web» (ver fase 4).
- **＋ Nueva** abre la «Nueva simulación» de siempre (`openNewSimulation`); al crearla, la calculadora se pinta
  DENTRO de la cáscara (`externo`, contenedor oscuro con «← Mis obras»). Igual una obra SIN expediente: se abre
  su oportunidad de siempre. Una obra CON expediente abre la ficha nueva de solo lectura.
- **Inicio**: saludo con el nombre de pila, «Hoy tienes N cosas», botón naranja «Calcular la ayuda de una
  obra», «Te toca a ti» con las tareas reales y su destino, y «Tus obras» (en marcha · esperan por ti · cobradas).
- **Obras**: buscador sin tildes (cliente, dirección, pueblo, nº), filtros Todas · Te toca · En marcha ·
  Cobradas; recuerda búsqueda, filtro y la elegida (regla 193, clave `instalador-obras`). En el ordenador, lista
  a la izquierda y la obra a la derecha (pide su detalle).
- **Una obra**: paso con su barra, «Te toca a ti» con la acción principal naranja, las cuentas del cliente,
  presupuesto y factura, equipo instalado (nº de serie, caldera que se quitó), «Fotos y papeles» y
  «¿Dudas con esta obra?» al WhatsApp de BROKERGY.
- **Clientes**: los de `GET /api/clientes` (ya filtra lo suyo), con llamar y WhatsApp, sus datos (**el DNI
  enmascarado en pantalla**: esa ruta se lo da entero al partner; el IBAN ya llega enmascarado y ni se
  enseña) y sus obras. Alta y «Cambiar datos» abren `ClienteFormModal` / `ClienteDetailModal` portaleados a
  `body`. Clave de memoria `instalador-clientes`.
- El botón **atrás** del móvil cierra la ficha abierta (una entrada de historial por ficha). Desde la fase 5, cada
  entrada lleva además su DIRECCIÓN (`?obra=…`): recargar y un enlace directo abren donde tocaba (ver fase 5).

### Lo medido (21/11/2026, banco a 390×844, 1280×800 y 360 px)

17 pantallas (Inicio, Obras, Obra, Clientes, Cliente, vacío y error, en móvil y PC, y las cinco a 360 px):
**sin scroll horizontal, sin errores de consola, ningún objetivo táctil por debajo de 44 px, ningún texto
cortado**. Dos arreglos salieron de medir: la dirección se cortaba con «…» (ahora hasta dos líneas) y
`Intl` en es-ES no pone el punto de miles en cifras de cuatro dígitos («6740 €»): `eur()` lo pone a mano.

### Para las fases 2 y 3

- **Fase 2 — HECHA el 21/11/2026** («La app del INSTALADOR, fase 2»): presupuesto, factura, certificado,
  RITE y fotos dentro de la obra con sesión; el titular de las cuentas es el bono; `GET /api/clientes` da 503
  con la BD caída. Sigue pendiente unificar `cuentasCliente` con el resumen del partner.
- **Fase 3 — HECHA el 21/11/2026** («La app del INSTALADOR, fase 3»): «Tu página web», el escaparate que
  propone el instalador y revisa BROKERGY. El catálogo con tarifas (Excel del distribuidor por marca, el
  instalador ajusta su precio) y los presupuestos con partidas del instalador quedan para más adelante.
- **Fase 4 — HECHA el 21/11/2026** («La app del INSTALADOR, fase 4»): el catálogo de aerotermia con tarifas.
- **Fase 5 — HECHA el 21/11/2026** («La app del INSTALADOR, fase 5»): el pulido con RCA, la dirección que
  recuerda dónde estás, sin red, instalable y con su marca. Para publicarla: «Publicar la app del INSTALADOR».
