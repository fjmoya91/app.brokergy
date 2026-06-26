-- Tabla genérica de configuración de la app (clave-valor).
-- Primer uso: remitente de los emails (nombre visible + dirección), editable
-- desde la ficha de admin. Reutilizable para futuros ajustes globales.
--
-- Solo la toca el backend con la service_role key (bypassa RLS). Se conceden
-- grants explícitos a service_role por la regla de PostgREST (ver memoria
-- project_supabase_schema_grants): toda tabla nueva en public necesita GRANT.
--
-- Aplicada en producción vía MCP (apply_migration: create_app_settings) el 2026-06-25.
CREATE TABLE IF NOT EXISTS public.app_settings (
    key        text PRIMARY KEY,
    value      text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO service_role;

-- Claves usadas por el módulo de email:
--   email_from_name     → nombre visible del remitente (p.ej. "BROKERGY · Ingeniería Energética")
--   email_from_address  → dirección remitente (debe ser del dominio de la cuenta SMTP)
