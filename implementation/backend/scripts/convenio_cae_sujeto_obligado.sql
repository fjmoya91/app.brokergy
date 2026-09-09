-- ─────────────────────────────────────────────────────────────────────────────
-- El CONVENIO CAE con el Sujeto Obligado, en SU ficha.
--
-- Es la primera pieza del paquete de cada actuación ("E{n}-1 - CONVENIO CAE
-- BROKERGY-INTERALCO"): el mismo documento en las cinco actuaciones de un lote y
-- en todos los lotes de ese S.O. Se firma una vez y se cita siempre, así que vive
-- en la ficha del S.O. y no en cada lote — si viviera en el lote habría que
-- adjuntarlo cinco veces al mes y nada garantizaría que fuera el mismo papel.
--
-- Solo el ENLACE y el nombre: el PDF vive en Drive (regla 21 — nada de base64 en
-- la base de datos).
--
-- `prescriptores` ya existe, así que no hace falta GRANT ni política nueva:
-- hereda las de la tabla.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.prescriptores
    ADD COLUMN IF NOT EXISTS convenio_cae_link    TEXT,
    ADD COLUMN IF NOT EXISTS convenio_cae_nombre  TEXT,
    ADD COLUMN IF NOT EXISTS convenio_cae_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.prescriptores.convenio_cae_link IS
    'Enlace de Drive al Convenio CAE firmado con este Sujeto Obligado. Es la pieza E{n}-1 del paquete de cada actuación (services/envioGestorService.js).';
COMMENT ON COLUMN public.prescriptores.convenio_cae_nombre IS
    'Nombre del fichero del convenio, para poder reconocerlo en la ficha sin abrir Drive.';
COMMENT ON COLUMN public.prescriptores.convenio_cae_at IS
    'Cuándo se registró el convenio vigente. Sirve para saber si el que se está citando es el último que se firmó.';
