<!-- conocimiento · área: instalador-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app del INSTALADOR, fase 6: «Tu asistente», el chat que hace el presupuesto y adelanta lo que le toca (2026-11-22)

**Por qué.** Fran, 22/11/2026: «una fase nueva que sea el chatbot. Que, además de WhatsApp, sea un
asistente dentro de la app para él… que se pueda hacer por WhatsApp el presupuesto o a través del
asistente de la app dentro de su sesión de instalador». Y sobre el diseño: «debe ser un asistente real,
que sea listo y nos vaya adelantando cosas, no dando más trabajo, con botones rápidos». Diseño en Claude
Design aprobado con «Sí, constrúyelo». Beta RCA, como el resto de la app.

**Qué es.** Una pantalla más de la app del instalador, «Tu asistente»: al abrirla ya ha mirado sus obras
y le deja **preparado** lo que le toca (firmar, el RITE, la factura, pasar la propuesta, calcular el bono
de un presupuesto), cada cosa con SU botón. Se le escribe o se le **dicta** («hazme un presupuesto para
Carmen López, 8 kW con depósito, 9.500 con IVA», «¿cómo va lo de Lucía?», «¿cuánto me cuesta la de 11?»,
«bájale 300 al último») y contesta en dos líneas con una **tarjeta** que lleva los botones de siempre.

| Qué | Dónde |
|---|---|
| El motor del presupuesto, sin canal (el grupo y el chat) | [services/presupuestoMotor.js](implementation/backend/services/presupuestoMotor.js) |
| El grupo de WhatsApp (solo el canal: sus textos, su copia) | [services/presupuestoGrupoWhatsapp.js](implementation/backend/services/presupuestoGrupoWhatsapp.js) |
| El cerebro del chat: herramientas, lo preparado, la memoria, los topes | [services/asistenteInstalador.js](implementation/backend/services/asistenteInstalador.js) |
| Quién lo tiene (beta + interruptor + llave) | `asistenteEncendido` en [utils/appInstalador.js](implementation/backend/utils/appInstalador.js) |
| Las rutas `GET /asistente`, `POST /asistente/mensaje` (NDJSON), `POST /asistente/audio` | [routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js) (sección FASE 6) |
| `asistente_instalador` en `/api/usuarios/me` | [routes/usuarios.js](implementation/backend/routes/usuarios.js) |
| La pantalla | [views/AsistenteView.jsx](implementation/frontend/src/features/instalador/views/AsistenteView.jsx) |
| Lo puro (memoria, historial, lector NDJSON) y el WAV | [logic/asistente.js](implementation/frontend/src/features/instalador/logic/asistente.js), [logic/audioWav.js](implementation/frontend/src/features/instalador/logic/audioWav.js) |
| Las entradas: menú lateral, tarjeta de Inicio, la gota de las listas | [MarcoInstalador.jsx](implementation/frontend/src/features/instalador/MarcoInstalador.jsx), [views/InicioView.jsx](implementation/frontend/src/features/instalador/views/InicioView.jsx), [AppInstalador.jsx](implementation/frontend/src/features/instalador/AppInstalador.jsx) |
| El CSS `.ia-asi-` | [ui/estilo.js](implementation/frontend/src/features/instalador/ui/estilo.js) |
| El banco (asistente de mentira, guionizado) | [demo/instaladorDemo.jsx](implementation/frontend/src/demo/instaladorDemo.jsx) |
| Los tests | [test_asistente_instalador.js](implementation/backend/scripts/test_asistente_instalador.js), y las partes del asistente en `test_app_instalador.js`, `test_navegacion_instalador.mjs` y `test_rutas_sin_sesion.js` |

### 1. Un cerebro y un camino: el presupuesto se hace igual por WhatsApp que en la app

