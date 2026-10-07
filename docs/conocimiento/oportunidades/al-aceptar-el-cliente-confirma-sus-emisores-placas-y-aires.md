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
El texto secundario va a `text-white/70` como mínimo: a /35 no se leía en un
iPhone. Los dibujos son SVG propios ([IconosVivienda.jsx](implementation/frontend/src/components/IconosVivienda.jsx), compartidos con el funnel `/reforma`, cuyas tarjetas usan TODAS dibujos propios en vez de emojis — `<IconoFunnel n="gas" />`, con tamaño y color por familia en [IconosFunnel.jsx](implementation/frontend/src/features/landing/components/IconosFunnel.jsx), un solo sitio):
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
