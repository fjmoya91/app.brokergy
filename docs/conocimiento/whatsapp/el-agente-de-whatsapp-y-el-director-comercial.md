# El AGENTE de WhatsApp y el DIRECTOR comercial — diseño (PROPUESTA, 17/11/2026, sin construir)

> Estado: **propuesta**. Nada de esto está construido salvo lo que se cita como existente. Las decisiones
> abiertas están al final; hasta que Fran las tome, manda la regla 207 tal como está.

Fran, 17/11/2026: «las que contestan "reviso y te digo" no me gustan nada […] tenemos que crear un AGENTE
especializado que por cada petición analice lo que recibe, si es necesario lo guarde en historial (sin que
pete la BBDD) y conteste como si fuese yo. Si yo también contesto, que lea mi contestación antes de
repetirse […] una especie de director comercial al que yo le diga "mírate la simulación de tal persona" y
que reparta sesiones por cada una […] que optimice la RAM archivando las sesiones antiguas y las desarchive
si nos vuelven a escribir […] sobre una misma oportunidad que luego se convierte en expediente, que se
lleve de principio a fin hasta la documentación completa». Y después: «tengo un límite de 40 mensajes, pero
las contestaciones que estaba dando ahora no estaban mal; parece que estaba funcionando mejor».

## 1. Lo medido (16/11 15:53 → 17/11 15:00, el contestador en REAL)

**Lo que funciona:**
- **Las RESPUESTAS del contestador son buenas** (13 en ese tiempo): el acuse de fotos con lo que falta y su
  enlace (26RES060_274, _239, _246), el estado del expediente y lo que falta por firmar (_172, _251), «no
  montes nada hasta aceptar» a un instalador sin expediente, «no hace falta quitar los aires» (_287).
- **Las respuestas difíciles salen bien de la SESIÓN DE SU OBRA** (Claude Code con herramientas): a
  Alejandro MultiServicios (16/11 14:02: leyó 60 días de chat, MIRÓ las fotos, copió el tono del primer
  mensaje de Fran, adjuntó la guía de instaladores y el vídeo), y a la clienta de 26RES060_OP376 sobre lo que
  le decía su asesoría del IRPF (17/11 13:32 y 14:25: la deducción del 60 % y no la del 40 %, con sus
  condiciones). Las encargó la sesión «Simulaciones de oportunidades pendientes», que **ya hace de director
  sin llamarse así**: pasa el WhatsApp a la sesión de la obra, pausa el contestador en ese chat
  (`wa_chat_pausas`) y le enseña a Fran el borrador.

**Lo que falla: el acuse.**
- 36 ESCALAR, **29 con «lo miro y te digo» enviado**. Pedro Guerrero (25RES060_68, turno 421): «no me fío
  porque me hablan como una máquina».
- **El acuse se come el tope**: `respuestasDeHoy` cuenta TODO lo enviado en 24 h y 29 de esos 40 eran
  acuses. Desde las 14:11 del 17/11, tres respuestas buenas (turnos 480, 481, 483) fueron a Fran «por el
  tope del día».
- **El tope por chat no frena los acuses** (solo mira `RESPONDER`): la clienta de OP376 recibió 7 mensajes
  en 18 h, 5 de ellos acuses, dos casi iguales con 16 min de diferencia (10:50 y 11:06). El commit
  `90da2436` (rama `claude/competent-williams-3619a8`, sin desplegar) deja uno por asunto.
- **Se contesta lo que no es pregunta**: un instalador que solo mandaba los CUPS y un comentario recibió tres
  «lo miro y te digo» seguidos (turnos 460, 462, 474).
- **El investigador ni ve ni oye**: «No puedo ver su contenido» (capturas de la asesoría, turno 457), una nota
  de voz que quedó como `[audio]` sin transcribir (turno 458). Lo que llegó en un turno anterior no lo vuelve
  a ver. La sesión de obra sí lo ve (lee la imagen).
- **No puede HACER**: mandar la guía o el vídeo, dar de alta, simular, preparar la memoria. Lo que exige
  hacer algo acaba en acuse.

**Conclusión**: hay tres niveles y dos funcionan — el rápido para lo rutinario y la sesión de obra para lo
difícil —; lo que falla es el ACUSE que se pone entre los dos.

