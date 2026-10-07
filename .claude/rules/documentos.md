---
paths:
  - "implementation/frontend/src/features/expedientes/logic/{cifoDoc,calcCifo,cifoFechas,hitosActuacion,fichasFormulario,anexoIFormulario,fichaRes060Html,fichaRes093Html,fichaTer100Html,fichaTer173,res080Doc,signBoxes,fuentesDoc,requerimientoFirma,fichasTecnicas,cedentes,usePlacaScopAcs}.js"
  - "implementation/frontend/src/features/expedientes/utils/{docGenerators,docContacts}.js"
  - "implementation/frontend/src/features/expedientes/components/{Certificado*,Ficha*,AnexoI*,EnviarAnexos*,Documentacion*,HitosActuacion*,PlacaScopAcs*,CesionManuscrita*,ValidationModal,DocumentoOficial*,FormatoDocumento*,Subvenciones*}.jsx"
  - "implementation/backend/services/{cifoService,formularioOficialService,pdfService,placaScopAcs,aclaracionFechasService,convenioCae,certClienteData}.js"
  - "implementation/backend/utils/{docValidacion,mergeDocumentacion,dniAnexo,instaladorFirmante}.js"
  - "implementation/backend/scripts/check_*.mjs"
  - "implementation/backend/plantillas/**"
---
# Documentos oficiales — CIFO, fichas e impresos, Anexo I, Convenio de Cesión, hitos, rechazo y re-firma (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/documentos/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

4. **Validación de Documentos**: Usar siempre el helper `isPresent(val)` en `validateExpediente` para comprobar que los datos no son nulos, vacíos ni placeholders (`_______`).

7. **Diseño de Anexos**: El padding superior de 90px en `AnexoIModal` es sagrado para evitar cortes en la cabecera al imprimir a PDF.

8.c **Anexos del CIFO — una ficha técnica por MODELO, no por hueco**: hasta 2026-08-13 había dos huecos fijos (`aerotermia_cal` y `aerotermia_acs`) y eso fallaba por los dos lados. **Por defecto** en cascada: el hueco de calefacción resolvía la ficha de la UNIDAD 1 y las demás quedaban sin justificar (medido: 26RES060_130, dos modelos distintos, iba sin la ficha de la unidad 2). **Por exceso** con un equipo que cubre calefacción y ACS —lo habitual—: el hueco de ACS resolvía el MISMO modelo y el PDF llevaba dos veces las mismas treinta páginas (medido: **24 de 241** expedientes). Fuente única: [fichasTecnicas.js](implementation/frontend/src/features/expedientes/logic/fichasTecnicas.js) — `resolveFichaSlots` agrupa las unidades (cal + ACS) por `aerotermia_db_id`, o por marca+modelo si se tecleó a mano, y devuelve **un hueco por grupo**. El que cubre los dos servicios se anuncia como "Ficha técnica aerotermia calefacción y ACS". Lo consumen las CUATRO superficies y no se decide en ninguna otra: los dos modales (`CertificadoCifoModal`, `CertificadoRes080Modal`), `cifoService` (generación automática / MCP) y las tres rutas `/fichas-tecnicas/*`. **La ruta valida contra el mismo alcance que el modal** (mismo motivo que la regla del checklist documental): sin eso, subir a un hueco que la vista ya no enseña respondería 200 y dejaría un destino vivo. Nomenclatura sin migración: el primer hueco de cada bloque conserva sus claves de siempre (`cal`/`acs`, `ft_aerotermia_cal_link`, "… - FT AEROTERMIA CALEFACCION.pdf") y los adicionales son `cal2`, `cal3`… (`ft_aerotermia_cal2_link`, "… CALEFACCION 2.pdf"). `annexPrefs` **dedupe por `driveId`** como red de seguridad: dos huecos que apunten al mismo fichero se anexan una vez. Un `ft_aerotermia_acs_link` heredado que ya no corresponde se ignora — el fichero sigue en Drive, pero no vuelve al PDF.

12. **ACS en Anexo I**: Validar `inputs.changeAcs || inputs.incluir_acs`. Si es false, ocultar unidad interior.

12.b **ACS fuera del alcance → "no aplica", nunca el valor ni 0**: en la tabla del apartado 4 (Ficha RES060/RES093/TER100 y Certificado CIFO), si el ACS no computa, **D<sub>ACS</sub> se imprime "no aplica"** igual que SCOP<sub>dhw</sub>. Dejar la demanda a la vista invita al verificador a multiplicarla y a obtener un AE<sub>ACS</sub> que no forma parte de la actuación; un 0 afirma una demanda nula, que es falso. Mismo criterio que D<sub>CAL</sub>/S cuando la calefacción queda fuera (TER100). El alcance se decide igual que en el CIFO: `cambio_acs !== false` **y** que el equipo nuevo no sea un termo eléctrico (efecto Joule, rendimiento 1). Son CINCO sitios y van a la vez: `logic/cifoDoc.js`, `logic/fichaRes060Html.js`, `logic/fichaRes093Html.js` y los modales `FichaRes060Modal.jsx` / `FichaRes093Modal.jsx` (que duplican el HTML **y** la vista previa React). La ficha TER100 ya lo resuelve en `logic/ter100.js` (`alcance`).

