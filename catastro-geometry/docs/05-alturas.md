# Alturas

**La dimensión X-Y sale exacta de Catastro. La Z no la publica Catastro.**

Es la limitación que más se nota en la salida: sin altura medida, toda superficie
de muro es provisional, y por eso salen marcadas `requiere_revision = true` con
el motivo escrito.

## Las tres vías, de más a menos fiable

| Vía | Evidencia | Estado |
|---|---|---|
| PNOA LiDAR: **MDS − MDT** del IGN | derivado de medición | **sin cerrar** |
| nº de plantas de Catastro × altura libre | `INFERRED`, confianza 0,5 | funciona |
| `--floor-height` | `MANUAL`, confianza 0,5 | funciona |
| sin nada | `DEFAULT` 2,70 m, confianza **0,3** | funciona, y grita |

## Por qué el LiDAR no está cerrado

`src/lidar/pnoa.py` descubre las coberturas del WCS del IGN igual que se hace con
Catastro (nada de ids memorizados), pero faltan dos cosas:

1. **No se ha podido probar contra el servicio real** — el entorno de desarrollo
   bloquea `servicios.idee.es`.
2. **Muestrear el GeoTIFF que devuelve `GetCoverage` necesita `rasterio`/GDAL**,
   que no está en las dependencias mínimas.

Hoy devuelve `value: null` con el motivo escrito. **No devuelve una cifra
plausible**, que es lo que haría el daño.

## Lo que haría falta

```
altura del edificio  =  percentil 90 de (MDS − MDT) sobre la huella
altura de planta     =  altura del edificio / nº de plantas de Catastro
```

El percentil 90 en vez del máximo evita que una antena o una chimenea marquen la
altura; y en vez de la media, que el borde del tejado la baje.

Aun con LiDAR, **la altura libre interior no es la altura del edificio**: hay que
descontar forjados y cubierta. El LiDAR da el volumen exterior; para CE3X hace
falta la altura libre. Por eso el resultado del LiDAR se marcará `COMPUTED` con
confianza rebajada, nunca `MEASURED`.

## Lo práctico, mientras tanto

En un expediente real la altura de planta está en el CEE, en el proyecto o se
mide en la visita. `--floor-height 2.70` es un valor de arranque, no un dato:

```powershell
python -m src.main <RC> --offline --floor-height 2.65
```

Y sale marcado como `MANUAL` en el CSV, en la columna `fuente_alto`, para que
nadie confunda un dato tecleado con uno medido.
