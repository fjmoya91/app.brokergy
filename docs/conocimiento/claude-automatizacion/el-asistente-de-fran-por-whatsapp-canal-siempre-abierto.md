<!-- conocimiento · área: claude-automatizacion · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El ASISTENTE de Fran por WhatsApp — canal siempre abierto (2026-10-05)

Fran le escribe (o manda audios) desde su móvil PERSONAL al WhatsApp de la EMPRESA y Claude trabaja
como un compañero más: da de alta oportunidades con lo que manda un instalador, hace los CEE con las
skills, contesta consultas… y le responde por el mismo chat. Sustituye al bot de clientes de la
etiqueta MOIA, que está **APAGADO en producción** (`BOT_WHATSAPP_ENABLED=false`): esa etiqueta marca
ahora el chat de Fran.

| Qué | Dónde |
|---|---|
| El timbre: avisa cuando escribe Fran | [services/asistenteCanal.js](implementation/backend/services/asistenteCanal.js) (`ASISTENTE_URL` en compose) |
| El vigilante: lee el chat, acusa recibo, lanza a Claude | [scripts/asistente_vigia.js](implementation/backend/scripts/asistente_vigia.js) `--servidor` |
| Lo que Claude sabe y no puede hacer | [scripts/asistente_instrucciones.md](implementation/backend/scripts/asistente_instrucciones.md) |
| Hablar con Fran (resumen de una OP, leer, decir) | [scripts/asistente_whatsapp.js](implementation/backend/scripts/asistente_whatsapp.js) |
| El contenedor | `implementation/asistente/` (Dockerfile + `arrancar.sh`) · servicio `asistente` en compose |

**EL CANAL ES UN GRUPO** (2026-10-06): «BROKERGY - CHAT» (`ASISTENTE_WHATSAPP_GRUPO`), donde están Fran
y el WhatsApp de la empresa. **Solo cuentan los mensajes de Fran**: el backend toca el timbre solo si el
AUTOR del mensaje del grupo es él (su `@c.us` o su `@lid`; `ASISTENTE_WHATSAPP_LID` lo siembra y el
backend manda el id con cada aviso), y el vigilante filtra por autor al leer el grupo. Lo que escriba
otro miembro es contexto, nunca una orden. Su chat 1:1 con la empresa vuelve a ser un chat normal. Sin
la variable, el canal sería el 1:1, como al principio.

**Cómo va:** el backend reconoce el chat de Fran (resuelve su `@lid` UNA vez) y hace `POST
http://asistente:8091/aviso`. El vigilante espera 20 s de silencio (la ráfaga entera), contesta
«Recibido, me pongo con ello», transcribe audios, baja fotos y lanza `claude -p --permission-mode
bypassPermissions` en el repo con las instrucciones + lo último del chat. Claude contesta él mismo
con `asistente_whatsapp.js decir`; si acaba sin hacerlo, el vigilante le manda el final de la salida.
Repaso de respaldo cada 2 min. Un trabajo cada vez, tope de 120 min. Registros en
`backend/scratch/asistente/log/`.

**Tareas que pide la APP** (`POST /tarea`, `asistenteCanal.pedirTarea`): se atienden como si Fran las
hubiera escrito. Hoy, «Así es como está» en la pizarra de la envolvente y los ENCARGOS del asistente
de la app (botón «Encargar»); ver "El ASISTENTE dentro de la app". `GET /estado` dice si está
trabajando y si el PC de Fran está vivo (`pc`, su latido); `POST /pc` mete en la cola del PC una
presentación confirmada en la app (ver "«Preséntalo» por WhatsApp").

