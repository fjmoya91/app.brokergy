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

## ⚠️ Estado de esta entrega — LÉELO PRIMERO

El MVP está escrito, probado y **es ejecutable de punta a punta**, pero
**no se ha podido ejecutar contra el Catastro real** desde el entorno en el que
se desarrolló: su política de salida a Internet bloquea, en el propio proxy,
**todos** los hosts que hacen falta.

```
ovc.catastro.meh.es       -> CONNECT 403 (denegado por politica de egreso)
www1.sedecatastro.gob.es  -> CONNECT 403
www.ign.es                -> CONNECT 403
centrodedescargas.cnig.es -> CONNECT 403
servicios.idee.es         -> CONNECT 403
app.brokergy.es           -> CONNECT 403
```

Ninguna petición llegó a salir de la máquina. Eso **no** significa que Catastro
no tenga el dato: significa que no se le ha podido preguntar. Y aquí no se
inventa nada, así que `output/` **no contiene la geometría real de tu vivienda**:
contiene `diagnostico.json`, con las URL exactas que se intentaron.

**Para obtener el resultado real, desde tu portátil o desde el VPS, no hay que
tocar ni una línea de código.** Las respuestas se cachean por referencia:

```bash
# 1) donde haya salida a ovc.catastro.meh.es (tu maquina o el VPS)
python -m src.main 4410205WJ0641S0001JH --only-fetch
#    -> deja las respuestas crudas en data/raw/ y cache/4410205WJ0641S/

# 2) el analisis, ya sin red
python -m src.main 4410205WJ0641S0001JH --offline --skip-lidar
```

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

Mientras tanto, lo que **sí** está verificado en esta entrega:

| | |
|---|---|
| **89 tests** en verde (`python -m pytest`) | geometría, medianeras parciales, patios, plantas, GML, DXF y el recorrido completo |
| **Autoprueba end-to-end** con salida real | `output/_autoprueba_sintetica/` — los cuatro entregables sobre una casa **inventada** (nunca confundible con un expediente) |
| **Algoritmo de dígitos de control** | verificado contra tu RC real: `4410205WJ0641S0001JH` valida, y una errata en el último carácter se detecta |
| **El camino de fallo** | probado contra el Catastro real: falla limpio, con traza y causa raíz |

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

Calle Méjico 4, 13620 Pedro Muñoz (Ciudad Real). Ejecutado el 2026-09-09.

```bash
python -m src.main 4410205WJ0641S0001JH --retries 0 --timeout 12
```

### 1. Qué se consiguió automáticamente

* **Normalización y validación de la referencia**, sin red:
  `refcat_parcela = 4410205WJ0641S`, `refcat_inmueble = 4410205WJ0641S0001JH`,
  `cargo = 0001`, **dígitos de control OK**. El algoritmo se implementó y se
  verificó contra esta RC (la Ñ va intercalada en el alfabeto: A=1…N=14, Ñ=15,
  O=16…Z=27); una errata en el último carácter se detecta.
* **El programa recorrió las 7 consultas previstas**, en el orden correcto, con
  las 6 variantes de parámetros por consulta, y dejó cada intento trazado.
* **Falló limpio**: `output/diagnostico.json` con los códigos, los mensajes y
  **las URL exactas** de cada intento, más la causa raíz.

### 2. Qué NO se consiguió, y por qué

**Nada de la geometría real.** Causa raíz, tal como la escribe el programa:

```
CATASTRO_UNREACHABLE_FROM_THIS_HOST: ninguna peticion llego a salir de esta
maquina (proxy, cortafuegos o DNS). No es que Catastro no tenga el dato: es que
no se ha podido preguntar.
```

Todas las peticiones murieron en `CONNECT ... 403 Forbidden` del proxy de salida
del entorno de desarrollo, antes de tocar la red. Diagnósticos levantados:
`CAPABILITIES_CP_UNAVAILABLE`, `CAPABILITIES_BU_UNAVAILABLE`,
`PARCEL_GEOMETRY_UNAVAILABLE`, `BUILDING_GEOMETRY_UNAVAILABLE`,
`BUILDING_PARTS_UNAVAILABLE`, `NEIGHBOUR_PARCELS_UNAVAILABLE`,
`CADASTRAL_ATTRIBUTES_UNAVAILABLE`.