12.e **El nº de serie del equipo de ACS lo decide el DATO, no el flag** (`acsSerieDeclarada` en [aerotermiaUnits.js](implementation/frontend/src/features/expedientes/logic/aerotermiaUnits.js)): un CONJUNTO BIBLOC es UNA máquina del catálogo —mismo `aerotermia_db_id`, así que `misma_aerotermia_acs` sigue en true— y **DOS aparatos** con dos placas, y el CIFO y el Anexo I los declaran en filas distintas. Con el flag en true imprimían la serie de la unidad EXTERIOR en la fila de la interior teniendo la buena guardada: medido, **8 expedientes** (26RES080_34 · _59 · _66, 26RES060_102 · _107, 25RES060_36 · _39 · _41), todos con SCOP_dhw propio. Lo aplican los TRES documentos (`cifoDoc.acsNuSerieEx`, `docGenerators.snInt`, `res080Doc` — donde «Misma unidad» deja de ser cierto). **Solo cambia la SERIE**: el equipo, el SCOP_dhw y el ahorro siguen colgando del flag a propósito (regla 12.c). Tras tocarlo: `node implementation/backend/scripts/test_serie_acs_flag.mjs`.

23. **Cliente EMPRESA — firma el representante legal**: si `clientes.es_empresa`, `nombre_razon_social` es la razón social y `dni` es el CIF; quien comparece y firma es el **representante legal** (`representante_nombre` / `representante_apellidos` / `representante_dni`). El Convenio de Cesión redacta el bloque del Cedente igual que el del Cesionario ("actuando en nombre y representación de la entidad…") y el Anexo I rellena con esos datos el apartado 3 y el "Fdo.". Nunca presentar a una sociedad como "mayor de edad, con documento de identificación B…".

24. **Rechazar un documento que generamos nosotros BLOQUEA su borrador**: el firmante no firma el PDF que le llegó por WhatsApp, firma el que le sirve su enlace público desde `{doc}_drive_link` (`/firmar-anexos` el cliente, `/subir-cifo` el instalador). Rechazar el firmado no toca ese borrador, así que sin bloqueo vuelve al enlace, se descarga el MISMO PDF erróneo y lo firma otra vez igual (26RES060_142: nº de serie mal en el Anexo I). Fuente única: `rechazoBorrador()` en [docValidacion.js](implementation/backend/utils/docValidacion.js) — un borrador está obsoleto mientras el rechazo sea POSTERIOR a `{doc}_sent_at` y a `{doc}_drive_at` (este último lo sella `mergeDocumentacion` al cambiar el enlace, venga la escritura de donde venga). Mientras lo esté, la vista pública no lo ofrece y el proxy de descarga responde 409. `BORRADORES_CLIENTE` cubre **Anexo I, Cesión y CIFO**; el Anexo Fotográfico no, porque no tiene página pública.
    La salida es siempre **corregir los datos y reenviar**: "Rechazar y reenviar corregido" encadena con la superficie de envío de CADA documento, declarada en el mapa `DOC_REGENERABLE` de [DocumentacionModule.jsx](implementation/frontend/src/features/expedientes/components/DocumentacionModule.jsx) — `EnviarAnexosModal` (Anexo I / Cesión), `AnexoFotograficoModal` y `CertificadoCifoModal` / `CertificadoRes080Modal`. Los tres modales reciben la prop `rechazo` y con ella enseñan el motivo en cabecera y mandan un mensaje que explica la corrección y anula la versión anterior. El borrador viejo se archiva en OLD (`replaceExisting` de `/api/pdf/save-to-drive`), y la subida pública del firmado (`/anexos-upload`) también **archiva el firmado rechazado en `6. ANEXOS CAE/OLD` en vez de borrarlo**. Un aviso de rechazo a secas solo manda al firmante a un enlace bloqueado.
    **REGLA — ENVIAR un documento firmable GUARDA antes su borrador en Drive.** El mensaje lleva un
    enlace, no el PDF que vale: la página de firma sirve `{doc}_drive_link`. Si el envío no re-guarda,
    el firmante abre el enlace y firma la VERSIÓN ANTERIOR — medido en 25RES060_71, donde el slot
    seguía apuntando al CIFO del expediente migrado (`CERTIF INSTALADOR_pte.pdf`, 11/08) y el
    instalador lo firmó el 12/08 mientras por email le había llegado el corregido. `EnviarAnexosModal`
    ya lo hacía; `CertificadoCifoModal` no. Ahora los dos guardan con `replaceExisting: true`
    (`saveDraftToDrive`, fuente única con el botón de la nube) **antes** de enviar, y en el CIFO el
    fallo de Drive ABORTA el envío: mandar un enlace sabiendo que sirve otro documento es peor que no
    mandarlo. El RES080 no tiene enlace de firma, así que ahí es best-effort. `cert_cifo_drive_at` lo
    sella solo `mergeDocumentacion` al cambiar el enlace, que es lo que además levanta el bloqueo del
    rechazo.
    ⚠️ `cert_cifo_*` es el mismo slot para dos documentos distintos: el **CIFO** lo firma el INSTALADOR (enlace bloqueable) y el **Certificado RES080** lo firma Brokergy y solo se ENTREGA al cliente. `DOC_REGENERABLE` lo distingue por `isReforma`.
    **REGLA — `docs_validados` y `docs_rechazados` NO los puede tocar el PUT general.** Los
    escriben solo sus rutas dedicadas (`/documentos/validar`, `/documentos/rechazar`,
    `firmar-subir`), que además copian el fichero a "10. EXPEDIENTE CAE"; la copia de
    `documentacion` que el detalle reenvía en CADA autoguardado se hidrató al abrir la vista y
    no los trae al día, así que los BORRABA. Se ve como *"lo valido, me salgo y me lo vuelve a
    pedir"* — y es el mismo fallo que ya costó `incidencias`, `_drive_at` y `refirma_at`, con
    ocho sitios del módulo reenviando `documentacion` entera. Medido en **26RES060_101**
    (18/09/2026): sobrevivieron el CIFO (13:59) y las facturas (14:00), y el Anexo I no, porque
    después de él sí hubo un autoguardado. Van a `CLAVES_PROTEGIDAS` de
    [mergeDocumentacion.js](implementation/backend/utils/mergeDocumentacion.js).
    ⚠️ Como consecuencia, **borrar un firmado tiene que invalidar su visto bueno
    explícitamente**: antes se limpiaba de rebote porque el navegador mandaba su copia sin esa
    clave — o sea, por el mismo accidente que se acaba de cerrar. Un slot verde que apunta a un
    fichero que ya no existe dice que alguien revisó algo que no está. Tras tocarlo:
    `node implementation/backend/scripts/test_validacion_no_se_pisa.mjs`.

