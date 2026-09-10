# CEE — de una referencia catastral a la envolvente en CE3X

Coge una **referencia catastral española**, saca de fuentes oficiales la
geometría del edificio y la deja **medida y clasificada**, lista para teclear
(o para que la teclee Computer Use) en **CE3X**.

```
RC  →  Catastro  →  geometría  →  clasificación  →  tabla CE3X
```

No calcula transmitancias ni nada térmico. Devuelve **qué cerramiento es cada
cosa, contra qué da, cuánto mide y hacia dónde mira** — con la procedencia de
cada número pegada al número.

**Estado: funciona sobre viviendas unifamiliares.** Ver
[`docs/09-limitaciones.md`](docs/09-limitaciones.md).

---

## Arranque

```powershell
pip install -r requirements.txt

# analizar un ejemplo ya descargado, sin pedirle nada a Catastro
python -m src.main 4410205WJ0641S0001JH --offline --skip-lidar `
  --cache ejemplos\4410205WJ0641S-pedro-munoz\cache --floor-height 2.70

python -m pytest -q          # 92 tests
```

Para un inmueble nuevo, con salida a `ovc.catastro.meh.es`:

```powershell
python -m src.main <RC> --only-fetch --pausa 1.5     # descarga (unas 20 peticiones)
python -m src.main <RC> --offline --floor-height 2.70 # analiza, ya sin red
```

### Salida

| Fichero | Qué es |
|---|---|
| `output/ce3x_geometry.csv` | una fila por cerramiento, con `largo × alto` escrito |
| `output/ce3x_geometry.json` | lo mismo + el modelo entero y la traza de cada petición |
| `output/geometry_debug.png` | **el plano, un panel por planta**, con el ID y la longitud de cada muro |
| `output/debug_map.html` | el mismo resultado sobre la ortofoto del PNOA y el WMS catastral |

Ejemplo real (Calle Méjico 4, Pedro Muñoz):

```
ID    Planta Tipo         Contacto                       Largo x alto   Superficie  Orient.
F11   PB     FACHADA      EXTERIOR_CALLE                 14.13 x 2.70    38.14 m2   S
M01   PB     MEDIANERA    OTHER_BUILDING                  9.05 x 2.70    24.44 m2   N
F18   P1     FACHADA      SOBRE_CUBIERTA_COLINDANTE       9.05 x 2.70    24.44 m2   N
PH01  PB     PARTICION    ESPACIO_NO_HABITABLE_SUPERIOR           -      74.18 m2   -
```

---

## Cómo está montado

```
src/catastro/    refcat · client (HTTP anti-WAF) · inspire (WFS) · alphanumeric (WCF) · fxcc (DXF)
src/gis/         geometry (GML+CRS) · segments (normal exterior) · orientation ·
                 adjacency (medianeras, patios) · floors (plantas, particiones)
src/lidar/       pnoa (alturas — SIN CERRAR)
src/ce3x/        schema · classifier · export
src/viz/         plan_png · map_html
src/             model · pipeline · main (CLI)

docs/            el conocimiento: por qué y cómo se calcula cada cosa
ejemplos/        casos reales con sus datos crudos y su salida. Es el banco de pruebas
tools/           reconocer.py (6 peticiones) · make_fixture.py
```

**Empieza por [`docs/00-mapa.md`](docs/00-mapa.md).** Ahí está el porqué de cada
decisión: la normal exterior, por qué la tolerancia detecta pero no mide, cómo se
distingue un patio de un retranqueo, de dónde salen los suelos y las cubiertas, y
qué es exactamente lo que Catastro **no** da.

---

## Opciones

```
--output ./output        --data ./data          --cache ./cache
--floor-height 2.70      altura libre de planta (se marca como MANUAL)
--tolerance 0.15         para detectar medianeras (0.05-0.30)
--min-contact 0.30       contacto mínimo para considerar medianera
--dxf parcela.dxf        DXF de la parcela: reparte uso <-> polígono
--fxcc fichero.fxcc      solo inventario, no interpretado
--skip-lidar             no consultar el IGN
--offline / --refresh    solo caché / ignorar caché
--only-fetch             descargar y parar
--pausa 1.5              segundos entre peticiones a Catastro
--retries 4  --timeout 30  --max-vecinos 12
--debug
--fixture DIR            PRUEBAS: servir respuestas desde ficheros
```

---

## Lo que hay que saber antes de tocarlo

Tres reglas de fondo, y están en el código como comentarios donde importan:

1. **Lo que no se sabe, se dice.** Nunca se rellena un hueco con un valor
   plausible: `value: null` y el motivo escrito.
2. **La IA no mide.** Distancias, ángulos, intersecciones y adyacencias salen de
   operaciones deterministas.
3. **Cada número sabe de dónde viene.** `MEASURED` / `COMPUTED` / `INFERRED` /
   `MANUAL` no se mezclan.

Y una operativa: **al otro lado hay el mismo WAF del que depende el buscador de
app.brokergy en producción**. Peticiones en serie, con pausa, y parada al primer
403. Ver [`docs/01-catastro-fuentes.md`](docs/01-catastro-fuentes.md).

---

## Verificación

Además de los 92 tests, el programa **se comprueba a sí mismo**: cruza la huella
de cada planta contra la superficie que declara Catastro para ese nivel. En el
caso de Pedro Muñoz cuadran las tres:

| | Geometría | Catastro declara | Desvío |
|---|---|---|---|
| Parcela | 218,72 m² | 219 | 0,1 % |
| Huella planta baja | 191,50 m² | 165 + 27 = 192 | **0,3 %** |
| Huella planta primera | 74,18 m² | 74 | **0,2 %** |

Ese cuadre es lo que delata haber modelado el edificio equivocado, y salta solo
(`FLOOR_AREA_MISMATCH`) por encima del 15 %.

**Y aun así, mira el `geometry_debug.png`.** Los tres fallos más caros del
proyecto se vieron mirando el dibujo, no leyendo el CSV.
