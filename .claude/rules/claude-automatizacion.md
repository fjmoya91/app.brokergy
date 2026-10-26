---
paths:
  - "implementation/backend/scripts/{asistente_*,claude_propuesta,justificar}.*"
  - "implementation/backend/utils/sesionRobot.js"
  - "implementation/asistente/**"
  - "implementation/backend/services/asistenteCanal.js"
  - "implementation/backend/{services,routes}/asistenteApp.js"
  - "implementation/frontend/src/features/asistente/**"
  - "tools/windows/pc_trabajos.vbs"
  - ".claude/hooks/**"
  - "scripts/{skills,conocimiento}.mjs"
  - "scripts/conocimiento/**"
---
# Claude y automatización — asistente por WhatsApp, llave de Claude, hooks y scripts de mantenimiento (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/claude-automatizacion/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

103. **La LLAVE DE CLAUDE: una cuenta sin contraseña que pulsa los botones de la app** (2026-10-02). Para que Claude envíe una propuesta sin que nadie inicie sesión, [scripts/claude_propuesta.js](implementation/backend/scripts/claude_propuesta.js) abre un Chrome sin pantalla EN EL PC, entra en `app.brokergy.es` con la cuenta `robot.claude@app.brokergy.es` (rol ADMIN, para que la propuesta salga idéntica a la de una persona) y pulsa «Generar PDF» → ENVIAR → destinatarios → Enviar. **No se rehace la propuesta en el servidor a propósito**: la compone React midiendo la página (portada, versión, mensajes por persona) y una copia divergiría de la que ve una persona. La cuenta **no tiene contraseña utilizable** (aleatoria, no se guarda) y su dominio no tiene buzón; la sesión la abre el script con la clave de servicio del `.env` (enlace mágico canjeado por el propio servidor, sin email) y la **cierra al terminar**. Se reconoce por `app_metadata.robot` —que solo escribe el servidor; el `user_metadata` lo puede editar el propio usuario— y el historial firma lo suyo como «CLAUDE» (`req.user.esRobot`). **Por defecto va EN SECO**: enseña destinatarios, canales, avisos y el mensaje, con captura del popup y de la PORTADA (`{op}-2-portada.png`, 2026-10-10) en `backend/scratch/claude_propuesta/` (fuera de git: lleva datos del cliente); con `CLAUDE_ROBOT_APP_URL=http://localhost:5173` se prueba contra el frontend LOCAL antes de desplegar (solo en seco: el envío lo hace el WhatsApp del VPS); solo con `--enviar` pulsa el botón. Si la simulación tiene cambios sin guardar **no envía** salvo `--sin-guardar`, o `--guardar` (2026-10-07, 26RES060_OP254): pulsa «Guardar Oportunidad» → «Guardar Datos» como una persona, para que cuando un script cambia los `inputs` el `result` lo calcule y lo guarde la propia calculadora (un script no puede rehacer `handleCalculate`). Los elementos que pulsa llevan `data-robot` (`abrir-propuesta`, `aviso-sin-guardar`, `abrir-envio`, `modo-<MODO>`, `canal-*`, `mensaje`, `enviar`, `envio-resultado`): **no se quitan ni se renombran sin tocar el script**. Revocarla: `node scripts/claude_propuesta.js baja` (el backend la rechaza en ≤ 5 min, la caché de sesiones).

113. **Fran trabaja con Claude por WhatsApp, siempre abierto** (2026-10-05): escribe desde su móvil personal al de la empresa, el backend avisa al contenedor `asistente` (`services/asistenteCanal.js` → `scripts/asistente_vigia.js --servidor`) y Claude trabaja con las skills y le contesta por el mismo chat. Nada sale a un tercero sin su «envíala» para ESA oportunidad; su número solo en el `.env`; el contenedor usa el repo montado (solo lo commiteado) y no se reconstruye con un trabajo en marcha. Modo proactivo: si un instalador manda una petición y nadie le contesta, se le pregunta a Fran (lo filtra Gemini). Claude arranca fuera del repo para no cargar CLAUDE.md entero, con Sonnet por defecto. **Y con la SUSCRIPCIÓN, nunca con la clave de la API** (2026-10-24): el contenedor carga el `.env` del backend, que lleva `ANTHROPIC_API_KEY`, y con ella `claude -p` cobraba a la API (22-23/10, ~4,6 $); `lanzarClaude` se la quita (`entornoClaude`), como `asistente_pc.js` en el PC. Ningún `claude -p` se lanza con `process.env` a pelo. **Con el WhatsApp caído atiende igual lo que pide la app, y todo lo que se le dice a Fran pasa por el BUZÓN** (`mandarOGuardar` → `scratch/asistente/por_enviar.json`, que `vaciarBuzon` manda en cuanto vuelve, con la hora; 2026-10-19): ningún envío al canal de Fran se hace con `mandar` a pelo. Ver "El ASISTENTE de Fran por WhatsApp".

