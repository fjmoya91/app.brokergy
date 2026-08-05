-- =====================================================================
-- Migración: documentacion.ce3x_capturas (capturas CE3X del RES080)
--
-- El Certificado RES080 (reforma) lleva, cuando la actuación incluye
-- VENTANAS, las capturas de pantalla del CE3X con el detalle de los
-- huecos antes y después de la rehabilitación. Cada fase admite VARIAS
-- (una vivienda cambia más de un tipo de hueco):
--
--   { "antes":   [ { "driveId": "1AbC…", "link": "https://…",
--                    "fileName": "CE3X_VENTANAS_ANTES_1.png",
--                    "mimeType": "image/png", "idx": 1, "at": "2026-…" } ],
--     "despues": [ … ] }
--
-- Las IMÁGENES viven en Drive ("6. ANEXOS CAE"); aquí solo el puntero
-- (regla #21: nunca base64 dentro de un JSONB).
--
-- Escritura ATÓMICA (regla #19): un solo UPDATE con jsonb_set que toca
-- SOLO esa clave. El autoguardado del expediente reenvía `documentacion`
-- entera con una copia que se hidrató al abrir la vista y pisaría las
-- capturas pegadas después — por eso la clave está además en
-- CLAVES_PROTEGIDAS de utils/mergeDocumentacion.js.
-- =====================================================================

-- Versión anterior (una sola captura por fase, sin lista). Se sustituye por
-- el par add/remove; no llegó a usarse en producción.
drop function if exists public.res080_ce3x_set(uuid, text, jsonb);

-- Lista actual de una fase, tolerante a la forma vieja (objeto suelto → lista
-- de uno) y a que la clave no exista todavía.
create or replace function public.res080_ce3x_lista(p_doc jsonb, p_slot text)
returns jsonb
language sql
immutable
as $$
  select case
      when jsonb_typeof(coalesce(p_doc, '{}'::jsonb) #> array['ce3x_capturas', p_slot]) = 'array'
          then p_doc #> array['ce3x_capturas', p_slot]
      when jsonb_typeof(coalesce(p_doc, '{}'::jsonb) #> array['ce3x_capturas', p_slot]) = 'object'
          then jsonb_build_array(p_doc #> array['ce3x_capturas', p_slot])
      else '[]'::jsonb
  end;
$$;

-- Añade una captura al final de la fase.
create or replace function public.res080_ce3x_add(
    p_id uuid,
    p_slot text,
    p_captura jsonb
) returns jsonb
language sql
as $$
  update expedientes
  set documentacion = jsonb_set(
        jsonb_set(
          coalesce(documentacion, '{}'::jsonb),
          array['ce3x_capturas'],
          coalesce(documentacion -> 'ce3x_capturas', '{}'::jsonb),
          true
        ),
        array['ce3x_capturas', p_slot],
        public.res080_ce3x_lista(documentacion, p_slot) || jsonb_build_array(p_captura),
        true
      ),
      updated_at = now()
  where id = p_id
  returning documentacion #> array['ce3x_capturas', p_slot];
$$;

-- Quita la captura con ese driveId de la fase.
create or replace function public.res080_ce3x_remove(
    p_id uuid,
    p_slot text,
    p_drive_id text
) returns jsonb
language sql
as $$
  update expedientes
  set documentacion = jsonb_set(
        jsonb_set(
          coalesce(documentacion, '{}'::jsonb),
          array['ce3x_capturas'],
          coalesce(documentacion -> 'ce3x_capturas', '{}'::jsonb),
          true
        ),
        array['ce3x_capturas', p_slot],
        coalesce(
          (select jsonb_agg(c)
             from jsonb_array_elements(public.res080_ce3x_lista(documentacion, p_slot)) c
            where c ->> 'driveId' is distinct from p_drive_id),
          '[]'::jsonb
        ),
        true
      ),
      updated_at = now()
  where id = p_id
  returning documentacion #> array['ce3x_capturas', p_slot];
$$;

-- Postura de seguridad (ver memoria project_supabase_rls_lockdown): las
-- funciones nacen con EXECUTE para PUBLIC — hay que revocarlo explícitamente.
-- Solo el backend (service_role) invoca RPCs.
--
-- OJO: `from public` NO basta. Supabase concede EXECUTE a anon/authenticated por
-- default privileges del esquema, y ese grant explícito sobrevive al revoke de
-- PUBLIC (comprobado: las RPC hermanas se quedaron con anon=X | authenticated=X).
-- Hay que revocárselo a los dos por su nombre.
revoke execute on function public.res080_ce3x_lista(jsonb, text) from public, anon, authenticated;
revoke execute on function public.res080_ce3x_add(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.res080_ce3x_remove(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.res080_ce3x_lista(jsonb, text) to service_role;
grant  execute on function public.res080_ce3x_add(uuid, text, jsonb) to service_role;
grant  execute on function public.res080_ce3x_remove(uuid, text, text) to service_role;
