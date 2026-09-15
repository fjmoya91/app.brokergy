-- ============================================================================
-- get_expedientes_list_v4 — RPC del listado de expedientes
-- ============================================================================
-- Sustituye a v3 (2026-09-15). Motivo: el listado pasa a tener COLUMNAS
-- ELEGIBLES (el usuario decide cuáles ve), y cuatro de las que se pueden
-- encender no tenían de dónde salir. Se añade SOLO lo que alguna columna pinta,
-- y siempre escalares o JSONB podados — la regla 22 sigue en pie: nada de traer
-- `documentacion`, ni `seguimiento` entero, ni el XML del CEE.
--
-- Lo que v4 añade sobre v3:
--
--  1. `lote_id` + `lote` {codigo, estado, anio_actuacion}. Además de la columna
--     "Lote", ARREGLA un fallo real: `ExpedientesView.isLoteable` ya filtraba
--     por `!exp.lote_id` y ese campo NUNCA llegaba, así que los 45 expedientes
--     ya loteados se ofrecían como seleccionables y el error solo aparecía al
--     crear el lote (el backend sí lo rechaza: loteService.evaluarElegibilidadBase).
--
--  2. `instalador_asociado_id` + `oportunidades.prescriptor_id` /
--     `.instalador_asociado_id`. La columna "Instalador" resuelve en cascada
--     (ver expedientesColumnas.jsx → `instaladorDe`); con un solo campo, 96 de
--     267 expedientes saldrían sin instalador teniéndolo.
--
--  3. `seguimiento` PODADO a las cuatro claves de fase (cee_inicial, cee_final y
--     sus `_desde`). El objeto entero pesa 279 kB y trae tokens de notificación
--     y sellos de migración que el listado no pinta.
--
-- El payload sube ~40 kB sobre los 1,7 MB de v3 (medido: lote 45 filas,
-- seguimiento podado ~20 kB).
--
-- Tras desplegar el backend que la usa, v3 se puede eliminar:
--   DROP FUNCTION public.get_expedientes_list_v3();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_expedientes_list_v4()
RETURNS TABLE (
    id uuid,
    numero_expediente text,
    estado text,
    prioridad text,
    fecha_fin_cifo date,
    cliente_id uuid,
    oportunidad_id uuid,
    instalador_asociado_id uuid,
    lote_id uuid,
    cee jsonb,
    instalacion jsonb,
    seguimiento jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    clientes jsonb,
    oportunidades jsonb,
    lote jsonb,
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
        e.instalador_asociado_id,
        e.lote_id,
        -- El XML crudo del CEE (hasta 168 kB/fila) solo hace falta en el detalle
        e.cee - 'xml_inicial' - 'xml_final' AS cee,
        e.instalacion,
        -- Solo las fases del CEE y desde cuándo. El resto de `seguimiento` son
        -- tokens de aviso y sellos de migración que ninguna columna pinta.
        jsonb_build_object(
            'cee_inicial',       e.seguimiento -> 'cee_inicial',
            'cee_final',         e.seguimiento -> 'cee_final',
            'cee_inicial_desde', e.seguimiento -> 'cee_inicial_desde',
            'cee_final_desde',   e.seguimiento -> 'cee_final_desde'
        ) AS seguimiento,
        e.created_at,
        e.updated_at,
        CASE WHEN c.id_cliente IS NOT NULL THEN
            jsonb_build_object(
                'id_cliente',          c.id_cliente,
                'nombre_razon_social', c.nombre_razon_social,
                'apellidos',           c.apellidos,
                'dni',                 c.dni,
                'tlf',                 c.tlf,
                'email',               c.email,
                'municipio',           c.municipio,
                'provincia',           c.provincia,
                'ccaa',                c.ccaa,
                'direccion',           c.direccion
            )
        ELSE NULL END AS clientes,
        CASE WHEN o.id IS NOT NULL THEN
            jsonb_build_object(
                'id',                     o.id,
                'id_oportunidad',         o.id_oportunidad,
                'referencia_cliente',     o.referencia_cliente,
                'ref_catastral',          o.ref_catastral,
                'ficha',                  o.ficha,
                -- Quién trajo el expediente: la columna "Instalador" cae a estos
                -- dos cuando `instalacion.instalador_id` no está declarado.
                'prescriptor_id',         o.prescriptor_id,
                'instalador_asociado_id', o.instalador_asociado_id,
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
        CASE WHEN l.id IS NOT NULL THEN
            jsonb_build_object(
                'id',             l.id,
                'codigo',         l.codigo,
                'estado',         l.estado,
                'anio_actuacion', l.anio_actuacion
            )
        ELSE NULL END AS lote,
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
    LEFT JOIN lotes         l ON l.id         = e.lote_id
    ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC
$function$;

-- Mismos permisos que v3: solo el backend (service_role). Ver memoria
-- project_supabase_rls_lockdown — nada de EXECUTE a PUBLIC/anon/authenticated.
REVOKE ALL ON FUNCTION public.get_expedientes_list_v4() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_expedientes_list_v4() TO service_role;
