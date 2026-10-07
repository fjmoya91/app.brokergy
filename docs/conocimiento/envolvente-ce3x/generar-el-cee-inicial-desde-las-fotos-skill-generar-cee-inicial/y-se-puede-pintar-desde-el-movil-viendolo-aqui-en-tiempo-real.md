<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)»; la introducción y el resto, en esta misma carpeta.

### Y se puede PINTAR DESDE EL MÓVIL, viéndolo aquí en tiempo real (2026-09-29)

Botón **📱 Pintar desde el móvil** (en la barra de zonas de cada plano, y «📱 En el móvil» dentro del
modo croquis): sale un popup con un QR, el teléfono abre la planta (`/croquis-movil/:token`) y se
rodea con el DEDO lo que no es vivienda. Cada trazo —también el que va a medias— aparece en el plano
del ordenador según se pinta, con la marca del dedo. El popup se cierra solo en cuanto el teléfono se
conecta: lo que hay que mirar es el plano.

| Qué | Dónde |
|---|---|
| La sesión (memoria, token, espera larga, resultado) | [croquisMovil.js](implementation/backend/services/croquisMovil.js) (reutiliza `basesParaMovil` de `firmaMovil`) |
| Rutas del ORDENADOR (sesión) | `POST /api/cee-envolvente/:id/croquis-movil` · `GET …/:token/esperar?v=` · `POST …/:token/resultado` · `DELETE …/:token` |
| Rutas del TELÉFONO (públicas, por token) | `GET /api/public/croquis-movil/:token` · `…/estado` · `POST …/:token` · `POST …/:token/ajustar` |
| Espejo en el ordenador | [useCroquisMovil.js](implementation/frontend/src/features/cee-envolvente/logic/useCroquisMovil.js) + `CroquisMovilModal` |
| Lo que ve el teléfono | [CroquisMovilView.jsx](implementation/frontend/src/features/cee-envolvente/views/CroquisMovilView.jsx) |
| Prueba | `node implementation/backend/scripts/test_croquis_movil.js` |

**REGLA — es TIEMPO REAL, no una encuesta.** El ordenador deja abierta una petición LARGA (`esperar`)
que el servidor contesta en cuanto el teléfono manda algo (medido: el trazo llega cada ~130 ms
mientras se pinta), o a los 20 s con lo que haya. El teléfono manda SIEMPRE el estado entero —trazos
terminados y el que va a medias—, así que un mensaje perdido lo corrige el siguiente.

**REGLA — al teléfono solo viaja la GEOMETRÍA de la planta**: paredes, zonas ya restadas, la
cartografía del Catastro (la pone el backend con la caché del plano) y los m² que Catastro declara por
uso. Ni titular ni dirección. La sesión queda atada a ESE expediente: con el token de otro, el
ordenador no lee nada.

**REGLA — el AJUSTE lo hace el ORDENADOR**, aunque lo pida el teléfono: es quien tiene el plano,
vuelve a medir y guarda el trabajo. El teléfono pide, espera y recibe cómo ha ido (con las zonas que
han salido, en SU lienzo, para poder corregir encima). Mientras hay sesión, en el ordenador NO se
pinta (lo de uno pisaría lo del otro), pero se puede ajustar desde allí y el teléfono se entera.

**REGLA — el teléfono pinta en el lienzo del momento en que se ABRIÓ** (`marco` = `lienzoAMundo`
de entonces) y el ordenador lo traslada al de ahora (`deltaLienzo`): al ajustar, el motor vuelve a
medir y puede re-encuadrar el lienzo (regla 79), y sin esto lo siguiente que se pintara caería
desplazado.

**Un dedo pinta, dos dedos mueven y amplían** (un segundo dedo a mitad de trazo lo descarta: era un
pellizco). La sesión dura mientras se use y caduca a los 30 min de silencio; se recuerda en el
navegador del ordenador, así que recargar la ventana no deja al teléfono pintando para nadie — y si
el ordenador deja de preguntar más de 45 s, el teléfono lo avisa.

