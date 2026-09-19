-- ─────────────────────────────────────────────────────────────────────────────
-- APODERADOS ADICIONALES de una empresa (hoy, del SUJETO OBLIGADO).
--
-- Una empresa puede tener varios representantes legales con poder para firmar, y
-- cuál firma cada lote lo decide una persona: su nombre y su NIF van IMPRESOS en
-- la casilla "Representante del solicitante" de cada ficha RES y en la solicitud
-- de emisión de CAE. Medido en INTERNACIONAL DE ALCOHOLES, S.A.: firman PEDRO
-- JOSÉ LÓPEZ MONTERO (06239730Z) y JESÚS ANTONIO ALMODÓVAR FUENTES (06236833S).
--
-- REGLA — el representante PRINCIPAL no se duplica aquí: sigue en
-- `nombre_responsable`/`apellidos_responsable`/`nif_responsable` (o en
-- `representante_*` cuando es una persona distinta de la de contacto), que es de
-- donde lo lee el resto de la app. Esta columna guarda solo a LOS DEMÁS.
--
-- Forma de cada entrada: { nombre, apellidos, nif, cargo }.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE prescriptores
    ADD COLUMN IF NOT EXISTS representantes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN prescriptores.representantes IS
    'Apoderados ADICIONALES que pueden firmar por la empresa [{nombre,apellidos,nif,cargo}]. El principal vive en nombre_responsable/nif_responsable (o representante_*).';
