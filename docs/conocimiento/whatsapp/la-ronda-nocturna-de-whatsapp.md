<!-- conocimiento · área: whatsapp · las rutas de los enlaces son relativas a la raíz del repo -->

## La RONDA NOCTURNA de WhatsApp — fase 1, en seco (2026-10-19)

El 90 % del trabajo entra por WhatsApp y lo que se manda por ahí no siempre acaba en la app. Entonces
el radar cree que la pelota es del instalador cuando ya mandó la factura, y nadie lo mueve. Medido el
19/10/2026: **94 expedientes en PTE. FIN OBRA** (pelota del instalador, 56 días de media); **523
adjuntos colocados a mano** en 30 días con «Traer del WhatsApp»; y **0 filas** en
`whatsapp_chats_atendidos`, o sea que la bandeja «sin contestar» no la abre nadie: el aviso tiene que
llegar, no esperar a que lo busquen.

Cada noche se leen los chats con mensajes NUEVOS de quien tiene algo vivo (cliente, instalador o
certificador con expediente, oportunidad o CEE directo) y se dice, por chat: a qué obra va cada adjunto
y en qué apartado iría, qué preguntaron sin respuesta, qué se prometió (y quién), una línea para el
historial de cada obra y el borrador que se le contestaría.

### La que funciona: una TAREA PROGRAMADA de Claude Code (decisión del usuario, 19/10/2026)

**REGLA — la ronda la ANALIZA Claude Code con la suscripción de Fran y lee del WhatsApp del VPS.** El
usuario no quiere el gasto de API ni el aviso por WhatsApp: una tarea programada de la app de escritorio
(«Ronda de WhatsApp (BROKERGY)», `C:\Users\Usuario\.claude\scheduled-tasks\ronda-whatsapp\SKILL.md`,
cada día a las 8:10; si la app está cerrada, al abrirla) abre una sesión de Claude Code que:

1. `node implementation/backend/scripts/ronda_cc.js preparar` — lee del WhatsApp del VPS por las rutas
   de SOLO LECTURA (`/conversacion`, `/conversacion/adjunto`, `/conversacion/transcribir`, con
   `x-internal-key`) y deja en `backend/scratch/ronda/cc/<fecha>/` una carpeta `chat_<teléfono>` por chat
   con `chat.json` y los adjuntos. Los AUDIOS los transcribe Gemini en el VPS: Claude no acepta audio (el
   asistente del WhatsApp tampoco: también los pasa por Gemini antes de dárselos a Claude).
2. Claude analiza cada carpeta según [ronda_cc_instrucciones.md](implementation/backend/scripts/ronda_cc_instrucciones.md)
   (con subagentes Sonnet de 6 en 6 si hay muchos) y escribe su `resultado.json`; pide los apartados con
   `ronda_cc.js slots <código>` y el dossier con `ronda_cc.js dossier <carpeta> <código>` (enlaces como
   MARCAS).
3. `ronda_cc.js informe` VALIDA (códigos, apartados), pone los ENLACES y los PÁRRAFOS y monta el informe;
   Fran lo ve en la sesión y desde ahí pide lo que quiera («manda C3»: con su «sí» para ese envío).

**REGLA — a la sesión de PRODUCCIÓN se la lee con cuidado**: una lectura cada 250 ms, 3 días de contexto,
corte al tercer fallo, y una carpeta preparada hace menos de 3 h y sin informe se REUTILIZA (no se vuelve
a leer). El 19/10/2026, tras cuatro pasadas completas en pocas horas, WhatsApp cerró la sesión del PC
(`Desconectado: LOGOUT`, pidió QR); la del VPS siguió `READY`. No se sabe si fue por la carga. El cursor
(`scratch/ronda/cc/estado.json`) solo avanza cuando todos los chats tienen `resultado.json`.

La versión del BACKEND (abajo: Gemini, programador propio, aviso por email y WhatsApp) queda hecha y
APAGADA (`WA_RONDA_ENABLED`) como alternativa; comparten las piezas (`rondaWhatsapp.js`, la validación y
el informe).