⚠️ No se ha probado con un teléfono de verdad ni con la ventana del ordenador logueada: se probó con
las rutas REALES y la autenticación simulada, un «ordenador» que hace la espera larga y la página del
móvil en el navegador a 375 px con eventos de puntero (pintar, pellizcar, ajustar, resultado).

**REGLA — tras un ajuste, el teléfono recibe la planta RE-MEDIDA, paredes incluidas.** El ajuste
vuelve a medir la planta, y sin las paredes nuevas el móvil pintaba las zonas ajustadas sobre las de
antes (no aparecía, por ejemplo, la partición contra el garaje). El ordenador devuelve las paredes de la
geometría nueva y [croquisMovilPuente.js](implementation/frontend/src/features/cee-envolvente/logic/croquisMovilPuente.js)
las traslada a SU lienzo (`deltaLienzo(marcoNuevo, marco)`, porque el motor puede re-encuadrar); las
zonas vienen del mundo. La sesión las guarda en `plano` —no en `resultado`, que el teléfono consulta
cada 2,5 s— y el teléfono, al ver `remedido`, vuelve a pedir la planta. Un ajuste que no deja ninguna
zona también es `remedido` (la planta se ha quedado sin ellas). Pruebas:
`node implementation/backend/scripts/test_croquis_movil_puente.mjs` y `test_croquis_movil.js`.

**REGLA — vale también en TABLET, y en HORIZONTAL los mandos van a la derecha** (`landscape:`): debajo
le quitarían al plano la poca altura que hay. El tamaño base del dibujo es en PÍXELES (`TAM_PX`), no una
fracción del ancho: en una tablet el plano mide 900 px y con «ancho/28» las líneas salían el doble de
gruesas. Al cambiar de tamaño la caja, `alCambiarDeTamano`: si se ha GIRADO, se sigue viendo todo lo que
se veía; si es un cambio pequeño (la barra del navegador), misma escala y mismo centro — ajustar «para
que quepa» también ahí alejaría el plano un poco en cada vaivén.

**Y la FOTO de cada pared, desde el mismo enlace (2026-09-30).** Pestaña **«Fotos de paredes»** en el
teléfono: se toca una pared (un dedo MUEVE el plano en ese modo; la pared más cercana bajo el dedo,
radio de 26 px), se le hace la foto y queda pegada a ESA pared por las MISMAS funciones que la ventana
del ordenador (`paredFotoService`). En una **fachada** se leen sus huecos (`paredOcrService.leerFachada`,
con la pared —largo, alto, orientación— que tiene la SESIÓN, nunca la que diga el teléfono) y la
propuesta se **revisa en el teléfono**, sobre la propia foto con cada hueco numerado: mismo criterio que
`LecturaFotoModal` (todo marcado con la pared vacía; nada si ya tiene huecos, y «Quitar los N y poner
estos M» aparte). Al confirmar, lo **pone el ORDENADOR** (`pedirHuecos` → su espera larga →
[huecosDelMovil.js](implementation/frontend/src/features/cee-envolvente/logic/huecosDelMovil.js) →
`aplicaHuecosLeidos`, en ámbar por confirmar) y escribe la marca de la foto; el **uid lo fija el
teléfono**, así la marca y el hueco casan. En el plano del teléfono cada fachada dice si ya tiene foto
(✓ verde / + a trazos) y el panel ofrece «Siguiente fachada sin foto».
- **Uno cada vez y se RETIRA al contestar**: el pedido de huecos se borra de la sesión cuando el
  ordenador responde, así que recargar la ventana no los pone dos veces.
- **Lo que el ordenador sabe de las paredes le llega al teléfono** (`POST …/croquis-movil/:token/paredes`
  con nombre, tipo, si admite ventanas y cuántos huecos tiene; el teléfono lo pide al ver `paredesV`).
- **El token ya no solo pinta**: sube fotos a las paredes de ESA planta, ve las suyas y pide lecturas,
  con tope por sesión (`CROQUIS_MOVIL_MAX_SUBIDAS` 60 · `CROQUIS_MOVIL_MAX_LECTURAS` 40). Las
  candidatas del expediente (las que subió el cliente) no se ofrecen desde el teléfono.
