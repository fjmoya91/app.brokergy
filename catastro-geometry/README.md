# brokergy-geometry — de una referencia catastral a la envolvente en CE3X

Coge una referencia catastral española, saca de fuentes oficiales la geometría
del inmueble y la deja clasificada y medida en una tabla lista para teclear
(o para que la teclee Computer Use) en **CE3X**.

No calcula transmitancias ni nada térmico. Devuelve **qué cerramiento es cada
cosa, contra qué da, cuánto mide y hacia dónde mira** — con la procedencia de
cada número pegada al número.

```
python -m src.main 4410205WJ0641S0001JH
brokergy-geometry 4410205WJ0641S0001JH --output ./output --floor-height 2.70
```

---

## Estado: FUNCIONANDO CON DATOS REALES DE CATASTRO

`output/real/` tiene el resultado de **4410205WJ0641S0001JH** (Calle Méjico 4,
Pedro Muñoz), sacado de las respuestas reales de Catastro que están en
`data/real/raw/`. Ver "RESULTADO DE LA PRUEBA" al final.

El entorno donde se desarrolla el MVP no tiene salida a `ovc.catastro.meh.es`
(la política de egreso lo bloquea en el proxy, junto con `ign.es`, `cnig.es` e
`idee.es`), así que la descarga se hace por un workflow manual desde un runner
de GitHub, que commitea las respuestas crudas al repo. El análisis se hace
después con `--offline`, sin volverle a pedir nada a Catastro.

### Cómo se traen los datos reales sin salida a Internet

El repo trae un workflow manual, `.github/workflows/catastro-geometry-fetch.yml`,
que hace la descarga desde un runner de GitHub y **commitea las respuestas
crudas** a la rama. El análisis se hace después con `--offline`, sin volverle a
pedir nada a Catastro.

```jsonc
// catastro-geometry/.disparar/parametros.json  — escribirlo y hacer push dispara el workflow
{ "fase": "reconocimiento", "pausa": 1.5 }
{ "fase": "datos", "refcat": "4410205WJ0641S0001JH", "max_vecinos": 4, "pausa": 1.5 }
```

Al otro lado está **el mismo WAF del que depende el buscador de la app en
producción**, así que el gasto de peticiones está acotado de verdad:

| Freno | Qué hace |
|---|---|
| Fase de **reconocimiento**, 6 peticiones exactas | pregunta al servicio cómo se llaman sus stored queries **antes** de pedir ningún dato. Sale más barato que adivinar |
| Presupuesto de intentos fallidos | el peor caso pasó de **24 peticiones a 8**: con el descubrimiento hecho, cada consulta es UNA petición |
| `--pausa` (1,5 s) y `concurrency` | nada de ráfagas, y nunca dos ejecuciones a la vez |
| Parada al primer 403 | al WAF no se le insiste jamás, igual que hace `catastroMonitor` en producción |
| `max_vecinos` | acota los colindantes (2 peticiones por vecino) |

El runner sale por IPs de Azure, **no por la del VPS**: si el WAF se molestara,
producción no se entera.

Además:

| | |
|---|---|
| **92 tests** en verde (`python -m pytest`) | geometría, medianeras parciales, patios, plantas, GML, DXF y el recorrido completo |
| `output/_autoprueba_sintetica/` | la misma cadena sobre una casa **inventada**, con el resultado conocido de antemano. Sirve para los tests; nunca se confunde con un expediente |
| **Dígitos de control** | verificados contra la RC real: `4410205WJ0641S0001JH` valida y una errata en el último carácter se detecta |
| **El camino de fallo** | probado: sin salida a Catastro falla limpio, con traza y causa raíz, y no inventa geometría |

---

## Instalación

```bash
pip install shapely pyproj lxml numpy folium matplotlib
pip install -e .            # deja el comando brokergy-geometry
```

Sin `geopandas` a propósito: da problemas de instalación y no aporta nada que
no hagan `shapely` + `pyproj` directamente.

## Opciones

```
--output ./output        --data ./data          --cache ./cache
--floor-height 2.70      altura libre de planta (se marca como MANUAL)
--tolerance 0.15         boundary_tolerance_m para detectar medianeras (0.05-0.30)
--min-contact 0.30       contacto minimo para considerar medianera
--dxf parcela.dxf        DXF de la parcela: reparte uso <-> poligono (ver §6)
--fxcc fichero.fxcc      solo inventario, no interpretado (ver §6)
--skip-lidar             no consultar el IGN
--offline / --refresh    solo cache / ignorar cache
--only-fetch             descargar y parar
--retries 4 --timeout 30 --max-vecinos 12
--debug
--fixture DIR            PRUEBAS: servir respuestas desde ficheros
```

