---
paths:
  - "implementation/frontend/src/features/firma/**"
  - "implementation/backend/services/firmaMovil.js"
  - "implementation/backend/routes/afirmaStorage.js"
  - "implementation/backend/utils/{firmasPdf,dniAnexo}.js"
  - "implementation/frontend/src/features/expedientes/logic/signBoxes.js"
  - "implementation/frontend/src/features/expedientes/components/FirmarConCertificadoModal.jsx"
---
# Firma — Autofirma, firma a mano con el móvil, QR, integridad de la firma (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/firma/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

22.b **Anexo de Cesión MANUSCRITO = escaneo + DNI del cliente + DNI del representante**: el anexo firmado a mano no vale suelto — necesita las dos caras del DNI del cliente en UNA página y el DNI del representante de Brokergy como **última** página, porque es lo que identifica a las dos partes que comparecen. Fuente única del montaje: [utils/dniAnexo.js](implementation/backend/utils/dniAnexo.js) (`dniTwoSidesOnePage`, `mergePdfs`, `readRepresentanteDni`, `buildCesionManuscrita`). Lo usan **los dos caminos**: la subida pública `/firmar-anexos` y, desde 2026-08-05, la subida desde la app (`POST /api/expedientes/:id/documentos/cesion-manuscrita`, multipart). No volver a montarlo a mano en una ruta.
    La app **detecta** la firma manuscrita por ausencia de firma electrónica en el PDF (`tieneFirmaElectronica`: `/ByteRange` + subfiltro PKCS7/CAdES; un escaneo no los tiene). La comprobación se repite en el navegador (`esFirmaManuscrita` en `CesionManuscritaModal.jsx`) para no gastar una subida entera en averiguarlo. **Ante la duda se asume firma electrónica** y se sube tal cual: anexar DNI a un documento ya firmado en digital es peor que no anexarlo, y el modal tiene salida manual ("súbelo tal cual"). Si el expediente ya tiene el DNI (`dni_link`, o las caras sueltas de los migrados) NO se vuelve a pedir.

34. **La firma A MANO se hace con el MÓVIL, y el documento sale rasterizado**: en `/firmar-anexos`, "Firma a mano" abre un asistente (leer → firmar con el dedo → revisar, por cada documento; después el DNI cara a cara) que estampa la firma en la caja de `SIGN_BOXES` —la MISMA fuente que Autofirma— y rasteriza el PDF a 150 DPI, para que sea indistinguible de un escaneo. La vía de siempre queda como "Ya lo tengo firmado en papel". La tinta es un **port literal** de `ScannerApp/src/renderer/lib/ink.ts` ([ink.js](implementation/frontend/src/features/firma/ink.js)), fija en pluma y trazo medio: se corrige allí y se vuelve a portar, nunca se parchea aquí. Dos gotchas de pdf.js que no se pueden deshacer: `page.render` necesita **`intent: 'print'`** (para pantalla usa `requestAnimationFrame`, que NO corre con la pestaña oculta ni el móvil bloqueado → el escaneo se colgaba para siempre) y **vacía el array que recibe**, así que `cargarPdf` copia siempre. Se LEE hasta la última página antes de poder firmar. **El GROSOR del trazo lo fija el DOCUMENTO**: la firma se estampa al ancho de su recuadro, así que el mismo ajuste daba de 2,44 pt firmando grande a 5,92 firmando compacto (y 0,53 en el recuadro del Anexo I oficial). Al aceptar se REPINTA con el radio que deja `TRAZO_PT` = 2,0 pt ya estampada ([trazoFirma.js](implementation/frontend/src/features/firma/trazoFirma.js) · `radioParaTrazo`), que es el grosor de la firma de Brokergy impresa en la columna de al lado (2,25 pt medidos). Sus constantes salen de la física de `ink.js`, que se re-porta entero, así que se comprueban con `node implementation/backend/scripts/check_trazo_firma.mjs`. La caja del documento llega hasta el lienzo también por el QR (viaja en la sesión de firma móvil) y en el Anexo I la resuelve `resolverCaja`, porque depende del formato del impreso. **Con un ratón delante no se abre la hoja: se ofrece pasar la firma al MÓVIL con un QR** ([firmaMovil.js](implementation/backend/services/firmaMovil.js) + `FirmarConMovil` + `/firma-movil/:token`), port de `signServer.ts` de ScannerApp — token de un solo uso, 10 minutos, sesión en memoria, y al teléfono NO le viaja el documento, solo vuelve el PNG. En local el enlace se compone con la **IP de la LAN** (en el móvil `localhost` es el móvil), lo que además exigió que esa vista pida la API en relativo y que el CORS admita rangos privados fuera de producción. `SignaturePad` y el aviso de girar van **portaleados a `document.body`** o la tarjeta con `backdrop-blur` los recorta (regla 29.b). Único cambio de fondo en el backend: `dni_pdf` como alternativa a las dos caras y `firma_origen`. Ver "La firma A MANO se hace CON EL MÓVIL".

