# El CONTESTADOR: contesta por WhatsApp como Fran a quien tiene algo vivo (2026-11-10)

Fase 2 del agente autónomo. Fran (08-09/11/2026): «que antes de contestar busque en la base de datos y en
la conversación», «que sea como si estuviese contestando yo realmente». Él solo se queda con firmar los
certificados y la presentación; lo demás de WhatsApp, cuando el contestador ya conteste solo.

Fuente única: [contestadorWhatsapp.js](../../../implementation/backend/services/contestadorWhatsapp.js)
(CUÁNDO y A QUIÉN) + [contestadorCerebro.js](../../../implementation/backend/services/contestadorCerebro.js)
(QUÉ se le dice). Tabla: [wa_contestador_schema.sql](../../../implementation/backend/scripts/wa_contestador_schema.sql).

## Cómo va

1. **Entra un mensaje 1:1** (listener de la sesión, `alMensajeEntrante`) de un teléfono con obra viva: el
   UNIVERSO de la ronda (cliente, persona de contacto o instalador con expediente, oportunidad o CEE
   directo; en memoria 10 min). Se apunta en `wa_contestador`, **una fila PENDIENTE por chat** (índice único
   parcial), con `responder_after` = **15 min de silencio** (`CONTESTADOR_SILENCIO_MIN`), o la apertura de la
   franja (7:00) si es de noche. Cada mensaje nuevo suyo empuja el plazo: se contesta a la RÁFAGA, no al
   «Buenas». El listener no hace trabajo: apunta y se va, con candado por chat.
2. **La vuelta** (cada 60 s, solo en la franja de la casa —regla 205, `puedeContestar`, también el fin de
   semana— y con la sesión lista) coge lo vencido (2 por vuelta), **relee el chat** y decide (`decidir`, que
   no escribe):
   - descarta un grupo, un chat de la casa (el de Fran, el de administración) y lo que **ya está
     contestado**;
   - **REGLA — si una persona de la casa ha escrito a mano en el chat, NO se calla 24 h: se le dejan
     30 min** (`CONTESTADOR_RELEVO_MIN`, `dejarleAElla`) para contestar ella a lo que el otro escriba
     DESPUÉS de su mensaje; pasados, contesta el contestador con toda la conversación delante, lo suyo
     incluido (Fran, 10/11/2026: «aunque yo conteste, no estés 24 h sin contestar; si yo estoy un tiempo,
     sé proactivo, es que no llego a todo»). Mientras tanto la fila espera (ESPERAR, se mira cada 15 min).
     La pausa de 24 h (`wa_chat_pausas`) sigue valiendo para los RECORDATORIOS de las esperas;
   - **REGLA — cualquier mensaje NUESTRO posterior al suyo lo da por contestado, también lo que salió
     por la app**: por la app van los WhatsApp que el asistente manda por Fran y los de los popups. Seco
     del 10/11/2026 (un instalador): el asistente le había contestado a las 20:31 y, sin contar eso, el
     contestador le volvía a decir lo mismo. Lo que se pierde (una pregunta suya y, detrás, un aviso de
     plantilla) lo recoge la ronda del día siguiente;
   - **la respuesta AUTOMÁTICA de su WhatsApp Business no es suya** (`esperasWhatsapp.pareceAutomatica`:
     de plantilla y con emojis o larga; aquí SIN reloj, porque la de un instalador llegó 12 min después de lo
     nuestro y las esperas miran 10): no se cuenta, y si es lo único que hay, no se contesta;
   - un **certificador** no se contesta (se lleva como a un compañero), ni un cliente sin obra viva, ni quien
     escribe por PRIMERA vez (eso es de la bienvenida); un **instalador sin obra** sí (abajo);
   - lo suyo de hace más de 8 días (`CONTESTADOR_MAX_HORAS`, 192) → a Fran. Lo de más de un día **se
     contesta igual**, empezando por «Perdona la tardanza.» (el cerebro recibe `tardeHoras` y contesta con
     lo que dice HOY el dossier; si ya se resolvió después, CALLAR). Hasta el 11/11/2026 el corte era 48 h y
     lo de antes iba a Fran SIN borrador: de los 63 chats atrasados de la semana que se pasaron por la cola,
     31 le llegaron así. Fran: «si todo lo tengo que revisar yo, para eso contesto yo directamente […] solo
     quiero contestar en aquello que sea imprescindible»;
   - solo cortesía («gracias», «ok», un emoji) → CALLAR;
   - si no, hace con ESE chat lo mismo que la ronda (`rondaWhatsapp.procesarChat`: lee los adjuntos con
     Gemini, elige la obra, arma el DOSSIER en `soloLectura`) con el cerebro del contestador como redactor
     y **`siempreRedactar`**: si se calla lo decide el cerebro, no el análisis de la ronda, que daba «no
     espera respuesta» a «Ya me han instalado la aerotermia» o a «comprueba que esté todo bien» cuando
     detrás iba un aviso automático nuestro.
3. **Lo que el cerebro iba a escalar se INVESTIGA antes** (desde el 16/11/2026, abajo): un `claude -p` con
   herramientas de solo lectura mira la BD, la simulación y el manual y, si se puede saber, le contesta.
4. **Con la decisión**: RESPONDER → se le contesta; ESCALAR → a Fran con el BORRADOR de lo que le diría, y al
   cliente un acuse que dice algo CONCRETO de lo suyo; CALLAR → nada. Y antes de contestar, **lo que ha
   mandado se GUARDA** en su expediente (abajo).

## Lo que se iba a escalar se INVESTIGA y se contesta (2026-11-16)

Fran, 16/11/2026: «Hay WSP que contestas a los clientes como "Recibido, me pongo con ello" y eso no me gusta
porque no da contestación. Quiero que seas lo más autónomo posible para atender a los clientes. Yo no llego
a basto». Medido ese día, desde que el contestador pasó a REAL a las 15:53: seis escalados con su acuse
vacío («Recibido, lo miro y te digo») — C394 (un instalador cobraría la Memoria RITE), C403 y C407 (¿cobraré
al menos 5.000 € de bono?), C404 (el enlace de proveedores da error), C408 (la caldera vieja se quedó en su
sitio), C412 (notas de voz de IRPF y placas) — y antes, en copia, C365, C368 (IRPF con la factura a nombre
de uno de los dos titulares, contestado ya en `consultas/`), C376 y C378 (qué hace falta para el CEE final
de un CEE directo). Casi todo se podía contestar mirando la BD, la simulación o `docs/conocimiento/consultas`.

