<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

### Los valores POR DEFECTO de CE3X 3.2, por época y zona (2026-10-08)

En la 3.2, la opción de la U que la pantalla llama **«Estimados según antigüedad y zona
climática»** es la que el fichero guarda como **`'Por defecto'`**. Fran la vio en 26RES060_188
(2003, E1): una fachada al aire sale con **U = 1,40 W/m²K y 200 kg/m²**. Se pidió la tabla
entera para decidir si la skill `generar-cee-inicial` la usa.

**DECISIÓN (Fran, 08/10/2026): esta tabla ES la Guía de Transmitancias de BROKERGY.** Cada CEE
nuevo lleva, en «Conocidas», las U y masas que CE3X pondría con «Estimados según antigüedad y zona
climática»; la calculadora las usa en las simulaciones nuevas y el PDF de la Guía se genera de
ella. Fuente única: [transmitanciasCe3x.js](implementation/frontend/src/features/calculator/logic/transmitanciasCe3x.js)
(copiada de la salida del oráculo y cruzada fila a fila contra ella: 1.440 de 1.440). Lo que no se
mueve, la marca de las simulaciones y la revisión por fechas: regla 129.

**De dónde sale.** No está en los manuales (el «Manual de fundamentos técnicos» que trae la
instalación es de 2012, con tres épocas) ni en los documentos del procedimiento de 2026: está
compilada en `Envolvente/tablasValores.pyd`, en diccionarios locales de cada método
(`diccFachadaAirePorDefecto`, `diccCubiertaAirePorDefecto`…). Se sacó **preguntándoselo al propio
CE3X** con el oráculo ([valores_por_defecto.py](implementation/cee-engine/tools/oraculo_ce3x/valores_por_defecto.py)):
`tablasValores(tipo, frontera, datos, 'Por defecto')` y su `obtenerDatos…()`, que deja
`UCerramiento` y `densidadCerramiento`. Lo que pide cada panel se capturó abriendo el 188 sin
ventana y pulsando sus desplegables: `datos = [periodo, zona HE-1, zona NBE]` (más `'Cubierta
plana'/'inclinada'` en la cubierta; el suelo y la cubierta con terreno y el muro enterrado no
llevan la zona NBE). 6 periodos × 20 zonas HE-1 × 5 zonas NBE × 15 casos = **9.000 llamadas, ningún
error**.

**REGLA — en las épocas de la NBE-CT-79 la U va por la ZONA DE LA NBE (V…Z), no por la HE-1.**
CE3X la guarda en los datos generales (`DG.NBE`, campo `[15]` del pickle 2). Con la localidad
«Otro» la deduce de la HE-1; con una localidad de su lista, de su propia tabla (Albacete capital
D3 → Z, Madrid D3 → Y, Collado Villalba D3 → Z):

| Zona HE-1 (localidad «Otro») | Zona NBE |
|---|---|
| α1-α4, A1, A2, B1, B2 | V |
| A3, A4, B3, B4, C1, C2 | W |
| C4 | X |
| C3, D1, D2, D3 | Y |
| E1 | Z |

⚠️ **El motor escribía siempre `"Y"`** (`construir_generales`, [generar_cex.py](implementation/cee-engine/tools/generar_cex.py)).
Coincidía con lo que pondría CE3X en C3 y D1-D3 (casi todo el corpus: de 401 `.cex` leídos, todos
D2/D3), pero un cerramiento puesto en «Estimados» en un E1 de época NBE salía con la zona de un D:
en el 188, cubierta 0,90 en vez de 0,70 (lo vio Fran en CE3X). **Desde el 08/10/2026 la escribe la
ficha** (`generales.zona_nbe` = `zonaNbe(zona HE-1)`), y una ficha anterior que no la trae sigue
con «Y». Comprobado: el `.cex` nuevo del 188 abre en CE3X con NBE «Z».

**Los periodos** («Normativa vigente», `anoConstruccionChoice`). La pantalla de la 3.2 enseña una
etiqueta y el fichero guarda otra:

