-- ============================================================================
-- LANDING PÚBLICA + WHITE-LABEL
-- ============================================================================
-- Fecha: 2026-05-15
-- Objetivo: Habilitar la landing pública (/calcula-tu-ayuda) y URLs white-label
--           por partner (/p/[slug]) sin tocar el flujo interno.
--
-- Cambios:
--   1. Añade columnas de branding/landing a `prescriptores`.
--   2. Documenta el nuevo estado de oportunidad 'LEAD' (no requiere DDL porque
--      'estado' vive en datos_calculo JSONB, no como columna).
--
-- Aplicar: revisar y ejecutar manualmente en SQL Editor de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas white-label en prescriptores
-- ----------------------------------------------------------------------------
-- Reutilizamos `logo_empresa` y `acronimo` ya existentes; añadimos solo lo
-- estrictamente nuevo para la landing.

ALTER TABLE public.prescriptores
    ADD COLUMN IF NOT EXISTS landing_slug VARCHAR(80),
    ADD COLUMN IF NOT EXISTS landing_activa BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS landing_color_primary VARCHAR(7),
    ADD COLUMN IF NOT EXISTS landing_titulo TEXT,
    ADD COLUMN IF NOT EXISTS landing_subtitulo TEXT,
    ADD COLUMN IF NOT EXISTS landing_telefono_contacto VARCHAR(30),
    ADD COLUMN IF NOT EXISTS landing_email_contacto VARCHAR(120);

-- Validación de formato del slug: minúsculas, números y guiones, 3-80 chars.
-- Solo se aplica si el slug es no nulo (permitimos partners sin landing).
ALTER TABLE public.prescriptores
    DROP CONSTRAINT IF EXISTS prescriptores_landing_slug_format;
ALTER TABLE public.prescriptores
    ADD CONSTRAINT prescriptores_landing_slug_format
    CHECK (landing_slug IS NULL OR landing_slug ~ '^[a-z0-9]([a-z0-9-]{1,78}[a-z0-9])$');

-- Validación de formato del color hex (#RRGGBB).
ALTER TABLE public.prescriptores
    DROP CONSTRAINT IF EXISTS prescriptores_landing_color_format;
ALTER TABLE public.prescriptores
    ADD CONSTRAINT prescriptores_landing_color_format
    CHECK (landing_color_primary IS NULL OR landing_color_primary ~ '^#[0-9A-Fa-f]{6}$');

-- Unicidad del slug a nivel global (incluso para landings desactivadas, para
-- evitar colisiones si se reactiva una antigua). NULLS NOT DISTINCT permite
-- múltiples partners sin slug.
DROP INDEX IF EXISTS idx_prescriptores_landing_slug_unique;
CREATE UNIQUE INDEX idx_prescriptores_landing_slug_unique
    ON public.prescriptores(landing_slug)
    WHERE landing_slug IS NOT NULL;

-- Índice de búsqueda rápida para resolver landings activas.
CREATE INDEX IF NOT EXISTS idx_prescriptores_landing_activa
    ON public.prescriptores(landing_slug)
    WHERE landing_activa = true;

-- ----------------------------------------------------------------------------
-- 2. Estado LEAD en oportunidades — convención (no DDL)
-- ----------------------------------------------------------------------------
-- La columna `estado` NO existe a nivel SQL; vive en datos_calculo->>'estado'.
-- Valores válidos en producción detectados (2026-05-15):
--   ACEPTADA (38), ENVIADA (36), PTE ENVIAR (22), EN CURSO (4), RECHAZADA (1)
--
-- Nuevo valor introducido por la landing pública:
--   LEAD — Oportunidad creada por cliente final desde landing, pendiente
--          de cualificación por admin. No tiene carpeta Drive asociada
--          hasta que el cliente sube fotos o pide instalador.
--
-- Para auditoría: contar leads pendientes
--   SELECT COUNT(*) FROM oportunidades WHERE datos_calculo->>'estado' = 'LEAD';
--
-- Para flag de origen (también dentro del JSONB):
--   datos_calculo->>'origen' ∈ ('landing_publica', 'partner', 'admin')

-- Índice GIN sobre datos_calculo para acelerar filtrados por estado/origen
-- desde el panel admin (búsqueda de leads frescos).
-- NOTA: requiere extensión pg_trgm si se quieren búsquedas LIKE; para JSONB
-- el GIN básico ya cubre operadores @> y ? eficientemente.
CREATE INDEX IF NOT EXISTS idx_oportunidades_datos_calculo_gin
    ON public.oportunidades USING GIN (datos_calculo);

-- ----------------------------------------------------------------------------
-- 3. Comentarios documentales
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.prescriptores.landing_slug IS
    'Slug URL-safe para la landing white-label en /p/[slug]. NULL si el partner no tiene landing.';
COMMENT ON COLUMN public.prescriptores.landing_activa IS
    'Si false, la landing del partner devuelve 404 aunque tenga slug. Se activa manualmente por admin.';
COMMENT ON COLUMN public.prescriptores.landing_color_primary IS
    'Color hex (#RRGGBB) para tema personalizado de la landing. NULL = usar brand BROKERGY.';
COMMENT ON COLUMN public.prescriptores.landing_titulo IS
    'Heading personalizado de la landing del partner. NULL = usar default.';
COMMENT ON COLUMN public.prescriptores.landing_subtitulo IS
    'Subheading personalizado de la landing del partner.';
COMMENT ON COLUMN public.prescriptores.landing_telefono_contacto IS
    'Teléfono mostrado al cliente final en la landing del partner (puede diferir del tlf interno).';
