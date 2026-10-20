<!-- conocimiento · área: cee-generacion · las rutas de los enlaces son relativas a la raíz del repo -->

## Generar el CEE inicial con IA desde el botón CE3X (2026-10-19)

Lo pidió Fran: el botón CE3X (fila de iconos de Resultados en la calculadora y barra del módulo
CEE) abría la envolvente a ciegas. Ahora **pregunta cómo se hace el CEE inicial**:

1. **🤖 Generar con IA** — el agente de la API (Claude Opus, esfuerzo alto, la skill
   `generar-cee-inicial`; ver «El CEE inicial por la API» en `claude-automatizacion`) lo hace
   entero con lo que ya hay en la app y escribe `.cex`, XML, PDF y croquis, y avisa al equipo
   como siempre (`agenteIa.terminar`). Coste medido: ~1,2–1,9 $ por CEE, ~4 $ con vídeos; tope 10 $.
2. **✏️ Hacerlo yo en la envolvente** — por código, como hasta ahora. No gasta nada de la API.

| Qué | Dónde |
|---|---|
| La cola y el latido del PC | `cee_ia_trabajos` + `cee_ia_vigilantes` ([scripts/cee_ia_trabajos.sql](implementation/backend/scripts/cee_ia_trabajos.sql), aplicado 19/10/2026) |
| Estado · pedir · cancelar (fuente única) | [services/ceeIa.js](implementation/backend/services/ceeIa.js) |
| Rutas (staffOnly) | [routes/ceeIa.js](implementation/backend/routes/ceeIa.js): `GET/POST /api/cee-ia/:negocio/:id`, `POST /api/cee-ia/trabajo/:id/cancelar` |
| El vigilante del PC | `tools/banco-cee-api/banco.mjs atender` (y `atender.cmd`, que lo relanza si se cae) |
| El botón y el popup | [features/cee-ia/](implementation/frontend/src/features/cee-ia) (`useBotonCe3x`, `GenerarCeeIaModal`, `useCeeIa`, `logic/ceeIa.js`) |
| Prueba | `node implementation/backend/scripts/test_cee_ia.mjs` |

**REGLA — la app APUNTA, el PC GENERA.** El agente necesita el motor, CE3X 3.2 (para calificar y
sacar el PDF) y la llave de la API, y eso está en el PC; en el VPS no hay CE3X. La app escribe una
fila EN_COLA; el vigilante la toma con un UPDATE condicionado (`estado = 'EN_COLA'`), corre el
agente (`generarReal`, la misma pasada que `banco.mjs generar`) y escribe su progreso en cada
vuelta. Mismo patrón que «por calificar» del sello del `.cex` (regla 139), con estado propio.

**REGLA — un CEE tiene como mucho UN trabajo vivo por fase**, y lo garantiza la BD (índice único
parcial sobre EN_COLA/EN_CURSO), no el navegador: pulsar dos veces no lanza dos agentes ni paga dos
veces. Un trabajo EN_CURSO sin latido en 10 min se da por **atascado** (el PC se apagó a medias) y
deja pedirlo otra vez; al arrancar, el vigilante marca como ERROR lo que él mismo dejó a medias.

**REGLA — «ya lo ha hecho la IA» lo dice el SELLO del `.cex`** (`cex_sello.inicial.autor ===
'skill generar-cee-inicial'`), el mismo que lee la ventana, y no la tabla de trabajos: si después
alguien lo regenera desde la envolvente, el `.cex` ya no es el de la IA y deja de decirse. Con el
sello calificado (`!por_calificar` y `calificacion`) lleva PDF.

**REGLA — qué hace el botón:** con la IA trabajando → el popup con su progreso (qué orden corre,
vueltas, gasto; se refresca cada 10 s) y «Parar»; si la IA ya lo hizo → **abre la envolvente
directamente** (allí se ve: la píldora del agente en CAE/CEE directos, una línea propia en una
oportunidad), y al lado sale «🤖 Hecho con IA» para ver cuándo o **rehacerlo** — que vuelve a costar
y se pide expresamente (`rehacer`); si no → el popup con las dos opciones. Mientras la IA trabaja,
la ventana de la envolvente lo avisa arriba: al escribir, lo suyo sustituye a lo de allí.

**REGLA — no se pide** con el CEE inicial REGISTRADO, en una oportunidad ya ACEPTADA (su CEE vive
en el expediente) ni para la fase FINAL (la skill del agente es la del inicial). Solo el equipo
interno: cuesta dinero y lo decide Brokergy.

**REGLA — parar es entre vueltas**: «Parar la IA» marca `cancelar` y el agente lo mira antes de cada
llamada a la API (`debeParar` de `correrAgente`), que es la que cuesta. En cola, se retira sin más.

**El popup dice si hay un PC atendiendo** (latido cada 30 s en `cee_ia_vigilantes`, con si el
motor, CE3X y la llave están listos). Sin PC el encargo se queda en cola y empieza solo al
encenderlo. Para dejarlo atendiendo: `tools/banco-cee-api/atender.cmd` en el PC.

El rastro completo de cada pasada (transcript, órdenes, resumen) se queda en el PC, en
`implementation/backend/scratch/banco-cee-api/real/`; en la BD solo escalares, el informe recortado
y las preguntas del agente, que el popup enseña si terminó A MEDIAS.
