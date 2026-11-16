# El SEGUIMIENTO: que no se quede nada pendiente — propuestas y material del CEE inicial (2026-11-15)

Fase 4 del **agente autónomo de WhatsApp**. Fran, 15/11/2026: «Simulaciones: si se le envía al cliente,
cada x tiempo se le pregunta si la han visto, si tienen dudas o si van a seguir adelante, con el objetivo de
dejarla abierta o cerrada. Igual si solo se le envió al instalador. Aceptadas: todos los días revisará si
falta algo para el CEE inicial […] cordiales, nada pesado […] Habrá que poner un watchdog a esas
conversaciones». Y el objetivo: que el agente trabaje solo y Fran intervenga para el visto bueno del CEE o
dudas concretas.

Fuente única: [services/seguimientoWhatsapp.js](../../../implementation/backend/services/seguimientoWhatsapp.js)
(sembrar, vuelta, watchdog, resumen), la cadencia en
[utils/seguimientoPasos.js](../../../implementation/backend/utils/seguimientoPasos.js) y los textos en
[utils/seguimientoTextos.js](../../../implementation/backend/utils/seguimientoTextos.js). Tabla:
[scripts/wa_seguimientos_schema.sql](../../../implementation/backend/scripts/wa_seguimientos_schema.sql).

## El problema, medido (15/11/2026)

- **172 oportunidades en ENVIADA y solo 3 RECHAZADA en toda la historia**: nadie cierra nada. De las ENVIADA,
  31 le llegaron al cliente, 86 solo al instalador (35 instaladores distintos) y 55 no tienen envío registrado.
- **19 expedientes con el CEE inicial sin encargar**, 11 de ellos sin el material (vídeo o fachada + patios, y
  la caldera con su placa: el criterio de `materialCee`, el mismo del radar).

## Cómo funciona

- **SEMBRAR** (cada 30 min): una fila en `wa_seguimientos` por cada propuesta viva (ENVIADA o PRE-ACEPTADO) y
  por cada expediente en `PTE. CEE INICIAL` con el CEE sin encargar. Una sola abierta por tipo + oportunidad.
  Lo que deja de estar vivo se CIERRA con lo que pasó (ACEPTADA, RECHAZADA, ENCARGADO). Una versión nueva de la
  propuesta enviada después reinicia la escalera; una fila que pasa de copia a real, también (la escalera
  gastada en copia no cuenta: a esa persona no le llegó nada).
- **A QUIÉN**: si la propuesta le llegó al cliente (`entregaPropuesta`), al cliente —o a su persona de
  contacto, si la ficha desvía los avisos—; si solo le llegó al instalador, al contacto COMERCIAL del
  instalador; sin envío registrado, al cliente. El CEE inicial, al que lo tiene que mandar (lo dice el agente
  de la aceptación) y el R3 al OTRO lado.
- **LA VUELTA** (cada 5 min, de 7 a 21 h y de lunes a viernes: `puedeInsistir`, regla 205): lo que vence se
  manda con PLANTILLA, **un mensaje por persona** (al instalador, todas sus obras juntas en una lista), el
  CEE primero (es lo que frena el dinero) y después ACEPTAR, RETOMAR, PRIMERO, SEGUNDO, PREGUNTA, CIERRE y el
  REPASO de lo atrasado.
- **EL WATCHDOG**: el mensaje que entra de alguien con un seguimiento abierto lo pasa a CONTESTADO al momento
  (el listener de la sesión, como las esperas) y para la escalera. El CONTESTADOR, que ya lee esa
  conversación para contestarle, dice además QUÉ ha contestado (`seguimiento: [{numero, resultado, cuando,
  nota}]` en su JSON) y aquí se aplica (`alContestar`). Lo que manda (fotos, facturas) lo guardan el
  contestador y el agente de la aceptación, que ya saben hacerlo.
- **REGLA — solo es RESPUESTA lo que llega DESPUÉS de haberle escrito a ESE teléfono en ese seguimiento, y
  solo el PRIMER mensaje tras cada toque mueve la escalera** (`comoRespuesta`; cada toque apunta
  `detalle.escritos[tel9]`). Medido el 16/11/2026, el primer día: Vicente (instalador) mandó seis mensajes
  sobre 26RES060_257 —fotos y «Empezamos hoy»— sin que le hubiéramos escrito nada del seguimiento, y cada
  uno movió un paso sus cuatro propuestas (OP104, OP245, OP396, OP411), que saltaron de «¿la has visto?» a
  «¿sigues o la aparcamos?». Ahora un mensaje de alguien a quien aún no se le ha escrito no toca la fila (la
  vuelta ya no le escribe mientras está hablando, 24 h); los demás de una ráfaga solo se apuntan; y el
  «otro lado» de un CEE cuenta solo tras su R3.
- **El CEE con el material COMPLETO es nuestro**: no se le pide nada a nadie; se le vuelve a pasar al agente de
  la aceptación (`revisarPorSeguimiento`, que hace el CEE con `generar-cee-inicial` y Fran le da el visto
  bueno), como mucho 3 al día y una vez cada 5 días hábiles por expediente.

## La cadencia (días hábiles, a las 10:00 de Madrid)

