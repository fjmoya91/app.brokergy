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

25. **La PROPUESTA se versiona al ENVIARLA, nunca al guardarla**: cada envío archiva su PDF en `0. PROPUESTAS` como `Propuesta_{expte}_v{N}.pdf`, imprime la marca DENTRO del documento y sella qué versión aceptó el cliente. Fuente única: [propuestaVersiones.js](implementation/backend/services/propuestaVersiones.js) — no volver a generar el PDF de la propuesta por separado en cada canal (el del email y el de WhatsApp acababan siendo documentos distintos), ni guardar el HTML de una versión en el JSONB (353 KB de media, regla 21). Ver "Versiones de la PROPUESTA".

31. **Una propuesta con presupuesto ESTIMADO lo dice, y dice a qué afecta**: el flujo interno pregunta el dinero UNA vez (`StepDocsObra`: documento · importe a mano · estimar 15.000 €) y la marca viaja en `inputs.presupuestoEstimado` hasta la portada, la tabla, el recuadro y el mensaje de envío (la nota al pie que lo repetía se retiró). El **bono CAE no cambia** (sale del ahorro certificado) y **la deducción del IRPF sí** (es un % del coste con IVA); sin deducción en juego, ese párrafo no se escribe. Fuente única del texto y de la cifra: [logic/presupuestoEstimado.js](implementation/frontend/src/features/calculator/logic/presupuestoEstimado.js), que carga también el backend (`leadMessages`) por import() ESM. Cualquier presupuesto tecleado en la calculadora LEVANTA la marca. **La portada nunca esconde texto bajo el pie**: si ni los huecos ni el compacto bastan, el cuerpo se reduce con `zoom` (bisección, suelo 0,72) ya en la vista previa, y el servidor parte de ese zoom. Tras tocar la portada: `node implementation/backend/scripts/revisar_portadas_propuestas.js`. Ver "Presupuesto ESTIMADO" y "La portada de la propuesta NUNCA esconde texto".

44.b **La PROPUESTA también elige a quién de la empresa**: su popup ofrecía UNA persona por partner —la del desvío de notificaciones, o el canal general— así que el comercial con el que se lleva la obra no se podía marcar sin salir a su ficha (medido en INSTALACIONES MIGUELTURRA: se leía «TERE · 926241611», el nombre de una persona sobre el teléfono de la centralita, y AURELIO no aparecía). Ahora la tarjeta es la EMPRESA y debajo van sus personas con la MISMA fila del expediente (`ContactoPickRow`), resueltas por `instaladorContacts` + `defaultContactIds` con rol **comercial**, que es el asunto que es. Desmarcar la última persona desmarca la empresa (y volver a marcarla restaura las que le tocan); si solo queda el canal general se dice con `avisoReparto`. El envío pasa a ir **por GRUPO**: dos personas de la misma empresa reciben UN correo con `cc` real (el `to`, el del rol) y por WhatsApp uno cada una con su propio saludo — `POST /api/pdf/send-proposal` y `sendProposalEmail` aceptan ya `cc`. Y **el canal se elige POR DESTINATARIO** (`CanalMiniChip` en cada fila marcada, con el chip de la barra de interruptor maestro): al comercial por WhatsApp y a administración por email en UN solo envío, en vez de enviar dos veces y duplicárselo al otro. Lo que la barra cuenta es lo que va a salir de verdad, y quien se queda sin ningún canal se dice en ámbar. Ver "Y a la propuesta se ELIGE quién de la empresa la recibe".

65. **Programar el envío de una propuesta**: botón de RELOJ pegado a ENVIAR; se elige día y hora y sale sola. El envío lo orquesta el NAVEGADOR, así que al programar se guarda el **plan YA HECHO** (grupos, mensaje por persona, canales) con el documento tal y como se revisó, y el despachador **NO vuelve a decidir nada** — si recompusiera el mensaje saldría otra propuesta distinta de la aprobada, con nadie delante. Se **delega en las MISMAS rutas** que usa el popup (`propuesta/version`, `send-proposal`, `version/:v`, `estado`, `comentarios`) con `x-internal-key`, como `routes/acciones.js`: el nº de versión, el PDF en Drive, la vista web del enlace, la carpeta y el historial son los mismos que enviándola a mano — esas cuatro rutas pasan a `internalKeyOrAuth` y `nombreUsuario(req)` lee `body.usuario`, para que quede a nombre de quien lo programó. El **HTML va en columnas TEXT propias** (353 KB de media, regla 21), nunca en `datos_calculo`, y se borra al terminar. **Nace APAGADO** (`PROPUESTA_PROGRAMADA_ENABLED`, solo `true` en el VPS): dos backends contra la misma base barrerían la misma tabla y desde LOCAL saldría a un cliente real — el claim atómico evita el doble envío, no el envío desde local, y **la pantalla dice cuándo está apagado**. **Sin PDF no sale nada** y **siempre se avisa al staff** (WhatsApp + email), salga bien, a medias o mal. **Enviar a mano cancela lo programado** de esa propuesta —o el cliente la recibe dos veces—, se avisa antes de pulsar, y lo que ya está `ENVIANDO` no se puede cancelar. La hora se compone en LOCAL, nunca partiendo un ISO. Tras tocarlo: `node implementation/backend/scripts/test_propuesta_programada.js` y `test_programar_envio.mjs`. Ver "PROGRAMAR el envío de una propuesta".

