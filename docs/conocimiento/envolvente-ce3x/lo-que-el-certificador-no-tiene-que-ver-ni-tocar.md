<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Lo que el CERTIFICADOR no tiene que ver ni tocar (2026-09-14)

El expediente es interno y él entra a lo suyo: medir, emitir y subir el
certificado. Cuatro cosas que veía y no le correspondían:

- **La EMPRESA INSTALADORA asignada** (`InstalacionModule`): es un dato
  comercial del que no cuelga nada suyo, y el desplegable —aunque fuera en solo
  lectura— le enseñaba la cartera entera de instaladores.
- **El conmutador `Auto XML · Manual`** y el del método del ahorro RES080
  (`CeeModule`): deciden de dónde salen las cifras del CIFO y de la ficha, que
  firmamos nosotros.
- **El método de la D_ACS** (`XML · HAB · L/D · MAN`, en `CeeDocumentsGrid`):
  **el VALOR se queda** —es lo que tiene que teclear en CE3X—, los botones no.
- **«Certificador no asignado»**: quitarse a sí mismo devuelve el expediente a
  la cola, le retira su propio acceso y nadie se entera, porque en la ficha
  sigue pareciendo que está en marcha. `TecnicoPicker` deja de ofrecerlo
  (`permiteVaciar`) **y el `PUT /api/expedientes/:id` lo repite**: si quien
  pregunta es CERTIFICADOR, `cee.certificador_id` no se mueve — mismo blindaje
  que `cee.estado` y que REGISTRADO.
