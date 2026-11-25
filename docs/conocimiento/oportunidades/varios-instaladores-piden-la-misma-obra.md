<!-- conocimiento · área: oportunidades · las rutas de los enlaces son relativas a la raíz del repo -->

## Varios INSTALADORES piden la MISMA obra (2026-11-25)

**El caso** (Fran, 25/11/2026, 26RES060_OP360, HÉCTOR MUÑOZ MUÑOZ, Pedro Muñoz): la obra nos
llegó el 31/10 por SANTOS GONZÁLEZ GARRIDO (caldera de carbón, propuesta v1 el 05/11 con
presupuesto estimado de 15.000 €) y el 25/11 por ISM (Alejandro, J. PORRERO-HIJOS), con su
presupuesto 26-000305-01 de 11.868,70 € IVA incluido. El cliente pide presupuesto a varios
instaladores y cada uno nos pasa la obra. Fran quiere que quede registrado **quién la ha
pedido y en qué orden**, **qué propuesta se le manda a cada uno**, y que **el bono CAE sea
exactamente el mismo para todos**: lo único que cambia es el presupuesto del instalador.

Se descartaron:
- **Una oportunidad nueva por instalador**: la vivienda es la misma, con el mismo CEE y el
  mismo ahorro; la regla 47 y el alta (regla 99) ya paran una segunda alta sobre la misma RC.
- **Cambiar el partner** (`prescriptor_id`) al último que llega: del partner cuelgan los
  avisos y la comisión de la empresa (regla 81), y su siembra puede mover el bono.
- **Una lista en `datos_calculo`**: el guardado de la calculadora reescribe `datos_calculo`
  entero con lo que tiene el navegador, y una lista escrita por otra ruta se perdería.

### Lo que hay

| Qué | Dónde |
|---|---|
| Tabla `oportunidad_solicitudes` (instalador, orden, fecha, presupuesto con IVA, su nº, nota) | [oportunidad_solicitudes_schema.sql](implementation/backend/scripts/oportunidad_solicitudes_schema.sql) |
| Rutas (todas `staffOnly`): `GET/POST /api/solicitudes-partner/oportunidad/:id`, `PATCH/DELETE /:solicitudId`, `GET /instaladores` (ligera, sin logos) | [routes/solicitudesPartner.js](implementation/backend/routes/solicitudesPartner.js) |
| Lógica pura: para quién es cada versión, el candado del bono, versiones por instalador | [utils/solicitudesPartner.js](implementation/backend/utils/solicitudesPartner.js) |
| El chip de la cabecera de la calculadora y su lista | [SolicitudesPartner.jsx](implementation/frontend/src/features/solicitudes/SolicitudesPartner.jsx) |
| Prueba sin BD | `node implementation/backend/scripts/test_solicitudes_partner.js` |

**REGLA — la oportunidad sigue siendo UNA y sigue colgando de su `prescriptor_id` (el 1º).**
Los demás instaladores van en `oportunidad_solicitudes` con su orden. La primera vez que se
añade a otro, se escribe también el 1º (el partner de la oportunidad, con la fecha de alta y
el presupuesto de ese momento) para que el orden quede escrito y no deducido; mientras la
tabla no tiene filas, el 1º sale implícito. El 1º no se quita.

**REGLA — elegir «Preparar la propuesta para este» pone SU presupuesto y SU marca, nada más.**
En la calculadora, `inputs.partner_propuesta_id` (null = el 1º) y `inputs.presupuesto` /
`presupuestoEstimado` del elegido; se guarda con «Guardar Oportunidad», como cualquier
input. La propuesta (`ProposalModal`) carga como partner a `partner_propuesta_id ||
prescriptor_id`: de ahí salen el co-branding de la portada, «En colaboración con {empresa}»
al titular (regla 132) y la fila PARTNER del popup de envío con sus personas (regla 44.b).
**La comisión NO se toca** (sigue la pactada con el 1º en `caePricePrescriptor`) y, si la
propuesta es para otro, **a ese no se le dice** la línea de comisión del mensaje (regla 81):
es la de otra empresa.

**REGLA — el bono CAE es el MISMO para todos, y lo vigila el BACKEND al registrar la
versión.** `POST /:id/propuesta/version` sella en la versión `partner_id` y `partner_nombre`
y, antes de rasterizar o reservar número, compara su bono —opción con opción, tolerancia
1 €— con la ÚLTIMA versión enviada a CADA uno de los OTROS instaladores
(`comprobarBonoIgual`). Si no casa responde **409 `BONO_DISTINTO`** y no sale nada. A uno
mismo sí se le puede mandar una versión corregida. El popup de envío lo enseña y deja
confirmar (`bonoDistintoConfirmado`, queda sellado en la versión) para el caso legítimo: un
CEE nuevo que cambia el ahorro de todos, y entonces hay que mandar la versión nueva también
a los demás. Las versiones antiguas, sin `partner_id`, cuentan como del 1º.

**REGLA — qué propuesta tiene cada uno se CALCULA de `propuesta_versiones`** (`partner_id`
de cada versión), no se guarda aparte: el chip enseña bajo cada instalador sus versiones
(nº, fecha, a quién —cliente / instalador / por enlace—, bono y si se aceptó).

**REGLA — es del EQUIPO INTERNO.** Rutas `staffOnly` y chip solo para ADMIN y TRABAJADOR:
a un partner no se le dice que otro instalador ha pedido la misma obra.

### Lo que NO se ha hecho (todavía)

- El listado de oportunidades no lo enseña (solo la cabecera de la calculadora).
- La página del partner (`ResumenOportunidadPartner`) no lo sabe: un partner solo ve las suyas.
- Si se ACEPTA, el expediente nace con el `prescriptor_id` de la oportunidad (el 1º), no con el
  instalador cuya propuesta aceptó el cliente. Hay que cambiarlo a mano con `/asignar` mientras
  no se decida otra cosa.

Tras tocarlo: `node implementation/backend/scripts/test_solicitudes_partner.js`,
`test_importes_propuesta.js`, `auditar_rutas_sin_guardian.js` y el build.
