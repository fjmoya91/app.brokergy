-- ============================================================================
-- ESCAPARATE: lo que propone el INSTALADOR pasa por REVISIÓN antes de publicarse
-- App del instalador, fase 3 («Tu página web») · 2026-11-21
--
-- Aditivo, idempotente y no destructivo. NO lo ejecuta la app: se aplica a mano
-- (SQL editor de Supabase o MCP) ANTES de desplegar el código de la fase 3, que
-- ya lee y escribe estas columnas. Orden: 1) este script · 2) deploy.sh.
--
-- Lo que añade:
--   a) el ESTADO de revisión de cada foto (PENDIENTE · PUBLICADA · NO_VALE), con su
--      motivo, quién y cuándo la propuso y la revisó, y la marca «tengo permiso del
--      cliente» con su fecha. Las fotos que ya había (las publicó el ADMIN desde el
--      gestor) nacen PUBLICADAS: el DEFAULT las deja exactamente como estaban.
--   b) fotos SUELTAS (subidas del móvil, sin obra): `expediente_id` deja de ser
--      obligatorio y `origen` dice de dónde viene cada una.
--   c) los TEXTOS que propone el instalador (presentación, a qué se dedica y
--      pueblos donde trabaja), en una tabla APARTE de los vigentes, que siguen en
--      `prescriptores` (`descripcion_publica`, `especialidades` y la nueva
--      `zona_trabajo_publica`).
--   d) HALLAZGO (21/11/2026, consulta de solo lectura): `anon` y `authenticated`
--      tienen TODOS los privilegios (SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--      REFERENCES, TRIGGER) en las cinco tablas `instalador_*`. Hoy no se nota
--      porque tienen RLS sin policies, pero TRUNCATE no pasa por el RLS y la clave
--      anónima es pública. Regla 150: se les QUITA todo. El backend va con
--      `service_role` y no lo nota; el frontend no hace `.from()`.
--
-- Reglas: 150 (RLS sin policies, GRANT solo a service_role, REVOKE a anon y
-- authenticated) y la de oro del escaparate (cero datos de clientes en lo público).
-- ============================================================================

-- ── a) y b) Estado de revisión y fotos sueltas ─────────────────────────────────
ALTER TABLE instalador_fotos_escaparate
  ADD COLUMN IF NOT EXISTS estado             VARCHAR(12) NOT NULL DEFAULT 'PUBLICADA',
  ADD COLUMN IF NOT EXISTS motivo_rechazo     TEXT,
  ADD COLUMN IF NOT EXISTS origen             VARCHAR(10) NOT NULL DEFAULT 'OBRA',
  ADD COLUMN IF NOT EXISTS slot               VARCHAR(60),          -- el apartado de la obra (para fase y actuación)
  ADD COLUMN IF NOT EXISTS mime_type          VARCHAR(60),          -- el de sus BYTES, para las sueltas
  ADD COLUMN IF NOT EXISTS permiso_cliente    BOOLEAN NOT NULL DEFAULT false,  -- lo marca el INSTALADOR
  ADD COLUMN IF NOT EXISTS permiso_cliente_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS propuesta_por      UUID,                 -- usuarios.id_usuario del instalador
  ADD COLUMN IF NOT EXISTS propuesta_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revisada_por       UUID,                 -- usuarios.id_usuario del ADMIN
  ADD COLUMN IF NOT EXISTS revisada_at        TIMESTAMPTZ;

