-- oportunidades_set_via_fm — escribe `datos_calculo.via_fm` de VARIAS oportunidades.
--
-- Lo usa SOLO el relleno de las antiguas (scripts/backfill_via_fm.mjs --escribir).
-- Las nuevas lo escriben al guardar (logic/guardarOportunidad.js → POST /oportunidades).
--
-- `via_fm` es el resumen en escalares de la vía VIGENTE frente a la del FACTOR
-- MULTIPLICADOR (logic/viaFm.js), ~300 B por fila, para que el listado lo enseñe
-- sin traer el JSONB entero (regla 22). Es de ADMIN (utils/financialScrub.js).
--
-- REGLA — escritura ATÓMICA por jsonb_set: solo toca la clave `via_fm`, no pisa
-- `inputs`, `result`, `reforma_uploads` ni lo que se esté escribiendo a la vez.
--
-- REGLA — no mueve `updated_at`. La tabla de Oportunidades se ordena por él: un
-- relleno que lo tocara subiría las ~600 oportunidades a «recién modificadas» y
-- desordenaría la cartera. Por eso el trigger `update_oportunidades_updated_at`
-- se apaga DENTRO de la transacción (DDL transaccional: si algo falla, vuelve a
-- estar encendido) y con `lock_timeout`, porque ALTER TABLE toma un bloqueo
-- exclusivo de la tabla durante los milisegundos que dura el lote.
--
-- REGLA — no pisa un `via_fm` que ya exista salvo `p_forzar`: si alguien ha
-- guardado la oportunidad entre la lectura del script y la escritura, el suyo es
-- el bueno (sale de su cálculo de ahora).
--
-- Aplicar UNA vez (con el «sí» de Fran) en el SQL editor de Supabase.

CREATE OR REPLACE FUNCTION public.oportunidades_set_via_fm(p_filas jsonb, p_forzar boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RETURN 0;
  END IF;
  IF jsonb_array_length(p_filas) > 200 THEN
    RAISE EXCEPTION 'oportunidades_set_via_fm: como mucho 200 filas por llamada';
  END IF;

  PERFORM set_config('lock_timeout', '3s', true);
  ALTER TABLE public.oportunidades DISABLE TRIGGER update_oportunidades_updated_at;

  UPDATE public.oportunidades o
     SET datos_calculo = jsonb_set(COALESCE(o.datos_calculo, '{}'::jsonb), '{via_fm}', f.via, true)
    FROM jsonb_to_recordset(p_filas) AS f(id uuid, via jsonb)
   WHERE o.id = f.id
     AND f.via IS NOT NULL
     AND jsonb_typeof(f.via) = 'object'
     AND (p_forzar OR o.datos_calculo->'via_fm' IS NULL OR jsonb_typeof(o.datos_calculo->'via_fm') = 'null');
  GET DIAGNOSTICS n = ROW_COUNT;

  ALTER TABLE public.oportunidades ENABLE TRIGGER update_oportunidades_updated_at;
  RETURN n;
END;
$$;

-- Supabase concede EXECUTE a anon/authenticated por privilegios por defecto: se
-- quitan a mano (es SECURITY DEFINER y apaga un trigger; la clave anónima es pública).
REVOKE EXECUTE ON FUNCTION public.oportunidades_set_via_fm(jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.oportunidades_set_via_fm(jsonb, boolean) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.oportunidades_set_via_fm(jsonb, boolean) TO service_role;