## 2. Los principios del agente

1. **Nunca un acuse vacío.** Tres salidas: CONTESTAR, CALLAR o ENCARGAR (y mientras dura el encargo, al
   cliente no le llega nada del agente). La única frase de espera posible, si Fran la quiere (decisión 1),
   es UNA por asunto, concreta y con plazo real.
2. **Leer antes de hablar**: el chat de 60 días, lo que Fran escribió a mano, la MEMORIA de la obra y la BD.
3. **Ver y oír**: las fotos y capturas las mira el modelo (no una descripción de Gemini) y las notas de voz se
   transcriben siempre; lo que no se ha podido ver se dice, nunca se rellena.
4. **Lo que se puede hacer, se hace**, de un catálogo cerrado (§4).
5. **Una sola voz**: contestador, esperas, seguimiento y bot acaban siendo el mismo agente, con UN tope por
   chat que cuenta todo lo que sale.
6. **Lo de Fran es de Fran**: persona o programa, queja seria o cancelación, precio nuestro o excepción,
   firmar → al cliente nada, a Fran el borrador hecho, «C12» lo manda.
7. **Si Fran escribe, manda Fran**: su mensaje pausa al agente en ese chat (hoy 30 min, renovable con cada
   mensaje suyo) y entra en la memoria; al volver, el agente parte de lo que dijo.
8. **El código remata y envía** (enlaces por marcas, sin emojis ni firma, largo, ACK de la regla 39), nunca
   el modelo.
9. **Lo que no es pregunta no se contesta** (datos, «ok», «gracias», un comentario), salvo para cerrar algo
   que pedimos: «Perfecto, con los dos CUPS ya puedo seguir».

## 3. La arquitectura: tres niveles y un director

```
Mensaje (VPS) ─► ROUTER (código, existe): quién, qué obra, ráfaga, ¿Fran escribiendo?, ¿encargo abierto?
                  │
                  ▼
   NIVEL 1 · RÁPIDO (existe: contestadorCerebro, Sonnet sin herramientas, ~20 s)
     dossier + MEMORIA + chat + lo llegado (visto y oído)
     ├─ RESPONDER ─────────────────────────────────► sale (topes, franja, ACK)
     ├─ CALLAR
     └─ DUDA ─► NIVEL 2 · INVESTIGADOR (existe: solo lectura; se amplía §4)
                 ├─ RESPONDER ─────────────────────► sale
                 ├─ FRAN ─► a Fran el borrador, al cliente NADA, «C12» lo manda
                 └─ ESPECIALISTA ─► ENCARGO (wa_encargos) ─┐
                                                           ▼
   NIVEL 3 · SESIÓN DE LA OBRA (PC, Claude Code con todo) ◄── DIRECTOR COMERCIAL (PC)
     simula, mira la propuesta, genera el CEE, da de alta, lee la asesoría…
     redacta → sale con el «sí» de Fran (o sola, en los tipos que él autorice: decisión 4)
```

Cuándo es **ESPECIALISTA**: hay que calcular o rehacer algo (simulación, propuesta, CEE), dar de alta una
obra nueva, leer un documento largo de un tercero (asesoría, presupuesto), o el investigador no puede verlo.
Cuándo es **FRAN**: los casos del principio 6.

## 4. Lo que el agente puede mirar y hacer (catálogo cerrado)

**Mirar** (nivel 2; hoy `contestador_consultas.js`): `expediente`, `oportunidad` (con la simulación),
`cee`, `buscar`, `consultas`, `manual` y, NUEVO:
- `chat <tel> --dias 60`: la conversación larga, con los mensajes de Fran a mano marcados;
- `memoria <tel> [obra]`: la fila de `wa_memoria`;
- **los adjuntos del turno y de los turnos abiertos como FICHEROS** en una carpeta por turno
  (`scratch/contestador/turno-<id>/`, en el volumen que comparten `backend` y `asistente`), con su
  `--add-dir` solo para esa carpeta: el modelo los LEE (imágenes, PDF) como en la sesión de Alejandro;
- notas de voz siempre transcritas (si falla, se reintenta una vez y, si no, se dice «no he podido oírla»).

