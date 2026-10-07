<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)»; la introducción y el resto, en esta misma carpeta.

### Y el CONTORNO del ADOSADO, desde el mismo enlace (2026-10-01)

Lo pidió el usuario con 2026CEE_60 (un piso de una finca en hilera, medida entera): delimitar la
vivienda con el dedo, validarla y después decir qué es medianera y qué fachada. Pestaña nueva
**«Vivienda»** en el teléfono (Vivienda · Croquis · Fotos), con dos sub-pestañas:
**Contorno** (tocar las esquinas) y **Paredes** (decir contra qué da cada una). El botón
«Delimitar adosado» del ordenador lleva al lado un 📱 que abre el QR **ya en esa pestaña**
(`modo: 'vivienda'` en la sesión).

| Qué | Dónde |
|---|---|
| Imán de las esquinas, cierre, lienzo↔mundo, resumen de paredes (puro) | [logic/contornoMovil.js](implementation/frontend/src/features/cee-envolvente/logic/contornoMovil.js) |
| La pestaña del teléfono | [ViviendaMovil.jsx](implementation/frontend/src/features/cee-envolvente/components/ViviendaMovil.jsx) + `CroquisMovilView` |
| Sesión: contorno a medias, pedido de delimitar, cola de «contra qué da», planta al día | `pedirVivienda` · `pedirContra` · `responderContra` · `actualizarPlano` en [croquisMovil.js](implementation/backend/services/croquisMovil.js) |
| Rutas del teléfono / del ordenador | `POST /api/public/croquis-movil/:token/vivienda` · `…/contra` / `POST …/croquis-movil/:token/resultado-contra` · `…/plano` |
| Lo aplica el ordenador | `delimitarDesdeMovil` · `reclasificarDesdeMovil` en `EnvolventeView` |
| Pruebas | `node implementation/backend/scripts/test_croquis_movil.js` · `test_contorno_movil.mjs` |

**REGLA — el recorte es EL MISMO que el del botón del ordenador.** El teléfono manda el polígono en
SU lienzo; el ordenador lo pasa al mundo con el `marco` de la sesión (`contornoAlMundo`) y llama a
`volverAMedir({ recorte_vivienda })`, lo mismo que `cerrarRecorte`. Va por la MISMA cola que el
ajuste del croquis (`pedido.tipo === 'vivienda'`): los dos vuelven a medir y no caben dos a la vez.
La respuesta lleva la planta nueva y el contorno en el lienzo del teléfono (`recorteMundo` en
`respuestaParaElMovil`), y el teléfono pasa solo a «Paredes» y encuadra la casa.

**REGLA — un toque pone UNA ESQUINA, y se pega**: primero a la esquina más cercana, si no a la pared
más cercana —el punto de la fachada donde empieza la casa de al lado—, con un radio de dedo topado en
1,6 m; lejos se queda donde se toca (por la calle y el jardín se puede pasar). Tocar la primera, con
tres o más, cierra. **Un dedo arrastrado MUEVE el plano** (como en Fotos), dos amplían. El contorno a
medias viaja con el estado entero (`actualizar({ contorno })`) y el ordenador lo pinta en su plano
según se dibuja; sin la clave (un teléfono con la página de antes) no se toca.

**REGLA — lo que se dice de una pared va a una COLA, en orden** (`s.contras`; sobre la misma pared
manda lo último). Lo aplica el ordenador con el MISMO `reclasifica` del panel de la pared
(`contraParaReclasificar`: decir lo que dice Catastro es volver a lo de Catastro) y avisa si queda una
fachada sin rumbo o huecos en una pared que ya no da fuera. En el teléfono se ve al momento; lo
confirma la meta de paredes, que ahora lleva `tipo` y `catastro`.

**REGLA — si el ordenador vuelve a MEDIR con el móvil conectado, el teléfono se pone al día**
(`planoParaElMovil` → `…/plano` → `planoV`). Antes, quitar un cuerpo o delimitar desde el ordenador
dejaba al teléfono tocando paredes que ya no existían. Se manda cuando el plano se ha sembrado con
esa geometría (los muros traen su `svg_catastro`), no antes: si no, irían con el tipo de la pared vieja.

**«Delimitar adosado» ya no se esconde con el móvil conectado**: la barra morada del croquis lo
lleva debajo (o el contorno ya aplicado, con ✎ y ✕). Escondido, que era justo el caso del bloque en
hilera, no había forma de encontrarlo.

**Y la FOTO AÉREA también en el teléfono** (botón «Foto»/«Mapa» con los del encuadre; la sesión lleva
`georef` y el teléfono pide las teselas del PNOA con `teselasOrtofoto`, como el ordenador): en una
hilera, los tejados dicen dónde acaba cada casa. La elección se recuerda en el teléfono.

⚠️ Verificado en un banco local (app construida + servicio real + ordenador simulado), no con la
ventana logueada ni con un teléfono de verdad: dibujar, pegar a la fachada, delimitar, cambiar una
pared, quitar el contorno y recargar a medias. La parte del ordenador (barra, contorno en directo,
`delimitarDesdeMovil`) solo ha pasado lint y build.
