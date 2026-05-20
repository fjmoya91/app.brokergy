-- ============================================================
-- MIGRACIÓN: Vistas de ciclo de vida de expedientes
-- Ejecutar en: Supabase SQL Editor
-- Fecha creación: 2026-05-20  |  Última revisión: 2026-05-20
--
-- PROPÓSITO
-- ---------
-- Permite conocer en todo momento el estado exacto de cada expediente
-- y qué falta para avanzar al siguiente estado — sin lógica de aplicación.
-- Diseñado para ser consultable directamente por un asistente IA.
--
-- SEGURIDAD
-- ---------
-- Solo DDL de tipo VIEW (CREATE OR REPLACE). No modifica datos ni tablas.
-- Para revertir completamente:
--   DROP VIEW IF EXISTS public.v_expedientes_pendientes;
--   DROP VIEW IF EXISTS public.v_expedientes_lifecycle;
--
-- LIFECYCLE COMPLETO (8 estados reales + FINALIZADO)
-- ---------------------------------------------------
--
--  PTE. CEE INICIAL
--    Brokergy envía encargo al certificador.
--    seguimiento.cee_inicial: PTE_ENVIO_CERT
--    │
--  EN CERTIFICADOR CEE INICIAL
--    Certificador hace visita, firma y sube el .cex.
--    seguimiento.cee_inicial: ASIGNADO → EN_TRABAJO → PTE_PRESENTACION
--    │
--  PENDIENTE REVISIÓN (INICIAL)
--    Certificador subió el .cex. Brokergy revisa internamente.
--    seguimiento.cee_inicial: PTE_REVISION
--    │
--  REVISADO Y LISTO (INICIAL)
--    Brokergy notifica al certificador para que registre el CEE.
--    seguimiento.cee_inicial: REVISADO
--    │
--  PTE. FIN OBRA
--    CEE inicial registrado. Se esperan: factura(s) de fin de obra,
--    generación+envío+firma del Anexo I y Anexo Cesión de Ahorros.
--    seguimiento.cee_inicial: REGISTRADO
--    │
--  PTE. CEE FINAL
--    Fin de obra comunicado. Certificador hace CEE final.
--    seguimiento.cee_final: PTE_ENVIO_CERT → ... → REGISTRADO
--    │
--  REVISADO Y LISTO (FINAL)
--    CEE final revisado. Brokergy prepara documentación final:
--    necesita Certificado RITE para emitir el CIFO (la fecha del RITE
--    es obligatoria en el CIFO). También: Ficha RES, Fotográfico.
--    seguimiento.cee_final: REGISTRADO
--    │
--  PTE FIN EXPTE
--    Documentación en tramitación. Pendiente de firmas y RITE.
--    │
--  FINALIZADO
--    Expediente completamente cerrado.
--
-- VALORES DE seguimiento.cee_inicial
-- ------------------------------------
--   PTE_ENVIO_CERT  → Pendiente de enviar encargo al certificador
--   ASIGNADO        → Encargo enviado, certificador asignado
--   EN_TRABAJO      → Certificador en proceso (visita, medición)
--   PTE_PRESENTACION→ Pendiente de presentar/subir el .cex
--   PRESENTADO      → .cex subido, pendiente de revisión interna
--   PTE_REVISION    → En revisión interna por Brokergy
--   REVISADO        → Revisado, pendiente de notificar al certificador para registrar
--   REGISTRADO      → CEE registrado oficialmente
--
-- QUERIES DE EJEMPLO (para el asistente IA)
-- ------------------------------------------
-- "¿Qué falta en el expediente 26RES060_118?"
--   SELECT campos_pendientes, responsable_bloqueo, dias_en_estado_actual
--   FROM v_expedientes_lifecycle WHERE numero_expediente = '26RES060_118';
--
-- "¿Qué expedientes tienen algo pendiente hoy?"
--   SELECT numero_expediente, estado_actual, responsable_bloqueo,
--          dias_en_estado_actual, campos_pendientes
--   FROM v_expedientes_pendientes;
--
-- "¿Qué expedientes llevan más de 30 días sin avanzar?"
--   SELECT numero_expediente, estado_actual, dias_en_estado_actual
--   FROM v_expedientes_pendientes WHERE dias_en_estado_actual > 30;
--
-- "¿Qué está esperando el certificador?"
--   SELECT numero_expediente, cliente_municipio, dias_en_estado_actual, campos_pendientes
--   FROM v_expedientes_pendientes WHERE responsable_bloqueo = 'CERTIFICADOR';
--
-- "¿Qué documentos faltan firmar en tramitación?"
--   SELECT numero_expediente, campos_pendientes, docs_generados_total, docs_firmados_total
--   FROM v_expedientes_pendientes WHERE estado_actual IN ('PTE FIN EXPTE', 'REVISADO Y LISTO (FINAL)');
-- ============================================================


