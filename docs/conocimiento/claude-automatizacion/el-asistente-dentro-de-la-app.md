<!-- conocimiento · área: claude-automatizacion · las rutas de los enlaces son relativas a la raíz del repo -->

## El ASISTENTE dentro de la app — botón flotante, API de Anthropic y encargos al Claude del WhatsApp (2026-10-19)

Fran quería preguntarle a la app como a un compañero («¿cómo está el 208?», «¿qué tengo hoy?»), que
le llevara al expediente y que, si falta algo pesado («hazme el CEE inicial»), se lo pudiera pedir
ahí mismo. Es un botón flotante abajo a la derecha que abre un chat.

| Qué | Dónde |
|---|---|
| El popup (botón, chat, enlaces, tarjeta «Encargar») | [AsistenteFlotante.jsx](implementation/frontend/src/features/asistente/AsistenteFlotante.jsx), montado en `App.jsx` solo para ADMIN |
| Las rutas (`/estado`, `/preguntar`, `/encargo`), todas `adminOnly` | [routes/asistenteApp.js](implementation/backend/routes/asistenteApp.js) |
| El modelo, las herramientas, el manual y el encargo | [services/asistenteApp.js](implementation/backend/services/asistenteApp.js) |
| El paso al Claude del WhatsApp | `pedirTarea` y `estadoAsistente` de [asistenteCanal.js](implementation/backend/services/asistenteCanal.js) → `POST /tarea` del vigilante |

**Por qué por la API y no con el token de la suscripción** (el `CLAUDE_CODE_OAUTH_TOKEN` del Claude
del WhatsApp): `claude -p` arranca un Claude Code entero por pregunta (de 20 s a minutos), corre como
root con todos los permisos en el VPS —no se abre detrás de una página web— y la suscripción es
personal, mientras que la API vale para cualquiera del equipo. Va con `ANTHROPIC_API_KEY` (pago por
uso), Opus 5.5 con esfuerzo bajo (`ASISTENTE_APP_MODELO`, `ASISTENTE_APP_ESFUERZO`) y el respaldo
automático de la API si el modelo declina (`fallbacks: "default"`).

**REGLA — el asistente de la app solo LEE; lo pesado se ENCARGA, y solo con un clic.** Sus
herramientas consultan: `buscar` (número o nombre; expedientes, oportunidades y CEE directos),
`estado_expediente` (estado, ciclo de vida, pistas, su línea en el parte, incidencias, historial y
el MATERIAL para el CEE inicial con `materialCee`, el mismo criterio que el parte),
`pendientes` (el radar del parte diario, `seguimientoRadar.escanear`, cacheado 60 s), `que_falta`
(`v_expedientes_pistas`), `resumen`, `por_partner`, `consultar_manual` (búsqueda por palabras en
`docs/conocimiento`, troceado por apartados) y `estado_del_asistente`. Generar un CEE, revisarlo,
justificar o auditar un expediente, el anexo fotográfico o el CIFO lo propone, y al pulsar
«Encargar» se le pasa al Claude del WhatsApp por el mismo `/tarea` que la pizarra de la envolvente:
trabaja con la suscripción de Fran (cuenta para sus límites), queda a nombre del «Agente IA» si es
un CEE y contesta por el grupo «BROKERGY - CHAT». Ese clic pasa por el `SendActionOverlay`.

**REGLA — el texto del encargo lo compone el SERVIDOR, de un catálogo cerrado** (`TAREAS`:
`cee_inicial`, `cee_final`, `revisar_cee`, `justificar`, `auditar`, `anexo_fotografico`, `cifo` y
`otra` con indicaciones). La ruta `/encargo` vuelve a validar la tarea y la referencia (que exista
el expediente, la OP o el CEE): no se da por bueno lo que propuso el modelo solo porque llegue del
popup. La misma tarea sobre la misma referencia pedida dos veces se queda con la última (la `clave`).

**REGLA — los botones van en el TEXTO, no en herramientas.** Con Opus 5.5 el texto que el modelo
escribe ANTES de llamar a una herramienta, a partir de la segunda vuelta, vuelve como nota de
progreso OCULTA. Con «sugerir respuestas» y «proponer encargo» como herramientas, «¿qué tengo
pendiente de revisar hoy?» acababa sin una sola línea de respuesta (medido el 19/10/2026). Ahora el
modelo termina la respuesta con líneas `>> opción | opción` y `>> ENCARGO <tarea> <referencia>`; el
servidor las lee al final (`leerMarcas`), valida los encargos y emite los botones, y el popup no
pinta las líneas `>>`. Como mucho dos tarjetas de encargo y cuatro respuestas rápidas.

**REGLA — solo ADMIN** (ruta `adminOnly` y botón solo con `isAdmin`): contesta con datos de TODA la
cartera, sin el filtro de «lo suyo» que exige un partner (regla 102), y el botón «Encargar» gasta de
la suscripción de Fran. Abrirlo a TRABAJADOR o a partners es otro paso, herramienta a herramienta.

**Cómo viaja:** el navegador guarda la conversación (sessionStorage) y manda en cada pregunta SOLO el
texto de los mensajes; la respuesta vuelve en NDJSON según se escribe (`paso` «Mirando el
expediente…», `texto`, `encargo`, `sugerencias`, `fin` con tokens y coste). `Cache-Control:
no-transform` para que `compression` no la retenga y `X-Accel-Buffering: no` para nginx. Si se
cierra el popup a mitad, se corta la llamada a la API. Los enlaces van como `[26RES060_208](?exp=…)`,
`?op=` y `?cee=`, los mismos parámetros que los deep-links, y se abren DENTRO de la app
(`abrirDesdeAsistente` en `App.jsx`, que remonta la vista con el nonce). Consumo de cada pregunta en
`backend/scratch/asistente-app/consumo.jsonl`. La caja de texto lleva `case-sensitive`: `index.css`
pone en mayúsculas TODO `textarea` y la pregunta se leía a gritos.

En LOCAL el botón «Encargar» sale desactivado y lo dice: no hay `ASISTENTE_URL`, porque el
contenedor del Claude del WhatsApp solo escucha dentro de la red de docker del VPS (el 8091 no se
publica). No es una avería.

**Lo medido** (19/10/2026, Opus 5.5 esfuerzo bajo, en local contra producción): «¿cómo está el
26RES093_15?» → 10 s y 0,04 $ (2-3 llamadas al modelo); «¿qué tengo pendiente de revisar hoy?» →
15 s y 0,045 $; «¿qué más hay sin encargar?» → 0,03 $. El prefijo cacheado (instrucciones +
herramientas) son ~3.700 tokens.

**Para producción:** `ANTHROPIC_API_KEY` en el `.env` del VPS (sin ella el popup lo dice y no
contesta), y el `docker-compose.yml` monta `./docs/conocimiento` de solo lectura en el backend
(`CONOCIMIENTO_DIR=/conocimiento`): la imagen se construye desde `./implementation` y no lo lleva.
`deploy.sh` ya recrea el backend con eso.

**Tras tocarlo:** `node implementation/backend/scripts/auditar_rutas_sin_guardian.js`, el control de
hooks del frontend (`node implementation/frontend/scripts/check-hooks.mjs`) y una pregunta de prueba
en local (`backend-alt` + `frontend-alt`, con la sesión de la cuenta de Claude, regla 103).
