-- ─── clientes.sexo ───────────────────────────────────────────────────────────
-- Añade el sexo del titular (HOMBRE/MUJER) para marcar la casilla correspondiente
-- en la Memoria Técnica RITE (.docx). El generador (rite-generator/lib/mapeo.py)
-- marca la casilla 3=Hombre / 5=Mujer según este valor.
--
-- Nullable: los clientes existentes quedan sin marcar hasta que se selecciona el
-- sexo (al crear el cliente, al editar su ficha, o en el popup al "Generar" la
-- Memoria RITE, que persiste la elección en este campo).
--
-- Ya aplicada a producción (2026-06-08) vía Supabase MCP.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS sexo VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_sexo_check'
  ) THEN
    ALTER TABLE public.clientes
      ADD CONSTRAINT clientes_sexo_check
      CHECK (sexo IS NULL OR sexo IN ('HOMBRE', 'MUJER'));
  END IF;
END $$;

COMMENT ON COLUMN public.clientes.sexo IS 'Sexo del titular (HOMBRE/MUJER) — usado para marcar la casilla en la Memoria Técnica RITE. Nullable.';
