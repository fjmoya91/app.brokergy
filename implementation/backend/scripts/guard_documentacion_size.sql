-- ============================================================================
-- Red de seguridad: impedir que `expedientes.documentacion` vuelva a engordar
-- ============================================================================
-- 2026-07-22. Esto ya ha pasado DOS veces:
--   · mayo 2026 — `cifo_attachments` (18 MB). Se saneó en el frontend, pero las
--     filas siguieron en BD porque el PUT hace spread sobre lo existente.
--   · julio 2026 — `photo_attachments` (48 MB), que provocó dos caídas de la BD.
--
-- En ambos casos el problema fue el mismo: imágenes en base64 dentro del JSONB.
-- Postgres tiene que descomprimir la columna entera en cuanto una consulta la
-- toca, aunque solo pida un subcampo — con una instancia de 1 GB de RAM eso
-- acaba en OOM. El código ya lo evita (routes/expedientes.js), pero el código se
-- olvida; esta comprobación vive en la BD y no se puede saltar.
--
-- UMBRAL: 2 MB. El máximo legítimo actual es 204 kB y la media 3 kB, así que hay
-- ~10x de margen: no puede saltar por uso normal, solo si alguien vuelve a
-- incrustar ficheros. Deliberadamente NO se pone sobre `oportunidades.
-- datos_calculo`: ahí todavía hay 2 filas legítimas por encima de 2 MB
-- (`cee_previo`, el OCR del CEE) pendientes de mover a Drive.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_documentacion_size()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    tam integer := pg_column_size(NEW.documentacion);
BEGIN
    IF tam > 2 * 1024 * 1024 THEN
        RAISE EXCEPTION
            'documentacion del expediente % ocupa % kB (máximo 2048 kB)',
            NEW.numero_expediente, (tam / 1024)
            USING HINT = 'Casi seguro que se está guardando un fichero en base64 dentro del JSONB. Los documentos y fotos van a Drive; en BD solo el enlace o el driveId. Ver scripts/purge_corrupt_blobs.sql.',
                  ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_documentacion_size ON public.expedientes;
CREATE TRIGGER trg_check_documentacion_size
    BEFORE INSERT OR UPDATE OF documentacion ON public.expedientes
    FOR EACH ROW
    EXECUTE FUNCTION public.check_documentacion_size();
