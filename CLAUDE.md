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

### La rejilla de los dos CEE
Las cinco columnas (250+150+225+320+340 px) se apilan a ancho completo. Las **tres fechas pasan a
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

⚠️ **La cuota de Gemini es el cuello de botella real.** Con la key en plan
gratuito el límite salta a las ~20 peticiones seguidas. Un 429 **NO escala**
—sería mandarle al cliente un "te contesta un compañero" porque hemos pedido
demasiado rápido—: se reprograma el mensaje y **se corta el barrido entero**,
porque los siguientes chocarían con la misma cuota.

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
8.c **Anexos del CIFO — una ficha técnica por MODELO, no por hueco**: hasta 2026-08-13 había dos huecos fijos (`aerotermia_cal` y `aerotermia_acs`) y eso fallaba por los dos lados. **Por defecto** en cascada: el hueco de calefacción resolvía la ficha de la UNIDAD 1 y las demás quedaban sin justificar (medido: 26RES060_130, dos modelos distintos, iba sin la ficha de la unidad 2). **Por exceso** con un equipo que cubre calefacción y ACS —lo habitual—: el hueco de ACS resolvía el MISMO modelo y el PDF llevaba dos veces las mismas treinta páginas (medido: **24 de 241** expedientes). Fuente única: [fichasTecnicas.js](implementation/frontend/src/features/expedientes/logic/fichasTecnicas.js) — `resolveFichaSlots` agrupa las unidades (cal + ACS) por `aerotermia_db_id`, o por marca+modelo si se tecleó a mano, y devuelve **un hueco por grupo**. El que cubre los dos servicios se anuncia como "Ficha técnica aerotermia calefacción y ACS". Lo consumen las CUATRO superficies y no se decide en ninguna otra: los dos modales (`CertificadoCifoModal`, `CertificadoRes080Modal`), `cifoService` (generación automática / MCP) y las tres rutas `/fichas-tecnicas/*`. **La ruta valida contra el mismo alcance que el modal** (mismo motivo que la regla del checklist documental): sin eso, subir a un hueco que la vista ya no enseña respondería 200 y dejaría un destino vivo. Nomenclatura sin migración: el primer hueco de cada bloque conserva sus claves de siempre (`cal`/`acs`, `ft_aerotermia_cal_link`, "… - FT AEROTERMIA CALEFACCION.pdf") y los adicionales son `cal2`, `cal3`… (`ft_aerotermia_cal2_link`, "… CALEFACCION 2.pdf"). `annexPrefs` **dedupe por `driveId`** como red de seguridad: dos huecos que apunten al mismo fichero se anexan una vez. Un `ft_aerotermia_acs_link` heredado que ya no corresponde se ignora — el fichero sigue en Drive, pero no vuelve al PDF.
9. **DNI único**: La columna `clientes.dni` tiene constraint `UNIQUE`.
10. **Modales de Clientes / Partners**: Nunca cerrar al clicar fuera. Solo "X" o "Cancelar".
11. **XML Upload**: Parseo automático de demandas y también de `fechaFirma` y `fechaVisita`.
12. **ACS en Anexo I**: Validar `inputs.changeAcs || inputs.incluir_acs`. Si es false, ocultar unidad interior.
12.b **ACS fuera del alcance → "no aplica", nunca el valor ni 0**: en la tabla del apartado 4 (Ficha RES060/RES093/TER100 y Certificado CIFO), si el ACS no computa, **D<sub>ACS</sub> se imprime "no aplica"** igual que SCOP<sub>dhw</sub>. Dejar la demanda a la vista invita al verificador a multiplicarla y a obtener un AE<sub>ACS</sub> que no forma parte de la actuación; un 0 afirma una demanda nula, que es falso. Mismo criterio que D<sub>CAL</sub>/S cuando la calefacción queda fuera (TER100). El alcance se decide igual que en el CIFO: `cambio_acs !== false` **y** que el equipo nuevo no sea un termo eléctrico (efecto Joule, rendimiento 1). Son CINCO sitios y van a la vez: `logic/cifoDoc.js`, `logic/fichaRes060Html.js`, `logic/fichaRes093Html.js` y los modales `FichaRes060Modal.jsx` / `FichaRes093Modal.jsx` (que duplican el HTML **y** la vista previa React). La ficha TER100 ya lo resuelve en `logic/ter100.js` (`alcance`).
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

26. **El bot de WhatsApp solo habla en los chats ETIQUETADOS, en horario y sin tocar dinero**: contesta por la sesión real del VPS, así que sus frenos (etiqueta + lista blanca, 08:00-20:00 Madrid, ventana de silencio, silencio si escribe un humano, tope diario, apagado por defecto) protegen la cuenta de la que dependen TODOS los envíos automáticos. Los datos salen del dossier (`botContexto`, que reusa `buildChecklistData` y `ensureUploadLink`), nunca del prompt; los importes no viajan al dossier. Fuente única del texto: [botPrompt.js](implementation/backend/services/botPrompt.js). Ver "Bot de WhatsApp".

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
