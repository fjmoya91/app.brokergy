# Especificación Técnica: Módulo de Consulta Catastral Inmobiliaria

**Fecha:** 22 Enero 2026
**Autor:** Antigravity (Arquitecto de Producto)
**Contexto:** Integración en Web Comercial (React + Node.js)
**País:** España

---

## 1. Resumen Ejecutivo

*   **Objetivo:** Permitir al equipo comercial obtener datos oficiales del Catastro (ficha técnica + referencia) de inmuebles en España de forma rápida y verificada.
*   **Problema:** Los comerciales necesitan datos exactos (m², año) para valoraciones, pero a veces solo tienen la dirección aproximada o una ubicación visual.
*   **Solución:** Un módulo "buscador híbrido" que acepta Referencia Catastral (RC) o Dirección (apoyado por Google Maps) y fuerza una confirmación visual antes de mostrar la ficha técnica.
*   **Valor:** Reduce errores en ofertas comerciales, ahorra tiempo de búsqueda manual en la Sede Electrónica y centraliza la información.
*   **Stack:** Frontend React (componentes nuevos), Backend Node.js (BFF para proxy/seguridad), Integración con API Catastro (OVCC) y Google Maps Platform.
*   **Datos Clave:** RC, Superficie, Año Construcción, Uso Principal, Coordenadas UTM.
*   **Estrategia Geo:** Prioridad a RC directa. Fallback a Geocoding (Google) -> Reverse Geocoding (Catastro) -> Confirmación Visual.
*   **Seguridad:** Sin almacenamiento de datos personales sensibles en este módulo. Trazabilidad de consultas por usuario.
*   **Restricciones:** Uso estricto de ETRS89 para coordenadas en Península/Baleares (REGCAN95 en Canarias).
*   **Estado:** Diseño listo para implementación.

---

## 2. Alcance Funcional (MoSCoW)

### Must Have (Imprescindible)
*   Búsqueda exacta por Referencia Catastral (14 o 20 caracteres).
*   Búsqueda por Dirección "Google-like" (autocompletado).
*   **Flujo de Confirmación Visual:** El usuario *debe* ver qué inmueble ha detectado el sistema (mapa/foto) y confirmar antes de ver datos.
*   Ficha de detalle del inmueble: RC, Dirección oficial, Superficie construida, Año, Uso, Coordenadas UTM X/Y, Huso, Dato de calidad (origen).
*   Conversión/Validación de Coordenadas (Lat/Lon <-> UTM ETRS89).
*   Manejo de errores amigable ("No se encuentra RC", "Servicio Catastro caído").
*   Botón "Copiar al portapapeles" para la RC y datos clave.
*   Logs de auditoría (quién consultó qué y cuándo).

### Should Have (Recomendable)
*   **Exportación PDF:** Generar una ficha imprimible simple con los datos y el mapa.
*   Historial de consultas recientes en el navegador (LocalStorage o muy simple en BD).
*   Detección automática de Huso UTM según provincia.
*   Link profundo a Sede Electrónica del Catastro para ver más detalles.

### Could Have (Deseable / Futuro)
*   Mapa interactivo completo para seleccionar parcela clicando (requiere WMS complejo).
*   Guardado persistente en base de datos de negocio ("Asignar esta RC a la Oportunidad CRM").
*   Roles diferenciados (ej. Admin ve logs, Comercial solo consulta).
*   Validación masiva de un CSV de direcciones.

### Won't Have (Fuera de alcance)
*   Certificación oficial jurídica (esto es solo informativo).
*   Integración con Registro de la Propiedad (Nota Simple).
*   Edición de datos catastrales.

---

## 3. Flujos de Usuario

### Diagrama de Estados UI
`[INICIO]` -> `[BUSCANDO]` -> `[CONFIRMACION]` -> `[DETALLE]`

### Flujo 1: Búsqueda por Referencia Catastral (Camino Feliz)
1.  **Usuario** entra al módulo. Ve input grande: "Introduce Ref. Catastral o Dirección".
2.  **Usuario** pega una RC válida (ej: `9872023 VH5797S 0001 WX`).
3.  **Sistema** detecta formato RC.
4.  **Sistema** llama API Catastro (Consulta por RC).
    *   *Loading spinner...*
5.  **Sistema** muestra **Vista Previa**: Dirección devuelta por Catastro + Mini-mapa centrado en la parcela.
6.  **Usuario** valida visualmente y pulsa "Ver Ficha Completa".
7.  **Sistema** muestra **Ficha Detalle** con todos los datos y UTM.

### Flujo 2: Búsqueda por Dirección (Camino con Ambigüedad)
1.  **Usuario** escribe "Calle Mayor 12, Madrid".
2.  **Sistema** (vía Google Autocomplete) sugiere "Calle Mayor, 12, 28013 Madrid, España".
3.  **Usuario** selecciona la sugerencia.
4.  **Sistema** obtiene Lat/Lon de Google.
5.  **Sistema** llama API Catastro (Coordenadas a RC).
    *   *Caso A: Exito único* -> Obtiene RC candidata.
    *   *Caso B: Múltiples/Cercanos* -> Obtiene lista de RCs cercanas (si la API lo soporta, o devuelve la más cercana a la fachada).
