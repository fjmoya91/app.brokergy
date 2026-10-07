---
paths:
  - "implementation/backend/scripts/{asistente_*,claude_propuesta}.*"
  - "implementation/asistente/**"
  - "implementation/backend/services/asistenteCanal.js"
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

103. **La LLAVE DE CLAUDE: una cuenta sin contraseña que pulsa los botones de la app** (2026-10-02). Para que Claude envíe una propuesta sin que nadie inicie sesión, [scripts/claude_propuesta.js](implementation/backend/scripts/claude_propuesta.js) abre un Chrome sin pantalla EN EL PC, entra en `app.brokergy.es` con la cuenta `robot.claude@app.brokergy.es` (rol ADMIN, para que la propuesta salga idéntica a la de una persona) y pulsa «Generar PDF» → ENVIAR → destinatarios → Enviar. **No se rehace la propuesta en el servidor a propósito**: la compone React midiendo la página (portada, versión, mensajes por persona) y una copia divergiría de la que ve una persona. La cuenta **no tiene contraseña utilizable** (aleatoria, no se guarda) y su dominio no tiene buzón; la sesión la abre el script con la clave de servicio del `.env` (enlace mágico canjeado por el propio servidor, sin email) y la **cierra al terminar**. Se reconoce por `app_metadata.robot` —que solo escribe el servidor; el `user_metadata` lo puede editar el propio usuario— y el historial firma lo suyo como «CLAUDE» (`req.user.esRobot`). **Por defecto va EN SECO**: enseña destinatarios, canales, avisos y el mensaje, con captura en `backend/scratch/claude_propuesta/` (fuera de git: lleva datos del cliente); solo con `--enviar` pulsa el botón. Si la simulación tiene cambios sin guardar **no envía** salvo `--sin-guardar`. Los elementos que pulsa llevan `data-robot` (`abrir-propuesta`, `aviso-sin-guardar`, `abrir-envio`, `modo-<MODO>`, `canal-*`, `mensaje`, `enviar`, `envio-resultado`): **no se quitan ni se renombran sin tocar el script**. Revocarla: `node scripts/claude_propuesta.js baja` (el backend la rechaza en ≤ 5 min, la caché de sesiones).

113. **Fran trabaja con Claude por WhatsApp, siempre abierto** (2026-10-05): escribe desde su móvil personal al de la empresa, el backend avisa al contenedor `asistente` (`services/asistenteCanal.js` → `scripts/asistente_vigia.js --servidor`) y Claude trabaja con las skills y le contesta por el mismo chat. Nada sale a un tercero sin su «envíala» para ESA oportunidad; su número solo en el `.env`; el contenedor usa el repo montado (solo lo commiteado) y no se reconstruye con un trabajo en marcha. Modo proactivo: si un instalador manda una petición y nadie le contesta, se le pregunta a Fran (lo filtra Gemini). Claude arranca fuera del repo para no cargar CLAUDE.md entero, con Sonnet por defecto. Ver "El ASISTENTE de Fran por WhatsApp".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/claude-automatizacion/el-asistente-de-fran-por-whatsapp-canal-siempre-abierto.md` — El ASISTENTE de Fran por WhatsApp — canal siempre abierto (2026-10-05) · 7,9 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/claude-automatizacion/el-asistente-de-fran-por-whatsapp-canal-siempre-abierto.md`
  - **REGLA — nada sale a un tercero sin el «envíala» de Fran para ESA oportunidad.**
  - **REGLA — el número de Fran va en el `.env` (`ASISTENTE_WHATSAPP_TEL`), nunca en el repo**
  - **REGLA — el filtro VE las fotos**
  - **REGLA — Claude arranca FUERA del repo**

<!-- generado:fin -->
