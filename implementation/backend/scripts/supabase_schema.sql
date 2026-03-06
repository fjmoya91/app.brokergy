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

-- Políticas RLS (Row Level Security) básicas
-- IMPORTANTE: Para empezar, habilitaremos acceso para usuarios anónimos/autenticados, 
-- pero idealmente esta tabla debería ser consultada solo mediante la Service Role Key desde el backend.

ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;

-- Permitir lectura general (ajustar según requisitos de seguridad)
CREATE POLICY "Enable read access for all users" ON public.oportunidades AS PERMISSIVE FOR SELECT TO public USING (true);

-- Permitir inserción general (ajustar según requisitos de seguridad)
CREATE POLICY "Enable insert access for all users" ON public.oportunidades AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
