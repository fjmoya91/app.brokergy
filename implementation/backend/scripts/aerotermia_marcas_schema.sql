-- Esquema para la tabla de Marcas de Aerotermia

CREATE TABLE IF NOT EXISTS public.aerotermia_marcas (
    nombre TEXT PRIMARY KEY,
    logo TEXT, -- Base64 o URL
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.aerotermia_marcas ENABLE ROW LEVEL SECURITY;

-- Permisos de lectura (todos pueden ver las marcas)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable select for all' AND tablename = 'aerotermia_marcas') THEN
        CREATE POLICY "Enable select for all" ON public.aerotermia_marcas FOR SELECT TO PUBLIC USING (true);
    END IF;
END $$;
