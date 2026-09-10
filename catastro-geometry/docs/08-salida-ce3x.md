# La salida hacia CE3X

`output/ce3x_geometry.csv` (separador `;`) y `.json`. Una fila = un cerramiento
listo para teclear.

## Las columnas

| Columna | Qué es |
|---|---|
| `ID` | `F01`, `M01`, `PI01`, `SU01`, `CU01`, `PH01`. **El mismo que sale en el plano y en el mapa** |
| `planta` | `PB`, `P1`, `S1`… |
| `tipo` | FACHADA · MEDIANERA · PARTICION_INTERIOR_VERTICAL · SUELO · CUBIERTA · PARTICION_INTERIOR_HORIZONTAL |
| `subtipo` | CALLE · PATIO · TERRENO · AIRE_EXTERIOR · ESPACIO_NO_HABITABLE_SUPERIOR… |
| `contacto` | el contacto geométrico crudo, antes de traducir a CE3X |
| `espacio_origen` / `espacio_destino` | VIVIENDA → EXTERIOR, VIVIENDA → ALMACEN… |
| `largo_m`, `alto_m`, `largo_x_alto`, `superficie_m2` | la operación **escrita**, no solo el resultado |
| `orientacion`, `azimut` | N/NE/E/SE/S/SO/O/NO y los grados exactos |
| `fuente_largo`, `fuente_alto` | de dónde sale cada dimensión |
| `confianza`, `requiere_revision` | ver `docs/07` |
| `evidencia_*`, `nivel`, `ring`, `segmento_origen`, `nota` | traza |

## Cómo se corresponde con el formulario de CE3X

| Nuestra fila | En CE3X |
|---|---|
| `FACHADA` + orientación | **Muro de fachada**, con su orientación |
| `MEDIANERA` | **Muro de medianería** (adiabático) |
| `PARTICION_INTERIOR_VERTICAL` | **Partición interior vertical** con espacio no habitable |
| `SUELO` / `TERRENO` | **Suelo en contacto con el terreno** |
| `SUELO` / `AIRE_EXTERIOR` | **Suelo en contacto con el aire exterior** |
| `CUBIERTA` / `AIRE_EXTERIOR` | **Cubierta en contacto con el aire** |
| `PARTICION_INTERIOR_HORIZONTAL` / `..._INFERIOR` | **Suelo en contacto con espacio no habitable** |
| `PARTICION_INTERIOR_HORIZONTAL` / `..._SUPERIOR` | **Techo en contacto con espacio no habitable** |

**Contraste útil**: el `.xml` de un CEE ya hecho lleva la misma información en
`<DATOSENVOLVENTETERMICA><CERRAMIENTOSOPACOS><ELEMENTO>`, con `<TIPO>`,
`<ORIENTACION>` y `<SUPERFICIE>` — donde `ADIABATICO` es la medianera. Es la
forma de comparar lo que calcula el programa con lo que tecleó un certificador.

## La superficie es BRUTA

`largo × alto`, **sin descontar huecos**. Las ventanas no salen de Catastro: se
introducen aparte en CE3X, y descontarlas aquí sería inventarlas.

## Lo que el programa NO da

* **Huecos** (ventanas y puertas): no están en ninguna fuente catastral.
* **Composición constructiva y transmitancias**: fuera del alcance a propósito.
* **Sombras**: la geometría de los colindantes está en el modelo (`vecinos.geojson`),
  pero no se calcula el estudio de sombras.
* **Puentes térmicos**.
