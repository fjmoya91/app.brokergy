<!-- conocimiento · área: instalador-app · las rutas de los enlaces son relativas a la raíz del repo -->

## El CATÁLOGO por DISTRIBUIDOR: sus marcas, la tarifa de cada uno y el pedido al comercial (2026-11-22)

**Por qué.** Fran, 22/11/2026, entrando como RCA: «Desde mi web le he dicho las marcas con las que
trabaja, pero no le aparece nada en el Catálogo. Quiero que el catálogo le aparezcan las marcas, tipo
nuestro catálogo pero solo las marcas con las que trabaje. Si selecciona un modelo, que le salga su tabla
de precios… con los distribuidores con los que trabaja. Por ejemplo, RCA trabaja con Electrofil, pero
también ponle con Calindsa… ver de un modelo los dos precios… e incluso seleccionar de quien lo va a
comprar… solicitarse a través de email o WSP al comercial automáticamente». Diseño aprobado con «Sí,
así», el pedido saliendo del WhatsApp de BROKERGY. Amplía la fase 4 («La app del INSTALADOR, fase 4»).

**Qué fallaba.** Las marcas del instalador se leían de la SESIÓN, que `middleware/auth.js` guarda en caché
5 minutos: Fran le marcó las marcas en su ficha y el Catálogo siguió en «Aún no tienes marcas». Ahora se
leen **frescas de su ficha en cada petición** (`marcasDeFicha` en
[services/catalogoTarifas.js](implementation/backend/services/catalogoTarifas.js)).

| Qué | Dónde |
|---|---|
| El SQL (sin aplicar) | [catalogo_distribuidores_schema.sql](implementation/backend/scripts/catalogo_distribuidores_schema.sql), **después** de `aerotermia_tarifas_schema.sql` |
| Tarifas por distribuidor y el DTO | `vigentesPorDistribuidor`, `marcasDeFicha`, `equipoParaInstalador` en [services/catalogoTarifas.js](implementation/backend/services/catalogoTarifas.js) |
| La carga con distribuidor y «Le compra a…» (ADMIN) | [routes/aerotermiaTarifas.js](implementation/backend/routes/aerotermiaTarifas.js): `GET /distribuidores`, `GET`/`PUT /proveedores/:instalador` |
| El pedido: comercial, texto, envío | [services/pedidoDistribuidor.js](implementation/backend/services/pedidoDistribuidor.js) |
| Las rutas del instalador | [routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js), bloque «FASE 4» |
| El popup «Cargar tarifa» con el distribuidor | [CargarTarifaModal.jsx](implementation/frontend/src/features/aerotermia/components/CargarTarifaModal.jsx) |
| «Le compra a…» en la ficha del instalador | [LeCompraA.jsx](implementation/frontend/src/features/admin/components/LeCompraA.jsx), en [PrescriptorDetailModal.jsx](implementation/frontend/src/features/admin/views/PrescriptorDetailModal.jsx) |
| Las pantallas | [CatalogoView.jsx](implementation/frontend/src/features/instalador/views/CatalogoView.jsx) (rejilla de marcas, tabla de precios, `HojaPedido`) |
| Banco sin API | `/instalador-demo.html?seccion=catalogo`, `?equipo=101` (dos distribuidores), `103` (ya se lo compra a uno), `&proveedores=0`, `&pedido=seco`, `&catalogo=sinmarcas`, `?tarifa=1` (también enseña «Le compra a…») |
| Pruebas | `test_catalogo_instalador.js` (121), más `test_rutas_sin_sesion.js`, `test_rutas_partner.js`, `auditar_rutas_sin_guardian.js`, `test_app_instalador.js`, `test_caida_bd_no_miente.js` |

### El esquema (aditivo)

- `aerotermia_tarifas_cargas.distribuidor_id` y `aerotermia_tarifas.distribuidor_id` → la empresa
  DISTRIBUIDOR de `prescriptores` (`ON DELETE RESTRICT`). **Una tarifa es de UN distribuidor**; la vigente
  se calcula **por (modelo, distribuidor)**, con la misma regla de siempre (la de `vigente_desde` más
  reciente ya empezada). Las tarifas cargadas antes sin distribuidor NO se enseñan (el 22/11/2026 había 0
  filas en producción: la tabla aún no existía).
- `instalador_proveedores` (instalador, distribuidor, único): a quién le COMPRA.
- `instalador_compra_equipo` (instalador, modelo → distribuidor, único por instalador y modelo): de quién
  se lo compra ese modelo, recordado.
- `instalador_pedidos`: cada pedido que SALIÓ (o falló): cantidad 1–50, obra y nota opcionales, la tarifa
  de ese momento, **el texto EXACTO**, los canales y `ENVIADO`/`FALLIDO`.
- RLS sin policies, GRANT a `service_role`, REVOKE a `anon`/`authenticated` (regla 150). **Va ANTES del
  deploy**: sin las columnas el Catálogo responde 503 y la carga no confirma.

**REGLA — «Le compra a…» NO es la red del distribuidor.** `distribuidor_instalador` le da al distribuidor
visibilidad sobre los clientes y las obras del instalador; `instalador_proveedores` solo dice a quién le
compra equipos. Se guardan en tablas distintas para que marcar a Calindsa como proveedor de RCA no le
enseñe a Calindsa las obras de RCA.

### Lo que hace BROKERGY (CRM, solo ADMIN)

