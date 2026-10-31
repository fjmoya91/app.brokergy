---
paths:
  - "implementation/frontend/src/features/cee/**"
  - "implementation/frontend/src/features/encargo/**"
  - "implementation/frontend/src/features/expedientes/components/{CeeModule,CeeDocumentsGrid,EncargoCertificadorModal,EncargoAgenteIa*,AgenteIa*,TecnicoPicker,RevisionCee*,PreRevisionCee*,BorradorCee*,EncargarPresentacion*,GuiaIrpf*,CeeAnteriorCliente,DemandaPropuesta*,MensajeEditable,ConfirmadoPorCliente,Ce3xAyudas*}.jsx"
  - "implementation/frontend/src/features/expedientes/logic/{irpfEpnr,guiaIrpf,borradorCee}.js"
  - "implementation/backend/services/cee/{revision*,radiografiaCee,cargarRevision,subidaCeePublica}.js"
  - "implementation/backend/services/{ceeUploadService,ceeFirmaService,borradorCeeService,presentacionCeeService,encargoTecnico,agenteIa,registroCeeOcrService,guiaIrpfService,ceeOcrService,revisionPendienteNotifier,certificadorLookup}.js"
  - "implementation/backend/utils/{ceeFechas,materialCee,objetivoEncargo,combustibleCaldera}.js"
  - "implementation/backend/routes/{guiaIrpfRutas,presentacionCeeRutas,ceeOcr}.js"
  - "implementation/backend/scripts/{revisar_cee,agente_ia,probar_pre_revision,presentar_cee,firmar_cee}*.js"
  - "implementation/backend/scripts/presentar_cee/**"
  - "skills/presentar-cee/**"
---
# Módulo CEE — encargo al técnico, subida, revisión, visto bueno, presentación en el Registro, IRPF, Agente IA (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/cee/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

11. **XML Upload**: Parseo automático de demandas y también de `fechaFirma` y `fechaVisita`.

27.c **La FECHA DE REGISTRO del CEE se LEE del justificante, no es el día de la subida**: la trae impresa en su primera página («…número de registro 3014080/2025 solicitado el 19/07/2025…») y de ella cuelgan el plazo de la obra, el devengo del certificador y el cruce con las facturas. La leen las CUATRO superficies que la sellan (rejilla y enlace público, en CAE y en CEE directos) y se puede releer la de un justificante ya subido con el botón ⟳ (`POST /:id/cee/fecha-registro/leer`, declarada en las dos rutas del módulo CEE). El modelo solo LEE: se le pide la FRASE literal y el código reextrae de ella la fecha (`fechaDesdeFrase`), que es además la evidencia que se le enseña al usuario. Una lectura fallida no tira la subida: se cae a la fecha de hoy **y se dice**. Fuente única: [registroCeeOcrService.js](implementation/backend/services/registroCeeOcrService.js). Lo ya sellado mal se corrige con `scripts/releer_fechas_registro_cee.js`. Ver "La FECHA DE REGISTRO del CEE se LEE del justificante".

42. **Al encargar el CEE, el cliente también se entera**: el MISMO botón de «Asignar y notificar» manda al contacto de notificaciones del cliente un aviso de que el trámite ha arrancado, quién lo lleva y que le avisaremos cuando esté registrado. El texto lo redacta el BACKEND (`encargoCeeClienteMsg` en [recordatorios.js](implementation/backend/services/recordatorios.js)) y el popup solo lo enseña —plegado— y deja retocarlo; el borrador y el destinatario salen de `GET /:id/aviso-cliente-cee`. NO sale con «Solo asignar» (el texto afirma que ya le hemos mandado las instrucciones al técnico), se avisa **una vez por fase** (sello en `documentacion.aviso_cliente_cee[fase]`: reasignar técnico no puede volver a anunciarle que su trámite empieza), el «no empieces la obra todavía» **solo si la obra no está hecha**, y no se promete fecha sino el aviso. Un fallo del aviso nunca tumba el encargo. Ver "Al encargar el CEE, el CLIENTE también se entera".

52. **El BORRADOR para presentar el CEE en el Registro**: botón **📄 Presentar el CEE** dentro de Ayudas CE3X — un popup con cada casilla del formulario telemático lista para copiar, más un PDF descargable que **viaja adjunto en el visto bueno** al certificador (`adjuntarBorrador`, por defecto sí, en el CAE y en los CEE directos). **NO es una réplica del impreso**: el trámite se rellena en la sede y no hay PDF que rellenar (a diferencia de las fichas RES, regla 41), así que lo que se genera es una GUÍA de qué va en cada casilla, en su orden, y **qué X marcar y cuál dejar sin marcar**. **Solo CASTILLA-LA MANCHA** (procedimiento 020264 · SIACI SJM3): fuera de ahí no se genera y se dice de qué comunidad es — cada una tiene su trámite y sus casillas. En el apartado 05 manda **lo que dice el propio certificado** (`cee_{fase}.identificacion`), que es contra lo que compara el Registro; el troceo de la vía se PROPONE con el original al lado y **lo ambiguo no se reparte a ojo**; y se avisa del **plazo de UN MES** desde la emisión, que es lo único que cuesta dinero. Los documentos anexados NO se copian: se DESCARGAN ya renombrados (`GET /:id/borrador-cee/fichero`), con el nombre REAL que tienen en Drive y el NIF delante — uno compuesto no coincidiría (medido en 26RES060_187: sus ficheros llevan `_REVISADO`). El teléfono y el correo del solicitante caen a su **persona de contacto** si el titular no los tiene, diciéndolo con su nombre ([utils/contactoCliente.js](implementation/frontend/src/utils/contactoCliente.js), compartido con la ficha del `.cex`). Es `staffOnly`: al técnico le llega adjunto, que es cuando puede presentar. ⚠️ `parseCeeXml` no leía la calificación de **EMISIONES** (solo la de energía primaria) y los certificados ya subidos no la tienen: se relee del `.xml` crudo con **`leerCalificacionesDeTexto`**, un lector SIN DOM — `DOMParser` no existe en Node y `parseEpnrFromXml` allí devuelve vacío **en silencio**. Fuente única: [logic/borradorCee.js](implementation/frontend/src/features/expedientes/logic/borradorCee.js). Tras tocarlo: `node implementation/backend/scripts/test_borrador_cee.mjs`. Ver "PRESENTAR el CEE en el Registro".

