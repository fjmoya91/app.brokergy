<!-- conocimiento · área: calculo · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Ficha TER173 — HIBRIDACIÓN en el terciario (2026-09-09)

Quinta tipología, y la única que es dos cosas a la vez: **los tres servicios de la
TER100 ponderados por el C_b de la RES093**. Hibridación en modo paralelo de
caldera/s de combustión con bomba de calor en edificios NO residenciales de zona
climática **D1, D2 o D3**. Nomenclatura `{YY}TER173_{N}`, correlativo desde **1**.

```
AE_C   = (1/η_i − 1/SCOP)     · D_C · S · F_P     calefacción
AE_ACS = (1/η_i − 1/SCOP_dhw) · D_ACS    · F_P    agua caliente sanitaria
AE_CAP = (1/η_i − 1/SCOP_pwh) · D_CAP    · F_P    calentamiento de piscina
AE_TOTAL = (AE_C + AE_ACS + AE_CAP) · C_b         ← apartado 4 de la ficha
```

**REGLA — el C_b pondera el TOTAL, no solo la calefacción.** Lo dice la fórmula del
apartado 4, fuera del corchete. Medido sobre un caso con los tres servicios: si solo
ponderara AE_C el total saldría un **7,8 % más alto**, y ese exceso es ahorro que
sigue aportando la caldera. De paso se corrigió la RES093, cuya ficha lo pone igual
—sobre calefacción **y** ACS— y en la app solo multiplicaba la calefacción; medido
sobre los 7 RES093 de producción, cambian 4 (entre −0,1 % y −2,1 %) y el único ya
subido a MITECO no se mueve, porque su ACS está fuera de alcance.

**REGLA — la tabla del C_b es UNA sola.** El Anexo IV de la TER173 (columna
AEROTERMIA) coincide **valor a valor** con el Anexo III de la RES093, comparados los
16 escalones. Por eso comparten `BIVALENCE_TABLE` y el apartado 8 del CIFO: dos
copias divergirían el día que el Ministerio corrija una. El Anexo IV trae además una
columna para bombas **geotérmicas e hidrotérmicas** (al 50 %: 86,38 % frente a
80,45 %) que **no se implementa**: la app solo trabaja con aerotermia y un selector
que nadie usa envejece sin que nadie lo compruebe.

**REGLA — el impreso oficial NO tiene casilla para el C_b.** Su tabla de resultado es
AE_C · AE_ACS · AE_CAP · AE_TOTAL · D_i, así que **el total impreso no cuadra con la
suma de los tres sumandos impresos** — y eso es lo primero que cruza un verificador.
El CIFO es el único sitio donde se explica: su desglose lleva dos columnas más
(Σ AE y C_b) y su apartado 8 cierra con la nota que lo dice con las dos cifras
delante. No es un fallo del relleno: es cómo publica la ficha el Ministerio.

**REGLA — un TER173 sin datos de hibridación NO se genera.** Sin potencia de bomba
(o sin la de caldera, en el método por caldera) el C_b se queda en 1 y el ahorro sale
como si la caldera se hubiera retirado: más alto que el real, y firmado. Se marca
`cbIncompleto` en `deriveTerciarioVars` y es **bloqueante** en la validación del CIFO
(`cifoService.buildValidation`), no un aviso. La instalación lo siembra activado —en
las fichas de hibridación la hibridación ES la actuación, no una opción.

**REGLA — el SECTOR se declara, no se deduce, y se mira PRIMERO.** La calculadora es
residencial y nunca produce un terciario: las fichas TER las marca una persona desde
"cambiar tipo de actuación". En TER173 mirarlo después de `isHybrid` no es solo
inútil, es dañino: sus inputs llevan `hibridacion: true` y la rama de RES093 se la
llevaría en el primer reguardado desde la calculadora
(`routes/oportunidades.js`, `AdminPanelView`, `ExpedientesView`).

### Fuentes únicas

