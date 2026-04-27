# 📜 Changelog — Historial de Cambios

Todos los cambios notables en este proyecto serán documentados en este archivo.

---

## [1.2.0] - 2026-04-08
### Añadido
- **Generación de Documentos Oficiales**: Implementación completa de la previsualización y generación de PDFs para:
    - **Anexo I**: Declaración responsable del beneficiario (formato oficial Arial 12pt).
    - **Anexo Cesión de Ahorro**: Convenio de cesión CAE.
    - **Ficha RES060**: Documento técnico de resultados del ahorro.
    - **Certificado CIFO**: Cálculos automáticos de periodos de actuación.
- **Validación Robusta de Datos (Hardening)**:
    - Nuevo sistema de validación `isPresent` que detecta campos vacíos, nulos o con placeholders (ej: `_______`).
    - Bloqueo de generación de documentos si faltan datos críticos: Números de serie (Exterior/Interior), Email, Teléfono, Fechas de CIFO, Referencia Catastral.
- **Control de Acceso (RBAC)**:
    - Ocultación de enlaces y botones de Google Drive para usuarios con rol **Partner** o **Prescriptor**.
    - Acceso a la gestión de archivos en la nube reservado exclusivamente para el perfil **ADMIN**.
- **Mejoras en Anexo I**:
    - "Blindaje" de lógica de ACS: La unidad interior solo aparece si se marca que se actúa sobre el ACS.
    - Mejora de márgenes y saltos de página para evitar cortes en la impresión PDF.

### Cambios
- **Refactorización de Modales**: Los modales de documentos (`AnexoIModal`, `CesionModal`, etc.) ahora son más estables y resistentes a ediciones accidentales del código.
- **Cálculo CIFO**: Actualización de la lógica para calcular automáticamente el periodo de actuación basado en el rango de fechas de facturas y certificados de instalación.

---

## [1.1.0] - 2026-04-01
### Añadido
- **Módulo Expedientes**: Nueva vista de detalle con 4 sub-módulos (CEE, Cliente, Instalación, Documentación).
- **Integración XML CEE**: Extracción automática de demandas y fechas de firma/visita desde archivos XML.
- **Subida de Facturas a Drive**: Integración directa desde el módulo de documentación hacia la subcarpeta `5.FACTURAS` de Google Drive.
- **Automatización de Drive**: Los expedientes se mueven automáticamente de carpeta al cambiar el estado de la oportunidad.

### Corregido
- **Identificación de Oportunidades**: Mejora en la búsqueda jerárquica (ID -> RC) para evitar duplicados o errores de identificación.
- **CSS de PDFs**: Corrección del layout en las propuestas comerciales usando CSS Grid para evitar desbordes.

---

## [1.0.0] - 2026-03-10
### Añadido
- **Lanzamiento MVP**: Calculadora energética estable con integración de Catastro y Google Maps.
- **Gestión de Partners**: CRUD de prescriptores con sistema de activación de acceso al portal.
- **BD**: Esquema inicial en Supabase con gestión de usuarios y roles.
