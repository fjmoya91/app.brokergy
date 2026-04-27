-- Migración: Añadir columna 'ficha' a la tabla de Oportunidades

ALTER TABLE public.oportunidades ADD COLUMN IF NOT EXISTS ficha TEXT DEFAULT 'RES060';

-- (Opcional) Inicializar valores basados en el ID actual para registros existentes
UPDATE public.oportunidades 
SET ficha = 'RES080' 
WHERE id_oportunidad LIKE '%RES080%';

UPDATE public.oportunidades 
SET ficha = 'RES060' 
WHERE id_oportunidad LIKE '%RES060%';