| Pantalla (3.2) | Fichero | Índice |
|---|---|---|
| Antes 1980 | `Anterior` | 0 |
| 1980 - 1998 | `NBE-CT-79` | 1 |
| 1998 - 2007 | `NBE-CT-79_aPartir1998` | 2 |
| 2007 - 2013 | `C.T.E.` | 3 |
| 2014 - 2020 | `CTE 2013` | 4 |
| Después 2020 | `Apartir2020` | 5 |
| Otros (post 2020) | `Otros` | 6 |

**«1980 - 1998» y «1998 - 2007» dan la MISMA U, y «2014 - 2020», «Después 2020» y «Otros (post
2020)» también**: la diferencia de periodo no está en la envolvente. Comprobado además por el
camino de la PANTALLA (como lo haría una persona): en el 188 abierto sin ventana, cambiando
«Normativa vigente» a cada uno de los 7 y la zona a C2, D3 y E1, la U del panel de fachada y la de
cubierta salen las de la tabla en las 21 combinaciones. Y al cambiar la zona HE-1, CE3X recalcula
la NBE solo (E1 → Z): el «Y» que trae el fichero del motor dura hasta que alguien toca la zona. Dentro de la HE-1 solo cuenta la LETRA (D1 = D2 = D3), y α = A salvo en CTE 2013/2020,
donde α conserva el valor del C.T.E. de 2006.

#### U (W/m²K) · masa (kg/m²)

| Cerramiento | Antes 1980 | 1980 - 2007 (V·W / X / Y / Z) | 2007 - 2013 (A / B / C / D / E) | Desde 2014 (α / A / B / C / D / E) |
|---|---|---|---|---|
| Fachada al aire | 2,38 · 168 | 1,80 / 1,60 / 1,40 / 1,40 · 200 | 0,94 / 0,82 / 0,73 / 0,66 / 0,57 · 200 | 0,94 / 0,50 / 0,38 / 0,29 / 0,27 / 0,25 · 200 |
| Muro contra el terreno | 2,00 · 200 | 2,00 · 200 | 0,94 / 0,82 / 0,73 / 0,66 / 0,57 | 0,94 / 0,50 / 0,38 / 0,29 / 0,27 / 0,25 |
| Cubierta plana | 2,17 · 344 | 1,40 / 1,20 / 0,90 / 0,70 · 344 | 0,50 / 0,45 / 0,41 / 0,38 / 0,35 · 344 | 0,50 / 0,47 / 0,33 / 0,23 / 0,22 / 0,19 · 344 |
| Cubierta inclinada | 2,63 · 180 | igual que la plana | igual que la plana | igual que la plana |
| Cubierta contra el terreno | 1,00 · 400 | 1,00 · 400 | 0,94 / 0,82 / 0,73 / 0,66 / 0,57 | 0,94 / 0,50 / 0,38 / 0,29 / 0,27 / 0,25 |
| Suelo al aire | 2,50 · 50 | 1,00 / 0,90 / 0,80 / 0,70 · 333 | 0,53 / 0,52 / 0,50 / 0,49 / 0,48 · 333 | 0,53 / 0,53 / 0,46 / 0,36 / 0,34 / 0,31 · 333 |
| Suelo contra el terreno | 1,00 · 750 | 1,00 · 750 | 0,94 / 0,82 / 0,73 / 0,66 / 0,57 | 0,94 / 0,50 / 0,38 / 0,29 / 0,27 / 0,25 |
| Partición vertical (no habitable) | 2,25 · 60 | 1,80 / 1,62 / 1,44 / 1,44 · 60 | 0,94 / 0,82 / 0,73 / 0,66 / 0,57 · 60 | igual que C.T.E. |
| Partición inferior (garaje / local) | 2,17 · 50 | 2,17 / 1,40 / 1,20 / 1,20 · 333 | 0,53 / 0,52 / 0,50 / 0,49 / 0,48 · 333 | igual que C.T.E. |
| Cámara sanitaria | 2,00 · 333 | 2,00 / 1,40 / 1,20 / 1,20 · 333 | 0,53 / 0,52 / 0,50 / 0,49 / 0,48 · 333 | igual que C.T.E. |
| Partición superior, bajo cubierta inclinada | 1,36 · 120 | 1,36 / 1,12 / 0,96 / 0,96 · 400 | 0,50 / 0,45 / 0,41 / 0,38 / 0,35 · 400 | igual que C.T.E. |
| Partición superior, otro | 1,70 · 220 | 1,70 / 1,40 / 1,20 / 1,20 · 500 | 0,50 / 0,45 / 0,41 / 0,38 / 0,35 · 500 | igual que C.T.E. |