-- ─── VISTA 1: Ciclo de vida completo ─────────────────────────────────────────
-- Una fila por expediente. Expone el checklist de pendientes CONSCIENTE del
-- estado actual: solo lista lo que bloquea el avance en ESE estado, no todos
-- los campos vacíos del expediente.

CREATE OR REPLACE VIEW public.v_expedientes_lifecycle AS
SELECT
  e.id,
  e.numero_expediente,
  e.cliente_id,
  e.oportunidad_id,
  e.estado                                    AS estado_actual,
  e.created_at,
  e.updated_at,

  -- ── Tiempo en estado actual ────────────────────────────────────────────────
  -- Se extrae la fecha del último cambio de estado desde documentacion.historial.
  -- Fallback a created_at si no hay historial.
  EXTRACT(DAY FROM (
    NOW() - COALESCE(
      (
        SELECT MAX((entry->>'fecha')::timestamptz)
        FROM jsonb_array_elements(
          COALESCE(e.documentacion->'historial', '[]'::jsonb)
        ) AS entry
        WHERE entry->>'estado' IS NOT NULL
          AND COALESCE(entry->>'tipo', 'estado') <> 'comentario'
      ),
      e.created_at
    )
  ))::int AS dias_en_estado_actual,

  -- ── Seguimiento CEE (subestados del proceso con el certificador) ───────────
  -- cee_inicial: PTE_ENVIO_CERT → ASIGNADO → EN_TRABAJO → PTE_PRESENTACION
  --              → PRESENTADO → PTE_REVISION → REVISADO → REGISTRADO
  -- cee_final:   PTE_ENVIO_CERT → ... → REGISTRADO
  COALESCE(e.seguimiento->>'cee_inicial', 'PTE_ENVIO_CERT') AS seguimiento_cee_inicial,
  COALESCE(e.seguimiento->>'cee_final',   'PTE_ENVIO_CERT') AS seguimiento_cee_final,

  -- ── Fechas CEE Inicial ─────────────────────────────────────────────────────
  NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_visita_cee_inicial',   '')), '') IS NOT NULL AS cee_ini_visita_ok,
  NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_firma_cee_inicial',    '')), '') IS NOT NULL AS cee_ini_firma_ok,
  NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_registro_cee_inicial', '')), '') IS NOT NULL AS cee_ini_registro_ok,

  -- ── Fechas CEE Final ───────────────────────────────────────────────────────
  NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_visita_cee_final',   '')), '') IS NOT NULL AS cee_fin_visita_ok,
  NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_firma_cee_final',    '')), '') IS NOT NULL AS cee_fin_firma_ok,
  NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_registro_cee_final', '')), '') IS NOT NULL AS cee_fin_registro_ok,

  -- ── Facturas ───────────────────────────────────────────────────────────────
  jsonb_array_length(
    COALESCE(e.documentacion->'facturas', '[]'::jsonb)
  ) AS num_facturas,

  -- ── Certificado de Instalación Térmica (necesario para CIFO) ──────────────
  NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_pruebas_cert_instalacion', '')), '') IS NOT NULL AS cert_inst_pruebas_ok,
  NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_firma_cert_instalacion',   '')), '') IS NOT NULL AS cert_inst_firma_ok,

  -- ── Documentos: Anexo I ────────────────────────────────────────────────────
  -- Nota: puede existir _signed_link sin _drive_link si el fichero se subió
  -- directamente firmado (sin pasar por la generación interna).
  (e.documentacion->>'anexo_i_drive_link')  IS NOT NULL AS anexo_i_generado,
  (e.documentacion->>'anexo_i_sent_at')     IS NOT NULL AS anexo_i_enviado,
  (e.documentacion->>'anexo_i_signed_link') IS NOT NULL AS anexo_i_firmado,

  -- ── Documentos: Cesión de Ahorro CAE ──────────────────────────────────────
  (e.documentacion->>'anexo_cesion_drive_link')  IS NOT NULL AS cesion_generada,
  (e.documentacion->>'anexo_cesion_sent_at')     IS NOT NULL AS cesion_enviada,
  (e.documentacion->>'anexo_cesion_signed_link') IS NOT NULL AS cesion_firmada,

  -- ── Documentos: Ficha RES (060 / 080 / 093 según tipo) ───────────────────
  -- La Ficha RES no requiere firma del cliente, solo generación.
  (e.documentacion->>'ficha_res060_drive_link')  IS NOT NULL AS ficha_res_generada,
  (e.documentacion->>'ficha_res060_sent_at')     IS NOT NULL AS ficha_res_enviada,
  (e.documentacion->>'ficha_res060_signed_link') IS NOT NULL AS ficha_res_firmada,

  -- ── Documentos: Certificado CIFO / CAE Reforma ────────────────────────────
  -- Requiere: cert_rite_drive_link (fecha del RITE obligatoria en el CIFO)
  --           + fecha_pruebas_cert_instalacion + fecha_firma_cert_instalacion
  (e.documentacion->>'cert_cifo_drive_link')  IS NOT NULL AS cifo_generado,
  (e.documentacion->>'cert_cifo_sent_at')     IS NOT NULL AS cifo_enviado,
  (e.documentacion->>'cert_cifo_signed_link') IS NOT NULL AS cifo_firmado,

  -- ── Documentos: Certificado RITE (aportado manualmente, fecha para CIFO) ──
  (e.documentacion->>'cert_rite_drive_link') IS NOT NULL AS rite_aportado,

  -- ── Documentos: Anexo Fotográfico ─────────────────────────────────────────
  (e.documentacion->>'anexo_fotografico_drive_link')  IS NOT NULL AS foto_generada,
  (e.documentacion->>'anexo_fotografico_sent_at')     IS NOT NULL AS foto_enviada,
  (e.documentacion->>'anexo_fotografico_signed_link') IS NOT NULL AS foto_firmada,

  -- ── Responsable del bloqueo actual ────────────────────────────────────────
  CASE e.estado
    WHEN 'PTE. CEE INICIAL'              THEN 'BROKERGY'      -- enviar encargo
    WHEN 'EN CERTIFICADOR CEE INICIAL'   THEN 'CERTIFICADOR'  -- visita / .cex
    WHEN 'PENDIENTE REVISIÓN (INICIAL)'  THEN 'BROKERGY'      -- revisar .cex
    WHEN 'REVISADO Y LISTO (INICIAL)'    THEN 'BROKERGY'      -- notificar para registrar
    WHEN 'PTE. FIN OBRA'                 THEN 'INSTALADOR'    -- obra + facturas + Anexo I + Cesión
    WHEN 'PTE. CEE FINAL'                THEN 'CERTIFICADOR'  -- CEE final
    WHEN 'REVISADO Y LISTO (FINAL)'      THEN 'BROKERGY'      -- RITE + CIFO + docs finales
    WHEN 'PTE FIN EXPTE'                 THEN 'BROKERGY'      -- firmas pendientes + tramitación
    WHEN 'EN TRAMITACIÓN'                THEN 'BROKERGY'      -- alias legacy de PTE FIN EXPTE
    WHEN 'FINALIZADO'                    THEN NULL
    ELSE                                      'BROKERGY'
  END AS responsable_bloqueo,

  -- ── Campos pendientes (consciente del estado actual) ──────────────────────
  -- Solo lista lo que BLOQUEA el avance en el estado actual.
  -- Array vacío = expediente al día en su estado.
  CASE e.estado

    -- ── 1. PTE. CEE INICIAL ──────────────────────────────────────────────────
    -- Brokergy debe enviar el encargo al certificador.
    -- No hay campo DB específico para esto; el estado del seguimiento lo indica.
    WHEN 'PTE. CEE INICIAL' THEN array_remove(ARRAY[
      CASE WHEN COALESCE(e.seguimiento->>'cee_inicial', 'PTE_ENVIO_CERT') = 'PTE_ENVIO_CERT'
           THEN 'Encargo al certificador pendiente de envío' END
    ]::text[], NULL)

    -- ── 2. EN CERTIFICADOR CEE INICIAL ──────────────────────────────────────
    -- Certificador: visita, mide, firma y sube el .cex.
    WHEN 'EN CERTIFICADOR CEE INICIAL' THEN array_remove(ARRAY[
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_visita_cee_inicial', '')), '') IS NULL
           THEN 'Fecha visita CEE inicial (certificador)' END,
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_firma_cee_inicial',  '')), '') IS NULL
           THEN 'Fecha firma CEE inicial (certificador)'  END
    ]::text[], NULL)

    -- ── 3. PENDIENTE REVISIÓN (INICIAL) ─────────────────────────────────────
    -- El certificador subió el .cex. Brokergy lo revisa internamente.
    -- Estado manual: no hay campo DB, la revisión la marca Brokergy cambiando el estado.
    WHEN 'PENDIENTE REVISIÓN (INICIAL)' THEN
      ARRAY['Revisión interna del .cex pendiente — Brokergy debe revisar y avanzar el estado']::text[]

    -- ── 4. REVISADO Y LISTO (INICIAL) ───────────────────────────────────────
    -- Brokergy notifica al certificador para que registre. Pendiente la fecha de registro.
    WHEN 'REVISADO Y LISTO (INICIAL)' THEN array_remove(ARRAY[
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_registro_cee_inicial', '')), '') IS NULL
           THEN 'Fecha registro CEE inicial (pendiente de registrar)' END
    ]::text[], NULL)

    -- ── 5. PTE. FIN OBRA ────────────────────────────────────────────────────
    -- Cliente notifica fin de obra (justificado con factura).
    -- Brokergy genera Anexo I y Anexo Cesión de Ahorros (envío + firma del cliente).
    WHEN 'PTE. FIN OBRA' THEN array_remove(ARRAY[
      CASE WHEN jsonb_array_length(COALESCE(e.documentacion->'facturas', '[]'::jsonb)) = 0
           THEN 'Factura(s) de fin de obra — no aportada ninguna' END,
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_registro_cee_inicial', '')), '') IS NULL
           THEN 'Fecha registro CEE inicial — pendiente de registrar' END,
      -- Anexo I
      CASE WHEN (e.documentacion->>'anexo_i_drive_link')  IS NULL
           THEN 'Anexo I — sin generar' END,
      CASE WHEN (e.documentacion->>'anexo_i_sent_at')     IS NULL
           AND (e.documentacion->>'anexo_i_drive_link')   IS NOT NULL
           THEN 'Anexo I — generado pero no enviado al cliente' END,
      CASE WHEN (e.documentacion->>'anexo_i_signed_link') IS NULL
           THEN 'Anexo I — sin firmar por el cliente' END,
      -- Cesión de Ahorros
      CASE WHEN (e.documentacion->>'anexo_cesion_drive_link')  IS NULL
           THEN 'Cesión de Ahorros — sin generar' END,
      CASE WHEN (e.documentacion->>'anexo_cesion_sent_at')     IS NULL
           AND (e.documentacion->>'anexo_cesion_drive_link')   IS NOT NULL
           THEN 'Cesión de Ahorros — generada pero no enviada al cliente' END,
      CASE WHEN (e.documentacion->>'anexo_cesion_signed_link') IS NULL
           THEN 'Cesión de Ahorros — sin firmar por el cliente' END
    ]::text[], NULL)

    -- ── 6. PTE. CEE FINAL ───────────────────────────────────────────────────
    -- Certificador hace la visita final, firma y registra el CEE final.
    WHEN 'PTE. CEE FINAL' THEN array_remove(ARRAY[
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_visita_cee_final',   '')), '') IS NULL
           THEN 'Fecha visita CEE final (certificador)'    END,
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_firma_cee_final',    '')), '') IS NULL
           THEN 'Fecha firma CEE final (certificador)'     END,
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_registro_cee_final', '')), '') IS NULL
           THEN 'Fecha registro CEE final (certificador)'  END
    ]::text[], NULL)

    -- ── 7. REVISADO Y LISTO (FINAL) ─────────────────────────────────────────
    -- CEE final registrado. Brokergy prepara documentación final.
    -- El Certificado RITE es OBLIGATORIO antes de emitir el CIFO
    -- (la fecha del RITE se usa en el CIFO).
    WHEN 'REVISADO Y LISTO (FINAL)' THEN array_remove(ARRAY[
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_registro_cee_final', '')), '') IS NULL
           THEN 'Fecha registro CEE final — pendiente de registrar' END,
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_pruebas_cert_instalacion', '')), '') IS NULL
           THEN 'Fecha pruebas cert. instalación — necesaria para CIFO' END,
      CASE WHEN NULLIF(TRIM(COALESCE(e.documentacion->>'fecha_firma_cert_instalacion',   '')), '') IS NULL
           THEN 'Fecha firma cert. instalación — necesaria para CIFO'   END,
      CASE WHEN (e.documentacion->>'cert_rite_drive_link') IS NULL
           THEN 'Certificado RITE — no aportado (fecha obligatoria para emitir CIFO)' END,
      CASE WHEN (e.documentacion->>'cert_cifo_drive_link') IS NULL
           THEN 'CIFO — sin generar (requiere RITE previo)' END,
      CASE WHEN (e.documentacion->>'ficha_res060_drive_link') IS NULL
           THEN 'Ficha RES — sin generar' END,
      CASE WHEN (e.documentacion->>'anexo_fotografico_drive_link') IS NULL
           THEN 'Anexo fotográfico — sin generar' END
    ]::text[], NULL)

    -- ── 8. PTE FIN EXPTE ────────────────────────────────────────────────────
    -- Documentación generada, pendiente de firmas y entrega final.
    WHEN 'PTE FIN EXPTE' THEN array_remove(ARRAY[
      CASE WHEN (e.documentacion->>'cert_rite_drive_link')    IS NULL
           THEN 'Certificado RITE — no aportado' END,
      CASE WHEN (e.documentacion->>'cert_cifo_drive_link')    IS NULL
           THEN 'CIFO — sin generar' END,
      CASE WHEN (e.documentacion->>'cert_cifo_sent_at')       IS NULL
           AND (e.documentacion->>'cert_cifo_drive_link')     IS NOT NULL
           THEN 'CIFO — generado pero no enviado' END,
      CASE WHEN (e.documentacion->>'cert_cifo_signed_link')   IS NULL
           THEN 'CIFO — sin firmar' END,
      CASE WHEN (e.documentacion->>'ficha_res060_drive_link') IS NULL
           THEN 'Ficha RES — sin generar' END,
      CASE WHEN (e.documentacion->>'anexo_fotografico_drive_link') IS NULL
           THEN 'Anexo fotográfico — sin generar' END,
      CASE WHEN (e.documentacion->>'anexo_i_signed_link')     IS NULL
           THEN 'Anexo I — sin firmar' END,
      CASE WHEN (e.documentacion->>'anexo_cesion_signed_link') IS NULL
           THEN 'Cesión de Ahorros — sin firmar' END
    ]::text[], NULL)

    -- ── 9. EN TRAMITACIÓN (alias legacy de PTE FIN EXPTE) ───────────────────
    WHEN 'EN TRAMITACIÓN' THEN array_remove(ARRAY[
      CASE WHEN (e.documentacion->>'cert_rite_drive_link')    IS NULL
           THEN 'Certificado RITE — no aportado' END,
      CASE WHEN (e.documentacion->>'cert_cifo_drive_link')    IS NULL
           THEN 'CIFO — sin generar' END,
      CASE WHEN (e.documentacion->>'cert_cifo_signed_link')   IS NULL
           THEN 'CIFO — sin firmar' END,
      CASE WHEN (e.documentacion->>'ficha_res060_drive_link') IS NULL
           THEN 'Ficha RES — sin generar' END,
      CASE WHEN (e.documentacion->>'anexo_fotografico_drive_link') IS NULL
           THEN 'Anexo fotográfico — sin generar' END,
      CASE WHEN (e.documentacion->>'anexo_i_signed_link')     IS NULL
           THEN 'Anexo I — sin firmar' END,
      CASE WHEN (e.documentacion->>'anexo_cesion_signed_link') IS NULL
           THEN 'Cesión de Ahorros — sin firmar' END
    ]::text[], NULL)

    WHEN 'FINALIZADO' THEN ARRAY[]::text[]

    ELSE ARRAY['Estado no reconocido: ' || COALESCE(e.estado, 'NULL')]::text[]

  END AS campos_pendientes,

  -- ── Historial completo del expediente ─────────────────────────────────────
  -- Entradas de tipo estado:     { id, estado, fecha, usuario }
  -- Entradas de tipo comentario: { id, tipo: 'comentario', texto, fecha, usuario }
  COALESCE(e.documentacion->'historial', '[]'::jsonb) AS historial_json

