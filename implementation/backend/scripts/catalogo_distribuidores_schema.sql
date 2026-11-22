-- ─── Catálogo del instalador: tarifas POR DISTRIBUIDOR, a quién compra y pedidos ─
-- Fran, 22/11/2026: «que vea de un modelo los precios de cada distribuidor con el
-- que trabaja, que elija a quién se lo compra y que lo pida al comercial».
-- Ver docs/conocimiento/instalador-app/catalogo-por-distribuidor.md.
--
-- ADITIVO e IDEMPOTENTE. Va DESPUÉS de aerotermia_tarifas_schema.sql y ANTES del
-- deploy (el código nuevo lee estas columnas y tablas; sin ellas el Catálogo da 503).
-- El 22/11/2026 `aerotermia_tarifas` estaba vacía en producción: la columna nueva
-- no deja filas huérfanas. Regla 150: RLS sin policies, GRANT solo a service_role
-- y REVOKE a anon/authenticated.

-- 1) La tarifa es DE UN DISTRIBUIDOR (una empresa DISTRIBUIDOR de `prescriptores`).
--    La columna de texto `distribuidor` se queda (su nombre al cargar, para el histórico).
ALTER TABLE public.aerotermia_tarifas_cargas
    ADD COLUMN IF NOT EXISTS distribuidor_id UUID REFERENCES public.prescriptores(id_empresa) ON DELETE RESTRICT;
ALTER TABLE public.aerotermia_tarifas
    ADD COLUMN IF NOT EXISTS distribuidor_id UUID REFERENCES public.prescriptores(id_empresa) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS aerotermia_tarifas_dist_vigente_idx
    ON public.aerotermia_tarifas (distribuidor_id, aerotermia_id, vigente_desde DESC, cargada_at DESC);

-- 2) A QUIÉN LE COMPRA cada instalador. NO es la «red» del distribuidor
--    (`distribuidor_instalador`): estar en una red le deja al distribuidor ver los
--    clientes y oportunidades del instalador; comprarle, no.
CREATE TABLE IF NOT EXISTS public.instalador_proveedores (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instalador_id    UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE CASCADE,
    distribuidor_id  UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE CASCADE,
    creado_por       UUID,
    creado_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (instalador_id, distribuidor_id),
    CHECK (instalador_id <> distribuidor_id)
);

-- 3) De quién compra ESE modelo (lo marca el instalador en la ficha del equipo).
CREATE TABLE IF NOT EXISTS public.instalador_compra_equipo (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instalador_id    UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE CASCADE,
    aerotermia_id    INTEGER NOT NULL REFERENCES public.aerotermia(id) ON DELETE CASCADE,
    distribuidor_id  UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE CASCADE,
    actualizado_por  UUID,
    actualizado_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (instalador_id, aerotermia_id)
);

-- 4) Los PEDIDOS que el instalador manda al comercial del distribuidor desde la app.
CREATE TABLE IF NOT EXISTS public.instalador_pedidos (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instalador_id      UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE CASCADE,
    distribuidor_id    UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE RESTRICT,
    aerotermia_id      INTEGER NOT NULL REFERENCES public.aerotermia(id) ON DELETE RESTRICT,
    cantidad           INTEGER NOT NULL CHECK (cantidad BETWEEN 1 AND 50),
    obra               TEXT CHECK (obra IS NULL OR length(obra) <= 60),   -- nº de oportunidad/expediente, si lo pone
    nota               TEXT CHECK (nota IS NULL OR length(nota) <= 500),
    precio_tarifa      NUMERIC(10,2),                                     -- la tarifa vigente al pedir (sin IVA)
    mensaje            TEXT NOT NULL,                                     -- el texto EXACTO que salió
    canales            TEXT[] NOT NULL DEFAULT '{}',                      -- los que salieron: WhatsApp, Email
    estado             TEXT NOT NULL DEFAULT 'ENVIADO' CHECK (estado IN ('ENVIADO', 'FALLIDO')),
    creado_por         UUID,
    creado_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS instalador_pedidos_inst_idx ON public.instalador_pedidos (instalador_id, creado_at DESC);

-- 5) Permisos (regla 150).
ALTER TABLE public.instalador_proveedores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instalador_compra_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instalador_pedidos       ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instalador_proveedores, public.instalador_compra_equipo, public.instalador_pedidos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instalador_proveedores, public.instalador_compra_equipo, public.instalador_pedidos TO service_role;

-- Comprobación (debe salir solo service_role):
-- SELECT table_name, grantee, string_agg(privilege_type, ',') FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND table_name IN ('instalador_proveedores','instalador_compra_equipo','instalador_pedidos')
--  GROUP BY 1, 2 ORDER BY 1, 2;
