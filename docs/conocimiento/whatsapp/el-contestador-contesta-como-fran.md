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
   - descarta un grupo, un chat de la casa (el de Fran, el de administración), un chat **en pausa** (una
     persona de la casa escribió a mano: `wa_chat_pausas`, 24 h, la regla de las esperas) y lo que **ya
     está contestado**;
   - **REGLA — cualquier mensaje NUESTRO posterior al suyo lo da por contestado, también lo que salió
     por la app**: por la app van los WhatsApp que el asistente manda por Fran y los de los popups. Seco
     del 10/11/2026 (un instalador): el asistente le había contestado a las 20:31 y, sin contar eso, el
     contestador le volvía a decir lo mismo. Lo que se pierde (una pregunta suya y, detrás, un aviso de
     plantilla) lo recoge la ronda del día siguiente;
   - **la respuesta AUTOMÁTICA de su WhatsApp Business no es suya** (`esperasWhatsapp.pareceAutomatica`:
     de plantilla y con emojis o larga; aquí SIN reloj, porque la de un instalador llegó 12 min después de lo
     nuestro y las esperas miran 10): no se cuenta, y si es lo único que hay, no se contesta;
   - un **certificador** no se contesta (se lleva como a un compañero) ni un número **sin obra viva** (eso es
     de la bienvenida y del modo proactivo);
   - lo suyo de hace más de 48 h (`CONTESTADOR_MAX_HORAS`) → a Fran: contestar a lo de hace cuatro días, al
     volver de un apagón, delata a la máquina;
   - solo cortesía («gracias», «ok», un emoji) → CALLAR;
   - si no, hace con ESE chat lo mismo que la ronda (`rondaWhatsapp.procesarChat`: lee los adjuntos con
     Gemini, elige la obra, arma el DOSSIER en `soloLectura`) con el cerebro del contestador como redactor
     y **`siempreRedactar`**: si se calla lo decide el cerebro, no el análisis de la ronda, que daba «no
     espera respuesta» a «Ya me han instalado la aerotermia» o a «comprueba que esté todo bien» cuando
     detrás iba un aviso automático nuestro.
3. **Con la decisión**: RESPONDER → se le contesta; ESCALAR → a Fran, y al cliente, si hay, una frase de
   acuse («Lo miro y te digo»); CALLAR → nada.

## Qué le dice: el cerebro

El prompt junta lo que ya existe y está medido: el CONOCIMIENTO del proceso (`botPrompt`), el DOSSIER de la
obra con los enlaces como MARCAS, lo que acaba de llegar y aún no está colocado (no se vuelve a pedir), la
conversación de 7 días y, al final y mandando sobre todo, la TAREA en la voz de Fran: los casos A–F de la
skill `contestar-cliente` (lo que le falta → se le pide con su enlace; la pelota es nuestra → «en revisión,
a los revisores no conviene presionarles…»; CEE inicial, obra, CEE final, cobro), de tú, sin presentarse,
sin emojis ni firma, **seis líneas como mucho, como mucho DOS cosas pendientes y UN enlace** (la primera
pasada en seco listaba todo el dossier tras acusar una factura).

**REGLA — se ESCALA, no se contesta,** cuando pregunta cuánto o cuándo cobra, por facturas nuestras, IRPF o
impuestos; se queja o quiere cancelar o cambiar algo (titular, cuenta, la obra); pide hablar con una persona
o pregunta si es un programa; el dossier no lo responde; pide que se REVISE algo que solo mira Fran (un
presupuesto, una oferta, unos precios: el instalador que manda «lo que le voy a pasar de instalación, por si
hay que ajustar algo»); o es legal, fiscal o de otras ayudas.

**REGLA — el código remata lo que escribe el modelo** (`rematar`): los ENLACES (marcas → URL real; una URL
escrita por el modelo se quita y se avisa, como en la ronda), los PÁRRAFOS, fuera emojis y firma, un
RESPONDER vacío pasa a ESCALAR, una acción desconocida es ESCALAR, y el acuse es una frase de ≤ 160
caracteres sin enlace.

