---
paths:
  - "implementation/frontend/src/features/lotes/**"
  - "implementation/backend/routes/lotes.js"
  - "implementation/backend/services/{lote*,anexoActuacionService,solicitudCaeService,envioGestorService,firmadosSo,firmadosSoCorreo,tarifasVerificacion,facturaContabilidad,marwenService}.js"
  - "implementation/backend/utils/{zipStore,codigosCae,consultaLotes,ceeEcoFields,comprimirPdf}.js"
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

30. **Al Sujeto Obligado se le pide UNA vez por VARIOS lotes**: el botón vive en el cuadro de mando de Lotes (actúa sobre lo filtrado), dice qué pide y por cuánto, y no existe si no hay nada que pedir. Hay TRES peticiones —**firmar las ofertas** de verificación, **pagar NUESTRAS facturas** de los CAE emitidos (2026-11-05: con el AHORRO neto frente al Fondo —nunca el €/MWh que le sale el CAE— y el enlace a su panel, regla 190) y **pagar** las facturas del verificador— y se pintan todas las aplicables, la firma primero porque bloquea el arranque. **Nuestras facturas salen en UNA petición por S.O.** (lo filtrado puede mezclar varios: el PAQUETE 2 de IBERDROLA se colaba en el correo a INTERALCO) y, sin factura, solo cuenta el lote que aún espera el pago (`hastaEstado` hasta «CAE EMITIDO – PTE PAGO BROKERGY»). **Y la factura que falta se GENERA desde el mismo botón** («Generar y enviar…»; `borradorFacturaCae` con el certificado y la oferta, por `POST /:id/factura-so`), **enseñándolas lote a lote ANTES** y sin enviar nada hasta el correo de siempre; lo que no se puede sacar sin mirar (sin códigos, sin precio, rango que no cuadra) se queda fuera diciendo qué falta. **Un lote al que todavía no le toca no se cuenta ni se nombra** (`hastaEstado` para la firma, `haVerificado` para el pago): listar como "se queda fuera" un lote ya cobrado, o pedir la firma de la oferta de uno ya subido a MITECO, es lo que enseña a ignorar la lista. El popup y la ruta son UNO para las dos (`PETICIONES_SO`); lo que cambia —qué se adjunta, cómo se llama, quién queda fuera— lo aporta la petición. Fuente única: [peticionesSo.js](implementation/frontend/src/features/lotes/logic/peticionesSo.js); el envío, `POST /api/lotes/peticion-so`, que prepara TODOS los adjuntos antes de mandar nada y sella su marca. La **oferta se sube arrastrándola** a la fase 3. Tras tocarlo: `node implementation/backend/scripts/test_peticiones_so.mjs`. Ver "Pedirle cosas al SUJETO OBLIGADO desde el cuadro de mando".

40. **El PAQUETE de cada actuación se genera, no se renombra a mano**: los ~20 documentos del expediente copiados como `E{n}-{código}` y comprimidos, en dos modos —`expediente` (la carpeta `E{n}` + `E{n}.zip`) y `gestor` (`{LOTE} - ENVIO GESTOR` + `ActuacionE{n}.zip`, que añade el dictamen, el INFORME de verificación —`2-1`, obligatorio desde que el Gestor de CLM lo requirió el 26/10/2026— y los escritos)—. La nomenclatura se REPRODUCE de los lotes ya presentados, no se inventa; el nº de actuación se SELLA al enviar la solicitud por API (`orden_origen: 'SOLICITUD_API'`, `soloSiFalta`) y es el mismo que rotula el anexo del MITECO (regla 29); lo imprescindible BLOQUEA, lo leve avisa y lo que **NO PROCEDE** (`exigencia()`) se dice con su motivo sin contar como falta —p. ej. **los XML del CEE (`3-8`, `4-6`), que solo son obligatorios si el ACS se justifica con ellos** (`acsPorXml`, 30/10/2026)—; los ficheros se COPIAN y **lo que ya está colocado con su código no se renombra ni se sustituye** (y si una pieza sale de un fichero suelto de Drive, se dice). Fuente única del índice: [envioGestorService.js](implementation/backend/services/envioGestorService.js) (`INDICE`, `COD_RITE`). **El hueco de ficha técnica lo rellena el paquete** desde el catálogo del modelo ([fichaTecnicaSlot.js](implementation/backend/services/fichaTecnicaSlot.js)), en vez de depender de que alguien abra el modal del certificado — que es lo que bloqueó dos actuaciones de LOTE-2025-005 sin faltar ningún documento. El convenio CAE vive en la ficha del S.O. (`prescriptores.convenio_cae_link`), fuera de cualquier lote. **El modo `expediente` es TAMBIÉN el ZIP que se sube a beCAE** antes de la oferta (botón en la fase 3): el contenido NO depende de la ficha —comparadas las 20 actuaciones con dictamen favorable, solo cambia el nombre del `3-5`— y la ficha técnica suelta es el MISMO bloque de anexos del certificado, recortes incluidos. Ver "El ZIP que se sube a beCAE".
    **Y los FIRMADOS que devuelve el S.O. se sueltan todos de golpe en la fase 2**: la app lee las firmas del propio PDF ([utils/firmasPdf.js](implementation/backend/utils/firmasPdf.js) — DER puro, sin dependencias y **sin gasto de tokens**; esto NO valida la firma, solo dice qué certificados la declaran), identifica el documento por el nº de expediente —vigilando que `26RES060_10` no se cuele en `26RES060_105`— y lo registra por `guardarDocFirmado`, que ya le pone el `_fdo`. Sin firma electrónica NO se registra; una firma de otra persona solo AVISA; lo que no se sabe de quién es se PREGUNTA. Fuente única del proceso: [services/firmadosSo.js](implementation/backend/services/firmadosSo.js). Ver "El PAQUETE de cada actuación" y "Los FIRMADOS del S.O.".

