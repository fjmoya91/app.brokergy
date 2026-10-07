<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La FECHA DE REGISTRO del CEE se LEE del justificante (2026-09-07)

Al subir el justificante de registro, la app sellaba
`documentacion.fecha_registro_cee_{fase}` con el **día de la subida**. Eso solo es
verdad cuando el técnico lo sube el mismo día: en cuanto se sube un registro viejo
—un expediente que se pone al día, un migrado, un certificado que llevaba semanas en
el correo— el expediente afirma que se registró hoy.

No es un dato decorativo. De la fecha de registro del CEE inicial cuelgan el plazo de
la obra, el **devengo de la facturación del certificador** (que factura por hito de
registro, no por expediente) y la comprobación de que **las facturas no son anteriores
al registro** (`facturaIncidencias`). Una fecha inventada marca errores que no lo son
y esconde los que sí.

La fecha está IMPRESA en la primera página del justificante:

> «Este es el número de registro 3014080/2025 solicitado el 19/07/2025 a las 09:35:54»

| Qué | Dónde |
|---|---|
| Lectura (prompt + esquema + recorte a la 1ª página) | [registroCeeOcrService.js](implementation/backend/services/registroCeeOcrService.js) |
| Superficies que la sellan | rejilla del CEE (`/documents/upload`, CAE y directos) · enlace público del certificador (`/cee-upload`, `/cee-directo-upload`) |
| Releer un justificante YA subido | `POST /:id/cee/fecha-registro/leer` (**staffOnly**) — declarada en las DOS rutas del módulo CEE |
| Botón | ⟳ junto al campo **Registro** de la rejilla, solo si hay justificante |
| Corregir lo ya sellado | `node scripts/releer_fechas_registro_cee.js [--execute] [--expte=…]` |
| Probar sin escribir nada | `node scripts/probar_registro_cee_ocr.js <driveFileId\|ruta.pdf> [nº expte]` |

**REGLA — el modelo solo LEE; la fecha la decide el código.** `resolverFechaRegistro`
es determinista: pide al modelo la **frase literal** de donde sale la fecha y
**reextrae la fecha DE ESA FRASE** (`fechaDesdeFrase`), que manda sobre el campo que
el modelo haya aislado. Un justificante trae varias fechas —emisión, firma, validez,
descarga— y aislar la buena es justo donde un modelo se equivoca; copiar la frase
entera, no. Además esa frase es la EVIDENCIA: es lo que se le enseña al usuario para
que la contraste sin abrir el PDF.

**REGLA — una lectura que falla NUNCA tira la subida.** Si el justificante no se
puede leer, o la fecha es futura, o es anterior a 2007 (el CEE nace con el RD
47/2007, así que eso no es una fecha de registro sino una lectura mal hecha), se cae
a la fecha de subida —el comportamiento de siempre— **y se dice**. El fichero ya está
archivado y la fase tiene que quedar registrada: dejarla sin sellar por no poder leer
un PDF sería cambiar un dato dudoso por un expediente parado.

**REGLA — solo se envía la PRIMERA PÁGINA.** A Gemini un PDF le cuesta 258 tokens por
página y detrás del justificante vienen los acuses de firma electrónica, que no dicen
nada de lo que se busca y se pagan igual. Medido sobre justificantes reales: **664
tokens de entrada y ~2,6 s**, unos **0,0003 €** por lectura.

**REGLA — al releer un justificante ya subido solo se PROPONE.** La fecha que consta
puede haberla corregido una persona a mano, así que el botón enseña las dos fechas y
la frase citada y decide el usuario; entonces la escribe `setCeeDate`, **el mismo
camino que teclearla**, para que no haya dos formas de guardar la misma fecha (la
ruta sabe escribir con `aplicar: true`, y de eso tira el barrido). Mismo criterio que
el OCR del RITE: se rellenan huecos, no se pisa lo escrito.

**REGLA — con la fase ya REGISTRADA solo se rellena el HUECO.** `markCeeRegistradoFromUpload`
no repite la transición ni el email, pero si la fecha está en blanco (migrados,
sellados a mano) y ahora sí la tenemos leída, la escribe: eso es un hueco, no una
corrección.

Es un **gemelo pequeño** de [riteOcrService.js](implementation/backend/services/riteOcrService.js),
del que reutiliza `primerasPaginas` y `aISO` — es la misma conversión de fecha y la
misma razón para recortar, y tenerla dos veces es tenerla mal el día que se corrija
una sola.
