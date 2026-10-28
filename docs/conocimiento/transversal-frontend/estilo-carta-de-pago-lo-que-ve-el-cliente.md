<!-- conocimiento · área: transversal-frontend · las rutas de los enlaces son relativas a la raíz del repo -->

### El ESTILO «carta de pago»: así se diseña lo que ve el CLIENTE (2026-10-24)

Fran, 24/10/2026, al ver rediseñadas «¿Te ha llegado?» y el portal del cliente: «me gusta
mucho el diseño. Guarda el estilo para que, cuando te pidamos actualizar un diseño, sea como
este». Este documento es ese estilo. Nació de la carta de pago del Bono CAE (regla 157):
es su misma estética, llevada a pantalla.

**Cuándo se aplica.** Cuando se pida «actualizar / mejorar el diseño» de algo que ve el
**cliente** o el **instalador** fuera del CRM: enlaces públicos (`/cobro/…`, `/mi-expediente/…`,
`/firma/…`, `/subir-docs/…`, `/r/…`), landings, emails y PDF que se le mandan. **No** se aplica
al CRM interno, que sigue con su tema oscuro y Tailwind. Si no está claro a qué se refiere,
es este.

**La excepción: la pestaña Facturación** (Fran, 24/10/2026: «a esta nueva pestaña quiero que le
pases la skill de diseño con el diseño que se está generando en la carta de pago»). Es la única
pantalla del CRM con este estilo: su área de contenido pasa a papel crema con su propio prefijo
(`.fx-`), y el menú lateral sigue oscuro. Una pantalla de DATOS no es una carta: aquí caben varias
cifras (el cuadro de mando), tablas densas y filtros, pero con los mismos tokens, tipografías,
tarjetas, filete y avisos en ámbar. Ninguna otra pantalla del CRM se pasa a este estilo sin que se
pida para ella. Pedidas después: el popup «Cálculo real» de la calculadora (27/10/2026) y la
«Vista S.O.» de la pestaña Lotes (28/10/2026, Fran: «que se parezca a Facturación - carta de
pago»): monta el `CSS` de `facturacion/estilo.jsx` y añade lo suyo con prefijo `.so-`; ojo, `.fx-hero`
y `.fx-kpis` traen el `grid-area` del cuadro de Facturación y fuera de él hay que anularlo.

**Las páginas de referencia** (copiar de ahí, no reinventar):
- [RecibidoCobroView.jsx](implementation/frontend/src/features/cobro/views/RecibidoCobroView.jsx):
  una pregunta con dos respuestas, el check que se dibuja y la reseña. Prefijo `.rc-`.
- [MiExpedienteView.jsx](implementation/frontend/src/features/public/views/MiExpedienteView.jsx):
  el portal (estado, «Para tu Renta» con botones de copiar, cuadrícula de documentos, ZIP).
  Prefijo `.mx-`.
- La carta y su email: [carta_pago_bono_cae.html](implementation/backend/plantillas/carta_pago_bono_cae.html)
  y [email_carta_pago_bono_cae.html](implementation/backend/plantillas/email_carta_pago_bono_cae.html).
- La entrada al portal, `/portal` ([PortalLoginView.jsx](implementation/frontend/src/features/public/views/PortalLoginView.jsx),
  prefijo `.pl-`): un formulario con este registro (24/10/2026).
- La confirmación de cobro, `/cobro/:id` ([ConfirmarCobroView.jsx](implementation/frontend/src/features/cobro/views/ConfirmarCobroView.jsx),
  prefijo `.cc-`, demo en `/cobro/demo`): un formulario de varios PASOS con su barra de
  avance por tramos, las opciones como tarjetas con un círculo que se marca en naranja (la
  `desaconsejada` con el título apagado y su chapa ámbar), la cuenta en monoespaciada por
  bloques con los dos botones «Sí, es correcta» (verde al elegirlo) y «No, es otra» (ámbar), y
  el check que se dibuja al terminar (24/10/2026). Los emojis de las preguntas siguen en
  `cobroForm.js` (los usa también el resumen del staff); la pantalla pinta su icono SVG por
  el `id` del bloque. Solo cambió el aspecto: validaciones y envío, los de siempre.
