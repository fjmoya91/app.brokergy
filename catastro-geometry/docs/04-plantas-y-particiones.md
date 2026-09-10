# Plantas y particiones horizontales

## Catastro no publica la planta: publica cuántas plantas tiene cada trozo

El WFS devuelve `bu:BuildingPart` con `numberOfFloorsAboveGround` y
`numberOfFloorsBelowGround`. La huella de la planta `k` es la **unión de las
partes que llegan a esa altura**:

```
planta k (k ≥ 0)  =  ∪ { parte : numberOfFloorsAboveGround ≥ k+1 }
sótano  −n        =  ∪ { parte : numberOfFloorsBelowGround  ≥ n   }
```

Es una reconstrucción `COMPUTED` sobre datos `MEASURED`, no una medición.

Ejemplo de Pedro Muñoz: tres partes de 90,80 (1 planta), 74,18 (**2 plantas**) y
26,52 m² (1 planta) → planta baja 191,50 m² y planta primera 74,18 m².

### Consecuencia: con este modelo NO se puede representar un vuelo

Una parte con 2 plantas está en el nivel 0 **y** en el 1, así que la huella de
una planta siempre está contenida en la de abajo. Un balcón o un vuelo sobre la
calle **no puede salir de aquí**: si en un CE3X aparece un *suelo en contacto con
aire exterior*, viene del DXF o de una medición en obra. La rama del código
existe y está probada, pero los datos de Catastro no la disparan nunca.

## De ahí salen suelos, cubiertas y particiones, por intersección vertical

Para cada planta `k`, con `A` = huella de `k`, `B` = la de abajo, `C` = la de
arriba:

| Operación | Qué es |
|---|---|
| `k` es la planta más baja | **SUELO en contacto con TERRENO**, toda `A` |
| `A ∩ B` | **PARTICIÓN HORIZONTAL** con la planta de abajo |
| `A − B` | **SUELO en contacto con aire** (voladizo — ver arriba) |
| `A ∩ C` | **PARTICIÓN HORIZONTAL** con la planta de arriba |
| `A − C` | **CUBIERTA al aire** |
| no hay `C` | **CUBIERTA al aire**, toda `A` |

Y cuando el espacio del otro lado es **no habitable** (garaje, almacén, zona
común), la partición pasa a ser lo que CE3X pide de verdad:

* `ESPACIO_NO_HABITABLE_INFERIOR` — la vivienda sobre el garaje
* `ESPACIO_NO_HABITABLE_SUPERIOR` — la vivienda bajo el almacén

En Pedro Muñoz: la planta primera es ALMACÉN y se apoya sobre la vivienda, así
que **74,18 de los 191,50 m² de techo de la vivienda** son partición con espacio
no habitable superior, y los otros **117,32 m²** cubierta al aire. Esa distinción
se pierde midiendo a ojo y mueve la calificación.

## Las dos caras del mismo forjado

El mismo forjado sale dos veces: como **techo** de la planta de abajo y como
**suelo** de la de arriba. Es a propósito — en CE3X se introduce desde el
recinto que se está certificando, y cuál toca depende de cuál sea la vivienda.

Cuando los dos lados son el mismo uso habitable, es un forjado **interno** de la
vivienda: sale marcado `relevante_ce3x = false` y con la nota *"forjado entre
plantas del mismo uso: en CE3X no se introduce"*.

## El uso de la planta

Sale de `Consulta_DNPRC` (`lcons[]`), que dice el uso, la planta y la superficie
de cada unidad constructiva:

* **un solo uso en la planta** → asignación fiable, confianza 0,85;
* **varios usos** → se marca el dominante con confianza baja y la nota
  *"Catastro no dice qué polígono es cada uno"*, y **no se reparte el
  polígono**. Ver `docs/06`.

## La comprobación que delata haber modelado el edificio equivocado

La huella de cada planta se cruza contra la superficie que Catastro declara para
ese nivel. Por encima del 15 % de desvío salta `FLOOR_AREA_MISMATCH`.

En Pedro Muñoz cuadran las tres (0,1 %, 0,3 % y 0,2 %), y eso es la verificación
de que se ha modelado el edificio correcto. **En un piso de un bloque esa
comprobación es la que avisará** de que el WFS ha dado el edificio entero y no el
inmueble.