125. **Un expediente se JUSTIFICA al terminar la obra con la skill `justificar-expediente`, por las MISMAS rutas que la pantalla y con la cuenta de CLAUDE** (2026-10-08, caso 26RES060_178). Del paquete del instalador (facturas, certificado y memoria RITE, fotos) a los cuatro documentos para firma: facturas por `POST /facturas/ocr` + `PUT` (las incidencias que propone se MIRAN, no se registran solas), RITE por `POST /rite/ocr`, placas por `POST /placas/ocr` en seco y luego `aplicar` con lo revisado, cedentes por el `PUT` del cliente (regla 114), fotos por `subirFicherosASlot`, CIFO y Anexo Fotográfico por sus generadores, y **el Anexo I y el Convenio pulsando «Generar» → «Guardar en Drive» en un Chrome sin pantalla** (los compone el navegador, como la propuesta). Herramienta: [scripts/justificar.js](implementation/backend/scripts/justificar.js) (`estado` solo lee; `fotos` y `anexos` en seco sin `--escribir`; **en seco `anexos` CORTA toda escritura de la página** —abrir Documentación genera sola el PDF único de facturas y la puerta del Convenio guarda su respuesta— salvo el render `POST /api/pdf/generate`, y la lista al final; la puerta «¿La obra está finalizada?» no se contesta «terminada» con una factura ANTICIPO/MATERIAL (regla 93), una certificación parcial o `--obra-en-curso`; `--obra-terminada` la fuerza); sesión del robot en [utils/sesionRobot.js](implementation/backend/utils/sesionRobot.js). **No pulsa ningún «Enviar»** y lo dudoso se pregunta UNA vez al final. Si el instalador no manda la Memoria RITE, la genera por la misma cadena que el botón (`/memoria-rite/check` → estancias confirmadas → `/memoria-rite/generate`, enlaces a `memoria_rite_*`, **nunca** a `cert_rite_drive_link`) para que se la mandemos con el CIFO; y el informe acaba con lo que falta POR PERSONA, con los WhatsApp en borrador (2026-10-22). Los selectores que usa `anexos` son los TEXTOS de la pantalla («Anexo I», «Anexo Cesión de Ahorro», «Generar», «Sí, la obra está terminada», «Todavía no, está en obra», `title="Guardar en Drive"`): no se cambian sin tocar el script. Tras tocarlo: `node implementation/backend/scripts/test_justificar_puerta.js`, `justificar.js estado <nº>` y `justificar.js anexos <nº>` en seco. Ver "JUSTIFICAR un expediente al terminar la obra".

144. **El ASISTENTE DENTRO DE LA APP solo LEE, va por la API y lo pesado se ENCARGA con un clic** (2026-10-19). Botón flotante ([AsistenteFlotante.jsx](implementation/frontend/src/features/asistente/AsistenteFlotante.jsx)) → [routes/asistenteApp.js](implementation/backend/routes/asistenteApp.js) (`adminOnly`) → [services/asistenteApp.js](implementation/backend/services/asistenteApp.js): Sonnet 5.5 por la API de Anthropic (`ANTHROPIC_API_KEY`; Opus hasta el 23/10: Sonnet contesta igual a la mitad, Haiku se equivoca), **no** con el token de la suscripción (`claude -p` tarda minutos y corre como root con todos los permisos: no se abre a una página web). Sus herramientas solo consultan (búsqueda, estado del expediente, radar del parte, pistas, resumen, partner, el manual `docs/conocimiento`). Generar o revisar un CEE, justificar, auditar, anexo fotográfico o CIFO se PROPONE y solo se hace si se pulsa «Encargar»: entonces va al Claude del WhatsApp por `pedirTarea` (`/tarea`), con un texto que compone el SERVIDOR de un catálogo cerrado (`TAREAS`) y tras volver a validar tarea y referencia. **Los botones van en el TEXTO** (líneas `>> …` que lee `leerMarcas`), no en herramientas: con Opus 5.5 lo escrito antes de una llamada a herramienta vuelve oculto y la respuesta se perdía. **Sabe qué hay abierto** (2026-10-22): el popup manda `pantalla = { tab, exp, cee, op }` desde `App.jsx`, el servidor la resuelve (`describirPantalla`) y la pone delante de la ÚLTIMA pregunta (no en las instrucciones cacheadas); una orden sin número («genera el CIFO») es de lo abierto y saca la tarjeta sin preguntar más, pero el clic en «Encargar» sigue siendo el «sí». Cada tarea lleva `incluye` (lo que hace su skill) y el modelo lo ve: lo que cubre `justificar` va en UNA tarjeta, nunca partido en `cee_final` + `otra`, y lo que falta lo contesta él por persona, sin encargarlo. Solo ADMIN hasta que cada herramienta filtre «lo suyo» (regla 102). En producción: `ANTHROPIC_API_KEY` en el `.env` del VPS y `./docs/conocimiento` montado en el backend (`CONOCIMIENTO_DIR`). Tras tocarlo: `node implementation/backend/scripts/auditar_rutas_sin_guardian.js`, `node implementation/frontend/scripts/check-hooks.mjs` y una pregunta de prueba en local. Ver "El ASISTENTE dentro de la app".

