-- Subsana las incidencias ABIERTAS de los expedientes de un lote que ha superado
-- la verificación (dictamen favorable). Lo llama loteDocs.subsanarIncidenciasVerificadas
-- al pasar el lote a VERIFICADO (o más allá) desde un estado anterior.
--
-- Solo cierra las registradas HASTA `p_hasta` (el momento de la verificación): una
-- incidencia abierta después —un requerimiento del Gestor Autonómico— no la ha
-- resuelto ningún dictamen y se queda abierta.
--
-- UNA sentencia y solo la clave `incidencias`: el resto de `documentacion` no se
-- reescribe (un read-modify-write desde Node se pisaría con el autoguardado).
-- Cada incidencia cerrada lleva en su hilo la entrada RESOLUCION, igual que al
-- pulsar OK en la app. Un RECHAZADO no se toca.
--
-- Devuelve una fila por expediente con cuántas cerró.

CREATE OR REPLACE FUNCTION public.subsanar_incidencias_lote(
    p_lote_id uuid,
    p_hasta timestamptz,
    p_resolucion text,
    p_usuario text DEFAULT 'SISTEMA'
)
RETURNS TABLE (numero_expediente text, cerradas integer)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_ahora text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
    RETURN QUERY
    WITH objetivo AS (
        SELECT e.id,
               e.numero_expediente::text AS numero,
               (SELECT count(*)::int
                  FROM jsonb_array_elements(e.documentacion -> 'incidencias') i
                 WHERE COALESCE(i ->> 'estado', 'ABIERTA') <> 'SUBSANADA'
                   AND (i ->> 'fecha') IS NOT NULL
                   AND (i ->> 'fecha')::timestamptz <= p_hasta) AS n
          FROM public.expedientes e
         WHERE e.lote_id = p_lote_id
           AND COALESCE(e.estado, '') <> 'RECHAZADO'
           AND jsonb_typeof(e.documentacion -> 'incidencias') = 'array'
    ),
    upd AS (
        UPDATE public.expedientes e
           SET documentacion = jsonb_set(
                   e.documentacion,
                   '{incidencias}',
                   (SELECT jsonb_agg(
                        CASE
                          WHEN COALESCE(i ->> 'estado', 'ABIERTA') <> 'SUBSANADA'
                           AND (i ->> 'fecha') IS NOT NULL
                           AND (i ->> 'fecha')::timestamptz <= p_hasta
                          THEN i || jsonb_build_object(
                                 'estado', 'SUBSANADA',
                                 'resuelta_at', v_ahora,
                                 'resuelta_por', p_usuario,
                                 'resolucion', p_resolucion,
                                 'comentarios',
                                   COALESCE(i -> 'comentarios', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                                     'id', (extract(epoch FROM clock_timestamp()) * 1000)::bigint::text
                                           || '_c' || substr(md5(random()::text), 1, 5),
                                     'texto', p_resolucion,
                                     'autor', p_usuario,
                                     'tipo', 'RESOLUCION',
                                     'fecha', v_ahora)))
                          ELSE i
                        END ORDER BY ord)
                      FROM jsonb_array_elements(e.documentacion -> 'incidencias') WITH ORDINALITY AS t(i, ord)),
                   false),
               updated_at = now()
          FROM objetivo o
         WHERE e.id = o.id AND o.n > 0
        RETURNING o.numero, o.n
    )
    SELECT upd.numero, upd.n FROM upd;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.subsanar_incidencias_lote(uuid, timestamptz, text, text) TO service_role;
