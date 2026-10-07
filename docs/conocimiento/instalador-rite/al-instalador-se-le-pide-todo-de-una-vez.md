<!-- conocimiento · área: instalador-rite · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Al instalador se le pide TODO de una vez (2026-08-27)

Al instalador se le piden dos cosas y en momentos distintos: **firmar el CIFO** y
**registrar el RITE** y devolvernos el certificado. Se pedían por separado, cada una
desde su popup y **con su propio enlace**. Un enlace por tarea es un enlace que se
pierde: el instalador abría el primero, resolvía lo que veía, y de lo otro no se
enteraba nadie hasta que alguien lo reclamaba por teléfono.

Ahora, al enviar cualquiera de los dos, la app **comprueba si el otro también falta**
y ofrece mandarlo en el MISMO mensaje — el mismo gesto que el Anexo I + Cesión con el
cliente.

### Fuentes únicas

| Qué | Dónde |
|---|---|
| ¿Qué le falta al instalador? + los TEXTOS de los tres mensajes | [logic/instaladorPendientes.js](implementation/frontend/src/features/expedientes/logic/instaladorPendientes.js) |
| El envío (adjuntos + email + WhatsApp + resultado por canal) | `POST /api/expedientes/:id/instalador/enviar` |
| Lo que ve el instalador | `/instalador/:id` → `SubirInstaladorView` + `FirmarCifoCard` / `SubirRiteCard` |

El backend importa `instaladorPendientes.js` por `import()` dinámico (igual que
`cifoService` con `cifoDoc.js`): lo consumen los DOS popups, la ruta de envío, la
página pública y el barrido de "qué falta". Si esa decisión se duplicara, el mensaje
prometería un documento que la página no pide — o al revés.

**REGLA — el `cert_rite_drive_link` es el CERTIFICADO RITE, no nuestra Memoria.**
`/memoria-rite/generate` guardaba ahí la Memoria (Word) que generamos NOSOTROS, que es
justo el campo donde la subida pública deja el certificado que devuelve el instalador.
Consecuencia medida sobre producción (**13 expedientes**): generar la memoria dejaba el
expediente diciendo que el RITE ya estaba aportado — y con él vía libre para emitir el
CIFO, porque "el CIFO no se emite sin RITE" era en la práctica "sin haber generado la
memoria". La memoria vive ahora en `memoria_rite_docx_link`. Para los expedientes
anteriores, `esMemoriaRiteEnDriveLink()` aplica la heurística (hay borrador generado y
no hay campo nuevo ⇒ ese enlace es la memoria) y **ante la duda asume que NO tenemos el
RITE**: ofrecer pedirlo de más lo corrige una persona con un clic; darlo por recibido de
menos deja el expediente parado sin que nadie se entere. Deshacer la ambigüedad de una
vez, leyendo el NOMBRE del fichero en Drive:

```bash
node implementation/backend/scripts/separar_memoria_rite_de_certificado.js --execute
```

**REGLA — nada se genera a espaldas de nadie.** El popup del RITE solo ofrece el CIFO si
YA existe su borrador (`cert_cifo_drive_link`): un CIFO que nadie ha revisado vuelve
firmado y hay que rechazarlo (regla 24). El popup del CIFO solo ofrece el RITE si el
expediente pasa `GET /memoria-rite/check` — la MISMA validación que el popup de
generación, la que evita memorias con huecos. Lo que no se puede mandar se dice POR QUÉ
en vez de desaparecer.

**REGLA — el adjunto del CIFO se DESCARGA DE DRIVE, no se vuelve a rasterizar.** Lo que
el instalador firma es el PDF que le sirve su enlace desde `cert_cifo_drive_link`. El
modal guarda primero (`replaceExisting`, y si falla NO se envía) y el backend adjunta ese
mismo fichero. Antes el email y el WhatsApp rasterizaban cada uno su propio HTML: tres
renders del mismo documento que podían no coincidir.

**REGLA — todo o nada.** Los adjuntos se preparan ANTES de mandar nada: un mensaje que
anuncia dos documentos y solo lleva uno deja al instalador buscando lo que no llegó. Si
el microservicio RITE está caído, se dice y se ofrece la salida (desmarcar el RITE).

**REGLA — se sella la fecha de envío de CADA documento que ha viajado**
(`cert_cifo_sent_at` y/o `borrador_cert_sent_at`). Sellar solo el del popup por el que se
entró dejaba el otro diciendo "sin enviar" el día después de mandarlo — y el parte diario
reclamándolo.

### Un CIFO firmado NO cierra la tarea para siempre (2026-09-03)

Tras un **requerimiento** se corrige el certificado y hay que firmarlo otra vez. Pero
`estadoInstalador` daba el CIFO por recibido con solo existir `cert_cifo_signed_link`,
así que el enlace que iba DENTRO de ese mismo correo —`/instalador/:id`— le decía al
instalador **"¡Todo recibido! No queda nada pendiente por tu parte"** y no le ofrecía
firmar nada. Medido en 26RES060_127 el 03/09/2026.

