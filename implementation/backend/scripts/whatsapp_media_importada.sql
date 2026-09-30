-- =====================================================================
-- Fotos del WHATSAPP ya colocadas en un expediente.
--
-- Muchos clientes no usan el enlace de subida: mandan las fotos al WhatsApp
-- de la empresa. El botón «Traer del WhatsApp» del gestor de documentación
-- lista lo que ha llegado por el chat, lo baja y lo pasa al repartidor.
--
-- Esta tabla recuerda qué mensajes se han colocado ya y en qué apartado. Sin
-- ella, cada vez que se abre la lista salen otra vez las mismas veinte fotos y
-- se acaban subiendo dos veces.
--
-- Por qué una tabla y no una marca en `reforma_uploads`: la subida renombra el
-- fichero (`FOTO_CALDERA_ANTES_2.jpg`) y la entrada del slot no sabe de qué
-- mensaje salió. Y la misma foto de un INSTALADOR puede ser de otra obra: la
-- marca tiene que poder leerse desde cualquier oportunidad ("ya colocada en
-- 26RES060_190"), que en un JSONB de cada oportunidad no se puede.
--
-- Es una PISTA, no un candado: una foto marcada se puede volver a traer.
-- =====================================================================

create table if not exists public.whatsapp_media_importada (
    id              bigserial primary key,

    wa_msg_id       text        not null,          -- 'false_34612345678@c.us_3EB0…'
    chat_id         text,                          -- del que se sacó
    oportunidad_id  uuid        not null,          -- dónde se colocó
    slot            text,                          -- en qué apartado
    tipo            text,                          -- image | video | document
    wa_at           timestamptz,                   -- cuándo llegó al chat
    importado_por   text,                          -- quién la colocó

    created_at      timestamptz not null default now(),

    unique (oportunidad_id, wa_msg_id)
);

comment on table public.whatsapp_media_importada is
  'Fotos llegadas por WhatsApp que ya se han colocado en un apartado de documentación. Evita traerlas dos veces.';

-- La consulta caliente: "¿alguna de estas fotos está ya colocada, y dónde?".
create index if not exists idx_wa_media_msg
    on public.whatsapp_media_importada (wa_msg_id);

-- RLS deny-all (el frontend no hace ningún .from(): todo pasa por el backend).
alter table public.whatsapp_media_importada enable row level security;

-- Desde el 30/10/2026 una tabla nueva nace sin grants: sin esto el backend
-- (service_role, vía PostgREST) recibe "permission denied".
grant select, insert, update, delete on table public.whatsapp_media_importada to service_role;
grant usage, select on sequence public.whatsapp_media_importada_id_seq to service_role;
