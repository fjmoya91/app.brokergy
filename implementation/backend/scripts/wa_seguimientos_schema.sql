-- =============================================================================
-- wa_seguimientos — el SEGUIMIENTO por WhatsApp de lo que no puede quedarse
-- pendiente (agente autónomo, fase 4, 15/11/2026). services/seguimientoWhatsapp.js
--
-- Una fila por OBRA y TIPO mientras está abierta:
--   · PROPUESTA   — una simulación ENVIADA (o PRE-ACEPTADO): ¿la ha visto?, ¿sigue
--                   adelante? Hasta que se acepta o se cierra.
--   · CEE_INICIAL — aceptada, CEE inicial sin encargar y sin el material: lo que
--                   falta, recordado con calma hasta que llega.
-- `fase` es el próximo toque y `proximo_at` cuándo; la cadencia está en
-- utils/seguimientoPasos.js. Una respuesta la pasa a CONTESTADO (el listener de la
-- sesión, al momento) y el contestador dice qué ha contestado (`resultado`).
-- `detalle` y `acciones` son pequeños: NUNCA conversaciones ni ficheros (regla 21).
--
-- Regla 150: RLS sin policies y GRANT solo a service_role, en el MISMO script.
-- =============================================================================

create table if not exists public.wa_seguimientos (
    id              bigserial primary key,
    tipo            varchar(20) not null check (tipo in ('PROPUESTA', 'CEE_INICIAL')),

    -- De qué obra. `numero` es el visible (26RES060_OP411 o 26RES060_247).
    oportunidad_id  uuid not null,
    expediente_id   uuid,
    numero          text not null,
    cliente         text,                       -- titular, para el texto al instalador
    municipio       text,

    -- A quién se le escribe (9 últimas cifras) y quién es; `partner_id` agrupa al instalador.
    destino         varchar(20) not null check (destino in ('CLIENTE', 'CONTACTO', 'INSTALADOR')),
    tel9            varchar(9),
    nombre          text,
    partner_id      uuid,

    estado          varchar(20) not null default 'ABIERTO' check (estado in ('ABIERTO', 'CONTESTADO', 'CERRADO')),
    fase            varchar(20),                -- el PRÓXIMO toque (PRIMERO, SEGUNDO, R1…)
    toques          integer not null default 0, -- mandados (o copiados, en modo copia)
    base_at         timestamptz,                -- envío de la propuesta / pedido del material
    ultimo_toque_at timestamptz,
    proximo_at      timestamptz,
    contestado_at   timestamptz,
    respuesta       text,                       -- lo que contestó, en una línea
    resultado       varchar(30),                -- SIGUE · NO_SIGUE · PENSANDO · MAS_ADELANTE · SIN_RESPUESTA · ACEPTADA · MATERIAL_COMPLETO…
    cerrado_at      timestamptz,
    detalle         jsonb not null default '{}'::jsonb,
    acciones        jsonb not null default '[]'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Una sola viva por obra y tipo.
create unique index if not exists wa_seguimientos_uno_vivo on public.wa_seguimientos (tipo, oportunidad_id) where estado <> 'CERRADO';
create index if not exists wa_seguimientos_cola on public.wa_seguimientos (estado, proximo_at);
create index if not exists wa_seguimientos_tel on public.wa_seguimientos (tel9) where estado <> 'CERRADO';
create index if not exists wa_seguimientos_toque on public.wa_seguimientos (ultimo_toque_at) where ultimo_toque_at is not null;
create index if not exists wa_seguimientos_cerrado on public.wa_seguimientos (cerrado_at) where cerrado_at is not null;

alter table public.wa_seguimientos enable row level security;
revoke all on public.wa_seguimientos from anon, authenticated;
grant select, insert, update, delete on public.wa_seguimientos to service_role;
revoke all on sequence public.wa_seguimientos_id_seq from anon, authenticated;
grant usage, select on sequence public.wa_seguimientos_id_seq to service_role;
