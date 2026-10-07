<!-- conocimiento · área: instalador-rite · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El Certificado RITE se LEE al subirlo (2026-09-03)

Las fechas de PRUEBAS del Certificado de Instalación Térmica se tecleaban mirando el PDF
—y cuando no se tecleaban, la app las CONJETURABA desde las facturas: en una reforma la
primera factura puede ser la de las ventanas, así que el CIFO acababa fechado en una obra
que no es la instalación térmica—. Ahora se sueltan el certificado y la app lo archiva, lo
enlaza y lo LEE, igual que una factura de obra.

| Qué | Dónde |
|---|---|
| Lectura (prompt + esquema + recorte de páginas) | [riteOcrService.js](implementation/backend/services/riteOcrService.js) |
| Juicio y escritura (fechas, cruce con el expediente) | [riteCertificado.js](implementation/backend/services/riteCertificado.js) |
| Ruta del admin | `POST /api/expedientes/:id/rite/ocr` (multipart `files[]`), **staffOnly** |
| Subida del instalador | `POST /api/public/rite-upload/:id` — lee en `setImmediate`, sin que espere |
| Superficie | Fila **Certificado RITE** de `DocumentacionModule` (soltar, botón, o "Leer el de Drive") |
| Prueba sin escribir nada | `node scripts/probar_rite_ocr.js <driveFileId\|ruta.pdf> [nº expte]` |

**REGLA — solo se envían a leer las DOS PRIMERAS PÁGINAS.** A Gemini un PDF le cuesta **258
tokens por página** y estos certificados llegan con los acuses de recibo electrónicos
detrás (2,3 MB medidos): son páginas que no dicen nada de lo que se busca y se pagan igual.
El impreso oficial cabe entero en la primera. Medido sobre tres certificados reales:
**642 tokens de entrada y ~3 s**, unos **0,0005 €** por lectura. Si el recorte falla (PDF
cifrado o roto) se manda entero: leer de más cuesta céntimos, no leer no cuesta nada pero
tampoco sirve.

**REGLA — el modelo solo LEE; el juicio es del código.** Qué fecha se anota, si el
emplazamiento cuadra y qué se avisa lo decide `riteCertificado.js`, determinista y con las
dos cifras citadas. Mismo reparto que en las facturas de obra (`facturaIncidencias`).

**REGLA — las fechas se piden como TEXTO `dd/mm/aaaa` y las convierte `aISO()`.** Un `date`
pedido al modelo llega en el formato que le parezca, y una fecha de pruebas mal leída viaja
hasta el CIFO. Mismo motivo que los importes del OCR de lotes.

**REGLA — se anota la ÚLTIMA de las fechas de pruebas.** El impreso trae hasta ocho casillas
y lo normal es que lleven todas la misma; cuando no, la instalación no está probada hasta
que pasa la última, que es además la que `calcCifo` usa como fecha de fin.

**REGLA — se rellenan HUECOS, nunca se pisa lo escrito.** `resolveFechasRite` dice que lo
marcado a mano MANDA, y de esa fecha cuelgan las de inicio y fin de actuación del CIFO:
sustituirla en silencio por lo que lea una máquina es cambiar un documento que puede estar
ya presentado. Si difiere, se enseñan las dos y hay un botón "Usar la del certificado".

**REGLA — la comprobación del emplazamiento AVISA, no bloquea.** El impreso escribe la vía
como la tiene registrada Industria ("CALLE GARCÍA MORATO NUM: 30") y el expediente como la
escribió el Catastro: que no casen letra a letra es lo normal. Se compara por palabras
distintivas y por el NÚMERO DE PORTAL, que es lo que separa dos viviendas de la misma calle
—medido en 26RES080_62: el certificado dice el nº 9 y el expediente el 7—, y la referencia
catastral por sus 14 primeros caracteres. Lo esperado sale de `buildCertClienteData`, que
ya es la fuente única de la dirección de instalación: no se duplica aquí esa cascada.

**REGLA — lo leído viaja en el aviso al staff y se queda en el expediente.** La subida del
instalador ya mandaba un WhatsApp + email: ahora ese MISMO mensaje lleva la fecha anotada y
lo que no cuadra (no un aviso nuevo, ver el parte diario). Y la huella queda en
`documentacion.rite_ocr` —solo metadatos, regla 21—, porque una comprobación que se ve una
vez y se pierde al cerrar el popup no sirve de nada.

**Soltar un PDF en esa fila es soltar el CERTIFICADO.** Antes la fila lo recogía como
`cert_rite_signed_link`, que es la *memoria firmada* —el documento de al lado—. El fichero
va a `7. LEGALIZACION RITE` con el nombre canónico y al slot `cert_rite_drive_link`, por el
MISMO camino que la subida del instalador. **También el "Sustituir" del gestor**
(`handleSignedUpload`): caía en la subida genérica y lo dejaba en `6. ANEXOS CAE` llamado
`{nº} - CERT RITE DRIVE LINK_fdo.pdf`.

**REGLA — un slot validable DECLARA su nombre en `DOCUMENTO_VALIDABLE_LABELS`.** Es el
nombre con el que la validación copia el fichero a `10. EXPEDIENTE CAE`; el slot que falte
ahí no deja de copiarse, se copia con el nombre del CAMPO —`25RES060_93 - cert rite drive
link.pdf`, 9 expedientes en producción—, que en la carpeta que audita el verificador no
dice qué documento es. Y el RITE necesita sus **DOS** entradas con nombres DISTINTOS
(`cert_rite_drive_link` → *CERTIFICADO RITE*, `cert_rite_signed_link` → *Memoria RITE*): con
el mismo, el segundo que se valide archiva al primero en OLD. Por el mismo motivo se vació
`CAMPO_A_SLOT_VALIDABLE`, que mandaba la invalidación del certificado al slot de la memoria
—subir un certificado nuevo dejaba en verde el que nadie había revisado—. Lo ya copiado con
el nombre viejo: `node implementation/backend/scripts/renombrar_copias_auditoria.js`
(en seco sin `--execute`; deja a mano los expedientes donde existan los dos ficheros, porque
cuál vale no se puede decidir a ciegas).
