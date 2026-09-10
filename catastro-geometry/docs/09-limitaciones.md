# Limitaciones conocidas

Dicho antes de que te lo encuentres. Lo que está en verde funciona sobre
unifamiliares; lo demás, no.

## 1. Alturas — la que más se nota
No las publica Catastro y el LiDAR no está cerrado. **Todas las superficies de
muro son provisionales** mientras la altura sea `MANUAL`. Ver `docs/05`.

## 2. Uso por polígono cuando una planta tiene varios usos
Catastro no dice qué trozo es cada uso, así que la partición vertical
vivienda↔garaje no se puede situar. Se resuelve con el DXF. Ver `docs/06`.

## 3. `OtherConstruction` todavía no se pide
El WFS BU sirve `bu:OtherConstruction` — porches, terrazas, cobertizos,
piscinas — y hoy el programa **no lo consulta**. En una unifamiliar es justo lo
que descuadra la envolvente: un porche adosado o un cobertizo aparecen como
construcción y pueden estar tocando la fachada.

Está identificada la vía: `GetOtherBuildingByParcel`, o mejor
`GetAllConstructionByParcel`, que devuelve Building + BuildingPart +
OtherConstruction **en una sola petición** (hoy se gastan tres).

## 4. Un piso de un bloque devuelve el EDIFICIO entero
El WFS trabaja por parcela, no por inmueble. Con división horizontal, la huella
es la de todo el bloque. `FLOOR_AREA_MISMATCH` lo avisa comparando la huella con
la superficie catastral del inmueble, pero **el reparto por vivienda no se hace**.
No probado todavía.

## 5. No se pueden representar vuelos
Con `numberOfFloorsAboveGround`, la huella de una planta siempre está contenida
en la de abajo. Balcones y vuelos no salen de aquí. Ver `docs/04`.

## 6. Los huecos no existen en Catastro
Ventanas y puertas hay que introducirlas aparte. La superficie que da el
programa es bruta.

## 7. El mapa necesita Internet
`debug_map.html` carga Leaflet de un CDN y las teselas del PNOA y del WMS
catastral. Sin conexión se ve la leyenda y el mapa en blanco. El PNG es
autosuficiente.

## 8. FXCC sin interpretar
Ver `docs/06`.

## 9. Cubiertas inclinadas
Se mide la **proyección en planta**. Una cubierta a dos aguas tiene más
superficie real que su proyección; el factor depende de la pendiente, que
Catastro no da.

## 10. Terreno en pendiente
El suelo en contacto con el terreno se calcula como toda la huella de la planta
más baja. En una parcela con desnivel, parte de esa planta puede estar contra el
terreno por un lado y al aire por otro. No se detecta.
