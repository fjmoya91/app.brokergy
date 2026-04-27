-- 1. Añadir la columna updated_at si no existe
ALTER TABLE public.oportunidades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Inicializar updated_at con created_at para registros existentes
UPDATE public.oportunidades SET updated_at = created_at WHERE updated_at IS NULL;

-- 3. Crear o actualizar la función de trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Crear el trigger para la tabla oportunidades
DROP TRIGGER IF EXISTS update_oportunidades_updated_at ON public.oportunidades;
CREATE TRIGGER update_oportunidades_updated_at
    BEFORE UPDATE ON public.oportunidades
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
