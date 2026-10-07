<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### Pedir la foto que falta, desde la foto que falta

Botón **📩 Pedírsela** en cada casilla vacía del panel del admin. Abre el popup de
envío de siempre con esa foto marcada, el resto de pendientes a un clic, y el
mensaje redactado en LENGUAJE DE CLIENTE (`labelCliente`, no "Placa de la unidad
interior / DEPOSITO ACS"). El enlace va filtrado con `?need=` —que `DocsManager` ya
sabía leer— así que el cliente abre y ve SOLO eso.

**REGLA — la lista de lo que falta se REFRESCA al abrir el popup.** La vista se
cargó al abrir el modal y desde entonces se han podido subir fotos: sin ese GET, se
le reclamaría al cliente algo que ya mandó, que es justo lo que esto viene a
evitar. Se pide después de abrir, para que el botón no se quede sin respuesta.

De paso, el canal (WhatsApp · Email) se cambia DENTRO del popup: entrando desde una
casilla no hay dos botones de los que salir, y cerrar para volver a entrar por el
otro es un peaje.