**REGLA — con el WhatsApp caído, lo de la APP se atiende igual y nada de lo que se dice se pierde**
(2026-10-19). Antes, si el vigilante no podía leer el grupo (tras cada despliegue, unos minutos) no
atendía NADA, tampoco los encargos de la app: el CEE de 26RES093_15 esperó 4 minutos en la cola. Ahora
lee el chat si puede; si no y hay tareas de la app, trabaja sin el chat y se lo dice a Claude en el
prompt. Y TODO lo que se le dice a Fran (el acuse, el final, los recordatorios, el `decir` de Claude, el
mensaje final del PC) pasa por el **buzón de salida** (`mandarOGuardar` de
[asistente_whatsapp.js](implementation/backend/scripts/asistente_whatsapp.js)): si no sale, se guarda en
`scratch/asistente/por_enviar.json` y `vaciarBuzon` lo manda en cuanto vuelve, en orden y con «(con
retraso: era de las HH:MM)». Cada máquina tiene el suyo (VPS y PC) y lo vacía en cada vuelta.

**REGLA — nada sale a un tercero sin el «envíala» de Fran para ESA oportunidad.** Tras un alta se le
manda el resumen (`avisar`) y se espera; «la reviso yo» deja la OP en PTE ENVIAR. Enviar es
`claude_propuesta.js` (la llave de Claude, regla 103). Tampoco despliega, ni hace push, ni borra.

**REGLA — el número de Fran va en el `.env` (`ASISTENTE_WHATSAPP_TEL`), nunca en el repo**, que es
público. Sin él, ni el timbre ni el vigilante arrancan.

**PRESUPUESTOS Y FACTURAS desde el grupo** (2026-10-24). Fran dicta «presupuesto a Juan Pérez, CEE
más legalización de placas, vivienda» y sale en el momento. El asistente usa
[scripts/facturacion_cli.js](implementation/backend/scripts/facturacion_cli.js), **no el MCP**: el Claude
del contenedor no tiene el conector de claude.ai, y un CLI se prueba en seco desde la terminal. Va por
la MISMA API que la pestaña Facturación (`/api/facturacion`, `x-internal-key`), importa el cálculo de
`logic/presupuesto.js` y `logic/factura.js` (regla 165/166) y copia el criterio del MCP para casar lo
dictado con el catálogo (sinónimos «placas» → FV, «casa» → vivienda; nunca elige entre empatados). Los
clientes los lee de Supabase como el MCP: no hay ruta de clientes con clave interna. Órdenes, el formato
del JSON y el paso a paso: la sección «PRESUPUESTOS Y FACTURAS» de
[asistente_instrucciones.md](implementation/backend/scripts/asistente_instrucciones.md).

**REGLA — preparar no escribe; crear gasta número; enviar y emitir son «sí» distintos, cada uno a SU
documento.** `presupuesto preparar` / `factura preparar` van en seco (un BORRADOR de presupuesto ya
consume el siguiente `P-26ING_n`, así que se prepara antes y los cambios van con `presupuesto cambiar`,
mismo número). `crear --a-fran` le manda al grupo el borrador ENTERO (partidas, total, a quién y por
dónde, el mensaje que recibiría el cliente), el PDF y la pregunta. `enviar … --enviar` y `factura emitir
… --emitir` exigen que ESE texto (o esa revisión, con el nº que le tocará) se haya sacado en las últimas
24 h y `--si "<respuesta literal de Fran>"`; cada uno queda en `scratch/asistente/facturacion/
registro.jsonl`. Un artículo a 0 € o una partida fuera del catálogo sin precio dicho por Fran PARA la
línea: el asistente pregunta, no pone un precio. Teléfonos, emails y NIF salen enmascarados.

**El PDF al grupo**: `asistente_whatsapp.js enviar-fichero` (texto, fichero y la pregunta detrás) por
`/api/whatsapp/send-media`, que ya admitía el id del grupo. También pasa por el **buzón**: con el
WhatsApp caído se guarda la RUTA del fichero y `vaciarBuzon` lo manda al volver; si lo que falla no es
la conexión (pudo salir el texto), no se guarda, para no duplicarlo.