**REGLA — reenviarle el CIFO teniendo ya uno firmado ANULA esa firma.** `POST
/:id/instalador/enviar` sella `cert_cifo_refirma_at` cuando manda el CIFO y
`estado.cifo.firmado` ya existe —da igual la plantilla: si se lo vuelves a mandar es
que el que tienes no vale—, y con esa marca `cifo.recibido` pasa a false. La cierran las
DOS vías por las que puede llegar el firmado nuevo: la subida pública
(`POST /api/public/cifo-upload`) y cualquier escritura desde la app
([mergeDocumentacion](implementation/backend/utils/mergeDocumentacion.js), que además
sella `cert_cifo_signed_at`). El popup lo dice ANTES de enviar: es una consecuencia
irreversible del botón, no un efecto secundario.

**REGLA — el SELLO DE RE-FIRMA tampoco retrocede, y esa es la parte que faltaba.**
La marca la escribe un endpoint dedicado (la RPC de `/instalador/enviar`, o la ruta de
requerimiento), así que la copia hidratada del navegador no la trae — y NO bastaba con
eso: en cuanto la clave EXISTE en la BD (se pone a `null` al llegar una firma), esa copia
la lleva con el null y el siguiente autoguardado BORRA el sello recién escrito. Medido en
**26RES060_179** (18/09/2026): CIFO reenviado por requerimiento a las 07:34:37, sello
escrito, y el PUT de "marcar como enviado" a las 07:34:38 lo dejó otra vez en `null` — el
enlace de ese MISMO email le decía al instalador *"¡TODO RECIBIDO! No queda nada pendiente
por tu parte"*. Afectaba a los tres documentos (`{doc}_refirma_at`) y a las tres vías que
lo sellan. `mergeDocumentacion` lo conserva salvo que en ese mismo guardado llegue una
firma POSTERIOR al sello — que es el caso legítimo de la subida del firmado desde la app,
donde Drive puede devolver el mismo enlace y solo cambia `signed_at`. Vigilado en
`test_refirma_requerimiento.js`.
⚠️ Y `requerimiento_firma` —el contexto que la página de firma le explica al cliente
(importes y plazo)— estaba en la **BLACKLIST de `normalizeData`**: su `docs` son las
claves de `BORRADORES_CLIENTE` en minúscula y se guardaban como `['ANEXO_I',...]`, así que
`refirmaPendiente().requerimiento` salía `null` y ese aviso no se pintaba. Se corrige la
escritura y se lee sin distinguir mayúsculas, porque lo ya guardado tiene que poder leerse
(mismo rescate que `leerSubvenciones`, regla 56).

**REGLA — el `_drive_at` NUNCA retrocede.** La vista del expediente reenvía
`documentacion` entera desde una copia hidratada al abrirla, así que un guardado
posterior traía el sello ANTERIOR y lo pisaba: medido en 26RES060_127, el borrador era el
de las 15:36 y `cert_cifo_drive_at` seguía diciendo 25/08. Con el sello atrasado, un
rechazo viejo vuelve a bloquear un borrador ya corregido (regla 24). `mergeDocumentacion`
se queda siempre con el máximo.

**REGLA — "firmado" y "firmado de ESTA versión" no son lo mismo, y se dice.** Con
`cert_cifo_signed_at` anterior a `cert_cifo_drive_at`, el borrador se regeneró DESPUÉS de
la firma: lo que guardamos es de una versión anterior (`cifo.firmaDesfasada`). No bloquea
—hay motivos legítimos para regenerar— pero sale avisado en la fila del CIFO: es lo que
explica un "me lo han firmado con la versión mal". Sin `cert_cifo_signed_at` (expedientes
anteriores a este sello) no se puede comparar y **no se afirma nada**.

**REGLA — el radar cuenta la re-firma como firma pendiente.** `detectarFirmaPendiente`
salía por `if (signed) continue`, así que el reenvío de una re-firma no lo vigilaba nadie
y podía quedarse meses sin que el parte diario dijera una palabra.

⚠️ El saludo salía **"Hola Otro,"**: `Otro contacto…` es el rótulo del BOTÓN, no el nombre
de nadie. `primerNombre` descarta los nombres genéricos y saluda en genérico.

### La página del instalador — `/instalador/:id`

Un enlace, todas sus tareas. **Solo se enseña lo que QUEDA**: lo ya recibido baja a una
línea con su ✓ (es la prueba de que llegó, que es lo primero que se pregunta, pero no
puede ocupar el sitio de lo que falta). La primera pendiente se abre sola.

**REGLA — la superficie de cada tarea es la MISMA que la de su página suelta.**
`FirmarCifoCard` y `SubirRiteCard` se comparten con `/subir-cifo` y `/subir-rite`, que
siguen vivas porque sus enlaces ya viajan en mensajes enviados y en los recordatorios del
parte diario. Si aquí se firmara distinto que allí, un CIFO rechazado se podría volver a
firmar por el camino que no lo comprueba.

**La memoria firmada solo se le pide si alguna vez le mandamos una** (`pide_memoria`):
pedirle "la memoria que os enviamos, firmada" a quien no ha recibido ninguna es pedirle
un documento que no existe.