25.b **Las TIPOGRAFÍAS de un documento se AUTO-ALOJAN, nunca se piden a Google Fonts.** El PDF lo rasteriza Puppeteer en el servidor abriendo y cerrando un Chrome en CADA documento —sin caché entre uno y otro—, así que un `<link>` a `fonts.googleapis.com` significa volver a descargar la fuente en cada propuesta y depender de que llegue a tiempo. Y cuando no llega, el resultado no es "parecido": el contenedor solo tiene `fonts-liberation`, ninguna de las familias del respaldo (Arial, Roboto, Noto Sans, Segoe UI) existe, y `fc-match sans-serif` devolvía **Liberation MONO** — la propuesta 26RES060_OP193 salió ENTERA en Courier y así la recibió el cliente (15/09/2026). **Reproducido** quitando el `<link>`: idéntico al PDF que llegó. El CIFO ya lo hacía bien; ahora la propuesta usa **la misma función** (`buildFontFaces(appUrl, familias)` en [cifoDoc.js](implementation/frontend/src/features/expedientes/logic/cifoDoc.js)) y los mismos nombres de fichero en `frontend/public/fonts` — el contenedor las pide a su propio nginx (93 ms medidos). Y como red de seguridad, [fontconfig-local.conf](implementation/backend/fontconfig-local.conf) mapea `sans-serif` → Liberation **Sans** y las familias de respaldo que no existen: un fallo de fuente podrá cambiar la letra, pero **no volverá a dar Courier**. Para comprobar dónde cae hoy: `docker exec brokergy-backend fc-match sans-serif`.
    ⚠️ **Las fuentes se sirven con `Access-Control-Allow-Origin`**, o no cargan: Puppeteer rasteriza con `page.setContent`, o sea desde un documento `about:blank`, así que toda `@font-face` es CROSS-ORIGIN y Chrome la bloquea sin esa cabecera (`net::ERR_FAILED`). En producción colaba porque el Chrome de `@sparticuz/chromium` arranca con la seguridad web desactivada — una casualidad, no un mecanismo. El `location ^~ /fonts/` está aplicado **a mano en el VPS** (`nginx.conf` + `nginx.https.conf` + `docker compose restart nginx`, nunca por el repo: regla del nginx divergido).
    ⚠️ Y `APP_URL` de [docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js) quedaba en **cadena vacía** en Node: de ese origen cuelgan el logo, la firma de Brokergy y ahora las fuentes del Convenio, y en relativo no hay base que resolver. Cae al mismo respaldo que `ASSET_URL` de `cifoService`.
    La función vive en [fuentesDoc.js](implementation/frontend/src/features/expedientes/logic/fuentesDoc.js) y **no dentro de `cifoDoc.js`**: ahí creaba un CICLO de imports con `docGenerators` que, al evaluarse `ANEXO_CESION_CSS` en el top-level, dejaba las constantes de rango en su zona muerta y reventaba los dos documentos.
    Tras tocarlo: `node implementation/backend/scripts/check_anexo_cesion_2pag.mjs` **y** `check_cifo_paginas.mjs` — en el Convenio la fuente decide si el texto CABE, y `.conv-page` recorta en silencio lo que no cabe.
    **Los CUATRO documentos** se sirven ya sus fuentes: propuesta e [Convenio](implementation/frontend/src/features/expedientes/utils/docGenerators.js) (Inter), [CIFO](implementation/frontend/src/features/expedientes/logic/cifoDoc.js) (Instrument Sans), [factura al S.O.](implementation/frontend/src/features/lotes/logic/facturaSoHtml.js) (Manrope + Archivo) y [Anexo Fotográfico](implementation/frontend/src/features/expedientes/components/anexoFotograficoDoc.js) (Space Grotesk + Manrope). Las familias y sus pesos se declaran en `fuentesDoc.js` (`FUENTE_*`) y **los pesos son los que cada documento pedía**: uno de más son dos ficheros que alguien acaba descargando, y una cara que falta no rompe el build ni la pantalla — rompe el PDF, y solo en los textos de ESE peso. Por eso:
    ```bash
    node implementation/backend/scripts/check_fuentes_documentos.mjs
    ```
    Comprueba que nadie pide fuentes a Google y que las 44 caras declaradas existen en `public/fonts`. Pásalo al tocar un documento o al añadir un peso.
    ⚠️ El origen lo resuelve `origenApp()` en `fuentesDoc.js` (navegador → `window.location.origin`; Node → `CIFO_ASSET_URL`/`VITE_APP_URL`/`FRONTEND_URL`), porque estos documentos se generan **también en el servidor** y en relativo no hay base que resolver sobre `about:blank`.

