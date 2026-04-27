# 📘 Manual Técnico Maestro - Brokergy App

Este documento sirve como guía definitiva para el desarrollo, mantenimiento e integración de la aplicación Brokergy. Cualquier agente o desarrollador que trabaje en este proyecto debe leer este manual para entender la arquitectura y los flujos críticos.

---

## 1. Arquitectura del Proyecto
La aplicación está organizada como un monorepo simplificado dividido en dos capas principales dentro de la carpeta `/implementation`:

*   **Frontend (/frontend)**: Aplicación SPA construida con **React + Vite**. Utiliza **Tailwind CSS** para los estilos y **Axios** para las peticiones a la API.
*   **Backend (/backend)**: Servidor **Node.js (Express)** que actúa como bridge entre el frontend y los servicios externos.
*   **API Wrapper (/api)**: Punto de entrada para el despliegue en **Vercel**, configurado mediante `vercel.json` en la raíz.

---

## 2. Integraciones de Terceros (Stack)

### A. Supabase (Base de Datos y Auth)
*   **Misión**: Almacena oportunidades, usuarios, roles y datos de partners (prescriptores).
*   **Auth**: Utiliza el sistema de autenticación de Supabase. El token (JWT) se envía en el header de cada petición al backend.
*   **Variables Críticas**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### B. Google Drive (Gestión de Expedientes)
*   **Misión**: Creación automática de carpetas para cada cliente clonando una estructura de plantilla predefinida.
*   **Método**: OAuth2 con **Refresh Token** (permite que la app actúe "como el usuario" de la cuenta de Google One).
*   **Flujo**:
    1.  Al guardar una oportunidad, el backend llama a `setupOpportunityFolder`.
    2.  Se crea la carpeta raíz con el nombre del cliente.
    3.  Se ejecuta `copyFolderContents` usando `Promise.all` para clonar archivos en paralelo (mejor rendimiento para evitar timeouts en Vercel).