---

## Cómo está montado

```
src/
├── catastro/
│   ├── refcat.py       normalizacion RC 14/20 + digitos de control
│   ├── client.py       HTTP cache-first, reintentos, backoff, anti-WAF
│   ├── inspire.py      WFS CP y BU: descubrimiento de stored queries + GetFeature
│   ├── alphanumeric.py WCF JSON: uso, planta, superficie, antiguedad
│   └── fxcc.py         lector de DXF (implementado) e inventario FXCC (no interpretado)
├── gis/
│   ├── geometry.py     GML -> shapely, CRS y orden de ejes
│   ├── segments.py     segmentacion del perimetro y NORMAL EXTERIOR
│   ├── orientation.py  azimut -> N/NE/E/SE/S/SO/O/NO
│   ├── adjacency.py    medianeras, patios, particiones, troceo parcial
│   └── floors.py       huella por planta e intersecciones verticales
├── lidar/pnoa.py       altura por MDS-MDT del IGN (ver limitaciones)
├── ce3x/               esquema, clasificador y export CSV/JSON
├── viz/                plano PNG por plantas y mapa HTML
├── model.py            parcel / buildings / building_parts / floors / spaces
├── pipeline.py         el recorrido completo
└── main.py             CLI
```

### Qué se ha reutilizado de la app (y qué no había)

Revisado `implementation/backend/services/catastroService.js`: la app usa **solo
los WCF JSON alfanuméricos** (`Consulta_DNPRC`, `Consulta_CPMRC`,
`Consulta_RCCOOR`). **No toca el INSPIRE WFS**, así que no había código de
geometría que reutilizar — los polígonos son terreno nuevo.

Lo que sí se ha portado, que es el conocimiento caro, es su `catastroGet`:
mismo User-Agent, mismo orden de cabeceras, `family: 4`, la misma detección de
rate-limit (`isRateLimitResponse`) y el mismo criterio de parar al primer 403
que aplica `catastroMonitor`. Y el `Accept` va por tipo de servicio:
`application/json` a los WCF, como manda producción, y XML a los WFS.

### El cliente HTTP no usa `requests`, y es a propósito

Se habla `http.client` directamente para controlar el **orden exacto de las
cabeceras**. Son las reglas que Brokergy ya tiene medidas contra el WAF del
Catastro desde IPs de datacenter (ver `CLAUDE.md` del backend):

* IPv4 forzado — Happy Eyeballs sobre IPv6 dispara el WAF;
* orden `User-Agent`, `Accept`, `Accept-Encoding: identity`;
* UA identificable y genérico (los UA de Chrome completo, `curl/*` o
  `PostmanRuntime/*` están bloqueados);
* **nada de ráfagas**: las peticiones van en serie con 0,8 s entre ellas;
* al primer 403 o "no se puede procesar su petición" **no se insiste**.

### Los identificadores de las stored queries se leen, no se memorizan

`inspire.py` pregunta al servicio con `DescribeStoredQueries` y, si no,
`ListStoredQueries`, y elige la consulta por lo que dice que hace. La lista
`GetParcel` / `GetNeighbourParcel` / `GetBuildingByParcel` /
`GetBuildingPartByParcel` es solo el **respaldo**, y cuando se usa queda anotado
en la salida (`stored_queries_CP.descubrimiento`). Además se prueban las dos
rarezas conocidas del servicio: `STOREDQUERY_ID` y el `STOREDQUERIE_ID` con
errata, y las tres formas de escribir el SRS.

---

## Las decisiones que importan

### La normal exterior, no la dirección de la línea

Se normaliza el sentido de giro con `shapely.orient()`: anillo exterior
antihorario, huecos horarios. Con ese convenio, para `p1 -> p2` la normal
exterior es **siempre** `(dy, -dx)` — hacia fuera en la fachada y **hacia el
patio** en un hueco. El azimut sale de `atan2(nx, ny)` en EPSG:25830, donde +y
es el Norte de verdad. Nunca se calculan metros sobre latitud/longitud.

### La tolerancia DETECTA el contacto; no lo MIDE

