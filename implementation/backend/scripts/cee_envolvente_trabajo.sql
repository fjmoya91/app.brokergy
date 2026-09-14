-- cee_envolvente_trabajo — lo que el certificador señala en el plano de la
-- envolvente, guardado en el EXPEDIENTE para que no dependa del navegador.
--
-- Vivía solo en `localStorage`: sobrevive a recargar, pero no a cambiar de
-- ordenador, ni a limpiar el navegador, ni a que lo siga otra persona. Y aquí
-- hay trabajo de verdad — las ventanas y las puertas se ponen una a una.
--
-- Qué se guarda (`expedientes.cee.envolvente`): por dónde se entra, los huecos
-- de cada pared con sus medidas, qué paredes se han reclasificado y con qué
-- nombre. Son METADATOS: ~2 KB en el peor caso realista. Ni una geometría ni un
-- fichero — la geometría la mide el motor a partir de la referencia catastral y
-- el `.cex` vive en Drive (regla 21).
--
-- REEMPLAZA la clave `envolvente` entera y no toca el resto de `cee`: si el
-- certificador quita un hueco, un MERGE lo dejaría puesto. Lo que no puede
-- pasar es pisar `cee.cee_inicial`, `cee.xml_inicial` ni el seguimiento, y por
-- eso no se escribe la columna entera desde Node.
--
-- Aplicar en Supabase (MCP apply_migration).

CREATE OR REPLACE FUNCTION public.set_expediente_cee_field(
    p_expediente_id uuid,
    p_field         text,
    p_value         jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.expedientes
  SET cee = jsonb_set(
        COALESCE(cee, '{}'::jsonb),
        ARRAY[p_field],
        COALESCE(p_value, 'null'::jsonb),
        true),
      updated_at = now()
  WHERE id = p_expediente_id;
END;
$$;

-- Deny-all por defecto (ver memoria project_supabase_rls_lockdown): solo el
-- backend, que usa la service_role key.
REVOKE EXECUTE ON FUNCTION public.set_expediente_cee_field(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_expediente_cee_field(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_expediente_cee_field(uuid, text, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.set_expediente_cee_field(uuid, text, jsonb) TO service_role;
