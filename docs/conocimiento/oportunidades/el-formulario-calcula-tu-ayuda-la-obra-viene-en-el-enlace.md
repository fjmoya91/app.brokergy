<!-- conocimiento · área: oportunidades · las rutas de los enlaces son relativas a la raíz del repo -->

## El formulario «Calcula tu ayuda»: la obra viene en el enlace, y pregunta lo que decide el FM (2026-11-09)

**Caso**: la web nueva (brokergy.es/ayudas, repo `brokergy-web`) tiene dos tarjetas, «cambio la caldera
por aerotermia» y «reforma», y las dos llevaban a la app. El cliente elegía la obra en la web y la app
se la volvía a preguntar («¿qué mejora te interesa?»). La tarjeta de la reforma no decía qué es una
reforma (aerotermia + ventanas y aislamiento). El formulario no sabía nada del factor multiplicador
(BOE-A-2026-23367): ni si la casa es vivienda habitual, ni si la obra empezó desde el 22/03/2026, ni
el bono social. Fran dio el «sí» a la propuesta el 09/11/2026.

### Dónde vive y por qué

**REGLA — el formulario vive en la APP (`app.brokergy.es/calcula-tu-ayuda`); la web solo enlaza con
`?obra=`.** El funnel son unas 4.300 líneas: la búsqueda en el Catastro por el proxy de la app, el
cálculo (`computeFullCalculatorResult`), el aviso de vivienda repetida (`check-rc`) y el alta
(`POST /api/landing/lead`). Además, es el MISMO componente que la «Nueva simulación» del CRM. La web
es Astro estática en el VPS: llevar allí el formulario sería duplicarlo y que los dos acabaran
calculando distinto. La identidad de la web la pone la piel `.lf` (regla 164).

### Una sola ruta, y la obra en el enlace

- `/calcula-tu-ayuda`, `/reforma`, `/ayudas-aerotermia` y `/p/:slug` entran todas por
  `ReformaSubFlow` (variant `reforma`). El parseo está en `landingRoute` de
  [App.jsx](implementation/frontend/src/App.jsx).
- **`?obra=caldera|reforma`** (lista cerrada). `/reforma` es `obra=reforma`; `/ayudas-aerotermia`, sin
  `obra`, es `caldera`.
- **`?ref=`**, quién mandó el enlace (`^[a-z0-9_-]{1,30}$`, en minúsculas). Viaja en
  `landing_funnel.ref` y sale en el aviso. `ref=wa` es la respuesta automática de WhatsApp a quien
  escribe por primera vez (regla 206, «La BIENVENIDA» en `docs/conocimiento/whatsapp/`).
- **REGLA — en el enlace no va nunca un dato personal.** Solo la obra y una etiqueta corta. El nombre,
  el teléfono y la dirección se escriben en el formulario.

**Sin `obra`**, la portada enseña las dos tarjetas: «Cambio la caldera por aerotermia» y «Reformo la
casa: aerotermia + ventanas y aislamiento».

**Con `obra`**, no se pregunta el tipo:
- **caldera**: va directo a la caldera de hoy;
- **reforma**: llega a «¿Qué quieres incluir en la ayuda?» con la aerotermia ya marcada.

`isReforma` se recalcula según se marque o no la envolvente (`goAfterElementos`).

### Lo que se dejó de preguntar en el público (el CRM sigue igual)

- **El gasto anual.** No mueve el bono y el ahorro ya sale teórico.
- **La condensación.** Gas o gasóleo de menos de 10 años se da por condensación
  (`Step3_EdadCaldera`, `condensacion: 'si'`). Con más años no se pregunta y queda `no_se`, como antes.
- **Con qué calientas hoy el agua.** Lo decide la caldera: si es de combustión, «la misma caldera»; si
  no, termo. Solo se pregunta si la aerotermia dará también el ACS (`Step5_ACS`, `soloIncluir`).
- **La dirección va antes que la referencia catastral** en el buscador (`modoInicial="address"`).
- **«¿Es esta tu casa?»** enseña la dirección legible (`direccionLegible`), el año y la superficie,
  sin la RC.

### Lo que se pregunta ahora: lo que decide el factor multiplicador

Va antes del presupuesto, en `ReformaSubFlow` (`tramoFinal`), y **solo si la obra lleva aerotermia**:
sin caldera en la obra no hay vía FM.

1. **`fm_fecha`**, solo con la obra empezada: «¿Cuándo empezó la obra?» (`desde` / `antes` / `no_se`).
   La vía FM es para obras desde el 22/03/2026; antes, «sigue habiendo ayuda: la de siempre».
2. **`hogar`**: «¿Vive alguien en la casa todo el año?» (`propia` / `otra` / `segunda`). El FM es
   solo para vivienda habitual. Se pregunta en neutro: una casa alquilada todo el año también vale.