81. **La COMISIÓN del partner se expresa en % sobre lo que se le OFRECE AL CLIENTE, y el mensaje de la propuesta le dice cuánto ganaría.** Se sigue guardando en €/MWh (`caePricePrescriptor`, lo que consume `calculateFinancials`); el % es otra forma de teclearla y su base es `caePriceClient` —la tarifa de la propuesta ANTES de restarle la comisión, o el % sería circular—, no el precio del S.O.: con 20 €/MWh sobre 100 ofrecidos es un 20 %, no el 11,63 % que salía sobre 172. Lo aplican el panel de margen de la calculadora, la comisión por defecto de la ficha del partner (referencia `CAE_PRECIO_CLIENTE_NUEVAS`) y su siembra al elegir partner (**solo al ELEGIRLO**: abrir una oportunidad guardada no le vuelve a imponer la de la ficha — pisaba la guardada y cambiaba el bono, 26RES060_OP264 de 2.017 € a 2.305 €, 2026-10-10); ningún partner tenía comisión por defecto guardada, así que no se movió ningún importe. En el mensaje de envío, **solo al modo PARTNER** (el prescriptor; nunca al instalador asociado si es otra empresa, ni al cliente) se añade lo que cobraría —el MISMO `totalPrescriptor` del panel, redondeado a euros, **con su % —«vuestro 20 % sobre el bono que se le ofrecería al cliente», diciendo sobre qué, porque el bono del cliente que va en el mismo mensaje es MENOR cuando la comisión se le resta a él (460 sobre 1.840 da un 25 %)— y NADA MÁS**: ni los MWh ni los €/MWh, porque con esas dos cifras se rehace el precio al que se vende el ahorro y nuestro margen (decisión del usuario: lo pactado con él es un %, y eso es lo que se le repite). Una viñeta por opción en las comparativas— diciendo que **solo se cobra si el expediente sale favorable**, que el importe se ajusta al resultado de la verificación y que **se le avisará cuando se haga el ingreso al cliente**. ⚠️ Ese aviso al partner en el momento del pago al cliente **no está implementado todavía**. Fuente única: [logic/comisionPartner.js](implementation/frontend/src/features/calculator/logic/comisionPartner.js). Tras tocarlo: `node implementation/backend/scripts/test_comision_partner.mjs`.

85. **Los PRESUPUESTOS adjuntados a la propuesta rellenan Datos Económicos, cada uno en SU campo**: hueco Aerotermia → P. Aerotermia, hueco **Placas solares** (nuevo, siempre visible, fichero `PRESUPUESTO DE LA INSTALACIÓN_FOTOVOLTAICA.pdf`) → P. Fotovoltaica, huecos de la reforma → P. Reforma como **SUMA** de los activos con documento (recordados por hueco en `inputs.presupuestos_leidos`; los adjuntos nunca leídos se leen en el momento). El IVA lo decide la SIMULACIÓN (particular con IVA; empresa/terciario según el conmutador); las líneas de otra partida van a su campo solo si está vacío (la aerotermia estimada cuenta como vacía); <1 € de diferencia es la misma cifra. **Se guarda sola** con el mismo `payloadOportunidad` del botón Guardar, esperando al `result` recalculado, con línea en el historial y «Deshacer». Solo staff (lector `staffOnly`). Fuente única: [logic/presupuestoLeido.js](implementation/frontend/src/features/calculator/logic/presupuestoLeido.js). Tras tocarlo: `node implementation/backend/scripts/test_presupuesto_leido.mjs`. Ver "Los presupuestos adjuntados a la propuesta rellenan Datos Económicos".

100. **El ENLACE para aceptar la propuesta va en un MENSAJE APARTE, después del PDF** (2026-10-01): dentro del texto largo, a mitad y tras las cifras, nadie lo veía — «¿y cómo lo acepto?» y había que volver a pasarlo a mano. Las ocho variantes del mensaje (cliente/partner × aerotermia/reforma/comparativa/CEE aportado) ya no llevan el enlace: en su sitio dicen «👇 Más abajo te dejo el enlace para aceptarla» (`lineaEnlaceDebajo`, que vale para los dos canales). Por WhatsApp salen tres burbujas: texto → PDF → **el enlace solo, en su línea** (`mensajeAceptacion`); al partner, en tercera persona para que pueda reenviárselo al cliente tal cual. En el **email no se repite**: el correo ya lleva el botón «✍️ Aceptar y firmar» debajo del texto. Viaja como `textoDespues` de `sendMedia` (ruta `/api/whatsapp/send-media` y el envío PROGRAMADO, que lo guarda en el plan como `whatsapps[].mensajeAceptacion`; un plan anterior sale como entonces), con su propia confirmación de ACK; si falla **no se lanza** —el texto y el PDF ya llegaron y reintentar los duplicaría—: se devuelve en `despues` y el resultado del envío lo dice («pásaselo a mano»). El popup lo enseña debajo del mensaje antes de pulsar. Fuente única: [logic/mensajeAceptacion.js](implementation/frontend/src/features/calculator/logic/mensajeAceptacion.js). Tras tocarlo: `node implementation/backend/scripts/test_mensaje_aceptacion.mjs`.

