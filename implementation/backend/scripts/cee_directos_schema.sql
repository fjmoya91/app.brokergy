-- ============================================================================
-- cee_directos — Certificados de Eficiencia Energética contratados SUELTOS
-- ----------------------------------------------------------------------------
-- Negocio DISTINTO del CAE: aquí no hay ficha (RES060/RES080/RES093/TER100), ni
-- ahorro, ni lote, ni CIFO. Solo nos contratan el certificado. Por eso NO va en
-- `expedientes`: esa tabla exige `oportunidad_id NOT NULL`, y meter aquí una
-- oportunidad sintética por cada encargo contaminaría el embudo del cuadro de
-- mando, las vistas de lifecycle, los lotes y el radar del parte diario.
--
-- Lo que SÍ se comparte con el CAE (a propósito, no por casualidad):
--   · `clientes` y `prescriptores` — el cliente y quien trae el encargo son los
--     mismos de siempre.
--   · La forma de `cee` / `seguimiento` / `documentacion` — así el módulo CEE del
--     expediente (CeeModule + CeeDocumentsGrid) se monta tal cual sobre esta
--     tabla, sin bifurcar su lógica.
--   · Los 8 subestados de seguimiento (PTE_ENVIO_CERT … REGISTRADO) y sus
--     timestamps paralelos (`*_ts`, `*_desde`, `*_last_contacto_at`), que sella
--     `services/seguimientoTracking.js` — funciones puras sobre el objeto, no
--     atadas a ninguna tabla.
--
-- Fecha: 2026-08-24
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cee_directos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ── Identidad ───────────────────────────────────────────────────────────
    -- Formato `{AAAA}CEE_{correlativo}` (2026CEE_55). OJO, no es el del CAE:
    -- aquí el año va a CUATRO dígitos y el correlativo es GLOBAL — no se
    -- reinicia en enero (2025CEE_44 → 2026CEE_45).
    numero_expediente VARCHAR(50) NOT NULL,
    anio              INT         NOT NULL,
    correlativo       INT         NOT NULL,

    -- Duplicado heredado del sistema manual: existen DOS carpetas `2025CEE_18`
    -- (Alfredo Castellanos y Vasil Marinov). Se importan las dos porque las dos
    -- son trabajo real, y la segunda se marca aquí. Es lo que permite que el
    -- índice único siga protegiendo a todo lo demás, incluida cualquier alta
    -- manual futura, sin tener que falsear el número de un expediente histórico.
    duplicado_historico BOOLEAN NOT NULL DEFAULT false,

    -- Rótulo del expediente y nombre de la carpeta de Drive: `{numero} - {nombre}`.
    nombre TEXT NOT NULL,

    -- ── Alcance del encargo ─────────────────────────────────────────────────
    -- 'UNICO' → un solo certificado (compraventa, alquiler…). No se llama
    -- "inicial" porque en esos encargos no hay un después.
    -- 'DOBLE' → inicial + final (hay obra de por medio).
    -- Se puede pasar de UNICO a DOBLE cuando el encargo crece; nunca al revés
    -- por la vía automática (habría que borrar un CEE ya emitido).
    alcance VARCHAR(10) NOT NULL DEFAULT 'UNICO'
        CHECK (alcance IN ('UNICO', 'DOBLE')),

    -- ── Partes ──────────────────────────────────────────────────────────────
    -- El cliente es OBLIGATORIO y con la ficha completa: cuando se le encarga el
    -- trabajo al certificador, le tienen que llegar los mismos datos que en un
    -- expediente CAE (nombre, DNI, teléfono, dirección). Un encargo con "un
    -- nombre y un móvil" obliga a perseguir los datos justo cuando hay prisa.
    cliente_id     UUID NOT NULL REFERENCES public.clientes(id_cliente)      ON DELETE RESTRICT,
    -- Quién trae el encargo (INERSOS, LANUZA, AIMET…). Opcional: hay encargos
    -- que entran directos.
    prescriptor_id UUID          REFERENCES public.prescriptores(id_empresa) ON DELETE SET NULL,

    -- ── Inmueble ────────────────────────────────────────────────────────────
    -- Dirección de la INSTALACIÓN, que no tiene por qué ser el domicilio del
    -- cliente (mismo criterio que en el CAE).
    direccion      TEXT,
    ref_catastral  VARCHAR(25),
    ccaa           TEXT,
    provincia      TEXT,
    municipio      TEXT,
    codigo_postal  VARCHAR(10),

    -- ── Estado ──────────────────────────────────────────────────────────────
    -- Derivado de los subestados de `seguimiento` (fuente única:
    -- utils/ceeDirectoEstados.js). Se persiste para poder ordenar y filtrar el
    -- listado sin recalcularlo fila a fila.
    estado VARCHAR(60) NOT NULL DEFAULT 'PTE. CEE INICIAL',

    -- ── Módulos JSONB ───────────────────────────────────────────────────────
    -- Misma forma que en `expedientes` para que el módulo CEE se monte tal cual.
    -- REGLA 21: aquí NUNCA va un fichero en base64. Solo enlaces y driveId.
    cee           JSONB NOT NULL DEFAULT '{}',
    seguimiento   JSONB NOT NULL DEFAULT '{}',
    documentacion JSONB NOT NULL DEFAULT '{}',

    -- ── Drive ───────────────────────────────────────────────────────────────
    drive_folder_id   TEXT,
    drive_folder_link TEXT,

    -- ── Candado de cobro ────────────────────────────────────────────────────
    -- El cliente ve su expediente y sube documentación desde el primer día, pero
    -- NO se descarga el certificado, la etiqueta ni el registro hasta que esto
    -- está marcado. Solo ADMIN lo marca: toca dinero.
    cobrado     BOOLEAN NOT NULL DEFAULT false,
    cobrado_at  TIMESTAMPTZ,
    cobrado_por UUID,

    -- Enlace del cliente: /mi-cee/:id?token=  (32 hex, como upload_token).
    portal_token TEXT,

    notas TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,

    -- Los importados del Drive antiguo llegan sin datos: sirve para no
    -- confundir "no consta" con "está pendiente".
    origen VARCHAR(20) NOT NULL DEFAULT 'APP'
        CHECK (origen IN ('APP', 'HISTORICO'))
);

