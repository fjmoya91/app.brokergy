<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Qué PLANTAS se miden lo marcó una persona, no Catastro (2026-09-14)»; la introducción y el resto, en esta misma carpeta.

### La VISTA AÉREA (satélite), debajo del plano y bajo el 3D (2026-09-30)

Botón **◩ Satélite** en la barra del plano, en 2D **y en 3D**: la ortofoto del
**PNOA** (IGN) en su sitio exacto. La cartografía del Catastro dice lo que está
DADO DE ALTA; la foto enseña lo que hay: el tejado, el patio, el cobertizo sin declarar, la
piscina. Es lo que se mira en Google Earth antes de levantar un certificado, pero
debajo de las paredes que se clasifican. Al lado, **↗ Google** abre el edificio en
Google Maps (satélite), **Street View** (la fachada, que desde arriba no se ve) y
Google Earth (3D).

| Qué | Dónde |
|---|---|
| Rejilla de teselas, lienzo↔mundo, UTM→lat/lon, enlaces (puro) | [logic/ortofoto.js](implementation/frontend/src/features/cee-envolvente/logic/ortofoto.js) |
| La capa en planta, el suelo del 3D, la atribución y el menú de Google | `Ortofoto` · `OrtofotoSuelo` · `AtribucionOrtofoto` · `MenuMapas` en `PlanoPlanta.jsx` |
| El fondo elegido (Catastro · Satélite · nada) | `fondo` en `EnvolventeView.jsx`, recordado en `localStorage` (`brokergy.envolvente.fondo`) |
| Prueba (sin red) | `node implementation/backend/scripts/test_ortofoto.mjs` |

**REGLA — el PNOA y no Google.** Es del IGN, CC BY 4.0 (basta citarlo: la
atribución va en la esquina del plano mientras se ve) y se sirve en EPSG:25830,
el sistema del motor, así que encaja sin reproyectar. Las imágenes de Google no se
pueden poner debajo de un plano propio sin su API de pago: de Google van
**ENLACES**, por las URL documentadas de Maps (`api=1`) y la búsqueda por
coordenadas de Earth (comprobado: vuela al punto).

**REGLA — por TESELAS (WMTS) y las pide el NAVEGADOR.** La WMS del PNOA tarda
13-30 s por imagen (medido); las teselas bajan en paralelo en ~0,3 s (20 medidas)
y las cachean el navegador y el IGN. No pasan por nuestro servidor, igual que las
de OpenStreetMap del selector de ubicación (no hay CSP que lo impida). Se cubre el
entorno **más 40 m** alrededor (sin eso quedaban bandas negras al mirar la
manzana), en el nivel 19 (0,15 m/px) y, si pasa de 64 teselas, en el 18 (0,30,
la resolución nativa del PNOA).

⚠️ **La esquina de la rejilla que publica el IGN está REDONDEADA al metro.** Sus
capabilities dan `TopLeftCorner` con la Y entera, y con ella la tesela del nivel 18
salía un píxel (0,30 m) desplazada frente a la WMS del mismo rectángulo. La
rejilla está alineada POR ABAJO (`arriba = minY + filas · lado`) con un `minY` fijo
por huso, que se acota cruzando los ocho niveles. Con el punto medio, comprobado
tesela contra WMS por correlación de imagen: **desplazamiento 0** en los husos 29
(Santiago), 30 (Tomelloso, Madrid) y 31 (Barcelona). **Canarias (huso 28) NO se
ofrece**: no se pudo comprobar (la WMS daba 502), y una foto desplazada debajo de
un plano enseña la fachada donde no está.

**REGLA — es un FONDO, y es uno.** La cartografía del Catastro es un papel opaco y
taparía la foto: encender uno apaga el otro. Sin nada guardado sale el Catastro,
como siempre. La foto NO lleva el filtro de tema (invertida, un tejado rojo sale
azul), y con ella debajo los vecinos van **sin relleno** —la masa gris tapaba
justo sus tejados— conservando su contorno, que es dónde CREE Catastro que están.

**En 3D la foto es el SUELO**: la axonometría a altura fija es una transformación
AFÍN del plano, así que se proyectan tres puntos, se saca la matriz y el navegador
deforma las teselas con la MISMA cuenta que las paredes. Va al 50 % de opacidad:
a plena intensidad, las caras grises («sin mirar») desaparecían sobre los tejados.

La barra dice cómo va la carga («Cargando la ortofoto · 4 de 25») y cuántas
teselas no ha servido el IGN. Nunca tumba el plano: sin georreferencia o fuera de
los husos comprobados, el botón lo dice en su `title` (`◩ Satélite ⚠`).

**REGLA — la FECHA DEL VUELO va a la vista** («vuelo de junio de 2024», delante de
la atribución). El PNOA mezcla vuelos de años distintos, y una foto anterior a la
ampliación del garaje enseña una casa sin garaje. La da el IGN punto a punto
(GetFeatureInfo de `OI.MosaicElement`, `urlFechaVuelo` / `leerFechaVuelo`), con la
resolución. Ese servicio es LENTO (8 s medidos): la foto no espera por la fecha, y
se cachea por URL para no preguntarla dos veces.

⚠️ **La foto NO es una ortoimagen verdadera** (lo dice el propio IGN): los tejados
altos salen desplazados respecto a la huella de Catastro —medido en 26RES060_208:
~2 m en una casa de dos plantas—. Sirve para ver QUÉ hay; **no se mide con ella**.

**Y la usa la skill `generar-cee-inicial`**: `cee_inicial.js paredes` (y `aplicar`)
descarga las teselas con la MISMA `teselasOrtofoto` y `cee_inicial_plano.py` las
compone en `satelite.png` (la foto sola, para leer tejados) y
`plano_satelite.png` / `plano_plan_satelite.png` (las paredes encima, con halo
oscuro para que una fachada naranja se distinga de un tejado de teja). La rejilla
NO se copia a Python: el manifiesto trae las teselas ya colocadas en el lienzo.
