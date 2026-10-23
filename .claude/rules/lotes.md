---
paths:
  - "implementation/frontend/src/features/lotes/**"
  - "implementation/backend/routes/lotes.js"
  - "implementation/backend/services/{lote*,anexoActuacionService,solicitudCaeService,envioGestorService,firmadosSo,firmadosSoCorreo,tarifasVerificacion,facturaContabilidad,marwenService}.js"
  - "implementation/backend/utils/{zipStore,codigosCae,consultaLotes,ceeEcoFields}.js"
---
# Lotes y Sujeto Obligado — verificación, OCR de sus PDF, anexos MITECO, paquete ZIP, firmados, peticiones, factura (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/lotes/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

28. **Las cifras del LOTE se leen de sus PDF, y el ahorro verificado manda sobre el pago**: el coste de verificación sale de la BASE IMPONIBLE de la factura del verificador (y va a `lotes.coste_verificacion`, no solo a la entrada del documento); el ahorro verificado de cada expediente sale del informe de verificación y se PROPONE para que lo aplique el ADMIN. **Ningún lote pasa a `PTE. PAGO BROKERGY A CLIENTE` ni a `FINALIZADO` sin el ahorro verificado de todos sus expedientes.** Fuentes únicas: [loteOcrService.js](implementation/backend/services/loteOcrService.js) (leer) y [loteVerificados.js](implementation/backend/services/loteVerificados.js) (casar, contrastar, escribir, `puedePagarseAlCliente`). Los números se piden al modelo como TEXTO y los convierte `numeroEs()`. Ver "Las cifras del lote se LEEN de sus documentos".

29.c **La SOLICITUD de emisión de CAE sale del MISMO botón que los anexos** y va a la carpeta de documentación del lote: los dos salen de los mismos datos y tienen que casar (la fila E3 es el expediente cuyo ZIP es `ActuacionE3`). Si algún expediente se queda sin anexo, la solicitud no se genera. Fuente única: [solicitudCaeService.js](implementation/backend/services/solicitudCaeService.js). El ahorro viaja en CRUDO desde el expediente —el que formatea el anexo lleva punto de millar y `Number()` lo divide por mil— y las filas vacías E6–E15 no se tocan, porque "Seleccione código de la ficha" y AGR010 exportan la misma cadena. Ver "La SOLICITUD de emisión sale del MISMO botón".

29. **El ANEXO del MITECO se RELLENA, no se replica**: es un formulario PDF oficial con 33 campos vivos y el título de la ficha se ELIGE de su desplegable del catálogo. Fuente única: [anexoActuacionService.js](implementation/backend/services/anexoActuacionService.js); se generan los 5 de un lote desde `POST /api/lotes/:id/anexos-actuacion`. El nº de actuación es el que el INFORME de verificación asigna (`verificacion.orden_actuacion`), porque además nombra los adjuntos del ZIP. Un anexo con huecos no se genera. Los campos de tamaño automático los calcula `autoSize` (pdf-lib no lo implementa) y los fijos van en `TAMANO_CAMPO`, nunca leídos del /DA. Ver "El ANEXO del MITECO por actuación".

30. **Al Sujeto Obligado se le pide UNA vez por VARIOS lotes**: el botón vive en el cuadro de mando de Lotes (actúa sobre lo filtrado), dice qué pide y por cuánto, y no existe si no hay nada que pedir. Hay DOS peticiones —**firmar las ofertas** de verificación y **pagar** las facturas del verificador— y se pintan todas las aplicables, la firma primero porque bloquea el arranque. **Un lote al que todavía no le toca no se cuenta ni se nombra** (`hastaEstado` para la firma, `haVerificado` para el pago): listar como "se queda fuera" un lote ya cobrado, o pedir la firma de la oferta de uno ya subido a MITECO, es lo que enseña a ignorar la lista. El popup y la ruta son UNO para las dos (`PETICIONES_SO`); lo que cambia —qué se adjunta, cómo se llama, quién queda fuera— lo aporta la petición. Fuente única: [peticionesSo.js](implementation/frontend/src/features/lotes/logic/peticionesSo.js); el envío, `POST /api/lotes/peticion-so`, que prepara TODOS los adjuntos antes de mandar nada y sella su marca. La **oferta se sube arrastrándola** a la fase 3. Tras tocarlo: `node implementation/backend/scripts/test_peticiones_so.mjs`. Ver "Pedirle cosas al SUJETO OBLIGADO desde el cuadro de mando".

