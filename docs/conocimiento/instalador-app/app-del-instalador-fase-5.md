# La app del INSTALADOR, fase 5: pulida, recordando dónde estás, instalable y con su marca (2026-11-21)

## La app del INSTALADOR, fase 5: pulida, recordando dónde estás, instalable y con su marca (2026-11-21)

La última fase antes de publicarla con RCA (Fran lo aprobó el 21/11/2026). Cuatro cosas: (1) la
dirección dice dónde estás, así que **recargar, «atrás» y un enlace directo** te dejan donde tocaba;
(2) **sin conexión o con el servidor caído**, un aviso claro y «Volver a intentarlo», nunca una pantalla
en blanco ni ceros; (3) **instalable** en la pantalla de inicio, solo para quien está en la beta; (4) **su
marca**: su logo, su nombre «con BROKERGY» y su color en lo que marca «dónde estoy». Además, el pulido
de punta a punta medido en el banco y el teclado en el PC. La hoja para publicarla, aparte:
«Publicar la app del INSTALADOR».

| Pieza | Dónde |
|---|---|
| La dirección (leer, escribir, solo cinco claves) | [ui/direccion.js](implementation/frontend/src/features/instalador/ui/direccion.js) |
| El historial, abrir desde la dirección, «No lo encontramos» | [AppInstalador.jsx](implementation/frontend/src/features/instalador/AppInstalador.jsx) |
| La dirección y el historial con los que se CARGÓ la página | [App.jsx](implementation/frontend/src/App.jsx) (`direccionDeCarga`) → `HostInstalador` |
| El manifest, el color de la barra, el aviso de instalar | [ui/cabeceraApp.js](implementation/frontend/src/features/instalador/ui/cabeceraApp.js) y [public/instalador/](implementation/frontend/public/instalador/manifest.webmanifest) |
| «Ponla en tu pantalla de inicio» | [ui/Instalar.jsx](implementation/frontend/src/features/instalador/ui/Instalar.jsx) |
| El color de la marca con contraste AA | [ui/marca.js](implementation/frontend/src/features/instalador/ui/marca.js) |
| La cabecera con su marca, «Ir al contenido», «Sin conexión», el globo de «Te toca» | [MarcoInstalador.jsx](implementation/frontend/src/features/instalador/MarcoInstalador.jsx) |
| Hojas con teclado (`useHojaTeclado`), sin red (`useEnLinea`, `AvisoError`) | [ui/piezas.jsx](implementation/frontend/src/features/instalador/ui/piezas.jsx) |
| El test | [test_navegacion_instalador.mjs](implementation/backend/scripts/test_navegacion_instalador.mjs) |

### 1. La dirección dice dónde estás

**REGLA — en la dirección viajan SOLO `seccion`, `obra`, `accion`, `cliente` y `equipo`, cada uno con su
forma; nunca un nombre, una dirección, un DNI ni un token.** El nº de la obra es el que ya sale en la app
y en los papeles; el cliente va por su id interno. Lo que no casa con su forma se ignora al leer y no se
escribe (el test lo prueba con nombres, correos, ids largos y `<script>`). El resto de la dirección (lo
de quien nos aloja, `op`; los parámetros del banco) no se toca.

```
/?seccion=obras&obra=26RES060_OP901&accion=cifo
/?seccion=clientes&cliente=<id_cliente>
/?seccion=catalogo&equipo=101
/?seccion=pagina
```

- **Cada ficha es una entrada del historial CON su dirección** (`pushState` con `iaFicha`: 1 = ficha,
  2 = acción, la `pila` de la fase 2). Lo demás (cambiar de pestaña, filtrar) **reemplaza** la entrada:
  «atrás» no recorre las pestañas, cierra lo abierto.
- **Recargar** con una ficha abierta la vuelve a abrir **sin empujar más** (el historial ya tiene sus
  entradas: `history.state.iaFicha`), así que «atrás» sigue funcionando igual.
- **Un enlace directo** («mira esta obra»: `/?obra=…`) convierte la entrada actual en la de la sección
  y empuja la ficha encima: «atrás» vuelve a la lista de Obras, **no fuera de la app**.
- **Tras iniciar sesión** también: `App.jsx` guarda la dirección con la que se cargó la página
  (`direccionDeCarga`) ANTES de que su propio efecto de la URL la reescriba, y se la pasa a la app.
  Para los demás usuarios ese efecto no cambia (la rama de la app del instalador va aparte).