- La foto se reduce en el teléfono a 2560 px (`prepararFoto`) y viaja con su relación de aspecto.
- El panel de la pared del ordenador se refresca solo (`envolvente:fotos`).
- Pruebas: `test_croquis_movil.js` (sesión), `test_foto_movil.mjs` (qué pared hay bajo el dedo).

**Y aguanta SIN COBERTURA (2026-09-30).** En un sótano o en un pueblo la señal va y viene, y
antes lo que se pintaba o fotografiaba en ese rato se perdía: un trazo solo se reenviaba con el
siguiente, una foto hecha con la cámara (que muchas veces no queda en la galería) moría con la
subida, y recargar la página sin red —Android la cierra a menudo al abrir la cámara— la dejaba
en blanco.

| Qué | Dónde |
|---|---|
| La bandeja de salida del teléfono (qué se guarda, cómo se reenvía, cómo se recupera) | [logic/bandejaMovil.js](implementation/frontend/src/features/cee-envolvente/logic/bandejaMovil.js) |
| Que la página ABRA sin red | [public/sw-croquis.js](implementation/frontend/public/sw-croquis.js) + [logic/swCroquisMovil.js](implementation/frontend/src/features/cee-envolvente/logic/swCroquisMovil.js) |
| Vida del enlace, `clave`/`marco` e idempotencia (`yaHecho`/`apuntarHecho`) | [croquisMovil.js](implementation/backend/services/croquisMovil.js) |
| Pruebas | `node implementation/backend/scripts/test_bandeja_movil.mjs` · `test_croquis_movil.js` |

**REGLA — todo se apunta PRIMERO en el teléfono y después se manda.** Lo pintado va a
`localStorage` por PLANTA; las fotos, a **IndexedDB** (son megas), con respaldo en memoria si el
navegador no deja; los huecos confirmados, a `localStorage`. Se manda solo al volver la red: la
consulta del estado (cada 2,5 s, con plazo de 8 s y sin apilarse) es la SONDA, y en cuanto
contesta sale lo pendiente. `pedir()` pone PLAZO a cada petición —con poca señal un `fetch`
puede colgarse minutos sin fallar— y trata un 502/503/504 como falta de red, no como respuesta.
Mientras tanto se sigue trabajando: se pinta, se hacen más fotos y el ajuste pedido espera
(«Seguir pintando» lo cancela).

**REGLA — un reenvío NO hace las cosas dos veces.** Sin cobertura se pierde también la
RESPUESTA, y el teléfono reintenta algo que sí llegó. Cada petición que cambia algo lleva su
`id_local` y el servidor lo recuerda por sesión: la foto no se sube dos veces, la lectura (de
pago) no se repite, los huecos no se ponen por duplicado —y un reenvío de huecos ya pedidos
devuelve el pedido de entonces en vez de «pendiente»— y el ajuste no se pide otra vez. Lo
pintado ya era idempotente: viaja siempre el estado entero.

**REGLA — el enlace no caduca mientras el ORDENADOR lo mira**, pero tiene TOPE. La espera larga
del ordenador renueva los 30 min (el teléfono puede pasar media hora sin poder decir nada) y
nunca más allá de `VIDA_MAXIMA_HORAS` (12) desde que se abrió: el token es toda la
autorización para subir fotos a un expediente real.

**REGLA — se guarda por PLANTA (`clave`), no por enlace.** El servidor da una `clave` estable
(un resumen de negocio + expediente + planta: no dice cuál es) y el `marco` del lienzo. Si el
enlace caduca con cosas sin mandar, la pantalla de «cerrado» lo DICE («queda guardado 1 zona
pintada sin enviar: pide otro QR y ábrelo aquí») y el siguiente QR de esa planta, en ese mismo
teléfono, ofrece recuperarlo —lo pintado se enseña en naranja y se TRASLADA a su lienzo
(`recuperarTrazos`: el motor re-encuadra al volver a medir); las fotos de la cola suben solas—.
Lo del enlace anterior se aparta como RESCATE para que el nuevo no lo pise mientras se decide.