-- El número es único para todo lo que no sea el duplicado heredado. Un índice
-- parcial en vez de un UNIQUE a secas: bloquea el alta manual de un número ya
-- usado (que es lo que se pidió) sin obligar a renumerar el 2025CEE_18 de nadie.
CREATE UNIQUE INDEX IF NOT EXISTS cee_directos_numero_uidx
    ON public.cee_directos (numero_expediente)
    WHERE NOT duplicado_historico;

CREATE INDEX IF NOT EXISTS cee_directos_correlativo_idx  ON public.cee_directos (correlativo DESC);
CREATE INDEX IF NOT EXISTS cee_directos_cliente_idx      ON public.cee_directos (cliente_id);
CREATE INDEX IF NOT EXISTS cee_directos_prescriptor_idx  ON public.cee_directos (prescriptor_id);
CREATE INDEX IF NOT EXISTS cee_directos_estado_idx       ON public.cee_directos (estado);
-- El certificador asignado vive en `cee.certificador_id`: el listado del técnico
-- y el radar del parte filtran por ahí, así que necesita índice propio.
CREATE INDEX IF NOT EXISTS cee_directos_certificador_idx
    ON public.cee_directos ((cee ->> 'certificador_id'));
CREATE INDEX IF NOT EXISTS cee_directos_portal_token_idx
    ON public.cee_directos (portal_token) WHERE portal_token IS NOT NULL;

-- ── Seguridad ───────────────────────────────────────────────────────────────
-- RLS deny-all: no lleva policies a propósito. TODO acceso pasa por el backend
-- con service_role, que se salta el RLS. El lint INFO "RLS Enabled No Policy"
-- del advisor es INTENCIONADO — no añadir policies para silenciarlo.
ALTER TABLE public.cee_directos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cee_directos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cee_directos TO service_role;

