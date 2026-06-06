-- Añade el volumen de acumulación ACS (litros) al catálogo de aerotermia.
-- Se rellena en el editor de modelo (AerotermiaDetailModal) cuando
-- deposito_acs_incluido = true. Al seleccionar el modelo en un expediente,
-- el valor se copia a instalacion.aerotermia_acs.litros, que es lo que lee
-- el generador de la Memoria RITE (_acumulacion).
-- Columna aditiva, nullable: no rompe filas ni código existente.

ALTER TABLE public.aerotermia
  ADD COLUMN IF NOT EXISTS litros_acs numeric;

COMMENT ON COLUMN public.aerotermia.litros_acs IS
  'Litros de acumulación de ACS del depósito incluido. Solo aplica si deposito_acs_incluido = true.';
