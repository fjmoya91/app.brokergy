-- ============================================================
-- MIGRACIÓN: Lotes de expedientes (Sujeto Obligado + Verificador)
-- Ejecutar en: Supabase SQL Editor  (o vía MCP apply_migration)
-- Fecha creación: 2026-06-21
--
-- PROPÓSITO
-- ---------
-- Permite AGRUPAR expedientes en LOTES para enviarlos en bloque a un
-- Sujeto Obligado y a un Verificador. Reglas de negocio:
--   • Un lote se envía SIEMPRE al mismo Sujeto Obligado y Verificador.
--     → Por eso esos dos datos viven en el LOTE, no en el expediente.
--   • Agrupación OBLIGATORIA por: mismo año de actuación + misma CCAA
--     (la CCAA es la de la INSTALACIÓN del expediente, no la del cliente).
--   • Máx. recomendado 5 expedientes por lote → aviso blando en la app
--     (NO se fuerza por BD).
--
-- El Sujeto Obligado y el Verificador se modelan como PRESCRIPTORES de
-- dos tipos nuevos (igual que el CERTIFICADOR ya existente), para reusar
-- la ficha de partner (razón social, CIF, email, teléfono, etc.).
--
-- SEGURIDAD
-- ---------
-- Calca la postura de `expedientes`/`prescriptores`: RLS ON + GRANT a
-- anon/authenticated/service_role. El backend accede con service_role
-- (bypassa RLS); sin política, anon/authenticated NO leen directamente.
--
-- ROLLBACK
-- --------
--   ALTER TABLE public.expedientes DROP COLUMN IF EXISTS lote_id;
--   DROP TABLE IF EXISTS public.lotes;
--   -- (los valores de enum y los roles NO se pueden borrar fácilmente;
--   --  son aditivos e inocuos si quedan sin usar)
-- ============================================================


-- ─── 1. Tipos nuevos de prescriptor: SUJETO_OBLIGADO y VERIFICADOR ───────────
-- El enum `tipo_empresa_enum` ya contiene DISTRIBUIDOR, INSTALADOR, OTRO,
-- CERTIFICADOR. Añadimos los dos nuevos. ADD VALUE es aditivo e idempotente
-- con IF NOT EXISTS.
ALTER TYPE public.tipo_empresa_enum ADD VALUE IF NOT EXISTS 'SUJETO_OBLIGADO';
ALTER TYPE public.tipo_empresa_enum ADD VALUE IF NOT EXISTS 'VERIFICADOR';

-- Roles paralelos (la app sincroniza tipo_empresa → roles.nombre_rol).
INSERT INTO public.roles (nombre_rol)
VALUES ('SUJETO_OBLIGADO'), ('VERIFICADOR')
ON CONFLICT (nombre_rol) DO NOTHING;


-- ─── 2. Tabla `lotes` ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lotes (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo                   VARCHAR(30) UNIQUE,            -- LOTE-2026-001 (lo genera la app)

  -- Destinatarios del lote (prescriptores de los tipos nuevos)
  sujeto_obligado_id       UUID REFERENCES public.prescriptores(id_empresa),
  verificador_id           UUID REFERENCES public.prescriptores(id_empresa),

  -- Claves de agrupación OBLIGATORIAS (se fijan al crear / con el 1er expediente)
  anio_actuacion           INT,                           -- año de fecha_fin_cifo del expediente
  ccaa                     VARCHAR(100),                  -- CCAA de la INSTALACIÓN

  -- Estado del lote (fase verificación → CAE → pago). Ver constante en la app.
  estado                   VARCHAR(50) NOT NULL DEFAULT 'BORRADOR',

  -- Hitos
  fecha_envio_verificador  TIMESTAMPTZ,
  fecha_cae                TIMESTAMPTZ,

  notas                    TEXT,
  historial                JSONB NOT NULL DEFAULT '[]'::jsonb,  -- cambios de estado / comentarios

  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  public.lotes IS
  'Agrupación de expedientes (máx. 5 recomendado) para envío conjunto a un Sujeto Obligado y un Verificador. Agrupación obligatoria por año de actuación + CCAA de instalación.';
COMMENT ON COLUMN public.lotes.anio_actuacion IS 'Año de fecha_fin_cifo. Todos los expedientes del lote deben coincidir.';
COMMENT ON COLUMN public.lotes.ccaa           IS 'CCAA de la instalación (no del cliente). Todos los expedientes del lote deben coincidir.';

CREATE INDEX IF NOT EXISTS idx_lotes_estado          ON public.lotes(estado);
CREATE INDEX IF NOT EXISTS idx_lotes_grupo           ON public.lotes(anio_actuacion, ccaa);
CREATE INDEX IF NOT EXISTS idx_lotes_sujeto_obligado ON public.lotes(sujeto_obligado_id);
CREATE INDEX IF NOT EXISTS idx_lotes_verificador     ON public.lotes(verificador_id);


-- ─── 3. Vínculo expediente → lote ────────────────────────────────────────────
-- Única columna nueva en expedientes. El SO y el Verificador NO se duplican
-- aquí: se leen del lote. ON DELETE SET NULL → borrar un lote desasigna sus
-- expedientes sin borrarlos.
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS lote_id UUID REFERENCES public.lotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expedientes_lote_id ON public.expedientes(lote_id);


-- ─── 4. Seguridad: RLS + GRANTs (calca expedientes/prescriptores) ────────────
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.lotes TO anon, authenticated, service_role;