63. **Una firma que se VE no siempre CUBRE el documento, y se comprueba antes de dar el verde**: si a un PDF se le tocó un byte tras firmarlo, o llegó truncado, el resumen que firmó el certificado ya no cuadra — y **en pantalla no se nota** (pdf.js reconstruye el índice y lo pinta perfecto), así que el daño solo aparece cuando lo abre un lector que valida la firma, o el verificador. `leerFirmasPdf(buf).integridad` lo dice: el `/ByteRange` contra la posición real del `/Contents`, el truncamiento, los bytes escritos detrás de la ÚLTIMA firma y el **`messageDigest` del firmante contra el hash de lo que hay hoy** (`integridadDeFirma` en [utils/firmasPdf.js](implementation/backend/utils/firmasPdf.js), recorrido DER sin dependencias ni IA: milisegundos y coste cero). **Sigue sin decir que una firma sea VÁLIDA** —ni cadena de confianza ni revocación, eso es del validador oficial—: afirma lo contrario y más estrecho, *"la firma NO cubre este documento"*, que es un hecho. **Bloquea solo lo que se ha PODIDO comprobar y no cuadra**; lo que no se sabe leer pasa (`ok: null`), porque el aviso que salta sin motivo es el que enseña a ignorar los avisos. **Solo a la ÚLTIMA firma se le exige llegar al final del fichero**: en un PDF con varias, cada una cierra su revisión y la siguiente escribe detrás — exigírselo a todas marcaría como rotos todos los Anexos I. Medido sobre los **592 firmados de producción: 281 correctas, 2 rotas, 2 no comprobables, 0 falsos positivos** — y una de las rotas es el CIFO de 26RES060_179, el daño que la regla 55 ya documentaba. Puesto en VALIDAR (409 + "validarlo igualmente", que se escribe en el historial), en `firmar-subir` (422 y **no se sube**: acabamos de firmarlo nosotros) y en los firmados del S.O. (`firma_rota`, no se registra); en el CEE del técnico **avisa y no bloquea**, que lo sube él desde su enlace. Tras tocarlo: `node implementation/backend/scripts/test_integridad_firma.mjs` y el barrido `barrer_integridad_firmas.js`. Ver "Una firma que se VE no siempre CUBRE el documento".