51. **Las TARIFAS del verificador viven en SU ficha, y son ORIENTATIVAS**: una tabla por tramos (nº de actuaciones → importe) con escalón, en `app_settings` como `tarifas_verificacion:{id}` (mismo patrón que las del certificador), editable desde el bloque **Tarifas de verificación** de la ficha del VERIFICADOR — en la VISTA, porque es un dato que se consulta antes de mandar un lote, y **adminOnly** en las dos capas. No contabiliza nada: lo que se paga sigue siendo `lotes.coste_verificacion` (de su factura, regla 28) y lo que se repercute al S.O., `inputs.costeVerificacion` (regla 46). **La columna que se compara es el €/ACTUACIÓN**: un total no dice nada sin saber cuántas cubre, y el escalón es por ENVÍO (un lote son 5 como máximo, pero se mandan varios juntos). Entre tramos se INTERPOLA; por encima del último se prolonga con el precio **marginal** del último intervalo —nunca con su media— y sale marcado `fueraDeTabla` con su aviso, porque es una conjetura nuestra. **Con varias tarifas no se adivina cuál aplica, y la cobertura por ficha se comprueba también con UNA sola**: una tarifa que declara las cuatro fichas de lote está diciendo que no cubre un TER173. Fuente única: [logic/tarifasVerificacion.js](implementation/frontend/src/features/lotes/logic/tarifasVerificacion.js). Tras tocarlo: `node implementation/backend/scripts/test_tarifas_verificacion.mjs`. Ver "Las TARIFAS del verificador, en su ficha".

67. **El documento viaja ENTERO, y lo firma el apoderado que se ELIGE**: desde que las fichas RES se rellenan sobre el impreso oficial (regla 41) una ficha es un `formulario`, y los dos modales del lote serializaban a mano los campos del documento dejándolo fuera — la ficha llegaba vacía al backend, el bucle la saltaba **en silencio** y el correo salía solo con el Anexo I (medido en un requerimiento de LOTE-2025-006; afectaba también al envío inicial al S.O. desde el 09/09/2026). Fuente única: `docParaEnvio` en [logic/docEnvio.js](implementation/frontend/src/features/lotes/logic/docEnvio.js), y **un documento marcado que no se puede preparar ABORTA el envío** diciendo cuál, nunca se salta. Y una empresa puede tener VARIOS apoderados —en INTERNACIONAL DE ALCOHOLES firman Pedro José López Montero (06239730Z) y Jesús Antonio Almodóvar Fuentes (06236833S)—, cuyo nombre y NIF van impresos en la casilla «Representante del solicitante»: se eligen en el envío (`FirmantePicker`, que no se pinta con uno solo) y se declaran en la ficha del S.O. (`prescriptores.representantes`, solo los ADICIONALES: el principal sigue en `nombre_responsable`/`nif_responsable` y no se duplica). **Se SELLA a quién se le pidió la firma** (`documentos_so[].rep_nombre`/`rep_nif`): con él, la página `/firmar-lote/:id` nombra al apoderado de esa ronda, `firmadosSo` comprueba contra ÉL —sin sello vale cualquiera de los declarados— y la SOLICITUD de emisión sale a nombre del apoderado que se ELIGE al generarla (popup de la fase 5, desde el 23/10/2026; propone el que firmó las fichas y avisa si se cambia; la ruta coteja el `rep_nif` con la ficha del S.O. antes de generar nada). Tras tocarlo: `node implementation/backend/scripts/test_firmante_so.mjs`. Ver "Quién FIRMA por el SUJETO OBLIGADO".

