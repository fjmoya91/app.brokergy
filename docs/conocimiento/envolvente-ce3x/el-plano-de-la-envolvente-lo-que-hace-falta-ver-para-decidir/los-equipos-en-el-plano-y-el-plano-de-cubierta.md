<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)»; la introducción y el resto, en esta misma carpeta.

## Los EQUIPOS en el plano, y el PLANO DE CUBIERTA (2026-10-09)

**Lo pidió Fran** (con el croquis PDF de una planta delante): «añadir un icono en el plano para ubicar
dónde está actualmente la caldera vieja, y otro para cuando se determine dónde va la nueva; incluso la
unidad interior de ACS; y si va sobre la cubierta, un planito más que se vea como la cubierta de tejas
para decir dónde se ha ubicado la unidad exterior». El croquis decía qué es cada pared y dónde está cada
hueco, pero no dónde está la instalación, que es lo primero que pregunta quien va a la obra.

**Cuatro tipos** ([logic/equiposPlano.js](implementation/frontend/src/features/cee-envolvente/logic/equiposPlano.js),
`TIPOS_EQUIPO`), cada uno con su icono blanco sobre un cuadrado de color: **caldera actual** (el cuerpo
de la caldera con la LLAMA: quema algo), **equipo nuevo** (el mismo cuerpo con el RAYO: la aerotermia;
vale también para una caldera nueva), **depósito de ACS** (el acumulador con la gota) y **unidad
exterior** (la caja con el ventilador).

**REGLA — uno de cada TIPO.** Es «dónde está», no un inventario: poner otra vez el mismo tipo lo CAMBIA
de sitio, y quitarlo es la ✕ de su botón. Una cascada con dos unidades exteriores no cabe aún (se
añadiría como un tipo más o con un índice).

**REGLA — se guarda en el MUNDO (EPSG:25830) y por NIVEL**, en `trabajo.equipos_plano`
(`[{ tipo, nivel, punto: [X, Y] }]`), como las zonas y el contorno del adosado: el motor re-encuadra el
lienzo al volver a medir (regla 79) y un punto del lienzo acabaría en otro sitio. El nivel es el de la
planta (0, 1, −1…), nunca su id; la cubierta es `'cubierta'`. Solo se escribe si hay alguno: un plano sin
equipos se guarda byte a byte como antes. Viaja con el trabajo, así que se autoguarda y se deshace con
Ctrl+Z como lo demás (regla 48.h).

**REGLA — no va al `.cex`.** CE3X no coloca los equipos. Es del plano de la ventana y del croquis PDF.

**Es un MODO, como la pizarra o la cubierta.** Botón «📍 Equipos» en la barra de cada plano (se acorta a
«📍» en el mismo escalón que la Pizarra, regla 128). La TIRA del modo va **una vez, encima de las
plantas**: el equipo elegido vale para cualquiera de ellas y para la cubierta, y dos tiras iguales
—una por tarjeta— eran ruido. Un toque coloca; arrastrar sigue moviendo el plano (mismo gesto que un
vértice de la cubierta). Abrir el modo apaga los otros modos de dibujo y al revés: un toque no puede
significar dos cosas. Al abrirlo se elige el primer tipo que falte por poner.

**El PLANO DE CUBIERTA** es una tarjeta más junto a las plantas, con el tejado visto desde arriba en
teja árabe (hileras de arcos). Sale de los **CUERPOS** que ya manda el motor (`geo.cuerpos`, cada parte
de Catastro con su contorno y sus `niveles`): un cuerpo es un prisma, así que su tejado es su contorno a
la altura de su planta MÁS ALTA, pintados de abajo arriba (`faldonesCubierta`). Así el tejado del garaje
se ve como uno más bajo junto al de la casa —donde suele ir la unidad exterior— y, si hay alturas
distintas, cada faldón dice «sobre planta baja / planta 1». Sin cuerpos (geometría antigua), el
contorno de cada planta por sus muros. Se enseña si hay algo puesto en ella o si se pide con «🏠 Plano
de cubierta» en la tira.

**Dos iconos en el mismo sitio se CORREN** (`separarMarcas`): la máquina nueva va muchas veces justo
donde estaba la caldera, y se dibujaban uno encima de otro. El segundo se corre a la derecha y se une a
su punto con una línea; lo guardado no se toca.

**En el croquis PDF** ([croquisCee.js](implementation/backend/services/cee/croquisCee.js)): cada icono en
la hoja de su planta —el MISMO trazo que en pantalla (`iconoSvg`)— con su rótulo; la leyenda añade solo
los que están puestos; si algo va en el tejado, una hoja **«Cubierta»** (mismo giro y escala normalizada
que las plantas; la teja nunca menos de 3 mm de papel, a 1:250 se leía como un rayado); y en la hoja de
cuadros, «Ubicación de los equipos» (equipo · dónde). Sin equipos sale exactamente el croquis de antes.

