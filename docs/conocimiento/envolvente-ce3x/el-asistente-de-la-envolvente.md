<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## El ASISTENTE de la envolvente: se dice lo que está mal y se corrige (2026-10-27)

**Lo pidió Fran:** «Con un audio o con texto en lenguaje natural se le describe lo que está mal, y él
corrige la envolvente y vuelve a generar el CEE. Con la LLAVE DE CLAUDE y gastando los menos tokens
posibles.» Los tres ejemplos del encargo, y lo que hace cada uno:

| Se dice | Lo que enseña antes del «Sí» |
|---|---|
| «La ventana V3 no va en la FB1 sino en la FB3, y es de PC» | `V3: FBE1 → FBE3` · `V3 (FBE3): marco Metálico, sin rotura → PVC` |
| «El garaje llega hasta el final de la vivienda» | si le faltan metros por DOS lados, **pregunta** cuál («¿el este, 7 m, o el norte, 5 m?») |
| «Cambia las medidas de mejora: quita la aerotermia y pon el autoconsumo» | `Medidas de mejora (inicial): + Autoconsumo · − Aerotermia` |

Panel **«Asistente»** arriba de la columna de la pared (dentro de su caja fija: se ve siempre, y «esta
pared» es la que está abierta debajo), en el CRM y en la app de certificadores (`origen=ext`), solo
con el plano traído. Caja de texto + micrófono + «Ver». Con el resultado: «Sí, aplicar», «Sí, y
generar el CEE» o «No». Se deshace con Ctrl+Z, como todo lo de la ventana.

Fuentes: [services/asistenteEnvolvente.js](implementation/backend/services/asistenteEnvolvente.js)
(Claude), [logic/asistenteEnvolvente.js](implementation/frontend/src/features/cee-envolvente/logic/asistenteEnvolvente.js)
(resumen, validar y aplicar; puro), [components/AsistenteEnvolvente.jsx](implementation/frontend/src/features/cee-envolvente/components/AsistenteEnvolvente.jsx)
(el panel) y las rutas `POST /api/cee-envolvente/:id/asistente` y `…/asistente/voz`.

### Cómo gasta tan poco: tres pasos y Claude solo en el del medio

1. **El navegador resume el plano** (`resumenCompacto`): una línea por pared con su tipo, rumbo,
   largo, planta y huecos (`V1 ventana 1.20×1.20? Metálico sin RPT/Doble/persiana`, `?` = sin
   confirmar), las zonas con **cuántos metros le faltan a cada lado hasta el borde de su planta** (por
   rumbo, en los ejes del edificio), el catálogo de medidas con `[x]`/`[ ]`/`(no disponible)` y la
   pared seleccionada. Es lo ÚNICO que viaja: ~600 tokens. El trabajo entero son cientos de miles.
2. **Claude devuelve OPERACIONES con esquema** (`output_config.format` = `json_schema`): `mover_hueco`,
   `carpinteria`, `medida_hueco`, `anadir_hueco`, `quitar_hueco`, `cambiar_pared`, `ajustar_zona`,
   `nueva_zona`, `quitar_zona`, `medidas`. Las instrucciones (~5.600 tokens, fijas, con siete ejemplos) van con
   **caché de prompt**. Primero **Haiku 5.5** (sin razonamiento, esfuerzo bajo); **Sonnet 5.5** solo
   si Haiku no da algo legible, si no está seguro y no pregunta, o si nada de lo que propuso casa con
   el plano (el navegador lo reintenta UNA vez con el motivo).
3. **El navegador valida y aplica** (`validarOperaciones`): casa cada nombre con su pared, hueco, zona o
   medida de verdad sobre una COPIA que avanza paso a paso (mover y luego cambiar el marco del mismo
   hueco), y lo escribe en palabras. **Lo que no casa NO se aplica: se dice en ámbar.** Con el «Sí»
   lo aplican `transformarMuros` / `zonasAjustadas` / `medidasCambiadas` con las MISMAS reglas que
   los botones (`mudarHueco`, la carpintería de `ponCarpinteria`, el nombre de `reclasifica`, tocar
   una medida la confirma).

