# Fuentes de Catastro

## Las dos familias, y por qué se usan las dos

| | Qué da | Qué NO da |
|---|---|---|
| **INSPIRE WFS** (`/INSPIRE/wfsCP.aspx`, `wfsBU.aspx`) | **geometría**: parcela, huella del edificio, partes con su nº de plantas, parcelas colindantes | uso, superficie por unidad, antigüedad |
| **WCF JSON** (`/OVCServWeb/OVCWcfCallejero/...`) | **datos alfanuméricos**: uso, planta, superficie y antigüedad de cada unidad constructiva, dirección | ni un polígono |

La app de Brokergy (`catastroService.js`) usa solo la segunda. Este proyecto usa
las dos: sin la primera no hay geometría, y sin la segunda no se sabe qué es
vivienda y qué almacén.

## WFS — los identificadores REALES

Leídos del propio servicio con `DescribeStoredQueries` el 2026-09-09. **No se
memorizan: el programa los vuelve a preguntar** (`src/catastro/inspire.py`), y
la lista de abajo es solo el respaldo documentado.

### Cadastral Parcels — `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx`

| Stored query | Parámetros | Devuelve |
|---|---|---|
| `GetParcel` | `REFCAT`, `SRSNAME` | `cp:CadastralParcel` — la parcela |
| `GetNeighbourParcel` | `REFCAT`, `SRSNAME` | las parcelas **colindantes** |
| `GetFeatureById` | `ID`, `SRSNAME` | una parcela por su id INSPIRE |
| `GetZoning` / `GetParcelByZoning` | `COD_ZONA`, `SRSNAME` | zona catastral y sus parcelas |

### Buildings — `https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx`

| Stored query | Parámetros | Devuelve |
|---|---|---|
| `GetBuildingByParcel` | `REFCAT`, `SRSNAME` | `bu:Building` — la huella del edificio |
| `GetBuildingPartByParcel` | `REFCAT`, `SRSNAME` | `bu:BuildingPart` — **con `numberOfFloorsAboveGround`** |
| `GetOtherBuildingByParcel` | `REFCAT`, `SRSNAME` | `bu:OtherConstruction` — porches, terrazas, piscinas, cobertizos |
| `GetAllConstructionByParcel` | `REFCAT`, `SRSNAME` | las tres cosas de una vez |
| `GetFeatureById` | `ID`, `SRSNAME` | por id |

Feature types del servicio: `bu:Building`, `bu:BuildingPart`,
`bu:OtherConstruction`. CRS admitidos: 25830, 25829, 25831, 4258, 4326, 3785…

**`GetAllConstructionByParcel` devuelve en UNA petición lo que hoy se pide en
tres.** Es la vía para bajar el gasto de peticiones, sobre todo con los
colindantes (2 por vecino → 1).

**`OtherConstruction` todavía no se pide, y en una unifamiliar importa**: un
porche o un cobertizo adosado cambia la envolvente. Ver `docs/09-limitaciones.md`.

### Rarezas comprobadas

* Los parámetros están declarados en MAYÚSCULAS (`REFCAT`, `SRSNAME`) pero el
  servicio los acepta en minúscula.
* El propio Catastro escribe **`STOREDQUERIE_ID`** (con la errata) en los
  `xlink:href` que devuelve dentro del GML. Se prueban las dos formas.
* El SRS se acepta como `EPSG::25830` y como `urn:ogc:def:crs:EPSG::25830`.
* **`bu-ext2d:Building` pone el `gml:boundedBy` ANTES de su geometría.** Ver
  `docs/02`.

## WCF JSON — datos alfanuméricos

```
Consulta_DNPRC   RC (14 o 20) → uso, planta, superficie y antigüedad
Consulta_CPMRC   RC14         → coordenadas del inmueble
Consulta_RCCOOR  coordenadas  → RC
```

Base: `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json`
y `.../COVCCoordenadas.svc/json`.

De `Consulta_DNPRC` sale `bico.lcons[]`, que es la lista de construcciones:

```json
{ "lcd": "VIVIENDA",
  "dt": { "lourb": { "loint": { "es": "1", "pt": "00", "pu": "01" } } },
  "dfcons": { "stl": "165" } }
```

`lcd` = uso · `pt` = planta · `stl` = superficie. **En los WCF JSON `lcons` es un
array directo**; en los ASMX era `lcons.cons[]`.

`bico.finca.ltp` dice el tipo de finca. *"Parcela construida sin división
horizontal"* significa que el edificio ES el inmueble — el caso en que el WFS
basta. En un bloque con división horizontal, el WFS da el edificio entero.

## Las reglas del WAF, que no se rompen

Están medidas en producción (ver `catastroService.js` del backend). Detrás hay
**el mismo WAF del que depende el buscador de la app**.

1. **Orden exacto de cabeceras**: `User-Agent`, `Accept`, `Accept-Encoding:
   identity`. Por eso el cliente habla `http.client` pelado y **no** `requests`,
   que impone su propio orden.
2. **User-Agent identificable y genérico**. Los UA de Chrome completo, `curl/*` o
   `PostmanRuntime/*` están bloqueados; `Mozilla/5.0 (compatible; Brokergy/1.0)`
   pasa.
3. **IPv4 forzado.** Happy Eyeballs sobre IPv6 dispara el WAF.
4. **Nada de ráfagas.** Peticiones en serie con pausa (`--pausa`, 0,8 s por
   defecto, 1,5-2 s cuando se baja un caso nuevo).
5. **Al primer 403 o "no se puede procesar", se PARA.** No se reintenta. Suele
   liberarse solo en 30-60 min.
6. **Los ASMX no se usan**: el WAF filtra esa familia desde IPs de datacenter y
   devuelve 400 con HTML.

### Presupuesto de peticiones

Preguntar cómo se llaman las cosas sale más barato que adivinarlas. Por eso hay
una fase de **reconocimiento de 6 peticiones** (`tools/reconocer.py`) que se hace
ANTES de pedir ningún dato, y con el descubrimiento hecho **cada consulta es una
sola petición**. El peor caso está acotado en 8 por servicio.

Un caso nuevo completo cuesta hoy **~20 peticiones** (4 de descubrimiento + 4 de
la parcela + 2 por colindante + 1 alfanumérica).
