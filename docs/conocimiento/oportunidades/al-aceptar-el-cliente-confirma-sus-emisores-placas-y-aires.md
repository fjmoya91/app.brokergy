<!-- conocimiento · área: oportunidades · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Al ACEPTAR, el cliente confirma sus EMISORES, PLACAS y AIRES (2026-09-29)

Muchas simulaciones no las rellena el cliente sino nosotros, con lo que cuenta el
instalador, y ahí se SUPONE: "radiadores", "no tiene placas". Al aceptar la
propuesta (`/firma/:id`), tras repasar sus datos, se le hacen tres preguntas:
**¿cómo te llega el calor a cada habitación?** (radiadores · suelo radiante · las
dos cosas · otro sistema o no lo sé), **¿tienes placas fotovoltaicas?** (las tres
de la captación, con la potencia o «No lo sé») y **¿tienes aire acondicionado?**
(y cuántos aparatos).

**REGLA — UNA PREGUNTA POR PANTALLA** ([ConfirmarVivienda.jsx](implementation/frontend/src/features/public/components/ConfirmarVivienda.jsx)).
El 90 % de las aceptaciones se hacen con el móvil: así cada pregunta cabe sin
desplazarse, no se puede dejar ninguna atrás y es el gesto del formulario de
captación. Los DATOS siguen en su formulario (vienen rellenos y se repasan); su
botón pasa a «Continuar» y el de aceptar va en la última pantalla, con el resumen
de las respuestas y «Cambiar» en cada una (que vuelve al resumen, no a la
siguiente pregunta). Tocar una opción AVANZA sola salvo que abra una sub-pregunta.
El texto secundario tiene que leerse en el móvil: en el tema oscuro, a /35 no se
leía en un iPhone. Desde el 24/10/2026 toda la aceptación (`/firma/:id`: datos,
preguntas, resumen, popup de condiciones y pantallas de después) va en el estilo
«carta de pago» (regla 164, prefijo `.fp-`), sin cambiar qué se pregunta ni qué se envía. Los dibujos son SVG propios ([IconosVivienda.jsx](implementation/frontend/src/components/IconosVivienda.jsx), compartidos con el funnel `/reforma`, cuyas tarjetas usan TODAS dibujos propios en vez de emojis — `<IconoFunnel n="gas" />`, con tamaño y color por familia en [IconosFunnel.jsx](implementation/frontend/src/features/landing/components/IconosFunnel.jsx), un solo sitio):
el emoji del radiador era una ESCALERA. ⚠️ Para llevar la pantalla arriba se usa
`window.scrollTo`, NUNCA `scrollIntoView`: desplaza también los ancestros con
`overflow-hidden` (la página lo lleva por el fondo animado).

**REGLA — el aire acondicionado es una pregunta APARTE**, no una opción del
emisor: puesto como "aparatos de aire" junto a radiadores y suelo, quien tiene un
split para el verano lo marca aunque caliente con radiadores. Los aires que ya
hay se QUEDAN (regla 72): el encargo CE3X al certificador (`buildCe3xFinal`) y
Instalación lo avisan para declararlos como equipos de refrigeración existentes.

| Qué | Dónde |
|---|---|
| Preguntas, saneado, contraste y resumen (fuente única) | [logic/confirmacionCliente.js](implementation/frontend/src/features/expedientes/logic/confirmacionCliente.js) |
| Se guarda al aceptar | `POST /api/public/aceptar/:id` (campo `confirmacion`, JSON en el multipart) → `datos_calculo.confirmacion_cliente` |
| El expediente lo hereda | `expedienteService.createExpediente` → `instalacion.confirmacion_cliente` |
| Aviso en el expediente | `ConfirmacionEmisor`, línea de placas y bloque de aire acondicionado en `InstalacionModule` |
| Pantallas y dibujos | `ConfirmarVivienda.jsx` · `IconosVivienda.jsx` |
| Probarlo como el cliente, sin tocar nada | **`/firma/demo`** — datos de mentira, no llama a la API |
| Prueba | `node implementation/backend/scripts/test_confirmacion_cliente.mjs` |

**REGLA — se pregunta en NEUTRO.** No se preselecciona lo supuesto al simular: con
la respuesta ya marcada se pulsa sin leer, y confirmar la suposición es justo lo
que no sirve. Las tres son obligatorias, y el emisor y la potencia tienen su «No lo sé».

**REGLA — las PLACAS se aplican solas; el EMISOR se PROPONE.** Las placas no
mueven ninguna cifra, solo qué declara el CEE: el expediente nace con lo que dice
el cliente (`fotovoltaicaResuelta`: si dice SÍ sin saber la potencia y la
simulación ya la tenía, se conserva). El emisor mueve el SCOP y con él el ahorro y
el bono: el expediente CONSERVA el de la simulación y, si no casa, el bloque del
emisor de Instalación lo dice en ámbar —con si el SCOP real sube o baja— y un
botón que lo aplica por `handleTipoEmisorChange`, el mismo camino del desplegable
(recalcula el SCOP). En RES080 se compara y se aplica sobre el emisor de ANTES.
Radiadores y «las dos cosas» proponen `radiadores_convencionales` (manda la
temperatura más alta, y el cliente no sabe si son de baja temperatura); «otro
sistema o no lo sé» no propone nada.

