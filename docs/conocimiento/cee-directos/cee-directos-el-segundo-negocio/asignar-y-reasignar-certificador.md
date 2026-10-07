<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Asignar y REASIGNAR certificador

Tres fallos medidos el 25/08 sobre 2026CEE_54, los tres del mismo sitio:

**REGLA — "Solo asignar" NO manda nada.** El popup manda `sendEmail` /
`sendWhatsApp`; la ruta leía `channels` y, al no venir, caía en `['email']` por
defecto: pulsar "Solo asignar" le enviaba el encargo al técnico igual. Ahora se
admiten las dos formas y, **si no viene ninguna, no sale nada**. Compartir las
carpetas sí se hace siempre —se avise o no—, o un "solo asignar" dejaría el
expediente asignado y sin acceso.

**REGLA — el popup se abre SIEMPRE que se ELIGE un técnico**, aunque sea el mismo
que ya constaba. Se comparaba con `savedCertId` y eso rompía el caso más común:
se asigna a A, A no puede, se pone "sin asignar" y se vuelve a A —o se pasa a B y
luego se vuelve a A—. Como el `ref` seguía valiendo A, no saltaba el popup y nadie
se enteraba del encargo. Quitar el técnico sí guarda directo: no hay a quién
escribir. Y **cerrar el popup sin confirmar DESHACE la elección**, o el
desplegable enseñaría un técnico que no está guardado.

**REGLA — al cambiar de técnico, la fase vuelve a "pendiente de encargar".**
`ASIGNADO` significa *encargo enviado*; si el destinatario cambia, ese avance
describe la situación del anterior. Se resetea solo si aún no hay nada entregado
(por debajo de `PRESENTADO`): un certificado ya emitido existe, lo haya hecho
quien lo haya hecho. Se suelta también `*_last_contacto_at`, o el parte diario
silenciaría el aviso al nuevo durante toda la ventana de reinsistencia.

⚠️ **Quién era el técnico ANTERIOR lo manda el FRONTEND** (`certificador_anterior`),
no lo deduce el backend. Justo antes de notificar, el módulo hace un `onSave` que
ya persiste el técnico nuevo, así que para cuando llega la petición
`row.cee.certificador_id` es el NUEVO y comparar contra él no detecta el cambio
jamás.

⚠️ **`guardar()` FUNDE `seguimiento`**, así que un `delete` sobre el parche no
borra la clave: el sello viejo sobrevivía intacto. Para soltar una clave hay que
ponerla a `null`.

**REGLA — los textos al técnico saben de qué negocio son** (`msgCtx`). El enlace
es `?cee=` y no `?exp=` —son dos tablas y el mismo UUID no vale en las dos—, y del
texto desaparece lo que aquí no existe: obra, portal del cliente, plazos del
programa de ayudas. Se vio en un email real que mandaba al técnico a una pestaña
donde su expediente no estaba.