- **Cargar tarifa (Excel)** pide ahora el DISTRIBUIDOR en un desplegable de las empresas DISTRIBUIDOR (si
  solo hay una, ya viene elegida): `distribuidor_id` va a `/leer` y a `/confirmar` (400
  `FALTA_DISTRIBUIDOR` / `DISTRIBUIDOR_NO_VALIDO`). Lo demás (dos pasos, firma, 409 `PLAN_CAMBIADO`) no
  cambia. Una tarifa por distribuidor y marca: Electrofil y Calindsa suben cada uno su Excel.
- **«Le compra a…»** en la ficha de una empresa INSTALADORA: chips con ✕ y «+ Añadir distribuidor…». Se
  guarda AL MOMENTO (`PUT /proveedores/:id`, adminOnly), no con el «Guardar» de la ficha.

### Lo que ve el instalador

**REGLA — el instalador ve SOLO sus marcas y, de cada modelo, la tarifa de los distribuidores a los que
COMPRA, con su nombre; nunca la de otro distribuidor, el margen, la comisión, el teléfono o el correo del
comercial, ni otro instalador.**

- `GET /catalogo` → `{ sin_marcas, marcas: [{ nombre, logo, equipos }], proveedores: [{ id, nombre }],
  equipos }`. Se abre en una **rejilla de logos** de sus marcas (también las que aún no tienen equipos:
  dentro dicen «Todavía no hay equipos de esta marca»); al tocar una, sus modelos, con «← Marcas»; con una
  sola marca se entra directo. Buscar mira en todas. Marca y búsqueda se recuerdan en la sesión del
  navegador (`useVistaGuardada('instalador-catalogo')`, regla 193). Sin distribuidores marcados, un aviso:
  «Todavía no sabemos a qué distribuidores les compras».
- Cada equipo trae `tarifas: [{ distribuidor_id, distribuidor, precio, desde }]` (de más barata a más cara),
  `compro_a` y `tarifa` = la de quien se lo compra o, si no ha elegido, la más barata (`elegida: false`).
  La tarjeta dice «la mejor de 2» o «de {distribuidor}».
- La ficha enseña la **tabla de precios por distribuidor** (un grupo de opciones): chip «Más barato» y
  «Se lo compras a este»; elegir una fila es `PUT /catalogo/:id/compra` (400 `DISTRIBUIDOR_NO_SUYO`).
- Sin proveedores marcados no ve ninguna tarifa: «Sin tarifa todavía», nunca un 0.
- En el PC (≥ 1024 px, con el «ancho en PC» de la fase 5, `c5f20ee1`): logos y equipos en rejilla
  (`.ia-mc-rejilla`, `.ia-eq-rejilla`) y la ficha en dos columnas (`.ia-pc-dos`): «Lo que hace» y «Sus
  papeles» a la izquierda; la tabla de distribuidores, «Pedir a…», tu precio y «Calcular» a la derecha. En
  el móvil los envoltorios son `display: contents` y `order` deja el orden de siempre.

### El pedido al comercial

**REGLA — el pedido se ENSEÑA entero antes de salir, sale del WhatsApp de BROKERGY (y por email si el
comercial lo tiene) con copia al instalador, queda apuntado, y nace APAGADO
(`PEDIDOS_DISTRIBUIDOR_ENABLED`).**

- `POST /catalogo/:id/pedido { distribuidor_id, cantidad, obra?, nota?, previa? }` (`enforceAuth` + beta):
  - `previa: true` → solo el texto (no escribe ni envía): «Ver el mensaje» lo pinta como un globo de
    WhatsApp, con a quién va y por qué canales;
  - sin `previa` y con el interruptor APAGADO → **`en_seco: true`** con el borrador; no escribe nada;
  - encendido → `enviar`: WhatsApp al teléfono del comercial, email si tiene correo, y la copia al
    teléfono del instalador; apunta `instalador_pedidos` (`ENVIADO` o `FALLIDO`); sin ningún canal, 502
    `PEDIDO_NO_ENVIADO`.
- El comercial es el primer contacto con teléfono o correo de `contactos_notificacion` del distribuidor
  (o los datos de contacto de su ficha); sin ninguno, **409 `SIN_COMERCIAL`**. **El teléfono y el correo
  del comercial nunca llegan al navegador**: solo su nombre y los canales posibles.
- El texto lo compone `mensajePedido` (sin emojis, negrita con `*…*`), con la tarifa vigente del
  distribuidor y el teléfono del instalador para que le contesten a ÉL:

  > Hola Ana, \*RCA\* os hace este pedido a través de BROKERGY:
  > - Equipo: \*MARCA MODELO\* (ud. exterior …)
  > - Cantidad: 2 · Obra: … · Precio de vuestra tarifa: … sin IVA (desde el …) · Nota: …
  >
  > Para confirmar plazo y precio, contestad directamente a RCA en el {su teléfono}. — BROKERGY

  y la copia al instalador empieza «Copia del pedido que hemos mandado a {comercial} ({distribuidor}):».

### Para desplegar y estrenarlo con RCA

1. `aerotermia_tarifas_schema.sql` (fase 4) y después `catalogo_distribuidores_schema.sql`, **ANTES** del
   deploy (aditivos e idempotentes).
2. Deploy, con `PEDIDOS_DISTRIBUIDOR_ENABLED` **sin poner** (apagado: el pedido contesta en seco).
3. En el CRM: ficha de RCA → «Le compra a…» → Electrofil y Calindsa.
4. Cargar el Excel de cada distribuidor eligiéndolo en el popup.
5. Comprobar que la ficha de cada distribuidor tiene un contacto comercial con teléfono (y correo, si se
   quiere el email).
6. Probar un pedido en seco desde la app de RCA y, visto el texto, encender
   `PEDIDOS_DISTRIBUIDOR_ENABLED=true` en el VPS. En el `.env` local, siempre apagado.
