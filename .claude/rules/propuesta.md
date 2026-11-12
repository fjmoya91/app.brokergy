---
paths:
  - "implementation/backend/services/{propuesta*,leadMessages}.js"
  - "implementation/backend/routes/pdf.js"
  - "implementation/frontend/src/features/calculator/components/{ProposalModal,ProgramarEnvioPanel,ResultsPanel,SaveOpportunityModal}.jsx"
  - "implementation/frontend/src/features/calculator/logic/{presupuestoEstimado,presupuestoLeido,guardarOportunidad,programarEnvio,comisionPartner,mensajeAceptacion}.js"
---
# Propuesta — versiones, envío programado, presupuesto estimado/leído, portada, comisión y enlace de aceptación (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/propuesta/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

5. **PDF Propuestas**: El encabezado usa **CSS Grid**. No cambiar a Flexbox para evitar desbordamientos.

25. **La PROPUESTA se versiona al ENVIARLA, nunca al guardarla**: cada envío archiva su PDF en `0. PROPUESTAS` como `Propuesta_{expte}_v{N}.pdf`, imprime la marca DENTRO del documento y sella qué versión aceptó el cliente. Fuente única: [propuestaVersiones.js](implementation/backend/services/propuestaVersiones.js) — no volver a generar el PDF de la propuesta por separado en cada canal (el del email y el de WhatsApp acababan siendo documentos distintos), ni guardar el HTML de una versión en el JSONB (353 KB de media, regla 21). **Los `importes` sellados son los de la opción que IMPRIME el PDF** (2026-10-19): con reforma, `financialsRes080` en la de solo reforma y las dos ramas en la comparativa, nunca `financials` a ciegas. Las 36 versiones con reforma habían sellado el bono de solo aerotermia (26RES080_OP76: 2.255 € con un PDF de 5.262 €), y la inversión salía null en todas. Fuente única: [utils/importesPropuesta.js](implementation/backend/utils/importesPropuesta.js). Tras tocarlo: `node implementation/backend/scripts/test_importes_propuesta.js`. Ver "Versiones de la PROPUESTA".

31. **Una propuesta con presupuesto ESTIMADO lo dice, y dice a qué afecta**: el flujo interno pregunta el dinero UNA vez (`StepDocsObra`: documento · importe a mano · estimar 15.000 €) y la marca viaja en `inputs.presupuestoEstimado` hasta la portada, la tabla, el recuadro y el mensaje de envío (la nota al pie que lo repetía se retiró). El **bono CAE no cambia** (sale del ahorro certificado) y **la deducción del IRPF sí** (es un % del coste con IVA); sin deducción en juego, ese párrafo no se escribe. Fuente única del texto y de la cifra: [logic/presupuestoEstimado.js](implementation/frontend/src/features/calculator/logic/presupuestoEstimado.js), que carga también el backend (`leadMessages`) por import() ESM. Cualquier presupuesto tecleado en la calculadora LEVANTA la marca. **La portada nunca esconde texto bajo el pie**: si ni los huecos ni el compacto bastan, el cuerpo se reduce con `zoom` (bisección, suelo 0,72) ya en la vista previa, y el servidor parte de ese zoom. Tras tocar la portada: `node implementation/backend/scripts/revisar_portadas_propuestas.js`. Ver "Presupuesto ESTIMADO" y "La portada de la propuesta NUNCA esconde texto".

44.b **La PROPUESTA también elige a quién de la empresa**: su popup ofrecía UNA persona por partner —la del desvío de notificaciones, o el canal general— así que el comercial con el que se lleva la obra no se podía marcar sin salir a su ficha (medido en INSTALACIONES MIGUELTURRA: se leía «TERE · 926241611», el nombre de una persona sobre el teléfono de la centralita, y AURELIO no aparecía). Ahora la tarjeta es la EMPRESA y debajo van sus personas con la MISMA fila del expediente (`ContactoPickRow`), resueltas por `instaladorContacts` + `defaultContactIds` con rol **comercial**, que es el asunto que es. Desmarcar la última persona desmarca la empresa (y volver a marcarla restaura las que le tocan); si solo queda el canal general se dice con `avisoReparto`. El envío pasa a ir **por GRUPO**: dos personas de la misma empresa reciben UN correo con `cc` real (el `to`, el del rol) y por WhatsApp uno cada una con su propio saludo — `POST /api/pdf/send-proposal` y `sendProposalEmail` aceptan ya `cc`. Y **el canal se elige POR DESTINATARIO** (`CanalMiniChip` en cada fila marcada, con el chip de la barra de interruptor maestro): al comercial por WhatsApp y a administración por email en UN solo envío, en vez de enviar dos veces y duplicárselo al otro. Lo que la barra cuenta es lo que va a salir de verdad, y quien se queda sin ningún canal se dice en ámbar. Ver "Y a la propuesta se ELIGE quién de la empresa la recibe".

