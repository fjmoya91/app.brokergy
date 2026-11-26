<!-- conocimiento · área: claude-automatizacion · las rutas de los enlaces son relativas a la raíz del repo -->

## El EQUIPO DE AGENTES: cuatro papeles, un dueño por fase y un tablero (2026-11-26)

Fran, 26/11/2026: «quiero crear un sistema agéntico […] un agente comercial hasta que el cliente
acepta la propuesta […] una vez que acepta, pasa a ser el técnico, que se encarga de que todo el
expediente se haga favorable […] un responsable técnico que revise lo que ha hecho el técnico antes
de enviarlo a verificar […] y un rol superior, el del CEO, que se encargue de todo. Me gustaría
hacerlo todo desde el ecosistema Claude […] y desplegarlo con un modelo algo menos exigente, sin
perder calidad».

Casi todo el trabajo ya lo hacían agentes (el contestador del VPS, el Claude del WhatsApp, la
revisión tras la aceptación, las sesiones de obra con sus skills). Lo que faltaba no era otro
agente sino **organización**: quién es el dueño de una obra en cada momento, quién revisa a quién
y quién reparte. Ese día había ~200 sesiones de obra y tres sesiones «centro» que repartían a
mano, cada una con su criterio.

| Qué | Dónde |
|---|---|
| Los papeles: quién es, qué hace, hasta dónde llega solo | [.claude/agents/](.claude/agents/) `comercial.md` · `tecnico.md` · `responsable-tecnico.md` · `director.md` |
| De quién es cada obra (módulo puro) | [utils/equipoRoles.js](implementation/backend/utils/equipoRoles.js) |
| El tablero y «¿de quién es NNN?» (solo lee) | [scripts/equipo.js](implementation/backend/scripts/equipo.js) |
| La prueba | [scripts/test_equipo_roles.js](implementation/backend/scripts/test_equipo_roles.js) |

### Los papeles

| Papel | Tramo | Termina cuando | Modelo |
|---|---|---|---|
| **COMERCIAL** | de la petición a la aceptación | la oportunidad queda ACEPTADA (hay expediente) o RECHAZADA | Sonnet 5.5 |
| **TÉCNICO** | de la aceptación a tenerlo todo firmado | todo firmado y CEE final registrado: pide la revisión | Sonnet 5.5 (los CEE, con Opus 5.5) |
| **RESPONSABLE TÉCNICO** | revisa lo del técnico, y los CEE entregados | da APTO o devuelve incidencias | Opus 5.5 |
| **DIRECCIÓN** | reparte, vigila y le lleva a Fran lo suyo | — | Sonnet 5.5 |
| **Fran** | firma, paga, decide precio y excepciones, da cada «sí» de envío, visto bueno del CEE, lote y verificación | — | — |

**REGLA — el dueño de una obra lo decide el CÓDIGO con los hechos de la BD, nunca el modelo.**
`equipoRoles.js`: una oportunidad en captación (`LEAD`, `PTE ENVIAR`, `EN CURSO`, `ENVIADA`,
`PRE-ACEPTADO`) y sin expediente es del COMERCIAL; con expediente, cada bloque del **radar del
parte** (`seguimientoRadar.BLOQUES`) tiene UN dueño (`ROL_DE_BLOQUE`); lo que está en
REQUERIMIENTO vuelve al TÉCNICO. No hay una etiqueta «fase» guardada en ningún sitio: duplicar la
verdad en dos sitios es garantizar que un día digan cosas distintas (el mismo criterio que
`estado_visible`, regla 2).

**REGLA — un bloque del radar sin dueño hace fallar la prueba.** Un bloque nuevo en
`seguimientoRadar.js` obliga a decir de quién es en `ROL_DE_BLOQUE`; mientras tanto el tablero lo
manda a DIRECCIÓN y lo avisa.

**REGLA — «listo para auditar» son HECHOS: Anexo I, Convenio y CIFO firmados y el CEE final
registrado, sin lote y sin estar ya en DOC. COMPLETA** (`listoParaAuditar`), y solo si el radar no
le deja nada pendiente al técnico (el radar ve más: un rechazo, una re-firma). Era un hueco: un
expediente al que ya no le falta nada deja de salir en el radar, y nadie lo pasaba a completo.
Medido el 26/11/2026: 14 expedientes así, el más antiguo con el CIFO firmado hacía 57 días.

**REGLA — quien hace no revisa.** El responsable técnico corre como SUBAGENTE (o en su propia
sesión), nunca en la conversación que preparó el expediente: parte de cero, no hereda las
conclusiones del técnico, no corrige y no envía. Registra incidencias y el expediente vuelve al
técnico. Va con Opus: es una pasada por expediente y es la última antes del verificador.

**REGLA — lo que el equipo hace sin el «sí» de Fran es una lista CERRADA, y cada cosa va por la
ruta de la app que ya lleva los topes** (sus decisiones del 26/11/2026: «solo lo dudoso», «sí»,
«OK»; «mi intención es que no tenga que actuar yo en nada»):

