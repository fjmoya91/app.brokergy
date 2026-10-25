-- ============================================================================
-- FACTURACIÓN (fase 1) — catálogo de ARTÍCULOS y presupuestos con N PARTIDAS
-- ----------------------------------------------------------------------------
-- Sustituye la app de presupuestos de AppSheet ("APP PPTO Y FACTURAS").
--
-- · `articulos`: el catálogo, con su precio por defecto, sus VARIANTES (cada una
--   con su precio: «Legalización FV» → vivienda unifamiliar / nave industrial),
--   las partidas que ARRASTRA (un CEE arrastra la tasa de registro de su
--   comunidad) y si al aceptarse ABRE un expediente CEE.
-- · `cee_ofertas` pasa a ser la tabla de TODOS los presupuestos (no solo de
--   CEE): se le añaden las LÍNEAS. Las ofertas antiguas (sin `lineas`) se siguen
--   leyendo con sus columnas de siempre (alcance, precio, tasa, num_tasas).
--   No se renombra: el backend de producción la sigue usando con este nombre
--   mientras no se despliegue la versión nueva, y todo lo de aquí es ADITIVO.
-- · Numeración: un presupuesto con líneas sigue la serie de AppSheet
--   `P-{YY}ING_{n}` (la app manda desde el 24/10/2026; el último de AppSheet fue
--   P-26ING_39). Sin líneas (el backend antiguo) sigue saliendo `{AAAA}PCEE_{n}`.
--
-- Regla 150: RLS deny-all y GRANT a service_role en el mismo script.
-- Fecha: 2026-10-24
-- ============================================================================

-- ── Catálogo ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.articulos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ID ARTICULO de la hoja de AppSheet. Las FACTURAS todavía se escriben en esa
    -- hoja (fase 2) y su DETALLE FACTURA guarda este id. No es único: dos
    -- conceptos nuestros pueden facturarse con el mismo artículo de la hoja.
    appsheet_id TEXT,
    nombre      TEXT NOT NULL,                       -- el concepto que lee el cliente
    familia     TEXT NOT NULL DEFAULT 'OTROS',
    precio      NUMERIC(10,2) NOT NULL DEFAULT 0,    -- SIN IVA
    iva_pct     NUMERIC(5,2)  NOT NULL DEFAULT 21,
    -- Suplido: se paga a la Administración en nombre del cliente (tasas). Va sin
    -- IVA y sin descuento (art. 78.Tres.3º LIVA).
    suplido     BOOLEAN NOT NULL DEFAULT FALSE,
    variantes   JSONB NOT NULL DEFAULT '[]',        -- [{ id, nombre, precio }]
    arrastra    JSONB NOT NULL DEFAULT '[]',        -- [{ articulo_id, uds }]
    -- Qué pone en marcha al aceptarse: un CEE suelto o inicial + final. NULL = nada.
    genera      TEXT CHECK (genera IN ('CEE_UNICO', 'CEE_DOBLE')),
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    orden       INT NOT NULL DEFAULT 100,
    usos        INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS articulos_activo_idx ON public.articulos (activo, familia, orden);

ALTER TABLE public.articulos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.articulos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.articulos TO service_role;

-- ── Presupuestos con partidas ───────────────────────────────────────────────
ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS lineas JSONB;           -- [{ articulo_id, appsheet_id, variante_id, descripcion, detalle, uds, precio, dtoPct, ivaPct, suplido, genera, arrastrada_de }]
ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS neto  NUMERIC(12,2);    -- base imponible (para el listado: no lee `lineas`)
ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS iva   NUMERIC(12,2);
ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS total NUMERIC(12,2);
ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS concepto TEXT;          -- resumen corto («CEE + legalización FV»)
ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS rechazada_at TIMESTAMPTZ;
-- La primera vez que el cliente abre el enlace: «visto» dice a quién llamar.
ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS visto_at TIMESTAMPTZ;

-- Un presupuesto sin CEE no tiene alcance ni «precio» (honorario único).
ALTER TABLE public.cee_ofertas ALTER COLUMN alcance DROP NOT NULL;
ALTER TABLE public.cee_ofertas ALTER COLUMN precio  DROP NOT NULL;

-- Estados: + BORRADOR (creado, aún no enviado: lo usa el MCP para enseñarlo
-- antes de mandarlo) y RECHAZADA (el cliente dijo que no).
DO $$
DECLARE c TEXT;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.cee_ofertas'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) ILIKE '%estado%'
    LOOP
        EXECUTE format('ALTER TABLE public.cee_ofertas DROP CONSTRAINT %I', c);
    END LOOP;