40. **El PAQUETE de cada actuación se genera, no se renombra a mano**: los ~20 documentos del expediente copiados como `E{n}-{código}` y comprimidos, en dos modos —`expediente` (la carpeta `E{n}` + `E{n}.zip`) y `gestor` (`{LOTE} - ENVIO GESTOR` + `ActuacionE{n}.zip`, que añade el dictamen y los escritos)—. La nomenclatura se REPRODUCE de los lotes ya presentados, no se inventa; el nº de actuación se SELLA al enviar la solicitud por API (`orden_origen: 'SOLICITUD_API'`, `soloSiFalta`) y es el mismo que rotula el anexo del MITECO (regla 29); lo imprescindible BLOQUEA, lo leve avisa y lo que **NO PROCEDE** (`exigencia()`) se dice con su motivo sin contar como falta; los ficheros se COPIAN y **lo que ya está colocado con su código no se renombra ni se sustituye** (y si una pieza sale de un fichero suelto de Drive, se dice). Fuente única del índice: [envioGestorService.js](implementation/backend/services/envioGestorService.js) (`INDICE`, `COD_RITE`). **El hueco de ficha técnica lo rellena el paquete** desde el catálogo del modelo ([fichaTecnicaSlot.js](implementation/backend/services/fichaTecnicaSlot.js)), en vez de depender de que alguien abra el modal del certificado — que es lo que bloqueó dos actuaciones de LOTE-2025-005 sin faltar ningún documento. El convenio CAE vive en la ficha del S.O. (`prescriptores.convenio_cae_link`), fuera de cualquier lote. **El modo `expediente` es TAMBIÉN el ZIP que se sube a beCAE** antes de la oferta (botón en la fase 3): el contenido NO depende de la ficha —comparadas las 20 actuaciones con dictamen favorable, solo cambia el nombre del `3-5`— y la ficha técnica suelta es el MISMO bloque de anexos del certificado, recortes incluidos. Ver "El ZIP que se sube a beCAE".
    **Y los FIRMADOS que devuelve el S.O. se sueltan todos de golpe en la fase 2**: la app lee las firmas del propio PDF ([utils/firmasPdf.js](implementation/backend/utils/firmasPdf.js) — DER puro, sin dependencias y **sin gasto de tokens**; esto NO valida la firma, solo dice qué certificados la declaran), identifica el documento por el nº de expediente —vigilando que `26RES060_10` no se cuele en `26RES060_105`— y lo registra por `guardarDocFirmado`, que ya le pone el `_fdo`. Sin firma electrónica NO se registra; una firma de otra persona solo AVISA; lo que no se sabe de quién es se PREGUNTA. Fuente única del proceso: [services/firmadosSo.js](implementation/backend/services/firmadosSo.js). Ver "El PAQUETE de cada actuación" y "Los FIRMADOS del S.O.".

