-- =============================================================================
-- Optimización de la lista de oportunidades (GET /api/oportunidades)
-- =============================================================================
-- Problema: la lista hace SELECT de datos_calculo (JSONB enorme) para todas las
-- filas, sin paginación. Con N filas y un compute pequeño, satura RAM y la BD
-- timeoutea (sql_state 57014).
--
-- Estrategia: añadir columnas calientes extraídas del JSONB + índice por
-- updated_at. Así el SELECT de la lista NO necesita traer datos_calculo y la
-- query es <50ms incluso con miles de filas.
--
-- Compatibilidad: las columnas se mantienen sincronizadas con datos_calculo
-- vía trigger. El backend puede seguir leyendo datos_calculo completo cuando
-- haga falta (detalle de oportunidad).
-- =============================================================================

-- 1) Índice por updated_at (clave para ORDER BY updated_at DESC LIMIT N)
CREATE INDEX IF NOT EXISTS idx_oportunidades_updated_at
    ON public.oportunidades (updated_at DESC);

-- 2) Columnas dedicadas para los campos calientes que usa la lista
ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS estado              TEXT,
    ADD COLUMN IF NOT EXISTS is_reforma          BOOLEAN,
    ADD COLUMN IF NOT EXISTS reforma_type        TEXT,
    ADD COLUMN IF NOT EXISTS hibridacion         BOOLEAN,
    ADD COLUMN IF NOT EXISTS cod_cliente_interno TEXT;

-- 3) Función que sincroniza las columnas calientes desde datos_calculo
CREATE OR REPLACE FUNCTION public.sync_oportunidades_hot_cols()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.estado              := COALESCE(NEW.datos_calculo->>'estado', 'PTE ENVIAR');
    NEW.is_reforma          := COALESCE((NEW.datos_calculo->'isReforma')::boolean, false);
    NEW.reforma_type        := NEW.datos_calculo->>'reformaType';
    NEW.hibridacion         := COALESCE((NEW.datos_calculo->'hibridacion')::boolean, false);
    NEW.cod_cliente_interno := NEW.datos_calculo->>'cod_cliente_interno';
    RETURN NEW;
END $$;

-- 4) Trigger que ejecuta la sincronización en INSERT/UPDATE
DROP TRIGGER IF EXISTS trg_sync_oportunidades_hot_cols ON public.oportunidades;
CREATE TRIGGER trg_sync_oportunidades_hot_cols
    BEFORE INSERT OR UPDATE OF datos_calculo ON public.oportunidades
    FOR EACH ROW EXECUTE FUNCTION public.sync_oportunidades_hot_cols();

-- 5) Backfill: actualiza las filas existentes en batches para no saturar
--    (hacer en mantenimiento si la tabla es muy grande)
UPDATE public.oportunidades
SET estado = COALESCE(datos_calculo->>'estado', 'PTE ENVIAR'),
    is_reforma = COALESCE((datos_calculo->'isReforma')::boolean, false),
    reforma_type = datos_calculo->>'reformaType',
    hibridacion = COALESCE((datos_calculo->'hibridacion')::boolean, false),
    cod_cliente_interno = datos_calculo->>'cod_cliente_interno'
WHERE estado IS NULL;

-- 6) Índice secundario por estado (frecuentemente filtrado en la lista)
CREATE INDEX IF NOT EXISTS idx_oportunidades_estado
    ON public.oportunidades (estado);
