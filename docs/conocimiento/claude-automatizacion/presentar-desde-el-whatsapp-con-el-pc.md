<!-- conocimiento · área: claude-automatizacion · las rutas de los enlaces son relativas a la raíz del repo -->

## «Preséntalo» por WhatsApp: el Claude del servidor pregunta, el PC de Fran presenta (2026-10-19)

Fran quería que, cuando el Claude del WhatsApp le avisa de que un CEE está listo, bastara con contestar
**«preséntalo»**. Pero presentar un CEE necesita tres cosas que el servidor no tiene y su PC sí:
**CE3X** (calificar: el `.xml` y el PDF oficiales), **su certificado** (firmar) y **su Chrome** con
AutoFirma y la tarjeta (la sede de la JCCM). Así que el trabajo se reparte:

| Quién | Qué | Dónde |
|---|---|---|
| Claude del WhatsApp (VPS) | Con «preséntalo», LA pregunta del pago; con el «sí», el encargo a la cola | `scripts/asistente_pc.js presentar` / `confirmar` |
| La cola | Preguntas pendientes, encargos y el latido del PC (fuera de git) | VPS `backend/scratch/asistente/{presentar_pendiente,tareas_pc,pc_latido}.json` |
| Tarea programada «Brokergy Trabajos PC» (cada 2 min) | Latido al VPS; recoge el encargo y lanza Claude Code SIN PANTALLA | [tools/windows/pc_trabajos.vbs](tools/windows/pc_trabajos.vbs) → `asistente_pc.js vuelta` |
| Claude Code en el PC (`claude -p --chrome`) | `cee_inicial.js listo` → `firmar_cee.js` → skill `presentar-cee` entera | el prompt de `promptPresentar` |

**También desde la APP** (2026-10-19): en el asistente de la app, `>> ENCARGO presentar <nº>` saca una
tarjeta que ES la misma pregunta (`preguntaPresentar`) con el botón «Presentar y pagar 16,39 €»; el clic
es la respuesta («Ha pulsado “Presentar y pagar” en esa misma pregunta… (usuario, hora)»), y el backend
la manda al vigilante (`POST /pc`), que la mete en la misma cola con `encolarPresentacion` y avisa a
Fran por WhatsApp. El backend no ve la cola (vive en el contenedor «asistente»): por eso pasa por ahí.
La tarjeta no sale si el CEE está registrado o el Agente IA aún lo está haciendo (`localizarCee`).

**REGLA — UNA pregunta y al principio, y el «sí» viaja con el encargo.** «Preséntalo» no es todavía la
autorización: `presentar` le manda «¿Presento el CEE inicial de 26RES093_15 (titular)? Lo doy por bueno,
en tu PC lo califico en CE3X, lo firmo y pago la tasa de 16,39 € con la Mastercard … Tú solo tendrás que
autorizar el pago en la app del banco». Con su respuesta, `confirmar --texto "<literal>"` crea el encargo,
que lleva la pregunta y la respuesta tal cual: es el «doy por válido» para firmar y el «sí» al pago del
apartado 1b de la skill `presentar-cee` (expediente + importe). Sin pregunta previa (o de hace más de
24 h) no hay encargo. El vigilante del asistente solo deja pasar mensajes cuyo AUTOR es Fran.

**REGLA — el PC trabaja con la sesión de claude.ai de Fran, nunca con una clave de API.** Con
`ANTHROPIC_API_KEY` en el entorno, Claude Code deja la cuenta, **apaga Chrome** y cobra a la API
(medido: el trabajo arrancó con un solo servidor MCP y sin herramientas de Chrome). La vuelta carga el
`.env` del backend —que lleva esa clave para el asistente de la app— y se la QUITA al lanzar Claude.
Y Claude Code tiene que estar instalado FUERA de la app de la Store (`npm install -g
@anthropic-ai/claude-code` desde una terminal normal, y `claude auth login`): lo que instala la app de
escritorio vive en su `AppData\Roaming` virtualizado y la tarea programada no lo ve.

**REGLA — la vuelta no suelta el trabajo.** Lo lanza y lo espera, con el latido cada minuto, hasta que
acaba; la tarea programada no arranca otra mientras tanto (`MultipleInstances = IgnoreNew`). Un `claude
-p` lanzado «desligado» moría sin escribir una línea en cuanto salía el proceso que lo lanzó, pasara el
prompt por tubería o por fichero (medido el 19/10/2026). El prompt entra por un FICHERO (stdin).

**REGLA — el mensaje final lo manda el script, no Claude.** Claude solo escribe por WhatsApp al empezar,
cuando toca autorizar el 3DS y si algo le para; su respuesta final la manda `terminar` («PC · presentar
26RES093_15 …»), así que si el trabajo se corta Fran se entera igual. Un encargo que falla NO se
reintenta solo: puede haber una tasa pagada (la skill explica cómo rehacer la solicitud con la 046).

