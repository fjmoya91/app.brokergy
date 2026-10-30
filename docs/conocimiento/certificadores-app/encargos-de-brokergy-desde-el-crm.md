<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## Los encargos de BROKERGY: del CRM a la app y vuelta (2026-10-30)

Fran: «que le pueda asignar al certificador un expediente y que le aparezca en su panel… que lo
pueda aceptar o declinar, y si lo acepta, empezar con todo el proceso. Todos los datos del cliente
deben estar rellenos… en lugar de que se envíe directamente, pasa por la aplicación… debe haber
comunicación bidireccional». Decidido con él: lo de BROKERGY **no gasta los créditos** del técnico;
primero los CAE y después los CEE directos (están los dos); **todo va a la carpeta del expediente**,
sin copia en la de la app.

### Cómo se enlazan, sin tocar el esquema

- El técnico del CRM (`prescriptores`) y la cuenta de la app (`certapp_cuentas`) se casan por el
  **EMAIL** (`crm.cuentaDe`: en minúsculas, cuenta ACTIVA o PENDIENTE). Sin cuenta, el encargo sale
  como siempre (email + WhatsApp con la página del encargo, regla 92).
- La obra de la app guarda de qué expediente es en **`seguimiento.crm`** (JSONB que ya existía):
  `{ negocio: 'cae'|'cee', id, fase, numero, cert_id, encargado_at, encargo: { estado, at, motivo } }`.
  `cert_id` es el `id_empresa` del técnico: si el CRM se lo pasa a otro, deja de ser suyo.
- Al técnico nunca le llegan ids del CRM: `obraParaCertificador` y el listado dejan `crm` en
  `{ negocio, numero, fase, encargo: { estado, at } }` (`crmParaCertificador`).

Fuente única: [services/certapp/crm.js](implementation/backend/services/certapp/crm.js).

### El encargo (CRM → app)

«Asignar y notificar» (`POST /api/expedientes/:id/notify-certificador`, y el de
[ceeDirectos.js](implementation/backend/routes/ceeDirectos.js)) con un técnico que tiene cuenta:

1. `crm.encargar` crea la obra (o reabre la rechazada) con el **titular** del cliente, la
   **vivienda** (la dirección de la instalación), la zona climática, «para qué» = AYUDAS, y **las fotos
   que ya tenía el expediente con los MISMOS ficheros de Drive** (`fotosDelCrm`: nada se copia; de
   una lista a un apartado de una sola foto, la última; sin las rechazadas). El Catastro se rellena
   detrás.
2. El WhatsApp y el botón del email llevan **el enlace de la app** en lugar de la página del encargo (`conEnlaceApp`):
   `https://cee.brokergy.es/encargo/:negocio/:id/:fase`. La app lo resuelve a SU obra
   (`GET /api/certapp/encargo/…`; con otro email, 404 `ENCARGO_NO_ENCONTRADO`).
3. El historial del expediente dice «📲 en su app de certificadores (2026EXT_n), pendiente de que
   lo acepte».

Con «Solo asignar» a un técnico de fuera NO se crea nada (no es un encargo, regla 80). Con el de la
casa (Fran) sí, porque asignárselo ES el encargo, y se le genera el `ack_token` para que «Aceptar»
pueda acusar.

### Aceptar o rechazar (en la app)

- **Panel**: arriba, «Te hemos encargado N certificados»; en la lista, el sello «BROKERGY · nº».
- **Obra** ([obra/Encargo.jsx](implementation/frontend/src/certificadores/obra/Encargo.jsx)):
  «Aceptar el encargo» / «Rechazar» (con el motivo, opcional).
- **Aceptar** (`POST /obras/:id/encargo/aceptar`): si el expediente sigue siendo suyo, hace el acuse de
  siempre por dentro (`cert-ack` del CAE o `cee-ack` del CEE directo: EN TRABAJO, historial y aviso
  al equipo). Sin token (ya aceptó por el email), solo se apunta. Si el CRM se lo pasó a otro: la obra
  se archiva y **409 `ENCARGO_RETIRADO`**.
- **Rechazar** (`POST /obras/:id/encargo/rechazar`): solo mientras está PENDIENTE (aceptado, 409
  `ENCARGO_ACEPTADO`: «escríbenos»). Se le **retira del expediente** (`certificador_id` a null, una
  entrada en `cee.rechazos`, la fase a `PTE_ENVIO_CERT` si no había nada entregado y «EN CERTIFICADOR»
  vuelve a «PTE.»), se anota en el historial y se avisa al equipo; la obra se ARCHIVA (sale del panel).
- **REGLA — un encargo de BROKERGY no se borra, se rechaza**: `DELETE /obras/:id` responde 409
  `ENCARGO_CRM` y el botón no sale.

### El trabajo (app → CRM)

- **Pedir el certificado** sin aceptar: 409 `ENCARGO_SIN_ACEPTAR`. Aceptado: **REGLA — no gasta
  créditos** (no llama a `certapp_consumir_credito_obra`; el evento y el overlay lo dicen).
- **Fotos**: van **directas a la casilla del expediente** (`crm.subirFotos` →
  `reformaUploadService.subirFicherosASlot` en el CAE, `ceeDirectoDocsService.subir` en el CEE
  directo), nunca a la carpeta de la app. Lo que no tiene casilla propia va a «Otros» con el nombre
  del apartado de la app (`slotCrmDe`). Quitar una foto solo la quita del expediente si la subió el
  técnico (`quitarFoto`); las de BROKERGY no se tocan.
- **Firmar** el PDF en la app (`firma.guardarFirmado`) manda al expediente, en segundo plano
  (`enviarCeeAsync`), el **PDF firmado + el `.xml` + el `.cex`** de «1. CEE» de la obra con los
  nombres del CRM, y pide la revisión como si lo subiera por su enlace (`notify-review` con la clave
  interna en el CAE; en el CEE directo, PTE_REVISION + historial + aviso). Si falla: evento
  `CRM_FALLO` y aviso al equipo.
- **El XML definitivo** subido en la app va también al expediente (`enviarDefinitivoAsync`).
- **El justificante y la etiqueta** del Registro (`presentacion.subir`) van a las casillas `registro`
  y `etiqueta` del expediente (`enviarRegistroAsync`): el justificante lee la fecha y registra la
  fase, como si lo subiera por su enlace.
- La obra enseña EN VIVO qué dice el CRM (`crm.resumen` → `revision`): en revisión · **visto bueno
  (ya puede presentarlo)** · registrado.

### Lo que queda fuera (dicho a Fran)

- Los ficheros de TRABAJO del CEE que genera BROKERGY para la obra siguen en la carpeta de la obra
  (la app trabaja allí); al expediente va lo ENTREGABLE (firmado, xml, cex, justificante, etiqueta)
  y las fotos.
- En un CAE, el certificado que se pide desde la app sigue el camino de la app (IA → entrega en la
  obra); no se fabrica en el expediente.

### Pruebas

- `node implementation/backend/scripts/test_certapp_rutas.js` (ajeno 404; no se borra; sin aceptar no
  se pide; aceptado no gasta crédito; retirado → archivada; rechazar retira al técnico).
- `node implementation/backend/scripts/test_certapp_unidad.js` (enlace, casillas, fotos traídas,
  texto del WhatsApp).
- `test_solo_asignar_cert.js`, `test_encargo_tecnico.mjs`, `test_pre_revision_cee.js`,
  `test_agente_ia_flujo.js` (las rutas del CRM que se tocaron).
- Demo: `http://cee.localhost:5173/panel?demo=1` trae un encargo (2026EXT_4) por aceptar.
