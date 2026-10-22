-- ============================================================================
-- cartas_pago — la CARTA DE PAGO del Bono CAE (2026-10-22)
-- ----------------------------------------------------------------------------
-- Una por expediente. El número es CP-{AAAA}-{NNNN}, correlativo por AÑO y único,
-- y NO cambia aunque la carta se regenere o se reenvíe (idempotente: la fila del
-- expediente ya existe y se reutiliza su número).
--
-- El PDF vive en Drive («5. FACTURAS» del expediente); aquí solo el enlace, el hash
-- y quién la generó (regla 21: nada de ficheros en la BD). Nunca el IBAN.
--
-- Regla 150: RLS sin policies + GRANT a service_role, en el MISMO script.
-- ============================================================================

create table if not exists public.cartas_pago (
    id              uuid primary key default gen_random_uuid(),
    expediente_id   uuid not null unique references public.expedientes(id) on delete cascade,
    anio            integer not null,
    secuencia       integer not null,
    numero          text not null unique,
    fecha_emision   date not null default (now() at time zone 'Europe/Madrid')::date,
    importe         numeric(12, 2),
    pdf_sha256      text,
    drive_id        text,
    drive_link      text,
    generado_por    text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (anio, secuencia)
);

alter table public.cartas_pago enable row level security;
grant select, insert, update, delete on public.cartas_pago to service_role;

-- El número de la carta de un expediente: el que ya tenga o el siguiente del año.
-- El advisory lock por año serializa a dos que pidan número a la vez (dos clientes
-- del mismo justificante): sin él, los dos leerían el mismo máximo.
create or replace function public.carta_pago_numero(p_expediente_id uuid, p_anio integer)
returns table (numero text, anio integer, secuencia integer, nueva boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.cartas_pago%rowtype;
    v_seq integer;
begin
    select * into v_row from public.cartas_pago c where c.expediente_id = p_expediente_id;
    if found then
        return query select v_row.numero, v_row.anio, v_row.secuencia, false;
        return;
    end if;
    perform pg_advisory_xact_lock(hashtext('cartas_pago'), p_anio);
    select * into v_row from public.cartas_pago c where c.expediente_id = p_expediente_id;
    if found then
        return query select v_row.numero, v_row.anio, v_row.secuencia, false;
        return;
    end if;
    select coalesce(max(c.secuencia), 0) + 1 into v_seq from public.cartas_pago c where c.anio = p_anio;
    insert into public.cartas_pago (expediente_id, anio, secuencia, numero)
    values (p_expediente_id, p_anio, v_seq, format('CP-%s-%s', p_anio, lpad(v_seq::text, 4, '0')))
    returning * into v_row;
    return query select v_row.numero, v_row.anio, v_row.secuencia, true;
end;
$$;

revoke all on function public.carta_pago_numero(uuid, integer) from public, anon, authenticated;
grant execute on function public.carta_pago_numero(uuid, integer) to service_role;

-- Añade UNA incidencia a `documentacion.incidencias[]` sin leer y reescribir la
-- documentación entera (regla de las escrituras atómicas): la carta que no pasa el
-- control de calidad la deja dicha en el expediente.
create or replace function public.expediente_incidencia_append(p_expediente_id uuid, p_incidencia jsonb)
returns void
language sql
security definer
set search_path = public
as $$
    update public.expedientes
    set documentacion = jsonb_set(
            coalesce(documentacion, '{}'::jsonb), '{incidencias}',
            coalesce(documentacion -> 'incidencias', '[]'::jsonb) || jsonb_build_array(p_incidencia)),
        updated_at = now()
    where id = p_expediente_id;
$$;

revoke all on function public.expediente_incidencia_append(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.expediente_incidencia_append(uuid, jsonb) to service_role;
