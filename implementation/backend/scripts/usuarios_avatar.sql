-- Avatar / foto de perfil para usuarios internos (ADMIN, CERTIFICADOR, ...)
--
-- Columna nullable: no afecta a ninguna fila existente ni rompe el SELECT * del
-- middleware de auth. Se almacena como data URL (base64), mismo patrón que
-- prescriptores.logo_empresa. El frontend reduce la imagen a ~256px antes de
-- guardar para no inflar la fila ni la caché de localStorage del perfil.
--
-- Aplicada en producción vía MCP (apply_migration: add_avatar_url_to_usuarios) el 2026-06-25.
-- No requiere GRANT nuevo: es una columna sobre una tabla ya existente.
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS avatar_url TEXT;
