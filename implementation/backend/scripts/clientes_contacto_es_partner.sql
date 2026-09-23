-- El PARTNER como persona de contacto del cliente (2026-09-23).
-- Con la marca puesta, persona_contacto_* es una COPIA del comercial de la ficha
-- del prescriptor, y la mantiene el backend (clientes.js / prescriptores.js).
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS contacto_es_partner BOOLEAN NOT NULL DEFAULT FALSE;