-- ── Guardarraíl de tamaño ───────────────────────────────────────────────────
-- Gemelo de `check_documentacion_size` sobre `expedientes` (regla 21): Postgres
-- descomprime la columna JSONB ENTERA en cuanto una consulta la toca, aunque
-- solo pida un subcampo. 48 MB de fotos en base64 tumbaron la BD dos veces el
-- 21/07/2026. Aquí se corta antes de que entre.
CREATE OR REPLACE FUNCTION public.check_cee_directo_size()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF pg_column_size(NEW.documentacion) > 2 * 1024 * 1024 THEN
        RAISE EXCEPTION 'cee_directos.documentacion supera 2 MB (%). Los ficheros van a Drive; en BD solo el enlace o el driveId.',
            pg_size_pretty(pg_column_size(NEW.documentacion)::bigint);
    END IF;
    IF pg_column_size(NEW.cee) > 4 * 1024 * 1024 THEN
        RAISE EXCEPTION 'cee_directos.cee supera 4 MB (%). El XML del CEE cabe, un PDF en base64 no.',
            pg_size_pretty(pg_column_size(NEW.cee)::bigint);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cee_directos_size_guard ON public.cee_directos;
CREATE TRIGGER cee_directos_size_guard
    BEFORE INSERT OR UPDATE ON public.cee_directos
    FOR EACH ROW EXECUTE FUNCTION public.check_cee_directo_size();

-- ── Escrituras atómicas ─────────────────────────────────────────────────────
-- Gemelas de `merge_expediente_doc_json` / `set_expediente_doc_field`. Mismo
-- motivo que allí (regla 19): un read-modify-write de todo `documentacion` desde
-- dos peticiones a la vez se pisa y pierde datos. Aquí pasa igual — subir el
-- .cex y sellar la fecha de registro pueden caer en el mismo segundo.
CREATE OR REPLACE FUNCTION public.merge_cee_directo_doc_json(
    p_id    uuid,
    p_field text,
    p_value jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.cee_directos
    SET documentacion = jsonb_set(
            COALESCE(documentacion, '{}'::jsonb),
            ARRAY[p_field],
            COALESCE(documentacion -> p_field, '{}'::jsonb) || COALESCE(p_value, '{}'::jsonb),
            true),
        updated_at = NOW()
    WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_cee_directo_doc_field(
    p_id    uuid,
    p_field text,
    p_value text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.cee_directos
    SET documentacion = jsonb_set(
            COALESCE(documentacion, '{}'::jsonb),
            ARRAY[p_field],
            CASE WHEN p_value IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_value) END,
            true),
        updated_at = NOW()
    WHERE id = p_id;
END;
$$;

-- Alta con número automático a prueba de carreras. Dos altas simultáneas leyendo
-- `MAX(correlativo)+1` desde Node obtendrían el MISMO número; el índice único
-- salvaría el dato pero una de las dos reventaría delante del usuario. El bloqueo
-- de la tabla lo resuelve en el sitio donde se puede resolver.
CREATE OR REPLACE FUNCTION public.cee_directo_siguiente_correlativo()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_next INT;
BEGIN
    LOCK TABLE public.cee_directos IN SHARE ROW EXCLUSIVE MODE;
    SELECT COALESCE(MAX(correlativo), 0) + 1 INTO v_next FROM public.cee_directos;
    RETURN v_next;
END;
$$;

-- Las tres RPC son internas del backend. Los default privileges de Supabase dan
-- EXECUTE a anon/authenticated en TODA función nueva de `public`, y el REVOKE a
-- PUBLIC no los toca: hacen falta las dos revocaciones.
REVOKE EXECUTE ON FUNCTION public.merge_cee_directo_doc_json(uuid, text, jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_cee_directo_doc_field(uuid, text, text)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cee_directo_siguiente_correlativo()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_cee_directo_size()                       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_cee_directo_doc_json(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_cee_directo_doc_field(uuid, text, text)   TO service_role;
GRANT EXECUTE ON FUNCTION public.cee_directo_siguiente_correlativo()           TO service_role;

-- ── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_cee_directo_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cee_directos_touch_updated ON public.cee_directos;
CREATE TRIGGER cee_directos_touch_updated
    BEFORE UPDATE ON public.cee_directos
    FOR EACH ROW EXECUTE FUNCTION public.touch_cee_directo_updated_at();

REVOKE EXECUTE ON FUNCTION public.touch_cee_directo_updated_at() FROM PUBLIC, anon, authenticated;
