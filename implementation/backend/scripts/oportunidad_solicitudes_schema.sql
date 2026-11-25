-- ============================================================================
-- oportunidad_solicitudes — los INSTALADORES que han pedido la misma obra, en orden
-- ----------------------------------------------------------------------------
-- Una vivienda puede llegarnos por dos instaladores: el cliente pide presupuesto
-- a varios y cada uno nos pasa la obra. Caso de origen: 26RES060_OP360 (HÉCTOR
-- MUÑOZ, Pedro Muñoz): la pidió SANTOS GONZÁLEZ GARRIDO el 31/10/2026 y el 25/11
-- nos llegó por ISM con su presupuesto (Fran, 25/11/2026).
--
-- La oportunidad sigue siendo UNA (misma vivienda, mismo CEE, mismo ahorro) y
-- sigue colgando de su `prescriptor_id` (el primero que la trajo): de ahí salen
-- los avisos y la comisión de la empresa. Esta tabla dice, aparte:
--   · quién la ha pedido y en qué ORDEN (1º, 2º…) y cuándo;
--   · el presupuesto de CADA uno (lo único que cambia entre sus propuestas);
-- y cada versión de la propuesta queda sellada con el instalador para el que se
-- hizo (`propuesta_versiones[].partner_id`). Regla: el bono CAE es el MISMO para
-- todos; lo vigila `utils/solicitudesPartner.js` al registrar la versión.
--
-- Por qué una tabla y no una clave de `datos_calculo`: el guardado de la
-- calculadora reescribe `datos_calculo` entero con lo que tiene el navegador, y
-- una lista escrita por otra ruta se perdería en el siguiente «Guardar».
--
-- Fecha: 2026-11-25
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oportunidad_solicitudes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
    prescriptor_id UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE CASCADE,

    -- 1 = quien la trajo primero (el `prescriptor_id` de la oportunidad).
    orden INTEGER NOT NULL CHECK (orden >= 1),
    recibida_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- El presupuesto de ESTE instalador, IVA incluido (lo que va a P. Aerotermia).
    presupuesto NUMERIC(12,2),
    presupuesto_estimado BOOLEAN NOT NULL DEFAULT FALSE,
    presupuesto_ref TEXT,          -- su nº de presupuesto o el nombre del documento
    nota TEXT,

    creado_por TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (oportunidad_id, prescriptor_id),
    UNIQUE (oportunidad_id, orden)
);

COMMENT ON TABLE public.oportunidad_solicitudes IS 'Instaladores que han pedido la MISMA oportunidad, en orden, con el presupuesto de cada uno. La oportunidad sigue colgando de su prescriptor_id (el 1º).';
COMMENT ON COLUMN public.oportunidad_solicitudes.presupuesto IS 'Presupuesto de ESTE instalador, con IVA. Es lo único que cambia entre las propuestas de cada uno: el bono CAE es el mismo.';

CREATE INDEX IF NOT EXISTS oportunidad_solicitudes_op_idx ON public.oportunidad_solicitudes (oportunidad_id, orden);

-- Regla 150: RLS sin policies + GRANT a service_role en el mismo script.
ALTER TABLE public.oportunidad_solicitudes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oportunidad_solicitudes TO service_role;
REVOKE ALL ON public.oportunidad_solicitudes FROM anon, authenticated;

-- Comprobación (debe salir service_role con los cuatro privilegios):
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'oportunidad_solicitudes';
