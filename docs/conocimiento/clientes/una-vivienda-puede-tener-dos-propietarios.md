<!-- conocimiento · área: clientes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Una vivienda puede tener DOS propietarios (2026-09-17)

La ficha de cliente solo tenía sitio para uno, así que lo que se hacía era meter
los dos en los campos del titular: medido en la ficha de Mónica Castellanos,
nombre = «CARLOS MÓNICA» y apellidos = «POVEDA OCHOA CASTELLANOS SÁNCHEZ». Eso
deja un nombre que no es el de nadie —y que es el que imprimen el Anexo I y el
Convenio— y, sobre todo, **UN teléfono y UN correo**: al otro propietario no se
le podía escribir.

Botón **«+ Añadir nuevo propietario»** en la ficha, con los mismos campos del
titular: empresa (sí/no), nombre o razón social, apellidos, DNI/CIF, email y
teléfono.

| Qué | Dónde |
|---|---|
| La columna | `clientes.copropietarios` (`scripts/clientes_copropietarios.sql`) |
| Saneado (claves admitidas, MAYÚSCULAS, tope) | `sanearCopropietarios` en [utils/normalization.js](implementation/backend/utils/normalization.js) |
| A quién se le puede escribir — frontend | `clienteContacts` en [utils/docContacts.js](implementation/frontend/src/features/expedientes/utils/docContacts.js) |
| …y su ESPEJO en el backend | `contactosDeCliente` / `CLIENTE_CONTACT_FIELDS` en [services/notifyContacts.js](implementation/backend/services/notifyContacts.js) |
| Superficie | Bloque **Propietarios** de `ClienteDetailModal` |
| Prueba | `node implementation/backend/scripts/test_copropietarios.mjs` |

**REGLA — un copropietario es DESTINATARIO, no FIRMANTE.** El Anexo I y el
Convenio de Cesión se siguen emitiendo a nombre del TITULAR y con su único
recuadro de firma: aquí no se ha tocado ni un documento (decisión de 2026-09-17).
Lo que se gana es poder mandarle a cualquiera de los dos —o a los dos— el
mensaje, los anexos y la petición de documentación. Se dice en pantalla, en las
dos caras de la ficha: si no, la pregunta «¿y entonces quién firma?» se contesta
suponiendo.

**REGLA — el destinatario AUTOMÁTICO no cambia.** `resolveSolicitudContacto`
sigue devolviendo el titular (o su persona de contacto si la ficha tiene el
desvío activo), que es de quien tiran el parte diario y los avisos que salen
solos. Un copropietario no recibe nada por su cuenta: se le manda porque alguien
lo marca. Sin esa separación, dar de alta a un segundo propietario duplicaría
todos los avisos automáticos de ese expediente sin que nadie lo hubiera pedido.

**REGLA — los dos ESPEJOS tienen que decir lo mismo, ids incluidos.** El popup
enseña la lista con `clienteContacts` y el backend manda con `contactosDeCliente`:
si los ids no coinciden (`cli` · `cop0`… · `cli_contacto`), se marca a uno y sale
a otro — y eso no falla, entrega el mensaje a quien no era. Es la misma regla que
ya rige `contactosDePartner`, y por eso el test los compara campo a campo.
⚠️ El índice del id es el de la LISTA ORIGINAL, no el de los ofrecidos: quien no
tiene ni teléfono ni email no se enseña (en un popup de envío es una fila que no
se puede marcar) pero **no corre a los demás**, o quitarle el teléfono a uno
reasignaría los destinatarios de los otros.

**REGLA — la lista se guarda ENTERA, nunca por partes.** Es la verdad de quién es
propietario; un patch parcial dejaría vivo a quien se acaba de quitar. Y el
saneado vive en `normalizeCliente`, no en la ruta, por lo mismo que el resto de
campos del cliente: en `clientes` escriben también el funnel, la aceptación de la
propuesta y el formulario de cobro.

**«Solicitar lo que falta» ofrece la lista solo si hay a quién elegir**
(`cliContacts.length > 1`). Con un solo propietario no hay nada que decidir y el
campo libre de siempre sigue sirviendo para dirigirlo a mano a un número que no
consta en la ficha. Al marcar a otro, el saludo del mensaje se rehace con su
nombre: escribirle al segundo propietario un mensaje que empieza por el nombre
del primero delata la plantilla y hace dudar de a quién va dirigido.

⚠️ De paso se arregló que **`persona_contacto_email` no se guardaba** ni en el
alta ni en el PUT de `/api/clientes`: el modal lo edita desde siempre y solo lo
escribían las rutas públicas. Es justo el campo del que tira `contactoCliente`
cuando el titular no da su correo.