6.  **Sistema** muestra **Pantalla de Confirmación**:
    *   Muestra Mapa (Google Satélite o Híbrido) con un pin en la coordenada devuelta.
    *   Texto: "¿Te refieres a esta ubicación?"
    *   Muestra la Dirección fiscal que Catastro asocia a esa coordenada intermanente.
7.  **Usuario** confirma "Sí, es este edificio".
8.  **Sistema** hace la consulta final por la RC obtenida y muestra **Ficha Detalle**.

### Flujo de Error
*   Si Catastro devuelve error o timeout -> Mostrar alerta: "Sistema de Catastro no responde. Reintentando..." + opción "Introducir datos manuales" (si aplica al negocio) o "Cancelar".

---

## 4. Especificación de Datos

| Campo | Tipo | Fuente | Notas |
| :--- | :--- | :--- | :--- |
| `rc` | String (20) | Catastro | ID único. Normalizar (sin espacios) para búsquedas. |
| `direccion_input` | String | Usuario/Google | Lo que buscó el usuario. |
| `direccion_catastro` | String | Catastro | La dirección oficial fiscal. Puede diferir de la de Google. |
| `uso_principal` | String | Catastro | Ej: "Residencial", "Industrial". |
| `superficie_construida` | Number (m²) | Catastro | Suma de elementos constructivos. |
| `anio_construccion` | Number (Year) | Catastro | |
| `coordenadas_latlon` | Object {lat, lng} | Google/Calc | Para pintar en mapas web. |
| `coordenadas_utm_x` | Number | Catastro/Calc | ETRS89. |
| `coordenadas_utm_y` | Number | Catastro/Calc | ETRS89. |
| `utm_huso` | Number | Calculado | 29, 30, 31 (Península) o 28 (Canarias). Importante para topógrafos. |
| `referencia_visual` | URL / Base64 | Catastro/Google | Link a fachada o plano parcelario. |
| `fecha_consulta` | Timestamp | Sistema | Auditoría. |

---

## 5. Integraciones Técnicas

### A. Google Maps Platform
*   **Servicios:**
    *   *Places Autocomplete API*: Para input de dirección amigable.
    *   *Geocoding API*: Para obtener Lat/Lon de la dirección.
    *   *Maps JavaScript API* (o Static Maps): Para mostrar el mapa de confirmación.
*   **Autenticación:** API Key restringida por HTTP Referrer (producción).
*   **Coste:** Vigilar cuotas. Usar `session tokens` en Autocomplete para reducir costes.

### B. Sede Electrónica del Catastro (OVCC)
*   **Base URL:** `http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalLAN.asmx` (Ejemplo SOAP/XML antiguo) o REST si disponible.
    *   Nota: Catastro usa mayoritariamente servicios SOAP XML. Se recomienda un wrapper/parser en el Backend BFF.
*   **Endpoints Clave (Ejemplos conceptuales):**
    1.  `Consulta_DNPRC` (Datos no protegidos por RC): Obtiene datos físicos, superficies, antigüedad.
        *   Input: `RC`.
        *   Output: XML con `bico` (bienes inmuebles), superficie, uso, etc.
    2.  `Consulta_Coordenadas`:
        *   Input: `SRS` (EPSG:4258 para ETRS89), `Coordenadas`.
        *   Output: `RC` más cercana.
*   **Autenticación:** Muchos datos son públicos (Libre Acceso) sin certificado para datos no protegidos (físicos). Si se requieren datos de titularidad, hace falta certificado digital (Fuera de alcance Must).
*   **Rate Limits:** No publicados estrictamente, pero sensibles a ráfagas. Implementar `throttle` en BFF.

---

## 6. UTM X/Y: Estrategia

El Catastro suele trabajar en coordenadas oficiales (ETRS89).
*   **Si Catastro devuelve UTM:** Directo a la ficha.
*   **Si Catastro devuelve Lat/Lon o Google da Lat/Lon:**
    *   Conversión obligatoria a UTM para la ficha técnica (requisito de arquitectos/técnicos).
    *   **Librería recomendada:** `proj4js` (en Node o Frontend).
    *   **Datum:** ETRS89 (Europa) es casi idéntico a WGS84 para propósitos generales, pero técnicamente distinto. Usar definición EPSG:25830 (ETRS89 / UTM zone 30N) por defecto para España central.
    *   **Lógica de Huso:**
        *   Longitud > -6°: Huso 29 (Galicia/Portugal).
        *   Longitud -6° a 0°: Huso 30 (Centro/Madrid).
        *   Longitud > 0°: Huso 31 (Cataluña/Baleares).
        *   Canarias: Huso 28 (REGCAN95).
    *   **Validación:** Si `X` está fuera de [100.000, 900.000] o `Y` fuera de [3.000.000, 4.800.000] (aprox para España), marcar warning "Coordenadas sospechosas".

