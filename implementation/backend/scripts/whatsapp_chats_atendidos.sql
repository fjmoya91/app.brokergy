-- =====================================================================
-- Chats de WhatsApp marcados «Ya está» en la bandeja de SIN CONTESTAR.
--
-- La bandeja (services/whatsappBandeja.js) lista los chats cuyo último mensaje
-- es del otro y lleva horas sin respuesta. A veces ya se le ha contestado por
-- otra vía (una llamada, en persona) o no pide respuesta («ok, gracias»): «Ya
-- está» lo quita PARA TODO EL EQUIPO, pero solo hasta su siguiente mensaje —
-- se guarda la hora del último mensaje visto (`hasta_t`) y uno posterior lo
-- vuelve a sacar.
--
-- `clave` = el teléfono en 9 dígitos (o el id del chat si WhatsApp no da el número).
--
-- Aplicado en producción (okfeopwetlxdffrsbfqw) el 13/10/2026.
-- =====================================================================

create table if not exists public.whatsapp_chats_atendidos (
    clave          text        primary key,
    hasta_t        bigint      not null,          -- epoch (s) del último mensaje visto
    atendido_por   text,
    updated_at     timestamptz not null default now()
);

comment on table public.whatsapp_chats_atendidos is
  'Chats de WhatsApp que el equipo ha dado por atendidos en la bandeja de sin contestar, hasta su siguiente mensaje.';

alter table public.whatsapp_chats_atendidos enable row level security;
grant select, insert, update, delete on table public.whatsapp_chats_atendidos to service_role;
-- Los default privileges de Supabase se la conceden a anon/authenticated (TRUNCATE incluido).
revoke all on table public.whatsapp_chats_atendidos from anon, authenticated;
