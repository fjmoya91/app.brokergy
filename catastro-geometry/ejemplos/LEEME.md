# Ejemplos

Cada carpeta es un caso REAL con todo lo que hizo falta para resolverlo: lo que
devolvió Catastro tal cual, la salida que produjo el programa, y un LEEME que
dice **qué enseña ese caso** y qué se aprendió arreglándolo.

No son adornos: son el banco de pruebas. Cuando algo se rompa, lo primero es
volver a pasar todos los ejemplos y ver cuál cambia.

```powershell
# volver a analizar un ejemplo SIN pedirle nada a Catastro
python -m src.main 4410205WJ0641S0001JH --offline --skip-lidar `
  --cache ejemplos\4410205WJ0641S-pedro-munoz\cache `
  --output ejemplos\4410205WJ0641S-pedro-munoz\salida `
  --floor-height 2.70
```

## Qué hay en cada ejemplo

| Carpeta | Qué es |
|---|---|
| `catastro/` | las respuestas CRUDAS de Catastro (GML, JSON) y los GeoJSON derivados. Se pueden abrir con QGIS |
| `cache/` | lo mismo, con el nombre que espera el cliente HTTP: es lo que permite ejecutar con `--offline` |
| `salida/` | `ce3x_geometry.csv`, `.json`, `geometry_debug.png` y `debug_map.html` |
| `dxf/` | el DXF de la parcela, cuando lo haya. Ver `dxf/LEEME.md` |

## Los casos

| Caso | Tipología | Qué enseña |
|---|---|---|
| `4410205WJ0641S-pedro-munoz` | unifamiliar entre medianeras, 2 plantas | medianeras solo en planta baja, dos patios, almacén sobre vivienda |
| `_sintetico` | inventado | geometría de resultado conocido para los tests. **No es ningún inmueble real** |

## Añadir un caso nuevo

```powershell
# 1. traer los datos (necesita salida a ovc.catastro.meh.es)
python -m src.main <RC> --only-fetch --pausa 1.5 --cache ejemplos\<nombre>\cache

# 2. analizarlo
python -m src.main <RC> --offline --cache ejemplos\<nombre>\cache --output ejemplos\<nombre>\salida

# 3. escribir el LEEME.md diciendo QUE ENSEÑA el caso
```

**Regla**: un ejemplo sin `LEEME.md` que explique qué enseña es un ejemplo que
nadie va a volver a mirar.
