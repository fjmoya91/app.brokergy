<!-- conocimiento · área: calculo · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Ficha TER100 — Sector TERCIARIO (2026-07-30)

Cuarta tipología de expediente, junto a RES060 / RES080 / RES093. Es un **CLON de
RES060** (sustituir caldera de combustión por bomba de calor eléctrica) pero en un
edificio del **sector terciario**: hoteles, restaurantes, residencias, gimnasios,
centros educativos, oficinas… Nomenclatura `{YY}TER100_{N}`, **el correlativo
arranca en 3** (`26TER100_3`) porque había dos expedientes heredados del sistema
anterior.

### Lo único que la separa de RES060

1. **El ahorro se DESGLOSA en tres sumandos** (apartado 4 de la ficha), cada uno
   con su propio SCOP, y el total es la suma de los que apliquen:

   ```
   AE_C   = (1/η_i − 1/SCOP)     · D_C · S · F_P     calefacción
   AE_ACS = (1/η_i − 1/SCOP_dhw) · D_ACS    · F_P    agua caliente sanitaria
   AE_CAP = (1/η_i − 1/SCOP_pwh) · D_CAP    · F_P    calentamiento de piscina
   AE_TOTAL = AE_C + AE_ACS + AE_CAP
   ```

   ⚠️ Unidades NO homogéneas: `D_C` va en kWh/año·m² (se multiplica por S),
   mientras `D_ACS` y `D_CAP` ya son kWh/año absolutos.

2. **La calefacción es alcance OPCIONAL**: puede haber una actuación de solo
   calefacción, solo ACS o ambas. Lo declara `instalacion.cambio_calefaccion`
   (ausente = SÍ; en RES060/RES093 siempre es SÍ y el toggle no se muestra).
3. **Piscina**: `instalacion.piscina` = `{ activa, demanda_kwh, scop, equipo:{marca,
   modelo,numero_serie} }`. **Nace SIEMPRE desactivada** — casi nunca aplica. El
   SCOP_pwh se mete A MANO desde la ficha técnica (el catálogo `aerotermia` no
   tiene SCOP de piscina y no se interpola por temperatura de impulsión).
4. **D_ACS admite modo MANUAL** (`cee.acs_method = 'manual'` + `cee.dacs_manual` en
   kWh/año). En terciario la demanda va por plaza/servicio (Anexo V de la ficha) o
   la fija el proyecto: la fórmula del CTE por dormitorios no encaja. El selector
   MAN solo se ofrece en expedientes TER100.
5. **SIN IRPF**: el titular es empresa/autónomo, así que no aplican ni la deducción
   por obras en vivienda ni la ganancia patrimonial del bono CAE
   (`includeIrpf: false`, `titularType: 'empresa'`). Precios por defecto los mismos
   que RES060 (95 €/MWh cliente, 160 €/MWh S.O.) y D_i = 15 años.
6. **NO hay hibridación**: la ficha del terciario no contempla el Cb, así que el
   bloque de hibridación se oculta en Instalación.

Todo lo demás es idéntico a RES060: flujo de CEE inicial/final con certificador,
estados, lotes, Anexo I, Convenio de Cesión, Anexo Fotográfico y slots documentales
(comparte `ficha_res060_*` y `cert_cifo_*` — un expediente es de UNA ficha).

### Fuentes únicas (no duplicar esta lógica)

| Qué | Dónde |
|---|---|
| Lista de fichas + correlativo inicial + detección (backend) | [utils/fichas.js](implementation/backend/utils/fichas.js) — `FICHAS`, `correlativoInicial`, `detectPrograma` |
| Lista de fichas + clasificación (frontend) | [expedienteTaxonomia.js](implementation/frontend/src/features/expedientes/logic/expedienteTaxonomia.js) — `FICHAS`, `getFicha` |
| Fórmula de las tres AE | `calculateTer100()` en [calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js) |
| expediente → variables de la ficha | [logic/ter100.js](implementation/frontend/src/features/expedientes/logic/ter100.js) — `deriveTer100Vars`, `esTer100`, `ter100Alcance` |
| Demanda de ACS (xml · CTE · manual) | [logic/demandaAcs.js](implementation/frontend/src/features/expedientes/logic/demandaAcs.js) — `resolveDacs` |
| Ficha oficial TER100 (PDF) | [logic/fichaTer100Html.js](implementation/frontend/src/features/expedientes/logic/fichaTer100Html.js) + `FichaTer100Modal` |
| Recuadro de firma de la ficha | `signBoxes.js` → `ficha_ter100` (**página 4**, no la última) |
| CIFO | `cifoDoc.js` (rama `isTer100`) — la misma para app y backend |

