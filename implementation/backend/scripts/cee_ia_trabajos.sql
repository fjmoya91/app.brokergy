-- =====================================================================
-- La COLA de CEE que se generan con IA (el agente por la API de Claude).
--
-- El botón CE3X de la calculadora y del módulo CEE ofrece «Generar con IA»:
-- la app no puede hacerlo sola, porque el agente necesita el motor, CE3X 3.2
-- (para calificar y sacar el PDF) y la llave de la API, y las tres cosas están
-- en el PC. Así que la app APUNTA el encargo aquí y un vigilante del PC
-- (`tools/banco-cee-api/banco.mjs atender`) lo toma, corre el agente y va
-- escribiendo su progreso. Es el mismo patrón que «por calificar» del sello
-- del `.cex` (`cee_inicial.js calificar --cola`), pero con estado propio:
-- quién lo pidió, cuándo, en qué va, cuánto ha costado y qué ha preguntado.
--
-- REGLA — un CEE solo puede tener UN trabajo vivo (EN_COLA o EN_CURSO) por
-- fase: lo garantiza el índice único parcial, no el navegador. Pulsar dos
-- veces no lanza dos agentes (ni paga dos veces).
--
-- REGLA — el vigilante TOMA el trabajo con un UPDATE condicionado
-- (`estado = 'EN_COLA'`): si hubiera dos PCs, solo uno se lo lleva.
--
-- REGLA — aquí solo hay ESCALARES y textos cortos: el rastro completo del
-- agente (transcript, órdenes) se queda en el PC, en
-- `implementation/backend/scratch/banco-cee-api/real/`.
-- =====================================================================

create table if not exists public.cee_ia_trabajos (
    id              uuid primary key default gen_random_uuid(),

    -- De qué es: CAE (expedientes), CEE directo (cee_directos) u oportunidad.
    negocio         text not null check (negocio in ('cae', 'cee', 'op')),
    ref_id          uuid not null,             -- id de la fila en su tabla
    clave           text not null,             -- 26RES060_190 · 2026CEE_55 · 26RES060_OP279
    fase            text not null default 'inicial' check (fase in ('inicial', 'final')),

    -- EN_COLA   → esperando a que el PC lo tome
    -- EN_CURSO  → el agente está trabajando (latido_at se renueva cada vuelta)
    -- HECHO     → escribió el .cex, el XML y el PDF
    -- PARCIAL   → escribió, pero dejó preguntas (o no llegó al PDF)
    -- ERROR     → no ha podido (motor caído, API, tope de gasto…)
    -- CANCELADO → lo retiró una persona
    estado          text not null default 'EN_COLA'
                    check (estado in ('EN_COLA', 'EN_CURSO', 'HECHO', 'PARCIAL', 'ERROR', 'CANCELADO')),

    modelo          text not null default 'opus',
    esfuerzo        text not null default 'high',
    tope_usd        numeric(6,2) not null default 10,
    rehacer         boolean not null default false,   -- ya lo había hecho la IA y se pidió otra vez

    pedido_por      text,
    pedido_at       timestamptz not null default now(),
    tomado_at       timestamptz,
    equipo          text,                      -- el PC que lo tomó
    latido_at       timestamptz,
    terminado_at    timestamptz,

    -- Lo pide una persona con el trabajo EN_CURSO: el vigilante lo mira en cada
    -- vuelta y para el agente.
    cancelar        boolean not null default false,
    cancelado_por   text,

    -- { vueltas, coste_usd, ultima (la última orden), ordenes }
    progreso        jsonb not null default '{}'::jsonb,
    -- { estado, informe, preguntas[], coste_usd, vueltas, minutos, escribio }
    resultado       jsonb,
    error           text
);

comment on table public.cee_ia_trabajos is
  'CEE que se generan con el agente de IA por la API de Claude: la app los pide, el vigilante del PC (banco.mjs atender) los toma y escribe aquí su progreso, coste y resultado.';

create unique index if not exists uq_cee_ia_vivo
    on public.cee_ia_trabajos (negocio, ref_id, fase)
    where estado in ('EN_COLA', 'EN_CURSO');

create index if not exists idx_cee_ia_cola
    on public.cee_ia_trabajos (pedido_at)
    where estado = 'EN_COLA';

create index if not exists idx_cee_ia_ref
    on public.cee_ia_trabajos (negocio, ref_id, pedido_at desc);

-- El LATIDO del vigilante: la app dice si hay un PC atendiendo la cola antes
-- de que alguien pida un CEE y se quede esperando a nadie.
create table if not exists public.cee_ia_vigilantes (
    equipo          text primary key,
    visto_at        timestamptz not null default now(),
    listo           boolean not null default true,   -- motor y CE3X disponibles
    motivo          text                              -- por qué no está listo
);

comment on table public.cee_ia_vigilantes is
  'El PC que atiende la cola de cee_ia_trabajos: cuándo se le vio por última vez y si tiene el motor y CE3X listos.';

-- RLS deny-all: solo el backend y el PC (service_role).
alter table public.cee_ia_trabajos enable row level security;
alter table public.cee_ia_vigilantes enable row level security;
revoke all on public.cee_ia_trabajos from anon, authenticated;
revoke all on public.cee_ia_vigilantes from anon, authenticated;
grant select, insert, update, delete on table public.cee_ia_trabajos to service_role;
grant select, insert, update, delete on table public.cee_ia_vigilantes to service_role;
