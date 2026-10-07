<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Módulo Documentación Fotográfica — Superficie unificada (2026-05-29)»; la introducción y el resto, en esta misma carpeta.

### Checklist por fases (computado, NO persistido)
`reformaUploadService.buildDocChecklist(datos_calculo)` deriva los slots desde los `inputs` del instalador **o** del `landing_funnel`, etiquetados por `fase` (`ANTES`/`DESPUES`) y `gating` (`pre_aceptacion` en caldera+placa). La pestaña **DESPUÉS se bloquea** hasta `datos_calculo.estado === 'ACEPTADA'`. Caldera/placa son `multiple` (varias perspectivas, sufijo `_1`, `_2`…).
