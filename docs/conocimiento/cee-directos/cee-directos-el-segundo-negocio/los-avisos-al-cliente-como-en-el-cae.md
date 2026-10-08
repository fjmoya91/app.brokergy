<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Los avisos al CLIENTE, como en el CAE (2026-09-23)

Hasta aquí un CEE directo solo le mandaba al cliente la entrega final.
- **Al encargar el CEE**: el popup de "Notificar certificador" ofrece el aviso al
  cliente en los DOS negocios (`GET /:id/aviso-cliente-cee`, cada ruta con su
  texto). El de CEE suelto (`encargoCeeDirectoClienteMsg`) nombra al técnico y no
  habla de ayudas ni facturas. Una vez por fase (`aviso_cliente_cee[fase]`).
- **Al quedar REGISTRADO**: `ceeDirectoEntrega.avisarRegistrado`. **REGLA — al
  cliente NO se le escribe solo: te PREGUNTA la app** (2026-10-07). Al subirse el
  registro (técnico, Eva o desde la rejilla) te llega el aviso por WhatsApp y email
  con el enlace `?cee=<id>&avisar=<fase>`, que abre el popup «Avisar al cliente»
  (`AvisoRegistradoModal.jsx`, también desde el panel «Entrega al cliente»). Ahí:
  el destinatario es la **persona de contacto** (`contactoCliente`), y la casilla
  **«¿Emitimos ya la factura?»** (solo ADMIN) emite la de por defecto —las mismas
  líneas y destinatario que el popup de la factura (`facturaDelAviso`)— o adjunta la
  ya emitida; el mensaje dice que, **por política de empresa, los certificados se
  envían una vez abonada la factura** y pide el justificante de pago. La factura se
  emite ANTES de enviar: si no se puede, no sale nada. Si está **cobrado** no hace
  falta: la entrega sale sola con el certificado. Rutas: `GET|POST
  /:id/aviso-registrado`. Antes el aviso salía AUTOMÁTICO al subir el técnico, sin
  factura y sin preguntar.
- **El técnico ACEPTA el encargo**: ni el CAE ni los directos avisan al cliente.
- El destinatario sale de `ceeDirectoService.contactoCliente` (desvío a la persona
  de contacto, igual que `resolveSolicitudContacto` del CAE), también en la entrega.

⚠️ En LOCAL la base es la de producción: enviar una oferta desde localhost manda un
WhatsApp y un email REALES, y aceptarla consume un número de CEE y crea carpeta.