- La aceptación de la propuesta, `/firma/:id` ([AceptarPropuestaView.jsx](implementation/frontend/src/features/public/views/AceptarPropuestaView.jsx),
  prefijo `.fp-`, demo en `/firma/demo` y `/firma/demo?varios`, 24/10/2026): el CSS de la
  página lo usan también sus piezas ([ConfirmarVivienda.jsx](implementation/frontend/src/features/public/components/ConfirmarVivienda.jsx)
  y [PropietariosAceptacion.jsx](implementation/frontend/src/features/public/components/PropietariosAceptacion.jsx)),
  que solo se pintan dentro de ella. El popup de condiciones va portaleado a `body` y no
  hereda ese CSS: trae `tema="carta"` (desde el mismo día también la oferta de CEE directo). Dos
  cosas aprendidas aquí: el fondo lima de `.fp-mark` empieza al 14 % del alto (con el fondo
  entero, en un titular de dos líneas tapaba los rasgos bajos de la de arriba), y el saludo
  pone el nombre de pila en minúsculas con la inicial en mayúscula, porque en la ficha
  viene en MAYÚSCULAS.
- La aceptación de la oferta de CEE directo, `/aceptar-cee/:token` ([AceptarOfertaCeeView.jsx](implementation/frontend/src/features/public/views/AceptarOfertaCeeView.jsx),
  prefijo `.ac-`, demo en `/aceptar-cee/demo` y `/aceptar-cee/demo?sin-cee`, 24/10/2026): el
  presupuesto en una tarjeta con el total como cifra protagonista (céntimos pequeños) y el PDF
  como botón secundario; el formulario en tarjetas (datos, inmueble, climatización, domicilio)
  y el botón naranja al final. El **gestor de fotos** que sale tras aceptar es el del CRM
  (`DocsManager`, oscuro): va dentro de un `<div className="theme-light">`, que remapea sus
  clases de Tailwind al tema claro sin tocar el componente. El aviso «Falta por contestar» se
  compone en vivo: conforme el cliente contesta, la lista se acorta y se va sola. Saludo solo
  si hay apellidos: a una empresa no se la saluda por la primera palabra de su razón social.
- La subida de documentación, `/subir-docs/:uuid` y `/subir-cee-docs/:id` ([SubirDocsReformaView.jsx](implementation/frontend/src/features/public/views/SubirDocsReformaView.jsx),
  prefijo `.sd-`, demo en `/subir-docs/demo?token=demo`, 24/10/2026): solo cambia el MARCO
  (logo, titular, nota y firma). El gestor de dentro es `DocsManager` en `.theme-light`, como en
  `/aceptar-cee`: cliente, instalador y CEE directo ven lo mismo de siempre, en claro.
- La firma con el móvil, `/firma-movil/:token` ([FirmaMovilView.jsx](implementation/frontend/src/features/firma/FirmaMovilView.jsx),
  prefijo `.fm-`, demo en `/firma-movil/demo`, 24/10/2026): las pantallas de alrededor (abrir,
  enviar, enviada, enlace no válido y «Gira el teléfono»). La hoja (`SignaturePad`) es la del
  ordenador y no se toca (regla 34). El aviso de error al enviar va también portaleado a
  `body`: dentro de `#root` quedaba debajo de la hoja, igual que le pasó al de girar.
- **TODOS los emails** salen ya con este registro (24/10/2026): `brandEmailShell` de
  [emailService.js](implementation/backend/services/emailService.js) lleva el filete en cinco
  celdas (Outlook no pinta degradados), el logo, el titular en la display (Antonio donde la
  haya; en Gmail y Outlook, la estrecha del sistema), la tarjeta de 18 px y la **firma de Fran**
  (`emailFirma`). Los avisos INTERNOS (al equipo, al ERP, el restablecer contraseña) pasan
  `firma: false`. La paleta `BRAND` conserva los nombres de sus claves: cambian los valores. Los
  botones sobre el naranja o el verde de la marca llevan la letra en tinta.
  **Una sola acción principal por email** (26/10/2026): la que mueve el expediente va en naranja
  y las demás en blanco con borde (`emailOutlineButton`). En la propuesta, la principal es
  «Aceptar y firmar» y «Ver propuesta online» es la secundaria; en los encargos al técnico y sus
  recordatorios, `filasBotones(items, { principal })` pone en naranja la primera de la lista
  (en el encargo de CEE directo con acuse, la principal es «Acepto el encargo» y las demás van
  todas en blanco); en el visto bueno del CEE, «Firmar y presentar». El aviso del Agente IA es
  interno: `firma: false`.
