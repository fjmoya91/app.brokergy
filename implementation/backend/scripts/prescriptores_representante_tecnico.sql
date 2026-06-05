-- Migración: NIF del representante legal + datos del técnico firmante de memorias
-- Tabla: public.prescriptores
-- Contexto: para INSTALADOR que es empresa, se necesita el NIF del representante legal
-- y, opcionalmente, los datos del técnico habilitado que firma las memorias técnicas
-- cuando es distinto del representante legal.
-- Fecha: 2026-06-05
-- Columnas nullables sobre tabla existente y ya expuesta -> no requieren GRANT explícito.

ALTER TABLE public.prescriptores
  ADD COLUMN IF NOT EXISTS nif_responsable              varchar(20),
  ADD COLUMN IF NOT EXISTS tecnico_firmante_distinto    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tecnico_firmante_nombre      varchar(200),
  ADD COLUMN IF NOT EXISTS tecnico_firmante_apellidos   varchar(200),
  ADD COLUMN IF NOT EXISTS tecnico_firmante_dni         varchar(20),
  ADD COLUMN IF NOT EXISTS tecnico_firmante_carnet_rite varchar(100);

COMMENT ON COLUMN public.prescriptores.nif_responsable              IS 'NIF/DNI del representante legal (empresa)';
COMMENT ON COLUMN public.prescriptores.tecnico_firmante_distinto    IS 'El técnico que firma las memorias es distinto del representante legal';
COMMENT ON COLUMN public.prescriptores.tecnico_firmante_nombre      IS 'Nombre del técnico firmante de memorias';
COMMENT ON COLUMN public.prescriptores.tecnico_firmante_apellidos   IS 'Apellidos del técnico firmante de memorias';
COMMENT ON COLUMN public.prescriptores.tecnico_firmante_dni         IS 'DNI del técnico firmante de memorias';
COMMENT ON COLUMN public.prescriptores.tecnico_firmante_carnet_rite IS 'N.º de carnet RITE del técnico firmante de memorias';