65. **Programar el envío de una propuesta**: botón de RELOJ pegado a ENVIAR; se elige día y hora y sale sola. El envío lo orquesta el NAVEGADOR, así que al programar se guarda el **plan YA HECHO** (grupos, mensaje por persona, canales) con el documento tal y como se revisó, y el despachador **NO vuelve a decidir nada** — si recompusiera el mensaje saldría otra propuesta distinta de la aprobada, con nadie delante. Se **delega en las MISMAS rutas** que usa el popup (`propuesta/version`, `send-proposal`, `version/:v`, `estado`, `comentarios`) con `x-internal-key`, como `routes/acciones.js`: el nº de versión, el PDF en Drive, la vista web del enlace, la carpeta y el historial son los mismos que enviándola a mano — esas cuatro rutas pasan a `internalKeyOrAuth` y `nombreUsuario(req)` lee `body.usuario`, para que quede a nombre de quien lo programó. El **HTML va en columnas TEXT propias** (353 KB de media, regla 21), nunca en `datos_calculo`, y se borra al terminar. **Nace APAGADO** (`PROPUESTA_PROGRAMADA_ENABLED`, solo `true` en el VPS): dos backends contra la misma base barrerían la misma tabla y desde LOCAL saldría a un cliente real — el claim atómico evita el doble envío, no el envío desde local, y **la pantalla dice cuándo está apagado**. **Sin PDF no sale nada** y **siempre se avisa al staff** (WhatsApp + email), salga bien, a medias o mal. **Enviar a mano cancela lo programado** de esa propuesta —o el cliente la recibe dos veces—, se avisa antes de pulsar, y lo que ya está `ENVIANDO` no se puede cancelar. La hora se compone en LOCAL, nunca partiendo un ISO. Tras tocarlo: `node implementation/backend/scripts/test_propuesta_programada.js` y `test_programar_envio.mjs`. Ver "PROGRAMAR el envío de una propuesta".

81. **La COMISIÓN del partner se expresa en % sobre lo que se le OFRECE AL CLIENTE, y el mensaje de la propuesta le dice cuánto ganaría.** Se sigue guardando en €/MWh (`caePricePrescriptor`, lo que consume `calculateFinancials`); el % es otra forma de teclearla y su base es `caePriceClient` —la tarifa de la propuesta ANTES de restarle la comisión, o el % sería circular—, no el precio del S.O.: con 20 €/MWh sobre 100 ofrecidos es un 20 %, no el 11,63 % que salía sobre 172. Lo aplican el panel de margen de la calculadora, la comisión por defecto de la ficha del partner (referencia `CAE_PRECIO_CLIENTE_NUEVAS`) y su siembra al elegir partner (**solo al ELEGIRLO**: abrir una oportunidad guardada no le vuelve a imponer la de la ficha — pisaba la guardada y cambiaba el bono, 26RES060_OP264 de 2.017 € a 2.305 €, 2026-10-10); ningún partner tenía comisión por defecto guardada, así que no se movió ningún importe. En el mensaje de envío, **solo al modo PARTNER** (el prescriptor; nunca al instalador asociado si es otra empresa, ni al cliente) se añade lo que cobraría —el MISMO `totalPrescriptor` del panel, redondeado a euros, **con su % —«vuestro 20 % sobre el bono que se le ofrecería al cliente», diciendo sobre qué, porque el bono del cliente que va en el mismo mensaje es MENOR cuando la comisión se le resta a él (460 sobre 1.840 da un 25 %)— y NADA MÁS**: ni los MWh ni los €/MWh, porque con esas dos cifras se rehace el precio al que se vende el ahorro y nuestro margen (decisión del usuario: lo pactado con él es un %, y eso es lo que se le repite). Una viñeta por opción en las comparativas— diciendo que **solo se cobra si el expediente sale favorable**, que el importe se ajusta al resultado de la verificación y que **se le avisará cuando se haga el ingreso al cliente**. ⚠️ Ese aviso al partner en el momento del pago al cliente **no está implementado todavía**. Fuente única: [logic/comisionPartner.js](implementation/frontend/src/features/calculator/logic/comisionPartner.js). Tras tocarlo: `node implementation/backend/scripts/test_comision_partner.mjs`.

