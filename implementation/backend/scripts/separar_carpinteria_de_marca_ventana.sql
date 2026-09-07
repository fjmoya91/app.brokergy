-- ============================================================================
-- separar_carpinteria_de_marca_ventana.sql (2026-09-07)
-- ----------------------------------------------------------------------------
-- `documentacion.envolvente.marco_nuevo_marca` significa desde hoy la MARCA DEL
-- SISTEMA de perfil (Cortizo, Kömmerling, Gealan…), la que tiene ficha técnica y
-- contra la que se comprueba el Uf. Hasta ahora se colaba ahí la CARPINTERÍA que
-- fabrica y monta la ventana, que es otra empresa: en 9 de los 25 RES080 con la
-- envolvente rellena, el certificado declaraba como fabricante del perfil a una
-- carpintería de pueblo, y entonces el Uf no se podía contrastar con nada.
--
-- Este script mueve esos 9 valores a `marco_carpinteria` y deja la marca VACÍA.
-- Vacía es la verdad: de esos expedientes no consta qué sistema se instaló, y el
-- selector del catálogo lo enseña como pendiente. Rellenarla adivinando (PLANIA
-- es de STRUGAL, A.61 RPT de SIMER…) sería meter en un certificado una marca que
-- nadie ha comprobado.
--
-- NO se toca ningún PDF ya emitido: viven en Drive. Lo que cambia es lo que
-- diría el certificado si se REGENERA, y ahí decir la verdad es mejor.
--
-- La lista es a mano y está cerrada a propósito: distinguir un fabricante de
-- perfil de una carpintería no lo puede hacer una heurística sin equivocarse.
-- `jsonb_set` es quirúrgico (no lee y reescribe `documentacion` entera), así que
-- no puede pisar otra escritura simultánea — regla 19.
--
-- Quedan FUERA, para mirarlos a mano:
--   · 26RES080_61 — "PVC SERIE LIVING 82 MD (ALUVILLA)": mezcla material, serie y
--     carpintería en la misma cadena; separarlo es una decisión, no un movimiento.
-- ============================================================================

UPDATE public.expedientes
SET documentacion = jsonb_set(
        jsonb_set(
            documentacion,
            '{envolvente,marco_carpinteria}',
            to_jsonb(documentacion->'envolvente'->>'marco_nuevo_marca')
        ),
        '{envolvente,marco_nuevo_marca}',
        '""'::jsonb
    )
WHERE numero_expediente IN (
        '25RES080_15',   -- HERRAJES EUROPEOS
        '25RES080_27',   -- ALUMINIOS GALISUR
        '25RES080_32',   -- ALFAFIL (el modelo, "A.61 RPT", es de SIMER)
        '26RES080_35',   -- NAZAN (el modelo, "PLANIA", es de STRUGAL)
        '26RES080_44',   -- ALUMINIOS MANZANARES S.L.
        '26RES080_47',   -- MANCHA AZUER - CARPINTERIA METALICA PVC
        '26RES080_51',   -- DE LAS HERAS Y HONTECILLAS S.L.
        '26RES080_53',   -- ALUMITEC CRIPTANA
        '26RES080_60'    -- NAZAN (idem 26RES080_35)
      )
  AND coalesce(documentacion->'envolvente'->>'marco_nuevo_marca', '') <> ''
  AND coalesce(documentacion->'envolvente'->>'marco_carpinteria', '') = '';