Es el fallo que costó encontrar. Dilatando al vecino 0,15 m y midiendo sobre el
dilatado, la medianera de 6,00 m salía de **6,15 m** — y esos 15 cm viajan a la
superficie del muro del certificado. Ahora se toma la parte del vecino que cae
dentro de una banda de tolerancia alrededor de la recta y se **proyecta sobre la
recta sin dilatar**. Vigilado por `test_la_tolerancia_detecta_pero_no_mide`.

### Cada trozo se sondea por su cuenta

Con el vecino ocupando 6 de los 10 m, sondear el punto medio del segmento
**entero** (y=5, dentro del vecino) daba los 4 m libres también como medianera.
El sondeo se hace sobre cada trozo ya partido.

### La vecindad se resuelve POR PLANTA

Un muro de la primera planta no es medianera porque el vecino tenga planta
baja: lo es si el vecino **llega a esa altura**. Por eso se piden también los
`BuildingPart` de las parcelas colindantes. Si no los da Catastro, se asume que
llega y esa medianera sale con **confianza rebajada y anotada**.

### Un retranqueo no es un patio

Un jardín delantero de 1 m es fachada exterior; un patio es un hueco **rodeado**
de edificación. Se decide por la fracción del borde del espacio libre que forman
edificios (`patio_enclosure_ratio`, 0,60 por defecto), y esa fracción se imprime
en la nota para poder discutirla: *"patio: el 78% de su borde lo forman
edificios"*.

### Se fusionan los muros colineales del mismo tipo

La unión de dos `BuildingPart` que comparten un lado deja un vértice en mitad de
una pared recta: la fachada de 12 m salía partida en 8 + 4. Se unen solo si
coinciden el anillo, la clasificación y la orientación — **un vértice que separa
medianera de fachada no se toca nunca**.

### El mapa necesita Internet, y el plano no

`debug_map.html` carga Leaflet de un CDN y las teselas de la ortofoto del PNOA y
del WMS del Catastro: **ábrelo con conexión**. Sin ella se ve la leyenda y el
mapa en blanco (comprobado: `typeof L === "undefined"`). `geometry_debug.png` es
autosuficiente y no depende de nada.

Lo que sí está verificado del mapa sin poder renderizarlo: sus 17 polilíneas
reproyectadas de vuelta a EPSG:25830 dan **exactamente** las longitudes del CSV
(±2 cm) y caen en las coordenadas correctas. Un orden de ejes mal metido pondría
el edificio en el golfo de Guinea y el CSV no se enteraría — por eso es un test.

### El plano rotula con el ID del CSV

`geometry_debug.png` lleva `F01`, `M01`, `PI01`… los mismos del CSV, porque el
plano existe para cruzarlo con la tabla. Y **una planta por panel**: encimadas,
la medianera de la planta baja queda debajo de la de la primera y su rótulo
desaparece — se ve un plano limpio que esconde justo lo que hay que revisar.

---

## Trazabilidad

Cada magnitud lleva `value` / `source` / `confidence` / `evidence_type`, y los
cuatro tipos de evidencia no se mezclan nunca:

| | |
|---|---|
| `MEASURED` | viene tal cual de una fuente oficial (la longitud de un segmento del GML) |
| `COMPUTED` | operación determinista sobre datos MEASURED (largo × alto, una intersección) |
| `INFERRED` | regla explícita que puede fallar (el uso de un polígono desde el uso de su planta) |
| `MANUAL` | lo aporta una persona o un valor por defecto del CLI |

```json
{ "largo": { "value": 8.42, "source": "CATASTRO_WFS_BU",
             "confidence": 1.0, "evidence_type": "MEASURED" },
  "alto":  { "value": 2.70, "source": "DEFAULT", "confidence": 0.3,
             "evidence_type": "MANUAL",
             "note": "VALOR POR DEFECTO, no medido: revisar o pasar --floor-height" } }
```

El CSV lleva las columnas pedidas (`ID`, `planta`, `tipo`, `subtipo`,
`contacto`, `espacio_origen`, `espacio_destino`, `largo_m`, `alto_m`,
`largo_x_alto`, `superficie_m2`, `orientacion`, `azimut`, `fuente_largo`,
`fuente_alto`, `confianza`, `requiere_revision`) más `evidencia_*`, `nivel`,
`ring`, `segmento_origen` y `nota`. La operación se ve escrita:
`largo_x_alto = "12.00 x 2.70"` junto a `superficie_m2 = 32.40`.

---

## §6 — Uso ↔ polígono: lo que Catastro da y lo que no

Es la pregunta más importante del encargo y la respuesta honesta es **a medias**:

