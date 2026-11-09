-- ============================================================================
-- wa_bienvenidas — la PRIMERA respuesta, sola, a quien escribe por primera vez
-- a BROKERGY por WhatsApp (2026-11-09)
-- ----------------------------------------------------------------------------
-- Quien escribe por primera vez (no está en la app, ni en la agenda, ni el chat
-- tiene historia) recibe UNA vez el enlace del formulario «Calcula tu ayuda»
-- (?ref=wa) y el vídeo de las ayudas. Cada fila es una de esas bienvenidas:
-- apuntada (PENDIENTE, con su hora), mandada (ENVIADA), o solo apuntada en MODO
-- COPIA (COPIA: no salió nada). Servicio: services/bienvenidaWhatsapp.js.
--
-- Una por TELÉFONO, para siempre (índice único): a nadie se le da la bienvenida
-- dos veces. Pequeña: sin conversaciones, solo el comienzo del primer mensaje.
-- Regla 150: RLS sin policies y GRANT a service_role en el mismo script.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wa_bienvenidas (
    id BIGSERIAL PRIMARY KEY,

    -- A quién: los 9 dígitos finales (como el resto de la casa) y el chat tal y
    -- como lo da la sesión («34600111222@c.us» o «…@lid»).
    tel9            VARCHAR(9) NOT NULL,
    chat_id         TEXT NOT NULL,
    pushname        TEXT,              -- el nombre que se ha puesto él en WhatsApp
    primer_mensaje  TEXT,              -- tipo + primeras palabras de lo que escribió (≤ 120)

    -- 'PENDIENTE' → apuntada, sale a `enviar_at` · 'ENVIANDO' → tomada por la vuelta
    -- · 'ENVIADA' → mandada · 'COPIA' → modo copia, no salió nada · 'DESCARTADA' → le
    -- contestaron antes (una persona, otra cosa de la app) · 'ERROR' → no salió (sin
    -- reintentos: el mensaje puede estar ya en el chat).
    estado          VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE', 'ENVIANDO', 'ENVIADA', 'COPIA', 'DESCARTADA', 'ERROR')),
    modo            VARCHAR(6) NOT NULL DEFAULT 'copia' CHECK (modo IN ('copia', 'real')),
    motivo          TEXT,              -- por qué se apuntó, o por qué no salió
    enviar_at       TIMESTAMPTZ NOT NULL,
    enviado_at      TIMESTAMPTZ,
    texto           TEXT,              -- el mensaje que se manda
    video           TEXT,              -- 'enviado' · 'enlace (…)' · 'sin vídeo' · 'error: …'

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_bienvenidas_tel_uq ON public.wa_bienvenidas (tel9);
-- Lo que la vuelta lee cada minuto: lo apuntado que ya toca.
CREATE INDEX IF NOT EXISTS wa_bienvenidas_pend_idx ON public.wa_bienvenidas (enviar_at) WHERE estado = 'PENDIENTE';
-- Los topes del día y de la hora.
CREATE INDEX IF NOT EXISTS wa_bienvenidas_env_idx ON public.wa_bienvenidas (enviado_at) WHERE estado = 'ENVIADA';

ALTER TABLE public.wa_bienvenidas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wa_bienvenidas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wa_bienvenidas TO service_role;
REVOKE ALL ON SEQUENCE public.wa_bienvenidas_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.wa_bienvenidas_id_seq TO service_role;