**REGLA — el presupuesto que pide el instalador, venga del grupo de WhatsApp o del chat de la app, se
interpreta y se CREA por el MISMO motor ([presupuestoMotor.js](implementation/backend/services/presupuestoMotor.js))
y el mismo servicio (`presupuestoInstaladorService.crear`); solo cambian el canal y el `origen`
(`whatsapp` / `app`).** Lo puro que vivía dentro del agente del grupo (fusionar lo dicho, qué falta, el tipo
por defecto, los extras por defecto, resolver el cliente, crear con reintento si el nº se repite, cambiar
conservando nº y fecha) se sacó tal cual a `presupuestoMotor.js`; el grupo lo importa y sus textos y su modo
COPIA no cambian (`test_presupuesto_grupo_whatsapp.js` 20/20, y el test del asistente comprueba que
`WA.fusionar === M.fusionar`, etc.: son las MISMAS funciones, no copias). Lo que se ve en el PDF lo siguen
decidiendo `logic/presupuesto.js` y la plantilla del instalador (regla 238).

### 2. Lo que hace el modelo y lo que hace el código

En el grupo el modelo solo EXTRAE (regla 238). En el chat es un **agente con herramientas**, porque tiene
que contestar preguntas («¿cómo va…?») y no solo rellenar un pedido; pero las herramientas son
estrechas y todo lo que importa lo decide el código:

| Herramienta | Qué hace |
|---|---|
| `mis_obras` | Sus obras (las del listado de la app), buscando por cliente o pueblo; «solo lo que me toca» |
| `ver_obra` | Una obra: paso, quién tiene la pelota, qué le toca, qué llevamos nosotros, qué está hecho. Pinta la tarjeta de la obra |
| `buscar_equipo` | Su catálogo (sus marcas, regla 240): SU precio y la tarifa sin IVA, por palabras y por kW ±1,5 |
| `mis_presupuestos` | Sus presupuestos |
| `hacer_presupuesto` | Pasa lo dicho por el validador del grupo (`presupuestoPedidoCerebro.validar`) y por el motor: sin cliente, sin importe o **sin decir si es con IVA**, NO crea y devuelve lo que falta; varios clientes que se parecen, devuelve los candidatos |
| `cambiar_presupuesto` | El MISMO nº, fecha, notas y validez; si solo cambia el precio, conserva los conceptos. Anulado o por partidas, no |

**REGLA — el asistente solo ve y toca lo SUYO: la empresa la pone SIEMPRE la sesión y todo id que llega
(del modelo o del navegador) se vuelve a validar como suyo en el servicio (404 a lo ajeno).** Un
`cliente_id` pasa por `resolverCliente({ clienteId })`; un presupuesto, por `obtener`; una obra, por la
lista de SUS obras. **Y no envía nada a nadie**: no manda WhatsApp, no firma, no acepta propuestas, no
cambia una obra. Las instrucciones lo dicen («LO QUE NO HACES») y, sobre todo, no tiene herramienta para
eso: «Envíamelo por WhatsApp», «Firmar ahora» o «Calcular el bono CAE» son BOTONES de la tarjeta, que
pulsa él y van por las rutas de siempre (la de WhatsApp manda el PDF al teléfono de SU ficha, regla 238).
Por eso los chips nunca ofrecen lo que hace un botón (el modelo no lo podría cumplir).

Las respuestas: castellano de tú, 2-4 líneas, sin emojis. Los chips son las líneas `>> a | b` del modelo
(como en el asistente de la casa, regla 144): el servidor suelta el texto línea a línea y las quita antes
de que lleguen, así que `>>` no se ve nunca.

### 3. Lo «preparado» lo calcula el código, no el modelo

`preparado()` (en el servicio) recorre SUS obras y sus presupuestos: cada tarea con destino (firmar el
certificado, subir el RITE, hacer la factura, pasar la propuesta) con su botón y su `accion`, y cada
presupuesto **sin bono** de los últimos 30 días («Calcula el bono de…»). Como mucho 4, y «Y N cosas más en
tus obras». El saludo según la hora de Madrid. No gasta modelo: abrir el asistente no cuesta nada. Cada
botón abre lo de siempre: la acción DENTRO de su obra (regla 231) o la Nueva simulación ya rellena desde el
presupuesto (regla 238).

