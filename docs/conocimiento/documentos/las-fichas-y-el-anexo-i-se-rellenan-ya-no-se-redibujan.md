<!-- conocimiento · área: documentos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Las FICHAS y el ANEXO I se RELLENAN, ya no se redibujan (2026-09-08)

Las cuatro fichas (RES060 · RES080 · RES093 · TER100) y el **Anexo I** se
REPLICABAN en HTML: ~1.100 líneas imitando el modelo del Ministerio hasta los saltos
de página, el ancho de la caja de texto y las notas al pie, con un medidor propio
para comprobar que nada desbordaba. El Ministerio publica ahora esos cinco impresos
como **PDF de FORMULARIO**, así que se rellena el suyo: el documento pasa a ser
literalmente el oficial y lo único nuestro son las cifras.

Es el mismo camino que ya hacía `anexoActuacionService` con el anexo del MITECO
(regla 29); este es su hermano para los documentos de la ficha.

| Qué | Dónde |
|---|---|
| Rellenar el impreso (tamaños, casillas, desplegables, firma) | [formularioOficialService.js](implementation/backend/services/formularioOficialService.js) |
| Plantillas | `backend/plantillas/Ficha{RES060,RES080,RES093,TER100}.pdf` · `AnexoIDeclaracionResponsable.pdf` |
| QUÉ casilla ocupa cada dato — fichas | [logic/fichasFormulario.js](implementation/frontend/src/features/expedientes/logic/fichasFormulario.js) |
| QUÉ casilla ocupa cada dato — Anexo I | [logic/anexoIFormulario.js](implementation/frontend/src/features/expedientes/logic/anexoIFormulario.js) |
| El documento, venga como venga | `documentoAPdf()` en [pdfService.js](implementation/backend/services/pdfService.js) |
| Vista previa (es el PDF de verdad) | `DocumentoOficialPreview.jsx` |
| Prueba sin BD (empresa · subvención · cascada · CCAA · euro) | `node implementation/backend/scripts/test_impresos_oficiales.mjs` |
| Contraste contra EXPEDIENTES REALES, y los dos PDF en disco | `node implementation/backend/scripts/comparar_impresos_oficiales.mjs` |

**REGLA — el impreso no CALCULA nada.** Los valores salen de los `derive*` de las
plantillas HTML (`deriveFichaRes060/080/093`, `deriveFichaTer100`, `deriveAnexoI`),
que son los mismos que alimentan el CIFO y el panel económico. Por eso esos cuatro
ficheros exportan ahora su derivación aparte de su maqueta: si el formulario
recalculara por su cuenta, el mismo expediente tendría dos documentos con números
distintos según por dónde se generase.

**REGLA — los nombres de campo son los de la PLANTILLA, erratas incluidas.** `ri i`
es η_i, `E F` es EF_i, `Representante delsolicitante` va sin espacio en RES080 y
TER100, y el impreso trunca a 50 caracteres (`Dirección postal de la instalación en
que se ejecu`). Se leen con `pdf.getForm().getFields()`. "Corregirlos" solo deja el
impreso con un hueco — y un campo que la plantilla no tiene **se AVISA**, nunca se
traga en silencio.

**REGLA — un documento viaja como `{ html }` o como `{ formulario }`, y las cuatro
salidas usan la MISMA.** Descargar, guardar en Drive, enviar por email/WhatsApp y el
envío del lote al S.O. pasan por `documentoAPdf`. Si una se quedara sin la rama del
formulario seguiría mandando la maqueta antigua sin que nadie lo notara — y el
enlace de firma del cliente sirve el borrador de Drive, así que sería OTRO documento
el que se firma.

**REGLA — el tamaño de letra se fija en la CASILLA, no en el campo.**
`field.setFontSize()` solo toca el /DA del campo, y pdf-lib pinta con el de la
casilla si lo tiene (`widgetFontSize ?? fieldFontSize`). Estos impresos lo traen en
la casilla y con valor 0 ("ajústalo tú"), así que sin `fijarTamano()` el tamaño
calculado se ignoraba: en la tabla del total de la ficha TER100 salían tres cifras a
16pt junto a otras dos a 12, en un documento cuyo cuerpo es de 12. Un campo con
VARIAS casillas (el AE de cada servicio en TER100 sale en su apartado y otra vez en
el total) se ajusta a la MÁS PEQUEÑA.

