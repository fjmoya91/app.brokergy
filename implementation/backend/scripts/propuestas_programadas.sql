-- =====================================================================
-- PROGRAMAR el envío de una propuesta.
--
-- El envío de una propuesta lo orquesta HOY el navegador: compone el
-- mensaje por destinatario, registra la versión (que rasteriza y archiva
-- el PDF), manda el email y el WhatsApp y sella el resultado. Programarlo
-- significa que ese mismo recorrido lo tiene que hacer el SERVIDOR a la
-- hora elegida, con el ordenador de quien lo programó apagado.
--
-- Por eso aquí se guarda el PLAN ENTERO, ya decidido: a quién, por dónde,
-- con qué texto y con qué documento. El despachador no vuelve a decidir
-- nada — replica lo que se revisó antes de pulsar. Si volviera a componer
-- el mensaje o a elegir destinatarios, saldría una propuesta distinta de
-- la que se aprobó.
--
-- REGLA — el HTML vive AQUÍ, en columnas TEXT propias, nunca dentro de
-- `oportunidades.datos_calculo`. El HTML de una propuesta pesa 353 KB de
-- media y hasta 1,35 MB (regla 21): meterlo en el JSONB que se lee en
-- cada listado repetiría la caída de julio. Se borra en cuanto el envío
-- termina — de una programada ya enviada lo que hace falta es su rastro,
-- no su documento, que queda archivado en Drive como cualquier versión.
--
-- REGLA — ningún listado selecciona `html_pdf` / `html_email`. Son dos
-- columnas de ~350 KB: un `select('*')` sobre la tabla las arrastra.
-- =====================================================================

create table if not exists public.propuestas_programadas (
    id              uuid primary key default gen_random_uuid(),

    -- La oportunidad, por sus DOS identificadores: el uuid para el enlace
    -- duro y el legible (26RES060_OP212) porque las rutas de propuesta se
    -- direccionan por él.
    oportunidad_id  uuid not null references public.oportunidades(id) on delete cascade,
    id_oportunidad  text not null,

    enviar_at       timestamptz not null,

    -- PENDIENTE  → esperando a su hora
    -- ENVIANDO   → un despachador la ha tomado (claim atómico)
    -- ENVIADA    → salió (resultado lleva el detalle por canal)
    -- ERROR      → no se pudo preparar el PDF o no salió por ningún canal
    -- CANCELADA  → la retiró una persona (o se envió a mano antes de su hora)
    estado          text not null default 'PENDIENTE',

    -- El plan ya decidido: grupos (una empresa = un correo con copia real),
    -- mensajes por persona, canales, importes de la versión y la nota.
    plan            jsonb not null,

    -- El documento tal y como se revisó. Se vacían al terminar.
    html_pdf        text,
    html_email      text,

    creada_por      text,
    created_at      timestamptz not null default now(),
    despachada_at   timestamptz,     -- cuándo lo tomó el despachador
    enviada_at      timestamptz,
    cancelada_at    timestamptz,
    cancelada_por   text,

    version         integer,         -- nº de versión que consumió al salir
    resultado       jsonb,           -- [{channel,status,text}]
    error           text
);

comment on table public.propuestas_programadas is
  'Envíos de propuesta programados para una fecha y hora. Guardan el plan completo (destinatarios, canales, mensajes) y el HTML del documento revisado; el despachador del backend los replica a su hora.';

-- La consulta caliente del despachador (cada minuto).
create index if not exists idx_prop_prog_pendientes
    on public.propuestas_programadas (enviar_at)
    where estado = 'PENDIENTE';

-- "¿Tiene esta oportunidad algún envío programado?" — lo pregunta el popup
-- de envío cada vez que se abre.
create index if not exists idx_prop_prog_oportunidad
    on public.propuestas_programadas (oportunidad_id, created_at desc);

-- RLS deny-all: solo el backend (service_role). Aquí hay mensajes a clientes
-- y el documento entero de una propuesta con sus importes.
alter table public.propuestas_programadas enable row level security;

revoke all on public.propuestas_programadas from anon, authenticated;
grant all on public.propuestas_programadas to service_role;