END $$;
ALTER TABLE public.cee_ofertas ADD CONSTRAINT cee_ofertas_estado_check
    CHECK (estado IN ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'ANULADA'));

-- Numeración: el número deja de ser una columna generada (los ya emitidos
-- conservan el suyo) y lo pone un trigger en el INSERT, en la misma sentencia:
-- dos altas a la vez no pueden sacar el mismo.
ALTER TABLE public.cee_ofertas ALTER COLUMN numero DROP EXPRESSION IF EXISTS;

CREATE SEQUENCE IF NOT EXISTS public.presupuestos_ing_seq START 40;
REVOKE ALL ON SEQUENCE public.presupuestos_ing_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.presupuestos_ing_seq TO service_role;

CREATE OR REPLACE FUNCTION public.presupuesto_numero() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.numero IS NULL THEN
        IF NEW.lineas IS NOT NULL THEN
            NEW.numero := 'P-' || to_char(NOW() AT TIME ZONE 'Europe/Madrid', 'YY') || 'ING_'
                          || nextval('public.presupuestos_ing_seq')::TEXT;
        ELSE
            NEW.numero := NEW.anio::TEXT || 'PCEE_' || NEW.correlativo::TEXT;
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cee_ofertas_numero_trg ON public.cee_ofertas;
CREATE TRIGGER cee_ofertas_numero_trg BEFORE INSERT ON public.cee_ofertas
    FOR EACH ROW EXECUTE FUNCTION public.presupuesto_numero();

REVOKE ALL ON FUNCTION public.presupuesto_numero() FROM anon, authenticated, public;

