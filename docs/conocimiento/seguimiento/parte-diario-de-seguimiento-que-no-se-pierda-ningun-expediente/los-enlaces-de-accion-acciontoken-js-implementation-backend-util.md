<!-- conocimiento · área: seguimiento · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Parte diario de seguimiento — que no se pierda ningún expediente (2026-08-10)»; la introducción y el resto, en esta misma carpeta.

### Los enlaces de acción — [accionToken.js](implementation/backend/utils/accionToken.js) + [routes/acciones.js](implementation/backend/routes/acciones.js)

Firma HMAC stateless, como `approveCeeSignature`, pero **con caducidad** (14 días, y la
fecha va DENTRO de lo firmado). Aquel solo se aprueba algo a uno mismo; estos disparan
un mensaje a un tercero que no se puede retirar, así que un parte viejo reenviado no
puede seguir siendo un gatillo vivo.

**El enlace abre una PÁGINA con el mensaje editable; no envía de un clic.** Autoriza a
preparar el envío, no a ejecutarlo a ciegas.

**La página se usa DE PIE Y CON EL MÓVIL**, entrando desde un WhatsApp. Las decisiones
de diseño no son cosméticas y no conviene deshacerlas:
- Un destinatario **no marcado ocupa una línea** (48 px), no media pantalla. Con el
  cliente y el instalador desplegados a la vez había que hacer scroll para descubrir
  que existía el segundo. Con esto la pantalla completa cabe en un móvil.
- El mensaje viene **plegado** con las primeras líneas y un degradado; se despliega o
  se edita a demanda. Casi nunca se edita: enseñarlo entero solo alejaba el botón.
- El botón va **pegado abajo (sticky)** y dice a quién y por dónde va ("Enviar a
  Instalador y Cliente por WhatsApp y email"). Es la única acción irreversible.
- El teléfono y el email se leen **en la propia píldora del canal**: comprobar a qué
  número va el mensaje es justo lo que se hace antes de pulsar.
