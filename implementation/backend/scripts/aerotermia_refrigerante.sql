-- Gas refrigerante del equipo en el catálogo de aerotermia.
--
-- Lo pide el bloque GENERADOR DE FRÍO del RITE ("REFRIGERANTE UTILIZADO"). Hasta
-- ahora el generador lo deducía buscando "R32"/"R290"/… DENTRO del nombre del
-- modelo, y casi ningún modelo lo lleva en el nombre (p. ej. Panasonic
-- "S-6071PF3E + U-71PZ3E5A" es R32 pero no lo dice), así que la casilla salía
-- vacía. Ahora es un dato del catálogo, como las potencias: se teclea una vez en
-- el popup previo a generar y queda para todos los expedientes futuros.
--
-- Columna aditiva, nullable: si está vacía se sigue intentando deducir del modelo.

ALTER TABLE public.aerotermia
  ADD COLUMN IF NOT EXISTS refrigerante text;

COMMENT ON COLUMN public.aerotermia.refrigerante IS
  'Gas refrigerante del equipo (R32, R290, R410A, R134A, R513A...). Se declara en REFRIGERANTE UTILIZADO del bloque GENERADOR DE FRIO del RITE. Antes se deducia del nombre del modelo, que casi nunca lo contiene.';
