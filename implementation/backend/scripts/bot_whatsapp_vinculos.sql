-- =====================================================================
-- Vínculo CHAT DE WHATSAPP ↔ EXPEDIENTE.
--
-- El bot resuelve quién escribe por el teléfono, y eso basta para el 85 % de
-- los casos (medido 2026-08-25: 219 de 257 teléfonos con expedientes vivos
-- resuelven a UNO solo). Falla justo con quien más escribe: un instalador puede
-- tener 38 obras vivas en el mismo chat, y ahí el teléfono no dice de cuál
-- habla.
--
-- Esta tabla guarda la respuesta a esa pregunta, de tres procedencias:
--
--   · 'manual'       — lo ha fijado una persona desde la ficha del expediente.
--                      MANDA SIEMPRE sobre lo demás: es una decisión tomada.
--   · 'conversacion' — el propio cliente ha dicho de qué obra habla ("la de
--                      Tomelloso"). Vale para el rato siguiente, no para
--                      siempre: mañana puede escribir por otra.
--   · 'envio'        — le hemos escrito nosotros desde ese expediente. Es la
--                      pista más débil y también la más abundante: cada aviso
--                      que ya se manda enseña algo sin que nadie haga nada.
--
-- Por qué una tabla y no un campo en `expedientes`: la relación es N:M en los
-- dos sentidos. Un chat habla de varias obras (el instalador) y una obra puede
-- tener dos chats (el titular y su hijo, o el cliente y el instalador). Un
-- campo obligaría a elegir uno y perder el resto.
-- =====================================================================

create table if not exists public.whatsapp_chat_expediente (
    id              bigserial primary key,

    chat_id         text        not null,          -- '34612345678@c.us'
    oportunidad_id  uuid        not null,          -- la oportunidad manda: el
                                                   -- expediente puede no existir
                                                   -- todavía (propuesta sin aceptar)

    origen          text        not null default 'envio',   -- manual | conversacion | envio
    -- Fijado a mano. Inmune a la caducidad y gana a cualquier otra pista: si
    -- alguien se ha molestado en decir cuál es, no se le lleva la contraria.
    fijado          boolean     not null default false,
    nota            text,                          -- por qué se fijó, quién

    -- Última vez que esta pareja dio señales de vida. Es lo que decide entre
    -- dos vínculos de la misma procedencia.
    visto_at        timestamptz not null default now(),
    veces           integer     not null default 1,

    created_at      timestamptz not null default now(),

    unique (chat_id, oportunidad_id)
);

comment on table public.whatsapp_chat_expediente is
  'Qué expediente corresponde a cada chat de WhatsApp. Lo usa el bot para no preguntar de qué obra se trata cuando ya lo sabe.';

-- La consulta caliente: "dame los vínculos de este chat, el más reciente primero".
create index if not exists idx_wa_vinculo_chat
    on public.whatsapp_chat_expediente (chat_id, fijado desc, visto_at desc);

-- La inversa, para la ficha del expediente ("¿qué chats hablan de esta obra?").
create index if not exists idx_wa_vinculo_opp
    on public.whatsapp_chat_expediente (oportunidad_id);

-- Alta o refresco en una sola operación. El UPSERT es lo que permite llamar a
-- esto desde cualquier envío sin comprobar antes si ya existe.
--
-- REGLA — un vínculo FIJADO no lo degrada nada automático. Si una persona lo
-- fijó, un aviso enviado desde otro expediente no puede quitarle la marca ni
-- cambiarle la procedencia; solo se le refresca la fecha si es el mismo par.
create or replace function public.wa_vinculo_touch(
    p_chat text,
    p_opp uuid,
    p_origen text default 'envio',
    p_fijado boolean default false,
    p_nota text default null
) returns void
language sql
as $$
  insert into public.whatsapp_chat_expediente (chat_id, oportunidad_id, origen, fijado, nota)
  values (p_chat, p_opp, coalesce(p_origen, 'envio'), coalesce(p_fijado, false), p_nota)
  on conflict (chat_id, oportunidad_id) do update
  set visto_at = now(),
      veces    = public.whatsapp_chat_expediente.veces + 1,
      -- 'manual' solo se pisa con otro 'manual'; el resto no degrada.
      origen   = case
                   when excluded.fijado then excluded.origen
                   when public.whatsapp_chat_expediente.fijado then public.whatsapp_chat_expediente.origen
                   else excluded.origen
                 end,
      fijado   = public.whatsapp_chat_expediente.fijado or excluded.fijado,
      nota     = coalesce(excluded.nota, public.whatsapp_chat_expediente.nota);
$$;

-- RLS deny-all + RPC cerrada: solo el backend (service_role).
alter table public.whatsapp_chat_expediente enable row level security;

revoke all on public.whatsapp_chat_expediente from anon, authenticated;
grant all on public.whatsapp_chat_expediente to service_role;
grant usage, select on sequence public.whatsapp_chat_expediente_id_seq to service_role;
revoke all on sequence public.whatsapp_chat_expediente_id_seq from anon, authenticated;

revoke execute on function public.wa_vinculo_touch(text, uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.wa_vinculo_touch(text, uuid, text, boolean, text) to service_role;