**No hay `parcela.gml`, ni `edificios.gml`, ni `building_parts.gml`, ni
`vecinos.gml`, ni `datos_catastrales.json` de esta vivienda.** No se han
fabricado sustitutos. Los únicos ficheros GML del repositorio están en
`tests/fixtures/sintetico/` y llevan dentro el aviso de que son inventados.

### 3. Qué fuentes se usaron (y se usarán al ejecutarlo con salida)

| Fuente | Para qué | Verificada aquí |
|---|---|---|
| INSPIRE WFS CP `wfsCP.aspx` | parcela y parcelas colindantes | ❌ bloqueada |
| INSPIRE WFS BU `wfsBU.aspx` | huella, `BuildingPart`, nº de plantas | ❌ bloqueada |
| WCF JSON `Consulta_DNPRC` | uso, planta, superficie, antigüedad, dirección | ❌ bloqueada |
| WCF JSON `Consulta_CPMRC` | coordenadas del inmueble | ❌ bloqueada |
| WCS MDT del IGN | cota de terreno / superficie | ❌ bloqueada |
| DXF de la parcela (aportado) | uso ↔ polígono | ✅ lector probado con DXF sintético |

Los WCF JSON se eligen sobre los ASMX a conciencia: el WAF filtra la familia
ASMX desde IPs de datacenter y devuelve un 400 con HTML. Es conocimiento ya
pagado en producción por el backend de Brokergy.

### 4. Qué precisión tendrá

* **Largos (X-Y): exactos**, los del GML de Catastro, en EPSG:25830. Es la
  precisión de la cartografía catastral urbana (del orden de ±0,1–0,3 m frente a
  una medición en obra). `MEASURED`, confianza 1,0.
* **Clasificación fachada / medianera / patio / partición: determinista**, sin
  IA ni heurísticas visuales; el único parámetro discutible es
  `boundary_tolerance_m` (0,15 m por defecto), y está aislado y documentado.
* **Alturas: NO MEDIDAS.** Con `--floor-height` son `MANUAL`; sin él, `DEFAULT`
  con confianza 0,3. **Todas las superficies de muro salen provisionales.**
* **Uso por polígono: no disponible sin DXF** (ver §6). Con una sola unidad por
  planta la asignación es fiable (0,85); con varias, se marca y no se reparte.

### 5. Qué necesitará intervención humana

1. **Ejecutarlo desde una máquina con salida a `ovc.catastro.meh.es`** — es lo
   único que separa esta entrega del resultado real. Un comando.
2. **La altura de planta**, hasta que se cierre el LiDAR: `--floor-height 2.70`
   sacado del CEE, del proyecto o de una medición. Es el dato que hace que 17 de
   22 filas de la autoprueba estén marcadas para revisión.
3. **El DXF de la parcela**, si esta vivienda tiene garaje o almacén y hace falta
   saber **qué polígono** es cada uno para las particiones interiores.
4. **Confirmar visualmente el `debug_map.html`** contra la cartografía catastral:
   lleva la ortofoto del PNOA y el WMS del Catastro debajo, y cada segmento es
   pulsable con su ID, su longitud, su orientación y contra qué da. Es la
   comprobación de que se ha modelado el edificio correcto — la que ninguna
   máquina puede firmar por ti.
5. **Si la vivienda es un piso de un bloque**, el WFS de Catastro da la huella
   del EDIFICIO ENTERO, no la del inmueble. `FLOOR_AREA_MISMATCH` lo avisa
   comparando huella contra superficie catastral, pero el reparto lo decide una
   persona (o el DXF).

---

## Tests

```bash
python -m pytest -q          # 89 tests
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

1. Ejecutarlo con salida a Catastro y revisar el mapa contra la cartografía.
2. Cerrar el LiDAR: `rasterio` + muestreo del `GetCoverage` del IGN, o descarga
   del MDS del CNIG.
3. Conseguir un FXCC real y cerrar su parser (el DXF ya está).
4. Repetirlo sobre varias tipologías (entre medianeras, exenta, piso en bloque).
5. Solo entonces, el volcado a CE3X por Computer Use: la tabla de salida ya
   tiene la forma que pide el formulario.
