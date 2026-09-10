# CLAUDE.md — Proyecto CEE / geometría catastral

Se carga solo en cada conversación. **Léelo antes de tocar nada.**

## Qué es esto

De una **referencia catastral** a la **envolvente medida y clasificada** de un
edificio, lista para teclear en **CE3X** (a mano o con Computer Use).

```
RC  →  Catastro  →  geometría  →  clasificación  →  tabla CE3X
```

No calcula transmitancias ni nada térmico: eso ya se resuelve aparte. Calcula
**qué cerramiento es cada cosa, contra qué da, cuánto mide y hacia dónde mira**.

Estado: **funciona sobre viviendas unifamiliares**. Ver `docs/09-limitaciones.md`.

## Arranque rápido

```powershell
pip install -r requirements.txt

# analizar un ejemplo ya descargado, sin tocar Catastro
python -m src.main 4410205WJ0641S0001JH --offline --skip-lidar `
  --cache ejemplos\4410205WJ0641S-pedro-munoz\cache --floor-height 2.70

python -m pytest -q          # 92 tests
```

## Las tres reglas de fondo

1. **Lo que no se sabe, se dice.** Nunca se rellena un hueco con un valor
   plausible: `value: null` y el motivo escrito. Esto acaba en un certificado
   que firma alguien.
2. **La IA no mide.** Distancias, ángulos, intersecciones y adyacencias salen de
   operaciones geométricas deterministas. Ningún modelo decide una longitud.
3. **Cada número sabe de dónde viene.** `MEASURED` / `COMPUTED` / `INFERRED` /
   `MANUAL` no se mezclan.

## Reglas que no se rompen

### Catastro
* **NUNCA ráfagas.** Peticiones en serie con pausa (`--pausa`). Al otro lado está
  el MISMO WAF del que depende el buscador de app.brokergy en producción.
* **Al primer 403 o "no se puede procesar", se PARA.** No se reintenta.
* **Orden de cabeceras exacto** (`User-Agent`, `Accept`, `Accept-Encoding:
  identity`), UA identificable y genérico, IPv4 forzado. Por eso el cliente habla
  `http.client` pelado y **no `requests`**, que impone su propio orden.
* **Los ids de stored query se LEEN del servicio** (`DescribeStoredQueries`), no
  se memorizan. Preguntar cuesta 6 peticiones; adivinar cuesta decenas.
* **Nada de ASMX**: el WAF los filtra desde IPs de datacenter.
* Antes de traer un caso nuevo, mira si ya está en `ejemplos/` y usa `--offline`.

### Geometría
* **La orientación es la de la NORMAL EXTERIOR**, no la de la línea. Anillo
  exterior CCW, huecos CW, normal `(dy, −dx)` siempre. Ver `docs/02`.
* **La tolerancia DETECTA el contacto; no lo MIDE.** Midiendo sobre el vecino
  dilatado, una medianera de 6,00 m salía 6,15.
* **Cada trozo se sondea por su cuenta**, no el punto medio del segmento entero.
* **Nunca metros sobre lat/lon.** Todo en EPSG:25830.
* **El `Envelope` de `gml:boundedBy` NO es geometría jamás**: sería un rectángulo
  inventado con pinta de huella buena.
* **Un patio lo es del EDIFICIO, no de la planta.**
* **La vecindad se resuelve POR PLANTA**: un muro no es medianera porque el
  vecino tenga planta baja, sino si el vecino llega a esa altura.

### Salida
* **El plano, el mapa y el CSV rotulan con el MISMO ID** (`F01`, `M01`). Si no,
  no se pueden cruzar, que es para lo único que existen el plano y el mapa.
* **La superficie de muro es BRUTA** (`largo × alto`), sin descontar huecos: las
  ventanas no están en Catastro.
* **La operación se escribe**: `largo_x_alto = "9.05 x 2.70"` junto a
  `superficie_m2 = 24.44`.

## Cómo está montado

```
src/catastro/    refcat · client (HTTP anti-WAF) · inspire (WFS) · alphanumeric (WCF) · fxcc (DXF)
src/gis/         geometry (GML+CRS) · segments (normal exterior) · orientation ·
                 adjacency (medianeras, patios) · floors (plantas, particiones)
src/lidar/       pnoa (alturas — SIN CERRAR)
src/ce3x/        schema · classifier · export
src/viz/         plan_png (un panel por planta) · map_html (capas por planta)
src/             model · pipeline · main (CLI)
docs/            el conocimiento: por qué y cómo se calcula cada cosa
ejemplos/        casos reales con sus datos crudos y su salida. Es el banco de pruebas
tools/           reconocer.py (6 peticiones) · make_fixture.py
```

## Antes de dar algo por bueno

1. `python -m pytest -q` — 92 tests.
2. **Mirar `geometry_debug.png`.** El plano existe para eso. Los tres fallos más
   caros del proyecto se vieron mirando el dibujo, no leyendo el CSV.
3. **Cruzar la huella contra la superficie catastral** — lo hace el programa
   (`FLOOR_AREA_MISMATCH`), y es lo que delata haber modelado el edificio
   equivocado.
4. Volver a pasar **todos los ejemplos** y ver cuál cambia.

## Documentación

Empieza por [`docs/00-mapa.md`](docs/00-mapa.md).
