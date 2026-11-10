-- =============================================================================
-- wa_contestador — el CONTESTADOR de WhatsApp (fase 2 del agente autónomo, 10/11/2026)
-- services/contestadorWhatsapp.js
--
-- Una fila por «turno» de un chat: nace PENDIENTE con el primer mensaje suyo,
-- cada mensaje nuevo empuja `responder_after` (15 min de silencio, o las 7:00 si es
-- de noche) y la vuelta la cierra: HECHA (con su accion), DESCARTADA (ya contestado,
-- lo lleva una persona, no es nuestro) o ERROR (tres fallos de lectura).
-- `texto` es lo que se le contestó o se le habría contestado (modo copia); `detalle`
-- es pequeño (rol, obras, enlaces usados): NUNCA la conversación ni adjuntos (regla 21).
-- Se purga a los 90 días.
--
-- Regla 150: RLS sin policies y GRANT solo a service_role, en el MISMO script.
-- =============================================================================

create table if not exists public.wa_contestador (
    id              bigserial primary key,
    chat_id         text not null,                 -- «34…@c.us» o «…@lid»
    tel9            text,
    nombre          text,
    estado          text not null default 'PENDIENTE'
                    check (estado in ('PENDIENTE', 'HECHA', 'DESCARTADA', 'ERROR')),
    primero_at      timestamptz not null default now(),
    ultimo_at       timestamptz not null default now(),
    responder_after timestamptz not null,
    mensajes        integer not null default 1,
    ultimo_msg_id   text,
    accion          text check (accion in ('RESPONDER', 'ESCALAR', 'CALLAR')),
    motivo          text,
    obra            text,
    texto           text,
    acuse           text,
    modo            text,                          -- copia · real
    cerebro         text,
    enviado_at      timestamptz,
    copia_at        timestamptz,
    intentos        integer not null default 0,
    error           text,
    detalle         jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Una sola abierta por chat (la ráfaga entera es UN turno).
create unique index if not exists wa_contestador_una_pendiente on public.wa_contestador (chat_id) where estado = 'PENDIENTE';
create index if not exists wa_contestador_cola on public.wa_contestador (estado, responder_after);
create index if not exists wa_contestador_actualizado on public.wa_contestador (updated_at);
create index if not exists wa_contestador_enviado on public.wa_contestador (enviado_at) where enviado_at is not null;

alter table public.wa_contestador enable row level security;
revoke all on public.wa_contestador from anon, authenticated;
grant select, insert, update, delete on public.wa_contestador to service_role;
revoke all on sequence public.wa_contestador_id_seq from anon, authenticated;
grant usage, select on sequence public.wa_contestador_id_seq to service_role;