103. **El CERTIFICADO CAE emitido se LEE al subirlo y sus códigos van a la factura al S.O.** (2026-10-02): de la resolución de inscripción («un total de 300.828 CAE … desde el código CAE_008569324655_311229 hasta el código CAE_008569625482_311229») salen el CAE inicial, el final y el total, que se sellan en `documentos_so[certificado_cae].cae` (identifica al papel, no toca ningún expediente) y que `FacturaSoModal` trae ya puestos — con las unidades = los CAE emitidos. **El modelo LEE; qué es un código lo decide [utils/codigosCae.js](implementation/backend/utils/codigosCae.js)** (`CAE_` + 12 cifras + `_` + 6, sin completar ceros ni corregir letras) y se AVISA si el rango no cuadra con el total declarado, si los sufijos difieren o si no casa con el ahorro verificado del lote. Lo ya escrito en la factura MANDA: si difiere del certificado, se dice y hay un botón «Usar los del certificado». Un certificado subido antes de esto se relee con `POST /api/lotes/:id/certificado-cae/leer` (adminOnly), que el modal lanza solo si la factura no tiene códigos. Medido sobre LOTE-2026-004: los dos códigos y el total exactos, 3,4 s. Tras tocarlo: `node implementation/backend/scripts/test_codigos_cae.js` y `node implementation/backend/scripts/probar_lote_ocr.js certificado LOTE-2026-004` (solo lee).

104. **La factura de Brokergy al S.O. se archiva en CONTABILIDAD al generarla y al enviarla** (2026-10-02): al pulsar «Generar / Regenerar y guardar» (el mismo PDF que va a la carpeta del lote) y al enviarla bien por email o WhatsApp, su PDF se guarda en `00. S2E2 / 04. CONTABILIDAD / CAE - SERVICIOS CAE / FACTURAS VENTAS / {año} / {n. MES}` como `{nº} - {lote} - {acrónimo del S.O.}.pdf` (el nombre de la carpeta del lote sin su prefijo: «F-2026CAE_9 - LOTE-2025-003 - INTERALCO.pdf»). **Esa carpeta («CAE - SERVICIOS CAE») es SOLO para las facturas a los Sujetos Obligados** (decisión del usuario, 2026-10-19): las de la serie {YY}ING_{n} —CEE directos y honorarios de gestión CAE a clientes o instaladores— van a «ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS» (`archivarFacturaIngenieria`), y las de la serie FML (Fran autónomo) a «FML - SERVICIOS AUTONOMO / VENTAS» (`archivarFacturaAutonomo`, 2026-10-24: es venta del autónomo, no de la sociedad) (`POST /api/lotes/:id/factura-so/contabilidad`, adminOnly; [facturaContabilidad.js](implementation/backend/services/facturaContabilidad.js), raíz en `CONTABILIDAD_FACTURAS_CAE_FOLDER_ID`). El mes es el de la FECHA DE LA FACTURA, no el del envío; si no se llega a la carpeta del mes se FALLA (nunca se deja en la de arriba, que es lo que haría `getOrCreateSubfolder`), y la misma factura reenviada sustituye a la anterior. El resultado sale como una línea «Drive» en el popup de envío (`onAfterSend` de `EnviarLoteDocModal`); un fallo ahí no deshace el envío. **El nº de factura sale SOLO de `facturas_so`** (`nextFacturaNumero`, máximo + 1), así que **una factura ENVIADA queda registrada como EMITIDA aunque no se pulsara «Generar y guardar»**: «Enviar al S.O.» registra antes el número (y no abre el envío si ya es de otro lote: `NUMERO_FACTURA_OCUPADO`, 409, que también comprueban el borrador y el generar) y la ruta de contabilidad lo marca EMITIDA. Medido el 10/10/2026: LOTE-2025-003 (02/10) y LOTE-2025-001 (10/10) se ENVIARON sin generar, ninguno quedó en `facturas_so` y los dos salieron como **F-2026CAE_9**.