### 4. La memoria, sin tabla

**REGLA — la conversación NO se guarda en ningún sitio: ni en la BD ni en el navegador.** El encargo
hablaba de una tabla nueva; no hace falta y no se ha creado (no hay SQL en esta fase). El navegador
manda en cada mensaje el historial (solo texto, los últimos 24 turnos) y una `memoria` pequeña que le
devuelve el servidor (el último presupuesto hecho, la última obra vista, los candidatos de cliente). El
servidor la SANEA (`limpiarMemoria`: ids con su forma, textos sin marcas) y vuelve a validar cualquier id
como suyo antes de usarlo: lo que manda el navegador es un recordatorio, nunca una credencial. En la app la
charla vive en un `ref` de `AppInstalador` (`charla`): sobrevive a abrir una obra y volver, y se pierde al
recargar. «Empezar de cero» la borra. La dirección solo dice `?seccion=asistente` (regla 236).

### 5. La nota de voz

El navegador graba con `MediaRecorder` (webm en Android, mp4 en el iPhone), lo decodifica y lo vuelve a
muestrear a **WAV mono de 16 kHz** ([logic/audioWav.js](implementation/frontend/src/features/instalador/logic/audioWav.js):
32 KB por segundo; dos minutos como mucho, que caben en los 8 MB de la ruta) y lo manda a
`POST /asistente/audio` como `audio/wav`. El servidor lo transcribe con el MISMO `transcribirBuffer`
(Gemini) del WhatsApp y devuelve `{ texto }`; el chat lo manda como un mensaje más. Menos de 800 bytes,
**400 `AUDIO_VACIO`** sin llamar a nadie; si no se entiende, **502 `AUDIO_NO_TRANSCRITO`**. El audio no se
guarda. Sin permiso de micrófono, la pantalla lo dice y deja escribir.

### 6. Quién lo tiene, los topes y lo que cuesta

**REGLA — tiene asistente quien está en la beta de la app, si `ASISTENTE_INSTALADOR_ENABLED` no es `false`
y el servidor tiene `ANTHROPIC_API_KEY`; lo decide UN sitio (`asistenteEncendido`), que leen `/api/usuarios/me`
(`asistente_instalador`, para pintar o no las entradas) y la ruta (**403 `ASISTENTE_OFF`**).**
⚠️ [AuthContext.jsx](implementation/frontend/src/context/AuthContext.jsx) copia los campos de `/me` UNO A
UNO: el primer deploy (22/11/2026) no copiaba `asistente_instalador` y a RCA no le salía el asistente; el
banco no lo vio porque le pasa la prop directamente. Lo vigila `test_navegacion_instalador.mjs`. Las tres
rutas van con `enforceAuth` + `soloBetaInstalador` + ese guardián (401 sin sesión, 403 fuera de la beta) y
cada evento del NDJSON pasa por `sanear` (fuera enlaces, `*url`, tokens); las tarjetas son listas blancas
(`tarjetaObra`, `tarjetaPresupuesto`: nunca margen, comisión ni Drive, reglas 1 y 230). Con la BD caída,
`GET /asistente` responde **503** (regla 38). El NDJSON lleva `Cache-Control: no-cache, no-transform` y
`X-Accel-Buffering: no` (si no, el proxy lo junta todo y llega de golpe).