**Verificado** el 09/10/2026 sobre 26RES060_226: en la ventana con el capturador de solo lectura (cuenta
robot, el autoguardado interceptado: nada escrito) se pusieron los cuatro —caldera y equipo nuevo en la
planta baja, ACS en la 1, unidad exterior en la cubierta—; y el croquis, en seco, con los equipos
metidos solo en memoria. A 1280 px la barra de la PLANTA BAJA de ese expediente se sale 171 px de su
tarjeta **también sin el botón nuevo** (la tira «Vivienda» con cuatro zonas ensancha la tarjeta): es
anterior y queda pendiente.

### La revisión de diseño (09/10/2026, antes de desplegar)

Un revisor de diseño independiente lo dio por **NO APTO** con cuatro fallos de dibujo, corregidos
antes de subir:

- **REGLA — los iconos se pintan en DOS pasadas: primero las líneas de los corridos, después los
  iconos.** En una, la línea del equipo nuevo tapaba la LLAMA de la caldera que tiene debajo, y sin la
  llama las dos solo se distinguían por el rojo y el verde (lo que no ve un daltónico). Vale para la
  pantalla (`MarcasEquipos`) y el PDF (`marcasEquiposSvg`).
- **REGLA — los iconos entran en la pasada de rótulos como obstáculos FIJOS** (`equipos` de
  `colocarRotulosPlano`, regla 128.b): se colocan los primeros y los nombres de pared y las cotas se
  apartan o se esconden. Sin eso volvían cuatro solapes («FBSO3» bajo «Nuevo»). La maqueta de los
  iconos es UNA (`marcasDelPlano` + `cajaDeMarca`): la usan el dibujo y la pasada, así miden lo mismo.
- **REGLA — el rótulo de un faldón («sobre planta 1») va en su polo de inaccesibilidad y, si ahí hay un
  icono, debajo de su rótulo** (`sitioRotuloFaldon`), con halo: en el centroide quedaba tapado por la
  unidad exterior, que es justo donde uno pulsa.
- **REGLA — los colores son tokens propios, `--equipo-*` en `index.css`, más oscuros en el tema claro.**
  Con `--success` el rótulo «Nuevo» se quedaba en 2,0:1 sobre blanco; ahora icono ≥ 3:1 y rótulo
  ≥ 4,5:1 en los dos temas. El PDF usa los del tema claro.

Y de lo opcional: la teja del PDF va en VECTORIAL (hileras de arcos recortadas a cada faldón con
`clipPath`: un `<pattern>` Chrome lo rasteriza a 72 ppp y al imprimir era un punteado), el tejado más
bajo va más claro, los sitios se escriben «Planta baja / Planta 1 / Cubierta» (el motor dice «PLANTA
BAJA»), los rótulos del PDF se corren lo bastante para no leerse como uno, la leyenda de cada hoja
lleva solo SUS equipos, la tira usa botones de 28 px con `aria-pressed` y una ✕ de 28 px, y la letra de
los rótulos en pantalla sube a 0,9 em. Queda pendiente decir en la tabla la pared más cercana.

### Y de paso, en el croquis PDF

- **El LOGO es el nuevo del kit de marca** («BROKERGY · INGENIERÍA ENERGÉTICA»). El del kit mide
  8000 × 1600 px (880 KB); en `backend/plantillas/marca/logo_horizontal_negro.png` va reducido a
  1600 × 320 en gris con alfa (62 KB, menos que el anterior). Lo usa también el PDF de la Guía de
  Transmitancias (`scripts/guia_transmitancias.mjs`) la próxima vez que se genere.
- **El cuadro de cerramientos se reparte por ALTO, no por número de filas.** Con 34 filas por hoja, un
  nombre largo («FBNE6 ESPACIO_LIBRE_PARCELA») y la planta («PLANTA / BAJA») partían en dos líneas: en
  26RES060_226 las últimas filas quedaban bajo el pie o fuera de la hoja —un cuadro de auditoría con
  cerramientos que no se ven—. La planta va sin partir (`td.nw`) y cada fila cuenta lo que mide
  (medido en el PDF: 6,7 mm una línea, 10,5 dos; un nombre de más de 25 caracteres cuenta como dos),
  con 212 mm útiles por hoja. Se queda corto a propósito: mejor una hoja con hueco que una fila cortada.
