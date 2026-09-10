# 4410205WJ0641S0001JH — Calle Méjico 4, 13620 Pedro Muñoz (Ciudad Real)

**Vivienda unifamiliar entre medianeras, dos plantas, 1994.** El primer caso
real del proyecto, y el que destapó tres fallos que con geometría inventada no
se ven.

## Qué dice Catastro

| | |
|---|---|
| Tipo de finca | Parcela construida **sin división horizontal** → el edificio ES la vivienda |
| Superficie construida | 266 m² |
| Antigüedad | 1994 |
| Suelo (parcela) | 219 m² |
| Planta baja | VIVIENDA 165 m² + ALMACÉN 27 m² |
| Planta primera | ALMACÉN 74 m² |
| Colindantes | 5 parcelas; nos tocan `4410202WJ0641S` y `4410213WJ0641S`, **las dos de una sola planta** |

## Qué sale, y por qué se sabe que es el edificio correcto

El modelo se cierra solo contra los datos alfanuméricos, por tres vías
independientes. Ese cuadre es la verificación, no una impresión:

| | Geometría | Catastro declara | Desvío |
|---|---|---|---|
| Parcela | 218,72 m² | 219 | 0,1 % |
| Huella planta baja | 191,50 m² | 165 + 27 = 192 | **0,3 %** |
| Huella planta primera | 74,18 m² | 74 | **0,2 %** |

29 cerramientos: 21 fachadas (284,17 m²), 3 medianeras (47,44 m²), 1 suelo en
terreno (191,50 m²), 2 cubiertas (191,50 m²) y 2 particiones horizontales.

## Lo que enseña este caso

### 1. Las medianeras pueden existir solo en una planta
Los dos colindantes que nos tocan tienen **una planta** y la casa tiene dos, así
que los mismos muros —M01 (9,05 m), M02 (0,84 m), M03 (7,68 m)— son medianera en
la baja y **fachada sobre la cubierta del colindante** en la primera. Meter ahí
una medianera sería declarar 47 m² de muro adiabático donde hay muro al
exterior: en un CE3X eso cambia la demanda.

Por eso se piden también los `BuildingPart` de los colindantes: sin ellos no se
sabe hasta qué altura llega cada vecino.

### 2. Un patio lo es del edificio, no de la planta
Los dos patios (18,29 m² con el 79 % del borde edificado, y 8,94 m² con el 95 %)
salían PATIO desde la baja y RETRANQUEO desde la primera, porque al encoger la
planta el hueco se hace mayor y su borde deja de estar rodeado. El cerramiento
se mide sobre la huella **global**.

### 3. `bu-ext2d:Building` pone el `boundedBy` ANTES de su geometría
Cogiendo "el primer tag geométrico que aparezca", el edificio se quedaba sin
huella y el modelo caía al respaldo de BuildingParts **sin que nadie se
enterara**. Peor habría sido aceptar el `Envelope`: un rectángulo de 254 m² con
toda la pinta de una huella buena.

### 4. El almacén de arriba cambia 74 de los 191 m² de techo
La planta primera es ALMACÉN y se apoya sobre la vivienda, así que 74,18 m² del
techo de la vivienda son *partición con espacio no habitable superior* y los
otros 117,32 m² son cubierta al aire. Es la distinción que se pierde midiendo a
ojo, y mueve la calificación.

## Lo que este caso NO resuelve

**En la planta baja conviven VIVIENDA (165 m²) y ALMACÉN (27 m²) y Catastro no
dice qué polígono es cada uno.** Sale con confianza 0,43, su nota, y el
diagnóstico `SPACE_GEOMETRY_UNAVAILABLE`. Con eso no se puede situar la
partición vertical vivienda↔almacén, que en CE3X es un cerramiento más. Se
resuelve con el DXF de la parcela (ver `dxf/LEEME.md`).

**La altura no la publica Catastro.** Los 2,70 m son `--floor-height`, así que
26 de las 29 filas van marcadas `requiere_revision` con el motivo escrito.

## Reproducirlo

```powershell
python -m src.main 4410205WJ0641S0001JH --offline --skip-lidar `
  --cache ejemplos\4410205WJ0641S-pedro-munoz\cache `
  --output ejemplos\4410205WJ0641S-pedro-munoz\salida --floor-height 2.70
```