**Hacer** (lo ejecuta el CÓDIGO a partir de lo que devuelve el modelo, con topes; el modelo no escribe):
- guardar documentos (existe: `contestadorDocumentos`);
- mandar un RECURSO del catálogo detrás del texto, como hace la bienvenida con el vídeo: guía de
  instaladores (PDF), vídeo de clientes, vídeo de instaladores, guía del IRPF, formulario, enlaces de
  subida/aceptación/instalador (marcas `{RECURSO_*}` y `{ENLACE_*}`);
- abrir una ESPERA (existe: `wa_esperas`) cuando se le pide algo;
- abrir un ENCARGO al director (nuevo, §6);
- avisar a Fran («Para ti:», existe).

## 5. La memoria (sin reventar Supabase)

Tabla nueva `wa_memoria`, **una fila por teléfono y obra** (`tel9`, `oportunidad_id` o `expediente_id` o
`cee_id`, o ninguno para un instalador sin obra):

| Campo | Tope | Qué |
|---|---|---|
| `resumen` | 2.500 caracteres | quién es, su papel, cómo habla, en qué está su obra; se REESCRIBE, no crece |
| `hechos` | 15 × 200 | lo que ha dicho y no está en la BD («la titular será su madre», «la caldera se quedó en el cuarto») |
| `compromisos` | 10 × 200, con fecha | lo que le hemos prometido y para cuándo |
| `ultimo_de_fran` | 500 + fecha | lo último que Fran le escribió a mano |
| `updated_at`, `vigente_hasta` | — | lo superado se marca, no se borra al momento |

- La escribe el CÓDIGO con lo que devuelve el modelo en su JSON (`memoria: { resumen?, añadir[], quitar[] }`,
  como mem0: añadir, actualizar, quitar o nada), validado y recortado. Nunca transcripciones (el chat ya
  está en WhatsApp), nunca ficheros ni base64 (regla 19), nunca dinero que no salga de la simulación.
- Escritura por RPC de merge (reglas 21-22); los listados nunca traen la fila entera. Purga: 180 días sin
  actividad. Tamaño: 300 obras × ~4 KB ≈ 1,2 MB.
- **La voz de Fran no va en la BD**: `docs/conocimiento/whatsapp/voz-de-fran.md`, con 20-30 respuestas suyas
  reales elegidas (de los chats), que el prompt lleva como ejemplos. Se amplía cuando Fran corrige un
  borrador («C12, dile además…»): esa corrección es la mejor lección.

## 6. El DIRECTOR comercial (PC)

> **26/11/2026** — el director se ha concretado como DIRECCIÓN del equipo de agentes (regla 246):
> su ficha es `.claude/agents/director.md` y reparte por el tablero de `scripts/equipo.js`, con un
> dueño por fase (comercial, técnico, responsable técnico). Ver
> `docs/conocimiento/claude-automatizacion/el-equipo-de-agentes-roles-y-relevos.md`. De esta
> sección sigue pendiente la cola `wa_encargos` (lo que el agente del VPS le encarga al PC).

Una sesión fija del Code tab, **«DIRECTOR COMERCIAL»**, que sustituye a «CENTRO DE OBRAS» y a lo que hoy
hace a mano «Simulaciones de oportunidades pendientes». **El protocolo vive en una skill
(`director-comercial`) y el estado en la BD**, no en la memoria de la sesión: se puede vaciar o recrear sin
perder nada.

- **Se despierta** cada 10-15 min (bucle con `ScheduleWakeup`, sin hacer nada si la cola está vacía) y
  cuando Fran le escribe («mírate la simulación de X», «¿qué tienes pendiente?»).
- **Cola** `wa_encargos` en el VPS: `id`, `obra`, `tel9`, `que` (≤ 1.000), `borrador`, `origen`
  (agente | Fran | parte), `estado` (PENDIENTE → EN_SESION → HECHO | CADUCADO), `sesion_id`, fechas. Ruta
  `GET/PATCH /api/whatsapp/encargos` (adminOInterno).
