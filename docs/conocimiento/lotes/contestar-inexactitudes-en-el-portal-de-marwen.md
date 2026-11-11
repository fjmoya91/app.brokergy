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
