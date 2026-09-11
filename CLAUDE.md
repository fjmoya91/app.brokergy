# CLAUDE.md — Instrucciones para Agentes de IA

Este archivo se carga automáticamente en cada conversación de Claude Code. Lee esto ANTES de tocar cualquier fichero.

---

## Estado Actual del Proyecto (Actualizado 2026-05-25)

La app Brokergy es un CRM interno para gestión de oportunidades de rehabilitación energética en España. Stack: **React + Vite** (frontend), **Node.js/Express** (backend), **Supabase** (BD + auth), **Google Drive** (expedientes). **Desplegada en VPS propio (`187.77.93.213`, Docker Compose, dominio `app.brokergy.es`)** — NO usamos Vercel ni Railway. Ver memoria `deploy_workflow.md` para el flujo completo.

## ⚠️ Regla de oro de desarrollo

**SIEMPRE trabajamos contra `localhost` primero.** Solo cuando el cambio está validado en local se hace `git push` y luego deploy al VPS. Prohibido pushear "a ver si funciona en producción". El ciclo correcto:

1. Cambio en local.
2. Probar en `localhost` (frontend `npm run dev` + backend `npm start`).
3. Si OK → `git push origin main`.
4. SSH al VPS (`ssh root@187.77.93.213`) → `cd /opt/brokergy && bash scripts/deploy.sh`.
5. Verificar en `https://app.brokergy.es`.

Si el usuario dice "no veo el cambio", lo primero a comprobar es: **¿hemos hecho el deploy al VPS?** Vercel/Railway NO aplican aquí.

### Módulos implementados y estables

| Módulo | Estado | Descripción |
|---|---|---|
| Calculadora energética | ✅ Estable | Cálculo CEE, demanda calefacción, integración Catastro, **RBAC en Drive** |
| Autenticación / Roles | ✅ Estable | ADMIN, PARTNER/PRESCRIPTOR. Restricción de Drive para no-admins. |
| Oportunidades | ✅ Estable | CRUD completo, historial, estados, **ID format YYRES_OP**, persistencia de ID |
| Prescriptores / Partners | ✅ Estable | CRUD con modal de detalle, toggle de acceso al portal, importación desde Excel |
| Google Drive | ✅ Estable | Creación automática, movimiento por estado, enlace condicional por rol |
| Clientes | ✅ Estable | CRUD completo, modal detalle/edición, vinculación a oportunidades |
| Catastro | ✅ Estable | Búsqueda por RC y dirección, ficha técnica |
| Expedientes | ✅ Estable | Detalle con CEE, Cliente, Instalación, Documentación + subida facturas |
| Documentos PDF | ✅ Estable (2026-04-08) | Generación oficial de Anexo I, Cesión CAE, Ficha RES060 y Certificado CIFO |
| WhatsApp | ✅ Estable (2026-04-17) | Envío de mensajes y propuestas PDF, admin panel de conexión, estado en sidebar |
| Lifecycle Expedientes | ✅ Fase 1 (2026-05-20) | Vistas SQL en Supabase para tracking del ciclo de vida. Sin tocar código de app. |
| Documentación fotográfica | ✅ Estable (2026-05-29) | Superficie única `DocsManager` (cliente por enlace + admin en panel). Fases ANTES/DESPUÉS, validación foto a foto, escritura atómica, proxy de miniaturas. |

### Módulo Documentos — Novedades (2026-04-08)
- **Anexo I**: Formato oficial Arial 12pt. Lógica de ACS blindada (solo muestra unidad interior si se actúa sobre ACS).
- **Validación Hardening**: Bloqueo de generación si faltan campos críticos (seriales, emails, tlf, fechas CIFO).
- **RBAC en Drive**: Los partners no ven el botón de "Archivar en Drive" ni el link a la carpeta raíz.

### Módulo WhatsApp — Novedades (2026-04-17)

#### Arquitectura
- **Backend**: Servicio `whatsappService.js` con **whatsapp-web.js** + LocalAuth para persistencia de sesión
- **Frontend**: Panel de control admin en `WhatsappSettingsView.jsx` + modal reutilizable `SendWhatsappModal.jsx`
- **Integración**: Botón "Enviar WhatsApp" en modal de propuestas (`ProposalModal.jsx`) junto a email y Drive

#### Características Implementadas
- **Conexión**: QR code scanning con sesión persistente (`.wwebjs_auth/` no commiteado)
- **Rate Limiting**: 10 mensajes/minuto con colas automáticas
- **Human-Like Behavior**: Delays aleatorios 2.5-6s, indicadores de escritura, sin evasión de detección
- **Media Sending**: Envío de PDF adjuntos con caption personalizado
- **Estado en Tiempo Real**: Polling cada 5s en sidebar con indicador ACTIVO/INACTIVO (verde/rojo)
- **RBAC**: Admin-only (`requireAuth`), validación de teléfono del cliente

#### Rutas Backend
```
GET /api/whatsapp/status         → { state, ready, phone, name }
GET /api/whatsapp/qr             → QR code como PNG data URL
POST /api/whatsapp/connect       → Inicia instancia (manual)
POST /api/whatsapp/disconnect    → Desconecta
POST /api/whatsapp/send-text     → { phone, message }
POST /api/whatsapp/send-media    → { phone, caption?, media: { base64, filename, mimetype } }
```

#### Estados WhatsApp
- `DISCONNECTED` → No conectado
- `INITIALIZING` → Escaneando QR o reconectando
- `QR` → Mostrando código QR (escanear con teléfono)
- `AUTHENTICATED` → Sesión autenticada
- `READY` → Listo para enviar mensajes
- `AUTH_FAILED` → Error de autenticación

#### Flujo Propuesta → WhatsApp
1. Usuario en `ProposalModal.jsx` clica botón WhatsApp
2. Obtiene teléfono del cliente (campo o API `/api/clientes/:id`)
3. Verifica estado WhatsApp (`/api/whatsapp/status`)
4. Si `ready`, genera PDF (`/api/pdf/generate`) y envía media (`/api/whatsapp/send-media`)
5. Mensaje incluye resumen de ayuda (CAE, IRPF, total) + PDF propuesta

### Módulo Catastro — Cambios profundos (2026-05-19)

Este módulo es **crítico para la app** (búsqueda de propiedades por coords/RC) y tiene historia compleja con el WAF del Catastro desde IPs de datacenter. Lo que sigue es lo aprendido empíricamente — **léelo antes de tocar `catastroService.js`**.

#### Endpoints — WCF JSON (no ASMX/XML)

La app usa los **WCF JSON** del Catastro, NO los ASMX legados, porque el WAF del Catastro bloquea la familia ASMX desde IPs de datacenter (devuelve `400` con HTML "No se puede procesar su petición"). Los WCF JSON sirven los mismos datos sin ese filtro.

| Operación | URL | Params (case-sensitive) |
|---|---|---|
| Coords → RC | `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_RCCOOR` | `SRS=EPSG:4326&CoorX={lng}&CoorY={lat}` |
| RC → datos completos | `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC` | `Provincia=&Municipio=&RefCat={RC}` |
| RC → coordenadas UTM | `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_CPMRC` | `Provincia=&Municipio=&SRS=EPSG:25830&RefCat={RC14}` |

**Diferencias críticas con el ASMX**:
- Param `CoorX/CoorY` (no `Coordenada_X/_Y`)
- Param `RefCat` (no `RC`)
- Estructura raíz JSON: `consulta_dnprcResult`, `Consulta_RCCOORResult`, `Consulta_CPMRCResult` (no `consulta_dnp`, `consulta_coordenadas`)
- `bico.lcons` es array directo (no `bico.lcons.cons[]`)
- Tipo de catastro viene en `bico.finca.ltp`

#### Cliente HTTP — REGLA DE ORO

**NO USAR `axios` con el Catastro.** El WAF detecta el orden de headers de axios (`Accept` antes que `User-Agent`) y bloquea. Usar el helper `catastroGet(url, opts)` definido en [catastroService.js](implementation/backend/services/catastroService.js) que envuelve `http.request` puro.

`catastroGet` cumple obligatoriamente:
- `family: 4` (IPv4 forzado — Happy Eyeballs en IPv6 dispara el WAF)
- Headers en orden: `User-Agent`, `Accept`, `Accept-Encoding: identity`
- UA = `"Mozilla/5.0 (compatible; Brokergy/1.0; +https://app.brokergy.es)"` — UAs muy específicos (Chrome desktop completo, `curl/*`, `PostmanRuntime/*`) son bloqueados; UAs identificables genéricos pasan.

#### Estrategia de búsqueda por coords

`getRCByCoords(lat, lng)` en [catastroService.js](implementation/backend/services/catastroService.js) — orden:

1. **Cache LRU** (30 días por coords redondeadas) → 0 peticiones
2. **Petición central** → si acierta, 1 petición total
3. Si la central falla: **2 puntos en SERIE** (N, E ~11m offsets) con **800ms de sleep entre cada uno**. Para en el primer acierto.

**No** usar `Promise.all` con varias coords — el WAF rechaza ráfagas paralelas desde IPs datacenter (TCP reset / 400 HTML).

#### Monitor de rate-limit ([catastroMonitor.js](implementation/backend/services/catastroMonitor.js))

- `CONSECUTIVE_403_THRESHOLD = 1` — al primer error WAF, modo BLOQUEADO + alerta WhatsApp/email al admin.
- En modo BLOQUEADO, `shouldSkipRequest()` corta tráfico (no quemar más quota).
- Ping cada 5 min al endpoint `Consulta_RCCOOR` (Puerta del Sol) detecta recuperación → `recordSuccess()` desbloquea.
- `isRateLimitResponse(err, body)` detecta: status 403, "limite de peticiones", "peticion denegada", "no se puede procesar".

#### La referencia catastral se LEE de una foto (2026-08-27)

La referencia llega casi siempre en una imagen —captura del recibo del IBI, foto de la
escritura, pantallazo de un WhatsApp— y copiar 20 caracteres alfanuméricos a mano es
donde se cuela la errata. Y una errata ahí **no da un error legible**: el Catastro
contesta "no encontrado", que se lee como que la vivienda no está dada de alta.

En el buscador (`CatastroSearchBox`, modo REFERENCIA) hay un lector: se elige la imagen,
se **arrastra** o se **pega con Ctrl+V** —que es como llega una captura desde WhatsApp
Web— y la referencia leída **se busca sola**, sin un paso intermedio de confirmar: es el
gesto que se iba a hacer a continuación de todos modos.

| Qué | Dónde |
|---|---|
| Lectura (prompt + esquema + validación) | [catastroOcrService.js](implementation/backend/services/catastroOcrService.js) |
| Ruta | `POST /api/catastro/ocr-rc` (multipart `files[]`), **staffOnly** |
| Superficie | `CatastroSearchBox`, prop `permiteFotoRc` |

**REGLA — el modelo solo LEE; qué es una referencia lo decide el código.** `normalizarRC`
(14 o 20 caracteres alfanuméricos, sin separadores) y `extraerReferencias` son
deterministas. Al prompt se le prohíbe expresamente completar caracteres que no se lean
—vale más un array vacío que una referencia adivinada, porque una adivinada busca la
vivienda de otro— y se le enumeran las cadenas largas con las que NO debe confundirla
(nº de recibo, NIF, IBAN, finca registral, nº de serie). Medido sobre cuatro capturas
reales-tipo: las cuatro correctas, ~2 s cada una.

**REGLA — con VARIAS referencias en la imagen se pregunta.** Una ficha catastral trae la
de la parcela (14) y la del inmueble (20); elegir por el usuario sería adivinar cuál es
su vivienda. Se enseñan las dos rotuladas y con el contexto leído (dirección o titular)
para poder comprobarlo. Con una sola, se busca directamente.

**REGLA — el lector es del flujo INTERNO, no de la landing.** Detrás hay una llamada de
pago a un LLM: la ruta es `staffOnly` y el botón solo se pinta con `permiteFotoRc`
(`isInternal` en `LandingFunnelView`, `isStaff` en `App.jsx`). Un partner que lo viera
solo se llevaría un 403.

Es un **gemelo pequeño** de `ceeOcrService`, del que reutiliza `normalizeToPdf` (varias
fotos se unen en un PDF antes de leer). No se bifurcó aquel: leer 21 campos de un CEE de
30 páginas y localizar una cadena en una captura no comparten prompt ni esquema.

#### Frontend — Auto-parse de dirección catastral

En `ClienteDetailModal.jsx`, el botón **"Usar Catastro"** junto al input de dirección parsea strings tipo `"CL DON SERGIO 15 13700 TOMELLOSO (CIUDAD REAL)"` y rellena CCAA/Provincia/Municipio/CP automáticamente (matching por sufijo o fallback por dígitos del CP). Función `parseCatastroAddressFull()`.

#### Diagnóstico rápido si vuelve a fallar en VPS

```bash
ssh root@<VPS> 'docker exec brokergy-backend node -e "
const https=require(\"https\");
const o={host:\"ovc.catastro.meh.es\",port:443,family:4,path:\"/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_RCCOOR?SRS=EPSG:4326&CoorX=-3.6841&CoorY=40.4292\",method:\"GET\",headers:{\"User-Agent\":\"Mozilla/5.0 (compatible; Brokergy/1.0)\",\"Accept\":\"application/json\",\"Accept-Encoding\":\"identity\"}};
https.request(o,r=>{let d=\"\"; r.on(\"data\",c=>d+=c); r.on(\"end\",()=>console.log(\"status=\"+r.statusCode+\" body=\"+d.substring(0,200)));}).end();"'
```

- Si da `200` con `<pc1>` → el catastro funciona; mirar logs del backend, no es problema de IP.
- Si da `400` con HTML "No se puede procesar" → IP del VPS en lista del WAF. Esperar 30-60 min (suele liberarse solo). Si persiste >2 h, sospechar cambio en el WAF y revisar UA / orden de headers.
- También: `curl -s https://app.brokergy.es/api/catastro/status` muestra el estado del monitor en producción.

---

## Módulo Lifecycle de Expedientes (2026-05-20)

### Concepto
Los expedientes tienen un ciclo de vida de **8 estados reales** desde que se crea (al aceptar la oportunidad) hasta que se finaliza. Documentado a partir de la BD real el 2026-05-20. Se puede consultar en todo momento qué falta para avanzar al siguiente estado — incluyendo por un asistente IA conectado directamente a Supabase.

### Lifecycle completo — 8 estados reales

```
CREADO (al aceptar oportunidad)
  │
  ▼
PTE. CEE INICIAL                 → Responsable: BROKERGY
  Brokergy envía encargo al certificador.
  seguimiento.cee_inicial = PTE_ENVIO_CERT
  │
  ▼
EN CERTIFICADOR CEE INICIAL      → Responsable: CERTIFICADOR
  Certificador hace visita, mide, firma y sube el .cex al sistema.
  seguimiento.cee_inicial = ASIGNADO → EN_TRABAJO → PTE_PRESENTACION
  │
  ▼
PENDIENTE REVISIÓN (INICIAL)     → Responsable: BROKERGY
  Certificador subió el .cex. Brokergy lo revisa internamente.
  seguimiento.cee_inicial = PTE_REVISION
  │
  ▼
REVISADO Y LISTO (INICIAL)       → Responsable: BROKERGY
  Brokergy notifica al certificador para que registre el CEE.
  seguimiento.cee_inicial = REVISADO
  │
  ▼
PTE. FIN OBRA                    → Responsable: INSTALADOR
  CEE inicial registrado. Cliente notifica fin de obra con factura.
  Brokergy genera + envía + recoge firma de Anexo I y Cesión de Ahorros.
  seguimiento.cee_inicial = REGISTRADO
  │
  ▼
PTE. CEE FINAL                   → Responsable: CERTIFICADOR
  Fin de obra comunicado. Certificador hace visita final, firma y registra CEE final.
  seguimiento.cee_final = PTE_ENVIO_CERT → ... → REGISTRADO
  │
  ▼
REVISADO Y LISTO (FINAL)         → Responsable: BROKERGY
  CEE final revisado y registrado. Brokergy prepara documentación final.
  IMPORTANTE: el Certificado RITE es obligatorio antes de emitir el CIFO
  (la fecha del RITE se usa directamente en el CIFO).
  seguimiento.cee_final = REGISTRADO
  │
  ▼
PTE FIN EXPTE                    → Responsable: BROKERGY
  Documentación en tramitación. Pendiente firmas de CIFO y resto.
  │
  ▼
FINALIZADO                       → Ningún expediente aquí todavía (2026-05-20)
```

### Valores de `seguimiento.cee_inicial` (JSONB en `expedientes.seguimiento`)
| Valor | Significado |
|---|---|
| `PTE_ENVIO_CERT` | Pendiente de enviar encargo al certificador |
| `ASIGNADO` | Encargo enviado, certificador asignado |
| `EN_TRABAJO` | Certificador en proceso (visita, medición) |
| `PTE_PRESENTACION` | Pendiente de que el certificador suba el .cex |
| `PRESENTADO` | .cex subido, pendiente de revisión |
| `PTE_REVISION` | En revisión interna por Brokergy |
| `REVISADO` | Revisado, pendiente de notificar al certificador para registrar |
| `REGISTRADO` | CEE registrado oficialmente |

### Documentos del expediente y su ciclo (3 columnas por doc)
Cada documento tiene 3 estados: **generado** (borrador en Drive) → **enviado** (marcado como enviado al cliente) → **firmado** (PDF firmado subido).

| Documento | Campo Drive | Campo Enviado | Campo Firmado | Requiere firma |
|---|---|---|---|---|
| Anexo I | `anexo_i_drive_link` | `anexo_i_sent_at` | `anexo_i_signed_link` | ✅ Cliente |
| Cesión de Ahorros | `anexo_cesion_drive_link` | `anexo_cesion_sent_at` | `anexo_cesion_signed_link` | ✅ Cliente |
| Ficha RES (060/080/093) | `ficha_res060_drive_link` | `ficha_res060_sent_at` | — | ❌ Solo genera |
| Cert. CIFO / CAE | `cert_cifo_drive_link` | `cert_cifo_sent_at` | `cert_cifo_signed_link` | ✅ Instalador |
| Cert. RITE | `cert_rite_drive_link` | — | — | ❌ Manual/externo |
| Anexo Fotográfico | `anexo_fotografico_drive_link` | `anexo_fotografico_sent_at` | `anexo_fotografico_signed_link` | ✅ Cliente |

**REGLA**: El CIFO no se puede emitir sin tener `cert_rite_drive_link`. La fecha del RITE es obligatoria en el documento CIFO.

### Anomalía de integridad documental conocida
Algunos expedientes tienen `_signed_link` (PDF firmado) sin `_drive_link` (borrador). Ocurre cuando el usuario sube el firmado directamente sin pasar por la generación interna. La vista `v_expedientes_pendientes` detecta esto en el campo `anomalias_docs`.

### Vistas SQL activas en Supabase
**Fichero fuente:** `implementation/backend/scripts/expedientes_lifecycle_views.sql`
**Estado:** Desplegadas y activas en producción (2026-05-20).

#### `v_expedientes_lifecycle`
Una fila por expediente. Campos clave:
- `estado_actual`, `dias_en_estado_actual`, `responsable_bloqueo`
- Booleanos de cada fecha/documento (`cee_ini_visita_ok`, `anexo_i_firmado`, etc.)
- `campos_pendientes TEXT[]` — **solo los ítems que bloquean el avance en el estado actual**
- `historial_json` — historial completo (cambios de estado + comentarios)
- `seguimiento_cee_inicial`, `seguimiento_cee_final`

#### `v_expedientes_pendientes`
Filtra `v_expedientes_lifecycle` excluyendo `FINALIZADO`. Añade:
- `cliente_nombre`, `partner_nombre`, `partner_acronimo`
- `docs_generados_total` (máx 6), `docs_firmados_total` (máx 4), `docs_enviados_total`
- `anomalias_docs` — docs firmados sin borrador

### Queries de referencia para el asistente IA

```sql
-- ¿Qué falta exactamente en un expediente concreto?
SELECT campos_pendientes, responsable_bloqueo, dias_en_estado_actual
FROM v_expedientes_lifecycle
WHERE numero_expediente = '26RES060_118';

-- ¿Qué expedientes tienen algo pendiente hoy?
SELECT numero_expediente, estado_actual, responsable_bloqueo,
       dias_en_estado_actual, campos_pendientes
FROM v_expedientes_pendientes;

-- ¿Qué expedientes llevan más de 30 días sin avanzar?
SELECT numero_expediente, estado_actual, dias_en_estado_actual, responsable_bloqueo
FROM v_expedientes_pendientes WHERE dias_en_estado_actual > 30;

-- ¿Qué está esperando el certificador?
SELECT numero_expediente, cliente_municipio, dias_en_estado_actual, campos_pendientes
FROM v_expedientes_pendientes WHERE responsable_bloqueo = 'CERTIFICADOR';

-- ¿Qué documentos faltan firmar en tramitación?
SELECT numero_expediente, docs_generados_total, docs_firmados_total, campos_pendientes
FROM v_expedientes_pendientes
WHERE estado_actual IN ('PTE FIN EXPTE', 'REVISADO Y LISTO (FINAL)');

-- ¿Hay expedientes con anomalías de integridad documental?
SELECT numero_expediente, anomalias_docs
FROM v_expedientes_pendientes WHERE array_length(anomalias_docs, 1) > 0;
```

### Fases pendientes (no implementadas aún)
- **Fase 2 (backend):** Al cambiar de estado, guardar `campos_pendientes[]` en la entrada del historial — para saber con qué condición se avanzó cada estado.
- **Fase 3 (frontend):** Indicador visual del checklist del estado actual en `ExpedienteDetailView.jsx`.

---

## Módulo Documentación Fotográfica — Superficie unificada (2026-05-29)

Reemplaza el antiguo `SubirFotosModal` (2 slots hardcoded + base64 en BD, **eliminado**). Ahora hay **una sola superficie** para subir/ver/validar fotos, con permisos según quién entra.

### Componente núcleo: `DocsManager`
**Fichero:** `implementation/frontend/src/features/docs/DocsManager.jsx`. Dos modos:
- `mode="token"` → **cliente/instalador por enlace público** `/subir-docs/:uuid?token=` (subir, ver, sin validar). Envoltorio: `features/public/views/SubirDocsReformaView.jsx`.
- `mode="admin"` → **logueado** vía `features/calculator/components/DocsAdminModal.jsx` (modal in-app abierto desde el botón **"SUBIR FOTOS"** en `ResultsPanel.jsx`). Si `user.rol === 'ADMIN'` → **validar/rechazar foto a foto** y **borrar** (✕ en miniatura + 🗑 en lightbox).

### Checklist por fases (computado, NO persistido)
`reformaUploadService.buildDocChecklist(datos_calculo)` deriva los slots desde los `inputs` del instalador **o** del `landing_funnel`, etiquetados por `fase` (`ANTES`/`DESPUES`) y `gating` (`pre_aceptacion` en caldera+placa). La pestaña **DESPUÉS se bloquea** hasta `datos_calculo.estado === 'ACEPTADA'`. Caldera/placa son `multiple` (varias perspectivas, sufijo `_1`, `_2`…).

### Almacenamiento (incremental, sin esquema nuevo)
- **Ficheros**: Drive, carpeta `12. DOCUMENTOS PARA CEE`, nombre `FOTO_{SLOT}[_N].{ext}`.
- **Estado POR FOTO**: en cada entrada de `datos_calculo.reforma_uploads[slot][i]` → `{ name, link, driveId, at, estado, motivo, subido_por }`. `estado` ∈ `subida|validada|rechazada`. El estado del SLOT es un resumen derivado.
- `datos_calculo.upload_token` (32 hex) se siembra al guardar la oportunidad (`POST /api/oportunidades`).

### Endpoints
```
GET  /api/public/reforma-docs/:uuid?token=            → vista (checklist+estado+miniaturas) RECONCILIADA con Drive
POST /api/public/reforma-docs/:uuid/:slot?token=      → sube 1 foto (requireAuth opcional marca subido_por)
DEL  /api/public/reforma-docs/:uuid/:slot?token=&driveId=  → borra de Drive + estado
GET  /api/public/reforma-thumb/:uuid/:driveId?token=&sz=  → PROXY de miniatura (mismo origen)
GET  /api/oportunidades/:id/docs                      → vista admin (enforceAuth); devuelve uuid + upload_token
POST /api/oportunidades/:id/docs/:slot/validar        → adminOnly
POST /api/oportunidades/:id/docs/:slot/rechazar       → adminOnly; notifica WhatsApp/email a subido_por
```

### Notificación de rechazo
Cada foto guarda `subido_por` (`cliente|instalador|admin`). Al rechazar, el backend resuelve el contacto desde la oportunidad: `instalador`→`prescriptores` (instalador_asociado_id/prescriptor_id); resto→`clientes` (cliente_id). **Cuidado en pruebas**: rechazar en una oportunidad con cliente real envía WhatsApp real.

### Migración SQL (ya en producción)
`implementation/backend/scripts/reforma_uploads_atomic_writes.sql` → funciones `reforma_append` / `reforma_replace_slot`.

### Aviso al staff cuando suben documentación (2026-07-30)
Las dos superficies públicas de subida avisan al staff por **WhatsApp (`WHATSAPP_ADMIN_CHAT`) + email
(`ADMIN_EMAIL`, buzón secundario)**. La lógica vive en
[uploadNotifier.js](implementation/backend/services/uploadNotifier.js) — no duplicar el aviso en las rutas.

- **Agrupación obligatoria**: `/subir-docs` manda UNA petición POR FOTO. `registrarSubida()` acumula en
  memoria por oportunidad y manda **un solo resumen** tras una ventana de silencio de 30 min
  (`UPLOAD_NOTIFY_WINDOW_MS`). Cada subida nueva reinicia el contador. No poner un `sendText` suelto en la ruta.
- **Nunca avisa de lo que sube el propio staff**: se filtra por `isStaff(req)` (un TRABAJADOR se marca
  como `subido_por: 'instalador'` y avisaría en falso).
- **Fin de obra**: `POST /api/public/reforma-docs/:uuid/fin-obra?token=` (declarado **antes** de
  `/:uuid/:slot` o Express lo tomaría por un slot). Avisa al instante, persiste
  `expedientes.documentacion.fecha_fin_obra_comunicada` vía `set_expediente_doc_field` e ignora
  repeticiones dentro de 24 h. El botón está al final de la fase DESPUÉS de `DocsManager` (solo `mode="token"`).
- El buffer vive en memoria: un reinicio del contenedor dentro de la ventana se come ese aviso (los
  ficheros ya están en Drive). Por eso el fin de obra, que sí es un hito, además se persiste.

### Alcance documental — a cada expediente se le pide LO SUYO (2026-08-11)

El checklist ya no es la lista completa de apartados: es la lista de **este** expediente.
Fuente única: [docsAlcance.js](implementation/backend/services/docsAlcance.js), que lee el
expediente y lo inyecta como `datos_calculo.alcance` en `buildDocChecklist`.

**REGLA — manda el EXPEDIENTE; la oportunidad es el punto de partida.** `deriveSelectors`
resuelve en cascada `alcance` → `inputs` → `landing_funnel`. Un campo del alcance a `null`
(el expediente no lo ha declarado aún) **no es `false`**: solo entonces se cae al escalón
siguiente. Sin eso, un expediente recién creado apagaría apartados que la oportunidad sí pedía.

| Situación | Qué deja de pedirse |
|---|---|
| **CEE inicial REGISTRADO** | Fachada, patios, vídeo de la vivienda, planos, CEE anterior y **presupuesto** (`CEE_CAPTACION_SLOTS`) |
| **ACS fuera de alcance** (`cambio_acs === false` o termo eléctrico) | `FOTO_ACS_ANTES`, `FOTO_ACS_DEPOSITO` |
| **Ficha de sustitución de caldera** (RES060/093/TER100) | Ventanas, cubierta, fachada y suelo: la ficha no contempla obra de envolvente |
| **RES080** | Solo los elementos que declara `documentacion.envolvente`, no los de la simulación |
| **Emisor = radiadores** | `FOTO_EMISORES_ANTES` (ver abajo) |
| **Emisor = suelo radiante** | — se pide `FOTO_ARMARIO_SUELO_RADIANTE` |

**REGLA — el apartado que no procede DESAPARECE, no se queda "opcional".** Antes solo se le
quitaba el `required`, y la pantalla del móvil se llenaba de casillas muertas que escondían lo
que sí faltaba. **Nada se pierde**: lo ya subido a un apartado podado sigue en Drive y
`buildDocsView` lo enseña en el cajón `OTROS_EXISTENTES`, que lista la carpeta entera (regla 20).

**REGLA — los RADIADORES ya no se fotografían.** Lo que justifica la temperatura de impulsión —y
con ella el SCOP declarado— es `instalacion.tipo_emisor`, que ya viaja al CIFO; la foto no añadía
nada al expediente y sí una casilla más. `conceptsFromInstalacion` dejó de emitir el concepto
`emisores`. Sigue en `ADDABLE_CONCEPTS` por si un verificador la reclama.

**REGLA — el GENERADOR de calor actual se documenta SIEMPRE, arda o no.** `hayCaldera` preguntaba
"¿hay caldera de COMBUSTIÓN?" y, si no la había, el expediente se quedaba sin **ninguna** foto del
estado inicial. Medido en 26RES080_OP54 (radiadores eléctricos + termo): no se le pedía una sola
foto de lo que se iba a sustituir, que es justo lo que justifica el ahorro de un RES080. Ahora solo
se calla si la vivienda declara que NO tiene calefacción, y `calderaEsCombustion` decide **cómo se
llama**, no si se pide: con calefacción eléctrica el apartado es "Sistema de calefacción actual"
("Cómo calientas hoy la casa" para el cliente) y el del DESPUÉS, "Equipo antiguo retirado" — pedirle
"la caldera vieja ya quitada" a quien nunca tuvo caldera es pedirle una foto imposible.

**REGLA — el ACS inicial se pide según QUÉ APARATO calienta hoy el agua.** Lo dice el paso 5 del
funnel (`boiler_acs_type`): con **`misma_caldera` NO se pide foto** — la calienta la propia caldera y
esa foto ya está pedida más arriba; con `no_tengo` tampoco. Con **otro aparato** (termo · butano ·
solar · gas · gasóleo) sí, y **se le llama por su nombre**: "Tu termo eléctrico actual", no "Sistema
de ACS actual", que no significa nada fuera de una oficina (tabla `ACS_INICIAL_LABEL`). En altas por
CALCULADORA, sin funnel, se deduce de que `boilerAcsType` difiera de `boilerHeatingType`
(`tipoAcsDesdeInputs`).
⚠️ `instalacion.misma_caldera_acs` **solo cuenta cuando vale `false`**: `expedienteService` lo siembra
a `true` en todo expediente nuevo sin mirar lo que contestó el cliente, así que un `true` no es una
declaración y no puede apagar la foto — un `false` sí, porque alguien movió el toggle a propósito.

**REGLA — el ACS INICIAL no es lo mismo que "se cambia el ACS".** `changeAcs` dice si la ACTUACIÓN
toca el ACS; `acsInicial` dice si hay que documentar el que YA HABÍA. En un **RES080** el ahorro se
justifica comparando antes/después y el ACS entra en esa tabla de emisiones (en 26RES080_OP54:
7,91 → 7,59 kg CO₂/m²), así que el termo existente se fotografía aunque la obra no lo sustituya. En
una ficha de sustitución de caldera sigue mandando la regla 12.b: ACS fuera de alcance → no se pide.
El **depósito nuevo** (`FOTO_ACS_DEPOSITO`, fase DESPUÉS) solo se pide si `changeAcs`.

**REGLA — lo que define la ACTUACIÓN va PRIMERO; el contexto, detrás.** Fachada de la calle, patios,
vídeo, planos, CEE previo y presupuesto son material para que el certificador levante el CEE: van al
final. Iban delante, y en un RES080 de cubierta la foto del tejado caía en el **paso 7 de 8**, detrás
de cuatro cosas opcionales — parecía que no se pedía. El orden del `push` en `buildDocChecklist` ES
el orden de la pantalla (`byTier` solo reordena por estado y conserva el índice original).

**REGLA — un apartado de OTRO emisor se retira (`SLOT_EMISOR` / `emisorDesencaja`).** Cada familia
de emisor tiene su foto y son excluyentes: suelo radiante → armario de colectores; radiadores → ya
no se pide; aire-aire (splits/conductos de un RES080) → ninguna, porque esa foto ya es la de la
unidad interior. Pero `syncInstalacionConcepts` habilitaba estos apartados por override y el
override **queda persistido**: al cambiar el emisor después, el apartado seguía apareciendo.
Medido sobre 26RES080_63 (emisor `conductos`): pedía el armario del suelo radiante, que allí no
existe. Se retira solo si el expediente declara un emisor DISTINTO —uno sin declarar no decide
nada— y solo si está VACÍO: lo ya subido no se esconde nunca.

**REGLA — el checklist se pide SIEMPRE por `checklistForOportunidad(opp)`**, nunca por
`buildDocChecklist(datos_calculo)` a pelo, en cualquier ruta que **valide** un slot (subir,
borrar, unir en PDF). Si la vista poda un apartado y el POST no, subir a un slot que ya no existe
responde 200 y queda un destino vivo para quien conserve la URL antigua. Las cuatro superficies
—enlace del cliente, panel del admin, barrido de "qué falta" y `/anexo-photos`— comparten alcance.

**El RITE lo aporta el INSTALADOR**: `optionalAlways` + `aportaInstalador`. Nunca se le marca al
cliente como obligatorio (no puede emitirlo); se le ofrece por si lo tiene y se le dice que se lo
pedimos nosotros.

### El enlace del cliente se usa CON EL MÓVIL (2026-08-11)

`DocsManager` tiene dos caras y `clientView = mode === 'token'` las separa. El admin (PC, expediente
entero) conserva pestañas, densidad y validación. El cliente ve otra cosa:

- **Una sola lista, sin pestañas.** "Después de la obra" era una pestaña a la que había que
  acordarse de entrar, y lo que falta ahí es tan urgente como lo de antes.
- **Pero las dos fases NO se mezclan**: pedirle hoy la placa de la unidad exterior a quien no ha
  empezado la obra es darle una tarea imposible, y once tareas imposibles hacen que deje de mirar
  la lista. La fase activa (`obraEnMarcha`) va primera; la otra, detrás y diciendo cuándo toca.
- **Modo GUIADO por defecto: UN apartado en pantalla cada vez.** Siete tarjetas iguales producen
  parálisis en quien no se maneja — coge lo primero que entiende y hace solo eso. Salida siempre
  visible con "Ver todos los apartados", y desde la lista se vuelve con "Guíame paso a paso".
- **El recorrido lo componen TODOS los apartados de la fase activa, no solo los pendientes**
  (`recorrido`), para poder **volver atrás a ver la foto que ya se subió**. Antes, al subirla el
  apartado desaparecía de la cola y no había forma de volver a mirarla. Sobre un apartado ya
  resuelto la tarjeta enseña **su foto** en vez del ejemplo (pulsable → visor), lo dice
  ("✓ Ya nos la has enviado") y el botón pasa a "+ Añadir más".
- **La navegación tiene DOS mandos y una prioridad.** `pasoKey` es lo que el cliente elige con
  Anterior/Siguiente; mientras vale `null` manda el automático, que enseña el primer pendiente **por
  urgencia** (lo rechazado primero) y no por orden de lista. Al subir con éxito se vuelve a `null`:
  el apartado deja de estar pendiente y el siguiente aparece solo, sin índices que se desajusten.
  **"Siguiente" sobre algo aún pendiente APLAZA** (`saltados`), nunca omite: vuelve al final, y si
  se apartan todos la cola vuelve a empezar.
- **Acuse de recibo tras subir** ("✓ Recibida, gracias", 3,2 s). Sin él la tarjeta cambia sola al
  paso siguiente y no queda señal de que la foto haya llegado: quien no se maneja la vuelve a subir
  por si acaso, y nos llegan duplicados.
- **El cliente puede QUITAR una foto suya**, pero solo mientras está `subida` (pendiente de
  revisión): una ya validada forma parte del expediente. Es la pareja de "volver atrás" — mirar y no
  poder corregir es media función, y sin esto sube la buena encima y hay que adivinar cuál vale.
  Confirmación en dos pasos.
- **Un DOCUMENTO no lleva ilustración** (`SIN_ILUSTRACION`: `DOC_`, `VIDEO_`, `OTROS`). Una factura
  se entiende con su título; un dibujo de "una hoja con rayas" no añade nada y en un móvil ocupa
  media pantalla que debería estar viendo el botón. El pictograma se gana su sitio cuando enseña un
  ENCUADRE que se hace mal (la pegatina de cerca, el armario abierto); en un papel no hay encuadre.
  Excepción: `DOC_CEE_EXISTENTE` sí enseña la etiqueta energética, porque ahí el problema es que el
  cliente no sabe QUÉ PAPEL es — `SLOT_FOTO` manda sobre esa lista.
- **Cada paso lleva una FOTO DE EJEMPLO**, marcada "EJEMPLO" en una esquina (sin ese distintivo
  más de uno la toma por algo ya subido y pasa de largo). Viven en `frontend/public/tutorial/`
  (ver su `LEEME.md`) y el mapa es **EXPLÍCITO por slot** (`SLOT_FOTO`), no por familia: "la
  cubierta antes" y "la cubierta terminada" son la misma familia y fotos opuestas, y enseñar la
  contraria es peor que no enseñar ninguna. Un slot sin foto cae al pictograma SVG, que se queda
  como red de seguridad. **Se recorta el titular incrustado** de la imagen original: la app ya pone
  el título en lenguaje de cliente y, en un móvil de 375 px, esa franja se renderiza a ~7 px. Lo que
  se conserva es el encuadre verde y el distintivo, que es lo que enseña qué tiene que salir.
  Las originales quedan en `frontend/tutorial-originales/`, **fuera del sitio web y de git**
  (28 MB en PNG → 1,6 MB en JPEG servido).
- **Cada paso lleva un DIBUJO del encuadre** ([SlotIlustracion.jsx](implementation/frontend/src/features/docs/SlotIlustracion.jsx)):
  pictogramas SVG, no fotos. La causa nº 1 de foto rechazada es que no se lee el nº de serie de la
  pegatina, y el texto solo no lo arreglaba. Son SVG porque no pesan en una conexión móvil, se
  adaptan al tema y no exponen la vivienda de ningún cliente (una foto real necesitaría su permiso).
  El dibujo enseña el ENCUADRE, que es lo que se hace mal, no el aparato exacto.
- **Lo ya entregado va plegado** en una línea. Ocupaba media pantalla sin ser accionable.
- Botón **a todo el ancho y debajo** del texto: con el botón a la derecha, un título de dos líneas
  lo empuja fuera del alcance del pulgar. Dice qué va a pasar ("📷 Hacer foto" abre la cámara).
- Barra de progreso y **lo rechazado primero**, anunciado: es lo único que el cliente ya daba por
  hecho y sigue pendiente.

**REGLA — lo PRESCINDIBLE no se le pide a un expediente EN CURSO.** Vídeos, planos, "Otros" y el
CEE posterior van marcados `prescindible: true`. Con la oportunidad ya ACEPTADA, la ruta pública
pide la vista con `audience: 'cliente'` y esos apartados **no se le enseñan** — no alimentan ningún
documento (el CEE final lo emite NUESTRO certificador) y solo alargaban la pantalla del móvil. El
**admin los conserva** (los usa para archivar material suelto), y un apartado prescindible que YA
tenga ficheros no se oculta nunca.

**Arrastrar y soltar en el paso guiado** (PC): la tarjeta entera es zona de suelta y admite varios
ficheros. La pista "o arrástralas aquí" va en `hidden md:inline` — en un móvil no hay de dónde
arrastrar y mencionarlo solo confunde. Con varios ficheros el botón dice **"Subiendo 3 de 7…"**,
no un porcentaje: las subidas van de una en una y un % que vuelve a cero en cada foto parece que
se ha colgado.

**El botón NUNCA dice "Hacer foto"**: al pulsar, el móvil ofrece cámara *y* galería, y muchas de
esas fotos ya están hechas. Va en PLURAL cuando el apartado admite varias (`slot.multiple`) y lleva
debajo "Puedes elegir varias a la vez": el selector del móvil no anuncia la selección múltiple y sin
decirlo nadie la prueba.

**REGLA — al cliente se le habla en LENGUAJE DE CASA, y las etiquetas técnicas NO se tocan.** El
backend manda las dos: `label`/`help` (técnicas — con ellas trabajan el admin, el Anexo Fotográfico
y el CIFO) y `labelCliente`/`helpCliente`, que salen de la tabla `LABEL_CLIENTE` de
[reformaUploadService.js](implementation/backend/services/reformaUploadService.js). "Placa de la
unidad interior / DEPOSITO ACS" lo escribió un ingeniero; el cliente lee "La pegatina de la máquina
de dentro". Un slot sin traducir cae a la etiqueta técnica. La **hibridación es la excepción** que
hay que repetir a mano (la tabla es plana por slot): ahí la caldera no se quita, así que
`FOTO_CALDERA_DESMONTADA` no puede decir "La caldera vieja, ya quitada".

**Rendimiento de la vista**: la reconciliación con Drive eran CUATRO llamadas en serie (buscar
carpeta + listar, dos veces) ≈ 1,9 s con el cliente ante una pantalla vacía. Ahora las dos cadenas
van en `Promise.all` y el ID de subcarpeta sale de una caché de por vida del proceso
(`subfolderIdCached`) — una subcarpeta se crea una vez y no se mueve. Queda en ~1,1 s en frío y
**~0,4 s** después. Se cachea el ID, **nunca el contenido**: Drive sigue siendo la fuente de verdad
de qué ficheros hay (regla 20) y esa lista cambia a cada subida.

**El portal `/mi-expediente` no le pide lo que generamos nosotros.** `clientPendings`
([portalService.js](implementation/backend/services/portalService.js)) excluye "sin generar" /
"sin emitir": el Anexo I y el Convenio de Cesión los emite Brokergy y el cliente solo los firma.
Listárselos enterraba entre cinco líneas las dos que sí dependían de él.

---

## Ficha TER100 — Sector TERCIARIO (2026-07-30)

Cuarta tipología de expediente, junto a RES060 / RES080 / RES093. Es un **CLON de
RES060** (sustituir caldera de combustión por bomba de calor eléctrica) pero en un
edificio del **sector terciario**: hoteles, restaurantes, residencias, gimnasios,
centros educativos, oficinas… Nomenclatura `{YY}TER100_{N}`, **el correlativo
arranca en 3** (`26TER100_3`) porque había dos expedientes heredados del sistema
anterior.

### Lo único que la separa de RES060

1. **El ahorro se DESGLOSA en tres sumandos** (apartado 4 de la ficha), cada uno
   con su propio SCOP, y el total es la suma de los que apliquen:

   ```
   AE_C   = (1/η_i − 1/SCOP)     · D_C · S · F_P     calefacción
   AE_ACS = (1/η_i − 1/SCOP_dhw) · D_ACS    · F_P    agua caliente sanitaria
   AE_CAP = (1/η_i − 1/SCOP_pwh) · D_CAP    · F_P    calentamiento de piscina
   AE_TOTAL = AE_C + AE_ACS + AE_CAP
   ```

   ⚠️ Unidades NO homogéneas: `D_C` va en kWh/año·m² (se multiplica por S),
   mientras `D_ACS` y `D_CAP` ya son kWh/año absolutos.

2. **La calefacción es alcance OPCIONAL**: puede haber una actuación de solo
   calefacción, solo ACS o ambas. Lo declara `instalacion.cambio_calefaccion`
   (ausente = SÍ; en RES060/RES093 siempre es SÍ y el toggle no se muestra).
3. **Piscina**: `instalacion.piscina` = `{ activa, demanda_kwh, scop, equipo:{marca,
   modelo,numero_serie} }`. **Nace SIEMPRE desactivada** — casi nunca aplica. El
   SCOP_pwh se mete A MANO desde la ficha técnica (el catálogo `aerotermia` no
   tiene SCOP de piscina y no se interpola por temperatura de impulsión).
4. **D_ACS admite modo MANUAL** (`cee.acs_method = 'manual'` + `cee.dacs_manual` en
   kWh/año). En terciario la demanda va por plaza/servicio (Anexo V de la ficha) o
   la fija el proyecto: la fórmula del CTE por dormitorios no encaja. El selector
   MAN solo se ofrece en expedientes TER100.
5. **SIN IRPF**: el titular es empresa/autónomo, así que no aplican ni la deducción
   por obras en vivienda ni la ganancia patrimonial del bono CAE
   (`includeIrpf: false`, `titularType: 'empresa'`). Precios por defecto los mismos
   que RES060 (95 €/MWh cliente, 160 €/MWh S.O.) y D_i = 15 años.
6. **NO hay hibridación**: la ficha del terciario no contempla el Cb, así que el
   bloque de hibridación se oculta en Instalación.

Todo lo demás es idéntico a RES060: flujo de CEE inicial/final con certificador,
estados, lotes, Anexo I, Convenio de Cesión, Anexo Fotográfico y slots documentales
(comparte `ficha_res060_*` y `cert_cifo_*` — un expediente es de UNA ficha).

### Fuentes únicas (no duplicar esta lógica)

| Qué | Dónde |
|---|---|
| Lista de fichas + correlativo inicial + detección (backend) | [utils/fichas.js](implementation/backend/utils/fichas.js) — `FICHAS`, `correlativoInicial`, `detectPrograma` |
| Lista de fichas + clasificación (frontend) | [expedienteTaxonomia.js](implementation/frontend/src/features/expedientes/logic/expedienteTaxonomia.js) — `FICHAS`, `getFicha` |
| Fórmula de las tres AE | `calculateTer100()` en [calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js) |
| expediente → variables de la ficha | [logic/ter100.js](implementation/frontend/src/features/expedientes/logic/ter100.js) — `deriveTer100Vars`, `esTer100`, `ter100Alcance` |
| Demanda de ACS (xml · CTE · manual) | [logic/demandaAcs.js](implementation/frontend/src/features/expedientes/logic/demandaAcs.js) — `resolveDacs` |
| Ficha oficial TER100 (PDF) | [logic/fichaTer100Html.js](implementation/frontend/src/features/expedientes/logic/fichaTer100Html.js) + `FichaTer100Modal` |
| Recuadro de firma de la ficha | `signBoxes.js` → `ficha_ter100` (**página 4**, no la última) |
| CIFO | `cifoDoc.js` (rama `isTer100`) — la misma para app y backend |

**REGLA**: en el CIFO y en la Ficha, el AE_TOTAL se calcula desde el desglose, NO
desde el `results.savingsKwh` que llega por parámetro. Lo primero que comprueba el
verificador es que el total sea la suma de sus sumandos: no puede haber un
`results` desfasado que produzca un certificado contradictorio.

**REGLA**: un servicio fuera del alcance se imprime **"no aplica"**, nunca 0 (ni su
demanda ni su SCOP). Con el valor a la vista, el verificador podría multiplicarlo y
obtener un ahorro que no forma parte de la actuación.

**REGLA**: `fichaTer100Html.js` es una RÉPLICA de `plantillas/Ficha TER100.pdf` —
mismos saltos de página, textos, notas al pie, subtítulos centrados en cursiva y
fórmulas centradas con fracción apilada. Los saltos de página **no se mueven**: el
verificador compara la ficha con el modelo oficial. Geometría medida con PyMuPDF
sobre la plantilla (idéntica a la de RES060): A4, Arial 12pt, interlineado 20,7pt
(1,725), padding `94px 99px 19px 113px`. Si se cambia el ancho de texto, los
párrafos y las notas dejan de romper donde rompen en el original. Para
re-verificarlo: renderizar la plantilla a 794px de ancho con PyMuPDF y comparar
página a página con el PDF generado.

---

## Ficha TER173 — HIBRIDACIÓN en el terciario (2026-09-09)

Quinta tipología, y la única que es dos cosas a la vez: **los tres servicios de la
TER100 ponderados por el C_b de la RES093**. Hibridación en modo paralelo de
caldera/s de combustión con bomba de calor en edificios NO residenciales de zona
climática **D1, D2 o D3**. Nomenclatura `{YY}TER173_{N}`, correlativo desde **1**.

```
AE_C   = (1/η_i − 1/SCOP)     · D_C · S · F_P     calefacción
AE_ACS = (1/η_i − 1/SCOP_dhw) · D_ACS    · F_P    agua caliente sanitaria
AE_CAP = (1/η_i − 1/SCOP_pwh) · D_CAP    · F_P    calentamiento de piscina
AE_TOTAL = (AE_C + AE_ACS + AE_CAP) · C_b         ← apartado 4 de la ficha
```

**REGLA — el C_b pondera el TOTAL, no solo la calefacción.** Lo dice la fórmula del
apartado 4, fuera del corchete. Medido sobre un caso con los tres servicios: si solo
ponderara AE_C el total saldría un **7,8 % más alto**, y ese exceso es ahorro que
sigue aportando la caldera. De paso se corrigió la RES093, cuya ficha lo pone igual
—sobre calefacción **y** ACS— y en la app solo multiplicaba la calefacción; medido
sobre los 7 RES093 de producción, cambian 4 (entre −0,1 % y −2,1 %) y el único ya
subido a MITECO no se mueve, porque su ACS está fuera de alcance.

**REGLA — la tabla del C_b es UNA sola.** El Anexo IV de la TER173 (columna
AEROTERMIA) coincide **valor a valor** con el Anexo III de la RES093, comparados los
16 escalones. Por eso comparten `BIVALENCE_TABLE` y el apartado 8 del CIFO: dos
copias divergirían el día que el Ministerio corrija una. El Anexo IV trae además una
columna para bombas **geotérmicas e hidrotérmicas** (al 50 %: 86,38 % frente a
80,45 %) que **no se implementa**: la app solo trabaja con aerotermia y un selector
que nadie usa envejece sin que nadie lo compruebe.

**REGLA — el impreso oficial NO tiene casilla para el C_b.** Su tabla de resultado es
AE_C · AE_ACS · AE_CAP · AE_TOTAL · D_i, así que **el total impreso no cuadra con la
suma de los tres sumandos impresos** — y eso es lo primero que cruza un verificador.
El CIFO es el único sitio donde se explica: su desglose lleva dos columnas más
(Σ AE y C_b) y su apartado 8 cierra con la nota que lo dice con las dos cifras
delante. No es un fallo del relleno: es cómo publica la ficha el Ministerio.

**REGLA — un TER173 sin datos de hibridación NO se genera.** Sin potencia de bomba
(o sin la de caldera, en el método por caldera) el C_b se queda en 1 y el ahorro sale
como si la caldera se hubiera retirado: más alto que el real, y firmado. Se marca
`cbIncompleto` en `deriveTerciarioVars` y es **bloqueante** en la validación del CIFO
(`cifoService.buildValidation`), no un aviso. La instalación lo siembra activado —en
las fichas de hibridación la hibridación ES la actuación, no una opción.

**REGLA — el SECTOR se declara, no se deduce, y se mira PRIMERO.** La calculadora es
residencial y nunca produce un terciario: las fichas TER las marca una persona desde
"cambiar tipo de actuación". En TER173 mirarlo después de `isHybrid` no es solo
inútil, es dañino: sus inputs llevan `hibridacion: true` y la rama de RES093 se la
llevaría en el primer reguardado desde la calculadora
(`routes/oportunidades.js`, `AdminPanelView`, `ExpedientesView`).

### Fuentes únicas

| Qué | Dónde |
|---|---|
| Lista de fichas, correlativo, detección, `esHibridacion`/`esTerciario` | [utils/fichas.js](implementation/backend/utils/fichas.js) |
| Variables del TERCIARIO (las DOS fichas) | [logic/terciario.js](implementation/frontend/src/features/expedientes/logic/terciario.js) — `deriveTerciarioVars`, `esTer173`, `fichaTerciaria` |
| Fórmula de los tres AE + el C_b como parámetro | `calculateTerciario()` en [calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js) |
| Tabla del C_b (Anexo IV TER173 = Anexo III RES093) | `BIVALENCE_TABLE` / `getCb` en `calculation.js` |
| Valores de la ficha (formateados) | [logic/fichaTer173.js](implementation/frontend/src/features/expedientes/logic/fichaTer173.js) |
| Casillas del impreso oficial | [logic/fichasFormulario.js](implementation/frontend/src/features/expedientes/logic/fichasFormulario.js) — `camposTer173` |
| Plantilla | `backend/plantillas/FichaTER173.pdf` (5 páginas · 22 campos) |
| Recuadro de firma | `signBoxes.js` → `ficha_ter173_oficial` (**página 5**, no la 4 como TER100) |
| Modal (compartido con TER100) | `FichaTerciarioModal.jsx`, prop `ficha` |
| CIFO | `cifoDoc.js` — `isTerciario` + `isTer173` + `cbAnexo` |
| Colores de ficha (fuente única de las 4 pantallas) | `expedienteTaxonomia.js` — `fichaColor` |

**Nota de nomenclatura**: `logic/ter100.js` pasó a llamarse **`logic/terciario.js`** al
entrar la TER173. Un fichero que resuelve dos fichas no puede llamarse como una de
ellas, o la siguiente acaba escribiéndose fuera con su propia copia de la derivación.
`deriveTer100Vars` → `deriveTerciarioVars`, `TER100_PRECIOS` → `TERCIARIO_PRECIOS`.

**La TER173 NO tiene maqueta HTML.** Nació después de que el Ministerio publicara los
impresos como PDF de formulario (regla 41), así que no hay borradores del formato
anterior en Drive y no hay nada que conservar: su modal no lleva conmutador
Oficial · Clásico.

### Sus anexos, y qué confirma cada uno

| Anexo | Qué es | Qué confirma |
|---|---|---|
| **II** | SCOP en calefacción (`CC·(η_s,h+F1+F2)`) y en ACS, con el caso de depósito NO suministrado como conjunto | La tabla de F_c —**D1 1,093 · D2 1,103 · D3 1,113** a 55 °C— es la que ya usaba la app (`FC_TABLE` del CIFO) |
| **III** | SCOP_pwh de piscina (`COP · FC`) | El SCOP de piscina se teclea a mano desde la ficha técnica, como en TER100 |
| **IV** | Tabla del C_b | Coincide valor a valor con el Anexo III de la RES093 |
| **VIII** | η_i de la caldera sustituida (tabla B.3 por combustible, antigüedad y tipo) | Coincide **fila a fila (18) con `BOILER_EFFICIENCIES`** — vigilado por `test_ter173.mjs` |

⚠️ **La nota al pie 2 del Anexo III remite al "Anexo VIII" para la temperatura
exterior de las bombas aerotérmicas, y el Anexo VIII NO es eso**: es la tabla de
rendimientos de caldera. Es una referencia cruzada equivocada de la ficha — no
pierdas el tiempo buscando una tabla de temperaturas que no existe ahí.

En TER173 el párrafo de la temporada de referencia **no invoca el Anexo III de la
RES060** —es una ficha residencial—: dice que la temporada es aquella en la que se
declara el SCOP adoptado, y ahí se queda. El η_i sí cita el **Anexo VIII de la propia
ficha**, que es más fuerte que la referencia genérica a los criterios de verificación.

### Se crea DESDE LA OPORTUNIDAD, no solo desde el expediente

Hasta 2026-09-09 la ficha del terciario solo se declaraba con "cambiar tipo de
actuación" **dentro del expediente**, que no existe hasta que el cliente acepta. Para
simular un TER173 y presentárselo había que crearlo como residencial y reclasificarlo
después. Ahora:

- **Selector de SECTOR en la calculadora** (Residencial · Terciario), junto a "Modo
  Reforma", con la ficha resultante a la vista. Solo lo ve el STAFF (`showBrokergy`).
- **Reclasificar una oportunidad ya guardada**: la chapa de la ficha en el panel de
  admin es un desplegable (`PATCH /api/oportunidades/:id/ficha`, **adminOnly**).

**REGLA — el SECTOR se declara; la FICHA se deduce.** No hay un desplegable de cinco
fichas: hay un sector, y la ficha sale de sector + hibridación + reforma, con la MISMA
función en los dos lados (`detectPrograma` en el backend, `fichaDesdeInputs` en el
frontend). Un desplegable libre dejaría elegir combinaciones que no existen —un TER173
sin hibridar— y el backend las resolvería por su cuenta a espaldas de quien las marcó.

|             | sin hibridar | hibridado |
|---|---|---|
| **residencial** | RES060 | RES093 | (+ RES080 si es reforma) |
| **terciario**   | TER100 | TER173 |

**REGLA — el sector se mira ANTES que la reforma.** La RES080 es "rehabilitación
profunda de edificios de VIVIENDAS": no existe en el terciario. Al marcar Terciario, el
botón de reforma se apaga y se deshabilita, en vez de dejar elegir algo imposible.

**REGLA — sin `sector` en el payload manda lo ya declarado.** Un navegador con la
versión anterior cargada, o el funnel público, no lo mandan; y como un TER173 es una
hibridación (sus inputs llevan `hibridacion: true`), sin esa salvaguarda la rama de
RES093 se lo llevaría en el primer reguardado, dejando la oportunidad diciendo
"residencial" y el expediente con TER173 en su número.

**REGLA — cambiar la ficha toca los INPUTS, no solo la etiqueta.** `PATCH /:id/ficha`
deja coherentes `sector`, `hibridacion` e `isReforma`: si solo escribiera la columna, el
primer reguardado desde la calculadora la devolvería a lo que dijeran los inputs. El
**ID de la oportunidad NO se renombra** (hay documentos y carpetas que lo citan); el
número del EXPEDIENTE ya nace con la ficha correcta.

**REGLA — el expediente HEREDA lo que se simuló.** `expedienteService` copia el alcance
de calefacción, la piscina (con su D_CAP y su SCOP_pwh) y el modo de D_ACS. Sin eso, el
expediente recalcularía un ahorro distinto del que se le presupuestó al cliente — está
vigilado de punta a punta en `test_ter173.mjs` (apartado 10).

⚠️ **La D_ACS de la calculadora era un 2.731,4 CABLEADO** —la fórmula del CTE para 4
habitaciones— que ignoraba el CEE cargado. En el TERCIARIO se resuelve ahora con el
MISMO módulo que el expediente ([demandaAcs.js](implementation/frontend/src/features/expedientes/logic/demandaAcs.js)):
`xml` (del certificado), `cte` o `manual`. En un hotel de 1.000 m² con 20 kWh/m²·año son
**20.000 kWh/año** frente a esos 2.731,4. **El residencial conserva el valor de siempre**:
cambiarlo movería el ahorro de toda propuesta nueva y no se ha pedido — pero es la misma
inconsistencia y algún día habrá que mirarla.

### Pruebas

```bash
node implementation/backend/scripts/test_ter173.mjs             # fórmula · C_b · alcance · impreso · propuesta→expediente
node implementation/backend/scripts/test_impresos_oficiales.mjs # las 5 fichas + Anexo I
node implementation/backend/scripts/check_cifo_paginas.mjs      # las hojas del CIFO no desbordan
```

⚠️ La hoja del CÁLCULO del CIFO es la más cargada del documento en TER173 (tabla de
piscina + variables con su fila de C_b + leyenda entera + el desglose de seis
columnas). El párrafo que explicaba el C_b ahí la desbordaba **23 px**; por eso vive
en el apartado 8. Holgura actual: **+46 px** en el peor caso medido.

---

## Precio CAE al cliente — 100 €/MWh, y solo hacia adelante (2026-09-09)

Hay **DOS cifras y no son lo mismo**; confundirlas cambia el bono de expedientes ya
firmados. Las dos viven en
[calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js):

- **`CAE_PRECIO_CLIENTE_NUEVAS` = 100 €/MWh** — lo que se estampa en una propuesta que
  se hace HOY. Va solo donde se COMPONEN inputs nuevos: la calculadora, el funnel y la
  comparativa de CEE.
- **`CAE_PRECIO_CLIENTE_ANTERIOR` = { estandar: 95, res080: 60 }** — el respaldo de
  LECTURA de lo ya guardado sin precio propio. Es el valor con el que se calcularon en
  su día, y por eso **no puede subir a 100**: un expediente antiguo no cambia de bono
  porque hoy cambie la tarifa. Va donde se LEE un expediente (panel económico, su
  gemelo de Node, el editor de Economía).

El precio al SUJETO OBLIGADO sigue siendo propio de cada ficha (160 €/MWh en las de
sustitución/hibridación, 140 en RES080): ahí no hay política única. El **TERCIARIO**
arranca ya en el precio nuevo: TER100 y TER173 no tienen ni un expediente anterior
cuya economía haya que preservar.

### El precio se SELLA en la oportunidad — [precioCae.js](implementation/backend/utils/precioCae.js)

La calculadora guarda el precio en `inputs.caePriceClient`, pero la economía del
EXPEDIENTE lee `inputs.cae_client_rate`: dos nombres para el mismo dato, y por eso el
precio tecleado **nunca llegaba al expediente**. Medido el 09/09/2026: **66
expedientes** tienen un precio tecleado (de 88 a 150 €/MWh) que su panel ignora, y en
48 de ellos eso hace que el panel diga que le debemos al cliente **menos** de lo que
su propuesta firmada le prometía. Sin arreglarlo, un expediente nuevo a 100 €/MWh
también saldría calculado a 95.

**REGLA — el sello se escribe en las oportunidades NUEVAS y, una vez escrito, se
mantiene al día. Las ANTERIORES no se marcan nunca.** Su economía se calculó con el
respaldo, hay obra en marcha sobre esas cifras y no pueden moverse. Por eso la
condición es *"no existía"* o *"ya lo trae"*, jamás *"existe"* — y un reguardado de una
oportunidad anterior **retira** el sello aunque el navegador lo mande.

**REGLA — no hace falta ninguna marca de fecha.** La PRESENCIA de la clave ES la marca,
y además es la que el expediente ya leía. Una fecha de corte habría que explicarla cada
vez que alguien lea el código, y se rompe al migrar datos.

**REGLA — se mantiene al día, no solo al crear.** Sellar únicamente en el alta dejaría
el sello viejo al cambiar el precio, y el expediente calcularía con una tarifa que ya
nadie ve en la calculadora: peor que el fallo que arregla.

⚠️ Los 66 expedientes anteriores **siguen calculando con el respaldo**, no con su
precio tecleado. Es una decisión tomada (2026-09-09), no un descuido: corregirlos
movería el bono de 66 expedientes en marcha, 27 de ellos RES080 que pasarían de 60 a
95-150 €/MWh (con el S.O. en 140, alguno daría margen negativo). Si algún día se
quiere, es sembrarles el sello con su `caePriceClient`.

```bash
node implementation/backend/scripts/test_precio_cae_sello.mjs
```

---

## Carpetas de Drive por estado (2026-07-24)

La carpeta de Drive de cada expediente **refleja su estado**. La decisión está centralizada en
[driveFolders.js](implementation/backend/services/driveFolders.js) (mapas + funciones puras) y el
movimiento en [expedienteFolderSync.js](implementation/backend/services/expedienteFolderSync.js).
Nunca volver a poner un `FOLDER_MAP` suelto en una ruta.

| Situación | Carpeta |
|---|---|
| Oportunidad no enviada (`PTE ENVIAR`, `EN CURSO`, `LEAD`) | 01. OPORTUNIDADES |
| Oportunidad `ENVIADA` | 02. SIMULACION ENVIADA |
| Expediente creado, `PTE. CEE INICIAL` **sin certificador** | 03. ACEPTADO |
| Certificador asignado, o cualquier estado anterior a `DOC. COMPLETA` (incluidos `PENDIENTE REVISAR EXPTE` y `REQUERIMIENTO BROKERGY`) | 04. EN CURSO |
| `DOC. COMPLETA` | 05. DOC. COMPLETA |
| `DOC. COMPLETA APPSHEET` (migrados) | 13. DOC. COMPLETA APPSHEET |
| Lote `BORRADOR` / `SOLICITADO PRESUPUESTO` | 06. REVISADO LISTO PARA VERIFICAR |
| Lote `ENVIADO A VERIFICADOR` / `PTE. SUBIDA MITECO` | 07. ENVIADOS A VERIFICAR |
| Lote con `REQUERIMIENTO VERIFICADOR` / `G.A.` | 10. REQUERIMIENTO |
| Lote `CAE EMITIDO – PTE PAGO BROKERGY` → 08 · `PTE. PAGO BROKERGY A CLIENTE` → 09 · `FINALIZADO` → 11 | 08 / 09 / 11 |
| Oportunidad `RECHAZADA` | 12. RECHAZADOS |

**Reglas que no se rompen:**
- **El estado nunca hace retroceder la carpeta por asignar certificador**: si el expediente ya está
  en `DOC. COMPLETA` (típico de un migrado) y se le asigna un certificador, sigue en 05/13.
- **Un expediente LOTEADO no se mueve solo**: su carpeta vive DENTRO de la del lote y manda el
  **estado del LOTE**, que mueve la carpeta del lote entera con todo dentro. Al sacarlo del lote
  (quitarlo o borrar el lote) vuelve a la carpeta de su estado.
- El sincronizador se llama en `setImmediate` y **nunca** bloquea la respuesta; `moveFolder` no
  escribe si la carpeta ya está en el destino (idempotente).
- Recolocación masiva: `node scripts/recolocar_carpetas_drive.js` (dry-run) / `--execute`.

---

## Facturación del certificador — conciliación mensual (2026-08-03)

Pestaña **FACTURACIÓN** dentro del modal "Seguimiento de certificados" (`CertificadorFacturacionPanel.jsx`).
**Solo ADMIN**: aquí se ven importes. El backend lo repite — todas las rutas son `adminOnly`.

### El modelo: el certificador no factura expedientes, factura HITOS DE REGISTRO

| Concepto | Cuándo se devenga | Importe |
|---|---|---|
| `honorario` | Mes del **PRIMER** registro del expediente, **una sola vez** (se registre uno o los dos CEE) | 60 € |
| `tasa_inicial` | Mes del **primer** registro (ver pacto de adelanto) | 16,39 € |
| `tasa_final` | Mes del **primer** registro (ver pacto de adelanto) | 16,39 € |

**PACTO DE ADELANTO (`adelanta_tasas`, por defecto SÍ)**: el certificador pone de su bolsillo las DOS
tasas y las factura enteras en el **primer pago**, sin esperar a registrar el CEE final. Por eso un
expediente devenga honorario + las dos tasas en el mes de su primer registro, y una línea de
"2 tasas" con solo el CEE inicial registrado **es correcta, no un error**. Se puede desactivar por
certificador si con alguno se acuerda pagar cada tasa contra su registro.

Las tasas son **suplidos**: no llevan IVA (art. 78.Tres.3º Ley 37/1992) y quedan fuera de la base
imponible. Los honorarios llevan IVA 21 % y retención de IRPF 15 %. Tarifas configurables por
certificador en `app_settings` clave `tarifas_certificador:{id}`.

La fecha que manda es la del justificante (`documentacion.fecha_registro_cee_*`), con respaldo en
`seguimiento.cee_*_ts.REGISTRADO`.

### Sello de facturado
`expedientes.documentacion.fact_cert` = `{ honorario: {factura, fecha, importe, esperado, …}, tasa_inicial: {…}, tasa_final: {…} }`.

**REGLA**: se escribe con la RPC **`merge_expediente_doc_json`** (MERGE `||`, no reemplazo). Los tres
conceptos se sellan en momentos distintos —el honorario en julio, la tasa del CEE final en
septiembre—: un reemplazo borraría lo sellado antes. Script: `scripts/facturacion_certificador.sql`.

### Las dos vistas del panel
- **Mensual = SOLO CONSULTA.** Dice lo que el certificador *debería* facturarte de ese mes
  (devengado / ya facturado / pendiente) y el arrastre. No premarca nada: anunciar "cuadra" sin haber
  comparado con ninguna factura era información falsa. Un enlace activa el **modo manual** (casillas +
  sellado) para cuando la factura llegue en un formato que el parser no sepa leer — pasa: una misma
  certificadora ha usado dos plantillas distintas.
- **Factura importada = donde se concilia.** Manda la factura y no el calendario, porque el
  certificador mete en una misma factura registros de varios meses.

### Importar la factura (vía rápida)
El PDF se lee **en el navegador** con pdf.js (ya en el bundle) — no se sube a ningún sitio. Solo
viajan las líneas parseadas a `POST /:id/facturacion-certificador/conciliar`, que devuelve el
expediente propuesto por línea. Parser: `features/admin/logic/facturaCertificadorParser.js`.

**Cada certificador usa SU plantilla y no se parecen en nada.** Las dos conocidas:

```
Lanuza   "CEE inicial y CEE final registrados. C/ Dalí 4, 13150 Carrión…  1  60,00 €  60,00 €"
Moncayo  "- (26RES060_160) VIVIENDA UNIFAMILIAR EN QUINTANAR DE LA ORDEN…  1  60,00 €"
```

**REGLA — parsear por la COLA de la línea, no por columnas.** Lo único común es `<cantidad>` seguida de
uno o dos importes; el resto de la línea es la descripción. Con UN importe, ése es el total de la línea
(Moncayo escribe `2 32,78 €`, las dos tasas ya sumadas); con DOS, el primero es el unitario y el
segundo el total (Lanuza escribe `2 16,39 € 32,78 €`). La cola puede venir pegada a la descripción o
sola en su línea (los suplidos de Lanuza ocupan dos líneas de texto y la cola una tercera).

**REGLA — se trabaja sobre LÍNEAS VISUALES, nunca sobre los fragmentos sueltos de pdf.js.** pdf.js
trocea por donde le conviene (`"FACTURA Nº AP0"·"3"·"0"·"7"·"20"·"2"·"6"`, `"3"·"0"·"/06/2026"`) y esos
dígitos sueltos, leídos como celdas, se cuelan en la columna de "unidades" y crean conceptos fantasma.

**REGLA — si la línea cita el nº de expediente, manda ése.** `(26RES060_160)` es un dato; la dirección
es una conjetura. Si el nº citado no está entre los expedientes con registros del certificador, se
distingue entre "no es suyo" y "es suyo pero aún no tiene ningún CEE registrado" (el caso frecuente:
entrega, factura, y el CEE sigue pendiente de tu revisión).

**REGLA — el emparejamiento por dirección exige el número de portal**. Sin esa comprobación, "Virgen de
Criptana 7" casaba al 80 % con el expediente de "Virgen de Criptana 82". Solo se premarca lo de
confianza ALTA y **sin avisos**; lo demás lo confirma una persona.

El parser también lee los **totales que la factura declara** en su pie (`TOTAL SUPLIDOS 147,51 €`) y
avisa si el desglose no los suma: la factura AP03072026 lista dos veces el suplido de Los Carrascales
pero su total solo lo cuenta una vez.

**REGLA — verificar que la factura es DEL certificador cuya ficha está abierta.** Trabajamos con varios
certificadores (Lanuza, Moncayo…) y el panel es por ficha: subir la de uno en la ficha de otro
emparejaría contra los expedientes equivocados. Se coteja por NIF (`parseada.nifs` → `verificarEmisor`),
que todas las plantillas imprimen. Si es de otro, se enseña de quién es y **se bloquea el sellado**.
La búsqueda del emisor se limita a `tipo_empresa = 'CERTIFICADOR'`: el NIF de Brokergy también sale en
la factura (es quien la recibe) y está en `prescriptores`.

### En la MISMA factura vienen los dos negocios (2026-09-01)

El certificador no separa el CAE de los **CEE directos**: los mete mezclados en el mismo papel
(medido en la factura AP02082026MOD de agosto — 13 expedientes CAE y `2026CEE_54`) y con la misma
tarifa, porque a él le cuesta la misma visita y la misma tasa levantar uno que otro. Por eso
`cargarConceptos` lee las **DOS tablas** (`TABLAS`) y `RE_NUM_EXPEDIENTE` reconoce también el
formato `{AAAA}CEE_{n}`.

**REGLA — el sello va a la tabla de la que sea la fila.** `sellar` enruta a
`merge_expediente_doc_json` o a `merge_cee_directo_doc_json` según el `origen`, y `desellar` busca
en las dos: quien pulsa "quitar el sello" solo ve un número. El campo es el mismo (`fact_cert`);
lo único que cambia es dónde se guarda.

**REGLA — un CEE directo de alcance ÚNICO devenga UNA sola tasa.** Ahí no hay CEE final que
registrar, así que el pacto de adelanto no aplica: adelantar su tasa sería premarcar el cobro de un
registro que nunca va a existir. En el CAE siempre son dos.

**REGLA — el `origen` viaja hasta el enlace.** Un CEE directo se abre con `?cee=` y un expediente
con `?exp=`; son dos tablas y el mismo UUID no vale en las dos, así que un enlace equivocado no
lleva a otro expediente: no lleva a ninguno.

**REGLA — "consta REGISTRADO pero sin fecha" no es "no lo tiene".** Son dos avisos distintos porque
son dos trabajos distintos: en el primero falta el DATO (se pone la fecha del justificante y la
línea se concilia sola); en el segundo falta REVISAR el CEE. Decirlo con la misma frase convertía
una tarea de dos segundos en un "revísalo" sin pista.

**REGLA — los avisos se agrupan por texto.** Un expediente aparece DOS veces en la factura (su
honorario y sus tasas) y su aviso llegaba repetido: cuatro asuntos se leían como ocho y llenaban
justo la caja que hay que mirar antes de pagar.

⚠️ **La tasa de registro depende de la CCAA, y la tarifa de la app es una sola por certificador.**
Castilla-La Mancha son 16,39 € y la Comunidad Valenciana 10,19 € (medido: `2026CEE_54`, en
Cofrentes, factura 20,38 € por sus dos tasas frente a los 32,78 € del resto). La línea sale marcada
como **desviación de importe**, que es el comportamiento correcto —lo confirma una persona—, pero no
es un fallo del parser ni de la factura.

**Del PDF se leen también el sufijo del número y la fecha en letra.** `AP02082026MOD` es la factura
MODIFICADA de `AP02082026`: truncar el sufijo dejaría a las dos con el mismo sello e
indistinguibles en el histórico de lo pagado. Y la única fecha de la plantilla de Moncayo va al pie
y con todas las letras ("Bellver de Cerdanya, a 31 de Agosto de 2026"); sin ella no se puede sellar
y había que teclearla teniéndola delante.

Prueba del ciclo entero (devengo · conciliación · sellado · desellado) con un Supabase simulado,
sin tocar producción:

```bash
node implementation/backend/scripts/test_facturacion_certificador.js
```

### Aviso de CEE entregados y sin revisar
`services/revisionPendienteNotifier.js`, arrancado desde `server.js` (`setInterval`, mismo patrón que
`marketplaceStatsRefresher`). El certificador **factura al entregar, no al revisar**: un CEE que se
queda en `PRESENTADO`/`PTE_REVISION` se acaba pagando sin validar. Resumen **diario** por WhatsApp
(`WHATSAPP_ADMIN_CHAT`) + email (`ADMIN_EMAIL`) de lo parado más de `REVISION_ALERTA_DIAS` (2).
Comprueba cada 6 h, envía solo entre `REVISION_ALERTA_HORA_MIN` y `_MAX` (8-21 h Madrid) y **una vez
por día natural**, con el guard persistido en `app_settings.revision_pendiente_last_notify` para que un
reinicio no duplique el aviso. Un CEE entregado **sin** fecha se incluye marcado "sin fecha": es más
sospechoso, no menos. Rutas: `GET /api/expedientes/alertas/revision-pendiente` (staff) y
`POST .../enviar` (admin).

⚠️ En LOCAL el primer chequeo salta a los 90 s del arranque y **manda avisos de verdad**. Para
desarrollar: `REVISION_ALERTA_ENABLED=false` en el `.env`.

---

## Parte diario de seguimiento — que no se pierda ningún expediente (2026-08-10)

UN solo aviso al día (WhatsApp `WHATSAPP_ADMIN_CHAT` + email `ADMIN_EMAIL`) con TODO
lo atascado, y en cada línea el enlace que lo desbloquea. Sustituye al aviso suelto de
"CEE pendientes de revisión", que ahora es uno de sus bloques.

**Un aviso, no siete.** Los vigilantes separados compiten entre sí y acaban ignorados
todos. El parte es una lista de trabajo. Si añades un caso nuevo, va como bloque
del parte — no como un `setInterval` propio.

### El PLAZO decide si se RECLAMA, nunca si se VE (2026-09-07)

Eran el mismo número, y por eso no se podía uno fiar de la pestaña: lo movido
recientemente no existía en ninguna parte. Medido el 07/09/2026 — **5** expedientes con
el visto bueno dado y sin registrar, y la pantalla enseñaba **2** (se callaba
26RES060_119, cuyo CEE final se había mandado a registrar el día antes). El plazo de 2
días era razonable para no darle la lata al certificador; era absurdo para esconderle a
Brokergy en qué punto está su propia cartera.

`escanear()` emite ahora **todas** las filas y marca cada una `vencida` (plazo cumplido,
o **sin fecha** — no saber desde cuándo espera algo es peor, no mejor). Quien reclama
filtra por esa marca y nadie recibe un mensaje antes de tiempo:

| Superficie | Qué lleva |
|---|---|
| `agruparPorDestinatario` (DESPACHAR y los envíos en bloque) | solo `vencida` |
| Parte diario de WhatsApp / email (`seguimientoDiario`) | solo `vencida` |
| Pestaña **REVISAR** | TODO — lo parado primero, lo que va en plazo detrás y atenuado |

**REGLA — parado y en plazo se cuentan APARTE.** La ruta devuelve `parados` y `en_plazo`
además de `total`, y cada bloque su `vencidas`. El titular y el badge cuentan lo PARADO,
que es lo que duele; mezclarlos convertiría la lista de tareas en un inventario.

### Los once bloques — [seguimientoRadar.js](implementation/backend/services/seguimientoRadar.js)

Cada detector responde a lo mismo: *¿de quién es la pelota y desde cuándo?* Los plazos y
la reinsistencia viven en el mapa `BLOQUES` (todos con variable de entorno).

| Bloque | Criterio | Pelota | Botón |
|---|---|---|---|
| `RECHAZO_SIN_REENVIAR` | `rechazoBorrador().obsoleto` >2 d | BROKERGY | — (corregir y regenerar) |
| `REVISION` | `cee_* ∈ PRESENTADO/PTE_REVISION` (plazo 0) | BROKERGY | — |
| `OBRA_SIN_CERRAR` | obra ejecutada + `cee_final` sin encargar >5 d | BROKERGY | — |
| `TRAMITACION` | `PTE FIN EXPTE`/`REVISADO Y LISTO (FINAL)` con documentos **sin generar ni enviar** >10 d | BROKERGY | — |
| `SIN_LOTEAR` | `loteService.ESTADOS_COMPLETO` sin `lote_id` >15 d | BROKERGY | — (meterlo en un lote) |
| `REGISTRO` | `cee_* = REVISADO` >2 d | CERTIFICADOR | Recordar el registro |
| `CERT_SIN_ENTREGAR` | `ASIGNADO/EN_TRABAJO/PTE_PRESENTACION` >10 d | CERTIFICADOR | Pedir fecha |
| `SIN_ENCARGAR` | encargo sin salir, **con técnico o sin él** (plazo 0) | BROKERGY | — |
| `MIGRADO_SIN_REVISAR` | `PENDIENTE REVISAR EXPTE` >15 d | BROKERGY | — |
| `FIRMA_PENDIENTE` | `_sent_at` sin `_signed_link` >7 d | CLIENTE/INSTALADOR | Recordar la firma |
| `FIN_OBRA` | CEE ini. registrado, sin señales de obra >30 d | CLIENTE/INSTALADOR | ¿Cómo va la obra? |

**REGLA — `TRAMITACION` cubre lo que NO SE HA PEDIDO; `FIRMA_PENDIENTE`, lo pedido que no
vuelve.** El reparto es por `_sent_at`, y no es un matiz: aquél exige que el documento
haya salido, así que **un CIFO que nunca se generó no lo reclamaba nadie** (11 de 19
expedientes en `PTE FIN EXPTE` estaban así). Con los dos, ningún documento se cae entre
las dos sillas y ningún expediente sale por partida doble diciendo lo mismo. El RITE
entra solo **mientras bloquee** —o sea, mientras el CIFO no esté firmado—: lo aporta el
instalador y con el CIFO ya firmado no desbloquea nada.

**REGLA — `SIN_LOTEAR` es el único bloque que habla de DINERO, no de un documento.** El
CAE no se emite ni se cobra hasta que el expediente entra en un lote, y ese tramo estaba
**entero fuera del parte**: 28 expedientes el 07/09/2026, el más viejo de hacía dos
meses. Su fecha es el último hito documental (registro del CEE final, o el inicial de
respaldo), nunca `updated_at`, que se mueve al abrir y guardar la ficha y rejuvenecería
justo al que más lleva esperando.

**REGLA — quién puede lotearse lo decide `loteService.ESTADOS_COMPLETO`, y se IMPORTA.**
Solo `DOC. COMPLETA`. La primera versión copió la lista aquí y añadió
`DOC. COMPLETA APPSHEET`: 24 líneas mandándote a hacer algo que `evaluarElegibilidadBase`
rechaza con un 400. Un parte que propone acciones imposibles se deja de mirar entero.
⚠️ Los migrados de AppSheet quedan hoy **sin ningún bloque** —tampoco entran en
`TRAMITACION`, donde listarles lo que "falta" serían 18 alarmas falsas: su documentación
vive en el Drive antiguo—. Harán falta uno propio en cuanto se decida qué hay que
hacerles para llevarlos a `DOC. COMPLETA`.

**El buscador vale para las DOS vistas.** En REVISAR no hay 28 tarjetas sino ~150 filas
en once bloques plegados, así que sin él responder "¿y el 26RES060_119?" obliga a
abrirlos todos. Filtra las FILAS (nº de expediente, cliente, municipio, certificador o
instalador), descarta el bloque que se queda sin ninguna —una cabecera vacía haría creer
que el expediente está dentro— y **abre los bloques solos** mientras haya filtro.

**REGLA — tener TÉCNICO no es haberle ENCARGADO.** `detectarSinEncargar` salía por
`if (e.certificador_id) return` dando por hecho que con técnico puesto ya lo cubría otro
bloque, y no: `CERT_SIN_ENTREGAR` arranca en `ASIGNADO`, o sea cuando el encargo YA
SALIÓ. Un expediente con técnico elegido y el encargo sin mandar no lo miraba nadie
(26RES093_1 y 26RES060_128, parados 146 y 131 días). Es el peor sitio donde esconderse,
porque en la ficha parece que está en marcha.

**REGLA — "sin fin de obra" NO es un solo caso.** Si hay factura, CIFO o RITE, la obra
está HECHA y lo que falta es encargar el CEE final (`OBRA_SIN_CERRAR`, pelota nuestra).
Preguntarle "¿cómo va la obra?" a quien ya facturó es quedar mal con quien cumplió y
además esconde el atasco verdadero. Medido: 9 de 25 estaban así.

**REGLA — un MIGRADO no necesita encargo de CEE**: el suyo se hizo en el sistema
antiguo. Lo que le falta es que alguien lo audite (`MIGRADO_SIN_REVISAR`). Sin esta
salida, 15 migrados pedían un CEE que ya existe.

**REGLA — las firmas se agrupan por FIRMANTE, no por documento.** Al cliente le faltan
a la vez el Anexo I y la Cesión y los firma de una sentada en el mismo enlace: una fila
por documento son dos recordatorios el mismo día diciéndole cada uno que le falta "un"
documento.

**REGLA — UNA consulta para los ocho detectores, con campos CONCRETOS del JSONB.**
Nunca `cee` ni `documentacion` enteros (regla 22): `cee.xml_inicial` son megas.

### Los enlaces de acción — [accionToken.js](implementation/backend/utils/accionToken.js) + [routes/acciones.js](implementation/backend/routes/acciones.js)

Firma HMAC stateless, como `approveCeeSignature`, pero **con caducidad** (14 días, y la
fecha va DENTRO de lo firmado). Aquel solo se aprueba algo a uno mismo; estos disparan
un mensaje a un tercero que no se puede retirar, así que un parte viejo reenviado no
puede seguir siendo un gatillo vivo.

**El enlace abre una PÁGINA con el mensaje editable; no envía de un clic.** Autoriza a
preparar el envío, no a ejecutarlo a ciegas.

**La página se usa DE PIE Y CON EL MÓVIL**, entrando desde un WhatsApp. Las decisiones
de diseño no son cosméticas y no conviene deshacerlas:
- Un destinatario **no marcado ocupa una línea** (48 px), no media pantalla. Con el
  cliente y el instalador desplegados a la vez había que hacer scroll para descubrir
  que existía el segundo. Con esto la pantalla completa cabe en un móvil.
- El mensaje viene **plegado** con las primeras líneas y un degradado; se despliega o
  se edita a demanda. Casi nunca se edita: enseñarlo entero solo alejaba el botón.
- El botón va **pegado abajo (sticky)** y dice a quién y por dónde va ("Enviar a
  Instalador y Cliente por WhatsApp y email"). Es la única acción irreversible.
- El teléfono y el email se leen **en la propia píldora del canal**: comprobar a qué
  número va el mensaje es justo lo que se hace antes de pulsar.

### El parte DENTRO de la app — pestaña "Seguimiento"

`features/seguimiento/views/SeguimientoView.jsx` + `components/EnvioLoteModal.jsx`,
sobre [routes/seguimiento.js](implementation/backend/routes/seguimiento.js)
(`staffOnly`). Es el gemelo INTERNO de `/api/acciones`: comparten servicios, no rutas.

**NO va dentro del cuadro de mando**, aunque fuera lo primero que se pensó:
- El cuadro de mando responde *"cómo va el negocio"* (GWh, margen, embudo); esto
  responde *"qué hago yo ahora"*. Dos modos mentales y dos frecuencias.
- El cuadro de mando es **ADMIN-only** porque agrega importes. El parte no lleva ni un
  euro, así que lo ve también el **TRABAJADOR** — que es quien más lo necesita.
- El cuadro de mando ya carga expedientes + oportunidades + partners + lotes.

Tiene **dos lecturas** de los mismos datos, y el orden importa: **DESPACHAR** (por
destinatario, por defecto — se entra a trabajar) y **REVISAR** (por bloque, el
diagnóstico).

### Envío en BLOQUE — [seguimientoLote.js](implementation/backend/services/seguimientoLote.js)

`radar.agruparPorDestinatario()` junta lo accionable por **(tipo de acción + persona)**.
Un certificador con 7 CEE sin registrar recibe **UN** mensaje con la lista. Medido:
39 expedientes accionables → 25 mensajes.

**REGLA — la clave de grupo NO lleva el `scope`.** Al mismo certificador se le reclama
de una vez el CEE inicial de una obra y el final de otra: es la misma petición y cada
línea del mensaje lleva su propio enlace. Sí separa por TIPO (registro ≠ emisión).
Como consecuencia, `enviarLote` sella la fase y la clave del recordatorio **por FILA**,
nunca por grupo: con un grupo mezclado, sellar todo con una sola fase deja la mitad
marcada donde no toca.

**REGLA — el envío en bloque NO puede delegar en `notify-certificador`**: esa ruta manda
un mensaje por llamada, así que N llamadas serían N mensajes — justo lo que se evita.
Aquí el mensaje sale UNA vez y luego se sella expediente por expediente (historial +
`markCertContact` + `recordatorios`). Los textos siguen siendo fuente única en
`recordatorios.js`.

**"Ahora no · posponer N días"** (`RADAR_POSPONER_DIAS`, 15) sella el recordatorio con
`pospuesto: true` sin enviar nada. Silencia su propia ventana, más larga que la de
reinsistencia, y el parte lo dice con otras palabras: no es lo mismo haber reclamado
que haber decidido no reclamar todavía. Sin esta salida, la línea que sabes que no toca
reclamar vuelve mañana y todos los días, hasta que dejas de mirar el parte entero.

**REGLA — al CERTIFICADOR se le escribe como a un compañero, no como a un cliente.** Es
un profesional con el que se habla cada semana, que tiene tu número y sabe quién le
escribe. Sus cuatro plantillas (`certRegistro*` / `certEmision*`) se separan del resto en
tres cosas, y ninguna es cosmética:
- **Saludo por su nombre y con coma** — "Hola Luis Alberto," y no
  "¡Hola *LUIS ALBERTO LANUZA PELAYO*!". ⚠️ El nombre sale de `saludoPartner`, que mira
  `prescriptores.nombre_responsable`: **el `select` de `resolverContacto` tiene que
  pedirlo**, o cae al respaldo y saluda con la razón social tal cual está en la BD, en
  mayúsculas. Y en `prepararLote` manda `contacto.nombre` (la PERSONA), nunca
  `grupo.destinatario.nombre` (la EMPRESA, que es lo que trae el radar).
- **Se dice POR QUÉ**, no solo qué: "hasta que no estén registrados no puedo avanzar con
  esos expedientes". Un aviso de estado ("sigue pendiente de registrar") no mueve a nadie
  a sacar un hueco; se pide en tono de favor porque no es un incumplimiento.
- **Primera persona y SIN firma corporativa.** El membrete al pie de un "cuando tengas un
  hueco" convierte el favor en una notificación del sistema. Los mensajes al CLIENTE sí la
  llevan: ahí el número puede no estar agendado.

**REGLA — el plazo frena al AUTOMÁTICO, no a ti.** El popup de envío lista además los
expedientes del MISMO destinatario y la MISMA petición que aún están en plazo
(`grupo.opcionales`), **desmarcados** y bajo el rótulo "Aún en plazo · márcalo para
incluirlo". Al certificador al que hoy le reclamas dos registros puede quedarle un
tercero de ayer, y mandarle los tres juntos es UN mensaje en vez de dos. Nunca crean
grupo por su cuenta —si no hay nada que reclamarle a alguien, no aparece su tarjeta— y
por defecto no van, así que el parte diario de WhatsApp no cambia. `prepararLote` y
`enviarLote` buscan los ids marcados en las DOS listas.

**REGLA — la antigüedad se OMITE cuando es de hoy.** "0 días" no dice nada, y avisar a
alguien de algo que le pediste esta mañana resta urgencia al resto de la lista.

**REGLA — el `detalle` del radar está escrito para TI, no para quien lo recibe.** En el
mensaje al certificador se sustituye por la FASE ("CEE final"): "visto bueno dado, falta
registrar" repite el párrafo de arriba palabra por palabra, y "encargado, sin arrancar"
es un juicio interno que suena a reproche.

**REGLA — el envío NO se implementa en `acciones.js`**: se delega en `notify-certificador`
y `solicitar-faltantes` llamándolas con `x-internal-key` (igual que el MCP), para que el
texto, el sellado del seguimiento y el historial sean los mismos que si hubieras escrito
desde el expediente. Los TEXTOS son fuente única en
[recordatorios.js](implementation/backend/services/recordatorios.js), del que tira
también `notify-certificador`.

**REGLA — `/parte/global` se declara ANTES que `/:tipo/:expId`** o Express lo toma por
un tipo de acción (mismo gotcha que `/fin-obra` en las subidas públicas).

**Anti-insistencia**: al enviar se sella `documentacion.recordatorios` con la RPC de
MERGE `merge_expediente_doc_json`. Mientras esté dentro de la ventana de reinsistencia
del bloque, el parte muestra "avisado hace N días" en vez del botón. Sin esto, el mismo
cliente recibe el mismo mensaje cada mañana. Para el certificador cuenta además
`cee_*_last_contacto_at`, así que escribirle desde la app también silencia el botón.

**WhatsApp y email NO llevan lo mismo**: el WhatsApp lleva el titular por bloque y solo
las 8 primeras acciones (`PARTE_WA_MAX_ACCIONES`); el email lleva el parte entero. Por
eso los tokens se truncan a 32 hex y la caducidad va en minutos epoch: con la URL larga
el mensaje pasaba de 4.000 caracteres y el móvil lo pliega tras un "Leer más".

⚠️ En LOCAL el primer chequeo salta a los 90 s del arranque y **manda avisos de verdad**:
`REVISION_ALERTA_ENABLED=false` en el `.env`.

---

## Nueva simulación con CEE inicial y final (2026-08-10)

La puerta previa a "Nueva simulación" (solo ADMIN) ya no pregunta un sí/no: pregunta **qué
certificados hay** — *ninguno* · *solo el anterior* · *los dos, la obra ya está hecha* — y admite
cargarlos a la vez, cada uno en su zona de suelta.
[CeePrevioGate.jsx](implementation/frontend/src/features/cee/CeePrevioGate.jsx) solo orquesta: la
extracción es [ceeExtract.js](implementation/frontend/src/features/cee/ceeExtract.js) (`.xml`/`.cex`
exacto, PDF/fotos por OCR), compartida con `CeeUploadModal`.

### REGLA — con CEE FINAL manda la demanda del FINAL

La demanda de calefacción es una propiedad de la **envolvente**, no del generador. Si existe
certificado posterior a la obra, la demanda que la bomba de calor cubre de verdad es la suya, así que
el ahorro se calcula con ella **aunque también tengamos el inicial**. Fuente única:
`demandaDeCalculo()` en [ceeAvisos.js](implementation/frontend/src/features/cee/ceeAvisos.js), aplicada
en `seedInputsFromCees` (ceeSeed.js), en las dos ramas de `CalculatorView.handleCalculate`
(`demandMode` `manual` y `real`) y en `ceeComparison`. No volver a decidirlo en una vista.

De ahí salen los dos avisos cruzados:
- **demanda inicial > final** → la envolvente mejoró: **eso es un RES080**, y para tramitarlo hacen
  falta FOTOS del antes/después y FACTURAS. Sin el aviso se prometería por RES060 un ahorro que la
  ficha no cubre.
- **demanda final > inicial** → aviso a secas (los certificados suelen estar intercambiados o ser de
  otra vivienda). No bloquea; el cálculo sigue usando el final.
- También se cruzan referencia catastral, fechas (el final debe ser posterior) y superficies.

`cee_final` en los inputs es lo que marca el ahorro como **MEDIDO** (`cee_ahorro_origen`): la columna
FINAL de la tabla de emisiones se rellena con el certificado real en vez de estimarse `demanda/SCOP`,
el estimador "¿Aún no tienes el CEE FINAL?" **se oculta** (pulsarlo sustituiría datos medidos por una
hipótesis) y `ResultsPanel` lo dice en verde.

### El funnel da por contestado lo que dice el certificado

Con certificados aportados, `ReformaSubFlow` arranca en **`cee_resumen`**. Con los **dos** CEE el
recorrido queda en **3-4 pantallas** (antes 8-9):

```
ficha de la vivienda → cee_resumen → [elementos, solo si RES080] → docs_obra → identificacion
```

**Lo que el certificado contesta** (y por eso deja de preguntarse): estado de la obra (existe CEE
posterior ⇒ está ejecutada), fecha, "¿tienes certificados?", combustible anterior
(`servicios.calefaccion.combustible`), y **RES060 vs RES080** — `esReformaSegunCee()`: la demanda solo
baja si se tocó la ENVOLVENTE, cambiar el generador no la mueve (margen del 2 % para el ruido del
certificador).

**Lo que ningún CEE contesta** y se pide *en la misma pantalla*, no en cuatro seguidas: el **emisor**
(fija la temperatura de impulsión y con ella el SCOP), si la **aerotermia asume el ACS** (es una
decisión, no un dato) y la **antigüedad de la caldera**.

**REGLA — el η del CEE ELIGE la casilla de la tabla, no la sustituye.** El certificado trae el
rendimiento medido de la caldera antigua, pero el expediente no guarda η: guarda `rendimiento_id` (el
`boilerId` de `boilerMapping`) y vuelve a leer de la tabla. Pisar `boilerEff` con el del certificado
daría un ahorro que el CIFO no puede reproducir, y esa discrepancia es lo primero que mira un
verificador. Por eso `sugerirEdadDesdeRendimiento()` preselecciona la casilla cuya η queda más cerca
de la medida, y si la distancia supera 8 puntos se dice en pantalla.

Salida siempre disponible: **"Prefiero responder a mano"** cae en el funnel de siempre. Con un solo
certificado (sin final) no se puede decidir la ficha ni el estado de la obra: el resumen solo confirma
datos y el recorrido sigue por el camino largo — ahí el bloque de emisor/ACS **no** se muestra, para no
preguntarlo dos veces.

### Los ficheros ya NO se pierden

Antes el `pdfBase64` del CEE se descartaba en `doSubmitInternal` y había que volver a subirlo a mano.
Ahora los `File` originales viajan con el CEE (`_files`) y `subirDocsPendientes()` los sube en cuanto
existe carpeta de Drive: CEE inicial → `DOC_CEE_EXISTENTE`, CEE final → `DOC_CEE_POSTERIOR`,
presupuesto → `DOC_PRESUPUESTO`, facturas → `DOC_FACTURAS` ("5. FACTURAS"). Los tres slots nuevos se
declaran en `buildDocChecklist` — **el POST de subida valida contra ese checklist**, no contra
`getReformaSlots`, y subir a un slot que solo existe allí da "Tipo de documento no válido".
Va SECUENCIAL: el índice de un slot múltiple se calcula contando Drive y en paralelo dos subidas
calculan el mismo.

### Presupuesto y facturas leídos en la toma de datos

Pantalla **`docs_obra`** ([StepDocsObra.jsx](implementation/frontend/src/features/landing/steps/StepDocsObra.jsx)),
solo flujo interno: sustituye a "¿tienes un presupuesto orientativo?" por soltar el PDF.
`POST /api/factura-ocr/extract` ([routes/facturaOcr.js](implementation/backend/routes/facturaOcr.js))
es el gemelo **sin expediente** del OCR de facturas: mismo `facturaOcrService`, pero no guarda en Drive
(aún no hay carpeta) ni levanta incidencias (no hay expediente contra el que cruzar). `staffOnly`:
lleva importes.

**REGLA — facturas y presupuesto no se suman.** Si hay facturas, la inversión son ellas; el presupuesto
solo manda mientras no haya factura. Sumar los dos duplica la inversión del Anexo y el tope de
sobrefinanciación.

**REGLA — el documento tiene DOS importes y cada uno va a lo suyo (2026-08-27).** El OCR lee la
**base imponible**, y ésa sigue siendo la del expediente: `documentacion.facturas[].importe_sin_iva`
es la inversión que declara el Anexo, porque el CAE se justifica sobre la base y no sobre los
impuestos. Pero lo que se vuelca a la ECONOMÍA de la oportunidad —`funnel.presupuesto_eur` →
`inputs.presupuesto`, de donde salen el coste final de la propuesta y la base de la deducción del
IRPF— es el **total CON IVA**: el titular casi siempre es un PARTICULAR y no se lo deduce nadie, así
que su inversión real lo incluye. Con la base a secas, la propuesta le prometía un coste ~21 % más
barato del que iba a pagar. Fuente única de la derivación:
`importesDocumento()` en [routes/facturaOcr.js](implementation/backend/routes/facturaOcr.js), que
devuelve las dos cifras y el tipo aplicado, por el camino más fiable que traiga el papel: base+total
declarados > cuota declarada > tipo declarado > **tipo por defecto (21 %)**. Este último es una
suposición, no un dato, y por eso viaja marcado `iva_estimado` y la pantalla lo dice: el campo es
editable, y ahí se corrige también el caso de titular EMPRESA, que sí se deduce el IVA.

`funnel.presupuesto_modo = 'documento'` (nuevo, junto a `'tengo'`) hace que `funnelToInputs` use esa
cifra.

### Aunque sea una oportunidad, se prepara el expediente

Lo leído se guarda en `datos_calculo.docs_ocr` (**solo metadatos y enlaces** — regla 21) y
`expedienteService` lo vuelca al aceptar:
- `documentacion.facturas[]` ← `docs_ocr.documentos` casado con `reforma_uploads.DOC_FACTURAS`.
  El emparejamiento es **secuencial consumiendo `files_count`**: una misma factura puede haber entrado
  como varias fotos, así que no hay correspondencia 1:1 entre documentos leídos y ficheros subidos.
- `cee.cee_inicial` / `cee.cee_final` ← `xmlDemandData` / `xmlDemandDataFinal`, que la puerta rellena
  con `ceeToXmlShape()`; el módulo CEE los pinta igual que si se hubieran subido los `.xml`.
- nº de serie de la bomba de calor ← `docs_ocr.equipos`, **solo para rellenar huecos**: nunca pisa la
  marca/modelo del catálogo, que es el dato bueno.

---

## Ahorro RES080 — método SIMPLIFICADO, por vector energético (2026-08-10)

Segunda forma de calcular el ahorro de energía final, junto a la histórica. Se elige y se guarda;
**por defecto sigue siendo el detallado**, así que nada de lo ya existente cambia.

| Método | Se parte en | Función |
|---|---|---|
| **DETALLADO** (el de siempre) | 3 USOS: ACS · calefacción · refrigeración, cada uno con su combustible | `calculateRes080` / `calculateRes080FromEmissions` |
| **SIMPLIFICADO** (nuevo) | 2 VECTORES: consumo eléctrico · otros combustibles | `calculateRes080Simplificado` |

Misma física en los dos (`consumo = emisiones / factor_paso`; ahorro = ΣEi − ΣEf): solo cambia en
cuántas categorías se divide.

### El `.xml` del CEE trae la energía final YA CALCULADA — no hay que derivarla

El simplificado tiene **dos fuentes**, y `results.fuenteDatos` dice cuál se usó:

| `fuenteDatos` | De dónde | Cuándo |
|---|---|---|
| `energia_final_declarada` | **`<EnergiaFinalVectores>`** del `.xml`: kWh/m²·año por vector energético y, dentro de cada uno, por uso | Siempre que haya `.xml` de los dos CEE |
| `emisiones` | `<EmisionesCO2><ConsumoElectrico>/<ConsumoOtros>` ÷ factor de paso | Sin `.xml` (OCR de PDF/fotos) o a mano |

**La primera es la buena y es la que manda**: la ficha pide *energía final* y el certificado la
declara tal cual, así que no se estima ni se divide nada — se suman los vectores. Medido contra un
CEE real: `ElectricidadPeninsular.Global 36,91 × 0,331 = 12,22` y `GasoleoC.Global 26,91 × 0,311 =
8,37`, que son exactamente las dos filas de emisiones que imprime el PDF. Ese contraste se calcula
(`results.contraste`) y **se enseña en el certificado**: dos números independientes del mismo
documento que concuerdan es la mejor prueba de que la lectura es correcta.

**REGLA — leyendo la energía final NO hay restricción de un solo combustible.** Esa limitación es
de la vía por emisiones: allí «otros combustibles» es UNA cifra de CO₂ que hay que dividir por UN
factor de paso, y con dos combustibles la suma es indeshacible. Con `<EnergiaFinalVectores>` cada
vector viene por separado **y en kWh**, así que sumar gasóleo + gas natural es legítimo. Por eso el
aviso de mezcla y el selector de combustible se ocultan cuando `fuenteDatos === 'energia_final_declarada'`.

**Un vector con todo a cero no se consume**: el XML los lista los ocho siempre, así que el parser
guarda solo los que tienen consumo — y esa lista **es** el inventario de combustibles reales del
edificio. También es donde se ve el reparto que el resumen por servicio escondía: en el CEE medido,
la calefacción sale cubierta a la vez por electricidad (33,26) y gasóleo (5,58).

⚠️ Las etiquetas de `<EnergiaFinalVectores>` **no** coinciden con las de `<VectorEnergetico>`:
allí es `BiomasaPellet` (sin la -e) frente a `BiomasaPellete`. Sin las dos entradas en
`mapVectorEnergetico` el vector caía fuera de `FACTORES_PASO` y `getFactorPaso` devolvía **1**.
`Biocarburante` se deja sin mapear a propósito: no tiene factor en la tabla y no se le inventa uno
— su energía final sí se lee (no necesita factor) y el contraste de emisiones se marca no disponible.

**Por qué existe**: hay CEEs en los que un mismo servicio tiene DOS generadores de combustibles
distintos (visto: bomba de calor eléctrica 420 % + caldera de gasóleo 77,9 % para calefacción y
ACS) y el certificado **no dice qué porcentaje del consumo va por cada uno**. Por uso no se puede
repartir; por vector el certificado ya trae la separación hecha.

**REGLA — solo con UN combustible no eléctrico en todo el edificio.** Con dos (gasóleo + gas), la
fila «otros combustibles» los suma con factores de paso distintos y esa suma no se puede deshacer.
`combustiblesNoElectricos()` lo detecta y la UI **avisa, no bloquea**: el dato lo confirma una
persona. Canoniza contra `FACTORES_PASO` para que las MAYÚSCULAS de `normalizeData` no cuenten dos
veces el mismo combustible.

**REGLA — el combustible se busca en TODOS los generadores, no en el primero de cada servicio.**
`combustibleCalefaccion` se queda con el primer `<VectorEnergetico>` que encuentra, y el caso que
justifica este método es justamente el de un servicio con dos generadores: medido sobre un CEE
real, devolvía "Electricidad peninsular" y se perdía el gasóleo. `parseCeeXml` barre todos los
vectores de `<InstalacionesTermicas>` y deja `combustibleOtros` = el único no eléctrico, o **null
si hay varios** — null es la señal de que el método no aplica. Si el XML no lo resuelve pero sí
declara emisiones por otros combustibles, la fila «Otros combustibles» de la tabla queda editable
para elegirlo a mano (es el único campo editable en modo XML) y se avisa: sin combustible no hay
factor de paso y ese consumo contaría como cero.

**REGLA — en simplificado NO se estima la columna FINAL.** El estimador «¿Aún no tienes el CEE
FINAL?» parte de la demanda POR USO, y su resultado habría que repartirlo otra vez entre los dos
vectores: justo el reparto que aquí no se conoce. Se oculta y se explica por qué; el FINAL se lee
del CEE posterior o se teclea.

**REGLA — el certificado RES080 tiene que EXPLICAR el método.** El verificador espera tres filas y
ve dos: sin la nota no puede reproducir el cálculo. Y el texto **cambia según la fuente** — no se
le puede decir que un número está declarado si está derivado del CO₂. Con
`energia_final_declarada` el certificado añade además una **página con el desglose completo vector
× uso** de los dos CEE: es la que permite rehacer el total sumando y la que enseña el reparto que
el resumen por servicio escondía.

Las dos páginas son **fuente única**: `buildJustificacionAhorroPages()` en
[res080Doc.js](implementation/frontend/src/features/expedientes/logic/res080Doc.js), que llaman
tanto el PDF que se archiva como `CertificadoRes080Modal.jsx` (la vista previa, que mantiene su
propia copia del RESTO del documento). Mismo patrón que `buildCe3xPages`. Antes estaba duplicado y
había que tocar los dos sitios a la vez; ya no.

**Dónde se guarda** (sin migración — JSONB que ya existía). Los dos métodos conviven en el MISMO
`emisiones_manual` con prefijos distintos: cambiar de método y volver no borra lo ya tecleado.
- Oportunidad (`datos_calculo.inputs`, plano): `metodoAhorroRes080`,
  `manualEmisionesElectricoInicial/Final`, `manualEmisionesOtrosInicial/Final`,
  `combustibleOtrosInicial/Final`.
- Expediente (`cee`, anidado): `metodo_ahorro`,
  `emisiones_manual.electrico_ini/_fin` + `otros_ini/_fin`, `comb_otros_inicial/final`.

**Las CUATRO ramas del mismo cálculo** (hay que tocarlas a la vez): `CalculatorView.handleCalculate`
· `ExpedienteDetailView.calcResults` · `CeeModule.res080Data` · `cifoService.computeRes080Results`
(server-side, lo usa la skill `generar-anexo-cifo`). Cada una tiene DOS entradas al simplificado:
`calculateRes080SimplificadoFromXml` (con los dos `.xml`) y `calculateRes080Simplificado` (valores
sueltos, modo manual). El resultado marca `metodoAhorro` ('detallado'|'simplificado'): **ese campo
es el que ramea a los consumidores**, no el JSONB.

**OCR** (solo cuando no hay `.xml`): `ceeOcrService.js` lee los dos totales
(`emisiones.consumo_electrico_m2` / `consumo_otros_m2`) y `combustible_otros_detectado`. Un CEE
leído por OCR alimenta el cálculo igual que un `.xml` porque `ceeToXmlShape()` los mapea a
`emisionesConsumoElectrico` / `emisionesConsumoOtros` / `combustibleOtros`: los consumidores leen
`cee_inicial`/`cee_final` sin saber de dónde vinieron. `ceeToColumn()` los propaga además a las
dos superficies de «Cargar CEE». Lo que el OCR **no** puede dar es `energiaFinalVectores`: el PDF
no imprime esa tabla, solo está en el `.xml` — por eso un CEE por OCR cae siempre en la vía de
emisiones.

`EfficiencyTable` acepta `categories` (por defecto las 3 de siempre, sin cambios). Los rótulos van
EXPLÍCITOS por fila porque los dos métodos no comparten redacción: uno habla de usos y el otro de
vectores. `CATEGORIES_SIMPLIFICADO` es la fuente única de las dos filas nuevas.

---

## Convenio de Cesión — se firma ANTES de terminar la obra (2026-08-12)

El convenio tiene ahora **dos redacciones del mismo documento** (mismo fichero, mismo nombre,
mismo slot `anexo_cesion_*`, misma caja de firma): actuación **PREVISTA** y actuación
**EJECUTADA**. Lo decide `previo` en `buildAnexoCesionHtml(expediente, results, { previo })`;
sin ese parámetro manda `esCesionPrevia(expediente)`, en
[docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js).

**REGLA — mientras no haya facturas, el convenio va en FUTURO.** El texto de obra ejecutada
afirma que la actuación *se ha llevado a cabo* y que el ahorro *se ha estimado* sobre algo hecho.
Firmado antes de la obra, el cliente declara como pasado lo que no ha ocurrido. El previo dice lo
mismo en futuro (modelo oficial del convenio CAE, Orden TED/815/2023 art. 11, OPCIÓN 2) y añade
las dos salvaguardas que ese momento exige: el ahorro es **estimado** y, si el verificado sale
distinto, la cesión se mantiene íntegra; y el importe **se ajusta al ahorro verificado sin variar
el precio unitario**.

**REGLA — SIEMPRE se habla de ahorro ESTIMADO, también con la obra terminada.** Lo fija la ficha,
no un contador: la cláusula tercera decía "ahorro anual efectivo" y comprometía un número que el
verificador todavía puede mover.

**REGLA — sin IBAN el convenio NO deja un hueco.** Con cuenta se imprime como hasta ahora; sin
ella el texto dice que el ingreso irá a la que el Cedente aporte. **La titularidad se acredita con
justificante en los dos casos.** Por eso la falta de IBAN deja de bloquear el envío
(`anexoBlockers` en `EnviarAnexosModal`) y de contar como dato faltante (`validateExpediente`)
cuando el convenio es previo: es justo el supuesto para el que existe.

**REGLA — con "Descuento Certificados" activo, el convenio NO dice NADA del coste de gestión.**
Ni la deducción ni su negación: el párrafo entero desaparece. Antes se reescribía como reclamo
("la gestión es completamente gratuita, BROKERGY corre con estos costes") — esto es un contrato
que lee el verificador, y ahí no pinta una oferta comercial que además le mete al Cedente en la
cabeza un coste que en su caso no existe. Sin deducción, lo que se debe es el importe íntegro de
la cláusula cuarta, que ya es el comportamiento por defecto de cualquier contrato. De paso se
quita una afirmación que salía en falso: un expediente sin CEE llega sin `caeMaintenanceCost` y
prometía gratuidad sin haberla comprobado.

**El popup manda sobre la detección.** Generar abre `CesionObraGate` (DocumentacionModule), que
propone la respuesta según haya facturas registradas y guarda la elegida en
`documentacion.anexo_cesion_obra_finalizada`. Se persiste porque **el envío vuelve a generar el
PDF**: sin guardarla, se revisa un texto en pantalla y se manda el otro. Al modal se le pasa
además `previo` explícito — la decisión acaba de guardarse y el `expediente` de la vista va un
refetch por detrás. `onRequestSend` viaja con `overrides.cesion` (mismo mecanismo que el Anexo I)
para que se envíe exactamente el HTML revisado.

**REGLA — el contenido cabe en DOS páginas y eso se COMPRUEBA.** `.conv-page` es una caja fija con
`overflow:hidden`: lo que no cabe no descoloca nada, **desaparece** — y como los hijos de
`.conv-body` son flex-items que se encogen, el `scrollHeight` del contenedor ni siquiera lo
delata. El documento V3 iba con 2px de holgura, así que el texto nuevo obligó a apretar el
interlineado (1,65 → 1,5) y los márgenes de título/subtítulos. Tras cualquier retoque del texto:

```bash
node implementation/backend/scripts/check_anexo_cesion_2pag.mjs
```

**El `padding-bottom` de `.conv-body` y todo `.conv-sign*` NO se tocan**: el recuadro de firma del
Cesionario es una caja FIJA en coordenadas de PDF (`SIGN_BOXES.anexo_cesion_cesionario`) y está
anclada al borde inferior de la página 2. Verificado: la caja cae en el mismo píxel que antes.

---

## Facturas de la obra — OCR y filtro previo de incidencias (2026-08-03)

Modal **FACTURAS DE LA OBRA** (pestaña Documentación → "Gestionar"). Sueltas el PDF y la app lo
sube a "5. FACTURAS", lo LEE y lo cruza con el expediente. **Solo ADMIN**: aquí hay importes.

### El OCR es el mismo camino que el del CEE
[facturaOcrService.js](implementation/backend/services/facturaOcrService.js) es el gemelo de
`ceeOcrService.js`: Gemini 2.5 Flash con `responseSchema`, `temperature: 0` y reintentos 429/500/503,
reutilizando `ceeOcrService.normalizeToPdf` (une fotos sueltas en un PDF antes de leer). Coste real
medido: **< 0,002 € por factura**, ~11 s. Ruta: `POST /api/expedientes/:id/facturas/ocr` (multipart,
NO base64 en JSON).

**REGLA — la IA solo LEE; el juicio es de las reglas.** El modelo devuelve el desglose con cada línea
clasificada en un enum cerrado de `partida` (AEROTERMIA · ACS · EMISORES · VENTANAS · CUBIERTA ·
FACHADA · SUELO · FOTOVOLTAICA · OBRA_CIVIL · MANO_OBRA · OTROS). Quién decide qué es incidencia es
[facturaIncidencias.js](implementation/backend/services/facturaIncidencias.js), determinista y con la
evidencia literal citada, para que cualquiera pueda reproducir por qué saltó.

### Lo que mira (mismo criterio que el §4B de la skill `auditar-expediente`)
- **GRAVE `UNIDADES_TERMINALES`** — en RES060/RES093/TER100 (`esSustitucionCaldera`), una línea
  `EMISORES` es incidencia: **la ficha no admite cambiar ni ampliar las unidades terminales**. La
  actuación es sustituir el GENERADOR, y el emisor existente es el que fija la temperatura de
  impulsión y con ella el SCOP. RES080 exento (ahí sí cabe obra de emisores). ⚠️ Conectar o purgar
  los emisores YA EXISTENTES es `OBRA_CIVIL`, no `EMISORES` — probado: no da falso positivo.
- **GRAVE**: `TITULAR` (NIF del cliente ≠ el del expediente) · `EMISOR` (no factura el instalador
  asociado, que es quien firma el CIFO) · `ALCANCE` (partida fuera de la ficha) ·
  `ALCANCE_SIN_EQUIPO` (única factura sin la bomba de calor) · `DUPLICADA` · `SERIE_DISTINTA` ·
  `FECHA` (anterior al registro del CEE inicial, o futura) · `SOBREFINANCIACION`.
- **LEVE**: `SIN_EQUIPO` (falta marca / modelo / nº de serie — lo ideal es que la factura lo cite) ·
  `SIN_DESGLOSE` · `DIRECCION` · `SIN_CLIENTE` · `SIN_FECHA`.

**Las incidencias se PROPONEN, no se registran solas.** El modal las lista con casilla, GRAVES
primero; solo las marcadas se dan de alta vía `POST /:id/incidencias` con `procedencia: AGENTE_IA`.

### La factura que sube el CLIENTE también se lee sola (2026-08-11)
[facturaAutoOcr.js](implementation/backend/services/facturaAutoOcr.js), disparado en `setImmediate`
desde la subida pública al slot `DOC_FACTURAS`. Antes esa fila llegaba al admin con nº, fecha e
importe **en blanco** y había que abrir el PDF y teclearlos.

- El cliente **no espera ni lo ve**: la respuesta ya se ha devuelto cuando arranca el OCR.
- Completa la fila que `append_expediente_factura` dejó vacía, con la RPC
  **`update_expediente_factura_by_driveid`** (MERGE `||` sobre el objeto, solo la fila de ese
  `drive_id`). Un read-modify-write del array se pisaría con cualquier otra escritura sobre
  `documentacion` — mismo motivo que la regla 19.
- **Solo rellena huecos** y marca `origen: 'popup+ocr'` + `ocr_pendiente_revision: true`. En el modal
  de Facturas sale el aviso "Leída automáticamente — comprueba nº, fecha e importe", que desaparece
  en cuanto el admin toca cualquier campo o la valida. Lo ha leído una máquina de un fichero que
  subió el cliente y que puede ser cualquier cosa (un albarán, un presupuesto, una foto movida).
- **NO levanta incidencias**: eso sigue siendo del modal del admin, con una persona confirmando.

### PDF único de facturas — por qué salían duplicados
**REGLA — el combinado se construye desde `documentacion.facturas[]`, NUNCA listando la carpeta.**
Listar "5. FACTURAS" metía en el PDF cualquier fichero suelto. Caso real (26RES060_159): la misma
factura subida dos veces con 3 minutos de diferencia → el combinado la incluía **dos veces**, y esa
inversión duplicada es la que viaja al verificador (`Σ facturas[].importe_sin_iva` es la inversión
del Anexo y de la solicitud). Además:
- **Borrar o reemplazar una factura ARCHIVA su PDF** en `5. FACTURAS/OLD` (`archiveExistingToOld`).
  Antes solo se quitaba la fila del JSON y el fichero seguía contando.
- **Lock en memoria + `findFilesByName` (plural)**: dos POST solapados creaban dos combinados con el
  mismo nombre (Drive lo permite) y el borrado previo solo se llevaba uno. El front lo guarda además
  con un `useRef` (el estado de React se confirma un render tarde y no frena la reentrada).
- **Repara referencias muertas**: si el `drive_id` registrado está en la papelera pero hay un gemelo
  vivo con el mismo nombre en la carpeta, lo usa y lo avisa, en vez de fallar.
- La respuesta trae `huerfanos[]` (ficheros de la carpeta que no son de ninguna factura registrada).
- **El combinado vive en DOS carpetas a propósito**: el de trabajo en "5. FACTURAS" y la copia para
  el auditor en "10. EXPEDIENTE CAE". Se dice en la UI porque parecía que se generaba dos veces.

---

## El CIFO en PDF — las hojas son FIJAS y hay que medirlas (2026-08-25)

En el VISOR no se nota nada: `.doc-page` es `min-height:1123px` **sin tope**, así que la caja crece
y todo se ve. En el PDF la hoja son 297mm fijos, el pie va `position:absolute` y
`page-break-after:always` corta por el borde: lo que sobra se parte a mitad de fila y el pie sale en
la hoja equivocada. **Un desborde de 1px saca una hoja casi en blanco.** Por eso mirar la vista
previa NO es comprobarlo.

```bash
node implementation/backend/scripts/check_cifo_paginas.mjs
```

Mide con Puppeteer las 12 combinaciones (cascada de 1 a 5, ACS con el mismo equipo, sin ACS, las
tres fichas, piscina, textos largos) y falla si alguna hoja se pasa. Sirve las tipografías desde
`frontend/public/fonts` interceptando las peticiones: **con la de respaldo mediría de menos** y
daría por bueno algo que en producción se corta. **Tras cualquier retoque del CIFO, pasarlo.**

**REGLA — una hoja por bloque; el corte NO es condicional.** Los datos de la instalación y los
valores de las variables iban en la MISMA hoja y no cabían: medido sobre 998px útiles, el caso más
simple (RES060, un equipo) pedía 971 —27px de holgura—, RES093 ya se pasaba 10px y un RES060 con 3
bombas en cascada, 89 (26RES060_146, que es como se detectó). Partir solo "cuando haga falta" habría
dejado vivo justo el caso que cabía de milagro: un modelo de caldera una línea más largo se lo come.
Lo que engorda esa hoja es la **cascada** —una fila más y un nº de serie por unidad, en calefacción
y otra vez en ACS si el equipo es el mismo—, y así deja de importar.

**REGLA — la PISCINA encabeza la hoja de variables, no la de instalación.** Solo existe en TER100 y
su tabla ocupa 268px: en un terciario con la cascada cubriendo calefacción y ACS a la vez, la hoja
de instalación se pasaba 132px con 5 equipos. Cae justo encima de la tabla donde salen su D_CAP y su
SCOP_pwh, así que no descoloca la lectura.

**REGLA — el recuadro de "Firma y sello" va ANCLADO al borde inferior** (`.doc-spacer` +
`.doc-sign-bottom`), como el del Convenio de Cesión. El sello se estampa en coordenadas FIJAS de PDF
(`SIGN_BOXES.cifo_res060`, y=926…1006 de los 1123 de la hoja) pero el recuadro DIBUJADO iba donde lo
dejara el texto de encima: medido, flotaba entre y=907 y y=923 según la ficha y el largo de la razón
social, con 12px de holgura. Ahora cae siempre en 921…1025. **Los 29px de `.doc-sign-bottom` no se
tocan sin recalcular `SIGN_BOXES`**, y el separador tiene que ser `flex:1` y no un `margin-top:auto`
— dos márgenes automáticos (el suyo y el del pie) se reparten el hueco y el recuadro queda a media
hoja; `flex-grow` reparte primero y deja el pie abajo.

⚠️ El anclaje por TEXTO de `SubirCifoView` (`signatureAnchor`) apuntaba a "firma y sello", un
encabezado que ya no existe —el recuadro se rotula por dentro—. No rompió la firma porque `fixedBox`
tiene prioridad en `FirmarConCertificadoModal`, pero si alguna vez se quita ese `fixedBox` hay que
revisar el ancla.

La hoja 1 también iba al ras (RES093 y TER100 se pasaban 1-2px, y con los textos largos reales, 16).
Se le quitaron el subtítulo que repetía literalmente las dos filas de debajo, el encabezado "Hitos de
la actuación" (sus dos fechas van ahora dentro de "Identificación de la actuación", rotuladas igual)
y el encabezado "Firma y sello". El `kv` bajó de 7px a 6px de padding vertical: son 14 filas en esa
hoja. Holguras actuales: **+43px en el peor caso** y +73 en la hoja de variables de un TER100 con
piscina.

---

## El módulo CEE del expediente, en el MÓVIL — asignar técnico (2026-08-21)

La pestaña CEE se abre desde el teléfono para hacer UNA cosa: ver cómo va el certificado y
**mandárselo a un técnico**. Medido a 390 px sobre el DOM (no a ojo): el módulo pedía **538 px**
de ancho, así que 148 px quedaban fuera de la pantalla —y el panel recorta con `overflow-hidden`,
o sea que ni siquiera se podían arrastrar—. Justo ahí vivía el **selector de certificador**
(x=334→538): asignar técnico desde el móvil era literalmente imposible.

**REGLA — el escritorio no cambia; todo lo móvil va en `max-md:`.** Comprobado con capturas a
1440 px antes y después: mismo hash MD5, y el selector conserva sus 204×33 px en la misma
posición. Cuando el cambio no se puede expresar en CSS (montar otro componente) se usa el hook
[useIsMobile](implementation/frontend/src/utils/useIsMobile.js), que corta en los mismos 767 px
que `max-md:` para que CSS y JavaScript nunca se contradigan.

### Asignar técnico — [TecnicoPicker.jsx](implementation/frontend/src/features/expedientes/components/TecnicoPicker.jsx)
Un control con dos caras. En escritorio, el desplegable compacto de siempre (el antiguo
`SearchableSelect` de `CeeModule`, movido tal cual). En móvil:
- **Sube a lo primero de la cabecera** (`max-md:order-first`) y ocupa el ancho entero: es la tarea
  por la que se entra, no un campo más de la fila del título.
- Se abre como **hoja inferior a pantalla completa** con buscador de 16px (por palabras y sin
  tildes, igual que `PrescriptorPicker`), filas de 56 px y área segura del iPhone.
- **El teléfono y el email van EN la fila de cada técnico**, y bajo la tarjeta salen los botones de
  llamar y escribir: se elige certificador por zona y por quién coge el teléfono, y desde el móvil
  lo siguiente que se hace es llamarle.

### Los dos popups del certificador (asignar/notificar y visto bueno)
Pasan a **hoja inferior** en móvil: cabecera fija con el nombre del técnico, un solo eje de scroll
y los botones **pegados abajo** con `env(safe-area-inset-bottom)`. Centrados, el teclado dejaba el
botón de enviar fuera de la pantalla. El mensaje viene **plegado**
([MensajeEditable](implementation/frontend/src/features/expedientes/components/MensajeEditable.jsx)):
nueve renglones a 16 px son media pantalla de un texto que casi nunca se edita. Y el **email y el
teléfono se leen dentro de la píldora del canal** — comprobarlos es lo que se hace justo antes de
pulsar lo único irreversible. Mismo criterio que la página de acciones del parte diario.

### La demanda simulada, detrás de una ⓘ (2026-08-27)

Junto al recuadro de "Demanda calefacción" hay un botón de información que cruza la demanda **y la
superficie** de esta fase con las que se usaron en la **simulación de la oportunidad**. Fuente
única del cálculo:
[demandaPropuesta.js](implementation/frontend/src/features/expedientes/logic/demandaPropuesta.js);
la superficie, [DemandaPropuestaInfo.jsx](implementation/frontend/src/features/expedientes/components/DemandaPropuestaInfo.jsx).

**REGLA — es un BOTÓN, no una banda.** La fila del CEE ya lleva cinco columnas, tres fechas y seis
slots: un recuadro permanente con dos cifras más la convierte en un muro y el expediente deja de
leerse de un vistazo. El dato solo hace falta cuando se compara.

**REGLA — la EXCEPCIÓN es el aviso.** Si la demanda **o** la superficie certificadas quedan por
debajo de las simuladas, el botón se pone **rojo y parpadea** (`animate-pulse`) sin tener que
pulsar nada: sobre esas cifras se le prometió el bono al cliente. Holgura del 2 %, la misma que se
aplica al comparar el CEE inicial con el final — por debajo de eso son redondeos del `.cex`.

**REGLA — en el CEE FINAL de un RES080 el criterio se INVIERTE.** Allí la actuación toca la
ENVOLVENTE, así que la demanda tiene que BAJAR: el ahorro de la ficha es la diferencia entre el
antes y el después. Una demanda que no baja no es "todo en orden", es la señal de que el
certificado no recoge la mejora —o de que es el anterior—, y con ella el RES080 se queda sin ahorro
que justificar; así que el aviso salta cuando NO baja (`esperaDemandaMenor`). El criterio de la
superficie no cambia: la obra no encoge la vivienda.
⚠️ **Salvo que la simulación PARTIERA ya de ese mismo CEE final**, en cuyo caso lo que se espera es
que coincida. No basta con `result.desdeCeeFinal` —solo se sella en modo 'real'—: medido en
26RES080_80, el certificado se cargó en modo 'manual' y el campo llega vacío aunque `q_net` sea
exactamente la demanda del final (94,7). Por eso se comprueba además que las dos cifras coincidan.

**REGLA — la demanda se compara SIN multiplicar por la superficie, y la superficie aparte.** Son
dos desvíos con causas distintas —uno habla de la envolvente y el otro de qué se midió— y
multiplicados se tapan el uno al otro: una demanda un 10 % más baja sobre una superficie un 10 %
mayor da un total idéntico y no delataría nada. El total anual sigue al pie, en gris, como cifra
de control (es la que acaba viajando al CIFO).

**REGLA — el panel se PORTALEA a `document.body`** y va `fixed`, con la posición calculada desde el
rect del botón (y volteado hacia arriba si no cabe abajo). La rejilla vive dentro de una tarjeta
`relative overflow-hidden`, que recortaría un popover absoluto justo en la fila del CEE final, que
es la última. Mismo motivo que `SendActionOverlay` (regla 29.b). En móvil es **hoja inferior**: 320
px colgando de un botón de 20 se salen de la pantalla.

**REGLA — el popup del `.xml` y el botón dicen LO MISMO.** Al soltar el certificado salta el aviso
con el MISMO componente (`DemandaPropuestaPanel`, con `cabecera={false}`) y el mismo criterio.
Antes ese popup comparaba solo **totales** y podía callarse en un certificado que el botón sí
marcaba en rojo: dos veredictos sobre el mismo hecho. El aviso se cruza en las DOS fases y en
todas las fichas; en la final, los avisos propios de la fase (ahorro RES080 por debajo del
simulado, demanda inicial ≠ final) tienen prioridad y éste se enseña solo si aquéllos no saltan.

El valor sale de `datos_calculo.result` (`q_net` por m², `Q_net` total y la superficie aplicada),
con respaldo en la raíz de `datos_calculo` y en la columna `oportunidades.demanda_calefaccion` para
los expedientes viejos. Sin oportunidad detrás —un CEE directo— no se pinta el botón. Existía ya el
aviso al soltar el `.xml`, pero **desaparecía al recargar**: el descuadre volvía a verse al generar
el CIFO, con el cliente ya comprometido.

⚠️ Los rótulos de columna van en una **cabecera única** y la plantilla `COLS` la comparten cabecera
y filas. Repetidos dentro de cada fila, "Oportunidad 200,00 · Certificado 170,00 −15 %" no cabe en
el popover de 320 px y las dos mitades se tocan.

### La rejilla de los dos CEE
Las cinco columnas (250+168+225+320+340 px) se apilan a ancho completo. Las **tres fechas pasan a
tres filas** con el rótulo a la izquierda: un `input[type=date]` a 16 px —obligatorio para que iOS
no amplíe la página— pide ~135 px y en tres columnas el navegador recortaba el formato a `mm/dd/`.
Los rótulos de 7 px suben a 10 px y todos los controles llegan a los 44 px de objetivo táctil
(medidos: 8 botones se quedaban entre 20 y 39 px).

---

## CEE directos — el segundo negocio (2026-08-24)

Certificados de eficiencia energética que nos contratan **SUELTOS**: compraventa,
alquiler, obra particular. **No hay ficha, ni ahorro, ni CAE, ni lote, ni CIFO.**
Nos contratan el certificado y ahí se acaba.

Pestaña propia (**CEE directos**), tabla propia (`cee_directos`), rutas propias
(`/api/cee-directos`) — pero **dentro de la misma app y el mismo despliegue**.

**REGLA — NO va en `expedientes`.** Esa tabla exige `oportunidad_id NOT NULL`, así
que meterlo ahí obligaría a fabricar una oportunidad sintética por encargo, y esas
contaminan el embudo del cuadro de mando, `v_expedientes_lifecycle`, los lotes, el
radar del parte diario, el MCP y las skills: ~15 consultas que habría que filtrar
una a una. Un proyecto SEPARADO tampoco: tendría que duplicar auth, el OAuth de
Drive, clientes, certificadores y el envío de email — y la sesión de WhatsApp es un
**singleton atado a un teléfono**, que dos procesos no pueden compartir.

### Lo que se comparte, IMPORTADO y no copiado

| Qué | Cómo |
|---|---|
| `CeeModule` / `CeeDocumentsGrid` | props `apiBase` (por defecto `/api/expedientes`) y `secciones` |
| Página de subida del técnico (`SubirCeeView`) | prop `endpoint` (por defecto `cee-upload`) |
| Slots del CEE y su detección por sufijo | `CEE_SLOTS` y `matchSlot`, exportados de `ceeUploadService` |
| Drive, email, WhatsApp, `seguimientoTracking`, `buildCertClienteData` | tal cual |

**REGLA — un endpoint nuevo del módulo CEE se declara en LAS DOS rutas**
(`expedientes.js` y `ceeDirectos.js`). El módulo llama a `${apiBase}/${id}/…` sin
saber en qué negocio está: si solo se añade en una, el botón queda muerto en la otra.

**REGLA — el gemelo se ESCRIBE, no se bifurca.** `ceeDirectoUploadService` no es un
`if (esCeeDirecto)` dentro de `ceeUploadService`: aquel resuelve la carpeta leyendo
`oportunidades.datos_calculo`, escribe en `expedientes` y dispara
`expedienteFolderSync`, que mueve la carpeta entre las 13 carpetas de estado del CAE.
Meter las dos realidades en la misma función convierte el camino que está en
producción en el sitio donde se rompe lo nuevo, y al revés.

### Numeración — `{AAAA}CEE_{n}`

Año a **CUATRO** dígitos (no como el CAE) y correlativo **GLOBAL**: no se reinicia en
enero (2025CEE_44 → 2026CEE_45). El siguiente sale de
`cee_directo_siguiente_correlativo()`, que **bloquea la tabla**: dos altas leyendo
`MAX+1` desde Node sacarían el mismo número.

En modo manual, un número ya usado **se bloquea** y se dice quién lo tiene, avisando
en el propio formulario y no al pulsar "Crear". El histórico arrastra un `2025CEE_18`
**duplicado** (Alfredo Castellanos y Vasil Marinov), así que el índice único es
**PARCIAL** (`WHERE NOT duplicado_historico`): protege todo lo demás sin obligar a
renumerar el expediente de nadie.

### Alcance: ÚNICO o DOBLE

Se pregunta al crear. **'UNICO' no se llama "inicial"**: en una compraventa no hay un
después, y esa palabra hace buscar un certificado que no va a llegar. El módulo pinta
UNA fase (`secciones={['inicial']}`), la carpeta se llama `1. CEE` y el fichero,
`{nº} – CEE.xml`. Se amplía a DOBLE desde la ficha: entonces `1. CEE` se renombra a
`1. CEE INICIAL` y aparece `2. CEE FINAL`. Nunca al revés — quitar la fase final de un
encargo con un CEE ya emitido esconde un certificado real.

### Estados

Los MISMOS 8 subestados de seguimiento del CAE (`PTE_ENVIO_CERT … REGISTRADO`), con
sus timestamps paralelos. La diferencia: aquí `estado` **se DERIVA** de los subestados
([utils/ceeDirectoEstados.js](implementation/backend/utils/ceeDirectoEstados.js),
`deriveEstado`) y no se acepta del navegador. En el CAE lo escriben seis sitios y hubo
que inventar `avanzarEstado()` para que ninguno lo hiciera retroceder; aquí no puede
haber una pastilla que diga una cosa y un módulo que diga otra.

### Drive

`26. CERTIF. EFICIENCIA ENER / 1. PRODUCCION` (`1iaDiUXHZUpcw45ZCDzbKimj1fcoSOcID`),
**misma cuenta OAuth que el CAE** — no hace falta credencial nueva. Carpeta
`{nº} - {NOMBRE DEL CLIENTE}` + las cuatro subcarpetas de `2026CEE_53`, con la de CEE
FINAL solo si el encargo la necesita. **La carpeta NO se mueve nunca**: no hay
carpetas por estado, así que `ceeDirectoFolders.js` no tiene mapa ni sincronizador.
La creación es idempotente: si ya existe una con ese nombre (hecha a mano antes de dar
el alta, que es lo habitual) se ADOPTA en vez de crear una segunda.

### La entrega al cliente se dispara SOLA

Condición doble, y las dos mitades llegan en desorden — unas veces se cobra y
días después el certificador sube el registro, otras al revés:

```
cobrado + justificante de REGISTRO subido + PDF firmado subido
```

Por eso **no hay un único disparador**: la comprobación es una sola función
([ceeDirectoEntrega.js](implementation/backend/services/ceeDirectoEntrega.js)) y
la llaman los TRES sitios donde puede completarse la condición — marcar cobrado,
el PUT que pone la fase en REGISTRADO, y la subida del registro desde el enlace
público del certificador. **Quien llegue el segundo es el que envía.**

**REGLA — solo se le mandan DOS ficheros: el PDF firmado y el justificante de
registro.** El `.xml` y el `.cex` son ficheros de trabajo del certificador que el
cliente no puede abrir, y la etiqueta ya va dentro del propio certificado.
Mandarle los cinco hace que no sepa cuál de ellos es "su papel".

**REGLA — la idempotencia se comprueba ANTES que nada.** Los dos disparadores
pueden coincidir en el mismo minuto (marcar cobrado justo cuando entra el
registro) y el cliente recibiría el certificado dos veces. El sello va en
`documentacion.entrega_cliente[fase]` y es **por FASE**: en un encargo doble se
entrega el inicial y meses después el final, así que un sello único daría el
segundo por hecho. Se escribe con la RPC de MERGE.

**REGLA — los adjuntos se vuelven a comprobar al descargarlos.** `estado()` los ve
en Drive, pero entre la comprobación y la descarga alguien puede haberlos movido:
un email de entrega SIN el certificado deja al cliente esperando algo que ya
consta como enviado. Si no bajan los dos, no sale nada.

**En WhatsApp el texto va PRIMERO y aparte**, y cada PDF detrás con una etiqueta
corta ("certificado firmado", "justificante de registro"). Un mensaje largo como
caption de un adjunto hace que mucha gente no llegue a abrir el fichero.

**En LOCAL hay que apagarlo**: `CEE_ENTREGA_AUTO=false` en el `.env`. Si no,
marcar como cobrado un expediente cualquiera mientras se prueba manda un WhatsApp
y un email REALES al cliente REAL. El botón manual de la ficha sigue funcionando
con la variable apagada —ahí hay una persona decidiendo, que es justo lo que le
falta al automático— y el panel **dice en pantalla** que el automático está
apagado: sin ese aviso uno marca cobrado, no pasa nada, y piensa que está roto.

El panel de la ficha (`EntregaCliente.jsx`) enseña **qué falta en lenguaje de
tarea** ("Subir el PDF del CEE firmado"), no un booleano: el automático no puede
explicarse solo. `GET /:id/entrega` usa la MISMA función que el envío, así que la
pantalla no puede decir que está listo mientras el backend dice que no.

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

### Quién es el CLIENTE y quién el PARTNER

**REGLA — el que va en el certificado es el CLIENTE, y punto.** Cuando nos
contrata una empresa pero la vivienda es de un particular, el modelo NO es
inventarse un "titular": es el de siempre en toda la app —**la empresa es el
PARTNER** que trae el encargo (`prescriptor_id`) y **el particular es el CLIENTE**
(`cliente_id`).

Medido en 2026CEE_54: nos lo trae ATERSOL (partner, INSTALADOR) y el CEE se emite
a nombre de Vicente Gavidia (cliente). Hubo una versión con un campo `titular`
aparte; se retiró —columna incluida— porque tener DOS campos contestando a "quién
va en el certificado" es una contradicción esperando a ocurrir.

**La base de clientes es LA MISMA que la del CAE.** Un cliente puede tener a la
vez oportunidades, expedientes CAE y CEE sueltos. Se da de alta desde Clientes o
desde el propio formulario del CEE, y **se edita sin salir de él** (`ClientePicker`
→ "Editar" abre `ClienteDetailModal`): si para corregir un teléfono hay que irse a
otra pestaña, se pierde lo que estabas haciendo y casi nadie vuelve.

### El formulario se guarda solo, y eso tiene una trampa

`DatosExpediente` **autoguarda** con un freno de 900 ms. El freno no es estética:
cambiar el nombre RENOMBRA la carpeta de Drive, y guardar a cada tecla dispararía
una llamada a Google por letra.

⚠️ **REGLA — el guardián del autoguardado compara VALORES, no "¿es el primer
render?".** La primera versión usaba una bandera de "ya monté" y al abrir el
2026CEE_54 se autoguardó sola y **le borró el `prescriptor_id`**. Dos causas, y
las dos las mata comparar contra lo último persistido:

1. el efecto se re-lanza cuando cambia la identidad de `onGuardado`, y el padre lo
   pasa como flecha en línea (nuevo objeto en cada render), así que la bandera se
   saltaba en la segunda pasada;
2. y como al guardar se refresca el expediente, el padre re-renderiza y vuelve a
   cambiar `onGuardado`: **bucle de guardados**.

Por eso `persistido` guarda el JSON de lo que consta escrito y el efecto sale sin
hacer nada si el formulario coincide, y `onGuardado` viaja por `useRef` para que su
identidad no entre en las dependencias. Verificado: **cero PUT al abrir la ficha**,
**un solo PUT** al teclear cinco letras seguidas.

### El técnico ACUSA el encargo: lo cojo / no puedo

El CAE solo tiene "aceptar" (`cert-ack`). Aquí hacen falta las dos respuestas, y
**la de rechazo es la que más valor tiene**: hasta ahora, que un técnico no
pudiera se sabía llamándole por teléfono a los diez días, con el expediente
parado y nadie enterado.

**REGLA — el gesto es el MISMO que en el CAE.** Al certificador le llegan los dos
tipos de encargo y no puede tener que aprender dos procesos. En el CAE
(`CertAckView`) el enlace "Aceptar encargo" **acepta al abrirse**, sin preguntar
nada, y a los 2,5 s te deja dentro del expediente. Aquí igual: el email lleva
**"✅ Acepto el encargo"** en verde (`?r=si`, acepta sola y redirige a
`/?cee=<id>`) y **"No puedo cogerlo"** discreto debajo (`?r=no`).

La primera versión ponía UN botón "Lo cojo / No puedo" que abría una página a
preguntar. Sobraba: al abrir el correo ya has decidido, y esa pantalla de más es
justo lo que hacía el proceso distinto del CAE.

**REGLA — aceptar es automático; RECHAZAR nunca.** Aceptar de más no rompe nada
(sigues siendo el técnico); rechazar te retira del expediente y lo devuelve a la
cola, así que un pulgar despistado sobre el enlace equivocado no puede
provocarlo. La pantalla de rechazo pide confirmación, ofrece motivo y lleva
salida ("me he equivocado, sí me encargo").

**No se puede resolver DENTRO del email**: los clientes de correo no ejecutan
JavaScript y Gmail elimina los formularios, así que lo único pulsable es un
enlace. Es la misma razón por la que el CAE abre una página.

**REGLA — al rechazar se RETIRA el certificador** (`cee.certificador_id = null`) y
la fase vuelve a `PTE_ENVIO_CERT`. Si se quedara puesto, la ficha seguiría
enseñando como responsable a quien acaba de decir que no. Queda anotado en
`cee.rechazos[]` con quién, por qué y cuándo.

**El token es de UN SOLO USO** (`cee.ack_token`) y se regenera en cada encargo:
el enlace de un encargo viejo —o el del técnico al que ya se le retiró— deja de
valer solo. Pulsar dos veces responde *"ya nos lo dijiste"*, no un error que haga
pensar que la respuesta no llegó.

**El aviso del rechazo lleva CANDIDATOS**, no solo la noticia:
`sugerirCertificadores()` excluye a los que ya dijeron que no a ESE expediente y
ordena por quién tiene menos trabajo abierto. Sin eso hay que entrar, abrir el
desplegable y acordarse de a quién no ofrecérselo.

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

### La ficha del CEE es UNA LÍNEA de datos, no un formulario

La pantalla del expediente trata de UNA cosa: el certificado. El cliente, el
partner y la dirección son datos de referencia —se escriben una vez y luego solo
se consultan—, pero en formulario abierto se comían media pantalla y empujaban el
módulo CEE, que es a lo que se entra, por debajo del pliegue. Medido: el módulo
empezaba a ~700 px del borde; ahora, a **217**.

`ResumenDatos` los resume en una cinta de pastillas: cada una dice lo justo para
saber si está bien y se despliega si quieres el detalle (con el teléfono y el
email pulsables, que es para lo que se abre). Editar abre `DatosExpedienteModal`,
que **monta el MISMO formulario** —no una copia— con su autoguardado.

**REGLA — lo que FALTA se ve sin desplegar nada.** Una pastilla en ámbar diciendo
"Falta la dirección" es la mitad del valor de la cinta: es lo que impide
encargarle el CEE al técnico, y esconderlo detrás de un clic sería cambiar
espacio por despistes.

**REGLA — el estado del autoguardado SUBE al contenedor** (`onEstado`). Sin botón
de Guardar, ese "Guardando… / ✓ Guardado" es la única señal de que lo escrito ha
llegado; al meter el formulario en el modal se quedó escondido dentro y hubo que
subirlo a la cabecera. Un autoguardado sin acuse no se distingue de no guardar.

En móvil los desplegables son **hoja inferior a lo ancho**, no popover anclado:
280 px colgando de una pastilla en una pantalla de 375 se sale o queda ilegible.

⚠️ **Gotcha**: `prescriptores` NO tiene columna `telefono` — es `tlf`. Pedirla en
un `select` hacía fallar la consulta ENTERA y el partner llegaba como `null`, así
que la ficha decía "Directo" en un expediente que sí lo tenía.

### La dirección se ELIGE, no se teclea

**REGLA — comunidad, provincia y municipio van por SELECTOR en cascada.** Es lo
que impide que el mismo municipio acabe escrito de siete maneras y luego no case
con nada. A mano solo se escriben el **código postal** y la **calle**.

Fuente única: [components/DireccionEdit.jsx](implementation/frontend/src/components/DireccionEdit.jsx),
que lo comparten la ficha de cliente y el expediente de CEE directo. Vivía dentro
de `ClienteDetailModal`; se sacó al necesitarlo la segunda pantalla, porque con
dos copias la dirección del cliente y la del inmueble se normalizarían distinto y
dejarían de casar. Sus siete efectos de normalización no sobran: los datos llegan
de la BD en MAYÚSCULAS, del Catastro con la provincia pegada al municipio, y a
veces solo hay un CP del que deducir provincia y comunidad.

⚠️ **Gotcha corregido**: al elegir la opción vacía de un `<select>`, `opt.text` es
el RÓTULO del desplegable. Sin guarda, vaciar la provincia guardaba
`"— Selecciona provincia —"` como provincia. Afectaba también a la ficha de
cliente.

### La dirección se trae del Catastro, y se puede corregir

Botón **"Traer"** junto a la referencia catastral: consulta `/api/catastro/search`
y reparte la respuesta en calle / CP / municipio / provincia.

**REGLA — rellena y se aparta: todo queda EDITABLE.** El Catastro escribe la vía
como la tiene registrada ("AV BARBER (DE) 26"), que a menudo no es como se escribe
la dirección de verdad, y **el piso y la puerta no los da nunca**. Por eso se avisa
en pantalla de que hay que comprobarla, en vez de bloquear los campos.

El troceo de la cadena es **fuente única** en
[utils/direccionCatastral.js](implementation/frontend/src/utils/direccionCatastral.js)
(`parseCatastroAddressFull`). Vivía dentro de `ClienteDetailModal`; se sacó al
necesitarlo la segunda pantalla, porque con dos copias la misma dirección se
rellena distinto según por dónde entres. Sin código postal no reparte nada: vuelca
la cadena entera en la calle y lo dice, antes que inventarse el municipio.

### Qué ve el certificador — y qué NO

**REGLA — al certificador NUNCA se le manda el enlace de la carpeta RAÍZ.** Dentro
está `3. PRESUPUESTO Y FACTURAS`, y en Drive **los permisos se HEREDAN**: compartir
la raíz es enseñarle lo que le cobramos al cliente y lo que nos cuesta la obra. El
encargo comparte y enlaza **subcarpeta a subcarpeta**: la de SU fase y
`4. DOCUMENTACIÓN PARA CEE`, nada más
(`ceeDirectoFolders.compartirConCertificador`). La de la fase que aún no se le ha
encargado tampoco: `2. CEE FINAL` se comparte el día que se le encarga el final.

Se refuerza en tres capas, porque una sola se olvida:
1. El mensaje del encargo lleva los enlaces concretos, no el de la raíz.
2. `GET /:id` **borra `drive_folder_id` y `drive_folder_link`** de la respuesta
   cuando quien pregunta no es staff.
3. La ficha no pinta el botón "📁 Carpeta" para el técnico.

**REGLA — un fichero que cae en presupuestos o facturas NO se hace público.** Los
subidos desde la app se marcan "cualquiera con el enlace" para que la
previsualización funcione sin estar logueado en la cuenta de Brokergy; ahí no,
porque un enlace público es un fichero que sale de la app en cuanto alguien copia
una URL (`ceeDirectoFolders.puedeHacersePublico`).

### Los FICHEROS los coloca el SERVIDOR, no el navegador

**REGLA — ninguna ruta de carpeta llega desde el cliente.** `CeeDocumentsGrid` es
un componente COMPARTIDO con el CAE y escribía el destino a mano —
`["1. CEE", "CEE FINAL"]`, que es la estructura del CAE. Aquí la sección cuelga
DIRECTAMENTE de la raíz (`2. CEE FINAL`), así que `getOrCreateSubfolder` iba
creando una `1. CEE/CEE FINAL` al vuelo dentro del encargo: el fichero quedaba
donde `scanSection` no mira y fuera de lo que se comparte con el técnico y con el
cliente. Medido: **3 encargos y 18 ficheros**, entre ellos el `.cex` de
2025CEE_43, que en pantalla salía subido y en Drive no estaba donde debía.

`POST /:id/documents/upload` delega ahora en `ceeDirectoUploadService.uploadFile`,
el MISMO camino que el enlace público del técnico — carpeta de la fase según el
alcance, renombrado canónico y versionado a OLD. Las dos superficies no pueden
divergir porque son la misma función.

**La fase y el slot se DEDUCEN si no vienen.** Entre el deploy y el siguiente
refresco hay navegadores con la versión anterior cargada que siguen mandando la
ruta del CAE; el nombre canónico que ya aplican (`… – CEE FINAL.cex`) basta para
saber a qué sección y a qué slot iban (`matchSlot`). Sin esto, el fallo seguiría
ocurriendo durante horas después de arreglarlo.

**El cajón OTROS conserva su nombre** (`opts.nombreLibre`): admite varios
ficheros, y el nombre canónico de un slot es fijo — cada subida archivaría la
anterior en OLD. El prefijo `{nº} – ` lo pone el servicio, nunca quien llama.

Recolocar lo ya mal colocado:

```bash
node implementation/backend/scripts/recolocar_cee_directos_drive.js --execute
```

**SALVAGUARDA — un encargo ÚNICO con certificados de las DOS fases no se toca.**
Allí las dos fases caen en la misma carpeta (`1. CEE`), y aplanarlas mezclaría dos
certificados: `matchSlot` se quedaría con el primero de cada slot y la app
enseñaría una mezcla. Eso no es un fichero mal colocado, es un encargo que en
realidad es DOBLE (visto en 2025CEE_26). Se avisa y se deja.

### El candado de cobro

`cobrado` (solo ADMIN). El cliente ve el estado y sube documentación desde el primer
día, pero **no descarga el certificado hasta que se marque**. Se comprueba también en
`POST /:id/resend-cee-notifications`: es el otro camino por el que el certificado
puede salir de la app, y un candado que solo vive en el portal se salta sin querer
pulsando "enviar" desde el panel.

### El histórico importado

`node scripts/importar_cee_directos.js` (simulación) / `--execute`. Trae las 55
carpetas con `origen='HISTORICO'`.

**REGLA — de un histórico solo se afirma lo que tiene JUSTIFICANTE.** La primera
versión deducía "PRESENTADO" de que hubiera un `.cex` en la carpeta, y doce encargos
cerrados en 2024 y 2025 entraban en la app como "PENDIENTE REVISIÓN": una cola de
trabajo inventada. Un `.cex` prueba que el certificado existe, no que esté esperando a
nadie. Solo se sella REGISTRADO, y lo demás queda en `PTE_ENVIO_CERT` que, junto a la
marca de histórico, se lee como "viene del Drive antiguo y no lo hemos clasificado".
El número se conserva TAL CUAL lo escribe la carpeta —los doce primeros llevan cero
(`2024CEE_01`)— para que el expediente no se llame distinto que su carpeta.

### Fuentes únicas

| Qué | Dónde |
|---|---|
| Estados y de quién es la pelota | [utils/ceeDirectoEstados.js](implementation/backend/utils/ceeDirectoEstados.js) |
| Carga, guardado, historial, numeración | [services/ceeDirectoService.js](implementation/backend/services/ceeDirectoService.js) |
| Carpetas de Drive | [services/ceeDirectoFolders.js](implementation/backend/services/ceeDirectoFolders.js) |
| Subida del CEE por el técnico | [services/ceeDirectoUploadService.js](implementation/backend/services/ceeDirectoUploadService.js) |
| Rutas | [routes/ceeDirectos.js](implementation/backend/routes/ceeDirectos.js) + `/cee-directo-upload` en `routes/public.js` |
| Esquema | `scripts/cee_directos_schema.sql` |

---

---

## Versiones de la PROPUESTA (2026-08-25)

Enviar una propuesta **no dejaba copia de nada**: el PDF se generaba al vuelo para
WhatsApp, el email lo rasterizaba el backend desde el HTML, y `html_propuesta` se
SOBRESCRIBÍA en cada envío. Con dos envíos (precio corregido, alcance ampliado) no
había forma de saber qué documento tenía el cliente delante ni cuál aceptó.

Fuente única: [propuestaVersiones.js](implementation/backend/services/propuestaVersiones.js).
Rutas en `oportunidades.js` (`/:id/propuesta/versiones · /version · /version/:v · /borrador`),
RPC en `scripts/propuesta_versiones.sql`.

**REGLA — la versión sube cuando la propuesta SALE, no cuando se guarda.** El botón
"Guardar en Drive" de la vista previa deja un BORRADOR de nombre fijo que se reemplaza
a sí mismo y NO consume número. Si contara, el contador dejaría de significar "lo que
ha visto el cliente", que es lo único que hace falta saber cuando alguien pregunta por
qué propuesta va la conversación. De paso arregla que cada pulsación dejara **otra
copia con el mismo nombre** (Drive lo admite): la carpeta acumulaba PDFs
indistinguibles entre sí.

**REGLA — se archiva EXACTAMENTE el PDF que se envía.** Se genera UNA vez, se archiva
en `0. PROPUESTAS` como `Propuesta_{expte}_v{N}.pdf`, y ese mismo buffer viaja al email
(`pdfBase64`, que `send-proposal` ya aceptaba) y a WhatsApp. Antes cada canal
rasterizaba su propio HTML —el del email lleva otro envoltorio—, así que **el adjunto
del correo y el de WhatsApp ni siquiera eran el mismo documento**. Si el PDF no se
puede preparar, **no se envía nada**: mismo criterio que el CIFO (regla 24).

**REGLA — el número lo asigna la BD.** `propuesta_version_add` calcula MAX+1 dentro del
UPDATE, que bloquea la fila; un MAX+1 leído desde Node daría el mismo número a dos
envíos simultáneos. `propuesta_version_merge` sella después (enlace de Drive, resultado
por canal, aceptación) con MERGE `||`, nunca reemplazo: esos tres datos llegan en
momentos distintos y separados por días.

**REGLA — en BD solo metadatos y el enlace (regla 21).** `html_propuesta` pesa **353 KB
de media y hasta 1,35 MB** (medido el 2026-08-25 sobre las 364 oportunidades), y
`datos_calculo` ya llega a 5,3 MB en el peor caso: guardar el HTML de cada versión
repetiría la caída de julio. El histórico son PDFs en Drive.

**REGLA — la marca va IMPRESA en el documento, no solo en el nombre del fichero.** El
nombre del adjunto se pierde en cuanto el cliente lo abre; dos PDFs con cifras
distintas encima de la mesa siguen siendo indistinguibles sin ella. Va en la portada
("Propuesta Nº … · Versión 2" + "Esta versión anula y sustituye a las anteriores") y en
el pie de cada página. **La v1 no se marca**: un documento que solo ha salido una vez no
tiene con qué confundirse. `marcaVersion` entra en las dependencias del `useLayoutEffect`
que ajusta la portada — llega por fetch DESPUÉS de que el ajuste haya convergido, y sin
rearmarlo la línea extra desbordaría por debajo del pie negro.

**REGLA — qué versión aceptó el cliente se SELLA.** El enlace público es el mismo
siempre, así que quien recibió la v1 y entra hoy ve la v2 y la acepta sin saberlo. Se
graba `propuesta_version` en la entrada de aceptación del historial **y** `aceptada_at`
en la propia versión (las dos caras: el listado de versiones se lee sin el historial
delante). Y se le **dice en pantalla** antes de firmar: "Estás aceptando la versión 2…".

**REGLA — copiar el enlace de aceptación ES ENTREGAR la propuesta, y cuenta como tal.**
El botón de la barra de la vista previa da el MISMO `{APP_URL}/firma/{uuid}` que va dentro
del mensaje de envío, para pasárselo al cliente por donde estés hablando con él. Al otro
lado está el formulario de aceptación: en cuanto lo firma, la oportunidad pasa a ACEPTADA
y nace el expediente. Si copiar no dejara rastro tendríamos **una propuesta aceptada de la
que no existe copia**, la oportunidad habría saltado de PTE ENVIAR a ACEPTADA sin pasar por
ENVIADA (y sin mover su carpeta de Drive), y el enlace serviría una vista web vieja o
ninguna — `html_propuesta` solo lo escribe `send-proposal`, por el que aquí no pasa nadie.

Así que copiar hace lo mismo que un envío **salvo mandar el mensaje**: registra su versión
(archiva el PDF), guarda `htmlWeb` como `html_propuesta` y pasa a ENVIADA. El estado lo
cambia `PATCH /:id/estado` desde el front, **no la ruta de versión**: es la que además
sincroniza la carpeta de Drive (regla 2). En el historial se dice lo que de verdad consta
—"🔗 entregada por enlace"—, nunca "enviada": no sabemos si llegó ni a quién se lo pasó, y
quien lea eso dentro de tres meses no debe buscar un correo que nunca existió.

Se copia PRIMERO y se registra después, sin bloquear: `navigator.clipboard` necesita el
gesto del usuario y esperar a la red antes de escribir el portapapeles lo pierde en algunos
navegadores. Si el registro falla, el acuse dice "Copiado · sin registrar" — el enlace ya
está en el portapapeles y no puede presentarse como si no se hubiera copiado. ADMIN-only,
igual que el botón de enviar de esa misma barra: pasar el enlace es poner la propuesta en
manos del cliente y no puede tener menos control que mandarla. El acuse va en el propio
botón, no en un popup que habría que cerrar antes de poder pegar.

**El aviso de reenvío va ANTES de pulsar**, con a quién y cuándo se envió la anterior:
es el dato que cambia lo que le escribes en el mensaje. Y el historial pasa a decir
"📄 Propuesta v2 enviada por email + whatsapp a Cliente, Instalador · Cambios respecto a
la anterior: inversión 12.400 € → 11.900 €" — antes solo decía "ENVIADA", sin
destinatario ni canal, así que no servía para reconstruir la conversación. Los importes
(`inversion`, `caeBonus`, `irpfDeduction`, `totalAyuda`) se sellan por versión para poder
decir qué cambió sin recalcular ni rasterizar nada.

---

## Bot de WhatsApp — contesta a los chats ETIQUETADOS (2026-08-25)

Un asistente que responde por la MISMA sesión de WhatsApp del VPS con la que ya
salen los avisos de la app, y **solo en los chats que lleven la etiqueta**
`MOIA` (`BOT_WHATSAPP_ETIQUETA`). Contesta a lo que más se pregunta: **qué
documentación hay que aportar** y **cuál es el siguiente paso**. Todo lo demás
lo escala a una persona.

### Las tres piezas, y por qué están separadas

| Fichero | Responde a |
|---|---|
| [botPrompt.js](implementation/backend/services/botPrompt.js) | **QUÉ** contesta — el META PROMPT + el dossier redactado |
| [botContexto.js](implementation/backend/services/botContexto.js) | **CON QUÉ** contesta — teléfono → expediente → qué falta → enlaces |
| [botWhatsapp.js](implementation/backend/services/botWhatsapp.js) | **CUÁNDO** contesta — etiqueta, horario, agrupación, frenos |
| [botCerebro.js](implementation/backend/services/botCerebro.js) | La llamada a Gemini con `responseSchema` (gemelo del OCR) |

El prompt vive en su propio fichero porque **no es código**: es la formación del
asistente y se va a retocar diez veces más que la mecánica. Quien cambie lo que
dice toca `botPrompt`; quien cambie cuándo habla, `botWhatsapp`.

**REGLA — el prompt describe el PROCESO; los DATOS vienen del dossier.** Un
proceso escrito en el prompt envejece con el negocio; un dato metido en el
prompt nace mintiendo. "Qué falta" sale de `buildChecklistData` —el MISMO
barrido que ve el admin— y de `v_expedientes_lifecycle`; los enlaces, de
`ensureUploadLink`. Si el bot calculara su propia versión de lo que falta, le
diría al cliente algo distinto de lo que dice la app.

**REGLA — el bot NO habla de dinero.** Ni el bono, ni la inversión, ni cuándo se
cobra. El dossier ni siquiera lleva importes, así que la regla no depende solo
de que el modelo obedezca: no tiene el dato. Se redacta el dossier a mano en vez
de volcarle el expediente en JSON justamente por esto — un `JSON.stringify`
metería un importe en el prompt el día que alguien añada un campo, sin que nadie
tocara la regla.

**REGLA — al cliente se le nombran las cosas en LENGUAJE DE CASA.** Las
etiquetas del barrido las escribió un ingeniero ("Placa de la unidad interior /
DEPOSITO ACS") y con ellas casan el Anexo Fotográfico y el CIFO, así que no se
tocan; el bot las traduce con `labelCliente` (tabla `LABEL_CLIENTE` de
`reformaUploadService`, fuente única), y así le nombra las fotos **igual que la
pantalla a la que lo manda**.

**REGLA — las dos FASES no se mezclan, igual que en `DocsManager`.** Con el CEE
inicial sin registrar la obra ni siquiera puede empezar: pedirle la foto de la
máquina nueva instalada es pedirle una foto imposible, y una lista de tareas
imposibles hace que deje de mirar la lista entera. `fase_activa` parte los
pendientes en *ahora* / *más adelante*, y lo que es del instalador se separa de
lo que es del cliente.

**REGLA — con VARIOS asuntos abiertos, se PREGUNTA.** Un teléfono puede resolver
a varios clientes (medido: uno figura en 5 fichas) y un instalador tiene
decenas. Contestar por el primero es contestar por el equivocado la mitad de las
veces, así que el dossier viaja marcado `ambiguo` y el bot pide la dirección o
el titular antes de decir nada concreto.

### Los frenos — y por qué son innegociables

No es la API oficial: es la cuenta REAL pilotada por un Chrome. Si se bloquea,
**se cae con ella todo lo automático** (el parte diario, los encargos al
certificador, la entrega de los CEE directos).

- **Etiqueta** + `BOT_WHATSAPP_CHATS_PRUEBA` (lista blanca, para la fase de
  pruebas: se comprueba ADEMÁS de la etiqueta).
- **Horario 08:00-20:00 Madrid.** Fuera de él no contesta —un mensaje automático
  a las 23:40 delata al bot y además nadie puede recoger un escalado a esa
  hora—, pero **el mensaje no se pierde**: se guarda con `responder_after` en la
  próxima apertura. Por eso hay tabla y no un buffer en memoria como
  `uploadNotifier`: un reinicio nocturno se comería la pregunta.
  El horario se calcula **siempre contra el huso**, nunca con `getHours()`: el
  servidor va en UTC y España cambia de hora dos veces al año.
- **Ventana de silencio de 25 s.** El cliente manda "Buenas tardes" · la
  pregunta · "Gracias" en el mismo minuto (caso real): se agrupa en UNA fila y
  se responde una vez. Contestar al primero es contestar a un saludo.
- **Si un HUMANO ha escrito, el bot calla.** Los mensajes del bot también son
  `fromMe`, así que se distinguen por el TEXTO: lo que manda queda registrado, y
  un `fromMe` que no case con ninguna respuesta suya de las últimas 24 h es de
  una persona. Un `fromMe` posterior a la llegada del mensaje = alguien se
  adelantó → se descarta.
- **Tope diario** (`BOT_WHATSAPP_MAX_DIA`, 40) y **apagado por defecto**.
- **LISTA BLANCA de tipos de mensaje.** WhatsApp emite sus propias
  notificaciones de sistema (`e2e_notification`, `notification_template`,
  "se desactivaron los mensajes temporales") por el MISMO evento y con el cuerpo
  vacío. Con una lista negra, cualquier tipo nuevo de Meta despertaría al bot
  para contestar a un mensaje que el cliente no ha escrito.
- **Sin lista blanca de chats, el bot NO ARRANCA** (salvo `BOT_WHATSAPP_TODOS=true`).
  Salir del modo prueba tiene que ser una decisión escrita, no lo que pasa por
  descuido al poner `enabled=true`.

### El camino de entrada no puede colgarse — `scripts/test_bot_robustez.js`

Un mensaje entrante desemboca en llamadas a Puppeteer, y ese Chrome es el mismo
del que depende TODA la app para enviar.

**REGLA — NINGUNA llamada al cliente crudo va sin plazo** (`conPlazo`,
`BOT_WHATSAPP_PLAZO_WA_MS`). Una promesa que no resuelve nunca deja `barriendo`
en `true` y **el bot muere en silencio**: ni contesta ni avisa. Con plazo, lo
peor que pasa es que el mensaje se reintente en el barrido siguiente. Hay además
un cinturón (`BARRIDO_MAX_MS`) que libera el cerrojo si un barrido se eterniza.

**REGLA — se pregunta la etiqueta POR CHAT, nunca listando la etiqueta entera.**
`getChatsByLabelId` acaba en `Promise.all(chatIds.map(getChatById))`: hidrata un
objeto `Chat` completo por cada chat etiquetado, o sea 50 evaluaciones en
Puppeteer por consulta. `getChatLabels(chatId)` es UNA, y solo del chat que
acaba de escribir. La lista completa queda para el panel, bajo petición.
Se cachea con **TTL asimétrico**: 5 min el positivo (una etiqueta rara vez se
quita) y 60 s el negativo, que es el que decide cuánto tardas en ver efecto tras
etiquetar un chat — con 5 minutos parece que no funciona y acabas reiniciando el
backend para nada.

**REGLA — las consultas simultáneas se de-duplican** (`consultasEnVuelo`). Tres
mensajes seguidos del mismo cliente son el caso NORMAL, no el raro: sin esto,
disparan tres consultas idénticas a Puppeteer a la vez.

**REGLA — `encolar` va con CANDADO por chat.** Es un leer-y-luego-escribir, y
los mensajes que hay que agrupar son justamente los que llegan a la vez: dos que
entren en el mismo instante leen los dos "no hay fila abierta", insertan los dos
y **el cliente recibe dos respuestas a la misma pregunta**. Basta un candado en
memoria porque la sesión de WhatsApp es un singleton atado a un teléfono. El
barrido lo refuerza despachando **una fila por chat y vuelta**.

**REGLA — un fallo de lectura NO es un "no está etiquetado".** Si la sesión se
cae, `estaEtiquetado` devuelve `false` (ante la duda, callar) pero deja
`etiquetaCache.error` puesto, y `despachar` lo usa para NO descartar el mensaje:
se reintenta cuando WhatsApp vuelva. Y si ni siquiera se puede escalar (Supabase
o WhatsApp caídos), la fila se cierra como DESCARTADO en vez de reintentarse
cada 30 s para siempre.

**REGLA — "no está etiquetado" y "no he podido comprobarlo" no son lo mismo.**
Si la sesión se cae entre el barrido y la comprobación, la lista de chats viene
vacía; descartar ahí tiraría la pregunta de un cliente que sí estaba etiquetado.
Con `etiquetaCache.error` puesto, se espera al siguiente barrido.

**REGLA — la FIRMA la pone el código, no el modelo.** Aunque el prompt la pida,
la escribe distinta cada vez (con guion, sin negrita, en dos renglones), y en un
chat donde unas veces contesta una persona y otras el asistente esa línea es lo
único constante. `asegurarFirma()` limpia las variantes y pone la buena; al
prompt se le dice **que no firme**.

### De QUÉ obra habla — `botVinculos` + tabla `whatsapp_chat_expediente`

El teléfono dice QUIÉN escribe; no dice DE QUÉ. Medido el 2026-08-25 sobre
expedientes vivos: **219 de 257 teléfonos (85 %) resuelven a una sola obra**,
así que con los clientes el problema casi no existe. Pero el peor caso son **33
obras vivas en el mismo chat** (un instalador), y son justo los que más
escriben.

Tres procedencias, de más a menos fiable:

| Origen | Qué es | Vigencia |
|---|---|---|
| `manual` | Lo ha fijado una persona desde la ficha | no caduca |
| `conversacion` | El propio cliente ha dicho de qué obra habla | 8 h |
| `envio` | Le hemos escrito nosotros desde ese expediente | 72 h |

**REGLA — con un INSTALADOR, la pista de ENVÍO no decide.** Que le mandáramos un
aviso el martes desde una obra no dice por cuál de sus treinta pregunta hoy: se
le pregunta, que es lo que haría cualquiera. Sí valen las otras dos —lo fijado a
mano es una decisión tomada, y lo que él mismo acaba de decir es la respuesta
literal a esa pregunta—. Lo controla `elegir(..., { permitirEnvio })`, que
`botContexto` pone a `rol === 'cliente'`.

**REGLA — una obra elegida entre varias se ANUNCIA.** El dossier lleva
`elegidoPor` y `otrosAsuntos`, y el prompt obliga a empezar con "Sobre la obra
de X:" y a ofrecer el cambio. Una suposición que no se anuncia es una suposición
que el cliente no puede corregir: se le contesta por la obra equivocada y no se
entera ninguno de los dos.

**REGLA — cuando el cliente aclara de qué obra habla, se APRENDE y se vuelve a
pensar EN LA MISMA VUELTA.** El cerebro devuelve `asunto_elegido` (el número
entre corchetes del dossier), se siembra el vínculo y se rehace la respuesta. Si
no, a "la de Tomelloso, ¿qué me falta?" habría que contestarle "vale, ¿y qué
necesitas?" y hacerle repetir la pregunta que acaba de hacer.

**REGLA — el vínculo se siembra SOLO, desde los envíos que la app ya hace.**
`botVinculos.sembrarEnDiferido(tlf, oportunidadId)` en los avisos del expediente
y en "solicitar lo que falta". Va en `setImmediate` y **nunca lanza**: el aviso
al cliente es el trabajo, el vínculo es una comodidad.

Es una TABLA y no un campo en `expedientes` porque la relación es N:M en los dos
sentidos: un chat habla de varias obras (el instalador) y una obra puede tener
dos chats (el titular y el instalador). Un campo obligaría a elegir uno.

Rutas para la ficha (staffOnly): `GET/POST /api/expedientes/:id/whatsapp-chats`
y `DELETE .../:telefono`. Esquema en `scripts/bot_whatsapp_vinculos.sql`; test
en `scripts/test_bot_vinculos.js`.

**En la app va en SEGUIMIENTO**, al final
([ChatWhatsappVinculo.jsx](implementation/frontend/src/features/expedientes/components/ChatWhatsappVinculo.jsx)):
ahí es donde vive la comunicación con el cliente y el certificador, no en
Instalación (datos técnicos) ni en la cabecera (ya llena). Oculto al
certificador (`readOnly`), que no tiene por qué ver a qué número se le escribe.

**REGLA — los contactos se ELIGEN, no se teclean.** El `GET` devuelve además los
teléfonos que ya constan en el expediente (cliente, instalador y sus personas de
contacto, vía `resolveSolicitudContacto`) y se ofrecen como botones. Teclear un
móvil a mano es la forma más fácil de vincular el chat equivocado, y los buenos
ya están en la ficha. El campo manual se queda para el caso en que quien escribe
sea un número que no consta.

**REGLA — las tres procedencias se distinguen en pantalla** (Fijado · Aprendido ·
Automático). Una es una decisión y las otras dos son una conjetura con fecha de
caducidad: presentarlas igual haría creer que el bot tiene una certeza que no
tiene. Y **el botón de quitar va en las tres**, también en la automática: una
pista que apunta a la obra equivocada es justo lo que hay que poder borrar sin
esperar a que caduque.

⚠️ La validación del teléfono estaba SOLO en el navegador y el backend tragaba
`"123"` como chatId. `aChatId` aplica ahora el mismo criterio que
`whatsappService.normalizePhone` (9 dígitos → +34; con prefijo, 10-15) y devuelve
`null` si no cuela; la ruta lo traduce a **400**, no a 500 — un teléfono mal
tecleado no es una avería. `soltar()` NO valida, a propósito: hay que poder
borrar precisamente lo que se guardó mal.

⚠️ **Un 429 de Gemini NO escala** —sería mandarle al cliente un "te contesta un
compañero" porque hemos pedido demasiado rápido—: se reprograma el mensaje y
**se corta el barrido entero**, porque los siguientes chocarían con la misma
cuota. El manejo se mantiene aunque ahora casi no salte: ver "La API de Gemini
va en NIVEL DE PAGO".

---

## La API de Gemini va en NIVEL DE PAGO (2026-09-01)

Todo lo que lee documentos —`ceeOcrService`, `facturaOcrService`,
`catastroOcrService`, `loteOcrService` y el `botCerebro`— comparte la MISMA
`GEMINI_API_KEY`, la del proyecto **OCR CEE** (`gen-lang-client-0635030717`).

Ese proyecto está en **Nivel 1 (de pago)** desde el 01/09/2026. Antes estaba en
el nivel gratuito, y eso traía dos problemas:

**REGLA — el nivel gratuito NO puede usarse con documentos de clientes.** Las
condiciones de la API dicen que en los servicios no de pago "Google usa el
contenido que envías […] para mejorar sus productos" y que "revisores humanos
pueden leer, anotar y procesar" entradas y salidas. Por aquí pasan facturas con
NIF, informes de verificación con nombres y direcciones, y referencias
catastrales. En el nivel de pago Google se compromete expresamente a lo
contrario. **Si algún día se crea una key nueva, tiene que ser de un proyecto
con facturación**: una key "que funciona" puede estar mandando los documentos de
los clientes a un conjunto de entrenamiento.

**Y el límite del gratuito eran 20 peticiones**, que es lo que hacía saltar los
429 al encadenar lecturas (un informe + un dictamen + una factura de un lote ya
son tres).

**Coste medido** (Gemini 2.5 Flash, $0,30/1M entrada · $2,50/1M salida):

| Documento | Páginas | Entrada | Salida | Coste |
|---|---|---|---|---|
| Factura del verificador | 1 | 524 | 202 | 0,0006 € |
| Dictamen | 4 | 1.577 | 553 | 0,0016 € |
| Informe de verificación | 24 | 6.173 | 504 | 0,0027 € |

Leer los tres documentos de un lote sale por **medio céntimo**. El consumidor
grande es el bot de WhatsApp con su tope de 40 respuestas/día (~2 $/mes en el
peor caso); todo el OCR junto no llega a 0,50 $/mes.

Un PDF le cuesta a Gemini **258 tokens por página** (medido: 24 páginas → 6.173
tokens), y acepta el PDF directamente sin convertirlo a imágenes. Es la razón
técnica de que no compense mover esto a otro proveedor: los modelos económicos
equivalentes cuestan lo mismo y habría que reescribir cinco servicios.

### Etiquetas de WhatsApp desde la app — [whatsappLabels.js](implementation/backend/services/whatsappLabels.js)

Las etiquetas son de WhatsApp, no del bot: organizan la cartera (Pagado, EN
CURSO, RES080, SAT…) y una de ellas, además, enciende el asistente. Se gestionan
desde la **ficha del cliente**
([WhatsappEtiquetas.jsx](implementation/frontend/src/components/WhatsappEtiquetas.jsx)),
porque son del CHAT: el mismo teléfono es el mismo chat aunque tenga tres obras,
y es en la ficha del cliente donde se mira el teléfono.

Rutas: `GET /api/whatsapp/etiquetas` · `GET|PUT /api/whatsapp/etiquetas/:telefono`.

**REGLA — se guarda la lista COMPLETA, no la que cambia.** La operación de
WhatsApp es "deja el chat con exactamente estas etiquetas"; mandar solo una le
borraría al chat todas las demás, que son de otra persona y de otro trabajo.

**REGLA — se puede etiquetar SIN haber escrito nunca.** Una etiqueta se pone
sobre un chat, y dar de alta a un cliente y clasificarlo antes de hablar con él
es el caso normal. `asegurarChat()` usa `findOrCreateLatestChat`, lo mismo que
hace WhatsApp al abrir una conversación desde la agenda: **no se envía nada ni se
notifica al cliente**, solo aparece el chat vacío en la lista del móvil. Solo lo
hace el PUT: abrir una ficha (GET) no puede crear conversaciones.

**REGLA — el número se comprueba contra WhatsApp** (`queryWidExists`), nunca se
compone el id a mano. Etiquetar un id inventado **no da error**: no hace nada,
que es peor que fallar.

### Lo que WhatsApp rompió, y hay que saber (2026-08-25)

**⚠️ `getLabels()` de whatsapp-web.js NO FUNCIONA.** Todas las vías de la
librería (`client.getLabels`, `chat.getLabels`, `chat.changeLabels`,
`getChatsByLabelId`) pasan por `getLabelModel()`, que hace `label.serialize()` y
lee `label.hexColor`. WhatsApp cambió ese modelo y sale un error minificado que
literalmente pone `"r"`. Medido contra una cuenta Business con **16 etiquetas**:
la colección se lee perfectamente y lo que revienta es serializarla. Por eso
`whatsappLabels` lee `WAWebCollections` directamente. Es deuda a propósito:
cuando la librería publique el arreglo, se puede tirar. Lo mismo con
`fetchMessages()`, que dejaba `humanoHaIntervenido` devolviendo siempre null —
o sea, **la protección de no pisar a un compañero estaba muerta y no se notaba**.

**⚠️ Los chats ya no se llaman como el número: `@lid`.** WhatsApp está migrando
de `34612345678@c.us` a identificadores opacos (`71159068520593@lid`). Dos
consecuencias, las dos medidas:
- Escuchar solo `@c.us` deja al bot **sordo** con los chats migrados, y sin
  rastro de que ha pasado nada.
- **Al `@lid` no se le puede ENVIAR**: la cola agotaba los 5 reintentos con otro
  error minificado ("t") mientras el mismo texto al número salía a la primera.
  `destinoDe(fila)` manda siempre al teléfono. El `@lid` sirve para RECONOCER
  quién escribe, no para contestarle.
`getContactLidAndPhone` resuelve lid ↔ teléfono y se cachea de por vida del
proceso (un lid no cambia de dueño).

**⚠️ Las colecciones de WhatsApp Web tardan en cargar tras el `ready`.** Durante
los primeros segundos `Label.getModelsArray()` devuelve una lista VACÍA aunque la
cuenta tenga 16 etiquetas. Dar por buena esa respuesta grababa un "esta cuenta no
tiene etiquetas" para toda la sesión: el bot no contestaba a nadie y el log
afirmaba algo falso. La comprobación de arranque **no se marca como hecha hasta
que la respuesta es concluyente**, y una lista vacía se reintenta.

**⚠️ `requireAuth` NO exige sesión.** Si no hay token pone `req.user = null` y
deja pasar — sirve para SABER quién eres, no para exigirlo. Comprobado el
25/08/2026: unas rutas nuevas montadas con `requireAuth` servían las 16 etiquetas
de la cuenta a un `curl` sin cabeceras. Para cualquier cosa interna, `staffOnly`
o `adminOnly`. La regla 6 ("todas las rutas usan requireAuth o enforceAuth") se
lee mal si no se sabe esto.

**⚠️ `sendText()` ENCOLA, no envía.** Devuelve `{ok:true}` mucho antes de que
WhatsApp haya entregado nada, así que un RESPONDIDO en la bandeja del bot no
distingue "contestado" de "encolado y fallido" — el 25/08/2026 se dio por
entregada una respuesta que había muerto tras 5 reintentos. Se guarda el
`cola_id` en el contexto para poder contrastarlo con `whatsapp_queue`.

### Lo que llega con el backend PARADO — `recuperarPerdidos()`

El listener de WhatsApp solo existe mientras el proceso está vivo. Los mensajes
que entran durante un reinicio —y **hay uno en CADA deploy**— llegan al móvil
pero no pasan por la app: no queda ni rastro, y el cliente espera una respuesta
que nadie sabe que debe. Medido el 25/08/2026 durante las pruebas: un mensaje
real se perdió así.

Al arrancar se repasan los chats etiquetados y se recoge lo que quedó sin
atender. Con freno, porque despertar de golpe conversaciones viejas es peor que
el problema que se arregla:

- Solo mensajes de las últimas `BOT_RECUPERAR_HORAS` (6).
- **Solo si nadie contestó después** — se recorre el historial hacia atrás hasta
  el último mensaje NUESTRO; lo que haya después es lo que quedó colgando.
- Solo si no está ya registrado (se compara por FECHA, no por texto: el cliente
  repite y el texto es frágil).
- Tope de `BOT_RECUPERAR_MAX_CHATS` (25).

**Purga**: `whatsapp_bot_mensajes` se limpia de lo que pase de `BOT_PURGA_DIAS`
(120), cada 12 h. **Lo PENDIENTE no se borra nunca aunque sea viejo**: si algo
lleva meses atascado ahí, borrarlo es esconder el problema.

### Coste medido (2026-08-25)

- **En reposo**: UNA consulta cada 30 s con índice parcial. El índice de
  teléfonos es perezoso —solo se construye al llegar un mensaje—, así que sin
  tráfico el bot no consulta nada más.
- **Por mensaje**: `datos_calculo` pesa **86 KB de media** (5,3 MB el peor caso).
  Con el tope de 40 respuestas/día son ~6 MB diarios de egress. No compensa
  optimizarlo pidiendo subcampos: el riesgo de que falte uno y el checklist
  salga mal en silencio supera el ahorro.
- **Tamaño**: las dos tablas nuevas ocupan 176 KB sobre una base de 106 MB.

### Escalado

`ESCALAR` cuando: lo pide el cliente, pregunta por dinero o plazos, se queja,
manda una foto o un documento, quiere cambiar algo, o el dossier no da la
respuesta. Al cliente se le contesta SIEMPRE algo (dejarlo mudo mientras avisamos
por dentro es lo mismo que ignorarlo: él no ve nuestro aviso) y al staff le llega
WhatsApp (`WHATSAPP_ADMIN_CHAT`) + email (`ADMIN_EMAIL`) con lo que ha escrito y
el `wa.me` para responderle.

**Al escalar NO se promete canal ni plazo**: no se sabe quién lo va a coger ni
cuándo. Aunque el cliente pida que le llamen, se dice "se lo paso a un
compañero", nunca "te llamará".

Un fallo del modelo o de la red **también escala**: es lo que pasaría si el bot
no existiera, y así ninguna pregunta se queda sin contestar ni se reintenta en
bucle.

### Cómo se prueba SIN gastar mensajes

```bash
node implementation/backend/scripts/probar_bot_whatsapp.js 615492728
```

Construye el dossier de un teléfono real y pide la respuesta, **sin tocar
WhatsApp ni escribir en la bandeja**. Con `VER_DOSSIER=1` enseña el dossier, que
es lo primero que hay que mirar cuando una respuesta no convence: casi siempre
el problema no es cómo redacta, sino que le falta el dato. La misma prueba está
en `POST /api/whatsapp/bot/simular` (adminOnly).

### Rutas y esquema

```
GET  /api/whatsapp/bot/status             → activo, etiqueta, chats, contadores de hoy
GET  /api/whatsapp/bot/mensajes           → el log de conversaciones
POST /api/whatsapp/bot/refrescar-etiqueta → releer la etiqueta al momento
POST /api/whatsapp/bot/simular            → probar una respuesta sin enviarla
```

Tabla `whatsapp_bot_mensajes` (`scripts/bot_whatsapp_schema.sql`, RLS deny-all).
El log completo —pregunta, respuesta y con qué contexto— es innegociable: aquí
una máquina le habla a clientes reales en nombre de BROKERGY.

⚠️ **En LOCAL déjalo apagado** (`BOT_WHATSAPP_ENABLED=false`, que es el valor por
defecto). Encendido responde a CLIENTES REALES, igual que `CEE_ENTREGA_AUTO`.

---

## El menú lateral (2026-08-24)

Con la pestaña de CEE directos el menú pasó a **diez entradas** y dejó de caber:
medido, el `<aside>` ocupaba los 918 px de la pantalla y su contenido pedía 1035.
Como nada tenía `overflow`, los 117 px sobrantes —el perfil y el botón de Salir—
se **cortaban sin forma de llegar a ellos**.

**REGLA — el que scrollea es el `<nav>`, no el `<aside>`.** Lleva `flex-1 min-h-0
overflow-y-auto`; el `min-h-0` es imprescindible, porque sin él un hijo `flex-1`
no puede encoger y sigue empujando el pie fuera de la vista aunque le pongas
`overflow`. Cabecera y pie van `shrink-0`: son lo único que nunca debe moverse.

**El sitio salía de la cabecera y del pie, no de quitar pestañas**: el logo
ocupaba 176 px (el 19 % de la pantalla) y el pie 197. Ahora 112 y 168, y por
debajo de 820 px de alto el logo encoge solo (`[@media(max-height:820px)]`) —
cada píxel de logo en un portátil es una pestaña que se va detrás del scroll.

**Las entradas son una LISTA DECLARATIVA, no diez botones copiados.** Cuando eran
copias había que tocarlas una a una y la última (CEE directos) nació ya distinta
de sus hermanas. Se agrupan por para-qué sirven —lo del día · Cartera · Fichas ·
Ajustes— y **los rótulos solo salen si el menú es largo** (>6 entradas): a un
partner con tres opciones, tres cabeceras le estorban. Plegado no hay rótulos,
pero se conserva la separación entre grupos: es lo que hace reconocible la forma
del menú de un vistazo.

⚠️ **WhatsApp sigue FUERA del `<nav>`**, entre las pestañas y el perfil, con su
color de estado (regla 13). No moverlo ahí dentro.

### Cerrar sesión — el menú de la cuenta (2026-08-25)

Cerrar sesión vivía SOLO en un botón al fondo del sidebar, que es justo lo que se
salía de la pantalla cuando el menú no cabía. Y aunque quepa, el fondo de una
barra lateral no es donde nadie lo busca: en cualquier app se pulsa el AVATAR.

- **Fuente única**: [UserMenu.jsx](implementation/frontend/src/components/layout/UserMenu.jsx),
  abierto desde los DOS avatares — el bloque de perfil del pie del sidebar (que
  ya no abre la ficha de golpe: abre el menú, y el icono es un chevron, no un
  lápiz) y el avatar de la barra superior del móvil, donde antes había que abrir
  el cajón y bajar hasta el fondo. En móvil es **hoja inferior**, no popover.
- El botón rojo del pie **se conserva** y pasa a decir "Cerrar sesión": es la
  salida de un clic. También hay uno en "Mi perfil" (`AdminProfileModal`, y la
  ficha del partner cuando llega con `onSignOut`), que es donde se acaba cuando
  uno busca su usuario.

**REGLA — `signOut` limpia la sesión local PASE LO QUE PASE.** Era
`return supabase.auth.signOut()` a pelo: si esa llamada falla —token ya caducado
(`session_not_found`), sin red, Auth caído—, supabase-js rechaza y no siempre
limpia su almacenamiento; como el estado de React solo se vaciaba con el evento
`SIGNED_OUT`, que entonces no llega, **pulsar el botón no hacía nada**. Ahora el
`finally` borra el token de axios, la caché de perfil, las claves `sb-*` y el
estado, y limpia el deep-link de la URL (`?tab=`, `?exp=`, `?cee=`) para que la
siguiente sesión no aterrice en el expediente del anterior.

## Al instalador se le pide TODO de una vez (2026-08-27)

Al instalador se le piden dos cosas y en momentos distintos: **firmar el CIFO** y
**registrar el RITE** y devolvernos el certificado. Se pedían por separado, cada una
desde su popup y **con su propio enlace**. Un enlace por tarea es un enlace que se
pierde: el instalador abría el primero, resolvía lo que veía, y de lo otro no se
enteraba nadie hasta que alguien lo reclamaba por teléfono.

Ahora, al enviar cualquiera de los dos, la app **comprueba si el otro también falta**
y ofrece mandarlo en el MISMO mensaje — el mismo gesto que el Anexo I + Cesión con el
cliente.

### Fuentes únicas

| Qué | Dónde |
|---|---|
| ¿Qué le falta al instalador? + los TEXTOS de los tres mensajes | [logic/instaladorPendientes.js](implementation/frontend/src/features/expedientes/logic/instaladorPendientes.js) |
| El envío (adjuntos + email + WhatsApp + resultado por canal) | `POST /api/expedientes/:id/instalador/enviar` |
| Lo que ve el instalador | `/instalador/:id` → `SubirInstaladorView` + `FirmarCifoCard` / `SubirRiteCard` |

El backend importa `instaladorPendientes.js` por `import()` dinámico (igual que
`cifoService` con `cifoDoc.js`): lo consumen los DOS popups, la ruta de envío, la
página pública y el barrido de "qué falta". Si esa decisión se duplicara, el mensaje
prometería un documento que la página no pide — o al revés.

**REGLA — el `cert_rite_drive_link` es el CERTIFICADO RITE, no nuestra Memoria.**
`/memoria-rite/generate` guardaba ahí la Memoria (Word) que generamos NOSOTROS, que es
justo el campo donde la subida pública deja el certificado que devuelve el instalador.
Consecuencia medida sobre producción (**13 expedientes**): generar la memoria dejaba el
expediente diciendo que el RITE ya estaba aportado — y con él vía libre para emitir el
CIFO, porque "el CIFO no se emite sin RITE" era en la práctica "sin haber generado la
memoria". La memoria vive ahora en `memoria_rite_docx_link`. Para los expedientes
anteriores, `esMemoriaRiteEnDriveLink()` aplica la heurística (hay borrador generado y
no hay campo nuevo ⇒ ese enlace es la memoria) y **ante la duda asume que NO tenemos el
RITE**: ofrecer pedirlo de más lo corrige una persona con un clic; darlo por recibido de
menos deja el expediente parado sin que nadie se entere. Deshacer la ambigüedad de una
vez, leyendo el NOMBRE del fichero en Drive:

```bash
node implementation/backend/scripts/separar_memoria_rite_de_certificado.js --execute
```

**REGLA — nada se genera a espaldas de nadie.** El popup del RITE solo ofrece el CIFO si
YA existe su borrador (`cert_cifo_drive_link`): un CIFO que nadie ha revisado vuelve
firmado y hay que rechazarlo (regla 24). El popup del CIFO solo ofrece el RITE si el
expediente pasa `GET /memoria-rite/check` — la MISMA validación que el popup de
generación, la que evita memorias con huecos. Lo que no se puede mandar se dice POR QUÉ
en vez de desaparecer.

**REGLA — el adjunto del CIFO se DESCARGA DE DRIVE, no se vuelve a rasterizar.** Lo que
el instalador firma es el PDF que le sirve su enlace desde `cert_cifo_drive_link`. El
modal guarda primero (`replaceExisting`, y si falla NO se envía) y el backend adjunta ese
mismo fichero. Antes el email y el WhatsApp rasterizaban cada uno su propio HTML: tres
renders del mismo documento que podían no coincidir.

**REGLA — todo o nada.** Los adjuntos se preparan ANTES de mandar nada: un mensaje que
anuncia dos documentos y solo lleva uno deja al instalador buscando lo que no llegó. Si
el microservicio RITE está caído, se dice y se ofrece la salida (desmarcar el RITE).

**REGLA — se sella la fecha de envío de CADA documento que ha viajado**
(`cert_cifo_sent_at` y/o `borrador_cert_sent_at`). Sellar solo el del popup por el que se
entró dejaba el otro diciendo "sin enviar" el día después de mandarlo — y el parte diario
reclamándolo.

### Un CIFO firmado NO cierra la tarea para siempre (2026-09-03)

Tras un **requerimiento** se corrige el certificado y hay que firmarlo otra vez. Pero
`estadoInstalador` daba el CIFO por recibido con solo existir `cert_cifo_signed_link`,
así que el enlace que iba DENTRO de ese mismo correo —`/instalador/:id`— le decía al
instalador **"¡Todo recibido! No queda nada pendiente por tu parte"** y no le ofrecía
firmar nada. Medido en 26RES060_127 el 03/09/2026.

**REGLA — reenviarle el CIFO teniendo ya uno firmado ANULA esa firma.** `POST
/:id/instalador/enviar` sella `cert_cifo_refirma_at` cuando manda el CIFO y
`estado.cifo.firmado` ya existe —da igual la plantilla: si se lo vuelves a mandar es
que el que tienes no vale—, y con esa marca `cifo.recibido` pasa a false. La cierran las
DOS vías por las que puede llegar el firmado nuevo: la subida pública
(`POST /api/public/cifo-upload`) y cualquier escritura desde la app
([mergeDocumentacion](implementation/backend/utils/mergeDocumentacion.js), que además
sella `cert_cifo_signed_at`). El popup lo dice ANTES de enviar: es una consecuencia
irreversible del botón, no un efecto secundario.

**REGLA — el `_drive_at` NUNCA retrocede.** La vista del expediente reenvía
`documentacion` entera desde una copia hidratada al abrirla, así que un guardado
posterior traía el sello ANTERIOR y lo pisaba: medido en 26RES060_127, el borrador era el
de las 15:36 y `cert_cifo_drive_at` seguía diciendo 25/08. Con el sello atrasado, un
rechazo viejo vuelve a bloquear un borrador ya corregido (regla 24). `mergeDocumentacion`
se queda siempre con el máximo.

**REGLA — "firmado" y "firmado de ESTA versión" no son lo mismo, y se dice.** Con
`cert_cifo_signed_at` anterior a `cert_cifo_drive_at`, el borrador se regeneró DESPUÉS de
la firma: lo que guardamos es de una versión anterior (`cifo.firmaDesfasada`). No bloquea
—hay motivos legítimos para regenerar— pero sale avisado en la fila del CIFO: es lo que
explica un "me lo han firmado con la versión mal". Sin `cert_cifo_signed_at` (expedientes
anteriores a este sello) no se puede comparar y **no se afirma nada**.

**REGLA — el radar cuenta la re-firma como firma pendiente.** `detectarFirmaPendiente`
salía por `if (signed) continue`, así que el reenvío de una re-firma no lo vigilaba nadie
y podía quedarse meses sin que el parte diario dijera una palabra.

⚠️ El saludo salía **"Hola Otro,"**: `Otro contacto…` es el rótulo del BOTÓN, no el nombre
de nadie. `primerNombre` descarta los nombres genéricos y saluda en genérico.

### La página del instalador — `/instalador/:id`

Un enlace, todas sus tareas. **Solo se enseña lo que QUEDA**: lo ya recibido baja a una
línea con su ✓ (es la prueba de que llegó, que es lo primero que se pregunta, pero no
puede ocupar el sitio de lo que falta). La primera pendiente se abre sola.

**REGLA — la superficie de cada tarea es la MISMA que la de su página suelta.**
`FirmarCifoCard` y `SubirRiteCard` se comparten con `/subir-cifo` y `/subir-rite`, que
siguen vivas porque sus enlaces ya viajan en mensajes enviados y en los recordatorios del
parte diario. Si aquí se firmara distinto que allí, un CIFO rechazado se podría volver a
firmar por el camino que no lo comprueba.

**La memoria firmada solo se le pide si alguna vez le mandamos una** (`pide_memoria`):
pedirle "la memoria que os enviamos, firmada" a quien no ha recibido ninguna es pedirle
un documento que no existe.

---

## El Certificado RITE se LEE al subirlo (2026-09-03)

Las fechas de PRUEBAS del Certificado de Instalación Térmica se tecleaban mirando el PDF
—y cuando no se tecleaban, la app las CONJETURABA desde las facturas: en una reforma la
primera factura puede ser la de las ventanas, así que el CIFO acababa fechado en una obra
que no es la instalación térmica—. Ahora se sueltan el certificado y la app lo archiva, lo
enlaza y lo LEE, igual que una factura de obra.

| Qué | Dónde |
|---|---|
| Lectura (prompt + esquema + recorte de páginas) | [riteOcrService.js](implementation/backend/services/riteOcrService.js) |
| Juicio y escritura (fechas, cruce con el expediente) | [riteCertificado.js](implementation/backend/services/riteCertificado.js) |
| Ruta del admin | `POST /api/expedientes/:id/rite/ocr` (multipart `files[]`), **staffOnly** |
| Subida del instalador | `POST /api/public/rite-upload/:id` — lee en `setImmediate`, sin que espere |
| Superficie | Fila **Certificado RITE** de `DocumentacionModule` (soltar, botón, o "Leer el de Drive") |
| Prueba sin escribir nada | `node scripts/probar_rite_ocr.js <driveFileId\|ruta.pdf> [nº expte]` |

**REGLA — solo se envían a leer las DOS PRIMERAS PÁGINAS.** A Gemini un PDF le cuesta **258
tokens por página** y estos certificados llegan con los acuses de recibo electrónicos
detrás (2,3 MB medidos): son páginas que no dicen nada de lo que se busca y se pagan igual.
El impreso oficial cabe entero en la primera. Medido sobre tres certificados reales:
**642 tokens de entrada y ~3 s**, unos **0,0005 €** por lectura. Si el recorte falla (PDF
cifrado o roto) se manda entero: leer de más cuesta céntimos, no leer no cuesta nada pero
tampoco sirve.

**REGLA — el modelo solo LEE; el juicio es del código.** Qué fecha se anota, si el
emplazamiento cuadra y qué se avisa lo decide `riteCertificado.js`, determinista y con las
dos cifras citadas. Mismo reparto que en las facturas de obra (`facturaIncidencias`).

**REGLA — las fechas se piden como TEXTO `dd/mm/aaaa` y las convierte `aISO()`.** Un `date`
pedido al modelo llega en el formato que le parezca, y una fecha de pruebas mal leída viaja
hasta el CIFO. Mismo motivo que los importes del OCR de lotes.

**REGLA — se anota la ÚLTIMA de las fechas de pruebas.** El impreso trae hasta ocho casillas
y lo normal es que lleven todas la misma; cuando no, la instalación no está probada hasta
que pasa la última, que es además la que `calcCifo` usa como fecha de fin.

**REGLA — se rellenan HUECOS, nunca se pisa lo escrito.** `resolveFechasRite` dice que lo
marcado a mano MANDA, y de esa fecha cuelgan las de inicio y fin de actuación del CIFO:
sustituirla en silencio por lo que lea una máquina es cambiar un documento que puede estar
ya presentado. Si difiere, se enseñan las dos y hay un botón "Usar la del certificado".

**REGLA — la comprobación del emplazamiento AVISA, no bloquea.** El impreso escribe la vía
como la tiene registrada Industria ("CALLE GARCÍA MORATO NUM: 30") y el expediente como la
escribió el Catastro: que no casen letra a letra es lo normal. Se compara por palabras
distintivas y por el NÚMERO DE PORTAL, que es lo que separa dos viviendas de la misma calle
—medido en 26RES080_62: el certificado dice el nº 9 y el expediente el 7—, y la referencia
catastral por sus 14 primeros caracteres. Lo esperado sale de `buildCertClienteData`, que
ya es la fuente única de la dirección de instalación: no se duplica aquí esa cascada.

**REGLA — lo leído viaja en el aviso al staff y se queda en el expediente.** La subida del
instalador ya mandaba un WhatsApp + email: ahora ese MISMO mensaje lleva la fecha anotada y
lo que no cuadra (no un aviso nuevo, ver el parte diario). Y la huella queda en
`documentacion.rite_ocr` —solo metadatos, regla 21—, porque una comprobación que se ve una
vez y se pierde al cerrar el popup no sirve de nada.

**Soltar un PDF en esa fila es soltar el CERTIFICADO.** Antes la fila lo recogía como
`cert_rite_signed_link`, que es la *memoria firmada* —el documento de al lado—. El fichero
va a `7. LEGALIZACION RITE` con el nombre canónico y al slot `cert_rite_drive_link`, por el
MISMO camino que la subida del instalador.

---

## La FECHA DE REGISTRO del CEE se LEE del justificante (2026-09-07)

Al subir el justificante de registro, la app sellaba
`documentacion.fecha_registro_cee_{fase}` con el **día de la subida**. Eso solo es
verdad cuando el técnico lo sube el mismo día: en cuanto se sube un registro viejo
—un expediente que se pone al día, un migrado, un certificado que llevaba semanas en
el correo— el expediente afirma que se registró hoy.

No es un dato decorativo. De la fecha de registro del CEE inicial cuelgan el plazo de
la obra, el **devengo de la facturación del certificador** (que factura por hito de
registro, no por expediente) y la comprobación de que **las facturas no son anteriores
al registro** (`facturaIncidencias`). Una fecha inventada marca errores que no lo son
y esconde los que sí.

La fecha está IMPRESA en la primera página del justificante:

> «Este es el número de registro 3014080/2025 solicitado el 19/07/2025 a las 09:35:54»

| Qué | Dónde |
|---|---|
| Lectura (prompt + esquema + recorte a la 1ª página) | [registroCeeOcrService.js](implementation/backend/services/registroCeeOcrService.js) |
| Superficies que la sellan | rejilla del CEE (`/documents/upload`, CAE y directos) · enlace público del certificador (`/cee-upload`, `/cee-directo-upload`) |
| Releer un justificante YA subido | `POST /:id/cee/fecha-registro/leer` (**staffOnly**) — declarada en las DOS rutas del módulo CEE |
| Botón | ⟳ junto al campo **Registro** de la rejilla, solo si hay justificante |
| Corregir lo ya sellado | `node scripts/releer_fechas_registro_cee.js [--execute] [--expte=…]` |
| Probar sin escribir nada | `node scripts/probar_registro_cee_ocr.js <driveFileId\|ruta.pdf> [nº expte]` |

**REGLA — el modelo solo LEE; la fecha la decide el código.** `resolverFechaRegistro`
es determinista: pide al modelo la **frase literal** de donde sale la fecha y
**reextrae la fecha DE ESA FRASE** (`fechaDesdeFrase`), que manda sobre el campo que
el modelo haya aislado. Un justificante trae varias fechas —emisión, firma, validez,
descarga— y aislar la buena es justo donde un modelo se equivoca; copiar la frase
entera, no. Además esa frase es la EVIDENCIA: es lo que se le enseña al usuario para
que la contraste sin abrir el PDF.

**REGLA — una lectura que falla NUNCA tira la subida.** Si el justificante no se
puede leer, o la fecha es futura, o es anterior a 2007 (el CEE nace con el RD
47/2007, así que eso no es una fecha de registro sino una lectura mal hecha), se cae
a la fecha de subida —el comportamiento de siempre— **y se dice**. El fichero ya está
archivado y la fase tiene que quedar registrada: dejarla sin sellar por no poder leer
un PDF sería cambiar un dato dudoso por un expediente parado.

**REGLA — solo se envía la PRIMERA PÁGINA.** A Gemini un PDF le cuesta 258 tokens por
página y detrás del justificante vienen los acuses de firma electrónica, que no dicen
nada de lo que se busca y se pagan igual. Medido sobre justificantes reales: **664
tokens de entrada y ~2,6 s**, unos **0,0003 €** por lectura.

**REGLA — al releer un justificante ya subido solo se PROPONE.** La fecha que consta
puede haberla corregido una persona a mano, así que el botón enseña las dos fechas y
la frase citada y decide el usuario; entonces la escribe `setCeeDate`, **el mismo
camino que teclearla**, para que no haya dos formas de guardar la misma fecha (la
ruta sabe escribir con `aplicar: true`, y de eso tira el barrido). Mismo criterio que
el OCR del RITE: se rellenan huecos, no se pisa lo escrito.

**REGLA — con la fase ya REGISTRADA solo se rellena el HUECO.** `markCeeRegistradoFromUpload`
no repite la transición ni el email, pero si la fecha está en blanco (migrados,
sellados a mano) y ahora sí la tenemos leída, la escribe: eso es un hueco, no una
corrección.

Es un **gemelo pequeño** de [riteOcrService.js](implementation/backend/services/riteOcrService.js),
del que reutiliza `primerasPaginas` y `aISO` — es la misma conversión de fecha y la
misma razón para recortar, y tenerla dos veces es tenerla mal el día que se corrija
una sola.

---

## Quién EJECUTA la obra y quién FIRMA ante Industria (2026-08-26)

Un instalador no habilitado en Industria delega la firma en otra empresa
(`prescriptores.instalador_rite_id`, ver `utils/instaladorFirmante.js`). Hasta ahora los
documentos salían solo a nombre del firmante, y entonces **el NIF del certificado no casaba
con el de las facturas del expediente**: quien las emite es el instalador asignado. Medido en
26RES080_62 — factura FELIX DIAZ GALVEZ (03892673S), firma OSCAR REDONDO MARTIN (52977772D,
RITE 08-B-D20-46001724).

**REGLA — cuando son DOS empresas, las dos constan; cuando es una, solo una.** La segunda no se
inventa: `empresasActuacion(exp)` en
[docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js)
devuelve `{ delegado, ejecutora, habilitada }` y `delegado` solo es true con delegación efectiva
(el backend únicamente entrega `prescriptores_firmante` en ese caso). Los rótulos de columna y el
texto de responsabilidad son **fuente única** ahí mismo (`EMPRESAS_COL_*`, `notaDelegacionRite`):
el verificador compara el CIFO con el certificado RES080 y no pueden decirlo distinto.

| Documento | Cómo lo imprime |
|---|---|
| **Certificado RES080** | Apartado propio: tabla a dos columnas con razón social y CIF/NIF, y debajo el párrafo. `buildEmpresasBox` en [res080Doc.js](implementation/frontend/src/features/expedientes/logic/res080Doc.js), compartido con `CertificadoRes080Modal` |
| **CIFO (RES060/093/TER100)** | Las mismas cuatro filas de siempre: el nº RITE viaja con la razón social y la fila "Cargo firmante" deja el sitio a "Ejecuta y factura la obra". La nota va al pie de la hoja de la instalación |

**REGLA — el PÁRRAFO se escribe también cuando hay UNA sola empresa**, con su nº RITE: es lo que
deja constancia de que quien ejecuta es además quien firma y con qué inscripción. Por eso el
domicilio y el nº RITE salieron de la tabla del RES080 —en columnas estrechas eran dos bloques de
texto envuelto que repetían lo que el párrafo dice mejor— y ahí quedan solo razón social y NIF.
`notaDelegacionRite` devuelve **''** si no consta el nº de empresa RITE: el documento no puede
afirmar una inscripción que no tiene a la vista. (El CIFO sigue imprimiendo el párrafo solo con
delegación; su hoja 1 no da para más.)

**REGLA — en el CIFO el bloque NO puede crecer.** La hoja 1 es la más apretada del documento
(+43px de holgura en el peor caso medido) y ahí está anclado el recuadro de firma. Una tabla a
dos columnas la desbordaba 58px, y con un segundo bloque, 163. Por eso son cuatro filas y el
cargo del firmante se lee dentro del propio recuadro de firma, al pie de esa hoja.

**REGLA — el certificado RES080 tiene su propio medidor**, `scripts/check_res080_paginas.mjs`,
gemelo del del CIFO. Al escribirlo se descubrió que la hoja de la instalación **ya desbordaba
antes de este cambio**: con 3 bombas en cascada se pasaba 110px y con 5, 140 (los nº de serie se
listan uno por línea, y otra vez en la tabla de ACS). Se partió en dos hojas —instalación ·
empresas + observaciones— con el mismo criterio que el CIFO: el corte NO es condicional. Las
llamadas (1)(2)(3) quedan en la hoja anterior, así que ésta lleva una línea que remite a la
siguiente. Pasar los DOS medidores tras cualquier retoque:

```bash
node implementation/backend/scripts/check_res080_paginas.mjs
```

⚠️ La Memoria RITE y el Certificado de Instalación Térmica (microservicio Python) siguen saliendo
SOLO a nombre del firmante: ahí es correcto, son documentos que se presentan ante Industria y de
los que responde la empresa habilitada.

---

## Deducción del IRPF — ¿vale el par de certificados? (2026-08-27)

Recuadro en el módulo CEE, debajo de la rejilla, **solo cuando el expediente tiene
las DOS fases** (en un CEE directo de alcance ÚNICO no se pinta: sin el CEE de
después no hay nada que comparar). Sale en los dos negocios: CAE y CEE directos.

Lo que exige la norma (DA 50ª de la Ley del IRPF, RDL 19/2021) para la deducción
de la vivienda: reducir el **consumo de energía primaria no renovable** al menos un
**30 %**, **o** llegar a **letra A o B** en la escala de ESE indicador. Basta una.
Fuente única: [logic/irpfEpnr.js](implementation/frontend/src/features/expedientes/logic/irpfEpnr.js).

**REGLA — la letra que cuenta es la del CONSUMO, no la de EMISIONES.** El
certificado trae las dos y a menudo no coinciden: medido en `25RES060_71`, el CEE
final es **B en emisiones y C en consumo**. Mirar la de emisiones daría por bueno
un expediente que no cumple.

**REGLA — `<EnergiaPrimariaNoRenovable>` aparece DOS veces en el XML.** Dentro de
`<Consumo>` es el número (kWh/m²·año); dentro de `<Calificacion>`, la letra y su
`<EscalaGlobal>`. Un `getElementsByTagName` sobre el documento devuelve las dos y
se cogería la que caiga primero: hay que acotar por el padre. Y la letra es hija
DIRECTA — con `getElementsByTagName('Global')` se cogería el `<Global>` numérico
de dentro de `<EscalaGlobal>`.

**REGLA — el `.xml` GUARDADO en BD no lo puede releer `parseCeeXml`.** El
`normalizeData` del backend deja `cee.xml_inicial`/`xml_final` **enteros en
MAYÚSCULAS**, y ahí `parseCeeXml` falla por dos motivos: busca los tags con
mayúsculas exactas (`<Demanda>` ≠ `<DEMANDA>`) y, antes de eso, `DOMParser`
rechaza el documento COMPLETO porque `<?XML VERSION="1.0"?>` no es un prólogo
válido. Por eso existe **`parseEpnrFromXml`**, que quita la declaración, busca sin
distinguir mayúsculas y **nunca lanza**. No se tocó `parseCeeXml` —del que
dependen la calculadora, el CIFO y el RES080— por un dato nuevo.

Sin ese rescate la comprobación solo valdría para lo que se suba a partir de hoy:
los certificados ya subidos tienen en `cee_inicial`/`cee_final` un objeto parseado
**sin** este dato. Con él funciona sobre los **59 pares** que ya hay en producción
(58 cumplen; `26RES060_134` no, porque tiene el MISMO xml en las dos fases).

**REGLA — esto INFORMA, no decide.** Que el certificado cumpla el requisito
técnico no es que al cliente le corresponda la deducción: hay plazos de expedición,
base máxima anual y la situación de cada declaración. El texto habla del
certificado ("el ahorro certificado es del 41,6 %") y **no viaja en la entrega al
cliente** — afirmarle por escrito que tiene derecho a un dinero es otra cosa.

Se avisa además si las **superficies de los dos certificados no casan** (>2 %):
el indicador es por m², así que si una está mal el porcentaje compara dos edificios
distintos. Medido en `26RES060_153`: 91 m² frente a 123 m².

---

## Las cifras del lote se LEEN de sus documentos (2026-09-01)

Dos números del lote se tecleaban a mano, y por eso faltaban: el **coste de la
verificación** y el **ahorro verificado de cada expediente**. Los dos vienen impresos
en un PDF que ya subimos al lote.

| Qué | De dónde sale | Dónde acaba |
|---|---|---|
| Coste de verificación | **Factura del verificador**, su BASE IMPONIBLE | `lotes.coste_verificacion` + `documentos_so[factura_verificador].importe` |
| Ahorro verificado **e inversión** | **Informe de verificación**: de cada bloque "N. ACTUACIÓN A VERIFICAR", su "Ahorro anual conseguido (kWh)" y su "Inversión de la actuación sin IVA (€)" | `expedientes.instalacion.verificacion.ahorro_verificado_kwh` / `inversion_verificada_eur` |
| Nº de dictamen, fecha, referencia del informe y ahorro dictaminado | **Dictamen**, apartados 3, 7, 9 y 10 | `documentos_so[dictamen_favorable].dictamen` (se enseña en el Resumen del lote) |

| Qué | Dónde |
|---|---|
| Lectura (prompts + esquemas + parseo) | [loteOcrService.js](implementation/backend/services/loteOcrService.js) |
| Casación, contraste y escritura | [loteVerificados.js](implementation/backend/services/loteVerificados.js) |
| Rutas | `POST /:id/documentos/:slot` (lee al subir) · `POST /:id/ahorros-verificados/leer` · `POST /:id/ahorros-verificados` · `POST /:id/dictamen/leer` · `POST /:id/dictamen/aplicar` |
| Revisión | `AhorrosVerificadosModal.jsx`, desde la fase 4 de `LoteProcesoFases` |
| Prueba sin tocar nada | `node scripts/probar_lote_ocr.js <factura\|informe\|dictamen> <driveFileId> [loteId]` |

**REGLA — el modelo solo LEE; el juicio es del código.** A qué expediente corresponde
cada actuación, si la factura es de este lote y si las cifras cuadran lo deciden
funciones deterministas en `loteVerificados.js`, con sus avisos citados. Es el mismo
reparto que en las facturas de obra (`facturaIncidencias.js`).

**REGLA — los números se piden como TEXTO y los convierte `numeroEs()`.** Pedidos al
modelo como NUMBER, el punto de miles español se lee como decimal y "28.852" entra
como 28,852: tres órdenes de magnitud de error en el número con el que se paga a un
cliente. La conversión es determinista y está probada sobre los formatos reales.

**REGLA — el ahorro verificado se PROPONE, nunca se escribe solo.** Se lee al subir el
informe, se casa contra los expedientes del lote y se abre la revisión; aplica el
ADMIN. Sobre esa cifra se factura al S.O. y se le paga el bono al cliente, y una
transferencia hecha no se deshace. **Lo que no casa no se puede ni marcar**: adivinar a
qué expediente se parece una actuación es la forma de pagarle a un cliente el ahorro de
otro. Los lotes cuyo informe se subió antes de esto tienen "Leer los ahorros del
informe", que lo baja de Drive y lo relee.

**REGLA — se contrasta la suma con el total que declara el propio informe.** Se avisa,
no se bloquea: hay informes reales que no cuadran consigo mismos — medido en el
CAE-1601, sus cinco actuaciones suman 350.399 kWh y su total dice 350.339.

**REGLA — UNA sola revisión escribe las dos cifras.** El informe trae el ahorro Y la
inversión de cada actuación, y son las mismas que imprime el dictamen (medido en el
CAE-1601: idénticas en los dos papeles). Eran dos pantallas para dos números que vienen
juntos. El dictamen queda para lo que aporta en exclusiva —su nº y su fecha— y para
CONTRASTAR: si sus cifras coinciden con lo registrado, **no abre nada** (`sinCambios`);
solo pide revisión cuando algo difiere, que es cuando hace falta que alguien mire.

**REGLA — el dictamen NO puede ir solo.** Su tabla no cita el número de expediente, así
que sin el informe no hay forma de saber de quién es cada fila. El informe sí puede: es
el único documento que las identifica.

**REGLA — `aplicarAhorrosVerificados` FUNDE `verificacion`, no la reemplaza.** El sello
del dictamen y el del informe se escriben en momentos distintos y sobre la misma clave;
un reemplazo hacía que registrar el informe después del dictamen se llevara por delante
su nº y su fecha.

**REGLA — la INVERSIÓN del dictamen es la definitiva.** La declarada al principio
puede haberse corregido en un requerimiento, y la que vale es la que el organismo da
por buena. Se guarda en `instalacion.verificacion`, **no pisa `documentacion.facturas[]`**
—que es el registro de lo que de verdad se facturó— y la pantalla avisa cuando difiere.
Medido en el CAE-1601: `25RES060_75` tenía 6.930 € y el dictamen fija 6.080 €, que es la
corrección de su inexactitud nº 10 (un kit solar facturado junto a la bomba de calor,
ajeno a la ficha RES060).

**REGLA — los números de expediente se comparan SIN NINGÚN separador**, solo letras y
dígitos (`normNum`). El PDF escribe el mismo número de varias formas dentro del MISMO
documento: medido en el informe del CAE-1490, "25RES060_65" en unas actuaciones y
"25RES060 70" (con espacio) en otras, según cómo caiga el guion bajo al extraer el texto.
Conservando el `_`, tres de cinco expedientes salían como "no existe en este lote" — y
parecía un fallo del OCR, que había leído bien. Sin el separador el número sigue siendo
único ({AA}{FICHA}_{N}).

**REGLA — leer un PDF SE VE.** Tarda entre 6 y 14 s; sin señal el usuario cree que el
botón no ha hecho nada y vuelve a pulsar. Las tres lecturas usan el overlay estándar
(`SendActionOverlay`) con el icono **`read`**: la lupa recorre la hoja. No vale el de
subida — el fichero ya está ahí, y la nube haría pensar que sigue viajando. Del overlay
se pasa DIRECTO a la revisión cuando la hay: un "listo" que hay que cerrar para que
aparezca otra pantalla es un clic de peaje.

**REGLA — el dictamen se casa por el AHORRO, nunca por el orden.** Su tabla NO cita el
número de expediente: solo el código de ficha, que se repite (RES060, RES060, RES060,
RES080, RES080). Lo único distintivo de cada fila es su ahorro, que se compara contra el
verificado que dejó el informe. Por eso, **sin ahorros verificados no se propone nada** y
se dice qué hacer antes: casar por orden sería adivinar, y una inversión en el expediente
equivocado es la cifra que luego viaja al Anexo y al verificador. Si dos expedientes del
lote comparten ahorro, tampoco se casa ninguno.

**El dictamen es lo ÚLTIMO que llega**: su nº y su fecha no existen hasta que la
verificación termina, así que el bloque del Resumen solo aparece cuando ya está subido.

**REGLA — el modal de revisión es UNO con dos modos** (`informe` | `dictamen`). El gesto
es idéntico —revisar lo leído, casado contra los expedientes, y aplicarlo— y lo único que
cambia es qué número se escribe. Dos modales gemelos acabarían divergiendo justo en la
parte delicada, que es la de los avisos.

**REGLA — el nombre del fichero lleva el CÓDIGO DEL LOTE**: `4.2 Informe de Verificación
LOTE-2025-003.pdf`. Fuera de su carpeta —descargado, adjunto a un correo, encima de un
escritorio— "4.2 Informe de Verificación.pdf" no dice de qué lote es, y todos los lotes
generan un fichero con ese mismo nombre. Lo pone `nombreDocLote(slot, { codigo })`; el
firmado lo hereda del borrador. Para renombrar lo ya subido:
`node scripts/reorganizar_docs_lote.js --execute` (dry-run sin `--execute`).

**REGLA — la factura del verificador se coteja con SU lote.** Cita su `CAE-####` y su
nº de pedido (`LOTE-2025-002`), y la emite un NIF que ha de ser el del verificador del
lote. Subir la de otro lote emparejaría el coste con los expedientes equivocados y con
él el €/MWh que se le presenta al S.O. Avisa, no bloquea (mismo criterio que
`verificarEmisor` en la facturación del certificador).

**REGLA — se usa la BASE IMPONIBLE, nunca el total con IVA.** Todos los importes de la
app van sin IVA; caer al total inflaría el coste del S.O. un 21 %.

**REGLA — NO se paga a un cliente sin su ahorro VERIFICADO.** `PATCH /:id/estado`
rechaza con 409 el paso a `PTE. PAGO BROKERGY A CLIENTE` y a `FINALIZADO` si algún
expediente del lote no lo tiene (`puedePagarseAlCliente`), y dice cuáles faltan. La
fase 4 lo anuncia antes ("Ahorro verificado en 0 de 5 expedientes") para no enterarse
al intentar cambiar el estado.

**Menos scroll en Documentación**: las fases YA HECHAS van plegadas a una línea —que
sigue diciendo cuántos documentos guarda y si hay alguno por revisar— y se abren con un
clic. Con las seis abiertas, un lote en la fase 5 obligaba a bajar por cuatro bloques de
papeleo terminado. **Una fase con algo PENDIENTE no se pliega** aunque su papeleo esté
completo (la 4, mientras falte el ahorro verificado o la factura): plegarla escondería
justo lo único que hay que hacer. Un firmado "por revisar" no abre la fase — se anuncia
en la línea plegada, y abrirla entera devolvería el scroll que esto viene a quitar.

---

## El ANEXO del MITECO por actuación (2026-09-01)

El impreso que va dentro de cada ZIP `ActuacionE{n}` de la solicitud de emisión de CAE.
Se hacía a mano: 15 campos por expediente, cinco por lote.

**REGLA — no se REPLICA el impreso: se RELLENA el oficial.**
`backend/plantillas/AnexoActuacionEstandarizada.pdf` es el formulario del Ministerio con
sus **33 campos vivos**. Escribir dentro de él es la única forma de que el escudo, la
**GillSansMT** de la cabecera, la **Calibri** del cuerpo (8/11/14pt — NO es la Arial de
las fichas RES), los márgenes y las cuatro notas al pie sean exactamente los suyos.
Rehacerlo en HTML sería imitar un documento que ya tenemos, y quien lo revisa compara
contra el modelo oficial.

**REGLA — el título de la ficha se ELIGE del catálogo.** "Código de ficha" es un
desplegable con las 115 fichas oficiales: se selecciona la opción, así que el texto es
literalmente el del Ministerio. `FICHA_CATALOGO` guarda las cuatro nuestras copiadas tal
cual; para añadir otra, `getDropdown('Código de ficha').getOptions()` las lista.

| Qué | Dónde |
|---|---|
| Relleno, formato y validación | [anexoActuacionService.js](implementation/backend/services/anexoActuacionService.js) |
| Ruta (los 5 del lote de una vez) | `POST /api/lotes/:id/anexos-actuacion` (**adminOnly**) |
| Botón | Fase 5 de `LoteProcesoFases` — "Generar anexos para MITECO" |
| Destino | La carpeta **`E{n}` del propio expediente**, como `{expediente} - AnexoE{n}.pdf` |
| Regenerar en bloque | `node scripts/generar_anexos_lote.js <LOTE> [--dry]` |

**De dónde sale cada dato** — todos de Supabase, y los que faltaban son justo los que se
incorporaron estos días:

| Campo | Origen |
|---|---|
| Nº de actuación (`Nº E 3`) | `instalacion.verificacion.orden_actuacion` — el orden con que el INFORME numera las actuaciones. Se guarda al registrar sus ahorros |
| Ahorro anual · Inversión | `verificacion.ahorro_verificado_kwh` / `inversion_verificada_eur` — los VERIFICADOS |
| Vida útil | `verificacion.vida_util_anios`, con respaldo por ficha (15 · RES080 25) |
| Identificación y fecha del dictamen | `documentos_so[dictamen_favorable].dictamen` del LOTE: uno cubre las cinco actuaciones y las cinco lo citan |
| UTM, referencia catastral | `instalacion.coord_x/coord_y/ref_catastral` |
| Fechas de ejecución | `documentacion.fecha_inicio_cifo` / `fecha_fin_cifo` (coinciden con las del informe de verificación) |
| CNAE | `4322` siempre |
| Ayudas públicas | "NO se ha solicitado", lo mismo que declara el Anexo I que firma el titular |

### La SOLICITUD de emisión sale del MISMO botón

La carátula del envío: un impreso por LOTE que declara quién solicita, el ahorro
total y una fila por actuación con su ficha y su ahorro. Va a la carpeta de
documentación del lote; los anexos, a la `E{n}` de cada expediente.

| Qué | Dónde |
|---|---|
| Relleno y validación | [solicitudCaeService.js](implementation/backend/services/solicitudCaeService.js) |
| Plantilla | `backend/plantillas/SolicitudEmisionCAE.pdf` (42 campos vivos) |
| Prueba sin subir nada | `node scripts/probar_solicitud_cae.js LOTE-2025-003` |

**REGLA — la solicitud y los anexos se generan JUNTOS, con un solo gesto.** Salen de
los mismos datos —nº de actuación, ahorro verificado y dictamen— y tienen que casar
entre sí: la fila E3 de la solicitud es el expediente cuyo anexo se llama AnexoE3 y
cuyo ZIP es `ActuacionE3`. Con dos botones se puede generar uno y no el otro, y que
diverjan sin que nadie se entere hasta el requerimiento.

**REGLA — si algún expediente se queda sin anexo, NO se genera la solicitud.** Declara
un ahorro total y una fila por actuación: sin uno de los anexos, lo que se subiría es
una carátula que no corresponde con sus adjuntos. Se dice por qué, y los anexos que sí
salieron se conservan.

**REGLA — el total es la SUMA de las filas**, calculada al vuelo y no heredada de otro
sitio: lo primero que comprueba quien la revisa es que cuadren.

⚠️ **El ahorro viaja en CRUDO desde el expediente, nunca el que el anexo ya formateó.**
Aquél lleva punto de millar ("28.852") y `Number()` lo lee como 28,852 — tres órdenes
de magnitud menos en la cifra por la que se emiten los CAE. Es el mismo fallo que el
de los números del OCR, y por eso `entero()` además normaliza el separador español
antes de sumar.

⚠️ **Las filas E6–E15 no se tocan, y las apariencias se regeneran UNA A UNA.** En este
impreso la opción "Seleccione código de la ficha" y la primera ficha del catálogo
(AGR010, pantallas térmicas en invernaderos) **exportan la misma cadena** — es un fallo
de la plantilla oficial. Un `form.updateFieldAppearances()` global dejaría las diez
filas vacías diciendo que se solicitan diez actuaciones de invernaderos. Sin tocarlas,
conservan su apariencia buena; la plantilla no trae `NeedAppearances`, así que el visor
no las repinta.

⚠️ **La fila 11 se llama `Ell-0`** en la plantilla —ele minúscula, no uno—. Es una errata
del Ministerio: hay que respetarla o esa fila sale sin ahorro.

**El título de la ficha se ELIGE del desplegable**, con el mismo `FICHA_CATALOGO` que el
anexo por actuación (los dos impresos usan la lista oficial y tenerla dos veces es
tenerla mal un día). La comunidad autónoma también se elige, y `opcionCcaa` la resuelve
aunque en la BD esté en mayúsculas o sin guion: una CCAA que no case dejaría la
solicitud sin el campo por el que el Gestor Autonómico la reparte.

**No se aplana**, igual que el anexo.

**REGLA — cada anexo va a la carpeta `E{n}` de SU expediente.** Ahí se juntan los
adjuntos de esa actuación (`E3-1- Convenio CAE`, `E3-3-1- Ficha RES060`, `E3-3-5-
Certificado CIFO`…), que es lo que acaba comprimido como `ActuacionE3`. Todos juntos en
la carpeta del lote habría que repartirlos a mano justo antes de subir a MITECO, que es
el momento en que un fichero en la carpeta equivocada cuesta un requerimiento. La
carpeta la resuelve `carpetaDeExpediente` (la misma del sincronizador); un expediente
sin carpeta se cuenta como incompleto en vez de dejar el anexo en cualquier sitio.

**REGLA — lo que falte se LEE de los documentos ya subidos.** Al generar, si falta el nº
de actuación se va al informe y si faltan la identificación y la fecha del dictamen se va
al dictamen: a esas alturas los dos están subidos, y mandar al usuario a pulsar antes dos
botones para que la app lea unos papeles que ya tiene es hacerle de recadero. Del informe
se completa **solo el orden** —identificación, no dinero—; los ahorros y las inversiones
siguen exigiendo revisión. Los dos rescates van en **try/catch**: la cuota del lector se
agota a las ~20 peticiones seguidas y un lote que ya tiene sus datos debe generar igual.

⚠️ **El dictamen escribe sus datos como viñetas** (`• 28/08/2026.`), así que llegan con
el punto pegado. `fecha()` BUSCA la fecha dentro del texto en vez de exigir que la cadena
entera lo sea —si no, el anexo salía sin ella—, y el lector quita el punto final de
fecha, año, referencia del informe y CCAA; nunca de `organismo` ("Grupo Marwen Calsan
S.L.") ni de `decision`.

**REGLA — el nº de actuación es el del INFORME.** Rotula el anexo y nombra sus adjuntos
en el ZIP (`E3-1-`, `E3-2-`…). Deducirlo de otra cosa —del orden alfabético, por
ejemplo— haría que los ficheros dejaran de casar con el formulario que los cita.

**REGLA — un anexo con huecos NO se genera.** Se presenta igual de bien que uno completo
y el requerimiento llega tres semanas después. `faltantes()` dice qué falta y en qué
expediente, y ese expediente se salta.

⚠️ **La mitad de los campos declaran tamaño 0, que significa "ajústalo tú"**, y pdf-lib
no lo implementa: escribe a 12pt y el título de la ficha —95 caracteres en una celda de
273pt— se sale de la tabla, mientras las coordenadas y la referencia catastral se cortan
a media cifra. `autoSize` replica lo que hace el lector: tope por la ALTURA de la casilla
(×0,65 — medido sobre el impreso relleno: 15,7pt → 10,2pt) y reducción si no cabe a lo
ancho.

⚠️ **Los tamaños FIJOS van en una tabla explícita (`TAMANO_CAMPO`), no se leen del /DA.**
Cualquier herramienta que reescriba la plantilla puede serializar ese `/DA` de forma que
pdf-lib deje de encontrar el `Tf` (pypdf escapa la barra en octal, `/Helv`), y
entonces el CNAE sale a 40pt sin que nadie lo note hasta abrir el PDF.

⚠️ **La plantilla del repo está VACIADA a propósito**: la que se nos pasó traía dentro
los datos de un expediente real. Vive en `backend/plantillas/` porque la imagen solo
copia `backend/` (ver [[project_backend_importa_frontend_esm]]), con su excepción en
`.gitignore` — la regla `plantillas/` la excluía y no habría llegado al VPS.

**No se APLANA**, igual que el modelo del Ministerio: si hay que corregir un dato a mano
antes de presentarlo, se puede.

---

## El PAQUETE de cada actuación — renombrar a E{n} y zipear (2026-09-08)

Los ~20 documentos de cada expediente se bajaban de Drive, se renombraban a mano
uno a uno con su código del índice (`E3-3-5 - …`) y se comprimían. **Cinco veces por
lote.** Ahora sale de un botón, y antes de generar nada **dice qué falta y en qué
expediente**.

| Qué | Dónde |
|---|---|
| El ÍNDICE (qué documento es cada código y de dónde sale) | [envioGestorService.js](implementation/backend/services/envioGestorService.js) — `INDICE` |
| ZIP sin dependencias nuevas | [utils/zipStore.js](implementation/backend/utils/zipStore.js) |
| Ruta | `POST /api/lotes/:id/paquete-actuaciones` — `{ modo, dryRun }`, **adminOnly** |
| Botones | Fase 5 de `LoteProcesoFases` ("Comprobar el paquete E1-E5" → "Generar N ZIP") |
| El convenio del S.O. | `prescriptores.convenio_cae_link` · ficha del S.O. (`ConvenioCae` en `PrescriptorDetailModal`) |
| Prueba sin escribir en Drive | `node scripts/test_paquete_actuaciones.js LOTE-2026-004 [--gestor] [--zip]` |

**REGLA — la nomenclatura NO se inventa: se REPRODUCE.** Sale de los lotes ya
presentados (medida sobre LOTE-2025-002, 003 y 2026-004, que coinciden entre sí) y es
la que el verificador y la Gestora de Ahorros ya han aceptado. El prefijo es
`E{n}-{código}` y el orden de `INDICE` **es** el orden en que lo lee quien lo revisa.

**REGLA — el nº de actuación es el del INFORME de verificación**
(`instalacion.verificacion.orden_actuacion`), el mismo que rotula el anexo del MITECO
(regla 29). Sin él no se arma nada y se dice por qué: deducirlo de otra cosa haría que
los adjuntos dejaran de casar con el anexo que los cita.

**REGLA — lo IMPRESCINDIBLE bloquea; lo leve avisa.** Un paquete sin el justificante
de registro del CEE se presenta igual de bien que uno completo y el requerimiento
llega tres semanas después; uno sin la etiqueta energética, no. Cada pieza declara su
`obligatorio` y esa es la única fuente del corte. Las que faltan se dicen **por
expediente y con nombre**, y las demás actuaciones se generan igual.

**REGLA — los ficheros se COPIAN, nunca se mueven.** El original sigue en su carpeta
de siempre ("6. ANEXOS CAE", "5. FACTURAS", "1. CEE/…"), que es la que audita todo lo
demás. El paquete es una vista derivada: se puede regenerar, y lo que reemplaza lo
borra en vez de archivarlo en OLD porque nunca es la única copia de nada.

**REGLA — lo que ya está colocado con su código NO se toca.** Ni se renombra ni se
sustituye: ese nombre es el que el verificador ha visto (con su `_rev1`, su `_fdo_fdo`
y sus mayúsculas), y "corregirlo" solo dejaría dos copias del mismo papel con nombres
distintos. Es además lo que hace que regenerar sea idempotente y que un documento que
alguien dejó ahí a mano no desaparezca del ZIP por no constar en la base de datos.
Cuando una pieza sale de ahí —o de un respaldo en Drive— **se dice** (`⚠ sale de un
fichero suelto en Drive, no consta en el expediente`): hoy funciona porque hay una
copia, y el lote que viene detrás no la va a tener.

**REGLA — el nombre lo decide la PIEZA, no quien la encontró.** `nombreDe(ctx)` para
las dinámicas (el convenio con la marca del S.O., `Ficha RES080_fdo`, y el CIFO que en
un RES080 se llama Certificado de Reforma). Cayendo en la etiqueta de la interfaz
salían ficheros llamados `E1-3-1 - … - Ficha RES firmada por el S.O..pdf`.

**DOS paquetes, porque se arman en dos momentos:**
- `expediente` → la carpeta `E{n}` **dentro del expediente** + `E{n}.zip`. Se puede
  montar en cuanto el informe numera las actuaciones, semanas antes del dictamen.
- `gestor` → `{LOTE} - ENVIO GESTOR/E{n}` + `ActuacionE{n}.zip`: lo mismo MÁS el
  dictamen favorable (`E{n}-2`) y los escritos del lote (`E{n}-5-x`). Es el que se
  sube a MITECO, y su botón solo aparece con el dictamen ya subido.

**El CERTIFICADO RITE pasa a `3-2`.** En los lotes ya enviados comparte el `3-6` con
el justificante de registro del CEE final —dos ficheros con el mismo código— y el
`3-2` estaba libre en todos ellos. Se cambia en `COD_RITE` y en ningún otro sitio.

**REGLA — el CONVENIO CAE vive en la ficha del S.O.**, no en el lote: es el mismo
documento en las cinco actuaciones y en todos sus lotes. Se sube una vez (o se pega su
enlace de Drive) y va a una carpeta **fuera de cualquier lote o expediente** — dentro
de uno, quien ordene esa carpeta se lleva por delante el convenio de todos los demás
paquetes (mismo criterio que el catálogo de fichas técnicas).

**El ZIP se escribe sin dependencias nuevas** (`utils/zipStore.js`, modo STORE): el
contenido son PDFs, que ya vienen comprimidos por dentro, así que deflatearlos otra vez
ahorra una migaja y costaría una dependencia más en la imagen del backend. Verificado
con `zipfile` de Python sobre los cuatro ZIP de LOTE-2026-004 (12-29 MB cada uno).

⚠️ El atajo de "en seco no fusiono las fichas técnicas" (son varios PDF que se unen en
uno) **no puede aplicarse cuando se arma el ZIP de verdad**: con él puesto, el paquete
salía sin las fichas técnicas y sin decirlo.

### Los FIRMADOS del S.O. se sueltan todos y la app los coloca (2026-09-09)

El S.O. firma el Anexo I y las cinco fichas con su certificado y los devuelve por
email **con el mismo nombre con el que se los mandamos**. Había que abrir cada PDF
para ver de qué expediente era, comprobar a ojo que llevaba firma, renombrarlo y
subirlo a su slot: seis veces por lote. Ahora se sueltan los seis en la fase 2 y
la app los identifica, comprueba las firmas y los registra.

| Qué | Dónde |
|---|---|
| QUIÉN firma un PDF (leído del propio fichero) | [utils/firmasPdf.js](implementation/backend/utils/firmasPdf.js) — `leerFirmasPdf`, `firmanteCoincide` |
| Identificar, comprobar y registrar | [services/firmadosSo.js](implementation/backend/services/firmadosSo.js) — `procesarFirmados` |
| Ruta | `POST /api/lotes/:id/firmados` (multipart `files`, `dryRun`, `asignar`, `forzar`), **staffOnly** |
| Superficie | Zona de suelta en la fase 2 + `FirmadosSoModal` |
| Quién firma por Brokergy | `FIRMANTE_CESIONARIO` en [docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js) |
| Pruebas | `node scripts/test_firmados_so.js` · `node scripts/probar_firmas_pdf.js --lote LOTE-2026-004` |

**REGLA — las firmas se leen del PDF, NO con un modelo de IA.** Están escritas
dentro: el diccionario `/Type /Sig` trae `/SubFilter` y `/M`, y su `/Contents` es
un PKCS#7 cuyos certificados llevan el nombre y el NIF del firmante. `firmasPdf.js`
es un recorrido TLV de DER (~200 líneas, sin dependencias nuevas): milisegundos y
**coste cero**. Pagar una llamada a un LLM para leer un nombre que el fichero ya
dice sería además menos fiable — no hay garantía de que lo lea igual dos veces.
Medido sobre los firmados reales de LOTE-2026-004: el Anexo I devuelve sus dos
firmas (PEDRO JOSE LOPEZ MONTERO · 06239730Z y FRANCISCO JAVIER MOYA LOPEZ ·
06282551D, con su organización y su fecha) y la ficha, una.

**REGLA — esto NO valida la firma.** No se comprueba el hash del documento, ni la
cadena de confianza, ni la revocación: eso es de Autofirma y del validador del
Ministerio. Lo que se afirma es *"el PDF declara N firmas y éstos son los nombres
de sus certificados"*, que es justo lo que hace falta para clasificar un fichero y
ponerle nombre. Decirlo de otra manera en la pantalla sería prometer una validez
que nadie ha comprobado.

**REGLA — la firma COMPRUEBA, la identidad AVISA.** Un PDF sin firma electrónica
no es un firmado y no se registra: es el único caso que bloquea solo (probado con
el borrador sin firmar de una ficha real). Que el certificado no sea del
representante que consta en la ficha del S.O. **no** bloquea —puede haber cambiado
de apoderado, o firmar un administrador solidario— pero se dice quién firma de
verdad y hay que marcar "registrarlo igualmente". Nunca se traga en silencio.

**REGLA — el nº de expediente se compara vigilando el PREFIJO.** `26RES060_10` está
dentro de `26RES060_105`: un emparejamiento por "contiene" registraría la ficha
firmada en el expediente del vecino, y de ahí viaja al ZIP y al verificador sin que
nadie lo note. `contieneNumero` exige que lo que sigue al número no sea un dígito
(mismo cuidado que `normNum` al leer los informes de verificación).

**REGLA — lo que no se sabe de quién es, se PREGUNTA.** Si el nombre no lleva el nº
de expediente ni identifica al Anexo I, el fichero vuelve sin asignar y el modal
ofrece el desplegable de los documentos que están esperando firma. Elegir "el
primero que quede libre" es colocar la ficha de otro. Al asignarlo a mano se
**vuelve a analizar**: las firmas que se esperan dependen del destino (el Anexo I
pide dos y una ficha, una).

**REGLA — la zona de suelta es TODO el bloque de la fase, y se avisa ANTES de
llegar.** Con una cajita punteada hay que apuntar, y lo que se arrastra viene de
una descarga de seis PDF: se suelta donde se está mirando. En cuanto el puntero
entra en la ventana con ficheros, las fases que aceptan suelta se marcan (borde
discontinuo + "suelta aquí" en su cabecera) y la que tiene el puntero encima se
resalta; sin ese aviso hay que adivinar dónde vale soltar y el intento acaba en el
escritorio. **También plegada**: no hay que abrir la fase para soltar.

⚠️ El resaltado de la fase concreta se hace tocando las CLASES DEL NODO, no con
estado de React: `Fase` se recrea en cada render de `LoteProcesoFases`, así que un
`useState` dentro la remontaría a mitad de arrastre y el navegador cancelaría el
hover. Lo único que sí es estado es `arrastrando`, que cambia dos veces por
arrastre. Y el `dragover` de ventana hace `preventDefault`: sin él el navegador no
deja soltar y, al fallar la puntería, **abre el PDF** y se pierde la pantalla.

**REGLA — da igual en qué fase se suelte cada PDF.** El destino lo decide el
NOMBRE del fichero, no el sitio donde se soltó: la solicitud se puede soltar en la
fase 2 y una ficha en la fase 1. Las dos zonas existen porque son los dos sitios
donde uno mira, no porque filtren nada.

**La SOLICITUD DE VERIFICACIÓN firmada va por el mismo camino.** La firma el S.O.
(es el solicitante) y vuelve con las demás, así que se comprueba igual y
`guardarDocFirmado` la deja en `{lote} - DOC. VERIFICACIÓN` como
`1. Solicitud de Verificación {LOTE}_fdo.pdf`.

**REGLA — "Subir firmado" de una fila entra por el MISMO sitio.** Antes ese botón
posteaba directo a `/documentos/:key/firmado` **sin mirar la firma**: quedaba una
vía por la que un PDF sin firmar entraba como firmado. Ahora abre el mismo popup
con el documento YA ASIGNADO (`asignacionInicial`), así que la comprobación y el
`_fdo` no dependen de por dónde hayas entrado.

Eso obliga a distinguir DOS listas en `procesarFirmados`, y la diferencia importa:
`candidatos` es todo lo firmable del lote —donde se busca cuando el destino lo dice
una PERSONA— e `identificables` solo lo que ya se le mandó, que es contra lo que se
empareja por el nombre. Un documento que no ha salido no puede volver firmado, y
ofrecerlo como destino automático invitaría a colocar ahí un fichero de otra cosa.

**REGLA — si la firma que falta es la NUESTRA, se firma desde la propia fila.** El
S.O. puede devolver el Anexo I con su firma y sin la de Brokergy (o firmarlo antes
de que nosotros lo hayamos hecho). La fila ofrece **"🖊️ Firmarlo yo ahora con
Autofirma"**, que abre el MISMO `FirmarConCertificadoModal` del popup del Anexo I
con la caja del Proveedor (`SIGN_BOXES.anexo_i_listado_proveedor`, fuente única con
Autofirma) y el PDF firmado **sustituye** al que se soltó: lo que se registra
después es el firmado, no el que llegó por email. Al volver de Autofirma se
RE-ANALIZA, así que el aviso desaparece solo y la fila pasa a verde.

El botón va **antes** del "registrarlo igualmente": firmarlo ARREGLA el aviso;
forzarlo solo lo acepta como está. Y qué caja le toca a cada documento vive en un
mapa explícito (`CAJA_BROKERGY`) porque hoy solo el Anexo I lleva firma nuestra —
las fichas las firma el S.O. y nadie más.

⚠️ Qué firma falta viaja en ESTRUCTURA (`res.faltan[].rol`), no dentro de la frase
del aviso: leer eso de un texto en castellano se rompe la primera vez que alguien
mejore la redacción.

⚠️ `FirmarConCertificadoModal` **no se portalea solo**, así que se monta como
HERMANO del velo de este modal y no dentro (regla 29.b): metido dentro, su
`position: fixed` se ancla al ancestro con `backdrop-filter` y además scrollearía
con el listado de ficheros.

**REGLA — se registra por `guardarDocFirmado`, no por un camino nuevo.** Es la misma
función que usan la firma en cadena del enlace público y la subida a mano: ya
renombra con `_fdo`, deja la ficha en "10. EXPEDIENTE CAE" de su expediente y
retira el visto bueno anterior. El nombre del paquete (`E3-3-1 - 25RES060_90 -
Ficha RES060_fdo`) NO se pone aquí: lo pone `envioGestorService` al armar el ZIP,
y lo único que necesita es que la entrada tenga su `signed_link`.

**Dos tiempos, y el primero no escribe** (`dryRun`): se sueltan, se ve qué ha
entendido la app de cada fichero —incluido **con qué nombre va a quedar guardado**,
que es la mitad de lo que se revisa ahí— y solo entonces se aplica. De esto depende
qué PDF acaba dentro del ZIP que se presenta.

**Probado en producción el 2026-09-09**: el Anexo I y las **cinco** fichas de
LOTE-2026-008, soltados de golpe y registrados en 11 segundos, cada uno
identificado por su nombre y con sus firmas leídas del certificado (el Anexo I con
las dos: Francisco Javier Moya López + Pedro José López Montero; las fichas con la
del S.O.).

⚠️ El nombre del fichero llega de un formulario: en Windows puede traer la ruta
entera y algunos navegadores lo codifican en latin1. Se limpia en la ruta
(`Buffer.from(originalname,'latin1').toString('utf8')` + quitar la ruta) o el
emparejamiento falla por un nombre que en pantalla se ve bien.

**El resumen del popup de la solicitud va PLEGADO.** Son cinco páginas de
formulario dentro de un popup: abierto empuja "Enviar por API" —que es a lo que se
entra— fuera de la pantalla y obliga a recorrer el documento entero para llegar al
botón. Lo que se revisa ahí arriba son los CAMPOS; el documento se mira cuando se
quiere comprobar cómo ha quedado.

## El ZIP que se sube a beCAE es el MISMO paquete del MITECO (2026-09-09)

Antes de que el verificador emita su oferta hay que subirle a **beCAE** la
documentación de cada actuación: un ZIP por actuación con los ficheros renombrados
a `E{n}-…`, y la solicitud aparte. Es el paquete que ya existía (regla 40, modo
`expediente`), no otro: el del MITECO es ESE MÁS el anexo de la actuación, el
dictamen y los escritos del lote. Por eso el botón está en la **fase 3** del proceso
del lote, que es cuando se sube, y el de la fase 5 sigue donde estaba.

**REGLA — el contenido NO depende de la ficha.** Comparadas las 20 actuaciones de los
cuatro lotes con dictamen favorable (10 RES060, 4 RES080… y las de 2026-004: RES060,
3 RES080 y 1 RES093), las 20 llevan exactamente los mismos documentos. Lo único que
cambia con la ficha es cómo se llama el `3-5`: en RES060/RES093/TER es el
**Certificado CIFO** y en RES080 el **Certificado de Reforma**, que ya lo resuelve
`nombreDe`. No hay ninguna pieza exclusiva de una ficha, así que no hay un índice por
tipología que mantener.

**REGLA — la FICHA TÉCNICA va dos veces, y tienen que ser LA MISMA.** Dentro del
certificado —como anexo— y **suelta**, porque nos la piden además como documento
externo. Así que el `4-1` se arma con la misma decisión que el bloque de anexos del
certificado: `resolveAllFichaSlots` (una por MODELO de bomba de calor, más el marco y
el vidrio en un RES080 con ventanas) + los anexos sueltos que se le añadieron a mano,
y `buildAnnexPayload` los ordena, deduplica por fichero y aplica el recorte de
páginas guardado en el gestor de anexos. Verificado sobre LOTE-2026-008: el `4-1`
suelto es página a página el final del `3-5`. Con solo los `ft_*_link` en crudo —lo
que se hacía antes— el fichero de 26RES080_53 se quedaba en 6 páginas frente a las
**55** que se presentaron: faltaban la memoria de transmitancias, el marco, el vidrio
y la lana mineral. La unión la hace `pdfService.unirAnexos`, que parte de un
documento VACÍO: usando el primer anexo como base, su propio recorte de páginas no se
aplicaría y el fichero suelto dejaría de coincidir con el certificado.

**REGLA — el hueco de ficha técnica lo rellena EL QUE LA NECESITA, no una
pantalla.** El paquete resuelve el `4-1` desde el SLOT del expediente
(`ft_*_link`), y ese slot solo lo escribía el modal del certificado al abrirlo.
O sea que un expediente con el modelo ELEGIDO del catálogo y su ficha EN el
catálogo llegaba al lote diciendo que le faltaba un documento que no faltaba —
nadie había pasado por esa pantalla desde que el catálogo de ventanas existe.
Medido en LOTE-2025-005 (10/09/2026): **dos de cinco actuaciones bloqueadas** por
eso, con las tres fichas disponibles. La decisión salió de la ruta a
[fichaTecnicaSlot.js](implementation/backend/services/fichaTecnicaSlot.js)
(`asegurarFichaTecnica` / `asegurarFichasTecnicas`), la ruta `auto-copy` delega en
ella y **`envioGestorService` la llama antes de leer los huecos**: misma función,
mismo fichero, mismo nombre canónico, mismo slot. Es idempotente, así que la
comprobación en seco también la ejecuta —y el popup lo DICE en el subtítulo, en
vez de prometer que no ha tocado nada—. La ficha del catálogo **nunca sustituye**
a la que ya haya en el slot: puede ser una subida a mano que la corrige, y solo
`force` la reemplaza. Lo que no se puede rellenar sale como aviso con su motivo
(`avisos_ficha`), que siempre es el mismo y siempre se arregla en el mismo sitio:
el modelo no está elegido del catálogo, o está en el catálogo sin ficha.

⚠️ Los expedientes ANTERIORES al catálogo de ventanas declaran el marco y el
vidrio como TEXTO LIBRE, sin `marco_id`/`cristal_id`, así que ahí no hay nada que
copiar y el aviso lo dice. Para lo ya ocurrido:
`node implementation/backend/scripts/rellenar_fichas_tecnicas.js --lote=LOTE-2025-005 --execute`
(en seco sin `--execute`). Y cuando el certificado FIRMADO ya lleva un anexo que
no existe suelto —la ficha EPREL, o una versión distinta de la del catálogo—, la
pieza se EXTRAE del propio certificado: la regla es que el `4-1` sea página a
página su bloque de anexos, y eso manda sobre lo que diga el catálogo hoy.
Comprobado sobre 25RES080_26 (6 páginas) y 26RES080_34 (8): idénticos.

**REGLA — un enlace que apunta a un fichero BORRADO no es una pieza presente.**
Medido en LOTE-2025-005 el 10/09/2026: la comprobación dijo **18/18 en las cinco**
actuaciones y el ZIP de E3 salió con **15** documentos y el de E2 con 16. Lo que
faltaba —el Convenio de Cesión firmado, el Anexo Fotográfico y el Anexo I de
25RES080_7— seguía enlazado en el expediente, pero su fichero ya no estaba en
Drive: `getFileContent` daba 404, `copyFile` fallaba y el bucle de copia se saltaba
la pieza con un `if (bytes && bytes.length)`. **Un paquete al que le faltan tres
papeles se presenta igual de bien que uno completo**, que es justo lo que este
índice viene a evitar. `comprobarExisten()` mira ahora la metadata de cada pieza
que sale de un ENLACE guardado —las que se han encontrado listando una carpeta
existen por definición— y trata como ausente tanto el 404 como el fichero **en la
papelera**, que todavía se descarga pero desaparece el día que se vacíe. Se dice
con sus palabras (`estado: 'roto'`, "el fichero enlazado ya no existe en Drive —
vuelve a subirlo"): no es lo mismo que no tenerlo, porque el documento se generó y
se firmó y lo que hay que hacer es re-enlazarlo, no rehacerlo. Y si aun así una
copia se cae al generar, la actuación sale **NO OK** con la pieza listada, nunca
tragada. Cuesta ~10 s más por comprobación (de 12 a 23 s en un lote de cinco).

⚠️ **Un clic que no hace NADA es el peor final posible** — no se distingue de un
botón roto y lleva a pulsar otra vez, que aquí significa rehacer 120 MB. Pasó el
10/09/2026 con "Generar" y tenía DOS causas, las dos ahora cerradas: el texto del
`showConfirm` interpolaba una variable inexistente y el `ReferenceError` moría
dentro de un `async` que nadie escucha; y el popup de confirmación lo pinta
`ModalContext` DENTRO de `#root` mientras `SendActionOverlay` se portalea a
`document.body` (regla 29.b), así que **la pregunta quedaba tapada por el propio
overlay** y la función esperaba un "sí" invisible. Ahora el overlay se retira antes
de preguntar y se repone si la respuesta es que no, y `generarPaquete` envuelve
todo en un `catch` que saca el error en pantalla.

**REGLA — el Nº DE ACTUACIÓN se SELLA al enviar la solicitud por API.** Es el orden en
que las actuaciones se acaban de declarar al verificador, y es el que rotula cada
fichero del ZIP (`E3-3-1 - …`) y, meses después, el anexo del MITECO que los cita
(regla 29). Antes solo existía al registrar los ahorros del informe —semanas
después—, así que no se podía armar nada a tiempo. Se guarda en
`instalacion.verificacion.orden_actuacion` con `orden_origen: 'SOLICITUD_API'` y
**`soloSiFalta`**: un orden ya escrito no se pisa, y la discrepancia se ve en vez de
sustituirse en silencio —el ZIP que ya se subió lleva el número sellado—.

Para los lotes cuya solicitud salió antes de esto:

```bash
node implementation/backend/scripts/sellar_orden_actuacion.js LOTE-2026-008 --execute
```

Deduce el orden de la secuencia de FICHAS que se mandó a firmar al S.O., que es la
misma lista con la que se construyó la solicitud. Comprobado contra los cuatro PDF de
solicitud reales (0035-S07 a S10) leyendo sus bloques "Actuación N": coincide
actuación por actuación; y en los cuatro lotes con dictamen favorable coincide además
con el que el informe acabó asignando. Aun así lo ENSEÑA antes de escribir, porque el
número que manda es el que se ve en beCAE (`--orden=exp1,exp2,…` para forzarlo).

**REGLA — un papel de REQUERIMIENTO no se echa de menos** (`soloSiExiste`). La
*Declaración responsable del instalador* (`4-7`) no es del proceso: se escribió una
vez, para contestar a la inexactitud nº 4 de LOTE-2025-003 —el verificador objetó que
el emisor de la factura no era quien firmaba el certificado del instalador, o sea el
caso de la firma delegada ante Industria (regla 26.b)—. Una en veinte actuaciones. El
*Escrito de respuesta* (`5-1`) igual: solo existe si hubo requerimiento (2 de 4 lotes).
Si están, entran en el paquete; si no están, **no se dice nada** y no salen ni en el
listado: un aviso que aparece en todos los lotes y nunca hay que atender es el que
enseña a ignorar la lista entera. La del HUSO (`5-2`) SÍ avisa —está en los tres
últimos lotes, ya es parte del envío—.
⚠️ En LOTE-2026-004 el código `4-7` lo ocupa otro documento distinto ("DECLARACION
RESPONSABLE INVERSION"): el índice del gestor reutiliza ese hueco para lo que haya que
responder, así que no es "el" 4-7 de nada.

**REGLA — si el documento ESTÁ en Drive, el paquete lo coge** (`respaldo`). Es la
regla 20 aplicada aquí: un fichero que existe en su carpeta de siempre no puede
declararse "falta" porque nadie lo enlazara en el expediente. Medido en LOTE-2025-005:
el **Certificado RITE** de 25RES080_7 llevaba meses en `7. LEGALIZACION RITE` firmado y
registrado, y el **PDF único de facturas** de otras dos actuaciones estaba generado en
`5. FACTURAS` — tres de los cinco bloqueos eran enlaces que faltaban, no papeles. El
RITE excluye la MEMORIA, que vive en la misma carpeta y es el documento de al lado; las
facturas se reconocen por `" - facturas"`, que es como se llama siempre el combinado.

⚠️ **Con DOS candidatos el respaldo NO elige** (`unico`): quedarse con el primero es
decidir a ojo qué papel viaja al verificador. Se dice que falta y lo resuelve una
persona enlazándolo, que además lo deja arreglado para el lote siguiente. Y cuando una
pieza sale del respaldo el paquete lo DICE ("sale de un fichero suelto en Drive"), que
es lo que avisa de que el combinado de facturas puede ser anterior a la última factura
registrada.

**REGLA — una pieza puede NO PROCEDER, y eso no es que falte.** `exigencia()` da tres
respuestas y la tercera es la que evita los falsos bloqueos. El caso medido: el
**justificante de registro del CEE inicial** no existe cuando el CEE inicial es una
SIMULACIÓN, y 5 de las 20 actuaciones con dictamen favorable se presentaron sin él. La
señal es la fecha de registro del expediente —lo que se sella al subir el justificante
(regla 27.c), así que las dos cosas se mueven juntas—: sin ella se avisa, no se
bloquea. Y **se dice con el motivo**: una pieza del índice que desaparece de la lista
sin explicación se lee como un olvido.

⚠️ El **anexo de la actuación** solo es obligatorio en el modo `gestor`
(`obligatorioEn`). Para rellenarlo hacen falta el nº de dictamen y su fecha, así que a
la hora de subir a beCAE todavía no existe y exigirlo bloqueaba el paquete entero por
un papel que no puede estar.

**REGLA — GENERAR se pide de UNA actuación por PETICIÓN.** Armar las cinco de un
tirón son ~5 minutos (medido en el VPS el 09/09/2026: **~50 s por actuación**, E1 a
las 15:21:14 y E5 a las 15:24:47) y eso no cabe en los **120 s** de `proxy_read_timeout`
de `/api/`: nginx cortaba la respuesta a la altura de la segunda y la pantalla decía
**"no se pudo preparar el paquete"** mientras el servidor seguía y terminaba los cinco
ZIP. Dar por fallido un trabajo hecho es el peor error que puede cometer una pantalla
—el mismo vicio que el ACK de WhatsApp (regla 39)—. Ahora el frontend recorre las
actuaciones (`generarPaquete`) llamando con **`soloActuacion: n`**: cada petición dura
lo que dura su actuación, el overlay dice por dónde va ("Renombrando y comprimiendo… 3
de 5 · E3 · 26RES080_56") y si una se cae las demás quedan generadas y se dice cuál
falló. La comprobación en seco no baja ficheros y sigue yendo entera.

**REGLA — se puede PARAR, y volver a generar PREGUNTA.** Dos cosas que faltaban y
que solo se ven usándolo: (1) una tanda de cinco minutos sin botón de cancelar deja
como única salida refrescar la página —que es peor: corta sin decir por dónde iba—;
(2) al acabar, el botón seguía diciendo "Generar 5 ZIP" igual que antes, así que
pulsarlo rehacía 120 MB **en silencio**. Ahora el overlay lleva `cancelar` en la fase
de envío ("Parar aquí" + "se para al terminar esta actuación": lo ya pedido al
servidor no se puede deshacer sin dejar una carpeta a medio copiar), el resultado dice
**qué quedó sin generar** (`Sin generar: E3, E4, E5`) y el botón pasa a
**"↻ Volver a generar"** con `showConfirm`. La bandera de cancelación va por **`useRef`**:
el bucle corre fuera del render y con `useState` leería el valor del render en que
arrancó. Y solo se marca como generado si la tanda salió ENTERA — tras un parón, el
botón tiene que seguir invitando a terminar el trabajo sin preguntar nada.

⚠️ Como red de seguridad, esas dos rutas tienen su propia `location` en nginx con
**900 s** (`~ ^/api/lotes/[^/]+/(paquete-actuaciones|anexos-actuacion)$`; la de regex
gana a la de prefijo `/api/`, que se queda en 120 s — un plazo generoso para TODA la
API es una conexión colgada un cuarto de hora por cada petición que se atasque).
Aplicada **a mano en el VPS**, en `nginx.conf` y en su `nginx.https.conf` local, porque
esa config está divergida del repo y un cambio por `git pull` aborta el deploy entero
(ver `deploy_workflow`); y con `docker compose restart nginx`, nunca `reload`, por el
gotcha del inodo del bind-mount.

⚠️ Armando el ZIP **en memoria** no hay carpeta destino: `E{n}` puede no existir
todavía —y no existe en un lote que aún no se ha presentado, que es justo el que se
quiere comprobar—. Antes eso moría con "No se pudo preparar la carpeta E1".

## Pedirle cosas al SUJETO OBLIGADO desde el cuadro de mando (2026-09-01 · ofertas 2026-09-10)

Los envíos que ya existían son de UN documento de UN lote (firmar el Anexo I, firmar la
oferta). Éstos son de otra naturaleza: **un solo correo por varios lotes**, que es como
se trabaja con él — "te mando las facturas de los lotes 001 a 004, y aun pagándolas os
ahorráis 19.564 €". Cuatro correos iguales el mismo día son la forma de que no conteste
a ninguno.

| Qué | Dónde |
|---|---|
| Qué se puede pedir, el texto y el asunto | [peticionesSo.js](implementation/frontend/src/features/lotes/logic/peticionesSo.js) |
| El envío | `POST /api/lotes/peticion-so` (**adminOnly**, de la COLECCIÓN) |
| Botón | Cabecera de `LotesResumen` |
| Popup | `PedirAlSoModal`, que reutiliza `EnviarLoteDocModal` con `onSendOverride` |
| Qué se pediría hoy, sin enviar nada | `node implementation/backend/scripts/test_peticiones_so.mjs [ESTADO] [--simular-ofertas]` |

### Las DOS peticiones que hay (2026-09-10)

| Petición | Qué manda | Cuándo se ofrece |
|---|---|---|
| `firma_ofertas` | Las ofertas de verificación, **para que las firme** | El lote no ha pasado de `PTE. FIRMA OFERTA S.O.`, tiene la oferta subida y **sin** `signed_link` |
| `pago_verificacion` | Las facturas del verificador, para que las pague | El lote **ya está verificado** (tiene informe o dictamen), tiene la factura y sin `pagado_at` |

**REGLA — el ORDEN es de prioridad, y se pintan TODAS las aplicables.** La firma va
primero porque bloquea el ARRANQUE de la verificación; el pago se reclama con el
trabajo ya hecho. Pueden coincidir —firmar las ofertas de unos lotes y reclamar el
pago de otros—, y esconder la segunda detrás de la primera obliga a resolver una
para descubrir que había otra.

**REGLA — un lote al que TODAVÍA NO LE TOCA no se cuenta ni se nombra.** Medido el
10/09/2026: la petición de firma proponía pedirle al S.O. que firmara la oferta de
LOTE-2025-002 y 003, **ya subidos a MITECO** (su oferta no tiene `signed_link`
porque se firmó fuera de la app), y el "se quedan fuera" del pago listaba seis
lotes, entre ellos uno ya cobrado y cuatro que aún esperan la oferta. Un aviso que
sale siempre y nunca hay que atender es el que enseña a ignorar la lista entera —
mismo criterio que `soloSiExiste` en el índice del paquete (regla 40). El tramo se
expresa por su ÚLTIMO estado contra el orden de `LOTE_ESTADOS` (`hastaEstado`), no
enumerando los excluidos, que habría que ampliar con cada estado nuevo; y para el
pago se mira el HECHO (`haVerificado`: informe o dictamen subidos), no el estado,
que se mueve a mano y en los lotes anteriores a la app no describe este tramo.

**REGLA — el popup es UNO para todas las peticiones.** Lo que cambia entre ellas
—qué se adjunta (`docs`), cómo se llama (`sustantivo`), quién se queda fuera y por
qué (`fuera`)— lo aporta la propia petición, no un `if` dentro de `PedirAlSoModal`:
dos popups gemelos divergirían justo en la parte delicada, que es la lista de lo que
va adjunto. La ruta también es una (`PETICIONES_SO` en `routes/lotes.js`): las dos
son el mismo gesto —un correo con N adjuntos, uno por lote— y solo cambian en qué
documento viaja y qué se sella. `/solicitar-pago-verificacion` sigue viva y delega,
porque un navegador sin refrescar sigue posteando ahí.

**La OFERTA se sube ARRASTRÁNDOLA** a la fase 3, como los firmados de la fase 2. La
suelta tiene dos significados y **los decide el estado, no una pregunta**: sin oferta,
lo único que puede llegar es la del verificador; ya enviada a firmar, lo que vuelve es
la FIRMADA por el S.O., que entra por el camino de los firmados (`oferta_verificacion`
ya está en `TIPOS_FIRMABLES`, así que se le leen las firmas antes de registrarla).
Con la oferta subida y aún sin enviar **no se acepta suelta**: ahí lo que toca es
mandarla, y un PDF soltado en ese momento sería un reemplazo silencioso del que se va
a mandar a firmar. Y el popup que sale al subirla dice que, con varios lotes en
marcha, conviene decir que NO y mandarlas todas juntas.

**REGLA — el botón va en el CUADRO DE MANDO, no en la cabecera de la vista.** Actúa
sobre el conjunto que se está viendo (respeta el filtro) y las cifras que manda son
literalmente las de esas tarjetas. Junto a "+ Nuevo lote" parecería que actúa sobre todos
los lotes, y ahí vive *crear*, que es otro orden de cosas.

**REGLA — el botón DICE lo que va a pedir y por cuánto** ("Pedir el pago de la
verificación · 4.883 €"): es lo que decide si se manda hoy o se espera a que entre otro
lote. **Y si no hay nada que pedir, no hay botón**: uno deshabilitado con un tooltip
obliga a pulsarlo para descubrir por qué.

**REGLA — un lote sin su factura se queda FUERA, y se DICE.** No se puede reclamar lo que
no se puede adjuntar, pero callarlo es peor que excluirlo: se manda el correo creyendo
que van los cuatro y el S.O. paga tres. El aviso va en el SUBTÍTULO del modal, que está
siempre a la vista — el del cuerpo (`extraBody`) queda por debajo del mensaje y hay que
desplazarse hasta él.

**REGLA — pedirlo una vez NO cierra la petición.** Que se lo hayamos pedido no significa
que lo haya pagado: el sello no apaga el botón, lo convierte en **"Volver a pedir el pago"**
(apagado, porque ya no urge igual) y el correo, en un **recordatorio** que dice desde cuándo
está pendiente y qué se frena mientras tanto — mandarle otra vez el mismo "te adjunto las
facturas" es de plantilla. Se reinsiste solo cuando NINGUNO está por pedir; con mezcla sale
el correo normal con todos los adjuntos, que es la razón de ser de esta petición.

**REGLA — lo que cierra la petición es COBRARLO, y eso se marca en la factura.** La vida de
una factura del lote es *subida → remitida → reclamada → **pagada***, y el último sello
faltaba: una ya cobrada seguía figurando como pendiente y el botón se la volvía a reclamar al
S.O., que es la peor forma de reclamar. Se marca desde su fila en la fase 4
(`POST /api/lotes/:id/documentos/:key/pago`, **adminOnly** — es dinero), con o sin
justificante; y **subir el justificante la da por pagada**, porque el papel es la prueba
—mismo criterio que el justificante de registro del MITECO—. El justificante va a la carpeta
de documentación del lote con nombre canónico (`4.5 Justificante de pago LOTE-2026-004`), no
se queda en un correo, y al reemplazarlo el anterior se **archiva en OLD**: un documento de
cobro no se tira. Una factura pagada sale de la reclamación en las dos capas —`peticionesSo`
la excluye y el importe del botón pasa a ser lo que queda por cobrar, y la ruta de envío
responde **409** si alguno de los lotes pedidos ya consta pagado, porque entre que la pantalla
se pinta y se pulsa puede haberlo marcado otra persona—. Solo se puede pagar lo que es una
FACTURA (`importe` en su slot): un informe o un dictamen no se pagan.

**REGLA — un envío que ya salió tiene que VERSE.** Antes, al pedirlo, el botón simplemente
desaparecía: no se podía insistir y tampoco quedaba en pantalla ninguna señal de que el
correo había llegado a salir. Ahora se sella **a quién, cuándo y cuántas veces**
(`pago_solicitado_to` / `_at` / `_veces`) y se dice en los tres sitios donde se mira: bajo el
botón del cuadro de mando ("✓ Pedido hace 3 días a jesus@… · ya recordado"), en el subtítulo
del popup y en la fila de la factura de la fase 4. El historial del lote lo registra aparte,
distinguiendo "Pedido" de "Recordado (2ª vez)".

**REGLA — los adjuntos se preparan ANTES de mandar nada**, y si falta la factura de
alguno de los lotes pedidos NO sale el correo (mismo criterio que el envío conjunto al
instalador). `documentos_so[factura_verificador].pago_solicitado_at` sella lo pedido y es
lo que apaga el botón: sin él, el mismo correo se le manda al S.O. cada vez que alguien
entra en la pantalla.

El importe de cada factura sale del PDF (`importe`, leído por el OCR) y, si esa factura
se subió antes de que la app supiera leerlo, de `lotes.coste_verificacion` — es la misma
cifra tecleada a mano. Sin ese respaldo el botón anunciaba 1.564 € donde había 4.883.

**REGLA — el correo saluda a QUIEN LO RECIBE, no al que firma.** El representante legal
es quien firma los documentos y casi nunca quien lee el correo del día a día (aquí firma
Pedro José y el correo lo lee Jesús, el director de operaciones): saludar al firmante
delata que el texto está hecho con una plantilla. Las personas del S.O. se ofrecen como
**botones con su cargo** (`toSuggestions`, de `soContactos.destinatarios`) y **al cambiar
de destinatario el saludo se rehace solo** (`messageFor`) — salvo que el mensaje ya se
haya editado a mano, que entonces no se toca. El resto de contactos siguen disponibles
para ponerlos en copia.

⚠️ **El campo de COPIA no puede ir en mayúsculas.** La regla global de `index.css` pone en
mayúsculas todo `input` que no sea `type="email"`, y el de CC admite varias direcciones
separadas por comas, así que no puede declararse `email`. Lleva la clase de escape
`no-uppercase` (que usa `!important`, o la regla global le gana por especificidad).

Para añadir otra petición (firmar algo, confirmar una fecha) basta con otra entrada en
`PETICIONES`: la decisión de si se puede pedir, el texto del correo y el asunto viven
juntos ahí.

---

## Presupuesto ESTIMADO — la propuesta lo dice, y dice a qué afecta (2026-09-03)

El flujo interno preguntaba el dinero DOS veces seguidas: la pantalla de soltar el
presupuesto/las facturas y, si no se adjuntaba nada, el `Step8` volviendo a preguntar
"¿hay un presupuesto orientativo?" para acabar estimando 15.000 €. Y de ahí salía una
propuesta que presentaba esos 15.000 € **como si fueran el presupuesto del cliente**,
con su inversión neta y su deducción calculadas encima.

### Una sola pregunta, con tres salidas

`StepDocsObra` es ahora el ÚNICO paso económico del flujo interno. Dos tarjetas
(Presupuesto · Factura) que abren un **popup**, y dentro del popup conviven las dos
formas de aportarlo: **soltar el documento** (lo lee el OCR) o **teclear el importe**.
La tercera salida es el botón "No tengo — estimar 15.000 €".

**REGLA — el popup, no dos zonas de suelta abiertas.** Con las dos a la vista hay que
decidir en cuál se suelta antes de saber qué se va a soltar, y sobre todo faltaba el
caso más común: tener el importe pero no el PDF a mano.

**REGLA — "no tengo" NO es saltarse el paso: es ELEGIR el estimado.** El botón dice la
cifra y la pantalla explica qué implica, porque de ahí sale una propuesta que el cliente
va a leer como firme.

### La marca viaja hasta la propuesta

Fuente única del concepto, de la cifra y del texto:
[logic/presupuestoEstimado.js](implementation/frontend/src/features/calculator/logic/presupuestoEstimado.js)
(`PRESUPUESTO_ESTIMADO_EUR`, `esPresupuestoEstimado`, `avisoPresupuestoEstimado`,
`lineaPresupuestoEstimado`).

`funnelToInputs` sella `inputs.presupuestoEstimado`, y **cualquiera que teclee un
presupuesto en la calculadora lo levanta** (los tres campos de `CalculatorForm`). Se
enseña en cinco sitios, todos desde el mismo texto: la chapa de la portada, el
"(ESTIMADA)" de la fila de inversión, un recuadro naranja bajo la tabla, la nota al pie
y el **mensaje de envío** (WhatsApp/email), que se pega al final de `buildCaption` en
vez de repetirse en sus quince ramas.

**REGLA — el bono CAE NO cambia y la deducción SÍ, y hay que decir las dos cosas.** El
CAE sale del ahorro de energía CERTIFICADO (kWh), así que el importe prometido se
mantiene; la deducción del IRPF es un porcentaje del coste total de la ejecución **IVA
incluido**, así que se mueve con el presupuesto, y con ella la inversión neta. Decir
solo "es estimado" deja al cliente pensando que toda la propuesta puede caerse.

**REGLA — sin deducción, ese párrafo NO se escribe** (`conIrpf`). En un titular empresa
(`includeIrpf: false`) advertir del efecto sobre algo que no existe es ruido sobre la
única cifra que sí es firme.

**REGLA — con "ocultar coste de obra" no se avisa.** Ahí el presupuesto no aparece por
ninguna parte y ya hay una nota que lo explica: dos avisos sobre lo mismo se contradicen.

El backend (`leadMessages.presupuestoNote`, que alimenta el WhatsApp y el email del
funnel público) carga ESE MISMO módulo por `import()` ESM —igual que `cifoService` con
`cifoDoc.js`—, así que al cliente que primero recibe el mensaje del funnel y luego la
propuesta se le explica lo mismo con las mismas palabras. Por eso `buildWhatsAppMessage`
y `buildProposalPdfHtml` son ahora `async`.

⚠️ De paso, las **notas al pie de la propuesta se numeran solas**: escritas a mano, la
del coste de obra y la del ahorro anual eran las dos "NOTA 3" y podían salir juntas.

---

## El CEE que MANDA, y qué se avisa antes de generar (2026-09-03)

La demanda de calefacción, la superficie y la demanda de ACS de todo documento del
expediente salen de UNA regla: **si hay CEE FINAL cargado manda el final; si no, el
inicial**. Fuente única: [ceeFases.js](implementation/frontend/src/features/expedientes/logic/ceeFases.js)
(`ceeBaseDocumento`), que consumen el CIFO, las cuatro fichas, el panel económico
y el detalle del expediente.

**REGLA — la regla estaba escrita cuatro veces, y en otras cuatro NO estaba.** Las
fichas RES060 y RES093 (y sus dos modales, que duplican el HTML) leían
`cee.cee_final` a secas: un expediente con la obra sin terminar —el caso normal—
imprimía **D_CAL = 0,00 y D_ACS = 0,00** mientras el CIFO del MISMO expediente
salía con los del inicial. Dos documentos del mismo expediente contradiciéndose.

### Retirar un CEE lo retira DE VERDAD

El fichero vive en Drive y la cifra en Supabase (`cee.cee_final`), así que borrar el
`.xml` del slot **no tocaba la demanda**: medido en 26RES060_177, el certificador
subió un CEE final, el admin borró el fichero, y el CIFO se seguía calculando con
aquellos 241,28 kWh/m²·año. Lo mismo la economía del expediente y la ficha.

**REGLA — no se borra en silencio: se PREGUNTA, y solo al ADMIN.** La demanda entra
también por "Cargar CEE" (PDF/fotos con OCR) y a mano, casos en los que ese slot
está vacío y el dato es bueno; un borrado automático destruiría lo que nadie subió
como `.xml`. Al borrar el `.xml` se ofrece vaciar también los datos, con las cifras
a la vista, y hay un botón suelto junto a la demanda para lo YA borrado — sin él, el
único camino era el SQL (el recuadro de la rejilla es de solo lectura).

**REGLA — se vacía la fase ENTERA** (`patchVaciarCee`): el objeto parseado, el XML
crudo y las fechas de visita y firma que el certificado sembró. Todo a `null`, nunca
con `delete`: el PUT funde `{ ...existing.cee, ...cee }` y una clave ausente conserva
el valor viejo. **No se toca `emisiones_manual`, `superficie_manual_*` ni
`dacs_manual`**: eso lo tecleó una persona y no lo puso ningún certificado.

### Antes de generar, la puerta AVISA

`avisosCeeDocumento(expediente)` alimenta el gate previo al CIFO, al certificado
RES080 y a la ficha oficial (`ValidationModal`, que ahora separa lo que FALTA —rojo—
de lo que hay que REVISAR —ámbar—):

| Situación | Qué dice |
|---|---|
| Sin CEE final | Se genera con el INICIAL, y con qué demanda y superficie |
| Sin CEE final **y ACS en alcance** | La D_ACS sale también del inicial: **es la cifra que SÍ cambia** entre los dos certificados |
| Sin CEE final **y RES080** | El ahorro se justifica comparando los dos: el que se imprima no es el definitivo |
| Los dos, D_ACS distinta | Se usa la del FINAL, que es lo correcto — compruébalo |
| Los dos, D_CAL distinta (no RES080) | La actuación no toca la envolvente: debería ser la misma |
| ACS fuera de alcance | Nota informativa: D_ACS y SCOP_dhw salen como "no aplica" (regla 12.b) |
| ACS en alcance pero **sin equipo identificado** | El documento imprime su D_ACS y su SCOP_dhw, pero el ahorro NO lo cuenta |

**REGLA — un dato que FALTA y un dato que hay que REVISAR no son lo mismo.** La
validación pedía `cee.cee_final.demandaCalefaccion` y cantaba "Datos faltantes:
Demanda Calefacción (CEE Final)" en un expediente que sí la tiene y que iba a
imprimir la del inicial. Un rojo que no significa nada se ignora al tercer día.

**REGLA — los avisos de ACS solo salen si el ACS ENTRA en el documento**: si se actúa
sobre él (`acsEnAlcance`, ahora fuente única en `aerotermiaUnits.js` — estaba copiada
en cinco sitios) y si la D_ACS sale del certificado (`acs_method === 'xml'`; en modo
CTE o manual no depende de qué CEE mande). Fuera de alcance no se avisa de nada: el
documento ya imprime "no aplica".

**REGLA — un aviso `info` acompaña, pero no interrumpe.** Si lo único que hay que
decir es que el ACS sale como "no aplica", el documento se genera sin puerta: una
puerta que se abre siempre deja de leerse.

---

## Un REQUERIMIENTO vuelve a pedir la firma del Anexo I y del Convenio (2026-09-04)

Cuando el verificador emite un requerimiento y **cambia el importe de la ayuda**, el Anexo I
y el Convenio de Cesión que el cliente ya firmó dejan de servir: declaran una cifra que no
es la que se va a tramitar, y esa discrepancia es lo primero que compara quien los revisa.
Hasta ahora la app no tenía forma de decirlo — el expediente daba las dos firmas por
recibidas, el parte diario no vigilaba nada y el enlace del cliente le enseñaba sus dos
papeles como ya entregados.

Es el mismo mecanismo de re-firma del CIFO (regla 27), generalizado a los tres documentos.

| Qué | Dónde |
|---|---|
| Qué documentos tienen re-firma, y si la firma que hay sigue valiendo | [docValidacion.js](implementation/backend/utils/docValidacion.js) — `BORRADORES_CLIENTE.refirma`, `refirmaPendiente`, `firmaVigente` |
| Registrar el requerimiento (sello + contexto + historial) | `POST /api/expedientes/:id/documentos/rechazar` con `tipo:'requerimiento'` |
| Importes, plazo y TEXTOS del mensaje | [logic/requerimientoFirma.js](implementation/frontend/src/features/expedientes/logic/requerimientoFirma.js) |
| Superficie | El popup de **rechazo** del módulo Documentación, con dos modos; el envío, `EnviarAnexosModal` |
| Prueba del ciclo entero, sin BD | `node implementation/backend/scripts/test_refirma_requerimiento.js` |

**REGLA — se lanza desde el POPUP DE ENVÍO, igual que el del instalador.** El selector
*Primera firma · Requerimiento* va pegado al mensaje, que es donde se ve el efecto de
elegir uno u otro, y por defecto sale **Requerimiento cuando ya tenemos alguna firma** de
esos anexos: nadie reenvía por gusto un documento que ya volvió firmado (mismo criterio que
`CertificadoCifoModal`). Al lado, el plazo en días, porque de ahí salen la fecha del mensaje
y la de la página de firma y tienen que ser la misma. Cambiar de plantilla **rehace el
texto aunque se hubiera editado**: son dos mensajes que no comparten una sola frase.

**REGLA — el importe del mensaje se recalcula DENTRO del compositor, no se lee del render.**
Al pulsar la otra plantilla el estado aún no ha llegado, y el texto salía anunciando la
cifra de la plantilla anterior — un mensaje de primera firma prometiendo el importe del
requerimiento, o al revés.

**REGLA — quien SELLA la re-firma es el módulo de Documentación, no el popup.** El envío le
devuelve en `onMarkSent(docs, links, meta)` qué plantilla se usó; el módulo, que es el dueño
del expediente, sella `{doc}_refirma_at` **solo en los anexos de los que ya había firma**,
guarda el contexto y escribe el historial. Así el mismo sellado vale se entre por el popup
de envío o por el registro del requerimiento.

**REGLA — también es el MISMO botón que el rechazo, con dos modos.** El gesto es idéntico ("este
documento firmado ya no vale, hay que volver a pedirlo") y duplicarlo en un botón nuevo
habría llenado una fila que ya lleva tres controles. Lo que cambia es de quién es la culpa:
un rechazo dice "lo hemos corregido"; un requerimiento, "no has hecho nada mal, ha cambiado
el importe". Por eso el tipo se elige ARRIBA del todo y condiciona el texto, el destinatario
por defecto y los botones. Solo se ofrece sobre un anexo del cliente **ya firmado**: sin
firma que anular, un requerimiento no es más que un reenvío.

**REGLA — afecta a los DOS anexos a la vez.** Se firman juntos, en la misma sentada y desde
el mismo enlace: pedirlos por separado son dos mensajes el mismo día diciéndole cada uno que
le falta "un" documento. El sello va solo en los que YA están firmados — marcar uno que aún
no ha vuelto dejaría una re-firma pendiente eterna que el parte diario reclamaría para
siempre.

**REGLA — el importe nuevo sale del ahorro VERIFICADO, no de un campo del mensaje.** Es el
mismo número con el que se le va a pagar y el que imprime el convenio adjunto. El popup pide
el **ahorro verificado en kWh**, lo guarda en `instalacion.verificacion.ahorro_verificado_kwh`
y deja que `calculateFinancials` calcule el importe con las tarifas del expediente
(`results.caeBonusVerificado`); un importe tecleado a mano habría hecho que el mensaje y el
PDF pudieran decir cosas distintas, y el cliente firmaría el que no es.

**REGLA — mientras el requerimiento esté vivo, los anexos se GENERAN con la cifra nueva.**
No solo al reenviarlos: también desde el botón "Generar" de la fila (`resultsParaDocumento`).
El borrador de Drive es lo que sirve el enlace de firma, así que regenerarlo con el estimado
de siempre machacaría el bueno y el cliente volvería a firmar el documento invalidado, sin
que nadie lo notara. El anterior se archiva en `6. ANEXOS CAE/OLD`, como cualquier reemplazo.

**REGLA — el firmado que tenemos deja de CONTAR, pero no se borra.** `{doc}_refirma_at`
posterior a `{doc}_signed_at` significa "existe el fichero, pero es de la versión anterior":
el slot pasa a ámbar con su aviso (importe anterior → nuevo y plazo), la vista pública deja
de darlo por recibido y el radar del parte diario lo vigila como firma pendiente — contando
desde la re-firma, no desde el envío original, que es de hace meses y arrancaría el aviso con
un retraso inventado. Lo cierran las TRES vías por las que puede llegar la firma nueva: el
enlace público (`/anexos-upload`, que no pasa por `mergeDocumentacion` y lo hace a mano), el
PUT del expediente y la subida desde la app — esta última lo limpia explícitamente porque
Drive puede devolver el mismo enlace al reemplazar el fichero, y entonces el merge no lo vería.

**REGLA — un importe que BAJA se cuenta con lo que ha costado sostenerlo.** Un
requerimiento no es una carta que llega y se traslada: es un expediente que podía decaer
entero y que se ha defendido documento a documento hasta dejarlo aprobable. Anunciar la
cifra a secas convierte una gestión ganada en una mala noticia — el cliente entiende que le
hemos recortado la ayuda, cuando lo que se ha evitado es perderla. El mensaje dice primero
QUÉ SE HA HECHO y termina en que **el expediente sigue adelante**; la cifra va dentro de esa
frase, nunca antes. Solo se dice cuando el importe baja: si sube, o si no hay cifra nueva,
hablar de haberlo salvado es adornar algo que no ha pasado.

Y lo dicen IGUAL las cuatro superficies, porque es justo donde dos redacciones se
contradicen (una diciendo que hemos salvado el expediente y otra que la ayuda ha bajado): el
mensaje (`mensajeRequerimiento`), el asiento del correo y el aviso previo
(`tituloRequerimiento`) y la página de firma, que repite el relato en su propio JSX.

**REGLA — al cliente se le explica ANTES de que abra los papeles.** El mensaje dice, en este
orden: qué ha pasado, qué importe pasa a tener su ayuda, qué plazo tenemos, qué necesitamos y
que la versión anterior queda anulada. Y la página de firma repite el aviso con las mismas
cifras: quien vuelve al enlace desde un WhatsApp de hace un mes no tiene el correo delante.
Se le dice expresamente que **no ha hecho nada mal** — es la primera conclusión a la que
llega quien recibe dos veces el mismo documento.

**REGLA — el aviso previo del popup es OPCIONAL y por defecto no se manda.** Los documentos
nuevos salen a continuación con su propio mensaje; dos correos seguidos sobre lo mismo se
leen como un lío. Por eso elegir "Requerimiento" pone el destinatario del aviso en "sin
aviso".

---

## La firma A MANO se hace CON EL MÓVIL (2026-09-06)

"Firma a mano" pedía impresora y escáner para devolver dos folios, y el cliente que no
tenía las dos cosas se quedaba parado sin decirlo. Ahora, en `/firmar-anexos`, esa opción
abre un ASISTENTE: lee los anexos, los firma con el dedo y manda la foto del DNI. Sin
papel. La vía de siempre sigue viva —hay quien ya lo tiene firmado— como tercera opción,
**"Ya lo tengo firmado en papel"**.

El recorrido es el que se haría con los papeles delante, y en ese orden:

```
preparar → [leer · firmar · revisar] × documento → DNI delante → DNI detrás → enviar
   (Convenio de Cesión primero, Anexo I después)
```

| Qué | Dónde |
|---|---|
| El asistente (pasos, visor, DNI, envío) | [AsistenteFirmaManuscrita.jsx](implementation/frontend/src/features/firma/AsistenteFirmaManuscrita.jsx) |
| La hoja donde se firma | [SignaturePad.jsx](implementation/frontend/src/features/firma/SignaturePad.jsx) |
| La tinta | [ink.js](implementation/frontend/src/features/firma/ink.js) — **port literal de ScannerApp** |
| Estampar + "aspecto escaneado" | [escaneado.js](implementation/frontend/src/features/firma/escaneado.js) |
| Dónde cae la firma | `SIGN_BOXES` — la MISMA fuente que usa Autofirma |
| Recepción (sin cambios de fondo) | `POST /api/public/anexos-upload/:id`, que ya anexa los dos DNI |

**REGLA — la tinta es un PORT de ScannerApp, no una reinterpretación.** `ink.js` es
`ScannerApp/src/renderer/lib/ink.ts` traducido a JS y nada más: la física del trazo
(adelgaza con la velocidad, grano del papel, empastado en las esquinas, plumín plano) está
depurada allí contra firmas reales. Si se corrige algo, se corrige **en ScannerApp y se
vuelve a portar**; parchear esta copia por su cuenta hace que la firma de la app y la de
ScannerApp dejen de parecer la misma mano. Aquí va fija en **PLUMA** y trazo **MEDIO**: al
cliente no se le pregunta con qué firma —elegir entre tres plumas no le aporta nada y es
una pantalla más antes de la única que importa.

**REGLA — se LEE antes de firmar, y hay que llegar a la última página.** El convenio dice
"habiendo leído por sí mismos y hallándose conformes": un botón de firmar activo desde el
primer instante convierte esa frase en mentira, y es lo único que separa esto de un clic de
aceptación.

**REGLA — el documento se lee A PANTALLA COMPLETA** ([LectorDocumento.jsx](implementation/frontend/src/features/firma/LectorDocumento.jsx),
portaleado). Encajado en la tarjeta era un A4 dentro de una caja de 520 px dentro de una
página con márgenes: en un móvil el cuerpo del texto quedaba a unos 6 px — se veía que había
un documento, pero no se leía, y leerlo es justo lo que se le está pidiendo. Lleva **zoom**
(100 / 160 / 220 %, con desplazamiento lateral), porque a ancho completo un A4 entra entero
en la pantalla pero con la letra ilegible. El lienzo se recorta a 4 MPx: un A4 al 220 % en
una pantalla densa pide 11 MPx (44 MB) y un móvil modesto cierra la pestaña.

⚠️ **pdf.js puede quedarse colgado SIN dar error, y hay que ponerle plazo.** Crea su worker
con `type: "module"`; si el navegador no lo arranca pero tampoco lanza un error, la promesa
no resuelve NUNCA — no hay plazo interno ni fallback. Se ve como una hoja en blanco eterna,
sin aviso, que es lo que peor se explica por teléfono (medido en un Android real, con el
mismo enlace funcionando en el ordenador). El lector espera `PLAZO_MS` (15 s) y, si no hay
documento, enseña la salida: **"Abrir el documento"** con el visor propio del teléfono, y
solo entonces un "Ya lo he leído" que desbloquea la firma. El motivo técnico se imprime en
pequeño: sin él, un fallo en el móvil de un cliente no se puede diagnosticar.

**REGLA — el documento sale RASTERIZADO, y eso es lo que se quiere.** Un PDF con texto
seleccionable y una firma pegada encima no se parece a lo que se venía recibiendo (un
escaneo) y delata que el papel nunca existió. Rasterizado a 150 DPI / JPEG 0,85 es
indistinguible de imprimir, firmar y escanear — que es exactamente lo que ha pasado, sin el
papel. Lo hace el NAVEGADOR (pdf.js, que ya está en el bundle para el visor de Autofirma, +
jsPDF): no hay Python delante del cliente, y de paso sale gratis lo que en ScannerApp son
dos operaciones — si la página se convierte en imagen, la firma se pinta sobre el píxel y
no hay que incrustar nada en el PDF.

**REGLA — el GROSOR del trazo lo fija el DOCUMENTO, no la pantalla.** La firma se
estampa al ancho de su recuadro, así que el trazo acababa midiendo lo que tocara según
lo grande que cada uno firmase: medido, **de 2,44 pt firmando grande a 5,92 firmando
compacto** — 2,4 veces, con la misma punta. Ninguna calibración fija aguanta eso. Al
aceptar, `SignaturePad` **repinta la firma** con el radio que deja `TRAZO_PT` = 2,0 pt
una vez aplicada la escala de estampado (`radioParaTrazo`), en dos pasadas porque
cambiar el radio mueve un poco la caja de la tinta. Resultado medido: las seis
combinaciones dentro del ±3 %.

Los 2 pt no son un gusto: la firma de **Brokergy impresa en la columna de al lado** del
Convenio mide 2,25 pt de trazo (medido sobre `firma_brokergy.png`), y dos firmas con
grosores distintos en la misma página es lo que se ve a un metro, antes que nada del
documento. Antes salía a 3,70 pt en el caso normal — casi el doble que la de al lado.

⚠️ Esto arregla también el fallo CONTRARIO: en el Anexo I **oficial**, cuyo recuadro es
más pequeño, el trazo salía a **0,53 pt**, un pelo casi invisible.

**REGLA — la calibración se COMPRUEBA, porque depende de la tinta.** `radioParaTrazo`
usa dos constantes medidas sobre la física de `ink.js` (`TRAZO_A`/`TRAZO_B`), y `ink.js`
es un port literal que se re-porta entero cuando ScannerApp cambia. Si se quedan atrás,
nada falla de forma visible: la firma sale de otro grosor y nadie se entera hasta ver un
documento. Tras tocar la tinta o el estampado:

```bash
node implementation/backend/scripts/check_trazo_firma.mjs
```

Vive en [trazoFirma.js](implementation/frontend/src/features/firma/trazoFirma.js) y no en
`escaneado.js` por dos motivos: lo necesita el LIENZO —y `escaneado.js` arrastra pdf.js y
jsPDF, 1,4 MB que el teléfono no abre— y sin dependencias se puede medir desde el script.

⚠️ **La caja del documento tiene que llegar hasta el lienzo**, también por el QR: el
teléfono no sabe qué se está firmando, así que el recuadro viaja en la sesión de firma
móvil (son cuatro coordenadas de una plantilla, geometría y no un dato de nadie; el
documento sigue sin salir del ordenador). Y en el Anexo I `SIGN_BOXES` entrega una
FUNCIÓN —la caja depende del formato del impreso (regla 41)—, así que el asistente la
resuelve al abrir el PDF (`resolverCaja`) y pasa la MISMA al lienzo y al estampado: con
dos criterios distintos se calibraría contra un recuadro y se estamparía en otro.

**REGLA — el tope que manda es el ALTO, no el ancho.** Una firma de verdad es una rúbrica
compacta —más cuadrada que apaisada— y los recuadros de firma son apaisados, así que el que
recorta casi siempre es el alto. Con el alto al 62 % una rúbrica cuadrada salía ocupando un
cuarto del ancho de su caja y en el Anexo I se veía perdida en el hueco; al **82 %** queda del
tamaño con el que se firma un papel. Referencia para no pasarse: la firma de Brokergy impresa
en la columna del Cesionario del Convenio ocupa el 97 % del alto de la suya. (Esto decide el
TAMAÑO de la firma; el grosor del trazo lo fija `TRAZO_PT`, arriba.)

**REGLA — la firma cae donde diga `signBoxes.js`, la misma fuente que Autofirma.** Con una
copia de las coordenadas aquí, la firma electrónica y la manuscrita acabarían en sitios
distintos del mismo documento el día que cambie la plantilla. Dentro del recuadro se
centra, conserva su proporción (nunca se estira: una firma deformada canta a montaje desde
el otro lado de la mesa) y se apoya sobre la línea. Verificado sobre las dos cajas: la del
Convenio (258×123 pt) y la del Anexo I (227×75 pt).

⚠️ **`page.render` NECESITA `intent: 'print'` para rasterizar.** Pintando para pantalla,
pdf.js reparte la página en trozos encadenados con `requestAnimationFrame`, y **rAF no corre
con la pestaña en segundo plano ni con el móvil bloqueado**: medido, el escaneo se quedaba
parado PARA SIEMPRE en cuanto la pantalla dejaba de estar a la vista, y que el cliente mire
un WhatsApp mientras se prepara su documento es el caso normal. Con intención de impresión
pinta del tirón (y de paso, 179 ms en vez de 1.859).

⚠️ **pdf.js VACÍA el array de bytes que se le pasa** (lo transfiere al worker). Por eso
`cargarPdf` copia SIEMPRE: sin la copia, el segundo uso del mismo PDF —escanearlo después
de haberlo leído en el visor, o "volver a firmar"— recibía cero bytes y el proceso se
colgaba en "preparando tu documento firmado", sin error.

**REGLA — cada documento se cierra ANTES de pasar al siguiente.** Al aceptar la firma se
estampa y se escanea ahí mismo, y lo que se enseña es el resultado de verdad, no una
simulación. Dejándolo todo para el final, un fallo al componer aparecería después de que el
cliente diera por hecho que había terminado.

**REGLA — la foto del DNI se ENCOGE en el navegador, al elegirla.** Un móvil de hoy hace
fotos de 3-5 MB y las dos caras iban tal cual dentro del Convenio: medido, el anexo firmado
pesaba **6,7 MB de los que 5,5 eran el DNI**. Eso lo sube el cliente por datos móviles —justo
donde la conexión falla— y no aporta nada: a 1800 px de lado mayor el documento ocupa unos
1200 px de ancho, más que un escaneo a 300 ppp, y el número se lee igual (comprobado
ampliando el recorte: 2,91 MB → 473 KB, el 84 % menos). Se comprime AL ELEGIRLA y no al
enviar, para que la vista previa sea exactamente lo que va a viajar; y ante cualquier fallo
se devuelve el original, porque una foto pesada se sube y una foto estropeada hay que
repetirla — y quien la hace ya ha firmado dos documentos.

⚠️ **Los ANEXOS escaneados no se tocan.** Medido sobre el Anexo I real: de 150 dpi/q0,85
(701 KB) solo se baja a 429 KB forzando 110 dpi, y ahí ya peligran las notas al pie que lee
el verificador. La ganancia estaba en el DNI, no en el documento.

**El DNI se pide DESPUÉS de firmar, cara a cara** (`capture="environment"` abre la cámara
trasera), con la foto a la vista para poder repetirla — y con la salida de **subir un PDF**,
que es lo que tiene quien ya lo lleva escaneado y suele traer las dos caras. Ese es el único
cambio de fondo en el backend: `dni_pdf` como ALTERNATIVA a las dos caras (no un añadido),
más `firma_origen: 'asistente'`, que se sella en `documentacion` y viaja en el aviso al
staff — que la firma se trazara sobre el borrador que servimos nosotros no se puede
reconstruir después mirando el PDF.

El montaje final NO cambia: el Convenio se archiva con el DNI del cliente y el del
representante de Brokergy anexados, por `buildCesionManuscrita` (regla 22.b), igual que un
escaneo de papel. Y la contrafirma tampoco hace falta: el borrador ya lleva impresa la firma
de Brokergy en la columna del Cesionario.

### Y si se está en el ORDENADOR, la firma se pasa al MÓVIL con un QR

Una firma hecha con el ratón es una mala imitación de la de uno: el pulso va en la muñeca y
sale rígida, con el ancho constante de una polilínea. Así que **con un ratón delante no se
abre la hoja: se ofrece primero el QR** (`FirmarConMovil`), y solo debajo "Firmar aquí con el
ratón". Con un dedo delante se va derecho a la hoja — un QR en un móvil no tiene sentido.
Lo decide `matchMedia('(pointer: coarse)')`, el PUNTERO y no el ancho: un portátil táctil de
15" firma con el dedo perfectamente y un móvil enchufado a un monitor sigue siendo un móvil.

Es un port del planteamiento de `ScannerApp/src/main/signServer.ts` + `PhoneSignModal.tsx`,
con la diferencia de que aquí SÍ hay servidor: no hace falta levantar uno en el equipo.

| Qué | Dónde |
|---|---|
| Las sesiones (token, caducidad, IPs) | [firmaMovil.js](implementation/backend/services/firmaMovil.js) |
| Rutas | `POST /api/public/firma-movil` · `GET|POST /firma-movil/:token` · `GET /firma-movil/:token/esperar` |
| El QR en el ordenador | [FirmarConMovil.jsx](implementation/frontend/src/features/firma/FirmarConMovil.jsx) |
| Lo que ve el teléfono | [FirmaMovilView.jsx](implementation/frontend/src/features/firma/FirmaMovilView.jsx) → `/firma-movil/:token` |

**REGLA — al teléfono NO le viaja el documento; solo vuelve la firma.** Igual que en
ScannerApp: al móvil se le manda una hoja en blanco y el NOMBRE de lo que se firma, nada
más. Es lo que hace razonable abrir esto con una cámara — con el token en la mano, lo único
que se puede hacer es mandar un PNG. Y de paso evita pedirle a nadie que busque el "Fdo."
dando pellizcos a una pantalla de seis pulgadas: el documento ya se ha leído en el PC.

**REGLA — el token es de UN SOLO USO y dura 10 minutos**, y se marca como usado ANTES de
guardar la firma: si el móvil reintenta por un timeout de red, no puede colar una segunda
firma con el mismo enlace. Al recogerla, el PC cierra la sesión. Un segundo documento pide
un enlace NUEVO.

**REGLA — las sesiones viven en MEMORIA.** Duran minutos y con el usuario delante; una tabla
obligaría a limpiar filas muertas para siempre a cambio de sobrevivir a un reinicio que, si
ocurre, se resuelve pidiendo otro enlace. Es lo contrario que el bot de WhatsApp, donde un
reinicio nocturno sí se comería una pregunta.

**REGLA — el PC PREGUNTA cada 2 s; no hay websocket.** Dura un minuto, y así sobrevive a que
el ordenador recargue la página.

⚠️ **En LOCAL el enlace se compone con la IP de la RED LOCAL, no con `localhost`**: en el
teléfono, `localhost` es el propio teléfono. `direccionesLan()` copia los pesos de ScannerApp
(se penalizan VirtualBox, VMware, Docker, WSL, VPN) y CONSERVA el puerto del origen que pidió
el enlace, así que sale `http://192.168.1.x:5173/firma-movil/…` y se puede probar con el
móvil sin desplegar nada. Acertar con la IP siempre es imposible, así que "¿No conecta?"
ofrece las demás con su propio QR. En producción manda el origen real.

⚠️ **Dos cosas que solo se ven probando DESDE OTRA IP** y que costaron el diagnóstico:
- `FirmaMovilView` **y `FirmarAnexosView`** piden la API en **relativo** (`/api/public`).
  Las demás vistas públicas apuntan a `http://localhost:3000` en desarrollo y les vale
  porque se abren en el mismo ordenador que corre el backend; estas dos las abre el CLIENTE
  con el móvil, y en relativo se puede recorrer el proceso ENTERO desde el teléfono entrando
  por `http://<ip-lan>:5173/firmar-anexos/<id>` — que es donde se ve de verdad si los
  documentos se leen en una pantalla de seis pulgadas.
- El **CORS** del backend rechazaba el origen de la LAN (`esLanPrivada` en `server.js`). Solo
  se admite fuera de producción y solo en rangos privados: en el VPS `NODE_ENV=production` y
  la lista sigue siendo `FRONTEND_URL`.

⚠️ **`SignaturePad` y el aviso de "gira el teléfono" van PORTALEADOS a `document.body`**
(regla 29.b). La tarjeta de `/firmar-anexos` lleva `backdrop-blur-xl`, y un `position: fixed`
se ancla al ancestro más cercano con `backdrop-filter`: la "pantalla completa" se recortaba a
esa tarjeta y la hoja salía en una franja de 200 px con los botones amontonados. El aviso
necesita además su propio portal — vivía dentro de `#root`, que apila ANTES que el portal de
la hoja, así que quedaba DEBAJO de ella por mucho z-index que llevara.

---

## ¿Tienes placas solares? — se pregunta UNA vez y acompaña al inmueble (2026-09-07)

Pregunta nueva del formulario de captación `/reforma`, al cerrar el bloque de "cómo
está hoy la vivienda" (caldera → emisores → ACS → **generación propia**) y antes de
hablar de la obra: es un dato del INMUEBLE, no de la actuación.

```
funnel (`placas_estado` · `placas_kwp`)
   → oportunidad (`inputs.fotovoltaica`, visible y editable en la calculadora)
   → expediente (`instalacion.fotovoltaica`, editable en Instalación)
   → encargo del CEE al certificador (ce3xFinal · ce3xTextos)
```

Fuente única de los valores, la normalización y las etiquetas:
[logic/fotovoltaica.js](implementation/frontend/src/features/expedientes/logic/fotovoltaica.js).
El backend la carga por `import()` ESM (`expedienteService`), igual que `cifoService`
con `cifoDoc.js`.

**REGLA — las TRES respuestas valen, y cada una sirve para algo distinto.** *Sí* → hay
generación en la vivienda y el CEE tiene que declararla; *no, pero me interesa* →
cualifica al cliente para la venta cruzada del momento en que se le paga el bono (hoy,
el formulario de Tally de optimización); *no* → es una respuesta, no un hueco.

**REGLA — `estado: null` NO es `'no'`.** Uno es que nadie lo ha preguntado todavía y el
otro es que el cliente ha dicho que no. Los 240 expedientes anteriores a esto salen
"Sin declarar" (chapa ámbar en Instalación), que es lo que son: si se leyeran como "no
tiene placas", el CE3X les propondría poner las que quizá ya tienen.

**REGLA — a quien YA tiene placas no se le propone ponerlas.** `ce3xTextos` ofrecía
siempre el conjunto de medidas "AUTOCONSUMO FOTOVOLTAICO"; con placas declaradas esa
medida describe una vivienda que no es la suya, así que se sustituye por el aviso
contrario — **declararlo como instalación EXISTENTE** (contribuciones energéticas), con
su potencia. Sin el dato, el texto sigue saliendo y lo dice ("no consta si la vivienda
ya tiene placas"). El mismo aviso viaja en el encargo al certificador
(`buildCe3xFinal`), que es donde lee los datos que tiene que teclear.

**REGLA — se dice "FOTOVOLTAICAS" y se explica que son las de la electricidad.** Dos
pantallas antes, el funnel pregunta por las placas solares **térmicas** (las del agua
caliente, `boiler_acs_type: 'solar'`). Sin la aclaración, quien tiene las térmicas
contesta que sí y el certificado declara una generación eléctrica que no existe.

**REGLA — con placas, la potencia se contesta o se dice que no se sabe.** El botón
"No lo sé ahora mismo" existe para que quien no la sepa no teclee un número cualquiera
con tal de pasar de pantalla. Sin cifra, `potencia_desconocida: true` viaja hasta el
expediente y el encargo se lo dice al certificador — que no es lo mismo que no tener
placas.

**REGLA — el chip de la calculadora sale con el panel PLEGADO.** El bloque editable vive
dentro de "Datos del edificio", que nace cerrado; si el dato solo estuviera ahí, entre la
captación y la aceptación no lo vería nadie. Con placas declaradas, la cabecera plegada
enseña "☀️ FV 3,5 kWp" junto a la superficie y la zona.

⚠️ `fotovoltaica` está en la **BLACKLIST de `normalizeData`**: su `estado` es un enum en
minúscula ('si' | 'futuro' | 'no') que la app compara con `===`, y el PUT del expediente
normaliza `instalacion`. Aun así, `normalizarEstado` lee en minúsculas por si algún
expediente trae 'FUTURO' guardado (mismo gotcha que `cee_source` y `tipo_emisor`).

⚠️ No confundir con `reforma_elementos.placas` (del mismo funnel), que es "voy a instalar
placas EN ESTA OBRA" — el que solo da IRPF y nunca CAE. Son dos preguntas distintas y un
cliente puede contestar que sí a las dos.

---

## Confirmación de cobro — el formulario del final (2026-09-07)

Cuando el CAE está concedido y vamos a ingresarle el bono, al cliente le llega UN
enlace (`/cobro/:expedienteId?token=`) que hace dos trabajos y en este orden:
**cualificarlo** para la venta cruzada (tarifa de luz · fotovoltaica · deducción del
IRPF) y **confirmar sus datos de cobro**, que es el trabajo de verdad — el que evita
la transferencia a una cuenta equivocada.

Sustituye al formulario externo de Tally ("⚡ Confirmación de Datos de Pago y
Optimización de tu Aerotermia"). Traerlo dentro no es dejar de pagar una
herramienta: aquí los datos YA están, así que el formulario llega **relleno** y lo
único que se le pide es confirmar; y la respuesta cae en el expediente en vez de en
una hoja aparte.

| Qué | Dónde |
|---|---|
| QUÉ se pregunta y con qué palabras | [logic/cobroForm.js](implementation/frontend/src/features/cobro/logic/cobroForm.js) |
| A QUIÉN, con qué datos y los textos del mensaje | [cobroService.js](implementation/backend/services/cobroService.js) |
| Lo que ve el cliente | [ConfirmarCobroView.jsx](implementation/frontend/src/features/cobro/views/ConfirmarCobroView.jsx) |
| Rutas públicas | `GET|POST /api/public/cobro/:expedienteId?token=` |
| Rutas internas (staffOnly) | `GET /:id/cobro` · `POST /:id/cobro/enviar` · `GET /cobro/leads` |
| Cuándo se propone | bloque **COBRO** de [seguimientoRadar.js](implementation/backend/services/seguimientoRadar.js) |
| Prueba sin BD y sin enviar nada | `node implementation/backend/scripts/test_cobro_form.js` |

**REGLA — el formulario NUNCA retiene el cobro.** Es una confirmación de datos, no
un peaje: los tres bloques comerciales son OPCIONALES y llevan su "Prefiero no
contestar". Lo único obligatorio son los datos de cobro y —cuando aplica— la forma
de pago.

**REGLA — lo obligatorio va AL FINAL y lo opcional delante.** Al revés, el cliente
cierra la pestaña en cuanto termina lo suyo y no contesta nada más; así, las tres
preguntas están en el camino hacia lo que ha venido a hacer. Es el mismo orden del
formulario de Tally, y no es casualidad.

**REGLA — la forma de pago SOLO se le pregunta a quien asume el coste de gestión.**
Con `inputs.discountCertificates` activo, Brokergy ya lo absorbió y su Convenio de
Cesión **no menciona ninguna deducción** (ver la regla del convenio): preguntarle
cómo prefiere pagarlo le cobraría algo que su contrato no dice. El importe sale de
`result.caeMaintenanceCost` —lo que de verdad calculó la simulación que aceptó— y
solo cae a **250 € sin IVA** si el expediente no trae nada; ése es el MISMO valor de
reserva que `certificatesCost` en `calculation.js`, o el formulario le anunciaría una
cifra distinta de la que se le descontó.

**REGLA — las dos opciones NO cuestan lo mismo, y se dice ANTES de elegir.** El
descuento se aplica sobre la **BASE, sin IVA** (250 €); por factura hay que
repercutirlo (302,50 €) y además el ingreso no sale hasta que esté abonada. Así que
la factura sale marcada como lo que es: icono apagado, chapa ámbar con lo que cuesta
de más ("Más lento y 52,50 € más caro") y el motivo —las dos consecuencias, primero
el retraso y después el dinero— en su propio texto. **No se bloquea**: es una
elección legítima del cliente, pero dos opciones pintadas igual se leen como
equivalentes y ésta le cuesta dinero. La marca es `desaconsejada` + `aviso` en la
opción, y la pinta el componente `Opcion`, nunca cada pantalla por su cuenta.

**REGLA — cambiar de IBAN exige justificante NUEVO.** El que consta va impreso en el
Convenio de Cesión ya firmado; un justificante anterior acredita **esa** cuenta, que
es justo la que el cliente está cambiando. Se comprueba en las dos capas (la vista
lo pide, el POST responde 400 sin él). Si repite el IBAN que ya teníamos no se le
pide nada: ése se acreditó al aceptar la propuesta. La comparación es **sin espacios
y en mayúsculas** — el cliente lo escribe como se lo enseña su banco, y un cambio de
formato no es un cambio de cuenta.

**REGLA — el IBAN nuevo no se pisa en silencio.** El aviso al staff (WhatsApp +
email) empieza por el cambio, con el anterior a la vista y si trae justificante o no:
es lo único de ese mensaje que hay que revisar antes de ordenar la transferencia.

**REGLA — no se promete fecha de ingreso.** Ni en el mensaje, ni en la pantalla de
"gracias". Depende del pago del Sujeto Obligado; una fecha aquí es una reclamación
garantizada dentro de dos semanas.

**REGLA — el bloque de placas llega PRECONTESTADO** con lo que el cliente dijo en la
captación (`instalacion.fotovoltaica`), marcado como heredado y anunciado en
pantalla. Volver a preguntárselo de cero es lo que hace que un formulario parezca
que no se lee. Y lo que conteste aquí **se vuelca de vuelta** al expediente: es la
misma pregunta, y de ahí la leen el CEE y el CE3X.

**REGLA — los datos van a `clientes`, no a una tabla de datos bancarios.** Es la
MISMA tabla y los mismos campos que rellena la firma de la propuesta
(`numero_cuenta`), y el justificante va al MISMO slot
(`documentacion.justificante_titularidad_link`), que es donde ya lo busca el barrido
de "qué falta". En `documentacion.cobro` solo quedan metadatos (regla 21) y se
escriben SIEMPRE con la RPC de MERGE: el token, el envío, las respuestas y el
justificante se sellan en momentos distintos.

**El envío es automático PERO con visto bueno.** El detector `COBRO` lo propone
cuando el LOTE llega a fase de pago (`CAE EMITIDO – PTE PAGO BROKERGY` /
`PTE. PAGO BROKERGY A CLIENTE`) y el expediente no lo ha confirmado; de ahí sale en
la pestaña **Seguimiento** y en el parte diario, con su botón. Nunca antes: hasta
que el lote no está en pago, el importe no es firme (lo puede mover el ahorro
verificado) y pedirle la cuenta a quien todavía no vas a ingresarle nada es
prometerle un dinero con fecha. Se envía en bloque como cualquier otro recordatorio
(`seguimientoLote`), así que un cliente con dos expedientes recibe UN mensaje.

### La bandeja — pestaña **Venta cruzada**

`features/cobro/views/RespuestasCobroView.jsx` sobre `GET /api/expedientes/cobro/respuestas`
(staffOnly). Es lo que antes se miraba en Tally: quién ha contestado, qué ha dicho
y a quién hay que llamar.

**REGLA — pestaña PROPIA, no un rincón de otra.** Va en el grupo *Cartera* y la ve
todo el staff. No en **Seguimiento**, que responde "qué expediente está atascado":
meter ahí trabajo comercial diluye lo único que hace útil al parte, que todo lo que
sale es un expediente parado. Y no en el **Cuadro de mando**, que es ADMIN-only por
los importes — esta lista no lleva un euro y la trabaja quien hace las llamadas.

**REGLA — arranca en los INTERESADOS y el resto se pide.** El conmutador
*Interesados · Todas* existe porque son dos usos distintos: llamar y analizar.
Abriéndola entera, una lista de llamadas se convierte en un inventario. "Ya tengo
quien me lleve la renta" **también se guarda y se enseña** (en gris): saber que no
hay que llamar ahorra la llamada igual que saber que sí.

**REGLA — el CSV exporta lo que estás VIENDO**, con el filtro y la búsqueda
aplicados. Un botón que exporta "todo" mientras la pantalla enseña otra cosa es la
forma más fácil de mandar el fichero equivocado. Separador `;` y BOM: sin ellos,
Excel en español abre una sola columna y se come los acentos.

**La marca de "contactado" se persiste** (`documentacion.cobro.contactado`, con
quién y cuándo) — es lo que separa una bandeja de trabajo de una lista que se relee
entera cada semana. Se puede quitar: la RPC funde, así que desmarcar escribe `null`,
no borra la clave.

Los rótulos de las columnas salen de `BLOQUES`, la MISMA fuente que las preguntas:
una cabecera escrita a mano aquí envejece en cuanto cambie un bloque.

⚠️ El token se **persiste** (no es HMAC con caducidad como `accionToken`): entre que
se le manda y cobra pueden pasar semanas, y caducarlo a los 14 días obligaría a
reenviarlo justo cuando el cliente por fin lo mira. Se compara en **tiempo
constante** — detrás de ese enlace se puede reescribir un IBAN.

---

### El Anexo Fotográfico de un RES080 ve la ENVOLVENTE (2026-09-07)

`anexoConcepts` pedía el checklist con `buildDocChecklist(datos_calculo)` **a
pelo**, que cae a los `inputs` y al funnel de la OPORTUNIDAD. Pero en un RES080 lo
que se rehabilita —ventanas, cubierta, fachada— lo declara el EXPEDIENTE, en
`documentacion.envolvente`. Consecuencia: **la skill y el MCP veían una lista de
apartados distinta de la del modal de la app**, que sí resolvía el alcance
(`public.js` ya llamaba a `docsAlcance.enriquecer`).

Medido en **26RES080_44**, un RES080 cuya actuación principal SON las ventanas: el
anexo salía con **5 actuaciones y 10 fotos** en vez de 7 y 30 — las 8 fotos de
`FOTO_VENTANAS_ANTES` y las 12 de `FOTO_VENTANAS_DESPUES` estaban en Drive con su
nombre canónico y no entraban. En **26RES080_54**, la cubierta y la fachada.

**REGLA — el alcance se resuelve en `syncEnvolventeAndReload`**, que es por donde
pasan las DOS vías de la skill (generar y consultar estado). Es la regla del
checklist (§ "el checklist se pide SIEMPRE por `checklistForOportunidad`") llevada
al Anexo: las superficies que deciden qué documenta un expediente comparten
alcance, y aquí una decidía por su cuenta.

Vigilado por `node implementation/backend/scripts/test_anexo_alcance_res080.js`,
que barre TODOS los RES080 con envolvente declarada (27 hoy) y comprueba que cada
uno pide sus apartados.

⚠️ Esto NO clasifica fotos: si las fotos están sueltas en `2. FOTOS Y VIDEOS/ANTES`
con su nombre de WhatsApp y no hay ninguna `FOTO_*` en `12. DOCUMENTOS PARA CEE`,
el anexo sigue sin tener de dónde tirar — ese paso lo hace la skill renombrando al
slot que corresponde (es el caso de 26RES080_54).


## El CATÁLOGO DE VENTANAS — marcos y vidrios (2026-09-07)

El otro equipo que un RES080 tiene que justificar. Gemelo del catálogo de
`aerotermia`: se elige el modelo y el expediente se rellena solo con **Uf** (marco)
y **Ug + factor solar + composición** (vidrio), y su **ficha técnica se adjunta al
certificado RES080** como anexo, sin buscarla a mano.

| Qué | Dónde |
|---|---|
| Esquema + siembra | `scripts/ventanas_catalogo.sql` — tablas `ventanas_marcos` y `ventanas_cristales` |
| Rutas | [routes/ventanas.js](implementation/backend/routes/ventanas.js) — `/api/ventanas/marcos` · `/cristales` |
| Normalización, etiquetas y volcado al expediente | [logic/ventanasCatalogo.js](implementation/frontend/src/features/expedientes/logic/ventanasCatalogo.js) |
| Huecos de ficha del RES080 (`marco` · `cristal`) | `resolveEnvolventeFichaSlots` en [logic/fichasTecnicas.js](implementation/frontend/src/features/expedientes/logic/fichasTecnicas.js) |
| La ficha del expediente VUELVE al catálogo | [services/catalogoFichas.js](implementation/backend/services/catalogoFichas.js) |
| Pestaña propia (staff) | `features/ventanas/views/VentanasView.jsx` |
| Pruebas | `node scripts/test_catalogo_ventanas.js` · `node scripts/test_ficha_ventana_drive.js` |

**POR QUÉ EXISTE.** Las listas de marcas y modelos vivían en el `localStorage` del
navegador —no se compartían entre usuarios ni entre ordenadores— y el Uf, el Ug y
el factor solar nacían con tres valores fijos: **2,7 · 1,3 · 0,43**. Medido sobre
los 25 RES080 con la envolvente rellena, esos tres números aparecen tal cual en
varios expedientes, que es lo que pasa cuando un valor por defecto parece medido y
no obliga a mirar la ficha. Ahora **nacen vacíos**: se eligen del catálogo o se
teclean, y un hueco se ve.

**REGLA — la MARCA es el fabricante del SISTEMA; el CARPINTERO va aparte.**
«Aluminios Manzanares S.L.» no es una marca de perfil: es quien fabrica y monta la
ventana con perfil de Cortizo o de Kömmerling. En **9 de los 25** RES080 el campo
`marco_nuevo_marca` llevaba la carpintería, así que el certificado declaraba como
fabricante del sistema a una carpintería de pueblo y el Uf no se podía contrastar
con ninguna ficha. El expediente guarda ahora los dos: `marco_nuevo_marca` (del
catálogo) y **`marco_carpinteria`** (texto libre). El certificado imprime la fila
"Carpintería que la fabrica y monta" solo cuando difiere de la marca — decirlo dos
veces sería ruido. Los 9 históricos se separaron con
`scripts/separar_carpinteria_de_marca_ventana.sql`, dejando la marca VACÍA: de
esos expedientes no consta qué sistema se instaló, y adivinarlo (PLANIA es de
STRUGAL, A.61 RPT de SIMER) sería meter en un certificado una marca sin comprobar.

**REGLA — el Uf es de la serie EN SU APERTURA, no de la serie.** Por eso una fila
por (marca, serie, **apertura**): la STRUGAL PLANIA da 1,30 en doble junta, 1,25 en
triple y 1,10 con refuerzo con rotura; la Cortizo A70 abisagrada, 1,30, y la C70
corredera, 1,80. Una fila por serie autorrellenaría el Uf de la tipología
equivocada, que es justo el error que el catálogo viene a evitar.

**REGLA — el Ug es de la capa MÁS la composición.** Una fila por (fabricante,
gama, **composición**): el mismo Guardian Sun da Ug 1,3 en 4/16/4 con aire y 1,0
con argón. Es también como están nombradas las fichas de "02. CRISTALES".

**REGLA — un valor que no está ESCRITO en la ficha no se siembra.** La siembra sale
de leer las 107 fichas del Drive: `validado` solo va a `true` cuando el Uf o el Ug
están dentro del documento. En los 8 marcos cuya ficha solo declara el **Uw** (o lo
lleva únicamente en el nombre del fichero, como "S53RP Y VALOR Uf 1.59"), el campo
queda a NULL y la nota dice dónde mirar. Un número tomado del nombre de un PDF
acaba impreso en un certificado sin que nadie lo haya comprobado. Estado actual:
**22 marcos** (14 con Uf verificado) y **22 vidrios** (todos verificados).

**REGLA — un modelo SIN el dato no PISA lo que ya hubiera escrito.** `aplicarMarco`
omite `marco_nuevo_transmitancia` cuando el catálogo no tiene Uf, en vez de poner
un cero. El selector avisa en la propia fila ("Falta el Uf") y ofrece completarlo
allí mismo: se teclea una vez, con la ficha delante, y queda para todos los
expedientes que vengan detrás (`PATCH /api/ventanas/:tipo/:id`, que **no** pasa por
el payload completo del PUT y por eso no borra la ficha ni las notas).

**REGLA — se busca SIN TILDES, y por eso el listado viene entero.** "kommerling"
tiene que encontrar "KÖMMERLING", y un `ilike` en SQL no lo hace: la ruta devuelve
las decenas de filas y el filtro vive en el navegador (`norm()` con NFD, como el
resto de buscadores de la app).

**REGLA — dar de alta y editar es `staffOnly`; BORRAR es `adminOnly`.** Aquí no hay
ni un euro: son datos técnicos que se teclean con la ficha delante, y quien rellena
el expediente es a menudo un TRABAJADOR. Si el alta exigiera un ADMIN, el modelo no
se daría de alta — se escribiría a mano en el expediente y el catálogo seguiría
vacío. Un borrado sí se lleva por delante la ficha de los expedientes que lo citen.

**REGLA — el alta DESDE UN EXPEDIENTE es idempotente** (`upsertar: true`): el mismo
modelo se puede estar dando de alta desde dos expedientes a la vez, y chocar con la
clave única a mitad de rellenar la envolvente es un callejón sin salida. Desde la
pestaña del catálogo NO se upserta: allí el 409 es un aviso útil, porque quien
teclea está mirando la lista.

### La ficha que se sube a un expediente VUELVE al catálogo

Vale también para la **aerotermia** (y para su ficha EPREL). La ficha aparece casi
siempre por ese lado: alguien la busca para UNA obra y la sube ahí; sin el camino
de vuelta, el hueco del modelo se queda vacío para siempre.

**REGLA — se PROPONE, nunca se escribe en silencio.** Al elegir el fichero salta
`GuardarEnCatalogoGate`: la casilla nace **marcada** si el modelo no tiene ficha y
**desmarcada** si ya la tiene, diciendo que la sustituye. Sin modelo del catálogo
detrás no hay puerta —no hay a quién guardársela— y la subida sigue directa.

**REGLA — el fichero del catálogo NO puede vivir dentro de la carpeta de un
expediente.** Ahí lo puede mover o borrar cualquiera que ordene ese expediente, y
la auto-copia dejaría de funcionar para todos los demás sin que nadie se entere. Se
copia a `06. CALIDAD/01. FICHAS TECNICAS AEROTERMIA`, `…/06. VENTANAS/01. MARCOS` o
`…/02. CRISTALES` (ids con variable de entorno y valor de respaldo, mismo criterio
que la carpeta de producción de los CEE directos). La ficha anterior se **archiva
en OLD**, no se borra: es la prueba de un dato que puede estar ya impreso.

### Los huecos de ficha del RES080

`resolveEnvolventeFichaSlots(expediente)` añade dos huecos —`marco` y `cristal`— a
los de la bomba de calor, **solo si el expediente declara que sustituye ventanas**.
En un RES080 de cubierta no hay carpintería que justificar, y un hueco vacío
permanente en la hoja de anexos se lee como un documento que falta.

⚠️ `ftAttachmentSlots(instalacion, expediente)` recibe el expediente **entero**
(la envolvente vive en `documentacion`, que `instalacion` no ve). El CIFO lo llama
SIN ese segundo argumento y por eso no ve los huecos de envolvente, aunque comparta
el estado de anexos con el RES080 en `DocumentacionModule`.

Nombres canónicos en Drive: `{nº} - FT MARCO VENTANA.pdf` y `{nº} - FT VIDRIO.pdf`
(sin "AEROTERMIA": se archivan en la misma carpeta y el nombre es lo que las
distingue). Campos: `documentacion.ft_marco_link` / `ft_cristal_link`.

---

## La ficha del catálogo cuando son VARIOS papeles (2026-09-11)

El catálogo guardaba UNA ficha por modelo y durante mucho tiempo bastó. Dejó de
bastar con el **EPREL**: cuando el SCOP se justifica por ahí, el certificado
necesita **tres documentos** —la ficha del fabricante, la ficha EPREL y la
etiqueta energética— y el catálogo solo aportaba el primero. Así que en cada
expediente con ese equipo alguien buscaba los otros dos y los soltaba a mano en
el gestor de anexos (`LABEL_673322.pdf`, `FICHE_673322_ES.pdf`). Otra vez. Y otra.

Ahora eso se hace **una sola vez**: los anexos ya dados por buenos se unen en un
PDF y ese PDF pasa a ser la ficha del modelo. El siguiente expediente que elija
ese equipo se la copia entera.

| Qué | Dónde |
|---|---|
| Unir, subir al catálogo, sellar el slot y retirar las piezas | [fichaConsolidada.js](implementation/backend/services/fichaConsolidada.js) |
| Ruta | `POST /api/expedientes/:id/fichas-tecnicas/consolidar`, **staffOnly** |
| Qué se ofrece y qué se propone marcar | [logic/fichaConsolidable.js](implementation/frontend/src/features/expedientes/logic/fichaConsolidable.js) |
| Popup | `ConsolidarFichaModal.jsx`, desde el gestor de anexos del CIFO y del RES080 |
| Qué trae dentro la ficha del catálogo | `ficha_tecnica_partes` (`scripts/ficha_tecnica_consolidada.sql`) |
| Prueba sin BD, sin Drive y sin tocar el catálogo | `node implementation/backend/scripts/test_ficha_consolidada.mjs` |

**REGLA — se une EXACTAMENTE lo que va al certificado.** Mismo orden del gestor,
mismos recortes de páginas (`cifo_annex_prefs.excluded`) y el mismo `unirAnexos`
que produce la ficha técnica suelta del paquete E{n}. Si la ficha del catálogo no
fuera página a página el bloque de anexos, el documento suelto y el que va dentro
del certificado dejarían de coincidir — que es lo que compara quien lo verifica.
Por eso el ORDEN no se toca en el popup: se cambia en el gestor, que es donde
manda.

**REGLA — consolidar deja el EXPEDIENTE consolidado también.** El catálogo y el
expediente no pueden contar cosas distintas: si aquí se quedaran las piezas
sueltas, el día que alguien pulse ⟳ en la ficha se traería el conjunto —que ya
lleva el EPREL dentro— y el certificado saldría con el **EPREL dos veces**
(`dedupeByDriveId` no lo ve: son ficheros distintos). Las piezas salen de la
lista de anexos, pero **no se borran de Drive**: son la prueba de lo que se unió.
El slot se sella por el MISMO camino que el botón ⟳ (`asegurarFichaTecnica` con
`force`), para que no haya dos formas de dejarlo.

**REGLA — con VARIOS modelos, los sueltos NO vienen marcados.** Qué equipo
justifica cada PDF suelto no lo puede adivinar la app: marcarlo por ti es meter
la ficha EPREL de un equipo dentro de la ficha del otro, y desde el catálogo eso
se propaga a todos los expedientes que lleven ese modelo. Con un solo modelo no
hay ambigüedad y van marcados. La ficha del OTRO modelo tampoco se ofrece como
pieza.

**REGLA — una pieza que no se puede leer ABORTA.** `fetchAnnexBuffers` se salta
en silencio lo que no baja; aquí no vale: una ficha incompleta subida al catálogo
no se queda en este expediente. Y solo se unen ficheros DE ESTE EXPEDIENTE (el
driveId lo manda el navegador): se comprueba contra los slots de ficha y contra
`cifo_extra_annexes`, mismo criterio que el proxy de contenido de los anexos.

**REGLA — se dice qué trae dentro.** `ficha_tecnica_partes` guarda los METADATOS
del conjunto (nombre de cada pieza, sus páginas y cuándo se unió — regla 21) y el
gestor lo pinta bajo el badge: *"📎 Conjunto de 3 documentos · 5 págs"*. Sin eso,
el siguiente expediente ve "5 págs" y no sabe si el EPREL va dentro sin abrir el
PDF — que es exactamente lo que lleva a subirlo otra vez. Se escribe **siempre**
que se toca `ficha_tecnica`: guardar una ficha suelta lo pone a NULL, porque una
nota de "conjunto" que sobrevive a la ficha que describe miente con toda la
autoridad de un registro. Solo se afirma sobre un fichero que ACABA de salir del
catálogo (`source: 'model'`): sobre uno adoptado de la carpeta del expediente
podría ser una subida a mano con el nombre canónico.

⚠️ El orden de operaciones no es indiferente: **catálogo → slot → retirar piezas**.
Si fallara el sellado del slot, las piezas NO se retiran y la respuesta lo dice
con esas palabras — es el único estado desde el que un ⟳ duplicaría el EPREL.

---
---

## La cartera de instaladores, etiquetada sola en WhatsApp (2026-09-09)

Un instalador vivía en dos sitios sin nada que los uniera: su ficha en
`prescriptores` y su chat en el móvil, un número suelto entre clientes. La
etiqueta `INSTALADORES` la ponía alguien a mano cuando se acordaba — medido el
09/09/2026: **26 chats etiquetados para 71 fichas**.

| Qué | Dónde |
|---|---|
| Qué teléfonos tiene un instalador y con qué nombre se guardarían | [whatsappInstaladoresSync.js](implementation/backend/services/whatsappInstaladoresSync.js) — `telefonosDeInstalador` |
| La agenda (leer contacto · guardar sin pisar) | [whatsappContactos.js](implementation/backend/services/whatsappContactos.js) |
| Ruta | `POST /api/whatsapp/etiquetas/sincronizar-instaladores` — **adminOnly o `x-internal-key`** |
| Superficie | Panel de WhatsApp: "Ver qué haría" → "Sincronizar ahora" |
| Repaso completo desde el VPS | `cd /opt/brokergy/implementation/backend && node scripts/sincronizar_etiquetas_instaladores.js [--execute]` |
| Prueba de lo puro, en local | `node implementation/backend/scripts/test_sync_etiquetas_instaladores.js` |

**REGLA — un nombre que YA está en la agenda no se toca jamás.** Lo puso una
persona, muchas veces con el apodo por el que de verdad conoce a ese instalador
("Paco el de las calderas"), y machacarlo con la razón social de la BBDD es
hacerle perder la referencia en su propio teléfono. Solo se rellena el hueco de
quien entra como número suelto (`guardarSiFalta`, que mira `isAddressBookContact`
y `isMyContact` — WhatsApp ha ido cambiando cuál de las dos usa).

**REGLA — la etiqueta se AÑADE; la lista se manda COMPLETA.** `poner()` deja el
chat con exactamente lo que se le pasa, así que siempre va lo que ya tenía MÁS la
nuestra. Un instalador está además en "EN CURSO" o en "Pagado", que es trabajo de
otra persona.

**REGLA — se etiquetan TODOS los teléfonos que constan**, no solo el principal:
en 20 de las 71 fichas el número por el que se habla con la obra es el del jefe
de obra o el de administración. Se deduplica por los 9 dígitos finales y manda el
PRIMERO (el de la empresa), porque el mismo número repetido en tres campos es un
solo chat y no puede guardarse tres veces con tres nombres.

**REGLA — esto NUNCA tumba lo que lo llamó.** El enganche del alta/edición va en
`setImmediate` y se traga sus errores: que WhatsApp esté desconectado no puede
hacer fallar el guardado de una ficha. Y solo se dispara si el guardado ha TOCADO
un teléfono (`tocaTelefonos`) — reetiquetar en cada guardado sería una llamada a
Puppeteer por cada cambio de comisión o de nota, contra la sesión de la que
depende todo lo demás.

⚠️ **`poner()` fallaba justo con el caso normal**: un chat al que nunca has
escrito NO entra en `C.Chat` con su `@c.us` —`findOrCreateLatestChat` devuelve
`{chat, created}` y `C.Chat.get(id)` sigue dando `undefined`, porque vive bajo su
`@lid`—, así que el `C.Chat.get` posterior lanzaba "Ese chat ya no existe en
WhatsApp". O sea: etiquetar a alguien recién dado de alta, que es para lo que
existe esto, era lo único que no funcionaba. Ahora se crea y se etiqueta en la
MISMA `evaluate`, conservando el modelo devuelto.

⚠️ **Un script suelto NO ve la sesión de WhatsApp**: es un singleton del proceso
del servidor, así que `node scripts/…` arranca otro proceso y `getStatus()`
devuelve DISCONNECTED aunque esté conectada. Por eso el repaso entra por la ruta
con `x-internal-key` (mismo patrón que el CIFO) en vez de importar el servicio.

**El automático nace APAGADO** (`WA_SYNC_INSTALADORES`), como `CEE_ENTREGA_AUTO` y
`BOT_WHATSAPP_ENABLED`: encendido en LOCAL escribiría en la agenda del teléfono de
verdad. Y `dryRun` es el valor por DEFECTO de la ruta — la llamada que se hace sin
pensar es la que no toca nada. Pausa de `WA_SYNC_PAUSA_MS` (1,5 s) entre chats, y
corte tras 3 tiempos de espera seguidos: 90 operaciones en ráfaga contra ese
Chrome es justo lo que no conviene hacerle.

**REGLA — el repaso va a TROZOS.** Son ~90 teléfonos a segundo y medio y nginx
corta la petición a los 60 s: el repaso entero devolvía un **504 con medio
trabajo hecho y sin informe**, que es la peor combinación (no sabes qué se hizo).
La ruta mira como mucho `WA_SYNC_LIMITE` (12) teléfonos y devuelve en `restantes`
los instaladores que faltan; el script y el botón encadenan las pasadas y enseñan
el avance. Mismo patrón que el paquete de actuaciones de un lote.

⚠️ **El script se ejecuta en el HOST del VPS, no dentro del contenedor**:
`.dockerignore` excluye `scripts/` a propósito. Y en el host no hay
`node_modules` —viven en la imagen—, así que ese script no puede requerir NADA:
lee el `.env` a mano y usa el `fetch` de Node.

Medido el 09/09/2026 al estrenarlo: 71 instaladores, 83 teléfonos, **54 chats
etiquetados** (18 ya la tenían) y solo **6 contactos nuevos** en la agenda — casi
todos estaban ya guardados, que es justo lo que la regla protege. La etiqueta
pasó de 26 a 80 chats. Once números no tienen WhatsApp: son los fijos de empresa.

**Etiqueta que no existe = se dice cómo crearla.** No se puede crear desde la app
(WhatsApp no lo expone y la librería tiene rota toda esa familia — ver "Lo que
WhatsApp rompió"), así que `idEtiqueta()` falla con la lista de las que sí hay.

---

## Un mensaje con el RELOJ no está enviado (2026-09-08)

Pasó esto: se mandó la propuesta 26RES060_OP118 al cliente y al instalador, la app
dijo **"✓ enviado"** por los dos WhatsApp, y los dos PDF llevaban **dos horas** en el
chat con el reloj. Nadie se enteró. En la misma franja se perdieron además un aviso
al grupo de expedientes (que la cola marcó `SENT`) y dos avisos más.

### Por qué la app decía que sí

`client.sendMessage()` devuelve el mensaje en cuanto se **INSERTA** en el chat, no
cuando se entrega. En `whatsapp-web.js/src/util/Injected/Utils.js`:

```js
const [msgPromise, sendMsgResultPromise] = ...addAndSendMsgToChat(chat, message);
await msgPromise;                                    // ← solo la inserción local
if (options.waitUntilMsgSent) await sendMsgResultPromise;   // ← por defecto, false
```

Ese id de vuelta era lo que se tomaba por entregado, y con él se sellaba
`propuesta_versiones` (`"status":"ok"`), el historial y `whatsapp_queue`.

**REGLA — lo único que dice que un mensaje ha salido es el ACK** (`-1` error · `0`
pendiente · `1` servidor · `2` entregado · `3` leído). `confirmarEntrega()` en
[whatsappService.js](implementation/backend/services/whatsappService.js) lo espera
(`WWA_ACK_ESPERA_MS`, 25 s) después de `waitUntilMsgSent: true`. Si sigue en 0:
error de verdad → el modal lo dice, la cola lo marca **FAILED sin reintentos** —el
mensaje YA existe en el chat, y reenviarlo se lo manda dos veces al cliente— y sale
un email al admin. Si el ack **no se puede leer** no se afirma nada: un falso
negativo duplica mensajes, que es peor que un log.

**REGLA — el fallo del texto previo en `sendMedia` NO se traga cuando es de
entrega.** Con caption largo el mensaje va aparte y el PDF después; ese `catch` con
`console.warn` dejó en los dos chats el PDF a pelo, sin una línea que lo explicara.

### La causa: el "escribiendo…" rompe la sesión

**REGLA — no se llama a `getChatById` / `getChats` / `msg.getChat` / `sendSeen` en el
camino de envío.** Para pintar el indicador de "escribiendo" hay que pedir el chat, y
en la rama **2.3000.x** de WhatsApp Web eso deja la sesión tocada: a partir de ahí
todo sale con id y sin ACK, y acaba desconectándose sola. Es el cuadro de
[wwebjs#201849](https://github.com/wwebjs/whatsapp-web.js/issues/201849) —mismas
versiones que aquí, 1.34.7 + 2.3000.x, con *"Failed to find row in chat table"*— y no
tiene arreglo publicado: 1.34.7 es la última en npm y el repo no toca el envío desde
julio. Re-vincular **alivia solo un rato** (al que lo reportó, ~17 min).

`WWA_TYPING` y `WWA_SEND_SEEN` nacen a `false`. Era cosmética anti-bot y costaba que
no llegara NADA. **La pausa humana entre mensajes se conserva** (`WWA_TYPING_MS` +
`randomDelay`): es lo que de verdad espacia los envíos; lo que se quita es el globito.

### Lo que NO era, para no repetir el camino

| Se probó | Resultado |
|---|---|
| Fijar una versión anterior de WhatsApp Web (`WWA_WEB_VERSION`) | **No sirve**: la web se auto-actualiza igual. Se dejó la palanca, apagada. Quedó funcionando con la 2.3000.1046973889, más nueva que la que "rompía" |
| Borrar el service worker y la caché de Chrome del perfil | No cambia nada por sí solo |
| Cuenta capada / el agente de IA de WhatsApp | **No**: la recepción iba bien y lo enviado desde el móvil salía con ack 2. Solo fallaba lo que mandaba el dispositivo vinculado |

**Lo que lo arregló**: quitar `getChatById`/`sendSeen`, **reiniciar el VPS** (llevaba
112 días) y **re-vincular** el dispositivo desde el móvil (Ajustes → Dispositivos
vinculados → quitar el viejo, que salía con *"Historial de chat: En pausa"*, y
escanear el QR). Medido tras el arreglo: texto y documento a las 13:58 con **ack 2**.

### Cómo se diagnostica (sin enviar nada)

El ACK real solo se ve por dentro. Conectando por CDP al Chrome que ya corre
—`/app/.wwebjs_auth/session-brokergy-main/DevToolsActivePort` da el puerto— se leen
los mensajes y su ack con `window.require('WAWebCollections')`, y una captura de la
página enseña si WhatsApp ha dejado un modal delante (la primera vez había uno de
"Novedades en WhatsApp Web" tras actualizarse). Es **lectura**: no manda nada y no
gasta un mensaje a un cliente real.

⚠️ NO navegar (`page.goto` / `location.href`) sobre esa página: deja el Chrome
atascado y hay que reiniciar el contenedor para recuperar la sesión.

**Si vuelve a pasar** — plan B del mismo hilo, ya en orden de coste: arrancar Chrome
en modo *headful* con Xvfb y subir Puppeteer/Chrome (toca el Dockerfile); y la
solución de fondo, salir de whatsapp-web.js (Baileys / wppconnect), que es un
proyecto aparte.

---

## Las FICHAS y el ANEXO I se RELLENAN, ya no se redibujan (2026-09-08)

Las cuatro fichas (RES060 · RES080 · RES093 · TER100) y el **Anexo I** se
REPLICABAN en HTML: ~1.100 líneas imitando el modelo del Ministerio hasta los saltos
de página, el ancho de la caja de texto y las notas al pie, con un medidor propio
para comprobar que nada desbordaba. El Ministerio publica ahora esos cinco impresos
como **PDF de FORMULARIO**, así que se rellena el suyo: el documento pasa a ser
literalmente el oficial y lo único nuestro son las cifras.

Es el mismo camino que ya hacía `anexoActuacionService` con el anexo del MITECO
(regla 29); este es su hermano para los documentos de la ficha.

| Qué | Dónde |
|---|---|
| Rellenar el impreso (tamaños, casillas, desplegables, firma) | [formularioOficialService.js](implementation/backend/services/formularioOficialService.js) |
| Plantillas | `backend/plantillas/Ficha{RES060,RES080,RES093,TER100}.pdf` · `AnexoIDeclaracionResponsable.pdf` |
| QUÉ casilla ocupa cada dato — fichas | [logic/fichasFormulario.js](implementation/frontend/src/features/expedientes/logic/fichasFormulario.js) |
| QUÉ casilla ocupa cada dato — Anexo I | [logic/anexoIFormulario.js](implementation/frontend/src/features/expedientes/logic/anexoIFormulario.js) |
| El documento, venga como venga | `documentoAPdf()` en [pdfService.js](implementation/backend/services/pdfService.js) |
| Vista previa (es el PDF de verdad) | `DocumentoOficialPreview.jsx` |
| Prueba sin BD (empresa · subvención · cascada · CCAA · euro) | `node implementation/backend/scripts/test_impresos_oficiales.mjs` |
| Contraste contra EXPEDIENTES REALES, y los dos PDF en disco | `node implementation/backend/scripts/comparar_impresos_oficiales.mjs` |

**REGLA — el impreso no CALCULA nada.** Los valores salen de los `derive*` de las
plantillas HTML (`deriveFichaRes060/080/093`, `deriveFichaTer100`, `deriveAnexoI`),
que son los mismos que alimentan el CIFO y el panel económico. Por eso esos cuatro
ficheros exportan ahora su derivación aparte de su maqueta: si el formulario
recalculara por su cuenta, el mismo expediente tendría dos documentos con números
distintos según por dónde se generase.

**REGLA — los nombres de campo son los de la PLANTILLA, erratas incluidas.** `ri i`
es η_i, `E F` es EF_i, `Representante delsolicitante` va sin espacio en RES080 y
TER100, y el impreso trunca a 50 caracteres (`Dirección postal de la instalación en
que se ejecu`). Se leen con `pdf.getForm().getFields()`. "Corregirlos" solo deja el
impreso con un hueco — y un campo que la plantilla no tiene **se AVISA**, nunca se
traga en silencio.

**REGLA — un documento viaja como `{ html }` o como `{ formulario }`, y las cuatro
salidas usan la MISMA.** Descargar, guardar en Drive, enviar por email/WhatsApp y el
envío del lote al S.O. pasan por `documentoAPdf`. Si una se quedara sin la rama del
formulario seguiría mandando la maqueta antigua sin que nadie lo notara — y el
enlace de firma del cliente sirve el borrador de Drive, así que sería OTRO documento
el que se firma.

**REGLA — el tamaño de letra se fija en la CASILLA, no en el campo.**
`field.setFontSize()` solo toca el /DA del campo, y pdf-lib pinta con el de la
casilla si lo tiene (`widgetFontSize ?? fieldFontSize`). Estos impresos lo traen en
la casilla y con valor 0 ("ajústalo tú"), así que sin `fijarTamano()` el tamaño
calculado se ignoraba: en la tabla del total de la ficha TER100 salían tres cifras a
16pt junto a otras dos a 12, en un documento cuyo cuerpo es de 12. Un campo con
VARIAS casillas (el AE de cada servicio en TER100 sale en su apartado y otra vez en
el total) se ajusta a la MÁS PEQUEÑA.

**REGLA — la comunidad autónoma se ELIGE del desplegable.** La BD guarda "Comunidad
Valenciana", "Baleares", "Navarra" o "CASTILLA-LA MANCHA" y el impreso dice
"Comunitat Valenciana", "Illes Balears", "Comunidad Foral de Navarra"…
`resolverOpcion` casa por normalización y por una tabla de alias; una CCAA que no
case deja el impreso sin ella, que es el campo por el que el Gestor Autonómico lo
reparte. Nunca se escribe a pelo una cadena que no sea una opción.

⚠️ **WinAnsi NO es Latin-1.** El EURO (U+20AC) está fuera de `\x00-\xFF` y con un
filtro por rango la cuantía de una subvención salía impresa como **"18.800,00 ?"**.
`WINANSI_EXTRA` recoge los 27 caracteres del hueco 0x80-0x9F que sí se pueden
escribir.

⚠️ **La plantilla trae dentro un sello naranja "SIGN"** en su campo de firma (lo deja
la herramienta con la que se hizo el formulario). Se firma con Autofirma, que crea el
suyo, así que ese campo se RETIRA al rellenar — `form.removeField()` no vale (revienta
leyendo su /AP), hay que quitarlo de `AcroForm.Fields` y de las anotaciones de su
página.

### Los DOS formatos conviven, y la firma no cae en el mismo sitio

En Drive hay borradores del formato anterior esperando firma. Las cajas de
`signBoxes.js` se han duplicado (`_oficial` + la de siempre) y `fixedBox` admite
ahora una **FUNCIÓN** `({ numPaginas, oficial }) => caja`, que resuelven
`FirmarConCertificadoModal` (Autofirma) y `firmarYEscanear` (firma manuscrita):

- **Anexo I** — 4 páginas el oficial (firma en la 4ª) y 3 la maqueta. Manda el nº de
  páginas: sin esto, un borrador viejo recibiría la firma en una página que no existe.
- **Fichas** — los dos formatos tienen las MISMAS páginas, así que se mira quién
  produjo el PDF: el impreso oficial lo rellena **pdf-lib** y la maqueta la rasteriza
  Chrome ("Skia/PDF").

Las cajas `_oficial` salen del CAMPO DE FIRMA de la propia plantilla, leído con
PyMuPDF: son las coordenadas que el impreso reserva, no una estimación.

### El "Fdo." del Anexo I no es un campo

El impreso deja ahí unos guiones bajos. El nombre del firmante se ESCRIBE sobre la
página (`FDO_ANEXO_I`, medido sobre la plantilla): sin él el documento no dice quién
firma, que es lo primero que mira quien lo recibe.

### Qué se conserva del formato anterior

La maqueta HTML **no se ha borrado**. Los cuatro modales de ficha y el del Anexo I
llevan un conmutador **Oficial · Clásico** (`FormatoDocumentoSwitch`) que cambia lo
que se previsualiza Y lo que se envía, para poder comparar los dos documentos del
mismo expediente y como salida si el impreso cambiara. El OFICIAL es el valor por
defecto y lo que sale por las superficies sin conmutador (envío de anexos, convenio
de cesión, lote al S.O.).

**REGLA — la vista previa del oficial es EL PDF que se va a enviar**, no una maqueta
parecida: se pide a `/api/pdf/generate` y se enseña en un iframe. Una réplica en
pantalla volvería a abrir la puerta a que lo que se revisa y lo que se manda no sean
el mismo documento.

⚠️ Las casillas del Anexo I **se marcan en la pestaña Subvenciones**; el formato
clásico conserva su edición en pantalla (contenteditable + casillas) y lo que se
toque ahí se refleja en el oficial, porque el estado es el mismo. La nota del popup
lo dice.

---

## Al encargar el CEE, el CLIENTE también se entera (2026-09-09)

Encargar el certificado es el primer movimiento del expediente y era **invisible
para el cliente**: firmaba la propuesta y la siguiente noticia que tenía era la
llamada de un técnico que nadie le había anunciado. Ahora el MISMO botón
—«Asignar y notificar» del popup de Notificar Certificador— manda también el aviso
al cliente.

| Qué | Dónde |
|---|---|
| El TEXTO | `encargoCeeClienteMsg` en [recordatorios.js](implementation/backend/services/recordatorios.js) |
| Borrador + destinatario (para el popup) | `GET /api/expedientes/:id/aviso-cliente-cee?phase=` (**staffOnly**) |
| Envío + sello + historial | `POST /:id/notify-certificador`, campos `avisarCliente` · `clienteChannels` · `clienteMessage` |
| Superficie | Bloque «Avisar también al cliente» del popup de `CeeModule` |

**REGLA — el texto lo redacta el BACKEND y el popup solo lo enseña.** Es la misma
regla que el resto de recordatorios (fuente única en `recordatorios.js`): si lo
compusiera el navegador, un envío desde otra superficie diría otra cosa. El popup
lo pide al abrirse (mismo patrón que `approve-cee-links`), lo trae **plegado**
—casi nunca se edita y enseñarlo entero solo aleja el botón— y se despliega con
«Ver el mensaje».

**REGLA — no sale con «Solo asignar».** El texto le dice al cliente que ya le hemos
mandado las instrucciones al técnico; sin encargo enviado eso es falso. Se
comprueba en las dos capas: el frontend solo lo marca al notificar y la ruta exige
que algún canal del certificador haya salido (`channels.length > 0`).

**REGLA — se avisa UNA vez por fase.** Reasignar técnico es el caso normal (el
primero no puede, se pasa a otro) y el cliente no puede enterarse dos veces de que
su trámite acaba de empezar. El sello vive en
`documentacion.aviso_cliente_cee[fase]` y el popup lo dice con la fecha: **no lo
bloquea** —puede hacer falta reenviarlo— pero deja de venir marcado.

**REGLA — «no empieces la obra todavía» solo si la obra NO está hecha.** Las
facturas anteriores al registro del CEE inicial son una incidencia
(`facturaIncidencias` · `FECHA`), así que decírselo AHORA le ahorra el problema;
decírselo a quien ya terminó es echarle en cara algo que no puede deshacer. El
criterio de obra hecha es el mismo del radar (factura, CIFO, RITE o fin de obra
comunicado).

**REGLA — no se promete fecha, se promete el AVISO.** Depende de la agenda del
técnico y de Industria. Lo que sí se cumple es «en cuanto quede registrado te
avisamos».

Va al contacto de notificaciones del cliente (`resolveSolicitudContacto`, la misma
cascada que «solicitar lo que falta»), por **WhatsApp** por defecto —que es donde
lee— y con el email a un clic. Un fallo del aviso **nunca tumba el encargo**: el
certificador ya lo tiene. Y **no se ofrece en CEE directos** (`msgCtx.cae === false`):
allí no hay obra ni trámite de ayuda, y ese texto hablaría de algo que no existe.

---

## El aviso lo recibe el COMERCIAL o el TÉCNICO (2026-09-09)

Un instalador no tiene UN interlocutor: tiene el **comercial**, con el que se habla de
la obra, y el **técnico**, que firma. La app no lo distinguía —había un solo interruptor,
`contacto_notificaciones_activas`, que decía "manda a los contactos alternativos o al
representante" sin saber DE QUÉ se estaba escribiendo—, así que la Memoria RITE y "¿cómo
va la obra?" salían por el mismo sitio a la fuerza.

Medido en INSTOTERMA SL: la documentación RITE, que firma Jesús (654547042), salía al
**654547040 — el móvil de Carlos, el comercial**.

| Qué | Dónde |
|---|---|
| El reparto (roles, respaldo, saludo) | [notifyContacts.js](implementation/backend/services/notifyContacts.js) — `partnerNotifyTarget(p, rol)`, `contactosDePartner`, `rolDeDocumento` |
| Su espejo en el navegador | [docContacts.js](implementation/frontend/src/features/expedientes/utils/docContacts.js) — `contactosPara`, `defaultContactIds`, `avisoReparto` |
| El formulario | `PrescriptorDetailModal.jsx` — bloque **"Avisos y contactos"** |
| Prueba sin BD y sin enviar nada | `node implementation/backend/scripts/test_reparto_contactos.js` |

**REGLA — el ROL del contacto decide, y el ASUNTO pide un rol.** Cada persona de
`contactos_notificacion` lleva `roles: ['comercial'|'tecnico']` y quien envía pide
`partnerNotifyTargets(p, 'tecnico')`. Si lo decidiera cada pantalla, el parte diario y el
popup mandarían la misma cosa a personas distintas — el mismo motivo por el que los
textos son fuente única en `recordatorios.js`.

| Asunto | Rol | Dónde |
|---|---|---|
| Memoria RITE · borrador del certificado · CIFO para firmar | `tecnico` | `/instalador/enviar`, `CertificadoCifoModal`, `EnviarBorradorRiteModal`, `recordar-firma` del parte |
| Propuestas · fotos y documentación · "¿cómo va la obra?" · rechazo de una foto | `comercial` | `solicitar-faltantes`, `EnviarAnexosModal`, `reformaUploadService`, `fin-obra` del parte |

**REGLA — el REPRESENTANTE LEGAL no es un buzón.** `nombre_responsable` es quien FIRMA:
va impreso en el CIFO y en su recuadro de firma (`firmanteCifo`), es una identidad
documental. Usarlo además como destinatario por defecto es lo que producía el fallo,
porque **67 de los 70 instaladores no tienen `tlf_responsable`** y su nombre acababa
pegado al teléfono de la empresa: la lista del popup decía *"Jesús · 654547040"* y ese
número era de Carlos. Ya no se ofrece como contacto.

**REGLA — sin nadie marcado se envía igual, pero SE DICE.** 51 instaladores no tienen un
técnico marcado, así que no puede bloquear nada: se cae al canal **general** de la
empresa, rotulado *"Teléfono y email generales de la empresa"*, y el popup lo avisa en
ámbar con el nombre del partner delante (`avisoReparto`). Un desvío silencioso es
exactamente el fallo que esto arregla.

**REGLA — al canal general de una EMPRESA se saluda en genérico.** Las plantillas ya
hacen `nombreSaludo(destinatario) ? '¡Hola X!' : '¡Hola!'` (y `mensajeInstalador` cae en
"Hola compañeros"), así que basta con NO inventar un nombre: "¡Hola Jesús!" en un número
que coge otra persona es peor que no saludar. En un **autónomo** sí se saluda por su
nombre — ahí la persona SÍ es la empresa. Al **CERTIFICADOR** no se le aplica el reparto:
sus plantillas escriben `Hola ${certName},` y no admiten un nombre vacío.

**REGLA — un contacto SIN roles se comporta como hasta ahora, y no se le adivina.** Los
~20 partners que ya tenían contactos son anteriores al reparto: marcarles un rol a ojo
cambiaría a quién le escribimos sin que nadie lo revise. Valen para todo, pero **solo si
su ficha tenía el desvío activo** — hay 3 con un contacto dado de alta y el interruptor
apagado a propósito (Esther, David, Pedro), y encenderlos de rebote sería empezar a
escribir a tres personas que hoy no reciben nada. Marcar un rol sí manda siempre: marcarlo
ES la decisión.

**REGLA — en el CIFO no va ningún teléfono.** El documento identifica a la empresa por su
razón social, CIF, domicilio y nº RITE, y a la persona por el **nombre de quien firma**.
La portada imprimía `Tel {pres.tlf}`, que es el mismo número de una persona concreta: el
móvil del comercial salía impreso en la carátula de todos los CIFO.

### En el popup se puede cambiar y poner a otro en copia

Por defecto viene marcado el del rol, pero **la lista enseña a TODOS los contactos de
la empresa** (más el canal general y "otro contacto…"), cada uno con su chapa de rol, y
se pueden marcar varios: para poner al comercial en copia de una firma, o para cambiar
un envío puntual. Fila compartida por los cuatro popups:
[ContactoPickRow.jsx](implementation/frontend/src/features/expedientes/components/ContactoPickRow.jsx)
— estaba copiada en los cuatro con diferencias de forma, y es la fila donde se comete el
error, porque es lo último que se mira antes de pulsar.

- El del asunto va resaltado y rotulado **"· le toca"**; los demás en gris.
- El canal general se rotula **"Empresa · teléfono y email generales"**, nunca con el
  nombre de una persona.
- El **cargo se calla cuando repite la chapa** ("CARLOS · Comercial · COMERCIAL"): solo
  aparece si añade algo ("JEFE DE OBRA").
- **El email va con COPIA REAL**: sale UNA vez, con el del rol en el `to` y los demás en
  `cc` (`sendMail` ya limpiaba vacíos y repetidos; `sendDocumentEmail`, `sendAnnexEmail`
  y `solicitar-faltantes` lo pasan). Dos correos idénticos por separado no son una copia:
  quien tiene que firmar no ve que su comercial lo tiene y se contesta por duplicado.
  **WhatsApp no tiene copia**, así que ahí sí va un mensaje a cada uno — y la nota del
  popup lo dice canal por canal ("Email: a JESÚS, con CARLOS en copia · WhatsApp:
  recibirá un mensaje cada uno").
- **REGLA — el `to` es el del ROL, no el primero que se marcó** (`priorizarPorRol`). La
  lista se recorre de arriba abajo, así que marcar al comercial "para que se entere"
  dejaba al técnico en copia de su propia tarea. Se aplica en los cuatro popups **y** en
  el historial, que anota quién iba en copia — si no, dentro de tres meses nadie sabe que
  el comercial también lo recibió.
- En `SolicitarFaltantesModal` la preselección pasó a ser **por rol**: buscaba el contacto
  cuyo teléfono coincidiera con el del destinatario por defecto, y el del contacto y el de
  la empresa son el MISMO en la mayoría de fichas.

### El formulario: una sola pregunta y CERO interruptores

Eran dos toggles anidados ("desviar a otros contactos" + "enviar notificaciones a estos
contactos") y una lista: había que abrir los dos para descubrir a quién le llegaba nada.
Ahora los dos se **derivan** de si hay personas dadas de alta (las columnas siguen ahí por
compatibilidad) y lo único que se contesta es qué recibe cada persona.

- **El resumen va ARRIBA y también en el `summary` plegado**: "Comercial: CARLOS ·
  Técnico: JESÚS", o en ámbar "Nadie marcado · irá al teléfono general (654547040)". Es la
  única pregunta que contesta el bloque y se responde sin desplegarlo. Es **derivado** de
  los roles: dos sitios donde declarar lo mismo acaban diciendo cosas distintas.
- **El resumen se calcula con lo que se VA A GUARDAR**, no con lo que hay en la BD — si no,
  en esas 3 fichas la pantalla diría "nadie marcado" y el guardado haría lo contrario.
- **Chips de rol** con lo que recibe cada uno en el `title`, y un "recibe todo" para el
  caso de una sola persona (25 de 70 son autónomos).
- **Atajo "Usar a Jesús"**: copia al representante legal como contacto con su teléfono
  PROPIO (nunca el de la empresa, que es la confusión que causó todo). En 51 fichas no hay
  ni un contacto, y teclear otra vez lo que está tres campos más arriba es la razón.
- **Sugerencia por el cargo**: si ya pone "COMERCIAL" o "TÉCNICO", se ofrece marcarlo de un
  clic. Lo marca una PERSONA — deducirlo cambiaría destinatarios sin que nadie lo revise.
- **Se avisa si una persona con rol no tiene teléfono**: solo le llegará el email, y casi
  todos los avisos salen por WhatsApp.
- El aviso de "sin repartir" solo aparece con **dos o más** personas: con una, o recibe
  ella o recibe la empresa, y pedir una decisión que no cambia nada es lo que hace que se
  ignoren los avisos que sí importan.

---

## Reglas Críticas — No Romper

1. **Drive**: La creación de carpetas es **no bloqueante**. **REGLA DE ORO:** Los enlaces a Drive (`drive_folder_link`) solo se muestran en el frontend si `user.rol === 'ADMIN'`.
2. **Estados de oportunidad**: Los estados válidos son `PTE ENVIAR`, `EN CURSO`, `ENVIADA`, `ACEPTADA`. Cada cambio de estado mueve la carpeta de Drive automáticamente (mapa en `services/driveFolders.js`, ver "Carpetas de Drive por estado").
3. **IDs de oportunidad**: Formato `{YY}RES_OP{N}`. No renombrar IDs antiguos para mantener trazabilidad.
3.b **Fichas**: hay CINCO tipologías — `RES060`, `RES080`, `RES093`, `TER100` y `TER173`. La lista NO se escribe a mano en cada sitio: backend en [utils/fichas.js](implementation/backend/utils/fichas.js) (`FICHAS`, `correlativoInicial`, `detectPrograma`, `esTerciario`, `esHibridacion`), frontend en `expedienteTaxonomia.js` (`FICHAS`, `getFicha`, `fichaColor`). El correlativo inicial NO es 1 en todas (RES080 → 36, TER100 → 3). El SECTOR no se deduce de los inputs: las fichas TER las declara una persona, y se comprueban ANTES que `isHybrid` (TER173 es una hibridación y si no se la llevaría RES093). Ver "Ficha TER100" y "Ficha TER173".
4. **Validación de Documentos**: Usar siempre el helper `isPresent(val)` en `validateExpediente` para comprobar que los datos no son nulos, vacíos ni placeholders (`_______`).
5. **PDF Propuestas**: El encabezado usa **CSS Grid**. No cambiar a Flexbox para evitar desbordamientos.
6. **Seguridad de rutas**: Todas las rutas del backend usan `requireAuth` o `enforceAuth`.
7. **Diseño de Anexos**: El padding superior de 90px en `AnexoIModal` es sagrado para evitar cortes en la cabecera al imprimir a PDF.
8. **Expedientes — SCOP según emisor**: `suelo_radiante`→35°C, `radiadores_baja_temp`→45°C, `radiadores_convencionales`→55°C. En **RES080** la unidad terminal puede ser **aire-aire**: `splits` y `conductos`. No tienen temperatura de impulsión de agua — la ficha da un único SCOP, así que en el catálogo `aerotermia` esos modelos llevan el MISMO valor en `scop_cal_medio_35` y `_55` (`tipo = 'AIRE-AIRE'`) y el certificado imprime "unidad terminal …" en vez de "impulsión N°C". La lista de emisores es **fuente única** en [cifoDoc.js](implementation/frontend/src/features/expedientes/logic/cifoDoc.js) (`EMITTER_OPTIONS` / `getEmitterTemp` / `emitterScopContext`); no volver a duplicarla en los modales. Splits y conductos solo se ofrecen si el nº de expediente es RES080. ⚠️ **En aire-aire el SCOP de clima CÁLIDO solo está en EPREL** (categoría `airconditioners`, no `spaceheaters`): la ficha del fabricante publica únicamente el medio, que es el único obligatorio del Reg. 206/2012 — medido en el GREE PULAR 18, ficha 4,0 frente a **5,1** en EPREL. Por eso la ficha EPREL se archiva junto a la técnica (sin ella nadie reproduce ese número) y el modelo se identifica **por el código de placa**, no por el nombre comercial: `GWH18AGDXB` da 4,0/5,1 y `GWH18AGDXD` da 4,2/5,7. Ver la memoria [[project_aire_aire_eprel_scop_calido]].
8.d **Una vivienda SIN calefacción se DECLARA, no se disfraza de "Otro"**: `caldera_antigua_cal.rendimiento_id = 'sin_calefaccion'` (η **0,92** y **Gas Natural** de referencia — los MISMOS que ya aplica la calculadora con `boilerHeatingType: 'No tiene Calefacción'`, o el expediente daría otro ahorro que la propuesta aceptada). Antes había que ponerlo como "Otro" + "Caldera eléctrica (η=1)", que afirma un equipo inexistente con el rendimiento equivocado, y de ese campo cuelgan el CIFO, las cuatro fichas, el RES080, el CE3X y la economía. La fila va **al final** de `BOILER_EFFICIENCIES` (no es del Anexo VIII) y su label lleva coma a propósito: el CIFO imprime el combustible con `label.split(',')[0]`. Tipo de equipo y Rendimiento se mueven JUNTOS, y solo se ofrece en la columna de CALEFACCIÓN. Sin generador previo la medida de mejora **no es una "sustitución"** (`generadorAntiguo` → null) y el encargo CE3X lleva su bloque: *marca Gas Natural en «otros combustibles», rendimiento 92 %* — si cada certificador elige el suyo, el CEE inicial deja de reproducir el ahorro firmado. Ver [[project_sin_calefaccion_expediente]].
8.e **El emisor INICIAL y el FINAL no siempre son lo mismo**: en **RES060/RES093/TER100/TER173 SÍ** —la actuación cambia el generador, no la distribución, y es ella la que fija la temperatura de impulsión del SCOP—, así que el inicial se **deriva** y no se pregunta dos veces. En **RES080 no**: el inicial se declara y puede ser **NINGUNO** (vivienda sin calefacción), y en el final hay **tantos emisores como equipos instalados** (un conductos y un split conviviendo es el caso normal). Fuente única: [logic/emisores.js](implementation/frontend/src/features/expedientes/logic/emisores.js), que IMPORTA `EMITTER_OPTIONS` de `cifoDoc.js` sin duplicarla. Modelo incremental: `instalacion.tipo_emisor` no cambia (sigue siendo lo que leen CIFO, RITE y SCOP), y se añaden `instalacion.tipo_emisor_inicial` y `unidad.tipo_emisor` — solo RES080; sin ellos, todo se comporta como antes. **Dos emisores distintos son DOS GENERADORES en CE3X**, no una cascada: `buildCe3xFinal` emite un bloque por equipo con su tipo (`Bomba de calor aire-aire (conductos)` / `(split)`), su SCOP, **su** SEER —no el menor del conjunto— y su serie; y el certificado RES080 los enumera (`emisorLabelDocumento`, en `res080Doc.js` **y** en su modal gemelo) o contradiría al CE3X. ⚠️ En `res080Doc.js` la variable del expediente es `exp`, no `expediente`. Tras tocarlo: `node implementation/backend/scripts/test_emisores.mjs` y `check_res080_paginas.mjs`. Ver [[project_emisor_inicial_final]].
8.b **Cb (RES093) — la carga de diseño sale del REGLAMENTO EUROPEO, no de la zona climática**: en el método `demanda`, `P_designh = Q_H / H_HE` (Rgto. (UE) 813/2013, Anexo III, punto 4, letra c); el Rgto. Delegado (UE) 811/2013, Anexo VII, punto 4, letra c) da las tres temporadas: medias **2.066 h** · más frías **2.465** · más cálidas **1.336**). **Las horas son las de la MISMA temporada en la que se declara el SCOP aplicado**, o el rendimiento y la potencia salen de temporadas distintas y dejan de compararse en igualdad de condiciones. Esa temporada la sella `instalacion.aerotermia_cal.scop_temporada` al elegir modelo/método/emisor (`getScopSeason`, que sale de la MISMA decisión que el valor del SCOP en `resolveScop`); sin sellar → `medio`, y el CIFO dice expresamente que no consta rendimiento para condiciones más cálidas. Fuente única: `HE_ACTIVE_MODE_HOURS` en [calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js). **No volver a dividir por "horas equivalentes" de la zona** (las tablas RES220/RES230, 3.503 h en D3): son horas de funcionamiento, daban una carga de diseño ~40 % baja y con ella un Cb inflado. El apartado 8 del CIFO desarrolla el procedimiento en 5 pasos con las referencias [R1]-[R5] y ocupa DOS páginas; el método `caldera` no usa horas y sigue en una.
8.c **Anexos del CIFO — una ficha técnica por MODELO, no por hueco**: hasta 2026-08-13 había dos huecos fijos (`aerotermia_cal` y `aerotermia_acs`) y eso fallaba por los dos lados. **Por defecto** en cascada: el hueco de calefacción resolvía la ficha de la UNIDAD 1 y las demás quedaban sin justificar (medido: 26RES060_130, dos modelos distintos, iba sin la ficha de la unidad 2). **Por exceso** con un equipo que cubre calefacción y ACS —lo habitual—: el hueco de ACS resolvía el MISMO modelo y el PDF llevaba dos veces las mismas treinta páginas (medido: **24 de 241** expedientes). Fuente única: [fichasTecnicas.js](implementation/frontend/src/features/expedientes/logic/fichasTecnicas.js) — `resolveFichaSlots` agrupa las unidades (cal + ACS) por `aerotermia_db_id`, o por marca+modelo si se tecleó a mano, y devuelve **un hueco por grupo**. El que cubre los dos servicios se anuncia como "Ficha técnica aerotermia calefacción y ACS". Lo consumen las CUATRO superficies y no se decide en ninguna otra: los dos modales (`CertificadoCifoModal`, `CertificadoRes080Modal`), `cifoService` (generación automática / MCP) y las tres rutas `/fichas-tecnicas/*`. **La ruta valida contra el mismo alcance que el modal** (mismo motivo que la regla del checklist documental): sin eso, subir a un hueco que la vista ya no enseña respondería 200 y dejaría un destino vivo. Nomenclatura sin migración: el primer hueco de cada bloque conserva sus claves de siempre (`cal`/`acs`, `ft_aerotermia_cal_link`, "… - FT AEROTERMIA CALEFACCION.pdf") y los adicionales son `cal2`, `cal3`… (`ft_aerotermia_cal2_link`, "… CALEFACCION 2.pdf"). `annexPrefs` **dedupe por `driveId`** como red de seguridad: dos huecos que apunten al mismo fichero se anexan una vez. Un `ft_aerotermia_acs_link` heredado que ya no corresponde se ignora — el fichero sigue en Drive, pero no vuelve al PDF.
9. **DNI único**: La columna `clientes.dni` tiene constraint `UNIQUE`.
10. **Modales de Clientes / Partners**: Nunca cerrar al clicar fuera. Solo "X" o "Cancelar".
11. **XML Upload**: Parseo automático de demandas y también de `fechaFirma` y `fechaVisita`.
12. **ACS en Anexo I**: Validar `inputs.changeAcs || inputs.incluir_acs`. Si es false, ocultar unidad interior.
12.b **ACS fuera del alcance → "no aplica", nunca el valor ni 0**: en la tabla del apartado 4 (Ficha RES060/RES093/TER100 y Certificado CIFO), si el ACS no computa, **D<sub>ACS</sub> se imprime "no aplica"** igual que SCOP<sub>dhw</sub>. Dejar la demanda a la vista invita al verificador a multiplicarla y a obtener un AE<sub>ACS</sub> que no forma parte de la actuación; un 0 afirma una demanda nula, que es falso. Mismo criterio que D<sub>CAL</sub>/S cuando la calefacción queda fuera (TER100). El alcance se decide igual que en el CIFO: `cambio_acs !== false` **y** que el equipo nuevo no sea un termo eléctrico (efecto Joule, rendimiento 1). Son CINCO sitios y van a la vez: `logic/cifoDoc.js`, `logic/fichaRes060Html.js`, `logic/fichaRes093Html.js` y los modales `FichaRes060Modal.jsx` / `FichaRes093Modal.jsx` (que duplican el HTML **y** la vista previa React). La ficha TER100 ya lo resuelve en `logic/ter100.js` (`alcance`).
12.c **`misma_aerotermia_acs` NO puede esconder un equipo de ACS DECLARADO**: ese flag no se edita en ninguna pantalla —se pone a `true` al activar "se actúa sobre el ACS" y solo baja a `false` al tocar el bloque *Aerotermia Nueva — ACS*—, así que cuando el equipo de ACS lo escribe una migración, un script o una skill de relleno, el flag se queda arriba y **la máquina real desaparece de los documentos**: se declara como SCOP<sub>dhw</sub> el de la bomba de CALEFACCIÓN, que no calienta esa agua (medido en 26RES080_54: 6,47 en vez de 3,69, y el equipo de ACS ni salía en el popup «Datos del equipo»). Entre un booleano que nadie ha tocado y una máquina con marca, modelo y nº de serie, **manda la máquina**. Fuente única: `acsEquipoPropio` / `acsMismoEquipo` en [aerotermiaUnits.js](implementation/frontend/src/features/expedientes/logic/aerotermiaUnits.js). ⚠️ La comparación es **por MODELO** (`aerotermia_db_id`, o marca+modelo si no está en catálogo), **nunca por nº de serie**: con el flag activo la app CLONA el nodo de calefacción y ese clon se queda atrás en cuanto se teclea una serie — medido, 11 expedientes difieren solo en la serie sin tener un segundo equipo. Hoy lo aplican las superficies **CE3X** (`resolverCe3x` → popup «Datos del equipo» y encargo al certificador); el CIFO, las fichas y el ahorro siguen leyendo el flag a propósito —cambiarlo movería cifras de expedientes ya emitidos—, así que la contradicción se **AVISA** en el popup y en Instalación, con un botón que corrige el dato y con él todo lo demás.

13. **WhatsApp en Sidebar**: El botón debe estar posicionado en la sección inferior (entre tabs principales y user profile). Polling del estado: **30s** en sidebar, **8s** en WhatsappSettingsView (reducido desde 5s/2.5s el 2026-04-29 para limitar egress de Supabase — cada request pasa por auth middleware y generaba ~720 req/hora). No bloquear app si servicio no está disponible (graceful degradation con 503).
14. **WhatsApp Session**: `.wwebjs_auth/` y `.wwebjs_cache/` DEBEN estar en `.gitignore`. La sesión es local del servidor.
15. **Catastro — Cliente HTTP**: NUNCA usar `axios` contra `ovc.catastro.meh.es`. Usar el helper `catastroGet()` en [catastroService.js](implementation/backend/services/catastroService.js) (http.request puro, `family:4`, UA `Mozilla/5.0 (compatible; Brokergy/1.0)`). El WAF rechaza axios + Chrome UA largo desde IPs de datacenter.
16. **Catastro — Endpoints**: usar SOLO los WCF JSON (`/OVCServWeb/OVCWcf.../svc/json/*`), NUNCA los ASMX (`/ovcservweb/.../asmx/*`). Los ASMX están filtrados por el WAF a IPs de datacenter; los WCF JSON sirven la misma data sin ese filtro. Params del JSON: `CoorX/CoorY` (no `Coordenada_X/_Y`), `RefCat` (no `RC`).
17. **Catastro — Sin ráfagas**: no usar `Promise.all` con peticiones al Catastro. Siempre secuencial con `await sleep(200+)` entre cada una. Ver `getRCByCoords` para el patrón actual (central + 2 puntos N/E en serie, 800ms).
18. **Miniaturas de Drive — usar el PROXY**: el navegador NO puede hotlinkear de forma fiable las URLs de Drive (`lh3.googleusercontent.com` / `drive.google.com/thumbnail`) desde la app — fallan en `<img>` aunque den 200 por curl. SIEMPRE servir miniaturas vía `GET /api/public/reforma-thumb/:uuid/:driveId?token=&sz=` (mismo origen). NO volver a poner URLs de Drive directas en `src`.
19. **reforma_uploads — escritura ATÓMICA**: NUNCA hacer read-modify-write de todo `datos_calculo` para tocar `reforma_uploads` (dos subidas concurrentes se pisan = pérdida de datos). Usar SIEMPRE las RPC `reforma_append` / `reforma_replace_slot` (jsonb_set por slot, bloqueo de fila).
20. **Documentación — Drive es la fuente de verdad**: la vista (`buildDocsView`) RECONCILIA listando la carpeta Drive y fusiona el estado de `reforma_uploads`. No asumir que la BD y Drive están sincronizados; si Drive tiene un fichero, debe aparecer. El estado (validada/rechazada) vive POR FOTO en la entrada de `reforma_uploads`, no por slot.
21. **NUNCA guardar ficheros en base64 dentro de un JSONB**: ni fotos, ni PDFs, ni fichas técnicas. Van a Drive; en BD solo el enlace o el `driveId`. Motivo: Postgres descomprime la columna JSONB **entera** en cuanto una consulta la toca, aunque solo pida un subcampo. 48 MB de fotos en `documentacion` tumbaron la BD dos veces el 21/07/2026 (OOM en la instancia Micro de 1 GB). Un trigger (`scripts/guard_documentacion_size.sql`) rechaza ya cualquier `documentacion` > 2 MB.
22. **Listados: nunca traer columnas JSONB completas**. En un `select` sobre MUCHAS filas, pedir campos concretos (`cee->cee_inicial`) o usar la RPC. Referencias: `get_expedientes_list_v3` (listado de expedientes, con los contadores de incidencias ya agregados) y `utils/ceeEcoFields.js` (`CEE_ECO_SELECT` + `rebuildCee`, usado por lotes). En particular `cee.xml_inicial`/`xml_final` (el XML crudo del CEE, ~12 MB en total) **solo** se leen en el detalle de un expediente. Un `ilike '%…%'` que además pida un JSONB recorre y descomprime la tabla entera — ver el patrón en dos pasos de `findExpediente()` en el MCP.
22.b **Anexo de Cesión MANUSCRITO = escaneo + DNI del cliente + DNI del representante**: el anexo firmado a mano no vale suelto — necesita las dos caras del DNI del cliente en UNA página y el DNI del representante de Brokergy como **última** página, porque es lo que identifica a las dos partes que comparecen. Fuente única del montaje: [utils/dniAnexo.js](implementation/backend/utils/dniAnexo.js) (`dniTwoSidesOnePage`, `mergePdfs`, `readRepresentanteDni`, `buildCesionManuscrita`). Lo usan **los dos caminos**: la subida pública `/firmar-anexos` y, desde 2026-08-05, la subida desde la app (`POST /api/expedientes/:id/documentos/cesion-manuscrita`, multipart). No volver a montarlo a mano en una ruta.
    La app **detecta** la firma manuscrita por ausencia de firma electrónica en el PDF (`tieneFirmaElectronica`: `/ByteRange` + subfiltro PKCS7/CAdES; un escaneo no los tiene). La comprobación se repite en el navegador (`esFirmaManuscrita` en `CesionManuscritaModal.jsx`) para no gastar una subida entera en averiguarlo. **Ante la duda se asume firma electrónica** y se sube tal cual: anexar DNI a un documento ya firmado en digital es peor que no anexarlo, y el modal tiene salida manual ("súbelo tal cual"). Si el expediente ya tiene el DNI (`dni_link`, o las caras sueltas de los migrados) NO se vuelve a pedir.
23. **Cliente EMPRESA — firma el representante legal**: si `clientes.es_empresa`, `nombre_razon_social` es la razón social y `dni` es el CIF; quien comparece y firma es el **representante legal** (`representante_nombre` / `representante_apellidos` / `representante_dni`). El Convenio de Cesión redacta el bloque del Cedente igual que el del Cesionario ("actuando en nombre y representación de la entidad…") y el Anexo I rellena con esos datos el apartado 3 y el "Fdo.". Nunca presentar a una sociedad como "mayor de edad, con documento de identificación B…".
24. **Rechazar un documento que generamos nosotros BLOQUEA su borrador**: el firmante no firma el PDF que le llegó por WhatsApp, firma el que le sirve su enlace público desde `{doc}_drive_link` (`/firmar-anexos` el cliente, `/subir-cifo` el instalador). Rechazar el firmado no toca ese borrador, así que sin bloqueo vuelve al enlace, se descarga el MISMO PDF erróneo y lo firma otra vez igual (26RES060_142: nº de serie mal en el Anexo I). Fuente única: `rechazoBorrador()` en [docValidacion.js](implementation/backend/utils/docValidacion.js) — un borrador está obsoleto mientras el rechazo sea POSTERIOR a `{doc}_sent_at` y a `{doc}_drive_at` (este último lo sella `mergeDocumentacion` al cambiar el enlace, venga la escritura de donde venga). Mientras lo esté, la vista pública no lo ofrece y el proxy de descarga responde 409. `BORRADORES_CLIENTE` cubre **Anexo I, Cesión y CIFO**; el Anexo Fotográfico no, porque no tiene página pública.
    La salida es siempre **corregir los datos y reenviar**: "Rechazar y reenviar corregido" encadena con la superficie de envío de CADA documento, declarada en el mapa `DOC_REGENERABLE` de [DocumentacionModule.jsx](implementation/frontend/src/features/expedientes/components/DocumentacionModule.jsx) — `EnviarAnexosModal` (Anexo I / Cesión), `AnexoFotograficoModal` y `CertificadoCifoModal` / `CertificadoRes080Modal`. Los tres modales reciben la prop `rechazo` y con ella enseñan el motivo en cabecera y mandan un mensaje que explica la corrección y anula la versión anterior. El borrador viejo se archiva en OLD (`replaceExisting` de `/api/pdf/save-to-drive`), y la subida pública del firmado (`/anexos-upload`) también **archiva el firmado rechazado en `6. ANEXOS CAE/OLD` en vez de borrarlo**. Un aviso de rechazo a secas solo manda al firmante a un enlace bloqueado.
    **REGLA — ENVIAR un documento firmable GUARDA antes su borrador en Drive.** El mensaje lleva un
    enlace, no el PDF que vale: la página de firma sirve `{doc}_drive_link`. Si el envío no re-guarda,
    el firmante abre el enlace y firma la VERSIÓN ANTERIOR — medido en 25RES060_71, donde el slot
    seguía apuntando al CIFO del expediente migrado (`CERTIF INSTALADOR_pte.pdf`, 11/08) y el
    instalador lo firmó el 12/08 mientras por email le había llegado el corregido. `EnviarAnexosModal`
    ya lo hacía; `CertificadoCifoModal` no. Ahora los dos guardan con `replaceExisting: true`
    (`saveDraftToDrive`, fuente única con el botón de la nube) **antes** de enviar, y en el CIFO el
    fallo de Drive ABORTA el envío: mandar un enlace sabiendo que sirve otro documento es peor que no
    mandarlo. El RES080 no tiene enlace de firma, así que ahí es best-effort. `cert_cifo_drive_at` lo
    sella solo `mergeDocumentacion` al cambiar el enlace, que es lo que además levanta el bloqueo del
    rechazo.
    ⚠️ `cert_cifo_*` es el mismo slot para dos documentos distintos: el **CIFO** lo firma el INSTALADOR (enlace bloqueable) y el **Certificado RES080** lo firma Brokergy y solo se ENTREGA al cliente. `DOC_REGENERABLE` lo distingue por `isReforma`.
25. **La PROPUESTA se versiona al ENVIARLA, nunca al guardarla**: cada envío archiva su PDF en `0. PROPUESTAS` como `Propuesta_{expte}_v{N}.pdf`, imprime la marca DENTRO del documento y sella qué versión aceptó el cliente. Fuente única: [propuestaVersiones.js](implementation/backend/services/propuestaVersiones.js) — no volver a generar el PDF de la propuesta por separado en cada canal (el del email y el de WhatsApp acababan siendo documentos distintos), ni guardar el HTML de una versión en el JSONB (353 KB de media, regla 21). Ver "Versiones de la PROPUESTA".

26.b **El CIFO y el certificado RES080 identifican a las DOS empresas cuando no son la misma**: la que EJECUTA y factura (instalador asignado) y la HABILITADA que firma ante Industria (`instalador_rite_id`). Sin las dos, el NIF del certificado no casa con el de las facturas del expediente. Fuente única de la decisión y del texto: `empresasActuacion` / `notaDelegacionRite` en [docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js). Con una sola empresa el documento no cambia. Los dos documentos tienen hojas de alto FIJO: tras tocarlos, pasar `check_cifo_paginas.mjs` **y** `check_res080_paginas.mjs`. Ver "Quién EJECUTA la obra y quién FIRMA ante Industria".

27.b **El Certificado RITE se LEE al subirlo**: de él salen la fecha de PRUEBAS y la de FIRMA —las que fijan el inicio y el fin de actuación del CIFO— y una comprobación del emplazamiento (dirección + referencia catastral) contra el expediente. Solo se mandan a leer las DOS PRIMERAS PÁGINAS (258 tokens/página, y estos PDF llegan con los acuses detrás): ~0,0005 € por lectura. Se rellenan HUECOS, nunca se pisa una fecha ya escrita, y el emplazamiento AVISA pero no bloquea. Fuentes únicas: [riteOcrService.js](implementation/backend/services/riteOcrService.js) (leer) y [riteCertificado.js](implementation/backend/services/riteCertificado.js) (juzgar y escribir). Ver "El Certificado RITE se LEE al subirlo".

27.c **La FECHA DE REGISTRO del CEE se LEE del justificante, no es el día de la subida**: la trae impresa en su primera página («…número de registro 3014080/2025 solicitado el 19/07/2025…») y de ella cuelgan el plazo de la obra, el devengo del certificador y el cruce con las facturas. La leen las CUATRO superficies que la sellan (rejilla y enlace público, en CAE y en CEE directos) y se puede releer la de un justificante ya subido con el botón ⟳ (`POST /:id/cee/fecha-registro/leer`, declarada en las dos rutas del módulo CEE). El modelo solo LEE: se le pide la FRASE literal y el código reextrae de ella la fecha (`fechaDesdeFrase`), que es además la evidencia que se le enseña al usuario. Una lectura fallida no tira la subida: se cae a la fecha de hoy **y se dice**. Fuente única: [registroCeeOcrService.js](implementation/backend/services/registroCeeOcrService.js). Lo ya sellado mal se corrige con `scripts/releer_fechas_registro_cee.js`. Ver "La FECHA DE REGISTRO del CEE se LEE del justificante".

27. **Al instalador se le pide TODO de una vez, y un CIFO firmado NO cierra la tarea para siempre**: al enviar el CIFO o la documentación RITE, la app comprueba si el otro también falta y ofrece mandarlo en el MISMO mensaje, con UN enlace (`/instalador/:id`). Reenviarle el CIFO teniendo ya uno firmado (requerimiento) **anula esa firma** (`cert_cifo_refirma_at`), o el enlace de ese mismo correo le dice "todo recibido" y no le deja firmar; la cierran la subida pública y `mergeDocumentacion`, que además sella `cert_cifo_signed_at` y **no deja retroceder `_drive_at`**. Fuente única de qué falta y de los textos: [logic/instaladorPendientes.js](implementation/frontend/src/features/expedientes/logic/instaladorPendientes.js); del envío, `POST /api/expedientes/:id/instalador/enviar`. `cert_rite_drive_link` significa CERTIFICADO RITE aportado — la Memoria que generamos nosotros vive en `memoria_rite_docx_link`. Ver "Al instalador se le pide TODO de una vez".

26. **El bot de WhatsApp solo habla en los chats ETIQUETADOS, en horario y sin tocar dinero**: contesta por la sesión real del VPS, así que sus frenos (etiqueta + lista blanca, 08:00-20:00 Madrid, ventana de silencio, silencio si escribe un humano, tope diario, apagado por defecto) protegen la cuenta de la que dependen TODOS los envíos automáticos. Los datos salen del dossier (`botContexto`, que reusa `buildChecklistData` y `ensureUploadLink`), nunca del prompt; los importes no viajan al dossier. Fuente única del texto: [botPrompt.js](implementation/backend/services/botPrompt.js). Ver "Bot de WhatsApp".

28. **Las cifras del LOTE se leen de sus PDF, y el ahorro verificado manda sobre el pago**: el coste de verificación sale de la BASE IMPONIBLE de la factura del verificador (y va a `lotes.coste_verificacion`, no solo a la entrada del documento); el ahorro verificado de cada expediente sale del informe de verificación y se PROPONE para que lo aplique el ADMIN. **Ningún lote pasa a `PTE. PAGO BROKERGY A CLIENTE` ni a `FINALIZADO` sin el ahorro verificado de todos sus expedientes.** Fuentes únicas: [loteOcrService.js](implementation/backend/services/loteOcrService.js) (leer) y [loteVerificados.js](implementation/backend/services/loteVerificados.js) (casar, contrastar, escribir, `puedePagarseAlCliente`). Los números se piden al modelo como TEXTO y los convierte `numeroEs()`. Ver "Las cifras del lote se LEEN de sus documentos".

29.c **La SOLICITUD de emisión de CAE sale del MISMO botón que los anexos** y va a la carpeta de documentación del lote: los dos salen de los mismos datos y tienen que casar (la fila E3 es el expediente cuyo ZIP es `ActuacionE3`). Si algún expediente se queda sin anexo, la solicitud no se genera. Fuente única: [solicitudCaeService.js](implementation/backend/services/solicitudCaeService.js). El ahorro viaja en CRUDO desde el expediente —el que formatea el anexo lleva punto de millar y `Number()` lo divide por mil— y las filas vacías E6–E15 no se tocan, porque "Seleccione código de la ficha" y AGR010 exportan la misma cadena. Ver "La SOLICITUD de emisión sale del MISMO botón".
29. **El ANEXO del MITECO se RELLENA, no se replica**: es un formulario PDF oficial con 33 campos vivos y el título de la ficha se ELIGE de su desplegable del catálogo. Fuente única: [anexoActuacionService.js](implementation/backend/services/anexoActuacionService.js); se generan los 5 de un lote desde `POST /api/lotes/:id/anexos-actuacion`. El nº de actuación es el que el INFORME de verificación asigna (`verificacion.orden_actuacion`), porque además nombra los adjuntos del ZIP. Un anexo con huecos no se genera. Los campos de tamaño automático los calcula `autoSize` (pdf-lib no lo implementa) y los fijos van en `TAMANO_CAMPO`, nunca leídos del /DA. Ver "El ANEXO del MITECO por actuación".

29.d **El informe de una acción NO repite el mismo aviso por cada elemento, y no todo es un ✓**: el popup de comprobación del paquete listaba quince líneas de las que trece decían lo mismo (el aviso de cada actuación, una por una) y **todas con la palomita verde**, así que un aviso y un "no procede" se leían como una cosa más que había ido bien — y las cinco líneas que se venía a leer quedaban enterradas con el botón de cerrar al final. `items` de `SendActionOverlay` acepta ahora `{ texto, tono }` con **ok** (verde), **aviso** (ámbar, hay que mirarlo aunque no bloquee) e **info** (gris, NO PROCEDE: se cuenta para que no parezca un olvido); una cadena sigue siendo un ✓ verde, así que las demás llamadas no cambian. Los avisos se agrupan por TEXTO y se dice DÓNDE (`agruparPorMensaje` → "en las 5 actuaciones" / "en E1, E3"): de 15 líneas a 7, y el popup cabe sin scroll. Y el paso siguiente obvio va **dentro** del popup (`accion: { etiqueta, onClick }`, que convierte Cerrar en secundario): comprobar y generar siguen siendo dos gestos (regla 40), pero eso no obliga a cerrar y volver a buscar el botón en la pantalla de detrás.

29.b **`SendActionOverlay` se PORTALEA a `document.body`**: un `position: fixed` se ancla al ancestro más cercano con `backdrop-filter` (o `transform`) — es lo que hace `LoteDetailModal` —, así que el overlay se recortaba a la caja del modal y la pantalla se veía a parches, una zona negra y otra difuminada. `createPortal` lo saca de ahí. Por el mismo motivo el velo va casi opaco (93 %) y con blur fuerte: abierto sobre otro modal de fondo claro, uno más ligero lo deja traslucir y el fondo vuelve a verse desigual.
30. **Al Sujeto Obligado se le pide UNA vez por VARIOS lotes**: el botón vive en el cuadro de mando de Lotes (actúa sobre lo filtrado), dice qué pide y por cuánto, y no existe si no hay nada que pedir. Hay DOS peticiones —**firmar las ofertas** de verificación y **pagar** las facturas del verificador— y se pintan todas las aplicables, la firma primero porque bloquea el arranque. **Un lote al que todavía no le toca no se cuenta ni se nombra** (`hastaEstado` para la firma, `haVerificado` para el pago): listar como "se queda fuera" un lote ya cobrado, o pedir la firma de la oferta de uno ya subido a MITECO, es lo que enseña a ignorar la lista. El popup y la ruta son UNO para las dos (`PETICIONES_SO`); lo que cambia —qué se adjunta, cómo se llama, quién queda fuera— lo aporta la petición. Fuente única: [peticionesSo.js](implementation/frontend/src/features/lotes/logic/peticionesSo.js); el envío, `POST /api/lotes/peticion-so`, que prepara TODOS los adjuntos antes de mandar nada y sella su marca. La **oferta se sube arrastrándola** a la fase 3. Tras tocarlo: `node implementation/backend/scripts/test_peticiones_so.mjs`. Ver "Pedirle cosas al SUJETO OBLIGADO desde el cuadro de mando".

31. **Una propuesta con presupuesto ESTIMADO lo dice, y dice a qué afecta**: el flujo interno pregunta el dinero UNA vez (`StepDocsObra`: documento · importe a mano · estimar 15.000 €) y la marca viaja en `inputs.presupuestoEstimado` hasta la portada, la tabla, el recuadro, la nota al pie y el mensaje de envío. El **bono CAE no cambia** (sale del ahorro certificado) y **la deducción del IRPF sí** (es un % del coste con IVA); sin deducción en juego, ese párrafo no se escribe. Fuente única del texto y de la cifra: [logic/presupuestoEstimado.js](implementation/frontend/src/features/calculator/logic/presupuestoEstimado.js), que carga también el backend (`leadMessages`) por import() ESM. Cualquier presupuesto tecleado en la calculadora LEVANTA la marca. Ver "Presupuesto ESTIMADO".

32. **El CEE que MANDA es el FINAL si está cargado, y si no el INICIAL — en TODOS los documentos**: fuente única [ceeFases.js](implementation/frontend/src/features/expedientes/logic/ceeFases.js) (`ceeBaseDocumento`), que sustituye a las cuatro copias de la regla y a las cuatro superficies que no la aplicaban (las fichas RES060/RES093 imprimían 0,00 sin CEE final). Retirar un certificado se hace desde la rejilla del CEE, **solo ADMIN y preguntando**: borrar el `.xml` de Drive no borraba la demanda, que seguía mandando en el CIFO y en la economía. Antes de generar el CIFO / la ficha, la puerta AVISA (ámbar, separado de lo que falta) si no hay CEE final —en especial por la **demanda de ACS**, que es la que sí cambia entre los dos certificados— o si las dos demandas no coinciden; con el ACS fuera de alcance no se avisa: ya se imprime "no aplica" (regla 12.b). Ver "El CEE que MANDA, y qué se avisa antes de generar".

33. **Un REQUERIMIENTO vuelve a pedir la firma del Anexo I y del Convenio, y lo dice con el importe nuevo**: mismo mecanismo que la re-firma del CIFO, generalizado en `BORRADORES_CLIENTE.refirma` ([docValidacion.js](implementation/backend/utils/docValidacion.js) — `refirmaPendiente`, `firmaVigente`). Se lanza desde el **popup de envío** (selector *Primera firma · Requerimiento*, como el del instalador; sale marcado solo si ya hay alguna firma) o desde el MISMO popup del rechazo (`tipo:'requerimiento'`), y en los dos casos sella solo los anexos que ya están firmados. El importe nuevo sale del **ahorro verificado** que se guarda en el expediente, nunca de un campo del mensaje, y con él se generan los anexos mientras el requerimiento siga vivo (`resultsParaDocumento`) — también desde el botón "Generar", o el borrador bueno de Drive se machacaría. El firmado anterior deja de contar (slot ámbar, vista pública y parte diario), sin borrarse. **Un importe que baja se cuenta con lo que ha costado sostenerlo** —qué se ha hecho primero, la cifra dentro de "el expediente sigue adelante"—, y las cuatro superficies lo dicen igual. Textos, importes y plazo: fuente única en [logic/requerimientoFirma.js](implementation/frontend/src/features/expedientes/logic/requerimientoFirma.js). Ver "Un REQUERIMIENTO vuelve a pedir la firma del Anexo I y del Convenio".

34. **La firma A MANO se hace con el MÓVIL, y el documento sale rasterizado**: en `/firmar-anexos`, "Firma a mano" abre un asistente (leer → firmar con el dedo → revisar, por cada documento; después el DNI cara a cara) que estampa la firma en la caja de `SIGN_BOXES` —la MISMA fuente que Autofirma— y rasteriza el PDF a 150 DPI, para que sea indistinguible de un escaneo. La vía de siempre queda como "Ya lo tengo firmado en papel". La tinta es un **port literal** de `ScannerApp/src/renderer/lib/ink.ts` ([ink.js](implementation/frontend/src/features/firma/ink.js)), fija en pluma y trazo medio: se corrige allí y se vuelve a portar, nunca se parchea aquí. Dos gotchas de pdf.js que no se pueden deshacer: `page.render` necesita **`intent: 'print'`** (para pantalla usa `requestAnimationFrame`, que NO corre con la pestaña oculta ni el móvil bloqueado → el escaneo se colgaba para siempre) y **vacía el array que recibe**, así que `cargarPdf` copia siempre. Se LEE hasta la última página antes de poder firmar. **El GROSOR del trazo lo fija el DOCUMENTO**: la firma se estampa al ancho de su recuadro, así que el mismo ajuste daba de 2,44 pt firmando grande a 5,92 firmando compacto (y 0,53 en el recuadro del Anexo I oficial). Al aceptar se REPINTA con el radio que deja `TRAZO_PT` = 2,0 pt ya estampada ([trazoFirma.js](implementation/frontend/src/features/firma/trazoFirma.js) · `radioParaTrazo`), que es el grosor de la firma de Brokergy impresa en la columna de al lado (2,25 pt medidos). Sus constantes salen de la física de `ink.js`, que se re-porta entero, así que se comprueban con `node implementation/backend/scripts/check_trazo_firma.mjs`. La caja del documento llega hasta el lienzo también por el QR (viaja en la sesión de firma móvil) y en el Anexo I la resuelve `resolverCaja`, porque depende del formato del impreso. **Con un ratón delante no se abre la hoja: se ofrece pasar la firma al MÓVIL con un QR** ([firmaMovil.js](implementation/backend/services/firmaMovil.js) + `FirmarConMovil` + `/firma-movil/:token`), port de `signServer.ts` de ScannerApp — token de un solo uso, 10 minutos, sesión en memoria, y al teléfono NO le viaja el documento, solo vuelve el PNG. En local el enlace se compone con la **IP de la LAN** (en el móvil `localhost` es el móvil), lo que además exigió que esa vista pida la API en relativo y que el CORS admita rangos privados fuera de producción. `SignaturePad` y el aviso de girar van **portaleados a `document.body`** o la tarjeta con `backdrop-blur` los recorta (regla 29.b). Único cambio de fondo en el backend: `dni_pdf` como alternativa a las dos caras y `firma_origen`. Ver "La firma A MANO se hace CON EL MÓVIL".


35. **"¿Tienes placas solares?" se pregunta en `/reforma` y llega hasta el CEE**: la respuesta (`si` | `futuro` | `no`) y la potencia viajan `funnel → inputs.fotovoltaica → instalacion.fotovoltaica → encargo al certificador`. Fuente única: [logic/fotovoltaica.js](implementation/frontend/src/features/expedientes/logic/fotovoltaica.js), que el backend carga por import() ESM. **A quien ya tiene placas NO se le propone la medida de mejora de autoconsumo**: se le dice al certificador que las declare como instalación EXISTENTE (`ce3xTextos` · `buildCe3xFinal`). `estado: null` ("sin declarar") no es `'no'`, y la clave va en la BLACKLIST de `normalizeData` porque el enum es en minúscula. No confundir con `reforma_elementos.placas`, que son las placas de ESTA obra. Ver "¿Tienes placas solares?".

37. **El Uf del marco y el Ug del vidrio salen del CATÁLOGO DE VENTANAS, y la MARCA no es el CARPINTERO**: `ventanas_marcos` (una fila por marca+serie+**apertura**: el mismo sistema da otro Uf en corredera) y `ventanas_cristales` (una fila por fabricante+gama+**composición**: el mismo Guardian Sun da Ug 1,3 con aire y 1,0 con argón). Sustituyen a las listas que vivían en el `localStorage` del navegador y a los defaults 2,7 · 1,3 · 0,43, que acabaron impresos tal cual en varios expedientes. La carpintería que fabrica y monta la ventana va en `documentacion.envolvente.marco_carpinteria`, NUNCA en la marca. Un modelo sin el dato **no pisa** lo ya escrito y se avisa en la fila; no se siembra nada que no esté escrito DENTRO de la ficha. El RES080 adjunta la ficha del marco y la del vidrio como anexos (`resolveEnvolventeFichaSlots`), y **la ficha que se sube a un expediente se ofrece para el catálogo** —también en aerotermia—, copiándola SIEMPRE a la carpeta del catálogo y nunca dejándola dentro de un expediente ([catalogoFichas.js](implementation/backend/services/catalogoFichas.js)). Fuentes únicas: [logic/ventanasCatalogo.js](implementation/frontend/src/features/expedientes/logic/ventanasCatalogo.js) y [routes/ventanas.js](implementation/backend/routes/ventanas.js). Ver "El CATÁLOGO DE VENTANAS".

37.b **La ficha del catálogo puede ser VARIOS papeles unidos, y se une UNA vez**: con el SCOP justificado por EPREL el certificado necesita la ficha del fabricante + la ficha EPREL + la etiqueta, y el catálogo solo aportaba la primera — así que las otras dos se subían a mano en CADA expediente con ese equipo. El botón del gestor de anexos las une en un PDF y lo deja como `ficha_tecnica` del modelo ([fichaConsolidada.js](implementation/backend/services/fichaConsolidada.js), `POST /:id/fichas-tecnicas/consolidar`, **staffOnly**). Se une EXACTAMENTE lo que va al certificado (mismo orden del gestor, mismos recortes, mismo `unirAnexos`), y **consolidar deja el expediente consolidado también**: si las piezas sueltas se quedaran, un ⟳ traería el conjunto y el certificado llevaría el EPREL DOS VECES — salen de la lista de anexos, nunca de Drive. Con VARIOS modelos los sueltos **no vienen marcados** (la app no sabe de cuál es cada uno, y el error se propaga a todos los expedientes de ese modelo); una pieza ilegible ABORTA; solo se unen ficheros de ESE expediente. `ficha_tecnica_partes` dice qué trae dentro y se pone a NULL al guardar una ficha suelta. Tras tocarlo: `node implementation/backend/scripts/test_ficha_consolidada.mjs`. Ver "La ficha del catálogo cuando son VARIOS papeles".

36. **La CONFIRMACIÓN DE COBRO es un formulario de la app, no de Tally**: `/cobro/:id?token=` cualifica al cliente (tarifa · fotovoltaica · IRPF) y confirma sus datos de pago cuando el lote llega a fase de pago. Lo obligatorio va AL FINAL y lo comercial delante, y **nunca retiene el cobro**. La forma de pago solo se pregunta a quien asume el coste (`discountCertificates` la calla, porque su convenio no la menciona), y las dos opciones NO cuestan lo mismo: el descuento va sobre la BASE sin IVA y la factura lo repercute, así que sale marcada `desaconsejada` con lo que cuesta de más y el retraso del cobro. **Cambiar de IBAN exige justificante NUEVO** —el anterior acredita la cuenta vieja— y el cambio va lo primero en el aviso al staff. Los datos van a `clientes` y el justificante a su slot de siempre; en `documentacion.cobro`, solo metadatos con RPC de MERGE. Fuentes únicas: [logic/cobroForm.js](implementation/frontend/src/features/cobro/logic/cobroForm.js) (qué se pregunta) y [cobroService.js](implementation/backend/services/cobroService.js) (a quién y con qué datos). Ver "Confirmación de cobro".

39. **Un mensaje de WhatsApp con el RELOJ no está enviado, y el "escribiendo…" es lo que rompe la sesión**: `sendMessage()` devuelve el id en cuanto el mensaje se INSERTA en el chat, así que ese `{ok:true}` no significa entregado — el 08/09/2026 una propuesta quedó sellada con "✓ whatsapp ok" para el cliente y el instalador con los dos PDF dos horas en el reloj. Lo único que lo dice es el **ACK**: `confirmarEntrega()` lo espera tras `waitUntilMsgSent: true` y, si sigue en 0, es error de verdad → FAILED **sin reintentos** (el mensaje ya existe en el chat: reenviarlo lo duplica) + email al admin; si el ack no se puede leer, no se afirma nada. **NUNCA `getChatById`/`getChats`/`msg.getChat`/`sendSeen` en el camino de envío**: en WhatsApp Web 2.3000.x dejan la sesión enviando sin ACK hasta que se desconecta sola ([wwebjs#201849](https://github.com/wwebjs/whatsapp-web.js/issues/201849), sin arreglo publicado). `WWA_TYPING` y `WWA_SEND_SEEN` a `false`; la pausa humana entre mensajes se queda. Fijar la versión de la web (`WWA_WEB_VERSION`) NO sirve: se auto-actualiza igual. Ver "Un mensaje con el RELOJ no está enviado".

40. **El PAQUETE de cada actuación se genera, no se renombra a mano**: los ~20 documentos del expediente copiados como `E{n}-{código}` y comprimidos, en dos modos —`expediente` (la carpeta `E{n}` + `E{n}.zip`) y `gestor` (`{LOTE} - ENVIO GESTOR` + `ActuacionE{n}.zip`, que añade el dictamen y los escritos)—. La nomenclatura se REPRODUCE de los lotes ya presentados, no se inventa; el nº de actuación se SELLA al enviar la solicitud por API (`orden_origen: 'SOLICITUD_API'`, `soloSiFalta`) y es el mismo que rotula el anexo del MITECO (regla 29); lo imprescindible BLOQUEA, lo leve avisa y lo que **NO PROCEDE** (`exigencia()`) se dice con su motivo sin contar como falta; los ficheros se COPIAN y **lo que ya está colocado con su código no se renombra ni se sustituye** (y si una pieza sale de un fichero suelto de Drive, se dice). Fuente única del índice: [envioGestorService.js](implementation/backend/services/envioGestorService.js) (`INDICE`, `COD_RITE`). **El hueco de ficha técnica lo rellena el paquete** desde el catálogo del modelo ([fichaTecnicaSlot.js](implementation/backend/services/fichaTecnicaSlot.js)), en vez de depender de que alguien abra el modal del certificado — que es lo que bloqueó dos actuaciones de LOTE-2025-005 sin faltar ningún documento. El convenio CAE vive en la ficha del S.O. (`prescriptores.convenio_cae_link`), fuera de cualquier lote. **El modo `expediente` es TAMBIÉN el ZIP que se sube a beCAE** antes de la oferta (botón en la fase 3): el contenido NO depende de la ficha —comparadas las 20 actuaciones con dictamen favorable, solo cambia el nombre del `3-5`— y la ficha técnica suelta es el MISMO bloque de anexos del certificado, recortes incluidos. Ver "El ZIP que se sube a beCAE".
    **Y los FIRMADOS que devuelve el S.O. se sueltan todos de golpe en la fase 2**: la app lee las firmas del propio PDF ([utils/firmasPdf.js](implementation/backend/utils/firmasPdf.js) — DER puro, sin dependencias y **sin gasto de tokens**; esto NO valida la firma, solo dice qué certificados la declaran), identifica el documento por el nº de expediente —vigilando que `26RES060_10` no se cuele en `26RES060_105`— y lo registra por `guardarDocFirmado`, que ya le pone el `_fdo`. Sin firma electrónica NO se registra; una firma de otra persona solo AVISA; lo que no se sabe de quién es se PREGUNTA. Fuente única del proceso: [services/firmadosSo.js](implementation/backend/services/firmadosSo.js). Ver "El PAQUETE de cada actuación" y "Los FIRMADOS del S.O.".

41. **Las FICHAS y el ANEXO I se RELLENAN sobre el impreso OFICIAL, ya no se redibujan**: las cinco plantillas son PDF de formulario del Ministerio y se escriben sus casillas ([formularioOficialService.js](implementation/backend/services/formularioOficialService.js)); qué dato ocupa cada una vive en [logic/fichasFormulario.js](implementation/frontend/src/features/expedientes/logic/fichasFormulario.js) y [logic/anexoIFormulario.js](implementation/frontend/src/features/expedientes/logic/anexoIFormulario.js). **El impreso no calcula nada**: los valores salen de los `derive*` de las maquetas, que son los mismos del CIFO. Los nombres de campo son los de la plantilla, ERRATAS INCLUIDAS (`ri i`, `E F`, `Representante delsolicitante`), y un campo que no existe se AVISA. Un documento viaja como `{ html }` o `{ formulario }` y las CUATRO salidas usan la misma (`documentoAPdf`), o el enlace de firma serviría otro documento. El tamaño de letra se fija en la CASILLA, no en el campo (pdf-lib pinta con el de la casilla); la CCAA se ELIGE del desplegable; el EURO no está en Latin-1 (`WINANSI_EXTRA`); y el sello "SIGN" de la plantilla se retira. **Los dos formatos conviven en Drive**, así que `fixedBox` admite una función `({numPaginas, oficial}) => caja` — el Anexo I se distingue por páginas (4 vs 3) y las fichas por el productor del PDF (pdf-lib vs Skia). La maqueta HTML se conserva tras el conmutador **Oficial · Clásico** de los cinco modales. Tras tocarlo: `node implementation/backend/scripts/test_impresos_oficiales.mjs` y `comparar_impresos_oficiales.mjs`. Ver "Las FICHAS y el ANEXO I se RELLENAN".

42. **Al encargar el CEE, el cliente también se entera**: el MISMO botón de «Asignar y notificar» manda al contacto de notificaciones del cliente un aviso de que el trámite ha arrancado, quién lo lleva y que le avisaremos cuando esté registrado. El texto lo redacta el BACKEND (`encargoCeeClienteMsg` en [recordatorios.js](implementation/backend/services/recordatorios.js)) y el popup solo lo enseña —plegado— y deja retocarlo; el borrador y el destinatario salen de `GET /:id/aviso-cliente-cee`. NO sale con «Solo asignar» (el texto afirma que ya le hemos mandado las instrucciones al técnico), se avisa **una vez por fase** (sello en `documentacion.aviso_cliente_cee[fase]`: reasignar técnico no puede volver a anunciarle que su trámite empieza), el «no empieces la obra todavía» **solo si la obra no está hecha**, y no se promete fecha sino el aviso. Un fallo del aviso nunca tumba el encargo. Ver "Al encargar el CEE, el CLIENTE también se entera".

42.b **Un TER173 (y un TER100) se crea DESDE LA OPORTUNIDAD**: selector de SECTOR en la calculadora junto a "Modo Reforma", y la chapa de la ficha del panel de admin es un desplegable (`PATCH /api/oportunidades/:id/ficha`, adminOnly). **El sector se DECLARA y la ficha se DEDUCE** con la misma función en los dos lados (`detectPrograma` · `fichaDesdeInputs`): un desplegable libre de cinco fichas dejaría elegir combinaciones que no existen. El sector se mira ANTES que la reforma (la RES080 es de VIVIENDAS y no existe en terciario), y sin `sector` en el payload manda lo ya declarado — un navegador con la versión anterior devolvería un TER173 a RES093, porque es una hibridación. El expediente HEREDA lo simulado (alcance, piscina, modo de D_ACS) o recalcularía otro ahorro. ⚠️ La D_ACS de la calculadora era un **2.731,4 cableado** que ignoraba el CEE cargado; en terciario se resuelve ya con `demandaAcs.js` (el residencial lo conserva). Ver "Se crea DESDE LA OPORTUNIDAD".

42. **TER173 es la TER100 ponderada por el C_b de la RES093, y su impreso no tiene casilla para el C_b**: `AE_TOTAL = (AE_C + AE_ACS + AE_CAP) · C_b` (apartado 4), así que el total que imprime la ficha oficial NO cuadra con la suma de sus tres sumandos impresos — lo explica el CIFO (desglose con Σ AE y C_b + apartado 8). El C_b pondera el TOTAL, no solo la calefacción, **y por el mismo motivo se corrigió la RES093**, cuya ficha lo pone igual. La tabla del Anexo IV coincide valor a valor con la del Anexo III de la RES093: una sola `BIVALENCE_TABLE` (la columna de geotermia del Anexo IV no se implementa). Un TER173 **sin datos de hibridación no genera CIFO**: con C_b = 1 el ahorro sale más alto que el real y va firmado. Fuentes únicas: [logic/terciario.js](implementation/frontend/src/features/expedientes/logic/terciario.js) (que sustituye a `ter100.js`, renombrado porque resuelve las DOS fichas del terciario) y `calculateTerciario()` en `calculation.js`. Tras tocarlo: `test_ter173.mjs`, `test_impresos_oficiales.mjs` y `check_cifo_paginas.mjs`. Ver "Ficha TER173".

43. **El precio CAE al cliente es 100 €/MWh en las propuestas NUEVAS, y lo ya guardado no se mueve**: `CAE_PRECIO_CLIENTE_NUEVAS` (100) va donde se COMPONEN inputs nuevos (calculadora · funnel) y `CAE_PRECIO_CLIENTE_ANTERIOR` (95 · 60 en RES080) es el respaldo de LECTURA de lo ya guardado sin precio propio — subirlo cambiaría el bono de expedientes ya firmados. Y el precio **se SELLA** en la oportunidad ([precioCae.js](implementation/backend/utils/precioCae.js)) copiando `caePriceClient` a `cae_client_rate`, que es la clave que el expediente lee y que hacía que el precio tecleado no le llegara (66 expedientes medidos, de 88 a 150 €/MWh). El sello se escribe **solo en las nuevas** —la presencia de la clave ES la marca, sin fechas de corte— y se mantiene al día. Ver "Precio CAE al cliente".

44. **Cada aviso va al COMERCIAL o al TÉCNICO del partner, no "al instalador"**: cada persona de `contactos_notificacion` lleva `roles: ['comercial'|'tecnico']` y quien envía pide el suyo — fuente única [notifyContacts.js](implementation/backend/services/notifyContacts.js) (`partnerNotifyTarget(p, rol)`, `rolDeDocumento`) y su espejo [docContacts.js](implementation/frontend/src/features/expedientes/utils/docContacts.js). El RITE, el CIFO y sus rechazos son del TÉCNICO; propuestas, fotos y seguimiento, del COMERCIAL. **El representante legal NO es un buzón**: su nombre es el que firma el CIFO, y ofrecerlo como destinatario era el fallo — 67 de 70 fichas no tienen `tlf_responsable`, así que su nombre salía pegado al teléfono de la EMPRESA ("Jesús · 654547040", el número de Carlos). Sin nadie marcado se envía al canal GENERAL, rotulado como tal y avisado en ámbar; a una empresa se le saluda en genérico y a un autónomo por su nombre; al CERTIFICADOR no se le aplica el reparto (sus plantillas no admiten nombre vacío). Un contacto sin roles se comporta como hasta ahora y **no se le adivina** el suyo. En el CIFO no va ningún teléfono. Tras tocarlo: `node implementation/backend/scripts/test_reparto_contactos.js`. Ver "El aviso lo recibe el COMERCIAL o el TÉCNICO".

43. **La cartera de INSTALADORES se etiqueta sola en WhatsApp**: al dar de alta o editar un instalador (y en el repaso completo desde el panel de WhatsApp) su chat queda con la etiqueta `INSTALADORES` y, si el número no lo tenías guardado, con su nombre de la BBDD en la agenda. **Un nombre ya guardado NO se toca nunca** —lo puso una persona, a veces con el apodo por el que conoce al instalador— y la lista de etiquetas se manda COMPLETA (`poner()` sustituye, así que va lo que ya tenía MÁS la nuestra). Se etiquetan TODOS los teléfonos que constan (empresa, responsable y contactos de notificación: en 20 de 71 fichas el chat que se usa es el del jefe de obra), deduplicados por los 9 dígitos finales. Fuente única: [whatsappInstaladoresSync.js](implementation/backend/services/whatsappInstaladoresSync.js) + [whatsappContactos.js](implementation/backend/services/whatsappContactos.js). ⚠️ `poner()` fallaba con un chat nunca escrito (`findOrCreateLatestChat` lo devuelve pero `C.Chat.get(@c.us)` sigue vacío porque vive bajo su `@lid`): ahora se crea y se etiqueta en la misma `evaluate`. ⚠️ Un `node scripts/…` NO ve la sesión de WhatsApp (singleton del proceso del servidor), por eso el repaso entra por la ruta con `x-internal-key`. Apagado por defecto (`WA_SYNC_INSTALADORES`) y `dryRun` por defecto en la ruta. Ver "La cartera de instaladores, etiquetada sola en WhatsApp".

38. **Con la BD caída, la app CALLA; nunca contesta una cifra tranquila**: un error de lectura no puede salir por 200. [middleware/auth.js](implementation/backend/middleware/auth.js) seguía adelante con el perfil a null —sin rol, sin empresa— y lo **cacheaba 5 minutos**, así que el partner salía como "USUARIO / LOGO PARTNER", con el menú recortado y, como `GET /oportunidades` acaba filtrando por `creador_id = null`, la cartera a CERO; y esa misma ruta convertía además cualquier fallo de Supabase en `200 []`. Un distribuidor con 19 oportunidades vio "0 oportunidades · 0,00 €" con toda la apariencia de dato bueno —que se lee como trabajo borrado— y recargar no lo arreglaba, porque el fantasma vivía en la caché. Medido el 08/09/2026: Postgres se cayó y arrancó en recuperación (`database system was not properly shut down`) y Cloudflare sirvió **521 Web server is down** delante de Supabase durante ~1 min. Ahora las dos rutas responden **503** (`PROFILE_UNAVAILABLE` / `OPORTUNIDADES_UNAVAILABLE`) y no se cachea nada; el frontend enseña `ProfileUnavailable` (reintentar, y "tus datos siguen ahí") en vez de un dashboard con identidad falsa, la lista conserva lo que ya tuviera, y **el resumen financiero no se pinta si no hay datos** — 0,00 € es justo la cifra que asusta. A quien YA tiene perfil bueno en caché no se le echa por un parpadeo. Vigilado por `node implementation/backend/scripts/test_caida_bd_no_miente.js`.

---

## Arquitectura de Ficheros Clave

```
implementation/
├── backend/
│   ├── routes/
│   │   ├── oportunidades.js    ← CRUD oportunidades + Drive + estados
│   │   ├── expedientes.js      ← CRUD expedientes + POST /:id/facturas/upload (Drive)
│   │   ├── prescriptores.js    ← CRUD partners + PATCH /:id/acceso (toggle acceso)
│   │   ├── clientes.js         ← CRUD clientes
│   │   ├── aerotermia.js       ← GET /marcas + GET / (modelos por marca)
│   │   ├── geo.js              ← CCAA/Provincias/Municipios desde CSV
│   │   ├── whatsapp.js         ← Admin-only: /status, /qr, /send-text, /send-media
│   │   └── (catastro, google, pdf...)
│   ├── services/
│   │   ├── driveService.js     ← setupOpportunityFolder, moveFolder, copyFolderContents,
│   │   │                          saveFileToFolder, findSubfolderByName, createSubfolder
│   │   ├── catastroService.js  ← WCF JSON: getByRC, getRCByCoords, getCoordinatesByRC, getDwellingsByParcel
│   │   │                          + helper catastroGet() (http.request puro, family:4, UA Brokergy)
│   │   ├── catastroMonitor.js  ← Monitor de WAF: bloquea al 1er 403, alerta admin, ping cada 5min
│   │   ├── whatsappService.js  ← Singleton: init(), disconnect(), getStatus(), getQr(), 
│   │   │                          sendText(), sendMedia() + Queue + rate limiting
│   │   └── supabaseClient.js
│   ├── middleware/
│   │   └── auth.js             ← requireAuth / enforceAuth / check activo
│   ├── scripts/
│   │   ├── expedientes_schema.sql ← Migración tabla expedientes (ejecutar en Supabase)
│   │   ├── drive_auth.js       ← Regenerar OAuth token de Drive
│   │   └── import_instaladores.py ← Importación masiva de instaladores desde Excel
│   └── data/
│       └── MUNICIPIOS.csv      ← Fuente de verdad para municipios españoles
└── frontend/src/
    ├── features/
    │   ├── expedientes/
    │   │   ├── views/
    │   │   │   ├── ExpedientesView.jsx       ← Lista + modal creación
    │   │   │   └── ExpedienteDetailView.jsx  ← Detalle con 4 módulos acordeón
    │   │   └── components/
    │   │       ├── CeeModule.jsx             ← CEE Inicial + Final siempre visibles, XML parsing con fechas
    │   │       ├── ClienteModule.jsx         ← Tarjeta + abre ClienteDetailModal
    │   │       ├── InstalacionModule.jsx     ← Dirección+UTM, caldera, tipo_emisor, aerotermia+SCOP, instalador
    │   │       └── DocumentacionModule.jsx   ← Fechas CEE, facturas+Drive upload, CIFO auto
    │   ├── clientes/
    │   │   ├── views/ClientesView.jsx
    │   │   └── components/
    │   │       ├── ClienteFormModal.jsx      ← Crear cliente
    │   │       └── ClienteDetailModal.jsx    ← Ver/editar + oportunidades vinculadas
    │   ├── admin/views/
    │   │   ├── AdminPanelView.jsx            ← Panel admin (oportunidades)
    │   │   ├── PrescriptoresList.jsx         ← Tabla partners + formulario creación
    │   │   └── PrescriptorDetailModal.jsx    ← Modal ver/editar partner (patrón idéntico a ClienteDetailModal)
    │   ├── whatsapp/
    │   │   ├── views/
    │   │   │   └── WhatsappSettingsView.jsx  ← Panel conexión QR + estado + configuración
    │   │   └── components/
    │   │       └── SendWhatsappModal.jsx     ← Modal envío texto/media reutilizable
    │   └── calculator/
    │       ├── components/SaveOpportunityModal.jsx
    │       └── logic/
    │           ├── xmlCeeParser.js           ← parseCeeXml() extrae demanda + fechaFirma + fechaVisita
    │           └── calculation.js            ← getScopFromModel(model, zone, temp), BOILER_EFFICIENCIES
    └── components/layout/DashboardLayout.jsx ← Sidebar con tabs (todos los roles)
```

---

## Patrón de Modales (Clientes y Prescriptores)

Ambos módulos usan el mismo patrón visual y funcional:
- **Vista de lectura** por defecto al abrir el modal
- **Botón "Editar"** dentro del modal activa el formulario inline
- **Toggle de acceso** (prescriptores): aparece en el header del modal junto al logo/nombre
- Los campos de contraseña (prescriptores) solo se muestran en edición cuando el acceso está activo

---

## Módulo Prescriptores — Novedades (2026-03-26)

### Tabla `prescriptores` — campos nuevos
| Campo | Tipo | Notas |
|---|---|---|
| `nombre_responsable` | VARCHAR(200) | Nombre del responsable técnico / representante legal |
| `apellidos_responsable` | VARCHAR(200) | Apellidos del responsable |

### Toggle de Acceso al Portal
- `PATCH /api/prescriptores/:id/acceso` con `{ activar: true/false }`
- **Activar sin email** → HTTP 400
- **Activar (sin cuenta)** → crea `auth.users` + `usuarios` con NIF/CIF como contraseña inicial
- **Activar (cuenta existente inactiva)** → desbanea en Auth + `activo = true`
- **Desactivar** → baneado en Auth (876.000h) + `activo = false`

### Importación masiva
- Script: `backend/scripts/import_instaladores.py`
- Fuente: `data/bbdd_instaladores.xlsx` (34 instaladores, tipo INSTALADOR)
- Los importados entran **sin acceso** (`representante_legal_id = null`)
- Tiene lógica de deduplicación por CIF (skip si ya existe)

---

## Variables de Entorno Requeridas

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN
DRIVE_ROOT_FOLDER_ID               ← Carpeta raíz donde van las oportunidades "PTE ENVIAR"
GOOGLE_MAPS_API_KEY

# WhatsApp Business (whatsapp-web.js)
WHATSAPP_ENABLED=true              ← Habilitar/deshabilitar servicio (default: true)
WWA_MIN_DELAY_MS=2500              ← Delay mínimo entre mensajes (ms)
WWA_MAX_DELAY_MS=6000              ← Delay máximo entre mensajes (ms)
WWA_RATE_PER_MIN=10                ← Mensajes/minuto en cola

# Entrega de WhatsApp (ver "Un mensaje con el RELOJ no está enviado")
WWA_TYPING=false                   ← "escribiendo…": ROMPE la entrega en 2.3000.x. No encender
WWA_SEND_SEEN=false                ← marcar leído antes de enviar: misma tabla de chats, mismo efecto
WWA_VERIFICAR_ACK=true             ← no dar por enviado lo que no tiene ACK
WWA_ACK_ESPERA_MS=25000            ← cuánto se espera al ACK antes de darlo por fallido
WWA_WEB_VERSION=                   ← vacío = la última que sirva Meta. Fijarla NO arregla nada (se auto-actualiza)

# Instaladores ⇄ etiqueta de WhatsApp (ver "La cartera de instaladores, etiquetada sola")
WA_SYNC_INSTALADORES=false         ← enganche automático al alta/edición. En LOCAL, APAGADO: escribe en la agenda real
WA_SYNC_ETIQUETA_INSTALADORES=INSTALADORES
WA_SYNC_PAUSA_MS=1500              ← pausa entre chats (no hacerle ráfagas a ese Chrome)
WA_SYNC_FALLOS_MAX=3               ← tiempos de espera seguidos tras los que se corta el repaso
```

---

## Documentación Adicional

- [TECH_MANUAL.md](TECH_MANUAL.md) — Arquitectura técnica profunda, integraciones, flujos de datos
- [DESIGN_SPEC.md](DESIGN_SPEC.md) — Especificación del módulo de Consulta Catastral
