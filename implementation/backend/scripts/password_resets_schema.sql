-- Tabla para tokens de recuperación de contraseña
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);

-- Habilitar RLS: sin políticas = ningún usuario/anon accede por API directa.
-- El backend usa SUPABASE_SERVICE_ROLE_KEY que bypassa RLS, por lo que funciona con normalidad.
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- Limpiar tokens expirados (puede ejecutarse periódicamente)
-- DELETE FROM password_resets WHERE expires_at < NOW() OR used = true;
