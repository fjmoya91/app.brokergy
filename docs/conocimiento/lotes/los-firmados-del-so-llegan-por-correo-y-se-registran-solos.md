<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## Los FIRMADOS del S.O. llegan por CORREO y se registran solos (2026-10-19)

El S.O. no usa el enlace de firma en cadena (`/firmar-lote/:id`): Jesús (director de
operaciones de INTERNACIONAL DE ALCOHOLES) reenvía el correo «Anexo I · Listado Cesión +
Fichas RES» a quien firma, este se lo devuelve firmado y Jesús nos lo reenvía con los
PDF **con el mismo nombre con el que salieron**. Había que bajarlos del correo y
soltarlos en la fase 2 del lote. Ahora lo hace el servidor (decisión del usuario: «que
se guarden automáticamente, como si los descargase y los subiese yo»).

| Qué | Dónde |
|---|---|
| El lector del buzón y el barrido cada 15 min | [firmadosSoCorreo.js](implementation/backend/services/firmadosSoCorreo.js) |
| El registro (el MISMO de la suelta a mano) | `procesarFirmados` en [firmadosSo.js](implementation/backend/services/firmadosSo.js) |
| Qué haría hoy, en seco, con los correos reales | `node implementation/backend/scripts/probar_firmados_correo.js [--dias N]` |
| Pruebas sin red | `node implementation/backend/scripts/test_firmados_correo.js` |
| Interruptor | `FIRMADOS_SO_CORREO_ENABLED` (solo `true` en el VPS) |

### De dónde se lee

Del buzón **franciscojavier.moya@brokergy.es** en Hostinger (IMAP 993), que es al que
contesta el S.O. porque es desde el que se le escribe: la cuenta es la misma
`LOTE_SO_SMTP_USER`/`LOTE_SO_SMTP_PASS`. No hace falta Gmail: el token de Google del
servidor solo tiene permiso de Drive, y los correos siguen también en el buzón de
Hostinger (comprobado el 19/10/2026: 40 de Interalco desde el 01/09).

**REGLA — el buzón se LEE, no se toca.** Se abre en solo lectura: no se marca nada como
leído, no se mueve nada, el correo sigue llegando a Gmail igual que siempre. Qué correos
están ya vistos se guarda en `app_settings` (`firmados_so_correo:vistos`, los últimos 500
Message-ID). Un fallo del buzón o de la BD no marca nada como visto: se reintenta en el
siguiente barrido.

### Qué correo cuenta

**REGLA — solo cuenta un correo de un CONTACTO del S.O. de ESE lote**, con el código
del lote (`LOTE-2025-012`) en el asunto (o, si no, en los nombres de los adjuntos), con
algún PDF, y que **o conteste a una petición de firma** (asunto de Anexo I / Fichas RES /
Firmar / nueva firma) **o traiga algún documento firmable del lote**. Contactos = los
correos de la ficha del S.O. (`email`, `email_contacto`, `email_responsable`,
`contactos_notificacion`); cualquiera del mismo dominio de empresa vale, pero de un
dominio gratuito (gmail, hotmail…) solo la dirección exacta. El remitente puede
falsificarse; lo que no se falsifica es la firma del PDF, que se comprueba igual.

Lo demás se ignora y se marca visto: la contestación a la solicitud de emisión de CAE,
la de la factura, los avisos del MITECO reenviados, un correo que nombre dos lotes.

### Qué se registra

**REGLA — se registra solo lo LIMPIO.** Va por `procesarFirmados`, el mismo camino que
soltar los PDF en la fase 2: lee las firmas del PDF, identifica cada ficha por su nº de
expediente y la registra con `_fdo` (regla 40). Lo que en pantalla pediría confirmación
—firma de otro apoderado, Anexo I con una sola firma, un PDF que no se sabe de quién
es— **no se fuerza**: se queda sin registrar y se avisa con el motivo. Sin nadie delante
no hay quien diga «sí, es de este».

**REGLA — lo ya firmado NO se reemplaza** (`noReemplazar`, estado `ya_registrado`). Que
el S.O. conteste dos veces, o que se reenvíe el mismo correo, no puede pisar lo
registrado. Una re-firma por requerimiento no choca: al pedirla se borra el
`signed_link` del documento.

**REGLA — un PDF que llegó ANTES de mandar a firmar la versión vigente es de una ronda
anterior** (`recibidoAt` contra `documentos_so[].sent_at`, estado `anterior`: se salta
sin alarma) **y un `_revN` que no es la revisión que se mandó no se registra solo**.
Medido el 19/10/2026 en la prueba en seco: la ficha de 25RES060_59 (LOTE-2025-009) se
había vuelto a pedir esa mañana como `_rev2` por un requerimiento, y el correo del 05/10
traía la `_rev1` firmada. Casaba por el nº de expediente y, sin este candado, se habría
registrado la versión vieja como la nueva. Los dos candados solo se aplican al buzón: la
suelta a mano no cambia (ahí una persona ve el nombre del fichero).

### El aviso

Si algo se registró o hay algo que mirar, WhatsApp al chat de admin + email a
`ADMIN_EMAIL` (el mismo patrón que la propuesta programada): lo registrado por nº de
expediente, lo que no y por qué, lo que ya estaba, lo de una ronda anterior y **lo que
sigue faltando en el lote**. Si todo estaba ya registrado, no se avisa. Cada documento
registrado deja además su línea en el historial del lote («… (correo de
el firmante del S.O., 17/10/2026 10:39)»), con usuario `CORREO S.O.`.

**REGLA — nace APAGADO** (`FIRMADOS_SO_CORREO_ENABLED`, solo `true` en el VPS): el local
escribe en la Supabase y el Drive de producción, y dos servidores leyendo el mismo buzón
registrarían dos veces.

### Lo que enseñó la prueba en seco (19/10/2026, últimos 30 días)

- LOTE-2025-010, 011 y 012 (17/10): todo `ya_registrado` (se subieron a mano). No haría nada.
- LOTE-2025-005, 006, 2026-007 y 008 (21–25/09, requerimientos): las fichas re-firmadas
  **siguen sin registrar en la app** aunque los lotes están SUBIDOS A MITECO; el buzón
  las daría por buenas (`listo`), pero quedan fuera de su ventana de 10 días. Los Anexo I
  de esas rondas traen solo la firma de Pedro José (falta la de Brokergy).
