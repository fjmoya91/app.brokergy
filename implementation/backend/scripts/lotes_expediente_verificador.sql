-- ─────────────────────────────────────────────────────────────────────────────
-- Nº de expediente del VERIFICADOR en el lote (2026-08-04)
--
-- La entidad verificadora (Marwen, …) asigna su propio número de expediente al
-- lote. Lo tecleamos nosotros cuando nos lo comunica: es informativo, no lo
-- calcula ni lo valida la app. Se muestra en la ficha del lote junto a la oferta
-- y en la tarjeta del listado, para reconocerlo de un vistazo y poder citarlo al
-- hablar con el verificador.
--
-- No es un dato económico: lo ve todo el staff (ADMIN y TRABAJADOR).
--
-- APLICADO en producción el 2026-08-04.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS expediente_verificador VARCHAR(100);

COMMENT ON COLUMN public.lotes.expediente_verificador IS
  'Nº de expediente asignado por la entidad verificadora (manual, informativo).';
