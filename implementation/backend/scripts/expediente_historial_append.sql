-- Añade UNA entrada a `documentacion.historial[]` sin leer y reescribir la documentación
-- entera (regla de las escrituras atómicas), y SIEMPRE deja una LISTA.
--
-- Por qué (23/11/2026, 26RES060_303): tres servicios creaban el historial, cuando aún no
-- existía, con `set_expediente_doc_field(..., 'historial', [entrada])`. Esa RPC hace
-- `to_jsonb(p_value text)`: la lista llegaba como TEXTO ('[{"fecha":…}]') y la pestaña del
-- CEE caía con «(intermediate value) || []).filter is not a function». Ocho expedientes
-- con el historial en texto, enderezados ese día. Y `merge_expediente_doc_json` sobre una
-- clave que no existe deja un `{}` delante. Esta función cubre los tres casos:
--   · historial ya es lista  → la entrada se añade al final;
--   · historial es un texto con una lista dentro (lo que dejó el fallo) → se convierte y se añade;
--   · no hay historial (o es otra cosa) → nace la lista con la entrada.
create or replace function public.expediente_historial_append(p_expediente_id uuid, p_entrada jsonb)
returns void
language sql
security definer
set search_path = public
as $$
    update public.expedientes
    set documentacion = jsonb_set(
            coalesce(documentacion, '{}'::jsonb), '{historial}',
            (case jsonb_typeof(documentacion -> 'historial')
                when 'array' then documentacion -> 'historial'
                when 'string' then
                    case when left(btrim(documentacion ->> 'historial'), 1) = '['
                         then (documentacion ->> 'historial')::jsonb
                         else '[]'::jsonb end
                else '[]'::jsonb
             end) || jsonb_build_array(p_entrada),
            true),
        updated_at = now()
    where id = p_expediente_id;
$$;

revoke all on function public.expediente_historial_append(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.expediente_historial_append(uuid, jsonb) to service_role;