51. **Las TARIFAS del verificador viven en SU ficha, y son ORIENTATIVAS**: una tabla por tramos (nº de actuaciones → importe) con escalón, en `app_settings` como `tarifas_verificacion:{id}` (mismo patrón que las del certificador), editable desde el bloque **Tarifas de verificación** de la ficha del VERIFICADOR — en la VISTA, porque es un dato que se consulta antes de mandar un lote, y **adminOnly** en las dos capas. No contabiliza nada: lo que se paga sigue siendo `lotes.coste_verificacion` (de su factura, regla 28) y lo que se repercute al S.O., `inputs.costeVerificacion` (regla 46). **La columna que se compara es el €/ACTUACIÓN**: un total no dice nada sin saber cuántas cubre, y el escalón es por ENVÍO (un lote son 5 como máximo, pero se mandan varios juntos). Entre tramos se INTERPOLA; por encima del último se prolonga con el precio **marginal** del último intervalo —nunca con su media— y sale marcado `fueraDeTabla` con su aviso, porque es una conjetura nuestra. **Con varias tarifas no se adivina cuál aplica, y la cobertura por ficha se comprueba también con UNA sola**: una tarifa que declara las cuatro fichas de lote está diciendo que no cubre un TER173. Fuente única: [logic/tarifasVerificacion.js](implementation/frontend/src/features/lotes/logic/tarifasVerificacion.js). Tras tocarlo: `node implementation/backend/scripts/test_tarifas_verificacion.mjs`. Ver "Las TARIFAS del verificador, en su ficha".

67. **El documento viaja ENTERO, y lo firma el apoderado que se ELIGE**: desde que las fichas RES se rellenan sobre el impreso oficial (regla 41) una ficha es un `formulario`, y los dos modales del lote serializaban a mano los campos del documento dejándolo fuera — la ficha llegaba vacía al backend, el bucle la saltaba **en silencio** y el correo salía solo con el Anexo I (medido en un requerimiento de LOTE-2025-006; afectaba también al envío inicial al S.O. desde el 09/09/2026). Fuente única: `docParaEnvio` en [logic/docEnvio.js](implementation/frontend/src/features/lotes/logic/docEnvio.js), y **un documento marcado que no se puede preparar ABORTA el envío** diciendo cuál, nunca se salta. Y una empresa puede tener VARIOS apoderados —en INTERNACIONAL DE ALCOHOLES firman Pedro José López Montero (06239730Z) y Jesús Antonio Almodóvar Fuentes (06236833S)—, cuyo nombre y NIF van impresos en la casilla «Representante del solicitante»: se eligen en el envío (`FirmantePicker`, que no se pinta con uno solo) y se declaran en la ficha del S.O. (`prescriptores.representantes`, solo los ADICIONALES: el principal sigue en `nombre_responsable`/`nif_responsable` y no se duplica). **Se SELLA a quién se le pidió la firma** (`documentos_so[].rep_nombre`/`rep_nif`): con él, la página `/firmar-lote/:id` nombra al apoderado de esa ronda, `firmadosSo` comprueba contra ÉL —sin sello vale cualquiera de los declarados— y la SOLICITUD de emisión sale a nombre del apoderado que se ELIGE al generarla (popup de la fase 5, desde el 23/10/2026; propone el que firmó las fichas y avisa si se cambia; la ruta coteja el `rep_nif` con la ficha del S.O. antes de generar nada). Tras tocarlo: `node implementation/backend/scripts/test_firmante_so.mjs`. Ver "Quién FIRMA por el SUJETO OBLIGADO".

103. **El CERTIFICADO CAE emitido se LEE al subirlo y sus códigos van a la factura al S.O.** (2026-10-02): de la resolución de inscripción («un total de 300.828 CAE … desde el código CAE_008569324655_311229 hasta el código CAE_008569625482_311229») salen el CAE inicial, el final y el total, que se sellan en `documentos_so[certificado_cae].cae` (identifica al papel, no toca ningún expediente) y que `FacturaSoModal` trae ya puestos — con las unidades = los CAE emitidos. **El modelo LEE; qué es un código lo decide [utils/codigosCae.js](implementation/backend/utils/codigosCae.js)** (`CAE_` + 12 cifras + `_` + 6, sin completar ceros ni corregir letras) y se AVISA si el rango no cuadra con el total declarado, si los sufijos difieren o si no casa con el ahorro verificado del lote. Lo ya escrito en la factura MANDA: si difiere del certificado, se dice y hay un botón «Usar los del certificado». Un certificado subido antes de esto se relee con `POST /api/lotes/:id/certificado-cae/leer` (adminOnly), que el modal lanza solo si la factura no tiene códigos. Medido sobre LOTE-2026-004: los dos códigos y el total exactos, 3,4 s. Tras tocarlo: `node implementation/backend/scripts/test_codigos_cae.js` y `node implementation/backend/scripts/probar_lote_ocr.js certificado LOTE-2026-004` (solo lee).

