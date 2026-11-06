-- ============================================================================
-- informes — los INFORMES TÉCNICOS: todo trabajo que NO es CAE ni CEE
-- ----------------------------------------------------------------------------
-- Memorias para el Ayuntamiento (bonificación del IBI, título habilitante),
-- legalizaciones, informes técnicos, auditorías, consultoría… Fran, 05/11/2026:
-- «que para las memorias y los informes sea el mismo 2026INF_n. Será todo lo
-- que no sea CAE ni CEE». La primera fue la memoria del IBI de 26RES060_OP310.
--
-- Tabla PROPIA (no `expedientes`, que exige oportunidad; no `cee_directos`, cuyo
-- correlativo es el de los certificados desde 2024 y cuyo estado se deriva de
-- los subestados del CEE). Se comparte lo de siempre: `clientes`,
-- `prescriptores`, los presupuestos (`cee_ofertas`) y las facturas
-- (`facturas_emitidas`).
--
-- Numeración `{AAAA}INF_{n}`: año a cuatro dígitos y correlativo GLOBAL (no se
-- reinicia en enero), como `{AAAA}CEE_{n}`. La pone un trigger en el INSERT
-- con un candado de transacción: dos altas a la vez no pueden sacar el mismo
-- número (la RPC de los CEE bloquea en OTRA transacción que el INSERT).
--
-- Todo ADITIVO: se puede aplicar antes del deploy sin romper producción.
-- Regla 150: RLS sin policies + GRANT a service_role en este mismo script.
-- Fecha: 2026-11-05
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.informes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ── Identidad (la ponen los triggers; no se mandan desde Node) ──────────
    numero      TEXT,
    anio        INT,
    correlativo INT,

    -- Qué es. El catálogo de tipos vive en utils/informeEstados.js (TIPOS).
    tipo TEXT NOT NULL DEFAULT 'INFORME_TECNICO'
        CHECK (tipo IN ('MEMORIA_AYUNTAMIENTO', 'LEGALIZACION', 'INFORME_TECNICO', 'AUDITORIA', 'CONSULTORIA', 'OTRO')),
    -- Lo que dice la portada y el nombre de los ficheros («MEMORIA TECNICA AYUNTAMIENTO»).
    titulo    TEXT NOT NULL,
    -- Para quién es el papel: «Ayuntamiento de Valdepeñas», «Delegación de Industria»…
    organismo TEXT,

    -- ── Partes ──────────────────────────────────────────────────────────────
    cliente_id     UUID NOT NULL REFERENCES public.clientes(id_cliente)      ON DELETE RESTRICT,
    prescriptor_id UUID          REFERENCES public.prescriptores(id_empresa) ON DELETE SET NULL,

    -- ── De dónde viene ─────────────────────────────────────────────────────
    -- La obra CAE o el CEE de la que sale (OP310 es una oportunidad CAE). Texto:
    -- un nº de oportunidad o de expediente; no se ata con FK a ninguna tabla.
    obra_ref       TEXT,
    cee_directo_id UUID REFERENCES public.cee_directos(id) ON DELETE SET NULL,
    presupuesto_id UUID REFERENCES public.cee_ofertas(id)  ON DELETE SET NULL,

    -- ── Inmueble ───────────────────────────────────────────────────────────
    direccion     TEXT,
    ref_catastral VARCHAR(25),
    ccaa          TEXT,
    provincia     TEXT,
    municipio     TEXT,
    codigo_postal VARCHAR(10),

    -- ── Circuito ───────────────────────────────────────────────────────────
    -- `estado` se DERIVA de los sellos (utils/informeEstados.js) y se persiste
    -- para ordenar y filtrar el listado. No se acepta del navegador.
    estado TEXT NOT NULL DEFAULT 'PTE. REDACCIÓN',
    borrador_at        TIMESTAMPTZ,
    final_at           TIMESTAMPTZ,
    firmado_at         TIMESTAMPTZ,
    factura_numero     TEXT,
    factura_enviada_at TIMESTAMPTZ,
    justificante_at    TIMESTAMPTZ,
    cobrado            BOOLEAN NOT NULL DEFAULT false,
    cobrado_at         TIMESTAMPTZ,
    entregado_at       TIMESTAMPTZ,
    anulado_at         TIMESTAMPTZ,
    motivo_anulacion   TEXT,

    -- ── Drive: `54. INFORMES TECNICOS / {nº} - {CLIENTE}` (informeFolders.js) ─
    drive_folder_id   TEXT,
    drive_folder_link TEXT,

    -- Enlace del cliente (/informe/:token): subir documentación y el justificante.
    portal_token TEXT NOT NULL,

    -- Metadatos pequeños (regla 21: nunca ficheros): firma, justificante, entrega,
    -- avisos. Se escribe con merge_informe_doc_json, nunca leyendo y reescribiendo.
    documentacion JSONB NOT NULL DEFAULT '{}'::jsonb,
    historial     JSONB NOT NULL DEFAULT '[]'::jsonb,
    notas         TEXT,

    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS informes_numero_uq       ON public.informes (numero);
CREATE UNIQUE INDEX IF NOT EXISTS informes_correlativo_uq  ON public.informes (correlativo);
CREATE UNIQUE INDEX IF NOT EXISTS informes_portal_token_uq ON public.informes (portal_token);
CREATE INDEX IF NOT EXISTS informes_cliente_idx     ON public.informes (cliente_id);
CREATE INDEX IF NOT EXISTS informes_presupuesto_idx ON public.informes (presupuesto_id);
CREATE INDEX IF NOT EXISTS informes_estado_idx      ON public.informes (estado);