- La firma de los anexos, `/firmar-anexos/:id` ([FirmarAnexosView.jsx](implementation/frontend/src/features/public/views/FirmarAnexosView.jsx),
  prefijo `.fa-`, demo en `/firmar-anexos/demo` con `?datos`, `?preparando`, `?requerimiento`,
  `?rechazo` o `?varios`, 26/10/2026).
- Las páginas del **instalador**, `/instalador/:id`, `/subir-cifo/:id` y `/subir-rite/:id`: un
  solo marco y un solo CSS, [MarcoInstalador.jsx](implementation/frontend/src/features/public/components/MarcoInstalador.jsx)
  (prefijo `.in-`), que usan también sus tarjetas `FirmarCifoCard` y `SubirRiteCard`. Demos:
  `/instalador/demo` (`?refirma`…), `/subir-cifo/demo` (`?refirma`, `?bloqueado`) y
  `/subir-rite/demo` (`?sin-memoria`, `?subido`) (26/10/2026).
- La **landing pública** (`/reforma`, `/calcula-tu-ayuda`, `/p/:slug`) es una PIEL, no una
  reescritura: [estiloCarta.js](implementation/frontend/src/features/landing/estiloCarta.js)
  (prefijo `.lf`) envuelve el funnel, solo en modo público, en `.lf .theme-light`; la «Nueva
  simulación» del CRM es el mismo componente y sigue oscura. Con partner, el acento es SU color
  en la variante para papel claro (`--accent-text-claro`) y la palabra marcada, un tinte de él
  (26/10/2026). Se comprueba con capturas de TODOS los pasos, no solo de la portada.
- La **guía de la Renta** (PDF de una hoja, [guiaIrpf.js](implementation/frontend/src/features/expedientes/logic/guiaIrpf.js)):
  la hoja de la carta de pago con la cifra en tarjeta tinta (26/10/2026). Ver «La GUÍA de la
  deducción del IRPF para el cliente».
- Retoques del 26/10/2026: en `/subir-docs` el gestor va con `embedded` (el titular ya lo pone
  la página; el suyo salía repetido), y en `/firma-movil` el aviso de error se cierra al tocarlo
  (con su ×) y solo a los 8 s mientras se firma: tapaba el botón de enviar.

#### 1. La idea

- **Papel, no app oscura.** El fondo es crema, las tarjetas blancas y la tinta casi negra. Se
  tiene que leer como una carta seria de una ingeniería, no como un panel.
- **Una cifra protagonista por pantalla.** El importe va en grande, con los céntimos más
  pequeños. Lo que el cliente viene a ver va lo primero y en grande, y lo demás detrás.
- **Una sola acción principal por tarjeta**, en naranja. Las alternativas van en blanco con
  borde, o como enlace subrayado.
- **La energía es un filete.** El degradado naranja → verde es una tira fina (arriba de la
  página o de una tarjeta), nunca un fondo.
- **Una palabra en lima por titular**, como si se hubiera subrayado con un rotulador
  («ya está **en tu cuenta**»). Una, no tres.
- **Firma de persona.** Se cierra con Fran (foto/sello + nombre + cargo), no con «El equipo».
- **Mobile first.** El 90 % lo abre con el móvil desde el WhatsApp: se diseña a 375–390 px y
  luego se comprueba en PC.

#### 2. Tokens (los nombres de las variables CSS no se cambian)