104. **La factura de Brokergy al S.O. se archiva en CONTABILIDAD al generarla y al enviarla** (2026-10-02): al pulsar «Generar / Regenerar y guardar» (el mismo PDF que va a la carpeta del lote) y al enviarla bien por email o WhatsApp, su PDF se guarda en `00. S2E2 / 04. CONTABILIDAD / CAE - SERVICIOS CAE / FACTURAS VENTAS / {año} / {n. MES}` como `{nº} - {lote} - {acrónimo del S.O.}.pdf` (el nombre de la carpeta del lote sin su prefijo: «F-2026CAE_9 - LOTE-2025-003 - INTERALCO.pdf»). **Esa carpeta («CAE - SERVICIOS CAE») es SOLO para las facturas a los Sujetos Obligados** (decisión del usuario, 2026-10-19): las de la serie {YY}ING_{n} —CEE directos y honorarios de gestión CAE a clientes o instaladores— van a «ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS» (`archivarFacturaIngenieria`) (`POST /api/lotes/:id/factura-so/contabilidad`, adminOnly; [facturaContabilidad.js](implementation/backend/services/facturaContabilidad.js), raíz en `CONTABILIDAD_FACTURAS_CAE_FOLDER_ID`). El mes es el de la FECHA DE LA FACTURA, no el del envío; si no se llega a la carpeta del mes se FALLA (nunca se deja en la de arriba, que es lo que haría `getOrCreateSubfolder`), y la misma factura reenviada sustituye a la anterior. El resultado sale como una línea «Drive» en el popup de envío (`onAfterSend` de `EnviarLoteDocModal`); un fallo ahí no deshace el envío. **El nº de factura sale SOLO de `facturas_so`** (`nextFacturaNumero`, máximo + 1), así que **una factura ENVIADA queda registrada como EMITIDA aunque no se pulsara «Generar y guardar»**: «Enviar al S.O.» registra antes el número (y no abre el envío si ya es de otro lote: `NUMERO_FACTURA_OCUPADO`, 409, que también comprueban el borrador y el generar) y la ruta de contabilidad lo marca EMITIDA. Medido el 10/10/2026: LOTE-2025-003 (02/10) y LOTE-2025-001 (10/10) se ENVIARON sin generar, ninguno quedó en `facturas_so` y los dos salieron como **F-2026CAE_9**.

141. **Los FIRMADOS que el S.O. devuelve por CORREO se registran SOLOS, y solo lo limpio** (2026-10-19, decisión del usuario): cada 15 min el servidor lee en SOLO LECTURA el buzón al que contesta el S.O. (franciscojavier.moya@brokergy.es en Hostinger, la cuenta `LOTE_SO_SMTP_*`) y pasa los PDF de un correo de un contacto del S.O. de ESE lote, con el código del lote en el asunto, por **`procesarFirmados`, el MISMO camino que la suelta a mano** (regla 40) — nunca por uno nuevo. **Lo que pediría confirmación (otro firmante, Anexo I con una firma, un PDF sin identificar) NO se fuerza**: se queda sin registrar y se avisa (WhatsApp + email al admin) con el motivo y lo que sigue faltando. **Lo ya firmado no se reemplaza** (`noReemplazar`), **y un PDF que llegó ANTES de mandar a firmar la versión vigente es de una ronda anterior** (`recibidoAt` contra `sent_at`) — sin ese candado, la `_rev1` de 25RES060_59 del 05/10 se habría registrado como la `_rev2` pedida el 19/10 por un requerimiento; un `_revN` distinto del enviado tampoco se registra solo. Los correos vistos van en `app_settings`; un fallo no marca nada visto. **Nace APAGADO** (`FIRMADOS_SO_CORREO_ENABLED`, solo `true` en el VPS). Fuente única: [firmadosSoCorreo.js](implementation/backend/services/firmadosSoCorreo.js). Tras tocarlo: `node implementation/backend/scripts/test_firmados_correo.js`, `test_firmados_so.js` y, en seco contra el buzón real, `probar_firmados_correo.js`. Ver "Los FIRMADOS del S.O. llegan por CORREO".

