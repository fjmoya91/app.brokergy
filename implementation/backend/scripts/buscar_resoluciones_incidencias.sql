-- ============================================================================
-- buscar_resoluciones_incidencias — corpus de "cómo se resolvió esto antes"
-- ============================================================================
-- 2026-07-29. Devuelve incidencias YA SUBSANADAS junto con la explicación de cómo
-- se subsanaron, de TODOS los expedientes, para que un agente pueda consultar
-- precedentes ("¿cómo arreglamos la última incoherencia CEE-factura?") en vez de
-- improvisar. Es la contrapartida de haber empezado a exigir un texto de
-- resolución al cerrar una incidencia.
--
-- POR QUÉ ES UNA RPC Y NO UN SELECT DESDE NODE
-- --------------------------------------------
-- Las incidencias viven dentro de `expedientes.documentacion` (JSONB). Un
-- `select('numero_expediente, documentacion->incidencias')` sin filtro obliga a
-- Postgres a descomprimir la columna `documentacion` ENTERA de todas las filas y
-- luego manda ese JSON por la red: ese patrón exacto tardaba 1,5 s y fue una de
-- las causas de las caídas del 21/07/2026 (ver get_expedientes_list_v3.sql y la
-- regla 22 de CLAUDE.md). Aquí el filtrado y el recorte ocurren DENTRO de la BD y
-- por la red solo viajan las pocas filas pedidas.
--
-- Coste actual (2026-07-29): 230 expedientes, `documentacion` suma 756 kB en total
-- (media 3,4 kB, máx 208 kB) y las 234 incidencias ocupan 168 kB. El escaneo es
-- barato y esto NO está en ninguna ruta caliente: lo invoca un agente a mano.
-- Si algún día `documentacion` vuelve a engordar, esto hay que revisarlo.
--
-- Sin `p_patron` devuelve las últimas resoluciones (las más recientes primero).
-- Solo devuelve incidencias con explicación: una subsanada "a secas" no enseña nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buscar_resoluciones_incidencias(
    p_patron      text DEFAULT NULL,
    p_procedencia text DEFAULT NULL,
    p_limite      int  DEFAULT 20
)
RETURNS TABLE (
    numero_expediente text,
    incidencia        text,
    resolucion        text,
    severidad         text,
    procedencia       text,
    resuelta_por      text,
    resuelta_at       text,
    notas             text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout TO '15s'
AS $function$
    WITH subsanadas AS (
        SELECT
            e.numero_expediente,
            i,
            -- El detalle está en `resolucion`; en las incidencias cerradas desde el
            -- hilo también queda como entrada RESOLUCION. Se coge la primera que
            -- tenga texto de verdad.
            COALESCE(
                NULLIF(i ->> 'resolucion', ''),
                (
                    SELECT NULLIF(c ->> 'texto', '')
                    FROM jsonb_array_elements(COALESCE(i -> 'comentarios', '[]'::jsonb)) AS c
                    WHERE c ->> 'tipo' = 'RESOLUCION'
                      AND COALESCE(c ->> 'texto', '') <> ''
                    ORDER BY c ->> 'fecha' DESC
                    LIMIT 1
                )
            ) AS resolucion
        FROM expedientes e,
             LATERAL jsonb_array_elements(
                 COALESCE(e.documentacion -> 'incidencias', '[]'::jsonb)
             ) AS i
        WHERE i ->> 'estado' = 'SUBSANADA'
    )
    SELECT
        s.numero_expediente,
        s.i ->> 'texto'        AS incidencia,
        s.resolucion,
        s.i ->> 'severidad'    AS severidad,
        s.i ->> 'procedencia'  AS procedencia,
        s.i ->> 'resuelta_por' AS resuelta_por,
        s.i ->> 'resuelta_at'  AS resuelta_at,
        -- Las notas de seguimiento del hilo (el "qué se fue haciendo"), sin metadatos
        COALESCE((
            SELECT array_agg(c ->> 'texto' ORDER BY c ->> 'fecha')
            FROM jsonb_array_elements(COALESCE(s.i -> 'comentarios', '[]'::jsonb)) AS c
            WHERE c ->> 'tipo' = 'NOTA' AND COALESCE(c ->> 'texto', '') <> ''
        ), ARRAY[]::text[]) AS notas
    FROM subsanadas s
    WHERE s.resolucion IS NOT NULL
      AND (p_procedencia IS NULL OR s.i ->> 'procedencia' = p_procedencia)
      AND (
            p_patron IS NULL
            OR s.i ->> 'texto' ILIKE '%' || p_patron || '%'
            OR s.resolucion    ILIKE '%' || p_patron || '%'
          )
    ORDER BY s.i ->> 'resuelta_at' DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limite, 20), 1), 50)
$function$;

-- Solo el backend / MCP (service_role). Ver memoria project_supabase_rls_lockdown:
-- revocar solo a anon/authenticated NO basta, las funciones nacen con EXECUTE para PUBLIC.
REVOKE ALL ON FUNCTION public.buscar_resoluciones_incidencias(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_resoluciones_incidencias(text, text, int) TO service_role;

-- Deshacer:  DROP FUNCTION public.buscar_resoluciones_incidencias(text, text, int);
