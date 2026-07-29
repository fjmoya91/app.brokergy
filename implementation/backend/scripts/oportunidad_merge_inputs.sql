-- oportunidad_merge_inputs — MERGE de campos sueltos en datos_calculo.inputs.
--
-- Contexto: los expedientes MIGRADOS (desde XML, AppSheet o las skills de
-- Cowork) crean una oportunidad sintética con inputs mínimos. `fincaInputs.js`
-- rescata superficie / zona climática / nº de plantas del CEE del expediente y
-- del Catastro, y los guarda aquí para no volver a resolverlos (ni a pedirle
-- nada más al WAF del Catastro).
--
-- Escritura ATÓMICA vía jsonb_set: solo toca la clave `inputs`, así que NO pisa
-- escrituras concurrentes a reforma_uploads ni al resto de datos_calculo
-- (regla de oro del proyecto).
--
-- El MERGE es `inputs || p_patch`: el patch gana, así que la llamada debe
-- mandar SOLO los campos que estaban vacíos (fincaInputs nunca pisa un valor
-- corregido a mano).

CREATE OR REPLACE FUNCTION public.oportunidad_merge_inputs(p_id uuid, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RETURN;
  END IF;

  UPDATE public.oportunidades
  SET datos_calculo = jsonb_set(
        COALESCE(datos_calculo, '{}'::jsonb),
        '{inputs}',
        COALESCE(datos_calculo->'inputs', '{}'::jsonb) || p_patch,
        true)
  WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.oportunidad_merge_inputs(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.oportunidad_merge_inputs(uuid, jsonb) TO service_role;
