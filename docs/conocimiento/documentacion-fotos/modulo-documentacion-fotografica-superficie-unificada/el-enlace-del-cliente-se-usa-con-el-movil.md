<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Módulo Documentación Fotográfica — Superficie unificada (2026-05-29)»; la introducción y el resto, en esta misma carpeta.

### El enlace del cliente se usa CON EL MÓVIL (2026-08-11)

`DocsManager` tiene dos caras y `clientView = mode === 'token'` las separa. El admin (PC, expediente
entero) conserva pestañas, densidad y validación. El cliente ve otra cosa:

- **Una sola lista, sin pestañas.** "Después de la obra" era una pestaña a la que había que
  acordarse de entrar, y lo que falta ahí es tan urgente como lo de antes.
- **Pero las dos fases NO se mezclan**: pedirle hoy la placa de la unidad exterior a quien no ha
  empezado la obra es darle una tarea imposible, y once tareas imposibles hacen que deje de mirar
  la lista. La fase activa (`obraEnMarcha`) va primera; la otra, detrás y diciendo cuándo toca.
- **Modo GUIADO por defecto: UN apartado en pantalla cada vez.** Siete tarjetas iguales producen
  parálisis en quien no se maneja — coge lo primero que entiende y hace solo eso. Salida siempre
  visible con "Ver todos los apartados", y desde la lista se vuelve con "Guíame paso a paso".
- **El recorrido lo componen TODOS los apartados de la fase activa, no solo los pendientes**
  (`recorrido`), para poder **volver atrás a ver la foto que ya se subió**. Antes, al subirla el
  apartado desaparecía de la cola y no había forma de volver a mirarla. Sobre un apartado ya
  resuelto la tarjeta enseña **su foto** en vez del ejemplo (pulsable → visor), lo dice
  ("✓ Ya nos la has enviado") y el botón pasa a "+ Añadir más".
- **La navegación tiene DOS mandos y una prioridad.** `pasoKey` es lo que el cliente elige con
  Anterior/Siguiente; mientras vale `null` manda el automático, que enseña el primer pendiente **por
  urgencia** (lo rechazado primero) y no por orden de lista. Al subir con éxito se vuelve a `null`:
  el apartado deja de estar pendiente y el siguiente aparece solo, sin índices que se desajusten.
  **"Siguiente" sobre algo aún pendiente APLAZA** (`saltados`), nunca omite: vuelve al final, y si
  se apartan todos la cola vuelve a empezar.
- **Acuse de recibo tras subir** ("✓ Recibida, gracias", 3,2 s). Sin él la tarjeta cambia sola al
  paso siguiente y no queda señal de que la foto haya llegado: quien no se maneja la vuelve a subir
  por si acaso, y nos llegan duplicados.
- **El cliente puede QUITAR una foto suya**, pero solo mientras está `subida` (pendiente de
  revisión): una ya validada forma parte del expediente. Es la pareja de "volver atrás" — mirar y no
  poder corregir es media función, y sin esto sube la buena encima y hay que adivinar cuál vale.
  Confirmación en dos pasos.
- **Un DOCUMENTO no lleva ilustración** (`SIN_ILUSTRACION`: `DOC_`, `VIDEO_`, `OTROS`). Una factura
  se entiende con su título; un dibujo de "una hoja con rayas" no añade nada y en un móvil ocupa
  media pantalla que debería estar viendo el botón. El pictograma se gana su sitio cuando enseña un
  ENCUADRE que se hace mal (la pegatina de cerca, el armario abierto); en un papel no hay encuadre.
  Excepción: `DOC_CEE_EXISTENTE` sí enseña la etiqueta energética, porque ahí el problema es que el
  cliente no sabe QUÉ PAPEL es — `SLOT_FOTO` manda sobre esa lista.
- **Cada paso lleva una FOTO DE EJEMPLO**, marcada "EJEMPLO" en una esquina (sin ese distintivo
  más de uno la toma por algo ya subido y pasa de largo). Viven en `frontend/public/tutorial/`
  (ver su `LEEME.md`) y el mapa es **EXPLÍCITO por slot** (`SLOT_FOTO`), no por familia: "la
  cubierta antes" y "la cubierta terminada" son la misma familia y fotos opuestas, y enseñar la
  contraria es peor que no enseñar ninguna. Un slot sin foto cae al pictograma SVG, que se queda
  como red de seguridad. **Se recorta el titular incrustado** de la imagen original: la app ya pone
  el título en lenguaje de cliente y, en un móvil de 375 px, esa franja se renderiza a ~7 px. Lo que
  se conserva es el encuadre verde y el distintivo, que es lo que enseña qué tiene que salir.
  Las originales quedan en `frontend/tutorial-originales/`, **fuera del sitio web y de git**
  (28 MB en PNG → 1,6 MB en JPEG servido).
- **Cada paso lleva un DIBUJO del encuadre** ([SlotIlustracion.jsx](implementation/frontend/src/features/docs/SlotIlustracion.jsx)):
  pictogramas SVG, no fotos. La causa nº 1 de foto rechazada es que no se lee el nº de serie de la
  pegatina, y el texto solo no lo arreglaba. Son SVG porque no pesan en una conexión móvil, se
  adaptan al tema y no exponen la vivienda de ningún cliente (una foto real necesitaría su permiso).
  El dibujo enseña el ENCUADRE, que es lo que se hace mal, no el aparato exacto.