141. **Los FIRMADOS que el S.O. devuelve por CORREO se registran SOLOS, y solo lo limpio** (2026-10-19, decisión del usuario): cada 15 min el servidor lee en SOLO LECTURA el buzón al que contesta el S.O. (franciscojavier.moya@brokergy.es en Hostinger, la cuenta `LOTE_SO_SMTP_*`) y pasa los PDF de un correo de un contacto del S.O. de ESE lote, con el código del lote en el asunto, por **`procesarFirmados`, el MISMO camino que la suelta a mano** (regla 40) — nunca por uno nuevo. **Lo que pediría confirmación (otro firmante, Anexo I con una firma, un PDF sin identificar) NO se fuerza**: se queda sin registrar y se avisa (WhatsApp + email al admin) con el motivo y lo que sigue faltando. **Lo ya firmado no se reemplaza** (`noReemplazar`), **y un PDF que llegó ANTES de mandar a firmar la versión vigente es de una ronda anterior** (`recibidoAt` contra `sent_at`) — sin ese candado, la `_rev1` de 25RES060_59 del 05/10 se habría registrado como la `_rev2` pedida el 19/10 por un requerimiento; un `_revN` distinto del enviado tampoco se registra solo. **La contestación a la SOLICITUD DE EMISIÓN se descarta por el asunto (`asuntoDescartado`) y un nombre que dice JUSTIFICANTE, REGISTRO, DICTAMEN… no pasa por Anexo I aunque lleve el código del lote** (2026-11-08: el justificante del MITECO de LOTE-2025-012 saltó como un Anexo I mal firmado). Los correos vistos van en `app_settings`; un fallo no marca nada visto. **Nace APAGADO** (`FIRMADOS_SO_CORREO_ENABLED`, solo `true` en el VPS). Fuente única: [firmadosSoCorreo.js](implementation/backend/services/firmadosSoCorreo.js). Tras tocarlo: `node implementation/backend/scripts/test_firmados_correo.js`, `test_firmados_so.js` y, en seco contra el buzón real, `probar_firmados_correo.js`. Ver "Los FIRMADOS del S.O. llegan por CORREO".

159. **Las INEXACTITUDES del verificador se registran SOLAS como incidencias, y la RESPUESTA se arma al subsanar** (2026-10-22, decisión del usuario): al subir el informe de inexactitudes cada inexactitud pasa a ser una incidencia (procedencia `VERIFICACION`, tipo `INEXACTITUD`) del expediente de cada **actuación** que cita (= `verificacion.orden_actuacion`), colgada del documento del que habla; **el modelo solo LEE**, a qué expediente y documento va lo deciden reglas probadas, y la que habla de VARIOS documentos sale en CADA uno (`slots`). **Idempotente por (lote, nº de inexactitud)**: releer no duplica, un informe posterior que la repite la REABRE en su ronda y una «cerrada» por el verificador se subsana sola. Al **Subsanar** (no al Descartar), el documento se COPIA a `{ronda}. REQUERIMIENTO` en la raíz del lote con el nombre del paquete (`E{n}-{código} - {nº} - {NOMBRE}`, con su `_revN`), **solo si su CONTENIDO (md5) es distinto de lo que ya vio el verificador** (la copia del paquete en `E{n}` y las respuestas anteriores) — por fecha no basta: el Anexo I corregido de 26RES093_4 se firmó 2 min ANTES de subir el informe. La misma copia va también a la `E{n}` del expediente (2026-10-22), y la versión que había ahí **se archiva en `E{n}/OLD`, nunca se borra**: sigue contando como «ya visto», y lo de `E{n}` que también está en la carpeta de ESTA ronda no cuenta (lo pusimos al subsanar). El Anexo I del LOTE re-firmado va a TODAS las `E{n}` con su número (`E3-1-1 …`) — **solo el FIRMADO**: la pieza `1-1` cae al borrador y así quedó en LOTE-2025-012 un Anexo I sin firmar como `_rev2_fdo` (22/10/2026). «Preparar N. REQUERIMIENTO» recoge lo que faltara, las fichas y el Anexo I del lote vueltos a firmar, y rehace el ZIP. **Y lo que el S.O. vuelve a firmar por un requerimiento SUSTITUYE solo en cuanto se registra** (2026-10-23, `colocarRefirmados`, venga por la fase 2, el buzón, «Subir firmado» o `/firmar-lote`): la `E{n}` con la última versión firmada (la anterior, a OLD) y la copia en `{ronda}. REQUERIMIENTO`; la ronda es la del último informe subido antes de `requerimiento_at` — el `requerimiento_ronda` es la marca de tiempo del envío, no la ronda. **Lo que vuelve a firmar el CLIENTE** (Anexo I, Convenio, Anexo Fotográfico, CIFO) con una inexactitud ABIERTA va igual, solo, a su `E{n}` y al requerimiento (`colocarCorregidosExpediente`), y la incidencia **sigue abierta** con una nota en su hilo; el Convenio con firma electrónica espera la contrafirma de Brokergy. Fuente única: [inexactitudesLote.js](implementation/backend/services/inexactitudesLote.js). Tras tocarlo: `node implementation/backend/scripts/test_inexactitudes_lote.js`. Ver "Las INEXACTITUDES del verificador se registran solas".

