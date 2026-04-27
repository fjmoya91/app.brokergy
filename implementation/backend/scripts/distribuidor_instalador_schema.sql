-- Tabla pivote para asociar instaladores a distribuidores
CREATE TABLE IF NOT EXISTS public.distribuidor_instalador (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    distribuidor_id UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE CASCADE,
    instalador_id UUID NOT NULL REFERENCES public.prescriptores(id_empresa) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(distribuidor_id, instalador_id)
);

-- Políticas RLS básicas
ALTER TABLE public.distribuidor_instalador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública para usuarios autenticados" 
ON public.distribuidor_instalador 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Admin puede todo" 
ON public.distribuidor_instalador 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM usuarios
    JOIN roles ON usuarios.id_rol = roles.id_rol
    WHERE usuarios.auth_user_id = auth.uid()
    AND roles.nombre_rol = 'ADMIN'
  )
);

CREATE POLICY "Distribuidor puede asociar sus instaladores"
ON public.distribuidor_instalador
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM prescriptores
    JOIN usuarios ON prescriptores.representante_legal_id = usuarios.id_usuario
    WHERE prescriptores.id_empresa = distribuidor_instalador.distribuidor_id
    AND usuarios.auth_user_id = auth.uid()
  )
);

-- Añadir columna instalador_asociado_id a oportunidades si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='oportunidades' AND column_name='instalador_asociado_id'
    ) THEN
        ALTER TABLE public.oportunidades ADD COLUMN instalador_asociado_id UUID REFERENCES public.prescriptores(id_empresa) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='expedientes' AND column_name='instalador_asociado_id'
    ) THEN
        ALTER TABLE public.expedientes ADD COLUMN instalador_asociado_id UUID REFERENCES public.prescriptores(id_empresa) ON DELETE SET NULL;
    END IF;
END $$;

