-- ============================================================================
-- instalador_presupuestos_schema.sql — los PRESUPUESTOS que hace el INSTALADOR
-- para SU cliente desde su app o pidiéndolo por WhatsApp (22/11/2026, beta RCA).
--
-- El EMISOR es el instalador (`prescriptor_id`), no BROKERGY: nada que ver con
-- `cee_ofertas` (los presupuestos de BROKERGY, serie P-26ING). El PDF se compone
-- cada vez con la plantilla de factura del instalador (regla 21: aquí no se
-- guarda ningún fichero); cuando el presupuesto se liga a una oportunidad, el
-- PDF se sube a su apartado «Presupuesto» en Drive.
--
-- Regla 150: RLS activado SIN policies y GRANT solo a service_role, en este
-- mismo script. Va ANTES del deploy.
-- ============================================================================

create table if not exists public.instalador_presupuestos (
    id              uuid primary key default gen_random_uuid(),
    prescriptor_id  uuid not null references public.prescriptores(id_empresa),
    numero          text not null,
    fecha           date not null default current_date,
    estado          text not null default 'EMITIDO' check (estado in ('EMITIDO', 'ANULADO')),
    origen          text not null default 'app' check (origen in ('app', 'whatsapp', 'interno')),
    cliente_id      uuid references public.clientes(id_cliente) on delete set null,
    -- Foto de lo que salió IMPRESO: {nombre, nif, direccion, codigo_postal, municipio, provincia, tlf}
    cliente         jsonb not null default '{}'::jsonb,
    -- {tipo, direccion, codigo_postal, municipio, provincia, ref_catastral, equipo{aerotermia_id, marca,
    --  modelo, potencia_kw}, caldera{combustible}, emisor, acs, extras[{clave, litros}], descripcion}
    obra            jsonb not null default '{}'::jsonb,
    -- [{texto, cantidad, precio, importe}]
    lineas          jsonb not null default '[]'::jsonb,
    modo            text not null default 'total' check (modo in ('total', 'partidas')),
    notas           text,
    validez_dias    integer,
    base            numeric(12, 2) not null default 0,
    iva_pct         numeric(5, 2) not null default 21,
    iva             numeric(12, 2) not null default 0,
    total           numeric(12, 2) not null default 0,
    oportunidad_id  uuid references public.oportunidades(id) on delete set null,
    -- {estado: 'PEDIDA'|'CREADA', pedida_at, por: 'app'|'whatsapp', rc, direccion_catastro}
    simulacion      jsonb,
    creado_por      uuid,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Un número por instalador (los anulados lo liberan).
create unique index if not exists instalador_presupuestos_numero_uq
    on public.instalador_presupuestos (prescriptor_id, lower(numero)) where estado <> 'ANULADO';
create index if not exists instalador_presupuestos_prescriptor_idx
    on public.instalador_presupuestos (prescriptor_id, created_at desc);
create index if not exists instalador_presupuestos_oportunidad_idx
    on public.instalador_presupuestos (oportunidad_id) where oportunidad_id is not null;
create index if not exists instalador_presupuestos_cliente_idx
    on public.instalador_presupuestos (cliente_id) where cliente_id is not null;

alter table public.instalador_presupuestos enable row level security;
revoke all on public.instalador_presupuestos from anon, authenticated;
grant select, insert, update, delete on public.instalador_presupuestos to service_role;

-- La conversación EN CURSO de un grupo de WhatsApp de instalador: lo que ha pedido
-- y lo que falta por saber (el cliente, el importe, la vivienda…).
create table if not exists public.instalador_wa_pedidos (
    id              uuid primary key default gen_random_uuid(),
    chat_id         text not null,
    autor           text not null,
    prescriptor_id  uuid not null references public.prescriptores(id_empresa),
    estado          text not null default 'ABIERTO' check (estado in ('ABIERTO', 'HECHO', 'CANCELADO', 'CADUCADO')),
    espera          text,
    pedido          jsonb not null default '{}'::jsonb,
    presupuesto_id  uuid references public.instalador_presupuestos(id) on delete set null,
    mensajes        jsonb not null default '[]'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists instalador_wa_pedidos_chat_idx
    on public.instalador_wa_pedidos (chat_id, estado, updated_at desc);

alter table public.instalador_wa_pedidos enable row level security;
revoke all on public.instalador_wa_pedidos from anon, authenticated;
grant select, insert, update, delete on public.instalador_wa_pedidos to service_role;