182. **La «Vista S.O.»: la obligación del Sujeto Obligado se TECLEA por año y lo que le falta se cuenta contra TODO lo nuestro** (2026-10-28, Fran: «como si yo fuera Interalco»). Conmutador «Lotes / Vista S.O.» de la pestaña Lotes. La obligación (cuota del Anexo II, % mínimo al Fondo, lo ya comprado a OTROS agentes, equivalencia) va en `app_settings` como `obligacion_so:{id}`; la ve el staff y la edita el ADMIN. **Le falta = cubrible con CAE − otros − lo nuestro de ese año**, y aparte lo **asegurado** (otros + emitido). Lo nuestro, por ETAPAS vistas desde el S.O. (emitido · Administración · verificación · preparación), cada lote con su cifra más firme (CAE de la resolución → factura → verificado → estimado) y contando para UN año (el de su resolución, o el en curso si no está emitido; el ADMIN lo cambia lote a lote). **Lo disponible para ofrecerle** son los expedientes SIN lote ni rechazo, en kWh, por cercanía al CAE — y es el mismo volumen para cualquier S.O. Fuente única de las cuentas: [logic/obligacionSo.js](implementation/frontend/src/features/lotes/logic/obligacionSo.js) (también la usa [services/obligacionSo.js](implementation/backend/services/obligacionSo.js)). Tras tocarlo: `node implementation/backend/scripts/test_obligacion_so.mjs`. Ver "La «Vista S.O.»".

190. **El S.O. tiene su ENLACE de solo lectura (`/so/:token`), y solo ve lo que deja pasar `vistaParaElSo`** (2026-11-03, Fran: «que le sirva a él en todo momento para consultar el estado en tiempo real»). Token de 128 bits por S.O. en `app_settings` (`enlace_so:{id}`), que crea, cambia y quita SOLO el ADMIN (cambiarlo o quitarlo deja muerto el anterior); `GET /api/public/so/:token` lo compara en tiempo constante y calcula la vista en el servidor con las MISMAS cuentas (`vistaDeSo` en [routes/lotes.js](implementation/backend/routes/lotes.js)). Al S.O. le llega su obligación SIN nuestras notas, nuestros lotes de ese año por etapa (código, estado, nº de actuaciones, kWh y su fuente; los vacíos no) — **el estado y la fuente, YA en texto para él** (`ESTADO_PARA_EL_SO`: «CAE emitidos» en vez de «PTE. PAGO BROKERGY A CLIENTE», «Pendiente de vuestra firma» en vez de «PTE. FIRMA S.O.»; uno sin traducir sale con el título de su etapa, nunca en crudo; «facturado», y el código sin lo de entre paréntesis) — y de lo que no está en ningún lote **solo el TOTAL** (es el mismo volumen para cualquier S.O.). Nunca clientes, ids, ofertas ni importes nuestros. Sí ve, en agregado, **lo que se ahorra con nosotros frente al Fondo** (`ahorroCaeEur`). **A cuánto le sale el CAE (€/MWh) NO le llega**: Fran, 05/11/2026, «de momento que no vea a cuánto está pagando el CAE, solo el ahorro». Lo ve solo el ADMIN en la Vista S.O. interna (`precioCaeParaSo`, `conPrecio`). Mandarle el enlace es un envío: con el «sí» de Fran. **Y lo que le falta se cubre con TODO lo LISTO y luego terminando lo que tiene la obra hecha, de más MWh a menos.** En DOC. COMPLETA manda el ESTADO (Fran, 03/11/2026: «si tienen DOC. COMPLETA marcado, deberían estar listos para presentar»): cuenta y entra en el lote aunque tenga graves abiertas, que solo se avisan; de lo que aún se está cerrando, lo que tiene graves NO cuenta (`planParaCubrir`; el picker del lote tiene el filtro de riesgo, «Todos» por defecto). Fuente única de lo que sale: `vistaParaElSo` en [services/obligacionSo.js](implementation/backend/services/obligacionSo.js). Tras tocarlo: `node implementation/backend/scripts/test_obligacion_so.mjs`, `test_propuesta_lote.mjs` y `auditar_rutas_sin_guardian.js`. Ver "El ENLACE para el propio S.O." y "Riesgo, recientes y «Para cubrir a INTERALCO»".

212. **El lote habla con beCAE (Marwen) por su API v1.6.0, y la respuesta se lee en los DOS formatos** (2026-11-11, guía de Marwen): desde la 1.6.0 las respuestas van en `{ success, message, data }` y el nº de solicitud llega en `data.num_solicitud` — leer solo la raíz dejaba el lote sin nº (`normalizarCreacion`/`datosDe` de [marwenService.js](implementation/backend/services/marwenService.js)). El bloque **«⚡ beCAE en vivo»** ([BecaeEnVivo.jsx](implementation/frontend/src/features/lotes/components/BecaeEnVivo.jsx); qué paso toca lo decide `accionesBecae` de [logic/becae.js](implementation/frontend/src/features/lotes/logic/becae.js)) busca el lote por su PEDIDO (= su código), sella el estado y el nº de expediente del verificador si faltaba, trae la solicitud (sola al enviar por API) y la oferta, y sube la solicitud firmada, los `E{n}.zip` (todos o ninguno) y la oferta firmada. **Lo que sale hacia beCAE lo pulsa una persona con la lista de ficheros delante, y subir la oferta firmada ES aceptarla**; la solicitud de la APP no se sube nunca. **Las inexactitudes de la API entran por el MISMO `registrarInexactitudes` que las del PDF** (regla 159, colgadas del último informe subido), con el nº comparado como TEXTO («3-R2»), y respetando su LÍMITE de consultas (429 + `Retry-After`, solo con el expediente En resolución/HDTED). Contestarlas sigue siendo en el portal. Tras tocarlo: `node implementation/backend/scripts/test_marwen_api_v16.js`, `test_becae_acciones.mjs` y `test_inexactitudes_lote.js`. Ver "La API de Marwen v1.6.0".

