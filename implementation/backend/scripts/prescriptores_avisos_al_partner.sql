-- «Todos los avisos de sus clientes, al partner» (2026-10-15).
-- Con la marca puesta, TODOS los clientes del partner llevan `contacto_es_partner`
-- (los que ya tiene y los que se den de alta o se le asignen después). La aplica
-- el backend (services/avisosAlPartner.js); aquí solo se guarda la preferencia.
ALTER TABLE public.prescriptores
    ADD COLUMN IF NOT EXISTS avisos_al_partner BOOLEAN NOT NULL DEFAULT FALSE;
