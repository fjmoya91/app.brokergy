-- Potencia absorbida por los COMPRESORES (kW) del catálogo de aerotermia.
--
-- La pide el bloque GENERADOR DE FRÍO del RITE ("POTENCIA DE COMPRESORES (KW)"),
-- que se rellena cuando la instalación da frío (suelo radiante, splits o
-- conductos). Es un dato de la ficha técnica del fabricante, no del expediente:
-- se teclea una vez en el popup previo a generar y queda para todos los
-- expedientes futuros que usen ese modelo, igual que `potencia_frigorifica`.
--
-- Columna aditiva, nullable: los modelos sin valor dejan la casilla vacía.

ALTER TABLE public.aerotermia
  ADD COLUMN IF NOT EXISTS potencia_compresores numeric;

COMMENT ON COLUMN public.aerotermia.potencia_compresores IS
  'Potencia absorbida por los compresores (kW), de la ficha tecnica. Se declara en la casilla POTENCIA DE COMPRESORES del bloque GENERADOR DE FRIO del RITE.';