**Medido el 27/10/2026** (`test_asistente_envolvente.mjs --en-vivo` y la ventana de 26RES080_95 en
seco): **0,00015–0,0003 $ por corrección** con la caché caliente (≈ 600 de entrada + 4.273 —hoy 5.563— leídos de
caché + 100–200 de salida, Haiku), **0,0007 $ la primera** de cada 5 minutos (escribe la caché), unos
**6 s**. El audio se transcribe con Gemini (`llamarGemini`, nivel de pago) en **~2 s** y solo viaja
el TEXTO a Claude. Cada petición se apunta en `backend/scratch/asistente-envolvente/consumo.jsonl`
(fuera de git): quién, obra, lo dicho (300 caracteres, para afinar las instrucciones con lo que de
verdad se dicta), modelo, tokens, milisegundos y coste por vuelta.

### Lo que se aprendió del esquema (y costó una tarde)

- **Un solo objeto con 21 campos que admiten `null`** → 400: la API no admite más de **16 uniones**.
- **El mismo objeto con 21 campos OPCIONALES** → la API tardaba **más de 90 s** compilando la
  gramática (y el test se colgaba). Un esquema pequeño, 2,8 s: era el esquema.
- **Lo que funciona: un `anyOf` con UNA forma por operación, todos sus campos obligatorios**, y «no
  cambia» dicho con un valor (`"igual"` o `0`). ~6 s. `limpiarOperaciones` (backend) quita esos
  «no cambia» y deja la forma que valida el navegador.
- Haiku 5.5 acepta `thinking: {type:'disabled'}`; **Sonnet 5.5 lo rechaza** (va con `between_tools`).

### Las decisiones

**REGLA — a Claude solo va el RESUMEN, y lo compone el NAVEGADOR.** Es quien tiene el plano tal y como
se ve (con lo que no se ha guardado todavía) y los nombres que la persona lee en pantalla. El backend
no relee el trabajo ni lo manda.

**REGLA — Claude no edita: PROPONE, y el navegador VALIDA contra el plano de verdad.** Ningún nombre
que no exista llega a aplicarse; la operación que no casa sale como aviso. Lo que no se puede afirmar
no se inventa: el modelo pregunta («¿el este o el norte?») y la respuesta se escribe en la misma caja
(viaja con la pregunta delante).

**REGLA — antes del «Sí» se dice lo que se ROMPE.** Medido en la prueba de 26RES080_95: alargar el
garaje «hasta el final» por el lado equivocado se tragaba FBE1 y FBO2, y al volver a medir sus 9
huecos se quedaban sin pared (la ventana lo avisaba, pero DESPUÉS). Ahora `validarOperaciones`
devuelve `avisos`: las paredes con huecos que quedan dentro o en el borde de la zona nueva. Y si se
dice «FB1» habiendo FBE1 y FBO1 y el modelo elige una sin preguntar, se dice cuál (`paredesAmbiguas`).
Lo que le falta a una zona por debajo de **0,5 m** se le dice 0 (es el trazo): con 0,3 m al oeste,
«hasta el final» se preguntaba por un lado que no existe.

**REGLA — aplicar y generar van por ESTADO, no en el mismo clic.** `volverAMedir` y `generarCex` leen
el plano de SU pintado: llamadas justo después de `setMuros` medirían y escribirían el plano de antes.
`aplicarAsistente` aplica los muros (un solo paso de deshacer, `plano.aplicaAsistente`) y las medidas
(por SU fase, que puede no ser la que se previsualiza), y deja en `tareaAsistente` lo que queda: un
efecto vuelve a medir con las zonas nuevas y, en el pintado siguiente —ya con la geometría nueva—,
pide generar (`pedirGenerar`, con su popup si falta algo).

**REGLA — las zonas se cambian como RECTÁNGULO en los ejes del edificio, y los m² los pone el motor.**
`ajustar_zona` alarga la caja de la zona por un lado (hasta el borde o tantos metros) y `nueva_zona`
pega una franja a un lado de la planta; se guardan en el MUNDO como las de siempre y el motor las
interseca con la huella al volver a medir. Una zona que no era un rectángulo se rehace como su caja,
y se dice.