| Qué | Dónde |
|---|---|
| Lista de fichas, correlativo, detección, `esHibridacion`/`esTerciario` | [utils/fichas.js](implementation/backend/utils/fichas.js) |
| Variables del TERCIARIO (las DOS fichas) | [logic/terciario.js](implementation/frontend/src/features/expedientes/logic/terciario.js) — `deriveTerciarioVars`, `esTer173`, `fichaTerciaria` |
| Fórmula de los tres AE + el C_b como parámetro | `calculateTerciario()` en [calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js) |
| Tabla del C_b (Anexo IV TER173 = Anexo III RES093) | `BIVALENCE_TABLE` / `getCb` en `calculation.js` |
| Valores de la ficha (formateados) | [logic/fichaTer173.js](implementation/frontend/src/features/expedientes/logic/fichaTer173.js) |
| Casillas del impreso oficial | [logic/fichasFormulario.js](implementation/frontend/src/features/expedientes/logic/fichasFormulario.js) — `camposTer173` |
| Plantilla | `backend/plantillas/FichaTER173.pdf` (5 páginas · 22 campos) |
| Recuadro de firma | `signBoxes.js` → `ficha_ter173_oficial` (**página 5**, no la 4 como TER100) |
| Modal (compartido con TER100) | `FichaTerciarioModal.jsx`, prop `ficha` |
| CIFO | `cifoDoc.js` — `isTerciario` + `isTer173` + `cbAnexo` |
| Colores de ficha (fuente única de las 4 pantallas) | `expedienteTaxonomia.js` — `fichaColor` |

**Nota de nomenclatura**: `logic/ter100.js` pasó a llamarse **`logic/terciario.js`** al
entrar la TER173. Un fichero que resuelve dos fichas no puede llamarse como una de
ellas, o la siguiente acaba escribiéndose fuera con su propia copia de la derivación.
`deriveTer100Vars` → `deriveTerciarioVars`, `TER100_PRECIOS` → `TERCIARIO_PRECIOS`.

**La TER173 NO tiene maqueta HTML.** Nació después de que el Ministerio publicara los
impresos como PDF de formulario (regla 41), así que no hay borradores del formato
anterior en Drive y no hay nada que conservar: su modal no lleva conmutador
Oficial · Clásico.

### Sus anexos, y qué confirma cada uno

| Anexo | Qué es | Qué confirma |
|---|---|---|
| **II** | SCOP en calefacción (`CC·(η_s,h+F1+F2)`) y en ACS, con el caso de depósito NO suministrado como conjunto | La tabla de F_c —**D1 1,093 · D2 1,103 · D3 1,113** a 55 °C— es la que ya usaba la app (`FC_TABLE` del CIFO) |
| **III** | SCOP_pwh de piscina (`COP · FC`) | El SCOP de piscina se teclea a mano desde la ficha técnica, como en TER100 |
| **IV** | Tabla del C_b | Coincide valor a valor con el Anexo III de la RES093 |
| **VIII** | η_i de la caldera sustituida (tabla B.3 por combustible, antigüedad y tipo) | Coincide **fila a fila (18) con `BOILER_EFFICIENCIES`** — vigilado por `test_ter173.mjs` |

⚠️ **La nota al pie 2 del Anexo III remite al "Anexo VIII" para la temperatura
exterior de las bombas aerotérmicas, y el Anexo VIII NO es eso**: es la tabla de
rendimientos de caldera. Es una referencia cruzada equivocada de la ficha — no
pierdas el tiempo buscando una tabla de temperaturas que no existe ahí.

En TER173 el párrafo de la temporada de referencia **no invoca el Anexo III de la
RES060** —es una ficha residencial—: dice que la temporada es aquella en la que se
declara el SCOP adoptado, y ahí se queda. El η_i sí cita el **Anexo VIII de la propia
ficha**, que es más fuerte que la referencia genérica a los criterios de verificación.

### Se crea DESDE LA OPORTUNIDAD, no solo desde el expediente

Hasta 2026-09-09 la ficha del terciario solo se declaraba con "cambiar tipo de
actuación" **dentro del expediente**, que no existe hasta que el cliente acepta. Para
simular un TER173 y presentárselo había que crearlo como residencial y reclasificarlo
después. Ahora:

- **Selector de SECTOR en la calculadora** (Residencial · Terciario), junto a "Modo
  Reforma", con la ficha resultante a la vista. Solo lo ve el STAFF (`showBrokergy`).
- **Reclasificar una oportunidad ya guardada**: la chapa de la ficha en el panel de
  admin es un desplegable (`PATCH /api/oportunidades/:id/ficha`, **adminOnly**).

**REGLA — el SECTOR se declara; la FICHA se deduce.** No hay un desplegable de cinco
fichas: hay un sector, y la ficha sale de sector + hibridación + reforma, con la MISMA
función en los dos lados (`detectPrograma` en el backend, `fichaDesdeInputs` en el
frontend). Un desplegable libre dejaría elegir combinaciones que no existen —un TER173
sin hibridar— y el backend las resolvería por su cuenta a espaldas de quien las marcó.

|             | sin hibridar | hibridado |
|---|---|---|
| **residencial** | RES060 | RES093 | (+ RES080 si es reforma) |
| **terciario**   | TER100 | TER173 |

**REGLA — el sector se mira ANTES que la reforma.** La RES080 es "rehabilitación
profunda de edificios de VIVIENDAS": no existe en el terciario. Al marcar Terciario, el
botón de reforma se apaga y se deshabilita, en vez de dejar elegir algo imposible.

**REGLA — sin `sector` en el payload manda lo ya declarado.** Un navegador con la
versión anterior cargada, o el funnel público, no lo mandan; y como un TER173 es una
hibridación (sus inputs llevan `hibridacion: true`), sin esa salvaguarda la rama de
RES093 se lo llevaría en el primer reguardado, dejando la oportunidad diciendo
"residencial" y el expediente con TER173 en su número.

**REGLA — cambiar la ficha toca los INPUTS, no solo la etiqueta.** `PATCH /:id/ficha`
deja coherentes `sector`, `hibridacion` e `isReforma`: si solo escribiera la columna, el
primer reguardado desde la calculadora la devolvería a lo que dijeran los inputs. El
**ID de la oportunidad NO se renombra** (hay documentos y carpetas que lo citan); el
número del EXPEDIENTE ya nace con la ficha correcta.

**REGLA — el expediente HEREDA lo que se simuló.** `expedienteService` copia el alcance
de calefacción, la piscina (con su D_CAP y su SCOP_pwh) y el modo de D_ACS. Sin eso, el
expediente recalcularía un ahorro distinto del que se le presupuestó al cliente — está
vigilado de punta a punta en `test_ter173.mjs` (apartado 10).

⚠️ **La D_ACS de la calculadora era un 2.731,4 CABLEADO** —la fórmula del CTE para 4
habitaciones— que ignoraba el CEE cargado. En el TERCIARIO se resuelve ahora con el
MISMO módulo que el expediente ([demandaAcs.js](implementation/frontend/src/features/expedientes/logic/demandaAcs.js)):
`xml` (del certificado), `cte` o `manual`. En un hotel de 1.000 m² con 20 kWh/m²·año son
**20.000 kWh/año** frente a esos 2.731,4. **El residencial conserva el valor de siempre**:
cambiarlo movería el ahorro de toda propuesta nueva y no se ha pedido — pero es la misma
inconsistencia y algún día habrá que mirarla.

### Pruebas

```bash
node implementation/backend/scripts/test_ter173.mjs             # fórmula · C_b · alcance · impreso · propuesta→expediente
node implementation/backend/scripts/test_impresos_oficiales.mjs # las 5 fichas + Anexo I
node implementation/backend/scripts/check_cifo_paginas.mjs      # las hojas del CIFO no desbordan
```

⚠️ La hoja del CÁLCULO del CIFO es la más cargada del documento en TER173 (tabla de
piscina + variables con su fila de C_b + leyenda entera + el desglose de seis
columnas). El párrafo que explicaba el C_b ahí la desbordaba **23 px**; por eso vive
en el apartado 8. Holgura actual: **+46 px** en el peor caso medido.