**¿Un grupo aparte para facturación? No: el mismo «BROKERGY - CHAT».** El timbre y el vigilante
escuchan UN grupo (`ASISTENTE_WHATSAPP_GRUPO`); otro grupo pediría tocar `asistenteCanal`,
`asistente_vigia` y `asistente_whatsapp` y llevar dos lecturas de chat, dos buzones y dos contextos.
El «sí» tiene que leerse en el chat que el asistente lee con el borrador delante, y trabaja de uno en
uno igualmente. Meter a más gente no ayuda: solo cuentan los mensajes de Fran. Si una gestoría tiene
que recibir las facturas, se le mandan por email desde la app, no por un grupo. Se revisa solo si el
volumen ensucia el chat.

**El contenedor** se construye SOBRE `brokergy-backend` (Node, Chrome, `/app/node_modules`) con Claude
Code, **Node 22** copiado de `node:22-slim` (`alta_oportunidad.js` usa `registerHooks`), Pillow y
fuentes (plano del CEE) y `chrome-nosandbox` (Chrome como root). El repo va **montado** en `/repo`:
un `git pull` le cambia scripts, skills e instrucciones sin reconstruir — y por eso usa SOLO lo
commiteado. `deploy.sh` no lo reconstruye: `docker compose build asistente && docker compose up -d
asistente` (tras construir el backend). Claude se autentica con `CLAUDE_CODE_OAUTH_TOKEN` del `.env`
(de `claude setup-token`, un año); `IS_SANDBOX=1` le deja saltarse permisos como root.

**REGLA — el Claude del WhatsApp trabaja con la SUSCRIPCIÓN, nunca con la clave de la API**
(2026-10-24). El contenedor carga el `.env` del backend, que desde el 19/10 lleva `ANTHROPIC_API_KEY`
para el asistente de la app, y con esa clave en el entorno `claude -p` la usa antes que el
`CLAUDE_CODE_OAUTH_TOKEN`: medido el 22-23/10/2026, siete trabajos (dos CEE finales y un justificar
encargados desde la app, y cuatro del agente de la aceptación) salieron en la consola de Anthropic
como Opus 5.5 / Sonnet 5.5, ~4,6 $ que debían ir a la suscripción. `lanzarClaude` le quita
`ANTHROPIC_API_KEY` y `ANTHROPIC_AUTH_TOKEN` (`entornoClaude`), igual que `asistente_pc.js` en el PC.
Comprobado en el contenedor: sin la clave, `claude -p` contesta con el token de la suscripción.

**REGLA — Node 22 ANTES de instalar Claude Code, y se actualiza con `--no-cache`** (2026-10-19). Claude
Code exige Node ≥ 22 y el Dockerfile lo instalaba con el Node 20 de la imagen del backend: npm se quedaba
con la última versión COMPATIBLE (la 2.1.197, que trabajaba con Opus 4.8) aunque la publicada era la
2.1.303. Con el orden arreglado, `docker compose build --no-cache asistente && docker compose up -d
asistente` (con el asistente libre) deja la última; medido: 2.1.303 y los alias `opus`/`sonnet` ya
responden con Opus 5.5 / Sonnet 5.5.

⚠️ **Antes de reconstruir o reiniciar `asistente`, mira `docker logs brokergy-asistente`**: un trabajo
en marcha se corta y su mensaje ya consta como atendido. Para relanzarlo: en `vigia.json` restar 1 a
`visto`, quitar el último id de `atendidos` y `POST /aviso` con `x-internal-key`.

⚠️ **En el servidor no hay CE3X**: los CEE salen como `.cex`; el `.xml` y el PDF de calificación
(`cexAPdf`) solo en un PC con CE3X 3.1.

**MODO PROACTIVO** ([scripts/asistente_proactivo.js](implementation/backend/scripts/asistente_proactivo.js)):
el backend pasa también el `chatId` de cada mensaje entrante de los DEMÁS chats (`/entrante`, sin
leer nada). Cuando el chat de un INSTALADOR (teléfono en `prescriptores`) lleva 10 min callado y lo
último es SUYO, se lee una vez y **Gemini** —no Claude, céntimos— mira texto, fotos y PDF: si es una
petición de simulación, a Fran le llega «*P3 · Nueva petición de X* … ¿La doy de alta?». Con «sí» la
da de alta Claude (`resolver P3 hecho`); con «no», `descartado`. Un chat que no es de un partner no se
llega a leer. Horario 08:00–21:00 Madrid, tope de 6 avisos por hora, `ASISTENTE_PROACTIVO=false` lo
apaga. **REGLA — el filtro VE las fotos**: solo con el texto decía que faltaba la RC (venía en una
captura) y juntaba dos obras en una (medido con las OP269/OP270 de Federico).

