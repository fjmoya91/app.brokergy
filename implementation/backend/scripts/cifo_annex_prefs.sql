-- =====================================================================
-- Migración: documentacion.cifo_annex_prefs (orden + páginas de los anexos)
--
-- Guarda las preferencias de los anexos del CIFO (RES060/RES093) y del
-- Certificado RES080:
--   { "order": ["aerotermia_cal", "extra_1AbC…"],      -- ids de slot
--     "excluded": { "1AbC…": [1,2,9] } }               -- driveId → págs a omitir
--
-- Escritura ATÓMICA (regla #19 del CLAUDE.md): un solo UPDATE con jsonb_set
-- que toca SOLO esa clave, igual que cifo_annex_append/remove. Así el guardado
-- del expediente (que reenvía `documentacion` entera y puede ir con una copia
-- vieja) nunca pisa el orden ni el recorte de páginas — la clave está además
-- en CLAVES_PROTEGIDAS de utils/mergeDocumentacion.js.
-- =====================================================================

create or replace function public.cifo_annex_prefs_set(
    p_id uuid,
    p_prefs jsonb
) returns jsonb
language sql
as $$
  update expedientes
  set documentacion = jsonb_set(
        coalesce(documentacion, '{}'::jsonb),
        array['cifo_annex_prefs'],
        coalesce(p_prefs, '{}'::jsonb),
        true
      ),
      updated_at = now()
  where id = p_id
  returning documentacion -> 'cifo_annex_prefs';
$$;

-- Postura de seguridad (ver memoria project_supabase_rls_lockdown): las
-- funciones nacen con EXECUTE para PUBLIC — hay que revocarlo explícitamente.
-- Solo el backend (service_role) invoca RPCs.
revoke execute on function public.cifo_annex_prefs_set(uuid, jsonb) from public;
grant  execute on function public.cifo_annex_prefs_set(uuid, jsonb) to service_role;
