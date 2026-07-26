-- Añade la POTENCIA FRIGORÍFICA (kW) al catálogo de aerotermia.
--
-- Por qué: el trámite JE6 / Certificado de Instalación Térmica pide la potencia
-- térmica nominal desglosada en Calor / Frío / ACS. Cuando el emisor es SUELO
-- RADIANTE la instalación se declara también como CLIMATIZACIÓN (refresca en
-- verano), así que la casilla de FRÍO deja de ser 0 y hay que declararla.
-- Hasta ahora `potencia.frio` estaba fijada a 0 en el generador RITE porque no
-- existía el dato en ninguna parte: la tabla solo guardaba `seer` (eficiencia),
-- no la capacidad frigorífica.
--
-- NO suma en la potencia total del documento (total = calor + ACS), igual que en
-- los certificados ya presentados.
--
-- Columna aditiva, nullable: no rompe filas ni código existente. Los modelos sin
-- valor siguen declarando 0 kW de frío.

ALTER TABLE public.aerotermia
  ADD COLUMN IF NOT EXISTS potencia_frigorifica numeric;

COMMENT ON COLUMN public.aerotermia.potencia_frigorifica IS
  'Capacidad frigorífica nominal (kW) del equipo en modo refrigeración. Se declara en la casilla FRÍO del RITE cuando la instalación incluye climatización (suelo radiante refrescante). No suma en la potencia total.';
