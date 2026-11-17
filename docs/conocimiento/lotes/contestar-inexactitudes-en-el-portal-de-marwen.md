<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## Contestar las inexactitudes en el portal de Marwen (beCAE), no por API (2026-11-11)

La API de Marwen ([marwenService.js](implementation/backend/services/marwenService.js)) crea la
solicitud y, desde la v1.6.0 (11/11/2026), también CONSULTA las inexactitudes (ver
[la-api-de-marwen-v1-6.md](docs/conocimiento/lotes/la-api-de-marwen-v1-6.md)). Pero **no**
permite contestar un informe de inexactitudes; Fran lo confirmó el 11/11/2026 y la guía v1.6.0
tampoco lo trae. La contestación se sube a mano en el portal web `https://cae.marwen.es`.
Ese día lo hizo Claude con Claude en Chrome, para CAE-2041 (LOTE-2026-016).

**REGLA — la contestación se sube en UNA subida: el escrito firmado y todos los `_v1`, con una
nota.** Es la carpeta plana «N. REQUERIMIENTO» del lote (ver
[las-inexactitudes-del-verificador-se-registran-y-la-respuesta-se-arma-sola.md](docs/conocimiento/lotes/las-inexactitudes-del-verificador-se-registran-y-la-respuesta-se-arma-sola.md)).
Solo se sube con el «sí» de Fran para ESA subida.

Lo hace la skill `contestar-inexactitudes-marwen`. Para bajar la carpeta y comprobarla se usa
`node implementation/backend/scripts/bajar_requerimiento_lote.js <LOTE> [--ronda N] [--destino dir]`,
que solo lee de Drive y avisa de subcarpetas, `.txt`, piezas sin `_v1` (acepta `_v1_fdo`, la pieza re-firmada: en LOTE-2026-018 avisaba en falso del Anexo I del 128, 11/11/2026) y escrito sin `_fdo`.

### Pasos (medidos el 11/11/2026, beCAE versión 4.34.3)

1. **Sesión.** La inicia Fran: Claude no escribe contraseñas.
2. **Menú «Expedientes».** La fila del expediente (`CAE-XXXX`, con el `LOTE-…` en «Nº Pedido»)
   muestra en «Estado inexactitudes» algo como «8 Pte. Doc.». Se pulsa **«Abrir»** de esa fila,
   que lleva a `https://cae.marwen.es/control/CAE-XXXX`.
3. **Pestaña «Inexactitudes».** Tiene la tabla de las inexactitudes, «Versiones generadas» (el
   informe) y «Documentos subidos».
4. **Botón «Subir documentos»** (naranja, arriba a la derecha). Abre «Nota para la subida», con
   una **nota obligatoria** (hasta 2000 caracteres) y «Seleccionar archivos».
5. **Archivos.** El `input type=file` está oculto. Con `file_upload` se le pasan las rutas
   locales, en tandas de **menos de 10 MB** por llamada. Cada tanda **se AÑADE** a la lista: no
   la sustituye. Primero se bajan de Drive los PDF de «N. REQUERIMIENTO».
6. **Nota modelo:** «Contestación al informe de inexactitudes de {fecha} ({LOTE}). Se aporta el
   escrito de contestación firmado, que responde a las inexactitudes nº 1 a N, junto con los
   documentos corregidos de las actuaciones E…, identificados con su código y el sufijo _v1.»
7. **«Continuar»**, solo con el «sí». Sale «Subiendo...» (42 MB tardaron unos 30 s). Después
   aparece en «Documentos subidos» como «N SUBIDA 1», y el expediente pasa de «En resolución» a
   **«Reestudio documental»**. Se comprueba con el botón «Documentos» de esa fila, que lista los
   ficheros subidos.

Cada inexactitud tiene también un campo propio de «Acciones correctivas» (el ojo de la columna
ACC.). En CAE-2041 no se rellenó, porque el escrito ya contesta a todas.

### La segunda ronda: el «convenio CAE actualizado» (2026-11-17)

El informe 2 de CAE-2041 (16/11/2026) cerró siete de las ocho inexactitudes. La nº 7 (coordenadas
UTM de E8) siguió abierta con esta observación: «no se aporta el convenio CAE actualizado». El
Certificado de obra, el Acuerdo de cesión y el informe fotográfico ya llevaban la UTM corregida.
Lo que pedía era el **Anexo I del lote** (Listado de cesión de ahorros, el anexo del Convenio CAE
con el S.O.), firmado el 05/11 con la UTM antigua. La BD ya tenía la buena, así que bastó con
regenerarlo.

**REGLA — Si una inexactitud cambia un dato que figura en el listado del lote, en la MISMA
contestación va el Anexo I del lote regenerado y firmado de nuevo por el S.O. y por Brokergy.**
Si no, el verificador deja la inexactitud abierta, aunque el resto de documentos ya estén
corregidos, y hace falta otra ronda.

Así se hizo, y es lo que lleva la skill `contestar-inexactitudes-marwen` en «Antes de subir»:

1. **Reenvío.** Se hizo desde el popup «Requerimiento · volver a pedir la firma» del lote, solo
   con el Anexo I. Antes de enviar se comprobó la vista previa: la fila de E8 corregida y las otras
   siete idénticas a la firmada, ahorro incluido.
2. **INTERALCO lo devolvió** al día siguiente, firmado solo por él. El buzón lo dejó sin registrar
   por falta de la segunda firma (regla 141), como debe.
3. **Contrafirma, registro y `_v1`** con
   [contrafirmar_anexo_i_lote.js](implementation/backend/scripts/contrafirmar_anexo_i_lote.js).
   Sustituye a los scripts sueltos de los LOTE-2026-015, 019 y 016. `colocarRefirmados` deja las
   copias como `…_rev1_fdo.pdf` y el script las renombra a `…_v1.pdf`.
4. **Escrito de la ronda.** Solo la nº 7, firmado. «2. REQUERIMIENTO» quedó con dos PDF.
5. **Subida 2** en el portal: el expediente volvió a «Reestudio documental».

**Fallo encontrado y corregido el mismo día.** El correo del requerimiento se mandó desde el PC
(`localhost:5184`), y el botón «Firmar / subir mis anexos» le llegó al S.O. apuntando a
`http://localhost:5184/firmar-lote/…`. La ruta usaba el `frontendOrigin` del navegador. Ahora
`origenPublicoFirma` ([routes/lotes.js](implementation/backend/routes/lotes.js)) descarta
`localhost`/`127.0.0.1` y pone `https://app.brokergy.es`. Afecta a los tres envíos al S.O.: el
envío del Anexo I y las fichas, el documento suelto y el requerimiento.