| Qué | Dónde |
|---|---|
| La ronda por Claude Code: preparar, slots, dossier, informe | [scripts/ronda_cc.js](implementation/backend/scripts/ronda_cc.js) + [ronda_cc_instrucciones.md](implementation/backend/scripts/ronda_cc_instrucciones.md) |
| Orquestador, programador, envío (versión backend, apagada) | [services/rondaWhatsapp.js](implementation/backend/services/rondaWhatsapp.js) |
| Lo que se le pregunta a Gemini (análisis y borrador) | [services/rondaWhatsappIA.js](implementation/backend/services/rondaWhatsappIA.js) |
| El email, el WhatsApp corto y el informe en fichero | [services/rondaWhatsappInforme.js](implementation/backend/services/rondaWhatsappInforme.js) |
| Rutas (**adminOInterno**) | `GET /api/whatsapp/ronda` · `POST /ronda/ejecutar` `{ dias?, telefono?, enviar? }` · `GET /ronda/informe?formato=md\|html\|whatsapp` |
| Lanzarla a mano y esperar | `node implementation/backend/scripts/ronda_whatsapp_seco.js [--dias 1] [--enviar]` |
| Pruebas puras | `node implementation/backend/scripts/test_ronda_whatsapp.js` |

**REGLA — FASE 1 = EN SECO.** No coloca adjuntos, no anota en el historial y no escribe a nadie. Solo
le manda a FRAN el informe por email y un resumen corto al chat del asistente. Lo único que escribe es su
propio estado (`app_settings`, clave `ronda_whatsapp_estado`) y sus ficheros (`scratch/ronda/`, purgados
a los 30 días: llevan conversaciones de clientes). El checklist y el dossier se piden con `soloLectura`:
`buildChecklistData` **escribía al consultarlo** (el backfill del justificante, rpc
`set_expediente_doc_field`; lo cazó el candado de la pasada en seco) y `ensureUploadLink` siembra el
token de subida si falta (`uploadLinkSiExiste` es su gemelo de solo lectura).

**REGLA — nace APAGADA** (`WA_RONDA_ENABLED=true` solo en el VPS): en local la sesión de WhatsApp es la
misma cuenta y la BD es la de producción. Lee desde las 5:00 (`WA_RONDA_HORA`) y avisa a las 9:00
(`WA_RONDA_HORA_AVISO`): un aviso de madrugada no lo puede recoger nadie. Un aviso al día, persistido,
como el parte. El CURSOR (desde cuándo es «nuevo») avanza **solo cuando se ha avisado** y hasta el
momento en que se LEYÓ, no hasta el final del análisis: lo que entre mientras se analiza sale mañana. Sin
nada nuevo no hay ni WhatsApp ni email.

**REGLA — el WhatsApp es CORTO y en fase 1 NO invita a contestar.** El parte diario se apagó por RUIDO
(decisión del usuario, 19/10/2026): diez líneas con lo que se puede hacer hoy («eres tú», por colocar,
peticiones nuevas, borradores) y el resto en el correo. Y no ofrece «sí C1»: el asistente lee los
últimos mensajes de su chat como contexto, y un «sí» de Fran a un resumen que lo ofreciera podría
tomarse como permiso para mandar un borrador a un cliente. Hasta que exista ese paso, solo informa y lo
dice. Destino: `WA_RONDA_DESTINO` › `ASISTENTE_WHATSAPP_GRUPO` › `WHATSAPP_ADMIN_CHAT`; email a
`ADMIN_EMAIL` por el buzón secundario.

**REGLA — los ENLACES del borrador los pone el CÓDIGO, nunca el modelo.** Medido en la primera pasada
(41 enlaces copiados por el modelo desde el dossier): **7 ROTOS** —token recortado, un dígito cambiado,
el token omitido— y 4 con el «¡Gracias» pegado. Ahora el modelo escribe una MARCA (`{ENLACE_SUBIR}`,
`{ENLACE_FIRMAR}`, `{ENLACE_ACEPTAR}`, `{ENLACE_MI_EXPEDIENTE}`) y `sustituirEnlaces` pone la URL sola
en su línea; cualquier otra URL que escriba se QUITA y se avisa. Segunda pasada: **35 de 35 exactos**,
comprobados contra el token de la BD. ⚠️ El bot viejo (`botCerebro`, apagado) tiene el mismo riesgo: si
se enciende, arreglarlo igual.

**REGLA — los PÁRRAFOS también los junta el código.** En 28 de 47 borradores el modelo pegaba los
párrafos sin salto ni espacio («¡Hola Paloma!Sobre la obra…»). El esquema pide `parrafos[]`.