**REGLA — Claude arranca FUERA del repo** (`--add-dir /repo`, cwd en un temporal): desde dentro carga
entero `CLAUDE.md` (1,1 MB) en cada trabajo — medido: 514.000 tokens un «contesta ok», 31.000 desde
fuera. Las instrucciones le dicen que busque en `CLAUDE.md` con grep, nunca leerlo entero.

**Modelo y consumo:** Sonnet por defecto (`ASISTENTE_MODELO`); **un CEE va con Opus**
(`ASISTENTE_MODELO_CEE`: el mensaje habla de CEE, `.cex`, CE3X o envolvente); «con opus» / «con
sonnet» / «con haiku» en el mensaje manda sobre todo.

**MEMORIA, en tres capas y sin reabrir sesiones** (2026-10-05). No se usa `--resume`: tras un CEE
recargaría cientos de miles de tokens para contestar a un «vale».
- **Cuaderno** (`scratch/asistente/cuaderno.md`, máx. 8 KB): Pendiente · Recordatorios · Hecho reciente.
  Entra en cada trabajo y Claude lo reescribe al terminar. Los **recordatorios** (`- [AAAA-MM-DD HH:MM]
  texto`) y el **repaso de las 9:00** (lo «Pendiente») los manda el vigilante **sin Claude**.
- **Memoria de largo plazo**: la NATIVA de Claude Code en `/root/.claude/projects/-tmp-asistente-trabajo/
  memory` (la carga sola por arrancar en esa carpeta), copia de la del PC de Fran.
  [scripts/asistente_memoria.js](implementation/backend/scripts/asistente_memoria.js) `sincronizar` la
  lleva y la trae por ssh —**nunca por git: tiene datos de clientes**— cada 3 h (tarea programada
  «Brokergy Memoria Asistente» → `tools/windows/asistente_memoria.vbs`). Lo que aprende por WhatsApp va
  como `asistente_<tema>.md` y vuelve al PC; todo lo demás manda el PC.
- **El chat**: los últimos 20 mensajes, como antes.

**Topes**: 40 trabajos/día (`ASISTENTE_MAX_TRABAJOS_DIA`), `--max-budget-usd` por trabajo (8, o 40 en
un CEE), `--fallback-model sonnet` si Opus está saturado, `--no-session-persistence` (los historiales de
sesión ocupaban megas) y limpieza de registros de más de 30 días. Medido: arrancar un trabajo con la
memoria cargada, ~44.000 tokens. Nada de esto toca Supabase.

**Las skills del repo se REGISTRAN como skills del Claude del servidor** (`registrarSkills`, antes de
cada trabajo): `$CLAUDE_CONFIG_DIR/skills/<nombre>` con enlaces a `/repo/skills/<nombre>` y `comun` →
`skills/_comun`. Las carga con su herramienta Skill igual que en el PC, y una skill nueva o cambiada
llega con el `git pull`, sin reiniciar nada. Cada trabajo apunta modelo, tokens y coste equivalente en
`scratch/asistente/consumo.jsonl`, y «consumo» se lo resume a Fran sin lanzar a Claude. El token es de
la SUSCRIPCIÓN de Fran: no se cobra aparte, **cuenta para sus límites de uso** (los de 5 h y semanal,
los mismos que su Claude Code). Las transcripciones y el filtro proactivo van por Gemini, aparte.

**Meta no lee el contenido** (cifrado de extremo a extremo): lo que ve son patrones de uso, y este
canal es un chat 1:1 de poco volumen. Los mensajes van sin firmas ni emojis de robot. El riesgo real
sigue siendo el de siempre: la cuenta va con un cliente no oficial (whatsapp-web.js).
