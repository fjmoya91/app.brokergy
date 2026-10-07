<!-- conocimiento · área: lotes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Las TARIFAS del verificador, en su ficha (2026-09-14)

Lo que cobra un verificador no es un precio: es una TABLA POR TRAMOS, y con
escalón — cuantas más actuaciones van juntas, menos sale cada una. La orientativa
que pasa MARWEN (09/2026):

| Actuaciones | Importe | €/actuación |
|---|---|---|
| 1 | 900 € | 900 |
| 5 | 2.000 € | 400 |
| 10 | 3.600 € | 360 |
| 15 | 4.400 € | 293 |

Hasta ahora vivía en un correo: al llegar su oferta o su factura no había contra
qué compararla sin ir a buscarlo.

| Qué | Dónde |
|---|---|
| Estimar, elegir tarifa y comparar (puro, sin imports) | [logic/tarifasVerificacion.js](implementation/frontend/src/features/lotes/logic/tarifasVerificacion.js) |
| Persistencia (`app_settings` → `tarifas_verificacion:{id}`) | [services/tarifasVerificacion.js](implementation/backend/services/tarifasVerificacion.js) |
| Rutas | `GET|PUT /api/prescriptores/:id/tarifas-verificacion`, **adminOnly** |
| Superficie | Bloque **Tarifas de verificación** de la ficha (`TarifasVerificacionPanel`) + bajo el coste en `LoteDetailModal` |
| Sembrar la de un verificador | `node scripts/sembrar_tarifa_verificacion.js B23627375 [--execute]` |
| Prueba de lo puro | `node implementation/backend/scripts/test_tarifas_verificacion.mjs` |

**REGLA — esto es ORIENTATIVO y NO contabiliza nada.** Lo que de verdad se paga
sigue siendo `lotes.coste_verificacion`, que sale de la BASE IMPONIBLE de su
factura (regla 28), y lo que se repercute al S.O. en la simulación sigue siendo
`inputs.costeVerificacion` (regla 46). Esta tabla solo sirve para mirar una
oferta y saber si cuadra: la palabra "orientativa" va en pantalla, porque una
tabla de precios en una ficha se lee como lo que se paga.

**REGLA — la columna que se compara es el €/ACTUACIÓN, no el total.** «2.000 €»
no dice nada sin saber cuántas actuaciones cubre, y la factura del verificador
puede agrupar varios lotes: un lote son 5 como máximo, pero a verificar se mandan
varios juntos y el escalón es **por envío**. Por eso la tabla la lleva calculada,
la estimación la devuelve siempre y el lote lo dice en su nota — comparar el total
de una factura contra un solo lote sale siempre "caro".

**REGLA — entre tramos se INTERPOLA; fuera de tabla se DICE que se está fuera.**
Las actuaciones reales casi nunca caen en una fila. Por encima del último tramo se
prolonga con el precio MARGINAL del último intervalo (160 €/act. en la tabla de
arriba), nunca con su media: la media daría un 13 % de más a 20 actuaciones. Y
sale marcado `fueraDeTabla` con su aviso, porque es una conjetura nuestra y no un
precio que el verificador haya dado. Por debajo del primer tramo no se rebaja por
nuestra cuenta: ese importe es el suelo.

**REGLA — con varias tarifas NO se adivina cuál aplica**, y la cobertura se
comprueba también con UNA sola. Una tarifa que declara «RES060 · RES080 · RES093 ·
TER100» está diciendo que no cubre lo demás: aplicársela a un TER173 sería
comparar contra un precio que nadie ha dado para esa ficha, y encima con la
autoridad de una tabla. Sin fichas marcadas vale para todas — es lo correcto para
quien solo tiene una tarifa.

**El bloque va en la VISTA de la ficha, no en su modo edición**, y se edita desde
él mismo: es un dato que se CONSULTA antes de mandar un lote a verificar, y
esconderlo detrás de «Editar» lo dejaría sin usar. Solo **VERIFICADOR** y solo
ADMIN (son importes, y esa ficha la puede abrir el propio partner; el backend lo
repite). El €/actuación se ve **mientras se teclea**: es donde se nota un cero de
más antes de guardarlo.

⚠️ La columna del NIF en `prescriptores` es **`cif`**, no `cif_nif`.
