# Trazabilidad

Esto acaba en un certificado energético que firma alguien. Cada magnitud lleva
pegado de dónde sale, y **los cuatro tipos de evidencia no se mezclan nunca**.

```json
{ "largo": { "value": 9.05, "source": "CATASTRO_WFS_BU",
             "confidence": 1.0, "evidence_type": "MEASURED" },
  "alto":  { "value": 2.70, "source": "USER_INPUT", "confidence": 0.5,
             "evidence_type": "MANUAL",
             "note": "valor dado con --floor-height" },
  "superficie": { "value": 24.44, "source": "USER_INPUT", "confidence": 0.5,
                  "evidence_type": "COMPUTED",
                  "note": "largo x alto (bruta, sin descontar huecos)" } }
```

| Evidencia | Qué significa | Ejemplo |
|---|---|---|
| `MEASURED` | viene tal cual de una fuente oficial | la longitud de un segmento del GML |
| `COMPUTED` | operación determinista sobre datos `MEASURED` | largo × alto; el área de una intersección vertical |
| `INFERRED` | una regla explícita que **puede fallar** | el uso de un polígono a partir del uso de su planta |
| `MANUAL` | lo aporta una persona o un valor por defecto del CLI | `--floor-height` |

## La confianza y la marca de revisión

`confianza` es el mínimo de las confianzas que intervienen. Una fila sale con
`requiere_revision = true` cuando:

* la confianza baja de 0,80, **o**
* no hay altura medida (entonces la superficie es provisional), **o**
* el contacto salió `DESCONOCIDO`.

**Es normal que casi todas las filas salgan marcadas mientras no haya altura
medida.** No es un fallo: la superficie de un muro sin altura medida ES
provisional, y decirlo es la única forma honesta de entregarlo. El largo sigue
siendo `MEASURED`; lo provisional es el producto.

## La operación se ve escrita

El CSV no da solo el resultado:

```
largo_m = 9.05 · alto_m = 2.70 · largo_x_alto = "9.05 x 2.70" · superficie_m2 = 24.44
```

Así se puede comprobar de un vistazo, sin recalcular nada, y se ve enseguida si
lo que está mal es el largo (geometría) o el alto (dato manual).

## Lo que NO se pudo obtener también se guarda

`diagnostics` lleva códigos estables, no frases:

| Código | Qué pasó |
|---|---|
| `BUILDING_GEOMETRY_UNAVAILABLE` | Catastro no devolvió huella |
| `SPACE_GEOMETRY_UNAVAILABLE` | hay usos por planta pero no polígono por uso |
| `FLOOR_AREA_MISMATCH` | la huella no cuadra con la superficie catastral |
| `NEIGHBOUR_FLOORS_UNKNOWN` | no se sabe hasta qué altura llega un colindante |
| `BUILDING_HEIGHT_UNAVAILABLE` | sin LiDAR |
| `CATASTRO_UNREACHABLE_FROM_THIS_HOST` | ninguna petición llegó a salir de la máquina |

Y la traza HTTP completa (URL, status, bytes, si vino de cache) va en el JSON.
