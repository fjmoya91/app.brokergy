<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## Cuando MARWEN no responde: el envío por API dice de quién es el fallo (2026-10-15)

El 15/10/2026, al abrir «Enviar por API» de LOTE-2025-011, la pantalla solo decía
**«timeout of 30000ms exceeded»** (tres intentos, 09:21–09:25). Parecía un fallo nuestro,
pero era de ellos: `cae.marwen.es` y `pruebascae.marwen.es` (164.138.209.250) no
aceptaban conexiones **ni desde el VPS ni desde la oficina**, y `www.marwen.es` devolvía
503. Google respondía desde los dos sitios, así que nuestra red no era el problema.

**REGLA — un fallo de red de Marwen se dice con su nombre, y dice si se ha creado algo.**
[marwenService.js](implementation/backend/services/marwenService.js) (`errorDeRed`) usa un
agente por llamada que apunta si la conexión TCP llegó a abrirse:

| Qué pasó | Código | HTTP | Qué dice |
|---|---|---|---|
| No conectó (rechazada, tiempo agotado, DNS) | `MARWEN_NO_RESPONDE` | 503 | Es un fallo de Marwen. No se ha creado ninguna solicitud (en el dry-run: no se ha enviado nada). |
| Conectó, se mandó el POST y no contestó | `MARWEN_SIN_RESPUESTA` | 504 | **PUEDE** que la solicitud se haya creado: hay que mirarlo en beCAE antes de reenviarla. |
| Contestó con un error | `Marwen (status): …` | 422/500 | Como antes (`formatMarwenError`). |

**REGLA — tras un 504 NO se reintenta a ciegas.** Si el POST llegó a Marwen, la solicitud
pudo crearse aunque no contestaran, y reenviarla la duplicaría en el verificador. Por eso se
distingue «no conectó» de «no contestó»: con solo el mensaje de axios no se podía saber.

Los catálogos (provincias y localidades, que se leen en el dry-run al abrir la ventana) pasan
por el mismo traductor (`getCatalogo`), y la ruta `POST /api/lotes/:id/enviar-verificador-api`
respeta el 503/504 en vez de convertirlo en un 500.

Comprobado en local con cuatro casos: puerto cerrado (503, 25 ms), servidor que acepta y
no contesta (504, 30 s), el Marwen real caído (503, ETIMEDOUT, 21 s) y que el evento
`connect` también se dispara con TLS.
