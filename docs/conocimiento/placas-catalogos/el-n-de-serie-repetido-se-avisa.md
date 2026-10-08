<!-- conocimiento · área: placas-catalogos · las rutas de los enlaces son relativas a la raíz del repo -->

## El Nº DE SERIE repetido entre expedientes se AVISA (2026-10-08)

Un nº de serie identifica UNA máquina. La caldera que se retira y la bomba de calor que se
pone justifican UN ahorro: si su serie ya consta en otro expediente, o se ha copiado mal
(lector de placas, plantilla, copiar y pegar) o se está presentando dos veces la misma
actuación. Hasta ahora nada lo miraba: `SERIE_DISTINTA` de las facturas compara la factura
con SU expediente, no un expediente con los demás.

Medido el 08/10/2026 sobre los 313 expedientes (492 series distintas): **ninguna serie real
repetida** entre expedientes y ninguna caldera con la misma serie que su aerotermia. Lo
único que «coincidía» era **NO LEGIBLE**, escrito en la caldera de 25 expedientes.

| Qué | Dónde |
|---|---|
| Qué campos son serie, cómo se comparan, qué no es una serie | [utils/seriesEquipos.js](implementation/backend/utils/seriesEquipos.js) — `seriesDeInstalacion`, `normSerie`, `esSerieComparable`, `cruzarSeries` |
| La búsqueda en todos los expedientes | [services/seriesRepetidas.js](implementation/backend/services/seriesRepetidas.js) · `POST /api/expedientes/:id/series-repetidas` (**staffOnly**) |
| El aviso debajo de cada casilla y el resumen arriba | [AvisoSerieRepetida.jsx](implementation/frontend/src/features/expedientes/components/AvisoSerieRepetida.jsx), dentro de `InstalacionModule` |
| Pruebas | `node implementation/backend/scripts/test_series_repetidas.js` |
| Barrido de lo que ya hay (solo lee) | `node implementation/backend/scripts/auditar_series_repetidas.js` |

**REGLA — se AVISA, no se bloquea.** Puede haber una explicación (un expediente RECHAZADO
que se rehace con la misma caldera) y la decide una persona. El aviso dice en qué
expediente está, en qué papel (caldera, aerotermia, ud. interior, Ud. 2 de una cascada…)
y en qué estado, con enlace.

**REGLA — se comparan solo letras y dígitos, sin mayúsculas ni tildes.**
`IN2601309004-053` e `in 2601309004 053` son la misma serie.

**REGLA — un marcador de «no hay serie» no es una serie.** Fuera: menos de 4 caracteres
(«N/A», «S/N»), un carácter repetido («0000», «XXXX») y lo que contenga LEGIBLE, SIN PLACA,
SIN SERIE, NO PROCEDE, DESCONOCIDO, PENDIENTE… — sin esto, los 25 «NO LEGIBLE» se
avisarían entre sí y el aviso enseñaría a ignorarlo.

**REGLA — dos nodos no son dos máquinas.** Con `misma_caldera_acs` el nodo de ACS de la
caldera es un resto y no cuenta; el nodo de ACS de la aerotermia puede ser un CLON del de
calefacción (regla 49) y la ud. interior de un monobloc lleva la misma serie que la
exterior: dentro del mismo grupo se juntan y no se avisan. Lo que SÍ se avisa dentro de un
expediente es una serie que esté a la vez en la caldera que se retira y en el equipo nuevo.

**REGLA — se mira lo que hay EN PANTALLA**, con 700 ms de calma tras la última tecla, y
solo se vuelve a preguntar si cambia una serie. La ruta lee de cada expediente solo los
nodos con serie, nunca la `instalacion` entera (regla 22), y con la BD caída responde 503
y el aviso calla: ni «repetida» ni «todo bien» (regla 38).

**REGLA — solo lo ve el equipo interno.** La respuesta nombra expedientes ajenos; el
certificador solo ve los suyos, así que a él no se le pregunta.

⚠️ No cubre todavía las OPORTUNIDADES (la placa leída en la calculadora, `inputs.placa_ocr`)
ni el alta por skill o MCP: el aviso sale al abrir la Instalación del expediente.
