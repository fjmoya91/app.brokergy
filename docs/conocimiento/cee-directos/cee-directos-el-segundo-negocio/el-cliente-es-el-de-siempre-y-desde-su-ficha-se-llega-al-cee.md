<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### El cliente es el de siempre, y desde su ficha se llega al CEE

**REGLA — el cliente de un CEE directo se da de alta en `clientes`, como todos.**
No hay una tabla de clientes paralela: es el mismo del CAE, con el mismo buscador
y el mismo formulario de alta (`ClientePicker`, fuente única del alta y de la
ficha). Un cliente puede tener a la vez oportunidades, expedientes CAE y CEE
sueltos.

En la ficha del cliente aparecen **en su propio bloque**, no mezclados con los
expedientes CAE: son otro negocio y otra numeración, y verlos en la misma lista
haría creer que a ese cliente se le está tramitando un bono. Sale de
`cee_directos_vinculados` en `GET /api/clientes/:id` — staff only, mismo criterio
que los expedientes.

Se navega en los DOS sentidos: desde la ficha del cliente al CEE (`?cee=<id>`) y
desde el CEE a la ficha del cliente (la tarjeta del cliente abre
`ClienteDetailModal`, igual que en el expediente CAE). Tener solo uno de los dos
obliga a salir del expediente para mirar un teléfono.

⚠️ El deep-link es **`?cee=`**, no `?exp=`: son dos tablas distintas y el mismo
UUID no vale en las dos. Lo consume `App.jsx` y lo abre `CeeDirectosView` vía
`initialSelectedId`. Es el enlace que llevan los mensajes al certificador, así
que si se rompe, los avisos ya enviados dejan de abrir nada.