**REGLA — lo que el cerebro rápido escala no va directo a Fran: antes lo investiga un `claude -p` CON
herramientas de solo lectura, que contesta si se puede saber.** El cerebro rápido (sin herramientas, ~20 s)
sigue igual para lo que sabe; si escala, `contestadorCerebro.investigar` le pasa al
INVESTIGADOR el mismo prompt (conocimiento, dossier, conversación) más una «segunda vuelta»
(`construirInvestigacion`): por qué se iba a escalar y cómo mirar. Por `POST /investigar` del vigía (su
propia fila, 3 en espera como mucho → 429, aparte de `/contestar` y de los trabajos de Fran; consumo en
`contestador.jsonl` con `tipo: investigar`), con `contestador_claude.investigar`: Sonnet, 5 min y 3 $ de tope
(`CONTESTADOR_PLAZO_INVESTIGAR_MS`, `CONTESTADOR_TOPE_INVESTIGAR_USD`, `CONTESTADOR_MODELO_INVESTIGAR`). Se
apaga con `CONTESTADOR_INVESTIGAR=false`. Si falla o no está, sigue lo de antes (a Fran) y se dice por qué
(`investigado`). Con Gemini de respaldo no se investiga (si Claude no estaba para lo rápido, tampoco).
**Lo marcado `para_fran` también pasa por el investigador, pero NO para contestarlo**: su segunda vuelta es
«prepara la respuesta para Fran» (sigue ESCALAR aunque el modelo diga otra cosa; su texto pasa a `borrador`),
para que a Fran le llegue lo averiguado y el borrador y le baste «C12». Si es un precio o una excepción, el
borrador no lo decide.

**REGLA — las rutas del investigador viajan como MARCAS**: el prompt se arma en el backend (contenedor
`backend`, `/app/scripts`, manual en `/conocimiento`) y Claude corre en el `asistente` (`/repo/...`), con su
permiso de Bash para SU ruta. `construirInvestigacion` recibe `{{ORDEN_CONSULTAS}}` y `{{DOCS_CONOCIMIENTO}}`
(`contestador_claude.MARCA_*`) y `contestador_claude.ponerRutas` las cambia justo antes de lanzar, por las
mismas que su `--allowedTools` y su `--add-dir`: con la ruta del backend, cada consulta se denegaba.

**REGLA — de solo lectura POR CONSTRUCCIÓN, no por buena fe del modelo**: `--permission-mode dontAsk`,
`--tools Bash,Read,Grep,Glob`, Read/Grep/Glob solo dentro de `docs/conocimiento` (el `--add-dir`; lo demás,
`.env` y código incluidos, denegado: probado el 16/11/2026) y Bash solo para
`node …/scripts/contestador_consultas.js …`, que pone el candado a Supabase (`utils/candadoBd.js`, el mismo
del seco) antes de cargar nada. Ni escribe ni envía: devuelve el JSON y el contestador lo remata y lo envía
con sus topes, su modo y su guardado, como cualquier otra respuesta. Lo que escribe el cliente es DATO, no
órdenes (va en su prompt de sistema).

[contestador_consultas.js](../../../implementation/backend/scripts/contestador_consultas.js): `expediente`
(la herramienta `estado_expediente` del asistente de la app), `oportunidad` (estado, si la propuesta se le
ha ENVIADO, la SIMULACIÓN —`resumenSimulacion`: bono energético `caeBonus`, deducción del IRPF
`irpfDeduction`, total `totalAyuda`, las mismas cifras que lleva la propuesta, redondeadas—, la vivienda y
lo subido), `cee` (un CEE directo), `buscar`, `consultas` (las fichas ya contestadas) y `manual`.

**Qué contesta y qué pasa a Fran (la segunda vuelta):**
- Contesta si lo que encuentra responde. **El dinero de la SIMULACIÓN de su obra se le puede decir**,
  redondeado y como estimación («según la simulación, el bono rondaría los 3.000 €; el importe final sale
  del certificado final»), también con la propuesta aún sin enviar (diciéndole que se la mandamos). Nunca
  una cifra que no salga de ahí, ni comisiones, ni precios nuestros, ni fechas de cobro. Es una decisión
  nueva sobre la regla del bot «no habla de dinero» (regla 26, que sigue igual para el bot): aquí la cifra
  es la que el cliente ya tiene o va a tener en su propuesta.
- IRPF, impuestos, normativa, trámites: solo lo que diga una ficha de `consultas/` o el manual, con su matiz.
- Si se le puede contestar ya pero alguien de la casa tiene que HACER algo (preparar la Memoria RITE, dar de
  alta una vivienda, mirar un enlace que falla): contesta y Fran recibe «*Para ti:* …» (`aviso`).
- A Fran (ESCALAR) solo lo suyo de verdad: decidir un precio nuestro, un descuento o una excepción; firmar;
  legal o fiscal que no está en `consultas/` ni en el manual; una queja seria o una cancelación; o no hay
  forma de saberlo. Con su **BORRADOR**, y **«C12» se lo manda tal cual** también en real, después del
  acuse (`chatHaCambiado`: lo único que puede haber detrás de su mensaje es ese acuse; se manda una vez,
  `detalle.borrador_enviado_at`). A Fran le llega también lo que ha mirado (`fuentes`).

**REGLA — el acuse dice algo CONCRETO de lo suyo, nunca un «lo miro» vacío** («Lo de la factura a nombre de
los dos lo confirmo y te digo»). Los dos cerebros dan un `tema` (3 a 8 palabras) y el código
(`acuseConcreto`) cambia un «Recibido, lo miro y te digo» a secas —con su nombre o sin él— por «Lo de
<tema> lo miro y te digo.».

**REGLA — UN acuse por asunto: con algo ya ESCALADO y sin contestar en ese chat, lo nuevo no lleva otro
acuse** (17/11/2026, 26RES060_OP376). María José pidió un correo para mandar los papeles, lo repitió, mandó
dos capturas de su asesoría y una nota de voz: cuatro ESCALAR en una hora (C450, C454, C457, C458) y cuatro
«lo miro y te digo» casi iguales. Ahora `decidir`, si sale ESCALAR, mira las filas de ese chat
(`escaladoAbiertoDe`, solo lectura) y `escaladoAbierto` (pura) dice si hay uno ABIERTO: el último ESCALAR con
acuse enviado hace menos de `CONTESTADOR_ACUSE_HORAS` (6 h), sin su borrador mandado («C12») y sin ningún
mensaje NUESTRO después que no sea un acuse (si Fran o la app le han escrito, ese asunto está atendido). Si
lo hay, lo nuevo va a Fran como **añadido** («*C458 · Más de María José (sigue lo de C450)*», «No le he
mandado otro acuse…»), con su investigación y su borrador («C458» lo manda); en la fila,
`detalle.anadido_a` (la raíz) y `detalle.acuse_omitido`. Si no se puede mirar la BD, como antes: con acuse.
Medido sobre las filas reales: C454, C457 y C458 habrían salido sin acuse.

