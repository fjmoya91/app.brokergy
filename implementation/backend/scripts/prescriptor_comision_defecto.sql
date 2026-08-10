-- Comisión por defecto del prescriptor  (aplicado en producción 2026-08-10)
--
-- Al elegir un partner en una propuesta, la simulación arranca ya con su
-- comisión aplicada —descontada del CLIENTE— y se arrastra al expediente.
-- Sigue pudiendo quitarse o cambiarse en cada simulación.
--
-- Se guarda TIPO + VALOR, no solo euros: un partner que pacta "el 10 % del
-- precio del CAE" cobraría de menos si guardásemos 16 €/MWh y luego cambiara
-- el precio del S.O. El tipo dice cómo se pactó; los €/MWh se recalculan en
-- cada simulación sobre el precio vigente de ESA simulación.
--
-- Solo ADMIN puede escribir estos campos: PATCH /api/prescriptores/:id deja a un
-- partner editar su propia ficha, y esto es dinero. El backend lo refuerza
-- (mismo criterio que el slug de la landing).

ALTER TABLE public.prescriptores
    ADD COLUMN IF NOT EXISTS comision_activa boolean       NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS comision_tipo   text          NOT NULL DEFAULT 'eur',
    ADD COLUMN IF NOT EXISTS comision_valor  numeric(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prescriptores_comision_tipo_chk'
    ) THEN
        ALTER TABLE public.prescriptores
            ADD CONSTRAINT prescriptores_comision_tipo_chk
            CHECK (comision_tipo IN ('eur', 'pct'));
    END IF;
END $$;

COMMENT ON COLUMN public.prescriptores.comision_activa IS 'Si al seleccionar este partner en una propuesta se aplica su comisión por defecto.';
COMMENT ON COLUMN public.prescriptores.comision_tipo   IS 'Cómo se pactó: eur = €/MWh fijos; pct = % sobre el precio CAE del Sujeto Obligado.';
COMMENT ON COLUMN public.prescriptores.comision_valor  IS 'Valor en la unidad de comision_tipo.';
