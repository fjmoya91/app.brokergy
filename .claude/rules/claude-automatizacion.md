---
paths:
  - "implementation/backend/scripts/{asistente_*,claude_propuesta,justificar}.*"
  - "implementation/backend/utils/sesionRobot.js"
  - "implementation/asistente/**"
  - "implementation/backend/services/asistenteCanal.js"
  - "implementation/backend/{services,routes}/asistenteApp.js"
  - "implementation/frontend/src/features/asistente/**"
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

113. **Fran trabaja con Claude por WhatsApp, siempre abierto** (2026-10-05): escribe desde su móvil personal al de la empresa, el backend avisa al contenedor `asistente` (`services/asistenteCanal.js` → `scripts/asistente_vigia.js --servidor`) y Claude trabaja con las skills y le contesta por el mismo chat. Nada sale a un tercero sin su «envíala» para ESA oportunidad; su número solo en el `.env`; el contenedor usa el repo montado (solo lo commiteado) y no se reconstruye con un trabajo en marcha. Modo proactivo: si un instalador manda una petición y nadie le contesta, se le pregunta a Fran (lo filtra Gemini). Claude arranca fuera del repo para no cargar CLAUDE.md entero, con Sonnet por defecto. Ver "El ASISTENTE de Fran por WhatsApp".

125. **Un expediente se JUSTIFICA al terminar la obra con la skill `justificar-expediente`, por las MISMAS rutas que la pantalla y con la cuenta de CLAUDE** (2026-10-08, caso 26RES060_178). Del paquete del instalador (facturas, certificado y memoria RITE, fotos) a los cuatro documentos para firma: facturas por `POST /facturas/ocr` + `PUT` (las incidencias que propone se MIRAN, no se registran solas), RITE por `POST /rite/ocr`, placas por `POST /placas/ocr` en seco y luego `aplicar` con lo revisado, cedentes por el `PUT` del cliente (regla 114), fotos por `subirFicherosASlot`, CIFO y Anexo Fotográfico por sus generadores, y **el Anexo I y el Convenio pulsando «Generar» → «Guardar en Drive» en un Chrome sin pantalla** (los compone el navegador, como la propuesta). Herramienta: [scripts/justificar.js](implementation/backend/scripts/justificar.js) (`estado` solo lee; `fotos` y `anexos` en seco sin `--escribir`; **en seco `anexos` CORTA toda escritura de la página** —abrir Documentación genera sola el PDF único de facturas y la puerta del Convenio guarda su respuesta— salvo el render `POST /api/pdf/generate`, y la lista al final; la puerta «¿La obra está finalizada?» no se contesta «terminada» con una factura ANTICIPO/MATERIAL (regla 93), una certificación parcial o `--obra-en-curso`; `--obra-terminada` la fuerza); sesión del robot en [utils/sesionRobot.js](implementation/backend/utils/sesionRobot.js). **No pulsa ningún «Enviar»** y lo dudoso se pregunta UNA vez al final. Los selectores que usa `anexos` son los TEXTOS de la pantalla («Anexo I», «Anexo Cesión de Ahorro», «Generar», «Sí, la obra está terminada», «Todavía no, está en obra», `title="Guardar en Drive"`): no se cambian sin tocar el script. Tras tocarlo: `node implementation/backend/scripts/test_justificar_puerta.js`, `justificar.js estado <nº>` y `justificar.js anexos <nº>` en seco. Ver "JUSTIFICAR un expediente al terminar la obra".

144. **El ASISTENTE DENTRO DE LA APP solo LEE, va por la API y lo pesado se ENCARGA con un clic** (2026-10-19). Botón flotante ([AsistenteFlotante.jsx](implementation/frontend/src/features/asistente/AsistenteFlotante.jsx)) → [routes/asistenteApp.js](implementation/backend/routes/asistenteApp.js) (`adminOnly`) → [services/asistenteApp.js](implementation/backend/services/asistenteApp.js): Opus 5.5 por la API de Anthropic (`ANTHROPIC_API_KEY`), **no** con el token de la suscripción (`claude -p` tarda minutos y corre como root con todos los permisos: no se abre a una página web). Sus herramientas solo consultan (búsqueda, estado del expediente, radar del parte, pistas, resumen, partner, el manual `docs/conocimiento`). Generar o revisar un CEE, justificar, auditar, anexo fotográfico o CIFO se PROPONE y solo se hace si se pulsa «Encargar»: entonces va al Claude del WhatsApp por `pedirTarea` (`/tarea`), con un texto que compone el SERVIDOR de un catálogo cerrado (`TAREAS`) y tras volver a validar tarea y referencia. **Los botones van en el TEXTO** (líneas `>> …` que lee `leerMarcas`), no en herramientas: con Opus 5.5 lo escrito antes de una llamada a herramienta vuelve oculto y la respuesta se perdía. Solo ADMIN hasta que cada herramienta filtre «lo suyo» (regla 102). En producción: `ANTHROPIC_API_KEY` en el `.env` del VPS y `./docs/conocimiento` montado en el backend (`CONOCIMIENTO_DIR`). Tras tocarlo: `node implementation/backend/scripts/auditar_rutas_sin_guardian.js`, `node implementation/frontend/scripts/check-hooks.mjs` y una pregunta de prueba en local. Ver "El ASISTENTE dentro de la app".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/claude-automatizacion/el-asistente-de-fran-por-whatsapp-canal-siempre-abierto.md` — El ASISTENTE de Fran por WhatsApp — canal siempre abierto (2026-10-05) · 8,2 KB
- `docs/conocimiento/claude-automatizacion/el-asistente-dentro-de-la-app.md` — El ASISTENTE dentro de la app — botón flotante, API de Anthropic y encargos al Claude del WhatsApp (2026-10-19) · 6,2 KB
- `docs/conocimiento/claude-automatizacion/justificar-un-expediente-al-terminar-la-obra.md` — JUSTIFICAR un expediente al terminar la obra — skill `justificar-expediente` (2026-10-08) · 7,6 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/claude-automatizacion/el-asistente-de-fran-por-whatsapp-canal-siempre-abierto.md`
  - **REGLA — nada sale a un tercero sin el «envíala» de Fran para ESA oportunidad.**
  - **REGLA — el número de Fran va en el `.env` (`ASISTENTE_WHATSAPP_TEL`), nunca en el repo**
  - **REGLA — el filtro VE las fotos**
  - **REGLA — Claude arranca FUERA del repo**
- `docs/conocimiento/claude-automatizacion/el-asistente-dentro-de-la-app.md`
  - **REGLA — el asistente de la app solo LEE; lo pesado se ENCARGA, y solo con un clic.**
  - **REGLA — el texto del encargo lo compone el SERVIDOR, de un catálogo cerrado**
  - **REGLA — los botones van en el TEXTO, no en herramientas.**
  - **REGLA — solo ADMIN**
- `docs/conocimiento/claude-automatizacion/justificar-un-expediente-al-terminar-la-obra.md`
  - **REGLA — por la MISMA ruta que la pantalla, con la cuenta de CLAUDE.**
  - **REGLA — nada sale a terceros.**
  - **REGLA — lo dudoso se pregunta una vez, al final, con opciones.**
  - **REGLA — el CEE final de la justificación no se pregunta más que las fechas**
  - **REGLA — en seco la página no escribe NADA: se cortan sus peticiones.**
  - **REGLA — la puerta del Convenio no se contesta «terminada» solo por haber facturas**

<!-- generado:fin -->