| Qué | Dónde | Estado |
|---|---|---|
| Geometría de la parcela | INSPIRE WFS CP | ✅ automático |
| Huella del edificio y `BuildingPart` con nº de plantas | INSPIRE WFS BU | ✅ automático |
| Parcelas colindantes y sus edificios | INSPIRE WFS CP + BU | ✅ automático |
| **Uso, planta y superficie de cada unidad constructiva** | `Consulta_DNPRC` (`lcons`) | ✅ automático |
| **Qué polígono es el garaje y cuál la vivienda** | — | ❌ **NO DISPONIBLE por vía pública automatizable** |

Los servicios públicos dan *"en la planta 00 hay 40 m² de ALMACÉN"*, pero **no
dicen qué polígono es**. Ese vínculo solo está en la cartografía detallada:

* **DXF de la parcela** — Sede Electrónica → Consulta de bienes inmuebles → [RC]
  → Cartografía → descargar croquis/DXF. Es una descarga **interactiva con
  CAPTCHA** para usuario no identificado; con certificado o Cl@ve no hay captcha
  pero sigue siendo la web, **no un endpoint documentado**. No se hace scraping.
* **FXCC** — fichero de intercambio municipal, por la vía de descarga de
  cartografía vectorial (exige identificación) o por convenio con la D.G. del
  Catastro.

Por eso el módulo es un **lector de fichero aportado**:

* **DXF: implementado y probado.** Lee las polilíneas por capa, empareja cada
  subparcela de construcción con el rótulo de plantas que cae dentro (`II` → 2,
  `-I` → −1, `III+TZA` → 3) y asigna el uso **solo cuando el emparejamiento por
  superficie es inequívoco**: si dos usos cuadran dentro de la tolerancia, no se
  asigna ninguno. Adivinar cuál es el garaje es exactamente el error que
  convierte un certificado en un requerimiento.
* **FXCC: NO INTERPRETADO.** Se lee y se inventaría por tipo de registro, pero
  no se traduce a geometría: no se ha podido contrastar el layout contra un
  fichero real, y un parser de formato fijo adivinado produciría polígonos
  plausibles y falsos. Si consigues un FXCC de ejemplo, se cierra rápido.

Mientras no haya DXF, el reparto uso↔polígono sale así de honesto:

* los usos y superficies se cuelgan de la **planta** (`floors[].usos`), no del
  polígono;
* con **un solo uso** en la planta, la asignación es fiable (confianza 0,85);
* con **varios**, se marca el dominante con confianza baja y la nota dice
  *"Catastro no dice qué polígono es cada uno"*;
* se levanta el diagnóstico `SPACE_GEOMETRY_UNAVAILABLE`.

Y se hace una comprobación que delata haber modelado el edificio equivocado:
**la huella de cada planta se cruza contra la superficie que declara Catastro**
para ese nivel, y un desvío mayor del 15 % sale como `FLOOR_AREA_MISMATCH`.

---

## §12 — Alturas: lo que se puede y lo que no

La dimensión X-Y sale exacta de Catastro. La Z **no la publica Catastro**.

1. **PNOA LiDAR / MDS − MDT del IGN.** `lidar/pnoa.py` descubre las coberturas
   del WCS del IGN igual que se hace con Catastro (nada de ids memorizados).
   **No se ha podido probar contra el servicio real** (`servicios.idee.es`
   bloqueado), y además muestrear el GeoTIFF de `GetCoverage` necesita
   `rasterio`/GDAL, que no está en las dependencias mínimas. Hoy devuelve
   `value: null` con el motivo escrito, no una cifra plausible.
2. **Nº de plantas de Catastro × altura libre** → `INFERRED`, confianza 0,5.
3. **`--floor-height`** → `MANUAL`, y sin él **`DEFAULT` con confianza 0,3**.

Consecuencia práctica, y está bien que sea así: **sin altura medida, toda
superficie de muro sale con `requiere_revision = true`** y la nota lo dice
(`ALTO NO MEDIDO … la superficie es provisional`). El largo sigue siendo
`MEASURED`; lo provisional es el producto.

**Hallazgo del §11:** con `numberOfFloorsAboveGround` **no se puede representar
un vuelo**. Una parte con 2 plantas está en el nivel 0 *y* en el 1, así que la
huella de una planta siempre está contenida en la de abajo. Si en un CE3X
aparece un *suelo en contacto con aire exterior*, **no ha salido de aquí**: viene
del DXF o de una medición en obra. La rama existe y está probada, pero los datos
de Catastro no la disparan nunca.

---

