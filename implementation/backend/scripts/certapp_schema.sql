-- =====================================================================
-- APP DE CERTIFICADORES (cee.brokergy.es) — esquema
--
-- Una app aparte del CRM, para certificadores energéticos EXTERNOS que
-- pagan por usarla: dan de alta sus obras (un CEE suelto cada una), rellenan
-- el cuestionario de la vivienda y piden que la IA les prepare el CEE inicial
-- con las MISMAS skills y la MISMA envolvente que usa BROKERGY.
--
-- REGLA — nada de esto vive en las tablas del CRM. Un certificador externo NO
-- es un `usuarios` (no entra en app.brokergy.es) ni sus obras son
-- `cee_directos` (esa tabla dispara avisos al cliente, entrega automática,
-- radar del parte y facturación de BROKERGY). Sus obras son `certapp_obras`
-- con la MISMA forma que `cee_directos` en lo que leen la envolvente y el
-- generador (origen 'ext' en ceeEnvolventeCex / cee_inicial.js).
--
-- REGLA — RLS sin políticas y solo service_role (regla 150): el navegador no
-- toca estas tablas; todo pasa por el backend, que filtra por la cuenta.
--
-- REGLA — el crédito va LIGADO A LA OBRA (`certapp_obras.credito_consumido`):
-- se gasta y se devuelve SOLO con certapp_consumir_credito_obra /
-- certapp_devolver_credito_obra, que cambian la marca y el saldo en la misma
-- transacción (una obra no gasta dos créditos ni se le devuelven dos).
--
-- REGLA — una solicitud de la beta que ya existe NO se pisa (certapp_beta_apuntar):
-- solo se rellenan sus campos vacíos; lo demás va a `respuestas.revisiones`.
--
-- Aplicar en Supabase (editor SQL). Idempotente: se puede volver a pasar.
-- Fecha: 2026-10-24 (revisado el mismo día tras la revisión de seguridad)
-- =====================================================================

