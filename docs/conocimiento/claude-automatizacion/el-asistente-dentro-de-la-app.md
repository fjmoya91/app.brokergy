<!-- conocimiento · área: claude-automatizacion · las rutas de los enlaces son relativas a la raíz del repo -->

## El ASISTENTE dentro de la app — botón flotante, API de Anthropic y encargos al Claude del WhatsApp (2026-10-19)

Fran quería preguntarle a la app como a un compañero («¿cómo está el 208?», «¿qué tengo hoy?»), que
le llevara al expediente y que, si falta algo pesado («hazme el CEE inicial»), se lo pudiera pedir
ahí mismo. Es un botón flotante abajo a la derecha que abre un chat.

Su cara es la **mascota de la gota** («energía», la primera de las tres de marketing; 2026-10-21): el
botón es la gota misma, y la misma gota va en la cabecera del chat. El
original es un SVG de 720 KB que por dentro es un PNG (Drive: `02. MARKETING/…/01. IMAGENES/LOGOS/
BROKERGY_mascota_01_energia.svg`); a la app va **entera** (de la hoja a los pies), sin el fondo
blanco ni la sombra del suelo (quitados rellenando desde los bordes, para no vaciar el blanco de los
ojos), a 240 px de alto, WebP de 11 KB: `implementation/frontend/src/assets/mascota-gota.webp`,
**importada** y no en `public/` (nginx sirve lo estático con caché de un año «immutable»: con un
nombre fijo el navegador seguía pintando la primera versión, la cabeza con fondo blanco; importada,
Vite le pone una huella y cada imagen nueva es una URL nueva). **El
botón ES la mascota**, sola, sin fondo ni bocadillo, con una sombra para despegarla de la pantalla:
recortada a la cabeza se veía cortada, y metida en un bocadillo blanco quedaba diminuta (22/10/2026).
Las otras dos (aerotermia y casa) están en la misma carpeta por si se cambia. **Está animada** (`index.css`, `.mascota-saluda` / `.mascota-piensa`): cada
7 s da un saltito y se balancea girando desde los pies, como quien saluda (quieta el resto, para que
no distraiga); saluda al pasar el ratón y, mientras contesta con el chat cerrado, va dando botes. Con
«reducir movimiento» del sistema se queda quieta.

| Qué | Dónde |
|---|---|
| El popup (botón, chat, enlaces, tarjeta «Encargar») | [AsistenteFlotante.jsx](implementation/frontend/src/features/asistente/AsistenteFlotante.jsx), montado en `App.jsx` solo para ADMIN |
| Las rutas (`/estado`, `/pantalla`, `/preguntar`, `/encargo`), todas `adminOnly` | [routes/asistenteApp.js](implementation/backend/routes/asistenteApp.js) |
| El modelo, las herramientas, el manual y el encargo | [services/asistenteApp.js](implementation/backend/services/asistenteApp.js) |
| El paso al Claude del WhatsApp | `pedirTarea` y `estadoAsistente` de [asistenteCanal.js](implementation/backend/services/asistenteCanal.js) → `POST /tarea` del vigilante |

**Por qué por la API y no con el token de la suscripción** (el `CLAUDE_CODE_OAUTH_TOKEN` del Claude
del WhatsApp): `claude -p` arranca un Claude Code entero por pregunta (de 20 s a minutos), corre como
root con todos los permisos en el VPS —no se abre detrás de una página web— y la suscripción es
personal, mientras que la API vale para cualquiera del equipo. Va con `ANTHROPIC_API_KEY` (pago por
uso), **Sonnet 5.5** con esfuerzo bajo (`ASISTENTE_APP_MODELO`, `ASISTENTE_APP_ESFUERZO`) y el respaldo
automático de la API si el modelo declina (`fallbacks: "default"`).

**Por qué Sonnet y no Opus ni Haiku** (2026-10-24, para gastar lo mínimo): las mismas tres preguntas
(«¿qué tengo pendiente de revisar?», «¿cómo va el 190 y qué le pido a quién?», «justifica el 178»)
con los tres modelos. Opus ~0,05–0,07 $ por pregunta; **Sonnet ~0,03 $**, con respuestas igual de
buenas (enlaces, reparto por persona y la tarjeta de justificar); Haiku ~0,002 $, pero le atribuía al
instalador el envío de los anexos y se dejaba el enlace del expediente. Hasta el 23/10 iba con Opus.

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
Y un CEE que el Agente IA YA está haciendo (`cee.agente_ia[fase].estado = 'trabajando'`) no se
vuelve a encargar: `/encargo` responde 409 «ya se está preparando (desde las HH:MM)» —la cola del
vigilante solo junta lo que aún no ha cogido— y el modelo lo ve en `estado_expediente` y no lo propone.

**PRESENTAR no va al Claude del WhatsApp sino al PC de Fran** (`TAREAS.presentar`, `pc: true`): la
tarjeta es la pregunta del pago con el botón «Presentar y pagar», y el encargo va a la cola del PC por
el vigilante (`asistenteCanal.encargarAlPc` → `POST /pc`). Ver "«Preséntalo» por WhatsApp". Con un CEE
pendiente de revisión, el asistente avisa y ofrece «Preséntalo igualmente» antes de sacar la tarjeta.

**Lo que ve quien encarga es poco, a propósito** (decisión de Fran, 19/10/2026: «tampoco necesito
saber tanto»): al pulsar, «Se está preparando el CEE inicial de 26RES093_15. Te avisaremos por
WhatsApp cuando esté listo» (y «está terminando otro trabajo» si el vigilante estaba ocupado). Queda
guardado en el mensaje, así que al recargar no vuelve a ofrecer «Encargar».

