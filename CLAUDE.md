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

### Los ocho bloques — [seguimientoRadar.js](implementation/backend/services/seguimientoRadar.js)

Cada detector responde a lo mismo: *¿de quién es la pelota y desde cuándo?* Los
umbrales y la reinsistencia viven en el mapa `BLOQUES` (todos con variable de entorno).

| Bloque | Criterio | Pelota | Botón |
|---|---|---|---|
| `RECHAZO_SIN_REENVIAR` | `rechazoBorrador().obsoleto` >2 d | BROKERGY | — (corregir y regenerar) |
| `REVISION` | `cee_* ∈ PRESENTADO/PTE_REVISION` >2 d | BROKERGY | — |
| `OBRA_SIN_CERRAR` | obra ejecutada + `cee_final` sin encargar >5 d | BROKERGY | — |
| `REGISTRO` | `cee_* = REVISADO` >2 d | CERTIFICADOR | Recordar el registro |
| `CERT_SIN_ENTREGAR` | `ASIGNADO/EN_TRABAJO/PTE_PRESENTACION` >10 d | CERTIFICADOR | Pedir fecha |
| `SIN_ENCARGAR` | sin certificador >7 d | BROKERGY | — |
| `MIGRADO_SIN_REVISAR` | `PENDIENTE REVISAR EXPTE` >15 d | BROKERGY | — |
| `FIRMA_PENDIENTE` | `_sent_at` sin `_signed_link` >7 d | CLIENTE/INSTALADOR | Recordar la firma |
| `FIN_OBRA` | CEE ini. registrado, sin señales de obra >30 d | CLIENTE/INSTALADOR | ¿Cómo va la obra? |

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
sobrefinanciación. El importe es siempre la **base imponible**.

`funnel.presupuesto_modo = 'documento'` (nuevo, junto a `'tengo'`) hace que `funnelToInputs` use esa
cifra: es literalmente la inversión que declarará el Anexo.

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

## Reglas Críticas — No Romper

1. **Drive**: La creación de carpetas es **no bloqueante**. **REGLA DE ORO:** Los enlaces a Drive (`drive_folder_link`) solo se muestran en el frontend si `user.rol === 'ADMIN'`.
2. **Estados de oportunidad**: Los estados válidos son `PTE ENVIAR`, `EN CURSO`, `ENVIADA`, `ACEPTADA`. Cada cambio de estado mueve la carpeta de Drive automáticamente (mapa en `services/driveFolders.js`, ver "Carpetas de Drive por estado").
3. **IDs de oportunidad**: Formato `{YY}RES_OP{N}`. No renombrar IDs antiguos para mantener trazabilidad.
3.b **Fichas**: hay CUATRO tipologías — `RES060`, `RES080`, `RES093` y `TER100`. La lista NO se escribe a mano en cada sitio: backend en [utils/fichas.js](implementation/backend/utils/fichas.js) (`FICHAS`, `correlativoInicial`, `detectPrograma`), frontend en `expedienteTaxonomia.js` (`FICHAS`, `getFicha`). El correlativo inicial NO es 1 en todas (RES080 → 36, TER100 → 3). Ver "Ficha TER100".
4. **Validación de Documentos**: Usar siempre el helper `isPresent(val)` en `validateExpediente` para comprobar que los datos no son nulos, vacíos ni placeholders (`_______`).
5. **PDF Propuestas**: El encabezado usa **CSS Grid**. No cambiar a Flexbox para evitar desbordamientos.
6. **Seguridad de rutas**: Todas las rutas del backend usan `requireAuth` o `enforceAuth`.
7. **Diseño de Anexos**: El padding superior de 90px en `AnexoIModal` es sagrado para evitar cortes en la cabecera al imprimir a PDF.
8. **Expedientes — SCOP según emisor**: `suelo_radiante`→35°C, `radiadores_baja_temp`→45°C, `radiadores_convencionales`→55°C. En **RES080** la unidad terminal puede ser **aire-aire**: `splits` y `conductos`. No tienen temperatura de impulsión de agua — la ficha da un único SCOP, así que en el catálogo `aerotermia` esos modelos llevan el MISMO valor en `scop_cal_medio_35` y `_55` (`tipo = 'AIRE-AIRE'`) y el certificado imprime "unidad terminal …" en vez de "impulsión N°C". La lista de emisores es **fuente única** en [cifoDoc.js](implementation/frontend/src/features/expedientes/logic/cifoDoc.js) (`EMITTER_OPTIONS` / `getEmitterTemp` / `emitterScopContext`); no volver a duplicarla en los modales. Splits y conductos solo se ofrecen si el nº de expediente es RES080.
8.b **Cb (RES093) — la carga de diseño sale del REGLAMENTO EUROPEO, no de la zona climática**: en el método `demanda`, `P_designh = Q_H / H_HE` (Rgto. (UE) 813/2013, Anexo III, punto 4, letra c); el Rgto. Delegado (UE) 811/2013, Anexo VII, punto 4, letra c) da las tres temporadas: medias **2.066 h** · más frías **2.465** · más cálidas **1.336**). **Las horas son las de la MISMA temporada en la que se declara el SCOP aplicado**, o el rendimiento y la potencia salen de temporadas distintas y dejan de compararse en igualdad de condiciones. Esa temporada la sella `instalacion.aerotermia_cal.scop_temporada` al elegir modelo/método/emisor (`getScopSeason`, que sale de la MISMA decisión que el valor del SCOP en `resolveScop`); sin sellar → `medio`, y el CIFO dice expresamente que no consta rendimiento para condiciones más cálidas. Fuente única: `HE_ACTIVE_MODE_HOURS` en [calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js). **No volver a dividir por "horas equivalentes" de la zona** (las tablas RES220/RES230, 3.503 h en D3): son horas de funcionamiento, daban una carga de diseño ~40 % baja y con ella un Cb inflado. El apartado 8 del CIFO desarrolla el procedimiento en 5 pasos con las referencias [R1]-[R5] y ocupa DOS páginas; el método `caldera` no usa horas y sigue en una.
9. **DNI único**: La columna `clientes.dni` tiene constraint `UNIQUE`.
10. **Modales de Clientes / Partners**: Nunca cerrar al clicar fuera. Solo "X" o "Cancelar".
11. **XML Upload**: Parseo automático de demandas y también de `fechaFirma` y `fechaVisita`.
12. **ACS en Anexo I**: Validar `inputs.changeAcs || inputs.incluir_acs`. Si es false, ocultar unidad interior.
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
    ⚠️ `cert_cifo_*` es el mismo slot para dos documentos distintos: el **CIFO** lo firma el INSTALADOR (enlace bloqueable) y el **Certificado RES080** lo firma Brokergy y solo se ENTREGA al cliente. `DOC_REGENERABLE` lo distingue por `isReforma`.

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
```

---

## Documentación Adicional

- [TECH_MANUAL.md](TECH_MANUAL.md) — Arquitectura técnica profunda, integraciones, flujos de datos
- [DESIGN_SPEC.md](DESIGN_SPEC.md) — Especificación del módulo de Consulta Catastral
