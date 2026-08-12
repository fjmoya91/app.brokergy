-- expediente_factura_ocr_update — rellena una factura YA REGISTRADA con lo que
-- ha leído el OCR, sin reescribir `documentacion` entera.
--
-- Por qué hace falta: cuando el cliente sube una factura desde el enlace público,
-- `append_expediente_factura` crea la fila con Nº/fecha/importe EN BLANCO (aún no
-- se ha leído nada). El OCR va detrás, en segundo plano, y necesita volver sobre
-- ESA fila para completarla. Sin esta función habría que leer el array entero,
-- modificarlo en Node y devolverlo: un read-modify-write que se pisa con
-- cualquier otra escritura concurrente sobre `documentacion` (mismo motivo que la
-- regla 19 con `reforma_uploads`).
--
-- MERGE, no reemplazo (`||` sobre el objeto): así el parche solo toca las claves
-- que trae y nunca borra lo que un humano ya hubiera corregido a mano.
-- Solo actúa sobre la fila con ese drive_id.

CREATE OR REPLACE FUNCTION public.update_expediente_factura_by_driveid(
  p_oportunidad_id uuid,
  p_drive_id text,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.expedientes e
  SET documentacion = jsonb_set(
        COALESCE(e.documentacion, '{}'::jsonb),
        '{facturas}',
        COALESCE((
          SELECT jsonb_agg(
                   CASE WHEN f->>'drive_id' = p_drive_id THEN f || p_patch ELSE f END
                   ORDER BY ord
                 )
          FROM jsonb_array_elements(COALESCE(e.documentacion->'facturas', '[]'::jsonb))
               WITH ORDINALITY AS t(f, ord)
        ), '[]'::jsonb),
        true)
  WHERE e.oportunidad_id = p_oportunidad_id
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(e.documentacion->'facturas', '[]'::jsonb)) f
      WHERE f->>'drive_id' = p_drive_id
    );
END;
$$;

-- La llama SOLO el backend, que usa la service role key. Nada de anon/authenticated
-- (ver memoria project_supabase_rls_lockdown): esta función escribe en expedientes.
REVOKE ALL ON FUNCTION public.update_expediente_factura_by_driveid(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_expediente_factura_by_driveid(uuid, text, jsonb) TO service_role;
