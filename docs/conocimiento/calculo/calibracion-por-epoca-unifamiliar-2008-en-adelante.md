<!-- conocimiento · área: calculo · las rutas de los enlaces son relativas a la raíz del repo -->

## Calibración por ÉPOCA: la unifamiliar de 2008 en adelante sube ×1,25 (2026-10-26)

**Decisión de Fran (26/10/2026)**, al preguntar si la estimación de la oportunidad podía acercarse más
a lo que da después el CEE inicial sin prometer de más.

**Lo medido** (solo lectura, 26/10/2026): 132 expedientes RES060/RES093 con CEE inicial y la
simulación recalculable. Ratio = demanda de calefacción TOTAL del CEE (kWh/m²·año × m²) ÷ la estimada
por `calculateDemand` con los inputs de su oportunidad. En un RES060 el bono es proporcional a esa
cifra (η de tabla, SCOP de catálogo).

| Año de construcción | n | P10 | Mediana | P90 | CEE por debajo |
|---|---|---|---|---|---|
| Todos | 132 | 0,98 | 1,30 | 2,37 | 15 |
| < 1980 | 24 | ~0,9 | ~1,08 | ~1,4 | 7 |
| 1980–2007 | 75 | 0,99 | 1,24 | 1,75 | 8 |
| **2008+** | **33** | **1,38** | **1,97** | 3,06 | **0** |

Con la calculadora de HOY (Guía CE3X) las 33 de 2008+ dan de **1,26 a 6,73** (P5 1,33, mediana 1,95):
con las U límite del CTE la calculadora supone una casa mucho mejor de lo que CE3X modela. Todas son
**unifamiliares** (32 en D3, una en D2 y una en E1).

**REGLA — en una simulación NUEVA de una vivienda UNIFAMILIAR de 2008 en adelante, la demanda neta de
calefacción estimada se multiplica por 1,25** (`FACTOR_EPOCA_RECIENTE`, `getFactorEpoca` en
[calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js); `meta.k_epoca`
en el resultado). El factor va por DEBAJO del mínimo medido (1,26): ninguna de las 33 habría salido
prometiendo más de lo que dio su CEE.

**REGLA — lo ya simulado no se mueve.** Va con la marca `inputs.calibracion_demanda` (`'2026-10'`), con
el MISMO patrón que la Guía: la ponen la calculadora (simulación no persistida) y el funnel
(`funnelToInputs`, por donde pasan la landing y la skill `alta-oportunidad`), y el servidor no deja que
una anterior la estrene al reguardarse (`sellarGuiaTransmitancias`, que ahora sella las dos marcas,
cada una por su cuenta). Una oportunidad sellada con la Guía entre el 08 y el 26/10 NO estrena esta.

**No se aplica** (sin datos): pisos y adosados en hilera, terciario, RES080 (escalaría también el
ahorro de la reforma), ni antes de 2008. Las de 2014+ (5 casos, mínimo 3,21) admitirían más, pero con
cinco casos no se toca.

Los peores casos del resto NO son de la física sino de la SUPERFICIE: 26RES060_OP80 estimó 1.037 m² y
su CEE tiene 314; OP33, 123 frente a 91. Ningún factor arregla eso.

Tras tocarlo: `node implementation/backend/scripts/test_guia_transmitancias.mjs`. Para volver a medir:
los scripts de la sesión (`desviacion.mjs`) recorren `expedientes.cee->cee_inicial` y la oportunidad
(`datos_calculo->inputs`), solo leyendo.
