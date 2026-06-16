-- =====================================================================
-- Migración: escritura atómica de documentacion.cifo_extra_annexes
--
-- Motivo: la subida/borrado de anexos extra del CIFO/RES080 hacía
-- read-modify-write de TODO el JSONB `documentacion` (tanto en el backend
-- POST/DELETE como en el PUT del frontend que reenvía documentacion completo).
-- Dos escrituras concurrentes (subir 2 anexos casi a la vez, o un anexo +
-- cualquier otro guardado de documentacion) se pisaban: la última ganaba y
-- borraba la otra (pérdida de anexos). Mismo anti-patrón que reforma_uploads.
--
-- Solución: dos funciones que tocan SOLO documentacion.cifo_extra_annexes vía
-- jsonb_set en un único UPDATE. Cada UPDATE bloquea la fila y, en READ
-- COMMITTED, reevalúa sobre el valor más reciente, así las escrituras
-- concurrentes se serializan y se preservan todas. Más ligero que el RMW
-- anterior: 1 viaje a la BD y el blob `documentacion` no sale de Postgres.
-- =====================================================================

-- Añade un anexo al final del array (lo crea si no existe). Devuelve el array
-- resultante para confirmación.
create or replace function public.cifo_annex_append(
    p_id uuid,
    p_annex jsonb
) returns jsonb
language sql
as $$
  update expedientes
  set documentacion = jsonb_set(
        coalesce(documentacion, '{}'::jsonb),
        array['cifo_extra_annexes'],
        coalesce(documentacion -> 'cifo_extra_annexes', '[]'::jsonb)
          || jsonb_build_array(p_annex),
        true
      ),
      updated_at = now()
  where id = p_id
  returning documentacion -> 'cifo_extra_annexes';
$$;

-- Elimina del array el anexo cuyo driveId coincide. Devuelve el array resultante.
create or replace function public.cifo_annex_remove(
    p_id uuid,
    p_drive_id text
) returns jsonb
language sql
as $$
  update expedientes
  set documentacion = jsonb_set(
        coalesce(documentacion, '{}'::jsonb),
        array['cifo_extra_annexes'],
        coalesce((
          select jsonb_agg(elem)
          from jsonb_array_elements(
                 coalesce(documentacion -> 'cifo_extra_annexes', '[]'::jsonb)
               ) as elem
          where elem ->> 'driveId' is distinct from p_drive_id
        ), '[]'::jsonb),
        true
      ),
      updated_at = now()
  where id = p_id
  returning documentacion -> 'cifo_extra_annexes';
$$;

-- GRANT explícito (requerido para que PostgREST/supabase-js puedan invocarlas).
grant execute on function public.cifo_annex_append(uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.cifo_annex_remove(uuid, text) to anon, authenticated, service_role;