| Qué sale solo | Por dónde (ahí están los topes) | Quién |
|---|---|---|
| Pedir el material del CEE inicial | `aceptacion.js pedir --enviar` (regla 158) | técnico |
| Reclamar una firma que no vuelve · un CEE que el certificador no entrega o no registra | el envío en bloque del parte, `POST /api/seguimiento/lote/:clave/enviar`: un mensaje por persona, solo fuera de plazo, ventana de reinsistencia y sello | técnico (una vez por ronda) |
| Recordar una propuesta ENVIADA | la escalera de seguimiento del VPS (regla 217); **sigue en copia**: hasta que pase a real, en borrador | comercial |
| El visto bueno de un CEE **limpio** (`revisar-cee` = `APTO` sin avisos, y la fecha del expediente) | `POST /api/expedientes/:id/approve-cee`, la del botón «Validar» | responsable técnico |
| APTO → DOC. COMPLETA | validar cada documento y después `PATCH …/estado` (ver `expedientes/pasar-a-doc-completa-se-valida-todo.md`) | responsable técnico |

Sigue siendo de Fran: un CEE **dudoso** (`APTO CON AVISOS`, algo que no se pudo mirar, el inicial
fechado el día de la primera factura o después), una firma rota (409), la propuesta, mandar a
firma, cualquier otro mensaje, firmar, presentar y pagar, el lote y el verificador. Nada de esto
se abre con un mensaje suelto «porque el modelo lo ve claro»: si un tipo nuevo tiene que salir
solo, antes se le pone su ruta con su tope.

**REGLA — el comercial guarda TODO lo que llega, antes de simular o de contestar** (Fran,
26/11/2026: «para que luego no se pierda ninguna foto, ni ningún presupuesto»). Fotos, vídeos,
presupuestos, PDF, CEE y notas de voz van a su apartado de la obra con `alta-oportunidad`
(`documentar`); si la obra no existe, se da de alta primero. El informe dice lo guardado y lo que
no se ha podido abrir.

**REGLA — cada incidencia del responsable lleva su SOLUCIÓN, y el bucle no se suelta hasta el
APTO.** Documento y página, lo que dice y lo que debería decir, de dónde sale el valor bueno y con
qué se corrige. El técnico la aplica y vuelve a pedir la auditoría; a la tercera vuelta sin APTO
se para y va a Fran. «Aquí la importancia es que el expediente salga con la auditoría favorable.»

### Con quién habla Fran

**Con UNA sesión: DIRECCIÓN.** Ni una por papel ni obra por obra: los papeles son el sombrero que
se pone la sesión de cada obra, y dirección es la que sabe a cuál llevar cada cosa.

| Dónde está Fran | A quién le habla | Qué necesita |
|---|---|---|
| En el PC | La sesión fijada «DIRECCIÓN» del Code tab | — |
| Fuera, con el móvil | La misma sesión, desde la app de Claude (Code → DIRECCIÓN), por Remote Control | El PC encendido, sin suspender, con la app abierta |
| Fuera, y con el PC apagado | El grupo de WhatsApp «BROKERGY - CHAT»: el Claude del VPS, con las mismas fichas y el mismo tablero | Que este cambio esté desplegado (el contenedor solo ve lo commiteado) |

**REGLA — cuando algo es de Fran, se le AVISA; no se espera a que entre a mirar.** Dirección manda
una notificación al móvil y, de 7 a 21 h, una línea a su grupo de WhatsApp (`asistente_whatsapp.js
decir`), una por ronda: cuántas decisiones tiene y de qué obras. Las sesiones de obra le mandan su
informe a dirección (`SendMessage`), que es la única que avisa.

**REGLA — a Fran una obra se le cuenta con su gente y su fecha, nunca con el número solo**
(26/11/2026: «yo solo con los números de expediente no sé quién son […] 26 del 080, es del
instalador tal, está pendiente y van a instalar tal día, y decir: tienes que tener ya registrado
este certificado, o ponte con eso»). `equipo.js resumen` da una entrada por OBRA —cliente, pueblo,
instalador, ficha, bono si es oportunidad, lo pendiente con sus días, la obra prevista
(`instalacion.fecha_prevista_inicio` / `_fin`), cómo están sus CEE y el «Siguiente»
(`SIGUIENTE` de `equipoRoles.js`)— y dirección lo redacta numerado para que él conteste «tira con
la 1, la 3 y la 5». **Lo urgente lo decide el código**: va primero la obra que empieza (o ya
tenía que haber empezado) con el CEE inicial sin registrar, con el mismo cálculo que pinta la app
(`estadoPlazoCeeInicial` de `logic/fechasPrevistas.js`, importado, no copiado). Medido ese día: 15
expedientes así, con el inicio previsto ya pasado en los seis primeros. Con la fecha pasada el
«Siguiente» no dice «regístralo antes de…» sino «confirma con el instalador si la obra ha
empezado»: el CEE inicial tiene que estar firmado antes de la primera factura.

