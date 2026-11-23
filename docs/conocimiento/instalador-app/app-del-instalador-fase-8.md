<!-- conocimiento · área: instalador-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app del INSTALADOR, fase 8: la PORTADA que elige él y su ficha de brokergy.es, solo suya (2026-11-23)

**Por qué.** Encargo de la fase 8: rediseñar la página pública de cada instalador en brokergy.es
(`/encuentra-tu-instalador/<slug>/`, ejemplo RCA Instalaciones). Pedía tres cosas: quitar «Otros
instaladores cerca», que el instalador elija la FOTO PRINCIPAL y mejorar la conversión y el diseño.
El diseño se hizo en Claude Design (ordenador, móvil y la pantalla de la app). Fran lo aprobó con
«Sí, lo recomendado»:

- La portada la elige el instalador desde su app, **sin otra revisión**, y un ADMIN puede cambiarla
  desde el CRM.
- Si no ha elegido ninguna, sale sola: la primera foto «después».
- Las migas visibles se quitan; se quedan en el BreadcrumbList.
- Sale una reseña de Google de BROKERGY, con la etiqueta «quién tramita tu ayuda».

**REGLA — la ficha de un instalador habla solo de ÉL.** Se quitan cinco cosas porque mandaban al
cliente a otro instalador:

- «Otros instaladores cerca».
- «¿Eres instalador…?» (UneteRed).
- «Su provincia».
- Los pines de los demás instaladores en el mapa.
- La frase del retrato «alrededor, la red tiene obras en…».

La ficha es la herramienta del instalador para vender SU obra (la comparte por WhatsApp). Que lleve
al cliente a otro instalador va en contra de eso y de la red.

### La portada: dónde se guarda y quién la decide

**REGLA — la portada es UNA foto PUBLICADA del propio instalador. Se guarda en la columna `orden`
existente con el valor `-1` (`ORDEN_PORTADA`). Sin migración.**

- Elegir una pone a 0 la que tuviera `orden < 0` y a −1 la nueva. Quitarla (`fotoId: null`) solo
  pone a 0 la anterior.
- La API pública ordena por `orden` ascendente, así que la portada elegida además sale la primera.
- Fuente única: `portadaDe(fotos)` y `ponerPortada(instaladorId, fotoId)` en
  [services/escaparateService.js](implementation/backend/services/escaparateService.js).
  - Si hay una publicada con `orden < 0`, esa (`elegida`).
  - Si no, la primera «después» en el orden de la API (`automatica`).
  - Si no hay ninguna «después», la primera.
- Comprobaciones al guardar:
  - El id ha de ser un uuid.
  - La foto ha de ser SUYA: si no, **404 `FOTO_NO_ENCONTRADA`**.
  - La foto ha de estar PUBLICADA: si no, **409 `FOTO_NO_PUBLICADA`**. No hace falta otra revisión
    porque la foto ya la aprobó un ADMIN (regla 233).

| Quién | Ruta | Guardián |
|---|---|---|
| El instalador | `PUT /api/instalador-app/escaparate/portada { fotoId }` | `enforceAuth` + `soloBetaInstalador`; SIEMPRE su empresa |
| ADMIN, desde la ficha del instalador | `PUT /api/escaparate-revision/instalador/:id/portada { fotoId }` | `adminOnly` |
| La web (pública) | `GET /api/public/marketplace/red/:slug/pagina` | la de siempre; UNA foto lleva `portada: true` |

- La API pública marca `portada: true` en una sola foto (la elegida o la automática). Las demás no
  llevan la clave: la lista blanca del test admite `portada` solo con valor `true`.
- `GET /escaparate` de la app devuelve `portada: 'elegida' | 'automatica' | null` en cada foto.
- `GET /api/escaparate-revision/instalador/:id` devuelve además `publicadas`, para que el CRM elija
  entre ellas.
- Con la BD caída: **503** (`PORTADA_UNAVAILABLE`), regla 38.

**Por qué en `orden` y no en una columna nueva.** Local escribe en la BD de producción y una
migración era un paso más antes del deploy. `orden` ya existía y ya ordenaba la API pública.

