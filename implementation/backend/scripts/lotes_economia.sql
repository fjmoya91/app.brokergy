-- ============================================================
-- MIGRACIÓN: Economía del lote (oferta + coste de verificación)
-- Ejecutar en: Supabase SQL Editor (o vía MCP apply_migration)
-- Fecha: 2026-06-22  |  Estado: APLICADA en producción 2026-06-22
--
-- Modelo (del Excel del usuario):
--   AHORRO (MWh)          = Σ ahorro de energía de los expedientes
--   PAGO CLIENTE (€)      = Σ CAE cliente de los expedientes
--   COSTE VERIF (€)       = lotes.coste_verificacion  (manual)
--   OFERTA LOTE (€/MWh)   = lotes.oferta_lote  (arranca de precio_referencia del SO)
--   BENEFICIO LOTE (€)    = OFERTA_LOTE × AHORRO − PAGO_CLIENTE − COSTE_VERIF
-- ============================================================

-- Precio de referencia del Sujeto Obligado (€/MWh) → default de oferta_lote.
ALTER TABLE public.prescriptores ADD COLUMN IF NOT EXISTS precio_referencia NUMERIC;
COMMENT ON COLUMN public.prescriptores.precio_referencia IS 'Solo SUJETO_OBLIGADO: precio de referencia / oferta máxima en €/MWh. Default de lotes.oferta_lote.';

-- Economía del lote.
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS oferta_lote NUMERIC;          -- €/MWh
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS coste_verificacion NUMERIC;   -- € total (manual)
COMMENT ON COLUMN public.lotes.oferta_lote IS 'Oferta del lote en €/MWh (arranca del precio_referencia del SO, editable).';
COMMENT ON COLUMN public.lotes.coste_verificacion IS 'Coste total de verificación del lote en € (introducido manualmente).';
