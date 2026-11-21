---
paths:
  - "implementation/backend/routes/{oportunidades,landing,comisionistas}.js"
  - "implementation/backend/utils/comisionista.js"
  - "implementation/backend/scripts/comisionista*.{js,sql}"
  - "implementation/frontend/src/features/comisionistas/**"
  - "implementation/backend/services/{leadService,avisoLeadAdmin}.js"
  - "implementation/backend/utils/{estadoOportunidad,altaOportunidad}.js"
  - "implementation/backend/scripts/alta_oportunidad*.js"
  - "implementation/frontend/src/features/landing/**"
  - "implementation/frontend/src/features/public/**"
  - "implementation/frontend/src/features/cee/CeePrevioGate.jsx"
  - "implementation/frontend/src/features/cee/{ceeExtract,ceeAvisos}.js"
  - "implementation/frontend/src/features/expedientes/logic/{fotovoltaica,confirmacionCliente}.js"
  - "implementation/frontend/src/features/calculator/views/**"
  - "implementation/frontend/src/features/calculator/components/CalculatorForm.jsx"
---
# Oportunidades — estados, IDs, funnel, nueva simulación, aceptación y alta desde WhatsApp (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/oportunidades/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

2. **Estados de oportunidad**: `LEAD`, `PTE ENVIAR`, `EN CURSO`, `ENVIADA`, `PRE-ACEPTADO`, `ACEPTADA`, `RECHAZADA` (esta lista estaba desactualizada — le faltaban `LEAD` y `RECHAZADA`, que ya estaban en uso). Cada cambio de estado mueve la carpeta de Drive automáticamente (mapa en `services/driveFolders.js`, ver "Carpetas de Drive por estado"). **`PRE-ACEPTADO`** (2026-09-18) es la aceptación de PALABRA: el cliente ha dicho que sí pero aún no ha rellenado la aceptación formal (firma). Es solo para hacer seguimiento — no crea expediente, no exige `cliente_id`, y su carpeta de Drive es la misma que `ENVIADA` (`02. SIMULACION ENVIADA`: no tiene carpeta propia). Entra en `ESTADOS_CAPTACION` (`routes/oportunidades.js`) y en `FASES_CAPTACION` (`dashboardAgg.js`): sigue contando como captación viva hasta que se acepta de verdad. El único disparador real de `ACEPTADA` + creación de expediente sigue siendo el mismo de siempre (`PATCH /:id/estado` con `nuevo_estado === 'ACEPTADA'`, y el trigger SQL `trg_sync_oportunidad_aceptada` que fuerza `ACEPTADA` en cuanto nace un `expediente` — por eso ningún camino de `PRE-ACEPTADO` puede crear un expediente sin pasar antes por ese `PATCH`).
   **REGLA — a partir de la aceptación, el estado que se VE lo manda el EXPEDIENTE y se CALCULA** ([utils/estadoOportunidad.js](implementation/backend/utils/estadoOportunidad.js), 2026-09-19). `datos_calculo.estado` describe la CAPTACIÓN y ahí se quedaba parado para siempre: una oportunidad aceptada hace ocho meses, con la obra hecha y el CAE cobrado, seguía diciendo `ACEPTADA` en la lista. `GET /api/oportunidades` cruza con `expedientes` y devuelve `estado_visible`: **`ACEPTADA`** mientras no se le ha encargado el CEE → **`EN CURSO`** en cuanto tiene `cee.certificador_id` → **`FINALIZADO`** al terminar. **No se ESCRIBE en la oportunidad**: duplicar la verdad en dos tablas es garantizar que un día digan cosas distintas (mismo criterio que `esCaptacionViva`, que ya excluía del embudo lo que tiene expediente «aunque su estado diga otra cosa: mandan los hechos, no la etiqueta»). Como consecuencia, **el desplegable de estado se sustituye por una chapa fija** en cuanto hay expediente: ofrecer un cambio que no se va a guardar es peor que no ofrecerlo.
   ⚠️ **El criterio es EL MISMO que mueve la carpeta de Drive** (`carpetaObjetivoExpediente`: 03. ACEPTADO sin certificador · 04. EN CURSO con él · 11. FINALIZADOS al final). Si aquí se decidiera distinto, la etiqueta de la lista y la carpeta en la que está el expediente contarían dos historias del mismo día — lo vigila `test_estado_oportunidad.mjs`, que recorre los 27 estados × con/sin certificador y compara las dos decisiones. Del expediente se piden **solo tres escalares** (`estado`, `numero_expediente`, `cee->>certificador_id`): `cee` entero trae los XML de los certificados (regla 22). Si esa consulta falla, la lista sale igual con el estado de captación — una etiqueta menos avanzada es mucho menos malo que dejar al usuario sin su cartera (regla 38).
   ⚠️ **`EN CURSO` significa ahora DOS cosas** y se asumió a propósito (decisión del usuario, 2026-09-19): propuesta en elaboración (sin expediente) y expediente en marcha (con él). Se distinguen por el color y porque las segundas ya no son captación, pero el filtro `EN CURSO` trae las dos.
   **El color de `PRE-ACEPTADO` es FUCSIA, y no es decorativo**: en teal se confundía con el verde de `ACEPTADA`, que es justo el estado del que hay que distinguirlo. Va además más saturado que el resto (`/20` y borde `/50` frente a `/10` y `/30`) porque es el que hay que mirar. Funciona en tema claro porque `[class*="text-fuchsia-"]` ya está en el remapeo de `.theme-light` (#C026D3) — **un color que no esté enumerado ahí sale ilegible sobre blanco**. `FINALIZADO` va en cian por lo mismo: no puede parecerse al verde de `ACEPTADA`. Y el tono `fuchsia` se añadió a `TONOS` de `DashboardWidgets.jsx`, que es un diccionario CERRADO (Tailwind purga las clases interpoladas): un `color` que no esté ahí cae a gris sin avisar.

3. **IDs de oportunidad**: Formato `{YY}RES_OP{N}`. No renombrar IDs antiguos para mantener trazabilidad.

35. **"¿Tienes placas solares?" se pregunta en `/reforma` y llega hasta el CEE**: la respuesta (`si` | `futuro` | `no`) y la potencia viajan `funnel → inputs.fotovoltaica → instalacion.fotovoltaica → encargo al certificador`. Fuente única: [logic/fotovoltaica.js](implementation/frontend/src/features/expedientes/logic/fotovoltaica.js), que el backend carga por import() ESM. **A quien ya tiene placas NO se le propone la medida de mejora de autoconsumo**: se le dice al certificador que las declare como instalación EXISTENTE (`ce3xTextos` · `buildCe3xFinal`). `estado: null` ("sin declarar") no es `'no'`, y la clave va en la BLACKLIST de `normalizeData` porque el enum es en minúscula. No confundir con `reforma_elementos.placas`, que son las placas de ESTA obra. Ver "¿Tienes placas solares?".

47. **El mismo vecino volviendo al funnel NO estrena oportunidad**: el duplicado no nacía en la comprobación de la oportunidad sino en el CLIENTE — `upsertClienteFromLanding` solo reconoce por email o DNI y **85 de 376 clientes no tienen ninguno de los dos**, así que estrenaba ficha y la idempotencia (que exigía `ref_catastral` **Y** `cliente_id`) ya no podía casar nada. La comprobación sube ANTES del upsert (`buscarLeadPrevio` en [leadService.js](implementation/backend/services/leadService.js)), reutiliza SU cliente y solo le rellena huecos. **El TELÉFONO desempata solo DENTRO de la misma vivienda, jamás a secas**: el móvil 695615330 figura en CINCO fichas de personas distintas (son móviles de instalador/comercial) y deduplicar clientes por teléfono fusionaría expedientes de gente distinta; se compara por los 9 últimos dígitos, porque la misma persona llega con y sin `+34`. **Solo se reutiliza un LEAD** — una ENVIADA tiene propuesta, carpeta movida y quizá expediente. **Al visitante se le avisa, no se le bloquea** (`check-rc`, que ya existía): hay segundas altas legítimas. **Pero un alta sobre una vivienda que ya tiene oportunidad se ANOTA en el historial** con cuáles son y en qué estado, o nadie se entera — la OP179 se trabajó cuatro meses sin saber de la OP113. En modo interno NO hay upsert, a propósito. Tras tocarlo: `node implementation/backend/scripts/test_lead_duplicado.js`. Ver "El mismo vecino volviendo al funnel".

82. **Al ACEPTAR la propuesta, el cliente confirma sus EMISORES, sus PLACAS y su AIRE ACONDICIONADO** (y, desde el 09/11/2026, su BONO SOCIAL: regla 204), en neutro, obligatorias y UNA POR PANTALLA (mobile first: el 90 % acepta con el móvil). Se guardan en `datos_calculo.confirmacion_cliente` con lo SUPUESTO al lado, y el expediente las hereda en `instalacion.confirmacion_cliente`. **Las placas se aplican solas** (no mueven cifras); **el emisor se PROPONE**: el expediente conserva el de la simulación y Instalación avisa con un botón que lo aplica por el camino del desplegable (recalcula el SCOP), porque mueve el ahorro. Los aires existentes llegan al encargo CE3X. **Los aires se apuntan también en la calculadora** (2026-10-15, `inputs.aires = { tiene, num }` → `instalacion.aires`): valen mientras el cliente no conteste, lo del cliente MANDA, y se dice de dónde sale (`conAiresDeOportunidad`, marca `aires_de: 'oportunidad'`; el encargo no lo pone en boca del cliente). `/firma/demo` enseña el formulario sin tocar nada. Fuente única: [logic/confirmacionCliente.js](implementation/frontend/src/features/expedientes/logic/confirmacionCliente.js); pantallas en `ConfirmarVivienda.jsx`. Tras tocarlo: `node implementation/backend/scripts/test_confirmacion_cliente.mjs`. Ver "Al ACEPTAR, el cliente confirma sus EMISORES, PLACAS y AIRES".

84. **En la ficha del inmueble del funnel PÚBLICO, las zonas son una PREGUNTA, no una tabla** ([ZonasCalefaccion.jsx](implementation/frontend/src/features/landing/components/ZonasCalefaccion.jsx)): «¿Dónde tienes calefacción?» enseña solo las plantas de VIVIENDA del Catastro y pregunta si es ahí y solo ahí. **«Sí, es correcto» continúa en el mismo toque** (el caso normal); «No, también en otras zonas» abre la lista completa (garaje, almacén…) para marcar y desmarcar, con el total en m² y el aviso de que el Catastro a veces llama «almacén» a una planta que es vivienda. Al cliente tampoco se le enseñan las UTM, la participación ni la zona climática repetida. ⚠️ La selección llega a `handleContinue` POR PARÁMETRO: se elige y se continúa en el mismo toque, y el estado aún no se ha actualizado. El flujo INTERNO (`isInternal`) conserva la tabla y todos los datos.

99. **Una oportunidad se da de ALTA con lo que el instalador manda por WHATSAPP, con la skill `alta-oportunidad`** (2026-10-01): lee el chat en el servidor (`/api/whatsapp/conversacion`, solo lectura, `x-internal-key`), baja la ráfaga de la petición (fotos, PDF, notas de voz), y con un plan escrito por quien ha mirado cada fichero crea la oportunidad por las MISMAS funciones que «Nueva simulación» (`funnelToCalculatorInputs` → `computeFullCalculatorResult` → `createLead` → `subirFicherosASlot`). Sin emisor declarado, radiadores; toda VIVIENDA del Catastro cuenta (no se puede quitar); orientación de la fachada y patios del croquis; la fila de la caldera por el AÑO DE SU PLACA (`rendimiento_id`), y sin placa o sin año la más reciente de su tipo (gasóleo ≥ 1998), nunca por el año de la vivienda (2026-10-14); la potencia útil de la placa en `inputs.placa_caldera`, que el expediente hereda; una RC con oportunidad previa PARA (`crear` se niega salvo `permitir_duplicado`), **buscada por su PARCELA y no con un igual exacto** (`oportunidadesDeLaRc`, 2026-11-20: la RC de 14 no veía la oportunidad guardada con la de 20, y el alta automática del contestador habría duplicado obras; con 20, esa vivienda o la guardada solo con la parcela; con 14, cualquiera de la parcela; si la BD no contesta, PARA). Primero en seco. **Si llega por EMAIL** (2026-10-19), el mismo recorrido: el conector de Gmail no baja adjuntos, así que `get_message` RAW (lo guarda Claude Code en `tool-results/`) → `correo-raw <fichero>`, o `correo "<remitente>"` por IMAP de Hostinger en SOLO LECTURA; adjuntos en carpeta nueva, sin repetidos; el partner, PISTA del remitente; el plan lleva `correo` en vez de `chat` y no hay chat que renombrar. **Las PLACAS de la misma obra van a P. Fotovoltaica** (2026-10-19, 26RES060_OP310): el presupuesto se reparte con `lecturaAPresupuesto` (regla 85), la cifra del plan (`presupuesto.fotovoltaica_con_iva`) MANDA sobre la del lector y, si van dentro del mismo documento, sale de P. Aerotermia; `computeFullCalculatorResult` pasa `presupuestoFotovoltaica` a `calculateFinancials` (IRPF e inversión, no el bono). Fuente única: [utils/altaOportunidad.js](implementation/backend/utils/altaOportunidad.js) + [scripts/alta_oportunidad.js](implementation/backend/scripts/alta_oportunidad.js) + [whatsappConversacion.js](implementation/backend/services/whatsappConversacion.js). **El `--escribir` usa la MISMA lectura del presupuesto que el seco** (`.lectura_presupuesto_<sha1>.json` junto al plan, 2026-11-18, 26RES060_OP424) y un documento que dice «NO incluye IVA» tiene escrita la BASE (`iva_incluido` en `importesDocumento`). Tras tocarlo: `node implementation/backend/scripts/test_alta_oportunidad.js` y `test_importes_documento.js`. Ver "Alta de OPORTUNIDAD desde WhatsApp".

161. **Si el bono CAE del ALTA sale por debajo de 3.000 €, se hace el CEE inicial con CE3X y su XML se carga en la SIMULACIÓN de la oportunidad antes de avisar a Fran o enviar la propuesta** (2026-10-23, Fran, Federico Romero / CL MATIAS PACHECO 3: «para saber realmente si se puede conseguir algo más con la situación real»). La cifra es la del «bono CAE» que imprime `alta_oportunidad.js crear` (ya en el seco). Camino: `crear --escribir` → skill `generar-cee-inicial` → `cee_inicial.js aplicar --escribir`, que califica en el PC y carga el XML solo (regla 152, como CEE NUESTRO, sin comparativa); en un RES080, inicial + previsto con `cargarRes080EnOportunidad`. El informe da bono estimado → bono con el CEE. Con CEE aportado por el cliente no se hace otro (su «con tu CEE» ya es la cifra medida). Lo que falte para el CEE se resuelve con Street View o se dice a Fran con el WhatsApp que lo pide en borrador, y la propuesta espera; en el servidor, sin CE3X, el XML entra cuando el PC lo califica. Ver "Bono por debajo de 3.000 € al dar de alta".

163. **Si el instalador NO dice nada del agua caliente, el ACS no se calcula** (2026-10-23, Fran): en el alta, `acs.incluir: false` aunque la caldera que se retira sea MIXTA; el ahorro y el bono son solo de la calefacción, con la caldera de hoy y su combustible. Solo se incluye si el presupuesto trae un equipo o depósito de ACS o lo dicen el instalador o el cliente claramente. En el CEE INICIAL el ACS puede darlo esa caldera o un termo (da igual; por defecto el termo); en el FINAL y en la medida, sin ACS en el presupuesto, **termo eléctrico**, aunque en el inicial lo diera la caldera mixta (completa lo de 26RES060_237). **Con ACS en el presupuesto** (2026-10-24, Fran, 26RES060_OP337), en el INICIAL el ACS lo da la misma caldera de hoy y en el FINAL la aerotermia o el aerotermo del presupuesto. **No se le pregunta al cliente con qué calienta el agua**: lo decide el presupuesto. Ver "Si el instalador no dice nada del agua caliente".

168. **El WhatsApp de «lo que falta» no pregunta lo que ya decide la casa** (2026-10-24, Fran, 26RES060_OP337: «eso ya lo comentamos», «lo del IBI ni caso», «¿con lo que tienes lo puedes sacar?»). Antes de redactarlo se mira si con lo que hay se saca la simulación y el CEE. Si se saca, **no se manda nada** y se sigue hasta la propuesta. No se pregunta:
    - **el agua caliente**: la decide el presupuesto (163);
    - **el emisor**: sin declarar, radiadores (99);
    - **a nombre de quién está la casa**: el TITULAR es el del presupuesto y el DNI que manda. Un IBI a nombre del cónyuge no se cuestiona ni cambia el titular;
    - **fotos de paredes en el linde** con un solar u otra finca: no pueden tener ventanas (167).
    
    Solo se pide lo que de verdad falta y cambia el resultado: la placa ilegible, la caldera en su sala (162), una pared a la propia parcela que no sale en ninguna foto, o el presupuesto. Ver "Lo que NO se le pregunta al cliente".

204. **Al ACEPTAR, al particular de una RES060/RES093/RES080 se le pregunta si tiene el BONO SOCIAL; solo marca VULNERABLE (× 1,5, ficha -S) lo que lo es sin duda, y NO viaja al certificador** (2026-11-09, Fran, vía FM BOE-A-2026-23367). A quién: `preguntaBonoSocial(programa)` (RES060/RES093 → tipo y familia numerosa; RES080 → solo el tipo, para el Anexo I: la RES080_FM no tiene -S); nunca a un CIF (`esNifDeEmpresa`) ni al terciario, y el servidor lo vuelve a decidir al aceptar (`confirmacionDeLaAceptacion(raw, dc, { programa, nif })`). Se guarda en `confirmacion_cliente.bono_social` y el alta lo siembra en el MISMO insert (`semillaBonoSocial` en `expedienteService.js`): `documentacion.subvenciones.bono_social` con los ids del Anexo I y, en RES060/RES093, `documentacion.via_fm.vulnerable` + `anexo_b_casilla` **solo** con bono ELÉCTRICO sin familia numerosa (`no_fn`) o severo / en riesgo de exclusión con ella (`severo`). El térmico solo no cuenta; eléctrico «vulnerable» con familia numerosa queda PENDIENTE de la renta y «No lo sé», de la factura: se enseñan en Subvenciones y en la pestaña «Vía FM» («Declarado al aceptar», con su botón), no se adivinan. **Es un dato de renta: `conAiresDeOportunidad` lo quita (`sinBonoSocial`) y `resumenConfirmacion` no lo enseña**, así que no llega al encargo ni a la app de certificadores. El cálculo FM del EXPEDIENTE aplica el × 1,5 (`calculateRes060FM({ vulnerable })`); la calculadora y el listado no (la propuesta sale antes). Fuente única: sección «Bono social» de [logic/confirmacionCliente.js](implementation/frontend/src/features/expedientes/logic/confirmacionCliente.js). Tras tocarlo: `node implementation/backend/scripts/test_confirmacion_cliente.mjs`, `test_via_fm.mjs`, `test_res060fc.mjs` y `test_subvenciones_bono.mjs`. Ver "El BONO SOCIAL también se pregunta al aceptar".

208. **El formulario «Calcula tu ayuda» vive en la APP y la obra llega en el ENLACE** (2026-11-09, Fran: «sí, constrúyelo»). La web (brokergy.es/ayudas) solo enlaza a `app.brokergy.es/calcula-tu-ayuda?obra=caldera|reforma`: el funnel (Catastro, cálculo, `check-rc`, alta) es el mismo componente que la «Nueva simulación» y duplicarlo en la web haría que calcularan distinto. Todas las rutas públicas (`/calcula-tu-ayuda`, `/reforma`, `/ayudas-aerotermia`, `/p/:slug`) entran por `ReformaSubFlow`; `?obra=` es una lista cerrada y `?ref=` una etiqueta corta (`^[a-z0-9_-]{1,30}$`): **en el enlace no va nunca un dato personal**. Una etiqueta asigna partner: `esc-<fila>` (el escaparate de WhatsApp, regla 206): el alta lee esa fila de `wa_bienvenidas` (o la de su teléfono) y la oportunidad nace a nombre de su instalador (`partnerDelLead`, que nunca tumba el alta). Con `obra`, no se pregunta el tipo (la reforma llega a los elementos con la aerotermia ya marcada). En el PÚBLICO ya no se pregunta el gasto anual, la condensación (gas/gasóleo de menos de 10 años = condensación) ni con qué calienta hoy el agua (163); **sí lo que decide el factor multiplicador**, solo con aerotermia en la obra: cuándo empezó (si está empezada), quién vive en la casa y el bono social (y si es solo por familia numerosa, que no cuenta como vulnerable). El bono social no se guarda en el navegador (`NO_PERSISTIR`). El resultado da «tus dos ayudas» (bono CAE neto + IRPF) y **la vía FM APARTE, nunca sumada**, con el aviso del cupo. `POST /api/landing/lead` guarda `via_fm` (`viaFmDe`) y el aviso de administración sale para todo lead público. **El CRM (`isInternal`) no cambia**: sigue con el tipo, la condensación, el ACS de hoy y `docs_obra`. **Local escribe en PRODUCCIÓN: el formulario se prueba con el POST bloqueado en el navegador.** Tras tocarlo: `node implementation/backend/scripts/test_aviso_lead_admin.js`, `test_lead_duplicado.js` y el build. Ver "El formulario «Calcula tu ayuda»".

217. **El PARTNER da de alta la caldera con la FOTO de su placa, y ve la oportunidad simplificada** (Fran, 16/11/2026). En «Nueva simulación» (flujo interno) la pantalla `placa_caldera` ([StepPlacaCaldera.jsx](implementation/frontend/src/features/landing/steps/StepPlacaCaldera.jsx)) lee la placa al momento (`POST /api/oportunidades/leer-placa-caldera`, la MISMA lectura que el expediente, regla 27.d), da un VEREDICTO decidido por el código (`ok` / `incompleta` / `no_valida`, [utils/placaCalderaAlta.js](implementation/backend/utils/placaCalderaAlta.js)), pide CONFIRMAR el combustible (el leído nunca se escribe: va en `combustible_leido`) y la condensación (gas/GLP/gasóleo; «no lo sé» = por el modelo o el año, ≥ 2016 condensación), y contesta sola la caldera del funnel con la fila por el **AÑO DE LA PLACA** (regla 99, [data/calderaDesdePlaca.js](implementation/frontend/src/features/landing/data/calderaDesdePlaca.js)); sin foto, se contesta a mano como antes. Al crear manda la caldera de la placa (fila, potencia, propano, sólidos) si el combustible no cambió después, y `inputs.placa_caldera` lleva lo leído, lo confirmado y el veredicto (el expediente la hereda); el historial lleva una nota con todo eso. **`internal-simulation` devuelve el `upload_token`** y el formulario sube con `?token=`: sin él, al partner se le PERDÍAN en silencio las fotos y el presupuesto. **Los lectores con IA del alta son `enforceAuth`** (`catastro/ocr-rc`, `factura-ocr/extract`, `leer-placa-caldera`): el anónimo no, el partner con sesión sí. **En la oportunidad, el partner no ve «Envolvente térmica», y la «Sup. Calef.» no baja de la útil sin confirmarlo**: al salir del campo, popup «la ayuda baja» con «Dejar {útil} m²» como acción principal; lo confirmado se guarda en `inputs.supCalefMenor` (quién, empresa, cuándo) y el equipo interno lo lee bajo el campo (a él no se le bloquea: solo un aviso ámbar) ([logic/superficieCalefaccion.js](implementation/frontend/src/features/calculator/logic/superficieCalefaccion.js)). El partner ve el alta con la piel de la marca (`.lf .theme-light`, regla 164). **Tras el alta, el partner va DIRECTO a la oportunidad** (16/11/2026): sin «Sube ahora las fotos del antes», esperando a que suban sus ficheros; lo demás se pide al aceptar; el equipo interno sigue con la pantalla de fotos. **La oportunidad del partner es UNA página** ([ResumenOportunidadPartner.jsx](implementation/frontend/src/features/calculator/components/partner/ResumenOportunidadPartner.jsx), piel `.po-`; sin la barra oscura del bono, sin Resultados y con el formulario plegado tras «Corregir datos»): pasos, bono y las cuentas de su cliente hasta «La obra le queda en» (`cuentasCliente`, las cifras de `calculateFinancials`, total = suma de lo impreso), la vía FM «hasta X €» EN LUGAR DE (nunca sumada; sin cifra si no es elegible), con qué se calculó y UNA acción, «Ver y enviar la propuesta». El `ResultsPanel` sigue montado sin pintarse (`vistaPartner`) y la página le pide sus popups con `accionExterna` (`pdf`, `tabla`, `guardar`, `fotos`, `historial`). Sin comisión (es margen). Su popup de requisitos del FM (cinco preguntas, [logic/requisitosFm.js](implementation/frontend/src/features/calculator/logic/requisitosFm.js)) termina en «Pedir que vaya por FM»: `POST /:id/peticion-fm` (`enforceAuth` + `suyaSiPartner`) guarda `inputs.peticion_fm` (respuestas booleanas) con la RPC de merge y lo anota; **no cambia la vía** (la elige el equipo, `ruta-fm`) y el guardado de la calculadora no la toca (`conservarRutaFm`). **Arriba, el bono y lo de su lado en DOS tarjetas paralelas** (vía FM, opción 2 o las cuentas) y la acción arriba a la derecha (17/11/2026). **Con el bono por debajo de 3.000 € y sin CEE en la simulación, «Solicitar revisión»** (`ofrecerRevision`, [logic/revisionPartner.js](implementation/frontend/src/features/calculator/logic/revisionPartner.js)): `POST /:id/peticion-revision` (`enforceAuth` + `suyaSiPartner`) tras un POPUP que confirma y explica (`SolicitarRevisionModal`: los tres pasos, que puede subir o bajar, no enviar la propuesta mientras, «Subir fotos antes») vuelve a mirar el umbral con lo GUARDADO, encarga el CEE inicial a la IA **por la API** (`ceeIa.pedir({ origen: 'revision_partner', porVia: 'api' })`: fila `EN_COLA` que coge el vigilante del PC, `banco.mjs atender`, y que carga el XML con `cargarCeeEnOportunidad`) y apunta `inputs.peticion_revision` (que `conservarRutaFm` también conserva). **Al cargarse el XML, `cerrarRevision` ([services/revisionPartner.js](implementation/backend/services/revisionPartner.js)) marca `resuelta_at` ANTES de avisar y manda UNA vez un WhatsApp al partner** (contactos comerciales, sin emojis, enlace a producción); si el trabajo acaba sin cargarlo, `trasTrabajo` avisa a administración; un RES080 no se carga solo. Mientras espera, la acción naranja es «Subir fotos de la vivienda» y la propuesta va en secundario. ⚠️ En local, pulsarla escribe en PRODUCCIÓN (la fila de la IA, con su coste, y el WhatsApp): se prueba en el banco. **«Corregir datos» es el `CalculatorForm` de siempre dentro de `CorregirDatosPartner`** (claro con `.theme-light` + `.po-form`, sin su titular oscuro, pie fijo «Listo» / «Guardar cambios»); en «Datos económicos» el partner no ve «Dto. certificados», «Tramitación legalización» ni el interruptor «IRPF del CAE», y bajo el titular lleva qué cambia según sea particular, autónomo o empresa (`NotaTitular`). Pantallas sin sesión ni escritura: `/alta-partner-prueba.html` (`?vista=oportunidad` para el resumen, `&corregir=1`, `&rev=1`, `&rev=hecha`). Tras tocarlo: `node implementation/backend/scripts/test_caldera_desde_placa.mjs`, `test_placa_caldera_alta.js`, `test_superficie_calefaccion.mjs`, `test_via_fm_precio.mjs`, `test_revision_partner.js`, `test_cee_ia.mjs`, `test_rutas_sin_sesion.js`, `test_rutas_partner.js` y el build. Ver "El alta del PARTNER: la caldera desde la FOTO de su placa".

218. **Una oportunidad puede llevar un COMISIONISTA: la PERSONA que trajo la obra, aparte del partner (empresa) del que cuelga** (Fran, 16/11/2026, 26RES060_OP308: Juanma, ingeniero de LOS SIETE HERMANOS, frente a Rufino, comercial de la misma empresa). Tabla `comisionistas` + `oportunidades.comisionista_id` / `comisionista_importe` ([comisionistas_schema.sql](implementation/backend/scripts/comisionistas_schema.sql); RLS sin policies, GRANT a `service_role` y REVOKE a `anon`/`authenticated`, regla 150). **Es una marca de ATRIBUCIÓN**: no cambia el partner, ni a quién se avisa, ni el bono, ni la comisión de la empresa (regla 81). **Del equipo interno, y lo pactado solo de ADMIN**: rutas `staffOnly` ([routes/comisionistas.js](implementation/backend/routes/comisionistas.js)); al partner se le quitan las dos columnas en el listado, en `GET /:id` y en las respuestas del guardado (`sinCiegaParaPartner`), y al TRABAJADOR el importe y `comision_*` — lo decide SOLO `capaComisionista` ([utils/comisionista.js](implementation/backend/utils/comisionista.js)). **Se guarda AL MOMENTO** por `PUT /api/comisionistas/oportunidad/:id`, nunca con el guardado de la calculadora (cuyo `update` no incluye esas columnas: no las pisa); cambiar de persona vacía el importe. Se elige con UNA pieza ([ComisionistaSelector.jsx](implementation/frontend/src/features/comisionistas/ComisionistaSelector.jsx)) en la fila del listado de oportunidades, la cabecera de la calculadora y la del expediente; se filtra en los dos listados (columna «Comisionista» en expedientes). **Sin JSONB** (regla 22): dos escalares en `listaSelect`; en expedientes, una consulta aparte de escalares como la de los rechazados, sin tocar la RPC v4. Por script, en seco: `scripts/comisionista.js listar | alta | marcar` («marcar» no pisa otro comisionista). Tras tocarlo: `node implementation/backend/scripts/test_comisionista.js`, `test_rutas_sin_sesion.js`, `test_rutas_partner.js`, `auditar_rutas_sin_guardian.js` y el build; banco sin sesión: `/comisionista-prueba.html`. Ver "El COMISIONISTA de una oportunidad".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/oportunidades/al-aceptar-el-cliente-confirma-sus-emisores-placas-y-aires.md` — Al ACEPTAR, el cliente confirma sus EMISORES, PLACAS y AIRES (2026-09-29) · 13,0 KB
- `docs/conocimiento/oportunidades/alta-de-oportunidad-desde-whatsapp-skill-alta-oportunidad.md` — Alta de OPORTUNIDAD desde WhatsApp — skill `alta-oportunidad` (2026-10-01) · 18,1 KB
- `docs/conocimiento/oportunidades/bono-por-debajo-de-3000-se-hace-el-cee-al-dar-de-alta.md` — Bono por debajo de 3.000 € al dar de alta: se hace el CEE con CE3X y su XML va a la oportunidad (2026-10-23) · 3,1 KB
- `docs/conocimiento/oportunidades/el-alta-del-partner-con-la-foto-de-la-placa.md` — El alta del PARTNER: la caldera desde la FOTO de su placa, y la oportunidad simplificada (2026-11-16) · 28,2 KB
- `docs/conocimiento/oportunidades/el-aviso-de-lead-web-trae-lo-necesario-para-decidir.md` — El aviso de LEAD WEB trae lo necesario para decidir (2026-10-20) · 2,5 KB
- `docs/conocimiento/oportunidades/el-comisionista-de-una-oportunidad.md` — El COMISIONISTA de una oportunidad: la persona que trajo la obra (2026-11-16) · 4,9 KB
- `docs/conocimiento/oportunidades/el-formulario-calcula-tu-ayuda-la-obra-viene-en-el-enlace.md` — El formulario «Calcula tu ayuda»: la obra viene en el enlace, y pregunta lo que decide el FM (2026-11-09) · 8,5 KB
- `docs/conocimiento/oportunidades/el-mismo-vecino-volviendo-al-funnel-no-estrena-oportunidad.md` — El mismo vecino volviendo al funnel NO estrena oportunidad (2026-09-11) · 3,8 KB
- `docs/conocimiento/oportunidades/lo-que-no-se-le-pregunta-al-cliente.md` — Lo que NO se le pregunta al cliente (2026-10-24) · 3,5 KB
- `docs/conocimiento/oportunidades/nueva-simulacion-con-cee-inicial-y-final.md` — Nueva simulación con CEE inicial y final (2026-08-10) · 10,0 KB
- `docs/conocimiento/oportunidades/sin-acs-declarado-no-se-calcula-el-acs.md` — Si el instalador no dice nada del agua caliente, el ACS no se calcula (2026-10-23) · 2,9 KB
- `docs/conocimiento/oportunidades/tienes-placas-solares-se-pregunta-una-vez-y-acompana-al-inmueble.md` — ¿Tienes placas solares? — se pregunta UNA vez y acompaña al inmueble (2026-09-07) · 3,8 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/oportunidades/al-aceptar-el-cliente-confirma-sus-emisores-placas-y-aires.md`
  - **REGLA — UNA PREGUNTA POR PANTALLA**
  - **REGLA — el aire acondicionado es una pregunta APARTE**
  - **REGLA — se pregunta en NEUTRO.**
  - **REGLA — las PLACAS se aplican solas; el EMISOR se PROPONE.**
  - **REGLA — se guarda con lo que se SUPUSO al lado**
  - **REGLA — no llegar la confirmación NO impide aceptar.**
  - **REGLA — lo que dice el CLIENTE al aceptar MANDA; lo apuntado en la oportunidad
vale mientras no ha contestado, y se dice de dónde sale.**
  - **REGLA — el bono social NO viaja al certificador.**
  - **REGLA — solo se marca vulnerable lo que lo es sin duda; lo dudoso se enseña, no se adivina.**
- `docs/conocimiento/oportunidades/alta-de-oportunidad-desde-whatsapp-skill-alta-oportunidad.md`
  - **REGLA — el alta sale por las MISMAS funciones que el formulario.**
  - **REGLA — la conversación se LEE en el servidor, y solo se lee.**
  - **REGLA — sin emisor declarado, RADIADORES convencionales**
  - **REGLA — la edad de la caldera sale de la PLACA, nunca del año de la vivienda**
  - **REGLA — TODO lo que el Catastro declara como VIVIENDA cuenta**
  - **REGLA — la placa de la caldera viaja con la oportunidad**
  - **REGLA — una vivienda que ya tiene oportunidad PARA la skill y se pregunta**
  - **REGLA — la vivienda se busca por su PARCELA, no por un igual exacto de la RC**
  - **REGLA — el CEE que aporta el cliente entra para la COMPARATIVA, no para el cálculo**
  - **REGLA — un CEE NUESTRO no da la comparativa «con tu CEE / CEE nuevo BROKERGY»**
  - **REGLA — la superficie es la del CEE, no la de vivienda del Catastro**
  - **REGLA — lo que se baja de un correo es de un tercero**
  - **REGLA — el partner sale del remitente, como PISTA**
  - **REGLA — la cifra de las placas del plan MANDA sobre la del lector**
  - **REGLA — el `--escribir` usa la MISMA lectura del presupuesto que se revisó en seco**
- `docs/conocimiento/oportunidades/bono-por-debajo-de-3000-se-hace-el-cee-al-dar-de-alta.md`
  - **REGLA — si el bono CAE del alta sale por debajo de 3.000 €, se hace el CEE INICIAL con CE3X
(skill `generar-cee-inicial`) y su XML se CARGA en la SIMULACIÓN de la oportunidad antes de avisar a
Fran o enviar la propuesta.**
- `docs/conocimiento/oportunidades/el-alta-del-partner-con-la-foto-de-la-placa.md`
  - **REGLA — la caldera de la placa MANDA sobre lo que dedujo el funnel, solo si el combustible
no ha cambiado después.**
  - **REGLA — `inputs.placa_caldera` lleva lo leído, lo confirmado y el veredicto**
  - **REGLA — `internal-simulation` devuelve el `upload_token` de la oportunidad recién creada,
y el formulario sube con `?token=`.**
  - **REGLA — el partner no pasa por «Sube ahora las fotos del antes».**
  - **REGLA — la superficie calefactada no baja de la útil sin confirmarlo.**
  - **REGLA — lo confirmado se guarda con quién y cuándo**
  - **REGLA — el `ResultsPanel` del partner sigue MONTADO, sin pintarse**
  - **REGLA — la comisión del partner NO va en el resumen.**
  - **REGLA — la vía FM se enseña en €, «hasta X €», EN LUGAR DE la normal, nunca sumada**
  - **REGLA — «Pedir que vaya por FM» deja una PETICIÓN, no cambia la vía.**
  - **REGLA — «Solicitar revisión» se ofrece al partner con el bono por debajo de 3.000 € y sin el
CEE de la vivienda en la simulación**
  - **REGLA — antes de pedirla, un POPUP que confirma y explica**
  - **REGLA — la revisión ENCARGA el CEE inicial a la IA por la API (la cola del PC), y su XML pasa la
simulación a cálculo real.**
  - **REGLA — al cargarse el XML, la app cierra la revisión y avisa al partner por WhatsApp, UNA vez.**
  - **REGLA — mientras espera, la acción naranja NO es enviar la propuesta.**
  - **REGLA — el partner corrige con el formulario de SIEMPRE, dentro de su tarjeta
clara**
  - **REGLA — en «Datos económicos» el partner tiene lo justo**
- `docs/conocimiento/oportunidades/el-aviso-de-lead-web-trae-lo-necesario-para-decidir.md`
  - **REGLA — las cifras del aviso salen con el MISMO criterio que la lista de oportunidades**
  - **REGLA — el margen va solo porque el chat es el de administración.**
- `docs/conocimiento/oportunidades/el-comisionista-de-una-oportunidad.md`
  - **REGLA — el comisionista es una marca de ATRIBUCIÓN: no cambia el partner, ni a quién
se avisa, ni el bono.**
  - **REGLA — es del EQUIPO INTERNO, y lo pactado solo de ADMIN**
  - **REGLA — se guarda AL MOMENTO por su ruta, no con el guardado de la calculadora ni
con el autoguardado del expediente.**
  - **REGLA — el listado no trae `datos_calculo` para esto**
  - **REGLA — la tabla nació con RLS sin policies, GRANT a `service_role` y REVOKE a `anon`
y `authenticated`.**
- `docs/conocimiento/oportunidades/el-formulario-calcula-tu-ayuda-la-obra-viene-en-el-enlace.md`
  - **REGLA — el formulario vive en la APP (`app.brokergy.es/calcula-tu-ayuda`); la web solo enlaza con
`?obra=`.**
  - **REGLA — en el enlace no va nunca un dato personal.**
  - **REGLA — el bono social no se guarda en el navegador**
  - **REGLA — la vía FM va APARTE y nunca se suma a la cifra.**
- `docs/conocimiento/oportunidades/el-mismo-vecino-volviendo-al-funnel-no-estrena-oportunidad.md`
  - **REGLA — el TELÉFONO solo desempata DENTRO de la misma vivienda, jamás a
secas.**
  - **REGLA — solo se reutiliza un LEAD.**
  - **REGLA — al visitante se le AVISA, nunca se le bloquea.**
  - **REGLA — pero un alta sobre una vivienda que YA tiene oportunidad se ANOTA.**
- `docs/conocimiento/oportunidades/lo-que-no-se-le-pregunta-al-cliente.md`
  - **REGLA — Antes de redactar un WhatsApp con «lo que falta», se comprueba si con lo que hay ya se
saca la simulación y el CEE. Si se saca, no se pregunta nada y se sigue hasta la propuesta.**
  - **REGLA — en una obra de FESSA SOLAR (partner), al cliente NO se le piden fotos de paredes, fachadas,
patios ni vídeo de la vivienda: el CEE inicial (y su `.cex`/`.xml`) lo aporta FESSA
(`DOC_CEE_EXISTENTE`). Se le pide SOLO lo de los equipos que falte: la caldera anterior en su sala y
su PLACA (regla 162), y las placas de características de la aerotermia instalada.**
- `docs/conocimiento/oportunidades/nueva-simulacion-con-cee-inicial-y-final.md`
  - **REGLA — el η del CEE ELIGE la casilla de la tabla, no la sustituye.**
  - **REGLA — facturas y presupuesto no se suman.**
  - **REGLA — el documento tiene DOS importes y cada uno va a lo suyo (2026-08-27).**
  - **REGLA — un documento que dice «NO incluye IVA» tiene la BASE escrita, no lo que se paga
(2026-11-18).**
- `docs/conocimiento/oportunidades/sin-acs-declarado-no-se-calcula-el-acs.md`
  - **REGLA — sin ACS declarado, la simulación va SIN ACS**
  - **REGLA — en los certificados:**
  - **REGLA — el agua caliente no se le pregunta al cliente.**
- `docs/conocimiento/oportunidades/tienes-placas-solares-se-pregunta-una-vez-y-acompana-al-inmueble.md`
  - **REGLA — las TRES respuestas valen, y cada una sirve para algo distinto.**
  - **REGLA — `estado: null` NO es `'no'`.**
  - **REGLA — a quien YA tiene placas no se le propone ponerlas.**
  - **REGLA — se dice "FOTOVOLTAICAS" y se explica que son las de la electricidad.**
  - **REGLA — con placas, la potencia se contesta o se dice que no se sabe.**
  - **REGLA — el chip de la calculadora sale con el panel PLEGADO.**

<!-- generado:fin -->