26.b **El CIFO y el certificado RES080 identifican a las DOS empresas cuando no son la misma**: la que EJECUTA y factura (instalador asignado) y la HABILITADA que firma ante Industria (`instalador_rite_id`). Sin las dos, el NIF del certificado no casa con el de las facturas del expediente. Fuente única de la decisión y del texto: `empresasActuacion` / `notaDelegacionRite` en [docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js). Con una sola empresa el documento no cambia. **En el CIFO preside la EJECUTORA** (nombre, NIF y domicilio) y la habilitada ocupa una sola fila, «Técnico firmante de la memoria», con sus DOS números —el de EMPRESA habilitada y el CARNÉ PERSONAL de quien firma, que se resuelven con `firmanteMemoriaRite` y no se imprimen repetidos—; el NIF de la habilitada sigue constando en la nota de responsabilidad. Y **su recuadro de firma va SIN NOMBRE**: unas veces firma la empresa instaladora y otras el técnico, y la identidad la pone el certificado electrónico (2026-09-21). Por eso, **a cuál de las dos se le pide la firma se ELIGE en el popup de envío** (`opcionesFirmanteCifo`; por defecto la habilitada), los destinatarios traen los contactos de LAS DOS rotulados (`contactosDeLaActuacion`) y la elección se sella en `cert_cifo_firmante_rol` + historial. La Memoria RITE queda fuera del selector: imprime el carné de quien la suscribe y solo puede firmarla el habilitado. Los dos documentos tienen hojas de alto FIJO: tras tocarlos, pasar `check_cifo_paginas.mjs` **y** `check_res080_paginas.mjs`. Ver "Quién EJECUTA la obra y quién FIRMA ante Industria".

33. **Un REQUERIMIENTO vuelve a pedir la firma del Anexo I y del Convenio, y lo dice con el importe nuevo**: mismo mecanismo que la re-firma del CIFO, generalizado en `BORRADORES_CLIENTE.refirma` ([docValidacion.js](implementation/backend/utils/docValidacion.js) — `refirmaPendiente`, `firmaVigente`). Se lanza desde el **popup de envío** (selector *Primera firma · Requerimiento*, como el del instalador; sale marcado solo si ya hay alguna firma) o desde el MISMO popup del rechazo (`tipo:'requerimiento'`), y en los dos casos sella solo los anexos que ya están firmados. El importe nuevo sale del **ahorro verificado** que se guarda en el expediente, nunca de un campo del mensaje, y con él se generan los anexos mientras el requerimiento siga vivo (`resultsParaDocumento`) — también desde el botón "Generar", o el borrador bueno de Drive se machacaría. El firmado anterior deja de contar (slot ámbar, vista pública y parte diario), sin borrarse. **Un importe que baja se cuenta con lo que ha costado sostenerlo** —qué se ha hecho primero, la cifra dentro de "el expediente sigue adelante"—, y las cuatro superficies lo dicen igual. Textos, importes y plazo: fuente única en [logic/requerimientoFirma.js](implementation/frontend/src/features/expedientes/logic/requerimientoFirma.js). **`/firmar-anexos` pide SOLO lo pendiente** (disponible y sin firma vigente: `anexo_*_firmado` ya descuenta rechazo y re-firma): si se reenvía solo el Anexo I, el Convenio firmado no vuelve a pedirse en ninguno de los tres modos ni en el texto del aviso; solo con NADA pendiente se ofrecen todos, para poder reemplazar uno. Ver "Un REQUERIMIENTO vuelve a pedir la firma del Anexo I y del Convenio".

