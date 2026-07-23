-- ═══════════════════════════════════════════════════════════════════════════
-- v_expedientes_pistas — "¿Qué falta?" de TODA la cartera, en paralelo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El `estado` del expediente es un único valor lineal y no puede representar que
-- a la vez esté el CEE final en el certificador, los anexos en casa del cliente
-- y el CIFO en la del instalador. Esas tres cosas avanzan EN PARALELO.
--
-- Esta vista devuelve UNA FILA POR EXPEDIENTE con las TRES pistas y su reloj, de
-- modo que se puede preguntar "¿qué le debo pedir hoy al instalador?" o "¿qué
-- llevo más de 15 días esperando?" sin abrir los expedientes uno a uno.
--
-- Espeja la lógica de `buildChecklistData` (routes/expedientes.js). Ahí el cálculo
-- es por expediente y reconcilia con Drive; aquí es masivo y solo mira la BD. Si
-- se toca el ciclo en un sitio, hay que tocarlo en el otro.
--
-- Situaciones, de peor a mejor: SIN_EMITIR < SIN_ENVIAR < ESPERANDO < OK
--   SIN_EMITIR  ni generado
--   SIN_ENVIAR  generado, sigue en nuestra mesa
--   ESPERANDO   enviado — la pelota la tiene el otro, desde hace N días
--   OK          recibido / firmado / registrado
--
-- ⚠️ OJO con los JSONB: esta vista solo lee claves escalares de `documentacion`
-- y `seguimiento`. NO seleccionar las columnas JSONB enteras (Postgres las
-- descomprime completas y ya tumbaron la BD dos veces). Ver CLAUDE.md, regla 22.

DROP VIEW IF EXISTS public.v_expedientes_pistas;

-- Cast defensivo: en `documentacion` conviven timestamps ISO ("2026-07-23T15:14:40.541Z")
-- y de Postgres ("2026-05-25 07:23:01.850567+00"), más algún residuo de migración.
-- Un solo valor basura reventaría la vista entera, así que lo que no empiece por
-- una fecha reconocible se descarta en vez de tumbar la consulta.
CREATE OR REPLACE FUNCTION public.ts_seguro(txt text)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN txt ~ '^\d{4}-\d{2}-\d{2}' THEN txt::timestamptz END;
$$;

