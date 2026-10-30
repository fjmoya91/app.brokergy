<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## El móvil en la visita: iPhone, fotos sin cobertura y el teclado (2026-10-30)

Antes de la primera visita real con la app en el iPhone 16 Pro Max de Fran (Safari, 440×956), se
recorrió la vista móvil de punta a punta en la demo (`?demo=1`, a 440×956 y a 375×812): alta de una
obra nueva, las cinco fases, las fotos, la obra pedida, «Documentos» y «Presentar». Hasta entonces
todo se había mirado a 375 px, nunca en el flujo completo.

### Las fotos suben una a una y lo que no sube se guarda

Lo que había: cada vez que se elegían fotos, **toda la tanda iba en UNA petición**. Si la
cobertura caía a mitad (sótanos, cuartos de calderas), fallaba entera y no se reintentaba. Y una foto
hecha con «Hacer foto» (`<input capture>`) **no queda en el carrete** del iPhone ni, en general, en la
galería de Android: si no sube, hay que volver a hacerla, y a veces ya se ha salido de la casa.

Ahora ([useObra.js](implementation/frontend/src/certificadores/obra/useObra.js), `subir`):

- **una petición por fichero**, en serie: lo que sube se queda aunque falle lo siguiente;
- sin respuesta (sin red), 5xx, 429, 408 o 401 → **se reintenta solo** tres veces (1,5 s, 4 s y 9 s).
  El 401 entra porque al volver de la cámara Supabase renueva el token al ponerse la página en primer
  plano: tras la espera la petición sale con el nuevo;
- lo que aun así no sube queda en `pendientes` (por apartado), y el apartado enseña el aviso,
  **«Reintentar (N archivos sin subir)»**, que manda los mismos ficheros sin repetir la foto, y
  **«Olvidar»**, que los borra;
- con fotos subiendo o pendientes, salir de la página (`beforeunload`) pide confirmación.

Los ficheros del `input` se copian ANTES de vaciarlo: vaciar `value` vacía también su `FileList`.

**Y se guardan EN EL MÓVIL** ([colaFotos.js](implementation/frontend/src/certificadores/obra/colaFotos.js),
IndexedDB `certapp_cola`): cada foto, ya reducida, se apunta ANTES de mandarla y se borra al subir (o
si el servidor la rechaza: reintentarla no lo arregla). Safari descarta la pestaña en segundo plano
(la cámara, horas con el móvil bloqueado) y lo que solo estaba en memoria se perdía; ahora, al volver
a abrir la obra, lo que no llegó sale en su apartado como «N archivos guardados en este móvil sin
subir», con «Reintentar». Lo ya apuntado no se reduce otra vez. Un vídeo de más de 60 MB no se copia
(llenaría el espacio del navegador): ese sigue solo en memoria. Si IndexedDB no está (navegación
privada, sin espacio), todo funciona como antes, en memoria: nada de la cola puede romper una subida.
La cola es de ESTE navegador: en otro móvil, o en la app instalada en la pantalla de inicio (que en
iOS tiene su propio almacenamiento), no se ve.

Probado en la demo haciendo fallar el envío como un «Network Error»: de tres fotos, la 2.ª fallaba
sus cuatro intentos → subían la 1.ª y la 3.ª, la 2.ª quedaba con «Reintentar» y al pulsarlo subía
(3 ✓). La cola: dos fotos sin red → dos filas en IndexedDB; recargada la página, el
apartado las enseña con «Reintentar» y, con red, suben (2 ✓) y la cola queda vacía; «Olvidar» la
vacía también. La reducción ya existente sigue igual: una JPEG de 4032×3024 de 8,2 MB salió a 2,0 MB.

### Varias fotos en TODOS los apartados, también la caldera (30/10/2026)

Fran: «en las fotos de la caldera no me deja subir varias, me las cambia». Caldera, aerotermia,
termo y sus tres placas eran apartados de UNA foto: la galería solo dejaba elegir una y cada foto
nueva mandaba la anterior a la papelera. Ahora llevan `multiple: true` en `SLOTS`
([cuestionario.js](implementation/frontend/src/certificadores/logic/cuestionario.js)): se AÑADEN,
y desde la galería se eligen varias a la vez. La lectura de la placa ya tomaba hasta tres fotos
(`cee_inicial.js placasExt`), y la de la aerotermia pedía expresamente «la del depósito si es aparte».

