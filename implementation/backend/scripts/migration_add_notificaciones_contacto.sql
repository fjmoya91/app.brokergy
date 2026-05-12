-- Añadir campo para redirigir notificaciones WhatsApp/Email al contacto alternativo del cliente
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS notificaciones_contacto_activas BOOLEAN DEFAULT FALSE;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS persona_contacto_email VARCHAR(150);

-- Recargar la caché del esquema de PostgREST para que detecte las nuevas columnas inmediatamente
NOTIFY pgrst, 'reload schema';