159. **Las INEXACTITUDES del verificador se registran SOLAS como incidencias, y la RESPUESTA se arma al subsanar** (2026-10-22, decisión del usuario): al subir el informe de inexactitudes cada inexactitud pasa a ser una incidencia (procedencia `VERIFICACION`, tipo `INEXACTITUD`) del expediente de cada **actuación** que cita (= `verificacion.orden_actuacion`), colgada del documento del que habla; **el modelo solo LEE**, a qué expediente y documento va lo deciden reglas probadas, y la que habla de VARIOS documentos sale en CADA uno (`slots`). **Idempotente por (lote, nº de inexactitud)**: releer no duplica, un informe posterior que la repite la REABRE en su ronda y una «cerrada» por el verificador se subsana sola. Al **Subsanar** (no al Descartar), el documento se COPIA a `{ronda}. REQUERIMIENTO` en la raíz del lote con el nombre del paquete (`E{n}-{código} - {nº} - {NOMBRE}`, con su `_revN`), **solo si su CONTENIDO (md5) es distinto de lo que ya vio el verificador** (la copia del paquete en `E{n}` y las respuestas anteriores) — por fecha no basta: el Anexo I corregido de 26RES093_4 se firmó 2 min ANTES de subir el informe. La misma copia va también a la `E{n}` del expediente (2026-10-22), y la versión que había ahí **se archiva en `E{n}/OLD`, nunca se borra**: sigue contando como «ya visto», y lo de `E{n}` que también está en la carpeta de ESTA ronda no cuenta (lo pusimos al subsanar). El Anexo I del LOTE re-firmado va a TODAS las `E{n}` con su número (`E3-1-1 …`) — **solo el FIRMADO**: la pieza `1-1` cae al borrador y así quedó en LOTE-2025-012 un Anexo I sin firmar como `_rev2_fdo` (22/10/2026). «Preparar N. REQUERIMIENTO» recoge lo que faltara, las fichas y el Anexo I del lote vueltos a firmar, y rehace el ZIP. **Y lo que el S.O. vuelve a firmar por un requerimiento SUSTITUYE solo en cuanto se registra** (2026-10-23, `colocarRefirmados`, venga por la fase 2, el buzón, «Subir firmado» o `/firmar-lote`): la `E{n}` con la última versión firmada (la anterior, a OLD) y la copia en `{ronda}. REQUERIMIENTO`; la ronda es la del último informe subido antes de `requerimiento_at` — el `requerimiento_ronda` es la marca de tiempo del envío, no la ronda. **Lo que vuelve a firmar el CLIENTE** (Anexo I, Convenio, Anexo Fotográfico, CIFO) con una inexactitud ABIERTA va igual, solo, a su `E{n}` y al requerimiento (`colocarCorregidosExpediente`), y la incidencia **sigue abierta** con una nota en su hilo; el Convenio con firma electrónica espera la contrafirma de Brokergy. Fuente única: [inexactitudesLote.js](implementation/backend/services/inexactitudesLote.js). Tras tocarlo: `node implementation/backend/scripts/test_inexactitudes_lote.js`. Ver "Las INEXACTITUDES del verificador se registran solas".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/lotes/cuando-marwen-no-responde-el-envio-por-api.md` — Cuando MARWEN no responde: el envío por API dice de quién es el fallo (2026-10-15) · 2,1 KB
- `docs/conocimiento/lotes/el-anexo-del-miteco-por-actuacion.md` — El ANEXO del MITECO por actuación (2026-09-01) · 8,8 KB
- `docs/conocimiento/lotes/el-paquete-de-cada-actuacion-renombrar-a-e-n-y-zipear.md` — El PAQUETE de cada actuación — renombrar a E{n} y zipear (2026-09-08) · 14,7 KB
- `docs/conocimiento/lotes/el-total-que-nos-ingresa-el-so-y-el-cobro.md` — El TOTAL que nos ingresa el S.O., y marcarlo COBRADO (2026-10-15) · 2,7 KB
- `docs/conocimiento/lotes/el-zip-que-se-sube-a-becae-es-el-mismo-paquete-del-miteco.md` — El ZIP que se sube a beCAE es el MISMO paquete del MITECO (2026-09-09) · 13,6 KB
- `docs/conocimiento/lotes/las-cifras-del-lote-se-leen-de-sus-documentos.md` — Las cifras del lote se LEEN de sus documentos (2026-09-01) · 9,3 KB
- `docs/conocimiento/lotes/las-inexactitudes-del-verificador-se-registran-y-la-respuesta-se-arma-sola.md` — Las INEXACTITUDES del verificador se registran solas, y la RESPUESTA se arma al subsanar (2026-10-22) · 10,7 KB
- `docs/conocimiento/lotes/las-tarifas-del-verificador-en-su-ficha.md` — Las TARIFAS del verificador, en su ficha (2026-09-14) · 3,7 KB
- `docs/conocimiento/lotes/los-firmados-del-so-llegan-por-correo-y-se-registran-solos.md` — Los FIRMADOS del S.O. llegan por CORREO y se registran solos (2026-10-19) · 6,3 KB
- `docs/conocimiento/lotes/pedirle-cosas-al-sujeto-obligado-desde-el-cuadro-de-mando.md` — Pedirle cosas al SUJETO OBLIGADO desde el cuadro de mando (2026-09-01 · ofertas 2026-09-10) · 9,3 KB
- `docs/conocimiento/lotes/quien-firma-por-el-sujeto-obligado-y-la-ficha-que-no-viajaba.md` — Quién FIRMA por el SUJETO OBLIGADO, y la ficha que no viajaba (2026-09-19) · 5,3 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/lotes/cuando-marwen-no-responde-el-envio-por-api.md`
  - **REGLA — un fallo de red de Marwen se dice con su nombre, y dice si se ha creado algo.**
  - **REGLA — tras un 504 NO se reintenta a ciegas.**
