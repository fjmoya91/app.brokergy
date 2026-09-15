-- Migración: la EMPRESA a la que pertenece un técnico certificador
-- Tabla: public.prescriptores
-- Fecha: 2026-09-15
--
-- Contexto: un certificador firma como PERSONA —su titulación y su nº de
-- colegiado son suyos, no de ninguna sociedad— pero puede ejercer dentro de
-- una empresa, y CE3X pide las dos cosas en «Datos del técnico certificador»:
-- Nombre y Apellidos + NIF de quien firma, y Razón social + CIF de la empresa.
--
-- Hasta ahora no había dónde declararla, así que se colaba en los campos de al
-- lado: la ficha de FÉLIX PÉREZ SOBRINO tenía `razon_social` = su nombre y
-- `cif` = B01799436, que es el CIF de FESSA SOLAR, SL. O sea, dos campos
-- diciendo cada uno una cosa distinta de la que su nombre promete.
--
-- `razon_social` sigue siendo la IDENTIDAD de la ficha (el listado, los lotes,
-- la facturación del certificador y el histórico cuelgan de ella): en un
-- certificador es el nombre de la persona, que es como están dados de alta 6
-- de los 7. La empresa va aparte, y solo cuando existe.
--
-- Es TEXTO y no un enlace a otra ficha de prescriptor a propósito: la empresa
-- de un certificador no tiene por qué estar dada de alta (que FESSA SOLAR y
-- Soluciones Sostenibles lo estén como INSTALADOR es circunstancial), y el
-- .cex no puede depender de una ficha ajena que alguien puede borrar.
--
-- Columnas nullables sobre tabla existente y ya expuesta -> no requieren GRANT.

ALTER TABLE public.prescriptores
  ADD COLUMN IF NOT EXISTS empresa_razon_social varchar(200),
  ADD COLUMN IF NOT EXISTS empresa_cif          varchar(20);

COMMENT ON COLUMN public.prescriptores.empresa_razon_social IS 'Empresa en la que ejerce el técnico certificador (va a la casilla «Razón social» del .cex). Vacío = firma por su cuenta y manda razon_social';
COMMENT ON COLUMN public.prescriptores.empresa_cif          IS 'CIF de esa empresa (casilla «CIF» del .cex). El NIF de quien firma es nif_responsable, o cif si es autónomo';
