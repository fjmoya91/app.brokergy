<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Qué ve el certificador — y qué NO

**REGLA — al certificador NUNCA se le manda el enlace de la carpeta RAÍZ.** Dentro
está `3. PRESUPUESTO Y FACTURAS`, y en Drive **los permisos se HEREDAN**: compartir
la raíz es enseñarle lo que le cobramos al cliente y lo que nos cuesta la obra. El
encargo comparte y enlaza **subcarpeta a subcarpeta**: la de SU fase y
`4. DOCUMENTACIÓN PARA CEE`, nada más
(`ceeDirectoFolders.compartirConCertificador`). La de la fase que aún no se le ha
encargado tampoco: `2. CEE FINAL` se comparte el día que se le encarga el final.

Se refuerza en tres capas, porque una sola se olvida:
1. El mensaje del encargo lleva los enlaces concretos, no el de la raíz.
2. `GET /:id` **borra `drive_folder_id` y `drive_folder_link`** de la respuesta
   cuando quien pregunta no es staff.
3. La ficha no pinta el botón "📁 Carpeta" para el técnico.

**REGLA — un fichero que cae en presupuestos o facturas NO se hace público.** Los
subidos desde la app se marcan "cualquiera con el enlace" para que la
previsualización funcione sin estar logueado en la cuenta de Brokergy; ahí no,
porque un enlace público es un fichero que sale de la app en cuanto alguien copia
una URL (`ceeDirectoFolders.puedeHacersePublico`).
