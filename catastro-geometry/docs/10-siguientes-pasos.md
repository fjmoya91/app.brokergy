# Siguientes pasos

## Para quién es esto

**Para el CERTIFICADOR, antes de emitir el CEE.** No es una herramienta de
auditoría a posteriori: es lo que le ahorra trabajo *antes* de sentarse con
CE3X.

Eso decide qué importa y qué no:

| Lo que el certificador **no** puede sacar fácil | Lo que mide él en la visita, sin ayuda |
|---|---|
| qué muro es **medianera** y hasta qué altura (hace falta saber cuántas plantas tiene cada colindante) | la **altura libre** de planta |
| la **orientación exacta** de cada fachada | los **huecos** (ventanas y puertas) |
| **patio** o calle, y la longitud de cada tramo | el estado de conservación |
| las **particiones con espacios no habitables** (vivienda sobre garaje, bajo almacén) | |
| las **superficies por planta**, cuadradas contra Catastro | |

**Ahí está el valor.** Lo de la derecha no hay que perseguirlo: por eso el
LiDAR y los huecos **bajan de prioridad**, y lo hacen a propósito.

---

## Paso 1 — ¿Cómo entra la geometría en CE3X? (20 minutos)

La pregunta que más cambia el proyecto, y la más barata de contestar. Con CE3X
delante:

* ¿tiene alguna **importación** documentada de envolvente?
* si no, ¿acepta un **`.cex` modificado**? Coger uno, cambiar la superficie de un
  muro con un editor, abrirlo y ver si sale el número nuevo.

Si la respuesta es que sí, **el entregable deja de ser una tabla para teclear y
pasa a ser un fichero que se abre**. Ver `docs/11-el-fichero-cex-de-ce3x.md`: el
`.cex` es una secuencia de pickles de Python y el nº 3 es la envolvente.

Y con eso **se cae Computer Use**, que no era más que automatizar el teclear.

## Paso 2 — El spike del `.cex` (una tarde, si el paso 1 sale bien)

Por diferencias, no leyendo 2.791 opcodes: guardar un `.cex` con la envolvente
vacía, añadir **un solo muro**, guardar otra vez, desensamblar los dos y restar.
Repetir con medianera, cubierta, suelo y partición. Cinco ficheros y está el
formato.

Empezar **modificando** un `.cex` del propio certificador (con sus datos
administrativos y su zona climática ya puestos) y reescribiendo **solo** el
pickle de la envolvente. No hace falta entender el fichero entero.

## Paso 3 — `OtherConstruction` y `GetAllConstructionByParcel` (2 peticiones)

Dos cosas que salieron del `DescribeStoredQueries` real (`docs/01`):

* **`OtherConstruction` no se pide, y en una unifamiliar es lo que descuadra la
  envolvente**: porches, cobertizos, terrazas cubiertas. Un porche adosado toca
  la fachada, el certificador lo ve en la visita, y hoy nuestra tabla no lo lleva.
* **`GetAllConstructionByParcel`** devuelve Building + BuildingPart +
  OtherConstruction en **una** petición, donde hoy se gastan tres. Un caso nuevo
  baja de ~20 peticiones a ~10.

## Paso 4 — La salida como ficha de visita

Hoy la salida está pensada para nosotros. Para el certificador hacen falta dos
listas separadas:

* **Resuelto**: esto viene de Catastro y no hay que medirlo.
* **Por comprobar en la visita**: la altura, los huecos, y todo lo marcado
  `requiere_revision` **con el motivo**.

La columna `requiere_revision` ya existe y ya lleva el motivo escrito: lo que
falta es presentarla como lo que es, un **checklist de visita**. Y el
`geometry_debug.png` ya es medio una ficha de campo — con los IDs y las
longitudes encima de cada muro, se comprueba sobre el terreno.

## Paso 5 — Calibrar con unifamiliares reales

Los 102 CEE con `.xml` y referencia catastral (`expedientes.cee.xml_inicial`)
siguen valiendo, pero **la pregunta correcta no es "¿acertamos?"**, sino:

> **¿cuánto puede fiarse el certificador de cada número sin volver a medirlo?**

Y las discrepancias hay que **triarlas**, no darlas por errores nuestros: parte
de ellas serán simplificaciones del CEE anterior. Si nosotros encontramos una
partición con espacio no habitable de 74 m² y el certificador puso 0, el que se
la dejó fue él.

Utilidad inmediata y gratis del mismo corpus: `SUPERFICIEHABITABLE` y
`VOLUMENESPACIOHABITABLE` dan la **altura libre real** de cada vivienda (está en
los 102: 2,70–3,00 m, media 2,78) y `COMPACIDAD` da la superficie total de
envolvente, que es **un solo número contra el que contrastar el modelo entero**.

Empezar por **10-15 unifamiliares variadas**: entre medianeras, pareada, exenta,
con garaje en planta baja, con sótano, con porche. Con el paso 3 hecho son ~150
peticiones repartidas con pausa de 2 s.

## Paso 6 — Lo que el calibrado diga

* **Cubiertas inclinadas**: medimos la proyección en planta; la real es mayor.
* **Terreno en pendiente**: parte de la planta baja contra terreno y parte al aire.
* **Construida vs habitable**: la huella catastral incluye muros; CE3X pide
  habitable. La relación se mide con los 102 casos.

## Paso 7 — El DXF

Solo hace falta cuando una planta tiene varios usos (vivienda + garaje). El
lector está hecho y probado; falta un DXF real. Ver `docs/06`.

---

## Lo que NO toca todavía, y por qué

**Alturas por LiDAR.** El certificador la mide en la visita, y además el propio
CEE la trae. Cerrar el LiDAR es bonito y no es lo que le ahorra tiempo a nadie.

**Huecos.** No están en Catastro y los mide él. Como mucho, un valor de arranque
sacado de `<HUECOSYLUCERNARIOS>` de los 102 CEE, marcado `INFERRED`.

**Pisos en bloque.** Hasta que las unifamiliares estén depuradas.

**Computer Use sobre CE3X.** Si el paso 1 sale bien, no hace falta. Y si no sale,
automatizar el volcado de una geometría cuyo error aún no hemos medido es
automatizar el error.