**Qué se comprobó antes de montarlo (19/10/2026), sin presentar ni pagar nada:** un `claude -p --chrome`
lanzado como lo hará la tarea programada **tiene las herramientas de Claude en Chrome**; hay dos
navegadores conectados a la cuenta (los perfiles «BROKERGY» y «Francisco Javier» de Chrome) y, sin nadie
delante, hay que elegir: `select_browser` con el del perfil **BROKERGY** (`PC_CHROME_DEVICE`), el de la
tarjeta. Se **identificó en la sede** con el certificado (el vigilante de AutoFirma aceptó la ventana
NSS solo) y paró en «Realizar Solicitud». Calificar (`ce3xpy.exe`, `xml2cert.exe`) y firmar (certificado
por huella) son de línea de órdenes y no necesitan pantalla. La vuelta completa (cola → PC → WhatsApp)
se probó con un encargo de **prueba** (`asistente_pc.js probar`): 37 s.

**Lo que tiene que cumplir el PC:** encendido, **sin suspender** (enchufado se suspendía a la hora sin
uso: «Suspender: nunca» con el cargador, la pantalla sí se puede apagar) y **desbloqueado** (con la
pantalla de bloqueo no hay AutoFirma ni clic «real»; la vuelta lo detecta por `LogonUI.exe`, no lanza
nada y el latido lo dice). Si el PC no da latido en 5 min, el Claude del WhatsApp se lo dice a Fran al
preguntarle y al confirmar, y el encargo espera en la cola. Chrome: la vuelta abre una ventana del perfil
BROKERGY antes de lanzar, para que la extensión esté conectada.

### Los trabajos con CE3X también van a la cola del PC (2026-10-22)

El Claude del WhatsApp se paraba en el CEE final («aquí no hay CE3X… en tu PC sería `node
scripts/cee_final_copiando.js …`»), porque el final de un RES060 se califica DOS veces con CE3X (la
segunda, con el autoconsumo mes a mes sacado del XML de la primera). Contestarle no servía de nada.
Ahora lo deja en la MISMA cola: `asistente_pc.js ce3x <nº> --trabajo cee_final|calificar [--fase final]
[--fecha AAAA-MM-DD] --texto "<lo que ha decidido Fran>" --enviar`, y la vuelta del PC lo lanza.

**REGLA — un trabajo con CE3X es de un CATÁLOGO cerrado y va SIN Chrome.** `TRABAJOS_CE3X` (hoy
`cee_final` y `calificar`) dice qué pasos se le piden al Claude del PC; las decisiones de Fran
(hibridación, ACS, depósito, fechas) viajan como DATOS en `indicaciones`, no como órdenes libres. No
paga ni firma, así que no lleva pregunta, pero tampoco `--chrome` ni sus herramientas: con solo
scripts, la sede y la tarjeta quedan fuera de su alcance. Lo que no esté en sus decisiones y cambie el
resultado, el PC no lo decide: para y se lo pregunta en su respuesta final. No se encarga un RES080
(su final no tiene comando único) ni un CEE ya REGISTRADO (`comprobarNumero`, que a diferencia de
`localizarCee` no para por el Agente IA «trabajando»: es justo quien lo encarga). Sin `--fecha`, la de
hoy. Un trabajo que falla no se reintenta solo («cuando lo mires, pídemelo otra vez»).

**`calificar_ext`: calificar el CEE de una obra de la app de certificadores, sin Claude**
(2026-10-25). El agente del VPS deja el `.cex` de una obra `{año}EXT_{n}` por calificar y la app lo
encarga sola (`/pc-calificar` → `encolarCalificarExt`, deduplicada). La vuelta del PC levanta el motor
si hace falta (`asegurarMotor`: uvicorn en el 8090, hasta 90 s) y lanza `node scripts/cee_inicial.js
calificar <nº> --escribir`: no hay nada que decidir, así que va sin Claude y sin Chrome. Al terminar,
`cee_inicial.js` avisa a producción (`/api/certapp-admin/interno/calificada`) e imprime
`@@CALIFICADA_OK <nº>`; **sin esa marca la tarea ha fallado** y solo entonces se le escribe a Fran.
Si sale bien, no se dice nada: el aviso «listo para revisar» lo manda producción.
`comprobarNumero` admite los EXT (`certapp_obras`; archivada, error) y `ce3x <nº>` de un EXT solo
acepta `--trabajo calificar`.

Primer caso: 26RES060_122 (calefacción hibridada, ACS con la Haier HP200M7-F9). Ese día **PVGIS
estaba en mantenimiento** (403 con su página «Maintenance», también desde el VPS) y sin sus doce meses
el autoconsumo no se puede declarar en la 3.2: el CEE final espera a que vuelva. La consulta de PVGIS
solo se guarda en memoria (`pvgisService`, LRU con caducidad), así que no hay copia de la que tirar.

**Órdenes:** VPS `presentar <nº> [--fase final]` · `ce3x <nº> --trabajo …` · `confirmar <nº> --texto "…"` · `cancelar <nº>` ·
`probar` · `cola` (todas en seco sin `--enviar`); PC `vuelta [--seco]` · `estado`. Registros del PC en
`backend/scratch/pc_trabajos/` (`vuelta.log`, `<id>.jsonl`, `<id>.prompt.txt`).
