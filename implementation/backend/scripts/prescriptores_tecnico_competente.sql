-- Migración: datos del TÉCNICO COMPETENTE que suscribe los certificados (CERTIFICADOR)
-- Tabla: public.prescriptores
-- Fecha: 2026-09-10
--
-- Contexto: la ficha solo tenía habilitación RITE (`tiene_carnet_rite` /
-- `numero_carnet_rite`), que es de INSTALADORES: acredita para montar una
-- instalación térmica, no para suscribir un certificado de eficiencia
-- energética. Un certificador se acredita por su TITULACIÓN habilitante y,
-- con el RD 659/2025, por su inscripción en el registro autonómico de
-- técnicos competentes.
--
-- De quién son estos datos: de la PERSONA que firma. En un certificador
-- autónomo (5 de los 7 que hay hoy) es el titular de la ficha; en una empresa
-- certificadora, el técnico que consta como persona de contacto / firmante.
--
-- Columnas nullables sobre tabla existente y ya expuesta -> no requieren GRANT explícito.

ALTER TABLE public.prescriptores
  ADD COLUMN IF NOT EXISTS titulacion                  varchar(200),
  ADD COLUMN IF NOT EXISTS colegio_profesional         varchar(200),
  ADD COLUMN IF NOT EXISTS numero_colegiado            varchar(50),
  ADD COLUMN IF NOT EXISTS registro_tecnico_competente varchar(100);

COMMENT ON COLUMN public.prescriptores.titulacion                  IS 'Titulación habilitante del técnico competente (ej. INGENIERO TÉCNICO INDUSTRIAL)';
COMMENT ON COLUMN public.prescriptores.colegio_profesional         IS 'Colegio profesional al que pertenece el técnico competente';
COMMENT ON COLUMN public.prescriptores.numero_colegiado            IS 'N.º de colegiado del técnico competente';
COMMENT ON COLUMN public.prescriptores.registro_tecnico_competente IS 'N.º de inscripción en el registro de técnicos competentes (RD 659/2025). El registro es AUTONÓMICO: anotarlo con su distintivo si el número solo no lo identifica';
