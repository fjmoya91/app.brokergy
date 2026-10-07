<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### Traer las fotos del WHATSAPP al repartidor (2026-09-30)

Muchos clientes no usan el enlace de subida: mandan las fotos al WhatsApp de la
empresa. Botón **💬 Traer fotos del WhatsApp** en el gestor de documentación (solo
STAFF, solo oportunidades CAE): se eligen los chats y el periodo, se ve lo que ha
llegado y lo marcado se baja y entra en el **repartidor** de siempre, que propone el
apartado y espera a que una persona lo confirme. Es la opción MANUAL; no hay nada que
escuche los mensajes ni que se dispare solo.

| Qué | Dónde |
|---|---|
| Contactos, lectura del chat, descarga, marcas | [whatsappMedia.js](implementation/backend/services/whatsappMedia.js) |
| Rutas (**staffOnly**) | `GET /api/oportunidades/:id/whatsapp-media/contactos` · `POST …/buscar` · `GET …/descargar?msg=` · `POST …/colocadas` |
| Popup | [TraerDeWhatsapp.jsx](implementation/frontend/src/features/docs/TraerDeWhatsapp.jsx) → `BuzonFotos` (prop `onColocadas`) |
| Qué mensajes ya se colocaron | tabla `whatsapp_media_importada` (`scripts/whatsapp_media_importada.sql`, ya en producción) |
| Prueba de lo puro | `node implementation/backend/scripts/test_whatsapp_media.js` |
| Probar la pantalla sin la sesión real | `WA_MEDIA_SIMULADO=1` con WhatsApp apagado (lo lleva `backend-alt`): fotos del tutorial |

**REGLA — se habla con WhatsApp Web DIRECTAMENTE** (`WAWebCollections`,
`WAWebChatLoadMessages.loadEarlierMsgs`, `WAWebDownloadManager`), nunca con
`fetchMessages()` ni con `Message.downloadMedia()` de la librería: las dos pasan por
el `serialize()` que WhatsApp rompió. `BAJAR` es lo que hace `downloadMedia` de
whatsapp-web.js 1.34.7, sin el modelo serializado. Nada de esto está en el camino de
ENVÍO (lo que rompía la sesión era `getChatById`/`sendSeen` ahí).

**REGLA — de una en una y con plazo**: todo lo que toca el Chrome va en fila
(`enSerie`) y con `conPlazo`; dos plazos agotados seguidos cortan la lectura. Cada
chat carga como mucho 1.500 mensajes / 40 lotes, y un adjunto de más de 50 MB se
marca y no se baja (viaja en base64 por el protocolo de depuración).

**REGLA — solo se baja lo que salió de un chat leído para ESE expediente.** El id
del mensaje lleva el chat dentro (`chatDeMsgId`) y se comprueba contra los chats
recién leídos para esa oportunidad (`permitir`, 3 h); si no, el botón bajaría
cualquier foto de cualquier conversación. **No se crean chats**: el número se busca
como `@c.us` y por su `@lid` (`WAWebApiContact.getCurrentLid`), sin abrir nada.

**REGLA — lo recomendado es lo del CLIENTE** (titular, propietarios, persona de
contacto y chats vinculados a mano). El chat de un INSTALADOR se ofrece sin marcar y
con aviso —puede traer fotos de sus otras obras—, y un número que está en las dos
fichas también. Se puede teclear otro número (la hija que manda las fotos).

**REGLA — lo colocado se APUNTA, y es una pista, no un candado.** Al subir, el
repartidor avisa de qué mensaje salió cada foto y se guarda en
`whatsapp_media_importada` (la subida renombra el fichero y el slot no sabría de
dónde vino). La próxima vez sale "✓ Ya colocada · Caldera" y sin marcar, y si está
en OTRA obra ("En 26RES060_190") tampoco se marca. Se puede volver a traer.

Lo que no se baja se dice con su motivo (`caducado`: WhatsApp ya no la tiene en sus
servidores y hay que pedírsela otra vez; `no_encontrado`; `grande`), y un chat que no
llegó a cargarse entero sale como "no se ha podido cargar todo el periodo". Una foto
mandada "como documento" se marca **original, sin comprimir**: es la buena para leer
una placa. En el repartidor se enseña lo que escribió el cliente al mandarla.

**REGLA — MOBILE FIRST, y cómodo en el PC.** El popup y el REPARTIDOR son **hoja
inferior** en el móvil (con asa, `94dvh` y el área segura del iPhone en el pie) y
centrados en el PC; controles de **44 px** y campos a **16 px** en el móvil (iOS amplía
la página por debajo), compactos desde `md:`. En el PC, **Esc** cierra (salvo leyendo o
bajando) e **Intro** en el número busca. ⚠️ El repartidor pasa a ir **portaleado a
`body`**: dentro del modal de documentación (con `backdrop-blur`) su cabecera quedaba
tapada por la barra de la app en el móvil. Y su desplegable lleva `no-uppercase`: en
mayúsculas y a 16 px no se leía el apartado.

⚠️ **PENDIENTE de medir en el VPS**: `LEER_CHAT` y `BAJAR` corren dentro de la sesión
real y en local no se pueden ejercer. La miniatura sale de `m.body` (en un mensaje con
foto es la miniatura en base64); si WhatsApp la mueve, la lista sale con iconos y todo
lo demás funciona. Y hay que comprobar que leer y bajar no afecta a los envíos (ACK).
