-- ============================================================================
-- get_expedientes_list_v2 — RPC que alimenta GET /api/expedientes (listado)
--
-- Un solo JOIN en BD: evita 3 round-trips y el timeout que provocaba el
-- `documentacion` pesado. Devuelve un `oportunidades` RECORTADO a propósito:
-- del `datos_calculo` solo viajan las claves que el listado necesita.
--
-- OJO: lo que no esté aquí NO llega al frontend. `computeExpedienteFinancials`
-- hereda la economía de la oportunidad cuando el expediente aún no tiene CEE, y
-- para eso necesita tanto `result.financials` (bono CAE, beneficio) como
-- `result.savings` (ahorro en kWh de las oportunidades creadas en la app; las
-- migradas de AppSheet lo traen en `financials.ahorroKwh`).
--
-- Aplicada en producción el 2026-07-10.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_expedientes_list_v2()
 RETURNS TABLE(id uuid, numero_expediente text, estado text, prioridad text, fecha_fin_cifo date, cliente_id uuid, oportunidad_id uuid, cee jsonb, instalacion jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, clientes jsonb, oportunidades jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
        e.cee,
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
                    'inputs',    o.datos_calculo -> 'inputs',
                    'isReforma', o.datos_calculo -> 'isReforma',
                    'result',    jsonb_build_object(
                        'financials',    o.datos_calculo -> 'result' -> 'financials',
                        'savings',       o.datos_calculo -> 'result' -> 'savings',
                        'selectedModel', o.datos_calculo -> 'result' -> 'selectedModel'
                    )
                )
            )
        ELSE NULL END AS oportunidades
    FROM expedientes e
    LEFT JOIN clientes    c ON c.id_cliente = e.cliente_id
    LEFT JOIN oportunidades o ON o.id       = e.oportunidad_id
    ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC
$function$;
