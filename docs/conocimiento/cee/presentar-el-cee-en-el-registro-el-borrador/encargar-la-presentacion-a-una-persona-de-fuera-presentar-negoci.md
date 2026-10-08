<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «PRESENTAR el CEE en el Registro — el borrador (2026-09-15)»; la introducción y el resto, en esta misma carpeta.

### ENCARGAR la presentación a una persona de fuera — `/presentar/:negocio/:id` (2026-10-06)

Botón **✉ Enviar a presentar** bajo la tarjeta «Presentar el CEE» de la rejilla (acceso
directo) y en el pie de su popup (solo equipo interno, en los DOS negocios). Manda a quien
presenta (Eva, `evamayraverdejo@gmail.com`, sin cuenta en la app; por defecto en
`app_settings.presentador_cee`) un correo con el **borrador en PDF** y los **tres
ficheros** adjuntos y un ENLACE a una página con el borrador del
Registro, los mismos ficheros para descargar y dónde subir el justificante de registro y
el recibo de la tasa.

| Qué | Dónde |
|---|---|
| Elegir ficheros, token, correo, encargar/retirar, página pública | [presentacionCeeService.js](implementation/backend/services/presentacionCeeService.js) |
| Subida del justificante (COMÚN con el enlace del técnico) | [services/cee/subidaCeePublica.js](implementation/backend/services/cee/subidaCeePublica.js) |
| Rutas del equipo (montadas en los dos negocios) | [routes/presentacionCeeRutas.js](implementation/backend/routes/presentacionCeeRutas.js) — `GET/POST /:id/presentacion-cee`, `POST …/retirar` (**staffOnly**) |
| Rutas públicas | `/api/public/presentar/:negocio/:id` (+ `/borrador-cee`, `/borrador-cee/fichero`, `/borrador-cee/pdf`, `POST /devuelto`) |
| Popup · página | `EncargarPresentacionModal.jsx` · `PresentarEncargoView.jsx` (reusa `BorradorCeeModal` con `onSubirDevuelto`) |
| Prueba sin datos reales | `node implementation/backend/scripts/test_presentacion_cee.js` |

**REGLA — se mandan SIEMPRE el BORRADOR del Registro y el .cex, el .xml y el PDF FIRMADO, y
NADA más** (decisión del usuario, 2026-10-06): ni el informe de mejoras, ni el registro, ni
la etiqueta. Si el borrador no se puede preparar, no sale nada (fuera de CLM no hay
plantilla y va sin él). Una vez enviado, la tarjeta pasa a **«Pendiente de presentación ·
Con Eva · enviado hace N días»** en ámbar, hasta que sube el justificante. **Un
fichero con «REVISAR» en el nombre no se manda nunca** (`esRevisar`) — es un borrador de
la app. Por slot manda el nombre canónico; si falta alguno de los tres, **no sale nada**.
Los adjuntos van con el NIF del titular delante, como se suben al Registro.

**REGLA — el enlace es REVOCABLE**: HMAC con un `nonce` guardado en
`cee.presentacion[fase]` (clave preservada en los dos PUT). Reenviar genera otro (el
anterior deja de valer) y «Retirar el encargo» lo borra. El sello se escribe DESPUÉS de
enviar. Al subir el justificante se lee su fecha y la fase queda REGISTRADA por la MISMA
función que la subida del técnico, contado en el historial como «{nombre} (presentación)».
Ni un importe en el correo ni en la página. Quién presenta por defecto se recuerda en
`app_settings.presentador_cee`.

**REGLA — con el certificador de la CASA, «Validar» es encargar la presentación** (2026-10-07).
El visto bueno de siempre le manda un mensaje al técnico; si el técnico es Fran (CIF de
Brokergy, `esCertificadorDeLaCasa`), se lo mandaba a sí mismo y se duplicaba con el encargo
a Eva. Ahora el botón «Validar» de la rejilla (y el de la revisión) abre el popup de Eva
como **«✓ Validar y enviar a presentar»**: al enviar sale el encargo y queda dado el visto
bueno **sin aviso al técnico** (`approve-cee` con `sendEmail:false`, `sendWhatsApp:false`,
borrador guardado en Drive; en CEE directos la ruta admite ya cero canales). «Solo validar»
valida sin encargo, y pasa a botón principal si el encargo ya salió o faltan ficheros. **Al
revés también**: enviar a presentar una fase que espera el visto bueno (desde la tarea o desde
«Presentar el CEE») la valida en el mismo gesto (`onValidar` del popup); si la validación
falla, el encargo no se deshace y se dice. Con un técnico de fuera, todo como siempre.

**REGLA — «Validar» sale solo si la fase ESPERA el visto bueno, y eso lo dice el
SEGUIMIENTO** (2026-10-08). Fuente única: `esperaVistoBueno` en
[seguimientoTime.js](implementation/frontend/src/features/expedientes/logic/seguimientoTime.js),
que usan el botón de la rejilla, el «Dar el visto bueno» del popup de Revisión y el
`onValidar` del popup de Eva. `seguimiento.cee_{fase}` = `PTE_REVISION` → sí;
`REVISADO` o `REGISTRADO` → **no, diga lo que diga `cee.estado`**; sin subestado, manda
el espejo. Antes bastaba con que el espejo dijera «PENDIENTE REVISIÓN»: al registrar
nadie lo mueve, así que 26RES080_92 (registrado el 08/10/2026 sin pasar por el visto
bueno), 26RES080_42 y 26RES093_3 seguían ofreciendo «Validar y enviar a presentar».

**Su BANDEJA — `/presentar/pendientes?token=`**: una página personal con todo lo que
tiene pendiente (ordenado por plazo, ámbar a una semana y rojo vencido) y lo presentado
el último mes; cada fila abre su encargo. Va en cada correo de encargo y en cada página
de presentar, y el popup tiene «📋 Copiar su página». El token es `{nonce}.{hmac}` con el
nonce en `app_settings` (`presentador_bandeja:{nonce}` ↔ `presentador_bandeja_email:{correo}`):
el correo no viaja en la URL y renovar el nonce la revoca. Lista solo lo encargado a SU
correo (`itemsBandeja`, puro) leyendo campos concretos del JSONB, nunca `cee` entero.
Ruta pública `GET /api/public/presentar-pendientes?token=`. ⚠️ El plazo se calcula en
UTC (`plazoDesdeFirma`): con la hora local, la fecha límite salía un día antes.

⚠️ La descarga del borrador en PDF en una página PÚBLICA no puede usar
`/api/pdf/generate` (pide sesión): `BorradorCeeModal` usa `…/borrador-cee/pdf` cuando va
con `paramsExtra`. Arregló de paso la del técnico (`/cee-firma/:id/borrador-cee/pdf`), y
`PresentarCeeView` manda ya `phase` al borrador (en la fase final daba 403).