132. **Con los avisos del cliente desviados a otra persona, el TITULAR sigue pudiendo recibir la propuesta** (2026-10-10, 26RES060_OP264): fila `TITULAR` en el popup (sin marcar), solo si su teléfono o email difiere del de la persona de contacto; cuenta como cliente en tuteo, email, aviso del CEE y paso a ENVIADA (también en el envío programado). Y si la oportunidad viene de un colaborador (`cobrand`, nunca BROKERGY), **al titular** se le escribe «En colaboración con {empresa}, te adjuntamos…» en vez de «Tal y como acordamos»; a la persona de contacto, como antes. Robot: `claude_propuesta.js --a titular`. Ver "La propuesta al TITULAR, aunque sus avisos vayan al instalador".

133. **Caldera de BIOMASA (combustible sólido que no es carbón): la deducción del IRPF exige placas solares; el Bono CAE no** (2026-10-10, decisión del usuario, 26RES060_OP274/OP288). Pasar de pellets o leña a aerotermia no reduce la energía primaria NO renovable, que es el requisito de la deducción; el CAE sale del ahorro de energía final y se obtiene igual. Sin placas (ya puestas o en esta obra; «en el futuro» no cuenta) y con deducción en juego, la calculadora lo avisa (`ResultsPanel`) y la propuesta lleva un recuadro bajo la tabla y un párrafo al final del mensaje de envío, **diciendo las dos cosas**. Biomasa = `fuelType` pellets/leña, o caldera `solid_*` que el funnel o la placa dicen de biomasa aunque el desplegable diga carbón (lo pone por defecto). Fuente única: [logic/irpfBiomasa.js](implementation/frontend/src/features/calculator/logic/irpfBiomasa.js). Tras tocarlo: `node implementation/backend/scripts/test_irpf_biomasa.mjs`. Ver "Caldera de BIOMASA: la deducción del IRPF exige placas solares".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/propuesta/biomasa-la-deduccion-del-irpf-exige-placas-solares.md` — Caldera de BIOMASA: la deducción del IRPF exige placas solares; el CAE no (2026-10-10) · 3,2 KB
- `docs/conocimiento/propuesta/hibridacion-caldera-retirada-o-mantenida.md` — Hibridación: la propuesta enseña el bono RETIRANDO y MANTENIENDO la caldera (2026-10-01) · 2,7 KB
- `docs/conocimiento/propuesta/la-propuesta-al-titular-aunque-los-avisos-vayan-al-instalador.md` — La propuesta al TITULAR, aunque sus avisos vayan al instalador (2026-10-10) · 2,4 KB
- `docs/conocimiento/propuesta/presupuesto-estimado-la-propuesta-lo-dice-y-dice-a-que-afecta.md` — Presupuesto ESTIMADO — la propuesta lo dice, y dice a qué afecta (2026-09-03) · 9,3 KB
- `docs/conocimiento/propuesta/programar-el-envio-de-una-propuesta.md` — PROGRAMAR el envío de una propuesta (2026-09-19) · 4,9 KB
- `docs/conocimiento/propuesta/versiones-de-la-propuesta.md` — Versiones de la PROPUESTA (2026-08-25) · 6,0 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/propuesta/biomasa-la-deduccion-del-irpf-exige-placas-solares.md`
  - **REGLA — el aviso dice las DOS cosas.**
  - **REGLA — el CARBÓN no entra.**
  - **REGLA — biomasa se decide por la simulación, no solo por el desplegable.**
  - **REGLA — placas que cuentan:**
  - **REGLA — sin deducción en juego no se avisa**
- `docs/conocimiento/propuesta/hibridacion-caldera-retirada-o-mantenida.md`
  - **REGLA — quien prepara la propuesta elige qué cifra es el PRECIO**
  - **REGLA — retirar la caldera es DESMONTARLA Y SACARLA DE LA VIVIENDA.**
- `docs/conocimiento/propuesta/la-propuesta-al-titular-aunque-los-avisos-vayan-al-instalador.md`
  - **REGLA — con los avisos desviados, el titular es una fila más: `TITULAR`.**
  - **REGLA — si la oportunidad viene de un colaborador, al titular se le escribe «En
colaboración con {empresa}, te adjuntamos…»**
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

<!-- generado:fin -->
