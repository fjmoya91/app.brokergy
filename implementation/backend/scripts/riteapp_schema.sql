-- =====================================================================
-- App RITE (rite.brokergy.es) — «RITE by BROKERGY»
-- La memoria técnica RITE SUELTA que hace un instalador sin pasar por el CAE.
-- Patrón: certapp_schema.sql (cuentas, obras, movimientos de crédito).
--
-- Tablas: riteapp_cuentas (la empresa instaladora), riteapp_memorias (cada
-- memoria, {AAAA}RIT_{n}) y riteapp_movimientos (créditos).
-- Regla 150: RLS sin policies + GRANT a service_role + REVOKE a anon/authenticated.
--
-- Aplicar en Supabase (editor SQL) SOLO con el «sí» de Fran. Idempotente.
-- Fecha: 2026-11-25. NO APLICADO TODAVÍA.
-- =====================================================================

-- ── Cuentas: la EMPRESA INSTALADORA que firma la memoria ──────────────
create table if not exists public.riteapp_cuentas (
    id                      uuid primary key default gen_random_uuid(),
    auth_user_id            uuid unique,                 -- auth.users.id (Supabase Auth)
    email                   text not null,
    nombre                  text,                        -- persona de contacto
    apellidos               text,
    nif                     text,
    telefono                text,                        -- WhatsApp para los avisos
    -- La empresa habilitada: va en la memoria y en el certificado
    empresa                 text,
    empresa_nif             text,
    es_autonomo             boolean not null default false,
    numero_empresa_rite     text,                        -- nº de empresa instaladora (REI / Industria)
    direccion               text,
    municipio               text,
    provincia               text,
    codigo_postal           text,
    -- Quien firma en nombre de la empresa (el representante)
    representante_nombre    text,
    representante_apellidos text,
    representante_nif       text,
    representante_cargo     text,
    -- Técnico habilitado distinto del representante (como en prescriptores)
    tecnico_firmante_distinto   boolean not null default false,
    tecnico_firmante_nombre     text,
    tecnico_firmante_apellidos  text,
    tecnico_firmante_dni        text,
    tecnico_firmante_carnet_rite text,
    -- Si ya es partner de BROKERGY: su ficha (para rellenar y para la comisión)
    prescriptor_id          uuid references public.prescriptores(id_empresa) on delete set null,
    estado                  text not null default 'ACTIVA' check (estado in ('PENDIENTE', 'ACTIVA', 'BLOQUEADA')),
    creditos                integer not null default 0 check (creditos >= 0),
    creditos_usados         integer not null default 0,
    drive_folder_id         text,
    prefs                   jsonb not null default '{}'::jsonb,
    ultimo_acceso_at        timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);
create unique index if not exists uq_riteapp_cuentas_email on public.riteapp_cuentas (lower(email));
comment on table public.riteapp_cuentas is
  'App RITE (rite.brokergy.es): una fila por empresa instaladora externa. No es un usuario del CRM.';

