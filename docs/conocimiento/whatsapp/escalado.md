<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «La API de Gemini va en NIVEL DE PAGO (2026-09-01)», en el CLAUDE.md antiguo.

### Escalado

`ESCALAR` cuando: lo pide el cliente, pregunta por dinero o plazos, se queja,
manda una foto o un documento, quiere cambiar algo, o el dossier no da la
respuesta. Al cliente se le contesta SIEMPRE algo (dejarlo mudo mientras avisamos
por dentro es lo mismo que ignorarlo: él no ve nuestro aviso) y al staff le llega
WhatsApp (`WHATSAPP_ADMIN_CHAT`) + email (`ADMIN_EMAIL`) con lo que ha escrito y
el `wa.me` para responderle.

**Al escalar NO se promete canal ni plazo**: no se sabe quién lo va a coger ni
cuándo. Aunque el cliente pida que le llamen, se dice "se lo paso a un
compañero", nunca "te llamará".

Un fallo del modelo o de la red **también escala**: es lo que pasaría si el bot
no existiera, y así ninguna pregunta se queda sin contestar ni se reintenta en
bucle.