```css
--crema:#faf9f7;  --tinta:#141111;  --gris:#55585f;  --gris2:#6b6e76;
--linea:rgba(20,17,17,.08);
--naranja:#ffa000;  --naranja-txt:#b33a0a;  /* fondo de botón · texto naranja legible */
--verde:#b1d13e;    --verde-txt:#4d6b0f;    /* trazo/fondo suave · texto verde legible */
--lima:#c7f601;                             /* SOLO para marcar la palabra o un chip */
--filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
```

- Sobre blanco, el texto naranja es `--naranja-txt` y el verde `--verde-txt`: `#ffa000` y
  `#b1d13e` no dan contraste para texto.
- El ámbar de aviso: fondo `#fff7e6`, borde `#f6dca4`, texto `#5c4100`.
- El raíz declara `color-scheme:light` (la regla del desplegable blanco sobre blanco, al revés).

#### 3. Tipografía

- **Display**: `Antonio` 700, auto-alojada (`/fonts/Antonio-700-latin.woff2`, regla 25.b; nada
  de Google Fonts en producción), para cifras y titulares. `letter-spacing:-.005em`.
  - Importe: 72–76 px con `line-height:.95` y los céntimos a ~45 %.
  - H1 42 px · H2 30 px · H3 24 px; bajan un escalón por debajo de 360 px.
- **Texto**: `Inter` (pila del sistema detrás). Cuerpo 15–15,5 px y `line-height:1.55–1.6`, en
  `--gris`; lo que importa, en negrita y en `--tinta`.
- **Antetítulo (eyebrow)**: 11 px, 800, `letter-spacing:.13em`, mayúsculas, en `--naranja-txt`
  (o en verde, si es una buena noticia).
- **Nº de expediente**: monoespaciada de 11,5 px, en una píldora blanca arriba a la derecha.

#### 4. Piezas

- **Cabecera**: el logo (26 px de alto) a la izquierda y la píldora del expediente a la derecha.
  Debajo, un saludo corto: «Hola, **María**».
- **Tarjeta**: blanca, `border:1px solid var(--linea)`, `border-radius:24px`, sombra doble
  suave (`0 1px 2px rgba(20,17,17,.04), 0 8px 24px -12px rgba(20,17,17,.10)`) y relleno
  22×20 px (26 px en PC). Entre tarjetas, 14 px.
- **Halo**: detrás de la cabecera, dos degradados radiales muy tenues (naranja al 10 %, lima
  al 10 %). Nunca un color plano.
- **Botones**:
  - alto mínimo 56 px (52 px el secundario) y `border-radius:16px`; tipografía Inter 700 a
    16,5 px; `:active` hace `scale(.98)`; `:focus-visible` con un contorno de 3 px de tinta;
  - el **principal** va en naranja con el texto `#08090c` y la sombra naranja;
  - el **secundario**, blanco con borde de 1,5 px; el **tinta** (negro), para «Descargar»;
  - se apilan a lo ancho, en una rejilla con 10 px de hueco.
- **Chips**: 26 px de alto, mayúsculas de 11 px y 800. El verde (`rgba(177,209,62,.18)`) es
  para «Confirmado / Transferido» y el lima, para destacar.
- **Filas dato–valor**: `dl` con líneas finas entre filas, la etiqueta en gris y el valor en
  600 con `tabular-nums`.
- **Icono en baldosa**: 40–48 px con `border-radius:12–16px` y fondo suave del color del
  mensaje (verde = hecho, naranja = atención, crema = neutro). Los iconos son SVG de trazo de
  24×24 (`stroke-width` 2, extremos redondos), escritos en el propio fichero: sin librería de
  iconos.
- **Avisos**: una caja con su icono, en ámbar si falta algo y en verde si está hecho. Nunca en
  rojo con el cliente.
- **Prueba social**: una caja crema con su icono («Más de **60 familias** ya han cobrado…»),
  con una cifra REAL (`familiasCobradas`), redondeada hacia abajo.
- **Pie**: la firma de Fran y, debajo, «BROKERGY · Ingeniería energética» en mayúsculas
  espaciadas de 11 px.

#### 5. Movimiento