69. **El CEE que entrega el certificador se REVISA antes de darle el visto bueno**: `radiografiaCee` lee los HECHOS del `.xml` y `revisionCee` los cruza con el expediente punto por punto, con la evidencia literal al lado (`node scripts/revisar_cee.js --expediente 26RES060_192`). **PROPONE, no aprueba**: no escribe en el expediente, no registra incidencias y no le escribe al certificador — el visto bueno se sigue dando en el módulo CEE. **Lo que no se puede comprobar se DICE** y baja el veredicto a APTO CON AVISOS: un punto callado se lee como un punto que está bien. Tres cosas MEDIDAS sobre los 462 certificados reales: **la acumulación de ACS NO está en el `.xml`** (el único nodo con «volumen» es el de la vivienda — solo vive en el `.cex`, regla 48.b), **en un RES080 qué se sustituye no se lee del texto de la medida de mejora** (es texto libre: «CEE FINAL.cex», «MAE 1») sino comparando los DOS certificados cerramiento a cerramiento —la ventana que se cambia es la que baja de U—, y **el combustible se compara por FAMILIA**, porque `gas_*` cubre gas natural y GLP con la misma fila del Anexo VIII (dentro de la familia → aviso; cambiar de familia → falla). El `.xml` se lee de **Supabase** (`cee.xml_inicial`), donde vive EN MAYÚSCULAS: `parseCeeXml` no puede releerlo (regla 32) y este lector sí, porque busca sin distinguir mayúsculas — si alguien quita el flag `i`, deja de funcionar en silencio. Comprueba además que las **transmitancias** de muros, cubierta, suelo y particiones estén justificadas —⚠️ en el `.xml` el «Conocido» de CE3X se escribe **`Usuario`**, no existe ninguna cadena «Conocido»; los huecos lo declaran en `<ModoDeObtencionTransmitancia>` y los puentes térmicos no cuentan—, que la **fecha del certificado** sea la que consta en el expediente (que es la que el visto bueno le pide firmar, `fechaFirmaCee`), que la **visita** sea anterior al certificado y exista, y que **quien firma** sea el técnico asignado (por su NIF o el de su entidad). Esos cuatro son AVISO salvo la visita posterior y la fecha futura, que son imposibles: como fallo, el de las transmitancias dejaría fuera a media cartera (65 de 115 la cumplen; el SUELO queda fuera de la cuenta porque solo el 11 % lo justifica). ⚠️ La **FASE no se deduce del nombre del fichero**: de ella depende el criterio, y equivocarla revisa con el contrario. Tras tocarlo: `node implementation/backend/scripts/test_revision_cee.js`. Ver "REVISAR el CEE que entrega el certificador". **Desde 2026-09-29 lee también el `.cex` del técnico** (motor: `POST /cex/radiografia`) y juzga la MEDIDA DE MEJORA del inicial —obligatoria en sustitución/hibridación, calculada, sobre ESTE edificio (desfase), con el equipo y el SCOP del expediente o, sin equipo, con la genérica de la simulación—; las transmitancias y la ventilación contra la GUÍA (aviso desde el 01/04/2026), la demanda en dos escalones (aviso hasta −10 %), huecos, puentes y lo que confirmó el cliente; el rendimiento de la caldera pasa a informativo. `--poner-medida` mete la medida en el `.cex` del técnico (sin calcularla). Ver "Con el `.cex` delante, y la MEDIDA DE MEJORA".

80. **«Solo asignar» a un certificador EXTERNO no es un encargo: la fase NO pasa a `ASIGNADO`.** `POST /api/expedientes/:id/notify-certificador` marcaba `ASIGNADO` + «EN CERTIFICADOR CEE INICIAL» también sin mandar nada, y `ASIGNADO` significa *encargo enviado*: el expediente salía de `SIN_ENCARGAR` del parte y pasaba a `CERT_SIN_ENTREGAR` («encargado, sin arrancar», 10 días de plazo). Medido el 28/09/2026: 26RES060_199 y _200 asignados a Raquel Moncayo con «Solo asignar» el 25-26/09, sin email, sin WhatsApp y sin una línea de historial — ella los descubrió abriendo la app. Ahora (`encargoPendiente`) la fase se queda en `PTE_ENVIO_CERT`, el estado no avanza, no se regenera el `ack_token` (mataría el enlace de un encargo ya enviado), no se escribe `seguimiento` (el relleno `PTE_EMITIR` lo volvería a esconder del parte) y el historial dice «asignado SIN AVISAR · encargo PENDIENTE DE ENVIAR». Es la MISMA regla que ya tenía la ruta de CEE directos. **Excepción: el certificador de la CASA** (`esDeBrokergy`, CIF B19350222) — asignárselo a uno mismo ES el encargo, y dejarlo pendiente lo tendría a diario en el parte pidiéndote que te escribas. El popup (`EncargoCertificadorModal`) lo dice en ámbar tras «Solo asignar», y con «Asignar y notificar» **un resultado sin ningún canal es un ERROR**, no un «¡Encargo enviado!» con un genérico «Notificación enviada». Tras tocarlo: `node implementation/backend/scripts/test_solo_asignar_cert.js`.

90. **Al subir su `.xml`/`.cex`, el técnico ve la REVISIÓN PREVIA y corrige lo suyo antes de que llegue a Brokergy** (2026-09-30). Es el MISMO juicio de la lupa de Fran (se guarda en `cee.revision_{fase}` con `origen: 'subida'`), pero al técnico se le enseña SU parte ([revisionTecnico.js](implementation/backend/services/cee/revisionTecnico.js) — `vistaTecnico`): **con la demanda y la superficie frente a la simulación como algo que REVISAR, nunca «corregir»** (de ellas sale el ahorro en MWh certificable y el email del encargo ya se las da como objetivo; el consejo le pide comprobar su modelo y decirlo si la vivienda es así — decisión del usuario, 2026-09-30), sin lo informativo, con los consejos escritos para él y **sin decirle nunca "APTO"**. Sale en el popup «Solicitar revisión» de la rejilla (`POST /api/expedientes/:id/pre-revision-cee`, `suyoSiCertificador`), en la chapa 🔍 del certificador y en `/subir-cee` (`POST /api/public/cee-prerevision/:id`, con freno de 20 s que un fichero nuevo olvida). **El detalle de un expediente que abre un CERTIFICADOR lleva la revisión en SU versión** (`revisionParaTecnico` en `scrubExpedienteForUser`): antes viajaba entera, con el veredicto y los botones de Brokergy. **Lee el `.xml` de DRIVE** (`xmlDeDrive`): el de la BD lo escribe el navegador después, y por el enlace público nunca. **No bloquea**: con algo que corregir el botón dice «Avisar igualmente a Brokergy». El aviso a Fran (`notify-review`) lleva el veredicto COMPLETO, y **sin el enlace de visto bueno en el WhatsApp** (aprueba con un GET y la vista previa de enlaces lo abriría). Solo CAE. Tras tocarlo: `node implementation/backend/scripts/test_pre_revision_cee.js` y `probar_pre_revision.js <nº>` (sin guardar). Ver "La revisión PREVIA al subir el técnico".