41. **Las FICHAS y el ANEXO I se RELLENAN sobre el impreso OFICIAL, ya no se redibujan**: las cinco plantillas son PDF de formulario del Ministerio y se escriben sus casillas ([formularioOficialService.js](implementation/backend/services/formularioOficialService.js)); qué dato ocupa cada una vive en [logic/fichasFormulario.js](implementation/frontend/src/features/expedientes/logic/fichasFormulario.js) y [logic/anexoIFormulario.js](implementation/frontend/src/features/expedientes/logic/anexoIFormulario.js). **El impreso no calcula nada**: los valores salen de los `derive*` de las maquetas, que son los mismos del CIFO. Los nombres de campo son los de la plantilla, ERRATAS INCLUIDAS (`ri i`, `E F`, `Representante delsolicitante`), y un campo que no existe se AVISA. Un documento viaja como `{ html }` o `{ formulario }` y las CUATRO salidas usan la misma (`documentoAPdf`), o el enlace de firma serviría otro documento. El tamaño de letra se fija en la CASILLA, no en el campo (pdf-lib pinta con el de la casilla); la CCAA se ELIGE del desplegable; el EURO no está en Latin-1 (`WINANSI_EXTRA`); y el sello "SIGN" de la plantilla se retira. **Los dos formatos conviven en Drive**, así que `fixedBox` admite una función `({numPaginas, oficial}) => caja` — el Anexo I se distingue por páginas (4 vs 3) y las fichas por el productor del PDF (pdf-lib vs Skia). La maqueta HTML se conserva tras el conmutador **Oficial · Clásico** de los cinco modales. Tras tocarlo: `node implementation/backend/scripts/test_impresos_oficiales.mjs` y `comparar_impresos_oficiales.mjs`. Ver "Las FICHAS y el ANEXO I se RELLENAN".

60. **La PLACA de la unidad exterior va DENTRO del certificado cuando el SCOP_dhw se justifica por el ANEXO VI**: ahí se declara `SCOP_dhw = COP · F_c` y el **COP a A7/W55 no lo publican todas las fichas técnicas** — está en la placa, y sin ella el verificador ve un COP que no encuentra en la documentación aportada (inexactitud abierta el 16/09/2026). **La foto no se sube otra vez**: se coge de Drive, del slot `FOTO_UNIDAD_EXTERIOR_PLACA`, el mismo del que el lector de placas saca el nº de serie (medido: 12 de los 25 expedientes con Anexo VI ya la tienen, 3 con varias). **Con varias se ELIGE** —una unidad exterior lleva dos etiquetas y cuál trae el COP lo sabe quien las mira— y la elección se guarda en `instalacion.placa_scop_acs` (solo el driveId, regla 21); si esa foto desaparece de Drive se cae a la primera **diciéndolo**. **Se imprime DOS veces**: en el recuadro del cálculo (208 px — dice de dónde sale el número, no se lee) y a página completa como anexo, que es donde el verificador lo lee. Va como **data URI** (Puppeteer rasteriza sobre `about:blank`), pedida a Drive ya reducida a 1600 px: 242-268 KB medidos. Un fallo al resolverla **no tumba la generación**: sale como aviso. **Se pulsa la foto y se RECORTA** (el mismo ReactCrop del Anexo Fotográfico), pero lo que se guarda es el RECUADRO — `{x,y,w,h}` en % más la relación de aspecto—, no la imagen recortada: el original sigue entero en Drive, el recorte se deshace, el anexo conserva la resolución del trozo que se va a leer y el certificado sale igual desde el backend. El encuadre se calcula en PÍXELES (`placaImgHtml`): un `top` en % se resuelve contra la altura de la CAJA y descoloca la foto. **Si no hay foto se puede SOLTAR en el propio popup**, y sube por la ruta de siempre (`/api/public/reforma-docs/:oportunidad/FOTO_UNIDAD_EXTERIOR_PLACA`, que admite sesión de staff sin token): entra en el slot de toda la vida y queda elegida, sin una segunda vía de subida que mantener. La banda es UNA pieza para los dos popups ([PlacaScopAcsBanda.jsx](implementation/frontend/src/features/expedientes/components/PlacaScopAcsBanda.jsx) + [usePlacaScopAcs.js](implementation/frontend/src/features/expedientes/logic/usePlacaScopAcs.js)). El **Certificado RES080 la lleva igual** (mismo Anexo VI, mismo slot documental). De paso, el bloque del Anexo VI y su `FC_TABLE`, que estaban TRIPLICADOS (CIFO, RES080 y su modal), pasan a fuente única: `scopAcsAnexoViHtml` / `placaAnexoContenido` en [cifoDoc.js](implementation/frontend/src/features/expedientes/logic/cifoDoc.js); la búsqueda y el servicio de la foto, en [placaScopAcs.js](implementation/backend/services/placaScopAcs.js). Tras tocarlo: `node implementation/backend/scripts/test_placa_scop_acs.mjs` **y los dos medidores de hojas**. Ver "La PLACA de la unidad exterior, dentro del certificado".