-- ============================================================================
-- FACTURACIÓN (fase 2) — FACTURAS EMITIDAS desde la app
-- ----------------------------------------------------------------------------
-- · `facturacion_emisores`: quién factura en cada SERIE. ING = BROKERGY (la
--   sociedad); FML = Fran como profesional, a la sociedad, con retención de IRPF.
--   Los datos de una persona física (DNI, IBAN) viven AQUÍ y no en el código:
--   el repositorio es público. La fila FML se da de alta desde la app.
-- · `facturas_emitidas`: el registro de la app de cada factura (las de la
--   pestaña Facturación, las de los CEE directos, las de la fase 7 del lote y,
--   importadas, las de AppSheet). El NÚMERO de las ordinarias lo sigue
--   reservando la hoja de AppSheet (facturaSheetService: comparte la serie con
--   AppSheet mientras conviva); las RECTIFICATIVAS van en su serie específica
--   (art. 6.1.a RD 1619/2012) `R-{YY}{SERIE}_{n}`, que numera esta tabla.
--   Los datos fiscales del cliente se guardan como FOTO al emitir: una factura
--   no cambia porque luego se corrija la ficha.
-- · VERI*FACTU: cada factura emitida por la app lleva su registro de alta con
--   la HUELLA encadenada a la anterior DEL MISMO EMISOR (`vf_nif`, `vf_orden`).
--   El índice único impide dos registros con el mismo orden: la cadena no se
--   puede bifurcar aunque se emitan dos a la vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.facturacion_emisores (
    serie        TEXT PRIMARY KEY CHECK (serie ~ '^[A-Z]{2,6}$'),
    razon_social TEXT NOT NULL,
    nif          TEXT NOT NULL,
    direccion    TEXT,
    cp           TEXT,
    municipio    TEXT,
    provincia    TEXT,
    tlf          TEXT,
    email        TEXT,
    banco        TEXT,
    iban         TEXT,
    irpf_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,      -- retención por defecto (FML: 15)
    observaciones TEXT,                               -- texto legal por defecto de la serie
    persona_fisica BOOLEAN NOT NULL DEFAULT FALSE,
    activo       BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.facturacion_emisores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.facturacion_emisores FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.facturacion_emisores TO service_role;

-- La sociedad (datos públicos: ya están en el código, `BROKERGY_EMISOR`).
INSERT INTO public.facturacion_emisores (serie, razon_social, nif, direccion, cp, municipio, provincia, tlf, email, banco, iban)
VALUES ('ING', 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL', 'B19350222', 'C/ Don Sergio 12, 1º E', '13700',
        'Tomelloso', 'Ciudad Real', '695 615 330', 'info@brokergy.es', 'BBVA', 'ES10 0182 0394 3002 0175 3286')
ON CONFLICT (serie) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.facturas_emitidas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serie         TEXT NOT NULL,                       -- emisor: ING · FML
    -- F1 ordinaria · R1 rectificativa (art. 80 Uno, Dos y Seis LIVA y error fundado de derecho) · R4 resto
    tipo          TEXT NOT NULL DEFAULT 'F1' CHECK (tipo IN ('F1', 'R1', 'R4')),
    numero        TEXT UNIQUE,                         -- NULL mientras es BORRADOR
    correlativo   INT,
    -- EMITIDA = pendiente de cobro (en la hoja, «ENVIADA»). RECTIFICADA = anulada por una rectificativa total.
    estado        TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'EMITIDA', 'PAGADA', 'RECTIFICADA')),
    fecha         DATE,                                -- de expedición
    vencimiento   DATE,
    fecha_operacion TEXT,                              -- «septiembre 2026» si no es la de expedición (art. 6.1.l)
    fecha_pago    DATE,
    cliente_id    UUID REFERENCES public.clientes(id_cliente) ON DELETE SET NULL,
    cliente       JSONB NOT NULL DEFAULT '{}',         -- foto: { razon_social, cif, direccion, cp, municipio, provincia, tlf, email, es_empresa }
    cliente_propio JSONB,                              -- lo tecleado SOLO para esta factura (lo demás, la ficha del día de emitir)
    cliente_nombre TEXT,                               -- para el listado y la búsqueda (no se lee el JSONB: regla 22)
    cliente_nif   TEXT,
    lineas        JSONB NOT NULL DEFAULT '[]',         -- las de presupuesto.js: { descripcion, detalle, uds, precio, dtoPct, ivaPct, suplido, articulo_id, appsheet_id }
    concepto      TEXT,
    neto          NUMERIC(12,2) NOT NULL DEFAULT 0,
    iva           NUMERIC(12,2) NOT NULL DEFAULT 0,
    irpf_pct      NUMERIC(5,2)  NOT NULL DEFAULT 0,
    irpf          NUMERIC(12,2) NOT NULL DEFAULT 0,    -- retención (se RESTA del total)
    descuento     NUMERIC(12,2) NOT NULL DEFAULT 0,
    total         NUMERIC(12,2) NOT NULL DEFAULT 0,    -- a pagar = neto + iva − irpf
    observaciones TEXT,
    expediente    TEXT,                                -- nº de expediente asociado (texto, como la hoja)
    presupuesto_id UUID REFERENCES public.cee_ofertas(id) ON DELETE SET NULL,
    cee_directo_id UUID REFERENCES public.cee_directos(id) ON DELETE SET NULL,
    rectifica_id  UUID REFERENCES public.facturas_emitidas(id) ON DELETE RESTRICT,
    rectifica_numero TEXT,
    motivo_rectificacion TEXT,
    origen        TEXT NOT NULL DEFAULT 'APP' CHECK (origen IN ('APP', 'CEE_DIRECTO', 'GESTION_CAE', 'APPSHEET')),
    hoja_id       TEXT,                                -- id de su fila en la hoja de AppSheet
    emisor        JSONB,                               -- foto del emisor al emitir (un IBAN que cambia no cambia una factura emitida)
    pdf           JSONB,                               -- { driveId, nombre, link, copiaId, contabilidad }
    envios        JSONB NOT NULL DEFAULT '[]',
    enviada_at    TIMESTAMPTZ,                         -- último envío (el listado no lee `envios`)
    historial     JSONB NOT NULL DEFAULT '[]',
    -- VERI*FACTU: el registro de alta (huella encadenada) de lo que emite la app.
    vf_nif        TEXT,
    vf_orden      INT,
    vf_huella     TEXT,
    verifactu     JSONB,                               -- { registro, importe_total, cuota_total, avisos, estado: NO_REMITIDO|PENDIENTE|…, entorno, csv, error }
    created_by    UUID,
    emitida_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS facturas_emitidas_fecha_idx   ON public.facturas_emitidas (fecha DESC);
CREATE INDEX IF NOT EXISTS facturas_emitidas_estado_idx  ON public.facturas_emitidas (estado);
CREATE INDEX IF NOT EXISTS facturas_emitidas_cliente_idx ON public.facturas_emitidas (cliente_id);
CREATE INDEX IF NOT EXISTS facturas_emitidas_ppto_idx    ON public.facturas_emitidas (presupuesto_id);
CREATE UNIQUE INDEX IF NOT EXISTS facturas_emitidas_vf_cadena ON public.facturas_emitidas (vf_nif, vf_orden) WHERE vf_orden IS NOT NULL;

ALTER TABLE public.facturas_emitidas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.facturas_emitidas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.facturas_emitidas TO service_role;

NOTIFY pgrst, 'reload schema';