**REGLA — un encargo de la app NO avisa por WhatsApp al empezar: un solo mensaje, al terminar**
(Fran, 24/10/2026: «no hace falta que me llegue un mensaje cuando se lo pido; sí cuando esté
completada»). Hasta entonces le llegaban hasta dos al pulsar «Encargar»: el acuse del vigilante
(«Me pongo con el CEE inicial de …», el `acuse` de cada tarea) y el «me pongo con ello» que el propio
Claude manda en las tareas largas. Ahora el vigilante solo manda acuse si hay mensajes de Fran en el
grupo (el `acuse` del encargo se ignora) y, cuando lo único que hay son tareas de la app, el prompt
le dice a Claude que no escriba al empezar ni a mitad. Vale para todo lo que entra por `/tarea`: el
asistente, el botón CE3X y el agente de la aceptación. Ojo: si el WhatsApp del servidor está caído (p. ej. justo tras un
despliegue, hasta que el vigilante de `whatsappService` lo reinicia), el vigilante del asistente NO
arranca nada —lee el grupo antes de atender la cola—; lo coge solo en cuanto vuelve (medido el
19/10: pedido a las 20:52, cogido a las 20:56, Agente IA en el expediente a las 20:57).

**REGLA — los botones van en el TEXTO, no en herramientas.** Con Opus 5.5 el texto que el modelo
escribe ANTES de llamar a una herramienta, a partir de la segunda vuelta, vuelve como nota de
progreso OCULTA. Con «sugerir respuestas» y «proponer encargo» como herramientas, «¿qué tengo
pendiente de revisar hoy?» acababa sin una sola línea de respuesta (medido el 19/10/2026). Ahora el
modelo termina la respuesta con líneas `>> opción | opción` y `>> ENCARGO <tarea> <referencia>`; el
servidor las lee al final (`leerMarcas`), valida los encargos y emite los botones, y el popup no
pinta las líneas `>>`. Como mucho dos tarjetas de encargo y cuatro respuestas rápidas.

**REGLA — el asistente SABE QUÉ TIENES ABIERTO, y una orden sin número es de eso** (2026-10-22).
Fran, con el 26RES060_221 en pantalla: «¿sabes en qué expediente estoy?» → «No, no sé qué pantalla
tienes abierta». Ahora `App.jsx` le pasa al popup `pantalla = { tab, exp, cee, op }` (los mismos ids que
`?exp=` / `?cee=` / `?op=`: `openExpedienteId`, `openCeeDirecto`, `openOportunidadId`), el popup la manda
en cada `/preguntar` y el servidor la resuelve (`describirPantalla`: número, cliente y estado; un id que
no existe = sin contexto) y la pone **delante de la última pregunta**, no en las instrucciones (van
cacheadas): «[La app te dice, no lo ha escrito él: tiene ABIERTO en pantalla el expediente …]». Con eso,
«genera el CIFO», «haz el CEE final», «termina / justifica el expediente» o «preséntalo» van a ESE, sin
preguntar si está seguro: mira `estado_expediente` y saca la tarjeta `>> ENCARGO` (si nombra otro
número, manda el que nombra). La cabecera del popup dice «Viendo 26RES060_221 · CLIENTE» (`GET
/pantalla`) y las sugerencias de inicio cambian a las del expediente. **El clic en «Encargar» sigue
siendo el «sí»**: lo que hace el trabajo es el Claude del WhatsApp, con la suscripción de Fran.
Medido el 22/10/2026 con 26RES060_221: «¿sabes en qué expediente estoy?» → lo nombra con su cliente y
estado (0,026 $); «genera el CIFO» → dice que está sin generar, qué más falta (CEE final fuera de plazo,
anexos) y la tarjeta `cifo 26RES060_221` (0,054 $).

**REGLA — UNA tarjeta, la que lo hace todo; y lo que falta se CONTESTA, no se encarga** (2026-10-22).
Con el 221 abierto, «Termina todo: CEE final, números de serie y equipos, genera el RITE y dime lo
que me falta para pedírselo al cliente o al instalador» salió como DOS tarjetas: «Generar el CEE
final» y una «Otra tarea» de texto libre con todo lo demás, y el CIFO y el anexo «en la siguiente».
Mal por tres lados: `justificar` ya hace todo eso; pulsando las dos, el CEE final podía calcularse
antes de corregir los equipos; y «lo que falta» lo tenía el propio asistente en segundos. Causa: el
catálogo solo le daba la ETIQUETA de cada tarea. Ahora cada `TAREAS[k]` lleva `incluye` (lo que
hace de verdad su skill) y las instrucciones lo listan, con dos reglas: una petición que cubre varias
cosas del cierre es UNA tarjeta `justificar` (las sueltas, solo cuando pide solo eso; `otra`, solo
para lo que ninguna cubre), y lo que falta se contesta en la misma respuesta con `estado_expediente`,
por persona, diciendo quién firma qué (cliente: Anexo I y Convenio; instalador: CIFO y el RITE;
certificador: el CEE final). Medido en el 221: una sola tarjeta `justificar`, lo que falta por
persona (0,068 $); «genera solo el CIFO» → la tarjeta del CIFO y el aviso de que los números de serie
aún no están (0,059 $). Lo que hace `justificar` al acabar (la Memoria RITE si el instalador no la
mandó y la lista por persona con sus WhatsApp en borrador): en "JUSTIFICAR un expediente".

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