146. **«Preséntalo» por WhatsApp: el Claude del servidor PREGUNTA, el PC de Fran PRESENTA** (2026-10-19). El VPS no tiene CE3X, ni el certificado, ni el Chrome con AutoFirma y la tarjeta, así que [scripts/asistente_pc.js](implementation/backend/scripts/asistente_pc.js) reparte: en el VPS, `presentar <nº>` le hace a Fran UNA pregunta (expediente, titular, tasa, tarjeta) y `confirmar <nº> --texto "<su respuesta literal>"` deja el encargo en la cola (`scratch/asistente/tareas_pc.json`) con la pregunta y la respuesta, que son la autorización de firmar y de pagar (skill `presentar-cee`, 1b); sin pregunta previa no hay encargo. En el PC, la tarea programada «Brokergy Trabajos PC» ([pc_trabajos.vbs](tools/windows/pc_trabajos.vbs), cada 2 min, solo con sesión iniciada, `IgnoreNew`) da el latido y lanza `claude -p --chrome` (calificar con `cee_inicial.js listo`, firmar con `firmar_cee.js`, la skill entera) **con la sesión de claude.ai de Fran: la vuelta QUITA `ANTHROPIC_API_KEY` del entorno** (con ella Claude Code apaga Chrome y cobra a la API) y **elige el perfil BROKERGY** (`PC_CHROME_DEVICE`; hay dos navegadores conectados). La vuelta espera al trabajo (un `claude -p` desligado muere al salir quien lo lanzó) y el mensaje FINAL lo manda ella. Un encargo que falla no se reintenta solo. **También desde la app**: `TAREAS.presentar` (tarjeta = la misma pregunta, botón «Presentar y pagar») → `asistenteCanal.encargarAlPc` → `POST /pc` del vigilante → `encolarPresentacion`, la misma cola. **Y lo que necesita CE3X** (2026-10-22): `ce3x <nº> --trabajo cee_final|calificar --texto "<decisiones de Fran>"` lo deja en la misma cola en vez de pararse; es un catálogo cerrado (`TRABAJOS_CE3X`), las decisiones viajan como datos y en el PC va **SIN `--chrome`** (solo scripts: ni sede ni tarjeta). Claude Code tiene que estar instalado FUERA de la app de la Store (su `AppData\Roaming` es virtual). El PC, encendido, sin suspender y desbloqueado. Tras tocarlo: `asistente_pc.js probar --enviar` desde el PC y una `vuelta` en una terminal normal. Ver "«Preséntalo» por WhatsApp".

