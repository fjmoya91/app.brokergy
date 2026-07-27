-- Migración: instalador HABILITADO que firma por otro que no lo está.
-- Tabla: public.prescriptores
--
-- Contexto: un INSTALADOR puede no estar habilitado en Industria (el toggle
-- `tiene_carnet_rite` va en OFF). En ese caso no puede figurar como empresa
-- instaladora en la Memoria RITE, el Certificado de Instalación Térmica ni el
-- CIFO: quien responde ante Industria es otra empresa habilitada, y es la suya
-- la que debe constar en esos documentos (razón social, CIF, dirección, Nº de
-- Empresa RITE, representante legal y técnico firmante).
--
-- `instalador_rite_id` apunta a ese instalador habilitado. Solo se tiene en
-- cuenta cuando `tiene_carnet_rite` es false; si el instalador está habilitado,
-- firma él y este campo se ignora (ver utils/instaladorFirmante.js).
--
-- Fecha: 2026-07-27
-- Columna nullable sobre tabla existente y ya expuesta -> no requiere GRANT.

ALTER TABLE public.prescriptores
  ADD COLUMN IF NOT EXISTS instalador_rite_id uuid
    REFERENCES public.prescriptores(id_empresa) ON DELETE SET NULL;

COMMENT ON COLUMN public.prescriptores.instalador_rite_id IS
  'Instalador HABILITADO en Industria que firma la Memoria RITE / Certificado / CIFO en nombre de este instalador cuando tiene_carnet_rite = false. NULL = firma él mismo.';

-- Un instalador no puede delegar en sí mismo (bucle en la resolución del firmante).
ALTER TABLE public.prescriptores
  DROP CONSTRAINT IF EXISTS prescriptores_instalador_rite_no_self;
ALTER TABLE public.prescriptores
  ADD CONSTRAINT prescriptores_instalador_rite_no_self
    CHECK (instalador_rite_id IS NULL OR instalador_rite_id <> id_empresa);

CREATE INDEX IF NOT EXISTS idx_prescriptores_instalador_rite_id
  ON public.prescriptores(instalador_rite_id)
  WHERE instalador_rite_id IS NOT NULL;
