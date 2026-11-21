-- ─── Catálogo de aerotermia con TARIFAS (app del instalador, fase 4) ──────────
-- Fran, 21/11/2026: BROKERGY sube por Excel la tarifa del distribuidor por marca
-- (igual para todos los instaladores) y cada instalador pone SU precio al usarla.
-- Ver docs/conocimiento/instalador-app/app-del-instalador-fase-4.md.
--
-- ADITIVO e IDEMPOTENTE: no toca `aerotermia` ni ninguna fila existente.
-- Se aplica ANTES del deploy (el código nuevo lee estas tablas; sin ellas el
-- Catálogo del instalador responde 503 y la carga del Excel no confirma).
-- Regla 150: RLS sin policies, GRANT solo a service_role, REVOKE a anon/authenticated.

-- 1) Cada carga de un Excel (el fichero NO se guarda: solo su nombre y su huella).
CREATE TABLE IF NOT EXISTS public.aerotermia_tarifas_cargas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distribuidor     TEXT NOT NULL CHECK (length(btrim(distribuidor)) BETWEEN 2 AND 120),
    vigente_desde    DATE NOT NULL,
    fichero_nombre   TEXT NOT NULL CHECK (length(fichero_nombre) <= 255),
    fichero_sha256   TEXT NOT NULL CHECK (fichero_sha256 ~ '^[0-9a-f]{64}$'),
    filas_leidas     INTEGER NOT NULL DEFAULT 0,
    filas_cargadas   INTEGER NOT NULL DEFAULT 0,
    filas_fuera      INTEGER NOT NULL DEFAULT 0,   -- sin pareja, ambiguas, duplicadas o con error
    cargada_por      UUID,                          -- usuarios.id_usuario del ADMIN
    cargada_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) La tarifa de un modelo. HISTÓRICO: una tarifa nueva es una fila nueva; la
--    anterior se queda. La VIGENTE es la de `vigente_desde` más reciente que ya
--    haya empezado (a igualdad, la cargada más tarde).
CREATE TABLE IF NOT EXISTS public.aerotermia_tarifas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aerotermia_id    INTEGER NOT NULL REFERENCES public.aerotermia(id) ON DELETE CASCADE,
    precio_sin_iva   NUMERIC(10,2) NOT NULL CHECK (precio_sin_iva > 0 AND precio_sin_iva < 1000000),
    vigente_desde    DATE NOT NULL,
    distribuidor     TEXT NOT NULL,
    carga_id         UUID NOT NULL REFERENCES public.aerotermia_tarifas_cargas(id) ON DELETE CASCADE,
    fila_excel       INTEGER,                       -- la fila del Excel de la que salió
    ref_excel        TEXT,                          -- la referencia tal cual venía
    cargada_por      UUID,
    cargada_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aerotermia_tarifas_vigente_idx
    ON public.aerotermia_tarifas (aerotermia_id, vigente_desde DESC, cargada_at DESC);
CREATE INDEX IF NOT EXISTS aerotermia_tarifas_carga_idx ON public.aerotermia_tarifas (carga_id);

-- 3) El precio PROPIO de cada instalador por modelo (uno vivo por pareja).
CREATE TABLE IF NOT EXISTS public.instalador_precios_equipo (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instalador_id    UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE CASCADE,
    aerotermia_id    INTEGER NOT NULL REFERENCES public.aerotermia(id) ON DELETE CASCADE,
    precio_sin_iva   NUMERIC(10,2) NOT NULL CHECK (precio_sin_iva > 0 AND precio_sin_iva < 1000000),
    actualizado_por  UUID,
    actualizado_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (instalador_id, aerotermia_id)
);

-- 4) Permisos (regla 150).
ALTER TABLE public.aerotermia_tarifas_cargas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aerotermia_tarifas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instalador_precios_equipo  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aerotermia_tarifas_cargas, public.aerotermia_tarifas, public.instalador_precios_equipo FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aerotermia_tarifas_cargas, public.aerotermia_tarifas, public.instalador_precios_equipo TO service_role;

-- Comprobación (solo lectura): ninguna fila para anon/authenticated.
-- SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'public'
--    AND table_name IN ('aerotermia_tarifas_cargas','aerotermia_tarifas','instalador_precios_equipo')
--  ORDER BY table_name, grantee;
