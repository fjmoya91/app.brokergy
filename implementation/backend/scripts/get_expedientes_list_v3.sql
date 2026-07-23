-- ============================================================================
-- get_expedientes_list_v3 — RPC del listado de expedientes
-- ============================================================================
-- Sustituye a v2 (2026-07-22). Motivo: v2 tardaba 2,5 s de media y hasta 15 s
-- bajo carga, y era una de las causas de las caídas de la BD del 21/07.
--
-- Tres cambios, todos para no mover por la red datos que el listado NO usa:
--
--  1. `cee` SIN `xml_inicial` / `xml_final` → 12 MB menos por listado.
--     El XML crudo del CEE solo se usa en el DETALLE (CeeModule,
--     CertificadoRes080Modal, res080Doc.js y backend/services/cifoService.js),
--     que carga el expediente por id con `select('*')`. El listado nunca lo toca.
--
--  2. `datos_calculo.inputs` SIN los blobs anidados (`cee_previo`,
--     `photo_attachments`, `html_propuesta` y el `inputs` recursivo) → 9,3 MB
--     menos. Se podan solo esas cuatro claves, no se usa lista blanca, para no
--     hacer desaparecer ningún campo escalar que algún consumidor espere.
--
--  3. Contadores de incidencias YA AGREGADOS. Antes el route hacía un segundo
--     query `select('id, inc:documentacion->incidencias')` SIN filtro sobre toda
--     la tabla: para leer ese subcampo Postgres tenía que descomprimir la
--     columna `documentacion` entera de las 224 filas (1,5 s de media). Ahora se
--     calcula aquí y se ahorra además un round-trip.
--
-- Tras desplegar el backend que la usa, `get_expedientes_list_v2` se puede
-- eliminar:  DROP FUNCTION public.get_expedientes_list_v2();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_expedientes_list_v3()
RETURNS TABLE (
    id uuid,
    numero_expediente text,
    estado text,
    prioridad text,
    fecha_fin_cifo date,
    cliente_id uuid,
    oportunidad_id uuid,
    cee jsonb,
    instalacion jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    clientes jsonb,
    oportunidades jsonb,
    incidencias_abiertas integer,
    incidencias_graves_abiertas integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout TO '30s'
AS $function$
    SELECT
        e.id,
        e.numero_expediente,
        e.estado,
        e.prioridad,
        e.fecha_fin_cifo,
        e.cliente_id,
        e.oportunidad_id,
        -- El XML crudo del CEE (hasta 168 kB/fila) solo hace falta en el detalle
        e.cee - 'xml_inicial' - 'xml_final' AS cee,
        e.instalacion,
        e.created_at,
        e.updated_at,
        CASE WHEN c.id_cliente IS NOT NULL THEN
            jsonb_build_object(
                'id_cliente',          c.id_cliente,
                'nombre_razon_social', c.nombre_razon_social,
                'apellidos',           c.apellidos,
                'dni',                 c.dni,
                'tlf',                 c.tlf,
                'municipio',           c.municipio,
                'provincia',           c.provincia,
                'ccaa',                c.ccaa,
                'direccion',           c.direccion
            )
        ELSE NULL END AS clientes,
        CASE WHEN o.id IS NOT NULL THEN
            jsonb_build_object(
                'id',                 o.id,
                'id_oportunidad',     o.id_oportunidad,
                'referencia_cliente', o.referencia_cliente,
                'ref_catastral',      o.ref_catastral,
                'ficha',              o.ficha,
                'datos_calculo',      jsonb_build_object(
                    'estado',    o.datos_calculo -> 'estado',
                    -- Mismos campos que antes, pero sin los blobs incrustados
                    'inputs',    (o.datos_calculo -> 'inputs')
                                     - 'cee_previo' - 'photo_attachments'
                                     - 'html_propuesta' - 'inputs',
                    'isReforma', o.datos_calculo -> 'isReforma',
                    'result',    jsonb_build_object(
                        'financials',    o.datos_calculo -> 'result' -> 'financials',
                        -- El ahorro heredado de la oportunidad (para negociar con el S.O.
                        -- antes de que llegue el CEE) vive aqui en las oportunidades
                        -- creadas desde la app; solo las migradas de AppSheet lo traen
                        -- en financials.ahorroKwh. Sin este campo el listado mostraba '-'.
                        'savings',       o.datos_calculo -> 'result' -> 'savings',
                        'selectedModel', o.datos_calculo -> 'result' -> 'selectedModel'
                    )
                )
            )
        ELSE NULL END AS oportunidades,
        -- Badge de incidencias: se agrega aquí para no volver a leer la tabla
        COALESCE((
            SELECT count(*)::int
            FROM jsonb_array_elements(e.documentacion -> 'incidencias') AS i
            WHERE i ->> 'estado' IS DISTINCT FROM 'SUBSANADA'
        ), 0) AS incidencias_abiertas,
        COALESCE((
            SELECT count(*)::int
            FROM jsonb_array_elements(e.documentacion -> 'incidencias') AS i
            WHERE i ->> 'estado' IS DISTINCT FROM 'SUBSANADA'
              AND i ->> 'severidad' = 'GRAVE'
        ), 0) AS incidencias_graves_abiertas
    FROM expedientes e
    LEFT JOIN clientes      c ON c.id_cliente = e.cliente_id
    LEFT JOIN oportunidades o ON o.id         = e.oportunidad_id
    ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC
$function$;

-- Mismos permisos que v2: solo el backend (service_role). Ver memoria
-- project_supabase_rls_lockdown — nada de EXECUTE a PUBLIC/anon/authenticated.
REVOKE ALL ON FUNCTION public.get_expedientes_list_v3() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_expedientes_list_v3() TO service_role;