-- Regla 150.
ALTER TABLE public.informes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.informes TO service_role;
-- Aplicado el 05/11/2026, los privilegios por defecto del proyecto TODAVÍA dieron
-- todo a anon y authenticated: se quitan, como en las tablas hermanas.
REVOKE ALL ON TABLE public.informes FROM anon, authenticated;

-- ── Numeración en el INSERT ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.informe_numerar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.correlativo IS NULL THEN
        -- Candado de ESTA transacción: el MAX y el INSERT van juntos.
        PERFORM pg_advisory_xact_lock(hashtext('informes_correlativo'));
        SELECT COALESCE(MAX(correlativo), 0) + 1 INTO NEW.correlativo FROM public.informes;
    END IF;
    IF NEW.anio IS NULL THEN
        NEW.anio := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Europe/Madrid'))::int;
    END IF;
    IF NEW.numero IS NULL THEN
        NEW.numero := NEW.anio::text || 'INF_' || NEW.correlativo::text;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS informes_numerar ON public.informes;
CREATE TRIGGER informes_numerar
    BEFORE INSERT ON public.informes
    FOR EACH ROW EXECUTE FUNCTION public.informe_numerar();

-- ── Guardarraíl de tamaño (regla 21) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_informe_size()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF pg_column_size(NEW.documentacion) > 1024 * 1024 THEN
        RAISE EXCEPTION 'informes.documentacion supera 1 MB (%). Los ficheros van a Drive; en BD solo el driveId.',
            pg_size_pretty(pg_column_size(NEW.documentacion)::bigint);
    END IF;
    IF pg_column_size(NEW.historial) > 1024 * 1024 THEN
        RAISE EXCEPTION 'informes.historial supera 1 MB (%).', pg_size_pretty(pg_column_size(NEW.historial)::bigint);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS informes_size_guard ON public.informes;
CREATE TRIGGER informes_size_guard
    BEFORE INSERT OR UPDATE ON public.informes
    FOR EACH ROW EXECUTE FUNCTION public.check_informe_size();

-- ── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_informe_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS informes_touch_updated ON public.informes;
CREATE TRIGGER informes_touch_updated
    BEFORE UPDATE ON public.informes
    FOR EACH ROW EXECUTE FUNCTION public.touch_informe_updated_at();

-- ── Escrituras atómicas (regla 19) ──────────────────────────────────────────
-- Un objeto dentro de `documentacion` se FUNDE (subir el justificante y sellar la
-- entrega pueden caer en el mismo segundo).
CREATE OR REPLACE FUNCTION public.merge_informe_doc_json(
    p_id    uuid,
    p_field text,
    p_value jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.informes
    SET documentacion = jsonb_set(
            COALESCE(documentacion, '{}'::jsonb),
            ARRAY[p_field],
            COALESCE(documentacion -> p_field, '{}'::jsonb) || COALESCE(p_value, '{}'::jsonb),
            true)
    WHERE id = p_id;
END;
$$;

-- El historial es una lista: se AÑADE al final en la misma sentencia.
CREATE OR REPLACE FUNCTION public.append_informe_historial(
    p_id      uuid,
    p_entrada jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.informes
    SET historial = COALESCE(historial, '[]'::jsonb) || jsonb_build_array(p_entrada)
    WHERE id = p_id;
END;
$$;

-- Internas del backend: fuera anon/authenticated (los default privileges de
-- Supabase les dan EXECUTE en toda función nueva de `public`).
REVOKE EXECUTE ON FUNCTION public.informe_numerar()                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_informe_size()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_informe_updated_at()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_informe_doc_json(uuid, text, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_informe_historial(uuid, jsonb)       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_informe_doc_json(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.append_informe_historial(uuid, jsonb)     TO service_role;

-- ── Los vínculos con lo que ya existe ───────────────────────────────────────
-- Un artículo del catálogo puede GENERAR un informe al aceptarse el presupuesto
-- («Memoria técnica para el Ayuntamiento»), igual que el CEE genera su expediente.
DO $$
DECLARE c text;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.articulos'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) ILIKE '%genera%'
    LOOP
        EXECUTE format('ALTER TABLE public.articulos DROP CONSTRAINT %I', c);
    END LOOP;
END $$;
ALTER TABLE public.articulos
    ADD CONSTRAINT articulos_genera_check CHECK (genera IN ('CEE_UNICO', 'CEE_DOBLE', 'INFORME'));

-- El presupuesto aceptado que abrió el informe, y la factura que es suya
-- (gemelos de `cee_directo_id`: cobrarla COBRA el informe y lanza la entrega).
ALTER TABLE public.cee_ofertas       ADD COLUMN IF NOT EXISTS informe_id UUID REFERENCES public.informes(id) ON DELETE SET NULL;
ALTER TABLE public.facturas_emitidas ADD COLUMN IF NOT EXISTS informe_id UUID REFERENCES public.informes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS facturas_emitidas_informe_idx ON public.facturas_emitidas (informe_id);

-- Comprobación (regla 150): tiene que salir service_role con los cuatro permisos.
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND table_name = 'informes' ORDER BY 1, 2;
