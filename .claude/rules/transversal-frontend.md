---
paths:
  - "implementation/frontend/src/**"
  - "implementation/frontend/scripts/**"
---
# Frontend — lo que vale para CUALQUIER pantalla (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/transversal-frontend/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

Hooks de React (lo vigila el build), overlays con portal, menú lateral, tema y desplegables.

## Reglas críticas (texto íntegro)

29.d **El informe de una acción NO repite el mismo aviso por cada elemento, y no todo es un ✓**: el popup de comprobación del paquete listaba quince líneas de las que trece decían lo mismo (el aviso de cada actuación, una por una) y **todas con la palomita verde**, así que un aviso y un "no procede" se leían como una cosa más que había ido bien — y las cinco líneas que se venía a leer quedaban enterradas con el botón de cerrar al final. `items` de `SendActionOverlay` acepta ahora `{ texto, tono }` con **ok** (verde), **aviso** (ámbar, hay que mirarlo aunque no bloquee) e **info** (gris, NO PROCEDE: se cuenta para que no parezca un olvido); una cadena sigue siendo un ✓ verde, así que las demás llamadas no cambian. Los avisos se agrupan por TEXTO y se dice DÓNDE (`agruparPorMensaje` → "en las 5 actuaciones" / "en E1, E3"): de 15 líneas a 7, y el popup cabe sin scroll. Y el paso siguiente obvio va **dentro** del popup (`accion: { etiqueta, onClick }`, que convierte Cerrar en secundario): comprobar y generar siguen siendo dos gestos (regla 40), pero eso no obliga a cerrar y volver a buscar el botón en la pantalla de detrás.

29.b **`SendActionOverlay` se PORTALEA a `document.body`**: un `position: fixed` se ancla al ancestro más cercano con `backdrop-filter` (o `transform`) — es lo que hace `LoteDetailModal` —, así que el overlay se recortaba a la caja del modal y la pantalla se veía a parches, una zona negra y otra difuminada. `createPortal` lo saca de ahí. Por el mismo motivo el velo va casi opaco (93 %) y con blur fuerte: abierto sobre otro modal de fondo claro, uno más ligero lo deja traslucir y el fondo vuelve a verse desigual. **Y va por ENCIMA de todo popup** (`z-[10050]`, el confeti a 10100): los que se abren a `z-[9998]`/`z-[9999]` (pedir la cuenta a los clientes del lote, leer placas, enviar la propuesta) tapaban el resultado con el overlay a `z-[600]` y solo asomaba el confeti — parecía que el envío no terminaba (15/10/2026).

62. **Ningún hook por debajo de un `return` condicional, y el BUILD lo comprueba**: `vite build` no pasa el lint, así que una violación de `rules-of-hooks` se compila y llega a producción — donde React corta el render con el **error #310** («rendered more hooks than during the previous render») y **tumba la pantalla entera**, no el trozo. Le pasó a la ventana de la envolvente el 18/09/2026 en cuanto el plano por fin se trajo (`200`, 1,34 MB): el `useState` de los cuerpos estaba dos líneas por debajo del `return` de «todavía no hay geometría», así que el fallo llevaba días escrito y latente porque nadie cruzaba ese render. Ese día había **OCHO** en el repo (envolvente ×2, panel económico del expediente, cuadro de mando de lotes, comparativa de la calculadora y popup de propuesta) y se arreglaron las ocho: el hook sube por encima del `return`, o se le quita el `useCallback`/`useMemo` cuando no aportaba nada —el de `ProposalModal` solo se usaba desde un `onClick={() => …}`—. El candado es [check-hooks.mjs](implementation/frontend/scripts/check-hooks.mjs), **enganchado a `npm run build`**: con una violación el build sale con 1 y el deploy se para antes de compilar. **NO sustituye a `npm run lint`**: vigila UNA regla, la que rompe la pantalla; meter ahí las demás (efectos que llaman a `setState`, fast-refresh) lo convertiría en algo que hay que saltarse. Ver "Y con el plano por fin traído, la ventana se caía entera".

164. **Lo que ve el CLIENTE se diseña con el ESTILO «carta de pago»** (Fran, 24/10/2026: «cuando te pidamos actualizar un diseño, que sea como este»). Vale para los enlaces públicos (`/cobro`, `/mi-expediente`, `/firma`, `/subir-docs`, `/r/`), las landings y los emails y PDF que se le mandan; **no** para el CRM interno, que sigue oscuro, **salvo la pestaña Facturación** (Fran lo pidió para ella el 24/10/2026: contenido en crema con prefijo `.fx-`, el menú lateral sigue oscuro; ninguna otra pantalla interna sin pedirlo). Papel crema `#faf9f7`, tarjetas blancas de 24 px, tinta `#141111`; cifras y titulares en `Antonio` 700 auto-alojada, el texto en Inter; UNA cifra protagonista, UNA acción principal naranja por tarjeta, el degradado naranja → verde solo como filete y UNA palabra en lima por titular; avisos en ámbar, nunca en rojo; firma de Fran; mobile first a 390 px. CSS propio con prefijo por página (`.rc-`, `.mx-`) y su `/demo`. Referencias que se copian: [RecibidoCobroView.jsx](implementation/frontend/src/features/cobro/views/RecibidoCobroView.jsx) y [MiExpedienteView.jsx](implementation/frontend/src/features/public/views/MiExpedienteView.jsx). ⚠️ Los trazos que se dibujan llevan `pathLength="100"`, y las capturas se hacen con las animaciones ya terminadas. Tokens, piezas y comprobación: "El ESTILO «carta de pago»".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/transversal-frontend/el-menu-lateral.md` — El menú lateral (2026-08-24) · 3,3 KB
- `docs/conocimiento/transversal-frontend/estilo-carta-de-pago-lo-que-ve-el-cliente.md` — El ESTILO «carta de pago»: así se diseña lo que ve el CLIENTE (2026-10-24) · 9,3 KB
- `docs/conocimiento/transversal-frontend/y-con-el-plano-por-fin-traido-la-ventana-se-caia-entera-react-31.md` — Y con el plano por fin traído, la ventana se caía entera (React #310) · 2,6 KB
- `docs/conocimiento/transversal-frontend/y-el-desplegable-se-leia-blanco-sobre-blanco.md` — Y el desplegable se leía BLANCO SOBRE BLANCO · 1,5 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/transversal-frontend/el-menu-lateral.md`
  - **REGLA — el que scrollea es el `<nav>`, no el `<aside>`.**
  - **REGLA — `signOut` limpia la sesión local PASE LO QUE PASE.**
- `docs/conocimiento/transversal-frontend/y-con-el-plano-por-fin-traido-la-ventana-se-caia-entera-react-31.md`
  - **REGLA — ningún hook por debajo de un `return` condicional, y el BUILD lo
comprueba.**
- `docs/conocimiento/transversal-frontend/y-el-desplegable-se-leia-blanco-sobre-blanco.md`
  - **REGLA — `color-scheme` se DECLARA**

<!-- generado:fin -->