**Lo que se escaló en OP376 y no hacía falta** (mismo día): el correo se escaló porque el investigador solo
encontró el de Fran (interno). Ahora el prompt lleva los **datos de la casa que SÍ se pueden dar**
(`datosCasa`): el correo **info@brokergy.es** (el de los emails a clientes; `CONTESTADOR_CORREO_CLIENTES`
lo cambia), y ningún otro correo ni teléfono. Y lo FISCAL con ficha en `consultas/` (titular, vivienda
habitual, tope del 60 %, copropiedad: `cae-a-nombre-de-un-copropietario-y-tope-irpf-60.md`) se CONTESTA
con su matiz («tu gestor te lo confirma»): el investigador busca por palabras clave antes de decir que no
hay ficha, y un detalle del caso (la casa es de su madre, su asesoría dice algo) no lo hace «de Fran»; si
manda la respuesta de su asesoría y no se puede leer, contesta la regla general y le pregunta qué le han
dicho, en una frase.

Y lo que se CALLA con `aviso` («Para que lo sepas») llega de verdad a Fran: `actuar` solo le avisaba de un
CALLAR con algo que guardar o un seguimiento.

**El cerebro rápido escala menos a ciegas**: el dinero, el IRPF y lo que el dossier no responde ya no son
«a Fran» sino «a investigar»; `para_fran: true` solo para persona o programa, llamada, queja seria, cancelar
o cambiar titular/cuenta/obra, decidir un precio nuestro o una excepción (o revisar su presupuesto), y
firmar. Y la Memoria RITE que el instalador cobraría se le contesta en el acuse: «No hace falta que la
pagues: la memoria la preparo yo y te la paso para que la firmes».

## Lo investigado SE ENVÍA: Fran no supervisa las respuestas (2026-11-21)

Fran, 21/11/2026: «El reportar que le damos a los clientes no me sigue gustando… respuestas automáticas como
"lo reviso y te digo", sin analizar la conversación. Realmente revisarlo y, con el token, revisar el expediente
y contestar acorde a cómo cuando te paso yo la conversación a ti por Claude y me propones una conversación y
casi siempre te digo "sí, envíalo". De eso se trata. No de "reviso y te digo" y que tenga yo que supervisarlo».

**Lo medido en `wa_contestador`, del 18 al 21/11/2026** (tres días, en real): 47 respuestas enviadas; **34 acuses
«Lo de … lo miro y te digo»**, cada uno con su borrador esperando en el grupo de Fran, y **ningún «C12» enviado
nunca** (`detalle.borrador_enviado_at` vacío en toda la tabla): el cliente se quedaba con el acuse y nada más,
salvo que Fran escribiera a mano; y **22 respuestas ya redactadas que no salieron por un tope** (20 por el de 40
al día, 2 por el de 3 por chat: «tope del día (40) alcanzado (iba a decirle: …)»). De 103 mensajes que pedían
respuesta, la tuvieron 47. Y los borradores eran buenos para mandar tal cual (C578 el desguace de la caldera, C613
la ayuda de la Junta, C640 el IRPF y los apellidos, C662 el cambio de titular de una propuesta sin aceptar, C698 la
Memoria RITE, C732 a nombre de quién va la factura, C775 cómo facturar las ventanas): el fallo no era lo que se
averiguaba, sino que se le enseñaba a Fran en vez de mandarlo. Santos pidió tres veces en 45 minutos una
referencia catastral que estaba en la conversación, y recibió tres acuses (C582, C584, C586).

**REGLA — lo que el investigador averigua SE ENVÍA: su respuesta sale tal cual, sin que Fran la vea antes.** La
segunda vuelta ya no es «contesta si se puede saber; si no, a Fran con el borrador»: es «revísalo como lo haría
Fran (la obra entera, toda la conversación, el manual) y contéstale tú». Lo que antes era motivo para escalar
ahora tiene salida: no se sabe de qué obra habla → se contesta con la que encaja, diciéndola, o se le pregunta en
una frase; pide un dato que está en la BD o en la conversación → se le da; falta un dato suyo → se le pregunta;
una parte es de Fran → se contesta lo demás, una frase con lo que queda por confirmar y `aviso` a Fran; pide una
llamada y además pregunta algo → se contesta lo que pregunta y `aviso` «pide que le llames»; lo fiscal o de
trámite sin ficha en `consultas/` → la regla general con su matiz («tu gestor te lo confirma») y `aviso`
«contestado sin ficha en consultas/: …», para que Fran la revise y quede escrita.

**REGLA — un ESCALAR del investigador solo se queda en Fran si dice POR QUÉ con un motivo de una lista cerrada**
(`"por"`, `POR_FRAN`): `PRECIO` (un precio nuestro, un descuento, una comisión, cómo o cuándo se nos paga, una
excepción) · `QUEJA` (queja seria, enfado, cancelación) · `PERSONA` (pregunta si es una persona o un programa, o
solo quiere hablar por teléfono) · `FIRMA` · `AJENO` (algo personal de Fran o hablado fuera del chat) ·
`SIN_DATOS` (ni mirando ni preguntándole se puede saber). **Sin ese motivo, su `borrador` ES la respuesta**: lo
decide el código (`contestadorCerebro.decisionTrasInvestigar`, pura), no la buena fe del modelo; el borrador pasa
a `parrafos`, sin acuse, y lo que se iba a decidir va en el `aviso` («te lo iba a pasar por: …»). A Fran le llega
«*He contestado a…*» con «*Para ti:*», y en la fila queda `detalle.enviado_sin_fran` (y `detalle.por` en lo que
sí se queda), para medirlo. Sin borrador no hay nada que enviar: sigue en Fran.

**REGLA — lo que solo contesta Fran en persona no se contesta nunca, se diga lo que se diga**: lo que el cerebro
rápido marca `para_fran` y SIN acuse (persona o programa, una llamada y nada más; `soloDeFran`). Su segunda vuelta
sigue siendo «prepara la respuesta para Fran» y el código lo deja en ESCALAR, `por: PERSONA`, sin acuse. Lo demás
que el cerebro rápido da por «de Fran» (cambiar el titular, una queja, un presupuesto que revisar) lo vuelve a
mirar el investigador con la lista cerrada delante: casi nunca lo es (C662: la propuesta estaba sin aceptar y el
titular se cambia sin más).

**Los topes eran el otro motivo**: 40 al día y 3 por chat pasan a **120 y 6** (`CONTESTADOR_TOPE_DIA`,
`CONTESTADOR_TOPE_CHAT_DIA`). Siguen siendo un freno (un bucle con el bot de otro WhatsApp Business, un día
desbocado), no el ritmo normal: la demanda medida es de unas 35 respuestas al día. Los acuses también cuentan.

