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
- lo que aun así no sube queda en `pendientes` (en memoria, por apartado), y el apartado enseña el
  aviso y **«Reintentar (N archivos sin subir)»**, que manda los mismos ficheros sin repetir la foto;
- con fotos subiendo o pendientes, salir de la página (`beforeunload`) pide confirmación.

Los ficheros del `input` se copian ANTES de vaciarlo: vaciar `value` vacía también su `FileList`.

Lo que **no** cubre: los pendientes viven en memoria. Si Safari descarta la pestaña en segundo plano
(memoria, horas con el móvil bloqueado) se pierden. Para eso haría falta una cola en IndexedDB.

Probado en la demo haciendo fallar el envío como un «Network Error»: de tres fotos, la 2.ª fallaba
sus cuatro intentos → subían la 1.ª y la 3.ª, la 2.ª quedaba con «Reintentar» y al pulsarlo subía
(3 ✓). La reducción ya existente sigue igual: una JPEG de 4032×3024 de 8,2 MB salió a 2,0 MB.

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
- `100dvh`, `safe-area-inset` y las hojas con `createPortal` ya estaban bien.

### Lo que se queda para el ordenador

Firmar (AutoFirma) y presentar en la sede de la JCCM (certificado electrónico) no se hacen desde el
iPhone. En el móvil, «Ver, validar y firmar» sigue enseñando «Firmar con AutoFirma» sin avisar de que
allí no va: pendiente de decir «fírmalo en el ordenador» en pantallas táctiles.

### «Añadir a pantalla de inicio»

`certificadores.html` lleva `apple-mobile-web-app-capable`, el `apple-touch-icon` (180 px, opaco) y el
manifest con `display: standalone` y `start_url: /panel`; en producción cargan los tres (el manifest
sale con `Content-Type: application/octet-stream`, que los navegadores aceptan). No hay service
worker. En iOS la app instalada **no comparte la sesión con Safari**: se entra de nuevo, mejor con
email y contraseña (el enlace por email se abre en Safari, no en la app instalada).