85. **Los PRESUPUESTOS adjuntados a la propuesta rellenan Datos Económicos, cada uno en SU campo**: hueco Aerotermia → P. Aerotermia, hueco **Placas solares** (nuevo, siempre visible, fichero `PRESUPUESTO DE LA INSTALACIÓN_FOTOVOLTAICA.pdf`) → P. Fotovoltaica, huecos de la reforma → P. Reforma como **SUMA** de los activos con documento (recordados por hueco en `inputs.presupuestos_leidos`; los adjuntos nunca leídos se leen en el momento). El IVA lo decide la SIMULACIÓN (particular con IVA; empresa/terciario según el conmutador); las líneas de otra partida van a su campo solo si está vacío (la aerotermia estimada cuenta como vacía); <1 € de diferencia es la misma cifra. **Se guarda sola** con el mismo `payloadOportunidad` del botón Guardar, esperando al `result` recalculado, con línea en el historial y «Deshacer». Solo staff (lector `staffOnly`). Fuente única: [logic/presupuestoLeido.js](implementation/frontend/src/features/calculator/logic/presupuestoLeido.js). Tras tocarlo: `node implementation/backend/scripts/test_presupuesto_leido.mjs`. Ver "Los presupuestos adjuntados a la propuesta rellenan Datos Económicos".

100. **El ENLACE para aceptar la propuesta va en un MENSAJE APARTE, después del PDF** (2026-10-01): dentro del texto largo, a mitad y tras las cifras, nadie lo veía — «¿y cómo lo acepto?» y había que volver a pasarlo a mano. Las ocho variantes del mensaje (cliente/partner × aerotermia/reforma/comparativa/CEE aportado) ya no llevan el enlace: en su sitio dicen «👇 Más abajo te dejo el enlace para aceptarla» (`lineaEnlaceDebajo`, que vale para los dos canales). Por WhatsApp salen tres burbujas: texto → PDF → **el enlace solo, en su línea** (`mensajeAceptacion`); al partner, en tercera persona para que pueda reenviárselo al cliente tal cual. En el **email no se repite**: el correo ya lleva el botón «✍️ Aceptar y firmar» debajo del texto. Viaja como `textoDespues` de `sendMedia` (ruta `/api/whatsapp/send-media` y el envío PROGRAMADO, que lo guarda en el plan como `whatsapps[].mensajeAceptacion`; un plan anterior sale como entonces), con su propia confirmación de ACK; si falla **no se lanza** —el texto y el PDF ya llegaron y reintentar los duplicaría—: se devuelve en `despues` y el resultado del envío lo dice («pásaselo a mano»). El popup lo enseña debajo del mensaje antes de pulsar. Fuente única: [logic/mensajeAceptacion.js](implementation/frontend/src/features/calculator/logic/mensajeAceptacion.js). Tras tocarlo: `node implementation/backend/scripts/test_mensaje_aceptacion.mjs`.

132. **Con los avisos del cliente desviados a otra persona, el TITULAR sigue pudiendo recibir la propuesta** (2026-10-10, 26RES060_OP264): fila `TITULAR` en el popup (sin marcar), solo si su teléfono o email difiere del de la persona de contacto; cuenta como cliente en tuteo, email, aviso del CEE y paso a ENVIADA (también en el envío programado). Y si la oportunidad viene de un colaborador (`cobrand`, nunca BROKERGY), **al titular** se le escribe «En colaboración con {empresa}, te adjuntamos…» en vez de «Tal y como acordamos»; a la persona de contacto, como antes. Robot: `claude_propuesta.js --a titular`. Ver "La propuesta al TITULAR, aunque sus avisos vayan al instalador".