-- ── Memorias ──────────────────────────────────────────────────────────
create table if not exists public.riteapp_memorias (
    id                  uuid primary key default gen_random_uuid(),
    numero              text unique,                     -- {AAAA}RIT_{n}, lo pone el trigger
    anio                integer,
    correlativo         integer,
    cuenta_id           uuid not null references public.riteapp_cuentas(id) on delete restrict,
    nombre              text,                            -- titular o dirección corta, para listar
    -- Todo lo de la memoria (forma: services/riteapp/payload.js):
    -- { titular, vivienda, instalacion, fechas, estancias: { modo, w_elemento, plantas } }
    datos               jsonb not null default '{}'::jsonb,
    -- BORRADOR (rellenando) · GENERADA (hay ficheros) · FIRMADA · PRESENTADA · ANULADA
    estado              text not null default 'BORRADOR'
                        check (estado in ('BORRADOR', 'GENERADA', 'FIRMADA', 'PRESENTADA', 'ANULADA')),
    ref_catastral       text,
    provincia           text,
    municipio           text,
    -- Generar la primera vez gasta 1 crédito; volver a generar la MISMA, no.
    credito_consumido   boolean not null default false,
    credito_consumido_at timestamptz,
    generada_at         timestamptz,
    generaciones        integer not null default 0,
    -- Ficheros en Drive: { memoria_docx, memoria_pdf, borrador_cert, guia_je6, firmada } → { id, nombre, at }
    ficheros            jsonb not null default '{}'::jsonb,
    drive_folder_id     text,
    -- «Que la presente BROKERGY»: el CIT que nace en el CRM (informes, línea CIT)
    informe_id          uuid references public.informes(id) on delete set null,
    historial           jsonb not null default '[]'::jsonb,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists idx_riteapp_memorias_cuenta on public.riteapp_memorias (cuenta_id, created_at desc);
comment on table public.riteapp_memorias is
  'App RITE: una memoria técnica RITE suelta ({AAAA}RIT_{n}) de una empresa instaladora externa.';

create or replace function public.riteapp_memoria_numerar()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
    if new.numero is null then
        new.anio := coalesce(new.anio, extract(year from now())::int);
        perform pg_advisory_xact_lock(hashtext('riteapp_memorias_' || new.anio::text));
        select coalesce(max(correlativo), 0) + 1 into new.correlativo
          from public.riteapp_memorias where anio = new.anio;
        new.numero := new.anio::text || 'RIT_' || new.correlativo::text;
    end if;
    return new;
end;
$$;
drop trigger if exists trg_riteapp_memoria_numerar on public.riteapp_memorias;
create trigger trg_riteapp_memoria_numerar before insert on public.riteapp_memorias
    for each row execute function public.riteapp_memoria_numerar();

-- ── Movimientos de crédito ───────────────────────────────────────────
create table if not exists public.riteapp_movimientos (
    id             bigint generated always as identity primary key,
    created_at     timestamptz not null default now(),
    cuenta_id      uuid not null references public.riteapp_cuentas(id) on delete cascade,
    memoria_id     uuid references public.riteapp_memorias(id) on delete set null,
    tipo           text not null check (tipo in ('ALTA', 'COMPRA', 'GASTO', 'DEVOLUCION', 'AJUSTE')),
    creditos       integer not null,
    saldo_despues  integer not null,
    importe_eur    numeric(10,2),
    concepto       text,
    por            text,
    factura_id     text
);
create index if not exists idx_riteapp_movimientos_cuenta on public.riteapp_movimientos (cuenta_id, created_at desc, id desc);

-- Gasta 1 crédito al GENERAR una memoria por primera vez. Devuelve el saldo,
-- -1 si no hay crédito, -2 si esa memoria ya lo gastó (regenerar es gratis).
create or replace function public.riteapp_consumir_credito_memoria(p_memoria_id uuid)
returns integer language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_cuenta uuid;
    v_quedan integer;
begin
    select cuenta_id into v_cuenta from public.riteapp_memorias
    where id = p_memoria_id and not credito_consumido
    for update;
    if not found then return -2; end if;

    update public.riteapp_cuentas
    set creditos = creditos - 1, creditos_usados = creditos_usados + 1
    where id = v_cuenta and creditos > 0
    returning creditos into v_quedan;
    if v_quedan is null then return -1; end if;

    update public.riteapp_memorias
    set credito_consumido = true, credito_consumido_at = now()
    where id = p_memoria_id;

    insert into public.riteapp_movimientos (cuenta_id, memoria_id, tipo, creditos, saldo_despues, concepto, por)
    values (v_cuenta, p_memoria_id, 'GASTO', -1, v_quedan, 'Memoria RITE generada', 'instalador');
    return v_quedan;
end;
$$;

-- ── Seguridad (regla 150) ────────────────────────────────────────────
alter table public.riteapp_cuentas     enable row level security;
alter table public.riteapp_memorias    enable row level security;
alter table public.riteapp_movimientos enable row level security;
revoke all on public.riteapp_cuentas     from anon, authenticated;
revoke all on public.riteapp_memorias    from anon, authenticated;
revoke all on public.riteapp_movimientos from anon, authenticated;
grant select, insert, update, delete on public.riteapp_cuentas     to service_role;
grant select, insert, update, delete on public.riteapp_memorias    to service_role;
grant select, insert, update, delete on public.riteapp_movimientos to service_role;
grant usage, select on sequence public.riteapp_movimientos_id_seq to service_role;
revoke all on sequence public.riteapp_movimientos_id_seq from anon, authenticated;
revoke all on function public.riteapp_consumir_credito_memoria(uuid) from public, anon, authenticated;
grant execute on function public.riteapp_consumir_credito_memoria(uuid) to service_role;
