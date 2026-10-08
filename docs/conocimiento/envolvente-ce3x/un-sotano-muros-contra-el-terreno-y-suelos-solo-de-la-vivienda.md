<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## Un SÓTANO: muros contra el TERRENO y suelos solo de la VIVIENDA (2026-10-01)

Caso: **26RES060_191** (Ciudad Real, CTE 2010, D3). Casa AISLADA con 19 m² de vivienda en el sótano
junto a un garaje y un almacén (Catastro planta -1: vivienda 19 · aparcamiento 130 · almacén 11).
Lo vio Fran en el CE3X de la técnica, que había partido del `_REVISAR.cex` que el motor generó el
19/09/2026:

| En el `.cex` | Qué es en realidad |
|---|---|
| PS1S1, PS1O3, PS1S3, PS1O4 «PARTICION CON EL VECINO» (U 1,8) y FS1N5 fachada al aire | Muros del sótano **contra el terreno** |
| SUS11 suelo contra terreno de **137,65 m²** en la zona SOTANO 1 (19 m²) | Suelo de **19 m²**: la huella entera del sótano metía el garaje |
| PHS11 partición horizontal INFERIOR «Garaje/espacio enterrado», 137,65 m², en el sótano | No existe: debajo del sótano no hay nada (el forjado sobre el garaje ya lo escribe la planta baja, PHB1) |
| PHB2 (planta baja) y PH11 (planta 1), 95,73 m² cada una, «Garaje/espacio enterrado» | El forjado entre dos plantas de VIVIENDA, escrito dos veces: el fallo que arregló la regla 48.j el 21/09, posterior a este `.cex` |

Corregido con el propio CE3X 3.1: demanda de calefacción **293,42 → 221,8 kWh/m²**, energía primaria
no renovable 536,08 → **411,48 (G → F)**; la medida de mejora sigue en el 88,5 %.

**REGLA — los muros de una planta bajo rasante son «Muro en contacto con el terreno»**, nunca
medianera ni «partición con el vecino» aunque la parcela de al lado esté pegada: bajo tierra, al otro
lado hay tierra. Las paredes contra el garaje o el almacén del propio sótano siguen siendo partición
vertical con espacio no habitable.

**REGLA — ese muro va «Por defecto»**: medido con el propio CE3X (oráculo, `panelFachadaConTerreno`),
sus «Propiedades térmicas» solo ofrecen **«Estimadas» y «Por defecto»**; no hay «Conocidas», así que
la U no se teclea. «Por defecto» da **0,66** en este caso, la misma con 0,5 m que con 2,8 m de
profundidad enterrada («Estimadas» sin aislamiento da 2,6 a 0,5 m y 0,38 a 2,8 m). Lo que escribe CE3X:

```
[nombre, 'Fachada', sup, 0.66, 200.0, '', '', u'Sin patrón', u'Por defecto', [], u'', u'', u'1', zona, 'terreno']
```

(`'Fachada'`, los dos `''` de las posiciones 5-6 y `'terreno'` como STRING; lo demás UNICODE).

**REGLA — el suelo de cada zona es solo su VIVIENDA**: suelo contra terreno + particiones
horizontales inferiores de una zona ≈ su superficie. Nada «inferior» en la planta más baja ni en
una planta que está sobre vivienda.

⚠️ **Al quitar una pared hay que quitar sus PUENTES TÉRMICOS**: FS1N5 tenía tres (pilar integrado,
pilar en esquina, forjado). Huérfanos, CE3X **no abre el fichero** (`TreeCtrl_AppendItem … expected
argument 2 of type 'wxTreeItemId const &'` en `panelEnvolvente.cargarArbol`). Un muro enterrado no
lleva los puentes de una fachada.

⚠️ **El motor aún no escribe este muro.** Mientras tanto se pasa con el propio CE3X:
[muros_terreno.py](implementation/cee-engine/tools/oraculo_ce3x/muros_terreno.py) (`MUROS`, `QUITAR`,
`SUPERFICIES`; con un CE3X 3.1 abierto). Lo hace CE3X con su panel y su botón «Añadir», quita las
paredes y sus puentes y guarda; comprobado sobre el `.cex` del caso: envolvente idéntica a la
corregida a mano (46 cerramientos, 162 puentes). Después hay que **volver a poner la medida de
mejora** (lleva dentro la envolvente de antes) y calcularla. Reescribir el pickle de la envolvente
desde el motor (`_reemitible` del pickle 3 entero) daba un fichero que CE3X no abría: mejor no.

Lo recogen las skills `generar-cee-inicial` (punto 15 y la tabla de zonas de `plan.md`) y
`revisar-cee` (puntos «Sótano» y «Suelos por zona», a mano hasta que lo mire el comprobador).
