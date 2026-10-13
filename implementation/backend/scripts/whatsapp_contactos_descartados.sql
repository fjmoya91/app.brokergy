-- =====================================================================
-- Contactos de WhatsApp DESCARTADOS de «Pendientes de alta».
--
-- La lista de Clientes → «Pendientes de WhatsApp» propone los contactos
-- guardados con prefijo de obra («RES080 Jesús Quero») cuyo número no está
-- en ninguna ficha. Muchos son leads que no siguieron (medido el 13/10/2026:
-- 82 pendientes, 28 sin una sola conversación). Descartarlo lo quita de la
-- lista PARA TODO EL EQUIPO; por eso va en la BD y no en el navegador.
--
-- Es una decisión reversible: «Recuperar» borra la fila. No toca la agenda
-- de WhatsApp ni ninguna ficha.
--
-- La clave es el teléfono en 9 dígitos (como se casa con las fichas): el
-- mismo número guardado otra vez con otro nombre sigue descartado.
-- =====================================================================

create table if not exists public.whatsapp_contactos_descartados (
    telefono        text        primary key,       -- 9 últimos dígitos
    nombre_agenda   text,                          -- cómo estaba guardado al descartarlo
    descartado_por  text,                          -- email de quien lo descartó
    created_at      timestamptz not null default now(),

    constraint wa_descartados_telefono_9 check (telefono ~ '^[0-9]{9}$')
);

comment on table public.whatsapp_contactos_descartados is
  'Contactos de la agenda de WhatsApp que el equipo ha descartado de «Pendientes de alta». Reversible.';

-- RLS deny-all (el frontend no hace ningún .from(): todo pasa por el backend).
alter table public.whatsapp_contactos_descartados enable row level security;

-- Desde el 30/10/2026 una tabla nueva nace sin grants: sin esto el backend
-- (service_role, vía PostgREST) recibe "permission denied".
grant select, insert, update, delete on table public.whatsapp_contactos_descartados to service_role;

-- Y los default privileges de Supabase se la conceden ENTERA a anon y
-- authenticated (TRUNCATE incluido, que el RLS no frena). Solo la usa el backend.
revoke all on table public.whatsapp_contactos_descartados from anon, authenticated;

-- Aplicado en producción (okfeopwetlxdffrsbfqw) el 13/10/2026.
