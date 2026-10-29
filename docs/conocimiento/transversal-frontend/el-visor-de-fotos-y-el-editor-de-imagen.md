<!-- conocimiento · área: transversal-frontend · las rutas de los enlaces son relativas a la raíz del repo -->

### El VISOR de fotos y el EDITOR de imagen (2026-10-29)

Las fotos de una obra se MIRAN: se busca el nº de serie en una placa, se
comprueba si la salida de humos entra donde dice el croquis, se repasan las
quince del expediente una detrás de otra antes de validarlas. Hasta hoy había
tres visores distintos y ninguno servía para eso:

| Dónde | Qué tenía |
|---|---|
| Gestor de documentación ([DocsManager.jsx](implementation/frontend/src/features/docs/DocsManager.jsx)) — oportunidad, expediente y enlaces públicos | zoom con la rueda (hasta 6×) y doble clic para reiniciar. Nada más: ni pasar de foto, ni arrastrar la foto ampliada, ni girar |
| Anexo Fotográfico ([AnexoFotograficoModal.jsx](implementation/frontend/src/features/expedientes/components/AnexoFotograficoModal.jsx)) | dos botones de zoom… y **nadie lo abría**: `setZoomedPhoto` no se llamaba desde ningún sitio. La miniatura entraba directa al recorte |
| Placa del Anexo VI ([PlacaScopAcsBanda.jsx](implementation/frontend/src/features/expedientes/components/PlacaScopAcsBanda.jsx)) | no había visor; solo el recuadro de recorte |

Y el editor era en los tres sitios el mismo `ReactCrop` pelado: arrastrar las
esquinas y «Aplicar recorte». Una foto que llega TUMBADA (el móvil pierde la
orientación al pasar por WhatsApp) o torcida no se podía arreglar en ninguna
pantalla de la app.

**REGLA — el visor es UNO: [components/VisorFotos.jsx](implementation/frontend/src/components/VisorFotos.jsx).**
Quien tenga que enseñar una foto en grande lo usa; no se vuelve a escribir un
lightbox. Recibe la LISTA de fotos (no una), el índice, y cuelga del pie los
botones que son de cada pantalla (`acciones`) y el paso al editor (`onEditar`).
Lo que trae de serie:

- **← →** pasan de foto (también Inicio/Fin y las flechas laterales), y el
  título dice de qué apartado es cada una, con el contador `3 / 12`.
- **Rueda** para ampliar HACIA EL CURSOR; **+ −** y **0** (ajustar) y **1**
  (tamaño real) por teclado; **doble clic** alterna ajuste ↔ 2,6× en el punto.
- Con zoom, la foto se **arrastra**, y no se puede escapar de la caja.
- **R** / **Mayús+R** giran 90°, **H** voltea: es para MIRAR, no toca el fichero.
  El encaje se recalcula al girar (a 90° el alto de la foto compite con el ancho
  de la caja), así que una foto vertical girada sigue cabiendo entera.
- **F** pantalla completa, descarga, tira de miniaturas, **Esc** cierra.
- **En el móvil**: pellizco para ampliar, un dedo para arrastrar o **deslizar**
  para pasar de foto, y los botones en DOS filas —arriba lo que se hace con la
  foto, abajo los controles—, porque en una sola fila no caben a 375 px y lo
  importante se quedaba fuera de pantalla.

**REGLA — el editor es UNO: [components/EditorImagen.jsx](implementation/frontend/src/components/EditorImagen.jsx), y tiene DOS modos.**
No es un detalle de implementación: son dos contratos distintos de la casa.

- `modo="pixeles"` devuelve la imagen ya modificada (data URL) → **Anexo
  Fotográfico**, cuyo PDF se monta con lo que el usuario ha tocado a mano
  (fila `recortada`).
- `modo="recuadro"` devuelve `{x, y, w, h, ar}` en % sobre la foto ORIGINAL →
  **placa del Anexo VI** (regla 60): el original sigue entero en Drive, el
  recorte se deshace y el certificado sale igual generándolo desde el backend.
  Por eso ahí **no se gira ni se voltea**: lo que se guarda es el encuadre, y el
  documento no sabría deshacer un giro. Girar la placa pide guardar también el
  ángulo y que `placaImgHtml` lo aplique; mientras eso no esté, no se ofrece.

⚠️ **El giro se aplica a los PÍXELES antes de recortar.** El editor rehace la
imagen de trabajo en un canvas (giro + volteo) y el recuadro se arrastra sobre
ESA imagen: lo que se ve es lo que sale, y no hay que convertir coordenadas.
El fondo que queda al enderezar se rellena en **blanco**, no en negro: estas
fotos acaban en un PDF sobre papel blanco.

