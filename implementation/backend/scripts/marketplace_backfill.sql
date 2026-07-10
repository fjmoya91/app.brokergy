-- ============================================================================
-- ESCAPARATE DE INSTALADORES — Backfill de datos + función de stats (Fase 1b)
-- Ejecutado en producción 2026-07-06. Idempotente (WHERE IS NULL / ON CONFLICT).
-- Requiere marketplace_schema.sql aplicado antes.
--
-- Resultado real de esta ejecución:
--   · expedientes con instalador: 29 -> 84 (+55; 62 quedan NULL por falta de dato)
--   · marketplace_slug sembrados desde landing_slug: 5
--   · instalador_marcas: 45 vínculos en 27 instaladores (multi-marca recuperado)
--   · instalador_stats: 33 filas, 25 con instalaciones verificadas
--   · lat/lng vía scripts/geocode_instaladores.js: 47/51 (4 sin dirección)
-- ============================================================================

-- ── A) Backfill instalador_asociado_id (prioridad de fuentes; solo IDs que existen) ──
WITH src AS (
  SELECT e.id AS exp_id, COALESCE(
      NULLIF(e.instalacion->>'instalador_id',''),
      NULLIF(o.instalador_asociado_id::text,''),
      NULLIF(o.datos_calculo->>'instalador_asociado_id',''),
      NULLIF(o.prescriptor_id::text,''),
      NULLIF(o.datos_calculo->>'prescriptor_id','')
    ) AS cand
  FROM expedientes e JOIN oportunidades o ON o.id = e.oportunidad_id
  WHERE e.instalador_asociado_id IS NULL
)
UPDATE expedientes e
SET instalador_asociado_id = p.id_empresa
FROM src s
JOIN prescriptores p ON p.id_empresa::text = s.cand
WHERE e.id = s.exp_id AND s.cand ~ '^[0-9a-f-]{36}$';

-- ── B) marketplace_slug desde landing_slug (índice único protege colisiones) ──
UPDATE prescriptores SET marketplace_slug = landing_slug
WHERE marketplace_slug IS NULL AND COALESCE(landing_slug,'') <> '';

-- ── C) instalador_marcas: partir por comas y casar con el catálogo (ignora números/basura) ──
INSERT INTO instalador_marcas (instalador_id, marca_nombre)
SELECT DISTINCT p.id_empresa, m.nombre
FROM prescriptores p
CROSS JOIN LATERAL unnest(
  string_to_array(upper(COALESCE(p.marca_referencia,'') || ',' || COALESCE(p.marca_secundaria,'')), ',')
) AS tok
JOIN aerotermia_marcas m ON upper(trim(m.nombre)) = trim(tok)
WHERE trim(tok) <> ''
ON CONFLICT DO NOTHING;

-- ── D) La función refresh_instalador_stats() se define en marketplace_refresh_stats_fn_v2.
--        Llamar por cron nocturno:  SELECT refresh_instalador_stats();
--        (definición completa aplicada como migración; ver historial de migraciones)
