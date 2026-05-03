-- Esquema para la tabla de Oportunidades

CREATE TABLE IF NOT EXISTS public.oportunidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_oportunidad TEXT NOT NULL UNIQUE,
    ref_catastral TEXT NOT NULL,
    prescriptor TEXT NOT NULL DEFAULT 'BROKERGY',
    referencia_cliente TEXT,
    demanda_calefaccion NUMERIC,
    datos_calculo JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices recomendados para la búsqueda y listado
CREATE INDEX IF NOT EXISTS idx_oportunidades_ref_catastral ON public.oportunidades(ref_catastral);
CREATE INDEX IF NOT EXISTS idx_oportunidades_created_at ON public.oportunidades(created_at DESC);

-- Políticas RLS (Row Level Security)
-- No se crean políticas permisivas intencionalmente.
-- El backend usa service_role_key, que bypasea RLS automáticamente.
-- Sin políticas = acceso denegado para anon/authenticated vía REST directo.

ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades FORCE ROW LEVEL SECURITY;
