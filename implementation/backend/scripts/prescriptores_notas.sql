-- ============================================================
-- Notas internas por prescriptor (instalador, certificador, S.O., verificador…).
--
-- Texto libre para el equipo de Brokergy: incidencias, acuerdos, avisos sobre
-- ese partner. NO se muestran al propio partner: el backend las elimina de la
-- respuesta de /api/prescriptores para todo el que no sea ADMIN o TRABAJADOR.
--
-- Aplicada en producción el 2026-07-10 (migración `add_notas_prescriptores`).
-- No requiere GRANT: es una columna nueva sobre una tabla ya expuesta.
-- ============================================================

ALTER TABLE public.prescriptores ADD COLUMN IF NOT EXISTS notas TEXT;

COMMENT ON COLUMN public.prescriptores.notas IS 'Notas internas del equipo sobre el prescriptor. No se muestran al partner.';
