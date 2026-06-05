-- expediente_facturas_sync — unifica las FACTURAS entre el slot de fotos
-- (DOC_FACTURAS en oportunidades.datos_calculo.reforma_uploads) y la lista del
-- expediente (expedientes.documentacion.facturas[]), que es la que cuentan el
-- módulo de Documentación y las vistas del lifecycle (el "agente", num_facturas).
--
-- Una factura subida en el popup crea una entrada en documentacion.facturas con
-- Nº/fecha/importe en blanco + el PDF enlazado (origen:'popup', drive_id para dedup).
-- El admin rellena los metadatos después. Escrituras ATÓMICas por clave (jsonb).

-- Append idempotente: no añade si ya existe una factura con ese drive_id.
CREATE OR REPLACE FUNCTION public.append_expediente_factura(p_oportunidad_id uuid, p_factura jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.expedientes e
  SET documentacion = jsonb_set(
        COALESCE(e.documentacion, '{}'::jsonb),
        '{facturas}',
        COALESCE(e.documentacion->'facturas', '[]'::jsonb) || p_factura,
        true)
  WHERE e.oportunidad_id = p_oportunidad_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(e.documentacion->'facturas', '[]'::jsonb)) f
      WHERE f->>'drive_id' = (p_factura->>'drive_id')
    );
END;
$$;

-- Quita la(s) factura(s) con ese drive_id (solo afecta a las de origen popup, que
-- son las únicas que guardan drive_id).
CREATE OR REPLACE FUNCTION public.remove_expediente_factura_by_driveid(p_oportunidad_id uuid, p_drive_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.expedientes e
  SET documentacion = jsonb_set(
        COALESCE(e.documentacion, '{}'::jsonb),
        '{facturas}',
        COALESCE((
          SELECT jsonb_agg(f)
          FROM jsonb_array_elements(COALESCE(e.documentacion->'facturas', '[]'::jsonb)) f
          WHERE f->>'drive_id' IS DISTINCT FROM p_drive_id
        ), '[]'::jsonb),
        true)
  WHERE e.oportunidad_id = p_oportunidad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_expediente_factura(uuid, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_expediente_factura_by_driveid(uuid, text) TO anon, authenticated, service_role;

-- BACKFILL (idempotente): facturas subidas en el slot de fotos (DOC_FACTURAS) que
-- aún no están en documentacion.facturas → añadirlas con metadatos en blanco.
WITH popup_facturas AS (
  SELECT o.id AS opp_id,
         elem->>'driveId' AS drive_id,
         COALESCE(elem->>'link', 'https://drive.google.com/file/d/' || (elem->>'driveId') || '/view') AS link
  FROM public.oportunidades o,
       jsonb_array_elements(COALESCE(o.datos_calculo->'reforma_uploads'->'DOC_FACTURAS', '[]'::jsonb)) elem
  WHERE jsonb_typeof(o.datos_calculo->'reforma_uploads'->'DOC_FACTURAS') = 'array'
),
to_add AS (
  SELECT e.id AS exp_id, pf.drive_id, pf.link
  FROM public.expedientes e
  JOIN popup_facturas pf ON pf.opp_id = e.oportunidad_id
  WHERE pf.drive_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(e.documentacion->'facturas', '[]'::jsonb)) f
      WHERE f->>'drive_id' = pf.drive_id OR f->>'drive_link' = pf.link
    )
),
agg AS (
  SELECT exp_id, jsonb_agg(jsonb_build_object(
           'numero_factura', '', 'fecha_factura', NULL, 'importe_sin_iva', 0,
           'drive_link', link, 'drive_id', drive_id, 'origen', 'popup'
         )) AS nuevas
  FROM to_add GROUP BY exp_id
)
UPDATE public.expedientes e
SET documentacion = jsonb_set(COALESCE(e.documentacion, '{}'::jsonb), '{facturas}',
      COALESCE(e.documentacion->'facturas', '[]'::jsonb) || agg.nuevas, true)
FROM agg WHERE e.id = agg.exp_id;