*   **Variables Críticas**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`.

### C. Google Maps & Places
*   **Misión**: Búsqueda autocompletada de direcciones y geocodificación inversa para obtener la Referencia Catastral a partir de coordenadas.
*   **Servicio**: `googleService.js`.

### D. Catastro (API Oficial)
*   **Misión**: Obtiene datos técnicos del inmueble (superficie, año, uso) y mapas WMS mediante peticiones a la Sede Electrónica del Catastro.

---

## 3. Flujo de Datos Crítico: El ciclo de una Oportunidad

1.  **Cálculo**: El usuario introduce datos en `CalculatorView.jsx`. El frontend solicita datos al Catastro via `/api/catastro`.
2.  **Guardado**: Se lanza un `POST` a `/api/oportunidades`. 
3.  **Identificación Robusta (Novedad 2026-04-01)**: El backend utiliza una búsqueda jerárquica para evitar renombramientos accidentales:
    *   Busca primero por `id_oportunidad`.
    *   Si no hay match, busca por `ref_catastral` (si no es MANUAL).
    *   Si encuentra múltiples registros para un catastro, selecciona **el más reciente**.
    *   **Prioridad ID**: Si se encuentra cualquier registro previo, hereda su ID original obligatoriamente.
4.  **Drive Trigger**: El backend recibe la petición y, antes de confirmar el guardado, llama al `driveService`.
    *   Crea la carpeta en Drive si no existe.
    *   Guarda el `drive_folder_id` y el `drive_folder_link` dentro del objeto `datos_calculo`.
5.  **Acompañamiento en Calculadora**: El `drive_folder_link` se inyecta en el estado `inputs` de la calculadora para mostrar un acceso directo (icono carpeta azul) en el panel de resultados.
6.  **Toggle IRPF**: La calculadora incluye `includeIrpf` (booleano). Si es `false`, se ocultan deducciones fiscales en tablas, modales y PDFs.

---

## 4. Despliegue (GitHub -> Vercel)

El despliegue está automatizado. Cada `push` a la rama `main` dispara un build en Vercel.

*   **Configuración Build**: Definida en `vercel.json`. Instala dependencias en `/implementation` y construye el frontend.
*   **Secrets**: TODAS las variables del `.env` local deben estar replicadas en el panel de **Vercel (Settings > Environment Variables)**. Si falla Supabase o Drive en producción, lo primero es verificar que estos secrets no hayan caducado o faltado.

---

## 5. Mantenimiento y Solución de Problemas

### ¿Cómo regenerar el acceso a Drive?
Si el token de Drive caduca o falla el acceso por seguridad:
1.  Ir a la carpeta `backend` local.
2.  Ejecutar `node scripts/drive_auth.js`.
3.  Seguir el enlace, autorizar y copiar el nuevo `REFRESH_TOKEN` resultante.
4.  Actualizarlo en el `.env` local y en el Secreto de Vercel (y hacer Redeploy).

### Tiempos de Respuesta
Vercel tiene un límite de ejecución (timeout) de 10-15s en planes gratuitos. Por eso la clonación de Drive se hace en **paralelo** mediante `Promise.all`. Si la plantilla crece demasiado, se recomienda simplificar la estructura de carpetas para no exceder este tiempo al guardar una oportunidad.

---

## 6. Módulo Clientes (implementado 2026-03-25)

### Tabla Supabase: `clientes`
| Campo | Tipo | Notas |
|---|---|---|
| `id_cliente` | UUID PK | `uuid_generate_v4()` |
| `id_usuario` | UUID FK → `usuarios` | Usuario que lo creó |
| `nombre_razon_social` | VARCHAR(200) | Obligatorio |
| `apellidos` | VARCHAR(150) | Opcional |
| `email` | VARCHAR(150) | Opcional |
| `tlf` | VARCHAR(20) | Opcional |
| `dni` | VARCHAR(20) UNIQUE | Constraint unique — HTTP 409 si se duplica |
| `ccaa` | VARCHAR(100) | Dropdown cascada desde API /geo |
| `provincia` | VARCHAR(100) | Dropdown dependiente de ccaa |
| `municipio` | VARCHAR(100) | Dropdown dependiente de provincia |
| `direccion` | TEXT | Opcional |
| `codigo_postal` | VARCHAR(10) | Opcional |
| `numero_cuenta` | VARCHAR(50) | Solo para CLIENTE PARTICULAR |
| `prescriptor_id` | UUID FK → `prescriptores` | Asignado automáticamente si no es ADMIN |
| `id_expediente` | UUID | **Reservado** — FK futura a tabla `expedientes` |
| `persona_contacto_nombre` | VARCHAR(255) | Opcional (si el interlocutor no es el titular) |
| `persona_contacto_tlf` | VARCHAR(20) | Opcional |
| `created_at` | TIMESTAMPTZ | Auto |

**FK en oportunidades**: `oportunidades.cliente_id UUID → clientes.id_cliente`

### API REST: `/api/clientes`
- `GET /` — Lista clientes. ADMIN ve todos; prescriptores solo los suyos (filtrado server-side).
- `GET /:id` — Detalle del cliente + oportunidades vinculadas.
- `POST /` — Crea cliente. Acepta `oportunidad_id` opcional para vincular automáticamente.
- `PUT /:id` — Actualiza. Solo ADMIN puede reasignar `prescriptor_id`.
- `DELETE /:id` — Solo ADMIN.

### API REST: `/api/geo`
Alimentada desde `backend/data/MUNICIPIOS.csv` (codificación latin1, separador `;`).
- `GET /ccaa` — Lista todas las CCAA ordenadas.
- `GET /provincias?ccaa=Andalucía` — Provincias de una CCAA con su código INE.
- `GET /municipios?codprov=28` — Municipios de una provincia, ordenados alfabéticamente.
- Los datos se cachean en memoria al primer arranque.

### Componentes Frontend
- `features/clientes/views/ClientesView.jsx` — Tabla lista de clientes con buscador.
- `features/clientes/components/ClienteFormModal.jsx` — Modal creación/edición con dropdowns CCAA→Provincia→Municipio en cascada.
- `features/clientes/components/ClienteDetailModal.jsx` — Vista detalle con oportunidades vinculadas.

### Puntos de entrada para crear clientes
1. **Panel Admin** (`AdminPanelView.jsx`) — Botón icono `user+` en cada fila de oportunidad. Prerrellena `oportunidad_id`.
2. **Calculadora** (`SaveOpportunityModal.jsx`) — Botón "Crear Cliente" que aparece en estado `success` tras guardar una oportunidad.

---

## 7. Google Drive — Automatización y UI

### Funciones de driveService.js

| Función | Descripción |
|---|---|
| `setupOpportunityFolder(opportunityId, clientRef)` | Crea carpeta clonando plantilla. Devuelve `{ id, link }` o `null`. |
| `copyFolderContents(sourceId, targetId)` | Copia recursiva con `Promise.all` (paralela para no exceder timeout Vercel). |
| `moveFolder(fileId, newParentId)` | Mueve carpeta a otro padre. Usado al cambiar estado de oportunidad. |
| `saveFileToFolder(folderId, fileName, mimeType, fileBuffer)` | Sube un buffer como archivo. Devuelve `{ id, link }` o `null`. |
| `findSubfolderByName(parentId, name)` | Busca subcarpeta por nombre. Devuelve ID o `null`. |
| `createSubfolder(parentId, name)` | Crea subcarpeta. Devuelve ID. |

### Flujo de carpeta de oportunidad
1. Al guardar oportunidad, si no tiene `drive_folder_id`, se llama a `setupOpportunityFolder`.
2. El link se almacena en `datos_calculo.inputs.drive_folder_id` y `datos_calculo.drive_folder_link`.
3. Al cambiar estado, la carpeta se mueve según `FOLDER_MAP` en `routes/oportunidades.js`.

### Flujo de subida de facturas (Expedientes)
1. Frontend convierte PDF a base64 (`arrayBuffer` → `Uint8Array` → `btoa`).
2. POST a `/api/expedientes/:id/facturas/upload` con `{ base64, fileName, mimeType }`.
3. Backend obtiene `drive_folder_id` de la oportunidad (`datos_calculo.inputs.drive_folder_id`).
4. Busca subcarpeta `5.FACTURAS` con `findSubfolderByName`; si no existe, la crea con `createSubfolder`.
5. Llama a `saveFileToFolder` con el buffer (`Buffer.from(base64, 'base64')`).
6. Devuelve `{ drive_link, drive_id }` que el frontend guarda en `documentacion.facturas[i].drive_link`.

### Interfaz de Usuario
- **Acceso Directo**: En `ResultsPanel.jsx`, icono carpeta (cyan) abre el link de Drive. Solo visible para usuarios con rol `ADMIN`. Los partners tienen este acceso oculto por seguridad.
- **Movimiento Automático**: Al cambiar estado, la carpeta se mueve según `FOLDER_MAP` en el backend.
- **Facturas en Expedientes**: Botón de subida PDF con spinner. Si ya subido, muestra enlace + botón "Reemplazar".

---

## 8. Módulo Prescriptores — Acceso al Portal y Gestión Avanzada (2026-03-26)

### Tabla `prescriptores` — Campos Añadidos
| Campo | Tipo | Notas |
|---|---|---|
| `nombre_responsable` | VARCHAR(200) | Nombre del responsable técnico (antes solo en `usuarios`) |
| `apellidos_responsable` | VARCHAR(200) | Apellidos del responsable técnico |

Estos campos permiten almacenar el nombre de contacto incluso cuando el partner no tiene cuenta de usuario.

### Activación / Desactivación de Acceso al Portal

**Endpoint**: `PATCH /api/prescriptores/:id/acceso`

Lógica completa:
1. **Activar sin email** → HTTP 400 con mensaje explicativo.
2. **Activar con cuenta existente** → Desbanea en `auth.users` (Supabase Admin) + pone `usuarios.activo = true`.
3. **Activar sin cuenta** → Crea `auth.users` con email del prescriptor y contraseña = CIF → crea registro `usuarios` vinculando `representante_legal_id` → pone `activo = true`.
4. **Desactivar** → Banea en `auth.users` (`ban_duration: '876000h'`) + pone `usuarios.activo = false`.

> IMPORTANTE: La ruta `PATCH /:id/acceso` debe definirse ANTES de `PATCH /:id` en Express para evitar colisión de rutas.

### Bloqueo de Usuarios Desactivados — Middleware

En `middleware/auth.js`, después de obtener el perfil del usuario, se comprueba `activo`:
```js
if (userProfile && userProfile.activo === false) {
    return res.status(403).json({ error: 'Tu cuenta ha sido desactivada. Contacta con el administrador.' });
}
```
Esto bloquea cualquier petición autenticada aunque el token JWT sea válido.

### Logos como Base64

Los logos de empresas (`prescriptores.logo_empresa`) se almacenan como cadena base64 en una columna `TEXT` de Supabase. El valor incluye el prefijo MIME completo (`data:image/png;base64,...`). No se usa storage externo. El frontend los muestra directamente en `<img src={logo}>`.

### Script de Importación Masiva

**Archivo**: `implementation/backend/scripts/import_instaladores.py`

- Lee `data/bbdd_instaladores.xlsx` (34 instaladores con datos).
- Convierte imágenes de `data/Instaladores_Images/` a base64.
- Normaliza CCAA, provincia (`.title()`), municipio.
- Evita duplicados comprobando el CIF antes de insertar (idempotente — safe re-run).
- Flag `--dry-run` para previsualizar sin insertar.
- Los instaladores importados NO tienen `representante_legal_id` (sin acceso). Acceso se activa desde Admin > Prescriptores.

Dependencias Python: `openpyxl`, `requests`, `python-dotenv`.

### Componente `PrescriptorDetailModal`

**Archivo**: `frontend/src/features/admin/views/PrescriptorDetailModal.jsx`

Patrón idéntico a `ClienteDetailModal`:
- **Modo vista**: Muestra todos los datos + badge de tipo + badge ACTIVO/INACTIVO.
- **Modo edición**: Form completo con `DireccionEdit` (CCAA→Provincia→Municipio en cascada, con códigos INE, tolerante a mayúsculas/minúsculas).
- **Header**: Logo (clicleable en edición para subir imagen) + nombre + tipo badge + toggle acceso.
- **Toggle acceso**: 44×24px compacto en el header. Llama a `PATCH /:id/acceso`.
- **Campos contraseña**: Solo visibles si `accesoActivo === true`. Se validan antes de guardar.
- **Logo upload**: `useRef` sobre `<input type="file" hidden>`. `handleLogoChange` convierte a base64.
- **Email**: Busca `p.email || p.usuarios?.email` para mostrar el email aunque el partner no tenga cuenta.

### Integración en `PrescriptoresList`

- Click en fila → abre `PrescriptorDetailModal` (antes abría formulario inline).
- Formulario inline (`showForm`) se mantiene SOLO para crear nuevos partners.
- Delete button tiene `e.stopPropagation()` para no disparar el modal.
- Badge `ACTIVO/INACTIVO` en la tabla (desde `p.usuarios?.activo`). "Sin acceso" para partners sin cuenta.

---

## 10. Módulo Expedientes (completado 2026-04-01)

### Tabla Supabase: `expedientes`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | `uuid_generate_v4()` |
| `oportunidad_id` | UUID NOT NULL FK → `oportunidades.id` | ON DELETE RESTRICT |
| `cliente_id` | UUID NOT NULL FK → `clientes.id_cliente` | ON DELETE RESTRICT |
| `id_oportunidad_ref` | VARCHAR(50) | Caché del ID legible (ej: `26RES_OP47`) para display sin JOIN |
| `cee` | JSONB | `{ tipo, is_reforma, cee_inicial, cee_final, demanda_calefaccion_manual }` |
| `instalacion` | JSONB | `{ misma_direccion, ref_catastral, coord_x, coord_y, tipo_emisor, caldera_antigua_cal, misma_caldera_acs, caldera_antigua_acs, aerotermia_cal, misma_aerotermia_acs, aerotermia_acs, instalador_id }` |
| `documentacion` | JSONB | `{ fecha_visita/firma/registro_cee_inicial, fecha_visita/firma/registro_cee_final, facturas[], fecha_pruebas/firma_cert_instalacion, fecha_inicio/fin_cifo, cert_cifo/rite_drive_link }` |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Actualizado en cada PUT |

**Migración**: `implementation/backend/scripts/expedientes_schema.sql`

### Inicialización del POST (lógica de copia desde oportunidad)

El backend copia automáticamente al crear el expediente. **Paths correctos** (todos dentro de `datos_calculo.inputs`):

| Campo expediente | Fuente en oportunidad |
|---|---|
| `cee.tipo` | `inputs.demandMode === 'real'` → `'xml'`, sino `'aportado'` |
| `cee.cee_inicial` | `inputs.xmlDemandData` (objeto con demandas) |
| `cee.is_reforma` | `op.ficha === 'RES080'` |
| `instalacion.caldera_antigua_cal.rendimiento_id` | `inputs.boilerId` |
| `instalacion.tipo_emisor` | `inputs.emitterType` |
| `instalacion.aerotermia_cal.aerotermia_db_id` | `Number(inputs.aerothermiaModel)` |
| `instalacion.aerotermia_cal.marca` | `inputs.aerothermiaMarca` |
| `instalacion.aerotermia_cal.scop` | `inputs.scopHeating` |
| `instalacion.instalador_id` | `op.prescriptor_id` |
| `instalacion.coord_x/y` | `catastroService.getCoordinatesByRC(op.ref_catastral)` — **no bloqueante** |

### API REST: `/api/expedientes`
- `GET /` — Lista con JOIN a oportunidades y clientes. Fallback manual si PostgREST tiene schema cache desactualizado (PGRST200). Prescriptores solo ven sus clientes.
- `GET /:id` — Detalle completo. Mismo fallback.
- `POST /` — Crea expediente. Requiere `oportunidad_id` y `cliente_id`. Rechaza 409 si ya existe. Auto-inicializa `cee` e `instalacion` copiando datos de la oportunidad (ver tabla arriba).
- `PUT /:id` — Merge parcial de `cee`, `instalacion`, `documentacion` (spread sobre existente). Usado por cada módulo independientemente.
- `POST /:id/facturas/upload` — Sube PDF de factura a Drive. Body JSON: `{ base64, fileName, mimeType? }`. Busca subcarpeta `5.FACTURAS` dentro de `datos_calculo.inputs.drive_folder_id` de la oportunidad; la crea si no existe. Devuelve `{ drive_link, drive_id }`.
- `DELETE /:id` — Solo ADMIN.

### Componentes Frontend

**CeeModule.jsx**
- Siempre muestra **CEE Inicial** y **CEE Final** (ambas secciones, independientemente de RES060/RES080).
- RES060: CEE Inicial = opcional, CEE Final = obligatorio.
- RES080: ambos obligatorios.
- Al parsear XML, extrae automáticamente `fechaFirma` (de `<Fecha>`) y `fechaVisita` (de `<FechaVisita>`).
- Al guardar, llama a `onSave({ cee: ..., documentacion: { fecha_firma_cee_inicial, fecha_visita_cee_inicial, fecha_firma_cee_final, fecha_visita_cee_final } })` — el módulo patch-ea dos columnas JSONB simultáneamente.

**InstalacionModule.jsx**
- Campo **`tipo_emisor`**: `suelo_radiante` (35°C), `radiadores_baja_temp` (45°C), `radiadores_convencionales` (55°C).
- Al cambiar `tipo_emisor`, recalcula SCOP de la aerotermia cal y ACS (si `misma_aerotermia_acs`) usando `getScopFromModel(model, zona, temp)`.
- Al activar "misma dirección": llama a `/api/catastro/property-data?rc=...` para obtener UTM (`data.utm.x`, `data.utm.y`). Si falla, deja vacío.
- **Instalador**: lista todos los prescriptores (no filtrado por tipo). Pre-rellenado desde `op.prescriptor_id`.

**DocumentacionModule.jsx**
- CEE Inicial y CEE Final: **siempre visibles**. Fechas: visita, firma (extraídas del XML via CeeModule), registro (manual).
- Facturas: botón de subida PDF → `POST /api/expedientes/:id/facturas/upload`. Muestra link Drive si ya está subido, o botón de reemplazar. El spinner se muestra durante la subida.
- CIFO: `fecha_inicio_cifo` y `fecha_fin_cifo` calculados como min/max de todas las fechas del documento (incluidas fechas de facturas).

**ClienteModule.jsx**
- Tarjeta resumen + botón "Ver perfil".
- Abre `ClienteDetailModal` con `isOpen={true}` (requerido para que el useEffect dispare la carga de datos).

### xmlCeeParser.js — campos añadidos
```js
// Resultado de parseCeeXml() incluye ahora:
{
  // ... demandas existentes ...
  fechaFirma: 'YYYY-MM-DD',   // extraído de <Fecha>DD/MM/YYYY</Fecha>
  fechaVisita: 'YYYY-MM-DD',  // extraído de <FechaVisita>DD/MM/YYYY</FechaVisita>
}
```

### driveService.js — funciones añadidas
```js
// Busca subcarpeta por nombre dentro de un padre (devuelve ID o null)
findSubfolderByName(parentId, name)