Topes por empresa y día, en la memoria del proceso (un reinicio los pone a cero): **80 mensajes**
(`ASISTENTE_INSTALADOR_TOPE_DIA`) y **20 presupuestos**, el MISMO tope del grupo (`PRESUPUESTO_WA_TOPE_DIA`).
Modelo `claude-sonnet-5-5` por la API con esfuerzo bajo (`ASISTENTE_INSTALADOR_MODELO`,
`ASISTENTE_INSTALADOR_ESFUERZO`), las instrucciones y las herramientas en caché; cada respuesta apunta su
consumo en `scratch/asistente-instalador/consumo.jsonl` (tokens, vueltas y coste estimado).

### 7. La pantalla

Estilo «carta de pago» con prefijo `.ia-asi-` (regla 164), mobile first a 390 px:

- **Entradas**: «Tu asistente» en el menú lateral del PC; en el móvil, la tarjeta de Inicio («Abrir el
  asistente» y «Dictar», que lo abre ya grabando) y la **gota** flotante en Obras, Clientes, Catálogo y
  Presupuestos (a 96 px del fondo, encima de la barra). Sin `asistente_instalador` no sale ninguna.
- **Móvil**: ocupa la pantalla; la cabecera y la barra de la app se esconden (`.con-asistente`) y lleva la
  suya con «atrás» y «Empezar de cero». El compositor va pegado abajo: el campo y el botón naranja de
  52 px, que es el micrófono si no hay texto y «enviar» si lo hay; grabando, una franja ámbar con el
  tiempo y el botón para terminar; contestando, el botón para cortar.
- **PC (desde 1024 px)**: el chat en el centro y, a la derecha, lo preparado y «Me puedes pedir».
- **Tarjetas**: la del presupuesto (nº, cliente, «cliente nuevo» si se dio de alta, lo que lleva, el TOTAL
  como cifra protagonista, «Envíamelo por WhatsApp» con `SendActionOverlay` —la MISMA llamada que la ficha—,
  «Ver el presupuesto» y, si aún no tiene, «Calcular el bono CAE»); la de la obra (barra de 5 pasos, quién
  tiene la pelota, Te toca / Lo llevamos nosotros / Hecho, y sus tareas como botones).
- Los errores, en ámbar dentro de la burbuja; sin conexión, «escríbemelo otra vez cuando vuelva».

### 8. El banco

`/instalador-demo.html?seccion=asistente` (Vite en 5187): un asistente guionizado por palabras, sin red ni
modelo. «presupuesto … para … con un número» crea uno de verdad EN EL BANCO (se puede abrir, mandar por
el WhatsApp de mentira y calcular su bono); «bájale N» lo cambia; «cómo va / obra / Lucía», la tarjeta de
la 901; «precio / kW», el catálogo. `?asistente=0` sin asistente (ni menú ni gota); `?asistente=off`, la
pantalla de «no disponible»; `?fallo=1`, el error en la burbuja. El «audio» devuelve siempre la misma frase.

### Pendiente / decisiones de Fran

- **`ANTHROPIC_API_KEY` en el `.env` del VPS** (sin ella nadie ve el asistente: es la condición de
  `asistenteEncendido`). Se paga por uso; el consumo queda en el jsonl.
- No se ha probado todavía con el modelo REAL contra los datos de RCA: local escribe en la Supabase de
  PRODUCCIÓN y un «hazme un presupuesto» crearía uno de verdad. Primera prueba real: con Fran delante y un
  cliente de prueba, o pidiendo solo «¿cómo va…?» (no escribe).
- Pasar el grupo de WhatsApp a modo real sigue siendo decisión de Fran (regla 238): esta fase no lo toca.

**Tras tocarlo:** `node implementation/backend/scripts/test_asistente_instalador.js`,
`test_presupuesto_grupo_whatsapp.js`, `test_presupuesto_instalador.js`, `test_app_instalador.js`,
`test_navegacion_instalador.mjs`, `test_rutas_sin_sesion.js`, `auditar_rutas_sin_guardian.js`,
`npm run build` y el banco a 390 y 1536 px (`?seccion=asistente`, `&asistente=0`, `&asistente=off`,
`&fallo=1`).