**REGLA — la comunidad autónoma se ELIGE del desplegable.** La BD guarda "Comunidad
Valenciana", "Baleares", "Navarra" o "CASTILLA-LA MANCHA" y el impreso dice
"Comunitat Valenciana", "Illes Balears", "Comunidad Foral de Navarra"…
`resolverOpcion` casa por normalización y por una tabla de alias; una CCAA que no
case deja el impreso sin ella, que es el campo por el que el Gestor Autonómico lo
reparte. Nunca se escribe a pelo una cadena que no sea una opción.

⚠️ **WinAnsi NO es Latin-1.** El EURO (U+20AC) está fuera de `\x00-\xFF` y con un
filtro por rango la cuantía de una subvención salía impresa como **"18.800,00 ?"**.
`WINANSI_EXTRA` recoge los 27 caracteres del hueco 0x80-0x9F que sí se pueden
escribir.

⚠️ **La plantilla trae dentro un sello naranja "SIGN"** en su campo de firma (lo deja
la herramienta con la que se hizo el formulario). Se firma con Autofirma, que crea el
suyo, así que ese campo se RETIRA al rellenar — `form.removeField()` no vale (revienta
leyendo su /AP), hay que quitarlo de `AcroForm.Fields` y de las anotaciones de su
página.

### Los DOS formatos conviven, y la firma no cae en el mismo sitio

En Drive hay borradores del formato anterior esperando firma. Las cajas de
`signBoxes.js` se han duplicado (`_oficial` + la de siempre) y `fixedBox` admite
ahora una **FUNCIÓN** `({ numPaginas, oficial }) => caja`, que resuelven
`FirmarConCertificadoModal` (Autofirma) y `firmarYEscanear` (firma manuscrita):

- **Anexo I** — 4 páginas el oficial (firma en la 4ª) y 3 la maqueta. Manda el nº de
  páginas: sin esto, un borrador viejo recibiría la firma en una página que no existe.
- **Fichas** — los dos formatos tienen las MISMAS páginas, así que se mira quién
  produjo el PDF: el impreso oficial lo rellena **pdf-lib** y la maqueta la rasteriza
  Chrome ("Skia/PDF").

Las cajas `_oficial` salen del CAMPO DE FIRMA de la propia plantilla, leído con
PyMuPDF: son las coordenadas que el impreso reserva, no una estimación.

### El "Fdo." del Anexo I no es un campo

El impreso deja ahí unos guiones bajos. El nombre del firmante se ESCRIBE sobre la
página (`FDO_ANEXO_I`, medido sobre la plantilla): sin él el documento no dice quién
firma, que es lo primero que mira quien lo recibe.

### Qué se conserva del formato anterior

La maqueta HTML **no se ha borrado**. Los cuatro modales de ficha y el del Anexo I
llevan un conmutador **Oficial · Clásico** (`FormatoDocumentoSwitch`) que cambia lo
que se previsualiza Y lo que se envía, para poder comparar los dos documentos del
mismo expediente y como salida si el impreso cambiara. El OFICIAL es el valor por
defecto y lo que sale por las superficies sin conmutador (envío de anexos, convenio
de cesión, lote al S.O.).

**REGLA — la vista previa del oficial es EL PDF que se va a enviar**, no una maqueta
parecida: se pide a `/api/pdf/generate` y se enseña en un iframe. Una réplica en
pantalla volvería a abrir la puerta a que lo que se revisa y lo que se manda no sean
el mismo documento.

⚠️ Las casillas del Anexo I **se marcan en la pestaña Subvenciones**; el formato
clásico conserva su edición en pantalla (contenteditable + casillas) y lo que se
toque ahí se refleja en el oficial, porque el estado es el mismo. La nota del popup
lo dice.
