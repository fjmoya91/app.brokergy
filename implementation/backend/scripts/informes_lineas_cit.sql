-- ============================================================================
-- informes — LÍNEAS: INF (informes) y CIT (certificados de instalación térmica)
-- ----------------------------------------------------------------------------
-- Fran, 05/11/2026: «los RITES será otra línea más igual que CEE e INF, que será
-- CIT de certificado de instalación térmica». Misma tabla, mismo circuito, con:
--   · su número `{AAAA}CIT_{n}` (correlativo PROPIO de cada línea),
--   · un paso más, la PRESENTACIÓN en eDICE (`registrado_at`),
--   · su carpeta en «39. LEGALIZACIONES RITE / 2. PRODUCCION» (informeFolders.js).
-- Solo los RITE SUELTOS (los que se presupuestan y cobran aparte): el de una obra
-- CAE sigue en su expediente, en el slot «Certificado RITE».
--
-- Requiere informes_schema.sql. ADITIVO: la tabla estaba vacía al escribirlo.
-- Fecha: 2026-11-05
-- ============================================================================

ALTER TABLE public.informes ADD COLUMN IF NOT EXISTS linea TEXT NOT NULL DEFAULT 'INF';
ALTER TABLE public.informes ADD COLUMN IF NOT EXISTS registrado_at TIMESTAMPTZ;

DO $$
DECLARE c text;
BEGIN
    -- Los CHECK de `tipo` y de `linea` se rehacen con la lista nueva.
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.informes'::regclass AND contype = 'c'
               AND (pg_get_constraintdef(oid) ILIKE '%tipo%' OR pg_get_constraintdef(oid) ILIKE '%linea%')
    LOOP
        EXECUTE format('ALTER TABLE public.informes DROP CONSTRAINT %I', c);
    END LOOP;
END $$;
ALTER TABLE public.informes ADD CONSTRAINT informes_linea_check CHECK (linea IN ('INF', 'CIT'));
ALTER TABLE public.informes ADD CONSTRAINT informes_tipo_check CHECK (tipo IN (
    'MEMORIA_AYUNTAMIENTO', 'LEGALIZACION', 'INFORME_TECNICO', 'AUDITORIA', 'CONSULTORIA', 'OTRO',
    'INSTALACION_TERMICA'));

-- El correlativo es de CADA línea: 2026INF_1 y 2026CIT_1 conviven.
DROP INDEX IF EXISTS public.informes_correlativo_uq;
CREATE UNIQUE INDEX IF NOT EXISTS informes_linea_correlativo_uq ON public.informes (linea, correlativo);
CREATE INDEX IF NOT EXISTS informes_linea_idx ON public.informes (linea);

CREATE OR REPLACE FUNCTION public.informe_numerar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.linea := COALESCE(NEW.linea, 'INF');
    IF NEW.correlativo IS NULL THEN
        -- Candado de ESTA transacción y de ESTA línea: el MAX y el INSERT van juntos.
        PERFORM pg_advisory_xact_lock(hashtext('informes_correlativo_' || NEW.linea));
        SELECT COALESCE(MAX(correlativo), 0) + 1 INTO NEW.correlativo FROM public.informes WHERE linea = NEW.linea;
    END IF;
    IF NEW.anio IS NULL THEN
        NEW.anio := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Europe/Madrid'))::int;
    END IF;
    IF NEW.numero IS NULL THEN
        NEW.numero := NEW.anio::text || NEW.linea || '_' || NEW.correlativo::text;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.informe_numerar() FROM PUBLIC, anon, authenticated;

-- Un artículo del catálogo puede abrir un CIT al aceptarse su presupuesto.
DO $$
DECLARE c text;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.articulos'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) ILIKE '%genera%'
    LOOP
        EXECUTE format('ALTER TABLE public.articulos DROP CONSTRAINT %I', c);
    END LOOP;
END $$;
ALTER TABLE public.articulos
    ADD CONSTRAINT articulos_genera_check CHECK (genera IN ('CEE_UNICO', 'CEE_DOBLE', 'INFORME', 'CIT'));