133. **Caldera de BIOMASA (combustible sólido que no es carbón): la deducción del IRPF exige placas solares; el Bono CAE no** (2026-10-10, decisión del usuario, 26RES060_OP274/OP288). Pasar de pellets o leña a aerotermia no reduce la energía primaria NO renovable, que es el requisito de la deducción; el CAE sale del ahorro de energía final y se obtiene igual. Sin placas (ya puestas o en esta obra; «en el futuro» no cuenta) y con deducción en juego, la calculadora lo avisa (`ResultsPanel`), la propuesta lleva un recuadro bajo la tabla y el envío lo manda como **ÚLTIMO mensaje APARTE** (WhatsApp: burbuja tras el PDF y el enlace, por `textoDespues` en LISTA; email: al final del cuerpo; programado: `whatsapps[].avisoFinal`), **diciendo las dos cosas**. **Con una fila `solid_*` se ELIGE carbón o biomasa y lo elegido MANDA** (2026-11-12, Fran, 26RES060_OP403: una policombustible de CARBÓN salió como biomasa y la propuesta avisó de que sin placas no había deducción): desplegable «¿Carbón o biomasa?» bajo «Sistema anterior» (ámbar sin elegir), guardado en `inputs.combustibleSolido` (`carbon` · `lena` · `pellets`, y `fuelType` igual); el alta por WhatsApp lo fija con `caldera.combustible` (`carbon` · `lena` · `pellets` · `biomasa`) y una oportunidad hecha se corrige con `alta_oportunidad.js recalcular <OP> --combustible carbon`. Sin elegir, como antes: `fuelType` pellets/leña, o caldera `solid_*` que el funnel o la placa dicen de biomasa aunque el desplegable diga carbón (lo pone por defecto). Fuente única: [logic/irpfBiomasa.js](implementation/frontend/src/features/calculator/logic/irpfBiomasa.js). Tras tocarlo: `node implementation/backend/scripts/test_irpf_biomasa.mjs` y `test_propuesta_programada.js`. Ver "Caldera de BIOMASA: la deducción del IRPF exige placas solares".

136. **La oportunidad pasa a ENVIADA con CUALQUIER envío que salga bien, también solo al instalador, y la lista dice A QUIÉN le ha llegado** (2026-10-14, decisión del usuario, 26RES060_OP295). Antes solo contaba el cliente, y lo mandado por WhatsApp al partner se quedaba en PTE ENVIAR (18 casos). Los envíos llaman a `PATCH /:id/estado` con `porEnvio: true`: así un reenvío **no hace retroceder** una oportunidad ENVIADA, PRE-ACEPTADO o ACEPTADA. Bajo la chapa sale «→ al cliente», «→ cliente + instalador» o «→ solo al instalador» (este en ámbar). **Se CALCULA de `propuesta_versiones`, no se guarda aparte**: cada línea de `envios` lleva su `modo` y las antiguas se casan por la etiqueta. El listado devuelve solo `propuesta_entregada`. Fuente única: [utils/entregaPropuesta.js](implementation/backend/utils/entregaPropuesta.js). Tras tocarlo: `node implementation/backend/scripts/test_entrega_propuesta.js` y `test_propuesta_programada.js`. Ver "ENVIADA con cualquier envío, y la lista dice A QUIÉN le ha llegado".

154. **Hibridación manteniendo la caldera: el cliente recibe por escrito, en un mensaje APARTE, las DOS hipótesis del bono** (2026-10-21, decisión de Fran: «que no nos pueda decir un cliente que no se lo habíamos dicho»). 1️⃣ el criterio que defendemos (cobertura sobre la demanda) → «lo solicitaremos por X €»; 2️⃣ si piden justificarlo con la potencia de la caldera instalada → «bajaría a Y €»; y retirándola, Z €. Sin explicar las horas. Se calculan los DOS métodos elija lo que elija «Base del % de cobertura» (`result.hipotesisHibridacion` en `CalculatorView`, mismo SCOP y clima) y sale por el camino del aviso de biomasa (`buildAvisoFinal`: última burbuja de WhatsApp, final del email, `whatsapps[].avisoFinal` en el programado), más un párrafo en el recuadro del PDF. La potencia es la tecleada en P. CALDERA (siempre visible) o la de la placa; **sin ninguna no sale** y el panel lo dice en ámbar. Fuente única: [logic/hibridacionPropuesta.js](implementation/frontend/src/features/calculator/logic/hibridacionPropuesta.js). Tras tocarlo: `node implementation/backend/scripts/test_hipotesis_hibridacion.mjs`. Ver "Hibridación: la propuesta enseña el bono RETIRANDO y MANTENIENDO la caldera".

