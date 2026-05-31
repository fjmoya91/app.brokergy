-- docs_overrides — permite al ADMIN marcar un documento obligatorio como
-- "no necesario" (p.ej. el vídeo del recorrido ya cubre fachada/patios/ventanas).
-- El override vive en datos_calculo.docs_overrides[<slot>] = { "waived": true|false }.
--
-- Escritura ATÓMICA por slot vía jsonb_set: solo toca la clave docs_overrides,
-- así no pisa escrituras concurrentes a reforma_uploads (regla de oro del proyecto).

CREATE OR REPLACE FUNCTION public.set_doc_override(p_id uuid, p_slot text, p_waived boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.oportunidades
  SET datos_calculo = jsonb_set(
        -- garantiza que exista el objeto docs_overrides antes de fijar el slot
        CASE WHEN datos_calculo ? 'docs_overrides'
             THEN datos_calculo
             ELSE jsonb_set(COALESCE(datos_calculo, '{}'::jsonb), '{docs_overrides}', '{}'::jsonb, true)
        END,
        ARRAY['docs_overrides', p_slot],
        jsonb_build_object('waived', p_waived),
        true)
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_doc_override(uuid, text, boolean) TO anon, authenticated, service_role;
