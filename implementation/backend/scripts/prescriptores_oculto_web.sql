-- prescriptores.oculto_web — el instalador NO sale en la web pública (brokergy.es,
-- «Encuentra tu instalador»), aunque SÍ cuenta en «trabajamos con más de N instaladores».
-- Fran, 09/11/2026: «quiero poder indicar si aparece o no algún instalador… que se cuenten,
-- pero que no se muestren». Por defecto todos salen (false). Se marca desde la ficha del
-- instalador en la app (sección «Escaparate», solo ADMIN). Lo lee scripts/red.mjs de brokergy-web.
-- Es independiente de visible_marketplace (el escaparate antiguo instaladores.brokergy.es).
ALTER TABLE prescriptores ADD COLUMN IF NOT EXISTS oculto_web BOOLEAN NOT NULL DEFAULT false;