156. **La colaboración se VE en la portada y el coste de los servicios es UNA cifra** (2026-10-22, Fran, 26RES060_OP279). Lo que se descuenta del bono es `caeMaintenanceCost` en la tabla de la portada, en la cláusula 2 y en el Convenio de Cesión (250 € sin IVA por defecto, 0 € con «Descuento Certificados»): la cláusula 2 imprimía 220 + 32,78 € «+ IVA» mientras portada y convenio decían 250 €. La tarifa (702,78 € + IVA) solo es lo que costaría sin promoción —tachada, y la penalización de la cláusula 4—. Con «Descuento Certificados» y colaborador (`cobrand`), la bonificación es SUYA: «🎁 Ventaja por esta colaboración … ~~702,78 €~~ 0 €» DENTRO de su tarjeta (no crece) y «gracias a la colaboración con {empresa}» en la cláusula 2; sin colaborador, franja «Promoción BROKERGY». Y **cada total es la suma de lo IMPRESO** (OP279: 5.161 + 5.772 bajo 10.932 €): PDF, mensajes y versión sellada (`importesPropuesta.js`). Fuente única: [logic/cifrasPropuesta.js](implementation/frontend/src/features/calculator/logic/cifrasPropuesta.js). Tras tocarlo: `node implementation/backend/scripts/test_cifras_propuesta.mjs` y `test_importes_propuesta.js`. Ver "La colaboración se ve en la portada, y el coste de los servicios es UNO".

197. **«Perfil exigente» (`inputs.condicionesReforzadas`, solo ADMIN): el compromiso de cesión en exclusiva se cierra AL ACEPTAR, con casilla APARTE y obligatoria en `/firma`, nunca en el convenio** (2026-11-05, Fran, 26RES060_OP369). Motivo: el cliente no debe ver los kWh ni el €/MWh antes de comprometerse; sin anticipo y **sin derecho de igualación** (BROKERGY saca más ahorro aunque pague menos €/MWh). La compensación, tras la visita del CEE y salvo causa imputable a BROKERGY, es `penalizacionReforzada` = max(tarifa 702,78 €, 40 % del bono de la opción IMPRESA) + IVA, una por opción en la comparativa, **sellada con la versión** (`importes.reforzadas`). Sin ella sellada en la versión VIGENTE no hay casilla: con el conmutador recién encendido hay que enviar versión nueva. `/aceptar` da 400 sin la casilla **antes de tocar la ficha del cliente**. Las condiciones llevan su versión (`2026-11-05-R`), el **desistimiento de 14 días con su formulario** y el inicio anticipado opcional (art. 108.3 TRLGDCU). La hoja 4 es de alto fijo: las cláusulas van en UNA tarjeta y se midieron (55 px de margen, 33 en la comparativa). Pendiente de revisar por un asesor. Fuente única: `penalizacionReforzada` en [logic/cifrasPropuesta.js](implementation/frontend/src/features/calculator/logic/cifrasPropuesta.js) y [utils/importesPropuesta.js](implementation/backend/utils/importesPropuesta.js); textos en [condicionesAceptacion.js](implementation/frontend/src/features/public/logic/condicionesAceptacion.js). Tras tocarlo: `node implementation/backend/scripts/test_cifras_propuesta.mjs` y `test_importes_propuesta.js`. Ver "Condiciones reforzadas: el «Perfil exigente»".

