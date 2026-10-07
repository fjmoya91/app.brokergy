<!-- conocimiento · área: propuesta · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Versiones de la PROPUESTA (2026-08-25)

Enviar una propuesta **no dejaba copia de nada**: el PDF se generaba al vuelo para
WhatsApp, el email lo rasterizaba el backend desde el HTML, y `html_propuesta` se
SOBRESCRIBÍA en cada envío. Con dos envíos (precio corregido, alcance ampliado) no
había forma de saber qué documento tenía el cliente delante ni cuál aceptó.

Fuente única: [propuestaVersiones.js](implementation/backend/services/propuestaVersiones.js).
Rutas en `oportunidades.js` (`/:id/propuesta/versiones · /version · /version/:v · /borrador`),
RPC en `scripts/propuesta_versiones.sql`.

**REGLA — la versión sube cuando la propuesta SALE, no cuando se guarda.** El botón
"Guardar en Drive" de la vista previa deja un BORRADOR de nombre fijo que se reemplaza
a sí mismo y NO consume número. Si contara, el contador dejaría de significar "lo que
ha visto el cliente", que es lo único que hace falta saber cuando alguien pregunta por
qué propuesta va la conversación. De paso arregla que cada pulsación dejara **otra
copia con el mismo nombre** (Drive lo admite): la carpeta acumulaba PDFs
indistinguibles entre sí.

**REGLA — se archiva EXACTAMENTE el PDF que se envía.** Se genera UNA vez, se archiva
en `0. PROPUESTAS` como `Propuesta_{expte}_v{N}.pdf`, y ese mismo buffer viaja al email
(`pdfBase64`, que `send-proposal` ya aceptaba) y a WhatsApp. Antes cada canal
rasterizaba su propio HTML —el del email lleva otro envoltorio—, así que **el adjunto
del correo y el de WhatsApp ni siquiera eran el mismo documento**. Si el PDF no se
puede preparar, **no se envía nada**: mismo criterio que el CIFO (regla 24).

**REGLA — el número lo asigna la BD.** `propuesta_version_add` calcula MAX+1 dentro del
UPDATE, que bloquea la fila; un MAX+1 leído desde Node daría el mismo número a dos
envíos simultáneos. `propuesta_version_merge` sella después (enlace de Drive, resultado
por canal, aceptación) con MERGE `||`, nunca reemplazo: esos tres datos llegan en
momentos distintos y separados por días.

**REGLA — en BD solo metadatos y el enlace (regla 21).** `html_propuesta` pesa **353 KB
de media y hasta 1,35 MB** (medido el 2026-08-25 sobre las 364 oportunidades), y
`datos_calculo` ya llega a 5,3 MB en el peor caso: guardar el HTML de cada versión
repetiría la caída de julio. El histórico son PDFs en Drive.

**REGLA — la marca va IMPRESA en el documento, no solo en el nombre del fichero.** El
nombre del adjunto se pierde en cuanto el cliente lo abre; dos PDFs con cifras
distintas encima de la mesa siguen siendo indistinguibles sin ella. Va en la portada
("Propuesta Nº … · Versión 2" + "Esta versión anula y sustituye a las anteriores") y en
el pie de cada página. **La v1 no se marca**: un documento que solo ha salido una vez no
tiene con qué confundirse. `marcaVersion` entra en las dependencias del `useLayoutEffect`
que ajusta la portada — llega por fetch DESPUÉS de que el ajuste haya convergido, y sin
rearmarlo la línea extra desbordaría por debajo del pie negro.

**REGLA — qué versión aceptó el cliente se SELLA.** El enlace público es el mismo
siempre, así que quien recibió la v1 y entra hoy ve la v2 y la acepta sin saberlo. Se
graba `propuesta_version` en la entrada de aceptación del historial **y** `aceptada_at`
en la propia versión (las dos caras: el listado de versiones se lee sin el historial
delante). Y se le **dice en pantalla** antes de firmar: "Estás aceptando la versión 2…".

**REGLA — copiar el enlace de aceptación ES ENTREGAR la propuesta, y cuenta como tal.**
El botón de la barra de la vista previa da el MISMO `{APP_URL}/firma/{uuid}` que va dentro
del mensaje de envío, para pasárselo al cliente por donde estés hablando con él. Al otro
lado está el formulario de aceptación: en cuanto lo firma, la oportunidad pasa a ACEPTADA
y nace el expediente. Si copiar no dejara rastro tendríamos **una propuesta aceptada de la
que no existe copia**, la oportunidad habría saltado de PTE ENVIAR a ACEPTADA sin pasar por
ENVIADA (y sin mover su carpeta de Drive), y el enlace serviría una vista web vieja o
ninguna — `html_propuesta` solo lo escribe `send-proposal`, por el que aquí no pasa nadie.

Así que copiar hace lo mismo que un envío **salvo mandar el mensaje**: registra su versión
(archiva el PDF), guarda `htmlWeb` como `html_propuesta` y pasa a ENVIADA. El estado lo
cambia `PATCH /:id/estado` desde el front, **no la ruta de versión**: es la que además
sincroniza la carpeta de Drive (regla 2). En el historial se dice lo que de verdad consta
—"🔗 entregada por enlace"—, nunca "enviada": no sabemos si llegó ni a quién se lo pasó, y
quien lea eso dentro de tres meses no debe buscar un correo que nunca existió.

Se copia PRIMERO y se registra después, sin bloquear: `navigator.clipboard` necesita el
gesto del usuario y esperar a la red antes de escribir el portapapeles lo pierde en algunos
navegadores. Si el registro falla, el acuse dice "Copiado · sin registrar" — el enlace ya
está en el portapapeles y no puede presentarse como si no se hubiera copiado. ADMIN-only,
igual que el botón de enviar de esa misma barra: pasar el enlace es poner la propuesta en
manos del cliente y no puede tener menos control que mandarla. El acuse va en el propio
botón, no en un popup que habría que cerrar antes de poder pegar.

**El aviso de reenvío va ANTES de pulsar**, con a quién y cuándo se envió la anterior:
es el dato que cambia lo que le escribes en el mensaje. Y el historial pasa a decir
"📄 Propuesta v2 enviada por email + whatsapp a Cliente, Instalador · Cambios respecto a
la anterior: inversión 12.400 € → 11.900 €" — antes solo decía "ENVIADA", sin
destinatario ni canal, así que no servía para reconstruir la conversación. Los importes
(`inversion`, `caeBonus`, `irpfDeduction`, `totalAyuda`) se sellan por versión para poder
decir qué cambió sin recalcular ni rasterizar nada.