92. **El técnico tiene UNA página del encargo, y el enlace es SUYO** (2026-09-30): `/encargo/:id?token=&phase=[&origen=cee]`, pensada para el móvil — qué le toca ahora, el cliente con Llamar/WhatsApp, Cómo llegar, la instalación, lo que confirmó el cliente, las fotos de SU fase y los enlaces para subir y presentar. El token es un HMAC atado al `certificador_id` ASIGNADO: al reasignar, el enlace del anterior deja de valer solo, y cada foto se vuelve a comprobar contra la firma. **Lista blanca y ni un importe**, pero con el **objetivo del certificado** (demanda y superficie mínimas, o ahorro en RES080), el MISMO del email por `objetivosEncargo`; nunca facturas, presupuestos ni «Otros». Aceptar va por los acuses de siempre. El enlace sustituye a «Abre el expediente en la app» en el WhatsApp del encargo y es un botón en el email (CAE y CEE directos). Fuente única: [encargoTecnico.js](implementation/backend/services/encargoTecnico.js). Tras tocarlo: `node implementation/backend/scripts/test_encargo_tecnico.mjs` y `test_pre_revision_cee.js`. Ver "La PÁGINA DEL ENCARGO del técnico".

97. **En un CEE directo de UN solo certificado, el CEE de ANTES del cliente se carga APARTE, como «CEE anterior del cliente»** (2026-10-01), y debajo sale la comprobación de la deducción del IRPF (ahorro ≥30 % en energía primaria no renovable o letra A/B) contra el CEE de este encargo. Va en `cee.cee_anterior`, **nunca en una fase**: en un encargo ÚNICO la fase «inicial» es el NUESTRO, y cargarlo ahí pisaba sus datos (2026CEE_60). El lector de PDF del CEE saca ya el consumo global de energía primaria no renovable y su letra, así que un PDF basta. Fuente única: [CeeAnteriorCliente.jsx](implementation/frontend/src/features/expedientes/components/CeeAnteriorCliente.jsx) + `comprobarIrpf` en [irpfEpnr.js](implementation/frontend/src/features/expedientes/logic/irpfEpnr.js). Ver "Un CEE directo de UN solo certificado: el CEE ANTERIOR del cliente".

98. **Al cliente se le envían sus CEE firmados + una GUÍA de una página para la deducción del IRPF, de un botón** (2026-10-01): bajo la comprobación del IRPF del módulo CEE, en los dos negocios. La guía dice qué deducción aplicarse (unifamiliar/edificio 60 % · piso 40 % · solo demanda 20 %), dónde se marca en Renta Web y los datos LITERALES que pide, con las facturas CON IVA (el 21 % supuesto se marca para revisar) y una estimación marcada como tal —o, sin facturas de la obra, un EJEMPLO con una obra de 9.000 €—; nunca afirma un derecho. El tipo de vivienda lo manda el CATASTRO (participación < 100 % → piso → 40 %), como en la oportunidad; lo tocado en el popup se guarda solo, y reenviar con otro porcentaje sale como CORRECCIÓN. En un CEE directo va también, adjunta, con la ENTREGA del certificado (panel, automática y rejilla), sin poder pararla nunca. Los datos del certificado salen de su `.xml` (manda sobre lo guardado, y se avisa si difiere). Solo viajan los PDF firmados y la guía; respeta el candado de cobro de los CEE directos. Se guarda en Drive, se sella en `documentacion.guia_irpf` (clave protegida) y la sirve el portal del cliente. **En un expediente CAE la guía lleva una SEGUNDA hoja, «Tu bono CAE en la Renta»** (2026-10-26, Fran): el bono NO se resta de las «Cantidades satisfechas» (no es una subvención: la DA 50ª solo descuenta los programas de ayudas públicas con resolución, como los RD 853/2021 y 477/2021), tributa aparte como ganancia patrimonial en la base del ahorro (DGT V2137-25) y no hay «resolución»: su justificante es la CARTA DE PAGO + el convenio de cesión. Con el bono cobrado lleva su importe, la carta y un impuesto marcado como aproximado (`calcularIrpfGananciaPatrimonial`, la escala de la calculadora); sin cobro, sin cifras. En un CEE directo NO va. Suelta: `node implementation/backend/scripts/hoja_bono_cae.js [<nº>]`. Fuente única: [logic/guiaIrpf.js](implementation/frontend/src/features/expedientes/logic/guiaIrpf.js) + [guiaIrpfService.js](implementation/backend/services/guiaIrpfService.js). Tras tocarlo: `node implementation/backend/scripts/test_guia_irpf.mjs` (incluye que cada hoja cabe en su A4). Ver "La GUÍA de la deducción del IRPF para el cliente" y la consulta "Bono CAE: no se resta de la deducción y no hay resolución".

101. **El AGENTE IA es un certificador más** (2026-10-01; **desde el 26/10/2026 no se queda en la barra: queda Fran y el encargo va a su sello, regla 175**): ficha «AGENTE IA» en `prescriptores` (`es_agente_ia`), elegible en el selector de técnico. Encargárselo es asignarlo (ASIGNADO, sin mensajes: no tiene email ni teléfono) y se le pone a trabajar pidiéndoselo a Claude; la skill marca la fase al empezar (`agente_ia.js empezar` → EN_TRABAJO, el agente en la barra si no hay técnico) y al escribir el `.cex` la deja «pendiente de revisión» y avisa por WhatsApp + email como un técnico que sube su archivo. Con un técnico asignado no le quita nada (le prepara el borrador). No firma: no va como técnico en el `.cex`, el radar lo saca en su bloque `AGENTE_IA` sin reclamarle nada y el visto bueno avisa. Fuente única: [services/agenteIa.js](implementation/backend/services/agenteIa.js). Tras tocarlo: `node implementation/backend/scripts/test_agente_ia.js` y `test_agente_ia_flujo.js`. Ver "El AGENTE IA, un certificador más".

