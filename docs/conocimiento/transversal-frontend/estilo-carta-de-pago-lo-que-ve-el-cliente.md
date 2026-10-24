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

**Las páginas de referencia** (copiar de ahí, no reinventar):
- [RecibidoCobroView.jsx](implementation/frontend/src/features/cobro/views/RecibidoCobroView.jsx):
  una pregunta con dos respuestas, el check que se dibuja y la reseña. Prefijo `.rc-`.
- [MiExpedienteView.jsx](implementation/frontend/src/features/public/views/MiExpedienteView.jsx):
  el portal (estado, «Para tu Renta» con botones de copiar, cuadrícula de documentos, ZIP).
  Prefijo `.mx-`.
- La carta y su email: [carta_pago_bono_cae.html](implementation/backend/plantillas/carta_pago_bono_cae.html)
  y [email_carta_pago_bono_cae.html](implementation/backend/plantillas/email_carta_pago_bono_cae.html).

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
4. Que en PC (≥ 768 px) quede en una columna de 440–480 px centrada.
5. Se enseña al usuario con las capturas, antes de subir nada.
