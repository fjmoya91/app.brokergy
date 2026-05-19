# CLAUDE.md — Instrucciones para Agentes de IA

Este archivo se carga automáticamente en cada conversación de Claude Code. Lee esto ANTES de tocar cualquier fichero.

---

## Estado Actual del Proyecto (Actualizado 2026-04-17)

La app Brokergy es un CRM interno para gestión de oportunidades de rehabilitación energética en España. Stack: **React + Vite** (frontend), **Node.js/Express** (backend), **Supabase** (BD + auth), **Google Drive** (expedientes), desplegada en **Vercel**.

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

## Reglas Críticas — No Romper

1. **Drive**: La creación de carpetas es **no bloqueante**. **REGLA DE ORO:** Los enlaces a Drive (`drive_folder_link`) solo se muestran en el frontend si `user.rol === 'ADMIN'`.
2. **Estados de oportunidad**: Los estados válidos son `PTE ENVIAR`, `EN CURSO`, `ENVIADA`, `ACEPTADA`. Cada cambio de estado mueve la carpeta de Drive automáticamente.
3. **IDs de oportunidad**: Formato `{YY}RES_OP{N}`. No renombrar IDs antiguos para mantener trazabilidad.
4. **Validación de Documentos**: Usar siempre el helper `isPresent(val)` en `validateExpediente` para comprobar que los datos no son nulos, vacíos ni placeholders (`_______`).
5. **PDF Propuestas**: El encabezado usa **CSS Grid**. No cambiar a Flexbox para evitar desbordamientos.
6. **Seguridad de rutas**: Todas las rutas del backend usan `requireAuth` o `enforceAuth`.
7. **Diseño de Anexos**: El padding superior de 90px en `AnexoIModal` es sagrado para evitar cortes en la cabecera al imprimir a PDF.
8. **Expedientes — SCOP según emisor**: `suelo_radiante`→35°C, `radiadores_baja_temp`→45°C, `radiadores_convencionales`→55°C.
9. **DNI único**: La columna `clientes.dni` tiene constraint `UNIQUE`.
10. **Modales de Clientes / Partners**: Nunca cerrar al clicar fuera. Solo "X" o "Cancelar".
11. **XML Upload**: Parseo automático de demandas y también de `fechaFirma` y `fechaVisita`.
12. **ACS en Anexo I**: Validar `inputs.changeAcs || inputs.incluir_acs`. Si es false, ocultar unidad interior.
13. **WhatsApp en Sidebar**: El botón debe estar posicionado en la sección inferior (entre tabs principales y user profile). Polling del estado: **30s** en sidebar, **8s** en WhatsappSettingsView (reducido desde 5s/2.5s el 2026-04-29 para limitar egress de Supabase — cada request pasa por auth middleware y generaba ~720 req/hora). No bloquear app si servicio no está disponible (graceful degradation con 503).
14. **WhatsApp Session**: `.wwebjs_auth/` y `.wwebjs_cache/` DEBEN estar en `.gitignore`. La sesión es local del servidor.
15. **Catastro — Cliente HTTP**: NUNCA usar `axios` contra `ovc.catastro.meh.es`. Usar el helper `catastroGet()` en [catastroService.js](implementation/backend/services/catastroService.js) (http.request puro, `family:4`, UA `Mozilla/5.0 (compatible; Brokergy/1.0)`). El WAF rechaza axios + Chrome UA largo desde IPs de datacenter.
16. **Catastro — Endpoints**: usar SOLO los WCF JSON (`/OVCServWeb/OVCWcf.../svc/json/*`), NUNCA los ASMX (`/ovcservweb/.../asmx/*`). Los ASMX están filtrados por el WAF a IPs de datacenter; los WCF JSON sirven la misma data sin ese filtro. Params del JSON: `CoorX/CoorY` (no `Coordenada_X/_Y`), `RefCat` (no `RC`).
17. **Catastro — Sin ráfagas**: no usar `Promise.all` con peticiones al Catastro. Siempre secuencial con `await sleep(200+)` entre cada una. Ver `getRCByCoords` para el patrón actual (central + 2 puntos N/E en serie, 800ms).

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