| Seguimiento | Fase | Cuándo | Qué dice |
|---|---|---|---|
| PROPUESTA | PRIMERO | 2 tras el envío | ¿La has podido ver? Dudas, y el enlace para aceptar |
| | SEGUNDO | 5 más | ¿Cómo lo ves? |
| | CIERRE | 7 más | La dejamos aparcada; si más adelante quiere, que escriba. **Cierra la oportunidad (RECHAZADA)** |
| | REPASO | lo enviado hace > 30 días y nunca seguido | Un único repaso; cierra a los 7 |
| | PREGUNTA | 5 tras una respuesta sin decisión | Una pregunta directa antes de aparcarla |
| | ACEPTAR | 3 tras un «sí» de palabra | El enlace de aceptación (dos veces como mucho) |
| | RETOMAR | la fecha que dio (o 30 días) | Retomarlo |
| CEE_INICIAL | PEDIDO | si nadie lo ha pedido | Lo que falta y el enlace de subida filtrado |
| | R1 · R2 · R3 · R4 | +2 · +3 · +3 · +5 | R2 explica por qué importa (el CEE inicial, registrado antes de las facturas); R3, al otro lado |
| | FRAN | cada 10 | Recordatorio corto y aviso a Fran, hasta 8 toques (AGOTADO) |

Lo que contesta el cliente o el instalador sobre una propuesta: **SIGUE** → PRE-ACEPTADO y ACEPTAR · **NO_SIGUE**
→ RECHAZADA con su razón en el historial · **MAS_ADELANTE** → RETOMAR en su fecha · **PENSANDO** → SEGUNDO a
los 5. Sin decisión clara, PREGUNTA (y el CIERRE ya no dice «no he sabido nada», sino «no he vuelto a saber
nada»).

## Las reglas

- **REGLA — la cadencia vive en `seguimientoPasos.js`**, no en el prompt ni repartida por el servicio.
- **REGLA — a la casa no se le escribe nunca.** BROKERGY aparece como prescriptor de sus propias propuestas
  y su contacto comercial es el teléfono del asistente (Fran): en la primera pasada en seco salía un
  «Hola Fran» por cada una. `TELS_CASA` (asistente, administración) y la empresa `BROKERGY` quedan fuera; esa
  propuesta va al cliente.
- **REGLA — solo a un MÓVIL** (6xx, 7xx): a un fijo no le llega un WhatsApp.
- **REGLA — el nombre sale de la FICHA del cliente, nunca de `referencia_cliente`** (que es la etiqueta del
  instalador): nombre y primer apellido; una EMPRESA se nombra por su razón social y se saluda a su
  representante. **Una ficha con nombre PROVISIONAL** («CL GOYA 15 - MOTILLA DEL PALANCAR», «PROPIETARIO LA
  SOLANA 55», «CALDERA CARBÓN»: 6 propuestas vivas el 15/11, todas dadas de alta por el instalador) se nombra
  ENTERA, como la escribió él, y a esa persona no se la saluda por ese «nombre» (`nombreProvisional`).
- **REGLA — un TER no es una vivienda**: en las fichas del terciario el texto dice «tu instalación».
- **REGLA — nada de «a él o a ti»**: los textos son neutros («si le surge cualquier duda»).
- **REGLA — un recordatorio del CEE inicial lo manda UNO**: con el seguimiento encendido, las esperas no
  recuerdan el motivo `CEE_INICIAL` y el `registrarPedido` del seguimiento va con `espera: false`. Un pedido
  nuevo del agente de la aceptación posterior al seguimiento DESPLAZA la escalera (no se pide dos veces).
- **REGLA — los topes van en el CÓDIGO**: una vez al día por persona; nada si ha hablado en las últimas 24 h
  o si una persona de la casa ha escrito en el chat (`wa_chat_pausas`); 25 al día, 8 a la hora, 3 por vuelta,
  y lo atrasado (REPASO) a como mucho 6 personas al día.
- **REGLA — MODO COPIA** (`SEGUIMIENTO_MODO` distinto de `real`): no sale nada ni se cambia ninguna
  oportunidad; Fran ve lo que se habría mandado, con un ejemplo entero, en el repaso de las 9:00
  (`GET /api/whatsapp/seguimiento/resumen`). `SEGUIMIENTO_PRUEBA=tel,tel` limita lo real a esos teléfonos.

## Lo medido en seco (15/11/2026, como si fuera el lunes 16)

`node implementation/backend/scripts/seguimiento.js seco --fecha 2026-11-16T08:00 --dia`, contra producción y
con el candado (ninguna escritura): nacerían **168 seguimientos para 95 personas**, 21 sin nadie a quien
escribir (sin móvil o solo con la casa) y el primer día saldrían **25 mensajes** (el tope): 8 del CEE inicial
y 17 de propuestas, 6 de ellos a instaladores con varias obras en un solo mensaje; 3 CEE con el material
completo irían al agente (y 5 más, por el tope, los días siguientes).

## Encendido y pruebas

- Nace **APAGADO** (`SEGUIMIENTO_ENABLED`): local escribe en la BD de producción y la sesión de WhatsApp es
  la del VPS. Para encenderlo en el VPS: aplicar `wa_seguimientos_schema.sql` (regla 150: RLS + GRANT en el
  mismo script), `SEGUIMIENTO_ENABLED=true` y, tras unos días en copia, `SEGUIMIENTO_MODO=real`.
- El watchdog necesita el CONTESTADOR encendido para saber QUÉ contestó; sin él, la fila pasa a CONTESTADO y
  la escalera sigue con PREGUNTA.
- Rutas: `GET /api/whatsapp/seguimiento`, `GET /seguimiento/resumen`, `POST /seguimiento/vuelta` (en seco
  por defecto) (**adminOInterno**); `POST /seguimiento/:id/cerrar` (ADMIN).
- `node implementation/backend/scripts/test_seguimiento_whatsapp.js` (sin red) y, contra producción en
  seco, `seguimiento.js seco [--fecha ISO] [--dia] [--json fichero]` (los teléfonos, enmascarados; el JSON
  lleva nombres: fuera de git).
