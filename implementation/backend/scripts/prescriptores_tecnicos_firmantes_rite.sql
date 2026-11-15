-- Migración: VARIOS técnicos que pueden firmar la Memoria RITE de una empresa.
-- Tabla: public.prescriptores
-- Fecha: 2026-11-06 (FONCAMAN CRIPTANA: firman Francisco Javier o Antonio Manjavacas)
--
-- Los campos `tecnico_firmante_*` siguen siendo el técnico POR DEFECTO (el que
-- leen todos los generadores). Esta lista guarda los OTROS habilitados de la
-- misma empresa: [{ nombre, apellidos, dni, carnet }]. Al enviar la memoria se
-- puede elegir uno de ellos para ESE expediente
-- (documentacion.memoria_rite_tecnico = { dni, ... }).
-- Columna sobre tabla existente y ya expuesta -> no requiere GRANT.

ALTER TABLE public.prescriptores
  ADD COLUMN IF NOT EXISTS tecnicos_firmantes_rite jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.prescriptores.tecnicos_firmantes_rite IS
  'Otros técnicos habilitados que pueden firmar la Memoria RITE (además del de tecnico_firmante_*, que es el de por defecto): [{nombre, apellidos, dni, carnet}]';