**Y el cerebro rápido, cuando acusa algo recibido y no le falta nada suyo, dice QUÉ VIENE AHORA** («por tu parte
ya no falta nada: ahora seguimos nosotros con el certificado»), no «lo reviso y si falta algo te digo».

**Lo que NO cambia**: el investigador sigue siendo de SOLO LECTURA por construcción, con el mismo modelo, plazo y
tope (Sonnet, 5 min, 3 $); la propuesta sigue saliendo solo con el «sí» de Fran (regla 113); en modo copia no le
llega nada a nadie; y lo de Gemini de respaldo no sale solo. Lo que no hace todavía: comprobar que un documento
firmado o un justificante que manda el cliente está BIEN (eso lo sigue mirando una persona).

Tras tocarlo: `node implementation/backend/scripts/test_contestador_whatsapp.js` y un seco sobre chats ya
contestados (`contestador.js seco --antes --tel …`).

## El LISTADO para repasar las respuestas (2026-11-21)

Fran, 21/11/2026: «quiero que luego se pueda sacar un listado de las respuestas que se dan para analizar cómo han
sido, mejorar el asistente». Con las respuestas saliendo solas, esto es lo que las vigila después.

`node implementation/backend/scripts/contestador.js listado [--dias 7 | --desde AAAA-MM-DD --hasta AAAA-MM-DD]`
baja un **Excel** a Descargas (lleva conversaciones reales: nunca al repositorio) por
`GET /api/whatsapp/contestador/listado` (`adminOInterno`; JSON por defecto, `formato=xlsx` el Excel; solo lee).
Fuente única: [utils/listadoContestador.js](../../../implementation/backend/utils/listadoContestador.js) (puro) +
`contestadorWhatsapp.listado`.

- **Hoja «Respuestas», una fila por turno** (lo más antiguo primero): nº (C…), fecha y hora, quién, rol, obra,
  **qué escribió**, **qué se hizo**, **qué se le dijo** (lo que le LLEGÓ: la respuesta o el acuse), **lo
  redactado que no le llegó** (el borrador para Fran, lo parado por un tope, lo de modo copia), por qué se quedó en
  Fran (`detalle.por`), el aviso a Fran, el motivo interno, cómo se decidió («directo (8 s)» / «revisando: 6 pasos,
  16 s»), qué miró (`fuentes`), los minutos hasta contestar, si se encargó un alta, y **qué escribió DESPUÉS** (el
  turno siguiente de ese chat: es la mejor pista de si la respuesta le valió). Y dos columnas vacías para repasarlo,
  **«VALORACIÓN»** y **«QUÉ HABRÍA DICHO YO»**: rellenadas, son el material para corregir el prompt.
- **Qué se hizo**, en una etiqueta (`resultadoDe`): Contestado · Contestado tras revisarlo (pasó por el
  investigador) · Contestado con lo que antes iba a Fran (`detalle.enviado_sin_fran`) · A Fran, con acuse al cliente
  · A Fran, sin decirle nada · No salió por un tope · Solo copia a Fran · Callado · Descartado · Error.
- **Hoja «Resumen»**: totales contados sobre las propias filas (los que pedían respuesta son todos menos los
  callados y los descartados) y, de lo que se quedó en Fran, por qué.
- **El tramo son días de MADRID**, los dos incluidos; sin fechas, los últimos 7 días (tope 90).
- De `detalle` se piden solo los subcampos que hacen falta (`detalle->pendientes`, `detalle->>borrador`…), de mil
  en mil: un listado no trae un JSONB entero (regla 22).

Medido al estrenarlo, del 18 al 21/11/2026 (antes del cambio de arriba): 280 turnos, 143 pedían respuesta y la
tuvieron 66; 51 se quedaron en un acuse, 23 no salieron por un tope y 3 fueron a Fran sin decirle nada al cliente.

Tras tocarlo: `node implementation/backend/scripts/test_contestador_whatsapp.js` y `auditar_rutas_sin_guardian.js`.

## Lo que NO es de una obra no se pregunta de qué obra es (2026-11-16)

Turno 414, en real: Vicente Alhambra (instalador de Ruidera, tres obras) mandó sin texto el cartel de un curso
de Johnson sobre aerotermia y CAEs. Gemini lo leyó bien (`OTRO_DOCUMENTO`, sin obra), pero
`rondaWhatsapp` solo pasaba al cerebro lo que tenía obra, así que el cerebro vio «[imagen]» y le contestó que
no sabía de cuál de sus obras era la foto, con las tres direcciones. «Pero qué me quieres decir»; Fran tuvo
que disculparse a mano.

**REGLA — al cerebro le llega TODO lo que ha mandado, también lo que no es de obra, dicho como tal**
(`rondaWhatsapp.lineasLlegado`): «— NO es de ninguna obra» (NO_RELACIONADO) o «— SIN OBRA asignada: por lo que
es, decide…». Y en su prompt: lo que no es de obra (publicidad, un cartel, un curso, un meme, un reenvío) no se
pregunta de qué obra es: CALLAR (o una línea natural si lo pide el tono), y si a Fran le interesa saberlo (un
curso o una feria sobre CAEs, un competidor, normativa), CALLAR con `aviso`, que le llega como «Para que lo
sepas». Solo lo que ES de obra y no se sabe de cuál se pregunta, mirando antes lo ya pedido (a Vicente se le
había pedido el 10/11 la foto de la máquina de dentro de 26RES060_175) y sin listar sus direcciones salvo que
haga falta para elegir.