---

## 7. Arquitectura Propuesta

### Frontend (React)
*   Integrado en la SPA existente.
*   **Componentes:**
    *   `<CatastroSearchBox />`: Input híbrido con debounce.
    *   `<ConfirmationCard />`: Muestra mapa estático + dirección detectada + botones Sí/No.
    *   `<PropertySheet />`: La ficha final con grid de datos.
    *   `<MapViewer />`: Wrapper de Google Maps.
*   **Estado:** React Query (recomendado) para gestionar `isLoading`, `error`, `data`.

### Backend (BFF - Backend for Frontend) - Node.js
*   **Rol:** Proxy reverso y orquestador. Oculta la API Key de Google (si se usa server-side geocoding) y complejidad XML de Catastro.
*   **Endpoints:**
    *   `GET /api/catastro/search?q=...` (Determina si es RC o texto y enruta).
    *   `GET /api/catastro/details/:rc` (Limpia el XML de catastro y devuelve JSON limpio).
*   **Cache:**
    *   Cachear respuestas de Catastro por `RC` (TTL: 24h - los datos de inmuebles cambian poco).
    *   Redis o In-Memory (LRU) según carga.
*   **Logging:** Winston/Morgan. Registrar "Consulta RC: XXXXX" con timestamp y UserID.

---

## 8. Diseño UI (Wireframes conceptuales)

**Estilo:** Sobrio corporativo (Grises, azules oscuros, tipografía tipo Inter/Roboto).

**Pantalla 1: Buscador**
```text
+-------------------------------------------------------+
|  CONSULTA CATASTRAL                                   |
|                                                       |
|  [ 🔍 Introduce RC o Dirección (ej. Calle Mayor 1) ]  |
|                                                       |
|  Recientes:                                           |
|  - 9823982... (hace 2 min)                            |
+-------------------------------------------------------+
```

**Pantalla 2: Confirmación (Solo si busca por dirección)**
```text
+-------------------------------------------------------+
|  ¿ES ESTE EL INMUEBLE?                                |
|                                                       |
|  [ MAPA CENTRADO CON PIN ROJO ]                       |
|                                                       |
|  Dirección detectada: C/ Mayor 12, 1º A               |
|  RC Candidata: 1234567AB1234C...                      |
|                                                       |
|  [ CANCELAR ]   [ SÍ, CONSULTAR DATOS ]               |
+-------------------------------------------------------+
```

**Pantalla 3: Ficha Técnica (Resultado)**
```text
+-------------------------------------------------------+
|  FICHA INMUEBLE: 1234567AB1234C                       |
|  [ COPIAR DATOS ] [ EXPORTAR PDF ]                    |
|                                                       |
|  ---------------------------------------------------  |
|  | Superficie: 120 m²  | Año: 1995 | Uso: OFICINA |   |
|  ---------------------------------------------------  |
|                                                       |
|  DATOS TÉCNICOS                                       |
|  X: 440234.12  Y: 4455667.99  (ETRS89 Huso 30)        |
|                                                       |
|  [ TABLA DE ELEMENTOS CONSTRUCTIVOS SI DISPONIBLE ]   |
+-------------------------------------------------------+
```

---

## 9. Seguridad y Cumplimiento

*   **Secretos:** API Keys (Google) y Credenciales Catastro no se commitean. Usar `.env` (`GOOGLE_MAPS_KEY`).
*   **Cors:** El BFF solo acepta peticiones del dominio de la web principal.
*   **GDPR:** No mostramos titulares (nombres de personas) salvo que la API de Catastro lo devuelva y haya base legal (usualmente la consulta pública no da titulares). No loguear inputs de usuario que puedan contener datos personales sensibles innecesarios.

---

## 10. Checklist de Pruebas

### Unitarias
- [ ] Función `detectRC(string)`: distingue correctamente RC (20 chars) de texto libre.
- [ ] Función `latLonToUTM(lat, lon)`: prueba con la Puerta del Sol (40.416, -3.703) -> debe dar approx X=440300 Y=4474300 Huso 30.

### Integración
- [ ] Endpoint `search` con RC válida -> Devuelve JSON 200.
- [ ] Endpoint `search` con RC inválida -> Devuelve 404/400 controlado.
- [ ] Mock de Google API: Verificar que si Google falla, el sistema avisa con gracia.

### E2E / Manual
- [ ] Buscar por dirección ambigua -> Debe salir popup de confirmación.
- [ ] Si usuario dice "No es esta" en confirmación -> Debe permitir reintentar o editar.
- [ ] Verificar que dos usuarios simultáneos no cruzan datos (sesión).
- [ ] Verificar display en Móvil (Responsive).
