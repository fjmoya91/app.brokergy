<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Seguimiento del encargo — qué pasó y cuándo

`GET /:id/trazabilidad` + el panel `Trazabilidad` en la ficha: enviado, aceptado,
rechazado, último contacto y los saltos de subestado, con su fecha.

**REGLA — sale de los sellos que YA se escriben** (`cee.ack_*`,
`seguimiento.*_ts`) y del historial. No hay tabla de bitácora aparte a propósito:
una bitácora paralela se desincroniza de lo que de verdad ocurrió en cuanto una
escritura falla, y entonces miente con toda la autoridad de un registro.

Se enseñan los TRES últimos hitos y el resto a demanda —una lista de veinte
líneas vuelve a ser el muro que quitamos de la ficha—, y aparte las pastillas de
**"ya han dicho que no"**, que es la mitad del valor de registrar un rechazo.