FROM public.expedientes e;

COMMENT ON VIEW public.v_expedientes_lifecycle IS
  'Ciclo de vida de expedientes (8 estados): estado actual, checklist de pendientes consciente del estado, booleanos de documentación, responsable del bloqueo y días atascado. Una fila por expediente.';


-- ─── VISTA 2: Expedientes con pendientes (vista de trabajo) ──────────────────
-- Filtra los expedientes NO finalizados. Incluye datos de cliente y partner.
-- Ordenados por días en estado actual (los más atascados primero).
--
-- Vista principal para el asistente IA:
--   SELECT * FROM v_expedientes_pendientes;

CREATE OR REPLACE VIEW public.v_expedientes_pendientes AS
SELECT
  lc.id,
  lc.numero_expediente,
  lc.estado_actual,
  lc.dias_en_estado_actual,
  lc.responsable_bloqueo,
  lc.campos_pendientes,
  lc.num_facturas,

  -- ── Progreso de documentación ──────────────────────────────────────────────
  -- Documentos generados: máximo 6 (Anexo I, Cesión, Ficha RES, CIFO, RITE, Foto)
  (
    lc.anexo_i_generado::int   +
    lc.cesion_generada::int    +
    lc.ficha_res_generada::int +
    lc.cifo_generado::int      +
    lc.rite_aportado::int      +
    lc.foto_generada::int
  ) AS docs_generados_total,

  -- Documentos firmados por el cliente: máximo 4 (Anexo I, Cesión, CIFO, Foto)
  -- La Ficha RES y el RITE no requieren firma del cliente.
  (
    lc.anexo_i_firmado::int +
    lc.cesion_firmada::int  +
    lc.cifo_firmado::int    +
    lc.foto_firmada::int
  ) AS docs_firmados_total,

  -- ── Documentos enviados al cliente ────────────────────────────────────────
  (
    lc.anexo_i_enviado::int +
    lc.cesion_enviada::int  +
    lc.cifo_enviado::int    +
    lc.foto_enviada::int
  ) AS docs_enviados_total,

  -- ── Subestados CEE ────────────────────────────────────────────────────────
  lc.seguimiento_cee_inicial,
  lc.seguimiento_cee_final,

  -- ── Anomalías de integridad documental ────────────────────────────────────
  -- Detecta cuando existe un firmado sin el borrador correspondiente
  -- (ocurre si se subió el PDF firmado directamente sin pasar por la generación).
  array_remove(ARRAY[
    CASE WHEN lc.anexo_i_firmado  AND NOT lc.anexo_i_generado  THEN 'Anexo I: firmado sin borrador en Drive'   END,
    CASE WHEN lc.cesion_firmada   AND NOT lc.cesion_generada   THEN 'Cesión: firmada sin borrador en Drive'    END,
    CASE WHEN lc.cifo_firmado     AND NOT lc.cifo_generado     THEN 'CIFO: firmado sin borrador en Drive'      END,
    CASE WHEN lc.foto_firmada     AND NOT lc.foto_generada     THEN 'Fotográfico: firmado sin borrador en Drive' END
  ]::text[], NULL) AS anomalias_docs,

  -- ── Datos del cliente ─────────────────────────────────────────────────────
  c.nombre_razon_social AS cliente_nombre,
  c.municipio           AS cliente_municipio,
  c.provincia           AS cliente_provincia,

  -- ── Datos del partner ─────────────────────────────────────────────────────
  p.razon_social        AS partner_nombre,
  p.acronimo            AS partner_acronimo

FROM public.v_expedientes_lifecycle lc
JOIN  public.expedientes   e ON e.id             = lc.id
JOIN  public.clientes      c ON c.id_cliente     = e.cliente_id
LEFT JOIN public.oportunidades o ON o.id         = e.oportunidad_id
LEFT JOIN public.prescriptores p ON p.id_empresa = o.prescriptor_id

WHERE lc.estado_actual <> 'FINALIZADO'

ORDER BY
  lc.dias_en_estado_actual DESC NULLS LAST,
  lc.numero_expediente;

COMMENT ON VIEW public.v_expedientes_pendientes IS
  'Expedientes activos (no finalizados) con pendientes. Incluye anomalías de integridad documental, progreso de docs y datos de cliente/partner. Vista principal para el asistente IA.';