**REGLA — la foto es una TAREA POR PARED**, y el panel de fotos ya no se desmonta al pasar al
croquis. Sin señal se fotografían varias fachadas seguidas: cada una sube, se lee y su propuesta
espera en SU pared («Ventanas por revisar», «!» violeta en el plano; «↑» ámbar lo que espera
cobertura). Una foto más nueva de la misma pared manda sobre la anterior, que ni se lee. Una
foto que el servidor NO acepta (pared que ya no existe, cupo) no se pierde: Reintentar · Guardar
en el teléfono · Descartar.

**REGLA — el service worker SOLO controla `/croquis-movil/`** (se registra con ese `scope`, solo
en la app construida y en contexto seguro): el resto de la app no pasa por él —comprobado—. Guarda
la página (red primero, 6 s), `/assets` y `/fonts` (lo guardado primero: llevan resumen), la
planta y la lista de fotos del enlace (red primero, copia si no contesta) y las fotos ya subidas;
nunca un POST ni el estado. Lo que la página cargó antes de que existiera se lo pasa por mensaje,
o la primera recarga sin red no abriría. Un 410 borra la copia de esa planta.

⚠️ Verificado de punta a punta con la app CONSTRUIDA y un servidor que usa el `croquisMovil.js`
real y corta la «cobertura» destruyendo cada conexión (la ven igual la página y el service
worker): 31 comprobaciones, incluidas recargar sin red, la respuesta de una subida perdida
(una sola foto en «Drive») y recuperar con otro QR. Lo que no se ha probado es un teléfono de
verdad en un sótano.

**Cómo se ve (revisión de diseño, 2026-09-30).** Lo que no hay que deshacer:
- **Móvil: el plano manda.** Cabecera en una línea, la instrucción como píldora SOBRE el plano (se
  quita al primer trazo) y la paleta de usos ABAJO, junto a los botones, al alcance del pulgar.
- **Jerarquía de líneas en el móvil:** la cartografía al 50 % y casi sin color (`feColorMatrix`
  saturate 0.2) para que sus rosas y verdes no se confundan con los usos; las paredes con un contorno
  blanco debajo y grosor en `tam` (no engordan al ampliar); lo YA marcado, rayado; el borrador,
  relleno suave; y lo que se va a sustituir, en fantasma mientras se pinta. En el ordenador, las
  zonas ya restadas también van en fantasma y sin rótulo durante el croquis.
- **Rótulos de mancha = rótulos de pared** ([EtiquetaMancha.jsx](implementation/frontend/src/features/cee-envolvente/components/EtiquetaMancha.jsx)):
  papel, texto en TINTA y la raya del color del uso, con los m² debajo. En el color del uso a secas no
  se leía (verde, ámbar y gris quedaban por debajo de 3:1).
- **El trazo en curso es un LAZO:** punto de inicio y línea discontinua de cierre, en los dos lados.
- **El croquis SUSTITUYE las zonas de la planta, y se DICE:** la pista del móvil lo avisa y ofrece
  «Partir de ahí» (carga lo ya marcado como manchas). «Borrar todo» en el móvil y la ✕ del ordenador
  con manchas sin ajustar piden un segundo toque.
- **«Tal cual» se llama «Solo enderezar»** en los dos lados (es lo que hace), y los m² del croquis van
  sin decimales (`textoCatastro` en `zonasFuera.js` quita además el «100%» que Catastro pega al uso).
- ⚠️ En tema claro `text-white` se vuelve oscuro: el chip oscuro sobre el papel del móvil y el
  «En directo» del plano llevan `croquis-chip` (index.css), y `bg-violet-600.text-white` está en la
  lista de excepciones. Un botón desactivado usa `disabled:opacity-40`, nunca `disabled:text-white/40`
  (en claro sale blanco sobre blanco).
