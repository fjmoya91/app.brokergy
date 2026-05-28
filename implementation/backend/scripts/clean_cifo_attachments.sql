-- ============================================================================
-- Limpia los blobs base64 que se persistieron por error en `documentacion`
-- de la tabla `expedientes`. A partir de 2026-05-25 las fichas técnicas del
-- CIFO son referencias a Drive (driveId), nunca data URLs en BD.
--
-- Ejecutar UNA SOLA VEZ tras desplegar:
--   implementation/backend/routes/expedientes.js (auto-copy + /anexos-cifo/*)
--   implementation/frontend/src/features/expedientes/components/
--     CertificadoCifoModal.jsx (refactor sin PDF.js)
--     DocumentacionModule.jsx (state efímero)
--
-- IMPORTANTE: no toca `cifo_extra_annexes` (esa lista sí es válida — solo
-- contiene metadatos ligeros { driveId, link, fileName, label }).
-- ============================================================================

UPDATE expedientes
SET documentacion = documentacion - 'cifo_attachments'
WHERE documentacion ? 'cifo_attachments';

-- Resumen post-migración:
SELECT
  COUNT(*) AS total_expedientes,
  COUNT(*) FILTER (WHERE documentacion ? 'ft_aerotermia_cal_id') AS con_ficha_cal,
  COUNT(*) FILTER (WHERE documentacion ? 'ft_aerotermia_acs_id') AS con_ficha_acs,
  COUNT(*) FILTER (WHERE documentacion ? 'cifo_extra_annexes') AS con_anexos_extra
FROM expedientes;
