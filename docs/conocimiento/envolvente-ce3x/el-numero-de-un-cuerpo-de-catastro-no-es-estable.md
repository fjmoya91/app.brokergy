<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## El número de un CUERPO de Catastro («_part3») no es estable: se guarda por DÓNDE está (2026-10-20)

**Caso: 26RES060_226** (9302601VJ7190S). El trabajo de la envolvente se guardó el 09/10/2026 con
`cuerpos_fuera: ["ES.SDGC.BU.9302601VJ7190S_part3"]`: el aparcamiento de 7 m² adosado. Ese día el
borrador salió bien (25 huecos en las fachadas de la casa). El 20/10, al rehacerlo,
`cee_inicial.js paredes` decía que `_part3` era **la CASA** (166,47 m², plantas 0 y 1): la quitaba
entera, todas las paredes de la planta 1 salían como partición y la planta baja medía **59 m² frente a
los 185** que declara Catastro. Solo 8 de los 25 huecos guardados caían en una fachada.

### La causa, medida

El número lo pone **Catastro**, no el motor: es el `gml:id` / `localId` del BuildingPart que sirve el
WFS de INSPIRE (`GetBuildingPartByParcel`), y lo reparte **en el orden en que salen las partes esa
vez**. La misma parcela, el mismo día, sin un solo cambio (`beginLifespanVersion` 2019-04-25 en las
tres partes):

| lectura | `_part1` | `_part2` | `_part3` |
|---|---|---|---|
| 20/10 10:54 (caché del motor local) | 7,10 m² (aparcamiento) | 65,50 m² | **166,47 m² (casa)** |
| 20/10 11:03 (tres lecturas seguidas, idénticas) | 65,50 m² | 166,47 m² | **7,10 m² (aparcamiento)** |

Las dos respuestas están en `implementation/cee-engine/tests/fixtures/numeracion_partes/`. El motor
lee Catastro **una vez por parcela y lo cachea** (`CEE_CACHE_DIR`, en el VPS el volumen
`brokergy_cee_cache`), así que cada máquina se queda con la numeración de SU primera lectura: el
trabajo se guardó con la de una, y el 20/10 el PC no tenía la parcela en caché (se bajó a las 10:54) y
le tocó otra. Lo mismo pasa al borrar la caché, con `refresh`, o al medir en otra máquina.

**Las PAREDES no se ven afectadas**: midiendo con el mismo cuerpo físico fuera, las dos numeraciones
dan las mismas 49 paredes con los mismos nombres (la huella de cada planta es la unión de las partes,
que no depende del orden). Lo único que dependía del número era `cuerpos_fuera`.

### REGLA — un cuerpo se nombra por DÓNDE está, no por su número

`floors.clave_de` da a cada BuildingPart una **clave**: `ES.SDGC.BU.<RC14>@<x>,<y>`, el centroide de
su huella de Catastro al decímetro en el CRS métrico del modelo (EPSG:25830 en la península). Es el
`id` de cada cuerpo hacia fuera (`cuerpos._codigo`: inventario, `muro_cuerpo`, lo que se pulsa en el
plano, lo que se guarda). Se fija al crear la parte (`ParteEdificio.clave`), así que un recorte de
adosado (`replace(p, geometry=…)`) no la mueve. Lo que no lleva número de parte (`PROYECTO_n`) se
queda con su id. El número de hoy viaja aparte, solo para rastrear (`cuerpos[].catastro_id`).

Al pedir la geometría, lo guardado se **traduce** a los cuerpos de hoy (`cuerpos.resolver`) y vuelve
en la respuesta: `cuerpos_fuera` (las claves de hoy) y `cuerpos_traduccion` (`{pedido, clave, como}`):

| `como` | qué es |
|---|---|
| `igual` | la misma clave |
| `movido` | una clave a menos de 1 m (`CERCA_CLAVE_M`): un retoque de la cartografía |
| `dudoso` | dos cuerpos a menos de 1 m: no se quita ninguno, y se dice |
| `por_numero` | un id ANTIGUO «_partN», casado por el número de HOY |
| `no_esta` | no casa con nada: se dice (`CUERPOS_EXCLUIDOS`), como antes |

La ventana (`cuerposDeHoy` en [trabajoGuardado.js](implementation/frontend/src/features/cee-envolvente/logic/trabajoGuardado.js))
y `cee_inicial.js aplicar` guardan ya la clave; lo que el motor no casa se queda como estaba (borrarlo
en silencio devolvería el cuerpo a la envolvente sin que nadie lo decidiera).

### REGLA — un id ANTIGUO se sigue aceptando, pero se DICE

Los trabajos guardados antes del 20/10/2026 solo tienen el número, y casi siempre la caché que los midió
sigue sirviendo la misma numeración: negarse a usarlo les devolvería a todos el aparcamiento. Pero no se
da por bueno en silencio: `cuerpos.sospechas` mira los casados `por_numero` y avisa
(`CUERPO_FUERA_DUDOSO`, en el diagnóstico de la ventana y en `cee_inicial.js paredes`) si:

- el cuerpo que se quita es **VIVIENDA** según Catastro, o
- hay **zonas dibujadas DENTRO** de él en una planta donde está fuera (nadie dibuja el garaje dentro de
  lo que ya ha quitado).

En el 226 saltan las dos. ⚠️ Al abrir un trabajo antiguo, la ventana guarda la clave **de la
numeración de ESE momento**: si era la equivocada, la deja fija. Por eso los trabajos antiguos se
corrigen con el barrido ANTES de desplegar esto.

### El barrido

`node implementation/backend/scripts/barrido_cuerpos_fuera.js --motor=<motor con este código> --vps --ahora`
(en seco; `--escribir` solo con el «sí»). Por cada trabajo con un «_partN» guardado (expedientes,
oportunidades y CEE directos) mira qué cuerpo es ese número en la caché local, en la del VPS (ssh, solo
lectura) y en una lectura nueva (una petición por parcela, en serie). Si alguna lectura es sospechosa,
prueba las demás partes de la parcela. Mide cada candidato con el motor (con la clave, que no depende de
la numeración) y elige el que no quita vivienda, no tiene zonas dentro y deja más huecos guardados en
fachadas. Con `--escribir` cambia solo `cuerpos_fuera`, y solo si nadie ha tocado el trabajo desde que
se leyó. El número de cada parte en una lectura: `python -m tools.numeracion_partes leer <gml>`.

**Medido el 20/10/2026** (en seco): 47 trabajos con un «_partN» guardado (29 expedientes, 14
oportunidades, 4 CEE directos; la oportunidad y su expediente cuentan dos veces). En **40** todas las
lecturas dan el mismo cuerpo, y en **1** también aunque el motor no la mide (26RES080_OP60, ya
aceptada). En **6 la numeración CAMBIA entre lecturas**: 26RES060_226 y su oportunidad
26RES060_OP256, 26RES060_233, 26RES060_194, 26RES080_86 y 26RES060_OP304. En los seis, una de las
lecturas quita otro cuerpo: la casa, una vivienda de 189 m² o una nave de 208 m² en lugar del porche o
el aparcamiento. Quitar una VIVIENDA no prueba nada por sí solo: en 26RES060_224, 26RES080_82 y
26RES060_190 se hizo a propósito y la lectura de cuando se guardó lo confirma, con todos los huecos en
fachada.

Qué habría que hacer en cada uno (cambiar SOLO `cuerpos_fuera` a la clave; nada escrito aún):

| trabajo | guardado con | el cuerpo de verdad (lectura de cuando se guardó) | lo que quita la otra lectura | clave(s) |
|---|---|---|---|---|
| 26RES060_226 | `_part3` (09/10) → `_part1` (20/10) | APARCAMIENTO 7,10 m² · 28/28 huecos en fachada | la casa de 166 m², o una vivienda de 65,5 | `…9302601VJ7190S@479243.7,4309945.4` — **corregido a mano en la sesión del CEE (20/10)** |
| 26RES060_OP256 (aceptada → 226) | `_part3` | APARCAMIENTO 7,10 m² · 5/5 | la casa de 166 m² | la misma; no se puede escribir (409): su trabajo vive en el 226 |
| 26RES060_233 | `_part3` | PORCHE 4,26 m² (caché local) · 9/9 | INDUSTRIAL 208 m² (7/9) | `…8214305VJ9581S@498176.5,4351176.9` |
| 26RES060_194 | `_part3`, `_part1` | ALMACÉN 235 m² + APARCAMIENTO/ALMACÉN 37 m² (VPS y local) · 13/13 | ALMACÉN 173 m² en lugar del de 235 | `…4254008WH0745S@504128.7,4275199.9`, `…@504108.4,4275207.1` |
| 26RES080_86 | `_part3`, `_part1` | ALMACÉN 99,2 + ALMACÉN 8,4 m² (VPS) · 11/11 | una VIVIENDA de 12,5 m² (8/11) | `…2156802WK1225N@511997.8,4425679.3`, `…@512007.8,4425671.1` |
| 26RES060_OP304 | `_part2` | SOPORTAL 23,6 m² (caché local) · 6/6 | VIVIENDA 189 m² (5/6) | `…3313304WJ8631S@583263.5,4361118.0` |

Hoy, con la caché de cada máquina, 233, 194, 86 y OP304 siguen saliendo bien donde se guardaron; se
estropean en cuanto otra máquina, o una caché vacía, los vuelva a leer (el 233 y el OP304 no están en la
caché del VPS: la app los mediría ya mal).

Tras tocarlo: `python -m pytest implementation/cee-engine/tests/test_cuerpo_clave_estable.py` (y el resto
de la regla 48.j) y `node implementation/backend/scripts/test_trabajo_guardado.mjs`.
