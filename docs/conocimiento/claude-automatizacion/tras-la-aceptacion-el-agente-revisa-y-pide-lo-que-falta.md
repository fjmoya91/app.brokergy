<!-- conocimiento · área: claude-automatizacion · las rutas de los enlaces son relativas a la raíz del repo -->

## Tras la ACEPTACIÓN, el agente revisa la documentación y pide lo que falta, o hace el CEE inicial (2026-10-22)

Al aceptar una propuesta, el acuse le mandaba al cliente la lista GENÉRICA de documentos para el CEE
inicial, aunque ya nos hubiera mandado la mitad. Y lo que faltaba de verdad lo tenía que pedir Fran a
mano: «revisa esto, a ver qué le falta y pídeselo». Caso de partida, 26RES060_245 (SERGIO MOYA,
22/10/2026): la «placa» de la caldera era la etiqueta con el código de artículo (no dice potencia) y
la casa no se ve desde la calle, así que faltaban las fachadas; el criterio del parte daba la placa
por buena porque hay una foto en su apartado. Eso solo lo ve alguien que MIRA la foto.

Decisión de Fran (22/10/2026): **que lo haga el agente**. Si falta algo, que lo pida él mismo; si no
falta nada, que se ponga con el CEE inicial. El 23/10 se cerraron los huecos que dejaba la primera
versión (aceptación desde la app, fotos por WhatsApp, vigilante, horario, instalador, borrador previo).

| Qué | Dónde |
|---|---|
| Encargo, acuse, destinatarios, índice, horario, vigilante y vueltas | [services/aceptacionAgente.js](implementation/backend/services/aceptacionAgente.js) |
| Lo que usa el agente: `estado` (solo lee) y `pedir` (el WhatsApp) | [scripts/aceptacion.js](implementation/backend/scripts/aceptacion.js) |
| Aceptación desde el enlace del cliente (con acuse) | `POST /aceptar/:id` de [routes/public.js](implementation/backend/routes/public.js) y `sendAcceptanceNotificationEmail` |
| Aceptación marcada por el equipo (sin acuse al cliente) | `PATCH /:id/estado` de [routes/oportunidades.js](implementation/backend/routes/oportunidades.js) |
| La vuelta cuando suben por el enlace | `vaciar` de [uploadNotifier.js](implementation/backend/services/uploadNotifier.js) → `retomarTrasSubida` |
| La vuelta cuando mandan fotos por WhatsApp | `alMensaje` de [asistenteCanal.js](implementation/backend/services/asistenteCanal.js) → `alMensajeEntrante` |
| Programados y vigilante (cada 5 min, en el VPS) | `aceptacionAgente.start()` desde `server.js` → `vuelta` |
| Lo que ve el parte en «Aceptados y sin encargar» | `detalleAgente` de [seguimientoRadar.js](implementation/backend/services/seguimientoRadar.js) |
| Lo que sabe el Claude del WhatsApp | [asistente_instrucciones.md](implementation/backend/scripts/asistente_instrucciones.md) |

**Cómo va:**

1. **Se acepta.** Por el enlace del cliente o marcándolo el equipo en la app: si es la PRIMERA
   aceptación, el cliente NO aporta su CEE y `ACEPTACION_AGENTE_ENABLED=true`, el servidor le encarga la
   revisión al Claude del WhatsApp por el mismo `/tarea` que el asistente de la app (`pedirTarea`, clave
   `aceptacion:<nº>`), con un texto que compone el SERVIDOR (`instruccion`).
2. **El acuse** (solo por el enlace del cliente; la aceptación de la app no le escribe): si el encargo
   ha entrado, ya no lleva la lista y dice «Ahora revisaremos la documentación que ya tenemos de tu
   vivienda y nos volveremos a poner en contacto contigo para pedirte lo que nos falte» (palabras de
   Fran), con el enlace por si ya tiene algo a mano. El aviso a administración lo dice («🤖 La
   documentación la revisa Claude»). **Si no ha entrado** (apagado, en local sin `ASISTENTE_URL`, el
   contenedor caído), el acuse sale como siempre, con la lista: nunca un «ya os diremos» que nadie va a
   cumplir.