107. **La rejilla del CEE: una columna por cosa, la versión del `.xml` a la vista y «Presentar» solo cuando toca** (2026-10-02). La primera columna metía título, lupa, ✓, campana y el `.xml` en 250 px: no cabían, el título se partía y el `.xml` se salía ENCIMA de «Demanda calefacción». Ahora la fase es una columna de 220 px con título · estado · UNA barra de acciones (siempre en el mismo orden: revisar → **Validar** (el visto bueno, con texto) → campana → reenviar; «Generar» del final solo mientras el final NO está entregado) y debajo las tareas que tocan (`TareaFase`: «Listo para encargar», «Presentar el CEE»); el `.xml` va en su propia columna con la **etiqueta del programa** —CE3X 2.3 / 3.1 / 3.2, ámbar si es una 2.3 emitida desde el 01/10/2026 o una 3.1 desde el 08/10/2026 (las dos escriben el esquema v3.0; las separa la fecha de compilación de `<Version>`: 2026.08.20 / 2026.10.05)— que sale de [cee/programaCee.js](implementation/frontend/src/features/cee/programaCee.js) (el `<Procedimiento>` del v2.0 dice `CEXv2.3`; en el v3.0 su `<Version>` es una FECHA de compilación y manda el esquema). **«Presentar el CEE» dejó la barra del módulo** (salía siempre, también sin hacer o ya inscrito): es una tarea en la fila de la fase con el certificado entregado, **REVISADO** (visto bueno dado) —o subido, si el certificador es el de la casa, por CIF— y sin registrar; abre el borrador EN esa fase (`faseInicial`), dice el plazo de un mes (ámbar ≤ 7 días, rojo vencido) y desaparece al registrarse. Sigue en Ayudas CE3X para cualquier otro momento. Tras tocarlo: `node implementation/backend/scripts/test_programa_cee.mjs`.

116. **El CEE se ENCARGA presentar a una persona de fuera con un enlace sin cuenta** (2026-10-06; **SIN ENTRADA desde el 25/10/2026: Eva ya no presenta, ver regla 173** — el servicio y la página pública siguen, el botón no sale): botón «✉ Enviar a presentar» del popup «Presentar el CEE». Le llega un correo con el borrador en PDF, el .cex, el .xml y el PDF firmado —**nunca nada con «REVISAR» en el nombre, y si falta uno no sale nada**—; la tarjeta dice «Pendiente de presentación» hasta que sube el justificante y lleva el acceso directo «✉ Enviar a presentar»; y tiene su bandeja con todo lo pendiente (`/presentar/pendientes?token=`, revocable, en cada correo); con el certificador de la casa, «Validar» abre este popup y valida al enviar (sin mensaje a uno mismo); y un enlace revocable (`cee.presentacion[fase].nonce`) a `/presentar/:negocio/:id`, donde copia el borrador y sube el justificante, que registra la fase por la misma subida que el técnico (`subidaCeePublica.js`). Sin importes. Fuente única: [presentacionCeeService.js](implementation/backend/services/presentacionCeeService.js). Tras tocarlo: `node implementation/backend/scripts/test_presentacion_cee.js`. Ver "ENCARGAR la presentación a una persona de fuera".

138. **El CEE se PRESENTA en la sede de la JCCM sin tocar el PC: skill `presentar-cee`** (2026-10-15). `node scripts/presentar_cee.js pendientes | preparar <nº> | devuelto <nº> --registro --tasa [--escribir]` + Claude en Chrome. La firma (DOS: identificarse y enviar) sale sin ventana porque antes de cada una se pega `certificado.js` (de `preparar`): fija por **HUELLA** el certificado PERSONAL de quien presenta (`filters=thumbprint:SHA1:…` + `headless=true`, los parámetros de la propia librería de la sede), así que vale en cualquier PC con el certificado en Windows, **sin Firefox** (desde el 27/10/2026); en el almacén de Windows hay certificados de varias personas, así que nunca se elige a ojo ni con un Intro, y si sale la ventana `vigilante_autofirma.ps1` la CANCELA. En la sede: **«Es representante» antes de rellenar** (si no, el solicitante es quien se identifica), **«Añadir Referencia»** tras la catastral (si no, rechaza el XML), **en el 02 va quien FIRMA y nunca el AGENTE IA** (con el agente asignado, el certificador de la casa —Fran— o el que diga `--certificador`; un técnico real sin datos no se sustituye; sin el 02 completo, NO LISTO: 26RES060_189) y los ficheros **con su nombre ORIGINAL**, porque la sede antepone el NIF ella sola. **El pago necesita el «sí» del usuario en el chat** por expediente e importe, con la tarjeta guardada en Chrome que él diga (nunca se teclea una tarjeta) y su 3DS. Lo devuelto entra por `subidaCeePublica` como en la página de presentar, y lo sube el SERVIDOR (`POST /:id/presentacion-cee/devuelto`, clave interna) para que salgan los mismos avisos que con el certificador; desde el PC no sale ninguno. El pago se confirma UNA vez, al principio, con expediente e importe; después no se para salvo que el usuario no autorice el 3DS. Y el CEE se FIRMA sin ventanas con `scripts/firmar_cee.js` (solo con un «doy por válido» del usuario): certificado de REPRESENTANTE de Brokergy por huella, última página debajo del rótulo con el logo estampado, comprobado con `leerFirmasPdf` antes de subirlo como `_fdo.pdf`. Ver "PRESENTARLO sin tocar el PC" y "FIRMAR el CEE sin ventanas".

140. **Un CEE cuyo XML NO VALIDA no se da por bueno, ni se sube, ni se firma, ni se presenta** (2026-10-19, 26RES060_195: inicial de la 2.3 sin NINGÚN hueco → final de la 3.2 con la marca «certificado incompleto»; la 3.x escribe un hueco de relleno «99999999.99» que su esquema rechaza). `xml2cert` es quien valida y solo lo dice en su `.log`: `cexAPdf.calificarCex` lo pasa SIEMPRE por él y, si no valida, devuelve `ok:false` + `incompleto` y SIN PDF; `guardarCalificadoEnDrive` lo vuelve a validar antes de subir (`validarXml`); `ceeFinalCopiando` para con 422 si el inicial no tiene huecos; `cee_inicial.js`/`cee_final.js` no avisan, `firmar_cee.js` no firma, `presentar_cee.js` deja NO LISTO y el vigilante `pdf_del_xml.js` no deja el PDF con marca. En la revisión, sin huecos es NO APTO también con solo el `.xml` (`radiografiaCee.esRelleno`). Tras tocarlo: `node implementation/backend/scripts/test_cee_incompleto.js [<xml>]` y `test_revision_cee.js`. Ver "Un CEE «incompleto» no se da por bueno ni se sube".