**REGLA — se guarda con lo que se SUPUSO al lado** (`supuesto.tipo_emisor` /
`supuesto.fotovoltaica`): dentro de tres meses hay que poder saber si el dato
cambió o ya era así. El aviso de aceptación al staff (WhatsApp) lleva las dos
respuestas y la diferencia.

**REGLA — no llegar la confirmación NO impide aceptar.** Un navegador con la
versión anterior de la página no la manda; la aceptación sigue igual.
`confirmacion_cliente` está en la BLACKLIST de `normalizeData` (enums en
minúscula) y en los `META_KEYS` del guardado de la calculadora.

⚠️ Solo se pregunta en la ACEPTACIÓN: una propuesta ya aceptada no enseña el
formulario, y los expedientes anteriores no tienen confirmación.

### Los AIRES también se apuntan en la OPORTUNIDAD (2026-10-15)

Lo pidió Fran: el CEE inicial se hace muchas veces desde la oportunidad, antes de
que el cliente acepte, y los aires solo llegaban al CEE por la aceptación. En
«Datos del edificio» de la calculadora, debajo de las placas, va la MISMA pregunta
(«❄️ Aire acondicionado»: Sí / No y, con sí, cuántos aparatos), con su chip
«❄️ 3 A/A» con el panel plegado. Se guarda en `datos_calculo.inputs.aires =
{ tiene, num }` (no entra en el cálculo), el expediente lo hereda en
`instalacion.aires` y la aceptación lo sella en `supuesto.aires`.

**REGLA — lo que dice el CLIENTE al aceptar MANDA; lo apuntado en la oportunidad
vale mientras no ha contestado, y se dice de dónde sale.** Fuente única:
`conAiresDeOportunidad(confirmacion, aires)` en `confirmacionCliente.js`, que
devuelve la confirmación con los aires de la oportunidad DEBAJO, marcados
`aires_de: 'oportunidad'` (el saneado conserva esa marca; el formulario público no
puede colarla). La usan el encargo al certificador (`aviso-cliente-cee`, la página
del encargo y la rejilla del CEE), el encargo CE3X (`buildCe3xFinal`), la revisión
del CEE (`revisionCee` → comprobación «aires» del `.cex`), Instalación y la
envolvente (`airesDelCliente`, también desde la ventana de la oportunidad). Con
solo los aires de la oportunidad, el encargo NO dice «lo que ha confirmado el
cliente» sino «🏠 LO QUE CONSTA DE LA VIVIENDA», con la fila «Aire acondicionado
(apuntado en la oportunidad)». Si al aceptar el cliente dice otra cosa, el resumen
lo avisa («En la oportunidad constaba «Sí · 2 aparatos»»). Las pantallas del
cliente siguen preguntando en NEUTRO: lo apuntado no se le preselecciona.

**Y si el envío no sale del móvil** (2026-10-23, 26RES060_OP323): el cliente pulsó «Confirmar» y vio
«Ocurrió un error al procesar tu aceptación»; la petición no llegó ni a nginx y a los siete minutos,
recargando, aceptó sin problema. Un error SIN respuesta del servidor es del móvil: corte de conexión
o un adjunto que Chrome de Android ya no puede leer (un fichero de Google Fotos o Drive es una
referencia que caduca con la página abierta un rato). En `AceptarPropuestaView.jsx` el justificante
bancario se COPIA en memoria al elegirlo (`copiaEnMemoria`), y sin respuesta el aviso dice lo que
pasa: si algún adjunto ya no se lee, que lo vuelva a elegir; si no, que revise la cobertura y vuelva
a pulsar, sin rellenar nada otra vez. Probado en local con el backend parado: sale el aviso de
conexión y la oportunidad no se toca.

**Al aceptar ya no se pregunta si usamos el CEE del cliente** (2026-10-26, Fran: «eso fuera»). Si el
cliente había aportado un CEE, la aceptación le enseñaba «Tu certificado energético» con «Usar el
CEE que ya tengo» / «Que BROKERGY emita un CEE nuevo», obligatoria. Se ha quitado de
`AceptarPropuestaView.jsx`: el formulario ya no manda `cee_choice`, así que `cee_decision` no se
escribe y el expediente sigue el flujo normal (el CEE inicial lo hace BROKERGY). El backend sigue
aceptando `cee_choice` y respetando un `usar_cee_aportado` ya guardado en oportunidades antiguas.

### El BONO SOCIAL también se pregunta al aceptar (2026-11-09)

Lo pidió Fran al publicarse la vía FM (BOE-A-2026-23367): el consumidor VULNERABLE multiplica el
ahorro × 1,5 (fichas -S) y nadie lo preguntaba; además el Anexo I (la declaración de ayudas) pide si
el hogar percibe el bono social, y se marcaba a mano. Ahora es una pantalla más del formulario de
aceptación, después de los aires y antes de «Revisar»:

- **«¿Tienes el bono social?»** · ayuda: «Lo pide la declaración de ayudas que firmarás con el resto de
  documentos. Si lo tienes, aparece en la factura de la luz de esta vivienda: más adelante te pediremos
  una.» Opciones: **No** · **Sí, el bono social de la luz** · **Solo el bono social térmico** · **No lo sé**
  («No pasa nada: lo comprobamos con tu factura de la luz»).
- Con «Sí, el de la luz», en la misma pantalla: **«¿De qué tipo es?»** (Vulnerable · Vulnerable severo ·
  En riesgo de exclusión social · No lo sé) y, solo en una RES060/RES093, **«¿Tienes el título de familia
  numerosa?»** (Sí / No). Las otras opciones pasan solas a la siguiente pantalla.

**A quién se pregunta**: `preguntaBonoSocial(programa)` — RES060 y RES093 → `fm` (tipo y familia
numerosa); RES080 → `anexo` (solo el tipo: la RES080_FM no tiene -S y no se inventa); el terciario no.
Y nunca a una empresa (`esNifDeEmpresa`, CIF): una sociedad no tiene bono social. El servidor manda la
pregunta en `GET /api/public/cliente/:id` (`bono_social_pregunta`) y al aceptar vuelve a decidir con la
ficha de la oportunidad y el NIF tecleado: si no tocaba, la respuesta se tira (`confirmacionDeLaAceptacion`
con `{ programa, nif }`). Es obligatoria en la pantalla (tiene «No lo sé») pero no en el servidor: un
navegador con la página vieja sigue pudiendo aceptar (regla de arriba: no llegar la confirmación no impide
aceptar).

**Dónde queda**: `datos_calculo.confirmacion_cliente.bono_social = { respuesta, tipo, familia_numerosa }`
(`CONFIRMACION_VERSION` 2), y el expediente lo hereda en `instalacion.confirmacion_cliente` como el resto.
Al crear el expediente, `semillaBonoSocial` (en `expedienteService.js`) siembra en el MISMO insert:

- `documentacion.subvenciones.bono_social = { percibe: true, tipos: [...] }` con los ids del Anexo I
  (`electrico_vulnerable` | `electrico_vulnerable_severo` | `electrico_riesgo_exclusion` | `termico`; un
  eléctrico de tipo desconocido va como «vulnerables»). «No» y «No lo sé» no siembran nada.
- en una RES060/RES093, `documentacion.via_fm = { vulnerable: true, anexo_b_casilla, at, por: 'aceptación
  del cliente' }`, saneado con `sanearDatosFm`, **solo cuando no hay duda** (`vulnerableFmDeBono`):

| Declara | ¿Vulnerable FM? | Casilla del Anexo B |
|---|---|---|
| Eléctrico, sin familia numerosa | Sí | `no_fn` |
| Eléctrico severo o en riesgo de exclusión, con familia numerosa | Sí | `severo` |
| Eléctrico «vulnerable» (o sin saber cuál), con familia numerosa | **No se marca**: pendiente de comprobar la renta (con el bono solo por ser familia numerosa no cuenta) | — |
| Solo el térmico | No (el térmico solo no hace vulnerable) | — |
| No lo sé | No se marca: pendiente de la factura de la luz | — |

Si el expediente ya existía, el alta no siembra nada (no se pisa lo que el equipo haya marcado).

**REGLA — el bono social NO viaja al certificador.** Es un dato de renta del hogar. `conAiresDeOportunidad`
lo quita (`sinBonoSocial`) antes de dar la confirmación al encargo y a la app de certificadores, y
`resumenConfirmacion` no lo enseña. El aviso de WhatsApp al equipo de «propuesta aceptada» sí lleva una
línea «Bono social» y, en una RES060/RES093, si ha quedado marcado el vulnerable o qué falta comprobar.

**REGLA — solo se marca vulnerable lo que lo es sin duda; lo dudoso se enseña, no se adivina.** En el
expediente, el equipo ve lo declarado al lado de lo marcado: en «Subvenciones», «Declarado al aceptar ·
fecha» con «Marcar lo declarado» si no coincide; en la pestaña «Vía FM», debajo de «Consumidor vulnerable
(ficha -S)», lo declarado con su aviso (en ámbar si falta comprobar algo) y «Marcar como vulnerable» si la
declaración lo hace vulnerable y el conmutador está apagado. El dato sale de `bonoDeclaradoDe(expediente)`:
la confirmación más reciente entre la del expediente y la de la oportunidad.

Todo en [logic/confirmacionCliente.js](implementation/frontend/src/features/expedientes/logic/confirmacionCliente.js)
(sección «Bono social»). Tras tocarlo: `node implementation/backend/scripts/test_confirmacion_cliente.mjs`
(prueba también que los ids casan con `leerSubvenciones` y `anexoIStates`). `/firma/demo` enseña la
pantalla en su versión FM y `/firma/demo?reforma` en la de la RES080.