// Crea una subcarpeta dentro de un padre (devuelve ID)
createSubfolder(parentId, name)
```

### Reglas Clave
- Un expediente es 1:1 con una oportunidad (409 si ya existe).
- `clientes.id_expediente` tiene FK real hacia `expedientes.id`.
- El PUT hace merge parcial (spread) de cada columna JSONB — nunca reemplaza el objeto completo.
- Los documentos generables (Anexo I, Cesión de Ahorro, Cert CIFO) son placeholders → **pendientes fase siguiente**.
- PostgREST puede necesitar `NOTIFY pgrst, 'reload schema'` tras migraciones con FKs nuevas. El backend tiene fallback automático (reintentar con queries separadas si PGRST200).

---

## 9. Generación de Documentos (Anexos y Fichas)

A partir de 2026-04-08, la aplicación genera documentos PDF oficiales basados en plantillas HTML/CSS precisas.

### Componentes de Generación
- **AnexoIModal.jsx**: Genera la Declaración Responsable del Beneficiario. 
    - Lógica de ACS: La unidad interior solo se muestra si `inputs.changeAcs` o `inputs.incluir_acs` son verdaderos.
    - Estilo: Arial 12pt, márgenes estrictos (`PAGE_PADDING`) para impresión.
- **CesionModal.jsx**: Genera el Convenio de Cesión de Ahorro Energético (CAE).
- **FichaRes060Modal.jsx**: Genera la ficha técnica RES060 con resultados de ahorro.

### Flujo de Generación y Archivo
1. **Validación Previa**: `DocumentacionModule` ejecuta `validateExpediente(docType)`.
    - Usa un helper `isPresent` para evitar campos vacíos o con placeholders (`_______`).
    - Bloquea la generación si faltan datos críticos.
2. **Renderizado en Cliente**: Se construye un HTML completo en el frontend.
3. **Conversión Server-side**: Se envía el HTML a `/api/pdf/generate`.
4. **Guardado en Drive**: El botón "Archivar en Drive" (solo ADMIN) envía el HTML a `/api/pdf/save-to-drive`.
    - El backend genera el PDF y lo guarda directamente en la subcarpeta `6.EXPEDIENTE` de la oportunidad.

### Acceso Condicional (RBAC)
La visibilidad de las opciones de Drive está controlada por el rol del usuario:
- **Dashboard y Calculadora**: Los iconos de Drive se ocultan si `user.rol !== 'ADMIN'`.
- **Modales de Documentos**: El botón de "Guardar en Drive" no se renderiza para partners.

---

## 10. Módulo Expedientes (completado 2026-04-01)

### Tabla Supabase: `expedientes`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | `uuid_generate_v4()` |
| `oportunidad_id` | UUID NOT NULL FK → `oportunidades.id` | ON DELETE RESTRICT |
| `cliente_id` | UUID NOT NULL FK → `clientes.id_cliente` | ON DELETE RESTRICT |
| `id_oportunidad_ref` | VARCHAR(50) | Caché del ID legible (ej: `26RES_OP47`) para display sin JOIN |
| `cee` | JSONB | `{ tipo, is_reforma, cee_inicial, cee_final, demanda_calefaccion_manual }` |
| `instalacion` | JSONB | `{ misma_direccion, ref_catastral, coord_x, coord_y, tipo_emisor, caldera_antigua_cal, misma_caldera_acs, caldera_antigua_acs, aerotermia_cal, misma_aerotermia_acs, aerotermia_acs, instalador_id }` |
| `documentacion` | JSONB | `{ fecha_visita/firma/registro_cee_inicial, fecha_visita/firma/registro_cee_final, facturas[], fecha_pruebas/firma_cert_instalacion, fecha_inicio/fin_cifo, cert_cifo/rite_drive_link }` |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Actualizado en cada PUT |

**Migración**: `implementation/backend/scripts/expedientes_schema.sql`

---

## 11. Convenciones de Código e IDs
*   **Frontend**: Componentes funcionales, hooks personalizados para lógica de estado.
*   **Backend**: Rutas separadas en carpeta `/routes`. Lógica pesada (APIs externas) en `/services`.
*   **Seguridad**: Uso de middleware `requireAuth`/`enforceAuth` para validar permisos. El backend usa `service_role key` de Supabase (bypassa RLS). RLS es segunda capa de defensa.
*   **IDs de Oportunidad**: Formato `{YY}RES_OP{N}` (ej. `26RES_OP12`). Se generan en el backend calculando el máximo existente + 1.
