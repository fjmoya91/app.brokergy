-- =====================================================================
-- Bot de WhatsApp — bandeja de entrada de los chats etiquetados.
--
-- El bot NO responde en el mismo instante en que entra un mensaje, y por dos
-- motivos que obligan a persistir:
--
--   1. AGRUPACIÓN. Un cliente escribe "Buenas tardes" · "¿Qué documentación
--      tenemos que aportar?" · "Gracias" en el mismo minuto (caso real, chat
--      de Angela Bernabé). Contestar al primero es contestar a un saludo y
--      quedar como una máquina. Se espera una ventana de silencio y se
--      responde UNA vez a todo junto.
--   2. HORARIO. Fuera de 08:00-20:00 no se contesta: un mensaje automático a
--      las 23:40 delata al bot y además nadie del staff puede recoger un
--      escalado a esa hora. El mensaje no se pierde — queda aquí con su
--      `responder_after` puesto en la próxima apertura.
--
-- Un buffer en memoria (como `uploadNotifier`) no sirve para lo segundo: un
-- reinicio del contenedor por la noche se comería la pregunta del cliente, y
-- esa sí es una conversación que espera respuesta.
--
-- El log completo (pregunta, respuesta y por qué) es innegociable: aquí una
-- máquina le está hablando a un cliente real en nombre de BROKERGY, y tiene
-- que poder auditarse qué le dijo exactamente y con qué contexto.
-- =====================================================================

create table if not exists public.whatsapp_bot_mensajes (
    id              bigserial primary key,

    -- ── De quién y por dónde ──────────────────────────────────────────
    chat_id         text        not null,          -- '34612345678@c.us'
    telefono        text,                          -- normalizado, sin '+'
    contacto_nombre text,                          -- pushname de WhatsApp

    -- ── Qué preguntó ──────────────────────────────────────────────────
    -- `pregunta` es el texto AGRUPADO: los mensajes sueltos se van
    -- concatenando en la misma fila mientras la ventana siga abierta.
    pregunta        text        not null,
    mensajes_n      integer     not null default 1,
    ultimo_wa_id    text,                          -- id del último msg de WhatsApp

    -- ── Qué se hizo ───────────────────────────────────────────────────
    -- PENDIENTE  → esperando a que venza la ventana / abra el horario
    -- RESPONDIDO → el bot contestó (respuesta guardada)
    -- ESCALADO   → no supo o el cliente pidió una persona; avisado el staff
    -- DESCARTADO → un humano contestó antes, el chat perdió la etiqueta,
    --              el bot estaba apagado o se superó el tope diario
    estado          text        not null default 'PENDIENTE',
    respuesta       text,
    motivo          text,                          -- por qué se escaló / descartó
    responder_after timestamptz not null default now(),
    respondido_at   timestamptz,

    -- ── Contra qué expediente se contestó ─────────────────────────────
    -- Se guardan los identificadores y un resumen del dossier, NO el dossier
    -- entero: nada de blobs en JSONB (regla 21). Sirve para releer meses
    -- después con qué información se respondió lo que se respondió.
    oportunidad_id      uuid,
    expediente_id       uuid,
    numero_expediente   text,
    contexto            jsonb,

    created_at      timestamptz not null default now()
);

comment on table public.whatsapp_bot_mensajes is
  'Bandeja del bot de WhatsApp: mensajes entrantes de chats etiquetados, agrupados por ventana de silencio, con la respuesta que dio el bot y el contexto con el que la dio.';

-- El barrido que despacha lo pendiente. Es la consulta caliente (cada 30 s).
create index if not exists idx_wa_bot_pendientes
    on public.whatsapp_bot_mensajes (responder_after)
    where estado = 'PENDIENTE';

-- Buscar la fila abierta de un chat (para agrupar) y releer su historial.
create index if not exists idx_wa_bot_chat
    on public.whatsapp_bot_mensajes (chat_id, created_at desc);

-- RLS deny-all: solo el backend (service_role) toca esto. No hay policies
-- a propósito — service_role las ignora y nadie más tiene por qué leer las
-- conversaciones privadas de un cliente.
alter table public.whatsapp_bot_mensajes enable row level security;

revoke all on public.whatsapp_bot_mensajes from anon, authenticated;
grant all on public.whatsapp_bot_mensajes to service_role;
grant usage, select on sequence public.whatsapp_bot_mensajes_id_seq to service_role;
revoke all on sequence public.whatsapp_bot_mensajes_id_seq from anon, authenticated;
