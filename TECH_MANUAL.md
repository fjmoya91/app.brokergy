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
3.  **Drive Trigger**: El backend recibe la petición y, antes de confirmar el guardado, llama al `driveService`.
    *   Crea la carpeta en Drive.
    *   Guarda el `drive_folder_id` y el `drive_folder_link` dentro del objeto `datos_calculo` en Supabase.
4.  **Visualización**: En el `AdminPanelView.jsx`, se renderiza una fila con los datos y, si existe el link de Drive, aparece el icono de carpeta para acceso directo.

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

## 6. Convenciones de Código e IDs
*   **Frontend**: Componentes funcionales, hooks personalizados para lógica de estado.
*   **Backend**: Rutas separadas en carpeta `/routes`. Lógica pesada (APIs externas) en `/services`.
*   **Seguridad**: Uso de middleware `requireAuth` para validar permisos antes de cualquier operación de base de datos.