-- ── Cuentas de certificador ──────────────────────────────────────────
create table if not exists public.certapp_cuentas (
    id                  uuid primary key default gen_random_uuid(),
    auth_user_id        uuid unique,                 -- auth.users.id (Supabase Auth)
    email               text not null,
    nombre              text,
    apellidos           text,
    nif                 text,
    telefono            text,                        -- WhatsApp para los avisos
    empresa             text,
    empresa_nif         text,
    titulacion          text,                        -- arquitecto técnico, ingeniero…
    num_colegiado       text,
    colegio             text,
    provincia           text,
    municipio           text,
    direccion           text,
    codigo_postal       text,
    -- PENDIENTE: creada, aún no ha puesto contraseña · ACTIVA · BLOQUEADA
    estado              text not null default 'PENDIENTE'
                        check (estado in ('PENDIENTE', 'ACTIVA', 'BLOQUEADA')),
    -- Beta: certificados que puede pedir a la IA. Pedir uno descuenta (y marca
    -- la obra); si no llega a entregarse, se devuelve (certapp_devolver_credito_obra).
    creditos            integer not null default 0 check (creditos >= 0),
    creditos_usados     integer not null default 0,
    -- Su carpeta de Drive (compartida SOLO con su email); dentro, una por obra.
    drive_folder_id     text,
    drive_folder_link   text,
    beta_solicitud_id   uuid,
    prefs               jsonb not null default '{}'::jsonb,
    ultimo_acceso_at    timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create unique index if not exists uq_certapp_cuentas_email on public.certapp_cuentas (lower(email));

comment on table public.certapp_cuentas is
  'App de certificadores (cee.brokergy.es): una fila por certificador externo. No es un usuario del CRM.';

-- ── Lista de espera de la beta ───────────────────────────────────────
create table if not exists public.certapp_beta_solicitudes (
    id                      uuid primary key default gen_random_uuid(),
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    nombre                  text not null,
    email                   text not null,
    telefono                text,
    provincia               text,
    -- AUTONOMO: certifica él · EMPRESA_PROPIA: empresa con técnicos en plantilla
    -- EMPRESA_SUBCONTRATA: empresa que encarga los CEE a otros (tipo Fessa)
    perfil                  text check (perfil in ('AUTONOMO', 'EMPRESA_PROPIA', 'EMPRESA_SUBCONTRATA', 'OTRO')),
    empresa                 text,
    cee_mes                 text,                    -- rango: 1-5 · 6-15 · 16-40 · 40+
    minutos_cee             text,                    -- lo que tarda en hacer un CEE (sin la visita)
    minutos_presentar       text,                    -- lo que tarda en presentarlo en el registro
    interes_ia_presentar    text,                    -- SI · QUIZA · NO
    coste_subcontrata_eur   numeric(8,2),            -- lo que paga por CEE si subcontrata
    software                text[],
    comunidades             text[],
    comentarios             text,
    -- El formulario entero tal cual llegó: las preguntas cambiarán en la beta.
    respuestas              jsonb not null default '{}'::jsonb,
    consentimiento_at       timestamptz not null,
    acepta_comunicaciones   boolean not null default false,
    origen                  text,                    -- landing · enlace directo · campaña
    utm                     jsonb,
    ip_hash                 text,
    user_agent              text,
    -- NUEVA → CONTACTADA → INVITADA (ya tiene cuenta) · DESCARTADA
    estado                  text not null default 'NUEVA'
                            check (estado in ('NUEVA', 'CONTACTADA', 'INVITADA', 'DESCARTADA')),
    cuenta_id               uuid references public.certapp_cuentas(id) on delete set null,
    notas                   text
);

-- Un email, una solicitud: apuntarse dos veces NO pisa la que hay
-- (certapp_beta_apuntar: rellena lo vacío y guarda el resto como revisión).
create unique index if not exists uq_certapp_beta_email on public.certapp_beta_solicitudes (lower(email));
create index if not exists idx_certapp_beta_created on public.certapp_beta_solicitudes (created_at desc);

-- ── Obras (un CEE suelto cada una) ───────────────────────────────────
create sequence if not exists public.certapp_obras_correlativo_seq;

create table if not exists public.certapp_obras (
    id                  uuid primary key default gen_random_uuid(),
    -- {AAAA}EXT_{n}: correlativo GLOBAL de la app, como {AAAA}CEE_{n} en los CEE
    -- directos. Lo pone el trigger; el generador reconoce el origen por el formato.
    numero_expediente   text unique,
    anio                integer,
    correlativo         integer,
    nombre              text,                        -- titular o dirección corta, para listar
    alcance             text not null default 'UNICO' check (alcance in ('UNICO')),
    cuenta_id           uuid not null references public.certapp_cuentas(id) on delete restrict,

    -- El TITULAR del certificado (el cliente del certificador, no de BROKERGY):
    -- { nombre, apellidos, nif, email, telefono, direccion, municipio,
    --   provincia, codigo_postal, es_empresa, representante }
    titular             jsonb not null default '{}'::jsonb,

    -- El inmueble (mismas columnas que cee_directos)
    direccion           text,
    ref_catastral       text,
    ccaa                text,
    provincia           text,
    municipio           text,
    codigo_postal       text,
    zona_climatica      text,
    altitud             numeric,
    lat                 double precision,
    lng                 double precision,
    superficie_catastro numeric,
    anio_construccion   integer,
    uso                 text,
    -- Resumen pequeño de lo que dijo el Catastro (nada de geometrías enteras)
    catastro            jsonb,

    -- El cuestionario de la app (fuente: frontend/src/certificadores/logic/cuestionario.js)
    en_vivienda         boolean,                     -- ¿el certificador está en la casa?
    proposito           text,                        -- COMPRAVENTA · ALQUILER · IRPF_PLACAS · IRPF_AEROTERMIA · IRPF_REFORMA · AYUDAS · OTRO
    cuestionario        jsonb not null default '{}'::jsonb,

    -- BORRADOR → EN_PREPARACION (pedido a la IA) → LISTO (entregado al
    -- certificador) → VALIDADO (lo dio por bueno) · ARCHIVADA
    estado              text not null default 'BORRADOR'
                        check (estado in ('BORRADOR', 'EN_PREPARACION', 'LISTO', 'VALIDADO', 'ARCHIVADA')),

    -- Los mismos JSONB que cee_directos: aquí escriben la envolvente y la skill
    cee                 jsonb not null default '{}'::jsonb,
    seguimiento         jsonb not null default '{}'::jsonb,
    documentacion       jsonb not null default '{}'::jsonb,

    drive_folder_id     text,
    drive_folder_link   text,
    -- Enlace para que el propietario suba fotos sin cuenta (vista CLIENTE).
    -- Caduca a los CERTAPP_PORTAL_DIAS (30) desde `portal_token_at`; se rota.
    portal_token        text,
    portal_token_at     timestamptz,

    -- El crédito de ESTA obra (solo lo cambian las RPC del crédito)
    credito_consumido     boolean not null default false,
    credito_consumido_at  timestamptz,
    -- Veces que el certificador ha pedido «revisar de nuevo» (máx. CERTAPP_REVISIONES_MAX)
    revisiones          integer not null default 0 check (revisiones >= 0),

    pedido_at           timestamptz,
    listo_at            timestamptz,
    entregado_at        timestamptz,
    validado_at         timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- Si la tabla ya existía de una pasada anterior del script
alter table public.certapp_obras add column if not exists portal_token_at      timestamptz;
alter table public.certapp_obras add column if not exists credito_consumido    boolean not null default false;
alter table public.certapp_obras add column if not exists credito_consumido_at timestamptz;
alter table public.certapp_obras add column if not exists revisiones           integer not null default 0;

create index if not exists idx_certapp_obras_cuenta on public.certapp_obras (cuenta_id, created_at desc);
create index if not exists idx_certapp_obras_estado on public.certapp_obras (estado, updated_at desc);

comment on table public.certapp_obras is
  'App de certificadores: cada obra es un CEE suelto de un certificador externo. Misma forma que cee_directos en lo que leen la envolvente y el generador (origen ext).';

-- Número {AAAA}EXT_{n} al dar de alta (secuencia: dos altas a la vez no chocan)
create or replace function public.certapp_obras_numerar()
returns trigger language plpgsql as $$
begin
    if new.correlativo is null then
        new.correlativo := nextval('public.certapp_obras_correlativo_seq');
    end if;
    if new.anio is null then
        new.anio := extract(year from now())::int;
    end if;
    if new.numero_expediente is null then
        new.numero_expediente := new.anio::text || 'EXT_' || new.correlativo::text;
    end if;
    return new;
end;
$$;

drop trigger if exists certapp_obras_numerar on public.certapp_obras;
create trigger certapp_obras_numerar
    before insert on public.certapp_obras
    for each row execute function public.certapp_obras_numerar();

-- updated_at
create or replace function public.certapp_touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists certapp_obras_touch on public.certapp_obras;
create trigger certapp_obras_touch
    before update on public.certapp_obras
    for each row execute function public.certapp_touch_updated_at();

drop trigger if exists certapp_cuentas_touch on public.certapp_cuentas;
create trigger certapp_cuentas_touch
    before update on public.certapp_cuentas
    for each row execute function public.certapp_touch_updated_at();

drop trigger if exists certapp_beta_touch on public.certapp_beta_solicitudes;
create trigger certapp_beta_touch
    before update on public.certapp_beta_solicitudes
    for each row execute function public.certapp_touch_updated_at();

-- Regla 21: los ficheros van a Drive; en BD solo el enlace o el driveId
create or replace function public.check_certapp_obra_size()
returns trigger language plpgsql as $$
begin
    if pg_column_size(new.documentacion) > 2 * 1024 * 1024 then
        raise exception 'certapp_obras.documentacion supera 2 MB (%). Los ficheros van a Drive; en BD solo el enlace o el driveId.',
            pg_size_pretty(pg_column_size(new.documentacion)::bigint);
    end if;
    if pg_column_size(new.cee) > 4 * 1024 * 1024 then
        raise exception 'certapp_obras.cee supera 4 MB (%). El XML del CEE cabe, un PDF en base64 no.',
            pg_size_pretty(pg_column_size(new.cee)::bigint);
    end if;
    if pg_column_size(new.cuestionario) > 512 * 1024 then
        raise exception 'certapp_obras.cuestionario supera 512 KB (%).',
            pg_size_pretty(pg_column_size(new.cuestionario)::bigint);
    end if;
    return new;
end;
$$;

drop trigger if exists certapp_obras_size_guard on public.certapp_obras;
create trigger certapp_obras_size_guard
    before insert or update on public.certapp_obras
    for each row execute function public.check_certapp_obra_size();

-- ── Escrituras atómicas (regla 19), gemelas de las de cee_directos ───
-- Una clave de `cee` (lo que escriben la envolvente y la skill)
create or replace function public.set_certapp_obra_cee_field(p_obra_id uuid, p_field text, p_value jsonb)
returns void language plpgsql as $$
begin
    update public.certapp_obras
    set cee = jsonb_set(coalesce(cee, '{}'::jsonb), array[p_field], coalesce(p_value, 'null'::jsonb), true)
    where id = p_obra_id;
end;
$$;

-- Una clave de `documentacion` con un valor JSON (fechas, sellos, XML cargado…)
create or replace function public.set_certapp_obra_doc_field(p_obra_id uuid, p_field text, p_value jsonb)
returns void language plpgsql as $$
begin
    update public.certapp_obras
    set documentacion = jsonb_set(coalesce(documentacion, '{}'::jsonb), array[p_field], coalesce(p_value, 'null'::jsonb), true)
    where id = p_obra_id;
end;
$$;

-- MERGE de un objeto dentro de `documentacion`
create or replace function public.merge_certapp_obra_doc_json(p_obra_id uuid, p_field text, p_value jsonb)
returns void language plpgsql as $$
begin
    update public.certapp_obras
    set documentacion = jsonb_set(
            coalesce(documentacion, '{}'::jsonb),
            array[p_field],
            coalesce(documentacion -> p_field, '{}'::jsonb) || coalesce(p_value, '{}'::jsonb),
            true)
    where id = p_obra_id;
end;
$$;

-- Fotos y documentos por apartado (documentacion.reforma_uploads[slot])
create or replace function public.certapp_docs_append(p_id uuid, p_slot text, p_entry jsonb, p_multiple boolean)
returns void language sql as $$
  update public.certapp_obras
  set documentacion = jsonb_set(
        coalesce(documentacion, '{}'::jsonb)
          || jsonb_build_object('reforma_uploads', coalesce(documentacion -> 'reforma_uploads', '{}'::jsonb)),
        array['reforma_uploads', p_slot],
        case when p_multiple
          then coalesce(documentacion -> 'reforma_uploads' -> p_slot, '[]'::jsonb) || jsonb_build_array(p_entry)
          else jsonb_build_array(p_entry)
        end,
        true)
  where id = p_id;
$$;

create or replace function public.certapp_docs_replace_slot(p_id uuid, p_slot text, p_array jsonb)
returns void language sql as $$
  update public.certapp_obras
  set documentacion = jsonb_set(
        coalesce(documentacion, '{}'::jsonb)
          || jsonb_build_object('reforma_uploads', coalesce(documentacion -> 'reforma_uploads', '{}'::jsonb)),
        array['reforma_uploads', p_slot],
        coalesce(p_array, '[]'::jsonb),
        true)
  where id = p_id;
$$;

-- ── Créditos, LIGADOS A LA OBRA (atómico) ────────────────────────────
-- Las versiones por cuenta (sin obra) se retiran: dejaban gastar dos créditos en
-- la misma obra o devolver dos veces el mismo.
drop function if exists public.certapp_consumir_credito(uuid);
drop function if exists public.certapp_devolver_credito(uuid);

-- Gasta el crédito de la obra. Devuelve los que le quedan a la cuenta,
-- -1 si no tenía, o -2 si la obra YA tenía su crédito gastado (no se cobra otra vez).
-- OJO (24/10/2026): al final del script («Mis gastos») se redefinen las dos para
-- que además apunten su fila en certapp_movimientos. La que queda es aquella.
create or replace function public.certapp_consumir_credito_obra(p_obra_id uuid)
returns integer language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_cuenta uuid;
    v_quedan integer;
begin
    -- El FOR UPDATE serializa dos pedidos de la misma obra: el segundo ve la marca.
    select cuenta_id into v_cuenta from public.certapp_obras
    where id = p_obra_id and not credito_consumido
    for update;
    if not found then return -2; end if;

    update public.certapp_cuentas
    set creditos = creditos - 1, creditos_usados = creditos_usados + 1
    where id = v_cuenta and creditos > 0
    returning creditos into v_quedan;
    if v_quedan is null then return -1; end if;

    update public.certapp_obras
    set credito_consumido = true, credito_consumido_at = now()
    where id = p_obra_id;
    return v_quedan;
end;
$$;

-- Devuelve el crédito de la obra: quita la marca, suma el crédito a la cuenta,
-- vuelve la obra a BORRADOR si seguía EN_PREPARACION y apunta CREDITO_DEVUELTO.
-- Devuelve los créditos que quedan, o -2 si la obra no tenía crédito gastado
-- (nunca lo gastó o ya se le devolvió: no hay segunda devolución).
create or replace function public.certapp_devolver_credito_obra(
    p_obra_id       uuid,
    p_por           text default 'BROKERGY',
    p_texto         text default null,
    p_por_detalle   text default null,
    p_nota_interna  text default null)
returns integer language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_cuenta uuid;
    v_quedan integer;
begin
    select cuenta_id into v_cuenta from public.certapp_obras
    where id = p_obra_id and credito_consumido
    for update;
    if not found then return -2; end if;

    update public.certapp_obras
    set credito_consumido = false,
        credito_consumido_at = null,
        estado    = case when estado = 'EN_PREPARACION' then 'BORRADOR' else estado end,
        pedido_at = case when estado = 'EN_PREPARACION' then null else pedido_at end
    where id = p_obra_id;

    update public.certapp_cuentas
    set creditos = creditos + 1, creditos_usados = greatest(creditos_usados - 1, 0)
    where id = v_cuenta
    returning creditos into v_quedan;

    insert into public.certapp_eventos (obra_id, cuenta_id, tipo, texto, por, por_detalle, nota_interna)
    values (p_obra_id, v_cuenta, 'CREDITO_DEVUELTO', coalesce(p_texto, 'Crédito devuelto'),
            coalesce(p_por, 'BROKERGY'), p_por_detalle, p_nota_interna);

    return coalesce(v_quedan, -1);
end;
$$;

-- ── Historial de cada obra (qué pasó y cuándo) ───────────────────────
create table if not exists public.certapp_eventos (
    id          bigint generated always as identity primary key,
    obra_id     uuid not null references public.certapp_obras(id) on delete cascade,
    cuenta_id   uuid references public.certapp_cuentas(id) on delete set null,
    created_at  timestamptz not null default now(),
    tipo        text not null,                       -- ALTA · GENERAR · IA_HECHA · ENTREGA · VALIDADO · REVISAR · CREDITO_DEVUELTO …
    texto       text,                                -- lo que ve el certificador
    por         text,                                -- 'certificador' · 'cliente' · 'BROKERGY' · 'IA'
    datos       jsonb,
    -- SOLO para el admin (el certificador nunca los recibe): quién del equipo
    -- actuó y el motivo interno (un error de Drive, por qué se devolvió…)
    por_detalle  text,
    nota_interna text
);

alter table public.certapp_eventos add column if not exists por_detalle  text;
alter table public.certapp_eventos add column if not exists nota_interna text;

create index if not exists idx_certapp_eventos_obra on public.certapp_eventos (obra_id, created_at desc);

-- ── Alta en la lista de espera SIN pisar la que hay ──────────────────
-- p_fila: la fila saneada por el backend (services/certapp/beta.js filaDe).
-- Devuelve true si es una solicitud NUEVA; false si el email ya estaba: entonces
-- solo se rellenan sus campos VACÍOS y lo que llegó se añade a
-- `respuestas.revisiones` (las p_max_revisiones últimas). Nombre, email, estado,
-- cuenta y notas de una solicitud existente no se tocan nunca desde aquí.
create or replace function public.certapp_beta_apuntar(
    p_fila jsonb, p_revision jsonb, p_max_revisiones integer default 10)
returns boolean language plpgsql
set search_path = public, pg_temp
as $$
declare
    r       public.certapp_beta_solicitudes;
    s       public.certapp_beta_solicitudes;
    v_id    uuid;
    v_revs  jsonb;
    v_total integer;
    v_max   integer := greatest(coalesce(p_max_revisiones, 10), 1);
begin
    r := jsonb_populate_record(null::public.certapp_beta_solicitudes, p_fila);
    if coalesce(r.email, '') = '' or coalesce(r.nombre, '') = '' or r.consentimiento_at is null then
        raise exception 'certapp_beta_apuntar: faltan el email, el nombre o el consentimiento';
    end if;

    insert into public.certapp_beta_solicitudes (
        nombre, email, telefono, provincia, perfil, empresa, cee_mes, minutos_cee, minutos_presentar,
        interes_ia_presentar, coste_subcontrata_eur, software, comunidades, comentarios, respuestas,
        consentimiento_at, acepta_comunicaciones, origen, utm, ip_hash, user_agent)
    values (
        r.nombre, lower(r.email), r.telefono, r.provincia, r.perfil, r.empresa, r.cee_mes, r.minutos_cee, r.minutos_presentar,
        r.interes_ia_presentar, r.coste_subcontrata_eur, r.software, r.comunidades, r.comentarios, coalesce(r.respuestas, '{}'::jsonb),
        r.consentimiento_at, coalesce(r.acepta_comunicaciones, false), r.origen, r.utm, r.ip_hash, r.user_agent)
    on conflict ((lower(email))) do nothing
    returning id into v_id;
    if v_id is not null then return true; end if;

    select * into s from public.certapp_beta_solicitudes where lower(email) = lower(r.email) for update;
    if not found then return false; end if;

    v_revs := (case when jsonb_typeof(s.respuestas -> 'revisiones') = 'array' then s.respuestas -> 'revisiones' else '[]'::jsonb end)
              || jsonb_build_array(coalesce(p_revision, '{}'::jsonb));
    v_total := jsonb_array_length(v_revs);
    if v_total > v_max then
        select coalesce(jsonb_agg(t.e order by t.n), '[]'::jsonb) into v_revs
        from jsonb_array_elements(v_revs) with ordinality as t(e, n)
        where t.n > v_total - v_max;
    end if;

    update public.certapp_beta_solicitudes set
        telefono              = coalesce(nullif(telefono, ''), r.telefono),
        provincia             = coalesce(nullif(provincia, ''), r.provincia),
        perfil                = coalesce(perfil, r.perfil),
        empresa               = coalesce(nullif(empresa, ''), r.empresa),
        cee_mes               = coalesce(nullif(cee_mes, ''), r.cee_mes),
        minutos_cee           = coalesce(nullif(minutos_cee, ''), r.minutos_cee),
        minutos_presentar     = coalesce(nullif(minutos_presentar, ''), r.minutos_presentar),
        interes_ia_presentar  = coalesce(nullif(interes_ia_presentar, ''), r.interes_ia_presentar),
        coste_subcontrata_eur = coalesce(coste_subcontrata_eur, r.coste_subcontrata_eur),
        software              = case when coalesce(cardinality(software), 0) = 0 then r.software else software end,
        comunidades           = case when coalesce(cardinality(comunidades), 0) = 0 then r.comunidades else comunidades end,
        comentarios           = coalesce(nullif(comentarios, ''), r.comentarios),
        respuestas            = jsonb_set(coalesce(respuestas, '{}'::jsonb), '{revisiones}', v_revs, true)
    where id = s.id;
    return false;
end;
$$;

-- ── Sugerencias, mejoras y errores (botón flotante) ──────────────────
create table if not exists public.certapp_feedback (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    cuenta_id   uuid references public.certapp_cuentas(id) on delete set null,
    obra_id     uuid references public.certapp_obras(id) on delete set null,
    tipo        text not null default 'SUGERENCIA'
                check (tipo in ('SUGERENCIA', 'MEJORA', 'ERROR', 'OTRO')),
    texto       text not null,
    pantalla    text,
    user_agent  text,
    estado      text not null default 'NUEVA'
                check (estado in ('NUEVA', 'VISTA', 'HECHA', 'DESCARTADA')),
    respuesta   text
);

create index if not exists idx_certapp_feedback_created on public.certapp_feedback (created_at desc);

-- ── Consumo del asistente (para el tope diario y mensual) ────────────
create table if not exists public.certapp_asistente_uso (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),
    cuenta_id   uuid references public.certapp_cuentas(id) on delete set null,
    modelo      text,
    tokens_in   integer,
    tokens_out  integer,
    coste_usd   numeric(10,5)
);

create index if not exists idx_certapp_asistente_cuenta on public.certapp_asistente_uso (cuenta_id, created_at desc);
create index if not exists idx_certapp_asistente_created on public.certapp_asistente_uso (created_at desc);

-- ── La cola de la IA admite el origen 'ext' ──────────────────────────
alter table public.cee_ia_trabajos drop constraint if exists cee_ia_trabajos_negocio_check;
alter table public.cee_ia_trabajos
    add constraint cee_ia_trabajos_negocio_check check (negocio in ('cae', 'cee', 'op', 'ext'));

-- ── Permisos (regla 150): RLS sin políticas, solo service_role ───────
alter table public.certapp_cuentas          enable row level security;
alter table public.certapp_beta_solicitudes enable row level security;
alter table public.certapp_obras            enable row level security;
alter table public.certapp_eventos          enable row level security;
alter table public.certapp_feedback         enable row level security;
alter table public.certapp_asistente_uso    enable row level security;

revoke all on public.certapp_cuentas          from anon, authenticated;
revoke all on public.certapp_beta_solicitudes from anon, authenticated;
revoke all on public.certapp_obras            from anon, authenticated;
revoke all on public.certapp_eventos          from anon, authenticated;
revoke all on public.certapp_feedback         from anon, authenticated;
revoke all on public.certapp_asistente_uso    from anon, authenticated;

grant select, insert, update, delete on public.certapp_cuentas          to service_role;
grant select, insert, update, delete on public.certapp_beta_solicitudes to service_role;
grant select, insert, update, delete on public.certapp_obras            to service_role;
grant select, insert, update, delete on public.certapp_eventos          to service_role;
grant select, insert, update, delete on public.certapp_feedback         to service_role;
grant select, insert, update, delete on public.certapp_asistente_uso    to service_role;

grant usage, select on sequence public.certapp_obras_correlativo_seq     to service_role;
grant usage, select on sequence public.certapp_eventos_id_seq            to service_role;
grant usage, select on sequence public.certapp_asistente_uso_id_seq      to service_role;
revoke all on sequence public.certapp_obras_correlativo_seq from anon, authenticated;

-- Funciones: solo el backend (hacen falta LAS DOS revocaciones)
revoke execute on function public.set_certapp_obra_cee_field(uuid, text, jsonb)          from public, anon, authenticated;
revoke execute on function public.set_certapp_obra_doc_field(uuid, text, jsonb)          from public, anon, authenticated;
revoke execute on function public.merge_certapp_obra_doc_json(uuid, text, jsonb)         from public, anon, authenticated;
revoke execute on function public.certapp_docs_append(uuid, text, jsonb, boolean)        from public, anon, authenticated;
revoke execute on function public.certapp_docs_replace_slot(uuid, text, jsonb)           from public, anon, authenticated;
revoke execute on function public.certapp_consumir_credito_obra(uuid)                    from public, anon, authenticated;
revoke execute on function public.certapp_devolver_credito_obra(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.certapp_beta_apuntar(jsonb, jsonb, integer)            from public, anon, authenticated;
revoke execute on function public.certapp_obras_numerar()                                from public, anon, authenticated;
revoke execute on function public.certapp_touch_updated_at()                             from public, anon, authenticated;
revoke execute on function public.check_certapp_obra_size()                              from public, anon, authenticated;

grant execute on function public.set_certapp_obra_cee_field(uuid, text, jsonb)   to service_role;
grant execute on function public.set_certapp_obra_doc_field(uuid, text, jsonb)   to service_role;
grant execute on function public.merge_certapp_obra_doc_json(uuid, text, jsonb)  to service_role;
grant execute on function public.certapp_docs_append(uuid, text, jsonb, boolean) to service_role;
grant execute on function public.certapp_docs_replace_slot(uuid, text, jsonb)    to service_role;
grant execute on function public.certapp_consumir_credito_obra(uuid)                    to service_role;
grant execute on function public.certapp_devolver_credito_obra(uuid, text, text, text, text) to service_role;
grant execute on function public.certapp_beta_apuntar(jsonb, jsonb, integer)            to service_role;

notify pgrst, 'reload schema';

-- ── Incidencias (24/10/2026): el certificador ve la respuesta de BROKERGY ──
-- El buzón de sugerencias pasa a «Incidencias y sugerencias»: el certificador ve
-- las suyas (de una obra o de la app) con su estado y la respuesta, y le llega
-- un email al responder. `respuesta_at` es lo que ve él («te respondimos el…»);
-- `respuesta_por` (quién del equipo) solo lo ve el admin. Idempotente.
alter table public.certapp_feedback add column if not exists respuesta_at  timestamptz;
alter table public.certapp_feedback add column if not exists respuesta_por text;

create index if not exists idx_certapp_feedback_cuenta on public.certapp_feedback (cuenta_id, created_at desc);
create index if not exists idx_certapp_feedback_obra   on public.certapp_feedback (obra_id) where obra_id is not null;

notify pgrst, 'reload schema';

-- ── Mis gastos (24/10/2026): el libro de movimientos de cada cuenta ──────
-- Lo pidió Fran: «que puedan ver el gasto que llevan en qué expedientes». Cada
-- certificado que entra o sale de una cuenta deja UNA fila con el saldo que queda:
--   ALTA       los de regalo al crear la cuenta (cuentas.crearCuenta, desde Node)
--   COMPRA     los que paga (la pasarela vendrá después; importe_eur y factura_id)
--   GASTO      -1 al pedir el certificado de una obra (certapp_consumir_credito_obra)
--   DEVOLUCION +1 si no se ha podido hacer (certapp_devolver_credito_obra)
--   AJUSTE     lo que el admin pone a mano (PATCH /api/certapp-admin/cuentas/:id)
-- El saldo de verdad sigue siendo certapp_cuentas.creditos; esto es su historia.
-- GASTO y DEVOLUCION se apuntan DENTRO de las RPC, en la misma transacción que el
-- saldo: no puede haber un crédito gastado sin su fila ni una fila sin su crédito.
-- `por` (quién: certificador, el email del admin, «automático») es interno: la
-- API del certificador no lo devuelve.
create table if not exists public.certapp_movimientos (
    id             bigint generated always as identity primary key,
    created_at     timestamptz not null default now(),
    cuenta_id      uuid not null references public.certapp_cuentas(id) on delete cascade,
    obra_id        uuid references public.certapp_obras(id) on delete set null,
    tipo           text not null check (tipo in ('ALTA', 'COMPRA', 'GASTO', 'DEVOLUCION', 'AJUSTE')),
    creditos       integer not null,                 -- + entran · - salen
    saldo_despues  integer not null,                 -- certapp_cuentas.creditos justo después
    importe_eur    numeric(10,2),                    -- solo COMPRA (en la beta, nada)
    concepto       text,                             -- lo que lee el certificador
    por            text,                             -- interno
    factura_id     text                              -- la factura de una COMPRA, cuando la haya
);

create index if not exists idx_certapp_movimientos_cuenta on public.certapp_movimientos (cuenta_id, created_at desc, id desc);
create index if not exists idx_certapp_movimientos_obra   on public.certapp_movimientos (obra_id) where obra_id is not null;

comment on table public.certapp_movimientos is
  'App de certificadores: entradas y salidas de certificados de cada cuenta (Mis gastos). El saldo es certapp_cuentas.creditos.';

alter table public.certapp_movimientos enable row level security;
revoke all on public.certapp_movimientos from anon, authenticated;
grant select, insert, update, delete on public.certapp_movimientos to service_role;
grant usage, select on sequence public.certapp_movimientos_id_seq to service_role;
revoke all on sequence public.certapp_movimientos_id_seq from anon, authenticated;

-- Las dos RPC del crédito, con su movimiento. MISMA firma y MISMOS valores de
-- vuelta que antes (routes/certapp.js y certappAdmin.js no cambian):
--   consumir → créditos que quedan · -1 sin saldo · -2 la obra ya lo tenía gastado
--   devolver → créditos que quedan · -2 la obra no tenía crédito gastado
-- En -1/-2 no se apunta nada: no se ha movido ningún crédito.
create or replace function public.certapp_consumir_credito_obra(p_obra_id uuid)
returns integer language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_cuenta uuid;
    v_quedan integer;
begin
    -- El FOR UPDATE serializa dos pedidos de la misma obra: el segundo ve la marca.
    select cuenta_id into v_cuenta from public.certapp_obras
    where id = p_obra_id and not credito_consumido
    for update;
    if not found then return -2; end if;

    update public.certapp_cuentas
    set creditos = creditos - 1, creditos_usados = creditos_usados + 1
    where id = v_cuenta and creditos > 0
    returning creditos into v_quedan;
    if v_quedan is null then return -1; end if;

    update public.certapp_obras
    set credito_consumido = true, credito_consumido_at = now()
    where id = p_obra_id;

    insert into public.certapp_movimientos (cuenta_id, obra_id, tipo, creditos, saldo_despues, concepto, por)
    values (v_cuenta, p_obra_id, 'GASTO', -1, v_quedan, 'Certificado pedido', 'certificador');

    return v_quedan;
end;
$$;

create or replace function public.certapp_devolver_credito_obra(
    p_obra_id       uuid,
    p_por           text default 'BROKERGY',
    p_texto         text default null,
    p_por_detalle   text default null,
    p_nota_interna  text default null)
returns integer language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_cuenta uuid;
    v_quedan integer;
begin
    select cuenta_id into v_cuenta from public.certapp_obras
    where id = p_obra_id and credito_consumido
    for update;
    if not found then return -2; end if;

    update public.certapp_obras
    set credito_consumido = false,
        credito_consumido_at = null,
        estado    = case when estado = 'EN_PREPARACION' then 'BORRADOR' else estado end,
        pedido_at = case when estado = 'EN_PREPARACION' then null else pedido_at end
    where id = p_obra_id;

    update public.certapp_cuentas
    set creditos = creditos + 1, creditos_usados = greatest(creditos_usados - 1, 0)
    where id = v_cuenta
    returning creditos into v_quedan;

    insert into public.certapp_eventos (obra_id, cuenta_id, tipo, texto, por, por_detalle, nota_interna)
    values (p_obra_id, v_cuenta, 'CREDITO_DEVUELTO', coalesce(p_texto, 'Crédito devuelto'),
            coalesce(p_por, 'BROKERGY'), p_por_detalle, p_nota_interna);

    -- La nota interna NO va al movimiento (lo lee el certificador).
    if v_quedan is not null then
        insert into public.certapp_movimientos (cuenta_id, obra_id, tipo, creditos, saldo_despues, concepto, por)
        values (v_cuenta, p_obra_id, 'DEVOLUCION', 1, v_quedan, coalesce(p_texto, 'Crédito devuelto'),
                coalesce(p_por_detalle, p_por, 'BROKERGY'));
    end if;

    return coalesce(v_quedan, -1);
end;
$$;

revoke execute on function public.certapp_consumir_credito_obra(uuid)                        from public, anon, authenticated;
revoke execute on function public.certapp_devolver_credito_obra(uuid, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.certapp_consumir_credito_obra(uuid)                        to service_role;
grant  execute on function public.certapp_devolver_credito_obra(uuid, text, text, text, text) to service_role;

-- Las cuentas que ya existían (sin ninguna fila): su historia hasta hoy, para que
-- «Mis gastos» cuadre con su saldo. Un ALTA con todo lo recibido (lo que tiene +
-- lo que ha usado) y un GASTO por cada obra con el crédito gastado. Una sola
-- sentencia (las dos inserciones ven la misma foto): se puede volver a pasar.
with sin_historia as (
    select c.id, c.created_at, c.creditos + c.creditos_usados as recibidos
    from public.certapp_cuentas c
    where not exists (select 1 from public.certapp_movimientos m where m.cuenta_id = c.id)
), altas as (
    insert into public.certapp_movimientos (cuenta_id, created_at, tipo, creditos, saldo_despues, concepto, por)
    select id, created_at, 'ALTA', recibidos, recibidos, 'Certificados de regalo de la beta', 'BROKERGY'
    from sin_historia
    returning cuenta_id
)
insert into public.certapp_movimientos (cuenta_id, obra_id, created_at, tipo, creditos, saldo_despues, concepto, por)
select o.cuenta_id, o.id, coalesce(o.credito_consumido_at, o.pedido_at, o.created_at), 'GASTO', -1,
       (s.recibidos - (row_number() over (partition by o.cuenta_id
                                          order by coalesce(o.credito_consumido_at, o.pedido_at, o.created_at), o.id)))::integer,
       'Certificado pedido', 'certificador'
from public.certapp_obras o
join sin_historia s on s.id = o.cuenta_id
where o.credito_consumido;

notify pgrst, 'reload schema';
