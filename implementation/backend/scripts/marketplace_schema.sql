-- ============================================================================
-- ESCAPARATE DE INSTALADORES — Migración de esquema (Fase 1a)
-- instaladores.brokergy.es · 2026-07-06
--
-- Aditiva y no destructiva: columnas nullable + tablas nuevas + GRANTs.
-- No rompe la app en marcha. Ejecutar en Supabase (SQL editor o MCP).
--
-- REGLAS DE ORO (ver prototypes/escaparate-instaladores/SPEC.md):
--  1) Cero datos personales de clientes en superficies públicas (geo = municipio).
--  2) Cero campos de margen; los DTO públicos se construyen por whitelist.
--  3) Consentimiento explícito del instalador para aparecer.
-- ============================================================================

-- ── 1) Perfil público + consentimiento en prescriptores ─────────────────────
ALTER TABLE prescriptores
  ADD COLUMN IF NOT EXISTS visible_marketplace         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketplace_consent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketplace_consent_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS marketplace_slug            VARCHAR(80),
  ADD COLUMN IF NOT EXISTS descripcion_publica         TEXT,
  ADD COLUMN IF NOT EXISTS especialidades              TEXT[],   -- {aerotermia,envolvente,fotovoltaica}
  ADD COLUMN IF NOT EXISTS lat                         NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS lng                         NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS google_place_id             VARCHAR(120);

-- Slug único (permite múltiples NULL). Se siembra desde landing_slug en el backfill.
CREATE UNIQUE INDEX IF NOT EXISTS ux_prescriptores_marketplace_slug
  ON prescriptores (marketplace_slug) WHERE marketplace_slug IS NOT NULL;

-- Índice para el listado público (solo instaladores visibles).
CREATE INDEX IF NOT EXISTS ix_prescriptores_marketplace_visible
  ON prescriptores (visible_marketplace) WHERE visible_marketplace = true;

-- ── 2) Marcas N:M (sustituye a marca_referencia/marca_secundaria, que quedan como legado) ──
CREATE TABLE IF NOT EXISTS instalador_marcas (
  instalador_id UUID NOT NULL REFERENCES prescriptores(id_empresa) ON DELETE CASCADE,
  marca_nombre  TEXT NOT NULL REFERENCES aerotermia_marcas(nombre) ON DELETE CASCADE,
  PRIMARY KEY (instalador_id, marca_nombre)
);

-- ── 3) Stats precalculadas (refresco por cron nocturno; nunca agregar JSONB en caliente) ──
CREATE TABLE IF NOT EXISTS instalador_stats (
  instalador_id       UUID PRIMARY KEY REFERENCES prescriptores(id_empresa) ON DELETE CASCADE,
  num_finalizadas     INT NOT NULL DEFAULT 0,
  num_en_curso        INT NOT NULL DEFAULT 0,
  suma_ayudas_cliente NUMERIC,
  presupuesto_p25     NUMERIC,
  presupuesto_p75     NUMERIC,
  municipios          TEXT[],
  rating_media        NUMERIC(3,2),
  num_resenas         INT NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4) Fotos curadas para el escaparate (id opaco; el expediente NUNCA sale al DTO público) ──
CREATE TABLE IF NOT EXISTS instalador_fotos_escaparate (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instalador_id          UUID NOT NULL REFERENCES prescriptores(id_empresa) ON DELETE CASCADE,
  expediente_id          UUID NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
  drive_id               TEXT NOT NULL,
  fase                   VARCHAR(10) NOT NULL CHECK (fase IN ('ANTES','DESPUES')),
  actuacion              VARCHAR(40),
  par_id                 UUID,                       -- empareja ANTES↔DESPUÉS de una actuación
  titulo_publico         VARCHAR(120),
  municipio              VARCHAR(100),               -- único dato geográfico permitido
  consentimiento_cliente BOOLEAN NOT NULL DEFAULT false,
  orden                  INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_fotos_escaparate_instalador
  ON instalador_fotos_escaparate (instalador_id);

-- ── 5) Reseñas ligadas a expediente (solo opina quien tiene expediente; 1 por expediente) ──
CREATE TABLE IF NOT EXISTS instalador_resenas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instalador_id   UUID NOT NULL REFERENCES prescriptores(id_empresa) ON DELETE CASCADE,
  expediente_id   UUID NOT NULL UNIQUE REFERENCES expedientes(id) ON DELETE CASCADE,
  puntuacion      INT NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
  comentario      TEXT,
  autor_alias     VARCHAR(60),                       -- "María G." — nunca nombre completo por defecto
  municipio       VARCHAR(100),
  mes_instalacion DATE,
  estado          VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','PUBLICADA','RECHAZADA')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_resenas_instalador_publicada
  ON instalador_resenas (instalador_id) WHERE estado = 'PUBLICADA';

-- ── 6) GRANTs (obligatorio desde 2026-10-30 para PostgREST/supabase-js) ──────
GRANT SELECT, INSERT, UPDATE, DELETE
  ON instalador_marcas, instalador_stats, instalador_fotos_escaparate, instalador_resenas
  TO service_role;
GRANT SELECT
  ON instalador_marcas, instalador_stats, instalador_fotos_escaparate, instalador_resenas
  TO anon, authenticated;
