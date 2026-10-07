<!-- conocimiento · área: transversal-frontend · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «REVISAR el CEE que entrega el certificador (2026-09-21)», en el CLAUDE.md antiguo.

### Y el desplegable se leía BLANCO SOBRE BLANCO

El `<select>` de cada fila lleva `text-white`, pero el POPUP de sus opciones lo
pinta el navegador con el esquema del **sistema** —fondo blanco— y ahí hereda ese
color: no se leía más que la opción resaltada, y había que recorrerlas con el
ratón para saber qué ponía cada una. **No era del buzón**: le pasa a cualquier
`<select>` de la app.

**REGLA — `color-scheme` se DECLARA** (`:root { color-scheme: dark }` y
`.theme-light { color-scheme: light }`). Es lo que le dice al navegador en qué
tema está la app, y con eso pinta el popup del `<select>`, las barras de scroll y
los iconos de los campos de fecha. Las dos reglas de `option`/`optgroup` van
**además**, a propósito: no todos los navegadores atienden al esquema cuando el
`<select>` trae un `color` explícito, y una opción ilegible no es un detalle de
estilo — es no poder elegir.

⚠️ De rebote, **las barras de scroll y los selectores de fecha de toda la app se
pintan en oscuro**. Es la consecuencia buscada (hasta hoy el icono del calendario
salía negro sobre fondo oscuro y casi no se veía), pero se nota en todas las
pantallas. En **tema claro no cambia nada**: ahí se declara `light`.