⚠️ **`makeAspectCrop` SIN relación de aspecto devuelve altura 0** — solo sabe
deducirla de una proporción. Con el recuadro inicial puesto así, aceptar sin
tocar las esquinas guardaba un recorte de alto CERO (en la placa: una banda
vacía en el certificado). Sin proporción, el recuadro de salida se pone a mano
(5 %, 5 %, 90 %, 90 %).

⚠️ **El velo lleva el color puesto a mano** (`rgba(0,0,0,0.985)`) y el visor va
**portaleado a `document.body`** (regla 29.b): abierto desde un modal con
`backdrop-filter`, un `fixed` se ancla a ESE modal y el visor salía recortado a
su caja.

⚠️ **La imagen no se desvanece al entrar y reporta su tamaño también desde la
CACHÉ** (`ref` + `onLoad`): con el fundido, volver a una foto ya vista daba un
parpadeo en blanco, y una imagen que se monta ya completa no dispara `onLoad`.

⚠️ **El tamaño de la foto se guarda CON SU CLAVE, y no se pone a cero en un
efecto** (revisión del mismo día). La primera versión lo reiniciaba en un
`useEffect` al cambiar de foto, y una imagen en caché lo reporta desde su `ref`,
en el commit, ANTES de que corran los efectos del visor: el efecto lo borraba
justo después y volver a una foto ya vista la pintaba a tamaño real (salía
«100 %»). Mientras el tamaño no se conoce, la foto se limita a la caja.

⚠️ **El clic sobre la FOTO no cierra; solo el clic en el fondo.** La envoltura de
la imagen no recibe eventos (el gesto es de la caja), así que el `target` es
siempre la caja y se decide por geometría (`sobreLaFoto`). La primera versión
cerraba con cualquier clic, y por eso el doble clic nunca llegaba a ampliar.

⚠️ **La caja no captura el puntero si se pulsa un BOTÓN** (las flechas,
«Reintentar»): Chrome entrega el `click` al elemento que tiene la captura, y
las flechas laterales no hacían nada.

⚠️ **El teclado va en fase de CAPTURA y no se propaga** (visor y editor), como
ya hacía `VisorDocumentosEnvio`: debajo hay quien también escucha (las flechas
pasan de módulo en el expediente, Esc cierra el modal de detrás) y una tecla no
puede hacer dos cosas. Con Ctrl/Alt/Cmd no se toca nada (Ctrl+R recarga). En el
editor, Intro con el foco en un botón es de ese botón (con «Cancelar» enfocado,
aplicaba).

⚠️ **El editor se cancela solo si el clic EMPIEZA y acaba en el fondo**: al
soltar fuera del diálogo el arrastre de una esquina, el `click` caía en el fondo
y se perdía lo hecho (ya pasaba con el editor antiguo). Y el **deslizador de
enderezar no rehace el lienzo en cada paso** —con una foto de móvil cada paso es
un JPEG de 4000 px—: gira por CSS mientras se arrastra y aplica al parar
(220 ms).

⚠️ **La descarga de una foto de Drive enlaza a Drive solo para el ADMIN**
(regla 1): el gestor lo abren también el cliente y el instalador por su enlace;
los demás bajan la copia del proxy, que es la que están viendo.

⚠️ **El respaldo de URLs se reinicia con la `key`, no con un efecto.** El padre
reconstruye el array de fuentes en cada render, y un `useEffect` que dependiera
de él entraba en bucle (reset → carga → reset). Las fuentes de Drive siguen el
orden de la regla 18: proxy propio primero, `lh3` y `thumbnail` después.

**Dónde está enchufado**

- El gestor de documentación abre el visor con **todas las fotos de la fase**
  (ANTES o DESPUÉS), en el orden en que se ven: revisar una obra era abrir,
  cerrar y volver a la lista por cada foto. Validar, rechazar, cambiar y borrar
  se hacen **desde el visor**, mirando la foto; al borrar, sigue en la siguiente
  en vez de cerrarse. La foto que se mira se vuelve a buscar en `slots` en cada
  render, o el botón de validar enseñaría el estado viejo.
- En el Anexo Fotográfico, la miniatura de la fila abre el VISOR (y desde él se
  entra a editar); la tijera sigue entrando directa al editor.

**Banco de pruebas**: `http://localhost:PUERTO/visor-prueba.html`
([src/demo/visorPrueba.jsx](implementation/frontend/src/demo/visorPrueba.jsx)) —
fotos de mentira con las tres formas (apaisada, vertical, cuadrada) para
comprobar el teclado, la rueda, el giro y los dos modos del editor sin tocar un
expediente de verdad. **No entra en el build**: `vite build` solo toma
`index.html` como entrada.