- `docs/conocimiento/lotes/el-anexo-del-miteco-por-actuacion.md`
  - **REGLA — no se REPLICA el impreso: se RELLENA el oficial.**
  - **REGLA — el título de la ficha se ELIGE del catálogo.**
  - **REGLA — la solicitud y los anexos se generan JUNTOS, con un solo gesto.**
  - **REGLA — si algún expediente se queda sin anexo, NO se genera la solicitud.**
  - **REGLA — el total es la SUMA de las filas**
  - **REGLA — cada anexo va a la carpeta `E{n}` de SU expediente.**
  - **REGLA — lo que falte se LEE de los documentos ya subidos.**
  - **REGLA — el nº de actuación es el del INFORME.**
  - **REGLA — un anexo con huecos NO se genera.**
- `docs/conocimiento/lotes/el-paquete-de-cada-actuacion-renombrar-a-e-n-y-zipear.md`
  - **REGLA — la nomenclatura NO se inventa: se REPRODUCE.**
  - **REGLA — el nº de actuación es el del INFORME de verificación**
  - **REGLA — lo IMPRESCINDIBLE bloquea; lo leve avisa.**
  - **REGLA — los ficheros se COPIAN, nunca se mueven.**
  - **REGLA — lo que ya está colocado con su código NO se toca.**
  - **REGLA — el nombre lo decide la PIEZA, no quien la encontró.**
  - **REGLA — el CONVENIO CAE vive en la ficha del S.O.**
  - **REGLA — las firmas se leen del PDF, NO con un modelo de IA.**
  - **REGLA — esto NO valida la firma.**
  - **REGLA — la firma COMPRUEBA, la identidad AVISA.**
  - **REGLA — el nº de expediente se compara vigilando el PREFIJO.**
  - **REGLA — lo que no se sabe de quién es, se PREGUNTA.**
  - **REGLA — la zona de suelta es TODO el bloque de la fase, y se avisa ANTES de
