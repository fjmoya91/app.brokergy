<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Qué PLANTAS se miden lo marcó una persona, no Catastro (2026-09-14)»; la introducción y el resto, en esta misma carpeta.

### Las IMÁGENES del certificado se ven solas, y se pueden sustituir

Estaban detrás de un botón «Traerlas de Catastro». Una imagen detrás de un botón
es una imagen que nadie comprueba, y de todos modos el backend ya las cachea por
referencia catastral con la MISMA caché que usa la generación: mirarlas no cuesta
ni una petición más al WAF. Ahora se piden al abrir la ventana.

**REGLA — la imagen PUESTA A MANO manda sobre la de Catastro.** Catastro no
siempre tiene foto, y cuando la tiene puede ser de hace quince años o de la casa
de al lado; el certificador ha estado delante del edificio. Se sube desde el
propio bloque y va a **Drive**, a la misma carpeta que el `.cex`
(`1. CEE / CEE INICIAL`), con nombre canónico; en la BD solo queda su id
(`cee.envolvente_imagenes`, regla 21). La anterior se archiva en OLD: puede estar
ya dentro de un `.cex` entregado.

**REGLA — la vista y el `.cex` salen de la MISMA función** (`imagenesDelCex`).
`componerFicha` llamaba a `imagenesDeCatastro` directamente: con las dos
separadas, la pantalla enseñaría una imagen y el fichero llevaría otra, y eso no
se descubre hasta abrirlo en CE3X.

**REGLA — a la PANTALLA va la miniatura; al `.cex`, la grande.** Catastro sirve
la fachada a tamaño de cámara —medido: **2304×1728 y 323 KB**, o **431 KB en
base64**— y la app la pinta en un recuadro de 300×170: por eso tardaba en
aparecer. Pero el fichero ya trae dentro de su EXIF una de **640×480 en 58 KB**,
de sobra para lo único que se hace con ella (comprobar que es esta casa).
`miniaturaExif()` la saca recorriendo los marcadores del JPEG —**nunca buscando
el último `FFD9` a ojo**: dentro de los datos comprimidos un `FF` va escapado
(`FF00`) o es un marcador de reinicio, y a ojo se corta por donde no es— y ante
cualquier duda devuelve `null` y se enseña la grande. Al `.cex` sigue yendo la
grande, que es lo verificado contra un fichero real (el motor la reescala él a
los 179×134 que guarda CE3X).
⚠️ No confundir con la nota de que la foto llega **mal terminada**: no es
relleno, es que el fichero viene TRUNCADO sin su EOI. No hay nada que recortar.

**REGLA — un enlace roto se DICE y se cae a la de Catastro.** Si el fichero
sustituido ya no está en Drive, generar en silencio con otra imagen es peor que
decirlo. Y `cee.envolvente_imagenes` va en clave APARTE del trabajo: el trabajo lo
reemplaza entero el navegador en cada autoguardado, y una imagen subida entre dos
guardados se perdería.

**REGLA — solo se cachea una RESPUESTA de Catastro, nunca un corte de conexión**
(2026-09-25). `imagenesDeCatastro` guardaba el resultado entero por RC pasara lo que
pasara, así que un `ECONNRESET` pasajero del WAF dejaba el expediente sin fachada ni
croquis **para toda la vida del proceso**: ni reabrir ni «Refrescar» volvían a
preguntar. Medido en 26RES093_9: la envolvente decía «Catastro no la tiene» y la ficha
de la oportunidad, quince minutos después, traía las dos. Ahora la caché es POR IMAGEN
y guarda solo la imagen o el «no la tiene»; un corte se reintenta UNA vez en serie y
sale marcado en `fallos`, que la pantalla dice con otras palabras («no ha respondido,
pulsa Refrescar»). `getFacadeImage` / `getParcelImage` / `getCoordinatesByRC` aceptan
`{ conFallos: true }` para LANZAR el corte en vez de devolver `null` (por defecto, lo de
siempre). ⚠️ Sin foto registrada Catastro contesta **200 con el cuerpo VACÍO y sin
tipo**: eso es «no la tiene», no un fallo — solo lo es un cuerpo que no sea imagen.

```bash
node implementation/backend/scripts/test_imagenes_cex.mjs
```