**REGLA — solo se acepta una propuesta que se ENVIÓ.** Una oportunidad en PTE ENVIAR o LEAD no tiene
propuesta que aceptar: el borrador acusa recibo sin enlace, y si preguntan por importes o plazos lo pasa
a Fran. En el resumen sale como «eres tú: propuesta sin enviar y el cliente escribiendo» (6 casos en la
segunda pasada). Una ACEPTADA sin expediente tampoco recibe el enlace de aceptar.

**REGLA — lo que manda la APP no es una promesa de nadie.** Los avisos automáticos («dejaremos preparada
la parte técnica para el IRPF») inflaban las promesas «nuestras»: **37 de 72**. Se reconocen por su
texto en `whatsapp_queue` (la cola de envío) o por la firma corporativa, se marcan en la conversación
que lee el modelo y la promesa que salga de ellos se descarta (contada).

**REGLA — el modelo mira, el código VALIDA.** Un código de obra que no esté en la lista del chat es
«dudoso», nunca un acierto; `NUEVA` marca una petición de alguien que aún no está en la app. El apartado
de cada foto lo propone el repartidor de siempre (`clasificarFotos`, con el checklist REAL de esa obra).
Una respuesta cortada (bucle) o un 5xx se reintenta UNA vez con otra temperatura.

**REGLA — se PIENSA solo donde hace falta.** Medido sobre las 36 llamadas de una ronda de 24 h: el
RAZONAMIENTO era el **60 % de todo el gasto** (2.300 tokens de media por chat, cobrados a precio de
salida) y el análisis, el 74 %. Con UNA sola obra en el chat (la mayoría: clientes) no hay nada que
deducir y no se piensa (`pensamientoPara` → 0); con varias, un tope de 512 (1.024 si hay adjuntos), que
`ajustesGemini` traduce a cada modelo. Un chat cuyo NUEVO es solo cortesía y sin adjuntos ni se analiza
(`soloCortesia`). El borrador lleva tope de 1.500 tokens (un bucle llegaba a 4.000).

**El MODELO** (`WA_RONDA_MODELO`, y `WA_RONDA_MODELO_BORRADOR` para los borradores; por defecto
`GEMINI_MODEL`). Precios del nivel de pago el 19/10/2026 (USD por millón, entrada · salida con el
razonamiento; el modo por lotes, la mitad):

| Modelo | Precio | Para la ronda |
|---|---|---|
| gemini-2.5-flash | 0,30 · 2,50 | el medido; referencia de calidad |
| **gemini-3.5-flash-lite** | 0,30 · 2,50 | el más nuevo al MISMO precio |
| gemini-3.1-flash-lite | 0,25 · 1,50 | −40 % en la salida |
| gemini-2.5-flash-lite | 0,10 · 0,40 | **no disponible**: `404 no longer available to new users` (19/10/2026) |
| gemini-3.6 / 3.8-flash | 0,75 · 3,75 | más caros, y DOBLAN el 01/01/2027: no |

Un modelo más barato solo se pone tras compararlo con la pasada de referencia:
`ronda_whatsapp_seco.js --dias 7 --modelo <modelo>` y
`node implementation/backend/scripts/comparar_rondas.js <referencia>.json <prueba>.json` (misma obra,
mismo apartado, dudosos, preguntas y decisión de borrador, chat a chat). Pendiente: el modo por LOTES
(Batch API, mitad de precio) encaja con una ronda nocturna, pero obliga a partirla en dos tandas
(análisis, y después apartados y borradores).

**Lo medido (19/10/2026, 7 días de chats, en seco):** 444 teléfonos con algo vivo → 374 chats leídos en
**12 s**, 121 con mensajes; de los adjuntos sin colocar, **135 con su obra** (133 con confianza alta),
7 dudosos y 3 de peticiones nuevas, también en chats de instaladores con 20 y 47 obras (se apoya en la
referencia catastral, el titular, la dirección o lo que dice el mensaje); 69 preguntas sin contestar;
46 borradores, 27 para Fran (quejas, dinero, IRPF, cambios de quién cobra). **31 min y ≈ 1 €** de
Gemini para 7 días; una noche normal, unos 25-40 chats.
