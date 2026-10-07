<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «PRESENTAR el CEE en el Registro — el borrador (2026-09-15)»; la introducción y el resto, en esta misma carpeta.

### Los DOS PASOS del certificador — `/presentar-cee/:id?token=&phase=`

Cuando Brokergy da el visto bueno, al técnico le quedan dos cosas y las dos pasaban
FUERA de la app: **firmar** el certificado y **presentarlo**. De ahí salían los dos
fallos que esto corrige.

| Qué | Dónde |
|---|---|
| Comprobar la firma (quién y CON QUÉ FECHA) y guardar el certificado | [ceeFirmaService.js](implementation/backend/services/ceeFirmaService.js) |
| Rutas públicas (estado · pdf · subir · borrador · fichero) | `/api/public/cee-firma/:id` en `routes/public.js` |
| La página | `PresentarCeeView` + `FirmarCeeCard` |
| Dónde cae la firma | `CEE_SIGN_ANCHOR` en [signBoxes.js](implementation/frontend/src/features/expedientes/logic/signBoxes.js) |

**REGLA — la FECHA no se puede imponer; se pide y se COMPRUEBA.** Autofirma sella con
el reloj del ordenador de quien firma, así que ni la app ni nosotros podemos fijarla:
lo único que cierra el problema es leerla del PDF cuando vuelve y compararla con la de
emisión del `.xml`. **Avisa, no bloquea** —hay motivos legítimos para firmar al día
siguiente— pero deja de pasar inadvertido. Medido al estrenarlo: **26RES093_7 está
firmado el 15/05/2026 y su certificado se emitió el 17/04/2026**, 28 días de desfase
que nadie había visto. El popup del visto bueno lleva el campo con la fecha (sacada del
`.xml`, editable) y va en el aviso al certificador.

**REGLA — el recuadro de la firma se ancla AL TEXTO, no a coordenadas.** Aquí NO vale
una caja fija como la del CIFO: el PDF lo genera CE3X y su rótulo «Firma del técnico
certificador» se mueve según cuántas líneas ocupe el párrafo de encima —medido, **10 pt**
entre dos certificados reales—, así que una caja fija pisaría el rótulo en unos y
flotaría en otros sin que nadie se enterase. Se usa `^above` sobre ese rótulo, que es
donde el certificador la pone hoy a mano.

**REGLA — el LOGO de Brokergy solo cuando firma Brokergy.** En la firma de un técnico
externo (Lanuza, Moncayo, Félix) nuestra marca daría a entender que firma Brokergy. Lo
decide el CIF de la empresa del certificador (`esDeBrokergy`), no el nombre de la
persona: el día que firme otro de la casa, su firma seguirá siendo la nuestra.

**REGLA — esto NO valida la firma.** Ni el hash, ni la cadena de confianza, ni la
revocación: eso es de Autofirma y del validador del Ministerio. Se afirma solo lo que el
fichero declara, mismo criterio que los firmados del S.O. (regla 40).

**REGLA — el Paso 2 se atenúa, no se bloquea.** Presentar un certificado sin firmar es
presentar un papel que no vale, así que se ve que falta el Paso 1; pero puede haberlo
firmado por su cuenta, y un candado ahí sería un callejón sin salida a las nueve de la
noche. Los tres estados del Paso 1 son reales: `firmado` (los 8 expedientes que se
miraron al diseñarlo llegaron así), `sin_firmar` (se le ofrece firmarlo aquí) y
`sin_pdf` (se le pide el que acaba de generar en CE3X).

⚠️ Usa el **MISMO token** que `/subir-cee` (`ceeUploadSignature`): mismo técnico, mismo
expediente, misma fase. Y la página pide la API en **relativo**, como `FirmaMovilView`
(regla 34): el hardcode a `localhost:3000` de las demás vistas públicas impide probarla
con un segundo backend en otro puerto.