- **Entradas**: `translateY(12px)` + opacidad en 0,55 s, `cubic-bezier(.2,.8,.2,1)`, escalonadas.
- **El check que se dibuja**: primero el círculo y luego la palomita, con
  `stroke-dashoffset`. ⚠️ **Cada trazo lleva `pathLength="100"`** y el dash va en esa escala
  (el círculo, a 102 para que cierre sin rendija). Con el dash calculado a mano (167 y 40), la
  captura a mitad de animación dejaba la palomita «cortada» y dependía de cómo midiera cada
  navegador (Fran, 24/10/2026).
- **Esperas**: un esqueleto con brillo (`shimmer`) en el tono crema, o un *spinner* dentro del
  botón con el verbo («Guardando…»). Nunca una pantalla quieta.
- **Todo se apaga con `prefers-reduced-motion`**: sin animación, el check aparece ya dibujado.

#### 6. Cómo se escribe

- **CSS propio de la página, con prefijo** (`.rc-`, `.mx-`, uno nuevo por página), en una
  constante `CSS` inyectada con `<style>`. Así un enlace público no depende del tema ni del
  Tailwind del CRM, y no lo rompe un cambio de este.
- **Los textos le hablan al cliente**: de tú, frases cortas y en lenguaje de casa. Nada de
  jerga de expediente (lo que ya dice la regla del enlace del cliente). Lo que el cliente
  tiene que teclear en otro sitio (Renta Web) lleva un botón «Copiar».
- **Demo sin datos**: cada página pública tiene su `/…/demo` con datos de mentira, para
  enseñarla y para las capturas.

#### 7. Comprobación antes de enseñarlo

1. Captura a 390×844 con `deviceScaleFactor` 2–3, **esperando a que acaben las animaciones**
   (≥ 2,5 s): una captura a mitad de dibujo engaña.
2. Que no haya scroll horizontal a 360 px, ni errores en la consola.
3. Que los objetivos táctiles midan ≥ 44 px y el texto pequeño tenga contraste AA.
4. Que en PC (≥ 768 px) quede en una columna de 440–480 px centrada. **Excepción: una landing
   de captación** (la de cee.brokergy.es, Fran 25/10/2026: «que en versión PC se vea mucho
   mejor») se abre a lo ancho desde 1024 px — ver «La landing en el ordenador» en
   `certificadores-app/00-la-app-de-certificadores.md`. Los enlaces de un expediente siguen en
   columna.
5. Se enseña al usuario con las capturas, antes de subir nada.

#### 8. La PROPUESTA en PDF (2026-10-25)

Fran dio el visto bueno a la maqueta el 25/10/2026: «Aplícalo al PDF real de la propuesta,
conservando el contenido, la paginación y el encaje de la portada». Es la primera pieza A4 del
estilo, y no es una pantalla: **no es mobile first** (A4 de 794×1123 px y alto FIJO), y valen
otras medidas. El código está en el `baseCss` de
[ProposalModal.jsx](implementation/frontend/src/features/calculator/components/ProposalModal.jsx),
con el prefijo `.prop-` de siempre.

- **Lo que NO cambió**: el texto, las cifras, las cuatro hojas y los anexos, la marca de versión,
  la cabecera en Grid (regla 5) y el ajuste de la portada en tres escalones (regla 31: huecos
  `--e-*`, `.prop-compact` y `zoom` sobre `.prop-pb`). Tampoco las clases que miden el ajuste,
  `encajarPortadas` y `revisar_portadas_propuestas.js`: `.prop-page`, `.prop-pb`, `.prop-cta`,
  `.prop-mfoot` y `.prop-ftr`.
- **Tokens propios** en `.prop-wrapper-inner`: los de §2 más `--linea2`, `--verde-suave`, el
  ámbar (`--ambar-bg/-borde/-txt`) y `--display` (Antonio).
- **Cabecera**: el filete arriba de cada hoja, el halo solo en la portada, el logo (una imagen
  reducida a data URL con `logoReducido`, como el de la cabecera antigua) y la píldora del nº en
  monoespaciada; en la portada, «Propuesta Nº … · vN» y debajo la fecha, la validez y «esta
  versión anula y sustituye a las anteriores».
