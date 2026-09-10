# Por dónde empezar

Este proyecto convierte **una referencia catastral** en la **envolvente medida y
clasificada** de un edificio, lista para teclear en CE3X.

No calcula nada térmico. Calcula geometría: qué cerramiento es cada cosa, contra
qué da, cuánto mide y hacia dónde mira.

```
RC  →  Catastro  →  geometría  →  clasificación  →  tabla CE3X
```

## Los documentos

| | |
|---|---|
| [01 — Fuentes de Catastro](01-catastro-fuentes.md) | qué servicios hay, qué da cada uno, y las reglas del WAF que no se pueden romper |
| [02 — Geometría y orientaciones](02-geometria-y-orientaciones.md) | la normal exterior, el azimut, por qué la tolerancia detecta pero no mide |
| [03 — Clasificación de cerramientos](03-clasificacion-cerramientos.md) | el árbol de decisión completo: medianera, patio, calle, partición |
| [04 — Plantas y particiones horizontales](04-plantas-y-particiones.md) | cómo se reconstruye cada planta y de dónde salen suelos y cubiertas |
| [05 — Alturas](05-alturas.md) | lo que no publica Catastro y lo que se puede hacer |
| [06 — Uso por polígono](06-uso-por-poligono.md) | el límite duro del proyecto, y el DXF |
| [07 — Trazabilidad](07-trazabilidad.md) | por qué cada número lleva pegado de dónde sale |
| [08 — La salida hacia CE3X](08-salida-ce3x.md) | qué columna es cada campo del formulario |
| [09 — Limitaciones conocidas](09-limitaciones.md) | lo que NO funciona, dicho antes de que te lo encuentres |
| [10 — Siguientes pasos](10-siguientes-pasos.md) | el plan para depurar unifamiliares, y con qué medirse |

## Las tres reglas de fondo

1. **Lo que no se sabe, se dice.** Nunca se rellena un hueco con un valor
   plausible. `value: null` + el motivo escrito.
2. **La IA no mide.** Distancias, ángulos, intersecciones y adyacencias salen de
   operaciones geométricas deterministas. Ningún modelo decide una longitud.
3. **Cada número sabe de dónde viene.** `MEASURED` / `COMPUTED` / `INFERRED` /
   `MANUAL` no se mezclan, porque esto acaba en un certificado energético.
