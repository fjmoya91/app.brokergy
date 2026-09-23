-- ============================================================================
-- cee_ofertas — OFERTAS de Certificado de Eficiencia Energética (CEE directos)
-- ----------------------------------------------------------------------------
-- Antes de que exista un expediente `{AAAA}CEE_{n}` hay una OFERTA: se le manda
-- al cliente (PDF + enlace de aceptación) y SOLO cuando la acepta nace el
-- expediente en `cee_directos`. Por eso va en su propia tabla y no como una fila
-- de `cee_directos` en un estado "OFERTA": el correlativo de los CEE es global y
-- seguido desde 2024, y una oferta rechazada se habría comido un número; además
-- esa fila aparecería en el listado, en el radar y en la facturación.
--
-- REGLA 21: aquí NO va el PDF. Se REGENERA desde estos campos con la misma
-- plantilla (features/cee-directo/logic/ofertaCee.js), y al aceptar se archiva
-- en la carpeta del expediente ("3. PRESUPUESTO Y FACTURAS").
--
-- Fecha: 2026-09-23
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.cee_ofertas_correlativo_seq START 1;

CREATE TABLE IF NOT EXISTS public.cee_ofertas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- `{AAAA}PCEE_{n}` — "Presupuesto CEE". El número lo compone la BD en la
    -- misma sentencia del INSERT: dos altas a la vez no pueden sacar el mismo.
    anio        INT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INT,
    correlativo INT NOT NULL DEFAULT nextval('public.cee_ofertas_correlativo_seq'),
    numero      TEXT GENERATED ALWAYS AS (anio::TEXT || 'PCEE_' || correlativo::TEXT) STORED,

    cliente_id     UUID NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE RESTRICT,
    prescriptor_id UUID REFERENCES public.prescriptores(id_empresa) ON DELETE SET NULL,

    -- 'UNICO' → un certificado · 'DOBLE' → inicial + final (mismo enum que cee_directos)
    alcance VARCHAR(10) NOT NULL DEFAULT 'UNICO' CHECK (alcance IN ('UNICO', 'DOBLE')),

    -- Importes. `precio` es el honorario SIN IVA; la tasa de registro es un
    -- suplido (sin IVA) y va UNA por certificado.
    precio    NUMERIC(10,2) NOT NULL,
    iva_pct   NUMERIC(5,2)  NOT NULL DEFAULT 21,
    tasa      NUMERIC(10,2) NOT NULL DEFAULT 0,
    num_tasas INT           NOT NULL DEFAULT 1,

    -- Inmueble (opcional al ofertar; el cliente lo completa al aceptar)
    direccion     TEXT,
    ref_catastral VARCHAR(25),
    ccaa          TEXT,
    provincia     TEXT,
    municipio     TEXT,
    codigo_postal VARCHAR(10),

    observaciones TEXT,

    -- 'ENVIADA' → esperando al cliente · 'ACEPTADA' · 'ANULADA'
    estado VARCHAR(20) NOT NULL DEFAULT 'ENVIADA' CHECK (estado IN ('ENVIADA', 'ACEPTADA', 'ANULADA')),

    -- Enlace público /aceptar-cee/:token (32 hex, de un solo destino).
    token TEXT NOT NULL,

    -- Rastro de envíos: [{ at, canales, email, tlf, usuario, errores? }]
    envios    JSONB NOT NULL DEFAULT '[]',
    historial JSONB NOT NULL DEFAULT '[]',

    aceptada_at         TIMESTAMPTZ,
    aceptada_por        TEXT,
    condiciones_version TEXT,
    cee_directo_id      UUID REFERENCES public.cee_directos(id) ON DELETE SET NULL,

    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cee_ofertas_numero_uidx ON public.cee_ofertas (numero);
CREATE UNIQUE INDEX IF NOT EXISTS cee_ofertas_token_uidx  ON public.cee_ofertas (token);
CREATE INDEX        IF NOT EXISTS cee_ofertas_estado_idx  ON public.cee_ofertas (estado);

-- Solo el backend (service_role) toca esta tabla: RLS deny-all y sin grants a
-- anon/authenticated (ver project_supabase_rls_lockdown).
ALTER TABLE public.cee_ofertas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cee_ofertas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cee_ofertas TO service_role;
REVOKE ALL ON SEQUENCE public.cee_ofertas_correlativo_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.cee_ofertas_correlativo_seq TO service_role;

-- Descuento sobre los HONORARIOS (2026-09-23). La tasa de registro no se
-- descuenta: es un suplido que se paga a la Administración tal cual.
ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS dto_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (dto_pct >= 0 AND dto_pct <= 100);
