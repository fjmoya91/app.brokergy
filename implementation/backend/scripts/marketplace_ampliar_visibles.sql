-- ============================================================================
-- Ampliar el escaparate: contar también instalaciones INICIADAS y sacar a TODOS
-- los instaladores con al menos un expediente asignado (no solo los verificados).
-- 2026-07-07 · Ejecutar en Supabase.
--
-- Categorías por expediente (instalador_asociado_id NOT NULL):
--   FINALIZADA : cee_final REGISTRADO o estado de tramitación final
--   EN CURSO   : cee_inicial REGISTRADO (y no finalizada)
--   INICIADA   : el resto (expediente creado, aún sin CEE inicial)
--   total_instalaciones = finalizadas + en_curso + iniciadas
-- ============================================================================

-- 1) Nueva columna para las iniciadas.
ALTER TABLE instalador_stats ADD COLUMN IF NOT EXISTS num_iniciadas INT NOT NULL DEFAULT 0;

-- 2) Función de stats v4: añade num_iniciadas.
CREATE OR REPLACE FUNCTION refresh_instalador_stats() RETURNS void LANGUAGE sql AS $$
  WITH exp_econ AS (
    SELECT e.instalador_asociado_id AS iid,
           initcap(lower(NULLIF(COALESCE(o.datos_calculo->'inputs'->>'municipio', e.instalacion->>'municipio'),''))) AS municipio,
           NULLIF(o.datos_calculo->'result'->'financials'->>'caeBonus','')::numeric   AS ayuda,
           NULLIF(o.datos_calculo->'result'->'financials'->>'presupuesto','')::numeric AS presupuesto,
           (e.seguimiento->>'cee_final' = 'REGISTRADO'
              OR e.estado IN ('DOC. COMPLETA','ENVIADO A VERIFICADOR','PTE. PAGO BROKERGY A CLIENTE','FINALIZADO')) AS finalizada,
           (e.seguimiento->>'cee_inicial' = 'REGISTRADO') AS cee_ini_reg
    FROM expedientes e JOIN oportunidades o ON o.id = e.oportunidad_id
    WHERE e.instalador_asociado_id IS NOT NULL
  ),
  cls AS (
    SELECT *,
      finalizada AS es_fin,
      (cee_ini_reg AND NOT finalizada) AS es_curso,
      (NOT finalizada AND NOT cee_ini_reg) AS es_iniciada,
      (finalizada OR cee_ini_reg) AS verificada
    FROM exp_econ
  ),
  agg AS (
    SELECT iid,
      count(*) FILTER (WHERE es_fin)      AS num_finalizadas,
      count(*) FILTER (WHERE es_curso)    AS num_en_curso,
      count(*) FILTER (WHERE es_iniciada) AS num_iniciadas,
      sum(ayuda) FILTER (WHERE verificada) AS suma_ayudas,
      avg(ayuda) FILTER (WHERE verificada AND ayuda > 0) AS ayuda_media,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY presupuesto) FILTER (WHERE verificada AND presupuesto > 0) AS p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY presupuesto) FILTER (WHERE verificada AND presupuesto > 0) AS p75,
      -- zona de trabajo: incluye municipios de cualquier expediente asignado
      array_agg(DISTINCT municipio) FILTER (WHERE municipio IS NOT NULL) AS municipios
    FROM cls GROUP BY iid
  ),
  rev AS (
    SELECT instalador_id AS iid, round(avg(puntuacion), 2) AS rating, count(*) AS n
    FROM instalador_resenas WHERE estado = 'PUBLICADA' GROUP BY 1
  )
  INSERT INTO instalador_stats
    (instalador_id, num_finalizadas, num_en_curso, num_iniciadas, suma_ayudas_cliente, ayuda_media,
     presupuesto_p25, presupuesto_p75, municipios, rating_media, num_resenas, updated_at)
  SELECT a.iid, COALESCE(a.num_finalizadas,0), COALESCE(a.num_en_curso,0), COALESCE(a.num_iniciadas,0),
         a.suma_ayudas, round(a.ayuda_media), a.p25, a.p75, a.municipios, r.rating, COALESCE(r.n,0), now()
  FROM agg a LEFT JOIN rev r ON r.iid = a.iid
  ON CONFLICT (instalador_id) DO UPDATE SET
    num_finalizadas    = EXCLUDED.num_finalizadas,
    num_en_curso       = EXCLUDED.num_en_curso,
    num_iniciadas      = EXCLUDED.num_iniciadas,
    suma_ayudas_cliente= EXCLUDED.suma_ayudas_cliente,
    ayuda_media        = EXCLUDED.ayuda_media,
    presupuesto_p25    = EXCLUDED.presupuesto_p25,
    presupuesto_p75    = EXCLUDED.presupuesto_p75,
    municipios         = EXCLUDED.municipios,
    rating_media       = EXCLUDED.rating_media,
    num_resenas        = EXCLUDED.num_resenas,
    updated_at         = now();
$$;
SELECT refresh_instalador_stats();

-- 3) Generar marketplace_slug a los instaladores CON expediente que no lo tengan.
WITH cand AS (
  SELECT DISTINCT p.id_empresa, p.created_at,
    regexp_replace(trim(both '-' FROM regexp_replace(
      lower(translate(COALESCE(NULLIF(p.acronimo,''), p.razon_social),
        'áàäâéèëêíìïîóòöôúùüûñçÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ','aaaaeeeeiiiioooouuuuncAAAAEEEEIIIIOOOOUUUUNC')),
      '[^a-z0-9]+','-','g')),'(^-|-$)','','g') AS base
  FROM prescriptores p JOIN expedientes e ON e.instalador_asociado_id = p.id_empresa
  WHERE p.tipo_empresa::text='INSTALADOR' AND p.marketplace_slug IS NULL
    AND upper(COALESCE(p.acronimo,p.razon_social)) <> 'BROKERGY'
), numbered AS (
  SELECT id_empresa, base, row_number() OVER (PARTITION BY base ORDER BY created_at) rn FROM cand
)
UPDATE prescriptores p
SET marketplace_slug = left(CASE WHEN n.rn=1 THEN n.base ELSE n.base||'-'||n.rn END, 80)
FROM numbered n WHERE p.id_empresa=n.id_empresa AND n.base<>'';

-- 4) Hacer visibles a TODOS los instaladores con expediente + slug + coordenadas
--    (los que aún no tengan lat/lng se activan al geocodificar: geocode_instaladores.js).
UPDATE prescriptores p SET visible_marketplace = true
WHERE p.tipo_empresa::text='INSTALADOR' AND p.lat IS NOT NULL AND p.marketplace_slug IS NOT NULL
  AND upper(COALESCE(p.acronimo,p.razon_social)) <> 'BROKERGY'
  AND EXISTS (SELECT 1 FROM expedientes e WHERE e.instalador_asociado_id = p.id_empresa);

SELECT count(*) FILTER (WHERE visible_marketplace) AS visibles,
       count(*) FILTER (WHERE visible_marketplace AND lat IS NULL) AS visibles_sin_geo
FROM prescriptores WHERE tipo_empresa::text='INSTALADOR';
