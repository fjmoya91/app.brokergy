<!-- conocimiento · área: cee · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «PRESENTAR el CEE en el Registro — el borrador (2026-09-15)»; la introducción y el resto, en esta misma carpeta.

### FIRMAR el CEE sin ventanas — `scripts/firmar_cee.js` (2026-10-15)

Cuando el usuario da por válido un CEE que ha hecho Brokergy («doy por válido el CEE inicial de NNN»),
el PDF de CE3X se firma desde el PC sin abrir AutoFirma ni elegir certificado, y se sube como
`{nº} – CEE {FASE}_fdo.pdf`. Probado sobre una copia de 2026CEE_63 marcada «PRUEBA – NO VÁLIDO»: firma
íntegra, firmante FRANCISCO JAVIER MOYA LOPEZ, y la página igual que la firma a mano del 14/10/2026.

| Qué | Dónde |
|---|---|
| Firmar, comprobar y subir | [scripts/firmar_cee.js](implementation/backend/scripts/firmar_cee.js) |
| Cuándo se usa | skill `generar-cee-inicial` («Cuando el usuario lo da por VÁLIDO») y `presentar-cee` |
| Comprobación de la firma | `utils/firmasPdf.leerFirmasPdf` (integridad, firmante, fecha) |
| Subida | CAE: `ceeFirmaService.guardarCertificado` · CEE directo: `subidaCeePublica.subirCeeDirecto` (slot `pdf`) |

**REGLA — solo con un «doy por válido» del usuario, y nunca un `_REVISAR` ni un PDF ya firmado.** Firmar
con el certificado de la casa es un acto de quien firma. El script se niega con un `_REVISAR` (primero
se sube con el nombre canónico) y con un PDF que ya lleva firma electrónica.

**REGLA — se firma con el certificado de REPRESENTANTE de Brokergy**, que es con el que firma Fran sus
CEE (medido en el `_fdo` de 2026CEE_63: «NIF FRANCISCO JAVIER MOYA (R: B19350222)»), no con el personal.
Se busca en el almacén de Windows por `(R: B19350222)` + vigente (o `CEE_FIRMA_HUELLA` en el `.env`) y se
pasa a `AutofirmaCommandLine` como `-filter thumbprint:SHA1:…`: en ese almacén hay tres alias del mismo
nombre y certificados de otras personas, así que nunca se elige por nombre. Las claves de Windows no
tienen protección reforzada: firma sin diálogo. (El almacén de Firefox, con el personal, es para la sede.)

**REGLA — la firma va donde la pone Fran: última página, DEBAJO del rótulo, logo a la izquierda.** En
CE3X 3.2 el rótulo es «Firma del/la técnico/a certificador/a» (antes «Firma del técnico certificador»):
se busca quitando «/la» y «/a». AutoFirma escribe el texto sobre TODA la caja, así que con la rúbrica
dentro el texto pisaba el logo: el logo se ESTAMPA en la página antes de firmar (la firma lo cubre) y la
caja de la firma lleva solo el texto, a la derecha. `obfuscateCertText=false` (si no, «***8255**») y
Helvetica. Coordenadas en enteros. La rúbrica no puede ir en `-config`: su base64 no cabe en la línea de
órdenes de Windows (32.767).

⚠️ `CEE_SIGN_ANCHOR` de [signBoxes.js](implementation/frontend/src/features/expedientes/logic/signBoxes.js)
(`'firma del tecnico certificador^above'`) NO encuentra el rótulo de CE3X 3.2 ni pone la firma donde la
pone Fran (debajo): pendiente de alinear con esto en la firma desde la app.

⚠️ Para pintar un PDF con pdf.js en Node hay que pasarle `standardFontDataUrl`: sin las fuentes estándar
no dibuja el texto en Helvetica (ni la marca de prueba ni el texto de la firma), y parece que falta.
