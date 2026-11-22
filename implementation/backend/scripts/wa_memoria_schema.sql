-- =============================================================================
-- wa_memoria — la MEMORIA de cada chat de WhatsApp (22/11/2026)
-- services/memoriaWhatsapp.js + utils/memoriaWhatsapp.js
--
-- UNA fila por teléfono (los 9 dígitos finales) con unos pocos HECHOS cortos y fechados que el
-- contestador lee al contestar: quién escribe y cómo llamarle, lo hablado por teléfono, lo que
-- decidió Fran, lo que dijo el cliente que pesa más allá de 10 días, lo que le prometimos.
--   hechos = [{ "f": "2026-11-22", "t": "Escribe Paqui, no Carolina.", "o": "26RES080_57", "p": "contestador" }]
-- Los límites los pone el código (15 hechos, 200 caracteres, 120 días, sin IBAN/DNI/teléfonos) y
-- este CHECK los asegura aunque alguien escriba a mano: la ficha nunca pasa de 8 KB.
-- Se lee SIEMPRE por la clave (una fila por respuesta), nunca la tabla entera.
--
-- Regla 150: RLS sin policies y GRANT solo a service_role, en el MISMO script.
-- =============================================================================

create table if not exists public.wa_memoria (
    tel9        text primary key check (tel9 ~ '^[0-9]{9}$'),
    hechos      jsonb not null default '[]'::jsonb
                check (jsonb_typeof(hechos) = 'array' and pg_column_size(hechos) < 8192),
    updated_at  timestamptz not null default now()
);

alter table public.wa_memoria enable row level security;
revoke all on public.wa_memoria from anon, authenticated;
grant select, insert, update, delete on public.wa_memoria to service_role;