llegar.**
  - **REGLA — da igual en qué fase se suelte cada PDF.**
  - **REGLA — "Subir firmado" de una fila entra por el MISMO sitio.**
  - **REGLA — si la firma que falta es la NUESTRA, se firma desde la propia fila.**
  - **REGLA — se registra por `guardarDocFirmado`, no por un camino nuevo.**
- `docs/conocimiento/lotes/el-total-que-nos-ingresa-el-so-y-el-cobro.md`
  - **REGLA — con la factura emitida, el total es EL DE LA FACTURA.**
  - **REGLA — solo se cobra una factura que EXISTE.**
  - **REGLA — marcarla cobrada mueve el lote a «PTE. PAGO BROKERGY A CLIENTE».**
  - **REGLA — regenerar o reenviar una factura COBRADA no la devuelve a EMITIDA.**
- `docs/conocimiento/lotes/el-zip-que-se-sube-a-becae-es-el-mismo-paquete-del-miteco.md`
  - **REGLA — el contenido NO depende de la ficha.**
  - **REGLA — la FICHA TÉCNICA va dos veces, y tienen que ser LA MISMA.**
  - **REGLA — el hueco de ficha técnica lo rellena EL QUE LA NECESITA, no una
pantalla.**
  - **REGLA — un enlace que apunta a un fichero BORRADO no es una pieza presente.**
  - **REGLA — el Nº DE ACTUACIÓN se SELLA al enviar la solicitud por API.**
  - **REGLA — un papel de REQUERIMIENTO no se echa de menos**
  - **REGLA — si el documento ESTÁ en Drive, el paquete lo coge**
  - **REGLA — una pieza puede NO PROCEDER, y eso no es que falte.**
  - **REGLA — GENERAR se pide de UNA actuación por PETICIÓN.**
  - **REGLA — se puede PARAR, y volver a generar PREGUNTA.**
- `docs/conocimiento/lotes/las-cifras-del-lote-se-leen-de-sus-documentos.md`
  - **REGLA — el modelo solo LEE; el juicio es del código.**
  - **REGLA — los números se piden como TEXTO y los convierte `numeroEs()`.**
  - **REGLA — el ahorro verificado se PROPONE, nunca se escribe solo.**
  - **REGLA — se contrasta la suma con el total que declara el propio informe.**
  - **REGLA — UNA sola revisión escribe las dos cifras.**
  - **REGLA — el dictamen NO puede ir solo.**
  - **REGLA — `aplicarAhorrosVerificados` FUNDE `verificacion`, no la reemplaza.**
  - **REGLA — la INVERSIÓN del dictamen es la definitiva.**
  - **REGLA — los números de expediente se comparan SIN NINGÚN separador**
  - **REGLA — leer un PDF SE VE.**
  - **REGLA — el dictamen se casa por el AHORRO, nunca por el orden.**
  - **REGLA — el modal de revisión es UNO con dos modos**
  - **REGLA — el nombre del fichero lleva el CÓDIGO DEL LOTE**
  - **REGLA — la factura del verificador se coteja con SU lote.**
  - **REGLA — se usa la BASE IMPONIBLE, nunca el total con IVA.**
  - **REGLA — NO se paga a un cliente sin su ahorro VERIFICADO.**