**Y la causa de fondo, medida en el seco del mismo chat: la NUMERACIÓN de los adjuntos.** Con la conversación
de 8 días delante, Gemini devolvió 24 adjuntos para el único que se le pasó («ADJUNTO #1»): numeró él las fotos
viejas del chat, y su «#1» era una del 09/11 de la obra de José Luis; el cartel, bien leído, salió como #24.
Así el cartel pasaba por «fotos de la obra de José Luis» y el repartidor lo habría GUARDADO como la máquina de
fuera de 26RES060_175. En el turno 414 hubo suerte. **REGLA — un análisis con un número de adjunto que no se le
dio (o repetido) no vale para NINGÚN adjunto** (`rondaWhatsappIA.validarAnalisis(r, obras, nAdjuntos)`): se
repite una vez y, si vuelve a pasar, los adjuntos quedan SIN LEER (ni obra, ni apartado, ni se guardan) y al
cerebro le llegan como «NO se ha podido ver qué es: no le preguntes de qué obra es». El prompt dice cuántos son
(«del #1 al #N») y que lo que no lleva «ADJUNTO #» no se devuelve, y que la publicidad (cartel, folleto,
curso, anuncio de marca) es NO_RELACIONADO aunque salga una aerotermia. Con los dos arreglos, el seco del
chat en el momento del cartel (`--antes --quitar 2`) calla, dos de dos, con «Para que lo sepas».

## La PETICIÓN NUEVA se contesta «lo vamos a revisar» y se da de ALTA sola (2026-11-20)

C696, en real: Fran Ruimor (instalador de Villarrobledo, tres obras en la app) mandó a las 8:15 la captura del
Catastro de una parcela de Vara de Rey y el presupuesto de una aerotermia, con «Buenos días cuando puedas». Gemini
los dio bien por obra `NUEVA`, pero `lineasLlegado` solo tenía ramas para «de esta obra», «de ninguna» y «sin
obra»: lo NUEVO **se caía** y el cerebro, con «tiene tres obras abiertas, pregúntale cuál» del dossier, contestó
«He recibido la foto y el presupuesto 1-000048. ¿Me dices de qué obra son? Con el nombre del titular o la dirección
me vale, así lo coloco en su expediente». Fran, ese día: «las contestaciones que está dando son una mierda y
vuelve loco a los clientes… sería algo como: Buenos días (o tardes según hora) Fran, lo vamos a revisar y te
pasamos la propuesta. El asistente debe ser listo: cuando nos pasan catastro, foto de caldera y/o presupuesto es
para eso, e incluso ponerse en marcha sin que yo lo tenga que hacer». A la vez, el modo proactivo le había
mandado «P83 · Nueva petición… ¿La doy de alta?» y había ocho así sin contestar (P76–P83).

**REGLA — lo de una obra NUEVA llega al cerebro dicho como tal, y no se pregunta de qué obra es.**
`lineasLlegado` lo pasa como «— de una OBRA NUEVA que aún no está en la app (es una petición nueva: se da de
alta)» y lo junta en `llegado.nuevas`; si la conversación es de una obra nueva no se le cuelga la única obra
que tenga (`procesarChat`, `esNueva`), y `dossierParaBorrador` con `ch.obraNueva` dice «es de una OBRA NUEVA…
no le preguntes de cuál es ni le hables de ellas» en vez de «tiene varias obras, pregúntale cuál».

**REGLA — a una petición nueva se le contesta como Fran: «Buenos días, Fran. Lo vamos a revisar y te pasamos la
propuesta.»** Una o dos líneas; sin recitar lo recibido (ni el nº del presupuesto, ni el fichero), sin hablarle
de sus otras obras y sin «lo coloco en su expediente». Solo si no hay manera de saber qué vivienda es (ni
Catastro, ni RC, ni dirección), una frase pidiéndole la dirección o la referencia catastral. Lo mismo en el caso
G (instalador sin obra que manda los datos de un cliente): antes era ESCALAR a Fran.

**REGLA — el saludo es el de Fran: «Buenos días» hasta las 14:00 y «Buenas tardes» después (Madrid), con el
nombre de pila con el que le saludamos NOSOTROS en el chat** (`saludoDeLaHora`, `nombrePilaDe`: «Hola Fran!» →
Fran; los saludos del contestador y las plantillas no cuentan). Sin él, la agenda como pista; nunca el nombre de
la empresa. Y, para todas las respuestas: lo recibido no se recita, y la coletilla del bot de clientes («si
preguntabas por otra obra, avísame») ya no se pide y, si sale, la quita `limpiar` (`sinColetillaOtraObra`: solo
la frase con «otra», «si preguntabas/te referías/era…» y «avísame/dime»). El prompt lleva tres respuestas reales
de Fran como ejemplo de tono.

**REGLA — el ALTA se encarga sola, y lo que la decide es lo que ha llegado, no solo el modelo.** El cerebro
devuelve `"alta": true`; el contestador solo lo acepta si lo respalda lo visto (`peticionNueva`: un adjunto de
obra NUEVA, una placa / Catastro / presupuesto / croquis sin obra asignada, lo de quien no tiene obra con
nosotros, o la conversación sobre una obra nueva) y, **en real y con la respuesta ya dada**, se la encarga al
asistente (`asistenteCanal.pedirTarea`, clave `alta:<chatId>`: una por ráfaga). El texto lo compone el CÓDIGO
con datos de la BD y vocabulario fijo (`textoAlta`: teléfono, partner de la ficha, `--desde` en hora de Madrid,
cuántos adjuntos y de qué tipo) — **nada de lo que ha escrito el instalador ni su nombre de WhatsApp**, porque el
asistente lo toma como una orden de Fran. El asistente hace la skill `alta-oportunidad` sobre ese chat (una
oportunidad por vivienda; si la RC ya tiene oportunidad, la documenta) y termina con el `avisar` de siempre: a
Fran solo le llega el resumen con «¿se la envío así o la quieres revisar tú?», y la propuesta sigue saliendo
solo con su «sí». Tope: `CONTESTADOR_ALTAS_DIA` (10 en 24 h, contados por `detalle.alta_at`); si no se puede
encargar (tope, asistente caído) Fran recibe la respuesta con «no la he podido encargar: dásela tú de alta». En
copia no se encarga: Fran ve «en real la daría de alta yo solo». Se apaga con `CONTESTADOR_ALTA=false`.

**REGLA — con el contestador en real, el modo proactivo no pregunta «¿La doy de alta?».** Contestaban los dos a la
misma petición (el proactivo a los 10 min, el contestador a los 15) y la pregunta se quedaba sin respuesta.
`asistente_proactivo.js` se apaga solo con `CONTESTADOR_ENABLED=true` + `CONTESTADOR_MODO=real` (salvo
`CONTESTADOR_ALTA=false`).

## Instaladores SIN obra: también se les contesta (2026-11-16)

Fran, 16/11/2026, tras ver días sin respuesta el chat de Alejandro MultiServicios (un instalador que mandó
las fotos de la caldera de un cliente y preguntó «dime qué datos necesitas»): «sí, amplíalo». Nadie cogía a
un instalador sin obra: el contestador solo miraba el universo de la ronda (obra viva) y la bienvenida no
escribe a quien no es nuevo, a una cuenta de empresa ni a quien dice «soy instalador».

**REGLA — el contestador contesta también a un INSTALADOR sin obra viva** (`clasificarSinObra`):
- **registrado**: partner `INSTALADOR`/`DISTRIBUIDOR`/`OTRO` con ese teléfono (también el de la landing y
  los de avisos) y sin ninguna obra en marcha;
- **solicitud**: solo pidió entrar como instalador (`instalador_solicitudes`);
- **desconocido**: el número no está en ningún sitio de la app (el mapa de `bienvenida._telefonosConocidos`),
  es un móvil español, no tiene fila en `wa_bienvenidas` y no es su primera vez (si en el chat no hay nada
  nuestro y empezó hace menos de 6 h, es de la bienvenida). El cerebro mira si es un instalador: **si no lo
  es, CALLAR** (ante la duda, también).
- Un cliente sin obra viva, un certificador, un usuario o un número descartado siguen sin contestarse.

**Qué se le dice (caso G del cerebro)**: lo que necesitamos para calcular la ayuda de su cliente (dirección o
referencia catastral; radiadores o suelo radiante, con foto; la aerotermia, marca y modelo o el presupuesto;
nombre y teléfono del titular; ventanas o aislamiento si los hay), que el CEE inicial va **antes de facturar**,
y el vídeo para instaladores (`{ENLACE_VIDEO_INSTALADORES}`, `CONTESTADOR_VIDEO_INSTALADORES`, por defecto
el de brokergy.es). Si ya mandó algo de un cliente y pregunta qué falta, se acusa lo recibido y se le pide
solo lo que falta. Si manda los datos de un cliente sin preguntar nada → ESCALAR («dar de alta la
oportunidad…»). Comisiones, precios u obras que no están → ESCALAR.

**En real, a Fran le llega «He contestado a…» cuando el que no tiene obra ha mandado adjuntos** (`leadSinObra`):
es un lead nuevo y hay que darlo de alta; lo que manda NO se guarda solo (no hay obra donde guardarlo).

Seco del 16/11/2026 con el chat de Alejandro tal como estaba (`--antes`): con la primera versión del caso G
lo escalaba («manda fotos de un cliente»); con la segunda contesta «perdona la tardanza, recibidas las fotos de
la caldera; para calcularle la ayuda necesito también…», el CEE antes de facturar y el vídeo.

## Lo que manda se GUARDA antes de contestar (2026-11-10)

Fran: «me va a dejar dos facturas. Reviso la conversación, reviso el expediente, guardo las facturas y le
digo: vale, pues ahora solo quedaría el tema del RITE. Y le envías un mensaje parecido al que ya le habíamos
enviado para saber si lo tiene o no». Caso que lo destapó: C2 del 10/11/2026, un instalador mandó las dos
facturas de 26RES060_175 y la copia le contestaba «recibidas las dos facturas», pero el expediente seguía
con **cero** facturas: nadie las había guardado.

Fuente única: [contestadorDocumentos.js](../../../implementation/backend/services/contestadorDocumentos.js),
en dos tiempos: `planear` (no escribe; corre dentro de `decidir`, también en seco, por el gancho
`ctx.alClasificar` de `procesarChat`) y `ejecutar` (guarda).

**REGLA — se guarda solo lo que la app habría guardado, por el MISMO camino, y nada dudoso**:
- **FACTURA** (PDF o foto) → «Facturas de la instalación» (`DOC_FACTURAS`) con `subirFicherosASlot`, entra
  en las facturas del expediente (`addFacturaToExpediente`) y se LEE (`facturaAutoOcr`), como por el enlace
  del instalador.
- **CERTIFICADO RITE** → «7. LEGALIZACION RITE/{nº} - Certificado RITE.pdf» + `cert_rite_drive_link` y su
  sello por la RPC de merge (`syncRiteToExpediente`), y se LEE (regla 27.b). Solo si el expediente **aún no
  tiene certificado**, nunca pisando uno en Drive, y nunca uno de OTRA obra nuestra. Esa comprobación
  es la de los PDF que sube un tercero por un enlace, `utils/pdfDelExpediente.js` (con `mupdf`): **si el servidor no la tiene, el RITE no se
  guarda solo** y se le dice a Fran (`comprobadorPdf`; el 10/11/2026 se desplegó el contestador antes que
  ella, que era trabajo de otra sesión: en cuanto llega, el RITE entra solo sin tocar nada).
- **FOTOS** (de obra o de placa) → el apartado que propone el REPARTIDOR de siempre, solo con confianza
  ALTA en la obra Y en el apartado; en un apartado de UNA foto, solo si está vacío (nunca se pisa).
- Todo con confianza ALTA en la obra, de una obra que está en la app (no una NUEVA, no un CEE directo), sin
  repetir el mismo fichero, como mucho 12 por chat.
- **Lo demás NO se guarda solo** (DNI, CIFO o anexos firmados, Memoria RITE, CEE, presupuesto, justificante
  de pago…): se le dice a Fran qué es y por qué no («No lo guardo yo (míralo tú)»).

Lo guardado se apunta en `whatsapp_media_importada` (sale «ya colocada» en «Traer del WhatsApp», regla
68.b, y no se guarda dos veces). En la fila del contestador va `detalle.guardar`: lo planeado y lo hecho,
**sin ficheros** (regla 21).

**REGLA — en MODO COPIA no se guarda nada hasta el «C12» de Fran; en real, justo ANTES de contestar.** La
respuesta dice «ya las tengo en el expediente» y eso tiene que ser verdad cuando le llega: el «C12» primero
vuelve a bajar los ficheros del chat y los guarda, y si algo no entra **no manda nada** y lo dice; en real,
un fallo al guardar pasa la respuesta a ESCALAR («no he podido guardar…, iba a decirle…»). Con
`CONTESTADOR_GUARDAR=real` se guarda de verdad aunque las respuestas sigan en copia; al revés no se puede
(modo real ⇒ guardar real). En real, la subida avisa al staff como cualquier otra (`uploadNotifier`).

**Lo que sabe el cerebro para decir «ahora solo quedaría el RITE»**: lo que acaba de mandar, con su nota
(«YA GUARDADO en el expediente» / «sin guardar: lo mira Fran»), que sale del dossier y no se le vuelve a
pedir; **lo del instalador en esa obra** (`situacionInstalador`: certificado RITE sí/no, si la Memoria la
preparamos y se la mandamos a firmar, el CIFO, las facturas, y si con ese instalador firma Fran con su
certificado —regla 171—, contando ya lo que se guarda ahora); su enlace `/instalador/:id` como marca
`{ENLACE_INSTALADOR}` (solo en el chat de un instalador), y **lo que ya le pedimos antes**
(`pedidosAnteriores`: los mensajes de la app a ese número de los últimos 90 días que hablan de RITE,
factura, CIFO o fotos, de esa obra, y **solo los anteriores a su último mensaje**: en el seco con
`--antes`, sin ese corte, nuestra respuesta real de después se colaba como «lo que ya le pedimos»)
para pedírselo **con palabras parecidas**. La TAREA: acusar lo guardado
en concreto («Recibidas las dos facturas, ya las tengo en el expediente») y, en la misma respuesta, lo que
le queda a él, como mucho dos cosas. El RITE: sin certificado y con la Memoria mandada → que nos falta la
memoria firmada y el certificado, en el mismo enlace; sin Memoria nuestra → si ya lo tiene o quiere que se
la preparemos; con la Memoria preparada sin mandar, o si dice «prepáramela» → a Fran; si firma Fran con su
certificado, ni RITE ni CIFO. A un cliente, lo del instalador no se le pide.

## Qué le dice: el cerebro

El prompt junta lo que ya existe y está medido: el CONOCIMIENTO del proceso (`botPrompt`), el DOSSIER de la
obra con los enlaces como MARCAS, lo que acaba de llegar y aún no está colocado (no se vuelve a pedir), la
conversación de 7 días y, al final y mandando sobre todo, la TAREA en la voz de Fran: los casos A–F de la
skill `contestar-cliente` (lo que le falta → se le pide con su enlace; la pelota es nuestra → «en revisión,
a los revisores no conviene presionarles…»; CEE inicial, obra, CEE final, cobro), de tú, sin presentarse,
sin emojis ni firma, **seis líneas como mucho, como mucho DOS cosas pendientes y UN enlace** (la primera
pasada en seco listaba todo el dossier tras acusar una factura).

**REGLA — se ESCALA, no se contesta,** cuando el dossier no lo responde (dinero, IRPF, un trámite, un caso
raro: eso va al INVESTIGADOR, arriba, desde el 16/11/2026), y **va derecho a Fran (`para_fran`)** cuando pide
hablar con una persona o pregunta si es un programa; se queja en serio o quiere cancelar o cambiar algo
(titular, cuenta, la obra); pide que DECIDAMOS un precio nuestro, un descuento o una excepción, o que Fran
REVISE su presupuesto u oferta (el instalador que manda «lo que le voy a pasar de instalación, por si hay
que ajustar algo»); o es algo que tiene que firmar Fran. Hasta el 16/11/2026 el dinero, el IRPF y lo legal
o fiscal iban derechos a Fran, con un «Recibido, lo miro y te digo» al cliente.

**REGLA — el código remata lo que escribe el modelo** (`rematar`): los ENLACES (marcas → URL real; una URL
escrita por el modelo se quita y se avisa, como en la ronda), los PÁRRAFOS, fuera emojis y firma, un
RESPONDER vacío pasa a ESCALAR, una acción desconocida es ESCALAR, y el acuse es una frase de ≤ 160
caracteres sin enlace. **Concreto no es recitar lo recibido** (19/11/2026, 26RES093_14): a Manu, que mandó dos
facturas en Word y dos audios, le salió «Las dos facturas en Word y tus audios sobre el concepto y la calle Niños
los reviso yo a mano y te digo si están bien»; Fran habría dicho «Perfecto, Manu, las facturas de Alberto las
miro y te digo». El prompt (los dos, el rápido y el investigador) pide el asunto en pocas palabras y no la
lista, y un acuse con «a mano», «yo mismo» o «personalmente» lo cambia el código, como los de «un compañero»,
por «Lo de <tema> lo miro y te digo.» (o «Lo miro y te digo.» sin tema).

**Cerebro**: CLAUDE (Sonnet) con la SUSCRIPCIÓN, en el contenedor `asistente`, por `POST /contestar` del
vigía: **un carril aparte** de los trabajos de Fran (su propia cola, 4 en espera como mucho → 429), así que
un trabajo largo de Fran no deja a un cliente sin contestar y al revés. Es un `claude -p` SIN herramientas
([contestador_claude.js](../../../implementation/backend/scripts/contestador_claude.js): `--tools ""`,
`--system-prompt` propio, sin settings ni MCP, sin sesión guardada, tope 1 $ por llamada, desde una carpeta
vacía y sin `ANTHROPIC_API_KEY`), así que no lee ficheros ni toca nada: piensa y devuelve el JSON. Su
consumo va a `scratch/asistente/contestador.jsonl`, aparte del de Fran: **no cuenta para el tope de 40
trabajos al día**. Si Claude no está o falla, GEMINI con el mismo prompt y su esquema (respaldo), y se dice
cuál fue. **En modo real, una respuesta de Gemini de RESPALDO no sale sola: va a Fran como copia**
(`modoDeFila`; su acuse de un ESCALAR sí sale). El 11/11/2026 Claude devolvió un JSON roto con una gestoría
que acababa de darnos el correo para las memorias RITE, y Gemini le contestó que aceptara una propuesta. Medido el 10/11/2026: la sobrecarga de una llamada sin herramientas es de ~300 tokens y 3-8 s; una
respuesta real, ~9.000 tokens de entrada y 19 s.

**Lo medido en seco (10/11/2026, chats reales del triaje del 08/11 y cinco casos inventados):** de 14 chats,
4 ya estaban contestados y del resto, tras tres vueltas al prompt, 5 respuestas buenas para mandar tal cual
(acuse de una factura con lo que falta y su enlace; qué es la máquina de fuera y la de dentro; el contacto
del fontanero), callar donde la app o el asistente ya habían dicho lo suyo, y a Fran el presupuesto que un
instalador quería que le revisara. Los inventados: dinero, queja y «¿eres un programa?» → a Fran; «¿cómo
va?» en revisión → la respuesta de siempre; «vale, gracias» → callar. Tres cosas que salieron y se
corrigieron: borradores con TODA la lista del dossier (ahora seis líneas, dos cosas, un enlace), un rótulo
«Sobre la obra de … (TITULAR PTE):» y acuses con «un compañero», «ahora mismo» o «lo siento» (el código
los cambia por «Lo miro y te digo.»). **Si pregunta si es una persona o un programa, no se le contesta: se
le pasa a Fran, sin acuse; nunca dice que es una persona.** Ninguna escritura en la BD (candado).

**Y si contesta a un SEGUIMIENTO** (15/11/2026, [el SEGUIMIENTO](el-seguimiento-que-no-se-quede-nada-pendiente.md)):
el dossier lleva un bloque con lo que se le ha preguntado a ese teléfono (`bloqueSeguimiento`: la obra, la fase
y lo que se le dijo) y el cerebro devuelve además `seguimiento: [{numero, resultado, cuando, nota}]`, con
`resultado` en SIGUE · NO_SIGUE · MAS_ADELANTE · PENSANDO (lo que no es ninguno, no se apunta); el código lo valida (enum, fecha
AAAA-MM-DD o nada, nota ≤ 300, como mucho 10) y lo aplica `seguimientoWhatsapp.alContestar`. A Fran le llega
en el mismo aviso, «Del seguimiento: …»; si es lo único (el mensaje se calla), con «ha contestado al
seguimiento».

## Topes, en el CÓDIGO

6 respuestas por chat en 24 h (móviles: un bot de WhatsApp Business del otro lado no respeta la medianoche),
120 al día en total, 2 por vuelta (eran 3 y 40 hasta el 21/11/2026: arriba). Pasado un tope, a Fran. Con la BD caída (pausas) no se contesta: 503 y se
reintenta (ante la duda, callar). Un fallo suma un intento y vuelve en 5 min; al tercero, ERROR.

## MODO COPIA (los primeros días)

**REGLA — mientras `CONTESTADOR_MODO` no sea `real`, a nadie de fuera le llega nada.** Lo que se le habría
contestado va al grupo de Fran («BROKERGY - CHAT», `CONTESTADOR_DESTINO` →
`ASISTENTE_WHATSAPP_GRUPO` → `WHATSAPP_ADMIN_CHAT`) con su número:

```
*C12 · Contestaría a Ana García (cliente)* · 26RES060_999
Escribió:
> 10/11 10:03  Ahí va la factura

Le contestaría:
> Hola Ana, recibida la factura, perfecto.
> …

Guardaría en el expediente:
- Factura de la instalación → Facturas de la instalación (26RES060_999)

_Modo copia: no he guardado nada y no le ha llegado nada. «C12» lo guarda y le manda esto; «C12, dile además…» lo cambia._
```

**REGLA — Fran contesta con «C12» a secas, y con «C12, dile además que…» si quiere cambiar algo** (Fran,
10/11/2026: «que en lugar de poner manda C4, que solo sea C4. O te pongo C4, dile además que no sé qué, y ya
lo terminas de redactar»). «C12» (también «manda C12», «vale C12», «C2 y C4») lo hace el **vigilante sin
despertar a Claude** ([utils/ordenContestador.js](../../../implementation/backend/utils/ordenContestador.js),
en `vueltaUnica`): guarda lo suyo, lo envía tal cual y le dice cómo ha ido. «C12, dile además…» va a
Claude: su mensaje ES el «sí» para ese envío, así que redacta el texto final con lo que pide Fran, en su
voz, y lo manda sin volver a preguntar (`contestador.js enviar C12 --si "<literal>" --texto "<final>"`, que
pasa por el mismo remate: sin emojis ni firma, y sin marcas `{ENLACE_…}` sin sustituir). Las dos por
`POST /api/whatsapp/contestador/:id/enviar {si, texto?}`, que guarda antes y solo envía si **el chat no ha
cambiado desde entonces** (su último mensaje es el mismo) y tiene menos de 24 h. Plan: 3 días en copia, revisar lo que
habría dicho, y `CONTESTADOR_MODO=real`. En real, a Fran le llega lo mismo con «He contestado a…».
**En REAL desde el 16/11/2026 15:53 (Madrid)** («Sí, a real», Fran): `CONTESTADOR_MODO=real` en el `.env` del
VPS (respaldo `.env.bak.contestador_real.20261116_145316`), backend recreado. En real también GUARDA lo que
mandan (`modoGuardar`). Las filas ya HECHAS en copia no se reenvían; volver a copia = quitar la línea y
recrear el backend.

El resumen del día va DENTRO del repaso de las 9:00 del asistente («*Lo de WhatsApp*»: esperas +
contestador, `GET /api/whatsapp/contestador/resumen`), nunca en un aviso aparte.

## Encendido y pruebas

- Nace **APAGADO** (`CONTESTADOR_ENABLED`): local escribe en la BD de producción y la sesión de WhatsApp es
  la del VPS. Para encenderlo en el VPS: aplicar `wa_contestador_schema.sql` (regla 150), `ASISTENTE_URL`
  ya apunta al contenedor, `CONTESTADOR_ENABLED=true` (copia por defecto) y reiniciar el vigía del
  asistente para que cargue `/contestar`.
- Variables: `CONTESTADOR_GUARDAR` (`real`: guardar de verdad con las respuestas aún en copia), `CONTESTADOR_SILENCIO_MIN` (15), `CONTESTADOR_TOPE_DIA` (120), `CONTESTADOR_TOPE_CHAT_DIA` (6),
  `CONTESTADOR_POR_VUELTA` (2), `CONTESTADOR_MAX_HORAS` (192), `CONTESTADOR_CEREBRO` (`claude`|`gemini`),
  `CONTESTADOR_MODELO` (`sonnet`), `CONTESTADOR_PLAZO_MS`, `CONTESTADOR_DESTINO`; el investigador,
  `CONTESTADOR_INVESTIGAR` (`false` lo apaga), `CONTESTADOR_MODELO_INVESTIGAR`, `CONTESTADOR_PLAZO_INVESTIGAR_MS`
  (300.000) y `CONTESTADOR_TOPE_INVESTIGAR_USD` (3). Para que el vigía cargue `/investigar` hay que reiniciar
  el contenedor `asistente` tras el despliegue.
- Lo que mira el investigador, a mano y en seco: `node implementation/backend/scripts/contestador_consultas.js
  oportunidad 26RES060_OP376` (o `expediente`, `cee`, `buscar`, `consultas`, `manual`).
- Rutas (`adminOInterno`): `GET /api/whatsapp/contestador?estado=`, `GET /contestador/resumen`,
  `GET /contestador/listado` (el Excel para repasar las respuestas: `contestador.js listado --dias 7`),
  `POST /contestador/probar {telefono}` (en seco: dice qué contestaría), `POST /contestador/:id/enviar`.
- `node implementation/backend/scripts/contestador.js bandeja [--dias 7] [--horas 2]`: lo que está SIN
  CONTESTAR (el criterio de la bandeja de la app: el último mensaje es del otro), sin la cortesía, con quién
  es. Es lo que usa el asistente cuando Fran pregunta «¿qué tengo sin contestar?»; la ruta
  `GET /api/whatsapp/bandeja/sin-contestar` acepta por eso también `x-internal-key` (`staffOClaveInterna`).
- `node implementation/backend/scripts/test_contestador_whatsapp.js` (sin red) y, contra el WhatsApp del
  VPS EN SECO, `node implementation/backend/scripts/contestador.js seco --tel 6xxxxxxxx` (o `--de` un
  triaje, `--max 8`, `--horas 720` para redactar también lo antiguo, `--sin-relevo` para redactar también lo
que lleva a mano una persona de la casa, `--antes` para repetir un chat ya
  contestado tal como estaba, con lo que GUARDARÍA): lee cada chat por `/conversacion`
  (solo lectura, con pausa), mira la BD con un CANDADO que bloquea toda escritura, redacta con el Claude
  del PC y deja el informe en `backend/scratch/contestador/` (fuera de git: conversaciones reales).

## Lo que queda

La ronda diaria al VPS (1b), las oportunidades que entran (fase 3) y el seguimiento periódico de obra y
propuestas (fase 4).
