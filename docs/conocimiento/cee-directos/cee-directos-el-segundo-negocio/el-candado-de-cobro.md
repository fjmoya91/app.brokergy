<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### El candado de cobro

`cobrado` (solo ADMIN). El cliente ve el estado y sube documentación desde el primer
día, pero **no descarga el certificado hasta que se marque**. Se comprueba también en
`POST /:id/resend-cee-notifications`: es el otro camino por el que el certificado
puede salir de la app, y un candado que solo vive en el portal se salta sin querer
pulsando "enviar" desde el panel.
