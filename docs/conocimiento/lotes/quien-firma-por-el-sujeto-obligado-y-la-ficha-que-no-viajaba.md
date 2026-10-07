<!-- conocimiento · área: lotes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Quién FIRMA por el SUJETO OBLIGADO, y la ficha que no viajaba (2026-09-19)

Dos cosas que salieron del mismo envío: un requerimiento de LOTE-2025-006 en el
que se marcó una ficha y **el correo salió solo con el Anexo I**.

### La ficha se quedaba en el navegador

Desde que las fichas RES se rellenan sobre el impreso oficial (regla 41), una
ficha es un **`formulario`** —no un `html`—. Pero los dos modales del lote
serializaban a mano los campos del documento antes de postearlos
(`docs: buildDocs().map(d => ({ html: d.html, … }))`) y ese campo no estaba en la
lista: la ficha llegaba al backend sin nada dentro, el bucle hacía `continue` y el
email salía con un documento menos **sin decirlo**. Afectaba a las DOS superficies
—el envío inicial al S.O. y el requerimiento— desde el 09/09/2026.

**REGLA — el documento viaja ENTERO** (`docParaEnvio` en
[logic/docEnvio.js](implementation/frontend/src/features/lotes/logic/docEnvio.js)),
nunca campo a campo. Un campo nuevo se añade ahí y lo heredan las dos.

**REGLA — un documento marcado que no se puede preparar ABORTA el envío**, con su
nombre. `enviar-so` y `requerimiento` respondían saltándoselo en silencio; un
correo que anuncia dos documentos y lleva uno deja al S.O. buscando el que no
llegó, y nadie se entera hasta el siguiente requerimiento. Todo o nada, mismo
criterio que el envío conjunto al instalador (regla 27).

### Y lo firma el apoderado que se ELIGE

INTERNACIONAL DE ALCOHOLES tiene DOS apoderados con poder para firmar: **PEDRO
JOSÉ LÓPEZ MONTERO** (06239730Z), que es el que consta en su ficha, y **JESÚS
ANTONIO ALMODÓVAR FUENTES** (06236833S), su director de operaciones. Su nombre y
su NIF van IMPRESOS en la casilla «Representante del solicitante» de cada ficha
RES y en la solicitud de emisión, así que cuál firma no es un detalle: es lo que
tiene que casar con el certificado del PDF que vuelve.

| Qué | Dónde |
|---|---|
| Lista de apoderados y quién está elegido | `representantesSo` / `representanteElegido` en [logic/soContactos.js](implementation/frontend/src/features/lotes/logic/soContactos.js) |
| El selector (compartido por los dos envíos) | [FirmantePicker.jsx](implementation/frontend/src/features/lotes/components/FirmantePicker.jsx) |
| Dónde se declaran | Ficha del S.O. → «Otros apoderados que pueden firmar» (`prescriptores.representantes`) |
| Comprobación de la firma que vuelve | [firmadosSo.js](implementation/backend/services/firmadosSo.js) |
| Prueba sin BD | `node implementation/backend/scripts/test_firmante_so.mjs` |

**REGLA — el PRINCIPAL no se duplica en la lista.** Sigue en
`nombre_responsable`/`nif_responsable` (o en `representante_*` si es otra
persona), que es de donde lo lee el resto de la app; `representantes` guarda solo
a LOS DEMÁS. Dos sitios contestando a «quién firma» es una contradicción esperando
a ocurrir. Un apoderado que repita el NIF del principal no se ofrece dos veces, y
el NIF se compara sin guiones («06239730-Z» es «06239730Z»).

**REGLA — con UN solo apoderado no se pregunta.** El selector no se pinta: una
pregunta cuya respuesta no puede cambiar se contesta sin leerla. Nada cambia en
los S.O. que solo tienen uno.

**REGLA — se SELLA a quién se le pidió la firma** (`documentos_so[].rep_nombre` /
`rep_nif`). De ahí salen las otras dos mitades: la página `/firmar-lote/:id` dice
el nombre del apoderado de ESA ronda —no el genérico de la ficha, que confundiría
justo a quien está a punto de firmar— y, cuando el PDF vuelve, `firmadosSo`
comprueba contra ÉL. Sin sello (lotes anteriores) vale cualquiera de los
declarados: se avisa solo si no firma ninguno, y el aviso los nombra a todos.

**REGLA — la SOLICITUD de emisión sale a nombre del que firmó las fichas.** Se
toma del sello del lote, no se vuelve a preguntar: una carátula a nombre de uno
con sus adjuntos firmados por otro es lo primero que cruza quien la revisa.

⚠️ `deriveSoEnvio` pasa a resolver el representante con `representantesSo`, que sí
mira `representante_distinto` —antes leía `nombre_responsable` a pelo mientras la
comprobación de firmas usaba el otro—. Hoy no cambia ningún documento (el S.O. lo
tiene desactivado), pero eran dos criterios para el mismo dato.
