-- ============================================================================
-- PURGA de los blobs base64 CORRUPTOS de `expedientes.documentacion`
-- ============================================================================
-- Ejecutado el 2026-07-22 tras las dos caídas (BD "unhealthy") del 21/07.
--
-- CONTEXTO
-- --------
-- `expedientes` pesaba 118 MB para 224 filas; 118 MB eran TOAST. La columna
-- `documentacion` sumaba 66 MB, de los que solo 527 kB eran datos reales: el
-- 99,2 % eran imágenes en base64 incrustadas en el JSONB. Cada consulta que
-- tocaba la columna (aunque solo pidiera un subcampo) obligaba a Postgres a
-- descomprimir la columna entera → 12 GB de I/O de TOAST en horas, consultas de
-- 12-15 s, statement timeouts en cascada y OOM en la instancia Micro (1 GB RAM).
--
-- POR QUÉ SE PUEDEN BORRAR
-- ------------------------
-- El antiguo bug de `normalizeData` pasó el base64 a MAYÚSCULAS y base64 es
-- case-sensitive: el dato ya está destruido. Verificado decodificando el magic
-- number real de cada imagen — 0 de 143 fotos en mayúsculas dan `ffd8ff` (JPEG);
-- las 8 en minúsculas dan las tres. La conversión a mayúsculas es irreversible.
--
-- Además el original vive en Drive y es lo que la app usa de verdad:
-- AnexoFotograficoModal recarga siempre vía /api/public/anexo-photos, y la
-- generación server-side usa anexoFotograficoService.collectPhotoGroups (Drive).
--
-- QUÉ SE CONSERVA
-- ---------------
--  · Las 8 fotos con base64 VÁLIDO (minúsculas) — intactas.
--  · La estructura de cada entrada { id, fase, label, file: { name } }: solo se
--    quita la clave `data`. El modal sigue mostrando los conceptos y recarga de
--    Drive. Es el mismo formato que ya produce el PUT en routes/expedientes.js.
--  · `updated_at` NO se toca: es una limpieza técnica y el listado ordena por
--    ese campo (cambiarlo reordenaría la vista del usuario sin motivo).
--
-- Backup previo: scripts/backup_blobs_documentacion.js → backups/*.json (65,8 MB)
-- ============================================================================

-- ─── 1. Fotos: quitar `file.data` solo cuando NO es un data-url válido ───────
UPDATE expedientes e
SET documentacion = jsonb_set(
        e.documentacion,
        '{photo_attachments}',
        (
            SELECT jsonb_agg(
                       CASE
                           WHEN el->'file' ? 'data'
                                AND coalesce(el->'file'->>'data', '') NOT LIKE 'data:%'
                           THEN jsonb_set(el, '{file}', (el->'file') - 'data')
                           ELSE el
                       END
                       ORDER BY ord
                   )
            FROM jsonb_array_elements(e.documentacion->'photo_attachments') WITH ORDINALITY AS t(el, ord)
        )
    )
WHERE jsonb_typeof(e.documentacion->'photo_attachments') = 'array'
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(e.documentacion->'photo_attachments') el
      WHERE el->'file' ? 'data'
        AND coalesce(el->'file'->>'data', '') NOT LIKE 'data:%'
  );

-- ─── 2. Fichas técnicas del CIFO ─────────────────────────────────────────────
-- Ya no se usan: viven en Drive (ft_aerotermia_*_id) desde 2026-05-25 y el
-- frontend las descarta al cargar (DocumentacionModule.jsx). Sobrevivían en BD
-- solo porque el PUT hace spread sobre lo existente y nunca borraba la clave.
-- Sustituye a clean_cifo_attachments.sql, que nunca llegó a ejecutarse.
UPDATE expedientes
SET documentacion = documentacion - 'cifo_attachments'
WHERE documentacion ? 'cifo_attachments';

-- ─── 3. Devolver el espacio al sistema ───────────────────────────────────────
-- Bloquea la tabla mientras corre (224 filas → segundos). Fuera de horario.
-- No se puede ejecutar dentro de una transacción.
VACUUM (FULL, ANALYZE) expedientes;

-- ─── 4. Comprobación ─────────────────────────────────────────────────────────
SELECT pg_size_pretty(pg_total_relation_size('expedientes'))       AS tabla,
       pg_size_pretty(sum(pg_column_size(documentacion))::bigint)  AS documentacion,
       count(*) FILTER (WHERE documentacion ? 'cifo_attachments')  AS cifo_restantes
FROM expedientes;
