<!-- conocimiento · área: calculo · las rutas de los enlaces son relativas a la raíz del repo -->

## El ahorro anual en € reparte el consumo por VECTOR: la bomba a precio de luz, la caldera al de su combustible (2026-10-19)

El ahorro anual en euros es el que la propuesta puede enseñar (`includeAnnualSavings`) y el
que usan el plazo de amortización y el resultado del funnel. Lo calcula
`calculateAnnualSavingsTheoretical` en
[calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js),
desde la calculadora (`handleCalculate` en
[CalculatorView.jsx](implementation/frontend/src/features/calculator/views/CalculatorView.jsx))
y desde el funnel ([landingCalculation.js](implementation/frontend/src/features/landing/data/landingCalculation.js)).

**El fallo**: el consumo nuevo se sumaba entero y se multiplicaba por el precio de la
ELECTRICIDAD, incluidas dos partes que no son electricidad:

- en una **hibridación** (RES093, C_b < 1), la calefacción que sigue dando la caldera de
  apoyo, `Q_net · (1 − C_b) / η` — gasóleo o gas;
- el **ACS cuando no cambia** (`changeACS = false`), `D_ACS / η` — también de la caldera.

Medido en **26RES060_OP310** al pasarla a hibridación (gasóleo 0,11 €/kWh, luz 0,22,
η 0,79, SCOP 4 / ACS 3, C_b 0,43, Q_net 72.394 kWh, D_ACS 2.731,4): salía
**−2.945 €/año** (52.243 kWh de gasóleo cobrados a precio de luz) y bien calculado son
**+2.802 €/año**. Su propuesta no enseñaba el ahorro anual, así que no llegó al cliente.

**REGLA — cada kWh se paga al precio de lo que lo produce.**

| Consumo nuevo | Vector | Precio |
|---|---|---|
| Calefacción que da la bomba: `Q_net · C_b / SCOP` | electricidad | `electricidad` |
| ACS si cambia: `D_ACS / SCOP_acs` | electricidad | `electricidad` |
| Calefacción que sigue dando la caldera: `Q_net · (1 − C_b) / η` | su combustible | `fuelType` |
| ACS si NO cambia: `D_ACS / η` | su combustible | `fuelType` |

La función devuelve además `consumoElectricoNuevo` y `consumoCombustibleNuevo`;
`consumoNuevo` sigue siendo la suma (kWh de energía final) y `costeNuevo` el total en €
(«Gasto estimado con Aerotermia» en la propuesta, que con hibridación incluye el
combustible de la caldera de apoyo).

**Qué cambia y qué no**:

- **C_b = 1 con el ACS dentro: idéntico al céntimo** (no hay combustible nuevo).
- **ACS fuera de la obra**: ahora se CANCELA (lo que gastaba la caldera lo sigue gastando),
  igual que en el ahorro del CAE ([bloques de viviendas](bloques-de-viviendas-el-edificio-completo-como-objeto.md):
  «el servicio fuera de alcance se cancela, no se resta»). Antes restaba la diferencia de
  precio luz − combustible: el ahorro SUBE. Afecta también al funnel.
- **Modo «gasto real»** (`calculateAnnualSavingsFromSpending`): la fórmula ya repartía por
  vector, pero la calculadora no le pasaba el C_b — una hibridación se calculaba como si
  la bomba lo cubriera todo. Ya se le pasa. (Ese modo trata todo el gasto como
  calefacción; el ACS no se separa.)
- **No es lo mismo que el C_b del CAE**: `calculateSavings`, `calculateTerciario`,
  `expedienteFinancials` y `terciario.js` calculan kWh de AHORRO ENERGÉTICO, donde el C_b
  pondera el TOTAL por la ficha (ver [TER173](ficha-ter173-hibridacion-en-el-terciario.md)).
  Eso no se toca; aquí solo se reparte el COSTE.

Medido el 19/10/2026 en la BD: de 378 oportunidades con ahorro anual guardado, **ninguna
tiene `includeAnnualSavings` activo** (17 híbridas, 117 con el ACS fuera, 6 con el ahorro
negativo guardado: OP50, OP109, OP48, OP153, OP310 y la RES080 OP73). Ninguna propuesta
enviada llevaba la cifra mala. Lo guardado se rehace al reabrir y recalcular la oportunidad;
no se ha migrado nada.

Tras tocarlo: `node implementation/backend/scripts/test_ahorro_anual_hibrido.mjs`.