### En la app («Tu página web»)

- Arriba de «Tus fotos», la tarjeta **«Tu portada»** con su miniatura. Dice si la eligió él o si sale
  sola («Sale sola: tu primera foto de después. Toca una foto publicada para elegir otra»). La foto
  que es portada lleva en la rejilla el chip naranja «Portada».
- En la hoja de una foto publicada:
  - «Poner de portada», o «Dejar siempre esta de portada» si ya es la automática.
  - Si es la elegida, «Que la portada salga sola».
  - Va con el popup de envío de la casa (`alSubir`, SendActionOverlay).
- En el CRM, en el «Pendiente de revisar» de la ficha del instalador
  ([RevisionEscaparate.jsx](implementation/frontend/src/features/admin/components/RevisionEscaparate.jsx)),
  está la tira «Portada de su página».
  - ADMIN toca otra foto para ponerla o pulsa «volver a la automática».
  - El resto del equipo solo la ve.
- En el banco de pruebas: `?seccion=pagina` (la app) y `?cola=1` (el CRM). Responden aquí, sin API.

### En la web (repo brokergy-web, `src/pages/encuentra-tu-instalador/[slug].astro`)

**Arriba.**

- La portada:
  - En el móvil y la tableta abre la ficha como una banda ancha, con el logo montado encima.
  - En el ordenador va vertical (4:5) a la derecha del nombre, con el sello «De la red BROKERGY», el
    pie «Su obra · Aerotermia · Socuéllamos» y «Ver las N fotos». Pulsarla abre el visor en esa foto.
- Sin fotos (la mayoría de los instaladores), a la derecha van los tres sellos de siempre.
- Los botones van junto al nombre. Ya no hay tarjeta lateral.
- Debajo de los botones: el sello de Google y **«Compartir»**. En el móvil abre la hoja de compartir;
  en el ordenador copia el enlace y lo dice.

**Después, en este orden.**

1. «Así funciona con {X}», en tres pasos. La obra la hace él; la ayuda, nosotros.
2. Sus obras.
3. «Sobre {X}», con el mapa a su lado (solo sus obras) y sus municipios.
4. La reseña. Es LITERAL y entera, como sale en Google (regla de `Resenas.astro`). No se dice el
   número de reseñas: Fran lo pidió el 11/11/2026.
5. El cierre.
6. La barra del móvil.

**La imagen y el botón de la cabecera.**

- og:image es su portada (`?sz=1200`). El `image` del JSON-LD también.
- El botón de la cabecera (en el ordenador) lleva a **SU calculadora**. Si no tiene, lleva a su
  WhatsApp («Pídele la obra»). Con la calculadora general el lead entraría sin él.
- El contacto no cambia: su calculadora `/p/<landing>` o nuestro WhatsApp con «he visto a X en
  brokergy.es».

**Quién elige la foto en la web.** `limpiaPagina` conserva `portada: true` y nada más.
`fotoPortada(p)` repite la regla para datos sin la marca. Lo usan las tres piezas (`pagina.js`, el
estático y el refresco al abrir).

**Lo que se comprobó (23/11/2026, en local).**

- Tests: `test_escaparate_instalador.js` 96/96, `auditar_rutas_sin_guardian.js` OK y
  `test_rutas_sin_sesion.js` 118/118.
- Builds: el del frontend pasa (con `check-hooks`) y el de la web también (99 páginas).
- La web, en el navegador: 1440, 1024, 768, 390 y 360 px, sin scroll horizontal. Se probaron RCA (con
  fotos), ISM (sin fotos) e Instoterma (sin calculadora).
- La app y el CRM, en el banco: poner, cambiar y quitar la portada.
- Elegir la portada de verdad NO se probó contra producción, porque habría cambiado la página real de
  RCA. Las escrituras van probadas con la BD simulada del test.

**Para desplegar.**

1. El backend de la app, primero. Hasta entonces la API no marca la portada y la web usa la primera
   «después», que es la misma regla.
2. Después, la web: `npm run red` + build.

No hay SQL.
