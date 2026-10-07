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

**REGLA**: `fichaTer100Html.js` es una RÉPLICA de `plantillas/Ficha TER100.pdf` —
mismos saltos de página, textos, notas al pie, subtítulos centrados en cursiva y
fórmulas centradas con fracción apilada. Los saltos de página **no se mueven**: el
verificador compara la ficha con el modelo oficial. Geometría medida con PyMuPDF
sobre la plantilla (idéntica a la de RES060): A4, Arial 12pt, interlineado 20,7pt
(1,725), padding `94px 99px 19px 113px`. Si se cambia el ancho de texto, los
párrafos y las notas dejan de romper donde rompen en el original. Para
re-verificarlo: renderizar la plantilla a 794px de ancho con PyMuPDF y comparar
página a página con el PDF generado.
