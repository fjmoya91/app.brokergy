-- ============================================================
-- MIGRACIÓN: Factura al Sujeto Obligado (lotes)
-- Ejecutar en: Supabase SQL Editor (o vía MCP apply_migration)
-- Fecha: 2026-06-25
--
-- PROPÓSITO
-- ---------
-- Permite GENERAR y GUARDAR la factura de venta de CAEs al Sujeto Obligado
-- desde el detalle del lote (botón con previsualización, habilitado cuando el
-- lote está en "CAE EMITIDO – PTE PAGO BROKERGY").
--
--   • drive_folder_id → carpeta del LOTE en Drive (se crea bajo demanda en
--     {DRIVE_ROOT}/LOTES/{codigo}). Reutilizable para otros documentos del lote.
--   • factura_so      → metadatos de la factura emitida:
--       { numero, fecha, vencimiento, cae_inicial, cae_final,
--         unidades_kwh, precio_kwh, base, iva, total,
--         drive_link, drive_file_id, generada_at }
--     La numeración es F-{año}CAE_{N} (la primera de CAE de un año = _1).
--
-- Columnas aditivas y nullable → no rompen nada existente. Las tablas ya tienen
-- GRANT a anon/authenticated/service_role (ver lotes_schema.sql); las columnas
-- nuevas los heredan, no hace falta GRANT extra.
-- ============================================================

ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS drive_folder_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS factura_so      JSONB;

COMMENT ON COLUMN public.lotes.drive_folder_id IS
  'ID de la carpeta del lote en Google Drive ({DRIVE_ROOT}/LOTES/{codigo}). Se crea bajo demanda al generar el primer documento del lote (p. ej. la factura al S.O.).';
COMMENT ON COLUMN public.lotes.factura_so IS
  'Factura de venta de CAEs al Sujeto Obligado: { numero (F-{año}CAE_{N}), fecha, vencimiento, cae_inicial, cae_final, unidades_kwh, precio_kwh, base, iva, total, drive_link, drive_file_id, generada_at }.';
