-- ============================================================================
-- Qué construcciones del Catastro CUENTAN en una oportunidad.
--
-- Se marca en la ficha técnica al abrirla, y desde 2026-09-14 también desde la
-- envolvente: el certificador ve el plano y se da cuenta de que la planta que
-- consta como almacén es vivienda. Los dos sitios escriben AQUÍ — una sola
-- fuente, o la oportunidad diría una superficie y el certificado otra.
--
-- REGLA — se toca SOLO `inputs.construcciones*`, nunca `datos_calculo` entera.
-- Esa columna pesa 86 KB de media y 5,3 MB en el peor caso, y un
-- read-modify-write desde Node se pisa con cualquier otra escritura (es la
-- misma razón de `reforma_append`, regla 19). Y sobre todo: NO se tocan
-- `superficie`, `plantas` ni `result`, que son las cifras con las que se le
-- presupuestó al cliente y pueden estar ya en una propuesta firmada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_oportunidad_construcciones(
    p_oportunidad_id uuid,
    p_elegidas       jsonb,      -- ["1/00/01", "1/01/01"]
    p_construcciones jsonb       -- el desglose entero, con su marca
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.oportunidades
  SET datos_calculo = jsonb_set(
        jsonb_set(
          COALESCE(datos_calculo, '{}'::jsonb),
          ARRAY['inputs', 'construcciones_elegidas'],
          COALESCE(p_elegidas, '[]'::jsonb),
          true),
        ARRAY['inputs', 'construcciones'],
        COALESCE(p_construcciones, '[]'::jsonb),
        true)
  WHERE id = p_oportunidad_id;
END;
$$;

-- Deny-all por defecto (ver memoria project_supabase_rls_lockdown): solo el
-- backend, que usa la service_role key.
REVOKE EXECUTE ON FUNCTION public.set_oportunidad_construcciones(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_oportunidad_construcciones(uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_oportunidad_construcciones(uuid, jsonb, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.set_oportunidad_construcciones(uuid, jsonb, jsonb) TO service_role;