203. **Toda propuesta en la que alguna opción sube por el FACTOR MULTIPLICADOR lleva una HOJA más, la 2, y una línea en la fila del bono de la portada** (2026-11-09, Fran: «el ejemplo con el cálculo actual y con el factor multiplicador […] solicitando a partir de enero […] en RES060, RES093, RES080, todos»). La hoja lleva: las dos cifras (la actual, firme y se pide ya; la FM, estimada, sujeta a cupo y desde el 15/01/2027); el calendario; lo que tiene que conseguir el cliente según SU ficha (IRPF y mantenimiento solo en las de bomba, F/G solo en la RES060_FM en zona D/E, BT siempre en las hibridaciones); los riesgos (cupo, «si no entra, se tramita por la actual con el mismo Convenio» y el cobro más tarde); y «usted decide». Cada opción con su ficha y las condiciones del párrafo del mensaje: aerotermia → RES060_FM / RES09x_FM (`estadoFc`); solo reforma → RES080_FM (`estadoFm080`, «unos»/«≈» si faltan los CEE simulados). Solo si el FM sale MAYOR y nada lo impide, y si no se ha apagado con «Factor M.» (203.b). La genera el equipo interno; el MENSAJE del FM, que desde el 09/11/2026 va **APARTE, el último** (`buildAvisoFinal` → `mensajeFm`, como biomasa e hibridación; ya no dentro del texto largo) y remite a la página 2. **Consumidor vulnerable (× 1,5, fichas -S)**: manda el Sí/No del equipo en «Vía de tramitación» (`inputs.vulnerable`) y, sin tocar, lo declarado al aceptar con la regla de la familia numerosa (`esVulnerableFm`); la hoja añade la tarjeta de lo que hay que acreditar y la cifra «sin acreditarlo», y el expediente lo hereda (`semillaBonoSocial`). Fuente única: [logic/fmPropuesta.js](implementation/frontend/src/features/calculator/logic/fmPropuesta.js); la pinta `renderHojaFm` de `ProposalModal`, y las hojas siguientes corren una página. **Es de alto fijo**: tras tocarla, `node implementation/backend/scripts/claude_propuesta.js paginas <OP>` (solo lectura; con `CLAUDE_ROBOT_APP_URL` contra un localhost) en una RES060 en zona D, que es la de más requisitos (41 px de margen el 09/11/2026), y `test_fm_propuesta.mjs`. Ver "La hoja del FACTOR MULTIPLICADOR en la propuesta".

203.b **El FM de la propuesta se APAGA antes de enviar, con UN interruptor, y queda guardado en la oportunidad** (2026-11-11, Fran, 26RES060_OP377: «hay casos en los que de momento no quiera decirlo […] debe ser un botón previo»). Antes el conmutador del popup de envío solo quitaba el mensaje aparte y el PDF salía siempre con la línea del bono y la hoja 2: a la OP377 le llegó así. Ahora es el botón **«Factor M.» / «Sin factor M.»** de la barra de la vista previa (junto a «Opción CEE»; solo el equipo interno y solo si hay FM que ofrecer), y el del popup es el MISMO estado. Apagado, la propuesta **no dice nada** del multiplicador: ni la línea de la fila del bono, ni la hoja 2 (las demás vuelven a su número), ni el mensaje aparte; no cambia ninguna cifra ni la vía. Se guarda en **`inputs.fm_en_propuesta`** (`false` = sin FM; sin valor = con FM) por su ruta `POST /api/oportunidades/:id/fm-en-propuesta` (`staffOnly`, RPC `oportunidad_merge_inputs`, línea en el historial), y el guardado de la calculadora **no lo pisa** (`conservarFmEnPropuesta`: manda el de la BD; una simulación sin guardar lo lleva en sus inputs). **Con la vía FM elegida (`ruta_fm`) no se apaga** (409 en la ruta, aviso en el botón). Tras tocarlo: `test_fm_propuesta.mjs` y abrir la propuesta de una RES060 con FM (con y sin). Ver "La hoja del FACTOR MULTIPLICADOR en la propuesta".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/propuesta/biomasa-la-deduccion-del-irpf-exige-placas-solares.md` — Caldera de BIOMASA: la deducción del IRPF exige placas solares; el CAE no (2026-10-10) · 3,8 KB
- `docs/conocimiento/propuesta/condiciones-reforzadas-perfil-exigente.md` — Condiciones reforzadas: el «Perfil exigente» (2026-11-05) · 5,8 KB
- `docs/conocimiento/propuesta/enviada-con-cualquier-envio-y-a-quien-le-ha-llegado.md` — ENVIADA con cualquier envío, y la lista dice A QUIÉN le ha llegado (2026-10-14) · 2,7 KB
- `docs/conocimiento/propuesta/hibridacion-caldera-retirada-o-mantenida.md` — Hibridación: la propuesta enseña el bono RETIRANDO y MANTENIENDO la caldera (2026-10-01) · 5,4 KB
- `docs/conocimiento/propuesta/la-colaboracion-y-el-coste-de-los-servicios.md` — La colaboración se ve en la portada, y el coste de los servicios es UNO (2026-10-22) · 4,2 KB
- `docs/conocimiento/propuesta/la-hoja-del-factor-multiplicador.md` — La hoja del FACTOR MULTIPLICADOR en la propuesta (2026-11-09) · 11,2 KB
- `docs/conocimiento/propuesta/la-propuesta-al-titular-aunque-los-avisos-vayan-al-instalador.md` — La propuesta al TITULAR, aunque sus avisos vayan al instalador (2026-10-10) · 2,4 KB
- `docs/conocimiento/propuesta/mensaje-de-envio-sin-irpf-empresa.md` — El mensaje de envío sin IRPF: empresa y terciario, escueto (2026-11-10) · 2,6 KB
- `docs/conocimiento/propuesta/presupuesto-estimado-la-propuesta-lo-dice-y-dice-a-que-afecta.md` — Presupuesto ESTIMADO — la propuesta lo dice, y dice a qué afecta (2026-09-03) · 9,4 KB
- `docs/conocimiento/propuesta/programar-el-envio-de-una-propuesta.md` — PROGRAMAR el envío de una propuesta (2026-09-19) · 4,9 KB
- `docs/conocimiento/propuesta/versiones-de-la-propuesta.md` — Versiones de la PROPUESTA (2026-08-25) · 8,2 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/propuesta/biomasa-la-deduccion-del-irpf-exige-placas-solares.md`
  - **REGLA — el aviso dice las DOS cosas.**
  - **REGLA — el CARBÓN no entra.**
  - **REGLA — biomasa se decide por la simulación, no solo por el desplegable.**
  - **REGLA — placas que cuentan:**
  - **REGLA — sin deducción en juego no se avisa**
  - **REGLA — el aviso NO va dentro del texto largo: va el último, aparte.**
