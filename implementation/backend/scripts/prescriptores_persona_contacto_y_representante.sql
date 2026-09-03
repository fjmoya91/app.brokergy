-- Migración: unificar "Persona de Contacto" y separar "Representante Legal" (solo si distinto)
-- Tabla: public.prescriptores
-- Contexto: nombre_responsable/apellidos_responsable/nif_responsable/cargo ya existían y
-- YA son los que firman el CIFO (docGenerators.empresaInstaladora → cifoDoc.js) — pero en
-- pantalla se llamaban "Persona de Contacto" para INSTALADOR, así que quien los rellenaba
-- no sabía que también eran el firmante legal. Pasan a ser, de forma explícita, la PERSONA
-- DE CONTACTO (con su propio teléfono/email, hasta ahora solo en el array
-- `contactos_notificacion` bajo un toggle) y, por defecto, también el representante legal.
--
-- `representante_*` es NUEVO y solo se usa cuando `representante_distinto = true`: el
-- representante legal es una persona distinta de la de contacto. Con el valor por defecto
-- (false), el firmante del CIFO sigue siendo exactamente el de siempre — cero regresión
-- para los partners ya rellenados.
--
-- No se toca `contactos_notificacion` / `contacto_alternativo_activo` /
-- `contacto_notificaciones_activas`: siguen siendo el mecanismo aparte de notificaciones
-- MÚLTIPLES/alternativas (varios contactos, o desviar avisos a otro), independiente de
-- quién es LA persona de contacto de la ficha.
--
-- Fecha: 2026-09-03
-- Columnas nullables sobre tabla existente y ya expuesta -> no requieren GRANT explícito.

ALTER TABLE public.prescriptores
  ADD COLUMN IF NOT EXISTS tlf_responsable          varchar(20),
  ADD COLUMN IF NOT EXISTS email_responsable        varchar(150),
  ADD COLUMN IF NOT EXISTS representante_distinto   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS representante_nombre     varchar(150),
  ADD COLUMN IF NOT EXISTS representante_apellidos  varchar(150),
  ADD COLUMN IF NOT EXISTS representante_dni        varchar(20);

COMMENT ON COLUMN public.prescriptores.tlf_responsable         IS 'Teléfono de la persona de contacto (nombre_responsable/apellidos_responsable)';
COMMENT ON COLUMN public.prescriptores.email_responsable       IS 'Email de la persona de contacto (nombre_responsable/apellidos_responsable)';
COMMENT ON COLUMN public.prescriptores.representante_distinto  IS 'El representante legal (firma el CIFO) es una persona distinta de la de contacto';
COMMENT ON COLUMN public.prescriptores.representante_nombre    IS 'Nombre del representante legal, solo si representante_distinto=true';
COMMENT ON COLUMN public.prescriptores.representante_apellidos IS 'Apellidos del representante legal, solo si representante_distinto=true';
COMMENT ON COLUMN public.prescriptores.representante_dni       IS 'DNI del representante legal, solo si representante_distinto=true';