-- Una foto suelta no cuelga de ninguna obra.
ALTER TABLE instalador_fotos_escaparate ALTER COLUMN expediente_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_fotos_escaparate_estado') THEN
    ALTER TABLE instalador_fotos_escaparate
      ADD CONSTRAINT ck_fotos_escaparate_estado CHECK (estado IN ('PENDIENTE', 'PUBLICADA', 'NO_VALE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_fotos_escaparate_origen') THEN
    ALTER TABLE instalador_fotos_escaparate
      ADD CONSTRAINT ck_fotos_escaparate_origen CHECK (origen IN ('OBRA', 'SUELTA'));
  END IF;
  -- Una foto de OBRA siempre sabe de qué obra es; una suelta, de ninguna.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_fotos_escaparate_obra') THEN
    ALTER TABLE instalador_fotos_escaparate
      ADD CONSTRAINT ck_fotos_escaparate_obra CHECK (
        (origen = 'OBRA' AND expediente_id IS NOT NULL) OR (origen = 'SUELTA' AND expediente_id IS NULL));
  END IF;
  -- «No vale» siempre lleva su motivo: el instalador lo lee en su pantalla.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_fotos_escaparate_motivo') THEN
    ALTER TABLE instalador_fotos_escaparate
      ADD CONSTRAINT ck_fotos_escaparate_motivo CHECK (estado <> 'NO_VALE' OR length(trim(coalesce(motivo_rechazo, ''))) > 0);
  END IF;
END $$;

-- Idempotencia de «proponer»: una foto de una obra es UNA fila (comprobado el
-- 21/11/2026: 2 filas, ningún duplicado por (expediente_id, drive_id) ni por
-- (instalador_id, drive_id)).
CREATE UNIQUE INDEX IF NOT EXISTS ux_fotos_escaparate_exp_drive
  ON instalador_fotos_escaparate (expediente_id, drive_id) WHERE expediente_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fotos_escaparate_inst_drive
  ON instalador_fotos_escaparate (instalador_id, drive_id);
-- La cola de revisión.
CREATE INDEX IF NOT EXISTS ix_fotos_escaparate_pendientes
  ON instalador_fotos_escaparate (instalador_id) WHERE estado = 'PENDIENTE';

-- ── c) Textos: los VIGENTES en prescriptores; los PROPUESTOS, aparte ───────────
ALTER TABLE prescriptores
  ADD COLUMN IF NOT EXISTS zona_trabajo_publica TEXT[];   -- «Pueblos donde trabajas», ya revisados

CREATE TABLE IF NOT EXISTS instalador_textos_escaparate (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instalador_id  UUID NOT NULL REFERENCES prescriptores(id_empresa) ON DELETE CASCADE,
  presentacion   TEXT,                       -- ≤ 300 letras (lo comprueba el servidor)
  especialidades TEXT[],                     -- lista cerrada: aerotermia, suelo_radiante, fotovoltaica, aire_acondicionado, calderas
  pueblos        TEXT[],                     -- ≤ 15 pueblos
  estado         VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                   CHECK (estado IN ('PENDIENTE', 'APROBADO', 'NO_VALE')),
  motivo_rechazo TEXT,
  propuesto_por  UUID,
  propuesto_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_por   UUID,
  revisado_at    TIMESTAMPTZ,
  CHECK (estado <> 'NO_VALE' OR length(trim(coalesce(motivo_rechazo, ''))) > 0)
);
-- Como mucho UNA propuesta en revisión por instalador: la nueva sustituye a la anterior.
CREATE UNIQUE INDEX IF NOT EXISTS ux_textos_escaparate_pendiente
  ON instalador_textos_escaparate (instalador_id) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS ix_textos_escaparate_instalador
  ON instalador_textos_escaparate (instalador_id, propuesto_at DESC);

-- ── Permisos (regla 150) ──────────────────────────────────────────────────────
ALTER TABLE instalador_textos_escaparate ENABLE ROW LEVEL SECURITY;   -- sin policies
GRANT SELECT, INSERT, UPDATE, DELETE ON instalador_textos_escaparate TO service_role;

-- d) Lo que `marketplace_schema.sql` (y los privilegios por defecto) dieron de más.
REVOKE ALL ON instalador_marcas, instalador_stats, instalador_fotos_escaparate,
              instalador_resenas, instalador_solicitudes, instalador_textos_escaparate
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON instalador_marcas, instalador_stats, instalador_fotos_escaparate,
     instalador_resenas, instalador_solicitudes
  TO service_role;

-- ── Comprobación (solo lectura; debe salir SOLO service_role) ──────────────────
-- select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--  where table_schema = 'public' and table_name like 'instalador\_%'
--  group by 1, 2 order by 1, 2;
