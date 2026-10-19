<!-- conocimiento · área: whatsapp · las rutas de los enlaces son relativas a la raíz del repo -->

## Tras un despliegue el WhatsApp vuelve SOLO: el supervisor y sus plazos (2026-07-23 · 2026-10-19)

Cada `deploy.sh` recrea el backend y, con él, la sesión de WhatsApp (whatsapp-web.js con `LocalAuth`
en el volumen `whatsapp_auth`, que sobrevive). El **supervisor** del final de
[whatsappService.js](implementation/backend/services/whatsappService.js) (`AUTO`, cada 20 s) la lleva a
READY sin que nadie toque el panel: reintenta con espera creciente (5 s → 10 min), avisa por EMAIL
—no por WhatsApp, que es lo caído— si hace falta QR o tras 6 fallos seguidos, respeta el «Desconectar»
del panel (`manualStop`) y reinicia el cliente (`hardReset`, destruye Chrome) si se queda colgado.

**REGLA — «autenticado» y «arrancando» no tienen el mismo plazo.** Hasta el 19/10/2026 los dos
estados de paso compartían `WWA_STUCK_MS` = 240 s. Medido ese día en los dos despliegues: el primer
intento tras el reinicio queda **AUTHENTICATED a los 8 s y no pasa nunca a READY**; el supervisor lo
reiniciaba a los 240 s, y el segundo intento daba «Autenticado» y «Cliente listo» **en el mismo
segundo**. Resultado: ~4,5 min sin WhatsApp en cada despliegue, con el asistente de Fran parado y los
envíos de la app fallando. Ahora AUTHENTICATED tiene su propio plazo, `WWA_STUCK_AUTH_MS` = **75 s**
(cuando va bien tarda segundos), y el margen largo de 240 s se queda para INITIALIZING, que es el
arranque en frío de Chrome tras `build --no-cache` (con 90 s se cortaba: por eso se subió).

Lo que sigue exigiendo una persona: que WhatsApp invalide la sesión (dispositivo desvinculado o el
móvil más de 14 días sin conexión) → QR en Ajustes → WhatsApp. Variables: `WHATSAPP_AUTO_RECONNECT`,
`WWA_WATCHDOG_MS`, `WWA_INIT_TIMEOUT_MS`, `WWA_STUCK_MS`, `WWA_STUCK_AUTH_MS`, `WWA_ALERT_AFTER_FAILURES`.
Cómo mirarlo: `docker logs -t brokergy-backend | grep -E "\[wwa\]|watchdog"` («Autenticado», «Cliente
listo», «Reiniciando cliente — atascado en …»).