172. **El aviso de «CEE inicial presentado» pide SOLO lo que falta de la obra, y cuando lo presenta la CASA sale SOLO al cliente y al instalador** (2026-10-25, Fran). La lista ya no es fija («caldera, desmontaje, aerotermia, placas»): sale del MISMO checklist que su enlace de subida (`buildDocsView`, reconciliado con Drive y con el alcance del expediente: 060, 080, 093), solo lo que justifica la actuación, partida en «antes de empezar la obra» y «durante y al terminar», diciendo lo que YA tenemos y con el enlace filtrado `?need=`; al cliente en lenguaje de casa y sin facturas, al instalador con las técnicas y las facturas. Si no se puede saber qué falta (`pendientesObra` → `null`), la lista de siempre: nunca un aviso sin fotos por un fallo. Vale para el aviso automático, el reenvío de la rejilla, el enlace del email y el popup `notify-registration`. Con el justificante subido por la ruta interna (`/presentacion-cee/devuelto`, skill `presentar-cee`) de un CEE INICIAL de expediente que ESA subida ha pasado a REGISTRADO, el aviso sale solo (`avisarTrasPresentar`), el email al equipo va sin el botón «Notificar al Cliente» y el historial dice a quién llegó; un justificante repetido no re-avisa. Apagado en local con `CEE_REGISTRO_AVISO_AUTO=false`. Fuente única: [ceeRegistradoAviso.js](implementation/backend/services/ceeRegistradoAviso.js). Tras tocarlo: `node implementation/backend/scripts/test_aviso_cee_registrado.js`, `test_presentacion_cee.js` y `probar_aviso_cee_registrado.js <nº>`. Ver "El aviso de «CEE inicial presentado» pide SOLO lo que falta".

173. **Con el VISTO BUENO el CEE ya se puede presentar, y el `_REVISAR` de esa fase pasa a su nombre DEFINITIVO** (2026-10-25, Fran: «Eva ya no presenta; desde que doy el VB se puede presentar; si no están firmados, que también los firme; tras el VB no debe llevar el _REVISAR»). «Validar» con el certificador de la casa da el visto bueno directo, sin aviso y sin popup de Eva; «Presentar el CEE» sale solo con REVISADO; lo presenta la casa (PC, skill `presentar-cee`), firmando antes si falta el `_fdo`; en el parte, un CEE de Fran sin registrar es «Presentarlo», no «Enviar a Eva» (`aLaCasa`). Los tres visto bueno (CAE, CAE desde el email, CEE directo) llaman a [canonicoAlVistoBueno.js](implementation/backend/services/cee/canonicoAlVistoBueno.js): RENOMBRA en Drive `… - {rótulo}_REVISAR.cex/.xml/.pdf` a `{nº} – {rótulo}.*` (sin CE3X), apunta `.cex`/`.xml` en `cee_files`, carga el XML (regla 152, con `forzar`) y, si ya hay un canónico MÁS NUEVO, manda ése y el `_REVISAR` va a OLD; nunca borra, y un fallo no tumba el visto bueno. **Solo el borrador de ESA fase**: el `CEE PREVISTO_REVISAR` de un RES080 vive en la misma carpeta y nunca se asciende. **Y solo los CEE de la CASA** (Fran por el CIF o el Agente IA, `esDeLaCasa`): el de un técnico de FUERA no se renombra, `presentar_cee.js pendientes` lo lista aparte («LOS PRESENTA SU TÉCNICO») y `preparar` da NO LISTO — lo presenta él con el aviso del visto bueno (Fran: «si son de otro certificador se deben mantener y avisar para que los presenten ellos»). Tras tocarlo: `node implementation/backend/scripts/test_canonico_visto_bueno.js` y `test_presentacion_cee.js`. Ver "El VISTO BUENO deja el CEE listo para presentar".

175. **Todo CEE NACE con Fran de certificador, y el AGENTE IA trabaja SIN figurar en la barra** (2026-10-26, Fran: «excepto que yo diga lo contrario, todos los CEE me ponen a mí como certificador»). `createExpediente` y el alta de un CEE directo ponen al de la casa (salvo un MIGRADO); tenerlo puesto NO es haberlo encargado (sigue `PTE_ENVIO_CERT`, el radar dice «A tu nombre por defecto, sin empezar»). **El agente nunca se guarda como certificador**: elegirlo es encargárselo —`notify-certificador` guarda a Fran y sella `cee.agente_ia[fase].estado = 'encargado'`, y los PUT convierten su id en el de la casa (`normalizarCertificador`)—, y su encargo se lee del SELLO (`esEncargoDelAgente`: cola y bloque `AGENTE_IA` del radar). Con Fran en la barra el agente mueve la fase (`decidirCertificador`); un técnico de fuera no se toca salvo `--reasignar` (→ Fran). Lo ya existente: `scripts/certificador_casa_pendientes.js [--escribir]`, junto al deploy. Fuente única: [utils/certificadorCasa.js](implementation/backend/utils/certificadorCasa.js). Tras tocarlo: `node implementation/backend/scripts/test_agente_ia.js`, `test_agente_ia_flujo.js` y `test_solo_asignar_cert.js`. Ver "El certificador POR DEFECTO de todo CEE es Fran".

184. **Al técnico CON cuenta en la app de certificadores el encargo le llega POR LA APP, y lo que hace allí vuelve solo al expediente** (2026-10-30, Fran: «le debe llegar al certificador que le han asignado un expediente, que lo pueda aceptar o declinar… comunicación bidireccional»). Se casan por el EMAIL (`certapp_cuentas` ↔ `prescriptores`) y la obra guarda su expediente en `seguimiento.crm` (sin esquema nuevo). «Asignar y notificar» (CAE y CEE directo) crea la obra con el titular, la vivienda, **las fotos del expediente con los MISMOS ficheros de Drive** y **la instalación que ya consta (calefacción, ACS, emisor, placas, aires) con origen BROKERGY, sin pisar nunca lo que contestó el técnico** (`instalacionDelCrm`), y el mensaje lleva el enlace de la app en lugar de la página del encargo: **el popup ya lo ENSEÑA** (`enlaceAppPrevisto`, mismo criterio que el envío) y el WhatsApp, el EMAIL y el historial salen con el mismo texto (`textoParaTecnico`), nunca con los dos enlaces; con «Solo asignar» a uno de fuera no se crea nada (regla 80). En la app: **Aceptar** hace el acuse de siempre por dentro (`cert-ack` / `cee-ack`), **Rechazar** le retira del expediente y la fase vuelve a `PTE_ENVIO_CERT` con aviso al equipo; si el CRM se lo pasó a otro (`cert_id` ≠ `cee.certificador_id`), la obra se archiva. **No gasta créditos**, no se borra (409 `ENCARGO_CRM`) y no se pide sin aceptar. **Todo va al EXPEDIENTE, nunca a la carpeta de la app**: las fotos a su casilla (lo que no la tiene, a «Otros»), y al firmar el PDF firmado + `.xml` + `.cex` con `notify-review` por la **clave interna** (la ruta acepta `internalKeyOrAuth`; con el visto bueno ya dado en la envolvente, `approve-cee` sin aviso: regla 186), el XML definitivo, y el justificante (registra la fase) y la etiqueta del Registro. Al técnico no le viaja ningún id del CRM (`crmParaCertificador`). Fuente única: [services/certapp/crm.js](implementation/backend/services/certapp/crm.js). Tras tocarlo: `node implementation/backend/scripts/test_certapp_rutas.js`, `test_certapp_unidad.js` y `test_solo_asignar_cert.js`. Ver "Los encargos de BROKERGY: del CRM a la app y vuelta".

