-- Múltiples contactos de notificación por instalador/partner.
-- Hasta ahora solo había UN contacto alternativo (nombre_contacto / tlf_contacto / email_contacto).
-- Esta columna guarda un array de contactos { nombre, tlf, email }. El primero se sigue espejando
-- en las columnas planas para mantener la compatibilidad con el código que las lee.
ALTER TABLE public.prescriptores
    ADD COLUMN IF NOT EXISTS contactos_notificacion JSONB DEFAULT '[]'::jsonb;

-- Backfill: para los prescriptores que ya tienen un contacto alternativo en las columnas planas,
-- sembrar el array con ese único contacto (idempotente: solo si el array está vacío/nulo).
UPDATE public.prescriptores
SET contactos_notificacion = jsonb_build_array(
        jsonb_build_object(
            'nombre', COALESCE(nombre_contacto, ''),
            'tlf',    COALESCE(tlf_contacto, ''),
            'email',  COALESCE(email_contacto, '')
        )
    )
WHERE (contactos_notificacion IS NULL OR contactos_notificacion = '[]'::jsonb)
  AND (COALESCE(nombre_contacto, '') <> ''
       OR COALESCE(tlf_contacto, '') <> ''
       OR COALESCE(email_contacto, '') <> '');

-- Recargar la caché del esquema de PostgREST para que detecte la nueva columna inmediatamente.
NOTIFY pgrst, 'reload schema';
