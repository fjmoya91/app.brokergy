-- Añadir campo para redirigir notificaciones WhatsApp/Email al contacto alternativo del cliente
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS notificaciones_contacto_activas BOOLEAN DEFAULT FALSE;
