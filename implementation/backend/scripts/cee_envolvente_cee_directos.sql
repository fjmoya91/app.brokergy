-- cee_envolvente_cee_directos — el mismo trabajo de la envolvente, para los
-- CEE contratados SUELTOS.
--
-- Gemela de `set_expediente_cee_field` (ver `cee_envolvente_trabajo.sql`) sobre
-- la tabla `cee_directos`. Guarda lo que el certificador señala en el plano
-- (`cee.envolvente`), la imagen que sustituye a la de Catastro
-- (`cee.envolvente_imagenes`), las fotos de cada cerramiento
-- (`cee.envolvente_fotos`) y qué construcciones del Catastro cuentan
-- (`cee.construcciones_elegidas`).
--
-- POR QUÉ una función aparte y no un `p_tabla text`: son dos tablas distintas y
-- el mismo UUID no vale en las dos. Una función que eligiera tabla por parámetro
-- podría escribir en el negocio equivocado con un error de una letra, y aquí se
-- escribe encima de `cee`, donde vive el certificado.
--
-- REEMPLAZA la clave entera y no toca el resto de `cee`: si el certificador
-- quita un hueco, un MERGE lo dejaría puesto. Y se escribe SOLO esa clave, para
-- no pisar `cee.cee_inicial` ni el seguimiento — el módulo CEE autoguarda y
-- puede ir un refetch por detrás.
--
-- ⚠ En `cee_directos` NO hay `updated_at = now()` a mano: lo sella el trigger
-- `cee_directos_touch_updated`.
--
-- Aplicar en Supabase (MCP apply_migration).

CREATE OR REPLACE FUNCTION public.set_cee_directo_cee_field(
    p_cee_directo_id uuid,
    p_field          text,
    p_value          jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.cee_directos
  SET cee = jsonb_set(
        COALESCE(cee, '{}'::jsonb),
        ARRAY[p_field],
        COALESCE(p_value, 'null'::jsonb),
        true)
  WHERE id = p_cee_directo_id;
END;
$$;

-- Deny-all por defecto (ver memoria project_supabase_rls_lockdown): solo el
-- backend, que usa la service_role key.
REVOKE EXECUTE ON FUNCTION public.set_cee_directo_cee_field(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_cee_directo_cee_field(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_cee_directo_cee_field(uuid, text, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.set_cee_directo_cee_field(uuid, text, jsonb) TO service_role;