158. **Tras la ACEPTACIÓN, el agente revisa la documentación: pide lo que falta o hace el CEE inicial** (2026-10-22, decisión de Fran; huecos cerrados el 23/10). En la primera aceptación —por el enlace del cliente (`routes/public.js`) **o marcada por el equipo** (`PATCH /oportunidades/:id/estado`, sin acuse al cliente)—, sin CEE aportado y con `ACEPTACION_AGENTE_ENABLED=true`, se le encarga la revisión al Claude del WhatsApp (`aceptacionAgente.encargarTrasAceptacion` → `pedirTarea`, texto compuesto por el SERVIDOR) y, solo si el encargo entra, el acuse al cliente (WhatsApp y email) cambia la lista genérica por «revisaremos la documentación que ya tenemos y nos volveremos a poner en contacto para pedir lo que falte»; si no entra, sale la lista de siempre. El agente usa [scripts/aceptacion.js](implementation/backend/scripts/aceptacion.js): `estado` (solo lee) y `pedir --texto … [--slots …] --enviar`, **la ÚNICA excepción a la regla 113**: sale al cliente sin el «envíala» de Fran, con los topes en el script (ACEPTADA, sin CEE aportado, CEE inicial sin encargar, una vez por ronda, `MAX_RONDAS`) y con saludo, destinatario (el de la ficha), enlace y firma puestos por el script. `--a instalador` lo pide al contacto COMERCIAL del instalador. **Fuera de 9 a 21 h no sale: se programa** (`programado`) y lo manda la `vuelta` del servidor. Sin nada que pedir, `generar-cee-inicial`, **partiendo del borrador** si el Agente IA ya lo dejó en la oportunidad. Cuando llega lo pedido —por el enlace (`uploadNotifier`) o como fotos al WhatsApp (`alMensajeEntrante`, tras 10 min de silencio)— se vuelve a encargar la revisión (`retomar`, hasta 4 rondas). **Vigilante**: 24 h después de un encargo sin pedido ni CEE, aviso al chat de administración; el parte lo dice en «Aceptados y sin encargar» (`detalleAgente`). El estado, en `documentacion.aceptacion_agente` (CLAVES_PROTEGIDAS, RPC de merge); lo que está en marcha, en el índice `app_settings.aceptacion_agente_seguimiento` (nunca se busca por `documentacion`). Apagado en local. Tras tocarlo: `node implementation/backend/scripts/test_aceptacion_agente.js` y `auditar_rutas_sin_guardian.js`. Ver "Tras la ACEPTACIÓN, el agente revisa la documentación".

176. **La ronda de PRESENTAR de las 21:00: UN «sí» por noche para la lista entera, y un encargo por CEE** (2026-10-26, decisión de Fran). El pago no se da por autorizado de antemano: a las 21:00 (`PRESENTAR_NOCHE_HORA`) el vigilante (`mantenimiento`, una vez al día, con `PRESENTAR_NOCHE_ENABLED=true`; **apagado en local**) lanza `asistente_pc.js noche --enviar`, que le manda UNA pregunta con los CEE de la casa con visto bueno y sin registrar —la lista es la de `presentar_cee.js` (`listaPendientes`), menos lo que ya está en la cola, lo que tiene un encargo antiguo a otra persona y lo que `localizarCee` no deja— y **n × tasa = total**. Sin nada, calla. Con su respuesta, `confirmar --lote --texto "<literal>" [--excepto …]` encola cada CEE como un encargo PROPIO con la misma pregunta y respuesta (un «menos el …» sin `--excepto` se rechaza); «no» → `cancelar --lote`; sin respuesta no se paga nada y la de la noche siguiente la sustituye. En el PC, uno detrás de otro, cada uno con su aviso antes del 3DS; su prompt dice que es SOLO ese expediente y un pago, nunca el total. **Si uno no termina, los que quedan del lote NO se empiezan** (vuelven mañana) y, al acabar el último, llega el informe del lote con las tasas pagadas. Tras tocarlo: `node implementation/backend/scripts/test_presentar_noche.js` y `asistente_pc.js noche` en seco. Ver "La ronda de las 21:00".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/claude-automatizacion/el-asistente-de-fran-por-whatsapp-canal-siempre-abierto.md` — El ASISTENTE de Fran por WhatsApp — canal siempre abierto (2026-10-05) · 14,2 KB
- `docs/conocimiento/claude-automatizacion/el-asistente-dentro-de-la-app.md` — El ASISTENTE dentro de la app — botón flotante, API de Anthropic y encargos al Claude del WhatsApp (2026-10-19) · 12,7 KB
- `docs/conocimiento/claude-automatizacion/el-cee-inicial-por-la-api-banco-de-pruebas-y-coste.md` — El CEE inicial por la API de Claude: banco de pruebas y coste medido (2026-10-19) · 4,1 KB
- `docs/conocimiento/claude-automatizacion/justificar-un-expediente-al-terminar-la-obra.md` — JUSTIFICAR un expediente al terminar la obra — skill `justificar-expediente` (2026-10-08) · 9,1 KB
- `docs/conocimiento/claude-automatizacion/presentar-desde-el-whatsapp-con-el-pc.md` — «Preséntalo» por WhatsApp: el Claude del servidor pregunta, el PC de Fran presenta (2026-10-19) · 11,8 KB
- `docs/conocimiento/claude-automatizacion/tras-la-aceptacion-el-agente-revisa-y-pide-lo-que-falta.md` — Tras la ACEPTACIÓN, el agente revisa la documentación y pide lo que falta, o hace el CEE inicial (2026-10-22) · 9,8 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/claude-automatizacion/el-asistente-de-fran-por-whatsapp-canal-siempre-abierto.md`
  - **REGLA — con el WhatsApp caído, lo de la APP se atiende igual y nada de lo que se dice se pierde**
  - **REGLA — nada sale a un tercero sin el «envíala» de Fran para ESA oportunidad.**
  - **REGLA — el número de Fran va en el `.env` (`ASISTENTE_WHATSAPP_TEL`), nunca en el repo**
  - **REGLA — preparar no escribe; crear gasta número; enviar y emitir son «sí» distintos, cada uno a SU