93. **Una factura de ENTREGA DE MATERIAL o un ANTICIPO no abre la actuación, y el CIFO lo cuenta en «Hitos de la actuación»** (2026-09-30). `facturas[].motivo_no_inicio` (`MATERIAL` | `ANTICIPO`, lo marca una persona en el popup **Hitos** junto a las fechas del CIFO) la saca del INICIO de `calcCifo` —no del fin ni de la inversión—, así que el inicio nuevo sale igual en todas las superficies. El CIFO y el Certificado RES080 imprimen ABRIENDO la hoja de la instalación (en hoja propia justo antes si hay cascada) la en el orden del proceso: CEE inicial (visita · firma), facturas (primera · última), actuación (inicio · pruebas RITE · fin) y CEE final —lo que no consta NO sale (sin fechas de un CEE, no sale su fila) y se avisa en la puerta de «Generar» (`avisosHitos`); nunca el registro—, más la ACLARACIÓN si la hay (máx. 420 caracteres) (`documentacion.hitos_actuacion`, en la BLACKLIST de `normalizeData`). La aclaración propuesta solo afirma lo que dicen los datos; la de la IA (`POST /:id/hitos/aclaracion-ia`, staffOnly) se descarta si cita una fecha o una factura que no consta. ⚠️ gemini-2.5-flash en JSON entra en bucle con «º»: se le pide «número». Fuente única: [hitosActuacion.js](implementation/frontend/src/features/expedientes/logic/hitosActuacion.js). Tras tocarlo: `node implementation/backend/scripts/test_hitos_actuacion.mjs`, `check_cifo_paginas.mjs` y `check_res080_paginas.mjs`. Ver "HITOS DE LA ACTUACIÓN".

56. **SUBVENCIONES se autoguarda, y sus enums NO pueden ir a MAYÚSCULAS**: era el único módulo de la ficha con botón manual —al final de una pantalla larga—, así que se marcaba el bono social, se cambiaba de pestaña y se perdía. Ahora autoguarda con el mismo modelo que Instalación (freno de 900 ms + referencia de lo último persistido) y manda **solo su clave** (`mergeDocumentacion` funde en el backend), con acuse en pantalla en vez de botón. Y la causa de fondo: `normalizeData` subía `documentacion.subvenciones` a MAYÚSCULAS, donde `leerSubvenciones` **descarta lo que no case EXACTO** con el enum en minúscula — el bono se guardaba como `ELECTRICO_VULNERABLE`, al releer desaparecía y el Anexo I imprimía «Ninguno de los anteriores» (medido en 26RES060_165). La clave va a la **BLACKLIST** y la lectura **rescata** lo ya escrito casando sin distinguir mayúsculas (`canon`/`canonId`, mismo criterio que `rescatarHueco` en la envolvente): cubre `bono_social.tipos`, `catalogo_id`, `estado` y `fondo_nacional` — este último se compara con `=== 'si'` y **viaja al verificador** en `SE_fondo_nacional`, así que en MAYÚSCULAS se le declaraba lo contrario. ⚠️ Y lo que se escriba con las herramientas de anotación del VISOR sobre el PDF de un impreso oficial no se guarda ni se envía: lo dice ya la barra de `DocumentoOficialPreview`; para marcar a mano está el formato Clásico, cuyo estado sí viaja en `overrides.anexo1`. Tras tocarlo: `node implementation/backend/scripts/test_subvenciones_bono.mjs`. Ver "Lo que el FLAG esconde y lo que MAYÚSCULAS borra".

