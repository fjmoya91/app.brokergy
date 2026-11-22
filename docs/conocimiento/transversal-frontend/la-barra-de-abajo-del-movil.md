<!-- conocimiento · área: transversal-frontend · las rutas de los enlaces son relativas a la raíz del repo -->

## La barra de abajo del móvil del equipo (2026-11-22)

**Por qué.** El botón flotante «Gasto» del cuadro de mando (abajo a la derecha, solo en
el móvil) **tapaba la mascota del asistente**, que vive en la misma esquina. Fran, con la
captura del móvil: «Se solapa con el chat. Quizás lo ideal sería tener un menú inferior
como has hecho con el ROL Instalador, no??». En el móvil, además, todo lo que no fuera la
pantalla abierta estaba detrás de la hamburguesa.

**Qué es.** [components/layout/BarraMovil.jsx](implementation/frontend/src/components/layout/BarraMovil.jsx),
montada por [DashboardLayout.jsx](implementation/frontend/src/components/layout/DashboardLayout.jsx)
para el **equipo interno** (ADMIN y TRABAJADOR) por debajo de 768 px (`md:hidden`). La
misma forma que la del instalador (`.ia-barra`): cinco huecos y el del centro, en naranja,
sobresale de la barra.

| Rol | Barra |
|---|---|
| ADMIN | Cuadro · Oportunidades · **＋ Añadir** · Expedientes · Más |
| TRABAJADOR | Seguimiento · Oportunidades · **＋ Nueva** · Expedientes · Más |

- **Más** abre el menú lateral de siempre: ahí sigue todo lo demás (Seguimiento del ADMIN,
  CEE directos, Facturación, Lotes, WhatsApp…). Lleva un punto ámbar si hay fotos o
  textos de instaladores por revisar (el contador de Prescriptores).
- **＋ del ADMIN** abre una hoja: «Gasto con una foto» (abre la **cámara a la primera**: el
  toque sobre la opción es el gesto que el navegador exige), «Gasto en PDF» (el selector de
  ficheros) y «Nueva simulación». El diálogo del gasto es el mismo `GastoRapido` del cuadro
  ([alta rápida de gastos](docs/conocimiento/facturacion/alta-rapida-de-gastos-desde-el-movil.md)),
  con sus estilos montados al lado (`CSS` de Facturación + `CSS_CUADRO`), y al guardar
  emite `brokergy:gasto-guardado`: el cuadro, si está abierto, rehace su cuenta.
- **＋ del TRABAJADOR** abre directamente «Nueva simulación»: los gastos son solo ADMIN
  (su ruta es `adminOClaveInterna`).
- El certificador y los partners siguen con el menú lateral: tienen dos o tres pestañas.
- **Fuera con la calculadora abierta** (`step ≠ 'ADMIN'` en `App.jsx` → `barraMovil={false}`):
  la calculadora lleva su propia barra fija abajo con el bono, y las dos apiladas se
  comían un sexto de la pantalla.
- En el cuadro, el «Gasto» de la cabecera se esconde en el móvil cuando está la barra
  (`html.con-barra-movil .cm-cab-gasto`): sobra, está en el ＋. En escritorio sigue.

**REGLA — lo que va fijo abajo se SUBE con `--barra-movil`.** La barra publica lo que mide
poniendo `html.con-barra-movil` mientras está montada; en
[index.css](implementation/frontend/src/index.css) eso da `--barra-movil: calc(62px +
env(safe-area-inset-bottom))` por debajo de 768 px y `0px` en todo lo demás. Un `fixed`
abajo que no lo use queda DEBAJO de la barra (ella va a `z-30`; un aviso a `z-[9200]` la
taparía a ella). Hoy lo usan: la mascota del asistente (`calc(1.25rem + max(var(--barra-movil),
env(safe-area-inset-bottom)))`: la variable ya lleva dentro la zona del indicador de inicio),
la barra de selección para crear un lote en Expedientes, los avisos `.fx-toast` y el hueco
del final de `<main>`, para que lo último de una página no quede tapado. Lo que se abre
ENCIMA (modales, hojas, el panel del asistente) no lo necesita: tapa la barra.

**REGLA — la mascota del asistente se esconde con un diálogo o una hoja abierta abajo.**
Va a `z-[9300]`, por encima de los diálogos de Facturación (`.fx-capa`, `z 9000`) y de las
hojas de abajo (`z 401`), y en el móvil tapaba justo su botón principal («Guardar en
Drive»). En el móvil, `html:has(.fx-capa, [data-tapa-asistente]) .asistente-boton` la
oculta; una hoja nueva que salga desde abajo lleva `data-tapa-asistente` (la del ＋ y el
menú de la cuenta ya lo llevan).

**Cómo se prueba sin sesión.** El banco `fx-demo.html?vista=cuadro&barra=1` monta el
`DashboardLayout` de verdad con la mascota (`&rol=TRABAJADOR` para la otra barra); las
pestañas que no son el cuadro salen como una página larga de relleno, cuya última fila
tiene que verse entera encima de la barra. Medido el 22/11/2026: a 360 px «Oportunidades»
cabe justo (71 px de 74) con el hueco del centro a 60 px y la etiqueta a 10,5 px; a 390 px
sobra. En escritorio la barra no está, la variable vale 0 y la mascota sigue a 20 px.
