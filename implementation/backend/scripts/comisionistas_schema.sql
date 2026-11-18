-- ============================================================================
-- comisionistas — la PERSONA que trae una obra, aparte del partner del que cuelga
-- ----------------------------------------------------------------------------
-- La comisión del partner (`prescriptores.comision_*`) es de la EMPRESA. Hay
-- obras que no trae la empresa sino una persona concreta de ella (o de fuera):
-- caso de origen, Juanma, ingeniero de LOS SIETE HERMANOS DEL BONILLO, que pasa
-- obras él directamente, separadas de las que entran por Rufino (comercial de la
-- misma empresa). Fran quiere llevar la cuenta de las de Juanma: filtrarlas y
-- sumarlas (26RES060_OP308 / 26RES060_273, 16/11/2026).
--
-- Por qué una tabla y no:
--   · un partner propio para Juanma: la oportunidad cambiaría de partner, y del
--     partner cuelgan los avisos al instalador, la propuesta y la comisión de la
--     empresa (Fran lo descartó por eso);
--   · un contacto de `prescriptores.contactos_notificacion`: es un JSONB sin id
--     estable (se reescribe entero al guardar la ficha) y sirve para AVISAR, no
--     para atribuir;
--   · una nota: no se filtra ni se suma.
--
-- El comisionista NO cambia nada de lo que ya funciona: ni el partner, ni a
-- quién se avisa, ni el cálculo del bono. Es una marca de atribución.
--
-- Fecha: 2026-11-16
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.comisionistas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nombre   TEXT NOT NULL,
    tlf      TEXT,
    email    TEXT,
    cargo    TEXT,
    -- La empresa en la que trabaja, si es de un partner. Solo informativo: la
    -- oportunidad sigue colgando de SU prescriptor_id.
    prescriptor_id UUID REFERENCES public.prescriptores(id_empresa) ON DELETE SET NULL,

    -- Lo pactado con ÉL por defecto (solo ADMIN lo ve o lo cambia, reglas 6 y 102).
    --   eur → € por obra · pct → % sobre el bono ofrecido al cliente
    comision_tipo  TEXT          NOT NULL DEFAULT 'eur' CHECK (comision_tipo IN ('eur', 'pct')),
    comision_valor NUMERIC(10,2) NOT NULL DEFAULT 0,

    notas  TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.comisionistas IS 'Persona que trae una obra directamente, distinta del partner (empresa) del que cuelga la oportunidad. Marca de atribución: no cambia avisos ni cálculo.';
COMMENT ON COLUMN public.comisionistas.prescriptor_id IS 'Empresa en la que trabaja (informativo). La oportunidad sigue colgando de su propio prescriptor_id.';
COMMENT ON COLUMN public.comisionistas.comision_tipo  IS 'eur = € por obra; pct = % sobre el bono ofrecido al cliente. Solo ADMIN.';

-- Regla 150: RLS sin policies + GRANT a service_role en el mismo script.
ALTER TABLE public.comisionistas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comisionistas TO service_role;
-- Medido al crearla (16/11/2026): los DEFAULT PRIVILEGES del proyecto todavía
-- daban TODO a anon y authenticated. El RLS sin policies ya los para, pero la
-- regla 150 dice nunca a ellos: se retiran.
REVOKE ALL ON public.comisionistas FROM anon, authenticated;

-- La marca en la oportunidad. Escalares: el listado los lee sin tocar
-- `datos_calculo` (regla 22).
ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS comisionista_id      UUID REFERENCES public.comisionistas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS comisionista_importe NUMERIC(10,2);

COMMENT ON COLUMN public.oportunidades.comisionista_id      IS 'Persona que trajo esta obra (tabla comisionistas). Solo equipo interno.';
COMMENT ON COLUMN public.oportunidades.comisionista_importe IS 'Comisión pactada con el comisionista en ESTA obra, en € sin IVA. Solo ADMIN. Vacío = sin fijar.';

CREATE INDEX IF NOT EXISTS oportunidades_comisionista_id_idx
    ON public.oportunidades (comisionista_id) WHERE comisionista_id IS NOT NULL;

-- Comprobación (debe salir service_role con los cuatro privilegios):
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'comisionistas';