- **La cifra protagonista es la AYUDA TOTAL** (`renderHero`, que sustituye a los KPI), con sus
  chips de dónde sale (CAE o CAE neto + IRPF, que suman lo mismo que la cifra: regla 156) y al
  lado una `dl` con inversión, % cubierto con su barra e inversión neta. Sin coste de obra
  (`hideBudget`), el bono y la deducción como «hasta X €». En la comparativa no hay héroe: las
  dos tablas ya cierran con esas cifras, que es donde se comparan.
- **Tabla en tarjeta**: los costes en tinta (nunca en rojo) y los descuentos en verde. Con UNA
  opción cierra solo con «Inversión neta final», porque la ayuda total y el % ya están en el
  héroe; con dos opciones conserva sus tres filas de cierre.
- **Avisos** (presupuesto estimado, biomasa, hibridación, hipótesis del IRPF) en ámbar; los que
  son una buena noticia, en verde (`.prop-ambar.ver`).
- **La llamada a la firma ya no es un pie negro**: es una tarjeta blanca con filete, UN botón
  naranja («Firmar y aceptar la propuesta») y el enlace escrito debajo, por si se imprime.
- **Hojas 2-4**: baldosas con iconos SVG de trazo escritos en el fichero (`TRAZOS` + `Ico`), los
  pasos en una línea con el último en lima, las cláusulas numeradas «01…06» con la 4
  (penalización) en ámbar. La lista de documentación es `.prop-dlist`: `.prop-dl` es la `dl` del
  héroe.
- **El cierre es solo texto** (Fran, 25/10/2026): «Quedo a su disposición para cualquier duda»,
  **Fran Moya** · CEO de BROKERGY, teléfono y email. Sin rúbrica, sin sello y sin nº de
  colegiado: en una oferta comercial, una firma dibujada parecía un documento firmado, que no lo
  es.
- **Antonio solo en `latin`**: `FUENTE_PROPUESTA` (en
  [fuentesDoc.js](implementation/frontend/src/features/expedientes/logic/fuentesDoc.js)) es la de
  Inter más Antonio 700, y la tupla acepta un cuarto elemento con los subconjuntos, porque Antonio
  no tiene fichero `latin-ext`. `check_fuentes_documentos.mjs` lo respeta.
- **La vista previa del popup declara las MISMAS caras** (`CARAS_PROPUESTA`), en un `<style>`
  hermano del nodo que se exporta, no dentro, para no duplicarlas en el HTML enviado, que ya las
  lleva en el `<head>`. Sin eso el CRM solo tiene el Inter de Google, y los titulares salían en
  la letra de reserva (Fran, 26/10/2026: «se ve diferente en el visor y en el PDF»). El ajuste
  de la portada pide Antonio e Inter con `document.fonts.load` antes de medir.

**Medido** con el `ProposalModal` real, datos de ejemplo y la API cortada (ninguna escritura),
impreso como el servidor (`encajarPortadas` + `page.pdf`). Holgura en px sobre el pie, por hoja:

| Variante | Hoja 1 | Hoja 2 | Hoja 3 | Hoja 4 |
|---|---|---|---|---|
| Aerotermia con instalador y servicios regalados | 108 | 13 | 85 | 27 |
| La más cargada (estimado, biomasa, 2 propietarios, ahorro anual) | 29, compacto, zoom 0,84 | 56 | 85 | 27 |
| Comparativa aerotermia / reforma | 115 | 13 | 85 | 14 |
| Sin coste de obra | 89 | 13 | 85 | 27 |

El servidor no tuvo que reducir ninguna hoja. Antes, las propuestas reales entraban casi todas en
compacto (24–29 px), así que la portada nueva deja más aire. La hoja 2 es la más justa: un
párrafo más en el IRPF o en los pasos la desborda, y ese hueco no lo vigila el ajuste.

⚠️ El `zoom` del tercer escalón también encoge el `padding` lateral de `.prop-pb` (48 px × zoom),
así que con 0,84 el cuerpo sale unos 8 px más ancho por cada lado que la tarjeta de la firma. Ya
pasaba con el diseño anterior, y solo se ve en la propuesta más cargada.
