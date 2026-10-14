<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### El candado de cobro

`cobrado` (solo ADMIN). El cliente ve el estado y sube documentación desde el primer
día, pero **no descarga el certificado hasta que se marque**. Se comprueba también en
`POST /:id/resend-cee-notifications`: es el otro camino por el que el certificado
puede salir de la app, y un candado que solo vive en el portal se salta sin querer
pulsando "enviar" desde el panel.

**Sin cobrar, el envío de la rejilla sale igual, pero SIN los certificados**
(2026-10-12, decisión del usuario; antes respondía 409 «todavía no está marcado como
cobrado», visto en 2026CEE_55). Lo que sale es el aviso de «registrado» sin factura
(`avisarRegistrado`, texto `ceeDirectoRegistradoClienteMsg`): ni el PDF firmado, ni el
registro, ni la etiqueta. El popup lo dice en ámbar antes de enviar (`sinCertificado`
en la preview). Al marcar cobrado, la entrega con los ficheros sale sola, por fase.

Desde el 14/10/2026 el cobro tiene su sitio fijo en el PROCEDIMIENTO (ver «El
PROCEDIMIENTO: de la oferta a la entrega»): la factura sale con el certificado
firmado y revisado, el cliente sube el justificante por su enlace y una persona
confirma el cobro. El candado no cambia; el único que lo salta es el atajo
«Entregar sin esperar al pago» (ADMIN). Si ya hay una factura enviada, el aviso de
«registrado» sin certificados la RECUERDA, con el enlace del justificante.

En el **INICIAL de un encargo DOBLE SIN ninguna factura** el texto no reclama el pago (`cobroAlFinal`):
pide que avisen cuando la instalación esté hecha y facturada, para emitir el final, y
dice que entonces irá nuestra factura y, abonada, los dos certificados. El cobro se
puede reclamar con el inicial (el popup «Avisar al cliente», con factura) o con el
final. El mismo texto sale en ese popup como «sin factura».