- `docs/conocimiento/propuesta/condiciones-reforzadas-perfil-exigente.md`
  - **REGLA — el compromiso se cierra AL ACEPTAR, no en el convenio.**
  - **REGLA — la compensación es el 40 % del bono de la opción impresa, con un mínimo de la tarifa.**
  - **REGLA — la cifra se SELLA con la versión de la propuesta.**
  - **REGLA — `/aceptar` rechaza la primera aceptación sin la casilla**
  - **REGLA — la hoja 4 es de ALTO FIJO y estas cláusulas se midieron.**
- `docs/conocimiento/propuesta/enviada-con-cualquier-envio-y-a-quien-le-ha-llegado.md`
  - **REGLA — cualquier envío que salga bien pasa la oportunidad a ENVIADA**
  - **REGLA — un reenvío no hace retroceder la oportunidad.**
  - **REGLA — la lista dice A QUIÉN le ha llegado**
  - **REGLA — se CALCULA de `propuesta_versiones`, no se guarda aparte**
- `docs/conocimiento/propuesta/hibridacion-caldera-retirada-o-mantenida.md`
  - **REGLA — quien prepara la propuesta elige qué cifra es el PRECIO**
  - **REGLA — retirar la caldera es DESMONTARLA Y SACARLA DE LA VIVIENDA.**
  - **REGLA — las DOS hipótesis se le dicen al cliente ANTES de aceptar, por escrito,
en un mensaje APARTE**
- `docs/conocimiento/propuesta/la-colaboracion-y-el-coste-de-los-servicios.md`
  - **REGLA — lo que se le descuenta del bono es `caeMaintenanceCost`, en todas partes.**
  - **REGLA — cada total es la suma de las cifras IMPRESAS.**
  - **REGLA — con «Descuento Certificados» y un colaborador, la bonificación es SUYA.**
  - **REGLA — en la tabla de la portada NO se nombra la tarifa de 702,78 €**
- `docs/conocimiento/propuesta/la-hoja-del-factor-multiplicador.md`
  - **REGLA — toda propuesta en la que alguna opción sube por la vía FM lleva una HOJA más, la 2, detrás de la