213. **El EQUIPO de verificación (verificador jefe y revisor técnico, con email y teléfono) se LEE del plan y de las copias de su correo, y un email solo es de quien casa con su nombre** (2026-11-12, Fran: «quiero saber quién es el verificador… el teléfono… y el email»). Se guarda en `documentos_so[plan_verificacion].equipo` y lo enseña el Resumen del lote ([EquipoVerificacion.jsx](implementation/frontend/src/features/lotes/components/EquipoVerificacion.jsx)). El PDF (`leerPlanVerificacion`) trae al jefe con email y teléfono y al revisor solo con el nombre; el email del revisor está SOLO en la copia del correo «Plan de verificacion CAE-… (LOTE-…)», y se le pone si su dirección casa con su nombre (`fcharriel` ↔ Francisco Jesús CHARRIEL) — **nunca se compone un email**. Lo guardado solo rellena huecos y no pasa a OTRA persona; de cada lote manda el ÚLTIMO plan (las «Adendas» cambian el equipo). Se lee al subir el plan, con «⌕ Leer del plan» (`POST /:id/plan-verificacion/leer`) y solo desde el buzón (`PLAN_VERIFICACION_CORREO_ENABLED`, **nace APAGADO**), que además archiva el PDF si el lote no lo tenía; el plan no mueve el estado del lote. Fuente única: [equipoVerificacion.js](implementation/backend/services/equipoVerificacion.js). Tras tocarlo: `node implementation/backend/scripts/test_equipo_verificacion.js` y, en seco contra el buzón, `importar_planes_verificacion.js`. Ver "El EQUIPO de verificación del lote".

