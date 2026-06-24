-- ============================================================
-- MIGRACIÓN: lotes.verificacion_api (envío al verificador por API Marwen)
-- Ejecutar en: Supabase SQL Editor (o vía MCP apply_migration)
-- Fecha: 2026-06-23
--
-- Guarda el resultado del envío de la "Solicitud de Verificación Estandarizada"
-- por API a Marwen (https://cae.marwen.es). Estructura del JSON:
--   { num_solicitud, tipo_solicitud, enviado_at, enviado_por, destino,
--     n_actuaciones, provincia_id, localidad_id }
--
-- Columna aditiva y nullable → no requiere GRANTs nuevos (los de la tabla
-- `lotes` ya cubren a anon/authenticated/service_role).
--
-- ROLLBACK:
--   ALTER TABLE public.lotes DROP COLUMN IF EXISTS verificacion_api;
-- ============================================================

ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS verificacion_api JSONB;

COMMENT ON COLUMN public.lotes.verificacion_api IS
  'Resultado del envío de la Solicitud de Verificación Estandarizada por API a Marwen (num_solicitud, tipo, fecha, etc.). NULL si aún no se ha enviado por API.';
