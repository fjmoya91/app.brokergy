<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)»; la introducción y el resto, en esta misma carpeta.

### El CROQUIS a mano alzada — se dice DÓNDE, los m² los pone Catastro (2026-09-29)

Cuando Catastro mete vivienda, garaje y porche en el MISMO cuerpo, no dice dónde está cada uno — y
dibujar el garaje vértice a vértice, acertando con sus 122 m², era lo más lento de todo. Ahora se
pinta a mano alzada (o la skill lo escribe en fracciones de la huella) y el motor hace el resto.

| Qué | Dónde |
|---|---|
| Enderezar, ajustar a los m², alinear escalones | [gis/croquis.py](implementation/cee-engine/src/gis/croquis.py) — `ajustar_nivel`, `regularizar`, `ajustar`, `alinear_escalones`, `marco` |
| Los m² de Catastro por uso y planta, y la conversión a zonas | `_objetivos_catastro` · `ajustar_croquis` en [pipeline.py](implementation/cee-engine/src/pipeline.py) |
| API | `POST /envolvente` con `croquis` (+ `croquis_ajustar`) → `croquis_ajustado` en la respuesta |
| Backend | `croquisSaneado` en [routes/ceeEnvolvente.js](implementation/backend/routes/ceeEnvolvente.js) |
| Ventana | «✏️ Croquis» en `PanelZonas` (uso con su color · ↶ · **✓ Ajustar a Catastro** · Tal cual) + capa `Croquis` en `PlanoPlanta` |
| Skill | `croquis` en el plan de `aplicar` (`uv` o `poligono`) + `plano_plan.png` para revisarlo |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_croquis.py` |

**REGLA — el croquis dice DÓNDE; CUÁNTO lo dice Catastro.** Cada mancha se endereza (bordes
paralelos a las paredes del edificio), se recorta a la huella y se CRECE o ENCOGE con un buffer a
inglete, por bisección, hasta los m² que Catastro declara para ESE uso en ESA planta (escalados a la
huella: la suma de las unidades no siempre casa con el polígono — 197 frente a 195,36 en OP246). Lo
que no se pinta es vivienda. Medido en 26RES060_OP246 con un croquis aproximado («garaje = franja
norte», «porche = mancha trasera»): garaje en L de 121 m² que envuelve el porche (35,7) y vivienda
en la franja sur (38,6), lo mismo que se había hecho a mano.

**REGLA — un uso que Catastro NO declara en esa planta se deja como se dibujó, y SE DICE**
(`de: 'dibujado tal cual'`). «Tal cual» (`croquis_ajustar: false`) hace lo mismo a propósito, para
cuando Catastro está desfasado.

**REGLA — lo que dejan dos ajustes independientes se limpia.** Una tira de menos de 0,8 m (`_sin_tiras`,
dentro de la bisección) haría de toda una pared una partición con el garaje; un escalón de menos de
0,6 m entre dos zonas (`alinear_escalones`) es un trozo de muro que no existe. Se alinean
compensando el área, así que las superficies siguen siendo las de Catastro.

**REGLA — el croquis SUSTITUYE las zonas de SUS plantas**, y lo que se guarda son ZONAS
(`zonas_fuera`, en el mundo, regla 79): las manchas no se guardan. Las de otras plantas se conservan.
En la ventana, ajustar es UNA petición: se ajusta y se mide a la vez.

**REGLA — en fracciones, `u` va de OESTE a ESTE y `v` de SUR a NORTE** (`marco`, sobre el rectángulo
mínimo de la huella). Es lo que permite a la skill escribir «el garaje es la mitad norte» sin
coordenadas, y pasarse por fuera de las paredes (`-0.05`, `1.05`) no cuenta.

⚠️ Un trazo a mano alzada deja un punto cada pocos centímetros (rodear una casa de 14 × 14 m son
cientos de vértices) y `recorteSaneado` rechazaba más de 100: el croquis se descartaba sin decirlo.
Ahora cada trazo se SIMPLIFICA al soltarlo (`simplificarTrazo`, Ramer-Douglas-Peucker a 8 cm, en
`geometriaPlano.js`) y `croquisSaneado` admite hasta 400.
