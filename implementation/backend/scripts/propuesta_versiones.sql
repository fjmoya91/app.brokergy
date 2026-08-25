-- =====================================================================
-- Versionado de las propuestas enviadas al cliente / instalador.
--
-- Hasta ahora ENVIAR una propuesta no dejaba copia de nada: el PDF se generaba
-- al vuelo para WhatsApp, el email lo rasterizaba el backend desde el HTML, y
-- `datos_calculo.html_propuesta` se SOBRESCRIBÍA en cada envío. Con dos envíos
-- (precio corregido, alcance ampliado) no había forma de saber qué documento
-- tenía el cliente en la mano ni cuál aceptó.
--
-- Cada envío pasa a dejar una entrada en `datos_calculo.propuesta_versiones[]`
-- y un PDF en Drive. En BD SOLO metadatos y el enlace: `html_propuesta` pesa
-- 353 KB de media y hasta 1,35 MB (medido en producción, 2026-08-25), así que
-- guardar el HTML de cada versión repetiría la caída de julio (regla 21).
--
-- Forma de una entrada:
--   { v, fecha, usuario, drive_id, drive_link, file_name,
--     destinatarios: [{ modo, label, email, telefono }],
--     canales: ['email','whatsapp'], envios: [{ canal, destinatario, ok, detalle }],
--     importes: { inversion, caeBonus, irpfDeduction, totalAyuda },
--     aceptada_at }
-- =====================================================================

-- Reserva el siguiente número de versión y añade su entrada en una sola
-- operación. El UPDATE bloquea la fila, así que dos envíos simultáneos no
-- pueden salir con el mismo número (que es justo lo que haría un MAX+1 leído
-- desde Node). Devuelve la entrada tal y como ha quedado escrita.
create or replace function public.propuesta_version_add(
    p_id uuid,
    p_entry jsonb
) returns jsonb
language sql
as $$
  update oportunidades
  set datos_calculo = jsonb_set(
        coalesce(datos_calculo, '{}'::jsonb),
        array['propuesta_versiones'],
        coalesce(datos_calculo -> 'propuesta_versiones', '[]'::jsonb)
          || jsonb_build_array(
               p_entry || jsonb_build_object(
                 'v',
                 coalesce(
                   (select max((e ->> 'v')::int)
                      from jsonb_array_elements(
                             coalesce(datos_calculo -> 'propuesta_versiones', '[]'::jsonb)
                           ) e),
                   0
                 ) + 1
               )
             ),
        true
      ),
      updated_at = now()
  where id = p_id
  returning datos_calculo -> 'propuesta_versiones' -> -1;
$$;

-- Fusiona (MERGE `||`, no reemplazo) datos sobre la entrada de UNA versión.
-- Los resultados de envío se sellan al terminar de mandar y la aceptación
-- llega días después: un reemplazo borraría lo escrito antes.
create or replace function public.propuesta_version_merge(
    p_id uuid,
    p_v int,
    p_patch jsonb
) returns jsonb
language sql
as $$
  update oportunidades
  set datos_calculo = jsonb_set(
        coalesce(datos_calculo, '{}'::jsonb),
        array['propuesta_versiones'],
        coalesce(
          (select jsonb_agg(
                    case when (e ->> 'v')::int = p_v then e || coalesce(p_patch, '{}'::jsonb) else e end
                    order by (e ->> 'v')::int
                  )
             from jsonb_array_elements(
                    coalesce(datos_calculo -> 'propuesta_versiones', '[]'::jsonb)
                  ) e),
          '[]'::jsonb
        ),
        true
      ),
      updated_at = now()
  where id = p_id
  returning datos_calculo -> 'propuesta_versiones';
$$;

-- Postura de seguridad (ver memoria project_supabase_rls_lockdown): las
-- funciones nacen con EXECUTE para PUBLIC — hay que revocarlo explícitamente,
-- y `from public` NO basta: Supabase concede EXECUTE a anon/authenticated por
-- default privileges del esquema. Solo el backend (service_role) invoca RPCs.
revoke execute on function public.propuesta_version_add(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.propuesta_version_merge(uuid, int, jsonb) from public, anon, authenticated;
grant  execute on function public.propuesta_version_add(uuid, jsonb) to service_role;
grant  execute on function public.propuesta_version_merge(uuid, int, jsonb) to service_role;
