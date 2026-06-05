-- docs_concept_enable — habilita/oculta APARTADOS de foto extra por expediente.
--
-- Contexto: el checklist de documentación (buildDocChecklist) deriva los apartados
-- de foto de la simulación original (inputs/landing_funnel). Si el alcance del
-- expediente cambia DESPUÉS (p.ej. un RES060 de aerotermia al que se le añaden
-- ventanas), esos apartados no aparecen. Esta RPC permite al ADMIN habilitar un
-- apartado concreto para ESE expediente, sin tocar el cálculo: se guarda en
-- datos_calculo.docs_overrides[<slot>] = { "enabled": true }.
--
-- Convive con el flag "waived" (no necesario) en el mismo objeto del slot. Por eso
-- ambas escrituras son MERGE (||) y no se pisan entre sí.
--
-- Escritura ATÓMICA por slot vía jsonb_set (regla de oro: no pisar reforma_uploads).

-- set_doc_override (waived): pasa a MERGE para preservar 'enabled' si existiera.
CREATE OR REPLACE FUNCTION public.set_doc_override(p_id uuid, p_slot text, p_waived boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.oportunidades
  SET datos_calculo = jsonb_set(
        CASE WHEN datos_calculo ? 'docs_overrides'
             THEN datos_calculo
             ELSE jsonb_set(COALESCE(datos_calculo, '{}'::jsonb), '{docs_overrides}', '{}'::jsonb, true)
        END,
        ARRAY['docs_overrides', p_slot],
        COALESCE(datos_calculo #> ARRAY['docs_overrides', p_slot], '{}'::jsonb)
          || jsonb_build_object('waived', p_waived),
        true)
  WHERE id = p_id;
END;
$$;

-- set_doc_concept_enabled (enabled): MERGE del flag 'enabled' en el slot.
CREATE OR REPLACE FUNCTION public.set_doc_concept_enabled(p_id uuid, p_slot text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.oportunidades
  SET datos_calculo = jsonb_set(
        CASE WHEN datos_calculo ? 'docs_overrides'
             THEN datos_calculo
             ELSE jsonb_set(COALESCE(datos_calculo, '{}'::jsonb), '{docs_overrides}', '{}'::jsonb, true)
        END,
        ARRAY['docs_overrides', p_slot],
        COALESCE(datos_calculo #> ARRAY['docs_overrides', p_slot], '{}'::jsonb)
          || jsonb_build_object('enabled', p_enabled),
        true)
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_doc_override(uuid, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_doc_concept_enabled(uuid, text, boolean) TO anon, authenticated, service_role;
