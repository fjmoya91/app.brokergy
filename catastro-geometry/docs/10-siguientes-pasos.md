# Siguientes pasos — depurar unifamiliares

El objetivo antes de tocar pisos en bloque: **saber cuánto se equivoca la
herramienta y en qué**, con números, no con impresiones.

## Lo que cambia el orden de todo: ya tenemos con qué medirnos

Los `.xml` de los CEE que hay en `expedientes.cee.xml_inicial` (app.brokergy)
llevan **la envolvente que tecleó el certificador**:

```xml
<DATOSENVOLVENTETERMICA>
  <CERRAMIENTOSOPACOS>
    <ELEMENTO>
      <TIPO>FACHADA</TIPO>          <!-- FACHADA · SUELO · CUBIERTA ·
      <ORIENTACION>NORTE</ORIENTACION>     PARTICIONINTERIORHORIZONTAL ·
      <SUPERFICIE>34.47</SUPERFICIE>       ADIABATICO (= medianera) -->
    </ELEMENTO>
```

Medido el 2026-09-10: **102 expedientes tienen `.xml` Y referencia catastral**
(64 de sustitución RES060/RES093 y 38 de reforma RES080). Es un banco de
validación de 102 viviendas reales, gratis, sin pedirle nada a Catastro.

Y traen dos cosas más en la cabecera:

```xml
<SUPERFICIEHABITABLE>190.00</SUPERFICIEHABITABLE>
<VOLUMENESPACIOHABITABLE>532.00</VOLUMENESPACIOHABITABLE>   <!-- 532/190 = 2,80 m -->
<COMPACIDAD>1.03</COMPACIDAD>                               <!-- V / A envolvente -->
```

* **La altura libre real sale de dividir volumen entre superficie.** Está en
  **los 102** expedientes. Rango medido: **2,70 – 3,00 m, media 2,78**.
* **La compacidad da la superficie total de envolvente** (`A = V / compacidad`),
  que es **un solo número contra el que contrastar todo el modelo**.

---

## Paso 0 — El banco de referencia. Cero peticiones a Catastro

Extraer de los 102 `.xml` a una tabla: superficie habitable, volumen, **altura
libre**, compacidad, y la lista de `ELEMENTO` con tipo, orientación y superficie.

Sale de ahí, sin gastar nada:

1. **La altura deja de ser un valor inventado.** Cuando el expediente tiene CEE,
   `--floor-height` se lee de su propio certificado. Es lo que hoy hace que 26 de
   29 filas salgan marcadas para revisión.
2. **Una banda de sensatez**: cualquier altura fuera de 2,6 – 3,1 m es
   sospechosa. Sirve para validar el LiDAR el día que se cierre.
3. **El contraste de compacidad**: si nuestra envolvente total no se parece a
   `V / compacidad`, el modelo está mal y se sabe con un número.

## Paso 1 — `GetAllConstructionByParcel` y `OtherConstruction`

Dos cosas que se descubrieron leyendo el `DescribeStoredQueries` real
(`docs/01`):

* **`OtherConstruction` no se pide, y en una unifamiliar es lo que descuadra la
  envolvente**: porches, cobertizos, terrazas cubiertas, piscinas. Un porche
  adosado toca la fachada y hoy no lo ve nadie.
* **`GetAllConstructionByParcel` devuelve Building + BuildingPart +
  OtherConstruction en UNA petición**, donde hoy se gastan tres. Con los
  colindantes, pasar de 2 peticiones por vecino a 1.

Coste de comprobarlo: **2 peticiones**. Beneficio: un caso nuevo baja de ~20
peticiones a ~10, que es lo que hace viable el paso 2.

## Paso 2 — Medirse contra 15 unifamiliares reales

Con el paso 1 hecho, cada vivienda cuesta ~10 peticiones. **15 viviendas = ~150
peticiones**, repartidas con pausa de 2 s. Elegir variedad: entre medianeras,
pareada, exenta, con garaje en planta baja, con sótano, con porche.

La salida es una tabla de desvíos por tipo de cerramiento:

```
                        nuestra    CE3X del      desvío
                        geometría  certificador
FACHADA norte            34,1 m²     34,47 m²      −1 %
MEDIANERA                47,4 m²     46,0  m²      +3 %
SUELO terreno           191,5 m²    190,0  m²      +1 %
PARTICION no habitable   74,2 m²      0,0  m²      ← el certificador no la puso
```

**Esa última fila es el oro.** No solo dice si nos equivocamos: dice **dónde el
certificador se dejó cosas**, que es un argumento comercial y de calidad.

## Paso 3 — Lo que el banco de pruebas diga que está mal

No se puede planificar antes de tener el paso 2. Lo previsible:

* **Cubiertas inclinadas**: medimos la proyección en planta; la real es mayor.
  Con 15 casos se ve el factor típico y si merece pedirlo aparte.
* **Terreno en pendiente**: parte de la planta baja contra terreno y parte al
  aire. Hoy no se detecta.
* **Superficie habitable vs huella**: la huella catastral es construida (incluye
  muros); CE3X pide habitable. La relación se mide con los 102 casos.

## Paso 4 — El DXF

Solo hace falta cuando una planta tiene varios usos (vivienda + garaje). El
lector está hecho y probado; falta bajar un DXF real y comprobarlo contra él.
Ver `docs/06`.

## Paso 5 — Huecos

No están en Catastro. Pero `<HUECOSYLUCERNARIOS>` de los 102 CEE da la
**proporción hueco/fachada por orientación** que usan de verdad estas viviendas.
No es medir: es proponer un valor de arranque marcado como `INFERRED` para que lo
corrija quien visite.

---

## Lo que NO toca todavía

**Pisos en bloque.** El WFS trabaja por parcela: con división horizontal
devuelve el edificio entero. Hace falta primero que lo de arriba esté cerrado, y
después decidir cómo se reparte un bloque entre viviendas — que probablemente
solo se pueda con el DXF por plantas.

**Computer Use sobre CE3X.** La tabla ya tiene la forma del formulario, pero
automatizar el volcado de una geometría que todavía no sabemos cuánto se
equivoca es automatizar el error.