**El VPS es espejo en lo que importa, no en las sesiones.** Lo compartido es el estado (la BD y
Drive), el tablero, las fichas, las skills y la memoria (que ya se sincroniza cada 3 h). El VPS no
tiene sesiones de obra —cada trabajo empieza de cero con su cuaderno— ni CE3X, AutoFirma o el
certificado: eso va a la cola del PC, como hasta ahora. **Lo que aún no hay**: contestar por
WhatsApp a un «sí» que está pendiente en una sesión del PC. El Claude del VPS no ve ese borrador;
hace falta una cola de decisiones compartida («D12 sí», como el «C12» del contestador). Hasta
entonces, los «sí» de las sesiones del PC se contestan en DIRECCIÓN desde la app del móvil.

**REGLA — dirección no produce.** Reparte por el tablero, una sesión por obra (la de siempre, sin
duplicar), como mucho 6 obras por ronda y 3 sesiones trabajando a la vez (el PC se cae con 7,
medido el 08/11/2026), y le lleva a Fran en UN mensaje todos los «sí» pendientes con su borrador
entero. Apunta lo encargado en `backend/scratch/equipo/rondas.jsonl` (fuera de git).

### Por qué así y no de otra forma (verificado en la documentación el 26/11/2026)

- **Fichas de subagente (`.claude/agents/`)**: es la pieza estable del ecosistema. Cada una fija su
  modelo (`model: sonnet | opus`), carga `CLAUDE.md` y las reglas del área como cualquier sesión, y
  sirve igual como subagente («audita NNN» con `responsable-tecnico`), como papel de la sesión de
  una obra («trabaja como el agente `tecnico`») o como sesión entera (`claude --agent tecnico`).
  **Los papeles son QUIÉN; las skills siguen siendo el CÓMO; la BD es el tablero.**
- **Claude Projects (beta)**: un coordinador con hilos, normalmente en la NUBE. Los hilos en la
  nube reciben el `CLAUDE.md` pero no el `.mcp.json`, los hooks ni los permisos, y no tienen el
  `.env`, CE3X, AutoFirma, el certificado ni el Chrome con la tarjeta: no pueden hacer un CEE,
  firmar ni presentar. Con Remote Control corren en el PC, que es lo que ya hay. Sirve para
  desarrollo del repo, no para operar las obras. Se revisa cuando salga de beta.
- **Equipos de agentes (experimental)**: apagado por defecto, un equipo por sesión, sin reanudar,
  más tokens, y en `claude -p` los compañeros corren como subagentes normales. No aporta nada
  sobre «director + una sesión por obra».
- **Un orquestador de fuera** (los «bots» que hacen de CEO): pide clave de API (pago por uso, no la
  suscripción) o usar la suscripción fuera del programa oficial, y habría que rehacer en él el
  WhatsApp, las skills y la llave de Claude. La coordinación que promete es justo lo que resuelve
  el tablero.
- **Dónde corre cada cosa**: el VPS, lo que tiene que estar despierto y contestar (contestador,
  esperas, seguimiento, aceptación, el Claude del WhatsApp); el PC, lo que necesita CE3X, Chrome,
  AutoFirma y el certificado (las sesiones de obra y dirección). Los dos con la suscripción.

### Lo medido el primer día (26/11/2026, `equipo.js tablero`)

Obras con algo pendiente: comercial 286 (60 propuestas sin enviar, 194 enviadas sin respuesta, 32
leads), técnico 172, responsable técnico 54 (35 CEE entregados sin revisar, 5 migrados, 14 listos
para auditar), dirección 14 (completos y sin lotear).

### Fases

| Fase | Qué | Estado |
|---|---|---|
| 0 | Fichas de los cuatro papeles, reparto por código, tablero y prueba | hecho en local el 26/11/2026, sin commit |
| 1 | Sesión fija «DIRECCIÓN» en el PC, con Remote Control, y su primera ronda | arrancada el 26/11/2026 |
| 2 | Commit y despliegue: el Claude del WhatsApp del VPS trabaja con las fichas y el tablero (`asistente_instrucciones.md`, ya escrito en local) | pendiente del «sí» de Fran |
| 3 | La ronda de dirección como tarea programada de la app (hora y tamaño) | pendiente de Fran |
| 4 | Cola de decisiones compartida PC ↔ VPS, para contestar los «sí» por WhatsApp | por construir |
| 5 | La escalera de recordatorios de propuestas, de copia a real | lo lleva la sesión «CHATBOT WHATSAPP», con el «sí» de Fran |

### Decisiones de Fran

Tomadas el 26/11/2026: (1) el visto bueno del CEE lo da el responsable técnico y a él le llega
«solo lo dudoso»; (2) APTO → DOC. COMPLETA, automático; (3) reclamar firmas, reclamar al
certificador y recordar propuestas enviadas salen sin su «sí».

Abierta: **la ronda** — a qué hora y cuántas obras al día (cuenta para los límites de la
suscripción). Mientras no lo diga, 6 obras por ronda y 3 sesiones a la vez, lanzada a mano.

**Tras tocarlo:** `node implementation/backend/scripts/test_equipo_roles.js`,
`node implementation/backend/scripts/equipo.js tablero` y `equipo.js obra <nº>` con un expediente
y con una oportunidad.