114. **Una vivienda con VARIOS propietarios que PAGAN la obra: un convenio con todos, un Anexo I por cada uno y, por defecto, UN ingreso** (2026-10-06). En la aceptación solo se pregunta si el equipo lo ha habilitado en la ficha del cliente (regla 59). Cedente = quien PAGA la obra (la factura va a su nombre), no quien es propietario: un copropietario se marca «Paga también la obra» (`copropietarios[].cedente`, con `cuota_pct` opcional —sin ella, a partes iguales— y `iban` solo si cobra en cuenta propia); el que no paga es solo un contacto. Fuente única: [logic/cedentes.js](implementation/frontend/src/features/expedientes/logic/cedentes.js) (`cedentesDe`, `repartoPago`), que cargan también `public.js`, `expedientes.js` y `cobroService` por import() ESM. **Con UN solo cedente no cambia nada** (decisión del usuario): convenio de dos páginas, un Anexo I. Con varios, el Convenio pasa a TRES páginas —Reunidos en tabla, cláusula Novena de pluralidad (solidaridad, arts. 1137/1142/1143 CC: el ingreso en la cuenta designada libera a Brokergy) y página 3 solo de firmas, con casillas absolutas (`casillaFirmaConvenioPx/Pt` en `signBoxes.js`, la 0 la de Brokergy)— y el Anexo I sale una copia por cedente (`copias` en `formularioOficialService`, 4 págs cada una). Firman TODOS: Autofirma encadena documento × cedente sobre el PDF ya firmado (`cajaConvenioCedente(i)`, `anexoISignBoxCedente(i, n)`, la contrafirma de Brokergy `cajaConvenioCesionario`), y en papel o a mano se pide el DNI de cada uno (`dni_frontal_{i}` / `dni_{n}_link`, también en la cesión manuscrita montada desde la app). La factura vale a nombre de cualquier cedente (`facturaIncidencias` · TITULAR) y, si va a un propietario que no paga, se pide marcarlo. El bono va entero a la cuenta del titular salvo que un cedente dé la suya: entonces la fase 7 del lote enseña el reparto por cuenta (`fila.reparto`). La imputación en el IRPF sigue la cuota de propiedad, no quién cobra (art. 11 LIRPF) — **pendiente de revisión por un asesor**. Tras tocarlo: `node implementation/backend/scripts/test_copropietarios.mjs`, `test_facturas_incidencias.js`, `check_anexo_cesion_2pag.mjs` y `test_impresos_oficiales.mjs`.

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/documentos/convenio-de-cesion-se-firma-antes-de-terminar-la-obra.md` — Convenio de Cesión — se firma ANTES de terminar la obra (2026-08-12) · 4,0 KB
- `docs/conocimiento/documentos/el-cifo-en-pdf-las-hojas-son-fijas-y-hay-que-medirlas.md` — El CIFO en PDF — las hojas son FIJAS y hay que medirlas (2026-08-25) · 3,6 KB
- `docs/conocimiento/documentos/hitos-de-la-actuacion-la-factura-que-no-abre-la-obra.md` — HITOS DE LA ACTUACIÓN — la factura que NO abre la obra (2026-09-30) · 7,3 KB
- `docs/conocimiento/documentos/la-placa-de-la-unidad-exterior-dentro-del-certificado.md` — La PLACA de la unidad exterior, dentro del certificado (2026-09-17) · 7,9 KB
- `docs/conocimiento/documentos/las-fichas-y-el-anexo-i-se-rellenan-ya-no-se-redibujan.md` — Las FICHAS y el ANEXO I se RELLENAN, ya no se redibujan (2026-09-08) · 7,0 KB
- `docs/conocimiento/documentos/lo-que-el-flag-esconde-y-lo-que-mayusculas-borra.md` — Lo que el FLAG esconde y lo que MAYÚSCULAS borra (2026-09-16) · 5,0 KB
- `docs/conocimiento/documentos/modulo-documentos-novedades.md` — Módulo Documentos — Novedades (2026-04-08) · 0,6 KB
- `docs/conocimiento/documentos/quien-ejecuta-la-obra-y-quien-firma-ante-industria.md` — Quién EJECUTA la obra y quién FIRMA ante Industria (2026-08-26) · 8,5 KB
- `docs/conocimiento/documentos/un-requerimiento-vuelve-a-pedir-la-firma-del-anexo-i-y-del-conve.md` — Un REQUERIMIENTO vuelve a pedir la firma del Anexo I y del Convenio (2026-09-04) · 7,4 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/documentos/convenio-de-cesion-se-firma-antes-de-terminar-la-obra.md`
  - **REGLA — mientras no haya facturas, el convenio va en FUTURO.**
  - **REGLA — SIEMPRE se habla de ahorro ESTIMADO, también con la obra terminada.**
  - **REGLA — sin IBAN el convenio NO deja un hueco.**
  - **REGLA — con "Descuento Certificados" activo, el convenio NO dice NADA del coste de gestión.**
  - **REGLA — el contenido cabe en DOS páginas y eso se COMPRUEBA.**
- `docs/conocimiento/documentos/el-cifo-en-pdf-las-hojas-son-fijas-y-hay-que-medirlas.md`
  - **REGLA — una hoja por bloque; el corte NO es condicional.**
  - **REGLA — la PISCINA encabeza la hoja de variables, no la de instalación.**
  - **REGLA — el recuadro de "Firma y sello" va ANCLADO al borde inferior**
