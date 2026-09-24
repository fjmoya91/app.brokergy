-- cee_envolvente_oportunidad — el trabajo de la envolvente, ANTES de que exista
-- el expediente.
--
-- La envolvente se puede empezar desde la OPORTUNIDAD (botón CE3X de la
-- calculadora): medir el edificio, señalar la entrada, poner las ventanas.
-- Todo eso se guarda aquí, en `oportunidades.datos_calculo.envolvente_cee`, con
-- las MISMAS claves que usa el expediente en `cee` (`envolvente`,
-- `envolvente_fotos`, `envolvente_imagenes`), y `expedienteService` las vuelca
-- a `expedientes.cee` al aceptar. Así se continúa donde se dejó.
--
-- Gemela de `set_expediente_cee_field` y `set_cee_directo_cee_field`.
--
-- POR QUÉ una RPC y no un read-modify-write desde Node: `datos_calculo` pesa
-- 86 KB de media y lo reescriben media docena de rutas (estado, propuesta,
-- subidas); leerlo entero y volver a escribirlo pisaría lo que otra escritura
-- hiciera entre medias (regla 19). Aquí se toca SOLO esa clave.
--
-- REEMPLAZA la clave entera (si el certificador quita un hueco, un MERGE lo
-- dejaría puesto) y no toca el resto de `envolvente_cee`.
--
-- ⚠ El guardado de la calculadora (POST /api/oportunidades) reescribe
-- `datos_calculo` desde el navegador: allí `envolvente_cee` se conserva SIEMPRE
-- de lo que hay en la BD (la copia del navegador no lo trae al día).
--
-- Aplicar en Supabase (MCP apply_migration).

CREATE OR REPLACE FUNCTION public.set_oportunidad_cee_field(
    p_oportunidad_id uuid,
    p_field          text,
    p_value          jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.oportunidades
  SET datos_calculo = jsonb_set(
        COALESCE(datos_calculo, '{}'::jsonb),
        ARRAY['envolvente_cee'],
        jsonb_set(
            COALESCE(datos_calculo->'envolvente_cee', '{}'::jsonb),
            ARRAY[p_field],
            COALESCE(p_value, 'null'::jsonb),
            true),
        true)
  WHERE id = p_oportunidad_id;
END;
$$;

-- Deny-all por defecto (ver memoria project_supabase_rls_lockdown): solo el
-- backend, que usa la service_role key.
REVOKE EXECUTE ON FUNCTION public.set_oportunidad_cee_field(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_oportunidad_cee_field(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_oportunidad_cee_field(uuid, text, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.set_oportunidad_cee_field(uuid, text, jsonb) TO service_role;
