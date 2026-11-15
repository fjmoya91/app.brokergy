<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## Cuando el `.cex` no sale, el asistente dice qué lo para y lo arregla; y «déjalo listo para firmar» (2026-10-30)

Fran, en 2026EXT_3: al pulsar «✓ Visto bueno» salió «PVBS1 se escribe como FACHADA y no tiene
orientacion…» y la envolvente decía «2 FACHADAS SIN RUMBO». Preguntó si el asistente podía
regenerarlo y dejarlo listo para firmar, y dónde se ejecutaría (¿su PC, la nube, la API?). Se eligió
la opción A: todo en la ventana de la envolvente, con la llave de Claude del servidor de siempre, y
Claude solo cuando el plano no explica el fallo. «Sí, monta la A».

### Lo que pasa ahora

**1. El fallo del motor va solo al asistente.** Cuando `generarCex` recibe un 422 del motor
(`esFalloDelMotor`: `GeneracionError` de `generar_cex.py`), EnvolventeView abre el asistente con una
tarjeta ámbar «No se ha podido generar el .cex» (o «…para el visto bueno») y el motivo. El
contenido lo decide [logic/arreglarGenerar.js](implementation/frontend/src/features/cee-envolvente/logic/arreglarGenerar.js)
(puro) con lo que ya sabe el plano (`faltaParaGenerar`, grupo `bloquea`):

- **cada fachada sin rumbo**: una fila con sus DOS lados posibles (`rumbosDeLaPared`, los
  perpendiculares a la pared) y «Ver en el plano». Se contesta con un clic (otro clic lo quita);
- **lo demás que bloquea** (la entrada, una pestaña con «!», una fachada sin trazo): su texto y «Ir»;
- **si el plano no explica el fallo**, se le pregunta a Claude con el motivo del motor
  (`textoDelFallo`): devuelve una operación si se arregla con una, pregunta si hay dos arreglos, o dice
  en una frase qué hay que hacer (regla 13 de las instrucciones).

Con todo contestado, **«Sí: aplicar y volver a generar»** o **«Sí: aplicar y dejarlo listo para
firmar»** (según lo que se estaba haciendo) aplica los rumbos como las operaciones de siempre
(`cambiar_pared` → `orientacion_manual`, un solo «Deshacer») y retoma lo que se estaba haciendo.
«Solo aplicar» los aplica sin más.

**2. «Déjalo listo para firmar» / «dale el visto bueno».** Solo el EQUIPO, en una obra de la app y en
el CEE inicial (`puedeListo`). Es el mismo camino que el botón «✓ Visto bueno: listo para firmar»
(`darVistoBueno`, regla 186): genera si hace falta y da el visto bueno; el chat dice «Generando el
.cex y dando el visto bueno…» y luego lo que respondió el visto bueno (calculándose con CE3X,
entregado, o por qué no). Junto a «Sí, y generar el CEE» sale «Sí, y dejarlo listo para firmar».

**REGLA — una orden sola no pasa por Claude.** «Genéralo», «déjalo listo para firmar», «dale el
visto bueno» (`soloOrden`: la orden y palabras de relleno, nada que corregir) se hacen sin preguntar
a nadie: no hay nada que entender y no gasta. Tampoco se toma como la respuesta a lo que el asistente
preguntó antes: es una orden nueva. Si la frase trae además algo que corregir, va a Claude como
siempre y el objetivo se cumple al aplicar.

**REGLA — tras un cambio del asistente, el visto bueno REGENERA.** La huella de la vista viene del
servidor (`ficha`) y justo después de cambiar el plano puede ser la de antes: con `generarAntes` el
`.cex` se escribe siempre, y el visto bueno va sobre lo que se ve.

**REGLA — no se repite a ciegas.** Si el fallo no lo explica el plano, el asistente pregunta a Claude
como mucho dos veces seguidas (`MAX_REINTENTOS_SOLOS`; se cuenta en `intentoArreglo` y vuelve a cero
al generar bien). Y lo que Claude contesta a un fallo nunca vuelve a generar sin haber cambiado nada:
daría el mismo «no».

**Lo que NO puede hacer**: saber hacia dónde da una pared que sale de una partición o se dibujó a
mano. Eso lo dice la persona (las dos opciones en botones); la app no lo adivina.

### Para 2026EXT_3, sin esperar al despliegue

Se le puede decir al asistente «PVBS1 da al …, PVBO1 al …» (o elegirlo en «Hacia dónde da» de cada
pared) y pulsar «✓ Visto bueno». Son 2 fachadas sin rumbo.

### Banco de pruebas

`http://localhost:PUERTO/asistente-prueba.html` ([src/demo/asistentePrueba.jsx](implementation/frontend/src/demo/asistentePrueba.jsx)):
el asistente con Claude, el motor y el visto bueno SIMULADOS (sin backend, sin Drive): dos fachadas
sin rumbo, «Generar .cex», «✓ Visto bueno» y una casilla para un fallo que el plano no explica. No
entra en el build de producción (solo `index.html` y `certificadores.html`).

### Pruebas

- `node implementation/backend/scripts/test_arreglar_generar.mjs` (6): los arreglos con el caso de
  2026EXT_3, los rumbos que pasan a `orientacion_manual`, el texto del fallo, `pideListo` y
  `soloOrden`.
- Además: `test_asistente_envolvente.mjs`, `test_falta_para_generar.mjs`, `test_certapp_visto_bueno.js`
  y `test_origen_ext.mjs`.
