-- ============================================================================
-- Un expediente EXISTE ⇒ su oportunidad está ACEPTADA.
--
-- Síntoma: expedientes migrados que aparecían en el listado de oportunidades
-- como "PTE ENVIAR" pese a tener ya número de expediente. Causa: el frontend
-- lee `datos_calculo.estado || 'PTE ENVIAR'`, y las oportunidades sintéticas
-- creadas por las migraciones (XML / AppSheet / skills de Cowork, que insertan
-- directamente en Supabase sin pasar por expedienteService.createExpediente)
-- nacían sin esa clave.
--
-- Este trigger cierra el agujero en la BD, así que da igual quién cree el
-- expediente (app, MCP, script de migración o skill): la oportunidad queda
-- coherente. El arreglo en `services/expedienteService.js` (sacar la
-- sincronización fuera del bloque de Drive) sigue siendo necesario para que la
-- app escriba también la entrada de HISTORIAL; el trigger es la red de
-- seguridad para todo lo que no pasa por ahí.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_oportunidad_aceptada()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.oportunidades
    SET datos_calculo = jsonb_set(
            COALESCE(datos_calculo, '{}'::jsonb), '{estado}', '"ACEPTADA"'::jsonb, true)
    WHERE id = NEW.oportunidad_id
      AND COALESCE(datos_calculo->>'estado', '') <> 'ACEPTADA';
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_oportunidad_aceptada ON public.expedientes;
CREATE TRIGGER trg_sync_oportunidad_aceptada
    AFTER INSERT ON public.expedientes
    FOR EACH ROW EXECUTE FUNCTION public.sync_oportunidad_aceptada();

-- ── Backfill de lo ya migrado ───────────────────────────────────────────────
UPDATE public.oportunidades o
SET datos_calculo = jsonb_set(
        COALESCE(o.datos_calculo, '{}'::jsonb), '{estado}', '"ACEPTADA"'::jsonb, true)
FROM public.expedientes e
WHERE e.oportunidad_id = o.id
  AND COALESCE(o.datos_calculo->>'estado', '') <> 'ACEPTADA';
