<!-- conocimiento · área: cee-generacion · las rutas de los enlaces son relativas a la raíz del repo -->

## La caldera EXISTENTE según la ficha, y el depósito de la MEDIDA (2026-10-21)

**El caso, 26RES060_190.** Caldera BIASI GT B 46 de gasóleo (2006, 41 kW) que da calefacción y
ACS, y una obra con aerotermia AEROSUN ADVANCED 16 y un acumulador de ACS de 200 l. El `.cex`
inicial salió con la caldera «Sin aislamiento», 79 % de combustión (la fila «Gasóleo, ≥ 1998,
sin condensación» de la tabla) y SIN depósito: CE3X la dejaba en un **43,9 % estacional**
(EPNR 543 kWh/m², G). Fran lo corrigió a mano en CE3X: «Antigua con aislamiento medio», 85 % y
el depósito de 200 l, y pidió que la app lo haga sola.

**REGLA — la cola de la caldera existente depende de la FICHA.**
- **RES080**: «Sin aislamiento» y el rendimiento de combustión de la tabla, como hasta ahora.
  Ahí el ahorro sale de comparar el CEE inicial con el previsto/final, y la caldera va en el
  caso desfavorable.
- **Todo lo demás** (RES060, RES093, TER100/TER173, CEE directos): «Antigua con aislamiento
  medio» y **al menos un 85 %** de combustión (la tabla, si da más: una de condensación no
  baja). El ahorro de esas fichas no sale del CEE, y la caldera se declara como suele estar
  una en uso. Fran: «cuando se pone sin aislamiento es cuando se va a hacer un RES080».

Lo decide el número (`esRes080`, también el de una oportunidad: `26RES080_OP52`). Lo tecleado
en Instalaciones sigue mandando (`equipoConAjustes`). Una caldera eléctrica no tiene cola y no
cambia. En el 190 rehecho en seco: estacional 61 % y EPNR 405 (F), con la demanda de
calefacción igual (187,91).

**REGLA — si la MEDIDA lleva acumulación de ACS, la caldera del inicial lleva ese MISMO
depósito.** Es el depósito del edificio: el CEE final lo hereda del inicial (regla 127) y la
medida declara el suyo, así que con los tres iguales la demanda de ACS no cambia entre el
inicial, la medida y el final. Sale de `resolverCe3x` (`litros`, con `hayAcs`): si la obra no
cambia el ACS, no manda. Con la medida con depósito el popup ya no pregunta «¿la caldera actual
tiene depósito?», y lo de la medida manda sobre lo contestado antes. En el 190 el ACS pasó de
7,75 a 12,74 kWh/m²·año (las pérdidas del depósito).

Fuente única: `colaCalderaExistente` y `litrosDeLaMedida` en
[fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js), usadas
por `instalacionExistente` (la ventana de la envolvente, la skill `generar-cee-inicial` y la
cola de la IA escriben con ella). Tras tocarlo: `node implementation/backend/scripts/test_medidas_mejora.mjs`
(apartado 6.b).