- **Por cada encargo**: busca la sesión de esa obra con la regla de siempre (también archivadas; por nº de
  expediente, por OP, con y sin «26»; hoy solo está escrita en la memoria de Claude, «una sesión por obra»,
  y pasa a la skill), la DESARCHIVA si hace falta y le pasa el encargo; si no existe, la
  crea con el título canónico, la suelta (`detach_session`) y la mueve a su sección (OPORTUNIDADES, EN
  CURSO, REQUERIMIENTO, DOC. COMPLETA). **La misma sesión lleva la obra de la oportunidad a DOC. COMPLETA.**
  Mientras el encargo está abierto, el chat queda en pausa para el agente (`wa_chat_pausas`, como hoy).
- **RAM**: como mucho 3 sesiones de obra trabajando a la vez (medido el 08/11: con 7 se caen) y, antes de
  arrancar otra, ≥ 3 GB libres; si no, a la cola. **Archiva** las sesiones de OBRA sin actividad hace ≥ N
  días (decisión 3), sin turno en marcha ni pregunta pendiente a Fran; las que no son de obra (desarrollo)
  no se archivan solas: se le proponen a Fran una vez por semana. Medido el 17/11: 2,0 GB libres de 15,6;
  61 sesiones de obra y 63 de otras con ≥ 3 días sin uso; 27 procesos de Claude Code vivos (~3 GB) y 98 de
  node (~1 GB, sus MCP). Con la primera tanda se mide cuánto libera archivar.
- **Informe**: una línea a Fran por encargo terminado; el resumen, dentro del repaso de las 9:00.

## 7. Topes

- **Uno por chat que cuenta TODO lo que sale del agente** (respuesta, frase de espera, recordatorio,
  seguimiento): 4 al día. Hoy son 3 y solo frenan las respuestas.
- **El total diario cuenta solo lo que sale** y se fija en la decisión 2. El de 40 se puso como margen para
  una sesión no oficial de WhatsApp; contestar a quien te escribe es lo de menos riesgo (lo arriesgado es
  escribir el primero: WAHA, guía anti-bloqueo).
- Se mantienen la franja 7-21 h (regla 205), el ACK (regla 39), sin `sendSeen` ni `getChatById` en el camino
  de envío, y 2 por vuelta.

## 8. Cómo se examina antes de soltarlo

- **Banco**: los 147 ESCALAR de `wa_contestador` desde el 10/11, las respuestas que Fran escribió a mano (el
  chat se corta justo antes de su mensaje y se compara) y los casos de este documento.
- Seco con `--antes` y cada caso tres veces (pass^3: si no acierta las tres, ese tipo no pasa a real).
- Fran puntúa una muestra de 30: «tal cual / con cambios / no».
- Pasa a real **por tipo de mensaje** cuando: ≥ 90 % «tal cual», cero acuses vacíos, ≥ 95 % de acierto en
  lo que es de Fran.

## 9. Fases

| Fase | Qué | Dónde | Quién |
|---|---|---|---|
| 0 | Desplegar `90da2436` (un acuse por asunto, el correo de la casa, lo fiscal de `consultas/`) + que el tope por chat cuente todo y el total solo lo que sale + lo que no es pregunta se calla | VPS | la sesión «Contestador: resolver las escaladas sin acuse vacío», que tiene esos ficheros |
| 1 | Ver y oír (adjuntos como ficheros, audio siempre), chat de 60 días, catálogo de RECURSOS | VPS | una sesión nueva, después de la 0 |
| 2 | `wa_memoria` + `voz-de-fran.md` + «lo que dijo Fran» | VPS | ídem |
| 3 | ESPECIALISTA: `wa_encargos`, ruta, pausa; skill y sesión DIRECTOR con su bucle y la RAM | VPS + PC | ídem |
| 4 | Esperas, seguimiento y bot dentro del mismo agente y del mismo tope | VPS | ídem |

## 10. Decisiones de Fran (abiertas)

1. Cuando hace falta trabajo o solo puede contestar él: ¿al cliente nada (propuesta) o UNA frase concreta
   por asunto con plazo?
2. El tope diario total (hoy 40, contando acuses).
3. Archivado de sesiones de obra: ¿a los cuántos días sin actividad, y solo o con su visto bueno?
4. Qué puede mandar la sesión de una obra SIN su «sí» (pedir documentos, estado del expediente) y qué
   siempre con él (cifras, IRPF, propuestas, todo lo que comprometa).
