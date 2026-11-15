-- ============================================================================
-- wa_esperas + wa_chat_pausas — el agente de WhatsApp sabe a quién le hemos
-- PEDIDO algo, si ha CONTESTADO y cuándo toca insistir (fase 1, 2026-11-09)
-- ----------------------------------------------------------------------------
-- Una ESPERA nace cuando la casa le pide algo a alguien por WhatsApp (la
-- documentación de «Solicitar lo que falta», lo que pide el agente tras la
-- aceptación…). Se CIERRA sola en cuanto esa persona escribe (el mensaje entrante
-- de la sesión, al momento) y, si no escribe, la vuelta del servidor la RECUERDA
-- a su hora: en MODO COPIA el recordatorio solo le llega a Fran; en real, a la
-- persona, con los topes del servicio. Agotados los intentos queda VENCIDA y va
-- al resumen de las 9:00. Servicio: services/esperasWhatsapp.js.
--
-- Una PAUSA nace cuando alguien de la casa le escribe a mano a un chat (desde el
-- móvil o WhatsApp Web, no desde la app): ese chat lo lleva una persona y el
-- agente se calla en él hasta `hasta`.
--
-- Pequeñas a propósito: se leen por índice parcial (lo ABIERTO y lo que vence),
-- nunca se recorren enteras, y no llevan conversaciones (solo un resumen corto
-- de lo pedido y de la respuesta). Regla 150: RLS sin policies y GRANT a
-- service_role en el mismo script.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wa_esperas (
    id BIGSERIAL PRIMARY KEY,

    -- A quién: los 9 dígitos finales (como el resto de la casa) y quién es.
    tel9            VARCHAR(9)  NOT NULL,
    quien           VARCHAR(20) NOT NULL DEFAULT 'CLIENTE'
                    CHECK (quien IN ('CLIENTE', 'CONTACTO', 'INSTALADOR', 'CERTIFICADOR', 'OTRO')),
    nombre          TEXT,

    -- De qué obra. `numero` es el visible (26RES060_178 o 26RES060_OP230).
    expediente_id   UUID,
    oportunidad_id  UUID,
    numero          TEXT,

    -- Qué se le pidió. `motivo` es un catálogo cerrado (MOTIVOS del servicio);
    -- `pedido` la lista corta de lo pedido, `enlace` el de subida que se le dio.
    motivo          VARCHAR(40) NOT NULL,
    pedido          JSONB NOT NULL DEFAULT '[]',
    enlace          TEXT,
    texto           TEXT,              -- el mensaje que se mandó, recortado (≤ 600)
    origen          VARCHAR(40),       -- solicitar-faltantes · aceptacion · …

    enviado_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vence_at        TIMESTAMPTZ NOT NULL,
    intentos        INT NOT NULL DEFAULT 0,      -- recordatorios ya dados (o copiados)
    max_intentos    INT NOT NULL DEFAULT 2,
    recordado_at    TIMESTAMPTZ,

    -- 'ABIERTA' → esperando · 'CONTESTADA' → escribió · 'VENCIDA' → agotó los
    -- recordatorios sin contestar · 'CERRADA' → ya no hace falta (llegó por el
    -- enlace, se resolvió) · 'CANCELADA' → la quitó una persona.
    estado          VARCHAR(12) NOT NULL DEFAULT 'ABIERTA'
                    CHECK (estado IN ('ABIERTA', 'CONTESTADA', 'VENCIDA', 'CERRADA', 'CANCELADA')),
    cerrado_at      TIMESTAMPTZ,
    respuesta       TEXT,              -- qué escribió (tipo + primeras palabras, ≤ 200)
    -- Rastro corto de lo que ha hecho la vuelta: [{ at, accion, modo, texto? }]
    acciones        JSONB NOT NULL DEFAULT '[]',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lo que la vuelta lee cada 5 min: lo abierto que ya vence.
CREATE INDEX IF NOT EXISTS wa_esperas_vence_idx ON public.wa_esperas (vence_at) WHERE estado = 'ABIERTA';
-- Lo que mira el mensaje entrante: lo abierto de ese teléfono.
CREATE INDEX IF NOT EXISTS wa_esperas_tel_idx   ON public.wa_esperas (tel9)     WHERE estado = 'ABIERTA';
-- El resumen de las 9:00: lo que cambió ayer.
CREATE INDEX IF NOT EXISTS wa_esperas_cerrado_idx ON public.wa_esperas (cerrado_at) WHERE cerrado_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wa_chat_pausas (
    -- El chat tal y como lo da la sesión («34600111222@c.us» o «…@lid»).
    chat_id     TEXT PRIMARY KEY,
    hasta       TIMESTAMPTZ NOT NULL,
    motivo      TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wa_esperas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_chat_pausas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wa_esperas, public.wa_chat_pausas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wa_esperas, public.wa_chat_pausas TO service_role;
REVOKE ALL ON SEQUENCE public.wa_esperas_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.wa_esperas_id_seq TO service_role;