3. **`bono_social`**, solo si vive alguien, la caldera es de gas o gasóleo y la obra no es de antes: «¿En
   casa tenéis el bono social de la luz?». Si dice que sí, va a **`bono_fn`**: «¿Os lo dieron solo por
   ser familia numerosa?». **La familia numerosa sola no cuenta como vulnerable** para el ×1,5.

Los campos son `obra_inicio_fm`, `vivienda_habitual`, `bono_social` y `bono_social_solo_fn`
([useFunnelState.js](implementation/frontend/src/features/landing/hooks/useFunnelState.js)).
**REGLA — el bono social no se guarda en el navegador** (`NO_PERSISTIR`): es un dato de la situación
económica de la casa y el navegador puede ser compartido.

### El resultado

**«Tus dos ayudas»** ([LeadDeliveryView.jsx](implementation/frontend/src/features/landing/views/LeadDeliveryView.jsx)):
- el bono CAE neto («te lo pagamos por transferencia»);
- la deducción del IRPF («te la aplicas en la Renta»);
- debajo, la inversión neta y el ahorro.

**REGLA — la vía FM va APARTE y nunca se suma a la cifra.** Es un bloque verde: «Desde el 15/01/2027 ·
Bono hasta X € · Con el factor multiplicador. Hay un cupo: te decimos qué te conviene.» Se pinta solo
si se cumplen todas estas condiciones:
- la ficha es RES060;
- la caldera es de gas o gasóleo;
- no es segunda residencia;
- la obra no es de antes del 22/03/2026;
- `resumenViaFm` dice `aplica` y `elegible`;
- el neto FM supera al normal.

Con el ACS supuesto añade «si la aerotermia da también el agua caliente». Con bono social que no sea
solo por familia numerosa, añade «puede subir un 50 % más». **La cifra todavía no lleva el ×1,5**.

La pantalla tras enviar (`LandingResultView`) escribe ya «Inversión de la reforma» en una reforma y
los miles con punto (`useGrouping: 'always'`: en es-ES, «3933 €» salía sin él).

### En el servidor

- `POST /api/landing/lead` calcula **`via_fm`** con `viaFmDe` para los leads públicos y lo guarda en
  `datos_calculo.via_fm`, igual que el alta por WhatsApp y la calculadora. Es la columna «Vía FM».
- El **aviso al chat de administración** sale ahora para **todo lead público**. Antes iba solo con
  `origen: 'reforma'`, que en la práctica ya era todo. Lleva la obra elegida y quién mandó el enlace,
  y la vivienda habitual, la fecha de la obra y el bono social. La línea «⚖️ Vía FM» lleva sus pegas
  («NO cabe: segunda residencia», «NO cabe: obra anterior al 22/03/2026»). Ver «El aviso de LEAD WEB
  trae lo necesario para decidir».

### Lo medido (en seco, 09/11/2026)

**CL TOLEDO 22, Ciudad Real**: piso de 91 m², gas de menos de 10 años, radiadores, con ACS.

| | Bruto | Neto para el cliente |
|---|---|---|
| Bono CAE | 852 € | 602 € |
| Vía FM | 1.700 € | 1.450 € |

`resumenViaFm` en el navegador y `viaFmDe` en el servidor dan lo mismo: 1.700 € y 17 MWh.

La misma casa como reforma (aerotermia + ventanas, obra a medias) sale RES080: 933 € de bono y
3.933 € con el IRPF. No hay bloque FM porque el RES080_FM no se calcula.

Recorridos los dos caminos a 390 px y en escritorio, con el POST bloqueado en el navegador: no se creó
ninguna oportunidad.

### Lo que queda

- **El bloque verde de la vía FM no sale en producción todavía** (publicado el 10/11/2026 sin él): la cuenta del
  navegador necesita `res060fc` dentro de `computeFullCalculatorResult` (`features/landing/data/landingCalculation.js`),
  que está en la copia local de la sesión del FM, sin subir. Sin él, `resumenViaFm` no da `elegible` y el bloque no se pinta;
  lo demás funciona igual. Sale solo en cuanto esa sesión suba el fichero.
- **Pendiente de la sesión del FM**:
  - pasar `vulnerable` desde `landing_funnel.bono_social === 'si' && bono_social_solo_fn !== true`;
  - que `resumenViaFm` diga «no aplica» con segunda residencia o con obra de antes. Hoy lo filtran la
    pantalla y el aviso.
- **Sin hacer**:
  - el RES080_FM;
  - la tarjeta `ConfirmationCard`, que es compartida y sigue enseñando la RC y los «vecinos detectados»;
  - la barra de progreso con emojis de dinero.

**Tras tocarlo**:
- `node implementation/backend/scripts/test_aviso_lead_admin.js`;
- `node implementation/backend/scripts/test_lead_duplicado.js`;
- el build (`check-hooks`);
- los dos caminos con el POST bloqueado. **Local escribe en PRODUCCIÓN**: el formulario no se envía de
  verdad.
