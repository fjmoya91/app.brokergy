-- ============================================================================
-- Estado RECHAZADO de un expediente (2026-09-27)
-- ============================================================================
-- Un expediente puede caerse: lo rechaza el verificador, el MITECO, el S.O., el
-- cliente desiste, la instalación no es conforme… Hasta ahora no había forma de
-- decirlo y se quedaba en el estado en el que lo pilló, contando en los KPIs y
-- en el parte diario como si siguiera vivo.
--
-- RECHAZADO es TERMINAL como FINALIZADO, pero es una SALIDA y no un paso del
-- ciclo: se llega desde cualquier estado, y por eso se guarda de dónde venía
-- (`estado_previo_rechazo`) para poder REABRIRLO sin adivinar.
--
-- REGLA — se entra y se sale SOLO por estas dos RPC, cada una UNA sentencia:
-- el estado, los campos del rechazo y el asiento del historial se escriben a la
-- vez o no se escribe nada. El historial va con `||` sobre la fila bloqueada,
-- no con un read-modify-write desde Node (regla 19). El PUT general rechaza
-- tanto poner RECHAZADO como sacar de él (routes/expedientes.js).
-- ============================================================================

ALTER TABLE public.expedientes
    ADD COLUMN IF NOT EXISTS rechazado_por          text,
    ADD COLUMN IF NOT EXISTS motivo_rechazo_cat     text,
    ADD COLUMN IF NOT EXISTS motivo_rechazo         text,
    ADD COLUMN IF NOT EXISTS rechazo_adjunto_url    text,
    ADD COLUMN IF NOT EXISTS fecha_rechazo          timestamptz,
    ADD COLUMN IF NOT EXISTS estado_previo_rechazo  text;

ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_rechazado_por_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_rechazado_por_check
    CHECK (rechazado_por IS NULL OR rechazado_por = ANY (ARRAY[
        'VERIFICADOR','MITECO','SO','CLIENTE','INSTALADOR','BROKERGY']));

ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_motivo_rechazo_cat_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_motivo_rechazo_cat_check
    CHECK (motivo_rechazo_cat IS NULL OR motivo_rechazo_cat = ANY (ARRAY[
        'DOC_INSUFICIENTE','AHORRO_NO_JUSTIFICADO','EQUIPO_NO_VALIDO','FUERA_PLAZO',
        'DUPLICADO','CLIENTE_DESISTE','INSTALACION_NO_CONFORME','OTRO']));

-- Un RECHAZADO sin quién, por qué y cuándo no se puede ni explicar ni reabrir.
ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_rechazo_completo_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_rechazo_completo_check
    CHECK (estado IS DISTINCT FROM 'RECHAZADO' OR (
        rechazado_por IS NOT NULL
        AND motivo_rechazo_cat IS NOT NULL
        AND char_length(btrim(coalesce(motivo_rechazo, ''))) >= 20
        AND fecha_rechazo IS NOT NULL));

-- ── Rechazar ────────────────────────────────────────────────────────────────
-- Devuelve la fila actualizada, o NADA si el expediente no existe o ya estaba
-- RECHAZADO (la ruta lo traduce a 404 / 409).
CREATE OR REPLACE FUNCTION public.expediente_rechazar(
    p_id uuid,
    p_rechazado_por text,
    p_motivo_cat text,
    p_motivo text,
    p_adjunto_url text,
    p_usuario text
)
RETURNS SETOF public.expedientes
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
    UPDATE public.expedientes e
    SET estado_previo_rechazo = e.estado,          -- el valor ANTERIOR: en un UPDATE
        estado                = 'RECHAZADO',       -- todo el SET lee la fila vieja
        rechazado_por         = p_rechazado_por,
        motivo_rechazo_cat    = p_motivo_cat,
        motivo_rechazo        = btrim(p_motivo),
        rechazo_adjunto_url   = nullif(btrim(coalesce(p_adjunto_url, '')), ''),
        fecha_rechazo         = now(),
        updated_at            = now(),
        documentacion = jsonb_set(
            coalesce(e.documentacion, '{}'::jsonb),
            '{historial}',
            (CASE WHEN jsonb_typeof(e.documentacion -> 'historial') = 'array'
                  THEN e.documentacion -> 'historial' ELSE '[]'::jsonb END)
            || jsonb_build_array(jsonb_build_object(
                'id',            (floor(extract(epoch FROM clock_timestamp()) * 1000))::bigint::text || '_rechazo',
                'tipo',          'estado',
                'estado',        'RECHAZADO',
                'fecha',         to_jsonb(now()),
                'usuario',       p_usuario,
                'motivo',        btrim(p_motivo),
                'motivo_cat',    p_motivo_cat,
                'rechazado_por', p_rechazado_por,
                'estado_previo', e.estado,
                'adjunto_url',   nullif(btrim(coalesce(p_adjunto_url, '')), '')
            ))
        )
    WHERE e.id = p_id
      AND e.estado IS DISTINCT FROM 'RECHAZADO'
    RETURNING e.*;
$function$;

-- ── Reabrir ─────────────────────────────────────────────────────────────────
-- Vuelve al estado en el que estaba al rechazarlo y limpia los campos del
-- rechazo: lo que pasó queda en el historial, que es donde se consulta. Sin
-- estado previo guardado (no debería ocurrir) vuelve al inicio del ciclo.
CREATE OR REPLACE FUNCTION public.expediente_reabrir(
    p_id uuid,
    p_usuario text
)
RETURNS SETOF public.expedientes
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
    UPDATE public.expedientes e
    SET estado                = coalesce(nullif(e.estado_previo_rechazo, ''), 'PTE. CEE INICIAL'),
        rechazado_por         = NULL,
        motivo_rechazo_cat    = NULL,
        motivo_rechazo        = NULL,
        rechazo_adjunto_url   = NULL,
        fecha_rechazo         = NULL,
        estado_previo_rechazo = NULL,
        updated_at            = now(),
        documentacion = jsonb_set(
            coalesce(e.documentacion, '{}'::jsonb),
            '{historial}',
            (CASE WHEN jsonb_typeof(e.documentacion -> 'historial') = 'array'
                  THEN e.documentacion -> 'historial' ELSE '[]'::jsonb END)
            || jsonb_build_array(jsonb_build_object(
                'id',       (floor(extract(epoch FROM clock_timestamp()) * 1000))::bigint::text || '_reapertura',
                'tipo',     'estado',
                'estado',   coalesce(nullif(e.estado_previo_rechazo, ''), 'PTE. CEE INICIAL'),
                'fecha',    to_jsonb(now()),
                'usuario',  p_usuario,
                'texto',    'Expediente REABIERTO (estaba RECHAZADO desde el '
                            || to_char(e.fecha_rechazo AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY') || ').',
                'motivo',   e.motivo_rechazo,
                'reapertura', true
            ))
        )
    WHERE e.id = p_id
      AND e.estado = 'RECHAZADO'
    RETURNING e.*;
$function$;

-- Solo el backend (service_role). Ver memoria project_supabase_rls_lockdown.
REVOKE ALL ON FUNCTION public.expediente_rechazar(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expediente_reabrir(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expediente_rechazar(uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expediente_reabrir(uuid, text) TO service_role;