- Una obra **sin expediente** se abre en la página de su oportunidad (`op`), como al pulsarla.
- Lo que no está (una obra que no es suya, que ya no sigue, un id roto): aviso ámbar «**No lo
  encontramos.** Esa obra no está entre las tuyas, o ya no sigue en marcha» con «Entendido». Nunca un 404
  en blanco; tampoco se confirma si la obra existe de otro.
- **Lo que NO hace:** «adelante» no vuelve a abrir la ficha (la `pila` solo sabe cerrar; en el móvil no
  hay botón «adelante»). Y tras recargar, «atrás» desde la ficha lleva a la lista de esa sección, no a la
  pantalla de antes de abrirla.

### 2. Sin conexión o con el servidor caído

**REGLA — sin red o con la BD caída, la app lo DICE y deja reintentar; nunca una pantalla en blanco ni
una cifra a cero** (como la regla 38 en el backend).

- Sin conexión (`navigator.onLine` y los eventos `online`/`offline`, `useEnLinea`): franja ámbar «Sin
  conexión: lo que ves puede no estar al día» bajo la cabecera, y donde algo no pudo cargar, «**No tienes
  conexión**» en vez de «ahora mismo no podemos». **Al volver la cobertura, la app vuelve a pedir todo
  sola** (y el aviso de error se reintenta solo).
- Con el servidor caído (503) o cualquier fallo: el `AvisoError` de siempre, con «Volver a intentarlo».
  La lista conserva lo que ya tuviera.
- En el panel de una obra del PC que no carga, las cifras salen «—», no «…» para siempre.

### 3. Instalable, solo para la beta

**REGLA — el manifest, el color de la barra y el icono de la app del instalador se ponen SOLO al montar
su app ([ui/cabeceraApp.js](implementation/frontend/src/features/instalador/ui/cabeceraApp.js)) y se
quitan al desmontarla; `index.html` sigue con el de todos.** Así el equipo interno, el partner fuera de
la beta, el distribuidor y el certificador ven exactamente lo de antes (el test lo comprueba: ni
`index.html` ni `App.jsx` ni `main.jsx` lo tocan).

- `public/instalador/manifest.webmanifest`: `standalone`, vertical, fondo y barra **crema** `#faf9f7`
  (la pantalla de arranque sale crema), `start_url` `/?seccion=inicio` (sin datos), iconos de siempre +
  dos **maskable** con margen (Android los recorta en círculo) y `apple-touch-icon` opaco en crema.
- **Sin service worker**: no hace falta para instalarla (Chrome la ofrece con el manifest; comprobado
  en Chrome sin pantalla, que llega a dar el aviso `beforeinstallprompt`) y uno mal hecho cachea la API.
  Lo único «sin red» es el aviso de arriba.
- «**Ponla en tu pantalla de inicio**», una tarjeta discreta al final de Inicio: solo en el MÓVIL
  (puntero táctil y < 1024 px), no si ya está instalada (`display-mode: standalone`), y «Ahora no» la
  quita para siempre en ese navegador (`localStorage`, con try/catch: si falla, simplemente vuelve). Con
  el aviso de Chrome (Android), «Ponerla» la instala; si no, «Ver cómo» con los pasos: iPhone (Safari →
  Compartir → «Añadir a pantalla de inicio») o Android (⋮ → «Instalar aplicación»). En iPhone siempre los
  pasos (no tiene ese aviso).

**El nombre y el icono de la app instalada son los de BROKERGY para todos («BROKERGY · Tus obras con
ayuda» / «BROKERGY»).** Se estudió uno por instalador y no se hace: el manifest lo pide el navegador
**sin la sesión** de la app (va en una cookie que no tenemos: la sesión es un token en el navegador), así
que serviría el de cada instalador a cualquiera que adivine su id, o habría que meter un token en la
dirección del manifest; el icono necesitaría su logo en PNG cuadrado de 192 y 512 px (hoy es lo que
subió, de cualquier forma); y en iPhone solo se podría cambiar el título, no el icono, con lo que en cada
móvil saldría una cosa. Su marca sí está DENTRO de la app (punto 4).

### 4. Su marca: logo, nombre «con BROKERGY» y su color

- **Cabecera**: con logo, su logo (40 px) + su nombre + «con BROKERGY»; sin logo, el de BROKERGY como
  hasta ahora. El nombre no se corta con «…»: pasa a dos líneas. El avatar, siempre sus iniciales.