documento.**
  - **REGLA — el Claude del WhatsApp trabaja con la SUSCRIPCIÓN, nunca con la clave de la API**
  - **REGLA — Node 22 ANTES de instalar Claude Code, y se actualiza con `--no-cache`**
  - **REGLA — el filtro VE las fotos**
  - **REGLA — Claude arranca FUERA del repo**
- `docs/conocimiento/claude-automatizacion/el-asistente-dentro-de-la-app.md`
  - **REGLA — el asistente de la app solo LEE; lo pesado se ENCARGA, y solo con un clic.**
  - **REGLA — el texto del encargo lo compone el SERVIDOR, de un catálogo cerrado**
  - **REGLA — los botones van en el TEXTO, no en herramientas.**
  - **REGLA — el asistente SABE QUÉ TIENES ABIERTO, y una orden sin número es de eso**
  - **REGLA — UNA tarjeta, la que lo hace todo; y lo que falta se CONTESTA, no se encarga**
  - **REGLA — solo ADMIN**
- `docs/conocimiento/claude-automatizacion/el-cee-inicial-por-la-api-banco-de-pruebas-y-coste.md`
  - **REGLA — el banco va EN SECO y A CIEGAS.**
  - **REGLA — esta skill, con OPUS y esfuerzo ALTO**
- `docs/conocimiento/claude-automatizacion/justificar-un-expediente-al-terminar-la-obra.md`
  - **REGLA — por la MISMA ruta que la pantalla, con la cuenta de CLAUDE.**
  - **REGLA — nada sale a terceros.**
  - **REGLA — lo dudoso se pregunta una vez, al final, con opciones.**
  - **REGLA — el CEE final de la justificación no se pregunta más que las fechas**
  - **REGLA — en seco la página no escribe NADA: se cortan sus peticiones.**
  - **REGLA — la puerta del Convenio no se contesta «terminada» solo por haber facturas**
  - **REGLA — si el instalador no manda la Memoria RITE, la generamos nosotros para que la presente**
  - **REGLA — el informe acaba con lo que falta, por persona.**
- `docs/conocimiento/claude-automatizacion/presentar-desde-el-whatsapp-con-el-pc.md`
  - **REGLA — UNA pregunta y al principio, y el «sí» viaja con el encargo.**
  - **REGLA — el PC trabaja con la sesión de claude.ai de Fran, nunca con una clave de API.**
  - **REGLA — la vuelta no suelta el trabajo.**
  - **REGLA — el mensaje final lo manda el script, no Claude.**
  - **REGLA — un trabajo con CE3X es de un CATÁLOGO cerrado y va SIN Chrome.**
  - **REGLA — el PC califica con SU motor, en el puerto de su `CEE_ENGINE_URL` (8093), no en el 8090.**
  - **REGLA — si un encargo del lote NO termina, los que quedan no se empiezan.**
- `docs/conocimiento/claude-automatizacion/tras-la-aceptacion-el-agente-revisa-y-pide-lo-que-falta.md`
  - **REGLA — `aceptacion.js pedir --enviar` es la ÚNICA cosa que el agente manda a un tercero sin el
«envíala» de Fran, y lleva sus topes.**
  - **REGLA — fuera de 9 a 21 h (Madrid) no se le escribe a nadie: se PROGRAMA.**
  - **REGLA — a quién: al CLIENTE por defecto, al INSTALADOR cuando lo tiene él**
  - **REGLA — el agente dice QUÉ falta; el saludo, el destinatario, el enlace y la firma los pone el
script.**
  - **REGLA — un encargo que se calla AVISA.**
  - **REGLA — el estado vive en `documentacion.aceptacion_agente` y es clave PROTEGIDA**
  - **REGLA — lo que está en marcha se busca en un ÍNDICE, no en `documentacion`.**

<!-- generado:fin -->