- `docs/conocimiento/documentos/hitos-de-la-actuacion-la-factura-que-no-abre-la-obra.md`
  - **REGLA — una factura puede NO abrir la actuación, y lo marca una persona.**
  - **REGLA — el CIFO y el Certificado RES080 llevan un bloque «Hitos de la actuación»,
ordenado como el PROCESO**
  - **REGLA — lo que NO consta NO se imprime, y se AVISA antes de generar**
  - **REGLA — la aclaración solo AFIRMA lo que dicen los datos.**
  - **REGLA — la IA REDACTA, el expediente pone los DATOS, y el código lo COMPRUEBA.**
  - **REGLA — los hitos ABREN la hoja de la INSTALACIÓN, antes de los equipos**
  - **REGLA — el aviso dice DÓNDE se arregla.**
- `docs/conocimiento/documentos/la-placa-de-la-unidad-exterior-dentro-del-certificado.md`
  - **REGLA — la foto NO se sube otra vez: ya está en Drive.**
  - **REGLA — con VARIAS se elige, y un cambio de foto nunca es silencioso.**
  - **REGLA — se imprime DOS veces, y no es redundancia.**
  - **REGLA — el bloque del Anexo VI es FUENTE ÚNICA de las tres superficies.**
  - **REGLA — el Certificado RES080 la lleva igual.**
  - **REGLA — la imagen va como DATA URI dentro del HTML.**
  - **REGLA — se pulsa la foto y se RECORTA, y lo que se guarda es el RECUADRO.**
  - **REGLA — el recorte es de ESA foto.**
  - **REGLA — un fallo al resolver la placa NUNCA tumba la generación.**
  - **REGLA — se puede SOLTAR la foto en el propio popup, y sube por la RUTA DE SIEMPRE.**
- `docs/conocimiento/documentos/las-fichas-y-el-anexo-i-se-rellenan-ya-no-se-redibujan.md`
  - **REGLA — el impreso no CALCULA nada.**
  - **REGLA — los nombres de campo son los de la PLANTILLA, erratas incluidas.**
  - **REGLA — un documento viaja como `{ html }` o como `{ formulario }`, y las cuatro
salidas usan la MISMA.**
  - **REGLA — el tamaño de letra se fija en la CASILLA, no en el campo.**
  - **REGLA — la comunidad autónoma se ELIGE del desplegable.**
  - **REGLA — la vista previa del oficial es EL PDF que se va a enviar**
- `docs/conocimiento/documentos/lo-que-el-flag-esconde-y-lo-que-mayusculas-borra.md`
  - **REGLA — el flag no puede esconder una SERIE declarada.**
  - **REGLA — solo cambia la SERIE.**
  - **REGLA — Subvenciones se AUTOGUARDA, como el resto de la ficha.**
- `docs/conocimiento/documentos/quien-ejecuta-la-obra-y-quien-firma-ante-industria.md`
  - **REGLA — cuando son DOS empresas, las dos constan; cuando es una, solo una.**
  - **REGLA — en el CIFO manda la que EJECUTA Y FACTURA, y la habilitada baja a una fila
(2026-09-21).**
  - **REGLA — esa fila lleva DOS números y no son lo mismo.**
  - **REGLA — con DOS empresas, a QUIÉN se le pide la firma del CIFO se ELIGE al enviarlo**
  - **REGLA — los DESTINATARIOS traen las DOS empresas, y se marcan los de quien firma.**
  - **REGLA — la elección se SELLA y va al historial.**
  - **REGLA — el recuadro de firma va SIN NOMBRE.**
  - **REGLA — el PÁRRAFO se escribe también cuando hay UNA sola empresa**
  - **REGLA — en el CIFO el bloque NO puede crecer.**
  - **REGLA — el certificado RES080 tiene su propio medidor**
- `docs/conocimiento/documentos/un-requerimiento-vuelve-a-pedir-la-firma-del-anexo-i-y-del-conve.md`
  - **REGLA — se lanza desde el POPUP DE ENVÍO, igual que el del instalador.**
  - **REGLA — el importe del mensaje se recalcula DENTRO del compositor, no se lee del render.**
  - **REGLA — quien SELLA la re-firma es el módulo de Documentación, no el popup.**
  - **REGLA — también es el MISMO botón que el rechazo, con dos modos.**
  - **REGLA — afecta a los DOS anexos a la vez.**
  - **REGLA — el importe nuevo sale del ahorro VERIFICADO, no de un campo del mensaje.**
  - **REGLA — mientras el requerimiento esté vivo, los anexos se GENERAN con la cifra nueva.**
  - **REGLA — el firmado que tenemos deja de CONTAR, pero no se borra.**
  - **REGLA — un importe que BAJA se cuenta con lo que ha costado sostenerlo.**
  - **REGLA — al cliente se le explica ANTES de que abra los papeles.**
  - **REGLA — el aviso previo del popup es OPCIONAL y por defecto no se manda.**

<!-- generado:fin -->
