# Uso ↔ polígono: el límite duro del proyecto

**Catastro dice QUÉ hay y CUÁNTO mide, pero no DÓNDE está.**

```
Consulta_DNPRC   →  "en la planta 00 hay VIVIENDA 165 m² y ALMACÉN 27 m²"
INSPIRE WFS      →  el polígono de la planta 00, entero
                    ────────────────────────────────────────
                    qué trozo es la vivienda: NO DISPONIBLE
```

Ninguna vía pública automatizable lo resuelve. Es honesto decirlo así, y el
programa lo dice: uso dominante con confianza baja, la nota
*"Catastro no dice qué polígono es cada uno"* y el diagnóstico
`SPACE_GEOMETRY_UNAVAILABLE`.

## Por qué importa

Sin ese reparto no se puede situar la **partición interior vertical** entre la
vivienda y el garaje o el almacén, que en CE3X es un cerramiento más y que en una
unifamiliar con garaje suele ser una superficie considerable.

Cuando la planta tiene **un solo uso** el problema no existe: la asignación es
fiable (confianza 0,85) y las particiones horizontales salen bien. Es el caso de
la planta primera de Pedro Muñoz (ALMACÉN 74 m²).

## La única vía: la cartografía detallada

### DXF de la parcela — **implementado y probado**

Se baja de la Sede Electrónica: *Consulta de bienes inmuebles → [RC] →
Cartografía → Descargar croquis/DXF*. Sin identificarse hay **captcha**; con
certificado o Cl@ve no, pero sigue siendo la web: **no hay endpoint documentado,
y no se hace scraping**.

Por eso el módulo es un **lector de fichero aportado** (`--dxf`), no un cliente
de red.

Qué hace (`src/catastro/fxcc.py`):

1. lee las polilíneas por capa (lector de códigos de grupo, sin dependencias);
2. se queda con las capas de construcción (`CONSTRU`, `SUBPARCE`…);
3. empareja cada subparcela con el **rótulo de plantas en romanos** que cae
   dentro: `II` → 2, `-I` → −1 (sótano), `III+TZA` → 3 (lo que va tras el `+` no
   suma plantas);
4. asigna el uso por superficie **solo cuando es inequívoco**:
   `área × plantas` tiene que cuadrar con **un único** uso declarado, dentro del
   15 %.

**Regla: si dos usos cuadran, no se asigna ninguno.** Adivinar cuál es el garaje
es exactamente el error que convierte un certificado en un requerimiento.

### FXCC — **NO interpretado**

El fichero de intercambio de cartografía catastral se obtiene por la vía de
descarga de cartografía vectorial (exige identificación) o por convenio con la
D.G. del Catastro.

Se lee y se inventaría por tipo de registro, pero **no se traduce a geometría**:
no se ha podido contrastar el layout contra un fichero real, y un parser de
formato fijo adivinado produciría polígonos plausibles y falsos. Con un FXCC de
ejemplo se cierra rápido.

## Lo que se hace mientras tanto

* el uso se cuelga de la **planta**, no del polígono;
* las particiones **horizontales** (vivienda sobre garaje, vivienda bajo
  almacén) sí salen, porque para eso basta el uso por planta;
* las particiones **verticales** dentro de la misma planta quedan pendientes y
  se dice.
