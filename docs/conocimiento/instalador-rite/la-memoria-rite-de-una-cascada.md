# La Memoria RITE de una CASCADA: todo cabe en su casilla y los litros se suman (2026-11-13)

Caso: 26RES060_226. Dos viviendas con una sola referencia catastral, con dos SIME SHP M PRO (008 y 010)
en cascada para la calefacción y dos aerotermos Johnson de 110 L para el ACS.

## Qué pasaba

- La plantilla de la JCCM tiene UNA casilla de marca, modelo y nº de fabricación, así que en una cascada
  se concatena: el modelo es «SHP M PRO 008 + SHP M PRO 010» y el nº de fabricación es «serie1 / serie2»
  (`_modelos` y `_series` en `rite-generator/lib/supabase_client.py`). Pero las filas de esa tabla son de
  **alto EXACTO** (`w:trHeight w:hRule="exact"`): la segunda línea no ensancha la fila, **desaparece**.
  La memoria salía con «540NB409102B7090100 024 /» y sin la segunda serie. Un nº de fabricación cortado,
  en un documento que firma el instalador, no vale.
- La ACUMULACIÓN leía solo la primera unidad de ACS: declaraba **110 L** donde hay **220 L**.

## Qué se hizo

**REGLA — en una casilla de alto fijo el texto largo se ENCOGE, nunca se corta.** `rellenar_xml`
(`rite-generator/lib/generar_memoria.py`) mide la celda (ancho `tcW` menos el margen de 70 dxa por lado de
`tblCellMar`, y las líneas que caben en el alto exacto con interlineado 1,25) y baja el cuerpo de letra de
ESA casilla lo justo, sin bajar de 4 pt. El interlineado es 1,25 y no 1,15 porque el PDF lo hace el
LibreOffice del servidor, que pinta con DejaVu (líneas más altas y letras más anchas que Arial): con 1,15
el modelo se quedaba a 6 pt en dos líneas y la segunda («010») salía medio cortada (15/11/2026). Se usan dos anchos de carácter: con el holgado (0,58 em) se
decide si desborda, para no tocar nada que ya cabía (con 0,66 encogía los nº de fila «10» y «11» y
«ESPUMA ELASTOMÉRICA», que se veían bien), y con el estricto (0,66 em, medido en el PDF con mayúsculas y
cifras) se elige el tamaño nuevo. Medido: en el 226 cambian solo el modelo (7 → 5,5 pt, en una línea) y
el nº de fabricación (7 → 5,5 pt, en dos), y en el ejemplo de una sola máquina (26RES060_120) no cambia ninguna casilla.

**REGLA — la acumulación es la de TODOS los depósitos de ACS.** `_acumulacion_total` suma los litros de
cada unidad de `aerotermia_acs` (la 1 y sus `equipos_extra`). Una unidad extra sin litros ni modelo propio
se toma como del mismo modelo que la primera. Si alguna no se puede leer, se declara la de la primera,
como antes: nunca se suma a medias.

Las series del ACS (los Johnson) no salen en la memoria: la plantilla solo tiene la casilla del
generador de calefacción. Esto ya era así y no se ha cambiado.

Tras tocarlo: se genera la memoria de una cascada y la de una sola máquina, y se comparan los `w:sz` de
cada campo con los de la plantilla (en una sola máquina no debe cambiar ninguno). Después se mira el PDF.
