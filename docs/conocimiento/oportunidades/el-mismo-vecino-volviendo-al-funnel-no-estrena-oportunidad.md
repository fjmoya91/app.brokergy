<!-- conocimiento · área: oportunidades · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El mismo vecino volviendo al funnel NO estrena oportunidad (2026-09-11)

Medido el 11/09/2026: **26RES060_OP113 y 26RES060_OP179**, misma referencia
catastral (`0032105VJ7103S0001RA`), mismo móvil, dos oportunidades y **dos
clientes**. Manuela rellenó el formulario público en junio y otra vez en
septiembre, y la segunda vez nació de cero. De 310 oportunidades era el único
duplicado real —la otra RC repetida es la migración de AppSheet, que es
esperada—, pero el agujero estaba abierto para cualquiera.

**El duplicado no nacía en la comprobación de la oportunidad: nacía en el
CLIENTE.** `upsertClienteFromLanding` solo reconoce a alguien por **email o
DNI**, y **85 de los 376 clientes no tienen ninguno de los dos** — solo
teléfono. Así que el mismo vecino estrenaba ficha, y la idempotencia de abajo,
que exigía `ref_catastral` **Y `cliente_id`**, ya no podía casar nada. Por eso la
comprobación se ha subido ANTES del upsert (`buscarLeadPrevio` en
[leadService.js](implementation/backend/services/leadService.js)): si hay lead
previo se reutiliza SU cliente y solo se le **rellenan los huecos** (el apellido
que ahora sí ha dado), nunca se pisa lo escrito.

**REGLA — el TELÉFONO solo desempata DENTRO de la misma vivienda, jamás a
secas.** Es el arreglo que pide el cuerpo y sería el peor: medido sobre los 376
clientes, el móvil `695615330` figura en **cinco** fichas de personas distintas
(JUAN, EVA MAYRA VERDEJO, jesús, DAVID PEDRAZA, RAFAEL) y el `610171667` en
cuatro — son teléfonos de instalador o de comercial metidos como contacto del
cliente. Deduplicar la base de clientes por teléfono **fusionaría expedientes de
gente distinta**, que es mucho peor que el duplicado que esto evita. Pero el
mismo número sobre la MISMA referencia catastral ya no es coincidencia: es la
misma gestión. Y se compara por los **nueve últimos dígitos** (`tlf9`), porque la
misma persona llega unas veces como `+34672358309` y otras como `672358309` —
306 clientes guardados sin prefijo y 9 con él.

**REGLA — solo se reutiliza un LEAD.** Una oportunidad ENVIADA o ACEPTADA tiene
propuesta enviada, carpeta de Drive movida y puede tener expediente detrás:
machacarla con lo que teclee alguien en el formulario público sería mucho peor
que tener dos filas. El buscador mira además **los diez últimos** registros de
esa RC y no solo el más reciente — era un `.limit(1)` + `find(LEAD)`, así que un
LEAD detrás de una ENVIADA no se veía siquiera.

**REGLA — al visitante se le AVISA, nunca se le bloquea.** `GET
/api/landing/check-rc/:rc` ya enseña "ya hicimos una simulación para esta
vivienda" al resolver el inmueble (con botón **Abrir oportunidad** cuando quien
mira es staff). A un cliente no se le puede cerrar la puerta, y hay segundas
altas legítimas: otro escenario, la anterior rechazada, una compraventa con
cambio de titular, o dos vecinos distintos de la misma finca.

**REGLA — pero un alta sobre una vivienda que YA tiene oportunidad se ANOTA.** Si
no se reutiliza nada, el historial de la nueva recibe una entrada del Sistema con
**cuáles son las otras, su estado y su fecha**. Sin eso, quien la abra dentro de
tres meses no tiene forma de saber que existe la otra — que es exactamente lo que
pasó aquí: la OP179 se trabajó cuatro meses sin que nadie supiera de la OP113.

**En modo interno ("Nueva simulación") NO hay upsert**, a propósito: el
partner/admin puede querer rehacer cálculos. Ahí la red es el aviso del funnel y
esta nota en el historial.

```bash
node implementation/backend/scripts/test_lead_duplicado.js          # los puros, sin BD
node implementation/backend/scripts/probar_lead_previo.js [RC]      # contra datos reales, solo lee
```