3. **El agente**: `aceptacion.js estado <nº>` (el material del parte con `materialCee`, lo que falta
   mirando Drive con `faltantesPorDestino`, los apartados con ficheros, **si ya hay un borrador del CEE
   inicial** en `1. CEE / CEE INICIAL`, las notas del alta, el técnico y a quién se le escribe: cliente
   e instalador), MIRA las fotos, sube lo que llegó por WhatsApp sin subir (alta-oportunidad,
   `documentar`) e intenta las fachadas con Street View. Si falta algo, `aceptacion.js pedir <nº> --texto
   "…" [--slots …] [--a instalador] --enviar` y se lo cuenta a Fran en el grupo. Si no falta nada,
   `generar-cee-inicial` entera (que asigna al Agente IA y avisa al acabar, regla 101) **partiendo del
   borrador si lo hay** (`aplicar` conserva lo hecho y añade encima): en el 245 el Agente IA ya había
   dejado `26RES060_OP318 - CEE INICIAL_REVISAR.cex` con los huecos estimados en la oportunidad.
4. **Llega lo pedido**: por el enlace (el resumen de la tanda de `uploadNotifier`, 30 min de silencio) o
   como fotos, vídeo, documento o nota de voz al WhatsApp de quien se le pidió (`alMensajeEntrante`, 10 min
   de silencio: una ráfaga de doce fotos es UNA revisión). Si el agente había pedido algo y el CEE inicial
   sigue sin encargar, se le vuelve a encargar la revisión; con fotos por WhatsApp, primero las lleva a
   la obra (`alta_oportunidad.js chat <tel> --bajar todo` → `documentar`). Cada llegada es una ronda,
   hasta `MAX_RONDAS` (4, `ACEPTACION_AGENTE_MAX_RONDAS`).

**REGLA — `aceptacion.js pedir --enviar` es la ÚNICA cosa que el agente manda a un tercero sin el
«envíala» de Fran, y lleva sus topes.** Fran lo autorizó para este caso (22/10/2026); la regla 113
sigue valiendo para todo lo demás, y las instrucciones del asistente lo dicen así. Los topes van en el
script, no en la buena voluntad del modelo: oportunidad ACEPTADA, sin CEE aportado, CEE inicial sin
encargar (`seguimiento.cee_inicial` vacío o `PTE_ENVIO_CERT`, el criterio de «sin encargar» del parte),
con teléfono, **una vez por ronda** (`pedido_at` posterior al último `revision_at` = ya pedido) y sin otro
pedido programado; `--otra-vez` solo si Fran lo pide.

**REGLA — fuera de 9 a 21 h (Madrid) no se le escribe a nadie: se PROGRAMA.** Si alguien acepta a las
23:30, el agente trabaja igual, pero `pedir --enviar` deja el mensaje en `aceptacion_agente.programado`
(`para` = las 9:00 siguientes) y lo manda el servidor en su vuelta (`vuelta`, cada 5 min); solo entonces
se registra como pedido. Mismo horario que la reseña programada.

**REGLA — a quién: al CLIENTE por defecto, al INSTALADOR cuando lo tiene él** (`--a instalador`: las
fotos o la placa que hizo él, o un alta que vino de su chat). Al instalador, a su contacto COMERCIAL
(`partnerNotifyTarget(p, 'comercial')`, regla 44: fotos y documentación de la obra son asunto
comercial), saludando en genérico al canal general de una empresa, y diciendo de qué cliente y de qué
obra es. En el 245, Paco de GONZAGARRI.