186. **El VISTO BUENO de una obra de la app se da en su ENVOLVENTE y la deja LISTA PARA FIRMAR; al firmarla, el expediente del CRM recibe el visto bueno sin otra revisión** (2026-10-30, Fran en 2026EXT_3: «una vez que le demos el visto bueno, directamente se genere listo para firmar y lo podamos firmar desde CEE»). El botón «✓ Visto bueno: listo para firmar» (solo el EQUIPO: `isStaff`, 403 `SOLO_EQUIPO`; solo `ext`) genera antes si lo que se ve no es lo sellado, y `POST /api/cee-envolvente/:id/visto-bueno` entrega ya si está calificado (LISTO, aviso «listo para firmar»; una VALIDADO se reabre: versión nueva, firma nueva) o lo deja esperando al PC y `entrega.alTerminarIa` lo entrega solo al calificar, sin el WhatsApp de «listo para revisar». **Vale para UNA receta**: otra generación (ventana o skill) lo anula en `cex.sellar`; la del PC no, y solo cuenta si la esperaba (`esperando_pc`). Al firmar un encargo con el visto bueno vigente, `crm.enviarCeeAsync` llama a **`approve-cee` con la clave interna y los canales apagados** (las dos rutas aceptan `staffOClaveInterna`; la del CAE está en `PUBLIC_EXPEDIENTE_ROUTES`) y carga el XML firmado (regla 152, `forzar`); sin él, `notify-review` como siempre. Se guarda en `cee.visto_bueno` de la obra por la RPC de clave (regla 19). Fuente única: [services/certapp/vistoBueno.js](implementation/backend/services/certapp/vistoBueno.js). Tras tocarlo: `node implementation/backend/scripts/test_certapp_visto_bueno.js`, `test_certapp_rutas.js`, `test_origen_ext.mjs` y `auditar_rutas_sin_guardian.js`. Ver "El visto bueno de BROKERGY, dado en la envolvente: listo para firmar".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/cee/al-encargar-el-cee-el-cliente-tambien-se-entera.md` — Al encargar el CEE, el CLIENTE también se entera (2026-09-09) · 3,1 KB
- `docs/conocimiento/cee/deduccion-del-irpf-vale-el-par-de-certificados.md` — Deducción del IRPF — ¿vale el par de certificados? (2026-08-27) · 5,8 KB
- `docs/conocimiento/cee/el-agente-ia-un-certificador-mas.md` — El AGENTE IA, un certificador más (2026-10-01) · 4,8 KB
- `docs/conocimiento/cee/el-aviso-de-cee-inicial-presentado-pide-solo-lo-que-falta.md` — El aviso de «CEE inicial presentado» pide SOLO lo que falta, y sale solo cuando presenta la casa (2026-10-25) · 5,0 KB
- `docs/conocimiento/cee/el-certificador-por-defecto-es-fran.md` — El certificador POR DEFECTO de todo CEE es Fran, y el AGENTE IA trabaja sin figurar en la barra (2026-10-26) · 3,7 KB
- `docs/conocimiento/cee/el-modulo-cee-del-expediente-en-el-movil-asignar-tecnico.md` — El módulo CEE del expediente, en el MÓVIL — asignar técnico (2026-08-21) · 7,3 KB
- `docs/conocimiento/cee/la-fecha-de-registro-del-cee-se-lee-del-justificante.md` — La FECHA DE REGISTRO del CEE se LEE del justificante (2026-09-07) · 4,2 KB
- `docs/conocimiento/cee/la-guia-de-la-deduccion-del-irpf-para-el-cliente.md` — La GUÍA de la deducción del IRPF para el cliente (2026-10-01) · 15,0 KB
- `docs/conocimiento/cee/la-pagina-del-encargo-del-tecnico.md` — La PÁGINA DEL ENCARGO del técnico (2026-09-30) · 4,9 KB
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/00-presentar-el-cee-en-el-registro-el-borrador.md` — PRESENTAR el CEE en el Registro — el borrador (2026-09-15) · 11,1 KB
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/el-visto-bueno-deja-el-cee-listo-para-presentar.md` — El VISTO BUENO deja el CEE listo para presentar — Eva ya no presenta (2026-10-25) · 4,8 KB
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/encargar-la-presentacion-a-una-persona-de-fuera-presentar-negoci.md` — ENCARGAR la presentación a una persona de fuera — `/presentar/:negocio/:id` (2026-10-06) · 7,8 KB
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/firmar-el-cee-sin-ventanas-firmar-cee-js.md` — FIRMAR el CEE sin ventanas — `scripts/firmar_cee.js` (2026-10-15) · 4,2 KB
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/la-calificacion-de-emisiones-no-se-guardaba.md` — La calificación de EMISIONES no se guardaba · 1,6 KB
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/los-dos-pasos-del-certificador-presentar-cee-id-token-phase.md` — Los DOS PASOS del certificador — `/presentar-cee/:id?token=&phase=` · 3,5 KB
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/presentarlo-sin-tocar-el-pc-skill-presentar-cee.md` — PRESENTARLO sin tocar el PC — skill `presentar-cee` (2026-10-15) · 14,5 KB
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/00-revisar-el-cee-que-entrega-el-certificador.md` — REVISAR el CEE que entrega el certificador (2026-09-21) · 2,4 KB
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/con-el-cex-delante-y-la-medida-de-mejora.md` — Con el `.cex` delante, y la MEDIDA DE MEJORA (2026-09-29) · 6,8 KB
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/el-xml-se-lee-de-supabase-sin-bajar-nada-de-drive.md` — El `.xml` se lee de SUPABASE, sin bajar nada de Drive · 1,5 KB
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/en-la-app-el-boton-revisar-del-modulo-cee-fase-2-2026-09-29.md` — En la app: el botón «Revisar» del módulo CEE (fase 2, 2026-09-29) · 2,1 KB
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/la-revision-previa-al-subir-el-tecnico-fase-3-2026-09-30.md` — La revisión PREVIA al subir el técnico (fase 3, 2026-09-30) · 4,9 KB
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/lo-que-hay-que-saber-del-xml-medido-sobre-462-certificados-reale.md` — Lo que hay que saber del `.xml` (MEDIDO sobre 462 certificados reales) · 6,6 KB
- `docs/conocimiento/cee/un-cee-incompleto-no-se-da-por-bueno-ni-se-sube.md` — Un CEE «incompleto» no se da por bueno ni se sube (2026-10-19) · 4,8 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/cee/al-encargar-el-cee-el-cliente-tambien-se-entera.md`
  - **REGLA — el texto lo redacta el BACKEND y el popup solo lo enseña.**
  - **REGLA — no sale con «Solo asignar».**
  - **REGLA — se avisa UNA vez por fase.**
  - **REGLA — «no empieces la obra todavía» solo si la obra NO está hecha.**
  - **REGLA — no se promete fecha, se promete el AVISO.**
- `docs/conocimiento/cee/deduccion-del-irpf-vale-el-par-de-certificados.md`
  - **REGLA — la letra que cuenta es la del CONSUMO, no la de EMISIONES.**
  - **REGLA — `<EnergiaPrimariaNoRenovable>` aparece DOS veces en el XML.**
  - **REGLA — el `.xml` GUARDADO en BD no lo puede releer `parseCeeXml`.**
  - **REGLA — esto INFORMA, no decide.**
  - **REGLA — ese certificado NO es una fase.**
  - **REGLA — solo se pinta si se ha cargado**
- `docs/conocimiento/cee/el-agente-ia-un-certificador-mas.md`
  - **REGLA — se reconoce por la MARCA, nunca por el nombre**
  - **REGLA — asignar al agente ES el encargo**
  - **REGLA — solo mueve la fase si el encargo es SUYO.**
  - **REGLA — al terminar AVISA, como un técnico que sube su .cex**
  - **REGLA — el agente NO FIRMA**
  - **REGLA — el sello `cee.agente_ia[fase]`**
- `docs/conocimiento/cee/el-aviso-de-cee-inicial-presentado-pide-solo-lo-que-falta.md`
  - **REGLA — las fotos que se piden son LAS QUE FALTAN, del mismo checklist que su enlace de subida.**
  - **REGLA — al cliente en lenguaje de casa y sin facturas; al instalador con las etiquetas técnicas, las
facturas y su enlace `rol=instalador`.**
  - **REGLA — si no se puede saber qué falta, la lista de SIEMPRE.**
  - **REGLA — el CEE INICIAL que presenta la CASA avisa SOLO, una vez, al cliente y al instalador.**
- `docs/conocimiento/cee/el-certificador-por-defecto-es-fran.md`
  - **REGLA — todo expediente CAE y todo CEE directo NACE con Fran de certificador**
  - **REGLA — el AGENTE IA nunca se GUARDA como certificador.**
  - **REGLA — el encargo del agente se lee de su SELLO, no de la barra.**
  - **REGLA — con Fran en la barra el agente MUEVE la fase**
- `docs/conocimiento/cee/el-modulo-cee-del-expediente-en-el-movil-asignar-tecnico.md`
  - **REGLA — el escritorio no cambia; todo lo móvil va en `max-md:`.**
  - **REGLA — es un BOTÓN, no una banda.**
  - **REGLA — la EXCEPCIÓN es el aviso.**
  - **REGLA — en el CEE FINAL de un RES080 el criterio se INVIERTE.**
  - **REGLA — la demanda se compara SIN multiplicar por la superficie, y la superficie aparte.**
  - **REGLA — el panel se PORTALEA a `document.body`**
  - **REGLA — el popup del `.xml` y el botón dicen LO MISMO.**
- `docs/conocimiento/cee/la-fecha-de-registro-del-cee-se-lee-del-justificante.md`
  - **REGLA — el modelo solo LEE; la fecha la decide el código.**
  - **REGLA — una lectura que falla NUNCA tira la subida.**
  - **REGLA — solo se envía la PRIMERA PÁGINA.**
  - **REGLA — al releer un justificante ya subido solo se PROPONE.**
  - **REGLA — con la fase ya REGISTRADA solo se rellena el HUECO.**
- `docs/conocimiento/cee/la-guia-de-la-deduccion-del-irpf-para-el-cliente.md`
  - **REGLA — el TIPO de vivienda lo manda el CATASTRO, como en la oportunidad**
  - **REGLA — lo que se cambia en el popup se GUARDA SOLO**
  - **REGLA — reenviar una guía con OTRO porcentaje es una CORRECCIÓN, y se dice**
  - **REGLA — los datos de Renta Web son LITERALES**
  - **REGLA — en la guía manda lo que dice EL CERTIFICADO (`.xml`)**
  - **REGLA — "cantidades satisfechas" van CON IVA.**
  - **REGLA — sin facturas de la OBRA va un EJEMPLO, nunca una estimación sobre lo que haya**
  - **REGLA — en un CEE directo la guía VIAJA CON LA ENTREGA del certificado**
  - **REGLA — el MENSAJE dice el AHORRO con sus cifras, no solo la guía**
  - **REGLA — se envían SOLO los PDF FIRMADOS**
  - **REGLA — la guía se guarda y se SELLA**
  - **REGLA — el bono CAE NO se resta de las «Cantidades satisfechas»**
  - **REGLA — no hay «resolución»: el justificante es la CARTA DE PAGO + el convenio de cesión.**
  - **REGLA — el impuesto del bono es APROXIMADO y se dice**
- `docs/conocimiento/cee/la-pagina-del-encargo-del-tecnico.md`
  - **REGLA — el enlace es del TÉCNICO ASIGNADO.**
  - **REGLA — lista blanca, y ni un IMPORTE.**
  - **REGLA — el paso REGISTRADO lo manda también el JUSTIFICANTE.**
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/00-presentar-el-cee-en-el-registro-el-borrador.md`
  - **REGLA — NO es una réplica del impreso: es una GUÍA DE RELLENO.**
  - **REGLA — solo CASTILLA-LA MANCHA.**
  - **REGLA — en el apartado 05 manda lo que dice el PROPIO CERTIFICADO.**
  - **REGLA — el troceo de la vía se PROPONE, y el original va al lado.**
  - **REGLA — el plazo de UN MES se avisa.**
  - **REGLA — la casilla vacía no desaparece, pero tampoco ocupa una fila.**
  - **REGLA — los documentos anexados NO se copian: se DESCARGAN.**
  - **REGLA — el nombre de descarga es el del fichero que HAY en Drive con el NIF delante,
