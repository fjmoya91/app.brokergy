-- Migración: CONTRATO firmado con el certificador
-- Tabla: public.prescriptores
-- Fecha: 2026-09-10
--
-- El acuerdo marco con cada técnico certificador, en su ficha — mismo patrón que
-- el Convenio CAE del Sujeto Obligado (`convenio_cae_*`). El fichero vive en la
-- carpeta que el equipo ya usa, fuera de la app:
--   01. RD 36-2023 (CAES)/01. COMERCIAL/01. CONTRATOS Y ACUERDOS/04. CERTIFICADORES
--
-- `contrato_carpeta_id` SELLA la subcarpeta de cada uno la primera vez, en vez de
-- buscarla por nombre en cada subida: así sobrevive a un renombrado y a una
-- errata (la de Raquel Moncayo se llama hoy "02. RAQUEL MONTOYA").
--
-- `contrato_firmas` guarda QUIÉN consta que ha firmado y CÓMO se sabe:
--   { n, firmantes[], avisos[],
--     detectado: { certificador, brokergy },   -- leído del PDF: es prueba
--     manual:    { certificador, brokergy, confirmado_por, confirmado_at },
--     certificador, brokergy }                 -- detectado OR manual
-- Solo con `certificador` Y `brokergy` a true el slot se pone en verde. Son
-- metadatos, nunca el fichero (regla 21: ningún base64 dentro de un JSONB).
--
-- Columnas nullables sobre tabla existente y ya expuesta -> no requieren GRANT explícito.

ALTER TABLE public.prescriptores
  ADD COLUMN IF NOT EXISTS contrato_link       TEXT,
  ADD COLUMN IF NOT EXISTS contrato_nombre     TEXT,
  ADD COLUMN IF NOT EXISTS contrato_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contrato_firmas     JSONB,
  ADD COLUMN IF NOT EXISTS contrato_carpeta_id VARCHAR(100);

COMMENT ON COLUMN public.prescriptores.contrato_link       IS 'Enlace de Drive al contrato firmado con el partner';
COMMENT ON COLUMN public.prescriptores.contrato_nombre     IS 'Nombre del fichero del contrato, para enseñarlo en la ficha';
COMMENT ON COLUMN public.prescriptores.contrato_at         IS 'Cuándo se registró el contrato en la app';
COMMENT ON COLUMN public.prescriptores.contrato_firmas     IS 'Quién consta que ha firmado y cómo se sabe (detectado del PDF / confirmado a mano). Solo con las DOS firmas el slot pasa a verde';
COMMENT ON COLUMN public.prescriptores.contrato_carpeta_id IS 'Id de la subcarpeta de Drive de este partner dentro de "04. CERTIFICADORES", sellado la primera vez';

-- Siembra de las tres carpetas que YA existen en Drive, para no depender de que
-- el nombre case (una lleva "MONTOYA" donde el certificador es "MONCAYO").
UPDATE public.prescriptores SET contrato_carpeta_id = '1teEcZkbrBuZJOGoSc9jJ3EhPdy-V37l3'
 WHERE cif = '70590504P' AND contrato_carpeta_id IS NULL;   -- 01. LUIS ALBERTO LANUZA
UPDATE public.prescriptores SET contrato_carpeta_id = '18iXIqNoh5acuRDwBf1vOaTqVlF-JVOvr'
 WHERE cif = '71355161F' AND contrato_carpeta_id IS NULL;   -- 02. RAQUEL MONTOYA [sic]
UPDATE public.prescriptores SET contrato_carpeta_id = '1J0S3F-npb8Y1bKWe9rZCWur0xaa_OM95'
 WHERE cif = '06276718H' AND contrato_carpeta_id IS NULL;   -- 03. DAVID COBOS