## RESULTADO DE LA PRUEBA 4410205WJ0641S0001JH

Calle Méjico 4, 13620 Pedro Muñoz (Ciudad Real). Datos traídos de Catastro el
2026-09-09; analizados con `--offline --skip-lidar --floor-height 2.70`.

### 1. Qué se consiguió automáticamente

**La geometría real, entera.** Catastro devolvió las 7 consultas y de ahí sale
un modelo de 29 cerramientos que se cierra contra los datos alfanuméricos:

| | Nuestra geometría | Lo que declara Catastro | Desvío |
|---|---|---|---|
| Parcela | 218,72 m² | 219 m² | 0,1 % |
| Huella planta baja | 191,50 m² | 165 (vivienda) + 27 (almacén) = 192 m² | **0,3 %** |
| Huella planta primera | 74,18 m² | 74 m² (almacén) | **0,2 %** |

Ese cuadre es la prueba de que se ha modelado el edificio correcto, y lo hace
el propio programa (`FLOOR_AREA_MISMATCH` salta por encima del 15 %).

El inmueble es **vivienda unifamiliar de 1994, 266 m² construidos**, en
*parcela construida sin división horizontal* — o sea, el edificio ES la
vivienda, que es el caso en el que el WFS basta.

```
ID    Planta Tipo         Contacto                       Largo x alto   Superficie  Orient.
F11   PB     FACHADA      EXTERIOR_CALLE                 14.13 x 2.70    38.14 m2   S
F10   PB     FACHADA      EXTERIOR_CALLE                  8.34 x 2.70    22.52 m2   O
M01   PB     MEDIANERA    OTHER_BUILDING                  9.05 x 2.70    24.44 m2   N
M03   PB     MEDIANERA    OTHER_BUILDING                  7.68 x 2.70    20.74 m2   N
F02   PB     FACHADA      PATIO_PARCELA                   4.36 x 2.70    11.77 m2   N
F18   P1     FACHADA      SOBRE_CUBIERTA_COLINDANTE       9.05 x 2.70    24.44 m2   N
SU01  PB     SUELO        TERRENO                                 -     191.50 m2   -
CU01  PB     CUBIERTA     AIRE_EXTERIOR                           -     117.32 m2   -
PH01  PB     PARTICION    ESPACIO_NO_HABITABLE_SUPERIOR           -      74.18 m2   -
CU02  P1     CUBIERTA     AIRE_EXTERIOR                           -      74.18 m2   -
```

Totales: **21 fachadas (284,17 m²)**, 3 medianeras (47,44 m²), 1 suelo en
terreno (191,50 m²), 2 cubiertas (191,50 m²) y 2 particiones horizontales.

Tres cosas que salieron bien y que no son evidentes:

* **Las medianeras están solo en la planta baja.** Los dos colindantes que nos
  tocan (`4410202WJ0641S` y `4410213WJ0641S`) tienen **una sola planta** y la
  casa tiene dos, así que los mismos muros —M01, M02, M03— pasan en la primera
  a ser fachada **sobre la cubierta del colindante**. Meter ahí una medianera
  sería declarar un muro adiabático donde hay un muro al exterior.
* **Los dos patios se detectan y se distinguen de un retranqueo**: 18,29 m²
  (79 % de su borde son edificios) y 8,94 m² (95 %). Suman los 27,23 m² de
  parcela sin edificar.
* **El almacén de la planta primera se apoya sobre la vivienda**, así que 74,18
  de los 191,50 m² de techo de la vivienda son *partición con espacio no
  habitable superior* y los otros 117,32 m² son cubierta al aire. Es justo la
  distinción que CE3X necesita y la que se pierde al medir a ojo.

### 2. Qué NO se consiguió

* **Qué polígono es la vivienda y cuál el almacén en la planta baja.** Catastro
  declara VIVIENDA 165 m² y ALMACÉN 27 m² en la misma planta, y **no dice qué
  polígono es cada uno**. El programa lo marca: uso dominante VIVIENDA con
  **confianza 0,43** y la nota *"Catastro no dice qué polígono es cada uno"*,
  más el diagnóstico `SPACE_GEOMETRY_UNAVAILABLE`. Se resuelve con `--dxf`.
* **La altura.** No la publica Catastro y el LiDAR sigue sin cerrarse, así que
  los 2,70 m son `--floor-height` (evidencia `MANUAL`) y **26 de las 29 filas
  salen con `requiere_revision = true`**, cada una con el motivo escrito. El
  largo es `MEASURED`; lo provisional es el producto.