no uno compuesto.**
  - **REGLA — el teléfono y el correo del solicitante caen a su PERSONA DE CONTACTO.**
  - **REGLA — el borrador LLEVA al trámite, y el PDF también.**
  - **REGLA — el NOMBRE se parte en tres casillas: Nombre · Apellido 1 · Apellido 2.**
  - **REGLA — lo que se marca DESPUÉS de los campos va después**
  - **REGLA — lo que VUELVE de la sede se sube desde aquí, por la MISMA función de la
rejilla.**
  - **REGLA — el borrador es del equipo interno; al certificador le llega ADJUNTO.**
  - **REGLA — el borrador también se GUARDA en la carpeta de su fase**
  - **REGLA — la CARPETA LOCAL del expediente va SIEMPRE arriba del popup**
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/el-visto-bueno-deja-el-cee-listo-para-presentar.md`
  - **REGLA — con el VISTO BUENO el CEE ya se puede presentar, también el del certificador de la casa.**
  - **REGLA — al dar el VB, el `_REVISAR` de ESA fase pasa a su nombre DEFINITIVO**
  - **REGLA — todo esto es SOLO para los CEE de la CASA; el de un técnico de FUERA es suyo y lo presenta
él.**
  - **REGLA — el borrador es el de ESA fase, y solo ese**
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/encargar-la-presentacion-a-una-persona-de-fuera-presentar-negoci.md`
  - **REGLA — se mandan SIEMPRE el BORRADOR del Registro y el .cex, el .xml y el PDF FIRMADO, y