**REGLA**: en el CIFO y en la Ficha, el AE_TOTAL se calcula desde el desglose, NO
desde el `results.savingsKwh` que llega por parámetro. Lo primero que comprueba el
verificador es que el total sea la suma de sus sumandos: no puede haber un
`results` desfasado que produzca un certificado contradictorio.

**REGLA**: un servicio fuera del alcance se imprime **"no aplica"**, nunca 0 (ni su
demanda ni su SCOP). Con el valor a la vista, el verificador podría multiplicarlo y
obtener un ahorro que no forma parte de la actuación.

### El SCOP_dhw con depósito independiente: COP A7/W55 × 0,9 (2026-11-04)

Caso: el cálculo del camping (termo eléctrico → Johnson AURUM160 + acumulador). En el
terciario la acumulación mínima es de **60 °C**, y la ficha lo cambia todo en el ACS:

- **TER100 Anexo IV, Caso 3** (bomba aerotérmica + depósito NO suministrado como conjunto):
  `SCOP_dhw = COP A7/W65 × F_c(zona)` con su propia tabla (D3 1,101…), y **sin dato a
  A7/W65** —el caso de todo el catálogo, que solo guarda `cop_a7_55`—
  `SCOP_dhw = COP A7/W55 × 0,9`, *factor único de corrección*. La bomba tiene que llegar a
  65 °C de impulsión sin apoyo.
- **TER173 Anexo II**: lo mismo para 60 °C de acumulación (su tabla de F_c por zona a W55
  es para acumular a 50 °C, solo precalentamiento).
- El **Anexo VI de la RES060** (F_c por zona: D3 1,113) es del RESIDENCIAL. La app lo
  aplicaba también al terciario y daba un SCOP_dhw ~24 % alto (AURUM160: 3,17 en vez de
  2,57).

**REGLA — en TER100/TER173, el método 'independiente' es COP A7/W55 × 0,9, en cualquier
zona.** Fuente única: `fcAcsIndependiente` / `FC_ACS_TERCIARIO_W55` y la opción
`{ terciario }` de `getScopAcsFromModel` en [calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js);
la pasan Instalación (`AerotermiaSection terciario`, acumulador, conjunto, botón «Clima del
SCOP» vía `scopsParaClima`) y el popup del COP (`EprelAcsModal terciario`). El CIFO imprime
el mismo factor (`scopAcsAnexoViHtml({ terciario })`) y cita el **Anexo IV de la TER100**
(antes decía «Anexo VII», que es el de la temperatura exterior de la piscina).

⚠️ El CIFO **deduce el COP del SCOP guardado** (`COP = SCOP / F_c`): un expediente que
guardó el SCOP con el F_c de zona imprimiría ahora un COP falso hasta que se le recalcule
el SCOP_dhw. Medidos los dos que había (en seco, `backend/scratch/scop-acs-terciario/impacto.mjs`):
**25TER100_2** 3,34 → 2,70 (−310 kWh, CIFO enviado al instalador el 04/11/2026, sin
firmar) y **26TER100_3** 3,09 → 2,50 (−1.520 kWh, CIFO generado sin enviar).

Fuera de alcance, por ahora: el Caso 1 del mismo anexo dice que con depósito **en
conjunto** también se aplica el Caso 3 (la TER040 deja además que el fabricante aporte el
SCOP_dhw); la app sigue usando ahí el Anexo IV/η_wh. Y un termo eléctrico que se cambia por
bomba de calor **no es TER100** (su ámbito es caldera de combustión): es la **TER040**, que
la app no tiene.

Tras tocarlo: `node implementation/backend/scripts/test_scop_acs_terciario.mjs` y
`check_cifo_paginas.mjs` (la hoja del Anexo VI con placa del TER100 va a +37 px).

**REGLA**: `fichaTer100Html.js` es una RÉPLICA de `plantillas/Ficha TER100.pdf` —
mismos saltos de página, textos, notas al pie, subtítulos centrados en cursiva y
fórmulas centradas con fracción apilada. Los saltos de página **no se mueven**: el
verificador compara la ficha con el modelo oficial. Geometría medida con PyMuPDF
sobre la plantilla (idéntica a la de RES060): A4, Arial 12pt, interlineado 20,7pt
(1,725), padding `94px 99px 19px 113px`. Si se cambia el ancho de texto, los
párrafos y las notas dejan de romper donde rompen en el original. Para
re-verificarlo: renderizar la plantilla a 794px de ancho con PyMuPDF y comparar
página a página con el PDF generado.