CREATE VIEW public.v_expedientes_pistas
WITH (security_invoker = on) AS
WITH base AS (
  SELECT
    e.id,
    e.numero_expediente,
    e.estado,
    e.cliente_id,
    e.oportunidad_id,

    -- ── Pista CERTIFICADOR: el CEE final ────────────────────────────────────
    -- Aquí el reloj no son los `_sent_at` sino el sello del subestado actual,
    -- que `seguimiento.cee_final_ts` ya guarda en cada salto.
    e.seguimiento->>'cee_final' AS seg_cee_final,
    public.ts_seguro(e.seguimiento->'cee_final_ts'->>(e.seguimiento->>'cee_final')) AS cee_final_desde,
    (e.documentacion->>'fecha_registro_cee_final') AS fecha_registro_cee_final,

    -- ── Pista CLIENTE: los anexos que firma ─────────────────────────────────
    NULLIF(e.documentacion->>'anexo_i_drive_link', '')            AS ax1_borrador,
    public.ts_seguro(e.documentacion->>'anexo_i_sent_at')         AS ax1_enviado,
    NULLIF(e.documentacion->>'anexo_i_signed_link', '')           AS ax1_firmado,

    NULLIF(e.documentacion->>'anexo_cesion_drive_link', '')       AS ces_borrador,
    public.ts_seguro(e.documentacion->>'anexo_cesion_sent_at')    AS ces_enviado,
    NULLIF(e.documentacion->>'anexo_cesion_signed_link', '')      AS ces_firmado,
    COALESCE((e.documentacion->>'cesion_firmado_brokergy')::boolean, false) AS ces_firmado_brokergy,

    NULLIF(e.documentacion->>'anexo_fotografico_drive_link', '')  AS foto_borrador,
    public.ts_seguro(e.documentacion->>'anexo_fotografico_sent_at') AS foto_enviado,
    NULLIF(e.documentacion->>'anexo_fotografico_signed_link', '') AS foto_firmado,

    -- ── Pista INSTALADOR: el CIFO ───────────────────────────────────────────
    NULLIF(e.documentacion->>'cert_cifo_drive_link', '')          AS cifo_borrador,
    public.ts_seguro(e.documentacion->>'cert_cifo_sent_at')       AS cifo_enviado,
    NULLIF(e.documentacion->>'cert_cifo_signed_link', '')         AS cifo_firmado
  FROM public.expedientes e
  WHERE e.estado IS DISTINCT FROM 'FINALIZADO'
),
-- Ciclo de cada documento que viaja: borrador → enviado → firmado.
docs AS (
  SELECT b.*,
    CASE
      WHEN b.ax1_firmado  IS NOT NULL THEN 'OK'
      WHEN b.ax1_enviado  IS NOT NULL THEN 'ESPERANDO'
      WHEN b.ax1_borrador IS NOT NULL THEN 'SIN_ENVIAR'
      ELSE 'SIN_EMITIR'
    END AS ax1_sit,
    CASE
      -- La Cesión se firma a dos manos: no está lista hasta que firmamos nosotros.
      WHEN b.ces_firmado IS NOT NULL AND b.ces_firmado_brokergy THEN 'OK'
      WHEN b.ces_firmado IS NOT NULL THEN 'ESPERANDO'   -- cliente firmó, falta Brokergy
      WHEN b.ces_enviado  IS NOT NULL THEN 'ESPERANDO'
      WHEN b.ces_borrador IS NOT NULL THEN 'SIN_ENVIAR'
      ELSE 'SIN_EMITIR'
    END AS ces_sit,
    CASE
      WHEN b.foto_firmado  IS NOT NULL THEN 'OK'
      WHEN b.foto_enviado  IS NOT NULL THEN 'ESPERANDO'
      WHEN b.foto_borrador IS NOT NULL THEN 'SIN_ENVIAR'
      ELSE 'SIN_EMITIR'
    END AS foto_sit,
    CASE
      WHEN b.cifo_firmado  IS NOT NULL THEN 'OK'
      WHEN b.cifo_enviado  IS NOT NULL THEN 'ESPERANDO'
      WHEN b.cifo_borrador IS NOT NULL THEN 'SIN_ENVIAR'
      ELSE 'SIN_EMITIR'
    END AS cifo_sit,
    CASE
      WHEN b.fecha_registro_cee_final IS NOT NULL OR b.seg_cee_final = 'REGISTRADO' THEN 'OK'
      WHEN b.seg_cee_final IS NULL OR b.seg_cee_final = 'PTE_ENVIO_CERT' THEN 'SIN_ENVIAR'
      ELSE 'ESPERANDO'
    END AS cee_sit
  FROM base b
),
-- Días esperando de cada documento (solo cuenta si está ESPERANDO).
esperas AS (
  SELECT d.*,
    CASE WHEN d.ax1_sit  = 'ESPERANDO' THEN (CURRENT_DATE - d.ax1_enviado::date)  END AS ax1_dias,
    CASE WHEN d.ces_sit  = 'ESPERANDO' THEN (CURRENT_DATE - d.ces_enviado::date)  END AS ces_dias,
    CASE WHEN d.foto_sit = 'ESPERANDO' THEN (CURRENT_DATE - d.foto_enviado::date) END AS foto_dias,
    CASE WHEN d.cifo_sit = 'ESPERANDO' THEN (CURRENT_DATE - d.cifo_enviado::date) END AS cifo_dias,
    CASE WHEN d.cee_sit  = 'ESPERANDO' THEN (CURRENT_DATE - d.cee_final_desde::date) END AS cee_dias
  FROM docs d
),
-- Peor situación de cada pista = lo que de verdad la bloquea.
peor AS (
  SELECT s.*,
    (SELECT sit FROM unnest(ARRAY[s.ax1_sit, s.ces_sit, s.foto_sit]) sit
      ORDER BY array_position(ARRAY['SIN_EMITIR','SIN_ENVIAR','ESPERANDO','OK'], sit) LIMIT 1
    ) AS pista_cliente_sit,
    GREATEST(COALESCE(s.ax1_dias,0), COALESCE(s.ces_dias,0), COALESCE(s.foto_dias,0)) AS pista_cliente_dias
  FROM esperas s
)
SELECT
  p.numero_expediente,
  p.estado,
  c.nombre_razon_social AS cliente_nombre,
  c.municipio           AS cliente_municipio,
  pr.razon_social       AS instalador_nombre,
  pr.acronimo           AS instalador_acronimo,

  -- ── Pista 1: CEE final (certificador) ────────────────────────────────────
  p.cee_sit  AS cee_final_situacion,
  p.cee_dias AS cee_final_dias_esperando,
  p.seg_cee_final AS cee_final_subestado,

  -- ── Pista 2: anexos de firma (cliente) ───────────────────────────────────
  p.pista_cliente_sit AS anexos_situacion,
  NULLIF(p.pista_cliente_dias, 0) AS anexos_dias_esperando,
  array_remove(ARRAY[
    CASE WHEN p.ax1_sit  <> 'OK' THEN 'Anexo I: '            || p.ax1_sit  END,
    CASE WHEN p.ces_sit  <> 'OK' THEN 'Cesión de ahorros: '  || p.ces_sit  END,
    CASE WHEN p.foto_sit <> 'OK' THEN 'Anexo fotográfico: '  || p.foto_sit END
  ]::text[], NULL) AS anexos_pendientes,

  -- ── Pista 3: CIFO (instalador) ───────────────────────────────────────────
  p.cifo_sit  AS cifo_situacion,
  p.cifo_dias AS cifo_dias_esperando,

  -- ── Resumen transversal ──────────────────────────────────────────────────
  -- Quién tiene AHORA algo nuestro en la mano (puede ser más de uno a la vez).
  array_remove(ARRAY[
    CASE WHEN p.cee_sit           = 'ESPERANDO' THEN 'CERTIFICADOR' END,
    CASE WHEN p.pista_cliente_sit = 'ESPERANDO' THEN 'CLIENTE'      END,
    CASE WHEN p.cifo_sit          = 'ESPERANDO' THEN 'INSTALADOR'   END
  ]::text[], NULL) AS esperando_a,
  -- Lo que está en NUESTRO tejado: generado sin enviar, o ni generado.
  array_remove(ARRAY[
    CASE WHEN p.cee_sit           IN ('SIN_ENVIAR')              THEN 'Encargo del CEE final sin enviar' END,
    CASE WHEN p.pista_cliente_sit IN ('SIN_EMITIR','SIN_ENVIAR') THEN 'Anexos por generar/enviar'        END,
    CASE WHEN p.cifo_sit          IN ('SIN_EMITIR','SIN_ENVIAR') THEN 'CIFO por generar/enviar'          END
  ]::text[], NULL) AS nos_toca_a_nosotros,
  -- Lo más antiguo que llevamos esperando, para ordenar la cartera por urgencia.
  GREATEST(
    COALESCE(p.cee_dias, 0), COALESCE(p.pista_cliente_dias, 0), COALESCE(p.cifo_dias, 0)
  ) AS dias_esperando_max

FROM peor p
JOIN      public.clientes      c  ON c.id_cliente     = p.cliente_id
LEFT JOIN public.oportunidades o  ON o.id             = p.oportunidad_id
LEFT JOIN public.prescriptores pr ON pr.id_empresa    = COALESCE(o.instalador_asociado_id, o.prescriptor_id)
ORDER BY dias_esperando_max DESC, p.numero_expediente;

COMMENT ON VIEW public.v_expedientes_pistas IS
  'Qué falta en cada expediente vivo, por PISTAS PARALELAS (CEE final/certificador, anexos/cliente, CIFO/instalador) con su situación y días esperando. Responde "qué le pido hoy a quién" sin depender del estado lineal.';

-- Postura de seguridad de la BD: solo el backend (service_role) lee datos.
-- Ver memoria project_supabase_rls_lockdown + project_supabase_schema_grants:
-- sin este GRANT, PostgREST no ve la vista.
GRANT SELECT ON public.v_expedientes_pistas TO service_role;