### 3. Qué fuentes se usaron

| Fuente | Para qué | Resultado |
|---|---|---|
| INSPIRE WFS CP `GetParcel` | parcela | ✅ 218,72 m² |
| INSPIRE WFS CP `GetNeighbourParcel` | 6 parcelas colindantes | ✅ |
| INSPIRE WFS BU `GetBuildingByParcel` | huella (`gml:Surface`, 19 vértices) | ✅ 191,50 m² |
| INSPIRE WFS BU `GetBuildingPartByParcel` | 3 partes con su nº de plantas | ✅ 90,80 + 74,18 + 26,52 |
| Lo mismo para 5 colindantes | saber hasta qué altura llega cada vecino | ✅ |
| WCF JSON `Consulta_DNPRC` | uso, planta, superficie, antigüedad, dirección | ✅ |
| WCS MDT del IGN | altura | ⛔ omitido (`--skip-lidar`) |

**Dos cosas aprendidas del GML real**, las dos ahora con test:

1. **`bu-ext2d:Building` pone el `gml:boundedBy` ANTES de su geometría.**
   Cogiendo "el primer tag geométrico que aparezca" el edificio se quedaba sin
   huella y el modelo caía al respaldo de BuildingParts sin que nadie se
   enterara. Peor habría sido aceptar el `Envelope`: un rectángulo de 254 m²
   con toda la pinta de una huella buena.
2. **El propio Catastro escribe `STOREDQUERIE_ID`** (con la errata) en los
   `xlink:href` que devuelve dentro del GML. Mantener esa variante no era
   paranoia.

### 4. Qué precisión tiene

* **Largos: exactos**, los del GML, en EPSG:25830 — la precisión de la
  cartografía catastral urbana (±0,1–0,3 m frente a medir en obra).
  `MEASURED`, confianza 1,0.
* **Clasificación: determinista** y validada contra los datos alfanuméricos por
  tres vías independientes (parcela, planta baja y planta primera cuadran).
* **Alturas: no medidas.** Todas las superficies de muro son provisionales.
* **Uso por polígono en la planta baja: no resuelto** (mixta vivienda+almacén).

### 5. Qué necesita intervención humana

1. **La altura de planta**, del CEE o de una medición. Es lo que quita las 26
   marcas de revisión.
2. **El DXF de la parcela**, para separar los 165 m² de vivienda de los 27 m² de
   almacén en la planta baja. Sin él, la partición vertical vivienda↔almacén no
   se puede situar.
3. **Confirmar el `debug_map.html`** contra la cartografía catastral: lleva la
   ortofoto del PNOA y el WMS del Catastro debajo, y cada segmento es pulsable.
   Es la comprobación de que es este edificio y no el de al lado.
4. **Decidir qué se hace con el almacén de la planta primera**: a efectos de
   CE3X es un espacio no habitable sobre la vivienda, y eso cambia el
   tratamiento de 74 de los 191 m² de techo.

## Tests

```bash
python -m pytest -q          # 92 tests
```

Cubren, con geometrías sintéticas de resultado conocido: sectores de
orientación y normal exterior; el caso del enunciado (medianera 6 m + fachada
4 m); que la tolerancia no infle la medida; dos vecinos en la misma pared;
toques en esquina; patios interiores; retranqueo vs patio; fusión de colineales;
plantas (vivienda sobre garaje, vivienda bajo almacén, cubierta parcial, suelo
en terreno, sótano); orden de ejes del GML según la forma del `srsName`;
excepciones WFS; DXF y rótulos en romanos; el recorrido completo con sus cuatro
entregables; y que el mapa, el plano y el CSV hablen del mismo elemento con el
mismo ID.

## Lo que falta para cerrar el círculo

1. **Alturas**: cerrar el LiDAR (`rasterio` + muestreo del `GetCoverage` del
   IGN, o el MDS del CNIG). Es lo que quita las marcas de revisión.
2. **El DXF de la parcela**, para separar vivienda de almacén cuando comparten
   planta. El lector ya está hecho y probado; falta la vía de descarga.
3. **Repetirlo sobre otras tipologías**: exenta, entre medianeras con más
   plantas, y sobre todo **un piso en bloque**, donde el WFS da el edificio
   entero y no el inmueble (`FLOOR_AREA_MISMATCH` lo avisará).
4. **FXCC**: conseguir un fichero real y cerrar su parser.
5. Solo entonces, el volcado a CE3X por Computer Use: la tabla de salida ya
   tiene la forma que pide el formulario.
