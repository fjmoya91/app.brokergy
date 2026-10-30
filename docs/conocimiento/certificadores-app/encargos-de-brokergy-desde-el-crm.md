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
   - **REGLA — lo que el CRM ya sabe de la instalación no se vuelve a preguntar** (30/10, Fran en
     2026EXT_3: «ya se había dicho cómo era la caldera y el ACS y la app lo ha vuelto a preguntar»).
     `crm.instalacionDelCrm` lo pasa al cuestionario de la obra con **origen `BROKERGY`** (chip
     «BROKERGY», «según el expediente de BROKERGY»; rango 4, como una foto): calefacción, tipo de
     caldera (condensación), marca y modelo y potencia de la caldera antigua, emisor
     (`emisorInicial`, regla 8.e), ACS, placas FV (con kWp) y aires (`conAiresDeOportunidad`).
     - CAE (`instalacionCae`): calefacción desde la simulación (`fuelType`, `boilerHeatingType`,
       caldera eléctrica por `boilerId`) y, si no, el funnel (`combustible_actual`). ACS con el MISMO
       criterio que la foto del ACS inicial (`deriveSelectors`): el toggle `misma_caldera_acs` solo
       cuenta en `false`; luego el funnel `boiler_acs_type`; luego el par de la calculadora
       (`tipoAcsDesdeInputs`). «Misma caldera» solo si la calefacción es una caldera. «No tengo / no
       lo sé» del funnel no afirma nada.
     - CEE directo (`instalacionCee`): lo que contestó el cliente en su cuestionario.
     - `conInstalacionDelCrm` **nunca pisa** lo que contestó el técnico (valor sin origen) ni lo
       visto en una foto o leído en una placa o el Catastro; sí rellena lo vacío o supuesto
       (HABITUAL, ÉPOCA, Street View). Al re-encargar una obra rechazada se vuelve a pasar con la
       misma regla. Las obras que ya estaban en la app NO se reescriben solas (el técnico puede
       estar editándolas).
2. El mensaje lleva **el enlace de la app** en lugar de la página del encargo:
   `https://cee.brokergy.es/encargo/:negocio/:id/:fase`, con la línea «📲 Ábrelo en tu app de
   certificadores (acéptalo o recházalo ahí):». La app lo resuelve a SU obra
   (`GET /api/certapp/encargo/…`; con otro email, 404 `ENCARGO_NO_ENCONTRADO`).
   - **REGLA — lo que se ve en el popup es lo que sale.** El popup lo enseña ANTES de enviar:
     `aviso-cliente-cee` devuelve `enlace_encargo` + `enlace_en_app` y `enlace-encargo` devuelve
     `url_app_encargo` / `url_app_recordatorio` (`crm.enlaceAppPrevisto`, mismo criterio que el
     envío: un encargo, con tener cuenta; un recordatorio del CAE, si la obra ya está en la app; en
     el CEE directo, siempre). La línea es la MISMA en los dos lados (`TEXTO_ENLACE_APP`, lo vigila
     `test_encargo_tecnico.mjs`).
   - El texto editado sale igual por **WhatsApp, email e historial** (`crm.textoParaTecnico`):
     si trae la página del CRM se cambia por la app; si trae la app y la obra no se pudo crear,
     vuelve la página. Hasta el 30/10 tarde solo lo cambiaba el WhatsApp: el email salía con la
     página del CRM en el texto y la app en el botón (lo vio Fran al asignárselo para probar).
   - El email conserva el botón «✅ Aceptar Encargo»: aceptar por ahí también vale en la app.
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
  texto del WhatsApp, la instalación que trae del CRM sin pisar lo contestado).
- `test_solo_asignar_cert.js`, `test_encargo_tecnico.mjs`, `test_pre_revision_cee.js`,
  `test_agente_ia_flujo.js` (las rutas del CRM que se tocaron).
- Demo: `http://cee.localhost:5173/panel?demo=1` trae un encargo (2026EXT_4) por aceptar.
