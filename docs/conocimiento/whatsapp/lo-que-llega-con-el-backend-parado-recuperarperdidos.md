<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «La API de Gemini va en NIVEL DE PAGO (2026-09-01)», en el CLAUDE.md antiguo.

### Lo que llega con el backend PARADO — `recuperarPerdidos()`

El listener de WhatsApp solo existe mientras el proceso está vivo. Los mensajes
que entran durante un reinicio —y **hay uno en CADA deploy**— llegan al móvil
pero no pasan por la app: no queda ni rastro, y el cliente espera una respuesta
que nadie sabe que debe. Medido el 25/08/2026 durante las pruebas: un mensaje
real se perdió así.

Al arrancar se repasan los chats etiquetados y se recoge lo que quedó sin
atender. Con freno, porque despertar de golpe conversaciones viejas es peor que
el problema que se arregla:

- Solo mensajes de las últimas `BOT_RECUPERAR_HORAS` (6).
- **Solo si nadie contestó después** — se recorre el historial hacia atrás hasta
  el último mensaje NUESTRO; lo que haya después es lo que quedó colgando.
- Solo si no está ya registrado (se compara por FECHA, no por texto: el cliente
  repite y el texto es frágil).
- Tope de `BOT_RECUPERAR_MAX_CHATS` (25).

**Purga**: `whatsapp_bot_mensajes` se limpia de lo que pase de `BOT_PURGA_DIAS`
(120), cada 12 h. **Lo PENDIENTE no se borra nunca aunque sea viejo**: si algo
lleva meses atascado ahí, borrarlo es esconder el problema.