55. **Autofirma no falla igual en todos los ordenadores, y la app prueba DOS caminos**: `autoscript.js` elige siempre `wss://127.0.0.1:<puerto>`, que exige a la vez Autofirma ≥1.7, su **certificado SSL local vigente** en el almacén del navegador (caduca; y un perfil de Firefox creado después no lo tiene) y que nada corte 127.0.0.1 — si falla cualquiera, el firmante ve un aviso del Gobierno diciendo que no la tiene instalada, teniéndola. ⛔ **El fallback por servidor intermedio se probó el 16/09 y se APAGÓ el 17/09** (`SERVIDOR_INTERMEDIO_ACTIVO = false`): **corrompía el documento firmado** — Autofirma sube su resultado a nuestro servlet como `x-www-form-urlencoded` y ahí un `+` del Base64 se vuelve ESPACIO, así que las tres firmas de 26RES060_179 salieron truncadas o con el ByteRange inválido (295 de 298 firmados anteriores, por WebSocket, están íntegros). Hoy el plan es **solo WebSocket**, como antes; para reactivarlo hay que arreglar `afirmaStorage.js` y **comprobar la firma en un lector**, no el flujo simulado. **REGLA — un intento nuevo solo se lanza si el anterior NO llegó a Autofirma**: si el firmante canceló o su certificado no sirve, reintentar le abre Autofirma encima; se clasifica por el **CÓDIGO** (`AS6200xx`, enum cerrado) y solo por el texto cuando no lo hay. **REGLA — los diálogos propios de autoscript van APAGADOS**, o el error no llega al callback y el fallback no se dispara nunca. Y un **PDF ROTO se para antes de abrir Autofirma** (`pdfIncompleto`): pdf.js reconstruye el índice de un PDF truncado, así que el modal lo pinta perfecto y el único que se queja es Autofirma, con `SAF_28`. No se repara — reescribirlo invalidaría la firma que ya lleva dentro. ⚠️ El `setServlets` que había en el modal **no hacía nada** — `AppAfirmaWebSocketClient` no expone ese método y el servidor intermedio solo entra con `setForceWSMode(true)`, que significa *forzar modo WebService*, no *WebSocket*. Fuente única: [features/firma/autofirma.js](implementation/frontend/src/features/firma/autofirma.js), que usan las 9 pantallas que firman a través de `FirmarConCertificadoModal`. `POST /api/afirma-diagnostico` deja en el log en qué máquina y con qué código ha fallado (navegador y código, **nunca el documento ni datos del firmante**): sin eso, el mismo síntoma lo dan tres causas distintas. Tras tocarlo: `node implementation/backend/scripts/test_autofirma_caminos.mjs`. Ver "Autofirma no falla igual en todos los ordenadores".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/firma/autofirma-no-falla-igual-en-todos-los-ordenadores.md` — Autofirma no falla igual en todos los ordenadores (2026-09-16) · 9,9 KB
- `docs/conocimiento/firma/la-firma-a-mano-se-hace-con-el-movil.md` — La firma A MANO se hace CON EL MÓVIL (2026-09-06) · 11,1 KB
- `docs/conocimiento/firma/una-firma-que-se-ve-no-siempre-cubre-el-documento.md` — Una firma que se VE no siempre CUBRE el documento (2026-09-18) · 4,2 KB
- `docs/conocimiento/firma/y-si-se-esta-en-el-ordenador-la-firma-se-pasa-al-movil-con-un-qr.md` — Y si se está en el ORDENADOR, la firma se pasa al MÓVIL con un QR · 4,6 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/firma/autofirma-no-falla-igual-en-todos-los-ordenadores.md`
  - **REGLA — automáticos van DOS, no tres.**
  - **REGLA — un intento nuevo solo se lanza si el anterior NO llegó a Autofirma.**
  - **REGLA — los diálogos propios de `autoscript.js` van APAGADOS**
  - **REGLA — un documento GRANDE se salta el WebSocket**
  - **REGLA — una firma que no vale es lo peor que puede producir esta app.**
  - **REGLA — NO se repara.**
  - **REGLA — nadie se queda sin salida.**
- `docs/conocimiento/firma/la-firma-a-mano-se-hace-con-el-movil.md`
  - **REGLA — la tinta es un PORT de ScannerApp, no una reinterpretación.**
  - **REGLA — se LEE antes de firmar, y hay que llegar a la última página.**
  - **REGLA — el documento se lee A PANTALLA COMPLETA**
  - **REGLA — el documento sale RASTERIZADO, y eso es lo que se quiere.**
  - **REGLA — el GROSOR del trazo lo fija el DOCUMENTO, no la pantalla.**
  - **REGLA — la calibración se COMPRUEBA, porque depende de la tinta.**
  - **REGLA — el tope que manda es el ALTO, no el ancho.**
  - **REGLA — la firma cae donde diga `signBoxes.js`, la misma fuente que Autofirma.**
  - **REGLA — cada documento se cierra ANTES de pasar al siguiente.**
  - **REGLA — la foto del DNI se ENCOGE en el navegador, al elegirla.**
- `docs/conocimiento/firma/una-firma-que-se-ve-no-siempre-cubre-el-documento.md`
  - **REGLA — esto sigue SIN decir que una firma sea válida.**
  - **REGLA — bloquea solo lo que se ha PODIDO comprobar y NO cuadra.**
  - **REGLA — la ÚLTIMA firma es la única a la que se le exige llegar al final del
fichero.**
  - **REGLA — un escaneo sin firma electrónica no es un documento roto.**
  - **REGLA — validar es copiar a «10. EXPEDIENTE CAE», y por eso se mira AHÍ.**
- `docs/conocimiento/firma/y-si-se-esta-en-el-ordenador-la-firma-se-pasa-al-movil-con-un-qr.md`
  - **REGLA — al teléfono NO le viaja el documento; solo vuelve la firma.**
  - **REGLA — el token es de UN SOLO USO y dura 10 minutos**
  - **REGLA — las sesiones viven en MEMORIA.**
  - **REGLA — el PC PREGUNTA cada 2 s; no hay websocket.**

<!-- generado:fin -->