**Guardianes** (los de las demás rutas de la ventana): `internoOExtSuyo` + `staffSiOportunidad`, y al
certificador externo `limiteExt('asistente')` (60 por hora) y `limiteExt('asistente_voz')` (40 por
hora). El audio: multer en memoria, 8 MB, solo `audio/*`. El navegador dicta con la Web Speech API
(Chrome, Edge, Safari); donde no la hay, graba (MediaRecorder: `audio/webm;codecs=opus`, que Gemini
lee) y transcribe el servidor.

### Las instrucciones y los EJEMPLOS, afinados con lo que falló (27/10/2026, tarde)

Fran: «si se te ocurren prompts mejores, añádelos». Lo que se vio en las pruebas y lo que se cambió:

- **Pedía confirmación de lo claro** («¿Confirmas FBE1 con marco PVC?»). REGLA nueva: la pantalla ya
  enseña el cambio y la persona lo acepta con el «Sí»; se pregunta SOLO si hay dos opciones reales o
  falta un dato que cambia el resultado.
- **Plurales**: «las ventanas de FBE1 son de PVC» = una operación por ventana (las puertas no); «hay
  otra igual» = añadir con sus medidas.
- **Cómo se dicta**: centímetros («ciento veinte por ciento diez» = 1,20 × 1,10), «pe uno» = P1, «PCE»
  = PVC, «bajo emisivo»; qué es cada pared dicho como se dice en obra («da a la cochera» = partición,
  «es una valla» = apartarla) — la cochera sin calefacción va FUERA, como en los CEE de la casa.
- **Medidas por su nombre de calle**: «placas», «paneles», «fotovoltaica» = autoconsumo; «bomba de
  calor» = aerotermia.
- **La respuesta a una pregunta viaja con LO QUE SE PIDIÓ**: antes iba solo la pregunta y «el este»
  suelto no decía de qué. Ahora: `LO QUE PIDIÓ / TU PREGUNTA / SU RESPUESTA`, y «sí» = lo propuesto.
- **Siete ejemplos** de frase → operaciones al final de las instrucciones. Suben la parte fija de
  4.273 a 5.563 tokens, pero van en caché: la corrección sigue costando ~0,00017 $ (la primera de cada
  5 min, 0,0008 $). Medido con `--en-vivo`: **9 de 9 frases bien**, incluida la respuesta a una pregunta.

**En el panel, EJEMPLOS PULSABLES con los nombres del plano** (`ejemplosPara`): con la caja vacía salen
hasta cuatro frases («Las ventanas de FBO2 son de PVC con persiana», «FBO2 da al vecino: es
medianera», «El garaje llega hasta el fondo de la casa», «Pon también la medida de autoconsumo…»);
hablan de la pared abierta si la hay. Se pulsan, se retocan y «Ver». Es la respuesta a «muchas no las
sé ni utilizar»: enseñan qué se le puede decir sin leer nada.

**REGLA — lo que NO CABE se dice antes del «Sí».** Probando los ejemplos, el asistente metió una
ventana de 1,20 m en FBO1, que mide 0,16 m, sin avisar. Al añadir, mover o ensanchar un hueco, si los
anchos de la pared suman más que su largo sale «FBO1 mide 0,16 m y sus huecos sumarían 1,20 m: no
caben» (no se impide: el largo puede estar mal), y el ejemplo de «falta una ventana» no se ofrece en
paredes de menos de 2 m.

### Lo que NO hace todavía

- Quitar un CUERPO entero de Catastro, delimitar el adosado o partir la cubierta (siguen con sus botones).
- La U de una pared se puede decir, pero no está en el esquema que ve Claude (la valida el navegador si
  llega); tampoco el % de marco ni «- CAMBIA» de un hueco.
- Lucernarios y cubierta de reforma.
- Varias plantas con el mismo garaje: cada zona es de UNA planta.

Tras tocarlo: `node implementation/backend/scripts/test_asistente_envolvente.mjs` (sin red) y, con la
llave, `… --en-vivo` (~0,001 $).