- **Lo ya entregado va plegado** en una línea. Ocupaba media pantalla sin ser accionable.
- Botón **a todo el ancho y debajo** del texto: con el botón a la derecha, un título de dos líneas
  lo empuja fuera del alcance del pulgar. Dice qué va a pasar ("📷 Hacer foto" abre la cámara).
- Barra de progreso y **lo rechazado primero**, anunciado: es lo único que el cliente ya daba por
  hecho y sigue pendiente.

**REGLA — lo PRESCINDIBLE no se le pide a un expediente EN CURSO.** "Otros", el vídeo de la
reforma y el CEE posterior van marcados `prescindible: true`. Con la oportunidad ya ACEPTADA, la ruta pública
pide la vista con `audience: 'cliente'` y esos apartados **no se le enseñan** — no alimentan ningún
documento (el CEE final lo emite NUESTRO certificador) y solo alargaban la pantalla del móvil. El
**admin los conserva** (los usa para archivar material suelto), y un apartado prescindible que YA
tenga ficheros no se oculta nunca.
⚠️ **El vídeo de la vivienda y los planos NO son prescindibles, son `optionalAlways`** (2026-09-30):
el acuse de aceptación los ofrece —el vídeo como alternativa a las fotos de las paredes, los planos
como ayuda— y escondidos en el enlace se le pedía algo que no podía subir. No se reclaman nunca y
desaparecen al registrarse el CEE inicial (`CEE_CAPTACION_SLOTS`).

**El acuse de aceptación pide en DOS bloques** (`documentacionAceptacion` → `{ necesarios, ayuda }`
en `emailService.js`, fuente única del email y de los dos WhatsApp de `routes/public.js`): lo
IMPRESCINDIBLE para el CEE inicial (fotos de las paredes enteras con sus ventanas —o un vídeo—, la
placa de la caldera si falta, y fotos + presupuesto si se cambian ventanas/aislamiento) y lo que
AYUDA (planos, CEE anterior **opcional**: «nosotros presentaremos uno nuevo igualmente»).
**La barra del enlace solo cuenta lo opcional si llegó** (`cuentaEnBarra` en `DocsManager`), y la
cifra de al lado es lo ENVIADO («1/4 enviados»), no el nº de paso: «5/6» junto a una barra casi
vacía parecía que la barra no contaba.

**Arrastrar y soltar en el paso guiado** (PC): la tarjeta entera es zona de suelta y admite varios
ficheros. La pista "o arrástralas aquí" va en `hidden md:inline` — en un móvil no hay de dónde
arrastrar y mencionarlo solo confunde. Con varios ficheros el botón dice **"Subiendo 3 de 7…"**,
no un porcentaje: las subidas van de una en una y un % que vuelve a cero en cada foto parece que
se ha colgado.

**El botón NUNCA dice "Hacer foto"**: al pulsar, el móvil ofrece cámara *y* galería, y muchas de
esas fotos ya están hechas. Va en PLURAL cuando el apartado admite varias (`slot.multiple`) y lleva
debajo "Puedes elegir varias a la vez": el selector del móvil no anuncia la selección múltiple y sin
decirlo nadie la prueba.

**REGLA — al cliente se le habla en LENGUAJE DE CASA, y las etiquetas técnicas NO se tocan.** El
backend manda las dos: `label`/`help` (técnicas — con ellas trabajan el admin, el Anexo Fotográfico
y el CIFO) y `labelCliente`/`helpCliente`, que salen de la tabla `LABEL_CLIENTE` de
[reformaUploadService.js](implementation/backend/services/reformaUploadService.js). "Placa de la
unidad interior / DEPOSITO ACS" lo escribió un ingeniero; el cliente lee "La pegatina de la máquina
de dentro". Un slot sin traducir cae a la etiqueta técnica. La **hibridación es la excepción** que
hay que repetir a mano (la tabla es plana por slot): ahí la caldera no se quita, así que
`FOTO_CALDERA_DESMONTADA` no puede decir "La caldera vieja, ya quitada".

**Rendimiento de la vista**: la reconciliación con Drive eran CUATRO llamadas en serie (buscar
carpeta + listar, dos veces) ≈ 1,9 s con el cliente ante una pantalla vacía. Ahora las dos cadenas
van en `Promise.all` y el ID de subcarpeta sale de una caché de por vida del proceso
(`subfolderIdCached`) — una subcarpeta se crea una vez y no se mueve. Queda en ~1,1 s en frío y
**~0,4 s** después. Se cachea el ID, **nunca el contenido**: Drive sigue siendo la fuente de verdad
de qué ficheros hay (regla 20) y esa lista cambia a cada subida.

**El portal `/mi-expediente` no le pide lo que generamos nosotros.** `clientPendings`
([portalService.js](implementation/backend/services/portalService.js)) excluye "sin generar" /
"sin emitir": el Anexo I y el Convenio de Cesión los emite Brokergy y el cliente solo los firma.
Listárselos enterraba entre cinco líneas las dos que sí dependían de él.
