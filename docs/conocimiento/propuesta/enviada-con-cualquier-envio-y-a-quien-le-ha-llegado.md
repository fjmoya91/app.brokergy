<!-- conocimiento · área: propuesta · las rutas de los enlaces son relativas a la raíz del repo -->

## ENVIADA con cualquier envío, y la lista dice A QUIÉN le ha llegado (2026-10-14)

26RES060_OP295 (Eufisina Guerrero) seguía en **PTE ENVIAR** con la propuesta v1 ya en el WhatsApp
de Instalaciones Marla. El popup solo pasaba a ENVIADA si la propuesta llegaba al **CLIENTE** (o al
TITULAR). Lo mandado al partner para que se lo pase al cliente, que es lo normal con los
instaladores, no contaba. Pero `/api/pdf/send-proposal` marca ENVIADA con **cualquier email**, así
que al partner con email sí pasaba y solo por WhatsApp no. Medido ese día: **18 oportunidades**
atascadas así (OP178, 195, 196, 214, 218, 231, 235–239, 244, 245, 247, 268, 273, 281, 295) y otras
30 en ENVIADA que solo tenía el partner.

**REGLA — cualquier envío que salga bien pasa la oportunidad a ENVIADA**, también si solo le llegó
al instalador o al partner (decisión del usuario). Vale para el popup (`EnviarPropuestaModal`), los
envíos antiguos de `ProposalModal` y el envío PROGRAMADO (`propuestaProgramada`, `algunEnvioOk`).
Siempre por `PATCH /:id/estado`, que mueve la carpeta de Drive.

**REGLA — un reenvío no hace retroceder la oportunidad.** Los envíos mandan `porEnvio: true`, y con
eso la ruta no toca una oportunidad que ya está ENVIADA, PRE-ACEPTADO o ACEPTADA. El desplegable
(sin `porEnvio`) sigue moviéndola a mano a donde se quiera.

**REGLA — la lista dice A QUIÉN le ha llegado**, debajo de la chapa ENVIADA/PRE-ACEPTADO: «→ al
cliente», «→ cliente + instalador» o, en ámbar porque pide una llamada al instalador para saber si se
la ha pasado, «→ solo al instalador» (y «a otro contacto» para el modo OTRO). Con el ratón encima,
los nombres. Componente `EntregaPropuestaTag.jsx`.

**REGLA — se CALCULA de `propuesta_versiones`, no se guarda aparte**
([utils/entregaPropuesta.js](implementation/backend/utils/entregaPropuesta.js)). El listado proyecta
`datos_calculo->propuesta_versiones` (~1 KB por fila, 3 KB la mayor: medido sobre 130) y devuelve solo
`propuesta_entregada`, sin las versiones. Desde hoy cada línea de `envios` lleva su `modo`. Las
anteriores no lo llevan, así que se casan con su destinatario por la etiqueta (`"{label} → …"`), y si
no casa pero la versión tenía un único modo, se toma ese. CLIENTE y TITULAR cuentan como cliente;
PARTNER e INSTALADOR, como instalador; el enlace copiado se dice aparte.

Las 18 se pasaron a ENVIADA con `node implementation/backend/scripts/enviadas_solo_instalador.js`, que
sin `--aplicar` trabaja en seco y llama a la ruta con `x-internal-key`. Historial: «Sistema (propuesta ya
enviada al instalador)». Tras tocarlo: `node implementation/backend/scripts/test_entrega_propuesta.js`.