NADA más**
  - **REGLA — el enlace es REVOCABLE**
  - **REGLA — con el certificador de la CASA, «Validar» es encargar la presentación**
  - **REGLA — «Validar» sale solo si la fase ESPERA el visto bueno, y eso lo dice el
SEGUIMIENTO**
  - **REGLA — lo ya presentado NO le aparece**
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/firmar-el-cee-sin-ventanas-firmar-cee-js.md`
  - **REGLA — solo con un «doy por válido» del usuario, y nunca un `_REVISAR` ni un PDF ya firmado.**
  - **REGLA — se firma con el certificado de REPRESENTANTE de Brokergy**
  - **REGLA — la firma va donde la pone Fran: última página, DEBAJO del rótulo, logo a la izquierda.**
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/los-dos-pasos-del-certificador-presentar-cee-id-token-phase.md`
  - **REGLA — la FECHA no se puede imponer; se pide y se COMPRUEBA.**
  - **REGLA — el recuadro de la firma se ancla AL TEXTO, no a coordenadas.**
  - **REGLA — el LOGO de Brokergy solo cuando firma Brokergy.**
  - **REGLA — esto NO valida la firma.**
  - **REGLA — el Paso 2 se atenúa, no se bloquea.**
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/presentarlo-sin-tocar-el-pc-skill-presentar-cee.md`
  - **REGLA — la firma se automatiza FIJANDO el certificado por HUELLA, nunca pulsando a ciegas**
  - **REGLA — «Es representante» se marca ANTES de rellenar.**
  - **REGLA — en el 02 va quien FIRMA, nunca el AGENTE IA**
  - **REGLA — tras escribir la referencia catastral se pulsa «Añadir Referencia».**
  - **REGLA — la «Fecha de emisión» es la de GENERACIÓN del XML, no la de firma de la app.**
  - **REGLA — cada solicitud empieza y acaba BORRANDO la sesión de la sede.**
  - **REGLA — los ficheros se suben con su nombre ORIGINAL: el NIF lo pone la sede.**
  - **REGLA — las recomendaciones de mejora son el MISMO PDF firmado.**
  - **REGLA — el pago pide el SÍ del usuario y lo autoriza su banco.**
  - **REGLA — una solicitud perdida tras pagar se rehace con la referencia 046, sin volver a pagar**
  - **REGLA — si «Pagar y enviar» lleva a `mantenimiento.castillalamancha.es/MttoJCCM`, la pasarela está en
MANTENIMIENTO: no se envía nada y se reintenta más tarde**
  - **REGLA — la ETIQUETA y las resoluciones se recogen en notifica.jccm.es, y se COMPRUEBAN antes de
subirlas**
  - **REGLA — los documentos de notifica se bajan del «Histórico de notificaciones», no tras el
«Acceso»**
  - **REGLA — lo devuelto lo sube el SERVIDOR, no el PC**
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/00-revisar-el-cee-que-entrega-el-certificador.md`
  - **REGLA — el fichero solo se LEE; el juicio es del código.**
  - **REGLA — esto PROPONE; el visto bueno lo da una persona.**
  - **REGLA — lo que NO se puede comprobar se DICE.**
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/con-el-cex-delante-y-la-medida-de-mejora.md`
  - **REGLA — las transmitancias y la ventilación, IGUALES A LA GUÍA (`getUByYear` /
`getVentanaYACHByYear`), pero solo AVISO y solo desde el 01/04/2026**
  - **REGLA — la demanda y la superficie por debajo de lo simulado: aviso hasta −10 %, NO APTO más
abajo**
  - **REGLA — el rendimiento de la caldera SOLO INFORMA**
  - **REGLA — la medida de mejora del INICIAL es obligatoria en sustitución e hibridación**
  - **REGLA — si el expediente aún no declara la aerotermia, se compara (y se compone) con la GENÉRICA
de la simulación**
  - **REGLA — en la MEDIDA, si el ACS no se cambia y la caldera que se retira era mixta, el ACS lo da un
TERMO ELÉCTRICO**
  - **REGLA — la app PONE la medida, pero no la CALCULA.**
  - **REGLA — sin `.xml` en la BD se busca en Drive**
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/en-la-app-el-boton-revisar-del-modulo-cee-fase-2-2026-09-29.md`
  - **REGLA — ninguna IA en el veredicto.**
  - **REGLA — sin `.xml` pero con `.cex` se revisa igual y sale NO APTO «falta el .xml»**
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/la-revision-previa-al-subir-el-tecnico-fase-3-2026-09-30.md`
  - **REGLA — la DEMANDA y la SUPERFICIE frente a la simulación SÍ se le enseñan, como algo que
REVISAR**
  - **REGLA — el detalle de un expediente que abre un CERTIFICADOR lleva la revisión en SU versión**
  - **REGLA — la revisión al subir lee el `.xml` de DRIVE, no el de la BD**
  - **REGLA — los textos están escritos para Brokergy y al técnico se le habla de tú**
  - **REGLA — no bloquea.**
- `docs/conocimiento/cee/un-cee-incompleto-no-se-da-por-bueno-ni-se-sube.md`
  - **REGLA — un XML que no VALIDA no sale de `cexAPdf` como bueno.**
  - **REGLA — la última puerta es la subida.**
  - **REGLA — un final no se copia de un inicial sin huecos.**
  - **REGLA — lo incompleto no se da por terminado.**
  - **REGLA — sin huecos es NO APTO en la revisión**

<!-- generado:fin -->