**REGLA — ninguna foto sustituye a otra**: todo apartado de fotos es `multiple`; lo vigila
`test_certapp_unidad.js`. Lo que se mantiene con `unaBasta: true`: si el certificador ya subió una,
el enlace del PROPIETARIO la da por `cubierta` y no le deja subir otra (`docs.js`). En un encargo de
BROKERGY se traen del CRM todas las fotos del apartado, no solo la última (`crm.js fotosDelCrm`).

### iPhone: lo que se ha comprobado en el código

- **Cámara y galería**: «Hacer foto» lleva `capture="environment"` (abre la cámara directa, una foto
  por vez aunque lleve `multiple`); «De la galería» no lleva `capture`, así que en iOS ofrece
  Fototeca, Hacer foto o Archivos, con selección múltiple.
- **HEIC**: con `accept="image/*"` iOS entrega JPEG (convierte al elegir). Un Android que guarde en
  HEIF lo manda tal cual: no se reduce (el navegador no lo decodifica) y el servidor lo admite por sus
  bytes (`tipos.detectar`).
- **Zoom al escribir**: iOS amplía la página al enfocar un campo de menos de 16 px. Estaban por debajo
  el buscador de «Mis obras» (`.ca-buscar input`, 15 px) y, en el visor de PDF, la página y el zoom;
  ahora 16 px. `.ca-input` ya tenía 16.
- **Teclado**: con un campo enfocado en un móvil (`pointer:coarse`), la barra de abajo de las fases
  (`.ca-inf`) y los botones flotantes se ocultan; en iOS se quedaban encima del teclado tapando el
  campo.
- **Referencia catastral**: `autoCapitalize="characters"` y sin autocorrección.
- **Los botones flotantes** (incidencias y asistente) tapaban a 375–440 px «Es correcto» del alta,
  «Ver» del croquis en Documentos y el valor de la fase 1: en el móvil (<700 px) se apartan al BAJAR
  la página y vuelven al subir o arriba del todo (`useApartarAlBajar`, [Flotantes.jsx](implementation/frontend/src/certificadores/widgets/Flotantes.jsx)).
  El final de la página ya tenía su hueco (`.ca-con-fabs`).
- **«La siguiente» a la vista**: en la fase de fotos a 375 px, la cabecera, las tres fases hechas
  (una por línea) y el índice dejaban la tarjeta bajo la barra de abajo. En el móvil, con dos o más
  fases detrás, van en UNA fila de botones pequeños (`FasesPlegadasMovil`, [Fases.jsx](implementation/frontend/src/certificadores/obra/Fases.jsx)),
  y al entrar en una fase que no es la primera la página baja hasta ella (con `window.scrollTo`
  calculado: `scrollIntoView` no mueve el índice, que es `sticky`; y en un `setTimeout`, para ir
  después del «arriba del todo» de `navegar`).
- **Fase 1**: la referencia y la zona climática salían dos veces (el resumen del Catastro y el de
  `Inmueble`); `Inmueble` lleva `sinDatos` ahí y el uso pasa al resumen.
- **«Hacer foto»** abre la cámara para UNA foto (iOS y Android): la visita guiada ya no dice «puedes
  hacer varias seguidas».
- `100dvh`, `safe-area-inset` y las hojas con `createPortal` ya estaban bien.

### Lo que se queda para el ordenador

Firmar (AutoFirma) y presentar en la sede de la JCCM (certificado electrónico) no se hacen desde el
iPhone. En una pantalla táctil (`pointer: coarse`), el pie del visor de «Ver, validar y firmar» dice
que AutoFirma va en el ordenador y que se firme luego desde el PC; el botón se deja (un Android con el
cliente @firma podría abrirlo).

### «Añadir a pantalla de inicio»

`certificadores.html` lleva `apple-mobile-web-app-capable`, el `apple-touch-icon` (180 px, opaco) y el
manifest con `display: standalone` y `start_url: /panel`; en producción cargan los tres (el manifest
sale con `Content-Type: application/octet-stream`, que los navegadores aceptan). No hay service
worker. En iOS la app instalada **no comparte la sesión con Safari**: se entra de nuevo, mejor con
email y contraseña (el enlace por email se abre en Safari, no en la app instalada).