215. **El Anexo I del LOTE lleva las firmas ANCLADAS al pie de la hoja, y sus casillas se MIDEN** (2026-11-12, LOTE-2026-018). El bloque de firmas iba detrás de la tabla y bajaba con cada actuación: la casilla fija de `SIGN_BOXES.anexo_i_listado*`, medida con un lote corto, caía encima de las filas 8 y 9 de un lote de 10 y la firma de Brokergy las tapó. Ahora `.hoja` llena la hoja útil, `.firma` va con `margin-top:auto` y un hueco fijo bajo cada rótulo ([anexoListadoHtml.js](implementation/frontend/src/features/lotes/logic/anexoListadoHtml.js)), y las casillas (Proveedor 131,42–337,106; S.O. 504,42–710,106) son las mismas con 1 que con 10 actuaciones y caen en blanco también en los PDF de la maqueta anterior. El flex va en `.hoja`, nunca en el `body` (la vista previa del popup inyecta este `<style>` en la app). Caben 10 actuaciones RES060 reales en una hoja (7 RES093). Tras tocar la maqueta o las casillas: `node implementation/backend/scripts/check_anexo_listado_firmas.mjs`. Ver "El Anexo I del lote: las firmas van al PIE de la hoja".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/lotes/armar-el-lote-propuestas-por-antiguedad-y-por-instalador.md` — Armar el lote: filtro por instalador y PROPUESTAS por antigüedad y por instalador (2026-10-27) · 6,6 KB
- `docs/conocimiento/lotes/auditar-los-cee-res060-frente-a-res080.md` — Auditar los CEE de un RES060 frente a un RES080: qué cuenta y qué no (2026-11-01) · 5,0 KB
- `docs/conocimiento/lotes/contestar-inexactitudes-en-el-portal-de-marwen.md` — Contestar las inexactitudes en el portal de Marwen (beCAE), no por API (2026-11-11) · 3,2 KB
- `docs/conocimiento/lotes/cuando-marwen-no-responde-el-envio-por-api.md` — Cuando MARWEN no responde: el envío por API dice de quién es el fallo (2026-10-15) · 2,1 KB
- `docs/conocimiento/lotes/el-anexo-del-miteco-por-actuacion.md` — El ANEXO del MITECO por actuación (2026-09-01) · 8,8 KB
- `docs/conocimiento/lotes/el-anexo-i-del-lote-las-firmas-van-al-pie.md` — El Anexo I del lote: las firmas van al PIE de la hoja, y sus casillas se miden (2026-11-12) · 3,0 KB
- `docs/conocimiento/lotes/el-equipo-de-verificacion-del-lote.md` — El EQUIPO de verificación del lote: quién verifica y cómo se le contacta (2026-11-12) · 4,1 KB
- `docs/conocimiento/lotes/el-paquete-de-cada-actuacion-renombrar-a-e-n-y-zipear.md` — El PAQUETE de cada actuación — renombrar a E{n} y zipear (2026-09-08) · 15,5 KB
- `docs/conocimiento/lotes/el-registro-miteco-y-los-requerimientos-del-gestor.md` — El Nº de REGISTRO del MITECO en el lote, y los requerimientos del Gestor (2026-10-27) · 6,0 KB
- `docs/conocimiento/lotes/el-total-que-nos-ingresa-el-so-y-el-cobro.md` — El TOTAL que nos ingresa el S.O., y marcarlo COBRADO (2026-10-15) · 4,1 KB
- `docs/conocimiento/lotes/el-zip-que-se-sube-a-becae-es-el-mismo-paquete-del-miteco.md` — El ZIP que se sube a beCAE es el MISMO paquete del MITECO (2026-09-09) · 14,3 KB
- `docs/conocimiento/lotes/la-api-de-marwen-v1-6.md` — La API de Marwen v1.6.0: el lote habla solo con beCAE (2026-11-11) · 7,7 KB
- `docs/conocimiento/lotes/la-ficha-del-lote-en-crema.md` — La ficha del lote, en crema: qué toca, dónde está y cómo se ve (2026-11-12) · 6,5 KB
- `docs/conocimiento/lotes/la-vista-del-sujeto-obligado.md` — La «Vista S.O.»: su obligación del año y cómo vamos con ella (2026-10-28) · 12,0 KB
- `docs/conocimiento/lotes/las-cifras-del-lote-se-leen-de-sus-documentos.md` — Las cifras del lote se LEEN de sus documentos (2026-09-01) · 9,3 KB
- `docs/conocimiento/lotes/las-inexactitudes-del-verificador-se-registran-y-la-respuesta-se-arma-sola.md` — Las INEXACTITUDES del verificador se registran solas, y la RESPUESTA se arma al subsanar (2026-10-22) · 11,1 KB
- `docs/conocimiento/lotes/las-tarifas-del-verificador-en-su-ficha.md` — Las TARIFAS del verificador, en su ficha (2026-09-14) · 3,7 KB
- `docs/conocimiento/lotes/los-firmados-del-so-llegan-por-correo-y-se-registran-solos.md` — Los FIRMADOS del S.O. llegan por CORREO y se registran solos (2026-10-19) · 7,9 KB
- `docs/conocimiento/lotes/pedirle-cosas-al-sujeto-obligado-desde-el-cuadro-de-mando.md` — Pedirle cosas al SUJETO OBLIGADO desde el cuadro de mando (2026-09-01 · ofertas 2026-09-10) · 13,8 KB
- `docs/conocimiento/lotes/quien-firma-por-el-sujeto-obligado-y-la-ficha-que-no-viajaba.md` — Quién FIRMA por el SUJETO OBLIGADO, y la ficha que no viajaba (2026-09-19) · 5,3 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/lotes/armar-el-lote-propuestas-por-antiguedad-y-por-instalador.md`
  - **REGLA — la antigüedad es la del RADAR.**
  - **REGLA — el instalador es el de siempre del lote**
  - **REGLA — una propuesta nunca mezcla año ni CCAA, ni pasa del cupo.**
  - **REGLA — entre instaladores: primero el que ya está en el lote, luego el que más lleva
esperando.**
  - **REGLA — «Añadir N» entra por la MISMA ruta que el botón suelto**
  - **REGLA — en DOC. COMPLETA manda el ESTADO: entra en el lote aunque tenga incidencias graves
abiertas, que solo se avisan.**
  - **REGLA — con kWh, la primera propuesta es «los de más MWh» de cada año + CCAA, y si el lote
tiene S.O. con algo que cubrir se titula «Para cubrir a {S.O.}».**
- `docs/conocimiento/lotes/auditar-los-cee-res060-frente-a-res080.md`
  - **REGLA — en un RES060, el CEE final NO se cambia aunque no coincida con los cálculos del CIFO.**
  - **REGLA — lo que tiene que ser anterior al inicio de la obra es la VISITA y la FIRMA del CEE inicial, no
su REGISTRO.**
  - **REGLA — que la ficha esté sin generar o sin firmar no es un defecto del expediente y no se
lista**
- `docs/conocimiento/lotes/contestar-inexactitudes-en-el-portal-de-marwen.md`
  - **REGLA — la contestación se sube en UNA subida: el escrito firmado y todos los `_v1`, con una
