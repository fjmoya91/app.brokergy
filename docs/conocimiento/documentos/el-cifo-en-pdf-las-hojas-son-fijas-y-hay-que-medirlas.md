<!-- conocimiento · área: documentos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El CIFO en PDF — las hojas son FIJAS y hay que medirlas (2026-08-25)

En el VISOR no se nota nada: `.doc-page` es `min-height:1123px` **sin tope**, así que la caja crece
y todo se ve. En el PDF la hoja son 297mm fijos, el pie va `position:absolute` y
`page-break-after:always` corta por el borde: lo que sobra se parte a mitad de fila y el pie sale en
la hoja equivocada. **Un desborde de 1px saca una hoja casi en blanco.** Por eso mirar la vista
previa NO es comprobarlo.

```bash
node implementation/backend/scripts/check_cifo_paginas.mjs
```

Mide con Puppeteer las 12 combinaciones (cascada de 1 a 5, ACS con el mismo equipo, sin ACS, las
tres fichas, piscina, textos largos) y falla si alguna hoja se pasa. Sirve las tipografías desde
`frontend/public/fonts` interceptando las peticiones: **con la de respaldo mediría de menos** y
daría por bueno algo que en producción se corta. **Tras cualquier retoque del CIFO, pasarlo.**

**REGLA — una hoja por bloque; el corte NO es condicional.** Los datos de la instalación y los
valores de las variables iban en la MISMA hoja y no cabían: medido sobre 998px útiles, el caso más
simple (RES060, un equipo) pedía 971 —27px de holgura—, RES093 ya se pasaba 10px y un RES060 con 3
bombas en cascada, 89 (26RES060_146, que es como se detectó). Partir solo "cuando haga falta" habría
dejado vivo justo el caso que cabía de milagro: un modelo de caldera una línea más largo se lo come.
Lo que engorda esa hoja es la **cascada** —una fila más y un nº de serie por unidad, en calefacción
y otra vez en ACS si el equipo es el mismo—, y así deja de importar.

**REGLA — la PISCINA encabeza la hoja de variables, no la de instalación.** Solo existe en TER100 y
su tabla ocupa 268px: en un terciario con la cascada cubriendo calefacción y ACS a la vez, la hoja
de instalación se pasaba 132px con 5 equipos. Cae justo encima de la tabla donde salen su D_CAP y su
SCOP_pwh, así que no descoloca la lectura.

**REGLA — el recuadro de "Firma y sello" va ANCLADO al borde inferior** (`.doc-spacer` +
`.doc-sign-bottom`), como el del Convenio de Cesión. El sello se estampa en coordenadas FIJAS de PDF
(`SIGN_BOXES.cifo_res060`, y=926…1006 de los 1123 de la hoja) pero el recuadro DIBUJADO iba donde lo
dejara el texto de encima: medido, flotaba entre y=907 y y=923 según la ficha y el largo de la razón
social, con 12px de holgura. Ahora cae siempre en 921…1025. **Los 29px de `.doc-sign-bottom` no se
tocan sin recalcular `SIGN_BOXES`**, y el separador tiene que ser `flex:1` y no un `margin-top:auto`
— dos márgenes automáticos (el suyo y el del pie) se reparten el hueco y el recuadro queda a media
hoja; `flex-grow` reparte primero y deja el pie abajo.

⚠️ El anclaje por TEXTO de `SubirCifoView` (`signatureAnchor`) apuntaba a "firma y sello", un
encabezado que ya no existe —el recuadro se rotula por dentro—. No rompió la firma porque `fixedBox`
tiene prioridad en `FirmarConCertificadoModal`, pero si alguna vez se quita ese `fixedBox` hay que
revisar el ancla.

La hoja 1 también iba al ras (RES093 y TER100 se pasaban 1-2px, y con los textos largos reales, 16).
Se le quitaron el subtítulo que repetía literalmente las dos filas de debajo, el encabezado "Hitos de
la actuación" (sus dos fechas van ahora dentro de "Identificación de la actuación", rotuladas igual)
y el encabezado "Firma y sello". El `kv` bajó de 7px a 6px de padding vertical: son 14 filas en esa
hoja. Holguras actuales: **+28px en el peor caso** (RES093 de textos largos con dos empresas) y
+43 con una sola empresa.
