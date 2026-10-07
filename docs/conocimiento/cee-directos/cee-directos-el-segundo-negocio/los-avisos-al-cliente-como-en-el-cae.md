<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Los avisos al CLIENTE, como en el CAE (2026-09-23)

Hasta aquí un CEE directo solo le mandaba al cliente la entrega final.
- **Al encargar el CEE**: el popup de "Notificar certificador" ofrece el aviso al
  cliente en los DOS negocios (`GET /:id/aviso-cliente-cee`, cada ruta con su
  texto). El de CEE suelto (`encargoCeeDirectoClienteMsg`) nombra al técnico y no
  habla de ayudas ni facturas. Una vez por fase (`aviso_cliente_cee[fase]`).
- **Al quedar REGISTRADO**: `ceeDirectoEntrega.avisarRegistrado` — desde el popup
  de la rejilla (que antes decía "enviadas" habiendo avisado solo al equipo) y
  AUTOMÁTICO cuando el técnico sube el justificante por su enlace. Si está
  **cobrado no se manda**: sale la entrega con los PDF y lo cubre. Si no, le
  recuerda el pago por transferencia. Respeta `CEE_ENTREGA_AUTO`.
- **El técnico ACEPTA el encargo**: ni el CAE ni los directos avisan al cliente.
- El destinatario sale de `ceeDirectoService.contactoCliente` (desvío a la persona
  de contacto, igual que `resolveSolicitudContacto` del CAE), también en la entrega.

⚠️ En LOCAL la base es la de producción: enviar una oferta desde localhost manda un
WhatsApp y un email REALES, y aceptarla consume un número de CEE y crea carpeta.
