-- facturacion_certificador — sello de "ya facturado" en los hitos de registro
-- de CEE que Brokergy paga al certificador.
--
-- El sello vive en `expedientes.documentacion.fact_cert`, con un objeto por
-- concepto facturable del expediente:
--
--   { "honorario":    { "factura": "AP232026", "fecha": "2026-07-31", "importe": 60 },
--     "tasa_inicial": { "factura": "AP232026", "fecha": "2026-07-31", "importe": 16.39 },
--     "tasa_final":   { … } }
--
-- Los tres conceptos NO se sellan a la vez: el honorario y la tasa del CEE
-- inicial se devengan con el primer registro, y la tasa del CEE final puede
-- caer meses después. Por eso el sello se escribe con MERGE (`||`) y no con un
-- reemplazo: sellar septiembre no puede borrar lo sellado en julio.
--
-- Aplicar en Supabase (MCP apply_migration).

CREATE OR REPLACE FUNCTION public.merge_expediente_doc_json(
    p_expediente_id uuid,
    p_field         text,
    p_value         jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.expedientes
  SET documentacion = jsonb_set(
        COALESCE(documentacion, '{}'::jsonb),
        ARRAY[p_field],
        COALESCE(documentacion -> p_field, '{}'::jsonb) || COALESCE(p_value, '{}'::jsonb),
        true)
  WHERE id = p_expediente_id;
END;
$$;

-- Deny-all por defecto (ver memoria project_supabase_rls_lockdown): solo el
-- backend, que usa la service_role key.
REVOKE EXECUTE ON FUNCTION public.merge_expediente_doc_json(uuid, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.merge_expediente_doc_json(uuid, text, jsonb) TO service_role;