**REGLA — el agente dice QUÉ falta; el saludo, el destinatario, el enlace y la firma los pone el
script.** El destinatario es el de la ficha (`destinatarioCliente`, el mismo que el acuse: con los
avisos desviados, la persona de contacto con el nombre del titular; o `destinatarioInstalador`), el
enlace es el de subida de la obra (`ensureUploadLink`), filtrado con `?need=` a los apartados de
`--slots` (que tienen que existir en ESA obra). Así el modelo no puede inventarse un enlace ni
equivocarse de persona.

**REGLA — un encargo que se calla AVISA.** Al cliente se le ha dicho «nos pondremos en contacto»: si a
las `VIGILANTE_H` (24, `ACEPTACION_AGENTE_VIGILANTE_H`) de un encargo el agente no ha pedido nada, no hay
nada programado y el CEE inicial sigue sin encargar, sale UN aviso al chat de administración
(`WHATSAPP_ADMIN_CHAT`) con el enlace al expediente (`alertado_para` = esa revisión; otra revisión, otro
aviso). Un trabajo caído —límites de la suscripción, el contenedor reiniciado— no puede dejar callado a
un cliente al que se le prometió algo. Y el parte lo dice en «Aceptados y sin encargar»: «Claude revisa
su documentación desde el …», «Claude le pidió al cliente el …: …», «… el … a las 9:00».

**REGLA — el estado vive en `documentacion.aceptacion_agente` y es clave PROTEGIDA** (`ronda`,
`revision_at`, `motivo`, `pedido_at`, `pedido`, `pedido_a`, `pedido_quien`, `programado`,
`alertado_para`), escrito con la RPC de MERGE; sin protegerlo, el primer autoguardado de la ficha lo
borraría y la llegada siguiente no reabriría nada. Lo pedido va además al historial del expediente
(`tipo: 'pedido_aceptacion'`, por CLAUDE), añadido con la RPC de merge (con una lista, `||` AÑADE).

**REGLA — lo que está en marcha se busca en un ÍNDICE, no en `documentacion`.** `app_settings`
`aceptacion_agente_seguimiento` = `{ <expediente_id>: { numero, oportunidad_id, desde, tels } }`. Cada
mensaje de WhatsApp que entra lo consulta (cacheado 60 s) y la vuelta lee solo esos expedientes: buscar
por un campo de `documentacion` descomprimiría la tabla entera (regla 22). Los `tels` (9 últimas cifras)
son los de a quién se pidió; un chat `@lid` se resuelve solo contra esos pocos. Sale del índice al
encargarse el CEE, al no existir o a los 45 días.

**Apagado en LOCAL** (`ACEPTACION_AGENTE_ENABLED=false`): local escribe en producción, y apagado no
arranca la vuelta ni mira los mensajes. En local además no hay `ASISTENTE_URL`, así que aunque se
encendiera el encargo no entraría y el acuse saldría con la lista de siempre.

**Lo probado** (22-23/10/2026, en local, en seco): `estado 26RES060_245` (vivienda «falta», caldera 1,
placa 1, FACHADA y PATIOS vacíos, el borrador `…_REVISAR.cex/.xml` del Agente IA, Sergio y Paco de
GONZAGARRI); `pedir 26RES060_245 --a instalador --slots FOTO_PLACA_CALDERA_ANTES --texto …` compone el
WhatsApp a Paco con el cliente, la obra y el enlace filtrado; el parte escanea igual (237 filas, 15 sin
encargar) y una vuelta con el índice vacío no hace nada. No se ha disparado una aceptación real (saldría
el acuse al cliente) ni un mensaje entrante real (la sesión de WhatsApp vive en el VPS).

**Tras tocarlo:** `node implementation/backend/scripts/test_aceptacion_agente.js`,
`node implementation/backend/scripts/auditar_rutas_sin_guardian.js` y
`node implementation/backend/scripts/aceptacion.js estado <nº>` con un expediente aceptado.
