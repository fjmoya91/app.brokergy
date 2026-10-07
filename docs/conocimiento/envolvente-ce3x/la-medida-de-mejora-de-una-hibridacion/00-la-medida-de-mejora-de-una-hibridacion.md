<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «La medida de mejora de una HIBRIDACIÓN (2026-09-16)»; cada subsección está en su propio fichero de esta carpeta.

## La medida de mejora de una HIBRIDACIÓN (2026-09-16)

En una hibridación la caldera **no se retira**: se queda dando servicio junto a
la bomba. Así que el «edificio con las medidas incorporadas» de CE3X tiene DOS
equipos mixtos repartiéndose la demanda, y la app se negaba a componerlo — la
casilla salía en gris con un «el .cex final hay que montarlo a mano». Era el
único camino sin salida de la pestaña de Medidas.

| Qué | Dónde |
|---|---|
| Los dos equipos y su reparto | `instalacionNueva` / `calderaHibrida` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) |
| El C_b y el texto del encargo | `resolverCe3x` / `buildCe3xFinal` en [ce3xFinal.js](implementation/frontend/src/features/expedientes/logic/ce3xFinal.js) |
| La superficie heredada del fichero | `_heredar_superficies` en [generar_cex.py](implementation/cee-engine/tools/generar_cex.py) |
| Conservar el generador del `.cex` (CEE final) | `_con_reparto` + `conservar=` de `construir_instalaciones` |
| Pruebas | `node implementation/backend/scripts/test_hibridacion.mjs` · `pytest implementation/cee-engine/tests/test_equipos.py` |

**REGLA — el reparto es el C_b, NO la cobertura de potencia.** Son dos números y
confundirlos declara un edificio que no es. La **cobertura** es
`P_bomba / P_referencia` —cuánta POTENCIA pone la bomba frente a la de diseño— y
el **C_b** del Anexo III es la parte de la DEMANDA ANUAL que cubre. Una bomba
dimensionada al 48 % de la punta cubre el **78,5 %** de la energía del año,
porque esa punta se da unas pocas horas. CE3X pide demanda.

Medido contra el `.cex` que el certificador montó a mano para **26RES093_8**, que
es la referencia de esta regla:

| | % calefacción | % ACS | superficie |
|---|---|---|---|
| CALDERA DOMUSA CLIMA MIX 20 GE | 21 | 21 | 25,83 m² |
| AEROTERMIA PANASONIC AQUAREA T-CAP R290 | **79** | 79 | 97,17 m² |

79 es su C_b (78,54 %) y 21 el resto; las superficies llevan el mismo reparto y
suman exactamente los 123 m² del edificio. **La app le decía 48 %** en el encargo
por WhatsApp, que es la cobertura de potencia — ese texto también queda
corregido, y ahora explica las dos cifras.

⚠️ El C_b depende de la **base de la cobertura** que declare el expediente: con
base DEMANDA sale 78,54 % y con base P. CALDERA, 73,49 % (12 kW ÷ 27,8). No se
elige aquí: se usa el que ya tiene el expediente CAE, que es el que se declaró.

**REGLA — la caldera de la medida se COPIA de la que escribe el CEE de esa
fase**, nunca se vuelve a componer desde el expediente. Viaja como `existentes`
desde `componerFicha`. Recomponerla dejaría fuera lo que el certificador haya
corregido en la pestaña de Instalaciones —la potencia, el aislamiento, los
litros del depósito— y el mismo aparato saldría declarado de dos maneras dentro
del mismo `.cex`. Solo se le cambia su parte: `100 − C_b`.

⚠️ Solo se le pasan los equipos en el **CEE INICIAL**. En el final esos equipos
ya son la aerotermia, y copiarla como «la caldera que se queda» la declararía
dos veces.

⚠️ **`_heredar_superficies` deshacía el reparto.** Le daba a cada equipo la
superficie del fichero que se copia —los 123 m² enteros a los dos—, que es lo
correcto en una SUSTITUCIÓN y lo contrario de lo que hace falta aquí. Ahora
hereda el TOTAL y le vuelve a aplicar su porcentaje: sigue mandando el `.cex` si
el certificador corrigió la superficie en CE3X, y sigue mandando el C_b para
repartirla.

**REGLA — sin reparto calculable NO se compone.** Sin la potencia de la bomba (o
la de la caldera, según la base) el C_b no sale, y escribir la bomba al 100 %
declararía una sustitución que no es. Se dice qué falta, con esas palabras.

De paso, la medida deja de llamarse «Sustitución por aerotermia» cuando es una
hibridación: ahí no se sustituye nada, y el propio texto de la medida ya decía lo
contrario que su título («en apoyo a la caldera, que se mantiene en servicio»).
