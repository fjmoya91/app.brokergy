-- ============================================================================
-- Documentación del CEE (fachada, patios, vídeo, planos) en los CEE DIRECTOS
-- ----------------------------------------------------------------------------
-- Gemelas de `reforma_append` / `reforma_replace_slot` (las del CAE, que viven
-- sobre `oportunidades.datos_calculo`), sobre `cee_directos.documentacion`.
-- Mismo motivo (regla 19): dos subidas a la vez con un read-modify-write del
-- JSONB entero se pisan; aquí cada slot se escribe con jsonb_set bajo el bloqueo
-- de fila del UPDATE.
--
-- Solo metadatos (nombre, enlace, driveId, estado): los ficheros van a Drive,
-- carpeta "4. DOCUMENTACIÓN PARA CEE" del expediente (regla 21).
-- Fecha: 2026-09-23
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cee_directo_docs_append(p_id uuid, p_slot text, p_entry jsonb, p_multiple boolean)
RETURNS void LANGUAGE sql AS $$
  update public.cee_directos
  set documentacion = jsonb_set(
        coalesce(documentacion, '{}'::jsonb)
          || jsonb_build_object('reforma_uploads', coalesce(documentacion -> 'reforma_uploads', '{}'::jsonb)),
        array['reforma_uploads', p_slot],
        case when p_multiple
          then coalesce(documentacion -> 'reforma_uploads' -> p_slot, '[]'::jsonb) || jsonb_build_array(p_entry)
          else jsonb_build_array(p_entry)
        end,
        true),
      updated_at = now()
  where id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.cee_directo_docs_replace_slot(p_id uuid, p_slot text, p_array jsonb)
RETURNS void LANGUAGE sql AS $$
  update public.cee_directos
  set documentacion = jsonb_set(
        coalesce(documentacion, '{}'::jsonb)
          || jsonb_build_object('reforma_uploads', coalesce(documentacion -> 'reforma_uploads', '{}'::jsonb)),
        array['reforma_uploads', p_slot],
        coalesce(p_array, '[]'::jsonb),
        true),
      updated_at = now()
  where id = p_id;
$$;

-- Solo el backend (service_role). Hacen falta LAS DOS revocaciones
-- (ver project_supabase_rls_lockdown).
REVOKE EXECUTE ON FUNCTION public.cee_directo_docs_append(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cee_directo_docs_replace_slot(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cee_directo_docs_append(uuid, text, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cee_directo_docs_replace_slot(uuid, text, jsonb) TO service_role;
