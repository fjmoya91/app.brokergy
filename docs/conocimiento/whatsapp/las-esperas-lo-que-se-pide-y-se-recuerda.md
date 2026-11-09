# Las ESPERAS: lo que se le pide a alguien por WhatsApp, si contesta y cuándo se le recuerda (2026-11-09)

Primera pieza del **agente autónomo de WhatsApp** que pidió Fran el 09/11/2026 («que si escribe a un
cliente, revise para ver si ha contestado, o algún webhook para saberlo en el momento»; «que
periódicamente revise y pregunte por cómo van las cosas»). Fuente única:
[services/esperasWhatsapp.js](../../../implementation/backend/services/esperasWhatsapp.js); tablas en
[scripts/wa_esperas_schema.sql](../../../implementation/backend/scripts/wa_esperas_schema.sql).

## El problema, medido

Lo que se pedía por WhatsApp se quedaba en el aire. El 08/11/2026 había pedidos de 2 y 4 días sin una sola
insistencia, y la ronda nocturna, que lo habría visto, no terminaba una pasada desde el 03/11 (corría en el
PC). Nadie sabía, sin abrir el chat, si el cliente había contestado.

## Cómo funciona

- **Nace una ESPERA cuando la casa PIDE algo**: `POST /:id/solicitar-faltantes` por WhatsApp (motivo
  `DOCUMENTACION`) y el pedido del agente tras la aceptación (`registrarPedido`, motivo `CEE_INICIAL`).
  Lleva el teléfono (9 dígitos), quién es, la obra, lo pedido y el enlace. **Una sola abierta por teléfono +
  obra + motivo**: un segundo pedido la renueva (plazo nuevo).
- **Se cierra AL MOMENTO**, sin ronda: el mensaje que entra de ese teléfono la marca `CONTESTADA` (el
  listener de la sesión: es el «webhook» que pedía Fran, y la sesión ya lo da), y una subida por el enlace
  (`uploadNotifier.vaciar`) la marca `CERRADA`. Un `@lid` se resuelve en una llamada, solo contra los
  teléfonos que esperan algo.
- **REGLA — un ACUSE no cierra la espera.** «Vale», «ok, gracias», «mañana te lo mando» (texto de hasta 60
  caracteres, sin pregunta ni enlace) se apunta y la espera sigue: lo pedido sigue sin llegar y el
  recordatorio a su hora es justo lo que hace falta. Un adjunto, una pregunta o una explicación sí la cierran:
  eso lo tiene que leer alguien.
- **REGLA — la respuesta AUTOMÁTICA de un WhatsApp Business no es una respuesta.** En la primera pasada en
  seco (09/11/2026) el «¡Gracias por escribirnos! Si es algo urgente…» de un instalador (26RES080_76) contaba
  como contestada. Se reconoce por las TRES cosas a la vez: llega a menos de 10 min del pedido, tiene frase de
  plantilla y lleva emojis o pasa de 120 caracteres (`esAutomatica`); «Gracias por tu mensaje, te escribo
  ahora» de una persona no lo es.
- **REGLA — si escribe una PERSONA de la casa, el agente se calla en ese chat 24 h.** WhatsApp no dice desde
  qué dispositivo salió un mensaje propio, así que la app APUNTA lo que manda justo antes de mandarlo
  (`whatsappService.marcarPropio`, en los cuatro `sendMessage`) y lo que llega por `message_create` sin estar
  apuntado lo ha escrito una persona (`wa_chat_pausas`). Un adjunto sin pie cuenta como nuestro si hemos
  mandado uno hace menos de 3 min: el error que se acepta es callarse de menos, que solo retrasa un
  recordatorio.
- **La VUELTA** (cada 5 min, en la franja de la casa —de 7 a 21 h— **y de lunes a viernes**, regla 205): lo que vence sin respuesta se recuerda con
  PLANTILLA (sin IA) — primer recordatorio a las 48 h hábiles, `max_intentos` 1 —; agotado, `VENCIDA` y al
  resumen.
- **REGLA — los topes van en el CÓDIGO**: horario, un recordatorio al día por persona, 30 al día, 8 a la
  hora y 3 por vuelta. El texto y el enlace los pone el código.
- **REGLA — MODO COPIA de salida** (`ESPERAS_MODO` distinto de `real`): no se le escribe a nadie; el
  recordatorio se apunta y Fran lo ve, con un ejemplo entero, en el repaso de las 9:00.
- **REGLA — el resumen va DENTRO del repaso de las 9:00 del asistente**, en el mismo mensaje
  (`asistente_vigia.js` → `GET /api/whatsapp/esperas/resumen`): dos avisos a la misma hora son ruido (el parte
  se apagó por eso). Si no hay nada, no se dice nada.

## El recordatorio

De tú, por el nombre de pila, sin emojis y sin tono de disculpa; al instalador o a la persona de contacto, con
el nº de expediente:

```
Hola Ana, ¿qué tal?

Te escribo por lo que te pedimos el 9 de noviembre:
· Foto de la placa de la caldera
· Factura de la instalación

Cuando lo tengas, se sube desde el móvil aquí:
https://app.brokergy.es/…

Si ya lo has mandado por otro lado, dímelo y lo busco.

¡Gracias!
*BROKERGY · Ingeniería Energética*
```

La salida de «ya lo he mandado por otro lado» es lo más frecuente (por email, al instalador) y la app no
tiene por qué saberlo.

## Encendido y pruebas

- Nace **APAGADO** (`ESPERAS_ENABLED`): local escribe en la BD de producción y la sesión de WhatsApp es la
  del VPS. Para encenderlo en el VPS: aplicar `wa_esperas_schema.sql` (regla 150: RLS + GRANT en el mismo
  script), `ESPERAS_ENABLED=true` y, tras unos días en copia, `ESPERAS_MODO=real`.
- Rutas (`adminOInterno`): `GET /api/whatsapp/esperas`, `GET /esperas/resumen`, `POST /esperas/vuelta`
  (en seco por defecto); `POST /esperas/:id/cancelar` (ADMIN).
- `node implementation/backend/scripts/test_esperas_whatsapp.js` (sin red) y
  `node implementation/backend/scripts/esperas.js seco --dias 14`: rehace lo pedido estos días desde el
  historial, lee cada chat en el VPS por `/conversacion` (solo lectura, con pausa) y dice quién contestó y a
  quién se le recordaría, con el texto entero. No escribe nada (candado).

## Lo que queda para las fases siguientes

Contestar (fase 2: con el dossier y la conversación delante, 3 días en copia), las oportunidades que entran
(fase 3) y el seguimiento periódico de obra y propuestas (fase 4). Una subida cierra la espera aunque falte
parte de lo pedido: lo que falte lo vuelve a pedir el agente de la aceptación o el barrido.
