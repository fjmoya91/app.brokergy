-- ============================================================================
-- Backfill OFFLINE de datos_calculo.inputs.{superficie,zona} desde el CEE.
--
-- Los expedientes migrados no pasan por la calculadora, así que sus `inputs`
-- vienen sin superficie ni zona climática y el barrido de la Memoria RITE los
-- pedía a mano — teniendo el dato en el CEE parseado del propio expediente.
--
-- Esto adelanta el trabajo que `utils/fincaInputs.js` haría de todas formas la
-- primera vez que se genere el RITE, pero SIN tocar el Catastro (cero riesgo de
-- WAF). El nº de plantas NO está en el CEE: ese lo resuelve fincaInputs contra
-- el Catastro, bajo demanda y una sola vez por expediente.
--
-- Nunca pisa un valor existente: solo rellena la clave si falta.
-- ============================================================================

-- SUPERFICIE (m² habitables del CEE inicial; si no, del final)
UPDATE public.oportunidades o
SET datos_calculo = jsonb_set(
        COALESCE(o.datos_calculo, '{}'::jsonb), '{inputs,superficie}',
        to_jsonb(COALESCE(e.cee->'cee_inicial'->>'superficieHabitable',
                          e.cee->'cee_final'->>'superficieHabitable')::numeric),
        true)
FROM public.expedientes e
WHERE e.oportunidad_id = o.id
  AND o.datos_calculo ? 'inputs'
  AND (o.datos_calculo->'inputs'->>'superficie') IS NULL
  AND COALESCE(e.cee->'cee_inicial'->>'superficieHabitable',
               e.cee->'cee_final'->>'superficieHabitable') ~ '^[0-9]+([.,][0-9]+)?$';

-- ZONA CLIMÁTICA (del CEE, o la que dejó la migración desde XML en la raíz)
UPDATE public.oportunidades o
SET datos_calculo = jsonb_set(
        COALESCE(o.datos_calculo, '{}'::jsonb), '{inputs,zona}',
        to_jsonb(COALESCE(e.cee->'cee_inicial'->>'zonaClimatica',
                          e.cee->'cee_final'->>'zonaClimatica',
                          o.datos_calculo->>'zona')),
        true)
FROM public.expedientes e
WHERE e.oportunidad_id = o.id
  AND o.datos_calculo ? 'inputs'
  AND (o.datos_calculo->'inputs'->>'zona') IS NULL
  AND COALESCE(e.cee->'cee_inicial'->>'zonaClimatica',
               e.cee->'cee_final'->>'zonaClimatica',
               o.datos_calculo->>'zona') IS NOT NULL;