En el C.T.E., α = A. El suelo contra el terreno se probó con la profundidad que manda el panel
(`'-0.5'`, «≤ 0,5 m») y con tres valores más: la U no cambió (el panel de «> 0,5 m» no llamó a la
tabla, así que ese caso no está comprobado desde la pantalla). Las particiones son la Up de la
partición: el panel le aplica después lo suyo (ventilación del espacio, superficies).

#### Frente a la Guía ANTERIOR (17/03/2026 – 07/10/2026, `getUByYearGuiaAnterior`)

| Época | Guía anterior: muro / cubierta / suelo | CE3X «Por defecto» (D · Y) = Guía vigente |
|---|---|---|
| antes de 1960 | 2,20 / 2,50 / 1,25 | 2,38 / 2,17 plana · 2,63 inclinada / 2,50 al aire · 1,00 terreno |
| 1960-1978 | 1,90 / 2,10 / 1,10 | igual que la fila de arriba (para CE3X es una sola época) |
| 1979-1990 | 1,80 / 1,90 / 1,05 | 1,40 / 0,90 / 0,80 al aire · 1,00 terreno |
| 1991-2007 | 1,69 / 1,69 / 1,00 | 1,40 / 0,90 / 0,80 al aire · 1,00 terreno |
| 2008-2013 (D) | 0,66 / 0,45 / 0,49 | 0,66 / 0,38 / 0,49 al aire · 0,66 terreno |
| 2014-2019 | 0,35 / 0,25 / 0,35 | 0,27 / 0,22 / 0,34 al aire · 0,27 terreno |
| desde 2020 | 0,27 / 0,22 / 0,30 | 0,27 / 0,22 / 0,34 al aire · 0,27 terreno |

La Guía anterior era **más alta que CE3X en las épocas NBE** (muro 1,69 frente a 1,40; cubierta
1,69 frente a 0,90 en Y y 0,70 en Z): con ella salía más demanda en el inicial, y con la nueva un
CEE de esas épocas sale con menos demanda y menos ahorro. Se decidió con estos números delante
(Fran, 08/10/2026); las simulaciones ya guardadas no se mueven (regla 129).

#### El PDF de la Guía

Se GENERA de la tabla, nunca se edita a mano: `node implementation/backend/scripts/guia_transmitancias.mjs
--salida=<ruta.pdf>` (3 hojas de alto fijo; el script para si la tabla deja de cumplir lo que el texto
afirma —V = W, α = A en 2007-2013, masa constante después de 1980—). Vive en Drive, en
«01. RD 36-2023 (CAES) / 03. OPERACIONES / 02. MANUALES / Guia_Transmitancias_CE3X_BROKERGY.pdf»,
escrita ENCIMA de la anterior para que el enlace que tienen los técnicos siga valiendo; la del
17/03/2026 (PDF y Word) está en su `OLD/`.

```bash
# repetir la tabla con CE3X (3.2 en el PC; deja el JSON con las 7.200 filas)
SALIDA='C:\ruta\valores.json' bash implementation/cee-engine/tools/oraculo_ce3x/run.sh \
    "$(pwd)/implementation/cee-engine/tools/oraculo_ce3x/valores_por_defecto.py"
node implementation/backend/scripts/test_guia_transmitancias.mjs
```