**Cerebro**: CLAUDE (Sonnet) con la SUSCRIPCIÓN, en el contenedor `asistente`, por `POST /contestar` del
vigía: **un carril aparte** de los trabajos de Fran (su propia cola, 4 en espera como mucho → 429), así que
un trabajo largo de Fran no deja a un cliente sin contestar y al revés. Es un `claude -p` SIN herramientas
([contestador_claude.js](../../../implementation/backend/scripts/contestador_claude.js): `--tools ""`,
`--system-prompt` propio, sin settings ni MCP, sin sesión guardada, tope 1 $ por llamada, desde una carpeta
vacía y sin `ANTHROPIC_API_KEY`), así que no lee ficheros ni toca nada: piensa y devuelve el JSON. Su
consumo va a `scratch/asistente/contestador.jsonl`, aparte del de Fran: **no cuenta para el tope de 40
trabajos al día**. Si Claude no está o falla, GEMINI con el mismo prompt y su esquema (respaldo), y se dice
cuál fue. Medido el 10/11/2026: la sobrecarga de una llamada sin herramientas es de ~300 tokens y 3-8 s; una
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

## Topes, en el CÓDIGO

3 respuestas por chat en 24 h (móviles: un bot de WhatsApp Business del otro lado no respeta la medianoche),
40 al día en total, 2 por vuelta. Pasado un tope, a Fran. Con la BD caída (pausas) no se contesta: 503 y se
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

_Modo copia: no le ha llegado nada. Si lo quieres mandar tal cual: «manda C12»._
```

«manda C12» lo envía tal cual (`POST /api/whatsapp/contestador/:id/enviar {si}`, o
`node scripts/contestador.js enviar C12 --si "<lo que dijo Fran>"`) solo si **el chat no ha cambiado desde
entonces** (su último mensaje es el mismo) y tiene menos de 24 h. Plan: 3 días en copia, revisar lo que
habría dicho, y `CONTESTADOR_MODO=real`. En real, a Fran le llega lo mismo con «He contestado a…».

El resumen del día va DENTRO del repaso de las 9:00 del asistente («*Lo de WhatsApp*»: esperas +
contestador, `GET /api/whatsapp/contestador/resumen`), nunca en un aviso aparte.

## Encendido y pruebas

- Nace **APAGADO** (`CONTESTADOR_ENABLED`): local escribe en la BD de producción y la sesión de WhatsApp es
  la del VPS. Para encenderlo en el VPS: aplicar `wa_contestador_schema.sql` (regla 150), `ASISTENTE_URL`
  ya apunta al contenedor, `CONTESTADOR_ENABLED=true` (copia por defecto) y reiniciar el vigía del
  asistente para que cargue `/contestar`.
- Variables: `CONTESTADOR_SILENCIO_MIN` (15), `CONTESTADOR_TOPE_DIA` (40), `CONTESTADOR_TOPE_CHAT_DIA` (3),
  `CONTESTADOR_POR_VUELTA` (2), `CONTESTADOR_MAX_HORAS` (48), `CONTESTADOR_CEREBRO` (`claude`|`gemini`),
  `CONTESTADOR_MODELO` (`sonnet`), `CONTESTADOR_PLAZO_MS`, `CONTESTADOR_DESTINO`.
- Rutas (`adminOInterno`): `GET /api/whatsapp/contestador?estado=`, `GET /contestador/resumen`,
  `POST /contestador/probar {telefono}` (en seco: dice qué contestaría), `POST /contestador/:id/enviar`.
- `node implementation/backend/scripts/test_contestador_whatsapp.js` (sin red) y, contra el WhatsApp del
  VPS EN SECO, `node implementation/backend/scripts/contestador.js seco --tel 6xxxxxxxx` (o `--de` un
  triaje, `--max 8`, `--horas 720` para redactar también lo antiguo): lee cada chat por `/conversacion`
  (solo lectura, con pausa), mira la BD con un CANDADO que bloquea toda escritura, redacta con el Claude
  del PC y deja el informe en `backend/scratch/contestador/` (fuera de git: conversaciones reales).

## Lo que queda

La ronda diaria al VPS (1b), las oportunidades que entran (fase 3) y el seguimiento periódico de obra y
propuestas (fase 4).