- **Su color** (`landing_color_primary` de su ficha, el de su landing) pinta SOLO lo que marca «dónde
  estoy»: la casilla activa de la barra de abajo y del menú lateral. **La acción principal de cada
  tarjeta sigue en naranja** (estilo «carta de pago»: su marca no compite con «lo que te toca»).

**REGLA — su color solo se usa si pasa AA (4,5:1) sobre los TRES fondos donde va (blanco, crema y el gris
de la casilla activa); si no, se oscurece un poco y, si ni así, se queda el de BROKERGY**
([ui/marca.js](implementation/frontend/src/features/instalador/ui/marca.js)). Parte de la variante para
papel claro de `partnerTheme.js` (`--accent-text-claro`). Medido: el azul de RCA (`#033598`) se usa tal
cual (9,3:1 en el peor fondo); un amarillo `#ffd400` se oscurece hasta pasar.

### 5. Pulido de punta a punta

- **Teclado en el PC**: «Ir al contenido» es lo primero al pulsar Tab (y lleva al `<main>`); el foco se
  ve siempre; las hojas (cuenta, precio, fotos, subir) meten el foco dentro, no lo dejan escapar con Tab,
  se cierran con Escape y lo devuelven al botón que las abrió (`useHojaTeclado`).
- **«Te toca», coherente**: Inicio dice «Hoy tienes **5 cosas** que hacer en 4 obras» cuando no
  coinciden (una obra con dos cosas); el filtro «Te toca» de Obras, el globo del menú (barra y lateral) y
  la cifra «te esperan» de Inicio cuentan OBRAS, las mismas.
- Textos: «Nuevo» → «Nuevo cliente»; en «Se quitó» no sale una
  marca de relleno (OTRA, desconocida…); el motivo de una foto rechazada no acaba en «.».»; los nombres
  de empresa conservan «S.L.», «S.A.», «C.B.» en mayúsculas.
- Las etiquetas de las fotos («PUBLICADA», «EN REVISIÓN») se cortaban 2 px a 360 px: ahora caben (pasan
  a dos líneas en la foto pequeña). Los pasos de instalar van numerados. El hueco bajo «Ver todas las
  obras» se compensa sin bajar del objetivo de 44 px.

### Lo medido (21/11/2026, banco `instalador-demo-5187`, Chrome sin pantalla)

- **120 pantallas** (40 estados del banco × 360, 390 y 1280 px, animaciones terminadas): **sin scroll
  horizontal, sin errores de consola, ningún objetivo táctil por debajo de 44 px, ningún texto cortado y
  nada fuera de la pantalla** (medido con JS: `scrollWidth`, `getBoundingClientRect`, `text-overflow`).
  Las casillas de radio y check se miden por su etiqueta, que es lo que se pulsa (≥ 44 px).
- Teclado y navegación: 18 comprobaciones (saltar al contenido, foco visible, hojas con Tab y Escape,
  recargar con la obra y con la acción abiertas, «atrás» paso a paso, la URL sin el nombre del cliente).
- 50 capturas (42 a 390×844 y 8 a 1280×800) en la carpeta de notas de la sesión.

Banco: `?marca=1` (logo y color azul), `?marca=claro` (un amarillo, se oscurece), `?instalar=iphone|
android` (la invitación en el PC), `?sinred=1` (sin conexión; `__volverRed()` en la consola la devuelve),
y las claves de la dirección (`?obra=…&accion=…`, `?cliente=…`, `?equipo=…`, `?seccion=…`).

### Lo que no se ha podido comprobar

- Con una sesión de verdad: el enlace directo tras iniciar sesión, el globo con datos reales.
- La instalación en un iPhone y un Android de verdad, el color de la barra y la pantalla de arranque.
- `navigator.share` en un móvil (desde la fase 3).
- Que el nginx del VPS sirva el `.webmanifest` con su tipo.

### Lo que trajo `main` y lo que no

Se mezcló `origin/main` (dos commits del contestador; solo chocaba el `INDICE.md` generado). **El alta
del partner (regla 217, commit `254cd747`) NO está en `main`**, así que no se trajo: cuando entre,
chocará en `.claude/rules/calculo.md`, `.claude/rules/placas-catalogos.md`, `docs/conocimiento/INDICE.md`,
`routes/oportunidades.js`, `scripts/test_rutas_sin_sesion.js`, `App.jsx`, `LandingFunnelView.jsx` y
`ReformaSubFlow.jsx`. `cuentasCliente` sigue en `utils/appInstalador.js`, en un solo sitio.