nota.**
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
- `docs/conocimiento/lotes/el-anexo-i-del-lote-las-firmas-van-al-pie.md`
  - **REGLA — el bloque de firmas va ANCLADO al pie de la hoja, con un hueco fijo bajo cada rótulo.**
  - **REGLA — las casillas se MIDEN sobre el PDF de verdad, con el mismo motor que la app.**
- `docs/conocimiento/lotes/el-equipo-de-verificacion-del-lote.md`
  - **REGLA — un email solo se le pone a una persona si está escrito junto a ella o si su
dirección CASA con su nombre.**
  - **REGLA — lo ya guardado solo rellena huecos, y no se arrastra a otra persona.**
  - **REGLA — manda el ÚLTIMO plan.**
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
- `docs/conocimiento/lotes/el-registro-miteco-y-los-requerimientos-del-gestor.md`
  - **REGLA — el nº de registro se LEE del justificante, sin IA.**
  - **REGLA — un justificante nuevo es una presentación nueva: su número MANDA.**
  - **REGLA — va junto al nº del verificador, y lo ve y edita todo el staff.**
- `docs/conocimiento/lotes/el-total-que-nos-ingresa-el-so-y-el-cobro.md`
  - **REGLA — con la factura emitida, el total es EL DE LA FACTURA.**
  - **REGLA — solo se cobra una factura que EXISTE.**
  - **REGLA — marcarla cobrada mueve el lote a «PTE. PAGO BROKERGY A CLIENTE».**
  - **REGLA — y al revés: pasar el lote a «PTE. PAGO BROKERGY A CLIENTE» (o a FINALIZADO) con la factura
emitida SIN cobrar pide la fecha del ingreso en ese momento**
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
- `docs/conocimiento/lotes/la-api-de-marwen-v1-6.md`
  - **REGLA — la respuesta de Marwen se lee en los DOS formatos.**
  - **REGLA — en beCAE nuestros lotes se buscan por su PEDIDO, que es su código**
  - **REGLA — lo que SALE hacia beCAE lo pulsa una persona y se confirma con la lista de ficheros.**
  - **REGLA — la solicitud firmada que genera la APP no se sube nunca**
  - **REGLA — los tipos de documento de beCAE se normalizan en UN sitio**
  - **REGLA — las inexactitudes de la API entran por el MISMO camino que las del PDF**
  - **REGLA — las inexactitudes tienen LÍMITE de consultas por clave**
- `docs/conocimiento/lotes/la-vista-del-sujeto-obligado.md`
  - **REGLA — la obligación la TECLEAMOS, por S.O. y año.**
  - **REGLA — lo que le falta = cubrible con CAE − lo comprado a otros − TODO lo nuestro
para ese año**
  - **REGLA — lo nuestro, por ETAPAS vistas desde el S.O.**
  - **REGLA — cada lote cuenta para UN año de obligación**
  - **REGLA — lo disponible es lo que tenemos SIN lote y sin rechazar**
  - **REGLA — el enlace es un token de 128 bits por S.O., y quitarlo o cambiarlo deja muerto el
anterior.**
  - **REGLA — el S.O. ve su obligación y NUESTROS LOTES; de lo que no está en un lote, solo el
TOTAL.**
  - **REGLA — el estado del lote le llega en SU idioma, nunca el nuestro.**
  - **REGLA — lo que le falta se cubre primero con lo LISTO y luego terminando lo que tiene la obra
hecha, de más a menos MWh; de lo que aún se está cerrando, lo que tiene incidencias GRAVES
abiertas no cuenta.**
  - **REGLA — el S.O. ve el AHORRO por trabajar con BROKERGY; a cuánto le sale el CAE (€/MWh) lo ve
solo nuestro ADMIN**
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
  - **REGLA — la contestación a la SOLICITUD DE EMISIÓN se descarta por el ASUNTO, y un
papel que dice ser otra cosa no pasa por Anexo I aunque lleve el código del lote**
  - **REGLA — se registra solo lo LIMPIO.**
  - **REGLA — lo ya firmado NO se reemplaza**
  - **REGLA — un PDF que llegó ANTES de mandar a firmar la versión vigente es de una ronda
anterior**
  - **REGLA — nace APAGADO**
- `docs/conocimiento/lotes/pedirle-cosas-al-sujeto-obligado-desde-el-cuadro-de-mando.md`
  - **REGLA — un correo por S.O.: nuestras facturas salen en UNA petición por Sujeto Obligado.**
  - **REGLA — sin factura, solo cuenta el lote que AÚN espera el pago del S.O.**
  - **REGLA — se enseñan ANTES de generarlas, y generarlas no envía nada.**
  - **REGLA — el número se pide al servidor justo antes de cada una**
  - **REGLA — lo que no se puede sacar sin mirar se queda FUERA, diciendo qué falta.**
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