portada, y una línea en la fila del bono de la portada que remite a ella.**
  - **REGLA — cada opción con SU ficha y las MISMAS condiciones que el párrafo del mensaje.**
  - **REGLA — si el FM no se puede aplicar, la propuesta no dice NADA del multiplicador**
  - **REGLA — lo que se le pide al cliente es lo que dice SU ficha.**
  - **REGLA — la hoja la genera el equipo interno**
  - **REGLA — es UN interruptor, se decide ANTES de enviar y apagado no queda NADA del FM.**
  - **REGLA — se GUARDA en la oportunidad**
  - **REGLA — con la vía FM ya elegida (`inputs.ruta_fm`) no se apaga**
  - **REGLA — el aviso del FM y el consentimiento del IRPF de esa vía ya NO van en el mensaje principal: van
en el ÚLTIMO mensaje, aparte**
  - **REGLA — manda el conmutador del equipo; sin tocar, lo que declaró el cliente al aceptar.**
  - **REGLA — la cifra con el × 1,5 dice lo que hay que ACREDITAR y lo que saldría sin acreditarlo.**
  - **REGLA — el expediente lo hereda.**
- `docs/conocimiento/propuesta/la-propuesta-al-titular-aunque-los-avisos-vayan-al-instalador.md`
  - **REGLA — con los avisos desviados, el titular es una fila más: `TITULAR`.**
  - **REGLA — si la oportunidad viene de un colaborador, al titular se le escribe «En
colaboración con {empresa}, te adjuntamos…»**
- `docs/conocimiento/propuesta/mensaje-de-envio-sin-irpf-empresa.md`
  - **REGLA — si ninguna de las opciones que se presentan lleva deducción del IRPF, el mensaje es el bono y
los pasos.**
  - **REGLA — la ayuda va sola en su línea y entera en negrita**
  - **REGLA — a una EMPRESA se la saluda por su PERSONA, nunca por la razón social**
- `docs/conocimiento/propuesta/presupuesto-estimado-la-propuesta-lo-dice-y-dice-a-que-afecta.md`
  - **REGLA — el popup, no dos zonas de suelta abiertas.**
  - **REGLA — "no tengo" NO es saltarse el paso: es ELEGIR el estimado.**
  - **REGLA — el bono CAE NO cambia y la deducción SÍ, y hay que decir las dos cosas.**
  - **REGLA — sin deducción, ese párrafo NO se escribe**
  - **REGLA — con "ocultar coste de obra" no se avisa.**
  - **REGLA — hay un TERCER escalón: `zoom` sobre el cuerpo de la hoja (`.prop-pb`).**
  - **REGLA — el servidor PARTE del zoom que ya trae la portada.**
  - **REGLA — el IVA lo decide la SIMULACIÓN, no el documento.**
  - **REGLA — P. Reforma es la SUMA**
  - **REGLA — las líneas de OTRA partida van a SU campo**
  - **REGLA — se GUARDA sola.**
- `docs/conocimiento/propuesta/programar-el-envio-de-una-propuesta.md`
  - **REGLA — el despachador NO vuelve a decidir nada.**
  - **REGLA — se delega en las MISMAS rutas**
  - **REGLA — el HTML va en columnas TEXT propias, nunca en `datos_calculo`.**
  - **REGLA — nace APAGADO**
  - **REGLA — el claim es ATÓMICO**
  - **REGLA — sin PDF no sale NADA**
  - **REGLA — enviar a mano CANCELA lo programado**
  - **REGLA — la hora se compone en LOCAL**
  - **REGLA — el calendario deja elegir HOY.**
- `docs/conocimiento/propuesta/versiones-de-la-propuesta.md`
  - **REGLA — la versión sube cuando la propuesta SALE, no cuando se guarda.**
  - **REGLA — se archiva EXACTAMENTE el PDF que se envía.**
  - **REGLA — el número lo asigna la BD.**
  - **REGLA — en BD solo metadatos y el enlace (regla 21).**
  - **REGLA — la marca va IMPRESA en el documento, no solo en el nombre del fichero.**
  - **REGLA — qué versión aceptó el cliente se SELLA.**
  - **REGLA — copiar el enlace de aceptación ES ENTREGAR la propuesta, y cuenta como tal.**
  - **REGLA — con reforma, se sella la rama que el PDF enseña.**
  - **REGLA — el historial solo resta cifras de la MISMA opción.**
  - **REGLA — la inversión es la de la portada: presupuesto + fotovoltaica.**

<!-- generado:fin -->
