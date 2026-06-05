-- expediente_rite_sync — unifica el Certificado RITE entre el slot de fotos
-- (DOC_RITE en oportunidades.datos_calculo.reforma_uploads) y el campo del
-- expediente (expedientes.documentacion.cert_rite_drive_link), que es el que leen
-- el módulo de Documentación, el CIFO y las vistas del lifecycle (el "agente").
--
-- set_expediente_doc_field: escribe (o limpia con NULL) UN campo de documentacion
-- de forma ATÓMICA por clave (jsonb_set), sin pisar el resto del objeto.

CREATE OR REPLACE FUNCTION public.set_expediente_doc_field(p_oportunidad_id uuid, p_field text, p_value text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.expedientes
  SET documentacion = jsonb_set(
        COALESCE(documentacion, '{}'::jsonb),
        ARRAY[p_field],
        CASE WHEN p_value IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_value) END,
        true)
  WHERE oportunidad_id = p_oportunidad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_expediente_doc_field(uuid, text, text) TO anon, authenticated, service_role;

-- BACKFILL (idempotente): para expedientes legacy que tienen el RITE subido en el
-- slot de fotos (DOC_RITE) pero sin cert_rite_drive_link, copiar el enlace.
UPDATE public.expedientes e
SET documentacion = jsonb_set(COALESCE(e.documentacion, '{}'::jsonb), '{cert_rite_drive_link}', to_jsonb(r.link), true)
FROM (
  SELECT o.id AS opp_id,
    COALESCE(
      o.datos_calculo->'reforma_uploads'->'DOC_RITE'->0->>'link',
      'https://drive.google.com/file/d/' || (o.datos_calculo->'reforma_uploads'->'DOC_RITE'->0->>'driveId') || '/view'
    ) AS link
  FROM public.oportunidades o
  WHERE jsonb_typeof(o.datos_calculo->'reforma_uploads'->'DOC_RITE') = 'array'
    AND jsonb_array_length(o.datos_calculo->'reforma_uploads'->'DOC_RITE') > 0
) r
WHERE e.oportunidad_id = r.opp_id
  AND r.link IS NOT NULL
  AND (e.documentacion->>'cert_rite_drive_link') IS NULL;