- `docs/conocimiento/lotes/las-inexactitudes-del-verificador-se-registran-y-la-respuesta-se-arma-sola.md`
  - **REGLA — el modelo solo LEE.**
  - **REGLA — la que habla de VARIOS documentos sale en CADA uno**
  - **REGLA — es IDEMPOTENTE, y la identidad es (lote, nº de inexactitud).**
  - **REGLA — en la `E{n}` la versión anterior NO se borra: va a `E{n}/OLD`**
  - **REGLA — al paquete solo va el Anexo I FIRMADO**
  - **REGLA — solo se copia lo que es DISTINTO de lo que ya vio el verificador**
  - **REGLA — el `requerimiento_ronda` del reenvío NO es la ronda de inexactitudes**
  - **REGLA — la incidencia SIGUE ABIERTA**
  - **REGLA — el Convenio con firma ELECTRÓNICA del cliente espera la contrafirma de Brokergy**
- `docs/conocimiento/lotes/las-tarifas-del-verificador-en-su-ficha.md`
  - **REGLA — esto es ORIENTATIVO y NO contabiliza nada.**
  - **REGLA — la columna que se compara es el €/ACTUACIÓN, no el total.**
  - **REGLA — entre tramos se INTERPOLA; fuera de tabla se DICE que se está fuera.**
  - **REGLA — con varias tarifas NO se adivina cuál aplica**
- `docs/conocimiento/lotes/los-firmados-del-so-llegan-por-correo-y-se-registran-solos.md`
  - **REGLA — el buzón se LEE, no se toca.**
  - **REGLA — solo cuenta un correo de un CONTACTO del S.O. de ESE lote**
  - **REGLA — se registra solo lo LIMPIO.**
  - **REGLA — lo ya firmado NO se reemplaza**
  - **REGLA — un PDF que llegó ANTES de mandar a firmar la versión vigente es de una ronda
anterior**
  - **REGLA — nace APAGADO**
- `docs/conocimiento/lotes/pedirle-cosas-al-sujeto-obligado-desde-el-cuadro-de-mando.md`
  - **REGLA — el ORDEN es de prioridad, y se pintan TODAS las aplicables.**
  - **REGLA — un lote al que TODAVÍA NO LE TOCA no se cuenta ni se nombra.**
  - **REGLA — el popup es UNO para todas las peticiones.**
  - **REGLA — el botón va en el CUADRO DE MANDO, no en la cabecera de la vista.**
  - **REGLA — el botón DICE lo que va a pedir y por cuánto**
  - **REGLA — un lote sin su factura se queda FUERA, y se DICE.**
  - **REGLA — pedirlo una vez NO cierra la petición.**
  - **REGLA — lo que cierra la petición es COBRARLO, y eso se marca en la factura.**
  - **REGLA — un envío que ya salió tiene que VERSE.**
  - **REGLA — los adjuntos se preparan ANTES de mandar nada**
  - **REGLA — el correo saluda a QUIEN LO RECIBE, no al que firma.**
- `docs/conocimiento/lotes/quien-firma-por-el-sujeto-obligado-y-la-ficha-que-no-viajaba.md`
  - **REGLA — el documento viaja ENTERO**
  - **REGLA — un documento marcado que no se puede preparar ABORTA el envío**
  - **REGLA — el PRINCIPAL no se duplica en la lista.**
  - **REGLA — con UN solo apoderado no se pregunta.**
  - **REGLA — se SELLA a quién se le pidió la firma**
  - **REGLA — el apoderado de la SOLICITUD de emisión se ELIGE al generarla**

<!-- generado:fin -->
