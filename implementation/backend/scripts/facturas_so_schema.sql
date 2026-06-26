-- ============================================================
-- MIGRACIÓN: Registro de facturas al Sujeto Obligado
-- Ejecutar en: Supabase SQL Editor (o vía MCP apply_migration)
-- Fecha: 2026-06-26
--
-- PROPÓSITO
-- ---------
-- Tabla dedicada para las facturas de venta de CAEs al Sujeto Obligado.
-- Sustituye al campo JSONB `lotes.factura_so` por un registro estructurado,
-- queryable y auditable. Modelo elegido: UNA factura por lote (regenerable);
-- por eso `lote_id` es UNIQUE. Persistencia: el modal AUTO-GUARDA el borrador
-- según se escribe (estado BORRADOR) y pasa a EMITIDA al generar el PDF.
--
-- La numeración F-{año}CAE_{N} se calcula leyendo esta tabla.
--
-- Fechas como VARCHAR dd/mm/aaaa (tal cual se muestran/imprimen) para evitar
-- conversiones de zona horaria; la factura es un documento, no un cálculo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.facturas_so (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lote_id             UUID NOT NULL UNIQUE REFERENCES public.lotes(id) ON DELETE CASCADE,

  numero              VARCHAR(40) UNIQUE,          -- F-{año}CAE_{N}
  fecha               VARCHAR(10),                 -- dd/mm/aaaa
  vencimiento         VARCHAR(10),                 -- dd/mm/aaaa

  cae_inicial         VARCHAR(60),
  cae_final           VARCHAR(60),

  unidades_kwh        NUMERIC,                     -- ahorro verificado facturado
  precio_kwh          NUMERIC,                     -- = oferta_lote / 1000
  base                NUMERIC,
  iva                 NUMERIC,
  total               NUMERIC,

  sujeto_obligado_id  UUID REFERENCES public.prescriptores(id_empresa),  -- foto del S.O. al emitir

  drive_link          TEXT,
  drive_file_id       VARCHAR(100),

  estado              VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',  -- BORRADOR / EMITIDA / ENVIADA / PAGADA
  generada_por        VARCHAR(200),

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.facturas_so IS
  'Facturas de venta de CAEs al Sujeto Obligado. Una por lote (lote_id UNIQUE), regenerable. BORRADOR (auto-guardado) → EMITIDA (PDF generado y guardado en Drive).';

CREATE INDEX IF NOT EXISTS idx_facturas_so_lote   ON public.facturas_so(lote_id);
CREATE INDEX IF NOT EXISTS idx_facturas_so_estado ON public.facturas_so(estado);

-- Seguridad: calca la postura de lotes/expedientes (RLS ON + GRANT; el backend
-- usa service_role y bypassa RLS). Las tablas NUEVAS requieren GRANT explícito
-- para que PostgREST/supabase-js puedan acceder.
ALTER TABLE public.facturas_so ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.facturas_so TO anon, authenticated, service_role;
