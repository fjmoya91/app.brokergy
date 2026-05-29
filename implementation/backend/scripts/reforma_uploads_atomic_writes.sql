-- =====================================================================
-- Migración: escritura atómica de datos_calculo.reforma_uploads
-- Aplicada en producción 2026-05-29 (Supabase project okfeopwetlxdffrsbfqw).
--
-- Motivo: el flujo de subida de documentación hacía read-modify-write de TODO
-- el JSONB datos_calculo desde el backend. Dos subidas concurrentes a slots
-- distintos (p.ej. caldera y placa a la vez) se pisaban: la última escritura
-- ganaba y borraba la otra (pérdida de datos).
--
-- Solución: dos funciones que actualizan SOLO el slot indicado vía jsonb_set.
-- Cada UPDATE bloquea la fila y lee el valor más reciente, así las escrituras
-- concurrentes a slots distintos se serializan y se preservan todas.
-- =====================================================================

-- Añade (o reemplaza si no es múltiple) una entrada en un slot.
create or replace function public.reforma_append(
    p_id uuid,
    p_slot text,
    p_entry jsonb,
    p_multiple boolean
) returns void
language sql
as $$
  update oportunidades
  set datos_calculo = jsonb_set(
        -- garantizar que existe el objeto reforma_uploads
        coalesce(datos_calculo, '{}'::jsonb)
          || jsonb_build_object('reforma_uploads',
               coalesce(datos_calculo -> 'reforma_uploads', '{}'::jsonb)),
        array['reforma_uploads', p_slot],
        case when p_multiple
          then coalesce(datos_calculo -> 'reforma_uploads' -> p_slot, '[]'::jsonb)
                 || jsonb_build_array(p_entry)
          else jsonb_build_array(p_entry)
        end,
        true
      )
  where id = p_id;
$$;

-- Reemplaza el array completo de un slot (usado por borrado y validación/rechazo,
-- que calculan el nuevo array en el backend a partir de una lectura fresca).
create or replace function public.reforma_replace_slot(
    p_id uuid,
    p_slot text,
    p_array jsonb
) returns void
language sql
as $$
  update oportunidades
  set datos_calculo = jsonb_set(
        coalesce(datos_calculo, '{}'::jsonb)
          || jsonb_build_object('reforma_uploads',
               coalesce(datos_calculo -> 'reforma_uploads', '{}'::jsonb)),
        array['reforma_uploads', p_slot],
        coalesce(p_array, '[]'::jsonb),
        true
      )
  where id = p_id;
$$;

-- GRANT explícito (requerido para que PostgREST/supabase-js puedan invocarlas).
grant execute on function public.reforma_append(uuid, text, jsonb, boolean) to anon, authenticated, service_role;
grant execute on function public.reforma_replace_slot(uuid, text, jsonb) to anon, authenticated, service_role;
